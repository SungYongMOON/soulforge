# docs/architecture/ui

## 목적

- `ui/` 는 root-owned UI 파생 계약 문서를 모은다.
- canonical source 와 renderer consumer 사이의 source, sync, derived state 기준만 이곳에서 다룬다.

## 문서 역할 색인

| 문서 | 역할 |
| --- | --- |
| `UI_SOURCE_MAP.md` | UI 가 읽을 수 있는 root-owned source 와 읽지 말아야 할 local/private source 를 구분한다. |
| `UI_SYNC_CONTRACT.md` | UI consumer 가 canonical source 와 snapshot 을 어떻게 동기화하는지 정한다. |
| `UI_DERIVED_STATE_CONTRACT.md` | UI 에서 계산해도 되는 derived state 와 canonical owner 가 아닌 값을 구분한다. |
| `UI_CONTROL_CENTER_MODEL.md` | 기존 control center/file-editing shell 의 역할과 제한을 설명한다. |
| `SOULFORGE_GAME_UI_INFORMATION_ARCHITECTURE_V0.md` | Guild Hall, Dungeon Map, Mission Board, Monster Gate 중심의 game UI 정보구조다. |
| `SOULFORGE_2D_DUNGEON_UI_DIRECTION_V0.md` | 3D 가 아닌 2D/2.5D 판타지 작전판 visual direction 과 v0/v1 경계다. |

## 제외 대상

- renderer consumer 구현 문서
- theme / skin 문서
- `ui-workspace/` 내부 app/package 운영 문서

## 관련 경로

- [`../README.md`](../README.md)
- [`UI_SOURCE_MAP.md`](UI_SOURCE_MAP.md)
- [`UI_SYNC_CONTRACT.md`](UI_SYNC_CONTRACT.md)
- [`UI_DERIVED_STATE_CONTRACT.md`](UI_DERIVED_STATE_CONTRACT.md)
- [`UI_CONTROL_CENTER_MODEL.md`](UI_CONTROL_CENTER_MODEL.md)
- [`SOULFORGE_GAME_UI_INFORMATION_ARCHITECTURE_V0.md`](SOULFORGE_GAME_UI_INFORMATION_ARCHITECTURE_V0.md)
- [`SOULFORGE_2D_DUNGEON_UI_DIRECTION_V0.md`](SOULFORGE_2D_DUNGEON_UI_DIRECTION_V0.md)
- [`../../../ui-workspace/docs/README.md`](../../../ui-workspace/docs/README.md)

## 상태

- Stable
- root-owned source/sync/derive 계약만 유지하고 renderer consumer 문서는 `ui-workspace/docs/` 로 분리한다.
- file-based editing shell 과 저장 액션 모델은 `UI_CONTROL_CENTER_MODEL.md` 에서 관리한다.
- game UI 의 정보구조와 2D dungeon visual direction 은 새 IA/direction 문서에서 관리하며, file editor 는 main surface 가 아니라 `Codex` 보조 도구로 해석한다.
