"""Test bindings.

The E14 contract kit is a read-only original outside this repository, so the
tests that need it are skipped when no runtime config names one. The adapter
boundary tests that matter most — a missing key file, a missing bearer, a
forbidden value in a released body — need no kit and always run.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

PACKAGE_SRC = Path(__file__).resolve().parents[1] / "src"
if str(PACKAGE_SRC) not in sys.path:
    sys.path.insert(0, str(PACKAGE_SRC))


def _kit_src() -> Path | None:
    raw = os.environ.get("SOULFORGE_SECURE_WORK_CONFIG")
    if not raw or not Path(raw).is_file():
        return None
    try:
        data = json.loads(Path(raw).read_text(encoding="utf-8"))
    except ValueError:
        return None
    root = data.get("kit_root")
    if not root:
        return None
    src = Path(root) / "src"
    return src if (src / "sf_sewe" / "models.py").is_file() else None


@pytest.fixture(scope="session")
def kit():
    src = _kit_src()
    if src is None:
        pytest.skip("E14 contract kit not bound; set SOULFORGE_SECURE_WORK_CONFIG")
    if str(src) not in sys.path:
        sys.path.insert(0, str(src))
    import sf_sewe  # noqa: F401  - import proves the binding

    return src


def _bound_config_values() -> dict:
    raw = os.environ.get("SOULFORGE_SECURE_WORK_CONFIG")
    if not raw or not Path(raw).is_file():
        return {}
    try:
        return json.loads(Path(raw).read_text(encoding="utf-8"))
    except ValueError:
        return {}


@pytest.fixture
def scripted_python_executable() -> str | None:
    """The interpreter the bound runtime config names for the scripted worker.

    Read at test time from the file `SOULFORGE_SECURE_WORK_CONFIG` names, never
    written as a literal host path in this file -- the same reason the wrapper
    tests build their example paths by concatenation (the repository's
    absolute-path policy scans source bytes). `None` on a host with no bound
    runtime; callers that need to actually run the scripted worker should skip.
    """
    return (_bound_config_values().get("runtime") or {}).get("python_executable")


@pytest.fixture
def trust_keys(tmp_path):
    """A synthetic Ed25519 permit-trust key pair, generated outside any pilot
    root (into a plain pytest tmp_path directory) via the same entry point
    `sfx keys init-pilot` uses."""
    from soulforge_secure_work import authority

    result = authority.generate_pilot_trust_keypair(
        tmp_path / "trust", tmp_path / "_pilot_root_stand_in_for_containment_check_only")
    return result


@pytest.fixture
def hermetic_lane(tmp_path, kit, trust_keys, scripted_python_executable):
    """A `Lane` bound entirely to fresh tmp_path state: its own recipe, its own
    one-line synthetic source document, its own trust keys. No dependency on
    any real pilot's job history or field-review ledger -- the one field this
    source document yields is a quantity token (`TYPED_SLOT`), never a plain
    KEEP_REVIEWED text field, so no field review is ever required to reach
    RELEASE_REVIEW.
    """
    from soulforge_secure_work.config import Config
    from soulforge_secure_work.engine import Lane

    kit_root = kit.parent
    recipe_root = tmp_path / "recipes"
    recipe_root.mkdir(parents=True, exist_ok=True)
    (recipe_root / "TEST-R0.json").write_text(json.dumps({
        "recipe_id": "TEST-R0", "required_sections": ["facts"],
    }), encoding="utf-8")

    pilot_root = tmp_path / "pilot"
    (pilot_root / "source").mkdir(parents=True, exist_ok=True)
    # A single quantity token and nothing else: the whole line is one token
    # match, so extraction yields exactly one field with role "quantity" (a
    # TYPED_SLOT, never KEEP_REVIEWED) and no field review is ever required.
    (pilot_root / "source" / "01_test.md").write_text("5.8V\n", encoding="utf-8")

    adapters: dict = {}
    if scripted_python_executable:
        adapters["transport"] = {
            "kind": "scripted.subprocess", "enabled": True,
            "python_executable": scripted_python_executable,
        }

    config = Config(
        path=tmp_path / "config.json",
        kit_root=kit_root,
        pilot_root=pilot_root,
        status_path=tmp_path / "status.json",
        recipe_root=recipe_root,
        adapters=adapters,
        permit_trust_pubkey_path=Path(trust_keys["pubkey_path"]),
        permit_trust_signing_key_path=Path(trust_keys["signing_key_path"]),
    )
    return Lane(config)


@pytest.fixture
def job_at_release_review(hermetic_lane):
    """A job driven, through the real engine, to RELEASE_REVIEW."""
    lane = hermetic_lane
    job = lane.request("TEST-R0", lane.config.source_root, "test.requester", "hermetic test")
    lane.advance(job, max_steps=4)
    assert lane.phase(job) == "RELEASE_REVIEW"
    return lane, job
