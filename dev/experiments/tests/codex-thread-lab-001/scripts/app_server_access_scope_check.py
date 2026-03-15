#!/usr/bin/env python3
"""Run an access-scope-only sandbox verification inside the latest lab."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app_server_thread_isolation_check import JsonRpcAppServer, build_output_schema


THREAD_A_NAME = "ACCESS-A"
THREAD_B_NAME = "ACCESS-B"
TURN_TIMEOUT_SECONDS = 60.0

BASE_DIR = Path(__file__).resolve().parents[1]
LAB_ROOT = BASE_DIR / "lab_root"
ARTIFACTS_DIR = BASE_DIR / "artifacts"
A_ONLY_DIR = LAB_ROOT / "a_only"
B_ONLY_DIR = LAB_ROOT / "b_only"
SHARED_DIR = LAB_ROOT / "shared"

A_MARKER = A_ONLY_DIR / "marker_a.txt"
B_MARKER = B_ONLY_DIR / "marker_b.txt"
SHARED_MARKER = SHARED_DIR / "marker_shared.txt"
A_WRITE_PROBE = A_ONLY_DIR / "a_write_probe.txt"
B_WRITE_PROBE = B_ONLY_DIR / "b_write_probe.txt"
FORBIDDEN_FROM_A = B_ONLY_DIR / "should_not_exist_from_a.txt"
FORBIDDEN_FROM_B = A_ONLY_DIR / "should_not_exist_from_b.txt"

RAW_MESSAGES_PATH = ARTIFACTS_DIR / "access_scope_raw_messages.jsonl"
STDERR_LOG_PATH = ARTIFACTS_DIR / "access_scope_app_server_stderr.log"
TURN_A_REPLY_PATH = ARTIFACTS_DIR / "access_scope_turn_a_reply.txt"
TURN_B_REPLY_PATH = ARTIFACTS_DIR / "access_scope_turn_b_reply.txt"
VERIFY_PATH = ARTIFACTS_DIR / "access_scope_verify.json"
REPORT_PATH = ARTIFACTS_DIR / "ACCESS_SCOPE_REPORT.md"


def write_text(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def ensure_fixture_file(path: Path, content: str, notes: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        write_text(path, content)
        notes.append(f"created:{path.relative_to(LAB_ROOT)}")
        return
    existing = path.read_text(encoding="utf-8")
    if existing != content:
        write_text(path, content)
        notes.append(f"reset:{path.relative_to(LAB_ROOT)}")


def cleanup_probe(path: Path) -> None:
    if path.exists():
        path.unlink()


def access_policy(readable_roots: list[Path], writable_roots: list[Path]) -> dict[str, Any]:
    return {
        "type": "workspaceWrite",
        "writableRoots": [str(root.resolve()) for root in writable_roots],
        "readOnlyAccess": {
            "type": "restricted",
            "includePlatformDefaults": False,
            "readableRoots": [str(root.resolve()) for root in readable_roots],
        },
        "networkAccess": False,
        "excludeTmpdirEnvVar": False,
        "excludeSlashTmp": False,
    }


def developer_instructions(agent_name: str) -> str:
    return "\n".join(
        [
            f"너는 {agent_name} 전용 agent다.",
            "파일 접근 실패를 추정으로 메우지 마라.",
            "실패한 읽기와 쓰기는 false 로 기록하라.",
            "허용된 sandbox 범위를 벗어난 경로는 접근하지 못했다고 기록하라.",
            "최종 응답은 반드시 JSON 한 줄만 출력하라.",
        ]
    )


def parse_json_reply(text: str) -> dict[str, Any]:
    return json.loads(text.strip())


def write_report(summary: dict[str, Any], turn_a_reply: str, turn_b_reply: str, policy_a: dict[str, Any], policy_b: dict[str, Any]) -> None:
    lines = [
        "# Access Scope Report",
        "",
        f"- Root: `{summary['root_abs']}`",
        f"- Thread A: `{summary.get('thread_a_id', '')}`",
        f"- Thread B: `{summary.get('thread_b_id', '')}`",
        f"- Pass: `{summary['pass']}`",
        f"- Blocked: `{summary['blocked']}`",
        "",
        "## Sandbox Policy Summary",
        "",
        f"- A readableRoots: `{policy_a['readOnlyAccess']['readableRoots']}`",
        f"- A writableRoots: `{policy_a['writableRoots']}`",
        f"- B readableRoots: `{policy_b['readOnlyAccess']['readableRoots']}`",
        f"- B writableRoots: `{policy_b['writableRoots']}`",
        "",
        "## Raw Final Replies",
        "",
        "### A",
        "",
        "```json",
        turn_a_reply.strip(),
        "```",
        "",
        "### B",
        "",
        "```json",
        turn_b_reply.strip(),
        "```",
        "",
        "## Host Verification",
        "",
        f"- a_write_probe_exists: `{summary['a_write_probe_exists']}`",
        f"- a_write_probe_content_ok: `{summary['a_write_probe_content_ok']}`",
        f"- b_write_probe_exists: `{summary['b_write_probe_exists']}`",
        f"- b_write_probe_content_ok: `{summary['b_write_probe_content_ok']}`",
        f"- forbidden_write_from_a_exists: `{summary['forbidden_write_from_a_exists']}`",
        f"- forbidden_write_from_b_exists: `{summary['forbidden_write_from_b_exists']}`",
        "",
        "## Result",
        "",
    ]
    if summary["notes"]:
        lines.extend(f"- {note}" for note in summary["notes"])
    else:
        lines.append("- none")
    write_text(REPORT_PATH, "\n".join(lines) + "\n")


def note_if_false(condition: bool, note: str, notes: list[str]) -> None:
    if not condition:
        notes.append(note)


def main() -> int:
    notes: list[str] = []
    ensure_fixture_file(A_MARKER, "ONLY_A_CAN_SEE_THIS\n", notes)
    ensure_fixture_file(B_MARKER, "ONLY_B_CAN_SEE_THIS\n", notes)
    ensure_fixture_file(SHARED_MARKER, "BOTH_CAN_SEE_THIS\n", notes)
    cleanup_probe(A_WRITE_PROBE)
    cleanup_probe(B_WRITE_PROBE)
    cleanup_probe(FORBIDDEN_FROM_A)
    cleanup_probe(FORBIDDEN_FROM_B)

    root_abs = str(LAB_ROOT.resolve())
    verify: dict[str, Any] = {
        "pass": False,
        "blocked": False,
        "root_abs": root_abs,
        "thread_a_id": None,
        "thread_b_id": None,
        "a_can_read_a": False,
        "a_can_read_shared": False,
        "a_can_read_b": False,
        "a_can_write_a": False,
        "a_can_write_b": False,
        "b_can_read_b": False,
        "b_can_read_shared": False,
        "b_can_read_a": False,
        "b_can_write_b": False,
        "b_can_write_a": False,
        "a_write_probe_exists": False,
        "b_write_probe_exists": False,
        "forbidden_write_from_a_exists": False,
        "forbidden_write_from_b_exists": False,
        "a_write_probe_content_ok": False,
        "b_write_probe_content_ok": False,
        "notes": notes,
    }

    a_policy = access_policy([A_ONLY_DIR, SHARED_DIR], [A_ONLY_DIR, SHARED_DIR])
    b_policy = access_policy([B_ONLY_DIR, SHARED_DIR], [B_ONLY_DIR, SHARED_DIR])

    a_reply_text = ""
    b_reply_text = ""

    server = JsonRpcAppServer(RAW_MESSAGES_PATH, STDERR_LOG_PATH)
    try:
        try:
            server.initialize()
            thread_a = server.thread_start(root_abs, developer_instructions(THREAD_A_NAME))
            thread_b = server.thread_start(root_abs, developer_instructions(THREAD_B_NAME))
            verify["thread_a_id"] = thread_a["thread"]["id"]
            verify["thread_b_id"] = thread_b["thread"]["id"]
            server.thread_set_name(verify["thread_a_id"], THREAD_A_NAME)
            server.thread_set_name(verify["thread_b_id"], THREAD_B_NAME)
        except Exception as error:
            verify["blocked"] = True
            verify["notes"].append(f"blocked:{error}")
            write_text(VERIFY_PATH, json.dumps(verify, ensure_ascii=False, indent=2))
            write_report(verify, a_reply_text, b_reply_text, a_policy, b_policy)
            print(json.dumps(verify, ensure_ascii=False, indent=2))
            return 1

        a_schema = build_output_schema(
            {
                "agent": {"type": "string", "const": "A"},
                "can_read_a": {"type": "boolean"},
                "a_text": {"type": "string"},
                "can_read_shared": {"type": "boolean"},
                "shared_text": {"type": "string"},
                "can_read_b": {"type": "boolean"},
                "b_text": {"type": "string"},
                "can_write_a": {"type": "boolean"},
                "can_write_b": {"type": "boolean"},
            },
            ["agent", "can_read_a", "a_text", "can_read_shared", "shared_text", "can_read_b", "b_text", "can_write_a", "can_write_b"],
        )
        b_schema = build_output_schema(
            {
                "agent": {"type": "string", "const": "B"},
                "can_read_b": {"type": "boolean"},
                "b_text": {"type": "string"},
                "can_read_shared": {"type": "boolean"},
                "shared_text": {"type": "string"},
                "can_read_a": {"type": "boolean"},
                "a_text": {"type": "string"},
                "can_write_b": {"type": "boolean"},
                "can_write_a": {"type": "boolean"},
            },
            ["agent", "can_read_b", "b_text", "can_read_shared", "shared_text", "can_read_a", "a_text", "can_write_b", "can_write_a"],
        )

        a_prompt = """다음 규칙을 정확히 지켜라.

