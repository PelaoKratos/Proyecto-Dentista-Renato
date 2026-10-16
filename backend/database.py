from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timedelta
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
        connection.execute("BEGIN IMMEDIATE")
        if "dentition_type" not in {row["name"] for row in connection.execute("PRAGMA table_info(patients)")}:
            connection.execute("ALTER TABLE patients ADD COLUMN dentition_type TEXT NOT NULL DEFAULT 'adult'")
        treatment_columns = {row["name"] for row in connection.execute("PRAGMA table_info(patient_treatments)")}
        if "treatment_plan_id" not in treatment_columns:
            connection.execute("ALTER TABLE patient_treatments ADD COLUMN treatment_plan_id INTEGER REFERENCES patient_treatment_plans(id)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_patient_treatments_plan ON patient_treatments(treatment_plan_id)")
        if "dentition_type" not in {row["name"] for row in connection.execute("PRAGMA table_info(patient_treatments)")}:
            connection.execute("ALTER TABLE patient_treatments ADD COLUMN dentition_type TEXT NOT NULL DEFAULT 'adult'")
        connection.execute("CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY)")
        if "payment_batch_id" not in {row["name"] for row in connection.execute("PRAGMA table_info(payments)")}:
            connection.execute("ALTER TABLE payments ADD COLUMN payment_batch_id TEXT")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_payments_batch ON payments(payment_batch_id)")
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
        if not connection.execute("SELECT 1 FROM app_migrations WHERE name = 'tooth_numbering_v2'").fetchone():
            # Migrate the former FDI identifiers to sequential adult numbers.
            fdi_order = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28,
                         38,37,36,35,34,33,32,31,41,42,43,44,45,46,47,48]
            fdi_to_number = {str(code): str(index) for index, code in enumerate(fdi_order, 1)}
            for treatment in connection.execute("SELECT id, title, tooth_code FROM patient_treatments WHERE tooth_code IS NOT NULL").fetchall():
                old_codes = [code.strip() for code in str(treatment["tooth_code"]).split(",")]
                if all(code in fdi_to_number for code in old_codes):
                    new_codes = sorted((int(fdi_to_number[code]) for code in old_codes))
                    new_code = ",".join(map(str, new_codes))
                    connection.execute("UPDATE patient_treatments SET tooth_code = ? WHERE id = ?",
                                       (new_code, treatment["id"]))
                    old_reason = f"{treatment['title']} {chr(183)} Pieza {treatment['tooth_code']}"
                    new_reason = f"{treatment['title']} {chr(183)} Pieza {new_code}"
                    if "reason" in columns:
                        connection.execute("UPDATE appointments SET reason = ? WHERE patient_treatment_id = ? AND reason = ?",
                                           (new_reason, treatment["id"], old_reason))
            connection.execute("INSERT INTO app_migrations (name) VALUES ('tooth_numbering_v2')")
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
    if table == "patient_treatments":
        connection = get_connection()
        try:
            set_treatment_dentition(connection, data)
        finally:
            connection.close()
    fields = [field for field in data.keys() if field in allowed_fields]
    if table == "patient_treatments" and "dentition_type" not in fields:
        fields.append("dentition_type")
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
                    if "starts_at" in data or "ends_at" in data:
                        validate_appointment(merged, partial=True)
                    validate_appointment_link(connection, merged, record_id)
        if existing is not None or table not in {"appointments", "clinical_sessions", "payments", "attachments"}:
            validate_patient_relationships(connection, table, merged)
        if table == "patient_treatments" and ({"tooth_code", "dentition_type", "patient_id"} & set(fields)):
            treatment = connection.execute("SELECT * FROM patient_treatments WHERE id = ?", (record_id,)).fetchone()
            if treatment:
                candidate = {**dict(treatment), **data}
                validate_treatment_teeth(candidate)
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



