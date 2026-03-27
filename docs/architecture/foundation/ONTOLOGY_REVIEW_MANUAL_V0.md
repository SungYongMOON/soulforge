# Ontology Review Manual v0

## 목적

- Soulforge 가 project-local 반복 패턴을 넘어서 cross-project 개체/관계 기준선을 놓치지 않게 한다.
- 현재 프로젝트가 아니더라도, reusable concept 가 보이면 `ontology candidate` 로 기억하고 later promotion 이 가능하게 만든다.
- `guild_master` / `night_watch` lane 이 이 후보를 계속 carry-forward 하게 만든다.

## 한 줄 규칙

- 새 상위 개념, 새 관계 패턴, 반복되는 reusable entity 경계가 보이면 `ontology review candidate` 로 기록하고, 사라지지 않게 carry-forward 한다.

## 언제 ontology review 를 한다

아래 중 하나라도 보이면 ontology review candidate 로 본다.

1. 새 개체 타입이 생겼다.
   - 예: 기존 `monster`, `mission`, `artifact`, `event` 만으로 설명되지 않는 reusable concept
2. 새 관계 타입이 생겼다.
   - 예: `monster -> mission`, `mission -> artifact` 외에 반복되는 stable relation
3. 같은 패턴이 두 번 이상 반복됐다.
   - 예: 서로 다른 task 나 project 에서 같은 entity/relation shape 가 다시 나타남
4. autohunt, workflow, party, mission, class, data contract 로 승격하려는데 상위 개념 정의가 먼저 필요하다.
5. owner boundary 혼선의 근본 원인이 “개념이 아직 안 나뉘어 있음”으로 보인다.

## 누가 기억하나

- 현재 executor
  - candidate 를 처음 발견한 세션에서 기록 책임을 진다.
- project-local owner
  - `_workmeta/<project_code>/reports/procedure_capture/promotion_candidate_register.md` 에 candidate 를 남긴다.
- `guild_master` / `night_watch`
  - cross-project 또는 root-level 로 승격될 가능성이 보이면 `guild_hall/state/operations/soulforge_activity/**` 에 carry-forward 한다.
  - 다음 session 이나 다른 PC 가 이어받아도 candidate 가 사라지지 않게 한다.

## 어디에 저장하나

### 1. 공통 규칙과 정의

- public canon
- 위치:
  - `docs/architecture/foundation/ONTOLOGY_MODEL_V0.md`
  - `docs/architecture/foundation/ONTOLOGY_REVIEW_MANUAL_V0.md`

### 2. project-origin candidate

- private project metadata
- 위치:
  - `_workmeta/<project_code>/reports/procedure_capture/promotion_candidate_register.md`
- 기록 방식:
  - `promotion_target: ontology`
  - current maturity
  - 어떤 entity/relation candidate 인지
  - 왜 project-local 을 넘어서는지

### 3. cross-project carry-forward

- guild master recent-context surface
- 위치:
  - `guild_hall/state/operations/soulforge_activity/events/YYYY/YYYY-MM.jsonl`
  - `guild_hall/state/operations/soulforge_activity/latest_context.json`
  - 필요하면 `log/YYYY/YYYY-MM-DD/*.md`
- 기록 방식:
  - `carry_forward: true`
  - ontology review candidate 임을 summary 또는 next_action 에 명시

### 4. promoted canon

- public-safe 로 추상화가 끝났고 reusable 하다고 판단되면
  - `docs/architecture/foundation/**`
  - `docs/architecture/workspace/**`
  - `.registry/**`, `.workflow/**`, `.party/**`, `.mission/**`
  중 적절한 owner 로 승격한다.

## 언제까지 carry-forward 하나

- 아래 중 하나가 될 때까지 유지한다.
  - `observed`: 한 번 봄
  - `repeating`: 두 번 이상 반복
  - `promotion_draft`: public-safe 승격 초안 준비됨
  - `promoted`: canon 반영 완료
  - `rejected`: ontology 승격 불필요로 판정

`guild_master` / `night_watch` 는 `promoted` 또는 `rejected` 되기 전까지 candidate 를 잊지 않도록 recent-context 에 남긴다.

## current-default 운영 규칙

1. 프로젝트 작업 중 ontology candidate 를 보면 먼저 `_workmeta` candidate register 에 남긴다.
2. cross-project 또는 root-level 가능성이 보이면 같은 세션에 `guild_hall/state/operations/soulforge_activity/**` 에 carry-forward 한다.
3. `night_watch` 는 context drift / boundary 관점에서 ontology candidate 를 다시 찾아내고 상기한다.
4. public canon 승격은 private detail 을 벗긴 뒤 수행한다.
