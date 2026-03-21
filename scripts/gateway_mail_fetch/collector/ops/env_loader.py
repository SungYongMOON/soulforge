from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, Optional


def parse_env_file(path: Path) -> Dict[str, str]:
    result: Dict[str, str] = {}
    if not path.exists():
        return result
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip()
    return result


def load_env(path: Optional[Path]) -> Dict[str, str]:
    payload: Dict[str, str] = {}
    if path is not None:
        payload.update(parse_env_file(path))
    payload.update(os.environ)
    return payload


def env_bool(env: Dict[str, str], key: str, default: bool = False) -> bool:
    raw = env.get(key)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def env_int(env: Dict[str, str], key: str, default: int) -> int:
    raw = env.get(key)
    if raw is None:
        return default
    try:
        return int(str(raw).strip())
    except Exception:
        return default
