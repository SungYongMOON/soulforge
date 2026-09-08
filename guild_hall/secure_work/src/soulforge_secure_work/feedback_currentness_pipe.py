"""Pinned metadata-only bridge; local kernel SID checks belong to ipc_pipe.

No source packages, keys, role configuration, provider calls or model input.
The parent selects one fixed mode. Every connection has one five-second-or-less
deadline, one challenge, one metadata reply and one acknowledgement.
"""
import json
import os
from pathlib import Path
import queue
import re
import struct
import sys
import threading
import time
from datetime import datetime

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ipc_pipe import ChannelError, Pipe, current_sid, remaining

LIMIT = 4096
BASE = {"pipe_name", "server_sid", "client_sid", "timeout_ms", "valid_until"}
EXPECTED = {"challenge", "publisher_ref", "producer_ref", "scope_ref", "issue_id",
            "issue_content_sha256", "body_sha256", "generation", "review_ref", "index_sha256"}
METADATA = EXPECTED | {"observed_at", "valid_until", "execution_authority"}


def exact(value, fields):
    if not isinstance(value, dict) or set(value) != fields:
        raise ChannelError("CHANNEL_PROTOCOL_INVALID")


def pairs(values):
    result = {}
    for key, value in values:
        if key in result:
            raise ChannelError("CHANNEL_PROTOCOL_INVALID")
        result[key] = value
    return result


def decode(body):
    try:
        value = json.loads(body.decode("ascii"), object_pairs_hook=pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(ChannelError()))
        if not isinstance(value, dict):
            raise ChannelError()
        pending = [(value, 0)]
        nodes = 0
        while pending:
            member, depth = pending.pop()
            nodes += 1
            if depth > 2 or nodes > 40 or isinstance(member, list):
                raise ChannelError("CHANNEL_PROTOCOL_INVALID")
            if isinstance(member, dict):
                pending.extend((child, depth + 1) for child in member.values())
        return value
    except (ValueError, UnicodeError, RecursionError):
        raise ChannelError("CHANNEL_PROTOCOL_INVALID") from None


def receive(read):
    size = struct.unpack("!I", read(4))[0]
    if not 0 < size <= LIMIT:
        raise ChannelError("CHANNEL_FRAME_LIMIT")
    return decode(read(size))


def send(write, value):
    body = json.dumps(value, separators=(",", ":"), ensure_ascii=True).encode("ascii")
    if not 0 < len(body) <= LIMIT:
        raise ChannelError("CHANNEL_FRAME_LIMIT")
    write(struct.pack("!I", len(body)) + body)


def stdin_read(size):
    result = b""
    while len(result) < size:
        part = os.read(0, size - len(result))
        if not part:
            raise ChannelError("CHANNEL_PARENT_CLOSED")
        result += part
    return result


def stdout_write(body):
    while body:
        size = os.write(1, body)
        if size <= 0:
            raise ChannelError("CHANNEL_PARENT_CLOSED")
        body = body[size:]


def stdin_frames():
    inbox = queue.Queue(maxsize=1)
    def reader():
        try:
            while True:
                inbox.put(receive(stdin_read))
        except BaseException:
            inbox.put(ChannelError("CHANNEL_PARENT_CLOSED"))
    threading.Thread(target=reader, daemon=True).start()
    def next_frame(deadline):
        try:
            value = inbox.get(timeout=remaining(deadline))
        except queue.Empty:
            raise ChannelError("CHANNEL_DEADLINE") from None
        if isinstance(value, BaseException):
            raise value
        return value
    return next_frame


def nonce(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-f0-9]{32}", value):
        raise ChannelError("CHANNEL_PROTOCOL_INVALID")


def metadata(value, challenge):
    exact(value, METADATA)
    if value["challenge"] != challenge or value["execution_authority"] is not False:
        raise ChannelError("CHANNEL_PROTOCOL_INVALID")
    # Final typed values, freshness and exact publication are checked by Node's
    # existing validator. Only bounded scalar metadata can reach that validator.
    if any(not isinstance(v, (str, int, bool)) for v in value.values()):
        raise ChannelError("CHANNEL_PROTOCOL_INVALID")


def main(mode):
    read_parent = stdin_frames()
    binding = read_parent(time.monotonic() + 5)
    exact(binding, BASE | ({"challenge"} if mode == "client" else set()))
    if type(binding["timeout_ms"]) is not int or not 100 <= binding["timeout_ms"] <= 5000:
        raise ChannelError("CHANNEL_BINDING_INVALID")
    expires = datetime.fromisoformat(binding["valid_until"].replace("Z", "+00:00")).timestamp()
    own_sid = current_sid()
    if own_sid != binding["client_sid" if mode == "client" else "server_sid"]:
        raise ChannelError("CHANNEL_IDENTITY_UNBOUND")
    def deadline():
        duration = min(binding["timeout_ms"] / 1000, expires - time.time())
        if duration <= 0:
            raise ChannelError("CHANNEL_DEADLINE")
        return time.monotonic() + duration
    if mode == "client":
        challenge = binding["challenge"]
        nonce(challenge)
        with Pipe.connect(binding["pipe_name"], binding["server_sid"], deadline()) as pipe:
            # connect authenticates the kernel-observed SID before any challenge.
            send(pipe.write, {"challenge": challenge})
            value = receive(pipe.read)
            metadata(value, challenge)
            send(pipe.write, {"received": challenge})
            send(stdout_write, {"kind": "result", "peer_sid": binding["server_sid"], "metadata": value})
        return
    while True:
        until = deadline()
        connected = False
        try:
            with Pipe.listen(binding["pipe_name"], binding["client_sid"], until,
                             ready=lambda: send(stdout_write, {"kind": "ready"})) as pipe:
                connected = True
                value = receive(pipe.read)
                exact(value, {"challenge"})
                challenge = value["challenge"]
                nonce(challenge)
                # listen authenticates the kernel-observed client SID first.
                send(stdout_write, {"kind": "request", "peer_sid": binding["client_sid"], "challenge": challenge})
                response = read_parent(until)
                exact(response, {"kind", "challenge", "metadata"})
                if response["kind"] != "response" or response["challenge"] != challenge:
                    raise ChannelError("CHANNEL_PROTOCOL_INVALID")
                metadata(response["metadata"], challenge)
                send(pipe.write, response["metadata"])
                ack = receive(pipe.read)
                exact(ack, {"received"})
                if ack["received"] != challenge:
                    raise ChannelError("CHANNEL_PROTOCOL_INVALID")
                # The client must close this connection before the next
                # FIRST_PIPE_INSTANCE listener can own the same fixed name.
                try:
                    pipe.read(1)
                    raise ChannelError("CHANNEL_PROTOCOL_INVALID")
                except ChannelError as error:
                    if str(error) != "CHANNEL_CLOSED":
                        raise
                send(stdout_write, {"kind": "complete", "challenge": challenge})
        except ChannelError as error:
            # An idle listen may be rearmed. An authenticated/ambiguous exchange
            # is never retried and takes the server down.
            if connected or str(error) != "CHANNEL_DEADLINE":
                raise


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2 or sys.argv[1] not in ("client", "server"):
            raise ChannelError("CHANNEL_PROTOCOL_INVALID")
        main(sys.argv[1])
    except BaseException:
        # No exception details, input, path or raw payload crosses stdout/stderr.
        raise SystemExit(2)
