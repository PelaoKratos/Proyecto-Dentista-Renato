const calendarRoot = document.querySelector("#dashboardCalendar");
const calendarPeriod = document.querySelector("#calendarPeriod");
const globalSearch = document.querySelector("#globalSearch");
const searchResults = document.querySelector("#searchResults");
const auditActivityList = document.querySelector("#auditActivityList");
const calendarFeedback = document.querySelector("#calendarFeedback");
document.querySelector("#dashboardDate").textContent = new Date().toLocaleDateString("es-CL", {
  weekday: "long", day: "numeric", month: "long", year: "numeric"
});

let patients = [];
let appointments = [];
let overdueAppointments = [], calendarLoadVersion = 0;
let treatments = [];
let catalog = [];
let calendarView = "week";
let selectedDate = new Date();

const weekdayLabels = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const monthNames = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];
const businessHours = Array.from({ length: 15 }, (_, index) => `${String(9 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);

const auditLabels = {
  starts_at: "fecha y hora", ends_at: "hora de término", reason: "motivo", status: "estado",
  title: "nombre", tooth_code: "piezas", estimated_price: "valor estimado", final_price: "valor final",
  start_date: "inicio", end_date: "término", payment_date: "fecha de pago", amount: "monto",
  method: "método de pago", procedure_allocations_json: "asignación a procedimientos"
};

function auditValue(key, value) {
  if (key === "procedure_allocations_json") return `${ProcedurePayments.parse(value).length} asignaciones`;
  if (value === null || value === undefined || value === "") return "vacío";
  if (key.endsWith("_price") || key === "amount") return DentalAPI.money(value);
  if (key === "status") return DentalAPI.statusLabel(value);
  if (key === "starts_at" || key === "ends_at") return `${DentalAPI.date(value)} ${DentalAPI.time(value)}`.trim();
  if (key === "start_date" || key === "end_date" || key === "payment_date") return DentalAPI.date(value);
  return String(value);
}

function auditSummary(entry) {
  const before = entry.before_json ? JSON.parse(entry.before_json) : {};
  const after = entry.after_json ? JSON.parse(entry.after_json) : {};
  const source = entry.action === "deleted" ? before : after;
  const type = entry.entity_type === "appointment" ? "Cita" : entry.entity_type === "treatment" ? "Tratamiento" : "Pago";
  const verbs = {
    appointment: { created: "agendada", updated: "actualizada", deleted: "eliminada" },
    treatment: { created: "creado", updated: "actualizado", deleted: "eliminado" },
    payment: { created: "registrado", updated: "actualizado", deleted: "eliminado" }
  };
  const verb = verbs[entry.entity_type]?.[entry.action] || entry.action;
  const priority = entry.entity_type === "appointment" ? ["starts_at", "status", "reason"]
    : entry.entity_type === "treatment" ? ["status", "tooth_code", "final_price", "estimated_price", "start_date", "end_date"]
      : ["payment_date", "amount", "method", "procedure_allocations_json"];
  const keys = priority.filter((key) => Object.hasOwn(source, key) &&
    (entry.action !== "updated" || before[key] !== after[key]));
  if (entry.action === "updated" && before.title !== after.title && Object.hasOwn(after, "title")) keys.unshift("title");
  const details = keys.slice(0, 4).map((key) => entry.action === "updated"
    ? `${auditLabels[key]}: ${auditValue(key, before[key])} → ${auditValue(key, after[key])}`
    : `${auditLabels[key]}: ${auditValue(key, source[key])}`);
  return { type, verb, title: source.title || source.reason || `${type} #${entry.entity_id}`,
    details: details.join(" · ") };
}

async function loadAuditActivity() {
  try {
    const entries = await DentalAPI.get("/api/audit-log");
    auditActivityList.innerHTML = entries.length ? entries.slice(0, 20).map((entry) => {
      const summary = auditSummary(entry);
      const patient = entry.first_name ? DentalAPI.patientLink(entry.patient_id,
        `${entry.first_name} ${entry.last_name || ""}`.trim()) : "Paciente";
      const date = new Date(String(entry.created_at).replace(" ", "T") + "Z");
      const when = Number.isNaN(date.getTime()) ? DentalAPI.escapeHtml(entry.created_at)
        : DentalAPI.escapeHtml(date.toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }));
      return `<li><div><strong>${DentalAPI.escapeHtml(summary.title)}</strong><span>${patient}</span></div><p>${summary.type} ${summary.verb}${summary.details ? ` · ${DentalAPI.escapeHtml(summary.details)}` : ""}</p><time>${when}</time></li>`;
    }).join("") : "<li>No hay cambios registrados todavía.</li>";
  } catch (error) {
    auditActivityList.innerHTML = `<li>No se pudo cargar el historial: ${DentalAPI.escapeHtml(error.message)}</li>`;
  }
}

