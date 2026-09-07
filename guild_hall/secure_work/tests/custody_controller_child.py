"""Real adapter/SQLite/pipe/Node bridge, isolated synthetic authority fixture."""
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from soulforge_secure_work import custody_ipc
from soulforge_secure_work.adapters import TongsCustodyAdapter
from soulforge_secure_work.ipc_pipe import current_sid

root, node, launcher, mode = sys.argv[1:]
root = Path(root)
fixture = json.loads((root / "controller-fixture.json").read_bytes())
scope = {"project_ref": "synthetic.project", "assignment_ref": "synthetic.assignment", "assignment_epoch": 1,
    "task_ref": "synthetic.task", "policy_epoch": 1, "route_sha256": "a" * 64, "audience": "scripted.subprocess"}
endpoint = "soulforge-secure-" + secrets.token_hex(16)
sid = current_sid()
bound = {"role": "controller", "purpose": "custody.deposit", "scope": scope, "controller_sid": sid,
    "sender_sid": sid, "pipe": endpoint, "expires_at": int(time.time() * 1000) + 12000}
# Direct protocol fixture only: production contract rejects same-SID roles.
custody_ipc.contract = lambda *args, **kwargs: bound
process = subprocess.Popen([sys.executable, "-I", "-B", str(Path(__file__).with_name("custody_sender_child.py")),
    endpoint, json.dumps(scope), sid, node, launcher], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    env={k: v for k, v in os.environ.items() if k.upper() in {"SYSTEMROOT", "WINDIR", "TEMP", "TMP"}},
    creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
(root / "sender-pid.json").write_text(json.dumps({"pid": process.pid}))
adapter = TongsCustodyAdapter(None, fixture["ingress_url"], "", None, True, use_runtime_authority=True)
checks = 0
def current():
    global checks
    checks += 1
    if (root / "controller-revoked").exists():
        raise RuntimeError("SYNTHETIC_SOURCE_AUTHORITY_CHANGED")
try:
    result = adapter.deposit(root / "candidate.md", "synthetic.project", "synthetic.occurrence", "synthetic:idempotency",
        input_revision="r1", expected_sha256=fixture["sha256"], expected_size=fixture["size"], execution_scope=scope, current=current)
    receipt = {"ok": True, "result": result}
except Exception as error:
    receipt = {"ok": False, "code": getattr(error, "reason", type(error).__name__)}
finally:
    try:
        out, err = process.communicate(timeout=4)
    except subprocess.TimeoutExpired:
        process.kill(); out, err = process.communicate()
    receipt.update({"test_kind": "ISOLATED_SAME_SID_PROTOCOL_TEST", "sender_exit": process.returncode,
        "scenario": mode,
        "sender_receipt": json.loads(out) if out else None, "current_checks": checks, "controller_pid": os.getpid(),
        "sender_pid": process.pid, "sender_stderr_bytes": len(err)})
    store = root / "custody.sqlite"
    if store.exists():
        with sqlite3.connect(store) as db:
            receipt["durable_rows"] = db.execute("SELECT submission,status FROM submissions").fetchall()
    print(json.dumps(receipt))
