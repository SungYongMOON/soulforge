# _workspaces

## 정본 의미

- `_workspaces/` 는 public repo 에서 reserved/local-only project materialization mount point 다.
- public GitHub 에서는 `_workspaces/README.md` 만 추적한다.
- 실제 `_workspaces/<project_code>/` 는 로컬 환경에서만 materialize 되는 private project worksite view 다.
- 여러 owner PC 에서 같은 실자료를 읽어야 하는 프로젝트는 실제 파일을 owner-approved shared worksite 에 두고, `_workspaces/<project_code>/` 는 그 위치를 가리키는 local-only directory link 로 둔다.
- reserved `_workspaces/system/` 은 특정 프로젝트에 속하지 않는 reusable workflow lab pilot output, fixture materialization, downloaded reference file 을 두는 path-identity controlled workspace 다. 여러 PC 에서 같은 이름을 사용할 때는 같은 owner-approved shared worksite 를 가리키는 local-only link view 여야 한다.
- reserved `_workspaces/knowledge/` 는 특정 프로젝트에 속하지 않는 회사 공통 또는 cross-project source packet, source card, local RAG 준비물을 두는 owner-approved non-project alias 다.
- cross-project ingress/runtime 은 `_workspaces/` 가 아니라 `guild_hall/state/**` 가 맡는다.
- `company/`, `personal` 분기는 새 정본에 포함하지 않는다.
- cloud/company root 는 project worksite 의 link target 을 해석하기 위한 외부 루트일 수는 있지만, `_workspaces/company` 같은 direct child junction 으로 materialize 하지 않는다.
- `_workspaces` direct child 는 `<project_code>/`, reserved `SE_TEMPLATE_LIBRARY/`, reserved `system/`, reserved `_local/`, reserved `_local_hold/`, 또는 owner 가 명시적으로 승인하고 binding 에 등록한 non-project alias 로 제한한다.
- PC별 scratch, cache, local tool install, temporary output 은 `_workspaces/_local/<node_id>/` 아래에 둔다. 공유 전환 전 기존 local 폴더 보존본은 `_workspaces/_local_hold/<workspace_alias>/<timestamp>_<node_id>/` 아래에 둔다.
- tracked sample 이 필요하면 `_workspaces/` 아래가 아니라 `docs/architecture/workspace/examples/` 아래에 둔다.
- 다른 PC 나 다른 LLM 이 runtime shape 를 따라야 하면 `docs/architecture/workspace/examples/guild_hall/state/gateway/` 와 `docs/architecture/workspace/examples/` 의 public-safe mirror sample 을 먼저 읽는다.
- 다른 PC 에서 repo 를 clone 해도 실제 `_workspaces/**` 실자료는 따라오지 않으며, local runtime 은 각 PC 에서 다시 materialize 해야 한다.
- 선택된 project-side 기록만 이어서 보존해야 하면 public repo 가 아니라 별도 private state repo 로 mirror 한다.

## public repo view

```text
_workspaces/
└── README.md
```

## local project worksite view

```text
_workspaces/
├── _local/
│   └── <node_id>/
│       └── ... PC-local scratch, cache, local tools, temporary output ...
├── _local_hold/
│   └── <workspace_alias>/
│       └── <timestamp>_<node_id>/
│           └── ... preserved pre-migration local copy ...
├── SE_TEMPLATE_LIBRARY/
│   ├── common_document_rules/
│   ├── <stage>/<artifact>/00_Temp/
│   │   ├── templates_or_forms/
│   │   ├── workflow/
│   │   ├── authoring_rules/
│   │   ├── sample_outputs/
│   │   └── manifests/
│   ├── 020_MGMT/ ... 240_LL/
│   └── library_catalog.yaml
├── system/
│   └── <run_family_or_pilot_id>/
│       └── ... reusable workflow lab and fixture outputs ...
├── knowledge/
│   └── common/
│       └── ... company or cross-project source packets ...
└── <project_code>/
    ├── <stage>/<artifact>/00_Temp/
    │   ├── template_snapshot/
    │   └── workflow_candidate/
    └── ... actual project files ...
```

## owner 경계