function showCalendarFeedback(message, state = "success") {
  calendarFeedback.textContent = message;
  calendarFeedback.dataset.state = state;
}

function dateKey(value) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function addDays(value, amount) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function changeMonth(amount) {
  const currentDay = selectedDate.getDate();
  const target = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + amount, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(currentDay, lastDay));
  selectedDate = target;
}

function mondayOf(value) {
  const monday = new Date(value);
  const weekday = monday.getDay() || 7;
  monday.setDate(monday.getDate() - weekday + 1);
  return monday;
}

function appointmentsOn(value) {
  return appointments
    .filter((appointment) => String(appointment.starts_at || "").startsWith(dateKey(value)))
    .sort((first, second) =>
      String(first.starts_at || "").localeCompare(String(second.starts_at || "")) || Number(first.id) - Number(second.id));
}

function patientFor(appointment) {
  return patients.find((patient) => Number(patient.id) === Number(appointment.patient_id));
}

function appointmentCard(appointment, showStatus) {
  const patient = patientFor(appointment);
  const status = appointment.status || "scheduled";
  const statusMarkup = showStatus
    ? `<small>${DentalAPI.time(appointment.starts_at)} · ${DentalAPI.statusLabel(status)}</small>`
    : "";

  return `
    <button type="button" class="calendar-appointment status-${status}" data-calendar-appointment="${Number(appointment.id)}" aria-label="Abrir acciones de la cita de ${DentalAPI.escapeHtml(patient ? DentalAPI.fullName(patient) : "Paciente")}">
      <strong>${DentalAPI.escapeHtml(patient ? DentalAPI.fullName(patient) : "Paciente")}</strong>
      <span>${DentalAPI.escapeHtml(appointment.reason || "Atencion dental")}</span>
      ${statusMarkup}
    </button>
  `;
}

function bookSlotButton(day, hour, daily = false) {
  const start = new Date(`${dateKey(day)}T${hour}:00`).getTime();
  const occupied = appointmentsOn(day).some((appointment) => {
    if (appointment.status === "cancelled") return false;
    const bookedStart = new Date(String(appointment.starts_at || "").replace(" ", "T")).getTime();
    const bookedEnd = appointment.ends_at
      ? new Date(String(appointment.ends_at).replace(" ", "T")).getTime() : bookedStart + 30 * 60000;
    return start < bookedEnd && bookedStart < start + 30 * 60000;
  });
  if (occupied && hour !== "16:00") return "";
  const label = occupied ? "+ Otro paciente" : `+ Agendar${daily ? " cita" : ""}`;
  return `<button type="button" class="calendar-book-slot${occupied ? " occupied" : ""}" data-calendar-book data-date="${dateKey(day)}" data-hour="${hour}" aria-label="${occupied ? "Agendar otro paciente" : "Agendar cita"} el ${dateKey(day)} a las ${hour}">${label}</button>`;
}

function renderMonth() {
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const offset = (firstDay.getDay() || 7) - 1;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let index = 0; index < 42; index += 1) {
    const dayNumber = index - offset + 1;
    if (dayNumber < 1 || dayNumber > lastDay) {
      cells.push('<div class="month-cell empty"></div>');
      continue;
    }

    const day = new Date(year, month, dayNumber);
    const dayAppointments = appointmentsOn(day);
    const todayClass = dateKey(day) === dateKey(new Date()) ? " today" : "";
    cells.push(`
      <div class="month-cell${todayClass}">
        <span class="month-day">${dayNumber}</span>
        ${dayAppointments.map((appointment) => appointmentCard(appointment, true)).join("")}
      </div>
    `);
  }

  calendarRoot.innerHTML = `
    <div class="month-grid">
      <div class="month-weekdays">${weekdayLabels.map((label) => `<span>${label}</span>`).join("")}</div>
      <div class="month-cells">${cells.join("")}</div>
    </div>
  `;
  calendarPeriod.textContent = `${monthNames[month]} ${year}`;
}

