# Soulforge Suite 구조·형상관리 working baseline v0

## 상태

- 상태: `OWNER_AUTHORIZED_STAGED_MIGRATION / TARGET_TOP_LEVEL_MATERIALIZED / G0_DOCUMENT_RECONCILIATION_ACCEPTED / R2_PHYSICAL_APPLY_HOLD`
- 기준일: 2026-09-01
- 목적: Core·App·Project Pack·Adapter·Shared, 개발·설치·데이터·정본·복구와 전체 형상관리 규칙을 한 문서에서 고정한다.
- Owner 실행지시(2026-09-01): 비어 있는 `<TARGET_SOULFORGE_ROOT>`에 목표 구조를 새로 만들고, `<LEGACY_SOULFORGE_ROOT>`의 전체 estate를 backup·copy·digest·restore·service-canary·rollback Gate로 단계 전환한다. 전환 중 Buzz·Hermes·4192·BuzzServer를 정지할 수 있으나 PC 재부팅은 금지한다. 기존 `<LEGACY_SOULFORGE_ROOT>`의 retire/delete는 새 경로 검증과 별도 수락 전까지 수행하지 않는다.
- 현재 물리상태: `<TARGET_SOULFORGE_ROOT>`와 합의된 9개 top-level child는 빈 디렉터리로 생성됐고 foreign top-level entry, payload copy, service/Junction/writer change는 0이다. 빈 top-level directory는 target binding, ACL, sole writer, Canonical Empty-State Genesis, 또는 target store materialization이 아니다. G0 문서 재조정은 fresh Level 2 review에서 수락됐으며 `<TARGET_SOULFORGE_ROOT>/data`의 유일한 물리 manifest를 Plan 17 numbered data spine으로 정하고, 이전 `data/{worldtree,rune,guild,apps,analytics}` 표현을 Path Registry의 논리 product/owner facet으로만 남긴다. R2 actual apply는 계속 private binding·writer-exclusive ACL·empty-root readback 전까지 `HOLD`다.
- 비효과: 이 문서만으로 Junction·active pointer·service·writer·DB·Task·credential·제품 Release를 자동 전환하지 않는다.
- 정확한 host-local current/target 경로: private physical-root inventory가 소유한다.

## 1. 한 줄 구조

> Soulforge는 하나의 Software Suite다. `World Tree`는 업무·자산·지식 정본,
> `Rune`은 공학 판단, `Guild`는 사람·AI 실행조직을 소유한다. App은 이 Core들을
> 사람이 사용하게 하고, Project Pack은 한 프로젝트의 정본·Rune·Guild·Adapter binding을
> 한 project identity로 결속하며, Adapter는 외부 시스템을 연결한다.

## 2. 안정 ID와 working name

| 안정 ID | working product name | logical slug (not a physical data directory) | 기능 설명 |
| --- | --- | --- | --- |
| `product.erp` | World Tree | `worldtree` | Task·Project·Asset·BOM·Context·Knowledge·정본 |
| `product.engine` | Rune | `rune` | 공통 Core·Domain Rune·Profile 조립·평가·Rune Factory |
| `product.agent` | Guild | `guild` | Agent Family·Mark·조직·Deployment·Run·MCP·Tool 실행 |

working name과 logical slug는 stable ID를 대체하지 않는다. 표시명이나 경로가 바뀌어도
configuration item ID와 version lineage는 유지한다. `World Tree`, `Rune`, `Guild`, App,
analytics는 Path Registry의 `product_refs`·logical-owner·asset-class facet으로 해소하며
`<TARGET_SOULFORGE_ROOT>/data/worldtree`, `rune`, `guild`, `apps`, `analytics` 같은 product-named
physical data directory를 인가하지 않는다.

## 3. Core·App·Project Pack·Shared·Adapter

| 분류 | 판정 질문 | 소유하는 것 | 예 |
| --- | --- | --- | --- |
| Core | 회사 핵심 정본·규칙·실행체계를 소유하는가 | 작은 Interface 뒤의 핵심 구현과 상태계약 | World Tree, Rune, Guild |
| App | 사용자가 직접 실행하는 완성 프로그램인가 | 화면·사용 흐름·App 설정·cache | Intelligence, Rune Lab, Watch, Client |
| Project Pack | Soulforge에 한 프로젝트를 탑재·비활성화·복구하기 위한 결속 묶음인가 | project identity, folder contract, Rune Set/Profile, Guild organization, Adapter/ACL/backup/manual refs | KVDS, MSH, SAS, AUV |
| Shared Module | 두 개 이상의 실제 caller가 같은 기능을 사용하는가 | 공통 Interface와 한 구현 | Identity, Path Registry, Backup, CM |
| Adapter | 외부 시스템을 내부 Interface에 연결하는가 | source/action 변환과 source-specific retry/error | Linear, Slack, PLAUD, Buzz, NAS |

