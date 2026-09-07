"""Local controller exclusion and exact response persistence, not authority.

The E14 journal owns attempt consumption and states. This file adds no retry
queue or permit ledger. Locks coordinate cooperating local controllers only;
they do not isolate M06's OS principal or protect a writable installation.
"""
from contextlib import contextmanager
import json
import os
from pathlib import Path


class DispatchUnavailable(RuntimeError):
    pass


@contextmanager
def controller_lock(job_root: Path):
    """Nonblocking local OS lock; process death releases the lock, not permit use."""
    try:
        handle = (job_root / "dispatch.lock").open("a+b")
        if handle.tell() == 0:
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
    except OSError:
        raise DispatchUnavailable("DISPATCH_LOCK_UNAVAILABLE") from None
    acquired = False
    try:
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            acquired = True
        except OSError:
            raise DispatchUnavailable("DISPATCH_BUSY") from None
        yield
    finally:
        if acquired:
            if os.name == "nt":
                import msvcrt
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        handle.close()


def durable_write(path: Path, body: bytes):
    """An incomplete temp is never a usable reply; exact digest is checked on resume."""
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_name(path.name + ".pending")
    with pending.open("wb") as handle:
        handle.write(body)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(pending, path)
    if os.name != "nt":
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)


def saved_response(job, binding_sha256, attempt_id, codec) -> bytes:
    try:
        with job.path("dispatch_result.json").open("rb") as handle:
            raw = handle.read(32769)
        if len(raw) > 32768:
            raise ValueError()
        record = json.loads(raw)
        with job.path("quarantine", "reply.json").open("rb") as handle:
            reply = handle.read(1048577)
        expected = {"binding_sha256": binding_sha256, "attempt_id": attempt_id,
                    "reply_sha256": codec.digest(reply), "reply_size": len(reply)}
        if len(reply) > 1048576 or record != expected:
            raise ValueError()
        return reply
    except (OSError, ValueError, TypeError):
        raise DispatchUnavailable("DELIVERY_UNKNOWN") from None
