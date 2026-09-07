"""Post-verification Python startup, never a replacement for the Node/OS anchor.

Node has already checked the interpreter, its _pth startup, stdlib/native files,
source, kit, recipes and all dependencies. This guard catches later file drift
and rejects resolution outside that closed set. It grants no worker OS identity.
"""
from __future__ import annotations

import sys

# Direct execution cannot supply the packet through argv, environment or stdin.
if __name__ == "__main__" and "_LAUNCH_PACKET" not in globals():
    raise SystemExit("SECURE_WORK_LAUNCH_HOLD")
if __name__ == "__main__" and len(_LAUNCH_PACKET) > 16777216:
    raise SystemExit("SECURE_WORK_LAUNCH_HOLD")

import hashlib
import importlib.machinery
import importlib.util
import json
import os
import subprocess
from pathlib import Path

_STATE = None


def _fail():
    raise RuntimeError("SECURE_WORK_LAUNCH_HOLD")


def _norm(value):
    return os.path.normcase(os.path.abspath(value))


def _checked_bytes(filename):
    expected = _STATE["files"].get(_norm(filename))
    if expected is None:
        _fail()
    target = Path(filename)
    if any(part.is_symlink() or (hasattr(part, "is_junction") and part.is_junction())
           for part in [target, *target.parents]):
        _fail()
    with target.open("rb") as stream:
        before = os.fstat(stream.fileno())
        body = stream.read()
        after = os.fstat(stream.fileno())
    if (before.st_nlink != 1 or after.st_nlink != 1
            or (before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
            != (after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns)
            or hashlib.sha256(body).hexdigest() != expected):
        _fail()
    return body


class _SourceLoader(importlib.machinery.SourceFileLoader):
    def get_code(self, fullname):
        # Ignore .pyc caches, including existing ones: compile the exact checked
        # source bytes, not a second unchecked read selected by a cache timestamp.
        return self.source_to_code(_checked_bytes(self.path), self.path)


class _ClosedFinder:
    @classmethod
    def find_spec(cls, fullname, path=None, target=None):
        spec = importlib.machinery.PathFinder.find_spec(fullname, path, target)
        if spec is None:
            return None
        if spec.origin is None and spec.submodule_search_locations is not None:
            for location in spec.submodule_search_locations:
                if not any(p.startswith(_norm(location) + os.sep) for p in _STATE["files"]):
                    _fail()
            return spec
        if not isinstance(spec.origin, str):
            _fail()
        _checked_bytes(spec.origin)
        if isinstance(spec.loader, importlib.machinery.SourceFileLoader):
            spec.loader = _SourceLoader(fullname, spec.origin)
        elif not isinstance(spec.loader, importlib.machinery.ExtensionFileLoader):
            # Zip/custom/sourceless loaders are not silently exempted. This
            # installation contract uses explicit normal directories and source.
            _fail()
        return spec


def context():
    if _STATE is None:
        _fail()
    return _STATE


def is_launched():
    return _STATE is not None


def call_launcher(arguments, *, body=None, timeout=60):
    state = context()
    _checked_bytes(state["node"])
    _checked_bytes(state["launcher"])
    return subprocess.run(
        [state["node"], state["launcher"], *arguments], input=body,
        capture_output=True, env=dict(state["environment"]),
        cwd=str(Path(state["node"]).parent), timeout=timeout,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )


def recheck():
    result = call_launcher(["--preflight"])
    if result.returncode or result.stdout.strip() != b'{"ok":true,"code":"SECURE_WORK_LAUNCH_VERIFIED"}':
        _fail()


def recheck_if_launched():
    # Pure module contract tests can use explicit synthetic constructors. The
    # production CLI always requires context(), and cannot take this branch.
    if _STATE is not None:
        recheck()


def _role_proof(arguments, request):
    if not is_launched():
        return None  # Explicit in-process synthetic contract fixtures only.
    result = call_launcher(arguments, body=json.dumps(request).encode("utf-8"))
    if result.returncode or len(result.stdout) > 32768:
        _fail()
    proof = json.loads(result.stdout)
    if (not isinstance(proof, dict) or set(proof) != {"project_ref", "assignment_ref", "assignment_epoch",
            "task_ref", "route_sha256", "audience", "policy_epoch", "principal_ref", "purpose", "issuer_key_id", "expires_at"}):
        _fail()
    return proof


def role_entry(operation):
    """Read the current installed role/context before opening job metadata.

    This invokes the consumer's existing entry check. It does not authorize
    any job-specific action; that still requires role_check(operation, scope).
    """
    return _role_proof(["--role-entry"], {"operation": operation})


def role_check(operation, scope=None, record=None):
    request = {"operation": operation, "scope": scope}
    if operation == "permit.identity":
        request["record"] = record
    return _role_proof(["--role-check"], request)


def job_scope(job):
    return {"project_ref": job.data.get("project_ref"), "assignment_ref": job.data.get("assignment_ref"),
            "assignment_epoch": job.data.get("assignment_epoch"), "task_ref": job.data.get("task_ref"),
            "policy_epoch": job.data.get("policy_epoch"), "route_sha256": job.data.get("route_sha256"),
            "audience": job.data.get("transport_id")}


def require_sender_channel(scope):
    if is_launched():
        role_check("model.dispatch", scope)
        # The controller still owns source/vault and the journal call stack.
        # Until the scoped metadata/byte channel exists, no live role may use
        # that stack as a substitute sender or consume its permit.
        raise RuntimeError("SENDER_CONTROLLER_CHANNEL_UNBOUND")


def checked_config(path=None):
    state = context()
    if path is not None and _norm(path) != _norm(state["config_path"]):
        _fail()
    recheck()
    body = Path(state["config_path"]).read_bytes()
    if hashlib.sha256(body).hexdigest() != state["config_sha256"]:
        _fail()
    return Path(state["config_path"]), body


def initialize(packet):
    global _STATE
    if _STATE is not None or not sys.flags.isolated or not sys.flags.no_site or not sys.dont_write_bytecode:
        _fail()
    _STATE = packet
    if sys.path != packet["python_paths"]:
        _fail()
    # Keep builtin/frozen modules, replace the normal resolver. No site hooks,
    # custom finder, zip loader, cwd, environment or registry path participates.
    sys.meta_path[:] = [importlib.machinery.BuiltinImporter,
                        importlib.machinery.FrozenImporter, _ClosedFinder]
    # Startup modules were covered by Node's whole-tree check. Record validation
    # here detects a mistaken/incomplete _pth layout as well.
    for module in tuple(sys.modules.values()):
        filename = getattr(module, "__file__", None)
        if filename and not filename.startswith("<"):
            _checked_bytes(filename)


def main(packet):
    initialize(packet)
    if packet["mode"] == "worker":
        from soulforge_secure_work.worker import main as entry
        return entry()
    if packet["mode"] == "cli":
        from soulforge_secure_work.cli import main as entry
        return entry(packet["argv"])
    _fail()


if __name__ == "__main__":
    # Publish the SAME initialized module; a later config/adapter import must
    # not create a second uninitialized guard under its normal module name.
    import types
    module = types.ModuleType("soulforge_secure_work.launch_runtime")
    module.__dict__.update(globals())
    module.__name__ = "soulforge_secure_work.launch_runtime"
    sys.modules[module.__name__] = module
    try:
        raise SystemExit(module.main(json.loads(_LAUNCH_PACKET)))
    except (RuntimeError, OSError, ValueError, ImportError):
        sys.stdout.write('{"ok":false,"code":"SECURE_WORK_LAUNCH_HOLD"}\n')
        raise SystemExit(2) from None
