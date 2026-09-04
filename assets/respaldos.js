const createBackupBtn = document.querySelector("#createBackupBtn");
const backupTable = document.querySelector("#backupTable");
const backupStats = document.querySelector("#backupStats");
const backupStatusTitle = document.querySelector("#backupStatusTitle");
const backupStatusText = document.querySelector("#backupStatusText");
const backupReminder = document.querySelector("#backupReminder");
const backupIncludeMedia = document.querySelector("#backupIncludeMedia");
const backupRequireKey = document.querySelector("#backupRequireKey");
const saveBackupSettings = document.querySelector("#saveBackupSettings");
const backupSettingsStatus = document.querySelector("#backupSettingsStatus");
const SETTINGS_KEY = "consultaDental.backupSettings";

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
    ? `La ultima copia pesa ${fileSize(latest.size)} y fue creada el ${backupDate(latest.created_at)}.`
    : "Crea una copia antes de usar la aplicacion con pacientes reales o antes de mover el computador.";

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

function renderBackups(backups) {
  backupTable.innerHTML = `
    <div class="records-row records-head"><span>Archivo</span><span>Fecha</span><span>Tamano</span><span>Accion</span></div>
    ${
      backups
        .map(
          (backup) => `
            <div class="records-row">
              <span>${DentalAPI.escapeHtml(backup.name)}</span>
              <span>${backupDate(backup.created_at)}</span>
              <span>${fileSize(backup.size)}</span>
              <span><a class="inline-link" href="${DentalAPI.escapeHtml(backup.download_url || backup.backup_path)}" download>Descargar</a></span>
            </div>
          `
        )
        .join("") || `<p class="empty-state">Todavia no hay respaldos creados.</p>`
    }
  `;
}

async function loadBackupPage() {
  const [status, backups] = await Promise.all([DentalAPI.get("/api/backup-status"), DentalAPI.get("/api/backups")]);
  renderStatus(status);
  renderBackups(backups);
}

function loadBackupSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return;
  try {
    const settings = JSON.parse(raw);
    backupReminder.checked = Boolean(settings.reminder);
    backupIncludeMedia.checked = settings.includeMedia !== false;
    backupRequireKey.checked = Boolean(settings.requireKey);
  } catch {
    backupSettingsStatus.textContent = "No se pudo leer la configuracion guardada.";
  }
}

saveBackupSettings.addEventListener("click", () => {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      reminder: backupReminder.checked,
      includeMedia: backupIncludeMedia.checked,
      requireKey: backupRequireKey.checked
    })
  );
  backupSettingsStatus.textContent = "Configuracion guardada en este computador.";
});

createBackupBtn.addEventListener("click", async () => {
  createBackupBtn.textContent = "Creando...";
  createBackupBtn.disabled = true;
  try {
    await DentalAPI.post("/api/backups", {});
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
