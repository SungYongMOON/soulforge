# dev-erp Runtime Operating Contract

Status: draft for owner approval
Date: 2026-06-17
Owner: Soulforge owner
Scope: `ui-workspace/apps/dev-erp`

## Runtime Release Audit Gate

Before inviting team members, run the read-only release audit from the
development checkout against the runtime checkout:

```powershell
npm run dev-erp:audit-runtime -- --source-root <soulforge-root> --runtime-root <runtime-checkout> --workspaces <soulforge-root>\_workspaces --nas-root <nas-root> --workspace-registry <runtime-checkout>\ui-workspace\apps\dev-erp\data\codex-workspaces.runtime.json --codex-home <codex-worker-home> --codex-trust-domain <trust-domain-id> --codex-worker-url http://127.0.0.1:<worker-port> --codex-worker-expected-identity-sha256 <expected-worker-identity-sha256> --expected-commit <approved-40-char-sha> --require-live
```

The audit must report zero blockers before the owner gives final team-opening
approval. It checks DB/schema integrity, `real_meta.json` sync, project/mail set
drift, account/admin readiness, synthetic/demo leakage, WAL-aware backup
posture, NAS latest backup freshness, the latest committed coherent Codex
DB/message/attachment payload generation and its hash-bound restore evidence,
stored Soulforge snapshot structure and
source-observation freshness, live health, and selected fantasy skin assets.
The audit is read-only: it must not write the DB and must not read raw project
files, mail bodies, or secret env values.

Use `--target-members <n>` when the approval gate requires a minimum number of
active non-admin accounts. Use `--allow-lan-http` only for an owner-approved
trusted-LAN pilot; omit it for the default Tailscale/localhost posture. With
`--require-live`, unreachable health, missing NAS root, missing DB restore-test
evidence, missing/invalid/stale coherent Codex payload backup or matching
`RESTORE_VERIFIED` evidence, dirty source/runtime checkout,
missing/invalid/stale stored snapshot, and unapproved broad LAN listening are
release blockers rather than warnings.
The same gate requires an exact loopback worker URL and live attestation of the
dedicated boundary, ready/matching worker release, approved Windows identity,
separate worker process, matching registry revision, and `app-server` bridge.
Audit output contains only booleans and fixed codes for this proof; it must not
contain the worker identity name/hash or shared token.
Use `--snapshot-freshness` to add the same snapshot readiness check to an
otherwise non-live audit. Structural snapshot validation remains a separate
deterministic check and does not depend on the live private runtime.

### Owner-approved core-only release exception

The dedicated-worker gate above remains the default. The non-default
`--core-only-release` exception is valid only with both explicit owner approval
and `--require-live`. It keeps Codex execution disabled: worker URL, expected
identity, runtime identity, public-key path, and expected attestation key must
all be unconfigured, while live health must report `worker_unattested`,
`codex_worker_configured=false`, and `codex_worker_ready=false`. Any configured
worker binding or non-fail-closed live state is a blocker.

Core-only mode does not waive exact source commit, clean source/runtime Git,
DB/schema/account checks, payload ownership, NAS DB backup and restore test,
coherent v1 Codex payload backup and matching restore verification, stored
snapshot readiness, or live health. It only replaces the dedicated-worker
attestation requirements with the explicit disabled-worker proof.

When `real_meta.json` and the runtime DB have different mail ID sets, preserve
the source file and reconcile metadata without copying raw mail data:

```powershell
# dry-run first
npm run dev-erp:reconcile-mail-set -- --meta <runtime-real-meta> --db <runtime-db> --source-commit <approved-40-char-sha>

# owner-approved apply: byte-exact backup plus hash/count-only receipt
npm run dev-erp:reconcile-mail-set -- --meta <runtime-real-meta> --db <runtime-db> --source-commit <approved-40-char-sha> --backup-root <runtime-metadata-backup-root> --receipt <runtime-mail-set-receipt> --apply

# the receipt and exact commit are re-verified by the live audit
npm run dev-erp:audit-runtime -- --source-root <soulforge-root> --runtime-root <runtime-checkout> --workspaces <soulforge-root>\_workspaces --nas-root <nas-root> --mail-set-reconciliation <runtime-mail-set-receipt> --expected-commit <approved-40-char-sha> --target-members 0 --core-only-release --require-live
```

