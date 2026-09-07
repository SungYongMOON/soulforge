"""Synthetic child controller: no runtime config, vault, key files or network."""
import json
import os
import sys
import time
from pathlib import Path
from types import SimpleNamespace

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(os.environ["SOULFORGE_SECURE_WORK_KIT_ROOT"]) / "src"))

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sf_sewe import artifacts, codec, journal, models, permits, projection, runtime
from soulforge_secure_work import authority, extract, plan
from soulforge_secure_work.engine import Job, Lane, _opaque


def lane_at(root):
    root = Path(root)
    lane = object.__new__(Lane)
    for name in ("artifacts", "codec", "journal", "models", "permits", "projection", "runtime"):
        setattr(lane, name, globals()[name])
    lane.config = SimpleNamespace(source_root=root / "source", jobs_root=root / "jobs",
                                  field_review_path=root / "field_reviews.json")
    lane._trusted_permit_key = lambda record: ("synthetic.test", test_key().public_key())
    lane.append_event = lambda *a, **k: 1
    lane.write_receipt = lambda *a, **k: "synthetic.receipt"
    lane.refresh_status = lambda *a, **k: None
    lane.scripted = SimpleNamespace(name="scripted.subprocess")
    return lane


def test_key():
    # Published deterministic synthetic key, in memory only; never a credential.
    return Ed25519PrivateKey.from_private_bytes(bytes(range(32)))


def prepare(root):
    lane = lane_at(root)
    source = lane.config.source_root
    source.mkdir(parents=True)
    (source / "synthetic.md").write_text("5.8V\n", encoding="utf-8")
    pins, parts = extract.read_exact(source)
    bundle = plan.source_bundle(models, pins, parts, "p", "a", 1)
    work = plan.work_definition(models, {"recipe_id": "TEST", "required_sections": ["facts"]})
    job = Job(lane.config, "o_" + "a" * 32, {
        "mission_id": "o_" + "b" * 32, "project_ref": "p", "assignment_ref": "a", "assignment_epoch": 1,
        "round": 0, "policy_epoch": 1, "base_candidate_rev": "none", "recipe_id": "TEST",
        "source_bundle_sha256": codec.digest(bundle), "work_definition_sha256": codec.digest(work),
        "selected_field_ids": [p.field_id for p in parts]})
    job.root.mkdir(parents=True)
    projected_plan = plan.projection_plan(models, codec.digest, bundle, work, parts,
                                         job.data["mission_id"], set(job.data["selected_field_ids"]), 1)
    output = projection.project(models.ProjectInput(source=bundle, plan=projected_plan, work=work), lambda *a: False)
    body, route, route_digest, prepared, review_ref = lane._prepare_wire(job, output.packet)
    job.data.update(packet_sha256=codec.digest(output.packet), request_sha256=codec.digest(body),
                    route_sha256=route_digest, review_ref=review_ref)
    for name, value in (("bundle", bundle), ("work", work), ("plan", projected_plan),
                        ("packet", output.packet), ("route", route), ("prepared", prepared)):
        job.path(name + ".json").write_bytes(codec.canonical(value))
    job.path("body.bin").write_bytes(body)
    claims = models.PermitClaims(protocol="sf.sewe.permit/1.0", permit_id="o_" + "c" * 32,
        job_id=job.job_id, mission_id=job.data["mission_id"], round=0, request_sha256=codec.digest(body),
        route_sha256=route_digest, review_ref=review_ref, policy_epoch=1, audience=lane.scripted.name,
        issued_utc=authority.utc_now(-1), expires_utc=authority.utc_now(300), max_uses=1)
    job.path("permit.json").write_bytes(codec.canonical({"decision": "ALLOW", "authority": "SYNTHETIC",
        "issuer_key_id": "synthetic.test", "permit": permits.sign_for_test(claims, test_key(), "synthetic.test").model_dump(mode="json")}))
    job.save()
    handle = lane.open_journal(job)
    handle.create(job.job_id, "p", "test")
    for phase in ("SOURCE_PINNED", "G2_PREPARED", "RELEASE_REVIEW", "READY"):
        current = handle.get(job.job_id, "p")
        handle.transition(job.job_id, "p", current.revision, phase, _opaque(phase), "synthetic.evidence")
    handle.close()
    return lane, job


def main(root, mode):
    root = Path(root)
    lane = lane_at(root)
    job = lane.load_job("o_" + "a" * 32)
    if mode == "crash_running":
        original_transition = lane.transition
        def transition(*args, **kwargs):
            result = original_transition(*args, **kwargs)
            if args[1] == "RUNNING":
                os._exit(70)
            return result
        lane.transition = transition
    if mode == "crash_reply":
        from soulforge_secure_work import dispatch
        original_write = dispatch.durable_write
        def write(path, body):
            original_write(path, body)
            if path.name == "reply.json":
                os._exit(73)
        dispatch.durable_write = write
    if mode.startswith("crash_") or mode == "revoke_before_call":
        original_open = lane.open_journal
        def opened(job):
            handle = original_open(job)
            if mode == "crash_reserved":
                original_reserve = handle.reserve_attempt
                def reserve(*args):
                    original_reserve(*args)
                    os._exit(71)
                handle.reserve_attempt = reserve
            elif mode == "crash_saved":
                original_mark = handle.mark_attempt
                def mark(attempt_id, target):
                    original_mark(attempt_id, target)
                    if target == "RESPONSE_RECEIVED":
                        os._exit(74)
                handle.mark_attempt = mark
            elif mode == "revoke_before_call":
                original_mark = handle.mark_attempt
                def mark(attempt_id, target):
                    original_mark(attempt_id, target)
                    if target == "IN_FLIGHT":
                        job.path("permit.json").write_text('{"decision":"DENY"}')
                handle.mark_attempt = mark
            return handle
        lane.open_journal = opened
    def send(body, workdir):
        with (root / "sends.log").open("ab", buffering=0) as log:
            log.write(b"send\n")
            os.fsync(log.fileno())
        if mode == "crash_inflight":
            os._exit(72)
        if mode == "wait":
            (root / "started").write_text("1")
            deadline = time.monotonic() + 10
            while not (root / "release").exists() and time.monotonic() < deadline:
                time.sleep(0.01)
        if mode == "lost":
            raise TimeoutError("synthetic loss")
        return b'{"synthetic":true}'
    lane.scripted.send_exact = send
    try:
        result = lane.advance(job)
        print(json.dumps(result))
    except Exception as error:
        print(json.dumps({"error_type": type(error).__name__, "code": getattr(error, "code", "BOUNDED_FAILURE")}))
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main(*sys.argv[1:]))
