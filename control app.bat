@echo off
chcp 65001 >nul 2>&1
setlocal EnableExtensions

:: ==============================================================================
::  Hall Booking Platform - Control Center
::  Install - temporary run - permanent run (Windows service) - update - backup
::  (English only, so the console never shows garbled Arabic text)
:: ==============================================================================

:: ---------- Run as Administrator ----------
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ==============================================================================
    echo  [!] The Control Center needs Administrator rights - requesting elevation...
    echo ==============================================================================
    if "%~1"=="" (
        powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    ) else (
        powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%~1' -Verb RunAs"
    )
    exit /b
)

:: ---------- Paths (relative to this file) ----------
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "APP=%ROOT%\source_code"
set "DATA_DIR=%ROOT%\data"
set "LOG_DIR=%ROOT%\logs"
set "BACKUP_DIR=%ROOT%\backups"
set "CONFIG=%ROOT%\config.env"
set "SERVICE_DIR=%ROOT%\service"
set "SERVICE_ID=HallBookingPlatform"
set "SERVICE_EXE=%SERVICE_DIR%\%SERVICE_ID%.exe"
set "ENTRY=%APP%\artifacts\api-server\dist\index.mjs"
set "WEB_INDEX=%APP%\artifacts\hall-booking\dist\public\index.html"
set "ENV_FILE=%CONFIG%"
set "PORT=5050"

if not exist "%CONFIG%" if exist "%APP%\config.env.example" copy /y "%APP%\config.env.example" "%CONFIG%" >nul
if exist "%CONFIG%" (
    for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%CONFIG%") do (
        if /i "%%a"=="PORT" set "PORT=%%b"
    )
)
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
set "UPDATES_DIR=%ROOT%\updates"
if not exist "%UPDATES_DIR%" mkdir "%UPDATES_DIR%"
cd /d "%APP%"

:: Command-line mode:  "control app.bat" update
set "CLI="
if /i "%~1"=="update" (
    set "CLI=1"
    goto update
)
:: Re-entry after the update replaced this file (same window, no extra terminal).
if /i "%~1"=="updated" (
    title Hall Booking Platform - Control Center - Port %PORT%
    echo.
    echo [+] control app.bat was updated to the new version as well.
    echo [+] Platform address: http://localhost:%PORT%
    goto pause_menu
)

title Hall Booking Platform - Control Center - Port %PORT%

:menu
cls
color 0B
call :detect_state
echo ==============================================================================
echo                    HALL BOOKING PLATFORM  -  CONTROL CENTER
echo ==============================================================================
echo  Folder  : %ROOT%
echo  Port    : %PORT%        URL: http://localhost:%PORT%
echo  Server  : %STATE_TEXT%
echo  Service : %SERVICE_TEXT%
echo ==============================================================================
echo.
echo   --- Install / Update ---
echo   [1]  Full install            (packages + build + database + desktop shortcut)
echo   [2]  Update                  (backup + pull/copy + rebuild + migrate)
echo   [3]  Rebuild only            (web interface + server)
echo.
echo   --- Temporary run ---
echo   [4]  Run in this window      (stops when the window is closed / Ctrl+C)
echo   [5]  Run in background       (minimized window)
echo   [6]  Stop temporary run
echo.
echo   --- Permanent run (Windows service, starts with the computer) ---
echo   [7]  Install + start service
echo   [8]  Start service
echo   [9]  Stop service
echo   [10] Restart service
echo   [11] Uninstall service
echo.
echo   --- Monitoring / Network ---
echo   [12] Status + health check
echo   [13] Open in browser
echo   [14] Show LAN addresses
echo   [15] Open firewall port %PORT%
echo   [16] Show latest logs
echo.
echo   --- Database / Tools ---
echo   [17] Backup database now
echo   [18] Restore a backup
echo   [19] Emergency admin password reset
echo   [20] Create / refresh desktop shortcut (uses the platform icon)
echo.
echo   [0]  Exit
echo ==============================================================================
set "choice="
set /p "choice=Select an option [0-20]: "

