#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
export_variant_json.py
- variant spec MD의 YAML Front Matter를 읽어 결정론적 compiled variant JSON으로 내보냅니다.
- 출력: assets/compiled/<support_key>.json (schema: soulforge.se_foldertree_compiled_variant.v0)
- --check 는 재계산 결과를 tracked JSON과 비교하여 드리프트가 있으면 exit 1 합니다.
- 소비자(폴더 생성 / 엔진 stage-rule 컴파일러 / Needs 정책)는 이 JSON을 읽고 스펙 md를 다시 파싱하지 않습니다.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

SKILL_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SPEC_DIR = SKILL_ROOT / "assets"
DEFAULT_OUT_DIR = SKILL_ROOT / "assets" / "compiled"

SCHEMA_VERSION = "soulforge.se_foldertree_compiled_variant.v0"
GENERATED_BY = "export_variant_json.py v0"
DEFAULT_VERIFICATION_STATUS = "unverified"

# Windows 한글 출력 지원
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

try:
    import yaml  # PyYAML
except ImportError as e:  # pragma: no cover - 환경 안내용
    raise SystemExit(
        "PyYAML이 필요합니다. 아래를 먼저 실행하세요:\n"
        "  pip install pyyaml\n"
    ) from e


def read_front_matter(md_path: Path) -> Dict[str, Any]:
    """generate_tree.py와 같은 방식으로 YAML Front Matter만 읽는다."""
    text = md_path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError(f"MD 첫 줄이 '---'가 아닙니다: {md_path.name}")
    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_idx = i
            break
    if end_idx is None:
        raise ValueError(f"YAML Front Matter 종료('---')를 찾지 못했습니다: {md_path.name}")
    yaml_text = "\n".join(lines[1:end_idx]).strip()
    data = yaml.safe_load(yaml_text)
    if not isinstance(data, dict):
        raise ValueError(f"Front Matter YAML이 dict 형태가 아닙니다: {md_path.name}")
    return data


