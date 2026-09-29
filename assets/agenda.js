const dayTimeline = document.querySelector("#dayTimeline");
const miniCalendar = document.querySelector("#miniCalendar");
const calendarTitle = document.querySelector("#calendarTitle");
const focusAppointmentForm = document.querySelector("#focusAppointmentForm");
const goTodayBtn = document.querySelector("#goTodayBtn");
const agendaStatusFilter = document.querySelector("#agendaStatusFilter");
const appointmentForm = document.querySelector("#appointmentForm");
const appointmentPatient = document.querySelector("#appointmentPatient");
const appointmentStatus = document.querySelector("#appointmentStatus");

let treatments = [];
let patients = [];
let appointments = [];
let selectedDate = localDateString();
let selectedStatus = "";

function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function titleForDate(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  return date.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
}

function statusOptions(selectedStatus) {
  return ["scheduled", "attended", "missed", "cancelled"]
    .map((status) => `<option value="${status}" ${status === selectedStatus ? "selected" : ""}>${DentalAPI.escapeHtml(DentalAPI.statusLabel(status))}</option>`)
    .join("");
}

function renderCalendar() {
  const base = new Date(`${selectedDate}T00:00:00`);
  const start = new Date(base);
  start.setDate(base.getDate() - 3);
  calendarTitle.textContent = titleForDate(selectedDate);
  miniCalendar.innerHTML = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const value = localDateString(date);
    return `<button class="${value === selectedDate ? "selected" : ""}" type="button" data-date="${value}">${date.getDate()}</button>`;
  }).join("");
}

function renderAppointments() {
  const patientById = new Map(patients.map((patient) => [patient.id, patient]));
  const visibleAppointments = appointments.filter((appointment) => {
    const matchesDate = String(appointment.starts_at || "").startsWith(selectedDate);
    const matchesStatus = !selectedStatus || appointment.status === selectedStatus;
    return matchesDate && matchesStatus;
  });
  dayTimeline.innerHTML =
    visibleAppointments
      .map((appointment) => {
        const patient = patientById.get(appointment.patient_id);
        return `
          <article class="appointment-editor" data-appointment-card="${appointment.id}">
            <time>${DentalAPI.time(appointment.starts_at)}</time>
            <div>
              <strong>${DentalAPI.escapeHtml(patient ? DentalAPI.fullName(patient) : "Paciente")}</strong>
              <span>${DentalAPI.escapeHtml(appointment.reason || "Atencion dental")} · ${DentalAPI.escapeHtml(appointment.notes || DentalAPI.statusLabel(appointment.status))}</span>
            </div>
            <div class="inline-actions">
              ${
                appointment.status !== "attended" && appointment.status !== "cancelled"
                  ? `<a class="text-button primary-action link-button" href="./paciente.html?id=${appointment.patient_id}&appointment=${appointment.id}">Atender</a>`
                  : ""
              }
              <a class="text-button link-button" href="./paciente.html?id=${appointment.patient_id}">Ficha</a>
              <select aria-label="Estado de cita" data-appointment-status>${statusOptions(appointment.status)}</select>
              <button class="text-button" type="button" data-save-appointment="${appointment.id}">Guardar</button>
              ${appointment.status === "scheduled" ? `<button class="text-button" type="button" data-miss-appointment="${appointment.id}">No asistio</button>` : ""}
              <button class="text-button danger-action" type="button" data-cancel-appointment="${appointment.id}">Cancelar</button>
              <span class="form-status" data-appointment-message="${appointment.id}" aria-live="polite"></span>
            </div>
          </article>
        `;
      })
      .join("") || `<p class="empty-state">No hay citas registradas para este dia.</p>`;
}

async function loadAgenda() {
  [patients, appointments, treatments] = await Promise.all([DentalAPI.get("/api/patients"), DentalAPI.get("/api/appointments"), DentalAPI.get("/api/patient-treatments")]);
  appointmentPatient.innerHTML = patients
    .map((patient) => `<option value="${patient.id}">${DentalAPI.escapeHtml(DentalAPI.fullName(patient))}</option>`)
    .join("");
  appointmentForm.querySelector("input[name='starts_at']").value = `${selectedDate}T14:30`;
  renderTreatmentChoices();
  renderCalendar();
  renderAppointments();
}

