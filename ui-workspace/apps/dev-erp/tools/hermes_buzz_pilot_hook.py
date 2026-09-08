"""Bounded observer for one issued Buzz pilot; never an inference executor.

The only configuration read is the dedicated, explicitly SHA-pinned binding.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import threading
import uuid
from datetime import datetime, timezone


class PilotCaptureAbort(BaseException):
    """Contained by the gateway task; bypasses tool callbacks' Exception catch."""
    def __init__(self, reason_code='pilot_capture_failed'):
        allowed = {'pilot_capture_failed', 'pilot_append_rejected', 'pilot_binding_invalid',
            'pilot_binding_expired', 'pilot_code_pin_invalid', 'pilot_event_invalid',
            'pilot_home_mismatch', 'pilot_identity_mismatch', 'pilot_instruction_conflict',
            'pilot_instruction_mismatch', 'pilot_event_order_invalid', 'pilot_binding_changed',
            'pilot_multi_select_unsupported'}
        self.reason_code = reason_code if reason_code in allowed else 'pilot_capture_failed'
        super().__init__(self.reason_code)


class SubprocessTransport:
    """An explicit argv/stdin seam. Production argv comes only from pinned binding."""
    def __init__(self, argv, timeout=10, *, status_argv=None):
        self.argv = tuple(argv)
        self.status_argv = tuple(status_argv) if status_argv else None
        self.timeout = timeout

    def append(self, raw):
        return self._invoke(self.argv, raw)

    def status(self):
        return self._invoke(self.status_argv, None) if self.status_argv else None

    def _invoke(self, argv, raw):
        proc = subprocess.run(argv, input=raw, capture_output=True,
                              timeout=self.timeout, shell=False,
                              creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if len(proc.stdout) > 65536:
            raise ValueError('observer_ack_invalid')
        ack = json.loads(proc.stdout)
        if proc.returncode == 2 and ack.get('ok') is False and ack.get('retryable') is False:
            raise PilotCaptureAbort('pilot_append_rejected')
        if proc.returncode != 0:
            raise ValueError('observer_ack_invalid')
        return ack


def _now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


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
        self.transport = transport or SubprocessTransport(base_argv + ['append'], status_argv=base_argv + ['status'])
        self.actual_hermes_home = actual_hermes_home or os.environ.get('HERMES_HOME')
        self.job = None
        self.aborted = False
        self.recovery_failed = False
        self.startup_checked = False

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
            observed_at=observed_at or _now(), payload=payload)
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
                return
            except PilotCaptureAbort:
                self.aborted = True
                job.terminal = True
                raise
            except Exception:
                if attempt == 1:
                    self.aborted = True
                    job.terminal = True
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
                                     and text.strip() == self.job.instruction_text)
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
                self._append(job, 'instruction_received', dict(message_id=message_id, text=text.strip()),
                             actor_pubkey, observed_at)
            except PilotCaptureAbort as error:
                if error.reason_code == 'pilot_append_rejected':
                    self._fail_lost_wait(session_key, message_id)
                raise
            job.instruction_text = text.strip()
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

    def _require(self, condition):
        if not condition or self.terminal:
            self.client.aborted = True
            self.terminal = True
            raise PilotCaptureAbort('pilot_event_order_invalid')

    def processing_complete(self, outcome=None):
        """Task-boundary cleanup only; never declares a result or writes an event."""
        with self.client.lock:
            self.processing_active = False

    def _emit(self, name, payload, actor=None):
        self.client._append(self, name, payload, actor)

    def bind_session(self, actual_id):
        with self.client.lock:
            self._require(bool(actual_id) and (self.session_id is None or self.session_id == actual_id))
            self.session_id = actual_id

    def tool_started(self, actual_id, name, args):
        with self.client.lock:
            self._require(self.session_id and not self.tool_id and actual_id and name == 'clarify')
            self._require(isinstance(args, dict))
            if args.get('multi_select') is True:
                self._emit('failed', {'reason_code': 'pilot_multi_select_unsupported'})
                self.client.aborted = True
                self.terminal = True
                raise PilotCaptureAbort('pilot_multi_select_unsupported')
            filtered = {k: args[k] for k in ('question', 'choices', 'multi_select') if k in args}
            self._emit('tool_started', dict(tool_call_id=actual_id, tool_name=name, input=filtered))
            self.tool_id = actual_id

    def question_registered(self, clarify_id, question, choices, multi_select):
        with self.client.lock:
            self._require(self.tool_id and not self.question_id and clarify_id)
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
            if self.wait_cancelled:
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


_singleton = None
_singleton_lock = threading.RLock()


def _configured_client(actual_hermes_home):
    global _singleton
    with _singleton_lock:
        path = os.environ.get('HERMES_BUZZ_PILOT_BINDING')
        sha = os.environ.get('HERMES_BUZZ_PILOT_BINDING_SHA256')
        if not path and not sha:
            return None
        if not path or not sha:
            raise PilotCaptureAbort('pilot_binding_invalid')
        if _singleton is None:
            _singleton = ObserverClient(path, sha, actual_hermes_home=actual_hermes_home)
        elif _singleton.path != Path(path) or _singleton.sha != sha:
            raise PilotCaptureAbort('pilot_binding_changed')
        return _singleton


def for_message(profile_ref, bot_pubkey, chat_id, actor_pubkey, session_key,
                message_id, text, observed_at, *, actual_hermes_home=None):
    """Disabled unless a dedicated reviewed binding is explicitly configured."""
    with _singleton_lock:
        client = _configured_client(actual_hermes_home)
        if client is None:
            return None
        return client.for_message(profile_ref, bot_pubkey, chat_id, actor_pubkey,
            session_key, message_id, text, observed_at, actual_hermes_home=actual_hermes_home)


def recover_startup(profile_ref, bot_pubkey, *, actual_hermes_home):
    """Call once after exact gateway identity lock succeeds, before polling."""
    with _singleton_lock:
        client = _configured_client(actual_hermes_home)
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
        if observation.wait_cancelled:
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
