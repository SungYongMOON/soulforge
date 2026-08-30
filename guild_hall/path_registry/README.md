# Path Registry — physical organization spine (plan 17, R1–R3 contract surfaces)

Owner: `guild_hall/path_registry`. Status: `CURRENT = in-memory contract + tracked HOLD-sentinel seed + adversarial tests`; 실제 binding 등록, write-guard 집행, materializer apply(실 canary root), 4192 배선, 그 어떤 물리 이동도 `TARGET/HOLD`이며 OD-10 Owner 결정과 해당 leaf gate 뒤에 있다.

Team Member Engineering Program plan 17의 R1(Path Registry + resolver), R2(target materializer), R3(4192 Storage & Backup Map)의 계약 수직이다. 모든 binding·grant·evidence는 **호출자가 단언한 합성 사실**이고, 이 모듈은 어떤 payload byte도 소유·이동·삭제하지 않는다.

## 계약 요점

- **R1 registry/resolver** (`src/path_registry_core.mjs`): 10-값 physical root class enum, multi-axis record(logical owner ≠ physical containment ≠ product/portfolio ≠ 5-owner refs), no-fallback resolver — registry unavailable/schema incompatible/unregistered/ambiguous/scope mismatch/expired/held 전부 **typed HOLD**로 안정 반환하고 legacy/default/environment fallback이 표현 불가능하다. 공개 row의 모든 string leaf에서 host-local absolute path는 구조적으로 거부된다(`absolute_path_forbidden`).
- **Operation-aware write guard** (`authorizeOperation`): exact registry revision + binding epoch + writer identity 결속. `delete`/`move`는 R7 migration leaf 전까지 **전역 gate**(`destructive_operation_gated`). target row/target binding은 쓰기 불가(current/target fencing), sole-writer 교체는 revocation fence로 검증된다. **OD-10 fails-closed**: 4개 registry authority 중 하나라도 `hold:od-10.*` sentinel이면 모든 mutating authorization이 `authority_unresolved_od10`.
- **Seed** (`data/registry_seed_v0.mjs`): roots 10 + canonical roots 7 + nested planes 2(`_workmeta`,`private-state`) + plan-10 sources 12 = 31 rows. 미관측 lane(linear·cloud_drive·git·nas)은 명시적 `held` row다. authority 4종·owner refs는 hold sentinel → `registryReadiness()`가 HOLD를 보고하고 readiness 주장 자체가 불가능하다.
- **R2 materializer** (`src/target_materializer.mjs`): plan-17 data-root catalog view를 **빈 디렉터리로만** 생성. root admission은 `guild_hall/shared/knowledge_root_resolver.mjs`의 hostile-path 방어(reparse/UNC/ADS/alias/traversal/realpath drift)를 재사용한다. approved canary root ref 없음/hold sentinel → HOLD(외부 blocker). foreign payload 발견 → 거부, 계획 경로가 파일/reparse로 점유 → 거부, replay 멱등(created 0), payload_moved 항상 0, rollback은 자기 receipt의 created 중 **여전히 빈 디렉터리만** 제거(root commitment 대조 포함). source lane은 snapshot의 `row_kind: source`에서만 유도된다(registry-driven coverage).
- **R3 storage map** (`src/storage_map_projection.mjs`): registry snapshot digest에 결속된 read-only 투영. snapshot의 모든 row가 정확히 1개 map row를 만든다. 증거 없음 → `unknown`, held row → `hold`, **green 없음**. 상태는 plan-08 Watch enum으로만 사상되고 우선순위는 `hold > unavailable > stale > degraded > unknown > healthy`. `not_applicable` 제외는 명시적 registry record로만. evidence는 allowlist 필드만 받고 writer/raw/secret/absolute-path 필드는 row와 evidence 양쪽에서 거부된다. `unclassified_count > 0` → drift + aggregate HOLD.

## 외부 blocker (이 모듈이 대체하지 않는 것)

- OD-10 owner 4종(registry schema owner, private binding writer, resolver runtime owner, write-policy owner)과 materializer canary root, 4192 projection owner — Owner 결정 전까지 seed sentinel 유지.
- R0 물리 아키텍처 rebaseline의 Owner 수락 기록.
- 실제 binding 값·경로는 private plane 소관이며 이 public 모듈에는 영원히 들어오지 않는다.

## 검증

```powershell
npm.cmd run validate:path-registry
npm.cmd run validate:target-materializer
npm.cmd run validate:watch-storage-map
```

## 관련 정본

- `docs/architecture/foundation/team_member_engineering_program/17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md`
- `docs/architecture/foundation/team_member_engineering_program/14_ROADMAP_GATES_AND_DAG.md`
- `guild_hall/watch_panel_contract/` (plan-08 enum 소유)
- `guild_hall/shared/knowledge_root_resolver.mjs` (경로 방어 원천)
