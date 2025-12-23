@echo off
TITLE Oman Swiss Army Runner - Build Tool
CLS

echo ==========================================
echo   Oman Swiss Army Runner - Build Script
echo ==========================================
echo.

:: Cek apakah 'neu' command tersedia
WHERE neu >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Neutralino CLI 'neu' tidak ditemukan.
    echo Silakan install terlebih dahulu dengan perintah:
    echo npm install -g @neujs/neu
    echo.
    pause
    exit /b 1
)

echo [1/2] Memperbarui Neutralino binaries dan client...
call neu update
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Gagal melakukan update binaries.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/2] Melakukan Build Release...
call neu build
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build gagal. Cek pesan error di atas.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ==========================================
echo   BUILD SUKSES!
echo ==========================================
echo File aplikasi ada di dalam folder "dist"
echo.

:: Membuka folder dist secara otomatis
if exist dist (
    start dist
)

pause
