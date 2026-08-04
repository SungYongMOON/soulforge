from __future__ import annotations

import json
from typing import Any

from collector.ops.reconciliation_attestation import (
    ATTESTATION_SCHEMA_VERSION,
    build_feature_off_reconciliation_attestation,
)


def _digest(number: int) -> str:
    return f"{number:064x}"


def _policy(*, expected_inbound_count: int = 7) -> dict[str, Any]:
    roster_set_digest = _digest(2)
    return {
        "schema_version": "soulforge.mail.reconciliation_policy.v2",
        "policy_id": "public-synthetic-policy",
        "public_synthetic": True,
        "roster_revision_digest": _digest(1),
        "expected_inbound_count": expected_inbound_count,
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
    }


def _cursor_pair(policy: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": "soulforge.mail.reconciliation_witness.v2",
        "witness_id": "cursor-receipt-baseline-target",
        "kind": "cursor_receipt_baseline_target_pair",
        "public_synthetic": True,
        "cursor_digest": _digest(10),
        "last_success_receipt_digest": _digest(11),
        "baseline_digest": _digest(12),
        "provider_target_digest": policy["provider_target_digest"],
        "pre_pairing_digest": policy["cursor_receipt_baseline_target_pair_digest"],
        "post_pairing_digest": policy["cursor_receipt_baseline_target_pair_digest"],
        "pairing_digest": policy["cursor_receipt_baseline_target_pair_digest"],
        "pairing_state": "current",
    }


def _authority_snapshot(policy: dict[str, Any]) -> dict[str, Any]:
    return {
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
        "pre_authority_snapshot_digest": policy["authority_snapshot_linkage_digest"],
        "post_authority_snapshot_digest": policy["authority_snapshot_linkage_digest"],
        "authority_linkage_digest": policy["authority_snapshot_linkage_digest"],
        "authority_state": "current",
        "writer_state": "exclusive_quiescent",
    }


def _coverage_snapshot(policy: dict[str, Any]) -> dict[str, Any]:
    expected_count = policy["expected_inbound_count"]
    roster_set_digest = policy["roster_set_digest"]
    empty_set_digest = policy["empty_normalized_set_digest"]
    return {
        "schema_version": "soulforge.mail.reconciliation_witness.v2",
        "witness_id": "roster-registry-source-ledger-coverage",
        "kind": "roster_registry_source_ledger_coverage",
        "public_synthetic": True,
        "roster_set_digest": roster_set_digest,
        "register_set_digest": policy["register_set_digest"],
        "source_set_digest": roster_set_digest,
        "ledger_set_digest": roster_set_digest,
        "source_revision_policy_digest": policy["source_revision_policy_digest"],
        "roster_register_intersection_set_digest": roster_set_digest,
        "roster_register_difference_set_digest": empty_set_digest,
        "source_ledger_intersection_set_digest": roster_set_digest,
        "source_ledger_difference_set_digest": empty_set_digest,
        "unregistered_set_digest": empty_set_digest,
        "expected_inbound_count": expected_count,
        "registered_inbound_count": expected_count,
        "unregistered_inbound_count": 0,
        "source_inbound_count": expected_count,
        "ledger_inbound_count": expected_count,
        "exact_duplicate_noop_count": 0,
        "identity_revision_conflict_count": 0,
        "pre_coverage_snapshot_digest": policy["coverage_snapshot_linkage_digest"],
        "post_coverage_snapshot_digest": policy["coverage_snapshot_linkage_digest"],
        "coverage_linkage_digest": policy["coverage_snapshot_linkage_digest"],
        "coverage_state": "current",
    }


def _complete_witnesses(policy: dict[str, Any]) -> list[dict[str, Any]]:
    return [_cursor_pair(policy), _authority_snapshot(policy), _coverage_snapshot(policy)]


def _result(policy: dict[str, Any], witnesses: list[dict[str, Any]]) -> dict[str, Any]:
    return build_feature_off_reconciliation_attestation(policy=policy, witnesses=witnesses)


def _assert_invariant_flags(result: dict[str, Any]) -> None:
    assert result["schema_version"] == ATTESTATION_SCHEMA_VERSION
    assert result["status"] == "hold"
    assert result["writes_performed"] is False
    assert result["network_used"] is False
    assert result["official_completion"] is False
    assert result["live_replay_authorized"] is False


