from __future__ import annotations

from copy import deepcopy
import hashlib
import json
from pathlib import Path

import pytest

from collector.pipeline.mail_occurrence_shadow import (
    COVERAGE_STATES,
    MailOccurrenceShadowError,
    MailOccurrenceShadowStore,
    assert_public_safe_mail_metadata,
    build_account_coverage,
    create_coverage_receipt,
    create_mailbox_observation,
    validate_account_coverage,
    validate_coverage_receipt,
    validate_mailbox_observation,
)


WINDOW_START = "2026-07-22T00:00:00.000Z"
WINDOW_END = "2026-07-23T00:00:00.000Z"
FRESHNESS = "2026-07-23T00:01:00.000Z"
DIGEST_A = f"sha256:{'a' * 64}"
DIGEST_B = f"sha256:{'b' * 64}"


def _rfc(value: str = "mail-001@example.test") -> dict[str, str]:
    return {
        "kind": "rfc_message_id",
        "authority_ref": "rfc5322",
        "value": f"<{value}>",
    }


def _typed(entity_type: str, entity_id: str) -> dict[str, str]:
    return {
        "entity_type": entity_type,
        "owner_surface": "mail_occurrence_shadow",
        "entity_id": entity_id,
    }


def _rehash(value: dict, digest_field: str) -> None:
    projection = {key: child for key, child in value.items() if key != digest_field}
    canonical = json.dumps(projection, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    value[digest_field] = f"sha256:{hashlib.sha256(canonical.encode('utf-8')).hexdigest()}"


def _rehash_batch(state: dict, batch_id: str) -> None:
    batch = state["batches"][batch_id]
    projection = {
        "batch_id": batch["batch_id"],
        "source_scope_ref": batch["source_scope_ref"],
        "cursor_before": batch["cursor_before"],
        "cursor_after": batch["cursor_after"],
        "observation_digests": [
            state["observations"][observation_id]["observation_digest"]
            for observation_id in batch["observation_ids"]
        ],
    }
    canonical = json.dumps(projection, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    batch["batch_digest"] = f"sha256:{hashlib.sha256(canonical.encode('utf-8')).hexdigest()}"


def _observation(
    native_ref: str,
    *,
    source_ref: str = "provider:hiworks",
    account_ref: str = "account:member-a",
    account_role: str = "team",
    direction: str = "received",
    folder_ref: str = "folder:inbox",
    exact_ref: dict[str, str] | None = None,
    participant_relations: tuple[dict[str, str], ...] = (),
    thread_relations: tuple[dict[str, str], ...] = (),
) -> dict:
    return create_mailbox_observation(
        source_ref=source_ref,
        account_ref=account_ref,
        account_role=account_role,
        direction=direction,
        folder_ref=folder_ref,
        native_observation_ref=native_ref,
        occurred_at="2026-07-22T03:00:00Z",
        observed_at="2026-07-22T03:01:00Z",
        exact_occurrence_ref=exact_ref,
        participant_relations=participant_relations,
        thread_relations=thread_relations,
        source_custody_ref=f"custody:{native_ref}",
        attachment_custody_refs=(f"custody:attachment:{native_ref}",),
    )


def test_one_exact_occurrence_keeps_many_mailbox_observations_and_roles(tmp_path: Path) -> None:
    exact_ref = _rfc()
    owner_sent = _observation(
        "owner-sent-001",
        source_ref="provider:outlook",
        account_ref="account:owner",
        account_role="owner",
        direction="sent",
        folder_ref="folder:sent",
        exact_ref=exact_ref,
        participant_relations=(
            {"party_ref": "account:owner", "role": "sender", "evidence": "sender_copy"},
            {"party_ref": "account:member-c", "role": "bcc", "evidence": "sender_copy"},
        ),
    )
    member_to = _observation(
        "member-a-inbox-001",
        exact_ref=exact_ref,
        participant_relations=(
            {"party_ref": "account:member-a", "role": "to", "evidence": "recipient_copy"},
        ),
    )
    member_cc = _observation(
        "member-b-inbox-001",
        account_ref="account:member-b",
        exact_ref=exact_ref,
        participant_relations=(
            {"party_ref": "account:member-b", "role": "cc", "evidence": "recipient_copy"},
        ),
    )

    store = MailOccurrenceShadowStore(tmp_path / "shadow.json")
    result = store.apply_batch(
        batch_id="batch:one-message",
        source_scope_ref="source-scope:synthetic",
        cursor_before=None,
        cursor_after="cursor:001",
        observations=[member_cc, owner_sent, member_to],
    )

    assert result["added_observations"] == 3
    assert result["occurrence_count"] == 1
    occurrence = next(iter(store.snapshot()["occurrences"].values()))
    assert occurrence["identity_status"] == "confirmed_exact"
    assert len(occurrence["observation_ids"]) == 3
    relations = [
        relation
        for observation in store.snapshot()["observations"].values()
        for relation in observation["participant_relations"]
    ]
    assert {relation["role"] for relation in relations} == {"sender", "to", "cc", "bcc"}
    assert all("assignee" not in relation for relation in relations)


def test_only_exact_refs_merge_and_missing_refs_stay_observation_local(tmp_path: Path) -> None:
    first_unmatched = _observation("uidl-001")
    second_unmatched = _observation(
        "entry-001",
        source_ref="provider:outlook",
        account_ref="account:owner",
        account_role="owner",
    )
    exact_one = _observation("uidl-002", exact_ref=_rfc("mail-002@example.test"))
    exact_two = _observation("uidl-003", exact_ref=_rfc("mail-003@example.test"))
    store = MailOccurrenceShadowStore(tmp_path / "shadow.json")
    store.apply_batch(
        batch_id="batch:identity-ceiling",
        source_scope_ref="source-scope:synthetic",
        cursor_before=None,
        cursor_after="cursor:001",
        observations=[first_unmatched, second_unmatched, exact_one, exact_two],
    )

    assert first_unmatched["occurrence_id"] != second_unmatched["occurrence_id"]
    assert exact_one["occurrence_id"] != exact_two["occurrence_id"]
    assert len(store.snapshot()["occurrences"]) == 4
    unsupported = dict(first_unmatched)
    unsupported["subject"] = "not-part-of-the-shadow-contract"
    with pytest.raises(MailOccurrenceShadowError, match="unexpected_fields"):
        validate_mailbox_observation(unsupported)


@pytest.mark.parametrize(
    ("field", "forged_value", "error"),
    (
        ("account_role", "administrator", "account_role_invalid"),
        ("direction", "incoming", "direction_invalid"),
        ("observation_id", "mail_observation:forged", "observation_identity_mismatch"),
        ("occurrence_id", "mail_occurrence:forged", "occurrence_identity_mismatch"),
        ("identity_status", "unmatched", "identity_status_mismatch"),
        ("source_ref", "provider:other", "observation_identity_mismatch"),
    ),
)
def test_rehashed_semantic_observation_forgery_is_rejected(
    field: str,
    forged_value: str,
    error: str,
) -> None:
    forged = _observation("semantic-forgery", exact_ref=_rfc())
    forged[field] = forged_value
    _rehash(forged, "observation_digest")
    with pytest.raises(MailOccurrenceShadowError, match=error):
        validate_mailbox_observation(forged)


def test_rehashed_noncanonical_relations_custody_and_bcc_are_rejected() -> None:
    observation = _observation(
        "semantic-arrays",
        exact_ref=_rfc(),
        participant_relations=(
            {"party_ref": "account:z", "role": "to", "evidence": "recipient_copy"},
            {"party_ref": "account:a", "role": "sender", "evidence": "source_native"},
        ),
        thread_relations=(
            {"relation_kind": "references", "target_ref": "mail_occurrence:z"},
            {"relation_kind": "in_reply_to", "target_ref": "mail_occurrence:a"},
        ),
    )
    for mutate, error in (
        (
            lambda row: row["participant_relations"].reverse(),
            "participant_relations_not_canonical",
        ),
        (
            lambda row: row["thread_relations"].reverse(),
            "thread_relations_not_canonical",
        ),
        (
            lambda row: row["attachment_custody_refs"].append(row["attachment_custody_refs"][0]),
            "attachment_custody_refs_not_canonical",
        ),
    ):
        forged = deepcopy(observation)
        mutate(forged)
        _rehash(forged, "observation_digest")
        with pytest.raises(MailOccurrenceShadowError, match=error):
            validate_mailbox_observation(forged)

    forged_bcc = deepcopy(observation)
    forged_bcc["participant_relations"] = [
        {"party_ref": "account:hidden", "role": "bcc", "evidence": "recipient_copy"}
    ]
    _rehash(forged_bcc, "observation_digest")
    with pytest.raises(MailOccurrenceShadowError, match="bcc_evidence_invalid"):
        validate_mailbox_observation(forged_bcc)


def test_reply_and_provider_thread_are_relations_not_identity(tmp_path: Path) -> None:
    parent = _observation("uidl-parent", exact_ref=_rfc("parent@example.test"))
    reply = _observation(
        "uidl-reply",
        exact_ref=_rfc("reply@example.test"),
        thread_relations=(
            {"relation_kind": "in_reply_to", "target_ref": parent["occurrence_id"]},
            {"relation_kind": "provider_thread", "target_ref": "thread:opaque-001"},
        ),
    )
    store = MailOccurrenceShadowStore(tmp_path / "shadow.json")
    store.apply_batch(
        batch_id="batch:thread",
        source_scope_ref="source-scope:synthetic",
        cursor_before=None,
        cursor_after="cursor:001",
        observations=[parent, reply],
    )

    assert parent["occurrence_id"] != reply["occurrence_id"]
    assert len(store.snapshot()["occurrences"]) == 2
    assert reply["official_task_mutation_allowed"] is False


def test_bcc_requires_sender_or_transport_evidence_and_is_never_inferred() -> None:
    with pytest.raises(MailOccurrenceShadowError, match="bcc_evidence_invalid"):
        _observation(
            "received-bcc",
            exact_ref=_rfc(),
            participant_relations=(
                {"party_ref": "account:member-c", "role": "bcc", "evidence": "recipient_copy"},
            ),
        )

    sent = _observation(
        "sent-bcc",
        source_ref="provider:outlook",
        account_ref="account:owner",
        account_role="owner",
        direction="sent",
        folder_ref="folder:sent",
        exact_ref=_rfc(),
        participant_relations=(
            {"party_ref": "account:member-c", "role": "bcc", "evidence": "sender_copy"},
        ),
    )
    assert sent["participant_relations"][0]["role"] == "bcc"
    assert sent["official_task_mutation_allowed"] is False


@pytest.mark.parametrize(
    "message_id",
    (
        "<a,b@example.test>",
        "<a b@example.test>",
        "<@example.test>",
        "<a@>",
        "<a@@example.test>",
        "<a@example..test>",
        "<a@-example.test>",
        "<a@example-.test>",
        "<유니코드@example.test>",
        "a@example.test",
    ),
)
def test_rfc_message_id_requires_strict_ascii_dot_atom_and_domain(message_id: str) -> None:
    with pytest.raises(MailOccurrenceShadowError, match="invalid_rfc_message_id"):
        create_mailbox_observation(
            source_ref="provider:synthetic",
            account_ref="account:member-a",
            account_role="team",
            direction="received",
            folder_ref="folder:inbox",
            native_observation_ref="native:invalid-message-id",
            occurred_at="2026-07-22T03:00:00Z",
            observed_at="2026-07-22T03:01:00Z",
            exact_occurrence_ref={
                "kind": "rfc_message_id",
                "authority_ref": "rfc5322",
                "value": message_id,
            },
        )


@pytest.mark.parametrize(
    ("authority_ref", "native_value"),
    (
        ("provider:", "native-001"),
        ("provider:Upper", "native-001"),
        ("provider:bad/name", "native-001"),
        ("provider", "native-001"),
        ("provider:synthetic", ""),
        ("provider:synthetic", "unknown"),
        ("provider:synthetic", "native/value"),
    ),
)
def test_provider_native_identity_requires_safe_namespace_and_value(
    authority_ref: str,
    native_value: str,
) -> None:
    with pytest.raises(MailOccurrenceShadowError):
        create_mailbox_observation(
            source_ref="provider:synthetic",
            account_ref="account:member-a",
            account_role="team",
            direction="received",
            folder_ref="folder:inbox",
            native_observation_ref="native:provider-id-test",
            occurred_at="2026-07-22T03:00:00Z",
            observed_at="2026-07-22T03:01:00Z",
            exact_occurrence_ref={
                "kind": "provider_native",
                "authority_ref": authority_ref,
                "value": native_value,
            },
        )

    valid = create_mailbox_observation(
        source_ref="provider:synthetic",
        account_ref="account:member-a",
        account_role="team",
        direction="received",
        folder_ref="folder:inbox",
        native_observation_ref="native:valid-provider-id",
        occurred_at="2026-07-22T03:00:00Z",
        observed_at="2026-07-22T03:01:00Z",
        exact_occurrence_ref={
            "kind": "provider_native",
            "authority_ref": "provider:synthetic",
            "value": "native-001",
        },
    )
    assert valid["identity_status"] == "confirmed_exact"


def test_coverage_contract_accepts_all_six_states_and_rejects_bad_matrix() -> None:
    owner_source = _typed("source_owner", "source:owner-inbox")
    rule_revision = _typed("rule_revision", "rule-revision:retired-account-v1")
    receipts = [
        create_coverage_receipt(
            source_owner_ref=owner_source,
            project_ref=None,
            window_start=WINDOW_START,
            window_end=WINDOW_END,
            state="complete_with_events",
            event_digests=(DIGEST_A,),
        ),
        create_coverage_receipt(
            source_owner_ref=_typed("source_owner", "source:owner-sent"),
            project_ref=None,
            window_start=WINDOW_START,
            window_end=WINDOW_END,
            state="complete_no_events",
        ),
        create_coverage_receipt(
            source_owner_ref=_typed("source_owner", "source:member-a-inbox"),
            project_ref=None,
            window_start=WINDOW_START,
            window_end=WINDOW_END,
            state="partial",
            event_digests=(DIGEST_A, DIGEST_B),
            gap_codes=("scan-window-truncated",),
        ),
        create_coverage_receipt(
            source_owner_ref=_typed("source_owner", "source:member-b-inbox"),
            project_ref=None,
            window_start=WINDOW_START,
            window_end=WINDOW_END,
            state="failed",
            gap_codes=("source-fetch-failed",),
        ),
        create_coverage_receipt(
            source_owner_ref=_typed("source_owner", "mail-coverage:account:member-a:sent"),
            project_ref=None,
            window_start=WINDOW_START,
            window_end=WINDOW_END,
            state="not_collected",
            gap_codes=("team_sent_source_unbound",),
        ),
        create_coverage_receipt(
            source_owner_ref=_typed("source_owner", "mail-coverage:account:retired:received"),
            project_ref=None,
            window_start=WINDOW_START,
            window_end=WINDOW_END,
            state="not_applicable",
            applicability_ref=rule_revision,
        ),
    ]
    assert {receipt["state"] for receipt in receipts} == set(COVERAGE_STATES)
    assert set(receipts[0]) == {
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
    }
    validate_coverage_receipt(receipts[0], event_digests=(DIGEST_A,))

    with pytest.raises(MailOccurrenceShadowError, match="coverage_events_forbidden"):
        create_coverage_receipt(
            source_owner_ref=owner_source,
            project_ref=None,
            window_start=WINDOW_START,
            window_end=WINDOW_END,
            state="complete_no_events",
            event_digests=(DIGEST_A,),
        )
    divergent = dict(receipts[1])
    divergent["account_ref"] = "account:owner"
    with pytest.raises(MailOccurrenceShadowError, match="unexpected_fields"):
        validate_coverage_receipt(divergent)
    with pytest.raises(MailOccurrenceShadowError, match="invalid_canonical_utc_timestamp"):
        create_coverage_receipt(
            source_owner_ref=owner_source,
            project_ref=None,
            window_start="2026-07-22T00:00:00Z",
            window_end=WINDOW_END,
            state="complete_no_events",
        )


def test_team_sent_gap_is_not_inferred_from_pop3_received_or_cc() -> None:
    capabilities = [
        {
            "account_ref": "account:owner",
            "account_role": "owner",
            "received_source_ref": "source:owner-inbox",
            "sent_source_ref": "source:owner-sent",
        },
        {
            "account_ref": "account:member-a",
            "account_role": "team",
            "received_source_ref": "source:member-a-pop3",
            "sent_source_ref": None,
        },
    ]
    collection_results = [
        {
            "account_ref": "account:member-a",
            "direction": "received",
            "source_ref": "source:member-a-pop3",
            "state": "complete_with_events",
            "event_digests": [DIGEST_A],
            "freshness_observed_at": FRESHNESS,
        }
    ]
    receipts = build_account_coverage(
        capabilities=capabilities,
        collection_results=collection_results,
        window_start=WINDOW_START,
        window_end=WINDOW_END,
    )
    member_received = next(
        row for row in receipts if row["account_ref"] == "account:member-a" and row["direction"] == "received"
    )
    member_sent = next(
        row for row in receipts if row["account_ref"] == "account:member-a" and row["direction"] == "sent"
    )
    validate_account_coverage(member_received)
    validate_account_coverage(member_sent)
    assert member_received["receipt"]["state"] == "complete_with_events"
    assert member_sent["receipt"]["state"] == "not_collected"
    assert member_sent["receipt"]["event_count"] is None
    assert member_sent["receipt"]["gap_codes"] == ["team_sent_source_unbound"]
    assert member_sent["expected_source_ref"] is None
    assert member_received["direction"] == "received"


def test_restart_replay_overlap_dedupe_cursor_and_conflicts_are_fail_closed(tmp_path: Path) -> None:
    path = tmp_path / "shadow.json"
    first = _observation("uidl-001", exact_ref=_rfc())
    second = _observation("uidl-002", exact_ref=_rfc("mail-002@example.test"))
    store = MailOccurrenceShadowStore(path)
    initial = store.apply_batch(
        batch_id="batch:001",
        source_scope_ref="source-scope:member-a",
        cursor_before=None,
        cursor_after="cursor:001",
        observations=[first],
    )
    assert initial["added_observations"] == 1

    restarted = MailOccurrenceShadowStore(path)
    replay = restarted.apply_batch(
        batch_id="batch:001",
        source_scope_ref="source-scope:member-a",
        cursor_before=None,
        cursor_after="cursor:001",
        observations=[first],
    )
    assert replay["replayed"] is True
    overlap = restarted.apply_batch(
        batch_id="batch:002",
        source_scope_ref="source-scope:member-a",
        cursor_before="cursor:001",
        cursor_after="cursor:002",
        observations=[second, first],
    )
    assert overlap["added_observations"] == 1
    assert overlap["duplicate_observations"] == 1

    with pytest.raises(MailOccurrenceShadowError, match="cursor_precondition_failed"):
        restarted.apply_batch(
            batch_id="batch:003",
            source_scope_ref="source-scope:member-a",
            cursor_before="cursor:stale",
            cursor_after="cursor:003",
            observations=[],
        )

    conflicting = create_mailbox_observation(
        source_ref=first["source_ref"],
        account_ref=first["account_ref"],
        account_role=first["account_role"],
        direction=first["direction"],
        folder_ref=first["folder_ref"],
        native_observation_ref=first["native_observation_ref"],
        occurred_at="2026-07-22T03:00:01Z",
        observed_at=first["observed_at"],
        exact_occurrence_ref=first["exact_occurrence_ref"],
        source_custody_ref=first["source_custody_ref"],
        attachment_custody_refs=first["attachment_custody_refs"],
    )
    with pytest.raises(MailOccurrenceShadowError, match="observation_conflict"):
        restarted.apply_batch(
            batch_id="batch:004",
            source_scope_ref="source-scope:member-a",
            cursor_before="cursor:002",
            cursor_after="cursor:004",
            observations=[conflicting],
        )
    assert MailOccurrenceShadowStore(path).snapshot()["cursors"]["source-scope:member-a"] == "cursor:002"

    corrupt = tmp_path / "corrupt.json"
    corrupt.write_text("{not-json", encoding="utf-8")
    with pytest.raises(MailOccurrenceShadowError, match="shadow_state_corrupt"):
        MailOccurrenceShadowStore(corrupt)


def test_reload_revalidates_rehashed_observation_semantics(tmp_path: Path) -> None:
    path = tmp_path / "rehashed-observation.json"
    observation = _observation("reload-forgery", exact_ref=_rfc())
    store = MailOccurrenceShadowStore(path)
    store.apply_batch(
        batch_id="batch:reload-forgery",
        source_scope_ref="source-scope:member-a",
        cursor_before=None,
        cursor_after="cursor:001",
        observations=[observation],
    )
    forged_state = store.snapshot()
    forged = forged_state["observations"][observation["observation_id"]]
    forged["direction"] = "incoming"
    _rehash(forged, "observation_digest")
    path.write_text(json.dumps(forged_state), encoding="utf-8")
    with pytest.raises(MailOccurrenceShadowError, match="direction_invalid"):
        MailOccurrenceShadowStore(path)


def test_reload_rejects_inconsistent_state_graph_and_cursor_chain(tmp_path: Path) -> None:
    path = tmp_path / "graph.json"
    first = _observation("graph-001", exact_ref=_rfc("graph-001@example.test"))
    second = _observation("graph-002", exact_ref=_rfc("graph-002@example.test"))
    store = MailOccurrenceShadowStore(path)
    store.apply_batch(
        batch_id="batch:graph-001",
        source_scope_ref="source-scope:member-a",
        cursor_before=None,
        cursor_after="cursor:001",
        observations=[first],
    )
    store.apply_batch(
        batch_id="batch:graph-002",
        source_scope_ref="source-scope:member-a",
        cursor_before="cursor:001",
        cursor_after="cursor:002",
        observations=[first, second],
    )
    valid_state = store.snapshot()
    assert MailOccurrenceShadowStore(path).snapshot() == valid_state

    mutants: list[tuple[str, dict, str]] = []

    wrong_observation_key = deepcopy(valid_state)
    wrong_observation_key["observations"]["mail_observation:forged"] = wrong_observation_key[
        "observations"
    ].pop(first["observation_id"])
    mutants.append(("observation-key", wrong_observation_key, "observation_map_key_mismatch"))

    missing_occurrence_member = deepcopy(valid_state)
    missing_occurrence_member["occurrences"][first["occurrence_id"]]["observation_ids"] = []
    mutants.append(
        ("occurrence-member", missing_occurrence_member, "occurrence_observation_ids_invalid")
    )

    forged_occurrence_authority = deepcopy(valid_state)
    forged_occurrence_authority["occurrences"][first["occurrence_id"]][
        "official_task_mutation_allowed"
    ] = True
    mutants.append(("occurrence-authority", forged_occurrence_authority, "occurrence_authority_invalid"))

    dangling_batch_observation = deepcopy(valid_state)
    dangling_batch_observation["batches"]["batch:graph-002"]["observation_ids"].append(
        "mail_observation:dangling"
    )
    dangling_batch_observation["batches"]["batch:graph-002"]["observation_ids"].sort()
    mutants.append(("batch-dangling", dangling_batch_observation, "batch_observation_dangling"))

    forged_batch_digest = deepcopy(valid_state)
    forged_batch_digest["batches"]["batch:graph-002"]["batch_digest"] = f"sha256:{'0' * 64}"
    mutants.append(("batch-digest", forged_batch_digest, "batch_digest_mismatch"))

    wrong_current_cursor = deepcopy(valid_state)
    wrong_current_cursor["cursors"]["source-scope:member-a"] = "cursor:stale"
    mutants.append(("current-cursor", wrong_current_cursor, "cursor_current_mismatch"))

    disconnected_chain = deepcopy(valid_state)
    disconnected_chain["batches"]["batch:graph-002"]["cursor_before"] = "cursor:stale"
    _rehash_batch(disconnected_chain, "batch:graph-002")
    mutants.append(("cursor-chain", disconnected_chain, "cursor_chain_disconnected"))

    for name, mutant, error in mutants:
        mutant_path = tmp_path / f"{name}.json"
        mutant_path.write_text(json.dumps(mutant), encoding="utf-8")
        with pytest.raises(MailOccurrenceShadowError, match=error):
            MailOccurrenceShadowStore(mutant_path)


def test_raw_secret_attachment_and_locator_sentinels() -> None:
    safe = _observation("uidl-safe", exact_ref=_rfc())
    serialized = json.dumps(safe, sort_keys=True)
    assert "example.test" in serialized
    assert "official_task_mutation_allowed" in serialized
    assert "raw_payload_copied" in serialized
    for forbidden in ("body_text", "body_html", "attachment_name", "attachment_path", "attachment_url"):
        assert forbidden not in serialized

    windows_locator = f"C:{chr(92)}runtime{chr(92)}mail"
    unc_locator = f"{chr(92) * 2}host{chr(92)}share"
    web_locator = "https:" + "//example.test/mail"
    for payload in (
        {"raw": "forbidden"},
        {"body_text": "forbidden"},
        {"bodyHtml": "forbidden"},
        {"Raw-Headers": "forbidden"},
        {"secret_value": "forbidden"},
        {"authToken": "forbidden"},
        {"api_key": "forbidden"},
        {"Authorization": "forbidden"},
        {"attachment_name": "forbidden"},
        {"attachments": [{"name": "synthetic.bin", "url": "s3://synthetic-bucket/object"}]},
        {"attachmentCustodyRefs": ["custody:opaque"]},
        {"source_locator": windows_locator},
        {"source_locator": unc_locator},
        {"source_locator": web_locator},
        {"source_locator": "data:opaque"},
        {"source_locator": "mailto:user@example.test"},
        {"source_locator": "urn:uuid:opaque"},
        {"source_locator": "ftp:opaque"},
        {"source_locator": "s3://synthetic-bucket/object"},
        {"source_locator": "/root/synthetic"},
        {"source_locator": "~/synthetic"},
        {"raw_payload_copied": True},
    ):
        with pytest.raises(MailOccurrenceShadowError):
            assert_public_safe_mail_metadata(payload)

    assert_public_safe_mail_metadata(
        {
            "source_refs": [
                "custody:opaque",
                "provider:synthetic",
                "account:member-a",
                "folder:inbox",
                "mail_occurrence:opaque",
                "source-scope:member-a",
                "cursor:001",
            ],
            "attachment_custody_refs": ["custody:attachment:opaque"],
            "raw_payload_copied": False,
        }
    )

    with pytest.raises(MailOccurrenceShadowError, match="invalid_opaque_ref"):
        create_mailbox_observation(
            source_ref="provider:hiworks",
            account_ref="account:member-a",
            account_role="team",
            direction="received",
            folder_ref="folder:inbox",
            native_observation_ref="uidl-unsafe",
            occurred_at="2026-07-22T03:00:00Z",
            observed_at="2026-07-22T03:01:00Z",
            source_custody_ref=windows_locator,
        )


@pytest.mark.parametrize(
    "locator",
    (
        "data:opaque",
        "mailto:user@example.test",
        "urn:uuid:opaque",
        "ftp:opaque",
    ),
)
def test_nonhierarchical_locator_schemes_fail_create_and_typed_ref(locator: str) -> None:
    with pytest.raises(MailOccurrenceShadowError, match="forbidden_locator_value"):
        create_mailbox_observation(
            source_ref="provider:synthetic",
            account_ref="account:member-a",
            account_role="team",
            direction="received",
            folder_ref="folder:inbox",
            native_observation_ref="native:locator-rejected",
            occurred_at="2026-07-22T03:00:00Z",
            observed_at="2026-07-22T03:01:00Z",
            source_custody_ref=locator,
        )
    with pytest.raises(MailOccurrenceShadowError, match="locator_typed_ref_token"):
        create_coverage_receipt(
            source_owner_ref=_typed("source_owner", locator),
            project_ref=None,
            window_start=WINDOW_START,
            window_end=WINDOW_END,
            state="complete_no_events",
        )


def test_locator_sentinel_runs_before_save_and_after_reload(tmp_path: Path) -> None:
    path = tmp_path / "locator-state.json"
    observation = _observation("locator-state", exact_ref=_rfc())
    store = MailOccurrenceShadowStore(path)
    store.apply_batch(
        batch_id="batch:locator-state",
        source_scope_ref="source-scope:member-a",
        cursor_before=None,
        cursor_after="cursor:001",
        observations=[observation],
    )
    forged_state = store.snapshot()
    forged_state["observations"][observation["observation_id"]]["source_custody_ref"] = "data:opaque"

    with pytest.raises(MailOccurrenceShadowError, match="forbidden_locator_value"):
        store._save(forged_state)
    path.write_text(json.dumps(forged_state), encoding="utf-8")
    with pytest.raises(MailOccurrenceShadowError, match="forbidden_locator_value"):
        MailOccurrenceShadowStore(path)


def test_falsey_supplied_exact_ref_is_not_treated_as_missing() -> None:
    with pytest.raises(MailOccurrenceShadowError, match="unexpected_fields"):
        create_mailbox_observation(
            source_ref="provider:synthetic",
            account_ref="account:member-a",
            account_role="team",
            direction="received",
            folder_ref="folder:inbox",
            native_observation_ref="native:empty-exact-ref",
            occurred_at="2026-07-22T03:00:00Z",
            observed_at="2026-07-22T03:01:00Z",
            exact_occurrence_ref={},
        )

    unmatched = create_mailbox_observation(
        source_ref="provider:synthetic",
        account_ref="account:member-a",
        account_role="team",
        direction="received",
        folder_ref="folder:inbox",
        native_observation_ref="native:none-exact-ref",
        occurred_at="2026-07-22T03:00:00Z",
        observed_at="2026-07-22T03:01:00Z",
        exact_occurrence_ref=None,
    )
    assert unmatched["identity_status"] == "unmatched"
    assert unmatched["occurrence_id"].startswith("mail_occurrence_unmatched:")
