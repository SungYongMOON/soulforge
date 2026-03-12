# .agent_class/profiles

## 목적

- `profiles/` 는 class 가 제공하는 default preference mode 를 둔다.
- profile 은 hero 대체재가 아니고 installed asset allowlist 도 아니다.
- canonical profile 정본은 이 폴더가 소유하고, selection state 는 `.agent/registry/active_class_binding.yaml` 에서 읽는다.

## 포함 대상

- `*.profile.yaml`
- preferred workflow, skill, tool, knowledge 제안
- verify-first, report-style 같은 운용 기본값
- workflow 부재 시 기본적으로 적용되는 preferred mode 정의

## 대표 파일

- `default.profile.yaml`: canonical default preference mode

## 규칙

- profile 은 `preferred` semantics 다.
- profile 은 installed asset 을 disable 하지 않는다.
- workflow 의 `required` 가 존재하면 profile 선호보다 앞선다.

## 상태

- Stable
