# Engineering MCP — shared v0 contract + read-only facade (no server)

Owner: `guild_hall/engineering_mcp`. Status: `CURRENT = contract data + validators + in-memory read facade(기본 OFF) + tests`; 실제 provider 배선·서버 등록·mutate 제공은 전부 `TARGET`으로 각자의 gate 뒤에 있다.

이 모듈은 Team Member Engineering Program 계획(05)의 공유 Engineering MCP v0 계약을 **데이터로** 고정한다. 서버를 등록하지 않고, 소켓을 열지 않고, 상태를 저장하지 않으며, 어떤 authority도 만들지 않는다.

## 구성

- `src/contract.mjs` — 10개 namespace(`identity/task/work/bundle/artifact/submission/review/context/agent/ops`)와 최소 tool 33개의 typed 계약: kind(read/mutate), 필드 이름, authority ceiling. mutate는 전부 `idempotency_key` 필수 + opaque `*_ref` receipt 반환.
- `src/compatibility.mjs` — 현행 `dev-erp-mcp` 공유면 tool 17종(개인 ERP 8+flag 1, project-history 2, ingress 6)의 crosswalk: `map` / `keep_legacy_facade` / `keep_source_query` + guard. 회사메일 stdio 3종은 별도 mailbox-scoped 표면으로 명시 제외(`EXCLUDED_SURFACES`). `CONTRACT_GAPS`는 map되지 않은 계약 위치 전부(테스트가 계산 일치를 강제하므로 썩지 않는다).
- `src/validators.mjs` — 순수 구조 검증: 금지 필드 명명-배제 lint(bytes/base64/transcript/raw_prompt/secret류 — 의미론 증명이 아니라 알려진 철자 차단이며 창의적 개명은 review gate 몫), mutate idempotency+receipt, 균일 거부 envelope(`not_available` + string `request_id`만), 완료·수락·승격형 verb 금지 lint(`finalize`/`closeout`는 ceiling이 비완료임을 명시하므로 의도적으로 허용).
- `src/facade.mjs` — **read-only dispatch facade** (순수 in-memory, 서버·소켓 없음). `enabled: true`가 정확히 boolean으로 오지 않으면 모든 호출이 `facade_disabled`로 fail-closed(기본 OFF; truthy 오설정도 열리지 않음). 클라이언트가 볼 수 있는 결과는 정확히 4가지 — ok / `facade_disabled` / `request_shape_invalid` / 균일 `not_available` — 이며 unknown tool·mutate tool·provider 부재·provider 예외·scope 밖 project·egress 위반은 전부 균일 거부 하나로 수렴한다(정밀 원인은 내부 append-only log의 `outcome`에만: `denied_mutate_tool`/`provider_error`/`egress_forbidden_field` 등, 인자·payload·오류 메시지는 기록하지 않음). egress는 provider 원본이 아니라 JSON round-trip **복사본**을 검사·동결해 반환하고, 선언되지 않은 응답 필드·금지 필드명(중첩 포함, 대소문자 무시)·비-JSON 결과는 거부한다. `project_ref`를 선언한 tool은 caller의 `project_scopes` 안에 있어야 provider에 도달한다.
- `tests/engineering_mcp_contract.test.mjs` — adversarial synthetic suite 9종(오염 후보 거부 포함).
- `tests/engineering_mcp_facade.test.mjs` — facade suite 10종: 기본 OFF 증명(provider 무접촉), 복사본 egress, 균일 거부 동일성(내부 label과 동명의 tool 요청 포함), provider 예외 은닉, egress 3종 거부, scope 선차단, request shape 선검증(비유한 숫자 거부 포함), provider가 받는 frozen args·actorContext 고정, log label 정규화(임의 tool 문자열은 비활성 경로 포함 길이 제한·제어문자 치환 후에만 기록), log 불변·단조.

## 검증

```powershell
npm.cmd run validate:engineering-mcp
```

## Authority ceilings (요약)

- MCP는 queue·truth·승인권자·binary store·agent runtime이 아니다. 바이트는 별도 인증 HTTPS data plane으로만 이동한다.
- `work.closeout`/`work.propose_completion`은 Official Done·human acceptance가 아니다. Official Task SoR은 현행 Linear다.
- `bundle.*`는 exact revision pin만 안다. `latest`는 표현 불가능하다.
- 거부·부재·타 프로젝트는 균일 `not_available`로만 답한다.
- read facade는 **주입된 provider를 계약 규율로 감싸는 경계**일 뿐 데이터 소유자가 아니다: mutate tool은 이 facade에서 표현 불가능하고, 실제 저장소·서버에 배선된 provider 제공은 D27/D28/D29 활성화와 OD-08 물리 tuple을 요구하는 별도 leaf다. scope 선차단은 `project_ref`를 선언한 tool에만 적용되며 나머지 caller-scoping은 provider 의무로 남는다(facade는 actorContext를 provider에 전달하고, 테스트가 이를 고정).

## 관련 정본

- `docs/architecture/foundation/team_member_engineering_program/05_ENGINEERING_MCP_CLIENT_DATA_PLANE.md`
- `docs/architecture/foundation/team_member_engineering_program/14_ROADMAP_GATES_AND_DAG.md`
- `ui-workspace/apps/dev-erp-mcp/README.md`
