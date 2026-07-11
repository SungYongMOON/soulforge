# guild_hall/doctor

## 목적

- `doctor/` 는 clone 된 PC 에서 Soulforge bootstrap readiness 를 점검하는 cross-project bootstrap doctor capsule 이다.
- 이 capsule 은 local node identity, sync 가능한 Soulforge Codex skill 전체의 설치 여부, 필수 local Codex runtime skill, Codex Stop hook 설정, local env 자리, safe smoke test 결과를 확인하고 local status file 을 남긴다.
- `codex/SKILL.md` 가 없는 registry entry 는 sync 대상이 아니므로 doctor 필수 skill 목록에 넣지 않는다.

## 포함 대상

- `cli.mjs`
  - `guild-hall:doctor` canonical 실행 진입점
  - `--profile public-only|operator|owner-with-state`, `--remote`, `--live`, `--device-capabilities`, `--json` 를 지원한다
- `device_capability_probe.mjs`
  - readiness 와 분리된 device capability advisory 를 만든다
  - 경로, 계정 식별자, workspace alias, target tail, 파일명, raw error 를 출력하지 않고 상태와 개수만 보고한다
- `reporting.mjs`
  - human/json 출력 렌더링과 fatal payload 조립을 맡는 내부 helper
- `live_checks.py`
  - `guild-hall:doctor --live` 가 쓰는 외부 인증/연결 점검기
  - Hiworks POP3 / Hiworks SMTP / Telegram 을 개별 live check 로 보고한다

## local state

- doctor status file 은 `guild_hall/state/doctor/status.json` 에 남긴다.
- 이 경로 아래 실자료는 Git 으로 추적하지 않는다.
- `--device-capabilities` 조기 분기는 status file 을 만들거나 갱신하지 않는다.

## 실행 계약

- 기본 exit code:
  - `0` = requested readiness checks passed
  - `1` = readiness fail
  - `2` = fatal config / internal error
- `--json` 출력은 `schema_version`, `summary`, `results`, `next_steps` 를 포함하는 bootstrap doctor v0 계약을 따른다.
- `--device-capabilities --json` 은 별도 `soulforge.device_capability_probe.v0` 계약을 출력하고 항상 advisory 로 취급한다.
- device capability 모드는 checklist 를 읽지 않고 readiness, `--remote`, `--live` 를 실행하지 않는다. 관찰된 optional input 의 missing/unknown 은 readiness failure 가 아니다.
- device capability 모드는 명시된 유효 `--profile`을 우선하고, 없으면 schema·role·profile이 모두 유효한 local identity, 그것도 없으면 `public-only`를 사용한다. invalid explicit profile이나 malformed identity는 owner identity로 fallback하지 않고 `public-only`로 fail closed한다. `public-only`와 `operator`에서는 `_workmeta` workspace binding과 local capability path/NAS/receipt 설정을 읽거나 probe하지 않는다.
- `operator`, `owner-with-state` 프로필에서는 `guild_hall/state/local/node_identity.yaml` 이 현재 PC 역할, bootstrap profile, active Soulforge root 를 올바르게 가리키는지 확인한다.
- `--remote` 는 GitHub auth, public/private repo remote 연결, `origin/main` 대비 최신 상태를 점검한다.
- `--profile operator` 는 private repo 없이 local operator env 와 smoke/live 를 점검한다.
- `--profile owner-with-state` 는 Soulforge root 아래 nested `private-state/` repo 와 continuity data path 를 추가로 점검한다.
- 모든 프로필에서 `conversation-rule-hardening` local skill 과 knowledge/rule-hardening Stop hook 2개가 실제 local Codex 설정에 있는지 점검한다.

### device capability local 설정

선택 probe 는 Git 비추적 local identity 의 `capability_probe` block 만 설정으로 사용한다. path 값은 로컬에서 존재·mtime 확인에만 쓰고 출력하지 않는다.

```yaml
capability_probe:
  cloud_roots:
    onedrive: <owner-local-path>
    google_drive: <owner-local-path>
  dev_erp_loopback: true
  nas_targets:
    - path: <owner-local-path>
  sync_receipts:
    - path: <owner-local-receipt-path>
      max_age_hours: 24
```

cloud app/process 탐지는 macOS와 Windows의 고정 후보만 확인한다. loopback probe 는 Ollama `127.0.0.1:11434`와, `owner-with-state`에서 설정된 경우 dev-ERP `127.0.0.1:4300`만 사용한다. `owner-with-state` NAS와 receipt 접근에는 bounded timeout 을 적용하고, workspace junction audit도 timeout-bounded child process로 격리한다. Git 관찰 명령은 `GIT_OPTIONAL_LOCKS=0`으로 index stat-cache write를 막는다. profile 밖 private binding은 `skipped`, 미설정 optional input은 `not_configured`, 판별할 수 없는 상태는 `unknown` 으로 보고한다.

## 관련 경로

- [`../../docs/architecture/bootstrap/README.md`](../../docs/architecture/bootstrap/README.md)
- [`../../docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md`](../../docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md)
- [`../../docs/architecture/bootstrap/BOOTSTRAP_CHECKLIST_V0.json`](../../docs/architecture/bootstrap/BOOTSTRAP_CHECKLIST_V0.json)
