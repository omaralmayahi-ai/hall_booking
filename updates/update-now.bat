@echo off
setlocal
:: One-click update: applies the newest update package in this folder.
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
title Hall Booking Platform - update
set "UPD=%~dp0"
if "%UPD:~-1%"=="\" set "UPD=%UPD:~0,-1%"
for %%i in ("%UPD%\..") do set "ROOT=%%~fi"
set "UPZIP="
for /f "delims=" %%f in ('dir /b /a-d /o-d "%UPD%\*.zip" 2^>nul') do if not defined UPZIP set "UPZIP=%%f"
if not defined UPZIP (
    echo [!] No update package (*.zip) in %UPD%
    pause
    exit /b 1
)
echo [+] Update package: %UPZIP%
rem Take the new control app.bat from the package first, then let it run the update.
set "TMPX=%UPD%\_cab"
if exist "%TMPX%" rmdir /s /q "%TMPX%"
mkdir "%TMPX%"
pushd "%TMPX%"
tar -xf "%UPD%\%UPZIP%" "hall_booking/control app.bat" >nul 2>&1
popd
if exist "%TMPX%\hall_booking\control app.bat" copy /y "%TMPX%\hall_booking\control app.bat" "%ROOT%\control app.bat" >nul
rmdir /s /q "%TMPX%"
call "%ROOT%\control app.bat" update
