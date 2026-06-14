# SE-UI — app.js 와이어링 — 게이트 reason 라벨 정합 + 스케줄 화면 + input 충족 버튼 + 납기위험 목록(P-5/P-14/P-9 read·post 소비)

- **phase**: GATE/스케줄
- **depends_on**: SE-DATA, P-5, P-14, P-9
- **parallel_group**: G-app
- **owner_decision**: schedule UI 배치=게이트 화면 하위 섹션(기본, 새 nav 모듈 미등록). 새 nav 승격은 owner 요청 시.

## allowed_write_paths
- /Volumes/OPENCLAW_WS/Soulforge/ui-workspace/apps/dev-erp/static/app.js
- /Volumes/OPENCLAW_WS/Soulforge/ui-workspace/apps/dev-erp/src/lexicon.mjs

## summary
GATE/스케줄 백엔드(SE-DATA/P-5/P-14/P-9)를 app.js 에 와이어링한다. app.js 는 별 파일군(G-app)이라 G-store 와 동시 충돌 없이, depends_on 으로 백엔드 라우트 선행. (1) renderGates reason 매핑은 이미 L[`gate_reason_${r.code}`] 라 P-5 새 코드 자동 렌더 — 라벨 정합만 확인. (2) renderSchedule(또는 게이트 하위 섹션): /api/schedule/templates·apply·anchor. (3) input 충족 버튼: /api/inputs/fulfillment 읽어 deliverable 행 활성/비활성, 클릭 시 /api/inputs/generate→202 pending 토스트. (4) 납기위험: /api/risk severity 배지. 모든 라벨 lexicon 경유. ※ U-1a 가 renderSchedule 을 이미 만들면 SE-UI 는 입력충족·위험목록만 추가(중복 정의 금지, U-1a renderSchedule 재사용).

## data_model
- DDL/ALTER 없음 — UI 전용. 소비 라우트: GET /api/schedule/templates, /api/inputs/fulfillment?project, /api/risk?project, /api/gates?project. POST /api/schedule/apply, /api/schedule/anchor, /api/inputs/generate.
- lexicon: P-5/P-14/P-9 가 이미 추가한 라벨(gate_reason_blocking_items_open, input_generate_*, risk_*)은 중복 추가 금지. 스케줄 화면 전용 라벨만(U-1a 미머지 경로 대비 schedule_title/apply/anchor/template/anchor_date/empty — 단 U-1a 의 sched_* 와 키 충돌 금지). U-1a 머지 시 sched_* 재사용하고 schedule_* 신규 0.

## code_changes
- app.js: U-1a 가 renderSchedule 을 만들었으면 재사용; 없으면 신규 async renderSchedule()(/api/schedule/templates+/api/summary Promise.all, 과제·템플릿 select+앵커 input+'적용', post('/api/schedule/apply'·'/api/schedule/anchor')). esc/L 사용.
- app.js: renderGates 안 deliverable/input 충족 섹션 — 선택 과제 /api/inputs/fulfillment 읽어 deliverable 행에 버튼: fulfilled 면 enabled(L.input_generate_btn), 아니면 disabled+L.input_generate_blocked+missing 라벨. 클릭→post('/api/inputs/generate',{project_id,deliverable_name}); 202(queued:false) 면 토스트 L.input_pending_keystone(실제 생성 안 됨).
- app.js: 콕핏(renderHome gates 블록 근처) 또는 게이트 상단에 /api/risk?project 읽어 severity 배지 목록(critical=red, risk=red dim, watch=amber + L.risk_*). 빈 목록 L.empty_risk.
- app.js render() 라우터: mod:schedule 분기(U-1a 미존재 시 추가, 존재 시 그대로). schedule UI 배치=게이트 화면 하위 섹션 기본(modules.mjs 변경 금지).
- lexicon.mjs: 스케줄 화면 전용 라벨 필요 시 business+fantasy 양 블록에 추가(P-5/P-14/P-9·U-1a 키 충돌 금지).

## ui_changes
- renderGates: reason 표시 무변경(자동), input 충족 버튼 섹션(과제 선택 시). renderSchedule(U-1a 재사용 또는 신규). renderHome/renderGates: 납기위험 severity 배지. 신규 텍스트 state.lex 경유(하드코딩 0).

## test_cases
- 수동 UI 검증(app.js 는 브라우저 렌더, node:test 대상 아님). 회귀: 기존 node:test 전건 green 유지. 브라우저 QA: (1) item_blocking 정의 단계가 '하드 차단 사유 미해결' reason 빨강. (2) 스케줄 화면 120_CDR 적용 시 산출물 3건 spawn 후 목록 반영. (3) input 충족 버튼 미충족 시 비활성, 충족 시 활성·클릭 'pending' 안내(생성 안 됨). (4) 납기위험 severity 배지.
- lexicon 회귀(node:test): TEST-003 가 신규 라벨 키를 business/fantasy 양쪽에서 일치로 검사 통과.

## acceptance_checks
- cd ui-workspace/apps/dev-erp && node --test test/core.test.mjs 전건 green(app.js 변경이 백엔드 테스트 무영향).
- lexicon 신규 라벨 business+fantasy 양 모드 존재(parity).
- input '생성' 버튼이 실제 산출물 생성 안 함(202 pending 안내만 — 키스톤 차단 UI 준수).
- 모든 신규 UI 텍스트 lexicon 경유(하드코딩 0).
- renderGates 기존 동작(게이트 통과/모드 전환) 회귀 0.

## stop_conditions
schedule 를 별 nav 모듈로 등록할지 게이트 하위 섹션으로 둘지 — modules.mjs 에 schedule 모듈 없고 owner 가 새 nav 명시 요구 안 하면 게이트 하위 섹션으로 진행(modules.mjs 변경 금지). app.js 가 백엔드 라우트(G-store)보다 먼저 머지되면 404 — depends_on 위반 시 멈춤. U-1a 와 renderSchedule 중복 정의 위험 시 U-1a 본 재사용·중복 금지.

## guards
- ② 코어 LLM 0%(input '생성' 은 202 pending 안내만, UI 자동 쓰기 트리거 0)
- ④ event_log append-only(POST 는 기존 server 라우트 경유)
- ③ 원문 미저장(UI 는 메타/포인터만)
- ⑩ public-safe(합성/메타만, secret·원문 미접촉)
- ⑪ 라벨 lexicon 경유(하드코딩 0)
- ⑧ node:test 전건 green + 표기 commit+push