function renderWeek() {
  const firstDay = mondayOf(selectedDate);
  const days = Array.from({ length: 7 }, (_, index) => addDays(firstDay, index));
  const header = days.map((day) => `
    <span class="week-day">${weekdayLabels[(day.getDay() || 7) - 1]}<b>${day.getDate()}</b></span>
  `).join("");
  const rows = businessHours.map((hour) => {
    const slots = days.map((day) => {
      const hourAppointments = appointmentsOn(day).filter((appointment) =>
        String(appointment.starts_at || "").slice(11, 16) === hour
      );
      return `<div class="week-slot">${hourAppointments.map((appointment) => appointmentCard(appointment, false)).join("")}${bookSlotButton(day, hour)}</div>`;
    }).join("");
    return `<div class="week-row"><time>${hour}</time>${slots}</div>`;
  }).join("");
  const outside = days.map((day) => appointmentsOn(day).filter((appointment) => !businessHours.includes(String(appointment.starts_at || "").slice(11, 16))));
  const outsideRow = outside.some((items) => items.length)
    ? `<div class="week-row outside-hours-row"><time>Otro horario</time>${outside.map((items) => `<div class="week-slot">${items.map((item) => appointmentCard(item, true)).join("")}</div>`).join("")}</div>`
    : "";

  calendarRoot.innerHTML = `
    <div class="week-grid">
      <div class="week-header"><span></span>${header}</div>
      ${rows}
      ${outsideRow}
    </div>
  `;
  const lastDay = days[days.length - 1];
  calendarPeriod.textContent = `${firstDay.getDate()} de ${monthNames[firstDay.getMonth()]} – ${lastDay.getDate()} de ${monthNames[lastDay.getMonth()]} de ${lastDay.getFullYear()}`;
}

function renderDay() {
  const rows = businessHours.map((hour) => {
    const hourAppointments = appointmentsOn(selectedDate).filter((appointment) =>
      String(appointment.starts_at || "").slice(11, 16) === hour
    );
    return `
      <div class="day-row">
        <time>${hour}</time>
        <div>${hourAppointments.map((appointment) => appointmentCard(appointment, true)).join("")}${bookSlotButton(selectedDate, hour, true)}</div>
      </div>
    `;
  }).join("");

  const outside = appointmentsOn(selectedDate).filter((appointment) => !businessHours.includes(String(appointment.starts_at || "").slice(11, 16)));
  const outsideRow = outside.length ? `<div class="day-row outside-hours-row"><time>Otro horario</time><div>${outside.map((item) => appointmentCard(item, true)).join("")}</div></div>` : "";
  calendarRoot.innerHTML = `<div class="day-grid">${rows}${outsideRow}</div>`;
  calendarPeriod.textContent = selectedDate.toLocaleDateString("es-CL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
}

function renderCalendar() {
  if (calendarView === "month") renderMonth();
  else if (calendarView === "day") renderDay();
  else renderWeek();

  document.querySelectorAll("[data-calendar-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.calendarView === calendarView);
  });
  renderTodayFollowups();
}

function renderTodayFollowups() {
  const pending = overdueAppointments.filter((appointment) =>
    appointment.status === "scheduled" &&
    new Date(String(appointment.starts_at || "").replace(" ", "T")) < new Date());
  document.querySelector("#todayFollowupsCount").textContent = String(pending.length);
  document.querySelector("#todayFollowupsList").innerHTML = pending.length
    ? pending.map((appointment, index) => {
      const patient = patientFor(appointment);
      return `<a href="./paciente.html?id=${Number(appointment.patient_id)}&appointment=${Number(appointment.id)}">
        <time>${String(appointment.starts_at).slice(0,10) !== dateKey(new Date()) ? DentalAPI.date(appointment.starts_at, {day:"2-digit",month:"short"}) + " · " : ""}${String(appointment.starts_at).slice(11,16)}</time>
        <span><strong>${DentalAPI.escapeHtml(patient ? DentalAPI.fullName(patient) : "Paciente")}</strong><small>${DentalAPI.escapeHtml(appointment.reason || "Atención dental")}</small></span>
        <span class="today-followups-action">Abrir ficha →</span>
      </a>`;
    }).map((markup, index) => index === 3 ? `<details><summary>Ver ${pending.length - 3} pendientes más</summary>${markup}` : markup).join("") + (pending.length > 3 ? "</details>" : "")
    : "<p>Sin atenciones pendientes de registrar hasta esta hora.</p>";
}