Shared는 남는 코드를 두는 곳이 아니다. 실제 caller가 하나뿐이면 owning Core·App·Add-on에
둔다. 한 Adapter뿐인 seam은 가설이며, 두 Adapter가 실제로 같은 Interface를 만족할 때
공통 seam을 동결한다.

## 4. 논리 Suite

```text
Soulforge Suite
├─ Core
│  ├─ World Tree
│  ├─ Rune
│  └─ Guild
├─ Apps
│  ├─ World Tree
│  ├─ Intelligence
│  ├─ Rune Lab
│  ├─ Guild
│  ├─ Watch
│  └─ Client
├─ Project Packs
│  └─ KVDS / MSH / SAS / AUV / future projects
├─ Adapters
│  └─ Linear / Slack / Mail / PLAUD / Drive / Buzz / Hermes / Git / NAS
└─ Shared Modules
   └─ Discovery / Identity / Bastion / Path / Custody / Backup / CM / Deployment
```

App 이름은 Project 이름이 아니다. 한 App이 여러 Project를 처리한다. Project identity는
`_workspaces/<project_code>`와 World Tree Project catalog가 소유한다.

## 5. 개발·설치·데이터 물리 계층

G0 reconciliation accepted state의 9개 Suite top-level path는 Plan 17 physical-root
class와 다음처럼 대응한다. 이 표는 actual binding, writer, ACL, pointer, service를
수락하거나 자동 생성하지 않는다.

| `<TARGET_SOULFORGE_ROOT>` top-level path | Plan 17 physical-root class | G0 accepted boundary |
| --- | --- | --- |
| `dev` | `source_checkout` | source/canon surface; exact local binding remains private. |
| `install` | `runtime_root` | versioned runtime family; activation remains separately gated. |
| `data` | `data_root` | only the Plan 17 numbered physical data manifest. |
| `_workspaces` | logical `data_root` sibling | future ERP/Vault accepted canonical project-byte materialization address; current legacy worksite is reference-in-place. |
| `_workmeta` | logical `data_root` sibling | future canonical byte-lineage-only plane; current legacy operation history is reference-in-place. |
| `control` | `control_root` | protected operation, policy, and receipt plane. |
| `private-state` | `control_root` | nested private state plane; not an independent data owner. |
| `packages` | `runtime_root` family | inactive/create-only until a separate package gate. |
| `local-recovery` | `recovery_root` | recovery-test surface only. |

`project_work_root`, human work, Bot work, `external_runtime_root`,
`external_owner_store`, `secret_owner_root`, and `tool_root` remain explicit
Path Registry bindings. They are not additional auto-created `<TARGET_SOULFORGE_ROOT>`
top-level folders.

This is a target physical classification, not a claim that legacy bytes already
migrated. Existing legacy runtime, data, control, tool, and recovery roots stay
reference-in-place per class/R5 leaf; the legacy data root's numbered Plan 17
view, lifecycle directories, and secret-owner child do not authorize copying
anything into the new target. Secret-owner material is never materialized under
`data`.

The current tracked seed is also reference-in-place, not proof of this target
sibling topology: `canon.workspaces` currently has parent
`root.data_root`, while `plane.workmeta` and `plane.private_state` currently
have parent `root.source_checkout`. Root class is not an address. In particular,
`install` and inactive `packages`, and `control` and `private-state`, require
separate target `logical_path_id`, `binding_ref`, `parent_binding_ref`, and
binding epoch with no fallback or ambiguous resolution. Exact target row/binding
migration is a named pre-R2 blocker; current Registry consistency is not claimed.

