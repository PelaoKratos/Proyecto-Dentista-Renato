const paymentsTable = document.querySelector("#paymentsTable");
const paymentForm = document.querySelector("#paymentForm");
const paymentPatient = document.querySelector("#paymentPatient");
const paymentTreatment = document.querySelector("#paymentTreatment");
const paymentStatus = document.querySelector("#paymentStatus");
const focusPaymentForm = document.querySelector("#focusPaymentForm");
const paymentMetrics = document.querySelectorAll("[data-payment-metric]");
const paymentStateFilter = document.querySelector("#paymentStateFilter");

let patients = [];
let treatments = [];
let payments = [];
let selectedPaymentState = "";

function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKey(dateValue) {
  return String(dateValue || "").slice(0, 7);
}

function patientBalance(patientId) {
  const treatmentTotal = treatments
    .filter((treatment) => treatment.patient_id === patientId)
    .reduce((total, treatment) => total + Number(treatment.final_price || treatment.estimated_price || 0), 0);
  const paid = payments
    .filter((payment) => payment.patient_id === patientId)
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
  const options = treatments.filter((treatment) => treatment.patient_id === patientId);
  paymentTreatment.innerHTML =
    options.map((treatment) => `<option value="${treatment.id}">${DentalAPI.escapeHtml(treatment.title)} - saldo ${DentalAPI.money(treatmentPending(treatment))}</option>`).join("") ||
    `<option value="">Sin tratamiento asociado</option>`;
  updatePaymentAmountSuggestion();
}

function updatePaymentAmountSuggestion() {
  const treatment = treatments.find((item) => item.id === Number(paymentTreatment.value));
  const amountInput = paymentForm.querySelector("input[name='amount']");
  if (!treatment) return;
  amountInput.value = treatmentPending(treatment) || "";
}

function renderPayments() {
  const patientById = new Map(patients.map((patient) => [patient.id, patient]));
  const treatmentById = new Map(treatments.map((treatment) => [treatment.id, treatment]));
  const visiblePayments = payments.filter((payment) => {
    if (!selectedPaymentState) return true;
    const treatment = treatmentById.get(payment.patient_treatment_id);
    return paymentState(treatment) === selectedPaymentState;
  });

  paymentsTable.innerHTML = `
    <div class="records-row payment-records-row records-head"><span>Paciente</span><span>Tratamiento</span><span>Monto</span><span>Metodo</span><span>Saldo</span><span>Acciones</span></div>
    ${
      visiblePayments
        .map((payment) => {
          const patient = patientById.get(payment.patient_id);
          const treatment = treatmentById.get(payment.patient_treatment_id);
          const state = paymentState(treatment);
          return `
            <div class="records-row payment-records-row" data-payment-row="${payment.id}">
              <span>${DentalAPI.escapeHtml(patient ? DentalAPI.fullName(patient) : "Paciente")}</span>
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
        .join("") || `<p class="empty-state">No hay pagos para el filtro seleccionado.</p>`
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
  renderPayments();
}

paymentPatient.addEventListener("change", renderTreatmentsForPatient);
paymentTreatment.addEventListener("change", updatePaymentAmountSuggestion);

paymentStateFilter.addEventListener("change", () => {
  selectedPaymentState = paymentStateFilter.value;
  renderPayments();
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
      payment_date: new Date().toISOString().slice(0, 10),
      amount: Number(formData.get("amount")),
      method: formData.get("method"),
      notes: "Pago registrado desde la aplicacion"
    });
    paymentStatus.textContent = "Pago guardado.";
    paymentForm.reset();
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
