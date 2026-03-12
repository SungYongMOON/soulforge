# .agent/catalog/class/profiles

## 목적

- `profiles/` 는 class profile selection index 를 둔다.
- canonical profile 정본은 `.agent_class/profiles/` 가 소유한다.

## 규칙

- profile 은 default preference mode 다.
- profile 은 installed asset allowlist 가 아니다.
- catalog item 은 `source_ref` 로만 canonical profile 을 가리킨다.
- active 상태는 `../../../registry/active_class_binding.yaml` 에서 유도한다.
