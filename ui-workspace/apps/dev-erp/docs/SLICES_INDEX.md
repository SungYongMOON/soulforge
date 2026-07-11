# dev-erp 세분 실행 패킷 인덱스 (2026-06-14)

## Active implementation slices

- `slices/AX-WORK-EVENT-HOOK.md` - ERP start/completion buttons as canonical metadata-only work lifecycle hooks for AX accumulation.
- `slices/B5-PROPOSAL-INBOX.md` — 제안 수신함 v1 + 수신역할(to/cc) core_mail 배선 (**done 2026-07-03: mailcsv 이력키 조인 + 근거 노출·계정 resolve·1클릭 승인=approved + 영수증 집계 API**, ERP 표면 스레드)
- `slices/STEM-V2-ONTOLOGY.md` — **줄기 v2 온톨로지 정본** (골격·작업·이력줄기, 연결 등급 원칙, 드래그=사람확정 — 2026-07-05 owner 공동설계 확정). 모든 줄기 관련 레인(생성기·그래프 UI·API)의 공통 기준.
- `slices/ENGINE-11-STEM-V2-GENERATOR.md` — 줄기 생성기 v2: 제목 클러스터 → 링크 기반 3종 줄기 (execution_owner: **engine_thread_codex**, done 2026-07-05; retro rebuild pass applied 2026-07-06)
- `slices/B6-STEM-REATTACH-API.md` — 줄기 드래그 재부착 서버 계약+API 3종 (**done: reanchor/occurrence/mail-reattach 구현·테스트 완료 — B8 지도 렌더가 소비 중**, ERP 표면 스레드. 2026-07-11 인덱스 정정: 'ready' 표기 stale)
- `slices/B7-MAIL-ROUTE-RULES.md` — Outlook식 메일→과제 라우팅 규칙(사용자 입력 UI + 소급 적용) (**done 2026-07-05**, 2026-07-11 인덱스 소급 등재)
- `slices/FIVE-FIELD-CAPTURE.md` — 완료 시점 자동화 자산 5필드 자동 캡처 v1(completion_log needs_backfill 훅) (**done — 구현·테스트 실존 확인(야간 리뷰 스윕 2)**, 2026-07-11 인덱스 소급 등재)
- `slices/KNOWLEDGE-LOOP.md` — 지식 유통 루프 완성(승인→assignee_memory→Codex 주입) (**done — 구현·테스트 실존 확인(야간 리뷰 스윕 2)**, 2026-07-11 인덱스 소급 등재)
- `slices/B8-STEM-MAP-V2-RENDER.md` — 줄기 지도 v2 렌더: 골격·작업·이력 색/모양 구분 + legacy 기본 숨김 + 범례 + 회차 상세 + 드래그 재부착 UI (**done 2026-07-06: B6 reanchor 소비, 중복 리스너 결함 수정 포함**, ERP 표면 스레드)
- `slices/B9-STEM-RIVER-VIEW.md` — **줄기 강(江) 뷰 설계 정본** (2026-07-06 owner 구술): 기둥=시간축 SE 흐름·게이트=큰 점·가지=맥락 한 줄·잎=기록(기원/경로/종결 즉답)·모양=진단·지식그래프와 잎 수준 양방향 접점. 구현 순서 B9a(가지 타임라인)→b(강줄기 렌더)→c(진단)→d(지식 역링크). B9a **done 2026-07-11**(branch_story API+지도 렌즈 이야기 뷰, ERP 표면 스레드)·B9b core done 2026-07-07. **다음 착수 = B9c(진단 뷰).**
- `slices/B10-CALENDAR-VIEW.md` — 캘린더 뷰: 월간 그리드(마감+일정) + 날짜 클릭 일정 생성 + 드래그 이동(due_overridden 계약) + month_cal 미니 위젯 (**done 2026-07-11: /api/calendar 그리드·meetings update/delete 소프트삭제·브라우저 e2e 검증**, ERP 표면 스레드. owner 2026-07-11 지시 — B9a 큐와 별개 인입)

