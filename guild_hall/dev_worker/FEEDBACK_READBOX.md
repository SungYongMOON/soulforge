# Feedback manager readbox and native delivery candidate

This consumer joins the existing worker control database with local result and
watchdog evidence. The manager sees metadata in a GET-only World Tree view.
An independent dispatcher prepares a fixed metadata notice for the approved
canonical Bot Chat. Neither a local report nor a Buzz ACK accepts work or marks
Linear done. No Owner attention queue is used.

Status: isolated installation candidate. The code does not register a service,
apply a vendor patch, load credentials, start models, or enable a live route.

## Entrypoints and installation

- `feedback_readbox.mjs`: `openFeedbackReadbox({configPath, configSha256})`.
- `feedback_dispatch.mjs`: `openFeedbackDispatch(...)`; use `readOnly:true`
  for a World Tree reader after the independent dispatcher initializes its DB.
  `snapshot({limit},access)` and `detail({ref,sha256},access)` need existing
  server account/session/project callbacks. Without delivery configuration the
  readbox itself still works and displays `NOT_OBSERVED`.
- `feedback_readbox_http.mjs`: `createFeedbackReadboxHttpController` mounts
  `/workbench/feedback-readbox`, `/api/workbench/feedback-readbox`, and its
  `/evidence` endpoint. Reuse the current server's `currentAccount`, `sessionKey`
  and `canAccessProject`; never substitute headers supplied by a user for those
  ports. Exact loopback origin and current project authorization are required.
- `feedback_readbox_cli.mjs`: `prepare`, `send`, `receipt`, `authorize`, `tick`,
  and serial `poll`. Run `--help` for exact arguments. `authorize` opens the
  delivery database read-only and returns a pinned envelope only after current
  authorization checks. `poll` requires an explicit interval of 1–3600 seconds;
  it does not install an operating-system schedule.
- `feedback_readbox_stage.mjs <source-root> <empty-external-target>` copies the
  explicit dependency closure and records every file hash. No external package
  or new transport SDK is needed; Node must support `node:sqlite`.

The root config is version 1 JSON with `project_id`, `runtime_deployment`
(`path`, `sha256`), `access_current` (`path`, `sha256:null`),
`dispatch_service_ref`, and optional `delivery`. Its exact SHA is supplied by
the trusted deployment caller. Runtime evidence/control roots come only from
the pinned existing runtime deployment. Paths must be ordinary local files and
directories, not links or alternate roots. The existing control DB's scope,
organization and repository digest must match. The worker's allowed file set
must exclude the new readbox, dispatcher, native bridge and HTTP source.

The current access file is supplied by a trusted existing permission writer,
outside evidence/control/delivery roots. It contains `project_id`, `scope_ref`,
`active`, `issued_at`, `observed_at`, `expires_at`, `manager_account_ids`,
`dispatch_enabled`, and `dispatch_service_ref`. Freshness is at most five
minutes. A user must match the current manager list, current server session and
current project access. The dispatcher separately requires the named enabled
service. This consumer never issues that permission.

`delivery` contains a pinned `policy`, unpinned current-generation `route_current`
descriptor, an existing ordinary `state_root`, and exact `native_origin`
(`http://127.0.0.1:<port>`). The approved policy has version 1, `approved:true`,
`project_ref`, `service_ref`, `manager_route_id`, `profile_ref`, `bot_chat_id`,
`sender_ref`, `purpose:"manager_feedback_notice"`, `issued_at`, `expires_at`.
The current route record contains `active`, `project_ref`, `policy_sha256`,
`observed_at`, `expires_at`, and pinned `catalog`/`bindings` descriptors.
Both directory documents pass the existing directory validators. The route
must resolve EXACT with an active, recent binding; project, canonical chat and
native profile must match. Directory resolution itself grants no authority.
Issue text and model output cannot choose these fields.

## Metadata and delivery semantics

