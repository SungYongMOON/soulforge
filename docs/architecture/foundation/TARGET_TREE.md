# 목표 트리

## 목적

- vNext frozen decisions 기준의 새 정본 루트 구조를 고정한다.
- 여섯 축의 owner 경계와 `_workspaces` public/private tracking 원칙을 같은 문서에서 본다.

## 새 정본 루트 트리

```text
./
├── .agent/
│   ├── index.yaml
│   ├── species/
│   │   └── <species_id>/
│   │       ├── species.yaml
│   │       └── heroes/
│   │           └── <hero_id>/
│   │               └── hero.yaml
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
├── .agent_class/
│   ├── index.yaml
│   └── <class_id>/
│       ├── class.yaml
│       ├── knowledge_refs.yaml
│       ├── skill_refs.yaml
│       ├── tool_refs.yaml
│       ├── profiles/
│       └── manifests/
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
├── _workspaces/
│   └── README.md
├── docs/
│   └── architecture/
│       ├── foundation/
│       ├── workspace/
│       └── ui/
├── dev/
│   ├── log/
│   └── plan/
├── ui-workspace/
└── README.md
```

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
        └── artifacts/
```

- public repo 에서는 `_workspaces/README.md` 만 추적한다.
- `_workspaces/<project_code>/` 는 local/private mission site 로만 materialize 한다.
- raw execution truth 의 owner 는 `_workspaces/<project_code>/.project_agent/runs/<run_id>/` 다.
- `dungeons/`, `analytics/`, `nightly_healing/`, `reports/`, `artifacts/` 도 public tracking 대상이 아니다.

## 루트별 owner 의미

| 루트 | owner 의미 | public repo 허용 범위 | public repo 금지 범위 |
| --- | --- | --- | --- |
| `.agent/` | species / hero catalog | species, hero, catalog 문서와 메타 | active runtime, memory, sessions, raw run |
| `.unit/` | active agent unit owner | owner 계약 문서와 구조 설명 | 실전 운영 상태, 민감 로그, raw artifacts 자동 반영 |
| `.agent_class/` | class / package catalog | class 정의, refs, profiles, manifests | workflow owner 역할, project run data |
| `.workflow/` | workflow canon + curated learning history | workflow 정의와 sanitized history | raw run dump, project-local battle log |
| `.party/` | reusable party template + template-level stats | party template 와 fit/observation summary | raw battle log, project-specific operational metrics |
| `_workspaces/` | local-only mission site mount point | `README.md` only | per-project 내용 전체 |

## 고정 규칙

- `.agent` 는 더 이상 single active body 나 runtime owner 가 아니다.
- `.agent_class` 는 더 이상 canonical loadout root 가 아니다.
- `company/`, `personal/` 분기는 새 정본에 포함하지 않는다.
- `.run/` 루트는 새 정본에 포함하지 않는다.
- repo 에 남아 있는 legacy sample 또는 과거 경로 흔적은 정본을 정의하지 않는다.
