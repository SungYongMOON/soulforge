# town_crier

- `town_crier/` 는 `guild_hall/state/town_crier/**` 의 tracked example mirror 다.
- 실제 local runtime `guild_hall/state/town_crier/**` 를 Git 으로 올리지 않고, queue shape 와 owner-facing brief sample 만 이 경로에 둔다.
- 이 sample 은 같은 몬스터가 `gateway alert -> battle_log -> morning_report` 에서 어떻게 이어지는지 보여주는 첫 브리프 체인 예시다.

## 포함 대상

- `queue/pending/`
  - owner-facing Telegram brief sample

## 관련 예시

- gateway intake sample
  - [`../gateway/intake_inbox/pdr_brief_chain_demo_001/inbox.json`](../gateway/intake_inbox/pdr_brief_chain_demo_001/inbox.json)
- battle log sample
  - [`../../../../demo_project/.project_agent/battle_log_chain_example.md`](../../../../demo_project/.project_agent/battle_log_chain_example.md)
- morning report sample
  - [`../../../../demo_project/.project_agent/morning_project_report_chain_example.md`](../../../../demo_project/.project_agent/morning_project_report_chain_example.md)
