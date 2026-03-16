# 2026-03-16 새 정본 vNext canon migration plan

## 목적

- 기존 Soulforge 정본 의미를 유지하지 않고, 새 정본 vNext를 기준으로 저장소 구조를 재정의한다.
- `.agent`, `.agent_class`, `.workflow`, `.party`, `_workspaces` 의 새 owner 경계를 먼저 문서로 고정한다.
- 실제 구조 변경 전에 영향 범위, cutover 순서, tooling 재설계 범위를 명확히 남긴다.

## 범위

- 정본 문서 재작성 계획
- 폴더 구조 migration 계획
- 참조 경로와 validator/tooling 영향 범위 정리
- sample / fixture / local-only mission site 전략 정리

## 비범위

- 이번 문서에서 실제 폴더 이동이나 validator 코드 수정은 하지 않는다.
- 외부 회사 workspace 실제 경로와 동기화 구현은 다루지 않는다.
- battle log retention, redaction, backup 구현은 후속 단계로 남긴다.

## 새 정본 vNext 이해 요약

### 1. `.agent`

- `.agent` 는 더 이상 single active body 가 아니다.
- species 와 hero catalog 의 정본 루트다.
- `species` 는 durable default 성향층이다.
- `hero` 는 capability 를 추가하지 않는 overlay 다.
- active runtime, memory, sessions, body state 를 소유하지 않는다.

### 2. `.agent_class`

- `.agent_class` 는 더 이상 canonical loadout root 가 아니다.
- 선택 가능한 class / capability package catalog 의 정본 루트다.
- 각 class 는 `class.yaml`, `knowledge_refs.yaml`, `skill_refs.yaml`, `tool_refs.yaml`, `profiles/`, `manifests/` 를 가진다.
- workflow 는 여기서 빠지고, workflow 와의 적합성/참조 관계만 가진다.

### 3. `.workflow`

- `.workflow` 는 workflow canon 의 정본 루트다.
- workflow 는 단일 agent 절차가 아니라 작업 공략서와 협업 절차 정의 계층이다.
- 각 workflow 는 `workflow.yaml`, `role_slots.yaml`, `step_graph.yaml`, `handoff_rules.yaml`, `monster_rules.yaml`, `party_compatibility.yaml`, `history/` 를 가진다.
- `history/` 는 raw run log 가 아니라 학습/개선 요약만 둔다.

### 4. `.party`

- `.party` 는 reusable party template 의 정본 루트다.
- 각 party 는 `party.yaml`, `member_slots.yaml`, `allowed_species.yaml`, `allowed_classes.yaml`, `allowed_workflows.yaml`, `appserver_profile.yaml`, `stats/` 를 가진다.
- `stats/` 는 raw battle log 가 아니라 성과 집계만 둔다.

### 5. `_workspaces`

- `company/`, `personal/` 레벨은 제거한다.
- `_workspaces/<project_code>/` 가 실제 과제 현장 루트다.
- 각 과제 폴더 안에는 실제 SE 체계공학 폴더트리와 `.project_agent/` 가 함께 존재한다.
- `.project_agent/` 는 분리된 registry 가 아니라 현장 안의 운영 계약과 실행 truth 보관 위치다.

### 6. raw execution truth

- 별도 `.run/` 루트는 두지 않는다.
- raw run 의 정본 owner 는 `_workspaces/<project_code>/.project_agent/runs/<run_id>/` 다.
- `dungeons/`, `analytics/`, `nightly_healing/` 도 각 과제의 `.project_agent/` 아래에 둔다.

### 7. public / private 경계

- public repo 에는 canon, docs, schema, template, summary 만 남긴다.
- `_workspaces/<project_code>/**` 실제 내용은 public GitHub 에 올리지 않는다.
- `_workspaces/` 는 local/private mission site mount point 로 취급한다.

## vNext frozen decisions

### A. `.unit`

- `.unit` 를 새 루트로 도입한다.
- `.unit` 는 실제 active agent unit 의 owner 다.
- 기존 `.agent` 가 소유하던 `policy`, `protocols`, `runtime`, `memory`, `sessions`, `autonomic`, `artifacts` 는 새 canon 에서 `.unit/<unit_id>/` 아래로 이동한다.

