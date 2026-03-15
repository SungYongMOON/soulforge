#!/usr/bin/env python3
"""Verify concurrent turn stability on one long-lived Codex App Server."""

from __future__ import annotations

import json
import time
from pathlib import Path
from queue import Empty
from typing import Any

from app_server_thread_isolation_check import JsonRpcAppServer, build_output_schema


BASE_DIR = Path(__file__).resolve().parents[1]
LAB_ROOT = BASE_DIR / "lab_root"
ARTIFACTS_DIR = BASE_DIR / "artifacts"
SHARED_DIR = LAB_ROOT / "shared"

RAW_MESSAGES_PATH = ARTIFACTS_DIR / "concurrency_raw_messages.jsonl"
STDERR_LOG_PATH = ARTIFACTS_DIR / "concurrency_app_server_stderr.log"
EVAL_PATH = ARTIFACTS_DIR / "concurrency_stability_eval.json"
REPORT_PATH = ARTIFACTS_DIR / "CONCURRENCY_STABILITY_REPORT.md"

TURN_TIMEOUT_SECONDS = 240.0

THREADS = [
    {
        "index": 1,
        "thread_name": "CONCUR-1",
        "agent": "1",
        "input_path": SHARED_DIR / "concurrency_input_1.txt",
        "output_path": SHARED_DIR / "concurrency_output_1.txt",
        "reply_path": ARTIFACTS_DIR / "concurrency_turn_1_reply.txt",
        "thread_read_path": ARTIFACTS_DIR / "concurrency_thread_1_read.json",
        "token": "TOKEN_ONE",
    },
    {
        "index": 2,
        "thread_name": "CONCUR-2",
        "agent": "2",
        "input_path": SHARED_DIR / "concurrency_input_2.txt",
        "output_path": SHARED_DIR / "concurrency_output_2.txt",
        "reply_path": ARTIFACTS_DIR / "concurrency_turn_2_reply.txt",
        "thread_read_path": ARTIFACTS_DIR / "concurrency_thread_2_read.json",
        "token": "TOKEN_TWO",
    },
    {
        "index": 3,
        "thread_name": "CONCUR-3",
        "agent": "3",
        "input_path": SHARED_DIR / "concurrency_input_3.txt",
        "output_path": SHARED_DIR / "concurrency_output_3.txt",
        "reply_path": ARTIFACTS_DIR / "concurrency_turn_3_reply.txt",
        "thread_read_path": ARTIFACTS_DIR / "concurrency_thread_3_read.json",
        "token": "TOKEN_THREE",
    },
    {
        "index": 4,
        "thread_name": "CONCUR-4",
        "agent": "4",
        "input_path": SHARED_DIR / "concurrency_input_4.txt",
        "output_path": SHARED_DIR / "concurrency_output_4.txt",
        "reply_path": ARTIFACTS_DIR / "concurrency_turn_4_reply.txt",
        "thread_read_path": ARTIFACTS_DIR / "concurrency_thread_4_read.json",
        "token": "TOKEN_FOUR",
    },
]

