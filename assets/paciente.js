const patientPage = document.querySelector(".patient-page");
const { renderOdontogram, renderDataList, renderSessions } = window.PatientView;
const { toothDescription, catalogGroup, ageFromBirthDate, totalTreatments, totalPayments, balance, treatmentTotal, treatmentPaid, treatmentBalance, paymentState, paymentStateClass, progressForStatus, dateKey, attachmentTypeLabel } = window.PatientDomain;
let currentSummary = null;
let patientActiveTab = "clinical";
let historyFilter = "all";
let historySearch = "";
let currentCatalog = [];
let selectedToothForAppointment = null;

const { bindPatientAppointmentActions, cleanFormData, bindAppointmentPriceForm } = window.PatientAppointments.create({
  getSummary: () => currentSummary,
  getCatalog: () => currentCatalog,
  getSelectedTooth: () => selectedToothForAppointment,
  setSelectedTooth: (tooth) => { selectedToothForAppointment = tooth; },
  pendingToothAppointment,
  loadPatient: () => loadPatient(),
  toothDescription
});

const { saveAction } = window.PatientFormActions.create({
  getSummary: () => currentSummary,
  getCatalog: () => currentCatalog,
  cleanFormData,
  sessionPayloadFromForm,
  selectedAppointment,
  localDateString
});

const { renderActionForm } = window.PatientFormView.create({
  getSummary: () => currentSummary,
  getCatalog: () => currentCatalog,
  getSelectedTooth: () => selectedToothForAppointment,
  activeTreatment,
  selectedAppointment,
  treatmentBalance,
  balance,
  dateTimeForInput,
  renderTreatmentOptions,
  renderSessionOptions,
  todayForInput,
  nextControlInput,
  appointmentCatalogOptions,
  toothDescription,
  bindActionForm
});

const toothNotes = {
  36: "Evaluacion para implante. Requiere revisar altura osea en radiografia panoramica.",
  46: "Restauracion antigua. Controlar filtracion en proxima limpieza.",
  17: "Sin hallazgos actuales. Mantener observacion preventiva.",
  11: "Control estetico normal. Sin indicacion activa."
};
function appointmentCatalogOptions() {
  const groups = currentCatalog.reduce((result, item) => {
    const group = catalogGroup(item.name);
    if (!result[group]) result[group] = [];
    result[group].push(item);
    return result;
  }, {});
  return Object.entries(groups)
    .map(([group, items]) => `<optgroup label="${DentalAPI.escapeHtml(group)}">${items.map((item) => `<option value="${item.id}" data-price="${Number(item.default_price || 0)}">${DentalAPI.escapeHtml(item.name)} - ${DentalAPI.money(item.default_price || 0)}</option>`).join("")}</optgroup>`)
    .join("");
}
function getPatientId() {
  const params = new URLSearchParams(window.location.search);
  const parsed = Number(params.get("id"));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
}

