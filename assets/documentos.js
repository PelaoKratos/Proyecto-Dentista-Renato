const documentForm = document.querySelector("#documentForm");
const documentPatientSelect = document.querySelector("#documentPatientSelect");
const documentTypeSelect = document.querySelector("#documentTypeSelect");
const documentNote = document.querySelector("#documentNote");
const documentStatus = document.querySelector("#documentStatus");
const documentPreview = document.querySelector("#documentPreview");
const documentPreviewTitle = document.querySelector("#documentPreviewTitle");
const printDocumentBtn = document.querySelector("#printDocumentBtn");

const state = {
  patients: [],
  currentHtml: "",
  currentTitle: "Documento clinico"
};

const documentTitles = {
  clinical: "Ficha clinica",
  budget: "Presupuesto",
  receipt: "Comprobante de pago",
  consent: "Consentimiento simple"
};

function money(value) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function fullName(patient) {
  return DentalAPI.fullName(patient);
}

function clean(value, fallback = "No registrado") {
  const text = String(value ?? "").trim();
  return DentalAPI.escapeHtml(text || fallback);
}

function longDate(value) {
  if (!value) return "No registrada";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return DentalAPI.escapeHtml(value);
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "long" }).format(date);
}

function shortDate(value) {
  return value ? DentalAPI.date(value) : "No registrada";
}

function treatmentAmount(treatment) {
  return Number(treatment.final_price || treatment.estimated_price || 0);
}

function totalPayments(payments) {
  return payments.reduce((total, payment) => total + Number(payment.amount || 0), 0);
}

function treatmentPaid(treatment, payments) {
  return payments
    .filter((payment) => Number(payment.patient_treatment_id) === Number(treatment.id))
    .reduce((total, payment) => total + Number(payment.amount || 0), 0);
}

function renderHeader(title, patient) {
  return `
    <header class="document-header">
      <div>
        <strong>Consulta Dental Renato</strong>
        <span>Documento generado el ${longDate(new Date().toISOString())}</span>
      </div>
      <div>
        <strong>${DentalAPI.escapeHtml(title)}</strong>
        <span>${clean(fullName(patient))}</span>
      </div>
    </header>
  `;
}

function renderPatientBlock(patient) {
  return `
    <section class="document-section two-columns">
      <div><small>Paciente</small><strong>${clean(fullName(patient))}</strong></div>
      <div><small>RUT</small><strong>${clean(patient.rut)}</strong></div>
      <div><small>Telefono</small><strong>${clean(patient.phone)}</strong></div>
      <div><small>Email</small><strong>${clean(patient.email)}</strong></div>
      <div><small>Fecha nacimiento</small><strong>${shortDate(patient.birth_date)}</strong></div>
      <div><small>Direccion</small><strong>${clean(patient.address)}</strong></div>
    </section>
  `;
}

function noteSection(note) {
  if (!note.trim()) return "";
  return `
    <section class="document-section">
      <h3>Observacion</h3>
      <p>${clean(note, "")}</p>
    </section>
  `;
}

function emptyLine(text) {
  return `<p class="document-muted">${DentalAPI.escapeHtml(text)}</p>`;
}

function renderClinical(summary, note) {
  return DentalClinicalExport.render(summary, note);
}

function renderBudget(summary, note) {
  const { patient } = summary;
  const treatments = summary.treatments || [];
  const payments = summary.payments || [];
  const total = treatments.reduce((sum, treatment) => sum + treatmentAmount(treatment), 0);
  const paid = totalPayments(payments);
  const balance = Math.max(total - paid, 0);
  const title = "Presupuesto dental";

  return `
    ${renderHeader(title, patient)}
    ${renderPatientBlock(patient)}
    <section class="document-section">
      <h3>Detalle de tratamientos</h3>
      ${
        treatments.length
          ? `<table><thead><tr><th>Tratamiento</th><th>Pieza</th><th>Diagnostico</th><th>Valor</th></tr></thead><tbody>${treatments
              .map(
                (treatment) => `
                  <tr>
                    <td>${clean(treatment.title)}</td>
                    <td>${clean(treatment.tooth_code, "General")}</td>
                    <td>${clean(treatment.diagnosis)}</td>
                    <td>${money(treatmentAmount(treatment))}</td>
                  </tr>
                `
              )
              .join("")}</tbody></table>`
          : emptyLine("No hay tratamientos para presupuestar.")
      }
    </section>
    <section class="document-totals">
      <div><span>Total presupuestado</span><strong>${money(total)}</strong></div>
      <div><span>Abonos registrados</span><strong>${money(paid)}</strong></div>
      <div><span>Saldo pendiente</span><strong>${money(balance)}</strong></div>
    </section>
    <section class="document-section">
      <h3>Condiciones</h3>
      <p>Presupuesto referencial sujeto a evaluacion clinica, disponibilidad de examenes y evolucion del tratamiento.</p>
    </section>
    ${noteSection(note)}
    ${renderSignatureBlock()}
  `;
}

