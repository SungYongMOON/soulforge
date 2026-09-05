# Tongs(MCP 문) Loopback Lane Runbook v0

> Status: registration-ready, **not registered**. This runbook, `ops/run-tongs-loopback.ps1`,
> `ops/run-tongs-hidden.vbs`, and `ops/register-tongs-task.ps1` exist; no Scheduled Task has been
> created and no process has been started against a real lane by this work. Port 4311 is observed
> silent as of this writing (총괄 관측, 2026-09-06). Owner runs every command in this document.

## 0. 표시명

이 문서에서 World Tree = `ui-workspace/apps/dev-erp` (포트 4300, `dev-erp.db`), Tongs = 이 sidecar
(`ui-workspace/apps/dev-erp-mcp`)다. `docs/architecture/foundation/SHARED_GLOSSARY_V0.md` §세계
이름의 Tongs 행은 `dev-erp-mcp`와 `engineering_mcp` 두 코드 실체를 함께 가리키지만, 이 런북은
**`dev-erp-mcp`만** 다룬다. plan 18(`docs/architecture/foundation/team_member_engineering_program/18_TEAM_PILOT_ACCESS_AND_RELEASE_PLAN_V0.md`)
§12가 파일럿 동안 계속 OFF로 두는 "Rune Tongs"는 `guild_hall/engineering_mcp`의 default-OFF local
stdio read seam(공유 v0 계약의 read 21종, provider 미배선)을 가리키는 것으로 보이며 이 lane과는
다른 대상이다. 혼동을 피하려고 여기서는 `dev-erp-mcp` 쪽만 "Tongs"라고 쓴다.

## 1. 목적

Main Node에서 Tongs를 상시 기동하는 source lane과 그 예약작업(Bellows) 등록기를 준비하고, Hermes
봇 신원("강도담")이 loopback으로 World Tree 읽기 8종과 ingress 제출 도구 6종을 쓸 수 있도록
접근권 발급 절차를 문서로 고정한다. 이 leaf는 코드와 등록기만 만든다 — 실제 기동, 실제 예약작업
등록, 실제 credential 발급은 전부 Owner의 별도 단계다.

## 2. 구성 — Tongs는 프로세스 하나가 아니다

