# dev-erp Runtime Operating Contract

Status: draft for owner approval
Date: 2026-06-17
Owner: Soulforge owner
Scope: `ui-workspace/apps/dev-erp`

## Runtime Release Audit Gate

Before inviting team members, run the read-only release audit from the
development checkout against the runtime checkout:

```powershell
npm run dev-erp:audit-runtime -- --runtime-root <runtime-checkout> --workspaces <dev-checkout>\_workspaces --nas-root <nas-root> --require-live
```

The audit must report zero blockers before the owner gives final team-opening
approval. It checks DB/schema integrity, `real_meta.json` sync, project/mail set
drift, account/admin readiness, synthetic/demo leakage, WAL-aware backup
posture, NAS latest backup freshness, live health, and selected fantasy skin
assets. The audit is read-only: it must not write the DB and must not read raw
project files, mail bodies, or secret env values.

Use `--target-members <n>` when the approval gate requires a minimum number of
active non-admin accounts. Use `--allow-lan-http` only for an owner-approved
trusted-LAN pilot; omit it for the default Tailscale/localhost posture. With
`--require-live`, unreachable health, missing NAS root, missing restore-test
evidence, dirty source/runtime checkout, and unapproved broad LAN listening are
release blockers rather than warnings.

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
```

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

`<dev-checkout>` 는 개발, 패치, 검토, commit/push 의 자리다. `<runtime-checkout>`
은 승인된 commit 을 받아 실제 서버 프로세스를 돌리는 자리다.

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

## 5. runtime clone 모델

1. `<dev-checkout>` 에서 개발, 패치, review, commit/push 를 한다.
2. `<runtime-checkout>` 은 실제 서버 process 만 돌린다.
3. 팀에게 열기 전 승인된 commit 만 runtime clone 으로 pull 한다.
4. runtime DB, upload, log, local `.env`, service 설정은 Git 에 올리지 않는다.
5. 업데이트 때는 service stop, DB backup, git pull, focused check, service start 순서로 진행한다.

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
