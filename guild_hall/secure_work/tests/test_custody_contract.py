"""Synthetic M10 contract tests; stdlib only, no kit or credentials."""
import hashlib
import json
import sqlite3
import sys
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from soulforge_secure_work.adapters import AdapterUnavailable, TongsCustodyAdapter
from soulforge_secure_work.custody import CustodyAuthorization, binding_digest


class CustodyContract(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.file = self.root / "candidate.md"
        self.file.write_bytes(b"synthetic candidate\n")
        self.client = self.root / "ingress_client_cli.mjs"
        self.client.write_text("// synthetic probe stand-in")
        self.token = self.root / "synthetic.token"
        self.token.write_text("synthetic-placeholder")
        self.calls = []
        self.current = True
        self.status = "pending_server_ack"
        self.reply_edit = lambda value: value
        self.adapter = TongsCustodyAdapter(
            str(self.client), "http://127.0.0.1:1", "http://127.0.0.1:2",
            str(self.token), True, authorization=self.authorize, executor=self.execute)

    def authorize(self, binding):
        if not self.current:
            raise AdapterUnavailable("M10", "CUSTODY_AUTHORIZATION_DENIED")
        return CustodyAuthorization(binding_digest(binding), "synthetic.account",
                                    "synthetic.device", "synthetic.agent", time.time() + 60)

    def execute(self, request):
        self.calls.append(request)
        return self.reply_edit({
            "submission_id": "sfigsub_" + "a" * 32, "lane": "team_files",
            "project_hint": request["binding"]["project_hint"], "status": self.status,
            "sha256": request["binding"]["sha256"], "size": request["binding"]["size"],
            "official_history_written": False, "source_deleted": False,
        })

    def deposit(self, **kwargs):
        values = dict(input_revision="r1", expected_sha256=hashlib.sha256(self.file.read_bytes()).hexdigest(),
                      expected_size=self.file.stat().st_size)
        values.update(kwargs)
        return self.adapter.deposit(self.file, "synthetic.project", "synthetic.occurrence",
                                    "synthetic:idempotency", **values)

    def test_default_authorization_denies_even_with_live_flag(self):
        self.adapter.authorization = None
        with self.assertRaisesRegex(AdapterUnavailable, "CUSTODY_AUTHORIZATION_UNBOUND"):
            self.deposit()
        self.assertEqual(self.calls, [])

    def test_runtime_hook_holds_without_an_immutable_owner_binding(self):
        self.adapter.authorization = self.adapter._runtime_authorize
        with self.assertRaisesRegex(AdapterUnavailable, "CUSTODY_RUNTIME_AUTHORITY_HOLD"):
            self.deposit()
        self.assertEqual(self.calls, [])

    def test_pending_is_received_then_exact_status_advances_ack(self):
        first = self.deposit()
        self.assertFalse(first["server_acknowledged"])
        self.assertEqual(first["review_state"], "NOT_OBSERVED")
        self.assertFalse(first["accepted"])
        self.status = "verified_server_ack"
        second = self.deposit()
        self.assertTrue(second["server_acknowledged"])
        self.assertEqual([c["action"] for c in self.calls], ["upload", "status"])
        self.assertEqual(first["submission_id"], second["submission_id"])

    def test_changed_revision_and_bytes_conflict_without_send(self):
        self.deposit()
        with self.assertRaisesRegex(AdapterUnavailable, "CUSTODY_IDEMPOTENCY_CONFLICT"):
            self.deposit(input_revision="r2")
        self.file.write_bytes(b"changed synthetic candidate")
        with self.assertRaisesRegex(AdapterUnavailable, "CUSTODY_IDEMPOTENCY_CONFLICT"):
            self.deposit()
        self.assertEqual(len(self.calls), 1)

    def test_revocation_on_retry_prevents_status_and_upload(self):
        self.deposit()
        self.current = False
        with self.assertRaisesRegex(AdapterUnavailable, "CUSTODY_AUTHORIZATION_DENIED"):
            self.deposit()
        self.assertEqual(len(self.calls), 1)

    def test_untrusted_responses_quarantine_metadata_and_never_ack(self):
        for field, value in [("sha256", "b" * 64), ("size", True),
                             ("project_hint", "other.project"), ("status", "accepted"),
                             ("accepted", True), ("raw", "PRIVATE_BODY_SENTINEL")]:
            with self.subTest(field=field):
                self.reply_edit = lambda reply, f=field, v=value: {**reply, f: v}
                with self.assertRaisesRegex(AdapterUnavailable, "CUSTODY_RESPONSE_QUARANTINED"):
                    self.deposit()
        self.assertNotIn("PRIVATE_BODY_SENTINEL", (self.root / "custody.sqlite").read_bytes().decode("latin1"))

    def test_failure_before_ack_retries_same_idempotency(self):
        self.adapter.executor = Mock(side_effect=TimeoutError("PRIVATE_ERROR_SENTINEL"))
        with self.assertRaisesRegex(AdapterUnavailable, "CUSTODY_TRANSPORT_UNAVAILABLE") as raised:
            self.deposit()
        self.assertNotIn("PRIVATE_ERROR_SENTINEL", str(raised.exception))
        self.adapter.executor = self.execute
        self.status = "verified_server_ack"
        result = self.deposit()
        self.assertTrue(result["server_acknowledged"])
        self.assertEqual(self.calls[-1]["binding"]["idempotency_key"], "synthetic:idempotency")

    def test_engine_waits_until_durable_ack_and_never_invents_review(self):
        from soulforge_secure_work.engine import Lane, EngineStop
        lane = Lane.__new__(Lane)  # M10 engine seam; no pretend E14 journal implementation
        lane.custody = self.adapter
        lane.transition = Mock(return_value=("CUSTODY_ACKNOWLEDGED", "synthetic.receipt"))
        job = SimpleNamespace(job_id="synthetic.job", outbox=self.root, save=Mock(), data={
            "source_bundle_sha256": "c" * 64, "base_candidate_rev": "none", "round": 0,
            "project_ref": "synthetic.project", "candidate_sha256": hashlib.sha256(self.file.read_bytes()).hexdigest(),
            "candidate_bytes": self.file.stat().st_size})
        (self.root / "summary.json").write_text(json.dumps({"server_acknowledged": False, "accepted": False}))
        with self.assertRaisesRegex(EngineStop, "CUSTODY_ACK_PENDING"):
            lane.step_deposit(job)
        lane.transition.assert_not_called()
        self.assertFalse(job.data["custody"]["server_acknowledged"])
        self.status = "verified_server_ack"
        self.assertEqual(lane.step_deposit(job)[0], "CUSTODY_ACKNOWLEDGED")
        lane.transition.assert_called_once()
        self.assertFalse(job.data["custody"]["accepted"])
        self.assertEqual(job.data["custody"]["review_state"], "NOT_OBSERVED")
        self.assertTrue(json.loads((self.root / "summary.json").read_text())["server_acknowledged"])

    def test_identity_scope_submission_and_ack_regression_are_bound(self):
        self.status = "verified_server_ack"
        self.deposit()
        self.reply_edit = lambda reply: {**reply, "submission_id": "sfigsub_" + "b" * 32}
        with self.assertRaisesRegex(AdapterUnavailable, "CUSTODY_RESPONSE_QUARANTINED"):
            self.deposit()
        self.reply_edit = lambda reply: reply
        self.status = "pending_server_ack"
        with self.assertRaisesRegex(AdapterUnavailable, "CUSTODY_ACK_REGRESSION"):
            self.deposit()
        previous = self.adapter.authorization
        self.adapter.authorization = lambda b: CustodyAuthorization(
            binding_digest(b), "other.account", "synthetic.device", "synthetic.agent", time.time() + 60)
        with self.assertRaisesRegex(AdapterUnavailable, "CUSTODY_IDEMPOTENCY_CONFLICT"):
            self.deposit()
        self.adapter.authorization = previous

    def test_authorization_is_rechecked_after_durable_intent_before_sender(self):
        calls = 0
        def revoke_after_intent(binding):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise AdapterUnavailable("M10", "CUSTODY_AUTHORIZATION_DENIED")
            return self.authorize(binding)
        self.adapter.authorization = revoke_after_intent
        with self.assertRaisesRegex(AdapterUnavailable, "CUSTODY_AUTHORIZATION_DENIED"):
            self.deposit()
        self.assertEqual(self.calls, [])

    def test_simulated_crash_after_send_before_local_ack_reuses_submission(self):
        def crash_after_server(request):
            self.execute(request)
            raise KeyboardInterrupt()  # process crash is not a successful receipt
        self.adapter.executor = crash_after_server
        with self.assertRaises(KeyboardInterrupt):
            self.deposit()
        self.adapter.executor = self.execute
        self.status = "verified_server_ack"
        self.assertTrue(self.deposit()["server_acknowledged"])
        self.assertEqual(self.calls[0]["binding"], self.calls[1]["binding"])

    def test_concurrent_late_pending_response_cannot_overwrite_durable_ack(self):
        def other_attempt_acknowledged(request):
            db = sqlite3.connect(self.root / "custody.sqlite")
            try:
                db.execute("UPDATE submissions SET submission=?, status=?", (
                    "sfigsub_" + "a" * 32, "verified_server_ack"))
                db.commit()
            finally:
                db.close()
            return self.execute(request)
        self.adapter.executor = other_attempt_acknowledged
        with self.assertRaisesRegex(AdapterUnavailable, "CUSTODY_ACK_REGRESSION"):
            self.deposit()

    def test_authority_changed_after_remote_ack_never_mutates_local_ack(self):
        self.status = "verified_server_ack"
        for mode in ("revoked", "principal_changed", "expired", "binding_changed"):
            with self.subTest(mode=mode):
                remote_replied = False
                def current_authority(binding):
                    if remote_replied and mode == "revoked":
                        raise AdapterUnavailable("M10", "CUSTODY_AUTHORIZATION_DENIED")
                    return CustodyAuthorization(
                        "0" * 64 if remote_replied and mode == "binding_changed" else binding_digest(binding),
                        "other.account" if remote_replied and mode == "principal_changed" else "synthetic.account",
                        "synthetic.device", "synthetic.agent",
                        time.time() - 1 if remote_replied and mode == "expired" else time.time() + 60)
                def remote_ack(request):
                    nonlocal remote_replied
                    response = self.execute(request)
                    remote_replied = True
                    return response
                self.adapter.authorization = current_authority
                self.adapter.executor = remote_ack
                before_calls = len(self.calls)
                with self.assertRaisesRegex(AdapterUnavailable, "CUSTODY_AUTHORIZATION_(DENIED|CHANGED)"):
                    self.deposit()
                self.assertEqual(len(self.calls), before_calls + 1)  # remote effect is not undone
                db = sqlite3.connect(self.root / "custody.sqlite")
                try:
                    self.assertEqual(db.execute("SELECT submission, status FROM submissions").fetchone(), (None, None))
                finally:
                    db.close()
        self.adapter.authorization = self.authorize
        self.adapter.executor = self.execute
        self.assertTrue(self.deposit()["server_acknowledged"])

    def test_after_response_denial_preserves_known_pending_submission_for_status_retry(self):
        pending = self.deposit()
        self.status = "verified_server_ack"
        def revoke_after_status(request):
            response = self.execute(request)
            self.current = False
            return response
        self.adapter.executor = revoke_after_status
        with self.assertRaisesRegex(AdapterUnavailable, "CUSTODY_AUTHORIZATION_DENIED"):
            self.deposit()
        db = sqlite3.connect(self.root / "custody.sqlite")
        try:
            self.assertEqual(db.execute("SELECT submission, status FROM submissions").fetchone(),
                             (pending["submission_id"], "pending_server_ack"))
        finally:
            db.close()
        self.current = True
        self.adapter.executor = self.execute
        self.assertTrue(self.deposit()["server_acknowledged"])
        self.assertEqual([call["action"] for call in self.calls], ["upload", "status", "status"])


if __name__ == "__main__":
    unittest.main()
