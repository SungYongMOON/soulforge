# Soulforge Owner Master Architecture and Release Map v1

## 문서 상태

| 항목 | 값 |
| --- | --- |
| 상태 | `OWNER_WORKING_BASELINE / GRILL_DECISIONS_RECORDED` |
| 기준 commit | Fresh Grill 입력 `main@c1f2ff453e7e137725924cd1352c5153c472c5ec` 이후 Owner 결정 통합본 |
| 목적 | Owner·신입·개발자·Agent가 Soulforge 전체를 한 장에서 읽고 상세 owner 문서로 내려가는 최상위 항법 정본 |
| 소유 | `docs/architecture/foundation` cross-root owner |
| 비권한 | 이 문서만으로 제품명 확정, 폴더 이동, runtime 활성화, Connector 설치, 권한 부여, 배포, 최종수락을 만들지 않음 |

이 문서는 기존 상세 정본을 복제·대체하지 않는다. 각 계층의 목적, owner, Interface,
현재 상태, 상세 문서 포인터와 열린 결정을 한곳에서 연결한다. 상세 의미 충돌 시
해당 owner-local 문서가 우선하고 이 문서를 같은 변경에서 동기화한다.

상태 표기는 다음을 사용한다.

```text
CONFIRMED            owner 방향 또는 public contract가 고정됨
IMPLEMENTED          실제 코드·문서·Interface가 존재함
VALIDATED            결정론 검증이 통과함
PHYSICAL_PILOTED     실제 PC·source·project에서 bounded 실행됨
HOLD                 정확한 blocker가 있어 진행하지 않음
OPEN_GRILL           Owner 결정이 남음
OWNER_DEFERRED       Owner가 재진입 조건까지 결정을 미룸; 그 전에는 다시 묻지 않음
TARGET               목표 구조이며 아직 materialize하지 않음
```

## 0. 한 줄 북극성

> Soulforge는 현실의 사건을 맥락·지식·공학판단으로 업무화하고, 권한 범위 안의
> 사람과 AI가 수행한 결과를 검증·수락·복구 가능한 회사 자산으로 축적하는
> Engineering Operating System이다.

```text
Source → Event/Candidate → Context/Knowledge → Engineering Judgment
→ Task/Assignment → Human/Agent/Tool Work → Result/Evidence
→ Review/Acceptance → ERP Canon/Ledger/Backup → 다음 개선
```

## Owner one-screen index

| Layer | 한 줄 목적 | 현재 |
| --- | --- | --- |
| M0 | 세계관·Game Skin·현실 authority | 방향 CONFIRMED, 용어 OWNER_DEFERRED |
| M1 | 세 제품과 의미 있는 이름 | 구조 CONFIRMED, 이름 OWNER_DEFERRED |
| M2 | 아홉 portfolio의 제3자용 설명 | stable ID·설명 CONFIRMED, 이름 OWNER_DEFERRED |
| M3 | 제품별 Source Composition·migration | plan VALIDATED, manifests 미구현 |
| M4 | Shared deep Module과 Interface | 원칙 CONFIRMED, 분류 TARGET |
| M5 | Runtime·Pack·Release | Pack foundation 부분 VALIDATED |
| M6 | 사람/Bot/ERP 물리 작업면·Buzz Git | 구조 CONFIRMED, private binding 일부 HOLD |
| M7 | SE variant 기반 `_workspaces` 프로젝트 정본 | generator 존재, variant maturity 차이 |
| M8 | project `_workmeta`·Ledger 배치 | 원칙 CONFIRMED, stage crosswalk TARGET |
| M9 | Connector/App 설치·권한·업데이트·제거 | TARGET |
| M10 | risk/capability 기반 자율실행과 escalation | 방향 CONFIRMED, policy registry TARGET |
| M11 | Collection/Custody와 NAS Backup/DR | 구분 CONFIRMED, actual DR HOLD |
| M12 | Owner grant/revoke/STOP UI | TARGET |
| M13 | Soulforge Operations Console Apps·분석·관제 | foundation 부분, product shell TARGET |
| M14 | World Tree 고정 I/O seam | TARGET, internal engine OPEN |
| M15 | Manual-as-Release | catalog 존재, sync validator HOLD |
| M16 | 개발1팀 one-seat/internal RC→pilot | Owner PC one-seat Slice CONFIRMED, 물리 실행 HOLD |

## Master Layer ID 규칙

이 문서의 계층 ID는 `M0`~`M16`이다. 대화에서 사용한 L0~L16 설명을 같은 순서로
옮겼지만, 기존 `SOULFORGE_ERP_BOM_HIERARCHY_V0.md`가 이미 별도 의미의 L0~L5를
사용하므로 둘을 혼동하지 않는다. `DEVELOPMENT_ROADMAP_V0.md`의 `M1`, `M2-*`는
Roadmap milestone ID이므로 항상 `Master M*`, `Roadmap M*`, `ERP BOM L*`처럼 owner를
붙여 표기한다.

### Owner 18-point correction trace

| # | Owner correction | Master owner |
| --- | --- | --- |
| 1 | 4192와 제품에 의미 있는 최종 명칭 필요 | M1·M13 |
| 2 | 판타지 세계관과 game-like work를 유지/제외할지 명시 | M0 |
| 3 | ERP·Engine·Agent Platform의 통일된 제품명 필요 | M1 |
| 4 | 제3자가 이해하는 portfolio 설명과 용어 필요 | M2 |
| 5 | 제품 source folder의 naming·migration 원칙 필요 | M3 |
| 6 | Shared Module·Pack·제품 source의 관계 설명 필요 | M4·M5 |
| 7 | Buzz Project Git clone/worktree 위치를 협업 owner와 확정 | M6 |
| 8 | `_workspaces`는 SE variant/stage/artifact 규칙으로 생성 | M7 |
| 9 | `_workmeta`는 project-local companion metadata와 장부만 소유 | M8 |
| 10 | 외부 App/Connector의 설치·권한·업데이트·제거 lifecycle 필요 | M9 |
| 11 | Owner 건별 승인이 아닌 risk/capability 위임 실행 | M10 |
| 12 | Collection/Custody와 NAS disaster Backup/Restore를 분리 | M11 |
| 13 | Owner가 grant/revoke/STOP하는 제품 UI 필요 | M12 |
| 14 | 4192를 운영 App Platform과 분석 도구로 확장 | M13 |
| 15 | World Tree 내부 구현은 보류하되 I/O seam은 고정 | M14 |
| 16 | 운영 Manual을 제품 Release와 함께 versioning·검증 | M15 |
| 17 | 개발1팀 대상 internal RC를 이번 주 목표로 검토 | M16 |
| 18 | Architecture 문서와 사용자/운영 Manual의 역할 차이 명시 | M15 뒤 crosswalk |

