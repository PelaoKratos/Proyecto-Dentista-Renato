const treatmentsGrid = document.querySelector("#treatmentsGrid");
const catalogList = document.querySelector("#catalogList");
const focusTreatmentForm = document.querySelector("#focusTreatmentForm");
const treatmentCreateDetails = document.querySelector("#treatmentCreateDetails");
const treatmentSearch = document.querySelector("#treatmentSearch");
const treatmentFilter = document.querySelector("#treatmentFilter");
const treatmentResultCount = document.querySelector("#treatmentResultCount");
const newTreatmentForm = document.querySelector("#newTreatmentForm");
const newTreatmentPatient = document.querySelector("#newTreatmentPatient");
const newTreatmentCatalog = document.querySelector("#newTreatmentCatalog");
const newTreatmentTitle = document.querySelector("#newTreatmentTitle");
const newTreatmentPrice = document.querySelector("#newTreatmentPrice");
const newTreatmentStatus = document.querySelector("#newTreatmentStatus");
const newTreatmentTooth = newTreatmentForm.elements.tooth_code;
const proceduresDialog = document.querySelector("#treatmentProceduresDialog");
const proceduresForm = document.querySelector("#treatmentProceduresForm");
const proceduresList = document.querySelector("#treatmentProceduresList");
let editingProceduresId = null;

let patients = [];
let catalog = [];
let treatments = [];

function statusOptions(selectedStatus) {
  return ["planned", "in_progress", "completed", "cancelled"]
    .map((status) => `<option value="${status}" ${status === selectedStatus ? "selected" : ""}>${DentalAPI.escapeHtml(DentalAPI.statusLabel(status))}</option>`)
    .join("");
}

function statusClass(status) {
  return {
    planned: "planned",
    in_progress: "in-progress",
    completed: "completed",
    cancelled: "cancelled"
  }[status] || "planned";
}

function cleanFormData(form) {
  const raw = Object.fromEntries(new FormData(form).entries());
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, value === "" ? null : value]));
}

function renderFormOptions() {
  newTreatmentPatient.innerHTML = patients
    .map((patient) => `<option value="${patient.id}">${DentalAPI.escapeHtml(DentalAPI.fullName(patient))}</option>`)
    .join("");

  updateToothHint();
  newTreatmentCatalog.innerHTML =
    `<option value="">Personalizado</option>` +
    catalog
      .map((item) => `<option value="${item.id}" data-title="${DentalAPI.escapeHtml(item.name)}" data-price="${Number(item.default_price || 0)}">${DentalAPI.escapeHtml(item.name)} · ${DentalAPI.money(item.default_price)}</option>`)
      .join("");
}

function updateToothHint() {
  const patient = patients.find((item) => Number(item.id) === Number(newTreatmentPatient.value));
  const maximum = patient?.dentition_type === "child" ? 20 : 32;
  newTreatmentTooth.placeholder = `Ej. 1, 2, 3 (hasta ${maximum})`;
  newTreatmentTooth.title = `Piezas del odontograma ${maximum === 20 ? "infantil" : "adulto"}: 1 a ${maximum}`;
}
newTreatmentPatient.addEventListener("change", updateToothHint);

function treatmentIcon(item) {
  const value = String(item.category || item.name || "").toLowerCase();
  if (value.includes("endodon")) return "🩺";
  if (value.includes("cirug") || value.includes("implan")) return "⚕️";
  if (value.includes("restaur") || value.includes("empast")) return "🔧";
  if (value.includes("estet")) return "✨";
  if (value.includes("diagn")) return "📋";
  return "🦷";
}

function treatmentProcedureItems(treatment) {
  try { return JSON.parse(treatment.procedure_items_json || "[]"); }
  catch { return []; }
}

