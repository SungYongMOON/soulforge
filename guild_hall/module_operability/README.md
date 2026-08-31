# Module operability — manifest·의존·cycle·release 게이트 (check-only)

Owner: `guild_hall/module_operability`. Status: `CURRENT = 순수 검사기 + preflight CLI`; 실행 코드·상태·authority 없음. Owner 지시 MODULE-OPERABILITY-GATE leaf의 정본이다.

## 구성

- `src/manifest_schema.mjs` — `soulforge.module_manifest.v0`의 **완전성 스키마**: 정확한 26필드(누락·미지 필드 fail), 타입/널 규칙, validators·authority_notes 비어있음 금지, **lifecycle 규칙**(runtime-ish `default_state`는 health/readiness probe 선언 필수 — contract/synthetic/test/default-off 어휘는 면제), **release 규칙**(비-null `release_digest`는 계산된 소스 digest와 일치해야 함 — 어긋난 stamp는 stale release 주장으로 fail-closed). `computeModuleReleaseDigest`는 manifest 자신을 제외한 결정론 소스 digest.
- `src/dependency_check.mjs` — **선언 의존 validator**: manifest 집합 위에서 모든 `capabilities_required`가 정확히 한 모듈의 `capabilities_provided`로 해소되고(중복 공급자는 ambiguous fail), `required_dependencies`가 실재 module_id로 해소된다. `port:*` 접두 항목은 **caller-주입 port 선언**으로 공급자 해소 면제(권한 천장은 각 모듈 authority_notes 소유). Board→Watch 의존이 이 규약으로 **명시 데이터**가 됐다(`team_ops_board` manifest가 `watch.coarse_panel_contract.v0` 요구).
- `src/import_cycle_check.mjs` — **import-cycle validator**: 상대 import(정적·**bare side-effect import**·`export … from` 재수출·동적·require) 그래프에서 cycle 전부 보고. 이 leaf에서 실증된 첫 cycle — `pcb_compliance` evaluator⇄adapter — 는 `pcb_compliance_fact_admission.mjs` leaf 추출로 절단됐고(pin 체인 252/850→253/852 의도 갱신 포함), repo 스캔 cycle 0이 테스트로 고정된다.
- `tools/operability_preflight.mjs` — 집계 CLI: **등재된** manifest 집합(guild_hall에서 manifest를 가진 모듈 전부 + 등재 앱 `team-ops-board`; manifest 없는 legacy 모듈 수는 receipt에 가시화되고 등재는 의도적 후속 작업)에 대해 스키마·의존·**validator 실재성**(선언된 테스트 파일이 디스크에 실재 — fixture/integration 계약) 검사 + guild_hall·Board src 전체 cycle 스캔 → receipt·fail-closed exit. `--stamp <module-dir>`는 명시적 release digest 각인 행동(자동 아님). digest는 working tree 기준(untracked 포함)이므로 각인 전 모듈 디렉터리가 clean해야 안정적이다.
- `src/product_manifest_schema.mjs` · `src/product_composition_check.mjs` — PC1–PC3 **no-move product composition** 계약: 세 `product.manifest.json`의 엄격한 필드/경로/pin 스키마와 현재 등재 Module 집합의 Product-owned/Shared 분류를 검사한다. 모든 Module은 한 현재 Implementation owner와 정확한 Interface pin을 가지며, 새로 등재된 Module도 catalog에 명시되지 않으면 fail-closed한다. `authority_taxonomy_contract`는 Shared다.
- `tools/product_preflight.mjs` — product aggregate CLI: 세 제품의 고정 composition root, exact owned/shared/cross-product Interface closure, current callers, source-ref-only `dev-erp-mcp`, Pack/release `HOLD`, `not_released`, `reference_in_place_no_move`, zero source move/copy와 Agent Platform의 composition-only directory를 검사한다. `--json`은 products/modules/shared/unresolved counts를 포함한 machine-readable receipt를 낸다. 성공은 현 catalog 정합만 뜻하며 Pack, release, source migration 또는 runtime을 승인하지 않는다.

Hermes/agent-runtime **coarse aggregate 경계**는 Board 쪽 테스트가 고정한다: `ui-workspace/apps/team-ops-board/src/server/agent-runtime-watch-boundary.test.mjs` — session row는 id/key/status/시각/건수/model만, content-형 필드는 `RAW_OR_UNKNOWN_FIELD_FORBIDDEN`으로 전체 projection hold(strip 아님), envelope 어디에도 content 어휘 부재.

## 검증

```powershell
npm.cmd run validate:module-operability
npm.cmd run validate:product-composition
```

## 관련 정본

- `docs/architecture/foundation/team_member_engineering_program/14_ROADMAP_GATES_AND_DAG.md` (Executed-leaf ledger)
- 각 모듈 manifest: `guild_hall/*/module.manifest.json`, `ui-workspace/apps/team-ops-board/module.manifest.json`
