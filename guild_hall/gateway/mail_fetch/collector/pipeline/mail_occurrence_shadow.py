from __future__ import annotations

from copy import deepcopy
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence
import unicodedata


SHADOW_SCHEMA_VERSION = "email.fetch.mail_occurrence_shadow.v1"
SHADOW_STATE_SCHEMA_VERSION = "email.fetch.mail_occurrence_shadow_state.v1"
COVERAGE_SCHEMA_VERSION = "soulforge.project_history_coverage_receipt.v1"
COVERAGE_WRAPPER_SCHEMA_VERSION = "email.fetch.mail_account_coverage_shadow.v1"
INBOUND_RECONCILIATION_EXPECTED_SOURCE_COUNT = 5

COVERAGE_STATES = (
    "complete_with_events",
    "complete_no_events",
    "partial",
    "failed",
    "not_collected",
    "not_applicable",
)
PARTICIPANT_ROLES = ("sender", "to", "cc", "bcc", "unknown", "sender_transport")
PARTICIPANT_EVIDENCE = ("sender_copy", "recipient_copy", "transport", "source_native", "unknown")
DIRECTIONS = ("received", "sent", "transport")
ACCOUNT_ROLES = ("owner", "team")
THREAD_RELATION_KINDS = ("in_reply_to", "references", "provider_thread")

_REF_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,255}$")
_RFC_LOCAL_ATOM_RE = re.compile(r"^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+$")
_RFC_DOMAIN_LABEL_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$")
_PROVIDER_AUTHORITY_RE = re.compile(r"^provider:[a-z0-9][a-z0-9._-]{0,63}$")
_UTC_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
_UTC_MILLISECONDS_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
_DIGEST_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
_ENTITY_TYPE_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
_GAP_CODE_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,127}$")
_PROVIDER_KIND_RE = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")
_RECONCILIATION_ALIAS_RE = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")
_ABSOLUTE_OR_URI_RE = re.compile(
    r"^(?:[A-Za-z]:[\\/]|\\\\|//|[\\/]|~(?:[\\/]|$)|(?:https?|ftp|file|mailto|urn|data):|[A-Za-z][A-Za-z0-9+.-]*://)",
    re.IGNORECASE,
)
_FORBIDDEN_KEY_TOKENS = (
    "body",
    "html",
    "content",
    "header",
    "raw",
    "secret",
    "token",
    "password",
    "credential",
    "cookie",
    "session",
    "apikey",
    "authorization",
)
_FORBIDDEN_FILE_KEY_TOKENS = ("bytes", "name", "path", "url", "payload")
_TYPED_REF_FIELDS = ("entity_type", "owner_surface", "entity_id")
COVERAGE_FIELDS = (
    "schema_version",
    "lane",
    "source_owner_ref",
    "project_ref",
    "window_start",
    "window_end",
    "state",
    "event_count",
    "gap_codes",
    "applicability_ref",
    "ordered_event_digest",
    "metadata_digest",
    "raw_payload_copied",
)


class MailOccurrenceShadowError(ValueError):
    def __init__(self, code: str, field: str = "") -> None:
        self.code = code
        self.field = field
        suffix = f" field={field}" if field else ""
        super().__init__(f"{code}{suffix}")


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _digest(value: Any) -> str:
    return f"sha256:{hashlib.sha256(_canonical_json(value).encode('utf-8')).hexdigest()}"


def _require_ref(value: Any, field: str) -> str:
    if not isinstance(value, str) or value != value.strip() or not _REF_RE.fullmatch(value):
        raise MailOccurrenceShadowError("invalid_opaque_ref", field)
    return value


def _require_utc(value: Any, field: str) -> str:
    if not isinstance(value, str) or not _UTC_RE.fullmatch(value):
        raise MailOccurrenceShadowError("invalid_utc_timestamp", field)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise MailOccurrenceShadowError("invalid_utc_timestamp", field) from exc
    if parsed.strftime("%Y-%m-%dT%H:%M:%SZ") != value:
        raise MailOccurrenceShadowError("invalid_utc_timestamp", field)
    return value


def _require_canonical_utc_milliseconds(value: Any, field: str) -> str:
    if not isinstance(value, str) or not _UTC_MILLISECONDS_RE.fullmatch(value):
        raise MailOccurrenceShadowError("invalid_canonical_utc_timestamp", field)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise MailOccurrenceShadowError("invalid_canonical_utc_timestamp", field) from exc
    if parsed.isoformat(timespec="milliseconds").replace("+00:00", "Z") != value:
        raise MailOccurrenceShadowError("invalid_canonical_utc_timestamp", field)
    return value


def _require_digest(value: Any, field: str) -> str:
    if not isinstance(value, str) or not _DIGEST_RE.fullmatch(value):
        raise MailOccurrenceShadowError("invalid_digest", field)
    return value


def _exact_keys(value: Mapping[str, Any], expected: Sequence[str], field: str) -> None:
    if set(value) != set(expected):
        raise MailOccurrenceShadowError("unexpected_fields", field)


def _normalized_key_alias(value: Any) -> str:
    return "".join(character.lower() for character in str(value) if character.isalnum())


def assert_public_safe_mail_metadata(value: Any) -> None:
    stack = [("$", value)]
    while stack:
        path, current = stack.pop()
        if isinstance(current, Mapping):
            for key, child in current.items():
                if not isinstance(key, str):
                    raise MailOccurrenceShadowError("metadata_key_not_string", path)
                normalized = _normalized_key_alias(key)
                child_path = f"{path}.{key}"
                if key == "raw_payload_copied":
                    if child is not False:
                        raise MailOccurrenceShadowError("raw_payload_copied_must_be_false", child_path)
                elif key == "attachment_custody_refs":
                    pass
                elif "attachment" in normalized:
                    raise MailOccurrenceShadowError("forbidden_attachment_field", child_path)
                elif any(token in normalized for token in _FORBIDDEN_KEY_TOKENS):
                    raise MailOccurrenceShadowError("forbidden_payload_field", child_path)
                elif any(token in normalized for token in _FORBIDDEN_FILE_KEY_TOKENS):
                    raise MailOccurrenceShadowError("forbidden_attachment_field", child_path)
                stack.append((child_path, child))
        elif isinstance(current, (list, tuple)):
            for index, child in enumerate(current):
                stack.append((f"{path}[{index}]", child))
        elif isinstance(current, str) and _ABSOLUTE_OR_URI_RE.match(current.strip()):
            raise MailOccurrenceShadowError("forbidden_locator_value", path)


def _require_nullable_digest(value: Any, field: str) -> Optional[str]:
    if value is None:
        return None
    return _require_digest(value, field)


def _require_provider_kind(value: Any, field: str) -> str:
    if not isinstance(value, str) or not _PROVIDER_KIND_RE.fullmatch(value):
        raise MailOccurrenceShadowError("invalid_provider_kind", field)
    return value


def _require_reconciliation_alias(value: Any, field: str) -> str:
    if not isinstance(value, str) or not _RECONCILIATION_ALIAS_RE.fullmatch(value):
        raise MailOccurrenceShadowError("invalid_reconciliation_alias", field)
    return value


def _sorted_unique_reconciliation_aliases(value: Any, field: str) -> List[str]:
    if not isinstance(value, list):
        raise MailOccurrenceShadowError("reconciliation_alias_list_required", field)
    aliases = [_require_reconciliation_alias(item, field) for item in value]
    if aliases != sorted(set(aliases), key=lambda item: item.encode("utf-8")):
        raise MailOccurrenceShadowError("reconciliation_alias_list_not_canonical", field)
    return aliases


def _validate_reconciliation_snapshot(value: Any, field: str) -> Dict[str, str]:
    if not isinstance(value, Mapping):
        raise MailOccurrenceShadowError("reconciliation_snapshot_not_object", field)
    _exact_keys(value, ("snapshot_digest", "captured_at_utc"), field)
    return {
        "snapshot_digest": _require_digest(value["snapshot_digest"], f"{field}.snapshot_digest"),
        "captured_at_utc": _require_utc(value["captured_at_utc"], f"{field}.captured_at_utc"),
    }


def _validate_reconciliation_authority(value: Any) -> tuple[Dict[str, str], List[str]]:
    expected = (
        "expected_binding_digest",
        "observed_binding_digest",
        "expected_register_digest",
        "observed_register_digest",
        "expected_writer_epoch_digest",
        "observed_writer_epoch_digest",
        "expected_lease_digest",
        "observed_lease_digest",
        "writer_state",
    )
    if not isinstance(value, Mapping):
        raise MailOccurrenceShadowError("reconciliation_authority_not_object", "authority")
    _exact_keys(value, expected, "authority")
    authority = {
        field: _require_digest(value[field], f"authority.{field}")
        for field in expected
        if field != "writer_state"
    }
    if not isinstance(value["writer_state"], str) or value["writer_state"] not in {
        "exclusive",
        "ambiguous",
        "unknown",
        "absent",
    }:
        raise MailOccurrenceShadowError("writer_state_invalid", "authority.writer_state")
    authority["writer_state"] = value["writer_state"]
    holds: List[str] = []
    if authority["expected_binding_digest"] != authority["observed_binding_digest"]:
        holds.append("binding_digest_mismatch")
    if authority["expected_register_digest"] != authority["observed_register_digest"]:
        holds.append("register_digest_mismatch")
    if authority["expected_writer_epoch_digest"] != authority["observed_writer_epoch_digest"]:
        holds.append("writer_epoch_mismatch")
    if (
        authority["expected_lease_digest"] != authority["observed_lease_digest"]
        or authority["writer_state"] != "exclusive"
    ):
        holds.append("writer_lease_ambiguous")
    return authority, holds