function renderTreatmentCard(treatment, patientById) {
  const patient = patientById.get(treatment.patient_id);
  const patientName = patient ? DentalAPI.fullName(patient) : "Paciente";
  const toothLabel = treatment.tooth_code ? ` · Piezas ${DentalAPI.escapeHtml(treatment.tooth_code)} (${(treatment.dentition_type || "adult") === "child" ? "infantil" : "adulto"})` : "";
  const canComplete = treatment.status !== "completed" && treatment.status !== "cancelled";
  const treatmentName = DentalAPI.escapeHtml(treatment.title || "Tratamiento sin nombre");
  const statusLabel = DentalAPI.escapeHtml(DentalAPI.statusLabel(treatment.status));
  const procedures = treatmentProcedureItems(treatment);
  const itemized = procedures.length > 0;
  const missingBudget = treatment.estimated_price == null && treatment.final_price == null;

  return `
    <article class="treatment-card" data-treatment-card="${treatment.id}">
      <header class="treatment-card-header">
        <div class="treatment-card-main">
          <strong>${treatmentName}</strong>
          <p>${patient ? DentalAPI.patientLink(patient.id, patientName) : DentalAPI.escapeHtml(patientName)}${toothLabel}</p>
        </div>
        <span class="status-mark ${statusClass(treatment.status)}">${statusLabel}</span>
      </header>
      ${missingBudget ? '<p class="form-helper">Presupuesto pendiente de ingresar. Completa los procedimientos y sus descuentos.</p>' : ""}
      ${itemized ? `<div class="patient-procedure-breakdown"><strong>${procedures.length} procedimientos · Total ${DentalAPI.money(treatment.final_price ?? 0)}</strong><ul>${procedures.map((item) => {
        const discount = item.discount_type === "percent" ? Math.round(Number(item.price) * Number(item.discount_value || 0) / 100) : Number(item.discount_value || 0);
        const discountLabel = discount ? ` · Descuento ${item.discount_type === "percent" ? `${item.discount_value}%` : DentalAPI.money(item.discount_value)}` : "";
        return `<li><span>${DentalAPI.escapeHtml(item.name)}<small>${DentalAPI.escapeHtml(item.tooth_code ? `Piezas ${item.tooth_code}` : "General")} · Valor ${DentalAPI.money(item.price)}${DentalAPI.escapeHtml(discountLabel)}</small></span><b>${DentalAPI.money(Math.max(Number(item.price) - discount, 0))}</b></li>`;
      }).join("")}</ul>${Number(treatment.total_discount_value || 0) ? `<small>Descuento general: ${DentalAPI.escapeHtml(treatment.total_discount_type === "percent" ? `${treatment.total_discount_value}%` : DentalAPI.money(treatment.total_discount_value))}</small>` : ""}</div>` : ""}
      <div class="treatment-card-actions">
        <button class="text-button" type="button" data-edit-procedures="${treatment.id}">${missingBudget ? "Ingresar procedimientos" : "Editar procedimientos"}</button>
        <details class="treatment-edit-details">
          <summary>Editar</summary>
          <div class="editor-controls treatment-editor">
            <label class="treatment-form-wide">Nombre<input data-treatment-title value="${DentalAPI.escapeHtml(treatment.title || "")}" /></label>
            <label>Piezas<input data-treatment-tooth value="${DentalAPI.escapeHtml(treatment.tooth_code || "")}" ${itemized ? "disabled" : ""} /></label>
            <label>Estado<select data-treatment-status>${statusOptions(treatment.status)}</select></label>
            <label>Presupuesto<input data-treatment-estimated type="number" min="0" value="${DentalAPI.escapeHtml(treatment.estimated_price || "")}" ${itemized ? "disabled" : ""} /></label>
            <label>Valor final<input data-treatment-final type="number" min="0" value="${DentalAPI.escapeHtml(treatment.final_price || "")}" ${itemized ? "disabled" : ""} /></label>
            <label>Inicio<input data-treatment-start type="date" value="${DentalAPI.escapeHtml(treatment.start_date || "")}" /></label>
            <label>Término<input data-treatment-end type="date" value="${DentalAPI.escapeHtml(treatment.end_date || "")}" /></label>
            <label class="treatment-form-wide">Diagnóstico<textarea data-treatment-diagnosis>${DentalAPI.escapeHtml(treatment.diagnosis || "")}</textarea></label>
            <label class="treatment-form-wide">Plan clínico<textarea data-treatment-plan>${DentalAPI.escapeHtml(treatment.plan_notes || "")}</textarea></label>
          </div>
          ${itemized ? '<p class="form-helper">Las piezas y los valores se editan en «Editar procedimientos».</p>' : ""}
          <div class="inline-actions treatment-edit-actions">
            <button class="text-button" type="button" data-save-treatment="${treatment.id}">Guardar</button>
          </div>
        </details>
        ${canComplete ? `<button class="text-button treatment-finish-button" type="button" data-complete-treatment="${treatment.id}">Finalizar</button>` : ""}
        <a class="text-button link-button" href="./paciente.html?id=${treatment.patient_id}">Abrir ficha</a>
      </div>
      <p class="form-status" data-treatment-message="${treatment.id}" aria-live="polite"></p>
    </article>
  `;
}

