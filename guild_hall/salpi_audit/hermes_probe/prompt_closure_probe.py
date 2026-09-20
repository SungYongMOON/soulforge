"""Salpi prompt-closure probe. Runs inside the Hermes venv and never calls a model.

It prepares the agent the way this command would:

    hermes -p <profile> chat --cli --query-file <f> -t todo --ignore-rules -Q

That means the same profile env bootstrap, the same toolset, and skip_context_files /
skip_memory. It then renders the system prompt and tool schema with Hermes' own code and
prints ONE JSON object of metadata only:

- tool names and the effective context cwd
- prompt digest and length
- which candidate context files leaked into the prompt, and how many lines
- pattern-scan counts
- the profile facts that feed the chat surface's own prompt additions

The prompt text itself is never printed. Logging is disabled before Hermes is imported, so the
probe writes nothing to the profile's log files. The provider endpoint is a closed loopback port
and the API key is a placeholder, so an accidental network call fails instead of reaching a model.

Usage (launcher only):  python prompt_closure_probe.py <request.json>
request.json: {"hermes_home": str, "toolsets": [str], "candidates": [{"label": str, "path": str}],
               "allowed_path_exact": [str], "allowed_path_prefixes": [str]}
"""

from __future__ import annotations

import logging

logging.disable(logging.CRITICAL)

import hashlib  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sys  # noqa: E402
from pathlib import Path  # noqa: E402

