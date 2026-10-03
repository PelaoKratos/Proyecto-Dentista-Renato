param(
  [int]$Port = 8000
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Url = "http://127.0.0.1:$Port/"
$HealthUrl = "http://127.0.0.1:$Port/api/health"
$ServerScript = Join-Path $Root 'backend\server.py'
$IconPath = Join-Path $Root 'assets\icons\app-icon.ico'
$PowerShellPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$MutexName = "Local\ConsultaDentalRenato-$Port"
$CreatedNew = $false
$Mutex = [System.Threading.Mutex]::new($true, $MutexName, [ref]$CreatedNew)

if (-not $CreatedNew) {
  Start-Process -FilePath $Url
  $Mutex.Dispose()
  exit 0
}

$script:ServerProcess = $null
$NotifyIcon = $null
$Menu = $null
$Context = $null

function Test-ConsultaDentalServer {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Get-ManagedServerProcess {
  try {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop | Select-Object -First 1
    if (-not $listener) { return $null }

    $processInfo = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction Stop
    if (-not $processInfo.CommandLine -or $processInfo.CommandLine.IndexOf($ServerScript, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
      return $null
    }

    return Get-Process -Id $listener.OwningProcess -ErrorAction Stop
  } catch {
    return $null
  }
}

function Start-ConsultaDentalServer {
  if (-not (Test-Path -LiteralPath $ServerScript)) {
    throw "No se encontro el backend: $ServerScript"
  }

  $quotedServer = [char]34 + $ServerScript + [char]34
  $Candidates = @(
    (Join-Path $Root '.venv\Scripts\python.exe'),
    (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe')
  )

  foreach ($Candidate in $Candidates) {
    if (Test-Path -LiteralPath $Candidate) {
      $script:ServerProcess = Start-Process -FilePath $Candidate -ArgumentList "$quotedServer $Port" -WorkingDirectory $Root -WindowStyle Hidden -PassThru
      break
    }
  }

  if (-not $script:ServerProcess) {
    $PyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($PyLauncher) {
      $script:ServerProcess = Start-Process -FilePath $PyLauncher.Source -ArgumentList "-3 $quotedServer $Port" -WorkingDirectory $Root -WindowStyle Hidden -PassThru
    }
  }

  if (-not $script:ServerProcess) {
    $PythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($PythonCommand -and $PythonCommand.Source -notlike '*WindowsApps*') {
      $script:ServerProcess = Start-Process -FilePath $PythonCommand.Source -ArgumentList "$quotedServer $Port" -WorkingDirectory $Root -WindowStyle Hidden -PassThru
    }
  }

  if (-not $script:ServerProcess) {
    throw 'No se encontro Python. Instala Python 3.12 o superior y vuelve a ejecutar este acceso directo.'
  }

  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-ConsultaDentalServer) { return }
    if ($script:ServerProcess.HasExited) { break }
  }

  throw 'No se pudo iniciar el servidor local de Consulta Dental.'
}

try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing

  if (-not (Test-Path -LiteralPath $PowerShellPath)) {
    throw "No se encontro PowerShell en la ruta esperada: $PowerShellPath"
  }

  if (Test-ConsultaDentalServer) {
    $script:ServerProcess = Get-ManagedServerProcess
  } else {
    Start-ConsultaDentalServer
  }

  $Menu = New-Object System.Windows.Forms.ContextMenuStrip
  $OpenItem = $Menu.Items.Add('Abrir Consulta Dental')
  $Separator = New-Object System.Windows.Forms.ToolStripSeparator
  [void]$Menu.Items.Add($Separator)

  if ($script:ServerProcess) {
    $ExitItem = $Menu.Items.Add('Salir y detener el servidor')
  } else {
    $ExitItem = $Menu.Items.Add('Salir (servidor iniciado aparte)')
    $ExitItem.ToolTipText = 'El servidor activo no pertenece a esta aplicación y seguirá ejecutándose.'
  }

  $Context = New-Object System.Windows.Forms.ApplicationContext
  $OpenItem.Add_Click({ Start-Process -FilePath $Url })
  $ExitItem.Add_Click({ $Context.ExitThread() })

  $NotifyIcon = New-Object System.Windows.Forms.NotifyIcon
  if (Test-Path -LiteralPath $IconPath) {
    $NotifyIcon.Icon = [System.Drawing.Icon]::new($IconPath)
  } else {
    $NotifyIcon.Icon = [System.Drawing.SystemIcons]::Application
  }
  $NotifyIcon.Text = 'Consulta Dental Renato'
  $NotifyIcon.ContextMenuStrip = $Menu
  $NotifyIcon.Add_DoubleClick({ Start-Process -FilePath $Url })
  $NotifyIcon.Visible = $true

  Start-Process -FilePath $Url
  [System.Windows.Forms.Application]::Run($Context)
} catch {
  [System.Windows.Forms.MessageBox]::Show(
    "No se pudo abrir Consulta Dental.`r`n`r`n$($_.Exception.Message)",
    'Consulta Dental Renato',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
} finally {
  if ($NotifyIcon) {
    $NotifyIcon.Visible = $false
    $NotifyIcon.Dispose()
  }
  if ($Menu) { $Menu.Dispose() }
  if ($Context) { $Context.Dispose() }

  if ($script:ServerProcess -and -not $script:ServerProcess.HasExited) {
    try {
      $script:ServerProcess.Kill()
      [void]$script:ServerProcess.WaitForExit(5000)
    } catch { }
  }

  try { $Mutex.ReleaseMutex() } catch { }
  $Mutex.Dispose()
}