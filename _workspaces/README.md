# _workspaces

## 정본 의미

- `_workspaces/` 는 public repo 에서 reserved/local-only mission site mount point 다.
- public GitHub 에서는 `_workspaces/README.md` 만 추적한다.
- 실제 `_workspaces/<project_code>/` 는 로컬 환경에서만 materialize 되는 private mission site 다.
- `company/`, `personal` 분기는 새 정본에 포함하지 않는다.
- tracked sample 이 필요하면 `_workspaces/` 아래가 아니라 `docs/architecture/workspace/examples/` 아래에 둔다.

## public repo view

```text
_workspaces/
└── README.md
```

## local mission site view

```text
_workspaces/
└── <project_code>/
    ├── ... actual project files ...
    └── .project_agent/
        ├── contract.yaml
        ├── bindings/
        ├── runs/
        ├── dungeons/
        ├── analytics/
        ├── nightly_healing/
        ├── reports/
        └── artifacts/
```

## owner 경계

- `_workspaces/<project_code>/` 는 실제 프로젝트 파일, 산출물, 운영 상태의 owner 다.
- raw execution truth 는 `_workspaces/<project_code>/.project_agent/runs/<run_id>/` 아래에 남긴다.
- `dungeons/`, `analytics/`, `nightly_healing/`, `reports/`, `artifacts/` 는 public tracking 대상이 아니다.
- `.registry`, `.unit`, `.workflow`, `.party` 는 `_workspaces` 를 참조할 수 있지만 per-project 실자료를 흡수하지 않는다.

## tracking 규칙

- 실제 project code 와 실제 프로젝트 디렉터리를 public repo 에 추가하지 않는다.
- `_workspaces/<project_code>/` 안의 `.project_agent/` 계약 파일도 public tracking 대상이 아니다.
- repo 안에 남아 있는 legacy sample 또는 과거 경로 흔적은 정본이 아니며 후속 cleanup 범위다.

## 관련 경로

- [루트 README](../README.md)
- [`docs/architecture/foundation/TARGET_TREE.md`](../docs/architecture/foundation/TARGET_TREE.md)
- [`docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md`](../docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md)