```text
<soulforge_root>/
├─ dev/
│  ├─ main/                       # Git main checkout
│  │  ├─ core/{worldtree,rune,guild}/
│  │  ├─ apps/
│  │  ├─ adapters/
│  │  ├─ shared/
│  │  ├─ .registry/ .unit/ .workflow/ .party/ .mission/
│  │  └─ docs/
│  ├─ worktrees/
│  ├─ build/
│  ├─ test-results/
│  └─ cache/
├─ install/
│  ├─ releases/<suite-version>/
│  │  ├─ core/ apps/ adapters/ shared/
│  │  ├─ runtime/ manifests/ manual/
│  │  └─ release.json
│  └─ current -> releases/<active-version>
├─ data/                        # sole physical manifest: Plan 17 numbered data spine
│  ├─ 00_CATALOG/               # catalog/owner/class indexes
│  ├─ 10_SOURCE_CAPTURE_CATALOG/
│  ├─ 20_PROJECT_ASSET_INDEX/
│  ├─ 25_EVENT_TIMELINE_INDEX/
│  ├─ 30_KNOWLEDGE_INDEX/
│  ├─ 40_ASSETS/
│  ├─ 45_EVENT_STORES/
│  ├─ 50_AI_WORKFORCE_INDEX/
│  ├─ 55_ANALYTICS_DATASET_INDEX/
│  ├─ 60_BACKUP_GENERATIONS/
│  ├─ 70_QUARANTINE/
│  ├─ 80_CUSTODY_RECEIPT_INDEX/
│  ├─ 90_PROJECTIONS/
│  └─ 99_RESTORE_REQUEST_REFS/
├─ _workspaces/                 # logical data_root sibling; ERP/Vault project bytes
├─ _workmeta/                   # logical data_root sibling; metadata-only
├─ private-state/               # control_root private plane
├─ control/                     # control_root operation/policy/receipt plane
├─ packages/                    # runtime_root family; inactive/create-only
└─ local-recovery/              # recovery_root only
```

`dev`는 코드, `install`은 검증된 실행본, `data`는 Plan 17의 운영 DB·Event·Source
capture·catalog/index manifest, future target `_workspaces`는 authority-accepted 프로젝트
정본 bytes, future target `_workmeta`는 그 canonical byte-lineage, `control`은 실행 설정·권한·전환 receipt다. `data`의 complete
child manifest는 Plan 17만 소유하며, 이 Suite diagram은 별도 directory creation이나
root approval을 뜻하지 않는다. current legacy `_workspaces`/`_workmeta`는 actual
Legacy Freeze 전 reference-in-place이고 기존 history의 source authority로 남는다. 사람과 Bot work root는 Soulforge 밖의 독립 물리 작업면이다.

## 6. World Tree 데이터 owner

World Tree ERP 관리 데이터는 세 면의 합이다. 아래의 future target semantics와 current
legacy semantics를 섞지 않는다.

```text
data/                  Plan 17 numbered Catalog·Source·Event·Knowledge·Asset·AI·Analytics indexes
target _workspaces/    authority-accepted exact project bytes / Artifact / Dataset / Baseline / Release
target _workmeta/      only the canonical byte-lineage for those accepted bytes
```

`data/worldtree/` is not a target directory. World Tree is the logical ERP
product/owner facet across the numbered data spine and the two logical
`data_root` siblings; Rune, Guild, App, and analytics use the same multi-axis
Path Registry rule.

Source capture의 metadata는 실제 payload와 같은 Generation에 먼저 기록한다.
World Tree Catalog가 전사 관계를 소유한다. current legacy project pointer와 file/activity
history는 reference-in-place source로 남고, Event Timeline/Analytics/AI Workforce target
writer가 별도 acceptance를 받기 전에는 target `_workmeta`로 옮겨 쓰지 않는다. AI Workforce
projection은 exact Agent Mark/Deployment/Run/session/tool attribution이 있을 때만 허용한다.
`_workmeta`를 모든 Source metadata의 실시간 원장으로 확대하지 않는다.

## 7. Metadata와 Git

| 면 | 실시간 정본 | Git 역할 |
| --- | --- | --- |
| 개발 Source | Git main/tag | primary version control |
| Current legacy Workspace 파일 이력 | current legacy `_workmeta` append metadata under its existing contract | Private Git 비교·복구; target lineage와 혼동 금지 |
| ERP 운영 데이터 | DB Event·Revision·Ledger | `private-state/erp-projection`의 결정론 snapshot/diff |
| Future accepted project bytes | target `_workspaces` canonical revision + target `_workmeta` lineage | bytes는 NAS, lineage metadata는 approved private route; current legacy history remains reference-in-place until its retention decision |
| Rune | Source Git + Rune Release + Active Pointer | code/rule/history diff |
| Agent | Family·Mark·Deployment·Memory Generation | definition/receipt projection only |

ERP 운영 DB를 Git revert로 되돌리지 않는다. 잘못된 상태는 Correction/Supersession Event로
고치고, DB 손상·migration 실패는 Point-in-Time/Backup Restore를 사용한다.

## 8. App·Project Pack 설치와 제거

Source 폴더는 개발 자산이고 uninstall 대상이 아니다. 설치·제거는 `install` release package와
Runtime Registry를 대상으로 한다.

