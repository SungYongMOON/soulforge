# 목표 트리

## 목적

- 저장소의 목표 구조와 owner 경계를 한눈에 보여준다.
- 특히 `.agent` 의 active/catalog layer 와 `.agent_class` 의 canonical loadout layer 를 같이 고정한다.

## 최종 `.agent` target tree

```text
.agent/
├── README.md
├── body.yaml
├── body_state.yaml
├── docs/
│   └── architecture/
│       ├── AGENT_BODY_MODEL.md
│       ├── BODY_METADATA_CONTRACT.md
│       ├── AGENT_CATALOG_LAYER_MODEL.md
│       ├── HERO_OVERLAY_MODEL.md
│       ├── RUNTIME_MODEL.md
│       ├── MEMORY_MODEL.md
│       ├── TEAM_EXPANSION_MODEL.md
│       └── COORDINATION_PROTOCOLS.md
├── identity/
│   ├── README.md
│   ├── species_profile.yaml
│   ├── hero_imprint.yaml
│   └── identity_manifest.yaml
├── catalog/
│   ├── README.md
│   ├── identity/
│   │   ├── README.md
│   │   ├── species/
│   │   │   ├── README.md
│   │   │   ├── index.yaml
│   │   │   └── soulforge-default.species.yaml
│   │   └── heroes/
│   │       ├── README.md
│   │       ├── index.yaml
│   │       └── soulforge_default/
│   │           ├── README.md
│   │           └── craft_sage.hero.yaml
│   └── class/
│       ├── README.md
│       ├── profiles/
│       │   ├── README.md
│       │   └── profiles_catalog.yaml
│       ├── skills/
│       │   ├── README.md
│       │   └── skills_catalog.yaml
│       ├── tools/
│       │   ├── README.md
│       │   ├── adapters_catalog.yaml
│       │   ├── connectors_catalog.yaml
│       │   ├── local_cli_catalog.yaml
│       │   └── mcp_catalog.yaml
│       ├── knowledge/
│       │   ├── README.md
│       │   └── knowledge_catalog.yaml
│       └── workflows/
│           ├── README.md
│           └── workflows_catalog.yaml
├── registry/
│   ├── README.md
│   ├── active_class_binding.yaml
│   ├── workspace_binding.yaml
│   ├── capability_index.yaml
│   └── trait_bindings.yaml
├── policy/
├── communication/
├── protocols/
├── runtime/
├── memory/
├── sessions/
├── autonomic/
└── artifacts/
```

## 저장소 상위 구조

```text
./
├── .agent/
├── .agent_class/
│   ├── _local/
│   ├── docs/
│   │   ├── architecture/
│   │   ├── plans/
│   │   └── prompts/
│   ├── knowledge/
│   ├── manifests/
│   ├── profiles/
│   ├── skills/
│   ├── tools/
│   │   ├── adapters/
│   │   ├── connectors/
│   │   ├── local_cli/
│   │   └── mcp/
│   ├── workflows/
│   ├── class.yaml
│   └── loadout.yaml
├── _workspaces/
├── apps/
├── fixtures/
├── packages/
├── schemas/
├── tools/
├── ui-workspace/
│   ├── DONE.md
│   ├── apps/
│   │   ├── renderer-web/
│   │   └── skin-lab-storybook/
│   ├── packages/
│   │   ├── ui-contract/
│   │   ├── renderer-core/
│   │   ├── renderer-react/
│   │   ├── theme-contract/
│   │   └── theme-adventurers-desk/
│   ├── tools/
│   │   ├── ui-lint/
│   │   └── legacy-python-viewer/
│   ├── fixtures/
│   │   └── ui-state/
│   ├── schemas/
│   │   └── ui-state.schema.json
│   └── docs/
│       └── UI_NEXT_PHASE_BACKLOG.md
├── ui/
│   └── viewer/
├── docs/
│   ├── architecture/
│   └── ui/
├── dev/
│   ├── log/
│   └── plan/
├── package.json
└── README.md
```

## 폴더별 상위 책임

| 경로 | 상위 책임 |
| --- | --- |
| `.agent/identity/` | active species 와 optional hero overlay |
| `.agent/catalog/` | body-owned selection catalog layer |
| `.agent/registry/` | active binding, index, reference |
| `.agent_class/` | reusable loadout template 와 canonical asset owner |
| `.agent_class/profiles/` | canonical default preference modes |
| `.agent_class/manifests/` | canonical capability index, equip rule, dependency graph |
| `_workspaces/` | 실제 프로젝트 운영 현장 |
| `apps/`, `packages/`, `tools/`, `fixtures/`, `schemas/` | ui-workspace relocation stub |
| `ui-workspace/` | portable UI 전용 workspace |
| `ui-workspace/apps/renderer-web/` | fixture-first renderer web shell |
| `ui-workspace/packages/renderer-core/` | portable renderer contract consumer core |
| `ui-workspace/tools/ui-lint/` | UI contract / catalog / boundary lint suite |
| `ui-workspace/fixtures/ui-state/` | renderer fixture baseline |
| `ui-workspace/schemas/` | renderer contract schema |
| `ui/` | relocation / legacy pointer |
| `docs/architecture/` | 저장소 전체 구조와 root-owned 계약 문서 |
| `docs/ui/` | ui-workspace relocation 문서군 |
