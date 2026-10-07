const attachmentPreview = document.querySelector("#attachmentPreview");
const attachmentsList = document.querySelector("#attachmentsList");
const attachmentForm = document.querySelector("#attachmentForm");
const attachmentPatient = document.querySelector("#attachmentPatient");
const attachmentTreatment = document.querySelector("#attachmentTreatment");
const attachmentSession = document.querySelector("#attachmentSession");
const attachmentStatus = document.querySelector("#attachmentStatus");
const attachmentPatientFilter = document.querySelector("#attachmentPatientFilter");
const attachmentTypeFilter = document.querySelector("#attachmentTypeFilter");
const focusAttachmentForm = document.querySelector("#focusAttachmentForm");

let patients = [];
let treatments = [];
let sessions = [];
let attachments = [];
let activeAttachmentId = null;

function typeLabel(type) {
  const labels = {
    radiography: "Radiografia",
    photo: "Foto clinica",
    document: "Documento",
    other: "Otro"
  };
  return labels[type] || type || "Adjunto";
}

function patientName(patientId) {
  const patient = patients.find((item) => item.id === Number(patientId));
  return patient ? DentalAPI.fullName(patient) : "Paciente";
}

function treatmentTitle(treatmentId) {
  const treatment = treatments.find((item) => item.id === Number(treatmentId));
  return treatment ? treatment.title : "Sin tratamiento";
}

function sessionTitle(sessionId) {
  const session = sessions.find((item) => item.id === Number(sessionId));
  if (!session) return "Sin evolucion";
  return `${DentalAPI.date(session.session_date, { day: "2-digit", month: "2-digit" })} ${DentalAPI.time(session.session_date)} - ${session.reason || "Evolucion"}`;
}

function isPreviewableImage(attachment) {
  return attachment.file_type === "radiography" || attachment.file_type === "photo" || String(attachment.mime_type || "").startsWith("image/");
}

function visibleAttachments() {
  const patientFilter = Number(attachmentPatientFilter.value || 0);
  const typeFilter = attachmentTypeFilter.value;
  return attachments.filter((attachment) => {
    const matchesPatient = !patientFilter || attachment.patient_id === patientFilter;
    const matchesType = !typeFilter || attachment.file_type === typeFilter;
    return matchesPatient && matchesType;
  });
}

function selectedAttachment(rows = visibleAttachments()) {
  return rows.find((attachment) => attachment.id === activeAttachmentId) || rows[0] || null;
}

function renderUploadOptions() {
  const patientId = Number(attachmentPatient.value || 0);

  attachmentTreatment.innerHTML =
    `<option value="">Sin tratamiento asociado</option>` +
    treatments
      .filter((treatment) => treatment.patient_id === patientId)
      .map((treatment) => `<option value="${treatment.id}">${DentalAPI.escapeHtml(treatment.title)}</option>`)
      .join("");

  attachmentSession.innerHTML =
    `<option value="">Sin evolucion asociada</option>` +
    sessions
      .filter((session) => session.patient_id === patientId)
      .map((session) => `<option value="${session.id}">${DentalAPI.escapeHtml(sessionTitle(session.id))}</option>`)
      .join("");
}

function renderFilters() {
  const patientOptions = patients
    .map((patient) => `<option value="${patient.id}">${DentalAPI.escapeHtml(DentalAPI.fullName(patient))}</option>`)
    .join("");

  attachmentPatient.innerHTML = patientOptions;
  attachmentPatientFilter.innerHTML = `<option value="">Todos los pacientes</option>${patientOptions}`;
  renderUploadOptions();
}

function renderPreview(rows = visibleAttachments()) {
  const attachment = selectedAttachment(rows);

  if (!attachment) {
    activeAttachmentId = null;
    attachmentPreview.innerHTML = `<div class="empty-state">No hay adjuntos para los filtros seleccionados.</div>`;
    return;
  }

  activeAttachmentId = attachment.id;
  const mediaMarkup = isPreviewableImage(attachment)
    ? `<img src="./${DentalAPI.escapeHtml(attachment.stored_path)}" alt="Adjunto clinico" />`
    : `<div class="empty-state">Vista previa no disponible para este tipo de archivo.</div>`;

  attachmentPreview.innerHTML = `
    ${mediaMarkup}
    <div class="attachment-details">
      <strong>${DentalAPI.escapeHtml(attachment.category || attachment.original_filename)}</strong>
      <span>${DentalAPI.patientLink(attachment.patient_id, patientName(attachment.patient_id))} · ${DentalAPI.date(attachment.taken_at || attachment.created_at)}</span>
      <span>${DentalAPI.escapeHtml(typeLabel(attachment.file_type))} · ${DentalAPI.escapeHtml(treatmentTitle(attachment.patient_treatment_id))}</span>
      <span>${DentalAPI.escapeHtml(sessionTitle(attachment.clinical_session_id))}</span>
      <p>${DentalAPI.escapeHtml(attachment.notes || "Adjunto registrado en la ficha del paciente.")}</p>
      <code>${DentalAPI.escapeHtml(attachment.stored_path)}</code>
      <div class="inline-actions">
        <a class="text-button link-button" href="./${DentalAPI.escapeHtml(attachment.stored_path)}" target="_blank" rel="noopener">Abrir archivo</a>
        <a class="text-button link-button" href="./paciente.html?id=${attachment.patient_id}">Abrir ficha</a>
      </div>
    </div>
  `;
}

