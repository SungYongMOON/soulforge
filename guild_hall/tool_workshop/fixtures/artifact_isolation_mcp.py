"""Public-safe synthetic MCP for Hermes/Buzz Tool Bot isolation tests.

The server has no filesystem, network, credential, project-payload, or external
side effects.  It returns deterministic metadata for two synthetic projects so
profile-local MCP allowlists and cross-project isolation can be tested before a
physical Tool Workshop is enabled.
"""

from __future__ import annotations

import json
import re
import argparse

from mcp.server import MCPServer


REF = re.compile(r"^[A-Z][A-Z0-9-]{1,63}$")
SYNTHETIC = {
    ("PROJECT-A", "ART-A-PPT-001"): {
        "marker": "ALPHA-SLIDE",
        "current_revision": "R0001",
    },
    ("PROJECT-B", "ART-B-PPT-001"): {
        "marker": "BRAVO-SLIDE",
        "current_revision": "R0001",
    },
}


def _require_ref(value: str, field: str) -> str:
    text = str(value or "").strip()
    if not REF.fullmatch(text):
        raise ValueError(f"{field}_invalid")
    return text


def _state(project_ref: str, artifact_ref: str) -> dict[str, str]:
    project = _require_ref(project_ref, "project_ref")
    artifact = _require_ref(artifact_ref, "artifact_ref")
    row = SYNTHETIC.get((project, artifact))
    if row is None:
        raise ValueError("artifact_binding_unknown")
    return {"project_ref": project, "artifact_ref": artifact, **row}


mcp = MCPServer("artifact-isolation-test")


@mcp.tool()
def get_artifact_state(project_ref: str, artifact_ref: str) -> str:
    """Return one exact synthetic artifact state without reading any file."""
    return json.dumps(
        {"ok": True, "effect_count": 0, **_state(project_ref, artifact_ref)},
        ensure_ascii=False,
        sort_keys=True,
    )


@mcp.tool()
def submit_candidate_receipt(
    project_ref: str,
    artifact_ref: str,
    parent_revision: str,
    change_request_ref: str,
) -> str:
    """Build a candidate-only receipt; persist and mutate nothing."""
    state = _state(project_ref, artifact_ref)
    parent = _require_ref(parent_revision, "parent_revision")
    request = _require_ref(change_request_ref, "change_request_ref")
    if parent != state["current_revision"]:
        raise ValueError("parent_revision_stale")
    return json.dumps(
        {
            "ok": True,
            "claim": "workshop_output_candidate_only",
            "project_ref": state["project_ref"],
            "artifact_ref": state["artifact_ref"],
            "parent_revision": parent,
            "change_request_ref": request,
            "marker": state["marker"],
            "effect_count": 0,
        },
        ensure_ascii=False,
        sort_keys=True,
    )


@mcp.tool()
def verify_manifest(
    project_ref: str,
    artifact_ref: str,
    parent_revision: str,
    observed_marker: str,
) -> str:
    """Verify exact synthetic bindings and return PASS/HOLD without writes."""
    state = _state(project_ref, artifact_ref)
    parent = _require_ref(parent_revision, "parent_revision")
    marker = str(observed_marker or "").strip()
    failures: list[str] = []
    if parent != state["current_revision"]:
        failures.append("PARENT_REVISION_MISMATCH")
    if marker != state["marker"]:
        failures.append("PROJECT_MARKER_MISMATCH")
    return json.dumps(
        {
            "verdict": "PASS" if not failures else "HOLD",
            "failures": failures,
            "project_ref": state["project_ref"],
            "artifact_ref": state["artifact_ref"],
            "authority_ceiling": "verified_completion_candidate",
            "effect_count": 0,
        },
        ensure_ascii=False,
        sort_keys=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--transport", choices=("stdio", "http"), default="stdio")
    parser.add_argument("--port", type=int, default=18765)
    args = parser.parse_args()
    if args.transport == "http":
        mcp.run(
            transport="streamable-http",
            host="127.0.0.1",
            port=args.port,
            stateless_http=True,
        )
    else:
        mcp.run(transport="stdio")
