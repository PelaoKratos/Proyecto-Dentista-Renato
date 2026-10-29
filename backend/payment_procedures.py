"""Explicit allocation of payments. Legacy/unassigned money is never guessed."""
import json
import math
import uuid
from decimal import Decimal, ROUND_HALF_UP


def migrate(connection):
    if "procedure_allocations_json" not in {row["name"] for row in connection.execute("PRAGMA table_info(payments)")}:
        connection.execute("ALTER TABLE payments ADD COLUMN procedure_allocations_json TEXT")
    connection.execute("""CREATE TRIGGER IF NOT EXISTS trg_audit_payment_procedures_update
        AFTER UPDATE ON payments
        WHEN OLD.procedure_allocations_json IS NOT NEW.procedure_allocations_json
          AND OLD.amount IS NEW.amount AND OLD.method IS NEW.method
          AND OLD.patient_id IS NEW.patient_id AND OLD.payment_date IS NEW.payment_date
        BEGIN
          INSERT INTO audit_log (entity_type, entity_id, patient_id, action, before_json, after_json)
          VALUES ('payment', NEW.id, NEW.patient_id, 'updated',
            json_object('procedure_allocations_json', OLD.procedure_allocations_json),
            json_object('procedure_allocations_json', NEW.procedure_allocations_json));
        END""")
    for row in connection.execute("SELECT id, procedure_items_json FROM patient_treatments WHERE procedure_items_json IS NOT NULL").fetchall():
        try:
            items = json.loads(row["procedure_items_json"] or "[]")
        except (ValueError, TypeError):
            continue
        if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
            continue
        changed = False
        seen = set()
        for item in items:
            if not isinstance(item.get("line_id"), str) or not item["line_id"] or item["line_id"] in seen:
                item["line_id"] = uuid.uuid4().hex
                changed = True
            seen.add(item["line_id"])
        if changed:
            connection.execute("UPDATE patient_treatments SET procedure_items_json = ? WHERE id = ?",
                               (json.dumps(items, ensure_ascii=False), row["id"]))


def totals(treatment):
    items = json.loads(treatment["procedure_items_json"] or "[]")
    net = []
    for item in items:
        price = int(item["price"])
        value = Decimal(str(item.get("discount_value") or 0))
        discount = int((Decimal(price) * value / 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP)) if item.get("discount_type") == "percent" else int(value)
        net.append(max(0, price - discount))
    subtotal = sum(net)
    total = int(treatment["final_price"] if treatment["final_price"] is not None else subtotal)
    discount = max(0, subtotal - total)
    portions = [discount * value // subtotal if subtotal else 0 for value in net]
    order = sorted(range(len(net)), key=lambda i: (-(discount * net[i] % subtotal), i)) if subtotal else []
    for i in order[:discount - sum(portions)]:
        portions[i] += 1
    return {item["line_id"]: net[i] - portions[i] for i, item in enumerate(items) if item.get("line_id")}


def allocated(connection, treatment_id, excluding=None):
    result = {}
    for payment in connection.execute("SELECT id, procedure_allocations_json FROM payments WHERE patient_treatment_id = ?", (treatment_id,)):
        if payment["id"] == excluding:
            continue
        for part in json.loads(payment["procedure_allocations_json"] or "[]"):
            result[part["line_id"]] = result.get(part["line_id"], 0) + part["amount"]
    return result


def normalize(connection, payment, excluding=None):
    parts = payment.get("procedure_allocations", None)
    if parts is None:
        parts = json.loads(payment.get("procedure_allocations_json") or "[]")
    if not isinstance(parts, list) or len(parts) > 30:
        raise ValueError("Las asignaciones de procedimientos no son válidas.")
    treatment_id = payment.get("patient_treatment_id")
    treatment = connection.execute("SELECT * FROM patient_treatments WHERE id = ?", (treatment_id,)).fetchone() if treatment_id else None
    if treatment:
        total = treatment["final_price"] if treatment["final_price"] is not None else treatment["estimated_price"]
        already_paid = connection.execute("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE patient_treatment_id = ? AND id != ?", (treatment_id, excluding or -1)).fetchone()[0]
        if total is not None and float(payment["amount"]) + float(already_paid) > float(total):
            raise ValueError("El abono supera el saldo pendiente del tratamiento.")
    available = totals(treatment) if treatment and parts else {}
    paid = allocated(connection, treatment_id, excluding) if treatment_id and parts else {}
    normalized = []
    seen = set()
    for part in parts:
        if not isinstance(part, dict) or not isinstance(part.get("line_id"), str):
            raise ValueError("Indica un procedimiento válido para cada abono.")
        line_id, amount = part["line_id"], part.get("amount")
        if line_id not in available or line_id in seen:
            raise ValueError("El procedimiento no pertenece al tratamiento o está repetido.")
        if isinstance(amount, bool) or not isinstance(amount, (int, float)) or not math.isfinite(amount) or amount <= 0 or int(amount) != amount:
            raise ValueError("El abono por procedimiento debe ser un monto entero positivo en pesos.")
        if amount + paid.get(line_id, 0) > available[line_id]:
            raise ValueError("La asignación supera el saldo del procedimiento. Revisa los abonos registrados.")
        normalized.append({"line_id": line_id, "amount": int(amount)})
        seen.add(line_id)
    if sum(part["amount"] for part in normalized) > float(payment["amount"]):
        raise ValueError("Lo asignado a procedimientos supera el monto del abono.")
    return json.dumps(normalized, separators=(",", ":"))


def validate_repricing(connection, treatment_id, priced):
    limits = totals(priced)
    paid = allocated(connection, treatment_id)
    if any(amount > limits.get(line_id, 0) for line_id, amount in paid.items()):
        raise ValueError("No puedes quitar un procedimiento con abonos asignados ni reducir su valor bajo lo abonado. Corrige primero la asignación en Pagos.")
