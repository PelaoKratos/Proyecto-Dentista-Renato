from __future__ import annotations

import random
import shutil
import sqlite3
import sys
from datetime import date, datetime, time, timedelta
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.database import DB_PATH, init_db  # noqa: E402

MEDIA_DIR = ROOT_DIR / "media"
SOURCE_RX = ROOT_DIR / "assets" / "img" / "rx-muestra.png"
SEED = 20260906

PATIENTS = [
    ("DEMO-001", "Andrea", "Morales", "1989-02-14", "+56 9 4210 8812", "andrea.morales@example.cl", "Providencia, Santiago", "Sin antecedentes relevantes", ""),
    ("DEMO-002", "Joaquin", "Herrera", "1974-10-03", "+56 9 6501 2290", "joaquin.herrera@example.cl", "La Florida, Santiago", "Diabetes tipo 2 controlada", "Controlar glicemia antes de cirugia"),
    ("DEMO-003", "Isidora", "Vargas", "1998-05-19", "+56 9 7782 1104", "isidora.vargas@example.cl", "Nunoa, Santiago", "Ansiedad dental", "Atencion pausada y explicar pasos"),
    ("DEMO-004", "Sebastian", "Molina", "1982-08-27", "+56 9 9310 4408", "sebastian.molina@example.cl", "Macul, Santiago", "Bruxismo nocturno", "Evaluar plano de relajacion"),
    ("DEMO-005", "Francisca", "Pizarro", "1991-12-02", "+56 9 3409 7120", "francisca.pizarro@example.cl", "Santiago Centro", "Alergia a ibuprofeno", "No indicar ibuprofeno"),
    ("DEMO-006", "Matias", "Silva", "2003-04-08", "+56 9 6129 0031", "matias.silva@example.cl", "Maipu, Santiago", "Sin antecedentes", ""),
    ("DEMO-007", "Catalina", "Fuentes", "1968-06-30", "+56 9 8092 3401", "catalina.fuentes@example.cl", "San Miguel, Santiago", "Hipertension controlada", "Tomar presion al ingreso"),
    ("DEMO-008", "Benjamin", "Contreras", "2010-09-11", "+56 9 7123 8840", "benjamin.contreras@example.cl", "Penalolen, Santiago", "Paciente menor de edad", "Asiste con apoderado"),
    ("DEMO-009", "Daniela", "Rojas", "1986-01-25", "+56 9 5012 7731", "daniela.rojas@example.cl", "Las Condes, Santiago", "Embarazo 24 semanas", "Evitar radiografias salvo indicacion"),
    ("DEMO-010", "Ignacio", "Leiva", "1979-11-17", "+56 9 8821 6402", "ignacio.leiva@example.cl", "Vitacura, Santiago", "Fumador", "Refuerzo higiene periodontal"),
    ("DEMO-011", "Paulina", "Sepulveda", "1995-07-04", "+56 9 2220 9102", "paulina.sepulveda@example.cl", "Independencia, Santiago", "Alergia a latex", "Usar material sin latex"),
    ("DEMO-012", "Cristobal", "Navarro", "1984-03-29", "+56 9 6003 1199", "cristobal.navarro@example.cl", "Recoleta, Santiago", "Sin antecedentes", ""),
    ("DEMO-013", "Valeria", "Munoz", "1971-12-22", "+56 9 9801 3315", "valeria.munoz@example.cl", "Quilicura, Santiago", "Tratamiento anticoagulante", "Solicitar pase medico"),
    ("DEMO-014", "Felipe", "Tapia", "1990-02-09", "+56 9 7455 8021", "felipe.tapia@example.cl", "La Reina, Santiago", "Asma leve", "Confirmar inhalador"),
    ("DEMO-015", "Camilo", "Caceres", "2000-10-15", "+56 9 3011 7744", "camilo.caceres@example.cl", "Puente Alto, Santiago", "Sin antecedentes", ""),
    ("DEMO-016", "Rocio", "Alvarez", "1988-06-18", "+56 9 6147 2190", "rocio.alvarez@example.cl", "San Joaquin, Santiago", "Migrañas frecuentes", "Controlar tolerancia a anestesia"),
    ("DEMO-017", "Tomas", "Figueroa", "1976-05-12", "+56 9 4320 1576", "tomas.figueroa@example.cl", "Huechuraba, Santiago", "Apnea del sueño", "Citas breves recomendadas"),
    ("DEMO-018", "Antonia", "Lagos", "1999-09-23", "+56 9 8255 4410", "antonia.lagos@example.cl", "Estacion Central, Santiago", "Ortodoncia previa", "Revisar retenedores"),
    ("DEMO-019", "Nicolas", "Vega", "1965-01-07", "+56 9 7180 3304", "nicolas.vega@example.cl", "Cerrillos, Santiago", "Hipertension", "Tomar presion al ingreso"),
    ("DEMO-020", "Javiera", "Espinoza", "1993-04-21", "+56 9 6712 9002", "javiera.espinoza@example.cl", "Lo Barnechea, Santiago", "Sin antecedentes", ""),
    ("DEMO-021", "Gabriel", "Campos", "1981-07-16", "+56 9 5311 2609", "gabriel.campos@example.cl", "Renca, Santiago", "Alergia a penicilina", "No indicar penicilina"),
    ("DEMO-022", "Mariana", "Reyes", "1973-03-06", "+56 9 2900 6615", "mariana.reyes@example.cl", "Conchali, Santiago", "Reflujo gastrico", "Cuidado con posicion prolongada"),
    ("DEMO-023", "Lucas", "Saavedra", "2007-11-28", "+56 9 6022 5088", "lucas.saavedra@example.cl", "La Cisterna, Santiago", "Paciente menor de edad", "Asiste con apoderado"),
    ("DEMO-024", "Fernanda", "Bravo", "1985-08-05", "+56 9 9171 3007", "fernanda.bravo@example.cl", "Pudahuel, Santiago", "Sin antecedentes", ""),
]

