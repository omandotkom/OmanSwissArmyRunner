# Script Build & Release Otomatis untuk Oman Swiss Army Runner
# Requires: GitHub CLI ('gh') installed and authenticated ('gh auth login')

$ErrorActionPreference = "Stop"

# 1. Baca Konfigurasi Versi
Write-Host "Reading version from neutralino.config.json..." -ForegroundColor Cyan
try {
    $config = Get-Content -Path ".\neutralino.config.json" -Raw | ConvertFrom-Json
    $version = $config.version
    $tagName = "v$version"
    Write-Host "Detected Version: $version (Tag: $tagName)" -ForegroundColor Green
} catch {
    Write-Error "Failed to read neutralino.config.json. Make sure the file exists and is valid JSON."
    exit 1
}

# 2. Jalankan Build
Write-Host "`nStarting Build Process..." -ForegroundColor Cyan
try {
    # Hapus folder dist lama jika ada untuk memastikan bersih
    if (Test-Path ".\dist") { Remove-Item ".\dist" -Recurse -Force }
    
    # Jalankan perintah build dari package.json
    cmd /c "npm run build"
    
    if ($LASTEXITCODE -ne 0) { throw "Build command failed." }
    Write-Host "Build Successful!" -ForegroundColor Green
} catch {
    Write-Error "Build process failed: $_"
    exit 1
}

# 3. Validasi GitHub CLI
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error "GitHub CLI ('gh') is not installed. Please install it from https://cli.github.com/ and run 'gh auth login'."
    exit 1
}

# 4. Kumpulkan File Hasil Build
$distFiles = Get-ChildItem ".\dist\*" -Include *.exe, *.zip, *.deb, *.AppImage, *.dmg
if ($distFiles.Count -eq 0) {
    Write-Error "No build artifacts found in ./dist folder."
    exit 1
}
$filePaths = $distFiles | ForEach-Object { $_.FullName }

Write-Host "`nFound artifacts to upload:" -ForegroundColor Yellow
$distFiles | ForEach-Object { Write-Host " - $($_.Name)" }

# 5. Push ke GitHub Release
Write-Host "`nChecking GitHub Release status for $tagName..." -ForegroundColor Cyan

# Cek apakah release sudah ada
$releaseExists = $false
try {
    gh release view $tagName | Out-Null
    $releaseExists = $true
} catch {
    $releaseExists = $false
}

if ($releaseExists) {
    Write-Host "Release $tagName already exists. Uploading/Overwriting assets..." -ForegroundColor Yellow
    # Upload aset ke release yang sudah ada (clobber = overwrite)
    gh release upload $tagName $filePaths --clobber
} else {
    Write-Host "Creating new release $tagName..." -ForegroundColor Yellow
    # Buat release baru dan upload file sekaligus
    gh release create $tagName $filePaths --title "Release $tagName" --generate-notes
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nSUCCESS! Release $tagName has been published/updated." -ForegroundColor Green
    Write-Host "View at: https://github.com/omandotkom/OmanSwissArmyRunner/releases/tag/$tagName"
} else {
    Write-Error "Failed to publish release."
    exit 1
}
