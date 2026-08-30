# Integration dogfood — 프로그램 체인 교차 검증 (test-only)

Owner: `guild_hall/integration_dogfood`. Status: `CURRENT = cross-module 통합 테스트만`; 실행 코드·상태·authority 없음 — test-only 모듈이라 `module.manifest.json`도 의도적으로 두지 않는다. plan 13(Test, Dogfood, and Acceptance Plan)의 required test ladder에서 **module integration/default-off** 단에 해당하는 첫 합성 조각이다.

각 코어는 독립 adversarial suite를 통과했지만 **코어 사이의 계약 결합**은 여기서 처음 증명된다. 모든 사실은 합성(synthetic writer, 호출자 단언 custody/scan, 주입 clock)이며 외부는 접촉하지 않는다.

## 증명하는 것

- **체인 결합**: 합성 work item 1건이 `forge_intent`(candidate→intent→승인→synthetic writer task→assignment) → `vault_revision`(제출→custody→scan→revision→review→human acceptance→**bundle**) → `forge_intent`(vault bundle digest를 binding으로 draft→발행 brief) → `tool_workshop`(job→lease→pass→done_candidate receipt)로 흐르고, **같은 digest**(vault manifest_digest = brief binding = job input = receipt input)와 **같은 task_ref**가 끝까지 보존된다. 체인 어디에서도 task 완료·head 이동·수락이 자동으로 일어나지 않는다.
- **MCP facade 실서빙**: read facade의 provider를 실제 코어 record 위에 얹어 `task.get_official`/`work.get_brief`/`artifact.get_revision_metadata`가 egress 계약(선언 필드·금지 필드) 안에서 서빙됨을 증명. vault의 균일 거부가 provider 안에서 던져져도 클라이언트에는 facade의 균일 `not_available` 하나로 수렴(내부 log만 `provider_error`).
- **Redaction·external gate 결합**: accepted raw 원본은 external 등록이 구조적으로 불가하고, redaction 파생만 chain-complete lineage(직접 source+raw origin)로 등록된다.
- **어휘 동일성**: 균일 거부 코드가 vault·MCP 계약에서 문자 그대로 동일(`not_available`).

## 검증

```powershell
npm.cmd run validate:integration-dogfood
```

## 관련 정본

- `docs/architecture/foundation/team_member_engineering_program/13_TEST_DOGFOOD_ACCEPTANCE.md` (required test ladder: module integration/default-off)
- `docs/architecture/foundation/team_member_engineering_program/14_ROADMAP_GATES_AND_DAG.md`
- 각 코어 owner: `forge_intent/`, `vault_revision/`, `tool_workshop/`, `engineering_mcp/`