## M0. 세계관·게임 경험·현실 authority

Soulforge의 판타지 세계관은 제거하지 않는다. 회사의 실제 Task·Asset·Agent·Event를
다른 모습으로 보여주는 선택형 `World Skin / Game UX`로 둔다.

| 현실 | 판타지 UX 후보 | authority |
| --- | --- | --- |
| 사건·업무 후보 | Monster 징후·후보 | Candidate일 뿐 |
| 승인되거나 정책상 실행 가능한 업무 | Quest·Monster | Linear/Task policy가 상태 소유 |
| 프로젝트 | Dungeon·Campaign | Project identity를 대체하지 않음 |
| 사람·AI Agent | Hero·Unit | Agent Mark/사람 identity를 대체하지 않음 |
| 조직·팀 | Guild·Party | 조직 authority를 대체하지 않음 |
| 실행 | Battle | AgentRun/WorkSession이 실제 기록 |
| 산출물·Evidence | Artifact·Relic·Battle Log | Vault revision/receipt가 실제 정본 |
| 주요 Stage/Gate | Boss Gate | 사람·정책 Gate를 대체하지 않음 |
| 운영관제 | Watchtower | read-only projection |

`Boss`를 포함한 게임 용어의 최종 의미는 `OWNER_DEFERRED`다. 사람이나 경쟁자를
가리키지 않고 중요한 Stage·통합검증·Human-Accepted Release 같은 팀 목표의 선택형
Skin 후보로만 남긴다. 내부 구조가 안정되고 별도 naming/Game UX 단계가 열리기 전에는
제품 출시 전체 또는 Stage별 의미를 다시 묻거나 권한·상태·경로에 결속하지 않는다.

판타지 Skin은 참여·성취·팀 경험의 Edge가 될 수 있지만 별도 Task truth, 자동 인사점수,
완료 authority, 보상·징계 원장을 만들지 않는다.

현재 game-term 충돌은 `OWNER_DEFERRED`다. Monster·Quest·Mission·Boss·Reward는
문서별 초안 의미가 다르므로 공식 workflow vocabulary, 코드 enum, 폴더명 또는 authority로
사용하지 않는다. 별도 naming/Game UX 단계가 열리면 deliverable→review→acceptance→
Official Done Gate와의 관계를 다시 설계한다.

`Mission`은 현재 `.mission` held-plan canon, 판타지 업무 용어, `sf-p01` 초안 이름에
동시에 쓰인다. 이 중 `.mission`의 기존 기술 owner만 유지하고 나머지 표시명·Skin 의미는
`OWNER_DEFERRED`로 둔다. 재개 시 World Bible과 Shared Glossary를 같은 결정에서 갱신한다.

상세 owner: [`SOULFORGE_WORLD_BIBLE_V0.md`](SOULFORGE_WORLD_BIBLE_V0.md).

## M1. 제품 계층과 명명

현재 기능형 제품 ID는 다음 세 개로 고정한다. 사람에게 보이는 최종 제품명은
`OWNER_DEFERRED`이며 stable ID와 분리한다. 이름 구조는 `stable_id`, 기능 설명,
소프트웨어 브랜드명, 선택형 fantasy Skin명, compatibility handle을 서로 다른 필드로 둔다.

| Stable product ID | 현재 기능명 | 목적 | 최종 표시명 |
| --- | --- | --- | --- |
| `product.erp` | Soulforge ERP | Task·프로젝트·자료·BOM·Artifact·지식·정본 | `OWNER_DEFERRED` |
| `product.engine` | Soulforge Engineering Engine | 체계공학·품질·안전·PCB·조달 등 결정론 판단 | `OWNER_DEFERRED` |
| `product.agent` | Soulforge Agent Platform | AI 조직·Agent·Hermes·Buzz·MCP·Tool Workshop | `OWNER_DEFERRED` |

`4192`는 compatibility/runtime handle이다. 공식 기능 설명은
`Soulforge Operations Console`로 확정했고, 사람이 기억하고 부를 소프트웨어 브랜드명은
`OWNER_DEFERRED`다. 소개 구조는 `[소프트웨어명] — Soulforge Operations Console`이다.
이름 변경은 display name부터 적용하고 stable ID·Interface·기존 path는 migration Gate
전까지 유지한다.

4192에는 runtime/compatibility handle `4192`, app `Team Ops Board`, logical seam
`Watch`, fantasy label 후보 `Watchtower`가 겹친다. `Soulforge Operations Console`은
공식 기능 설명이고 네 번째 제품이 아니다. `Watch`·`Watchtower`의 최종 표시 의미와
브랜드명은 naming 단계까지 보류한다.

상세 owner:
[`SOULFORGE_ENGINEERING_OS_PRODUCT_FAMILY_REBASELINE_V0.md`](SOULFORGE_ENGINEERING_OS_PRODUCT_FAMILY_REBASELINE_V0.md).

## M2. Portfolio 계층과 제3자 설명

`sf-p01`~`sf-p09`는 기계 wire ID다. 사람용 이름은 업무형 공식명과 선택형 판타지
label을 함께 제공한다.

