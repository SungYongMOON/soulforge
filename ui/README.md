# ui

## 목적

- `ui/` 는 Soulforge의 저장소 공용 UI surface 를 둔다.
- body/class/workspace 세 축 전체를 함께 보여주는 renderer 와 관련 자산을 루트 경계에서 관리한다.

## 포함 대상

- read-only renderer entrypoint
- viewer 전용 README 와 실행 안내
- 저장소 전체 파생 상태를 소비하는 UI surface

## 제외 대상

- body/class/workspace 정본 메타
- `derive-ui-state` 생성기와 검증 로직
- 편집 기능이나 정본 직접 쓰기 동작

## 관련 경로

- [README.md](../README.md)
- [ui/viewer/README.md](viewer/README.md)
- [docs/architecture/UI_SOURCE_MAP.md](../docs/architecture/UI_SOURCE_MAP.md)
- [docs/architecture/UI_SYNC_CONTRACT.md](../docs/architecture/UI_SYNC_CONTRACT.md)
- [.agent_class/tools/local_cli/ui_sync/README.md](../.agent_class/tools/local_cli/ui_sync/README.md)

## 상태

- Draft
- 현재 `ui/` 는 `derive-ui-state --json` 소비자 역할의 read-only viewer 만 둔다.
- generator 는 계속 `.agent_class/tools/local_cli/ui_sync/` 에 남기고, renderer 만 루트 UI surface 로 분리한다.
