from __future__ import annotations

import json
import mimetypes
import re
import secrets
import sqlite3
import sys
import tempfile
import threading
import urllib.parse
import zipfile
from datetime import datetime
from http.cookies import SimpleCookie
from email.parser import BytesParser
from email.policy import default as email_policy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from typing import Any

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parent.parent))

from backend.auth import AuthManager, SESSION_SECONDS  # noqa: E402
from backend.backup import create_backup, create_daily_backup_if_due  # noqa: E402
from backend.database import (  # noqa: E402
    DATA_DIR,
    DB_PATH,
    create_treatment_appointment,
    attend_appointment_with_session,
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
AUTH = AuthManager(DATA_DIR / "admin-auth.json")
MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
MAX_MULTIPART_BYTES = MAX_ATTACHMENT_BYTES + 128 * 1024
PUBLIC_ROOT_FILES = {
    "index.html", "agenda.html", "documentos.html", "paciente.html",
    "pacientes.html", "pagos.html", "procedimientos.html", "radiografias.html",
    "respaldos.html", "tratamientos.html", "login.html",
}
ALLOWED_UPLOAD_TYPES = {
    ".jpg": ("image/jpeg", lambda data: data.startswith(b"\xff\xd8\xff")),
    ".jpeg": ("image/jpeg", lambda data: data.startswith(b"\xff\xd8\xff")),
    ".png": ("image/png", lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
    ".webp": ("image/webp", lambda data: len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"),
    ".gif": ("image/gif", lambda data: data.startswith((b"GIF87a", b"GIF89a"))),
    ".pdf": ("application/pdf", lambda data: data.startswith(b"%PDF-")),
}

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


def validate_uploaded_file(filename: str, content: bytes, file_type: str) -> tuple[str, str, str]:
    """Allow a small, signature-checked set of clinical image/document formats."""
    if not content:
        raise ValueError("El archivo esta vacio.")
    if len(content) > MAX_ATTACHMENT_BYTES:
        raise ValueError("Cada archivo puede pesar como maximo 25 MB.")
    original_filename = Path(filename.replace("\\", "/")).name
    extension = Path(original_filename).suffix.lower()
    file_signature = ALLOWED_UPLOAD_TYPES.get(extension)
    if not file_signature or not file_signature[1](content[:16]):
        raise ValueError("Formato no permitido. Usa JPG, PNG, GIF, WEBP o PDF.")
    detected_mime = file_signature[0]
    if file_type not in {"radiography", "photo", "document", "other"}:
        raise ValueError("El tipo de adjunto no es valido.")
    if file_type == "document" and detected_mime != "application/pdf":
        raise ValueError("Los documentos deben ser archivos PDF.")
    if file_type in {"radiography", "photo"} and not detected_mime.startswith("image/"):
        raise ValueError("Este tipo de adjunto debe ser una imagen.")
    return original_filename, extension, detected_mime


class DentalRequestHandler(BaseHTTPRequestHandler):
    server_version = "ConsultaDentalBackend/0.1"

    def do_OPTIONS(self) -> None:
        self._send_empty(204)

    def do_GET(self) -> None:
        path, query = self._parse_url()
        try:
            if path == "/api/auth/status":
                self._send_json({"setup_required": not AUTH.configured(), "authenticated": AUTH.authenticated(self._session_token())})
                return
            if path not in {"/api/health", "/login.html"} and not path.startswith("/assets/"):
                if not self._require_auth(path):
                    return
            if path.startswith("/api/"):
                self._handle_api_get(path, query)
                return
            self._serve_static(path)
        except Exception as exc:
            self._send_request_error(exc)

    def do_POST(self) -> None:
        if not self._allow_same_origin_write():
            return
        path, _query = self._parse_url()
        try:
            if path in {"/api/auth/setup", "/api/auth/login"}:
                password = self._read_json().get("password")
                if path.endswith("/setup"):
                    token = AUTH.setup(password)
                else:
                    if not isinstance(password, str):
                        raise ValueError("Ingresa la clave de administrador.")
                    token = AUTH.login(password)
                    if token is None:
                        self._send_json({"error": "Clave incorrecta."}, 401)
                        return
                self._send_json({"ok": True}, cookie=f"dental_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age={SESSION_SECONDS}")
                return
            if not self._require_auth(path):
                return
            if path == "/api/auth/logout":
                AUTH.logout(self._session_token())
                self._send_json({"ok": True}, cookie="dental_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0")
                return
            if path == "/api/attachments":
                self._create_attachment()
                return
            if path == "/api/backups":
                data = self._read_json()
                include_media = data.get("include_media", True)
                if not isinstance(include_media, bool):
                    raise ValueError("include_media debe ser verdadero o falso.")
                self._create_backup(include_media=include_media)
                return

            data = self._read_json()
            attend_match = re.fullmatch(r"/api/appointments/([1-9][0-9]*)/attend", path)
            if attend_match:
                result = attend_appointment_with_session(int(attend_match.group(1)), data, SESSION_FIELDS)
                if result is None:
                    self._send_json({"error": "Cita no encontrada."}, 404)
                else:
                    self._send_json(result, 201)
                return
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
        except sqlite3.IntegrityError as exc:
            self._send_request_error(exc)
        except Exception as exc:
            self._send_request_error(exc)

    def do_PUT(self) -> None:
        if not self._allow_same_origin_write():
            return
        path, _query = self._parse_url()
        try:
            if not self._require_auth(path):
                return
            data = self._read_json()
            table, allowed_fields, validator, record_id = self._resolve_update_route(path)
            updated = update_record(table, record_id, validator(data, partial=True), allowed_fields)
            if updated is None:
                self._send_json({"error": "Registro no encontrado."}, 404)
                return
            self._send_json(updated)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, 400)
        except sqlite3.IntegrityError as exc:
            self._send_request_error(exc)
        except Exception as exc:
            self._send_request_error(exc)

    def do_DELETE(self) -> None:
        if not self._allow_same_origin_write():
            return
        path, _query = self._parse_url()
        try:
            if not self._require_auth(path):
                return
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
            self._send_request_error(exc)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[backend] {self.address_string()} - {format % args}")

    def _send_request_error(self, error: Exception) -> None:
        if isinstance(error, sqlite3.IntegrityError):
            self._send_json({"error": "La operación entra en conflicto con relaciones o restricciones existentes."}, 409)
            return
        self.log_error("Unhandled request error: %s", type(error).__name__)
        self._send_json({"error": "No se pudo completar la solicitud por un error interno."}, 500)

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
        data = self._read_multipart_attachment()
        stored_path = Path(data.pop("_upload_path"))
        try:
            record = insert_record("attachments", validate_attachment(data), ATTACHMENT_FIELDS)
        except Exception:
            stored_path.unlink(missing_ok=True)
            raise
        self._send_json(record, 201)

    def _read_multipart_attachment(self) -> dict[str, Any]:
        content_type = self.headers.get("Content-Type", "")
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            raise ValueError("La solicitud no contiene un archivo.")
        if content_length > MAX_MULTIPART_BYTES:
            raise ValueError("La solicitud supera el limite permitido de 25 MB por archivo.")
        body = self.rfile.read(content_length)
        if len(body) != content_length:
            raise ValueError("La carga del archivo quedo incompleta.")

        envelope = (
            f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("ascii", "strict")
            + body
        )
        message = BytesParser(policy=email_policy).parsebytes(envelope)
        if not message.is_multipart():
            raise ValueError("El formulario de adjunto debe enviarse como multipart/form-data.")

        fields: dict[str, str] = {}
        upload_name = ""
        upload_bytes = b""
        for part in message.iter_parts():
            name = part.get_param("name", header="content-disposition")
            if not name:
                continue
            filename = part.get_filename()
            value = part.get_payload(decode=True) or b""
            if name == "file" and filename:
                upload_name = str(filename)
                upload_bytes = value
            else:
                fields[str(name)] = value.decode(part.get_content_charset() or "utf-8", errors="replace")

        try:
            patient_id = int(fields.get("patient_id", ""))
        except ValueError as exc:
            raise ValueError("Debe seleccionar un paciente valido.") from exc
        if patient_id <= 0:
            raise ValueError("Debe seleccionar un paciente valido.")
        if not upload_name:
            raise ValueError("Debe adjuntar un archivo.")
        file_type = fields.get("file_type", "other").strip() or "other"
        original_filename, extension, detected_mime = validate_uploaded_file(upload_name, upload_bytes, file_type)

        stored_dir = self._attachment_dir(patient_id, file_type)
        stored_dir.mkdir(parents=True, exist_ok=True)
        stored_name = f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-{secrets.token_hex(8)}{extension}"
        stored_path = stored_dir / stored_name
        stored_path.write_bytes(upload_bytes)
        relative_path = stored_path.relative_to(ROOT_DIR).as_posix()
        return {
            "patient_id": patient_id,
            "clinical_session_id": self._optional_int(fields.get("clinical_session_id", "")),
            "patient_treatment_id": self._optional_int(fields.get("patient_treatment_id", "")),
            "file_type": file_type,
            "category": fields.get("category", ""),
            "original_filename": original_filename,
            "stored_path": relative_path,
            "mime_type": detected_mime,
            "file_size": len(upload_bytes),
            "taken_at": fields.get("taken_at", ""),
            "notes": fields.get("notes", ""),
            "_upload_path": str(stored_path),
        }

    def _attachment_dir(self, patient_id: int, file_type: str) -> Path:
        folders = {
            "radiography": "radiografias",
            "photo": "fotos",
            "document": "documentos",
        }
        folder = folders.get(file_type, "otros")
        return MEDIA_DIR / "pacientes" / f"{patient_id:06d}" / folder

    def _optional_int(self, value: str) -> int | None:
        return int(value) if value else None

    def _create_backup(self, include_media: bool = True) -> None:
        init_db()
        backup_path = create_backup(DB_PATH, MEDIA_DIR, BACKUPS_DIR, include_media=include_media)
        relative_path = backup_path.relative_to(ROOT_DIR).as_posix()
        self._send_json({
            "ok": True,
            "backup_path": relative_path,
            "download_url": f"/{relative_path}",
            "size": backup_path.stat().st_size,
            "includes_media": include_media,
        }, 201)

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
            includes_media = True
            mode = "manual"
            try:
                with zipfile.ZipFile(file_path) as archive:
                    includes_media = any(name.startswith("media/") for name in archive.namelist())
                    if "respaldo-info.json" in archive.namelist():
                        metadata = json.loads(archive.read("respaldo-info.json"))
                        includes_media = bool(metadata.get("includes_media", includes_media))
                        mode = metadata.get("mode", "manual")
                    else:
                        mode = "legacy"
            except (OSError, zipfile.BadZipFile, KeyError, json.JSONDecodeError):
                includes_media = False
            backups.append(
                {
                    "name": file_path.name,
                    "backup_path": backup_path,
                    "download_url": f"/{backup_path}",
                    "size": file_path.stat().st_size,
                    "created_at": datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(timespec="seconds"),
                    "includes_media": includes_media,
                    "mode": mode,
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
        if length < 0 or length > 2 * 1024 * 1024:
            raise ValueError("La solicitud JSON supera el limite permitido de 2 MB.")
        if length == 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        if not raw.strip():
            return {}
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("El cuerpo de la solicitud debe ser un objeto JSON.")
        return payload

    def _session_token(self) -> str | None:
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except Exception:
            return None
        item = cookie.get("dental_session")
        return item.value if item else None

    def _require_auth(self, path: str) -> bool:
        if getattr(self, "auth_required", True) is False or AUTH.authenticated(self._session_token()):
            return True
        if path.startswith("/api/") or path.startswith("/media/") or path.startswith("/backups/"):
            self._send_json({"error": "La sesión expiró. Vuelve a ingresar."}, 401)
        else:
            destination = "/login.html?next=" + urllib.parse.quote(self.path, safe="")
            self.send_response(302)
            self.send_header("Location", destination)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
        return False

    def _serve_static(self, path: str) -> None:
        requested = urllib.parse.unquote(path.lstrip("/")) or "index.html"
        if "\\" in requested or not self._is_public_static_path(requested):
            self._send_json({"error": "Archivo no encontrado."}, 404)
            return
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
        if file_path.suffix.lower() == ".html" or requested.startswith(("media/", "backups/")):
            self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(file_path.stat().st_size))
        self.end_headers()
        try:
            with file_path.open("rb") as source:
                for block in iter(lambda: source.read(1024 * 1024), b""):
                    self.wfile.write(block)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _send_json_or_404(self, data: Any) -> None:
        if data is None:
            self._send_json({"error": "Registro no encontrado."}, 404)
            return
        self._send_json(data)

    def _send_json(self, payload: Any, status: int = 200, cookie: str | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self._send_common_headers("application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_empty(self, status: int) -> None:
        self.send_response(status)
        self._send_common_headers("text/plain; charset=utf-8")
        self.end_headers()

    def _is_public_static_path(self, requested: str) -> bool:
        relative = PurePosixPath(requested)
        parts = relative.parts
        if not parts or any(part in {".", ".."} or part.startswith(".") for part in parts):
            return False
        normalized = relative.as_posix()
        if normalized in PUBLIC_ROOT_FILES:
            return True
        if parts[0] == "assets":
            return True
        if len(parts) >= 3 and parts[:2] == ("media", "pacientes") and Path(parts[-1]).suffix.lower() in ALLOWED_UPLOAD_TYPES:
            return True
        if len(parts) == 2 and parts[0] == "backups":
            return bool(re.fullmatch(r"consulta-dental-backup-\d{4}-\d{2}-\d{2}-\d{4}(?:-[a-f0-9]{6})?\.zip", parts[1]))
        return False

    def _allow_same_origin_write(self) -> bool:
        origin = self.headers.get("Origin")
        fetch_site = self.headers.get("Sec-Fetch-Site", "")
        if not origin:
            if fetch_site.lower() == "cross-site":
                self._send_json({"error": "Origen no permitido."}, 403)
                return False
            return True
        try:
            parsed = urllib.parse.urlsplit(origin)
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
            allowed = (
                parsed.scheme == "http"
                and parsed.hostname in {"127.0.0.1", "localhost"}
                and port == self.server.server_port
                and parsed.username is None
                and parsed.password is None
                and parsed.path in {"", "/"}
                and not parsed.query
                and not parsed.fragment
            )
        except ValueError:
            allowed = False
        if not allowed:
            self._send_json({"error": "Origen no permitido."}, 403)
            return False
        return True

    def _send_common_headers(self, content_type: str) -> None:
        self.send_header("Content-Type", content_type)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")


def run(host: str = "127.0.0.1", port: int = 8000) -> None:
    seed_demo_data()
    def daily_backups() -> None:
        while True:
            try:
                create_daily_backup_if_due(DB_PATH, MEDIA_DIR, BACKUPS_DIR)
            except Exception as error:
                print(f"[backup] No se pudo crear el respaldo automático: {error}")
            threading.Event().wait(3600)

    server = ThreadingHTTPServer((host, port), DentalRequestHandler)
    threading.Thread(target=daily_backups, daemon=True, name="daily-backups").start()
    print(f"Consulta Dental corriendo en http://{host}:{port}")
    print("Presiona Ctrl+C para detener el servidor.")
    server.serve_forever()


if __name__ == "__main__":
    selected_port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    run(port=selected_port)
