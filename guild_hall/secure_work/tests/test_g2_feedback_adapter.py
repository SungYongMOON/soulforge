"""Synthetic only. The signer exists here, never in the production adapter."""
import json
from datetime import datetime, timezone, timedelta

import pytest


@pytest.fixture
def feedback_case(tmp_path, kit, request):
    from sf_sewe import codec, models, permits
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from soulforge_secure_work import g2_feedback_adapter as adapter
    from soulforge_secure_work.authority import FieldReviewLedger
    start = datetime.now(timezone.utc).replace(microsecond=0)
    stamp = lambda seconds: (start + timedelta(seconds=seconds)).strftime('%Y-%m-%dT%H:%M:%SZ')
    profile = dict(codec_id='feedback.exact.v1', version='0.1.0', job_id='o_'+'1'*32, mission_id='o_'+'2'*32,
        round=0, review_ref='review:synthetic', producer_ref='leader:G2', publisher_ref='sender:synthetic',
        projection_ref='projection:synthetic', scope_ref='project:SYN', kind='improvement',
        allowed_write_paths=['src/value.mjs'], acceptance_checks=['check.answer'], valid_from=stamp(-10),
        valid_until=stamp(120), generation=1, field_review_ref='review:field', audience='feedback:synthetic',
        qualification_ref='qualification:synthetic', receiver_sha256='4'*64, control_root_sha256='5'*64)
    grant = dict(g2_leader_ref='leader:G2', scope_ref='project:SYN', allowed_kinds=['improvement'],
        allowed_write_paths=profile['allowed_write_paths'], acceptance_checks=profile['acceptance_checks'],
        valid_from=stamp(-60), valid_until=stamp(300))
    route = dict(profile_id='feedback.synthetic', revision='0.1.0', model_id='receiver.synthetic',
        codec_id='feedback.exact.v1', transport_id=profile['audience'], max_request_bytes=1048576,
        max_response_bytes=1048576, deadline_ms=30000, streaming=False, redirects=False,
        auto_retry=False, data_class='RELEASED', live_enabled=False)
    identity = dict(principal_ref='leader:G2', purpose='SOURCE', project_ref='project:SYN',
        assignment_ref='assignment:synthetic', assignment_epoch=1, task_ref='linear.task:syn-1',
        policy_epoch=1, route_sha256=adapter.route_digest(route, profile), audience=profile['audience'],
        issuer_key_id='trust.synthetic', expires_at=int((start+timedelta(seconds=300)).timestamp()*1000))
    issue = dict(id='f8091a2b-3c4d-4859-aa6b-465768798a9b', identifier='SYN-1',
        description=getattr(request,'param','Set the public fixture answer to 2.'), updated_at=stamp(-2), state_name='Todo', project_id='project-1')
    selection = dict(issue_id=issue['id'], issue_content_sha256='sha256:'+codec.digest(issue), scope_ref='project:SYN', generation_seq=1)
    wrapper = codec.canonical(dict(schema_version='soulforge.linear_collect.custody_object.v1', kind='issues',
        object_id=issue['id'], content_sha256=selection['issue_content_sha256'], object=issue))+b'\n'
    binding, field = adapter.source_field(wrapper, selection, identity)
    ledger_path = tmp_path/'field_reviews.json'
    ledger_path.write_text(json.dumps(dict(schema='soulforge.secure_work.field_reviews.v0', synthetic_pilot=True,
        entries=[dict(review_ref='review:field', field_sha256=codec.digest(field), policy_epoch=1)])))
    ledger = FieldReviewLedger(ledger_path)
    parts = adapter.prepare_data(wrapper, selection, profile, grant, route, identity, ledger)
    evidence = codec.strict_loads(parts['evidence'])
    review = models.PolicyReview(review_ref=profile['review_ref'], scope_digest=adapter.scope_digest(evidence),
        packet_digest=codec.digest(parts['packet']), work_digest=codec.digest(evidence['work']), policy_epoch=1,
        mode='HUMAN_REVIEWED_EXACT', decision='ALLOW', actor_ref='reviewer:synthetic', expires_utc=stamp(240), evidence_refs=['evidence:synthetic'])
    key = Ed25519PrivateKey.generate()
    claims = models.PermitClaims(protocol='sf.sewe.permit/1.0', permit_id='o_'+'3'*32,
        job_id=profile['job_id'], mission_id=profile['mission_id'], round=0, request_sha256=codec.digest(parts['body']),
        route_sha256=identity['route_sha256'], review_ref=profile['review_ref'], policy_epoch=1,
        audience=profile['audience'], issued_utc=stamp(-5), expires_utc=stamp(180), max_uses=1)
    permit = permits.sign_for_test(claims, key, 'trust.synthetic')
    record = dict(schema='soulforge.secure_work.permit.v0', decision='ALLOW', actor_ref=review.actor_ref,
        issuer_key_id='trust.synthetic', authority='SYNTHETIC_FIXTURE_ONLY', permit=permit.model_dump(mode='json'))
    sender = dict(identity, principal_ref='sender:synthetic', purpose='G3_PROVIDER')
    args = dict(parts=parts, profile=profile, grant=grant, route=route, review=review.model_dump(mode='json'),
        record=record, identity=sender, ledger=ledger, public_keys={'trust.synthetic':key.public_key()}, now_utc=stamp(0))
    return adapter, args, dict(wrapper=wrapper, selection=selection, identity=identity, ledger_path=ledger_path, root=tmp_path, fixture_signer=key)


