# Tongs(MCP 문) Loopback Lane Runbook v0

> Status: registration-ready, **not registered**. This runbook, `ops/run-tongs-loopback.ps1`,
> `ops/stop-tongs-loopback.ps1`, `ops/run-tongs-hidden.vbs`, and `ops/register-tongs-task.ps1`
> exist; no Scheduled Task has been created and no process has been started against a real lane by
> this work. Port 4311 is observed silent as of this writing (총괄 관측, 2026-09-06). Owner runs
> every command in this document.
>
> 2026-09-06 개정: 첫 검토(REVIEW_PACKET_20260906_tongs_t.yaml, "revise")가 잡은 M1–M6과 minor
> m1–m12 전부를 이 개정에서 고쳤다 — 재기동 경합(M1)·신선도 창(M2)·loopback 미강제(M3)·이 문서
> 자체의 틀린 문장(M4)·§9 명령 오류(M5)·§4 빌드 레시피 불능(M6). 아래 각 절의 실제 문장이 이
> 개정 뒤 상태다.
>
> 2026-09-06 후속 개정: 이 lane의 lane builder가 실측한 별도 결함 — Vigil이 이 lane과 다른 파일명·
> 필드·상태 어휘·상태 root를 가정해 정확한 등록 뒤에도 `/tongs.snapshot.json`이 `unknown`으로
> 남던 문제 — 를 §5.1 Vigil 계약으로 고쳤다. 위 REVIEW_PACKET_20260906_tongs_t.yaml의 M1–M6과는
> 무관한 별도 발견이다.

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

두 프로세스의 loopback 강제 수준은 다르다(M4, 2026-09-06 검토가 잡음). Ingress MCP는 무조건
loopback-pinned다 — binding JSON의 `listen_host`가 `127.0.0.1`이 아니면 `loadIngressMcpConfig()`
자체가 거부하고(`invalid_ingress_mcp_config`), `ingress_server.mjs`의 `protectListen`도
`host !== "127.0.0.1"`이면 예외 없이 throw한다(우회 flag 없음). 개인 ERP MCP(`server.mjs`)의
`assertSafeBindHost`는 `ERP_MCP_ALLOW_INSECURE_HTTP`가 **미설정일 때만** loopback을 강제한다 —
그 환경변수가 `1`이면 그 guard 자체가 꺼진다. 이 launcher(`run-tongs-loopback.ps1`)는 그래서 두
겹으로 막는다: (1) `-ErpListenHost` 파라미터가 `127.0.0.1` 외 값이면 `ValidateScript`가 spawn은
고사하고 preflight조차 가기 전에 throw하고, (2) 두 자식 프로세스 모두에 넘기는
`$EnvironmentOverrides`에 `ERP_MCP_ALLOW_INSECURE_HTTP = "0"`을 명시해, 로그온 세션에 그
변수가 `1`로 남아 있어도 이 launcher가 스폰하는 자식에는 전달되지 않는다(2026-09-06 재검토에서
in-process 자식 spawn으로 실측: 부모 세션에 `1`이 있어도 자식은 `0`을 봄). 등록기
(`register-tongs-task.ps1`)의 `-ErpListenHost`도 같은 `ValidateScript`로 막혀 있어 잘못된 값은
plan digest에 들어가기도 전에 거부된다. LAN 노출·TLS 종단은 이 lane의 범위가 아니다 — LAN이
필요해지면 별도 승인 뒤 strict office-LAN mTLS gateway(`ingress_mtls_gateway.mjs`, README
"strict office-LAN mTLS 경계" 절)를 그 gateway 자신의 절차로 연다. 이 launcher는 그 gateway를
기동하지 않는다.

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
| 상태 root(heartbeat) | `<StateRoot>/operations/tongs/` | §5·§5.1 참조 — Vigil 쪽 `SOULFORGE_TONGS_STATE_ROOT`에 **같은 값**을 준다 |

이 lane의 자격증명 파일 위치는 AGENTS.md의 lane 자격증명 규칙(`<private_root>/config/<lane>/credentials/`
아래 한 줄 파일, Owner만 배치, 형식 검사만 허용)을 그대로 따른다. 값은 이 문서를 포함해 어떤
기록에도 남기지 않는다.

## 4. Lane 빌드

