@echo off
setlocal
cd /d "%~dp0"
set "APP_URL=http://127.0.0.1:8765"

curl.exe -fsS "%APP_URL%/api/data" >nul 2>&1
if errorlevel 1 start "Partly server" /min py -3 "%~dp0server.py"

for /L %%i in (1,1,30) do (
  curl.exe -fsS "%APP_URL%/api/data" >nul 2>&1 && goto app_ready
  timeout /t 1 /nobreak >nul
)

echo Could not start Partly. Make sure Python 3 is installed.
pause
exit /b 1

:app_ready
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"

if exist "%EDGE%" (
  start "" "%EDGE%" --app=%APP_URL%
) else (
  start "" "%APP_URL%"
)
endlocal
