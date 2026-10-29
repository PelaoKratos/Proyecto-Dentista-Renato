const DentalAPI = (() => {
  let pendingLogin = null;
  function renewSession() {
    if (pendingLogin) return pendingLogin;
    pendingLogin = new Promise((resolve, reject) => {
      const dialog = document.createElement("dialog");
      dialog.className = "session-renew-dialog";
      dialog.setAttribute("aria-labelledby", "sessionRenewTitle");
      dialog.innerHTML = `<form><h2 id="sessionRenewTitle">Tu sesión venció</h2><p>Lo que estabas escribiendo sigue en el formulario. Ingresa tu contraseña para continuar y guardar.</p><label>Contraseña<input type="password" autocomplete="current-password" required /></label><p role="status" aria-live="polite"></p><div class="inline-actions"><button class="text-button" type="button">Volver al formulario</button><button class="text-button primary-action" type="submit">Continuar</button></div></form>`;
      document.body.append(dialog);
      const close = (authenticated) => {
        dialog.querySelector("input").value = "";
        dialog.close();
        dialog.remove();
        authenticated ? resolve() : reject(new Error("El formulario se conserva. Vuelve a guardar e ingresa tu contraseña para continuar."));
      };
      dialog.querySelector('button[type="button"]').addEventListener("click", () => close(false));
      dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(false); });
      dialog.querySelector("form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = dialog.querySelector('button[type="submit"]');
        const status = dialog.querySelector('[role="status"]');
        submit.disabled = true;
        try {
          const response = await fetch("/api/auth/login", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({password: dialog.querySelector("input").value})});
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "No se pudo renovar la sesión.");
          close(true);
        } catch (error) { status.textContent = error.message; submit.disabled = false; }
      });
      dialog.showModal();
      dialog.querySelector("input").focus();
    }).finally(() => { pendingLogin = null; });
    return pendingLogin;
  }

  async function request(path, options = {}) {
    const multipart = options.body instanceof FormData;
    const fetchOptions = {
      ...options,
      headers: {
        ...(!multipart ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    };
    let response = await fetch(path, fetchOptions);
    if (response.status === 401 && !location.pathname.endsWith("/login.html") && !path.startsWith("/api/auth/")) {
      await renewSession();
      response = await fetch(path, fetchOptions);
    }

    const contentType = response.headers.get("Content-Type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();

    if (!response.ok) {
      const message = typeof payload === "object" && payload.error ? payload.error : "No se pudo completar la accion.";
      throw new Error(message);
    }

    return payload;
  }

  function get(path) {
    return request(path);
  }

  function post(path, data) {
    return request(path, {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  function upload(path, data) {
    return request(path, { method: "POST", body: data });
  }

  function put(path, data) {
    return request(path, {
      method: "PUT",
      body: JSON.stringify(data)
    });
  }

  function del(path) {
    return request(path, {
      method: "DELETE"
    });
  }

  function money(value) {
    const amount = Number(value || 0);
    return amount.toLocaleString("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0
    });
  }

  function localDateString(value = new Date()) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function date(value, options = {}) {
    if (!value) return "Sin fecha";
    const safeValue = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00`
      : String(value).includes("T") ? value : String(value).replace(" ", "T");
    const parsed = new Date(safeValue);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("es-CL", options);
  }

  function time(value) {
    if (!value) return "";
    const safeValue = String(value).includes("T") ? value : String(value).replace(" ", "T");
    const parsed = new Date(safeValue);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  }

  function fullName(patient) {
    return `${patient.first_name || ""} ${patient.last_name || ""}`.trim();
  }

  function patientLink(patientId, label) {
    const safeLabel = escapeHtml(label || "Paciente");
    if (!patientId) return safeLabel;
    return `<a class="patient-name-link" href="./paciente.html?id=${encodeURIComponent(patientId)}">${safeLabel}</a>`;
  }

  function initials(patient) {
    const first = patient.first_name ? patient.first_name[0] : "";
    const last = patient.last_name ? patient.last_name[0] : "";
    return `${first}${last}`.toUpperCase() || "P";
  }

  function statusLabel(status) {
    const labels = {
      planned: "Planificado",
      in_progress: "En curso",
      completed: "Completado",
      cancelled: "Cancelado",
      scheduled: "Confirmada",
      attended: "Atendida",
      missed: "No asistio"
    };

    return labels[status] || status || "Sin estado";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  return {
    date,
    del,
    escapeHtml,
    fullName,
    get,
    initials,
    patientLink,
    localDateString,
    money,
    post,
    put,
    request,
    statusLabel,
    time,
    upload
  };
})();
