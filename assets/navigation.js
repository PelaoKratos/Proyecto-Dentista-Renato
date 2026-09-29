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
    return `<a class="nav-item${active ? " active" : ""}" href="${href}"${current}>
      <span class="nav-icon"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true">${icon}</svg></span>
      ${label}
    </a>`;
  }).join("");

  navigationRoot.innerHTML = `
    <div class="brand">
      <span class="brand-mark"><img src="./assets/icons/app-icon.svg" alt="" /></span>
      <div><strong>Consulta Dental</strong><span>Dr. Renato</span></div>
    </div>
    <nav class="nav-list" aria-label="Navegacion principal">${links}</nav>
    <button class="nav-item sidebar-logout" type="button" id="logoutButton">
      <span class="nav-icon" aria-hidden="true">↪</span>Cerrar sesion
    </button>
    <div class="backup-status">
      <span class="status-dot"></span>
      <div><strong>Respaldo local</strong><span>Base local protegida</span></div>
    </div>
  `;
}

document.querySelector("#logoutButton")?.addEventListener("click", async () => {
  const button = document.querySelector("#logoutButton");
  button.disabled = true;
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    location.assign("/login.html");
  }
});
