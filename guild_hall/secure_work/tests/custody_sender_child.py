"""ISOLATED SAME-SID TEST ONLY. No production launcher calls this fixture."""
import json
import os
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from soulforge_secure_work import custody_ipc, launch_runtime
from soulforge_secure_work.ipc_pipe import Pipe

endpoint, scope, sid, node, launcher = sys.argv[1:]
launch_runtime._STATE = {"node": node, "launcher": launcher,
    "environment": {key: value for key, value in os.environ.items() if key.upper() in {"SYSTEMROOT", "WINDIR"}}}
# The Node test launcher uses real loadCustodyAuthority with signed synthetic
# fixtures and synthetic OS metadata; this is not an installed role claim.
launch_runtime.recheck = lambda: None
try:
    with Pipe.listen(endpoint, sid, time.monotonic() + 12) as pipe:
        custody_ipc.serve_session(pipe, json.loads(scope), lambda: None, custody_ipc.run_operation)
    print(json.dumps({"test_only": True, "sender_pid": os.getpid(), "result": "SESSION_CLOSED"}))
except Exception as error:
    print(json.dumps({"test_only": True, "sender_pid": os.getpid(), "error_type": type(error).__name__}))
    raise SystemExit(2)
