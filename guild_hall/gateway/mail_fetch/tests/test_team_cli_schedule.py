from __future__ import annotations

from pathlib import Path

import team_cli


def _digest(number: int) -> str:
    return f"{number:064x}"


def test_hpp_capsule_uses_owner_approved_kst_sent_windows(tmp_path: Path) -> None:
    data_root = tmp_path / "data"

    overrides = team_cli._hpp_capsule_env_overrides(data_root)

    assert overrides["OUTLOOK_SENT_ALLOWED_WINDOWS_KST"] == (
        "02:00-04:00,12:00-14:00"
    )
    assert overrides["EMAIL_FETCH_PRIVATE_CONFIG_ROOT"] == str(data_root / "config")
    assert overrides["EMAIL_FETCH_INBOX_ROOT"] == str(
        data_root / "ingress" / "mailbox"
    )


def test_feature_off_attestation_facade_is_pure_and_non_operational() -> None:
    roster_set_digest = _digest(2)
    result = team_cli.build_feature_off_reconciliation_attestation(
        policy={
            "schema_version": "soulforge.mail.reconciliation_policy.v2",
            "policy_id": "public-synthetic-policy",
            "public_synthetic": True,
            "roster_revision_digest": _digest(1),
            "expected_inbound_count": 3,
            "roster_set_digest": roster_set_digest,
            "register_set_digest": roster_set_digest,
            "empty_normalized_set_digest": _digest(3),
            "cursor_receipt_baseline_target_pair_digest": _digest(4),
            "authority_snapshot_linkage_digest": _digest(5),
            "coverage_snapshot_linkage_digest": _digest(6),
            "direction": "inbound",
            "provider": "synthetic-provider",
            "query_digest": _digest(7),
            "source_revision_policy_digest": _digest(8),
            "approved_window_utc": {
                "start": "2026-08-05T00:00:00Z",
                "end": "2026-08-06T00:00:00Z",
            },
            "provider_target_digest": _digest(9),
        },
        witnesses=[
            {
                "schema_version": "soulforge.mail.reconciliation_witness.v2",
                "witness_id": "cursor-receipt-baseline-target",
                "kind": "cursor_receipt_baseline_target_pair",
                "public_synthetic": True,
                "cursor_digest": _digest(10),
                "last_success_receipt_digest": _digest(11),
                "baseline_digest": _digest(12),
                "provider_target_digest": _digest(9),
                "pre_pairing_digest": _digest(4),
                "post_pairing_digest": _digest(4),
                "pairing_digest": _digest(4),
                "pairing_state": "current",
            },
            {
                "schema_version": "soulforge.mail.reconciliation_witness.v2",
                "witness_id": "authority-snapshot-linkage",
                "kind": "authority_snapshot_linkage",
                "public_synthetic": True,
                "binding_digest": _digest(20),
                "release_digest": _digest(21),
                "register_digest": _digest(22),
                "pre_lease_digest": _digest(23),
                "pre_fence_digest": _digest(24),
                "pre_writer_epoch_digest": _digest(25),
                "post_lease_digest": _digest(23),
                "post_fence_digest": _digest(24),
                "post_writer_epoch_digest": _digest(25),
                "pre_authority_snapshot_digest": _digest(5),
                "post_authority_snapshot_digest": _digest(5),
                "authority_linkage_digest": _digest(5),
                "authority_state": "current",
                "writer_state": "exclusive_quiescent",
            },
            {
                "schema_version": "soulforge.mail.reconciliation_witness.v2",
                "witness_id": "roster-registry-source-ledger-coverage",
                "kind": "roster_registry_source_ledger_coverage",
                "public_synthetic": True,
                "roster_set_digest": roster_set_digest,
                "register_set_digest": roster_set_digest,
                "source_set_digest": roster_set_digest,
                "ledger_set_digest": roster_set_digest,
                "source_revision_policy_digest": _digest(8),
                "roster_register_intersection_set_digest": roster_set_digest,
                "roster_register_difference_set_digest": _digest(3),
                "source_ledger_intersection_set_digest": roster_set_digest,
                "source_ledger_difference_set_digest": _digest(3),
                "unregistered_set_digest": _digest(3),
                "expected_inbound_count": 3,
                "registered_inbound_count": 3,
                "unregistered_inbound_count": 0,
                "source_inbound_count": 3,
                "ledger_inbound_count": 3,
                "exact_duplicate_noop_count": 0,
                "identity_revision_conflict_count": 0,
                "pre_coverage_snapshot_digest": _digest(6),
                "post_coverage_snapshot_digest": _digest(6),
                "coverage_linkage_digest": _digest(6),
                "coverage_state": "current",
            },
        ],
    )

    assert result["status"] == "hold"
    assert result["hold_codes"] == ["feature_off_non_operational"]
    assert result["writes_performed"] is False
    assert result["network_used"] is False
    assert result["official_completion"] is False
    assert result["live_replay_authorized"] is False
