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
  method: "método de pago"
};

function auditValue(key, value) {
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
      : ["payment_date", "amount", "method"];
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
  calendarPeriod.textContent = `${firstDay.getDate()} - ${lastDay.getDate()} de ${monthNames[lastDay.getMonth()]} ${lastDay.getFullYear()}`;
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
  const pending = appointmentsOn(new Date()).filter((appointment) =>
    appointment.status === "scheduled" &&
    new Date(String(appointment.starts_at || "").replace(" ", "T")) < new Date());
  document.querySelector("#todayFollowupsCount").textContent = String(pending.length);
  document.querySelector("#todayFollowupsList").innerHTML = pending.length
    ? pending.slice(0, 5).map((appointment) => {
      const patient = patientFor(appointment);
      return `<a href="./paciente.html?id=${Number(appointment.patient_id)}&appointment=${Number(appointment.id)}">
        <time>${DentalAPI.time(appointment.starts_at)}</time>
        <span><strong>${DentalAPI.escapeHtml(patient ? DentalAPI.fullName(patient) : "Paciente")}</strong><small>${DentalAPI.escapeHtml(appointment.reason || "Atención dental")}</small></span>
        <span class="today-followups-action">Abrir ficha →</span>
      </a>`;
    }).join("") + (pending.length > 5 ? `<p>Y ${pending.length - 5} más en la agenda.</p>` : "")
    : "<p>Sin atenciones pendientes de registrar hasta esta hora.</p>";
}

