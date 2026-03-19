# gateway

- `gateway/` 는 workspace-level ingress/staging 의 tracked example mirror 다.
- 실제 local runtime `_workspaces/gateway/` 를 Git 으로 올리지 않고, 따라보기 쉬운 public-safe sample 만 이 경로에 둔다.
- 다른 PC 나 다른 LLM 은 이 예시를 기준으로 `mail_intake_request -> intake_inbox -> monster_events` 흐름을 따라하면 된다.
- 다른 PC clone 과 local runtime materialization 순서는 [`MULTI_PC_DEVELOPMENT_V0.md`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md) 를 먼저 본다.

## 포함 대상

- `requests/`
  - sample `mail_intake_request` payload
- `.project_agent/intake_inbox/`
  - intake 결과 sample
- `.project_agent/log/monster_events/`
  - global event stream sample

## sample scenario

1. 첫 메일이 `PDR completion` monster 를 새로 만든다.
2. 두 번째 메일이 같은 `dedupe_key` 로 들어온다.
3. 두 번째 메일은 새 monster 를 만들지 않고 기존 monster 를 갱신한다.

## 따라하는 순서

1. [`requests/mail_intake_request_created_only.json`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/workspace/examples/gateway/requests/mail_intake_request_created_only.json) 를 본다.
2. 결과가 [`hiworks_dedupe_demo_001/inbox.json`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/workspace/examples/gateway/.project_agent/intake_inbox/hiworks_dedupe_demo_001/inbox.json) 과 [`hiworks_dedupe_demo_001/monsters.json`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/workspace/examples/gateway/.project_agent/intake_inbox/hiworks_dedupe_demo_001/monsters.json) 에 어떻게 materialize 되는지 본다.
3. [`requests/mail_intake_request_link_existing.json`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/workspace/examples/gateway/requests/mail_intake_request_link_existing.json) 를 본다.
4. 결과가 [`hiworks_dedupe_demo_002/inbox.json`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/workspace/examples/gateway/.project_agent/intake_inbox/hiworks_dedupe_demo_002/inbox.json) 에서는 `linked_existing_only`, [`hiworks_dedupe_demo_001/monsters.json`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/workspace/examples/gateway/.project_agent/intake_inbox/hiworks_dedupe_demo_001/monsters.json) 에서는 `mail_touch_count` 증가로 보이는지 확인한다.
5. 전역 append-only stream 은 [`2026-03.jsonl`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/workspace/examples/gateway/.project_agent/log/monster_events/2026/2026-03.jsonl) 에서 확인한다.

## 주의

- 이 경로는 설명용 sample 이다.
- 실제 운영 데이터는 `_workspaces/gateway/` 에만 존재해야 한다.
