"""Probe Hermes ACP profile-local MCP visibility through the Buzz wire shape.

This script sends only initialize, session/new and one metadata-only prompt.
It never connects to Buzz, reads credentials, or mutates project files.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import queue
import subprocess
import threading
import time


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile-home", required=True)
    parser.add_argument("--skip-configured-mcp", choices=("0", "1"), required=True)
    parser.add_argument("--timeout", type=float, default=90.0)
    parser.add_argument("--settle-seconds", type=float, default=0.0)
    parser.add_argument(
        "--mode",
        choices=("list", "ppt-call", "verifier-call"),
        default="list",
    )
    args = parser.parse_args()

    home = Path(args.profile_home).resolve()
    if not home.is_dir():
        raise SystemExit("profile_home_missing")
    acp = Path(os.environ.get("HERMES_ACP_BIN", ""))
    if not acp.is_file():
        raise SystemExit("HERMES_ACP_BIN_missing")

    env = os.environ.copy()
    env["HERMES_HOME"] = str(home)
    env["HERMES_ACP_SKIP_CONFIGURED_MCP"] = args.skip_configured_mcp
    process = subprocess.Popen(
        [str(acp)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        cwd=str(home),
    )
    assert process.stdin is not None
    assert process.stdout is not None
    assert process.stderr is not None

    lines: queue.Queue[str] = queue.Queue()
    stderr_lines: list[str] = []
    threading.Thread(
        target=lambda: [lines.put(line) for line in process.stdout],
        daemon=True,
    ).start()
    threading.Thread(
        target=lambda: [stderr_lines.append(line.rstrip()) for line in process.stderr],
        daemon=True,
    ).start()

    def send(request_id: int, method: str, params: dict) -> None:
        process.stdin.write(
            json.dumps(
                {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params},
                ensure_ascii=False,
            )
            + "\n"
        )
        process.stdin.flush()

    def receive_response(request_id: int, timeout: float) -> tuple[dict, list[str]]:
        deadline = time.monotonic() + timeout
        chunks: list[str] = []
        while time.monotonic() < deadline:
            try:
                raw = lines.get(timeout=min(0.5, max(0.01, deadline - time.monotonic())))
            except queue.Empty:
                if process.poll() is not None:
                    raise RuntimeError(f"acp_exited:{process.returncode}")
                continue
            message = json.loads(raw)
            if message.get("method") == "session/update":
                update = message.get("params", {}).get("update", {})
                if update.get("sessionUpdate") == "agent_message_chunk":
                    text = update.get("content", {}).get("text")
                    if isinstance(text, str):
                        chunks.append(text)
                continue
            if message.get("id") == request_id:
                if "error" in message:
                    raise RuntimeError(f"acp_error:{message['error']}")
                return message.get("result", {}), chunks
            if message.get("id") is not None and message.get("method"):
                # This probe never authorizes permission or extension requests.
                process.stdin.write(
                    json.dumps(
                        {
                            "jsonrpc": "2.0",
                            "id": message["id"],
                            "error": {"code": -32601, "message": "not supported by read-only probe"},
                        }
                    )
                    + "\n"
                )
                process.stdin.flush()
        raise TimeoutError(f"response_timeout:{request_id}")

    try:
        send(
            0,
            "initialize",
            {
                "protocolVersion": 2,
                "clientCapabilities": {"auth": {"terminal": False}},
                "clientInfo": {"name": "soulforge-readonly-probe", "version": "1"},
            },
        )
        initialize, _ = receive_response(0, args.timeout)
        send(
            1,
            "session/new",
            {
                "cwd": str(home),
                "mcpServers": [],
                "systemPrompt": "Public-safe read-only MCP visibility probe. Do not call tools.",
                "_meta": {"sessionTitle": "tool-profile-mcp-visibility-probe"},
            },
        )
        session, _ = receive_response(1, args.timeout)
        session_id = session.get("sessionId")
        if not isinstance(session_id, str):
            raise RuntimeError("session_id_missing")
        if args.settle_seconds > 0:
            time.sleep(args.settle_seconds)
        prompt_text = {
            "list": (
                "Without calling any tool, list only the exact artifact-test MCP tool names "
                "visible in this session. Return one compact JSON object with keys "
                "visible_mcp_tools and suggestion_count. If none are visible, use an empty list."
            ),
            "ppt-call": (
                "Call get_artifact_state for PROJECT-A and ART-A-PPT-001, then call "
                "submit_candidate_receipt with parent_revision R0001 and change_request_ref "
                "CR-A-ACP-001. Return compact JSON with project_ref, artifact_ref, marker, claim, "
                "effect_count and suggestion_count=0."
            ),
            "verifier-call": (
                "Call get_artifact_state for PROJECT-B and ART-B-PPT-001, then call verify_manifest "
                "with parent_revision R0001 and observed_marker BRAVO-SLIDE. Return compact JSON with "
                "project_ref, artifact_ref, verdict, authority_ceiling, effect_count and suggestion_count=0."
            ),
        }[args.mode]
        send(
            2,
            "session/prompt",
            {
                "sessionId": session_id,
                "prompt": [
                    {
                        "type": "text",
                        "text": prompt_text,
                    }
                ],
            },
        )
        prompt_result, chunks = receive_response(2, args.timeout)
        print(
            json.dumps(
                {
                    "ok": True,
                    "skip_configured_mcp": args.skip_configured_mcp,
                    "mode": args.mode,
                    "protocol_version": initialize.get("protocolVersion"),
                    "stop_reason": prompt_result.get("stopReason"),
                    "assistant_text": "".join(chunks).strip(),
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
    except Exception as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": f"{type(exc).__name__}:{exc}",
                    "stderr_tail": stderr_lines[-20:],
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        raise
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


if __name__ == "__main__":
    main()
