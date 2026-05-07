# docs/architecture/guild_hall

## 목적

- `guild_hall/` root 의 owner 경계와 cross-project 운영 계약을 모은다.
- `gateway`, `doctor`, `town_crier`, `night_watch`, `dungeon_assignment` 같은 공용 운영 기능을 `_workspaces/<project_code>/` worksite 와 분리해 설명한다.

## 문서 역할 색인

| 문서 | 역할 |
| --- | --- |
| `GUILD_HALL_MODEL_V0.md` | `guild_hall` 이 gateway, notify, assignment, operation state 를 어떻게 소유하는지 고정한다. |
| `SOULFORGE_ACTIVITY_LOG_V0.md` | cross-project recent-context 와 carry-forward event surface 를 설명한다. |
| `SOULFORGE_SNAPSHOT_V0.md` | UI/external host 가 읽을 sanitized read-only snapshot 계약이다. |
| `NIGHT_WATCH_AUTOMATION_V0.md` | 항상 켜 두는 node 에서만 ACTIVE 로 둘 점검 자동화와 경계를 설명한다. |
| `doctor/README.md` | bootstrap/readiness doctor 의 owner-local 설명이다. |
| `../../../guild_hall/shared/README.md` | guild_hall 내부 공용 io/path helper surface 설명이다. |
| `../../../guild_hall/snapshot/README.md` | snapshot producer 구현 surface 설명이다. |
| `../../../guild_hall/validate/README.md` | root/canon validator 구현 surface 설명이다. |
| `gateway/README.md` | gateway owner root 의 intake/update/notify 설명이다. |
| `gateway/mail_fetch/README.md` | mail fetch capsule 의 구현-side runbook entrypoint 다. |
| `gateway/mail_send/README.md` | outbound mail sender capsule 의 구현-side entrypoint 다. |
| `gateway/mail_fetch/runbooks/**` | mail fetch 운영 runbook 묶음이다. |
| `gateway/mail_fetch/policies/**` | mail fetch 정책과 안전 기준 묶음이다. |
| `gateway/mail_fetch/spec/**` | mail fetch 구현 spec 묶음이다. |
| `../workspace/GATEWAY_MAIL_FETCH_V0.md` | workspace 문서군에 둔 mail fetch public contract 다. |
| `../workspace/MAIL_SEND_V0.md` | workspace 문서군에 둔 outbound mail public contract 다. |
| `../workspace/GATEWAY_NOTIFY_V0.md` | workspace 문서군에 둔 notify command contract 다. |
| `../workspace/NOTIFY_MODEL_V0.md` | workspace 문서군에 둔 notification owner model 이다. |
| `../workspace/MULTI_PC_DEVELOPMENT_V0.md` | guild_hall 자동화가 어느 PC/node 에서 ACTIVE 인지 판단할 때 참조하는 multi-PC 계약이다. |

## 관련 경로

- [루트 architecture README](../README.md)
- [`../../../guild_hall/README.md`](../../../guild_hall/README.md)
- [`doctor/README.md`](doctor/README.md)
- [`../../../guild_hall/shared/README.md`](../../../guild_hall/shared/README.md)
- [`../../../guild_hall/snapshot/README.md`](../../../guild_hall/snapshot/README.md)
- [`../../../guild_hall/validate/README.md`](../../../guild_hall/validate/README.md)
- [`GUILD_HALL_MODEL_V0.md`](GUILD_HALL_MODEL_V0.md)
- [`SOULFORGE_ACTIVITY_LOG_V0.md`](SOULFORGE_ACTIVITY_LOG_V0.md)
- [`SOULFORGE_SNAPSHOT_V0.md`](SOULFORGE_SNAPSHOT_V0.md)
- [`NIGHT_WATCH_AUTOMATION_V0.md`](NIGHT_WATCH_AUTOMATION_V0.md)
- [`../workspace/GATEWAY_MAIL_FETCH_V0.md`](../workspace/GATEWAY_MAIL_FETCH_V0.md)
- [`../workspace/MAIL_SEND_V0.md`](../workspace/MAIL_SEND_V0.md)
- [`../workspace/GATEWAY_NOTIFY_V0.md`](../workspace/GATEWAY_NOTIFY_V0.md)
- [`../workspace/NOTIFY_MODEL_V0.md`](../workspace/NOTIFY_MODEL_V0.md)
