# guild_hall/voice_capture

## Purpose

`voice_capture/` supervises local microphone capture and provider-account voice
intake. It does not include or download an ASR model. Instead, it supervises
owner-installed commands such as `ffmpeg`, `sox`, `whisper-cli`, and the
official PLAUD CLI, then writes bounded session artifacts under `_workspaces`.

Imported original audio can also be transcribed independently with the
versioned local-ASR runner. The runner uses resumable fixed windows, writes
outputs only under each session's `analysis/local_asr/<run_id>/` directory, and
does not replace the provider transcript.

## Boundary

- Raw audio and raw transcripts stay under `_workspaces/system/voice_capture/**`
  or another owner-approved workspace root.
- `_workmeta` receives only metadata: current review drafts and route candidates,
  and, after the target schema/validator is implemented, explicitly labelled
  AI-provisional route/task records. It never receives raw transcript bodies.
- The CLI never copies raw audio, transcript bodies, secrets, credentials, or
  private source payloads into public repo files.
- The current CLI stops at unclassified/candidate route state and does not
  mutate a formal task ledger automatically.
- The owner-approved next target lets an AI context resolver keep internal work
  moving with explicitly labelled provisional project/assignee/task records.
  It must never write human acceptance fields or execute external/official
  actions; only exception cases and irreversible actions remain human-gated.

The current PLAUD adoption decision is documented in
[`PLAUD_ADOPTION_DECISION_V0.md`](../../docs/architecture/workspace/PLAUD_ADOPTION_DECISION_V0.md):
use PLAUD as a pilot primary-audio candidate, not as authoritative transcript,
speaker identity, minutes, or task evidence.

## PLAUD time contract

- The PLAUD CLI's absolute `start_at`/`created_at` value is interpreted as UTC
  when it has no offset. An explicit ISO 8601 offset or `Z` remains authoritative.
- Owner-facing recording start/end fields, session IDs, date folders, library
  routes, delivery/ASR pointers, and project-context event times are normalized
  to `Asia/Seoul` (`+09:00`, KST).
- Explicit `Z` audit timestamps such as completion/write times stay UTC.
  Transcript segment times remain offsets from recording start and are not
  timezone-converted.
- A session manifest records the provider timestamp basis and normalized
  timezone so a timezone-less value cannot silently become host-local time.

Audit legacy automatic imports without changing files:

```bash
npm run guild-hall:voice-capture:plaud -- audit-kst
```

`migrate-kst --apply` is an explicit repair operation for legacy
`plaud_cli_import` sessions. It updates active metadata and time-derived paths,
preserves raw audio/transcript payloads, and can write a metadata-only mapping
receipt with `--receipt <relative-path>`.

## Storage and cross-PC ownership

| Surface | Location | Transfer |
| --- | --- | --- |
| Audio, transcripts, speaker/context analysis | `_workspaces/system/voice_capture/sessions/**` | owner-approved shared worksite |
| Library, bundles, queues, delivery proof | `_workspaces/system/voice_capture/{library,meeting_bundles,local_asr_queue,plaud_mail_triggers,delivery}/**` | same shared worksite |
| Project route/task metadata | `_workmeta/<project_code>/**` | project private Git |
| Cross-project operational continuity | `private-state/guild_hall/state/**` | private-state Git |
| CLI, contracts, tests | public Soulforge tree | public Git |

The Mac mini is the single writer for shared voice session/runtime surfaces.
Other PCs pull the three applicable Git histories, materialize the shared
workspace, verify raw arrival with their own consumer acknowledgement, and only
write their permitted project metadata. Raw audio and transcript bodies never
move through Git.

The HPP may additionally run `copy_only_mirror_cli.mjs` as a bounded,
source-preserving migration/audit mirror into an owner-approved staging root. The mirror follows an
exact lane allowlist, verifies streaming SHA-256, writes restart checkpoints
and immutable metadata receipts, and never deletes or overwrites the source.
An already copied legacy tree is hash-verified and seeded without copying the
payload again. A changed source produces an immutable version instead of
replacing the first live copy. Its output is not HPP accepted quarantine/inbox,
does not create an authenticated transfer receipt, and must not be presented as
the `transfer_service` or project promoter. It does not classify a project,
write ERP, or change the Mac mini writer role. Continuous accepted-ingress use
remains blocked on the private `VERIFY_HP` transfer-service binding.

