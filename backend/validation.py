from __future__ import annotations

import math
import re
from datetime import date, datetime
from pathlib import PurePosixPath
from typing import Any

VALID_TREATMENT_STATUSES = {"planned", "in_progress", "completed", "cancelled"}
VALID_APPOINTMENT_STATUSES = {"scheduled", "attended", "missed", "cancelled"}
VALID_ATTACHMENT_TYPES = {"radiography", "photo", "document", "other"}
TEXT_LIMITS = {
    "first_name": 100, "last_name": 100, "rut": 20, "phone": 40, "email": 254,
    "address": 255, "emergency_contact_name": 100, "emergency_contact_phone": 40,
    "name": 160, "title": 160, "tooth_code": 32, "reason": 255, "method": 60,
    "category": 100, "original_filename": 255, "mime_type": 100,
    "diagnosis": 10000, "plan_notes": 10000, "medical_notes": 10000,
    "allergies": 10000, "active_alert": 10000, "description": 10000,
    "procedure_done": 10000, "notes": 10000, "next_steps": 10000,
}


def validate_text_lengths(data: dict[str, Any]) -> None:
    for field, limit in TEXT_LIMITS.items():
        value = data.get(field)
        if value is not None and len(str(value)) > limit:
            raise ValueError(f"El campo {field} no puede superar {limit} caracteres.")


def validate_positive_id(data: dict[str, Any], field: str, required: bool = False) -> None:
    if field not in data:
        if required:
            raise ValueError(f"El campo {field} debe ser un identificador valido.")
        return
    value = data[field]
    if value in (None, ""):
        if required:
            raise ValueError(f"El campo {field} debe ser un identificador valido.")
        data[field] = None
        return
    if isinstance(value, bool) or not re.fullmatch(r"[0-9]+", str(value).strip()):
        raise ValueError(f"El campo {field} debe ser un identificador valido.")
    parsed = int(value)
    if parsed < 1:
        raise ValueError(f"El campo {field} debe ser un identificador valido.")
    data[field] = parsed


def clean_payload(data: dict[str, Any]) -> dict[str, Any]:
    cleaned: dict[str, Any] = {}
    for key, value in data.items():
        if isinstance(value, str):
            value = value.strip()
            cleaned[key] = value if value != "" else None
        else:
            cleaned[key] = value
    return cleaned


def require(data: dict[str, Any], *fields: str) -> None:
    missing = [field for field in fields if data.get(field) in (None, "")]
    if missing:
        joined = ", ".join(missing)
        raise ValueError(f"Faltan campos obligatorios: {joined}.")


def validate_date(value: Any, field: str) -> None:
    if value in (None, ""):
        return
    try:
        date.fromisoformat(str(value))
    except ValueError as exc:
        raise ValueError(f"El campo {field} debe tener formato YYYY-MM-DD.") from exc


def validate_datetime(value: Any, field: str) -> None:
    if value in (None, ""):
        return
    normalized = str(value).replace("T", " ")
    try:
        datetime.strptime(normalized, "%Y-%m-%d %H:%M")
    except ValueError as exc:
        raise ValueError(f"El campo {field} debe tener formato YYYY-MM-DD HH:MM.") from exc


def validate_status(value: Any, valid_values: set[str], field: str) -> None:
    if value in (None, ""):
        return
    if str(value) not in valid_values:
        allowed = ", ".join(sorted(valid_values))
        raise ValueError(f"El campo {field} debe ser uno de: {allowed}.")


def validate_money(value: Any, field: str, required: bool = False) -> None:
    if value in (None, ""):
        if required:
            raise ValueError(f"El campo {field} es obligatorio.")
        return
    try:
        amount = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"El campo {field} debe ser numerico.") from exc
    if not math.isfinite(amount):
        raise ValueError(f"El campo {field} debe ser un numero finito.")
    if amount < 0:
        raise ValueError(f"El campo {field} no puede ser negativo.")