The sidecar receipt records only counts, SHA-256 values, schema, exact commit,
and the verified backup pointer. It contains no mail ID, subject, sender, or
body. The audit recomputes both ID-set hashes, verifies the byte-exact backup,
and fails closed if the DB, source metadata, backup, receipt, or commit drifts.

## Runtime Maintenance Runbook

The first-release maintenance procedure is documented in
[`RUNTIME_MAINTENANCE_RUNBOOK_20260618.md`](RUNTIME_MAINTENANCE_RUNBOOK_20260618.md).
It covers service restart, watchdog behavior, optional last-resort reboot,
health checks, WAL-safe DB backups, NAS restore-test reports, update procedure,
and troubleshooting.

Operational helpers:

```powershell
npm run dev-erp:health -- --json
npm run dev-erp:backup-runtime -- --db <runtime-db> --nas-root <nas-root> --json
npm run dev-erp:restore-test -- --nas-root <nas-root> --json
npm run dev-erp:backup-codex-payloads -- --db <runtime-db> --attachment-root <soulforge-root>\_workspaces\system\dev-erp\codex-task-attachments --message-root <soulforge-root>\_workspaces\system\dev-erp\codex-message-payloads --backup-root <nas-root>\03_codex_payload_backups
npm run dev-erp:restore-verify-codex-payloads -- --backup-root <nas-root>\03_codex_payload_backups --generation-id <cpb-generation-id> --restore-root <nas-root>\04_codex_payload_restore_tests
npm run dev-erp:backup-codex-payloads-pre-migration -- --db <runtime-db> --attachment-root <soulforge-root>\_workspaces\system\dev-erp\codex-task-attachments --message-root <soulforge-root>\_workspaces\system\dev-erp\codex-message-payloads --backup-root <nas-root>\03_codex_payload_backups
node ui-workspace/apps/dev-erp/tools/codex_payload_backup.mjs pre-migration-restore-verify --backup-root <nas-root>\03_codex_payload_backups --generation-id <pre-migration-generation-id> --restore-root <nas-root>\04_codex_payload_restore_tests
npm run dev-erp:codex-worker
npm run dev-erp:migrate-legacy-codex -- --plan-retire-all --db <runtime-db> --expected-count <owner-confirmed-legacy-binding-count>
npm run dev-erp:migrate-legacy-codex -- --db <runtime-db> --payload-root <soulforge-root>\_workspaces\system\dev-erp\codex-message-payloads --mapping <owner-approved-mapping.json>
npm run dev-erp:migrate-legacy-codex -- --db <runtime-db> --payload-root <soulforge-root>\_workspaces\system\dev-erp\codex-message-payloads --mapping <owner-approved-mapping.json> --apply
```

The coherent backup command must run inside a maintenance boundary: create the
maintenance lock and stop both the ERP service and the dedicated Codex worker
before snapshotting. The DB-only schedule remains useful, but it cannot prove
that DB pointers, message objects, and attachment objects belong to one release
boundary. Release evidence records only the generation ID, manifest SHA-256,
bounded counts/sizes, and restore status; it never records message bodies,
attachment names, raw roots, or Codex auth material.

`dev-erp:backup-codex-payloads` and `dev-erp:restore-verify-codex-payloads` are
v1 release-evidence commands. When legacy inline messages remain, use only the
explicit `dev-erp:backup-codex-payloads-pre-migration` and
`pre-migration-restore-verify` v2 path. v2 is rollback evidence and cannot
satisfy the `--require-live` release audit. After migration, create and verify a
new v1 generation before either service is released.