function renderReceipt(summary, note) {
  const { patient } = summary;
  const payments = [...(summary.payments || [])].sort((a, b) => String(b.payment_date || "").localeCompare(String(a.payment_date || "")) || Number(b.id || 0) - Number(a.id || 0));
  const treatments = summary.treatments || [];
  const payment = payments[0];
  const treatment = payment ? treatments.find((item) => Number(item.id) === Number(payment.patient_treatment_id)) : null;
  const title = "Comprobante de pago";

  return `
    ${renderHeader(title, patient)}
    ${renderPatientBlock(patient)}
    <section class="document-section receipt-box">
      <h3>Ultimo pago registrado</h3>
      ${
        payment
          ? `
            <div class="receipt-amount">${money(payment.amount)}</div>
            <div class="two-columns compact-document-grid">
              <div><small>Fecha</small><strong>${shortDate(payment.payment_date)}</strong></div>
              <div><small>Metodo</small><strong>${clean(payment.method)}</strong></div>
              <div><small>Tratamiento</small><strong>${clean(treatment?.title, "Pago general")}</strong></div>
              <div><small>Nota</small><strong>${clean(payment.notes, "Sin nota")}</strong></div>
            </div>
          `
          : emptyLine("No hay pagos registrados para este paciente.")
      }
    </section>
    <section class="document-totals">
      <div><span>Total pagado por paciente</span><strong>${money(totalPayments(payments))}</strong></div>
    </section>
    ${noteSection(note)}
    ${renderSignatureBlock()}
  `;
}

function renderConsent(summary, note) {
  const { patient } = summary;
  const treatments = summary.treatments || [];
  const activeTreatments = treatments.filter((treatment) => !["completed", "cancelled"].includes(treatment.status));
  const title = "Consentimiento simple";

  return `
    ${renderHeader(title, patient)}
    ${renderPatientBlock(patient)}
    <section class="document-section consent-text">
      <h3>Consentimiento informado simple</h3>
      <p>Yo, ${clean(fullName(patient), "____________________________")}, declaro haber recibido informacion sobre la evaluacion, alternativas de tratamiento, posibles molestias, riesgos habituales y cuidados posteriores asociados a mi atencion dental.</p>
      <p>Entiendo que el plan puede ajustarse segun hallazgos clinicos, examenes complementarios o evolucion del caso.</p>
      <p>Autorizo a Consulta Dental Renato a registrar mi informacion clinica y mantener radiografias, fotografias o documentos necesarios para mi atencion.</p>
    </section>
    <section class="document-section">
      <h3>Tratamientos relacionados</h3>
      ${
        activeTreatments.length
          ? `<ul>${activeTreatments.map((treatment) => `<li>${clean(treatment.title)} ${treatment.tooth_code ? `- pieza ${clean(treatment.tooth_code, "")}` : ""}</li>`).join("")}</ul>`
          : emptyLine("No hay tratamientos activos registrados.")
      }
    </section>
    ${noteSection(note)}
    <section class="signature-grid consent-signatures">
      <div><span>Firma paciente</span></div>
      <div><span>Firma profesional</span></div>
    </section>
  `;
}

function renderSignatureBlock() {
  return `
    <section class="signature-grid">
      <div><span>Firma profesional</span></div>
      <div><span>Timbre consulta</span></div>
    </section>
  `;
}

async function generateDocument() {
  const patientId = documentPatientSelect.value;
  const type = documentTypeSelect.value;
  const note = documentNote.value || "";
  if (!patientId) {
    documentStatus.textContent = "Selecciona un paciente para generar el documento.";
    return;
  }

  documentStatus.textContent = "Generando vista previa...";
  const summary = await DentalAPI.get(`/api/patients/${patientId}/summary`);
  const builders = {
    clinical: renderClinical,
    budget: renderBudget,
    receipt: renderReceipt,
    consent: renderConsent
  };
  const title = documentTitles[type] || "Documento clinico";
  const html = builders[type](summary, note);
  state.currentHtml = html;
  state.currentTitle = `${title} - ${fullName(summary.patient)}`;
  documentPreviewTitle.textContent = title;
  documentPreview.innerHTML = html;
  documentStatus.textContent = "Vista previa actualizada.";
}

function printCurrentDocument() {
  if (!state.currentHtml) {
    documentStatus.textContent = "Genera una vista previa antes de imprimir.";
    return;
  }
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    documentStatus.textContent = "El navegador bloqueo la ventana de impresion.";
    return;
  }
  const stylesheet = new URL("./assets/styles.css", window.location.href).href;
  const clinicalStyles = new URL("./assets/ficha-print.css", window.location.href).href;
  printWindow.document.write(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>${DentalAPI.escapeHtml(state.currentTitle)}</title>
        <link rel="stylesheet" href="${stylesheet}" />
        <link rel="stylesheet" href="${clinicalStyles}" />
      </head>
      <body class="print-window">
        <article class="print-sheet">${state.currentHtml}</article>
        <script>window.addEventListener("load", () => window.print());<\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

async function loadPatients() {
  state.patients = await DentalAPI.get("/api/patients");
  documentPatientSelect.innerHTML = `<option value="">Seleccionar paciente</option>${state.patients
    .map((patient) => `<option value="${patient.id}">${clean(fullName(patient))}</option>`)
    .join("")}`;

  const params = new URLSearchParams(window.location.search);
  const patientId = params.get("patient_id") || params.get("id");
  const type = params.get("type");
  if (patientId) documentPatientSelect.value = patientId;
  if (type && documentTitles[type]) documentTypeSelect.value = type;
  if (documentPatientSelect.value) await generateDocument();
}

documentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  generateDocument().catch((error) => {
    documentStatus.textContent = `No se pudo generar el documento: ${error.message}`;
  });
});

documentTypeSelect.addEventListener("change", () => {
  if (!documentPatientSelect.value) return;
  generateDocument().catch((error) => {
    documentStatus.textContent = `No se pudo actualizar la vista previa: ${error.message}`;
  });
});

documentPatientSelect.addEventListener("change", () => {
  if (!documentPatientSelect.value) return;
  generateDocument().catch((error) => {
    documentStatus.textContent = `No se pudo cargar la ficha: ${error.message}`;
  });
});

printDocumentBtn.addEventListener("click", printCurrentDocument);

loadPatients().catch((error) => {
  documentStatus.textContent = `No se pudieron cargar pacientes: ${error.message}`;
});
