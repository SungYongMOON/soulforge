# PROJECT_START_WORKFLOW_V0

## 목적

- 이 문서는 실제 프로젝트를 Soulforge 현장에 붙인 뒤, 첫 과제를 시작할 때 따르는 local-first workflow 를 잠근다.
- 첫 시작 단계에서 무엇을 바로 실행하고, 무엇을 owner-only shared metadata 로 기록하고, 무엇을 나중에 정본 문서로 승격할지 구분한다.
- 사람과 Codex 가 함께 작업할 때 기록 위치와 승격 기준을 명확히 한다.

## 한 줄 정의

- project start workflow 는 `project materialize -> worklog open -> bounded first task -> local fix -> local note update -> workflow capture -> stable rule promotion` 순서로 움직이는 local-first 운영 절차다.

## 정본 규칙

1. tracked 정본 문서에는 실제 project code, 실제 과제명, 실제 고객/거래처명, 실제 display name 을 적지 않고 generic example 만 쓴다.
2. 실제 프로젝트별 working note 와 실험 결과는 `_workmeta/<project_code>/reports/onboarding/` 아래 owner-only shared metadata 로 남긴다.
3. 사람과 Codex 가 같이 진행한 판단, blocker, 다음 액션은 `_workmeta/<project_code>/reports/onboarding/project_start_worklog.md` 에 append 한다.
4. 근거 파일 포인터, export metadata, 비교 metadata, preview 결과 요약은 `_workmeta/<project_code>/artifacts/onboarding/` 아래에 둔다. 실제 파일은 `_workspaces/<project_code>/...`, `_workspaces/SE_TEMPLATE_LIBRARY/...`, `_workspaces/system/...`, 또는 owner-approved shared worksite 에 둔다.
5. 첫 과제 시작은 항상 bounded scope 1건으로 열고, 성공 조건과 종료 조건을 먼저 적는다.
6. first task 진행 중 생긴 규칙은 먼저 `_workmeta` shared metadata worklog/note 로 검증하고, 안정화된 뒤에만 정본 manual 과 changelog 로 승격한다.
7. 새로 시작하는 어떤 행위든 절차를 저장하고 workflow 화할 수 있게 worklog 와 관련 note 를 같이 연다.
8. 사용자가 따로 요청하지 않아도, 사람과 Codex 가 대화하며 진행한 실제 작업 순서, 판단, blocker, 다음 액션은 worklog 에 남긴다.
9. worklog 에서 반복 가능한 절차로 확인된 내용은 workflow 문서 초안 또는 정본 manual 로 승격할 수 있게 구조화해 남긴다.
10. project assignment 와 자료 분류에 쓰는 힌트는 실제 비밀 project code 나 내부 관리번호보다 비밀성이 낮은 대표 업무명 또는 공개 가능한 주제어를 우선 사용한다.
11. 여러 과제에 걸쳐 재사용되는 약어, 제품군명, 일반 사업유형은 단독 판정 키로 쓰지 않고 보조 힌트로만 취급한다.
12. `_workspaces/SE_TEMPLATE_LIBRARY/` 는 reusable SE artifact materials 의 canonical actual-file library/store 다. pointer-only reference folder 도 아니고 project execution baseline 도 아니다. `_workspaces/system/` 은 path-identity controlled shared-view lab/fixture workspace 로 남기고, PC-local scratch/cache 는 `_workspaces/_local/<node_id>/` 로 분리한다.
13. library 의 canonical reusable files 는 owner-approved templates/forms, executable artifact workflows, artifact-specific authoring rules, sample output files 를 포함할 수 있다. provenance, hash, version, classification 은 `manifests/` 또는 catalog docs 에 기록한다.
14. library 의 `workflow/` 는 executable workflow procedure 만 담는다. folder layout, source path, copy history, hash, catalog/provenance 는 workflow 본문이 아니라 `manifests/` 또는 catalog docs 에 둔다.
15. common document rules 는 artifact-specific `authoring_rules/` 와 섞지 않고 별도 common-rule surface 에 둔다.
16. HWP Rev 양식은 자동으로 official form 으로 간주하지 않는다. owner-approved canonical HWP/HWPX form material 만 `templates_or_forms/` 에 둘 수 있고, 원천/버전/분류는 manifest 로 기록한다.
17. project-local latest authoring files 는 project folder 에 남긴다. library 로 이동하지 않고, 필요할 때만 sample output 또는 reusable material 로 copy/materialize 한다.
18. document-producing first task 는 선택 library file 또는 owner-approved artifact material 을 task 시작 시 `_workspaces/<project_code>/<stage>/<artifact>/00_Temp/template_snapshot/` 로 materialize 하고, generation 은 그 snapshot 만 사용한다.
19. `00_Temp/workflow_candidate/` 는 concrete run 에서 나온 project-local workflow/rule candidate 를 보관하는 곳이며 `.workflow` canon 이 아니다.
20. `form_revision`, `template_snapshot_id/version`, `input_bundle_version`, `artifact_version`, `workflow_version` 은 서로 다른 version axis 로 기록한다.

