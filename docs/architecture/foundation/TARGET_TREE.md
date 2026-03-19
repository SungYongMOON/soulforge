# 목표 트리

## 목적

- 정본 루트 구조를 고정한다.
- 여섯 canonical root 의 owner 경계와 `_workspaces` public/private tracking 원칙을 같은 문서에서 본다.

## 새 정본 루트 트리

```text
./
├── .registry/
│   ├── index.yaml
│   ├── species/
│   │   └── <species_id>/
│   │       └── species.yaml
│   ├── classes/
│   │   └── <class_id>/
│   │       ├── class.yaml
│   │       ├── knowledge_refs.yaml
│   │       ├── skill_refs.yaml
│   │       ├── tool_refs.yaml
│   │       ├── profiles/
│   │       └── manifests/
│   ├── skills/
│   ├── tools/
│   ├── knowledge/
│   └── docs/
│       └── architecture/
├── .unit/
│   └── <unit_id>/
│       ├── unit.yaml
│       ├── policy/
│       ├── protocols/
│       ├── runtime/
│       ├── memory/
│       ├── sessions/
│       ├── autonomic/
│       └── artifacts/
├── .workflow/
│   ├── index.yaml
│   └── <workflow_id>/
│       ├── workflow.yaml
│       ├── role_slots.yaml
│       ├── step_graph.yaml
│       ├── handoff_rules.yaml
│       ├── monster_rules.yaml
│       ├── party_compatibility.yaml
│       └── history/
├── .party/
│   ├── index.yaml
│   └── <party_id>/
│       ├── party.yaml
│       ├── member_slots.yaml
│       ├── allowed_species.yaml
│       ├── allowed_classes.yaml
│       ├── allowed_workflows.yaml
│       ├── appserver_profile.yaml
│       └── stats/
├── .mission/
│   ├── index.yaml
│   └── <mission_id>/
│       ├── mission.yaml
│       ├── readiness.yaml
│       ├── dispatch_request.yaml
│       ├── resolved_plan.yaml
│       ├── reports/
│       └── artifacts/
├── _workspaces/
│   └── README.md
├── docs/
│   └── architecture/
│       ├── foundation/
│       ├── workspace/
│       └── ui/
├── ui-workspace/
└── README.md
```

- `.registry/species/<species_id>/species.yaml` 가 species truth 와 `heroes:` inline set 을 함께 가진다.
- `.registry/skills/`, `.registry/tools/`, `.registry/knowledge/` 는 reusable canon bucket 이며, class/unit/workflow sample 을 뒷받침하는 minimal seed entry 를 가질 수 있다.
- `.mission/<mission_id>/mission.yaml` 는 held mission plan owner 이고, `readiness.yaml` 는 현재 실행 가능 상태를 기록한다.

## `_workspaces` local materialization

```text
_workspaces/
├── README.md
└── <project_code>/
    ├── ... actual project files ...
    └── .project_agent/
        ├── contract.yaml
        ├── bindings/
        ├── runs/
        │   └── <run_id>/
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

- public repo 에서는 `_workspaces/README.md` 만 추적한다.
- `_workspaces/<project_code>/` 는 local/private project worksite 로만 materialize 한다.
- assigned execution plan owner 는 `_workspaces/` 나 `.project_agent/` 가 아니라 `.mission/` 이 소유한다.
- raw execution truth 의 owner 는 `_workspaces/<project_code>/.project_agent/runs/<run_id>/` 다.
- `dungeons/`, `analytics/`, `nightly_healing/`, `reports/`, `log/`, `artifacts/` 도 public tracking 대상이 아니다.
- tracked workspace sample 이 필요하면 `_workspaces/` 아래가 아니라 `docs/architecture/workspace/examples/` 아래에 둔다.

## 루트별 owner 의미

| 루트 | owner 의미 | public repo 허용 범위 | public repo 금지 범위 |
| --- | --- | --- | --- |
| `.registry/` | outer canon/store | species, class, skill, tool, knowledge canon 과 구조 문서 | active runtime, project-local truth, run dump |
| `.unit/` | active agent unit owner | owner 계약 문서와 구조 설명 | 실전 운영 상태, 민감 로그, raw artifacts 자동 반영 |
| `.workflow/` | independent orchestration canon | workflow 정의와 sanitized history | raw run dump, project-local battle log |
| `.party/` | independent orchestration template | party template 와 fit/observation summary | raw battle log, project-specific operational metrics |
| `.mission/` | held mission plan owner | mission plan, readiness, public-safe dispatch / resolve metadata | raw run dump, project-local truth |
| `_workspaces/` | local-only project worksite | `README.md` only | per-project 내용 전체 |

## 고정 규칙

- species canon 은 `species.yaml + heroes inline` 모델을 사용한다.
- `.workflow` 와 `.party` 는 `.registry` 아래로 들어가지 않는다.
- `.mission` 은 `.workflow`, `.party`, `.unit` 을 참조해 held mission plan 을 소유한다.
- project candidate root 는 `_workspaces/<project_code>/` direct child 구조를 사용한다.
- raw execution truth 는 `_workspaces/<project_code>/.project_agent/runs/<run_id>/` 에 둔다.
- `.run/` 루트는 새 정본에 포함하지 않는다.
- public repo 에서는 `_workspaces/README.md` 만 추적한다.