### B. `_workspaces`

- public repo 에서는 `_workspaces/README.md` 만 추적한다.
- `_workspaces/<project_code>/` 실제 과제 폴더는 local/private mission site mount 로만 존재한다.
- `_workspaces/` 는 public repo 에서 reserved/local-only mount point 로만 남고, 실제 `<project_code>/` 디렉터리는 local environment 에서만 materialize 된다.
- 실제 project tree, `.project_agent/runs`, `dungeons`, `analytics`, `nightly_healing`, `reports`, `artifacts` 는 public tracking 대상이 아니다.

### C. `.workflow/history`

- `.workflow/history` 는 run index 나 raw run identifier 를 소유하지 않는다.
- `.workflow/history` 는 curated/sanitized learning summary 만 소유한다.

### D. `.party/stats`

- `.party/stats` 는 template-level fit / observation 만 소유한다.
- 실제 operational performance metrics 는 local workspace analytics 에만 남긴다.

### E. `run`

- run 은 root owner 가 아니라 local mission site execution instance 다.
- public repo 에는 run record 를 자동 동기화하지 않는다.

## 새 owner model

| 루트 | 새 owner 의미 | 최소 필수 파일 | raw data 금지 | summary/history 허용 |
| --- | --- | --- | --- | --- |
| `.agent` | species / hero catalog | `index.yaml`, `<species>/species.yaml`, `<species>/heroes/<hero>/hero.yaml` | runtime state, raw run, battle log, memory dump | species/hero 설명 문서만 허용 |
| `.unit` | active agent unit owner | `<unit>/unit.yaml`, `policy/`, `protocols/`, `runtime/`, `memory/`, `sessions/`, `autonomic/`, `artifacts/` | public repo에 실전 운영 상태와 민감 로그 자동 반영 금지 | curated owner 문서만 허용 |
| `.agent_class` | class / capability package catalog | `index.yaml`, `<class>/class.yaml`, `knowledge_refs.yaml`, `skill_refs.yaml`, `tool_refs.yaml`, `profiles/`, `manifests/` | workflow raw log, battle log, project run data | class profile/manifests 요약 허용 |
| `.workflow` | workflow canon + curated learning history | `index.yaml`, `<workflow>/workflow.yaml`, `role_slots.yaml`, `step_graph.yaml`, `handoff_rules.yaml`, `monster_rules.yaml`, `party_compatibility.yaml`, `history/` | raw run dump, raw artifact, project-local battle log, run index | `history/` 아래 curated 개선 요약만 허용 |
| `.party` | reusable party template + template-level stats | `index.yaml`, `<party>/party.yaml`, `member_slots.yaml`, `allowed_species.yaml`, `allowed_classes.yaml`, `allowed_workflows.yaml`, `appserver_profile.yaml`, `stats/` | raw battle log, raw feedback dump, project-specific operational metrics | `stats/` 아래 fit/observation 요약만 허용 |
| `_workspaces` | local-only mission site mount point | `README.md` only in public repo | public repo에서 per-project 내용 추적 금지 | docs/example snippet 만 허용 |

## 현재 구조와의 충돌 지점

### 루트 / foundation

- `README.md` 는 현재 `.agent = private operating system`, `.agent_class = loadout`, `_workspaces = mission site` 3축을 전제한다.
- `docs/architecture/foundation/TARGET_TREE.md` 는 `.agent/body.yaml`, `.agent/body_state.yaml`, `.agent/catalog/class/**`, `.agent_class/loadout.yaml`, `_workspaces/company|personal` 구조를 canon 으로 고정한다.
- `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md` 는 `.agent` body 문서와 `.agent_class` loadout 문서를 정본으로 고정한다.

### `.agent`

- `.agent/README.md`
- `.agent/docs/architecture/AGENT_BODY_MODEL.md`
- `.agent/docs/architecture/BODY_METADATA_CONTRACT.md`
- `.agent/docs/architecture/AGENT_CATALOG_LAYER_MODEL.md`
- `.agent/body.yaml`
- `.agent/body_state.yaml`

위 파일들은 모두 `.agent` 를 single active body 와 runtime owner 로 해석하고 있어 vNext 와 정면으로 충돌한다.

