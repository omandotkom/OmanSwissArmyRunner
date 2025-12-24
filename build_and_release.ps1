# Script Build & Release Otomatis untuk Oman Swiss Army Runner
# Requires: GitHub CLI ('gh') installed and authenticated ('gh auth login')

$ErrorActionPreference = "Stop"

function Pause-And-Exit {
    param (
        [int]$ExitCode = 0
    )
    Write-Host "`nPress Enter to exit..." -NoNewline
    $null = Read-Host
    exit $ExitCode
}

try {
    # 1. Baca Konfigurasi Versi
    Write-Host "Reading version from neutralino.config.json..." -ForegroundColor Cyan
    try {
        $config = Get-Content -Path ".\neutralino.config.json" -Raw | ConvertFrom-Json
        $version = $config.version
        $tagName = "v$version"
        Write-Host "Detected Version: $version (Tag: $tagName)" -ForegroundColor Green
    } catch {
        Write-Error "Failed to read neutralino.config.json. Make sure the file exists and is valid JSON."
        throw $_
    }

    # 2. Jalankan Build
    Write-Host "`nStarting Build Process..." -ForegroundColor Cyan
    try {
        # Hapus folder dist lama jika ada untuk memastikan bersih
        if (Test-Path ".\dist") { Remove-Item ".\dist" -Recurse -Force }
        
        # Jalankan perintah build dari package.json
        cmd /c "npm run build"
        
        if ($LASTEXITCODE -ne 0) { throw "Build command failed with exit code $LASTEXITCODE." }
        Write-Host "Build Successful!" -ForegroundColor Green
    } catch {
        Write-Error "Build process failed: $_"
        throw $_
    }

    # 3. Validasi GitHub CLI
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-Error "GitHub CLI ('gh') is not installed. Please install it from https://cli.github.com/ and run 'gh auth login'."
        throw "GitHub CLI missing"
    }

    # 3.b Package for Release (ZIP) - FIX: Bundle .exe + resources.neu
    Write-Host "`nPackaging for Windows Release..." -ForegroundColor Cyan
    $binDir = ".\dist\OmanRunner"
    # Pastikan nama binary sesuai dengan config (OmanRunner) dan output neutralino
    # Neutralino biasanya output: dist/BinaryName/BinaryName-win_x64.exe
    $exeSource = "$binDir\OmanRunner-win_x64.exe"
    $resSource = "$binDir\resources.neu"

    if (-not (Test-Path $exeSource)) { throw "Critical file missing: $exeSource" }
    if (-not (Test-Path $resSource)) { throw "Critical file missing: $resSource" }

    # Ganti nama .exe agar lebih user friendly saat diekstrak (Opsional, tapi bagus)
    # Kita copy ke temp folder untuk zipping
    $tempZipDir = ".\dist\temp_zip_stage"
    if (Test-Path $tempZipDir) { Remove-Item $tempZipDir -Recurse -Force }
    New-Item -ItemType Directory -Path $tempZipDir | Out-Null
    
    Copy-Item $exeSource -Destination "$tempZipDir\OmanRunner.exe"
    Copy-Item $resSource -Destination "$tempZipDir\resources.neu"
    
    # WebView2Loader.dll is embedded in newer Neutralino, but if present in folder, copy it too.
    if (Test-Path "$binDir\WebView2Loader.dll") {
        Copy-Item "$binDir\WebView2Loader.dll" -Destination $tempZipDir
    }

    $zipName = "OmanSwissArmyRunner-Win64-$version.zip"
    $zipPath = ".\dist\$zipName"
    
    Write-Host "Zipping to $zipPath..."
    Compress-Archive -Path "$tempZipDir\*" -DestinationPath $zipPath -Force
    
    # Cleanup temp
    Remove-Item $tempZipDir -Recurse -Force

    Write-Host "Created bundle: $zipPath" -ForegroundColor Green

    # 4. Kumpulkan File Hasil Build (Hanya upload ZIP bundle ini)
    $filePaths = @(Resolve-Path $zipPath)

    Write-Host "`nFound artifacts to upload:" -ForegroundColor Yellow
    $filePaths | ForEach-Object { Write-Host " - $_" }

    # 5. Push ke GitHub Release
    Write-Host "`nChecking GitHub Release status for $tagName..." -ForegroundColor Cyan

    # Cek apakah release sudah ada dengan cara yang lebih robust
    # Kita tangkap outputnya. Jika error (exit code != 0), berarti belum ada.
    $checkProc = Start-Process gh -ArgumentList "release view $tagName" -NoNewWindow -PassThru -Wait -RedirectStandardError "$env:TEMP\gh_err.log" -RedirectStandardOutput "$env:TEMP\gh_out.log"
    
    if ($checkProc.ExitCode -eq 0) {
        Write-Host "Release $tagName already exists. Uploading/Overwriting assets..." -ForegroundColor Yellow
        # Upload aset ke release yang sudah ada (clobber = overwrite)
        gh release upload $tagName $filePaths --clobber
    } else {
        Write-Host "Release $tagName not found (creating new)..." -ForegroundColor Yellow
        # Buat release baru dan upload file sekaligus
        gh release create $tagName $filePaths --title "Release $tagName" --generate-notes
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host "`nSUCCESS! Release $tagName has been published/updated." -ForegroundColor Green
        Write-Host "View at: https://github.com/omandotkom/OmanSwissArmyRunner/releases/tag/$tagName"
    } else {
        throw "Failed to publish release (gh exited with $LASTEXITCODE)."
    }

} catch {
    Write-Host "`n[ERROR] An error occurred during the process:" -ForegroundColor Red
    Write-Error $_
    Pause-And-Exit -ExitCode 1
}

Pause-And-Exit -ExitCode 0