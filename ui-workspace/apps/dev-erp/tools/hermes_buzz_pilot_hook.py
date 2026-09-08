"""Bounded observer for one issued Buzz pilot; never an inference executor.

The only configuration read is the dedicated, explicitly SHA-pinned binding.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
from pathlib import Path
import re
import queue
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone


class PilotCaptureAbort(BaseException):
    """Contained by the gateway task; bypasses tool callbacks' Exception catch."""
    def __init__(self, reason_code='pilot_capture_failed', *, node_code=None):
        allowed = {'pilot_capture_failed', 'pilot_append_rejected', 'pilot_binding_invalid',
            'pilot_binding_expired', 'pilot_code_pin_invalid', 'pilot_event_invalid',
            'pilot_home_mismatch', 'pilot_identity_mismatch', 'pilot_instruction_conflict',
            'pilot_instruction_mismatch', 'pilot_event_order_invalid', 'pilot_binding_changed',
            'pilot_multi_select_unsupported', 'pilot_batch_unsupported'}
        self.reason_code = reason_code if reason_code in allowed else 'pilot_capture_failed'
        self.node_code = node_code if isinstance(node_code, str) and re.fullmatch(r'BUZZ_PILOT_[A-Z0-9_]{1,80}', node_code) else None
        super().__init__(self.reason_code)


