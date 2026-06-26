# Voice Capture MVP v0

## Purpose

This document defines the first local always-on voice capture slice for the
MacBook Air workflow. The goal is to test continuous microphone intake without
making ChatGPT share links or cloud summaries the source of truth.

## Shape

```text
microphone recorder command
  -> fixed-size audio chunks under _workspaces
  -> local ASR command such as whisper.cpp
  -> transcript sidecars under _workspaces
  -> source_event_draft.yaml
  -> later reviewed _workmeta source event and draft actions
```

## Owner Split

- `guild_hall/voice_capture/`: local command supervisor and session artifact
  writer.
- `_workspaces/system/voice_capture/**`: raw audio, raw transcripts, ASR
  sidecars, and local source event drafts.
- `_workmeta/**`: reviewed metadata only. Raw audio and transcript bodies are
  not copied there.
- Project owners: approve project route, assignee, due date, completion
  criteria, and formal task ledger promotion.

## Runtime Contract

- A session is chunked; a day-long recording must not become one unbounded
  audio file.
- Each chunk has a stable `chunk_index`, audio ref, optional transcript sidecar
  refs, and a transcript JSONL segment when text output is available.
- ASR and recorder commands are local command templates. The first MVP does not
  vendor models or install tools.
- The command template placeholders are rendered with shell-quoted values.
- The source event draft is a pointer packet, not a reviewed `_workmeta` record.

## Recommended First Profile

- Recorder: `ffmpeg` with macOS `avfoundation`.
- ASR: `whisper.cpp` `whisper-cli`.
- Model: `ggml-large-v3-turbo.bin` for the first pilot.
- Chunk size: 60 seconds for live work; 30 seconds for smoke tests.
- Terms prompt: project codes, supplier names, equipment models, and repeated
  technical terms.

## Non-Goals

- No model training.
- No automatic project route acceptance.
- No formal task ledger mutation.
- No raw payload under `_workmeta` or public repo files.
- No launchd installation in this first slice.
- No speaker diarization claim.

## Validation

```bash
npm run validate:voice-capture
```
