param(
  [string]$Destino = (Join-Path $env:LOCALAPPDATA 'ConsultaDentalRenato'),
  [switch]$SinAccesoDirecto,
  [switch]$NoIniciar
)

$ErrorActionPreference = 'Stop'
$Paquete = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$Destino = [System.IO.Path]::GetFullPath($Destino).TrimEnd('\')

if ($Destino.Equals($Paquete, [System.StringComparison]::OrdinalIgnoreCase) -or
    $Destino.StartsWith($Paquete + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'El destino de instalacion debe estar fuera de la carpeta de entrega.'
}

$Python = $null
$PythonArgs = @()
foreach ($Candidate in @(
  @{ Name = 'py'; Args = @('-3') },
  @{ Name = 'python'; Args = @() }
)) {
  $Command = Get-Command $Candidate.Name -ErrorAction SilentlyContinue
  if (-not $Command -or $Command.Source -like '*WindowsApps*') { continue }
  try {
    $VersionText = & $Command.Source @($Candidate.Args) -c "import sys; print(str(sys.version_info.major) + '.' + str(sys.version_info.minor))" 2>$null
    if ($LASTEXITCODE -ne 0) { continue }
    $Version = [version]("$VersionText.0")
    if ($Version -ge [version]'3.12') {
      $Python = $Command.Source
      $PythonArgs = @($Candidate.Args)
      break
    }
  } catch { }
}

if (-not $Python) {
  throw 'Se necesita Python 3.12 o superior. Instalalo desde python.org, activa Add python.exe to PATH y vuelve a ejecutar INSTALAR.cmd.'
}

foreach ($Required in @(
  'backend\server.py',
  'backend\schema.sql',
  'assets\icons\app-icon.ico',
  'scripts\open-app.ps1',
  'scripts\install-desktop-shortcut.ps1'
)) {
  if (-not (Test-Path -LiteralPath (Join-Path $Paquete $Required))) {
    throw "Falta un archivo de la entrega: $Required"
  }
}

New-Item -ItemType Directory -Path $Destino -Force | Out-Null
foreach ($File in (Get-ChildItem -LiteralPath $Paquete -File -Filter '*.html')) {
  Copy-Item -LiteralPath $File.FullName -Destination (Join-Path $Destino $File.Name) -Force
}
foreach ($Name in @('abrir_consulta_dental.ps1', 'iniciar_backend.ps1')) {
  Copy-Item -LiteralPath (Join-Path $Paquete $Name) -Destination (Join-Path $Destino $Name) -Force
}
foreach ($Folder in @('assets', 'backend', 'scripts')) {
  $SourceFolder = Join-Path $Paquete $Folder
  $TargetFolder = Join-Path $Destino $Folder
  New-Item -ItemType Directory -Path $TargetFolder -Force | Out-Null
  foreach ($File in (Get-ChildItem -LiteralPath $SourceFolder -Recurse -File)) {
    $Relative = $File.FullName.Substring($SourceFolder.Length).TrimStart('\')
    $Target = Join-Path $TargetFolder $Relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $Target) -Force | Out-Null
    Copy-Item -LiteralPath $File.FullName -Destination $Target -Force
  }
}
foreach ($Folder in @('data', 'backups', 'media\pacientes')) {
  New-Item -ItemType Directory -Path (Join-Path $Destino $Folder) -Force | Out-Null
}

$VenvPython = Join-Path $Destino '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $VenvPython)) {
  & $Python @PythonArgs -m venv --without-pip (Join-Path $Destino '.venv')
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $VenvPython)) {
    throw 'No se pudo crear el entorno local de Python.'
  }
}
& $VenvPython -c 'import sqlite3, http.server, hashlib'
if ($LASTEXITCODE -ne 0) {
  throw 'El entorno local de Python no puede cargar los modulos necesarios.'
}

if (-not $SinAccesoDirecto) {
  & (Join-Path $Destino 'scripts\install-desktop-shortcut.ps1')
}
Write-Output "Aplicacion instalada en: $Destino"
Write-Output 'En el primer inicio, crea la clave de administrador. No se copiaron pacientes ni respaldos.'

if (-not $NoIniciar) {
  $PowerShell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $OpenScript = Join-Path $Destino 'scripts\open-app.ps1'
  Start-Process -FilePath $PowerShell -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
    '-File', [char]34 + $OpenScript + [char]34
  ) -WorkingDirectory $Destino -WindowStyle Hidden
}
