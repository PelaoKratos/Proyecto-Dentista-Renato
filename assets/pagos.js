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
let selectedPaymentState = "";
let currentPaymentPage = 1;
const PAYMENT_PAGE_SIZE = 20;
const PAYMENT_PAGE_WINDOW = 5;

function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKey(dateValue) {
  return String(dateValue || "").slice(0, 7);
}

function patientBalance(patientId) {
  const treatmentTotal = treatments
    .filter((treatment) => Number(treatment.patient_id) === Number(patientId))
    .reduce((total, treatment) => total + Number(treatment.final_price || treatment.estimated_price || 0), 0);
  const paid = payments
    .filter((payment) => Number(payment.patient_id) === Number(patientId))
    .reduce((total, payment) => total + Number(payment.amount || 0), 0);
  return Math.max(treatmentTotal - paid, 0);
}

function treatmentTotal(treatment) {
  return Number(treatment?.final_price || treatment?.estimated_price || 0);
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

function renderMetrics() {
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
  metricByName.get("month").querySelector("small").textContent = `${monthPayments.length} pagos registrados`;
  metricByName.get("pending").querySelector("strong").textContent = DentalAPI.money(pendingTotal);
  metricByName.get("pending").querySelector("small").textContent = `${patients.filter((patient) => patientBalance(patient.id) > 0).length} pacientes con saldo`;
  metricByName.get("method").querySelector("strong").textContent = `${transferPercent}%`;
  metricByName.get("method").querySelector("small").textContent = "Pagos por transferencia";
  metricByName.get("today").querySelector("strong").textContent = DentalAPI.money(todayTotal);
  metricByName.get("today").querySelector("small").textContent = `${todayPayments.length} abonos recibidos`;
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

  paymentTreatmentBalance.textContent = DentalAPI.money(treatment ? treatmentPending(treatment) : 0);
  paymentTreatmentBalanceNote.textContent = treatment
    ? `Total ${DentalAPI.money(treatmentTotal(treatment))} · abonado ${DentalAPI.money(treatmentPaid(treatment.id))}`
    : "Selecciona un tratamiento";
  paymentPatientBalance.textContent = DentalAPI.money(patientDue);
}

function updatePaymentAmountSuggestion() {
  const treatment = treatments.find((item) => Number(item.id) === Number(paymentTreatment.value));
  const amountInput = paymentForm.querySelector("input[name='amount']");
  amountInput.value = treatment ? treatmentPending(treatment) || "" : "";
  renderPaymentBalances();
}

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
      const tooth = treatment.tooth_code ? ` · Pieza ${treatment.tooth_code}` : "";
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
  const treatmentById = new Map(treatments.map((treatment) => [Number(treatment.id), treatment]));
  const from = paymentDateFrom.value;
  const through = paymentDateTo.value;

  return [...payments]
    .filter((payment) => {
      const date = String(payment.payment_date || "").slice(0, 10);
      if (selectedPaymentState && paymentState(treatmentById.get(Number(payment.patient_treatment_id))) !== selectedPaymentState) return false;
      if (from && date < from) return false;
      if (through && date > through) return false;
      if (paymentPatientFilter.value && Number(payment.patient_id) !== Number(paymentPatientFilter.value)) return false;
      if (paymentTreatmentFilter.value === "none" && payment.patient_treatment_id) return false;
      if (paymentTreatmentFilter.value !== "all" && paymentTreatmentFilter.value !== "none" && Number(payment.patient_treatment_id) !== Number(paymentTreatmentFilter.value)) return false;
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
  const patientById = new Map(patients.map((patient) => [Number(patient.id), patient]));
  const treatmentById = new Map(treatments.map((treatment) => [Number(treatment.id), treatment]));
  const filtered = filteredPayments();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAYMENT_PAGE_SIZE));
  currentPaymentPage = Math.min(currentPaymentPage, totalPages);
  const start = (currentPaymentPage - 1) * PAYMENT_PAGE_SIZE;
  const visiblePayments = filtered.slice(start, start + PAYMENT_PAGE_SIZE);

  paymentResultsCount.textContent = filtered.length
    ? `Mostrando ${start + 1}–${Math.min(start + PAYMENT_PAGE_SIZE, filtered.length)} de ${filtered.length} movimientos · Pagina ${currentPaymentPage} de ${totalPages}`
    : "0 movimientos para los filtros seleccionados.";
  renderPagination(totalPages);

  paymentsTable.innerHTML = `
    <div class="records-row payment-records-row records-head"><span>Paciente</span><span>Tratamiento</span><span>Monto</span><span>Metodo</span><span>Saldo</span><span>Acciones</span></div>
    ${
      visiblePayments
        .map((payment) => {
          const patient = patientById.get(Number(payment.patient_id));
          const treatment = treatmentById.get(Number(payment.patient_treatment_id));
          const state = paymentState(treatment);
          return `
            <div class="records-row payment-records-row" data-payment-row="${payment.id}">
              <span>${DentalAPI.patientLink(patient?.id, patient ? DentalAPI.fullName(patient) : "Paciente")}</span>
              <span><strong>${DentalAPI.escapeHtml(treatment?.title || "Sin tratamiento")}</strong><small><mark class="${paymentStateClass(state)}">${DentalAPI.escapeHtml(paymentStateLabel(state))}</mark></small></span>
              <span><input class="inline-input" data-payment-amount type="number" min="1" value="${DentalAPI.escapeHtml(payment.amount || "")}" aria-label="Monto pago" /></span>
              <span>
                <select class="inline-input" data-payment-method aria-label="Metodo pago">
                  ${["Transferencia", "Tarjeta", "Efectivo", "Otro"].map((method) => `<option ${method === payment.method ? "selected" : ""}>${method}</option>`).join("")}
                </select>
              </span>
              <span>${treatment ? DentalAPI.money(treatmentPending(treatment)) : "-"}</span>
              <span class="inline-actions">
                <button class="text-button" type="button" data-save-payment="${payment.id}">Guardar</button>
                <small class="form-status" data-payment-message="${payment.id}" aria-live="polite"></small>
              </span>
            </div>
          `;
        })
        .join("") || `<p class="empty-state">No hay pagos para los filtros seleccionados.</p>`
    }
  `;
}