## 시작 절차

1. `_workspaces/<project_code>/` materialization 상태를 확인한다.
2. `_workmeta/<project_code>/` 가 없으면 `draft` skeleton 을 만든다.
3. `reports/onboarding/project_start_worklog.md` 를 만들고 첫 entry 를 남긴다.
4. 실제 자료를 read-only 로 훑어 첫 과제 후보를 1건만 정한다.
5. first task 의 입력, 출력, blocker, 종료 조건을 worklog 에 적는다.
6. document-producing task 라면 project snapshot manifest 를 열고 source library material 또는 owner-approved artifact material pointer, project snapshot pointer, hash, snapshot time, status 를 기록한다.
7. bounded first run/use 를 실행한다.
8. 실행 중 나온 수정점은 `_workmeta` metadata 와 local worksite 를 구분해 먼저 반영한다.
9. 대화와 작업에서 실제로 밟은 순서를 worklog 와 관련 note 에 append 한다.
10. final manual edit 이 있으면 이전 artifact hash/validation 을 무효화하고 새 metadata 와 validation status 를 closeout 전 갱신한다.
11. 결과 note 와 artifact metadata 를 정리한다.
12. repeatable rule 로 확인된 것만 tracked 정본 문서로 승격한다.

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
_workmeta/<project_code>/
├── reports/
│   └── onboarding/
│       ├── project_start_worklog.md
│       └── YYYY-MM-DD_<topic>.md
└── artifacts/
    └── onboarding/
        └── <preview-or-evidence-metadata>
```

```text
_workspaces/SE_TEMPLATE_LIBRARY/
├── common_document_rules/
└── <stage>/
    └── <artifact>/
        └── 00_Temp/
            ├── templates_or_forms/
            ├── workflow/
            ├── authoring_rules/
            ├── sample_outputs/
            └── manifests/
```

```text
_workspaces/<project_code>/
└── <stage>/
    └── <artifact>/
        └── 00_Temp/
            ├── template_snapshot/
            └── workflow_candidate/
```

## 승격 기준

- 한 번성 실험 메모도 다른 owner PC 가 이어받아야 하면 `_workmeta` shared metadata 로 유지한다.
- 다른 프로젝트에서도 재현 가능한 절차만 정본 문서로 승격한다.
- 승격 시에도 실제 프로젝트 식별자는 generic placeholder 로 치환한다.

## 자동 기록 원칙

- 새 시작 행위는 worklog open 없이 진행하지 않는 것을 기본안으로 본다.
- 사람과 Codex 의 대화에서 정해진 순서가 실제 작업 순서로 이어졌다면, 그 흐름은 사용자가 따로 요청하지 않아도 worklog 와 workflow note 에 남긴다.
- 자동 기록의 기본 대상은 `project_start_worklog.md` 이고, 주제가 분리되면 `YYYY-MM-DD_<topic>.md` note 로 확장한다.

## 관련 경로

- [`PROJECT_ONBOARDING_V0.md`](PROJECT_ONBOARDING_V0.md)
- [`WORKSPACE_PROJECT_MODEL.md`](WORKSPACE_PROJECT_MODEL.md)
- [`WORKMETA_MINIMUM_SCHEMA.md`](WORKMETA_MINIMUM_SCHEMA.md)
- [`WORKMETA_SCHEMA_FIELD_MATRIX.md`](WORKMETA_SCHEMA_FIELD_MATRIX.md)
