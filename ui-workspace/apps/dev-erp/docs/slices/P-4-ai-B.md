# P-4-ai-B — 키스톤 옵션B(대안): event_log kind='ai_proposal' 재사용 — 신규 테이블 0, A 와 동일 시그니처

- **phase**: AI-foundation
- **depends_on**: 없음
- **parallel_group**: store-ai-proposal
- **owner_decision**: 키스톤 #1: 이 패킷은 'event_log 재사용' 대안. 기본 권고는 A. owner 가 명시적으로 '테이블 늘리지 말라' 한 경우에만 B 채택. A·B 동시 머지 금지.

## allowed_write_paths
- /Volumes/OPENCLAW_WS/Soulforge/ui-workspace/apps/dev-erp/src/store.mjs
- /Volumes/OPENCLAW_WS/Soulforge/ui-workspace/apps/dev-erp/server.mjs
- /Volumes/OPENCLAW_WS/Soulforge/ui-workspace/apps/dev-erp/test/core.test.mjs

## summary
전용 테이블 대신 event_log 를 제안 큐로 재사용한다. 제안 1건=event_log 행 kind='ai_proposal'(item_ref=prop_id, to_val='pending', note=JSON 메타). 상태 전이는 approve/reject 이벤트 append. 새 테이블 0. A 와 동일한 외부 시그니처(createProposal/approveProposal/rejectProposal/proposals)를 노출해 P-6/10/11/19 가 옵션 무관 호출. owner 가 '테이블 늘리지 말라' 할 때만 채택.

## data_model
- 신규 테이블 0. event_log kind='ai_proposal'(적재)/'ai_proposal_approve'/'ai_proposal_reject'(전이). prop_id=item_ref 문자열. note 에는 메타 인자만(JSON {kind,target_ref,payload,summary}) — secret·원문 금지. 상태: prop_id 에 전이 이벤트 있으면 그 상태, 없으면 pending.
- PROPOSAL_KINDS 화이트리스트 A 와 동일.

## code_changes
- store.mjs Store: static PROPOSAL_KINDS 추가(A 동일).
- createProposal(...): kind 가드 동일. prop_id=`prop_${randomBytes(5).toString('hex')}`. appendEvent({actor_ref:source,actor_kind:'system',kind:'ai_proposal',item_ref:prop_id,to:'pending',note:JSON.stringify({kind,target_ref,payload,summary}),used_refs,data_label:data_label??'real'}). 반환 {ok:true,id:prop_id,status:'pending'}. 도메인 쓰기 0.
- approveProposal(id,{decided_by='owner'}): event_log 에서 item_ref=id AND kind='ai_proposal' 최신 적재 조회, 없으면 {error:'proposal_not_found'}; 이미 approve/reject 이벤트 있으면 {error:'not_pending'}. note JSON.parse 로 kind/payload 복원, A 와 동일 switch 로 도메인 메서드 호출. 성공 시 appendEvent({actor_kind:'human',kind:'ai_proposal_approve',item_ref:id,to:applied_ref,used_refs,data_label:'real'}). 반환 {ok:true,applied_ref,result}.
- rejectProposal(id,{decided_by,reason}): pending 가드. appendEvent({actor_kind:'human',kind:'ai_proposal_reject',item_ref:id,note:reason,data_label:'real'}).
- proposals({status='pending'}): event_log kind IN('ai_proposal','ai_proposal_approve','ai_proposal_reject') 를 prop_id 별 최신상태 계산 후 status 필터, 적재 note JSON.parse 동봉.
- server.mjs 라우트 4개: A 와 동일 경로/메서드. store 메서드만 교체.

## test_cases
- 'P-4-ai-B: event_log 재사용 pending 적재(테이블 0)': freshStore()+loadFixture(); const before=store.counts().events; store.createProposal({source:'rule',kind:'create_item',payload:{project_id:'PRJ-A',title:'X'}}); assert.equal(store.proposals({status:'pending'}).length,1); assert.ok(store.counts().events>before).
- 'P-4-ai-B: approve 가 도메인 쓰기+전이': loadFixture; const id=store.createProposal({source:'m',kind:'create_item',payload:{project_id:'PRJ-A',title:'승인생성'}}).id; assert.ok(store.approveProposal(id).ok); assert.equal(store.items({project:'PRJ-A'}).filter(i=>i.title==='승인생성').length,1); assert.equal(store.proposals({status:'pending'}).length,0).
- 'P-4-ai-B: reject 후 not_pending 재시도 거부': loadFixture; const id=store.createProposal({source:'m',kind:'create_item',payload:{project_id:'PRJ-A',title:'Y'}}).id; assert.ok(store.rejectProposal(id,{reason:'dup'}).ok); assert.equal(store.approveProposal(id).error,'not_pending').

## acceptance_checks
- node --test 전건 green(48+3).
- 신규 CREATE TABLE 0건 grep 확인(event_log 재사용).
- createProposal/approveProposal/rejectProposal/proposals 시그니처가 P-4-ai-A 와 동일(호출부 무변경).

## stop_conditions
note 에 업무 원문/secret 이 들어가면 중단(메타 인자만). pending 상태 판정이 모호하면 중단하고 A 권고. owner 가 A 채택 신호면 이 패킷 멈춤.

## guards
- ② 코어 LLM 0%(자동 쓰기 0)
- ④ event_log append-only(used_refs[]+data_label, note 메타만)
- ⑤ 신규 테이블 0
- ⑧ node:test 전건 green + 표기 commit+push
- ⑨ 키스톤 #1 기본값+가정
- ⑩ public-safe
