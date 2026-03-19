# .project_agent

- 이 경로는 `gateway` ingress/staging 의 public-safe mirror sample 만 둔다.
- 실제 local runtime owner 는 `_workspaces/gateway/.project_agent/` 다.
- 다른 LLM 이 구조를 따라할 때는 이 경로의 file shape 와 event shape 를 참고하고, 실제 쓰기는 local `_workspaces/` 쪽에 해야 한다.
