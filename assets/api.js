const DentalAPI = (() => {
  async function request(path, options = {}) {
    const response = await fetch(path, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });

    const contentType = response.headers.get("Content-Type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();

    if (response.status === 401 && !location.pathname.endsWith("/login.html")) {
      const next = encodeURIComponent(location.pathname + location.search);
      location.assign("/login.html?next=" + next);
    }
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
    const safeValue = String(value).includes("T") ? value : String(value).replace(" ", "T");
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
    localDateString,
    money,
    post,
    put,
    request,
    statusLabel,
    time
  };
})();
