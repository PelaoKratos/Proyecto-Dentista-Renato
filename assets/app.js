let patients = [];
let treatments = [];
let appointments = [];
let payments = [];
let attachments = [];
let dashboardStats = null;
let selectedPatientId = null;
let activeFilter = "all";

const patientList = document.querySelector("#patientList");
const patientSummary = document.querySelector("#patientSummary");
const globalSearch = document.querySelector("#globalSearch");
const filterButtons = document.querySelectorAll("[data-filter]");
const openPatientLink = document.querySelector("#openPatientLink");
const dashboardAppointments = document.querySelector("#dashboardAppointments");
const dashboardAttachments = document.querySelector("#dashboardAttachments");
const rxImage = document.querySelector("#dashboardAttachmentImage");
const rxTitle = document.querySelector("#dashboardAttachmentTitle");
const rxText = document.querySelector("#dashboardAttachmentText");
const rxFile = document.querySelector("#dashboardAttachmentFile");
const metrics = document.querySelectorAll(".metric-card");

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function patientTreatment(patientId) {
  return treatments.find((treatment) => treatment.patient_id === patientId);
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

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function todayAppointments() {
  const localToday = localDateString();
  return appointments.filter((appointment) => String(appointment.starts_at || "").startsWith(localToday));
}

function getVisiblePatients() {
  const query = normalize(globalSearch.value.trim());

  return patients.filter((patient) => {
    const treatment = patientTreatment(patient.id);
    const haystack = `${DentalAPI.fullName(patient)} ${patient.rut || ""} ${patient.phone || ""} ${treatment?.title || ""}`;
    const matchesQuery = !query || normalize(haystack).includes(query);
    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "treatment" && treatment && treatment.status !== "completed") ||
      (activeFilter === "alert" && Boolean(patient.active_alert));

    return matchesQuery && matchesFilter;
  });
}

function renderMetrics() {
  if (metrics.length < 4) return;

  const activeTreatments = treatments.filter((treatment) => treatment.status !== "completed" && treatment.status !== "cancelled");
  const totalBalance = patients.reduce((total, patient) => total + patientBalance(patient.id), 0);
  const stats = dashboardStats || {};

  metrics[0].querySelector("strong").textContent = stats.today_appointments ?? todayAppointments().length;
  metrics[0].querySelector("small").textContent = `${stats.scheduled_appointments ?? appointments.filter((item) => item.status === "scheduled").length} citas confirmadas`;

  metrics[1].querySelector("strong").textContent = stats.active_patients ?? patients.length;
  metrics[1].querySelector("small").textContent = `${stats.patients_with_alerts ?? patients.filter((patient) => patient.active_alert).length} con alerta clinica`;

  metrics[2].querySelector("strong").textContent = stats.active_treatments ?? activeTreatments.length;
  metrics[2].querySelector("small").textContent = `${stats.in_progress_treatments ?? activeTreatments.filter((item) => item.status === "in_progress").length} en curso`;

  metrics[3].querySelector("strong").textContent = DentalAPI.money(stats.pending_balance ?? totalBalance);
  metrics[3].querySelector("small").textContent = `${stats.patients_with_balance ?? patients.filter((patient) => patientBalance(patient.id) > 0).length} pacientes con saldo`;
}

function renderAppointments() {
  const patientById = new Map(patients.map((patient) => [patient.id, patient]));
  const rows = todayAppointments().slice(0, 5);

  if (!rows.length) {
    dashboardAppointments.innerHTML = `<p class="empty-state">No hay citas programadas para hoy.</p>`;
    return;
  }

  dashboardAppointments.innerHTML = rows
    .map((appointment, index) => {
      const patient = patientById.get(appointment.patient_id);
      const statusText = appointment.notes || DentalAPI.statusLabel(appointment.status);
      const statusClass = appointment.status === "attended" ? "attention" : statusText.includes("Pendiente") ? "warning" : "";
      return `
        <article class="appointment ${index === 0 ? "current" : ""}">
          <time>${DentalAPI.time(appointment.starts_at)}</time>
          <div>
            <strong>${DentalAPI.escapeHtml(patient ? DentalAPI.fullName(patient) : "Paciente")}</strong>
            <span>${DentalAPI.escapeHtml(appointment.reason || "Atencion dental")}</span>
          </div>
          <span class="pill ${statusClass}">${DentalAPI.escapeHtml(statusText)}</span>
        </article>
      `;
    })
    .join("");
}

function renderPatientList() {
  const visiblePatients = getVisiblePatients();

  if (!visiblePatients.length) {
    patientList.innerHTML = `<p class="empty-state">No hay pacientes que coincidan con la busqueda.</p>`;
    return;
  }

  patientList.innerHTML = visiblePatients
    .map((patient) => {
      const treatment = patientTreatment(patient.id);
      return `
        <button class="patient-row ${patient.id === selectedPatientId ? "active" : ""}" type="button" data-patient-id="${patient.id}">
          <span class="avatar">${DentalAPI.initials(patient)}</span>
          <div>
            <strong>${DentalAPI.escapeHtml(DentalAPI.fullName(patient))}</strong>
            <span>${DentalAPI.escapeHtml(patient.rut || "Sin RUT")} · ${DentalAPI.escapeHtml(treatment?.title || "Sin tratamiento activo")}</span>
          </div>
          <span class="row-status">${DentalAPI.escapeHtml(treatment ? DentalAPI.statusLabel(treatment.status) : "Ficha")}</span>
        </button>
      `;
    })
    .join("");

  document.querySelectorAll("[data-patient-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPatientId = Number(button.dataset.patientId);
      renderPatientList();
      renderPatientSummary();
    });
  });
}

