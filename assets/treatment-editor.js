/* Un solo editor de tratamientos para la ficha y la vista general. */
(() => {
  document.body.insertAdjacentHTML("beforeend", `<dialog id="treatmentProceduresDialog" class="shared-treatment-dialog" aria-labelledby="treatmentProceduresTitle">
    <form id="treatmentProceduresForm">
      <header class="shared-treatment-heading"><div><h2 id="treatmentProceduresTitle">Editar tratamiento</h2><p id="treatmentProceduresPatient"></p></div><button class="text-button" type="button" data-close-treatment-editor aria-label="Cerrar editor de tratamiento">Cerrar</button></header>
      <div class="shared-treatment-body">
        <div class="shared-treatment-fields"><label>Nombre del tratamiento<input name="title" maxlength="160" required /></label><label>Estado<select name="status"></select></label></div>
        <details class="shared-treatment-notes"><summary>Fechas y notas clínicas</summary><div class="shared-treatment-fields">
          <label>Fecha de inicio<input name="start_date" type="date" /></label><label>Fecha de término<input name="end_date" type="date" /></label>
          <label>Diagnóstico<textarea name="diagnosis" maxlength="10000"></textarea></label><label>Plan clínico<textarea name="plan_notes" maxlength="10000"></textarea></label>
        </div></details>
        <div class="shared-treatment-fields" data-legacy-budget><label>Piezas<input name="tooth_code" placeholder="General" /></label><label>Presupuesto $<input name="estimated_price" type="number" min="0" step="1" /></label><label>Valor final $<input name="final_price" type="number" min="0" step="1" placeholder="Usar presupuesto" /></label></div>
        <section class="shared-treatment-procedures" aria-labelledby="sharedTreatmentBudgetTitle"><h3 id="sharedTreatmentBudgetTitle">Procedimientos y presupuesto</h3><div id="treatmentProceduresList"></div>
          <div class="shared-treatment-add"><label>Procedimiento base<select id="treatmentProcedureCatalog"></select></label><button class="text-button" type="button" id="addTreatmentProcedure">Agregar procedimiento</button></div>
          <div class="shared-treatment-fields" data-treatment-total-discount><label>Descuento total<select name="total_discount_type"><option value="amount">Valor $</option><option value="percent">Porcentaje %</option></select></label><label>Valor del descuento<input name="total_discount_value" type="number" min="0" step="any" placeholder="0" /></label></div>
        </section>
      </div>
      <footer class="shared-treatment-footer"><strong id="treatmentProceduresTotal"></strong><p class="form-status" id="treatmentProceduresStatus" role="status" aria-live="polite"></p><button class="text-button primary-action" type="submit">Guardar tratamiento</button></footer>
    </form></dialog>`);
  const dialog = document.querySelector("#treatmentProceduresDialog");
  const form = dialog.querySelector("form");
  const list = dialog.querySelector("#treatmentProceduresList");
  const message = dialog.querySelector("#treatmentProceduresStatus");
  const closeButton = dialog.querySelector("[data-close-treatment-editor]");
  let treatment, catalog = [], itemized = false, saving = false, original = "";
  const parseItems = (item) => {
    try { const items = JSON.parse(item.procedure_items_json || "[]"); return Array.isArray(items) ? items : []; }
    catch { return []; }
  };
  function collect() {
    return [...list.children].map((row) => ({
      line_id: row.dataset.lineId || undefined, catalog_treatment_id: Number(row.dataset.catalogId) || null,
      name: row.querySelector("[data-procedure-name]").value.trim(), tooth_code: row.querySelector("[data-procedure-teeth]").value.trim(),
      price: Number(row.querySelector("[data-procedure-price]").value), discount_type: row.querySelector("[data-procedure-discount-type]").value,
      discount_value: Number(row.querySelector("[data-procedure-discount-value]").value || 0)
    }));
  }
  function snapshot() { return JSON.stringify({ form: Object.fromEntries(new FormData(form)), items: collect(), itemized }); }
  window.UnsavedEdits.register("shared-treatment-editor", {
    isDirty: () => dialog.open && snapshot() !== original,
    discard: () => { if (!saving) dialog.close(); }
  });
  function update() {
    form.querySelector("[data-legacy-budget]").hidden = itemized;
    form.querySelector("[data-treatment-total-discount]").hidden = !itemized;
    let total = Number(form.elements.final_price.value || form.elements.estimated_price.value || 0);
    if (itemized) {
      total = collect().reduce((sum, item) => sum + item.price - (item.discount_type === "percent" ? Math.round(item.price * item.discount_value / 100) : item.discount_value), 0);
      const discount = Number(form.elements.total_discount_value.value || 0);
      total -= form.elements.total_discount_type.value === "percent" ? Math.round(total * discount / 100) : discount;
    }
    dialog.querySelector("#treatmentProceduresTotal").textContent = `Total: ${DentalAPI.money(Math.max(total, 0))}`;
  }
  function add(item = {}) {
    const row = document.createElement("div");
    row.className = "treatment-procedure-editor";
    row.dataset.lineId = item.line_id || "";
    row.dataset.catalogId = item.catalog_treatment_id || "";
    row.innerHTML = `<label class="procedure-name">Procedimiento<input data-procedure-name maxlength="160" required value="${DentalAPI.escapeHtml(item.name || "")}" /></label>
      <label>Piezas<input data-procedure-teeth placeholder="General" value="${DentalAPI.escapeHtml(item.tooth_code || "")}" /></label>
      <label>Valor $<input data-procedure-price type="number" min="0" max="1000000000" step="1" required value="${item.price ?? ""}" /></label>
      <label>Descuento<select data-procedure-discount-type><option value="amount">Valor $</option><option value="percent">Porcentaje %</option></select></label>
      <label>Monto<input data-procedure-discount-value type="number" min="0" step="any" placeholder="0" value="${Number(item.discount_value) || ""}" /></label>
      <button class="text-button danger-action" type="button" data-remove-procedure>Quitar</button>`;
    row.querySelector("[data-procedure-discount-type]").value = item.discount_type || "amount";
    list.append(row);
    return row;
  }
  function open({ treatment: selected, patient, catalog: options = [] }) {
    if (dialog.open || !window.UnsavedEdits.confirmDiscard()) return;
    treatment = selected; catalog = options; form.reset(); list.innerHTML = ""; message.textContent = "";
    form.querySelector("details").open = false;
    form.elements.status.innerHTML = ["planned", "in_progress", "completed", "cancelled"].map((status) => `<option value="${status}">${DentalAPI.escapeHtml(DentalAPI.statusLabel(status))}</option>`).join("");
    ["title", "status", "start_date", "end_date", "diagnosis", "plan_notes", "tooth_code", "estimated_price", "final_price", "total_discount_value"].forEach((name) => { form.elements[name].value = treatment[name] ?? ""; });
    form.elements.total_discount_type.value = treatment.total_discount_type || "amount";
    const maximum = treatment.dentition_type === "child" ? 20 : 32;
    form.elements.tooth_code.title = `Piezas entre 1 y ${maximum}, separadas por coma`;
    dialog.querySelector("#treatmentProceduresPatient").textContent = patient ? DentalAPI.fullName(patient) : "";
    dialog.querySelector("#treatmentProcedureCatalog").innerHTML = '<option value="">Personalizado</option>' + catalog.map((item) => `<option value="${item.id}">${DentalAPI.escapeHtml(item.name)} · ${DentalAPI.money(item.default_price)}</option>`).join("");
    const items = parseItems(treatment);
    itemized = items.length > 0;
    items.forEach(add);
    update(); original = snapshot(); dialog.showModal(); form.elements.title.focus();
  }
  dialog.querySelector("#addTreatmentProcedure").addEventListener("click", () => {
    if (list.children.length >= 30) return (message.textContent = "Un tratamiento puede tener hasta 30 procedimientos.");
    const chosen = catalog.find((item) => String(item.id) === dialog.querySelector("#treatmentProcedureCatalog").value);
    if (!itemized && (form.elements.estimated_price.value !== "" || form.elements.final_price.value !== "")) {
      const estimated = Number(form.elements.estimated_price.value || form.elements.final_price.value);
      const final = Number(form.elements.final_price.value === "" ? estimated : form.elements.final_price.value);
      add({ name: form.elements.title.value, tooth_code: form.elements.tooth_code.value, price: Math.max(estimated, final), discount_value: Math.max(estimated - final, 0) });
    }
    itemized = true;
    const row = add(chosen ? { name: chosen.name, price: chosen.default_price, catalog_treatment_id: chosen.id } : {});
    update(); row.querySelector("input").focus();
  });
  list.addEventListener("click", (event) => { if (event.target.closest("[data-remove-procedure]")) { event.target.closest(".treatment-procedure-editor").remove(); update(); } });
  form.addEventListener("input", update); form.addEventListener("change", update);
  function close() { if (saving) return; if (snapshot() === original || window.UnsavedEdits.confirmDiscard()) dialog.close(); }
  closeButton.addEventListener("click", close);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving) return;
    const metadata = Object.fromEntries(["title", "status", "start_date", "end_date", "diagnosis", "plan_notes"].map((name) => [name, form.elements[name].value.trim() || null]));
    if (metadata.start_date && metadata.end_date && metadata.end_date < metadata.start_date) return (message.textContent = "La fecha de término no puede ser anterior al inicio.");
    if (itemized && !list.children.length) return (message.textContent = "Agrega al menos un procedimiento.");
    saving = true; closeButton.disabled = true; form.querySelector('[type="submit"]').disabled = true; message.textContent = "Guardando tratamiento…";
    try {
      if (itemized) {
        await DentalAPI.put(`/api/patient-treatments/${treatment.id}/procedures`, { ...metadata, procedures: collect(), total_discount_type: form.elements.total_discount_type.value, total_discount_value: Number(form.elements.total_discount_value.value || 0) });
      } else {
        await DentalAPI.put(`/api/patient-treatments/${treatment.id}`, { ...metadata, tooth_code: form.elements.tooth_code.value || null,
          estimated_price: form.elements.estimated_price.value === "" ? null : Number(form.elements.estimated_price.value), final_price: form.elements.final_price.value === "" ? null : Number(form.elements.final_price.value) });
      }
      original = snapshot(); dialog.close();
      document.dispatchEvent(new CustomEvent("dental:treatment-saved", { detail: { treatmentId: treatment.id } }));
    } catch (error) { message.textContent = error.message; }
    finally { saving = false; closeButton.disabled = false; form.querySelector('[type="submit"]').disabled = false; }
  });
  window.TreatmentEditor = Object.freeze({ open });
})();
