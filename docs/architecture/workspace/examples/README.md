# docs/architecture/workspace/examples

## 목적

- `examples/` 는 tracked workspace contract 예시를 둔다.
- `_workspaces/` public/private 정책을 깨지 않기 위해 tracked sample 은 이 경로 아래에만 둔다.
- tracked example 은 binding set 과 execution rule example 을 public-safe mirror 로만 둔다.

## 규칙

- 여기의 sample 은 사람이 읽는 계약 예시다.
- raw truth, runs, analytics, reports, artifacts 는 여기에 materialize 하지 않는다.
- owner-facing report example 이 필요하면 standalone markdown sample 로만 둔다. 실제 `reports/` 디렉터리를 tracked example 아래에 materialize 하지는 않는다.
- installed skill name, model id, MCP/tool hint 는 example binding 으로 둘 수 있지만 host-local path 는 넣지 않는다.
- `autohunt/` sample 은 policy, routing, mailbox rule 같은 public-safe 운영 예시만 둔다.
- `runner/` sample 은 dispatch request 와 resolved run packet 같은 public-safe execution packet 예시만 둔다.
- canonical gateway sample 은 `guild_hall/state/gateway/` 아래에 두고, mailbox event, mail intake, dedupe, existing monster link 처럼 다른 PC 나 다른 LLM 이 그대로 따라볼 수 있는 public-safe mirror example 을 둔다.
- gateway sample 은 notify policy 예시도 함께 둬서 다른 PC 가 local `guild_hall/state/gateway/bindings/notify_policy.yaml` 를 재현할 수 있게 한다.
- 다른 PC 세팅 순서는 [`../MULTI_PC_DEVELOPMENT_V0.md`](../../../../docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md) 를 먼저 본다.