`guild_hall/deployment_pack/tools/build_source_lane.mjs`는 spec JSON을 받는다(실제 필드는
`SOURCE_LANE_SPEC_SCHEMA = "soulforge.source_lane_spec.v0"`). 추적되는 정본 spec은
`guild_hall/deployment_pack/lanes/tongs_lane.spec.json`이다(M6, 2026-09-06 검토가 잡음 —
이전 판은 이 파일을 만들지 않고 이 runbook 안 예시 JSON 블록만으로 `--spec <path-to-...>`
자리표시자를 썼다. `guild_hall/deployment_pack/lanes/operations_lane.spec.json`이 유일한 기존
선례이며 tongs spec은 그 형식을 그대로 따른다).

**`--previous-lane`은 아무 기존 lane이나 되지 않는다(M6b, 실측).** `server.mjs`·`ingress_server.mjs`가
`@modelcontextprotocol/sdk`·`zod`를 import하는데(둘 다 `ui-workspace/apps/dev-erp-mcp/package.json`의
`dependencies`), 2026-09-06 검토 시점에 실재하는 `install/source-lanes/*` 중 이 둘을 들고 있는
lane은 **하나도 없다**: `operations-lane-v2/ui-workspace/node_modules`는 vite 툴체인용 35개
패키지만 있고 `@modelcontextprotocol`·`zod`는 없으며(`linear-collect-v1`/`buzz-collect-v1`은
`node_modules` 자체가 없다 — 그 lane들의 entry point가 서드파티 패키지를 아예 import하지 않기
때문), `operations-lane-v2`를 `--previous-lane`으로 주면 `verifyCarriedForward()`가 spec의
carried prefix에 해당하는 manifest row를 하나도 못 찾아 `carried_set_empty`로 실패한다(스펙을
넘겨도 실패하는 것이 아니라, **넘긴 프리픽스가 그 lane 안에 없어서** 실패한다는 점에 주의). 이
lane을 빌드하려면 Owner가 **먼저** `@modelcontextprotocol/sdk`·`zod`가 실제로 든
`ui-workspace/node_modules`를 가진 previous-lane 스테이징 디렉터리를 만들어야 한다 — 예를 들어
이미 그 패키지들을 설치해 둔 checkout(D: dev checkout 등)의 `ui-workspace/node_modules`를
스테이징 디렉터리로 복사하고, `sha256sum -b`(`${sha256} *./${path}` 형식, 기존 lane들의
`LANE_MANIFEST.sha256`과 동일 포맷)로 그 스테이징의 manifest를 만든 뒤, 그 디렉터리를
`--previous-lane`으로 준다. 이 스테이징은 `npm install`을 실행하는 것이 아니라 **이미 설치된
바이트를 복사**하는 것이다 — lane 체인의 기존 관례(모든 `install/source-lanes/*`의
`ui-workspace/node_modules`도 어느 조상 lane에서 한 번 설치된 뒤로 설치 없이 계속 복사만 되어
왔다)와 같은 방식이다.

빌드(clean worktree):

```powershell
node guild_hall/deployment_pack/tools/build_source_lane.mjs `
  --spec guild_hall/deployment_pack/lanes/tongs_lane.spec.json `
  --previous-lane <스테이징된 previous-lane 경로 — @modelcontextprotocol/sdk와 zod를 실제로 든 것> `
  --out <TARGET_SOULFORGE_ROOT>/install/source-lanes/tongs-lane-v1 `
  --repo <RepoRoot>
```

빌드는 바이트만 만든다 — 예약작업을 등록·수정하거나 이전 lane을 건드리지 않는다
(`build_source_lane.mjs` 자체 주석).

> **알려진 결함(이 lane과 무관, 도구 자체의 문제 — 이 개정에서 실제 커밋으로 빌드해 보다가 실측했다):**
> 참고(2026-09-06): 이 CLI 진입 가드는 Windows 드라이브 문자 경로에서 `import.meta.url`과 손으로 만든 file: 문자열의 슬래시 수가 달라 **조용히 아무것도 만들지 않던** 결함이 있었고, main `a137b11b`(pathToFileURL 비교)에서 고쳐졌다. 그 커밋 이전 판본에서는 `buildSourceLane()`/`verifyLane()`을 직접 import하는 짧은 wrapper로 실행해야 한다.

빌드 뒤 무결성 재확인:

```powershell
node guild_hall/deployment_pack/tools/build_source_lane.mjs --verify <TARGET_SOULFORGE_ROOT>/install/source-lanes/tongs-lane-v1
```

