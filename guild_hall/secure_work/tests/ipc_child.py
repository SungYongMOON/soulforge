"""ISOLATED PROTOCOL TEST ONLY: actual processes, same SID, no role proof.

This entry is never installed or called by sfx. No protected data or key paths
are arguments. Kit paths are read-only code, if the E14 fixture requests it.
"""
import json
import os
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
if os.environ.get("SOULFORGE_SECURE_WORK_KIT_ROOT"):
    sys.path.insert(0, str(Path(os.environ["SOULFORGE_SECURE_WORK_KIT_ROOT"]) / "src"))
from soulforge_secure_work.ipc import exchange, serve_connection
from soulforge_secure_work.ipc_pipe import Pipe, ChannelError


def main():
    role, name, other, expected, mode, scope_text, duration = sys.argv[1:]
    scope = json.loads(scope_text)
    deadline = time.monotonic() + float(duration)
    calls = 0
    def handler(body, attempt, live):
        nonlocal calls
        calls += 1
        if role == "sender":
            with Pipe.connect(other, expected, deadline) as target:
                return exchange(target, scope, attempt, body, live)
        if mode == "crash":
            print(json.dumps({"test_only": True, "worker_calls": calls, "crashed_after_delivery": True}), flush=True)
            os._exit(73)
        if mode == "large":
            return b"x" * 1048577
        if mode == "kit":
            from soulforge_secure_work.worker import build_reply
            return build_reply(body)
        return b"synthetic-response:" + body
    try:
        with Pipe.listen(name, expected, deadline) as pipe:
            receipt = serve_connection(pipe, scope, lambda: None, handler)
        print(json.dumps({"test_only": True, "role": role, "worker_calls": calls, **receipt}))
        return 0
    except Exception as error:
        print(json.dumps({"test_only": True, "role": role, "worker_calls": calls,
                          "code": str(error) if isinstance(error, ChannelError) else type(error).__name__}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
