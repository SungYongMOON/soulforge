# _workspaces

## 정본 의미

- `_workspaces/` 는 public repo 에서 reserved/local-only project materialization mount point 다.
- public GitHub 에서는 `_workspaces/README.md` 만 추적한다.
- 실제 `_workspaces/<project_code>/` 는 로컬 환경에서만 materialize 되는 private project worksite 다.
- cross-project ingress/runtime 은 `_workspaces/` 가 아니라 `guild_hall/state/**` 가 맡는다.
- `company/`, `personal` 분기는 새 정본에 포함하지 않는다.
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
└── <project_code>/
    └── ... actual project files ...
```

## owner 경계

- `_workspaces/<project_code>/` 는 실제 프로젝트 파일, 산출물, 로컬 운영 상태를 담는 materialization site 다.
- 실제 프로젝트가 다른 로컬 경로에 이미 있으면 `_workspaces/<project_code>/` direct child 로 보이도록 local-only directory link 를 둘 수 있다.
- `guild_hall/state/**` 는 cross-project ingress, notify, assignment 같은 운영 runtime 이고 `_workspaces/` owner 가 아니다.
- held mission plan 과 readiness owner 는 이 경로가 아니라 루트 `.mission/` 이 소유한다.
- project metadata companion root 는 Soulforge root 아래 nested private repo `_workmeta/<project_code>/` 이다.
- raw execution truth 는 `_workmeta/<project_code>/runs/<run_id>/` 아래에 남긴다.
- project-side monster record 는 `_workmeta/<project_code>/monsters/` 아래에 남긴다.
- `_workmeta/<project_code>/` 는 local contract, bindings, autohunt metadata, raw run truth 를 두는 실행 surface 이며 mission owner 가 아니다.
- `dungeons/`, `analytics/`, `nightly_healing/`, `reports/`, `log/`, `artifacts/` 는 public tracking 대상이 아니다.
- `.registry`, `.unit`, `.workflow`, `.party` 는 `_workspaces` 를 참조할 수 있지만 per-project 실자료를 흡수하지 않는다.

## tracking 규칙

- 실제 project code 와 실제 프로젝트 디렉터리를 public repo 에 추가하지 않는다.
- tracked 문서와 public-safe example 에는 실제 project code, 실제 과제명, 실제 display name 을 적지 않고 generic example 만 쓴다.
- `_workmeta/<project_code>/` 계약 파일도 public tracking 대상이 아니다.
- repo 안에 남아 있는 legacy sample 또는 과거 경로 흔적은 정본이 아니며 후속 cleanup 범위다.
- `guild_hall/state/**` 는 `guild-hall:gateway:*` 또는 `guild-hall:town-crier:*` 첫 실행 시 필요한 local runtime 폴더가 자동으로 materialize 된다.
- `_workspaces/**` 전체를 public Git 으로 올리지 않으며, 필요한 subset 만 `PRIVATE_STATE_REPO_V0.md` 기준으로 별도 private repo 에 넣는다.
- 첫 실제 프로젝트 온보딩 절차와 short `project_code` / full `display_name` 규칙은 `PROJECT_ONBOARDING_V0.md` 를 따른다.
- first run/use 중 생기는 local-only working note 는 `_workmeta/<project_code>/reports/onboarding/`, 근거 artifact 는 `_workmeta/<project_code>/artifacts/onboarding/` 를 기본안으로 둔다.
- 사람과 Codex 가 같이 진행한 시작 단계 기록은 `_workmeta/<project_code>/reports/onboarding/project_start_worklog.md` 를 기본안으로 둔다.
- 사용자가 따로 요청하지 않아도 새 시작 행위의 실제 작업 순서와 절차 초안은 `_workmeta/<project_code>/reports/onboarding/project_start_worklog.md` 에 남기는 것을 기본안으로 둔다.

## 관련 경로

- [루트 README](../README.md)
- [`guild_hall/README.md`](../guild_hall/README.md)
- [`docs/architecture/guild_hall/README.md`](../docs/architecture/guild_hall/README.md)
- [`.mission/README.md`](../.mission/README.md)
- [`docs/architecture/foundation/TARGET_TREE.md`](../docs/architecture/foundation/TARGET_TREE.md)
- [`docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md`](../docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md)
- [`docs/architecture/workspace/PROJECT_ONBOARDING_V0.md`](../docs/architecture/workspace/PROJECT_ONBOARDING_V0.md)
- [`docs/architecture/workspace/PROJECT_START_WORKFLOW_V0.md`](../docs/architecture/workspace/PROJECT_START_WORKFLOW_V0.md)
- [`docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`](../docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md)
- [`docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`](../docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md)

