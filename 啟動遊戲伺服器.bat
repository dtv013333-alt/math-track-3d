@echo off
chcp 65001 >nul
echo 正在啟動 3D 正負數加減法操場賽跑伺服器...
start "" "http://localhost:8080"
powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port 8080
pause