| ID | 제3자용 설명 | 현재 업무형 이름 | 판타지 후보 |
| --- | --- | --- | --- |
| `sf-p01` | 외부 사건에서 해야 할 일을 발견·분류·제안 | Work Discovery & Mission | Monster Forge |
| `sf-p02` | 프로젝트 업무·자료·BOM·Artifact revision을 관리 | ERP & Asset Management | Vault |
| `sf-p03` | 제품·업무·Agent·자원·비용·백업을 관측 | Operations Console | Watchtower |
| `sf-p04` | 사람·AI 조직, Agent Mark·Deployment·Run을 관리 | AI Workforce & Organization | Guild Hall |
| `sf-p05` | Context·Evidence·Ontology·RAG·지식을 관리 | Knowledge & Ontology | World Tree |
| `sf-p06` | 공학 규칙과 실제 관측을 비교해 gap·risk를 판단 | Engineering Engine Family | Engine Foundry |
| `sf-p07` | CAD·PCB·문서·시험 등 전문 Tool 자원을 운영 | Tool Workshops | Artisan District |
| `sf-p08` | identity·권한·custody·backup·restore를 보호 | Platform, Security & Recovery | Bastion |
| `sf-p09` | 설치·업데이트·교육·지원·조직 확산을 운영 | Deployment, Training & Adoption | Academy |

최종 한국어/영어/판타지 이름은 `OWNER_DEFERRED`다. 설명 문장과 stable ID는 유지하고,
내부 구조가 안정된 뒤 별도 naming 단계에서 표시명만 결정한다. 그 전에는 초안 이름을
코드·경로·authority에 결속하지 않는다.

우선 보정 대상은 P03(read-only인데 Command로 읽힘), P04(사람 조직도 포함),
P06(제품명과 중복), P08(Agent Platform과 Platform 단어 충돌)이다.

`Vault`, `Forge`, `Guild`, `Watch`, `Bastion`은 현재 logical product/module owner와 판타지
label로 함께 쓰인다. 모두 Forge와 같은 명명 검토 대상이며, stable 업무 owner와 선택형
skin label을 분리하기 전에는 어느 한 의미를 canon으로 추정하지 않는다.

## M3. 제품 Source Code와 명명·migration

현재 source는 기능별 owner 아래에 있고 Module/Pack 기반은 이미 존재한다.

```text
ui-workspace/apps/dev-erp/
guild_hall/engineering_engine/
guild_hall/vault_revision/
guild_hall/forge_intent/
guild_hall/agent_observation/
guild_hall/engineering_mcp/
guild_hall/tool_workshop/
guild_hall/path_registry/
guild_hall/backup_controller/
...
```

Fresh audit 기준:

- Program plan `00`~`17` 존재;
- enrolled Module manifest 29개;
- 미등록 `guild_hall` directory 22개;
- import graph 1,269 files / 2,738 edges / cycle 0;
- Pack 종류 5개, tracked Pack spec 4개;
- 세 제품의 `product.manifest`와 product-first physical root는 아직 없음.

따라서 현재 상태는 `MODULE_AND_PACK_FOUNDATION_DONE /
PRODUCT_SOURCE_COMPOSITION_NOT_DONE`이다.

PC0~PC6 순서:

```text
PC0 audit
→ PC1 current-path product.manifest 3개
→ PC2 Product-owned/Shared Module 분류와 Interface closure
→ PC3 product validator·release·Pack closure
→ PC4 Owner가 최종 physical source root 결정
→ PC5 Module 1개 compatibility migration
→ PC6 반복·이전 path retirement
```

legacy 단어·폴더명을 바로 삭제하지 않는다. 최종 naming grammar와 product root가
결정된 뒤 display/manifest부터 바꾸고, caller·Pack·backup·rollback 증거가 있는 Module만
하나씩 이동한다.

업무후보 접수는 특정 제품이나 단일 모델이 소유하지 않는 Shared Candidate Intake
Module로 둔다. 각 모델·domain Adapter는 서로 다른 방식으로 후보를 발견할 수 있고,
공용 Module은 출처·근거·중복·상태·검토 route를 같은 envelope로 정규화해 ERP 승격
Gate로 전달한다. ERP는 검토·승격된 Task 정본을 소유할 뿐 후보 발견 전략을 소유하지
않는다. `Forge`는 compatibility/초안 label이며 최종 이름은 `OWNER_DEFERRED`다.

상세 owner: team program [Plan 15](team_member_engineering_program/15_FOLDER_COMPATIBILITY_MIGRATION.md).

## M4. Shared Module의 의미

Shared Module은 여러 제품이 함께 쓰는 깊은 기능이다. "공유"는 소스 파일을 세 제품에
복사한다는 뜻이 아니다.

```text
one Module → one owner → one Implementation → one versioned Interface
                                  ↑
                     ERP / Engine / Agent가 Adapter로 소비
```

후보 Shared Module:

- Ledger/Event Envelope;
- Identity/Authority;
- Path Registry;
- Custody/Transfer;
- Backup/Recovery;
- Policy/ACL;
- common Schema/Validation;
- Knowledge/RAG Interface 중 project-independent 부분.

제품 재기준 문서에는 Task & Decision, Context World Tree 등 domain capability 7종도
Shared 후보로 기록돼 있다. 위 infrastructure 후보 8종과 합쳐 단일 candidate inventory로
분류하되, `여러 제품이 사용한다`는 사실만으로 infrastructure Shared Module이 되는 것은
아니다. PC2에서 exact owner·Interface·Implementation을 하나씩 결정한다.

Module 삭제 시 복잡성이 여러 caller로 다시 퍼진다면 깊은 Module이다. 단순 pass-through와
한 번만 쓰는 abstraction은 Shared로 승격하지 않는다.

## M5. Runtime·Pack·Release 단위

제품 source와 설치 Pack은 다른 축이다.

| Pack | 대상 | 현재 |
| --- | --- | --- |
| HPP Server Pack | 중앙 서버·Backend·control/data plane | tracked spec |
| Team Client Pack | 팀원 PC MCP·UI·outbox·진단·교육자료 | tracked spec |
| Tool Workshop Pack | 전문 Tool PC Adapter·lease·validator | tracked spec |
| Project AI Team Pack | 프로젝트별 Agent Mark/Deployment binding | 계약 있음, spec HOLD |
| Backup/Recovery extension | capture·restore·reconciliation 도구 | tracked spec |

