$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Target = Join-Path $Root 'Entrega-cliente'

if (Test-Path -LiteralPath $Target) {
  throw "La carpeta $Target ya existe. Conservala o cambiale el nombre antes de crear otra entrega."
}

New-Item -ItemType Directory -Path $Target -Force | Out-Null
foreach ($File in (Get-ChildItem -LiteralPath $Root -File -Filter '*.html')) {
  Copy-Item -LiteralPath $File.FullName -Destination (Join-Path $Target $File.Name)
}
foreach ($Name in @('abrir_consulta_dental.ps1', 'iniciar_backend.ps1')) {
  Copy-Item -LiteralPath (Join-Path $Root $Name) -Destination (Join-Path $Target $Name)
}

Copy-Item -LiteralPath (Join-Path $Root 'assets') -Destination $Target -Recurse
New-Item -ItemType Directory -Path (Join-Path $Target 'backend') -Force | Out-Null
foreach ($File in (Get-ChildItem -LiteralPath (Join-Path $Root 'backend') -File | Where-Object { $_.Extension -in '.py', '.sql' })) {
  Copy-Item -LiteralPath $File.FullName -Destination (Join-Path $Target 'backend' $File.Name)
}

New-Item -ItemType Directory -Path (Join-Path $Target 'scripts') -Force | Out-Null
foreach ($Name in @(
  'open-app.ps1',
  'start-backend.ps1',
  'install-desktop-shortcut.ps1',
  'create-app-icon.ps1',
  'verify-backup.py'
)) {
  Copy-Item -LiteralPath (Join-Path $Root 'scripts' $Name) -Destination (Join-Path $Target 'scripts' $Name)
}
foreach ($Name in @('Instalar.ps1', 'INSTALAR.cmd', 'LEEME-ENTREGA.txt')) {
  Copy-Item -LiteralPath (Join-Path $Root 'installer' $Name) -Destination (Join-Path $Target $Name)
}
foreach ($Folder in @('data', 'backups', 'media\pacientes')) {
  New-Item -ItemType Directory -Path (Join-Path $Target $Folder) -Force | Out-Null
}

$Excluded = Get-ChildItem -LiteralPath $Target -Recurse -File | Where-Object {
  $_.Extension -in '.sqlite3', '.pyc', '.log', '.zip' -or
  $_.Name -eq 'admin-auth.json'
}
if ($Excluded) {
  throw "La entrega contiene archivos de datos inesperados: $($Excluded.FullName -join ', ')"
}
$FileCount = (Get-ChildItem -LiteralPath $Target -Recurse -File | Measure-Object).Count
Write-Output "Entrega creada: $Target"
Write-Output "Archivos incluidos: $FileCount"
Write-Output 'Carpetas data, backups y media\pacientes vacias.'
