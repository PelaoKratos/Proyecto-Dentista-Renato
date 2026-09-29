from __future__ import annotations

import json
import mimetypes
import shutil
import sys
import urllib.parse
import warnings
import zipfile
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

warnings.filterwarnings("ignore", message="'cgi' is deprecated.*", category=DeprecationWarning)
import cgi  # noqa: E402

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parent.parent))

from backend.database import (  # noqa: E402
    DB_PATH,
    create_treatment_appointment,
    ROOT_DIR,
    execute,
    fetch_all,
    fetch_one,
    init_db,
    insert_record,
    seed_demo_data,
    update_record,
)
from backend.validation import (  # noqa: E402
    validate_appointment,
    validate_attachment,
    validate_patient,
    validate_patient_treatment,
    validate_payment,
    validate_session,
    validate_treatment_catalog,
)

MEDIA_DIR = ROOT_DIR / "media"
BACKUPS_DIR = ROOT_DIR / "backups"

PATIENT_FIELDS = {
    "rut",
    "first_name",
    "last_name",
    "birth_date",
    "phone",
    "email",
    "address",
    "emergency_contact_name",
    "emergency_contact_phone",
    "medical_notes",
    "allergies",
    "active_alert",
    "is_active",
}

CATALOG_FIELDS = {"name", "description", "default_price", "is_active"}
PATIENT_TREATMENT_FIELDS = {
    "patient_id",
    "catalog_treatment_id",
    "title",
    "tooth_code",
    "diagnosis",
    "plan_notes",
    "status",
    "estimated_price",
    "final_price",
    "start_date",
    "end_date",
}
SESSION_FIELDS = {
    "patient_id",
    "patient_treatment_id",
    "session_date",
    "reason",
    "diagnosis",
    "procedure_done",
    "notes",
    "next_steps",
}
APPOINTMENT_FIELDS = {"patient_treatment_id", "patient_id", "starts_at", "ends_at", "reason", "status", "notes"}
PAYMENT_FIELDS = {"patient_id", "patient_treatment_id", "payment_date", "amount", "method", "notes"}
ATTACHMENT_FIELDS = {
    "patient_id",
    "clinical_session_id",
    "patient_treatment_id",
    "file_type",
    "category",
    "original_filename",
    "stored_path",
    "mime_type",
    "file_size",
    "taken_at",
    "notes",
}