def spec_sha256(md_path: Path) -> str:
    """스펙 md 바이트의 sha256 (드리프트 가드용).

    체크아웃 플랫폼에 따라 줄바꿈이 CRLF/LF로 갈리므로 LF로 정규화한 뒤 해시한다.
    """
    return hashlib.sha256(md_path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def skill_relative(md_path: Path) -> str:
    return md_path.resolve().relative_to(SKILL_ROOT).as_posix()


def normalize_task(task: Dict[str, Any]) -> Dict[str, Any]:
    """YAML의 task 키를 그대로 옮기고, 없는 verification_status만 기본값으로 채운다."""
    if not isinstance(task, dict):
        raise ValueError(f"task 항목이 dict가 아닙니다: {task!r}")
    out = dict(task)
    if not out.get("verification_status"):
        out["verification_status"] = DEFAULT_VERIFICATION_STATUS
    return out


def build_compiled(md_path: Path) -> Dict[str, Any]:
    data = read_front_matter(md_path)

    binding = data.get("variant_binding") or {}
    if not isinstance(binding, dict) or not binding.get("support_key"):
        raise ValueError(f"variant_binding.support_key가 없습니다: {md_path.name}")
    supported_input = data.get("supported_input") or {}
    if not isinstance(supported_input, dict):
        raise ValueError(f"supported_input이 dict가 아닙니다: {md_path.name}")

    gates_raw = data.get("gates")
    if not isinstance(gates_raw, list) or not gates_raw:
        raise ValueError(f"gates가 비어있거나 리스트가 아닙니다: {md_path.name}")

    gates: List[Dict[str, Any]] = []
    for gate in gates_raw:
        if not isinstance(gate, dict):
            raise ValueError(f"gate 항목이 dict가 아닙니다: {gate!r}")
        tasks = gate.get("tasks")
        if not isinstance(tasks, list):
            raise ValueError(f"gate.tasks가 리스트가 아닙니다: gate={gate.get('code')}")
        gates.append(
            {
                "code": gate.get("code"),
                "name": gate.get("name"),
                "desc": gate.get("desc", ""),
                "tasks": [normalize_task(task) for task in tasks],
            }
        )

    return {
        "schema_version": SCHEMA_VERSION,
        "support_key": str(binding["support_key"]),
        "business_type": supported_input.get("business_type"),
        "prime_contractor": supported_input.get("prime_contractor"),
        "quality_grade": supported_input.get("quality_grade"),
        "spec_file": skill_relative(md_path),
        "spec_sha256": spec_sha256(md_path),
        "spec_version": data.get("version"),
        "generated_by": GENERATED_BY,
        "principles": data.get("principles", []),
        "special_folders": data.get("special_folders", {}),
        "management_static_folders": data.get("management_static_folders", []),
        "gates": gates,
        "completion_rule": data.get("completion_rule", {}),
        "generation_rules": data.get("generation_rules", {}),
        "profiles": data.get("profiles", {}),
    }


def serialize(compiled: Dict[str, Any]) -> str:
    """결정론적 직렬화 (키 정렬, 한글 보존, indent 2, 끝줄 개행)."""
    return json.dumps(compiled, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def discover_specs(spec_dir: Path) -> List[Path]:
    """variant_binding.support_key를 가진 bundled spec만 모은다."""
    found: List[Path] = []
    for md_path in sorted(spec_dir.glob("*.md")):
        try:
            data = read_front_matter(md_path)
        except ValueError:
            continue
        binding = data.get("variant_binding")
        if isinstance(binding, dict) and binding.get("support_key"):
            found.append(md_path)
    return found


def resolve_specs(spec_args: List[str] | None) -> List[Path]:
    if spec_args:
        specs = []
        for spec in spec_args:
            path = Path(spec).expanduser().resolve()
            if not path.is_file():
                raise SystemExit(f"spec 파일을 찾을 수 없습니다: {spec}")
            specs.append(path)
        return specs
    specs = discover_specs(DEFAULT_SPEC_DIR)
    if not specs:
        raise SystemExit(f"bundled spec을 찾지 못했습니다: {DEFAULT_SPEC_DIR}")
    return specs


def main() -> int:
    ap = argparse.ArgumentParser(
        description="SE 폴더트리 variant 스펙을 compiled JSON으로 내보내기"
    )
    ap.add_argument(
        "--spec",
        action="append",
        help="스펙 MD 경로 (반복 지정 가능, 미지정 시 bundled spec 전체)",
    )
    ap.add_argument(
        "--out-dir",
        help="출력 디렉터리 (기본: assets/compiled)",
    )
    ap.add_argument(
        "--check",
        action="store_true",
        help="파일을 쓰지 않고 tracked JSON과 비교 (드리프트 시 exit 1)",
    )
    args = ap.parse_args()

    out_dir = Path(args.out_dir).expanduser().resolve() if args.out_dir else DEFAULT_OUT_DIR
    specs = resolve_specs(args.spec)

    drift: List[str] = []
    for md_path in specs:
        compiled = build_compiled(md_path)
        payload = serialize(compiled)
        out_path = out_dir / f"{compiled['support_key']}.json"

        if args.check:
            if not out_path.is_file():
                drift.append(f"missing: {out_path.name} (spec {compiled['spec_file']})")
                continue
            current = out_path.read_text(encoding="utf-8")
            if current != payload:
                drift.append(f"drift: {out_path.name} (spec {compiled['spec_file']})")
            else:
                print(f"[OK] {out_path.name} <- {compiled['spec_file']}")
            continue

        out_dir.mkdir(parents=True, exist_ok=True)
        out_path.write_text(payload, encoding="utf-8", newline="\n")
        task_count = sum(len(gate["tasks"]) for gate in compiled["gates"])
        print(
            f"[생성] {out_path.name} <- {compiled['spec_file']} "
            f"(spec_version={compiled['spec_version']}, gates={len(compiled['gates'])}, "
            f"tasks={task_count})"
        )

    if args.check:
        if drift:
            print("[FAIL] compiled variant JSON이 스펙과 일치하지 않습니다:")
            for item in drift:
                print(f"  - {item}")
            print("  재생성: python scripts/export_variant_json.py")
            return 1
        print(f"[PASS] compiled variant JSON {len(specs)}건이 스펙과 일치합니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
