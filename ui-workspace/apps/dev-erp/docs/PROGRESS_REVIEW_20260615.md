# dev-erp 중간 점검 — 진행 현황·방향·계획 (2026-06-15, 야간 자율)

- 작성: claude_opus-4-8 (Code, 1M) — owner 취침 중 자율 루프 중간 점검
- 목적: owner 가 최초 두서없이 구술해 저장한 목표 캡처 파일 대비 "지금 어디까지 왔나 / 방향은 맞나 / 다른 점 / 앞으로 / owner 결정사항" 정리.
- 최초 목표 캡처 정본: `docs/CAPABILITY_VISION_20260614.md` (owner 구술 기능 ①~⑭ + 6섹터 + cross-cutting 원칙). 우선순위 정본: `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md` (active slice = **dev-erp, owner 1순위**).
- 경계: public-safe. 업무 원문·secret 없음.

## 1. 최초 목표(①~⑭) 대비 현 위치

owner 가 캡처한 14개 기능 비전과 현재 코드 상태 대조(✅기반있음 / 🟡부분 / ⬜미착수):

| # | 기능 | 상태 | 근거(코드) |
|---|---|---|---|
| ① | SE 프로세스 자동 스케줄러(단계별 산출물·마감 자동, 날짜 전파) | 🟡 코어 | `se_stage_template`/`applyTemplate`/`setAnchor` 1-hop 전파 |
| ② | 기술자료 완결성 게이트(BOM·Gerber·…6종) | 🟡 코어 | `artifact_requirement`/`boardCompleteness`/`gateEval` |
| ③ | 재사용 라이브러리 + 역참조 | ✅ | `core_part`/`bom_edge`/boards 라이브러리 |
| ④ | 캐비넷 실물 재고 + 출고관리 | ✅ | `core_stock`/`core_location`/stockwatch |
| ⑤ | 지식 인입 + RAG/위키 + 뷰어 | ✅ | knowledge 모듈/RAG 라우트 |
| ⑥ | 계산기 + LLM 계산기 생성 | 🟡 | calculators 모듈(생성은 ai_jobs 경계) |
| ⑦ | 자동 문서/보고/회신 | ✅ | reports/worklogDraft + `tools/daily_se_report.mjs` |
| ⑧ | 능력·역할 기반 자동 챙김 | 🟡 인프라 | Soulforge class/skill/hero canon 존재, **dev-erp 미배선** |
| ⑨ | 강제(하드) 게이트 | 🟡 | gates hard mode + ② 완결성 |
| ⑩ | 내장 워크플로우(작성법 위저드) | ✅ | recipe/guide 7스텝 |
| ⑪ | input 폴더 + 자동생성 버튼 | 🟡 | `inputFulfillment`(충족 현황), 생성 버튼 미배선 |
| ⑫ | Smartsheet 연동 | ⬜ | embeds(read 연결 결정만) |
| ⑬ | 개인 캘린더 export(ICS) | ✅ | calendarFeed/ICS 패턴 |
| ⑭ | 다중 일정 뷰어(간트) | ⬜ | ① 데이터는 있음, 뷰 미구현 |

**요약: 14개 중 코어 인프라가 선 것이 11개(✅6 / 🟡5), 미착수 3개(⑫⑭ + ⑧ 배선).** 즉 "기능 뼈대"는 대부분 깔렸고, 남은 핵심은 **구조(IA)를 owner 가 실제 쓰는 모양으로 굳히는 것 + 기능들을 SE 흐름에 묶는 것**이다 — 이게 이번 세션의 방향이었다.

## 2. 이번 세션(2026-06-14~15)에 실제 한 것

owner 가 "구조/섹터가 기능보다 먼저"라 한 원칙대로, 기능 추가보다 **IA·정체성 굳히기**에 집중:

1. **네비 IA 4계층 확정** (commit e2ebc52→54bcfc4→5d865a5): entity 5대분류 → owner 교정 → **4계층 깊이**(가로 대분류>가로 중분류>왼쪽 분류>왼쪽 항목) + 프로젝트 관리 = **과제시작년도(L2)>과제명(L3)>facet(L4)** + 과제 허브 11 facet 탭(프로젝트별 실 API). [[dev-erp-nav-ia]]
2. **과제명 = 워크스페이스 정션 소스** (commit 0055c34): `_workspaces/<코드>`가 OneDrive `company/<코드 한글명>` 심링크 → `tools/sync_project_names.mjs`로 실 과제명 동기화(P26-014 KVDS 기뢰탐색음탐기 등). [[dev-erp-workspace-junction]]
3. **SE 기준점 할 일 모델 slice 1** (commit 3888903): 메일→할일이 그냥 to-do가 아니라 과제·단계·산출물을 닫는 실행단위. 인입 미연결 → `unclassified` 격리. [[dev-erp-se-task-model]]

## 3. 방향 점검 — 맞는가? → **정렬됨**

owner cross-cutting 원칙 대조:
- **"구조/섹터가 기능보다 먼저"** → 이번 세션 전부 IA 굳히기. ✅ 정확히 부합.
- **"팀장·팀원 한 화면"(뷰 안 쪼갬)** → 단일 NAV_TREE·단일 core_item, RBAC 렌즈만. ✅
- **"메일이 아니라 SE 프로세스가 일을 낳음"** → slice1 자동분류가 메일 to-do를 SE 기준점에 강제. ✅
- **"ERP=상태·연결 / 폴더=원문"(관제탑, 껍데기 아님)** → core_*는 포인터만, 영상(윤비서) 아키텍처 대본 검증으로 동형 확인. ✅
- **코어 LLM 0% / 원문 미저장** → 유지. ✅