if "%choice%"=="1" goto install
if "%choice%"=="2" goto update
if "%choice%"=="3" goto rebuild
if "%choice%"=="4" goto run_fg
if "%choice%"=="5" goto run_bg
if "%choice%"=="6" goto stop_temp
if "%choice%"=="7" goto svc_install
if "%choice%"=="8" goto svc_start
if "%choice%"=="9" goto svc_stop
if "%choice%"=="10" goto svc_restart
if "%choice%"=="11" goto svc_remove
if "%choice%"=="12" goto status
if "%choice%"=="13" goto open_browser
if "%choice%"=="14" goto show_ip
if "%choice%"=="15" goto firewall
if "%choice%"=="16" goto show_logs
if "%choice%"=="17" goto backup
if "%choice%"=="18" goto restore
if "%choice%"=="19" goto reset_admin
if "%choice%"=="20" goto shortcut
if "%choice%"=="0" exit /b 0
goto menu

:: ==============================================================================
:: [1] Full install
:: ==============================================================================
:install
cls
echo ==============================================================================
echo   Full install
echo ==============================================================================
call :require_node || goto pause_menu
call :require_pnpm || goto pause_menu
call :install_and_build || goto pause_menu
call :migrate || goto pause_menu
echo.
echo ==============================================================================
call :make_shortcut
echo  [+] Installation completed successfully.
echo  [+] Temporary run: option [4] or [5].  Permanent run with Windows: option [7].
if exist "%DATA_DIR%\INITIAL_ADMIN_PASSWORD.txt" (
    echo  [+] Initial administrator credentials - file: %DATA_DIR%\INITIAL_ADMIN_PASSWORD.txt
    type "%DATA_DIR%\INITIAL_ADMIN_PASSWORD.txt"
)
echo ==============================================================================
goto pause_menu

:: ==============================================================================
:: [2] Update
:: ==============================================================================
:update
cls
echo ==============================================================================
echo   Update
echo ==============================================================================
call :require_node || goto pause_menu
call :require_pnpm || goto pause_menu
call :detect_state
set "RESUME_SERVICE=0"
set "RESUME_TEMP=0"
if "%SERVICE_RUNNING%"=="1" set "RESUME_SERVICE=1"
if "%SERVICE_RUNNING%"=="0" if "%APP_UP%"=="1" set "RESUME_TEMP=1"

echo [1/5] Stopping the platform...
call :stop_all
echo [2/5] Backing up the database before updating...
call :do_backup pre-update
if errorlevel 1 (
    echo [ERROR] Backup failed - update cancelled to protect the data.
    goto pause_menu
)
echo [3/5] Getting the new version...
call :find_update_zip
if defined UPZIP (
    call :apply_update_zip || goto pause_menu
) else if exist "%ROOT%\.git" (
    git -C "%ROOT%" pull --ff-only
) else if exist "%APP%\.git" (
    git -C "%APP%" pull --ff-only
) else (
    echo      No update package in %UPDATES_DIR% and no Git repository.
    echo      Put the update zip file in: %UPDATES_DIR%
    echo      or copy the new version files into: %APP%
    echo      Then press any key to continue...
    pause >nul
)
echo [4/5] Installing packages and building...
call :install_and_build || goto pause_menu
echo [5/5] Upgrading the database...
call :migrate || goto pause_menu
if "%RESUME_SERVICE%"=="1" (
    echo [+] Restarting the Windows service with the new version...
    node "%APP%\tools\service.mjs" write-xml "%SERVICE_DIR%" "%SERVICE_ID%" "%APP%" "%DATA_DIR%" "%LOG_DIR%" "%CONFIG%" "%PORT%" >nul
    call :clear_stale_lock
    "%SERVICE_EXE%" start >nul
    call :wait_up 60
)
if "%RESUME_TEMP%"=="1" call :start_background
call :make_shortcut >nul
echo.
echo [+] Update completed successfully.
if "%RESUME_SERVICE%"=="1" start "" "http://localhost:%PORT%"
goto swap_control_app
goto pause_menu