def test_complete_parameterized_synthetic_evidence_is_still_feature_off_hold() -> None:
    policy = _policy(expected_inbound_count=7)
    result = _result(policy, _complete_witnesses(policy))

    _assert_invariant_flags(result)
    assert result["hold_codes"] == ["feature_off_non_operational"]
    assert result["aggregate"] == {
        "required_witness_kind_count": 3,
        "observed_required_witness_kind_count": 3,
        "witness_count": 3,
        "expected_inbound_count": 7,
        "registered_inbound_count": 7,
        "unregistered_inbound_count": 0,
        "source_inbound_count": 7,
        "ledger_inbound_count": 7,
        "source_ledger_missing_count": 0,
        "source_ledger_exact_duplicate_noop_count": 0,
        "source_ledger_identity_revision_conflict_count": 0,
    }
    assert "public-synthetic-policy" not in json.dumps(result)


def test_missing_fixed_witness_kind_holds_without_evidence_echo() -> None:
    policy = _policy()
    result = _result(policy, [_cursor_pair(policy), _authority_snapshot(policy)])

    _assert_invariant_flags(result)
    assert result["hold_codes"] == [
        "feature_off_non_operational",
        "required_witnesses_missing",
    ]
    assert result["aggregate"]["expected_inbound_count"] == 0
    assert "cursor-receipt-baseline-target" not in json.dumps(result)


def test_cursor_receipt_baseline_target_pair_requires_current_bound_relation() -> None:
    policy = _policy()
    for state in ("missing", "stale", "mismatch", "unknown"):
        witnesses = _complete_witnesses(policy)
        witnesses[0] = {**witnesses[0], "pairing_state": state}
        result = _result(policy, witnesses)
        _assert_invariant_flags(result)
        assert result["hold_codes"] == [
            "feature_off_non_operational",
            "cursor_receipt_baseline_target_pair_not_current",
        ]

    witnesses = _complete_witnesses(policy)
    witnesses[0] = {**witnesses[0], "pairing_digest": _digest(70)}
    result = _result(policy, witnesses)
    assert result["hold_codes"] == [
        "feature_off_non_operational",
        "cursor_receipt_baseline_target_pair_mismatch",
    ]

    witnesses = _complete_witnesses(policy)
    witnesses[0] = {**witnesses[0], "provider_target_digest": _digest(71)}
    result = _result(policy, witnesses)
    assert result["hold_codes"] == [
        "feature_off_non_operational",
        "cursor_receipt_target_mismatch",
    ]


def test_authority_snapshot_cross_binds_binding_release_register_lease_fence_and_epoch() -> None:
    policy = _policy()
    for state in ("missing", "stale", "mismatch", "unknown"):
        witnesses = _complete_witnesses(policy)
        witnesses[1] = {**witnesses[1], "authority_state": state}
        result = _result(policy, witnesses)
        _assert_invariant_flags(result)
        assert result["hold_codes"] == [
            "feature_off_non_operational",
            "authority_snapshot_not_current",
        ]

    witnesses = _complete_witnesses(policy)
    witnesses[1] = {**witnesses[1], "post_writer_epoch_digest": _digest(72)}
    result = _result(policy, witnesses)
    assert result["hold_codes"] == [
        "feature_off_non_operational",
        "lease_fence_epoch_snapshot_mismatch",
    ]

    witnesses = _complete_witnesses(policy)
    witnesses[1] = {**witnesses[1], "authority_linkage_digest": _digest(73)}
    result = _result(policy, witnesses)
    assert result["hold_codes"] == [
        "feature_off_non_operational",
        "authority_snapshot_linkage_mismatch",
    ]


def test_nonexclusive_writer_state_holds() -> None:
    policy = _policy()
    for writer_state in ("active", "remote", "ambiguous", "unknown"):
        witnesses = _complete_witnesses(policy)
        witnesses[1] = {**witnesses[1], "writer_state": writer_state}
        result = _result(policy, witnesses)
        _assert_invariant_flags(result)
        assert result["hold_codes"] == [
            "feature_off_non_operational",
            "writer_state_not_exclusive_quiescent",
        ]


