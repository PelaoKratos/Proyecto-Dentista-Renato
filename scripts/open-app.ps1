param(
  [int]$Port = 8000
)

$Root = Split-Path -Parent $PSScriptRoot
$Url = "http://127.0.0.1:$Port/"
$HealthUrl = "http://127.0.0.1:$Port/api/health"
$PowerShellPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'

function Test-ConsultaDentalServer {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Test-Path -LiteralPath $PowerShellPath)) {
  throw "No se encontro PowerShell en la ruta esperada: $PowerShellPath"
}

if (-not (Test-ConsultaDentalServer)) {
  $startScript = Join-Path $Root 'scripts\start-backend.ps1'
  Start-Process -FilePath $PowerShellPath -WindowStyle Hidden -WorkingDirectory $Root -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -Port $Port"

  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-ConsultaDentalServer) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    throw 'No se pudo iniciar el servidor local de Consulta Dental.'
  }
}

Start-Process $Url
