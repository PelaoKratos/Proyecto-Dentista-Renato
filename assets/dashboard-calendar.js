const calendarRoot = document.querySelector("#dashboardCalendar");
const calendarPeriod = document.querySelector("#calendarPeriod");
const globalSearch = document.querySelector("#globalSearch");
const searchResults = document.querySelector("#searchResults");
document.querySelector("#dashboardDate").textContent = new Date().toLocaleDateString("es-CL", {
  weekday: "long", day: "numeric", month: "long", year: "numeric"
});

let patients = [];
let appointments = [];
let calendarView = "week";
let selectedDate = new Date();

const weekdayLabels = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const monthNames = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];
const businessHours = Array.from({ length: 12 }, (_, index) => `${String(index + 8).padStart(2, "0")}:00`);

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
    .sort((first, second) => String(first.starts_at).localeCompare(String(second.starts_at)));
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
    <a class="calendar-appointment status-${status}" href="./paciente.html?id=${appointment.patient_id}&appointment=${appointment.id}">
      <strong>${DentalAPI.escapeHtml(patient ? DentalAPI.fullName(patient) : "Paciente")}</strong>
      <span>${DentalAPI.escapeHtml(appointment.reason || "Atencion dental")}</span>
      ${statusMarkup}
    </a>
  `;
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
    const moreCount = dayAppointments.length > 3
      ? `<small class="calendar-more">+${dayAppointments.length - 3} mas</small>`
      : "";

    cells.push(`
      <div class="month-cell${todayClass}">
        <span class="month-day">${dayNumber}</span>
        ${dayAppointments.slice(0, 3).map((appointment) => appointmentCard(appointment, false)).join("")}
        ${moreCount}
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
        DentalAPI.time(appointment.starts_at).startsWith(hour.slice(0, 2))
      );
      return `<div class="week-slot">${hourAppointments.map((appointment) => appointmentCard(appointment, false)).join("")}</div>`;
    }).join("");
    return `<div class="week-row"><time>${hour}</time>${slots}</div>`;
  }).join("");

  calendarRoot.innerHTML = `
    <div class="week-grid">
      <div class="week-header"><span></span>${header}</div>
      ${rows}
    </div>
  `;
  const lastDay = days[days.length - 1];
  calendarPeriod.textContent = `${firstDay.getDate()} - ${lastDay.getDate()} de ${monthNames[lastDay.getMonth()]} ${lastDay.getFullYear()}`;
}

function renderDay() {
  const rows = businessHours.map((hour) => {
    const hourAppointments = appointmentsOn(selectedDate).filter((appointment) =>
      DentalAPI.time(appointment.starts_at).startsWith(hour.slice(0, 2))
    );
    return `
      <div class="day-row">
        <time>${hour}</time>
        <div>${hourAppointments.map((appointment) => appointmentCard(appointment, true)).join("")}</div>
      </div>
    `;
  }).join("");

  calendarRoot.innerHTML = `<div class="day-grid">${rows}</div>`;
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
}

function renderSearchResults(query) {
  if (!query) {
    searchResults.hidden = true;
    searchResults.innerHTML = "";
    return;
  }

  const matches = patients
    .filter((patient) => `${DentalAPI.fullName(patient)} ${patient.rut || ""} ${patient.phone || ""}`.toLowerCase().includes(query))
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

globalSearch.addEventListener("input", () => renderSearchResults(globalSearch.value.trim().toLowerCase()));
document.querySelector("#calendarToday").addEventListener("click", () => {
  selectedDate = new Date();
  renderCalendar();
});
document.querySelector("#calendarPrev").addEventListener("click", () => {
  if (calendarView === "month") changeMonth(-1);
  else selectedDate = addDays(selectedDate, calendarView === "week" ? -7 : -1);
  renderCalendar();
});
document.querySelector("#calendarNext").addEventListener("click", () => {
  if (calendarView === "month") changeMonth(1);
  else selectedDate = addDays(selectedDate, calendarView === "week" ? 7 : 1);
  renderCalendar();
});
document.querySelectorAll("[data-calendar-view]").forEach((button) => {
  button.addEventListener("click", () => {
    calendarView = button.dataset.calendarView;
    renderCalendar();
  });
});

Promise.all([
  DentalAPI.get("/api/patients"),
  DentalAPI.get("/api/appointments"),
  DentalAPI.get(`/api/dashboard-stats?date=${dateKey(new Date())}`)
]).then(([loadedPatients, loadedAppointments, stats]) => {
  patients = loadedPatients;
  appointments = loadedAppointments;
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
  renderCalendar();
}).catch((error) => {
  calendarRoot.innerHTML = `<p class="empty-state">No se pudo cargar la agenda: ${DentalAPI.escapeHtml(error.message)}</p>`;
});
