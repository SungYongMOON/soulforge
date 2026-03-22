# docs/architecture/bootstrap

## 목적

- `bootstrap/` 은 clone 된 PC 에서 Soulforge 를 실제로 설치하고 readiness 를 확인하는 문서를 한곳에 모은다.
- 사람용 설치 가이드와 agent/doctor 용 실행 가이드를 같은 묶음에서 찾게 한다.

## 포함 대상

- `BOOTSTRAP_PROFILES_V0.md`
- `BOOTSTRAP_DOCTOR_V0.md`
- `BOOTSTRAP_CHECKLIST_V0.json`
- `UPDATE_MANUAL_V0.md`
- `CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`
- `CODEX_OWNER_UPDATE_PROMPT_V0.md`
- `../workspace/INSTALLATION_MANUAL_V0.md`
- `../workspace/MULTI_PC_DEVELOPMENT_V0.md`
- `../workspace/PRIVATE_STATE_REPO_V0.md`

## 읽는 순서

1. [`BOOTSTRAP_PROFILES_V0.md`](BOOTSTRAP_PROFILES_V0.md)
2. [`../workspace/INSTALLATION_MANUAL_V0.md`](../workspace/INSTALLATION_MANUAL_V0.md)
3. [`../workspace/PRIVATE_STATE_REPO_V0.md`](../workspace/PRIVATE_STATE_REPO_V0.md)
4. [`BOOTSTRAP_DOCTOR_V0.md`](BOOTSTRAP_DOCTOR_V0.md)
5. [`UPDATE_MANUAL_V0.md`](UPDATE_MANUAL_V0.md)
6. [`../workspace/MULTI_PC_DEVELOPMENT_V0.md`](../workspace/MULTI_PC_DEVELOPMENT_V0.md)
7. [`CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`](CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md)
8. [`CODEX_OWNER_UPDATE_PROMPT_V0.md`](CODEX_OWNER_UPDATE_PROMPT_V0.md)

## 실행 가이드

- 프로필이 명시되지 않으면 bootstrap 기본값은 `public-only` 다.
- 팀원/공유 대상은 public `Soulforge` 만 clone 하고 private state repo 는 받지 않는다.
- owner 본인만 명시적으로 Soulforge root 아래 `private-state/` repo 를 함께 clone 하고 허용된 subset 만 restore 한다.
- clone 후 AI 에게 bootstrap 을 맡길 때도 먼저 어떤 프로필인지 말한 뒤 `npm run guild-hall:doctor` 를 canonical entrypoint 로 사용한다.
- 설치 후 최신 상태 점검과 pull 절차는 [`UPDATE_MANUAL_V0.md`](UPDATE_MANUAL_V0.md) 를 canonical guide 로 사용한다.
- bootstrap 전 필수 프로그램은 `git`, `gh`, `node`, `npm`, `python3`, `uv` 다.
- bootstrap 전 필수 Soulforge skill 은 `shield_wall`, `record_stitch`, `skill_check` 이고, `npm run skills:sync -- shield_wall record_stitch skill_check` 로 먼저 맞춘다.
- clone 후 첫 readiness 점검은 `npm run guild-hall:doctor` 를 canonical entrypoint 로 쓴다.
- owner PC 에서 nested `private-state/` repo 까지 포함해 점검할 때는 `npm run guild-hall:doctor -- --profile owner-with-state` 를 쓴다.
- safe doctor 는 필수 도구, local env, safe smoke test 를 확인하고 `guild_hall/state/doctor/status.json` 에 결과를 남긴다.
- `npm run guild-hall:doctor -- --remote` 는 GitHub auth, remote 연결, public/private repo 최신 상태를 확인한다.
- `npm run guild-hall:doctor -- --live` 는 실제 외부 인증/연결만 확인한다.
- live doctor 는 POP3/SMTP 로그인과 Telegram bot `getMe` 확인까지만 하고, 메일/메시지를 실제로 보내지 않는다.

## 관련 경로

- [`../../README.md`](../../README.md)
- [`../README.md`](../README.md)
- [`BOOTSTRAP_PROFILES_V0.md`](BOOTSTRAP_PROFILES_V0.md)
- [`BOOTSTRAP_DOCTOR_V0.md`](BOOTSTRAP_DOCTOR_V0.md)
- [`BOOTSTRAP_CHECKLIST_V0.json`](BOOTSTRAP_CHECKLIST_V0.json)
- [`UPDATE_MANUAL_V0.md`](UPDATE_MANUAL_V0.md)
- [`CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`](CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md)
- [`CODEX_OWNER_UPDATE_PROMPT_V0.md`](CODEX_OWNER_UPDATE_PROMPT_V0.md)
- [`../workspace/INSTALLATION_MANUAL_V0.md`](../workspace/INSTALLATION_MANUAL_V0.md)
- [`../workspace/MULTI_PC_DEVELOPMENT_V0.md`](../workspace/MULTI_PC_DEVELOPMENT_V0.md)
- [`../workspace/PRIVATE_STATE_REPO_V0.md`](../workspace/PRIVATE_STATE_REPO_V0.md)
- [`../../../guild_hall/doctor/README.md`](../../../guild_hall/doctor/README.md)
