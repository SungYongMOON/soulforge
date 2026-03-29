# BOOTSTRAP_PROFILES_V0

## 목적

- 이 문서는 Soulforge clone 이후 어떤 사람이 어떤 범위까지 설치하고 복원해야 하는지 프로필 기준으로 잠근다.
- 기본 clone 은 public `Soulforge` 만 받게 하고, 실제 운영 env 와 private companion 은 필요한 역할에서만 연다.
- 다른 PC 에서 AI 에게 bootstrap 을 맡길 때도 같은 프로필 규칙을 그대로 따르게 한다.

## Chapter 1. 기본 원칙

1. 프로필이 명시되지 않으면 기본값은 `public-only` 다.
2. `public-only` 는 public `Soulforge` repo 만 clone 한다.
3. `operator` 는 public `Soulforge` repo 만 clone 하지만 gateway/town_crier local env 를 만들 수 있다.
4. `owner-with-state` 만 Soulforge root 아래 owner-only `_workmeta/`, `private-state/` repo 를 추가 clone 하고 필요한 기록을 복원한다.
5. `_workmeta/`, `private-state/` 같은 private repo 접근은 owner 의 명시적 지시가 있을 때만 수행한다.
6. 어떤 프로필이든 자격증명과 `.env` 는 각 PC 에서 다시 만든다.
7. AI 는 secret 파일의 내용을 읽지 않고, 파일 경로와 대상 경로만 안내한다.

## Chapter 2. 프로필 정의

### 2.1 `public-only`

- 대상: 팀원, 리뷰어, 일반 사용자, 구조/문서/예제/validator 중심 PC
- clone 대상:
  - public `Soulforge`
- clone 하지 않는 것:
  - `_workmeta/`
  - `private-state/`
- local env:
  - bootstrap doctor safe readiness 에 필수 아님
- 목적:
  - 코드/문서/예제 확인
  - public-safe validator / UI fixture 흐름 확인
  - public repo remote 상태 확인

### 2.2 `operator`

- 대상: public repo 만으로 gateway/town_crier 같은 local operator 기능까지 만질 PC
- clone 대상:
  - public `Soulforge`
- clone 하지 않는 것:
  - `_workmeta/`
  - `private-state/`
- local env:
  - `email_fetch.env`
  - `telegram_notify.env`
  - `notify_policy.yaml`
  - 필요하면 `mail_send.env`
- 목적:
  - gateway / town_crier local 운영
  - operator-safe smoke / live check
  - private repo 없이 local 운영 흐름 재현

### 2.3 `owner-with-state`

- 대상: owner 본인, 실제 업무 기록과 continuity 까지 이어서 봐야 하는 PC
- clone 대상:
  - public `Soulforge`
  - nested `_workmeta/`
  - nested `private-state/`
- 추가 작업:
  - `gh auth status` 확인 후 필요하면 `gh auth login`
  - `_workmeta/` private repo pull
  - private state repo 에서 허용된 기록 subset 만 복원
  - operator local env 재생성
  - 필요하면 doctor safe 후 doctor remote/live 수행

### 2.4 `ai-assisted-bootstrap`

- 대상: clone 후 사용자가 직접 모든 명령을 치지 않고 AI 에게 bootstrap 을 맡기려는 경우
- 규칙:
  - 사용자는 먼저 `public-only`, `operator`, `owner-with-state` 중 하나를 명시한다.
- AI 는 [`README.md`](../../../README.md), [`README.md`](README.md), [`BOOTSTRAP_DOCTOR_V0.md`](BOOTSTRAP_DOCTOR_V0.md), [`../workspace/INSTALLATION_MANUAL_V0.md`](../workspace/INSTALLATION_MANUAL_V0.md) 를 읽고 시작한다.
- 프로필이 명시되지 않으면 AI 는 `public-only` 로 가정한다.
- AI 는 먼저 `npm run guild-hall:doctor -- --profile <profile>` 를 수행하고, `--remote` 와 `--live` 는 각각 해당 프로필 범위의 준비가 된 뒤에만 수행한다.
- AI 는 `gh auth status` 로 인증 상태를 먼저 확인하고, 로그인 안 되어 있으면 `gh auth login` 을 사용자 본인 계정으로 진행하게 한다.
- AI 는 owner 의 명시적 허가 없이 `_workmeta/`, `private-state/` clone/restore 를 시도하지 않는다.
- AI 는 secret 파일을 열어 값을 읽거나 요약하지 않고, 사용자가 직접 복사/입력할 파일 경로만 알려준다.

## Chapter 3. clone 범위

### 3.1 `public-only`

```text
clone:
- Soulforge

skip:
- _workmeta/
- private-state/
- operator env create
- private runtime restore
```

### 3.2 `operator`

```text
clone:
- Soulforge

skip:
- _workmeta/
- private-state/

local create:
- email_fetch.env
- telegram_notify.env
- notify_policy.yaml
- optional mail_send.env
```

### 3.3 `owner-with-state`

```text
clone:
- Soulforge
- _workmeta/
- private-state/

restore:
- PRIVATE_STATE_REPO_V0 기준 허용 subset 만
```

## Chapter 4. AI handoff 규칙

### 4.1 `public-only` handoff

- public `Soulforge` 만 기준으로 bootstrap 한다.
- `_workmeta/`, `private-state/`, operator env 생성은 하지 않는다.
- `npm run guild-hall:doctor -- --profile public-only` 를 먼저 수행한다.
- 필요하면 public-safe validator 와 UI fixture 흐름만 확인한다.

### 4.2 `operator` handoff

- public `Soulforge` 만 기준으로 bootstrap 한다.
- `_workmeta/`, `private-state/` 는 다루지 않는다.
- local env 예시를 복사하고 실제 값은 사용자가 직접 채운다.
- 먼저 `npm run guild-hall:doctor -- --profile operator` 를 수행하고, env 가 채워진 뒤에만 `--live` 를 수행한다.

### 4.3 `owner-with-state` handoff

- public `Soulforge` 와 owner-only nested `_workmeta/`, `private-state/` repo 를 다룬다.
- [`PRIVATE_STATE_REPO_V0.md`](../workspace/PRIVATE_STATE_REPO_V0.md) 기준 허용 subset 만 복원한다.
- `.env`, token, cookie, session 은 복원하지 않고 각 PC 에서 다시 만든다.
- 먼저 `npm run guild-hall:doctor -- --profile owner-with-state` 를 수행하고, private repo clone 뒤에는 `npm run guild-hall:doctor -- --profile owner-with-state --remote`, local env 가 채워진 뒤에만 `npm run guild-hall:doctor -- --profile owner-with-state --live` 를 수행한다.
- Windows PowerShell 에서 `npm.ps1` execution policy 로 막히면 같은 의미로 `npm.cmd run ...` 형태를 쓴다.

## Chapter 5. 완료 기준

### 5.1 `public-only` 완료 기준

- public repo clone 완료
- 필수 프로그램 설치 완료
- sync 가능한 Soulforge skill materialize 완료
- `npm run guild-hall:doctor -- --profile public-only` 통과

### 5.2 `operator` 완료 기준

- public repo clone 완료
- 필수 프로그램 설치 완료
- operator local env/example 자리 생성 완료
- `npm run guild-hall:doctor -- --profile operator` 통과
- 필요 시 `npm run guild-hall:doctor -- --profile operator --live` 통과

### 5.3 `owner-with-state` 완료 기준

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
- `operator` 는 private repo 없이도 local 운영 smoke 를 재현하는 중간 프로필이라고 본다.
- owner 만 private state repo URL 과 접근 권한을 가진다고 본다.
