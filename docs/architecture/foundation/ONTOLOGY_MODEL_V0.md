# Ontology Model v0

## 목적

- Soulforge 핵심 개념을 파일 목록이 아니라 `개체 + 관계` 기준으로 읽게 만든다.
- owner 경계를 유지한 채 `무엇이 무엇을 가리키는지`를 흔들리지 않게 고정한다.
- 무거운 graph DB 나 RDF/OWL 도입 전에, 문서 + YAML + refs 기반의 light ontology 기준선을 둔다.

## 한 줄 원칙

- Soulforge 는 핵심 운영 개념을 ontology-style 로 모델링하되, `정의`, `canon entry`, `project-local instance`, `runtime event` 를 owner별로 나눠 저장한다.

## ontology-style 이 의미하는 것

- `species`, `class`, `unit`, `workflow`, `party`, `mission`, `monster`, `artifact`, `event` 는 서로 다른 개체 타입으로 본다.
- 각 개체는 `id`, `kind`, `owner surface`, `주요 관계` 를 분리해서 읽는다.
- 같은 파일도 ontology 관점에서는 `artifact instance` 로 읽는다.
- 같은 artifact 는 시점에 따라 한 mission 의 output 이었다가 다음 mission 의 input 이 될 수 있다.
- runtime log 를 ontology 정의와 섞지 않는다.

## 최소 개체 타입

- `Species`
  - 예: `human`, `orc`, `elf`, `dwarf`, `darkelf`
- `Class`
  - 예: `knight`, `archivist`, `administrator`, `pathfinder`, `marshal`, `auditor`
- `Unit`
  - 실제 배치된 조합
- `Workflow`
  - reusable 절차 canon
- `Party`
  - reusable slot composition
- `Mission`
  - 실제 실행 계획 owner
- `Monster`
  - 요청/일감 종류
- `Artifact`
  - mission 이 만들거나 갱신하는 산출물
- `Event`
  - 상태 전이, 실행 결과, battle log, continuity record

## 최소 관계 타입

- `unit has_species species`
- `unit has_class class`
- `party assigns unit`
- `workflow guides mission`
- `monster triggers mission`
- `mission consumes artifact`
- `mission produces artifact`
- `artifact becomes_input_of next_mission`
- `event records transition`

## owner별 저장 위치

### 1. ontology 정의와 관계 규칙

- public canon 에 둔다.
- 위치:
  - `docs/architecture/foundation/ONTOLOGY_MODEL_V0.md`
  - 필요하면 관련 foundation / workspace 문서
- 여기에 두는 것:
  - 개체 타입 정의
  - 관계 타입 정의
  - owner 경계
  - 저장 위치 규칙

### 2. reusable canon entry

- 각 owner root 에 둔다.
- 위치:
  - `.registry/**`
  - `.workflow/**`
  - `.party/**`
  - `.mission/**`
  - `.unit/**`
- 여기에 두는 것:
  - canonical id
  - reusable package / template / profile
  - schema-constrained entry

### 3. project-local ontology instance

- project-local private metadata 로 둔다.
- 위치:
  - `_workmeta/<project_code>/ontology/`
- 여기에 두는 것:
  - 특정 project 에서 실제 발생한 `monster -> mission -> artifact` 관계
  - project 전용 relation note
  - promotion 전 단계의 private instance mapping
- current-default:
  - project-specific ontology instance 가 실제로 필요할 때만 만든다.
  - 빈 폴더를 미리 만들지 않는다.

### 4. runtime event / continuity

- runtime owner 에 둔다.
- 위치:
  - `guild_hall/state/**`
  - `private-state/**`
- 여기에 두는 것:
  - append-only event
  - recent context
  - continuity mirror
- 여기는 ontology 정의서가 아니라 state/event plane 이다.

## 두지 않는 곳

- 새 top-level `ontology/` root 는 만들지 않는다.
- `_workspaces/<project_code>/` 는 ontology canon 저장 위치가 아니다.
- public repo 에 private project relation truth 를 올리지 않는다.
- `guild_hall/state/**` 는 ontology schema owner 가 아니다.

## current-default 저장 결정

1. ontology 규칙은 public foundation 문서에 둔다.
2. reusable entity truth 는 각 canonical owner root 에 그대로 둔다.
3. project-specific instance graph 는 `_workmeta/<project_code>/ontology/` 에 둔다.
4. runtime event 는 `guild_hall/state/**` 와 `private-state/**` 에 둔다.

## P26-030 예시

- `meeting_followup_request` = `Monster`
- `meeting_20260324_yeyin_body_postrecord_followup_v1` = `Mission`
- `20260324_..._최종정리.md` = `Artifact`
- 관계:
  - monster triggers mission
  - mission consumes compiled summary artifact
  - mission produces minutes / action items / followup artifacts

즉 이 예시는 `_workmeta/P26-030/ontology/` 에 project-local instance 로 남길 수 있지만, 규칙 자체는 public foundation 문서가 소유한다.
