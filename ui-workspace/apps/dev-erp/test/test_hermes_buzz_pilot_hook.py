"""Synthetic public observer/JSON-stdin contract tests; no live services."""
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace
from datetime import datetime, timedelta, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools.hermes_buzz_pilot_hook import ObserverClient, PilotCaptureAbort, SubprocessTransport

PEER = '''import sys,json,pathlib
p=pathlib.Path(sys.argv[1])
if sys.argv[1]=='--binding':
 b=json.loads(pathlib.Path(sys.argv[2]).read_text());p=pathlib.Path(b['evidence_root'])/'events.jsonl'
if len(sys.argv)>2 and sys.argv[2]=='read':
 print(p.read_text() if p.exists() else '');sys.exit()
if len(sys.argv)>2 and sys.argv[2]=='status-invalid':
 print(json.dumps({'ok':True,'state':'waiting_owner'}));sys.exit()
if len(sys.argv)>2 and sys.argv[2] in ('status-other','status-nostate'):
 value={'ok':True,'job_id':'job-1','project_id':'project-1','profile_ref':'profile-1'}
 if sys.argv[2]=='status-other':value.update(job_id='other-job',state='waiting_owner')
 print(json.dumps(value));sys.exit()
if len(sys.argv)>2 and sys.argv[2] in ('status-retry','status-ready'):
 count=p.with_suffix('.status-count')
 if sys.argv[2]=='status-retry' and not count.exists():
  count.write_text('1');print(json.dumps({'ok':False,'code':'BUZZ_PILOT_STATUS_UNAVAILABLE','retryable':False}));sys.exit(2)
 print(json.dumps({'ok':True,'job_id':'job-1','project_id':'project-1','profile_ref':'profile-1',
  'state':'waiting_owner','recorded_state':'waiting_owner',
  'recovery_metadata':{'session_key':'session-key','session_id':'actual-session'}}));sys.exit()
raw=sys.stdin.buffer.read();event=json.loads(raw)
if event['event_type']=='instruction_received' and event['payload']['text']!='review this':
 print(json.dumps({'ok':False,'code':'BUZZ_PILOT_INSTRUCTION_MISMATCH','retryable':False}));sys.exit(2)
with p.open('ab') as f:f.write(raw+b'\\n')
if len(sys.argv)>2 and sys.argv[2]=='lose-first' and len(p.read_bytes().splitlines())==1:
 sys.exit(0)
if len(sys.argv)>2 and sys.argv[2]=='lose-all':sys.exit(0)
if len(sys.argv)>2 and sys.argv[2]=='permanent':
 print(json.dumps({'ok':False,'code':'BUZZ_PILOT_REJECTED','retryable':False}));sys.exit(2)
print(json.dumps({'ok':True,'status':'recorded','job_id':event['job_id'],
 'event_type':event['event_type'],'observation_id':event['observation_id']}))
'''

class ObserverTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = pathlib.Path(self.tmp.name)
        self.peer = self.root / 'peer.py'
        self.peer.write_text(PEER, encoding='utf-8')
        self.events = self.root / 'events.jsonl'
        self.path = self.root / 'binding.json'
        now = datetime.now(timezone.utc)
        self.binding = dict(version=1, job_id='job-1', project_id='project-1',
            owner_account_id='owner-account', expected_owner_pubkey='owner-key',
            expected_bot_pubkey='bot-key', chat_id='chat-1', profile_ref='profile-1',
            instruction_sha256='sha256:'+hashlib.sha256(b'review this').hexdigest(),
            node_path=sys.executable, node_sha256=hashlib.sha256(pathlib.Path(sys.executable).read_bytes()).hexdigest(),
            observer_entry_path=str(self.peer), observer_entry_sha256=hashlib.sha256(self.peer.read_bytes()).hexdigest(),
            observer_code_root=str(self.root), observer_source_hashes={'peer.py':hashlib.sha256(self.peer.read_bytes()).hexdigest()},
            control_db_path=str(self.root/'control.db'), evidence_root=str(self.root),
            repository_root=str(self.root), storage_class='owner_approved_shared_worksite',
            owner_approval_ref='synthetic-approval', expected_hermes_home=str(self.root/'hermes'),
            issued_at=(now-timedelta(minutes=1)).isoformat(),
            expires_at=(now+timedelta(minutes=10)).isoformat())
        self.write_binding()

    def write_binding(self):
        self.path.write_text(json.dumps(self.binding), encoding='utf-8')
        self.sha = hashlib.sha256(self.path.read_bytes()).hexdigest()

    def client(self):
        return ObserverClient(self.path, self.sha, transport=SubprocessTransport(
            [sys.executable, str(self.peer), str(self.events)]))

    def message(self, client, **changes):
        args = dict(profile_ref='profile-1', bot_pubkey='bot-key', chat_id='chat-1',
            actor_pubkey='owner-key', session_key='session-key', message_id='msg-1',
            actual_hermes_home=self.binding['expected_hermes_home'],
            text='review this', observed_at=datetime.now(timezone.utc).isoformat())
        args.update(changes)
        return client.for_message(**args)

    def observed(self):
        output = subprocess.check_output([sys.executable, str(self.peer), str(self.events), 'read'])
        return [json.loads(line) for line in output.splitlines() if line]

    def test_one_issued_instruction_dispatches_once(self):
        client = self.client()
        job = self.message(client)
        self.assertTrue(job.should_dispatch)
        duplicate = self.message(client)
        self.assertIs(duplicate, job)
        self.assertFalse(duplicate.should_dispatch)
        self.assertEqual([e['event_type'] for e in self.observed()], ['instruction_received'])
        self.assertIs(client.for_session('session-key'), job)
        self.assertIsNone(self.message(client, chat_id='unrelated'))

    def test_clarify_lifecycle_keeps_actual_ids_and_public_bytes(self):
        job = self.message(self.client())
        job.bind_session('actual-session')
        args = dict(question='Which section?', choices=['First','Last'], multi_select=False)
        job.tool_started('actual-call', 'clarify', args)
        job.question_registered('actual-question', **args)
        job.question_delivery('actual-question', SimpleNamespace(success=True, message_id='sent-question', raw_response={'accepted':True}))
        job.answer_received('actual-question', 'actual-answer', 'First', 'owner-key')
        job.answer_accepted('actual-question')
        job.resumed('actual-question', 'First')
        job.tool_completed('actual-call', 'clarify', args, 'First')
        job.final_response('Reviewed first section.')
        self.assertTrue(job.matches_final('Reviewed first section.'))
        job.final_delivery(SimpleNamespace(success=True, message_id='sent-final', raw_response={'accepted':True}))
        events = self.observed()
        self.assertEqual([e['event_type'] for e in events], ['instruction_received','tool_started',
            'question_registered','question_delivery','answer_received','answer_accepted',
            'resumed','tool_completed','final_response','final_delivery'])
        self.assertEqual(events[5]['payload'], {'clarify_id':'actual-question','message_id':'actual-answer'})
        self.assertEqual(events[6]['payload'], {'clarify_id':'actual-question','tool_call_id':'actual-call'})
        self.assertEqual(events[4]['actor_pubkey'], 'owner-key')
        self.assertTrue(all(e['session_id']=='actual-session' for e in events[1:]))

    def test_lost_ack_retries_identical_observation_bytes(self):
        client = ObserverClient(self.path, self.sha, transport=SubprocessTransport(
            [sys.executable, str(self.peer), str(self.events), 'lose-first']))
        job = self.message(client)
        self.assertTrue(job.should_dispatch)
        events = self.observed()
        self.assertEqual(len(events), 2)
        self.assertEqual(events[0], events[1])

    def test_expired_or_changed_binding_stops_identified_job(self):
        self.binding['expires_at'] = '2000-01-01T00:00:00Z'
        self.write_binding()
        with self.assertRaises(PilotCaptureAbort):
            self.message(self.client())
        self.assertEqual(self.observed(), [])

    def test_timeout_public_result_never_invents_answer_or_resume(self):
        job = self.message(self.client())
        job.bind_session('actual-session')
        args = dict(question='Choose?', choices=[], multi_select=False)
        job.tool_started('call-1', 'clarify', args)
        job.question_registered('question-1', **args)
        job.resumed('question-1', None)
        job.tool_completed('call-1', 'clarify', args,
                           json.dumps({'question':'Choose?', 'user_response':'[timeout]'}))
        events = self.observed()
        self.assertEqual(events[-1]['payload']['outcome'], 'cancelled')
        self.assertEqual(events[-1]['payload']['output'], '[timeout]')
        self.assertFalse(any(e['event_type'] in ('answer_received','answer_accepted','resumed') for e in events))

    def test_permanent_capture_failure_latches_abort_before_dispatch(self):
        client = ObserverClient(self.path, self.sha, transport=SubprocessTransport(
            [sys.executable, str(self.peer), str(self.events), 'lose-all']))
        with self.assertRaises(PilotCaptureAbort):
            self.message(client)
        with self.assertRaises(PilotCaptureAbort):
            self.message(client)
        self.assertEqual(len(self.observed()), 2)
        self.assertIsNone(self.message(client, profile_ref='unrelated'))

    def test_permanent_rejection_is_not_retried(self):
        client = ObserverClient(self.path, self.sha, transport=SubprocessTransport(
            [sys.executable, str(self.peer), str(self.events), 'permanent']))
        with self.assertRaises(PilotCaptureAbort):
            self.message(client)
        self.assertEqual(len(self.observed()), 1)

    def test_changed_pinned_code_blocks_next_append(self):
        job = self.message(self.client())
        job.bind_session('actual-session')
        self.peer.write_text(PEER+'\n# drift', encoding='utf-8')
        with self.assertRaises(PilotCaptureAbort):
            job.final_response('public text')
        self.assertEqual([e['event_type'] for e in self.observed()], ['instruction_received'])

    def test_pending_owner_reply_reaches_existing_gateway_then_resumes_resolved_choice(self):
        client = self.client()
        job = self.message(client)
        job.bind_session('actual-session')
        args = dict(question='Choose?', choices=['First'], multi_select=False)
        job.tool_started('call-1', 'clarify', args)
        job.question_registered('question-1', **args)
        self.assertIsNone(self.message(client, message_id='answer-1', text='1'))
        job.answer_received('question-1', 'answer-1', '1', 'owner-key')
        job.answer_accepted('question-1', 'First')
        job.resumed('question-1', 'First')
        self.assertEqual(self.observed()[-1]['event_type'], 'resumed')

    def test_duplicate_answer_and_reposted_instruction_cannot_dispatch_new_turn(self):
        client = self.client()
        job = self.message(client)
        job.bind_session('actual-session')
        args = dict(question='Choose?', choices=['First'], multi_select=False)
        job.tool_started('call-1', 'clarify', args)
        job.question_registered('question-1', **args)
        job.answer_received('question-1', 'answer-1', '1', 'owner-key')
        self.assertFalse(self.message(client, message_id='answer-1', text='1').should_dispatch)
        self.assertFalse(self.message(client, message_id='reposted', text='review this').should_dispatch)
        job.cancelled()
        self.assertIsNone(client.for_session('session-key'))
        self.assertIsNone(self.message(client, message_id='future', text='unrelated new task'))

    def test_wire_timestamps_are_utc_milliseconds_and_payload_is_bounded(self):
        job = self.message(self.client(), observed_at='2026-09-08T10:20:30.123456+09:00')
        self.assertEqual(self.observed()[0]['observed_at'], '2026-09-08T01:20:30.123Z')
        job.bind_session('actual-session')
        with self.assertRaises(PilotCaptureAbort):
            job.final_response('x' * 1_048_577)
        self.assertEqual(len(self.observed()), 1)

    def test_wrong_identity_home_and_instruction_are_refused_without_capture(self):
        for changes in ({'actor_pubkey':'other'}, {'bot_pubkey':'other'},
                        {'actual_hermes_home':str(self.root/'other')}, {'text':'changed instruction'}):
            with self.subTest(changes=changes), self.assertRaises(PilotCaptureAbort):
                self.message(self.client(), **changes)
        self.assertEqual(self.observed(), [])

    def test_missing_answer_cannot_release_and_duplicate_resume_cannot_record(self):
        job = self.message(self.client())
        job.bind_session('actual-session')
        args = dict(question='Choose?', choices=['First'], multi_select=False)
        job.tool_started('call-1', 'clarify', args)
        job.question_registered('question-1', **args)
        with self.assertRaises(PilotCaptureAbort):
            job.answer_accepted('question-1', 'invented')
        self.assertFalse(any(e['event_type']=='answer_accepted' for e in self.observed()))
        job = self.message(self.client())
        job.bind_session('another-session')
        job.tool_started('call-1', 'clarify', args)
        job.question_registered('question-1', **args)
        job.answer_received('question-1', 'answer-1', '1', 'owner-key')
        job.answer_accepted('question-1', 'First')
        job.resumed('question-1', 'First')
        with self.assertRaises(PilotCaptureAbort):
            job.resumed('question-1', 'First')
        self.assertEqual(sum(e['event_type']=='resumed' for e in self.observed()), 1)

    def test_non_string_tool_output_is_explicitly_unsupported(self):
        job = self.message(self.client())
        job.bind_session('actual-session')
        args = dict(question='Choose?', choices=['First'], multi_select=False)
        job.tool_started('call-1', 'clarify', args)
        job.question_registered('question-1', **args)
        job.answer_received('question-1', 'answer-1', '1', 'owner-key')
        job.answer_accepted('question-1', 'First')
        job.resumed('question-1', 'First')
        with self.assertRaises(PilotCaptureAbort):
            job.tool_completed('call-1', 'clarify', args, {'user_response':['First']})
        self.assertFalse(any(e['event_type']=='tool_completed' for e in self.observed()))

    def test_abort_exception_does_not_include_unreviewed_error_text(self):
        abort = PilotCaptureAbort('raw private exception body')
        self.assertEqual(str(abort), 'pilot_capture_failed')

    def test_multi_select_is_rejected_before_tool_start(self):
        job = self.message(self.client())
        job.bind_session('actual-session')
        with self.assertRaises(PilotCaptureAbort) as raised:
            job.tool_started('call-1','clarify',dict(question='Choose?',choices=['First'],multi_select=True))
        self.assertEqual(raised.exception.reason_code,'pilot_multi_select_unsupported')
        events = self.observed()
        self.assertEqual([event['event_type'] for event in events],['instruction_received','failed'])
        self.assertEqual(events[-1]['payload'],{'reason_code':'pilot_multi_select_unsupported'})

    def test_positive_ack_and_actual_message_id_are_required_for_sent(self):
        cases = [
            (SimpleNamespace(success=False,message_id=None), 'failed'),
            (SimpleNamespace(success=True,message_id='sent-id'), 'unknown'),
            (SimpleNamespace(success=True,message_id='sent-id',raw_response={'accepted':True}), 'sent'),
            (SimpleNamespace(success=True,message_id='sent-id',raw_response={'accepted':False}), 'failed'),
            (SimpleNamespace(success=True,message_id='sent-id',raw_response={'accepted':'true'}), 'unknown'),
            (SimpleNamespace(success=True,message_id=None,raw_response={'accepted':True}), 'unknown'),
        ]
        for result, expected in cases:
            with self.subTest(expected=expected,result=result):
                job = self.message(self.client())
                job.bind_session('actual-session')
                job.final_response('Public final text.')
                job.final_delivery(result)
                self.assertEqual(self.observed()[-1]['payload']['delivery_status'],expected)
                self.assertEqual(job.final_delivered,expected=='sent')

    def test_failed_startup_status_read_can_retry_without_false_checked_flag(self):
        transport = SubprocessTransport([sys.executable,str(self.peer),str(self.events)],
            status_argv=[sys.executable,str(self.peer),str(self.events),'status-retry'])
        client = ObserverClient(self.path,self.sha,transport=transport)
        kwargs = dict(actual_hermes_home=self.binding['expected_hermes_home'])
        with self.assertRaises(PilotCaptureAbort):
            client.recover_startup('profile-1','bot-key',**kwargs)
        self.assertEqual(self.observed(),[])
        self.assertTrue(client.recover_startup('profile-1','bot-key',**kwargs))
        self.assertFalse(client.recover_startup('profile-1','bot-key',**kwargs))
        events = self.observed()
        self.assertEqual([event['event_type'] for event in events],['failed'])
        self.assertEqual(events[0]['payload'],{'reason_code':'gateway_wait_lost'})
        self.assertEqual(events[0]['session_id'],'actual-session')

    def test_uncertain_startup_failure_append_cannot_get_new_id_on_reconnect(self):
        transport = SubprocessTransport([sys.executable,str(self.peer),str(self.events),'lose-all'],
            status_argv=[sys.executable,str(self.peer),str(self.events),'status-ready'])
        client = ObserverClient(self.path,self.sha,transport=transport)
        kwargs = dict(actual_hermes_home=self.binding['expected_hermes_home'])
        with self.assertRaises(PilotCaptureAbort):
            client.recover_startup('profile-1','bot-key',**kwargs)
        with self.assertRaises(PilotCaptureAbort):
            client.recover_startup('profile-1','bot-key',**kwargs)
        events = self.observed()
        self.assertEqual(len(events),2)
        self.assertEqual(events[0],events[1])

    def test_incomplete_startup_status_is_not_a_successful_check(self):
        for mode in ('status-invalid','status-other','status-nostate',None):
            with self.subTest(mode=mode):
                transport = SubprocessTransport([sys.executable,str(self.peer),str(self.events)],
                    status_argv=[sys.executable,str(self.peer),str(self.events),mode] if mode else None)
                client = ObserverClient(self.path,self.sha,transport=transport)
                for _ in range(2):
                    with self.assertRaises(PilotCaptureAbort):
                        client.recover_startup('profile-1','bot-key',actual_hermes_home=self.binding['expected_hermes_home'])
        self.assertEqual(self.observed(),[])

    def test_failed_active_session_aborts_lookup_until_exact_cleanup(self):
        client = self.client()
        job = self.message(client)
        job.bind_session('actual-session')
        self.path.write_text('{}', encoding='utf-8')
        with self.assertRaises(PilotCaptureAbort):
            job.final_response('public response')
        with self.assertRaises(PilotCaptureAbort):
            client.for_session('session-key')
        client.finish_session('unrelated')
        with self.assertRaises(PilotCaptureAbort):
            client.for_session('session-key')
        client.finish_session('session-key')
        self.assertIsNone(client.for_session('session-key'))
        with self.assertRaises(PilotCaptureAbort):
            job.final_response('must still refuse original callback')

    def test_callback_helper_records_before_preserved_callbacks_exactly_once(self):
        script = '''import sys,os,json,subprocess
from datetime import datetime,timezone
from types import SimpleNamespace
sys.path.insert(0,sys.argv[1])
os.environ['HERMES_BUZZ_PILOT_BINDING']=sys.argv[2]
os.environ['HERMES_BUZZ_PILOT_BINDING_SHA256']=sys.argv[3]
from tools import hermes_buzz_pilot_hook as hook
seen=[]
def previous(label,event_type,*args):
 rows=[row for row in subprocess.check_output([sys.executable,sys.argv[5],sys.argv[6],'read']).splitlines() if row]
 assert json.loads(rows[-1])['event_type']==event_type
 seen.append([label,list(args)])
agent=SimpleNamespace(tool_start_callback=lambda *a:previous('start','tool_started',*a),
 tool_complete_callback=lambda *a:previous('complete','tool_completed',*a))
job=hook.for_message('profile-1','bot-key','chat-1','owner-key','session-key','msg-1',
 'review this',datetime.now(timezone.utc).isoformat(),actual_hermes_home=sys.argv[4])
assert hook.bind_agent_callbacks(agent,'session-key','actual-session') is job
args={'question':'Choose?','choices':['First'],'multi_select':False}
agent.tool_start_callback('call-1','clarify',args)
job.question_registered('question-1',**args)
job.answer_received('question-1','answer-1','1','owner-key')
job.answer_accepted('question-1','First')
job.resumed('question-1','First')
agent.tool_complete_callback('call-1','clarify',args,json.dumps({'user_response':'First'}))
print(json.dumps(seen))
'''
        output = subprocess.check_output([sys.executable, '-c', script, str(ROOT),
            str(self.path), self.sha, self.binding['expected_hermes_home'], str(self.peer), str(self.events)])
        seen = json.loads(output)
        self.assertEqual([row[0] for row in seen], ['start','complete'])
        self.assertEqual(seen[0][1][0], 'call-1')
        self.assertEqual(self.observed()[-1]['event_type'], 'tool_completed')

    def test_callback_cancel_preserves_notification_but_prevents_model_continuation(self):
        script = '''import sys,os,json
from datetime import datetime,timezone
from types import SimpleNamespace
sys.path.insert(0,sys.argv[1])
os.environ['HERMES_BUZZ_PILOT_BINDING']=sys.argv[2]
os.environ['HERMES_BUZZ_PILOT_BINDING_SHA256']=sys.argv[3]
from tools import hermes_buzz_pilot_hook as hook
seen=[]
agent=SimpleNamespace(tool_start_callback=lambda *a:seen.append('start'),
 tool_complete_callback=lambda *a:seen.append('complete'))
job=hook.for_message('profile-1','bot-key','chat-1','owner-key','session-key','msg-1',
 'review this',datetime.now(timezone.utc).isoformat(),actual_hermes_home=sys.argv[4])
hook.bind_agent_callbacks(agent,'session-key','actual-session')
args={'question':'Choose?','choices':['First'],'multi_select':False}
agent.tool_start_callback('call-1','clarify',args)
job.question_registered('question-1',**args)
job.resumed('question-1',None)
try:
 agent.tool_complete_callback('call-1','clarify',args,json.dumps({'user_response':'native timeout sentinel'}))
 seen.append('model-continuation')
except hook.PilotCaptureAbort:seen.append('aborted')
print(json.dumps(seen))
'''
        output = subprocess.check_output([sys.executable, '-c', script, str(ROOT),
            str(self.path), self.sha, self.binding['expected_hermes_home']])
        self.assertEqual(json.loads(output), ['start','complete','aborted'])
        events = self.observed()
        self.assertEqual(events[-1]['event_type'], 'tool_completed')
        self.assertEqual(events[-1]['payload']['output'], 'native timeout sentinel')
        self.assertFalse(any(e['event_type']=='cancelled' for e in events))
        self.assertFalse(any(e['event_type'] in ('answer_accepted','resumed') for e in events))

if __name__ == '__main__':
    unittest.main()
