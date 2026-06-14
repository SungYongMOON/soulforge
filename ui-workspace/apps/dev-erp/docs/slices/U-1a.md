# U-1a — app.js: SE 스케줄러 위저드 화면(템플릿 적용 + 마일스톤 앵커 날짜) — gates 진입 renderSchedule 뷰

- **phase**: UI
- **depends_on**: 없음
- **parallel_group**: appjs-core-scaffold
- **owner_decision**: none (기본=120_CDR 단일 템플릿, 앵커 미입력 시 due=null 허용 — store 현 동작).

## allowed_write_paths
- ui-workspace/apps/dev-erp/static/app.js
- ui-workspace/apps/dev-erp/src/lexicon.mjs

## summary
이미 있는 라우트 /api/schedule/templates(GET)·/api/schedule/apply(POST)·/api/schedule/anchor(POST) 를 화면에 연결한다. 신규 가상 뷰 'mod:schedule' 를 render() 라우터에 등록하고 renderSchedule() 추가: 과제 select + 템플릿 카드(scheduleTemplates) + '템플릿 적용' + 마일스톤별 date input + '날짜 적용'. 모든 라벨 state.lex 경유. gates 화면 상단에 진입 버튼. NAV_LAYOUT 미편입(빈 버튼 회귀 회피).

## data_model
- (없음)

## code_changes
- static/app.js render()(L1810 근처, mod:reports 블록 패턴): 'if (state.view==="mod:schedule") { $("#viewTitle").textContent=state.lex.sched_title; logView(state.view); return renderSchedule(); }' 추가.
- static/app.js renderGates() 상단(modeBtns 옆): '<button id="openSched" class="fav-chip">${L.sched_open}</button>' + click→{state.view='mod:schedule';render();}.
- static/app.js 신규 async renderSchedule(): const tpls=await api('/api/schedule/templates'); const sum=await api('/api/summary'); state.schedProject ??=(sum.projects.find(p=>p.class==='active')||sum.projects[0])?.id; state.schedAnchors ??={}; 과제 select(change→state.schedProject), template 카드(stages·deliverables 표), 마일스톤 stage_code별 date input(state.schedAnchors[code]); '적용'→post('/api/schedule/apply',{project_id:state.schedProject,template_key:t.key,anchorDates:state.schedAnchors}).then(r=>r.json())→created 표시 후 render(); 마일스톤 '날짜 적용'→post('/api/schedule/anchor',{project_id:state.schedProject,anchor_stage_code,date}).then(r=>r.json())→shifted 표시; 뒤로가기→state.view='mod:gates'.
- src/lexicon.mjs business+fantasy 양쪽: sched_title(SE 일정 적용/운명 직조), sched_open(일정 템플릿 적용/운명 직조 시작), sched_apply(템플릿 적용/운명 새기기), sched_anchor_apply(마일스톤 날짜 적용/기준일 봉인), sched_milestone(마일스톤/기준 관문), sched_deliverable(산출물/전리품), sched_offset(기준일 ±일/기준 ±일), sched_created(개 생성됨/개 출몰), sched_shifted(개 마감 재계산/개 운명 이동), sched_pick_project(과제 선택/던전 선택), sched_back(게이트로/관문으로).

## ui_changes
- renderGates 상단 '일정 템플릿 적용' 버튼(#openSched).
- renderSchedule: 과제 select + 템플릿 카드(단계/산출물 표) + 마일스톤 date input + '템플릿 적용'/'날짜 적용', created/shifted 인라인, 뒤로가기.

## test_cases
- 기존 TEST-003(lexicon parity) 자동 가드: 신규 sched_* 11키가 business+fantasy 양쪽 동일해야 통과.
- 신규 node:test 'U-1a: schedule 라우트가 화면 데이터로 충분': freshStore()+loadFixture(store); const proj=store.summary(new Date().toISOString().slice(0,10))[0].id; assert.equal(store.applyTemplate(proj,'120_CDR',{anchorDates:{'120':'2026-08-01'}}).created.length,3); assert.ok(store.scheduleTemplates()[0].deliverables.length>=3).

## acceptance_checks
- cd ui-workspace/apps/dev-erp && node --test test/core.test.mjs 전건 green.
- node server.mjs --db :memory: 기동 후 게이트→'일정 템플릿 적용'→과제 선택→마일스톤 날짜→'템플릿 적용' 시 산출물 할일이 due 와 함께 생김(수동 verify).
- 라벨이 모두 사전 경유(business/fantasy 토글 시 깨짐 없음).

## stop_conditions
navButton 이 mod:schedule 을 modules 목록에서 못 찾아 빈 버튼이 되면 NAV_LAYOUT 편입 철회하고 gates 진입 버튼만 유지. applyTemplate 응답이 created 외 필드 의존 필요해지면 중단하고 서버 라우트 확장 별 패킷.

## guards
- ① zero-dependency(node:* fetch 만)
- ② 코어 LLM 0%(사람 버튼 클릭)
- ④ event_log append-only(applyTemplate/setAnchor 가 이미 schedule_spawn·anchor_move 기록)
- ⑥ 게이트 신규 함수 0
- ⑩ public-safe
- ⑪ lexicon parity + 라벨 사전 경유
- ⑧ node:test 전건 green + 표기 commit+push + 트리 안정성
