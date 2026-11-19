@echo off
title Khoi Chay Song Song 2 Ung Dung Logistics (Port 3000 & Port 3005)

echo [1/2] Dang kiem tra App 1 (e-SI & SOLAS VGM - Port 3000)...
netstat -ano | findstr :3000 >nul
if %ERRORLEVEL% NEQ 0 (
    start "VGM_SI_Server_3000" /min cmd /c "cd /d D:\Project_Phần mềm giả lập LOG_VGM SI && node src/server.js"
)

echo [2/2] Dang kiem tra App 2 (TradeFin Import L/C - Port 3005)...
netstat -ano | findstr :3005 >nul
if %ERRORLEVEL% NEQ 0 (
    start "TradeFin_LC_Server_3005" /min cmd /c "cd /d D:\Project_Phần mềm giả lập LOG_LC && node server.js"
)

timeout /t 2 /nobreak >nul

echo Dang mo ca 2 tab tren Google Chrome...
start "" "chrome.exe" "http://127.0.0.1:3000" "http://127.0.0.1:3005"
if %ERRORLEVEL% NEQ 0 (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" "http://127.0.0.1:3000" "http://127.0.0.1:3005"
)
echo Da khoi chay thanh cong ca 2 ung dung!
