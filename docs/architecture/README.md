# docs/architecture

## 목적

- `docs/architecture/` 는 저장소 전체 구조 원칙과 메타 규약을 둔다.
- 루트 README가 다루지 않는 구조 기준 문서를 이곳에서 관리한다.

## 포함 대상

- 목표 트리, 문서 소유 원칙, 저장소 목적
- body finalization report 와 세계관 대응 문서
- 워크스페이스와 `.project_agent` 같은 저장소 공용 구조 규약
- 저장소 전체 결정 기록과 마이그레이션 참고 문서
- UI source map 과 UI sync contract 같은 저장소 공용 파생 규약
- `derive-ui-state` 와 derived state schema 같은 저장소 공용 UI 파생 계약
- renderer bridge 와 legacy prototype 의 source-side 경계 설명
- v1 closeout checklist 와 known limitations 같은 저장소 공용 마감/운영 문서

## 제외 대상

- `.agent` 전용 구조 문서
- `.agent_class` 전용 구조 문서
- 특정 프로젝트 전용 문서

## 관련 경로

- [루트 README](../../README.md)
- [`docs/README.md`](../README.md)
- [`.agent/docs/architecture/AGENT_BODY_MODEL.md`](../../.agent/docs/architecture/AGENT_BODY_MODEL.md)
- [`.agent_class/docs/architecture/README.md`](../../.agent_class/docs/architecture/README.md)
- [`.agent_class/docs/architecture/MODULE_REFERENCE_CONTRACT.md`](../../.agent_class/docs/architecture/MODULE_REFERENCE_CONTRACT.md)
- [`docs/ui/README.md`](../ui/README.md)

## 상태

- Stable
- 저장소 공용 아키텍처 문서의 정본 위치다.
- 현재 공용 문서는 `REPOSITORY_PURPOSE.md`, `TARGET_TREE.md`, `DOCUMENT_OWNERSHIP.md`, `AGENT_WORLD_MODEL.md`, `agent_body_finalization_report.md`, `UI_SOURCE_MAP.md`, `UI_SYNC_CONTRACT.md` 등을 포함한다.
- 현재 공용 문서는 `UI_DERIVED_STATE_CONTRACT.md` 를 포함해 renderer 이전 단계의 파생 상태 계약도 함께 관리한다.
- renderer consumer model, selection model, theme plan 은 `docs/ui/` 로 분리 관리한다.
- 현재 공용 문서는 `PROJECT_AGENT_RESOLVE_CONTRACT.md` 를 포함해 workspace 공통 resolve 계약도 함께 관리한다.
- 현재 공용 문서는 `CURRENT_DECISIONS.md` 를 통해 hero/profile/catalog 최신 구조 결정도 함께 고정한다.
- 현재 공용 문서는 `V1_CLOSEOUT_CHECKLIST.md`, `KNOWN_LIMITATIONS.md` 를 포함해 v1 closeout 문서군도 함께 관리한다.
- class installed/loadout 세부 계약은 class owner 문서 `MODULE_REFERENCE_CONTRACT.md` 를 참조한다.
