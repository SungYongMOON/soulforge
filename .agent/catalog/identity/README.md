# .agent/catalog/identity

## 목적

- `catalog/identity/` 는 selectable identity candidate 의 canonical source 를 둔다.
- 현재 active identity 는 `../../identity/` 에 두고, 후보군과 선택 index 는 여기서 관리한다.
- species 와 hero candidate 정본은 이 경계에 남기고, active selection 은 복제하지 않는다.

## 포함 대상

- `species/` candidate catalog
- `heroes/` candidate catalog
- future generator 가 채울 placeholder or sample candidate
- motif / imprint 기반 hero candidate canonical source

## 제외 대상

- 현재 active species
- 현재 active hero selection 상태
- class canonical asset

## 규칙

- species candidate 는 durable default 후보 정본이다.
- hero candidate 는 motif / imprint 구조만 저장한다.
- index 는 `source_ref` 로 candidate 정본을 가리키고 active 상태는 `../../identity/**` 에서 읽는다.

## 관련 경로

- [`../../identity/README.md`](../../identity/README.md)
- [`species/README.md`](species/README.md)
- [`heroes/README.md`](heroes/README.md)
