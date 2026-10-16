const createBackupBtn = document.querySelector("#createBackupBtn");
const backupTable = document.querySelector("#backupTable");
const backupStats = document.querySelector("#backupStats");
const backupStatusTitle = document.querySelector("#backupStatusTitle");
const backupStatusText = document.querySelector("#backupStatusText");
const backupIncludeMedia = document.querySelector("#backupIncludeMedia");
const saveBackupSettings = document.querySelector("#saveBackupSettings");
const backupSettingsStatus = document.querySelector("#backupSettingsStatus");
const backupDateFrom = document.querySelector("#backupDateFrom");
const backupDateTo = document.querySelector("#backupDateTo");
const clearBackupDates = document.querySelector("#clearBackupDates");
const backupResultsCount = document.querySelector("#backupResultsCount");
const backupPagination = [document.querySelector("#backupPaginationTop"), document.querySelector("#backupPaginationBottom")];
const SETTINGS_KEY = "consultaDental.backupSettings";
const BACKUPS_PER_PAGE = 20;
const BACKUP_PAGE_WINDOW = 5;
let allBackups = [];
let currentBackupPage = 1;

function fileSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function backupDate(value) {
  if (!value) return "Sin fecha";
  return DentalAPI.date(value);
}

function renderStatus(status) {
  const latest = status.backups?.latest;
  backupStatusTitle.textContent = latest ? "Ultimo respaldo disponible" : "Aun no hay respaldos creados";
  backupStatusText.textContent = latest
    ? `La ultima copia fue ${fileSize(latest.size)}, creada el ${backupDate(latest.created_at)} y ${latest.includes_media ? "incluye" : "no incluye"} los adjuntos.`
    : "La aplicacion crea una copia automatica semanal mientras el servidor esta en uso.";

  backupStats.innerHTML = `
    <div class="backup-stat">
      <small>Base SQLite</small>
      <strong>${status.database?.exists ? fileSize(status.database.size) : "No encontrada"}</strong>
      <span>${DentalAPI.escapeHtml(status.database?.path || "data/consulta_dental.sqlite3")}</span>
    </div>
    <div class="backup-stat">
      <small>Adjuntos</small>
      <strong>${Number(status.media?.files || 0)} archivos</strong>
      <span>${fileSize(status.media?.size)} en ${DentalAPI.escapeHtml(status.media?.path || "media")}</span>
    </div>
    <div class="backup-stat">
      <small>Copias ZIP</small>
      <strong>${Number(status.backups?.count || 0)} respaldos</strong>
      <span>${DentalAPI.escapeHtml(status.backups?.path || "backups")}</span>
    </div>
  `;
}

function backupPaginationMarkup(totalPages) {
  const first = Math.max(1, Math.min(currentBackupPage - Math.floor(BACKUP_PAGE_WINDOW / 2), totalPages - BACKUP_PAGE_WINDOW + 1));
  const last = Math.min(totalPages, first + BACKUP_PAGE_WINDOW - 1);
  const numbers = [];
  for (let page = first; page <= last; page += 1) {
    numbers.push(`<button type="button" data-backup-page="${page}" aria-label="Página ${page}" ${page === currentBackupPage ? 'aria-current="page"' : ""}>${page}</button>`);
  }
  return `<button type="button" data-backup-page="${currentBackupPage - 1}" ${currentBackupPage === 1 ? "disabled" : ""}>‹ Anterior</button>${numbers.join("")}<button type="button" data-backup-page="${currentBackupPage + 1}" ${currentBackupPage === totalPages ? "disabled" : ""}>Siguiente ›</button>`;
}

