# Native Hermes chat adapter

Status: product CLI and authenticated Workbench route implemented with synthetic child-process evidence; installed Hermes execution,
provider inference, runtime activation and candidate custody are `NOT_RUN`.

`src/hermes_native_runtime.mjs` exports `bindHermesNativeRuntime`. It calls the existing
`admitCandidateExecutorAuthority` and `admitForgeLinearExecutionPacket` without changing
their authority semantics. Its executor is registered as `executor.hermes.native-chat`.
The existing `executor.hermes.bot-submit` / `hermes.bot_submit.v1` contract is separate
and remains unsupported unless its own current compatibility evidence exists.

## Native invocation and inputs

The adapter uses this official CLI surface, through a fixed executable with `shell:false`:

```text
hermes -p <exact-profile> chat --cli --resume <exact-session-id>
  --query-file - --quiet --in <approved-working-directory>
  --model <model> --reasoning <effort> --provider <provider>
  --toolsets <explicit-approved-toolsets> --max-turns <limit> --run-budget <seconds>
```

The issued WorkBrief is serialized only to UTF-8 stdin. Its full source object, including
brief ID and expiry, must pass Forge admission and match the current revision digest.
Expiry must be a valid canonical UTC timestamp (`YYYY-MM-DDTHH:mm:ss.sssZ`); date-only,
unparseable and normalized-invalid dates hold. The bound expiry and current authority/capability
window are checked again synchronously immediately before stdin release, after awaited callbacks.
It never goes into argv, error output or the metadata receipt. No `-z`, `--yolo`,
`--accept-hooks`, title lookup, `latest`, create-if-missing, implicit/default toolsets or
invented `none` toolset is used. Named profile homes must be the exact existing
`<hermes-root>/profiles/<canonical-profile>` directory, matching Hermes profile resolution.

The trusted caller supplies an initial authority request and the metadata projection from
`projectHermesNativeBriefBinding(admitForgeLinearExecutionPacket(...))`. At execute time,
the current-state resolver must re-evaluate authority, assignment and issued revision plus
the exact native capability proof: profile/session, executable SHA, pinned source manifest,
requested model/effort/provider, explicit toolsets, effective tool refs and tool policy digest.
The proof is time-bounded. The same gates run again after spawn, before stdin is released.
The resolver is an authority/provider boundary, not proof merely because it echoes the request.

The executable and source pins are hashed before reading the WorkBrief and again before
stdin release. File identity changes, links/reparse paths and oversized code files hold.
The optional single absolute `executable_argv_prefix` script must itself be source-pinned;
tests use it with Node and a public fixture. It is a fixed trusted launch configuration,
not an untrusted command-builder API.

`hermes_native_cli.mjs execute --request-ref <approved-request-ref>` is the explicit product
entry point. It accepts no request JSON, runtime path, pin override, model or toolset in argv.
Its trusted launch environment supplies `SOULFORGE_HERMES_NATIVE_ENABLED`,
`SOULFORGE_HERMES_NATIVE_SOURCE_ROOT`, `SOULFORGE_HERMES_NATIVE_BINDING_ID`,
`SOULFORGE_HERMES_NATIVE_REALM_ID`, `SOULFORGE_HERMES_NATIVE_BINDING_SHA256` and
`SOULFORGE_HERMES_NATIVE_EXECUTION_BINDING_SHA256`. These are independently provisioned
deployment pins, not approval evidence simply because a task supplies them.

The caller reuses the bounded `createWorkbenchCurrentSources` file reader for the current
realm/generation and an independently pinned `native-chat-binding.json`. A selected request
contains pinned descriptors for authority request, brief metadata, runtime binding, current
capability, Agent projection, authority pin/current state, and task authorization. It reruns
the existing Agent authority verifier, compares the resulting receipt and reruns admission.
The full Forge packet is read later from a separate explicitly bound WorkBrief root, with
its own bounded exact-byte reader. Metadata, body, attempt and Hermes-home roots cannot overlap.
The CLI file route accepts authority/capability evidence at most 60 seconds old and within
its explicit expiry; the transport binder's configurable default is 5 seconds.

