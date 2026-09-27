@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo This removes data\runs, data\index.json, runtime logs and UI smoke images.
echo The sanitized data\demo fixture will be preserved.
choice /C YN /N /M "Clean local benchmark history? [Y/N] "
if errorlevel 2 (
  echo Cancelled. No data was changed.
  exit /b 0
)
node "%~dp0scripts\clean-data.mjs"
if errorlevel 1 exit /b 1
echo Local benchmark history was cleaned.
