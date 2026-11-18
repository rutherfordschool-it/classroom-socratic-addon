Add-Type -AssemblyName System.Drawing
$dir = "c:\Users\Lenovo ThinkPad\.gemini\antigravity-ide\scratch\classroom-socratic-addon\icons"
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force }

$sizes = @(
  @{w=32; h=32; n="icon-32.png"},
  @{w=48; h=48; n="icon-48.png"},
  @{w=96; h=96; n="icon-96.png"},
  @{w=128; h=128; n="icon-128.png"},
  @{w=220; h=140; n="banner-220x140.png"}
)

foreach ($item in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap $item.w, $item.h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(79, 70, 229))
  $target = Join-Path $dir $item.n
  $bmp.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Host "Created $target"
}
