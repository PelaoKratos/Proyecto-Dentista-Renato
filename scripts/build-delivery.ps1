$ErrorActionPreference = 'Stop'
$Root = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\')
$Target = Join-Path $Root 'Entrega-cliente'
$Stage = Join-Path $Root '.Entrega-cliente-build'

function Assert-ExpectedDirectory([string]$Path, [string]$ExpectedName) {
  $Expected = [System.IO.Path]::GetFullPath((Join-Path $Root $ExpectedName)).TrimEnd('\')
  $Actual = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
  if (-not $Actual.Equals($Expected, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Ruta de entrega inesperada: $Actual"
  }
  if (Test-Path -LiteralPath $Actual) {
    $Item = Get-Item -LiteralPath $Actual -Force
    if (($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "La ruta de entrega no puede ser un enlace: $Actual"
    }
  }
}

Assert-ExpectedDirectory $Target 'Entrega-cliente'
Assert-ExpectedDirectory $Stage '.Entrega-cliente-build'
if (Test-Path -LiteralPath $Stage) {
  throw "Quedo una carpeta temporal de una entrega anterior: $Stage. Revisala antes de volver a generar."
}

$Python = Get-Command python -ErrorAction SilentlyContinue
$PythonArgs = @()
if (-not $Python -or $Python.Source -like '*WindowsApps*') {
  $Python = Get-Command py -ErrorAction SilentlyContinue
  $PythonArgs = @('-3')
}
if (-not $Python) { throw 'Se necesita Python para generar la base limpia de la entrega.' }
$DatabaseTool = Join-Path $Root 'scripts\create-delivery-db.py'
$SourceDb = Join-Path $Root 'data\consulta_dental.sqlite3'
$Schema = Join-Path $Root 'backend\schema.sql'

New-Item -ItemType Directory -Path $Stage | Out-Null
try {
  foreach ($File in (Get-ChildItem -LiteralPath $Root -File -Filter '*.html')) {
    Copy-Item -LiteralPath $File.FullName -Destination (Join-Path $Stage $File.Name)
  }
  foreach ($Name in @('abrir_consulta_dental.ps1', 'iniciar_backend.ps1')) {
    Copy-Item -LiteralPath (Join-Path $Root $Name) -Destination (Join-Path $Stage $Name)
  }
  Copy-Item -LiteralPath (Join-Path $Root 'assets') -Destination $Stage -Recurse
  New-Item -ItemType Directory -Path (Join-Path $Stage 'backend') | Out-Null
  foreach ($File in (Get-ChildItem -LiteralPath (Join-Path $Root 'backend') -File | Where-Object { $_.Extension -in '.py', '.sql' })) {
    Copy-Item -LiteralPath $File.FullName -Destination (Join-Path (Join-Path $Stage 'backend') $File.Name)
  }
  New-Item -ItemType Directory -Path (Join-Path $Stage 'scripts') | Out-Null
  foreach ($Name in @(
    'open-app.ps1',
    'start-backend.ps1',
    'install-desktop-shortcut.ps1',
    'create-app-icon.ps1',
    'verify-backup.py',
    'create-delivery-db.py'
  )) {
    Copy-Item -LiteralPath (Join-Path (Join-Path $Root 'scripts') $Name) -Destination (Join-Path (Join-Path $Stage 'scripts') $Name)
  }
  foreach ($Name in @('Instalar.ps1', 'INSTALAR.cmd', 'LEEME-ENTREGA.txt')) {
    Copy-Item -LiteralPath (Join-Path (Join-Path $Root 'installer') $Name) -Destination (Join-Path $Stage $Name)
  }
  foreach ($Folder in @('data', 'backups', 'media\pacientes')) {
    New-Item -ItemType Directory -Path (Join-Path $Stage $Folder) -Force | Out-Null
  }

  $PackagedDb = Join-Path $Stage 'data\consulta_dental.sqlite3'
  & $Python.Source @PythonArgs $DatabaseTool build --source $SourceDb --catalog-json (Join-Path $Root 'installer\catalogo-base.json') --schema $Schema --database $PackagedDb
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la base limpia de la entrega.' }

  $Unexpected = Get-ChildItem -LiteralPath $Stage -Recurse -File | Where-Object {
    ($_.Extension -in '.sqlite3', '.pyc', '.log', '.zip' -and $_.FullName -ne $PackagedDb) -or
    $_.Name -eq 'admin-auth.json'
  }
  if ($Unexpected) {
    throw "La entrega contiene archivos de datos inesperados: $($Unexpected.FullName -join ', ')"
  }

  if (Test-Path -LiteralPath $Target) {
    $Links = @(Get-ChildItem -LiteralPath $Target -Recurse -Force | Where-Object { ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 })
    if ($Links) { throw 'La entrega anterior contiene enlaces; no se reemplazo.' }
    foreach ($Folder in @('backups', 'media')) {
      $Existing = Join-Path $Target $Folder
      if (Test-Path -LiteralPath $Existing) {
        $Files = Get-ChildItem -LiteralPath $Existing -Recurse -File
        if ($Files) { throw "La entrega anterior contiene datos que deben conservarse: $Existing" }
      }
    }
    $ExistingData = Join-Path $Target 'data'
    if (Test-Path -LiteralPath $ExistingData) {
      $DataFiles = @(Get-ChildItem -LiteralPath $ExistingData -Recurse -File)
      $UnexpectedData = @($DataFiles | Where-Object { $_.FullName -ne (Join-Path $ExistingData 'consulta_dental.sqlite3') })
      if ($UnexpectedData) { throw "La entrega anterior contiene datos inesperados: $($UnexpectedData.FullName -join ', ')" }
      if ($DataFiles.Count -eq 1) {
        & $Python.Source @PythonArgs $DatabaseTool verify --database $DataFiles[0].FullName
        if ($LASTEXITCODE -ne 0) { throw 'La entrega anterior contiene registros clínicos; no se reemplazó.' }
      }
    }
    Assert-ExpectedDirectory $Target 'Entrega-cliente'
    Remove-Item -LiteralPath $Target -Recurse -Force
  }
  Assert-ExpectedDirectory $Stage '.Entrega-cliente-build'
  Move-Item -LiteralPath $Stage -Destination $Target
  $FileCount = (Get-ChildItem -LiteralPath $Target -Recurse -File | Measure-Object).Count
  Write-Output "Entrega actualizada: $Target"
  Write-Output "Archivos incluidos: $FileCount"
  Write-Output 'Base nueva: cero pacientes, citas, tratamientos de pacientes, pagos y archivos; catalogo base listo para editar.'
} catch {
  if (Test-Path -LiteralPath $Stage) {
    Assert-ExpectedDirectory $Stage '.Entrega-cliente-build'
    Remove-Item -LiteralPath $Stage -Recurse -Force
  }
  throw
}