function renderTreatmentChoices() {
  document.querySelector("#appointmentTreatment").innerHTML = `<option value="">Control general</option>` + treatments.filter((item) => Number(item.patient_id) === Number(appointmentPatient.value) && item.status !== "completed").map((item) => `<option value="${item.id}">${DentalAPI.escapeHtml(item.title)}${item.tooth_code ? ` - Pieza ${DentalAPI.escapeHtml(item.tooth_code)}` : ""}</option>`).join("");
}
appointmentPatient.addEventListener("change", renderTreatmentChoices);

focusAppointmentForm.addEventListener("click", () => {
  appointmentForm.scrollIntoView({ behavior: "smooth", block: "start" });
  appointmentForm.querySelector("select").focus();
});

miniCalendar.addEventListener("click", (event) => {
  const button = event.target.closest("[data-date]");
  if (!button) return;
  selectedDate = button.dataset.date;
  appointmentForm.querySelector("input[name='starts_at']").value = `${selectedDate}T14:30`;
  renderCalendar();
  renderAppointments();
});

goTodayBtn.addEventListener("click", () => {
  selectedDate = localDateString();
  appointmentForm.querySelector("input[name='starts_at']").value = `${selectedDate}T14:30`;
  renderCalendar();
  renderAppointments();
});

agendaStatusFilter.addEventListener("change", () => {
  selectedStatus = agendaStatusFilter.value;
  renderAppointments();
});

appointmentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(appointmentForm);
  const startsAt = String(formData.get("starts_at") || "").replace("T", " ");
  const submitButton = appointmentForm.querySelector("button[type='submit']");
  appointmentStatus.textContent = "Guardando cita...";
  submitButton.disabled = true;

  try {
    await DentalAPI.post("/api/appointments", {
      patient_id: Number(formData.get("patient_id")),
      patient_treatment_id: Number(formData.get("patient_treatment_id")) || null,
      starts_at: startsAt,
      reason: formData.get("reason"),
      status: "scheduled",
      notes: "Confirmada"
    });
    appointmentStatus.textContent = "Cita guardada.";
    selectedDate = String(formData.get("starts_at") || selectedDate).slice(0, 10);
    appointmentForm.reset();
    await loadAgenda();
    submitButton.disabled = false;
  } catch (error) {
    appointmentStatus.textContent = error.message;
    submitButton.disabled = false;
  }
});

dayTimeline.addEventListener("click", async (event) => {
  const saveButton = event.target.closest("[data-save-appointment]");
  const cancelButton = event.target.closest("[data-cancel-appointment]");
  const missedButton = event.target.closest("[data-miss-appointment]");
  const button = saveButton || cancelButton || missedButton;
  if (!button) return;

  const appointmentId = button.dataset.saveAppointment || button.dataset.cancelAppointment || button.dataset.missAppointment;
  const card = button.closest("[data-appointment-card]");
  const message = card.querySelector("[data-appointment-message]");
  const status = cancelButton ? "cancelled" : missedButton ? "missed" : card.querySelector("[data-appointment-status]").value;

  if (cancelButton && !window.confirm("Cancelar esta cita? La cita quedara registrada como cancelada.")) return;

  button.disabled = true;
  message.textContent = "Guardando...";

  try {
    await DentalAPI.put(`/api/appointments/${appointmentId}`, {
      status,
      notes: DentalAPI.statusLabel(status)
    });
    message.textContent = "Estado actualizado.";
    await loadAgenda();
  } catch (error) {
    message.textContent = error.message;
    button.disabled = false;
  }
});

loadAgenda().catch((error) => {
  dayTimeline.innerHTML = `<p class="empty-state">No se pudo cargar agenda: ${DentalAPI.escapeHtml(error.message)}</p>`;
});
