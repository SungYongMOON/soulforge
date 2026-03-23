# examples/private_state_repo

- 이 경로는 Soulforge root 아래 nested `private-state/` repo 를 만들 때 복사해서 쓸 최소 템플릿 예시다.
- owner AI session 이 같은 workspace 안에서 public `Soulforge` 와 `private-state/` 를 함께 읽는 구성을 전제로 한다.
- 실제 비밀값은 이 템플릿에도 넣지 않는다.

## 포함 대상

- `guild_hall/state/gateway/intake_inbox/**`
- `guild_hall/state/gateway/log/monster_events/**`
- `guild_hall/state/gateway/mailbox/outbound/**`
- `guild_hall/state/gateway/log/mail_send/**`

## 제외 대상

- 모든 `.env`, token, cookie, session, key
- `guild_hall/state/gateway/mailbox/**/raw/**`
- `guild_hall/state/gateway/mailbox/**/events/**`
- `guild_hall/state/gateway/mailbox/**/attachments/**`
- `guild_hall/state/town_crier/**`

## 관련 경로

- [`../../PRIVATE_STATE_REPO_V0.md`](../../PRIVATE_STATE_REPO_V0.md)
- [`gitignore.example`](gitignore.example)
