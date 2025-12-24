@echo off
TITLE Oman Swiss Army Runner - Build Tool
CLS

echo ==========================================
echo   Oman Swiss Army Runner - Build Script
echo ==========================================
echo.

echo [1/2] Memperbarui Neutralino binaries dan client...
call npm run update
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Gagal melakukan update binaries.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/2] Melakukan Build Release...
call npm run build
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
