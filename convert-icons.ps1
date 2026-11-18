Add-Type -AssemblyName System.Drawing

$src = "C:\Users\Lenovo ThinkPad\.gemini\antigravity-ide\brain\09d0dec6-14db-4d51-9fbf-e3e6f9bbc150\socrates_app_icon_1794075030168.jpg"
$bannerSrc = "C:\Users\Lenovo ThinkPad\.gemini\antigravity-ide\brain\09d0dec6-14db-4d51-9fbf-e3e6f9bbc150\socrates_ai_logo_1794075009466.jpg"

$targetDirs = @(
  "c:\Users\Lenovo ThinkPad\.gemini\antigravity-ide\scratch\classroom-socratic-addon\public\icons",
  "c:\Users\Lenovo ThinkPad\.gemini\antigravity-ide\scratch\classroom-socratic-addon\icons"
)

foreach ($dir in $targetDirs) {
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force }
}

$sizes = @(
  @{w=16; h=16; name="icon-16.png"},
  @{w=32; h=32; name="icon-32.png"},
  @{w=48; h=48; name="icon-48.png"},
  @{w=96; h=96; name="icon-96.png"},
  @{w=128; h=128; name="icon-128.png"},
  @{w=256; h=256; name="icon-256.png"},
  @{w=512; h=512; name="icon-512.png"},
  @{w=512; h=512; name="socrates-logo.png"}
)

$origImg = [System.Drawing.Image]::FromFile($src)

foreach ($size in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap $size.w, $size.h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($origImg, 0, 0, $size.w, $size.h)

  foreach ($dir in $targetDirs) {
    $outPath = Join-Path $dir $size.name
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  $g.Dispose()
  $bmp.Dispose()
}

$origImg.Dispose()

# Create banner 220x140 using the banner source
$origBanner = [System.Drawing.Image]::FromFile($bannerSrc)
$bmpBanner = New-Object System.Drawing.Bitmap 220, 140
$gBanner = [System.Drawing.Graphics]::FromImage($bmpBanner)
$gBanner.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gBanner.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gBanner.DrawImage($origBanner, 0, 0, 220, 140)

foreach ($dir in $targetDirs) {
  $outPath = Join-Path $dir "banner-220x140.png"
  $bmpBanner.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
}
$gBanner.Dispose()
$bmpBanner.Dispose()
$origBanner.Dispose()

Write-Host "Icons generated successfully in all formats!"