## Cross-PC delivery receipts

Voice payload sync is proven in two steps. A producer receipt says only that a
complete stage was present on the producer; its `ready` status never means the
files reached another PC. An authorized consumer must recompute every listed
file's exact size and streaming SHA-256 locally and write an acknowledgement
before the status becomes `delivered`.

```bash
npm run guild-hall:voice-capture -- prepare-delivery \
  --session-dir _workspaces/system/voice_capture/sessions/<date>/<session-id> \
  --stage plaud_import_ready \
  --producer-node always_on_voice_producer \
  --apply --json

npm run guild-hall:voice-capture -- ack-delivery \
  --session-id <session-id> \
  --consumer-node work_consumer_01 \
  --apply --json

npm run guild-hall:voice-capture -- delivery-status \
  --session-id <session-id> \
  --consumer-node work_consumer_01 \
  --json
```

Delivery commands are dry-run by default. They return exit code `0` for
`ready`/`delivered`, `1` for missing, mismatch, stale, or absent acknowledgement,
and `2` for unsafe input or schema/config failure. Receipt and acknowledgement
files live under `_workspaces/system/voice_capture/delivery/`; they contain only
safe IDs, strict UTC audit timestamps, relative refs, roles, expected receipt
sizes/hashes, observed acknowledgement sizes/hashes, and verification states. They do
not contain recording titles, transcript bodies, absolute paths, credentials,
or provider URLs. Successful PLAUD registration and completed local ASR attempt
producer receipt emission once with the public-safe producer role label
`always_on_voice_producer`. A receipt failure is a retryable delivery warning
and never rolls back the successful import or transcription.

Producer and consumer node labels are operational assertions, not cryptographic
identity. The consumer label must differ from the receipt's producer label, and
an authorized operator must still run acknowledgement on the different PC whose
arrival is being proved. This metadata binding detects inconsistent or edited
rows but is not a signature and cannot prevent a party with write access from
forging both payload and metadata. Producer and consumer clocks must be
synchronized; acknowledgement refuses to write when its computed check time is
earlier than the receipt. `delivery-status` retains a stale guard for forged or
legacy clock-inverted ack files. Delivery
prepare/ack/write also requires `_workspaces/system` to be an external shared
symlink, not a normal in-repo directory or a symlink into any public repo
subtree. The per-session producer receipt is a latest-stage
pointer: `local_asr_ready` intentionally supersedes `plaud_import_ready` at the
same path and makes the earlier acknowledgement stale. It is not an immutable
historical receipt archive.

## Commands

### PLAUD account intake on an always-on Mac

PLAUD account intake is separate from microphone recording. It uses the
official `@plaud-ai/cli`, keeps provider credentials in the CLI-managed local
token store, and never reads or copies that token file into Soulforge.

On the Mac mini, install the external prerequisites and sign in once:

```bash
npm install -g @plaud-ai/cli@0.3.4
plaud login
brew install ffmpeg
```

Create the shared, secret-free profile and run preflight:

```bash
npm run guild-hall:voice-capture:plaud -- init-config --apply
npm run guild-hall:voice-capture:plaud -- preflight
```

Preview new recording IDs without downloading anything, then apply:

```bash
npm run guild-hall:voice-capture:plaud -- sync
npm run guild-hall:voice-capture:plaud -- sync --apply
```

The sync waits until audio and transcript are both available, retries pending
recordings on later runs, and skips any provider recording ID already present
in a session manifest. It downloads all three provider artifacts but assigns
different evidence roles:

- original audio: canonical source candidate;
- PLAUD transcript and speaker labels: auxiliary, unverified alignment input;
- PLAUD summary: quarantined, untrusted provider output with no direct task
  promotion authority.

