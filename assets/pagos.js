const paymentsTable = document.querySelector("#paymentsTable");
const paymentForm = document.querySelector("#paymentForm");
const paymentPatient = document.querySelector("#paymentPatient");
const paymentTreatment = document.querySelector("#paymentTreatment");
const paymentStatus = document.querySelector("#paymentStatus");
const focusPaymentForm = document.querySelector("#focusPaymentForm");
const paymentMetrics = document.querySelectorAll("[data-payment-metric]");
const paymentStateFilter = document.querySelector("#paymentStateFilter");
const paymentDateFrom = document.querySelector("#paymentDateFrom");
const paymentDateTo = document.querySelector("#paymentDateTo");
const paymentPatientFilter = document.querySelector("#paymentPatientFilter");
const paymentTreatmentFilter = document.querySelector("#paymentTreatmentFilter");
const paymentResultsCount = document.querySelector("#paymentResultsCount");
const paginationContainers = [document.querySelector("#paymentsPaginationTop"), document.querySelector("#paymentsPaginationBottom")];
const paymentTreatmentBalance = document.querySelector("#paymentTreatmentBalance");
const paymentTreatmentBalanceNote = document.querySelector("#paymentTreatmentBalanceNote");
const paymentPatientBalance = document.querySelector("#paymentPatientBalance");

let patients = [];
let treatments = [];
let payments = [];
let paymentSummary = null, paymentPage = null, paymentQueryVersion = 0;
let selectedPaymentState = "";
let currentPaymentPage = 1;
let paymentView = "payments";
let paymentFormGuard = null;
const PAYMENT_PAGE_SIZE = 20;
const PAYMENT_PAGE_WINDOW = 5;
window.UnsavedEdits.register("payment-editor", {
  isDirty: () => Boolean(document.querySelector('[data-payment-row][data-unsaved-payment="true"]')),
  discard: () => renderPayments()
});

function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKey(dateValue) {
  return String(dateValue || "").slice(0, 7);
}

function patientBalance(patientId) {
  const treatmentTotal = treatments
    .filter((treatment) => Number(treatment.patient_id) === Number(patientId))
    .reduce((total, treatment) => total + Number(treatment.final_price ?? treatment.estimated_price ?? 0), 0);
  const paid = payments
    .filter((payment) => Number(payment.patient_id) === Number(patientId))
    .reduce((total, payment) => total + Number(payment.amount || 0), 0);
  return Math.max(treatmentTotal - paid, 0);
}

function treatmentTotal(treatment) {
  return Number(treatment?.final_price ?? treatment?.estimated_price ?? 0);
}

function treatmentPaid(treatmentId) {
  return payments
    .filter((payment) => Number(payment.patient_treatment_id) === Number(treatmentId))
    .reduce((total, payment) => total + Number(payment.amount || 0), 0);
}

function treatmentPending(treatment) {
  return Math.max(treatmentTotal(treatment) - treatmentPaid(treatment.id), 0);
}

function paymentState(treatment) {
  if (!treatment) return "unlinked";
  const total = treatmentTotal(treatment);
  const paid = treatmentPaid(treatment.id);
  if (total <= 0 && paid <= 0) return "pending";
  if (paid <= 0) return "pending";
  if (paid < total) return "partial";
  return "paid";
}

function paymentStateLabel(state) {
  const labels = {
    paid: "Pagado",
    partial: "Parcial",
    pending: "Pendiente",
    unlinked: "Sin tratamiento"
  };
  return labels[state] || "Pendiente";
}

function paymentStateClass(state) {
  if (state === "paid") return "success";
  if (state === "partial") return "warning";
  return "";
}

function distinctPaymentCount(items) {
  return new Set(items.map((payment) => payment.payment_batch_id || `single-${payment.id}`)).size;
}