On Windows mapped network drives, the verifier confirms the mapping with the
OS and keeps the pre-open file identity check strict. After a file has been
read from its pinned handle, mapped-drive inode drift may be ignored only while
realpath, size, mtime, committed SHA-256, and manifest relations remain exact.
Local-drive identity checks are unchanged, and any content or path drift still
fails closed with a redacted stage code.

## Runtime Correction Patch Rule

Runtime DB drift is corrected with a tool, not by committing the DB file.
Dry-run first:

```powershell
npm run correct:runtime -- --workspaces <dev-checkout>/_workspaces
# from Soulforge repo root:
npm run dev-erp:correct-runtime -- --workspaces <dev-checkout>/_workspaces
```

Apply only after reviewing the plan:

```powershell
npm run correct:runtime -- --apply --workspaces <dev-checkout>/_workspaces
# from Soulforge repo root:
npm run dev-erp:correct-runtime -- --apply --workspaces <dev-checkout>/_workspaces
```

The tool creates a SQLite backup before DB writes, updates local
`data/real_meta.json`, updates only safe blank/code-only project titles in the
live DB, and appends a metadata event. It must not read raw workspace files or
secret values.

## 1. 목적

`dev-erp` 는 Soulforge 팀이 실제로 접속하는 ERP 껍데기다. 계정, 세션, RBAC,
대시보드, 운영 입력 폼, 메일 연동 상태, 앱 소유 데이터는 다룰 수 있다. 하지만
Soulforge 정본 구조의 authority 는 아니다.

회사 PC 최초 릴리즈는 개발 checkout 과 분리된 runtime checkout 에서 실행한다.

- 개발 checkout: `<dev-checkout>`
- 운영 checkout: `<runtime-checkout>`
- 앱 루트: `ui-workspace/apps/dev-erp`
- 선택적 runtime 보조 파일 영역: `<runtime-checkout>\DATA`

`<dev-checkout>` 는 개발, 패치, 검토, commit/push 의 자리다. `<runtime-checkout>`
은 승인된 commit 을 받아 실제 서버 프로세스를 돌리는 자리다.

`<runtime-checkout>\DATA`는 ERP가 추가로 관리해야 하는 파일이 생길 때만 쓰는
runtime-local 보조 영역이다. 기존 Soulforge `_workspaces`, Codex message/attachment
payload owner, runtime SQLite, secret/Codex home 경계를 옮기지 않는다. 이 폴더는
Git에서 제외하며 기존 DB·payload·workspace 백업을 유지한 채 별도 copy-only
백업만 추가한다.

## 2. 권한 경계

| Surface | Authority | `dev-erp` 자세 |
| --- | --- | --- |
| `.registry`, `.unit`, `.workflow`, `.party`, `.mission` | Soulforge canon | 승인된 workflow 가 소유한 변경이 아니면 pointer 로 읽고 표시한다. |
| `docs/architecture/**` | root-owned contract | public-safe guidance 로 읽고 링크한다. 계약 authority 를 조용히 대체하지 않는다. |
| `guild_hall/state/**` | cross-project private state | 승인된 operations path 로만 접근한다. raw protected data 를 app DB 에 복사하지 않는다. |
| `_workmeta/<project_code>/**` | project-local private metadata | metadata, pointer, hash, source, status 만 둔다. 원문 파일과 secret 을 저장하지 않는다. |
| `_workspaces/<project_code>/**` | source/output file worksite | 실제 파일은 여기 또는 owner-approved shared worksite 에 둔다. DB 는 path/hash 만 저장한다. |
| `private-state/**` | private continuity data plane | 보호 운영 metadata 와 owner-approved ignored local secret file 위치로 쓴다. |
| `ui-workspace/apps/dev-erp/data/dev-erp.db` | runtime app state | users, sessions, roles, UI state, app module data, integration refs 를 소유한다. Soulforge canon source 가 아니다. |
| `ui-workspace/apps/dev-erp/data/codex-workspaces.runtime.json` | runtime-local Codex workspace mapping | 논리 ID와 local/UNC root를 연결한다. Git/브라우저/감사 로그에는 raw root를 내보내지 않고 secret을 넣지 않는다. |

