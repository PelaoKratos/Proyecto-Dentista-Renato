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
      const toothTreatment = selectedToothForAppointment ? currentSummary.treatments.find((item) => (item.dentition_type || "adult") === (patient.dentition_type || "adult") && String(item.tooth_code || "").split(",").includes(String(selectedToothForAppointment)) && ["planned", "in_progress"].includes(item.status)) : null;
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
        treatment: "Nuevo plan de tratamiento",
        attachment: "Adjuntar radiografia o documento",
        payment: "Registrar pago"
      };

      const forms = {
        reschedule: `<form class="compact-form action-form" data-form="reschedule" data-entity-id="${appointment?.id || ""}">
          <p>${DentalAPI.escapeHtml(appointment?.reason || "Cita del paciente")}</p><p class="form-helper">Se cambia la fecha de esta misma cita. El tratamiento, su precio y sus pagos se conservan.</p>
          <label>Nueva fecha<input name="reschedule_date" type="date" value="${dateTimeForInput(appointment?.starts_at).slice(0, 10)}" required /></label><label>Hora<select name="reschedule_time" required>${Array.from({length: 15}, (_, index) => { const hour = 9 + Math.floor(index / 2); const minute = index % 2 ? "30" : "00"; const value = `${String(hour).padStart(2, "0")}:${minute}`; return `<option value="${value}" ${value === dateTimeForInput(appointment?.starts_at).slice(11, 16) ? "selected" : ""}>${value}</option>`; }).join("")}</select></label><p class="appointment-wide appointment-time-availability" data-time-availability role="status" aria-live="polite"></p>
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
          <form class="compact-form action-form appointment-form" data-form="appointment" data-entity-id="${entityId || ""}" enctype="multipart/form-data">
            <label class="appointment-wide">1. Piezas dentales<input name="tooth_code" data-booking-tooth value="${DentalAPI.escapeHtml(selectedToothForAppointment || "")}" placeholder="${(patient.dentition_type || "adult") === "child" ? "Ej. 1, 2, 3 (hasta 20)" : "Ej. 1, 2, 3 (hasta 32)"}" inputmode="numeric" /></label>
            <p class="appointment-tooth-description">Numeración ${(patient.dentition_type || "adult") === "child" ? "infantil, 1 a 20" : "adulta, 1 a 32"}. Separa con comas; deja vacío para un control general.</p>
            <input type="hidden" name="patient_treatment_id" data-existing-treatment value="${Number(entityId || toothTreatment?.id || 0) || ""}" />
            <p class="appointment-wide form-status" data-duplicate-message role="status" hidden></p>
            <p class="appointment-wide" data-continuation-message hidden>Esta cita conserva el presupuesto y los pagos del tratamiento. No genera un nuevo cobro.</p>
            <label class="appointment-wide">Tratamiento<select name="catalog_treatment_id" data-appointment-catalog ${selectedToothForAppointment ? "required" : ""}><option value="">Seleccionar tratamiento...</option>${appointmentCatalogOptions()}</select></label>
            <label>Costo<input name="cost" type="number" min="0" step="1" placeholder="$" data-appointment-cost /></label>
            <div class="appointment-discount-field" data-appointment-discount-field>
              <div class="appointment-discount-heading">
                <label for="appointmentDiscount">Descuento</label>
                <div class="appointment-discount-modes" role="group" aria-label="Tipo de descuento">
                  <button type="button" data-appointment-discount-mode="amount" aria-pressed="true">Monto $</button>
                  <button type="button" data-appointment-discount-mode="percent" aria-pressed="false">Porcentaje %</button>
                </div>
              </div>
              <input id="appointmentDiscount" name="discount" type="number" min="0" step="1" placeholder="Monto $" data-appointment-discount aria-label="Descuento en pesos" />
              <input name="discount_mode" type="hidden" value="amount" data-appointment-discount-mode-value />
            </div>
            <div class="appointment-total"><span>Total con descuento</span><strong data-appointment-total>$0</strong></div>
            <h3 class="appointment-wide">3. Fecha de la cita</h3>
            <label>Fecha<input name="appointment_date" type="date" value="${nextControlInput().slice(0, 10)}" required /></label>
            <label>Hora<select name="appointment_time" required>${Array.from({length: 15}, (_, index) => { const hour = 9 + Math.floor(index / 2); const minute = index % 2 ? "30" : "00"; const value = `${String(hour).padStart(2, "0")}:${minute}`; return `<option value="${value}" ${value === nextControlInput().slice(11, 16) ? "selected" : ""}>${value}</option>`; }).join("")}</select></label>
            <label class="appointment-wide">Programación<select name="schedule_mode"><option value="single">Solo esta cita</option><option value="weekly">Repetir cada semana</option><option value="custom">Elegir otras fechas y horas</option></select></label>
            <label class="appointment-wide" data-weekly-fields hidden>Citas semanales<select name="weekly_count" data-weekly-count>${Array.from({length: 7}, (_, index) => `<option value="${index + 2}">${index + 2} citas, una por semana</option>`).join("")}</select><small>Se agendarán el mismo día de la semana y a la misma hora, sin generar nuevos cobros.</small></label>
            <div class="appointment-wide custom-appointments" data-custom-appointments hidden><p>Agrega las próximas citas con la fecha y hora que prefieras. Todas quedarán en el mismo tratamiento y presupuesto.</p><div data-custom-rows></div><button type="button" class="text-button" data-add-custom-date>+ Agregar otra cita</button></div>
            <p class="appointment-wide appointment-time-availability" data-time-availability role="status" aria-live="polite"></p>
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
            <label>Piezas dentales<input name="tooth_code" placeholder="${(patient.dentition_type || "adult") === "child" ? "1 a 20" : "1 a 32"}; ej. 1, 2, 3" /></label>
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
            <div class="payment-modes" role="group" aria-label="Aplicar pago a tratamientos">
              <button type="button" data-payment-mode="single" aria-pressed="true">Un tratamiento</button>
              <button type="button" data-payment-mode="multiple" aria-pressed="false">Varios tratamientos</button>
              <button type="button" data-payment-mode="all" aria-pressed="false">Pagar todos</button>
            </div>
            <label data-payment-single>Tratamiento<select name="patient_treatment_id"><option value="">Sin tratamiento asociado</option>${renderTreatmentOptions(paymentTreatment?.id)}</select></label>
            <div class="payment-allocation-list" data-payment-allocation-list hidden></div>
            <p class="payment-allocation-summary" data-payment-allocation-summary aria-live="polite" hidden></p>
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
            <label data-payment-single>Monto<input name="amount" type="number" min="1" step="1" value="${suggestedPayment || ""}" placeholder="0" required /></label>
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
