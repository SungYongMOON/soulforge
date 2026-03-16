# .agent

## 정본 의미

- `.agent/` 는 species/hero catalog 의 정본 루트다.
- `.agent/` 는 더 이상 single active body, runtime, memory, sessions owner 가 아니다.
- active 운영 주체는 `.unit/` 가 소유하고, 실제 과제 실행 truth 는 `_workspaces/<project_code>/` 가 소유한다.

## 무엇을 둔다

- `index.yaml`
- `species/<species_id>/species.yaml`
- `species/<species_id>/heroes/<hero_id>/hero.yaml`
- species, hero, catalog 설명 문서
- sanitized template/example 수준의 catalog 메타

## 무엇을 두지 않는다

- active policy, protocols, runtime, memory, sessions, autonomic, artifacts owner 정의
- raw run, transcript, battle log, project code, workspace-local state
- 실제 운영 unit 상태, 비밀값, 민감 로그

## 왜 이렇게 둔다

- species 와 hero 는 durable catalog 이고 active execution state 와 섞이면 owner 경계가 흐려진다.
- class/package catalog 는 `.agent_class/`, active operating state 는 `.unit/`, mission site truth 는 `_workspaces/` 로 분리해야 새 canon 이 닫힌다.

## vNext skeleton

- [`index.yaml`](index.yaml): species catalog index template
- [`species/human/species.yaml`](species/human/species.yaml): placeholder species template
- [`species/human/heroes/index.yaml`](species/human/heroes/index.yaml): hero catalog index template
- [`species/human/heroes/example_hero/hero.yaml`](species/human/heroes/example_hero/hero.yaml): placeholder hero overlay template

## cleanup status

- tracked canonical bridge 파일과 디렉터리(`body.yaml`, `body_state.yaml`, active body/runtime subtree)는 저장소 정본 트리에서 제거했다.
- 현재 `.agent/` 에 남는 정본 surface 는 `index.yaml`, `species/**`, 그리고 owner-local 설명 문서뿐이다.
- 과거 body-era 설명은 일부 historical 문서와 로그에만 남아 있으며, 더 이상 `.agent/` owner 의미를 정의하지 않는다.

## 변경 원칙

- `.agent` catalog 구조가 바뀌면 같은 변경 안에서 이 README 와 `index.yaml`, 관련 foundation 문서를 함께 갱신한다.
- template/example YAML 에 실제 project code, run id, 민감 runtime 데이터는 넣지 않는다.
