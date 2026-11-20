# Builds every launcher icon from the owner's supplied image
# (assets/brand/launcher-source.jpg) without redrawing it: the image is only
# resized (high-quality bicubic). Windows PowerShell 5.1 / System.Drawing.
#
#   powershell -ExecutionPolicy Bypass -File scripts/make-launcher-icons.ps1
#
# Outputs
#   assets/icon.png                                 desktop window/app icon, 512 px
#   android/.../mipmap-<dpi>/ic_launcher.png        legacy icon (whole image)
#   android/.../mipmap-<dpi>/ic_launcher_round.png  same image
#   android/.../mipmap-<dpi>/ic_launcher_foreground.png
#       adaptive foreground: the whole image at 68% of the 108 dp canvas, so
#       its rounded-square artwork stays inside the 66 dp safe zone on every
#       launcher mask. The background layer is black, the same as the image's
#       own black surround, so nothing new is added.
param([string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$src = Join-Path $Root 'assets\brand\launcher-source.jpg'
$img = [System.Drawing.Image]::FromFile($src)

function Save-Scaled([int]$canvas, [double]$scale, [string]$out, [System.Drawing.Color]$bg) {
  $bmp = New-Object System.Drawing.Bitmap $canvas, $canvas, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.Clear($bg)
  # Fit the whole image (it is nearly square) without changing its proportions.
  $w = $canvas * $scale
  $h = $w * $img.Height / $img.Width
  if ($h -gt $canvas * $scale) { $h = $canvas * $scale; $w = $h * $img.Width / $img.Height }
  $x = ($canvas - $w) / 2; $y = ($canvas - $h) / 2
  $attrs = New-Object System.Drawing.Imaging.ImageAttributes
  $attrs.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
  $rx = [int][Math]::Round($x); $ry = [int][Math]::Round($y); $rw = [int][Math]::Round($w); $rh = [int][Math]::Round($h)
  $rect = New-Object System.Drawing.Rectangle -ArgumentList $rx, $ry, $rw, $rh
  $unit = [System.Drawing.GraphicsUnit]::Pixel
  $g.DrawImage($img, $rect, 0, 0, $img.Width, $img.Height, $unit, $attrs)
  $g.Dispose()
  New-Item -ItemType Directory -Force (Split-Path -Parent $out) | Out-Null
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$black = [System.Drawing.Color]::FromArgb(255, 0, 0, 0)
Save-Scaled 512 1.0 (Join-Path $Root 'assets\icon.png') $black

$res = Join-Path $Root 'android\app\src\main\res'
$dpis = @{ 'mdpi' = 1.0; 'hdpi' = 1.5; 'xhdpi' = 2.0; 'xxhdpi' = 3.0; 'xxxhdpi' = 4.0 }
foreach ($d in $dpis.Keys) {
  $f = $dpis[$d]
  $dir = Join-Path $res "mipmap-$d"
  Save-Scaled ([int](48 * $f)) 1.0 (Join-Path $dir 'ic_launcher.png') $black
  Save-Scaled ([int](48 * $f)) 1.0 (Join-Path $dir 'ic_launcher_round.png') $black
  Save-Scaled ([int](108 * $f)) 0.68 (Join-Path $dir 'ic_launcher_foreground.png') $black
}
$img.Dispose()
Write-Output 'Launcher icons written.'
