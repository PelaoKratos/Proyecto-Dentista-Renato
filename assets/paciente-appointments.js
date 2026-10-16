/* Controladores de agenda y formularios de cita de la ficha. */
(() => {
  function appointmentDiscount(cost, value, mode) {
    const price = Math.max(Number(cost || 0), 0);
    const entered = Math.max(Number(value || 0), 0);
    if (mode === "percent") return Math.min(Math.round(price * Math.min(entered, 100) / 100), price);
    return Math.min(entered, price);
  }

  function weeklyStarts(date, hour, count) {
    const first = new Date(`${date}T12:00:00`);
    if (Number.isNaN(first.getTime())) return [];
    return Array.from({ length: count }, (_, index) => {
      const day = new Date(first);
      day.setDate(first.getDate() + index * 7);
      const dateValue = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      return `${dateValue} ${hour}`;
    });
  }

  function create(dependencies) {
    const { getSummary, getCatalog, getSelectedTooth, setSelectedTooth, pendingToothAppointment, loadPatient, onAttended, toothDescription } = dependencies;
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
            if (status === "attended") onAttended(appointmentId);
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
      const discountField = form.querySelector("[data-appointment-discount-field]");
      const discountMode = form.querySelector("[data-appointment-discount-mode-value]");
      const modeButtons = [...form.querySelectorAll("[data-appointment-discount-mode]")];
      const total = form.querySelector("[data-appointment-total]");
      const existing = form.querySelector("[data-existing-treatment]");
      const tooth = form.querySelector("[data-booking-tooth]");
      const sync = () => {
        const continuing = Boolean(existing.value);
        [catalog, cost].forEach((input) => { input.disabled = continuing; input.closest("label").hidden = continuing; });
        discount.disabled = continuing;
        discountField.hidden = continuing;
        catalog.required = !continuing && Boolean(tooth.value.trim());
        total.closest(".appointment-total").hidden = continuing;
        form.querySelector("[data-continuation-message]").hidden = !continuing;
        const summary = getSummary();
        const treatment = summary.treatments.find((item) => item.id === Number(existing.value));
        if (treatment) form.elements.tooth_code.value = treatment.tooth_code || "";
        form.querySelector(".appointment-tooth-description").textContent = tooth.value ? "Piezas: " + tooth.value + ". Separa cada número con una coma." : "Control general sin pieza dental.";
        const pending = pendingToothAppointment(form.elements.tooth_code.value, treatment?.dentition_type || summary.patient.dentition_type || "adult", treatment?.id);
        const warning = form.querySelector("[data-duplicate-message]");
        warning.hidden = !pending;
        warning.textContent = pending ? `Esta pieza ya tiene una cita pendiente de otro tratamiento para ${DentalAPI.date(pending.starts_at)} ${DentalAPI.time(pending.starts_at)}.` : "";
        form.dataset.toothConflict = String(Boolean(pending));
        form.querySelector("button[type='submit']").disabled = Boolean(pending) || form.dataset.timeConflict === "true";
      };
      tooth.addEventListener("input", () => {
        const codes = tooth.value.split(/[,;\s]+/).filter(Boolean);
        setSelectedTooth(codes[0] || null);
        const summary = getSummary();
        const available = summary.treatments.filter(item =>
          ["planned", "in_progress"].includes(item.status) &&
          (item.dentition_type || "adult") === (summary.patient.dentition_type || "adult") &&
          (codes.length > 0 && codes.some(code => String(item.tooth_code || "").split(",").includes(code)))
        );
        const selected = Number(form.dataset.entityId)
          ? summary.treatments.find(item => Number(item.id) === Number(form.dataset.entityId))
          : available[0];
        existing.value = selected?.id || "";
        sync();
      });
      sync();
      const update = () => {
        const price = Math.max(Number(cost.value || 0), 0);
        const maximum = discountMode.value === "percent" ? 100 : price;
        discount.max = String(maximum);
        if (discount.value !== "" && Number(discount.value) > maximum) discount.value = String(maximum);
        const reduction = appointmentDiscount(price, discount.value, discountMode.value);
        total.textContent = DentalAPI.money(price - reduction);
      };
      modeButtons.forEach((button) => button.addEventListener("click", () => {
        if (discountMode.value === button.dataset.appointmentDiscountMode) return;
        discountMode.value = button.dataset.appointmentDiscountMode;
        discount.value = "";
        discount.step = discountMode.value === "percent" ? "0.1" : "1";
        discount.placeholder = discountMode.value === "percent" ? "Porcentaje %" : "Monto $";
        discount.setAttribute("aria-label", discountMode.value === "percent" ? "Descuento en porcentaje" : "Descuento en pesos");
        modeButtons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
        update();
        discount.focus();
      }));
      catalog.addEventListener("change", () => {
        const item = getCatalog().find((entry) => Number(entry.id) === Number(catalog.value));
        if (item) cost.value = Number(item.default_price || 0);
        update();
      });
      cost.addEventListener("input", update);
      discount.addEventListener("input", update);
      update();
    }
    function bindAppointmentAvailability(form, appointmentId = null) {
      const dateInput = form.elements.appointment_date || form.elements.reschedule_date;
      const timeSelect = form.elements.appointment_time || form.elements.reschedule_time;
      const message = form.querySelector("[data-time-availability]");
      const submit = form.querySelector("button[type='submit']");
      const original = appointmentId ? getSummary().appointments.find((item) => Number(item.id) === Number(appointmentId)) : null;
      const duration = original?.ends_at
        ? Math.max((new Date(original.ends_at.replace(" ", "T")) - new Date(original.starts_at.replace(" ", "T"))) / 60000, 30)
        : 30;
      let appointments = [];
      let requestNumber = 0;

      function update() {
        const date = dateInput.value;
        const count = Number(form.elements.weekly_count?.value || 1);
        const occupied = (hour, candidateDate = date) => {
          if (!candidateDate) return [];
          const start = new Date(`${candidateDate}T${hour}:00`).getTime();
          const end = start + duration * 60000;
          return appointments.filter((item) => {
            if (item.status !== "scheduled" || Number(item.id) === Number(appointmentId)) return false;
            const otherStart = new Date(String(item.starts_at).replace(" ", "T")).getTime();
            const otherEnd = item.ends_at
              ? new Date(String(item.ends_at).replace(" ", "T")).getTime() : otherStart + 30 * 60000;
            return start < otherEnd && otherStart < end;
          });
        };
        const conflictOn = (hour, candidateDate) => {
          const overlapping = occupied(hour, candidateDate);
          const shareable = hour === "16:00" && overlapping.length > 0 && overlapping.every((item) => String(item.starts_at).replace("T", " ").slice(11, 16) === "16:00" && Number(item.patient_id) !== Number(getSummary().patient.id));
          return { busy: overlapping.length > 0, blocked: overlapping.length > 0 && !shareable };
        };
        [...timeSelect.options].forEach((option) => {
          const first = conflictOn(option.value, date);
          option.textContent = `${option.value} · ${first.busy ? first.blocked ? "Ocupada" : "Ocupada (permite otra cita)" : "Disponible"}`;
          option.dataset.occupied = String(first.busy);
        });
        const dates = weeklyStarts(date, timeSelect.value, count);
        const unavailable = dates.filter((value) => conflictOn(timeSelect.value, value.slice(0, 10)).blocked);
        const busy = dates.some((value) => conflictOn(timeSelect.value, value.slice(0, 10)).busy);
        const blocked = unavailable.length > 0;
        form.dataset.timeConflict = String(blocked);
        message.textContent = blocked
          ? `La hora ${timeSelect.value} ya está ocupada el ${unavailable.map((value) => DentalAPI.date(value)).join(", ")}. Selecciona otra fecha u hora.`
          : busy ? `Las 16:00 están ocupadas en alguna fecha, pero puedes agendar otro paciente a esa hora.`
          : count > 1 ? `${count} citas disponibles: ${dates.map((value) => DentalAPI.date(value)).join(", ")}.`
          : `${timeSelect.value} disponible para agendar.`;
        message.classList.toggle("time-occupied", blocked);
        submit.disabled = blocked || form.dataset.toothConflict === "true";
      }

      async function refresh() {
        const request = ++requestNumber;
        form.dataset.timeConflict = "true";
        submit.disabled = true;
        message.textContent = "Comprobando horarios disponibles...";
        try {
          const loaded = await DentalAPI.get("/api/appointments");
          if (request !== requestNumber || !form.isConnected) return;
          appointments = Array.isArray(loaded) ? loaded : [];
          update();
        } catch (error) {
          if (request !== requestNumber || !form.isConnected) return;
          form.dataset.timeConflict = "false";
          submit.disabled = form.dataset.toothConflict === "true";
          message.textContent = "No se pudo consultar la disponibilidad. Se comprobará al guardar.";
        }
      }
      dateInput.addEventListener("change", refresh);
      timeSelect.addEventListener("change", update);
      form.elements.weekly_count?.addEventListener("change", update);
      refresh();
    }

    return Object.freeze({ bindPatientAppointmentActions, cleanFormData, bindAppointmentPriceForm, bindAppointmentAvailability });
  }
  window.PatientAppointments = Object.freeze({ create, appointmentDiscount, weeklyStarts });
})();
