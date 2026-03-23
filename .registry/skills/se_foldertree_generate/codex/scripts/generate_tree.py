#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_tree.py
- Markdown 파일의 YAML Front Matter(--- ... ---)를 읽어 프로젝트 폴더 트리를 생성합니다.
- Option A(하드 제외): profiles.<PROFILE>.exclude_task_ids에 있는 TASK_ID는 폴더를 아예 생성하지 않습니다.
- plan_manifest.json / plan_progress.json 생성 지원
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

# Windows 한글 출력 지원
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

try:
    import yaml  # PyYAML
except ImportError as e:
    raise SystemExit(
        "PyYAML이 필요합니다. 아래를 먼저 실행하세요:\n"
        "  pip install pyyaml\n"
    ) from e


def parse_date_flexible(date_str: str | None) -> str | None:
    """날짜 문자열을 YYYY-MM-DD로 정규화. 빈값/None은 None 반환."""
    if not date_str or str(date_str).strip() in ("", "None", "null"):
        return None
    s = str(date_str).strip()
    # 다양한 포맷 시도
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y%m%d"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return s  # 파싱 실패 시 원본 반환


# ═══════════════════════════════════════════════════════════════════
# 파일명 상수 (영문 - 에이전트 친화적)
# ═══════════════════════════════════════════════════════════════════
FILE_MANIFEST_JSON = "plan_manifest.json"
FILE_PROGRESS_JSON = "plan_progress.json"
FILE_PROJECT_ID = "PROJECT_ID.txt"
FILE_REQUIRED_CSV = "생성된_할_일_목록.csv"
FILE_EXCLUDED_CSV = "등급_때문에_제외된_목록.csv"
FILE_INDEX_TXT = "폴더_인덱스.txt"

SUPPORTED_VARIANTS = {
    ("체계개발", "lig넥스원", "A"): {
        "support_key": "system_dev_lig_grade_a",
        "display": "체계개발 / LIG 넥스원 / A",
    }
}


def read_front_matter(md_path: Path) -> Dict[str, Any]:
    text = md_path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError("MD 첫 줄이 '---'가 아닙니다. YAML Front Matter가 필요합니다.")
    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_idx = i
            break
    if end_idx is None:
        raise ValueError("YAML Front Matter 종료('---')를 찾지 못했습니다.")
    yaml_text = "\n".join(lines[1:end_idx]).strip()
    data = yaml.safe_load(yaml_text)
    if not isinstance(data, dict):
        raise ValueError("Front Matter YAML이 dict 형태가 아닙니다.")
    return data


def as_int_list(values: Any) -> List[int]:
    if values is None:
        return []
    if isinstance(values, list):
        out: List[int] = []
        for v in values:
            if isinstance(v, int):
                out.append(v)
            elif isinstance(v, str) and v.strip().isdigit():
                out.append(int(v.strip()))
            else:
                raise ValueError(f"exclude_task_ids에 정수 아닌 값이 있습니다: {v!r}")
        return out
    raise ValueError("exclude_task_ids는 리스트여야 합니다.")


def normalize_business_type(value: str) -> str:
    return "".join(str(value).split())


def normalize_prime_contractor(value: str) -> str:
    return "".join(str(value).split()).lower()


def normalize_quality_grade(value: str) -> str:
    return "".join(str(value).split()).upper()


def resolve_supported_variant(
    business_type: str,
    prime_contractor: str,
    quality_grade: str,
) -> Dict[str, str]:
    key = (
        normalize_business_type(business_type),
        normalize_prime_contractor(prime_contractor),
        normalize_quality_grade(quality_grade),
    )
    variant = SUPPORTED_VARIANTS.get(key)
    if variant:
        return variant

    supported_labels = ", ".join(
        entry["display"] for entry in SUPPORTED_VARIANTS.values()
    )
    raise SystemExit(
        "현재 입력 조합을 지원하는 SE 폴더트리 스펙이 없습니다.\n"
        f"  - 입력: {business_type} / {prime_contractor} / {quality_grade}\n"
        f"  - 현재 지원: {supported_labels}\n"
        "새 조합을 지원하려면 별도 spec/variant를 추가하세요.\n"
    )


