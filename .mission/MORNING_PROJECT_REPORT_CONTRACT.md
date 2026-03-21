# Morning Project Report Contract

## 목적

- 이 문서는 아침에 owner 가 볼 `project report` 의 local-only contract 초안이다.
- 보고서는 guild master lane 의 nightly sweep mission 이 밤 동안 모은 advisory 결과를 다음 날 빠르게 읽을 수 있게 정리하는 용도다.

## 한 줄 정의

- `morning project report` 는 guild master lane 의 nightly mission 결과를 바탕으로 mission, code health, boundary drift, battle ledger 를 한 번에 훑는 owner-facing briefing 이다.

## 경계

- 이 보고서는 local-only report 다.
- tracked repo 에 실제 report dump 를 올리지 않는다.
- 승격 authority 나 readiness owner 를 대신하지 않는다.
- raw run truth 전체를 복제하지 않고, 필요한 요약만 남긴다.

## 권장 경로

- `_workspaces/<project_code>/.project_agent/reports/morning_report/<date>.md`
- `_workspaces/<project_code>/.project_agent/reports/morning_report/latest.md`

## 권장 입력원

- nightly sweep advisory 결과
- mission surface 검사 결과
- UI workspace 검사 결과
- dependency/runtime risk 분류 결과
- battle ledger 일일 요약

## 권장 battle ledger 경로

- `_workspaces/<project_code>/.project_agent/log/battle_log/<date>.md`
- `_workspaces/<project_code>/.project_agent/log/battle_log/latest.md`

## 최소 섹션

### 1. Executive Snapshot

- active / blocked / completed mission 수
- 새 red flag 수
- 오늘 가장 먼저 볼 1-3개 항목

### 2. Mission Review Needed

- 새 `blocked` / `failed` mission
- blocker 증가 mission
- current contract 기준 재검토가 필요한 sample

### 3. Code Health

- Soulforge nightly core code-health bundle
  - `ui:validate`
  - `ui:lint:all`
  - `ui:docs:check`
  - `ui:build`
  - `ui:done:check`
- conditional check
  - `ui:smoke:theme-pack`
- advisory note
  - 현재는 top-level `typecheck` / `test` contract 가 아직 잠기지 않았다는 메모
- dependency/runtime breakage 의심 신호

### 4. Boundary And Docs Health

- `_workspaces` 실자료 유입 여부
- owner boundary drift
- 깨진 문서 링크
- contract mismatch

### 5. Battle Ledger

- 그날의 주요 작업/전투 결과 요약
- 성공한 시도와 실패한 시도
- historical mismatch / runtime gap / canon gap 같은 분류 메모
- 다음에 다시 볼 만한 전투 흔적

### 6. Promotion Review Hints

- `mission_level` 힌트
- `promotion_review_needed` 힌트
- 아직 sample 로 둘지, current default 검토 대상으로 볼지에 대한 메모

### 7. Today Actions

- 오늘 사람이 직접 판단할 일
- 즉시 수정할 것
- 나중으로 미룰 것

## 최소 필드

- `report_date`
- `project_code`
- `generated_by`
  - 예: `nightly_sweep_v0`
- `missions`
  - mission id
  - current status
  - blocker kind
  - mission level hint
- `checks`
  - check name
  - result
  - short note
  - check bucket
    - `core_nightly`
    - `conditional`
    - `advisory`
- `top_actions`
  - owner 가 오늘 먼저 볼 일

## v0 권장 범위

- report 는 markdown 한 장으로 시작한다.
- machine-readable schema 는 아직 잠그지 않는다.
- 우선 사람이 아침에 3-5분 안에 읽을 수 있는 briefing 을 목표로 한다.
- Code Health 섹션은 Soulforge nightly core bundle 의 결과를 먼저 보여주고, conditional check 는 분리해서 보여준다.

## battle ledger 작성 원칙

- raw transcript 나 private dump 를 붙이지 않는다.
- 하루 동안 있었던 전투를 “무슨 일이 있었는지 / 왜 막혔는지 / 다음엔 뭘 볼지” 위주로 요약한다.
- project-specific truth 는 local-only 에 남기고, public canon 으로는 필요한 curated lesson 만 올린다.

## 연결 문서

- [`NIGHTLY_SWEEP_PLAN.md`](../.mission/NIGHTLY_SWEEP_PLAN.md)
- [`FUTURE_AGGREGATION_PLAN.md`](../.mission/FUTURE_AGGREGATION_PLAN.md)
- [`GOVERNANCE_PACKET_MISSION_PROMOTION_RULES.md`](../.mission/GOVERNANCE_PACKET_MISSION_PROMOTION_RULES.md)
- tracked example: [`docs/architecture/workspace/examples/demo_project/.project_agent/morning_project_report_example.md`](../docs/architecture/workspace/examples/demo_project/.project_agent/morning_project_report_example.md)
- chain example: [`docs/architecture/workspace/examples/demo_project/.project_agent/morning_project_report_chain_example.md`](../docs/architecture/workspace/examples/demo_project/.project_agent/morning_project_report_chain_example.md)

## ASSUMPTIONS

- 이 문서는 실제 report 생성 구현이 아니라 contract 초안이다.
- 아침 보고서는 `nightly sweep` 의 결과를 읽기 좋게 재구성한 owner-facing 문서로 본다.
