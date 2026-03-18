# .registry

## 정본 의미

- `.registry/` 는 Soulforge의 outer canon/store 정본 루트다.
- species, classes, skills, tools, knowledge 는 이 경로 아래에서만 canonical 의미를 가진다.
- `.unit/`, `.workflow/`, `.party/`, `_workspaces/` 는 `.registry/` 를 참조할 수 있지만 그 내용을 소유하지 않는다.

## 관계도

```mermaid
flowchart TD
  R[".registry"] --> SP["species/<species_id>/species.yaml"]
  R --> CL["classes/<class_id>/class.yaml"]
  R --> SK["skills/<skill_id>/skill.yaml"]
  R --> TL["tools/<tool_id>/tool.yaml"]
  R --> KN["knowledge/<knowledge_id>/knowledge.yaml"]
  SP --> HR["heroes inline"]
  CL --> SR["skill_refs.yaml"]
  CL --> TR["tool_refs.yaml"]
  CL --> KR["knowledge_refs.yaml"]
  U[".unit/<unit_id>/unit.yaml"] --> CL
  U --> SP
  WF[".workflow/<workflow_id>/step_graph.yaml"] --> SK
```

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
- `skills/`, `tools/`, `knowledge/` 는 reusable canon surface 이며, class-local refs 가 가리키는 entry 를 둘 수 있다.
- `skills/shield_wall`, `skills/charge_breaker`, `tools/kite_shield`, `tools/field_lance`, `knowledge/frontline_doctrine`, `knowledge/escort_etiquette` 는 `knight` sample 을 해석하기 위한 minimal canon entry 다.
- skill canon 은 behavior 와 execution requirement 를 기록할 수 있지만, 실제 모델/MCP/tool 장착은 runtime binding 에서 최종 resolve 한다.

## 무엇을 두지 않는다

- active unit state
- workflow orchestration canon
- party template canon
- project-local runtime truth

## owner 문서 메모

- owner-local 설명 문서는 `.registry/docs/architecture/` 를 기준으로 맞춘다.
