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

## public repo view

```text
_workspaces/
└── README.md
```

## local project worksite view

```text
_workspaces/
└── <project_code>/
    ├── ... actual project files ...
    └── .project_agent/
        ├── contract.yaml
        ├── bindings/
        ├── monsters/
        ├── runs/
        ├── dungeons/
        ├── analytics/
        ├── nightly_healing/
        ├── reports/
        │   └── morning_report/
        ├── log/
        │   ├── nightly_sweep/
        │   └── battle_log/
        └── artifacts/
```

## owner 경계

- `_workspaces/<project_code>/` 는 실제 프로젝트 파일, 산출물, 로컬 운영 상태를 담는 materialization site 다.
- `guild_hall/state/**` 는 cross-project ingress, notify, assignment 같은 운영 runtime 이고 `_workspaces/` owner 가 아니다.
- held mission plan 과 readiness owner 는 이 경로가 아니라 루트 `.mission/` 이 소유한다.
- raw execution truth 는 `_workspaces/<project_code>/.project_agent/runs/<run_id>/` 아래에 남긴다.
- project-side monster record 는 `_workspaces/<project_code>/.project_agent/monsters/` 아래에 남긴다.
- `.project_agent/` 는 local contract, bindings, autohunt metadata, raw run truth 를 두는 실행 surface 이며 mission owner 가 아니다.
- `dungeons/`, `analytics/`, `nightly_healing/`, `reports/`, `log/`, `artifacts/` 는 public tracking 대상이 아니다.
- `.registry`, `.unit`, `.workflow`, `.party` 는 `_workspaces` 를 참조할 수 있지만 per-project 실자료를 흡수하지 않는다.

## tracking 규칙

- 실제 project code 와 실제 프로젝트 디렉터리를 public repo 에 추가하지 않는다.
- `_workspaces/<project_code>/` 안의 `.project_agent/` 계약 파일도 public tracking 대상이 아니다.
- repo 안에 남아 있는 legacy sample 또는 과거 경로 흔적은 정본이 아니며 후속 cleanup 범위다.
- `guild_hall/state/**` 는 `guild-hall:gateway:*` 또는 `guild-hall:town-crier:*` 첫 실행 시 필요한 local runtime 폴더가 자동으로 materialize 된다.

## 관련 경로

- [루트 README](../README.md)
- [`guild_hall/README.md`](../guild_hall/README.md)
- [`docs/architecture/guild_hall/README.md`](../docs/architecture/guild_hall/README.md)
- [`.mission/README.md`](../.mission/README.md)
- [`docs/architecture/foundation/TARGET_TREE.md`](../docs/architecture/foundation/TARGET_TREE.md)
- [`docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md`](../docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md)
- [`docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`](../docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md)
