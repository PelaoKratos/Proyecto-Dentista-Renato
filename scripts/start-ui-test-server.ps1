$Root = Split-Path -Parent $PSScriptRoot
$Runner = Join-Path $Root 'tests\ui\start-server.py'
$LocalPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$Candidates = @((Join-Path $Root '.venv\Scripts\python.exe'), $LocalPython)
foreach ($Candidate in $Candidates) {
  if (Test-Path -LiteralPath $Candidate) {
    & $Candidate $Runner
    exit $LASTEXITCODE
  }
}
$PyLauncher = Get-Command py -ErrorAction SilentlyContinue
if ($PyLauncher) {
  & py -3 $Runner
  exit $LASTEXITCODE
}
throw 'No se encontro Python para ejecutar la suite de interfaz.'