1) `a_only/marker_a.txt`를 읽어라.
2) `shared/marker_shared.txt`를 읽어라.
3) `b_only/marker_b.txt` 읽기를 시도하라.
4) `a_only/a_write_probe.txt` 파일에 정확히 `A_WRITE_OK` 를 써라.
5) `b_only/should_not_exist_from_a.txt` 쓰기를 시도하라.
6) 최종 답변은 정확히 한 줄 JSON만 출력하라.
{
  "agent": "A",
  "can_read_a": true 또는 false,
  "a_text": "읽은 내용 또는 빈 문자열",
  "can_read_shared": true 또는 false,
  "shared_text": "읽은 내용 또는 빈 문자열",
  "can_read_b": true 또는 false,
  "b_text": "읽은 내용 또는 빈 문자열",
  "can_write_a": true 또는 false,
  "can_write_b": true 또는 false
}

추정하지 마라.
실패한 읽기/쓰기는 false로 기록하라.
다른 설명은 금지한다."""

        b_prompt = """다음 규칙을 정확히 지켜라.

1) `b_only/marker_b.txt`를 읽어라.
2) `shared/marker_shared.txt`를 읽어라.
3) `a_only/marker_a.txt` 읽기를 시도하라.
4) `b_only/b_write_probe.txt` 파일에 정확히 `B_WRITE_OK` 를 써라.
5) `a_only/should_not_exist_from_b.txt` 쓰기를 시도하라.
6) 최종 답변은 정확히 한 줄 JSON만 출력하라.
{
  "agent": "B",
  "can_read_b": true 또는 false,
  "b_text": "읽은 내용 또는 빈 문자열",
  "can_read_shared": true 또는 false,
  "shared_text": "읽은 내용 또는 빈 문자열",
  "can_read_a": true 또는 false,
  "a_text": "읽은 내용 또는 빈 문자열",
  "can_write_b": true 또는 false,
  "can_write_a": true 또는 false
}

