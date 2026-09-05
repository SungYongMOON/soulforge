"""Adapter bindings for the E14 ports.

Every adapter answers `probe()` with a bounded availability record and refuses to
invent a success. An unbound endpoint, a missing key file or a missing bearer is
`ADAPTER_UNAVAILABLE`, never a stub that pretends the call happened.

Credential files are checked for presence and shape only. No adapter reads, logs
or returns a credential value.
"""
from __future__ import annotations

import json
import os
import secrets
import sqlite3
import subprocess
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from . import winsec


class AdapterUnavailable(RuntimeError):
    def __init__(self, module: str, reason: str) -> None:
        self.module = module
        self.reason = reason
        super().__init__(f"ADAPTER_UNAVAILABLE:{module}:{reason}")


@dataclass(frozen=True)
class Probe:
    module: str
    name: str
    state: str  # AVAILABLE | UNAVAILABLE | DISABLED
    detail: str

    def as_row(self) -> dict:
        return {"module": self.module, "adapter": self.name, "state": self.state,
                "detail": self.detail}


def _file_shape(path: Path) -> str:
    """Presence and shape only. The value is never read into a variable."""
    if not path.is_file():
        return "missing"
    size = path.stat().st_size
    if size == 0:
        return "empty"
    if size > 4096:
        return "too_large"
    return "present"


# --- M01 source -------------------------------------------------------------

class FileSystemSource:
    module = "M01"
    name = "filesystem.exact_revision"

    def __init__(self, source_root: Path) -> None:
        self.source_root = Path(source_root)

    def probe(self) -> Probe:
        if not self.source_root.is_dir():
            return Probe(self.module, self.name, "UNAVAILABLE", "source root missing")
        count = len(list(self.source_root.glob("*.md")))
        if count == 0:
            return Probe(self.module, self.name, "UNAVAILABLE", "no source documents")
        return Probe(self.module, self.name, "AVAILABLE", f"{count} synthetic documents")


# --- M02 local manager (G2) -------------------------------------------------