function renderBackups() {
  const from = backupDateFrom.value;
  const through = backupDateTo.value;
  const filtered = allBackups.filter((backup) => {
    const date = String(backup.created_at || "").slice(0, 10);
    return (!from || date >= from) && (!through || date <= through);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / BACKUPS_PER_PAGE));
  currentBackupPage = Math.min(currentBackupPage, totalPages);
  const firstItem = (currentBackupPage - 1) * BACKUPS_PER_PAGE;
  const visible = filtered.slice(firstItem, firstItem + BACKUPS_PER_PAGE);
  backupResultsCount.textContent = filtered.length
    ? `Mostrando ${firstItem + 1}–${Math.min(firstItem + BACKUPS_PER_PAGE, filtered.length)} de ${filtered.length} respaldos · Página ${currentBackupPage} de ${totalPages}`
    : (allBackups.length ? "No hay respaldos en el rango de fechas seleccionado." : "Todavía no hay respaldos creados.");
  backupPagination.forEach((navigation) => {
    navigation.hidden = totalPages <= 1;
    navigation.innerHTML = totalPages > 1 ? backupPaginationMarkup(totalPages) : "";
  });
  backupTable.innerHTML = `
    <div class="records-row records-head"><span>Archivo</span><span>Fecha</span><span>Tamano</span><span>Accion</span></div>
    ${visible.map((backup) => `
      <div class="records-row">
        <span>${DentalAPI.escapeHtml(backup.name)}</span>
        <span>${backupDate(backup.created_at)}</span>
        <span>${fileSize(backup.size)}<small>${backup.mode === "automatic" ? "Automatico" : "Manual"} · ${backup.includes_media ? "Base y adjuntos" : "Solo base de datos"}</small></span>
        <span><a class="inline-link" href="${DentalAPI.escapeHtml(backup.download_url || backup.backup_path)}" download>Descargar</a></span>
      </div>
    `).join("") || `<p class="empty-state">${allBackups.length ? "No hay respaldos para estas fechas." : "Todavia no hay respaldos creados."}</p>`}
  `;
}

async function loadBackupPage() {
  const [status, backups] = await Promise.all([DentalAPI.get("/api/backup-status"), DentalAPI.get("/api/backups")]);
  renderStatus(status);
  allBackups = backups;
  renderBackups();
}

[backupDateFrom, backupDateTo].forEach((input) => input.addEventListener("change", () => {
  currentBackupPage = 1;
  renderBackups();
}));
clearBackupDates.addEventListener("click", () => {
  backupDateFrom.value = "";
  backupDateTo.value = "";
  currentBackupPage = 1;
  renderBackups();
});
backupPagination.forEach((navigation) => navigation.addEventListener("click", (event) => {
  const button = event.target.closest("[data-backup-page]");
  if (!button || button.disabled) return;
  currentBackupPage = Number(button.dataset.backupPage);
  renderBackups();
  backupResultsCount.scrollIntoView({ block: "nearest" });
}));

function loadBackupSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return;
  try {
    const settings = JSON.parse(raw);
    backupIncludeMedia.checked = settings.includeMedia !== false;
  } catch {
    backupSettingsStatus.textContent = "No se pudo leer la configuracion guardada.";
  }
}

saveBackupSettings.addEventListener("click", () => {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      includeMedia: backupIncludeMedia.checked
    })
  );
  backupSettingsStatus.textContent = "Configuracion guardada en este computador.";
});

createBackupBtn.addEventListener("click", async () => {
  createBackupBtn.textContent = "Creando...";
  createBackupBtn.disabled = true;
  try {
    const includesMedia = backupIncludeMedia.checked;
    await DentalAPI.post("/api/backups", { include_media: includesMedia });
    currentBackupPage = 1;
    await loadBackupPage();
  } catch (error) {
    backupTable.innerHTML = `<p class="empty-state">No se pudo crear el respaldo: ${DentalAPI.escapeHtml(error.message)}</p>`;
  } finally {
    createBackupBtn.textContent = "Crear respaldo";
    createBackupBtn.disabled = false;
  }
});

loadBackupSettings();

loadBackupPage().catch((error) => {
  backupTable.innerHTML = `<p class="empty-state">No se pudieron cargar respaldos: ${DentalAPI.escapeHtml(error.message)}</p>`;
  backupStatusTitle.textContent = "No se pudo leer el estado";
  backupStatusText.textContent = "Revisa que el servidor local este levantado y vuelve a intentar.";
});
