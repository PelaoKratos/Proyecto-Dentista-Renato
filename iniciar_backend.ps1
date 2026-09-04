$LocalPython = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$Candidates = @(
  ".\.venv\Scripts\python.exe",
  $LocalPython
)

foreach ($Candidate in $Candidates) {
  if (Test-Path -LiteralPath $Candidate) {
    & $Candidate ".\backend\server.py"
    exit $LASTEXITCODE
  }
}

$PyLauncher = Get-Command py -ErrorAction SilentlyContinue
if ($PyLauncher) {
  & py -3 --version *> $null
  if ($LASTEXITCODE -eq 0) {
    & py -3 ".\backend\server.py"
    exit $LASTEXITCODE
  }
}

$PythonCommand = Get-Command python -ErrorAction SilentlyContinue
if ($PythonCommand -and $PythonCommand.Source -notlike "*WindowsApps*") {
  & python ".\backend\server.py"
  exit $LASTEXITCODE
}

throw "No se encontro Python. Instala Python 3.12 o superior y vuelve a ejecutar este script."
