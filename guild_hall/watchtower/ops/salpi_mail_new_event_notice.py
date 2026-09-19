"""Hermes no_agent cron shim for the 살핌이 mail new-event notice.

Hermes runs this file (placed in the profile's scripts/ folder) on the job schedule and
delivers its stdout verbatim; empty stdout is a silent tick. All logic lives in the
deterministic Node module guild_hall/watchtower/mail_new_event_notice.mjs of an installed
source lane — this shim only launches it with the host paths from a private config file
that sits next to it:

  salpi_mail_new_event_notice.config.json
  {"node": "<node.exe>", "lane_root": "<installed lane>", "snapshot": "<watchtower snapshot>",
   "receipt": "<store_mail_events.json>", "ledger": "<notice ledger>",
   "mode": "report", "runs_dir": "<ingress run receipts>", "jobs_file": "<profile cron/jobs.json>",
   "job_name": "<this Hermes job's name>"}

With mode "report" every run prints a periodic report (normal included). The report interval is
the Hermes job's own schedule; change it with `hermes -p dev-assist cron edit <id> --schedule ...`.

On any failure it prints one fixed code and exits non-zero. Hermes forwards a failed
script's output to the channel, so no exception text, path or child stderr is ever printed.
"""

import json
import os
import subprocess
import sys

CONFIG_NAME = "salpi_mail_new_event_notice.config.json"
MODULE = ("guild_hall", "watchtower", "mail_new_event_notice.mjs")
KEYS = ("node", "lane_root", "snapshot", "receipt", "ledger")


def emit(text):
    # Bytes, not text mode: Windows text-mode stdout would turn every newline into CRLF.
    sys.stdout.buffer.write(text.encode("utf-8"))
    sys.stdout.buffer.flush()


def fail(code):
    emit("mail_new_event_notice_failed:%s\n" % code)
    sys.exit(1)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    try:
        with open(os.path.join(here, CONFIG_NAME), "r", encoding="utf-8") as handle:
            config = json.load(handle)
    except Exception:
        fail("config_unreadable")
    if not isinstance(config, dict) or any(not isinstance(config.get(key), str) or not config[key] for key in KEYS):
        fail("config_invalid")
    module = os.path.join(config["lane_root"], *MODULE)
    if not os.path.isfile(module) or not os.path.isfile(config["node"]):
        fail("runtime_missing")
    argv = [config["node"], module, "--snapshot", config["snapshot"], "--receipt", config["receipt"],
            "--ledger", config["ledger"]]
    # mode "report": a periodic 살핌이 report on every run (normal included), reading the ingress
    # run receipts since the previous report and this job's own Hermes record for its schedule.
    if config.get("mode") == "report":
        extra = ("runs_dir", "jobs_file", "job_name")
        if any(not isinstance(config.get(key), str) or not config[key] for key in extra):
            fail("config_invalid")
        argv += ["--report", "--runs-dir", config["runs_dir"], "--jobs-file", config["jobs_file"],
                 "--job-name", config["job_name"]]
    if "--connection-test" in sys.argv[1:]:
        argv = [config["node"], module, "--connection-test"]
    try:
        result = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=120,
                                cwd=config["lane_root"], creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except subprocess.TimeoutExpired:
        fail("timeout")
    except Exception:
        fail("launch_failed")
    if result.returncode != 0:
        fail("module_exit_%d" % (result.returncode if 0 <= result.returncode < 256 else 255))
    text = result.stdout.decode("utf-8", errors="replace")
    if text.strip():
        emit(text if text.endswith("\n") else text + "\n")


if __name__ == "__main__":
    main()