## Session evidence and meaning

`hermes_native_session_metadata.mjs` uses Node 24 `node:sqlite` read-only queries against
the selected home's `state.db`. It selects explicit session/message metadata columns;
it never selects message content, system prompts, origins, display metadata, descriptions,
reasoning, or full `model_config`. SQL evaluates only branch/delegate markers and the
persisted YOLO boolean. Restored YOLO is rejected before the WorkBrief is read.

The exact official stderr `session_id:` line must match the DB-observed compression tip.
Compression traversal requires a compression-ended parent, excludes branch/delegate/tool
children and holds on ambiguity. A nonempty plain stdout reply is insufficient: the active
metadata delta must contain exactly one new user row and finish with an assistant row whose
`finish_reason` is `stop` and whose `tool_calls` is absent. Unknown/fallback/partial endings,
wrong session, multiple users, abnormal exit and unreadable DB are `HOLD/UNKNOWN`.

Successful transport means a native turn and response were observed in the selected
session lineage. It does **not** establish exact output artifact custody, review, human
acceptance, Task Done, model reasoning-effort measurement or zero side effects. The receipt
binds the submitted stdin hash, issued brief metadata, executable/source pins, output hashes,
session-metadata digests and attempt. It does not hash historical message bodies or establish
that metadata watermarks are an immutable transcript revision. Concurrent out-of-band writers
and unmeasured provider/dependency behavior remain outside this observation claim.

## Durable one-attempt boundary

`hermes_native_attempt_store.mjs` requires an existing protected directory explicitly selected
by the operator. There is no fallback root, automatic provisioning, expiry, retry or recovery.
An exclusive `wx` claim file is synced before prompt reading; the key is the task/revision/action,
independent of operation ID, fencing epoch, assignment/executor and successor request ID.
The canonical session reference also gets an exclusive slot. A crash, torn claim, timeout,
output overflow or uncertain outcome keeps the claim consumed and its session slot held.
Verified normal completion may release the session slot for a different task; the original
claim is never deleted. Receipts are immutable, synced metadata-only files.

This survives process restart and Coordinator Waiting/HOLD successors. It is not a backup,
operator recovery procedure, arbitrary filesystem attacker defense or power-loss-certified
database. The protected attempt directory must not be replaced, restored empty or deleted to
obtain a retry. A lost directory/receipt is not evidence that sending is safe.

The host deadline bounds response handling and kills the direct child best-effort. Windows
descendant termination, provider/network effects and filesystem effects are unmeasured and
reported as `UNKNOWN`, never as zero. No automatic resend follows a kill or an exit code.

## Compatibility-source evidence

The installed public source was inspected at commit
`1bbb6e5bce56e721ab685af4cd87df21bbff4d35`; no real model call was made. Source file hashes
were independently matched through two filesystem views by the source explorer. These are
compatibility-source identities, not a complete dependency/plugin supply-chain attestation.

| Source | SHA-256 |
| --- | --- |
| `hermes_cli/main.py` | `57cbc9722319f4d9e6a125b4eadcbcab958cd8109564fbaef8db68186f8a744b` |
| `hermes_cli/_parser.py` | `867e45f47b553ab437554e1c69f29646d0a32c5b56da13464e0c925226b5e3a6` |
| `cli.py` | `85c95927002a77602b0fb0384413357b6ee0149dfc5b31e048c29d59654a22a9` |
| `hermes_cli/profiles.py` | `d2cd616cd80d8405dd756bf0a0f6f14dc0006e86a5cb7eb7498e8132d8941233` |
| `hermes_cli/cli_agent_setup_mixin.py` | `a7d849b4321474ccb5a37aff5cc6b5b21220964dd3ab4c3934574dccd21f08fa` |
| `hermes_state.py` | `805693938a33fef3e389fc7699a79d0d19ff9eeb2dc14e24b0eb9346a4d882dc` |
| `hermes_state_common.py` | `00d4ed95d48a16354ebfe0e74b3877f25810eec2c7c1afad80ebd26211eee462` |
| `model_tools.py` | `32a106d66835dc9f88f15624076086a53cbd4bb7ed80889228d0e53f62d4cfac` |
| `toolsets.py` | `1e3a0f0223e89d51ea753973ef74a9c27536ef7af2044f57cdd929baadce63d6` |

