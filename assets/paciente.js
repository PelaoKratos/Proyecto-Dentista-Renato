const patientPage = document.querySelector(".patient-page");
let currentSummary = null;
let patientActiveTab = "clinical";
let historyFilter = "all";
let historySearch = "";
let currentCatalog = [];
let selectedToothForAppointment = null;

const toothNotes = {
  36: "Evaluacion para implante. Requiere revisar altura osea en radiografia panoramica.",
  46: "Restauracion antigua. Controlar filtracion en proxima limpieza.",
  17: "Sin hallazgos actuales. Mantener observacion preventiva.",
  11: "Control estetico normal. Sin indicacion activa."
};
function toothDescription(code) {
  const value = String(code || "");
  const quadrant = value.charAt(0);
  const position = value.charAt(1);
  const positions = { 1: "Incisivo central", 2: "Incisivo lateral", 3: "Canino", 4: "Primer premolar", 5: "Segundo premolar", 6: "Primer molar", 7: "Segundo molar", 8: "Tercer molar" };
  const quadrants = { 1: "superior derecho", 2: "superior izquierdo", 3: "inferior izquierdo", 4: "inferior derecho" };
  return positions[position] && quadrants[quadrant] ? `${positions[position]} ${quadrants[quadrant]}` : "Pieza dental seleccionada";
}

function catalogGroup(name) {
  const value = String(name || "").toLowerCase();
  if (value.includes("limpieza") || value.includes("evaluacion")) return "Preventivo";
  if (value.includes("extraccion") || value.includes("implante")) return "Cirugia";
  if (value.includes("resina")) return "Restauracion";
  if (value.includes("endodoncia")) return "Endodoncia";
  if (value.includes("corona") || value.includes("protesis") || value.includes("plano")) return "Protesis";
  if (value.includes("blanqueamiento") || value.includes("carilla")) return "Estetico";
  return "Periodontal";
}

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

function ageFromBirthDate(birthDate) {
  if (!birthDate) return "Edad sin registrar";
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "Edad sin registrar";
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return `${age} anos`;
}

function totalTreatments(summary) {
  return summary.treatments.reduce((total, treatment) => total + Number(treatment.final_price ?? treatment.estimated_price ?? 0), 0);
}

function totalPayments(summary) {
  return summary.payments.reduce((total, payment) => total + Number(payment.amount || 0), 0);
}

function balance(summary) {
  return Math.max(totalTreatments(summary) - totalPayments(summary), 0);
}

function treatmentTotal(treatment) {
  return Number(treatment.final_price ?? treatment.estimated_price ?? 0);
}

function treatmentPaid(summary, treatmentId) {
  return summary.payments
    .filter((payment) => Number(payment.patient_treatment_id) === Number(treatmentId))
    .reduce((total, payment) => total + Number(payment.amount || 0), 0);
}

function treatmentBalance(summary, treatment) {
  return Math.max(treatmentTotal(treatment) - treatmentPaid(summary, treatment.id), 0);
}

function paymentState(total, paid) {
  if (total <= 0 && paid <= 0) return "Sin presupuesto";
  if (paid <= 0) return "Pendiente";
  if (paid < total) return "Parcial";
  return "Pagado";
}

function paymentStateClass(total, paid) {
  const state = paymentState(total, paid);
  if (state === "Pagado") return "success";
  if (state === "Parcial") return "warning";
  return "";
}

function activeTreatment(summary) {
  return summary.treatments.find((treatment) => treatment.status !== "completed" && treatment.status !== "cancelled") || summary.treatments[0];
}

function statusOptions(selectedStatus) {
  return ["planned", "in_progress", "completed", "cancelled"]
    .map((status) => `<option value="${status}" ${status === selectedStatus ? "selected" : ""}>${DentalAPI.escapeHtml(DentalAPI.statusLabel(status))}</option>`)
    .join("");
}

