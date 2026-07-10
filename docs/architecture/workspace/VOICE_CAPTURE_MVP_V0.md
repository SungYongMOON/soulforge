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
- `_workmeta/**`: reviewed metadata only. Raw audio and transcript bodies are not
  copied there.
- Project owners: approve project route, assignee, due date, completion
  criteria, and formal task ledger promotion.

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
- The normal PLAUD collector is event-driven. A fresh Hiworks PLAUD transcript
  notice writes a sanitized trigger to the shared workspace queue, and the Mac
  mini launchd `WatchPaths` job drains it. A successful import also writes a
  local-ASR queue item. The same node watches that queue and runs the configured
  `whisper.cpp` model against the original audio. Explicit `sync` remains a
  recovery command rather than the normal periodic trigger.
- Provider recording IDs provide payload deduplication. A trigger remains
  pending when audio or transcript is not yet available.
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

## Non-Goals

- No model training.
- No automatic project route acceptance.
- No formal task ledger mutation.
- No raw payload under `_workmeta` or public repo files.
- No automatic launchd installation.
- No production-quality speaker diarization claim. Local experimental sidecars
  can be stored under the session, but they remain review inputs.

## Validation

```bash
npm run validate:voice-capture
```
