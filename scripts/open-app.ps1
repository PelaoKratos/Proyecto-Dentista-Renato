param(
  [int]$Port = 8000
)

$Root = Split-Path -Parent $PSScriptRoot
$Url = "http://127.0.0.1:$Port/"
$HealthUrl = "http://127.0.0.1:$Port/api/health"

function Test-ConsultaDentalServer {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Test-ConsultaDentalServer)) {
  $startScript = Join-Path $Root 'scripts\start-backend.ps1'
  Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -WorkingDirectory $Root -ArgumentList @(
    '-ExecutionPolicy', 'Bypass',
    '-File', $startScript,
    '-Port', $Port
  )

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