**의존성 폐쇄 확인은 `--verify`로 끝나지 않는다.** `--verify`는 파일이 manifest의 해시와
일치하는지만 본다 — `@modelcontextprotocol/sdk`가 아예 빠진 lane도 파일 존재만 확인하면
통과한다. 실제 import 해석은 `run-tongs-loopback.ps1 -Preflight`가 한다(2026-09-06 개정에서
`tongs_lane_support.mjs`의 `preflight`에 `module_resolves` 체크를 추가했다 — entry 파일을
`import()`로 직접 열어보고 실패하면 `ERR_MODULE_NOT_FOUND` 같은 코드를 `ok:false`와 함께
보고한다, 소켓은 전혀 열지 않는다). 그러므로 빌드 뒤 순서는: `--verify` → 빌드된 lane 자신의
경로로 `-Preflight` 한 번 더(`-NodePath`에 시스템 node, `-LaneRoot`에 방금 만든 lane) → `ok:true`
그리고 `erp_mcp.checks.module_resolves == true`를 확인. 이 순서로 실제 검증한 기록은 이 개정의
커밋 보고에 있다(스크래치 lane 경로 포함).

**`-NodePath`는 lane 안의 파일이 아니라 시스템 node 경로다(M6c).** 아래 명령의 `<NODE_EXE_PATH>`는 시스템 node 실행 파일 경로(예: Program Files의 nodejs)로 치환한다. `carried_forward_prefixes`는
디렉터리 프리픽스만 받으므로 이 spec으로는 lane root에 `node.exe`가 생기지 않는다 — 형제 lane의
등록기(`guild_hall/linear_history/ops/register-linear-collect-hpp-task.ps1`)도 같은 이유로
시스템 node 경로를 받고 그 파일의 SHA-256을 등록 시점에만 대조한다(§6 참고, `register-tongs-task.ps1`의
`-NodeSha256`).

## 5. Preflight와 heartbeat

`ops/run-tongs-loopback.ps1 -Preflight`는 소켓을 전혀 열지 않고 다음만 확인한다: node 실행파일 존재,
entry 파일 존재, entry가 lane root 안에 있는지, entry 파일이 실제로 `import()` 해석되는지(M6,
2026-09-06 추가 — `@modelcontextprotocol/sdk`·`zod`가 빠진 lane을 파일 존재만으로 통과시키던
구멍을 막는다; entry의 최상위 "서버 기동" 블록은 `import.meta.url === pathToFileURL(process.argv[1])`
가드로 보호돼 있어 이 동적 import는 그 블록을 절대 실행하지 않는다), (ingress 지정 시) binding
JSON이 `loadIngressMcpConfig()`로 구조 검증을 통과하는지와 그 `enabled` 값. 통과/실패 모두 JSON
한 줄로 보고하고 종료 코드로 구분한다(`ok:true`→0, `ok:false`→1). Ingress binding이 구조적으로는
유효하지만 `enabled:false`이면 preflight 자체는 여전히 `ok:true`다(binding은 정상이라는 뜻이므로)
— 다만 그 경우 실제 기동 단계는 스폰을 **시도조차 하지 않는다**(아래 참고).