function progressForStatus(status) {
  if (status === "completed") return 100;
  if (status === "in_progress") return 62;
  if (status === "cancelled") return 0;
  return 22;
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

function dateKey(value) {
  return String(value || "").slice(0, 10) || "sin-fecha";
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

function attachmentTypeLabel(type) {
  const labels = {
    radiography: "Radiografia",
    photo: "Foto clinica",
    document: "Documento",
    other: "Otro"
  };
  return labels[type] || type || "Adjunto";
}

function renderOdontogram(selectedTooth = "36", treatments = []) {
  const teeth = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28", "48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
  const treatmentByTooth = new Map();
  treatments.filter((item) => item.tooth_code).forEach((item) => {
    const tooth = String(item.tooth_code);
    if (!treatmentByTooth.has(tooth)) treatmentByTooth.set(tooth, item);
  });
  const shapeFor = (tooth) => {
    const digit = Number(String(tooth).slice(-1));
    if ([1, 2].includes(digit)) return "incisor";
    if (digit === 3) return "canine";
    if ([4, 5].includes(digit)) return "premolar";
    return "molar";
  };
  const toothMarkup = (tooth, upper) => {
    const treatment = treatmentByTooth.get(tooth);
    const status = treatment?.status || "none";
    const shape = shapeFor(tooth);
    const width = shape === "molar" ? 30 : shape === "premolar" ? 24 : shape === "canine" ? 21 : 17;
    const fill = status === "completed" ? "#ccfbf1" : status === "in_progress" ? "#fef3c7" : status === "planned" ? "#dbeafe" : "#ffffff";
    const stroke = status === "completed" ? "#0d9488" : status === "in_progress" ? "#f59e0b" : status === "planned" ? "#3b82f6" : "#94a3b8";
    const rootCount = shape === "molar" ? 3 : shape === "premolar" ? 2 : 1;
    const roots = Array.from({ length: rootCount }, (_, index) => {
      const rootWidth = width / rootCount - 2;
      const rootX = 2 + index * (width / rootCount) + 1;
      const rootPath = upper ? `M${rootX},24 C${rootX},38 ${rootX + rootWidth},38 ${rootX + rootWidth},24` : `M${rootX},15 C${rootX},2 ${rootX + rootWidth},2 ${rootX + rootWidth},15`;
      return `<path d="${rootPath}" fill="${fill}" stroke="${stroke}" stroke-width="1.4" />`;
    }).join("");
    const crown = upper ? `<rect x="2" y="3" width="${width}" height="21" rx="${shape === "incisor" ? 3 : 5}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />` : `<rect x="2" y="15" width="${width}" height="21" rx="${shape === "incisor" ? 3 : 5}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />`;
    const labelY = upper ? 16 : 29;
    const marker = treatment ? `<circle cx="${width + 2}" cy="${upper ? 5 : 40}" r="4" fill="${stroke}" />` : "";
    return `<button type="button" class="tooth-button ${tooth === selectedTooth ? "selected" : ""}" data-tooth="${tooth}" title="Pieza ${tooth}"><svg width="${width + 8}" height="54" viewBox="0 0 ${width + 8} 54" aria-hidden="true">${upper ? crown + roots : roots + crown}<text x="${(width + 4) / 2}" y="${labelY}" text-anchor="middle" font-size="7" font-family="monospace" font-weight="700" fill="${stroke}">${tooth}</text>${marker}</svg></button>`;
  };
  const upperRight = teeth.slice(0, 8).map((tooth) => toothMarkup(tooth, true)).join("");
  const upperLeft = teeth.slice(8, 16).map((tooth) => toothMarkup(tooth, true)).join("");
  const lowerRight = teeth.slice(16, 24).map((tooth) => toothMarkup(tooth, false)).join("");
  const lowerLeft = teeth.slice(24).map((tooth) => toothMarkup(tooth, false)).join("");
  return `<div class="odontogram-shell"><div class="odontogram-legend"><span><i class="legend-tooth"></i>Sin tratamiento</span><span><i class="legend-tooth planned"></i>Planificado</span><span><i class="legend-tooth in-progress"></i>En curso</span><span><i class="legend-tooth completed"></i>Completado</span></div><div class="jaw-labels"><span>Der.</span><strong>Superior</strong><span>Izq.</span></div><div class="tooth-row upper"><div>${upperRight}</div><em></em><div>${upperLeft}</div></div><div class="midline"><span>LINEA MEDIA</span></div><div class="tooth-row lower"><div>${lowerRight}</div><em></em><div>${lowerLeft}</div></div><div class="jaw-labels"><span>Der.</span><strong>Inferior</strong><span>Izq.</span></div></div>`;
}
function renderDataList(patient) {
  return `
    <dl class="data-list">
      <div><dt>Nombre</dt><dd>${DentalAPI.escapeHtml(DentalAPI.fullName(patient))}</dd></div>
      <div><dt>Nacimiento</dt><dd>${DentalAPI.date(patient.birth_date)}</dd></div>
      <div><dt>Correo</dt><dd>${DentalAPI.escapeHtml(patient.email || "Sin correo")}</dd></div>
      <div><dt>Direccion</dt><dd>${DentalAPI.escapeHtml(patient.address || "Sin direccion")}</dd></div>
      <div><dt>Contacto emergencia</dt><dd>${DentalAPI.escapeHtml(patient.emergency_contact_name || "Sin contacto registrado")}</dd></div>
      <div><dt>Telefono emergencia</dt><dd>${DentalAPI.escapeHtml(patient.emergency_contact_phone || "Sin telefono registrado")}</dd></div>
    </dl>
  `;
}

function renderSessions(sessions) {
  if (!sessions.length) return `<p class="empty-state">No hay evoluciones clinicas registradas.</p>`;

  const groups = sessions.reduce((accumulator, session) => {
    const key = dateKey(session.session_date);
    if (!accumulator.has(key)) accumulator.set(key, []);
    accumulator.get(key).push(session);
    return accumulator;
  }, new Map());

  return Array.from(groups.entries())
    .map(([key, groupedSessions]) => {
      return `
        <section class="session-day">
          <h3>${DentalAPI.date(key, { weekday: "long", day: "2-digit", month: "short" })}</h3>
          ${groupedSessions
            .map((session) => {
              const treatment = sessionTreatment(session);
              return `
                <article data-session-row="${session.id}">
                  <header>
                    <div>
                      <time>${DentalAPI.time(session.session_date)}</time>
                      <strong>${DentalAPI.escapeHtml(session.reason || session.procedure_done || "Atencion clinica")}</strong>
                      <span>${DentalAPI.escapeHtml(treatment ? treatment.title : "Sin tratamiento asociado")}</span>
                    </div>
                    <div class="inline-actions">
                      <button class="text-button" type="button" data-action="attachment" data-entity-id="${session.id}">Adjuntar RX</button>
                      <button class="text-button" type="button" data-action="continue-session" data-entity-id="${session.id}">Continuar</button>
                      <button class="text-button" type="button" data-action="edit-session" data-entity-id="${session.id}">Editar</button>
                    </div>
                  </header>
                  <p>${DentalAPI.escapeHtml(session.notes || session.diagnosis || "Sin observaciones registradas.")}</p>
                  ${session.procedure_done ? `<small>Procedimiento: ${DentalAPI.escapeHtml(session.procedure_done)}</small>` : ""}
                  ${session.next_steps ? `<small>Proximos pasos: ${DentalAPI.escapeHtml(session.next_steps)}</small>` : ""}
                </article>
              `;
            })
            .join("")}
        </section>
      `;
    })
    .join("");
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
  return [...summary.treatments].sort((a, b) => String(b.created_at || b.start_date || "").localeCompare(String(a.created_at || a.start_date || "")) || b.id - a.id).map((treatment) => {
    const visits = summary.appointments.filter(item => Number(item.patient_treatment_id) === treatment.id).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
    const sessions = summary.sessions.filter(item => Number(item.patient_treatment_id) === treatment.id);
    const attended = visits.filter(item => item.status === "attended").length;
    const pending = visits.find(item => item.status === "scheduled") || pendingToothAppointment(treatment.tooth_code);
    return `<article class="history-card" data-treatment-history="${treatment.id}" data-history-state="${treatment.status}" data-history-search="${DentalAPI.escapeHtml(`${treatment.title} ${treatment.tooth_code || ""}`.toLowerCase())}">
      <header><div><span class="eyebrow">${treatment.tooth_code ? `Pieza ${DentalAPI.escapeHtml(treatment.tooth_code)}` : "Tratamiento general"}</span><h3>${DentalAPI.escapeHtml(treatment.title)}</h3></div><span class="pill">${DentalAPI.escapeHtml(DentalAPI.statusLabel(treatment.status))}</span></header>
      <p class="history-meta">${visits.length} citas registradas · ${attended} atendidas <span>Pago: ${treatmentPaymentLabel(summary, treatment)}</span></p>
      ${pending ? `<p class="history-next">Cita pendiente: ${DentalAPI.date(pending.starts_at)} · ${DentalAPI.time(pending.starts_at)}</p>` : ""}
      <div class="inline-actions">${pending ? `<button class="text-button" data-action="reschedule" data-entity-id="${pending.id}">Cambiar fecha</button>` : treatment.status !== "completed" ? `<button class="text-button primary-action" data-action="appointment" data-entity-id="${treatment.id}" data-tooth-code="${DentalAPI.escapeHtml(treatment.tooth_code || "")}">${treatment.status === "cancelled" ? "Reagendar tratamiento" : "Agendar continuacion"}</button>` : ""}
      ${!pending && !["completed", "cancelled"].includes(treatment.status) ? `<button class="text-button" data-finish-history="${treatment.id}">Finalizar tratamiento</button>` : ""}</div>
      <details><summary>Ver historial y notas</summary>
        <p>${DentalAPI.escapeHtml(treatment.plan_notes || treatment.diagnosis || "Sin notas del tratamiento.")}</p>
        <ol class="visit-history">${visits.map(visit => `<li><div><time>${DentalAPI.date(visit.starts_at)} · ${DentalAPI.time(visit.starts_at)}</time><span class="pill">${DentalAPI.escapeHtml(DentalAPI.statusLabel(visit.status))}</span></div>${visit.notes ? `<p>${DentalAPI.escapeHtml(visit.notes)}</p>` : ""}</li>`).join("") || "<li>Sin citas vinculadas.</li>"}</ol>
        ${sessions.length ? `<h4>Notas clinicas</h4>${renderSessions(sessions)}` : ""}
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
  return upcomingAppointments(summary)[0] || summary.appointments.find((item) => item.status === "scheduled") || null;
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
  const canAttend = appointment.status !== "attended" && appointment.status !== "cancelled";

  return `
    <section class="appointment-flow-card" aria-label="Atencion desde agenda">
      <div>
        <span class="eyebrow">Atencion desde agenda</span>
        <strong>${DentalAPI.time(appointment.starts_at)} · ${DentalAPI.escapeHtml(appointment.reason || "Atencion dental")}</strong>
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
    <p class="form-helper">Marca la cita como atendida para registrar la visita. Finaliza el tratamiento cuando ya no necesite mas sesiones.</p>
    <div class="patient-visit-list">${pending.map(appointment => {
      const treatment = summary.treatments.find(item => item.id === Number(appointment.patient_treatment_id));
      const overdue = new Date(appointment.starts_at.replace(" ", "T")) < new Date();
      return `<article class="patient-visit" data-patient-appointment="${appointment.id}">
        <div class="visit-date"><strong>${DentalAPI.date(appointment.starts_at, { day: "2-digit", month: "short" })}</strong><span>${DentalAPI.time(appointment.starts_at)}</span>${overdue ? '<small>Por registrar</small>' : ""}</div>
        <div class="visit-description"><span class="eyebrow">${treatment?.tooth_code ? `Pieza ${DentalAPI.escapeHtml(treatment.tooth_code)}` : "Control general"}</span><h3>${DentalAPI.escapeHtml(treatment?.title || appointment.reason || "Control clinico")}</h3>${appointment.notes ? `<p>${DentalAPI.escapeHtml(appointment.notes)}</p>` : ""}
        <div class="inline-actions"><button class="text-button primary-action" data-update-patient-appointment="${appointment.id}" data-status="attended">Marcar atendida</button><button class="text-button" data-action="reschedule" data-entity-id="${appointment.id}">Cambiar fecha</button><button class="text-button danger-action" data-update-patient-appointment="${appointment.id}" data-status="cancelled">Cancelar cita</button><button class="text-button" data-update-patient-appointment="${appointment.id}" data-status="missed">No asistio</button></div>
        <p class="form-status" data-patient-appointment-message="${appointment.id}" role="status"></p></div>
      </article>`;
    }).join("") || '<p class="empty-state">No hay citas pendientes. Agenda un nuevo tratamiento o continua uno desde el historial.</p>'}</div></section>`;
}

function renderActionForm(action, entityId = null) {
  const patient = currentSummary.patient;
  const treatment = activeTreatment(currentSummary);
  const toothTreatment = selectedToothForAppointment ? currentSummary.treatments.find((item) => String(item.tooth_code) === String(selectedToothForAppointment) && item.status !== "completed") : null;
  const appointment = action === "reschedule" ? currentSummary.appointments.find(item => item.id === Number(entityId)) : selectedAppointment();
  const session = currentSummary.sessions.find((item) => item.id === Number(entityId));
  const attachmentSessionTarget = action === "attachment" ? session : null;
  const continuingSession = action === "continue-session" ? session : null;
  const paymentTreatment = action === "payment" && entityId ? currentSummary.treatments.find((item) => item.id === Number(entityId)) : treatment;
  const suggestedPayment = paymentTreatment ? treatmentBalance(currentSummary, paymentTreatment) : balance(currentSummary);
  const drawer = document.querySelector("#actionDrawer");
  const titleByAction = {
    edit: "Editar datos del paciente",
    session: "Nueva evolucion clinica",
    "edit-session": "Editar evolucion clinica",
    "continue-session": "Continuar evolucion anterior",
    "appointment-session": "Registrar atencion de la cita",
    appointment: "Agendar cita",
    reschedule: "Cambiar fecha de la cita",
    treatment: "Nuevo tratamiento",
    attachment: "Adjuntar radiografia o documento",
    payment: "Registrar pago"
  };

  const forms = {
    reschedule: `<form class="compact-form action-form" data-form="reschedule" data-entity-id="${appointment?.id || ""}">
      <p>${DentalAPI.escapeHtml(appointment?.reason || "Cita del paciente")}</p><p class="form-helper">Se cambia la fecha de esta misma cita. El tratamiento, su precio y sus pagos se conservan.</p>
      <label>Nueva fecha y hora<input name="starts_at" type="datetime-local" value="${dateTimeForInput(appointment?.starts_at)}" required /></label>
      <button class="text-button primary-action" type="submit">Guardar nueva fecha</button><p class="form-status" role="status"></p></form>`,
    edit: `
      <form class="compact-form action-form" data-form="edit">
        <label>Nombres<input name="first_name" value="${DentalAPI.escapeHtml(patient.first_name || "")}" required /></label>
        <label>Apellidos<input name="last_name" value="${DentalAPI.escapeHtml(patient.last_name || "")}" required /></label>
        <label>RUT<input name="rut" value="${DentalAPI.escapeHtml(patient.rut || "")}" /></label>
        <label>Fecha nacimiento<input name="birth_date" type="date" value="${DentalAPI.escapeHtml(patient.birth_date || "")}" /></label>
        <label>Telefono<input name="phone" value="${DentalAPI.escapeHtml(patient.phone || "")}" /></label>
        <label>Correo<input name="email" type="email" value="${DentalAPI.escapeHtml(patient.email || "")}" /></label>
        <label>Direccion<input name="address" value="${DentalAPI.escapeHtml(patient.address || "")}" /></label>
        <label>Alergias<textarea name="allergies">${DentalAPI.escapeHtml(patient.allergies || "")}</textarea></label>
        <label>Antecedentes<textarea name="medical_notes">${DentalAPI.escapeHtml(patient.medical_notes || "")}</textarea></label>
        <label>Alerta visible<textarea name="active_alert">${DentalAPI.escapeHtml(patient.active_alert || "")}</textarea></label>
        <button class="text-button primary-action" type="submit">Guardar cambios</button>
        <p class="form-status" aria-live="polite"></p>
      </form>
    `,
    "edit-session": `
      <form class="compact-form action-form" data-form="edit-session" data-entity-id="${session?.id || ""}">
        <label>Fecha y hora<input name="session_date" type="datetime-local" value="${dateTimeForInput(session?.session_date)}" required /></label>
        <label>Tratamiento<select name="patient_treatment_id"><option value="">Sin tratamiento asociado</option>${renderTreatmentOptions(session?.patient_treatment_id)}</select></label>
        <label>Motivo<input name="reason" value="${DentalAPI.escapeHtml(session?.reason || "")}" required /></label>
        <label>Diagnostico<textarea name="diagnosis">${DentalAPI.escapeHtml(session?.diagnosis || "")}</textarea></label>
        <label>Procedimiento realizado<textarea name="procedure_done">${DentalAPI.escapeHtml(session?.procedure_done || "")}</textarea></label>
        <label>Evolucion / observaciones<textarea name="notes">${DentalAPI.escapeHtml(session?.notes || "")}</textarea></label>
        <label>Proximos pasos<textarea name="next_steps">${DentalAPI.escapeHtml(session?.next_steps || "")}</textarea></label>
        <button class="text-button primary-action" type="submit">Guardar evolucion</button>
        <p class="form-status" aria-live="polite"></p>
      </form>
    `,
    "continue-session": `
      <form class="compact-form action-form" data-form="continue-session" data-entity-id="${continuingSession?.id || ""}">
        <label>Fecha y hora<input name="session_date" type="datetime-local" value="${todayForInput()}" required /></label>
        <label>Tratamiento<select name="patient_treatment_id"><option value="">Sin tratamiento asociado</option>${renderTreatmentOptions(continuingSession?.patient_treatment_id || treatment?.id)}</select></label>
        <label>Motivo<input name="reason" value="${DentalAPI.escapeHtml(continuingSession?.reason || "Control de evolucion")}" required /></label>
        <label>Diagnostico<textarea name="diagnosis">${DentalAPI.escapeHtml(continuingSession?.diagnosis || "")}</textarea></label>
        <label>Procedimiento realizado<textarea name="procedure_done" placeholder="Procedimiento realizado hoy"></textarea></label>
        <label>Evolucion / observaciones<textarea name="notes">${DentalAPI.escapeHtml(continuingSession?.next_steps ? `Seguimiento de: ${continuingSession.next_steps}` : "")}</textarea></label>
        <label>Proximos pasos<textarea name="next_steps" placeholder="Indicaciones o acciones futuras"></textarea></label>
        <button class="text-button primary-action" type="submit">Guardar nueva evolucion</button>
        <p class="form-status" aria-live="polite"></p>
      </form>
    `,
    session: `
      <form class="compact-form action-form" data-form="session">
        <label>Fecha y hora<input name="session_date" type="datetime-local" value="${todayForInput()}" required /></label>
        <label>Tratamiento<select name="patient_treatment_id"><option value="">Sin tratamiento asociado</option>${renderTreatmentOptions(treatment?.id)}</select></label>
        <label>Motivo<input name="reason" placeholder="Ej. Control, diagnostico, urgencia" required /></label>
        <label>Diagnostico<textarea name="diagnosis" placeholder="Diagnostico observado"></textarea></label>
        <label>Procedimiento realizado<textarea name="procedure_done" placeholder="Procedimiento realizado"></textarea></label>
        <label>Evolucion / observaciones<textarea name="notes" placeholder="Notas clinicas de la atencion"></textarea></label>
        <label>Proximos pasos<textarea name="next_steps" placeholder="Indicaciones o acciones futuras"></textarea></label>
        <button class="text-button primary-action" type="submit">Guardar evolucion</button>
        <p class="form-status" aria-live="polite"></p>
      </form>
    `,
    "appointment-session": `
      <form class="compact-form action-form" data-form="appointment-session">
        <label>Fecha y hora<input name="session_date" type="datetime-local" value="${dateTimeForInput(appointment?.starts_at)}" required /></label>
        <label>Tratamiento<select name="patient_treatment_id"><option value="">Sin tratamiento asociado</option>${renderTreatmentOptions(appointment?.patient_treatment_id || treatment?.id)}</select></label>
        <label>Motivo<input name="reason" value="${DentalAPI.escapeHtml(appointment?.reason || "Atencion dental")}" required /></label>
        <label>Diagnostico<textarea name="diagnosis" placeholder="Diagnostico observado"></textarea></label>
        <label>Procedimiento realizado<textarea name="procedure_done" placeholder="Procedimiento realizado durante la cita"></textarea></label>
        <label>Evolucion / observaciones<textarea name="notes" placeholder="Notas clinicas de la atencion"></textarea></label>
        <label>Proximos pasos<textarea name="next_steps" placeholder="Indicaciones, control o tratamiento a seguir"></textarea></label>
        <button class="text-button primary-action" type="submit">Guardar evolucion y cerrar cita</button>
        <p class="form-status" aria-live="polite"></p>
      </form>
    `,
    appointment: `
      <form class="compact-form action-form appointment-form" data-form="appointment" enctype="multipart/form-data">
        <div class="appointment-form-patient">${DentalAPI.escapeHtml(DentalAPI.fullName(patient))}</div>
        <label class="appointment-wide">1. Pieza dental<select name="tooth_code" data-booking-tooth><option value="">Control general / sin pieza</option>${[1,2,3,4].flatMap(q => Array.from({length:8}, (_, i) => `${q}${i+1}`)).map(code => `<option value="${code}" ${String(selectedToothForAppointment) === code ? "selected" : ""}>Pieza ${code} - ${toothDescription(code)}</option>`).join("")}</select></label>
        <p class="appointment-tooth-description">${DentalAPI.escapeHtml(selectedToothForAppointment ? toothDescription(selectedToothForAppointment) : "Selecciona la pieza aqui o desde el odontograma.")}</p>
        <label class="appointment-wide">2. Tratamiento del paciente<select name="patient_treatment_id" data-existing-treatment><option value="">Nuevo tratamiento / control general</option>${currentSummary.treatments.filter((item) => item.status !== "completed" && (!selectedToothForAppointment || String(item.tooth_code) === String(selectedToothForAppointment))).map((item) => `<option value="${item.id}" ${Number(entityId) === item.id || (!entityId && item.id === toothTreatment?.id) ? "selected" : ""}>${DentalAPI.escapeHtml(item.title)}${item.tooth_code ? ` - Pieza ${DentalAPI.escapeHtml(item.tooth_code)}` : ""} (sin nuevo cobro)</option>`).join("")}</select></label>
        <p class="appointment-wide form-status" data-duplicate-message role="status" hidden></p>
        <p class="appointment-wide" data-continuation-message hidden>Esta cita conserva el presupuesto y los pagos del tratamiento. No genera un nuevo cobro.</p>
        <label class="appointment-wide">Tratamiento<select name="catalog_treatment_id" data-appointment-catalog ${selectedToothForAppointment ? "required" : ""}><option value="">Seleccionar tratamiento...</option>${appointmentCatalogOptions()}</select></label>
        <label>Costo<input name="cost" type="number" min="0" step="1" placeholder="$" data-appointment-cost /></label>
        <label>Descuento<input name="discount" type="number" min="0" step="1" value="0" placeholder="$" data-appointment-discount /></label>
        <div class="appointment-total"><span>Total con descuento</span><strong data-appointment-total>$0</strong></div>
        <h3 class="appointment-wide">3. Fecha de la cita</h3>
        <label>Fecha<input name="appointment_date" type="date" value="${nextControlInput().slice(0, 10)}" required /></label>
        <label>Hora<input name="appointment_time" type="time" value="${nextControlInput().slice(11, 16)}" required /></label>
        <details class="appointment-wide booking-extras"><summary>Notas y radiografia (opcional)</summary>
        <label class="appointment-wide">Notas (opcional)<textarea name="notes" placeholder="Indicaciones para la cita o tratamiento"></textarea></label>
        <label class="appointment-wide upload-field">Adjuntar radiografia<input name="file" type="file" accept="image/*,.pdf" /><span>Subir imagen o PDF</span></label></details>
        <div class="appointment-form-actions"><button class="text-button" type="button" data-action-close>Cancelar</button><button class="text-button primary-action" type="submit">Agendar cita</button></div>
        <p class="form-status" aria-live="polite"></p>
      </form>
    `,
    treatment: `
      <form class="compact-form action-form" data-form="treatment">
        <label>Catalogo<select name="catalog_treatment_id"><option value="">Personalizado</option>${currentCatalog.map((item) => `<option value="${item.id}">${DentalAPI.escapeHtml(item.name)} - ${DentalAPI.money(item.default_price)}</option>`).join("")}</select></label>
        <label>Nombre tratamiento<input name="title" placeholder="Ej. Implante molar inferior" required /></label>
        <label>Pieza dental<input name="tooth_code" placeholder="Ej. 36, 11, arcada superior" /></label>
        <label>Diagnostico<textarea name="diagnosis" placeholder="Diagnostico asociado"></textarea></label>
        <label>Plan clinico<textarea name="plan_notes" placeholder="Pasos del tratamiento"></textarea></label>
        <label>Presupuesto<input name="estimated_price" type="number" min="0" placeholder="0" /></label>
        <label>Estado<select name="status"><option value="planned">Planificado</option><option value="in_progress">En curso</option><option value="completed">Completado</option><option value="cancelled">Cancelado</option></select></label>
        <button class="text-button primary-action" type="submit">Crear tratamiento</button>
        <p class="form-status" aria-live="polite"></p>
      </form>
    `,
    attachment: `
      <form class="compact-form action-form" data-form="attachment" enctype="multipart/form-data">
        <label>Evolucion<select name="clinical_session_id"><option value="">Sin evolucion asociada</option>${renderSessionOptions(attachmentSessionTarget?.id)}</select></label>
        <label>Tratamiento<select name="patient_treatment_id"><option value="">Sin tratamiento asociado</option>${renderTreatmentOptions(attachmentSessionTarget?.patient_treatment_id || treatment?.id)}</select></label>
        <label>Tipo<select name="file_type"><option value="radiography">Radiografia</option><option value="photo">Foto clinica</option><option value="document">Documento</option><option value="other">Otro</option></select></label>
        <label>Categoria<input name="category" value="Panoramica" /></label>
        <label>Fecha toma<input name="taken_at" type="date" /></label>
        <label>Archivo<input name="file" type="file" required /></label>
        <label>Observacion<textarea name="notes" placeholder="Observacion clinica del adjunto"></textarea></label>
        <button class="text-button primary-action" type="submit">Guardar adjunto</button>
        <p class="form-status" aria-live="polite"></p>
      </form>
    `,
    payment: `
      <form class="compact-form action-form" data-form="payment">
        <label>Tratamiento<select name="patient_treatment_id"><option value="">Sin tratamiento asociado</option>${renderTreatmentOptions(paymentTreatment?.id)}</select></label>
        <label>Fecha pago<input name="payment_date" type="date" value="${new Date().toISOString().slice(0, 10)}" required /></label>
        <label>Monto<input name="amount" type="number" min="1" value="${suggestedPayment || ""}" placeholder="0" required /></label>
        <label>Metodo<select name="method"><option>Transferencia</option><option>Tarjeta</option><option>Efectivo</option><option>Otro</option></select></label>
        <label>Notas<textarea name="notes" placeholder="Detalle del pago o abono"></textarea></label>
        <button class="text-button primary-action" type="submit">Guardar pago</button>
        <p class="form-status" aria-live="polite"></p>
      </form>
    `
  };

  drawer.hidden = false;
  drawer.innerHTML = `
    <div class="section-heading">
      <div><span class="eyebrow">Accion</span><h2>${titleByAction[action]}</h2></div>
      <button class="${action === "appointment" ? "icon-button appointment-close" : "text-button"}" type="button" data-action-close aria-label="Cerrar">${action === "appointment" ? "×" : "Cerrar"}</button>
    </div>
    ${forms[action]}
  `;
  drawer.scrollIntoView({ behavior: "smooth", block: "start" });
  bindActionForm();
  drawer.querySelector("input, select, textarea")?.focus({ preventScroll: true });
}

function renderPatient(summary) {
  currentSummary = summary;
  const patient = summary.patient;
  const documentsLink = document.querySelector("#patientDocumentsLink");
  if (documentsLink) documentsLink.href = `./documentos.html?id=${patient.id}`;
  const treatment = summary.treatments.find(item => ["planned", "in_progress"].includes(item.status));
  const lastAttended = summary.appointments.filter(item => item.status === "attended").sort((a,b) => b.starts_at.localeCompare(a.starts_at))[0];
  const lastAttention = [summary.sessions[0]?.session_date, lastAttended?.starts_at].filter(Boolean).sort().at(-1);
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
      <article class="metric-card compact"><span>Tratamiento activo</span><strong>${DentalAPI.escapeHtml(treatment?.title || "Sin tratamiento activo")}</strong><small>${DentalAPI.escapeHtml(treatment?.tooth_code ? `Pieza ${treatment.tooth_code}` : "Ficha general")}</small></article>
      <article class="metric-card compact"><span>Ultima atencion</span><strong>${DentalAPI.date(lastAttention, { day: "2-digit", month: "short" })}</strong><small>${DentalAPI.escapeHtml(lastAttention ? "Atencion registrada" : "Sin atenciones")}</small></article>
      <article class="metric-card compact"><span>Saldo pendiente</span><strong>${DentalAPI.money(balance(summary))}</strong><small>Total plan ${DentalAPI.money(totalTreatments(summary))}</small></article>
      <article class="metric-card compact"><span>Proxima cita</span><strong>${appointment ? DentalAPI.time(appointment.starts_at) : "Sin cita"}</strong><small>${DentalAPI.escapeHtml(appointment?.reason || "No programada")}</small></article>
    </section>

    <section class="patient-tabs" aria-label="Secciones de ficha">
      <button class="active" type="button" data-tab="clinical">Agenda y piezas</button>
      <button type="button" data-tab="history">Historial</button>
      <button type="button" data-tab="treatments">Plan y presupuesto</button>
      <button type="button" data-tab="attachments">Radiografias</button>
      <button type="button" data-tab="payments">Pagos</button>
    </section>

    <section class="detail-card action-drawer" id="actionDrawer" hidden></section>

    <section class="patient-detail-grid tab-panel active" id="clinical" aria-label="Agenda y piezas">
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

    <section class="patient-detail-grid tab-panel" id="history" aria-label="Historial del paciente">
      <section class="detail-card wide-card"><div class="section-heading"><div><span class="eyebrow">Por pieza y tratamiento</span><h2>Historial del paciente</h2></div><button class="text-button" data-action="session">Agregar nota clinica</button></div>
        <div class="history-filters"><label>Buscar tratamiento o pieza<input type="search" id="historySearch" value="${DentalAPI.escapeHtml(historySearch)}" placeholder="Ej. Endodoncia o 36" /></label><label>Estado<select id="historyFilter"><option value="all">Todos</option><option value="active">En curso y planificados</option><option value="completed">Finalizados</option><option value="cancelled">Cancelados</option></select></label></div>
        <div class="history-list">${renderTreatmentHistory(summary)}</div><p id="historyEmpty" class="empty-state" hidden>No hay tratamientos con estos filtros.</p>
        <details class="unlinked-history"><summary>Otros registros y notas generales</summary>${summary.appointments.filter(item => !item.patient_treatment_id).map(item => `<p>${DentalAPI.date(item.starts_at)} · ${DentalAPI.escapeHtml(item.reason || "Control general")} · ${DentalAPI.escapeHtml(DentalAPI.statusLabel(item.status))}</p>`).join("")}${renderSessions(summary.sessions.filter(item => !item.patient_treatment_id))}</details>
      </section>
    </section>
    <section class="patient-detail-grid tab-panel" id="treatments" aria-labelledby="treatmentsHeading">
      <section class="detail-card wide-card">
        <div class="section-heading"><div><span class="eyebrow">Plan</span><h2 id="treatmentsHeading">Tratamientos</h2></div><button class="text-button" type="button" data-action="treatment">Nuevo tratamiento</button></div>
        <div class="treatment-plan">${renderTreatments(summary.treatments)}</div>
      </section>
      <aside class="detail-card"><div class="section-heading"><div><span class="eyebrow">Presupuesto</span><h2>Resumen financiero</h2></div></div><div class="money-list"><div><span>Total plan</span><strong>${DentalAPI.money(totalTreatments(summary))}</strong></div><div><span>Pagado</span><strong>${DentalAPI.money(totalPayments(summary))}</strong></div><div><span>Pendiente</span><strong>${DentalAPI.money(balance(summary))}</strong></div></div></aside>
    </section>

    <section class="patient-detail-grid tab-panel" id="attachments" aria-labelledby="attachmentsHeading">
      <section class="detail-card wide-card">
        <div class="section-heading"><div><span class="eyebrow">Radiografias</span><h2 id="attachmentsHeading">Imagenes y documentos</h2></div><button class="text-button" type="button" data-action="attachment">Adjuntar archivo</button></div>
        ${renderAttachments(summary.attachments)}
      </section>
      <aside class="detail-card"><div class="section-heading"><div><span class="eyebrow">Adjuntos</span><h2>Listado</h2></div></div><div class="attachment-table compact-table" role="table" aria-label="Adjuntos del paciente">${renderAttachmentRows(summary.attachments)}</div></aside>
    </section>

    <section class="patient-detail-grid tab-panel" id="payments" aria-labelledby="paymentsHeading">
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
  const tabButtons = document.querySelectorAll("[data-tab]");
  const tabPanels = document.querySelectorAll(".tab-panel");

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.tab;
      patientActiveTab = target;
      tabButtons.forEach((item) => item.classList.toggle("active", item === button));
      tabPanels.forEach((panel) => panel.classList.toggle("active", panel.id === target));
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
              end_date: new Date().toISOString().slice(0, 10)
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
      if (action === "appointment" && button.dataset.toothCode) selectedToothForAppointment = button.dataset.toothCode;
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
            status: "attended",
            notes: "Atendida"
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
          end_date: new Date().toISOString().slice(0, 10)
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

function maybeStartTreatment(treatmentId) {
  const linkedTreatment = currentSummary.treatments.find((item) => item.id === Number(treatmentId));
  if (linkedTreatment?.status === "planned") {
    return DentalAPI.put(`/api/patient-treatments/${linkedTreatment.id}`, { status: "in_progress" });
  }
  return Promise.resolve();
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
      await DentalAPI.post("/api/clinical-sessions", payload);
      if (payload.patient_treatment_id) await maybeStartTreatment(payload.patient_treatment_id);
      if (appointment && appointment.status !== "attended" && appointment.status !== "cancelled") {
        await DentalAPI.put(`/api/appointments/${appointment.id}`, {
          status: "attended",
          notes: "Atendida con evolucion clinica"
        });
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

function bindPatientAppointmentActions() {
  document.querySelectorAll("[data-update-patient-appointment]").forEach((button) => {
    button.addEventListener("click", async () => {
      const appointmentId = Number(button.dataset.updatePatientAppointment);
      const status = button.dataset.status;
      const message = document.querySelector(`[data-patient-appointment-message="${appointmentId}"]`);
      const label = DentalAPI.statusLabel(status);

      if (status === "cancelled" && !window.confirm("Cancelar esta cita? El tratamiento vinculado quedara cancelado si no tiene otras citas pendientes. Sus pagos e historial se conservaran.")) return;

      button.disabled = true;
      message.textContent = "Guardando...";

      try {
        await DentalAPI.put(`/api/appointments/${appointmentId}`, {
          status
        });
        message.textContent = `Cita marcada como ${label}.`;
        await loadPatient();
      } catch (error) {
        message.textContent = error.message;
        button.disabled = false;
      }
    });
  });
}

function cleanFormData(form) {
  const raw = Object.fromEntries(new FormData(form).entries());
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, value === "" ? null : value]));
}

function bindAppointmentPriceForm(form) {
  const catalog = form.querySelector("[data-appointment-catalog]");
  const cost = form.querySelector("[data-appointment-cost]");
  const discount = form.querySelector("[data-appointment-discount]");
  const total = form.querySelector("[data-appointment-total]");
  const existing = form.querySelector("[data-existing-treatment]");
  const tooth = form.querySelector("[data-booking-tooth]");
  const sync = () => {
    const continuing = Boolean(existing.value);
    [catalog, cost, discount].forEach((input) => { input.disabled = continuing; input.closest("label").hidden = continuing; });
    catalog.required = !continuing && Boolean(selectedToothForAppointment);
    total.closest(".appointment-total").hidden = continuing;
    form.querySelector("[data-continuation-message]").hidden = !continuing;
    const treatment = currentSummary.treatments.find((item) => item.id === Number(existing.value));
    form.elements.tooth_code.value = treatment?.tooth_code || selectedToothForAppointment || "";
    form.querySelector(".appointment-tooth-description").textContent = tooth.value ? toothDescription(tooth.value) : "Control general sin pieza dental.";
    const pending = pendingToothAppointment(form.elements.tooth_code.value);
    const warning = form.querySelector("[data-duplicate-message]");
    warning.hidden = !pending;
    warning.textContent = pending ? `Esta pieza ya tiene una cita pendiente para ${DentalAPI.date(pending.starts_at)} ${DentalAPI.time(pending.starts_at)}. Atiende, cancela o modifica esa cita antes de agendar otra.` : "";
    form.querySelector("button[type='submit']").disabled = Boolean(pending);
  };
  tooth.addEventListener("change", () => {
    selectedToothForAppointment = tooth.value || null;
    const available = currentSummary.treatments.filter(item => item.status !== "completed" && (!tooth.value || String(item.tooth_code) === tooth.value));
    existing.innerHTML = `<option value="">Nuevo tratamiento / control general</option>` + available.map(item => `<option value="${item.id}">${DentalAPI.escapeHtml(item.title)}${item.tooth_code ? ` - Pieza ${DentalAPI.escapeHtml(item.tooth_code)}` : ""} (sin nuevo cobro)</option>`).join("");
    if (tooth.value && available.length) existing.value = available[0].id;
    sync();
  });
  existing.addEventListener("change", sync);
  sync();
  const update = () => {
    const price = Math.max(Number(cost.value || 0), 0);
    const reduction = Math.min(Math.max(Number(discount.value || 0), 0), price);
    if (Number(discount.value || 0) !== reduction) discount.value = reduction || "";
    total.textContent = DentalAPI.money(price - reduction);
  };
  catalog.addEventListener("change", () => {
    const item = currentCatalog.find((entry) => Number(entry.id) === Number(catalog.value));
    if (item) cost.value = Number(item.default_price || 0);
    update();
  });
  cost.addEventListener("input", update);
  discount.addEventListener("input", update);
  update();
}
async function bindActionForm() {
  const drawer = document.querySelector("#actionDrawer");
  const closeButtons = drawer.querySelectorAll("[data-action-close]");
  const form = drawer.querySelector("[data-form]");
  const status = drawer.querySelector(".form-status");

  closeButtons.forEach((closeButton) => closeButton.addEventListener("click", () => {
    drawer.hidden = true;
    drawer.innerHTML = "";
  }));

  if (form.dataset.form === "appointment") bindAppointmentPriceForm(form);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const action = form.dataset.form;
    const patientId = currentSummary.patient.id;
    const submitButton = form.querySelector("button[type='submit']");

    status.textContent = "Guardando...";
    submitButton.disabled = true;

    try {
      if (action === "reschedule") {
        const original = currentSummary.appointments.find(item => item.id === Number(form.dataset.entityId));
        if (!original || original.status !== "scheduled") throw new Error("Esta cita ya no esta pendiente. Recarga la ficha.");
        const startsAt = form.elements.starts_at.value;
        const payload = { starts_at: startsAt.replace("T", " ") };
        if (original.ends_at) {
          const duration = new Date(original.ends_at.replace(" ", "T")) - new Date(original.starts_at.replace(" ", "T"));
          const end = new Date(new Date(startsAt).getTime() + duration);
          payload.ends_at = `${localDateString(end)} ${String(end.getHours()).padStart(2,"0")}:${String(end.getMinutes()).padStart(2,"0")}`;
        }
        await DentalAPI.put(`/api/appointments/${original.id}`, payload);
      }
      if (action === "edit") {
        await DentalAPI.put(`/api/patients/${patientId}`, cleanFormData(form));
      }

      if (action === "session") {
        const payload = sessionPayloadFromForm(form, patientId);
        await DentalAPI.post("/api/clinical-sessions", payload);
        if (payload.patient_treatment_id) await maybeStartTreatment(payload.patient_treatment_id);
      }

      if (action === "continue-session") {
        const payload = sessionPayloadFromForm(form, patientId);
        await DentalAPI.post("/api/clinical-sessions", payload);
        if (payload.patient_treatment_id) await maybeStartTreatment(payload.patient_treatment_id);
      }

      if (action === "edit-session") {
        const payload = sessionPayloadFromForm(form, patientId);
        delete payload.patient_id;
        await DentalAPI.put(`/api/clinical-sessions/${form.dataset.entityId}`, {
          ...payload
        });
        if (payload.patient_treatment_id) await maybeStartTreatment(payload.patient_treatment_id);
      }

      if (action === "appointment-session") {
        const appointment = selectedAppointment();
        const payload = sessionPayloadFromForm(form, patientId);
        await DentalAPI.post("/api/clinical-sessions", payload);
        if (appointment) {
          await DentalAPI.put(`/api/appointments/${appointment.id}`, {
            status: "attended",
            notes: "Atendida con evolucion clinica"
          });
        }
        if (payload.patient_treatment_id) await maybeStartTreatment(payload.patient_treatment_id);
      }

      if (action === "appointment") {
        const data = cleanFormData(form);
        const catalogTreatment = currentCatalog.find((item) => Number(item.id) === Number(data.catalog_treatment_id));
        const cost = Math.max(Number(data.cost || 0), 0);
        const discount = Math.min(Math.max(Number(data.discount || 0), 0), cost);
        let patientTreatment = currentSummary.treatments.find((item) => item.id === Number(data.patient_treatment_id));
        const newTreatment = !patientTreatment && catalogTreatment ? {
          catalog_treatment_id: Number(catalogTreatment.id),
          title: catalogTreatment.name,
          tooth_code: data.tooth_code || null,
          plan_notes: data.notes || null,
          status: "planned",
          estimated_price: cost,
          final_price: cost - discount,
          start_date: data.appointment_date
        } : null;
        const scheduled = await DentalAPI.post("/api/appointments", {
          patient_id: patientId,
          patient_treatment_id: patientTreatment?.id || null,
          ...(newTreatment ? { new_treatment: newTreatment } : {}),
          starts_at: `${data.appointment_date} ${data.appointment_time}`,
          reason: patientTreatment ? `${patientTreatment.title}${patientTreatment.tooth_code ? ` · Pieza ${patientTreatment.tooth_code}` : ""}` : catalogTreatment ? `${catalogTreatment.name}${data.tooth_code ? ` · Pieza ${data.tooth_code}` : ""}` : "Control clinico",
          notes: data.notes || null,
          status: "scheduled"
        });
        patientTreatment = { id: scheduled.patient_treatment_id };
        // The appointment is already saved; an attachment error must not invite a duplicate booking.
        submitButton.dataset.appointmentSaved = "true";
        const file = form.querySelector('input[name="file"]').files[0];
        if (file) {
          const attachment = new FormData();
          attachment.set("patient_id", patientId);
          attachment.set("patient_treatment_id", patientTreatment?.id || "");
          attachment.set("file_type", "radiography");
          attachment.set("category", "Radiografia de planificacion");
          attachment.set("taken_at", data.appointment_date);
          attachment.set("notes", data.notes || "Adjunto desde agendamiento de cita");
          attachment.set("file", file);
          const response = await fetch("/api/attachments", { method: "POST", body: attachment });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "No se pudo guardar la radiografia.");
        }
      }

      if (action === "treatment") {
        const data = cleanFormData(form);
        await DentalAPI.post("/api/patient-treatments", {
          ...data,
          patient_id: patientId,
          catalog_treatment_id: data.catalog_treatment_id ? Number(data.catalog_treatment_id) : null,
          estimated_price: data.estimated_price ? Number(data.estimated_price) : null,
          start_date: new Date().toISOString().slice(0, 10)
        });
      }

      if (action === "attachment") {
        const formData = new FormData(form);
        formData.set("patient_id", patientId);
        const response = await fetch("/api/attachments", {
          method: "POST",
          body: formData
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "No se pudo guardar el adjunto.");
      }

      if (action === "payment") {
        const data = cleanFormData(form);
        await DentalAPI.post("/api/payments", {
          ...data,
          patient_id: patientId,
          patient_treatment_id: data.patient_treatment_id ? Number(data.patient_treatment_id) : null,
          amount: Number(data.amount || 0)
        });
      }

      status.textContent = "Guardado correctamente.";
      await loadPatient();
    } catch (error) {
      status.textContent = error.message;
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

