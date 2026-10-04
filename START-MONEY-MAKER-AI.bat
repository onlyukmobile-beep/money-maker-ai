@echo off
setlocal
title MONEY MAKER AI - Local Studio
cd /d "%~dp0"

echo =========================================
echo  MONEY MAKER AI
echo  Professional Content Production Studio
echo =========================================
echo.
echo Checking for Node.js and npm...

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: Node.js is not installed or is not on PATH.
  echo Install the current Node.js LTS release from https://nodejs.org/
  echo Then close and reopen this window and run this file again.
  echo.
  pause
  exit /b 1
)

node -e "const [major,minor]=process.versions.node.split('.').map(Number); process.exit((major===20&&minor<19)||(major===22&&minor<12)||major<20||(major>20&&major<22)?1:0)" >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: This project needs Node.js 20.19+ or 22.12+.
  echo Install the current Node.js LTS release from https://nodejs.org/
  echo Then close and reopen this window and run this file again.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: npm was not found. Reinstall Node.js LTS from https://nodejs.org/
  echo Make sure the option to install npm and add Node.js to PATH is enabled.
  echo.
  pause
  exit /b 1
)

echo Node.js: 
node --version
echo npm:
npm --version
echo.

if not exist "node_modules\vite\bin\vite.js" (
  echo First run: installing the studio dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo ERROR: Dependency installation failed. Check your internet connection and retry.
    pause
    exit /b 1
  )
)

echo =========================================
echo  Starting Money Maker AI...
echo.
echo  Local URL: http://localhost:5173
echo  If that port is busy, open the alternative URL Vite prints below.
echo  Keep this window open while using the app.
echo  Press Ctrl+C to stop the local server.
echo =========================================
echo.
call npm run dev -- --host 127.0.0.1 --open

echo.
echo The studio server has stopped.
pause