function renderMetrics() {
  if (paymentSummary) {
    const metrics = paymentSummary.metrics;
    const byName = new Map([...paymentMetrics].map(item => [item.dataset.paymentMetric, item]));
    const update = (key, value, note) => { byName.get(key).querySelector("strong").textContent = value; byName.get(key).querySelector("small").textContent = note; };
    update("month", DentalAPI.money(metrics.month_total), `${metrics.month_count} pagos registrados`);
    update("pending", DentalAPI.money(metrics.pending_total), `${metrics.patients_with_balance} pacientes con saldo`);
    update("method", `${metrics.transfer_percent}%`, "Pagos por transferencia");
    update("today", DentalAPI.money(metrics.today_total), `${metrics.today_count} abonos recibidos`);
    return;
  }
  const now = new Date();
  const today = localDateString(now);
  const currentMonth = monthKey(today);
  const monthPayments = payments.filter((payment) => monthKey(payment.payment_date) === currentMonth);
  const todayPayments = payments.filter((payment) => payment.payment_date === today);
  const monthTotal = monthPayments.reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const todayTotal = todayPayments.reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const pendingTotal = patients.reduce((total, patient) => total + patientBalance(patient.id), 0);
  const transfers = payments.filter((payment) => normalize(payment.method).includes("transfer")).length;
  const transferPercent = payments.length ? Math.round((transfers / payments.length) * 100) : 0;

  const metricByName = new Map(Array.from(paymentMetrics).map((metric) => [metric.dataset.paymentMetric, metric]));
  metricByName.get("month").querySelector("strong").textContent = DentalAPI.money(monthTotal);
  metricByName.get("month").querySelector("small").textContent = `${distinctPaymentCount(monthPayments)} pagos registrados`;
  metricByName.get("pending").querySelector("strong").textContent = DentalAPI.money(pendingTotal);
  metricByName.get("pending").querySelector("small").textContent = `${patients.filter((patient) => patientBalance(patient.id) > 0).length} pacientes con saldo`;
  metricByName.get("method").querySelector("strong").textContent = `${transferPercent}%`;
  metricByName.get("method").querySelector("small").textContent = "Pagos por transferencia";
  metricByName.get("today").querySelector("strong").textContent = DentalAPI.money(todayTotal);
  metricByName.get("today").querySelector("small").textContent = `${distinctPaymentCount(todayPayments)} abonos recibidos`;
}

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function renderTreatmentsForPatient() {
  const patientId = Number(paymentPatient.value);
  const options = treatments.filter((treatment) => Number(treatment.patient_id) === Number(patientId));
  paymentTreatment.innerHTML =
    options.map((treatment) => `<option value="${treatment.id}">${DentalAPI.escapeHtml(treatment.title)} - saldo ${DentalAPI.money(treatmentPending(treatment))}</option>`).join("") ||
    `<option value="">Sin tratamiento asociado</option>`;
  updatePaymentAmountSuggestion();
}

function renderPaymentBalances() {
  const patientId = Number(paymentPatient.value);
  const treatment = treatments.find((item) => Number(item.id) === Number(paymentTreatment.value));
  const patientDue = patientId ? patientBalance(patientId) : 0;

  const single = paymentAllocation.getMode() === "single";
  paymentTreatmentBalance.textContent = DentalAPI.money(single ? (treatment ? treatmentPending(treatment) : 0) : paymentAllocation.selectedDue());
  paymentTreatmentBalanceNote.textContent = single
    ? (treatment ? `Total ${DentalAPI.money(treatmentTotal(treatment))} · abonado ${DentalAPI.money(treatmentPaid(treatment.id))}` : "Selecciona un tratamiento")
    : `${paymentAllocation.selectedCount()} tratamientos seleccionados`;
  paymentPatientBalance.textContent = DentalAPI.money(patientDue);
}

function updatePaymentAmountSuggestion() {
  const treatment = treatments.find((item) => Number(item.id) === Number(paymentTreatment.value));
  const amountInput = paymentForm.querySelector("input[name='amount']");
  amountInput.value = "";
  amountInput.max = String(treatment ? treatmentPending(treatment) : patientBalance(paymentPatient.value));
  renderPaymentBalances();
  paymentAllocation.refresh();
}

const paymentAllocation = PaymentAllocation.create(paymentForm, {
  getTreatments: () => treatments,
  getPayments: () => payments,
  getPatientId: () => Number(paymentPatient.value),
  onChange: renderPaymentBalances
});

