@echo off
chcp 65001 >nul
REM ----------------------------------------------------------------
REM dev-erp Tailscale HTTPS backend start
REM Run from the runtime checkout. Expose with: tailscale serve --bg 4300
REM ----------------------------------------------------------------
cd /d "%~dp0"
set "DEV_ERP_COOKIE_SECURE=1"
echo [dev-erp] Tailscale HTTPS backend start - http://127.0.0.1:4300
echo [dev-erp] expose with: tailscale serve --bg 4300
echo [dev-erp] stop: Ctrl+C
node server.mjs --host 127.0.0.1 --port 4300
exit /b %ERRORLEVEL%
