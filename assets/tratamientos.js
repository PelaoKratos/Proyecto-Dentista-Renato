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

  newTreatmentCatalog.innerHTML =
    `<option value="">Personalizado</option>` +
    catalog
      .map((item) => `<option value="${item.id}" data-title="${DentalAPI.escapeHtml(item.name)}" data-price="${Number(item.default_price || 0)}">${DentalAPI.escapeHtml(item.name)} · ${DentalAPI.money(item.default_price)}</option>`)
      .join("");
}

function treatmentIcon(item) {
  const value = String(item.category || item.name || "").toLowerCase();
  if (value.includes("endodon")) return "🩺";
  if (value.includes("cirug") || value.includes("implan")) return "⚕️";
  if (value.includes("restaur") || value.includes("empast")) return "🔧";
  if (value.includes("estet")) return "✨";
  if (value.includes("diagn")) return "📋";
  return "🦷";
}

function renderTreatmentCard(treatment, patientById) {
  const patient = patientById.get(treatment.patient_id);
  const patientName = patient ? DentalAPI.fullName(patient) : "Paciente";
  const toothLabel = treatment.tooth_code ? ` · Pieza ${DentalAPI.escapeHtml(treatment.tooth_code)}` : "";
  const canComplete = treatment.status !== "completed" && treatment.status !== "cancelled";
  const treatmentName = DentalAPI.escapeHtml(treatment.title || "Tratamiento sin nombre");
  const statusLabel = DentalAPI.escapeHtml(DentalAPI.statusLabel(treatment.status));

  return `
    <article class="treatment-card" data-treatment-card="${treatment.id}">
      <header class="treatment-card-header">
        <div class="treatment-card-main">
          <strong>${treatmentName}</strong>
          <p>${DentalAPI.escapeHtml(patientName)}${toothLabel}</p>
        </div>
        <span class="status-mark ${statusClass(treatment.status)}">${statusLabel}</span>
      </header>
      <div class="treatment-card-actions">
        <details class="treatment-edit-details">
          <summary>Editar</summary>
          <div class="editor-controls treatment-editor">
            <label class="treatment-form-wide">Nombre<input data-treatment-title value="${DentalAPI.escapeHtml(treatment.title || "")}" /></label>
            <label>Pieza<input data-treatment-tooth value="${DentalAPI.escapeHtml(treatment.tooth_code || "")}" /></label>
            <label>Estado<select data-treatment-status>${statusOptions(treatment.status)}</select></label>
            <label>Presupuesto<input data-treatment-estimated type="number" min="0" value="${DentalAPI.escapeHtml(treatment.estimated_price || "")}" /></label>
            <label>Valor final<input data-treatment-final type="number" min="0" value="${DentalAPI.escapeHtml(treatment.final_price || "")}" /></label>
            <label>Inicio<input data-treatment-start type="date" value="${DentalAPI.escapeHtml(treatment.start_date || "")}" /></label>
            <label>Término<input data-treatment-end type="date" value="${DentalAPI.escapeHtml(treatment.end_date || "")}" /></label>
            <label class="treatment-form-wide">Diagnóstico<textarea data-treatment-diagnosis>${DentalAPI.escapeHtml(treatment.diagnosis || "")}</textarea></label>
            <label class="treatment-form-wide">Plan clínico<textarea data-treatment-plan>${DentalAPI.escapeHtml(treatment.plan_notes || "")}</textarea></label>
          </div>
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

treatmentsGrid.addEventListener("click", async (event) => {
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
      await DentalAPI.put(`/api/patient-treatments/${treatmentId}`, {
        title,
        tooth_code: card.querySelector("[data-treatment-tooth]").value || null,
        diagnosis: card.querySelector("[data-treatment-diagnosis]").value || null,
        plan_notes: card.querySelector("[data-treatment-plan]").value || null,
        status: card.querySelector("[data-treatment-status]").value,
        estimated_price: card.querySelector("[data-treatment-estimated]").value || null,
        final_price: card.querySelector("[data-treatment-final]").value || null,
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
