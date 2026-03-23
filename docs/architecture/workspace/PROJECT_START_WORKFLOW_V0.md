# PROJECT_START_WORKFLOW_V0

## 목적

- 이 문서는 실제 프로젝트를 Soulforge 현장에 붙인 뒤, 첫 과제를 시작할 때 따르는 local-first workflow 를 잠근다.
- 첫 시작 단계에서 무엇을 바로 실행하고, 무엇을 local-only 로 기록하고, 무엇을 나중에 정본 문서로 승격할지 구분한다.
- 사람과 Codex 가 함께 작업할 때 기록 위치와 승격 기준을 명확히 한다.

## 한 줄 정의

- project start workflow 는 `project materialize -> worklog open -> bounded first task -> local fix -> local note update -> workflow capture -> stable rule promotion` 순서로 움직이는 local-first 운영 절차다.

## 정본 규칙

1. tracked 정본 문서에는 실제 project code, 실제 과제명, 실제 고객/거래처명, 실제 display name 을 적지 않고 generic example 만 쓴다.
2. 실제 프로젝트별 working note 와 실험 결과는 `_workspaces/<project_code>/.project_agent/reports/onboarding/` 아래 local-only 로 남긴다.
3. 사람과 Codex 가 같이 진행한 판단, blocker, 다음 액션은 `_workspaces/<project_code>/.project_agent/reports/onboarding/project_start_worklog.md` 에 append 한다.
4. 근거 파일, export, 비교본, preview 결과는 `_workspaces/<project_code>/.project_agent/artifacts/onboarding/` 아래에 둔다.
5. 첫 과제 시작은 항상 bounded scope 1건으로 열고, 성공 조건과 종료 조건을 먼저 적는다.
6. first task 진행 중 생긴 규칙은 먼저 local-only worklog/note 로 검증하고, 안정화된 뒤에만 정본 manual 과 changelog 로 승격한다.
7. 새로 시작하는 어떤 행위든 절차를 저장하고 workflow 화할 수 있게 worklog 와 관련 note 를 같이 연다.
8. 사용자가 따로 요청하지 않아도, 사람과 Codex 가 대화하며 진행한 실제 작업 순서, 판단, blocker, 다음 액션은 worklog 에 남긴다.
9. worklog 에서 반복 가능한 절차로 확인된 내용은 workflow 문서 초안 또는 정본 manual 로 승격할 수 있게 구조화해 남긴다.
10. project assignment 와 자료 분류에 쓰는 힌트는 실제 비밀 project code 나 내부 관리번호보다 비밀성이 낮은 대표 업무명 또는 공개 가능한 주제어를 우선 사용한다.
11. 여러 과제에 걸쳐 재사용되는 약어, 제품군명, 일반 사업유형은 단독 판정 키로 쓰지 않고 보조 힌트로만 취급한다.

## 시작 절차

1. `_workspaces/<project_code>/` materialization 상태를 확인한다.
2. `.project_agent/` 가 없으면 `draft` skeleton 을 만든다.
3. `reports/onboarding/project_start_worklog.md` 를 만들고 첫 entry 를 남긴다.
4. 실제 자료를 read-only 로 훑어 첫 과제 후보를 1건만 정한다.
5. first task 의 입력, 출력, blocker, 종료 조건을 worklog 에 적는다.
6. bounded first run/use 를 실행한다.
7. 실행 중 나온 수정점은 local-only 로 먼저 반영한다.
8. 대화와 작업에서 실제로 밟은 순서를 worklog 와 관련 note 에 append 한다.
9. 결과 note 와 artifact 를 정리한다.
10. repeatable rule 로 확인된 것만 tracked 정본 문서로 승격한다.

## worklog entry 최소 항목

- 날짜
- 현재 단계
- 이번에 한 일
- 실제로 밟은 순서
- 확인한 사실
- blocker
- 다음 액션

## 권장 파일 배치

```text
_workspaces/<project_code>/
└── .project_agent/
    ├── reports/
    │   └── onboarding/
    │       ├── project_start_worklog.md
    │       └── YYYY-MM-DD_<topic>.md
    └── artifacts/
        └── onboarding/
            └── <preview-or-evidence-files>
```

## 승격 기준

- 한 번성 실험 메모는 local-only 로 유지한다.
- 다른 프로젝트에서도 재현 가능한 절차만 정본 문서로 승격한다.
- 승격 시에도 실제 프로젝트 식별자는 generic placeholder 로 치환한다.

## 자동 기록 원칙

- 새 시작 행위는 worklog open 없이 진행하지 않는 것을 기본안으로 본다.
- 사람과 Codex 의 대화에서 정해진 순서가 실제 작업 순서로 이어졌다면, 그 흐름은 사용자가 따로 요청하지 않아도 worklog 와 workflow note 에 남긴다.
- 자동 기록의 기본 대상은 `project_start_worklog.md` 이고, 주제가 분리되면 `YYYY-MM-DD_<topic>.md` note 로 확장한다.

## 관련 경로

- [`PROJECT_ONBOARDING_V0.md`](PROJECT_ONBOARDING_V0.md)
- [`WORKSPACE_PROJECT_MODEL.md`](WORKSPACE_PROJECT_MODEL.md)
- [`PROJECT_AGENT_MINIMUM_SCHEMA.md`](PROJECT_AGENT_MINIMUM_SCHEMA.md)
- [`PROJECT_AGENT_SCHEMA_FIELD_MATRIX.md`](PROJECT_AGENT_SCHEMA_FIELD_MATRIX.md)
