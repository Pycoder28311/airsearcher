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
  rem --ignore-scripts: better-sqlite3 ships its Windows binary, nothing needs compiling.
  call npm install --ignore-scripts
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
  call npx prisma generate
)

rem One line on purpose: the launcher may pull an updated copy of this file while it runs,
rem and cmd must not read further lines from a file that changed under it.
call npm run launch-w & echo. & pause & exit /b
