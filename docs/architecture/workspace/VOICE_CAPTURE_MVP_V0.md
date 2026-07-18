# Voice Capture Operational v0

## Purpose

This document defines the local always-on voice capture slice for the MacBook
Air workflow. The goal is to keep continuous microphone intake, local
transcription, review routing, and metadata-only handoff under Soulforge control
without making ChatGPT share links or cloud summaries the source of truth.

## Shape

```text
microphone recorder command
  -> fixed-size audio chunks under _workspaces
  -> local ASR command such as whisper.cpp
  -> transcript sidecars under _workspaces
  -> session status and validation
  -> source_event_draft.yaml
  -> metadata-only recording library registration
  -> metadata-only _workmeta review draft
  -> later reviewed project route and draft actions

PLAUD account collector on an always-on node
  -> official CLI recent recording IDs
  -> original audio + provider transcript + provider summary
  -> isolated session under the same recording library
  -> provider text held as unverified auxiliary evidence
  -> resumable local whisper.cpp queue from the original audio
  -> versioned independent transcript under the session analysis directory
  -> metadata-only voice source pointer for project-context routing
  -> later independent transcription and project-context review
```

## Owner Split

- `guild_hall/voice_capture/`: local command supervisor and session artifact
  writer.
- `_workspaces/system/voice_capture/**`: raw audio, raw transcripts, ASR
  sidecars, profiles, local source event drafts, recording library manifests,
  and rendered launchd plists.
- `_workmeta/**`: reviewed or explicitly AI-provisional metadata only. Raw audio
  and transcript bodies are not copied there.
- Mac mini voice primary: write shared voice sessions, queues, library state,
  independent ASR results, and downstream analysis requests as the single
  operational writer.
- AI context resolver target: produce separately labelled provisional project,
  assignee, due-date, decision, and task records without claiming human
  approval. Only exceptions and irreversible actions wait for a person.
- Project owners: retain authority for external execution, official approval,
  technical truth, and correction of exception cases.

For the HPP Task Engine/MCP target, the Mac is a **source-local spool and source
producer**, not the accepted central custody writer. It keeps recorder/ASR queue,
raw audio, transcript revisions, and durable local outbox until an HPP
strict-private-office-LAN mTLS/authenticated-HTTPS transfer receipt is verified.
VPN/Tailscale/remote transfer remains `OFF/DEFER`. HPP `transfer_service` alone
writes accepted quarantine/inbox bytes; a separate HPP promoter alone creates an
approved project binding. OneDrive arrival or shared-link visibility is not HPP
acceptance. During HPP outage the Mac holds/retries locally and never mounts HPP
storage or becomes a split central writer. Exact HPP path/network/cert binding is
private `VERIFY_HP`; HPP custody is `TARGET` and no live binding is created by this document.

The AI context resolver is an owner-approved target, not a current runtime
claim. The current MVP still stops at `P00-000_INBOX`, metadata-only source
pointers, and completion notification until the provisional-state schema,
project-context resolver, writer, validator, and fixtures are implemented.

## Runtime Contract

- A session is chunked; a day-long recording must not become one unbounded
  audio file.
- Each chunk has a stable `chunk_index`, audio ref, optional transcript sidecar
  refs, and a transcript JSONL segment when text output is available.
- Each session also writes `transcript.txt` as a combined plain-text transcript
  for local review and owner-approved sharing.
- ASR and recorder commands are local command templates. The first MVP does not
  vendor models or install tools.
- The command template placeholders are rendered with shell-quoted values.
- A JSON profile under `_workspaces/system/voice_capture/config/` can hold the
  day-to-day command templates and domain terms.
- `preflight` checks command presence and the declared local model path before a
  long recording run.
- `status` summarizes a session from file counts and JSONL segments without
  reading transcript text into `_workmeta`.
- `register-library --apply` registers a session into
  `_workspaces/system/voice_capture/library/` with metadata-only global and
  project-route indexes.
- `write-workmeta-draft --apply` creates metadata-only review packets. It does
  not promote project route or mutate a formal task ledger.
- `render-launchd` writes a local-only plist for manual installation. It does
  not install, load, or unload launchd by itself.
- `prepare-delivery` writes a metadata-only producer receipt after all required
  files for `plaud_import_ready` or `local_asr_ready` exist. `ready` means
  producer complete, not delivered.
- `ack-delivery` recomputes exact local bytes on a consumer and records
  `delivered`, `missing`, or `mismatch`; `delivery-status` also reports an old
  acknowledgement as `stale` when the current receipt changes.
- Delivery refs are relative and limited to resolved
  `_workspaces/system/voice_capture` or `_workmeta`. The intended
  `_workspaces/system` shared symlink is required and allowed only when it
  resolves outside the public repository. A normal in-repo system directory,
  a link into any repo subtree, traversal, absolute/URL
  refs, nested or file-level symlinks, secret-like keys, and raw body fields are
  rejected.
- Receipt `created_at` and acknowledgement `checked_at` are strict UTC audit
  timestamps. Identical reruns preserve both timestamp and mtime; changed files,
  receipt, or verification status create a new timestamp.
- Every acknowledgement file row durably records observed size and SHA-256;
  missing rows use `null/null`. Status must agree with those observations and
  the receipt expectations. A computed `checked_at` before receipt `created_at`
  fails before ack/latest write; status retains a stale guard for forged or
  legacy clock-inverted files. Producer and consumer clocks therefore require sync.
- Node labels are operational assertions rather than cryptographic identity.
  Self-ack with the producer label is rejected, and authorized execution on the
  different consumer PC remains required. Metadata consistency checks are not a
  cryptographic signature and cannot prevent a writer from forging payload and
  metadata together.
