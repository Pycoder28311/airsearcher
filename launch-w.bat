@echo off
rem Double-click to start AirSearch on Windows: the dev server, and Zen with the
rem collector extension, opened on the dashboard. Same as `npm run launch-w`.
rem Close this window (or press Ctrl+C) to stop everything.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js isn't installed or isn't on PATH. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

call npm run launch-w

rem Keep the window open if it stopped, so any message can be read.
echo.
pause