:: ==============================================================================
:: [3] Rebuild
:: ==============================================================================
:rebuild
cls
echo ==============================================================================
echo   Rebuild
echo ==============================================================================
call :find_update_zip
if defined UPZIP (
    echo [+] An update package was found in %UPDATES_DIR% - running the full update instead.
    goto update
)
call :require_node || goto pause_menu
call :require_pnpm || goto pause_menu
call :detect_state
set "RESUME_SERVICE=%SERVICE_RUNNING%"
set "RESUME_TEMP=0"
if "%SERVICE_RUNNING%"=="0" if "%APP_UP%"=="1" set "RESUME_TEMP=1"
echo [1/3] Stopping the platform...
call :stop_all
echo [2/3] Installing packages and building...
call :install_and_build || goto pause_menu
echo [3/3] Upgrading the database...
call :migrate || goto pause_menu
if "%RESUME_SERVICE%"=="1" (
    echo [+] Restarting the Windows service with the new build...
    node "%APP%\tools\service.mjs" write-xml "%SERVICE_DIR%" "%SERVICE_ID%" "%APP%" "%DATA_DIR%" "%LOG_DIR%" "%CONFIG%" "%PORT%" >nul
    call :clear_stale_lock
    "%SERVICE_EXE%" start >nul
    call :wait_up 60
)
if "%RESUME_TEMP%"=="1" call :start_background
echo.
echo [+] Rebuild completed.
goto pause_menu

:: ==============================================================================
:: [4] Run in this window
:: ==============================================================================
:run_fg
cls
call :require_node || goto pause_menu
call :require_build || goto pause_menu
call :detect_state
if "%APP_UP%"=="1" (
    echo [!] The platform is already running on port %PORT%.
    goto pause_menu
)
call :clear_stale_lock
echo ==============================================================================
echo   Temporary run - the platform is available at: http://localhost:%PORT%
echo   To stop: press Ctrl+C then Y  (or close this window)
echo ==============================================================================
set "NODE_ENV=production"
set "LOG_PRETTY=1"
pushd "%APP%"
node "%ENTRY%"
popd
set "LOG_PRETTY="
goto pause_menu

:: ==============================================================================
:: [5] Run in background
:: ==============================================================================
:run_bg
cls
call :require_node || goto pause_menu
call :require_build || goto pause_menu
call :detect_state
if "%APP_UP%"=="1" (
    echo [!] The platform is already running on port %PORT%.
    goto pause_menu
)
call :start_background
goto pause_menu

:: ==============================================================================
:: [6] Stop temporary run
:: ==============================================================================
:stop_temp
cls
call :detect_state
if "%SERVICE_RUNNING%"=="1" (
    echo [!] The platform runs as a Windows service - use option [9] to stop it.
    goto pause_menu
)
call :graceful_stop
goto pause_menu

