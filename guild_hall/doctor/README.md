# guild_hall/doctor

## 목적

- `doctor/` 는 clone 된 PC 에서 Soulforge bootstrap readiness 를 점검하는 cross-project bootstrap doctor capsule 이다.
- 이 capsule 은 설치 여부, local env 자리, safe smoke test 결과를 확인하고 local status file 을 남긴다.

## 포함 대상

- `cli.mjs`
  - `guild-hall:doctor` canonical 실행 진입점
  - `--profile public-only|owner-with-state`, `--remote`, `--live`, `--json` 를 지원한다
- `live_checks.py`
  - `guild-hall:doctor --live` 가 쓰는 외부 인증/연결 점검기
  - Hiworks POP3 / Hiworks SMTP / Telegram 을 개별 live check 로 보고한다

## local state

- doctor status file 은 `guild_hall/state/doctor/status.json` 에 남긴다.
- 이 경로 아래 실자료는 Git 으로 추적하지 않는다.

## 실행 계약

- 기본 exit code:
  - `0` = requested readiness checks passed
  - `1` = readiness fail
  - `2` = fatal config / internal error
- `--json` 출력은 `schema_version`, `summary`, `results`, `next_steps` 를 포함하는 bootstrap doctor v0 계약을 따른다.
- `--remote` 는 GitHub auth, public/private repo remote 연결, `origin/main` 대비 최신 상태를 점검한다.
- `--profile owner-with-state` 는 sibling private state repo 와 continuity data path 를 추가로 점검한다.

## 관련 경로

- [`../../docs/architecture/bootstrap/README.md`](../../docs/architecture/bootstrap/README.md)
- [`../../docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md`](../../docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md)
- [`../../docs/architecture/bootstrap/BOOTSTRAP_CHECKLIST_V0.json`](../../docs/architecture/bootstrap/BOOTSTRAP_CHECKLIST_V0.json)