class SubprocessTransport:
    """An explicit argv/stdin seam. Production argv comes only from pinned binding."""
    def __init__(self, argv, timeout=10, *, status_argv=None, capture_argv=None):
        self.argv = tuple(argv)
        self.status_argv = tuple(status_argv) if status_argv else None
        self.capture_argv = tuple(capture_argv) if capture_argv else None
        self.timeout = timeout

    def append(self, raw):
        return self._invoke(self.argv, raw)

    def status(self):
        return self._invoke(self.status_argv, None) if self.status_argv else None

    def capture_health(self, raw):
        if not self.capture_argv:
            raise ValueError('capture_health_unavailable')
        return self._invoke(self.capture_argv, raw)

    def _invoke(self, argv, raw):
        proc = subprocess.run(argv, input=raw, capture_output=True,
                              timeout=self.timeout, shell=False,
                              creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if len(proc.stdout) > 65536:
            raise ValueError('observer_ack_invalid')
        ack = json.loads(proc.stdout)
        if proc.returncode == 2 and ack.get('ok') is False and ack.get('retryable') is False:
            raise PilotCaptureAbort('pilot_append_rejected', node_code=ack.get('code'))
        if proc.returncode != 0:
            raise ValueError('observer_ack_invalid')
        return ack


def _now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def _wire_trim(text):
    """Match the issuing Node's ECMAScript String.trim, not Python whitespace."""
    return text.strip('\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680'
        '\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a'
        '\u2028\u2029\u202f\u205f\u3000\ufeff')


def _timestamp(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('timestamp_timezone_missing')
    return parsed.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


class ObserverClient:
    def __init__(self, binding_path, binding_sha256, *, transport=None, actual_hermes_home=None):
        self.path = Path(binding_path)
        self.sha = binding_sha256
        self.lock = threading.RLock()
        self.binding = self._load()
        base_argv = [
            self.binding['node_path'], self.binding['observer_entry_path'],
            '--binding', str(self.path), '--binding-sha256', self.sha]
        self.transport = transport or SubprocessTransport(base_argv + ['append'],
            status_argv=base_argv + ['status'], capture_argv=base_argv + ['capture-health'])
        self.actual_hermes_home = actual_hermes_home or os.environ.get('HERMES_HOME')
        self.job = None
        self.aborted = False
        self.recovery_failed = False
        self.startup_checked = False
        self.acknowledged_events = 0
        self.observation_only = False

    def _load(self):
        try:
            raw = self.path.read_bytes()
            if len(raw) > 65536 or hashlib.sha256(raw).hexdigest() != self.sha:
                raise ValueError()
            binding = json.loads(raw)
            required = ('job_id', 'project_id', 'owner_account_id', 'expected_owner_pubkey',
                'expected_bot_pubkey', 'chat_id', 'profile_ref', 'instruction_sha256',
                'issued_at', 'expires_at', 'node_path', 'node_sha256', 'observer_entry_path',
                'observer_entry_sha256', 'observer_code_root', 'control_db_path', 'evidence_root',
                'repository_root', 'storage_class', 'owner_approval_ref', 'expected_hermes_home')
            if (binding['version'] != 1 or any(not isinstance(binding.get(k), str) or not binding[k] for k in required)
                    or binding['storage_class'] != 'owner_approved_shared_worksite'
                    or not isinstance(binding.get('observer_source_hashes'), dict)
                    or not binding['observer_source_hashes']
                    or not re.fullmatch(r'sha256:[0-9a-f]{64}', binding['instruction_sha256'])):
                raise ValueError()
            return binding
        except Exception:
            raise PilotCaptureAbort('pilot_binding_invalid') from None

    def _verify_current(self):
        b = self._load()
        try:
            issued = datetime.fromisoformat(b['issued_at'].replace('Z', '+00:00'))
            expires = datetime.fromisoformat(b['expires_at'].replace('Z', '+00:00'))
            if not issued <= datetime.now(timezone.utc) < expires:
                raise ValueError()
        except Exception:
            raise PilotCaptureAbort('pilot_binding_expired') from None
        try:
            root = Path(b['observer_code_root']).resolve(strict=True)
            pins = [(Path(b['node_path']), b['node_sha256']),
                    (Path(b['observer_entry_path']), b['observer_entry_sha256'])]
            for relative, sha in b['observer_source_hashes'].items():
                candidate = (root / relative).resolve(strict=True)
                if Path(relative).is_absolute() or not candidate.is_relative_to(root):
                    raise ValueError()
                pins.append((candidate, sha))
            for path, sha in pins:
                if not path.is_absolute() or not re.fullmatch(r'[0-9a-f]{64}', sha):
                    raise ValueError()
                with path.open('rb') as stream:
                    if hashlib.file_digest(stream, 'sha256').hexdigest() != sha:
                        raise ValueError()
        except Exception:
            raise PilotCaptureAbort('pilot_code_pin_invalid') from None

    def _append(self, job, event_type, payload, actor=None, observed_at=None):
        event = dict(version=1, observation_id=str(uuid.uuid4()),
            job_id=self.binding['job_id'], event_type=event_type,
            profile_ref=self.binding['profile_ref'], chat_id=self.binding['chat_id'],
            bot_pubkey=self.binding['expected_bot_pubkey'],
            actor_pubkey=actor or self.binding['expected_bot_pubkey'],
            session_key=job.session_key, session_id=job.session_id,
            observed_at=observed_at or getattr(self, '_observation_time', None) or _now(), payload=payload)
        try:
            event['observed_at'] = _timestamp(event['observed_at'])
            raw = json.dumps(event, ensure_ascii=False, separators=(',', ':'), sort_keys=True).encode('utf-8')
            if len(raw) > 1_048_576:
                raise ValueError()
        except Exception:
            self.aborted = True
            job.terminal = True
            raise PilotCaptureAbort('pilot_event_invalid') from None
        for attempt in range(2):
            try:
                self._verify_current()
                ack = self.transport.append(raw)
                if (ack.get('ok') is not True or ack.get('status') not in ('recorded', 'replayed')
                        or any(ack.get(k) != event[k] for k in ('job_id', 'event_type', 'observation_id'))):
                    raise ValueError()
                role = {'tool_started': 'tool_input', 'tool_input_prepared': 'tool_input_effective'}.get(event_type)
                if role:
                    refs = ack.get('evidence_refs')
                    body = json.dumps(payload['input'], ensure_ascii=False, separators=(',', ':'), sort_keys=True).encode('utf-8')
                    group = hashlib.sha256(json.dumps([event['job_id'], 'event', event['observation_id']],
                        ensure_ascii=False, separators=(',', ':')).encode('utf-8')).hexdigest()
                    if (not isinstance(refs, list) or len(refs) != 1 or not isinstance(refs[0], dict)
                            or refs[0].get('role') != role or refs[0].get('ref') != f'bp:bp-{group}:{role}'
                            or refs[0].get('sha256') != 'sha256:' + hashlib.sha256(body).hexdigest()
                            or refs[0].get('size') != len(body) or refs[0].get('mediaType') != 'application/json'):
                        raise ValueError()
                self.acknowledged_events += 1
                return ack
            except PilotCaptureAbort as error:
                self.aborted = True
                job.terminal = True
                if error.reason_code == 'pilot_append_rejected':
                    job.permanent_rejection = True
                    job.rejection_code = error.node_code
                raise
            except Exception:
                if attempt == 1:
                    self.aborted = True
                    job.terminal = True
                    job.uncertain_capture = True
                    raise PilotCaptureAbort() from None
            except BaseException:
                self.aborted = True
                job.terminal = True
                raise

    def for_message(self, profile_ref, bot_pubkey, chat_id, actor_pubkey,
                    session_key, message_id, text, observed_at, *, actual_hermes_home=None):
        with self.lock:
            b = self.binding
            if profile_ref != b['profile_ref'] or chat_id != b['chat_id']:
                return None
            if self.recovery_failed:
                raise PilotCaptureAbort()
            instruction_match = bool(self.job and isinstance(text, str)
                                     and _wire_trim(text) == self.job.instruction_text)
            known_answer = bool(self.job and self.job.answer and self.job.answer[0] == message_id)
            known_instruction = bool(self.job and (self.job.message_id == message_id
                                     or self.job.refused_message_id == message_id))
            if self.job and (self.job.terminal or self.aborted) and not (known_answer or known_instruction or instruction_match):
                return None
            if self.aborted:
                raise PilotCaptureAbort()
            home = actual_hermes_home or self.actual_hermes_home
            if not home or Path(home).resolve() != Path(b['expected_hermes_home']).resolve():
                raise PilotCaptureAbort('pilot_home_mismatch')
            if bot_pubkey != b['expected_bot_pubkey'] or actor_pubkey != b['expected_owner_pubkey']:
                raise PilotCaptureAbort('pilot_identity_mismatch')
            if self.job and (known_answer or instruction_match):
                if known_answer and text != self.job.answer[1]:
                    raise PilotCaptureAbort('pilot_instruction_conflict')
                if session_key != self.job.session_key:
                    raise PilotCaptureAbort('pilot_instruction_conflict')
                self.job.should_dispatch = False
                return self.job
            if self.job and not known_instruction:
                return None
            if self.job and not instruction_match:
                raise PilotCaptureAbort('pilot_instruction_mismatch')
            if self.job:
                if self.job.message_id != message_id or self.job.session_key != session_key:
                    raise PilotCaptureAbort('pilot_instruction_conflict')
                self.job.should_dispatch = False
                return self.job
            job = PilotObservation(self, session_key, message_id)
            try:
                self._append(job, 'instruction_received', dict(message_id=message_id, text=text),
                             actor_pubkey, observed_at)
            except PilotCaptureAbort as error:
                if error.reason_code == 'pilot_append_rejected' and not self.observation_only:
                    self._fail_lost_wait(session_key, message_id)
                raise
            job.instruction_text = _wire_trim(text)
            self.job = job
            return job

    def _fail_lost_wait(self, incoming_session_key, message_id):
        """A scoped rejected admission may expose a lost process-local wait."""
        status_reader = getattr(self.transport, 'status', None)
        if status_reader is None:
            if incoming_session_key is None:
                raise PilotCaptureAbort()
            return False
        try:
            self._verify_current()
            status = status_reader()
            if status is None and isinstance(self.transport, SubprocessTransport) and self.transport.status_argv is None:
                if incoming_session_key is None:
                    raise PilotCaptureAbort()
                return False
            if not isinstance(status, dict) or status.get('ok') is not True:
                raise PilotCaptureAbort()
            if any(status.get(k) != self.binding[k] for k in ('job_id', 'project_id', 'profile_ref')):
                raise PilotCaptureAbort()
            known_states = {'issued', 'running', 'tool_running', 'question_registered',
                'waiting_owner', 'question_delivery_failed', 'question_delivery_unknown',
                'answer_received', 'answer_accepted', 'resumed', 'tool_completed', 'final_produced',
                'delivered', 'final_delivery_failed', 'final_delivery_unknown', 'failed',
                'cancelled', 'capture_incomplete', 'expired'}
            if status.get('state') not in known_states:
                raise PilotCaptureAbort()
            if status['state'] != 'waiting_owner':
                return False
            if status.get('recorded_state') != 'waiting_owner':
                raise PilotCaptureAbort()
            observed = status.get('recovery_metadata')
            if (not isinstance(observed, dict) or not isinstance(observed.get('session_key'), str)
                    or not observed['session_key']
                    or (incoming_session_key is not None and observed['session_key'] != incoming_session_key)
                    or not isinstance(observed.get('session_id'), str) or not observed['session_id']):
                raise PilotCaptureAbort()
            recovery = PilotObservation(self, observed['session_key'], None)
            recovery.session_id = observed['session_id']
            recovery.refused_message_id = message_id
            recovery.should_dispatch = False
            self.job = recovery
            self.recovery_failed = True
            self.aborted = True
            self._append(recovery, 'failed', {'reason_code': 'gateway_wait_lost'})
            recovery.terminal = True
            return True
        except Exception:
            raise PilotCaptureAbort() from None

    def recover_startup(self, profile_ref, bot_pubkey, *, actual_hermes_home):
        """Explicit once-only gateway startup recovery; never a constructor side effect."""
        with self.lock:
            if profile_ref != self.binding['profile_ref']:
                return False
            if bot_pubkey != self.binding['expected_bot_pubkey']:
                raise PilotCaptureAbort('pilot_identity_mismatch')
            if (not actual_hermes_home or Path(actual_hermes_home).resolve()
                    != Path(self.binding['expected_hermes_home']).resolve()):
                raise PilotCaptureAbort('pilot_home_mismatch')
            if self.startup_checked or (self.job and self.job.processing_active and not self.aborted):
                return False
            if self.recovery_failed:
                # An uncertain failure append exhausted its identical-byte retry;
                # a reconnect must not mint a new observation for that append.
                raise PilotCaptureAbort()
            recovered = self._fail_lost_wait(None, None)
            self.startup_checked = True
            return recovered

    def for_session(self, key):
        with self.lock:
            if not self.job or self.job.session_key != key or not self.job.processing_active:
                return None
            if self.aborted:
                raise PilotCaptureAbort()
            return self.job if not self.job.terminal else None

    def finish_session(self, key):
        with self.lock:
            if self.job and self.job.session_key == key:
                self.job.processing_complete()


class PilotObservation:
    def __init__(self, client, session_key, message_id):
        self.client = client
        self.session_key = session_key
        self.session_id = None
        self.message_id = message_id
        self.refused_message_id = None
        self.instruction_message_id = message_id
        self.instruction_text = None
        self.chat_id = client.binding['chat_id']
        self.bot_pubkey = client.binding['expected_bot_pubkey']
        self.should_dispatch = True
        self.tool_id = None
        self.tool_input_ref = None
        self.input_prepared = False
        self.question_id = None
        self.answer = None
        self.answer_actor = None
        self.accepted = False
        self.did_resume = False
        self.tool_done = False
        self.final = None
        self.terminal = False
        self.final_delivered = False
        self.resolved_response = None
        self.wait_cancelled = False
        self.processing_active = True
        self.permanent_rejection = False
        self.rejection_code = None
        self.uncertain_capture = False
        self.failure_capture_attempted = False
        self.failure_recorded = False

    def _require(self, condition):
        if not condition or self.terminal:
            self.client.aborted = True
            self.terminal = True
            raise PilotCaptureAbort('pilot_event_order_invalid')

    def processing_complete(self, outcome=None):
        """Task-boundary cleanup only; never declares a result or writes an event."""
        with self.client.lock:
            self.processing_active = False

    def close_capture_failure(self):
        """Completion-only closeout of a definite rejected observation, at most once."""
        with self.client.lock:
            if not self.permanent_rejection or self.uncertain_capture or self.failure_capture_attempted:
                return False
            self.client._verify_current()
            status_reader = getattr(self.client.transport, 'status', None)
            if status_reader is None:
                raise PilotCaptureAbort()
            try:
                status = status_reader()
                if (not isinstance(status, dict) or status.get('ok') is not True
                        or any(status.get(k) != self.client.binding[k] for k in ('job_id', 'project_id', 'profile_ref'))):
                    raise PilotCaptureAbort()
                observed = status.get('recovery_metadata')
                if (not isinstance(observed, dict) or not self.session_id
                        or observed.get('session_key') != self.session_key or observed.get('session_id') != self.session_id):
                    raise PilotCaptureAbort()
                active = {'running', 'tool_running', 'tool_input_prepared', 'question_registered',
                    'waiting_owner', 'question_delivery_failed', 'question_delivery_unknown',
                    'answer_received', 'answer_accepted', 'resumed', 'tool_completed', 'final_produced'}
                if (status.get('state') not in active or status.get('recorded_state') != status.get('state')
                        or 'pending_observation_id' not in status or status['pending_observation_id'] is not None):
                    return False
                self.failure_capture_attempted = True
                self.client._append(self, 'failed', {'reason_code': 'gateway_capture_rejected'})
                self.failure_recorded = True
                self.terminal = True
                return True
            except Exception:
                raise PilotCaptureAbort() from None

    def _emit(self, name, payload, actor=None):
        return self.client._append(self, name, payload, actor)

    def bind_session(self, actual_id):
        with self.client.lock:
            self._require(bool(actual_id) and (self.session_id is None or self.session_id == actual_id))
            self.session_id = actual_id

    def tool_started(self, actual_id, name, args):
        with self.client.lock:
            self._require(self.session_id and not self.tool_id and actual_id and name == 'clarify')
            self._require(isinstance(args, dict))
            if args.get('questions') is not None and args.get('questions') != []:
                self.client.aborted = True
                self.terminal = True
                raise PilotCaptureAbort('pilot_batch_unsupported')
            if args.get('multi_select') is True:
                self.client.aborted = True
                self.terminal = True
                raise PilotCaptureAbort('pilot_multi_select_unsupported')
            filtered = {k: args[k] for k in ('question', 'choices', 'multi_select') if k in args}
            ack = self._emit('tool_started', dict(tool_call_id=actual_id, tool_name=name,
                input_contract='prepared_v2', input=filtered))
            self.tool_input_ref = ack['evidence_refs'][0]['ref']
            self.tool_id = actual_id

    def tool_input_prepared(self, question, choices, multi_select):
        """Record the actual native callback values; do not normalize presentation."""
        with self.client.lock:
            self._require(self.tool_id and self.tool_input_ref and not self.input_prepared)
            self._emit('tool_input_prepared', dict(tool_call_id=self.tool_id, tool_name='clarify',
                tool_input_ref=self.tool_input_ref,
                input=dict(question=question, choices=choices, multi_select=multi_select)))
            self.input_prepared = True

    def question_registered(self, clarify_id, question, choices, multi_select):
        with self.client.lock:
            self._require(self.tool_id and self.input_prepared and not self.question_id and clarify_id)
            self._emit('question_registered', dict(clarify_id=clarify_id, tool_call_id=self.tool_id,
                       question=question, choices=choices, multi_select=multi_select))
            self.question_id = clarify_id

    @staticmethod
    def _delivery(result):
        success = getattr(result, 'success', None)
        raw = getattr(result, 'raw_response', None)
        accepted = raw.get('accepted') if isinstance(raw, dict) else None
        message_id = getattr(result, 'message_id', None)
        message_id = message_id if isinstance(message_id, str) and message_id else None
        status = 'failed' if success is False or accepted is False else (
            'sent' if success is True and accepted is True and message_id is not None else 'unknown')
        return dict(delivery_status=status, message_id=message_id)

    def question_delivery(self, clarify_id, result):
        with self.client.lock:
            self._require(clarify_id == self.question_id and self.question_id)
            self._emit('question_delivery', dict(clarify_id=clarify_id, **self._delivery(result)))

    def answer_received(self, clarify_id, message_id, text, actor):
        with self.client.lock:
            self._require(clarify_id == self.question_id and self.question_id and not self.answer
                          and message_id and actor == self.client.binding['expected_owner_pubkey'])
            self._emit('answer_received', dict(clarify_id=clarify_id, message_id=message_id, text=text), actor)
            self.answer = (message_id, text)
            self.answer_actor = actor

    def answer_accepted(self, clarify_id, resolved_response=None):
        with self.client.lock:
            self._require(clarify_id == self.question_id and self.answer and not self.accepted)
            self._emit('answer_accepted', dict(clarify_id=clarify_id, message_id=self.answer[0]), self.answer_actor)
            self.accepted = True
            self.resolved_response = self.answer[1] if resolved_response is None else str(resolved_response)

    def resumed(self, clarify_id, actual_reply):
        with self.client.lock:
            if actual_reply is None or (actual_reply == '' and not self.accepted):
                self._require(clarify_id == self.question_id and not self.accepted and not self.did_resume)
                self.wait_cancelled = True
                return
            self._require(clarify_id == self.question_id and self.accepted and not self.did_resume
                          and actual_reply == self.resolved_response)
            self._emit('resumed', dict(clarify_id=clarify_id, tool_call_id=self.tool_id))
            self.did_resume = True

    def tool_completed(self, actual_id, name, args, result):
        with self.client.lock:
            self._require(actual_id == self.tool_id and name == 'clarify' and not self.tool_done
                          and (self.did_resume or self.wait_cancelled))
            output = result
            if isinstance(result, str):
                try:
                    decoded = json.loads(result)
                except ValueError:
                    decoded = None
                if isinstance(decoded, dict):
                    output = decoded.get('user_response')
            elif isinstance(result, dict):
                output = result.get('user_response')
            self._require(isinstance(output, str))
            self._emit('tool_completed', dict(tool_call_id=actual_id, tool_name=name, output=output,
                       outcome='cancelled' if self.wait_cancelled else 'completed'))
            self.tool_done = True
            if self.wait_cancelled and not self.client.observation_only:
                self.terminal = True

    def final_response(self, text):
        with self.client.lock:
            self._require(self.final is None and (not self.tool_id or self.tool_done))
            self._emit('final_response', dict(text=text))
            self.final = text

    def matches_final(self, text):
        with self.client.lock:
            return self.final is not None and self.final == text

    def final_delivery(self, result):
        with self.client.lock:
            self._require(self.final is not None)
            self._emit('final_delivery', self._delivery(result))
            self.final_delivered = self._delivery(result)['delivery_status'] == 'sent'
            self.terminal = True

    def failed(self, safe_reason='pilot_execution_failed'):
        with self.client.lock:
            self._require(True)
            self._emit('failed', dict(reason_code='pilot_execution_failed'))
            self.terminal = True

    def cancelled(self, safe_reason='pilot_cancelled'):
        with self.client.lock:
            self._require(True)
            self._emit('cancelled', dict(reason_code='pilot_cancelled'))
            self.terminal = True


class BackgroundObserverClient:
    """Bounded, observation-only bridge; native execution never waits for an ACK.

    The strict recorder owns evidence validation on one background thread. A
    rejected/lost record stops this capture stream, not the agent. No authority,
    execution retry, dispatch suppression, or native memory mutation lives here.
    Queued observations are volatile: health is not a durable-receipt claim.
    """
    def __init__(self, recorder, *, instruction_trim_sha256, max_pending=64,
                 capture_health_enabled=False, heartbeat_seconds=15, initial_capture_gap=False):
        if not isinstance(instruction_trim_sha256, str) or not re.fullmatch(r'sha256:[0-9a-f]{64}', instruction_trim_sha256):
            raise PilotCaptureAbort('pilot_event_invalid')
        if type(max_pending) is not int or not 1 <= max_pending <= 64:
            raise ValueError('observer_queue_limit_invalid')
        self.recorder = recorder
        self.recorder.observation_only = True
        self.instruction_trim_sha256 = instruction_trim_sha256
        self.path, self.sha, self.binding = recorder.path, recorder.sha, recorder.binding
        self.actual_hermes_home = recorder.actual_hermes_home
        self.lock = threading.RLock()
        self.queue = queue.Queue(maxsize=max_pending)
        self.stop = threading.Event()
        self.job = None
        self.pending = 0
        self.recorded = 0
        self.offered = 0
        self.reason = 'observer_startup_gap' if initial_capture_gap else None
        self.capture_health_enabled = capture_health_enabled
        self.capture_ready = not capture_health_enabled
        self.observer_instance_id = str(uuid.uuid4())
        self.heartbeat_seconds = heartbeat_seconds
        self._capture_last_time = 0
        self._capture_last_reason = None
        self._capture_last_recorded = -1
        self._capture_last_sequence = 0
        self._capture_transport_failed = False
        self._processing_finished = False
        self.worker = threading.Thread(target=self._run, name='buzz-pilot-observer', daemon=True)
        self.worker.start()

    def _degrade(self, reason):
        with self.lock:
            if self.reason is None:
                self.reason = reason

    def _enqueue(self, method, args, kwargs=None):
        # Immutable JSON snapshot: no caller-owned mutable object crosses threads.
        try:
            raw = json.dumps([args, kwargs or {}], ensure_ascii=False, separators=(',', ':'))
            if len(raw.encode('utf8')) > 65536:
                self._degrade('observer_event_too_large')
                return
            copied_args, copied_kwargs = json.loads(raw)
            with self.lock:
                if self.reason or self.stop.is_set():
                    return
                self.queue.put_nowait((method, copied_args, copied_kwargs, _now()))
                self.pending += 1
                if method not in ('bind_session','processing_complete') and not (
                        method == 'resumed' and copied_args[1] is None):
                    self.offered += 1
        except queue.Full:
            self._degrade('observer_queue_full')
        except Exception:
            self._degrade('observer_event_invalid')

    def _run(self):
        if self.capture_health_enabled:
            if not self._publish_capture('started'):
                return
            self.capture_ready = True
        while not self.stop.is_set() or not self.queue.empty():
            try:
                method, args, kwargs, observed_at = self.queue.get(timeout=.1)
            except queue.Empty:
                self._maybe_publish_capture()
                continue
            try:
                if self.reason is None:
                    self.recorder._observation_time = observed_at
                    if method == 'for_message':
                        self.recorder.for_message(*args, **kwargs)
                    else:
                        if self.recorder.job is None:
                            raise PilotCaptureAbort('pilot_event_order_invalid')
                        if method.endswith('_projected'):
                            from types import SimpleNamespace
                            method = method.removesuffix('_projected')
                            args[-1] = SimpleNamespace(**args[-1])
                        getattr(self.recorder.job, method)(*args, **kwargs)
                        if method == 'processing_complete':
                            self._processing_finished = True
                    with self.lock:
                        self.recorded = self.recorder.acknowledged_events
            except PilotCaptureAbort as error:
                self._degrade(error.reason_code)
            except Exception:
                self._degrade('observer_worker_failed')
            finally:
                with self.lock:
                    self.pending -= 1
                self.queue.task_done()
            self._maybe_publish_capture()
            if self._processing_finished and self.pending == 0:
                self.stop.set()
        if self.capture_health_enabled and not self._capture_transport_failed:
            # A close marker is about the recorder, not a business-success event.
            # Never call an unfinished captured native turn a clean close.
            if self.recorder.job and not self.recorder.job.terminal:
                self._degrade('observer_shutdown_incomplete')
            self._publish_capture('closed')

    def _maybe_publish_capture(self):
        if not self.capture_health_enabled or self._capture_transport_failed:
            return
        with self.lock:
            changed_gap = self.reason != self._capture_last_reason
        if changed_gap or time.monotonic()-self._capture_last_time >= self.heartbeat_seconds:
            self._publish_capture('heartbeat')

    def _publish_capture(self, phase):
        # Worker only. A hung disk/Node call cannot own a foreground callback lock.
        with self.lock:
            gap = self.reason
            packet = dict(version=1,observer_instance_id=self.observer_instance_id,phase=phase,
                observed_at=_now(),pending_operations=self.offered-self.recorded,recorded_operations=self.recorded,
                gap_reason=(gap if gap in ('observer_startup_gap','observer_shutdown_incomplete') else
                            'observer_capture_gap' if gap else None))
        raw = json.dumps(packet,separators=(',',':'),sort_keys=True).encode('utf8')
        for attempt in range(2):
            try:
                self.recorder._verify_current()
                ack = self.recorder.transport.capture_health(raw)
                if (not isinstance(ack,dict) or set(ack) != {'ok','version','status','job_id',
                        'observer_instance_id','phase','health_sequence'}
                        or ack.get('ok') is not True or type(ack.get('version')) is not int or ack['version'] != 1
                        or ack.get('status') not in ('recorded','replayed') or ack.get('job_id') != self.binding['job_id']
                        or type(ack.get('health_sequence')) is not int
                        or not self._capture_last_sequence < ack['health_sequence'] <= 4096
                        or ack.get('observer_instance_id') != self.observer_instance_id
                        or ack.get('phase') != phase):
                    raise ValueError('capture_health_ack_invalid')
                self._capture_last_time = time.monotonic()
                self._capture_last_reason = gap
                self._capture_last_recorded = packet['recorded_operations']
                self._capture_last_sequence = ack['health_sequence']
                return True
            except PilotCaptureAbort:
                break
            except Exception:
                if attempt == 0:
                    continue  # Same instance, timestamp and bytes after uncertain ACK.
        self._capture_transport_failed = True
        self._degrade('observer_checkpoint_unavailable')
        return False

    def health(self):
        with self.lock:
            return dict(state='incomplete' if self.reason else ('initializing' if not self.capture_ready else
                        'pending' if self.pending else 'current'),
                        reason=self.reason, pending=self.pending, recorded_operations=self.recorded,
                        durable_queue=False)

    def drain(self, timeout):
        """Explicit test/maintenance wait; never called by native callbacks."""
        deadline = time.monotonic() + timeout
        while self.health()['pending'] and time.monotonic() < deadline:
            self.stop.wait(.005)
        return self.health()['pending'] == 0

    def close(self, timeout=0):
        self.stop.set()
        if timeout:
            self.worker.join(timeout)
        return not self.worker.is_alive()

    def recover_startup(self, *args, **kwargs):
        # A missing recorder is not evidence that a native conversation failed.
        return False

    def for_message(self, profile_ref, bot_pubkey, chat_id, actor_pubkey,
                    session_key, message_id, text, observed_at, *, actual_hermes_home=None):
        with self.lock:
            b = self.binding
            if (self.job is not None or self.reason or not isinstance(text, str)
                    or profile_ref != b['profile_ref'] or chat_id != b['chat_id']
                    or bot_pubkey != b['expected_bot_pubkey'] or actor_pubkey != b['expected_owner_pubkey']
                    or os.path.normcase(os.path.normpath(actual_hermes_home or self.actual_hermes_home or ''))
                       != os.path.normcase(os.path.normpath(b['expected_hermes_home']))
                    or 'sha256:' + hashlib.sha256(_wire_trim(text).encode('utf8')).hexdigest() != self.instruction_trim_sha256):
                return None
            if not self.capture_ready:
                self._degrade('observer_startup_gap')
                return None
            self.job = BackgroundObservation(self, session_key, message_id)
            self._enqueue('for_message', [profile_ref, bot_pubkey, chat_id, actor_pubkey,
                session_key, message_id, text, observed_at], {'actual_hermes_home':actual_hermes_home})
            return self.job

    def for_session(self, key):
        with self.lock:
            return self.job if self.job and self.job.session_key == key and self.job.processing_active else None

    def finish_session(self, key):
        job = self.for_session(key)
        if job:
            job.processing_complete()


class BackgroundObservation:
    """Only mirrors values already observed by native callbacks, never ACK state."""
    METHODS = frozenset(('bind_session', 'tool_started', 'tool_input_prepared',
        'question_registered', 'question_delivery', 'answer_received', 'answer_accepted',
        'resumed', 'tool_completed', 'final_response', 'final_delivery', 'failed',
        'cancelled', 'processing_complete'))

    def __init__(self, client, session_key, message_id):
        self.client, self.session_key = client, session_key
        self.instruction_message_id = message_id
        self.chat_id, self.bot_pubkey = client.binding['chat_id'], client.binding['expected_bot_pubkey']
        self.should_dispatch = True  # observation has no dispatch authority
        self.terminal = False
        self.accepted = False
        self.wait_cancelled = False
        self.processing_active = True
        self.final = None

    def matches_final(self, text):
        return self.final is not None and self.final == text

    def close_capture_failure(self):
        return False  # capture failure must never be reported as execution failure

    def mark_capture_gap(self, reason):
        self.client._degrade('observer_final_unobserved')

    def __getattr__(self, name):
        if name not in self.METHODS:
            raise AttributeError(name)
        def observe(*args, **kwargs):
            if name in ('tool_started','tool_completed') and (len(args) < 2 or args[1] != 'clarify'):
                self.client._degrade('observer_tool_unsupported')
                return  # No copying of unrelated tool arguments/results; native callbacks still run.
            if name == 'answer_accepted':
                self.accepted = True
            elif name == 'resumed':
                self.wait_cancelled = args[1] is None
            elif name == 'final_response':
                self.final = args[0]
            elif name in ('final_delivery', 'failed', 'cancelled'):
                self.terminal = True
            elif name == 'processing_complete':
                self.processing_active = False
                args = ()  # enum values are not part of the evidence contract
            if name in ('question_delivery', 'final_delivery'):
                result = args[-1]
                raw = getattr(result, 'raw_response', None)
                projected = dict(success=getattr(result, 'success', None),
                    message_id=getattr(result, 'message_id', None),
                    raw_response={'accepted':raw.get('accepted')} if isinstance(raw, dict) else None)
                # Reconstructed only inside the worker; do not serialize extra SDK data.
                self.client._enqueue(name + '_projected', [*args[:-1], projected])
            else:
                self.client._enqueue(name, args, kwargs)
            if name == 'processing_complete':
                self.client.close()  # nonblocking; the worker drains and closes its marker
        return observe


_singleton = None
_singleton_lock = threading.RLock()
_configuration_attempt = None
_configuration_reason = None
_startup_messages_unobserved = 0


def _initialize_background(path, sha, actual_hermes_home):
    global _singleton, _configuration_reason
    client = None
    reason = None
    try:
        recorder = ObserverClient(path, sha, actual_hermes_home=actual_hermes_home)
        recorder._verify_current()
        status = recorder.transport.status()
        if (not isinstance(status, dict) or status.get('ok') is not True
                or any(status.get(k) != recorder.binding[k] for k in ('job_id', 'project_id', 'profile_ref'))):
            raise PilotCaptureAbort('pilot_event_invalid')
        metadata = status.get('recovery_metadata')
        previous_capture = status.get('capture_health') or {}
        initial_gap = (status.get('recorded_state') != 'issued'
            or previous_capture.get('phase') in ('started','heartbeat')
            or previous_capture.get('state') == 'unconfirmed')
        client = BackgroundObserverClient(recorder, instruction_trim_sha256=(
            metadata.get('instruction_trim_sha256') if isinstance(metadata, dict) else None),
            capture_health_enabled=True, initial_capture_gap=initial_gap)
    except PilotCaptureAbort as error:
        reason = error.reason_code
    except Exception:
        reason = 'observer_initialization_failed'
    with _singleton_lock:
        if _configuration_attempt == (path, sha):
            if client and _startup_messages_unobserved:
                client._degrade('observer_startup_gap')
            _singleton, _configuration_reason = client, reason
        elif client:
            client.close()


def observation_health():
    """Process-local capture status, not execution liveness or durable custody."""
    with _singleton_lock:
        if _singleton:
            health = _singleton.health()
            if _startup_messages_unobserved:
                health.update(state='incomplete', reason=health['reason'] or 'observer_startup_gap')
            health['startup_messages_unobserved'] = _startup_messages_unobserved
            return health
        return dict(state='incomplete' if _configuration_reason or _startup_messages_unobserved else (
            'initializing' if _configuration_attempt else 'disabled'), reason=_configuration_reason,
            pending=0, recorded_operations=0, durable_queue=False,
            startup_messages_unobserved=_startup_messages_unobserved)


def _configured_client(actual_hermes_home):
    global _singleton, _configuration_attempt, _configuration_reason
    with _singleton_lock:
        path = os.environ.get('HERMES_BUZZ_PILOT_BINDING')
        sha = os.environ.get('HERMES_BUZZ_PILOT_BINDING_SHA256')
        if not path and not sha:
            return None
        if not path or not sha:
            _configuration_reason = 'pilot_binding_invalid'
            return None
        if _configuration_attempt != (path, sha):
            if _singleton:
                _singleton.close()
            _singleton = None
            _configuration_reason = None
            _configuration_attempt = (path, sha)
            threading.Thread(target=_initialize_background, args=(path, sha, actual_hermes_home),
                             name='buzz-observer-initialize', daemon=True).start()
        return _singleton


def for_message(profile_ref, bot_pubkey, chat_id, actor_pubkey, session_key,
                message_id, text, observed_at, *, actual_hermes_home=None):
    """Disabled unless a dedicated reviewed binding is explicitly configured."""
    global _startup_messages_unobserved
    with _singleton_lock:
        try:
            client = _configured_client(actual_hermes_home)
        except PilotCaptureAbort as error:
            logging.getLogger(__name__).warning('Buzz observation unavailable: %s', error.reason_code)
            return None
        if client is None:
            if _configuration_attempt:
                _startup_messages_unobserved += 1
            return None
        return client.for_message(profile_ref, bot_pubkey, chat_id, actor_pubkey,
            session_key, message_id, text, observed_at, actual_hermes_home=actual_hermes_home)


def recover_startup(profile_ref, bot_pubkey, *, actual_hermes_home):
    """Call once after exact gateway identity lock succeeds, before polling."""
    with _singleton_lock:
        try:
            client = _configured_client(actual_hermes_home)
        except PilotCaptureAbort as error:
            logging.getLogger(__name__).warning('Buzz observation unavailable: %s', error.reason_code)
            return False
        return client.recover_startup(profile_ref, bot_pubkey, actual_hermes_home=actual_hermes_home) if client else False


def for_session(key):
    with _singleton_lock:
        return _singleton.for_session(key) if _singleton else None


def finish_session(key):
    """Cleanup the exact failed/finished task without consulting capture status."""
    with _singleton_lock:
        if _singleton:
            _singleton.finish_session(key)


def bind_agent_callbacks(agent, session_key, session_id):
    """Observe actual executor callbacks while preserving the existing callbacks."""
    observation = for_session(session_key)
    if observation is None:
        return None
    observation.bind_session(session_id)
    previous_start = getattr(agent, 'tool_start_callback', None)
    previous_complete = getattr(agent, 'tool_complete_callback', None)

    def started(call_id, name, args):
        observation.tool_started(call_id, name, args)
        if previous_start is not None:
            return previous_start(call_id, name, args)

    def completed(call_id, name, args, result):
        observation.tool_completed(call_id, name, args, result)
        if observation.wait_cancelled and not isinstance(observation, BackgroundObservation):
            try:
                if previous_complete is not None:
                    previous_complete(call_id, name, args, result)
            except Exception:
                raise PilotCaptureAbort() from None
            raise PilotCaptureAbort()
        if previous_complete is not None:
            return previous_complete(call_id, name, args, result)

    agent.tool_start_callback = started
    agent.tool_complete_callback = completed
    return observation