function renderPaymentFilters() {
  const previousPatient = paymentPatientFilter.value;
  const previousTreatment = paymentTreatmentFilter.value;
  const patientById = new Map(patients.map((patient) => [Number(patient.id), patient]));
  const patientOptions = [...patients]
    .sort((a, b) => DentalAPI.fullName(a).localeCompare(DentalAPI.fullName(b), "es"))
    .map((patient) => `<option value="${patient.id}">${DentalAPI.escapeHtml(DentalAPI.fullName(patient))}</option>`)
    .join("");
  paymentPatientFilter.innerHTML = `<option value="">Todos</option>${patientOptions}`;
  if ([...paymentPatientFilter.options].some((option) => option.value === previousPatient)) {
    paymentPatientFilter.value = previousPatient;
  }

  const treatmentOptions = [...treatments]
    .sort((a, b) => {
      const patientA = DentalAPI.fullName(patientById.get(Number(a.patient_id)) || {});
      const patientB = DentalAPI.fullName(patientById.get(Number(b.patient_id)) || {});
      return patientA.localeCompare(patientB, "es") || String(a.title).localeCompare(String(b.title), "es");
    })
    .map((treatment) => {
      const patientName = DentalAPI.fullName(patientById.get(Number(treatment.patient_id)) || {});
      const tooth = treatment.tooth_code ? ` · Piezas ${treatment.tooth_code} (${treatment.dentition_type === "child" ? "infantil" : "adulto"})` : "";
      const label = [patientName, treatment.title + tooth].filter(Boolean).join(" · ");
      return `<option value="${treatment.id}">${DentalAPI.escapeHtml(label)}</option>`;
    })
    .join("");
  paymentTreatmentFilter.innerHTML = `<option value="all">Todos</option><option value="none">Sin tratamiento</option>${treatmentOptions}`;
  if ([...paymentTreatmentFilter.options].some((option) => option.value === previousTreatment)) {
    paymentTreatmentFilter.value = previousTreatment;
  }
}

function filteredPayments() {
  if (paymentSummary) return paymentPage?.items || [];
  const treatmentById = new Map(treatments.map((treatment) => [Number(treatment.id), treatment]));
  const from = paymentDateFrom.value;
  const through = paymentDateTo.value;
  const unpaidTreatments = treatments
    .filter((treatment) => treatmentPending(treatment) > 0)
    .map((treatment) => ({
      id: `pending-${treatment.id}`,
      kind: "pending",
      patient_id: Number(treatment.patient_id),
      patient_treatment_id: Number(treatment.id),
      amount: treatmentPending(treatment),
      payment_date: treatment.start_date || treatment.created_at || ""
    }));

  return (paymentView === "balances" ? unpaidTreatments : payments.map((payment) => ({ ...payment, kind: "payment" })))
    .filter((item) => {
      const treatment = treatmentById.get(Number(item.patient_treatment_id));
      const state = paymentState(treatment);
      const date = String(item.payment_date || "").slice(0, 10);
      if (selectedPaymentState && state !== selectedPaymentState) return false;
      if (from && (!date || date < from)) return false;
      if (through && (!date || date > through)) return false;
      if (paymentPatientFilter.value && Number(item.patient_id) !== Number(paymentPatientFilter.value)) return false;
      if (paymentTreatmentFilter.value === "none" && item.patient_treatment_id) return false;
      if (paymentTreatmentFilter.value !== "all" && paymentTreatmentFilter.value !== "none" && Number(item.patient_treatment_id) !== Number(paymentTreatmentFilter.value)) return false;
      return true;
    })
    .sort((a, b) => String(b.payment_date || "").localeCompare(String(a.payment_date || "")) || Number(b.id || 0) - Number(a.id || 0));
}

