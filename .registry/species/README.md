# .registry/species

## 정본 의미

- `species/` 는 species canon 을 둔다.
- 각 species 는 `species/<species_id>/species.yaml` 한 파일 안에서 species metadata 와 `heroes:` inline set 을 함께 가진다.

## 현재 phase에서 고정한 것

- 별도 `heroes/` 디렉터리는 새 canonical 구조에 두지 않는다.
- `hero_id` 는 species 안에서만 유일하다.
- `biases` 는 정책이 아니라 추천 가중치다.

## 현재 sample

- [`human/species.yaml`](human/species.yaml): canonical species sample
- `wandering_knight`: inline hero sample
