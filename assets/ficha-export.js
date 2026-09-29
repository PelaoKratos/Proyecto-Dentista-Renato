const DentalClinicalExport = (() => {
  const safe = (value, fallback = "No registrado") => DentalAPI.escapeHtml(String(value ?? "").trim() || fallback);
  const date = (value) => DentalAPI.date(value);
  const money = (value) => DentalAPI.money(value ?? 0);
  const treatmentAmount = (treatment) => Number(treatment.final_price ?? treatment.estimated_price ?? 0);

  function render(summary, note = "") {
    const patient = summary.patient;
    const treatments = summary.treatments || [];
    const sessions = summary.sessions || [];
    const attachments = summary.attachments || [];
    const name = DentalAPI.fullName(patient);
    return `
      <header class="document-header"><div><strong>Consulta Dental Renato</strong><span>Emitida el ${date(new Date().toISOString())}</span></div><div><strong>Ficha clinica</strong></div></header>
      <section class="document-section clinical-patient-inline" aria-label="Datos del paciente">
        <h3>Datos del paciente</h3>
        <p><strong>Paciente:</strong> ${safe(name)} <span class="clinical-divider">·</span> <strong>RUT:</strong> ${safe(patient.rut)}</p>
        <p><strong>Telefono:</strong> ${safe(patient.phone)} <span class="clinical-divider">·</span> <strong>Email:</strong> ${safe(patient.email)}</p>
        <p><strong>Fecha de nacimiento:</strong> ${date(patient.birth_date)} <span class="clinical-divider">·</span> <strong>Direccion:</strong> ${safe(patient.address)}</p>
      </section>
      <section class="document-section"><h3>Antecedentes y alertas</h3>
        <p><strong>Alergias:</strong> ${safe(patient.allergies, "Sin alergias registradas")}</p>
        <p><strong>Antecedentes:</strong> ${safe(patient.medical_notes, "Sin antecedentes registrados")}</p>
        <p><strong>Alerta activa:</strong> ${safe(patient.active_alert, "Sin alerta activa")}</p>
      </section>
      <section class="document-section"><h3>Tratamientos</h3>
        ${treatments.length ? `<table><thead><tr><th>Tratamiento</th><th>Pieza</th><th>Estado</th><th>Valor</th></tr></thead><tbody>${treatments.map(treatment => `
          <tr><td>${safe(treatment.title)}</td><td>${safe(treatment.tooth_code, "General")}</td><td>${safe(DentalAPI.statusLabel(treatment.status))}</td><td>${money(treatmentAmount(treatment))}</td></tr>`).join("")}</tbody></table>` : '<p class="document-muted">No hay tratamientos registrados.</p>'}
      </section>
      <section class="document-section"><h3>Evolucion clinica</h3>
        ${sessions.length ? sessions.map(session => `<article class="document-entry"><strong>${date(session.session_date)} · ${safe(session.reason, "Atencion clinica")}</strong><p><strong>Diagnostico:</strong> ${safe(session.diagnosis)}</p></article>`).join("") : '<p class="document-muted">No hay evoluciones registradas.</p>'}
      </section>
      <section class="document-section"><h3>Adjuntos</h3>
        ${attachments.length ? `<ul>${attachments.map(item => `<li>${safe(item.category || item.file_type)} · ${safe(item.original_filename)} · ${date(item.taken_at || item.created_at)}</li>`).join("")}</ul>` : '<p class="document-muted">No hay adjuntos registrados.</p>'}
      </section>
      ${note.trim() ? `<section class="document-section"><h3>Observacion adicional</h3><p>${safe(note)}</p></section>` : ""}
    `;
  }

  function print(summary) {
    const popup = window.open("", "_blank", "width=900,height=700");
    if (!popup) throw new Error("El navegador bloqueo la ventana de exportacion. Permite ventanas emergentes para guardar la ficha como PDF.");
    // Inline print rules keep the exported sheet readable in a newly opened window.
    const printStyles = `
      @page { size: A4; margin: 16mm; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #edf4f1; color: #263b33; font: 14px/1.45 Arial, sans-serif; }
      .print-sheet { max-width: 820px; min-height: 900px; margin: 24px auto; padding: 36px; background: white; }
      .document-header { display: flex; justify-content: space-between; gap: 20px; padding-bottom: 14px; border-bottom: 2px solid #0b806f; }
      .document-header div:last-child { text-align: right; }
      .document-header strong { display: block; color: #126454; }
      .document-header span, .document-muted { color: #637670; }
      .document-section { margin-top: 20px; }
      .document-section h3 { margin: 0 0 10px; color: #126454; font-size: 13px; text-transform: uppercase; }
      .document-section p { margin: 5px 0; }
      .clinical-patient-inline { padding: 10px 0 14px; border-bottom: 1px solid #d9e5df; }
      .clinical-patient-inline p { margin: 2px 0; font-size: 12px; overflow-wrap: anywhere; }
      .clinical-patient-inline strong { display: inline; }
      .clinical-divider { padding: 0 6px; color: #95a8a0; }
      table { width: 100%; border-collapse: collapse; text-align: left; }
      th, td { padding: 8px; border-bottom: 1px solid #d9e5df; }
      th { background: #eaf6f2; font-size: 12px; }
      .document-entry { margin: 10px 0; padding: 12px; border: 1px solid #d9e5df; border-radius: 6px; break-inside: avoid; }
      .document-entry strong { display: block; }
      @media print { body { background: white; } .print-sheet { min-height: 0; max-width: none; margin: 0; padding: 0; } }
    `;
    const title = safe(`Ficha clinica - ${DentalAPI.fullName(summary.patient)}`);
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><style>${printStyles}</style></head><body class="print-window"><article class="print-sheet">${render(summary)}</article></body></html>`);
    popup.addEventListener("load", () => popup.print(), { once: true });
    popup.document.close();
  }

  return { render, print };
})();
