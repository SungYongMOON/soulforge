# guild_hall/voice_capture

## Purpose

`voice_capture/` is the local microphone capture supervisor for always-on voice
intake. It does not include or download an ASR model. Instead, it supervises
owner-installed commands such as `ffmpeg`, `sox`, and `whisper-cli`, then writes
bounded session artifacts under `_workspaces`.

## Boundary

- Raw audio and raw transcripts stay under `_workspaces/system/voice_capture/**`
  or another owner-approved workspace root.
- `_workmeta` receives only reviewed metadata, route candidates, and draft task
  packets after a separate review step.
- The CLI never copies raw audio, transcript bodies, secrets, credentials, or
  private source payloads into public repo files.
- Project route and formal task ledger promotion remain owner-reviewed.

## Commands

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

Write metadata-only review drafts under `_workmeta` after a session exists:

```bash
npm run guild-hall:voice-capture -- write-workmeta-draft \
  --session-dir _workspaces/system/voice_capture/sessions/2026-06-26/<session-id> \
  --project-code P00-000_INBOX \
  --apply
```

The draft files contain pointers, counts, and review state only. They do not
copy raw audio or transcript body into `_workmeta`.

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

On macOS, the first real recording run may require microphone permission for the
terminal application running the command.

## Validation

```bash
npm run validate:voice-capture
```
