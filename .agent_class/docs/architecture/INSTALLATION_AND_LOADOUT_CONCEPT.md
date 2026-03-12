# 설치와 로드아웃 개념

## 설치

- installed library 는 `module.yaml` manifest 집합이다.
- installed asset 은 기본적으로 모두 사용 가능하다.
- profile 은 installed asset 을 disable 하지 않는다.

## 로드아웃

- `class.yaml` 은 정적 loadout template 다.
- `loadout.yaml` 은 현재 active profile 과 equipped module id 를 담는 상태표다.
- workflow 는 어떤 skill/tool/knowledge 조합이 required 인지를 정의한다.
- profile 은 workflow 부재 시 먼저 제안할 preferred workflow/skill/tool/knowledge 를 정의한다.

## owner 경계

- canonical class asset 정본은 `.agent_class/**` 다.
- selection index 는 `.agent/catalog/class/**` 다.
- body active binding 은 `.agent/registry/active_class_binding.yaml` 이 관리한다.
