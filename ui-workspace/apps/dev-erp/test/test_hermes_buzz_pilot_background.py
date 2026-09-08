"""Observation failures must not change the native agent's execution path."""
import hashlib
import json
import os
import threading
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import test_hermes_buzz_pilot_hook as recorder_fixture
from tools import hermes_buzz_pilot_hook as hook


class ControlledTransport:
    def __init__(self, *, blocked=False, reject=False):
        self.entered = threading.Event()
        self.release = threading.Event()
        if not blocked:
            self.release.set()
        self.reject = reject
        self.events = []

    def append(self, raw):
        self.entered.set()
        if not self.release.wait(3):
            raise TimeoutError()
        if self.reject:
            raise hook.PilotCaptureAbort('pilot_append_rejected', node_code='BUZZ_PILOT_REJECTED')
        event = json.loads(raw)
        self.events.append(event)
        refs = []
        role = {'tool_started': 'tool_input', 'tool_input_prepared': 'tool_input_effective'}.get(event['event_type'])
        if role:
            body = json.dumps(event['payload']['input'], ensure_ascii=False, separators=(',', ':'), sort_keys=True).encode()
            group = hashlib.sha256(json.dumps([event['job_id'], 'event', event['observation_id']], separators=(',', ':')).encode()).hexdigest()
            refs = [dict(ref=f'bp:bp-{group}:{role}', role=role, sha256='sha256:'+hashlib.sha256(body).hexdigest(), size=len(body), mediaType='application/json')]
        return dict(ok=True, status='recorded', job_id=event['job_id'], event_type=event['event_type'], observation_id=event['observation_id'], evidence_refs=refs)