- `_workspaces/<project_code>/` 는 실제 프로젝트 파일, 산출물, 로컬 운영 상태를 보여주는 materialization site 다.
- `_workspaces/SE_TEMPLATE_LIBRARY/` 는 reusable SE artifact materials 의 canonical actual-file library/store 다. pointer-only reference folder 도 아니고 project execution baseline 도 아니다.
- `_workspaces/system/` 은 특정 프로젝트 owner 가 없는 reusable workflow 실험, fixture 출력, pilot 산출물을 담는 reserved lab workspace 다. 참여 PC 에서는 같은 shared target 을 보는 link view 로 맞추고, PC-local 실험이나 cache 는 `_workspaces/_local/<node_id>/` 로 분리한다.
- `_workspaces/knowledge/` 는 특정 프로젝트가 아닌 회사 공통 자료와 cross-project 지식 준비물을 위한 reserved workspace 다. 실제 프로젝트 자료를 이곳으로 옮겨 project owner 경계를 흐리지 않는다.
- library 의 canonical reusable files 는 owner-approved templates/forms, executable artifact workflows, artifact-specific authoring rules, sample output files 를 포함할 수 있다. provenance, hash, version, classification 은 `manifests/` 또는 catalog docs 에 기록한다.
- library 의 `workflow/` 는 executable workflow procedure 만 담는다. folder layout, source path, copy history, hash, catalog/provenance 는 workflow 본문이 아니라 `manifests/` 또는 catalog docs 에 둔다.
- common document rules 는 artifact-specific `authoring_rules/` 와 섞지 않고 `common_document_rules/` 같은 별도 common-rule surface 에 둔다.
- HWP Rev 양식은 자동으로 official form 으로 간주하지 않는다. owner-approved canonical HWP/HWPX form material 만 `templates_or_forms/` 에 둘 수 있고, 원천/버전/분류는 manifest 로 기록한다.
- project-local latest authoring files 는 project folder 에 남긴다. library 로 이동하지 않고, 필요할 때만 sample output 또는 reusable material 로 copy/materialize 한다.
- document-producing project work 는 선택된 library file 또는 owner-approved artifact material 을 task 시작 시 `_workspaces/<project_code>/<stage>/<artifact>/00_Temp/template_snapshot/` 로 materialize 하고, generation 은 그 project-local snapshot 만 사용한다.
- `_workspaces/<project_code>/<stage>/<artifact>/00_Temp/workflow_candidate/` 는 concrete run 에서 나온 project-local workflow/rule candidate 를 보관하는 곳이며 `.workflow` canon 이 아니다.
- 실제 프로젝트가 다른 로컬 경로에 이미 있으면 `_workspaces/<project_code>/` direct child 로 보이도록 local-only directory link 를 둘 수 있다.
- 다른 owner PC 에서도 읽어야 하는 사진, 영상, 측정 로그 같은 payload 는 `_workspaces` 내부 사본이 아니라 owner-approved shared worksite 원본을 link target 으로 둔다.
- shared worksite 의 상위 root 전체를 `_workspaces` 아래에 정션으로 걸지 않는다. 필요한 project 또는 승인된 alias 만 direct child 로 둔다.
- `guild_hall/state/**` 는 cross-project ingress, notify, assignment 같은 운영 runtime 이고 `_workspaces/` owner 가 아니다.
- held mission plan 과 readiness owner 는 이 경로가 아니라 루트 `.mission/` 이 소유한다.
- project metadata companion root 는 Soulforge root 아래 nested private repo `_workmeta/<project_code>/` 이다.
- 실행 기록은 `_workmeta/<project_code>/runs/<run_id>/` 아래에 남기되, 여기서 기록은 판단 근거, 검증 로그 같은 메타데이터를 뜻한다.
- HWP/HWPX, Word, Excel, PowerPoint, PDF, 압축파일, 메일 원문/첨부 같은 실제 payload 파일은 `_workmeta` 에 두지 않고 `_workspaces/<project_code>/`, `_workspaces/SE_TEMPLATE_LIBRARY/`, `_workspaces/system/`, 또는 owner-approved shared worksite 에 둔다.
- `_workmeta` 는 실제 원문 파일을 직접 보관하지 않고 workspace/shared worksite 경로, 크기, 해시, 출처, 사용 상태만 기록한다.
- HWP 파일은 본문 분석 전에 workspace/shared worksite 작업본에서 먼저 HWPX 로 저장/export 한다. HWPX 파생본이 생기기 전에는 HWP 원문을 본문/양식/항목 추출 근거로 읽지 않는다.
- project-side monster record 는 `_workmeta/<project_code>/monsters/` 아래에 남긴다.
- `_workmeta/<project_code>/` 는 local contract, bindings, autohunt metadata, 실행 기록 메타데이터를 두는 실행 surface 이며 mission owner 가 아니다.
- `dungeons/`, `analytics/`, `nightly_healing/`, `reports/`, `log/`, `artifacts/` 는 public tracking 대상이 아니다.
- `.registry`, `.unit`, `.workflow`, `.party` 는 `_workspaces` 를 참조할 수 있지만 per-project 실자료를 흡수하지 않는다.

## tracking 규칙