```powershell
& ui-workspace/apps/dev-erp-mcp/ops/run-tongs-loopback.ps1 `
  -LaneRoot <TARGET_SOULFORGE_ROOT>/install/source-lanes/tongs-lane-v1 `
  -StateRoot <private_root>/state `
  -NodePath <NODE_EXE_PATH> `
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
node:test로 검증한다 — 이 launcher 스크립트 자체는 그 CLI로 위임하는 얇은 shell이다. per-service
결과에는 heartbeat 스키마 밖의 `action` 필드도 있다 — `start`(새로 스폰해 성공)·`reuse`(기존
프로세스 재사용)·`adopt`(아래 참고)·`skipped`(ingress가 `enabled:false`라 아예 스폰하지 않음).

로그온 트리거로 시작된 뒤에도 재확인이 필요하므로, 등록된 예약작업은 5분마다 이 launcher를 다시
부른다(§6). 매 호출은 heartbeat와 실제 프로세스 생존을 함께 확인해 재사용할지 다시 띄울지 정하므로,
Task Scheduler의 job-object 종료 시맨틱이 자식 프로세스를 거둬가더라도 최악의 경우 재확인 간격 안에
스스로 복구한다.

**신선도 창(M2).** `MaxHeartbeatAgeMs` 기본값은 720000(12분) — 등록된 예약작업의 5분 반복(300000ms)의
2.4배다. 이 상수는 `guild_hall/shared/tongs_heartbeat_contract.mjs`의
`TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS`(`ops/tongs_lane_support.mjs`가 그대로 re-export)
(`TONGS_REGISTERED_TRIGGER_INTERVAL_MS`의 배수 관계로 node:test가 고정) 한 곳에서만 정의되고,
`run-tongs-loopback.ps1`과 `register-tongs-task.ps1`은 그 값을 문자 그대로 복사한 기본값을 쓴다 —
셋이 갈라지지 않게, `register-tongs-task.ps1`은 호출자가 `-MaxHeartbeatAgeMs`를 5분 반복의 2배(600000)
아래로 주면 등록 자체를 거부한다. 트리거 간격과 신선도 창이 거의 같으면 Task Scheduler의 통상적인
지연(절전에서 깨어난 직후, 부하가 높을 때)만으로도 매 tick이 "신선하지 않음"으로 갈려 재기동을
반복하게 된다(M1과 같은 경합의 근본 원인 — 2026-09-06 검토 C15가 `-MaxHeartbeatAgeMs 1`로 재현).

**재기동 경합과 adopt(M1).** 재기동이 결정된 시점에 이전 프로세스가 여전히 포트를 쥐고 있으면, 새
자식은 `EADDRINUSE`로 거의 즉시 죽는다. 예전 코드는 헬스 프로브가 응답하기만 하면(그 응답이 죽은
새 자식이 아니라 살아있는 옛 프로세스에서 온 것이어도) 그 자식의 pid를 `ready`로 기록했다 — 옛
pid가 아니라 새로(이미 죽은) pid를 기록하는 이 오기록이 예약작업 tick마다 반복되는 좀비 스폰
루프였다. 지금은: 자식 spawn → 짧은 대기 → `HasExited`면 그 사실만으로 `ready`를 쓰지 않고, 살아
있으면 `Get-NetTCPConnection`의 실제 포트 소유 pid가 방금 스폰한 자식의 pid와 같을 때만 `ready`를
쓴다. 둘 중 하나라도 어긋나면(자식이 이미 죽었거나, 포트 소유자가 다른 pid이거나) 그 포트의 실제
소유자를 다시 조회해 그 프로세스가 `node` 이름·헬스 200을 모두 만족하면 `action:"adopt"`로 그
**옛(검증된) pid**를 `ready`로 기록하고 재기동을 시도하지 않는다. 어느 쪽도 만족하지 못하면
`status:"error"`로 실패를 그대로 보고한다 — 확인 못 한 pid를 `ready`라고 쓰는 경우는 없다.
재사용(`reuse`) 경로도 같은 포트-소유자 대조를 거친다: 헬스 200이 와도 그 포트를 실제로 쥔 pid가
heartbeat의 pid와 다르면 `degraded`로 내려간다(전에는 200 응답만으로 `ready`를 유지했다).
`degraded`는 이제 이 launcher 실행 자체의 exit code도 실패로 만든다(예전에는 `error`만 그랬다) —
막힌 리스너가 Task Scheduler에는 계속 성공으로 보이는 구멍을 닫는다.

프로세스 생존 확인(`Test-ProcessAlive`)도 pid 존재만 보지 않는다 — 프로세스 이름이 `node`인지,
그리고(heartbeat에 `observed_at`이 있으면) 그 프로세스의 시작 시각이 그 관측 시각보다 뒤가 아닌지,
entry의 **절대 경로 전체**가 명령행에 실제로 들어있는지까지 함께 본다(Windows가 pid를 재사용하는
사이 다른 프로세스가 그 번호를 물려받는 경우를 잡는다 — 파일명만 대조했다면 `server.mjs`가
`other_server.mjs` 같은 무관한 파일과도 부분 일치했을 것이다).

**동시 실행 잠금.** 매 실행은 `<StateRoot>/operations/tongs/run.lock.v1.json`을 자신의 pid로
선점한 뒤에만 재사용/재기동 판단으로 들어간다. 이미 다른(살아있는) pid가 쥐고 있으면 아무것도
결정·기동하지 않고 `{"ok":true,"locked_by_pid":<pid>}`를 찍고 exit 0으로 끝난다(실패가 아니라 —
이미 다른 실행이 이 lane을 보고 있다는 뜻). `MultipleInstances=IgnoreNew`가 예약작업 자체의 중복
실행은 막지만, 수동 실행이 등록된 tick과 겹치는 경우까지는 막지 못하므로 이 락이 그 틈을 메운다.
락 파일을 읽을 수 없으면(손상 등) 비어 있다고 보지 않고 그 실행 자체를 실패로 처리한다 — 조용히
락을 내주는 쪽보다 안전하다.

**Ingress가 `enabled:false`인 경우.** `-IngressConfigPath`를 줬지만 그 binding의 `enabled`가
`false`면, 이 launcher는 ingress 프로세스를 스폰하지 않는다(예전에는 매 tick 최대
`-HealthTimeoutSeconds`(기본 30초)를 기다린 뒤 `ingress_mcp_feature_off`로 죽는 자식을 계속
스폰했다). 대신 heartbeat를 `status:"stopped"`(pid/listen null)로 남기고 결과 목록에
`action:"skipped", reason:"ingress_disabled"`를 적는다.

**자식 로그.** `<service>.out.log`/`.err.log`는 매 재기동마다 그냥 덮어써지지 않는다 — 기존 파일을
`.1`로 밀어 넣고(`.1`→`.2`… 최근 5개까지) 새 실행은 빈 파일로 시작한다. 옛 프로세스가 아직 그
경로를 쥐고 있어 rename이 막히면(정확히 adopt가 다루는 그 상황) 회전은 조용히 건너뛴다 — 회전
실패가 재기동 자체를 막지는 않는다.

**정지.** `ops/stop-tongs-loopback.ps1 -StateRoot <path> -NodePath <path> [-Service erp_mcp|ingress_mcp]`가
이 lane의 유일한 정지 도구다(§7 참고). heartbeat가 이름을 댄 pid가 실제로 살아 있고 `node`
프로세스이며 그 heartbeat가 말하는 포트를 지금 실제로 쥐고 있을 때만 멈춘다 — 셋 중 하나라도
어긋나면 아무것도 건드리지 않고 `verification_failed`를 보고한다.

## 5.1 Vigil 계약 (2026-09-06 추가)

**배경(고쳐진 결함).** 이 개정 전에는 Vigil(`ui-workspace/apps/team-ops-board`, 포트 4192)의
읽기 전용 probe(`src/server/tongs-heartbeat-adapter.mjs`)가 이 lane이 실제로 쓰는 파일과
무관하게 만들어졌다 — 파일명이 고정된 `heartbeat.json`(실제로는 `<service>.heartbeat.v1.json`),
필드 집합이 `schema_version` 대신 존재하지도 않는 `schema`를 optional로 허용, 상태 어휘가
`listening/starting/stopped`(실제 lane은 `starting/ready/degraded/stopped/error`를 쓴다)였다.
게다가 두 쪽의 상태 root 해석이 서로 다른 설정 채널이었다 — 이 lane은 등록 시점의 `-StateRoot`
파라미터(운영 값은 이 문서에 적지 않는다) 하나만 보고, Vigil은 일반
`SOULFORGE_STATE_ROOT`/`SOULFORGE_OWNER_ROOT`만 보며 이 checkout의 `guild_hall/state`로
떨어졌다. 그 결과 정확히 등록해 lane이 살아 있어도 `/tongs.snapshot.json`은 `unknown` /
`tongs_heartbeat_absent`를 보고했다(lane builder가 실측, 2026-09-06). 지금은 아래처럼
한 계약을 양쪽이 그대로 가져다 쓴다.

**계약의 정본 (2026-09-06 재배치).** 파일명 패턴(`tongsHeartbeatPath()` + `TONGS_STATE_DIRNAME`),
필드 집합(`HEARTBEAT_FIELDS`), 스키마 문자열(`TONGS_HEARTBEAT_SCHEMA`), 상태 어휘
(`TONGS_HEARTBEAT_STATUSES`), Vigil이 보는 서비스(`TONGS_ALWAYS_MANAGED_SERVICE` = `"erp_mcp"` —
ingress MCP는 opt-in이라 단일 값 스냅샷의 대상이 아니다), 신선도/재기동 판단 창
(`TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS`)의 정본은 `guild_hall/shared/tongs_heartbeat_contract.mjs`다.
위 배경의 수정 직후에는 이 lane 자신의 `ops/tongs_lane_support.mjs`가 정본이었으나, 그 설계는
team-ops-board가 dev-erp-mcp를 import하는 첫 app-to-app edge였다(세션
`claude_20260906_team_ops_adapter_enum_drift_audit`가 Owner 결정 보류로 잡아둔 지점) — Vigil은
dev-erp-mcp의 파일을 싣지 않는 빌드된 source lane에서 실행되므로, 그 edge는 dev에서는 resolve되고
빌드된 lane에서는 `ERR_MODULE_NOT_FOUND`로 죽는다. 지금은 두 앱 누구도 상대를 import하지 않는다:
`ops/tongs_lane_support.mjs`는 `guild_hall/shared/tongs_heartbeat_contract.mjs`를 import해 그대로
re-export할 뿐이고(자신의 CLI와 기존 importer인 `ops/tongs_lane_support.test.mjs`가 계속 동작하도록),
`tongs-heartbeat-adapter.mjs`는 같은 모듈을 `ops/tongs_lane_support.mjs`를 거치지 않고
guild_hall/shared에서 직접 import한다. Vigil의 신선도 창도 같은
`TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS`를 초 단위로 그대로 쓴다(예전엔 독자적으로 900초를 추측해
lane의 실제 판단 창인 720초와도 어긋나 있었다).

**상태 root — 명시 env, fail-closed, 조용한 대체 없음.** 이 lane의 `-StateRoot`와 Vigil의 일반
state root는 서로 다른 값을 가리켜도 되는 독립된 설정 채널이므로(위 배경 참고), 어댑터는 그 둘이
우연히 같다고 가정하지 않는다. Vigil을 띄우는 프로세스 환경에 `SOULFORGE_TONGS_STATE_ROOT`를
**이 lane을 등록할 때 넘긴 `-StateRoot`와 정확히 같은 값**으로 설정한다. 우선순위는
`SOULFORGE_TONGS_STATE_ROOT`(명시) > `SOULFORGE_STATE_ROOT` > `SOULFORGE_OWNER_ROOT` > 이
checkout의 `guild_hall/state`다 — AGENTS.md의 일반 state root 우선순위(파일별 명시 flag/env가
최우선)와 같은 모양이다. `SOULFORGE_TONGS_STATE_ROOT`가 설정돼 있는데 절대 경로가 아니거나
존재하는 디렉터리가 아니면(빈 문자열 포함) 조용히 다음 항으로 넘어가지 않고 Vigil 자체가 시작을
거부한다(이미 `SOULFORGE_STATE_ROOT`/`SOULFORGE_OWNER_ROOT`가 같은 방식으로 실패한다 —
`vite.config.ts`의 기존 주석 "Fail closed ... refuses to start"). 설정하지 않으면 이 변수는
그냥 없는 것으로 보고 일반 우선순위로 내려간다 — Vigil의 다른 상태 파일(secure_work 등)과 같은
동작이다.

**단위 테스트.** `ui-workspace/apps/team-ops-board/src/server/tongs-heartbeat-adapter.test.mjs`가
(1) 실제 파일명(`erp_mcp.heartbeat.v1.json`)으로 쓰인 fixture를 읽어 ok(ready+fresh)/stale/absent를
올바르게 판정하는지, (2) 어댑터의 기본 경로가 `guild_hall/shared/tongs_heartbeat_contract.mjs`의
`tongsHeartbeatPath()` + `TONGS_ALWAYS_MANAGED_SERVICE`를 **같은 함수 호출로** 그대로 재현하는지
(계약 테스트 — 두 값이 우연히 같은 문자열이 아니라 같은 호출 결과라서 갈라질 수 없음을 증명), (3)
그 상태 어휘(`TONGS_STATUS_VALUES`)가 `TONGS_HEARTBEAT_STATUSES`와 참조까지 같은지(`===`), (4)
`SOULFORGE_TONGS_STATE_ROOT`의 우선순위·fail-closed 동작을 검증한다. `ops/tongs_lane_support.test.mjs`
쪽에도 대응하는 계약 테스트가 있다 — 이 모듈이 re-export하는 상수/함수 전부가
`guild_hall/shared/tongs_heartbeat_contract.mjs`의 바로 그 바인딩인지(`===`) 검증해, 이 모듈이
독자 복사본을 다시 만들면 값이 우연히 같아도 이 테스트가 실패한다.

## 6. 등록 — dry-run 먼저, 그다음 실제

`ops/register-tongs-task.ps1`은 `-DryRun`(또는 `-Register` 없이 호출하는 기본값)에서는 아무것도
등록하지 않고, lane에 대해 `run-tongs-loopback.ps1 -Preflight`를 먼저 통과시킨 뒤 plan digest만
찍는다. 이미 `Soulforge-Tongs-Loopback-v1`이 등록돼 있으면 상태만 보고하고 멈춘다(교체하지 않는다).

`-NodeSha256`은 필수 파라미터다(m12, 형제 `register-linear-collect-hpp-task.ps1`과 같은 계약) —
Owner가 `-NodePath`가 가리키는 바로 그 바이너리의 SHA-256을 미리 계산해 넘기고, 이 등록기는 그
값과 실제 파일 해시를 대조해 다르면 등록 전체를 거부한다. plan digest에도 이 값이 들어가므로
node.exe를 바꿔치기해도 digest가 그대로 통과하는 일은 없다.

```powershell
$NodeSha256 = "sha256:" + (Get-FileHash -Algorithm SHA256 <NodePath>).Hash.ToLowerInvariant()