각 Pack은 manifest, semantic version, dependency/SBOM, install/start/stop/smoke,
upgrade/rollback/restore, manual과 support lifecycle을 가진다. Pack 존재는 Release가 아니다.

## M6. 물리 작업공간·Buzz Git

```text
human_work_root               사람 self-managed 작업·작성 surface(manual-only)
bot_work_root                 Bot 작업·cache·outbox surface
_workspaces                   ERP/Vault canonical file materialization
_workmeta                     project/system metadata ledger
```

현재 host-local physical values는 private binding에서만 관리한다. `bot_work_root`는
등록된 Bot 실행영역 alias로 표현하고 public 문서에 drive path를 고정하지 않는다.
`human_work_root`는 회사가 제시할 수 있는 사람용 표준 폴더 틀의 편의 label일 뿐,
Path Registry root class나 자동 관리 binding으로 활성화하지 않는다.

현재 호환명 crosswalk는 다음과 같다. `bot_work_root`는 Owner-facing alias,
`bot_worktree`는 기존 plan 호환명, `project_work_root`는 Path Registry physical class,
`workroot.bot_execution`은 logical registry row다. `human_work_root`는 manual-only/HOLD
label이다. 사람은 회사 표준 틀 안에서 폴더를 스스로 만들고 관리하며, Agent가 이를
감시·자동수집·준수검사·자동백업하지 않는다. 시스템 관리 경계는 검토·수락된 자료가
ERP `_workspaces`에 materialize될 때 시작한다.

`bot_work_root` current shape:

```text
COMMON/  MFG/  PJT/<year>/<project>/<role>/{RULES,WORK,...}  TOOL/
```

Buzz Project Git의 project shared integration clone과 role별 isolated Agent worktree는
`bot_work_root` 아래에 둔다. `_workspaces`나 사람 작업폴더에는 두지 않는다. 이 결정은
logical placement만 고정하며 실제 clone·relocation·private binding을 승인하지 않는다.

Bot/Human 모두 `_workspaces` accepted/current input을 checkout/copy해 작업하고, 결과는
동일한 custody/review/promoter Gate를 거쳐 `_workspaces`로 돌아간다.

사람 작업폴더는 정본·revision·acceptance·backup owner가 아니며 문서 전달·제출은 기존의
사람 중심 방식도 허용한다. 자동 연결은 `HOLD`다. `_workspaces`는 project/non-project
Junction과 plain child가 섞여 있어 각 direct child를 project, reserved system/library,
local/legacy/unclassified로 분류해야 한다. nested `_workspaces/_workmeta`는 root sibling
`_workmeta`와 다른 legacy/unclassified 후보다.

## M7. `_workspaces` 프로젝트 정본 폴더트리

고정된 한 가지 임의 트리를 사용하지 않는다. 각 프로젝트의 사업유형·상위 체계업체·
품질등급·profile과 승인된 SE Foldertree variant가 stage/artifact 번호 구조를 결정한다.

```text
_workspaces/<project_code>/
├─ PROJECT_ID.txt
├─ plan_manifest.json
├─ plan_progress.json
├─ task/exclusion CSV와 index
└─ <variant-defined stage>/<numbered artifact>/<task>/...
```

현재 generation support:

| 조합 | generator 상태 | source 검토 한계 |
| --- | --- | --- |
| 체계개발 / LIG 넥스원 / A | bundled production path | spine 부합, 빠진 required 후보와 tailoring 검토 필요 |
| 선행연구 / 공통 / 없음 | bundled | SRR~PCA 차용 명칭 재기준 필요 |
| 탐색개발 / 공통 / 없음 | bundled | 탐색개발 source 기반 재기준 필요 |
| 운용연구개발 / 공통 / 없음 | bundled | 성능개량/현존전력 track 분리 필요 |
| 응용연구·시험개발 | proposal/audit only | production variant 아님 |

Owner 우선순위는 `체계개발 / LIG 넥스원 / A` 신규 프로젝트부터 정식 적용하는 것이다.
기존 프로젝트는 일괄 migration하지 않고 프로젝트별 dry-run, pointer 영향 검토와 Owner
승인 뒤 전환한다. 다른 bundled variant와 `일반SE/공통/없음`은 source 재기준과 검증 전
production default로 승격하지 않는다.

체계개발 current generated spine은 030 SRR, 060 SFR, 090 PDR, 120 CDR,
150 TRR_DT, 180 FCA_OT, 210 PCA, 240 LL이다. `일반SE/공통/없음`은 229 generated
artifact folder를 가진 base가 존재하지만 mapping의 supported matrix 문구와 불일치가 있어
Grill/문서 보정 전 production default로 과장하지 않는다. profile A/B/C는 현재 compiled
variant에서 folder exclusion 차이가 없어 quality grade와 generation profile을 별도 축으로 둔다.

실제 project tree 변경은 supported variant, dry-run, path/pointer migration, Owner gate를
거친다. 프로젝트별 최신 authoring file과 산출물은 이 ERP view에 materialize한다.

상세 owner:
[`WORKSPACE_PROJECT_MODEL.md`](../workspace/WORKSPACE_PROJECT_MODEL.md),
[`SE_WORKSPACE_FOLDER_NAMING_CONVENTION_V0.md`](../workspace/SE_WORKSPACE_FOLDER_NAMING_CONVENTION_V0.md),
`se_foldertree_generate` canon.

## M8. `_workmeta`와 Ledger 배치

`_workmeta/<project_code>`는 그 프로젝트 metadata만 소유한다. 모든 회사 장부를 한 프로젝트
아래에 넣지 않는다.

아래는 complete current inventory가 아니라 target crosswalk다. 현행 owner 문서의
`monsters/`, `autohunt/`, `dungeons/`, `nightly_healing/`, `analytics/`, `artifacts/` 등
기존 child는 그대로 유효하며 조용히 교체하지 않는다.

