@echo off
chcp 65001 >nul
REM ───────────────────────────────────────────────────────────────
REM dev-erp 사내 LAN 서버 시작 (HTTP 파일럿)
REM 포트 원칙: runtime checkout 운영본은 4300, development checkout 은 4310.
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
if not defined ERP_CHAT_PROVIDER set "ERP_CHAT_PROVIDER=ollama"
if not defined ERP_CHAT_MODEL set "ERP_CHAT_MODEL=gemma4:e4b"
if not defined ERP_CHAT_THINK set "ERP_CHAT_THINK=1"
if not defined ERP_CHAT_CONTEXT_TURNS set "ERP_CHAT_CONTEXT_TURNS=5"
if not defined ERP_CHAT_TIMEOUT_MS set "ERP_CHAT_TIMEOUT_MS=60000"
if not defined ERP_LLM_QUEUE_WAIT_MS set "ERP_LLM_QUEUE_WAIT_MS=60000"
if not defined ERP_LLM_CONCURRENCY set "ERP_LLM_CONCURRENCY=1"
REM ── 채팅 Codex 기본 샌드박스(전역 floor) ──────────────────────────────────
REM   기본 read-only(가장 안전). 로컬 실행(Outlook 등)이 필요한 대화는 ERP 화면에서 그 대화의
REM   '전체권한' 토글로 켜세요(대화별 danger-full-access). 전역을 굳이 풀 필요 없음.
REM   ⚠ 전역을 workspace-write/danger-full-access 로 바꾸면 모든 대화가 그 권한이 됩니다(위험).
if not defined DEV_ERP_CODEX_SANDBOX set "DEV_ERP_CODEX_SANDBOX=read-only"
echo [dev-erp] chat = %ERP_CHAT_PROVIDER% / %ERP_CHAT_MODEL% / think=%ERP_CHAT_THINK% / codex-sandbox=%DEV_ERP_CODEX_SANDBOX%
node server.mjs --host 0.0.0.0 --port %DEV_ERP_PORT%
pause
