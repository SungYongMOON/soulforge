from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

import collector.runner as runner
from collector.connectors.base import ConnectorExecutionError
from collector.models import ConnectorError, EmailEvent, FetchResult


def _event(
    message_id: str,
    *,
    source: str = "gmail",
    received_at: str = "2026-03-05T00:00:00+00:00",
) -> EmailEvent:
    return EmailEvent(
        event_id=f"evt-{message_id}",
        source=source,
        provider_message_id=message_id,
        subject="subject",
        received_at=received_at,
        raw={"id": message_id},
    )


def _config(tmp_path: Path) -> runner.CollectorConfig:
    runtime_root = tmp_path / "runtime-email-fetch"
    inbox_root = tmp_path / "_inbox"
    return runner.CollectorConfig(
        repo_root=tmp_path,
        inbox_root=inbox_root,
        runtime_root=runtime_root,
        cursor_file=runtime_root / "state" / "cursor_state.json",
        dedupe_file=runtime_root / "state" / "dedupe_keys.json",
        run_log_file=runtime_root / "logs" / "runs.jsonl",
        debug_log_file=runtime_root / "logs" / "collector_debug.jsonl",
        last_summary_file=runtime_root / "logs" / "last_run_summary.json",
        attachment_root=inbox_root,
        limit=50,
        gmail_enabled=True,
        gmail_access_token="token-for-test",
    )


def _write_env(tmp_path: Path, content: str) -> Path:
    env_file = tmp_path / "email-fetch.env"
    env_file.write_text(content.strip() + "\n", encoding="utf-8")
    return env_file


class _FakeConnector:
    def __init__(self, result: FetchResult) -> None:
        self._result = result
        self.seen_cursors: List[Optional[Dict[str, Any]]] = []

    def fetch_since(self, cursor: Optional[Dict[str, Any]], limit: int) -> FetchResult:
        self.seen_cursors.append(cursor)
        return self._result


def test_run_once_dedupes_on_second_run(monkeypatch, tmp_path: Path) -> None:
    config = _config(tmp_path)
    events = [_event(f"msg-{idx}") for idx in range(10)]
    connector = _FakeConnector(
        FetchResult(
            events=events,
            next_cursor={"last_received_epoch": 1700000000},
            partial=False,
            errors=[],
        )
    )

    monkeypatch.setattr(runner, "_build_gmail_connector", lambda cfg: connector)

    first = runner.run_once(config)
    second = runner.run_once(config)

    assert first["total_events"] == 10
    assert first["total_new_events"] == 10
    assert first["total_duplicates"] == 0
    assert first["partial"] is False

    assert second["total_events"] == 10
    assert second["total_new_events"] == 0
    assert second["total_duplicates"] == 10

    assert connector.seen_cursors[0] is None
    assert connector.seen_cursors[1] == {"last_received_epoch": 1700000000}


def test_run_once_marks_partial_when_connector_raises(monkeypatch, tmp_path: Path) -> None:
    config = _config(tmp_path)

    class _ErrorConnector:
        def fetch_since(self, cursor: Optional[Dict[str, Any]], limit: int) -> FetchResult:
            raise ConnectorExecutionError(code="timeout", message="timeout", retryable=False)

    monkeypatch.setattr(runner, "_build_gmail_connector", lambda cfg: _ErrorConnector())

    summary = runner.run_once(config)
    assert summary["partial"] is True
    assert summary["sources"][0]["partial"] is True
    assert summary["sources"][0]["errors"][0]["code"] == "timeout"


def test_run_once_isolates_sink_failure_as_partial(monkeypatch, tmp_path: Path) -> None:
    config = _config(tmp_path)
    connector = _FakeConnector(
        FetchResult(
            events=[_event("msg-1")],
            next_cursor={"last_received_epoch": 1700000001},
            partial=False,
            errors=[],
        )
    )

    class _BrokenSink:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def write_batch(self, source: str, raw_rows, events):
            raise OSError("disk full")

    monkeypatch.setattr(runner, "_build_gmail_connector", lambda cfg: connector)
    monkeypatch.setattr(runner, "EventSink", _BrokenSink)

    summary = runner.run_once(config)
    assert summary["partial"] is True
    assert summary["sources"][0]["partial"] is True
    assert summary["sources"][0]["fetched"] == 1
    assert summary["sources"][0]["new_events"] == 0
    error_codes = [row["code"] for row in summary["sources"][0]["errors"]]
    assert "source_pipeline_error" in error_codes