- App 제거: App runtime·cache·등록을 제거하고 Core 정본은 보존한다.
- Project Pack 비활성화: project binding과 실행 Runtime을 비활성화하고 `_workspaces/<project_code>`, `_workmeta/<project_code>`, accepted asset와 과거 receipt는 보존한다. Project Pack 제거는 프로젝트 자료 삭제를 뜻하지 않는다.
- Shared 제거: active caller가 있으면 거부한다.
- Core 제거: 모든 dependent App/Project Pack, data export, restore proof와 Owner Gate가 필요하다.

## 9. 형상관리

모든 중요한 항목은 folder path와 독립된 configuration item ID를 가진다.

```text
ci:core:worldtree
ci:core:rune
ci:core:guild
ci:app:watch
ci:rune:safety
ci:project-pack:P26-014
ci:agent:kvds-se
ci:artifact:P26-014:...
ci:path:workspace:P26-014
```

각 항목은 version/revision, content digest, current/target/previous path binding, dependency,
schema compatibility, source refs, test/review, active pointer, rollback target, backup generation을
기록한다. 폴더 이동은 identity 변경이 아니다.

Suite Release는 독립 version을 한 matrix로 pin한다.

```yaml
suite_release: 2026.09.1
core: { worldtree: 1.4.0, rune: 2.0.0, guild: 0.9.0 }
apps: { watch: 1.2.0, intelligence: 0.5.0 }
project_packs: { P26-014: 0.1.0 }
schemas: { worldtree: 7 }
rollback_release: 2026.08.4
```

## 10. 변경·Release·Rollback 흐름

```text
Change Request
-> Impact Analysis
-> Current Baseline freeze
-> Branch/Worktree
-> Build/Test
-> Independent Review
-> Package
-> Local Backup
-> Isolated Install/Canary
-> Active Pointer switch
-> Observe
-> Accept or Rollback
-> Git/ERP/NAS/Manual receipts sync
```

Rune는 기존 Mark를 덮어쓰지 않는다. 새 Mark가 실패하면 Active Pointer를 이전 Mark로
복구하고, 잘못된 Mark로 만든 Assessment는 삭제 대신 Correction/Supersession으로 보존한다.

## 11. 폴더 변경 절차

1. current folder inventory와 Configuration Item ID를 동결한다.
2. caller, dependency, service, task, script, backup owner를 조사한다.
3. target path를 Path Registry에 `target`으로 등록한다.
4. migration 전 Local/NAS Generation과 rollback plan을 만든다.
5. dry-run 뒤 한 Module만 이동한다.
6. 기존 경로는 Compatibility Junction/Adapter로 유지한다.
7. Test·Service readback·restore를 통과한 뒤 current binding을 전환한다.
8. 관찰기간과 Owner 수락 뒤에만 이전 path를 retire한다.

일괄 move/delete, history rewrite, source와 운영 data 혼합, backup 없는 rename은 금지한다.

## 12. Local Recovery와 NAS

```text
local-recovery   같은 PC에서 update/migration 실패를 빠르게 rollback
NAS generation   PC·disk 전체 장애에서 새 PC로 복구
```

NAS Generation은 source refs, install release, World Tree DB snapshot, **current authoritative
legacy** `_workspaces`/`_workmeta` preservation generation, private-state projections, control
bindings, packages와 manifest/hash/restore receipt를 묶는다. The default is `KEEP` for those
current legacy stores until N11 has an explicit retention/legacy-binding retirement decision;
their presence does not make their contents target canon. Target `_workspaces` accepted bytes and
target `_workmeta` canonical lineage are added only after actual authority-accepted atomic
publication creates real target content. 임시 cache·깨진 candidate·중간 test output은 기본 백업 대상이 아니다.

## 13. 외부 작업면

사람 작업 root와 Bot 작업 root는 Soulforge 밖에 둔다. 두 면의 작업 중 파일·cache·outbox는
ERP 정본이 아니다. Unaccepted candidate는 target 밖 isolated staging에 남는다. independent
review와 Human/project-authority acceptance 뒤에만 exact bytes와 canonical byte-lineage가
atomically target `_workspaces`/`_workmeta`에 들어간다. noncanonical work history는 future
Event Timeline/Analytics/AI Workforce route가 accepted 되기 전까지 current legacy source에
남는다. 정확한 host-local binding은 public 문서가 아닌 private physical-root inventory가 소유한다.

## 14. 다음 실행 Gate

이 working baseline이 Owner 검토를 통과한 뒤에만 다음을 수행한다.

1. 현재 소스·runtime·data·workspace·metadata·external work root 전수 mapping.
2. exact target folder manifest와 caller/compatibility/rollback matrix 생성.
3. target empty-root dry-run.
4. 한 Module/한 App의 source→package→install canary.
5. Project workspace의 OneDrive 이탈은 마지막 별도 migration으로 수행.
