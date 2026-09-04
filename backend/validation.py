from __future__ import annotations

from datetime import date, datetime
from typing import Any

VALID_TREATMENT_STATUSES = {"planned", "in_progress", "completed", "cancelled"}
VALID_APPOINTMENT_STATUSES = {"scheduled", "attended", "missed", "cancelled"}
VALID_ATTACHMENT_TYPES = {"radiography", "photo", "document", "other"}


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
    if amount < 0:
        raise ValueError(f"El campo {field} no puede ser negativo.")


def validate_patient(data: dict[str, Any], partial: bool = False) -> dict[str, Any]:
    data = clean_payload(data)
    if not partial:
        require(data, "first_name", "last_name")
    validate_date(data.get("birth_date"), "birth_date")
    return data


def validate_treatment_catalog(data: dict[str, Any], partial: bool = False) -> dict[str, Any]:
    data = clean_payload(data)
    if not partial:
        require(data, "name")
    validate_money(data.get("default_price"), "default_price")
    return data


def validate_patient_treatment(data: dict[str, Any], partial: bool = False) -> dict[str, Any]:
    data = clean_payload(data)
    if not partial:
        require(data, "patient_id", "title")
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
    validate_datetime(data.get("session_date"), "session_date")
    return data


def validate_appointment(data: dict[str, Any], partial: bool = False) -> dict[str, Any]:
    data = clean_payload(data)
    if not partial:
        require(data, "patient_id", "starts_at")
    validate_datetime(data.get("starts_at"), "starts_at")
    validate_datetime(data.get("ends_at"), "ends_at")
    validate_status(data.get("status"), VALID_APPOINTMENT_STATUSES, "status")
    return data


def validate_payment(data: dict[str, Any], partial: bool = False) -> dict[str, Any]:
    data = clean_payload(data)
    if not partial:
        require(data, "patient_id", "payment_date", "amount")
    validate_date(data.get("payment_date"), "payment_date")
    validate_money(data.get("amount"), "amount", required=not partial)
    return data


def validate_attachment(data: dict[str, Any], partial: bool = False) -> dict[str, Any]:
    data = clean_payload(data)
    if not partial:
        require(data, "patient_id", "file_type", "original_filename", "stored_path")
    validate_status(data.get("file_type"), VALID_ATTACHMENT_TYPES, "file_type")
    validate_date(data.get("taken_at"), "taken_at")
    return data