### `.agent_class`

- `.agent_class/README.md`
- `.agent_class/docs/architecture/AGENT_CLASS_MODEL.md`
- `.agent_class/docs/architecture/CLASS_LOADOUT_MODEL.md`
- `.agent_class/workflows/`
- `.agent_class/class.yaml`
- `.agent_class/loadout.yaml`

위 파일들은 `.agent_class` 를 canonical loadout root 로 보고 workflow 를 class owner 로 둔다.

### `_workspaces`

- `_workspaces/README.md`
- `docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md`
- `docs/architecture/workspace/PROJECT_AGENT_MINIMUM_SCHEMA.md`
- `docs/architecture/workspace/PROJECT_AGENT_RESOLVE_CONTRACT.md`

위 문서들은 `company/`, `personal/` 2-root 구조와 repo-tracked sample project 전제를 갖고 있다.

### tooling / validator / UI fixtures

- `.agent_class/tools/local_cli/ui_sync/ui_sync.py`
- `ui-workspace/fixtures/ui-state/*.json`
- `ui-workspace/packages/renderer-core/src/fixtures.ts`
- `ui-workspace/tools/ui-lint/**`

위 도구들은 `body.yaml`, `class.yaml`, `loadout.yaml`, `_workspaces/company|personal`, `default_loadout == active_profile`, `.agent_class/workflows` resolution 을 전제한다.

### sample baseline

- `_workspaces/company/sample_reference_project`
- `_workspaces/company/sample_bound_project`
- `_workspaces/personal/sample_unbound_project`

이 샘플 세트는 새 local-only `_workspaces/<project>` 정책과 충돌한다.

## migration 원칙

1. 문서 먼저 바꾼다.
2. public canon 과 local mission site 경계를 먼저 고정한다.
3. 새 루트 의미를 고정하기 전에는 validator 를 억지로 맞추지 않는다.
4. `_workspaces` 는 public sample 저장소가 아니라 local mount point 로 재정의한다.
5. raw execution truth 는 `_workspaces/<project>/.project_agent/` 에만 남기고 public repo 에는 summary/template 만 남긴다.
6. `.workflow/history` 와 `.party/stats` 는 curated/sanitized summary 만 public repo 에 남긴다.
7. 판타지 용어는 유지하되 owner 와 실행 책임을 먼저 닫는다.

## 단계별 migration plan

### Phase 0. 용어 동결

- [ ] `species`, `hero`, `class`, `workflow`, `party`, `dungeon`, `monster`, `run`, `healing` 의 owner 정의를 문서 첫머리에 동결한다.
- [ ] `workflow = 공략서`, `party = 조합 템플릿`, `run = 실제 한 판` 구분을 모든 문서에 일관되게 적용한다.
- [ ] `raw truth`, `summary`, `derived`, `template`, `local-only` 용어를 glossary 로 고정한다.

### Phase 1. foundation canon rewrite

- [ ] `README.md` 를 새 6축 구조(`.agent`, `.unit`, `.agent_class`, `.workflow`, `.party`, `_workspaces`)로 재작성한다.
- [ ] `docs/architecture/foundation/TARGET_TREE.md` 를 vNext 트리 기준으로 재작성한다.
- [ ] `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md` 를 새 owner 모델 기준으로 재작성한다.
- [ ] `docs/architecture/foundation/REPOSITORY_PURPOSE.md` 와 `AGENT_WORLD_MODEL.md` 도 새 해석에 맞춰 갱신한다.
- [ ] 새 정본 설명 문서 `docs/architecture/foundation/MULTI_GUILD_MODEL.md` 를 추가한다.

### Phase 2. owner-local docs rewrite

- [ ] `.agent/README.md` 를 species/hero catalog owner 문서로 재작성한다.
- [ ] `.unit/README.md` 를 active agent unit owner 문서로 신설한다.
- [ ] `.agent_class/README.md` 를 class/package catalog owner 문서로 재작성한다.
- [ ] `.workflow/README.md` 와 `.party/README.md` 를 신설한다.
- [ ] `.agent` 와 `.agent_class` 의 기존 body/loadout 문서 중 유지할 문서는 legacy bridge 로 강등하고, `.unit` 기준 새 owner-local 문서를 추가한다.
- [ ] `_workspaces/README.md` 를 local-only mission site mount point 문서로 재작성한다.

