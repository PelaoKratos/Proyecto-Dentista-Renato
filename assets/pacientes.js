const patientsTable = document.querySelector("#patientsTable");
const patientsSearch = document.querySelector("#patientsSearch");
const patientForm = document.querySelector("#patientForm");
const patientFormStatus = document.querySelector("#patientFormStatus");
const exportPatientsBtn = document.querySelector("#exportPatientsBtn");

let patients = [];
let appointments = [];
let treatments = [];

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function renderPatients() {
  const query = normalize(patientsSearch.value);
  const treatmentByPatient = new Map(treatments.map((treatment) => [treatment.patient_id, treatment]));
  const appointmentByPatient = new Map(appointments.map((appointment) => [appointment.patient_id, appointment]));
  const visible = patients.filter((patient) =>
    normalize(`${DentalAPI.fullName(patient)} ${patient.rut || ""} ${patient.phone || ""}`).includes(query)
  );

  patientsTable.innerHTML = `
    <div class="records-row records-head" role="row"><span>Paciente</span><span>Contacto</span><span>Estado</span><span>Proxima cita</span></div>
    ${
      visible
        .map((patient) => {
          const treatment = treatmentByPatient.get(patient.id);
          const appointment = appointmentByPatient.get(patient.id);
          return `
            <a class="records-row" href="./paciente.html?id=${patient.id}" role="row">
              <span><strong>${DentalAPI.escapeHtml(DentalAPI.fullName(patient))}</strong><small>${DentalAPI.escapeHtml(patient.rut || "Sin RUT")}</small></span>
              <span>${DentalAPI.escapeHtml(patient.phone || patient.email || "Sin contacto")}</span>
              <span><mark>${DentalAPI.escapeHtml(treatment ? DentalAPI.statusLabel(treatment.status) : "Ficha")}</mark></span>
              <span>${
                appointment
                  ? `${DentalAPI.date(appointment.starts_at, { day: "2-digit", month: "2-digit" })} ${DentalAPI.time(appointment.starts_at)}`
                  : "Sin cita"
              }</span>
            </a>
          `;
        })
        .join("") || `<p class="empty-state">No hay pacientes que coincidan con la busqueda.</p>`
    }
  `;
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
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
  link.download = `pacientes-consulta-dental-${new Date().toISOString().slice(0, 10)}.csv`;
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
exportPatientsBtn.addEventListener("click", exportPatients);

if (window.location.hash === "#nuevo") {
  patientForm.scrollIntoView({ behavior: "smooth", block: "start" });
  patientForm.querySelector("input[name='first_name']").focus();
}

patientForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(patientForm);
  const data = Object.fromEntries(formData.entries());
  const submitButton = patientForm.querySelector("button[type='submit']");

  patientFormStatus.textContent = "Guardando paciente...";
  submitButton.disabled = true;

  try {
    const created = await DentalAPI.post("/api/patients", {
      ...data,
      is_active: 1
    });
    patientFormStatus.textContent = "Paciente guardado.";
    window.location.href = `./paciente.html?id=${created.id}`;
  } catch (error) {
    patientFormStatus.textContent = error.message;
    submitButton.disabled = false;
  }
});

loadPatientsPage().catch((error) => {
  patientsTable.innerHTML = `<p class="empty-state">No se pudo cargar el listado: ${DentalAPI.escapeHtml(error.message)}</p>`;
});