function matchesSelectedStatus(treatment) {
  if (treatmentFilter.value === "completed" || treatmentFilter.value === "cancelled") {
    return treatment.status === treatmentFilter.value;
  }
  if (treatmentFilter.value === "active") {
    return treatment.status !== "completed" && treatment.status !== "cancelled";
  }
  return true;
}

function renderTreatmentList() {
  const patientById = new Map(patients.map((patient) => [patient.id, patient]));
  const query = treatmentSearch.value.trim().toLocaleLowerCase();
  const visibleTreatments = treatments.filter((treatment) => {
    if (!matchesSelectedStatus(treatment)) return false;
    if (!query) return true;
    const patient = patientById.get(treatment.patient_id);
    const searchable = [treatment.title, treatment.tooth_code, patient ? DentalAPI.fullName(patient) : ""]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    return searchable.includes(query);
  });

  treatmentResultCount.textContent = `${visibleTreatments.length} ${visibleTreatments.length === 1 ? "tratamiento" : "tratamientos"}`;

  if (!treatments.length) {
    treatmentsGrid.innerHTML = `<p class="empty-state">Aún no hay tratamientos. Usa «Crear tratamiento» para registrar el primero.</p>`;
    return;
  }

  if (!visibleTreatments.length) {
    treatmentsGrid.innerHTML = `<p class="empty-state">No hay tratamientos que coincidan. Prueba otro estado o búsqueda.</p>`;
    return;
  }

  treatmentsGrid.innerHTML = visibleTreatments
    .map((treatment) => renderTreatmentCard(treatment, patientById))
    .join("");
}

async function loadTreatments() {
  const [loadedPatients, loadedTreatments, loadedCatalog] = await Promise.all([
    DentalAPI.get("/api/patients"),
    DentalAPI.get("/api/patient-treatments"),
    DentalAPI.get("/api/treatment-catalog")
  ]);
  patients = loadedPatients;
  treatments = loadedTreatments;
  catalog = loadedCatalog;
  renderFormOptions();
  renderTreatmentList();
  document.querySelector("#treatmentProcedureCatalog").innerHTML = '<option value="">Personalizado</option>' + catalog
    .map((item) => `<option value="${item.id}">${DentalAPI.escapeHtml(item.name)} · ${DentalAPI.money(item.default_price)}</option>`).join("");

  catalogList.innerHTML = catalog
    .map((item) => `
      <button type="button" data-catalog-pick="${item.id}">
        <span class="treatment-catalog-main"><span class="treatment-icon" aria-hidden="true">${treatmentIcon(item)}</span><strong>${DentalAPI.escapeHtml(item.name)}</strong></span>
        <span>${DentalAPI.money(item.default_price)}</span>
      </button>
    `)
    .join("") || `<p class="empty-state">No hay procedimientos configurados.</p>`;
}

catalogList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-catalog-pick]");
  if (!button) return;
  newTreatmentCatalog.value = button.dataset.catalogPick;
  newTreatmentCatalog.dispatchEvent(new Event("change"));
  treatmentCreateDetails.open = true;
  newTreatmentForm.scrollIntoView({ behavior: "smooth", block: "start" });
  newTreatmentTitle.focus();
});

focusTreatmentForm.addEventListener("click", () => {
  treatmentCreateDetails.open = true;
  treatmentCreateDetails.scrollIntoView({ behavior: "smooth", block: "start" });
  newTreatmentPatient.focus();
});

treatmentSearch.addEventListener("input", renderTreatmentList);
treatmentFilter.addEventListener("change", renderTreatmentList);

newTreatmentCatalog.addEventListener("change", () => {
  const option = newTreatmentCatalog.selectedOptions[0];
  if (!option || !option.dataset.title) return;
  newTreatmentTitle.value = option.dataset.title;
  newTreatmentPrice.value = option.dataset.price || "";
});

newTreatmentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = cleanFormData(newTreatmentForm);
  const submitButton = newTreatmentForm.querySelector("button[type='submit']");
  newTreatmentStatus.textContent = "Guardando tratamiento…";
  submitButton.disabled = true;

  try {
    await DentalAPI.post("/api/patient-treatments", {
      ...data,
      patient_id: Number(data.patient_id),
      catalog_treatment_id: data.catalog_treatment_id ? Number(data.catalog_treatment_id) : null,
      estimated_price: data.estimated_price ? Number(data.estimated_price) : null,
      start_date: DentalAPI.localDateString()
    });
    newTreatmentStatus.textContent = "Tratamiento guardado.";
    newTreatmentForm.reset();
    submitButton.disabled = false;
    await loadTreatments();
  } catch (error) {
    newTreatmentStatus.textContent = error.message;
    submitButton.disabled = false;
  }
});

function addProcedureEditor(item = {}) {
  const row = document.createElement("div");
  row.className = "treatment-procedure-editor";
  row.innerHTML = `
    <label class="procedure-name">Procedimiento<input data-procedure-name maxlength="160" required value="${DentalAPI.escapeHtml(item.name || "")}" /></label>
    <label>Piezas<input data-procedure-teeth inputmode="numeric" placeholder="General" value="${DentalAPI.escapeHtml(item.tooth_code || "")}" /></label>
    <label>Valor $<input data-procedure-price type="number" min="0" max="1000000000" step="1" required value="${item.price ?? ""}" /></label>
    <label>Descuento<select data-procedure-discount-type><option value="amount"${item.discount_type !== "percent" ? " selected" : ""}>Valor $</option><option value="percent"${item.discount_type === "percent" ? " selected" : ""}>Porcentaje %</option></select></label>
    <label>Monto<input data-procedure-discount-value type="number" min="0" step="any" placeholder="0" value="${item.discount_value || ""}" /></label>
    <button class="text-button danger-action" type="button" data-remove-procedure>Quitar</button>`;
  row.dataset.catalogId = item.catalog_treatment_id || "";
  proceduresList.append(row);
  updateProceduresPreview();
  return row;
}

function collectProcedureEditors() {
  return [...proceduresList.querySelectorAll(".treatment-procedure-editor")].map((row) => ({
    name: row.querySelector("[data-procedure-name]").value.trim(),
    catalog_treatment_id: row.dataset.catalogId ? Number(row.dataset.catalogId) : null,
    tooth_code: row.querySelector("[data-procedure-teeth]").value.trim(),
    price: Number(row.querySelector("[data-procedure-price]").value),
    discount_type: row.querySelector("[data-procedure-discount-type]").value,
    discount_value: Number(row.querySelector("[data-procedure-discount-value]").value || 0)
  }));
}

function updateProceduresPreview() {
  let total = 0;
  for (const item of collectProcedureEditors()) {
    const discount = item.discount_type === "percent"
      ? Math.round(item.price * item.discount_value / 100) : item.discount_value;
    total += item.price - discount;
  }
  const totalType = proceduresForm.elements.total_discount_type.value;
  const totalValue = Number(proceduresForm.elements.total_discount_value.value || 0);
  const totalDiscount = totalType === "percent" ? Math.round(total * totalValue / 100) : totalValue;
  document.querySelector("#treatmentProceduresTotal").textContent = `Total: ${DentalAPI.money(Math.max(total - totalDiscount, 0))}`;
}

function openProceduresEditor(treatment) {
  editingProceduresId = treatment.id;
  proceduresForm.reset();
  proceduresList.innerHTML = "";
  const patient = patients.find((item) => Number(item.id) === Number(treatment.patient_id));
  document.querySelector("#treatmentProceduresTitle").textContent = treatment.title;
  document.querySelector("#treatmentProceduresPatient").textContent = patient ? DentalAPI.fullName(patient) : "";
  document.querySelector("#treatmentProceduresStatus").textContent = "";
  proceduresForm.elements.total_discount_type.value = treatment.total_discount_type || "amount";
  proceduresForm.elements.total_discount_value.value = treatment.total_discount_value || "";
  const items = treatmentProcedureItems(treatment);
  items.forEach(addProcedureEditor);
  if (!items.length && treatment.estimated_price != null) {
    addProcedureEditor({ name: treatment.title, tooth_code: treatment.tooth_code,
      price: treatment.estimated_price, discount_type: "amount",
      discount_value: Math.max(Number(treatment.estimated_price) - Number(treatment.final_price ?? treatment.estimated_price), 0) });
  }
  updateProceduresPreview();
  proceduresDialog.showModal();
}

