@echo off
setlocal
cd /d "%~dp0"
echo Building Money Maker AI...
call npm install
if errorlevel 1 goto :fail
call npm run build
if errorlevel 1 goto :fail
firebase deploy --only functions,hosting
if errorlevel 1 goto :fail
 echo.
echo Deployment completed successfully.
pause
exit /b 0
:fail
echo.
echo Deployment stopped because a command failed. Read the error above.
pause
exit /b 1
