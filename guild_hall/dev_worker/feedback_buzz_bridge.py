"""Installed-gateway candidate for one authorized manager feedback notice.

No transport/client is constructed here. register_installed_adapter is called on
the gateway event loop with its already-connected native BuzzAdapter. The caller
must pin this module and the authorization code in its reviewed installation.
This module does not load bindings, profiles, credentials, or activate itself.
"""

import asyncio
import concurrent.futures
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import threading


ENVELOPE_KEYS = frozenset((
    "version", "dispatch_ref", "project_ref", "event_key", "notice_ref",
    "notice_sha256", "state", "manager_route_id", "route_sha256", "profile_ref",
    "bot_chat_id", "sender_ref", "purpose", "issued_at", "expires_at", "text",
))
HASH = re.compile(r"^[0-9a-f]{64}$")
REF = re.compile(r"^[A-Za-z0-9_.:-]{1,200}$")


def envelope_sha256(envelope):
    """Cross-language contract: sorted keys, compact JSON, literal UTF-8."""
    return hashlib.sha256(json.dumps(envelope, sort_keys=True, ensure_ascii=False,
                                    separators=(",", ":"), allow_nan=False).encode("utf-8")).hexdigest()


def file_sha256(path):
    with open(path, "rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


@dataclass(frozen=True)
class NativeBinding:
    node_executable: str
    node_executable_sha256: str
    authorization_script: str
    authorization_script_sha256: str
    # Full fixed suffix after the script, including command, DB and authority pins.
    authorization_argv: tuple
    # Every transitive local authorization source must be listed by the installer.
    authorization_code_pins: tuple
    ledger_path: str
    profile_ref: str
    bot_ref: str
    loopback_port: int
    authorization_timeout: float = 10.0
    response_timeout: float = 15.0

    def validate(self):
        if not isinstance(self.authorization_argv, tuple) or not all(
                isinstance(x, str) and "\x00" not in x for x in self.authorization_argv):
            raise ValueError("invalid authorization argv")
        if not isinstance(self.authorization_code_pins, tuple):
            raise ValueError("invalid code pins")
        if not self.profile_ref or not self.bot_ref or not 0 <= self.loopback_port <= 65535:
            raise ValueError("invalid native binding")
        if not 0 < self.authorization_timeout <= 30 or not 0 < self.response_timeout <= 60:
            raise ValueError("invalid timeout")
        if not Path(self.ledger_path).is_absolute() or not Path(self.ledger_path).parent.is_dir():
            raise ValueError("ledger parent must already exist")
        self.verify_code()

    def verify_code(self):
        for name, digest in (
                (self.node_executable, self.node_executable_sha256),
                (self.authorization_script, self.authorization_script_sha256),
                *self.authorization_code_pins):
            if not Path(name).is_absolute() or not HASH.fullmatch(digest) or file_sha256(name) != digest:
                raise ValueError("authorization code pin mismatch")


def _request(value):
    if (not isinstance(value, dict) or set(value) != {"dispatch_ref", "envelope_sha256"}
            or not isinstance(value["dispatch_ref"], str) or not REF.fullmatch(value["dispatch_ref"])
            or not isinstance(value["envelope_sha256"], str) or not HASH.fullmatch(value["envelope_sha256"])):
        raise ValueError("invalid request")
    return value


def _metadata(request, status, message_id=None):
    result = dict(request, status=status)
    if message_id is not None:
        result["message_id"] = message_id
    return result


class NativeBridge:
    def __init__(self, adapter, binding, loop):
        binding.validate()
        self.adapter, self.binding, self.loop = adapter, binding, loop
        self._server = None
        self._thread = None
        with self._database() as db:
            db.execute("CREATE TABLE IF NOT EXISTS feedback_native_attempts ("
                       "dispatch_ref TEXT PRIMARY KEY, envelope_sha256 TEXT NOT NULL, "
                       "status TEXT NOT NULL CHECK(status IN ('UNKNOWN','ACKNOWLEDGED')), "
                       "message_id TEXT, attempted_at TEXT NOT NULL)")

    def _database(self):
        # Connections are short lived, and FULL + commit completes before send.
        class Database:
            def __enter__(inner):
                inner.db = sqlite3.connect(self.binding.ledger_path, timeout=5)
                inner.db.execute("PRAGMA synchronous=FULL")
                return inner.db

            def __exit__(inner, kind, value, traceback):
                try:
                    inner.db.commit() if kind is None else inner.db.rollback()
                finally:
                    inner.db.close()
        return Database()

    def receipt(self, request):
        request = _request(request)
        with self._database() as db:
            row = db.execute("SELECT envelope_sha256,status,message_id FROM feedback_native_attempts "
                             "WHERE dispatch_ref=?", (request["dispatch_ref"],)).fetchone()
        if row is None:
            return _metadata(request, "NOT_FOUND")
        if row[0] != request["envelope_sha256"]:
            return _metadata(request, "COLLISION")
        return _metadata(request, row[1], row[2])

    def _authorize(self, request):
        self.binding.verify_code()
        argv = [self.binding.node_executable, self.binding.authorization_script,
                *self.binding.authorization_argv, "--dispatch-ref", request["dispatch_ref"],
                "--envelope-sha256", request["envelope_sha256"]]
        # Do not inherit NODE_OPTIONS, credentials or ambient configuration.
        env = {key: os.environ[key] for key in ("SystemRoot", "WINDIR", "TEMP", "TMP") if key in os.environ}
        process = subprocess.Popen(argv, shell=False, stdin=subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env)
        timer = threading.Timer(self.binding.authorization_timeout, process.kill)
        timer.start()
        try:
            output = process.stdout.read(65537)
            if len(output) > 65536:
                process.kill()
                raise ValueError("authorization output too large")
            if process.wait() != 0:
                raise ValueError("authorization failed")
            result = json.loads(output.decode("utf-8"))
            if not isinstance(result, dict) or result.get("status") != "AUTHORIZED":
                raise ValueError("authorization refused")
            return result["envelope"]
        finally:
            timer.cancel()
            if process.poll() is None:
                process.kill()
            process.wait()
            process.stdout.close()

    def _check_native_envelope(self, envelope, request):
        # This is the real Hermes identity reader, not a sender callback.
        from hermes_cli.profiles import get_active_profile_name
        from plugins.platforms.buzz.adapter import BuzzAdapter
        if (not isinstance(self.adapter, BuzzAdapter) or not isinstance(envelope, dict)
                or set(envelope) != ENVELOPE_KEYS or type(envelope["version"]) is not int
                or envelope["version"] != 1 or not all(isinstance(envelope[k], str) for k in ENVELOPE_KEYS - {"version"})
                or envelope_sha256(envelope) != request["envelope_sha256"]
                or envelope["dispatch_ref"] != request["dispatch_ref"]
                or envelope["purpose"] != "manager_feedback_notice"
                or envelope["profile_ref"] != self.binding.profile_ref
                or get_active_profile_name() != self.binding.profile_ref
                or envelope["sender_ref"] != self.binding.bot_ref
                or getattr(self.adapter, "_self_pubkey", None) != self.binding.bot_ref
                or not envelope["bot_chat_id"] or not envelope["text"] or len(envelope["text"]) > 3000):
            raise ValueError("native envelope mismatch")
        now = datetime.now(timezone.utc)
        issued = datetime.fromisoformat(envelope["issued_at"].replace("Z", "+00:00"))
        expires = datetime.fromisoformat(envelope["expires_at"].replace("Z", "+00:00"))
        if issued.tzinfo is None or expires.tzinfo is None or not issued <= now < expires:
            raise ValueError("envelope expired or future issued")

    async def _attempt(self, request):
        previous = self.receipt(request)
        if previous["status"] != "NOT_FOUND":
            return previous
        try:
            envelope = await asyncio.to_thread(self._authorize, request)
            self._check_native_envelope(envelope, request)
        except Exception:
            return _metadata(request, "DENIED")
        # Another HTTP request/process may have consumed this dispatch meanwhile.
        try:
            with self._database() as db:
                db.execute("INSERT INTO feedback_native_attempts VALUES (?,?,'UNKNOWN',NULL,?)",
                           (request["dispatch_ref"], request["envelope_sha256"], datetime.now(timezone.utc).isoformat()))
        except sqlite3.IntegrityError:
            return self.receipt(request)
        try:
            self._check_native_envelope(envelope, request)
            result = await self.adapter._send_with_retry(
                envelope["bot_chat_id"], envelope["text"], reply_to=None,
                metadata=None, max_retries=0)
            raw = getattr(result, "raw_response", None)
            message_id = getattr(result, "message_id", None)
            if (getattr(result, "success", None) is True and isinstance(raw, dict)
                    and raw.get("accepted") is True and isinstance(message_id, str)
                    and message_id.strip() and len(message_id) <= 512):
                with self._database() as db:
                    db.execute("UPDATE feedback_native_attempts SET status='ACKNOWLEDGED',message_id=? "
                               "WHERE dispatch_ref=? AND envelope_sha256=? AND status='UNKNOWN'",
                               (message_id, request["dispatch_ref"], request["envelope_sha256"]))
        except Exception:
            # Failure/timeout is not proof that the service did not accept it.
            pass
        return self.receipt(request)

    def send(self, request):
        request = _request(request)
        if not self.loop.is_running():
            return _metadata(request, "DENIED")
        future = asyncio.run_coroutine_threadsafe(self._attempt(request), self.loop)
        try:
            return future.result(timeout=self.binding.response_timeout)
        except concurrent.futures.TimeoutError:
            # Keep the in-flight coroutine alive so a late ACK can be recorded.
            return _metadata(request, "UNKNOWN")
        except Exception:
            return _metadata(request, "UNKNOWN")

    def start(self):
        bridge = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                try:
                    self.connection.settimeout(5)
                    length = int(self.headers.get("Content-Length", "0"))
                    if not 0 < length <= 2048 or self.headers.get("Transfer-Encoding") is not None:
                        raise ValueError("invalid request size")
                    payload = self.rfile.read(length)
                    if (self.headers.get("Host") != "127.0.0.1:" + str(self.server.server_port)
                            or self.headers.get("Origin") is not None
                            or self.headers.get("Content-Type") != "application/json"
                            or self.headers.get("Transfer-Encoding") is not None
                            or self.path not in ("/send", "/receipt")):
                        raise ValueError("invalid HTTP boundary")
                    request = _request(json.loads(payload))
                    result = bridge.send(request) if self.path == "/send" else bridge.receipt(request)
                    status = 200
                except Exception:
                    result, status = {"status": "DENIED"}, 400
                output = json.dumps(result, separators=(",", ":")).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(output)))
                self.end_headers()
                try:
                    self.wfile.write(output)
                except (BrokenPipeError, ConnectionResetError):
                    pass

        self._server = ThreadingHTTPServer(("127.0.0.1", self.binding.loopback_port), Handler)
        self._server.daemon_threads = True
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        return self

    @property
    def port(self):
        return self._server.server_port

    def close(self):
        if self._server:
            self._server.shutdown()
            self._server.server_close()
            self._thread.join(timeout=5)


def register_installed_adapter(adapter, binding):
    """Explicit reviewed vendor hook: call after connect on the gateway loop.

    Store the returned object on the adapter; call close during disconnect. No
    default port, runtime discovery, transport construction, or auto activation.
    """
    from hermes_cli.profiles import get_active_profile_name
    from plugins.platforms.buzz.adapter import BuzzAdapter
    if (not isinstance(adapter, BuzzAdapter) or get_active_profile_name() != binding.profile_ref
            or getattr(adapter, "_self_pubkey", None) != binding.bot_ref):
        raise ValueError("installed native identity mismatch")
    return NativeBridge(adapter, binding, asyncio.get_running_loop()).start()
