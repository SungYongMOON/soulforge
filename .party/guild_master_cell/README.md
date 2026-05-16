# guild_master_cell

- `guild_master_cell/` 는 skill package authoring, boundary review, post-development review gate, strategic review, promotion handoff 를 맡는 reusable party template 이다.
- 이 party 는 `author_skill_package` 를 기본 workflow 로 보고, 필요하면 `post_development_review_gate_v0` 를 종료 검증 workflow 로, `ouroboros_strategic_review_harness_v0` 를 비전 정렬과 owner-intent gap 점검 workflow 로 호출한다. `reviewer`, `drafter`, `checker` slot 은 canonical demo unit 에 연결한다.
- workflow step 순서는 `.workflow/` 가 소유하고, 이 폴더는 team composition 과 routing hint 만 소유한다.
