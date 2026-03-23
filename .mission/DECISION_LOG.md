# Mission Decision Log

## 목적

- 이 문서는 `.mission/` 운영에서 나온 owner 판단, 용어 정리, readiness 기준을 누적하는 결정 로그다.
- 아직 완전히 정식 매뉴얼로 잠기지 않은 내용도 먼저 남기고, 반복되면 `docs/architecture/workspace/MISSION_MANUAL_DRAFT.md` 나 architecture 문서로 승격한다.

## 기록 원칙

- 왜 그렇게 정했는지 한 줄 이유를 남긴다.
- 나중에 뒤집힐 수 있으면 `current default` 로 적는다.
- sample mission 과 연결될 수 있으면 해당 mission id 를 같이 남긴다.

## 2026-03-18

### 1. `.workflow` 는 유지하고, 실제 실행 주체는 `.mission` 으로 분리

- 결정: `.workflow` 는 reusable 절차 canon 으로 유지하고, 이번 실행 계획은 `.mission` 이 소유한다.
- 이유: `.workflow` 를 다른 이름으로 갈아엎기보다 `.mission` 을 들이는 쪽이 기존 구조 비용이 낮고 더 빨리 닫혔다.

### 2. 수동 절차도 mission 으로 본다

- 결정: 사람이 직접 수행하는 작업도 mission 이다.
- 이유: manual work 와 automated work 를 같은 모델 위에 올려야 promotion 과 autohunt 전환이 자연스럽다.

### 3. raw run truth 는 계속 project-local worksite 에 남긴다

- 결정: `.mission/` 은 held plan / readiness owner 이고, raw truth 는 `_workmeta/<project_code>/runs/<run_id>/` 아래에 둔다.
- 이유: public-safe tracked metadata 와 local/private execution truth 를 섞지 않기 위해서다.

### 4. `mission_check` 는 workflow 가 아니라 skill 이 먼저다

- 결정: `mission_check` 는 guild master / administrator lane 이 쓰는 active skill 로 둔다.
- 이유: readiness review 는 절차보다 먼저 재사용 가능한 검사 능력이며, nightly sweep 이나 runner preflight 가 나중에 같은 능력을 재사용할 수 있다.

### 5. guild master 는 mission readiness 의 공식 owner 다

- 결정: 공식 `ready / blocked / completed` 판정은 길마 lane 이 맡는다.
- 이유: mission readiness 는 상위 운영 판단이며, runner 는 실행 직전 preflight 재확인만 담당하는 쪽이 경계상 자연스럽다.

### 6. `author_skill_package` 는 current default lane 이지만 universal standard 는 아직 아니다

- 결정: `author_skill_package + guild_master_cell + guild_master` 조합은 current default 이다.
- 이유: 사례는 충분히 쌓였지만, future 모든 authoring path 의 universal standard 로 잠그기엔 아직 이르다.

### 7. mission sample 은 pass 와 blocked 둘 다 유지한다

- 결정: `.mission/` 아래에는 completed 예시와 blocked 예시를 같이 둔다.
- 이유: readiness model 은 성공 사례뿐 아니라 “왜 막히는지”를 보여주는 blocked sample 도 있어야 운영 기준이 선다.

## 현재 참고 sample

- completed:
  - `author_pptx_autofill_conversion_001`
- blocked:
  - `author_hwpx_document_001`

