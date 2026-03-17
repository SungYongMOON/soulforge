# runner

- 이 경로는 autohunt output 이 runner dispatch 로 넘어가고, runner 가 current step execution packet 을 resolve 하는 public-safe example 만 둔다.
- actual spawn payload, transcripts, queue state, raw run truth 는 local `_workspaces/<project_code>/.project_agent/runs/<run_id>/` 아래에만 존재한다.
