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
        cursor = connection.execute(
            f"INSERT INTO {table} ({field_list}) VALUES ({placeholders})",
            values,
        )
        record_id = cursor.lastrowid
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
        cursor = connection.execute(f"UPDATE {table} SET {assignments} WHERE id = ?", values)
        if cursor.rowcount == 0:
            return None
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
