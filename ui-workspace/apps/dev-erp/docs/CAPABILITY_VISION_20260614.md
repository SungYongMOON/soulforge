# dev-erp 기능 비전 캡처 (2026-06-14)

- 작성: claude_opus-4-8 (Code, 1M) — owner 비전 받아쓰기 + 섹터/자산 매핑
- 지위: **비전 캡처(아직 처방·확정 아님).** 정본 설계는 `DESIGN.md`. 이 문서는 owner 가 2026-06-14 구술한 전체 기능 비전을 잃지 않게 모으고, 6섹터·기존 자산에 매핑한 작업용 백로그다.
- 다음: 설계 워크플로(SE 엔진 4기능) + consolidation 으로 데이터모델 델타·MVP 순서를 확정해 이 문서를 갱신/승격한다.
- 경계: public-safe. 업무 원문·secret 없음.

## 정체성 (이번 대화로 날카로워짐)

> "메일이 아니라 **SE 프로세스 규정이 스스로 일을 낳고**, 산출물을 빠짐없이 닫게 강제하며, 만든 것은 라이브러리·지식으로 남기고, 사람의 능력·역할에 맞춰 자동으로 챙겨주는 — 개발1팀(방산 HW/SE)의 단일 작업대 ERP."

## 6섹터 (확정 진행 중)

1. 콕핏 (오늘·내 일·받은편지·알림) 2. 받은 일 (메일·요청→할일) 3. 과제·단계 (컨테이너+SE 게이트) 4. 공유 마스터·조달 (거래처·부품·재고·발주·라이브러리) 5. 기록물·지식 (보고서·RAG·계산기) 6. 운영·관리 (권한·분석·AI·설정)

핵심: 아래 기능 전부가 이 6섹터 안에 들어간다. 콕핏·받은 일은 "보는 표면", 3·4·5·6 이 "엔진".

## 기능 비전 전체 (owner 구술 ①~⑭ + 제안)

상태: ✅기반 다 있음 / 🟡부분 / ⬜새로

| # | 기능 | 한 줄 | 섹터 | 상태 | 재사용 자산 |
|---|---|---|---|---|---|
| ① | SE 프로세스 자동 스케줄러 | 과제 만들면 단계별 산출물+마감 자동생성, 회의후 N일/TRR 전/납품 시 규칙, **CDR 날짜 변경→연계 산출물 자동 전파** | 과제·단계 | ⬜ | guide.mjs(030~240), se_foldertree_generate, SE workflows, RAG |
| ② | 기술자료 완결성 게이트 | 회로=BOM·Gerber·Digikey·회로도·PCB·블록도 다 채워야 통과 | 과제·단계+공유마스터 | 🟡 | gates, core_attachment, boards(core_part/bom_edge) |
| ③ | 재사용 라이브러리 + 과제 역참조 | 만든 회로/보드 라이브러리 보관·조회, "어느 과제에 썼나" 역참조, 라이브러리별 조회 | 공유마스터·조달 | ✅ | pcb_revision_library 파티/스킬, core_part/bom_edge |
| ④ | 캐비넷 실물 재고 + 출고관리 | 어디 뭐있나, 막내=기록만, 출고=출고관리, 고참=조회, 부족=자동알림 | 공유마스터·조달 | ✅ | core_stock/core_location, inventory, stockwatch |
| ⑤ | 지식 인입 + 온톨로지/LLM-wiki + 스킬 보관 + 뷰어 | 문서·ebook·스킬 드롭→규칙 파이프라인→지식목록·RAG 저장, 정본 보관, 뷰어 | 기록물·지식 | ✅ | guild_hall/rag, knowledge_graph, llm_wiki_builder, .registry/skills, **owner 옵시디언 뷰어** |
| ⑥ | 계산기 + LLM 계산기 생성 | 소나/회로/단위변환 + LLM으로 새 계산기 생성(팀 자가진화) | 기록물·지식 | 🟡 | calculators 모듈, ai_jobs 큐 경계 |
| ⑦ | 자동 문서/보고/회신 | 일일업무일지·월간 부서장보고·메일 회신 자동 | 기록물·지식+운영관리 | ✅ | daily_work_ledger, night_watch/morning_report, reports 생성기 |
| ⑧ | 능력·역할 기반 자동 챙김 | 팀원 능력·역할·임무 기록→해당 담당자에게 "먼저 할 것" 번쩍 팝업/리마인드 | 운영관리+콕핏 | ✅ | **Soulforge class/skill/hero/party canon = 역량 엔진** + core_person, RBAC |
| ⑨ | 강제(하드) 게이트 | 해야 할 것 안 하면 다른 것 못 하게 차단 | 과제·단계 | 🟡 | gates hard mode, ② 완결성 |
| ⑩ | 내장 워크플로우(작성법 위저드) | 보고서·회의록·구매요청서·매뉴얼 "하는 방법"을 보며 작업 | 과제·단계+기록물지식 | ✅ | .workflow 60개, guide_artifact/guide_step 7스텝 |
| ⑪ | input 폴더 + 자동생성 버튼 | 산출물별 input 폴더에 파일 다 넣으면 버튼→LLM 스킬로 문서 제작 | 과제·단계+기록물지식 | 🟡 | ②완결성 input, hwpx_document/pptx_autofill skills, ⑥ |
| ⑫ | Smartsheet 연동 | web(대시보드/차트/리포트) 임베드 또는 API 일정 업·다운로드(동기 주의) | 운영관리/콕핏 | ⬜ | DESIGN §2(read 연동 결정됨) |
| ⑬ | 개인 캘린더 export | 개인별 일정 ICS→구글캘린더 다운로드 | 콕핏/개인 | ✅ | gateway 메일_일정이벤트.ics 패턴 |
| ⑭ | 다중 일정 뷰어 | 휴가·프로젝트 일정 달력/카드/간트 뷰(간트=①의존성과 연결) | 콕핏/과제·단계 | ⬜ | ① 스케줄러 데이터, core_stage/core_item due |

