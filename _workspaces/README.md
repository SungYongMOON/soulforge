# _workspaces

## 정본 의미

- `_workspaces/` 는 public repo 에서 reserved/local-only project materialization mount point 다.
- public GitHub 에서는 `_workspaces/README.md` 만 추적한다.
- 실제 `_workspaces/<project_code>/` 는 로컬 환경에서만 materialize 되는 private project worksite 다.
- `_workspaces/monster_house/` 는 project 배치 전 몬스터 staging 을 담는 workspace-level local-only intake site 다.
- `company/`, `personal` 분기는 새 정본에 포함하지 않는다.
- tracked sample 이 필요하면 `_workspaces/` 아래가 아니라 `docs/architecture/workspace/examples/` 아래에 둔다.

## public repo view

```text
_workspaces/
└── README.md
```

## local project worksite view

```text
_workspaces/
├── monster_house/
│   └── .project_agent/
│       ├── intake_inbox/
│       └── log/
│           └── monster_events/
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
        │   └── morning_report/
        ├── log/
        │   ├── nightly_sweep/
        │   └── battle_log/
        └── artifacts/
```

## owner 경계

- `_workspaces/<project_code>/` 는 실제 프로젝트 파일, 산출물, 로컬 운영 상태를 담는 materialization site 다.
- `_workspaces/monster_house/` 는 project assignment 전 mail-derived monster 를 임시 적재하는 staging site 다.
- held mission plan 과 readiness owner 는 이 경로가 아니라 루트 `.mission/` 이 소유한다.
- raw execution truth 는 `_workspaces/<project_code>/.project_agent/runs/<run_id>/` 아래에 남긴다.
- `.project_agent/` 는 local contract, bindings, autohunt metadata, raw run truth 를 두는 실행 surface 이며 mission owner 가 아니다.
- `dungeons/`, `analytics/`, `nightly_healing/`, `reports/`, `log/`, `artifacts/` 는 public tracking 대상이 아니다.
- `.registry`, `.unit`, `.workflow`, `.party` 는 `_workspaces` 를 참조할 수 있지만 per-project 실자료를 흡수하지 않는다.

## tracking 규칙

- 실제 project code 와 실제 프로젝트 디렉터리를 public repo 에 추가하지 않는다.
- `_workspaces/<project_code>/` 안의 `.project_agent/` 계약 파일도 public tracking 대상이 아니다.
- repo 안에 남아 있는 legacy sample 또는 과거 경로 흔적은 정본이 아니며 후속 cleanup 범위다.

## 관련 경로

- [루트 README](../README.md)
- [`.mission/README.md`](../.mission/README.md)
- [`docs/architecture/foundation/TARGET_TREE.md`](../docs/architecture/foundation/TARGET_TREE.md)
- [`docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md`](../docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md)