```text
_workmeta/<project_code>/
├─ contract.yaml / bindings/
├─ foldertree/                       # stage/artifact/task ID·manifest/progress refs
├─ stages/<stage_ref>/               # TARGET compact index, raw tree 복제 아님
│  ├─ events/ decisions/ reviews/
│  └─ run_ledger_refs/
├─ daily_ledger/ log/events/ runs/
├─ reports/ project_context/
├─ knowledge_rag_candidate_ledger/
└─ backup_restore_refs/

_workmeta/system/                    # project-agnostic 공통 review·procedure·aggregate
```

`foldertree/`와 `stages/`는 target metadata crosswalk다. 실제 source/CAD/Office/Dataset을
복제하지 않고 `_workspaces` stage/artifact ID와 exact pointer/hash만 가진다. 기존 구조를
조용히 rename하지 않고 LR/PC implementation Gate에서 schema·reader 호환을 검증한다.

`_workspaces`와 `_workmeta`는 동일 트리를 복사하는 mirror가 아니다. project_code,
stage/artifact/task stable ID, project-relative path, hash, revision, status와
validation/review refs로 연결되는 companion relation이다.

Ledger owner 규칙:

- Project Task/Decision/Run/Artifact/Review/Knowledge 후보: 해당 project `_workmeta`;
- 전사·제품·공통 review/usage/procedure: `_workmeta/system` 또는 exact shared Ledger owner;
- Linear/Slack/Buzz/PLAUD native history: source-local owner, project에는 pointer만;
- public Git에는 raw/private ledger를 넣지 않음.

## M9. Connector/App 설치·운영 생명주기

External Connector는 계속 추가·삭제될 수 있는 설치형 capability다.

```text
candidate → vetted → installed_off → configured → granted → active
→ degraded|held → upgrade|rollback → revoke → uninstall → tombstone
```

Connector record 최소 필드:

- connector/app ID와 version;
- integration ownership(`managed|custom|hybrid`);
- source/action capabilities;
- account/organization/project binding;
- read/write scope와 expiry/revocation;
- credential `secret_ref`;
- health/freshness/cursor;
- backup/restore/data-retention class;
- update/rollback/uninstall state.

M13 Operations Console은 설치된 App/Connector 목록·권한·상태를 보여주고 요청을 받는다.
실제 credential 보관과 action authorization은 Bastion/ERP policy owner가 집행한다.

## M10. 업무 실행·위임 authority

Owner가 모든 Task를 하나씩 승인하는 구조를 목표로 하지 않는다. Owner는 역할·Agent·Task
type·Action·Project별 capability envelope를 부여·해제한다.

Standing Authority Policy 최소 shape는 `{subject, project, task_type, capability,
action, risk_ceiling, evidence_threshold, rate_limit, expiry, rollback}`이다.
ERP AuthorityPolicy store가 canonical policy의 sole writer다. Bastion은 write 전 검증,
runtime enforcement, privileged action과 emergency revoke/STOP을 소유한다. Soulforge
Operations Console은 read-only projection과 Owner-authenticated request surface이며
policy를 직접 쓰지 않는다. 이 owner 분리는 schema/Interface 결정이고 writer activation은
별도 Gate 뒤다.

```text
Owner policy/grant
→ risk/capability gate
→ 허용된 낮은 위험 업무는 Agent가 자율 수행
→ 결과·Evidence·비용·오류 한도 기록
→ 범위/한도/위험 초과만 Owner escalation
```

현재 A0~A6/JM 사다리를 재사용한다. 다음은 계속 사람 Gate다: 대외전송·계약·구매·
예산·보안공개·중대 기술기준·Baseline·최종 기술수락·고위험 Official Done.

업무 흐름:

```text
Chat/Source가 Task 후보 생성
→ policy·project Agent가 수행 가능 여부 확인
→ 사람/Agent가 local work
→ 전문 Tool 필요 시 Workshop queue/lease 신청
→ Tool Bot 결과와 receipt 반환
→ Evidence 검증·ArtifactRevision·Human Acceptance
→ 별도 Linear writer가 상태 반영
```

팀원은 Buzz에서 지시하거나 MCP로 할 일·자료를 받아 같은 폐루프를 사용한다.

반복 가능한 실행지식은 별도 승격 루프를 따른다.

```text
manual work + project-local Run truth → reviewed Skill/Workflow/Party/Mission candidate
→ canon promotion gate → reusable execution canon → bounded Autohunt reuse
```

Run 성공이나 반복 빈도만으로 자동 승격하지 않으며 source support, regression evidence,
owner surface와 promotion authority가 모두 닫혀야 한다.

## M11. Collection/Custody와 NAS Backup

용어를 분리한다.

| 용어 | 뜻 | 예 |
| --- | --- | --- |
| Capture/Collection | 외부 데이터를 관찰·수집 | Slack/Linear/PLAUD read |
| Custody/Ingest | D: 또는 승인 store에 exact bytes/manifest를 보관 | source generation·quarantine |
| Sync/Materialization | 같은 자료를 작업/view에 보이게 함 | `_workspaces` Junction |
| Backup/DR | 서버 PC 고장에 대비해 보호 세대를 회사 NAS에 별도 저장 | immutable generation→NAS |
| Restore | NAS backup을 격리 복원·검증 | isolated readback |
| Human Restore Acceptance | 사람이 복구 결과를 수락 | recovery-ready Gate |

```text
Source → D: capture/custody                  # 백업 아님
accepted protected generation → company NAS # 백업
NAS → isolated restore → reconciliation → human acceptance
```

NAS source asset과 NAS backup target을 분리하고 backup 사본을 다시 source로 재귀 인입하지 않는다.

현재 프로젝트의 D: byte store는 새 company-wide root를 만들지 않고, 각
`_workspaces/<project_code>` Junction에 이미 결속된 owner-approved per-project
backing worksite를 우선 재사용한다. 다른 human/project root로 바꾸는 것은 private Path
Registry binding, writer/ACL, caller, backup/restore와 rollback을 갖춘 project-by-project
migration이며 자동 정본 전환이 아니다.

