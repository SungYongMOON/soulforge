# docs/architecture/workspace/examples

## 목적

- `examples/` 는 tracked workspace contract 예시를 둔다.
- `_workspaces/` public/private 정책을 깨지 않기 위해 tracked sample 은 이 경로 아래에만 둔다.
- tracked example 은 binding set 과 execution rule example 을 public-safe mirror 로만 둔다.

## 규칙

- 여기의 sample 은 사람이 읽는 계약 예시다.
- raw truth, runs, analytics, reports, artifacts 는 여기에 materialize 하지 않는다.
- installed skill name, model id, MCP/tool hint 는 example binding 으로 둘 수 있지만 host-local path 는 넣지 않는다.
- `autohunt/` sample 은 policy, routing, mailbox rule 같은 public-safe 운영 예시만 둔다.
