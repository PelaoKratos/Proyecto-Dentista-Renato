param(
  [int]$Port = 8000
)

$Root = $PSScriptRoot
& (Join-Path $Root 'scripts\open-app.ps1') -Port $Port
