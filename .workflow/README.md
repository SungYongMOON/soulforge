# .workflow

## 정본 의미

- `.workflow/` 는 workflow canon 과 curated learning history 의 정본 루트다.
- 각 workflow 는 작업 공략서, 협업 절차, handoff 규칙을 소유한다.
- `.workflow/` 는 `.registry` 아래로 들어가지 않는 독립 orchestration root 다.
- `.workflow/` 는 raw run dump, project-local battle log, run index owner 가 아니다.

## canon 과 authoring 구분

- workflow canon 목록은 `index.yaml` 이 소유한다.
- `.workflow/<workflow_id>/` 아래에서 `index.yaml` 에 등록된 항목만 workflow canon entry 로 본다.
- `.workflow/authoring/` 은 draft, template, guide 를 두는 대기실이며 workflow canon entry 가 아니다.
- UI 와 derive consumer 는 폴더 direct scan 대신 `index.yaml` 을 기준으로 workflow 목록을 만들므로, `authoring/` 은 workflow 목록에 표시하지 않는다.

## 관계도

```mermaid
flowchart TD
  WF["workflow.yaml"] --> SG["step_graph.yaml"]
  WF --> RS["role_slots.yaml"]
  WF --> HH["handoff_rules.yaml"]
  WF --> PC["party_compatibility.yaml"]
  SG --> SLOT["actor_slot"]
  SG --> SK["action.skill_id"]
  SG --> EP["execution_profile_ref"]
  SLOT --> PT[".party/<party_id>/member_slots.yaml"]
  SK --> REG[".registry/skills/<skill_id>/skill.yaml"]
  EP --> BIND[".project_agent/bindings/execution_profile_binding.yaml"]
```

## 실행 시퀀스

```mermaid
sequenceDiagram
  participant AH as autohunt
  participant RUN as runner
  participant WF as workflow
  participant PT as party
  participant BD as bindings
  participant SA as sub-agent
  AH->>RUN: workflow_id + party_id + entry_step_id
  RUN->>WF: read actor_slot, skill_id, execution_profile_ref
  RUN->>PT: resolve actor_slot -> unit_id
  RUN->>BD: resolve skill_id / execution_profile_ref
  RUN->>SA: spawn payload
  SA-->>RUN: result
```

## 무엇을 둔다

- `index.yaml`
- `authoring/`
- `<workflow_id>/workflow.yaml`
- `<workflow_id>/role_slots.yaml`
- `<workflow_id>/step_graph.yaml`
- `<workflow_id>/handoff_rules.yaml`
- `<workflow_id>/monster_rules.yaml`
- `<workflow_id>/party_compatibility.yaml`
- `<workflow_id>/history/`

## 무엇을 두지 않는다

- `_workspaces/<project_code>/.project_agent/runs/<run_id>/` raw execution truth
- project code, run id, raw artifact, battle log, transcript dump
- active unit runtime state

## 왜 이렇게 둔다

- workflow 는 여러 unit 과 party 가 재사용하는 공략서이므로 raw 실행 결과와 분리되어야 한다.
- public repo 에 남길 수 있는 것은 curated learning summary 뿐이고, raw run 은 mission site 가 소유한다.
- `step_graph.yaml` 의 각 step 는 필요하면 `execution_profile_ref` 를 가질 수 있고, 실제 모델/도구 preset 은 `.project_agent/bindings/execution_profile_binding.yaml` 에서 resolve 한다.
- `step_graph.yaml` 의 `action.skill_id` 는 `.registry/skills/<skill_id>/skill.yaml` 을 가리키며, local runtime 에서는 `.project_agent/bindings/skill_execution_binding.yaml` 이 installed Codex skill name 을 resolve 할 수 있다.
- skill authoring 같은 운영 workflow 는 tracked package draft 와 install handoff note 를 만들 수 있지만, 실제 installed mirror sync 는 local operation 절차로 남길 수 있다.

## 샘플 구성

- [`frontline_assault/workflow.yaml`](frontline_assault/workflow.yaml): Frontline Assault workflow canon for coordinated assault operations.
- [`frontline_assault/history/README.md`](frontline_assault/history/README.md): history guidance that keeps curated lessons outside raw runtime truth.
- [`build_lineage_map/workflow.yaml`](build_lineage_map/workflow.yaml): bounded lineage-map opening workflow sample with explicit step sequence and planning artifacts.
- [`author_skill_package/workflow.yaml`](author_skill_package/workflow.yaml): guild-master authoring workflow sample for deciding when a request should become a reusable skill package.
- [`authoring/task_note.template.md`](authoring/task_note.template.md): raw task memo template for converting real work into workflow drafts.
- [`authoring/workflow_draft.template.yaml`](authoring/workflow_draft.template.yaml): workflow draft template for step sequencing, actors, skills, and outputs.
- [`authoring/SKILL_WORKFLOW_GUIDE.md`](authoring/SKILL_WORKFLOW_GUIDE.md): user-facing guide for deciding when to route work into a skill-authoring workflow.
