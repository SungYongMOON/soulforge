# .agent/autonomic/rules

## 목적

- `rules/` 는 저소음 품질 보정 규칙을 둔다.

## 포함 대상

- drift correction rule
- hygiene threshold
- low-noise correction 기준

## 제외 대상

- runtime bootstrap rule
- policy floor 본문
- workflow implementation

## 대표 파일

- [`../README.md`](../README.md): autonomic 상위 owner 경계

## 참조 관계

- correction rule 은 policy floor 아래에서만 동작한다.

## 변경 원칙

- correction rule 을 추가해도 user-facing daemon 체계로 변질시키지 않는다.