# 1) dry-run — 아무것도 등록하지 않는다
& ui-workspace/apps/dev-erp-mcp/ops/register-tongs-task.ps1 `
  -LaneRoot <TARGET_SOULFORGE_ROOT>/install/source-lanes/tongs-lane-v1 `
  -StateRoot <private_root>/state `
  -NodePath <NODE_EXE_PATH> `
  -NodeSha256 $NodeSha256
# -> "tongs loopback task dry-run attested: plan_digest=sha256:... trigger=at_logon+PT5M mutation=false"

# 2) 위 plan_digest를 그대로 -ExpectedDryRunDigest에 넣고 -Register -DryRun:$false로 실제 등록.
#    이 호출은 ConfirmImpact가 High라서 대화형 세션에서는 Y/N 확인을 묻는다 — 비대화형으로
#    돌린다면 그 확인을 대신할 -Confirm:$false를 반드시 함께 준다(m9).
& ui-workspace/apps/dev-erp-mcp/ops/register-tongs-task.ps1 `
  -LaneRoot <TARGET_SOULFORGE_ROOT>/install/source-lanes/tongs-lane-v1 `
  -StateRoot <private_root>/state `
  -NodePath <NODE_EXE_PATH> `
  -NodeSha256 $NodeSha256 `
  -ExpectedDryRunDigest sha256:<위에서 나온 값> -Register -DryRun:$false
```