def test_real_kit_verifier_accepts_exact_reviewed_prepared_bytes(feedback_case):
    adapter, args, extra = feedback_case
    result = adapter.verify_data(**args)
    assert result['body_sha256'] == args['record']['permit']['claims']['request_sha256']
    assert adapter.journal_phase(extra['root'], 'reserve', result, 'project:SYN') == 'IN_FLIGHT'
    with pytest.raises(ValueError, match='FEEDBACK_DELIVERY_UNKNOWN'):
        adapter.journal_phase(extra['root'], 'reserve', result, 'project:SYN')
    assert adapter.journal_phase(extra['root'], 'complete', result, 'project:SYN') == 'RESPONSE_RECEIVED'
    assert adapter.journal_phase(extra['root'], 'reserve', result, 'project:SYN') == 'RESPONSE_RECEIVED'


@pytest.mark.parametrize('fault', ['body', 'review_deny', 'review_missing', 'review_actor', 'review_epoch',
    'review_scope', 'review_packet', 'review_work', 'field_review', 'source', 'grant', 'route',
    'audience', 'signature', 'expired', 'source_role_publishes', 'path_widen', 'check_widen', 'qualification', 'receiver', 'store'])
def test_review_and_permit_are_distinct_current_gates(feedback_case, fault):
    adapter, args, extra = feedback_case
    if fault == 'body': args['parts']['body'] += b' '
    elif fault == 'review_deny': args['review']['decision'] = 'DENY'
    elif fault == 'review_missing': args['review']['decision'] = 'REVIEW_REQUIRED'
    elif fault == 'review_actor': args['review']['actor_ref'] = 'model:self'
    elif fault == 'review_epoch': args['review']['policy_epoch'] = 2
    elif fault.startswith('review_'): args['review'][{'review_scope':'scope_digest','review_packet':'packet_digest','review_work':'work_digest'}[fault]] = '0'*64
    elif fault == 'field_review': args['ledger']._entries.clear()
    elif fault == 'source':
        value=json.loads(args['parts']['evidence']); value['selection']['issue_content_sha256']='sha256:'+'0'*64
        args['parts']['evidence']=json.dumps(value).encode()
    elif fault == 'grant': args['grant']['valid_until']='2020-01-01T00:00:00Z'
    elif fault == 'route': args['route']['model_id']='changed'
    elif fault == 'audience': args['identity']['audience']='changed'
    elif fault == 'signature': args['record']['permit']['signature_hex']='0'*128
    elif fault == 'expired': args['now_utc']='2099-01-01T00:00:00Z'
    elif fault == 'source_role_publishes': args['identity']=extra['identity']
    elif fault == 'path_widen': args['profile']['allowed_write_paths']=['**']
    elif fault == 'check_widen': args['profile']['acceptance_checks']=['arbitrary.shell']
    elif fault == 'qualification': args['profile']['qualification_ref']=''
    elif fault == 'receiver': args['profile']['receiver_sha256']='0'*64
    elif fault == 'store': args['profile']['control_root_sha256']='0'*64
    with pytest.raises(ValueError): adapter.verify_data(**args)