def _validate_reconciliation_cursor(value: Any) -> tuple[Dict[str, Any], List[str]]:
    expected = (
        "baseline_snapshot",
        "target_snapshot",
        "observed_target_snapshot",
        "target_relation",
        "approved_outage_window",
    )
    if not isinstance(value, Mapping):
        raise MailOccurrenceShadowError("reconciliation_cursor_not_object", "cursor")
    _exact_keys(value, expected, "cursor")
    cursor = {
        "baseline_snapshot": _validate_reconciliation_snapshot(
            value["baseline_snapshot"], "cursor.baseline_snapshot"
        ),
        "target_snapshot": _validate_reconciliation_snapshot(
            value["target_snapshot"], "cursor.target_snapshot"
        ),
        "observed_target_snapshot": _validate_reconciliation_snapshot(
            value["observed_target_snapshot"], "cursor.observed_target_snapshot"
        ),
        "target_relation": value["target_relation"],
        "approved_outage_window": value["approved_outage_window"],
    }
    if cursor["target_relation"] not in {"fast_forward", "non_fast_forward", "unknown"}:
        raise MailOccurrenceShadowError("target_relation_invalid", "cursor.target_relation")
    holds: List[str] = []
    if cursor["target_relation"] != "fast_forward":
        holds.append("target_non_fast_forward")
    if cursor["target_snapshot"] != cursor["observed_target_snapshot"]:
        holds.append("target_drift")
    outage_window, outage_holds = _validate_approved_outage_window(cursor)
    cursor["approved_outage_window"] = outage_window
    holds.extend(outage_holds)
    return cursor, holds


def _validate_approved_outage_window(cursor: Mapping[str, Any]) -> tuple[Dict[str, str], List[str]]:
    expected = (
        "interval",
        "baseline_snapshot_digest",
        "baseline_captured_at_utc",
        "target_snapshot_digest",
        "target_captured_at_utc",
        "provenance_digest",
    )
    value = cursor["approved_outage_window"]
    if not isinstance(value, Mapping):
        raise MailOccurrenceShadowError("approved_outage_window_not_object", "cursor.approved_outage_window")
    _exact_keys(value, expected, "cursor.approved_outage_window")
    window = {
        "interval": value["interval"],
        "baseline_snapshot_digest": _require_digest(
            value["baseline_snapshot_digest"], "cursor.approved_outage_window.baseline_snapshot_digest"
        ),
        "baseline_captured_at_utc": _require_utc(
            value["baseline_captured_at_utc"], "cursor.approved_outage_window.baseline_captured_at_utc"
        ),
        "target_snapshot_digest": _require_digest(
            value["target_snapshot_digest"], "cursor.approved_outage_window.target_snapshot_digest"
        ),
        "target_captured_at_utc": _require_utc(
            value["target_captured_at_utc"], "cursor.approved_outage_window.target_captured_at_utc"
        ),
        "provenance_digest": _require_digest(
            value["provenance_digest"], "cursor.approved_outage_window.provenance_digest"
        ),
    }
    if window["interval"] != "(baseline,target]":
        raise MailOccurrenceShadowError("approved_outage_window_interval_invalid", "cursor.approved_outage_window.interval")
    projection = {key: item for key, item in window.items() if key != "provenance_digest"}
    holds: List[str] = []
    if window["provenance_digest"] != _digest(projection):
        holds.append("outage_window_provenance_mismatch")
    if (
        window["baseline_snapshot_digest"] != cursor["baseline_snapshot"]["snapshot_digest"]
        or window["baseline_captured_at_utc"] != cursor["baseline_snapshot"]["captured_at_utc"]
        or window["target_snapshot_digest"] != cursor["target_snapshot"]["snapshot_digest"]
        or window["target_captured_at_utc"] != cursor["target_snapshot"]["captured_at_utc"]
    ):
        holds.append("outage_window_provenance_mismatch")
    if window["baseline_captured_at_utc"] >= window["target_captured_at_utc"]:
        holds.append("outage_window_non_monotonic")
    return window, holds


def _validate_reconciliation_resume(value: Any, baseline_digest: str) -> tuple[Dict[str, Optional[str]], List[str]]:
    expected = ("state", "last_committed_receipt_digest", "resume_cursor_digest")
    if not isinstance(value, Mapping):
        raise MailOccurrenceShadowError("reconciliation_resume_not_object", "resume")
    _exact_keys(value, expected, "resume")
    if value["state"] not in {"not_required", "resume_from_committed_receipt", "crash_uncommitted"}:
        raise MailOccurrenceShadowError("resume_state_invalid", "resume.state")
    resume = {
        "state": value["state"],
        "last_committed_receipt_digest": _require_nullable_digest(
            value["last_committed_receipt_digest"], "resume.last_committed_receipt_digest"
        ),
        "resume_cursor_digest": _require_nullable_digest(
            value["resume_cursor_digest"], "resume.resume_cursor_digest"
        ),
    }
    holds: List[str] = []
    if resume["state"] == "not_required":
        if resume["last_committed_receipt_digest"] is not None or resume["resume_cursor_digest"] is not None:
            holds.append("resume_receipt_invalid")
    elif resume["state"] == "resume_from_committed_receipt":
        if (
            resume["last_committed_receipt_digest"] is None
            or resume["resume_cursor_digest"] != baseline_digest
        ):
            holds.append("resume_receipt_invalid")
    else:
        holds.append("resume_receipt_invalid")
    return resume, holds


def _validate_reconciliation_atomicity(value: Any) -> tuple[Dict[str, Any], List[str]]:
    expected = ("capability_state", "operation_order")
    if not isinstance(value, Mapping):
        raise MailOccurrenceShadowError("reconciliation_atomicity_not_object", "atomicity")
    _exact_keys(value, expected, "atomicity")
    if value["capability_state"] not in {"verified", "unknown", "unavailable"}:
        raise MailOccurrenceShadowError("atomicity_state_invalid", "atomicity.capability_state")
    if not isinstance(value["operation_order"], list) or not all(
        isinstance(item, str) for item in value["operation_order"]
    ):
        raise MailOccurrenceShadowError("atomicity_order_invalid", "atomicity.operation_order")
    atomicity = {
        "capability_state": value["capability_state"],
        "operation_order": list(value["operation_order"]),
    }
    expected_order = ["append_validate", "receipt_commit", "cursor_advance"]
    holds = []
    if atomicity["capability_state"] != "verified" or atomicity["operation_order"] != expected_order:
        holds.append("atomicity_unproven")
    return atomicity, holds


def _validate_reconciliation_source_record(value: Any, field: str) -> Dict[str, str]:
    expected = (
        "source_alias",
        "identity_digest",
        "received_at_utc",
        "revision_digest",
        "message_digest",
    )
    if not isinstance(value, Mapping):
        raise MailOccurrenceShadowError("source_record_not_object", field)
    _exact_keys(value, expected, field)
    return {
        "source_alias": _require_reconciliation_alias(value["source_alias"], f"{field}.source_alias"),
        "identity_digest": _require_digest(value["identity_digest"], f"{field}.identity_digest"),
        "received_at_utc": _require_utc(value["received_at_utc"], f"{field}.received_at_utc"),
        "revision_digest": _require_digest(value["revision_digest"], f"{field}.revision_digest"),
        "message_digest": _require_digest(value["message_digest"], f"{field}.message_digest"),
    }


def _validate_reconciliation_ledger_record(value: Any, field: str) -> Dict[str, str]:
    expected = ("source_alias", "identity_digest", "message_digest", "pointer_digest")
    if not isinstance(value, Mapping):
        raise MailOccurrenceShadowError("ledger_record_not_object", field)
    _exact_keys(value, expected, field)
    return {
        "source_alias": _require_reconciliation_alias(value["source_alias"], f"{field}.source_alias"),
        "identity_digest": _require_digest(value["identity_digest"], f"{field}.identity_digest"),
        "message_digest": _require_digest(value["message_digest"], f"{field}.message_digest"),
        "pointer_digest": _require_digest(value["pointer_digest"], f"{field}.pointer_digest"),
    }


def _sorted_hold_codes(values: Iterable[str]) -> List[str]:
    return sorted(set(values), key=lambda item: item.encode("utf-8"))