def test_coverage_requires_roster_registry_source_ledger_sets_counts_and_differences() -> None:
    policy = _policy(expected_inbound_count=7)
    cases = (
        (
            {"register_set_digest": _digest(80)},
            "roster_registry_coverage_mismatch",
        ),
        (
            {"ledger_set_digest": _digest(81)},
            "source_ledger_coverage_mismatch",
        ),
        (
            {"source_revision_policy_digest": _digest(84)},
            "source_ledger_coverage_mismatch",
        ),
        (
            {"unregistered_set_digest": _digest(82)},
            "unregistered_source_set_not_empty",
        ),
        (
            {"unregistered_inbound_count": 1},
            "unregistered_sources_present",
        ),
        (
            {"source_inbound_count": 1},
            "inbound_coverage_count_mismatch",
        ),
        (
            {"coverage_linkage_digest": _digest(83)},
            "coverage_snapshot_linkage_mismatch",
        ),
    )
    for overrides, required_code in cases:
        witnesses = _complete_witnesses(policy)
        witnesses[2] = {**witnesses[2], **overrides}
        result = _result(policy, witnesses)
        _assert_invariant_flags(result)
        assert required_code in result["hold_codes"]


def test_single_source_count_cannot_mask_absent_registered_sources() -> None:
    policy = _policy(expected_inbound_count=7)
    witnesses = _complete_witnesses(policy)
    witnesses[2] = {
        **witnesses[2],
        "registered_inbound_count": 1,
        "source_inbound_count": 1,
        "ledger_inbound_count": 1,
    }

    result = _result(policy, witnesses)

    _assert_invariant_flags(result)
    assert result["hold_codes"] == [
        "feature_off_non_operational",
        "inbound_coverage_count_mismatch",
    ]
    assert result["aggregate"]["source_ledger_missing_count"] == 6


def test_coverage_state_or_revision_conflict_holds() -> None:
    policy = _policy()
    witnesses = _complete_witnesses(policy)
    witnesses[2] = {**witnesses[2], "coverage_state": "stale"}
    result = _result(policy, witnesses)
    assert result["hold_codes"] == [
        "feature_off_non_operational",
        "coverage_snapshot_not_current",
    ]

    witnesses = _complete_witnesses(policy)
    witnesses[2] = {**witnesses[2], "identity_revision_conflict_count": 1}
    result = _result(policy, witnesses)
    assert result["hold_codes"] == [
        "feature_off_non_operational",
        "source_ledger_identity_revision_conflict",
    ]


def test_unknown_or_prohibited_fields_are_recursively_rejected_without_echo() -> None:
    policy = _policy()
    prohibited_fields = (
        "raw",
        "message_body",
        "subject",
        "emailAddress",
        "attachment_name",
        "access-token",
        "credential_value",
        "source_url",
        "file_path",
        "private_ref",
        "unexpected",
    )
    for field in prohibited_fields:
        witnesses = _complete_witnesses(policy)
        witnesses[2]["nested"] = {field: "never-reflect-this"}
        result = _result(policy, witnesses)

        _assert_invariant_flags(result)
        assert result["hold_codes"] == ["public_synthetic_input_rejected"]
        rendered = json.dumps(result)
        assert field not in rendered
        assert "never-reflect-this" not in rendered


def test_strict_shapes_reject_incomplete_pairing_or_unknown_input_without_throwing() -> None:
    policy = _policy()
    incomplete_cursor = _cursor_pair(policy)
    incomplete_cursor.pop("baseline_digest")
    malformed_cases = (
        ({"schema_version": "wrong"}, []),
        ({**policy, "expected_inbound_count": 0}, []),
        ({**policy, "direction": "outbound"}, []),
        (
            {
                **policy,
                "approved_window_utc": {
                    "start": "2026-08-06T00:00:00Z",
                    "end": "2026-08-05T00:00:00Z",
                },
            },
            [],
        ),
        ({**policy, "query_digest": "not-a-digest"}, []),
        (policy, [incomplete_cursor]),
        (policy, [_cursor_pair(policy), _cursor_pair(policy)]),
        (policy, {"not": "a list"}),
    )
    for malformed_policy, witnesses in malformed_cases:
        result = build_feature_off_reconciliation_attestation(
            policy=malformed_policy,
            witnesses=witnesses,
        )

        _assert_invariant_flags(result)
        assert result["hold_codes"] == ["public_synthetic_input_rejected"]
