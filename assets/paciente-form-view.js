/* Formularios visibles de la ficha. Los datos de la pagina se reciben al abrirlos. */
(() => {
  function create(dependencies) {
    const { getSummary, getCatalog, getSelectedTooth, activeTreatment, selectedAppointment,
      treatmentBalance, balance, dateTimeForInput, renderTreatmentOptions,
      renderSessionOptions, todayForInput, nextControlInput, appointmentCatalogOptions,
      toothDescription, bindActionForm } = dependencies;

    function renderActionForm(action, entityId = null) {
      const currentSummary = getSummary();
      const currentCatalog = getCatalog();
      const selectedToothForAppointment = getSelectedTooth();
      const returnFocus = document.activeElement;
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
            <details class="clinical-field-fold">
              <summary>Diagnostico (opcional)</summary>
              <label><span class="sr-only">Diagnostico</span><textarea name="diagnosis" placeholder="Diagnostico observado"></textarea></label>
            </details>
            <details class="clinical-field-fold">
              <summary>Evolucion / observaciones (opcional)</summary>
              <label><span class="sr-only">Evolucion u observaciones</span><textarea name="notes" placeholder="Notas clinicas de la atencion"></textarea></label>
            </details>
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
          <form class="compact-form action-form patient-payment-form" data-form="payment">
            <label>Tratamiento<select name="patient_treatment_id"><option value="">Sin tratamiento asociado</option>${renderTreatmentOptions(paymentTreatment?.id)}</select></label>
            <label>Fecha pago<input name="payment_date" type="date" value="${DentalAPI.localDateString()}" required /></label>
            <div class="patient-payment-balances" aria-label="Saldos pendientes" aria-live="polite">
              <div class="patient-payment-balance">
                <span>Por pagar del tratamiento</span>
                <strong data-payment-treatment-balance>${DentalAPI.money(paymentTreatment ? treatmentBalance(currentSummary, paymentTreatment) : 0)}</strong>
                <small data-payment-treatment-note>${paymentTreatment ? `Total ${DentalAPI.money(Number(paymentTreatment.final_price ?? paymentTreatment.estimated_price ?? 0))}` : "Pago general sin tratamiento"}</small>
              </div>
              <div class="patient-payment-balance patient-payment-total">
                <span>Total pendiente del paciente</span>
                <strong data-payment-patient-balance>${DentalAPI.money(balance(currentSummary))}</strong>
                <small>Saldo combinado de sus tratamientos</small>
              </div>
            </div>
            <label>Monto<input name="amount" type="number" min="1" value="${suggestedPayment || ""}" placeholder="0" required /></label>
            <label>Metodo<select name="method"><option>Transferencia</option><option>Tarjeta</option><option>Efectivo</option><option>Otro</option></select></label>
            <details class="patient-payment-notes">
              <summary>Agregar nota (opcional)</summary>
              <label>Notas<textarea name="notes" placeholder="Detalle del pago o abono"></textarea></label>
            </details>
            <button class="text-button primary-action" type="submit">Guardar pago</button>
            <p class="form-status" aria-live="polite"></p>
          </form>
        `
      };

      drawer.hidden = false;
      drawer.innerHTML = `
        <div class="section-heading">
          <div><span class="eyebrow">Accion</span><h2 id="actionDrawerTitle">${titleByAction[action]}</h2></div>
          <button class="${action === "appointment" ? "icon-button appointment-close" : "text-button"}" type="button" data-action-close aria-label="Cerrar">${action === "appointment" ? "×" : "Cerrar"}</button>
        </div>
        ${forms[action]}
      `;
      drawer.setAttribute("aria-labelledby", "actionDrawerTitle");
      drawer.scrollIntoView({ behavior: "smooth", block: "start" });
      bindActionForm(returnFocus);
      drawer.querySelector("input, select, textarea")?.focus({ preventScroll: true });
    }

    return Object.freeze({ renderActionForm });
  }
  window.PatientFormView = Object.freeze({ create });
})();
