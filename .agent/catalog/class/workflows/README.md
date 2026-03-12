# .agent/catalog/class/workflows

## 목적

- `workflows/` 는 selectable workflow index 를 둔다.
- canonical workflow 정본은 `.agent_class/workflows/**/module.yaml` 이 소유한다.

## 규칙

- workflow 는 `required` 조합식을 정의한다.
- active profile 은 workflow 부재 시 preferred 제안을 제공한다.
