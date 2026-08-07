@echo off
set "CONTROL_PLANE_API_KEY="
set "OPENAI_API_KEY="
node "%~dp0company_mail_stdio_server.mjs" %*
