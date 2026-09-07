"""Actual multi-process replay/crash/fence tests around the E14 journal."""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest


@pytest.fixture
def prepared(kit, tmp_path):
    from dispatch_child import prepare
    lane, job = prepare(tmp_path)
    return lane, job, tmp_path


def child(root, mode, wait=True):
    env = {key: os.environ[key] for key in ("SystemRoot", "WINDIR", "TEMP", "TMP", "SOULFORGE_SECURE_WORK_KIT_ROOT") if key in os.environ}
    process = subprocess.Popen([sys.executable, "-I", "-B", str(Path(__file__).with_name("dispatch_child.py")),
                               str(root), mode], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env,
                               creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    if not wait:
        return process
    stdout, stderr = process.communicate(timeout=20)
    assert not stderr
    return process.returncode, stdout.decode()


def attempts(lane, job):
    handle = lane.open_journal(job)
    try:
        return handle.db.execute("SELECT state FROM attempts").fetchall()
    finally:
        handle.close()


def test_current_denial_prevents_running_and_consumption(prepared):
    lane, job, root = prepared
    job.path("permit.json").write_text('{"decision":"DENY"}')
    exit_code, output = child(root, "normal")
    assert exit_code == 0
    assert "PERMIT_DENIED" in output
    assert lane.phase(job) == "READY" and attempts(lane, job) == []
    assert not (root / "sends.log").exists()


@pytest.mark.parametrize("mode,state,count", [("crash_reserved", "NOT_SENT", 0),
                                               ("crash_inflight", "DELIVERY_UNKNOWN", 1),
                                               ("crash_reply", "DELIVERY_UNKNOWN", 1),
                                               ("lost", "DELIVERY_UNKNOWN", 1)])
def test_restart_never_retransmits_consumed_permit(prepared, mode, state, count):
    lane, job, root = prepared
    child(root, mode)
    child(root, "normal")
    child(root, "normal")
    assert attempts(lane, job) == [(state,)]
    assert ((root / "sends.log").read_bytes().count(b"send") if (root / "sends.log").exists() else 0) == count
    assert lane.phase(job) == "RUNNING"


def test_saved_response_resumes_without_new_send(prepared):
    lane, job, root = prepared
    assert child(root, "crash_saved")[0] == 74
    assert lane.phase(job) == "RUNNING"
    assert child(root, "normal")[0] == 0
    assert lane.phase(job) == "RESULT_QUARANTINED"
    assert (root / "sends.log").read_bytes() == b"send\n"


def test_running_without_reservation_can_resume_once(prepared):
    lane, job, root = prepared
    assert child(root, "crash_running")[0] == 70
    assert lane.phase(job) == "RUNNING" and attempts(lane, job) == []
    assert child(root, "normal")[0] == 0
    assert lane.phase(job) == "RESULT_QUARANTINED"
    assert (root / "sends.log").read_bytes() == b"send\n"


def test_current_revocation_at_transport_boundary_sends_nothing(prepared):
    lane, job, root = prepared
    assert child(root, "revoke_before_call")[0] == 0
    assert attempts(lane, job) == [("DELIVERY_UNKNOWN",)]
    assert not (root / "sends.log").exists()
    assert lane.phase(job) == "RUNNING"


def test_corrupted_saved_reply_is_not_recovered_or_resent(prepared):
    lane, job, root = prepared
    assert child(root, "crash_saved")[0] == 74
    job.path("quarantine", "reply.json").write_text("changed")
    exit_code, output = child(root, "normal")
    assert exit_code == 0 and "DELIVERY_UNKNOWN" in output
    assert lane.phase(job) == "RUNNING"
    assert (root / "sends.log").read_bytes() == b"send\n"


def test_consumed_hold_cannot_restart_through_field_review_presence(prepared):
    lane, job, root = prepared
    child(root, "lost")
    handle = lane.open_journal(job)
    current = handle.get(job.job_id, "p")
    handle.transition(job.job_id, "p", current.revision, "HOLD", "synthetic.hold", "synthetic.hold")
    handle.close()
    lane.config.field_review_path.write_text(json.dumps({
        "schema": "soulforge.secure_work.field_reviews.v0", "synthetic_pilot": True, "entries": []}))
    exit_code, output = child(root, "normal")
    assert exit_code == 0 and "DISPATCH_REVIEW_REQUIRED" in output
    assert lane.phase(job) == "HOLD"
    assert (root / "sends.log").read_bytes() == b"send\n"


@pytest.mark.parametrize("change", ["race", "deny", "epoch", "source", "cancel"])
def test_live_controller_and_late_result_fence(prepared, change):
    lane, job, root = prepared
    first = child(root, "wait", wait=False)
    try:
        deadline = time.monotonic() + 10
        while not (root / "started").exists() and first.poll() is None and time.monotonic() < deadline:
            time.sleep(0.01)
        assert (root / "started").exists()
        if change == "race":
            _, output = child(root, "normal")
            assert "DISPATCH_BUSY" in output
        elif change == "deny":
            job.path("permit.json").write_text('{"decision":"DENY"}')
        elif change == "epoch":
            changed = json.loads(job.path("job.json").read_bytes())
            changed["policy_epoch"] = 2
            job.path("job.json").write_text(json.dumps(changed))
        elif change == "source":
            (root / "source" / "synthetic.md").write_text("6.2V\n")
        else:
            handle = lane.open_journal(job)
            current = handle.get(job.job_id, "p")
            handle.transition(job.job_id, "p", current.revision, "CANCEL_REQUESTED", "synthetic.cancel", "synthetic.cancel")
            handle.close()
        (root / "release").write_text("1")
        stdout, stderr = first.communicate(timeout=20)
        assert not stderr
        assert first.returncode == 0
        assert (root / "sends.log").read_bytes() == b"send\n"
        assert lane.phase(job) == ("RESULT_QUARANTINED" if change == "race" else "CANCEL_REQUESTED" if change == "cancel" else "RUNNING")
        if change != "race":
            assert not job.path("quarantine", "reply.json").exists()
        if change == "epoch":
            assert json.loads(job.path("job.json").read_bytes())["policy_epoch"] == 2
    finally:
        if first.poll() is None:
            first.kill()
            first.communicate()