function calendarQuery() {
  const start = calendarView === "month" ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1) : calendarView === "week" ? mondayOf(selectedDate) : selectedDate;
  const end = calendarView === "month" ? new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0) : calendarView === "week" ? addDays(start, 6) : selectedDate;
  return `/api/appointments?${new URLSearchParams({ date_from: dateKey(start), date_to: dateKey(end) })}`;
}
async function loadCalendarPeriod() {
  const version = ++calendarLoadVersion;
  calendarRoot.setAttribute("aria-busy", "true");
  calendarRoot.innerHTML = '<p class="empty-state">Cargando citas del período…</p>';
  try {
    const rows = await DentalAPI.get(calendarQuery());
    if (version !== calendarLoadVersion) return;
    appointments = rows; renderCalendar();
  } catch (error) {
    if (version === calendarLoadVersion) calendarRoot.innerHTML = `<p class="empty-state">No se pudo cargar el calendario: ${DentalAPI.escapeHtml(error.message)}</p>`;
    throw error;
  } finally { if (version === calendarLoadVersion) calendarRoot.setAttribute("aria-busy", "false"); }
}
async function loadOverdueAppointments() {
  const now = new Date();
  overdueAppointments = await DentalAPI.get(`/api/appointments?${new URLSearchParams({ overdue_before: `${dateKey(now)}T${now.toTimeString().slice(0,8)}` })}`);
  renderTodayFollowups();
}
function requestCalendarPeriod() { loadCalendarPeriod().catch(error => showCalendarFeedback(error.message, "error")); }
window.addEventListener("pageshow", (event) => {
  if (event.persisted) refreshCalendarData().catch(error => showCalendarFeedback(error.message, "error"));
});

function renderSearchResults(query) {
  if (!query) {
    searchResults.hidden = true;
    searchResults.innerHTML = "";
    return;
  }

  const matches = patients
    .filter((patient) => matchesPatient(patient, query))
    .slice(0, 8);

  searchResults.hidden = false;
  searchResults.innerHTML = matches.length
    ? matches.map((patient) => `
        <article class="search-result">
          <span class="avatar">${DentalAPI.initials(patient)}</span>
          <div>
            <strong>${DentalAPI.patientLink(patient.id, DentalAPI.fullName(patient))}</strong>
            <small>${DentalAPI.escapeHtml(patient.rut || "Sin RUT")} · ${DentalAPI.escapeHtml(patient.phone || "Sin telefono")}</small>
          </div>
          <div class="search-result-actions">
            <a href="./paciente.html?id=${patient.id}">Ficha</a>
            <a href="./paciente.html?id=${patient.id}&action=appointment">Agendar</a>
          </div>
        </article>
      `).join("")
    : '<p class="empty-state">No se encontraron pacientes.</p>';
}

