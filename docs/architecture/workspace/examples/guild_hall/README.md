# examples/guild_hall

- `guild_hall/` example 은 cross-project 운영 state 의 public-safe mirror sample 이다.
- 현재 v0 에서는 `state/gateway/` sample 을 canonical example 로 본다.
- 다른 PC 나 다른 LLM 은 이 예시를 기준으로 `mail fetch -> intake_inbox -> town_crier notify` 흐름과 그 이후 `battle_log -> morning_report` 해석 예시를 따라갈 수 있다.
- outbound mail 기록 sample 은 `state/gateway/outbound/` 와 `state/gateway/log/mail_send/` 아래에서 같이 본다.
- private state repo 템플릿은 `../private_state_repo/README.md` 에서 따로 본다.

## 관련 경로

- [`state/gateway/README.md`](../../../../../docs/architecture/workspace/examples/guild_hall/state/gateway/README.md)
- [`state/town_crier/README.md`](../../../../../docs/architecture/workspace/examples/guild_hall/state/town_crier/README.md)
- [`state/gateway/outbound/README.md`](../../../../../docs/architecture/workspace/examples/guild_hall/state/gateway/outbound/README.md)
- [`../private_state_repo/README.md`](../../../../../docs/architecture/workspace/examples/private_state_repo/README.md)
- [`../README.md`](../../../../../docs/architecture/workspace/examples/README.md)
- [`../../guild_hall/README.md`](../../../../../docs/architecture/guild_hall/README.md)
