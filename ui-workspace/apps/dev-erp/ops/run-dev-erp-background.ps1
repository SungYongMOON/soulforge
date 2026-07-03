# run-dev-erp-background.ps1 — dev-erp 서버를 숨김 백그라운드로 기동(창 없이). 메일 자동수집 ON.
#   · 관리자 권한 불필요. 로그인 자동시작 작업(dev-erp-background)이 이 스크립트를 호출한다.
#   · 포트 4300 을 이미 점유한 node 가 있으면 정리 후 새로 띄운다(중복 인스턴스 방지).
#   · 자격증명(메일 비번)은 계정별 env 파일에만 있고 이 스크립트는 읽지 않는다.
$ErrorActionPreference = "Stop"
$App = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path   # ops -> dev-erp
$LogDir = Join-Path $App "logs\service"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$NodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
if ($NodeCmd) { $NodeExe = $NodeCmd.Source } else { throw "node.exe 를 찾을 수 없음" }

# 4300 점유 node 정리(중복 방지)
Get-NetTCPConnection -LocalPort 4300 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
  try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction Stop } catch {}
}
Start-Sleep -Milliseconds 800

# 환경: 챗 기본(start-windows.bat 와 동일) + 메일 자동수집(15분) + Codex 샌드박스 안전기본(read-only)
$env:ERP_CHAT_PROVIDER = "ollama"
$env:ERP_CHAT_MODEL = "gemma4:e4b"
$env:ERP_CHAT_THINK = "1"
$env:ERP_CHAT_CONTEXT_TURNS = "5"
$env:ERP_CHAT_TIMEOUT_MS = "60000"
$env:ERP_LLM_QUEUE_WAIT_MS = "60000"
$env:ERP_LLM_CONCURRENCY = "1"
$env:DEV_ERP_CODEX_SANDBOX = "read-only"
$env:DEV_ERP_MAIL_COLLECT_SEC = "900"
$env:DEV_ERP_MAIL_ROUTE_BACKFILL_INCLUDE_HIDDEN = "1"

Start-Process -FilePath $NodeExe -ArgumentList @("server.mjs", "--host", "0.0.0.0", "--port", "4300") `
  -WorkingDirectory $App -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $LogDir "dev-erp.out.log") `
  -RedirectStandardError (Join-Path $LogDir "dev-erp.err.log")

Write-Output "dev-erp 백그라운드 기동: port 4300, mail-collect 900s, route-backfill exact+hidden, codex-sandbox read-only"
