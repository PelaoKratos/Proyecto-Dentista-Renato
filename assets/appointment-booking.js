/* Formulario compartido de citas y presupuestos. */
(() => {
let patients = [], treatments = [], catalog = [], appointments = [];
let openOptions = {};
const businessHours = Array.from({ length: 15 }, (_, index) => `${String(9 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);
const dateKey = (value) => DentalAPI.localDateString(value);
function addDays(value, amount) { const date = new Date(value); date.setDate(date.getDate() + amount); return date; }
document.body.insertAdjacentHTML("beforeend", `<dialog id="calendarBookingDialog" class="calendar-booking-dialog" aria-labelledby="calendarBookingTitle">
          <form id="calendarBookingForm" class="calendar-booking-form">
            <header><div><span class="eyebrow">Nueva cita</span><h2 id="calendarBookingTitle">Agendar desde el calendario</h2></div><button type="button" class="calendar-booking-close" data-booking-close aria-label="Cerrar">×</button></header>
            <div class="calendar-booking-fields">
              <div class="booking-patient-picker">
                <label>Buscar paciente por nombre o RUT<input name="patient_search" type="search" placeholder="Nombre o RUT, con o sin puntos" autocomplete="off" /></label>
                <label hidden>Paciente<select name="patient_id"><option value="">Seleccionar paciente...</option></select></label>
                <div class="booking-patient-results" data-booking-patient-results aria-label="Pacientes encontrados"></div>
                <p data-booking-patient-selected aria-live="polite"></p>
                <p data-booking-no-patients hidden>No hay pacientes que coincidan. Puedes crear uno aquí.</p>
                <button type="button" class="text-button" data-booking-create-toggle>+ Crear paciente nuevo</button>
              </div>
              <section class="booking-patient-create" data-booking-patient-create hidden aria-label="Nuevo paciente">
                <h3>Nuevo paciente</h3>
                <div class="booking-patient-create-fields">
                  <label>Nombres<input name="new_first_name" type="text" autocomplete="given-name" /></label>
                  <label>Apellidos<input name="new_last_name" type="text" autocomplete="family-name" /></label>
                  <label>RUT<input name="new_rut" type="text" placeholder="12.345.678-9" autocomplete="off" autocapitalize="characters" spellcheck="false" /></label>
                  <label>Teléfono<span class="patient-phone-entry"><span class="patient-phone-prefix" aria-hidden="true">+56</span><input name="new_phone" type="tel" autocomplete="tel-national" placeholder="9 1234 5678" aria-label="Número de teléfono después de +56" /></span></label>
                  <label>Correo<input name="new_email" type="email" autocomplete="email" placeholder="correo@ejemplo.cl" /></label>
                  <label>Odontograma<select name="new_dentition"><option value="adult">Adulto · 32 piezas</option><option value="child">Infantil · 20 piezas</option></select></label>
                </div>
                <details><summary>Alerta clínica (opcional)</summary><label>Condiciones, alergias o medicamentos relevantes<textarea name="new_active_alert" rows="2"></textarea></label></details>
                <div class="booking-patient-create-actions"><button type="button" class="text-button" data-booking-create-cancel>Volver</button><button type="button" class="text-button primary-action" data-booking-create-save>Guardar paciente y continuar</button></div>
                <p data-booking-create-status role="status" aria-live="polite"></p>
              </section>
              <label data-booking-appointment-field>Tipo de cita<select name="booking_type"><option value="treatment">Tratamiento</option><option value="observation">Observación y evaluación</option></select></label>
              <label data-booking-appointment-field>Fecha<input name="booking_date" type="date" required /></label>
              <label data-booking-appointment-field>Hora<select name="booking_time" required></select></label>
              <label data-booking-appointment-field>Programación<select name="schedule_mode"><option value="single">Solo esta cita</option><option value="weekly">Repetir cada semana</option><option value="custom">Elegir otras fechas y horas</option></select></label>
              <label data-booking-weekly hidden>Cantidad de citas<select name="weekly_count">${Array.from({length: 7}, (_, index) => `<option value="${index + 2}">${index + 2} citas</option>`).join("")}</select></label>
              <div class="booking-extra-dates" data-booking-custom hidden><div data-booking-custom-rows></div><button class="text-button" type="button" data-booking-add-date>+ Agregar otra cita</button></div>
              <p class="calendar-booking-followup-note" data-booking-followup-note hidden>Al guardar la próxima cita, la cita anterior quedará marcada como atendida.</p>
              <div class="calendar-booking-treatment" data-booking-treatment>
                <label>Tratamiento<select name="treatment_choice"><option value="new">Nuevo tratamiento</option></select></label>
                <label>Nombre del tratamiento<input name="title" maxlength="160" placeholder="Ej. Rehabilitación superior" /></label>
                <section class="booking-procedure-picker" aria-label="Agregar procedimiento">
                  <div class="booking-procedure-picker-fields">
                    <label>Procedimiento<select name="catalog_id"><option value="">Seleccionar procedimiento...</option></select></label>
                    <label>Piezas dentales<input name="procedure_teeth" placeholder="Ej. 3, 4 (opcional)" inputmode="numeric" /></label>
                    <label>Valor<input name="procedure_price" type="number" min="0" step="1" placeholder="Monto en pesos" /></label>
                    <button type="button" class="text-button primary-action" data-add-procedure aria-label="Agregar procedimiento al tratamiento">+ Agregar</button>
                  </div>
                  <p data-booking-picker-error role="status" aria-live="polite"></p>
                </section>
                <div class="booking-procedure-list" data-booking-procedure-list aria-live="polite"><p>Agrega el primer procedimiento.</p></div>
                <div class="booking-treatment-totals">
                  <div><span>Subtotal de procedimientos</span><strong data-booking-subtotal>$0</strong></div>
                  <div><span>Descuentos por procedimiento</span><strong data-booking-line-discounts>$0</strong></div>
                  <label>Descuento al total<select name="total_discount_type"><option value="amount">Valor $</option><option value="percent">Porcentaje %</option></select><input name="total_discount_value" type="number" min="0" step="any" placeholder="Sin descuento" /></label>
                  <div class="booking-total-final"><span>Total del tratamiento</span><strong data-booking-total>$0</strong></div>
                  <p data-booking-pricing-error role="status" aria-live="polite"></p>
                </div>
              </div>
              <div class="calendar-booking-observation" data-booking-observation hidden>
                <p>El costo quedará como saldo pendiente del paciente y podrás abonarlo desde Pagos. Si la evaluación no tiene costo, deja $0.</p>
                <label>Costo de la observación<input name="observation_cost" type="number" min="0" step="1" value="0" /></label>
              </div>
              <details class="booking-extra-dates" data-booking-appointment-field><summary>Notas y radiografía (opcional)</summary><label>Notas<textarea name="notes" rows="2"></textarea></label><label>Radiografía<input name="file" type="file" accept="image/*,.pdf" /></label></details>
              <p class="calendar-booking-status" data-booking-status role="status" aria-live="polite"></p>
            </div>
            <footer><strong class="booking-footer-total" data-booking-footer-total>Total: $0</strong><button type="button" class="text-button" data-booking-close>Cancelar</button><button type="submit" class="text-button primary-action">Agendar cita</button></footer>
          </form>
        </dialog>`);
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
let savingBooking = false, savedBooking = null, bookingGeneration = 0;
const lockedBookingControls = new Map();
const bookingGuard = window.UnsavedEdits.trackForm(bookingForm, {
  active: () => bookingDialog.open,
  extra: () => ({ procedures: bookingProcedures, pendingAttachment: Boolean(savedBooking) })
});
function restoreBookingControls() {
  lockedBookingControls.forEach((disabled, control) => { control.disabled = disabled; });
  lockedBookingControls.clear();
}
function closeBooking() {
  if (!bookingGuard.confirmDiscard()) return;
  bookingGeneration += 1;
  bookingDialog.close();
  if (savedBooking) {
    const detail = { ...savedBooking, message: "La cita quedó guardada. Puedes adjuntar la radiografía desde la ficha." };
    savedBooking = null;
    document.dispatchEvent(new CustomEvent("dental:booking-saved", { detail }));
  }
}
async function finishBookingUpload() {
  const file = bookingForm.elements.file.files[0];
  if (savedBooking.needsFile && !file) throw new Error("Selecciona la radiografía para reintentar, o cierra para adjuntarla después desde la ficha.");
  if (file && savedBooking.needsFile) {
    const data = new FormData();
    data.set("patient_id", savedBooking.patientId);
    data.set("patient_treatment_id", savedBooking.treatmentId || "");
    data.set("file_type", "radiography"); data.set("category", "Radiografía de planificación"); data.set("file", file);
    await DentalAPI.upload("/api/attachments", data);
  }
  const detail = savedBooking;
  savedBooking = null;
  bookingGuard.markClean(); bookingDialog.close(); setBookingFollowup();
  document.dispatchEvent(new CustomEvent("dental:booking-saved", { detail }));
}
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
  const results = bookingForm.querySelector("[data-booking-patient-results]");
  results.innerHTML = matches.slice(0, 8).map((patient) => `<button class="text-button" type="button" data-booking-pick-patient="${Number(patient.id)}"><strong>${DentalAPI.escapeHtml(DentalAPI.fullName(patient))}</strong><small>${DentalAPI.escapeHtml(patient.rut || "Sin RUT")}</small></button>`).join("");
  results.hidden = !query.trim() || Boolean(patientSelect.value);
  bookingForm.querySelector("[data-booking-patient-selected]").textContent = "";
  bookingForm.querySelector("[data-booking-no-patients]").hidden = matches.length > 0;
  updateBookingTreatmentOptions();
  updateBookingAvailability();
}

function choosePatient(id) {
  patientSelect.value = String(id);
  const patient = patients.find((item) => Number(item.id) === Number(id));
  if (!patient) return;
  patientSearch.value = DentalAPI.fullName(patient);
  bookingForm.querySelector("[data-booking-patient-results]").hidden = true;
  bookingForm.querySelector("[data-booking-patient-selected]").textContent = `Paciente: ${DentalAPI.fullName(patient)} · ${patient.rut || "Sin RUT"}`;
  updateBookingTreatmentOptions();
  updateBookingAvailability();
}
bookingForm.querySelector("[data-booking-patient-results]").addEventListener("click", (event) => {
  const button = event.target.closest("[data-booking-pick-patient]");
  if (button) choosePatient(Number(button.dataset.bookingPickPatient));
});

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
  if (createSave.disabled) return;
  bookingGuard.setBusy(true);
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
    choosePatient(created.id);
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
    bookingGuard.setBusy(false);
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
  const patient = patients.find(item => Number(item.id) === Number(patientSelect.value));
  bookingForm.elements.procedure_teeth.placeholder = `Ej. 1, 2, 3 (hasta ${patient?.dentition_type === "child" ? 20 : 32})`;
  bookingForm.querySelector("[data-booking-treatment]").hidden = observation;
  bookingForm.querySelector("[data-booking-observation]").hidden = !observation;
  bookingForm.elements.title.required = !observation && treatmentSelect.value !== "new";
  bookingForm.elements.observation_cost.required = observation;
  if (observation) {
    bookingForm.querySelector("[data-booking-footer-total]").textContent = `Costo: ${DentalAPI.money(Number(bookingForm.elements.observation_cost.value || 0))}`;
  } else {
    renderBookingTotals();
  }
}

function bookingConflict(hour = bookingForm.elements.booking_time.value, date = bookingForm.elements.booking_date.value) {
  const start = `${date} ${hour}`;
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
  const starts = selectedStarts();
  const unavailable = starts.find(value => {
    const conflict = bookingConflict(value.slice(11,16), value.slice(0,10));
    return conflict && !conflict.includes("se permite");
  });
  const message = unavailable ? `${bookingConflict(unavailable.slice(11,16), unavailable.slice(0,10))}${starts.length > 1 ? ` · ${DentalAPI.date(unavailable)}` : ""}`
    : starts.length > 1 ? `${starts.length} citas disponibles` : bookingConflict();
  bookingStatus.textContent = message;
  bookingStatus.classList.toggle("time-occupied", Boolean(unavailable));
  bookingForm.querySelector('button[type="submit"]').disabled = savingBooking || !createSection.hidden || (!openOptions.treatmentOnly && Boolean(unavailable));
}

function selectedStarts() {
  const date = bookingForm.elements.booking_date.value;
  const time = bookingForm.elements.booking_time.value;
  if (bookingForm.elements.schedule_mode.value === "weekly") {
    return Array.from({length: Number(bookingForm.elements.weekly_count.value)}, (_, index) => `${dateKey(addDays(new Date(date + "T12:00:00"), index * 7))} ${time}`);
  }
  return [`${date} ${time}`, ...(bookingForm.elements.schedule_mode.value === "custom"
    ? [...bookingForm.querySelectorAll("[data-booking-extra-date]")].map((row) => `${row.querySelector("input").value} ${row.querySelector("select").value}`) : [])];
}
function updateSchedule() {
  const mode = bookingForm.elements.schedule_mode.value;
  bookingForm.querySelector("[data-booking-weekly]").hidden = mode !== "weekly";
  bookingForm.querySelector("[data-booking-custom]").hidden = mode !== "custom";
  bookingForm.querySelectorAll("[data-booking-extra-date]").forEach((row) => {
    const date = row.querySelector("input");
    date.disabled = mode !== "custom";
    const select = row.querySelector("select");
    select.disabled = mode !== "custom";
    const value = select.value;
    select.innerHTML = businessHours.map((hour) => {
      const conflict = bookingConflict(hour, date.value);
      return `<option value="${hour}">${hour} · ${conflict ? conflict.includes("se permite") ? "Ocupada · admite otro paciente" : "Ocupada" : "Disponible"}</option>`;
    }).join("");
    select.value = value;
  });
  updateBookingAvailability();
}
bookingForm.elements.schedule_mode.addEventListener("change", updateSchedule);
bookingForm.elements.weekly_count.addEventListener("change", updateSchedule);
bookingForm.querySelector("[data-booking-add-date]").addEventListener("click", () => {
  const rows = bookingForm.querySelector("[data-booking-custom-rows]");
  if (rows.children.length >= 11) return;
  const row = document.createElement("div");
  row.className = "booking-extra-date";
  row.dataset.bookingExtraDate = "";
  row.innerHTML = `<label>Fecha adicional<input type="date" required /></label><label>Hora adicional<select>${businessHours.map((hour) => `<option value="${hour}">${hour}</option>`).join("")}</select></label><button type="button" class="text-button danger-action">Quitar</button>`;
  row.querySelector("input").value = dateKey(addDays(new Date(bookingForm.elements.booking_date.value + "T12:00:00"), (rows.children.length + 1) * 7));
  row.querySelector("select").value = bookingForm.elements.booking_time.value;
  row.querySelector("button").addEventListener("click", () => { row.remove(); updateSchedule(); });
  row.addEventListener("change", updateSchedule);
  rows.append(row);
  updateSchedule();
});

bookingForm.querySelectorAll("[data-booking-close]").forEach((button) => button.addEventListener("click", closeBooking));
bookingDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeBooking(); });
bookingDialog.addEventListener("close", () => setBookingFollowup());
patientSearch.addEventListener("input", () => { patientSelect.value = ""; renderPatientChoices(); });
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
  if (savingBooking) return;
  if (savedBooking) {
    savingBooking = true; bookingGuard.setBusy(true); submit.disabled = true;
    try { await finishBookingUpload(); }
    catch (error) { bookingStatus.textContent = `La cita ya está guardada. ${error.message}`; }
    finally { savingBooking = false; bookingGuard.setBusy(false); submit.disabled = false; }
    return;
  }
  const patientId = Number(patientSelect.value);
  const observation = bookingForm.elements.booking_type.value === "observation";
  const wasFollowup = bookingFollowupAppointmentId !== null;
  const existing = !observation && treatmentSelect.value !== "new"
    ? selectedPatientTreatments().find((item) => item.id === Number(treatmentSelect.value)) : null;
  const starts = openOptions.treatmentOnly ? [] : selectedStarts();
  if (new Set(starts).size !== starts.length) return (bookingStatus.textContent = "No repitas la misma fecha y hora.");
  const unavailable = starts.find((value) => {
    const conflict = bookingConflict(value.slice(11,16), value.slice(0,10));
    return conflict && !conflict.includes("se permite");
  });
  const occupied = unavailable ? `La hora ${unavailable.slice(11,16)} ya está ocupada el ${DentalAPI.date(unavailable)}.` : "";
  if (occupied && !occupied.includes("se permite")) {
    bookingStatus.textContent = occupied;
    return;
  }
  if (!patientId) return (bookingStatus.textContent = "Selecciona un paciente de los resultados de búsqueda.");
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
    notes: bookingForm.elements.notes.value.trim(),
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
  savingBooking = true; bookingGuard.setBusy(true);
  bookingStatus.textContent = "Guardando cita...";
  try {
    if (!observation) {
      const health = await DentalAPI.get("/api/health");
      if (health.features?.itemized_treatments !== true) {
        throw new Error("El servidor está usando una versión anterior. Cierra la aplicación desde el icono de la bandeja y vuelve a abrirla antes de agendar tratamientos.");
      }
    }
    let saved;
    if (openOptions.treatmentOnly) {
      saved = await DentalAPI.post("/api/patient-treatments", { ...treatmentData, patient_id: patientId, status: "planned", start_date: dateKey(new Date()) });
    } else {
      if (starts.length > 1) payload.starts_at = starts;
      saved = await DentalAPI.post(starts.length > 1 ? "/api/appointments/batch" : "/api/appointments", payload);
    }
    const savedMessage = openOptions.treatmentOnly ? "Tratamiento guardado correctamente." : wasFollowup
      ? "Próxima cita agendada. La cita anterior quedó marcada como atendida."
      : "Cita agendada correctamente.";
    savedBooking = { patientId, treatmentId: (Array.isArray(saved) ? saved[0] : saved).patient_treatment_id || (openOptions.treatmentOnly ? saved.id : null), message: savedMessage,
      needsFile: Boolean(bookingForm.elements.file.files[0] && !openOptions.treatmentOnly) };
    if (savedBooking.needsFile) {
      [...bookingForm.elements].forEach((control) => {
        if (control === submit || control === bookingForm.elements.file || control.hasAttribute("data-booking-close")) return;
        lockedBookingControls.set(control, control.disabled); control.disabled = true;
      });
      submit.textContent = "Reintentar adjunto";
    }
    await finishBookingUpload();
  } catch (error) {
    bookingStatus.textContent = savedBooking ? `La cita ya está guardada. No se pudo adjuntar la radiografía: ${error.message}` : error.message;
  } finally {
    savingBooking = false; bookingGuard.setBusy(false); submit.disabled = false;
  }
});


async function open(options = {}) {
  if (bookingDialog.open || !window.UnsavedEdits.confirmDiscard()) return;
  const generation = ++bookingGeneration;
  restoreBookingControls(); savedBooking = null;
  openOptions = options;
  bookingForm.reset();
  bookingForm.querySelector("[data-booking-custom-rows]").replaceChildren();
  activeComposerKey = "";
  bookingProcedures = [];
  bookingStatus.textContent = "Cargando pacientes y disponibilidad...";
  bookingForm.querySelector('button[type="submit"]').disabled = true;
  bookingGuard.markClean(); bookingDialog.showModal();
  try {
    [patients, treatments, appointments, catalog] = await Promise.all([
      DentalAPI.get("/api/patients"), DentalAPI.get("/api/patient-treatments"),
      DentalAPI.get("/api/appointments?status=scheduled"), DentalAPI.get("/api/treatment-catalog")
    ]);
    if (!bookingDialog.open || generation !== bookingGeneration) return;
    bookingForm.elements.catalog_id.innerHTML = '<option value="">Seleccionar procedimiento...</option>' + catalog
      .map((item) => `<option value="${item.id}">${DentalAPI.escapeHtml(item.name)} · ${DentalAPI.money(item.default_price || 0)}</option>`).join("");
    showPatientCreation(false);
    renderPatientChoices("");
    if (options.patientId) patientSelect.value = String(options.patientId);
    bookingForm.querySelector(".booking-patient-picker").hidden = Boolean(options.patientId);
    const patient = patients.find((item) => Number(item.id) === Number(options.patientId));
    bookingForm.querySelector("#calendarBookingTitle").textContent = patient ? `Agendar cita · ${DentalAPI.fullName(patient)}` : "Agendar cita";
    const treatment = treatments.find((item) => Number(item.id) === Number(options.treatmentId));
    const observationFee = treatment?.title?.trim().toLocaleLowerCase("es") === "observación clínica";
    bookingForm.elements.booking_type.value = observationFee ? "observation" : "treatment";
    setBookingFollowup(options.followup || null);
    updateBookingTreatmentOptions();
    if (treatment && !observationFee && ["planned", "in_progress"].includes(treatment.status)) {
      treatmentSelect.value = String(treatment.id);
      loadBookingTreatment();
    }
    const nextDate = options.followup ? addDays(new Date(String(options.followup.starts_at).replace(" ", "T")), 7) : new Date();
    bookingForm.elements.booking_date.value = options.date || dateKey(nextDate < new Date() ? new Date() : nextDate);
    bookingForm.elements.booking_time.value = options.hour || (options.followup ? String(options.followup.starts_at).slice(11, 16) : "09:00");
    bookingForm.elements.procedure_teeth.value = options.toothCode || "";
    if (options.catalogId) {
      bookingForm.elements.catalog_id.value = String(options.catalogId);
      bookingForm.elements.catalog_id.dispatchEvent(new Event("change"));
    }
    bookingForm.querySelector("[data-booking-picker-error]").textContent = "";
    bookingForm.querySelectorAll("[data-booking-appointment-field]").forEach((field) => { field.hidden = Boolean(options.treatmentOnly); });
    bookingForm.elements.booking_date.required = !options.treatmentOnly;
    bookingForm.elements.booking_time.required = !options.treatmentOnly;
    treatmentSelect.closest("label").hidden = Boolean(options.treatmentOnly);
    bookingForm.querySelector('button[type="submit"]').textContent = options.treatmentOnly ? "Guardar tratamiento" : "Agendar cita";
    if (options.treatmentOnly) bookingForm.querySelector("#calendarBookingTitle").textContent = patient ? `Nuevo tratamiento · ${DentalAPI.fullName(patient)}` : "Nuevo tratamiento";
    updateSchedule();
    updateBookingFields();
    updateBookingAvailability();
    (options.patientId ? treatmentSelect : patientSearch).focus();
    bookingForm.querySelector('button[type="submit"]').disabled = false;
    updateBookingAvailability();
    bookingGuard.markClean();
  } catch (error) { bookingStatus.textContent = error.message; }
}
window.AppointmentBooking = Object.freeze({ open });
})();
