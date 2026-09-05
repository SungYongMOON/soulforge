"""`sfx` command surface.

    sfx doctor
    sfx request --recipe R1-07 --source <dir> --requester <ref> --mission <name>
    sfx advance --job <job> [--max-steps N]
    sfx status [--job <job>]
    sfx permit approve|deny --job <job> --actor <ref>
    sfx events --job <job>
    sfx keys init-pilot --out <dir>

Output is JSON on stdout so a caller can read it without parsing prose. Errors
are a JSON object with a code, never a stack trace with a payload in it.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import authority
from .config import Config, ConfigError, load
from .engine import EngineStop, Lane


def _emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="sfx", description="Soulforge secure-work lane")
    parser.add_argument("--config", help="path to the runtime config JSON")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("doctor", help="adapter availability table")

    request = sub.add_parser("request", help="accept a mission")
    request.add_argument("--recipe", required=True)
    request.add_argument("--source", required=True)
    request.add_argument("--requester", required=True)
    request.add_argument("--mission", required=True)

    advance = sub.add_parser("advance", help="let the engine take the next action")
    advance.add_argument("--job", required=True)
    advance.add_argument("--max-steps", type=int, default=1)

    status = sub.add_parser("status", help="job phases and the status projection")
    status.add_argument("--job")

    permit = sub.add_parser("permit", help="release authority decision")
    permit.add_argument("decision", choices=["approve", "deny"])
    permit.add_argument("--job", required=True)
    permit.add_argument("--actor", required=True)

    events = sub.add_parser("events", help="the job's event ledger")
    events.add_argument("--job", required=True)

    keys = sub.add_parser("keys", help="local pilot key material (synthetic only)")
    keys_sub = keys.add_subparsers(dest="keys_command", required=True)
    init_pilot = keys_sub.add_parser(
        "init-pilot",
        help="generate a synthetic permit trust key pair outside the pilot root")
    init_pilot.add_argument("--out", required=True)
    return parser


def _run_keys_command(args: argparse.Namespace, config: Config) -> int:
    if args.keys_command != "init-pilot":
        _emit({"ok": False, "code": "UNKNOWN_COMMAND"})
        return 2
    try:
        result = authority.generate_pilot_trust_keypair(Path(args.out), config.pilot_root)
    except authority.PermitAuthorityError as error:
        _emit({"ok": False, "code": error.code, "detail": error.detail})
        return 2
    _emit({"ok": True, "command": "keys.init-pilot", **result})
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        config = load(args.config)
    except ConfigError as error:
        _emit({"ok": False, "code": error.code})
        return 2

    if args.command == "keys":
        # Pure key material generation. Deliberately does not require the kit
        # to be bound: it has nothing to do with mission processing.
        return _run_keys_command(args, config)

    try:
        lane = Lane(config)
    except Exception as error:  # noqa: BLE001 - reported as a code, never a payload
        _emit({"ok": False, "code": "LANE_BIND_FAILED", "detail": type(error).__name__})
        return 2

    try:
        if args.command == "doctor":
            _emit({"ok": True, "command": "doctor", "adapters": lane.doctor()})
            return 0

        if args.command == "request":
            source = Path(args.source)
            if source.resolve() != config.source_root.resolve():
                _emit({"ok": False, "code": "SOURCE_DIR_NOT_BOUND",
                       "detail": "only the configured pilot source root is readable"})
                return 2
            job = lane.request(args.recipe, source, args.requester, args.mission)
            _emit({"ok": True, "command": "request", "job_id": job.job_id,
                   "mission_id": job.data["mission_id"], "phase": lane.phase(job)})
            return 0

        if args.command == "advance":
            job = lane.load_job(args.job)
            steps = lane.advance(job, max_steps=max(1, args.max_steps))
            _emit({"ok": all(step.get("state") == "ADVANCED" for step in steps),
                   "command": "advance", "job_id": job.job_id,
                   "phase": lane.phase(job), "steps": steps})
            return 0

        if args.command == "status":
            if args.job:
                job = lane.load_job(args.job)
                _emit({"ok": True, "command": "status", "job_id": job.job_id,
                       "phase": lane.phase(job), "job": job.data})
                return 0
            jobs = [{"job_id": job.job_id, "phase": lane.phase(job),
                     "recipe_id": job.data.get("recipe_id"),
                     "mission_name": job.data.get("mission_name")}
                    for job in lane.list_jobs()]
            _emit({"ok": True, "command": "status", "jobs": jobs,
                   "status_projection": lane.refresh_status()})
            return 0

        if args.command == "permit":
            job = lane.load_job(args.job)
            if args.decision == "approve":
                record = lane.approve_permit(job, args.actor)
                _emit({"ok": True, "command": "permit", "decision": "ALLOW",
                       "job_id": job.job_id,
                       "request_sha256": record["permit"]["claims"]["request_sha256"],
                       "expires_utc": record["permit"]["claims"]["expires_utc"],
                       "authority": record["authority"]})
            else:
                lane.deny_permit(job, args.actor)
                _emit({"ok": True, "command": "permit", "decision": "DENY",
                       "job_id": job.job_id})
            return 0

        if args.command == "events":
            job = lane.load_job(args.job)
            path = job.path("events.jsonl")
            records = [json.loads(line) for line in
                       path.read_text(encoding="utf-8").splitlines() if line.strip()] \
                if path.is_file() else []
            _emit({"ok": True, "command": "events", "job_id": job.job_id,
                   "count": len(records), "events": records})
            return 0
    except EngineStop as stop:
        _emit({"ok": False, "code": stop.code, "detail": stop.detail})
        return 1
    except Exception as error:  # noqa: BLE001 - code only, no payload echo
        _emit({"ok": False, "code": "UNHANDLED", "detail": type(error).__name__})
        return 1

    _emit({"ok": False, "code": "UNKNOWN_COMMAND"})
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