function renderList() {
  const rows = visibleAttachments();

  attachmentsList.innerHTML = `
    <div class="section-heading compact-heading"><div><span class="eyebrow">Archivo</span><h2>Adjuntos guardados</h2></div></div>
    <div class="attachment-table attachment-admin-table" role="table" aria-label="Adjuntos clinicos">
      <div role="row" class="table-head">
        <span role="columnheader">Tipo</span>
        <span role="columnheader">Paciente</span>
        <span role="columnheader">Vinculo clinico</span>
        <span role="columnheader">Acciones</span>
      </div>
      ${
        rows
          .map(
            (attachment) => `
              <div role="row" data-attachment-row="${attachment.id}" class="${attachment.id === activeAttachmentId ? "selected-row" : ""}">
                <span role="cell">${DentalAPI.escapeHtml(attachment.category || typeLabel(attachment.file_type))}</span>
                <span role="cell">${DentalAPI.patientLink(attachment.patient_id, patientName(attachment.patient_id))}</span>
                <span role="cell">${DentalAPI.escapeHtml(treatmentTitle(attachment.patient_treatment_id))} · ${DentalAPI.escapeHtml(sessionTitle(attachment.clinical_session_id))}</span>
                <span role="cell" class="inline-actions">
                  <button class="text-button" type="button" data-preview-attachment="${attachment.id}">Ver</button>
                  <a class="text-button link-button" href="./paciente.html?id=${attachment.patient_id}">Ficha</a>
                  <button class="text-button danger-action" type="button" data-delete-attachment="${attachment.id}">Eliminar</button>
                </span>
              </div>
            `
          )
          .join("") || `<div role="row"><span role="cell">Sin adjuntos</span><span role="cell">-</span><span role="cell">-</span><span role="cell">-</span></div>`
      }
    </div>
  `;
}

function renderAll() {
  const rows = visibleAttachments();
  renderPreview(rows);
  renderList();
}

async function loadRadiografias() {
  [patients, treatments, sessions, attachments] = await Promise.all([
    DentalAPI.get("/api/patients"),
    DentalAPI.get("/api/patient-treatments"),
    DentalAPI.get("/api/clinical-sessions"),
    DentalAPI.get("/api/attachments")
  ]);
  renderFilters();
  renderAll();
}

focusAttachmentForm.addEventListener("click", () => {
  attachmentForm.scrollIntoView({ behavior: "smooth", block: "start" });
  attachmentPatient.focus();
});

attachmentPatient.addEventListener("change", renderUploadOptions);

[attachmentPatientFilter, attachmentTypeFilter].forEach((filter) => {
  filter.addEventListener("change", () => {
    activeAttachmentId = null;
    renderAll();
  });
});

if (window.location.hash === "#nuevo") {
  attachmentForm.scrollIntoView({ behavior: "smooth", block: "start" });
  attachmentPatient.focus();
}

attachmentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(attachmentForm);
  const submitButton = attachmentForm.querySelector("button[type='submit']");
  attachmentStatus.textContent = "Guardando adjunto...";
  submitButton.disabled = true;

  try {
    const response = await fetch("/api/attachments", {
      method: "POST",
      body: formData
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No se pudo guardar el adjunto.");
    attachmentStatus.textContent = "Adjunto guardado.";
    activeAttachmentId = payload.id;
    attachmentForm.reset();
    await loadRadiografias();
    submitButton.disabled = false;
  } catch (error) {
    attachmentStatus.textContent = error.message;
    submitButton.disabled = false;
  }
});

attachmentsList.addEventListener("click", async (event) => {
  const previewButton = event.target.closest("[data-preview-attachment]");
  if (previewButton) {
    activeAttachmentId = Number(previewButton.dataset.previewAttachment);
    renderAll();
    attachmentPreview.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const deleteButton = event.target.closest("[data-delete-attachment]");
  if (!deleteButton) return;
  if (!window.confirm("Eliminar este registro de adjunto? El archivo local puede permanecer en la carpeta media.")) return;

  deleteButton.disabled = true;
  try {
    await DentalAPI.del(`/api/attachments/${deleteButton.dataset.deleteAttachment}`);
    activeAttachmentId = null;
    await loadRadiografias();
  } catch (error) {
    window.alert(error.message);
    deleteButton.disabled = false;
  }
});

loadRadiografias().catch((error) => {
  attachmentPreview.innerHTML = `<p class="empty-state">No se pudieron cargar adjuntos: ${DentalAPI.escapeHtml(error.message)}</p>`;
});
