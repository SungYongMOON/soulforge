# Soulforge Suite 구조·형상관리 working baseline v0

## 상태

- 상태: `OWNER_WORKING_BASELINE / NO_PHYSICAL_MIGRATION`
- 기준일: 2026-09-01
- 목적: Core·App·Add-on·Adapter·Shared, 개발·설치·데이터·정본·복구와 전체 형상관리 규칙을 한 문서에서 고정한다.
- 비효과: 이 문서는 폴더 생성·이동·Junction 변경·서비스 전환·제품 Release를 실행하지 않는다.
- 정확한 host-local current/target 경로: private physical-root inventory가 소유한다.

## 1. 한 줄 구조

> Soulforge는 하나의 Software Suite다. `World Tree`는 업무·자산·지식 정본,
> `Rune`은 공학 판단, `Guild`는 사람·AI 실행조직을 소유한다. App은 이 Core들을
> 사람이 사용하게 하고, Add-on은 선택 기능을 확장하며, Adapter는 외부 시스템을 연결한다.

## 2. 안정 ID와 working name

| 안정 ID | working product name | folder slug | 기능 설명 |
| --- | --- | --- | --- |
| `product.erp` | World Tree | `worldtree` | Task·Project·Asset·BOM·Context·Knowledge·정본 |
| `product.engine` | Rune | `rune` | 공통 Core·Domain Rune·Profile 조립·평가·Rune Factory |
| `product.agent` | Guild | `guild` | Agent Family·Mark·조직·Deployment·Run·MCP·Tool 실행 |

working name과 folder slug는 stable ID를 대체하지 않는다. 표시명이나 경로가 바뀌어도
configuration item ID와 version lineage는 유지한다.

## 3. Core·App·Add-on·Shared·Adapter

| 분류 | 판정 질문 | 소유하는 것 | 예 |
| --- | --- | --- | --- |
| Core | 회사 핵심 정본·규칙·실행체계를 소유하는가 | 작은 Interface 뒤의 핵심 구현과 상태계약 | World Tree, Rune, Guild |
| App | 사용자가 직접 실행하는 완성 프로그램인가 | 화면·사용 흐름·App 설정·cache | Intelligence, Rune Lab, Watch, Client |
| Add-on | Host Core/App 없이는 의미가 없는 선택형 확장인가 | 한 Domain/Tool의 독립 package와 version | Sonar, Safety Rune, PPT Tool |
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
├─ Add-ons
│  ├─ Intelligence Domains
│  ├─ Domain Runes
│  └─ Guild Tools
├─ Adapters
│  └─ Linear / Slack / Mail / PLAUD / Drive / Buzz / Hermes / Git / NAS
└─ Shared Modules
   └─ Discovery / Identity / Bastion / Path / Custody / Backup / CM / Deployment
