"""Pure, public-synthetic feature-OFF reconciliation attestation.

This module accepts no runtime, mailbox, custody, credential, or filesystem
input.  It reports only aggregate synthetic metadata and always remains an
advisory HOLD record: it cannot authorize a live replay or official recovery.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime
import re
from typing import Any


POLICY_SCHEMA_VERSION = "soulforge.mail.reconciliation_policy.v2"
WITNESS_SCHEMA_VERSION = "soulforge.mail.reconciliation_witness.v2"
ATTESTATION_SCHEMA_VERSION = "soulforge.mail.feature_off_reconciliation_attestation.v2"

_SAFE_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_SHA256_DIGEST = re.compile(r"^[a-f0-9]{64}$")
_FORBIDDEN_KEY_PARTS = (
    "raw",
    "body",
    "subject",
    "address",
    "attachment",
    "token",
    "credential",
    "url",
    "path",
    "privateref",
    "privatereference",
)
_POLICY_FIELDS = {
    "schema_version",
    "policy_id",
    "public_synthetic",
    "roster_revision_digest",
    "expected_inbound_count",
    "roster_set_digest",
    "register_set_digest",
    "empty_normalized_set_digest",
    "cursor_receipt_baseline_target_pair_digest",
    "authority_snapshot_linkage_digest",
    "coverage_snapshot_linkage_digest",
    "direction",
    "provider",
    "query_digest",
    "source_revision_policy_digest",
    "approved_window_utc",
    "provider_target_digest",
}
_WINDOW_FIELDS = {"start", "end"}
_COMMON_WITNESS_FIELDS = {
    "schema_version",
    "witness_id",
    "kind",
    "public_synthetic",
}
_CURSOR_RECEIPT_TARGET_KIND = "cursor_receipt_baseline_target_pair"
_AUTHORITY_SNAPSHOT_KIND = "authority_snapshot_linkage"
_COVERAGE_SNAPSHOT_KIND = "roster_registry_source_ledger_coverage"
_REQUIRED_WITNESS_KINDS = {
    _CURSOR_RECEIPT_TARGET_KIND,
    _AUTHORITY_SNAPSHOT_KIND,
    _COVERAGE_SNAPSHOT_KIND,
}
_CURSOR_PAIR_FIELDS = _COMMON_WITNESS_FIELDS | {
    "cursor_digest",
    "last_success_receipt_digest",
    "baseline_digest",
    "provider_target_digest",
    "pre_pairing_digest",
    "post_pairing_digest",
    "pairing_digest",
    "pairing_state",
}
_AUTHORITY_SNAPSHOT_FIELDS = _COMMON_WITNESS_FIELDS | {
    "binding_digest",
    "release_digest",
    "register_digest",
    "pre_lease_digest",
    "pre_fence_digest",
    "pre_writer_epoch_digest",
    "post_lease_digest",
    "post_fence_digest",
    "post_writer_epoch_digest",
    "pre_authority_snapshot_digest",
    "post_authority_snapshot_digest",
    "authority_linkage_digest",
    "authority_state",
    "writer_state",
}
_COVERAGE_SNAPSHOT_FIELDS = _COMMON_WITNESS_FIELDS | {
    "roster_set_digest",
    "register_set_digest",
    "source_set_digest",
    "ledger_set_digest",
    "source_revision_policy_digest",
    "roster_register_intersection_set_digest",
    "roster_register_difference_set_digest",
    "source_ledger_intersection_set_digest",
    "source_ledger_difference_set_digest",
    "unregistered_set_digest",
    "expected_inbound_count",
    "registered_inbound_count",
    "unregistered_inbound_count",
    "source_inbound_count",
    "ledger_inbound_count",
    "exact_duplicate_noop_count",
    "identity_revision_conflict_count",
    "pre_coverage_snapshot_digest",
    "post_coverage_snapshot_digest",
    "coverage_linkage_digest",
    "coverage_state",
}
_PAIRING_STATES = {"current", "missing", "stale", "mismatch", "unknown"}
_WRITER_STATES = {
    "exclusive_quiescent",
    "active",
    "remote",
    "ambiguous",
    "unknown",
}


def _aggregate() -> dict[str, int]:
    return {
        "expected_inbound_count": 0,
        "registered_inbound_count": 0,
        "unregistered_inbound_count": 0,
        "source_inbound_count": 0,
        "ledger_inbound_count": 0,
        "source_ledger_missing_count": 0,
        "source_ledger_exact_duplicate_noop_count": 0,
        "source_ledger_identity_revision_conflict_count": 0,
    }


def _hold_result(*, hold_codes: tuple[str, ...], aggregate: Mapping[str, int]) -> dict[str, Any]:
    """Return fixed-shape, non-operational output without input reflection."""

    return {
        "schema_version": ATTESTATION_SCHEMA_VERSION,
        "status": "hold",
        "hold_codes": list(hold_codes),
        "writes_performed": False,
        "network_used": False,
        "official_completion": False,
        "live_replay_authorized": False,
        "aggregate": dict(aggregate),
    }


def _empty_rejection() -> dict[str, Any]:
    return _hold_result(
        hold_codes=("public_synthetic_input_rejected",),
        aggregate={
            "required_witness_kind_count": 0,
            "observed_required_witness_kind_count": 0,
            "witness_count": 0,
            **_aggregate(),
        },
    )


def _normalized_key(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _contains_forbidden_key(value: object) -> bool:
    """Reject prohibited field names recursively, including spelling variants."""

    if isinstance(value, Mapping):
        for key, item in value.items():
            normalized_key = _normalized_key(key)
            if normalized_key is None or any(
                forbidden in normalized_key for forbidden in _FORBIDDEN_KEY_PARTS
            ):
                return True
            if _contains_forbidden_key(item):
                return True
        return False
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return any(_contains_forbidden_key(item) for item in value)
    return False


def _is_safe_identifier(value: object) -> bool:
    return isinstance(value, str) and bool(_SAFE_IDENTIFIER.fullmatch(value))


def _is_digest(value: object) -> bool:
    return isinstance(value, str) and bool(_SHA256_DIGEST.fullmatch(value))


def _is_positive_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _is_nonnegative_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _parse_utc(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        return None


def _valid_policy(policy: object) -> tuple[bool, dict[str, Any]]:
    if not isinstance(policy, Mapping) or set(policy) != _POLICY_FIELDS:
        return False, {}
    if policy.get("schema_version") != POLICY_SCHEMA_VERSION:
        return False, {}
    if policy.get("public_synthetic") is not True or policy.get("direction") != "inbound":
        return False, {}
    if not _is_safe_identifier(policy.get("policy_id")):
        return False, {}
    if not _is_safe_identifier(policy.get("provider")):
        return False, {}
    if not _is_positive_int(policy.get("expected_inbound_count")):
        return False, {}
    for key in (
        "roster_revision_digest",
        "roster_set_digest",
        "register_set_digest",
        "empty_normalized_set_digest",
        "cursor_receipt_baseline_target_pair_digest",
        "authority_snapshot_linkage_digest",
        "coverage_snapshot_linkage_digest",
        "query_digest",
        "source_revision_policy_digest",
        "provider_target_digest",
    ):
        if not _is_digest(policy.get(key)):
            return False, {}
    window = policy.get("approved_window_utc")
    if not isinstance(window, Mapping) or set(window) != _WINDOW_FIELDS:
        return False, {}
    start = _parse_utc(window.get("start"))
    end = _parse_utc(window.get("end"))
    if start is None or end is None or start >= end:
        return False, {}
    return True, dict(policy)


def _valid_common_witness(witness: Mapping[str, Any]) -> bool:
    return (
        witness.get("schema_version") == WITNESS_SCHEMA_VERSION
        and _is_safe_identifier(witness.get("witness_id"))
        and witness.get("public_synthetic") is True
    )


def _valid_cursor_pair(witness: Mapping[str, Any]) -> bool:
    return (
        set(witness) == _CURSOR_PAIR_FIELDS
        and _valid_common_witness(witness)
        and all(
            _is_digest(witness.get(field))
            for field in (
                "cursor_digest",
                "last_success_receipt_digest",
                "baseline_digest",
                "provider_target_digest",
                "pre_pairing_digest",
                "post_pairing_digest",
                "pairing_digest",
            )
        )
        and witness.get("pairing_state") in _PAIRING_STATES
    )


def _valid_authority_snapshot(witness: Mapping[str, Any]) -> bool:
    return (
        set(witness) == _AUTHORITY_SNAPSHOT_FIELDS
        and _valid_common_witness(witness)
        and all(
            _is_digest(witness.get(field))
            for field in (
                "binding_digest",
                "release_digest",
                "register_digest",
                "pre_lease_digest",
                "pre_fence_digest",
                "pre_writer_epoch_digest",
                "post_lease_digest",
                "post_fence_digest",
                "post_writer_epoch_digest",
                "pre_authority_snapshot_digest",
                "post_authority_snapshot_digest",
                "authority_linkage_digest",
            )
        )
        and witness.get("authority_state") in _PAIRING_STATES
        and witness.get("writer_state") in _WRITER_STATES
    )


def _valid_coverage_snapshot(witness: Mapping[str, Any]) -> bool:
    return (
        set(witness) == _COVERAGE_SNAPSHOT_FIELDS
        and _valid_common_witness(witness)
        and all(
            _is_digest(witness.get(field))
            for field in (
                "roster_set_digest",
                "register_set_digest",
                "source_set_digest",
                "ledger_set_digest",
                "source_revision_policy_digest",
                "roster_register_intersection_set_digest",
                "roster_register_difference_set_digest",
                "source_ledger_intersection_set_digest",
                "source_ledger_difference_set_digest",
                "unregistered_set_digest",
                "pre_coverage_snapshot_digest",
                "post_coverage_snapshot_digest",
                "coverage_linkage_digest",
            )
        )
        and all(
            _is_nonnegative_int(witness.get(field))
            for field in (
                "expected_inbound_count",
                "registered_inbound_count",
                "unregistered_inbound_count",
                "source_inbound_count",
                "ledger_inbound_count",
                "exact_duplicate_noop_count",
                "identity_revision_conflict_count",
            )
        )
        and witness.get("coverage_state") in _PAIRING_STATES
    )


def _valid_witnesses(witnesses: object) -> tuple[bool, dict[str, Mapping[str, Any]], int]:
    if not isinstance(witnesses, list):
        return False, {}, 0
    validators = {
        _CURSOR_RECEIPT_TARGET_KIND: _valid_cursor_pair,
        _AUTHORITY_SNAPSHOT_KIND: _valid_authority_snapshot,
        _COVERAGE_SNAPSHOT_KIND: _valid_coverage_snapshot,
    }
    by_kind: dict[str, Mapping[str, Any]] = {}
    witness_ids: set[str] = set()
    for witness in witnesses:
        if not isinstance(witness, Mapping):
            return False, {}, 0
        kind = witness.get("kind")
        witness_id = witness.get("witness_id")
        if (
            not _is_safe_identifier(kind)
            or not _is_safe_identifier(witness_id)
            or kind not in validators
            or witness_id in witness_ids
            or kind in by_kind
            or not validators[kind](witness)
        ):
            return False, {}, 0
        witness_ids.add(witness_id)
        by_kind[kind] = witness
    return True, by_kind, len(witness_ids)


def _semantic_evaluation(
    policy: Mapping[str, Any],
    witnesses: Mapping[str, Mapping[str, Any]],
) -> tuple[list[str], dict[str, int]]:
    hold_codes: list[str] = []
    aggregate = _aggregate()

    cursor_pair = witnesses.get(_CURSOR_RECEIPT_TARGET_KIND)
    if cursor_pair is not None:
        if cursor_pair["pairing_state"] != "current":
            hold_codes.append("cursor_receipt_baseline_target_pair_not_current")
        if cursor_pair["provider_target_digest"] != policy["provider_target_digest"]:
            hold_codes.append("cursor_receipt_target_mismatch")
        if (
            cursor_pair["pre_pairing_digest"] != cursor_pair["post_pairing_digest"]
            or cursor_pair["pre_pairing_digest"] != cursor_pair["pairing_digest"]
            or cursor_pair["pairing_digest"]
            != policy["cursor_receipt_baseline_target_pair_digest"]
        ):
            hold_codes.append("cursor_receipt_baseline_target_pair_mismatch")

    authority = witnesses.get(_AUTHORITY_SNAPSHOT_KIND)
    if authority is not None:
        if authority["authority_state"] != "current":
            hold_codes.append("authority_snapshot_not_current")
        if authority["writer_state"] != "exclusive_quiescent":
            hold_codes.append("writer_state_not_exclusive_quiescent")
        if (
            authority["pre_lease_digest"] != authority["post_lease_digest"]
            or authority["pre_fence_digest"] != authority["post_fence_digest"]
            or authority["pre_writer_epoch_digest"]
            != authority["post_writer_epoch_digest"]
        ):
            hold_codes.append("lease_fence_epoch_snapshot_mismatch")
        if (
            authority["pre_authority_snapshot_digest"]
            != authority["post_authority_snapshot_digest"]
            or authority["pre_authority_snapshot_digest"]
            != authority["authority_linkage_digest"]
            or authority["authority_linkage_digest"]
            != policy["authority_snapshot_linkage_digest"]
        ):
            hold_codes.append("authority_snapshot_linkage_mismatch")

    coverage = witnesses.get(_COVERAGE_SNAPSHOT_KIND)
    if coverage is not None:
        aggregate.update(
            {
                "expected_inbound_count": coverage["expected_inbound_count"],
                "registered_inbound_count": coverage["registered_inbound_count"],
                "unregistered_inbound_count": coverage["unregistered_inbound_count"],
                "source_inbound_count": coverage["source_inbound_count"],
                "ledger_inbound_count": coverage["ledger_inbound_count"],
                "source_ledger_exact_duplicate_noop_count": coverage[
                    "exact_duplicate_noop_count"
                ],
                "source_ledger_identity_revision_conflict_count": coverage[
                    "identity_revision_conflict_count"
                ],
            }
        )
        aggregate["source_ledger_missing_count"] = max(
            policy["expected_inbound_count"] - coverage["source_inbound_count"],
            policy["expected_inbound_count"] - coverage["ledger_inbound_count"],
            0,
        )
        if coverage["coverage_state"] != "current":
            hold_codes.append("coverage_snapshot_not_current")
        if (
            coverage["pre_coverage_snapshot_digest"]
            != coverage["post_coverage_snapshot_digest"]
            or coverage["pre_coverage_snapshot_digest"]
            != coverage["coverage_linkage_digest"]
            or coverage["coverage_linkage_digest"]
            != policy["coverage_snapshot_linkage_digest"]
        ):
            hold_codes.append("coverage_snapshot_linkage_mismatch")
        if (
            policy["roster_set_digest"] != policy["register_set_digest"]
            or coverage["roster_set_digest"] != policy["roster_set_digest"]
            or coverage["register_set_digest"] != policy["register_set_digest"]
            or coverage["roster_register_intersection_set_digest"]
            != policy["roster_set_digest"]
            or coverage["roster_register_difference_set_digest"]
            != policy["empty_normalized_set_digest"]
        ):
            hold_codes.append("roster_registry_coverage_mismatch")
        if (
            coverage["source_set_digest"] != policy["roster_set_digest"]
            or coverage["ledger_set_digest"] != policy["roster_set_digest"]
            or coverage["source_revision_policy_digest"]
            != policy["source_revision_policy_digest"]
            or coverage["source_ledger_intersection_set_digest"]
            != policy["roster_set_digest"]
            or coverage["source_ledger_difference_set_digest"]
            != policy["empty_normalized_set_digest"]
        ):
            hold_codes.append("source_ledger_coverage_mismatch")
        if coverage["unregistered_set_digest"] != policy["empty_normalized_set_digest"]:
            hold_codes.append("unregistered_source_set_not_empty")
        if coverage["unregistered_inbound_count"] != 0:
            hold_codes.append("unregistered_sources_present")
        if any(
            coverage[field] != policy["expected_inbound_count"]
            for field in (
                "expected_inbound_count",
                "registered_inbound_count",
                "source_inbound_count",
                "ledger_inbound_count",
            )
        ):
            hold_codes.append("inbound_coverage_count_mismatch")
        if coverage["identity_revision_conflict_count"] != 0:
            hold_codes.append("source_ledger_identity_revision_conflict")
    return hold_codes, aggregate


def build_feature_off_reconciliation_attestation(
    *,
    policy: Mapping[str, Any],
    witnesses: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Build a pure aggregate feature-OFF reconciliation HOLD attestation.

    The coverage witness must contain opaque canonical set digests for roster,
    register, source, and ledger plus explicit normalized intersections and
    differences.  Its linkage digest must bind that full projection.  The
    cursor witness similarly binds cursor, last-success receipt, outage
    baseline, and provider target; the authority witness binds binding,
    release, register, lease, fence, and writer epoch.  Values are never
    reflected in output.
    """

    if _contains_forbidden_key(policy) or _contains_forbidden_key(witnesses):
        return _empty_rejection()
    policy_valid, validated_policy = _valid_policy(policy)
    witnesses_valid, witnesses_by_kind, witness_count = _valid_witnesses(witnesses)
    if not policy_valid or not witnesses_valid:
        return _empty_rejection()

    observed_kind_count = len(witnesses_by_kind)
    hold_codes = ["feature_off_non_operational"]
    if set(witnesses_by_kind) != _REQUIRED_WITNESS_KINDS:
        hold_codes.append("required_witnesses_missing")
    semantic_hold_codes, semantic_aggregate = _semantic_evaluation(
        validated_policy,
        witnesses_by_kind,
    )
    hold_codes.extend(semantic_hold_codes)
    return _hold_result(
        hold_codes=tuple(hold_codes),
        aggregate={
            "required_witness_kind_count": len(_REQUIRED_WITNESS_KINDS),
            "observed_required_witness_kind_count": observed_kind_count,
            "witness_count": witness_count,
            **semantic_aggregate,
        },
    )
