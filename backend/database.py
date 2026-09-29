from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from backend.validation import validate_appointment, validate_session

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
DB_PATH = DATA_DIR / "consulta_dental.sqlite3"
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def get_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = get_connection()
    try:
        connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(appointments)")}
        if "patient_treatment_id" not in columns:
            connection.execute("ALTER TABLE appointments ADD COLUMN patient_treatment_id INTEGER REFERENCES patient_treatments(id)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_appointments_treatment ON appointments(patient_treatment_id)")
        # Repair linked cancellations saved before appointment/treatment synchronization.
        connection.execute("CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY)")
        if {"status", "reason"}.issubset(columns) and not connection.execute("SELECT 1 FROM app_migrations WHERE name = 'legacy_appointment_links_v1'").fetchone():
            for appointment in connection.execute("SELECT * FROM appointments WHERE patient_treatment_id IS NULL").fetchall():
                candidates = connection.execute("SELECT * FROM patient_treatments WHERE patient_id = ? AND start_date = ?", (appointment["patient_id"], str(appointment["starts_at"])[:10])).fetchall()
                matches = [t for t in candidates if t["tooth_code"] and appointment["reason"] == f"{t['title']} {chr(183)} Pieza {t['tooth_code']}"]
                if len(matches) == 1:
                    connection.execute("UPDATE appointments SET patient_treatment_id = ? WHERE id = ?", (matches[0]["id"], appointment["id"]))
            connection.execute("INSERT INTO app_migrations (name) VALUES ('legacy_appointment_links_v1')")
        if "status" in columns and not connection.execute("SELECT 1 FROM app_migrations WHERE name = 'appointment_cancellations_v1'").fetchone():
            connection.execute("""
                UPDATE patient_treatments SET status = 'cancelled'
                WHERE status IN ('planned', 'in_progress')
                  AND (SELECT a.status FROM appointments a
                       WHERE a.patient_treatment_id = patient_treatments.id
                       ORDER BY a.id DESC LIMIT 1) = 'cancelled'
                  AND NOT EXISTS (SELECT 1 FROM appointments a
                      WHERE a.patient_treatment_id = patient_treatments.id AND a.status = 'scheduled')
            """)
            connection.execute("INSERT INTO app_migrations (name) VALUES ('appointment_cancellations_v1')")
        connection.commit()
    finally:
        connection.close()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


def rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    return [row_to_dict(row) for row in rows if row is not None]