def test_run_once_processes_hiworks_source(monkeypatch, tmp_path: Path) -> None:
    config = _config(tmp_path)
    config.gmail_enabled = False
    config.hiworks_enabled = True
    config.hiworks_pop3_host = "pop3.example.com"
    config.hiworks_pop3_username = "user@example.com"
    config.hiworks_pop3_password = "pw"

    connector = _FakeConnector(
        FetchResult(
            events=[_event("hi-msg-1", source="hiworks")],
            next_cursor={"last_uidl": "UID-1"},
            partial=False,
            errors=[],
        )
    )

    monkeypatch.setattr(runner, "_build_hiworks_connector", lambda cfg: connector)

    summary = runner.run_once(config)
    assert summary["partial"] is False
    assert summary["total_events"] == 1
    assert summary["sources"][0]["source"] == "hiworks"
    assert summary["sources"][0]["new_events"] == 1

    event_path = config.inbox_root / "company" / "mail" / "events" / "hiworks" / "2026" / "2026-03.jsonl"
    assert event_path.exists()
    content = event_path.read_text(encoding="utf-8")
    assert "\"source\": \"hiworks\"" in content


def test_run_once_marks_partial_when_link_download_fails(monkeypatch, tmp_path: Path) -> None:
    config = _config(tmp_path)
    config.link_download_enabled = True

    connector = _FakeConnector(
        FetchResult(
            events=[
                _event("msg-with-link"),
            ],
            next_cursor={"last_received_epoch": 1700000001},
            partial=False,
            errors=[],
        )
    )

    def fake_hydrate(events, *, source, attachment_root, config):
        return list(events), type(
            "R",
            (),
            {
                "attempted": 1,
                "downloaded": 0,
                "failed": 1,
                "errors": [
                    ConnectorError(
                        source="gmail",
                        code="link_download_unexpected_error",
                        message="boom",
                        retryable=False,
                    )
                ],
                "to_dict": lambda self: {
                    "attempted": 1,
                    "downloaded": 0,
                    "failed": 1,
                    "errors": [
                        {
                            "source": "gmail",
                            "code": "link_download_unexpected_error",
                            "message": "boom",
                            "retryable": False,
                            "detail": None,
                        }
                    ],
                },
            },
        )()

    monkeypatch.setattr(runner, "_build_gmail_connector", lambda cfg: connector)
    monkeypatch.setattr(runner, "hydrate_link_attachments", fake_hydrate)

    summary = runner.run_once(config)
    assert summary["partial"] is True
    assert summary["sources"][0]["partial"] is True
    assert summary["sources"][0]["link_download"]["failed"] == 1


def test_build_config_rejects_empty_allowlist_when_link_download_enabled(tmp_path: Path) -> None:
    env_file = _write_env(
        tmp_path,
        """
        EMAIL_FETCH_LINK_DOWNLOAD_ENABLED=true
        EMAIL_FETCH_ALLOWED_LINK_HOSTS=,,,
        """,
    )
    with pytest.raises(ValueError, match="EMAIL_FETCH_ALLOWED_LINK_HOSTS"):
        runner.build_config_from_env(tmp_path, env_file)


def test_build_config_rejects_overly_broad_allowlist_pattern(tmp_path: Path) -> None:
    env_file = _write_env(
        tmp_path,
        """
        EMAIL_FETCH_LINK_DOWNLOAD_ENABLED=true
        EMAIL_FETCH_ALLOWED_LINK_HOSTS=*.com
        """,
    )
    with pytest.raises(ValueError, match="광범위 allowlist"):
        runner.build_config_from_env(tmp_path, env_file)


def test_build_config_rejects_allowlist_denylist_overlap(tmp_path: Path) -> None:
    env_file = _write_env(
        tmp_path,
        """
        EMAIL_FETCH_LINK_DOWNLOAD_ENABLED=true
        EMAIL_FETCH_ALLOWED_LINK_HOSTS=drive.google.com,mail-api.office.hiworks.com
        EMAIL_FETCH_DENIED_LINK_HOSTS=drive.google.com
        """,
    )
    with pytest.raises(ValueError, match="동시에 존재"):
        runner.build_config_from_env(tmp_path, env_file)


def test_build_config_accepts_safe_allowlist_policy(tmp_path: Path) -> None:
    env_file = _write_env(
        tmp_path,
        """
        EMAIL_FETCH_LINK_DOWNLOAD_ENABLED=true
        EMAIL_FETCH_ALLOWED_LINK_HOSTS=drive.google.com,mail-api.office.hiworks.com
        EMAIL_FETCH_DENIED_LINK_HOSTS=www.w3.org,schemas.microsoft.com
        """,
    )
    config = runner.build_config_from_env(tmp_path, env_file)
    assert config.link_download_enabled is True
    assert "mail-api.office.hiworks.com" in tuple(config.allowed_link_hosts)