def build_inbound_reconciliation_shadow(value: Mapping[str, Any]) -> Dict[str, Any]:
    """Build a metadata-only, feature-OFF reconciliation plan without I/O or authority.

    This intentionally validates only public-safe synthetic metadata.  It does not
    open a register, mail source, ledger, receipt, credential, path, socket, or
    shadow store; callers must obtain live proof through a separate private gate.
    """
    expected = (
        "registered_inbound_sources",
        "roster_coverage",
        "source_snapshots",
        "cursor",
        "authority",
        "resume",
        "atomicity",
    )
    if not isinstance(value, Mapping):
        raise MailOccurrenceShadowError("reconciliation_not_object", "reconciliation")
    _exact_keys(value, expected, "reconciliation")
    assert_public_safe_mail_metadata(value)

    if not isinstance(value["registered_inbound_sources"], list):
        raise MailOccurrenceShadowError("registered_sources_not_array", "registered_inbound_sources")
    registered: List[Dict[str, str]] = []
    for index, row in enumerate(value["registered_inbound_sources"]):
        field = f"registered_inbound_sources[{index}]"
        if not isinstance(row, Mapping):
            raise MailOccurrenceShadowError("registered_source_not_object", field)
        _exact_keys(row, ("source_alias", "source_id_digest", "provider_kind"), field)
        registered.append(
            {
                "source_alias": _require_reconciliation_alias(row["source_alias"], f"{field}.source_alias"),
                "source_id_digest": _require_digest(row["source_id_digest"], f"{field}.source_id_digest"),
                "provider_kind": _require_provider_kind(row["provider_kind"], f"{field}.provider_kind"),
            }
        )

    if not isinstance(value["roster_coverage"], Mapping):
        raise MailOccurrenceShadowError("roster_coverage_not_object", "roster_coverage")
    _exact_keys(value["roster_coverage"], ("state", "expected_inbound_aliases", "observed_inbound_aliases"), "roster_coverage")
    roster_state = value["roster_coverage"]["state"]
    if roster_state not in {"exact", "mismatch", "unknown"}:
        raise MailOccurrenceShadowError("roster_coverage_state_invalid", "roster_coverage.state")
    roster_expected = _sorted_unique_reconciliation_aliases(
        value["roster_coverage"]["expected_inbound_aliases"], "roster_coverage.expected_inbound_aliases"
    )
    roster_observed = _sorted_unique_reconciliation_aliases(
        value["roster_coverage"]["observed_inbound_aliases"], "roster_coverage.observed_inbound_aliases"
    )

    authority, authority_holds = _validate_reconciliation_authority(value["authority"])
    cursor, cursor_holds = _validate_reconciliation_cursor(value["cursor"])
    resume, resume_holds = _validate_reconciliation_resume(
        value["resume"], cursor["baseline_snapshot"]["snapshot_digest"]
    )
    atomicity, atomicity_holds = _validate_reconciliation_atomicity(value["atomicity"])

    if not isinstance(value["source_snapshots"], list):
        raise MailOccurrenceShadowError("source_snapshots_not_array", "source_snapshots")
    snapshots: List[Dict[str, Any]] = []
    for index, snapshot in enumerate(value["source_snapshots"]):
        field = f"source_snapshots[{index}]"
        if not isinstance(snapshot, Mapping):
            raise MailOccurrenceShadowError("source_snapshot_not_object", field)
        _exact_keys(snapshot, ("source_alias", "source_records", "ledger_records"), field)
        source_alias = _require_reconciliation_alias(snapshot["source_alias"], f"{field}.source_alias")
        if not isinstance(snapshot["source_records"], list) or not isinstance(snapshot["ledger_records"], list):
            raise MailOccurrenceShadowError("source_snapshot_records_not_array", field)
        source_records = [
            _validate_reconciliation_source_record(record, f"{field}.source_records[{record_index}]")
            for record_index, record in enumerate(snapshot["source_records"])
        ]
        ledger_records = [
            _validate_reconciliation_ledger_record(record, f"{field}.ledger_records[{record_index}]")
            for record_index, record in enumerate(snapshot["ledger_records"])
        ]
        snapshots.append(
            {
                "source_alias": source_alias,
                "source_records": source_records,
                "ledger_records": ledger_records,
            }
        )

    registered_aliases = [row["source_alias"] for row in registered]
    registered_alias_set = set(registered_aliases)
    snapshot_aliases = [row["source_alias"] for row in snapshots]
    snapshot_alias_set = set(snapshot_aliases)
    global_holds = list(authority_holds + cursor_holds + resume_holds + atomicity_holds)
    if (
        len(registered) != INBOUND_RECONCILIATION_EXPECTED_SOURCE_COUNT
        or len(registered_alias_set) != INBOUND_RECONCILIATION_EXPECTED_SOURCE_COUNT
        or len({row["source_id_digest"] for row in registered}) != INBOUND_RECONCILIATION_EXPECTED_SOURCE_COUNT
    ):
        global_holds.append("registered_source_coverage_mismatch")
    if (
        roster_state != "exact"
        or set(roster_expected) != registered_alias_set
        or set(roster_observed) != registered_alias_set
    ):
        global_holds.append("roster_coverage_mismatch")
    if (
        len(snapshots) != INBOUND_RECONCILIATION_EXPECTED_SOURCE_COUNT
        or len(snapshot_alias_set) != INBOUND_RECONCILIATION_EXPECTED_SOURCE_COUNT
        or snapshot_alias_set != registered_alias_set
    ):
        global_holds.append("source_snapshot_coverage_mismatch")
    if any(alias not in registered_alias_set for alias in snapshot_aliases):
        global_holds.append("unknown_source_snapshot")

    source_summaries: List[Dict[str, Any]] = []
    global_plan: List[Dict[str, str]] = []
    outage_window = cursor["approved_outage_window"]
    for snapshot in sorted(snapshots, key=lambda row: row["source_alias"].encode("utf-8")):
        alias = snapshot["source_alias"]
        source_holds: List[str] = []
        source_by_identity: Dict[str, Dict[str, str]] = {}
        source_exact_duplicates = 0
        for record in snapshot["source_records"]:
            if record["source_alias"] != alias:
                source_holds.append("source_alias_mismatch")
                continue
            if record["received_at_utc"] <= outage_window["baseline_captured_at_utc"]:
                source_holds.append("outage_window_pre_baseline")
            elif record["received_at_utc"] > outage_window["target_captured_at_utc"]:
                source_holds.append("outage_window_post_target")
            existing = source_by_identity.get(record["identity_digest"])
            if existing is None:
                source_by_identity[record["identity_digest"]] = record
            elif (
                existing["message_digest"] != record["message_digest"]
                or existing["revision_digest"] != record["revision_digest"]
            ):
                source_holds.append("source_revision_conflict")
            else:
                source_exact_duplicates += 1

        ledger_by_identity: Dict[str, Dict[str, str]] = {}
        for record in snapshot["ledger_records"]:
            if record["source_alias"] != alias:
                source_holds.append("ledger_alias_mismatch")
                continue
            existing = ledger_by_identity.get(record["identity_digest"])
            if existing is None:
                ledger_by_identity[record["identity_digest"]] = record
            elif (
                existing["message_digest"] != record["message_digest"]
                or existing["pointer_digest"] != record["pointer_digest"]
            ):
                source_holds.append("ledger_identity_ambiguous")
            else:
                source_holds.append("ledger_identity_ambiguous")

        if any(identity_digest not in source_by_identity for identity_digest in ledger_by_identity):
            source_holds.append("ledger_only_identity")

        missing_records: List[Dict[str, str]] = []
        duplicate_count = source_exact_duplicates
        for identity_digest, record in source_by_identity.items():
            ledger = ledger_by_identity.get(identity_digest)
            if ledger is None:
                missing_records.append(record)
            elif ledger["message_digest"] != record["message_digest"]:
                source_holds.append("identity_digest_conflict")
            else:
                duplicate_count += 1

        ordered_missing = sorted(
            missing_records,
            key=lambda record: (
                record["received_at_utc"],
                record["identity_digest"],
                record["revision_digest"],
            ),
        )
        before_members = [
            {"identity_digest": record["identity_digest"], "message_digest": record["message_digest"]}
            for record in ledger_by_identity.values()
        ]
        before_members.sort(key=lambda record: (record["identity_digest"], record["message_digest"]))
        proposed_members = before_members + [
            {"identity_digest": record["identity_digest"], "message_digest": record["message_digest"]}
            for record in ordered_missing
        ]
        proposed_members.sort(key=lambda record: (record["identity_digest"], record["message_digest"]))
        summary_holds = _sorted_hold_codes(global_holds + source_holds)
        source_summaries.append(
            {
                "source_alias": alias,
                "scanned": len(source_by_identity),
                "source_count": len(source_by_identity),
                "ledger_count": len(ledger_by_identity),
                "missing": len(ordered_missing),
                "fetched": 0,
                "duplicate": duplicate_count,
                "conflict": len(_sorted_hold_codes(source_holds)),
                "unexplained_missing": len(ordered_missing) if summary_holds else 0,
                "before_set_digest": _digest(before_members),
                "proposed_after_set_digest": _digest(before_members if summary_holds else proposed_members),
                "hold_codes": summary_holds,
                "replay_plan": [] if summary_holds else deepcopy(ordered_missing),
            }
        )
        if not summary_holds:
            global_plan.extend(
                [dict(record, source_alias=alias) for record in ordered_missing]
            )

    global_holds = _sorted_hold_codes(global_holds)
    if global_holds or any(summary["hold_codes"] for summary in source_summaries):
        global_plan = []
    else:
        global_plan.sort(
            key=lambda record: (
                record["received_at_utc"],
                record["identity_digest"],
                record["revision_digest"],
            )
        )
    return {
        "feature_off": True,
        "live_replay_authorized": False,
        "official_completion": False,
        "network_used": False,
        "private_writes": 0,
        "status": "hold" if global_holds or any(row["hold_codes"] for row in source_summaries) else "plan_ready",
        "registered_source_count": len(registered),
        "expected_inbound_source_count": INBOUND_RECONCILIATION_EXPECTED_SOURCE_COUNT,
        "global_hold_codes": global_holds,
        "authority_digest": _digest(authority),
        "cursor_digest": _digest(cursor),
        "resume_boundary": {
            "state": resume["state"],
            "last_committed_receipt_digest": resume["last_committed_receipt_digest"],
            "resume_cursor_digest": resume["resume_cursor_digest"],
            "operation_order": atomicity["operation_order"],
            "cursor_advance_authorized": False,
        },
        "sources": source_summaries,
        "replay_plan": global_plan,
    }