class BackgroundTests(unittest.TestCase):
    setUp = recorder_fixture.ObserverTests.setUp
    write_binding = recorder_fixture.ObserverTests.write_binding
    message = recorder_fixture.ObserverTests.message

    def background(self, transport, **kwargs):
        recorder = hook.ObserverClient(self.path, self.sha, transport=transport)
        client = hook.BackgroundObserverClient(recorder, instruction_trim_sha256='sha256:'+hashlib.sha256(b'review this').hexdigest(), **kwargs)
        self.addCleanup(client.close, 2)
        self.addCleanup(transport.release.set)
        return client

    def test_blocked_writer_cannot_hold_native_callbacks_or_final(self):
        transport = ControlledTransport(blocked=True)
        client = self.background(transport)
        start = time.monotonic()
        job = self.message(client)
        self.assertTrue(transport.entered.wait(1))
        native = []
        agent = SimpleNamespace(tool_start_callback=lambda *args:native.append('started'),
                                tool_complete_callback=lambda *args:native.append('completed'))
        with patch.object(hook, '_singleton', client):
            hook.bind_agent_callbacks(agent, 'session-key', 'actual-session')
            args = dict(question='Which?', choices=['First'], multi_select=False)
            agent.tool_start_callback('call-1', 'clarify', args)
            job.tool_input_prepared('Which?', ['First (Recommended)'], False)
            job.question_registered('question-1', 'Which?', ['First (Recommended)'], False)
            job.question_delivery('question-1', SimpleNamespace(success=True, message_id='sent-q', raw_response={'accepted':True}))
            job.answer_received('question-1', 'answer-1', '1', 'owner-key')
            job.answer_accepted('question-1', 'First (Recommended)')
            self.assertTrue(job.accepted)
            job.resumed('question-1', 'First (Recommended)')
            agent.tool_complete_callback('call-1', 'clarify', args, 'First (Recommended)')
            job.final_response('Done')
            job.final_delivery(SimpleNamespace(success=True, message_id='sent-final', raw_response={'accepted':True}))
        self.assertEqual(native, ['started', 'completed'])
        self.assertLess(time.monotonic()-start, 1)
        self.assertEqual(transport.events, [])
        self.assertGreater(client.health()['pending'], 0)
        transport.release.set()
        self.assertTrue(client.drain(3))
        self.assertEqual(client.health()['state'], 'current')
        self.assertEqual([e['event_type'] for e in transport.events], ['instruction_received', 'tool_started',
            'tool_input_prepared', 'question_registered', 'question_delivery', 'answer_received',
            'answer_accepted', 'resumed', 'tool_completed', 'final_response', 'final_delivery'])
        self.assertEqual(transport.events[1]['payload']['input_contract'], 'prepared_v2')

    def test_rejected_writer_marks_capture_incomplete_without_execution_failure(self):
        transport = ControlledTransport(reject=True)
        client = self.background(transport)
        job = self.message(client)
        self.assertTrue(client.drain(3))
        job.bind_session('actual-session')
        job.final_response('Native answer still works')
        self.assertTrue(job.matches_final('Native answer still works'))
        self.assertFalse(job.terminal)
        self.assertEqual(client.health()['state'], 'incomplete')
        self.assertEqual(client.health()['reason'], 'pilot_append_rejected')
        self.assertEqual(transport.events, [])

    def test_full_queue_is_bounded_and_does_not_block_foreground(self):
        transport = ControlledTransport(blocked=True)
        client = self.background(transport, max_pending=2)
        job = self.message(client)
        self.assertTrue(transport.entered.wait(1))
        job.bind_session('actual-session')
        job.tool_started('call-1', 'clarify', {'question':'Which?'})
        started = time.monotonic()
        job.tool_input_prepared('Which?', [], False)
        job.final_response('Still returns')
        self.assertLess(time.monotonic()-started, .2)
        self.assertLessEqual(client.health()['pending'], 3)
        self.assertEqual(client.health()['state'], 'incomplete')
        self.assertEqual(client.health()['reason'], 'observer_queue_full')

    def test_scope_mismatch_does_not_capture_or_authorize(self):
        transport = ControlledTransport()
        client = self.background(transport)
        for changes in ({'profile_ref':'other'}, {'actor_pubkey':'other'}, {'text':'unrelated'}, {'chat_id':'other'}):
            self.assertIsNone(self.message(client, **changes))
        self.assertEqual(transport.events, [])

    def test_enqueued_input_is_detached_from_later_mutation(self):
        transport = ControlledTransport(blocked=True)
        client = self.background(transport)
        job = self.message(client)
        self.assertTrue(transport.entered.wait(1))
        job.bind_session('actual-session')
        args = dict(question='Original?', choices=['First'])
        job.tool_started('call-1', 'clarify', args)
        args['choices'][0] = 'Changed'
        transport.release.set()
        self.assertTrue(client.drain(3))
        self.assertEqual(transport.events[1]['payload']['input']['choices'], ['First'])

    def test_raw_newline_pin_is_distinct_from_trusted_trim_pin(self):
        self.binding['instruction_sha256']='sha256:'+hashlib.sha256(b'review this\n').hexdigest()
        self.write_binding()
        transport=ControlledTransport()
        client=self.background(transport)
        self.assertIsNotNone(self.message(client,text='review this'))
        self.assertTrue(client.drain(3))
        self.assertEqual(len(transport.events),1)

    def test_slow_initialization_never_holds_message_and_exposes_gap(self):
        original=hook.ObserverClient
        entered,release=threading.Event(),threading.Event()
        transport=ControlledTransport()
        transport.status=lambda:dict(ok=True,job_id='job-1',project_id='project-1',profile_ref='profile-1',
            recovery_metadata={'instruction_trim_sha256':'sha256:'+hashlib.sha256(b'review this').hexdigest()})
        def slow_factory(*args,**kwargs):
            entered.set()
            if not release.wait(2):raise RuntimeError('test initialization timeout')
            return original(*args,**kwargs,transport=transport)
        with patch.object(hook,'ObserverClient',slow_factory), patch.object(hook,'_singleton',None), \
             patch.object(hook,'_configuration_attempt',None), patch.object(hook,'_configuration_reason',None), \
             patch.object(hook,'_startup_messages_unobserved',0), patch.dict(os.environ,{
                 'HERMES_BUZZ_PILOT_BINDING':str(self.path),'HERMES_BUZZ_PILOT_BINDING_SHA256':self.sha}):
            started=time.monotonic()
            hook.recover_startup('profile-1','bot-key',actual_hermes_home=self.binding['expected_hermes_home'])
            self.assertTrue(entered.wait(1))
            try:
                self.assertIsNone(self.message(hook))
                self.assertLess(time.monotonic()-started,.3)
            finally:
                release.set()
            deadline=time.monotonic()+2
            while hook._singleton is None and time.monotonic()<deadline:time.sleep(.005)
            self.assertIsNotNone(hook._singleton)
            self.assertEqual(hook.observation_health()['state'],'incomplete')
            self.assertEqual(hook.observation_health()['startup_messages_unobserved'],1)
            hook._singleton.close(2)

    def test_wire_trim_matches_node_boundary_without_erasing_internal_text(self):
        self.assertEqual(hook._wire_trim('\ufeff\u00a0A\r\n B\u00a0\ufeff'),'A\r\n B')
        for character in ('\u0085','\u200b','\u001c'):
            self.assertEqual(hook._wire_trim(character+'A'+character),character+'A'+character)

    def test_unrelated_tool_payload_is_not_copied_or_used_to_block_native(self):
        transport=ControlledTransport()
        client=self.background(transport)
        job=self.message(client)
        self.assertTrue(client.drain(2))
        payload=object()  # deliberately not JSON serializable
        seen=[]
        agent=SimpleNamespace(tool_start_callback=lambda *args:seen.append(args),tool_complete_callback=None)
        with patch.object(hook,'_singleton',client):
            hook.bind_agent_callbacks(agent,'session-key','actual-session')
            agent.tool_start_callback('call-1','terminal',payload)
        self.assertIs(seen[0][2],payload)
        self.assertEqual(client.health()['reason'],'observer_tool_unsupported')
        self.assertEqual([row['event_type'] for row in transport.events],['instruction_received'])


if __name__ == '__main__':
    unittest.main()
