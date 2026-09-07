"""Controller -> sender -> worker released-byte handoff.

M05/M07 and the OS controller lock remain in the controller. No job store,
source, vault, private paths, signing keys or callback objects cross this wire.
One pipe connection is one request: fresh challenge, no reconnect/retry. An
ambiguous transport raises into E14's existing DELIVERY_UNKNOWN transition.
"""
from __future__ import annotations

import hashlib
import json
import re
import secrets
import struct
import time

from .ipc_pipe import ChannelError, Pipe, current_sid, remaining

MAX_BODY = 1048576
MAX_CONTROL = 8192
SHA = re.compile(r"[a-f0-9]{64}")
SCOPE = {"project_ref", "assignment_ref", "assignment_epoch", "task_ref", "policy_epoch", "route_sha256", "audience"}


def digest(body):
    return hashlib.sha256(body).hexdigest()


def exact(value, fields):
    if not isinstance(value, dict) or set(value) != set(fields):
        raise ChannelError("CHANNEL_PROTOCOL_INVALID")


def _object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ChannelError("CHANNEL_PROTOCOL_INVALID")
        result[key] = value
    return result


class Frames:
    def __init__(self, pipe):
        self.pipe = pipe

    def send(self, value, kind=0):
        body = json.dumps(value, separators=(",", ":"), ensure_ascii=True).encode("ascii") if kind == 0 else value
        maximum = MAX_CONTROL if kind == 0 else MAX_BODY
        if not isinstance(body, bytes) or not 0 < len(body) <= maximum or kind not in (0, 1, 2):
            raise ChannelError("CHANNEL_FRAME_LIMIT")
        self.pipe.write(struct.pack("!BI", kind, len(body)) + body)

    def receive(self, kind=0):
        actual, size = struct.unpack("!BI", self.pipe.read(5))
        if actual != kind or not 0 < size <= (MAX_CONTROL if kind == 0 else MAX_BODY):
            raise ChannelError("CHANNEL_FRAME_LIMIT")
        body = self.pipe.read(size)
        if kind:
            return body
        try:
            value = json.loads(body.decode("ascii"), object_pairs_hook=_object,
                               parse_constant=lambda _: (_ for _ in ()).throw(ChannelError()))
            if not isinstance(value, dict):
                raise ChannelError()
            pending, nodes = [(value, 0)], 0
            while pending:
                member, depth = pending.pop()
                nodes += 1
                if depth > 3 or nodes > 64 or isinstance(member, list):
                    raise ChannelError("CHANNEL_PROTOCOL_INVALID")
                if isinstance(member, dict):
                    pending.extend((child, depth + 1) for child in member.values())
            return value
        except (ValueError, UnicodeError, RecursionError):
            raise ChannelError("CHANNEL_PROTOCOL_INVALID") from None


def _scope(scope):
    exact(scope, SCOPE)
    for key, value in scope.items():
        if key in ("assignment_epoch", "policy_epoch"):
            if type(value) is not int or not 1 <= value <= 9007199254740991:
                raise ChannelError("CHANNEL_SCOPE_INVALID")
        elif key == "route_sha256":
            if not isinstance(value, str) or not SHA.fullmatch(value):
                raise ChannelError("CHANNEL_SCOPE_INVALID")
        elif not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}", value):
            raise ChannelError("CHANNEL_SCOPE_INVALID")


def _control(value, kind, nonce, fields=()):
    exact(value, {"kind", "nonce", *fields})
    if value["kind"] != kind or value["nonce"] != nonce:
        raise ChannelError("CHANNEL_REPLAY_OR_ORDER")


def exchange(pipe, scope, attempt, body, current):
    """No retries. current is controller-local logic, never a wire callback.

    A nested sender exchange relays each current check over the authenticated
    upstream connection, so even worker execution rechecks the held controller.
    """
    _scope(scope)
    if not isinstance(attempt, str) or not SHA.fullmatch(attempt) or not isinstance(body, bytes) or not 0 < len(body) <= MAX_BODY:
        raise ChannelError("CHANNEL_FRAME_LIMIT")
    wire = Frames(pipe)
    challenge = wire.receive()
    exact(challenge, {"kind", "nonce"})
    nonce = challenge["nonce"]
    if challenge["kind"] != "challenge" or not isinstance(nonce, str) or not SHA.fullmatch(nonce):
        raise ChannelError("CHANNEL_REPLAY_OR_ORDER")
    current()
    remaining(pipe.deadline)
    wire.send({"kind": "offer", "nonce": nonce, "scope": scope, "attempt": attempt,
               "sha256": digest(body), "size": len(body)})
    checks = 0
    ready = False
    while True:
        value = wire.receive()
        if value.get("kind") == "check":
            _control(value, "check", nonce, {"sequence"})
            checks += 1
            if type(value["sequence"]) is not int or value["sequence"] != checks or checks > 12:
                raise ChannelError("CHANNEL_REPLAY_OR_ORDER")
            current()
            remaining(pipe.deadline)
            wire.send({"kind": "authorized", "nonce": nonce, "sequence": checks})
        elif value.get("kind") == "ready" and not ready and checks >= 1:
            _control(value, "ready", nonce)
            current()
            remaining(pipe.deadline)
            wire.send(body, 1)
            ready = True
        elif value.get("kind") == "result" and ready:
            _control(value, "result", nonce, {"sha256", "size"})
            if type(value["size"]) is not int or not 0 < value["size"] <= MAX_BODY:
                raise ChannelError("CHANNEL_FRAME_LIMIT")
            response = wire.receive(2)
            if len(response) != value["size"] or digest(response) != value["sha256"]:
                raise ChannelError("CHANNEL_RESPONSE_MISMATCH")
            current()
            remaining(pipe.deadline)
            wire.send({"kind": "received", "nonce": nonce})
            return response
        else:
            raise ChannelError("CHANNEL_REPLAY_OR_ORDER")