DEVELOPER_INSTRUCTIONS = "\n".join(
    [
        "너는 concurrency stability 검증 agent다.",
        "추정하지 마라.",
        "주어진 input file 만 읽어라.",
        "지정된 output file 만 써라.",
        "최종 응답은 반드시 JSON 한 줄만 출력하라.",
    ]
)


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def write_json(path: Path, payload: Any) -> None:
    write_text(path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def reset_fixture() -> None:
    SHARED_DIR.mkdir(parents=True, exist_ok=True)
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    for spec in THREADS:
        spec["input_path"].write_text(spec["token"] + "\n", encoding="utf-8")
        if spec["output_path"].exists():
            spec["output_path"].unlink()
        if spec["reply_path"].exists():
            spec["reply_path"].unlink()
        if spec["thread_read_path"].exists():
            spec["thread_read_path"].unlink()
    for artifact in [RAW_MESSAGES_PATH, STDERR_LOG_PATH, EVAL_PATH, REPORT_PATH]:
        if artifact.exists():
            artifact.unlink()


def sandbox_policy() -> dict[str, Any]:
    shared_abs = str(SHARED_DIR.resolve())
    return {
        "type": "workspaceWrite",
        "writableRoots": [shared_abs],
        "readOnlyAccess": {
            "type": "restricted",
            "includePlatformDefaults": True,
            "readableRoots": [shared_abs],
        },
        "networkAccess": False,
        "excludeTmpdirEnvVar": False,
        "excludeSlashTmp": False,
    }


def start_thread(
    server: JsonRpcAppServer,
    *,
    cwd: str,
    developer_instructions: str,
    model: str | None,
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "cwd": cwd,
        "approvalPolicy": "never",
        "sandbox": "workspace-write",
        "developerInstructions": developer_instructions,
    }
    if model is not None:
        params["model"] = model
    return server.send_request("thread/start", params, timeout=300.0)


def build_prompt(spec: dict[str, Any]) -> str:
    rel_input = f"shared/{spec['input_path'].name}"
    rel_output = f"shared/{spec['output_path'].name}"
    return "\n".join(
        [
            "다음 규칙을 정확히 지켜라.",
            "",
            f"1) `{rel_input}` 를 읽어라.",
            "2) 읽은 값을 바탕으로 6개 항목의 짧은 bullet summary 를 내부적으로 구성하라.",
            f"3) `{rel_output}` 파일에 정확히 `{spec['token']}` 을 써라.",
            "4) 최종 답변은 정확히 한 줄 JSON만 출력하라.",
            "{",
            f'  "agent": "{spec["agent"]}",',
            '  "input_text": "읽은 내용",',
            '  "write_ok": true 또는 false',
            "}",
        ]
    )


def output_schema(spec: dict[str, Any]) -> dict[str, Any]:
    return build_output_schema(
        {
            "agent": {"type": "string", "const": spec["agent"]},
            "input_text": {"type": "string"},
            "write_ok": {"type": "boolean"},
        },
        ["agent", "input_text", "write_ok"],
    )


def start_turn(
    server: JsonRpcAppServer,
    *,
    thread_id: str,
    prompt: str,
    cwd: str,
    sandbox: dict[str, Any],
    schema: dict[str, Any],
) -> str:
    result = server.send_request(
        "turn/start",
        {
            "threadId": thread_id,
            "input": [{"type": "text", "text": prompt, "text_elements": []}],
            "cwd": cwd,
            "approvalPolicy": "never",
            "sandboxPolicy": sandbox,
            "outputSchema": schema,
        },
        timeout=300.0,
    )
    return result["turn"]["id"]


def extract_turn_id(event: dict[str, Any]) -> str | None:
    method = event.get("method")
    params = event.get("params", {})
    if method in {"turn/started", "turn/completed"}:
        return params.get("turn", {}).get("id")
    if method in {"item/started", "item/completed", "item/agentMessage/delta"}:
        return params.get("turnId")
    if method == "codex/event/task_started":
        return params.get("id")
    if method == "codex/event/task_complete":
        return params.get("id")
    if method == "codex/event/agent_message":
        return params.get("id")
    if method == "codex/event/agent_message_delta":
        return params.get("id")
    if method == "codex/event/agent_message_content_delta":
        return params.get("id")
    if method == "codex/event/item_started":
        return params.get("msg", {}).get("turn_id")
    if method == "codex/event/item_completed":
        return params.get("msg", {}).get("turn_id")
    return None


def parse_json_reply(text: str) -> tuple[bool, dict[str, Any] | None]:
    stripped = text.strip()
    if not stripped:
        return False, None
    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError:
        return False, None
    if not isinstance(payload, dict):
        return False, None
    return True, payload


def extract_turn_from_history(thread_payload: dict[str, Any], turn_id: str) -> dict[str, Any] | None:
    thread = thread_payload.get("thread", thread_payload)
    for turn in thread.get("turns", []):
        if turn.get("id") == turn_id:
            return turn
    return None


def extract_reply_from_history(turn_payload: dict[str, Any] | None) -> str:
    if not turn_payload:
        return ""
    for item in reversed(turn_payload.get("items", [])):
        if item.get("type") == "agentMessage" and item.get("phase") == "final_answer":
            text = item.get("text", "")
            if isinstance(text, str):
                return text
    return ""


def format_ts(ts: float | None) -> str:
    if ts is None:
        return ""
    local = time.localtime(ts)
    return time.strftime("%Y-%m-%d %H:%M:%S", local) + f".{int((ts % 1) * 1000):03d}"


def check_history_contamination(spec: dict[str, Any], thread_payload: dict[str, Any]) -> tuple[bool, list[str]]:
    serialized = json.dumps(thread_payload, ensure_ascii=False, sort_keys=True)
    notes: list[str] = []
    for other in THREADS:
        if other["index"] == spec["index"]:
            continue
        if other["thread_name"] in serialized:
            notes.append(f"other_thread_name:{other['thread_name']}")
        if other["token"] in serialized:
            notes.append(f"other_token:{other['token']}")
        if f'"agent":"{other["agent"]}"' in serialized or f'"agent": "{other["agent"]}"' in serialized:
            notes.append(f"other_agent:{other['agent']}")
    return (not notes, notes)


def detect_starvation(states: dict[int, dict[str, Any]]) -> bool:
    timeouts = [index for index, state in states.items() if state["timeout"]]
    completed_durations = [
        state["completed_at"] - state["started_at"]
        for state in states.values()
        if state["completed"] and state["started_at"] is not None and state["completed_at"] is not None
    ]
    if len(timeouts) == 1 and len(completed_durations) >= 2:
        return True
    if len(completed_durations) < 4:
        return False
    slowest = max(completed_durations)
    fastest = min(completed_durations)
    median = sorted(completed_durations)[len(completed_durations) // 2]
    return slowest > fastest + 45.0 and slowest > (median * 2.0)


def build_report(
    summary: dict[str, Any],
    states: dict[int, dict[str, Any]],
    sandbox: dict[str, Any],
) -> str:
    lines = [
        "# CONCURRENCY STABILITY REPORT",
        "",
        "## 실험 목적",
        "",
        "- long-lived app-server 1개에서 4개 turn 을 먼저 모두 시작한 뒤 completion, structured reply, host-side write 안정성을 검증한다.",
        "- 이번 실험은 role/style 이 아니라 event interleaving, starvation, completion 안정성을 본다.",
        "",
        "## 공통 sandbox 요약",
        "",
        f"- writableRoots: `{sandbox['writableRoots']}`",
        f"- readableRoots: `{sandbox['readOnlyAccess']['readableRoots']}`",
        f"- includePlatformDefaults: `{sandbox['readOnlyAccess']['includePlatformDefaults']}`",
        f"- networkAccess: `{sandbox['networkAccess']}`",
        "",
        "## 4개 turn 시작/완료 시간표",
        "",
    ]
    for index in range(1, 5):
        state = states[index]
        lines.append(
            f"- Turn {index}: started_at=`{format_ts(state['started_at'])}`, "
            f"first_event_at=`{format_ts(state['first_event_at'])}`, "
            f"completed_at=`{format_ts(state['completed_at'])}`, "
            f"timeout=`{state['timeout']}`"
        )
    lines.extend(["", "## 4개 reply 원문", ""])
    for spec in THREADS:
        state = states[spec["index"]]
        lines.extend(
            [
                f"### Turn {spec['index']}",
                "",
                "```json",
                state["raw_reply"].strip(),
                "```",
                "",
            ]
        )
    lines.extend(["## host-side output verification 결과", ""])
    for spec in THREADS:
        index = spec["index"]
        lines.append(
            f"- Output {index}: exists=`{states[index]['output_exists']}`, "
            f"content_ok=`{summary[f'output_{index}_content_ok']}`"
        )
    lines.extend(
        [
            "",
            "## event interleaving 여부",
            "",
            f"- event_interleaving_observed: `{summary['event_interleaving_observed']}`",
            "",
            "## starvation 여부",
            "",
            f"- starvation_suspected: `{summary['starvation_suspected']}`",
            "",
            "## 최종 결론",
            "",
            f"- pass: `{summary['pass']}`",
            f"- blocked: `{summary['blocked']}`",
        ]
    )
    if summary["notes"]:
        lines.extend(["", "## notes", ""])
        lines.extend(f"- {note}" for note in summary["notes"])
    return "\n".join(lines) + "\n"


def main() -> int:
    reset_fixture()
    root_abs = str(LAB_ROOT.resolve())
    sandbox = sandbox_policy()

    summary: dict[str, Any] = {
        "pass": False,
        "blocked": False,
        "thread_1_id": None,
        "thread_2_id": None,
        "thread_3_id": None,
        "thread_4_id": None,
        "turn_1_id": None,
        "turn_2_id": None,
        "turn_3_id": None,
        "turn_4_id": None,
        "turn_1_completed": False,
        "turn_2_completed": False,
        "turn_3_completed": False,
        "turn_4_completed": False,
        "turn_1_timeout": False,
        "turn_2_timeout": False,
        "turn_3_timeout": False,
        "turn_4_timeout": False,
        "turn_1_json_ok": False,
        "turn_2_json_ok": False,
        "turn_3_json_ok": False,
        "turn_4_json_ok": False,
        "turn_1_input_text": "",
        "turn_2_input_text": "",
        "turn_3_input_text": "",
        "turn_4_input_text": "",
        "turn_1_write_ok": False,
        "turn_2_write_ok": False,
        "turn_3_write_ok": False,
        "turn_4_write_ok": False,
        "output_1_content_ok": False,
        "output_2_content_ok": False,
        "output_3_content_ok": False,
        "output_4_content_ok": False,
        "event_interleaving_observed": False,
        "starvation_suspected": False,
        "history_cross_contamination_found": False,
        "notes": [],
    }

    states: dict[int, dict[str, Any]] = {
        spec["index"]: {
            "thread_id": "",
            "turn_id": "",
            "started_at": None,
            "first_event_at": None,
            "completed_at": None,
            "completed": False,
            "timeout": False,
            "raw_reply": "",
            "json_ok": False,
            "payload": None,
            "output_exists": False,
            "event_count": 0,
        }
        for spec in THREADS
    }

    server = JsonRpcAppServer(RAW_MESSAGES_PATH, STDERR_LOG_PATH)
    try:
        try:
            server.initialize()
            canonical_model: str | None = None
            for spec in THREADS:
                started = start_thread(
                    server,
                    cwd=root_abs,
                    developer_instructions=DEVELOPER_INSTRUCTIONS,
                    model=canonical_model,
                )
                thread_id = started["thread"]["id"]
                if canonical_model is None:
                    canonical_model = started.get("model")
                states[spec["index"]]["thread_id"] = thread_id
                summary[f"thread_{spec['index']}_id"] = thread_id
                server.thread_set_name(thread_id, spec["thread_name"])
        except Exception as error:
            summary["blocked"] = True
            summary["notes"].append(f"startup_failed:{error}")
            write_json(EVAL_PATH, summary)
            write_text(REPORT_PATH, build_report(summary, states, sandbox))
            print(json.dumps(summary, ensure_ascii=False, indent=2))
            return 1

        for spec in THREADS:
            try:
                turn_id = start_turn(
                    server,
                    thread_id=states[spec["index"]]["thread_id"],
                    prompt=build_prompt(spec),
                    cwd=root_abs,
                    sandbox=sandbox,
                    schema=output_schema(spec),
                )
                states[spec["index"]]["turn_id"] = turn_id
                states[spec["index"]]["started_at"] = time.time()
                summary[f"turn_{spec['index']}_id"] = turn_id
            except Exception as error:
                summary["notes"].append(f"turn_{spec['index']}_start_failed:{error}")
                summary["blocked"] = True

        if any(not states[index]["turn_id"] for index in states):
            for spec in THREADS:
                write_text(spec["reply_path"], "")
                write_json(spec["thread_read_path"], {"error": "turn_not_started"})
            write_json(EVAL_PATH, summary)
            write_text(REPORT_PATH, build_report(summary, states, sandbox))
            print(json.dumps(summary, ensure_ascii=False, indent=2))
            return 1

        deadline = time.time() + TURN_TIMEOUT_SECONDS
        last_relevant_turn: str | None = None
        while time.time() < deadline and not all(state["completed"] for state in states.values()):
            wait_time = max(0.1, min(1.0, deadline - time.time()))
            try:
                event = server._events.get(timeout=wait_time)
            except Empty:
                continue
            turn_id = extract_turn_id(event)
            if not turn_id:
                continue

            matched_index: int | None = None
            for index, state in states.items():
                if state["turn_id"] == turn_id:
                    matched_index = index
                    break
            if matched_index is None:
                continue

            state = states[matched_index]
            now = time.time()
            if state["first_event_at"] is None:
                state["first_event_at"] = now
            state["event_count"] += 1

            active_count = sum(1 for item in states.values() if item["completed"] is False)
            if last_relevant_turn and last_relevant_turn != turn_id and active_count > 1:
                summary["event_interleaving_observed"] = True
            last_relevant_turn = turn_id

            method = event.get("method")
            params = event.get("params", {})

            if method == "item/completed":
                item = params.get("item", {})
                if item.get("type") == "agentMessage":
                    text = item.get("text", "")
                    if isinstance(text, str) and text:
                        state["raw_reply"] = text

            if method == "codex/event/task_complete" and not state["raw_reply"]:
                last_message = params.get("msg", {}).get("last_agent_message", "")
                if isinstance(last_message, str) and last_message:
                    state["raw_reply"] = last_message

            if method == "turn/completed":
                turn_info = params.get("turn", {})
                if turn_info.get("status") == "completed":
                    state["completed"] = True
                    state["completed_at"] = now
                else:
                    summary["notes"].append(f"turn_{matched_index}_status:{turn_info.get('status')}")

        for spec in THREADS:
            index = spec["index"]
            if not states[index]["completed"]:
                states[index]["timeout"] = True
                summary[f"turn_{index}_timeout"] = True
                summary["notes"].append(f"turn_{index}_timeout")

        thread_reads: dict[int, dict[str, Any]] = {}
        for spec in THREADS:
            index = spec["index"]
            try:
                thread_payload = server.thread_read(states[index]["thread_id"])
                thread_reads[index] = thread_payload
                write_json(spec["thread_read_path"], thread_payload)
            except Exception as error:
                thread_reads[index] = {"error": str(error)}
                write_json(spec["thread_read_path"], thread_reads[index])
                summary["notes"].append(f"thread_{index}_read_failed:{error}")
                summary["blocked"] = True

        for spec in THREADS:
            index = spec["index"]
            history_payload = thread_reads.get(index, {})
            history_turn = extract_turn_from_history(history_payload, states[index]["turn_id"])
            if not states[index]["raw_reply"]:
                states[index]["raw_reply"] = extract_reply_from_history(history_turn)
            if history_turn and history_turn.get("status") == "completed" and not states[index]["completed"]:
                states[index]["completed"] = True
                states[index]["completed_at"] = time.time()
                states[index]["timeout"] = False
                summary[f"turn_{index}_timeout"] = False
                summary["notes"].append(f"turn_{index}_completed_recovered_from_thread_read")

            write_text(spec["reply_path"], states[index]["raw_reply"])

            json_ok, payload = parse_json_reply(states[index]["raw_reply"])
            states[index]["json_ok"] = json_ok
            states[index]["payload"] = payload
            summary[f"turn_{index}_completed"] = states[index]["completed"]
            summary[f"turn_{index}_json_ok"] = json_ok

            if payload is not None:
                input_text = str(payload.get("input_text", "")).strip()
                write_ok = bool(payload.get("write_ok"))
                summary[f"turn_{index}_input_text"] = input_text
                summary[f"turn_{index}_write_ok"] = write_ok
                expected = spec["token"]
                if input_text != expected:
                    summary["notes"].append(f"turn_{index}_unexpected_input_text:{input_text}")
                other_tokens = [other["token"] for other in THREADS if other["index"] != index and other["token"] in states[index]["raw_reply"]]
                if other_tokens:
                    summary["notes"].append(f"turn_{index}_reply_other_tokens:{','.join(other_tokens)}")

            states[index]["output_exists"] = spec["output_path"].exists()
            if states[index]["output_exists"]:
                content = spec["output_path"].read_text(encoding="utf-8").strip()
                summary[f"output_{index}_content_ok"] = content == spec["token"]
            if history_payload:
                ok, notes = check_history_contamination(spec, history_payload)
                if not ok:
                    summary["history_cross_contamination_found"] = True
                    summary["notes"].extend(f"thread_{index}_{note}" for note in notes)

        summary["starvation_suspected"] = detect_starvation(states)
        summary["pass"] = (
            summary["blocked"] is False
            and all(states[index]["turn_id"] for index in states)
            and all(summary[f"turn_{index}_completed"] for index in range(1, 5))
            and all(summary[f"turn_{index}_json_ok"] for index in range(1, 5))
            and all(summary[f"output_{index}_content_ok"] for index in range(1, 5))
            and all(summary[f"turn_{index}_input_text"] == THREADS[index - 1]["token"] for index in range(1, 5))
            and summary["history_cross_contamination_found"] is False
            and not any(f"turn_{index}_reply_other_tokens" in note for index in range(1, 5) for note in summary["notes"])
        )
    finally:
        server.close()

    write_json(EVAL_PATH, summary)
    write_text(REPORT_PATH, build_report(summary, states, sandbox))
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if summary["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
