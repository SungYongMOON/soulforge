# .workflow/authoring

- `authoring/` 는 반복 작업을 workflow canon 으로 승격하기 전의 authoring aid 를 둔다.
- 작업자는 먼저 raw task memo 를 남기고, 그 메모를 바탕으로 workflow draft 를 만든다.
- 안정화된 draft 만 `.workflow/<workflow_id>/` canon entry 로 승격한다.
- 이 경로는 workflow authoring 전용 대기실이다.
- `authoring/` 자체는 workflow canon 이 아니며, `.workflow/index.yaml` workflow 목록에도 올라가지 않는다.
- 반복 요청이 reusable skill package 로 승격될 만큼 크다고 판단되면 [`SKILL_WORKFLOW_GUIDE.md`](SKILL_WORKFLOW_GUIDE.md) 를 보고 `author_skill_package` workflow 로 넘긴다.
- 향후 skill authoring aid 가 필요해져도, 그것은 `.workflow/authoring/` 에 섞지 않고 별도 skill lane 또는 `guild master` unit owner surface 에 두는 것을 기본안으로 본다.
