# .workflow/authoring

- `authoring/` 는 반복 작업을 workflow canon 으로 승격하기 전의 authoring aid 를 둔다.
- 작업자는 먼저 raw task memo 를 남기고, 그 메모를 바탕으로 workflow draft 를 만든다.
- 안정화된 draft 만 `.workflow/<workflow_id>/` canon entry 로 승격한다.
- workflow creator 는 canon entry 생성 시 `profile_policy.yaml` draft 와 `calibrations/` placeholder 를 함께 만든다.
- profile optimizer 는 등록된 workflow 의 `calibrations/<calibration_id>/` 에 public-safe subagent quality matrix 와 passed-candidate CLI telemetry probe 결과를 저장하고, `profile_policy.yaml` 을 active 추천값으로 갱신한다.
- 이 경로는 workflow authoring 전용 대기실이다.
- `authoring/` 자체는 workflow canon 이 아니며, `.workflow/index.yaml` workflow 목록에도 올라가지 않는다.
- 반복 요청이 reusable skill package 로 승격될 만큼 크다고 판단되면 [`SKILL_WORKFLOW_GUIDE.md`](SKILL_WORKFLOW_GUIDE.md) 를 보고 `author_skill_package` workflow 로 넘긴다.
- one-off reconstruction 을 반복 가능한 workflow/skill 후보로 추출하거나, golden workflow 를 낮은 토큰/낮은 모델 tier 로 줄이는 실험은 [`WORKFLOW_EVOLUTION_PLAN_V0.md`](WORKFLOW_EVOLUTION_PLAN_V0.md) 를 따른다.
- 새 workflow scaffold 에 필요한 profile policy 초안은 [`profile_policy.template.yaml`](profile_policy.template.yaml), calibration placeholder 안내는 [`calibrations.README.template.md`](calibrations.README.template.md) 를 사용한다.
- 향후 skill authoring aid 가 필요해져도, 그것은 `.workflow/authoring/` 에 섞지 않고 별도 skill lane 또는 `guild master` unit owner surface 에 두는 것을 기본안으로 본다.