The intake currently pins CLI `0.3.4` because the official CLI emits a
human-readable table rather than a documented JSON mode. Preflight blocks an
unknown version until its output contract passes the fixture tests.

Render the Mac mini mail-queue watcher after the repository and OneDrive
workspace links are ready:

```bash
npm run guild-hall:voice-capture:plaud -- render-launchd \
  --node-id home_always_on_01 \
  --apply
```

The rendered plist stays running with `RunAtLoad + KeepAlive` and checks the
local sanitized mail-trigger and independent-ASR queues every five minutes.
This avoids macOS GUI `WatchPaths` demand being left in `spawn scheduled` while
the login domain is on-demand-only. It does not query PLAUD when both local
queues are empty. If PLAUD has not exposed the recording yet, the next loop
retries after five minutes while the trigger remains pending. A trigger is
completed only when at least one new recording is imported. If no matching
import appears within one hour, it moves to
`plaud_mail_triggers/unresolved/<date>/` for explicit review instead of being
silently discarded. Multiple pending notices are resolved individually: one
new recording completes at most one oldest notice, and only notices whose own
one-hour window expired move to unresolved. The plist stays under
`_workspaces/_local/home_always_on_01/launchd/`. Install commands are printed
for manual execution on that Mac. The collector writes the audio and provider
exports to the shared `_workspaces/system/voice_capture/` view, registers the
recording in the metadata-only library, and creates a `P00-000_INBOX` review
event. It does not decide the project or create formal tasks. The printed
install commands include one explicit `launchctl kickstart` so the persistent
loop begins even when the GUI domain is currently demand-limited. The loop
rejects retry intervals outside 30 seconds to 24 hours, exits if the repo root
cannot be entered, suppresses successful/empty drain output, and logs only a
bounded status line when a drain fails.

`sync` remains available as an explicit recovery command when the notification
mail was missed. Normal operation uses `drain-mail-queue --apply` through the
launchd queue loop. Before each drain, the loop also discovers imported audio
that still lacks the current independent run and recreates any missing durable
queue item. A stale queue item for an already completed transcript is finalized
from the completed session pointers without rerunning audio inference; an
unsent completion notification and delivery receipt are retried during that
finalization.

Create and check the Mac mini independent-ASR profile:

```bash
npm run guild-hall:voice-capture:asr -- init-config --apply
npm run guild-hall:voice-capture:asr -- preflight
```

Preview or process the current audio backlog:

```bash
npm run guild-hall:voice-capture:asr -- backlog
npm run guild-hall:voice-capture:asr -- backlog --apply
```

The default imported-audio profile uses `large-v3-turbo-q5_0`, Korean, 30
minute windows, 10 second context overlap, local Silero VAD, and repetition
suppression. The usable transcript and the locally retained
`suppressed_segments.jsonl` audit sidecar stay separate. Each completed run emits a
metadata-only project-context source pointer with companion input kinds
`mail` and `se_schedule`; it does not accept a project route automatically.
`refresh-context-events --apply` can rebuild the metadata-only project-context
event adapters for completed runs without reading or copying transcript text.

Enable the body-safe Telegram completion event on the always-on node:

```bash
npm run guild-hall:notify:gateway -- --event voice_transcription_completed --on
```

After an independent local-ASR run completes, the voice owner queues a
`voice_transcription_completed` request through `town_crier`. The message omits
the recording title, transcript body, source audio, speaker identity, and local
absolute paths. Delivery failure is recorded separately and does not change the
completed transcript state.

Create the local MacBook Air profile:

```bash
npm run guild-hall:voice-capture -- init-config \
  --model-path /models/ggml-large-v3-turbo.bin \
  --label office-day \
  --chunk-seconds 60 \
  --terms-prompt 'KVDS, LIG, SAS, 1147B, current probe, 로텍, 슬립링, SE50, 검교정, 전류 프로브, 커패시터, IP67, 40G'
```

Check whether the recorder, ASR binary, and model path are available:

