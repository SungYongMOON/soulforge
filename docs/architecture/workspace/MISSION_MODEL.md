# Mission Model

## 목적

- `.mission/` 과 `_workspaces/` 의 owner 경계를 분리한다.
- workflow 절차 canon, party template, held mission plan, project-local run truth 의 관계를 고정한다.

## 구조 개요도

```mermaid
flowchart TD
  WF[".workflow/<workflow_id>/workflow.yaml"] --> MI[".mission/<mission_id>/mission.yaml"]
  PT[".party/<party_id>/party.yaml"] --> MI
  U[".unit/<unit_id>/unit.yaml"] --> MI
  B["local bindings"] --> RP["resolved_plan.yaml"]
  MI --> RD["readiness.yaml"]
  MI --> RP
  MI --> WS["_workmeta/<project_code>/runs/<run_id>/"]
```

## 핵심 구분

- `workflow` = reusable 절차 canon
- `party` = reusable 팀 조합 template
- `mission` = 현재 들고 있는 실제 실행 계획
- `run` = project-local worksite 에 남는 실제 실행 시도 기록

## monster, artifact, mission 구분

- `monster` 는 파일이 아니라 요청/일감 종류다.
- `artifact` 는 mission 이 만들거나 갱신하는 산출물이다.
- `mission` 은 특정 `monster_type` 을 실제로 처리하기 위해 연 실행 계획이다.
- `monster_type` 같은 canonical id 는 stable ASCII 를 유지하고, 사람용 표시는 title/summary/label 에 한국어를 써도 된다.
- 같은 artifact 도 시점에 따라 역할이 달라질 수 있다.
  - 한 mission 에서는 output artifact 이고,
  - 다음 mission 에서는 input artifact 가 될 수 있다.
- 따라서 mission surface 에서는 아래를 분리해서 적는다.
  - `monster_type` = 이번 요청이 무엇인지
  - `input_refs` = 이번 mission 이 먹는 입력 artifact
  - `step_outputs` 또는 `artifacts/` = 이번 mission 이 내는 산출물

## generic 예시

아래는 project-local meeting follow-up pattern 을 generic 하게 적은 예시다.

1. “회의 후 조치와 후속 정리를 진행해달라”는 요청이 들어오면 `monster_type = meeting_followup_request` 로 본다.
2. 이 mission 은 이미 잠긴 input artifact 를 먹는다.
   - `compiled_summary.md`
   - `formal_minutes.md`
   - `followup/` root
3. 그 다음 실제 `mission instance` 를 연다.
4. 이 mission 은 output artifact 를 만든다.
   - `formal_minutes.md` 갱신본
   - `action_items.md`
   - `followup 02~06`
   - workflow review note
5. 이후 “정리본이 업데이트됐으니 패킷을 다시 돌려달라”는 요청이 오면, 그때는 새 `monster_type = meeting_packet_replay_request` 로 본다.
6. 즉 같은 `compiled_summary.md` 도 한 시점에는 output 기준 artifact 이고, 다음 시점에는 새 mission 의 input artifact 가 될 수 있다.

짧게 쓰면 아래 체인이다.

```mermaid
flowchart LR
  M["monster(request)"] --> MI["mission instance"]
  MI --> AO["output artifacts"]
  AO --> NM["next mission input"]
```

## `.mission/` 최소 shape

```text
.mission/
├── index.yaml
└── <mission_id>/
    ├── mission.yaml
    ├── readiness.yaml
    ├── dispatch_request.yaml
    ├── resolved_plan.yaml
    ├── reports/
    └── artifacts/
```

## sample mission

```text
.mission/
└── author_pptx_autofill_conversion_001/
    ├── mission.yaml
    ├── readiness.yaml
    ├── dispatch_request.yaml
    ├── resolved_plan.yaml
    ├── reports/
    └── artifacts/
```

## owner 규칙

- `.mission/<mission_id>/mission.yaml` 은 `workflow_id`, `party_id`, `project_code`, `unit_assignments` 같은 held mission metadata 를 소유한다.
- `.mission/<mission_id>/mission.yaml` 은 mission-scoped `notifications.telegram.*` toggle 도 함께 소유할 수 있다.
- `.mission/<mission_id>/readiness.yaml` 은 `draft`, `blocked`, `ready`, `running`, `completed`, `failed` 같은 현재 준비 상태와 blocking reason 을 소유한다.
- current-default v0 에서 `.mission/<mission_id>/readiness.yaml` 은 `terminal_provenance` pointer 로 `closed_via`, `closed_at`, `terminal_result`, `run_id`, `battle_event_id` 를 함께 둘 수 있다.
- `.mission/<mission_id>/resolved_plan.yaml` 은 current execution plan 의 public-safe resolved view 다.
- raw execution truth 는 `.mission/` 에 두지 않고 `_workmeta/<project_code>/runs/<run_id>/` 아래에 둔다.
- current-default v0 에서 `mission terminal` 은 `required workflow steps done + mission-level battle_event persisted + no open blocker` 로 해석한다.
- current-default v0 mail handoff 에서는 first tracked mission draft 를 먼저 만들 수 있으며, 이때 `workflow_id: null` 은 `readiness.yaml` 이 `blocked` 인 동안에만 허용한다.

## readiness 판단 예시

- `workflow_id` 존재 여부
- `party_id` 존재 여부
- required `actor_slot` 충족 여부
- 실제 `unit_id` assignment 존재 여부
- 필요한 runtime binding resolve 여부
- project-local input 준비 여부

## 최소 필드 예시

### `mission.yaml`

- `mission_id`
- `kind`
- `status`
- `title`
- `summary`
- `project_code`
- `workflow_id`
- `party_id`
- `request_mode`
- `monster_type`
- `target_skill_id` 또는 equivalent target
- `unit_assignments`
- `input_refs`
- `run_refs`
- `notifications.telegram.mission_blocked`
- `notifications.telegram.mission_ready`
- `notifications.telegram.mission_closed`
- `notifications.telegram.mission_failed`

### `readiness.yaml`

- `mission_id`
- `kind`
- `status`
- `summary`
- `checks`
- `blockers`
- `latest_run_id`
- `terminal_provenance.closed_via`
- `terminal_provenance.closed_at`
- `terminal_provenance.terminal_result`
- `terminal_provenance.run_id`
- `terminal_provenance.battle_event_id`

### `resolved_plan.yaml`

- `mission_id`
- `kind`
- `status`
- `workflow`
- `party`
- `unit_assignments`
- `step_outputs`
- `run_refs`

## 현재 상태

- 이 문서는 `.mission/` 도입 phase 의 baseline 이다.
- 기존 prototype run 은 계속 `_workmeta/<project_code>/runs/` 아래에 남긴다.
- 현재는 `mission_check` 와 completed / blocked sample mission entry 가 함께 존재한다.
- owner-local 운영 초안은 `.mission/DECISION_LOG.md`, `.mission/OPS_NOTES.md` 에서 누적하고, 절차형 매뉴얼 초안은 `docs/architecture/workspace/MISSION_MANUAL_DRAFT.md` 에 둔다.
