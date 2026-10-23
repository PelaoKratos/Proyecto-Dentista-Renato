const navigationItems = [
  {
    key: "home",
    label: "Inicio",
    href: "./index.html",
    icon: '<path d="M3 7.2 8 3l5 4.2v5.3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7.2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M6.5 13.5v-3h3v3" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />'
  },
  {
    key: "patients",
    label: "Pacientes",
    href: "./pacientes.html",
    icon: '<circle cx="8" cy="5.5" r="2.5" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 13.5a5.5 5.5 0 0 1 11 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />'
  },
  {
    key: "treatments",
    label: "Tratamientos",
    href: "./tratamientos.html",
    icon: '<path d="M6 2h4l1 3h2l-1 8H4L3 5h2l1-3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M6 8h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />'
  },
  {
    key: "procedures",
    label: "Procedimientos",
    href: "./procedimientos.html",
    icon: '<rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M6 5h4M6 8h4M6 11h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />'
  },
  {
    key: "agenda",
    label: "Agenda",
    href: "./agenda.html",
    icon: '<rect x="2.5" y="3" width="11" height="10.5" rx="1.8" stroke="currentColor" stroke-width="1.5"/><path d="M5 1.5v3M11 1.5v3M2.5 6.5h11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />'
  },
  {
    key: "payments",
    label: "Pagos",
    href: "./pagos.html",
    icon: '<rect x="2" y="4" width="12" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M2 7h12M5 10h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />'
  },
  {
    key: "backups",
    label: "Respaldos",
    href: "./respaldos.html",
    icon: '<path d="M8 2.5v7M5.5 7 8 9.5 10.5 7M3 11.5v1.2a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />'
  }
];
const navigationRoot = document.querySelector("[data-navigation]");

if (navigationRoot) {
  const pageName = location.pathname.split("/").pop() || "index.html";
  const pageKeys = {
    "index.html": "home",
    "pacientes.html": "patients",
    "paciente.html": "patients",
    "tratamientos.html": "treatments",
    "procedimientos.html": "procedures",
    "agenda.html": "agenda",
    "pagos.html": "payments",
    "respaldos.html": "backups"
  };
  const activeKey = pageKeys[pageName];
  const links = navigationItems.map(({ key, label, href, icon }) => {
    const active = key === activeKey;
    const current = active ? ' aria-current="page"' : "";
    return `<a class="nav-item${active ? " active" : ""}" href="${href}" title="${label}"${current}>
      <span class="nav-icon"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true">${icon}</svg></span>
      ${label}
    </a>`;
  }).join("");

  navigationRoot.innerHTML = `
    <div class="brand">
      <span class="brand-mark"><img src="./assets/icons/app-icon.svg" alt="" /></span>
      <div><strong>Consulta Dental</strong><span>Dr. Renato</span></div>
    </div>
    <button class="nav-item sidebar-search-launch" type="button" id="openPatientSearch" title="Buscar paciente" aria-label="Buscar paciente">
      <span class="nav-icon"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.5"/><path d="m10.5 10.5 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>Buscar paciente
    </button>
    <nav class="nav-list" aria-label="Navegacion principal">${links}</nav>
    <div class="sidebar-footer">
      <button class="nav-item sidebar-logout" type="button" id="logoutButton" title="Cerrar sesión">
        <span class="nav-icon" aria-hidden="true">↪</span>Cerrar sesión
      </button>
      <p class="sidebar-logout-status" id="logoutStatus" role="alert"></p>
      <div class="backup-status">
        <span class="status-dot"></span>
        <div><strong>Respaldo local</strong><span>Base local protegida</span></div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", `
    <dialog id="patientSearchDialog" class="patient-search-dialog" aria-labelledby="patientSearchTitle">
      <div class="patient-search-header"><h2 id="patientSearchTitle">Buscar paciente</h2><button class="text-button" type="button" data-close-patient-search>Cerrar</button></div>
      <label>Nombre, RUT o teléfono<input id="patientSearchInput" type="search" placeholder="Escribe para buscar..." autocomplete="off" /></label>
      <div id="patientSearchResults" class="patient-search-results" role="region" aria-live="polite"><p>Escribe un nombre, RUT o teléfono.</p></div>
    </dialog>
  `);

  const searchDialog = document.querySelector("#patientSearchDialog");
  const searchInput = document.querySelector("#patientSearchInput");
  const results = document.querySelector("#patientSearchResults");
  let searchablePatients = [];
  const normalize = (value) => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const compact = (value) => String(value || "").toUpperCase().replace(/[^0-9K]/g, "");
  const renderResults = () => {
    const query = normalize(searchInput.value.trim());
    if (!query) {
      results.innerHTML = "<p>Escribe un nombre, RUT o teléfono.</p>";
      return;
    }
    const matches = searchablePatients.filter((patient) =>
      normalize(`${DentalAPI.fullName(patient)} ${patient.rut || ""} ${patient.phone || ""}`).includes(query) ||
      /\d/.test(query) && (compact(patient.rut).includes(compact(query)) || compact(patient.phone).includes(compact(query)))).slice(0, 12);
    results.innerHTML = matches.length ? matches.map((patient) => `
      <a href="./paciente.html?id=${Number(patient.id)}"><strong>${DentalAPI.escapeHtml(DentalAPI.fullName(patient))}</strong><span>${DentalAPI.escapeHtml(patient.rut || "Sin RUT")} · ${DentalAPI.escapeHtml(patient.phone || "Sin teléfono")}</span></a>
    `).join("") : "<p>No se encontraron pacientes.</p>";
  };
  document.querySelector("#openPatientSearch").addEventListener("click", async () => {
    searchInput.value = "";
    searchablePatients = [];
    results.innerHTML = "<p>Cargando pacientes...</p>";
    searchDialog.showModal();
    searchInput.focus();
    try {
      searchablePatients = await DentalAPI.get("/api/patients");
      if (searchDialog.open) renderResults();
    } catch (error) {
      if (searchDialog.open) results.textContent = `No se pudo buscar: ${error.message}`;
    }
  });
  searchInput.addEventListener("input", renderResults);
  searchDialog.querySelector("[data-close-patient-search]").addEventListener("click", () => searchDialog.close());
}

const unsavedEditSources = new Map();
window.UnsavedEdits = Object.freeze({
  register(key, source) { unsavedEditSources.set(key, source); },
  hasChanges() { return [...unsavedEditSources.values()].some((source) => source.isDirty()); },
  confirmDiscard() {
    if (!this.hasChanges()) return true;
    if (!window.confirm("Hay cambios sin guardar. ¿Quieres descartarlos?")) return false;
    unsavedEditSources.forEach((source) => { if (source.isDirty()) source.discard(); });
    return true;
  }
});
window.addEventListener("beforeunload", (event) => {
  if (!window.UnsavedEdits.hasChanges()) return;
  event.preventDefault();
  event.returnValue = "";
});

document.querySelector("#logoutButton")?.addEventListener("click", async () => {
  if (!window.UnsavedEdits.confirmDiscard()) return;
  const button = document.querySelector("#logoutButton");
  const status = document.querySelector("#logoutStatus");
  button.disabled = true;
  status.textContent = "";
  try {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) throw new Error("No se pudo cerrar la sesión. Inténtalo de nuevo.");
    location.assign("/login.html");
  } catch (error) {
    status.textContent = "No se pudo cerrar la sesión. Inténtalo de nuevo.";
    button.disabled = false;
  }
});
