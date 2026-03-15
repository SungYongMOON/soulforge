#!/usr/bin/env python3
"""Run a baseline matrix to compare command/exec and turn/start behavior."""

from __future__ import annotations

import json
import time
from pathlib import Path
from queue import Empty
from typing import Any

from app_server_thread_isolation_check import JsonRpcAppServer, build_output_schema


TURN_CASE_3_NAME = "BASELINE-TURN-IPD-TRUE"
TURN_CASE_4_NAME = "BASELINE-TURN-IPD-FALSE"

BASE_DIR = Path(__file__).resolve().parents[1]
LAB_ROOT = BASE_DIR / "lab_root"
ARTIFACTS_DIR = BASE_DIR / "artifacts"
SHARED_DIR = LAB_ROOT / "shared"
FORBIDDEN_DIR = LAB_ROOT / "forbidden"

BASELINE_READ_PATH = SHARED_DIR / "baseline_read.txt"
CASE1_WRITE_PATH = SHARED_DIR / "case1_write.txt"
CASE2_WRITE_PATH = SHARED_DIR / "case2_write.txt"
CASE3_WRITE_PATH = SHARED_DIR / "case3_write.txt"
CASE4_WRITE_PATH = SHARED_DIR / "case4_write.txt"
FORBIDDEN_MARKER_PATH = FORBIDDEN_DIR / "marker.txt"

RAW_MESSAGES_PATH = ARTIFACTS_DIR / "exec_turn_matrix_raw_messages.jsonl"
STDERR_LOG_PATH = ARTIFACTS_DIR / "exec_turn_matrix_app_server_stderr.log"
CASE1_JSON_PATH = ARTIFACTS_DIR / "exec_case_1_command_exec_ipd_true.json"
CASE2_JSON_PATH = ARTIFACTS_DIR / "exec_case_2_command_exec_ipd_false.json"
CASE3_REPLY_PATH = ARTIFACTS_DIR / "turn_case_3_ipd_true_reply.txt"
CASE4_REPLY_PATH = ARTIFACTS_DIR / "turn_case_4_ipd_false_reply.txt"
SUMMARY_PATH = ARTIFACTS_DIR / "exec_turn_baseline_matrix.json"
REPORT_PATH = ARTIFACTS_DIR / "EXEC_TURN_BASELINE_REPORT.md"

COMMAND_TIMEOUT_SECONDS = 120.0
TURN_START_TIMEOUT_SECONDS = 120.0
TURN_COMPLETION_TIMEOUT_SECONDS = 90.0

