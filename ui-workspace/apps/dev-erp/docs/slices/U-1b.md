# U-1b — app.js: 보드 첨부 화면 — entity_type='part' + artifact_type 선택, /api/attachments POST + 완결성 표시

- **phase**: UI
- **depends_on**: 없음
- **parallel_group**: appjs-boards-attach
- **owner_decision**: none (기본=board_type 'board' 필수 6종, 현 fixture 시드).

## allowed_write_paths
- ui-workspace/apps/dev-erp/static/app.js
- ui-workspace/apps/dev-erp/src/lexicon.mjs

## summary
renderBoards()(L453) BOM 화면에 '필수 기술자료 첨부' 섹션 추가. 선택 board(sel)에 대해: (1) GET /api/parts/completeness?part 로 required/satisfied/missing 표시 (2) 첨부 폼(name·pointer+artifact_type select 6종)→POST /api/attachments {entity_type:'part',entity_id:sel,name,pointer,artifact_type} (3) GET /api/attachments?entity_type=part&entity_id 목록. 원문 미저장(addAttachment 현 계약).

## data_model
- (없음)

## code_changes
- static/app.js renderBoards()(L453): const sel 결정 직후 'const comp = sel ? await api(`/api/parts/completeness?part=${encodeURIComponent(sel)}`) : null; const atts = sel ? await api(`/api/attachments?entity_type=part&entity_id=${encodeURIComponent(sel)}`) : [];'.
- static/app.js renderBoards(): BOM 표 뒤에 완결성 칩(comp.required 각각 satisfied=초록·missing=빨강) + 첨부 폼(input#attName,input#attPtr,select#attType 6옵션,button#attAdd) + 첨부 목록 표.
- static/app.js renderBoards(): #attAdd click → name/pointer trim, artifact_type=$('#attType').value; if(!name||!pointer)return; await post('/api/attachments',{entity_type:'part',entity_id:sel,name,pointer,artifact_type}); render();
- src/lexicon.mjs business+fantasy 양쪽: att_required(필수 기술자료/필수 장비), att_name(파일명/물품명), att_pointer(경로/URL(원문 미저장)/위치 표식), att_type(자료 유형/장비 종류), att_add(첨부 등록/장비 등재), att_satisfied(충족/갖춤), att_missing(미충족/결여), att_list(등록된 기술자료/보관 장비), at_bom(BOM/부품목록), at_gerber(Gerber/제작판), at_digikey(Digikey/조달표), at_schematic(회로도/설계도), at_pcb(PCB/기판), at_block_diagram(블록도/배치도).

## ui_changes
- renderBoards: 완결성 칩 줄(6종 satisfied 초록/missing 빨강) + 첨부 폼(파일명·경로·유형 select)·'첨부 등록' + 등록된 기술자료 표(파일명·유형·pointer+복사).

## test_cases
- TEST-003 lexicon parity 자동 가드: 신규 att_*/at_* 13키 양쪽 일치.
- 신규 node:test 'U-1b: part 첨부→완결성 충족 단조 감소': freshStore()+loadFixture(store); assert.equal(store.boardCompleteness('pt-board').missing.length,6); for(const [t] of [['bom'],['gerber'],['digikey'],['schematic'],['pcb'],['block_diagram']]){ const before=store.boardCompleteness('pt-board').missing.length; store.addAttachment({entity_type:'part',entity_id:'pt-board',name:t+'.f',pointer:'/'+t,artifact_type:t}); assert.ok(store.boardCompleteness('pt-board').missing.length<before); } assert.equal(store.boardCompleteness('pt-board').missing.length,0).

## acceptance_checks
- node --test 전건 green.
- node server.mjs --db :memory: 기동 후 보드/BOM 화면 board 선택→완결성 6종 빨강→bom 첨부 등록→해당 칩 초록(수동 verify).
- 게이트 화면 required_artifacts_missing reason 숫자가 첨부만큼 감소(연계 verify).

## stop_conditions
/api/parts/completeness 가 part_not_found(404) 반환하면(board 아닌 part 선택) UI 빈 상태 폴백·에러 미던짐. artifact_type 6종 외 확장 필요하면 중단·setArtifactRequirement 시드 결정.

## guards
- ③ 원문 미저장(pointer+요약, addAttachment 현 계약)
- ② 코어 LLM 0%
- ④ event_log append-only(addAttachment 가 attachment_add 이미 기록)
- ① zero-dependency
- ⑩ public-safe
- ⑪ lexicon parity
- ⑧ node:test 전건 green + 표기 commit+push