CATALOG = [
    ("Resina compuesta", "Restauracion estetica por pieza", 85000),
    ("Corona ceramica", "Rehabilitacion con corona unitaria", 420000),
    ("Extraccion simple", "Exodoncia simple con control posterior", 95000),
    ("Plano de relajacion", "Tratamiento para bruxismo", 180000),
    ("Blanqueamiento", "Blanqueamiento dental supervisado", 210000),
    ("Tratamiento periodontal", "Raspado y pulido radicular", 160000),
    ("Protesis removible", "Rehabilitacion protesica parcial", 650000),
    ("Carilla estetica", "Carilla ceramica o resina indirecta", 380000),
]

TREATMENT_TEMPLATES = [
    ("Evaluacion integral", None, "Control preventivo", "Evaluacion clinica, odontograma y plan preventivo", "completed", 25000),
    ("Limpieza periodontal", None, "Gingivitis y acumulacion de calculo", "Profilaxis, higiene oral y control periodontal", "in_progress", 65000),
    ("Resina pieza {tooth}", "{tooth}", "Caries o restauracion filtrada", "Retiro de caries y restauracion con resina compuesta", "completed", 85000),
    ("Endodoncia pieza {tooth}", "{tooth}", "Dolor pulpar irreversible", "Tratamiento endodontico y control radiografico", "in_progress", 280000),
    ("Corona ceramica pieza {tooth}", "{tooth}", "Pieza debilitada por restauracion extensa", "Preparacion, provisional y corona definitiva", "planned", 420000),
    ("Implante pieza {tooth}", "{tooth}", "Ausencia dentaria", "Evaluacion radiografica, cirugia y rehabilitacion", "planned", 920000),
    ("Plano de relajacion", None, "Bruxismo", "Impresion, instalacion y controles de ajuste", "in_progress", 180000),
    ("Blanqueamiento supervisado", None, "Tincion dental", "Registro de color y controles", "planned", 210000),
    ("Extraccion pieza {tooth}", "{tooth}", "Pieza con pronostico desfavorable", "Exodoncia y control postoperatorio", "completed", 95000),
]

TEETH = ["11", "12", "16", "17", "21", "24", "26", "31", "36", "37", "41", "44", "46", "47"]
PAYMENT_METHODS = ["Transferencia", "Tarjeta", "Efectivo"]
APPOINTMENT_REASONS = ["Control clinico", "Evaluacion inicial", "Control radiografico", "Limpieza", "Urgencia dental", "Control de tratamiento", "Instalacion provisorio"]


def connect() -> sqlite3.Connection:
    init_db()
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def ensure_catalog(connection: sqlite3.Connection) -> dict[str, int]:
    for name, description, price in CATALOG:
        row = connection.execute("SELECT id FROM treatment_catalog WHERE name = ?", (name,)).fetchone()
        if row is None:
            connection.execute(
                "INSERT INTO treatment_catalog (name, description, default_price) VALUES (?, ?, ?)",
                (name, description, price),
            )
    return {row["name"]: row["id"] for row in connection.execute("SELECT id, name FROM treatment_catalog")}


def clear_existing_demo(connection: sqlite3.Connection) -> None:
    patient_ids = [row["id"] for row in connection.execute("SELECT id FROM patients WHERE rut LIKE 'DEMO-%'")]
    if not patient_ids:
        return
    placeholders = ",".join("?" for _ in patient_ids)
    for table in ["payments", "attachments", "appointments", "clinical_sessions", "patient_treatments"]:
        connection.execute(f"DELETE FROM {table} WHERE patient_id IN ({placeholders})", patient_ids)
    connection.execute(f"DELETE FROM patients WHERE id IN ({placeholders})", patient_ids)