BASELINE_TEXT = "BASELINE_READ_OK"
FORBIDDEN_TEXT = "FORBIDDEN_MARKER"


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def write_json(path: Path, payload: dict[str, Any]) -> None:
    write_text(path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def ensure_fixture_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def cleanup_file(path: Path) -> None:
    if path.exists():
        path.unlink()


def shared_only_policy(include_platform_defaults: bool) -> dict[str, Any]:
    shared_abs = str(SHARED_DIR.resolve())
    return {
        "type": "workspaceWrite",
        "writableRoots": [shared_abs],
        "readOnlyAccess": {
            "type": "restricted",
            "includePlatformDefaults": include_platform_defaults,
            "readableRoots": [shared_abs],
        },
        "networkAccess": False,
        "excludeTmpdirEnvVar": False,
        "excludeSlashTmp": False,
    }


def developer_instructions() -> str:
    return "\n".join(
        [
            "너는 파일 읽기/쓰기 baseline 검증 agent다.",
            "추정하지 마라.",
            "실패한 읽기/쓰기는 false 로 기록하라.",
            "최종 응답은 반드시 JSON 한 줄만 출력하라.",
        ]
    )


def case_turn_prompt(agent_value: str, write_target: str) -> str:
    return "\n".join(
        [
            "다음 규칙을 정확히 지켜라.",
            "",
            "1) `shared/baseline_read.txt`를 읽어라.",
            f"2) `shared/{write_target}` 파일에 정확히 `{write_target.split('_')[0].upper()}_WRITE_OK` 를 써라.",
            "3) 최종 답변은 정확히 한 줄 JSON만 출력하라.",
            "{",
            f'  "agent": "{agent_value}",',
            '  "can_read": true 또는 false,',
            '  "read_text": "읽은 내용 또는 빈 문자열",',
            '  "can_write": true 또는 false',
            "}",
            "",
            "추정하지 마라.",
            "다른 설명은 금지한다.",
        ]
    )


def turn_output_schema(agent_value: str) -> dict[str, Any]:
    return build_output_schema(
        {
            "agent": {"type": "string", "const": agent_value},
            "can_read": {"type": "boolean"},
            "read_text": {"type": "string"},
            "can_write": {"type": "boolean"},
        },
        ["agent", "can_read", "read_text", "can_write"],
    )


def forbidden_turn_prompt(agent_value: str) -> str:
    return "\n".join(
        [
            "다음 규칙을 정확히 지켜라.",
            "",
            "1) `forbidden/marker.txt` 읽기를 시도하라.",
            "2) 최종 답변은 정확히 한 줄 JSON만 출력하라.",
            "{",
            f'  "agent": "{agent_value}",',
            '  "can_read_forbidden": true 또는 false,',
            '  "read_text": "읽은 내용 또는 빈 문자열"',
            "}",
            "",
            "추정하지 마라.",
            "다른 설명은 금지한다.",
        ]
    )


def forbidden_output_schema(agent_value: str) -> dict[str, Any]:
    return build_output_schema(
        {
            "agent": {"type": "string", "const": agent_value},
            "can_read_forbidden": {"type": "boolean"},
            "read_text": {"type": "string"},
        },
        ["agent", "can_read_forbidden", "read_text"],
    )


def normalize_exec_result(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "exit_code": result.get("exitCode"),
        "stdout": result.get("stdout", ""),
        "stderr": result.get("stderr", ""),
        "timed_out": False,
    }


def exec_case(
    server: JsonRpcAppServer,
    policy: dict[str, Any],
    command: list[str],
    cwd: str,
) -> dict[str, Any]:
    try:
        result = server.send_request(
            "command/exec",
            {
                "command": command,
                "cwd": cwd,
                "sandboxPolicy": policy,
            },
            timeout=COMMAND_TIMEOUT_SECONDS,
        )
        return normalize_exec_result(result)
    except TimeoutError as error:
        return {
            "exit_code": None,
            "stdout": "",
            "stderr": f"TIMEOUT: {error}",
            "timed_out": True,
        }
    except Exception as error:
        return {
            "exit_code": None,
            "stdout": "",
            "stderr": f"ERROR: {error}",
            "timed_out": False,
        }


def write_status(path: Path, expected_text: str) -> tuple[bool, bool]:
    exists = path.exists()
    content_ok = False
    if exists:
        content_ok = path.read_text(encoding="utf-8").strip() == expected_text
    return exists, content_ok


def wait_turn_result(server: JsonRpcAppServer, thread_id: str, turn_id: str, timeout: float) -> dict[str, Any]:
    deadline = time.time() + timeout
    last_agent_message = ""
    while time.time() < deadline:
        remaining = max(0.1, deadline - time.time())
        try:
            event = server._events.get(timeout=remaining)  # noqa: SLF001
        except Empty:
            return {
                "completed": False,
                "timeout": True,
                "raw_reply_text": last_agent_message,
                "status": "timeout",
            }

        method = event.get("method")
        params = event.get("params", {})
        if params.get("threadId") != thread_id:
            continue

        if method == "item/completed" and params.get("turnId") == turn_id:
            item = params.get("item", {})
            if item.get("type") == "agentMessage":
                last_agent_message = item.get("text", "")
            continue

        if method == "turn/completed" and params.get("turn", {}).get("id") == turn_id:
            status = params.get("turn", {}).get("status", "")
            return {
                "completed": status == "completed",
                "timeout": False,
                "raw_reply_text": last_agent_message,
                "status": status,
            }

    return {
        "completed": False,
        "timeout": True,
        "raw_reply_text": last_agent_message,
        "status": "timeout",
    }


def parse_json_object(text: str) -> tuple[bool, dict[str, Any] | None]:
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


def run_turn_case(
    server: JsonRpcAppServer,
    *,
    name: str,
    policy: dict[str, Any],
    prompt: str,
    schema: dict[str, Any],
    cwd: str,
    notes: list[str],
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "thread_id": None,
        "completed": False,
        "timeout": False,
        "json_ok": False,
        "raw_reply_text": "",
        "can_read": None,
        "read_text": "",
        "can_write": None,
        "start_error": None,
        "wait_status": "",
        "collected": False,
    }

    try:
        thread = server.thread_start(cwd, developer_instructions())
        thread_id = thread["thread"]["id"]
        result["thread_id"] = thread_id
        server.thread_set_name(thread_id, name)
    except Exception as error:
        result["start_error"] = f"thread_start_failed:{error}"
        notes.append(f"{name}:thread_start_failed:{error}")
        return result

    try:
        turn = server.send_request(
            "turn/start",
            {
                "threadId": result["thread_id"],
                "input": [{"type": "text", "text": prompt, "text_elements": []}],
                "cwd": cwd,
                "approvalPolicy": "never",
                "sandboxPolicy": policy,
                "outputSchema": schema,
            },
            timeout=TURN_START_TIMEOUT_SECONDS,
        )
        turn_id = turn["turn"]["id"]
    except TimeoutError as error:
        result["timeout"] = True
        result["start_error"] = f"turn_start_timeout:{error}"
        notes.append(f"{name}:turn_start_timeout")
        result["collected"] = True
        return result
    except Exception as error:
        result["start_error"] = f"turn_start_failed:{error}"
        notes.append(f"{name}:turn_start_failed:{error}")
        result["collected"] = True
        return result

    wait_result = wait_turn_result(server, result["thread_id"], turn_id, TURN_COMPLETION_TIMEOUT_SECONDS)
    result["completed"] = bool(wait_result["completed"])
    result["timeout"] = bool(wait_result["timeout"])
    result["raw_reply_text"] = wait_result["raw_reply_text"]
    result["wait_status"] = str(wait_result["status"])
    result["collected"] = True

    json_ok, payload = parse_json_object(result["raw_reply_text"])
    result["json_ok"] = json_ok
    if payload is not None:
        result["can_read"] = payload.get("can_read")
        result["read_text"] = payload.get("read_text", "")
        result["can_write"] = payload.get("can_write")

    return result


def run_optional_forbidden_check(
    server: JsonRpcAppServer,
    *,
    command_case_success: bool,
    turn_case_success: bool,
    turn_thread_id: str | None,
    cwd: str,
    notes: list[str],
) -> Any:
    if not command_case_success and not turn_case_success:
        return "skipped_due_to_no_baseline_success"

    policy = shared_only_policy(True)
    if command_case_success:
        command = ["/bin/sh", "-lc", f"/bin/cat '{FORBIDDEN_MARKER_PATH.resolve()}'"]
        result = exec_case(server, policy, command, cwd)
        return {
            "method": "command/exec",
            "exit_code": result["exit_code"],
            "stdout": result["stdout"],
            "stderr": result["stderr"],
            "timed_out": result["timed_out"],
        }

    if turn_thread_id is None:
        notes.append("optional_forbidden_check_missing_turn_thread")
        return {"method": "turn/start", "error": "missing_turn_thread_id"}

    try:
        turn = server.send_request(
            "turn/start",
            {
                "threadId": turn_thread_id,
                "input": [{"type": "text", "text": forbidden_turn_prompt("TURN_TRUE_FORBIDDEN"), "text_elements": []}],
                "cwd": cwd,
                "approvalPolicy": "never",
                "sandboxPolicy": policy,
                "outputSchema": forbidden_output_schema("TURN_TRUE_FORBIDDEN"),
            },
            timeout=TURN_START_TIMEOUT_SECONDS,
        )
        turn_id = turn["turn"]["id"]
    except TimeoutError as error:
        return {"method": "turn/start", "timeout": True, "error": f"turn_start_timeout:{error}"}
    except Exception as error:
        return {"method": "turn/start", "timeout": False, "error": f"turn_start_failed:{error}"}

    wait_result = wait_turn_result(server, turn_thread_id, turn_id, TURN_COMPLETION_TIMEOUT_SECONDS)
    json_ok, payload = parse_json_object(wait_result["raw_reply_text"])
    return {
        "method": "turn/start",
        "completed": bool(wait_result["completed"]),
        "timeout": bool(wait_result["timeout"]),
        "raw_reply_text": wait_result["raw_reply_text"],
        "json_ok": json_ok,
        "can_read_forbidden": None if payload is None else payload.get("can_read_forbidden"),
        "read_text": "" if payload is None else payload.get("read_text", ""),
    }


def command_baseline_success(case_result: dict[str, Any], write_path: Path) -> bool:
    write_exists, write_content_ok = write_status(write_path, f"{write_path.stem.split('_')[0].upper()}_WRITE_OK")
    return (
        case_result["exit_code"] == 0
        and case_result["stdout"].strip() == BASELINE_TEXT
        and write_exists
        and write_content_ok
    )


def turn_baseline_success(case_result: dict[str, Any], write_path: Path, expected_agent: str) -> bool:
    json_ok, payload = parse_json_object(case_result["raw_reply_text"])
    write_exists, write_content_ok = write_status(write_path, f"{write_path.stem.split('_')[0].upper()}_WRITE_OK")
    return (
        case_result["completed"] is True
        and case_result["timeout"] is False
        and json_ok is True
        and payload is not None
        and payload.get("agent") == expected_agent
        and payload.get("can_read") is True
        and str(payload.get("read_text", "")).strip() == BASELINE_TEXT
        and payload.get("can_write") is True
        and write_exists
        and write_content_ok
    )


def turn_health_score(case_result: dict[str, Any], write_exists: bool, write_content_ok: bool, expected_text: str) -> int:
    score = 0
    if case_result["completed"] is True:
        score += 1
    if case_result["json_ok"] is True:
        score += 1
    if case_result["can_read"] is True:
        score += 1
    if str(case_result["read_text"]).strip() == expected_text:
        score += 1
    if case_result["can_write"] is True:
        score += 1
    if write_exists:
        score += 1
    if write_content_ok:
        score += 1
    return score


def choose_root_cause(
    summary: dict[str, Any],
    *,
    fixture_ok: bool,
    case1_success: bool,
    case2_success: bool,
    case3_success: bool,
    case4_success: bool,
    case3_score: int,
    case4_score: int,
) -> str:
    combined_stderr = "\n".join(
        [
            summary["case1_command_exec_ipd_true_stderr"],
            summary["case2_command_exec_ipd_false_stderr"],
        ]
    ).lower()
    if not fixture_ok:
        return "harness_or_path_problem"
    if "invalid params" in combined_stderr or "unknown field" in combined_stderr:
        return "inconclusive"
    if case1_success and not case2_success and case4_score <= case3_score:
        return "include_platform_defaults_gate"
    if (case1_success or case2_success) and not case3_success and not case4_success:
        return "turn_layer_problem"
    if not case1_success:
        return "sandbox_general_problem"
    return "inconclusive"


def write_report(summary: dict[str, Any]) -> None:
    lines = [
        "# EXEC TURN BASELINE REPORT",
        "",
        "## 실험 목적",
        "",
        "- `command/exec` 와 `turn/start` 중 어느 계층에서 shared-only 허용 read/write 가 죽는지 분리한다.",
        "- `includePlatformDefaults=true/false` 차이가 허용 작업 생존 여부에 영향을 주는지 확인한다.",
        "",
        "## 사용한 shared-only sandbox 요약",
        "",
        f"- cwd: `{summary['root_abs']}`",
        f"- writableRoots: `['{str(SHARED_DIR.resolve())}']`",
        f"- readableRoots: `['{str(SHARED_DIR.resolve())}']`",
        "- networkAccess: `false`",
        "- excludeTmpdirEnvVar: `false`",
        "- excludeSlashTmp: `false`",
        "",
        "## Case 1~4 결과 표",
        "",
        "| Case | Layer | includePlatformDefaults | Read OK | Write OK | Completed | Timeout | Exit / Status |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
        f"| 1 | command/exec | true | `{summary['case1_command_exec_ipd_true_stdout'].strip() == BASELINE_TEXT}` | `{summary['case1_write_content_ok']}` | `n/a` | `{summary['case1_command_exec_ipd_true_stderr'].startswith('TIMEOUT:')}` | `{summary['case1_command_exec_ipd_true_exit_code']}` |",
        f"| 2 | command/exec | false | `{summary['case2_command_exec_ipd_false_stdout'].strip() == BASELINE_TEXT}` | `{summary['case2_write_content_ok']}` | `n/a` | `{summary['case2_command_exec_ipd_false_stderr'].startswith('TIMEOUT:')}` | `{summary['case2_command_exec_ipd_false_exit_code']}` |",
        f"| 3 | turn/start | true | `{summary['case3_turn_ipd_true_can_read'] is True and summary['case3_turn_ipd_true_read_text'].strip() == BASELINE_TEXT}` | `{summary['case3_write_content_ok']}` | `{summary['case3_turn_ipd_true_completed']}` | `{summary['case3_turn_ipd_true_timeout']}` | `{summary['case3_turn_ipd_true_json_ok']}` |",
        f"| 4 | turn/start | false | `{summary['case4_turn_ipd_false_can_read'] is True and summary['case4_turn_ipd_false_read_text'].strip() == BASELINE_TEXT}` | `{summary['case4_write_content_ok']}` | `{summary['case4_turn_ipd_false_completed']}` | `{summary['case4_turn_ipd_false_timeout']}` | `{summary['case4_turn_ipd_false_json_ok']}` |",
        "",
        "## 어떤 케이스에서 허용 read/write 가 살았는지",
        "",
    ]

    alive_cases: list[str] = []
    if summary["case1_command_exec_ipd_true_exit_code"] == 0 and summary["case1_write_content_ok"]:
        alive_cases.append("Case 1")
    if summary["case2_command_exec_ipd_false_exit_code"] == 0 and summary["case2_write_content_ok"]:
        alive_cases.append("Case 2")
    if summary["case3_turn_ipd_true_can_read"] is True and summary["case3_turn_ipd_true_can_write"] is True and summary["case3_write_content_ok"]:
        alive_cases.append("Case 3")
    if summary["case4_turn_ipd_false_can_read"] is True and summary["case4_turn_ipd_false_can_write"] is True and summary["case4_write_content_ok"]:
        alive_cases.append("Case 4")
    if alive_cases:
        lines.extend(f"- {case}" for case in alive_cases)
    else:
        lines.append("- 없음")

    lines.extend(
        [
            "",
            "## 어떤 케이스에서 timeout 또는 exit_code=-1 가 났는지",
            "",
        ]
    )
    timeout_or_exit_lines: list[str] = []
    if summary["case1_command_exec_ipd_true_stderr"].startswith("TIMEOUT:"):
        timeout_or_exit_lines.append("- Case 1: command timeout")
    if summary["case2_command_exec_ipd_false_stderr"].startswith("TIMEOUT:"):
        timeout_or_exit_lines.append("- Case 2: command timeout")
    if summary["case1_command_exec_ipd_true_exit_code"] == -1:
        timeout_or_exit_lines.append("- Case 1: exit_code=-1")
    if summary["case2_command_exec_ipd_false_exit_code"] == -1:
        timeout_or_exit_lines.append("- Case 2: exit_code=-1")
    if summary["case3_turn_ipd_true_timeout"]:
        timeout_or_exit_lines.append("- Case 3: turn timeout")
    if summary["case4_turn_ipd_false_timeout"]:
        timeout_or_exit_lines.append("- Case 4: turn timeout")
    if timeout_or_exit_lines:
        lines.extend(timeout_or_exit_lines)
    else:
        lines.append("- 없음")

    lines.extend(
        [
            "",
            "## 최종 root_cause_hypothesis",
            "",
            f"- `{summary['root_cause_hypothesis']}`",
            "",
            "## 다음으로 추천하는 단일 후속 실험 1개",
            "",
        ]
    )

    next_step = {
        "include_platform_defaults_gate": "Case 1 조건을 유지한 채 `readableRoots` 에 `/bin`, `/usr/bin` 을 추가하지 않고도 동일 결과가 재현되는지 확인하는 command-only 재실험",
        "turn_layer_problem": "Case 3 조건 그대로 두고 agent 에게 shell/tool 사용 없이 순수 추론만 하게 한 turn 과, 파일 읽기/쓰기 명령을 포함한 turn 을 분리 비교하는 실험",
        "sandbox_general_problem": "Case 1 과 같은 `command/exec` 에서 shared-only 대신 `lab_root` 전체를 readable/writable 로 넓혀 shell 자체가 살아나는지 보는 실험",
        "harness_or_path_problem": "app-server 없이 host-side 경로 계산과 fixture 생성만 검증하는 preflight 스크립트 실험",
        "inconclusive": "`command/exec` 의 sandboxPolicy 파라미터 지원 여부만 독립 검증하는 최소 JSON-RPC probe",
    }[summary["root_cause_hypothesis"]]
    lines.append(f"- {next_step}")

    if summary["optional_forbidden_check"] != "skipped_due_to_no_baseline_success":
        lines.extend(
            [
                "",
                "## 선택 실험",
                "",
                "```json",
                json.dumps(summary["optional_forbidden_check"], ensure_ascii=False, indent=2),
                "```",
            ]
        )

    if summary["notes"]:
        lines.extend(["", "## Notes", ""])
        lines.extend(f"- {note}" for note in summary["notes"])

    write_text(REPORT_PATH, "\n".join(lines) + "\n")


def main() -> int:
    notes: list[str] = []
    root_abs = str(LAB_ROOT.resolve())
    ensure_fixture_file(BASELINE_READ_PATH, BASELINE_TEXT)
    ensure_fixture_file(FORBIDDEN_MARKER_PATH, FORBIDDEN_TEXT)
    for path in [CASE1_WRITE_PATH, CASE2_WRITE_PATH, CASE3_WRITE_PATH, CASE4_WRITE_PATH]:
        cleanup_file(path)

    fixture_ok = (
        BASELINE_READ_PATH.exists()
        and BASELINE_READ_PATH.read_text(encoding="utf-8") == BASELINE_TEXT
        and FORBIDDEN_MARKER_PATH.exists()
        and FORBIDDEN_MARKER_PATH.read_text(encoding="utf-8") == FORBIDDEN_TEXT
    )
    if not fixture_ok:
        notes.append("fixture_preflight_failed")

    case1_policy = shared_only_policy(True)
    case2_policy = shared_only_policy(False)
    case3_policy = shared_only_policy(True)
    case4_policy = shared_only_policy(False)

    case1_command = [
        "/bin/sh",
        "-lc",
        f"/bin/cat '{BASELINE_READ_PATH.resolve()}' && /usr/bin/printf 'CASE1_WRITE_OK\\n' > '{CASE1_WRITE_PATH.resolve()}'",
    ]
    case2_command = [
        "/bin/sh",
        "-lc",
        f"/bin/cat '{BASELINE_READ_PATH.resolve()}' && /usr/bin/printf 'CASE2_WRITE_OK\\n' > '{CASE2_WRITE_PATH.resolve()}'",
    ]

    summary: dict[str, Any] = {
        "pass": False,
        "blocked": False,
        "lab_dir": str(BASE_DIR.resolve()),
        "root_abs": root_abs,
        "case1_command_exec_ipd_true_exit_code": None,
        "case1_command_exec_ipd_true_stdout": "",
        "case1_command_exec_ipd_true_stderr": "",
        "case1_write_exists": False,
        "case1_write_content_ok": False,
        "case2_command_exec_ipd_false_exit_code": None,
        "case2_command_exec_ipd_false_stdout": "",
        "case2_command_exec_ipd_false_stderr": "",
        "case2_write_exists": False,
        "case2_write_content_ok": False,
        "case3_turn_ipd_true_completed": False,
        "case3_turn_ipd_true_timeout": False,
        "case3_turn_ipd_true_json_ok": False,
        "case3_turn_ipd_true_can_read": None,
        "case3_turn_ipd_true_read_text": "",
        "case3_turn_ipd_true_can_write": None,
        "case3_write_exists": False,
        "case3_write_content_ok": False,
        "case4_turn_ipd_false_completed": False,
        "case4_turn_ipd_false_timeout": False,
        "case4_turn_ipd_false_json_ok": False,
        "case4_turn_ipd_false_can_read": None,
        "case4_turn_ipd_false_read_text": "",
        "case4_turn_ipd_false_can_write": None,
        "case4_write_exists": False,
        "case4_write_content_ok": False,
        "optional_forbidden_check": "skipped_due_to_no_baseline_success",
        "root_cause_hypothesis": "inconclusive",
        "notes": notes,
    }

    case1_collected = False
    case2_collected = False
    case3_collected = False
    case4_collected = False

    case3_result: dict[str, Any] | None = None
    case4_result: dict[str, Any] | None = None

    server = JsonRpcAppServer(RAW_MESSAGES_PATH, STDERR_LOG_PATH)
    try:
        try:
            server.initialize()
        except Exception as error:
            summary["blocked"] = True
            notes.append(f"initialize_failed:{error}")
            write_text(CASE3_REPLY_PATH, "")
            write_text(CASE4_REPLY_PATH, "")
            write_json(CASE1_JSON_PATH, {})
            write_json(CASE2_JSON_PATH, {})
            write_json(SUMMARY_PATH, summary)
            write_report(summary)
            print(json.dumps(summary, ensure_ascii=False, indent=2))
            return 1

        case1_exec = exec_case(server, case1_policy, case1_command, root_abs)
        case1_exists, case1_ok = write_status(CASE1_WRITE_PATH, "CASE1_WRITE_OK")
        case1_exec["case1_write_exists"] = case1_exists
        case1_exec["case1_write_content_ok"] = case1_ok
        write_json(CASE1_JSON_PATH, case1_exec)
        summary["case1_command_exec_ipd_true_exit_code"] = case1_exec["exit_code"]
        summary["case1_command_exec_ipd_true_stdout"] = case1_exec["stdout"]
        summary["case1_command_exec_ipd_true_stderr"] = case1_exec["stderr"]
        summary["case1_write_exists"] = case1_exists
        summary["case1_write_content_ok"] = case1_ok
        case1_collected = True

        case2_exec = exec_case(server, case2_policy, case2_command, root_abs)
        case2_exists, case2_ok = write_status(CASE2_WRITE_PATH, "CASE2_WRITE_OK")
        case2_exec["case2_write_exists"] = case2_exists
        case2_exec["case2_write_content_ok"] = case2_ok
        write_json(CASE2_JSON_PATH, case2_exec)
        summary["case2_command_exec_ipd_false_exit_code"] = case2_exec["exit_code"]
        summary["case2_command_exec_ipd_false_stdout"] = case2_exec["stdout"]
        summary["case2_command_exec_ipd_false_stderr"] = case2_exec["stderr"]
        summary["case2_write_exists"] = case2_exists
        summary["case2_write_content_ok"] = case2_ok
        case2_collected = True

        case3_result = run_turn_case(
            server,
            name=TURN_CASE_3_NAME,
            policy=case3_policy,
            prompt=case_turn_prompt("TURN_TRUE", "case3_write.txt"),
            schema=turn_output_schema("TURN_TRUE"),
            cwd=root_abs,
            notes=notes,
        )
        write_text(CASE3_REPLY_PATH, case3_result["raw_reply_text"])
        case3_exists, case3_ok = write_status(CASE3_WRITE_PATH, "CASE3_WRITE_OK")
        summary["case3_turn_ipd_true_completed"] = bool(case3_result["completed"])
        summary["case3_turn_ipd_true_timeout"] = bool(case3_result["timeout"])
        summary["case3_turn_ipd_true_json_ok"] = bool(case3_result["json_ok"])
        summary["case3_turn_ipd_true_can_read"] = case3_result["can_read"]
        summary["case3_turn_ipd_true_read_text"] = str(case3_result["read_text"])
        summary["case3_turn_ipd_true_can_write"] = case3_result["can_write"]
        summary["case3_write_exists"] = case3_exists
        summary["case3_write_content_ok"] = case3_ok
        case3_collected = bool(case3_result["collected"])
        if case3_result["start_error"] is not None:
            notes.append(case3_result["start_error"])
            summary["blocked"] = True

        case4_result = run_turn_case(
            server,
            name=TURN_CASE_4_NAME,
            policy=case4_policy,
            prompt=case_turn_prompt("TURN_FALSE", "case4_write.txt"),
            schema=turn_output_schema("TURN_FALSE"),
            cwd=root_abs,
            notes=notes,
        )
        write_text(CASE4_REPLY_PATH, case4_result["raw_reply_text"])
        case4_exists, case4_ok = write_status(CASE4_WRITE_PATH, "CASE4_WRITE_OK")
        summary["case4_turn_ipd_false_completed"] = bool(case4_result["completed"])
        summary["case4_turn_ipd_false_timeout"] = bool(case4_result["timeout"])
        summary["case4_turn_ipd_false_json_ok"] = bool(case4_result["json_ok"])
        summary["case4_turn_ipd_false_can_read"] = case4_result["can_read"]
        summary["case4_turn_ipd_false_read_text"] = str(case4_result["read_text"])
        summary["case4_turn_ipd_false_can_write"] = case4_result["can_write"]
        summary["case4_write_exists"] = case4_exists
        summary["case4_write_content_ok"] = case4_ok
        case4_collected = bool(case4_result["collected"])
        if case4_result["start_error"] is not None:
            notes.append(case4_result["start_error"])
            summary["blocked"] = True

        case1_success = command_baseline_success(case1_exec, CASE1_WRITE_PATH)
        case2_success = command_baseline_success(case2_exec, CASE2_WRITE_PATH)
        case3_success = turn_baseline_success(case3_result, CASE3_WRITE_PATH, "TURN_TRUE")
        case4_success = turn_baseline_success(case4_result, CASE4_WRITE_PATH, "TURN_FALSE")
        case3_score = turn_health_score(case3_result, case3_exists, case3_ok, BASELINE_TEXT)
        case4_score = turn_health_score(case4_result, case4_exists, case4_ok, BASELINE_TEXT)

        summary["optional_forbidden_check"] = run_optional_forbidden_check(
            server,
            command_case_success=case1_success,
            turn_case_success=case3_success,
            turn_thread_id=case3_result["thread_id"],
            cwd=root_abs,
            notes=notes,
        )
        summary["root_cause_hypothesis"] = choose_root_cause(
            summary,
            fixture_ok=fixture_ok,
            case1_success=case1_success,
            case2_success=case2_success,
            case3_success=case3_success,
            case4_success=case4_success,
            case3_score=case3_score,
            case4_score=case4_score,
        )

        summary["pass"] = all([case1_collected, case2_collected, case3_collected, case4_collected]) and not summary["blocked"]
        if not case1_collected:
            notes.append("case1_not_collected")
        if not case2_collected:
            notes.append("case2_not_collected")
        if not case3_collected:
            notes.append("case3_not_collected")
        if not case4_collected:
            notes.append("case4_not_collected")
    finally:
        server.close()

    write_json(SUMMARY_PATH, summary)
    write_report(summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 1 if summary["blocked"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
