# BOOTSTRAP_DOCTOR_V0

## 목적

- 이 문서는 clone 된 PC 에서 Soulforge readiness 를 점검하는 `guild-hall:doctor` 실행 계약을 잠근다.
- 사람과 에이전트가 공통으로 같은 bootstrap doctor entrypoint 를 쓰게 한다.

## 한 줄 정의

- bootstrap 은 “clone 됐는지 자동 감지”보다, 사용자가 또는 에이전트가 명시적으로 `npm run guild-hall:doctor` 를 실행하는 방식으로 시작한다.

## 실행 명령

```bash
npm run guild-hall:doctor
```

owner profile readiness 를 보려면:

```bash
npm run guild-hall:doctor -- --profile owner-with-state
```

JSON 결과가 필요하면:

```bash
npm run guild-hall:doctor -- --json
```

외부 시스템 live 점검이 필요하면:

```bash
npm run guild-hall:doctor -- --live
```

GitHub auth / remote sync / 실제 최신 상태 점검이 필요하면:

```bash
npm run guild-hall:doctor -- --remote
```

## 점검 범위

- 필수 도구 존재 여부
  - `git`
  - `gh`
  - `node`
  - `npm`
  - `python3`
  - `uv`
- 선택 도구 존재 여부
  - `nlm`
- optional Soulforge skill 설치 여부
- local env / policy file 존재 여부
  - `email_fetch.env`
  - `telegram_notify.env`
  - `notify_policy.yaml`
- optional local env 존재 여부
  - `mail_send.env`
  - sender runner 가 실제 생기기 전까지는 future-ready slot 로만 본다
- profile 기반 local path 여부
  - 기본 프로필은 `public-only`
  - `owner-with-state` 는 sibling private state repo 와 continuity data path 를 추가로 본다
- safe smoke test
  - `node --check guild_hall/gateway/cli.mjs`
  - `node guild_hall/town_crier/cli.mjs status`
  - `python3 -m py_compile ...`
- remote check
  - `gh auth status`
  - public repo `origin` remote 존재 여부
  - public repo `origin/main` 대비 최신 상태
  - `owner-with-state` 프로필이면 private state repo remote 와 최신 상태도 본다
- live smoke test
  - Hiworks POP3 로그인 확인
  - Hiworks SMTP 로그인 확인
  - Telegram `getMe` 확인
  - `--live` 결과는 위 3개를 각각 개별 check 로 보고한다

## 출력과 종료 코드

- doctor 는 local status file `guild_hall/state/doctor/status.json` 을 쓴다.
- required check 와 요청된 live check 가 모두 통과하면 exit code `0`
- readiness fail 이면 exit code `1`
- checklist parse 실패나 내부 fatal error 는 exit code `2`
- default 출력은 사람이 읽기 좋은 text 요약이고, `--json` 을 주면 구조화된 JSON 을 출력한다.

### JSON 출력 계약 v0

top-level:

- `schema_version`
- `doctor_version`
- `checklist_version`
- `mode`
- `profile`
- `generated_at`
- `repo_root`
- `ready`
- `summary`
- `status_file`
- `checklist_file`
- `results`
- `next_steps`
- optional `fatal`
- optional `detail`

result item:

- `id`
- `label`
- `category`
- `required`
- `status`
- `detail`
- optional `fix_hint`
- optional `path`
- optional `command`
- optional `template`

현재 `status` 값은 아래 중 하나다.

- `ok`
- `missing`
- `failed`
- `blocked`
- `skipped`

summary 는 아래 숫자를 포함한다.

- `required_passed`
- `required_total`
- `profile_checks_passed`
- `profile_checks_total`
- `safe_smokes_passed`
- `safe_smokes_total`
- `remote_checks_passed`
- `remote_checks_total`
- `live_smokes_passed`
- `live_smokes_total`

fatal path 도 같은 top-level shape 를 유지한다.

- `ready=false`
- `fatal=true`
- `results` 에 `fatal_internal_error` 1건을 넣는다.
- `detail` 은 fatal cause 원문을 담는다.

doctor 는 missing/failed/blocked result 에 대해 가능하면 item-level `fix_hint` 를 같이 제공한다.

- `fix_hint` 는 자동 실행이 아니라 다음 조치 가이드다.
- 사람과 AI 는 `results[].fix_hint` 를 우선 읽고 복구 순서를 정한다.

## 기본 원칙

1. doctor 기본값은 safe local check 만 수행한다.
2. doctor 프로필 기본값은 `public-only` 다.
3. `--profile owner-with-state` 는 private state repo 와 continuity data path 를 추가로 본다.
4. `--remote` 는 GitHub auth, remote 연결, public/private repo 최신 상태를 본다.
5. `--live` 는 외부 인증/연결만 수행하고, 메일/메시지 실제 발송은 하지 않는다.
6. live mail fetch 나 Telegram send 는 doctor 기본 범위 밖이다.
7. bootstrap readiness 와 실제 업무 실행은 분리한다.

## clone 감지 원칙

- clone 사실 자체를 doctor 의 자동 트리거로 쓰지 않는다.
- 대신 `guild_hall/state/doctor/status.json` 이 없거나 local env 가 비어 있으면, 에이전트가 `guild-hall:doctor` 실행을 권장할 수 있다.
- 즉 clone 감지는 안내 힌트이고, 실제 실행 트리거는 명시적 command 다.

## 언제 어떤 모드를 쓰는가

- clone 직후: `npm run guild-hall:doctor`
- owner PC 에서 private state clone 직후: `npm run guild-hall:doctor -- --profile owner-with-state`
- GitHub 최신 상태를 점검할 때: `npm run guild-hall:doctor -- --remote`
- env 와 policy 를 채운 직후: `npm run guild-hall:doctor`
- 실제 외부 연결을 붙이기 직전: `npm run guild-hall:doctor -- --live`
- 운영 중 이상 징후가 있을 때: safe 먼저, 그다음 필요할 때만 live

## 관련 경로

- [`BOOTSTRAP_CHECKLIST_V0.json`](BOOTSTRAP_CHECKLIST_V0.json)
- [`../workspace/INSTALLATION_MANUAL_V0.md`](../workspace/INSTALLATION_MANUAL_V0.md)
- [`BOOTSTRAP_PROFILES_V0.md`](BOOTSTRAP_PROFILES_V0.md)
- [`../workspace/MULTI_PC_DEVELOPMENT_V0.md`](../workspace/MULTI_PC_DEVELOPMENT_V0.md)
- [`../workspace/PRIVATE_STATE_REPO_V0.md`](../workspace/PRIVATE_STATE_REPO_V0.md)
- [`../../../guild_hall/doctor/README.md`](../../../guild_hall/doctor/README.md)