async function renderPatientSummary() {
  const patient = patients.find((item) => item.id === selectedPatientId) || patients[0];
  if (!patient) {
    patientSummary.innerHTML = `<p class="empty-state">No hay pacientes registrados.</p>`;
    return;
  }

  openPatientLink.href = `./paciente.html?id=${patient.id}`;
  const summary = await DentalAPI.get(`/api/patients/${patient.id}/summary`);
  const treatment = summary.treatments[0];
  const sessions = summary.sessions.slice(0, 3);

  const alertMarkup = patient.active_alert
    ? `
      <article class="summary-block alert-line">
        <header>
          <strong>Alerta clinica</strong>
          <span class="pill attention">Visible</span>
        </header>
        <p>${DentalAPI.escapeHtml(patient.active_alert)}</p>
      </article>
    `
    : `
      <article class="summary-block">
        <header>
          <strong>Alerta clinica</strong>
          <span class="pill">Sin alerta</span>
        </header>
        <p>No hay advertencias registradas para este paciente.</p>
      </article>
    `;

  patientSummary.innerHTML = `
    <article class="summary-block">
      <header>
        <strong>${DentalAPI.escapeHtml(DentalAPI.fullName(patient))}</strong>
        <span class="pill">${DentalAPI.escapeHtml(treatment ? DentalAPI.statusLabel(treatment.status) : "Ficha")}</span>
      </header>
      <p>${DentalAPI.escapeHtml(patient.phone || "Sin telefono")} · Saldo: ${DentalAPI.money(patientBalance(patient.id))}</p>
    </article>

    ${alertMarkup}

    <article class="summary-block">
      <header>
        <strong>Proximo paso</strong>
      </header>
      <p>${DentalAPI.escapeHtml(treatment?.plan_notes || patient.medical_notes || "Sin acciones pendientes registradas.")}</p>
    </article>

    <article class="summary-block">
      <header>
        <strong>Ultimas atenciones</strong>
      </header>
      <div class="timeline">
        ${
          sessions.length
            ? sessions
                .map(
                  (session) => `
                    <div>
                      <time>${DentalAPI.date(session.session_date, { day: "2-digit", month: "short" })}</time>
                      <span>${DentalAPI.escapeHtml(session.reason || session.procedure_done || "Atencion clinica")}</span>
                    </div>
                  `
                )
                .join("")
            : `<div><time>Ficha</time><span>${DentalAPI.escapeHtml(patient.medical_notes || "Paciente registrado en la base local.")}</span></div>`
        }
      </div>
    </article>
  `;
}

function renderAttachments() {
  const patientById = new Map(patients.map((patient) => [patient.id, patient]));
  const latest = attachments[0];

  if (latest) {
    const patient = patientById.get(latest.patient_id);
    rxImage.src = `./${latest.stored_path}`;
    rxTitle.textContent = latest.category || latest.original_filename;
    rxText.textContent = patient ? `Asociada a ${DentalAPI.fullName(patient)}` : "Adjunto clinico";
    rxFile.textContent = `Archivo: ${latest.original_filename}`;
  }

  dashboardAttachments.innerHTML = `
    <div role="row" class="table-head">
      <span role="columnheader">Tipo</span>
      <span role="columnheader">Paciente</span>
      <span role="columnheader">Fecha</span>
    </div>
    ${
      attachments
        .slice(0, 3)
        .map((attachment) => {
          const patient = patientById.get(attachment.patient_id);
          return `
            <div role="row">
              <span role="cell">${DentalAPI.escapeHtml(attachment.category || attachment.file_type)}</span>
              <span role="cell">${DentalAPI.escapeHtml(patient ? DentalAPI.fullName(patient) : "Paciente")}</span>
              <span role="cell">${DentalAPI.date(attachment.taken_at || attachment.created_at, { day: "2-digit", month: "2-digit" })}</span>
            </div>
          `;
        })
        .join("") || `<div role="row"><span role="cell">Sin adjuntos</span><span role="cell">-</span><span role="cell">-</span></div>`
    }
  `;
}

function render() {
  renderMetrics();
  renderAppointments();
  renderPatientList();
  renderPatientSummary();
  renderAttachments();
}

async function loadDashboard() {
  patientList.innerHTML = `<p class="empty-state">Cargando pacientes desde SQLite...</p>`;
  patientSummary.innerHTML = `<p class="empty-state">Cargando ficha...</p>`;

  [patients, treatments, appointments, payments, attachments, dashboardStats] = await Promise.all([
    DentalAPI.get("/api/patients"),
    DentalAPI.get("/api/patient-treatments"),
    DentalAPI.get("/api/appointments"),
    DentalAPI.get("/api/payments"),
    DentalAPI.get("/api/attachments"),
    DentalAPI.get(`/api/dashboard-stats?date=${localDateString()}`)
  ]);

  selectedPatientId = patients[0]?.id || null;
  render();
}

globalSearch.addEventListener("input", renderPatientList);

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filterButtons.forEach((item) => item.classList.toggle("active", item === button));
    renderPatientList();
  });
});

loadDashboard().catch((error) => {
  patientList.innerHTML = `<p class="empty-state">No se pudo conectar con el backend.</p>`;
  patientSummary.innerHTML = `<p class="empty-state">${DentalAPI.escapeHtml(error.message)}</p>`;
});