def _validate_rfc_message_id(value: Any) -> str:
    if not isinstance(value, str) or not value.isascii() or len(value) < 5:
        raise MailOccurrenceShadowError("invalid_rfc_message_id", "exact_occurrence_ref.value")
    if not (value.startswith("<") and value.endswith(">")):
        raise MailOccurrenceShadowError("invalid_rfc_message_id", "exact_occurrence_ref.value")
    interior = value[1:-1]
    if interior.count("@") != 1:
        raise MailOccurrenceShadowError("invalid_rfc_message_id", "exact_occurrence_ref.value")
    local, domain = interior.split("@", 1)
    local_atoms = local.split(".")
    if not local_atoms or any(not atom or not _RFC_LOCAL_ATOM_RE.fullmatch(atom) for atom in local_atoms):
        raise MailOccurrenceShadowError("invalid_rfc_message_id", "exact_occurrence_ref.value")
    labels = domain.split(".")
    if (
        len(domain) > 253
        or not labels
        or any(not label or not _RFC_DOMAIN_LABEL_RE.fullmatch(label) for label in labels)
    ):
        raise MailOccurrenceShadowError("invalid_rfc_message_id", "exact_occurrence_ref.value")
    return value


def validate_exact_occurrence_ref(value: Mapping[str, Any]) -> Dict[str, str]:
    if not isinstance(value, Mapping):
        raise MailOccurrenceShadowError("exact_occurrence_ref_not_object", "exact_occurrence_ref")
    _exact_keys(value, ("kind", "authority_ref", "value"), "exact_occurrence_ref")
    kind = value.get("kind")
    authority_ref = value.get("authority_ref")
    exact_value = value.get("value")
    if kind == "rfc_message_id":
        if authority_ref != "rfc5322":
            raise MailOccurrenceShadowError("invalid_rfc_message_id", "exact_occurrence_ref")
        _validate_rfc_message_id(exact_value)
    elif kind == "provider_native":
        if not isinstance(authority_ref, str) or not _PROVIDER_AUTHORITY_RE.fullmatch(authority_ref):
            raise MailOccurrenceShadowError("provider_authority_required", "exact_occurrence_ref.authority_ref")
        _require_ref(exact_value, "exact_occurrence_ref.value")
        if exact_value.casefold() in {"unknown", "any", "tbd", "null", "unspecified"} or "..." in exact_value:
            raise MailOccurrenceShadowError("provider_native_value_invalid", "exact_occurrence_ref.value")
    else:
        raise MailOccurrenceShadowError("unsupported_exact_identity_kind", "exact_occurrence_ref.kind")
    return {"kind": kind, "authority_ref": authority_ref, "value": exact_value}


def _participant_relations(rows: Iterable[Mapping[str, Any]], direction: str) -> List[Dict[str, str]]:
    normalized: List[Dict[str, str]] = []
    for index, row in enumerate(rows):
        if not isinstance(row, Mapping):
            raise MailOccurrenceShadowError("participant_relation_not_object", f"participant_relations[{index}]")
        _exact_keys(row, ("party_ref", "role", "evidence"), f"participant_relations[{index}]")
        role = str(row.get("role") or "").strip()
        evidence = str(row.get("evidence") or "").strip()
        if role not in PARTICIPANT_ROLES:
            raise MailOccurrenceShadowError("participant_role_invalid", f"participant_relations[{index}].role")
        if evidence not in PARTICIPANT_EVIDENCE:
            raise MailOccurrenceShadowError(
                "participant_evidence_invalid",
                f"participant_relations[{index}].evidence",
            )
        if role == "bcc" and (direction == "received" or evidence not in {"sender_copy", "transport"}):
            raise MailOccurrenceShadowError("bcc_evidence_invalid", f"participant_relations[{index}]")
        normalized.append(
            {
                "party_ref": _require_ref(row.get("party_ref"), f"participant_relations[{index}].party_ref"),
                "role": role,
                "evidence": evidence,
            }
        )
    return sorted(normalized, key=lambda row: (row["role"], row["party_ref"], row["evidence"]))


def _thread_relations(rows: Iterable[Mapping[str, Any]]) -> List[Dict[str, str]]:
    normalized: List[Dict[str, str]] = []
    for index, row in enumerate(rows):
        if not isinstance(row, Mapping):
            raise MailOccurrenceShadowError("thread_relation_not_object", f"thread_relations[{index}]")
        _exact_keys(row, ("relation_kind", "target_ref"), f"thread_relations[{index}]")
        kind = str(row.get("relation_kind") or "").strip()
        if kind not in THREAD_RELATION_KINDS:
            raise MailOccurrenceShadowError("thread_relation_kind_invalid", f"thread_relations[{index}]")
        normalized.append(
            {
                "relation_kind": kind,
                "target_ref": _require_ref(row.get("target_ref"), f"thread_relations[{index}].target_ref"),
            }
        )
    return sorted(normalized, key=lambda row: (row["relation_kind"], row["target_ref"]))


def create_mailbox_observation(
    *,
    source_ref: str,
    account_ref: str,
    account_role: str,
    direction: str,
    folder_ref: str,
    native_observation_ref: str,
    occurred_at: str,
    observed_at: str,
    exact_occurrence_ref: Optional[Mapping[str, Any]] = None,
    participant_relations: Iterable[Mapping[str, Any]] = (),
    thread_relations: Iterable[Mapping[str, Any]] = (),
    source_custody_ref: Optional[str] = None,
    attachment_custody_refs: Iterable[str] = (),
) -> Dict[str, Any]:
    account_role = str(account_role or "").strip()
    direction = str(direction or "").strip()
    if account_role not in ACCOUNT_ROLES:
        raise MailOccurrenceShadowError("account_role_invalid", "account_role")
    if direction not in DIRECTIONS:
        raise MailOccurrenceShadowError("direction_invalid", "direction")

    source_ref = _require_ref(source_ref, "source_ref")
    account_ref = _require_ref(account_ref, "account_ref")
    folder_ref = _require_ref(folder_ref, "folder_ref")
    native_observation_ref = _require_ref(native_observation_ref, "native_observation_ref")
    custody_ref = _require_ref(source_custody_ref, "source_custody_ref") if source_custody_ref else None
    attachment_refs = sorted(
        {_require_ref(value, "attachment_custody_refs") for value in attachment_custody_refs}
    )
    exact_ref = (
        validate_exact_occurrence_ref(exact_occurrence_ref)
        if exact_occurrence_ref is not None
        else None
    )

    observation_identity = {
        "source_ref": source_ref,
        "account_ref": account_ref,
        "folder_ref": folder_ref,
        "native_observation_ref": native_observation_ref,
    }
    observation_id = f"mail_observation:{_digest(observation_identity).split(':', 1)[1]}"
    if exact_ref is None:
        occurrence_id = f"mail_occurrence_unmatched:{_digest(observation_id).split(':', 1)[1]}"
        identity_status = "unmatched"
    else:
        occurrence_id = f"mail_occurrence:{_digest(exact_ref).split(':', 1)[1]}"
        identity_status = "confirmed_exact"

    observation: Dict[str, Any] = {
        "schema_version": SHADOW_SCHEMA_VERSION,
        "mode": "feature_off_shadow",
        "occurrence_id": occurrence_id,
        "identity_status": identity_status,
        "exact_occurrence_ref": exact_ref,
        "observation_id": observation_id,
        "source_ref": source_ref,
        "account_ref": account_ref,
        "account_role": account_role,
        "direction": direction,
        "folder_ref": folder_ref,
        "native_observation_ref": native_observation_ref,
        "occurred_at": _require_utc(occurred_at, "occurred_at"),
        "observed_at": _require_utc(observed_at, "observed_at"),
        "participant_relations": _participant_relations(participant_relations, direction),
        "thread_relations": _thread_relations(thread_relations),
        "source_custody_ref": custody_ref,
        "attachment_custody_refs": attachment_refs,
        "official_task_mutation_allowed": False,
        "raw_payload_copied": False,
        "observation_digest": "",
    }
    observation["observation_digest"] = _digest(
        {key: value for key, value in observation.items() if key != "observation_digest"}
    )
    validate_mailbox_observation(observation)
    return observation


