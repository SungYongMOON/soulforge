# 2026-03-10 Option 1 문서 정합성 보강 계획

## 상태

- 진행 상태: 완료
- 기준 옵션: 옵션 1 `문서 정합성 보강`
- 계획 저장 위치: `.agent_class/docs/plans/`

## 목적

Soulforge의 현재 문서 세트와 메타 파일을 기준으로, 구현 진입 전 단계에서 문서 정합성, 용어 일관성, 메타 규약 설명, `.project_agent` 최소 스키마 기준을 보강한다.

## 범위

- `AGENTS.md` 축약
- 세계관 대응 문서 추가
- `class.yaml` / `loadout.yaml` 규약 문서 보강
- `.project_agent` 최소 스키마 문서 추가
- 문서 간 용어 정합성 점검
- 최종 결과를 지정된 출력 형식으로 보고

## ASSUMPTIONS

- [x] 현재 실행 범위는 옵션 1 기준의 문서 보강이며, 구현 코드, runtime, example project 생성은 제외한다.
- [x] `.agent_class/class.yaml` 과 `.agent_class/loadout.yaml` 은 bootstrap scaffold로 유지하고, 직접 수정은 문서와의 명시적 충돌이 있을 때만 검토한다.
- [x] 새로 제공된 문서 소유 원칙은 검토 기준으로 반영하되, 기존 root 문서의 대량 이동은 이번 실행 범위에 포함하지 않는다.
- [x] class 소유 문서의 최종 relocation은 별도 계획 문서로 관리하고, 이번 실행에서는 무계획 이동을 하지 않는다.

## 사전 확인 체크리스트

- [x] 현재 기준 파일을 다시 확인한다: `AGENTS.md`, `README.md`, `docs/architecture/*`, `.agent_class/class.yaml`, `.agent_class/loadout.yaml`.
- [x] 워킹트리가 clean인지 확인한다.
- [x] 옵션 1 원문 요구사항과 추가 프롬프트의 문서 소유 원칙이 충돌하는 지점을 메모한다.
- [x] 이번 실행의 산출물이 "문서 보강"인지 "문서 이동"인지 경계를 잠근다.

## 작업 체크리스트

### 1. 기준 용어표 고정

- [x] `body`, `species`, `class`, `profession`, `memory`, `knowledge`, `workflow`, `project field`, `project contract` 의 표준 용어를 정한다.
- [x] 구조 문서에서 쓸 기본 용어와 세계관 문서에서만 허용할 보조 용어를 구분한다.
- [x] 같은 뜻을 다른 말로 흔드는 기존 문장을 수집한다.
- [ ] 검증 기준: 이후 수정 문서에서 핵심 용어가 동일한 문맥에 동일한 이름으로 쓰인다.

### 2. `AGENTS.md` 축약 설계

- [x] `AGENTS.md` 에서 행동을 바꾸는 규칙만 남길 섹션을 표시한다.
- [x] 세계관 설명, canonical tree, 작업 우선순위, 오픈 이슈 등 docs로 내려갈 섹션을 표시한다.
- [x] 축약 후에도 남아야 할 핵심 규칙 목록을 고정한다.
- [ ] 검증 기준: 문서 길이가 대략 20~35% 줄고, bootstrap/setup 헌장 역할이 선명해진다.

### 3. `AGENT_WORLD_MODEL.md` 작성

- [x] 새 문서의 목적을 "세계관 대응 설명"으로 고정한다.
- [x] `.agent`, `.agent_class`, `_workspaces`, `.project_agent` 의 세계관 대응 관계를 표 또는 대응 목록으로 정리한다.
- [x] `memory` 와 `knowledge`, `skills` 와 `tools`, `class` 와 `loadout` 의 차이를 명시한다.
- [x] README의 세계관 설명과 표현 충돌이 없는지 점검한다.
- [ ] 검증 기준: 판타지형 톤을 유지하면서도 실제 폴더 구조와 모순되지 않는다.

### 4. `class.yaml` / `loadout.yaml` 규약 문서 보강

- [x] 현재 `.agent_class/class.yaml` 필드를 전수 확인한다.
- [x] 현재 `.agent_class/loadout.yaml` 필드를 전수 확인한다.
- [x] `class.yaml` 은 "설치된 직업의 정적 정의"라는 점을 문서에 명시한다.
- [x] `loadout.yaml` 은 "현재 장착 상태표"라는 점을 문서에 명시한다.
- [x] 각 필드의 의미와 기대 책임을 문서에 적는다.
- [x] bootstrap class `soulforge.base` 가 최종 직업이 아니라 scaffold 라는 점을 문서에 반영한다.
- [ ] 검증 기준: YAML을 읽지 않아도 두 파일의 역할 차이를 문서만으로 이해할 수 있다.

