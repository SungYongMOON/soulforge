# dev-erp — 개발팀 운영 콕핏 (P1: 읽기 전용)

설계 정본: [`docs/DESIGN.md`](docs/DESIGN.md) · 작업 큐: [`docs/checklist_phase1.json`](docs/checklist_phase1.json)

하드웨어/체계공학 개발팀의 운영 레이어. P1 은 read-only 콕핏이다:
프로젝트 홈, 할 일, 메일 이력(메타만), 산출물 포인터, 현장 검색 + 업무/판타지
표시 모드 전환.

## 실행 (의존성 설치 불필요)

```bash
node --watch server.mjs    # 개발 checkout 기본. http://127.0.0.1:4310, DB: data/dev-erp.db
node server.mjs            # 일반 실행. runtime checkout 은 4300, 개발/작업본은 4310
node server.mjs --db :memory:   # 일회성 실행
node server.mjs --fixture  # 데모/검증용 합성 fixture 적재
node server.mjs --ingest path/to/normalized.json   # 실데이터 메타 적재
node server.mjs --host 0.0.0.0 --port 4310  # 개발 LAN 확인(운영 4300과 분리)
DEV_ERP_COOKIE_SECURE=1 node server.mjs --host 127.0.0.1 --port 4300  # runtime HTTPS proxy/tunnel 뒤 운영
DEV_ERP_ALLOW_SELF_REGISTER=1 node server.mjs  # localhost 자가가입 파일럿 전용
DEV_ERP_SKINS_DIR=/path/to/shared/skins node server.mjs  # 공유 판타지 배경 위치 지정
```

HTTP 직접 LAN에서는 `DEV_ERP_COOKIE_SECURE=1` 을 켜지 않는다. Secure cookie 는
HTTPS proxy/tunnel 뒤에서만 로그인 세션이 정상 유지된다. 첫 관리자 이후 자가가입은
기본 차단되며, 팀 운영은 관리자 패널 또는 roster import 로 계정을 만든다.

포트 운영 원칙:

- runtime checkout 운영본만 `4300`을 쓴다.
- 개발 checkout 은 기본 `4310`을 쓴다.
- 개발/작업본에서 `4300`을 쓰려 하면 서버가 기본 거부한다. 긴급 예외만
  `DEV_ERP_ALLOW_DEV_4300=1` 또는 `--allow-dev-4300`으로 명시한다.

운영 메모: AI(Claude)가 코드를 수정하면 `--watch` 실행 중인 서버가 스스로
재시작한다 — 수동 재시작 불필요. 상시 운영(tool_pc 이전 시)은 Soulforge
always-on(launchd) 패턴으로 등록해 부팅 자동 시작 + 비정상 종료 자동 복구를
붙인다 (P2 항목).

- 요구: Node.js 22.5+ (내장 `node:sqlite` 사용. 외부 패키지 0개)
- DB 가 비어 있어도 샘플은 자동 적재하지 않음. 데모가 필요할 때만 `--fixture`
  또는 `DEV_ERP_LOAD_FIXTURE=1` 사용
- 실데이터 적재는 정규화 JSON(`{projects[],items[],mail[],artifacts[]}`) 또는
  soulforge snapshot JSON 의 보수적 매핑만 지원. **원본 폴더를 직접 훑지 않는다**
- `data/real_meta.json` 자동 ingest 는 기본 DB(`data/dev-erp.db`)에만 적용된다.
  별도 DB/메모리 DB는 `--ingest` 또는 `--fixture` 를 명시한다.
- 판타지 배경은 기본으로 `_workspaces/system/dev-erp/skins/`(OneDrive 공유
  worksite)에서 먼저 읽고, 없으면 `static/skins/` 로컬 fallback 을 사용한다.
- 회사 PC 최초 릴리즈는 개발 checkout 이 아니라 별도 runtime checkout
  `<runtime-checkout>` 에서 실행한다. 운영 경계, 고정 운영 포트 `4300`,
  Tailscale HTTPS, 관리자 bootstrap,
  mail secret 경계는 [`docs/RUNTIME_OPERATING_CONTRACT_20260617.md`](docs/RUNTIME_OPERATING_CONTRACT_20260617.md)를 따른다.

## Codex 팀 작업실

