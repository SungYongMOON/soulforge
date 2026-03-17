# packages/ui-contract

## 목적

- `ui-contract` 는 renderer v1 이 소비하는 TypeScript 계약 타입과 기본 식별자 집합을 제공한다.
- framework-neutral 하게 유지하고, renderer-core/react/web 가 같은 계약을 공유하게 한다.

## 포함 대상

- UI state types
- fixture / tab / row identifier constants
- selection action contract

## 제외 대상

- normalization logic
- theme CSS
- host shell state loader
