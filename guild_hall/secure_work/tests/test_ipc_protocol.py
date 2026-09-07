"""Acceptance gates: isolated protocol tests are NOT physical role isolation.

Frozen before implementation: actual bounded local subprocess chain, kernel
SID rejection, strict framing/order, current scope/revocation at every relay,
no retry on ambiguity and production never uses same-SID/fake authority.
"""
import io
import json
import os
from pathlib import Path
import secrets
import struct
import subprocess
import sys
import time
import unittest
from unittest.mock import patch

from soulforge_secure_work import ipc
from soulforge_secure_work.ipc_pipe import Pipe, ChannelError, current_sid

SCOPE = {"project_ref": "p", "assignment_ref": "a", "assignment_epoch": 1,
         "task_ref": "task.synthetic", "policy_epoch": 1, "route_sha256": "a" * 64, "audience": "scripted.subprocess"}


def child(role, endpoint, other="unused", expected=None, mode="normal", scope=SCOPE, duration=3):
    env = {key: value for key, value in os.environ.items()
           if key.upper() in {"SYSTEMROOT", "WINDIR", "TEMP", "TMP", "SOULFORGE_SECURE_WORK_KIT_ROOT"}}
    return subprocess.Popen([sys.executable, "-I", "-B", str(Path(__file__).with_name("ipc_child.py")),
        role, endpoint, other, expected or current_sid(), mode, json.dumps(scope), str(duration)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)


def receipt(process):
    stdout, stderr = process.communicate(timeout=8)
    assert not stderr
    return process.returncode, json.loads(stdout)


def name():
    return "soulforge-secure-" + secrets.token_hex(16)


class MemoryPipe:
    def __init__(self, body):
        self.reader = io.BytesIO(body)
        self.deadline = time.monotonic() + 2
        self.output = bytearray()
    def read(self, size):
        value = self.reader.read(size)
        if len(value) != size:
            raise ChannelError("CHANNEL_CLOSED")
        return value
    def write(self, body):
        self.output.extend(body)


class IPCImportGate(unittest.TestCase):
    def test_concrete_transport_and_protocol_exist(self):
        from soulforge_secure_work.ipc import exchange, serve_connection
        from soulforge_secure_work.ipc_pipe import Pipe
        self.assertTrue(callable(exchange) and callable(serve_connection) and callable(Pipe.connect))

    def test_rejects_unbounded_wrong_type_duplicate_key_and_deep_control_before_body(self):
        for value in [struct.pack("!BI", 0, 8193), struct.pack("!BI", 1, 1),
                      struct.pack("!BI", 0, len(b'{"x":1,"x":2}')) + b'{"x":1,"x":2}',
                      struct.pack("!BI", 0, 7) + b'{"x":1']:
            with self.subTest(value=value[:5]), self.assertRaises(ChannelError):
                ipc.Frames(MemoryPipe(value)).receive()
        deep = b'{"x":' + b'[' * 1200 + b'0' + b']' * 1200 + b'}'
        with self.assertRaises(ChannelError):
            ipc.Frames(MemoryPipe(struct.pack("!BI", 0, len(deep)) + deep)).receive()

    def test_production_contract_rejects_direct_call_without_installed_context(self):
        with self.assertRaises(RuntimeError):
            ipc.runtime_contract(SCOPE)
        from soulforge_secure_work.worker import main
        with self.assertRaises(RuntimeError):
            main()

    def test_production_contract_refuses_even_os_matched_same_sid_roles(self):
        value = {"role": "controller", "scope": SCOPE, "sids": {key: "S-1-5-21-1-2-3-1001"
            for key in ("controller", "sender", "worker")}, "sender_pipe": name(), "worker_pipe": name(),
                 "expires_at": int(time.time() * 1000) + 10000}
        from types import SimpleNamespace
        with patch("soulforge_secure_work.launch_runtime.context", return_value={}), \
             patch("soulforge_secure_work.launch_runtime.call_launcher", return_value=SimpleNamespace(
                 returncode=0, stdout=json.dumps(value).encode())), \
             patch.object(ipc, "current_sid", return_value=value["sids"]["controller"]):
            with self.assertRaisesRegex(ChannelError, "CHANNEL_AUTHORITY_HOLD"):
                ipc.runtime_contract(SCOPE)


@unittest.skipUnless(os.name == "nt", "actual Windows kernel pipe transport")
class WindowsPipeProtocolTests(unittest.TestCase):
    def launch(self, *args, **kwargs):
        process = child(*args, **kwargs)
        def clean():
            if process.poll() is None:
                process.kill()
            process.communicate(timeout=5)
        self.addCleanup(clean)
        return process

    def test_actual_two_hop_byte_and_response_chain_with_current_checks(self):
        worker_name, sender_name = name(), name()
        worker = self.launch("worker", worker_name)
        sender = self.launch("sender", sender_name, worker_name)
        checks = []
        body = b'{"synthetic_released":true}'
        with Pipe.connect(sender_name, current_sid(), time.monotonic() + 3) as pipe:
            response = ipc.exchange(pipe, SCOPE, "b" * 64, body, lambda: checks.append(1))
        self.assertEqual(response, b"synthetic-response:" + body)
        self.assertGreaterEqual(len(checks), 7)
        for process in (sender, worker):
            code, result = receipt(process)
            self.assertEqual(code, 0, result)
            self.assertEqual(result["transport_calls"], 1)
            self.assertEqual(result["request_sha256"], ipc.digest(body))

    def test_os_server_identity_mismatch_is_rejected_before_business_bytes(self):
        endpoint = name()
        worker = self.launch("worker", endpoint, duration=.5)
        with self.assertRaisesRegex(ChannelError, "CHANNEL_PEER_MISMATCH"):
            Pipe.connect(endpoint, "S-1-5-21-1-2-3-9999", time.monotonic() + 1)
        code, result = receipt(worker)
        self.assertEqual(code, 2)
        self.assertEqual(result["worker_calls"], 0)

    def test_os_client_identity_mismatch_is_rejected_before_offer(self):
        endpoint = name()
        worker = self.launch("worker", endpoint, expected="S-1-5-21-1-2-3-9999", duration=.5)
        with Pipe.connect(endpoint, current_sid(), time.monotonic() + 1) as pipe:
            with self.assertRaises(ChannelError):
                ipc.exchange(pipe, SCOPE, "b" * 64, b"synthetic", lambda: None)
        code, result = receipt(worker)
        self.assertEqual((code, result["worker_calls"]), (2, 0))
        self.assertEqual(result["code"], "CHANNEL_PEER_MISMATCH")

    def test_different_scope_or_replayed_challenge_never_reaches_handler(self):
        for change in ("scope", "nonce"):
            endpoint = name()
            worker = self.launch("worker", endpoint, duration=.6)
            with Pipe.connect(endpoint, current_sid(), time.monotonic() + 1) as pipe:
                wire = ipc.Frames(pipe)
                challenge = wire.receive()
                wire.send({"kind": "offer", "nonce": "b" * 64 if change == "nonce" else challenge["nonce"],
                    "scope": {**SCOPE, "assignment_epoch": 2} if change == "scope" else SCOPE,
                    "attempt": "a" * 64, "sha256": ipc.digest(b"synthetic"), "size": 9})
                with self.assertRaises(ChannelError):
                    wire.receive()
            code, result = receipt(worker)
            self.assertEqual((code, result["worker_calls"]), (2, 0))

    def test_revocation_during_nested_worker_check_prevents_worker_execution(self):
        worker_name, sender_name = name(), name()
        worker = self.launch("worker", worker_name, duration=1)
        sender = self.launch("sender", sender_name, worker_name, duration=1)
        checks = 0
        def current():
            nonlocal checks
            checks += 1
            if checks == 6:
                raise ChannelError("SYNTHETIC_REVOKED")
        with Pipe.connect(sender_name, current_sid(), time.monotonic() + 2) as pipe:
            with self.assertRaisesRegex(ChannelError, "SYNTHETIC_REVOKED"):
                ipc.exchange(pipe, SCOPE, "b" * 64, b"synthetic", current)
        for process in (sender, worker):
            code, result = receipt(process)
            self.assertEqual(code, 2)
            if process is worker:
                self.assertEqual(result["worker_calls"], 0)

    def test_worker_loss_and_oversized_response_are_bounded_failures(self):
        for mode in ("crash", "large"):
            endpoint = name()
            worker = self.launch("worker", endpoint, mode=mode, duration=1)
            with Pipe.connect(endpoint, current_sid(), time.monotonic() + 2) as pipe:
                with self.assertRaises(ChannelError):
                    ipc.exchange(pipe, SCOPE, "b" * 64, b"synthetic", lambda: None)
            code, result = receipt(worker)
            self.assertNotEqual(code, 0)
            self.assertEqual(result["worker_calls"], 1)

    def test_partial_frame_stall_has_one_absolute_deadline(self):
        endpoint = name()
        worker = self.launch("worker", endpoint, duration=.5)
        with Pipe.connect(endpoint, current_sid(), time.monotonic() + 1) as pipe:
            ipc.Frames(pipe).receive()
            pipe.write(b"\x00\x00")
            code, result = receipt(worker)
        self.assertEqual((code, result["worker_calls"]), (2, 0))
        self.assertEqual(result["code"], "CHANNEL_DEADLINE")


if __name__ == "__main__":
    unittest.main()