function getAppointmentId() {
  const params = new URLSearchParams(window.location.search);
  const parsed = Number(params.get("appointment"));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function activeTreatment(summary) {
  return summary.treatments.find((treatment) => treatment.status !== "completed" && treatment.status !== "cancelled") || summary.treatments[0];
}

function statusOptions(selectedStatus) {
  return ["planned", "in_progress", "completed", "cancelled"]
    .map((status) => `<option value="${status}" ${status === selectedStatus ? "selected" : ""}>${DentalAPI.escapeHtml(DentalAPI.statusLabel(status))}</option>`)
    .join("");
}

function selectedAppointment(summary = currentSummary) {
  const appointmentId = getAppointmentId();
  if (!appointmentId || !summary) return null;
  return summary.appointments.find((appointment) => appointment.id === appointmentId) || null;
}

function dateTimeForInput(value) {
  if (!value) return todayForInput();
  return String(value).replace(" ", "T").slice(0, 16);
}

function sessionTreatment(session) {
  if (!session.patient_treatment_id) return null;
  return currentSummary.treatments.find((treatment) => treatment.id === Number(session.patient_treatment_id)) || null;
}

function attachmentTreatment(attachment) {
  if (!attachment.patient_treatment_id) return null;
  return currentSummary.treatments.find((treatment) => treatment.id === Number(attachment.patient_treatment_id)) || null;
}

function attachmentSession(attachment) {
  if (!attachment.clinical_session_id) return null;
  return currentSummary.sessions.find((session) => session.id === Number(attachment.clinical_session_id)) || null;
}

function renderQuickEvolution(summary) {
  const treatment = activeTreatment(summary);
  const appointment = selectedAppointment(summary);
  return `
    <form class="quick-evolution-form" id="quickEvolutionForm">
      <div>
        <span class="eyebrow">Evolucion rapida</span>
        <strong>${appointment ? "Atencion desde agenda" : "Nueva nota clinica"}</strong>
      </div>
      <label>Tratamiento<select name="patient_treatment_id"><option value="">Sin tratamiento</option>${renderTreatmentOptions(treatment?.id)}</select></label>
      <label>Motivo<input name="reason" value="${DentalAPI.escapeHtml(appointment?.reason || "Control clinico")}" required /></label>
      <label>Observacion<textarea name="notes" placeholder="Notas principales de la atencion" required></textarea></label>
      <button class="text-button primary-action" type="submit">${appointment ? "Guardar y cerrar cita" : "Guardar evolucion"}</button>
      <p class="form-status" id="quickEvolutionStatus" aria-live="polite"></p>
    </form>
  `;
}

function pendingToothAppointment(toothCode) {
  if (!toothCode) return null;
  return currentSummary.appointments.find((appointment) => appointment.status === "scheduled" && currentSummary.treatments.some((treatment) => Number(treatment.id) === Number(appointment.patient_treatment_id) && String(treatment.tooth_code || "").trim() === String(toothCode).trim()));
}

function treatmentPaymentLabel(summary, treatment) {
  return treatment.status === "cancelled"
    ? `Abonos registrados: ${DentalAPI.money(treatmentPaid(summary, treatment.id))}`
    : paymentState(treatmentTotal(treatment), treatmentPaid(summary, treatment.id));
}

function renderTreatmentHistory(summary) {
  return [...summary.treatments].sort((a, b) => {
    const rank = (item) => item.status === "in_progress" || item.status === "planned" ? 0 : item.status === "completed" ? 1 : 2;
    return rank(a) - rank(b) || String(b.created_at || b.start_date || "").localeCompare(String(a.created_at || a.start_date || "")) || b.id - a.id;
  }).map((treatment) => {
    const visits = summary.appointments.filter(item => Number(item.patient_treatment_id) === treatment.id).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
    const sessions = summary.sessions.filter(item => Number(item.patient_treatment_id) === treatment.id);
    const attended = visits.filter(item => item.status === "attended").length;
    const pending = visits.find(item => item.status === "scheduled") || pendingToothAppointment(treatment.tooth_code);
    return `<article class="history-card" data-treatment-history="${treatment.id}" data-history-state="${treatment.status}" data-history-search="${DentalAPI.escapeHtml(`${treatment.title} ${treatment.tooth_code || ""}`.toLowerCase())}">
      <header><div><span class="eyebrow">${treatment.tooth_code ? `Pieza ${DentalAPI.escapeHtml(treatment.tooth_code)}` : "Tratamiento general"}</span><h3>${DentalAPI.escapeHtml(treatment.title)}</h3></div><span class="pill">${DentalAPI.escapeHtml(DentalAPI.statusLabel(treatment.status))}</span></header>
      <div class="history-meta"><span><b>${visits.length}</b> citas registradas · <b>${attended}</b> atendidas</span><span>Pago: <b>${treatmentPaymentLabel(summary, treatment)}</b></span></div>
      ${pending ? `<p class="history-next">Cita pendiente: ${DentalAPI.date(pending.starts_at)} · ${DentalAPI.time(pending.starts_at)}</p>` : ""}
      <div class="inline-actions">${pending ? `<button class="text-button" data-action="reschedule" data-entity-id="${pending.id}">Cambiar fecha</button>` : treatment.status !== "completed" ? `<button class="text-button primary-action" data-action="appointment" data-entity-id="${treatment.id}" data-tooth-code="${DentalAPI.escapeHtml(treatment.tooth_code || "")}">${treatment.status === "cancelled" ? "Reagendar tratamiento" : "Agendar continuacion"}</button>` : ""}
      ${!pending && !["completed", "cancelled"].includes(treatment.status) ? `<button class="text-button" data-finish-history="${treatment.id}">Finalizar tratamiento</button>` : ""}</div>
      <details class="history-details"><summary>Ver historial y notas</summary>
        <p>${DentalAPI.escapeHtml(treatment.plan_notes || treatment.diagnosis || "Sin notas del tratamiento.")}</p>
        <ol class="visit-history">${visits.map(visit => `<li><div><time>${DentalAPI.date(visit.starts_at)} · ${DentalAPI.time(visit.starts_at)}</time><span class="pill">${DentalAPI.escapeHtml(DentalAPI.statusLabel(visit.status))}</span></div>${visit.notes ? `<p>${DentalAPI.escapeHtml(visit.notes)}</p>` : ""}</li>`).join("") || "<li>Sin citas vinculadas.</li>"}</ol>
        ${sessions.length ? `<h4>Notas clinicas</h4>${renderSessions(sessions, summary.treatments)}` : ""}
        <p>Presupuesto: ${DentalAPI.money(treatmentTotal(treatment))} · Abonos: ${DentalAPI.money(treatmentPaid(summary, treatment.id))}</p>
      </details><p class="form-status" data-history-message="${treatment.id}" role="status"></p>
    </article>`;
  }).join("") || `<p class="empty-state">Aun no hay tratamientos. Empieza con Agendar cita.</p>`;
}

function filterPatientHistory() {
  const query = historySearch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let count = 0;
  document.querySelectorAll("[data-treatment-history]").forEach(card => {
    const state = card.dataset.historyState;
    const matches = historyFilter === "all" || (historyFilter === "active" ? ["planned", "in_progress"].includes(state) : state === historyFilter);
    card.hidden = !matches || !card.dataset.historySearch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(query);
    if (!card.hidden) count++;
  });
  document.querySelector("#historyEmpty").hidden = count > 0 || !currentSummary.treatments.length;
}

function renderTreatments(treatments) {
  if (!treatments.length) return `<p class="empty-state">No hay tratamientos registrados para este paciente.</p>`;

  const groups = [
    ["active", "Activos", treatments.filter((treatment) => treatment.status !== "completed" && treatment.status !== "cancelled")],
    ["completed", "Finalizados", treatments.filter((treatment) => treatment.status === "completed")],
    ["cancelled", "Cancelados", treatments.filter((treatment) => treatment.status === "cancelled")]
  ];

  return groups
    .filter(([, , grouped]) => grouped.length)
    .map(
      ([key, label, grouped]) => `
        <section class="treatment-group" data-treatment-group="${key}">
          <h3>${label}</h3>
          ${grouped.map(renderTreatmentCard).join("")}
        </section>
      `
    )
    .join("");
}

function renderTreatmentCard(treatment) {
  const canComplete = treatment.status !== "completed" && treatment.status !== "cancelled";
  return `
    <article data-patient-treatment-card="${treatment.id}">
      <header>
        <div>
          <strong>${DentalAPI.escapeHtml(treatment.title)}</strong>
          <span>${DentalAPI.escapeHtml(treatment.tooth_code ? `Pieza ${treatment.tooth_code}` : "Sin pieza asignada")} · ${DentalAPI.money(treatment.final_price ?? treatment.estimated_price ?? 0)}</span>
        </div>
        <span class="pill ${treatment.status === "planned" ? "warning" : treatment.status === "completed" ? "attention" : ""}">${DentalAPI.escapeHtml(DentalAPI.statusLabel(treatment.status))}</span>
      </header>
      <p>Pago: ${treatmentPaymentLabel(currentSummary, treatment)}</p>
      <p>${DentalAPI.escapeHtml(treatment.plan_notes || treatment.diagnosis || "Sin notas del plan.")}</p>
      <details><summary>Editar datos y presupuesto</summary>
      <div class="editor-controls treatment-editor">
        <label>Nombre<input data-treatment-title value="${DentalAPI.escapeHtml(treatment.title || "")}" /></label>
        <label>Pieza<input data-treatment-tooth value="${DentalAPI.escapeHtml(treatment.tooth_code || "")}" /></label>
        <label>Estado<select data-treatment-status>${statusOptions(treatment.status)}</select></label>
        <label>Presupuesto<input data-treatment-estimated type="number" min="0" value="${DentalAPI.escapeHtml(treatment.estimated_price || "")}" /></label>
        <label>Valor final<input data-treatment-final type="number" min="0" value="${DentalAPI.escapeHtml(treatment.final_price || "")}" /></label>
        <label>Inicio<input data-treatment-start type="date" value="${DentalAPI.escapeHtml(treatment.start_date || "")}" /></label>
        <label>Termino<input data-treatment-end type="date" value="${DentalAPI.escapeHtml(treatment.end_date || "")}" /></label>
        <label>Diagnostico<textarea data-treatment-diagnosis>${DentalAPI.escapeHtml(treatment.diagnosis || "")}</textarea></label>
        <label>Plan clinico<textarea data-treatment-plan>${DentalAPI.escapeHtml(treatment.plan_notes || "")}</textarea></label>
      </div>
      <div class="inline-actions">
        <button class="text-button" type="button" data-save-patient-treatment="${treatment.id}">Guardar tratamiento</button>
        ${canComplete ? `<button class="text-button" type="button" data-complete-patient-treatment="${treatment.id}">Finalizar</button>` : ""}
        <span class="form-status" data-treatment-message="${treatment.id}" aria-live="polite"></span>
      </div>
      </details>
    </article>
  `;
}

function renderAttachments(attachments) {
  if (!attachments.length) {
    return `
      <div class="attachment-browser">
        <div class="empty-state">No hay radiografias adjuntas.</div>
        <div class="attachment-details"><strong>Sin adjuntos</strong><span>Los archivos se guardaran en la carpeta local del paciente.</span></div>
      </div>
    `;
  }

  const selected = attachments[0];
  const treatment = attachmentTreatment(selected);
  const session = attachmentSession(selected);
  return `
    <div class="attachment-browser">
      <img src="./${DentalAPI.escapeHtml(selected.stored_path)}" alt="Radiografia dental de muestra" />
      <div class="attachment-details">
        <strong>${DentalAPI.escapeHtml(selected.category || selected.original_filename)}</strong>
        <span>${DentalAPI.date(selected.taken_at || selected.created_at)} · ${DentalAPI.escapeHtml(attachmentTypeLabel(selected.file_type))}</span>
        <span>${DentalAPI.escapeHtml(treatment ? treatment.title : "Sin tratamiento asociado")} · ${DentalAPI.escapeHtml(session ? session.reason || "Evolucion clinica" : "Sin evolucion asociada")}</span>
        <p>${DentalAPI.escapeHtml(selected.notes || "Adjunto clinico registrado en la ficha del paciente.")}</p>
        <code>${DentalAPI.escapeHtml(selected.stored_path)}</code>
      </div>
    </div>
    <div class="attachment-gallery">
      ${attachments
        .map((attachment) => {
          const linkedTreatment = attachmentTreatment(attachment);
          return `
            <article>
              <a href="./${DentalAPI.escapeHtml(attachment.stored_path)}" target="_blank" rel="noopener">
                <img src="./${DentalAPI.escapeHtml(attachment.stored_path)}" alt="Adjunto clinico" />
              </a>
              <div>
                <strong>${DentalAPI.escapeHtml(attachment.category || attachment.original_filename)}</strong>
                <span>${DentalAPI.escapeHtml(linkedTreatment ? linkedTreatment.title : attachmentTypeLabel(attachment.file_type))}</span>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderAttachmentRows(attachments) {
  return `
    <div role="row" class="table-head">
      <span role="columnheader">Tipo</span>
      <span role="columnheader">Vinculo</span>
      <span role="columnheader">Accion</span>
    </div>
    ${
      attachments
        .map((attachment) => {
          const treatment = attachmentTreatment(attachment);
          const session = attachmentSession(attachment);
          return `
            <div role="row">
              <span role="cell">${DentalAPI.escapeHtml(attachment.category || attachmentTypeLabel(attachment.file_type))}</span>
              <span role="cell">${DentalAPI.escapeHtml(treatment ? treatment.title : "Sin tratamiento")} · ${DentalAPI.escapeHtml(session ? session.reason || "Evolucion" : DentalAPI.date(attachment.taken_at || attachment.created_at, { day: "2-digit", month: "2-digit" }))}</span>
              <span role="cell" class="inline-actions">
                <a class="text-button link-button" href="./${DentalAPI.escapeHtml(attachment.stored_path)}" target="_blank" rel="noopener">Abrir</a>
                <button class="text-button danger-action" type="button" data-delete-patient-attachment="${attachment.id}">Eliminar</button>
              </span>
            </div>
          `;
        })
        .join("") || `<div role="row"><span role="cell">Sin adjuntos</span><span role="cell">-</span><span role="cell">-</span></div>`
    }
  `;
}

function renderPayments(payments) {
  if (!payments.length) return `<p class="empty-state">No hay pagos registrados.</p>`;

  return payments
    .map((payment) => {
      const treatment = currentSummary.treatments.find((item) => item.id === Number(payment.patient_treatment_id));
      const total = treatment ? treatmentTotal(treatment) : 0;
      const paid = treatment ? treatmentPaid(currentSummary, treatment.id) : Number(payment.amount || 0);
      return `
        <article class="payment-entry">
          <time>${DentalAPI.date(payment.payment_date)}</time>
          <header>
            <strong>${DentalAPI.money(payment.amount)}</strong>
            <span class="pill ${paymentStateClass(total, paid)}">${DentalAPI.escapeHtml(paymentState(total, paid))}</span>
          </header>
          <span>${DentalAPI.escapeHtml(treatment ? treatment.title : "Sin tratamiento asociado")} · ${DentalAPI.escapeHtml(payment.method || "Metodo sin registrar")}</span>
          <p>${DentalAPI.escapeHtml(payment.notes || "Pago registrado en la ficha.")}</p>
        </article>
      `;
    })
    .join("");
}

function renderTreatmentBalances(summary) {
  if (!summary.treatments.length) return `<p class="empty-state">No hay tratamientos para calcular saldos.</p>`;

  return summary.treatments
    .map((treatment) => {
      const total = treatmentTotal(treatment);
      const paid = treatmentPaid(summary, treatment.id);
      const pending = Math.max(total - paid, 0);
      return `
        <article class="balance-card">
          <header>
            <strong>${DentalAPI.escapeHtml(treatment.title)}</strong>
            <span class="pill ${paymentStateClass(total, paid)}">${DentalAPI.escapeHtml(paymentState(total, paid))}</span>
          </header>
          <div class="money-list compact-money">
            <div><span>Total</span><strong>${DentalAPI.money(total)}</strong></div>
            <div><span>Pagado</span><strong>${DentalAPI.money(paid)}</strong></div>
            <div><span>Pendiente</span><strong>${DentalAPI.money(pending)}</strong></div>
          </div>
          <button class="text-button" type="button" data-action="payment" data-entity-id="${treatment.id}">Registrar abono</button>
        </article>
      `;
    })
    .join("");
}

function todayForInput() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function nextControlInput(days = 7) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(10, 0, 0, 0);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function upcomingAppointments(summary) {
  const today = localDateString();
  return summary.appointments
    .filter((appointment) => appointment.status === "scheduled" && String(appointment.starts_at || "").slice(0, 10) >= today)
    .sort((a, b) => String(a.starts_at || "").localeCompare(String(b.starts_at || "")));
}

function nextAppointment(summary) {
  return upcomingAppointments(summary)[0] || null;
}

function renderTreatmentOptions(selectedId = "") {
  return currentSummary.treatments
    .map((treatment) => `<option value="${treatment.id}" ${Number(selectedId) === treatment.id ? "selected" : ""}>${DentalAPI.escapeHtml(treatment.title)}</option>`)
    .join("");
}

function renderSessionOptions(selectedId = "") {
  return currentSummary.sessions
    .map((session) => `<option value="${session.id}" ${Number(selectedId) === session.id ? "selected" : ""}>${DentalAPI.date(session.session_date, { day: "2-digit", month: "2-digit" })} ${DentalAPI.time(session.session_date)} - ${DentalAPI.escapeHtml(session.reason || "Evolucion")}</option>`)
    .join("");
}

function renderAppointmentFlow(summary) {
  const appointment = selectedAppointment(summary);
  if (!appointment) return "";
  const canAttend = appointment.status === "scheduled";

  return `
    <section class="appointment-flow-card" aria-label="Atencion desde agenda">
      <div>
        <span class="eyebrow">Atencion desde agenda</span>
        <strong>${String(appointment.starts_at || "").slice(11, 16)} · ${DentalAPI.escapeHtml(appointment.reason || "Atencion dental")}</strong>
        <span>${DentalAPI.escapeHtml(appointment.notes || DentalAPI.statusLabel(appointment.status))}</span>
      </div>
      <div class="inline-actions">
        ${
          canAttend
            ? `
              <button class="text-button primary-action" type="button" data-action="appointment-session">Registrar evolucion</button>
              <button class="text-button" type="button" data-action="complete-appointment">Marcar atendida</button>
            `
            : ""
        }
        <a class="text-button link-button" href="./agenda.html">Volver a agenda</a>
      </div>
    </section>
  `;
}

function renderPatientAppointments(summary) {
  const pending = summary.appointments.filter(item => item.status === "scheduled").sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return `<section class="detail-card patient-agenda"><div class="section-heading"><div><span class="eyebrow">Agenda del paciente</span><h2>Citas pendientes <span class="pill">${pending.length}</span></h2></div><button class="text-button primary-action" data-action="appointment">Agendar cita</button></div>
    <p class="form-helper">Al atender una cita queda registrada la visita. El tratamiento sigue disponible para futuras sesiones.</p>
    <div class="patient-visit-list">${pending.map(appointment => {
      const treatment = summary.treatments.find(item => item.id === Number(appointment.patient_treatment_id));
      const overdue = new Date(appointment.starts_at.replace(" ", "T")) < new Date();
      return `<article class="patient-visit" data-patient-appointment="${appointment.id}">
        <div class="visit-date"><strong>${DentalAPI.date(appointment.starts_at, { day: "2-digit", month: "short" })}</strong><span>${String(appointment.starts_at || "").slice(11, 16)}</span>${overdue ? '<small>Por registrar</small>' : ""}</div>
        <div class="visit-description"><span class="eyebrow">${treatment?.tooth_code ? `Pieza ${DentalAPI.escapeHtml(treatment.tooth_code)}` : "Control general"}</span><h3>${DentalAPI.escapeHtml(treatment?.title || appointment.reason || "Control clinico")}</h3>${appointment.notes ? `<p>${DentalAPI.escapeHtml(appointment.notes)}</p>` : ""}
        <div class="inline-actions"><button class="text-button primary-action" data-update-patient-appointment="${appointment.id}" data-status="attended">Marcar atendida</button><button class="text-button" data-action="reschedule" data-entity-id="${appointment.id}">Cambiar fecha</button><button class="text-button danger-action" data-update-patient-appointment="${appointment.id}" data-status="cancelled">Cancelar cita</button><button class="text-button" data-update-patient-appointment="${appointment.id}" data-status="missed">No asistio</button></div>
        <p class="form-status" data-patient-appointment-message="${appointment.id}" role="status"></p></div>
      </article>`;
    }).join("") || '<p class="empty-state">No hay citas pendientes. Agenda un nuevo tratamiento o continua uno desde el historial.</p>'}</div></section>`;
}

function renderPatient(summary) {
  currentSummary = summary;
  const patient = summary.patient;
  const documentsLink = document.querySelector("#patientDocumentsLink");
  if (documentsLink) documentsLink.href = `./documentos.html?id=${patient.id}`;
  const treatment = summary.treatments.find(item => ["planned", "in_progress"].includes(item.status));
  const appointment = nextAppointment(summary);
  const selectedTooth = treatment?.tooth_code || "36";

  patientPage.innerHTML = `
    <header class="patient-hero">
      <div class="patient-identity">
        <a class="back-link" href="./index.html">Volver al panel</a>
        <div class="identity-row">
          <span class="avatar large">${DentalAPI.initials(patient)}</span>
          <div>
            <span class="eyebrow">Ficha paciente</span>
            <h1>${DentalAPI.escapeHtml(DentalAPI.fullName(patient))}</h1>
            <div class="identity-meta patient-contact-line"><span><b>RUT</b> ${DentalAPI.escapeHtml(patient.rut || "Sin RUT")}</span><span><b>Tel.</b> ${DentalAPI.escapeHtml(patient.phone || "Sin telefono")}</span><span><b>Correo</b> ${DentalAPI.escapeHtml(patient.email || "Sin correo")}</span><span><b>Nacimiento</b> ${DentalAPI.date(patient.birth_date)}</span><span><b>Direccion</b> ${DentalAPI.escapeHtml(patient.address || "Sin direccion")}</span></div>
          </div>
        </div>
      </div>
      <div class="hero-actions">
        <button class="text-button" type="button" id="exportClinicalBtn">Exportar ficha clinica</button>
        <button class="text-button" type="button" data-action="edit">Editar datos</button>
        <button class="text-button danger-action" type="button" data-action="deactivate">Desactivar</button>
        <button class="icon-button" type="button" data-action="attachment" aria-label="Adjuntar radiografia" title="Adjuntar radiografia">+</button>
      </div>
    </header>

    <section class="patient-alert-strip ${patient.active_alert ? "" : "patient-alert-normal"}" aria-label="Avisos clinicos del paciente">
      <div><strong>Atencion clinica</strong><span>${DentalAPI.escapeHtml(patient.active_alert || patient.medical_notes || "Sin alertas clinicas registradas.")}</span></div>
      <span class="pill ${patient.active_alert ? "warning" : ""}">${patient.active_alert ? "Revisar" : "Normal"}</span>
    </section>

    ${renderAppointmentFlow(summary)}

    <section class="patient-kpis" aria-label="Resumen del paciente">
      <article class="metric-card compact"><span>Proxima cita</span><strong>${appointment ? DentalAPI.date(appointment.starts_at, { day: "2-digit", month: "short" }) : "Sin cita"}</strong><small>${appointment ? `${String(appointment.starts_at || "").slice(11, 16)} · ${DentalAPI.escapeHtml(appointment.reason || "Atencion dental")}` : "No hay citas futuras"}</small></article>
      <article class="metric-card compact"><span>Tratamiento activo</span><strong>${DentalAPI.escapeHtml(treatment?.title || "Sin tratamiento activo")}</strong><small>${DentalAPI.escapeHtml(treatment?.tooth_code ? `Pieza ${treatment.tooth_code}` : "Ficha general")}</small></article>
      <article class="metric-card compact"><span>Saldo pendiente</span><strong>${DentalAPI.money(balance(summary))}</strong><small>Total plan ${DentalAPI.money(totalTreatments(summary))}</small></article>
    </section>

    <section class="patient-tabs" role="tablist" aria-label="Secciones de ficha">
      <button class="active" type="button" id="tab-clinical" role="tab" aria-controls="clinical" aria-selected="true" data-tab="clinical">Agenda y piezas</button>
      <button type="button" id="tab-history" role="tab" aria-controls="history" aria-selected="false" tabindex="-1" data-tab="history">Historial</button>
      <button type="button" id="tab-treatments" role="tab" aria-controls="treatments" aria-selected="false" tabindex="-1" data-tab="treatments">Plan y presupuesto</button>
      <button type="button" id="tab-attachments" role="tab" aria-controls="attachments" aria-selected="false" tabindex="-1" data-tab="attachments">Radiografias</button>
      <button type="button" id="tab-payments" role="tab" aria-controls="payments" aria-selected="false" tabindex="-1" data-tab="payments">Pagos</button>
    </section>

    <section class="detail-card action-drawer" id="actionDrawer" role="region" hidden></section>

    <section class="patient-detail-grid tab-panel active" role="tabpanel" tabindex="0" aria-labelledby="tab-clinical" id="clinical">
      ${renderPatientAppointments(summary)}

      <section class="detail-card">
        <div class="section-heading"><div><span class="eyebrow">Odontograma</span><h2>Piezas observadas</h2></div><span class="pill">FDI</span></div>
        <div class="odontogram" aria-label="Odontograma simplificado">${renderOdontogram(selectedTooth, summary.treatments)}</div>
        <div class="tooth-note" id="toothNote"><strong>Pieza ${DentalAPI.escapeHtml(selectedTooth)}</strong><span>${DentalAPI.escapeHtml(treatment?.plan_notes || "Sin observaciones registradas para esta pieza.")}</span></div>
      </section>
      <aside class="detail-card">
        <div class="section-heading"><div><span class="eyebrow">Antecedentes</span><h2>Ficha medica</h2></div></div>
        <div class="medical-stack">
          <article class="summary-block"><strong>Alergias</strong><p>${DentalAPI.escapeHtml(patient.allergies || "No registra alergias medicamentosas.")}</p></article>
          <article class="summary-block ${patient.active_alert ? "alert-line" : ""}"><strong>Condiciones</strong><p>${DentalAPI.escapeHtml(patient.medical_notes || "Sin antecedentes registrados.")}</p></article>
          <article class="summary-block"><strong>Observaciones</strong><p>${DentalAPI.escapeHtml(treatment?.plan_notes || "Sin observaciones clinicas adicionales.")}</p></article>

        </div>
      </aside>
    </section>

    <section class="patient-detail-grid tab-panel" role="tabpanel" tabindex="0" aria-labelledby="tab-history" id="history">
      <section class="detail-card wide-card"><div class="section-heading"><div><span class="eyebrow">Por pieza y tratamiento</span><h2>Historial del paciente</h2></div><button class="text-button" data-action="session">Agregar nota clinica</button></div>
        <div class="history-filters"><label>Buscar tratamiento o pieza<input type="search" id="historySearch" value="${DentalAPI.escapeHtml(historySearch)}" placeholder="Ej. Endodoncia o 36" /></label><label>Estado<select id="historyFilter"><option value="all">Todos</option><option value="active">En curso y planificados</option><option value="completed">Finalizados</option><option value="cancelled">Cancelados</option></select></label></div>
        <div class="history-list">${renderTreatmentHistory(summary)}</div><p id="historyEmpty" class="empty-state" hidden>No hay tratamientos con estos filtros.</p>
        <details class="unlinked-history"><summary>Otros registros y notas generales</summary>${summary.appointments.filter(item => !item.patient_treatment_id).map(item => `<p>${DentalAPI.date(item.starts_at)} · ${DentalAPI.escapeHtml(item.reason || "Control general")} · ${DentalAPI.escapeHtml(DentalAPI.statusLabel(item.status))}</p>`).join("")}${renderSessions(summary.sessions.filter(item => !item.patient_treatment_id), summary.treatments)}</details>
      </section>
    </section>
    <section class="patient-detail-grid tab-panel" role="tabpanel" tabindex="0" aria-labelledby="tab-treatments" id="treatments">
      <section class="detail-card wide-card">
        <div class="section-heading"><div><span class="eyebrow">Plan</span><h2 id="treatmentsHeading">Tratamientos</h2></div><button class="text-button" type="button" data-action="treatment">Nuevo tratamiento</button></div>
        <div class="treatment-plan">${renderTreatments(summary.treatments)}</div>
      </section>
      <aside class="detail-card"><div class="section-heading"><div><span class="eyebrow">Presupuesto</span><h2>Resumen financiero</h2></div></div><div class="money-list"><div><span>Total plan</span><strong>${DentalAPI.money(totalTreatments(summary))}</strong></div><div><span>Pagado</span><strong>${DentalAPI.money(totalPayments(summary))}</strong></div><div><span>Pendiente</span><strong>${DentalAPI.money(balance(summary))}</strong></div></div></aside>
    </section>

    <section class="patient-detail-grid tab-panel" role="tabpanel" tabindex="0" aria-labelledby="tab-attachments" id="attachments">
      <section class="detail-card wide-card">
        <div class="section-heading"><div><span class="eyebrow">Radiografias</span><h2 id="attachmentsHeading">Imagenes y documentos</h2></div><button class="text-button" type="button" data-action="attachment">Adjuntar archivo</button></div>
        ${renderAttachments(summary.attachments)}
      </section>
      <aside class="detail-card"><div class="section-heading"><div><span class="eyebrow">Adjuntos</span><h2>Listado</h2></div></div><div class="attachment-table compact-table" role="table" aria-label="Adjuntos del paciente">${renderAttachmentRows(summary.attachments)}</div></aside>
    </section>

    <section class="patient-detail-grid tab-panel" role="tabpanel" tabindex="0" aria-labelledby="tab-payments" id="payments">
      <section class="detail-card wide-card">
        <div class="section-heading"><div><span class="eyebrow">Pagos</span><h2 id="paymentsHeading">Historial de abonos</h2></div><button class="text-button" type="button" data-action="payment">Registrar pago</button></div>
        <div class="payment-rows">${renderPayments(summary.payments)}</div>
      </section>
      <aside class="detail-card">
        <div class="section-heading"><div><span class="eyebrow">Saldo</span><h2>Por tratamiento</h2></div></div>
        <div class="financial-summary">
          <div class="money-list">
            <div><span>Presupuesto</span><strong>${DentalAPI.money(totalTreatments(summary))}</strong></div>
            <div><span>Abonos</span><strong>${DentalAPI.money(totalPayments(summary))}</strong></div>
            <div><span>Por pagar</span><strong>${DentalAPI.money(balance(summary))}</strong></div>
          </div>
          <div class="balance-stack">${renderTreatmentBalances(summary)}</div>
        </div>
      </aside>
    </section>
  `;

  document.querySelector("#exportClinicalBtn").addEventListener("click", () => {
    try { DentalClinicalExport.print(currentSummary); }
    catch (error) { window.alert(error.message); }
  });
  bindTabs();
  document.querySelector(`[data-tab="${patientActiveTab}"]`)?.click();
  document.querySelector("#historyFilter").value = historyFilter;
  document.querySelector("#historyFilter").addEventListener("change", event => { historyFilter = event.target.value; filterPatientHistory(); });
  document.querySelector("#historySearch").addEventListener("input", event => { historySearch = event.target.value; filterPatientHistory(); });
  filterPatientHistory();
  document.querySelectorAll("[data-finish-history]").forEach(button => button.addEventListener("click", async () => {
    if (!window.confirm("Finalizar este tratamiento? Su historial y pagos se conservaran.")) return;
    button.disabled = true;
    try { await DentalAPI.put(`/api/patient-treatments/${button.dataset.finishHistory}`, {status:"completed", end_date:localDateString()}); await loadPatient(); }
    catch (error) { document.querySelector(`[data-history-message="${button.dataset.finishHistory}"]`).textContent = error.message; button.disabled = false; }
  }));
  bindOdontogram();
  bindActions();
  bindTreatmentEditors();
  bindQuickEvolution();
  bindAttachmentActions();
  bindPatientAppointmentActions();
}

function bindTabs() {
  const tabButtons = Array.from(document.querySelectorAll("[data-tab]"));
  const tabPanels = document.querySelectorAll(".tab-panel");
  const activate = (button, focus = false) => {
    patientActiveTab = button.dataset.tab;
    tabButtons.forEach((item) => {
      const selected = item === button;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
    tabPanels.forEach((panel) => panel.classList.toggle("active", panel.id === patientActiveTab));
    if (focus) button.focus();
  };
  tabButtons.forEach((button, index) => {
    button.addEventListener("click", () => activate(button));
    button.addEventListener("keydown", (event) => {
      const movement = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabButtons.length - 1 : movement == null ? null : (index + movement + tabButtons.length) % tabButtons.length;
      if (next == null) return;
      event.preventDefault();
      activate(tabButtons[next], true);
    });
  });
}

function bindOdontogram() {
  const toothButtons = document.querySelectorAll("[data-tooth]");
  const toothNote = document.querySelector("#toothNote");
  toothButtons.forEach((button) => {
    button.addEventListener("click", () => {
      toothButtons.forEach((item) => item.classList.toggle("selected", item === button));
      const code = button.dataset.tooth;
      selectedToothForAppointment = code;
      const treatment = currentSummary.treatments.find((item) => String(item.tooth_code) === String(code));
      toothNote.innerHTML = treatment
         ? `<strong>Pieza ${DentalAPI.escapeHtml(code)} · ${DentalAPI.escapeHtml(treatment.title)}</strong><span class="tooth-status">${DentalAPI.escapeHtml(DentalAPI.statusLabel(treatment.status))}</span><p>${DentalAPI.escapeHtml(treatment.plan_notes || treatment.diagnosis || "Sin observaciones registradas para esta pieza.")}</p><div class="tooth-note-actions"><button class="text-button primary-action" type="button" data-action="appointment" data-tooth-code="${DentalAPI.escapeHtml(code)}">Agendar tratamiento para esta pieza</button>${treatment.status !== "completed" && treatment.status !== "cancelled" ? `<button class="text-button success-action" type="button" data-complete-tooth-treatment="${treatment.id}">Finalizar tratamiento</button>` : ""}</div>`
        : `<strong>Pieza ${DentalAPI.escapeHtml(code)}</strong><span>Sin tratamiento asociado</span><p>${DentalAPI.escapeHtml("Puedes agendar un tratamiento para esta pieza desde esta ficha.")}</p><button class="text-button primary-action" type="button" data-action="appointment" data-tooth-code="${DentalAPI.escapeHtml(code)}">Agendar tratamiento para esta pieza</button>`;
      toothNote.querySelector('[data-action="appointment"]').addEventListener("click", () => {
        renderActionForm("appointment");
      });
      const completeButton = toothNote.querySelector("[data-complete-tooth-treatment]");
      if (completeButton) {
        completeButton.addEventListener("click", async () => {
          if (!window.confirm(`Finalizar ${treatment.title} de la pieza ${code}?`)) return;
          completeButton.disabled = true;
          completeButton.textContent = "Finalizando...";
          try {
            await DentalAPI.put(`/api/patient-treatments/${treatment.id}`, {
              status: "completed",
              end_date: DentalAPI.localDateString()
            });
            await loadPatient();
          } catch (error) {
            window.alert(error.message);
            completeButton.disabled = false;
            completeButton.textContent = "Finalizar tratamiento";
          }
        });
      }
    });
  });
}
function bindActions() {
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      if (action === "appointment") selectedToothForAppointment = button.dataset.toothCode || null;
      if (action === "deactivate") {
        const patientName = DentalAPI.fullName(currentSummary.patient);
        const confirmed = window.confirm(`Desactivar a ${patientName}? La ficha quedara oculta del listado activo, pero sus datos seguiran guardados en SQLite.`);
        if (!confirmed) return;
        button.disabled = true;
        try {
          await DentalAPI.del(`/api/patients/${currentSummary.patient.id}`);
          window.location.href = "./pacientes.html";
        } catch (error) {
          window.alert(error.message);
          button.disabled = false;
        }
        return;
      }

      if (action === "complete-appointment") {
        const appointment = selectedAppointment();
        if (!appointment) return;
        const confirmed = window.confirm("Marcar esta cita como atendida sin registrar evolucion clinica?");
        if (!confirmed) return;
        button.disabled = true;
        try {
          await DentalAPI.put(`/api/appointments/${appointment.id}`, {
            status: "attended"
          });
          await loadPatient();
        } catch (error) {
          window.alert(error.message);
          button.disabled = false;
        }
        return;
      }

      renderActionForm(action, button.dataset.entityId || null);
    });
  });
}