:: ==============================================================================
:: [7] Install Windows service
:: ==============================================================================
:svc_install
cls
echo ==============================================================================
echo   Install as a permanent Windows service
echo ==============================================================================
call :require_node || goto pause_menu
call :require_build || goto pause_menu
if not exist "%APP%\tools\winsw\winsw.exe" (
    echo [ERROR] tools\winsw\winsw.exe is missing.
    goto pause_menu
)
call :detect_state
if "%SERVICE_INSTALLED%"=="1" (
    echo [+] Removing the previous service...
    "%SERVICE_EXE%" stop >nul 2>&1
    "%SERVICE_EXE%" uninstall >nul 2>&1
    timeout /t 2 /nobreak >nul
)
if "%APP_UP%"=="1" call :graceful_stop
if not exist "%SERVICE_DIR%" mkdir "%SERVICE_DIR%"
copy /y "%APP%\tools\winsw\winsw.exe" "%SERVICE_EXE%" >nul
node "%APP%\tools\service.mjs" write-xml "%SERVICE_DIR%" "%SERVICE_ID%" "%APP%" "%DATA_DIR%" "%LOG_DIR%" "%CONFIG%" "%PORT%"
if errorlevel 1 goto pause_menu
call :clear_stale_lock
"%SERVICE_EXE%" install
if errorlevel 1 (
    echo [ERROR] Could not register the service.
    goto pause_menu
)
sc failure %SERVICE_ID% reset= 3600 actions= restart/10000/restart/30000/restart/60000 >nul 2>&1
"%SERVICE_EXE%" start
call :wait_up 60
if "%APP_UP%"=="1" (
    echo.
    echo [+] The service is running and will start automatically with Windows.
    echo [+] URL: http://localhost:%PORT%
    call :make_shortcut
) else (
    echo [!] Service registered but not responding yet - check the logs with option [16].
)
goto pause_menu

:svc_start
cls
call :detect_state
if not "%SERVICE_INSTALLED%"=="1" (
    echo [!] The service is not installed - use option [7].
    goto pause_menu
)
if "%SERVICE_RUNNING%"=="0" if "%APP_UP%"=="1" call :graceful_stop
call :clear_stale_lock
"%SERVICE_EXE%" start
call :wait_up 60
if "%APP_UP%"=="1" (echo [+] Service is running.) else (echo [!] The service is not responding yet - check the logs.)
goto pause_menu

:svc_stop
cls
call :detect_state
if not "%SERVICE_INSTALLED%"=="1" (
    echo [!] The service is not installed.
    goto pause_menu
)
echo Stopping the service safely...
"%SERVICE_EXE%" stop
echo [+] Service stopped.
goto pause_menu

:svc_restart
cls
call :detect_state
if not "%SERVICE_INSTALLED%"=="1" (
    echo [!] The service is not installed.
    goto pause_menu
)
"%SERVICE_EXE%" stop
timeout /t 3 /nobreak >nul
call :clear_stale_lock
"%SERVICE_EXE%" start
call :wait_up 60
if "%APP_UP%"=="1" (echo [+] Service restarted.) else (echo [!] The service is not responding yet.)
goto pause_menu

:svc_remove
cls
call :detect_state
if not "%SERVICE_INSTALLED%"=="1" (
    echo [!] The service is not installed.
    goto pause_menu
)
set "ok="
set /p "ok=Uninstall the Windows service? Data is NOT deleted [Y/N]: "
if /i not "%ok%"=="Y" goto menu
"%SERVICE_EXE%" stop >nul 2>&1
"%SERVICE_EXE%" uninstall
echo [+] Service removed. Data kept in: %DATA_DIR%
goto pause_menu

:: ==============================================================================
:: [12] Status
:: ==============================================================================
:status
cls
call :detect_state
echo ==============================================================================
echo   System status
echo ==============================================================================
echo  Server          : %STATE_TEXT%
echo  Windows service : %SERVICE_TEXT%
for /f "delims=" %%v in ('node -v 2^>nul') do echo  Node.js         : %%v
if exist "%ENTRY%" (echo  Build           : ready) else (echo  Build           : not built - use option [1])
if exist "%DATA_DIR%\pglite" (echo  Database        : %DATA_DIR%\pglite) else (echo  Database        : not created yet)
echo.
echo  Port %PORT%:
netstat -ano | findstr /R /C:":%PORT% .*LISTENING"
echo.
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:%PORT%/api/healthz' -TimeoutSec 5; Write-Host ' [+] Health check: server is responding (' $r.status ')' -ForegroundColor Green } catch { Write-Host ' [-] Server is not responding on port %PORT%' -ForegroundColor Red }"
goto pause_menu

:open_browser
start "" "http://localhost:%PORT%"
goto menu