function normalizedSearch(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function rutCharacters(value) {
  return String(value || "").toUpperCase().replace(/[^0-9K]/g, "");
}

function matchesPatient(patient, query) {
  const text = normalizedSearch(query);
  return normalizedSearch(`${DentalAPI.fullName(patient)} ${patient.rut || ""} ${patient.phone || ""}`).includes(text) ||
    /\d/.test(query) && rutCharacters(patient.rut).includes(rutCharacters(query));
}

function formatRut(value) {
  const characters = rutCharacters(value);
  if (characters.length < 2) return characters;
  const verifier = characters.slice(-1);
  const number = characters.slice(0, -1).replace(/K/g, "");
  return `${number.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${verifier}`;
}

const appointmentDialog = document.querySelector("#calendarAppointmentDialog");
const appointmentMenu = document.querySelector("#calendarAppointmentMenu");
let menuAppointmentId = null;

function menuAppointment() {
  return appointments.find((item) => Number(item.id) === menuAppointmentId);
}

function menuTreatment(appointment = menuAppointment()) {
  return treatments.find((item) => Number(item.id) === Number(appointment?.patient_treatment_id));
}

async function refreshCalendarData() {
  const [,, loadedTreatments] = await Promise.all([
    loadCalendarPeriod(), loadOverdueAppointments(), DentalAPI.get("/api/patient-treatments")
  ]);
  treatments = loadedTreatments;
  const stats = await DentalAPI.get(`/api/dashboard-stats?date=${dateKey(new Date())}`);
  document.querySelector("#metricToday").textContent = stats.today_appointments;
  document.querySelector("#metricTodayNote").textContent = `${stats.scheduled_appointments} citas confirmadas hoy`;
  document.querySelector("#metricTreatments").textContent = stats.active_treatments;
  document.querySelector("#metricTreatmentsNote").textContent = `${stats.in_progress_treatments} en curso`;
  document.querySelector("#metricBalance").textContent = DentalAPI.money(stats.pending_balance);
}

function renderAppointmentMenu(message = "") {
  const appointment = menuAppointment();
  if (!appointment) return appointmentDialog.close();
  const treatment = menuTreatment(appointment);
  const patient = patientFor(appointment);
  const scheduled = appointment.status === "scheduled";
  const activeTreatment = treatment && !["completed", "cancelled"].includes(treatment.status);
  const hasPendingTreatmentAppointments = treatment && appointments.some((item) =>
    Number(item.patient_treatment_id) === Number(treatment.id) && item.status === "scheduled" && Number(item.id) !== Number(appointment.id));
  const canPay = treatments.some((item) => Number(item.patient_id) === Number(appointment.patient_id) &&
    (item.final_price != null || item.estimated_price != null));
  appointmentMenu.innerHTML = `
    <header class="appointment-menu-header">
      <div><span class="eyebrow">Cita · ${DentalAPI.date(appointment.starts_at)} · ${DentalAPI.time(appointment.starts_at)}</span>
      <h2 id="calendarAppointmentTitle">${DentalAPI.escapeHtml(patient ? DentalAPI.fullName(patient) : "Paciente")}</h2>
      <p>${DentalAPI.escapeHtml(appointment.reason || "Atención dental")} · ${DentalAPI.escapeHtml(DentalAPI.statusLabel(appointment.status))}</p></div>
      <button class="text-button" type="button" data-menu-close aria-label="Cerrar menú">Cerrar</button>
    </header>
    <div class="appointment-menu-actions">
      ${scheduled ? '<button class="text-button primary-action" type="button" data-menu-action="register">Registrar atención</button>' : ""}
      ${appointment.status === "attended" ? '<button class="text-button" type="button" data-menu-action="session">Registrar evolución</button>' : ""}
      ${scheduled || appointment.status === "missed" ? '<button class="text-button" type="button" data-menu-action="attended">Marcar atendida sin evolución</button>' : ""}
      ${scheduled ? '<button class="text-button" type="button" data-menu-action="missed">No asistió</button><button class="text-button" type="button" data-menu-action="reschedule">Cambiar fecha</button>' : ""}
      ${appointment.status === "attended" && activeTreatment ? `<button class="text-button success-action" type="button" data-menu-action="finish"${hasPendingTreatmentAppointments ? ' disabled title="Hay otras citas pendientes para este tratamiento"' : ""}>Finalizar tratamiento</button>` : ""}
      ${appointment.status !== "cancelled" ? `<button class="text-button" type="button" data-menu-action="next">${appointment.status === "missed" ? "Agendar otra cita" : "Agendar próxima cita"}</button>` : ""}
      ${canPay ? '<button class="text-button" type="button" data-menu-action="payment">Abonar</button>' : ""}
    </div>
    ${appointment.status === "attended" && hasPendingTreatmentAppointments ? '<p class="appointment-menu-note">Para finalizar este tratamiento, resuelve primero sus otras citas pendientes.</p>' : ""}
    <div class="appointment-menu-panel" data-menu-panel hidden></div>
    <p class="form-status" data-menu-status role="status" aria-live="polite">${DentalAPI.escapeHtml(message)}</p>
    <footer><a class="text-button link-button" href="./paciente.html?id=${Number(appointment.patient_id)}&appointment=${Number(appointment.id)}">Abrir ficha del paciente</a></footer>`;
}

function showMenuPanel(markup) {
  if (!window.UnsavedEdits.confirmDiscard({ only: "calendar-action-form" })) return;
  const panel = appointmentMenu.querySelector("[data-menu-panel]");
  panel.innerHTML = markup;
  panel.hidden = false;
  const form = panel.querySelector("form");
  if (form) window.UnsavedEdits.trackForm(form, { key: "calendar-action-form", active: () => appointmentDialog.open });
  panel.querySelector("input,select")?.focus();
}

function openNextBooking(appointment) {
  appointmentDialog.close();
  AppointmentBooking.open({ patientId: appointment.patient_id, treatmentId: appointment.patient_treatment_id, followup: appointment });
}

calendarRoot.addEventListener("click", (event) => {
  const button = event.target.closest("[data-calendar-appointment]");
  if (!button) return;
  menuAppointmentId = Number(button.dataset.calendarAppointment);
  renderAppointmentMenu();
  appointmentDialog.showModal();
});

appointmentMenu.addEventListener("click", async (event) => {
  if (event.target.closest("[data-menu-pay-full]")) {
    const form = event.target.closest("form");
    form.querySelectorAll("[data-menu-payment-row]").forEach((row) => {
      if (row.querySelector("[data-menu-payment-include]").checked) row.querySelector("[data-menu-payment-amount]").value = row.dataset.due;
    });
    updateAppointmentPaymentSummary(form);
    return;
  }
  if (event.target.closest("[data-menu-close]")) {
    if (window.UnsavedEdits.confirmDiscard({ only: "calendar-action-form" })) appointmentDialog.close();
    return;
  }
  const button = event.target.closest("[data-menu-action]");
  if (!button) return;
  if (!window.UnsavedEdits.confirmDiscard({ only: "calendar-action-form" })) return;
  const appointment = menuAppointment();
  if (!appointment) return;
  const treatment = menuTreatment(appointment);
  const action = button.dataset.menuAction;
  const status = appointmentMenu.querySelector("[data-menu-status]");
  if (action === "register") {
    window.location.href = `./paciente.html?id=${Number(appointment.patient_id)}&appointment=${Number(appointment.id)}&action=appointment-session`;
    return;
  }
  if (action === "session") {
    window.location.href = `./paciente.html?id=${Number(appointment.patient_id)}&appointment=${Number(appointment.id)}&action=session`;
    return;
  }
  if (action === "next") return openNextBooking(appointment);
  if (action === "reschedule") {
    const date = String(appointment.starts_at).slice(0, 10);
    const time = String(appointment.starts_at).slice(11, 16);
    showMenuPanel(`<form data-menu-form="reschedule"><h3>Cambiar fecha de la cita</h3>
      <label>Fecha<input name="date" type="date" value="${date}" required /></label>
      <label>Hora<select name="time">${businessHours.map((hour) => `<option value="${hour}"${hour === time ? " selected" : ""}>${hour}</option>`).join("")}</select></label>
      <button class="text-button primary-action" type="submit">Guardar nueva fecha</button></form>`);
    return;
  }
  if (action === "payment") {
    button.disabled = true;
    try {
      const payments = await DentalAPI.get(`/api/payments?patient_id=${Number(appointment.patient_id)}`);
      const patientTreatments = treatments.filter((item) => Number(item.patient_id) === Number(appointment.patient_id));
      const balances = patientTreatments.map((item) => {
        const paid = payments.filter((payment) => Number(payment.patient_treatment_id) === Number(item.id))
          .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        return { treatment: item, paid, due: Math.max(Number(item.final_price ?? item.estimated_price ?? 0) - paid, 0) };
      }).filter((item) => item.due > 0);
      const preferredTreatmentId = Number(treatment?.id);
      const rows = balances.map(({ treatment: item, paid, due }) => {
        const checked = Number(item.id) === preferredTreatmentId;
        return `<div class="payment-allocation-row" data-menu-payment-row data-treatment-id="${Number(item.id)}" data-title="${DentalAPI.escapeHtml(item.title)}" data-due="${due}">
          <label><input type="checkbox" data-menu-payment-include ${checked ? "checked" : ""} /><span><strong>${DentalAPI.escapeHtml(item.title)}</strong><small>Saldo pendiente ${DentalAPI.money(due)}</small></span></label>
          <label>Abono<input type="number" data-menu-payment-amount min="1" max="${due}" step="1" placeholder="Monto recibido" ${checked ? "" : "readonly"} /></label>
          ${ProcedurePayments.render(item, payments)}
        </div>`;
      }).join("");
      showMenuPanel(balances.length ? `<form data-menu-form="payment"><h3>Selecciona los tratamientos que vas a abonar</h3>
        <div class="payment-allocation-list" data-menu-payment-list>${rows}</div>
        <p class="payment-allocation-summary" data-menu-payment-summary>Selecciona uno o más tratamientos.</p>
        <button class="text-button" type="button" data-menu-pay-full>Pagar saldos seleccionados completos</button>
        <label>Método<select name="method"><option>Transferencia</option><option>Tarjeta</option><option>Efectivo</option><option>Otro</option></select></label>
        <button class="text-button primary-action" type="submit">Guardar abonos</button></form>`
        : "<p>Este paciente no tiene tratamientos con saldo pendiente.</p>");
      const paymentForm = appointmentMenu.querySelector('[data-menu-form="payment"]');
      if (paymentForm) {
        paymentForm.querySelectorAll("[data-menu-payment-row]").forEach((row) => {
          row.querySelectorAll("[data-procedure-part]").forEach((input) => { input.disabled = !row.querySelector("[data-menu-payment-include]").checked; });
        });
        updateAppointmentPaymentSummary(paymentForm);
      }
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
    return;
  }
  button.disabled = true;
  status.textContent = "Guardando…";
  try {
    if (action === "finish") {
      await DentalAPI.put(`/api/patient-treatments/${treatment.id}`, {
        status: "completed", end_date: DentalAPI.localDateString()
      });
    } else if (action === "attended" || action === "missed") {
      await DentalAPI.put(`/api/appointments/${appointment.id}`, { status: action });
    }
    await refreshCalendarData();
    renderAppointmentMenu(action === "finish" ? "Tratamiento finalizado." : action === "missed" ? "Inasistencia registrada." : "Cita marcada como atendida.");
    loadAuditActivity();
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
});

function updateAppointmentPaymentSummary(form) {
  const rows = [...form.querySelectorAll("[data-menu-payment-row]")];
  const selected = rows.filter((row) => row.querySelector("[data-menu-payment-include]").checked);
  const total = selected.reduce((sum, row) => sum + Number(row.querySelector("[data-menu-payment-amount]").value || 0), 0);
  selected.forEach((row) => ProcedurePayments.update(row, Number(row.querySelector("[data-menu-payment-amount]").value || 0)));
  const summary = form.querySelector("[data-menu-payment-summary]");
  if (summary) summary.textContent = selected.length
    ? `${selected.length} tratamiento${selected.length === 1 ? "" : "s"} seleccionado${selected.length === 1 ? "" : "s"} · Total a abonar: ${DentalAPI.money(total)}`
    : "Selecciona uno o más tratamientos.";
}

appointmentMenu.addEventListener("change", (event) => {
  const form = event.target.closest('[data-menu-form="payment"]');
  if (!form) return;
  if (event.target.matches("[data-menu-payment-include]")) {
    const row = event.target.closest("[data-menu-payment-row]");
    row.querySelector("[data-menu-payment-amount]").readOnly = !event.target.checked;
    row.querySelectorAll("[data-procedure-part]").forEach((input) => { input.disabled = !event.target.checked; });
  }
  updateAppointmentPaymentSummary(form);
});
appointmentMenu.addEventListener("input", (event) => {
  const form = event.target.closest('[data-menu-form="payment"]');
  if (form) updateAppointmentPaymentSummary(form);
});

appointmentMenu.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-menu-form]");
  if (!form) return;
  event.preventDefault();
  if (form.querySelector('button[type="submit"]').disabled) return;
  form.unsavedGuard.setBusy(true);
  const appointment = menuAppointment();
  const treatment = menuTreatment(appointment);
  const status = appointmentMenu.querySelector("[data-menu-status]");
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  status.textContent = "Guardando…";
  try {
    if (form.dataset.menuForm === "reschedule") {
      const start = `${form.elements.date.value} ${form.elements.time.value}`;
      const data = { starts_at: start };
      if (appointment.ends_at) {
        const duration = new Date(String(appointment.ends_at).replace(" ", "T")) - new Date(String(appointment.starts_at).replace(" ", "T"));
        const end = new Date(new Date(start.replace(" ", "T")).getTime() + duration);
        data.ends_at = `${dateKey(end)} ${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
      }
      await DentalAPI.put(`/api/appointments/${appointment.id}`, data);
      form.unsavedGuard.setBusy(false); form.unsavedGuard.markClean();
      selectedDate = new Date(`${form.elements.date.value}T12:00:00`);
      await refreshCalendarData();
      renderAppointmentMenu("Fecha de la cita actualizada.");
      loadAuditActivity();
    } else if (form.dataset.menuForm === "payment") {
      const rows = [...form.querySelectorAll("[data-menu-payment-row]")]
        .filter((row) => row.querySelector("[data-menu-payment-include]").checked);
      if (!rows.length) throw new Error("Selecciona al menos un tratamiento para abonar.");
      const allocations = rows.map((row) => {
        const amount = Number(row.querySelector("[data-menu-payment-amount]").value);
        const due = Number(row.dataset.due);
        if (!Number.isInteger(amount) || amount < 1 || amount > due) {
          throw new Error(`El abono de ${row.dataset.title} debe ser un monto entero entre $1 y ${DentalAPI.money(due)}.`);
        }
        return { patient_treatment_id: Number(row.dataset.treatmentId), amount, procedure_allocations: ProcedurePayments.read(row, amount) };
      });
      await DentalAPI.post("/api/payments/batch", { patient_id: Number(appointment.patient_id),
        payment_date: DentalAPI.localDateString(), method: form.elements.method.value,
        notes: "Abono registrado desde la agenda", allocations });
      form.unsavedGuard.setBusy(false); form.unsavedGuard.markClean();
      renderAppointmentMenu("Abono registrado correctamente.");
      loadAuditActivity();
    }
  } catch (error) {
    status.textContent = error.message;
    submit.disabled = false;
  } finally { form.unsavedGuard.setBusy(false); }
});
appointmentDialog.addEventListener("cancel", (event) => {
  if (!window.UnsavedEdits.confirmDiscard({ only: "calendar-action-form" })) event.preventDefault();
});

calendarRoot.addEventListener("click", (event) => {
  const button = event.target.closest("[data-calendar-book]");
  if (button) AppointmentBooking.open({ date: button.dataset.date, hour: button.dataset.hour });
});
document.addEventListener("dental:booking-saved", async (event) => {
  loadAuditActivity();
  showCalendarFeedback(event.detail.message);
  try { await refreshCalendarData(); }
  catch { showCalendarFeedback("Guardado. Recarga para actualizar el calendario.", "error"); }
});

globalSearch.addEventListener("input", () => renderSearchResults(globalSearch.value.trim()));
document.querySelector("#calendarToday").addEventListener("click", () => {
  selectedDate = new Date();
  requestCalendarPeriod();
});
document.querySelector("#calendarPrev").addEventListener("click", () => {
  if (calendarView === "month") changeMonth(-1);
  else selectedDate = addDays(selectedDate, calendarView === "week" ? -7 : -1);
  requestCalendarPeriod();
});
document.querySelector("#calendarNext").addEventListener("click", () => {
  if (calendarView === "month") changeMonth(1);
  else selectedDate = addDays(selectedDate, calendarView === "week" ? 7 : 1);
  requestCalendarPeriod();
});
document.querySelectorAll("[data-calendar-view]").forEach((button) => {
  button.addEventListener("click", () => {
    calendarView = button.dataset.calendarView;
    requestCalendarPeriod();
  });
});

Promise.all([
  DentalAPI.get("/api/patients"),

  DentalAPI.get(`/api/dashboard-stats?date=${dateKey(new Date())}`),
  DentalAPI.get("/api/patient-treatments"),
  DentalAPI.get("/api/treatment-catalog")
]).then(async ([loadedPatients, stats, loadedTreatments, loadedCatalog]) => {
  patients = loadedPatients;
  treatments = loadedTreatments;
  catalog = loadedCatalog;
  loadAuditActivity();
  const dashboardStats = stats || {};
  const updateMetric = (selector, value, note) => {
    const metric = document.querySelector(selector);
    if (metric) metric.textContent = value;
    const metricNote = document.querySelector(`${selector}Note`);
    if (metricNote) metricNote.textContent = note;
  };

  updateMetric("#metricToday", dashboardStats.today_appointments ?? appointmentsOn(new Date()).length,
    `${dashboardStats.scheduled_appointments ?? appointmentsOn(new Date()).filter(item => item.status === "scheduled").length} citas confirmadas`);
  updateMetric("#metricPatients", dashboardStats.active_patients ?? patients.length,
    `${dashboardStats.patients_with_alerts ?? 0} con alerta clinica`);
  updateMetric("#metricTreatments", dashboardStats.active_treatments ?? 0,
    `${dashboardStats.in_progress_treatments ?? 0} en curso`);
  updateMetric("#metricBalance", DentalAPI.money(dashboardStats.pending_balance ?? 0),
    `${dashboardStats.patients_with_balance ?? 0} pacientes con saldo`);
  await Promise.all([loadCalendarPeriod(), loadOverdueAppointments()]);
}).catch((error) => {
  calendarRoot.innerHTML = `<p class="empty-state">No se pudo cargar la agenda: ${DentalAPI.escapeHtml(error.message)}</p>`;
});