**Vigil에 같은 상태 root를 알린다(§5.1 계약).** 위 두 명령의 `-StateRoot`에 넣은 값을 그대로,
Vigil(`ui-workspace/apps/team-ops-board`)을 띄우는 프로세스 환경에도
`SOULFORGE_TONGS_STATE_ROOT`로 export한다. 이 등록기 자체는 Vigil의 환경을 건드리지 않는다 —
이 값을 Vigil 쪽에 실제로 반영하는 것은 Vigil 실행 lane의 등록기(cutover 세션 몫)이 하는
별도 단계다. 두 값이 갈라지면 lane은 정상 기동해도 `/tongs.snapshot.json`은 `unknown`으로
남는다(§5.1의 "배경" 참고) — Vigil 쪽 값을 확인하지 않고는 이 lane의 등록만으로 화면이
올라온다고 주장하지 않는다.

예약작업 `Soulforge-Tongs-Loopback-v1`의 트리거는 로그온(AtLogOn, 등록을 실행하는 바로 그 계정의
로그온에만 반응하도록 `-User`를 명시한다 — m8, 2026-09-06 검토가 잡음: `-User` 없이는 UserId가
비어 아무 계정의 로그온에나 반응한다) + 5분 반복(무기한, PowerShell이 `New-ScheduledTaskTrigger
-AtLogOn`에 `-RepetitionInterval`을 직접 받지 않는 문제를 회피하려고 `-Once`로 뽑은 `Repetition`
CIM 인스턴스를 복사해 붙인다 — 이 host에서 in-memory로 실측: `Repetition.Duration`이 비어 있으면
무기한이라는 뜻이고, 등록 후 내보낸 XML의 `Repetition/Duration`이 비어 있는지와 `UserId`가
등록 계정과 같은지를 이 등록기 자신의 사후 attestation이 확인한다). 등록 직후에는 AGENTS.md의
lane 전환 규칙대로 등록된 그 인자로 `run-tongs-loopback.ps1 -Preflight`를 한 번 더 실행해 통과를
확인한다(이 등록기 스스로는 그 재확인을 자동 실행하지 않는다 — 등록 명령 출력이 다음 조치로 이를
안내한다).

