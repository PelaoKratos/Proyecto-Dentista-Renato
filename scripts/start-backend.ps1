param(
  [int]$Port = 8000
)

$Root = Split-Path -Parent $PSScriptRoot
$Server = Join-Path $Root 'backend\server.py'
$LocalPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$Candidates = @(
  (Join-Path $Root '.venv\Scripts\python.exe'),
  $LocalPython
)

foreach ($Candidate in $Candidates) {
  if (Test-Path -LiteralPath $Candidate) {
    & $Candidate $Server $Port
    exit $LASTEXITCODE
  }
}

$PyLauncher = Get-Command py -ErrorAction SilentlyContinue
if ($PyLauncher) {
  & py -3 --version *> $null
  if ($LASTEXITCODE -eq 0) {
    & py -3 $Server $Port
    exit $LASTEXITCODE
  }
}

$PythonCommand = Get-Command python -ErrorAction SilentlyContinue
if ($PythonCommand -and $PythonCommand.Source -notlike '*WindowsApps*') {
  & python $Server $Port
  exit $LASTEXITCODE
}

throw 'No se encontro Python. Instala Python 3.12 o superior y vuelve a ejecutar este script.'