class DentalRequestHandler(BaseHTTPRequestHandler):
    server_version = "ConsultaDentalBackend/0.1"

    def do_OPTIONS(self) -> None:
        self._send_empty(204)

    def do_GET(self) -> None:
        path, query = self._parse_url()
        try:
            if path.startswith("/api/"):
                self._handle_api_get(path, query)
                return
            self._serve_static(path)
        except Exception as exc:
            self._send_json({"error": str(exc)}, 500)

    def do_POST(self) -> None:
        path, _query = self._parse_url()
        try:
            if path == "/api/attachments":
                self._create_attachment()
                return
            if path == "/api/backups":
                self._create_backup()
                return

            data = self._read_json()
            if path == "/api/patients":
                self._send_json(insert_record("patients", validate_patient(data), PATIENT_FIELDS), 201)
            elif path == "/api/treatment-catalog":
                self._send_json(insert_record("treatment_catalog", validate_treatment_catalog(data), CATALOG_FIELDS), 201)
            elif path == "/api/patient-treatments":
                self._send_json(insert_record("patient_treatments", validate_patient_treatment(data), PATIENT_TREATMENT_FIELDS), 201)
            elif path == "/api/clinical-sessions":
                self._send_json(insert_record("clinical_sessions", validate_session(data), SESSION_FIELDS), 201)
            elif path == "/api/appointments":
                self._send_json(create_treatment_appointment(validate_appointment(data), APPOINTMENT_FIELDS, PATIENT_TREATMENT_FIELDS), 201)
            elif path == "/api/payments":
                self._send_json(insert_record("payments", validate_payment(data), PAYMENT_FIELDS), 201)
            else:
                self._send_json({"error": "Ruta no encontrada."}, 404)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, 400)
        except Exception as exc:
            self._send_json({"error": str(exc)}, 500)

    def do_PUT(self) -> None:
        path, _query = self._parse_url()
        data = self._read_json()
        try:
            table, allowed_fields, validator, record_id = self._resolve_update_route(path)
            updated = update_record(table, record_id, validator(data, partial=True), allowed_fields)
            if updated is None:
                self._send_json({"error": "Registro no encontrado."}, 404)
                return
            self._send_json(updated)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, 400)
        except Exception as exc:
            self._send_json({"error": str(exc)}, 500)

    def do_DELETE(self) -> None:
        path, _query = self._parse_url()
        try:
            patient_id = self._match_id(path, "/api/patients/")
            if patient_id is not None:
                updated = update_record("patients", patient_id, {"is_active": 0}, PATIENT_FIELDS)
                if updated is None:
                    self._send_json({"error": "Paciente no encontrado."}, 404)
                    return
                self._send_json({"ok": True, "patient": updated})
                return

            attachment_id = self._match_id(path, "/api/attachments/")
            if attachment_id is not None:
                deleted = execute("DELETE FROM attachments WHERE id = ?", (attachment_id,))
                if deleted == 0:
                    self._send_json({"error": "Adjunto no encontrado."}, 404)
                    return
                self._send_json({"ok": True})
                return

            self._send_json({"error": "Ruta no encontrada."}, 404)
        except Exception as exc:
            self._send_json({"error": str(exc)}, 500)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[backend] {self.address_string()} - {format % args}")

    def _parse_url(self) -> tuple[str, dict[str, list[str]]]:
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        return parsed.path, query

    def _handle_api_get(self, path: str, query: dict[str, list[str]]) -> None:
        if path == "/api/health":
            self._send_json({"ok": True, "database": str(DB_PATH.relative_to(ROOT_DIR))})
            return

        if path == "/api/dashboard-stats":
            date_filter = query.get("date", [datetime.now().date().isoformat()])[0]
            self._send_json(self._dashboard_stats(date_filter))
            return

        if path == "/api/patients":
            search = query.get("search", [""])[0].strip()
            if search:
                like = f"%{search}%"
                rows = fetch_all(
                    """
                    SELECT * FROM patients
                    WHERE is_active = 1
                      AND (
                        rut LIKE ?
                        OR first_name LIKE ?
                        OR last_name LIKE ?
                        OR phone LIKE ?
                        OR email LIKE ?
                      )
                    ORDER BY last_name, first_name
                    """,
                    (like, like, like, like, like),
                )
            else:
                rows = fetch_all("SELECT * FROM patients WHERE is_active = 1 ORDER BY updated_at DESC, id DESC")
            self._send_json(rows)
            return

        patient_id = self._match_id(path, "/api/patients/")
        if patient_id is not None:
            if path.endswith("/summary"):
                self._send_json(self._patient_summary(patient_id))
                return
            patient = fetch_one("SELECT * FROM patients WHERE id = ?", (patient_id,))
            self._send_json_or_404(patient)
            return

        if path == "/api/treatment-catalog":
            self._send_json(fetch_all("SELECT * FROM treatment_catalog WHERE is_active = 1 ORDER BY name"))
            return

        if path == "/api/patient-treatments":
            patient_filter = query.get("patient_id", [None])[0]
            if patient_filter:
                self._send_json(fetch_all("SELECT * FROM patient_treatments WHERE patient_id = ? ORDER BY id DESC", (patient_filter,)))
            else:
                self._send_json(fetch_all("SELECT * FROM patient_treatments ORDER BY updated_at DESC"))
            return

        if path == "/api/clinical-sessions":
            self._send_json(self._filtered_by_patient("clinical_sessions", "session_date", query))
            return

        if path == "/api/appointments":
            self._send_json(fetch_all("SELECT * FROM appointments ORDER BY starts_at"))
            return

        if path == "/api/payments":
            self._send_json(self._filtered_by_patient("payments", "payment_date", query))
            return

        if path == "/api/attachments":
            self._send_json(self._filtered_by_patient("attachments", "created_at", query))
            return

        if path == "/api/backup-status":
            self._send_json(self._backup_status())
            return

        if path == "/api/backups":
            self._send_json(self._list_backups())
            return

        self._send_json({"error": "Ruta no encontrada."}, 404)

    def _filtered_by_patient(self, table: str, order_field: str, query: dict[str, list[str]]) -> list[dict[str, Any]]:
        patient_filter = query.get("patient_id", [None])[0]
        if patient_filter:
            return fetch_all(f"SELECT * FROM {table} WHERE patient_id = ? ORDER BY {order_field} DESC", (patient_filter,))
        return fetch_all(f"SELECT * FROM {table} ORDER BY {order_field} DESC")

    def _patient_summary(self, patient_id: int) -> dict[str, Any]:
        patient = fetch_one("SELECT * FROM patients WHERE id = ?", (patient_id,))
        if patient is None:
            return {"error": "Paciente no encontrado."}

        return {
            "patient": patient,
            "treatments": fetch_all("SELECT * FROM patient_treatments WHERE patient_id = ? ORDER BY updated_at DESC", (patient_id,)),
            "sessions": fetch_all("SELECT * FROM clinical_sessions WHERE patient_id = ? ORDER BY session_date DESC", (patient_id,)),
            "attachments": fetch_all("SELECT * FROM attachments WHERE patient_id = ? ORDER BY created_at DESC", (patient_id,)),
            "appointments": fetch_all("SELECT * FROM appointments WHERE patient_id = ? ORDER BY starts_at DESC", (patient_id,)),
            "payments": fetch_all("SELECT * FROM payments WHERE patient_id = ? ORDER BY payment_date DESC", (patient_id,)),
        }

    def _match_id(self, path: str, prefix: str) -> int | None:
        if not path.startswith(prefix):
            return None
        remainder = path.removeprefix(prefix)
        first_part = remainder.split("/", 1)[0]
        if not first_part.isdigit():
            return None
        return int(first_part)

    def _resolve_update_route(self, path: str) -> tuple[str, set[str], Any, int]:
        routes = {
            "/api/patients/": ("patients", PATIENT_FIELDS, validate_patient),
            "/api/treatment-catalog/": ("treatment_catalog", CATALOG_FIELDS, validate_treatment_catalog),
            "/api/patient-treatments/": ("patient_treatments", PATIENT_TREATMENT_FIELDS, validate_patient_treatment),
            "/api/clinical-sessions/": ("clinical_sessions", SESSION_FIELDS, validate_session),
            "/api/appointments/": ("appointments", APPOINTMENT_FIELDS, validate_appointment),
            "/api/payments/": ("payments", PAYMENT_FIELDS, validate_payment),
        }

        for prefix, (table, fields, validator) in routes.items():
            record_id = self._match_id(path, prefix)
            if record_id is not None:
                return table, fields, validator, record_id

        raise ValueError("Ruta de actualizacion no encontrada.")

    def _create_attachment(self) -> None:
        content_type = self.headers.get("Content-Type", "")
        if content_type.startswith("multipart/form-data"):
            data = self._read_multipart_attachment()
        else:
            data = self._read_json()
        self._send_json(insert_record("attachments", validate_attachment(data), ATTACHMENT_FIELDS), 201)

    def _read_multipart_attachment(self) -> dict[str, Any]:
        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": self.headers.get("Content-Type", ""),
                "CONTENT_LENGTH": self.headers.get("Content-Length", "0"),
            },
        )

        patient_id = int(self._field_value(form, "patient_id", required=True))
        file_item = form["file"] if "file" in form else None
        if file_item is None or not getattr(file_item, "filename", ""):
            raise ValueError("Debe adjuntar un archivo.")

        file_type = self._field_value(form, "file_type", default="other")
        category = self._field_value(form, "category", default="")
        original_filename = Path(file_item.filename).name
        stored_dir = self._attachment_dir(patient_id, file_type)
        stored_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        stored_name = f"{timestamp}-{original_filename}"
        stored_path = stored_dir / stored_name

        with stored_path.open("wb") as target:
            shutil.copyfileobj(file_item.file, target)

        relative_path = stored_path.relative_to(ROOT_DIR).as_posix()
        return {
            "patient_id": patient_id,
            "clinical_session_id": self._optional_int(self._field_value(form, "clinical_session_id", default="")),
            "patient_treatment_id": self._optional_int(self._field_value(form, "patient_treatment_id", default="")),
            "file_type": file_type,
            "category": category,
            "original_filename": original_filename,
            "stored_path": relative_path,
            "mime_type": file_item.type,
            "file_size": stored_path.stat().st_size,
            "taken_at": self._field_value(form, "taken_at", default=""),
            "notes": self._field_value(form, "notes", default=""),
        }

    def _attachment_dir(self, patient_id: int, file_type: str) -> Path:
        folders = {
            "radiography": "radiografias",
            "photo": "fotos",
            "document": "documentos",
        }
        folder = folders.get(file_type, "otros")
        return MEDIA_DIR / "pacientes" / f"{patient_id:06d}" / folder

    def _field_value(self, form: cgi.FieldStorage, name: str, default: str = "", required: bool = False) -> str:
        if name not in form:
            if required:
                raise ValueError(f"Falta el campo obligatorio: {name}.")
            return default
        value = form.getvalue(name)
        if value in (None, "") and required:
            raise ValueError(f"Falta el campo obligatorio: {name}.")
        return str(value or default)

    def _optional_int(self, value: str) -> int | None:
        return int(value) if value else None

    def _create_backup(self) -> None:
        BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
        init_db()
        stamp = datetime.now().strftime("%Y-%m-%d-%H%M")
        backup_path = BACKUPS_DIR / f"consulta-dental-backup-{stamp}.zip"

        with zipfile.ZipFile(backup_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            if DB_PATH.exists():
                archive.write(DB_PATH, DB_PATH.relative_to(ROOT_DIR))
            if MEDIA_DIR.exists():
                for file_path in MEDIA_DIR.rglob("*"):
                    if file_path.is_file():
                        archive.write(file_path, file_path.relative_to(ROOT_DIR))

        self._send_json(
            {
                "ok": True,
                "backup_path": backup_path.relative_to(ROOT_DIR).as_posix(),
                "download_url": f"/{backup_path.relative_to(ROOT_DIR).as_posix()}",
                "size": backup_path.stat().st_size,
            },
            201,
        )

    def _dashboard_stats(self, date_filter: str) -> dict[str, Any]:
        active_patients = fetch_one("SELECT COUNT(*) AS total FROM patients WHERE is_active = 1")["total"]
        patients_with_alerts = fetch_one(
            "SELECT COUNT(*) AS total FROM patients WHERE is_active = 1 AND COALESCE(active_alert, '') != ''"
        )["total"]
        today_appointments = fetch_one(
            "SELECT COUNT(*) AS total FROM appointments WHERE date(starts_at) = date(?)",
            (date_filter,),
        )["total"]
        scheduled_appointments = fetch_one("SELECT COUNT(*) AS total FROM appointments WHERE status = 'scheduled'")["total"]
        active_treatments = fetch_one(
            "SELECT COUNT(*) AS total FROM patient_treatments WHERE status NOT IN ('completed', 'cancelled')"
        )["total"]
        in_progress_treatments = fetch_one(
            "SELECT COUNT(*) AS total FROM patient_treatments WHERE status = 'in_progress'"
        )["total"]
        balance_row = fetch_one(
            """
            SELECT
              COALESCE((SELECT SUM(COALESCE(final_price, estimated_price, 0)) FROM patient_treatments), 0)
              - COALESCE((SELECT SUM(amount) FROM payments), 0) AS total
            """
        )
        patients_with_balance = fetch_one(
            """
            SELECT COUNT(*) AS total
            FROM patients p
            WHERE p.is_active = 1
              AND (
                COALESCE((SELECT SUM(COALESCE(final_price, estimated_price, 0)) FROM patient_treatments t WHERE t.patient_id = p.id), 0)
                - COALESCE((SELECT SUM(amount) FROM payments pay WHERE pay.patient_id = p.id), 0)
              ) > 0
            """
        )["total"]

        return {
            "date": date_filter,
            "today_appointments": today_appointments,
            "scheduled_appointments": scheduled_appointments,
            "active_patients": active_patients,
            "patients_with_alerts": patients_with_alerts,
            "active_treatments": active_treatments,
            "in_progress_treatments": in_progress_treatments,
            "pending_balance": max(balance_row["total"], 0),
            "patients_with_balance": patients_with_balance,
        }

    def _list_backups(self) -> list[dict[str, Any]]:
        BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
        backups = []
        for file_path in sorted(BACKUPS_DIR.glob("*.zip"), key=lambda path: path.stat().st_mtime, reverse=True):
            backup_path = file_path.relative_to(ROOT_DIR).as_posix()
            backups.append(
                {
                    "name": file_path.name,
                    "backup_path": backup_path,
                    "download_url": f"/{backup_path}",
                    "size": file_path.stat().st_size,
                    "created_at": datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(timespec="seconds"),
                }
            )
        return backups

    def _backup_status(self) -> dict[str, Any]:
        init_db()
        backups = self._list_backups()
        db_exists = DB_PATH.exists()
        media_exists = MEDIA_DIR.exists()
        return {
            "database": {
                "path": DB_PATH.relative_to(ROOT_DIR).as_posix(),
                "exists": db_exists,
                "size": DB_PATH.stat().st_size if db_exists else 0,
            },
            "media": {
                "path": MEDIA_DIR.relative_to(ROOT_DIR).as_posix(),
                "exists": media_exists,
                "files": self._count_files(MEDIA_DIR),
                "size": self._directory_size(MEDIA_DIR),
            },
            "backups": {
                "path": BACKUPS_DIR.relative_to(ROOT_DIR).as_posix(),
                "count": len(backups),
                "latest": backups[0] if backups else None,
            },
        }

    def _directory_size(self, path: Path) -> int:
        if not path.exists():
            return 0
        return sum(file_path.stat().st_size for file_path in path.rglob("*") if file_path.is_file())

    def _count_files(self, path: Path) -> int:
        if not path.exists():
            return 0
        return sum(1 for file_path in path.rglob("*") if file_path.is_file())

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        if not raw.strip():
            return {}
        return json.loads(raw)

    def _serve_static(self, path: str) -> None:
        requested = urllib.parse.unquote(path.lstrip("/")) or "index.html"
        file_path = (ROOT_DIR / requested).resolve()
        try:
            file_path.relative_to(ROOT_DIR)
        except ValueError:
            self._send_json({"error": "Archivo no encontrado."}, 404)
            return

        if not file_path.is_file():
            self._send_json({"error": "Archivo no encontrado."}, 404)
            return

        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        self.send_response(200)
        self._send_common_headers(content_type)
        self.end_headers()
        self.wfile.write(file_path.read_bytes())

    def _send_json_or_404(self, data: Any) -> None:
        if data is None:
            self._send_json({"error": "Registro no encontrado."}, 404)
            return
        self._send_json(data)

    def _send_json(self, payload: Any, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self._send_common_headers("application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_empty(self, status: int) -> None:
        self.send_response(status)
        self._send_common_headers("text/plain; charset=utf-8")
        self.end_headers()

    def _send_common_headers(self, content_type: str) -> None:
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")


def run(host: str = "127.0.0.1", port: int = 8000) -> None:
    seed_demo_data()
    server = ThreadingHTTPServer((host, port), DentalRequestHandler)
    print(f"Consulta Dental corriendo en http://{host}:{port}")
    print("Presiona Ctrl+C para detener el servidor.")
    server.serve_forever()


if __name__ == "__main__":
    selected_port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    run(port=selected_port)
