#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import runpy


if __name__ == "__main__":
    target = Path(__file__).resolve().parents[2] / "guild_hall" / "town_crier" / "telegram_send.py"
    runpy.run_path(str(target), run_name="__main__")