## 7. 롤백

- 작업 비활성화만으로 충분한 경우: `Disable-ScheduledTask -TaskName Soulforge-Tongs-Loopback-v1`.
  프로세스가 이미 떠 있다면 `ops/stop-tongs-loopback.ps1 -StateRoot <path> -NodePath <path>`로
  멈춘다(m4, 2026-09-06 추가 — 예전에는 이 lane에 정지 도구가 없어 heartbeat가 대는 pid를 그대로
  믿고 `Stop-Process`할 수밖에 없었는데, 그 pid가 바로 M1이 틀릴 수 있다고 지적한 값이었다). 이
  스크립트는 heartbeat의 pid가 실제로 살아 있고 `node` 프로세스이며 그 heartbeat가 말하는 포트를
  지금 쥐고 있을 때만 멈추고, 그렇지 않으면(가짜/부정확한 heartbeat) 아무것도 건드리지 않고
  `verification_failed`를 보고한다 — 자기 자식이 아닌 프로세스를 잘못 죽이지 않는다는 성질을 이
  스크립트 자체가 확인한다. 멈춘 뒤에는 heartbeat가 `status:"stopped"`로 갱신됐는지 확인한다.
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

`--db`를 꼭 준다(M5b, 2026-09-06 검토가 잡음): `dev-erp:mcp-token`이 부르는
`tools/mcp_access_admin.mjs`의 `--db` 기본값은 `<app_dir>/data/dev-erp.db` — 이 **checkout** 안의
사본이지 §3에서 말한 운영 팩 payload의 DB가 아니다. 기본값 그대로 실행하면 World Tree 계정이
그 checkout DB에는 없어서 `account_not_found`로 실패한다(원인이 헷갈리는 방식으로).