function bindTreatmentEditors() {
  document.querySelectorAll("[data-save-patient-treatment]").forEach((button) => {
    button.addEventListener("click", async () => {
      const treatmentId = Number(button.dataset.savePatientTreatment);
      const card = button.closest("[data-patient-treatment-card]");
      const message = card.querySelector("[data-treatment-message]");
      button.disabled = true;
      message.textContent = "Guardando...";

      try {
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
        message.textContent = "Tratamiento actualizado.";
        await loadPatient();
      } catch (error) {
        message.textContent = error.message;
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll("[data-complete-patient-treatment]").forEach((button) => {
    button.addEventListener("click", async () => {
      const treatmentId = Number(button.dataset.completePatientTreatment);
      const card = button.closest("[data-patient-treatment-card]");
      const message = card.querySelector("[data-treatment-message]");
      button.disabled = true;
      message.textContent = "Finalizando...";

      try {
        await DentalAPI.put(`/api/patient-treatments/${treatmentId}`, {
          status: "completed",
          end_date: DentalAPI.localDateString()
        });
        message.textContent = "Tratamiento finalizado.";
        await loadPatient();
      } catch (error) {
        message.textContent = error.message;
        button.disabled = false;
      }
    });
  });
}

function sessionPayloadFromForm(form, patientId) {
  const data = cleanFormData(form);
  return {
    ...data,
    patient_id: patientId,
    patient_treatment_id: data.patient_treatment_id ? Number(data.patient_treatment_id) : null,
    session_date: String(data.session_date || todayForInput()).replace("T", " ")
  };
}

function bindQuickEvolution() {
  const form = document.querySelector("#quickEvolutionForm");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const patientId = currentSummary.patient.id;
    const appointment = selectedAppointment();
    const submitButton = form.querySelector("button[type='submit']");
    const status = form.querySelector("#quickEvolutionStatus");
    submitButton.disabled = true;
    status.textContent = "Guardando evolucion...";

    try {
      const payload = sessionPayloadFromForm(form, patientId);
      payload.session_date = todayForInput().replace("T", " ");
      if (appointment?.status === "scheduled") {
        await DentalAPI.post(`/api/appointments/${appointment.id}/attend`, payload);
      } else {
        await DentalAPI.post("/api/clinical-sessions", payload);
      }
      status.textContent = "Evolucion guardada.";
      await loadPatient();
    } catch (error) {
      status.textContent = error.message;
      submitButton.disabled = false;
    }
  });
}

function bindAttachmentActions() {
  document.querySelectorAll("[data-delete-patient-attachment]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm("Eliminar este registro de adjunto de la ficha? El archivo local puede permanecer en la carpeta media.")) return;
      button.disabled = true;
      try {
        await DentalAPI.del(`/api/attachments/${button.dataset.deletePatientAttachment}`);
        await loadPatient();
      } catch (error) {
        window.alert(error.message);
        button.disabled = false;
      }
    });
  });
}

