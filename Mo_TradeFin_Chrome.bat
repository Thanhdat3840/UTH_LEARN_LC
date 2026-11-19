@echo off
title UTH Learn L/C Simulator (Port 3005)

echo Dang kiem tra va khoi chay Server Node.js tai port 3005...
netstat -ano | findstr :3005 >nul
if %ERRORLEVEL% NEQ 0 (
    start "UTH_LC_Server" /min cmd /c "cd /d %~dp0 && node server.js"
    timeout /t 2 /nobreak >nul
)

echo Dang mo Google Chrome tai http://127.0.0.1:3005 ...
start "" "chrome.exe" "http://127.0.0.1:3005"
if %ERRORLEVEL% NEQ 0 (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" "http://127.0.0.1:3005"
)
