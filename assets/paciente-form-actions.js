/* Escrituras de la ficha, separadas del renderizado y el manejo del cajon. */
(() => {
  function create(dependencies) {
    const { getSummary, getCatalog, cleanFormData, sessionPayloadFromForm, selectedAppointment, localDateString } = dependencies;

    async function saveAction(action, form, patientId, submitButton) {
      const currentSummary = getSummary();
      const currentCatalog = getCatalog();
      const validActions = new Set(["reschedule", "edit", "session", "continue-session", "edit-session", "appointment-session", "appointment", "treatment", "attachment", "payment"]);
      if (!validActions.has(action)) throw new Error("Accion de formulario no reconocida.");
      if (action === "reschedule") {
        const original = currentSummary.appointments.find(item => item.id === Number(form.dataset.entityId));
        if (!original || original.status !== "scheduled") throw new Error("Esta cita ya no esta pendiente. Recarga la ficha.");
        const startsAt = `${form.elements.reschedule_date.value}T${form.elements.reschedule_time.value}`;
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

      if (action === "session" || action === "continue-session") {
        const payload = sessionPayloadFromForm(form, patientId);
        await DentalAPI.post("/api/clinical-sessions", payload);
      }

      if (action === "edit-session") {
        const payload = sessionPayloadFromForm(form, patientId);
        delete payload.patient_id;
        await DentalAPI.put(`/api/clinical-sessions/${form.dataset.entityId}`, {
          ...payload
        });
      }

      if (action === "appointment-session") {
        const appointment = selectedAppointment();
        if (!appointment) throw new Error("No se encontro la cita que se va a atender.");
        const payload = sessionPayloadFromForm(form, patientId);
        await DentalAPI.post(`/api/appointments/${appointment.id}/attend`, payload);
      }

      if (action === "appointment") {
        const data = cleanFormData(form);
        const catalogTreatment = currentCatalog.find((item) => Number(item.id) === Number(data.catalog_treatment_id));
        const cost = Math.max(Number(data.cost || 0), 0);
        const discount = PatientAppointments.appointmentDiscount(cost, data.discount, data.discount_mode);
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
        const startsAt = PatientAppointments.selectedStarts(form);
        if (startsAt.some((value) => !/^\d{4}-\d{2}-\d{2} (09|1[0-5]):(00|30)$/.test(value) && !/^\d{4}-\d{2}-\d{2} 16:00$/.test(value))) throw new Error("Revisa la fecha y hora de cada cita.");
        if (new Set(startsAt).size !== startsAt.length) throw new Error("No repitas la misma fecha y hora.");
        const scheduled = await DentalAPI.post(startsAt.length > 1 ? "/api/appointments/batch" : "/api/appointments", {
          patient_id: patientId,
          patient_treatment_id: patientTreatment?.id || null,
          ...(newTreatment ? { new_treatment: newTreatment } : {}),
          starts_at: startsAt.length > 1 ? startsAt : startsAt[0],
          reason: patientTreatment ? `${patientTreatment.title}${patientTreatment.tooth_code ? ` · Piezas ${patientTreatment.tooth_code}` : ""}` : catalogTreatment ? `${catalogTreatment.name}${data.tooth_code ? ` · Piezas ${data.tooth_code}` : ""}` : "Control clinico",
          notes: data.notes || null,
          status: "scheduled"
        });
        patientTreatment = { id: (Array.isArray(scheduled) ? scheduled[0] : scheduled).patient_treatment_id };
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
        const items = Array.from(form.querySelectorAll("[data-plan-item]")).map((row) => {
          const catalogId = Number(row.querySelector("[data-plan-catalog]").value);
          const catalogTreatment = currentCatalog.find((item) => Number(item.id) === catalogId);
          if (!catalogTreatment) throw new Error("Selecciona un tratamiento en cada fila del plan.");
          const price = Math.max(Number(row.querySelector("[data-plan-price]").value || catalogTreatment.default_price || 0), 0);
          const discount = Math.min(Math.max(Number(row.querySelector("[data-plan-discount]").value || 0), 0), price);
          return {
            catalog_treatment_id: catalogId,
            title: catalogTreatment.name,
            tooth_code: row.querySelector("[data-plan-teeth]").value.trim() || null,
            estimated_price: price,
            final_price: price - discount
          };
        });
        await DentalAPI.post("/api/patient-treatment-plans", {
          patient_id: patientId,
          title: form.elements.plan_title.value.trim(),
          plan_notes: form.elements.plan_notes.value.trim(),
          start_date: DentalAPI.localDateString(),
          items
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
        if (form.paymentAllocation?.getMode() !== "single") {
          const allocations = form.paymentAllocation.allocations();
          const totalDue = Math.max(
            currentSummary.treatments.reduce((sum, treatment) => sum + Number(treatment.final_price ?? treatment.estimated_price ?? 0), 0)
            - currentSummary.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0), 0);
          if (form.paymentAllocation.total() > totalDue) throw new Error("El total supera el saldo pendiente del paciente.");
          await DentalAPI.post("/api/payments/batch", {
            patient_id: patientId,
            payment_date: data.payment_date,
            method: data.method,
            notes: data.notes || "",
            allocations
          });
        } else {
          await DentalAPI.post("/api/payments", {
            ...data,
            patient_id: patientId,
            patient_treatment_id: data.patient_treatment_id ? Number(data.patient_treatment_id) : null,
            amount: Number(data.amount || 0)
          });
        }
      }

    }

    return Object.freeze({ saveAction });
  }
  window.PatientFormActions = Object.freeze({ create });
})();
