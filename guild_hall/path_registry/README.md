# Path Registry — physical organization spine (plan 17, R1–R3 contract surfaces)

Owner: `guild_hall/path_registry`. Status: `CURRENT = in-memory contract + tracked HOLD-sentinel seed + adversarial tests`; fresh Level 2 review accepted the G0 Plan 17 document reconciliation. R0 수락과 OD-10 owner/projection 배정은 2026-08-31 정본에 기록됐다. 실제 binding bytes 등록, write-guard 집행, materializer apply(실 canary root), 4192 배선, 그 어떤 물리 이동도 private binding·ACL·readback·activation gate 뒤의 `TARGET/HOLD`다.

Team Member Engineering Program plan 17의 R1(Path Registry + resolver), R2(target materializer), R3(4192 Storage & Backup Map)의 계약 수직이다. 모든 binding·grant·evidence는 **호출자가 단언한 합성 사실**이고, 이 모듈은 어떤 payload byte도 소유·이동·삭제하지 않는다.

## G0 data-manifest reconciliation — accepted

The sole physical target manifest for `<TARGET_SOULFORGE_ROOT>/data` is Plan 17's
numbered data spine. `World Tree`, `Rune`, `Guild`, Apps, and analytics resolve
only through Path Registry product, logical-owner, and asset-class facets; they
never authorize product-named data directories. The target materializer test
derives the complete documented static tree plus Registry-driven source lanes
from Plan 17 and requires exact planned-directory parity.

The current seed bindings are reference-in-place, not proof that the target
sibling crosswalk is current: `canon.workspaces` has parent `root.data_root`,
while `plane.workmeta` and `plane.private_state` have parent
`root.source_checkout`. A root class is not an address. `install` versus
inactive `packages`, and `control` versus `private-state`, each require a
unique target `logical_path_id`, `binding_ref`, `parent_binding_ref`, and
binding epoch; no fallback or ambiguous resolution is allowed. The exact target
row/binding migration is a named pre-R2 blocker, and current Registry
consistency is not claimed.

That parity is contract evidence only. It neither approves an actual root nor
changes writer authority: apply still requires the exact
`pathref:recovery.physical_spine_canary` private binding, writer-exclusive ACL,
empty-root/readback evidence, and the existing OD-10/enforcement gates. Legacy
runtime/data/control/tool/recovery roots remain reference-in-place; secret-owner
material is forbidden from this materialization class.

## 계약 요점

