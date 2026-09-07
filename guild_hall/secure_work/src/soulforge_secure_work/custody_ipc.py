"""Purpose-bound M10 session. Only approved candidate bytes and metadata cross.

Controller retains its outbox/SQLite; sender owns custody authority/credential
and the existing IngressClient. No private controller path enters this protocol.
The inherited child below is the SAME custody sender, never a worker fallback.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import queue
import subprocess
import threading
import time

from .ipc import Frames, exact, _scope, exchange, serve_connection, digest
from .ipc_pipe import Pipe, ChannelError, current_sid, remaining


def contract(scope=None, deadline=None):
    from . import launch_runtime
    launch_runtime.context()
    result = launch_runtime.call_launcher(["--custody-channel-contract"],
        body=json.dumps({"scope": scope}).encode(), timeout=min(60, remaining(deadline)) if deadline else 60)
    if result.returncode or len(result.stdout) > 8192:
        raise ChannelError("CUSTODY_CHANNEL_AUTHORITY_HOLD")
    value = json.loads(result.stdout)
    exact(value, {"role", "purpose", "scope", "controller_sid", "sender_sid", "pipe", "expires_at"})
    _scope(value["scope"])
    if (value["role"] not in {"controller", "sender"} or value["purpose"] != "custody.deposit"
            or value["controller_sid"] == value["sender_sid"]
            or current_sid() != value[value["role"] + "_sid"]
            or (scope is not None and value["scope"] != scope)
            or type(value["expires_at"]) is not int or value["expires_at"] <= time.time() * 1000):
        raise ChannelError("CUSTODY_CHANNEL_AUTHORITY_HOLD")
    return value


def command(request):
    from .custody import binding_digest
    binding = request.get("binding")
    exact(binding, {"project_hint", "occurrence_id", "idempotency_key", "input_revision", "sha256", "size", "route_sha256"})
    if request.get("operation") == "authorize":
        value = {"operation": "authorize", "binding": binding}
    else:
        if request.get("action") not in {"upload", "status"}:
            raise ChannelError("CUSTODY_COMMAND_INVALID")
        value = {"operation": "execute", "binding": binding, "action": request["action"],
                 "submission_id": request.get("submission_id")}
    # Return a detached, bounded control object. No principal/candidate_path,
    # ingress URL, environment, credential location or callback is forwarded.
    raw = json.dumps(value, allow_nan=False).encode("ascii")
    if len(raw) > 4096:
        raise ChannelError("CUSTODY_COMMAND_INVALID")
    return json.loads(raw), binding_digest(value)


class CustodySession:
    def __init__(self, scope, current):
        self.bound = contract(scope)
        if self.bound["role"] != "controller" or not callable(current):
            raise ChannelError("CUSTODY_CHANNEL_AUTHORITY_HOLD")
        self.scope, self.current, self.sequence = scope, current, 0
        self.deadline = time.monotonic() + min(120, (self.bound["expires_at"] / 1000 - time.time()))
        self.pipe = Pipe.connect(self.bound["pipe"], self.bound["sender_sid"], self.deadline)

    def live(self):
        if contract(self.scope, self.deadline) != self.bound:
            raise ChannelError("CUSTODY_CHANNEL_AUTHORITY_CHANGED")
        self.current()
        remaining(self.deadline)

    def request(self, request, body=b"."):
        value, attempt = command(request)
        self.live()
        self.sequence += 1
        if self.sequence > 6:
            raise ChannelError("CUSTODY_COMMAND_LIMIT")
        Frames(self.pipe).send({"kind": "custody_command", "sequence": self.sequence, "request": value})
        reply = exchange(self.pipe, self.scope, attempt, body, self.live, max_checks=256)
        if len(reply) > 32768:
            raise ChannelError("CUSTODY_RESPONSE_LIMIT")
        return json.loads(reply)

    def close(self):
        try:
            Frames(self.pipe).send({"kind": "custody_end", "sequence": self.sequence})
        except (ChannelError, OSError):
            pass
        finally:
            self.pipe.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


class ChildPipe:
    """One I/O thread; process termination releases blocked reads and writes."""
    def __init__(self, process, deadline):
        self.process, self.deadline = process, deadline
        self.requests, self.results = queue.Queue(1), queue.Queue(1)
        def reader():
            while True:
                action = self.requests.get()
                if action is None:
                    return
                try:
                    operation, value = action
                    if operation == "read":
                        self.results.put(self.process.stdout.read(value))
                    else:
                        self.process.stdin.write(value)
                        self.process.stdin.flush()
                        self.results.put(True)
                except (OSError, ValueError):
                    self.results.put(None)
        self.thread = threading.Thread(target=reader, daemon=True)
        self.thread.start()

    def read(self, size):
        self.requests.put(("read", size))
        try:
            body = self.results.get(timeout=remaining(self.deadline))
        except queue.Empty:
            raise ChannelError("CUSTODY_BRIDGE_DEADLINE") from None
        if not isinstance(body, bytes) or len(body) != size:
            raise ChannelError("CUSTODY_BRIDGE_CLOSED")
        return body

    def write(self, body):
        self.requests.put(("write", body))
        try:
            result = self.results.get(timeout=remaining(self.deadline))
        except queue.Empty:
            raise ChannelError("CUSTODY_BRIDGE_DEADLINE") from None
        if result is not True:
            raise ChannelError("CUSTODY_BRIDGE_CLOSED")

    def stop(self):
        if self.process.poll() is None:
            self.process.kill()
        self.process.wait(timeout=5)
        self.requests.put(None)
        self.thread.join(timeout=1)
        self.process.stdin.close()
        self.process.stdout.close()


def run_operation(request, body, current, deadline):
    from . import launch_runtime
    state = launch_runtime.context()
    launch_runtime.recheck()
    process = subprocess.Popen([state["node"], state["launcher"], "--custody-operation"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        cwd=str(Path(state["node"]).parent), env=dict(state["environment"]),
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    io = ChildPipe(process, deadline)
    wire = Frames(io)
    try:
        wire.send(request)
        wire.send(body, 1)
        checks = 0
        while True:
            message = wire.receive()
            if message.get("kind") == "check":
                exact(message, {"kind", "sequence"})
                checks += 1
                if type(message["sequence"]) is not int or message["sequence"] != checks or checks > 256:
                    raise ChannelError("CUSTODY_BRIDGE_ORDER")
                current()
                remaining(deadline)
                wire.send({"kind": "authorized", "sequence": checks})
            elif message.get("kind") == "result":
                exact(message, {"kind", "result"})
                current()
                wire.send({"kind": "received"})
                if process.wait(timeout=remaining(deadline)) != 0:
                    raise ChannelError("CUSTODY_BRIDGE_CLOSED")
                return message["result"]
            else:
                raise ChannelError("CUSTODY_BRIDGE_ORDER")
    finally:
        io.stop()


def serve_session(pipe, scope, current, operation):
    sequence = 0
    while True:
        message = Frames(pipe).receive()
        if message.get("kind") == "custody_end":
            exact(message, {"kind", "sequence"})
            if message["sequence"] != sequence:
                raise ChannelError("CUSTODY_COMMAND_ORDER")
            return
        exact(message, {"kind", "sequence", "request"})
        if sequence >= 6:
            raise ChannelError("CUSTODY_COMMAND_LIMIT")
        sequence += 1
        if message["kind"] != "custody_command" or type(message["sequence"]) is not int or message["sequence"] != sequence:
            raise ChannelError("CUSTODY_COMMAND_ORDER")
        request, attempt = command(message["request"])
        if request != message["request"]:
            raise ChannelError("CUSTODY_COMMAND_INVALID")
        def handler(body, actual_attempt, upstream):
            if actual_attempt != attempt:
                raise ChannelError("CUSTODY_COMMAND_BINDING")
            if request.get("action") == "upload":
                if len(body) != request["binding"]["size"] or digest(body) != request["binding"]["sha256"]:
                    raise ChannelError("CUSTODY_CANDIDATE_CHANGED")
            elif body != b".":
                raise ChannelError("CUSTODY_COMMAND_INVALID")
            result = operation(request, body, upstream, pipe.deadline)
            raw = json.dumps(result, separators=(",", ":"), allow_nan=False).encode()
            if len(raw) > 32768:
                raise ChannelError("CUSTODY_RESPONSE_LIMIT")
            return raw
        try:
            serve_connection(pipe, scope, current, handler, max_checks=256)
        except Exception:
            # Bounded generic failure, never provider error text or bytes.
            try:
                Frames(pipe).send({"kind": "failed"})
                acknowledgment = Frames(pipe).receive()
                if acknowledgment != {"kind": "failed_received"}:
                    raise ChannelError("CUSTODY_COMMAND_ORDER")
            except (OSError, ChannelError):
                pass
            raise


def serve_runtime():
    bound = contract()
    if bound["role"] != "sender":
        raise ChannelError("CUSTODY_CHANNEL_AUTHORITY_HOLD")
    deadline = time.monotonic() + min(120, bound["expires_at"] / 1000 - time.time())
    def current():
        if contract(bound["scope"], deadline) != bound:
            raise ChannelError("CUSTODY_CHANNEL_AUTHORITY_CHANGED")
    with Pipe.listen(bound["pipe"], bound["controller_sid"], deadline) as pipe:
        serve_session(pipe, bound["scope"], current, run_operation)
    return 0