ERP의 Codex는 실제 업무 파일을 ERP runtime 폴더로 옮기지 않는다. ignored
runtime-local 등록부가 논리 작업실 ID를 owner-approved local/UNC 폴더에 연결하고,
각 row의 과제·계정·역할 allowlist를 통과한 사용자가 작업실을 직접 확인한 뒤에만
할일 스레드를 그 매핑에 고정한다. 한 등록부의 폴더는 같은 `trust_domain_id`에
속해야 하며, 실제 파일 경계는 ERP HTTP/메일 계정과 분리된 저권한 Codex worker
Windows 계정 및 SMB/NTFS ACL이 담당한다. 대화·첨부 payload는 Soulforge
`_workspaces/system/dev-erp`의 서비스 전용 영역에 두고 ERP DB에는 opaque pointer만
남긴다. 전용 `DEV_ERP_CODEX_HOME`은 hooks/plugins/MCP 없이 사용한다.
`config.toml`도 두지 않으며, 각 app-server는 전체 디스크 기본 거부와 exact-path
read/write를 가진 `dev_erp_bounded` permission profile을 사용한다. worker 시작 시
workspace read, 승인 출력 write, 비승인 write 거부, exact attachment read-only,
sibling/parent 열거 거부, root 밖 read/write 거부, junction/hardlink 우회 및 attachment
삭제·이동 거부를 포함한 probe v3를 실제로 통과하지
못하면 운영 모드로 기동하지 않는다. Enabled workspace root의 lexical/realpath/junction
겹침도 거부하고, 보호 이름·link를 metadata-only로 재귀 검사한다. 한 worker 등록부는
local과 UNC를 섞지 않으며 UNC라면 하나의 `server/share` namespace만 사용한다.
모델 목록은 현재 Codex 계정의
`model/list`를 사용하므로 GPT-5.6이 제공되면 자동으로 선택지에 나타나며, discovery
실패 시 GPT-5.5 하나로만 fallback한다. 폴더 등록 형식, Windows ACL, read-only
기본값, 하위 폴더 임시 쓰기 승인은
[`docs/CODEX_TEAM_WORKSPACE.md`](docs/CODEX_TEAM_WORKSPACE.md)를 따른다.
현재 직접 app-server spawn은 개발 경로이며 별도 `dedicated_worker` identity가
live attestation되기 전에는 release audit가 팀 운영 배포를 차단한다.

운영에서는 Windows identity를 둘로 나눈다. ERP HTTP/메일 identity는 DB·메일
설정·Soulforge의 ERP 전용 payload 영역만 소유하고 팀 공유폴더는 읽지 못한다.
Codex worker identity는 승인된 한 `trust_domain_id`의 공유폴더와 전용
`DEV_ERP_CODEX_HOME`만 읽고 ERP DB·메일 secret·`private-state`는 읽지 못한다.
worker는 `DEV_ERP_CODEX_WORKER_HOST=127.0.0.1`, 고정 worker port,
`DEV_ERP_CODEX_WORKER_BRIDGE=app-server`로 `npm.cmd run dev-erp:codex-worker`를
실행한다. ERP 서비스에는 `DEV_ERP_CODEX_TASK_BRIDGE=worker`, 정확한
`DEV_ERP_CODEX_WORKER_URL=http://127.0.0.1:<worker-port>`, 같은 canonical 32-byte
base64url HMAC/HKDF token, owner가 별도로 계산한
`DEV_ERP_CODEX_WORKER_EXPECTED_IDENTITY_HASH`, worker
공개키 경로와 승인된 공개키 fingerprint, owner가 metadata-only 명령으로 승인한
`DEV_ERP_CODEX_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256`만 주입한다. worker의 ref keyring과
attestation 개인키는 ERP 프로세스에 주입하지 않는다.

Codex runtime aggregate hash는 app-server/model discovery/turn 전후에 다시 검증한다.
Codex CLI 업데이트 시 worker를 중지하고 fingerprint와 probe를 재승인하기 전에는 새
실행 파일로 turn을 시작하지 않는다.

worker token 원문은 전송하지 않고 요청/응답 HMAC 키로만 쓴다. 실제 operation은
worker가 서명한 일회용 channel nonce도 필요하다. operation 요청과 응답은 HMAC key와
signed channel에서 HKDF-SHA256으로 파생한 key로 AES-256-GCM 암호화하고 redirect를
거부한다. 실제 thread ID는 이 HMAC 키와 분리된
AES-256-GCM keyring의 `dwr2.<kid>.*` ref로 보관하므로 HMAC 키 회전은 기존 ref를
무효화하지 않는다. ref key는 새 active key와 이전 key를 함께 두는 단계적 절차로
회전한다. keyring을 잃은 스레드는 조용히 fallback하지 말고 명시적으로 retire한 뒤
새 스레드로 연다. 기존 inline message와 부분 binding은
먼저 `dev-erp:migrate-legacy-codex` dry-run을 검토하고 같은 명령에 `--apply`를
추가해 owner 승인 mapping만 이행한다. 전체 절차와 명령은 runtime runbook을 따른다.