- **R1 registry/resolver** (`src/path_registry_core.mjs`): 10-값 physical root class enum, multi-axis record(logical owner ≠ physical containment ≠ product/portfolio ≠ 5-owner refs), no-fallback resolver — registry unavailable/schema incompatible/unregistered/ambiguous/scope mismatch/expired/held 전부 **typed HOLD**로 안정 반환하고 legacy/default/environment fallback이 표현 불가능하다. 공개 row의 모든 string leaf에서 host-local absolute path는 구조적으로 거부된다(`absolute_path_forbidden`).
- **Operation-aware write guard** (`authorizeOperation`): exact registry revision + binding epoch + writer identity 결속. `delete`/`move`는 R7 migration leaf 전까지 **전역 gate**(`destructive_operation_gated`). target row/target binding은 쓰기 불가(current/target fencing), sole-writer 교체는 revocation fence로 검증된다. Tracked seed의 4개 `hold:od-10.*` 값은 Owner 질문이 아니라 private activation binding 미주입 sentinel이다. exact accepted binding으로 교체되기 전 모든 mutating authorization은 계속 `authority_unresolved_od10`으로 fail-closed다.
- **Seed** (`data/registry_seed_v0.mjs`): roots 10 + target Suite siblings 9 + canonical roots 7 + Bot execution work root 1 + nested planes 2(`_workmeta`,`private-state`) + plan-10 sources 12 + whole-estate asset classes 9 = 50 rows. Nine target siblings(`dev`, `install`, `data`, `_workspaces`, `_workmeta`, `control`, `private-state`, `packages`, `local-recovery`) share one public-safe `binding.target-suite-root` parent and carry no physical binding. `canon.workspaces` is the ERP/Vault project canonical-materialization surface under `data_root`; `workroot.bot_execution` is the separate mutable Agent work surface under `project_work_root`. Neither row exposes its private physical binding. 미관측 lane(linear·cloud_drive·git·nas)과 아직 binding/evidence가 없는 knowledge·project assets·artifacts·templates·BOM/material·datasets·test results·Engine rules/profiles·AI workforce는 명시적 `held` row다. Asset row는 기존 owner를 가리키는 catalog identity일 뿐 byte 복사·수락·승격이 아니다. tracked public seed는 실제 private owner/binding bytes를 담지 않으므로 sentinel을 유지하고 `registryReadiness()`가 HOLD를 보고한다.
- **R2 materializer** (`src/target_materializer.mjs`): plan-17 data-root catalog view를 **빈 디렉터리로만** 생성. `STATIC_TREE` covers the documented Catalog, Knowledge/RAG, Event Store, and Analytics static paths; source/backup lanes remain Registry-driven. The focused test parses the Plan 17 target tree and uniform source-lane contract, then requires exact planned-directory parity for the tracked seed. root admission은 `guild_hall/shared/knowledge_root_resolver.mjs`의 hostile-path 방어(reparse/UNC/ADS/alias/traversal/realpath drift)를 재사용한다. approved canary root ref 없음/hold sentinel → HOLD(외부 blocker). foreign payload 발견 → 거부, 계획 경로가 파일/reparse로 점유 → 거부, replay 멱등(created 0), payload_moved 항상 0, rollback은 자기 receipt의 created 중 **여전히 빈 디렉터리만** 제거(root commitment 대조 포함). source lane은 snapshot의 `row_kind: source`에서만 유도된다(registry-driven coverage).
- **Workspace greenfield admission v1** (`src/workspace_greenfield_admission_gate.mjs`): separate `trusted_packet_digest` pin 없이는 시작하지 않는 pure/default-OFF gate다. `pre_publish_readiness`는 accepted/baseline **input** provenance와 external noncanonical **candidate**의 staging·exact readback·independent review·candidate-bound authority acceptance까지만 통과시키고 `pre_publish_ready / not_published`를 반환한다. candidate relation은 `exact_copy`(input revision+digest와 둘 다 같음) 또는 `derived_revision`(candidate revision은 반드시 다름, digest는 같거나 달라도 됨)으로 명시한다. publication/pointer가 들어오면 pre phase는 HOLD다. `post_publish_closure`만 atomic target bytes+lineage publication과 active-pointer readback을 요구하고 `post_publish_closed`를 반환한다. post publisher는 두 Genesis target의 sole-writer, target bindings, shared generation, correction/supersession policy에 모두 exact match해야 한다. target `_workspaces`와 `_workmeta` Genesis는 각각 empty-readback/binding/ACL/sole-writer/generation/no-legacy-import/restore/rollback evidence와 `authoritative` backup class를 요구한다. Legacy Freeze의 non-applicable은 `external_nonlegacy` origin/custody/admission refs와 no-current-binding일 때만 가능하다. review는 producer/build/reviewer/independence receipt를 candidate revision/digest에 결속하고 self-review를 HOLD한다. replay는 같은 phase operation, request digest, receipt digest, `NO_OP`를 모두 요구한다. NW workspace-only gates는 `not_applicable`으로 투영하고 target intent는 HOLD한다. path/raw/secret/payload field, filesystem/service/writer effect는 구조적으로 없다.
- **Private target-binding control store v0** (`src/private_target_binding_control_store.mjs`, internal `src/private_target_binding_control_store_core.mjs`): N2용 private adapter다. 기본 OFF이고 configured root·환경 fallback·startup effect가 없다. exact target map은 `path_registry_core.TARGET_SIBLING_BINDING_MAP`의 frozen projection이다. production wrapper/core는 두 operation과 digest/constants만 노출하고 arbitrary clock·factory·hook·test adapter를 전혀 export하지 않으며, test suite도 real host clock과 production wrapper만 사용한다. enabled mutation 전에는 target Suite/9-child identity를 read-only 포착한 뒤, separately pinned closed writer-exclusive ACL admission이 **shared target map에서 유도한 canonical logical ref `target.control`**·identity commitment·ACL readback ref/digest·`sole_writer_ref == writer_ref`·wrong-writer-denied ref·authority ref·host-clock validity window를 모두 만족해야 한다. 문법상 유효해도 `pathref:*`, binding ref 또는 다른 logical ref는 수락하지 않으며, 미존재·불일치·만료 admission은 store directory 생성 전 HOLD다. generation과 active pointer는 Suite root/9 physical identities의 private commitment를 함께 보존하며 NO_OP·reuse·parent extension·revoke마다 현재 Suite와 다시 대조한다; 다른 Suite로 store를 복사하면 HOLD다. 아홉 physical path는 한 Suite root의 canonical direct child이고 같은 parent와 shared numeric epoch를 가지며 새 epoch는 모든 보존 generation의 max보다 커야 한다. target 및 control-store/lane identity는 actual lstat/realpath/dev/ino로 고정하고 해당 create/readback/rename/unlink 직전에 재확인한다. `target.control` 아래 private control state만 의도적으로 쓰며 다른 여덟 target byte, payload move, ACL mutation, service, Task effect는 0이다. immutable generation/receipt/event는 fsynced unique temp + atomic no-overwrite hard-link로 publish한다. active pointer와 revocation receipt는 full `revocation_head_ref` chain으로 결속되고, full revoke 뒤에는 fresh identities/max+ epoch와 separately pinned reactivation validity window가 있어야 한다. **기존 store가 한 줄이라도 있으면 register/revoke 모두 lock 전에 active 또는 prior generation의 lock-break/reactivation authority를 읽고, 새 packet이 authority와 request를 함께 바꿔도 거부하며, lock 안에서 동일 pointer/generation authority를 다시 대조한다.** lock freshness와 break/reactivation validity는 한 번 포착한 host `Date.now`를 신뢰하며 caller exact-ms 단언을 쓰지 않는다. stale lock은 atomic breaking marker→archived-byte receipt→successor→unique archive 순서이며 실패 시 successor를 지우지 않고 가능한 경우 원 lock을 복구한다. public receipt는 absolute path 없이 refs/digests/counts만 재귀 검사해 반환한다.
- **R3 storage map** (`src/storage_map_projection.mjs`): **기존 노드 backup-readiness overlay**다 — 4192 federated topology(RED-02 pinned artifact)가 이미 Slack·mail·PLAUD/voice·collector·custody store의 노드 신원과 health truth를 소유하므로, 이 투영은 topology 노드·카드·경쟁 health 상태를 **절대 만들지 않는다**. row는 `topology_node_refs`/`registry_record_ref`/`owner_pointer`로 기존 stable ID에 해소되고 backup-generation·coverage·freshness·restore-test·path-drift·HOLD 상세만 얹는다(label/node kind/edge 필드 부재 → 중복 카드 제작 불가, `projection_kind: backup_readiness_overlay`). 중복 source 신원은 registry 구성 단계에서 거부되고(`duplicate_topology_identity`), seed의 topology ref는 pinned artifact 실노드 대조 테스트로 고정된다. Linear처럼 기존 stable topology 신원이 없는 source만 registry 계약을 통해서 나타난다(`topology_node_refs: []`). snapshot digest 결속·전행 커버리지·증거 없음은 green 불가·우선순위 `hold > unavailable > stale > degraded > unknown > healthy`·`not_applicable` 명시 제외·writer/raw/secret/absolute-path 거부·`unclassified_count > 0` → drift + aggregate HOLD는 그대로다.
- **Source-lane index** (`src/source_lane_index.mjs`): plan-17 `10_SOURCE_CAPTURE_CATALOG/<id>/` lane에 앉을 refs-only 레코드 4종(capture_generation·backup_generation_pointer·restore_test·legacy_path_map_note) 계약과 결정론적 evidence 어셈블러. `assembleSourceLaneEvidence`는 검증된 레코드의 함수로만 R3 9-key evidence를 만든다 — capture→backup→restore digest 사슬이 깨지면 증거 조작으로 보고 HOLD(`backup_digest_mismatch`/`restore_readback_mismatch`), 빠진 고리는 부재 필드로 남고(R3가 degraded/unknown 렌더), capture 없으면 `no_evidence`다. 타 source 레코드(`foreign_source_record`)·중복 generation(`duplicate_generation_seq`)은 거부, backup pointer는 바이트 복제 필드가 구조적으로 없고(60_BACKUP_GENERATIONS 소유), legacy_path_map_note는 metadata뿐이며 어떤 resolution/fallback도 제공하지 않는다. payload/raw/absolute-path 키는 전 레코드에서 거부.
- **Source-lane ledger** (`src/source_lane_ledger.mjs`): 네 record kind를 `WeakMap` 뒤 append-only in-memory ledger에 저장한다. natural identity exact replay는 `NO_OP`, divergence/ref reuse/generation regression/time reversal/digest-chain break는 fixed HOLD다. projection은 source별 records와 `unknown|degraded|evidence_complete`만 반환하며 `evidence_complete`도 health/acceptance authority가 아니다. persistence·delete/update·provider·clock·filesystem은 없다.
- **Asset-class revision ledger** (`src/asset_class_revision_ledger.mjs`): seed의 9개 whole-estate asset class를 project/organization scope별 refs-only revision으로 색인한다. five-owner, source/custody, monotonic supersession과 별도 acceptance/backup/restore evidence를 append-only로 보존하며, evidence presence를 authority나 실행으로 승격하지 않는다. R3용 class overlay는 9행을 항상 투영해 no_evidence와 partial/complete evidence를 구분한다.
- **Mail capture adapter** (`src/mail_source_lane_adapter.mjs`): 기존 continuous-ingress mail receipt와 같은 시각·digest로 결속된 `store_mail_events` validity receipt를 검증해 `source.mail`의 `capture_generation` 한 건만 만든다. provider·filesystem·credential 표면은 없고 body/path/secret/foreign scope/stale·future·위조 receipt는 거부한다. 이 어댑터는 backup pointer, restore test, human acceptance, retention/RPO를 만들 수 없으므로 실제 R3 결합 시험에서도 capture-only 상태는 `degraded`이며 `healthy`가 아니다.
- **Slack capture adapter** (`src/slack_source_lane_adapter.mjs`): canonical coverage·cursor와 exact raw-ref custody 집합을 workspace/channel/project/binding/digest/time으로 결속해 `source.slack` capture 한 건만 만든다. empty-event window도 item_count 0의 정직한 capture이며, missing custody·scope/digest/order drift는 거부한다. backup/restore/acceptance는 생성 불가다.
- **Voice/PLAUD capture adapter** (`src/voice_source_lane_adapter.mjs`): `plaud_import_ready` delivery receipt와 exact one-to-one copy-only custody receipts를 source owner/project/session/recording/digest/count/time으로 결속한다. exact legacy root authority가 receipt에 없는 `legacy_verified`는 거부하고 fresh `live_copy`/digest-bound `immutable_version`만 수락한다. 출력은 capture뿐이며 R3는 degraded다.
- **PC-activity capture adapter** (`src/pc_activity_source_lane_adapter.mjs`): existing file-activity native project-history coverage receipt가 source owner·project·event count·window·ordered digest를 자체적으로 결속할 때만 `source.pc_activity` capture를 만든다. caller-only query inventory는 project scope가 없어 채택하지 않았고 Cloud/Git/NAS는 exact native capture tuple 부재로 계속 HOLD다.