async function bindActionForm(returnFocus) {
  const drawer = document.querySelector("#actionDrawer");
  const closeButtons = drawer.querySelectorAll("[data-action-close]");
  const form = drawer.querySelector("[data-form]");
  const status = drawer.querySelector(".form-status");

  const closeDrawer = () => {
    drawer.hidden = true;
    drawer.innerHTML = "";
    drawer.removeAttribute("aria-labelledby");
    if (returnFocus?.isConnected) returnFocus.focus();
  };
  closeButtons.forEach((closeButton) => closeButton.addEventListener("click", closeDrawer));
  drawer.onkeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDrawer();
    }
  };

  if (form.dataset.form === "appointment") bindAppointmentPriceForm(form);
  if (form.dataset.form === "payment") {
    const treatmentSelect = form.elements.patient_treatment_id;
    const amountInput = form.elements.amount;
    const treatmentDue = form.querySelector("[data-payment-treatment-balance]");
    const treatmentNote = form.querySelector("[data-payment-treatment-note]");
    const patientDue = form.querySelector("[data-payment-patient-balance]");
    const updateBalances = () => {
      const selected = currentSummary.treatments.find((item) => Number(item.id) === Number(treatmentSelect.value));
      const selectedDue = selected ? treatmentBalance(currentSummary, selected) : 0;
      const totalDue = balance(currentSummary);
      treatmentDue.textContent = DentalAPI.money(selectedDue);
      treatmentNote.textContent = selected
        ? `Total ${DentalAPI.money(treatmentTotal(selected))} · abonado ${DentalAPI.money(treatmentPaid(currentSummary, selected.id))}`
        : "Pago general sin tratamiento";
      patientDue.textContent = DentalAPI.money(totalDue);
      amountInput.value = (selected ? selectedDue : totalDue) || "";
    };
    treatmentSelect.addEventListener("change", updateBalances);
    updateBalances();
  }
  form.addEventListener("input", () => {
    if (status.dataset.state === "error") {
      status.textContent = "";
      delete status.dataset.state;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const action = form.dataset.form;
    const patientId = currentSummary.patient.id;
    const submitButton = form.querySelector("button[type='submit']");

    status.textContent = "Guardando...";
    status.dataset.state = "working";
    submitButton.disabled = true;

    try {
      await saveAction(action, form, patientId, submitButton);
      status.textContent = "Guardado correctamente.";
      status.dataset.state = "success";
      await loadPatient();
    } catch (error) {
      status.textContent = error.message;
      status.dataset.state = "error";
      submitButton.disabled = submitButton.dataset.appointmentSaved === "true";
      if (submitButton.disabled) status.textContent = `La cita fue guardada. No se pudo adjuntar el archivo: ${error.message}. Puedes adjuntarlo desde Radiografias.`;
    }
  });
}

async function loadPatient() {
  patientPage.innerHTML = `<p class="empty-state">Cargando ficha desde SQLite...</p>`;
  const [summary, catalog] = await Promise.all([
    DentalAPI.get(`/api/patients/${getPatientId()}/summary`),
    DentalAPI.get("/api/treatment-catalog")
  ]);
  currentCatalog = catalog;

  if (summary.error) {
    patientPage.innerHTML = `<p class="empty-state">${DentalAPI.escapeHtml(summary.error)}</p>`;
    return;
  }

  renderPatient(summary);
}

loadPatient().catch((error) => {
  patientPage.innerHTML = `<p class="empty-state">No se pudo cargar la ficha: ${DentalAPI.escapeHtml(error.message)}</p>`;
});