:show_ip
cls
echo ==============================================================================
echo   Addresses for other computers on the local network
echo ==============================================================================
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { Write-Host ('   http://' + $_.IPAddress + ':%PORT%/') -ForegroundColor Yellow }"
echo.
echo   On this computer: http://localhost:%PORT%/
echo   Note: open the firewall port (option [15]) so other computers can connect.
goto pause_menu

:firewall
cls
netsh advfirewall firewall delete rule name="Hall Booking Platform (TCP %PORT%)" >nul 2>&1
netsh advfirewall firewall add rule name="Hall Booking Platform (TCP %PORT%)" dir=in action=allow protocol=TCP localport=%PORT% profile=domain,private
if errorlevel 1 (
    echo [ERROR] Could not add the firewall rule.
) else (
    echo [+] Port %PORT% opened for Domain/Private networks.
)
goto pause_menu

:show_logs
cls
echo ==============================================================================
echo   Latest logs - %LOG_DIR%
echo ==============================================================================
set "LASTLOG="
for /f "delims=" %%f in ('dir /b /o-d "%LOG_DIR%\*.log" 2^>nul') do if not defined LASTLOG set "LASTLOG=%%f"
if not defined LASTLOG (
    echo No logs yet.
    goto pause_menu
)
echo File: %LASTLOG%
echo ------------------------------------------------------------------------------
powershell -NoProfile -Command "Get-Content -Path '%LOG_DIR%\%LASTLOG%' -Tail 40 -Encoding UTF8"
goto pause_menu

:: ==============================================================================
:: [17] Backup
:: ==============================================================================
:backup
cls
echo ==============================================================================
echo   Database backup
echo ==============================================================================
if not exist "%DATA_DIR%\pglite" (
    echo [!] No database yet.
    goto pause_menu
)
call :detect_state
set "RESUME_SERVICE=%SERVICE_RUNNING%"
set "RESUME_TEMP=0"
if "%SERVICE_RUNNING%"=="0" if "%APP_UP%"=="1" set "RESUME_TEMP=1"
if "%APP_UP%"=="1" (
    echo [+] Pausing the platform for a consistent copy - a few seconds only...
    call :stop_all
)
call :do_backup manual
if "%RESUME_SERVICE%"=="1" "%SERVICE_EXE%" start >nul
if "%RESUME_TEMP%"=="1" call :start_background
goto pause_menu

:: ==============================================================================
:: [18] Restore
:: ==============================================================================
:restore
cls
echo ==============================================================================
echo   Restore a backup
echo ==============================================================================
echo  Available backups in %BACKUP_DIR% :
echo.
dir /b /o-d "%BACKUP_DIR%\*.zip" 2>nul
dir /b /o-d "%DATA_DIR%\backups\*.tar.gz" 2>nul
echo.
set "RFILE="
set /p "RFILE=Type the file name to restore (empty = cancel): "
if "%RFILE%"=="" goto menu
set "RPATH=%BACKUP_DIR%\%RFILE%"
if not exist "%RPATH%" set "RPATH=%DATA_DIR%\backups\%RFILE%"
if not exist "%RPATH%" set "RPATH=%RFILE%"
if not exist "%RPATH%" (
    echo [ERROR] File not found.
    goto pause_menu
)
set "ok="
set /p "ok=The current data will be replaced by this backup. Continue? [Y/N]: "
if /i not "%ok%"=="Y" goto menu
call :detect_state
set "RESUME_SERVICE=%SERVICE_RUNNING%"
call :stop_all
for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TS=%%t"
if exist "%DATA_DIR%\pglite" ren "%DATA_DIR%\pglite" "pglite.before-restore-%TS%"
if /i "%RPATH:~-4%"==".zip" (
    powershell -NoProfile -Command "Expand-Archive -LiteralPath '%RPATH%' -DestinationPath '%DATA_DIR%' -Force"
) else (
    node "%APP%\tools\service.mjs" restore-snapshot "%RPATH%" "%DATA_DIR%\pglite"
)
if not exist "%DATA_DIR%\pglite" (
    echo [ERROR] Restore failed - putting the previous data back...
    ren "%DATA_DIR%\pglite.before-restore-%TS%" "pglite"
    goto pause_menu
)
echo [+] Restored. Previous data kept as: pglite.before-restore-%TS%
if "%RESUME_SERVICE%"=="1" "%SERVICE_EXE%" start >nul
goto pause_menu