def fetch_all(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    connection = get_connection()
    try:
        rows = connection.execute(sql, params).fetchall()
        return rows_to_dicts(rows)
    finally:
        connection.close()


def fetch_one(sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    connection = get_connection()
    try:
        row = connection.execute(sql, params).fetchone()
        return row_to_dict(row)
    finally:
        connection.close()


def insert_record(table: str, data: dict[str, Any], allowed_fields: set[str]) -> dict[str, Any]:
    fields = [field for field in data.keys() if field in allowed_fields]
    if not fields:
        raise ValueError("No hay campos validos para guardar.")

    placeholders = ", ".join(["?"] * len(fields))
    field_list = ", ".join(fields)
    values = tuple(data[field] for field in fields)

    connection = get_connection()
    try:
        connection.execute("BEGIN IMMEDIATE")
        if table == "appointments":
            validate_appointment_link(connection, data)
        validate_patient_relationships(connection, table, data)
        cursor = connection.execute(
            f"INSERT INTO {table} ({field_list}) VALUES ({placeholders})",
            values,
        )
        record_id = cursor.lastrowid
        if table == "appointments":
            sync_appointment_treatment(connection, data)
        elif table == "clinical_sessions":
            start_session_treatment(connection, data)
        connection.commit()
        row = connection.execute(f"SELECT * FROM {table} WHERE id = ?", (record_id,)).fetchone()
        return row_to_dict(row) or {}
    finally:
        connection.close()


def update_record(table: str, record_id: int, data: dict[str, Any], allowed_fields: set[str]) -> dict[str, Any] | None:
    fields = [field for field in data.keys() if field in allowed_fields]
    if not fields:
        raise ValueError("No hay campos validos para actualizar.")

    assignments = ", ".join([f"{field} = ?" for field in fields])
    values = tuple(data[field] for field in fields) + (record_id,)

    connection = get_connection()
    try:
        connection.execute("BEGIN IMMEDIATE")
        existing = None
        merged = data
        if table in {"appointments", "clinical_sessions", "payments", "attachments"}:
            existing = connection.execute(f"SELECT * FROM {table} WHERE id = ?", (record_id,)).fetchone()
            if existing:
                merged = {**dict(existing), **data}
                if table == "appointments":
                    validate_appointment(merged, partial=True)
                    validate_appointment_link(connection, merged, record_id)
        if existing is not None or table not in {"appointments", "clinical_sessions", "payments", "attachments"}:
            validate_patient_relationships(connection, table, merged)
        if table == "patient_treatments" and "patient_id" in fields:
            patient_id = merged.get("patient_id")
            dependent_records = connection.execute(
                """
                SELECT 1 FROM clinical_sessions WHERE patient_treatment_id = ? AND patient_id != ?
                UNION ALL
                SELECT 1 FROM payments WHERE patient_treatment_id = ? AND patient_id != ?
                UNION ALL
                SELECT 1 FROM attachments WHERE patient_treatment_id = ? AND patient_id != ?
                LIMIT 1
                """,
                (record_id, patient_id, record_id, patient_id, record_id, patient_id),
            ).fetchone()
            if dependent_records:
                raise ValueError("No se puede cambiar el paciente: el tratamiento ya tiene evoluciones, pagos o adjuntos vinculados.")
        cursor = connection.execute(f"UPDATE {table} SET {assignments} WHERE id = ?", values)
        if cursor.rowcount == 0:
            return None
        if table == "appointments" and existing:
            if merged.get("status") != existing["status"] or merged.get("patient_treatment_id") != existing["patient_treatment_id"]:
                sync_appointment_treatment(connection, merged)
        if table == "clinical_sessions":
            start_session_treatment(connection, merged)
        if table == "patient_treatments" and ({"patient_id", "tooth_code"} & set(fields)):
            for appointment in connection.execute("SELECT * FROM appointments WHERE patient_treatment_id = ?", (record_id,)).fetchall():
                validate_appointment_link(connection, dict(appointment), appointment["id"])
        connection.commit()
        row = connection.execute(f"SELECT * FROM {table} WHERE id = ?", (record_id,)).fetchone()
        return row_to_dict(row)
    finally:
        connection.close()


def execute(sql: str, params: tuple[Any, ...] = ()) -> int:
    connection = get_connection()
    try:
        cursor = connection.execute(sql, params)
        connection.commit()
        return cursor.rowcount
    finally:
        connection.close()


def seed_demo_data() -> None:
    init_db()
    connection = get_connection()
    try:
        patient_count = connection.execute("SELECT COUNT(*) FROM patients").fetchone()[0]
        if patient_count:
            return

        patients = [
            (
                "18.456.992-4",
                "Camila",
                "Torres",
                "1994-03-22",
                "+56 9 6123 4420",
                "camila.torres@example.com",
                "Las Condes, Santiago",
                "Alergia a penicilina",
                "Alergia a penicilina",
            ),
            (
                "12.908.442-1",
                "Mario",
                "Araya",
                "1978-04-12",
                "+56 9 7441 0091",
                "mario.araya@example.com",
                "Av. Providencia 1240, Santiago",
                "Hipertension controlada",
                "Confirmar medicacion antes de cirugia",
            ),
            (
                "20.112.884-7",
                "Valentina",
                "Soto",
                "2001-11-07",
                "+56 9 3810 5540",
                "valentina.soto@example.com",
                "Nunoa, Santiago",
                "Ansiedad dental",
                "Controlar ansiedad dental",
            ),
            (
                "15.678.221-9",
                "Pedro",
                "Riquelme",
                "1987-09-02",
                "+56 9 9002 1103",
                "pedro.riquelme@example.com",
                "Macul, Santiago",
                "",
                "",
            ),
        ]

        connection.executemany(
            """
            INSERT INTO patients (
              rut, first_name, last_name, birth_date, phone, email, address,
              medical_notes, active_alert
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            patients,
        )

        catalog = [
            ("Evaluacion dental", "Primera revision y diagnostico general", 25000),
            ("Limpieza periodontal", "Profilaxis y control periodontal", 65000),
            ("Endodoncia", "Tratamiento endodontico por pieza", 280000),
            ("Implante", "Implante dental con evaluacion quirurgica", 920000),
            ("Ortodoncia", "Plan de ortodoncia con controles mensuales", 1200000),
        ]
        connection.executemany(
            "INSERT INTO treatment_catalog (name, description, default_price) VALUES (?, ?, ?)",
            catalog,
        )

        connection.executemany(
            """
            INSERT INTO patient_treatments (
              patient_id, catalog_treatment_id, title, tooth_code, diagnosis,
              plan_notes, status, estimated_price, final_price, start_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (1, 5, "Ortodoncia", None, "Maloclusion leve", "Control mensual de ajuste", "in_progress", 1200000, None, "2026-06-05"),
                (2, 4, "Implante molar inferior", "36", "Ausencia pieza 36", "Evaluar altura osea con radiografia", "planned", 920000, None, "2026-08-15"),
                (4, 3, "Endodoncia pieza 36", "36", "Dolor pulpar", "Completar segunda sesion", "in_progress", 280000, 280000, "2026-08-18"),
            ],
        )

        connection.executemany(
            """
            INSERT INTO clinical_sessions (
              patient_id, patient_treatment_id, session_date, reason,
              diagnosis, procedure_done, notes, next_steps
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (2, 2, "2026-09-03 10:15", "Evaluacion implante", "Ausencia pieza 36", "Revision de radiografia", "Confirmar antecedentes cardiovasculares.", "Definir plan quirurgico"),
                (2, 2, "2026-08-29 16:20", "Ingreso radiografia", "Pendiente evaluacion", "Se adjunta radiografia panoramica", "Zona posterior inferior izquierda a evaluar.", "Revisar volumen oseo"),
                (1, 1, "2026-09-03 09:30", "Control ortodoncia", "Control mensual", "Cambio de arco", "Buena evolucion.", "Proximo control en 4 semanas"),
            ],
        )

        connection.executemany(
            """
            INSERT INTO appointments (patient_id, starts_at, ends_at, reason, status, notes)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                (1, "2026-09-03 09:30", "2026-09-03 10:00", "Control ortodoncia", "attended", "Paciente en box"),
                (2, "2026-09-03 10:15", "2026-09-03 10:55", "Evaluacion implante", "scheduled", "Confirmada"),
                (3, "2026-09-03 11:00", "2026-09-03 11:30", "Radiografia y diagnostico", "scheduled", "Pendiente confirmar"),
                (4, "2026-09-03 12:30", "2026-09-03 13:30", "Endodoncia pieza 36", "scheduled", "Confirmada"),
            ],
        )

        connection.executemany(
            """
            INSERT INTO payments (patient_id, patient_treatment_id, payment_date, amount, method, notes)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                (2, 2, "2026-08-29", 300000, "Transferencia", "Abono implante"),
                (2, 2, "2026-08-15", 270000, "Tarjeta", "Evaluacion inicial"),
                (1, 1, "2026-09-02", 85000, "Tarjeta", "Control ortodoncia"),
                (4, 3, "2026-08-25", 140000, "Efectivo", "Abono endodoncia"),
            ],
        )

        connection.execute(
            """
            INSERT INTO attachments (
              patient_id, patient_treatment_id, file_type, category, original_filename,
              stored_path, mime_type, notes, taken_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                2,
                2,
                "radiography",
                "Panoramica",
                "rx-muestra.png",
                "assets/img/rx-muestra.png",
                "image/png",
                "Radiografia de muestra para prototipo.",
                "2026-08-29",
            ),
        )

        connection.commit()
    finally:
        connection.close()



def validate_patient_relationships(connection, table, data):
    """Ensure child records only reference treatments/sessions of their patient."""
    if table not in {"clinical_sessions", "payments", "attachments"}:
        return

    patient_id = data.get("patient_id")
    treatment_id = data.get("patient_treatment_id")
    if treatment_id is not None:
        treatment = connection.execute(
            "SELECT patient_id FROM patient_treatments WHERE id = ?", (treatment_id,)
        ).fetchone()
        if not treatment or str(treatment["patient_id"]) != str(patient_id):
            raise ValueError("El tratamiento vinculado debe pertenecer al mismo paciente.")

    if table == "attachments" and data.get("clinical_session_id") is not None:
        session = connection.execute(
            "SELECT patient_id, patient_treatment_id FROM clinical_sessions WHERE id = ?",
            (data["clinical_session_id"],),
        ).fetchone()
        if not session or str(session["patient_id"]) != str(patient_id):
            raise ValueError("La evolucion vinculada debe pertenecer al mismo paciente.")
        if treatment_id is not None and session["patient_treatment_id"] is not None and str(session["patient_treatment_id"]) != str(treatment_id):
            raise ValueError("La evolucion y el tratamiento del adjunto deben coincidir.")


def validate_appointment_link(connection, data, appointment_id=None):
    treatment_id = data.get("patient_treatment_id")
    if treatment_id is None:
        return
    treatment = connection.execute("SELECT * FROM patient_treatments WHERE id = ?", (treatment_id,)).fetchone()
    if not treatment or str(treatment["patient_id"]) != str(data.get("patient_id")):
        raise ValueError("El tratamiento debe pertenecer al paciente de la cita.")
    if data.get("status", "scheduled") == "scheduled" and treatment["tooth_code"]:
        duplicate = connection.execute("""
            SELECT a.id FROM appointments a
            JOIN patient_treatments t ON t.id = a.patient_treatment_id
            WHERE a.patient_id = ? AND TRIM(t.tooth_code) = TRIM(?)
              AND a.status = 'scheduled' AND a.id != ? LIMIT 1
        """, (data["patient_id"], treatment["tooth_code"], appointment_id or -1)).fetchone()
        if duplicate:
            raise ValueError(f"Ya existe una cita pendiente para la pieza {treatment['tooth_code']}. Atiende, cancela o modifica esa cita antes de agendar otra.")


def sync_appointment_treatment(connection, data):
    treatment_id = data.get("patient_treatment_id")
    if not treatment_id:
        return
    status = data.get("status", "scheduled")
    if status == "cancelled":
        if connection.execute("SELECT 1 FROM appointments WHERE patient_treatment_id = ? AND status = 'scheduled'", (treatment_id,)).fetchone():
            return
        connection.execute("UPDATE patient_treatments SET status = 'cancelled' WHERE id = ? AND status != 'completed'", (treatment_id,))
    elif status in ("scheduled", "attended"):
        attended = status == "attended" or connection.execute("SELECT 1 FROM appointments WHERE patient_treatment_id = ? AND status = 'attended'", (treatment_id,)).fetchone()
        connection.execute("UPDATE patient_treatments SET status = ? WHERE id = ? AND status IN ('planned', 'cancelled')", ("in_progress" if attended else "planned", treatment_id))


def start_session_treatment(connection, data):
    treatment_id = data.get("patient_treatment_id")
    if treatment_id:
        connection.execute(
            "UPDATE patient_treatments SET status = ? WHERE id = ? AND status = ?",
            ("in_progress", treatment_id, "planned"),
        )


def attend_appointment_with_session(appointment_id: int, session_data: dict[str, Any], session_fields: set[str]) -> dict[str, Any] | None:
    """Save the clinical session and close its appointment in one transaction."""
    connection = get_connection()
    try:
        with connection:
            connection.execute("BEGIN IMMEDIATE")
            appointment = connection.execute("SELECT * FROM appointments WHERE id = ?", (appointment_id,)).fetchone()
            if appointment is None:
                return None
            if appointment["status"] != "scheduled":
                raise ValueError("Solo se puede registrar la atencion de una cita pendiente.")
            if "patient_id" in session_data and str(session_data["patient_id"]) != str(appointment["patient_id"]):
                raise ValueError("La evolucion debe pertenecer al paciente de la cita.")
            linked_treatment = appointment["patient_treatment_id"]
            if linked_treatment is not None and session_data.get("patient_treatment_id") not in (None, linked_treatment, str(linked_treatment)):
                raise ValueError("La evolucion debe corresponder al tratamiento de la cita.")
            payload = validate_session({
                **session_data,
                "patient_id": appointment["patient_id"],
                **({"patient_treatment_id": linked_treatment} if linked_treatment is not None else {}),
            })
            validate_patient_relationships(connection, "clinical_sessions", payload)
            fields = [field for field in payload if field in session_fields]
            cursor = connection.execute(
                f"INSERT INTO clinical_sessions ({', '.join(fields)}) VALUES ({', '.join('?' for _ in fields)})",
                tuple(payload[field] for field in fields),
            )
            connection.execute("UPDATE appointments SET status = 'attended' WHERE id = ?", (appointment_id,))
            sync_appointment_treatment(connection, {"patient_treatment_id": linked_treatment, "status": "attended"})
            start_session_treatment(connection, payload)
            return {
                "session": row_to_dict(connection.execute("SELECT * FROM clinical_sessions WHERE id = ?", (cursor.lastrowid,)).fetchone()),
                "appointment": row_to_dict(connection.execute("SELECT * FROM appointments WHERE id = ?", (appointment_id,)).fetchone()),
            }
    finally:
        connection.close()


def create_treatment_appointment(data, appointment_fields, treatment_fields):
    """Create a treatment and its first appointment in one transaction."""
    from backend.validation import validate_patient_treatment
    new_treatment = data.pop("new_treatment", None)
    if new_treatment is None:
        return insert_record("appointments", data, appointment_fields)
    if data.get("patient_treatment_id"):
        raise ValueError("Selecciona un tratamiento existente o uno nuevo.")
    treatment = validate_patient_treatment({**new_treatment, "patient_id": data["patient_id"]})
    connection = get_connection()
    try:
        with connection:
            connection.execute("BEGIN IMMEDIATE")
            fields = [key for key in treatment if key in treatment_fields]
            cursor = connection.execute(
                f"INSERT INTO patient_treatments ({', '.join(fields)}) VALUES ({', '.join('?' for _ in fields)})",
                tuple(treatment[key] for key in fields),
            )
            data["patient_treatment_id"] = cursor.lastrowid
            validate_appointment_link(connection, data)
            fields = [key for key in data if key in appointment_fields]
            cursor = connection.execute(
                f"INSERT INTO appointments ({', '.join(fields)}) VALUES ({', '.join('?' for _ in fields)})",
                tuple(data[key] for key in fields),
            )
            sync_appointment_treatment(connection, data)
            return dict(connection.execute("SELECT * FROM appointments WHERE id = ?", (cursor.lastrowid,)).fetchone())
    finally:
        connection.close()
