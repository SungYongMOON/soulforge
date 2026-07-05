from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

import collector.runner as runner
from collector.models import EmailEvent, FetchResult
from collector.team_mailboxes import (
    TEAM_REGISTER_SCHEMA_VERSION,
    TeamMailboxRegisterError,
    load_team_mailbox_register,
    run_team_mailboxes,
)


def _event(message_id: str, *, source: str = "gmail") -> EmailEvent:
    return EmailEvent(
        event_id=f"evt-{message_id}",
        source=source,
        provider_message_id=message_id,
        subject="team mailbox subject",
        received_at="2026-03-05T00:00:00+00:00",
        raw={"id": message_id, "internalDate": "1772668800000"},
    )


class _FakeConnector:
    def __init__(self, result: FetchResult) -> None:
        self._result = result
        self.seen_cursors: List[Optional[Dict[str, Any]]] = []

    def fetch_since(self, cursor: Optional[Dict[str, Any]], limit: int) -> FetchResult:
        self.seen_cursors.append(cursor)
        return self._result


def _write_team_register(tmp_path: Path, rows: List[Dict[str, Any]]) -> Path:
    state_dir = tmp_path / "guild_hall" / "state" / "gateway" / "mailbox" / "state"
    state_dir.mkdir(parents=True, exist_ok=True)
    register = state_dir / "team_mailboxes.json"
    register.write_text(
        json.dumps(
            {
                "schema_version": TEAM_REGISTER_SCHEMA_VERSION,
                "mailboxes": rows,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return register


def _write_env_files(register: Path, names: List[str]) -> None:
    for name in names:
        (register.parent / name).write_text(
            "\n".join(
                [
                    "EMAIL_FETCH_RUNTIME_DIR=guild_hall/state/gateway/log/mail_fetch",
                    "EMAIL_FETCH_SOURCE_GMAIL_ENABLED=true",
                    "EMAIL_FETCH_SOURCE_HIWORKS_ENABLED=false",
                    "",
                ]
            ),
            encoding="utf-8",
        )


def test_team_runner_isolates_two_mailboxes_and_preserves_mailbox_history(monkeypatch, tmp_path: Path) -> None:
    rows = [
        {
            "id": "ops",
            "account_id": "acct-ops",
            "email": "ops@example.test",
            "display_name": "Ops",
            "provider": "gmail",
            "enabled": True,
            "env_file": "ops.env",
            "workspace": "team_ops",
        },
        {
            "id": "sales",
            "account_id": "acct-sales",
            "email": "sales@example.test",
            "display_name": "Sales",
            "provider": "gmail",
            "enabled": True,
            "env_file": "sales.env",
            "workspace": "team_sales",
        },
    ]
    register = _write_team_register(tmp_path, rows)
    _write_env_files(register, ["ops.env", "sales.env"])
    backend_root = tmp_path / "backend"
    monkeypatch.setenv("DEV_ERP_BACKEND_ROOT", str(backend_root))

    connectors: Dict[str, _FakeConnector] = {}

    def fake_gmail_connector(config: runner.CollectorConfig) -> _FakeConnector:
        mailbox_id = str((config.mailbox_metadata or {}).get("id", "missing"))
        connector = _FakeConnector(
            FetchResult(
                events=[_event("shared-provider-message")],
                next_cursor={"last_received_epoch": 1772668800, "mailbox": mailbox_id},
                partial=False,
                errors=[],
            )
        )
        connectors[mailbox_id] = connector
        return connector

    monkeypatch.setattr(runner, "_build_gmail_connector", fake_gmail_connector)

    summary = run_team_mailboxes(repo_root=tmp_path, register_file=register)

    assert summary["partial"] is False
    assert summary["mailboxes_run"] == 2
    assert summary["total_events"] == 2
    assert summary["total_new_events"] == 2
    rendered_summary = json.dumps(summary, ensure_ascii=False)
    assert "ops@example.test" not in rendered_summary
    assert "sales@example.test" not in rendered_summary

    runtime_root = tmp_path / "guild_hall" / "state" / "gateway" / "log" / "mail_fetch" / "mailboxes"
    for mailbox_id in ("ops", "sales"):
        assert (runtime_root / mailbox_id / "state" / "cursor_state.json").exists()
        assert (runtime_root / mailbox_id / "state" / "dedupe_keys.json").exists()
        assert (runtime_root / mailbox_id / "logs" / "runs.jsonl").exists()
        assert connectors[mailbox_id].seen_cursors == [None]

    ops_event_file = (
        tmp_path
        / "guild_hall"
        / "state"
        / "gateway"
        / "mailbox"
        / "team_ops"
        / "mail"
        / "events"
        / "gmail"
        / "2026"
        / "2026-03.jsonl"
    )
    sales_event_file = (
        tmp_path
        / "guild_hall"
        / "state"
        / "gateway"
        / "mailbox"
        / "team_sales"
        / "mail"
        / "events"
        / "gmail"
        / "2026"
        / "2026-03.jsonl"
    )
    assert ops_event_file.exists()
    assert sales_event_file.exists()

    ops_event = json.loads(ops_event_file.read_text(encoding="utf-8").splitlines()[0])
    sales_event = json.loads(sales_event_file.read_text(encoding="utf-8").splitlines()[0])
    assert ops_event["metadata"]["mailbox"]["id"] == "ops"
    assert ops_event["metadata"]["mailbox"]["email"] == "ops@example.test"
    assert ops_event["metadata"]["mailbox"]["workspace"] == "team_ops"
    assert sales_event["metadata"]["mailbox"]["id"] == "sales"
    assert sales_event["metadata"]["mailbox"]["email"] == "sales@example.test"
    assert sales_event["metadata"]["mailbox"]["workspace"] == "team_sales"

    pending_root = tmp_path / "guild_hall" / "state" / "gateway" / "mail_candidate" / "queue" / "pending"
    candidate_files = sorted(pending_root.glob("*.json"))
    assert len(candidate_files) == 2
    assert sorted(path.name for path in candidate_files) == [
        "mail_candidate_gmail_ops_evt-shared-provider-message.json",
        "mail_candidate_gmail_sales_evt-shared-provider-message.json",
    ]
    candidate_payloads = [json.loads(path.read_text(encoding="utf-8")) for path in candidate_files]
    assert {payload["source_event"]["workspace"] for payload in candidate_payloads} == {"team_ops", "team_sales"}
    assert {payload["source_event"]["mailbox"]["email"] for payload in candidate_payloads} == {
        "ops@example.test",
        "sales@example.test",
    }

    history_csv = backend_root / "_workmeta" / "P00-000_INBOX" / "reports" / "메일_이력" / "메일_이력.csv"
    history_rows = list(csv.DictReader(history_csv.open("r", encoding="utf-8-sig")))
    assert len(history_rows) == 2
    assert {row["메일함"] for row in history_rows} == {"ops@example.test", "sales@example.test"}
    assert {row["메일메시지ID"] for row in history_rows} == {"shared-provider-message"}
    assert {row["프로젝트코드"] for row in history_rows} == {"P00-000_INBOX"}
    assert not (tmp_path / "_workmeta").exists()
    assert (
        backend_root / "_workspaces" / "P00-000_INBOX" / "reports" / "메일_이력" / "메일_이력.xlsx"
    ).exists()
    history_refs = []
    for result in summary["results"]:
        for source in result["result"]["sources"]:
            history_refs.extend(source["mail_candidates"]["history_files"])
    assert set(history_refs) == {
        "_workmeta/P00-000_INBOX/reports/메일_이력/메일_이력.csv",
        "_workspaces/P00-000_INBOX/reports/메일_이력/메일_이력.xlsx",
        "_workmeta/P00-000_INBOX/reports/메일_이력/메일_일정이벤트.ics",
    }


@pytest.mark.parametrize(
    "row,code,leaked",
    [
        (
            {
                "id": "abs",
                "email": "absolute@example.test",
                "provider": "gmail",
                "enabled": True,
                "env_file": "/private/absolute.env",
            },
            "absolute_env_ref",
            ["/private/absolute.env", "absolute@example.test"],
        ),
        (
            {
                "id": "traversal",
                "email": "traversal@example.test",
                "provider": "gmail",
                "enabled": True,
                "env_file": "../secret.env",
            },
            "traversal_env_ref",
            ["../secret.env", "traversal@example.test"],
        ),
        (
            {
                "id": "unsupported",
                "email": "unsupported@example.test",
                "provider": "imap-secret-provider",
                "enabled": True,
                "env_file": "unsupported.env",
            },
            "unsupported_provider",
            ["imap-secret-provider", "unsupported@example.test"],
        ),
        (
            {
                "id": "missing-email",
                "provider": "gmail",
                "enabled": True,
                "env_file": "missing.env",
            },
            "missing_required",
            ["missing.env"],
        ),
        (
            {
                "email": "missing-id@example.test",
                "provider": "gmail",
                "enabled": True,
                "env_file": "missing.env",
            },
            "missing_required",
            ["missing-id@example.test", "missing.env"],
        ),
        (
            {
                "id": "missing-env",
                "email": "missing-env@example.test",
                "provider": "gmail",
                "enabled": True,
            },
            "missing_required",
            ["missing-env@example.test"],
        ),
    ],
)
def test_team_register_rejects_invalid_rows_without_leaking_values(
    tmp_path: Path,
    row: Dict[str, Any],
    code: str,
    leaked: List[str],
) -> None:
    register = _write_team_register(tmp_path, [row])

    with pytest.raises(TeamMailboxRegisterError) as exc_info:
        load_team_mailbox_register(repo_root=tmp_path, register_file=register)

    message = str(exc_info.value)
    assert exc_info.value.code == code
    for value in leaked:
        assert value not in message
