/* Asignaciones explícitas: los abonos anteriores nunca se reparten por estimación. */
(() => {
  function parse(value) {
    try { const items = JSON.parse(value || "[]"); return Array.isArray(items) ? items : []; }
    catch { return []; }
  }
  function balances(treatment, payments) {
    const items = parse(treatment?.procedure_items_json);
    const net = items.map((item) => {
      const price = Number(item.price || 0);
      const discount = item.discount_type === "percent" ? Math.round(price * Number(item.discount_value || 0) / 100) : Number(item.discount_value || 0);
      return Math.max(0, price - discount);
    });
    const subtotal = net.reduce((sum, value) => sum + value, 0);
    const discount = Math.max(0, subtotal - Number(treatment?.final_price ?? subtotal));
    const portions = net.map((value) => subtotal ? Number(BigInt(discount) * BigInt(value) / BigInt(subtotal)) : 0);
    const order = net.map((value, index) => ({ index, remainder: subtotal ? BigInt(discount) * BigInt(value) % BigInt(subtotal) : 0n }))
      .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
    order.slice(0, discount - portions.reduce((sum, value) => sum + value, 0)).forEach(({ index }) => { portions[index] += 1; });
    const related = payments.filter((payment) => Number(payment.patient_treatment_id) === Number(treatment?.id));
    const paidByLine = new Map();
    let unassigned = 0;
    related.forEach((payment) => {
      const parts = parse(payment.procedure_allocations_json);
      unassigned += Number(payment.amount || 0) - parts.reduce((sum, part) => sum + Number(part.amount || 0), 0);
      parts.forEach((part) => paidByLine.set(part.line_id, (paidByLine.get(part.line_id) || 0) + Number(part.amount)));
    });
    return { unassigned, lines: items.map((item, index) => {
      const total = net[index] - portions[index];
      const paid = paidByLine.get(item.line_id) || 0;
      return { ...item, total, paid, due: Math.max(total - paid, 0) };
    }) };
  }
  function render(treatment, payments, { editable = true, initial = [] } = {}) {
    const { lines, unassigned } = balances(treatment, payments);
    if (!lines.length) return "";
    return `<details class="procedure-payment-details" data-procedure-payments><summary>${editable ? "Ver y asignar abono por procedimiento" : "Ver abonos por procedimiento"}</summary>
      ${unassigned > 0 ? `<p class="procedure-unassigned">Abonos sin asignar: ${DentalAPI.money(unassigned)}. Ya descuentan del saldo del tratamiento; no se atribuyen a ningún procedimiento.</p>` : ""}
      <div class="procedure-payment-lines">${lines.map((line) => `<div class="procedure-payment-line">
        <div><strong>${DentalAPI.escapeHtml(line.name)}</strong><small>${line.tooth_code ? `Piezas ${DentalAPI.escapeHtml(line.tooth_code)}` : "General"}</small>
        <small>Total ${DentalAPI.money(line.total)} · Abonado ${DentalAPI.money(line.paid)}</small>
        <small>${unassigned > 0 ? "Por asignar" : "Saldo pendiente"} ${DentalAPI.money(line.due)}</small></div>
        ${editable && line.line_id ? `<label>Asignar a ${DentalAPI.escapeHtml(line.name)}<input type="number" min="0" max="${line.due}" step="1" data-procedure-part data-line-id="${DentalAPI.escapeHtml(line.line_id)}" placeholder="Monto" value="${Number(initial.find((part) => part.line_id === line.line_id)?.amount) || ""}" /></label>` : ""}
      </div>`).join("")}</div>
      ${editable ? '<p class="form-helper">Asigna solo el monto recibido. El resto se guarda como abono sin asignar al tratamiento.</p><p data-procedure-payment-summary aria-live="polite"></p>' : ""}
    </details>`;
  }
  function read(root, amount) {
    const parts = [...root.querySelectorAll("[data-procedure-part]")].filter((input) => input.value !== "" && Number(input.value) !== 0).map((input) => {
      const value = Number(input.value);
      if (!Number.isSafeInteger(value) || value < 0 || value > Number(input.max)) throw new Error("Revisa los montos asignados: deben ser enteros y no superar el saldo de cada procedimiento.");
      return { line_id: input.dataset.lineId, amount: value };
    });
    if (parts.reduce((sum, part) => sum + part.amount, 0) > amount) throw new Error("Lo asignado a procedimientos supera el monto del abono.");
    return parts;
  }
  function update(root, amount) {
    const target = root.querySelector("[data-procedure-payment-summary]");
    if (!target) return;
    const assigned = [...root.querySelectorAll("[data-procedure-part]")].reduce((sum, input) => sum + Number(input.value || 0), 0);
    target.textContent = `Asignado: ${DentalAPI.money(assigned)} · ${assigned > amount ? "Supera el abono recibido" : `Sin asignar de este abono: ${DentalAPI.money(amount - assigned)}`}`;
  }
  function paymentSummary(payment, treatment) {
    const parts = parse(payment.procedure_allocations_json);
    const lines = parse(treatment?.procedure_items_json);
    const unassigned = Number(payment.amount) - parts.reduce((sum, part) => sum + Number(part.amount), 0);
    return `<details class="procedure-payment-details" data-payment-readonly><summary>Distribución del abono</summary>
      ${parts.map((part) => `<p>${DentalAPI.escapeHtml(lines.find((line) => line.line_id === part.line_id)?.name || "Procedimiento")} · ${DentalAPI.money(part.amount)}</p>`).join("")}
      ${unassigned > 0 ? `<p>Sin asignar a procedimientos: ${DentalAPI.money(unassigned)}</p>` : ""}</details>`;
  }
  window.ProcedurePayments = Object.freeze({ render, read, update, balances, parse, paymentSummary });
})();
