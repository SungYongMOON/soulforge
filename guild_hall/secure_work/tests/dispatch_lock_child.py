"""Stdlib-only OS lock child; runs on Windows and POSIX without E14."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from soulforge_secure_work.dispatch import controller_lock, DispatchUnavailable

try:
    with controller_lock(Path(sys.argv[1])):
        print("LOCKED", flush=True)
        if sys.argv[2] == "wait":
            sys.stdin.readline()
except DispatchUnavailable as error:
    print(str(error), flush=True)
    raise SystemExit(3)