function paginationMarkup(totalPages, page) {
  const firstPage = Math.max(1, Math.min(page - Math.floor(PAYMENT_PAGE_WINDOW / 2), totalPages - PAYMENT_PAGE_WINDOW + 1));
  const lastPage = Math.min(totalPages, firstPage + PAYMENT_PAGE_WINDOW - 1);
  const pages = [];
  for (let number = firstPage; number <= lastPage; number += 1) {
    pages.push(`<button class="payment-page-button" type="button" data-payment-page="${number}" aria-label="Pagina ${number}" ${number === page ? 'aria-current="page"' : ""}>${number}</button>`);
  }
  return `<button class="payment-page-button" type="button" data-payment-page="${Math.max(1, page - 1)}" aria-label="Pagina anterior" ${page === 1 ? "disabled" : ""}>‹ Anterior</button>${pages.join("")}<button class="payment-page-button" type="button" data-payment-page="${Math.min(totalPages, page + 1)}" aria-label="Pagina siguiente" ${page === totalPages ? "disabled" : ""}>Siguiente ›</button>`;
}

function renderPagination(totalPages) {
  const markup = totalPages > 1 ? paginationMarkup(totalPages, currentPaymentPage) : "";
  paginationContainers.forEach((container) => {
    container.innerHTML = markup;
    container.hidden = totalPages <= 1;
  });
}