```bash
npm run guild-hall:voice-capture -- preflight \
  --config _workspaces/system/voice_capture/config/voice_capture.profile.json
```

Preview the paths and first chunk command without recording:

```bash
npm run guild-hall:voice-capture -- plan \
  --config _workspaces/system/voice_capture/config/voice_capture.profile.json
```

Run continuously until interrupted:

```bash
npm run guild-hall:voice-capture -- run \
  --config _workspaces/system/voice_capture/config/voice_capture.profile.json
```

Validate a generated session directory:

```bash
npm run guild-hall:voice-capture -- validate-session \
  --session-dir _workspaces/system/voice_capture/sessions/2026-06-26/<session-id>
```

Summarize a generated session:

```bash
npm run guild-hall:voice-capture -- status \
  --session-dir _workspaces/system/voice_capture/sessions/2026-06-26/<session-id>
```

Register a session in the local recording library before project routing:

```bash
npm run guild-hall:voice-capture -- register-library \
  --session-dir _workspaces/system/voice_capture/sessions/2026-06-26/<session-id> \
  --project-code P00-000_INBOX \
  --apply
```

This writes metadata-only indexes under
`_workspaces/system/voice_capture/library/`; it does not copy raw audio or
transcript bodies.

When several devices or services recorded the same meeting, keep every physical
recording as a separate session and recording entry. Link them through a
metadata-only manifest under
`_workspaces/system/voice_capture/meeting_bundles/<date>/<bundle_id>/`.
The bundle may record time offsets, source roles, and payload refs, but must not
embed audio or transcript bodies. Generate meeting minutes and task candidates
once per bundle so duplicated recordings do not create duplicated work.

Write metadata-only review drafts under `_workmeta` after a session exists:

```bash
npm run guild-hall:voice-capture -- write-workmeta-draft \
  --session-dir _workspaces/system/voice_capture/sessions/2026-06-26/<session-id> \
  --project-code P00-000_INBOX \
  --apply
```

The draft files contain pointers, counts, and review state only. They do not
copy raw audio or transcript body into `_workmeta`.

## Raw Transcript Sharing

Each session keeps the original transcription under its session directory:

- `transcript.txt`: combined plain-text transcript with chunk timestamps.
- `transcript.jsonl`: machine-readable transcript segments.
- `transcripts/chunk_*.txt`: per-chunk raw text sidecars.
- `transcripts/chunk_*.srt`: per-chunk timestamp subtitle sidecars.
- `audio/chunk_*.wav`: raw audio chunks.
- Imported provider originals may use `audio/source.m4a`, `source.wav`, `source.mp3`, `source.flac`, or `source.ogg`; PLAUD share audio commonly arrives as OGG/Opus.
- `speakers/*`: optional rough local speaker sidecars when generated.

These files are intentionally local `_workspaces` payloads. Share them through
an owner-approved local/shared folder, not through public Git or `_workmeta`.

Render a launchd plist for manual installation:

```bash
npm run guild-hall:voice-capture -- render-launchd \
  --config _workspaces/system/voice_capture/config/voice_capture.profile.json
```

The command writes a local-only plist under
`_workspaces/system/voice_capture/launchd/` and prints the manual install
command. It does not install or load launchd by itself.

Generate macOS command templates without writing a profile:

```bash
npm run guild-hall:voice-capture -- macos-commands \
  --model-path /models/ggml-large-v3-turbo.bin \
  --input-device :0
```

## Install Notes

The MVP expects local tools to be installed outside Soulforge:

- `ffmpeg` or another recorder command.
- `whisper-cli` from `whisper.cpp`.
- A local Whisper model such as `ggml-large-v3-turbo.bin`.
- PLAUD account collection additionally requires Node.js 20 or newer and the
  official `@plaud-ai/cli`; login tokens remain under the CLI-managed user
  profile and must not be copied into the repository or `_workmeta`.

On macOS, the first real recording run may require microphone permission for the
terminal application running the command.

## Validation

```bash
npm run validate:voice-capture
```
