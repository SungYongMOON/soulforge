# Mission Ops Notes

## 목적

- 이 문서는 `.mission/` owner 관점에서 나온 운영 메모를 러프하게 쌓는 곳이다.
- 완전히 정제되지 않은 메모도 남겨두고, 반복되면 매뉴얼이나 architecture 문서로 승격한다.

## 현재 운영 감각

- 사람이 지금 들고 있는 일감은 `.mission/` 에 보여야 한다.
- project-local run truth 는 `_workspaces/` 아래에 있어도 되지만, held plan 자체는 루트 `.mission/` 에 있어야 한다.
- 수동으로 하든 자동으로 하든 실제 건은 mission 으로 본다.
- autohunt 나 nightly sweep 은 mission 을 생성·검사·실행하는 상위 운영층이다.

## 현재 mission readiness 기준

기본적으로 아래를 본다.

1. `workflow_id` 가 있다.
2. `party_id` 가 있다.
3. 필요한 role/slot 이 풀린다.
4. 실제 `unit_assignments` 가 있다.
5. local runtime truth 가 필요한 경우 owner 를 올바르게 가리킨다.
6. ready / blocked / completed 같은 상태가 명시된다.

## `mission_check` 해석 메모

- `mission_check` 는 guild master / administrator lane 의 공식 readiness review skill 이다.
- 같은 검사 로직을 runner 가 preflight 로 재사용할 수는 있지만, readiness owner 를 runner 로 옮기지는 않는다.
- `mission_check` 는 tracked mission surface 를 본다.
- local runtime binding 값이나 raw run dump 를 tracked mission 파일 안으로 materialize 하지는 않는다.

## blocked 의미 메모

- blocked 는 항상 “실행 실패”를 뜻하지 않는다.
- 현재 sample 중 `author_hwpx_document_001` 는 실제 skill 생성과 smoke 는 성공했지만, 최신 mission artifact split 기준이 부족해서 blocked 다.
- 즉 blocked 는 “지금 표준 기준에 맞는 보정 필요”라는 뜻일 수 있다.

## mission 과 automation 관계 메모

- 먼저 manual mission 이 생긴다.
- 잘되면 같은 종류의 mission 을 자동 항목으로 반복 생성할 수 있다.
- automation 은 mission 을 대신하는 새 owner 가 아니라 mission 을 생성하고 돌리는 operating layer 다.

## 지금 유용한 sample

- `author_pptx_autofill_conversion_001`
  - completed sample
- `author_hwpx_document_001`
  - historical success but current mission standard 기준 blocked sample

## 다음에 누적할 메모

- 어떤 mission 이 autohunt 대상으로 승격 가능한지
- 어떤 blocked reason 은 즉시 수정 대상이고, 어떤 것은 historical mismatch 로 둘 수 있는지
- nightly sweep 이 readiness 를 갱신할 때 mission status 를 어디까지 바꿔야 하는지
