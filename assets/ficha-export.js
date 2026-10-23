const DentalClinicalExport = (() => {
  const safe = (value, fallback = "No registrado") => DentalAPI.escapeHtml(String(value ?? "").trim() || fallback);
  const date = (value) => DentalAPI.date(value);
  const money = (value) => DentalAPI.money(value ?? 0);
  const treatmentAmount = (treatment) => Number(treatment.final_price ?? treatment.estimated_price ?? 0);
  const procedureDetails = (treatment) => {
    let items = [];
    try { items = JSON.parse(treatment.procedure_items_json || "[]"); } catch { /* Tratamiento anterior sin desglose. */ }
    if (!Array.isArray(items) || !items.length) return "";
    return `<div class="clinical-procedures"><strong>Procedimientos</strong><ul>${items.map((item) => {
      const price = Number(item.price || 0);
      const discount = item.discount_type === "percent" ? Math.round(price * Number(item.discount_value || 0) / 100) : Number(item.discount_value || 0);
      const discountLabel = discount ? ` · descuento ${item.discount_type === "percent" ? `${item.discount_value}%` : money(item.discount_value)}` : "";
      return `<li>${safe(item.name)} · ${safe(item.tooth_code ? `Piezas ${item.tooth_code}` : "General")} · Valor ${money(price)}${safe(discountLabel, "")} · Final ${money(Math.max(price - discount, 0))}</li>`;
    }).join("")}</ul>${Number(treatment.total_discount_value || 0) ? `<small>Descuento al total: ${safe(treatment.total_discount_type === "percent" ? `${treatment.total_discount_value}%` : money(treatment.total_discount_value))}</small>` : ""}</div>`;
  };

  function render(summary, note = "", selectedTreatmentIds = null) {
    const patient = summary.patient;
    const allTreatments = summary.treatments || [];
    const selection = selectedTreatmentIds === null ? null : new Set(selectedTreatmentIds.map(Number));
    const treatments = selection ? allTreatments.filter((item) => selection.has(Number(item.id))) : allTreatments;
    const appointments = summary.appointments || [];
    const payments = summary.payments || [];
    const name = DentalAPI.fullName(patient);
    const total = treatments.reduce((sum, treatment) => sum + treatmentAmount(treatment), 0);
    const treatmentPaid = (id) => payments.filter((payment) => Number(payment.patient_treatment_id) === Number(id))
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const paid = treatments.reduce((sum, treatment) => sum + treatmentPaid(treatment.id), 0);
    return `
      <header class="document-header"><div><strong>Renato A. Saldivia Salas</strong><span>Cirujano - Dentista</span><span>RUT: 9.936.382-7 · +56 9 81581831</span><span>Caupolican 567, 7tho Piso Of. 708 · Concepción</span></div><div><strong>Ficha clínica</strong><span>Emitida el ${date(new Date().toISOString())}</span></div></header>
      <section class="document-section clinical-patient-inline" aria-label="Datos del paciente">
        <h3>Datos del paciente</h3>
        <p><strong>Paciente:</strong> ${safe(name)} <span class="clinical-divider">·</span> <strong>RUT:</strong> ${safe(patient.rut)}</p>
        <p><strong>Telefono:</strong> ${safe(patient.phone)} <span class="clinical-divider">·</span> <strong>Email:</strong> ${safe(patient.email)}</p>
        <p><strong>Fecha de nacimiento:</strong> ${date(patient.birth_date)} <span class="clinical-divider">·</span> <strong>Direccion:</strong> ${safe(patient.address)}</p>
      </section>
      <section class="document-section"><h3>Tratamientos y citas</h3>
        ${treatments.length ? `<p class="clinical-treatment-total"><strong>Valor total:</strong> ${money(total)} <span class="clinical-divider">·</span> <strong>Abonos:</strong> ${money(paid)} <span class="clinical-divider">·</span> <strong>Saldo pendiente:</strong> ${money(Math.max(total - paid, 0))}</p>` : ""}
        ${treatments.length ? treatments.map((treatment) => {
          const treatmentAppointments = appointments.filter((appointment) => Number(appointment.patient_treatment_id) === Number(treatment.id))
            .sort((a, b) => String(a.starts_at || "").localeCompare(String(b.starts_at || "")));
          const value = treatmentAmount(treatment);
          const paidForTreatment = treatmentPaid(treatment.id);
          return `<article class="clinical-treatment-entry"><h4>${safe(treatment.title)}</h4>
            <p><strong>Piezas:</strong> ${safe(treatment.tooth_code, "General")} ${treatment.tooth_code ? `(${treatment.dentition_type === "child" ? "infantil" : "adulto"})` : ""} <span class="clinical-divider">·</span> <strong>Estado:</strong> ${safe(DentalAPI.statusLabel(treatment.status))}</p>
            <p><strong>Valor:</strong> ${money(value)} <span class="clinical-divider">·</span> <strong>Abonado:</strong> ${money(paidForTreatment)} <span class="clinical-divider">·</span> <strong>Saldo pendiente:</strong> ${money(Math.max(value - paidForTreatment, 0))}</p>
            ${procedureDetails(treatment)}
            <div class="clinical-appointments"><strong>Citas (${treatmentAppointments.length})</strong>
              ${treatmentAppointments.length ? `<ul>${treatmentAppointments.map((appointment) => `<li>${date(appointment.starts_at)} ${safe(String(appointment.starts_at || "").slice(11, 16), "")} · ${safe(DentalAPI.statusLabel(appointment.status))}${appointment.reason ? ` · ${safe(appointment.reason)}` : ""}</li>`).join("")}</ul>` : '<p class="document-muted">Sin citas vinculadas.</p>'}
            </div></article>`;
        }).join("") : '<p class="document-muted">No hay tratamientos registrados.</p>'}
      </section>
      ${note.trim() ? `<section class="document-section"><h3>Observación adicional</h3><p>${safe(note)}</p></section>` : ""}
    `;
  }

  function print(summary, selectedTreatmentIds = null) {
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
      .document-header span { display: block; font-size: 11px; }
      .document-header div:first-child { max-width: 65%; }
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
      .clinical-treatment-entry { padding: 12px 0; border-bottom: 1px solid #d9e5df; break-inside: avoid; }
      .clinical-treatment-entry h4 { margin: 0 0 6px; color: #126454; }
      .clinical-treatment-entry p { font-size: 12px; }
      .clinical-appointments { margin-top: 8px; padding-left: 10px; border-left: 2px solid #d9e5df; font-size: 12px; }
      .clinical-procedures { margin: 8px 0; padding: 8px 10px; border: 1px solid #d9e5df; border-radius: 6px; font-size: 12px; }
      .clinical-procedures ul { margin: 4px 0; padding-left: 18px; }
      .clinical-appointments ul { margin: 4px 0; padding-left: 18px; }
      .clinical-treatment-total { margin: 0 0 12px; padding: 8px 10px; border: 1px solid #d9e5df; border-radius: 6px; background: #f2f7f4; font-size: 12px; }
      .document-entry { margin: 10px 0; padding: 12px; border: 1px solid #d9e5df; border-radius: 6px; break-inside: avoid; }
      .document-entry strong { display: block; }
      @media print { body { background: white; } .print-sheet { min-height: 0; max-width: none; margin: 0; padding: 0; } }
    `;
    const title = safe(`Ficha clinica - ${DentalAPI.fullName(summary.patient)}`);
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><style>${printStyles}</style></head><body class="print-window"><article class="print-sheet">${render(summary, "", selectedTreatmentIds)}</article></body></html>`);
    popup.addEventListener("load", () => popup.print(), { once: true });
    popup.document.close();
  }

  return { render, print };
})();
