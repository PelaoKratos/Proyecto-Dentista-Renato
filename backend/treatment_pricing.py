"""Validate procedure lines and derive one treatment price in Chilean pesos."""
from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from backend.validation import parse_tooth_codes


def _number(value, label, maximum=None):
    if isinstance(value, bool):
        raise ValueError(f"{label} debe ser un número válido.")
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(f"{label} debe ser un número válido.") from exc
    if not amount.is_finite() or amount < 0 or (maximum is not None and amount > maximum):
        raise ValueError(f"{label} está fuera del rango permitido.")
    return amount


def _pesos(value):
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _discount(price, discount_type, discount_value, label):
    if discount_type not in ("amount", "percent"):
        raise ValueError(f"El tipo de descuento de {label} debe ser valor o porcentaje.")
    value = _number(discount_value, f"Descuento de {label}", 100 if discount_type == "percent" else price)
    deduction = _pesos(price * value / 100) if discount_type == "percent" else _pesos(value)
    return value, deduction


def price_treatment(data, dentition_type):
    """Return validated columns; never accept a client-computed final total."""
    raw_items = data.get("procedures")
    if not isinstance(raw_items, list) or not 1 <= len(raw_items) <= 30:
        raise ValueError("Agrega entre 1 y 30 procedimientos al tratamiento.")
    items = []
    all_teeth = set()
    base_total = 0
    after_lines = 0
    for index, raw in enumerate(raw_items, 1):
        if not isinstance(raw, dict):
            raise ValueError(f"El procedimiento {index} no es válido.")
        name = str(raw.get("name") or "").strip()
        if not name or len(name) > 160:
            raise ValueError(f"El procedimiento {index} necesita un nombre de hasta 160 caracteres.")
        catalog_id = raw.get("catalog_treatment_id")
        if catalog_id not in (None, "") and (isinstance(catalog_id, bool) or not str(catalog_id).isdigit() or int(catalog_id) <= 0):
            raise ValueError(f"El procedimiento {index} tiene un catálogo inválido.")
        teeth = parse_tooth_codes(raw.get("tooth_code"), dentition_type)
        all_teeth.update(teeth)
        price = _number(raw.get("price"), f"Valor del procedimiento {index}")
        if price != price.to_integral_value() or price > 1_000_000_000:
            raise ValueError(f"El valor del procedimiento {index} debe ser un monto entero en pesos.")
        discount_type = raw.get("discount_type") or "amount"
        discount_value, deduction = _discount(price, discount_type, raw.get("discount_value", 0), f"procedimiento {index}")
        if discount_type == "amount" and discount_value != discount_value.to_integral_value():
            raise ValueError("El descuento por valor debe ser un monto entero en pesos.")
        base_total += int(price)
        after_lines += int(price) - deduction
        items.append({
            "name": name, "catalog_treatment_id": int(catalog_id) if catalog_id else None,
            "tooth_code": ",".join(teeth), "price": int(price),
            "discount_type": discount_type, "discount_value": float(discount_value),
        })
    total_type = data.get("total_discount_type") or "amount"
    total_value, total_deduction = _discount(Decimal(after_lines), total_type, data.get("total_discount_value", 0), "total")
    if total_type == "amount" and total_value != total_value.to_integral_value():
        raise ValueError("El descuento total por valor debe ser un monto entero en pesos.")
    return {
        "procedure_items_json": json.dumps(items, ensure_ascii=False, separators=(",", ":")),
        "total_discount_type": total_type,
        "total_discount_value": float(total_value),
        "tooth_code": ",".join(sorted(all_teeth, key=int)) or None,
        "estimated_price": base_total,
        "final_price": after_lines - total_deduction,
    }