### 5. `.project_agent` 최소 스키마 문서 추가

- [x] 새 문서의 파일명을 확정한다.
- [x] `contract.yaml` 의 목적과 최소 필드를 정의한다.
- [x] `capsule_bindings.yaml` 의 목적과 최소 필드를 정의한다.
- [x] `workflow_bindings.yaml` 의 목적과 최소 필드를 정의한다.
- [x] `local_state_map.yaml` 의 목적과 최소 필드를 정의한다.
- [x] 네 파일의 관계와 사용 시점을 정리한다.
- [x] 추적 가능한 정보와 host-local 정보의 경계를 적는다.
- [ ] 검증 기준: 실제 예시 파일이 없어도 `.project_agent` 의 최소 계약이 이해된다.

### 6. 교차 문서 반영

- [x] README 문서 목록에 새 문서를 반영한다.
- [x] `CURRENT_DECISIONS.md` 의 기준 문서 목록을 갱신한다.
- [x] `WORKSPACE_PROJECT_MODEL.md` 에 `.project_agent` 스키마 문서 연결 또는 요약을 반영한다.
- [x] `AGENT_CLASS_MODEL.md` 와 `INSTALLATION_AND_LOADOUT_CONCEPT.md` 의 설명 경계를 정리한다.
- [x] 필요 시 `TARGET_TREE.md` 에 새 문서 기준을 간접 참조하도록 정리한다.
- [ ] 검증 기준: 새 문서가 고립되지 않고 기존 architecture 문서 세트에 편입된다.

### 7. 문서 소유 원칙 영향 기록

- [x] 추가 프롬프트의 원칙인 "루트 docs는 루트 설명만"을 현재 작업에 어떻게 해석할지 명시한다.
- [x] body 소유 문서 후보와 class 소유 문서 후보를 메모한다.
- [x] 대량 이동은 하지 않고, 필요하면 후속 relocation 계획 문서를 별도로 만든다는 원칙을 적는다.
- [ ] 검증 기준: 이번 실행 결과가 새 문서 소유 원칙과 정면 충돌하지 않는다.

### 8. 최종 검증

- [x] 구현 코드, runtime, top-level `configs/`, `scripts/`, `tests/` 가 추가되지 않았는지 확인한다.
- [x] 문서 변경이 현재 목표 트리와 충돌하지 않는지 확인한다.
- [x] `AGENTS.md` 축약 폭과 핵심 규칙 유지 여부를 점검한다.
- [x] 용어 일관성을 전체 문서 기준으로 다시 점검한다.
- [ ] 검증 기준: 완료 조건을 문서만으로 확인할 수 있다.

### 9. 결과 보고

- [x] 최종 출력 형식을 아래 순서로 고정한다.
- [x] `1. 변경 파일 목록`
- [x] `2. 핵심 변경 요약`
- [x] `3. 남은 오픈 이슈`
- [x] `4. 다음 작업 제안`
- [x] 실행 중 모호한 판단이 있었다면 `ASSUMPTIONS` 를 결과 앞에 짧게 붙인다.
- [ ] 검증 기준: 첨부 프롬프트의 결과 보고 형식과 일치한다.

## 예상 변경 대상

- [x] `AGENTS.md`
- [x] `README.md`
- [x] `docs/architecture/AGENT_CLASS_MODEL.md`
- [x] `docs/architecture/WORKSPACE_PROJECT_MODEL.md`
- [x] `docs/architecture/INSTALLATION_AND_LOADOUT_CONCEPT.md`
- [x] `docs/architecture/CURRENT_DECISIONS.md`
- [x] 필요 시 `docs/architecture/TARGET_TREE.md`
- [x] 신규 `docs/architecture/AGENT_WORLD_MODEL.md`
- [x] 신규 `.project_agent` 최소 스키마 문서

## 완료 조건

- [x] `AGENTS.md` 가 더 짧고 명확해진다.
- [x] architecture 문서 세트가 더 완전해진다.
- [x] `AGENT_WORLD_MODEL.md` 가 생긴다.
- [x] `.project_agent` 최소 스키마 기준이 생긴다.
- [x] 현재 구조와 문서 사이의 용어 충돌이 줄어든다.
- [x] 결과 보고가 지정된 형식으로 정리된다.
