# .project_agent

- 이 경로는 tracked example contract 와 binding 파일만 둔다.
- raw truth 는 local `_workspaces/<project_code>/.project_agent/runs/<run_id>/` 아래에만 존재한다.
- workflow step 의 runtime execution model 은 `workflow_execution_demo.md` 와 `bindings/` example set 에서만 설명한다.
- morning report 같은 owner-facing briefing example 은 standalone markdown sample 로만 둔다.
- `battle_log_chain_example.md` 와 `morning_project_report_chain_example.md` 는 같은 monster 가 project-side surface 에서 어떻게 다시 읽히는지 보여주는 chain sample 이다.
- `autohunt/` 는 mailbox routing 과 auto-hunt policy 의 tracked mirror example 이다.
- `runner/` 는 autohunt 가 고른 workflow/party 를 current step execution packet 으로 바꾸는 tracked mirror example 이다.
- 이 `runner/` 는 설명용 sample packet bundle 이며 local `.project_agent/` 의 required folder 가 아니다.
- actual local prototype 는 한 예시로 `.project_agent/tools/` 아래 script 로 존재할 수 있지만, 이 경로를 required implementation convention 으로 고정하지는 않는다.