Lists contain at most 100 entries and source history is capped at 1000 runs plus
1000 notices. An exceeded source cap returns unavailable; archival/paging is
not silently invented. Only report, run-result and manager-notice families are
read; each file is capped at 2 MB. Model request/exchange and validator stream
files are never opened. Detail is also metadata-only and requires the exact
reference and SHA obtained from the list. Summary text, stdout, model input,
source payload, candidate filesystem paths and arbitrary links are excluded.
Current control rows and evidence pins are rechecked before returning data.

The current core run state controls the result state. Review reports expose a
fixed verdict; a rejected review without an accepted core review reference is
shown as `NOT_ACCEPTED`, otherwise missing review evidence remains `UNKNOWN`.
An initial healthy watchdog does not create a notice; the existing watchdog's
HEALTHY notice therefore represents recovery. Local notice delivery remains a
local file fact. Human acceptance is always `UNKNOWN`; `official_done` is false.

Preparation stores one row per run-state event or notice ref. An unattempted
PREPARED envelope may refresh after expiry or a current approved route renewal;
a compare-and-swap protects it from a concurrent sender. The native CLI refuses
an envelope until the dispatcher has durably consumed its attempt. Attempted
envelopes are immutable. Repeated observations reuse that row; recovery has its
own event. The dispatcher scans the bounded full metadata set, skips consumed
events and handles at most 20 pending events per tick, including older events.
`PREPARED` means no sender attempt has yet been consumed. The dispatcher commits
`DELIVERY_UNKNOWN` before HTTP and makes one call. Timeout, lost response,
malformed receipt and rejection never cause an automatic resend. A separate
`receipt` operation may resolve unknown to `ACKNOWLEDGED`; it cannot send. It
requires current independent project/route read permission and the exact stored
envelope hash, but the original send permission may have expired meanwhile.
Both notification storage and native sender storage must survive restart. Never
delete/reset either database to clear uncertainty.

## Native Hermes boundary

`feedback_buzz_bridge.py` binds only an already-connected native `BuzzAdapter`.
The generated reviewed connect hook calls `register_installed_adapter`; the
disconnect hook closes it. The bridge checks the actual active profile and
adapter `_self_pubkey`. It invokes native `_send_with_retry` with
`max_retries=0`, preserving the existing transport. Only `success is True`,
`raw_response.accepted is True`, and a nonempty `message_id` make an ACK.

HTTP `/send` and `/receipt` accept only `dispatch_ref` and `envelope_sha256`.
Before a new send, the bridge runs the fixed Node authorization command with
pinned executable, script and complete local dependency hashes; no shell or
ambient Node options are used. Canonical envelope SHA means recursively sorted
keys, compact UTF-8 JSON. The independent native SQLite ledger consumes UNKNOWN
before touching the adapter. A late native ACK is retained for receipt readback.
The bridge emits no new model request and does not use the pilot hook as sender.

`feedback_buzz_bridge_install.py --help` describes the offline generator. Lab
must supply the actual reviewed source SHA and unique unconditional line anchors
inside native `BuzzAdapter.connect` and `.disconnect`. The connect insertion
point must be after identity lock and before polling. The generator emits a new
directory containing patched source, helper, private fixed binding, diff and
hash receipt. It never overwrites the installed tree. Historical vendor hashes
are not current installation evidence. Review the resulting whole source and
binding before any separately authorized installation.

## Checks and integration owner

Run the `feedback_readbox.test.mjs`, `feedback_dispatch.test.mjs`,
`feedback_readbox_native_integration.test.mjs` and HTTP leaf tests with Node;
run `test_feedback_buzz_bridge.py` with Python unittest. Fixtures are synthetic,
use real SQLite, subprocesses, loopback HTTP and staged copies, and do not prove
live gateway availability or real delivery.

The product sole writer owns common server mount, package/Pack admission,
protected-code registry, documentation indexes and release notes. Lab owns
review/application of the exact current vendor patch and native binding.
Existing access/route writers must supply current metadata with their existing
authority; this consumer is not a new approval ledger. No real gateway binding,
actual sender ACK or human acceptance is established by these tests.
G2 projection publishing remains separate and unresolved; the G2 reader does
not generate the feedback projection/current.json. This code does not read raw
G2 inputs to substitute for that missing publication.
