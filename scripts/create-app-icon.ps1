Add-Type -AssemblyName System.Drawing

$Root = Split-Path -Parent $PSScriptRoot
$IconPath = Join-Path $Root 'assets\icons\app-icon.ico'
$Size = 256
$Bitmap = New-Object System.Drawing.Bitmap $Size, $Size
$Graphics = [System.Drawing.Graphics]::FromImage($Bitmap)
$Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$Rect = New-Object System.Drawing.Rectangle 0, 0, $Size, $Size
$Brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $Rect, ([System.Drawing.Color]::FromArgb(0,150,136)), ([System.Drawing.Color]::FromArgb(37,99,235)), 45
$Graphics.FillRectangle($Brush, $Rect)

$White = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$Teal = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(0,150,136))
$Path = New-Object System.Drawing.Drawing2D.GraphicsPath
$Path.AddBezier(78, 72, 96, 54, 112, 64, 128, 72)
$Path.AddBezier(128, 72, 144, 64, 160, 54, 178, 72)
$Path.AddBezier(178, 72, 204, 98, 184, 158, 166, 196)
$Path.AddBezier(166, 196, 152, 224, 140, 174, 128, 162)
$Path.AddBezier(128, 162, 116, 174, 104, 224, 90, 196)
$Path.AddBezier(90, 196, 72, 158, 52, 98, 78, 72)
$Graphics.FillPath($White, $Path)

$Graphics.FillRectangle($Teal, 116, 88, 24, 76)
$Graphics.FillRectangle($Teal, 90, 114, 76, 24)

$Font = New-Object System.Drawing.Font 'Segoe UI', 34, ([System.Drawing.FontStyle]::Bold)
$Format = New-Object System.Drawing.StringFormat
$Format.Alignment = [System.Drawing.StringAlignment]::Center
$Format.LineAlignment = [System.Drawing.StringAlignment]::Center
$Graphics.DrawString('DR', $Font, $White, (New-Object System.Drawing.RectangleF 0, 202, 256, 44), $Format)

$Handle = $Bitmap.GetHicon()
try {
  $Icon = [System.Drawing.Icon]::FromHandle($Handle)
  $Stream = [System.IO.File]::Open($IconPath, [System.IO.FileMode]::Create)
  try { $Icon.Save($Stream) } finally { $Stream.Dispose(); $Icon.Dispose() }
} finally {
  $Graphics.Dispose()
  $Bitmap.Dispose()
  $Brush.Dispose()
  $White.Dispose()
  $Teal.Dispose()
  $Font.Dispose()
}