:: ==============================================================================
:: [19] Emergency admin password reset
:: ==============================================================================
:reset_admin
cls
call :require_node || goto pause_menu
call :require_build || goto pause_menu
set "ok="
set /p "ok=Generate a new temporary password for the main administrator? [Y/N]: "
if /i not "%ok%"=="Y" goto menu
call :detect_state
set "RESUME_SERVICE=%SERVICE_RUNNING%"
call :stop_all
pushd "%APP%"
node "%ENTRY%" --reset-admin-password
popd
if "%RESUME_SERVICE%"=="1" "%SERVICE_EXE%" start >nul
goto pause_menu

:: ==============================================================================
:: [20] Desktop shortcut
:: ==============================================================================
:shortcut
cls
call :make_shortcut
goto pause_menu

:pause_menu
echo.
pause
if "%CLI%"=="1" exit /b 0
goto menu

:: ##############################################################################
::                               Helper routines
:: ##############################################################################

:detect_state
set "APP_UP=0"
set "SERVICE_INSTALLED=0"
set "SERVICE_RUNNING=0"
for /f %%c in ('powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:%PORT%/api/healthz' -TimeoutSec 3).StatusCode } catch { 0 }"') do if "%%c"=="200" set "APP_UP=1"
sc query %SERVICE_ID% >nul 2>&1 && set "SERVICE_INSTALLED=1"
if "%SERVICE_INSTALLED%"=="1" sc query %SERVICE_ID% | find "RUNNING" >nul && set "SERVICE_RUNNING=1"
if "%APP_UP%"=="1" (set "STATE_TEXT=Running") else (set "STATE_TEXT=Stopped")
if "%SERVICE_INSTALLED%"=="1" (
    if "%SERVICE_RUNNING%"=="1" (set "SERVICE_TEXT=Installed, running") else (set "SERVICE_TEXT=Installed, stopped")
) else (
    set "SERVICE_TEXT=Not installed"
)
exit /b 0

:require_node
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed. Install version 20 or newer from https://nodejs.org and try again.
    exit /b 1
)
node -e "process.exit(+process.versions.node.split('.')[0]>=20?0:1)"
if errorlevel 1 (
    echo [ERROR] Node.js is too old - version 20 or newer is required.
    node -v
    exit /b 1
)
exit /b 0

:require_pnpm
where pnpm >nul 2>&1
if not errorlevel 1 exit /b 0
echo [+] Installing the pnpm package manager...
call npm install -g pnpm@10 >nul
where pnpm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Could not install pnpm - check the internet connection.
    exit /b 1
)
exit /b 0

:require_build
if exist "%ENTRY%" if exist "%WEB_INDEX%" exit /b 0
echo [!] The platform is not built yet - use option [1] to install.
exit /b 1

:install_and_build
pushd "%APP%"
echo [+] Installing packages - the first time may take several minutes...
call pnpm install --frozen-lockfile
if errorlevel 1 (
    echo [+] Retrying without the frozen lockfile...
    call pnpm install
)
if errorlevel 1 (
    popd
    echo [ERROR] Package installation failed - check the internet connection.
    exit /b 1
)
echo [+] Building the web interface and the server...
call pnpm run build
if errorlevel 1 (
    popd
    echo [ERROR] Build failed.
    exit /b 1
)
popd
exit /b 0

:migrate
call :clear_stale_lock
pushd "%APP%"
node "%ENTRY%" --migrate-only
set "RC=%errorlevel%"
popd
if not "%RC%"=="0" (
    echo [ERROR] Database initialisation/upgrade failed.
    exit /b 1
)
echo [+] Database is ready and up to date.
exit /b 0