function renderPayments() {
  document.querySelectorAll("[data-payment-view]").forEach((button) => {
    const active = button.dataset.paymentView === paymentView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelector("#paymentHistoryTitle").textContent = paymentView === "balances" ? "Saldos pendientes" : "Abonos registrados";
  document.querySelector("#paymentViewHelp").textContent = paymentView === "balances"
    ? "Una fila por tratamiento con deuda. El filtro de fecha corresponde al inicio del tratamiento."
    : "Cada fila corresponde a un abono recibido. El saldo mostrado es el saldo actual del tratamiento.";
  const patientById = new Map(patients.map((patient) => [Number(patient.id), patient]));
  const treatmentById = new Map(treatments.map((treatment) => [Number(treatment.id), treatment]));
  const filtered = filteredPayments();
  const total = paymentSummary ? paymentPage?.total || 0 : filtered.length;
  const totalPages = paymentSummary ? paymentPage?.total_pages || 1 : Math.max(1, Math.ceil(total / PAYMENT_PAGE_SIZE));
  currentPaymentPage = Math.min(currentPaymentPage, totalPages);
  const start = (currentPaymentPage - 1) * PAYMENT_PAGE_SIZE;
  const visiblePayments = paymentSummary ? filtered : filtered.slice(start, start + PAYMENT_PAGE_SIZE);

  paymentResultsCount.textContent = total
    ? `Mostrando ${start + 1}–${Math.min(start + PAYMENT_PAGE_SIZE, total)} de ${total} ${paymentView === "balances" ? "tratamientos" : "abonos"} · Página ${currentPaymentPage} de ${totalPages}`
    : `0 ${paymentView === "balances" ? "tratamientos" : "abonos"} para los filtros seleccionados.`;
  renderPagination(totalPages);

  paymentsTable.innerHTML = `
    <div class="records-row payment-records-row records-head"><span>${paymentView === "balances" ? "Inicio" : "Fecha"}</span><span>Paciente</span><span>Tratamiento</span><span>${paymentView === "balances" ? "Presupuesto" : "Abono"}</span><span>${paymentView === "balances" ? "Abonado" : "Método"}</span><span>Saldo pendiente</span><span>Acciones</span></div>
    ${
      visiblePayments
        .map((payment) => {
          const patient = patientById.get(Number(payment.patient_id));
          const treatment = treatmentById.get(Number(payment.patient_treatment_id));
          const state = payment.kind === "pending" ? "pending" : paymentState(treatment);
          if (payment.kind === "pending") {
            return `
              <div class="records-row payment-records-row pending-payment-row" data-pending-treatment="${treatment.id}">
                <span>${DentalAPI.date(payment.payment_date)}</span>
                <span>${DentalAPI.patientLink(patient?.id, patient ? DentalAPI.fullName(patient) : "Paciente")}</span>
                <span><strong>${DentalAPI.escapeHtml(treatment.title)}</strong><small><mark class="warning">${treatmentPaid(treatment.id) > 0 ? "Parcial" : "Pendiente"}</mark></small></span>
                <span>${DentalAPI.money(treatmentTotal(treatment))}</span>
                <span>${DentalAPI.money(treatmentPaid(treatment.id))}</span>
                <span>${DentalAPI.money(payment.amount)}</span>
                <span class="inline-actions"><button class="text-button primary-action" type="button" data-register-pending="${treatment.id}">Registrar abono</button></span>
                ${ProcedurePayments.render(treatment, payments, { editable: false })}
              </div>
            `;
          }
          return `
            <div class="records-row payment-records-row" data-payment-row="${payment.id}">
              <span>${DentalAPI.date(payment.payment_date)}</span>
              <span>${DentalAPI.patientLink(patient?.id, patient ? DentalAPI.fullName(patient) : "Paciente")}</span>
              <span><strong>${DentalAPI.escapeHtml(treatment?.title || "Sin tratamiento")}</strong><small><mark class="${paymentStateClass(state)}">${DentalAPI.escapeHtml(paymentStateLabel(state))}</mark>${payment.payment_batch_id ? " · Pago compartido" : ""}</small></span>
              <span><span data-payment-readonly>${DentalAPI.money(payment.amount)}</span>
                <input class="inline-input" data-payment-amount type="number" min="1" value="${DentalAPI.escapeHtml(payment.amount || "")}" aria-label="Monto pago" hidden disabled /></span>
              <span>
                <span data-payment-readonly>${DentalAPI.escapeHtml(payment.method || "—")}</span>
                <select class="inline-input" data-payment-method aria-label="Metodo pago" hidden disabled>
                  ${["Transferencia", "Tarjeta", "Efectivo", "Otro"].map((method) => `<option ${method === payment.method ? "selected" : ""}>${method}</option>`).join("")}
                </select>
              </span>
              <span>${treatment ? DentalAPI.money(treatmentPending(treatment)) : "-"}</span>
              <span class="inline-actions">
                <button class="text-button" type="button" data-edit-payment="${payment.id}">Editar</button><button class="text-button" type="button" data-cancel-payment-edit hidden>Cancelar</button>
                <button class="text-button" type="button" data-save-payment="${payment.id}" hidden>Guardar</button>
                <small class="form-status" data-payment-message="${payment.id}" aria-live="polite"></small>
              </span>
              ${ProcedurePayments.paymentSummary(payment, treatment)}
            </div>
          `;
        })
        .join("") || `<p class="empty-state">No hay pagos para los filtros seleccionados.</p>`
    }
  `;
  paymentsTable.querySelectorAll("[data-payment-row]").forEach((row) => {
    row.dataset.originalAmount = row.querySelector("[data-payment-amount]").value;
    row.dataset.originalMethod = row.querySelector("[data-payment-method]").value;
    row.dataset.unsavedPayment = "false";
  });
}

function acceptPaymentFilterChange(filter) {
  if (!window.UnsavedEdits.confirmDiscard({ only: "payment-editor" })) {
    filter.value = filter.dataset.appliedValue || "";
    return false;
  }
  filter.dataset.appliedValue = filter.value;
  return true;
}

function historyPayments() { return paymentSummary ? paymentPage?.items || [] : payments; }
async function refreshPaymentHistory() {
  if (!paymentSummary) { renderPayments(); return; }
  const version = ++paymentQueryVersion;
  const query = new URLSearchParams({ page: currentPaymentPage, page_size: PAYMENT_PAGE_SIZE, view: paymentView });
  if (selectedPaymentState) query.set("state", selectedPaymentState);
  if (paymentDateFrom.value) query.set("date_from", paymentDateFrom.value);
  if (paymentDateTo.value) query.set("date_to", paymentDateTo.value);
  if (paymentPatientFilter.value) query.set("patient_id", paymentPatientFilter.value);
  if (!["all", ""].includes(paymentTreatmentFilter.value)) query.set("patient_treatment_id", paymentTreatmentFilter.value);
  paymentsTable.setAttribute("aria-busy", "true");
  paymentsTable.querySelectorAll("button").forEach(button => { button.disabled = true; });
  paginationContainers.forEach(container => container.querySelectorAll("button").forEach(button => { button.disabled = true; }));
  try {
    const result = await DentalAPI.get(`/api/payments?${query}`);
    if (version !== paymentQueryVersion) return;
    if (!Array.isArray(result.items)) throw new Error("Reinicia la aplicación para actualizar el servidor de pagos.");
    paymentPage = result; currentPaymentPage = result.page; renderPayments();
  } catch (error) {
    if (version === paymentQueryVersion) {
      paymentResultsCount.textContent = error.message;
      paymentsTable.innerHTML = '<p class="empty-state">No se pudo cargar esta consulta. Cambia un filtro para reintentar.</p>';
      paginationContainers.forEach(container => { container.hidden = true; });
    }
  } finally { if (version === paymentQueryVersion) paymentsTable.setAttribute("aria-busy", "false"); }
}

async function loadPagos() {
  const [loadedPatients, loadedTreatments, loadedPayments] = await Promise.all([
    DentalAPI.get("/api/patients"),
    DentalAPI.get("/api/patient-treatments"),
    DentalAPI.get(`/api/payments?summary=1&date=${localDateString()}`)
  ]);
  patients = loadedPatients;
  treatments = loadedTreatments;
  // Compatibility with a previously running server; current versions return aggregates.
  paymentSummary = Array.isArray(loadedPayments) ? null : loadedPayments;
  payments = paymentSummary ? paymentSummary.ledger : loadedPayments;
  paymentPatient.innerHTML = '<option value="">Seleccionar paciente...</option>' + [...patients]
    .sort((a,b) => DentalAPI.fullName(a).localeCompare(DentalAPI.fullName(b), "es"))
    .map((patient) => `<option value="${patient.id}">${DentalAPI.escapeHtml(DentalAPI.fullName(patient))}${patient.rut ? ` · ${DentalAPI.escapeHtml(patient.rut)}` : ""}</option>`)
    .join("");
  renderTreatmentsForPatient();
  renderMetrics();
  renderPaymentFilters();
  await refreshPaymentHistory();
  if (!paymentFormGuard) paymentFormGuard = window.UnsavedEdits.trackForm(paymentForm, {
    extra: () => paymentAllocation.getMode(),
    discard: () => { paymentForm.reset(); paymentAllocation.setMode("single"); renderTreatmentsForPatient(); }
  });
  else paymentFormGuard.markClean();
  [paymentStateFilter, paymentDateFrom, paymentDateTo, paymentPatientFilter, paymentTreatmentFilter].forEach((filter) => {
    filter.dataset.appliedValue = filter.value;
  });
}

paymentPatient.addEventListener("change", renderTreatmentsForPatient);
document.querySelector("#payTreatmentBalance").addEventListener("click", () => {
  const treatment = treatments.find((item) => Number(item.id) === Number(paymentTreatment.value));
  if (!paymentPatient.value || !treatment) { paymentStatus.textContent = "Selecciona al paciente y su tratamiento."; return; }
  paymentForm.elements.amount.value = treatmentPending(treatment) || "";
  paymentForm.elements.amount.dispatchEvent(new Event("input", { bubbles: true }));
});
paymentTreatment.addEventListener("change", updatePaymentAmountSuggestion);
document.querySelectorAll("[data-payment-view]").forEach((button) => button.addEventListener("click", () => {
  if (!window.UnsavedEdits.confirmDiscard({ only: "payment-editor" })) return;
  paymentView = button.dataset.paymentView;
  selectedPaymentState = ""; paymentStateFilter.value = ""; paymentStateFilter.dataset.appliedValue = "";
  currentPaymentPage = 1; refreshPaymentHistory();
}));
document.querySelectorAll("[data-payment-dates]").forEach((button) => button.addEventListener("click", () => {
  if (!window.UnsavedEdits.confirmDiscard({ only: "payment-editor" })) return;
  const today = localDateString();
  const mode = button.dataset.paymentDates;
  paymentDateFrom.value = mode === "today" ? today : mode === "month" ? today.slice(0, 7) + "-01" : "";
  paymentDateTo.value = mode === "clear" ? "" : today;
  if (mode === "clear") {
    paymentStateFilter.value = ""; selectedPaymentState = "";
    paymentPatientFilter.value = ""; paymentTreatmentFilter.value = "all";
  }
  [paymentDateFrom, paymentDateTo, paymentStateFilter, paymentPatientFilter, paymentTreatmentFilter].forEach((filter) => { filter.dataset.appliedValue = filter.value; });
  currentPaymentPage = 1; refreshPaymentHistory();
}));

paymentStateFilter.addEventListener("change", () => {
  if (!acceptPaymentFilterChange(paymentStateFilter)) return;
  selectedPaymentState = paymentStateFilter.value;
  if (selectedPaymentState === "pending") paymentView = "balances";
  if (selectedPaymentState === "paid") paymentView = "payments";
  currentPaymentPage = 1;
  refreshPaymentHistory();
});

[paymentDateFrom, paymentDateTo, paymentPatientFilter, paymentTreatmentFilter].forEach((filter) => {
  filter.addEventListener("change", () => {
    if (!acceptPaymentFilterChange(filter)) return;
    currentPaymentPage = 1;
    refreshPaymentHistory();
  });
});

paginationContainers.forEach((container) => {
  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-payment-page]");
    if (!button || button.disabled) return;
    if (!window.UnsavedEdits.confirmDiscard({ only: "payment-editor" })) return;
    currentPaymentPage = Number(button.dataset.paymentPage);
    refreshPaymentHistory();
  });
});