현재 개발 PC의 Codex 0.144.1 native Windows sandbox는 harmless outside-root read
denial probe를 통과하지 못했다. 따라서 실제 팀 PC와 각 실제 UNC mapping에서 같은
probe·ACL preflight가 통과하기 전에는 production 배포하지 않는다. WSL/container는
현재 worker가 지원하는 대안이 아니라 별도 permission profile 구현이 필요한 향후 후보다.

## 팀 온보딩

회사 PC를 신뢰된 호스트로 두고 팀원이 접속한다. 메일 계정 비밀번호/토큰은 그
PC의 비공개 env 파일에 저장하고, ERP DB에는 `mailbox_env_ref` 포인터만 저장한다.
임시 비밀번호가 들어간 roster 파일은 public repo에 두지 않고, import 후 삭제하거나
회사 PC의 ignored/private 위치에만 보관한다.

```bash
npm run dev-erp:import-team-roster -- --db ui-workspace/apps/dev-erp/data/dev-erp.db --roster <private-team-roster.json>
npm run dev-erp:import-team-roster -- --db ui-workspace/apps/dev-erp/data/dev-erp.db --roster <private-team-roster.json> --apply
npm run dev-erp:export-team-mailboxes -- --db ui-workspace/apps/dev-erp/data/dev-erp.db --apply
npm run dev-erp:team-preflight -- --db ui-workspace/apps/dev-erp/data/dev-erp.db
npm run guild-hall:gateway:fetch:team -- --once --dry-run --json
npm run guild-hall:gateway:fetch:team -- --once --json
npm run dev-erp:team-preflight -- --db ui-workspace/apps/dev-erp/data/dev-erp.db
npm run dev-erp:scan-mail-ledger -- --db ui-workspace/apps/dev-erp/data/dev-erp.db --apply
npm run dev-erp:mail-to-task-ledger -- --project P00-000_INBOX --skeleton --skeleton-review-tasks --default-review-days 3 --reminder-days 2 --apply
npm run dev-erp:task-ledger -- --db ui-workspace/apps/dev-erp/data/dev-erp.db --project P00-000_INBOX --apply
```

`import-team-roster` 는 dry-run 이 기본이며, roster 안의 임시 비밀번호는 출력하지
않는다. 기존 계정 비밀번호를 다시 초기화할 때만 `--reset-passwords` 를 붙인다.
`team-preflight` 는 회사 PC 호스트 점검이며 DB·계정·메일함 포인터·메일함
등록부·env 파일 존재 여부를 확인한다. env 파일 내용은 읽지 않고 출력에도 env 경로나
비밀번호를 표시하지 않는다. 첫 실행은 설정 점검이므로 `configuration_ready` 를 보고,
실제 메일 수집 후 두 번째 실행에서 `team_use_ready` 를 확인한다.
`mail-to-task-ledger` 예시는 미배정 인박스용 폴백이며, 프로젝트별 메일 장부는
`--project <프로젝트코드>` 로 반복 실행한다.

## 검증

```bash
npm run test:snapshot-contract
npm test
```

`test:snapshot-contract` 는 producer가 임시 디렉터리에서 직접 만든 합성 full
public-safe snapshot을 `validateSnapshot`으로 검증한 뒤 canonical
`operation_board.*.items`의 nonzero mapping, normalized JSON ingest,
unsupported/missing snapshot schema fail-closed, deterministic fresh/stale 판정을
함께 검증한다. 패치된 UI projection fixture, 실제 업무 데이터, runtime DB는
읽거나 변경하지 않는다.

## Runtime Release Audit

Before opening the company-PC runtime to the team, run the read-only release
audit. It checks runtime DB/schema integrity, `real_meta.json` sync, project
set drift, account/admin readiness, synthetic/demo leakage, WAL-aware backup
posture, NAS latest backup freshness, the latest committed Codex DB/message/
attachment payload generation and matching restore verification, stored snapshot structure/freshness,
live health, fantasy skin assets, and the runtime-local Codex workspace
registry contract/availability. `--require-live` rejects Git/NAS skip flags;
those required checks cannot be bypassed in release mode. Snapshot readiness is a blocker under
`--require-live`; use `--snapshot-freshness` for the same snapshot gate without
requiring live health. Ordinary structural validation remains independent of
live private runtime state.
It does not write to the DB and does not read raw project files, mail bodies,
or secret env values.

```bash
npm run audit:runtime -- --runtime-root <runtime-checkout> --workspaces <dev-checkout>\_workspaces --nas-root <nas-root> --require-live
# from Soulforge repo root:
npm run dev-erp:audit-runtime -- --source-root <soulforge-root> --runtime-root <runtime-checkout> --workspaces <soulforge-root>\_workspaces --nas-root <nas-root> --workspace-registry <runtime-checkout>\ui-workspace\apps\dev-erp\data\codex-workspaces.runtime.json --codex-home <codex-worker-home> --codex-trust-domain <trust-domain-id> --expected-commit <approved-40-char-sha> --require-live
```

