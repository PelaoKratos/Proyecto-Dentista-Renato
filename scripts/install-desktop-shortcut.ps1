param(
  [int]$Port = 8000
)

$Root = Split-Path -Parent $PSScriptRoot
$Desktop = [Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $Desktop 'Consulta Dental Renato.lnk'
$OpenScript = Join-Path $Root 'scripts\open-app.ps1'
$IconPath = Join-Path $Root 'assets\icons\app-icon.ico'
$PowerShellPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'

if (-not (Test-Path -LiteralPath $OpenScript)) {
  throw "No se encontro el script de apertura: $OpenScript"
}

if (-not (Test-Path -LiteralPath $PowerShellPath)) {
  throw "No se encontro PowerShell en la ruta esperada: $PowerShellPath"
}

if (-not (Test-Path -LiteralPath $IconPath)) {
  & (Join-Path $Root 'scripts\create-app-icon.ps1')
}

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $PowerShellPath
$Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$OpenScript`" -Port $Port"
$Shortcut.WorkingDirectory = $Root
$Shortcut.IconLocation = "$IconPath,0"
$Shortcut.Description = 'Abrir Consulta Dental Renato'
$Shortcut.Save()

Write-Output $ShortcutPath
