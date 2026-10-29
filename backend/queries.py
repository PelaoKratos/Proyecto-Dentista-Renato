"""Bounded read queries for calendars and the payment ledger."""
import json
from datetime import date, datetime, timedelta
from backend.database import get_connection, rows_to_dicts


def one(query, name, default=None):
    values = query.get(name, [default])
    if len(values) != 1:
        raise ValueError(f"No repitas el filtro {name}.")
    return values[0]


def positive(value, name):
    if not isinstance(value, str) or not value.isascii() or not value.isdigit() or not 1 <= int(value) <= 2**63 - 1:
        raise ValueError(f"El filtro {name} debe ser un número entero positivo.")
    return int(value)


def period(query):
    values = []
    for name in ("date_from", "date_to"):
        value = one(query, name)
        if value is None:
            values.append(None)
            continue
        try:
            parsed = date.fromisoformat(value)
            if parsed.isoformat() != value:
                raise ValueError()
            values.append(parsed)
        except (ValueError, TypeError):
            raise ValueError(f"La fecha {name} no es válida.") from None
    start, end = values
    if start and end and start > end:
        raise ValueError("La fecha inicial no puede ser posterior a la final.")
    try:
        return start.isoformat() if start else None, (end + timedelta(days=1)).isoformat() if end else None
    except OverflowError:
        raise ValueError("La fecha final está fuera del rango permitido.") from None


def appointment_list(query):
    start, end = period(query)
    clauses, params = [], []
    if start:
        clauses.append("starts_at >= ?"); params.append(start)
    if end:
        clauses.append("starts_at < ?"); params.append(end)
    status = one(query, "status")
    if status:
        if status not in {"scheduled", "attended", "missed", "cancelled"}:
            raise ValueError("El estado de cita no es válido.")
        clauses.append("status = ?"); params.append(status)
    before = one(query, "overdue_before")
    if before:
        try:
            moment = datetime.fromisoformat(before)
            if moment.tzinfo is not None:
                raise ValueError()
            tomorrow = (moment.date() + timedelta(days=1)).isoformat()
        except (ValueError, TypeError, OverflowError):
            raise ValueError("El límite de citas pendientes no es válido.") from None
        clauses.extend(["status = 'scheduled'", "starts_at < ?", "replace(starts_at, 'T', ' ') < ?"])
        params.extend([tomorrow, moment.isoformat(sep=" ")])
    for name in ("patient_id", "patient_treatment_id"):
        value = one(query, name)
        if value:
            clauses.append(f"{name} = ?"); params.append(positive(value, name))
    connection = get_connection()
    try:
        return rows_to_dicts(connection.execute("SELECT * FROM appointments" + (" WHERE " + " AND ".join(clauses) if clauses else "") + " ORDER BY starts_at ASC, id ASC", params).fetchall())
    finally:
        connection.close()


BALANCES = """WITH paid AS (
    SELECT patient_treatment_id, SUM(amount) AS paid FROM payments GROUP BY patient_treatment_id
), balances AS (
    SELECT t.*, COALESCE(t.final_price,t.estimated_price,0) AS budget,
           COALESCE(paid.paid,0) AS paid_amount,
           CASE WHEN COALESCE(paid.paid,0) <= 0 THEN 'pending'
                WHEN paid.paid < COALESCE(t.final_price,t.estimated_price,0) THEN 'partial' ELSE 'paid' END AS payment_state
    FROM patient_treatments t LEFT JOIN paid ON paid.patient_treatment_id=t.id
) """


