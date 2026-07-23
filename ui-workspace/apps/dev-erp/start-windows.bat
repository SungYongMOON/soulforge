@echo off
chcp 65001 >nul
REM ───────────────────────────────────────────────────────────────
REM dev-ERP 서버 시작 (loopback 기본; 승인된 HTTPS proxy/Tailscale 경유)
REM 포트 원칙: runtime checkout 운영본은 4300, development checkout 은 4310.
REM 팀원 접속은 0.0.0.0 직접 노출이 아니라 owner-approved HTTPS endpoint를 사용한다.
REM 전제: Node.js 22.5+ 설치됨(외부 패키지 0). 이 .bat 은 dev-erp 폴더에 둔다.
REM ERP HTTP/mail identity와 Codex worker Windows identity는 별도 서비스로 실행한다.
REM ───────────────────────────────────────────────────────────────
cd /d "%~dp0"
set "DEV_ERP_PORT=4310"
if not defined DEV_ERP_HOST set "DEV_ERP_HOST=127.0.0.1"
echo %CD% | findstr /I "\\Soulforge-runtime\\" >nul && set "DEV_ERP_PORT=4300"
if "%DEV_ERP_PORT%"=="4300" if not defined DEV_ERP_CODEX_TASK_BRIDGE set "DEV_ERP_CODEX_TASK_BRIDGE=worker"
if "%DEV_ERP_PORT%"=="4300" if not "%DEV_ERP_CODEX_TASK_BRIDGE%"=="worker" (echo [dev-erp] ERROR: runtime Codex requires DEV_ERP_CODEX_TASK_BRIDGE=worker. & exit /b 2)
if "%DEV_ERP_PORT%"=="4300" if not defined DEV_ERP_CODEX_WORKER_URL (echo [dev-erp] ERROR: DEV_ERP_CODEX_WORKER_URL is required. & exit /b 2)
if "%DEV_ERP_PORT%"=="4300" if not defined DEV_ERP_CODEX_WORKER_TOKEN (echo [dev-erp] ERROR: DEV_ERP_CODEX_WORKER_TOKEN is required. & exit /b 2)
if "%DEV_ERP_PORT%"=="4300" if not defined DEV_ERP_CODEX_WORKER_EXPECTED_IDENTITY_HASH (echo [dev-erp] ERROR: DEV_ERP_CODEX_WORKER_EXPECTED_IDENTITY_HASH is required. & exit /b 2)
if "%DEV_ERP_PORT%"=="4300" if not defined DEV_ERP_CODEX_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256 (echo [dev-erp] ERROR: DEV_ERP_CODEX_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256 is required. & exit /b 2)
if "%DEV_ERP_PORT%"=="4300" if not defined DEV_ERP_CODEX_WORKER_ATTEST_PUBLIC_KEY_FILE (echo [dev-erp] ERROR: DEV_ERP_CODEX_WORKER_ATTEST_PUBLIC_KEY_FILE is required. & exit /b 2)
if "%DEV_ERP_PORT%"=="4300" if not defined DEV_ERP_CODEX_WORKER_EXPECTED_ATTESTATION_KEY_ID (echo [dev-erp] ERROR: DEV_ERP_CODEX_WORKER_EXPECTED_ATTESTATION_KEY_ID is required. & exit /b 2)
if "%DEV_ERP_PORT%"=="4300" if not defined DEV_ERP_BACKEND_ROOT (echo [dev-erp] ERROR: DEV_ERP_BACKEND_ROOT must point to the Soulforge data owner. & exit /b 2)
if "%DEV_ERP_PORT%"=="4300" if not defined DEV_ERP_CODEX_TURN_PROJECTION_ROOT (echo [dev-erp] ERROR: DEV_ERP_CODEX_TURN_PROJECTION_ROOT is required. & exit /b 2)
if "%DEV_ERP_PORT%"=="4300" if not defined DEV_ERP_CODEX_WORKSPACE_REGISTRY (echo [dev-erp] ERROR: DEV_ERP_CODEX_WORKSPACE_REGISTRY is required. & exit /b 2)
if "%DEV_ERP_PORT%"=="4300" if not defined DEV_ERP_CODEX_TRUST_DOMAIN (echo [dev-erp] ERROR: DEV_ERP_CODEX_TRUST_DOMAIN is required. & exit /b 2)
if "%DEV_ERP_PORT%"=="4300" if not defined DEV_ERP_CODEX_TASK_ATTACHMENT_ROOT (echo [dev-erp] ERROR: DEV_ERP_CODEX_TASK_ATTACHMENT_ROOT is required. & exit /b 2)
if "%DEV_ERP_PORT%"=="4300" if not defined DEV_ERP_CODEX_MESSAGE_PAYLOAD_ROOT (echo [dev-erp] ERROR: DEV_ERP_CODEX_MESSAGE_PAYLOAD_ROOT is required. & exit /b 2)
echo [dev-erp] bind = http://%DEV_ERP_HOST%:%DEV_ERP_PORT%
REM 조건부 echo 는 괄호 블록 대신 단일행 if 로 — 블록 내 비이스케이프 괄호 조기종료 회피.
if "%DEV_ERP_PORT%"=="4300" echo [dev-erp] 팀원은 승인된 HTTPS proxy/Tailscale 주소로 접속합니다.
if not "%DEV_ERP_PORT%"=="4300" echo [dev-erp] 개발본 포트입니다. 운영 4300과 분리: http://127.0.0.1:%DEV_ERP_PORT%
echo [dev-erp] 종료: 이 창에서 Ctrl+C
set "ERP_CHAT_PROVIDER=stub"
set "ERP_CHAT_MODEL="
set "ERP_CHAT_THINK=0"
if not defined ERP_CHAT_CONTEXT_TURNS set "ERP_CHAT_CONTEXT_TURNS=5"
if not defined ERP_CHAT_TIMEOUT_MS set "ERP_CHAT_TIMEOUT_MS=60000"
if not defined ERP_LLM_QUEUE_WAIT_MS set "ERP_LLM_QUEUE_WAIT_MS=60000"
if not defined ERP_LLM_CONCURRENCY set "ERP_LLM_CONCURRENCY=1"
REM ── 채팅 Codex 기본 샌드박스(전역 floor) ──────────────────────────────────
REM   기본 read-only + 네트워크 차단. danger-full-access는 지원하지 않습니다.
REM   첫 운영 슬라이스는 write grant를 거부하며, 선택 첨부의 일회성 projection만 읽습니다.
REM   운영 Codex는 별도 Windows 실행계정과 DEV_ERP_CODEX_HOME을 사용해야 하며,
REM   팀 폴더는 data\codex-workspaces.runtime.json의 과제/계정/역할 allowlist로만 등록합니다.
if not defined DEV_ERP_CODEX_SANDBOX set "DEV_ERP_CODEX_SANDBOX=read-only"
REM ── 메일 자동수집(기본 900초=15분) ───────────────────────────────────────
REM   ⚠ 실제 fetch 되려면 메일 creds 가 채워져 있어야 함:
REM     guild_hall\state\gateway\mailbox\state\email_fetch.env (owner 가 직접 입력, secret).
REM   creds 미설정이면 주기마다 빈 동작/에러 로그만 남고 새 메일은 안 들어옴.
REM   끄려면 이 값을 0 으로: set "DEV_ERP_MAIL_COLLECT_SEC=0"
if not defined DEV_ERP_MAIL_COLLECT_SEC set "DEV_ERP_MAIL_COLLECT_SEC=900"
if not defined DEV_ERP_MAIL_ROUTE_BACKFILL_INCLUDE_HIDDEN set "DEV_ERP_MAIL_ROUTE_BACKFILL_INCLUDE_HIDDEN=1"
REM ── 메일→할일 자동 인입(2026-07-03 owner 활성화, 운영 4300 에서만 기본 ON) ──────
REM   개발본(4310)은 기본 OFF 유지 — dev _workmeta 에 자동 쓰기 방지.
REM 다중행 괄호 블록 제거 — 단일행 중첩 if(운영 4300에서만 ON). 개발본(4310)은 기본 OFF.
if "%DEV_ERP_PORT%"=="4300" if not defined DEV_ERP_AUTO_INTAKE set "DEV_ERP_AUTO_INTAKE=1"
if "%DEV_ERP_PORT%"=="4300" set "DEV_ERP_INTAKE_LLM=none"
if "%DEV_ERP_PORT%"=="4300" if not defined DEV_ERP_AUTOSYNC set "DEV_ERP_AUTOSYNC=1"
REM 아침 브리핑(메일 자동발송) 기본값은 이 bat 에 두지 않는다 — 운영 정경로 ops/run-dev-erp-background.ps1 만.
REM (발송류 단일 진실원 = ps1. 이 bat 인코딩/줄바꿈은 2026-07-05 CRLF 로 수리됨: .gitattributes eol=crlf,
REM  다중행 괄호 블록 제거, cp949 초기 콘솔 실측 검증. 그래도 발송류는 ps1 에만 두어 이중 기본값 회피.)
echo [dev-erp] chat = %ERP_CHAT_PROVIDER% / %ERP_CHAT_MODEL% / think=%ERP_CHAT_THINK% / codex-sandbox=%DEV_ERP_CODEX_SANDBOX% / mail-collect=%DEV_ERP_MAIL_COLLECT_SEC%s / auto-intake=%DEV_ERP_AUTO_INTAKE% / route-backfill=exact+hidden
node server.mjs --host %DEV_ERP_HOST% --port %DEV_ERP_PORT%
pause
