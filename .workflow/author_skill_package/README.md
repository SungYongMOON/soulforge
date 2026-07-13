# .workflow/author_skill_package

- `author_skill_package/` 는 reusable Soulforge skill package authoring lane 의 canonical workflow bundle 이다.
- `workflow.yaml`, `step_graph.yaml`, `handoff_rules.yaml` 는 절차와 ownership boundary 를 고정한다.
- `quality_rubric.yaml` 는 predictability 품질 항목의 유일한 정의 owner 이며, 다른 파일은 item id 와 evidence 만 참조한다.
- `profile_policy.yaml` 는 현재 권장 실행 profile 과 shadow 후보를 둔다.
- `calibrations/` 는 public-safe workflow-level profile calibration archive 를 둔다.
- `templates/` 는 각 workflow output 에 대응하는 user-facing artifact template 을 둔다.
- tracked skill package draft 는 여전히 `.registry/skills/<skill_id>/` 아래에 작성하고, actual installed mirror sync 는 `.registry/docs/operations/SKILL_INSTALL_SYNC.md` 절차를 따른다.

## output template map

- `templates/skill_boundary_brief.template.md` -> `skill_boundary_brief.md`
- `templates/skill_package_draft.template.md` -> `skill_package_draft.md`
- `templates/skill_resource_bundle_review.template.md` -> `skill_resource_bundle_review.md`
- `templates/skill_boundary_review.template.md` -> `skill_boundary_review.md`
- `templates/skill_install_sync_request.template.md` -> `skill_install_sync_request.md`
- `templates/skill_smoke_check.template.md` -> `skill_smoke_check.md`
- `templates/skill_forward_evaluation.template.md` -> `skill_forward_evaluation.md`
- `templates/skill_release_review.template.md` -> `skill_release_review.md`

## forward evaluation routing

- smoke 뒤, release review 전에 `workflow_generator` 로 위임한다.
- create 요청은 `single_skill_build`, revise 요청은 `single_skill_modify` 를 사용한다.
- fresh executor B 와 separate verifier V 는 transient evaluation role 이며 기존 party ownership slot 을 늘리지 않는다.
