"""Actual isolated Python startup with synthetic modules/launcher only.

The host's declared test Python/stdlib are read as test dependencies. No actual
secure-work config, E14 kit, credential, ACL mutation or service is involved.
These tests are not OS custody or Windows _pth installation evidence.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "src" / "soulforge_secure_work"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normal(path):
    return os.path.normcase(str(path.resolve()))


class LaunchRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Windows is the supported installed launch platform. POSIX still runs
        # the pure module tests when stdlib paths can be stated explicitly.
        # uv/venv may expose a version-alias junction as base_prefix. Run the
        # declared base test interpreter through its canonical path so its
        # startup module filenames match the exact, alias-free test inventory.
        # This does not permit venv/junction paths in the installed launcher.
        cls.python = Path(getattr(sys, "_base_executable", sys.executable)).resolve()
        cls.node = Path(shutil.which("node")).resolve()
        cls.runtime = Path(sys.base_prefix).resolve()
        cls.stdlib = cls.runtime / ("Lib" if os.name == "nt" else f"lib/python{sys.version_info.major}.{sys.version_info.minor}")
        cls.runtime_paths = [cls.stdlib]
        dlls = cls.runtime / "DLLs" if os.name == "nt" else cls.stdlib / "lib-dynload"
        if dlls.is_dir():
            cls.runtime_paths.append(dlls)
        cls.runtime_files = {normal(cls.python): digest(cls.python)}
        cls.runtime_files[normal(cls.node)] = digest(cls.node)
        for root in cls.runtime_paths:
            for directory, dirs, files in os.walk(root):
                dirs[:] = [d for d in dirs if d not in {"site-packages", "__pycache__"}]
                for name in files:
                    p = Path(directory) / name
                    if p.suffix.lower() in {".py", ".pyd", ".so", ".dll"} and not p.is_symlink():
                        cls.runtime_files[normal(p)] = digest(p)

    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory(prefix="secure-work-python-launch-")
        self.addCleanup(self.scratch.cleanup)
        self.root = Path(self.scratch.name)
        self.src = self.root / "src"
        shutil.copytree(SOURCE, self.src / "soulforge_secure_work", ignore=shutil.ignore_patterns("__pycache__"))
        self.package = self.src / "soulforge_secure_work"
        self.kit = self.root / "kit"
        (self.kit / "src" / "sf_sewe").mkdir(parents=True)
        (self.kit / "src" / "sf_sewe" / "models.py").write_text("SYNTHETIC = True\n")
        self.config = self.root / "config.json"
        self.config.write_text(json.dumps({"schema": "soulforge.secure_work.config.v0",
            "kit_root": str(self.kit), "recipe_root": str(self.root / "recipes"),
            "pilot_root": str(self.root / "working"), "status_path": str(self.root / "status.json"), "adapters": {}}))
        self.launcher = self.root / "synthetic_launcher.mjs"
        self.launcher.write_text(
            "import {readFileSync} from 'node:fs';\n"
            "if (process.argv[2] === '--preflight') console.log('{\"ok\":true,\"code\":\"SECURE_WORK_LAUNCH_VERIFIED\"}');\n"
            "else if (process.argv[2] === '--custody-bridge') console.log('{\"synthetic_bridge\":true}');\n"
            "else if (process.argv[2] === '--worker') process.stdout.write(readFileSync(0));\n")

    def run_bootstrap(self, program, *, mode="cli", body=""):
        (self.package / "cli.py").write_text("def main(argv):\n" + "\n".join("    " + line for line in program.splitlines()) + "\n")
        files = dict(self.runtime_files)
        for p in self.src.rglob("*.py"):
            files[normal(p)] = digest(p)
        for p in self.kit.rglob("*.py"):
            files[normal(p)] = digest(p)
        files[normal(self.launcher)] = digest(self.launcher)
        paths = [str(p) for p in [*self.runtime_paths, self.src, self.kit / "src"]]
        packet = {"mode": mode, "argv": [], "python_paths": paths, "files": files,
            "config_path": str(self.config), "config_sha256": digest(self.config), "kit_root": str(self.kit),
            "node": str(self.node), "launcher": str(self.launcher),
            "environment": {k: os.environ[k] for k in ("SYSTEMROOT", "WINDIR") if k in os.environ}}
        bootstrap = self.package / "launch_runtime.py"
        # Same bounded stdin handoff as sfx. Worker bytes follow the packet;
        # neither argv nor caller body supplies installation authority.
        code = (f"import sys; sys.path[:] = {paths!r}; sys.dont_write_bytecode = True; "
                f"exec(compile(open({str(bootstrap)!r}, 'rb').read(), {str(bootstrap)!r}, 'exec'), "
                "{'__name__': '__main__', '_LAUNCH_PACKET': sys.stdin.buffer.readline(16777217).decode('utf8')})")
        return subprocess.run([str(self.python), "-I", "-S", "-B", "-c", code],
            input=json.dumps(packet) + "\n" + body, capture_output=True, text=True,
            env=packet["environment"], cwd=self.root, timeout=30)

    def test_actual_bootstrap_config_kit_bridge_worker_and_engine_guard_connection(self):
        result = self.run_bootstrap("""from soulforge_secure_work import config, kit, launch_runtime, adapters, engine