focusPaymentForm.addEventListener("click", () => {
  paymentForm.scrollIntoView({ behavior: "smooth", block: "start" });
  paymentForm.querySelector("select").focus();
});

paymentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!window.UnsavedEdits.confirmDiscard({ only: "payment-editor" })) return;
  if (paymentForm.querySelector("button[type='submit']").disabled) return;
  paymentFormGuard.setBusy(true);
  const formData = new FormData(paymentForm);
  const submitButton = paymentForm.querySelector("button[type='submit']");
  paymentStatus.textContent = "Guardando pago...";
  submitButton.disabled = true;

  try {
    const common = {
      patient_id: Number(formData.get("patient_id")),
      payment_date: DentalAPI.localDateString(),
      method: formData.get("method"),
      notes: String(formData.get("notes") || "").trim()
    };
    if (paymentAllocation.getMode() === "single") {
      await DentalAPI.post("/api/payments", {
        ...common,
        patient_treatment_id: Number(formData.get("patient_treatment_id")) || null,
        procedure_allocations: paymentAllocation.singleParts(),
        amount: Number(formData.get("amount"))
      });
    } else {
      const allocations = paymentAllocation.allocations();
      const patientDue = patientBalance(common.patient_id);
      if (paymentAllocation.total() > patientDue) throw new Error("El total supera el saldo pendiente del paciente.");
      await DentalAPI.post("/api/payments/batch", { ...common, allocations });
    }
    paymentStatus.textContent = "Pago guardado.";
    paymentFormGuard.setBusy(false); paymentFormGuard.markClean();
    paymentForm.reset();
    paymentAllocation.setMode("single");
    paymentForm.querySelector(".payment-notes-details").open = false;
    await loadPagos();
    submitButton.disabled = false;
  } catch (error) {
    paymentStatus.textContent = error.message;
    submitButton.disabled = false;
  } finally { paymentFormGuard.setBusy(false); }
});