- Each session receipt path is latest-stage state, not an immutable archive.
  `local_asr_ready` supersedes `plaud_import_ready`, so the previous ack becomes
  stale and must be recomputed.
- The normal PLAUD collector is event-driven. A fresh Hiworks PLAUD transcript
  notice writes a sanitized trigger to the shared workspace queue, and the Mac
  mini persistent launchd loop drains local mail and ASR queues every five
  minutes. It does not query PLAUD when both queues are empty. A successful
  import also writes a local-ASR queue item, and the same loop runs the
  configured `whisper.cpp` model against the original audio. Explicit `sync`
  remains a recovery command rather than the normal provider polling trigger.
  The loop rejects unsafe retry intervals, fails closed when its repo root is
  unavailable, and suppresses successful/empty drain output so the persistent
  job does not create unbounded routine logs.
- If a restart leaves a queue item after the session transcript already
  completed, the worker reuses or reconstructs the completed analysis manifest
  from the session pointers, retries unsent completion bookkeeping, and moves
  the queue item without running audio inference again.
- Provider recording IDs provide payload deduplication. A trigger remains
  pending when audio or transcript is not yet available.
- Every watcher run scans imported audio sessions for the current independent
  run before draining the durable queue. This recovers a session whose original
  import succeeded but whose first queue-file write failed, without downloading
  or duplicating the original recording again.
- PLAUD audio is a canonical source candidate. PLAUD transcript and speaker
  labels remain auxiliary and unverified; PLAUD summaries are quarantined and
  cannot directly create tasks or meeting minutes.
- Independent ASR outputs are versioned under
  `sessions/**/analysis/local_asr/<run_id>/`. They never overwrite the provider
  transcript, remain machine-generated and unverified, and carry `UNKNOWN`
  speaker labels until a separate reviewed diarization or identity lane exists.
- Every completed independent run writes a metadata-only
  `project_context_source.json` plus a directly consumable
  `project_context_event.json`. Their `source_kind: voice` pointer may join mail
  and `se_schedule` sources in the existing project-context model, but they stay
  in `P00-000_INBOX` until project routing is confirmed.
- When the gateway `voice_transcription_completed` Telegram policy is enabled,
  a completed independent run queues a body-safe owner notification through
  `town_crier`. The brief contains only recording time, duration, segment count,
  review state, and next action; notification failure does not invalidate or
  roll back a completed local transcript.
- Successful PLAUD import/library registration and local-ASR completion each
  attempt one idempotent producer receipt. Receipt preparation failure is stored
  as a retryable delivery warning and does not invalidate either successful
  producer stage.

## Recommended First Profile

- Recorder: `ffmpeg` with macOS `avfoundation`.
- ASR: `whisper.cpp` `whisper-cli`.
- Model: `ggml-large-v3-turbo.bin` for the first pilot.
- Chunk size: 60 seconds for live work; 30 seconds for smoke tests.
- Terms prompt: project codes, supplier names, equipment models, and repeated
  technical terms.
- Imported-audio chunking: 30 minutes with a 10-second overlap. Overlap is used
  only as ASR context; midpoint ownership keeps each segment once and makes the
  backlog resumable at chunk boundaries.
- Continuous-office imports enable the local Silero VAD model before Whisper.
  The first profile uses the upstream default speech threshold `0.5`, disables
  decoder temperature fallback and prior-text carryover, suppresses non-speech
  tokens, and keeps a 500 ms speech pad. This prevents a low-signal guess from
  cascading across a long silent interval while preserving a reviewable audit
  trail.
- Exact text repeated within the configured 90-second window is removed from
  the usable transcript and retained in `suppressed_segments.jsonl`. Aggregate
  suppression counts and quality flags stay in the run manifest; the sidecar
  itself remains private under `_workspaces`.

## Reviewed Speaker Identity Lane

Speaker handling is a separate, opt-in analysis lane; it is not part of the ASR
truth claim.

1. Diarization first assigns anonymous session labels such as `SPEAKER_01`.
2. Only owner-approved and consented team members may have local enrollment
   samples and versioned voice embeddings under `_workspaces`.
3. A matcher may propose a person only when the configured similarity and
   minimum-speech thresholds both pass. Otherwise the label stays `UNKNOWN`.
4. Every proposal records the diarization run, embedding profile version,
   score, and review state in a local sidecar. Raw enrollment audio and
   embeddings never enter public Git or `_workmeta`.
5. Speaker identity remains a review input. It cannot by itself assign a task,
   change an SE schedule, confirm attendance, or promote a project route.

Before enabling cross-session identity matching, the owner must decide the
notice/consent, enrollment, access, retention, revocation, and human correction
rules. Model training is not required for the first lane; diarization plus
reviewed embedding matching is sufficient for a pilot.

Use the public-safe
[`team_speaker_enrollment_reading_script.ko.md`](examples/voice_capture/team_speaker_enrollment_reading_script.ko.md)
for the first team enrollment pilot. Actual names, ID mappings, recordings, and
voice embeddings remain local payloads and are not part of the example.

## Non-Goals

- No model training.
- No human-accepted project route or human approval fabricated by AI.
- No current-runtime claim that automatic project/assignee/task resolution has
  already been implemented.
- No external send, purchase, official approval, or technical-truth mutation
  from an AI provisional record.
- No raw payload under `_workmeta` or public repo files.
- No automatic launchd installation.
- No production-quality speaker diarization claim. Local experimental sidecars
  can be stored under the session, but they remain review inputs.

## Validation

```bash
npm run validate:voice-capture
```
