const treatmentsGrid = document.querySelector("#treatmentsGrid");
const catalogList = document.querySelector("#catalogList");
const focusTreatmentForm = document.querySelector("#focusTreatmentForm");
const treatmentSearch = document.querySelector("#treatmentSearch");
const treatmentFilter = document.querySelector("#treatmentFilter");
const treatmentResultCount = document.querySelector("#treatmentResultCount");
let patients = [], catalog = [], treatments = [];
function statusClass(status) { return ({ planned: "planned", in_progress: "in-progress", completed: "completed", cancelled: "cancelled" })[status] || "planned"; }

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
  const procedures = treatmentProcedureItems(treatment);
  const missingBudget = treatment.estimated_price == null && treatment.final_price == null;
  return `<article class="treatment-card" data-treatment-card="${treatment.id}">
    <header class="treatment-card-header"><div class="treatment-card-main"><strong>${DentalAPI.escapeHtml(treatment.title || "Tratamiento sin nombre")}</strong>
    <p>${patient ? DentalAPI.patientLink(patient.id, DentalAPI.fullName(patient)) : "Paciente"} · ${DentalAPI.escapeHtml(treatment.tooth_code ? `Piezas ${treatment.tooth_code}` : "General")}</p></div><span class="status-mark ${statusClass(treatment.status)}">${DentalAPI.escapeHtml(DentalAPI.statusLabel(treatment.status))}</span></header>
    <div class="treatment-card-summary"><span>Presupuesto <strong>${missingBudget ? "Pendiente de ingresar" : DentalAPI.money(treatment.final_price ?? treatment.estimated_price)}</strong></span><span>${procedures.length} procedimientos</span>${treatment.start_date ? `<span>Inicio ${DentalAPI.date(treatment.start_date)}</span>` : ""}</div>
    ${procedures.length || treatment.diagnosis || treatment.plan_notes ? `<details class="treatment-card-details"><summary>Ver procedimientos y notas</summary><div class="patient-procedure-breakdown"><ul>${procedures.map((item) => `<li><span>${DentalAPI.escapeHtml(item.name)}<small>${DentalAPI.escapeHtml(item.tooth_code ? `Piezas ${item.tooth_code}` : "General")}${Number(item.discount_value || 0) ? ` · Descuento ${DentalAPI.escapeHtml(item.discount_type === "percent" ? `${item.discount_value}%` : DentalAPI.money(item.discount_value))}` : ""}</small></span><b>${DentalAPI.money(Math.max(Number(item.price) - (item.discount_type === "percent" ? Math.round(Number(item.price) * Number(item.discount_value || 0) / 100) : Number(item.discount_value || 0)), 0))}</b></li>`).join("")}</ul>${Number(treatment.total_discount_value || 0) ? `<small>Descuento general: ${DentalAPI.escapeHtml(treatment.total_discount_type === "percent" ? `${treatment.total_discount_value}%` : DentalAPI.money(treatment.total_discount_value))}</small>` : ""}${treatment.diagnosis ? `<p>${DentalAPI.escapeHtml(treatment.diagnosis)}</p>` : ""}${treatment.plan_notes ? `<p>${DentalAPI.escapeHtml(treatment.plan_notes)}</p>` : ""}</div></details>` : ""}
    <div class="treatment-card-actions"><button class="text-button" type="button" data-edit-treatment="${treatment.id}">Editar tratamiento</button>
    ${!["completed", "cancelled"].includes(treatment.status) ? `<button class="text-button treatment-finish-button" type="button" data-complete-treatment="${treatment.id}">Finalizar</button>` : ""}<a class="text-button link-button" href="./paciente.html?id=${treatment.patient_id}">Abrir ficha</a></div>
    <p class="form-status" data-treatment-message="${treatment.id}" role="status"></p></article>`;
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
  AppointmentBooking.open({ treatmentOnly: true, catalogId: Number(button.dataset.catalogPick) });
});

focusTreatmentForm.addEventListener("click", () => {
  AppointmentBooking.open({ treatmentOnly: true });
});
document.addEventListener("dental:booking-saved", () => loadTreatments());
document.addEventListener("dental:treatment-saved", () => loadTreatments());
treatmentSearch.addEventListener("input", renderTreatmentList);
treatmentFilter.addEventListener("change", renderTreatmentList);

treatmentsGrid.addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-treatment]");
  if (edit) {
    const treatment = treatments.find((item) => Number(item.id) === Number(edit.dataset.editTreatment));
    if (treatment) TreatmentEditor.open({ treatment, patient: patients.find((item) => Number(item.id) === Number(treatment.patient_id)), catalog });
    return;
  }
  const finish = event.target.closest("[data-complete-treatment]");
  if (!finish) return;
  const message = finish.closest("[data-treatment-card]").querySelector(".form-status");
  finish.disabled = true;
  try {
    await DentalAPI.put(`/api/patient-treatments/${finish.dataset.completeTreatment}`, { status: "completed", end_date: DentalAPI.localDateString() });
    await loadTreatments();
  } catch (error) { message.textContent = error.message; finish.disabled = false; }
});

loadTreatments().catch((error) => {
  treatmentResultCount.textContent = "";
  treatmentsGrid.innerHTML = `<p class="empty-state">No se pudieron cargar los tratamientos: ${DentalAPI.escapeHtml(error.message)}</p>`;
});
