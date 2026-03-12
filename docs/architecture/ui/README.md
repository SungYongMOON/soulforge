# docs/architecture/ui

## 목적

- `ui/` 는 root-owned UI 파생 계약 문서를 모은다.
- canonical source 와 renderer consumer 사이의 source, sync, derived state 기준만 이곳에서 다룬다.

## 포함 대상

- `UI_SOURCE_MAP.md`
- `UI_SYNC_CONTRACT.md`
- `UI_DERIVED_STATE_CONTRACT.md`

## 제외 대상

- renderer consumer 구현 문서
- theme / skin 문서
- `ui-workspace/` 내부 app/package 운영 문서

## 관련 경로

- [`../README.md`](../README.md)
- [`UI_SOURCE_MAP.md`](UI_SOURCE_MAP.md)
- [`UI_SYNC_CONTRACT.md`](UI_SYNC_CONTRACT.md)
- [`UI_DERIVED_STATE_CONTRACT.md`](UI_DERIVED_STATE_CONTRACT.md)
- [`../../../ui-workspace/docs/README.md`](../../../ui-workspace/docs/README.md)

## 상태

- Stable
- root-owned source/sync/derive 계약만 유지하고 renderer consumer 문서는 `ui-workspace/docs/` 로 분리한다.
