"""Production call-site ordering with explicit synthetic verifier seams only."""
import json
from pathlib import Path
import sys
import time
from datetime import datetime
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from soulforge_secure_work import authority, engine, launch_runtime


class ExecutionRoleTests(unittest.TestCase):
    def setUp(self):
        self.job = SimpleNamespace(job_id="job.synthetic", data={"project_ref": "project.synthetic",
            "assignment_ref": "assignment.synthetic", "assignment_epoch": 1, "task_ref": "task.synthetic",
            "policy_epoch": 1, "route_sha256": "a" * 64, "transport_id": "scripted.subprocess"},
            path=Mock(side_effect=AssertionError("job bytes must not be read")))
        self.lane = engine.Lane.__new__(engine.Lane)

    def test_sender_boundary_precedes_controller_lock_job_read_and_journal_consumption(self):
        self.lane.load_job = Mock(side_effect=AssertionError("job read before role gate"))
        self.lane.open_journal = Mock(side_effect=AssertionError("consumption before role gate"))
        with patch.object(engine, "require_sender_channel", side_effect=RuntimeError("SECURE_WORK_ROLE_HOLD")) as gate, \
             patch.object(engine.dispatch_module, "controller_lock") as lock:
            with self.assertRaises(engine.EngineStop):
                self.lane.step_dispatch(self.job)
            with self.assertRaises(engine.EngineStop):
                self.lane._current_dispatch(self.job)
        self.assertEqual(gate.call_count, 2)
        lock.assert_not_called()
        self.lane.load_job.assert_not_called()
        self.lane.open_journal.assert_not_called()

    def test_controller_gate_requires_an_installed_channel_and_rejects_sender_call_stack(self):
        with patch.object(launch_runtime, "is_launched", return_value=True), \
             patch.object(launch_runtime, "role_check", return_value={"principal_ref": "controller.synthetic"}) as current, \
             patch("soulforge_secure_work.ipc.runtime_contract", return_value={"role": "sender"}):
            with self.assertRaisesRegex(RuntimeError, "CHANNEL_AUTHORITY_HOLD"):
                launch_runtime.require_sender_channel(launch_runtime.job_scope(self.job))
        current.assert_called_once_with("jobs.advance", launch_runtime.job_scope(self.job))

    def test_reviewer_scope_is_checked_before_job_bytes_and_caller_actor_is_not_authority(self):
        with patch.object(engine, "role_check", side_effect=RuntimeError("SECURE_WORK_ROLE_HOLD")) as gate:
            with self.assertRaises(RuntimeError):
                self.lane.approve_permit(self.job, "attacker")
            with self.assertRaises(RuntimeError):
                self.lane.deny_permit(self.job, "attacker")
        self.assertEqual(gate.call_args_list[0].args, ("release.issue", launch_runtime.job_scope(self.job)))
        self.job.path.assert_not_called()
        with patch.object(engine, "role_check", return_value={"principal_ref": "reviewer.synthetic"}):
            with self.assertRaisesRegex(engine.EngineStop, "CALLER_ACTOR_FORBIDDEN"):
                self.lane.approve_permit(self.job, "reviewer.synthetic")
        self.job.path.assert_not_called()

    def test_ready_transition_checks_current_permit_actor_and_assignment_identity(self):
        record = {"decision": "ALLOW"}
        self.lane._permit_record = Mock(return_value=record)
        self.lane.transition = Mock(side_effect=AssertionError("READY before identity gate"))
        with patch.object(engine, "role_check", side_effect=RuntimeError("SECURE_WORK_ROLE_HOLD")) as gate:
            with self.assertRaises(RuntimeError):
                self.lane.step_ready(self.job)
        gate.assert_called_once_with("permit.identity", launch_runtime.job_scope(self.job), record)
        self.lane.transition.assert_not_called()

    def issue(self, **overrides):
        args = dict(job_id="job.synthetic", mission_id="mission.synthetic", round_index=0, body=b"synthetic",
            route_digest="a" * 64, review_ref="review.synthetic", policy_epoch=1, audience="scripted.subprocess",
            lifetime_seconds=300, actor_ref="reviewer.synthetic", trust_signing_key_path=None,
            execution_scope=launch_runtime.job_scope(self.job))
        args.update(overrides)
        return authority.issue_permit(None, None, None, None, **args)

    def role_proof(self):
        return {**launch_runtime.job_scope(self.job), "principal_ref": "reviewer.synthetic", "purpose": "KEY_SERVICE",
                "issuer_key_id": "trust.synthetic", "expires_at": int(time.time() * 1000) + 60000}

    def test_issue_arguments_must_match_current_role_scope_before_key_access(self):
        for delta in ({"route_digest": "b" * 64}, {"policy_epoch": 2}, {"audience": "other.route"},
                      {"lifetime_seconds": 0}, {"lifetime_seconds": 301}):
            with self.subTest(delta=delta), patch.object(launch_runtime, "role_check", return_value=self.role_proof()), \
                 patch.object(authority, "load_trust_signing_key", side_effect=AssertionError("signing key touched")) as read_key:
                with self.assertRaises(authority.PermitAuthorityError):
                    self.issue(**delta)
                read_key.assert_not_called()

    def test_expired_role_refuses_key_access(self):
        proof = {**self.role_proof(), "expires_at": int(time.time() * 1000) - 1000}
        with patch.object(launch_runtime, "role_check", return_value=proof), \
             patch.object(authority, "load_trust_signing_key", side_effect=AssertionError("signing key touched")) as read_key:
            with self.assertRaisesRegex(authority.PermitAuthorityError, "PERMIT_SIGNER_EXPIRED"):
                self.issue()
        read_key.assert_not_called()

    def test_permit_expiry_never_outlives_current_role_policy(self):
        proof = self.role_proof()
        models = SimpleNamespace(PermitClaims=lambda **value: value)
        permits = SimpleNamespace(sign_for_test=lambda *args: {"key_id": "trust.synthetic", "claims": args[0]})
        with patch.object(launch_runtime, "role_check", return_value=proof), \
             patch.object(authority, "load_trust_signing_key", return_value=("trust.synthetic", object())):
            record, _ = authority.issue_permit(models, permits, lambda value: json.dumps(value).encode(), lambda _: "a" * 64,
                job_id="job.synthetic", mission_id="mission.synthetic", round_index=0, body=b"synthetic",
                route_digest="a" * 64, review_ref="review.synthetic", policy_epoch=1, audience="scripted.subprocess",
                lifetime_seconds=300, actor_ref="reviewer.synthetic", trust_signing_key_path=None,
                execution_scope=launch_runtime.job_scope(self.job))
        expires = datetime.fromisoformat(record["permit"]["claims"]["expires_utc"].replace("Z", "+00:00"))
        self.assertLessEqual(expires.timestamp() * 1000, proof["expires_at"])

    def test_signer_identity_is_required_before_private_key_loading(self):
        with patch.object(launch_runtime, "role_check", side_effect=RuntimeError("SECURE_WORK_ROLE_HOLD")), \
             patch.object(authority, "load_trust_signing_key") as read_key:
            with self.assertRaises(RuntimeError):
                self.issue()
        read_key.assert_not_called()
        with patch.object(launch_runtime, "role_check", return_value={"principal_ref": "different.reviewer"}), \
             patch.object(authority, "load_trust_signing_key") as read_key:
            with self.assertRaisesRegex(authority.PermitAuthorityError, "PERMIT_SIGNER_IDENTITY_MISMATCH"):
                self.issue()
        read_key.assert_not_called()

    def test_late_identity_change_blocks_return_of_signed_permit(self):
        proof = self.role_proof()
        models = SimpleNamespace(PermitClaims=lambda **value: value)
        permits = SimpleNamespace(sign_for_test=lambda *args: {"key_id": "trust.synthetic", "claims": args[0]})
        with patch.object(launch_runtime, "role_check", side_effect=[proof, {**proof, "principal_ref": "changed.reviewer"}]), \
             patch.object(authority, "load_trust_signing_key", return_value=("trust.synthetic", object())):
            with self.assertRaisesRegex(authority.PermitAuthorityError, "PERMIT_SIGNER_IDENTITY_CHANGED"):
                authority.issue_permit(models, permits, lambda value: json.dumps(value).encode(), lambda _: "a" * 64,
                    job_id="job.synthetic", mission_id="mission.synthetic", round_index=0, body=b"synthetic",
                    route_digest="a" * 64, review_ref="review.synthetic", policy_epoch=1, audience="scripted.subprocess",
                    lifetime_seconds=300, actor_ref="reviewer.synthetic", trust_signing_key_path=None,
                    execution_scope=launch_runtime.job_scope(self.job))


if __name__ == "__main__":
    unittest.main()
