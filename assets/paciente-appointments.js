/* Controladores de agenda y formularios de cita de la ficha. */
(() => {
  function create(dependencies) {
    const { getSummary, getCatalog, getSelectedTooth, setSelectedTooth, pendingToothAppointment, loadPatient, toothDescription } = dependencies;
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
        catalog.required = !continuing && Boolean(getSelectedTooth());
        total.closest(".appointment-total").hidden = continuing;
        form.querySelector("[data-continuation-message]").hidden = !continuing;
        const summary = getSummary();
        const treatment = summary.treatments.find((item) => item.id === Number(existing.value));
        form.elements.tooth_code.value = treatment?.tooth_code || getSelectedTooth() || "";
        form.querySelector(".appointment-tooth-description").textContent = tooth.value ? toothDescription(tooth.value) : "Control general sin pieza dental.";
        const pending = pendingToothAppointment(form.elements.tooth_code.value);
        const warning = form.querySelector("[data-duplicate-message]");
        warning.hidden = !pending;
        warning.textContent = pending ? `Esta pieza ya tiene una cita pendiente para ${DentalAPI.date(pending.starts_at)} ${DentalAPI.time(pending.starts_at)}. Atiende, cancela o modifica esa cita antes de agendar otra.` : "";
        form.querySelector("button[type='submit']").disabled = Boolean(pending);
      };
      tooth.addEventListener("change", () => {
        setSelectedTooth(tooth.value || null);
        const available = getSummary().treatments.filter(item => item.status !== "completed" && (!tooth.value || String(item.tooth_code) === tooth.value));
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
        const item = getCatalog().find((entry) => Number(entry.id) === Number(catalog.value));
        if (item) cost.value = Number(item.default_price || 0);
        update();
      });
      cost.addEventListener("input", update);
      discount.addEventListener("input", update);
      update();
    }
    return Object.freeze({ bindPatientAppointmentActions, cleanFormData, bindAppointmentPriceForm });
  }
  window.PatientAppointments = Object.freeze({ create });
})();