class LocalManagerAdapter:
    """OpenAI-compatible local endpoint. Local inference only, never a fallback
    to an external provider."""

    module = "M02"
    name = "openai_compatible.local"

    def __init__(self, base_url: str, model: str | None, timeout_s: int, enabled: bool,
                 chat_template_kwargs: dict | None = None, max_tokens: int = 3000) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_s = timeout_s
        self.enabled = enabled
        # Asking the local runtime not to emit a hidden reasoning block keeps
        # the answer budget for the answer, and keeps hidden reasoning out of
        # this process entirely rather than relying on us to ignore it.
        self.chat_template_kwargs = chat_template_kwargs or {"enable_thinking": False}
        self.max_tokens = max_tokens

    def _get(self, path: str) -> dict:
        request = urllib.request.Request(f"{self.base_url}{path}", method="GET")
        with urllib.request.urlopen(request, timeout=min(self.timeout_s, 10)) as response:
            return json.loads(response.read().decode("utf-8"))

    def probe(self) -> Probe:
        if not self.enabled:
            return Probe(self.module, self.name, "DISABLED", "adapter disabled in config")
        try:
            payload = self._get("/models")
        except (urllib.error.URLError, OSError, ValueError, TimeoutError):
            return Probe(self.module, self.name, "UNAVAILABLE", f"no response at {self.base_url}")
        models = [item.get("id", "") for item in payload.get("data", []) if isinstance(item, dict)]
        return Probe(self.module, self.name, "AVAILABLE", f"{len(models)} local model(s)")

    def resolve_model(self) -> str:
        if self.model and self.model != "auto":
            return self.model
        payload = self._get("/models")
        data = payload.get("data") or []
        if not data:
            raise AdapterUnavailable(self.module, "no_local_model")
        return str(data[0].get("id"))

    def propose(self, prompt: str, max_tokens: int | None = None) -> tuple[str, str, str]:
        """Return (model_id, visible answer, finish reason). Local endpoint only.

        Only `message.content` is read. Some local runtimes also return a
        `reasoning_content` field; hidden reasoning is never read, stored or
        logged by this lane.
        """
        if not self.enabled:
            raise AdapterUnavailable(self.module, "disabled")
        try:
            model = self.resolve_model()
            body = json.dumps({
                "model": model,
                "messages": [
                    {"role": "system", "content": "You answer with one strict JSON object and nothing else."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0,
                "max_tokens": max_tokens or self.max_tokens,
                "stream": False,
                "chat_template_kwargs": self.chat_template_kwargs,
            }).encode("utf-8")
            request = urllib.request.Request(
                f"{self.base_url}/chat/completions", data=body, method="POST",
                headers={"content-type": "application/json"},
            )
            with urllib.request.urlopen(request, timeout=self.timeout_s) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, OSError, ValueError, TimeoutError, KeyError) as error:
            raise AdapterUnavailable(self.module, type(error).__name__) from None
        choices = payload.get("choices") or []
        if not choices:
            raise AdapterUnavailable(self.module, "empty_choices")
        first = choices[0]
        finish = str(first.get("finish_reason", "unknown"))
        return model, str(first.get("message", {}).get("content", "") or ""), finish


# --- M04 binding vault ------------------------------------------------------

class LocalFileKeyWrapper:
    """TEST-ONLY key wrapper.

    The wrapping key is a local file. `0o600` is requested at creation, but on
    Windows that mode is not enforced -- CPython maps it to the read-only
    attribute only, and the real ACL comes from the parent directory (observed
    2026-09-06: BUILTIN\\Users held inherited read access). This class also
    tries an explicit ACL lockdown (`winsec.restrict_to_current_user`) right
    after creating the file and records what happened next to the key, never
    what the key contains. It is not an OS key store, not a KMS and not an
    operational key owner; the E14 kit calls this class of wrapper
    `KEY_WRAPPER_TEST_ONLY` and this lane keeps that label. Synthetic material
    only.
    """

    KEY_ID = "LOCAL_FILE_TEST_ONLY"
    ACL_RECEIPT_SCHEMA = "soulforge.secure_work.keywrap_acl.v0"

    def __init__(self, path: Path) -> None:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        self._aesgcm = AESGCM
        self.path = Path(path)
        if not self.path.exists():
            self.path.parent.mkdir(parents=True, exist_ok=True)
            material = AESGCM.generate_key(bit_length=256)
            handle = os.open(str(self.path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                os.write(handle, material)
            finally:
                os.close(handle)
            del material
            lockdown = winsec.restrict_to_current_user(self.path)
            self._acl_receipt_path.write_text(json.dumps({
                "schema": self.ACL_RECEIPT_SCHEMA,
                **lockdown.as_dict(),
            }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        self._key = self.path.read_bytes()
        if len(self._key) != 32:
            raise AdapterUnavailable("M04", "key_wrapper_shape")

    @property
    def _acl_receipt_path(self) -> Path:
        return self.path.with_name(self.path.name + ".acl_receipt.json")

    def acl_lockdown_receipt(self) -> dict | None:
        """What happened the one time this key file was created. No value or path in it."""
        if not self._acl_receipt_path.is_file():
            return None
        try:
            return json.loads(self._acl_receipt_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def wrap(self, dek: bytes) -> tuple[str, bytes]:
        nonce = secrets.token_bytes(12)
        return self.KEY_ID, nonce + self._aesgcm(self._key).encrypt(nonce, dek, b"sf-secure-work-wrap-v0")

    def unwrap(self, key_id: str, wrapped: bytes) -> bytes:
        if key_id != self.KEY_ID:
            raise AdapterUnavailable("M04", "key_unavailable")
        return self._aesgcm(self._key).decrypt(wrapped[:12], wrapped[12:], b"sf-secure-work-wrap-v0")


class VaultAdapter:
    module = "M04"
    name = "sqlite.local_file_key"

    def __init__(self, vault_root: Path, keywrap_path: Path) -> None:
        self.vault_root = Path(vault_root)
        self.keywrap_path = Path(keywrap_path)

    def probe(self) -> Probe:
        if not self.vault_root.is_dir():
            return Probe(self.module, self.name, "UNAVAILABLE", "vault root missing")
        shape = _file_shape(self.keywrap_path)
        if shape == "missing":
            return Probe(self.module, self.name, "AVAILABLE", "test key wrapper not yet created")
        if shape != "present":
            return Probe(self.module, self.name, "UNAVAILABLE", f"key wrapper {shape}")
        warning = self._acl_warning()
        detail = "test key wrapper present" + (f"; WARNING {warning}" if warning else "")
        return Probe(self.module, self.name, "AVAILABLE", detail)

    def _acl_warning(self) -> str | None:
        """Surface a failed ACL lockdown here so an operator sees it without
        having to open the vault. Never reads the key material itself."""
        receipt_path = self.keywrap_path.with_name(self.keywrap_path.name + ".acl_receipt.json")
        if not receipt_path.is_file():
            return None
        try:
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return "acl_receipt_unreadable"
        if receipt.get("applied") is False:
            return f"acl_lockdown_failed:{receipt.get('detail', 'UNKNOWN')}"
        return None

    def open(self, job_id: str):
        from sf_sewe.vault import SqliteBindingVault

        self.vault_root.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.vault_root / f"{job_id}.sqlite")
        return SqliteBindingVault(connection, LocalFileKeyWrapper(self.keywrap_path)), connection


# --- M06 provider transport -------------------------------------------------

class ScriptedWorkerTransport:
    """Cycle-1 worker. Runs in a separate process whose working directory holds
    nothing but the released body, so it cannot reach the source directory, the
    vault or the job store even by accident."""

    module = "M06"
    name = "scripted.subprocess"

    def __init__(self, python_executable: str, package_root: Path, kit_src: Path) -> None:
        self.python_executable = python_executable
        self.package_root = Path(package_root)
        self.kit_src = Path(kit_src)

    def probe(self) -> Probe:
        if not Path(self.python_executable).is_file():
            return Probe(self.module, self.name, "UNAVAILABLE", "interpreter missing")
        return Probe(self.module, self.name, "AVAILABLE", "scripted worker, no network")

    def send_exact(self, body: bytes, workdir: Path) -> bytes:
        environment = {
            "PATH": os.environ.get("PATH", ""),
            "SYSTEMROOT": os.environ.get("SYSTEMROOT", ""),
            "PYTHONUTF8": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONPATH": os.pathsep.join([str(self.package_root), str(self.kit_src)]),
        }
        completed = subprocess.run(
            [self.python_executable, "-m", "soulforge_secure_work.worker"],
            input=body, capture_output=True, cwd=str(workdir), env=environment, timeout=120,
        )
        if completed.returncode != 0:
            raise RuntimeError("WORKER_FAILED")
        return completed.stdout


class OpenRouterTransport:
    """Skeleton for the external worker route. Cycle 1 performs zero calls.

    The key is a one-line file placed by the Owner outside this repository. This
    adapter checks that the file exists and has a plausible shape; it never reads
    the value here, and it refuses to dispatch while `live_enabled` is false.
    """

    module = "M06"
    name = "openrouter.https"

    def __init__(self, key_file: str | None, base_url: str, model: str | None,
                 live_enabled: bool) -> None:
        self.key_file = Path(key_file) if key_file else None
        self.base_url = base_url
        self.model = model
        self.live_enabled = live_enabled

    def probe(self) -> Probe:
        if self.key_file is None:
            return Probe(self.module, self.name, "UNAVAILABLE", "key file path not configured")
        shape = _file_shape(self.key_file)
        if shape != "present":
            return Probe(self.module, self.name, "UNAVAILABLE", f"key file {shape}")
        if not self.live_enabled:
            return Probe(self.module, self.name, "DISABLED", "key present, live route not enabled")
        return Probe(self.module, self.name, "AVAILABLE", "key present, live route enabled")

    def send_exact(self, body: bytes, workdir: Path) -> bytes:
        probe = self.probe()
        if probe.state != "AVAILABLE":
            raise AdapterUnavailable(self.module, probe.detail)
        raise AdapterUnavailable(self.module, "live_dispatch_not_implemented_in_cycle_1")


# --- M10 custody ------------------------------------------------------------

class TongsCustodyAdapter:
    """Client skeleton for Tongs (`dev-erp-mcp` ingress, `포트 4311` control /
    `포트 4312` ingress). Cycle 1 uploads nothing.

    The bearer is an Owner-issued one-line file; this adapter only checks that it
    exists. Without it, and without an explicit `live_enabled`, deposit is
    `ADAPTER_UNAVAILABLE` and the candidate stays in the local outbox.
    """

    module = "M10"
    name = "tongs.ingress_client"

    def __init__(self, client_cli: str | None, ingress_url: str, control_url: str,
                 token_file: str | None, live_enabled: bool) -> None:
        self.client_cli = Path(client_cli) if client_cli else None
        self.ingress_url = ingress_url
        self.control_url = control_url
        self.token_file = Path(token_file) if token_file else None
        self.live_enabled = live_enabled

    def probe(self) -> Probe:
        if self.client_cli is None or not self.client_cli.is_file():
            return Probe(self.module, self.name, "UNAVAILABLE", "ingress client not found")
        if self.token_file is None:
            return Probe(self.module, self.name, "UNAVAILABLE", "bearer file path not configured")
        shape = _file_shape(self.token_file)
        if shape != "present":
            return Probe(self.module, self.name, "UNAVAILABLE", f"bearer file {shape}")
        if not self.live_enabled:
            return Probe(self.module, self.name, "DISABLED", "bearer present, upload not enabled")
        return Probe(self.module, self.name, "AVAILABLE", "bearer present, upload enabled")

    def deposit(self, candidate_path: Path, project_hint: str, occurrence_id: str,
                idempotency_key: str) -> dict:
        probe = self.probe()
        if probe.state != "AVAILABLE":
            raise AdapterUnavailable(self.module, probe.detail)
        raise AdapterUnavailable(self.module, "live_upload_not_implemented_in_cycle_1")


def endpoint_probe(url: str, module: str, name: str, timeout_s: int = 3) -> Probe:
    """Liveness only. No bearer is sent and no body is read beyond the status."""
    try:
        request = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(request, timeout=timeout_s) as response:
            code = response.status
    except urllib.error.HTTPError as error:
        code = error.code
    except (urllib.error.URLError, OSError, ValueError, TimeoutError):
        return Probe(module, name, "UNAVAILABLE", f"no listener at {url}")
    return Probe(module, name, "AVAILABLE", f"listener responded {code}")