def delete_patient_treatment(record_id: int) -> dict[str, Any] | None:
    """Remove an unpaid treatment while preserving past clinical records."""
    connection = get_connection()
    try:
        connection.execute("BEGIN IMMEDIATE")
        treatment = connection.execute(
            "SELECT id, patient_id, treatment_plan_id FROM patient_treatments WHERE id = ?",
            (record_id,),
        ).fetchone()
        if treatment is None:
            return None

        linked_payment = connection.execute(
            "SELECT 1 FROM payments WHERE patient_treatment_id = ? LIMIT 1", (record_id,)
        ).fetchone()
        if linked_payment:
            raise ValueError("Este tratamiento tiene abonos registrados. Corrige los pagos antes de eliminarlo.")

        scheduled = connection.execute(
            "SELECT 1 FROM appointments WHERE patient_treatment_id = ? AND status = 'scheduled' LIMIT 1",
            (record_id,),
        ).fetchone()
        if scheduled:
            raise ValueError("Cancela o atiende la cita pendiente antes de eliminar este tratamiento.")

        remaining_total = connection.execute(
            """SELECT COALESCE(SUM(COALESCE(final_price, estimated_price, 0)), 0)
               FROM patient_treatments WHERE patient_id = ? AND id != ?""",
            (treatment["patient_id"], record_id),
        ).fetchone()[0]
        paid_total = connection.execute(
            "SELECT COALESCE(SUM(amount), 0) FROM payments WHERE patient_id = ?",
            (treatment["patient_id"],),
        ).fetchone()[0]
        if paid_total > remaining_total:
            raise ValueError("No se puede eliminar: los abonos del paciente superarían el valor de los tratamientos restantes.")

        connection.execute(
            "UPDATE appointments SET patient_treatment_id = NULL WHERE patient_treatment_id = ?",
            (record_id,),
        )
        connection.execute(
            "UPDATE clinical_sessions SET patient_treatment_id = NULL WHERE patient_treatment_id = ?",
            (record_id,),
        )
        connection.execute(
            "UPDATE attachments SET patient_treatment_id = NULL WHERE patient_treatment_id = ?",
            (record_id,),
        )
        connection.execute("DELETE FROM patient_treatments WHERE id = ?", (record_id,))
        if treatment["treatment_plan_id"] is not None:
            connection.execute(
                """DELETE FROM patient_treatment_plans
                   WHERE id = ? AND NOT EXISTS (
                     SELECT 1 FROM patient_treatments WHERE treatment_plan_id = ?
                   )""",
                (treatment["treatment_plan_id"], treatment["treatment_plan_id"]),
            )
        connection.commit()
        return {"id": record_id, "patient_id": treatment["patient_id"]}
    finally:
        connection.close()