## 3. 첫 관리자

첫 관리자 계정은 owner 가 직접 만든다. owner 는 UI 또는 console bootstrap flow 에서
계정, 비밀번호, 복구 정보를 직접 입력한다.

agent 는 bootstrap 경로, template, 검증만 준비할 수 있다. 관리자 비밀번호를 묻거나,
읽거나, 출력하거나, 저장하지 않는다.

## 4. 메일 secret 경계

처음에는 owner 메일함 1개부터 시작한다. app DB 는 `mailbox_env_ref` 같은 연동
포인터만 저장하고, 메일 비밀번호, API token, refresh token, cookie, raw `.env`
내용은 저장하지 않는다.

권장 local secret path:

```text
private-state/mail/team/owner.env
```

권장 non-secret template path:

```text
private-state/mail/team/owner.env.template
```

owner 가 `owner.env` 를 직접 만들고 값을 입력한다. agent 는 파일 존재 여부까지만
확인할 수 있으며, 파일을 열거나 값을 echo 하지 않는다.

## 4.1 Codex 팀 작업실 경계

Soulforge `_workspaces`가 유일한 논리 프로젝트 본체다. 실제 바이트가 OneDrive/NAS/
팀 PC worksite에 있어도 `_workspaces/<과제>`의 owner-approved junction/symlink로
materialize하며 runtime checkout에 두 번째 body를 만들지 않는다. runtime-local
등록부의 logical workspace ID만 ERP DB와 브라우저에 노출하고, 스레드 생성 뒤 mapping
변경·공유 폴더 offline은 fail-closed한다. 첫 production slice는 read-only이며
danger-full-access와 write grant를 모두 거부한다. 등록부 row는 non-empty 과제
allowlist와 선택적 계정/역할
allowlist를 가지며, 브라우저에는 현재 item/account에 허용된 ID와 label만 보인다.
`trust_domain_id`는 필수이며 서로 다른 기밀영역은 등록부와 worker를 분리한다.
첨부도 raw path 대신 item-bound opaque ID만 노출한다. 첨부와 대화 본문은 Soulforge
`_workspaces/system/dev-erp`의 service-owned 영역에 저장하고 SQLite에는 opaque
payload ref와 메타데이터만 둔다. worker는 이 canonical root를 읽지 않으며 ERP가
현재 메시지의 선택 첨부만 single-active immutable turn projection으로 복사한다.
projection은 재검증 후 turn 종료 시 삭제한다. HWP는 직접 읽지 않고 HWPX 전처리 후 사용한다.

cwd와 read-only sandbox는 읽기 allowlist 자체가 아니므로 운영 PC에서는 ERP
HTTP/메일 프로세스와 분리된 저권한 Codex worker Windows 계정, 전용
`DEV_ERP_CODEX_HOME`, SMB/NTFS ACL로 실제 읽기 범위를 강제해야 한다. worker는
ERP DB/mail secret/private-state와 다른 trust domain을 읽지 못해야 한다. production
worker는 skill과 project instruction discovery를 항상 끄고 전용 home에는
hooks/plugins/marketplaces/rules/AGENTS/MCP/`config.toml`을 두지 않으며,
network를 차단한다. 각 app-server에는 canonical payload root와 worker 부모를
명시적으로 deny하고 static sanitized cwd와 현재 projected 파일만 다시 읽는
`dev_erp_bounded` permission profile을 강제한다. worker는 시작할 때 source/다른
projection read denial, projection mutation denial, junction/hardlink/network denial을
포함한 turn-projection probe v4를 실제 실행하고, 실패하면
`worker_permission_boundary_unproven`으로 기동하지 않는다. live audit는 signed
profile revision, owner-pinned Codex runtime identity, probe 통과와
`codex_worker_payload_deny_binding_match=true`를 모두 요구한다. 이 pathless binding은
worker 서명 뒤에도 ERP가 exact canonical attachment/message lexical root로 독립 계산한
기대 revision과 비교하며, 두 계산 모두 해당 root를 stat/read하지 않는다.
Enabled workspace root는 local/UNC를 섞지 않으며 UNC는 단일 share namespace만 허용한다.
lexical/realpath/junction/share alias와 보호 이름/link 검사는 stdin-only bounded child가
timeout fail-closed한다. 현재 개발 PC의 Codex 0.144.1 native Windows sandbox는 shell
subprocess의 원본 read denial을 증명하지 못해 probe v4가 실패한다. 실제 팀 PC에서
별도 저권한 worker identity의 NTFS/SMB ACL까지 검증되기 전에는 production 배포를
금지한다. WSL/container는 별도 구현이 필요한 향후 후보다.
SMB 자격증명과 Codex auth는 사용자가 OS/Codex에 직접 설정하고 등록부·DB·Git에
복사하지 않는다. 상세 등록 및 검증 절차는
[`CODEX_TEAM_WORKSPACE.md`](CODEX_TEAM_WORKSPACE.md)를 따른다.

