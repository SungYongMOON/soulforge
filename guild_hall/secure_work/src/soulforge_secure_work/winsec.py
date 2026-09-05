"""Best-effort Windows ACL lockdown for locally generated secret-bearing files.

`os.open(path, ..., 0o600)` does not restrict access on Windows: CPython maps
the mode bits to the read-only attribute only, and the file's real access
control list is inherited from its parent directory (observed 2026-09-06:
`icacls` on a freshly created key file showed `BUILTIN\\Users:(I)(RX)`, an
inherited ACE granting every local user read access).

This module tries to narrow the ACL to the current user right after such a
file is created, and always reports what actually happened -- both the code
that creates the file and any operator-facing table (`doctor`) must be able to
say "we tried, and it worked" or "we tried, and it didn't", never assume
success. It never reads or logs the file's contents, and it never raises: a
failed lockdown is a fact to report, not by itself a reason to refuse to
proceed (the caller decides that).
"""
from __future__ import annotations

import os
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class AclLockdown:
    attempted: bool
    applied: bool
    detail: str

    def as_dict(self) -> dict:
        return asdict(self)


def restrict_to_current_user(path: Path) -> AclLockdown:
    """Best-effort ACL narrowing. A no-op (not attempted) off Windows."""
    if sys.platform != "win32":
        return AclLockdown(attempted=False, applied=False, detail="NOT_WINDOWS")
    user = os.environ.get("USERNAME")
    if not user:
        return AclLockdown(attempted=True, applied=False, detail="USERNAME_UNSET")
    try:
        completed = subprocess.run(
            ["icacls", str(path), "/inheritance:r", "/grant:r", f"{user}:F"],
            capture_output=True, timeout=10, check=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        return AclLockdown(attempted=True, applied=False, detail=type(error).__name__)
    if completed.returncode != 0:
        return AclLockdown(attempted=True, applied=False, detail=f"icacls_exit_{completed.returncode}")
    return AclLockdown(attempted=True, applied=True, detail="ICACLS_OK")
