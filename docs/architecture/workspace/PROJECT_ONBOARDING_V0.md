# PROJECT_ONBOARDING_V0

## 목적

- 이 문서는 실제 프로젝트를 Soulforge `_workspaces/<project_code>/` 아래에 처음 붙일 때의 최소 온보딩 규칙을 잠근다.
- 첫 실제 프로젝트 온보딩을 local-only 실험으로 흘려보내지 않고, repeatable dogfood/manual 절차로 묶는다.
- 실제 프로젝트 현장 materialization 과 `_workmeta` 도입 순서를 분리해 과한 초기 반영을 막는다.

## 한 줄 정의

- 첫 실제 프로젝트 온보딩은 `실제 project root 를 _workspaces/<project_code>/ direct child 로 materialize` 한 뒤, `read-only intake -> bounded first run/use -> local fix -> local documentation -> stable rule promotion` 순서로 들어가는 workspace manual v0 다.

## 정본 규칙

1. canonical project root 는 항상 `_workspaces/<project_code>/` direct child 로 본다.
2. 실제 프로젝트가 Soulforge 바깥에 이미 있으면, local-only materialization 은 OS-local directory link 로 둘 수 있다.
3. Windows 에서는 directory link 기본값으로 junction 을 권장한다.
4. macOS/Linux 에서는 directory symlink 를 권장한다.
5. tracked 문서와 public changelog 에는 actual host-local source path 를 적지 않는다.
6. tracked 정본 문서, public changelog, public-safe example 에는 실제 project code, 실제 과제명, 실제 display name 을 적지 않고 generic example 으로만 표현한다.
7. `project_code` 는 경로와 식별자에 쓰는 짧고 안정적인 id 로 둔다.
8. 사람에게 보여줄 full project title 은 `_workmeta/<project_code>/contract.yaml` 의 `display_name` 에 둔다.
9. 첫 실제 프로젝트 온보딩은 `_workmeta/<project_code>/` 를 바로 active 로 만들지 않고, 먼저 read-only intake 로 구조와 민감 경계를 확인한 뒤 아주 작은 first run/use 로 들어간다.
10. first run/use 에서 확인한 문제는 local-only 수정과 local-only 문서로 먼저 정리한다.
11. 첫 실제 프로젝트 온보딩에서 얻은 안정 규칙은 다음 변경에서 workspace manual 과 changelog 로 승격한다.

## 추천 값

- path id:
  - `project_code: demo_project`
- human-facing title:
  - `display_name: Example Project`

경로에는 짧은 `project_code` 를 쓰고, full title 은 metadata 로 분리하는 것을 기본안으로 본다.

## local materialization 예시

Windows PowerShell:

```powershell
$projectCode = "demo_project"
$target = "<local-project-root>"
New-Item -ItemType Junction -Path "_workspaces/$projectCode" -Target $target
```

macOS/Linux:

```bash
project_code="demo_project"
target="/path/to/project-root"
ln -s "$target" "_workspaces/$project_code"
```

위 명령은 local-only materialization 예시일 뿐이며, tracked 문서에는 실제 target path 를 남기지 않는다.

## 첫 온보딩 절차

1. `project_code` 를 정한다.
2. 사람용 full title 을 정한다.
3. 실제 project root 를 `_workspaces/<project_code>/` direct child 로 materialize 한다.
4. read-only 로 top-level structure, 민감 폴더, 핵심 산출물, active lane 을 파악한다.
5. 첫 mission 또는 first-use scenario 를 아주 작게 정한다.
6. 그다음에만 `_workmeta/<project_code>/` minimal shape 를 draft 로 만든다.
7. local-only bounded first run/use 를 실제로 한 번 수행한다.
8. first run/use 에서 드러난 blocker, 수정점, 관찰값을 local-only 문서에 먼저 남긴다.
9. local-only 수정이 안정화되면 그 규칙만 `WORKSPACE_PROJECT_MODEL.md`, field matrix, 관련 runbook 에 다시 반영한다.

## local-only 실험 기록 위치

- 사람용 실험 메모와 온보딩 문서는 `_workmeta/<project_code>/reports/onboarding/` 아래에 둔다.
- 사람과 Codex 가 같이 진행한 시작 단계 판단, blocker, 다음 액션은 `_workmeta/<project_code>/reports/onboarding/project_start_worklog.md` 에 append 한다.
- 사용자가 따로 요청하지 않아도 새 시작 행위의 실제 작업 순서와 절차 초안은 `project_start_worklog.md` 와 관련 onboarding note 에 함께 남긴다.
- 근거 파일, 임시 export, 비교 산출물은 `_workmeta/<project_code>/artifacts/onboarding/` 아래에 둔다.
- 위 경로는 모두 local-only 이며 public tracked tree 로 올리지 않는다.
- tracked 정본 문서에는 실험 결과에서 승격된 규칙만 남기고, 실제 프로젝트별 working note 원문은 남기지 않는다.

## read-only intake 체크리스트

- top-level folder 목록
- 민감 자료 경계
- 현재 실제로 관리할 work item 종류
- 대표 산출물/근거 surface
- 첫 mission 후보 1건
- immediate blocker 유무

첫 온보딩 단계에서는 raw/private content 를 대량 전개하지 않고, first run/use 에 필요한 최소 범위만 다룬다.

## `_workmeta` 반영 타이밍

- read-only intake 전:
  - link 또는 actual root 존재 확인만 한다
- read-only intake 후:
  - `contract.yaml` 초안
  - `bindings/` 초안
  - reserved dir skeleton
- first run/use 중:
  - `reports/onboarding/`
  - `artifacts/onboarding/`
- 첫 mission scope 와 binding resolve 후:
  - `status: active`

## 관련 경로

- [`PROJECT_START_WORKFLOW_V0.md`](PROJECT_START_WORKFLOW_V0.md)
- [`WORKSPACE_PROJECT_MODEL.md`](WORKSPACE_PROJECT_MODEL.md)
- [`WORKMETA_MINIMUM_SCHEMA.md`](WORKMETA_MINIMUM_SCHEMA.md)
- [`WORKMETA_RESOLVE_CONTRACT.md`](WORKMETA_RESOLVE_CONTRACT.md)
- [`WORKMETA_SCHEMA_FIELD_MATRIX.md`](WORKMETA_SCHEMA_FIELD_MATRIX.md)
- [`MISSION_MANUAL_DRAFT.md`](MISSION_MANUAL_DRAFT.md)

