# 현재 결정 사항

- Soulforge의 기본 축은 `.agent`, `.agent_class`, `_workspaces` 다.
- `.agent` 는 durable agent unit 이며 private operating system 이다.
- `.agent_class` 는 reusable loadout template 이다.
- `_workspaces` 는 mission site 다.
- `_teams` 는 미래 협업 계층으로 예약만 한다.
- species 는 body 의 durable default 다.
- hero 는 `.agent/identity` 의 optional identity overlay 다.
- profile 은 hero 대체재가 아니라 class 의 default preference mode 다.
- workflow 는 explicit `required` 조합식이다.
- profile 은 `preferred` 를 정의하며 installed asset 을 disable 하지 않는다.
- hero 와 profile 은 installed asset 을 disable 하지 않는다.
- UI selection catalog 는 `.agent/catalog/**` 에 둔다.
- identity candidate canonical source 는 `.agent/catalog/identity/**` 다.
- class canonical asset 정본은 `.agent_class/**` 다.
- `.agent/catalog/class/**` 는 `.agent_class/**` 를 가리키는 selection index 다.
- policy 는 species/hero/profile 보다 위에 있는 species-free floor 다.
- 우선순위는 `policy -> task -> workflow.required -> profile.preferred -> hero.bias -> species.default` 다.