def insert_patient(connection: sqlite3.Connection, patient: tuple[str, ...]) -> int:
    cursor = connection.execute(
        """
        INSERT INTO patients (
          rut, first_name, last_name, birth_date, phone, email, address,
          medical_notes, active_alert
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        patient,
    )
    return int(cursor.lastrowid)


def insert_treatment(
    connection: sqlite3.Connection,
    patient_id: int,
    catalog_ids: dict[str, int],
    rng: random.Random,
    today: date,
    offset: int,
) -> int:
    template = rng.choice(TREATMENT_TEMPLATES)
    title, tooth_template, diagnosis, plan, status, price = template
    tooth = rng.choice(TEETH) if tooth_template else None
    title = title.format(tooth=tooth or "")
    tooth_code = tooth_template.format(tooth=tooth) if tooth_template else None
    catalog_id = None
    for name, treatment_id in catalog_ids.items():
        if name.lower().split()[0] in title.lower():
            catalog_id = treatment_id
            break
    start_date = today - timedelta(days=rng.randint(7, 150))
    end_date = None
    final_price = None
    if status == "completed":
        end_date = start_date + timedelta(days=rng.randint(7, 55))
        final_price = price
    if status == "cancelled":
        end_date = start_date + timedelta(days=rng.randint(2, 20))
    cursor = connection.execute(
        """
        INSERT INTO patient_treatments (
          patient_id, catalog_treatment_id, title, tooth_code, diagnosis,
          plan_notes, status, estimated_price, final_price, start_date, end_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (patient_id, catalog_id, title, tooth_code, diagnosis, plan, status, price, final_price, start_date.isoformat(), end_date.isoformat() if end_date else None),
    )
    return int(cursor.lastrowid)


def insert_sessions(connection: sqlite3.Connection, patient_id: int, treatment_id: int, title: str, status: str, rng: random.Random, today: date) -> list[int]:
    count = 1 if status == "planned" else rng.randint(2, 4)
    session_ids: list[int] = []
    for idx in range(count):
        session_day = today - timedelta(days=rng.randint(2, 120 - idx * 10))
        session_at = datetime.combine(session_day, time(hour=rng.choice([9, 10, 11, 15, 16, 17]), minute=rng.choice([0, 15, 30])))
        reason = "Evaluacion inicial" if idx == 0 else rng.choice(["Control clinico", "Control radiografico", "Evolucion de tratamiento", "Ajuste y revision"])
        procedure = rng.choice([
            "Evaluacion intraoral y registro clinico",
            "Control de higiene, ajuste y pulido",
            "Revision de radiografia y plan de continuidad",
            "Procedimiento clinico segun plan indicado",
        ])
        cursor = connection.execute(
            """
            INSERT INTO clinical_sessions (
              patient_id, patient_treatment_id, session_date, reason,
              diagnosis, procedure_done, notes, next_steps
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                patient_id,
                treatment_id,
                session_at.strftime("%Y-%m-%d %H:%M"),
                reason,
                f"Seguimiento: {title}",
                procedure,
                rng.choice(["Buena tolerancia al procedimiento.", "Se refuerza higiene oral.", "Paciente refiere disminucion de molestias.", "Se deja indicacion de control."]),
                rng.choice(["Control en 7 dias", "Control en 2 semanas", "Continuar plan clinico", "Esperar evolucion y reevaluar"]),
            ),
        )
        session_ids.append(int(cursor.lastrowid))
    return session_ids


def copy_attachment(patient_id: int, rng: random.Random, index: int) -> tuple[str, int]:
    folder = MEDIA_DIR / "pacientes" / f"{patient_id:06d}" / "radiografias"
    folder.mkdir(parents=True, exist_ok=True)
    filename = f"demo-rx-{index:03d}.png"
    target = folder / filename
    shutil.copyfile(SOURCE_RX, target)
    return target.relative_to(ROOT_DIR).as_posix(), target.stat().st_size


def insert_attachments(connection: sqlite3.Connection, patient_id: int, treatment_id: int, session_ids: list[int], rng: random.Random, index: int, today: date) -> int:
    attachment_count = rng.randint(1, 3)
    inserted = 0
    for item in range(attachment_count):
        stored_path, file_size = copy_attachment(patient_id, rng, index * 10 + item)
        category = rng.choice(["Panoramica", "Periapical", "Bitewing", "Control postoperatorio"])
        taken_at = today - timedelta(days=rng.randint(1, 130))
        session_id = rng.choice(session_ids) if session_ids else None
        connection.execute(
            """
            INSERT INTO attachments (
              patient_id, clinical_session_id, patient_treatment_id, file_type,
              category, original_filename, stored_path, mime_type, file_size, taken_at, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                patient_id,
                session_id,
                treatment_id,
                "radiography",
                category,
                Path(stored_path).name,
                stored_path,
                "image/png",
                file_size,
                taken_at.isoformat(),
                f"Radiografia demo {category.lower()} asociada al tratamiento.",
            ),
        )
        inserted += 1
    return inserted


def insert_payments(connection: sqlite3.Connection, patient_id: int, treatment_id: int, status: str, price: float, rng: random.Random, today: date) -> None:
    if status == "planned" and rng.random() < 0.55:
        return
    if status == "completed":
        total_paid = price
    else:
        total_paid = rng.choice([0, int(price * 0.25), int(price * 0.4), int(price * 0.6)])
    if total_paid <= 0:
        return
    chunks = 1 if total_paid < 120000 else rng.randint(1, 3)
    remaining = total_paid
    for idx in range(chunks):
        amount = remaining if idx == chunks - 1 else int(total_paid / chunks)
        remaining -= amount
        payment_date = today - timedelta(days=rng.randint(1, 110))
        connection.execute(
            "INSERT INTO payments (patient_id, patient_treatment_id, payment_date, amount, method, notes) VALUES (?, ?, ?, ?, ?, ?)",
            (patient_id, treatment_id, payment_date.isoformat(), amount, rng.choice(PAYMENT_METHODS), "Abono demo asociado a tratamiento"),
        )


def insert_appointments(connection: sqlite3.Connection, patient_id: int, rng: random.Random, today: date) -> None:
    past_count = rng.randint(1, 3)
    for _ in range(past_count):
        day = today - timedelta(days=rng.randint(1, 90))
        start = datetime.combine(day, time(hour=rng.choice([9, 10, 11, 15, 16]), minute=rng.choice([0, 30])))
        end = start + timedelta(minutes=rng.choice([30, 45, 60]))
        status = rng.choices(["attended", "missed", "cancelled"], weights=[8, 1, 1], k=1)[0]
        connection.execute(
            "INSERT INTO appointments (patient_id, starts_at, ends_at, reason, status, notes) VALUES (?, ?, ?, ?, ?, ?)",
            (patient_id, start.strftime("%Y-%m-%d %H:%M"), end.strftime("%Y-%m-%d %H:%M"), rng.choice(APPOINTMENT_REASONS), status, "Cita demo historica"),
        )
    if rng.random() < 0.85:
        day = today + timedelta(days=rng.randint(1, 28))
        start = datetime.combine(day, time(hour=rng.choice([9, 10, 11, 14, 15, 16, 17]), minute=rng.choice([0, 15, 30, 45])))
        end = start + timedelta(minutes=rng.choice([30, 45, 60]))
        connection.execute(
            "INSERT INTO appointments (patient_id, starts_at, ends_at, reason, status, notes) VALUES (?, ?, ?, ?, ?, ?)",
            (patient_id, start.strftime("%Y-%m-%d %H:%M"), end.strftime("%Y-%m-%d %H:%M"), rng.choice(APPOINTMENT_REASONS), "scheduled", "Cita demo por atender"),
        )


def seed() -> dict[str, int]:
    rng = random.Random(SEED)
    today = date.today()
    with connect() as connection:
        clear_existing_demo(connection)
        catalog_ids = ensure_catalog(connection)
        stats = {"patients": 0, "treatments": 0, "sessions": 0, "attachments": 0, "appointments": 0, "payments": 0}
        for index, patient in enumerate(PATIENTS, start=1):
            patient_id = insert_patient(connection, patient)
            stats["patients"] += 1
            treatment_count = rng.randint(2, 4)
            for offset in range(treatment_count):
                treatment_id = insert_treatment(connection, patient_id, catalog_ids, rng, today, offset)
                treatment = connection.execute("SELECT title, status, COALESCE(final_price, estimated_price, 0) AS price FROM patient_treatments WHERE id = ?", (treatment_id,)).fetchone()
                stats["treatments"] += 1
                session_ids = insert_sessions(connection, patient_id, treatment_id, treatment["title"], treatment["status"], rng, today)
                stats["sessions"] += len(session_ids)
                stats["attachments"] += insert_attachments(connection, patient_id, treatment_id, session_ids, rng, index * 10 + offset, today)
                before = connection.total_changes
                insert_payments(connection, patient_id, treatment_id, treatment["status"], float(treatment["price"]), rng, today)
                stats["payments"] += connection.total_changes - before
            before = connection.total_changes
            insert_appointments(connection, patient_id, rng, today)
            stats["appointments"] += connection.total_changes - before
        connection.commit()
        return stats


if __name__ == "__main__":
    result = seed()
    for key, value in result.items():
        print(f"{key}: {value}")
