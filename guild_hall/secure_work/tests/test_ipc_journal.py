"""Actual E14 + OS-pipe subprocesses; same-SID protocol test, NOT deployment.

Existing synthetic E14 fixture keeps its published test signer in memory only.
The worker receives released WorkPacket bytes and public code paths only.
"""
import os
import time

import pytest

from soulforge_secure_work.adapters import ScriptedWorkerTransport
from soulforge_secure_work.engine import EngineStop
from soulforge_secure_work.launch_runtime import job_scope
from soulforge_secure_work import ipc
from soulforge_secure_work.ipc_pipe import Pipe, current_sid
from test_ipc_protocol import child, name, receipt

pytestmark = pytest.mark.skipif(os.name != "nt", reason="Windows kernel pipe integration")


@pytest.mark.parametrize("mode", ["kit", "crash", "revoke", "epoch", "cancel"])
def test_real_e14_reservation_handoff_and_loss_never_resend(kit, tmp_path, mode):
    from dispatch_child import prepare
    lane, job = prepare(tmp_path)
    job.data["task_ref"] = "task.synthetic"
    job.save()
    scope = job_scope(job)
    worker_endpoint, sender_endpoint = name(), name()
    worker = child("worker", worker_endpoint, mode="crash" if mode == "crash" else "kit", scope=scope, duration=2)
    sender = child("sender", sender_endpoint, worker_endpoint, scope=scope, duration=2)
    processes = [sender, worker]
    called, checks = [], []
    class IsolatedProtocolTransport(ScriptedWorkerTransport):
        def send_released(self, body, scope, attempt, current):
            called.append(1)
            def live():
                checks.append(1)
                if len(checks) == 6:
                    if mode == "revoke":
                        job.path("permit.json").write_text('{"decision":"DENY"}')
                    elif mode == "epoch":
                        import json
                        changed = json.loads(job.path("job.json").read_bytes())
                        changed["assignment_epoch"] = 2
                        job.path("job.json").write_text(json.dumps(changed))
                    elif mode == "cancel":
                        handle = lane.open_journal(job)
                        view = handle.get(job.job_id, "p")
                        handle.transition(job.job_id, "p", view.revision, "CANCEL_REQUESTED", "ipc.cancel", "synthetic.cancel")
                        handle.close()
                current()
            with Pipe.connect(sender_endpoint, current_sid(), time.monotonic() + 3) as pipe:
                return ipc.exchange(pipe, scope, attempt, body, live)
    lane.scripted = IsolatedProtocolTransport("unused", tmp_path, kit)
    try:
        if mode == "kit":
            lane.step_dispatch(job)
            assert lane.phase(job) == "RESULT_QUARANTINED"
            # E14 structure and local packet still match after both real hops.
            reply = lane.models.WorkerReply.model_validate_json(job.path("quarantine", "reply.json").read_bytes())
            assert reply.result.completion == "COMPLETE_CANDIDATE"
        else:
            with pytest.raises(EngineStop):
                lane.step_dispatch(job)
            assert not job.path("quarantine", "reply.json").exists()
        rows = []
        handle = lane.open_journal(job)
        rows = handle.db.execute("SELECT state FROM attempts").fetchall()
        handle.close()
        assert rows == [("RESPONSE_RECEIVED" if mode == "kit" else "DELIVERY_UNKNOWN",)]
        results = [receipt(p) for p in processes]
        if mode == "kit":
            assert all(code == 0 for code, _ in results), results
            assert all(result["transport_calls"] == 1 for _, result in results)
        elif mode in ("revoke", "epoch", "cancel"):
            assert results[1][1]["worker_calls"] == 0, results
        else:
            assert results[1][1]["worker_calls"] == 1
        # Fresh controller object, same E14 store: no transport retry after loss.
        from dispatch_child import lane_at
        resumed = lane_at(tmp_path)
        resumed.scripted = lane.scripted
        if mode == "crash":
            with pytest.raises(EngineStop, match="DELIVERY_UNKNOWN"):
                resumed.step_dispatch(resumed.load_job(job.job_id))
        assert called == [1]
    finally:
        for process in processes:
            if process.poll() is None:
                process.kill()
            process.communicate(timeout=5)