def resolve_project_root(
    out_root: Path,
    layout_mode: str,
    requested_root_name: str,
) -> tuple[Path, str]:
    if layout_mode == "in-place":
        return out_root, out_root.name
    return out_root / requested_root_name, requested_root_name


def ensure_dir(p: Path, dry_run: bool) -> None:
    if dry_run:
        print(f"  [DRY-RUN] mkdir: {p}")
        return
    p.mkdir(parents=True, exist_ok=True)


def write_csv_korean(rows: List[Dict[str, Any]], out_path: Path, dry_run: bool = False) -> None:
    """CSV 저장 (UTF-8 BOM, 한글 헤더)"""
    if dry_run:
        print(f"  [생성] CSV: {out_path}")
    if not rows:
        if not dry_run:
            out_path.write_text("", encoding="utf-8-sig")
        return
    fieldnames = list(rows[0].keys())
    if not dry_run:
        with out_path.open("w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(rows)


def write_json(data: Any, out_path: Path, dry_run: bool = False) -> None:
    """JSON 파일 저장 (UTF-8, 한글 보존)"""
    if dry_run:
        print(f"  [생성] JSON: {out_path}")
    if not dry_run:
        with out_path.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)


def write_index_file(
    gates: List[Dict[str, Any]],
    exclude_ids: List[int],
    special_folders: Dict[str, Any],
    management_static_folders: List[Dict[str, Any]],
    out_path: Path,
    dry_run: bool = False
) -> None:
    """탭 구분형 인덱스 파일 생성 (복사용)"""
    lines: List[str] = []

    # 1. 정적 상위 폴더
    static_folder_keys = [key for key in special_folders.keys() if key != "unclassified"]
    for key in sorted(static_folder_keys, key=lambda item: int(special_folders[item].get("code", 999))):
        info = special_folders.get(key, {})
        folder_code = int(info.get("code", 0))
        folder_name = str(info.get("name", "")).strip()
        folder_desc = str(info.get("desc", "")).strip()
        if folder_name:
            lines.append(f"'{folder_code:03d}\t{folder_name}\t{folder_desc}")

    # 1-1. 관리 static 폴더
    for info in sorted(management_static_folders, key=lambda item: int(item.get("code", 999))):
        folder_code = int(info.get("code", 0))
        folder_name = str(info.get("name", "")).strip()
        folder_desc = str(info.get("desc", "")).strip()
        if folder_name:
            lines.append(f"'{folder_code:03d}\t{folder_name}\t{folder_desc}")

    # 2. 각 게이트 및 작업
    for g in gates:
        gate_code = int(g.get('code', 0))
        gate_name = str(g.get('name', '')).strip()
        gate_desc = str(g.get('desc', '')).strip()
        tasks = g.get('tasks', [])
        
        # 게이트 라인 (게이트명 + 설명)
        lines.append(f"'{gate_code:03d}\t{gate_name}\t{gate_desc}")
        
        # 각 작업
        for t in tasks:
            task_id = int(t.get('id', 0))
            task_name = str(t.get('name', '')).strip()
            task_desc = str(t.get('desc', '')).strip()
            
            if task_id in exclude_ids:
                continue
            
            lines.append(f"'{task_id:03d}\t{task_name}\t{task_desc}")
    
    # 3. 분류필요업무 (옵션)
    unclassified = special_folders.get("unclassified", {})
    if unclassified:
        uc_code = unclassified.get("code", 180)
        uc_name = unclassified.get("name", "분류필요업무")
        uc_desc = unclassified.get("desc", "")
        lines.append(f"'{uc_code:03d}\t{uc_name}\t{uc_desc}")
    
    # 파일 저장
    content = "\n".join(lines) + "\n"
    if dry_run:
        print(f"  [생성] TXT: {out_path}")
    else:
        out_path.write_text(content, encoding="utf-8")
        print(f"  [생성] TXT: {out_path}")





