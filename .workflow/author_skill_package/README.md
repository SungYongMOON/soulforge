# .workflow/author_skill_package

- `author_skill_package/` 는 reusable Soulforge skill package authoring lane 의 canonical workflow bundle 이다.
- `workflow.yaml`, `step_graph.yaml`, `handoff_rules.yaml` 는 절차와 ownership boundary 를 고정한다.
- `templates/` 는 각 workflow output 에 대응하는 user-facing artifact template 을 둔다.
- tracked skill package draft 는 여전히 `.registry/skills/<skill_id>/` 아래에 작성하고, actual installed mirror sync 는 `.registry/docs/operations/SKILL_INSTALL_SYNC.md` 절차를 따른다.

## output template map

- `templates/skill_boundary_brief.template.md` -> `skill_boundary_brief.md`
- `templates/skill_package_draft.template.md` -> `skill_package_draft.md`
- `templates/skill_boundary_review.template.md` -> `skill_boundary_review.md`
- `templates/skill_install_sync_request.template.md` -> `skill_install_sync_request.md`
- `templates/skill_release_review.template.md` -> `skill_release_review.md`