4311은 **개인 ERP MCP(`server.mjs`) 하나만의 기본 bind**다. Ingress MCP(`ingress_server.mjs`)는
자체 기본 포트가 없다 — `listen_host`/`listen_port`/`public_url`을 전부 private binding
JSON(`--config <path>`)에서만 읽으며, 그 binding은 `enabled: false`가 기본이다(README "HPP evidence
ingress MCP" 절). 즉 이 lane은 최대 두 개의 독립 Node 프로세스를 관리한다.

| 프로세스 | 시작 파일 | 포트 결정 | 이 lane에서의 기본 상태 |
| --- | --- | --- | --- |
| 개인 ERP MCP | `server.mjs` | `-ErpListenHost`/`-ErpListenPort`(기본 `127.0.0.1:4311`) | 항상 관리 대상 |
| HPP evidence ingress MCP | `ingress_server.mjs` | private binding JSON의 `listen_port`(1024–65535) | `-IngressConfigPath`를 준 경우에만 관리 대상; 미지정 시 시작하지 않음 |

두 프로세스 모두 loopback(`127.0.0.1`)에만 bind하도록 코드 자체가 강제한다
(`server.mjs`의 `assertSafeBindHost`, `ingress_server.mjs`의 `protectListen`이 `host !== "127.0.0.1"`이면
throw). LAN 노출·TLS 종단은 이 lane의 범위가 아니다 — LAN이 필요해지면 별도 승인 뒤 strict
office-LAN mTLS gateway(`ingress_mtls_gateway.mjs`, README "strict office-LAN mTLS 경계" 절)를 그
gateway 자신의 절차로 연다. 이 launcher는 그 gateway를 기동하지 않는다.

## 3. 바인딩 계약

값은 전부 자리표시자다. 실제 값은 Owner가 배치하며 이 문서에는 절대 적지 않는다.

| 필드 | 뜻 | 예시 자리표시자 |
| --- | --- | --- |
| `ERP_MCP_ERP_BASE_URL` | Tongs가 World Tree HTTP API(`/api/mcp/*`)를 부르는 주소 | `http://127.0.0.1:4300`(loopback만 평문 허용) |
| `ERP_MCP_PUBLIC_URL` | 개인 ERP MCP 자신의 공개 URL(같은 값이 upload ticket URL의 authority가 됨) | `http://127.0.0.1:4311` |
| World Tree DB | Tongs는 `dev-erp.db`를 직접 열지 않는다 — 위 HTTP API로만 접근한다. World Tree 자신의 DB는 운영 팩 backend root 아래 `ui-workspace/apps/dev-erp/data/dev-erp.db` 상대 경로 관례를 따른다(README·`guild_hall/town_crier/assign_notify_bridge.mjs`의 `--db` 기본값과 같은 규칙) | `<TARGET_SOULFORGE_ROOT>/install/server-pack/<x.y.z>/payload/ui-workspace/apps/dev-erp/data/dev-erp.db` |
| 개인 ERP MCP bearer | World Tree 계정에 묶인 개인 MCP 토큰. 한 줄 파일, Owner 배치 | `<private_root>/config/tongs/credentials/erp_mcp_token.txt` |
| Ingress 등록부(registry) | `schema_version: soulforge.ingress.mcp_auth_registry.v1`, SHA-256 hash만 저장(평문 토큰 없음) | `<private_root>/config/tongs/credentials/ingress_auth_registry.v1.json` |
| Ingress binding(`--config`) | `schema/ingress_mcp_binding.v1.schema.json` 그대로. `enabled`는 별도 운영 승인 전 `false` | `<private_root>/config/tongs/ingress_binding.v1.json` |
| Ingress bearer(발급값) | 팀원/봇 PC의 OS-protected 환경에만 둔다(명령행·binding JSON에는 두지 않음) | `<private_root>/config/tongs/credentials/hermes-kangdodam-01.token.txt` |
| 상태 root(heartbeat) | `<StateRoot>/operations/tongs/` | §5 참조 |

이 lane의 자격증명 파일 위치는 AGENTS.md의 lane 자격증명 규칙(`<private_root>/config/<lane>/credentials/`
아래 한 줄 파일, Owner만 배치, 형식 검사만 허용)을 그대로 따른다. 값은 이 문서를 포함해 어떤
기록에도 남기지 않는다.

## 4. Lane 빌드

`guild_hall/deployment_pack/tools/build_source_lane.mjs`는 spec JSON을 받는다(실제 필드는
`SOURCE_LANE_SPEC_SCHEMA = "soulforge.source_lane_spec.v0"`). Tongs lane spec 예시(자리표시자만):

```json
{
  "schema": "soulforge.source_lane_spec.v0",
  "lane_id": "tongs-lane-v1",
  "tracked_paths": ["ui-workspace/apps/dev-erp-mcp/", "package.json", "ui-workspace/package.json"],
  "tracked_excludes": ["ui-workspace/apps/dev-erp-mcp/test/"],
  "carried_forward_prefixes": ["node_modules/", "ui-workspace/node_modules/"],
  "entry_points": [
    "ui-workspace/apps/dev-erp-mcp/server.mjs",
    "ui-workspace/apps/dev-erp-mcp/ingress_server.mjs",
    "ui-workspace/apps/dev-erp-mcp/ops/run-tongs-loopback.ps1"
  ]
}
```

빌드(clean worktree, 이전 lane에서 `node_modules` 상속):

```powershell
node guild_hall/deployment_pack/tools/build_source_lane.mjs `
  --spec <path-to-tongs-lane-spec.json> `
  --previous-lane <TARGET_SOULFORGE_ROOT>/install/source-lanes/operations-lane-v2 `
  --out <TARGET_SOULFORGE_ROOT>/install/source-lanes/tongs-lane-v1 `
  --repo <RepoRoot>
```

`--previous-lane`은 아무 기존 lane이나 되는 것이 아니라 `node_modules`/`ui-workspace/node_modules`를
이미 검증된 manifest와 함께 들고 있는 lane이어야 한다(운영 중인 `operations-lane-v2`가 후보 — 실제
carried-forward 대상은 Owner가 그 lane의 `LANE_MANIFEST.sha256`을 보고 정한다). 빌드는 바이트만
만든다 — 예약작업을 등록·수정하거나 이전 lane을 건드리지 않는다(`build_source_lane.mjs` 자체 주석).
빌드 뒤 무결성 재확인:

```powershell
node guild_hall/deployment_pack/tools/build_source_lane.mjs --verify <TARGET_SOULFORGE_ROOT>/install/source-lanes/tongs-lane-v1
```

## 5. Preflight와 heartbeat

`ops/run-tongs-loopback.ps1 -Preflight`는 소켓을 전혀 열지 않고 다음만 확인한다: node 실행파일 존재,
entry 파일 존재, entry가 lane root 안에 있는지, (ingress 지정 시) binding JSON이
`loadIngressMcpConfig()`로 구조 검증을 통과하는지. 통과/실패 모두 JSON 한 줄로 보고하고 종료 코드로
구분한다(`ok:true`→0, `ok:false`→1).

```powershell
& ui-workspace/apps/dev-erp-mcp/ops/run-tongs-loopback.ps1 `
  -LaneRoot <TARGET_SOULFORGE_ROOT>/install/source-lanes/tongs-lane-v1 `
  -StateRoot <private_root>/state `
  -NodePath <TARGET_SOULFORGE_ROOT>/install/source-lanes/tongs-lane-v1/node.exe `
  -Preflight
```

Preflight를 통과한 뒤(`-Preflight` 없이) 실행하면 서비스별로 재사용/재기동을 스스로 판단하고
heartbeat를 쓴다. Heartbeat 파일은 `<StateRoot>/operations/tongs/<service>.heartbeat.v1.json`
(`<service>` = `erp_mcp` 또는 `ingress_mcp`)이며 형식은 정확히 다음 5개 필드다(Vigil이 나중에 이
경로만 보고 probe할 수 있게 고정).

```json
{
  "schema_version": "soulforge.tongs_lane.heartbeat.v1",
  "status": "ready",
  "observed_at": "2026-09-06T00:00:00.000Z",
  "pid": 12345,
  "listen": "127.0.0.1:4311"
}
```

`status`는 `starting | ready | degraded | stopped | error` 중 하나다. `ready`는 `pid`와 `listen`이
반드시 채워져 있어야 한다(그 외 상태는 둘 다 `null`일 수 있다). 순수 함수(레코드 검증, 재사용/재기동
결정, preflight 판정)는 `ops/tongs_lane_support.mjs`가 소유하며 `ops/tongs_lane_support.test.mjs`가
node:test로 검증한다 — 이 launcher 스크립트 자체는 그 CLI로 위임하는 얇은 shell이다.

로그온 트리거로 시작된 뒤에도 재확인이 필요하므로, 등록된 예약작업은 5분마다 이 launcher를 다시
부른다(§6). 매 호출은 heartbeat와 실제 프로세스 생존을 함께 확인해 재사용할지 다시 띄울지 정하므로,
Task Scheduler의 job-object 종료 시맨틱이 자식 프로세스를 거둬가더라도 최악의 경우 5분 안에
스스로 복구한다.

## 6. 등록 — dry-run 먼저, 그다음 실제

`ops/register-tongs-task.ps1`은 `-DryRun`(또는 `-Register` 없이 호출하는 기본값)에서는 아무것도
등록하지 않고, lane에 대해 `run-tongs-loopback.ps1 -Preflight`를 먼저 통과시킨 뒤 plan digest만
찍는다. 이미 `Soulforge-Tongs-Loopback-v1`이 등록돼 있으면 상태만 보고하고 멈춘다(교체하지 않는다).

```powershell
# 1) dry-run — 아무것도 등록하지 않는다
& ui-workspace/apps/dev-erp-mcp/ops/register-tongs-task.ps1 `
  -LaneRoot <TARGET_SOULFORGE_ROOT>/install/source-lanes/tongs-lane-v1 `
  -StateRoot <private_root>/state `
  -NodePath <TARGET_SOULFORGE_ROOT>/install/source-lanes/tongs-lane-v1/node.exe
# -> "tongs loopback task dry-run attested: plan_digest=sha256:... trigger=at_logon+PT5M mutation=false"

# 2) 위 plan_digest를 그대로 -ExpectedDryRunDigest에 넣고 -Register -DryRun:$false로 실제 등록
& ui-workspace/apps/dev-erp-mcp/ops/register-tongs-task.ps1 `
  -LaneRoot <TARGET_SOULFORGE_ROOT>/install/source-lanes/tongs-lane-v1 `
  -StateRoot <private_root>/state `
  -NodePath <TARGET_SOULFORGE_ROOT>/install/source-lanes/tongs-lane-v1/node.exe `
  -ExpectedDryRunDigest sha256:<위에서 나온 값> -Register -DryRun:$false
```

예약작업 `Soulforge-Tongs-Loopback-v1`의 트리거는 로그온(AtLogOn) + 5분 반복(무기한, PowerShell이
`New-ScheduledTaskTrigger -AtLogOn`에 `-RepetitionInterval`을 직접 받지 않는 문제를 회피하려고
`-Once`로 뽑은 `Repetition` CIM 인스턴스를 복사해 붙인다). 등록 직후에는 AGENTS.md의 lane 전환
규칙대로 등록된 그 인자로 `run-tongs-loopback.ps1 -Preflight`를 한 번 더 실행해 통과를 확인한다
(이 등록기 스스로는 그 재확인을 자동 실행하지 않는다 — 등록 명령 출력이 다음 조치로 이를 안내한다).

## 7. 롤백

- 작업 비활성화만으로 충분한 경우: `Disable-ScheduledTask -TaskName Soulforge-Tongs-Loopback-v1`.
  프로세스가 이미 떠 있다면 별도로 pid를 확인해 멈춘다(이 lane은 정지 도구를 아직 만들지 않았다 —
  `Stop-Process`로 직접 멈추고 heartbeat의 `status`가 다음 tick에서 스스로 `error`/재시작으로
  정리되는지 확인한다).
- lane을 되돌려야 하는 경우: 이전 lane 사본을 삭제하지 말고 `install/source-lanes/tongs-lane-v1`을
  rename 보존(`tongs-lane-v1.superseded-<date>` 등)한 뒤 예약작업의 `-LaneRoot`가 가리키는 값을
  이전 lane으로 재등록한다. 재등록은 여전히 이 등록기의 dry-run → 실제 절차를 그대로 따른다.
- 영수증은 `local-recovery/`에 남긴다(이 leaf 자체는 영수증을 만들지 않는다 — 실제 등록·전환을
  수행하는 Owner 세션의 몫이다).

## 8. 봇 허용 도구 — 파일럿 제안 (Owner 확정 아님)

아래는 코드에 등록된 실제 tool 이름 그대로다(`ui-workspace/apps/dev-erp-mcp/src/tools.mjs`,
`src/ingress_tools.mjs`). "읽기 8종"은 개인 ERP MCP의 기본 8개 tool을 가리키는 이 저장소의 기존
표현이며, 그중 `erp_publish_work_session`/`erp_prepare_artifact_upload`는 기능상 쓰기이지만 같은
8개 묶음의 일부로 취급된다(plan 18 §5·§12의 "읽기 8" 표현을 그대로 따름).

| # | Tool | 표면 | 상태 |
| --- | --- | --- | --- |
| 1 | `erp_whoami` | 개인 ERP MCP | 파일럿 허용 제안 |
| 2 | `erp_get_my_agenda` | 개인 ERP MCP | 파일럿 허용 제안 |
| 3 | `erp_get_task_context` | 개인 ERP MCP | 파일럿 허용 제안 |
| 4 | `erp_list_mail` | 개인 ERP MCP | 파일럿 허용 제안 |
| 5 | `erp_get_mail_detail` | 개인 ERP MCP | 파일럿 허용 제안 |
| 6 | `erp_list_task_artifacts` | 개인 ERP MCP | 파일럿 허용 제안 |
| 7 | `erp_publish_work_session` | 개인 ERP MCP | 파일럿 허용 제안 |
| 8 | `erp_prepare_artifact_upload` | 개인 ERP MCP | 파일럿 허용 제안 |
| 9 | `ingress_whoami` | ingress MCP | 파일럿 허용 제안(명시 나열은 안 됐으나 identity 조회로서 나머지 5개와 같은 급) |
| 10 | `ingress_prepare_file_upload` | ingress MCP | 파일럿 허용 제안(plan 18 §12 "upload ticket") |
| 11 | `ingress_get_upload_status` | ingress MCP | 파일럿 허용 제안(plan 18 §12 "upload ticket") |
| 12 | `ingress_publish_work_event` | ingress MCP | 파일럿 허용 제안(plan 18 §12 "work event") |
| 13 | `ingress_publish_run_receipt` | ingress MCP | 파일럿 허용 제안(plan 18 §12 "run receipt") |
| 14 | `ingress_get_submission_status` | ingress MCP | 파일럿 허용 제안(plan 18 §12 "submission status") |

이 14개가 봇 명부(plan 18 §13)의 `allowed_tools` 후보 제안이다. 실제 확정은 Owner가 §7의 봇 명부
결정과 함께 한다 — 이 문서는 후보만 좁힌다.

### 명시 제외(파일럿에서 봇에게 주지 않음)

- `erp_list_pending_reviews` — `ERP_MCP_REVIEW_TOOLS=1` 뒤에만 등록되는 admin 전용 read-only
  tool. 승인 대기 조회는 사람 검토자·Vigil 표면의 몫이다(plan 18 §5의 승인 대기 화면 참고).
- `erp_get_project_history`, `erp_prepare_project_history_download` — 별도 서버(`project_history_server.mjs`),
  feature-OFF, 이 lane이 관리하지 않는다.
- `company_mail_status`, `company_mail_search`, `company_mail_read` — 회사메일 stdio 3종은 별도
  mailbox-scoped 표면(`company_mail_stdio_server.mjs`/`company_mail_server.mjs`)이며 이 lane과 이
  봇 허용 목록에 노출하지 않는다.
- LAN 노출 — §2대로 이 lane은 loopback만 관리한다. `ingress_mtls_gateway.mjs`를 통한 LAN 개방은
  별도 Owner 승인·별도 canary 절차다.

## 9. 접근권 발급 — Owner가 실행할 명령

값은 절대 만들지 않는다. 아래는 정확한 명령 형태이며 `<...>` 자리표시자만 Owner가 채운다.

### 9.1 개인 ERP MCP bearer (World Tree 계정 필요)

봇 "강도담"이 읽기 8종을 쓰려면 먼저 World Tree 쪽에 그 봇을 대표하는 계정이 있어야 한다(plan 18
§7 항목 1의 봇 명부가 아직 미확정이므로 이 계정도 미확정이다 — Owner가 봇 명부를 정할 때 함께
결정한다).

```powershell
npm.cmd run dev-erp:mcp-token -- issue --username <HERMES_BOT_ERP_USERNAME> --label "Hermes 강도담" --days 30
```

### 9.2 Ingress registry 초기화 + 발급 (정확히 2줄)

```powershell
npm.cmd run ingress:admin -- init --registry <private_root>/config/tongs/credentials/ingress_auth_registry.v1.json

npm.cmd run ingress:admin -- issue --registry <private_root>/config/tongs/credentials/ingress_auth_registry.v1.json --credential hermes-kangdodam-01 --account <OWNER_ACCOUNT_ID> --device main-node-01 --agent hermes-kangdodam --projects <PILOT_PROJECT_CODE> --capabilities upload:team_files,publish:structured_pc_work,publish:run_logs,receipt:read --expires-at <ISO-8601 만료시각> --token-output <private_root>/config/tongs/credentials/hermes-kangdodam-01.token.txt
```

`--projects`는 실제 파일럿 과제 코드(`KVDS`, `P26-014` 등)를 그대로 쓰지 않고 합성 파일럿 과제
코드 자리표시자 `<PILOT_PROJECT_CODE>`로 남긴다 — 실제 값은 Owner가 파일럿 대상 과제를 정할 때
채운다. `--token-output`이 가리키는 파일은 명령이 새로 만들며, 이미 있으면 registry를 바꾸기 전에
실패한다(`ingress_access_admin_cli.mjs`의 계약). 평문 토큰은 그 출력 파일에만 있고 stdout·registry
어디에도 남지 않는다(registry에는 SHA-256 hash만).

## 10. 검증

```powershell
node --check ui-workspace/apps/dev-erp-mcp/ops/tongs_lane_support.mjs
node --test ui-workspace/apps/dev-erp-mcp/ops/tongs_lane_support.test.mjs
node guild_hall/validate/local_absolute_path_policy.mjs --scope changed
npm run validate:display-terms
npm --prefix ui-workspace/apps/dev-erp-mcp run test
```

`ops/run-tongs-loopback.ps1`, `ops/register-tongs-task.ps1`은 PowerShell 파서로 구문만 확인한다
(`[System.Management.Automation.Language.Parser]::ParseFile`) — 이 저장소에는 `.ps1` 전용 node:test
러너가 없다. 실제 등록·실제 서비스 상시 기동의 라이브 검증은 이 leaf의 범위 밖이다.
