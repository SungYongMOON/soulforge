"""Runtime configuration for the secure-work lane.

Every host path is injected, never literal. The repository carries only
placeholders (`<TOOL_ROOT>`, `<PILOT_ROOT>`, `<private_root>`); the real values
live in a JSON file outside the repository, named by
`SOULFORGE_SECURE_WORK_CONFIG`.

No credential value is ever read, logged or returned by this module. Adapter
probes check presence and shape only.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

CONFIG_SCHEMA = "soulforge.secure_work.config.v0"
CONFIG_ENV = "SOULFORGE_SECURE_WORK_CONFIG"


class ConfigError(RuntimeError):
    """Fail-closed configuration error. Carries a code, never a payload."""

    def __init__(self, code: str, detail: str = "") -> None:
        self.code = code
        super().__init__(code if not detail else f"{code}: {detail}")


@dataclass(frozen=True)
class AdapterConfig:
    kind: str
    enabled: bool
    values: dict


@dataclass(frozen=True)
class Config:
    path: Path
    kit_root: Path
    pilot_root: Path
    status_path: Path
    recipe_root: Path
    adapters: dict = field(default_factory=dict)
    # The one key a permit is ever checked against. Never read from a permit
    # file itself -- that would let anything that can write the job store mint
    # its own accepted permit (BIND09; see SECURE_WORK_CYCLE_V0.md). Optional at
    # parse time so a config that predates this field still loads; every code
    # path that needs the key fails closed (PERMIT_TRUST_UNBOUND) when it is
    # None or the file it names is absent.
    permit_trust_pubkey_path: Path | None = None
    # The matching private half. Only `sfx permit approve` touches this, and
    # only to sign; the engine's verification path never reads it.
    permit_trust_signing_key_path: Path | None = None

    # Directories under the pilot root. All synthetic in cycle 1.
    @property
    def source_root(self) -> Path:
        return self.pilot_root / "source"

    @property
    def jobs_root(self) -> Path:
        return self.pilot_root / "jobs"

    @property
    def vault_root(self) -> Path:
        return self.pilot_root / "vault"

    @property
    def outbox_root(self) -> Path:
        return self.pilot_root / "outbox"

    @property
    def receipts_root(self) -> Path:
        return self.pilot_root / "receipts"

    @property
    def reviews_root(self) -> Path:
        return self.pilot_root / "reviews"

    @property
    def keywrap_path(self) -> Path:
        return self.vault_root / "keywrap.local"

    @property
    def field_review_path(self) -> Path:
        return self.reviews_root / "field_reviews.json"

    def adapter(self, name: str) -> AdapterConfig:
        raw = self.adapters.get(name)
        if raw is None:
            return AdapterConfig(kind="unbound", enabled=False, values={})
        return AdapterConfig(
            kind=str(raw.get("kind", "unbound")),
            enabled=bool(raw.get("enabled", False)),
            values=raw,
        )

    def ensure_dirs(self) -> None:
        for directory in (
            self.jobs_root,
            self.vault_root,
            self.outbox_root,
            self.receipts_root,
            self.reviews_root,
            self.status_path.parent,
        ):
            directory.mkdir(parents=True, exist_ok=True)


def _require_abs(raw: object, key: str) -> Path:
    if not isinstance(raw, str) or not raw:
        raise ConfigError("CONFIG_FIELD_MISSING", key)
    candidate = Path(raw)
    if not candidate.is_absolute():
        raise ConfigError("CONFIG_PATH_NOT_ABSOLUTE", key)
    return candidate


def _optional_abs(raw: object, key: str) -> Path | None:
    """Unset is allowed (the caller fails closed at use-time); present-but-wrong is not."""
    if raw is None:
        return None
    if not isinstance(raw, str) or not raw:
        raise ConfigError("CONFIG_FIELD_MISSING", key)
    candidate = Path(raw)
    if not candidate.is_absolute():
        raise ConfigError("CONFIG_PATH_NOT_ABSOLUTE", key)
    return candidate


def load(path: str | os.PathLike[str] | None = None) -> Config:
    raw_path = path or os.environ.get(CONFIG_ENV)
    if not raw_path:
        raise ConfigError("CONFIG_NOT_BOUND", CONFIG_ENV)
    config_path = Path(raw_path)
    if not config_path.is_file():
        raise ConfigError("CONFIG_FILE_MISSING")
    try:
        data = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise ConfigError("CONFIG_FILE_INVALID") from None
    if data.get("schema") != CONFIG_SCHEMA:
        raise ConfigError("CONFIG_SCHEMA_MISMATCH")

    kit_root = _require_abs(data.get("kit_root"), "kit_root")
    pilot_root = _require_abs(data.get("pilot_root"), "pilot_root")
    status_path = _require_abs(data.get("status_path"), "status_path")
    recipe_root = _require_abs(data.get("recipe_root"), "recipe_root")
    if not (kit_root / "src" / "sf_sewe" / "models.py").is_file():
        raise ConfigError("KIT_ROOT_NOT_FOUND")
    adapters = data.get("adapters")
    if not isinstance(adapters, dict):
        raise ConfigError("CONFIG_FIELD_MISSING", "adapters")
    permit_trust_pubkey_path = _optional_abs(
        data.get("permit_trust_pubkey_path"), "permit_trust_pubkey_path")
    permit_trust_signing_key_path = _optional_abs(
        data.get("permit_trust_signing_key_path"), "permit_trust_signing_key_path")
    return Config(
        path=config_path,
        kit_root=kit_root,
        pilot_root=pilot_root,
        status_path=status_path,
        recipe_root=recipe_root,
        adapters=adapters,
        permit_trust_pubkey_path=permit_trust_pubkey_path,
        permit_trust_signing_key_path=permit_trust_signing_key_path,
    )
