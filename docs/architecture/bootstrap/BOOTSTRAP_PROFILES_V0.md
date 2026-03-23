# BOOTSTRAP_PROFILES_V0

## 목적

- 이 문서는 Soulforge clone 이후 어떤 사람이 어떤 범위까지 설치하고 복원해야 하는지 프로필 기준으로 잠근다.
- 기본 clone 은 public `Soulforge` 만 받게 하고, owner 만 명시적으로 Soulforge root 아래 `_workmeta/`, `private-state/` 같은 private repo 를 추가로 받게 한다.
- 다른 PC 에서 AI 에게 bootstrap 을 맡길 때도 같은 프로필 규칙을 그대로 따르게 한다.

## Chapter 1. 기본 원칙

1. 프로필이 명시되지 않으면 기본값은 `public-only` 다.
2. `public-only` 프로필은 public `Soulforge` repo 만 clone 한다.
3. `owner-with-state` 프로필만 Soulforge root 아래 owner-only `_workmeta/`, `private-state/` repo 를 추가 clone 하고 필요한 기록을 복원한다.
4. 설치 완료 기준에는 GitHub CLI 인증 완료가 포함된다.
5. `_workmeta/`, `private-state/` 같은 private repo 접근은 owner 의 명시적 지시가 있을 때만 수행한다.
6. 어떤 프로필이든 자격증명과 `.env` 는 각 PC 에서 다시 만든다.
7. AI 는 secret 파일의 내용을 읽지 않고, 파일 경로와 대상 경로만 안내한다.

## Chapter 2. 프로필 정의

### 2.1 `public-only`

- 대상: 팀원, 리뷰어, 일반 사용자, data 없이 구조와 프로젝트만 받아야 하는 PC
- clone 대상:
  - public `Soulforge`
- clone 하지 않는 것:
  - `_workmeta/`
  - private state repo
- 목적:
  - 코드/문서/예제 확인
  - public-safe 예제 기반 bootstrap
  - doctor safe 체크
  - GitHub auth 와 public remote 상태 확인

### 2.2 `owner-with-state`

- 대상: owner 본인, 실제 업무 기록과 monster/mail history 까지 이어서 봐야 하는 PC
- clone 대상:
  - public `Soulforge`
  - nested `_workmeta/`
  - nested `private-state/`
- 추가 작업:
  - `gh auth status` 확인 후 필요하면 `gh auth login`
  - `_workmeta/` private repo pull
  - private state repo 에서 허용된 기록 subset 만 복원
  - local env 재생성
  - 필요하면 doctor safe 후 doctor live 수행

### 2.3 `ai-assisted-bootstrap`

- 대상: clone 후 사용자가 직접 모든 명령을 치지 않고 AI 에게 bootstrap 을 맡기려는 경우
- 규칙:
  - 사용자는 먼저 프로필을 명시한다.
- AI 는 [`README.md`](../../../README.md), [`README.md`](README.md), [`BOOTSTRAP_DOCTOR_V0.md`](BOOTSTRAP_DOCTOR_V0.md), [`../workspace/INSTALLATION_MANUAL_V0.md`](../workspace/INSTALLATION_MANUAL_V0.md) 를 읽고 시작한다.
- 프로필이 `public-only` 인지 `owner-with-state` 인지 명시되지 않으면 AI 는 `public-only` 로 가정한다.
- AI 는 먼저 `npm run guild-hall:doctor -- --profile <profile>` 를 수행하고, `--remote` 와 `--live` 는 각각 GitHub 연결과 외부 자격증명이 준비된 뒤에만 수행한다.
- AI 는 `gh auth status` 로 인증 상태를 먼저 확인하고, 로그인 안 되어 있으면 `gh auth login` 을 사용자 본인 계정으로 진행하게 한다.
- AI 는 owner 의 명시적 허가 없이 `_workmeta/`, `private-state/` clone/restore 를 시도하지 않는다.
- AI 는 secret 파일을 열어 값을 읽거나 요약하지 않고, 사용자가 직접 복사/입력할 파일 경로만 알려준다.

