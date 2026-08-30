# Path Registry — physical organization spine (plan 17, R1–R3 contract surfaces)

Owner: `guild_hall/path_registry`. Status: `CURRENT = in-memory contract + tracked HOLD-sentinel seed + adversarial tests`; R0 수락과 OD-10 owner/projection 배정은 2026-08-31 정본에 기록됐다. 실제 binding bytes 등록, write-guard 집행, materializer apply(실 canary root), 4192 배선, 그 어떤 물리 이동도 private binding·ACL·readback·activation gate 뒤의 `TARGET/HOLD`다.

Team Member Engineering Program plan 17의 R1(Path Registry + resolver), R2(target materializer), R3(4192 Storage & Backup Map)의 계약 수직이다. 모든 binding·grant·evidence는 **호출자가 단언한 합성 사실**이고, 이 모듈은 어떤 payload byte도 소유·이동·삭제하지 않는다.

## 계약 요점

- **R1 registry/resolver** (`src/path_registry_core.mjs`): 10-값 physical root class enum, multi-axis record(logical owner ≠ physical containment ≠ product/portfolio ≠ 5-owner refs), no-fallback resolver — registry unavailable/schema incompatible/unregistered/ambiguous/scope mismatch/expired/held 전부 **typed HOLD**로 안정 반환하고 legacy/default/environment fallback이 표현 불가능하다. 공개 row의 모든 string leaf에서 host-local absolute path는 구조적으로 거부된다(`absolute_path_forbidden`).
- **Operation-aware write guard** (`authorizeOperation`): exact registry revision + binding epoch + writer identity 결속. `delete`/`move`는 R7 migration leaf 전까지 **전역 gate**(`destructive_operation_gated`). target row/target binding은 쓰기 불가(current/target fencing), sole-writer 교체는 revocation fence로 검증된다. Tracked seed의 4개 `hold:od-10.*` 값은 Owner 질문이 아니라 private activation binding 미주입 sentinel이다. exact accepted binding으로 교체되기 전 모든 mutating authorization은 계속 `authority_unresolved_od10`으로 fail-closed다.
- **Seed** (`data/registry_seed_v0.mjs`): roots 10 + canonical roots 7 + nested planes 2(`_workmeta`,`private-state`) + plan-10 sources 12 = 31 rows. 미관측 lane(linear·cloud_drive·git·nas)은 명시적 `held` row다. tracked public seed는 실제 private owner/binding bytes를 담지 않으므로 sentinel을 유지하고 `registryReadiness()`가 HOLD를 보고한다.
- **R2 materializer** (`src/target_materializer.mjs`): plan-17 data-root catalog view를 **빈 디렉터리로만** 생성. root admission은 `guild_hall/shared/knowledge_root_resolver.mjs`의 hostile-path 방어(reparse/UNC/ADS/alias/traversal/realpath drift)를 재사용한다. approved canary root ref 없음/hold sentinel → HOLD(외부 blocker). foreign payload 발견 → 거부, 계획 경로가 파일/reparse로 점유 → 거부, replay 멱등(created 0), payload_moved 항상 0, rollback은 자기 receipt의 created 중 **여전히 빈 디렉터리만** 제거(root commitment 대조 포함). source lane은 snapshot의 `row_kind: source`에서만 유도된다(registry-driven coverage).
- **R3 storage map** (`src/storage_map_projection.mjs`): **기존 노드 backup-readiness overlay**다 — 4192 federated topology(RED-02 pinned artifact)가 이미 Slack·mail·PLAUD/voice·collector·custody store의 노드 신원과 health truth를 소유하므로, 이 투영은 topology 노드·카드·경쟁 health 상태를 **절대 만들지 않는다**. row는 `topology_node_refs`/`registry_record_ref`/`owner_pointer`로 기존 stable ID에 해소되고 backup-generation·coverage·freshness·restore-test·path-drift·HOLD 상세만 얹는다(label/node kind/edge 필드 부재 → 중복 카드 제작 불가, `projection_kind: backup_readiness_overlay`). 중복 source 신원은 registry 구성 단계에서 거부되고(`duplicate_topology_identity`), seed의 topology ref는 pinned artifact 실노드 대조 테스트로 고정된다. Linear처럼 기존 stable topology 신원이 없는 source만 registry 계약을 통해서 나타난다(`topology_node_refs: []`). snapshot digest 결속·전행 커버리지·증거 없음은 green 불가·우선순위 `hold > unavailable > stale > degraded > unknown > healthy`·`not_applicable` 명시 제외·writer/raw/secret/absolute-path 거부·`unclassified_count > 0` → drift + aggregate HOLD는 그대로다.
- **Source-lane index** (`src/source_lane_index.mjs`): plan-17 `10_SOURCE_CAPTURE_CATALOG/<id>/` lane에 앉을 refs-only 레코드 4종(capture_generation·backup_generation_pointer·restore_test·legacy_path_map_note) 계약과 결정론적 evidence 어셈블러. `assembleSourceLaneEvidence`는 검증된 레코드의 함수로만 R3 9-key evidence를 만든다 — capture→backup→restore digest 사슬이 깨지면 증거 조작으로 보고 HOLD(`backup_digest_mismatch`/`restore_readback_mismatch`), 빠진 고리는 부재 필드로 남고(R3가 degraded/unknown 렌더), capture 없으면 `no_evidence`다. 타 source 레코드(`foreign_source_record`)·중복 generation(`duplicate_generation_seq`)은 거부, backup pointer는 바이트 복제 필드가 구조적으로 없고(60_BACKUP_GENERATIONS 소유), legacy_path_map_note는 metadata뿐이며 어떤 resolution/fallback도 제공하지 않는다. payload/raw/absolute-path 키는 전 레코드에서 거부.


## 외부 blocker (이 모듈이 대체하지 않는 것)

- R0 수락과 OD-10 owner 4종·4192 projection owner 결정은 2026-08-31 기록 완료다.
- 남은 blocker는 private binding bytes/sole writer, `pathref:recovery.physical_spine_canary`의 writer-exclusive ACL·empty-root/readback, write-guard enforcement binding, registry actual binding, private runtime의 `/storage-map.snapshot.json` 방출이다(4192 클라이언트 공급자·strip 배선은 `L-WATCH-SUP-3`로 공개 완료).
- 실제 binding 값·경로는 private plane 소관이며 이 public 모듈에는 영원히 들어오지 않는다.

## 검증

```powershell
npm.cmd run validate:path-registry
npm.cmd run validate:target-materializer
npm.cmd run validate:watch-storage-map
npm.cmd run validate:source-lane-index
```

## 관련 정본

- `docs/architecture/foundation/team_member_engineering_program/17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md`
- `docs/architecture/foundation/team_member_engineering_program/14_ROADMAP_GATES_AND_DAG.md`
- `guild_hall/watch_panel_contract/` (plan-08 enum 소유)
- `guild_hall/shared/knowledge_root_resolver.mjs` (경로 방어 원천)
