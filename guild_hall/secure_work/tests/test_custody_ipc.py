"""M10 handoff acceptance: isolated protocol tests, not installed role proof."""
import unittest
import os
import subprocess
import sys
import time
from unittest.mock import patch

from soulforge_secure_work import custody_ipc
from soulforge_secure_work.ipc_pipe import ChannelError


class CustodyHandoffGate(unittest.TestCase):
    def test_concrete_session_and_sender_exist(self):
        from soulforge_secure_work.custody_ipc import CustodySession, serve_runtime
        self.assertTrue(callable(CustodySession) and callable(serve_runtime))

    def test_production_contract_has_no_direct_or_same_sid_fallback(self):
        with self.assertRaises(RuntimeError):
            custody_ipc.contract()
        from types import SimpleNamespace
        import json
        from test_ipc_protocol import SCOPE
        value = {"role": "controller", "purpose": "custody.deposit", "scope": SCOPE,
            "controller_sid": "S-1-5-21-1-2-3-1001", "sender_sid": "S-1-5-21-1-2-3-1001",
            "pipe": "soulforge-secure-synthetic-custody-01", "expires_at": int(time.time() * 1000) + 1000}
        with patch("soulforge_secure_work.launch_runtime.context", return_value={}), \
             patch("soulforge_secure_work.launch_runtime.call_launcher", return_value=SimpleNamespace(
                 returncode=0, stdout=json.dumps(value).encode())):
            with self.assertRaisesRegex(ChannelError, "CUSTODY_CHANNEL_AUTHORITY_HOLD"):
                custody_ipc.contract()

    def test_child_read_and_write_stalls_are_killed_with_bounded_cleanup(self):
        from soulforge_secure_work.custody_ipc import ChildPipe
        for operation in ("read", "write"):
            process = subprocess.Popen([sys.executable, "-I", "-B", "-c", "import time; time.sleep(10)"],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
            start = time.monotonic()
            stream = ChildPipe(process, start + .2)
            try:
                with self.assertRaisesRegex(ChannelError, "CUSTODY_BRIDGE_DEADLINE"):
                    stream.read(5) if operation == "read" else stream.write(b"x" * 1048576)
            finally:
                stream.stop()
            self.assertLess(time.monotonic() - start, 2)
            self.assertIsNotNone(process.returncode)
            self.assertFalse(stream.thread.is_alive())

    def test_six_commands_allow_clean_end_but_seventh_is_refused(self):
        from test_ipc_protocol import MemoryPipe, SCOPE
        from soulforge_secure_work.ipc import Frames
        import json
        binding = {"project_hint": "p", "occurrence_id": "o", "idempotency_key": "synthetic:id",
            "input_revision": "r1", "sha256": "a" * 64, "size": 1, "route_sha256": "b" * 64}
        for count in (6, 7):
            writer = MemoryPipe(b"")
            for i in range(count):
                Frames(writer).send({"kind": "custody_command", "sequence": i + 1,
                    "request": {"operation": "authorize", "binding": binding}})
            Frames(writer).send({"kind": "custody_end", "sequence": count})
            reader = MemoryPipe(bytes(writer.output))
            with patch.object(custody_ipc, "serve_connection") as serve:
                if count == 6:
                    custody_ipc.serve_session(reader, SCOPE, lambda: None, lambda *args: None)
                else:
                    with self.assertRaisesRegex(ChannelError, "CUSTODY_COMMAND_LIMIT"):
                        custody_ipc.serve_session(reader, SCOPE, lambda: None, lambda *args: None)
                self.assertEqual(serve.call_count, 6)
