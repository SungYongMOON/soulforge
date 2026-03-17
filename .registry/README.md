# .registry

## 정본 의미

- `.registry/` 는 Soulforge의 outer canon/store 정본 루트다.
- species, classes, skills, tools, knowledge 는 이 경로 아래에서만 canonical 의미를 가진다.
- `.unit/`, `.workflow/`, `.party/`, `_workspaces/` 는 `.registry/` 를 참조할 수 있지만 그 내용을 소유하지 않는다.

## 무엇을 둔다

- `index.yaml`
- `species/`
- `classes/`
- `skills/`
- `tools/`
- `knowledge/`
- `docs/architecture/`

## 현재 phase에서 고정한 것

- species canon 은 `species/<species_id>/species.yaml` 단일 파일 모델을 사용한다.
- hero 는 species 내부의 `heroes:` inline entry 로만 표현한다.
- class canon entry 와 assign/ref 입구는 `classes/<class_id>/class.yaml` 이다.
- `species/human/species.yaml`, `classes/knight/**`, `.unit/vanguard_01/unit.yaml` 는 canonical sample 1세트로 유지한다.
- `skills/`, `tools/`, `knowledge/` 는 skeleton 만 만들고 standalone sample YAML 은 아직 만들지 않는다.

## 무엇을 두지 않는다

- active unit state
- workflow orchestration canon
- party template canon
- project-local runtime truth

## 전환 메모

- `.agent/` 와 `.agent_class/` 는 transition bridge 로만 남아 있다.
- 새 canonical entry 를 그 두 경로 아래에 추가하지 않는다.
- owner-local 설명 문서는 앞으로 `.registry/docs/architecture/` 를 기준으로 맞춘다.
