from __future__ import annotations

import csv
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

import collector.runner as runner
import collector.team_mailboxes as team_mailboxes
from collector.models import EmailEvent, FetchResult
from collector.team_mailboxes import (
    TEAM_REGISTER_SCHEMA_VERSION,
    TeamMailboxRegisterError,
    default_register_path,
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


def test_outlook_sent_provider_runs_inside_pinned_team_capsule(
    monkeypatch, tmp_path: Path
) -> None:
    register = _write_team_register(
        tmp_path,
        [
            {
                "id": "sent-ops",
                "account_id": "acct-sent-ops",
                "email": "sent-ops@example.test",
                "provider": "outlook_sent",
                "enabled": True,
                "env_file": "sent-ops.env",
                "workspace": "team_ops",
            }
        ],
    )
    env_path = register.parent / "sent-ops.env"
    env_text = "\n".join(
        [
            "OUTLOOK_SENT_ENABLED=true",
            f"OUTLOOK_SENT_DEFAULT_STORE_FINGERPRINT=sha256:{'1' * 64}",
            f"OUTLOOK_SENT_DEFAULT_FOLDER_FINGERPRINT=sha256:{'2' * 64}",
            "OUTLOOK_SENT_ALLOWED_WINDOWS_KST=02:00-04:00,12:00-14:00",
            "",
        ]
    )
    env_path.write_text(env_text, encoding="utf-8")
    data_root = tmp_path / "private-data"
    seen = []

    def synthetic_run(config):
        seen.append(config)
        return {
            "schema_version": "email.fetch.outlook_sent_run.v1",
            "status": "ok",
            "partial": False,
            "total_events": 1,
            "total_new_events": 1,
            "total_duplicates": 0,
            "custody_objects_written": 1,
            "cursor_advanced": True,
            "truncated": False,
            "gap_count": 0,
        }

    monkeypatch.setattr(team_mailboxes.outlook_sent, "run_outlook_sent", synthetic_run)
    summary = run_team_mailboxes(
        repo_root=tmp_path,
        register_file=register,
        credential_texts_by_path={str(env_path): env_text},
        nested_credential_texts_by_path={},
        capsule_env_overrides={
            "EMAIL_FETCH_INBOX_ROOT": str(data_root / "ingress" / "mailbox"),
            "EMAIL_FETCH_RUNTIME_DIR": str(data_root / "runtime" / "mail_fetch"),
        },
    )

    assert summary["partial"] is False
    assert summary["mailboxes_run"] == 1
    assert summary["total_events"] == 1
    assert len(seen) == 1
    assert seen[0].capsule_bound is True
    assert seen[0].account_role == "owner"
    assert seen[0].source_custody_root.is_relative_to(data_root)


def test_outlook_sent_error_code_is_safe_for_operator_diagnosis() -> None:
    error = team_mailboxes.outlook_sent.OutlookSentError(
        "outlook_sent_folder_pin_mismatch"
    )
    assert (
        team_mailboxes._safe_mailbox_error_code(error)
        == "outlook_sent_folder_pin_mismatch"
    )
    custody_error = team_mailboxes.outlook_sent.OutlookSentError(
        "source_custody_reparse_forbidden"
    )
    assert (
        team_mailboxes._safe_mailbox_error_code(custody_error)
        == "source_custody_reparse_forbidden"
    )
    assert (
        team_mailboxes._safe_mailbox_error_code(RuntimeError("private detail"))
        == "mailbox_run_error"
    )


def test_outlook_sent_uses_empty_preloaded_capsule_without_reopen_and_honors_limit(
    monkeypatch, tmp_path: Path
) -> None:
    register = _write_team_register(
        tmp_path,
        [
            {
                "id": "sent-owner",
                "account_id": "acct-sent-owner",
                "email": "sent-owner@example.test",
                "provider": "outlook_sent",
                "enabled": True,
                "env_file": "sent-owner.env",
                "workspace": "company",
            }
        ],
    )
    env_path = register.parent / "sent-owner.env"
    env_path.write_text("must-not-be-reopened=true\n", encoding="utf-8")
    mailboxes = load_team_mailbox_register(
        repo_root=tmp_path,
        register_file=register,
    )
    env_path.unlink()
    data_root = tmp_path / "private-data"
    seen = []

    def synthetic_run(config):
        seen.append(config)
        return {
            "schema_version": "email.fetch.outlook_sent_run.v1",
            "status": "ok",
            "partial": False,
            "total_events": 0,
            "total_new_events": 0,
            "total_duplicates": 0,
            "custody_objects_written": 0,
            "cursor_advanced": False,
            "truncated": False,
            "gap_count": 0,
        }

    monkeypatch.setattr(team_mailboxes.outlook_sent, "run_outlook_sent", synthetic_run)
    summary = run_team_mailboxes(
        repo_root=tmp_path,
        register_file=register,
        mailboxes=mailboxes,
        limit=2,
        credential_texts_by_path={str(env_path): ""},
        nested_credential_texts_by_path={},
        capsule_env_overrides={
            "EMAIL_FETCH_INBOX_ROOT": str(data_root / "ingress" / "mailbox"),
            "EMAIL_FETCH_RUNTIME_DIR": str(data_root / "runtime" / "mail_fetch"),
            "OUTLOOK_SENT_ENABLED": "true",
            "OUTLOOK_SENT_DEFAULT_STORE_FINGERPRINT": f"sha256:{'1' * 64}",
            "OUTLOOK_SENT_DEFAULT_FOLDER_FINGERPRINT": f"sha256:{'2' * 64}",
            "OUTLOOK_SENT_ALLOWED_WINDOWS_KST": "02:00-04:00,12:00-14:00",
            "OUTLOOK_SENT_MAX_ITEMS": "100",
        },
    )

    assert summary["partial"] is False
    assert len(seen) == 1
    assert seen[0].capsule_bound is True
    assert seen[0].max_items == 2


def test_team_register_and_env_refs_can_live_under_stable_private_config_root(
    monkeypatch, tmp_path: Path
) -> None:
    repo_root = tmp_path / "release-checkout"
    repo_root.mkdir()
    private_root = tmp_path / "stable-private-config"
    register = _write_team_register(
        private_root,
        [
            {
                "id": "ops",
                "account_id": "acct-ops",
                "email": "ops@example.test",
                "provider": "hiworks",
                "enabled": True,
                "env_file": "guild_hall/state/gateway/mailbox/state/ops.env",
            }
        ],
    )
    _write_env_files(register, ["ops.env"])
    monkeypatch.setenv("EMAIL_FETCH_PRIVATE_CONFIG_ROOT", str(private_root))

    assert default_register_path(repo_root) == register
    mailboxes = load_team_mailbox_register(repo_root=repo_root, register_file=register)
    assert len(mailboxes) == 1
    assert mailboxes[0].env_file == register.parent / "ops.env"
    assert not (repo_root / "guild_hall" / "state" / "gateway" / "mailbox" / "state" / "ops.env").exists()


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


def test_team_runner_ingress_only_writes_source_custody_without_projection(monkeypatch, tmp_path: Path) -> None:
    register = _write_team_register(
        tmp_path,
        [
            {
                "id": "ops",
                "account_id": "acct-ops",
                "email": "ops@example.test",
                "provider": "gmail",
                "enabled": True,
                "env_file": "ops.env",
                "workspace": "team_ops",
            }
        ],
    )
    _write_env_files(register, ["ops.env"])
    data_root = tmp_path / "stable-data"
    backend_root = tmp_path / "backend"
    monkeypatch.setenv("EMAIL_FETCH_INBOX_ROOT", str(data_root / "ingress" / "mailbox"))
    monkeypatch.setenv("EMAIL_FETCH_RUNTIME_DIR", str(data_root / "runtime" / "mail_fetch"))
    monkeypatch.setenv("EMAIL_FETCH_MAIL_CANDIDATE_QUEUE_ROOT", str(data_root / "state" / "mail_candidate"))
    monkeypatch.setenv("DEV_ERP_BACKEND_ROOT", str(backend_root))
    monkeypatch.setattr(
        runner,
        "_build_gmail_connector",
        lambda _config: _FakeConnector(
            FetchResult(
                events=[_event("ingress-only-message")],
                next_cursor={"last_received_epoch": 1772668800},
                partial=False,
                errors=[],
            )
        ),
    )

    summary = run_team_mailboxes(
        repo_root=tmp_path,
        register_file=register,
        ingress_only=True,
    )

    assert summary["partial"] is False
    result = summary["results"][0]["result"]
    assert result["ingress_only"] is True
    source = result["sources"][0]
    assert source["raw_written"] == 1
    assert source["event_written"] == 1
    assert source["mail_candidates"]["skipped_reason"] == "ingress_only"
    assert source["notifications"]["skipped_reason"] == "ingress_only"
    assert source["plaud_mail_triggers"]["skipped_reason"] == "ingress_only"
    assert (
        data_root
        / "ingress"
        / "mailbox"
        / "team_ops"
        / "mail"
        / "raw"
        / "gmail"
        / "2026"
        / "2026-03.jsonl"
    ).exists()
    assert (data_root / "runtime" / "mail_fetch" / "mailboxes" / "ops" / "state" / "cursor_state.json").exists()
    assert not (data_root / "state" / "mail_candidate").exists()
    assert not (backend_root / "_workmeta").exists()
    assert not (backend_root / "_workspaces").exists()


def test_capsule_preloads_all_primary_credentials_and_ignores_ambient_overrides(
    monkeypatch, tmp_path: Path
) -> None:
    register = _write_team_register(
        tmp_path,
        [
            {
                "id": "first",
                "email": "first@example.test",
                "provider": "hiworks",
                "enabled": True,
                "env_file": "first.env",
            },
            {
                "id": "second",
                "email": "second@example.test",
                "provider": "hiworks",
                "enabled": True,
                "env_file": "second.env",
            },
        ],
    )
    first_env = "\n".join(
        [
            "HIWORKS_POP3_HOST=pop3.example.test",
            "HIWORKS_POP3_USERNAME=first",
            "HIWORKS_POP3_PASSWORD=first-trusted",
            "",
        ]
    )
    second_env = "\n".join(
        [
            "HIWORKS_POP3_HOST=pop3.example.test",
            "HIWORKS_POP3_USERNAME=second",
            "HIWORKS_POP3_PASSWORD=second-trusted",
            "",
        ]
    )
    (register.parent / "first.env").write_text(first_env, encoding="utf-8")
    (register.parent / "second.env").write_text(second_env, encoding="utf-8")
    forced_runtime = tmp_path / "forced-runtime"
    monkeypatch.setenv("HIWORKS_POP3_PASSWORD", "ambient-must-not-win")
    monkeypatch.setenv("EMAIL_FETCH_RUNTIME_DIR", str(tmp_path / "ambient-runtime"))
    seen = []

    def fake_run_once(config: runner.CollectorConfig) -> Dict[str, Any]:
        seen.append((config.mailbox_metadata["id"], config.hiworks_pop3_password, config.runtime_root))
        if len(seen) == 1:
            (register.parent / "second.env").write_text(
                "HIWORKS_POP3_PASSWORD=second-swapped\n",
                encoding="utf-8",
            )
        return {
            "partial": False,
            "total_events": 0,
            "total_new_events": 0,
            "total_duplicates": 0,
        }

    monkeypatch.setattr(runner, "run_once", fake_run_once)
    summary = run_team_mailboxes(
        repo_root=tmp_path,
        register_file=register,
        credential_texts_by_path={
            str(register.parent / "first.env"): first_env,
            str(register.parent / "second.env"): second_env,
        },
        capsule_env_overrides={"EMAIL_FETCH_RUNTIME_DIR": str(forced_runtime)},
    )

    assert summary["partial"] is False
    assert [(row[0], row[1]) for row in seen] == [
        ("first", "first-trusted"),
        ("second", "second-trusted"),
    ]
    assert all(str(row[2]).startswith(str(forced_runtime)) for row in seen)


@pytest.mark.parametrize(
    "provider,nested_field",
    [
        ("gmail", "GMAIL_ACCESS_TOKEN_FILE=token.json"),
        ("hiworks", "HIWORKS_POP3_PASSWORD_FILE=password.txt"),
    ],
)
def test_capsule_rejects_nested_credential_file_indirection_without_a_pinned_preload(
    monkeypatch, tmp_path: Path, provider: str, nested_field: str
) -> None:
    register = _write_team_register(
        tmp_path,
        [
            {
                "id": "nested",
                "email": "nested@example.test",
                "provider": provider,
                "enabled": True,
                "env_file": "nested.env",
            }
        ],
    )
    env_text = f"{nested_field}\n"
    env_path = register.parent / "nested.env"
    env_path.write_text(env_text, encoding="utf-8")
    calls = 0

    def forbidden_run_once(_config: runner.CollectorConfig) -> Dict[str, Any]:
        nonlocal calls
        calls += 1
        raise AssertionError("run_once must not start")

    monkeypatch.setattr(runner, "run_once", forbidden_run_once)
    summary = run_team_mailboxes(
        repo_root=tmp_path,
        register_file=register,
        credential_texts_by_path={str(env_path): env_text},
        capsule_env_overrides={"EMAIL_FETCH_RUNTIME_DIR": str(tmp_path / "runtime")},
    )

    assert calls == 0
    assert summary["partial"] is True
    assert summary["mailboxes_run"] == 0
    assert summary["errors"][0]["code"] == "mail_capsule_nested_credential_file_unsupported"
    assert summary["errors"][0]["message"] == "mail_capsule_nested_credential_file_unsupported"


@pytest.mark.skipif(os.name != "nt", reason="Windows equivalent-path spelling")
def test_capsule_accepts_only_one_preloaded_windows_equivalent_path(tmp_path: Path) -> None:
    env_path = tmp_path / "owner.env"
    password_path = tmp_path / "password.txt"
    env_text = "HIWORKS_POP3_PASSWORD_FILE=password.txt\n"
    env_path.write_text(env_text, encoding="utf-8")
    password_path.write_text("synthetic-password\n", encoding="utf-8")

    config = runner.build_config_from_env(
        repo_root=tmp_path,
        env_file=env_path,
        env_text=env_text,
        include_ambient=False,
        disable_credential_persistence=True,
        credential_file_texts_by_path={str(password_path).upper().replace("\\", "/"): "synthetic-password\n"},
    )

    assert config.hiworks_pop3_password == "synthetic-password"


def test_hiworks_mailbox_does_not_load_irrelevant_gmail_nested_credential(
    monkeypatch, tmp_path: Path
) -> None:
    register = _write_team_register(
        tmp_path,
        [{
            "id": "hiworks-only",
            "email": "owner@example.test",
            "provider": "hiworks",
            "enabled": True,
            "env_file": "owner.env",
        }],
    )
    env_path = register.parent / "owner.env"
    env_text = (
        "GMAIL_ACCESS_TOKEN_FILE=irrelevant-token.json\n"
        "HIWORKS_POP3_PASSWORD=synthetic-password\n"
    )
    env_path.write_text(env_text, encoding="utf-8")
    seen = []

    def capture(config: runner.CollectorConfig) -> Dict[str, Any]:
        seen.append(config)
        return {
            "partial": False,
            "total_events": 0,
            "total_new_events": 0,
            "total_duplicates": 0,
        }

    monkeypatch.setattr(runner, "run_once", capture)
    summary = run_team_mailboxes(
        repo_root=tmp_path,
        register_file=register,
        credential_texts_by_path={str(env_path): env_text},
        nested_credential_texts_by_path={},
    )

    assert summary["partial"] is False
    assert summary["mailboxes_run"] == 1
    assert len(seen) == 1
    assert seen[0].hiworks_pop3_password == "synthetic-password"


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
