# .registry/species

## 정본 의미

- `species/` 는 species canon 을 둔다.
- 각 species 는 `species/<species_id>/species.yaml` 한 파일 안에서 species metadata 와 `heroes:` inline set 을 함께 가진다.
- `species_id` 는 stable ASCII id 를 유지하고, 사람에게 보여주는 이름은 `title` 에 한국어로 둘 수 있다.
- species 는 class 를 소유하거나 제한하지 않는다.
- 실제 조합은 unit 의 `identity.species_id + class_ids` 에서 결정한다.

## 현재 phase에서 고정한 것

- 별도 `heroes/` 디렉터리는 새 canonical 구조에 두지 않는다.
- `hero_id` 는 species 안에서만 유일하다.
- `biases` 는 정책이 아니라 추천 가중치다.
- 새 species 를 추가해도 기존 class 와의 조합 가능성은 열어 둔다.

## 현재 sample

- [`human/species.yaml`](human/species.yaml): canonical species sample
- [`orc/species.yaml`](orc/species.yaml): canonical species sample
- [`elf/species.yaml`](elf/species.yaml): canonical species sample
- [`dwarf/species.yaml`](dwarf/species.yaml): canonical species sample
- [`darkelf/species.yaml`](darkelf/species.yaml): canonical species sample
- `wandering_knight`, `quiet_archivist`, `guild_master_operator`: inline hero sample trio