ERP HTTP/메일 identity는 DB·메일·ERP payload만 소유하고 팀 공유폴더 ACL을 갖지
않는다. Codex worker identity는 한 trust domain의 승인 폴더와 전용 Codex home만
소유하고 ERP DB·메일 secret·`private-state` ACL을 갖지 않는다. worker는
`127.0.0.1` 고정 port와 `DEV_ERP_CODEX_WORKER_BRIDGE=app-server`로 먼저 시작한다.
ERP에는 `DEV_ERP_CODEX_TASK_BRIDGE=worker`, 정확한 loopback URL, 같은 canonical
32-byte base64url HMAC/HKDF token, owner가 계산한 expected identity SHA-256과 metadata-only
명령으로 승인한 `DEV_ERP_CODEX_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256`,
worker 공개키와 승인 fingerprint를
주입한다. token 원문은 전송하지 않고 요청/응답 HMAC과 서명된 일회용 channel에만
사용한다. 실제 operation body와 response는 HMAC key와 signed channel에서
HKDF-SHA256으로 파생한 key로 AES-256-GCM 암호화하고 redirect를 거부한다.
실제 thread ID는 worker-only AES-256-GCM keyring의 `dwr2.<kid>.*` ref로
보관한다. HMAC 키 회전은 기존 ref를
무효화하지 않는다. ref key는 active+previous 단계로 회전하며 key를 잃은 binding은
명시적으로 retire하고 fallback하지 않는다.

모델 catalog는 worker identity의 Codex 계정 `model/list`가 소유한다. GPT-5.6이 그
계정에 제공되면 slug와 effort가 동적으로 노출되고, discovery 실패 시 허용되는
fallback은 GPT-5.5 하나뿐이다. fallback 상태는 GPT-5.6 rollout 통과 증거가 아니다.
자동 선택한 GPT-5.6에서 GPT-5.5로 내려갈 때만, 기존 effort가 호환되지 않으면
GPT-5.5 catalog가 광고한 `high`/기본/첫 허용 effort 순으로 다시 선택한다. 직접 선택한
모델이나 같은 모델의 잘못된 effort는 자동 교체하지 않고 중단한다.
legacy inline message와 불완전 binding은 restore-verified v2 pre-migration backup 뒤
owner mapping dry-run이 모든 row를 정확히 bind 또는 retire할 때만 `--apply`를
허용한다. 모두 retire하는 방안을 검토할 때의 `--plan-retire-all` 출력은 metadata-only
candidate일 뿐 owner mapping이나 승인 상태가 아니다. 불완전 binding의 valid-but-stale
project mismatch는 candidate v2의 current item project 기준 retirement에 관찰값,
상태, 합계로 기록하고 실제 stale value까지 candidate hash에 포함한다. invalid project와
실제 mapping conflict는 계속 fail-closed한다. 다른 runtime binding 필드가 모두 완전하고
project만 다른 행도 retirement 후보가 아니라 fail-closed 상태로 유지한다.
message payload ref의 item binding은 `cmp_` 직후 12자의 고정폭 base64url tag로
검증한다. tag 안의 `_`와 `-`는 구분자가 아니며, 형식 정규식과 constant-time item tag
비교를 모두 통과해야 한다. migration cleanup 소유권은 해당 실행의 store instance가 만든
exact ref에만 있고, 이전 실행의 `payload_cleanup_failed`를 새 process가 소급 정리할 수
있는 권한으로 해석하지 않는다.

