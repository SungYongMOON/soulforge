# U-1c — app.js: 마일스톤 날짜 변경 인라인 — 과제 허브 일정 탭에서 setAnchor 호출

- **phase**: UI
- **depends_on**: U-1a
- **parallel_group**: appjs-core-scaffold
- **owner_decision**: none (기본=1-hop·달력일, store setAnchor 현 동작).

## allowed_write_paths
- /Volumes/OPENCLAW_WS/Soulforge/ui-workspace/apps/dev-erp/static/app.js
- /Volumes/OPENCLAW_WS/Soulforge/ui-workspace/apps/dev-erp/src/lexicon.mjs

## summary
renderProjectHub() 탭 배열에 'schedule' 추가하고 hubSchedule(mount,p) 구현: 해당 과제 /api/items 중 anchor_stage_code 있는 산출물 할일을 anchor 별로 묶어 보여주고, 각 앵커마다 date input + '날짜 적용'→POST /api/schedule/anchor. U-1a 가 lexicon sched_* 를 먼저 추가하므로 depends_on. 같은 app.js scaffold(render·tabs) 편집이라 U-1a 와 동일 parallel_group(순차).

## data_model
- (없음)

## code_changes
- static/app.js renderProjectHub() tabs 배열에 'schedule' 추가, 탭 라벨 L.tab_schedule.
- static/app.js renderProjectHub(): 'if (tab === "schedule") return hubSchedule(mount, p);' 분기(hubHistory 분기 옆).
- static/app.js 신규 async hubSchedule(mount,p): const items=await api(`/api/items?project=${encodeURIComponent(p.id)}`); const anchored=items.filter(i=>i.anchor_stage_code); anchor_stage_code 별 그룹화; 각 그룹 헤더 date input(value=대표 anchor_date)+'날짜 적용', 본문 산출물 행(title·due·offset_days); click→post('/api/schedule/anchor',{project_id:p.id,anchor_stage_code:code,date:inputVal}).then(r=>r.json())→shifted 표시 후 render(); anchored 0 이면 빈 상태+'일정 적용'(state.view='mod:schedule').
- src/lexicon.mjs business+fantasy 양쪽: tab_schedule(일정/운명표), hub_anchor_apply(마일스톤 날짜 적용/기준일 봉인), hub_no_schedule(적용된 SE 일정 없음 — 템플릿을 적용하세요/직조된 운명 없음).

## ui_changes
- 과제 허브 탭 '일정' 추가. hubSchedule: anchor 별 그룹(date input)·산출물 행, shifted 표시, anchored 0 이면 일정 적용 링크.

## test_cases
- TEST-003 lexicon parity: tab_schedule/hub_anchor_apply/hub_no_schedule 양쪽 일치.
- 신규 node:test 'U-1c: items() 가 anchor_stage_code/anchor_date/offset_days 노출': freshStore()+loadFixture(store); const proj='PRJ-A'; store.applyTemplate(proj,'120_CDR',{anchorDates:{'120':'2026-08-01'}}); const rows=store.items({project:proj}); assert.ok(rows.some(r=>r.anchor_stage_code)&&rows.some(r=>'offset_days' in r)).
- 신규 node:test 'U-1c: setAnchor 가 같은 앵커만 전파, 완료·수정 보호': freshStore()+loadFixture(store); store.applyTemplate('PRJ-A','120_CDR',{anchorDates:{'120':'2026-08-01'}}); const rows=store.items({project:'PRJ-A'}).filter(r=>r.anchor_stage_code==='120'); store.setItemStatus(rows[0].id,'done'); store.db.prepare("UPDATE core_item SET due_overridden=1 WHERE id=?").run(rows[1].id); const r=store.setAnchor('PRJ-A','120','2026-09-01'); assert.equal(r.shifted, rows.length-2).

## acceptance_checks
- node --test 전건 green.
- node server.mjs --db :memory: 기동 후 과제 허브→일정 탭→마일스톤 날짜 변경→산출물 due 가 offset 만큼 재계산(수동 verify), 완료/사람수정 항목 불변.
- anchored 없으면 빈 상태에서 일정 적용 화면 점프.

## stop_conditions
items() 결과에 anchor_stage_code 미노출이면(현재 i.* SELECT 라 노출됨) 서버 라우트 확장 별 패킷으로 분리·중단. 2-hop 캐스케이드 요구 시 MVP(1-hop) 벗어남 → 중단·owner 확인.

## guards
- ② 코어 LLM 0%
- ④ event_log append-only(setAnchor anchor_move 이미 기록)
- ⑥ 게이트 신규 함수 0
- ① zero-dependency
- ⑩ public-safe
- ⑪ lexicon parity
- ⑧ node:test 전건 green + 표기 commit+push