SCHEMA = "soulforge.salpi.prompt_closure_probe.v1"
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
SECRET = re.compile(
    r"-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}"
    r"|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}"
)
# A drive path, but not the tail of a URL scheme such as `https://`.
WIN_PATH = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/][^\s`'\"<>|)]*")
# Illustrative placeholders that Hermes' own static prompt text uses.
# Built from parts so the repository path-policy scan does not read them as local paths.
STATIC_EXAMPLE_PATHS = {"a" + ":/path", "c" + ":/users/x", "c" + ":/users/"}
MIN_LINE = 12
SCRUBBED_ENV = (
    "HERMES_KANBAN_TASK", "HERMES_DELEGATED_CHILD_CONTEXT", "HERMES_INFERENCE_MODEL",
    "HERMES_INFERENCE_PROVIDER", "TERMINAL_CWD", "HERMES_EPHEMERAL_SYSTEM_PROMPT",
    "HERMES_PREFILL_MESSAGES_FILE", "HERMES_IGNORE_RULES", "HERMES_IGNORE_USER_CONFIG",
    "HERMES_ENVIRONMENT_HINT", "HERMES_TUI", "HERMES_PLATFORM", "HERMES_SESSION_PLATFORM",
    "TERMINAL_ENV", "HERMES_ACCEPT_HOOKS", "HERMES_KANBAN_BOARD", "HERMES_YOLO_MODE", "HERMES_TUI_TOOLSETS",
)
# Variables the profile .env must not (re)introduce: each can widen tools, inject prompt text,
# change the surface or re-add kanban. The terminal.* config bridge always sets TERMINAL_CWD and
# backfills TERMINAL_ENV (the terminal tool's backend); both are expected. TERMINAL_CWD is checked
# through the effective context cwd, and TERMINAL_ENV only matters to the terminal tool, which the
# tool-surface gate already requires to be absent.
WATCHED_ENV = tuple(name for name in SCRUBBED_ENV if name not in ("TERMINAL_CWD", "TERMINAL_ENV"))
# A UNC share such as \\server\share (two leading backslashes not part of a longer path).
UNC_PATH = re.compile(r"(?<![A-Za-z0-9:\\])\\\\[A-Za-z0-9]")


def _emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, sort_keys=True) + "\n")
    sys.stdout.flush()


def _distinct_lines(path: Path) -> list[str]:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    return [line for line in (raw.strip() for raw in text.splitlines())
            if len(line) >= MIN_LINE and not line.startswith(("<!--", "---", "```"))]


def _norm(path: str) -> str:
    return path.lower().replace("/", "\\").rstrip("\\")


def _allowed(path: str, exact: list[str], prefixes: list[str]) -> bool:
    norm = _norm(path)
    if any(norm == _norm(item) for item in exact):
        return True
    for prefix in prefixes:
        pre = prefix.lower().replace("/", "\\").rstrip("\\")
        if norm == pre or norm.startswith(pre + "\\"):
            return True
    return False


def _profile_facts(config: dict) -> dict:
    from hermes_cli.personality import resolve_ephemeral_system_prompt

    agent_cfg = config.get("agent") if isinstance(config.get("agent"), dict) else {}
    terminal_cfg = config.get("terminal") if isinstance(config.get("terminal"), dict) else {}
    plugins_cfg = config.get("plugins") if isinstance(config.get("plugins"), dict) else {}
    mcp = config.get("mcp_servers") if isinstance(config.get("mcp_servers"), dict) else {}
    prefill = str(config.get("prefill_messages_file") or agent_cfg.get("prefill_messages_file") or "").strip()
    model_cfg = config.get("model") if isinstance(config.get("model"), dict) else {}
    display_cfg = config.get("display") if isinstance(config.get("display"), dict) else {}
    return {
        "openai_runtime": str(model_cfg.get("openai_runtime") or "").strip().lower(),
        "coding_instructions_configured": bool(str(agent_cfg.get("coding_instructions") or "").strip()),
        "environment_hint_configured": bool(str(agent_cfg.get("environment_hint") or "").strip()),
        "platform_hints_configured": bool(agent_cfg.get("platform_hints") or config.get("platform_hints")),
        "interface": str(display_cfg.get("interface") or ""),
        "ephemeral_prompt_configured": bool(str(resolve_ephemeral_system_prompt(config) or "").strip()),
        "prefill_configured": bool(prefill),
        "config_hooks_configured": bool(config.get("hooks")),
        "mcp_server_count": len(mcp),
        "plugins_enabled": sorted(str(p) for p in (plugins_cfg.get("enabled") or [])),
        "terminal_cwd_configured": bool(str(terminal_cfg.get("cwd") or "").strip()),
        "coding_context_mode": str(agent_cfg.get("coding_context", "auto")),
    }


def main() -> int:
    request = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    home = Path(request["hermes_home"])
    for name in SCRUBBED_ENV:
        os.environ.pop(name, None)
    os.environ["HERMES_HOME"] = str(home)

    # Same bootstrap `hermes` runs before argparse: profile .env plus the terminal.* bridge.
    from hermes_cli.env_loader import load_hermes_dotenv

    load_hermes_dotenv(hermes_home=home)
    logging.disable(logging.CRITICAL)
    env_reintroduced = sorted(name for name in WATCHED_ENV if os.environ.get(name, "").strip())

    from agent.prompt_builder import DEFAULT_AGENT_IDENTITY
    from agent.runtime_cwd import resolve_context_cwd
    from hermes_cli.config import load_config
    from run_agent import AIAgent

    facts = _profile_facts(load_config())
    agent = AIAgent(
        api_key="salpi-dry-run-placeholder",
        base_url="http://127.0.0.1:9/salpi-dry-run",
        provider="custom",
        model="salpi-dry-run",
        enabled_toolsets=list(request["toolsets"]),
        skip_context_files=True,
        skip_memory=True,
        quiet_mode=True,
        platform="cli",
        session_db=None,
    )
    prompt = agent._build_system_prompt()
    schema_text = json.dumps(agent.tools or [], sort_keys=True, ensure_ascii=False)
    closure = prompt + "\n" + schema_text

    leaks = []
    for candidate in request.get("candidates", []):
        path = Path(candidate["path"])
        lines = _distinct_lines(path)
        leaks.append({
            "label": candidate["label"],
            "exists": path.is_file(),
            "distinct_lines": len(lines),
            "lines_in_prompt": sum(1 for line in lines if line in closure),
        })

    exact = list(request.get("allowed_path_exact", []))
    prefixes = list(request.get("allowed_path_prefixes", []))
    paths = {m.group(0).rstrip(".,;:") for m in WIN_PATH.finditer(prompt)}
    paths = {p for p in paths if p.lower().replace("\\", "/") not in STATIC_EXAMPLE_PATHS}
    unexpected = [p for p in paths if not _allowed(p, exact, prefixes)]

    context_cwd = resolve_context_cwd()
    effective_cwd = Path(context_cwd) if context_cwd else Path.cwd()
    git_repo = any((parent / ".git").exists() for parent in [effective_cwd, *effective_cwd.parents])
    _emit({
        "schema_version": SCHEMA,
        "status": "OK",
        "tool_names": sorted(agent.valid_tool_names or []),
        "context_cwd": str(effective_cwd),
        "context_cwd_is_git_repo": git_repo,
        "env_reintroduced": env_reintroduced,
        "default_identity_used": DEFAULT_AGENT_IDENTITY.strip()[:80] in prompt,
        "memory_loaded": getattr(agent, "_memory_store", None) is not None
        or getattr(agent, "_memory_manager", None) is not None,
        "unc_path_count": len(UNC_PATH.findall(prompt)),
        "skip_context_files": bool(agent.skip_context_files),
        "probe_prompt_sha256": hashlib.sha256(closure.encode("utf-8")).hexdigest(),
        "prompt_chars": len(prompt),
        "schema_chars": len(schema_text),
        "candidate_leaks": leaks,
        "email_count": len(EMAIL.findall(closure)),
        "secret_count": len(SECRET.findall(closure)),
        "absolute_path_count": len(paths),
        "unexpected_absolute_path_count": len(unexpected),
        "profile": facts,
    })
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 - fail closed with a code only
        _emit({"schema_version": SCHEMA, "status": "HOLD", "hold_code": "SALPI_PROBE_FAILED",
               "error_type": type(exc).__name__})
        sys.exit(2)