```

App 이름은 Project 이름이 아니다. 한 App이 여러 Project를 처리한다. Project identity는
`_workspaces/<project_code>`와 World Tree Project catalog가 소유한다.

## 5. 개발·설치·데이터 물리 계층

```text
<soulforge_root>/
├─ dev/
│  ├─ main/                       # Git main checkout
│  │  ├─ core/{worldtree,rune,guild}/
│  │  ├─ apps/
│  │  ├─ addons/
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
│  │  ├─ core/ apps/ addons/ adapters/ shared/
│  │  ├─ runtime/ manifests/ manual/
│  │  └─ release.json
│  └─ current -> releases/<active-version>
├─ data/
│  ├─ worldtree/
│  ├─ rune/
│  ├─ guild/
│  ├─ apps/ addons/
│  ├─ analytics/ learning-evaluation/
│  └─ backup-generations/ custody-receipts/ quarantine/
├─ _workspaces/
├─ _workmeta/
├─ private-state/
├─ control/
├─ packages/
└─ local-recovery/
```

`dev`는 코드, `install`은 검증된 실행본, `data`는 운영 DB·Event·Source capture,
`_workspaces`는 프로젝트 정본 bytes, `_workmeta`는 Workspace 파일 이력, `control`은
실행 설정·권한·전환 receipt다. 사람과 Bot work root는 Soulforge 밖의 독립 물리 작업면이다.

## 6. World Tree 데이터 owner

World Tree ERP 관리 데이터는 세 면의 합이다.

```text
data/worldtree/       구조화 DB·Source capture·Event·Catalog·Knowledge·Ledger
_workspaces/          프로젝트 원자료·Artifact·Dataset·Baseline·Release bytes
_workmeta/            Workspace 파일 first-seen·hash·revision·path·Task·Run·receipt
```

Source capture의 metadata는 실제 payload와 같은 Generation에 먼저 기록한다.
World Tree Catalog가 전사 관계를 소유하고, 특정 Project에 연결된 pointer와 파일 이력만
`_workmeta/<project_code>`에 투영한다. `_workmeta`를 모든 Source metadata의 실시간 원장으로
확대하지 않는다.

## 7. Metadata와 Git

| 면 | 실시간 정본 | Git 역할 |
| --- | --- | --- |
| 개발 Source | Git main/tag | primary version control |
| Workspace 파일 이력 | `_workmeta` append metadata | Private Git 비교·복구 |
| ERP 운영 데이터 | DB Event·Revision·Ledger | `private-state/erp-projection`의 결정론 snapshot/diff |
| Project bytes | `_workspaces` Revision | bytes는 NAS, metadata는 `_workmeta` Git |
| Rune | Source Git + Rune Release + Active Pointer | code/rule/history diff |
| Agent | Family·Mark·Deployment·Memory Generation | definition/receipt projection only |

ERP 운영 DB를 Git revert로 되돌리지 않는다. 잘못된 상태는 Correction/Supersession Event로
고치고, DB 손상·migration 실패는 Point-in-Time/Backup Restore를 사용한다.

## 8. App·Add-on 설치와 제거

Source 폴더는 개발 자산이고 uninstall 대상이 아니다. 설치·제거는 `install` release package와
Runtime Registry를 대상으로 한다.

- App 제거: App runtime·cache·등록을 제거하고 Core 정본은 보존한다.
- Add-on 제거: 해당 확장 Runtime을 비활성·제거하고 생성된 accepted asset와 과거 receipt는 보존한다.
- Shared 제거: active caller가 있으면 거부한다.
- Core 제거: 모든 dependent App/Add-on, data export, restore proof와 Owner Gate가 필요하다.

## 9. 형상관리

모든 중요한 항목은 folder path와 독립된 configuration item ID를 가진다.

```text
ci:core:worldtree
ci:core:rune
ci:core:guild
ci:app:watch
ci:addon:intelligence.sonar
ci:rune:safety
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
addons: { intelligence.sonar: 0.4.0, rune.safety: 3.1.0 }
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

NAS Generation은 source refs, install release, World Tree DB snapshot, `_workspaces`,
`_workmeta`, private-state projections, control bindings, packages와 manifest/hash/restore receipt를
묶는다. 임시 cache·깨진 candidate·중간 test output은 기본 백업 대상이 아니다.

## 13. 외부 작업면

사람 작업 root와 Bot 작업 root는 Soulforge 밖에 둔다. 두 면의 작업 중 파일·cache·outbox는
ERP 정본이 아니다. 검토·custody·revision Gate를 통과한 결과만 `_workspaces`로 들어가고,
compact relation/receipt만 `_workmeta`에 들어간다. 정확한 host-local binding은 public 문서가
아닌 private physical-root inventory가 소유한다.

## 14. 다음 실행 Gate

이 working baseline이 Owner 검토를 통과한 뒤에만 다음을 수행한다.

1. 현재 소스·runtime·data·workspace·metadata·external work root 전수 mapping.
2. exact target folder manifest와 caller/compatibility/rollback matrix 생성.
3. target empty-root dry-run.
4. 한 Module/한 App의 source→package→install canary.
5. Project workspace의 OneDrive 이탈은 마지막 별도 migration으로 수행.