Use `--target-members <n>` when the release must include at least that many
active non-admin team accounts. Omit `--allow-lan-http` unless the owner has
approved direct trusted-LAN HTTP exposure for the current pilot.

## Runtime Operations

Runtime operations are documented in
[`docs/RUNTIME_MAINTENANCE_RUNBOOK_20260618.md`](docs/RUNTIME_MAINTENANCE_RUNBOOK_20260618.md).
The small ops helpers are:

```bash
npm run ops:health -- --json
npm run ops:backup-db -- --db data/dev-erp.db --nas-root <nas-root> --json
npm run ops:restore-test -- --nas-root <nas-root> --json
npm run ops:backup-codex-payloads -- --db data/dev-erp.db --attachment-root <soulforge-root>\_workspaces\system\dev-erp\codex-task-attachments --message-root <soulforge-root>\_workspaces\system\dev-erp\codex-message-payloads --backup-root <nas-root>\03_codex_payload_backups
npm run ops:restore-verify-codex-payloads -- --backup-root <nas-root>\03_codex_payload_backups --generation-id <cpb-generation-id> --restore-root <nas-root>\04_codex_payload_restore_tests
```

From the Soulforge repo root:

```bash
npm run dev-erp:health -- --json
npm run dev-erp:backup-runtime -- --db <runtime-db> --nas-root <nas-root> --json
npm run dev-erp:restore-test -- --nas-root <nas-root> --json
npm run dev-erp:backup-codex-payloads -- --db <runtime-db> --attachment-root <soulforge-root>\_workspaces\system\dev-erp\codex-task-attachments --message-root <soulforge-root>\_workspaces\system\dev-erp\codex-message-payloads --backup-root <nas-root>\03_codex_payload_backups
npm run dev-erp:restore-verify-codex-payloads -- --backup-root <nas-root>\03_codex_payload_backups --generation-id <cpb-generation-id> --restore-root <nas-root>\04_codex_payload_restore_tests
```

The DB-only backup remains useful for frequent recovery points, but it is not a
release backup for Codex turns. Before a coherent payload backup, create the
maintenance lock and stop both the ERP service and the dedicated Codex worker
so the DB pointers, immutable message objects, and attachment manifests cannot
change across the generation boundary. Keep only the returned generation ID
and manifest SHA-256 in release evidence; never copy payload bodies into logs.

## Runtime Corrections

Runtime DB data is not shared through Git. When another PC's code patch exposes
metadata drift in the company runtime DB, use the correction tool instead of
copying a DB file through Git.

Dry-run first:

```bash
npm run correct:runtime -- --workspaces <dev-checkout>/_workspaces
# from Soulforge repo root:
npm run dev-erp:correct-runtime -- --workspaces <dev-checkout>/_workspaces
```

Apply with a SQLite backup:

```bash
npm run correct:runtime -- --apply --workspaces <dev-checkout>/_workspaces
# from Soulforge repo root:
npm run dev-erp:correct-runtime -- --apply --workspaces <dev-checkout>/_workspaces
```

The first supported correction is `project_names`: it reads approved workspace
folder or junction names, updates `data/real_meta.json`, backs up
`data/dev-erp.db`, updates blank/code-only project titles in the live DB, and
records an app event. It does not read raw project files or secret values.

## 구조 (DESIGN.md 7절)

- `src/store.mjs` — core_*(업무 진실) / event_log(append-only, used_refs+data_label
  라벨 장착) / game_*(게임 확장, core 는 모름)
- `src/adapter.mjs` — 승인된 메타 표면만 읽는 ingest (불량 행은 skipped 보고)
- `src/lexicon.mjs` — 업무/판타지 이중 사전 (라벨 하드코딩 금지)
- `server.mjs` — node:http API + 정적 서빙 (빌드 단계 없음)
- `static/` — vanilla JS 클라이언트

## 한계 (P1 의도된 것)

- SQLite 파일럿. 소규모 팀 동시 읽기/간헐 쓰기 전제이며, 대규모 동시 쓰기는 PostgreSQL 검토.
- 팀 공개는 회사 PC 호스트 + 계정/RBAC + HTTPS proxy/tunnel 전제.
- 메일 원문/파일 본문 미저장 — 포인터와 메타만
- 전장 뷰(몹 시각화 본격판)는 P-G 별도 페이즈. P1 은 홈 카드의 몹 미터까지만
