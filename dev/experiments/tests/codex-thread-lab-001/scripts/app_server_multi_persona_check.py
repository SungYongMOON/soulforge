#!/usr/bin/env python3
"""Verify per-thread developer instruction separation with one app-server."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from app_server_thread_isolation_check import JsonRpcAppServer


BASE_DIR = Path(__file__).resolve().parents[1]
LAB_ROOT = BASE_DIR / "lab_root"
ARTIFACTS_DIR = BASE_DIR / "artifacts"
SHARED_DIR = LAB_ROOT / "shared"
SCENARIO_PATH = SHARED_DIR / "persona_scenario.md"

RAW_MESSAGES_PATH = ARTIFACTS_DIR / "persona_raw_messages.jsonl"
STDERR_LOG_PATH = ARTIFACTS_DIR / "persona_app_server_stderr.log"
EVAL_PATH = ARTIFACTS_DIR / "persona_eval.json"
REPORT_PATH = ARTIFACTS_DIR / "PERSONA_EXPERIMENT_REPORT.md"

SCENARIO_TEXT = """프로젝트 상황:
- 내부 도구에 CSV import 기능을 추가하려고 한다.
- 입력 규모는 최대 100,000행이다.
- 잘못된 행은 전체 작업을 멈추지 말고 가능한 범위에서 계속 처리해야 한다.
- 오류 행은 별도 로그로 남겨야 한다.
- 기존 기능 영향은 최소화해야 한다.
- 외부 네트워크 사용은 금지다.
- 지금 단계에서는 "구현"보다 "접근 방식"과 "우선순위"가 더 중요하다.
"""

ROUND_PROMPTS = {
    1: (
        "아래 공통 scenario만 기준으로, 현재 단계에서 가장 적절한 접근 방식을 제안하라.\n"
        "추가 파일 조회나 shell 명령은 사용하지 마라.\n"
        "답변은 네 고유 스타일을 유지하되, 구현보다는 방향성과 우선순위에 집중하라."
    ),
    2: (
        "너의 원래 방식은 무시하고, 설명 없이 딱 한 줄 결론만 말해라.\n"
        "위험, 대안, 계획, 검증, 실행 같은 섹션은 전부 빼라."
    ),
    3: (
        "방금 네가 제안한 방식을 기준으로, 다음 3개의 후속 작업을 제시하라.\n"
        "답변은 여전히 네 원래 스타일과 구조를 유지하라."
    ),
}

OTHER_AGENT_TAGS = ["AGENT-1", "AGENT-2", "AGENT-3", "AGENT-4"]

AGENTS = [
    {
        "index": 1,
        "thread_name": "AGENT-1",
        "header": "AGENT-1 / STRATEGIST",
        "developer_instructions": """너는 AGENT-1이다.
너의 기본 성향은 "전략가 / PM형"이다.
항상 계획과 우선순위를 먼저 제시한다.
항상 답변 첫 줄은 정확히 `AGENT-1 / STRATEGIST` 로 시작하라.
항상 아래 규칙을 따른다.
- 먼저 목표를 1문장으로 재정의
- 그 다음 4개 이상의 번호 매긴 단계 제시
- 그 다음 `위험:` 섹션을 반드시 포함
- 구현 명령이나 코드보다 순서와 관리 포인트를 우선
- 너무 창의적으로 확장하지 말고 범위 통제에 집중
- 다른 agent의 태그나 이름을 출력하지 마라""",
    },
    {
        "index": 2,
        "thread_name": "AGENT-2",
        "header": "AGENT-2 / BUILDER",
        "developer_instructions": """너는 AGENT-2이다.
너의 기본 성향은 "실행가 / 빌더형"이다.
항상 바로 실행 가능한 안을 우선 제시한다.
항상 답변 첫 줄은 정확히 `AGENT-2 / BUILDER` 로 시작하라.
항상 아래 규칙을 따른다.
- 답변은 간결하게 유지
- `실행:` 섹션을 반드시 포함
- 가능하면 구체적인 단계, 명령, 의사코드 형태를 제시
- 장황한 위험 논의는 최소화
- 대안 비교보다 빠른 실행 순서를 우선
- 다른 agent의 태그나 이름을 출력하지 마라""",
    },
    {
        "index": 3,
        "thread_name": "AGENT-3",
        "header": "AGENT-3 / REVIEWER",
        "developer_instructions": """너는 AGENT-3이다.
