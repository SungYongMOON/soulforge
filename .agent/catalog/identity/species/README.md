# .agent/catalog/identity/species

## 목적

- `species/` 는 selectable species candidate 의 canonical source 를 둔다.
- active species 는 `../../../identity/species_profile.yaml` 로 materialize 하고, 후보 정본은 여기서 유지한다.
- species 는 durable default 후보군이다.

## 포함 대상

- `index.yaml`
- `*.species.yaml`

## 제외 대상

- active selection state
- hero candidate

## 규칙

- `index.yaml` 은 `source_ref` 로 species candidate 정본을 가리킨다.
- species candidate 는 policy floor 를 재정의하지 않는다.
