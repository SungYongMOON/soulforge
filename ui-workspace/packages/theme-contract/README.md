# packages/theme-contract

## 목적

- `theme-contract` 는 renderer theme package 가 따라야 할 최소 타입 계약을 제공한다.
- theme package 는 CSS token, material/icon hook, asset hint metadata 를 이 계약 위에서 노출한다.

## 포함 대상

- `ThemeManifest`
- theme data attribute key
- material/icon hook slot
- theme manifest resolve/apply helper

## 제외 대상

- renderer layout CSS
- canonical source scan
- 특정 theme package registry
