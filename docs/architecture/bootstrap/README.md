# docs/architecture/bootstrap

## 목적

- `bootstrap/` 은 clone 된 PC 에서 Soulforge 를 실제로 설치하고 readiness 를 확인하는 문서를 한곳에 모은다.
- 사람용 설치 가이드와 agent/doctor 용 실행 가이드를 같은 묶음에서 찾게 한다.

## 포함 대상

- `BOOTSTRAP_DOCTOR_V0.md`
- `BOOTSTRAP_CHECKLIST_V0.json`
- `../workspace/INSTALLATION_MANUAL_V0.md`
- `../workspace/MULTI_PC_DEVELOPMENT_V0.md`
- `../workspace/PRIVATE_STATE_REPO_V0.md`

## 읽는 순서

1. [`../workspace/INSTALLATION_MANUAL_V0.md`](../workspace/INSTALLATION_MANUAL_V0.md)
2. [`../workspace/PRIVATE_STATE_REPO_V0.md`](../workspace/PRIVATE_STATE_REPO_V0.md)
3. [`BOOTSTRAP_DOCTOR_V0.md`](BOOTSTRAP_DOCTOR_V0.md)
4. [`../workspace/MULTI_PC_DEVELOPMENT_V0.md`](../workspace/MULTI_PC_DEVELOPMENT_V0.md)

## 실행 가이드

- clone 후 첫 readiness 점검은 `npm run guild-hall:doctor` 를 canonical entrypoint 로 쓴다.
- safe doctor 는 필수 도구, local env, safe smoke test 를 확인하고 `guild_hall/state/doctor/status.json` 에 결과를 남긴다.
- `npm run guild-hall:doctor -- --live` 는 실제 외부 인증/연결만 확인한다.
- live doctor 는 POP3/SMTP 로그인과 Telegram bot `getMe` 확인까지만 하고, 메일/메시지를 실제로 보내지 않는다.

## 관련 경로

- [`../../README.md`](../../README.md)
- [`../README.md`](../README.md)
- [`BOOTSTRAP_DOCTOR_V0.md`](BOOTSTRAP_DOCTOR_V0.md)
- [`BOOTSTRAP_CHECKLIST_V0.json`](BOOTSTRAP_CHECKLIST_V0.json)
- [`../workspace/INSTALLATION_MANUAL_V0.md`](../workspace/INSTALLATION_MANUAL_V0.md)
- [`../workspace/MULTI_PC_DEVELOPMENT_V0.md`](../workspace/MULTI_PC_DEVELOPMENT_V0.md)
- [`../workspace/PRIVATE_STATE_REPO_V0.md`](../workspace/PRIVATE_STATE_REPO_V0.md)
- [`../../../guild_hall/doctor/README.md`](../../../guild_hall/doctor/README.md)
