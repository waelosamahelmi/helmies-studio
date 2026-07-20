$ffmpeg = (Get-Command ffmpeg).Source
$public = "C:\Users\Wael Helmi\Documents\Default Project\helmies-studio\public"

# Skip favicons, og-image, apple-touch-icon (they're already small/optimized)
$skipPatterns = @("favicon-", "og-image", "apple-touch-icon", "ico.svg")

# Track converted files for reference updating
$converted = @()

# --- Videos: MP4 → WebM (max 1080p height, VP9, CRF 30, 30fps) ---
$videos = Get-ChildItem -Path $public -Recurse -Include *.mp4 | Where-Object {
  $skip = $false
  foreach ($p in $skipPatterns) { if ($_.Name -match $p) { $skip = $true; break } }
  -not $skip
}

Write-Output "Converting $($videos.Count) videos to WebM..."
foreach ($v in $videos) {
  $out = $v.FullName -replace '\.mp4$', '.webm'
  if (Test-Path $out) { Write-Output "  SKIP (exists): $($v.Name)"; continue }
  Write-Output "  Converting: $($v.Name) ($([math]::Round($v.Length/1MB,1))MB)"
  & $ffmpeg -i $v.FullName -vf "scale=-2:min(1080\,ih)" -c:v libvpx-vp9 -crf 30 -b:v 0 -c:a libopus -b:a 96k -y $out 2>$null
  if (Test-Path $out) {
    $newSize = (Get-Item $out).Length
    Write-Output "    -> $([math]::Round($newSize/1MB,1))MB"
    $converted += [PSCustomObject]@{ old = $v.FullName; new = $out; name = $v.Name }
  }
}

# --- Images: JPG/PNG → WebP (max 1080w, quality 80) ---
$images = Get-ChildItem -Path $public -Recurse -Include *.jpg,*.png | Where-Object {
  $skip = $false
  foreach ($p in $skipPatterns) { if ($_.Name -match $p) { $skip = $true; break } }
  -not $skip
}

Write-Output "`nConverting $($images.Count) images to WebP..."
foreach ($img in $images) {
  $out = $img.FullName -replace '\.(jpg|png)$', '.webp'
  if (Test-Path $out) { Write-Output "  SKIP (exists): $($img.Name)"; continue }
  Write-Output "  Converting: $($img.Name) ($([math]::Round($img.Length/1MB,2))MB)"
  & $ffmpeg -i $img.FullName -vf "scale='min(1080\,iw)':-2" -c:v libwebp -quality 80 -y $out 2>$null
  if (Test-Path $out) {
    $newSize = (Get-Item $out).Length
    Write-Output "    -> $([math]::Round($newSize/1MB,2))MB"
    $converted += [PSCustomObject]@{ old = $img.FullName; new = $out; name = $img.Name }
  }
}

Write-Output "`nDone! Converted $($converted.Count) files."
$converted | ForEach-Object { Write-Output "  $($_.name) -> $([System.IO.Path]::GetFileName($_.new))" }