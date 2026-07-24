from __future__ import annotations

from pathlib import Path

import team_cli


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
