# 목표 트리

## 목적

- 정본 루트 구조를 고정한다.
- 일곱 canonical root 의 owner 경계와 `guild_hall` / `_workspaces` public-private tracking 원칙을 같은 문서에서 본다.
- Soulforge root 아래 nested private repo `_workmeta/` 가 project metadata 와 runtime truth 를 어떻게 담는지도 같이 본다.

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
│   ├── engineering_profiles/     public-safe organization profile catalog and schemas
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
├── guild_hall/
│   ├── README.md
│   ├── gateway/
│   ├── doctor/
│   ├── town_crier/
│   ├── night_watch/
│   ├── dungeon_assignment/
│   ├── engineering_engine/
│   │   ├── core/                 target: shared Engine Core Modules
│   │   └── engines/              target: independent Domain Engine packages
│   └── state/
├── _workspaces/
│   └── README.md
├── docs/
│   └── architecture/
│       ├── foundation/
│       ├── bootstrap/
│       ├── guild_hall/
│       ├── workspace/
│       └── ui/
├── ui-workspace/
└── README.md
```

- `.registry/species/<species_id>/species.yaml` 가 species truth 와 `heroes:` inline set 을 함께 가진다.
- `.registry/skills/`, `.registry/tools/`, `.registry/knowledge/` 는 reusable canon bucket 이며, class/unit/workflow sample 을 뒷받침하는 minimal seed entry 를 가질 수 있다.
- `.mission/<mission_id>/mission.yaml` 는 held mission plan owner 이고, `readiness.yaml` 는 현재 실행 가능 상태를 기록한다.
- `guild_hall/` 은 cross-project 기능 owner 루트이고, 실제 local state 는 `guild_hall/state/**` 아래에서만 materialize 한다.
- 위 트리의 `guild_hall/` 자식은 **대표 예시**다. 자식 전체의 정본 열거는 `guild_hall/README.md` 의 `## 구성` 이 소유한다. 이 문서는 root 경계를 고정하고, root 내부 자식 목록은 owner-local README 를 따른다.
- `engineering_profiles/`, `engineering_engine/core/`, `engineering_engine/engines/`는 2026-08-25 물리 migration이 완료되었다. legacy flat entry points는 호환 re-export로 유지되며, 조립 모델 및 계약은 `docs/architecture/guild_hall/ENGINE_CORE_DOMAIN_PROFILE_ASSEMBLY_MODEL_V0.md`가 소유한다.
- `.registry/engineering_profiles/**`에는 public-safe schema·identity·ref·hash·synthetic example만 허용한다. 실제 고객·계약·회사-private profile payload는 `_workspaces` owner에 두고 `_workmeta`에는 metadata receipt만 둔다.
- 기존 tracked LIG-named overlay는 target catalog가 아니라 legacy classification `HOLD`다. source/public-safe 분류 뒤 private relocation 또는 synthetic/ref replacement를 통과해야 한다.

## `guild_hall` local operations state

```text
guild_hall/
├── gateway/
├── doctor/
├── town_crier/
├── night_watch/
├── dungeon_assignment/
└── state/
    ├── gateway/
    │   ├── mailbox/
    │   ├── intake_inbox/
    │   ├── bindings/
    │   └── log/
    ├── doctor/
    │   └── status.json
    ├── town_crier/
    │   ├── queue/
    │   ├── state/
    │   ├── telegram_notify.env
    │   └── log/
    ├── night_watch/
    └── dungeon_assignment/
```

- `guild_hall/state/**` 는 local-only state 이며 public repo 에 올리지 않는다.
- `gateway` 는 mail fetch 와 intake staging 을 소유한다.
- `doctor` 는 clone 된 PC 의 bootstrap readiness 점검과 local doctor status 를 소유한다.
- `town_crier` 는 notify queue 와 Telegram transport 를 소유한다.
- `night_watch` 와 `dungeon_assignment` 는 cross-project 운영 자리만 먼저 잠근다.

## `_workspaces` local materialization

```text
_workspaces/
├── README.md
└── <project_code>/
    └── ... actual project files ...
```

- public repo 에서는 `_workspaces/README.md` 만 추적한다.
- `_workspaces/<project_code>/` 는 ERP/Vault가 관리하는 프로젝트 정본 원자료·파일 revision의 local/private materialization 주소다. 사람·Bot의 자유 작업폴더가 아니다.
- `_workspaces` 는 더 이상 cross-project ingress root 를 두지 않는다.
- assigned execution plan owner 는 `_workspaces/` 나 `_workmeta/` 가 아니라 `.mission/` 이 소유한다.
- raw execution truth와 검토 전 작업물은 Soulforge 바깥의 `human_work_root` 또는 `bot_work_root`가 소유한다. 검토·custody·revision Gate를 통과한 프로젝트 원자료와 산출 revision만 `_workspaces/<project_code>/...`에 materialize하며, `_workmeta/<project_code>/runs/<run_id>/`는 compact execution metadata만 소유한다.
- project-side monster record owner 는 `_workmeta/<project_code>/monsters/` 다.
- `dungeons/`, `analytics/`, `nightly_healing/`, `reports/`, `log/`, `artifacts/` 도 public tracking 대상이 아니다.
- tracked workspace sample 이 필요하면 `_workspaces/` 아래가 아니라 `docs/architecture/workspace/examples/` 아래에 둔다.

## `_workmeta` nested private repo

```text
_workmeta/
└── <project_code>/
    ├── contract.yaml
    ├── bindings/
    ├── monsters/
    ├── autohunt/
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

- `_workmeta/` 는 Soulforge root 아래 nested private repo 다.
- project contract, project-side monster record, autohunt policy와 compact execution metadata는 `_workmeta/<project_code>/` 아래에 둔다. raw execution truth와 artifact는 두지 않는다.

## 루트별 owner 의미

| 루트 | owner 의미 | public repo 허용 범위 | public repo 금지 범위 |
| --- | --- | --- | --- |
| `.registry/` | outer canon/store | species, class, skill, tool, knowledge canon 과 구조 문서 | active runtime, project-local truth, run dump |
| `.unit/` | active agent unit owner | owner 계약 문서와 구조 설명 | 실전 운영 상태, 민감 로그, raw artifacts 자동 반영 |
| `.workflow/` | independent orchestration canon | workflow 정의, workflow-level profile policy, public-safe calibration archive, sanitized history | project-local raw run dump, private/raw transcript, battle log |
| `.party/` | independent workflow-chain orchestration template | party workflow-chain/loadout, entry workflow, allowed workflow set, chain-level observations | workflow 내부 step/profile, raw battle log, project-specific operational metrics |
| `.mission/` | held mission plan owner | mission plan, readiness, public-safe dispatch / resolve metadata | raw run dump, project-local truth |
| `guild_hall/` | cross-project 기능 owner root | 운영 owner(gateway, town_crier, night_watch, dungeon_assignment), knowledge supply·projection owner, cross-project 결정론 domain engine 계약·kernel·public-safe fixture, 그리고 각 owner 문서 | local state, mailbox dump, Telegram env, queue state, project payload, 계약 원문, source PDF, snapshot payload, secret |
| `_workspaces/` | local-only project worksite | `README.md` only | per-project 내용 전체 |

## 고정 규칙

- species canon 은 `species.yaml + heroes inline` 모델을 사용한다.
- `.workflow` 와 `.party` 는 `.registry` 아래로 들어가지 않는다.
- `.mission` 은 `.workflow`, `.party`, runtime assignment 를 참조해 held mission plan 을 소유한다.
- `guild_hall` 은 cross-project ingress, notify, night watch, assignment 운영을 소유한다.
- `guild_hall` 은 추가로 cross-project **결정론 domain engine 계약과 kernel** 을 소유한다. 이 범위에는 project payload, 계약 원문, runtime state, secret 을 두지 않는다.
- Engineering Engine target은 shared Core와 독립 Domain Engine package를 분리한다. Organization Profile과 Project Profile을 별도 엔진으로 만들지 않으며 overlay는 Profile의 내부 구현이다.
- Project Profile·Project Binding·Typed Facts·Effective Rule Set payload는 `_workspaces/<project_code>/**`에 두고 `_workmeta`에는 pointer·hash·status·compact receipt만 둔다.
- `guild_hall/state/**` 는 local-only state 이다.
- project candidate root 는 `_workspaces/<project_code>/` direct child 구조를 사용한다.
- project-side monster record 는 `_workmeta/<project_code>/monsters/` 아래에 둔다.
- raw execution truth와 검토 전 작업물은 외부 사람/Bot work root에 두고, ERP가 관리하는 프로젝트 원자료·revision만 `_workspaces`에 materialize한다. `_workmeta/<project_code>/runs/<run_id>/`에는 pointer, hash, status와 compact receipt만 둔다.
- `.run/` 루트는 새 정본에 포함하지 않는다.
- public repo 에서는 `_workspaces/README.md` 만 추적한다.
