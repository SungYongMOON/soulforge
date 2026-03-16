# profiles

- 무엇을 둔다: `example_class` 가 제공하는 reusable profile template 설명과 sanitized example metadata.
- 무엇을 두지 않는다: active profile state, runtime dump, project-local override.
- 왜 이렇게 둔다: profile 은 class/package catalog 의 선택지이고, 실제 선택 결과는 `.unit/` 과 workspace binding 에서 결정한다.