### claude 제안 (개발1팀·방산 SE 맥락)

- 납기·CDR 위험 조기경보 (①+② / 사전 플래그)
- 형상·변경 이력 추적 (configuration_baseline_and_change_control 워크플로)
- 부하 밸런싱 (감시 아닌 지원)
- 회의 액션 미결 롤업 (meeting_action_map)
- 산출물 양식 자동 제공 + LLM 초안
- 캐비넷·라이브러리·지식·과제 통합 검색 한 박스(⌘K)
- ⭐ **부품 단종(EOL) 영향분석** — "이 부품 EOL→쓰는 보드/과제 N개" (③+④+BOM 역참조). 방산 장수명 킬러 기능
- 지식 승계 — 신규/복귀자 "이 과제 뭐였지" RAG 즉답(사람 떠나도 지식 남음)

## 큰 통찰

- **①~⑭ 전부 기존 6섹터 안에 들어간다** → 섹터 구조가 맞다는 강한 증거.
- **⑧의 "능력·역할 자동 매칭"은 Soulforge 의 species/class/skill/hero/party canon 이 바로 그 엔진** — 게임 레이어가 여기서 실용으로 회수된다(사람=hero, 역할=class, 능력=skill, 팀=party, 임무=mission, 할일=monster).
- 기능이 **compounding**: ①스케줄러+②완결성=납기위험예측, ③라이브러리+④재고+BOM=단종영향분석, ⑤지식+⑥계산기+⑦자동보고=지식이 사람을 떠나도 남음.

## 다음 (consolidation 에서 확정)

1. 전체 기능을 데이터모델 델타(기존 25테이블에 더할 것)로 통합.
2. MVP-first 단계별 빌드 순서(SE 자동 스케줄러를 심장으로, 가장 작은 가치 슬라이스부터).
3. owner 결정 필요 항목(SE 단계 정의, 게이트 hard 시점, 알림 채널, Smartsheet 동기 방향 등) 정리.
4. 확정 시 DESIGN.md(canon) 갱신은 owner 서명 후.

## owner 원칙·제약 (cross-cutting — 빠짐없이 저장, 2026-06-14)

기능 ①~⑭ 위에 걸치는 owner 핵심 원칙. 어느 LLM이든 이걸 먼저 읽고 따른다.

- **구조/섹터가 가장 중요**: "잘 쓸 수 있는 구조"가 기능보다 먼저. 큰 분류(섹터) → 챕터 → 과제 컨테이너가 실제 개발1팀 일에 "딱 적당"하게 나뉘어야. 6섹터(콕핏/받은일/과제·단계/공유마스터·조달/기록물·지식/운영·관리), 근거=BOM 인벤토리+이카운트 IA+SE 프로세스.
- **팀장·팀원 한 화면**: 뷰를 쪼개지 않는다. 같은 화면을 팀원(내 일만 필터)·팀장(전체 롤업)이 각자 본다. RBAC 가시성·렌즈로 갈리되 별도 화면 금지(DESIGN "업무 뷰 1개를 모두가").
- **정체성**: "메일이 아니라 SE 프로세스 규정이 스스로 일을 낳는" 단일 작업대 ERP. 메일은 입력 하나.
- **ERP ↔ 레포 양방향**: 할 일을 ERP에 적고, 파일을 올리면 레포(`_workspaces`) 구조에 저장되고 ERP는 포인터로 연결(원문 미저장).
- **핸드오프 최우선**: 빌드 전에 "어느 LLM(Codex/Claude)이든 의도를 안 빠뜨리고 실수 없이 그대로 실행 가능한 세분 계획"을 만들고 저장. owner 입력은 절대 잃지 않는다(이 문서·SE_ENGINE_BUILD_PLAN·MASTER_BUILD_PLAN·`docs/slices/` 패킷에 빠짐없이).
- **AGENTS 규칙 준수**: 연속성(Codex 정본·도구 비종속·NIGHT_WORK_HANDOFF), public/private/secret 경계, AI 실행 계약, 슬라이스 commit(작업자+모델)+self-verify(node:test+verify_gate≥1), 종료 시 knowledge trigger.
- **dev-erp 불변**: zero-dependency, 코어 LLM 0%(ai_proposal 큐→사람 승인), 원문 미저장 포인터, event_log 라벨링, ALTER 멱등, .registry/.unit 정본 read-only.
- **병렬 작업**: Codex 동시 진행 시 파일 분담(Codex=새 데이터/문서, Claude=dev-erp 코드). 같은 파일 동시편집 금지, push 전 `git pull --rebase`.
- **알림**: 능력·역할 기반 "먼저 할 것" 번쩍 리마인드(채널 콕핏/메일/텔레그램 미정 — owner 결정).
- **자동 챙김 루프**: 작성법 위저드 → input 폴더 충족 → 게이트 통과 → 자동생성 버튼(LLM 스킬)으로 산출물 제작.