```powershell
npm.cmd run dev-erp:mcp-token -- issue --username <HERMES_BOT_ERP_USERNAME> --label "Hermes 강도담" --days 30 --db <TARGET_SOULFORGE_ROOT>/install/server-pack/<x.y.z>/payload/ui-workspace/apps/dev-erp/data/dev-erp.db
```

### 9.2 Ingress registry 초기화 + 발급 (정확히 2줄)

**루트에 `ingress:admin` 스크립트는 없다(M5a, 2026-09-06 검토가 잡음).** 그 스크립트는
`ui-workspace/apps/dev-erp-mcp/package.json`에만 있다 — 저장소 루트에서 `npm.cmd run
ingress:admin`을 그대로 실행하면 "Missing script"로 실패한다. `--prefix`로 그 앱 디렉터리를
지정해야 한다(아래 두 명령의 실제 인자는 `ui-workspace/apps/dev-erp-mcp/ingress_access_admin_cli.mjs`의
`init`/`issue` 서브커맨드 코드와 대조했다).

```powershell
npm.cmd --prefix ui-workspace/apps/dev-erp-mcp run ingress:admin -- init --registry <private_root>/config/tongs/credentials/ingress_auth_registry.v1.json

npm.cmd --prefix ui-workspace/apps/dev-erp-mcp run ingress:admin -- issue --registry <private_root>/config/tongs/credentials/ingress_auth_registry.v1.json --credential hermes-kangdodam-01 --account <OWNER_ACCOUNT_ID> --device main-node-01 --agent hermes-kangdodam --projects <PILOT_PROJECT_CODE> --capabilities upload:team_files,publish:structured_pc_work,publish:run_logs,receipt:read --expires-at <ISO-8601 만료시각> --token-output <private_root>/config/tongs/credentials/hermes-kangdodam-01.token.txt
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
npm run validate:tongs-lane
node guild_hall/validate/local_absolute_path_policy.mjs --scope changed
npm run validate:display-terms
npm --prefix ui-workspace/apps/dev-erp-mcp run test
node guild_hall/validate/run_root_acceptance.mjs --mode validate
npm --prefix ui-workspace/apps/team-ops-board run test
```

`validate:tongs-lane`은 이 lane 자신의 `ops/tongs_lane_support.mjs`(§5.1의 계약 정본인
`guild_hall/shared/tongs_heartbeat_contract.mjs`를 re-export하는 진입점)와 그 테스트만 본다.
§5.1이 정의하는 계약을 Vigil 쪽이 실제로 지키는지는 여기 포함되지 않으므로, 그 계약을 건드릴 때는
위 `npm --prefix ui-workspace/apps/team-ops-board run test`(특히
`src/server/tongs-heartbeat-adapter.test.mjs`)도 함께 초록이어야 한다.

`validate:tongs-lane`은 이제 `run_root_acceptance.mjs`의 `validate`·`done-check` 두 모드 모두에
배선돼 있다(m10, `guild_hall/validate/run_root_acceptance_steps.test.mjs`가 그 배선을 고정한다) —
그전에는 `npm run validate` / `done:check` / CI 어디에서도 이 스위트가 자동으로 돌지 않았다.

`ops/run-tongs-loopback.ps1`, `ops/register-tongs-task.ps1`, `ops/stop-tongs-loopback.ps1`은
PowerShell 파서로 구문만 확인한다(`[System.Management.Automation.Language.Parser]::ParseFile`) —
이 저장소에는 `.ps1` 전용 node:test 러너가 없다. 그래서 이 셋의 실제 동작(재기동 경합·adopt·
loopback 거부·동시 실행 잠금·ingress skip·정지 경로)은 파서 확인만으로는 증명되지 않는다 —
2026-09-06 개정은 워크트리 안에서 임시 고포트(48xxx)로 각 경로를 실제로 실행해 관찰값을
확인했다(커밋 보고 참고). 실제 등록·실제 예약작업 tick의 라이브 검증은 여전히 이 leaf의 범위
밖이다(Owner의 별도 단계).