window.addEventListener("pageshow", async (event) => {
  if (!event.persisted) return;
  try {
    appointments = await DentalAPI.get("/api/appointments");
    renderCalendar();
  } catch (error) {
    console.error("No se pudo actualizar la agenda al regresar.", error);
  }
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

const bookingDialog = document.querySelector("#calendarBookingDialog");
const appointmentDialog = document.querySelector("#calendarAppointmentDialog");
const appointmentMenu = document.querySelector("#calendarAppointmentMenu");
let menuAppointmentId = null;
const bookingForm = document.querySelector("#calendarBookingForm");
const bookingStatus = bookingForm.querySelector("[data-booking-status]");
const patientSelect = bookingForm.elements.patient_id;
const treatmentSelect = bookingForm.elements.treatment_choice;
const patientSearch = bookingForm.elements.patient_search;
const createSection = bookingForm.querySelector("[data-booking-patient-create]");
const createStatus = bookingForm.querySelector("[data-booking-create-status]");
const createSave = bookingForm.querySelector("[data-booking-create-save]");
const procedureList = bookingForm.querySelector("[data-booking-procedure-list]");
let bookingProcedures = [];
let activeComposerKey = "";
let bookingBaseline = "";
let bookingFollowupAppointmentId = null;
const bookingFollowupNote = bookingForm.querySelector("[data-booking-followup-note]");

function setBookingFollowup(appointment = null) {
  bookingFollowupAppointmentId = appointment?.status === "scheduled" ? appointment.id : null;
  bookingFollowupNote.hidden = bookingFollowupAppointmentId === null;
}

function renderPatientChoices(query = patientSearch.value) {
  const current = patientSelect.value;
  const matches = patients.filter((patient) => matchesPatient(patient, query))
    .sort((a, b) => DentalAPI.fullName(a).localeCompare(DentalAPI.fullName(b), "es", { sensitivity: "base" }));
  patientSelect.innerHTML = '<option value="">Seleccionar paciente...</option>' + matches
    .map((patient) => `<option value="${patient.id}">${DentalAPI.escapeHtml(DentalAPI.fullName(patient))}${patient.rut ? ` · ${DentalAPI.escapeHtml(patient.rut)}` : ""}</option>`).join("");
  if (matches.some((patient) => String(patient.id) === current)) patientSelect.value = current;
  bookingForm.querySelector("[data-booking-no-patients]").hidden = matches.length > 0;
  updateBookingTreatmentOptions();
  updateBookingAvailability();
}

function showPatientCreation(show) {
  createSection.hidden = !show;
  bookingForm.querySelector(".booking-patient-picker").hidden = show;
  bookingForm.querySelector('button[type="submit"]').disabled = show;
  bookingForm.elements.new_first_name.required = show;
  bookingForm.elements.new_last_name.required = show;
  createStatus.textContent = "";
  if (show) bookingForm.elements.new_first_name.focus();
  else patientSearch.focus();
}

bookingForm.querySelector("[data-booking-create-toggle]").addEventListener("click", () => {
  const query = patientSearch.value.trim();
  if (query && !/\d/.test(query) && query.includes(" ")) {
    const words = query.split(/\s+/);
    bookingForm.elements.new_first_name.value = words.shift();
    bookingForm.elements.new_last_name.value = words.join(" ");
  } else if (query && /\d/.test(query)) bookingForm.elements.new_rut.value = formatRut(query);
  showPatientCreation(true);
});
bookingForm.querySelector("[data-booking-create-cancel]").addEventListener("click", () => showPatientCreation(false));
bookingForm.elements.new_rut.addEventListener("input", (event) => { event.target.value = formatRut(event.target.value); });
bookingForm.elements.new_phone.addEventListener("input", (event) => {
  const digits = event.target.value.replace(/\D/g, "");
  event.target.value = digits.startsWith("56") && digits.length > 9 ? digits.slice(2) : digits;
});
createSave.addEventListener("click", async () => {
  const firstName = bookingForm.elements.new_first_name;
  const lastName = bookingForm.elements.new_last_name;
  const email = bookingForm.elements.new_email;
  for (const field of [firstName, lastName, email]) {
    if (!field.reportValidity()) return;
  }
  const rut = formatRut(bookingForm.elements.new_rut.value);
  const duplicate = rut && patients.find((patient) => rutCharacters(patient.rut) === rutCharacters(rut));
  if (duplicate) {
    createStatus.textContent = `Ese RUT ya está registrado a nombre de ${DentalAPI.fullName(duplicate)}. Selecciónalo en el buscador.`;
    return;
  }
  const phone = bookingForm.elements.new_phone.value.replace(/\D/g, "");
  createSave.disabled = true;
  createStatus.textContent = "Guardando paciente...";
  try {
    const created = await DentalAPI.post("/api/patients", {
      first_name: firstName.value.trim(), last_name: lastName.value.trim(), rut,
      phone: phone ? `+56 ${phone}` : "", email: email.value.trim(),
      dentition_type: bookingForm.elements.new_dentition.value,
      active_alert: bookingForm.elements.new_active_alert.value.trim(), is_active: 1
    });
    patients.push(created);
    patientSearch.value = "";
    renderPatientChoices("");
    patientSelect.value = String(created.id);
    updateBookingTreatmentOptions();
    showPatientCreation(false);
    updateBookingAvailability();
    if (!bookingStatus.textContent) bookingStatus.textContent = "Paciente creado. Completa la cita para agendarlo.";
    bookingForm.elements.new_first_name.value = "";
    bookingForm.elements.new_last_name.value = "";
    bookingForm.elements.new_rut.value = "";
    bookingForm.elements.new_phone.value = "";
    bookingForm.elements.new_email.value = "";
    bookingForm.elements.new_active_alert.value = "";
  } catch (error) {
    createStatus.textContent = error.message;
  } finally {
    createSave.disabled = false;
  }
});

function selectedPatientTreatments() {
  return treatments.filter((item) => Number(item.patient_id) === Number(patientSelect.value) &&
    ["planned", "in_progress"].includes(item.status));
}

function nextPatientTreatmentTitle(patientId = Number(patientSelect.value)) {
  const count = treatments.filter((item) => Number(item.patient_id) === Number(patientId)).length;
  return `${count + 1}° Tratamiento`;
}

function updateBookingTreatmentOptions() {
  const previous = treatmentSelect.value;
  treatmentSelect.innerHTML = '<option value="new">Nuevo tratamiento</option>' + selectedPatientTreatments()
    .map((item) => `<option value="${item.id}">${DentalAPI.escapeHtml(item.title)}${item.tooth_code ? ` · Piezas ${DentalAPI.escapeHtml(item.tooth_code)}` : ""}</option>`).join("");
  if ([...treatmentSelect.options].some((option) => option.value === previous)) treatmentSelect.value = previous;
  loadBookingTreatment();
}

function parseBookingTeeth(value) {
  const codes = String(value || "").trim().split(/[,;\s]+/).filter(Boolean);
  const patient = patients.find((item) => Number(item.id) === Number(patientSelect.value));
  const maximum = patient?.dentition_type === "child" ? 20 : 32;
  if (codes.some((code) => !/^\d+$/.test(code) || Number(code) < 1 || Number(code) > maximum) ||
      new Set(codes.map(Number)).size !== codes.length) {
    throw new Error(`Indica piezas entre 1 y ${maximum}, sin repetirlas dentro del procedimiento.`);
  }
  return codes.map(Number).sort((a, b) => a - b).join(",");
}

function bookingDiscount(price, type, raw, label) {
  const amount = Number(raw || 0);
  if (!Number.isFinite(amount) || amount < 0 || (type === "percent" ? amount > 100 : amount > price) ||
      (type === "amount" && !Number.isInteger(amount))) {
    throw new Error(`Revisa el descuento de ${label}.`);
  }
  return type === "percent" ? Math.round(price * amount / 100) : amount;
}

function bookingTotals() {
  if (!bookingProcedures.length) throw new Error("Agrega al menos un procedimiento al tratamiento.");
  let subtotal = 0;
  let lineDiscounts = 0;
  bookingProcedures.forEach((item, index) => {
    const price = Number(item.price);
    if (!Number.isInteger(price) || price < 0 || price > 1000000000) throw new Error(`Revisa el valor del procedimiento ${index + 1}.`);
    parseBookingTeeth(item.tooth_code);
    subtotal += price;
    lineDiscounts += bookingDiscount(price, item.discount_type, item.discount_value, `procedimiento ${index + 1}`);
  });
  const afterLines = subtotal - lineDiscounts;
  const totalDiscount = bookingDiscount(afterLines, bookingForm.elements.total_discount_type.value,
    bookingForm.elements.total_discount_value.value, "total");
  return { subtotal, lineDiscounts, total: afterLines - totalDiscount };
}

function renderBookingTotals() {
  const subtotal = bookingProcedures.reduce((sum, item) => sum + Math.max(Number(item.price) || 0, 0), 0);
  let lineDiscounts = 0;
  let error = "";
  try {
    if (bookingProcedures.length) ({ lineDiscounts } = bookingTotals());
  } catch (issue) {
    error = issue.message;
  }
  const afterLines = Math.max(subtotal - lineDiscounts, 0);
  let totalDiscount = 0;
  try {
    totalDiscount = bookingDiscount(afterLines, bookingForm.elements.total_discount_type.value,
      bookingForm.elements.total_discount_value.value, "total");
  } catch (issue) {
    error = issue.message;
  }
  bookingForm.querySelector("[data-booking-subtotal]").textContent = DentalAPI.money(subtotal);
  bookingForm.querySelector("[data-booking-line-discounts]").textContent = `−${DentalAPI.money(lineDiscounts)}`;
  bookingForm.querySelector("[data-booking-total]").textContent = DentalAPI.money(afterLines - totalDiscount);
  bookingForm.querySelector("[data-booking-footer-total]").textContent = `Total: ${DentalAPI.money(afterLines - totalDiscount)}`;
  bookingForm.querySelector("[data-booking-pricing-error]").textContent = error;
}

function renderBookingProcedures() {
  procedureList.innerHTML = bookingProcedures.length ? bookingProcedures.map((item, index) => `
    <article class="booking-procedure-row" data-booking-procedure="${index}">
      <div class="booking-procedure-identity"><strong>${DentalAPI.escapeHtml(item.name)}</strong><label>Piezas <input data-procedure-field="tooth_code" value="${DentalAPI.escapeHtml(item.tooth_code || "")}" placeholder="General" inputmode="numeric" aria-label="Piezas de ${DentalAPI.escapeHtml(item.name)}" /></label></div>
      <label>Valor $<input data-procedure-field="price" type="number" min="0" step="1" value="${DentalAPI.escapeHtml(item.price)}" /></label>
      <label>Descuento<select data-procedure-field="discount_type"><option value="amount"${item.discount_type === "amount" ? " selected" : ""}>Valor $</option><option value="percent"${item.discount_type === "percent" ? " selected" : ""}>Porcentaje %</option></select></label>
      <label>Monto<input data-procedure-field="discount_value" type="number" min="0" step="any" placeholder="0" value="${DentalAPI.escapeHtml(item.discount_value || "")}" /></label>
      <button type="button" class="text-button danger-action" data-remove-procedure="${index}" aria-label="Quitar ${DentalAPI.escapeHtml(item.name)}">Quitar</button>
    </article>`).join("") : "<p>Agrega el primer procedimiento.</p>";
  renderBookingTotals();
}

function loadBookingTreatment() {
  const key = `${patientSelect.value}:${treatmentSelect.value}`;
  if (key === activeComposerKey) return updateBookingFields();
  activeComposerKey = key;
  const existing = selectedPatientTreatments().find((item) => String(item.id) === treatmentSelect.value);
  bookingForm.elements.title.value = existing?.title || "";
  bookingForm.elements.total_discount_type.value = existing?.total_discount_type || "amount";
  bookingForm.elements.total_discount_value.value = existing?.total_discount_value || "";
  bookingForm.elements.catalog_id.value = "";
  bookingForm.elements.procedure_teeth.value = "";
  bookingForm.elements.procedure_price.value = "";
  try {
    bookingProcedures = existing?.procedure_items_json ? JSON.parse(existing.procedure_items_json) : [];
  } catch {
    bookingProcedures = [];
  }
  if (!Array.isArray(bookingProcedures)) bookingProcedures = [];
  if (existing && !bookingProcedures.length) {
    const price = Number(existing.estimated_price ?? existing.final_price ?? 0);
    bookingProcedures = [{ name: existing.title, catalog_treatment_id: existing.catalog_treatment_id || null,
      tooth_code: existing.tooth_code || "", price,
      discount_type: "amount", discount_value: Math.max(price - Number(existing.final_price ?? price), 0) }];
  }
  bookingBaseline = JSON.stringify({ title: bookingForm.elements.title.value,
    procedures: bookingProcedures, total_discount_type: bookingForm.elements.total_discount_type.value,
    total_discount_value: Number(bookingForm.elements.total_discount_value.value || 0) });
  renderBookingProcedures();
  updateBookingFields();
}

function updateBookingFields() {
  const observation = bookingForm.elements.booking_type.value === "observation";
  bookingForm.querySelector("[data-booking-treatment]").hidden = observation;
  bookingForm.querySelector("[data-booking-observation]").hidden = !observation;
  bookingForm.elements.title.required = !observation;
  bookingForm.elements.observation_cost.required = observation;
  if (observation) {
    bookingForm.querySelector("[data-booking-footer-total]").textContent = `Costo: ${DentalAPI.money(Number(bookingForm.elements.observation_cost.value || 0))}`;
  } else {
    renderBookingTotals();
  }
}

function bookingConflict(hour = bookingForm.elements.booking_time.value) {
  const start = `${bookingForm.elements.booking_date.value} ${hour}`;
  const startTime = new Date(start.replace(" ", "T")).getTime();
  if (!Number.isFinite(startTime)) return "";
  const overlapping = appointments.filter((item) => {
    if (item.status !== "scheduled") return false;
    const otherStart = new Date(String(item.starts_at || "").replace(" ", "T")).getTime();
    const otherEnd = item.ends_at ? new Date(String(item.ends_at).replace(" ", "T")).getTime() : otherStart + 30 * 60000;
    return startTime < otherEnd && otherStart < startTime + 30 * 60000;
  });
  if (!overlapping.length) return "";
  if (hour === "16:00" &&
      overlapping.every((item) => String(item.starts_at || "").replace("T", " ").slice(11, 16) === "16:00" &&
        Number(item.patient_id) !== Number(patientSelect.value))) {
    return "Las 16:00 ya están ocupadas, pero se permite otro paciente a esta hora.";
  }
  return "Esta hora ya está ocupada. Selecciona otra hora.";
}

function updateBookingAvailability() {
  const selected = bookingForm.elements.booking_time.value;
  bookingForm.elements.booking_time.innerHTML = businessHours.map((hour) => {
    const conflict = bookingConflict(hour);
    const label = !bookingForm.elements.booking_date.value ? hour
      : conflict ? `${hour} · ${conflict.includes("se permite") ? "Ocupada · admite otro paciente" : "Ocupada"}`
        : `${hour} · Disponible`;
    return `<option value="${hour}">${label}</option>`;
  }).join("");
  if (selected) bookingForm.elements.booking_time.value = selected;
  const message = bookingConflict();
  bookingStatus.textContent = message;
  bookingStatus.classList.toggle("time-occupied", Boolean(message && !message.includes("se permite")));
}

function menuAppointment() {
  return appointments.find((item) => Number(item.id) === menuAppointmentId);
}

function menuTreatment(appointment = menuAppointment()) {
  return treatments.find((item) => Number(item.id) === Number(appointment?.patient_treatment_id));
}

async function refreshCalendarData() {
  [appointments, treatments] = await Promise.all([
    DentalAPI.get("/api/appointments"), DentalAPI.get("/api/patient-treatments")
  ]);
  renderCalendar();
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
      ${scheduled || appointment.status === "missed" ? '<button class="text-button" type="button" data-menu-action="attended">Marcar atendida</button>' : ""}
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
  const panel = appointmentMenu.querySelector("[data-menu-panel]");
  panel.innerHTML = markup;
  panel.hidden = false;
  panel.querySelector("input,select")?.focus();
}

function openNextBooking(appointment) {
  appointmentDialog.close();
  bookingForm.reset();
  setBookingFollowup(appointment);
  activeComposerKey = "";
  bookingProcedures = [];
  patientSearch.value = "";
  renderPatientChoices("");
  patientSelect.value = String(appointment.patient_id);
  const treatment = menuTreatment(appointment);
  const isObservationFee = treatment?.title?.trim().toLocaleLowerCase("es") === "observación clínica";
  bookingForm.elements.booking_type.value = treatment && !isObservationFee && ["planned", "in_progress"].includes(treatment.status) ? "treatment" : "observation";
  updateBookingTreatmentOptions();
  if (treatment && !isObservationFee && ["planned", "in_progress"].includes(treatment.status)) {
    treatmentSelect.value = String(treatment.id);
    loadBookingTreatment();
  }
  const previous = new Date(String(appointment.starts_at).replace(" ", "T"));
  const next = addDays(previous, 7);
  bookingForm.elements.booking_date.value = dateKey(next < new Date() ? addDays(new Date(), 1) : next);
  bookingForm.elements.booking_time.value = String(appointment.starts_at).slice(11, 16);
  updateBookingFields();
  updateBookingAvailability();
  bookingDialog.showModal();
}

calendarRoot.addEventListener("click", (event) => {
  const button = event.target.closest("[data-calendar-appointment]");
  if (!button) return;
  menuAppointmentId = Number(button.dataset.calendarAppointment);
  renderAppointmentMenu();
  appointmentDialog.showModal();
});

appointmentMenu.addEventListener("click", async (event) => {
  if (event.target.closest("[data-menu-close]")) return appointmentDialog.close();
  const button = event.target.closest("[data-menu-action]");
  if (!button) return;
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
      const payments = await DentalAPI.get("/api/payments");
      const patientTreatments = treatments.filter((item) => Number(item.patient_id) === Number(appointment.patient_id));
      const balances = patientTreatments.map((item) => {
        const paid = payments.filter((payment) => Number(payment.patient_treatment_id) === Number(item.id))
          .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        return { treatment: item, due: Math.max(Number(item.final_price ?? item.estimated_price ?? 0) - paid, 0) };
      }).filter((item) => item.due > 0);
      const preferredTreatmentId = Number(treatment?.id);
      const rows = balances.map(({ treatment: item, due }) => {
        const checked = Number(item.id) === preferredTreatmentId;
        return `<div class="payment-allocation-row" data-menu-payment-row data-treatment-id="${Number(item.id)}" data-title="${DentalAPI.escapeHtml(item.title)}" data-due="${due}">
          <label><input type="checkbox" data-menu-payment-include ${checked ? "checked" : ""} /><span><strong>${DentalAPI.escapeHtml(item.title)}</strong><small>Saldo pendiente ${DentalAPI.money(due)}</small></span></label>
          <label>Abono<input type="number" data-menu-payment-amount min="1" max="${due}" step="1" value="${due}" ${checked ? "" : "readonly"} /></label>
        </div>`;
      }).join("");
      showMenuPanel(balances.length ? `<form data-menu-form="payment"><h3>Selecciona los tratamientos que vas a abonar</h3>
        <div class="payment-allocation-list" data-menu-payment-list>${rows}</div>
        <p class="payment-allocation-summary" data-menu-payment-summary>Selecciona uno o más tratamientos.</p>
        <label>Método<select name="method"><option>Transferencia</option><option>Tarjeta</option><option>Efectivo</option><option>Otro</option></select></label>
        <button class="text-button primary-action" type="submit">Guardar abonos</button></form>`
        : "<p>Este paciente no tiene tratamientos con saldo pendiente.</p>");
      const paymentForm = appointmentMenu.querySelector('[data-menu-form="payment"]');
      if (paymentForm) updateAppointmentPaymentSummary(paymentForm);
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
        return { patient_treatment_id: Number(row.dataset.treatmentId), amount };
      });
      await DentalAPI.post("/api/payments/batch", { patient_id: Number(appointment.patient_id),
        payment_date: DentalAPI.localDateString(), method: form.elements.method.value,
        notes: "Abono registrado desde la agenda", allocations });
      renderAppointmentMenu("Abono registrado correctamente.");
      loadAuditActivity();
    }
  } catch (error) {
    status.textContent = error.message;
    submit.disabled = false;
  }
});

