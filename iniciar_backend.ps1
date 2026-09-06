param(
  [int]$Port = 8000
)

$Root = $PSScriptRoot
& (Join-Path $Root 'scripts\start-backend.ps1') -Port $Port