def build_manifest(
    spec_path: Path,
    proj_folder_name: str,
    requested_root_name: str,
    profile: str,
    layout_mode: str,
    business_type: str,
    prime_contractor: str,
    quality_grade: str,
    support_key: str,
    gate_fmt: str,
    task_fmt: str,
    static_folders: List[str],
    special_folders: Dict[str, Any],
    management_static_folders: List[Dict[str, Any]],
    fixed_subfolders: List[Dict[str, str]],
    completion_rule: Dict[str, Any],
    required_rows: List[Dict[str, Any]],
    excluded_rows: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """plan_manifest.json 구조 생성"""
    now = datetime.now(timezone.utc).astimezone().isoformat()
    
    return {
        "meta": {
            "version": "1.0",
            "generated_at": now,
            "profile": profile,
            "project_root": proj_folder_name,
            "requested_project_root": requested_root_name,
            "layout_mode": layout_mode,
            "business_type": business_type,
            "prime_contractor": prime_contractor,
            "quality_grade": quality_grade,
            "support_key": support_key,
            "spec_path": str(spec_path),
        },
        "rules": {
            "gate_folder_format": gate_fmt,
            "task_folder_format": task_fmt,
            "static_folders": static_folders,
            "special_folders": special_folders,
            "management_static_folders": management_static_folders,
            "fixed_subfolders": fixed_subfolders,  # [{"name": ..., "desc": ...}, ...]
            "completion_rule": {
                "required_folder": completion_rule.get("required_folder", "03_Out"),
                "done_if_final_pattern": completion_rule.get("done_if", {}).get("pattern_examples", ["*_FINAL.*"]),
                "fallback_done_if_any_file_in_out": True,
            },
        },
        "required_tasks": [
            {
                "gate": row["게이트"],
                "task_id": row["작업ID"],
                "task_name": row["작업명"],
                "path": row["경로"],
                "done_rule": row["완료기준"],
                "term": row.get("용어"),
                "source": row.get("근거"),
                "template": row.get("양식"),
                "internal_target_date": row.get("작성목표일"),
                "official_deadline": row.get("제출마감일"),
            }
            for row in required_rows
        ],
        "excluded_tasks": [
            {
                "gate": row["게이트"],
                "task_id": row["작업ID"],
                "task_name": row["작업명"],
                "reason": row["제외사유"],
            }
            for row in excluded_rows
        ],
    }


def build_progress(
    proj_folder_name: str,
    layout_mode: str,
    required_rows: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """plan_progress.json 초기 템플릿 생성"""
    now = datetime.now(timezone.utc).astimezone().isoformat()
    
    return {
        "version": "1.0",
        "project_root": proj_folder_name,
        "layout_mode": layout_mode,
        "generated_at": now,
        "last_checked_at": None,
        "summary": {
            "total_tasks": len(required_rows),
            "completed": 0,
            "in_progress": 0,
            "todo": len(required_rows),
            "percent_complete": 0.0,
        },
        "tasks": [
            {
                "task_id": row["작업ID"],
                "path": row["경로"],
                "status": "TODO",  # TODO | IN_PROGRESS | DONE | BLOCKED | N/A
                "percent": 0,
                "evidence": [],
                "last_scanned_at": None,
                "notes": "",
            }
            for row in required_rows
        ],
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="SE 기반 프로젝트 폴더 트리 생성기")
    ap.add_argument("--spec", required=True, help="YAML Front Matter가 포함된 MD 스펙 파일 경로")
    ap.add_argument(
        "--layout-mode",
        default="new-root",
        choices=["new-root", "in-place"],
        help="new-root: --out 아래에 새 루트 폴더 생성, in-place: --out 경로 바로 아래에 내용 생성",
    )
    ap.add_argument("--business-type", required=True, help="사업 유형 (예: 체계개발)")
    ap.add_argument("--prime-contractor", required=True, help="상위 체계업체 (예: LIG 넥스원)")
    ap.add_argument("--quality-grade", required=True, help="품질등급 (예: A)")
    ap.add_argument("--start", required=True, help="시작일 YYYYMMDD (예: 20260109)")
    ap.add_argument("--name", required=True, help="프로젝트명 (폴더명에 사용)")
    ap.add_argument("--profile", default="A", choices=["A", "B", "C"], help="프로필/등급")
    ap.add_argument(
        "--out",
        required=True,
        help="new-root: 생성할 상위 경로, in-place: 내용이 직접 들어갈 최종 프로젝트 루트",
    )
    ap.add_argument("--dry-run", action="store_true", help="폴더는 생성하지 않고 manifest/progress만 생성")
    
    # Manifest 옵션 (기본값: both)
    ap.add_argument("--manifest-format", default="both", choices=["json", "csv", "both", "none"],
                    help="manifest 출력 포맷 (기본값: both)")
    ap.add_argument("--no-manifest", action="store_true", help="manifest 생성 안 함 (--manifest-format none과 동일)")
    
    # Progress 옵션
    ap.add_argument("--init-progress", action="store_true", default=True,
                    help="plan_progress.json 초기 템플릿 생성 (기본값: ON)")
    ap.add_argument("--no-progress", action="store_true", help="plan_progress.json 생성 안 함")
    
    args = ap.parse_args()
    
    # --no-manifest 처리
    manifest_format = "none" if args.no_manifest else args.manifest_format
    
    # --no-progress 처리
    init_progress = not args.no_progress

    spec_path = Path(args.spec).expanduser().resolve()
    out_root = Path(args.out).expanduser().resolve()
    variant = resolve_supported_variant(
        args.business_type,
        args.prime_contractor,
        args.quality_grade,
    )

    data = read_front_matter(spec_path)

    root_fmt = data.get("root_naming", {}).get("format", "{START_YYYYMMDD}_{PROJECT_NAME}")
    generation_rules = data.get("generation_rules", {})
    gate_fmt = generation_rules.get("gate_folder_format", "{GATE_CODE:03d}_{GATE_NAME}")
    task_fmt = generation_rules.get("task_folder_format", "{TASK_ID:03d}_{TASK_NAME}")
    fixed_subfolders_raw = data.get("fixed_subfolders", [])
    gates = data.get("gates", [])
    static_folders = generation_rules.get("static_folders", generation_rules.get("reference_folders", []))
    completion_rule = data.get("completion_rule", {})
    special_folders = data.get("special_folders", {
        "reference": {"code": 0, "name": "REF", "desc": "참조자료"},
        "management": {"code": 20, "name": "MGMT", "desc": "프로젝트 통합 관리"},
        "unclassified": {"code": 270, "name": "분류필요업무", "desc": ""}
    })
    management_static_folders = data.get("management_static_folders", [])

    # fixed_subfolders: 문자열 리스트 또는 객체 리스트 모두 지원
    fixed_subfolders = []  # 폴더 이름만
    fixed_subfolders_full = []  # name + desc 전체 정보
    for sf in fixed_subfolders_raw:
        if isinstance(sf, dict):
            name = sf.get("name", "")
            desc = sf.get("desc", "")
            if name:
                fixed_subfolders.append(name)
                fixed_subfolders_full.append({"name": name, "desc": desc})
        else:
            name = str(sf)
            if name:
                fixed_subfolders.append(name)
                fixed_subfolders_full.append({"name": name, "desc": ""})

    if not fixed_subfolders:
        raise ValueError("fixed_subfolders가 비어있거나 리스트가 아닙니다.")
    if not isinstance(gates, list) or not gates:
        raise ValueError("gates가 비어있거나 리스트가 아닙니다.")
    if not isinstance(static_folders, list):
        raise ValueError("generation_rules.static_folders는 리스트여야 합니다.")
    if not isinstance(management_static_folders, list):
        raise ValueError("management_static_folders는 리스트여야 합니다.")

    # 게이트 레벨 고정폴더(INBOX, LOG, TDP) 하위 구조 파싱
    fixed_gate_subfolders = data.get("fixed_gate_subfolders", {})

    profiles = data.get("profiles", {})
    prof = profiles.get(args.profile, {})
    exclude_ids = as_int_list(prof.get('exclude_task_ids'))

    requested_root_name = root_fmt.format(START_YYYYMMDD=args.start, PROJECT_NAME=args.name)
    proj_root, proj_folder_name = resolve_project_root(
        out_root,
        args.layout_mode,
        requested_root_name,
    )

    print(f"[INFO] Spec: {spec_path}")
    print(f"[INFO] Layout mode: {args.layout_mode}")
    print(f"[INFO] Business type: {args.business_type}")
    print(f"[INFO] Prime contractor: {args.prime_contractor}")
    print(f"[INFO] Quality grade: {args.quality_grade}")
    print(f"[INFO] Supported variant: {variant['display']} ({variant['support_key']})")
    print(f"[INFO] Output root: {proj_root}")
    print(f"[INFO] Profile: {args.profile} (exclude_task_ids={exclude_ids})")
    print(f"[INFO] Manifest format: {manifest_format}")
    print(f"[INFO] Init progress: {init_progress}")
    if args.dry_run:
        print("[INFO] DRY-RUN: 폴더는 생성하지 않고 manifest/progress만 생성합니다.")
    print()

    # 폴더 생성 (dry-run이면 스킵)
    ensure_dir(proj_root, args.dry_run)

    for static_folder in static_folders:
        ensure_dir(proj_root / static_folder, args.dry_run)

    # ═══════════════════════════════════════════════════════════════════
    # 작업 목록 수집 (한글 컬럼명)
    # ═══════════════════════════════════════════════════════════════════
    required_rows: List[Dict[str, Any]] = []
    excluded_rows: List[Dict[str, Any]] = []

    for g in gates:
        gate_code = g.get('code')
        gate_name = g.get('name')
        gate_desc = str(g.get('desc', '')).strip()
        tasks = g.get('tasks', [])
        if gate_code is None or gate_name is None:
            raise ValueError(f"gate에 code/name이 없습니다: {g}")
        if not isinstance(tasks, list):
            raise ValueError(f"gate.tasks가 리스트가 아닙니다: gate={gate_code}")

        gate_dir_name = gate_fmt.format(GATE_CODE=int(gate_code), GATE_NAME=str(gate_name).replace('/', '-').strip())
        gate_dir = proj_root / gate_dir_name
        ensure_dir(gate_dir, args.dry_run)

        for t in tasks:
            task_id = t.get('id')
            task_name = t.get('name')
            if task_id is None or task_name is None:
                raise ValueError(f"task에 id/name이 없습니다: {t}")
            tid = int(task_id)
            tname = str(task_name)

            if tid in exclude_ids:
                excluded_rows.append({
                    "게이트": gate_dir_name,
                    "작업ID": tid,
                    "작업명": tname,
                    "제외사유": f"프로필 {args.profile} 제외 설정",
                    "설명": "프로필(등급) 설정에 의해 생성에서 제외",
                })
                continue

            task_dir_name = task_fmt.format(TASK_ID=tid, TASK_NAME=tname.replace('/', '-').strip())
            task_dir = gate_dir / task_dir_name
            ensure_dir(task_dir, args.dry_run)

            # is_fixed 태스크(INBOX, LOG, TDP)는 특수 하위폴더 구조 사용
            is_fixed = t.get("is_fixed", False)
            if is_fixed:
                # 폴더명에서 INBOX, LOG, TDP 매칭
                folder_type = None
                for ftype in fixed_gate_subfolders.keys():
                    if ftype in tname.upper():
                        folder_type = ftype
                        break
                
                if folder_type and folder_type in fixed_gate_subfolders:
                    gate_sf_config = fixed_gate_subfolders[folder_type]
                    subfolders = gate_sf_config.get("subfolders", [])
                    
                    # INBOX 등 subfolders가 없는 경우 - 직접 예시 폴더 생성
                    if not subfolders:
                        example_item = gate_sf_config.get("example_item", "")
                        if example_item:
                            example_dir = task_dir / example_item
                            ensure_dir(example_dir, args.dry_run)
                            # item_subfolders 생성
                            for isf in gate_sf_config.get("item_subfolders", []):
                                ensure_dir(example_dir / str(isf), args.dry_run)
                    else:
                        # LOG, TDP 등 subfolders가 있는 경우
                        for sf in subfolders:
                            if isinstance(sf, dict):
                                sf_name = sf.get("name", "")
                                if sf_name:
                                    sf_dir = task_dir / sf_name
                                    ensure_dir(sf_dir, args.dry_run)
                                    # 예시 폴더 생성
                                    example_item = sf.get("example_item", "")
                                    if example_item:
                                        example_dir = sf_dir / example_item
                                        ensure_dir(example_dir, args.dry_run)
                                        # item_subfolders 생성
                                        for isf in sf.get("item_subfolders", []):
                                            ensure_dir(example_dir / str(isf), args.dry_run)
                            else:
                                ensure_dir(task_dir / str(sf), args.dry_run)
                # is_fixed 폴더는 일반 fixed_subfolders 생성 안함
            else:
                # 일반 태스크는 기존 fixed_subfolders 생성
                for sf in fixed_subfolders:
                    ensure_dir(task_dir / sf, args.dry_run)

            path_str = str((Path(gate_dir_name) / task_dir_name).as_posix())
            required_rows.append({
                "게이트": gate_dir_name,
                "작업ID": tid,
                "작업명": tname,
                "설명": t.get("desc", f"{gate_dir_name} 단계의 '{tname}' 수행/산출물 폴더"),
                "용어": t.get("term", ""),
                "근거": t.get("source", ""),
                "양식": t.get("template", ""),
                "경로": path_str,
                "완료기준": "03_Out 폴더에 결과물 파일이 있으면 완료 (권장: *_FINAL.*)",
                "작성목표일": parse_date_flexible(t.get("internal_target_date")),
                "제출마감일": parse_date_flexible(t.get("official_deadline")),
            })

    # ═══════════════════════════════════════════════════════════════════
    # Manifest/Progress 출력 (dry-run에서도 생성)
    # ═══════════════════════════════════════════════════════════════════
    
    # dry-run이어도 프로젝트 루트는 만들어야 파일 저장 가능
    if args.dry_run:
        proj_root.mkdir(parents=True, exist_ok=True)
    
    # JSON 출력
    if manifest_format in ("json", "both"):
        manifest_data = build_manifest(
            spec_path, proj_folder_name, requested_root_name, args.profile,
            args.layout_mode, args.business_type, args.prime_contractor,
            args.quality_grade, variant["support_key"],
            gate_fmt, task_fmt, static_folders, special_folders,
            management_static_folders,
            fixed_subfolders_full, completion_rule,
            required_rows, excluded_rows
        )
        manifest_path = proj_root / FILE_MANIFEST_JSON
        write_json(manifest_data, manifest_path)
        print(f"  [생성] JSON: {manifest_path}")
    
    # CSV 출력
    if manifest_format in ("csv", "both"):
        # Required CSV
        req_path = proj_root / FILE_REQUIRED_CSV
        write_csv_korean(required_rows, req_path)
        print(f"  [생성] CSV: {req_path}")
        
        # Excluded CSV
        exc_path = proj_root / FILE_EXCLUDED_CSV
        write_csv_korean(excluded_rows, exc_path)
        print(f"  [생성] CSV: {exc_path}")

    # Progress 초기화
    if init_progress:
        progress_data = build_progress(proj_folder_name, args.layout_mode, required_rows)
        progress_path = proj_root / FILE_PROGRESS_JSON
        write_json(progress_data, progress_path)
        print(f"  [생성] JSON: {progress_path}")

    # 인덱스 파일 생성 (항상)
    index_path = proj_root / FILE_INDEX_TXT
    write_index_file(
        gates,
        exclude_ids,
        special_folders,
        management_static_folders,
        index_path,
        args.dry_run,
    )

    # PROJECT_ID.txt 생성 (폴더명 변경해도 프로젝트 추적 가능)
    project_id_path = proj_root / FILE_PROJECT_ID
    if not project_id_path.exists():
        project_id = str(uuid.uuid4())
        project_id_path.write_text(project_id, encoding="utf-8")
        print(f"  [생성] PROJECT_ID: {project_id_path} ({project_id[:8]}...)")
    else:
        print(f"  [유지] PROJECT_ID: {project_id_path} (이미 존재)")

    print()
    print(f"[DONE] {'DRY-RUN 완료 (폴더 생성 안 함)' if args.dry_run else '생성 완료'}")
    print(f"  - 생성된 Gate: {len(gates)}개")
    print(f"  - 생성된 Task 폴더: {len(required_rows)}개")
    print(f"  - 제외된 Task: {len(excluded_rows)}개")
    if manifest_format != "none":
        print(f"  - Manifest: {manifest_format}")
    if init_progress:
        print(f"  - Progress 초기화: {FILE_PROGRESS_JSON}")


if __name__ == "__main__":
    main()