def test_sender_cannot_prepare_source_and_missing_field_review_never_prepares(feedback_case):
    adapter, args, extra = feedback_case
    with pytest.raises(ValueError, match='FEEDBACK_PREPARER_ROLE'):
        adapter.prepare_data(extra['wrapper'], extra['selection'], args['profile'], args['grant'], args['route'], args['identity'], args['ledger'])
    args['ledger']._entries.clear()
    with pytest.raises(ValueError, match='FIELD_REVIEW_REQUIRED'):
        adapter.prepare_data(extra['wrapper'], extra['selection'], args['profile'], args['grant'], args['route'], extra['identity'], args['ledger'])


@pytest.mark.parametrize('feedback_case',['x'*1600],indirect=True)
def test_route_byte_limit_is_enforced_even_with_genuine_oversize_permit(feedback_case):
    from sf_sewe import codec,models,permits
    adapter,args,extra=feedback_case
    args['route']['max_request_bytes']=1024
    route_sha=adapter.route_digest(args['route'],args['profile'])
    args['identity']['route_sha256']=route_sha
    evidence=codec.strict_loads(args['parts']['evidence']); evidence['route_sha256']=route_sha
    args['parts']['evidence']=codec.canonical(evidence)
    prepared=codec.strict_loads(args['parts']['prepared']); prepared['route_sha256']=route_sha
    args['parts']['prepared']=codec.canonical(prepared)
    args['review']['scope_digest']=adapter.scope_digest(evidence)
    claims=models.PermitClaims.model_validate({**args['record']['permit']['claims'],'route_sha256':route_sha})
    args['record']['permit']=permits.sign_for_test(claims,extra['fixture_signer'],'trust.synthetic').model_dump(mode='json')
    with pytest.raises(ValueError,match='FEEDBACK_ROUTE_SIZE'): adapter.verify_data(**args)
    source_identity={**extra['identity'],'route_sha256':route_sha}
    with pytest.raises(ValueError,match='FEEDBACK_ROUTE_SIZE'):
        adapter.prepare_data(extra['wrapper'],extra['selection'],args['profile'],args['grant'],args['route'],source_identity,args['ledger'])


def test_closed_generation_restore_preserves_bytes_and_consumed_permit(feedback_case):
    import hashlib,shutil
    adapter,args,extra=feedback_case
    verified=adapter.verify_data(**args)
    origin=extra['root']/'original'; origin.mkdir()
    adapter.journal_phase(origin,'reserve',verified,'project:SYN')
    adapter.journal_phase(origin,'complete',verified,'project:SYN')
    for name,value in args['parts'].items(): (origin/(name+'.bin')).write_bytes(value)
    # Closed SQLite generation only, never a live DB/lease copy. Trust inputs,
    # private key and raw source are outside this payload/attempt snapshot.
    before={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in origin.iterdir()}
    restored=extra['root']/'restore'; shutil.copytree(origin,restored)
    after={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in restored.iterdir()}
    assert before==after
    assert adapter.journal_phase(restored,'reserve',verified,'project:SYN')=='RESPONSE_RECEIVED'
    (restored/'body.bin').write_bytes(b'corrupt')
    assert hashlib.sha256((restored/'body.bin').read_bytes()).hexdigest()!=before['body.bin']


def test_retained_empty_or_partial_journal_cannot_reserve_the_same_permit_again(feedback_case):
    import sqlite3
    adapter,args,extra=feedback_case
    verified=adapter.verify_data(**args)
    root=extra['root']/'retained';root.mkdir()
    adapter.journal_phase(root,'reserve',verified,'project:SYN')
    adapter.journal_phase(root,'complete',verified,'project:SYN')
    database=root/'attempts.db'; original=database.read_bytes()
    database.write_bytes(b'')
    with pytest.raises(ValueError,match='FEEDBACK_JOURNAL_INCOMPLETE'):
        adapter.journal_phase(root,'reserve',verified,'project:SYN')
    assert database.read_bytes()==b''
    database.write_bytes(original)
    db=sqlite3.connect(database);db.execute('DROP TABLE attempts');db.commit();db.close()
    with pytest.raises(ValueError,match='FEEDBACK_JOURNAL_INCOMPLETE'):
        adapter.journal_phase(root,'reserve',verified,'project:SYN')
    db=sqlite3.connect(database)
    assert db.execute("SELECT 1 FROM sqlite_master WHERE name='attempts'").fetchone() is None
    db.close()
