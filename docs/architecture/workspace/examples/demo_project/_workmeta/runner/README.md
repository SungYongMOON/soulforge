# runner

- 이 경로는 autohunt output 이 runner dispatch 로 넘어가고, runner 가 current step execution packet 을 resolve 하는 public-safe example 만 둔다.
- 이 경로는 설명용 sample packet bundle 이며 local runtime 의 required owner folder 를 뜻하지 않는다.
- actual local runner implementation과 실행 script는 workspace/worksite 또는 public-safe code owner에 둔다.
- actual spawn payload, transcripts, queue state와 raw run truth는 workspace/worksite에 존재하고, local `_workmeta/<project_code>/runs/<run_id>/`에는 compact receipt만 존재한다.

