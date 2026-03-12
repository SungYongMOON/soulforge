# packages/theme-adventurers-desk

## 목적

- `theme-adventurers-desk` 는 Adventurer's Desk UI theme token 과 metadata 를 제공한다.
- theme token 정의와 renderer structural CSS 를 분리해 theme 교체를 쉽게 한다.

## 포함 대상

- swappable theme manifest (`adventurers_desk`, `adventurers_archive`)
- CSS variables
- material/icon hook mapping
- package-local asset

## 제외 대상

- renderer layout logic
- fixture loading
- canonical tree integration

## 상태

- Phase UI-1 token 과 background skin 만 포함한다.
- Phase UI-2 material refinement 는 후속 작업으로 둔다.