## 5. runtime clone 모델

1. `<dev-checkout>` 에서 개발, 패치, review, commit/push 를 한다.
2. `<runtime-checkout>` 은 실제 서버 process 만 돌린다.
3. 팀에게 열기 전 승인된 40자 commit SHA만 runtime clone 으로 pull하고 release
   audit의 `--expected-commit`과 live attestation이 같은 SHA인지 확인한다.
4. runtime DB, upload, log, local `.env`, service 설정은 Git 에 올리지 않는다.
5. 업데이트 때는 service stop, DB backup, git pull, focused check, service start 순서로 진행한다.
6. snapshot 또는 ingest adapter 변경의 focused check 는 개발 checkout 과
   runtime checkout 양쪽에서 `npm run validate:dev-erp-snapshot-contract` 를
   실행한다. 이 검증은 producer가 임시 디렉터리에 직접 생성하고
   `validateSnapshot`을 통과한 합성 full public-safe snapshot만 사용하며 live
   DB를 변경하지 않는다. 운영 오픈 전에는 snapshot을 재생성한 뒤
   `--require-live` audit에서 structure와 freshness가 모두 통과해야 한다.

이 구조는 개발 중 dirty worktree 나 반쯤 적용된 patch 가 팀 운영 화면에 노출되는 것을 막는다.

## 6. Tailscale HTTPS 운영

첫 내부 릴리즈는 Tailscale-only HTTPS surface 를 우선한다. Tailscale Funnel 은 public
internet exposure 이므로 owner 가 명시 승인하기 전에는 사용하지 않는다.

권장 형태:

1. runtime PC 에서 `dev-erp` 를 localhost 로 실행한다.
2. Tailscale Serve 로 local port 를 tailnet 내부 HTTPS 로 노출한다.
3. PC 와 휴대폰은 Tailscale app 으로 같은 tailnet 에 연결한 뒤 접속한다.

브라우저 URL 이 HTTPS 일 때 runtime 실행:

```powershell
$env:DEV_ERP_COOKIE_SECURE="1"
node server.mjs --host 127.0.0.1 --port 4300
```

`server.mjs` 의 host/port 는 environment variable 이 아니라 CLI flag 로 지정한다.
`DEV_ERP_COOKIE_SECURE=1` 만 HTTPS cookie 용 runtime environment 이다.

앱이 local 에서 실행 중이면 Tailscale Serve 를 켠다.

```powershell
tailscale serve --bg 4300
tailscale serve status
```

최종 접속 URL 은 `tailscale serve status` 로 확인한다. MagicDNS 와 HTTPS certificate 가
tailnet 에서 활성화되어 있으면 `https://<machine>.<tailnet>.ts.net` 형태가 된다.

pilot 에서는 tailnet IP 직접 접속도 가능하다.

```text
http://<tailscale-ip>:4300
```

단, HTTP URL 로 직접 접속할 때는 `DEV_ERP_COOKIE_SECURE=1` 을 켜지 않는다.

## 7. Tailscale 연결 유지

runtime PC 는 Tailscale Windows service 를 켜고 owner-approved tailnet 에 로그인된
상태를 유지한다. 무인 서버 형태로 쓸 때는 Windows unattended mode 를 사용한다.

```powershell
tailscale up --unattended=true
```

운영 점검 명령:

```powershell
Get-Service Tailscale
tailscale status --self
tailscale ip -4
tailscale serve status
```

