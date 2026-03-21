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

JSON 결과가 필요하면:

```bash
npm run guild-hall:doctor -- --json
```

외부 시스템 live 점검이 필요하면:

```bash
npm run guild-hall:doctor -- --live
```

## 점검 범위

- 필수 도구 존재 여부
  - `git`
  - `node`
  - `npm`
  - `python3`
  - `uv`
- 선택 도구 존재 여부
  - `nlm`
- optional Soulforge skill 설치 여부
- local env / policy file 존재 여부
  - `email_fetch.env`
  - `mail_send.env`
  - `telegram_notify.env`
  - `notify_policy.yaml`
- safe smoke test
  - `node --check guild_hall/gateway/cli.mjs`
  - `node guild_hall/town_crier/cli.mjs status`
  - `python3 -m py_compile ...`
- live smoke test
  - Hiworks POP3 로그인 확인
  - Hiworks SMTP 로그인 확인
  - Telegram `getMe` 확인

## 출력과 종료 코드

- doctor 는 local status file `guild_hall/state/doctor/status.json` 을 쓴다.
- required check 가 모두 통과하면 exit code `0`
- 하나라도 빠지면 exit code `1`
- default 출력은 사람이 읽기 좋은 text 요약이고, `--json` 을 주면 구조화된 JSON 을 출력한다.

## 기본 원칙

1. doctor 기본값은 safe local check 만 수행한다.
2. `--live` 는 외부 인증/연결만 수행하고, 메일/메시지 실제 발송은 하지 않는다.
3. live mail fetch 나 Telegram send 는 doctor 기본 범위 밖이다.
4. bootstrap readiness 와 실제 업무 실행은 분리한다.

## clone 감지 원칙

- clone 사실 자체를 doctor 의 자동 트리거로 쓰지 않는다.
- 대신 `guild_hall/state/doctor/status.json` 이 없거나 local env 가 비어 있으면, 에이전트가 `guild-hall:doctor` 실행을 권장할 수 있다.
- 즉 clone 감지는 안내 힌트이고, 실제 실행 트리거는 명시적 command 다.

## 언제 어떤 모드를 쓰는가

- clone 직후: `npm run guild-hall:doctor`
- env 와 policy 를 채운 직후: `npm run guild-hall:doctor`
- 실제 외부 연결을 붙이기 직전: `npm run guild-hall:doctor -- --live`
- 운영 중 이상 징후가 있을 때: safe 먼저, 그다음 필요할 때만 live

## 관련 경로

- [`BOOTSTRAP_CHECKLIST_V0.json`](BOOTSTRAP_CHECKLIST_V0.json)
- [`../workspace/INSTALLATION_MANUAL_V0.md`](../workspace/INSTALLATION_MANUAL_V0.md)
- [`../workspace/MULTI_PC_DEVELOPMENT_V0.md`](../workspace/MULTI_PC_DEVELOPMENT_V0.md)
- [`../workspace/PRIVATE_STATE_REPO_V0.md`](../workspace/PRIVATE_STATE_REPO_V0.md)
- [`../../../guild_hall/doctor/README.md`](../../../guild_hall/doctor/README.md)
