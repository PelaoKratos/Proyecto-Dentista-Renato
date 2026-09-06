$Root = Split-Path -Parent $PSScriptRoot
$LocalPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$Candidates = @(
  (Join-Path $Root '.venv\Scripts\python.exe'),
  $LocalPython
)

foreach ($Candidate in $Candidates) {
  if (Test-Path -LiteralPath $Candidate) {
    Push-Location $Root
    try { & $Candidate -m unittest discover; exit $LASTEXITCODE } finally { Pop-Location }
  }
}

$PyLauncher = Get-Command py -ErrorAction SilentlyContinue
if ($PyLauncher) {
  & py -3 --version *> $null
  if ($LASTEXITCODE -eq 0) {
    Push-Location $Root
    try { & py -3 -m unittest discover; exit $LASTEXITCODE } finally { Pop-Location }
  }
}

$PythonCommand = Get-Command python -ErrorAction SilentlyContinue
if ($PythonCommand -and $PythonCommand.Source -notlike '*WindowsApps*') {
  Push-Location $Root
  try { & python -m unittest discover; exit $LASTEXITCODE } finally { Pop-Location }
}

throw 'No se encontro Python para ejecutar pruebas backend.'