Relevant source anchors: `main.py:3229` stdin, `_parser.py:352` flags,
`profiles.py:2503` profile roots, `cli.py:21601` stderr session ID,
`hermes_state.py:9726` compression relation and `:8149` restored YOLO,
`hermes_state_common.py:369` session/message columns. Toolsets can be extended by installed
plugins; source SHA alone is therefore not current effective-tool authorization.

## Validation and integration boundary

```text
node --test ui-workspace/apps/dev-erp/test/hermes_native_chat_executor.test.mjs
```

The fixture launches a real Node child through the product binder/default child runner,
writes a synthetic SQLite session and exercises normal exit, compression, branch rejection,
wrong/missing session evidence, partial completion, timeout, output bounds, stale/current
authority and tool drift, source digest mismatch, exclusive claims, Coordinator successors,
and a separate-process crash/restart with no WorkBrief re-read or child resend.

These tests are public synthetic execution evidence. They neither enable nor attest the
installed Hermes runtime. Runtime source/authority resolvers, approved local bindings and
operational deployment remain explicit integration inputs. The synthetic Workbench worker's
candidate-byte success contract must not be substituted with native plain-text success.

## Workbench route and storage compatibility

The authenticated Workbench now has an explicit native mode through the existing execution
HTTP endpoints. `DEV_ERP_WORKBENCH_NATIVE_EXECUTION=1` and the existing synthetic flag are
mutually exclusive; both set, neither set, missing pins, overlapping roots and TLS mode stay
disabled. No deployment environment, service installation or running production port was changed.

The connected path is `server.mjs` → `workbench_execution_sources.mjs` →
`prepareHermesNativeRequest` → `workbench_execution_service.mjs` → Coordinator → native binder.
Sources match the complete recorded request basis to one pinned native request, then check
current session/project access, Workbench eligibility, current Linear Todo/task identity,
issued input manifest, role/assignment/Agent authority and effective tool capability. Access
checks are repeated through the final stdin gate. No Forge body is read by native authorization.
The native child's deadline is separate from the outer ledger deadline, which includes 30
seconds for bounded preflight and result metadata handling.

`workbench_execution_store.mjs` retains the format-1 table structure. Existing synthetic
ledgers retain their exact `synthetic-only` class and interpretation. Native execution requires
its own `native-execution-metadata` ledger; opening either with the other mode fails without
migration. A native response is stored as the reserved `NATIVE_RESPONSE_OBSERVED` terminal
reason plus a metadata receipt and projected as `execution_state=response_observed`.
It never writes candidate bytes or enters `succeeded`. This class label is not backup/restore
certification or operational release authority.

Catalogue exposes `execution_enabled`, `execution_mode`, `native_execution_enabled`, and the
backward-compatible synthetic flag. Every execution view also reports its ledger's own mode,
`response_observed`, `local_candidate_stored=false` and `official_task_done=false`. Native
responses have no candidate download. Stop requests fence publication and best-effort abort
the direct child; they do not prove cancellation of external effects. Existing same-origin,
CSRF, session and current project ownership checks remain in force.

```text
node --test ui-workspace/apps/dev-erp/test/hermes_native_workbench_http.test.mjs
node --test ui-workspace/apps/dev-erp/test/hermes_native_workbench_store.test.mjs
```

These tests boot the actual server on isolated ephemeral ports and traverse authenticated
HTTP, approved metadata, late body read, the real synthetic child, response-only receipt,
candidate-download rejection, authority/CSRF failures, timeout successors and stop requests.
The existing synthetic HTTP/service/store suites remain part of compatibility verification.
Package scripts, Pack composition and shared release/roadmap/CHANGELOG registration remain
the product integration owner's changes; no runtime activation follows from these code tests.
