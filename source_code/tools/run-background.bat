@echo off
chcp 65001 >nul 2>&1
rem Launched (minimised) by "control app.bat" option [5]. Inherits PORT / DATA_DIR / ENV_FILE / LOG_DIR.
cd /d "%~dp0.."
if "%LOG_DIR%"=="" set "LOG_DIR=%~dp0..\..\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
node "artifacts\api-server\dist\index.mjs" >> "%LOG_DIR%\app.log" 2>&1