def payment_page(query):
    page = positive(one(query, "page", "1"), "page")
    size = positive(one(query, "page_size", "20"), "page_size")
    if size > 20:
        raise ValueError("Cada página admite como máximo 20 registros.")
    view = one(query, "view", "payments")
    if view not in {"payments", "balances"}:
        raise ValueError("La vista de pagos no es válida.")
    state = one(query, "state")
    if state and state not in {"pending", "partial", "paid", "unlinked"}:
        raise ValueError("El estado del pago no es válido.")
    start, end = period(query)
    is_balance = view == "balances"
    source = "balances t" if is_balance else "payments p LEFT JOIN balances t ON t.id=p.patient_treatment_id"
    patient = "t.patient_id" if is_balance else "p.patient_id"
    treatment = "t.id" if is_balance else "p.patient_treatment_id"
    date_column = "COALESCE(NULLIF(t.start_date,''),substr(t.created_at,1,10))" if is_balance else "p.payment_date"
    clauses, params = (["t.budget > t.paid_amount"] if is_balance else []), []
    if start:
        clauses.append(f"{date_column} >= ?"); params.append(start)
    if end:
        clauses.append(f"{date_column} < ?"); params.append(end)
    patient_id = one(query, "patient_id")
    if patient_id:
        clauses.append(f"{patient} = ?"); params.append(positive(patient_id, "patient_id"))
    treatment_id = one(query, "patient_treatment_id")
    if treatment_id == "none":
        clauses.append(f"{treatment} IS NULL")
    elif treatment_id:
        clauses.append(f"{treatment} = ?"); params.append(positive(treatment_id, "patient_treatment_id"))
    if state:
        clauses.append("COALESCE(t.payment_state,'unlinked') = ?"); params.append(state)
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    fields = f"t.id AS patient_treatment_id, t.patient_id, t.budget-t.paid_amount AS amount, {date_column} AS payment_date, 'pending' AS kind" if is_balance else "p.*, 'payment' AS kind"
    order = f"{date_column} DESC, " + ("t.id DESC" if is_balance else "p.id DESC")
    connection = get_connection()
    try:
        connection.execute("BEGIN")
        total = connection.execute(BALANCES + f"SELECT COUNT(*) FROM {source}{where}", params).fetchone()[0]
        pages = max(1, (total + size - 1) // size)
        page = min(page, pages)
        rows = rows_to_dicts(connection.execute(BALANCES + f"SELECT {fields} FROM {source}{where} ORDER BY {order} LIMIT ? OFFSET ?", (*params, size, (page - 1) * size)).fetchall())
        for row in rows:
            if is_balance:
                row["id"] = f"pending-{row['patient_treatment_id']}"
        return {"items": rows, "total": total, "page": page, "page_size": size, "total_pages": pages}
    finally:
        connection.close()


def payment_summary(query):
    value = one(query, "date", date.today().isoformat())
    try:
        today = date.fromisoformat(value)
        if today.isoformat() != value:
            raise ValueError()
        month = today.replace(day=1)
        next_month = (month.replace(day=28) + timedelta(days=4)).replace(day=1)
    except (ValueError, TypeError, OverflowError):
        raise ValueError("La fecha del resumen no es válida.") from None
    connection = get_connection()
    try:
        connection.execute("BEGIN")
        metrics = dict(connection.execute("""SELECT
            COALESCE(SUM(CASE WHEN payment_date = ? THEN amount ELSE 0 END),0) AS today_total,
            COUNT(DISTINCT CASE WHEN payment_date = ? THEN COALESCE(payment_batch_id,'single-'||id) END) AS today_count,
            COALESCE(SUM(CASE WHEN payment_date >= ? AND payment_date < ? THEN amount ELSE 0 END),0) AS month_total,
            COUNT(DISTINCT CASE WHEN payment_date >= ? AND payment_date < ? THEN COALESCE(payment_batch_id,'single-'||id) END) AS month_count,
            COUNT(*) AS count, COALESCE(SUM(CASE WHEN lower(method) LIKE '%transfer%' THEN 1 ELSE 0 END),0) AS transfers
            FROM payments""", (value, value, month.isoformat(), next_month.isoformat(), month.isoformat(), next_month.isoformat())).fetchone())
        patient_balances = connection.execute("""SELECT MAX(COALESCE(t.total,0)-COALESCE(p.paid,0),0) AS due
            FROM patients patient
            LEFT JOIN (SELECT patient_id,SUM(COALESCE(final_price,estimated_price,0)) AS total FROM patient_treatments GROUP BY patient_id) t ON t.patient_id=patient.id
            LEFT JOIN (SELECT patient_id,SUM(amount) AS paid FROM payments GROUP BY patient_id) p ON p.patient_id=patient.id
            WHERE patient.is_active=1""").fetchall()
        metrics["pending_total"] = sum(row["due"] for row in patient_balances)
        metrics["patients_with_balance"] = sum(row["due"] > 0 for row in patient_balances)
        metrics["transfer_percent"] = int(metrics["transfers"] * 100 / metrics["count"] + 0.5) if metrics["count"] else 0
        ledger = rows_to_dicts(connection.execute("SELECT patient_id,patient_treatment_id,SUM(amount) AS amount FROM payments GROUP BY patient_id,patient_treatment_id").fetchall())
        parts = {}
        for row in connection.execute("""SELECT p.patient_id,p.patient_treatment_id,json_extract(j.value,'$.line_id') AS line_id,
            SUM(json_extract(j.value,'$.amount')) AS amount FROM payments p,
            json_each(COALESCE(p.procedure_allocations_json,'[]')) j
            GROUP BY p.patient_id,p.patient_treatment_id,line_id"""):
            parts.setdefault((row["patient_id"], row["patient_treatment_id"]), []).append({"line_id": row["line_id"], "amount": row["amount"]})
        for row in ledger:
            row["procedure_allocations_json"] = json.dumps(parts.get((row["patient_id"], row["patient_treatment_id"]), []), separators=(",", ":"))
        return {"metrics": metrics, "ledger": ledger}
    finally:
        connection.close()