첫 recovery canary는 합성 generation을 격리 복원해 Owner가 수락하고, 다음 단계에서
승인된 저위험 실제 프로젝트 한 건을 복원해 해당 프로젝트 책임자가 수락한다. Backup
운영자는 evidence를 만들지만 자기 결과를 단독 수락하지 않는다. 첫 시험에서 실제
복구시간과 누락량을 측정한 뒤 data class별 RPO/RTO를 결정하며, 그 전에는 수치 SLA나
NAS recovery-ready를 주장하지 않는다.

## M12. Owner 권한 부여·해제 UI

Soulforge Operations Console(compatibility handle 4192)에 `Authority & Access` App을 둔다.

표시·요청 기능:

- 사람·Agent·Device·Connector identity;
- Project/Task type/Action capability;
- A0~A6·JM state;
- scope·expiry·writer epoch·revocation;
- Tool/Workshop grant;
- external action/approval policy;
- before/after/readback·audit receipt.

Operations Console UI는 writer가 아니다. Owner-authenticated grant/revoke request를 만들고,
Bastion이 write 전 검증을 수행한 뒤 ERP AuthorityPolicy sole writer만 canonical policy를
적용한다. Bastion은 runtime enforcement와 emergency STOP/revoke를 집행하고, Console은
적용·readback receipt를 표시한다.

## M13. Soulforge Operations Console App Platform(compatibility handle 4192)

4192를 고정 기능 하나가 아니라 Soulforge 운영 App Platform으로 발전시킨다.

초기 Apps:

- Product/System Health;
- Project·Task·Run·Artifact projection;
- Agent/Tool/Workshop 상태;
- Connector/App 설치·권한·freshness;
- Storage/Collection/Backup/Restore;
- Token·Quota·Cost;
- Authority & Access;
- Incident/Action Request.

후속 Apps:

- 사람·Agent·Tool별 업무량·시간·대기·재작업;
- 요청 창구·업무종류·프로젝트 종류 분석;
- 회로설계·문서·시험 등 activity duration;
- 병목·handoff·승인·capacity 분석;
- 품질·비용·Human-Accepted Outcome;
- 연구·시장·기술 crawling과 R&D 후보 발굴.

개인 자동 점수·감시·인사평가는 금지한다. Process Mining 결과는 근거·누락률·불확실성·
정정권을 함께 보여준다. 각 App은 versioned Interface와 detachable deployment를 가진다.
`mining_eligible`, `learning_eligible`, `people_analytics_allowed`는 서로 독립적인
deny-by-default flag다. 운영 Ledger를 분석/학습 Dataset으로 바꾸는 작업은 별도 dataset
revision·ACL·consent·acceptance owner를 요구하며, 운영 권한이 Dataset 권한을 대신하지 않는다.

이를 위해 `Product/App Manifest`, navigation/composition Interface, compatible projection
schema, App version/manual/support/grant 상태가 필요하다. 현재 구현은 일부 supplier와
projection foundation이며 product/app shell은 `TARGET`이다.

공식 기능 설명은 `Soulforge Operations Console`이다. 사람이 기억하고 부를 소프트웨어
브랜드명은 `OWNER_DEFERRED`이며 `[소프트웨어명] — Soulforge Operations Console`
구조로 나중에 정한다. `4192`는 그때까지 compatibility/runtime handle로 유지한다.

## M14. Context World Tree Input/Output Contract

World Tree 내부 DB/Graph/RAG 구조는 지금 확정하지 않는다. 대신 교체 불가능한 입력·출력 seam을
먼저 고정한다.

입력:

- exact Source Revision/Capture Generation;
- stable Person/Organization/Project/Task/Artifact/Agent IDs;
- Event Envelope와 세 clock/effective interval;
- Evidence/Decision/Relation/ACL refs;
- correction/invalidation/deletion/retention events.

출력:

- project/role-scoped Context View;
- Evidence Set와 citation refs;
- Candidate Fact/Relationship;
- freshness/conflict/missing-source 상태;
- Work/Context Request 후보;
- accepted knowledge candidate와 invalidation/rebuild receipt.

현재 개발의 완료조건은 모든 source/ledger가 이 seam에 연결 가능한 stable ID·revision·time·ACL·
pointer를 남기는 것이다. 내부 graph/vector/relational engine 선택과 자동 ontology 승격은 후속 설계다.

## M15. Manual-as-Release

운영매뉴얼은 부속 문서가 아니라 제품 Release의 필수 Artifact다.

각 제품/Pack release는 다음 문서를 version과 함께 결속한다. 아래 10개 폴더는
`TARGET PHYSICAL PROJECTION`이며 semantic owner는 Plan 16의 16-role catalog다.

```text
manual/
├─ product-overview/
├─ install-update-uninstall/
├─ user/
├─ operator-admin/
├─ security-authority/
├─ backup-restore/
├─ troubleshooting/
├─ training-new-hire/
├─ training-experienced/
└─ release-notes-known-issues/
```

Manual 내용 정본은 Markdown과 versioned image asset이다. 사용자용 기본 projection은
interactive HTML book이며, 접근 가능한 연속 읽기 모드와 인쇄용 PDF를 같은 source에서
생성한다. 표지·장·목차·검색·그림 확대·반응형 화면·책 넘김 효과는 확정 요구가 아니라
`TARGET projection requirements` 후보다. HTML UI와 PDF는 내용 정본이나 별도 authority가 아니다.

Manual contract 필드:

- product/Pack/interface version;
- 대상 독자·선행조건;
- allowed/forbidden action;
- step·expected result·evidence;
- recovery/rollback/escalation;
- screenshot/UI locator 또는 CLI ref;
- validator/test/runbook refs;
- last verified release와 stale 상태.

Release Gate는 기능/Interface/화면 변경 시 관련 manual mapping과 재검증이 없으면 실패해야 한다.
신입·기존 팀원·운영자 교육은 같은 manual source에서 audience별 projection을 만든다.

