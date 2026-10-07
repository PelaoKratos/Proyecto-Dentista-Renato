@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Instalar.ps1"
if errorlevel 1 (
  echo.
  echo La instalacion no se completo. Revisa el error anterior.
  pause
)