- 실제 project code 와 실제 프로젝트 디렉터리를 public repo 에 추가하지 않는다.
- `_workspaces/SE_TEMPLATE_LIBRARY/**` 와 `_workspaces/system/**` 도 local-only runtime 이며 public GitHub 에 올리지 않는다.
- `_workspaces/_local/**` 와 `_workspaces/_local_hold/**` 도 public GitHub 에 올리지 않는다.
- tracked 문서와 public-safe example 에는 실제 project code, 실제 과제명, 실제 display name 을 적지 않고 generic example 만 쓴다.
- `_workmeta/<project_code>/` 계약 파일도 public tracking 대상이 아니다.
- `_workmeta` 에 실제 원문 파일을 저장하지 않는다. 대표적으로 `.hwp`, `.hwpx`, `.docx`, `.xlsx`, `.xlsm`, `.xls`, `.pptx`, `.ppt`, `.pdf`, `.zip`, `.7z`, `.rar`, `.egg`, `.msg`, `.eml`, `.pst`, `.ost`, `.mbox` 파일은 workspace/shared worksite 쪽에 두고 `_workmeta` 에는 포인터 메타데이터만 남긴다.
- `.hwp` 는 먼저 HWPX 로 정규화한다. 표준 절차는 [`docs/architecture/workspace/HWP_NORMALIZATION_V0.md`](../docs/architecture/workspace/HWP_NORMALIZATION_V0.md) 를 따른다.
- repo 안에 남아 있는 legacy sample 또는 과거 경로 흔적은 정본이 아니며 후속 cleanup 범위다.
- `guild_hall/state/**` 는 `guild-hall:gateway:*` 또는 `guild-hall:town-crier:*` 첫 실행 시 필요한 local runtime 폴더가 자동으로 materialize 된다.
- `_workspaces/**` 전체를 public Git 으로 올리지 않으며, 필요한 subset 만 `PRIVATE_STATE_REPO_V0.md` 기준으로 별도 private repo 에 넣는다.
- shared worksite link target 의 실제 host path 는 public tracked 문서에 쓰지 않고 project-local binding 이나 owner note 에만 둔다.
- 첫 실제 프로젝트 온보딩 절차와 short `project_code` / full `display_name` 규칙은 `PROJECT_ONBOARDING_V0.md` 를 따른다.
- 주기적으로 전달되는 회사 PJT 관리 대장으로 project registration 을 갱신할 때는 `PROJECT_LEDGER_UPDATE_V0.md` 를 따른다.
- 특정 프로젝트가 아닌 회사 공통 조직/연락처/자리배치/운영 참조 자료를 보관할 때는 `COMPANY_COMMON_SOURCE_STORAGE_V0.md` 를 따른다.
- 다른 PC 에서 pull 후 `_workspaces/company` 또는 `_workspaces/personal` 같은 root junction 이 남아 있으면, 먼저 target 을 확인한 뒤 junction pointer 만 제거하고 원본 shared worksite 는 보존한다.
- first run/use 중 생기는 local-only working note 는 `_workmeta/<project_code>/reports/onboarding/`, 근거 artifact 는 `_workmeta/<project_code>/artifacts/onboarding/` 를 기본안으로 둔다.
- 사람과 Codex 가 같이 진행한 시작 단계 기록은 `_workmeta/<project_code>/reports/onboarding/project_start_worklog.md` 를 기본안으로 둔다.
- 사용자가 따로 요청하지 않아도 새 시작 행위의 실제 작업 순서와 절차 초안은 `_workmeta/<project_code>/reports/onboarding/project_start_worklog.md` 에 남기는 것을 기본안으로 둔다.
- Project snapshot manifest 는 source library material 또는 owner-approved artifact material pointer, project snapshot pointer, hash, snapshot time, status 를 기록한다.
- `form_revision`, `template_snapshot_id/version`, `input_bundle_version`, `artifact_version`, `workflow_version` 은 서로 다른 version axis 다.
- final manual edit 은 이전 artifact hash 와 validation status 를 무효화하므로 closeout 전 metadata 와 validation status 를 갱신한다.

## 관련 경로

- [루트 README](../README.md)
- [`guild_hall/README.md`](../guild_hall/README.md)
- [`docs/architecture/guild_hall/README.md`](../docs/architecture/guild_hall/README.md)
- [`.mission/README.md`](../.mission/README.md)
- [`docs/architecture/foundation/TARGET_TREE.md`](../docs/architecture/foundation/TARGET_TREE.md)
- [`docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md`](../docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md)
- [`docs/architecture/workspace/PROJECT_ONBOARDING_V0.md`](../docs/architecture/workspace/PROJECT_ONBOARDING_V0.md)
- [`docs/architecture/workspace/PROJECT_LEDGER_UPDATE_V0.md`](../docs/architecture/workspace/PROJECT_LEDGER_UPDATE_V0.md)
- [`docs/architecture/workspace/COMPANY_COMMON_SOURCE_STORAGE_V0.md`](../docs/architecture/workspace/COMPANY_COMMON_SOURCE_STORAGE_V0.md)
- [`docs/architecture/workspace/HWP_NORMALIZATION_V0.md`](../docs/architecture/workspace/HWP_NORMALIZATION_V0.md)
- [`docs/architecture/workspace/PROJECT_START_WORKFLOW_V0.md`](../docs/architecture/workspace/PROJECT_START_WORKFLOW_V0.md)
- [`docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`](../docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md)
- [`docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`](../docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md)
