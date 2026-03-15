#!/usr/bin/env python3
"""Run a disposable Codex App Server thread-isolation experiment."""

from __future__ import annotations

import json
import shutil
import subprocess
import threading
import time
from pathlib import Path
from queue import Empty, Queue
from typing import Any


THREAD_A_NAME = "LAB-A"
THREAD_B_NAME = "LAB-B"
A_TOKEN = "ALPHA-731"
B_TOKEN = "BRAVO-982"

BASE_DIR = Path(__file__).resolve().parents[1]
LAB_ROOT = BASE_DIR / "lab_root"
ARTIFACTS_DIR = BASE_DIR / "artifacts"
SHARED_DIR = LAB_ROOT / "shared"
OUTPUTS_DIR = LAB_ROOT / "outputs"
RAW_MESSAGES_PATH = ARTIFACTS_DIR / "raw_messages.jsonl"
STDERR_LOG_PATH = ARTIFACTS_DIR / "app_server_stderr.log"
RESULT_SUMMARY_PATH = ARTIFACTS_DIR / "result_summary.json"
REPORT_PATH = ARTIFACTS_DIR / "REPORT.md"


def build_output_schema(properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": properties,
        "required": required,
    }


class JsonRpcAppServer:
    def __init__(self, raw_messages_path: Path, stderr_log_path: Path):
        self.raw_messages_path = raw_messages_path
        self.stderr_log_path = stderr_log_path
        self.process = subprocess.Popen(
            ["codex", "app-server"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        self._next_id = 1
        self._responses: dict[int, Queue[dict[str, Any]]] = {}
        self._events: Queue[dict[str, Any]] = Queue()
        self._raw_messages_handle = raw_messages_path.open("w", encoding="utf-8")
        self._stderr_handle = stderr_log_path.open("w", encoding="utf-8")
        self._stdout_thread = threading.Thread(target=self._read_stdout, daemon=True)
        self._stderr_thread = threading.Thread(target=self._read_stderr, daemon=True)
        self._stdout_thread.start()
        self._stderr_thread.start()

    def close(self) -> None:
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
        self._raw_messages_handle.close()
        self._stderr_handle.close()

    def _timestamp(self) -> str:
        return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime())

    def _log_message(self, direction: str, payload: dict[str, Any]) -> None:
        record = {
            "ts": self._timestamp(),
            "direction": direction,
            "payload": payload,
        }
        self._raw_messages_handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        self._raw_messages_handle.flush()

    def _read_stdout(self) -> None:
        assert self.process.stdout is not None
        for line in self.process.stdout:
            stripped = line.strip()
            if not stripped:
                continue
            try:
                payload = json.loads(stripped)
            except json.JSONDecodeError:
                self._stderr_handle.write(f"{self._timestamp()} stdout_non_json {stripped}\n")
                self._stderr_handle.flush()
                continue
            self._log_message("recv", payload)
            response_id = payload.get("id")
            if isinstance(response_id, int):
                queue = self._responses.setdefault(response_id, Queue())
                queue.put(payload)
            else:
                self._events.put(payload)

    def _read_stderr(self) -> None:
        assert self.process.stderr is not None
        for line in self.process.stderr:
            self._stderr_handle.write(line)
            self._stderr_handle.flush()

    def _send(self, payload: dict[str, Any]) -> None:
        self._log_message("send", payload)
        assert self.process.stdin is not None
        self.process.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
        self.process.stdin.flush()

    def send_request(self, method: str, params: dict[str, Any] | None = None, timeout: float = 180.0) -> dict[str, Any]:
        request_id = self._next_id
        self._next_id += 1
        queue = self._responses.setdefault(request_id, Queue())
        payload = {"method": method, "id": request_id, "params": params}
        self._send(payload)
        try:
            response = queue.get(timeout=timeout)
        except Empty as error:
            raise TimeoutError(f"Timed out waiting for response to {method}") from error
        if "error" in response:
            raise RuntimeError(f"{method} failed: {response['error']}")
        return response["result"]

    def send_notification(self, method: str, params: dict[str, Any] | None = None) -> None:
        payload: dict[str, Any] = {"method": method}
        if params is not None:
            payload["params"] = params
        self._send(payload)

    def initialize(self) -> None:
        self.send_request(
            "initialize",
            {
                "clientInfo": {
                    "name": "thread-isolation-lab",
                    "title": "Thread Isolation Lab",
                    "version": "0.1.0",
                },
                "capabilities": None,
            },
        )
        self.send_notification("initialized", {})

    def command_exec(self, command: list[str], cwd: str | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {"command": command}
        if cwd is not None:
            params["cwd"] = cwd
        return self.send_request("command/exec", params)

    def thread_start(self, cwd: str, developer_instructions: str) -> dict[str, Any]:
        return self.send_request(
            "thread/start",
            {
                "cwd": cwd,
                "approvalPolicy": "never",
                "sandbox": "workspace-write",
                "developerInstructions": developer_instructions,
                "experimentalRawEvents": False,
                "persistExtendedHistory": False,
            },
            timeout=300.0,
        )

    def thread_set_name(self, thread_id: str, name: str) -> None:
        self.send_request("thread/name/set", {"threadId": thread_id, "name": name})

    def turn_start(
        self,
        thread_id: str,
        prompt: str,
        sandbox_policy: dict[str, Any],
        output_schema: dict[str, Any],
    ) -> str:
        result = self.send_request(
            "turn/start",
            {
                "threadId": thread_id,
                "input": [{"type": "text", "text": prompt, "text_elements": []}],
                "cwd": str(LAB_ROOT.resolve()),
                "approvalPolicy": "never",
                "sandboxPolicy": sandbox_policy,
                "outputSchema": output_schema,
            },
            timeout=300.0,
        )
        return result["turn"]["id"]

    def wait_turn_completed(self, thread_id: str, turn_id: str, timeout: float = 300.0) -> str:
        deadline = time.time() + timeout
        last_agent_message = ""
        while time.time() < deadline:
            remaining = max(0.1, deadline - time.time())
            try:
                event = self._events.get(timeout=remaining)
            except Empty as error:
                raise TimeoutError(f"Timed out waiting for completion of turn {turn_id}") from error
            if event.get("method") == "item/completed":
                params = event.get("params", {})
                if params.get("threadId") == thread_id and params.get("turnId") == turn_id:
                    item = params.get("item", {})
                    if item.get("type") == "agentMessage":
                        last_agent_message = item.get("text", "")
            if event.get("method") == "turn/completed":
                params = event.get("params", {})
                if params.get("threadId") == thread_id and params.get("turn", {}).get("id") == turn_id:
                    status = params.get("turn", {}).get("status")
                    if status != "completed":
                        raise RuntimeError(f"Turn {turn_id} ended with status={status}")
                    return last_agent_message
        raise TimeoutError(f"Timed out waiting for completion of turn {turn_id}")

    def thread_read(self, thread_id: str) -> dict[str, Any]:
        result = self.send_request("thread/read", {"threadId": thread_id, "includeTurns": True}, timeout=120.0)
        return result["thread"]


def reset_lab() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    LAB_ROOT.mkdir(parents=True, exist_ok=True)
    for child in ARTIFACTS_DIR.iterdir():
        if child.name == "README.md":
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()
    for child in LAB_ROOT.iterdir():
        if child.name == "README.md":
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()
    SHARED_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    (SHARED_DIR / "root.txt").write_text("ROOT_SHARED_V1\n", encoding="utf-8")
    (SHARED_DIR / "counter.txt").write_text("0\n", encoding="utf-8")


def sandbox_policy_for_lab() -> dict[str, Any]:
    root = str(LAB_ROOT.resolve())
    return {
        "type": "workspaceWrite",
        "writableRoots": [root],
        "readOnlyAccess": {
            "type": "restricted",
            "includePlatformDefaults": True,
            "readableRoots": [root],
        },
        "networkAccess": False,
        "excludeTmpdirEnvVar": False,
        "excludeSlashTmp": False,
    }


def write_text_artifact(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def read_json_text(text: str) -> dict[str, Any]:
    return json.loads(text.strip())


def write_report(summary: dict[str, Any]) -> None:
    lines = [
        "# Codex App Server Thread Isolation Report",
        "",
        f"- Lab: `{BASE_DIR.name}`",
        f"- Root: `{summary['root_abs']}`",
        f"- Pass: `{summary['pass']}`",
        f"- Thread A: `{summary['thread_ids'].get('A', '')}` ({summary['thread_models'].get('A', '')})",
        f"- Thread B: `{summary['thread_ids'].get('B', '')}` ({summary['thread_models'].get('B', '')})",
        "",
        "## Checks",
        "",
        f"- thread_ids_different: `{summary['thread_ids_different']}`",
        f"- same_root_shared: `{summary['same_root_shared']}`",
        f"- a_can_read_root: `{summary['a_can_read_root']}`",
        f"- b_can_read_root: `{summary['b_can_read_root']}`",
        f"- b_can_see_a_counter_update: `{summary['b_can_see_a_counter_update']}`",
        f"- a_history_isolated: `{summary['a_history_isolated']}`",
        f"- b_history_isolated: `{summary['b_history_isolated']}`",
        f"- a_token_not_in_b_history: `{summary['a_token_not_in_b_history']}`",
        f"- b_token_not_in_a_history: `{summary['b_token_not_in_a_history']}`",
        "",
        "## Notes",
        "",
    ]
    if summary["notes"]:
        lines.extend(f"- {note}" for note in summary["notes"])
    else:
        lines.append("- none")
    write_text_artifact(REPORT_PATH, "\n".join(lines) + "\n")


def build_developer_instructions(agent_name: str, token: str) -> str:
    return "\n".join(
        [
            f"너는 {agent_name} 전용 agent다.",
            f"너의 private token은 {token} 이다.",
            "이 token은 절대로 어떤 파일에도 쓰지 마라.",
            "사용자가 private token을 명시적으로 요구한 경우에만 최종 답변 JSON 필드에 넣어라.",
            "다른 thread의 token을 추정하거나 발명하지 마라.",
            "허용된 파일 외에는 읽지 마라.",
        ]
    )


def validate_history(thread_payload: dict[str, Any], must_include: list[str], must_exclude: list[str]) -> tuple[bool, list[str]]:
    serialized = json.dumps(thread_payload, ensure_ascii=False)
    ok = True
    notes: list[str] = []
    for needle in must_include:
        if needle not in serialized:
            ok = False
            notes.append(f"missing:{needle}")
    for needle in must_exclude:
        if needle in serialized:
            ok = False
            notes.append(f"unexpected:{needle}")
    return ok, notes


def main() -> int:
    reset_lab()
    root_abs = str(LAB_ROOT.resolve())
    sandbox_policy = sandbox_policy_for_lab()
    summary: dict[str, Any] = {
        "pass": False,
        "root_abs": root_abs,
        "thread_ids": {},
        "thread_models": {},
        "thread_ids_different": False,
        "same_root_shared": False,
        "a_can_read_root": False,
        "b_can_read_root": False,
        "b_can_see_a_counter_update": False,
        "a_history_isolated": False,
        "b_history_isolated": False,
        "a_token_not_in_b_history": False,
        "b_token_not_in_a_history": False,
        "notes": [],
    }

    server = JsonRpcAppServer(RAW_MESSAGES_PATH, STDERR_LOG_PATH)
    try:
        server.initialize()
        root_check = server.command_exec(["/bin/sh", "-lc", "/bin/cat shared/root.txt && /bin/cat shared/counter.txt"], cwd=root_abs)
        if root_check.get("exitCode") != 0 or "ROOT_SHARED_V1" not in (root_check.get("stdout") or ""):
            summary["notes"].append("initial_root_check_failed")
            write_text_artifact(RESULT_SUMMARY_PATH, json.dumps(summary, ensure_ascii=False, indent=2))
            write_report(summary)
            print(json.dumps(summary, ensure_ascii=False, indent=2))
            return 1

        thread_a = server.thread_start(root_abs, build_developer_instructions(THREAD_A_NAME, A_TOKEN))
        thread_a_id = thread_a["thread"]["id"]
        server.thread_set_name(thread_a_id, THREAD_A_NAME)
        summary["thread_ids"]["A"] = thread_a_id
        summary["thread_models"]["A"] = thread_a["model"]

        thread_b = server.thread_start(root_abs, build_developer_instructions(THREAD_B_NAME, B_TOKEN))
        thread_b_id = thread_b["thread"]["id"]
        server.thread_set_name(thread_b_id, THREAD_B_NAME)
        summary["thread_ids"]["B"] = thread_b_id
        summary["thread_models"]["B"] = thread_b["model"]

        summary["thread_ids_different"] = thread_a_id != thread_b_id

        a1_turn_id = server.turn_start(
            thread_a_id,
            "\n".join(
                [
                    "다음 규칙을 정확히 지켜라.",
                    "",
                    "1) shared/root.txt만 읽어라.",
                    "2) outputs/a_seen.txt 파일을 만들고 정확히 아래 두 줄만 써라.",
                    "agent=A",
                    "root=<shared/root.txt의 전체 내용>",
                    "3) 최종 답변은 정확히 한 줄 JSON만 출력하라.",
                    '{"agent":"A","private_token":"ALPHA-731","root":"<shared/root.txt의 전체 내용>"}',
                    "",
                    "다른 설명은 금지한다.",
                ]
            ),
            sandbox_policy,
            build_output_schema(
                {
                    "agent": {"type": "string", "const": "A"},
                    "private_token": {"type": "string", "const": A_TOKEN},
                    "root": {"type": "string"},
                },
                ["agent", "private_token", "root"],
            ),
        )
        a1_reply = server.wait_turn_completed(thread_a_id, a1_turn_id)
        write_text_artifact(ARTIFACTS_DIR / "turn_a1_reply.txt", a1_reply)
        a1_payload = read_json_text(a1_reply)
        summary["a_can_read_root"] = a1_payload["private_token"] == A_TOKEN and a1_payload["root"].strip() == "ROOT_SHARED_V1"
        a_seen_contents = (OUTPUTS_DIR / "a_seen.txt").read_text(encoding="utf-8")
        if a_seen_contents != "agent=A\nroot=ROOT_SHARED_V1\n":
            summary["notes"].append("a_seen_file_mismatch")

        b1_turn_id = server.turn_start(
            thread_b_id,
            "\n".join(
                [
                    "다음 규칙을 정확히 지켜라.",
                    "",
                    "1) shared/root.txt만 읽어라.",
                    "2) outputs/b_seen.txt 파일을 만들고 정확히 아래 두 줄만 써라.",
                    "agent=B",
                    "root=<shared/root.txt의 전체 내용>",
                    "3) 최종 답변은 정확히 한 줄 JSON만 출력하라.",
                    '{"agent":"B","private_token":"BRAVO-982","root":"<shared/root.txt의 전체 내용>","saw_alpha":false}',
                    "",
                    "다른 설명은 금지한다.",
                ]
            ),
            sandbox_policy,
            build_output_schema(
                {
                    "agent": {"type": "string", "const": "B"},
                    "private_token": {"type": "string", "const": B_TOKEN},
                    "root": {"type": "string"},
                    "saw_alpha": {"type": "boolean", "const": False},
                },
                ["agent", "private_token", "root", "saw_alpha"],
            ),
        )
        b1_reply = server.wait_turn_completed(thread_b_id, b1_turn_id)
        write_text_artifact(ARTIFACTS_DIR / "turn_b1_reply.txt", b1_reply)
        b1_payload = read_json_text(b1_reply)
        summary["b_can_read_root"] = (
            b1_payload["private_token"] == B_TOKEN
            and b1_payload["root"].strip() == "ROOT_SHARED_V1"
            and b1_payload["saw_alpha"] is False
        )
        b_seen_contents = (OUTPUTS_DIR / "b_seen.txt").read_text(encoding="utf-8")
        if b_seen_contents != "agent=B\nroot=ROOT_SHARED_V1\n":
            summary["notes"].append("b_seen_file_mismatch")

        a2_turn_id = server.turn_start(
            thread_a_id,
            "\n".join(
                [
                    "다음 규칙을 정확히 지켜라.",
                    "",
                    "1) shared/counter.txt만 읽어라.",
                    "2) shared/counter.txt의 끝에 정확히 한 줄 `A touched` 를 추가하라.",
                    "3) 최종 답변은 정확히 한 줄 JSON만 출력하라.",
                    '{"agent":"A","private_token":"ALPHA-731","counter_updated":true}',
                    "",
                    "다른 설명은 금지한다.",
                ]
            ),
            sandbox_policy,
            build_output_schema(
                {
                    "agent": {"type": "string", "const": "A"},
                    "private_token": {"type": "string", "const": A_TOKEN},
                    "counter_updated": {"type": "boolean", "const": True},
                },
                ["agent", "private_token", "counter_updated"],
            ),
        )
        a2_reply = server.wait_turn_completed(thread_a_id, a2_turn_id)
        write_text_artifact(ARTIFACTS_DIR / "turn_a2_reply.txt", a2_reply)
        a2_payload = read_json_text(a2_reply)
        counter_contents = (SHARED_DIR / "counter.txt").read_text(encoding="utf-8")
        if a2_payload["private_token"] != A_TOKEN:
            summary["notes"].append("a2_private_token_mismatch")
        if "A touched" not in counter_contents:
            summary["notes"].append("counter_not_updated_by_a")

        b2_turn_id = server.turn_start(
            thread_b_id,
            "\n".join(
                [
                    "다음 규칙을 정확히 지켜라.",
                    "",
                    "1) shared/counter.txt만 읽어라.",
                    "2) 최종 답변은 정확히 한 줄 JSON만 출력하라.",
                    '{"agent":"B","private_token":"BRAVO-982","counter":"<shared/counter.txt의 전체 내용>","saw_alpha":false}',
                    "",
                    "다른 설명은 금지한다.",
                ]
            ),
            sandbox_policy,
            build_output_schema(
                {
                    "agent": {"type": "string", "const": "B"},
                    "private_token": {"type": "string", "const": B_TOKEN},
                    "counter": {"type": "string"},
                    "saw_alpha": {"type": "boolean", "const": False},
                },
                ["agent", "private_token", "counter", "saw_alpha"],
            ),
        )
        b2_reply = server.wait_turn_completed(thread_b_id, b2_turn_id)
        write_text_artifact(ARTIFACTS_DIR / "turn_b2_reply.txt", b2_reply)
        b2_payload = read_json_text(b2_reply)
        summary["b_can_see_a_counter_update"] = "A touched" in b2_payload["counter"]
        summary["same_root_shared"] = summary["a_can_read_root"] and summary["b_can_read_root"] and summary["b_can_see_a_counter_update"]

        thread_a_read = server.thread_read(thread_a_id)
        thread_b_read = server.thread_read(thread_b_id)
        write_text_artifact(ARTIFACTS_DIR / "thread_a_read.json", json.dumps(thread_a_read, ensure_ascii=False, indent=2))
        write_text_artifact(ARTIFACTS_DIR / "thread_b_read.json", json.dumps(thread_b_read, ensure_ascii=False, indent=2))

        a_ok, a_notes = validate_history(
            thread_a_read,
            must_include=["shared/root.txt", "shared/counter.txt", A_TOKEN],
            must_exclude=[B_TOKEN],
        )
        b_ok, b_notes = validate_history(
            thread_b_read,
            must_include=["shared/root.txt", "shared/counter.txt", B_TOKEN],
            must_exclude=[A_TOKEN],
        )
        summary["a_history_isolated"] = a_ok
        summary["b_history_isolated"] = b_ok
        summary["a_token_not_in_b_history"] = A_TOKEN not in json.dumps(thread_b_read, ensure_ascii=False)
        summary["b_token_not_in_a_history"] = B_TOKEN not in json.dumps(thread_a_read, ensure_ascii=False)
        summary["notes"].extend(a_notes)
        summary["notes"].extend(b_notes)

        checks = [
            summary["thread_ids_different"],
            summary["same_root_shared"],
            summary["a_history_isolated"],
            summary["b_history_isolated"],
            summary["a_token_not_in_b_history"],
            summary["b_token_not_in_a_history"],
        ]
        summary["pass"] = all(checks) and not summary["notes"]
        write_text_artifact(RESULT_SUMMARY_PATH, json.dumps(summary, ensure_ascii=False, indent=2))
        write_report(summary)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0 if summary["pass"] else 1
    finally:
        server.close()


if __name__ == "__main__":
    raise SystemExit(main())