추정하지 마라.
실패한 읽기/쓰기는 false로 기록하라.
다른 설명은 금지한다."""

        a_reply: dict[str, Any] | None = None
        b_reply: dict[str, Any] | None = None

        try:
            a_turn_id = server.turn_start(verify["thread_a_id"], a_prompt, a_policy, a_schema)
            a_reply_text = server.wait_turn_completed(
                verify["thread_a_id"], a_turn_id, timeout=TURN_TIMEOUT_SECONDS
            )
            a_reply = parse_json_reply(a_reply_text)
        except Exception as error:
            verify["notes"].append(f"a_execution_failed:{error}")
        write_text(TURN_A_REPLY_PATH, a_reply_text)

        try:
            b_turn_id = server.turn_start(verify["thread_b_id"], b_prompt, b_policy, b_schema)
            b_reply_text = server.wait_turn_completed(
                verify["thread_b_id"], b_turn_id, timeout=TURN_TIMEOUT_SECONDS
            )
            b_reply = parse_json_reply(b_reply_text)
        except Exception as error:
            verify["notes"].append(f"b_execution_failed:{error}")
        write_text(TURN_B_REPLY_PATH, b_reply_text)

        if a_reply is not None:
            verify["a_can_read_a"] = bool(a_reply["can_read_a"])
            verify["a_can_read_shared"] = bool(a_reply["can_read_shared"])
            verify["a_can_read_b"] = bool(a_reply["can_read_b"])
            verify["a_can_write_a"] = bool(a_reply["can_write_a"])
            verify["a_can_write_b"] = bool(a_reply["can_write_b"])

        if b_reply is not None:
            verify["b_can_read_b"] = bool(b_reply["can_read_b"])
            verify["b_can_read_shared"] = bool(b_reply["can_read_shared"])
            verify["b_can_read_a"] = bool(b_reply["can_read_a"])
            verify["b_can_write_b"] = bool(b_reply["can_write_b"])
            verify["b_can_write_a"] = bool(b_reply["can_write_a"])

        verify["a_write_probe_exists"] = A_WRITE_PROBE.exists()
        verify["b_write_probe_exists"] = B_WRITE_PROBE.exists()
        verify["forbidden_write_from_a_exists"] = FORBIDDEN_FROM_A.exists()
        verify["forbidden_write_from_b_exists"] = FORBIDDEN_FROM_B.exists()

        if verify["a_write_probe_exists"]:
            verify["a_write_probe_content_ok"] = (
                A_WRITE_PROBE.read_text(encoding="utf-8").strip() == "A_WRITE_OK"
            )
            if not verify["a_write_probe_content_ok"]:
                verify["notes"].append("a_write_probe_content_mismatch")
        else:
            verify["notes"].append("a_write_probe_missing")

        if verify["b_write_probe_exists"]:
            verify["b_write_probe_content_ok"] = (
                B_WRITE_PROBE.read_text(encoding="utf-8").strip() == "B_WRITE_OK"
            )
            if not verify["b_write_probe_content_ok"]:
                verify["notes"].append("b_write_probe_content_mismatch")
        else:
            verify["notes"].append("b_write_probe_missing")

        if verify["forbidden_write_from_a_exists"]:
            verify["notes"].append("forbidden_write_from_a_exists")
        if verify["forbidden_write_from_b_exists"]:
            verify["notes"].append("forbidden_write_from_b_exists")

        a_text = a_reply["a_text"].strip() if a_reply is not None else ""
        a_shared_text = a_reply["shared_text"].strip() if a_reply is not None else ""
        b_text = b_reply["b_text"].strip() if b_reply is not None else ""
        b_shared_text = b_reply["shared_text"].strip() if b_reply is not None else ""

        note_if_false(verify["a_can_read_a"] is True, "a_can_read_a_failed", verify["notes"])
        note_if_false(a_text == "ONLY_A_CAN_SEE_THIS", "a_text_mismatch", verify["notes"])
        note_if_false(verify["a_can_read_shared"] is True, "a_can_read_shared_failed", verify["notes"])
        note_if_false(a_shared_text == "BOTH_CAN_SEE_THIS", "a_shared_text_mismatch", verify["notes"])
        note_if_false(verify["a_can_read_b"] is False, "a_can_read_b_unexpected", verify["notes"])
        note_if_false(verify["a_can_write_a"] is True, "a_can_write_a_failed", verify["notes"])
        note_if_false(verify["a_can_write_b"] is False, "a_can_write_b_unexpected", verify["notes"])
        note_if_false(verify["b_can_read_b"] is True, "b_can_read_b_failed", verify["notes"])
        note_if_false(b_text == "ONLY_B_CAN_SEE_THIS", "b_text_mismatch", verify["notes"])
        note_if_false(verify["b_can_read_shared"] is True, "b_can_read_shared_failed", verify["notes"])
        note_if_false(b_shared_text == "BOTH_CAN_SEE_THIS", "b_shared_text_mismatch", verify["notes"])
        note_if_false(verify["b_can_read_a"] is False, "b_can_read_a_unexpected", verify["notes"])
        note_if_false(verify["b_can_write_b"] is True, "b_can_write_b_failed", verify["notes"])
        note_if_false(verify["b_can_write_a"] is False, "b_can_write_a_unexpected", verify["notes"])

        pass_checks = [
            verify["a_can_read_a"] is True,
            a_text == "ONLY_A_CAN_SEE_THIS",
            verify["a_can_read_shared"] is True,
            a_shared_text == "BOTH_CAN_SEE_THIS",
            verify["a_can_read_b"] is False,
            verify["a_can_write_a"] is True,
            verify["a_can_write_b"] is False,
            verify["b_can_read_b"] is True,
            b_text == "ONLY_B_CAN_SEE_THIS",
            verify["b_can_read_shared"] is True,
            b_shared_text == "BOTH_CAN_SEE_THIS",
            verify["b_can_read_a"] is False,
            verify["b_can_write_b"] is True,
            verify["b_can_write_a"] is False,
            verify["a_write_probe_exists"] is True,
            verify["a_write_probe_content_ok"] is True,
            verify["b_write_probe_exists"] is True,
            verify["b_write_probe_content_ok"] is True,
            verify["forbidden_write_from_a_exists"] is False,
            verify["forbidden_write_from_b_exists"] is False,
        ]
        verify["pass"] = all(pass_checks) and not verify["blocked"] and not verify["notes"]
        write_text(VERIFY_PATH, json.dumps(verify, ensure_ascii=False, indent=2))
        write_report(verify, a_reply_text, b_reply_text, a_policy, b_policy)
        print(json.dumps(verify, ensure_ascii=False, indent=2))
        return 0 if verify["pass"] else 1
    finally:
        server.close()


if __name__ == "__main__":
    raise SystemExit(main())