async function loadPagos() {
  const [loadedPatients, loadedTreatments, loadedPayments] = await Promise.all([
    DentalAPI.get("/api/patients"),
    DentalAPI.get("/api/patient-treatments"),
    DentalAPI.get("/api/payments")
  ]);
  patients = loadedPatients;
  treatments = loadedTreatments;
  payments = loadedPayments;
  paymentPatient.innerHTML = patients
    .map((patient) => `<option value="${patient.id}">${DentalAPI.escapeHtml(DentalAPI.fullName(patient))}</option>`)
    .join("");
  renderTreatmentsForPatient();
  renderMetrics();
  renderPaymentFilters();
  renderPayments();
}

paymentPatient.addEventListener("change", renderTreatmentsForPatient);
paymentTreatment.addEventListener("change", updatePaymentAmountSuggestion);

paymentStateFilter.addEventListener("change", () => {
  selectedPaymentState = paymentStateFilter.value;
  currentPaymentPage = 1;
  renderPayments();
});

[paymentDateFrom, paymentDateTo, paymentPatientFilter, paymentTreatmentFilter].forEach((filter) => {
  filter.addEventListener("change", () => {
    currentPaymentPage = 1;
    renderPayments();
  });
});

paginationContainers.forEach((container) => {
  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-payment-page]");
    if (!button || button.disabled) return;
    currentPaymentPage = Number(button.dataset.paymentPage);
    renderPayments();
  });
});

focusPaymentForm.addEventListener("click", () => {
  paymentForm.scrollIntoView({ behavior: "smooth", block: "start" });
  paymentForm.querySelector("select").focus();
});

paymentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(paymentForm);
  const submitButton = paymentForm.querySelector("button[type='submit']");
  paymentStatus.textContent = "Guardando pago...";
  submitButton.disabled = true;

  try {
    await DentalAPI.post("/api/payments", {
      patient_id: Number(formData.get("patient_id")),
      patient_treatment_id: Number(formData.get("patient_treatment_id")) || null,
      payment_date: DentalAPI.localDateString(),
      amount: Number(formData.get("amount")),
      method: formData.get("method"),
      notes: String(formData.get("notes") || "").trim()
    });
    paymentStatus.textContent = "Pago guardado.";
    paymentForm.reset();
    paymentForm.querySelector(".payment-notes-details").open = false;
    await loadPagos();
    submitButton.disabled = false;
  } catch (error) {
    paymentStatus.textContent = error.message;
    submitButton.disabled = false;
  }
});

paymentsTable.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-save-payment]");
  if (!button) return;
  const paymentId = button.dataset.savePayment;
  const row = button.closest("[data-payment-row]");
  const message = row.querySelector("[data-payment-message]");

  button.disabled = true;
  message.textContent = "Guardando...";

  try {
    await DentalAPI.put(`/api/payments/${paymentId}`, {
      amount: Number(row.querySelector("[data-payment-amount]").value || 0),
      method: row.querySelector("[data-payment-method]").value
    });
    message.textContent = "Pago actualizado.";
    await loadPagos();
  } catch (error) {
    message.textContent = error.message;
    button.disabled = false;
  }
});

loadPagos().catch((error) => {
  paymentsTable.innerHTML = `<p class="empty-state">No se pudieron cargar pagos: ${DentalAPI.escapeHtml(error.message)}</p>`;
});