paymentsTable.addEventListener("click", async (event) => {
  const registerButton = event.target.closest("[data-register-pending]");
  if (registerButton) {
    if (!window.UnsavedEdits.confirmDiscard()) return;
    const treatment = treatments.find((item) => Number(item.id) === Number(registerButton.dataset.registerPending));
    if (!treatment) return;
    paymentPatient.value = String(treatment.patient_id);
    renderTreatmentsForPatient();
    paymentTreatment.value = String(treatment.id);
    updatePaymentAmountSuggestion();
    paymentForm.scrollIntoView({ behavior: "smooth", block: "start" });
    paymentForm.querySelector("input[name='amount']").focus();
    return;
  }
  const editButton = event.target.closest("[data-edit-payment]");
  if (editButton) {
    if (window.UnsavedEdits.hasChanges({ only: "payment-editor" })) {
      editButton.closest("[data-payment-row]").querySelector("[data-payment-message]").textContent = "Guarda o cancela el otro pago antes de editar este.";
      return;
    }
    const row = editButton.closest("[data-payment-row]");
    const payment = historyPayments().find((item) => Number(item.id) === Number(row.dataset.paymentRow));
    const treatment = treatments.find((item) => Number(item.id) === Number(payment.patient_treatment_id));
    editButton.disabled = true;
    let related;
    try {
      related = paymentSummary && treatment ? await DentalAPI.get(`/api/payments?patient_treatment_id=${treatment.id}`) : payments;
    } catch (error) { row.querySelector("[data-payment-message]").textContent = error.message; editButton.disabled = false; return; }
    if (!row.isConnected) return;
    editButton.disabled = false;
    const editor = document.createElement("div");
    editor.dataset.paymentProcedureEdit = "";
    editor.innerHTML = ProcedurePayments.render(treatment, related.filter((item) => Number(item.id) !== Number(payment.id)), {
      initial: ProcedurePayments.parse(payment.procedure_allocations_json)
    });
    row.append(editor);
    ProcedurePayments.update(editor, Number(payment.amount));
    row.querySelectorAll("[data-payment-readonly]").forEach((item) => { item.hidden = true; });
    row.querySelectorAll("[data-payment-amount], [data-payment-method]").forEach((item) => { item.hidden = false; item.disabled = false; });
    row.querySelector("[data-save-payment]").hidden = false;
    row.querySelector("[data-cancel-payment-edit]").hidden = false;
    editButton.hidden = true;
    row.querySelector("[data-payment-amount]").focus();
    return;
  }
  if (event.target.closest("[data-cancel-payment-edit]")) {
    if (!window.UnsavedEdits.confirmDiscard({ only: "payment-editor" })) return;
    renderPayments();
    return;
  }
  const button = event.target.closest("[data-save-payment]");
  if (!button) return;
  if (!paymentFormGuard.confirmDiscard()) return;
  const paymentId = button.dataset.savePayment;
  const row = button.closest("[data-payment-row]");
  const message = row.querySelector("[data-payment-message]");

  if ([...paymentsTable.querySelectorAll('[data-payment-row][data-unsaved-payment="true"]')].some((other) => other !== row)) {
    message.textContent = "Guarda o cancela los otros pagos modificados antes de continuar.";
    return;
  }

  button.disabled = true;
  message.textContent = "Guardando...";

  try {
    await DentalAPI.put(`/api/payments/${paymentId}`, {
      amount: Number(row.querySelector("[data-payment-amount]").value || 0),
      procedure_allocations: ProcedurePayments.read(row, Number(row.querySelector("[data-payment-amount]").value || 0)),
      method: row.querySelector("[data-payment-method]").value
    });
    message.textContent = "Pago actualizado.";
    row.dataset.unsavedPayment = "false";
    await loadPagos();
  } catch (error) {
    message.textContent = error.message;
    button.disabled = false;
  }
});

function updatePaymentDirty(event) {
  const row = event.target.closest("[data-payment-row]");
  if (!row) return;
  const payment = historyPayments().find((item) => Number(item.id) === Number(row.dataset.paymentRow));
  let partsChanged = false;
  try {
    partsChanged = JSON.stringify(ProcedurePayments.read(row, Number(row.querySelector("[data-payment-amount]").value || 0))) !== JSON.stringify(ProcedurePayments.parse(payment.procedure_allocations_json));
  } catch { partsChanged = true; }
  ProcedurePayments.update(row, Number(row.querySelector("[data-payment-amount]").value || 0));
  row.dataset.unsavedPayment = String(
    partsChanged ||
    row.querySelector("[data-payment-amount]").value !== row.dataset.originalAmount ||
    row.querySelector("[data-payment-method]").value !== row.dataset.originalMethod
  );
}
paymentsTable.addEventListener("input", updatePaymentDirty);
paymentsTable.addEventListener("change", updatePaymentDirty);

loadPagos().catch((error) => {
  paymentsTable.innerHTML = `<p class="empty-state">No se pudieron cargar pagos: ${DentalAPI.escapeHtml(error.message)}</p>`;
});