현재 문서 catalog는 16개 manual 역할을 요구하지만 Deployment Pack 코드의
`RUNBOOK_CATALOG`는 13개다. Path Registry, Target Materializer, 4192 Storage Map manual
coverage와 실제 manual artifact/digest/version resolver가 없어 `RELEASE_HOLD`다.

## M16. 개발1팀 주간 출시 목표

목표 사용자는 우선 개발1팀과 Owner 본인이다. 이번 주 목표는 전체 OS 완성이 아니라
`Development Team 1 Internal Release Candidate`다.

첫 target은 Owner PC를 팀원과 같은 설정으로 사용하는 one-seat RC다. 이 한 자리에서
accepted flow를 검증한 뒤 동일 증거를 3~5회 반복하고 별도 promotion decision으로
development-team pilot ring에 진입한다.

Owner-confirmed 최소 Slice:

1. HPP Server/Backup Pack의 현재 validated build;
2. Owner PC의 exact one-seat Team Client 설치·진단;
3. 프로젝트·권한 binding readback;
4. Linear/ERP의 승인된 Task·자료 read-only 조회;
5. Buzz 연결 또는 MCP로 Task/자료 전달;
6. 사람/Bot local work 후 result/Evidence candidate 제출;
7. 자동 Done 없이 review/HOLD 표시;
8. 4192의 coarse health·Connector·Backup·Authority projection;
9. 합성 generation의 isolated restore canary와 실제 시간·누락량 측정;
10. 설치·사용·복구·지원 manual, interactive HTML book projection과 known-issue list.

제외 범위는 Linear 자동변경, 비 canary 외부 자동전송, 자동 Official Done, 최종 기술수락,
정식 출시, 팀 전체 배포, 실제 NAS recovery-ready와 credential scope 확대다.

출시 상태는 `internal_rc`, `pilot`, `production`을 분리한다. 현재 실제 credential·Team Client
실좌석·NAS restore·Linear writer·Project AI Team Pack이 모두 닫혔다고 주장하지 않는다.

## 전체 문서 세트와 Manual의 차이

| 구분 | 전체 Architecture/Program 문서 | 운영 Manual |
| --- | --- | --- |
| 질문 | 무엇을 왜 만들며 owner·Interface·Gate가 무엇인가 | 누가 어떤 버전에서 실제로 어떻게 설치·사용·복구하는가 |
| 대상 | Owner·설계자·개발자·Reviewer | 팀원·운영자·관리자·신입 |
| 상태 | target/current/HOLD와 설계 결정 | released version에 결속된 실행 절차 |
| 내용 | 제품·Module·folder·data·authority·roadmap | step·화면·명령·expected result·rollback |
| 검증 | plan/canon/interface/review | install/smoke/readback/restore/user exercise |

Architecture가 바뀌면 Manual 영향표가 갱신되고, 제품이 Release되려면 해당 Manual이 그 버전에서
검증돼야 한다. 두 문서는 같은 내용을 복제하지 않고 Interface/version ref로 연결한다.

## 병렬 구현 Lane과 의존성

Fresh Grill은 Owner 결정과 명시적 보류·재진입 조건을 닫았다. 아래 A~F는 Plan 14에
등록된 post-Grill candidate lane이며 active Roadmap slice나 자동 구현 승인이 아니다.

| Lane | 병렬 가능 범위 | 선행 Owner 결정 |
| --- | --- | --- |
| A Naming & World Skin | 이름 후보·UX vocabulary·same-data skin spec | `OWNER_DEFERRED`; 내부 구조 안정 후 별도 재개 |
| B Product Composition | product.manifest·Module classification·product validators | 제품별 source home+Shared 원칙, exact root는 PC4 evidence 뒤 |
| C SE Workspace & Metadata | variant crosswalk·metadata mirror·project ledger rules | supported variants와 migration policy |
| D Connector & Backup | connector catalog·collection/backup split·NAS DR contract | synthetic restore 측정 후 RPO/RTO; physical binding 별도 Gate |
| E Authority & Operations UI | grant/revoke schema·read projection·Bastion request seam | ERP writer·Bastion enforcement·Console request/read separation |
| F Manual & Internal Release | manual catalog/templates·release sync validator·RC checklist | Owner PC one-seat Slice와 Markdown→HTML book 원칙 |

공유 파일·schema·writer는 한 Lane만 소유하고 다른 Lane은 Interface ref만 사용한다. 구현 TASK는
Terra/max, 독립검토는 fresh policy profile을 사용한다.

## Fresh Grill Decision Closure

2026-08-31 Human Owner가 공통 이해를 확인하고 Grill 종료를 명시했다. 아래 결정이나
의도적 보류는 재진입 조건 전까지 다시 묻지 않는다. `implementation 0`이며 이름 변경,
physical binding, runtime activation, authority mutation, backup-ready 또는 release 승인이 아니다.

| # | Decision closure | Re-entry trigger |
| --- | --- | --- |
| 1 | 이름 구조는 stable ID·기능 설명·software brand·fantasy Skin·compatibility handle을 분리. 공식 기능 설명은 `Soulforge Operations Console` | software brand와 세 제품 표시명은 내부 구조 안정 후 naming 단계 |
| 2 | Monster/Quest/Mission/Boss/Reward 의미를 공식 workflow vocabulary에 결속하지 않고 `OWNER_DEFERRED` | 별도 naming/Game UX 단계 |
| 3 | 제품별 visible source home + Shared 영역 원칙 확정; 현재 path는 compatibility-first | PC1–PC3 evidence 뒤 PC4에서 exact root spelling/location 결정 |
| 4 | ERP AuthorityPolicy store sole writer, Bastion validation/enforcement/STOP, Console request/read only | schema 구현과 physical writer activation은 각 Gate 뒤 |
| 5 | 이번 주 RC는 Owner PC one-seat safe closed loop; Linear auto-write·외부 자동전송·auto Done·team rollout 제외 | one-seat evidence 3–5회와 별도 ring promotion |
| 6 | `체계개발/LIG 넥스원/A` 신규 프로젝트 우선; 기존 프로젝트는 개별 dry-run·승인 | 다른 variant source 재기준 또는 project별 migration packet |
| 7 | 합성 restore→Owner 수락, 이후 승인된 저위험 프로젝트→프로젝트 책임자 수락; Backup 운영자 self-accept 금지 | 첫 restore 측정 뒤 RPO/RTO, private evidence 뒤 NAS target/binding |
| 8 | 모델별 discovery는 독립, Shared Candidate Intake가 envelope를 정규화; manual source는 Markdown+images, 기본 projection은 interactive HTML book | `Forge` 명칭은 naming 단계; manual artifact 구현은 release lane |
| 9 | one-seat가 first physical target이며 team pilot은 후속 ring | 5와 동일 |
| 10 | Buzz Project Git shared integration clone과 role-isolated Agent worktree는 Bot work root | exact private project/repo/ref/binding canary Gate |
| 11 | `.mission` 기술 owner만 유지하고 cross-layer 표시명·Skin label은 `OWNER_DEFERRED` | 2와 동일 |
| 12 | 사람 폴더는 회사 표준 틀을 개인이 자율 관리하는 manual-only surface; Agent 감시·자동수집·준수검사 없음. 관리 경계는 ERP `_workspaces`부터 | 별도 Owner 결정 없이는 Path Registry root/binding 활성화 금지 |

