# P-4-ai-A — 키스톤 옵션A(권고): ai_proposal 전용 테이블 — createProposal→pending, approveProposal→화이트리스트 쓰기, rejectProposal

- **phase**: AI-foundation
- **depends_on**: 없음
- **parallel_group**: store-ai-proposal
- **owner_decision**: 키스톤 #1: ai_proposal 전용 테이블 vs event_log 재사용. 기본=전용 테이블(권고). 가정: 제안은 자동 적재 가능, 쓰기는 항상 사람 approve 1회. A·B 동시 머지 금지.

## allowed_write_paths
- ui-workspace/apps/dev-erp/src/store.mjs
- ui-workspace/apps/dev-erp/server.mjs
- ui-workspace/apps/dev-erp/test/core.test.mjs

## summary
AI/규칙 산출의 단일 착지면을 전용 테이블 ai_proposal 로 만든다. 코어 LLM 0% — 모든 제안은 pending 으로만 적재되고 사람 approveProposal 호출 시에만 화이트리스트 도메인 메서드(createItem/addAttachment/setArtifactRequirement/linkPartProject)가 실행된다. P-4-ai-B(event_log 재사용)와 둘 다 buildable 이나 owner 키스톤 #1 로 하나만 머지. 권고=A.

## data_model
- CREATE TABLE IF NOT EXISTS ai_proposal ( id TEXT PRIMARY KEY, at TEXT NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL, target_ref TEXT, payload_json TEXT NOT NULL, summary TEXT, status TEXT NOT NULL DEFAULT 'pending', decided_at TEXT, decided_by TEXT, applied_ref TEXT, used_refs TEXT, data_label TEXT NOT NULL DEFAULT 'real' );
- CREATE INDEX IF NOT EXISTS idx_proposal_status ON ai_proposal(status, at);
- store.mjs DDL 상수(L25~344 블록)에 위 2문 추가. ALTER 불필요. PROPOSAL_KINDS = ['create_item','add_attachment_type','set_artifact_requirement','link_part_project'] 화이트리스트(승인 시 switch 매핑, 임의 SQL 금지).

## code_changes
- store.mjs Store: static PROPOSAL_KINDS 추가.
- createProposal({source,kind,target_ref=null,payload={},summary=null,used_refs=[],data_label='real'}): kind∉PROPOSAL_KINDS 면 {error:'unknown_proposal_kind'}. id=`prop_${randomBytes(5).toString('hex')}`. INSERT(status='pending', payload_json=JSON.stringify(payload), used_refs=JSON.stringify(used_refs), at=now). 도메인 쓰기 0. 반환 {ok:true,id,status:'pending'}.
- approveProposal(id,{decided_by='owner'}={}): row 없으면 {error:'proposal_not_found'}; status!=='pending' 면 {error:'not_pending',status}. payload=JSON.parse(payload_json). switch(kind): create_item→this.createItem(payload), add_attachment_type→this.addAttachment(payload), set_artifact_requirement→this.setArtifactRequirement(payload), link_part_project→this.linkPartProject(payload.part_id,payload.project_id). 결과 error 면 그대로 반환(상태 미변경). 성공 시 UPDATE status='approved',decided_at,decided_by,applied_ref(=결과 item.id 또는 target). appendEvent({actor_ref:decided_by,actor_kind:'human',kind:'ai_proposal_approve',item_ref:id,to:applied_ref,used_refs:JSON.parse(used_refs),data_label:'real'}). 반환 {ok:true,applied_ref,result}.
- rejectProposal(id,{decided_by='owner',reason=null}={}): status!=='pending' 가드. UPDATE status='rejected'. appendEvent({actor_kind:'human',kind:'ai_proposal_reject',item_ref:id,note:reason,used_refs:[],data_label:'real'}). 반환 {ok:true}.
- proposals({status='pending'}={}): SELECT * WHERE status=? ORDER BY at DESC LIMIT 200, payload_json/used_refs JSON.parse 매핑.
- server.mjs 라우트 4개(/api/gates 블록 근처): GET /api/proposals→send(200,store.proposals({status:qp.status||'pending'})); POST /api/proposals→store.createProposal({...body,data_label:'real'}); POST /api/proposals/approve {id}→store.approveProposal(id,{decided_by:'owner'}) error→400; POST /api/proposals/reject {id,reason}→store.rejectProposal(...). approve/reject 이벤트는 store 내부에서만(server 이중기록 금지).

## test_cases
- 'P-4-ai: createProposal 은 pending 으로만 적재': freshStore()+loadFixture(); const N=store.items({project:'PRJ-A'}).length; store.createProposal({source:'manual',kind:'create_item',payload:{project_id:'PRJ-A',title:'제안된 할일'}}); assert.equal(store.items({project:'PRJ-A'}).length,N); assert.equal(store.proposals({status:'pending'}).length,1).
- 'P-4-ai: approveProposal 만이 실제 쓰기': 위 이어서 const p=store.proposals()[0]; const r=store.approveProposal(p.id); assert.ok(r.ok); assert.equal(store.items({project:'PRJ-A'}).filter(i=>i.title==='제안된 할일').length,1); assert.equal(store.proposals({status:'pending'}).length,0); const [ev]=store.recentEvents(1); assert.equal(ev.kind,'ai_proposal_approve'); assert.equal(ev.actor_kind,'human').
- 'P-4-ai: reject 쓰기 없음 + 미지원 kind 거부 + 없는 id': loadFixture; store.createProposal({source:'manual',kind:'create_item',payload:{project_id:'PRJ-A',title:'반려될 것'}}); const pid=store.proposals()[0].id; assert.ok(store.rejectProposal(pid,{reason:'중복'}).ok); assert.equal(store.items({project:'PRJ-A'}).filter(i=>i.title==='반려될 것').length,0); assert.equal(store.createProposal({source:'x',kind:'drop_table',payload:{}}).error,'unknown_proposal_kind'); assert.equal(store.approveProposal('nope').error,'proposal_not_found').

## acceptance_checks
- cd ui-workspace/apps/dev-erp && node --test test/core.test.mjs 전건 green(48+3=51).
- ai_proposal 이 IF NOT EXISTS 로만 생성(ALTER 0) grep 확인.
- approveProposal switch 가 PROPOSAL_KINDS 밖 kind 실행 안 함(임의 SQL/eval 부재).
- 승인/반려가 event_log 에 actor_kind='human' 1건씩만(라우트 이중기록 없음).

## stop_conditions
approveProposal 가 화이트리스트 밖 도메인 쓰기를 시도하면 중단. createProposal 가 큐 적재 외 도메인 테이블을 건드리면 중단. owner 가 옵션 B 채택 신호면 이 패킷 멈추고 P-4-ai-B 로 전환.

## guards
- ② 코어 LLM 0%(제안 큐→사람 승인, 자동 쓰기 0)
- ④ event_log append-only(승인/반려 used_refs[]+data_label)
- ⑤ 신규 테이블 IF NOT EXISTS 멱등
- ⑧ node:test 전건 green + 작업자·모델 표기 commit+push + 트리 안정성
- ⑨ 키스톤 #1 기본값+가정으로 진행
- ⑩ public-safe