document.querySelector("[data-close-procedures]").addEventListener("click", () => proceduresDialog.close());
document.querySelector("#addTreatmentProcedure").addEventListener("click", () => {
  const chosen = catalog.find((item) => String(item.id) === document.querySelector("#treatmentProcedureCatalog").value);
  const row = addProcedureEditor(chosen ? { name: chosen.name, catalog_treatment_id: chosen.id,
    price: chosen.default_price } : {});
  row.querySelector("[data-procedure-name]").focus();
});
proceduresList.addEventListener("input", updateProceduresPreview);
proceduresList.addEventListener("change", updateProceduresPreview);
proceduresList.addEventListener("click", (event) => {
  if (!event.target.closest("[data-remove-procedure]")) return;
  event.target.closest(".treatment-procedure-editor").remove();
  updateProceduresPreview();
});
proceduresForm.elements.total_discount_type.addEventListener("change", updateProceduresPreview);
proceduresForm.elements.total_discount_value.addEventListener("input", updateProceduresPreview);
proceduresForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.querySelector("#treatmentProceduresStatus");
  if (!proceduresList.children.length) return (status.textContent = "Agrega al menos un procedimiento.");
  const submit = proceduresForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  status.textContent = "Guardando presupuesto…";
  try {
    const health = await DentalAPI.get("/api/health");
    if (health.features?.itemized_treatments !== true) throw new Error("Cierra la aplicación desde la bandeja y vuelve a abrirla para actualizar el servidor.");
    await DentalAPI.put(`/api/patient-treatments/${editingProceduresId}/procedures`, {
      procedures: collectProcedureEditors(),
      total_discount_type: proceduresForm.elements.total_discount_type.value,
      total_discount_value: Number(proceduresForm.elements.total_discount_value.value || 0)
    });
    proceduresDialog.close();
    await loadTreatments();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

treatmentsGrid.addEventListener("click", async (event) => {
  const editProcedures = event.target.closest("[data-edit-procedures]");
  if (editProcedures) {
    const treatment = treatments.find((item) => Number(item.id) === Number(editProcedures.dataset.editProcedures));
    if (treatment) openProceduresEditor(treatment);
    return;
  }
  const button = event.target.closest("[data-save-treatment]");
  const completeButton = event.target.closest("[data-complete-treatment]");
  if (!button && !completeButton) return;
  const treatmentId = button?.dataset.saveTreatment || completeButton?.dataset.completeTreatment;
  const card = (button || completeButton).closest("[data-treatment-card]");
  const message = card.querySelector("[data-treatment-message]");

  (button || completeButton).disabled = true;
  message.textContent = "Guardando…";

  try {
    if (completeButton) {
      await DentalAPI.put(`/api/patient-treatments/${treatmentId}`, {
        status: "completed",
        end_date: DentalAPI.localDateString()
      });
    } else {
      const title = card.querySelector("[data-treatment-title]").value.trim();
      if (!title) throw new Error("El tratamiento necesita un nombre.");
      const itemized = treatmentProcedureItems(treatments.find((item) => Number(item.id) === Number(treatmentId)) || {}).length > 0;
      await DentalAPI.put(`/api/patient-treatments/${treatmentId}`, {
        title,
        ...(!itemized ? { tooth_code: card.querySelector("[data-treatment-tooth]").value || null,
          estimated_price: card.querySelector("[data-treatment-estimated]").value || null,
          final_price: card.querySelector("[data-treatment-final]").value || null } : {}),
        diagnosis: card.querySelector("[data-treatment-diagnosis]").value || null,
        plan_notes: card.querySelector("[data-treatment-plan]").value || null,
        status: card.querySelector("[data-treatment-status]").value,
        start_date: card.querySelector("[data-treatment-start]").value || null,
        end_date: card.querySelector("[data-treatment-end]").value || null
      });
    }
    message.textContent = "Cambios guardados.";
    await loadTreatments();
  } catch (error) {
    message.textContent = error.message;
    (button || completeButton).disabled = false;
  }
});

loadTreatments().catch((error) => {
  treatmentResultCount.textContent = "";
  treatmentsGrid.innerHTML = `<p class="empty-state">No se pudieron cargar los tratamientos: ${DentalAPI.escapeHtml(error.message)}</p>`;
});
