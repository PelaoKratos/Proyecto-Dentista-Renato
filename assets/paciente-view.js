/* Renderizado de componentes clinicos independientes de la pagina. */
(() => {
function renderOdontogram(selectedTooth = "1", treatments = [], dentitionType = "adult") {
  const child = dentitionType === "child";
  const quadrantSize = child ? 5 : 8;
  const upperRight = Array.from({ length: quadrantSize }, (_, i) => String(i + 1));
  const upperLeft = Array.from({ length: quadrantSize }, (_, i) => String(quadrantSize + i + 1));
  const lowerRight = Array.from({ length: quadrantSize }, (_, i) => String(quadrantSize * 4 - i));
  const lowerLeft = Array.from({ length: quadrantSize }, (_, i) => String(quadrantSize * 3 - i));
  const treatmentByTooth = new Map();
  treatments.filter((item) => item.tooth_code && (item.dentition_type || "adult") === dentitionType).forEach((item) => {
    String(item.tooth_code).split(",").forEach((tooth) => {
      if (!treatmentByTooth.has(tooth)) treatmentByTooth.set(tooth, item);
    });
  });
  const shapeFor = (position) => {
    if (position <= 2) return "incisor";
    if (position === 3) return "canine";
    if (!child && position <= 5) return "premolar";
    return "molar";
  };
  const toothMarkup = (tooth, upper, position) => {
    const treatment = treatmentByTooth.get(tooth);
    const status = treatment?.status || "none";
    const shape = shapeFor(position);
    const width = shape === "molar" ? 30 : shape === "premolar" ? 24 : shape === "canine" ? 21 : 17;
    const fill = status === "completed" ? "#a5e8cf" : status === "in_progress" ? "#fbd2a4" : status === "planned" ? "#bdd7fa" : "#f7f5ee";
    const stroke = status === "completed" ? "#08775c" : status === "in_progress" ? "#a64b11" : status === "planned" ? "#1d4ed8" : "#627985";
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
  const quadrant = (numbers, upper, right) => numbers.map((tooth, index) =>
    toothMarkup(tooth, upper, right ? quadrantSize - index : index + 1)).join("");
  return `<div class="odontogram-shell" data-odontogram-type="${dentitionType}"><div class="odontogram-legend"><span><i class="legend-tooth"></i>Sin tratamiento</span><span><i class="legend-tooth planned"></i>Planificado</span><span><i class="legend-tooth in-progress"></i>En curso</span><span><i class="legend-tooth completed"></i>Completado</span></div><div class="jaw-labels"><span>Der.</span><strong>Superior</strong><span>Izq.</span></div><div class="tooth-row upper"><div>${quadrant(upperRight, true, true)}</div><em></em><div>${quadrant(upperLeft, true, false)}</div></div><div class="midline"><span>LINEA MEDIA</span></div><div class="tooth-row lower"><div>${quadrant(lowerRight, false, true)}</div><em></em><div>${quadrant(lowerLeft, false, false)}</div></div><div class="jaw-labels"><span>Der.</span><strong>Inferior</strong><span>Izq.</span></div></div>`;
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

function renderSessions(sessions, treatments = []) {
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
              const treatment = treatments.find((item) => item.id === Number(session.patient_treatment_id)) || null;
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
  window.PatientView = Object.freeze({ renderOdontogram, renderDataList, renderSessions });
})();