:start_background
call :clear_stale_lock
echo [+] Starting the platform in the background...
start "Hall Booking Server - %PORT%" /min "%APP%\tools\run-background.bat"
call :wait_up 60
if "%APP_UP%"=="1" (
    echo [+] The platform is running: http://localhost:%PORT%
    echo [+] Log file: %LOG_DIR%\app.log
) else (
    echo [!] No response within the time limit - check the logs with option [16].
)
exit /b 0

:wait_up
set /a "_WAIT=%~1"
:wait_up_loop
call :detect_state
if "%APP_UP%"=="1" exit /b 0
if %_WAIT% LEQ 0 exit /b 0
timeout /t 2 /nobreak >nul
set /a "_WAIT-=2"
goto wait_up_loop

:graceful_stop
if not exist "%DATA_DIR%\control.token" goto force_stop
echo [+] Stopping the platform safely...
powershell -NoProfile -Command "try { $t = (Get-Content -Raw -LiteralPath '%DATA_DIR%\control.token').Trim(); Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:%PORT%/internal/shutdown' -Headers @{ 'X-Control-Token' = $t } -TimeoutSec 5 | Out-Null } catch { }"
set /a "_WAIT=20"
:graceful_wait
timeout /t 1 /nobreak >nul
if not exist "%DATA_DIR%\server.lock" (
    echo [+] Stopped.
    exit /b 0
)
set /a "_WAIT-=1"
if %_WAIT% GTR 0 goto graceful_wait
:force_stop
set "SPID="
if exist "%DATA_DIR%\server.lock" set /p SPID=<"%DATA_DIR%\server.lock"
if defined SPID (
    echo [!] Forcing process %SPID% to stop...
    taskkill /PID %SPID% /T /F >nul 2>&1
    del /q "%DATA_DIR%\server.lock" >nul 2>&1
)
exit /b 0

:stop_all
call :detect_state
if "%SERVICE_RUNNING%"=="1" (
    "%SERVICE_EXE%" stop >nul
    timeout /t 2 /nobreak >nul
)
call :detect_state
if "%APP_UP%"=="1" call :graceful_stop
exit /b 0

:clear_stale_lock
if not exist "%DATA_DIR%\server.lock" exit /b 0
call :detect_state
if "%APP_UP%"=="1" exit /b 0
set "SPID="
set /p SPID=<"%DATA_DIR%\server.lock"
tasklist /FI "PID eq %SPID%" 2>nul | find /i "node.exe" >nul
if errorlevel 1 del /q "%DATA_DIR%\server.lock" >nul 2>&1
exit /b 0

:do_backup
if not exist "%DATA_DIR%\pglite" exit /b 0
for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TS=%%t"
set "BFILE=%BACKUP_DIR%\hall-booking-%~1-%TS%.zip"
echo [+] Creating backup: %BFILE%
:: Windows tar (built in) is used first - PowerShell Compress-Archive fails on some data files.
if exist "%BFILE%" del /q "%BFILE%" >nul 2>&1
tar -a -c -f "%BFILE%" -C "%DATA_DIR%" pglite >nul 2>"%LOG_DIR%\backup-error.log"
if errorlevel 1 if exist "%BFILE%" del /q "%BFILE%" >nul 2>&1
if not exist "%BFILE%" powershell -NoProfile -Command "Compress-Archive -LiteralPath '%DATA_DIR%\pglite' -DestinationPath '%BFILE%' -CompressionLevel Optimal -Force" 2>>"%LOG_DIR%\backup-error.log"
if not exist "%BFILE%" (
    echo [ERROR] Backup could not be created - details: %LOG_DIR%\backup-error.log
    exit /b 1
)
echo [+] Backup saved.
exit /b 0