## Engine expansion slices (2026-07-02, claude_fable-5 — 할일 엔진 확장)

정본 마스터: `slices/ENGINE_EXPANSION_MASTER_PLAN_20260702.md` (순서·의존성·공통 가드·공통 검사 총칙·검증된 기반 사실·owner 결정 K-1~K-5 소유). 각 패킷은 cold-start 실행 가능(검증된 사실 + 구현 전 확인 + 설계 + 검사 방법 + 완료 기준 포함).

- `slices/ENGINE-8-TEAM-MAIL-DEDUP.md` — 팀 메일 사본 통합(메시지ID 정확 매칭 + fingerprint 폴백) (G-intake-cycle, **done 2026-07-03: v1-compatible 원장 컬럼 2종 + auto-intake/context 사본 수렴**, commit `479c86c0`)
- `slices/ENGINE-1-THREAD-DEDUP.md` — 스레드 인지 중복 억제 (G-intake-cycle, **done 2026-07-02: followup receipt/event pre-pass + sparse-thread fallback**)
- `slices/ENGINE-2-COMPLETION-KNOWLEDGE-FEED.md` — 완료 지식 후보 자동 적재 (G-knowledge-feed, **done 2026-07-02: completion_log knowledge → candidate JSONL feed + cursor**)
- `slices/ENGINE-3-CAPABILITY-ASSIGN.md` — 역량 기반 담당 제안 (G-intake-cycle, **done 2026-07-02: branch-rule role/capability/suggested assignee enrichment**)
- `slices/ENGINE-4-FOLLOWUP-SLA.md` — 무응답·기한 팔로업 (G-intake-cycle, **done 2026-07-03: K-2 3달력일 + 원 발신자 제안 + default-off followup scan**, commit `694e330c`. **K-2 보강 2026-07-03 owner: 변환된 할일도 추적 포함 — 후속 패킷 대기**, 패킷 "owner 결정 기록" 4항)
- `slices/ENGINE-5-RAG-GROUNDED-JUDGE.md` — 판단 근거(RAG) 연결 v1 메타 (G-llm-adapter, **done 2026-07-02: approved source-text index metadata → context/candidate/event used_refs grounding**)
- `slices/ENGINE-6-KNOWLEDGE-PIPELINE-AUTOMATION.md` — 승인 후 지식 뒷단 자동화+주간 트리아지 (guild_hall/Codex 소유 표면)
- `slices/ENGINE-7-VOICE-INTAKE.md` — 음성 보관함→할일 합류 (K-3 선행)
- `slices/ENGINE-9-BACKEND-DATA-PLANE.md` — 데이터 평면 일원화: 엔진 쓰기 경로를 백엔드
  (`<backend-root>/_workmeta`)로 + 줄기 per-project + runtime `_workmeta` 병합 이관
  (G-intake-cycle, **applied 2026-07-05: write path wiring + per-project trunk spawn done;
  runtime `_workmeta` merge remains a one-time ops follow-up after runtime path inspection**)
- `slices/ENGINE-10-SYSTEM-MAIL-LAYER.md` — 시스템/광고 메일 분류층(Gmail식 격리): Soulforge
  자동화 메일·광고를 결정적 프리패스로 격리(할일 후보 제외, 삭제 아님) + 사람 교정→규칙 후보
  피드백 (G-intake-cycle, **done 2026-07-05: auto-intake prepass + no_action receipts
  + core_mail system/ad labels. `[dev-erp]` exclude 규칙과 별도로 보존형 격리층 배선**)

권장 순서 E8→E1→E2→E3→E5→E4→E9→**E10**→E6→E7. 같은 parallel_group 은 같은 파일을 만지므로 한 작업자 직렬.