## Chapter 3. clone 범위

### 3.1 팀원 / 일반 사용자

```text
clone:
- Soulforge

skip:
- _workmeta/
- private-state/
- private runtime restore
```

### 3.2 owner / 개인 다른 PC

```text
clone:
- Soulforge
- _workmeta/
- private-state/

restore:
- PRIVATE_STATE_REPO_V0 기준 허용 subset 만
```

## Chapter 4. AI handoff 규칙

### 4.1 팀원용 handoff

AI 에게 아래 뜻으로 지시한다.

- public `Soulforge` 만 기준으로 bootstrap 한다.
- `_workmeta/`, `private-state/` 같은 private repo 는 받지 않는다.
- local env 예시는 복사하되 실제 값이 필요한 파일만 사용자에게 요청한다.
- secret 값은 agent 가 읽지 않고, 사용자가 직접 원본 파일을 열어 복사하도록 안내한다.
- `npm run guild-hall:doctor -- --profile public-only` 를 먼저 수행한다.
- 필요하면 public-safe 예제로 `fetch/intake` smoke 만 확인한다.

### 4.2 owner 용 handoff

AI 에게 아래 뜻으로 지시한다.

- public `Soulforge` 와 owner-only nested `_workmeta/`, `private-state/` repo 를 다룬다.
- [`PRIVATE_STATE_REPO_V0.md`](../workspace/PRIVATE_STATE_REPO_V0.md) 기준 허용 subset 만 복원한다.
- `.env`, token, cookie, session 은 복원하지 않고 각 PC 에서 다시 만든다.
- secret 파일 내용은 agent 가 읽지 않고, 사용자가 직접 복사/입력한다.
- 먼저 `npm run guild-hall:doctor -- --profile owner-with-state` 를 수행하고, private repo clone 뒤에는 `npm run guild-hall:doctor -- --profile owner-with-state --remote`, local env 가 채워진 뒤에만 `npm run guild-hall:doctor -- --profile owner-with-state --live` 를 수행한다.
- Windows PowerShell 에서 `npm.ps1` execution policy 로 막히면 위 `npm run ...` 명령은 같은 의미로 `npm.cmd run ...` 형태로 실행한다.

## Chapter 5. 완료 기준

### 5.1 `public-only` 완료 기준

- public repo clone 완료
- 필수 프로그램 설치 완료
- GitHub CLI 인증 완료
- local env/example 자리 생성 완료
- `npm run guild-hall:doctor -- --profile public-only` 통과

### 5.2 `owner-with-state` 완료 기준

- public repo clone 완료
- `_workmeta/` clone 완료
- `private-state/` clone 완료
- GitHub CLI 인증 완료
- 허용 subset restore 완료
- local env 재생성 완료
- `npm run guild-hall:doctor -- --profile owner-with-state` 통과
- `npm run guild-hall:doctor -- --profile owner-with-state --remote` 통과
- 필요 시 `npm run guild-hall:doctor -- --profile owner-with-state --live` 통과
- Windows PowerShell 에서는 같은 검증 명령을 필요하면 `npm.cmd run ...` 형태로 실행한다.

## Chapter 6. 연결 문서

- [`README.md`](README.md)
- [`BOOTSTRAP_DOCTOR_V0.md`](BOOTSTRAP_DOCTOR_V0.md)
- [`../workspace/INSTALLATION_MANUAL_V0.md`](../workspace/INSTALLATION_MANUAL_V0.md)
- [`../workspace/MULTI_PC_DEVELOPMENT_V0.md`](../workspace/MULTI_PC_DEVELOPMENT_V0.md)
- [`../workspace/PRIVATE_STATE_REPO_V0.md`](../workspace/PRIVATE_STATE_REPO_V0.md)

## ASSUMPTIONS

- team/shared 배포의 기본값은 data 없는 public clone 이라고 본다.
- owner 만 private state repo URL 과 접근 권한을 가진다고 본다.
