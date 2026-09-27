@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title AgentBench Studio v1.2

if not exist "node_modules\" (
  echo [AgentBench] Dependencies are missing. Running setup.ps1...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
  if errorlevel 1 goto :failed
)

echo [AgentBench] Starting production mode: npm run start
echo [AgentBench] The browser will open at http://127.0.0.1:3000 when ready.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-agentbench.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" goto :failed

echo [AgentBench] Services stopped. Child process cleanup attempted.
exit /b 0

:failed
echo.
echo [AgentBench] Startup failed. Review the error above.
echo [AgentBench] You can also run doctor.ps1 for environment diagnostics.
pause
exit /b 1
