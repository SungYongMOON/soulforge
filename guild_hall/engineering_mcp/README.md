# Engineering MCP — shared v0 contract (contract only)

Owner: `guild_hall/engineering_mcp`. Status: `CURRENT = contract data + validators + tests`; every runtime behavior remains `TARGET` behind its own gates.

이 모듈은 Team Member Engineering Program 계획(05)의 공유 Engineering MCP v0 계약을 **데이터로** 고정한다. 서버를 등록하지 않고, 소켓을 열지 않고, 상태를 저장하지 않으며, 어떤 authority도 만들지 않는다.

## 구성

- `src/contract.mjs` — 10개 namespace(`identity/task/work/bundle/artifact/submission/review/context/agent/ops`)와 최소 tool 33개의 typed 계약: kind(read/mutate), 필드 이름, authority ceiling. mutate는 전부 `idempotency_key` 필수 + opaque `*_ref` receipt 반환.
- `src/compatibility.mjs` — 현행 `dev-erp-mcp` 공유면 tool 17종(개인 ERP 8+flag 1, project-history 2, ingress 6)의 crosswalk: `map` / `keep_legacy_facade` / `keep_source_query` + guard. 회사메일 stdio 3종은 별도 mailbox-scoped 표면으로 명시 제외(`EXCLUDED_SURFACES`). `CONTRACT_GAPS`는 map되지 않은 계약 위치 전부(테스트가 계산 일치를 강제하므로 썩지 않는다).
- `src/validators.mjs` — 순수 구조 검증: 금지 필드 명명-배제 lint(bytes/base64/transcript/raw_prompt/secret류 — 의미론 증명이 아니라 알려진 철자 차단이며 창의적 개명은 review gate 몫), mutate idempotency+receipt, 균일 거부 envelope(`not_available` + string `request_id`만), 완료·수락·승격형 verb 금지 lint(`finalize`/`closeout`는 ceiling이 비완료임을 명시하므로 의도적으로 허용).
- `tests/engineering_mcp_contract.test.mjs` — adversarial synthetic suite 9종(오염 후보 거부 포함).

## 검증

```powershell
npm.cmd run validate:engineering-mcp
```

## Authority ceilings (요약)

- MCP는 queue·truth·승인권자·binary store·agent runtime이 아니다. 바이트는 별도 인증 HTTPS data plane으로만 이동한다.
- `work.closeout`/`work.propose_completion`은 Official Done·human acceptance가 아니다. Official Task SoR은 현행 Linear다.
- `bundle.*`는 exact revision pin만 안다. `latest`는 표현 불가능하다.
- 거부·부재·타 프로젝트는 균일 `not_available`로만 답한다.
- 이 계약의 어떤 tool도 이 모듈이 제공하지 않는다. facade/adapter 제공은 D27/D28/D29 활성화와 OD-08 물리 tuple을 요구하는 별도 leaf다.

## 관련 정본

- `docs/architecture/foundation/team_member_engineering_program/05_ENGINEERING_MCP_CLIENT_DATA_PLANE.md`
- `docs/architecture/foundation/team_member_engineering_program/14_ROADMAP_GATES_AND_DAG.md`
- `ui-workspace/apps/dev-erp-mcp/README.md`