def create_payment_batch(payload: dict[str, Any]) -> dict[str, Any]:
    """Apply one received payment to several treatments, atomically."""
    from backend.validation import validate_payment
    patient_id = payload.get("patient_id")
    allocations = payload.get("allocations")
    if not isinstance(allocations, list) or not allocations:
        raise ValueError("Selecciona al menos un tratamiento para el pago.")
    if len(allocations) > 100:
        raise ValueError("Hay demasiados tratamientos en un solo pago.")
    common = validate_payment({
        "patient_id": patient_id,
        "payment_date": payload.get("payment_date"),
        "amount": 1,
        "method": payload.get("method"),
        "notes": payload.get("notes"),
    })
    normalized = []
    seen = set()
    for allocation in allocations:
        if not isinstance(allocation, dict):
            raise ValueError("Cada abono debe indicar tratamiento y monto.")
        treatment_id = allocation.get("patient_treatment_id")
        if not isinstance(treatment_id, int) or isinstance(treatment_id, bool) or treatment_id <= 0:
            raise ValueError("Cada abono necesita un tratamiento válido.")
        if treatment_id in seen:
            raise ValueError("No repitas un tratamiento en el mismo pago.")
        seen.add(treatment_id)
        amount = allocation.get("amount")
        validate_payment({"amount": amount}, partial=True)
        if isinstance(amount, bool) or float(amount) <= 0:
            raise ValueError("Cada abono debe ser mayor que cero.")
        normalized.append((treatment_id, float(amount)))
    connection = get_connection()
    try:
        connection.execute("BEGIN IMMEDIATE")
        if not connection.execute("SELECT 1 FROM patients WHERE id = ?", (common["patient_id"],)).fetchone():
            raise ValueError("El paciente no existe.")
        rows = connection.execute("""
            SELECT t.id, COALESCE(t.final_price, t.estimated_price, 0) AS total,
                   COALESCE(SUM(p.amount), 0) AS paid
            FROM patient_treatments t LEFT JOIN payments p ON p.patient_treatment_id = t.id
            WHERE t.patient_id = ? GROUP BY t.id
        """, (common["patient_id"],)).fetchall()
        due_by_treatment = {row["id"]: max(float(row["total"]) - float(row["paid"]), 0) for row in rows}
        for treatment_id, amount in normalized:
            if treatment_id not in due_by_treatment:
                raise ValueError("Todos los tratamientos deben pertenecer al paciente.")
            if amount > due_by_treatment[treatment_id] + 0.000001:
                raise ValueError(f"El abono supera el saldo pendiente del tratamiento {treatment_id}.")
        total = sum(amount for _, amount in normalized)
        patient_paid = connection.execute("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE patient_id = ?", (common["patient_id"],)).fetchone()[0]
        patient_total = sum(float(row["total"]) for row in rows)
        if total > max(patient_total - float(patient_paid), 0) + 0.000001:
            raise ValueError("El pago supera el saldo total pendiente del paciente.")
        batch_id = uuid.uuid4().hex
        created = []
        for treatment_id, amount in normalized:
            cursor = connection.execute("""
                INSERT INTO payments (patient_id, patient_treatment_id, payment_date, amount, method, notes, payment_batch_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (common["patient_id"], treatment_id, common["payment_date"], amount,
                  common.get("method"), common.get("notes"), batch_id))
            created.append(row_to_dict(connection.execute("SELECT * FROM payments WHERE id = ?", (cursor.lastrowid,)).fetchone()))
        connection.commit()
        return {"payment_batch_id": batch_id, "total": total, "payments": created}
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
    if table not in {"patient_treatments", "clinical_sessions", "payments", "attachments"}:
        return

    patient_id = data.get("patient_id")
    if table == "patient_treatments" and data.get("treatment_plan_id") is not None:
        plan = connection.execute(
            "SELECT patient_id FROM patient_treatment_plans WHERE id = ?", (data["treatment_plan_id"],)
        ).fetchone()
        if not plan or str(plan["patient_id"]) != str(patient_id):
            raise ValueError("El plan vinculado debe pertenecer al mismo paciente.")
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


def validate_treatment_teeth(data):
    from backend.validation import parse_tooth_codes
    codes = parse_tooth_codes(data.get("tooth_code"), data.get("dentition_type") or "adult")
    return codes


def set_treatment_dentition(connection, data):
    patient = connection.execute("SELECT dentition_type FROM patients WHERE id = ?", (data.get("patient_id"),)).fetchone()
    if not patient:
        raise ValueError("El paciente del tratamiento no existe.")
    data["dentition_type"] = patient["dentition_type"]
    validate_treatment_teeth(data)


def validate_appointment_link(connection, data, appointment_id=None):
    from backend.validation import parse_tooth_codes
    treatment_id = data.get("patient_treatment_id")
    if treatment_id is not None:
        treatment = connection.execute("SELECT * FROM patient_treatments WHERE id = ?", (treatment_id,)).fetchone()
        if not treatment or str(treatment["patient_id"]) != str(data.get("patient_id")):
            raise ValueError("El tratamiento debe pertenecer al paciente de la cita.")
        if data.get("status", "scheduled") == "scheduled":
            teeth = set(parse_tooth_codes(treatment["tooth_code"], treatment["dentition_type"]))
            if teeth:
                rows = connection.execute("""
                    SELECT a.id, t.tooth_code FROM appointments a
                    JOIN patient_treatments t ON t.id = a.patient_treatment_id
                    WHERE a.patient_id = ? AND t.dentition_type = ? AND a.status = 'scheduled' AND a.id != ? AND t.id != ?
                """, (data["patient_id"], treatment["dentition_type"], appointment_id or -1, treatment_id)).fetchall()
                for row in rows:
                    overlap = teeth.intersection(parse_tooth_codes(row["tooth_code"], treatment["dentition_type"]))
                    if overlap:
                        raise ValueError(f"Ya existe una cita pendiente para la pieza {sorted(overlap)[0]}. Atiende, cancela o modifica esa cita antes de agendar otra.")
    if data.get("status", "scheduled") != "scheduled" or not data.get("starts_at"):
        return
    start = datetime.fromisoformat(str(data["starts_at"]).replace("T", " "))
    end = (datetime.fromisoformat(str(data["ends_at"]).replace("T", " "))
           if data.get("ends_at") else start + timedelta(minutes=30))
    for booked in connection.execute("""
        SELECT id, patient_id, starts_at, ends_at FROM appointments
        WHERE status = 'scheduled' AND id != ?
    """, (appointment_id or -1,)).fetchall():
        booked_start = datetime.fromisoformat(str(booked["starts_at"]).replace("T", " "))
        booked_end = (datetime.fromisoformat(str(booked["ends_at"]).replace("T", " "))
                      if booked["ends_at"] else booked_start + timedelta(minutes=30))
        if start < booked_end and booked_start < end:
            if (start.hour == 16 and start.minute == 0 and booked_start == start
                    and str(booked["patient_id"]) != str(data.get("patient_id"))):
                continue
            raise ValueError("La hora seleccionada ya está ocupada por otra cita. Elige otro horario.")


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


def create_patient_treatment_plan(data, treatment_fields):
    """Create a named treatment plan and all of its procedure/tooth items atomically."""
    from backend.validation import validate_patient_treatment

    patient_id = data.get("patient_id")
    title = str(data.get("title") or "").strip()
    items = data.get("items")
    if not title or len(title) > 160:
        raise ValueError("El plan debe tener un nombre de hasta 160 caracteres.")
    plan_notes = str(data.get("plan_notes") or "").strip()
    if len(plan_notes) > 3000:
        raise ValueError("Las notas del plan no pueden superar 3000 caracteres.")
    if not isinstance(items, list) or not items:
        raise ValueError("Agrega al menos un tratamiento al plan.")
    if len(items) > 20:
        raise ValueError("Un plan puede incluir hasta 20 tratamientos.")

    connection = get_connection()
    try:
        with connection:
            connection.execute("BEGIN IMMEDIATE")
            patient = connection.execute(
                "SELECT id FROM patients WHERE id = ? AND is_active = 1", (patient_id,)
            ).fetchone()
            if patient is None:
                raise ValueError("El paciente del plan no existe o está inactivo.")
            plan_cursor = connection.execute(
                "INSERT INTO patient_treatment_plans (patient_id, title, plan_notes) VALUES (?, ?, ?)",
                (patient_id, title, plan_notes or None),
            )
            plan_id = plan_cursor.lastrowid
            created = []
            for raw_item in items:
                if not isinstance(raw_item, dict):
                    raise ValueError("Cada tratamiento del plan debe ser un objeto.")
                treatment = validate_patient_treatment({
                    **raw_item,
                    "patient_id": patient_id,
                    "status": "planned",
                    "start_date": raw_item.get("start_date") or data.get("start_date"),
                })
                set_treatment_dentition(connection, treatment)
                treatment["treatment_plan_id"] = plan_id
                fields = [field for field in treatment if field in treatment_fields]
                if "dentition_type" not in fields:
                    fields.append("dentition_type")
                cursor = connection.execute(
                    f"INSERT INTO patient_treatments ({', '.join(fields)}) VALUES ({', '.join('?' for _ in fields)})",
                    tuple(treatment[field] for field in fields),
                )
                created.append(row_to_dict(connection.execute(
                    "SELECT * FROM patient_treatments WHERE id = ?", (cursor.lastrowid,)
                ).fetchone()))
            plan = row_to_dict(connection.execute(
                "SELECT * FROM patient_treatment_plans WHERE id = ?", (plan_id,)
            ).fetchone())
            return {**plan, "items": created}
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
            set_treatment_dentition(connection, treatment)
            fields = [key for key in treatment if key in treatment_fields]
            if "dentition_type" not in fields:
                fields.append("dentition_type")
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


def create_treatment_appointments(data, appointment_fields, treatment_fields):
    """Book several dates for one treatment atomically, creating that treatment once if needed."""
    from backend.validation import validate_patient_treatment

    starts_at = data.get("starts_at")
    if not isinstance(starts_at, list) or not 2 <= len(starts_at) <= 12:
        raise ValueError("Selecciona entre 2 y 12 citas para agendar juntas.")
    if len(set(starts_at)) != len(starts_at):
        raise ValueError("No repitas la misma fecha y hora en el grupo de citas.")
    base = {key: value for key, value in data.items() if key != "starts_at"}
    appointment_data = [validate_appointment({**base, "starts_at": value}) for value in starts_at]
    new_treatment = base.get("new_treatment")
    if new_treatment and base.get("patient_treatment_id"):
        raise ValueError("Selecciona un tratamiento existente o uno nuevo.")
    connection = get_connection()
    try:
        with connection:
            connection.execute("BEGIN IMMEDIATE")
            if new_treatment:
                treatment = validate_patient_treatment({**new_treatment, "patient_id": base["patient_id"]})
                set_treatment_dentition(connection, treatment)
                fields = [key for key in treatment if key in treatment_fields]
                if "dentition_type" not in fields:
                    fields.append("dentition_type")
                cursor = connection.execute(
                    f"INSERT INTO patient_treatments ({', '.join(fields)}) VALUES ({', '.join('?' for _ in fields)})",
                    tuple(treatment[key] for key in fields),
                )
                treatment_id = cursor.lastrowid
            else:
                treatment_id = base.get("patient_treatment_id")
            created = []
            for appointment in appointment_data:
                appointment["patient_treatment_id"] = treatment_id
                validate_appointment_link(connection, appointment)
                validate_patient_relationships(connection, "appointments", appointment)
                fields = [key for key in appointment if key in appointment_fields]
                cursor = connection.execute(
                    f"INSERT INTO appointments ({', '.join(fields)}) VALUES ({', '.join('?' for _ in fields)})",
                    tuple(appointment[key] for key in fields),
                )
                sync_appointment_treatment(connection, appointment)
                created.append(row_to_dict(connection.execute(
                    "SELECT * FROM appointments WHERE id = ?", (cursor.lastrowid,)
                ).fetchone()))
            return created
    finally:
        connection.close()
