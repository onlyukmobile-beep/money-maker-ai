@echo off
setlocal
cd /d "%~dp0"
echo.
echo Money Maker AI - server-side provider secret setup
 echo.
echo These commands prompt for each secret. Do NOT paste secrets into source files.
echo.
firebase functions:secrets:set GEMINI_API_KEY
firebase functions:secrets:set TAVILY_API_KEY
firebase functions:secrets:set HF_TOKEN
firebase functions:secrets:set ELEVENLABS_API_KEY
firebase functions:secrets:set ELEVENLABS_VOICE_ID

echo.
echo Secrets configured. Run DEPLOY-PRODUCTION.bat to build and deploy.
pause