def validate_mailbox_observation(value: Mapping[str, Any]) -> Dict[str, Any]:
    expected = (
        "schema_version",
        "mode",
        "occurrence_id",
        "identity_status",
        "exact_occurrence_ref",
        "observation_id",
        "source_ref",
        "account_ref",
        "account_role",
        "direction",
        "folder_ref",
        "native_observation_ref",
        "occurred_at",
        "observed_at",
        "participant_relations",
        "thread_relations",
        "source_custody_ref",
        "attachment_custody_refs",
        "official_task_mutation_allowed",
        "raw_payload_copied",
        "observation_digest",
    )
    if not isinstance(value, Mapping):
        raise MailOccurrenceShadowError("observation_not_object")
    _exact_keys(value, expected, "observation")
    assert_public_safe_mail_metadata(value)
    if value["schema_version"] != SHADOW_SCHEMA_VERSION or value["mode"] != "feature_off_shadow":
        raise MailOccurrenceShadowError("observation_boundary_invalid")
    source_ref = _require_ref(value["source_ref"], "source_ref")
    account_ref = _require_ref(value["account_ref"], "account_ref")
    folder_ref = _require_ref(value["folder_ref"], "folder_ref")
    native_observation_ref = _require_ref(value["native_observation_ref"], "native_observation_ref")
    account_role = value["account_role"]
    direction = value["direction"]
    if account_role not in ACCOUNT_ROLES:
        raise MailOccurrenceShadowError("account_role_invalid", "account_role")
    if direction not in DIRECTIONS:
        raise MailOccurrenceShadowError("direction_invalid", "direction")
    _require_utc(value["occurred_at"], "occurred_at")
    _require_utc(value["observed_at"], "observed_at")

    exact_ref = (
        validate_exact_occurrence_ref(value["exact_occurrence_ref"])
        if value["exact_occurrence_ref"] is not None
        else None
    )
    observation_identity = {
        "source_ref": source_ref,
        "account_ref": account_ref,
        "folder_ref": folder_ref,
        "native_observation_ref": native_observation_ref,
    }
    expected_observation_id = f"mail_observation:{_digest(observation_identity).split(':', 1)[1]}"
    if value["observation_id"] != expected_observation_id:
        raise MailOccurrenceShadowError("observation_identity_mismatch", "observation_id")
    if exact_ref is None:
        expected_occurrence_id = f"mail_occurrence_unmatched:{_digest(expected_observation_id).split(':', 1)[1]}"
        expected_identity_status = "unmatched"
    else:
        expected_occurrence_id = f"mail_occurrence:{_digest(exact_ref).split(':', 1)[1]}"
        expected_identity_status = "confirmed_exact"
    if value["occurrence_id"] != expected_occurrence_id:
        raise MailOccurrenceShadowError("occurrence_identity_mismatch", "occurrence_id")
    if value["identity_status"] != expected_identity_status:
        raise MailOccurrenceShadowError("identity_status_mismatch", "identity_status")

    if not isinstance(value["participant_relations"], list):
        raise MailOccurrenceShadowError("participant_relations_not_array", "participant_relations")
    expected_participants = _participant_relations(value["participant_relations"], direction)
    if value["participant_relations"] != expected_participants:
        raise MailOccurrenceShadowError("participant_relations_not_canonical", "participant_relations")
    if not isinstance(value["thread_relations"], list):
        raise MailOccurrenceShadowError("thread_relations_not_array", "thread_relations")
    expected_threads = _thread_relations(value["thread_relations"])
    if value["thread_relations"] != expected_threads:
        raise MailOccurrenceShadowError("thread_relations_not_canonical", "thread_relations")

    if value["source_custody_ref"] is not None:
        _require_ref(value["source_custody_ref"], "source_custody_ref")
    if not isinstance(value["attachment_custody_refs"], list):
        raise MailOccurrenceShadowError("attachment_custody_refs_not_array", "attachment_custody_refs")
    expected_attachment_refs = sorted(
        {_require_ref(ref, "attachment_custody_refs") for ref in value["attachment_custody_refs"]}
    )
    if value["attachment_custody_refs"] != expected_attachment_refs:
        raise MailOccurrenceShadowError("attachment_custody_refs_not_canonical", "attachment_custody_refs")
    if value["official_task_mutation_allowed"] is not False or value["raw_payload_copied"] is not False:
        raise MailOccurrenceShadowError("observation_authority_invalid")
    _require_digest(value["observation_digest"], "observation_digest")
    expected_digest = _digest({key: child for key, child in value.items() if key != "observation_digest"})
    if value["observation_digest"] != expected_digest:
        raise MailOccurrenceShadowError("observation_digest_mismatch")
    return deepcopy(dict(value))


def _validate_safe_token(value: Any, field: str, max_length: int = 256) -> str:
    if (
        not isinstance(value, str)
        or not value
        or len(value) > max_length
        or unicodedata.normalize("NFC", value) != value
        or not any(character.isalnum() for character in value)
        or any(not (character.isalnum() or character in "._:@+-") for character in value)
    ):
        raise MailOccurrenceShadowError("unsafe_typed_ref_token", field)
    if value.casefold() in {"unknown", "any", "tbd", "null", "unspecified"}:
        raise MailOccurrenceShadowError("fuzzy_typed_ref_token", field)
    if (
        _ABSOLUTE_OR_URI_RE.match(value)
        or value in {".", ".."}
        or "..." in value
        or re.match(r"^[A-Za-z]:", value)
    ):
        raise MailOccurrenceShadowError("locator_typed_ref_token", field)
    return value


def _validate_typed_ref(
    value: Any,
    expected_entity_type: Optional[str],
    field: str,
) -> Dict[str, str]:
    if not isinstance(value, Mapping):
        raise MailOccurrenceShadowError("typed_ref_not_object", field)
    _exact_keys(value, _TYPED_REF_FIELDS, field)
    entity_type = _validate_safe_token(value["entity_type"], f"{field}.entity_type", 64)
    owner_surface = _validate_safe_token(value["owner_surface"], f"{field}.owner_surface")
    entity_id = _validate_safe_token(value["entity_id"], f"{field}.entity_id")
    if not _ENTITY_TYPE_RE.fullmatch(entity_type):
        raise MailOccurrenceShadowError("typed_ref_entity_type_invalid", f"{field}.entity_type")
    if expected_entity_type is not None and entity_type != expected_entity_type:
        raise MailOccurrenceShadowError("typed_ref_entity_type_mismatch", f"{field}.entity_type")
    if entity_type == "content" and not _DIGEST_RE.fullmatch(entity_id):
        raise MailOccurrenceShadowError("typed_ref_content_id_invalid", f"{field}.entity_id")
    return {
        "entity_type": entity_type,
        "owner_surface": owner_surface,
        "entity_id": entity_id,
    }


def _typed_ref(entity_type: str, owner_surface: str, entity_id: str) -> Dict[str, str]:
    return _validate_typed_ref(
        {
            "entity_type": entity_type,
            "owner_surface": owner_surface,
            "entity_id": entity_id,
        },
        entity_type,
        "typed_ref",
    )


def _canonical_event_digests(values: Iterable[str], field: str = "event_digests") -> List[str]:
    if isinstance(values, (str, bytes, Mapping)):
        raise MailOccurrenceShadowError("event_digests_not_array", field)
    digests = [_require_digest(value, field) for value in values]
    if len(set(digests)) != len(digests):
        raise MailOccurrenceShadowError("duplicate_event_digest", field)
    return digests


def _canonical_gap_codes(values: Iterable[str]) -> List[str]:
    if isinstance(values, (str, bytes, Mapping)):
        raise MailOccurrenceShadowError("gap_codes_not_array", "gap_codes")
    gaps = list(values)
    for value in gaps:
        if (
            not isinstance(value, str)
            or unicodedata.normalize("NFC", value) != value
            or not _GAP_CODE_RE.fullmatch(value)
        ):
            raise MailOccurrenceShadowError("gap_code_invalid", "gap_codes")
    if len(set(gaps)) != len(gaps):
        raise MailOccurrenceShadowError("duplicate_gap_code", "gap_codes")
    return sorted(gaps, key=lambda value: value.encode("utf-8"))


def _expected_coverage_count(state: str, event_digests: Sequence[str]) -> Optional[int]:
    if state in {"complete_with_events", "partial"}:
        return len(event_digests)
    if state == "complete_no_events":
        return 0
    return None


