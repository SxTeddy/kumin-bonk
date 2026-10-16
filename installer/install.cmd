@echo off
chcp 65001 >nul
rem Start the installer window and close this black window right away.
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0setup\install.ps1"
exit /b 0