휴대폰 접속 조건:

1. 휴대폰에 Tailscale 앱을 설치하고 같은 tailnet 에 연결한다.
2. tailnet ACL 이 휴대폰 사용자 또는 device 에 ERP device 접근을 허용한다.
3. 휴대폰 브라우저에서 Tailscale Serve HTTPS URL 또는 pilot 용 tailnet IP URL 로 접속한다.

## 8. 방화벽과 NSSM 승인

이 ERP 자체가 별도 특권 모델을 요구하지는 않는다. 다만 Windows 운영 편의 기능은
일반적인 관리자 권한이 필요할 수 있다.

- NSSM service install: 관리자 권한 필요.
- Task Scheduler boot task with elevated privilege: 관리자 권한이 필요할 수 있음.
  tracked `register-dev-erp-scheduled-task.ps1` 경로는 이 방식이 아니라 현재 사용자
  `AtLogOn` + `Interactive` + `Limited`이며 credential을 저장하지 않는 foreground 경로다.
- direct LAN access 용 TCP `4300` inbound firewall rule: 관리자 권한 필요.

Tailscale HTTPS 우선 운영의 NSSM 설정은 runtime clone 과 localhost bind 를 가리켜야 한다.

```powershell
nssm install dev-erp "<node_exe_path>" server.mjs --host 127.0.0.1 --port 4300
nssm set dev-erp AppDirectory "<runtime-checkout>\ui-workspace\apps\dev-erp"
nssm set dev-erp AppEnvironmentExtra DEV_ERP_COOKIE_SECURE=1
nssm set dev-erp Start SERVICE_AUTO_START
nssm start dev-erp
```

앱을 `127.0.0.1` 로만 bind 하고 Tailscale Serve 로 노출하면, broad LAN inbound
firewall rule 없이도 pilot 이 가능하다. 앱을 `0.0.0.0` 로 bind 해서 LAN 직접 접속을
허용하면 Private profile 과 의도한 subnet 으로 firewall rule 을 좁힌다.

## 9. owner 승인 gate

팀 초대 전 owner 가 마지막으로 승인한다.

1. runtime clone 이 clean 이고 승인 commit 을 가리킨다.
2. admin bootstrap 이 동작하고 admin 비밀번호는 owner 만 안다.
3. owner mailbox env path 가 있고 secret 값은 owner 가 직접 입력했다.
4. owner 휴대폰 또는 승인된 다른 device 에서 Tailscale 접속이 된다.
5. runtime clone 에서 `verify_gate` 와 smoke check 가 통과한다.
6. DB backup 과 rollback 절차가 적혀 있다.

## 보고서 워크플로우 셸 runtime gate

- 기본 상태는 off 이며, `DEV_ERP_REPORT_WORKFLOW_ENABLED=1` 단독 설정은 효력이 없다.
- fixed shared runner, pinned bundle/source commit, 서로 다른 ERP/worker identity, pass-runner release, ACL probe pass, 별도 actual runtime probe pass, companion `_workmeta` receipt sink, owner approval, 미만료 deployment attestation 의 exact digest 가 모두 일치해야 한다. 현재 actual-probe dependency 가 없으므로 환경 self-attestation 만으로는 활성화할 수 없다.
- body 는 `_workspaces/system/dev-erp/workflow-jobs/**` 밖에 쓰지 않는다. canonical receipt 는 metadata-only 로 `_workmeta/<project>/runs/<job>/workflow_receipt.json` 에만 쓴다.
- synthetic adapter test 는 callable structure 증거일 뿐 production/live 증거가 아니다. actual core validator/runner integration, exact result-receipt digest chain, crash adoption, receipt-only recovery, author/verifier 분리와 post-development review gate 가 별도로 통과해야 한다.
- 조건 하나라도 없거나 mismatch 이면 capability 는 blocker code 만 공개하고 upload/create 를 `503` 으로 닫는다. chat 또는 legacy draft route fallback 은 금지한다.
