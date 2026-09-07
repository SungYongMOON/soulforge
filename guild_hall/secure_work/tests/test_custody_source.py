"""Current M10 source/assignment/revision fences using the real E14 journal."""
import json

import pytest

from soulforge_secure_work.engine import EngineStop


@pytest.mark.parametrize("change", ["source", "assignment", "epoch", "route", "candidate", "outbox", "cancel"])
def test_custody_rechecks_current_source_and_journal_before_ack(kit, tmp_path, change):
    from dispatch_child import prepare
    lane, job = prepare(tmp_path)
    lane.config.outbox_root = tmp_path / "outbox"
    lane.config.outbox_root.mkdir()
    job.data.update(task_ref="synthetic.task", candidate_bytes=10, candidate_sha256=lane.codec.digest(b"candidate\n"))
    job.save()
    job.outbox.mkdir(parents=True)
    job.path("candidate.md").write_bytes(b"candidate\n")
    (job.outbox / "candidate.md").write_bytes(b"candidate\n")
    handle = lane.open_journal(job)
    for target in ["RUNNING", "RESULT_QUARANTINED", "STRUCTURE_CHECKED", "BOUND", "REVIEW_PENDING", "CANDIDATE_READY", "CUSTODY_PENDING"]:
        view = handle.get(job.job_id, "p")
        handle.transition(job.job_id, "p", view.revision, target, "test." + target, "synthetic.evidence")
    revision = handle.get(job.job_id, "p").revision
    handle.close()
    lane._current_custody(job, revision)
    if change == "source":
        (lane.config.source_root / "synthetic.md").write_text("6.2V\n")
    elif change in {"assignment", "epoch", "route"}:
        raw = json.loads(job.path("job.json").read_bytes())
        key = {"assignment": "assignment_ref", "epoch": "assignment_epoch", "route": "route_sha256"}[change]
        raw[key] = 2 if change == "epoch" else "changed"
        job.path("job.json").write_text(json.dumps(raw))
    elif change == "candidate":
        job.path("candidate.md").write_bytes(b"changed!!!")
    elif change == "outbox":
        (job.outbox / "candidate.md").write_bytes(b"changed!!!")
    else:
        handle = lane.open_journal(job)
        handle.transition(job.job_id, "p", revision, "CANCEL_REQUESTED", "test.cancel", "synthetic.cancel")
        handle.close()
    with pytest.raises(EngineStop):
        lane._current_custody(job, revision)
