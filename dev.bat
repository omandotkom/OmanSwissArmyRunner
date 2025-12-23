@echo off
TITLE Oman Swiss Army Runner - DEV MODE
CLS

echo ==========================================
echo   Oman Swiss Army Runner - DEV MODE
echo ==========================================
echo.

:: Cek apakah 'neu' command tersedia
WHERE neu >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Neutralino CLI 'neu' tidak ditemukan.
    echo Silakan install terlebih dahulu dengan perintah:
    echo npm install -g @neutralinojs/neu
    echo.
    pause
    exit /b 1
)

echo Menjalankan aplikasi dalam mode Watch...
echo Tekan CTRL+C di sini untuk berhenti.
echo.

call neu run

pause