검토 역할은 deterministic validators→fresh integration/review→Human Owner 순서를 유지한다.
Advisory review는 source truth나 Owner 승인을 만들지 않으며 raw transcript·private payload·
secret을 tracked canon에 남기지 않는다.

## 현재 상태 요약

| 계층 | 상태 |
| --- | --- |
| 세계관·불변법칙 | `CONFIRMED`, 명칭/게임 UX `OWNER_DEFERRED` |
| 세 제품·아홉 portfolio | 구조·설명 `CONFIRMED`, 표시명 `OWNER_DEFERRED` |
| Module/Pack foundation | `IMPLEMENTED/VALIDATED` 부분, 물리 rollout 아님 |
| Product Source Composition | plan `VALIDATED`, product.manifest 미구현 |
| 사람/Bot/ERP 작업면 분리 | contract `CONFIRMED`; 사람 폴더 manual-only, private Bot binding HOLD |
| SE workspace dynamic tree | 신규 체계개발/LIG/A 우선 CONFIRMED, 다른 variant·기존 migration gated |
| `_workmeta` mirror/ledger placement | 원칙 CONFIRMED, stage mirror schema TARGET |
| Connector lifecycle·Authority UI | owner/writer separation CONFIRMED, implementation TARGET |
| Collection/Backup 구분 | canary/acceptor CONFIRMED, numeric RPO/RTO·NAS physical acceptance HOLD |
| World Tree seam | input/output TARGET, internal engine OPEN |
| Manuals | Markdown+image source/HTML-book projection CONFIRMED, release sync 구현 필요 |
| Development Team 1 RC | Owner PC one-seat Slice CONFIRMED, credentials/physical gates HOLD |

## 상세 owner 문서

- [`VISION_AND_GOALS.md`](VISION_AND_GOALS.md)
- [`SOULFORGE_WORLD_BIBLE_V0.md`](SOULFORGE_WORLD_BIBLE_V0.md)
- [`SOULFORGE_ENGINEERING_OS_PRODUCT_FAMILY_REBASELINE_V0.md`](SOULFORGE_ENGINEERING_OS_PRODUCT_FAMILY_REBASELINE_V0.md)
- [`team_member_engineering_program/00_MASTER_INDEX_AND_DECISIONS.md`](team_member_engineering_program/00_MASTER_INDEX_AND_DECISIONS.md)
- [`team_member_engineering_program/01_SYSTEM_CONTEXT_AND_CROSSWALK.md`](team_member_engineering_program/01_SYSTEM_CONTEXT_AND_CROSSWALK.md)
- [`team_member_engineering_program/02_CURRENT_INVENTORY_AND_GAPS.md`](team_member_engineering_program/02_CURRENT_INVENTORY_AND_GAPS.md)
- [`team_member_engineering_program/07_BUZZ_HERMES_COLLABORATION.md`](team_member_engineering_program/07_BUZZ_HERMES_COLLABORATION.md)
- [`team_member_engineering_program/12_DEPLOYMENT_ROLLOUT_SUPPORT.md`](team_member_engineering_program/12_DEPLOYMENT_ROLLOUT_SUPPORT.md)
- [`team_member_engineering_program/13_TEST_DOGFOOD_ACCEPTANCE.md`](team_member_engineering_program/13_TEST_DOGFOOD_ACCEPTANCE.md)
- [`team_member_engineering_program/14_ROADMAP_GATES_AND_DAG.md`](team_member_engineering_program/14_ROADMAP_GATES_AND_DAG.md)
- [`team_member_engineering_program/15_FOLDER_COMPATIBILITY_MIGRATION.md`](team_member_engineering_program/15_FOLDER_COMPATIBILITY_MIGRATION.md)
- [`team_member_engineering_program/16_OPERATIONS_RUNBOOK_CATALOG.md`](team_member_engineering_program/16_OPERATIONS_RUNBOOK_CATALOG.md)
- [`team_member_engineering_program/17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md`](team_member_engineering_program/17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md)
- [`../workspace/WORKSPACE_PROJECT_MODEL.md`](../workspace/WORKSPACE_PROJECT_MODEL.md)
- [`../workspace/SE_WORKSPACE_FOLDER_NAMING_CONVENTION_V0.md`](../workspace/SE_WORKSPACE_FOLDER_NAMING_CONVENTION_V0.md)

## 변경 통제

- 새 아이디어는 M0~M16 또는 기존 portfolio/Module에 먼저 귀속한다.
- 새 제품·root·Schema·Workflow는 이 Master Map과 owner 문서 영향 검토 없이 만들지 않는다.
- 실제 current/HOLD 수치와 물리 binding은 fresh evidence 없이 승격하지 않는다.
- 이 문서와 owner 문서·Manual·Pack manifest가 달라지면 release를 HOLD한다.
