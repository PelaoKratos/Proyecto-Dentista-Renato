from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

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
        cursor = connection.execute(
            f"INSERT INTO {table} ({field_list}) VALUES ({placeholders})",
            values,
        )
        record_id = cursor.lastrowid
        if table == "appointments":
            sync_appointment_treatment(connection, data)
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
        if table == "appointments":
            existing = connection.execute("SELECT * FROM appointments WHERE id = ?", (record_id,)).fetchone()
            if existing:
                validate_appointment_link(connection, {**dict(existing), **data}, record_id)
        cursor = connection.execute(f"UPDATE {table} SET {assignments} WHERE id = ?", values)
        if cursor.rowcount == 0:
            return None
        if table == "appointments" and existing:
            updated = {**dict(existing), **data}
            if updated.get("status") != existing["status"] or updated.get("patient_treatment_id") != existing["patient_treatment_id"]:
                sync_appointment_treatment(connection, updated)
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