def validate_patient(data: dict[str, Any], partial: bool = False) -> dict[str, Any]:
    data = clean_payload(data)
    if not partial:
        require(data, "first_name", "last_name")
    validate_text_lengths(data)
    validate_date(data.get("birth_date"), "birth_date")
    if data.get("birth_date") and date.fromisoformat(str(data["birth_date"])) > date.today():
        raise ValueError("La fecha de nacimiento no puede estar en el futuro.")
    email = data.get("email")
    if email and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", str(email)):
        raise ValueError("El campo email debe tener un formato valido.")
    return data


def validate_treatment_catalog(data: dict[str, Any], partial: bool = False) -> dict[str, Any]:
    data = clean_payload(data)
    if not partial:
        require(data, "name")
    validate_text_lengths(data)
    validate_money(data.get("default_price"), "default_price")
    return data


def validate_patient_treatment(data: dict[str, Any], partial: bool = False) -> dict[str, Any]:
    data = clean_payload(data)
    if not partial:
        require(data, "patient_id", "title")
    validate_positive_id(data, "patient_id", required=not partial)
    validate_positive_id(data, "catalog_treatment_id")
    validate_text_lengths(data)
    validate_status(data.get("status"), VALID_TREATMENT_STATUSES, "status")
    validate_money(data.get("estimated_price"), "estimated_price")
    validate_money(data.get("final_price"), "final_price")
    validate_date(data.get("start_date"), "start_date")
    validate_date(data.get("end_date"), "end_date")
    return data


def validate_session(data: dict[str, Any], partial: bool = False) -> dict[str, Any]:
    data = clean_payload(data)
    if not partial:
        require(data, "patient_id", "session_date")
    validate_positive_id(data, "patient_id", required=not partial)
    validate_positive_id(data, "patient_treatment_id")
    validate_text_lengths(data)
    validate_datetime(data.get("session_date"), "session_date")
    return data


def validate_appointment(data: dict[str, Any], partial: bool = False) -> dict[str, Any]:
    data = clean_payload(data)
    if not partial:
        require(data, "patient_id", "starts_at")
    validate_positive_id(data, "patient_id", required=not partial)
    validate_positive_id(data, "patient_treatment_id")
    validate_text_lengths(data)
    validate_datetime(data.get("starts_at"), "starts_at")
    validate_datetime(data.get("ends_at"), "ends_at")
    if data.get("starts_at") and data.get("ends_at"):
        start = datetime.strptime(str(data["starts_at"]).replace("T", " "), "%Y-%m-%d %H:%M")
        end = datetime.strptime(str(data["ends_at"]).replace("T", " "), "%Y-%m-%d %H:%M")
        if end <= start:
            raise ValueError("La hora de termino debe ser posterior al inicio de la cita.")
    validate_status(data.get("status"), VALID_APPOINTMENT_STATUSES, "status")
    return data


def validate_payment(data: dict[str, Any], partial: bool = False) -> dict[str, Any]:
    data = clean_payload(data)
    if not partial:
        require(data, "patient_id", "payment_date", "amount")
    validate_positive_id(data, "patient_id", required=not partial)
    validate_positive_id(data, "patient_treatment_id")
    validate_text_lengths(data)
    validate_date(data.get("payment_date"), "payment_date")
    validate_money(data.get("amount"), "amount", required=not partial)
    return data


def validate_attachment(data: dict[str, Any], partial: bool = False) -> dict[str, Any]:
    data = clean_payload(data)
    if not partial:
        require(data, "patient_id", "file_type", "original_filename", "stored_path")
    validate_positive_id(data, "patient_id", required=not partial)
    validate_positive_id(data, "clinical_session_id")
    validate_positive_id(data, "patient_treatment_id")
    validate_text_lengths(data)
    validate_status(data.get("file_type"), VALID_ATTACHMENT_TYPES, "file_type")
    validate_date(data.get("taken_at"), "taken_at")
    stored_path = data.get("stored_path")
    if stored_path:
        relative = PurePosixPath(str(stored_path).replace("\\", "/"))
        if relative.is_absolute() or any(part in {".", ".."} for part in relative.parts):
            raise ValueError("La ruta del adjunto debe ser relativa a la carpeta publica.")
    return data