calendarRoot.addEventListener("click", (event) => {
  const button = event.target.closest("[data-calendar-book]");
  if (!button) return;
  bookingForm.reset();
  setBookingFollowup();
  activeComposerKey = "";
  bookingProcedures = [];
  bookingForm.querySelector("[data-booking-picker-error]").textContent = "";
  showPatientCreation(false);
  bookingForm.elements.booking_date.value = button.dataset.date;
  bookingForm.elements.booking_time.value = button.dataset.hour;
  updateBookingFields();
  updateBookingTreatmentOptions();
  updateBookingAvailability();
  renderPatientChoices("");
  bookingDialog.showModal();
  patientSearch.focus();
});
bookingForm.querySelectorAll("[data-booking-close]").forEach((button) => button.addEventListener("click", () => bookingDialog.close()));
bookingDialog.addEventListener("close", () => setBookingFollowup());
patientSearch.addEventListener("input", () => renderPatientChoices());
patientSelect.addEventListener("change", () => { updateBookingTreatmentOptions(); updateBookingAvailability(); });
bookingForm.elements.booking_type.addEventListener("change", updateBookingFields);
bookingForm.elements.observation_cost.addEventListener("input", updateBookingFields);
treatmentSelect.addEventListener("change", loadBookingTreatment);
bookingForm.elements.booking_date.addEventListener("change", updateBookingAvailability);
bookingForm.elements.booking_time.addEventListener("change", updateBookingAvailability);
bookingForm.elements.catalog_id.addEventListener("change", () => {
  const item = catalog.find((entry) => Number(entry.id) === Number(bookingForm.elements.catalog_id.value));
  bookingForm.elements.procedure_price.value = item ? Number(item.default_price || 0) : "";
});
bookingForm.querySelector("[data-add-procedure]").addEventListener("click", () => {
  const pickerError = bookingForm.querySelector("[data-booking-picker-error]");
  pickerError.textContent = "";
  if (bookingProcedures.length >= 30) return (pickerError.textContent = "Un tratamiento puede tener hasta 30 procedimientos.");
  const catalogItem = catalog.find((item) => Number(item.id) === Number(bookingForm.elements.catalog_id.value));
  if (!catalogItem) return (pickerError.textContent = "Selecciona un procedimiento. Puedes crear o modificar procedimientos en el apartado Procedimientos.");
  const name = catalogItem.name;
  let teeth;
  try { teeth = parseBookingTeeth(bookingForm.elements.procedure_teeth.value); }
  catch (error) { pickerError.textContent = error.message; return; }
  const price = Number(bookingForm.elements.procedure_price.value);
  if (bookingForm.elements.procedure_price.value === "" || !Number.isInteger(price) || price < 0) {
    pickerError.textContent = "Indica un valor entero en pesos para el procedimiento.";
    return;
  }
  bookingProcedures.push({ name, catalog_treatment_id: catalogItem?.id || null, tooth_code: teeth,
    price, discount_type: "amount", discount_value: 0 });
  if (!bookingForm.elements.title.value.trim() && treatmentSelect.value === "new") {
    bookingForm.elements.title.value = nextPatientTreatmentTitle();
  }
  bookingForm.elements.procedure_teeth.value = "";
  bookingForm.elements.procedure_price.value = Number(catalogItem.default_price || 0);
  bookingStatus.textContent = "";
  renderBookingProcedures();
});
procedureList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-procedure]");
  if (!button) return;
  bookingProcedures.splice(Number(button.dataset.removeProcedure), 1);
  renderBookingProcedures();
});
function updateProcedureField(event) {
  const row = event.target.closest("[data-booking-procedure]");
  const field = event.target.dataset.procedureField;
  if (!row || !field) return;
  bookingProcedures[Number(row.dataset.bookingProcedure)][field] = event.target.value;
  renderBookingTotals();
}
procedureList.addEventListener("input", updateProcedureField);
procedureList.addEventListener("change", updateProcedureField);
bookingForm.elements.total_discount_type.addEventListener("change", renderBookingTotals);
bookingForm.elements.total_discount_value.addEventListener("input", renderBookingTotals);
bookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = bookingForm.querySelector('button[type="submit"]');
  const patientId = Number(patientSelect.value);
  const observation = bookingForm.elements.booking_type.value === "observation";
  const wasFollowup = bookingFollowupAppointmentId !== null;
  const existing = !observation && treatmentSelect.value !== "new"
    ? selectedPatientTreatments().find((item) => item.id === Number(treatmentSelect.value)) : null;
  const occupied = bookingConflict();
  if (occupied && !occupied.includes("se permite")) {
    bookingStatus.textContent = occupied;
    return;
  }
  if (!patientId) return;
  let title = bookingForm.elements.title.value.trim();
  if (!observation && !existing && !title && bookingProcedures.length) {
    title = nextPatientTreatmentTitle(patientId);
    bookingForm.elements.title.value = title;
  }
  const observationCost = Number(bookingForm.elements.observation_cost.value);
  if (observation && (!Number.isInteger(observationCost) || observationCost < 0)) {
    return (bookingStatus.textContent = "Ingresa un costo válido para la observación.");
  }
  if (!observation && !title) return (bookingStatus.textContent = "Escribe un nombre para el tratamiento.");
  if (!observation) {
    try { bookingTotals(); }
    catch (error) { bookingStatus.textContent = error.message; return; }
  }
  const teeth = [...new Set(bookingProcedures.flatMap((item) => String(item.tooth_code || "").split(",").filter(Boolean)))].sort((a, b) => Number(a) - Number(b)).join(",");
  const treatmentData = { title, procedures: bookingProcedures.map((item) => ({ ...item })),
    total_discount_type: bookingForm.elements.total_discount_type.value,
    total_discount_value: Number(bookingForm.elements.total_discount_value.value || 0) };
  const payload = {
    patient_id: patientId,
    patient_treatment_id: existing?.id || null,
    starts_at: `${bookingForm.elements.booking_date.value} ${bookingForm.elements.booking_time.value}`,
    reason: observation ? "Observación clínica" : `${title}${teeth ? ` · Piezas ${teeth}` : ""}`,
    status: "scheduled"
  };
  if (bookingFollowupAppointmentId !== null) payload.followup_for_appointment_id = bookingFollowupAppointmentId;
  if (!observation && !existing) payload.new_treatment = { ...treatmentData,
    status: "planned", start_date: bookingForm.elements.booking_date.value };
  if (observation && observationCost > 0) payload.new_treatment = {
    title: "Observación clínica", status: "planned", start_date: bookingForm.elements.booking_date.value,
    estimated_price: observationCost, final_price: observationCost
  };
  if (existing && bookingBaseline !== JSON.stringify(treatmentData)) payload.treatment_update = treatmentData;
  submit.disabled = true;
  bookingStatus.textContent = "Guardando cita...";
  try {
    if (!observation) {
      const health = await DentalAPI.get("/api/health");
      if (health.features?.itemized_treatments !== true) {
        throw new Error("El servidor está usando una versión anterior. Cierra la aplicación desde el icono de la bandeja y vuelve a abrirla antes de agendar tratamientos.");
      }
    }
    await DentalAPI.post("/api/appointments", payload);
    const savedMessage = wasFollowup
      ? "Próxima cita agendada. La cita anterior quedó marcada como atendida."
      : "Cita agendada correctamente.";
    bookingDialog.close();
    setBookingFollowup();
    loadAuditActivity();
    showCalendarFeedback(savedMessage);
    try {
      [appointments, treatments] = await Promise.all([DentalAPI.get("/api/appointments"), DentalAPI.get("/api/patient-treatments")]);
      renderCalendar();
    } catch {
      showCalendarFeedback(`${savedMessage} Recarga la agenda para actualizar el calendario.`, "error");
    }
  } catch (error) {
    bookingStatus.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

globalSearch.addEventListener("input", () => renderSearchResults(globalSearch.value.trim()));
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
  DentalAPI.get(`/api/dashboard-stats?date=${dateKey(new Date())}`),
  DentalAPI.get("/api/patient-treatments"),
  DentalAPI.get("/api/treatment-catalog")
]).then(([loadedPatients, loadedAppointments, stats, loadedTreatments, loadedCatalog]) => {
  patients = loadedPatients;
  appointments = loadedAppointments;
  treatments = loadedTreatments;
  catalog = loadedCatalog;
  renderPatientChoices("");
  loadAuditActivity();
  updateBookingAvailability();
  bookingForm.elements.catalog_id.innerHTML = '<option value="">Seleccionar procedimiento...</option>' + catalog
    .map((item) => `<option value="${item.id}">${DentalAPI.escapeHtml(item.name)} · ${DentalAPI.money(item.default_price || 0)}</option>`).join("");
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
