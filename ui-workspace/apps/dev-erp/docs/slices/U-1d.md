# U-1d — app.js: renderGates 완결성 강조 — required_artifacts_missing 빨강 badge + 보드별 누락 detail 폴침

- **phase**: UI
- **depends_on**: 없음
- **parallel_group**: appjs-gates
- **owner_decision**: none

## allowed_write_paths
- /Volumes/OPENCLAW_WS/Soulforge/ui-workspace/apps/dev-erp/static/app.js
- /Volumes/OPENCLAW_WS/Soulforge/ui-workspace/apps/dev-erp/src/lexicon.mjs

## summary
renderGates()(L1683 영역, render() 의 mod:gates) reason 렌더 강화. store gateEval 는 required_artifacts_missing reason 에 detail:[{board_id,board,missing:[artifact_type...]}] 반환(store.mjs L797 실측) → 빨강 badge + 보드별 누락 목록(details 폴침)으로 분리. 다른 reason 은 기존대로. at_* 라벨(U-1b) 있으면 재사용, 없을 때 state.lex[`at_${type}`]??type 폴백(의존 끊음).

## data_model
- (없음)

## code_changes
- static/app.js renderGates() reason() 분기: required_artifacts_missing 이면 `<span class="badge red">${L.gate_reason_required_artifacts_missing} ${r.n}</span>` 빨강, 그 외 기존 텍스트.
- static/app.js renderGates() stage row 마지막 td: s.reasons 중 required_artifacts_missing 의 detail 있으면 `<details class="gate-missing"><summary>${L.gate_missing_summary} (${r.n})</summary>` + detail.map(d=>`${esc(d.board)}: ${d.missing.map(t=>state.lex[`at_${t}`]??t).join(", ")}`).join("<br>") + `</details>`.
- src/lexicon.mjs business+fantasy 양쪽: gate_missing_summary(누락 기술자료 보기/결여 장비 보기). at_* 키는 U-1b 미반영이어도 ??type 폴백으로 타입코드 출력.

## ui_changes
- renderGates: required_artifacts_missing 빨강 badge 분리 + 누락 보드·기술자료 details(폴침), 다른 reason 회색 텍스트 유지. fantasy boss-hp 연출 공존·보존.

## test_cases
- TEST-003 lexicon parity: gate_missing_summary 양쪽 일치.
- 신규 node:test 'U-1d: gateEval reason 에 detail 동봉': freshStore()+loadFixture(store); const stage=store.gates({project:'PRJ-A'}).find(s=>s.stage_code==='상세설계'); const r=stage.reasons.find(x=>x.code==='required_artifacts_missing'); assert.equal(r.n,6); assert.ok(Array.isArray(r.detail)&&r.detail[0].missing.length>0).

## acceptance_checks
- node --test 전건 green.
- node server.mjs --db :memory: 기동 후 게이트 화면 PRJ-A 상세설계 단계가 빨강 '필수 기술자료 누락 6' + 폴치면 '수신부 보드: BOM, Gerber...'(수동 verify).
- U-1b 로 첨부 등록 후 해당 단계 빨강 badge 숫자 감소(연계 verify).

## stop_conditions
gateEval detail 필드명이 바뀌면(현재 board/board_id/missing) 중단·store 계약 재확인. reason 렌더 변경이 fantasy boss-hp 연출을 깨면 롤백.

## guards
- ⑥ gateEval/clearStage/gateMode 신규 함수 0(reason 렌더만, store 무변경)
- ② 코어 LLM 0%
- ① zero-dependency
- ⑩ public-safe
- ⑪ lexicon parity
- ⑧ node:test 전건 green + 표기 commit+push