value = config.load()
assert value.path.name == 'config.json'
assert kit.bind(value.kit_root).name == 'src'
assert launch_runtime.is_launched()
bridge = adapters.TongsCustodyAdapter(None, '', '', None, False)
assert bridge._bridge_call({'operation': 'authorize'}) == {'synthetic_bridge': True}
worker = adapters.ScriptedWorkerTransport('caller-value-ignored', value.path.parent, value.path.parent)
try: worker.send_exact(b'synthetic-released', value.path.parent)
except RuntimeError as error: assert str(error) == 'CHANNEL_SCOPE_REQUIRED'
else: raise AssertionError('unscoped worker call accepted')
lane = engine.Lane.__new__(engine.Lane)
def stop(): raise RuntimeError('synthetic-integrity-stop')
engine.recheck_if_launched = stop
for operation in (lambda: lane.transition(None, '', '', ''), lambda: lane.request('', None, '', ''), lambda: lane.advance(None)):
    try: operation()
    except RuntimeError as error: assert str(error) == 'synthetic-integrity-stop'
    else: raise AssertionError('missing transition guard')
print('BOOTSTRAP_CONNECTED')
return 0""")
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertEqual(result.stdout.strip(), "BOOTSTRAP_CONNECTED")

    def test_late_dynamic_python_change_is_denied_before_execution(self):
        late = self.package / "late.py"
        late.write_text("VALUE = 'original'\n")
        marker = self.root / "executed.txt"
        result = self.run_bootstrap(f"""from pathlib import Path
Path({str(late)!r}).write_text({('from pathlib import Path; Path(' + repr(str(marker)) + ').write_text("executed")')!r})
try: import soulforge_secure_work.late
except RuntimeError as error: assert str(error) == 'SECURE_WORK_LAUNCH_HOLD'
else: raise AssertionError('late import ran')
assert not Path({str(marker)!r}).exists()
print('LATE_IMPORT_DENIED')
return 0""")
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertFalse(marker.exists())

    def test_direct_python_cli_cannot_use_config_from_environment(self):
        env = dict(os.environ, SOULFORGE_SECURE_WORK_CONFIG=str(self.config), PYTHONPATH=str(self.src))
        result = subprocess.run([str(self.python), "-B", "-m", "soulforge_secure_work.cli", "doctor"],
            env=env, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(json.loads(result.stdout)["code"], "SECURE_WORK_LAUNCH_HOLD")

    def test_worker_entry_selects_byte_broker_and_never_accepts_stdin_as_work(self):
        (self.package / "ipc.py").write_text("def serve_runtime(role):\n    assert role == 'worker'\n    print('BROKER_SELECTED')\n    return 0\n")
        body = '{"caller_claims_authority":true}\nsynthetic released data\n'
        result = self.run_bootstrap("return 0", mode="worker", body=body)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertEqual(result.stdout.strip(), "BROKER_SELECTED")


if __name__ == "__main__":
    unittest.main()
