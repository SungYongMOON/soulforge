@echo off
chcp 65001 >nul
REM ───────────────────────────────────────────────────────────────
REM dev-erp 사내 LAN 서버 시작 (HTTP 파일럿)
REM 포트 원칙: C:\Soulforge-runtime 운영본은 4300, C:\Soulforge 개발본은 4310.
REM 팀원은 운영본에서만 브라우저에 http://<이 PC의 IPv4>:4300 입력해 접속.
REM 전제: Node.js 22.5+ 설치됨(외부 패키지 0). 이 .bat 은 dev-erp 폴더에 둔다.
REM 이 PC의 IP 확인: 명령창에서  ipconfig  → 활성 어댑터의 "IPv4 주소".
REM ───────────────────────────────────────────────────────────────
cd /d "%~dp0"
set "DEV_ERP_PORT=4310"
echo %CD% | findstr /I "\\Soulforge-runtime\\" >nul && set "DEV_ERP_PORT=4300"
echo [dev-erp] 사내 LAN 서버 시작 - http://0.0.0.0:%DEV_ERP_PORT%
if "%DEV_ERP_PORT%"=="4300" (
  echo [dev-erp] 팀원 접속 주소 = http://(이 PC IPv4):4300  ^(ipconfig 로 확인^)
) else (
  echo [dev-erp] 개발본 포트입니다. 운영 4300과 분리: http://127.0.0.1:%DEV_ERP_PORT%
)
echo [dev-erp] 종료: 이 창에서 Ctrl+C
node server.mjs --host 0.0.0.0 --port %DEV_ERP_PORT%
pause