### Phase 3. 루트 구조 생성

- [ ] `.unit/` 루트를 만든다.
- [ ] `.workflow/` 루트를 만든다.
- [ ] `.party/` 루트를 만든다.
- [ ] `.agent/` 를 species 디렉터리 구조로 재편한다.
- [ ] `.agent_class/` 를 class 디렉터리 구조로 재편한다.
- [ ] `_workspaces/company`, `_workspaces/personal` 를 제거하고 `_workspaces/` 를 local-only mission site mount point 로 전환한다.

### Phase 4. 참조 경로와 contract redesign

- [ ] `.project_agent/contract.yaml` 에서 `body_ref`, `class_ref`, `default_loadout` 전제를 재검토하고 새 필드 집합을 정의한다.
- [ ] `.project_agent/contract.yaml` 이 `.unit`, `.agent_class`, `.workflow`, `.party` 를 어떻게 참조하는지 새 binding vocabulary 를 정의한다.
- [ ] `workflow_bindings.yaml` 의 `workflow_id` resolution source 를 `.agent_class/workflows` 에서 `.workflow/<workflow_id>` 로 바꾼다.
- [ ] run-level binding 파일 스키마를 정의한다.
  - `party_binding.yaml`
  - `workflow_binding.yaml`
  - `member_bindings.yaml`
  - `appserver_binding.yaml`
  - `artifact_refs.yaml`
- [ ] `_workspaces/<project>/.project_agent/dungeons`, `runs`, `analytics`, `nightly_healing` 의 최소 스키마를 정의한다.

### Phase 5. public/private 분리와 `.gitignore`

- [ ] `_workspaces/**` 전체 ignore 기본 정책을 설계한다.
- [ ] public repo 에 남길 `_workspaces/README.md` 와 최소 placeholder 만 예외 허용한다.
- [ ] 민감 경로, artifact, battle log, analytics, nightly healing, reports, attachments 가 public tracking 되지 않게 guard rule 을 둔다.
- [ ] local mount 예시와 host-local setup 가이드를 문서화한다.

### Phase 6. tooling / validator refactor

- [ ] `ui_sync.py` 의 `body.yaml`, `body_state.yaml`, `class.yaml`, `loadout.yaml` 의존을 제거하고 `.unit` 루트 인식을 추가한다.
- [ ] `_workspaces/company|personal` scan 을 flat `_workspaces/<project>` scan 으로 바꾼다.
- [ ] `default_loadout == active_profile` 검증을 제거한다.
- [ ] `.agent_class/workflows` module resolution 을 `.workflow` canon resolution 으로 바꾼다.
- [ ] UI derived payload 를 `.agent/.unit/.agent_class/.workflow/.party/_workspaces` 6축 구조로 바꾼다.
- [ ] 필요하면 `sync-body-state` 명령은 제거하거나 새 index sync 로 교체한다.

### Phase 7. sample / fixture 전략 전환

- [ ] repo-tracked `_workspaces/company/sample_*` 와 `_workspaces/personal/sample_*` baseline 을 폐기한다.
- [ ] public fixture 는 `ui-workspace/fixtures/ui-state/` synthetic payload 로 유지한다.
- [ ] workspace contract 예시는 docs 아래 example snippet 으로 옮긴다.
- [ ] local smoke 검증은 gitignored `_workspaces/<project>` 나 repo 밖 private mount 로 수행한다.
- [ ] fixture 가 참조하는 경로도 `company/personal` 대신 flat project code 구조로 갱신한다.
- [ ] workflow history 와 party stats fixture 도 project/run id 가 없는 sanitized synthetic fixture 로 제한한다.

### Phase 8. cutover / cleanup

- [ ] legacy body/loadout 문서와 bridge 파일의 유지 기간을 결정한다.
- [ ] 새 canon 기준 validation 이 green 이 된 뒤 legacy 전용 tooling 을 제거한다.
- [ ] dev log 에 cutover 결과와 남은 예외를 기록한다.

## 우선순위별 핵심 파일 변경 대상

