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
          start_date: DentalAPI.localDateString()
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

    }

    return Object.freeze({ saveAction });
  }
  window.PatientFormActions = Object.freeze({ create });
})();
