# docs/architecture/guild_hall

## 목적

- `guild_hall/` root 의 owner 경계와 cross-project 운영 계약을 모은다.
- `gateway`, `town_crier`, `night_watch`, `dungeon_assignment` 같은 공용 운영 기능을 `_workspaces/<project_code>/` worksite 와 분리해 설명한다.

## 포함 대상

- `GUILD_HALL_MODEL_V0.md`
- `gateway/README.md`
- `gateway/mail_fetch/README.md`
- `gateway/mail_fetch/runbooks/**`
- `gateway/mail_fetch/policies/**`
- `gateway/mail_fetch/spec/**`
- `../workspace/GATEWAY_MAIL_FETCH_V0.md`
- `../workspace/GATEWAY_NOTIFY_V0.md`
- `../workspace/NOTIFY_MODEL_V0.md`
- `../workspace/MULTI_PC_DEVELOPMENT_V0.md`

## 관련 경로

- [루트 architecture README](../README.md)
- [`../../guild_hall/README.md`](../../guild_hall/README.md)
- [`GUILD_HALL_MODEL_V0.md`](GUILD_HALL_MODEL_V0.md)
- [`../workspace/GATEWAY_MAIL_FETCH_V0.md`](../workspace/GATEWAY_MAIL_FETCH_V0.md)
- [`../workspace/GATEWAY_NOTIFY_V0.md`](../workspace/GATEWAY_NOTIFY_V0.md)
- [`../workspace/NOTIFY_MODEL_V0.md`](../workspace/NOTIFY_MODEL_V0.md)