### Priority 1

- `README.md`
- `docs/architecture/foundation/TARGET_TREE.md`
- `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md`
- `_workspaces/README.md`
- `docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md`
- `.gitignore`

### Priority 2

- `docs/architecture/workspace/PROJECT_AGENT_MINIMUM_SCHEMA.md`
- `docs/architecture/workspace/PROJECT_AGENT_RESOLVE_CONTRACT.md`
- `.agent/README.md`
- `.unit/README.md`
- `.agent_class/README.md`
- 새 `.workflow/README.md`
- 새 `.party/README.md`

### Priority 3

- `.agent_class/tools/local_cli/ui_sync/ui_sync.py`
- `ui-workspace/fixtures/ui-state/*.json`
- `ui-workspace/packages/renderer-core/src/fixtures.ts`
- `ui-workspace/tools/ui-lint/**`

## tooling / validator 영향 범위 상세

### 현재 단일-root 가정

- `BODY_YAML = .agent/body.yaml`
- `CLASS_YAML = .agent_class/class.yaml`
- `LOADOUT_YAML = .agent_class/loadout.yaml`
- `WORKSPACE_KINDS = ("company", "personal")`

이 네 축은 모두 새 canon 과 충돌한다.

### validator 재설계 요구

- body validation 은 species/hero catalog validation 으로 바뀌어야 한다.
- unit validation 은 `.unit/<unit_id>/` 구조와 owner 경계 검증으로 새로 들어가야 한다.
- class validation 은 class package ref validation 으로 바뀌어야 한다.
- workflow validation 은 `.workflow/<workflow>` 최소 파일 세트 검증을 추가해야 한다.
- party validation 은 `.party/<party>` 최소 파일 세트 검증을 추가해야 한다.
- workspace validation 은 local-only mission site mount 존재 여부와 `.project_agent` 최소 파일 세트 검증으로 바뀌어야 한다.
- raw run validation 은 public CI 기본 경로가 아니라 opt-in local smoke 경로로 분리해야 한다.

### UI derived state 영향

- 현재 `overview/body/class/workspaces` 탭만 있는 derived state 는 insufficient 하다.
- 최소한 `species`, `units`, `classes`, `workflows`, `parties`, `workspaces` 표면을 separate payload 로 만들어야 한다.
- `_workspaces` 가 local-only 이므로 fixture 생성은 실제 파일 스캔보다 synthetic sample 우선으로 바뀌어야 한다.

## sample / fixture 전략

### public repo 에 남길 것

- canon 문서
- schema
- template
- example snippet
- synthetic UI fixture

### public repo 에 두면 안 되는 것

- 실제 `_workspaces/<project>` 폴더 내용
- 실제 `.project_agent/runs`
- battle logs
- real feedback events
- analytics, nightly healing, artifacts, reports
- actual party performance metrics
- workflow run index

### 대체 전략

- `_workspaces` baseline 은 repo-tracked sample project 대신 docs/example snippet 으로만 유지한다.
- renderer 와 lint 는 synthetic fixture JSON 을 기준으로 계속 검증한다.
- local smoke script 는 gitignored local mission site 를 읽는 별도 경로로 분리한다.
- workflow history 와 party stats 도 synthetic curated fixture 만 사용한다.

## 남은 위험 / 열린 질문

1. `.agent_class/*_refs.yaml` 가 가리킬 canonical `.skills`, `.tools`, `.knowledge` 루트를 새 canon 에 포함할지 여부가 아직 비어 있다.
2. `body.yaml`, `body_state.yaml`, `class.yaml`, `loadout.yaml` 를 bridge 로 잠시 유지할지, 한 번에 제거할지 cutover 방식이 아직 열려 있다.

## 다음 액션 제안

1. foundation 3문서와 `_workspaces/README.md` 를 먼저 새 canon 으로 재작성한다.
2. 동시에 `.gitignore` 와 `_workspaces` local-only 정책 문서를 닫는다.
3. 그 다음 `.unit`, `.workflow`, `.party` 루트와 owner 문서를 추가한다.
4. 마지막으로 validator / UI fixture 를 새 canon 과 security-first policy 에 맞게 교체한다.
