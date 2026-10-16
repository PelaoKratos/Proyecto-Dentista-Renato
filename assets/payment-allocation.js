/* Selección compartida de uno, varios o todos los tratamientos pendientes. */
(() => {
  function create(form, { getTreatments, getPayments, getPatientId, onChange }) {
    const list = form.querySelector("[data-payment-allocation-list]");
    const summary = form.querySelector("[data-payment-allocation-summary]");
    const modeButtons = [...form.querySelectorAll("[data-payment-mode]")];
    const singleFields = [...form.querySelectorAll("[data-payment-single]")];
    const singleSelect = form.elements.patient_treatment_id;
    const amountInput = form.elements.amount;
    let mode = "single";

    function pending(treatment) {
      const total = Number(treatment.final_price ?? treatment.estimated_price ?? 0);
      const paid = getPayments()
        .filter((payment) => Number(payment.patient_treatment_id) === Number(treatment.id))
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      return Math.max(total - paid, 0);
    }

    function eligible() {
      return getTreatments().filter((treatment) =>
        Number(treatment.patient_id) === Number(getPatientId()) && pending(treatment) > 0);
    }

    function selectedRows() {
      return [...list.querySelectorAll("[data-payment-allocation-row]")]
        .filter((row) => row.querySelector("[data-payment-include]").checked);
    }

    function allocations() {
      const rows = selectedRows();
      if (!rows.length) throw new Error("Selecciona al menos un tratamiento pendiente.");
      return rows.map((row) => {
        const amount = Number(row.querySelector("[data-payment-part]").value);
        const due = Number(row.dataset.due);
        if (!Number.isFinite(amount) || amount <= 0 || amount > due) {
          throw new Error(`El abono de ${row.dataset.title} debe ser mayor que cero y no superar su saldo de ${DentalAPI.money(due)}.`);
        }
        return { patient_treatment_id: Number(row.dataset.treatmentId), amount };
      });
    }

    function total() {
      return selectedRows().reduce((sum, row) => sum + Number(row.querySelector("[data-payment-part]").value || 0), 0);
    }

    function selectedDue() {
      return selectedRows().reduce((sum, row) => sum + Number(row.dataset.due), 0);
    }

    function refresh() {
      modeButtons.forEach((button) => {
        const active = button.dataset.paymentMode === mode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      const single = mode === "single";
      singleFields.forEach((field) => { field.hidden = !single; });
      singleSelect.disabled = !single;
      amountInput.disabled = !single;
      list.hidden = single;
      summary.hidden = single;
      if (single) {
        list.innerHTML = "";
        onChange();
        return;
      }
      const previous = new Map([...list.querySelectorAll("[data-payment-allocation-row]")].map((row) => [
        Number(row.dataset.treatmentId),
        { checked: row.querySelector("[data-payment-include]").checked, amount: row.querySelector("[data-payment-part]").value }
      ]));
      const treatments = eligible();
      list.innerHTML = treatments.map((treatment) => {
        const due = pending(treatment);
        const old = previous.get(Number(treatment.id));
        const checked = mode === "all" || Boolean(old?.checked);
        const amount = mode === "all" ? due : old?.amount || due;
        return `<div class="payment-allocation-row" data-payment-allocation-row data-treatment-id="${treatment.id}" data-title="${DentalAPI.escapeHtml(treatment.title)}" data-due="${due}">
          <label><input type="checkbox" data-payment-include ${checked ? "checked" : ""} ${mode === "all" ? "disabled" : ""} /><span><strong>${DentalAPI.escapeHtml(treatment.title)}</strong><small>Saldo ${DentalAPI.money(due)}</small></span></label>
          <label>Abono<input type="number" data-payment-part min="1" max="${due}" step="1" value="${amount}" ${checked && mode !== "all" ? "" : "readonly"} /></label>
        </div>`;
      }).join("") || '<p class="form-helper">No hay tratamientos con saldo pendiente.</p>';
      update();
    }

    function update() {
      if (mode !== "single") {
        summary.textContent = `${selectedRows().length} tratamientos · Total a registrar: ${DentalAPI.money(total())}`;
      }
      onChange();
    }

    modeButtons.forEach((button) => button.addEventListener("click", () => {
      mode = button.dataset.paymentMode;
      list.innerHTML = "";
      refresh();
    }));
    list.addEventListener("change", (event) => {
      if (event.target.matches("[data-payment-include]")) {
        const row = event.target.closest("[data-payment-allocation-row]");
        row.querySelector("[data-payment-part]").readOnly = !event.target.checked;
      }
      update();
    });
    list.addEventListener("input", update);
    return Object.freeze({
      refresh,
      setMode(next) { mode = next; list.innerHTML = ""; refresh(); },
      getMode: () => mode, allocations, total, selectedDue,
      selectedCount: () => selectedRows().length
    });
  }
  window.PaymentAllocation = Object.freeze({ create });
})();