어느 LLM(Codex/Claude)이든 패킷 하나를 cold 로 실행 가능. 각 패킷 = `slices/<id>.md`.
정본 빌드맵: MASTER_BUILD_PLAN_20260614.md, 원칙: CAPABILITY_VISION_20260614.md.

## 실행 순서 (depends_on 위상)
P-4-ai-A → P-4-ai-B → SE-DATA → P-6 → P-10 → P-11 → U-1a → U-1b → U-1d → P-8 → P-12 → P-13 → P-18 → P-5 → P-7 → U-1c → P-14 → P-9 → P-17 → P-19 → SE-UI

## 병렬 wave (다른 parallel_group = 다른 파일군 = 동시 가능)
- **W1**: P-4-ai-A, SE-DATA, P-6, P-10, P-11, U-1a, U-1b, U-1d, P-8, P-12, P-13, P-18
  - 의존 0 인 착지면·시드·읽기 패킷 + UI 와이어링 동시 가동. parallel_group 가 다르면(=다른 파일군) 동시 실행 가능. store.mjs 를 함께 만지는 그룹은 한 작업자에 직렬 묶음: store-ai-proposal(P-4-ai-A), G-store(SE-DATA), store-people(P-6), store-knowledge(P-10), store-calculator(P-11)는 서로 다른 구역이라 다른 작업자/세션이면 병렬 가능하나, 같은 store.mjs 파일 동시편집 충돌을 피하려면 store.mjs 패킷은 작업자별로 1개씩만 잡는다. app.js 패킷은 parallel_group 별로 분리: appjs-core-scaffold(U-1a), appjs-boards-attach(U-1b), appjs-gates(U-1d), appjs-home-widgets(P-8·P-12 — 같은 widgetBody 군이라 직렬), appjs-recipe(P-13). P-4-ai-B 는 P-4-ai-A 의 대안이므로 W1 에 동시 머지 금지(owner 키스톤 #1 택1).
- **W2**: P-5, P-7, U-1c
  - W1 의존 해소 후. P-5 depends_on SE-DATA(G-store 직렬), P-7 depends_on P-6(store-people-rollup), U-1c depends_on U-1a(appjs-core-scaffold 직렬, sched_* 사전 선행). 세 패킷은 서로 다른 parallel_group(G-store / store-people-rollup / appjs-core-scaffold)이라 W2 안에서 병렬 가능.
- **W3**: P-14, P-9, P-17
  - P-14 depends_on SE-DATA+P-5(G-store 직렬), P-9 depends_on P-1(완료)+P-8(W1 완료), P-17 depends_on P-8(W1 완료). P-14 와 P-9 는 둘 다 store.mjs+server.mjs 를 만지지만 P-14=G-store, P-9=G-store 로 같은 그룹이면 직렬. P-17=backend-export 는 별 그룹이라 병렬. 안전하게: P-14→P-9 직렬(둘 다 server.mjs if-chain), P-17 병렬.
- **W4**: P-19
  - P-19 depends_on P-4-ai-A·P-6·P-7·P-10·P-11 전부. 자동화 루프 통합은 모든 추천 소스가 선행돼야 buildable. 단독 wave.
- **W5**: SE-UI
  - SE-UI depends_on SE-DATA·P-5·P-14·P-9 백엔드 라우트 전부 선행(404 회피). app.js 파일군(G-app)이라 W1~W4 의 app.js 패킷(U-1a/b/c/d, P-8, P-12, P-13, P-18, renderProposals)과 머지 시점 충돌 주의 — SE-UI 는 별도 렌더 함수(renderSchedule/입력충족/위험목록)라 함수 경계 충돌은 적으나 render() 라우터·lexicon 동시편집은 rebase 필수. 마지막 wave 로 둠.

## 통합 데이터모델 레지스트리
- [신규 테이블] ai_proposal(P-4-ai-A 만, IF NOT EXISTS 멱등) + idx_proposal_status. P-4-ai-B 채택 시 생성 0(event_log 재사용).
- [신규 테이블] person_skill(P-6, IF NOT EXISTS).
- [신규 테이블] core_knowledge(P-10, IF NOT EXISTS).
- [신규 테이블] core_calculator + calculator_example(P-11, IF NOT EXISTS).
- [ALTER 멱등] core_person ADD COLUMN unit_ref TEXT / capability_label TEXT(P-6, openStore for(ddl) 블록).
- [기존 재사용·DDL 0] artifact_requirement: scope_kind 도메인값 'item_blocking'(P-5)·'deliverable_input'(P-14) 추가 + board_requirements 시드(SE-DATA). scope_kind 자유 TEXT.
- [기존 재사용·코드 화이트리스트만] core_attachment entity_type 검증 배열에 'knowledge' 추가(P-10). 'part'·artifact_type 컬럼은 기존(P-1).
- [기존 재사용·시드만] se_stage_template/se_stage_template_stage/se_deliverable_template(SE-DATA: 파일 부재 시 120_CDR stub 유지).
- [기존 재사용·읽기 0쓰기] core_item/core_meeting+meeting_action_map/guideSummary/bom_edge/part_project_map(P-7/P-8/P-9/P-12/P-19 집계).
- [event_log 컬럼 0 신규] 기존 13컬럼으로 신규 kind 표현. appendEvent: event.from→from_val, event.to→to_val.
- [event_log kind 정본] ai_proposal/ai_proposal_approve/ai_proposal_reject(P-4-ai), recommender_run(P-19), person_skill_set(P-6), knowledge_upsert(P-10), calculator_activate(P-11), ics_export·embed_register(P-17/P-18, data_label='meta'), schedule_spawn·anchor_move·attachment_add(기존, 추가 0), meeting_edit·meeting_delete(B10, store 소유 — no-op 무이벤트).
- [ALTER 멱등] core_meeting ADD COLUMN status TEXT NOT NULL DEFAULT 'active'(B10, 소프트삭제 — meetings() 전 소비자가 active 만 조회).

## 공통 가드 블록 (매 슬라이스 체크)
- ① zero-dependency: node:* 표준 모듈만(http/sqlite/crypto/fs/path/url). 새 npm 0. gateway·외부 라이브러리 코드 import 금지(필요 시 문자열 패턴만 복사 — 예 P-17 ICS, P-11 파서). P-11 공식 평가는 eval/Function/new Function/vm 절대 금지(자작 토크나이저+재귀하강 파서).
- ② 코어 LLM 0%: AI/규칙 산출은 ai_proposal 큐(pending)로만 적재, 실제 도메인 쓰기는 사람 approveProposal 1회 후에만. 자동 쓰기 0. 추천기·검색·계산은 결정적(난수·LLM 추론 0). 감시경계: 개인 numeric 점수/등급 미저장(P-6/P-7).
- ③ 원문 미저장: 첨부·지식·임베드·ICS 는 포인터+sha256+요약/메타만. core_attachment.pointer, core_knowledge.source_ref/pointer, embed_view URL, ICS due/title/project_id — secret·도면 원문 0. 예외: 메일 본문 텍스트는 runtime DB `core_mail.body_text`에 정규화 텍스트로만 저장 가능하며 `_workmeta` 원장/후보큐/보고서에는 복사하지 않는다. llm.mjs 화이트리스트 외부전송은 메타/요약만(이 종합 범위에서 외부전송 신규 0).
  메일 목록/검색 표면은 전체 `body_text` 대신 preview/availability/length만 노출하고, 전체 본문은 단일 메일 상세 조회 또는 행보관 private reading lane에서만 사용한다.
- ④ event_log append-only 라벨링: 모든 쓰기 이벤트에 used_refs[]+data_label 부착. 상태 전이는 UPDATE 가 아니라 새 이벤트 append(P-4-ai-B 의 approve/reject 도 append). 읽기 전용 계산기(riskAlerts/nudges/workload/inputFulfillment/eolImpact 등)는 이벤트 0(미저장 확인).
- ⑤ ALTER try/catch 멱등: 기존 테이블 컬럼 추가는 openStore() for(ddl) try/catch 블록(store.mjs L360-374)에만. 신규 테이블은 SCHEMA DDL 에 CREATE TABLE IF NOT EXISTS. 재기동·중복 upsert(INSERT OR IGNORE / ON CONFLICT)에 에러 0.
- ⑥ gateEval/clearStage/gateMode 신규 함수 0: 게이트 3함수 본문은 reason·rule 인라인 분기만 추가(P-5), 새 게이트 메서드 정의 금지. inputFulfillment/riskAlerts 등은 게이트 함수가 아닌 별도 read-only 메서드(boardCompleteness 로직 재사용).
- ⑦ .registry/.unit 정본 read-only: dev-erp 는 consumer. .registry/.unit YAML 을 fs read·파싱·복제 금지 — ref 문자열(source_ref/unit_ref)만 보관. rbac/시드는 dev-erp 로컬 DB 만.
- ⑧ 슬라이스마다: cd ui-workspace/apps/dev-erp && node --test test/core.test.mjs 전건 green(기존 48 + 신규) + verify_gate Level≥1 + 작업자·모델 표기 commit(예 claude_fable-5)+push + 트리 안정성 확인(HEAD 고정·index.lock 부재·외부 worktree 분리). 동시편집 충돌 징후 시 중단·보고.
- ⑨ owner_decision 필요 항목: 기본값+가정을 명시하고 진행하거나 멈춤(추측 쓰기 금지). 키스톤 #1(ai_proposal 표면) 미정 시 P-4-ai-A·B 중 하나만 머지, P-19 는 표면 머지 전 전체 중단.
- ⑩ public-safe: 합성/메타 데이터만 렌더·저장. secret·업무원문 미접촉. ⑪ lexicon parity(INFRA-004/TEST-003 자동 가드): 신규 라벨 키는 business+fantasy 양쪽에 동일 키 세트로 추가(한쪽만 넣으면 node:test 실패=빌드 차단). 모든 UI 텍스트는 state.lex 경유(하드코딩 0).

## 정합성 수정 (패킷 간 통일 규칙)
- [artifact_type 사전 통일] bom|gerber|digikey|schematic|pcb|block_diagram 6종을 단일 정본 사전으로 고정. ②막는 쪽(artifact_requirement.artifact_type, scope_kind='board_type'), ①낳는 쪽(se_deliverable_template.default_artifact_type, SE-DATA), ⑪input 쪽(deliverable_input.artifact_type, P-14), 첨부(U-1b at_* 라벨, core_attachment.artifact_type)가 모두 이 6종을 공유. SE-DATA 의 시드 파일이 6종 밖 값을 주면 INSERT 는 하되(자유 TEXT) lexicon at_* 매핑은 ??type 폴백. U-1b 의 lexicon at_* 키(at_bom/at_gerber/at_digikey/at_schematic/at_pcb/at_block_diagram)를 정본 라벨로 삼고, U-1d 는 state.lex[`at_${type}`]??type 폴백으로 U-1b 미머지 상태에서도 안전(의존 끊음).
- [ai_proposal 스키마·시그니처 통일] P-4-ai-A(전용 테이블)와 P-4-ai-B(event_log 재사용)는 외부 시그니처를 동일하게: createProposal({source,kind,target_ref,payload,summary,used_refs,data_label})→{ok,id,status:'pending'}; approveProposal(id,{decided_by})→{ok,applied_ref,result}; rejectProposal(id,{decided_by,reason})→{ok}; proposals({status}). PROPOSAL_KINDS 화이트리스트 동일: ['create_item','add_attachment_type','set_artifact_requirement','link_part_project']. 둘 중 하나만 머지(owner 키스톤 #1). P-19/P-6/P-10/P-11 호출부는 어느 옵션이든 무변경. server.mjs 라우트(/api/proposals GET·POST, /approve, /reject)도 옵션 무관 동일.
- [event_log kind 네이밍 통일] 액션은 동사_명사 스네이크: ai_proposal_approve/ai_proposal_reject(전이), recommender_run(P-19), person_skill_set(P-6), knowledge_upsert(P-10), calculator_activate(P-11), ics_export(P-17), embed_register(P-18). 제안 적재는 kind='ai_proposal'(B 옵션) 또는 ai_proposal 테이블 행(A 옵션). 중복 기록 금지: store 메서드 내부에서 appendEvent 하면 server 라우트에서 추가 appendEvent 하지 않음(P-4-ai approve/reject, P-6 skill_set, P-3 stock_txn 등 동일 규칙).
- [appendEvent 필드 매핑 정정] store.appendEvent 는 event.from→from_val, event.to→to_val 로 매핑(store.mjs L411-412). 패킷들이 'to:applied_ref','from:prev' 로 쓰는 것은 정상(컬럼명 from_val/to_val 로 들어감). 테스트가 event.to_val 을 읽는 것도 정상(recentEvents 는 row 그대로 반환, used_refs 만 JSON.parse).
- [fixture opt-in — 수동 verify 경로 정정] server.mjs 는 빈 DB 에 합성 fixture 를 자동 적재하지 않는다. `data/real_meta.json` 자동 ingest 도 기본 DB 에만 적용한다. 따라서 합성 데모가 필요한 모든 '수동 verify' acceptance 는 node server.mjs --db :memory: --fixture 로 기동한다. curl 검증도 --db :memory: --fixture 기준. node:test 는 freshStore()=openStore(':memory:')+loadFixture 라 영향 없음.
- [se_process_seed.json 부재 — SE-DATA fallback 확정] data/ 에 se_process_seed.json 현재 없음(dev-erp.db, real_meta.json 만). SE-DATA 는 existsSync false 경로로 기존 120_CDR stub(3-stage 정의·3-deliverable: 회로도 초안 -7/schematic, CDR 패키지 0/null, 시험계획서 14/null) 그대로 실행. 기존 P-2 테스트 회귀 0. store.mjs 는 현재 node:fs 미import → SE-DATA 가 import { readFileSync, existsSync } from 'node:fs' + path/url 추가(가드① 유지).
- [lexicon 키 충돌·중복 제거] 같은 라벨을 여러 패킷이 추가하지 않도록 소유권 고정: sched_*(U-1a 소유), att_*/at_*(U-1b 소유), gate_missing_summary(U-1d), bucket_*(P-8), reports_open(P-12), recipe_*(P-13), embed_*(P-18), gate_reason_blocking_items_open(P-5), tab_schedule/hub_*(U-1c), input_generate_*(P-14), risk_*(P-9), nav_team/cap_*/nudge_*(P-6), workload_*/meeting_open_*/col_*(P-7), kn_*(P-10), calc_*(P-11), rec_*(P-19), schedule_title/apply/anchor/template/anchor_date/empty(SE-UI 전용, P-5/P-14/P-9 추가분과 키 충돌 금지), calv_*/tile_month_cal(B10 — cal_export/cal_export_hint 는 P-17 기소유라 미접촉). SE-UI 는 이미 존재하는 키(gate_reason_blocking_items_open, input_generate_btn 등)를 재추가하지 않음. 모든 추가는 business+fantasy 양쪽 동시(TEST-003).
- [gateEval detail 구조 계약 고정] gateEval 의 required_artifacts_missing reason 은 {code,n,detail:[{board_id,board,missing:[artifact_type...]}]}(store.mjs L797 실측). U-1d 는 d.board/d.missing 을 읽음 — 일치. P-5 의 blocking_items_open detail 은 {stage_code,mode}(배열 아님) 로 구조가 다름 — UI(U-1d/SE-UI)는 두 reason 을 분기 처리(required_artifacts_missing=보드별 폴침, blocking_items_open=빨강 badge만).
- [entity_type 화이트리스트 단일 소스] core_attachment 검증 배열은 현재 ['item','project','purchase','meeting','part'] 이며, store module around L1210 에서 확인한다. 'part'는 P-1 기 추가. P-10 만 'knowledge' 를 1회 추가. U-1b 는 기존 'part' 사용(추가 0). 중복 편집 금지.
- [render() 라우터·virtual view 등록 통일] 신규 가상 뷰(mod:schedule U-1a, mod:recipe P-13, mod:embeds P-18, mod:proposals P-19)는 NAV_LAYOUT 미편입(navButton 이 modules 목록에서 못 찾아 빈 버튼 되는 회귀 회피) — gates/홈/guide 상단 진입 버튼으로만. render()(L1757~)의 if(state.view==='mod:X') 블록을 mod:gates(L1761) 패턴 그대로 추가. SE-UI 의 schedule UI 는 별 nav 모듈 미등록(게이트 화면 하위 섹션 또는 mod:schedule 재사용).

## owner 결정 인덱스 (어느 패킷이 어느 결정에 막히나)
- 키스톤 #1 (ai_proposal 전용 테이블 vs event_log 재사용): P-4-ai-A(전용 테이블, 4클러스터 권고=기본) ↔ P-4-ai-B(event_log 재사용, 대안). 택1 머지. → P-19(자동화 루프 전체)가 이 표면에 종속, 표면 미머지면 P-19 중단. P-14(/api/inputs/generate placeholder)·P-15(클러스터 외 치환 제안)도 이 표면 미정 시 분석/placeholder 만.
- #4 (재고 출고 역할매핑 + 가용초과 거부 vs 마이너스): P-3(RES 클러스터, 이 종합 범위 밖). 기본=가용초과 거부(insufficient_stock)·역할 정의만 시드(계정 부여 owner 수동)·익명 출고 불가.
- #5 (자동화 경계 — 어디까지 자동/어디부터 사람): P-19. 기본=모든 적용은 사람 approve 1회, 추천은 수동 트리거 스캔(cron defer).
- #6 (능력 어휘 1벌 — capability_label 자유어휘 vs .registry/skills id vs class assign vs species bias): P-6. 기본=짧은 자유 capability_label + 선택 source_ref 에 .registry ref. 개인 점수는 어떤 경우에도 미저장.
- #7 (core_knowledge vs core_faq 경계 + .registry/knowledge 9정본 시드 여부): P-10. 기본=FAQ(짧은 Q/A)·knowledge(출처기반 카드) 분리, 9정본은 ref 시드만(파일 미복제). RAG 외부 직접호출 defer.
- #8 (라이브러리 리비전 식별 + 캐비넷/baseline 깊이 + baseline≠승인): P-4-lib/P-16(RES 클러스터, 범위 밖). 기본=revision 자유문자열·1-hop 깊이·baseline 은 기록(승인/릴리스 아님 UI 명시).
- #10 (계산기 안전 파서 범위 + example 회귀검증 강제): P-11. 기본=사칙+^+괄호+변수+화이트리스트 Math 함수만, 회귀검증 통과 없이 active 승격 금지(eval/Function 절대 금지).
- [가정 명시로 진행, 멈춤 아님] P-5 item_blocking artifact_type 와일드카드='any'·mode='hard'(세분 차단 사유별 규칙 defer), P-9 severity 임계(달력일·critical=연체/risk=<=3&&pct<70 또는 <=7&&pct<50/watch=<=14&&pct<40·마일스톤 1단계 상향, 영업일·CDR전용 defer), P-14 입력증거=과제 링크 보드 첨부 합집합·deliverable_input.mode='soft', U-1a 앵커 미입력 시 due=null 허용, P-8 마감 있는 할일만(due 없는 휴가/프로젝트 제외).
