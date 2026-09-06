param(
  [int]$Port = 8000
)

$Root = Split-Path -Parent $PSScriptRoot
$Desktop = [Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $Desktop 'Consulta Dental Renato.lnk'
$OpenScript = Join-Path $Root 'scripts\open-app.ps1'
$IconPath = Join-Path $Root 'assets\icons\app-icon.ico'

if (-not (Test-Path -LiteralPath $OpenScript)) {
  throw "No se encontro el script de apertura: $OpenScript"
}

if (-not (Test-Path -LiteralPath $IconPath)) {
  & (Join-Path $Root 'scripts\create-app-icon.ps1')
}

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = 'powershell.exe'
$Shortcut.Arguments = "-ExecutionPolicy Bypass -File `"$OpenScript`" -Port $Port"
$Shortcut.WorkingDirectory = $Root
$Shortcut.IconLocation = $IconPath
$Shortcut.Description = 'Abrir Consulta Dental Renato'
$Shortcut.Save()

Write-Output $ShortcutPath
