# Bounded Hermes Buzz pilot observer — source candidate

This is a source/review packet, not an installation or activation receipt.

- `ui-workspace/apps/dev-erp/tools/hermes_buzz_pilot_hook.py`: generic observer helper; no model execution.
- `ui-workspace/apps/dev-erp/test/test_hermes_buzz_pilot_hook.py`: portable synthetic subprocess/ACK tests. Only the import roots differ from the privately reviewed test layout.
- `ui-workspace/apps/dev-erp/test/test_hermes_buzz_pilot_background.py`: bounded queue, immutable input, initialization and native callback isolation checks.
- `ui-workspace/apps/dev-erp/test/test_hermes_buzz_pilot_health.py`: observer start, heartbeat and close checks; blocked health storage never owns the conversation thread.
- `hermes-vendor.patch`: minimal patch for the three exact baseline vendor sources; the helper is supplied separately above.

The patch uses zero context lines so unchanged whitespace-only vendor lines are
not republished as trailing whitespace in this source artifact. Verify every
baseline SHA below before using
`git -c core.autocrlf=false -c core.eol=lf apply --unidiff-zero`; these exact pins,
not fuzzy patch matching, establish its applicable input. The resulting three
files must match the separately reviewed candidate hashes before application.

Run with Python 3.11 or later:

```text
python -m unittest discover -s ui-workspace/apps/dev-erp/test -p "test_hermes_buzz_pilot_*.py" -v
```

The bounded recorder supports one clarify call and a single string response. Unsupported tools or input formats make capture incomplete; they do not veto native execution or copy unrelated tool payloads. The stored tool output is the actual public `user_response` string projection, not the original full tool JSON. Hidden reasoning is not captured.

The gateway factory starts the recorder in the background. Native callbacks only enqueue bounded immutable observations; code pins, strict ACK checks and retries run on one worker. Initial readiness and an acknowledged event are different facts. The queue remains volatile and holds at most 64 entries of at most 64 KiB each. An initialization gap, overflow or rejected record is exposed separately from an execution failure. Native streaming, interim messages and Hermes operational memory remain under their original owners.

The pinned Node `capture-health` action persists an observer instance's started/heartbeat/closed metadata independently of execution events. Heartbeats are no more frequent than every 15 seconds, except a new gap; close is immediate after drain. Pending counts include unconfirmed discarded observations, so they are not the in-memory queue length. The Node reader marks stale or unclosed replacement instances unconfirmed and never reconstructs a current human wait from historical events alone. This detects possible loss; it does not reconstruct missing conversation bodies or grant execution/egress authority.

Health ACKs require the complete version/status/job/instance/phase/sequence envelope, including a positive advancing integer sequence. Missing, contradictory or cross-job replies can only degrade capture; uncertain responses retry identical bytes. In prepared-v2, a timed-out or failed clarify tool does not terminate the whole job: its outcome remains recorded and the native final can follow. Explicit job cancellation/failure remains terminal, and v1 semantics are unchanged.

Startup reads `recovery_metadata.instruction_trim_sha256` from the exact trusted CLI status. Its comparison follows ECMAScript `String.trim`; the original instruction pin and actual wire bytes are preserved. The prepared-v2 marker separates raw tool input from the native callback's effective display values. Neither a queued observation nor a capture-health ACK is permission to execute work.

`ObserverClient`/`PilotObservation` are the strict recorder seam retained for tests; their exceptions are contained by `BackgroundObserverClient` in the gateway path. Do not install the old synchronous gateway patch with this helper. The complete four-file change and matching Node source must be reviewed together. Source assembly never applies it to a running gateway. A deployed earlier patch must be restored using its verified rollback receipt before applying this original-baseline patch.

The hook observes existing execution and records through a pinned Node CLI. A reference or file hash does not confer execution authority. Real profile, chat, account, job, source locations and credentials are excluded. The separate private apply/rollback kit retains its exact target and stopped-process guards; it is deliberately not generalized by this source packet.

Baseline SHA-256 pins:

| Vendor file | SHA-256 |
| --- | --- |
| gateway/run.py | 5bd7c157a4aff539a84068b2a1443f1674404e0a93748db16939abb46e8b2445 |
| plugins/platforms/buzz/adapter.py | 6a4b214bae858cd7cfc4889b9829538e56555c7f16738eed02a5b243358443f4 |
| tools/clarify_gateway.py | 114a720ee69bc79b00fd837e6a4cbbb4e34933aafd2097fd405b247c98403081 |

These pins identify the reviewed installed-source baseline; a version label alone is insufficient. Vendor source ownership and license remain with the upstream Hermes project. Whole vendor files are not included here. Applying to any other bytes requires renewed review.
