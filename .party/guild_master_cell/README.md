# guild_master_cell

- `guild_master_cell/` 는 skill package authoring, boundary review, promotion handoff 를 맡는 reusable party template 이다.
- 이 party 는 `author_skill_package` 를 기본 workflow 로 보고, `reviewer`, `drafter`, `checker` slot 을 현재 canonical demo unit `guild_master` 에 연결한다.
- workflow step 순서는 `.workflow/` 가 소유하고, 이 폴더는 team composition 과 routing hint 만 소유한다.