def serve_connection(pipe, scope, current, handler):
    """Serve one authenticated connection. handler receives only released bytes.

    Handler/current injection is a local protocol seam for tests and the fixed
    sender/worker entrypoints. Production accepts no injected verifier or body
    function from argv, stdin, environment, config, or a remote message.
    """
    wire = Frames(pipe)
    nonce = secrets.token_hex(32)
    wire.send({"kind": "challenge", "nonce": nonce})
    offer = wire.receive()
    _control(offer, "offer", nonce, {"scope", "attempt", "sha256", "size"})
    _scope(offer["scope"])
    if (offer["scope"] != scope or not isinstance(offer["attempt"], str) or not SHA.fullmatch(offer["attempt"])
            or not isinstance(offer["sha256"], str) or not SHA.fullmatch(offer["sha256"])
            or type(offer["size"]) is not int or not 0 < offer["size"] <= MAX_BODY):
        raise ChannelError("CHANNEL_BINDING_MISMATCH")
    sequence = 0
    def live():
        nonlocal sequence
        current()
        remaining(pipe.deadline)
        sequence += 1
        if sequence > 12:
            raise ChannelError("CHANNEL_REPLAY_OR_ORDER")
        wire.send({"kind": "check", "nonce": nonce, "sequence": sequence})
        value = wire.receive()
        _control(value, "authorized", nonce, {"sequence"})
        if type(value["sequence"]) is not int or value["sequence"] != sequence:
            raise ChannelError("CHANNEL_REPLAY_OR_ORDER")
        current()
        remaining(pipe.deadline)
    live()
    wire.send({"kind": "ready", "nonce": nonce})
    body = wire.receive(1)
    if len(body) != offer["size"] or digest(body) != offer["sha256"]:
        raise ChannelError("CHANNEL_BODY_MISMATCH")
    live()
    response = handler(body, offer["attempt"], live)
    if not isinstance(response, bytes) or not 0 < len(response) <= MAX_BODY:
        raise ChannelError("CHANNEL_FRAME_LIMIT")
    # Checking local authority is sufficient at return; the receiving side
    # checks its controller before accepting/persisting the response as well.
    current()
    remaining(pipe.deadline)
    wire.send({"kind": "result", "nonce": nonce, "sha256": digest(response), "size": len(response)})
    wire.send(response, 2)
    _control(wire.receive(), "received", nonce)
    return {"request_sha256": digest(body), "reply_sha256": digest(response), "transport_calls": 1}


def runtime_contract(scope=None):
    from . import launch_runtime
    # context() is mandatory: direct execution and synthetic role_check(None)
    # never grant production authority. The verified launcher derives OS SID.
    launch_runtime.context()
    result = launch_runtime.call_launcher(["--channel-contract"],
        body=json.dumps({"scope": scope}).encode("ascii"))
    if result.returncode or len(result.stdout) > MAX_CONTROL:
        raise ChannelError("CHANNEL_AUTHORITY_HOLD")
    value = json.loads(result.stdout)
    exact(value, {"role", "scope", "sids", "sender_pipe", "worker_pipe", "expires_at"})
    _scope(value["scope"])
    exact(value["sids"], {"controller", "sender", "worker"})
    if (value["role"] not in value["sids"] or len(set(value["sids"].values())) != 3
            or any(not isinstance(s, str) or not re.fullmatch(r"S-1-[0-9]+(?:-[0-9]+)+", s) for s in value["sids"].values())
            or current_sid() != value["sids"][value["role"]]
            or type(value["expires_at"]) is not int or time.time() * 1000 >= value["expires_at"]
            or (scope is not None and value["scope"] != scope)):
        raise ChannelError("CHANNEL_AUTHORITY_HOLD")
    return value


def send_released(body, scope, attempt, current):
    bound = runtime_contract(scope)
    if bound["role"] != "controller":
        raise ChannelError("CHANNEL_AUTHORITY_HOLD")
    deadline = time.monotonic() + min(120, (bound["expires_at"] - time.time() * 1000) / 1000)
    def live():
        if runtime_contract(scope) != bound:
            raise ChannelError("CHANNEL_AUTHORITY_CHANGED")
        current()  # current source, permit, journal revision and assignment
    with Pipe.connect(bound["sender_pipe"], bound["sids"]["sender"], deadline) as pipe:
        return exchange(pipe, scope, attempt, body, live)


def serve_runtime(role):
    bound = runtime_contract()
    if bound["role"] != role or role not in ("sender", "worker"):
        raise ChannelError("CHANNEL_AUTHORITY_HOLD")
    scope = bound["scope"]
    def current():
        if runtime_contract(scope) != bound:
            raise ChannelError("CHANNEL_AUTHORITY_CHANGED")
    def handler(body, attempt, upstream):
        if role == "sender":
            def live():
                current()
                upstream()
            with Pipe.connect(bound["worker_pipe"], bound["sids"]["worker"], deadline) as downstream:
                return exchange(downstream, scope, attempt, body, live)
        from .worker import build_reply
        upstream()
        return build_reply(body)
    deadline = time.monotonic() + min(120, (bound["expires_at"] - time.time() * 1000) / 1000)
    with Pipe.listen(bound[role + "_pipe"], bound["sids"]["controller" if role == "sender" else "sender"], deadline) as pipe:
        serve_connection(pipe, scope, current, handler)
    return 0
