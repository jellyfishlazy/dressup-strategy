@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [Guided Update] Node.js 24 is required.
  pause
  exit /b 1
)

node scripts\launch-guided-update.mjs %*
set "exitCode=%errorlevel%"

if not "%exitCode%"=="0" (
  echo.
  echo [Guided Update] Launch failed. See the message above.
  pause
)

exit /b %exitCode%
