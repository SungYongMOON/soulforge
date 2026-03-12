# .agent/catalog/identity

## 목적

- `catalog/identity/` 는 selectable identity candidate 의 canonical source 를 둔다.
- 현재 active identity 는 `../../identity/` 에 두고, 후보군과 선택 index 는 여기서 관리한다.

## 포함 대상

- `species/` candidate catalog
- `heroes/` candidate catalog
- future generator 가 채울 placeholder or sample candidate

## 제외 대상

- 현재 active species
- 현재 active hero selection 상태
- class canonical asset

## 관련 경로

- [`../../identity/README.md`](../../identity/README.md)
- [`species/README.md`](species/README.md)
- [`heroes/README.md`](heroes/README.md)