**결론: 큰 방향은 owner 가 말한 것과 일치한다.** 외부 영상은 거시 아키텍처 외부검증 사례로만 쓰고 SE 단계/증거 계약은 dev-erp 자체 설계 우선 — 이 분별도 지켜졌다.

## 4. owner 가 실제 말한 것과 달랐던 것 (교정 이력 + 미해결)

1. **(교정됨) 네비를 entity 분류로 짠 것** → owner가 "4=계층 깊이, 년도=계층"이라 교정 → 현재 정본 반영. 처음에 owner 의도를 두 번 잘못 읽음(5대분류, 년도=왼쪽열). 지금은 일치.
2. **(미해결) 영상 #1·#2를 먼저 빌드한 것**: 자동 팔로업(`scanFollowups`)·git 일일보고(`tools/daily_se_report.mjs`)를 영상 봤다는 이유로 선반영(commit e122576). owner가 "영상은 개념일 뿐, 우선순위 아니면 반영 말 것"이라 교정([[video-concepts-priority-discipline]]). **코드는 아직 남아 있음 — 유지/철회 owner 미결정.** scanFollowups는 runRecommenders에서 호출 1줄 제거하면 무해 비활성, daily_se_report는 독립 스크립트라 비침습.
3. **(교정됨) placeholder 과제명** → OneDrive 정션에서 실명 교체.

## 5. 앞으로 할 것 (우선순위 제안)

- **A. SE 기준점 할 일 모델 완성 (slice 2~6)** — owner 승인된 방향. `_workmeta/system/dev_worker_candidate_queue/dev_erp_se_task_model_v0.yaml`.
  - slice2 confirmItem(미분류→정식 확정 게이트) ← **지금 가장 작은 다음 가치. 현재 미분류는 격리만 되고 "분류"가 안 됨.**
  - slice3 분류 UI(과제·단계·산출물·업무유형 선택) / slice4 완료게이트+증거 / slice5 맥락 컬럼 / slice6 요청·회의 인입 채널.
- **B. `_workspaces` SE 폴더트리 ingest** — 과제명 넘어 단계(030~240)·산출물(SE_산출물_목록.csv)·회의를 폴더 소스에서 자동 동기화. 정션이 소스임이 확실해졌으니 뼈대급. [[dev-erp-workspace-junction]]
- **C. ①~⑭ 잔여 갭**: ⑧ 능력·역할(class/skill/hero) → dev-erp 담당자 매칭 배선, ⑪ input 자동생성 버튼, ⑫ Smartsheet, ⑭ 간트.
- **D. DESIGN.md(canon) 갱신** — nav IA·SE task model은 현재 구현만 반영, canon은 owner 서명 후.

## 6. owner 결정 필요 (자고 일어나서 정할 것)

1. **영상 #1·#2(scanFollowups·daily_se_report) 코드 — 유지 vs 철회?** (4-2 항목)
2. **mod:proposals(제안 큐) 위치** — 현재 과제·단계 인접. ai_proposal 착지면 키스톤 결정([[dev-erp-keystone-ai-proposal]]) 따라 운영·관리/AI·승인으로 swap 여부.
3. **알림 채널** — 데이터=ERP / push=외부 메신저(텔레그램 등) 미정. 영상은 알림=Slack 분리.
4. **완료 게이트 증거 모델(slice4)** — done 전 어떤 증거(답장/수정파일/검토/결정기록)를 필수로 할지.
5. **DESIGN.md canon 갱신 승인** — IA·할일모델 정본화.
6. **다음 큰 방향 우선순위**: A(SE 할일모델 완성) vs B(_workspaces 폴더 ingest) 중 먼저.
7. **(신규) SE_산출물_목록.csv ingest** — P26-014 폴더에 산출물 **128건**(게이트·산출물명·완료기준 100%·경로 100%·마감)이 있음(`tools/scan_se_foldertree.mjs` 스캔). 이걸 ERP로 ingest 할지 + 표현(se_deliverable_template 시드 vs core_item vs core_artifact) + 원문 경로 포인터 취급. dry-run 스캔은 완료(DB 미변경), **--apply ingest 는 owner 확인 후**. ⇒ 이게 facet들을 실데이터로 채우는 가장 큰 레버.

## 7. 야간 자율 진행 로그 (이 루프가 빌드한 것)

- (2026-06-15 야간 시작) 중간 점검 보고서 작성(commit 0f76b73).
- **SE 할일모델 slice2 — confirmItem + 분류 UI** (commit 9c99aa0): 미분류 할 일을 업무유형+연결대상으로 분류해 정식(open) 승격하는 게이트·화면. 빈 등록은 needs_se_anchor 차단. owner 예시(CDR 자료 BOM 반영→과제·수정·산출물) preview 검증. node:test 106/106.
- **SE 할일모델 slice5 — 과제 허브 맥락 컬럼** (commit 236cb94): 과제 허브 '할 일' facet에 단계·유형·연결대상·완료기준 표시. 같은 할 일이 과제 안에선 맥락 붙어 보임.
- **SE 폴더트리 dry-run 스캔 도구** (commit 5515e1c): `tools/scan_se_foldertree.mjs` — DB 미변경, 폴더에서 ingest 가능 구조 집계. **발견: P26-014 산출물 128건(완료기준·경로 100%, 8게이트)** = 실 SE 데이터 소스 확인(§6-7). --apply ingest 는 owner 확인 후.
- 다음(자율): slice6 요청·회의 인입 채널 → ⑭ 간트/일정 뷰 등 결정 불필요 슬라이스. slice4(완료게이트+증거)·CSV --apply ingest 는 **owner 결정 대기**라 보류.

> 자율 빌드 정책: owner 결정 필요 항목(§6)은 건드리지 않고, 결정 불필요한 슬라이스만 진행. 각 슬라이스 commit+push, node:test 전건 + preview 검증.
