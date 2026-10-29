const patientsTable = document.querySelector("#patientsTable");
const patientsSearch = document.querySelector("#patientsSearch");
const patientForm = document.querySelector("#patientForm");
const patientFormStatus = document.querySelector("#patientFormStatus");
const exportPatientsBtn = document.querySelector("#exportPatientsBtn");
const patientStatusFilter = document.querySelector("#patientStatusFilter");

let patients = [];
let appointments = [];
let treatments = [];
let statusFilter = "active";

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function nextAppointmentFor(patientId) {
  const now = new Date();
  return appointments
    .filter((appointment) => Number(appointment.patient_id) === Number(patientId))
    .filter((appointment) => !["cancelled", "missed", "attended"].includes(appointment.status))
    .filter((appointment) => new Date(String(appointment.starts_at).replace(" ", "T")) >= now)
    .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))[0] || null;
}

function statusClass(status) {
  if (status === "in_progress") return "in-progress";
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  if (status === "planned") return "planned";
  return "registered";
}

function renderPatients() {
  const query = normalize(patientsSearch.value);
  const treatmentByPatient = new Map(treatments.map((treatment) => [Number(treatment.patient_id), treatment]));
  const visible = patients.filter((patient) => {
    const treatment = treatmentByPatient.get(Number(patient.id));
    const status = treatment?.status || "registered";
    const haystack = normalize(`${DentalAPI.fullName(patient)} ${patient.rut || ""} ${patient.phone || ""} ${patient.email || ""}`);
    const matchesSearch = haystack.includes(query);
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? !["completed", "cancelled"].includes(status) : status === statusFilter);
    return matchesSearch && matchesStatus;
  });

  patientsTable.innerHTML = `
    <div class="records-row records-head" role="row"><span>Paciente</span><span>Proxima cita</span><span>Contacto</span><span>Estado</span></div>
    ${visible.map((patient) => {
      const treatment = treatmentByPatient.get(Number(patient.id));
      const appointment = nextAppointmentFor(patient.id);
      const status = treatment?.status || "registered";
      return `
        <a class="records-row" href="./paciente.html?id=${patient.id}" role="row">
          <span><strong>${DentalAPI.escapeHtml(DentalAPI.fullName(patient))}</strong><small>${DentalAPI.escapeHtml(patient.rut || "Sin RUT")}</small></span>
          <span>${appointment ? `${DentalAPI.date(appointment.starts_at, { day: "2-digit", month: "2-digit" })} ${DentalAPI.time(appointment.starts_at)}` : "Sin cita"}</span>
          <span><strong>${DentalAPI.escapeHtml(patient.phone || "Sin telefono")}</strong><small>${DentalAPI.escapeHtml(patient.email || "Sin correo")}</small></span>
          <span><mark class="status-mark ${statusClass(status)}">${DentalAPI.escapeHtml(treatment ? DentalAPI.statusLabel(status) : "Ficha registrada")}</mark></span>
        </a>`;
    }).join("") || `<p class="empty-state">No hay pacientes que coincidan con el filtro.</p>`}
  `;
}
function csvCell(value) {
  const raw = String(value ?? "");
  const safe = /^[=+\-@＝＋－＠\s\u0000-\u001f]/u.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function exportPatients() {
  const rows = [
    ["Nombre", "RUT", "Telefono", "Correo", "Alerta clinica"],
    ...patients.map((patient) => [
      DentalAPI.fullName(patient),
      patient.rut || "",
      patient.phone || "",
      patient.email || "",
      patient.active_alert || ""
    ])
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pacientes-consulta-dental-${DentalAPI.localDateString()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  patientFormStatus.textContent = "Listado exportado.";
}

async function loadPatientsPage() {
  patientsTable.innerHTML = `<p class="empty-state">Cargando pacientes desde SQLite...</p>`;
  [patients, appointments, treatments] = await Promise.all([
    DentalAPI.get("/api/patients"),
    DentalAPI.get("/api/appointments"),
    DentalAPI.get("/api/patient-treatments")
  ]);
  renderPatients();
}

patientsSearch.addEventListener("input", renderPatients);
patientStatusFilter.addEventListener("change", () => { statusFilter = patientStatusFilter.value; renderPatients(); });
exportPatientsBtn.addEventListener("click", exportPatients);

if (window.location.hash === "#nuevo") {
  patientForm.scrollIntoView({ behavior: "smooth", block: "start" });
  patientForm.querySelector("input[name='first_name']").focus();
}

function formatRut(value) {
  const characters = String(value || "").toUpperCase().replace(/[^0-9K]/g, "");
  if (characters.length < 2) return characters;
  const verifier = characters.slice(-1);
  const number = characters.slice(0, -1).replace(/K/g, "");
  const groups = number.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${groups}-${verifier}`;
}

function nationalPhoneDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.startsWith("56") && digits.length > 9 ? digits.slice(2) : digits;
}

const rutInput = patientForm.elements.rut;
const patientGuard = window.UnsavedEdits.trackForm(patientForm);
const phoneInput = patientForm.elements.phone;
rutInput.addEventListener("input", () => {
  const tokenCount = (rutInput.value.slice(0, rutInput.selectionStart).match(/[0-9kK]/g) || []).length;
  const formatted = formatRut(rutInput.value);
  rutInput.value = formatted;
  let position = 0;
  let seen = 0;
  while (position < formatted.length && seen < tokenCount) {
    if (/[0-9K]/.test(formatted[position])) seen += 1;
    position += 1;
  }
  rutInput.setSelectionRange(position, position);
});
phoneInput.addEventListener("input", () => {
  phoneInput.value = nationalPhoneDigits(phoneInput.value);
});

patientForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(patientForm);
  const data = Object.fromEntries(formData.entries());
  data.rut = formatRut(data.rut);
  const phoneDigits = nationalPhoneDigits(phoneInput.value);
  data.phone = phoneDigits ? `+56 ${phoneDigits}` : "";
  const submitButton = patientForm.querySelector("button[type='submit']");
  if (submitButton.disabled) return;
  patientGuard.setBusy(true);

  patientFormStatus.textContent = "Guardando paciente...";
  submitButton.disabled = true;

  try {
    const created = await DentalAPI.post("/api/patients", {
      ...data,
      is_active: 1
    });
    patientFormStatus.textContent = "Paciente guardado. Abriendo su ficha para agendar la primera cita...";
    patientGuard.setBusy(false); patientGuard.markClean();
    window.location.assign(`./paciente.html?id=${encodeURIComponent(created.id)}&agendar=1`);
  } catch (error) {
    patientFormStatus.textContent = error.message;
    submitButton.disabled = false;
  } finally { patientGuard.setBusy(false); }
});

loadPatientsPage().catch((error) => {
  patientsTable.innerHTML = `<p class="empty-state">No se pudo cargar el listado: ${DentalAPI.escapeHtml(error.message)}</p>`;
});