:: ------------------------------------------------------------------------------
:: Desktop shortcut "Hall Booking Platform" (all users). The icon file
:: data\branding\app.ico is kept up to date by the server: the default platform
:: icon, or the icon uploaded by the administrator in System Settings.
:: ------------------------------------------------------------------------------
:make_shortcut
set "ICON=%DATA_DIR%\branding\app.ico"
if not exist "%ICON%" set "ICON=%APP%\artifacts\hall-booking\dist\public\favicon.ico"
set "DESK=%PUBLIC%\Desktop"
if not exist "%DESK%" set "DESK=%USERPROFILE%\Desktop"
set "LNK=%DESK%\Hall Booking Platform.url"
(
    echo [InternetShortcut]
    echo URL=http://localhost:%PORT%/
    echo IconFile=%ICON%
    echo IconIndex=0
) > "%LNK%"
if exist "%LNK%" (
    echo [+] Desktop shortcut ready: %LNK%
    ie4uinit.exe -show >nul 2>&1
) else (
    echo [!] Could not create the desktop shortcut.
)
exit /b 0

:: ------------------------------------------------------------------------------
:: Update packages: the newest  updates\*.zip  (hall_booking\... inside) is applied,
:: then moved to updates\applied. data, backups, logs and config.env are untouched.
:: ------------------------------------------------------------------------------
:find_update_zip
set "UPZIP="
for /f "delims=" %%f in ('dir /b /a-d /o-d "%UPDATES_DIR%\*.zip" 2^>nul') do if not defined UPZIP set "UPZIP=%%f"
exit /b 0

:apply_update_zip
echo [+] Applying update package: %UPZIP%
set "STAGE=%UPDATES_DIR%\_staging"
if exist "%STAGE%" rmdir /s /q "%STAGE%"
mkdir "%STAGE%"
pushd "%STAGE%"
tar -xf "%UPDATES_DIR%\%UPZIP%"
popd
set "SRC=%STAGE%\hall_booking"
if not exist "%SRC%\source_code\package.json" set "SRC=%STAGE%"
if not exist "%SRC%\source_code\package.json" (
    echo [ERROR] The update package is not valid: %UPZIP%
    exit /b 1
)
robocopy "%SRC%\source_code" "%APP%" /E /NFL /NDL /NJH /NJS /NP /XD node_modules data dist >nul
if errorlevel 8 (
    echo [ERROR] Could not copy the new files.
    exit /b 1
)
if exist "%SRC%\docs" robocopy "%SRC%\docs" "%ROOT%\docs" /E /NFL /NDL /NJH /NJS /NP >nul
if exist "%SRC%\README.md" copy /y "%SRC%\README.md" "%ROOT%\README.md" >nul
if exist "%SRC%\control app.bat" copy /y "%SRC%\control app.bat" "%UPDATES_DIR%\control app.bat.new" >nul
if not exist "%UPDATES_DIR%\applied" mkdir "%UPDATES_DIR%\applied"
move /y "%UPDATES_DIR%\%UPZIP%" "%UPDATES_DIR%\applied\" >nul
rmdir /s /q "%STAGE%"
echo [+] New files copied.
exit /b 0

:: A running batch file must not overwrite itself line by line. The copy and the
:: hand-over to the new file are parsed as ONE block, so cmd jumps straight into the
:: new control app.bat in this same window - no helper window, no second terminal.
:swap_control_app
if not exist "%UPDATES_DIR%\control app.bat.new" goto pause_menu
fc /b "%UPDATES_DIR%\control app.bat.new" "%~f0" >nul 2>&1
if not errorlevel 1 (
    del /q "%UPDATES_DIR%\control app.bat.new" >nul 2>&1
    goto pause_menu
)
(
    copy /y "%UPDATES_DIR%\control app.bat.new" "%~f0" >nul
    del /q "%UPDATES_DIR%\control app.bat.new" >nul 2>&1
    if exist "%UPDATES_DIR%\update-now.bat" move /y "%UPDATES_DIR%\update-now.bat" "%UPDATES_DIR%\archive\" >nul 2>&1
    "%~f0" updated
)