## NAS 방향 구분

- `source.nas`는 NAS에 원래 존재하는 자료를 가리키는 **NAS source asset**이다.
  이 row의 capture/custody/backup은 exact native receipt 전까지 HOLD다.
- Backup Controller의 NAS lane은 Soulforge/ERP/HPP/project 자료를 받는 **NAS
  backup target**이다. destination readiness와 source capture readiness는 서로
  다른 증거다.
- `60_BACKUP_GENERATIONS/nas`는 NAS source asset을 보호한 generation의 index다.
  Soulforge→NAS destination 여부는 backup receipt의 destination ref가 소유한다.
- 4192는 두 역할을 별도 row로 투영해야 하며 한쪽 PASS를 다른 쪽 상태로 전이하지
  않는다. 실제 private evidence가 없으므로 현재 이 모듈은 둘 다 operational
  green으로 만들지 않는다.


## 외부 blocker (이 모듈이 대체하지 않는 것)

- R0 수락과 OD-10 owner 4종·4192 projection owner 결정은 2026-08-31 기록 완료다.
- 남은 blocker는 private binding bytes/sole writer, `pathref:recovery.physical_spine_canary`의 writer-exclusive ACL·empty-root/readback, write-guard enforcement binding, registry actual binding, private runtime의 `/storage-map.snapshot.json` 방출이다(4192 클라이언트 공급자·strip 배선은 `L-WATCH-SUP-3`로 공개 완료).
- 실제 binding 값·경로는 private plane 소관이며 이 public 모듈에는 영원히 들어오지 않는다.

## 검증

```powershell
npm.cmd run validate:path-registry
npm.cmd run validate:target-materializer
npm.cmd run validate:workspace-greenfield-admission
npm.cmd run validate:private-target-binding-control-store
npm.cmd run validate:watch-storage-map
npm.cmd run validate:source-lane-index
npm.cmd run validate:mail-source-lane-adapter
npm.cmd run validate:slack-source-lane-adapter
npm.cmd run validate:voice-source-lane-adapter
npm.cmd run validate:source-lane-ledger
npm.cmd run validate:asset-class-ledger
npm.cmd run validate:pc-activity-source-lane-adapter
```

## 관련 정본

- `docs/architecture/foundation/team_member_engineering_program/17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md`
- `docs/architecture/foundation/team_member_engineering_program/14_ROADMAP_GATES_AND_DAG.md`
- `guild_hall/watch_panel_contract/` (plan-08 enum 소유)
- `guild_hall/shared/knowledge_root_resolver.mjs` (경로 방어 원천)