def _validate_coverage_matrix(value: Mapping[str, Any]) -> None:
    state = value["state"]
    count = value["event_count"]
    gaps = value["gap_codes"]
    applicability = value["applicability_ref"]
    if state == "complete_with_events":
        valid = isinstance(count, int) and not isinstance(count, bool) and count >= 1 and not gaps and applicability is None
    elif state == "complete_no_events":
        valid = count == 0 and not isinstance(count, bool) and not gaps and applicability is None
    elif state == "partial":
        valid = isinstance(count, int) and not isinstance(count, bool) and count >= 0 and bool(gaps) and applicability is None
    elif state in {"failed", "not_collected"}:
        valid = count is None and bool(gaps) and applicability is None
    elif state == "not_applicable":
        valid = count is None and not gaps and applicability is not None
    else:
        valid = False
    if not valid:
        raise MailOccurrenceShadowError("coverage_matrix_invalid")


def create_coverage_receipt(
    *,
    source_owner_ref: Mapping[str, Any],
    project_ref: Optional[Mapping[str, Any]],
    window_start: str,
    window_end: str,
    state: str,
    event_digests: Iterable[str] = (),
    gap_codes: Iterable[str] = (),
    applicability_ref: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    if state not in COVERAGE_STATES:
        raise MailOccurrenceShadowError("coverage_state_invalid", "state")
    digests = _canonical_event_digests(event_digests)
    gaps = _canonical_gap_codes(gap_codes)
    receipt: Dict[str, Any] = {
        "schema_version": COVERAGE_SCHEMA_VERSION,
        "lane": "mail",
        "source_owner_ref": _validate_typed_ref(source_owner_ref, "source_owner", "source_owner_ref"),
        "project_ref": (
            _validate_typed_ref(project_ref, "project", "project_ref")
            if project_ref is not None
            else None
        ),
        "window_start": _require_canonical_utc_milliseconds(window_start, "window_start"),
        "window_end": _require_canonical_utc_milliseconds(window_end, "window_end"),
        "state": state,
        "event_count": _expected_coverage_count(state, digests),
        "gap_codes": gaps,
        "applicability_ref": (
            _validate_typed_ref(applicability_ref, "rule_revision", "applicability_ref")
            if applicability_ref is not None
            else None
        ),
        "ordered_event_digest": _digest(digests),
        "metadata_digest": "",
        "raw_payload_copied": False,
    }
    receipt["metadata_digest"] = _digest(
        {key: child for key, child in receipt.items() if key != "metadata_digest"}
    )
    return validate_coverage_receipt(receipt, event_digests=digests)


def validate_coverage_receipt(
    value: Mapping[str, Any],
    *,
    event_digests: Iterable[str] = (),
) -> Dict[str, Any]:
    if not isinstance(value, Mapping):
        raise MailOccurrenceShadowError("coverage_not_object")
    _exact_keys(value, COVERAGE_FIELDS, "coverage")
    assert_public_safe_mail_metadata(value)
    if value["schema_version"] != COVERAGE_SCHEMA_VERSION or value["lane"] != "mail":
        raise MailOccurrenceShadowError("coverage_boundary_invalid")
    if value["raw_payload_copied"] is not False:
        raise MailOccurrenceShadowError("raw_payload_copied_must_be_false")
    _validate_typed_ref(value["source_owner_ref"], "source_owner", "source_owner_ref")
    if value["project_ref"] is not None:
        _validate_typed_ref(value["project_ref"], "project", "project_ref")
    start = _require_canonical_utc_milliseconds(value["window_start"], "window_start")
    end = _require_canonical_utc_milliseconds(value["window_end"], "window_end")
    if start >= end:
        raise MailOccurrenceShadowError("coverage_window_invalid")
    if value["state"] not in COVERAGE_STATES:
        raise MailOccurrenceShadowError("coverage_state_invalid", "state")
    if not isinstance(value["gap_codes"], list):
        raise MailOccurrenceShadowError("gap_codes_not_array", "gap_codes")
    if value["gap_codes"] != _canonical_gap_codes(value["gap_codes"]):
        raise MailOccurrenceShadowError("gap_codes_not_canonical", "gap_codes")
    if value["applicability_ref"] is not None:
        _validate_typed_ref(value["applicability_ref"], "rule_revision", "applicability_ref")
    _validate_coverage_matrix(value)

    digests = _canonical_event_digests(event_digests)
    expected_count = _expected_coverage_count(value["state"], digests)
    if value["event_count"] != expected_count:
        raise MailOccurrenceShadowError("coverage_event_count_mismatch")
    if (value["event_count"] is None or value["event_count"] == 0) and digests:
        raise MailOccurrenceShadowError("coverage_events_forbidden")
    _require_digest(value["ordered_event_digest"], "ordered_event_digest")
    if value["ordered_event_digest"] != _digest(digests):
        raise MailOccurrenceShadowError("coverage_ordered_event_digest_mismatch")
    _require_digest(value["metadata_digest"], "metadata_digest")
    expected_digest = _digest({key: child for key, child in value.items() if key != "metadata_digest"})
    if value["metadata_digest"] != expected_digest:
        raise MailOccurrenceShadowError("coverage_digest_mismatch")
    return deepcopy(dict(value))


def _coverage_source_owner_ref(
    account_ref: str,
    direction: str,
    expected_source_ref: Optional[str],
) -> Dict[str, str]:
    entity_id = expected_source_ref or f"mail-coverage:{account_ref}:{direction}"
    return _typed_ref("source_owner", "mail_occurrence_shadow", entity_id)


def _create_account_coverage_wrapper(
    *,
    account_ref: str,
    account_role: str,
    direction: str,
    expected_source_ref: Optional[str],
    freshness_observed_at: Optional[str],
    receipt: Mapping[str, Any],
    event_digests: Iterable[str],
) -> Dict[str, Any]:
    wrapper = {
        "schema_version": COVERAGE_WRAPPER_SCHEMA_VERSION,
        "account_ref": account_ref,
        "account_role": account_role,
        "direction": direction,
        "expected_source_ref": expected_source_ref,
        "freshness_observed_at": freshness_observed_at,
        "event_digests": list(event_digests),
        "receipt": deepcopy(dict(receipt)),
    }
    return validate_account_coverage(wrapper)


def validate_account_coverage(value: Mapping[str, Any]) -> Dict[str, Any]:
    expected = (
        "schema_version",
        "account_ref",
        "account_role",
        "direction",
        "expected_source_ref",
        "freshness_observed_at",
        "event_digests",
        "receipt",
    )
    if not isinstance(value, Mapping):
        raise MailOccurrenceShadowError("coverage_wrapper_not_object")
    _exact_keys(value, expected, "coverage_wrapper")
    assert_public_safe_mail_metadata(value)
    if value["schema_version"] != COVERAGE_WRAPPER_SCHEMA_VERSION:
        raise MailOccurrenceShadowError("coverage_wrapper_schema_invalid")
    account_ref = _require_ref(value["account_ref"], "account_ref")
    if value["account_role"] not in ACCOUNT_ROLES:
        raise MailOccurrenceShadowError("account_role_invalid", "account_role")
    if value["direction"] not in {"received", "sent"}:
        raise MailOccurrenceShadowError("coverage_direction_invalid", "direction")
    source_ref = (
        _require_ref(value["expected_source_ref"], "expected_source_ref")
        if value["expected_source_ref"] is not None
        else None
    )
    freshness = (
        _require_canonical_utc_milliseconds(value["freshness_observed_at"], "freshness_observed_at")
        if value["freshness_observed_at"] is not None
        else None
    )
    if not isinstance(value["event_digests"], list):
        raise MailOccurrenceShadowError("event_digests_not_array", "event_digests")
    digests = _canonical_event_digests(value["event_digests"])
    receipt = validate_coverage_receipt(value["receipt"], event_digests=digests)
    expected_owner = _coverage_source_owner_ref(account_ref, value["direction"], source_ref)
    if receipt["source_owner_ref"] != expected_owner or receipt["project_ref"] is not None:
        raise MailOccurrenceShadowError("coverage_wrapper_scope_mismatch")
    if receipt["state"] in {"complete_with_events", "complete_no_events", "partial"}:
        if source_ref is None:
            raise MailOccurrenceShadowError("coverage_source_required")
        if freshness is None:
            raise MailOccurrenceShadowError("coverage_freshness_required")
    if receipt["state"] == "not_applicable" and source_ref is not None:
        raise MailOccurrenceShadowError("not_applicable_source_forbidden")
    return deepcopy(dict(value))


def build_account_coverage(
    *,
    capabilities: Sequence[Mapping[str, Any]],
    collection_results: Sequence[Mapping[str, Any]],
    window_start: str,
    window_end: str,
) -> List[Dict[str, Any]]:
    result_by_key: Dict[tuple[str, str], Mapping[str, Any]] = {}
    for row in collection_results:
        key = (
            _require_ref(row.get("account_ref"), "collection_results.account_ref"),
            str(row.get("direction") or "").strip(),
        )
        if key in result_by_key:
            raise MailOccurrenceShadowError("duplicate_collection_result")
        result_by_key[key] = row

    wrappers: List[Dict[str, Any]] = []
    for capability in capabilities:
        account_ref = _require_ref(capability.get("account_ref"), "capabilities.account_ref")
        account_role = str(capability.get("account_role") or "").strip()
        if account_role not in ACCOUNT_ROLES:
            raise MailOccurrenceShadowError("account_role_invalid", "capabilities.account_role")
        for direction in ("received", "sent"):
            source_ref = capability.get(f"{direction}_source_ref")
            applicability_ref = capability.get(f"{direction}_applicability_ref")
            result = result_by_key.get((account_ref, direction))
            if source_ref is None:
                if result is not None:
                    raise MailOccurrenceShadowError("collection_without_expected_source", f"{account_ref}.{direction}")
                if applicability_ref:
                    state = "not_applicable"
                    gaps: List[str] = []
                else:
                    state = "not_collected"
                    if direction == "sent" and account_role == "team":
                        gaps = ["team_sent_source_unbound"]
                    elif direction == "sent":
                        gaps = ["owner_sent_source_unbound"]
                    else:
                        gaps = ["received_source_unbound"]
                typed_applicability = (
                    _typed_ref("rule_revision", "mail_occurrence_shadow", _require_ref(
                        applicability_ref,
                        f"capabilities.{direction}_applicability_ref",
                    ))
                    if applicability_ref
                    else None
                )
                receipt = create_coverage_receipt(
                    source_owner_ref=_coverage_source_owner_ref(account_ref, direction, None),
                    project_ref=None,
                    window_start=window_start,
                    window_end=window_end,
                    state=state,
                    gap_codes=gaps,
                    applicability_ref=typed_applicability,
                )
                wrappers.append(
                    _create_account_coverage_wrapper(
                        account_ref=account_ref,
                        account_role=account_role,
                        direction=direction,
                        expected_source_ref=None,
                        freshness_observed_at=None,
                        receipt=receipt,
                        event_digests=(),
                    )
                )
                continue

            source_ref = _require_ref(source_ref, f"capabilities.{direction}_source_ref")
            if result is None:
                receipt = create_coverage_receipt(
                    source_owner_ref=_coverage_source_owner_ref(account_ref, direction, source_ref),
                    project_ref=None,
                    window_start=window_start,
                    window_end=window_end,
                    state="not_collected",
                    gap_codes=["expected_source_not_collected"],
                )
                wrappers.append(
                    _create_account_coverage_wrapper(
                        account_ref=account_ref,
                        account_role=account_role,
                        direction=direction,
                        expected_source_ref=source_ref,
                        freshness_observed_at=None,
                        receipt=receipt,
                        event_digests=(),
                    )
                )
                continue
            if _require_ref(result.get("source_ref"), "collection_results.source_ref") != source_ref:
                raise MailOccurrenceShadowError("collection_source_mismatch", f"{account_ref}.{direction}")
            result_digests = result.get("event_digests") or ()
            result_applicability = result.get("applicability_ref")
            typed_result_applicability = (
                _typed_ref(
                    "rule_revision",
                    "mail_occurrence_shadow",
                    _require_ref(result_applicability, "collection_results.applicability_ref"),
                )
                if result_applicability
                else None
            )
            receipt = create_coverage_receipt(
                source_owner_ref=_coverage_source_owner_ref(account_ref, direction, source_ref),
                project_ref=None,
                window_start=window_start,
                window_end=window_end,
                state=result.get("state"),
                event_digests=result_digests,
                gap_codes=result.get("gap_codes") or (),
                applicability_ref=typed_result_applicability,
            )
            wrappers.append(
                _create_account_coverage_wrapper(
                    account_ref=account_ref,
                    account_role=account_role,
                    direction=direction,
                    expected_source_ref=source_ref,
                    freshness_observed_at=result.get("freshness_observed_at"),
                    receipt=receipt,
                    event_digests=result_digests,
                )
            )
    return sorted(wrappers, key=lambda row: (row["account_ref"], row["direction"]))


def _require_nullable_ref(value: Any, field: str) -> Optional[str]:
    return None if value is None else _require_ref(value, field)


def _validate_occurrence_record(
    map_key: str,
    value: Any,
    observations: Mapping[str, Mapping[str, Any]],
) -> Dict[str, Any]:
    expected = (
        "occurrence_id",
        "identity_status",
        "exact_occurrence_ref",
        "observation_ids",
        "official_task_mutation_allowed",
    )
    if not isinstance(value, Mapping):
        raise MailOccurrenceShadowError("occurrence_not_object", map_key)
    _exact_keys(value, expected, f"occurrences.{map_key}")
    occurrence_id = _require_ref(value["occurrence_id"], f"occurrences.{map_key}.occurrence_id")
    if map_key != occurrence_id:
        raise MailOccurrenceShadowError("occurrence_map_key_mismatch", map_key)
    exact_ref = (
        validate_exact_occurrence_ref(value["exact_occurrence_ref"])
        if value["exact_occurrence_ref"] is not None
        else None
    )
    if not isinstance(value["observation_ids"], list) or not value["observation_ids"]:
        raise MailOccurrenceShadowError("occurrence_observation_ids_invalid", map_key)
    observation_ids = [
        _require_ref(observation_id, f"occurrences.{map_key}.observation_ids")
        for observation_id in value["observation_ids"]
    ]
    if observation_ids != sorted(set(observation_ids)):
        raise MailOccurrenceShadowError("occurrence_observation_ids_not_canonical", map_key)
    if value["official_task_mutation_allowed"] is not False:
        raise MailOccurrenceShadowError("occurrence_authority_invalid", map_key)

    for observation_id in observation_ids:
        observation = observations.get(observation_id)
        if observation is None:
            raise MailOccurrenceShadowError("occurrence_observation_dangling", observation_id)
        if observation["occurrence_id"] != occurrence_id:
            raise MailOccurrenceShadowError("occurrence_observation_membership_mismatch", observation_id)
        if observation["exact_occurrence_ref"] != exact_ref:
            raise MailOccurrenceShadowError("occurrence_exact_ref_mismatch", observation_id)
    if exact_ref is None:
        if len(observation_ids) != 1:
            raise MailOccurrenceShadowError("unmatched_occurrence_not_observation_local", map_key)
        expected_occurrence_id = (
            f"mail_occurrence_unmatched:{_digest(observation_ids[0]).split(':', 1)[1]}"
        )
        expected_status = "unmatched"
    else:
        expected_occurrence_id = f"mail_occurrence:{_digest(exact_ref).split(':', 1)[1]}"
        expected_status = "confirmed_exact"
    if occurrence_id != expected_occurrence_id:
        raise MailOccurrenceShadowError("occurrence_record_identity_mismatch", map_key)
    if value["identity_status"] != expected_status:
        raise MailOccurrenceShadowError("occurrence_record_status_mismatch", map_key)
    return deepcopy(dict(value))


def _validate_batch_record(
    map_key: str,
    value: Any,
    observations: Mapping[str, Mapping[str, Any]],
) -> Dict[str, Any]:
    expected = (
        "batch_id",
        "source_scope_ref",
        "cursor_before",
        "cursor_after",
        "batch_digest",
        "observation_ids",
    )
    if not isinstance(value, Mapping):
        raise MailOccurrenceShadowError("batch_not_object", map_key)
    _exact_keys(value, expected, f"batches.{map_key}")
    batch_id = _require_ref(value["batch_id"], f"batches.{map_key}.batch_id")
    if batch_id != map_key:
        raise MailOccurrenceShadowError("batch_map_key_mismatch", map_key)
    source_scope_ref = _require_ref(
        value["source_scope_ref"],
        f"batches.{map_key}.source_scope_ref",
    )
    cursor_before = _require_nullable_ref(value["cursor_before"], f"batches.{map_key}.cursor_before")
    cursor_after = _require_nullable_ref(value["cursor_after"], f"batches.{map_key}.cursor_after")
    if not isinstance(value["observation_ids"], list):
        raise MailOccurrenceShadowError("batch_observation_ids_not_array", map_key)
    observation_ids = [
        _require_ref(observation_id, f"batches.{map_key}.observation_ids")
        for observation_id in value["observation_ids"]
    ]
    if observation_ids != sorted(set(observation_ids)):
        raise MailOccurrenceShadowError("batch_observation_ids_not_canonical", map_key)
    for observation_id in observation_ids:
        if observation_id not in observations:
            raise MailOccurrenceShadowError("batch_observation_dangling", observation_id)
    _require_digest(value["batch_digest"], f"batches.{map_key}.batch_digest")
    expected_digest = _digest(
        {
            "batch_id": batch_id,
            "source_scope_ref": source_scope_ref,
            "cursor_before": cursor_before,
            "cursor_after": cursor_after,
            "observation_digests": [
                observations[observation_id]["observation_digest"]
                for observation_id in observation_ids
            ],
        }
    )
    if value["batch_digest"] != expected_digest:
        raise MailOccurrenceShadowError("batch_digest_mismatch", map_key)
    return deepcopy(dict(value))


def _validate_cursor_graph(
    cursors: Mapping[str, Optional[str]],
    batches: Mapping[str, Mapping[str, Any]],
) -> None:
    batches_by_scope: Dict[str, List[Mapping[str, Any]]] = {}
    for batch in batches.values():
        batches_by_scope.setdefault(batch["source_scope_ref"], []).append(batch)
    if set(cursors) != set(batches_by_scope):
        raise MailOccurrenceShadowError("cursor_scope_graph_mismatch")

    for scope, scoped_batches in batches_by_scope.items():
        starts = [batch for batch in scoped_batches if batch["cursor_before"] is None]
        if len(starts) != 1:
            raise MailOccurrenceShadowError("cursor_chain_start_invalid", scope)
        by_before: Dict[str, Mapping[str, Any]] = {}
        for batch in scoped_batches:
            before = batch["cursor_before"]
            if before is None:
                continue
            if before in by_before:
                raise MailOccurrenceShadowError("cursor_chain_branch", scope)
            by_before[before] = batch

        visited: set[str] = set()
        current = starts[0]
        while True:
            batch_id = current["batch_id"]
            if batch_id in visited:
                raise MailOccurrenceShadowError("cursor_chain_cycle", scope)
            visited.add(batch_id)
            after = current["cursor_after"]
            if after is None or after not in by_before:
                terminal_cursor = after
                break
            current = by_before[after]
        if len(visited) != len(scoped_batches):
            raise MailOccurrenceShadowError("cursor_chain_disconnected", scope)
        if cursors[scope] != terminal_cursor:
            raise MailOccurrenceShadowError("cursor_current_mismatch", scope)


def validate_shadow_state(value: Mapping[str, Any]) -> Dict[str, Any]:
    expected = (
        "schema_version",
        "mode",
        "accepted_history",
        "official_task_mutation_allowed",
        "cursors",
        "observations",
        "occurrences",
        "batches",
        "raw_payload_copied",
    )
    if not isinstance(value, Mapping):
        raise MailOccurrenceShadowError("shadow_state_shape_invalid")
    _exact_keys(value, expected, "shadow_state")
    assert_public_safe_mail_metadata(value)
    if (
        value["schema_version"] != SHADOW_STATE_SCHEMA_VERSION
        or value["mode"] != "feature_off_shadow"
        or value["accepted_history"] is not False
        or value["official_task_mutation_allowed"] is not False
        or value["raw_payload_copied"] is not False
    ):
        raise MailOccurrenceShadowError("shadow_state_boundary_invalid")
    for field in ("cursors", "observations", "occurrences", "batches"):
        if not isinstance(value[field], Mapping):
            raise MailOccurrenceShadowError("shadow_state_map_invalid", field)

    cursors: Dict[str, Optional[str]] = {}
    for scope, cursor in value["cursors"].items():
        valid_scope = _require_ref(scope, "cursors.scope")
        cursors[valid_scope] = _require_nullable_ref(cursor, f"cursors.{scope}")

    observations: Dict[str, Dict[str, Any]] = {}
    for map_key, observation in value["observations"].items():
        valid_key = _require_ref(map_key, "observations.key")
        validated = validate_mailbox_observation(observation)
        if validated["observation_id"] != valid_key:
            raise MailOccurrenceShadowError("observation_map_key_mismatch", valid_key)
        observations[valid_key] = validated

    occurrences: Dict[str, Dict[str, Any]] = {}
    for map_key, occurrence in value["occurrences"].items():
        valid_key = _require_ref(map_key, "occurrences.key")
        occurrences[valid_key] = _validate_occurrence_record(valid_key, occurrence, observations)

    expected_occurrence_members: Dict[str, List[str]] = {}
    for observation_id, observation in observations.items():
        expected_occurrence_members.setdefault(observation["occurrence_id"], []).append(observation_id)
    if set(expected_occurrence_members) != set(occurrences):
        raise MailOccurrenceShadowError("occurrence_membership_graph_mismatch")
    for occurrence_id, observation_ids in expected_occurrence_members.items():
        if sorted(observation_ids) != occurrences[occurrence_id]["observation_ids"]:
            raise MailOccurrenceShadowError("occurrence_membership_graph_mismatch", occurrence_id)

    batches: Dict[str, Dict[str, Any]] = {}
    batched_observation_ids: set[str] = set()
    for map_key, batch in value["batches"].items():
        valid_key = _require_ref(map_key, "batches.key")
        validated_batch = _validate_batch_record(valid_key, batch, observations)
        batches[valid_key] = validated_batch
        batched_observation_ids.update(validated_batch["observation_ids"])
    if batched_observation_ids != set(observations):
        raise MailOccurrenceShadowError("batch_observation_graph_mismatch")
    _validate_cursor_graph(cursors, batches)
    return deepcopy(dict(value))


class MailOccurrenceShadowStore:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self.state = self._default_state()
        self._load()

    @staticmethod
    def _default_state() -> Dict[str, Any]:
        return {
            "schema_version": SHADOW_STATE_SCHEMA_VERSION,
            "mode": "feature_off_shadow",
            "accepted_history": False,
            "official_task_mutation_allowed": False,
            "cursors": {},
            "observations": {},
            "occurrences": {},
            "batches": {},
            "raw_payload_copied": False,
        }

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise MailOccurrenceShadowError("shadow_state_corrupt") from exc
        self.state = validate_shadow_state(value)

    def snapshot(self) -> Dict[str, Any]:
        return deepcopy(self.state)

    def apply_batch(
        self,
        *,
        batch_id: str,
        source_scope_ref: str,
        cursor_before: Optional[str],
        cursor_after: Optional[str],
        observations: Sequence[Mapping[str, Any]],
    ) -> Dict[str, Any]:
        batch_id = _require_ref(batch_id, "batch_id")
        source_scope_ref = _require_ref(source_scope_ref, "source_scope_ref")
        cursor_before = _require_ref(cursor_before, "cursor_before") if cursor_before else None
        cursor_after = _require_ref(cursor_after, "cursor_after") if cursor_after else None
        validated = [validate_mailbox_observation(row) for row in observations]
        ordered = sorted(validated, key=lambda row: row["observation_id"])
        if len({row["observation_id"] for row in ordered}) != len(ordered):
            raise MailOccurrenceShadowError("duplicate_batch_observation")
        batch_digest = _digest(
            {
                "batch_id": batch_id,
                "source_scope_ref": source_scope_ref,
                "cursor_before": cursor_before,
                "cursor_after": cursor_after,
                "observation_digests": [row["observation_digest"] for row in ordered],
            }
        )

        prior_batch = self.state["batches"].get(batch_id)
        if prior_batch is not None:
            if prior_batch["batch_digest"] != batch_digest:
                raise MailOccurrenceShadowError("batch_replay_conflict", batch_id)
            return {
                "batch_id": batch_id,
                "batch_digest": batch_digest,
                "added_observations": 0,
                "duplicate_observations": len(ordered),
                "occurrence_count": len(self.state["occurrences"]),
                "cursor_after": prior_batch["cursor_after"],
                "replayed": True,
            }

        current_cursor = self.state["cursors"].get(source_scope_ref)
        if current_cursor != cursor_before:
            raise MailOccurrenceShadowError("cursor_precondition_failed", source_scope_ref)

        next_state = deepcopy(self.state)
        added = 0
        duplicates = 0
        for observation in ordered:
            observation_id = observation["observation_id"]
            prior_observation = next_state["observations"].get(observation_id)
            if prior_observation is not None:
                if prior_observation["observation_digest"] != observation["observation_digest"]:
                    raise MailOccurrenceShadowError("observation_conflict", observation_id)
                duplicates += 1
                continue

            next_state["observations"][observation_id] = observation
            occurrence_id = observation["occurrence_id"]
            occurrence = next_state["occurrences"].setdefault(
                occurrence_id,
                {
                    "occurrence_id": occurrence_id,
                    "identity_status": observation["identity_status"],
                    "exact_occurrence_ref": observation["exact_occurrence_ref"],
                    "observation_ids": [],
                    "official_task_mutation_allowed": False,
                },
            )
            if occurrence["exact_occurrence_ref"] != observation["exact_occurrence_ref"]:
                raise MailOccurrenceShadowError("occurrence_identity_conflict", occurrence_id)
            occurrence["observation_ids"].append(observation_id)
            occurrence["observation_ids"].sort()
            added += 1

        next_state["cursors"][source_scope_ref] = cursor_after
        next_state["batches"][batch_id] = {
            "batch_id": batch_id,
            "source_scope_ref": source_scope_ref,
            "cursor_before": cursor_before,
            "cursor_after": cursor_after,
            "batch_digest": batch_digest,
            "observation_ids": [row["observation_id"] for row in ordered],
        }
        validate_shadow_state(next_state)
        self._save(next_state)
        self.state = next_state
        return {
            "batch_id": batch_id,
            "batch_digest": batch_digest,
            "added_observations": added,
            "duplicate_observations": duplicates,
            "occurrence_count": len(next_state["occurrences"]),
            "cursor_after": cursor_after,
            "replayed": False,
        }

    def _save(self, value: Mapping[str, Any]) -> None:
        validate_shadow_state(value)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self.path.with_suffix(self.path.suffix + ".tmp")
        payload = f"{json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)}\n"
        with temp_path.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, self.path)