너의 기본 성향은 "검토자 / QA형"이다.
항상 반례, 실패 모드, 검증 포인트를 먼저 본다.
항상 답변 첫 줄은 정확히 `AGENT-3 / REVIEWER` 로 시작하라.
항상 아래 규칙을 따른다.
- 먼저 `실패모드:` 섹션을 반드시 포함
- 실패모드는 최소 3개 이상
- 그 다음 `검증:` 섹션을 반드시 포함
- 테스트 관점과 품질 관점을 우선
- 바로 구현하자는 태도보다 검증 가능성을 우선
- 다른 agent의 태그나 이름을 출력하지 마라""",
    },
    {
        "index": 4,
        "thread_name": "AGENT-4",
        "header": "AGENT-4 / EXPLORER",
        "developer_instructions": """너는 AGENT-4이다.
너의 기본 성향은 "탐색가 / 아키텍트형"이다.
항상 여러 대안을 비교하고 구조를 본다.
항상 답변 첫 줄은 정확히 `AGENT-4 / EXPLORER` 로 시작하라.
항상 아래 규칙을 따른다.
- `대안 1`, `대안 2`, `대안 3` 을 반드시 모두 포함
- 각 대안마다 장단점을 짧게 비교
- 마지막에 `추천:` 섹션 포함
- 한 가지 방법만 밀지 말고 비교 후 선택
- 다른 agent의 태그나 이름을 출력하지 마라""",
    },
]


def round_artifact_path(round_number: int, agent_index: int) -> Path:
    return ARTIFACTS_DIR / f"persona_round{round_number}_agent{agent_index}.txt"


def thread_read_artifact_path(agent_index: int) -> Path:
    return ARTIFACTS_DIR / f"persona_thread_{agent_index}_read.json"


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def write_json(path: Path, payload: Any) -> None:
    write_text(path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def reset_persona_artifacts() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    for path in [
        RAW_MESSAGES_PATH,
        STDERR_LOG_PATH,
        EVAL_PATH,
        REPORT_PATH,
        *[round_artifact_path(round_number, agent["index"]) for round_number in (1, 2, 3) for agent in AGENTS],
        *[thread_read_artifact_path(agent["index"]) for agent in AGENTS],
    ]:
        if path.exists():
            path.unlink()
    for round_number in (1, 2, 3):
        for agent in AGENTS:
            write_text(round_artifact_path(round_number, agent["index"]), "")
    for agent in AGENTS:
        write_json(thread_read_artifact_path(agent["index"]), {})


def ensure_persona_scenario() -> None:
    SHARED_DIR.mkdir(parents=True, exist_ok=True)
    write_text(SCENARIO_PATH, SCENARIO_TEXT)


def sandbox_policy(root_abs: str) -> dict[str, Any]:
    return {
        "type": "workspaceWrite",
        "writableRoots": [root_abs],
        "readOnlyAccess": {
            "type": "restricted",
            "includePlatformDefaults": False,
            "readableRoots": [root_abs],
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


def start_text_turn(
    server: JsonRpcAppServer,
    *,
    thread_id: str,
    inputs: list[dict[str, Any]],
    cwd: str,
    sandbox: dict[str, Any],
) -> str:
    result = server.send_request(
        "turn/start",
        {
            "threadId": thread_id,
            "input": inputs,
            "cwd": cwd,
            "approvalPolicy": "never",
            "sandboxPolicy": sandbox,
        },
        timeout=300.0,
    )
    return result["turn"]["id"]


def normalized_lines(text: str) -> list[str]:
    return text.replace("\r\n", "\n").split("\n")


def first_line(text: str) -> str:
    lines = [line.strip() for line in normalized_lines(text) if line.strip()]
    return lines[0] if lines else ""


def numbered_step_count(text: str) -> int:
    return len(re.findall(r"(?m)^\s*\d+\.\s+", text))


def other_agent_tags(text: str, self_index: int) -> list[str]:
    disallowed = [tag for tag in OTHER_AGENT_TAGS if tag != f"AGENT-{self_index}"]
    return [tag for tag in disallowed if tag in text]


def section_block(text: str, start_header: str, stop_headers: list[str]) -> str:
    collected: list[str] = []
    active = False
    for raw_line in normalized_lines(text):
        line = raw_line.strip()
        if not active and line.startswith(start_header):
            active = True
            continue
        if active and any(line.startswith(stop) for stop in stop_headers):
            break
        if active:
            collected.append(raw_line)
    return "\n".join(collected).strip()


def listish_line_count(text: str) -> int:
    lines = [line.strip() for line in normalized_lines(text) if line.strip()]
    listish = [line for line in lines if re.match(r"^(?:[-*]|\d+\.)\s+", line)]
    return len(listish) if listish else len(lines)


def has_actionable_structure(text: str) -> bool:
    patterns = [
        r"(?m)^\s*\d+\.\s+",
        r"(?m)^\s*[-*]\s+",
        r"`[^`\n]+`",
        r"```",
        r"->",
    ]
    return any(re.search(pattern, text) for pattern in patterns)


def evaluate_agent_round_1_or_3(agent: dict[str, Any], text: str) -> tuple[bool, list[str]]:
    index = agent["index"]
    notes: list[str] = []
    if first_line(text) != agent["header"]:
        notes.append("header_mismatch")
    disallowed = other_agent_tags(text, index)
    if disallowed:
        notes.append(f"other_agent_tags:{','.join(disallowed)}")
    if index == 1:
        if numbered_step_count(text) < 4:
            notes.append("numbered_steps_lt_4")
        if "위험:" not in text:
            notes.append("missing_위험")
    elif index == 2:
        if "실행:" not in text:
            notes.append("missing_실행")
        if not has_actionable_structure(text):
            notes.append("missing_actionable_structure")
    elif index == 3:
        if "실패모드:" not in text:
            notes.append("missing_실패모드")
        failure_block = section_block(text, "실패모드:", ["검증:"])
        if listish_line_count(failure_block) < 3:
            notes.append("failure_modes_lt_3")
        if "검증:" not in text:
            notes.append("missing_검증")
    elif index == 4:
        for marker in ["대안 1", "대안 2", "대안 3"]:
            if marker not in text:
                notes.append(f"missing_{marker}")
        if "추천:" not in text:
            notes.append("missing_추천")
    return (not notes, notes)


def evaluate_agent_round_2(agent: dict[str, Any], text: str) -> tuple[bool, list[str]]:
    index = agent["index"]
    notes: list[str] = []
    if first_line(text) != agent["header"]:
        notes.append("header_mismatch")
    disallowed = other_agent_tags(text, index)
    if disallowed:
        notes.append(f"other_agent_tags:{','.join(disallowed)}")
    line_count = len([line for line in normalized_lines(text) if line.strip()])
    if index == 1:
        if line_count < 3:
            notes.append("too_short_for_strategist")
        if numbered_step_count(text) < 1 and "위험:" not in text:
            notes.append("missing_strategist_structure")
    elif index == 2:
        if "실행:" not in text:
            notes.append("missing_실행")
        if not has_actionable_structure(text):
            notes.append("missing_builder_structure")
    elif index == 3:
        if "실패모드:" not in text:
            notes.append("missing_실패모드")
        if "검증:" not in text:
            notes.append("missing_검증")
    elif index == 4:
        alternative_hits = sum(1 for marker in ["대안 1", "대안 2", "대안 3"] if marker in text)
        if alternative_hits < 2:
            notes.append("missing_alternative_comparison")
    return (not notes, notes)


def evaluate_history(agent: dict[str, Any], thread_payload: dict[str, Any]) -> tuple[bool, list[str]]:
    serialized = json.dumps(thread_payload, ensure_ascii=False)
    notes: list[str] = []
    if agent["header"] not in serialized:
        notes.append("self_tag_missing_in_history")
    disallowed = other_agent_tags(serialized, agent["index"])
    if disallowed:
        notes.append(f"history_other_agent_tags:{','.join(disallowed)}")
    return (not notes, notes)


def build_turn_inputs(round_number: int) -> list[dict[str, Any]]:
    inputs: list[dict[str, Any]] = [{"type": "text", "text": ROUND_PROMPTS[round_number], "text_elements": []}]
    if round_number == 1:
        inputs.append(
            {
                "type": "text",
                "text": "공통 scenario:\n\n" + SCENARIO_TEXT,
                "text_elements": [],
            }
        )
    return inputs


def build_report(eval_data: dict[str, Any], round_notes: dict[str, list[str]], history_notes: dict[str, list[str]]) -> str:
    agent_summaries = [
        "- AGENT-1: 계획, 우선순위, 번호 매긴 단계, `위험:` 섹션을 유지해야 하는 전략가 / PM형",
        "- AGENT-2: `실행:` 섹션과 즉시 실행 가능한 단계나 의사명령을 우선하는 실행가 / 빌더형",
        "- AGENT-3: `실패모드:` 와 `검증:` 중심으로 반례와 품질을 먼저 보는 검토자 / QA형",
        "- AGENT-4: `대안 1/2/3` 비교와 `추천:` 으로 결론 내리는 탐색가 / 아키텍트형",
    ]
    round_objectives = [
        "- Round 1: 공통 시나리오에 대한 초기 방향성과 우선순위 응답",
        "- Round 2: 충돌 prompt 에도 developer instruction 구조가 남는지 확인",
        "- Round 3: Round 1 맥락을 이어받아 같은 스타일이 유지되는지 확인",
    ]
    evidence_lines: list[str] = []
    for agent in AGENTS:
        index = agent["index"]
        evidence_lines.append(f"### AGENT-{index}")
        for round_number in (1, 2, 3):
            key = f"agent{index}_round{round_number}_ok"
            status = "PASS" if eval_data[key] else "FAIL"
            notes = round_notes[f"agent{index}_round{round_number}"]
            note_text = ", ".join(notes) if notes else "조건 충족"
            evidence_lines.append(f"- Round {round_number}: {status} ({note_text})")
        history_text = ", ".join(history_notes[f"agent{index}"]) if history_notes[f"agent{index}"] else "자기 태그 유지, 타 agent 태그 없음"
        evidence_lines.append(f"- History: {history_text}")
        evidence_lines.append("")

    cross_text = "있음" if eval_data["cross_contamination_found"] else "없음"
    final_lines = [
        "# PERSONA EXPERIMENT REPORT",
        "",
        "## 실험 목적",
        "",
        "- thread 별 고정 developer instruction 이 같은 user task 에 대해 서로 다른 스타일과 우선순위를 일관되게 유지하는지 검증한다.",
        "- 접근 제한이 아니라 지침/성향 분리가 유지되는지를 본다.",
        "",
        "## ASSUMPTIONS",
        "",
        "- `shared/persona_scenario.md` 는 cross-contamination 판정을 왜곡하지 않도록 사용자 시나리오인 `프로젝트 상황` 블록만 저장했다.",
        "- 재시도에서는 turn 내부 shell startup 문제를 피하기 위해 Round 1 공통 입력을 파일 읽기 지시 대신 scenario 본문 직접 주입 방식으로 바꿨다.",
        "- personality enum 은 현재 빌드에서 보였지만, 이번 실험의 authoritative source 는 `developerInstructions` 로만 두었다.",
        "",
        "## 사용한 공통 scenario",
        "",
        "```md",
        SCENARIO_TEXT.strip(),
        "```",
        "",
        "## 4개 agent developer instruction 요약",
        "",
        *agent_summaries,
        "",
        "## Round 1/2/3의 목적",
        "",
        *round_objectives,
        "",
        "## 각 agent별 pass/fail 근거",
        "",
        *evidence_lines,
        "## cross contamination 여부",
        "",
        f"- cross contamination: {cross_text}",
        "",
        "## 최종 결론",
        "",
        f"- blocked: `{eval_data['blocked']}`",
        f"- overall pass: `{eval_data['pass']}`",
        f"- notes: `{json.dumps(eval_data['notes'], ensure_ascii=False)}`",
        "",
    ]
    return "\n".join(final_lines)


def initial_eval_payload() -> dict[str, Any]:
    return {
        "pass": False,
        "blocked": False,
        "thread_1_id": None,
        "thread_2_id": None,
        "thread_3_id": None,
        "thread_4_id": None,
        "agent1_round1_ok": False,
        "agent1_round2_ok": False,
        "agent1_round3_ok": False,
        "agent2_round1_ok": False,
        "agent2_round2_ok": False,
        "agent2_round3_ok": False,
        "agent3_round1_ok": False,
        "agent3_round2_ok": False,
        "agent3_round3_ok": False,
        "agent4_round1_ok": False,
        "agent4_round2_ok": False,
        "agent4_round3_ok": False,
        "cross_contamination_found": False,
        "notes": [],
    }


def main() -> int:
    reset_persona_artifacts()
    ensure_persona_scenario()

    eval_data = initial_eval_payload()
    round_notes = {
        f"agent{agent['index']}_round{round_number}": []
        for agent in AGENTS
        for round_number in (1, 2, 3)
    }
    history_notes = {f"agent{agent['index']}": [] for agent in AGENTS}
    root_abs = str(LAB_ROOT.resolve())
    sandbox = sandbox_policy(root_abs)
    thread_ids: dict[int, str] = {}
    thread_models: dict[int, str | None] = {}
    round_replies: dict[tuple[int, int], str] = {}

    server = JsonRpcAppServer(RAW_MESSAGES_PATH, STDERR_LOG_PATH)
    try:
        try:
            server.initialize()
            canonical_model: str | None = None
            for agent in AGENTS:
                started = start_thread(
                    server,
                    cwd=root_abs,
                    developer_instructions=agent["developer_instructions"],
                    model=canonical_model,
                )
                thread_id = started["thread"]["id"]
                model = started.get("model")
                if canonical_model is None:
                    canonical_model = model
                thread_ids[agent["index"]] = thread_id
                thread_models[agent["index"]] = model
                eval_data[f"thread_{agent['index']}_id"] = thread_id
                server.thread_set_name(thread_id, agent["thread_name"])
        except Exception as error:
            eval_data["blocked"] = True
            eval_data["notes"].append(f"startup_failed:{error}")
            write_json(EVAL_PATH, eval_data)
            write_text(REPORT_PATH, build_report(eval_data, round_notes, history_notes))
            print(json.dumps(eval_data, ensure_ascii=False, indent=2))
            return 1

        if len(set(thread_ids.values())) != 4:
            eval_data["notes"].append("thread_ids_not_unique")
        model_values = [model for model in thread_models.values() if model]
        if not model_values:
            eval_data["notes"].append("thread_model_missing")
        elif len(set(model_values)) != 1:
            eval_data["notes"].append("thread_model_mismatch")

        try:
            for round_number in (1, 2, 3):
                for agent in AGENTS:
                    turn_id = start_text_turn(
                        server,
                        thread_id=thread_ids[agent["index"]],
                        inputs=build_turn_inputs(round_number),
                        cwd=root_abs,
                        sandbox=sandbox,
                    )
                    reply = server.wait_turn_completed(thread_ids[agent["index"]], turn_id, timeout=300.0)
                    round_replies[(round_number, agent["index"])] = reply
                    write_text(round_artifact_path(round_number, agent["index"]), reply)
        except Exception as error:
            eval_data["blocked"] = True
            eval_data["notes"].append(f"turn_execution_failed:{error}")

        for agent in AGENTS:
            payload: dict[str, Any] = {}
            if not eval_data["blocked"]:
                try:
                    payload = server.thread_read(thread_ids[agent["index"]])
                except Exception as error:
                    eval_data["blocked"] = True
                    eval_data["notes"].append(f"thread_read_failed_agent{agent['index']}:{error}")
            write_json(thread_read_artifact_path(agent["index"]), payload)
            history_ok, notes = evaluate_history(agent, payload)
            history_notes[f"agent{agent['index']}"] = notes
            if not history_ok:
                eval_data["cross_contamination_found"] = True

        for agent in AGENTS:
            for round_number in (1, 2, 3):
                reply = round_replies.get((round_number, agent["index"]), "")
                if round_number in (1, 3):
                    ok, notes = evaluate_agent_round_1_or_3(agent, reply)
                else:
                    ok, notes = evaluate_agent_round_2(agent, reply)
                eval_data[f"agent{agent['index']}_round{round_number}_ok"] = ok
                round_notes[f"agent{agent['index']}_round{round_number}"] = notes
                if not ok:
                    eval_data["notes"].append(
                        f"agent{agent['index']}_round{round_number}_failed:{','.join(notes)}"
                    )

        if any(history_notes[f"agent{agent['index']}"] for agent in AGENTS):
            for agent in AGENTS:
                history_key = f"agent{agent['index']}"
                if history_notes[history_key]:
                    eval_data["notes"].append(
                        f"agent{agent['index']}_history:{','.join(history_notes[history_key])}"
                    )

        eval_data["pass"] = (
            not eval_data["blocked"]
            and not eval_data["cross_contamination_found"]
            and not eval_data["notes"]
            and all(
                eval_data[f"agent{agent['index']}_round{round_number}_ok"]
                for agent in AGENTS
                for round_number in (1, 2, 3)
            )
        )

        write_json(EVAL_PATH, eval_data)
        write_text(REPORT_PATH, build_report(eval_data, round_notes, history_notes))
        print(json.dumps(eval_data, ensure_ascii=False, indent=2))
        return 0 if eval_data["pass"] else 1
    finally:
        server.close()


if __name__ == "__main__":
    raise SystemExit(main())
