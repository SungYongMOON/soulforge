# guild_hall/voice_capture

## Purpose

`voice_capture/` is the local microphone capture MVP for always-on voice intake.
It does not include or download an ASR model. Instead, it supervises local
commands such as `ffmpeg`, `sox`, and `whisper-cli`, then writes bounded session
artifacts under `_workspaces`.

## Boundary

- Raw audio and raw transcripts stay under `_workspaces/system/voice_capture/**`
  or another owner-approved workspace root.
- `_workmeta` receives only reviewed metadata, route candidates, and draft task
  packets after a separate review step.
- The CLI never copies raw audio, transcript bodies, secrets, credentials, or
  private source payloads into public repo files.
- Project route and formal task ledger promotion remain owner-reviewed.

## Commands

Preview the paths and commands without recording:

```bash
npm run guild-hall:voice-capture -- plan \
  --label office-day \
  --chunk-seconds 60 \
  --record-cmd 'ffmpeg -f avfoundation -i :0 -t {duration} -ar 16000 -ac 1 {audio}' \
  --asr-cmd 'whisper-cli -m /models/ggml-large-v3-turbo.bin -f {audio} -l {language} -otxt -osrt -oj -of {output_base}'
```

Run one chunk:

```bash
npm run guild-hall:voice-capture -- run \
  --label office-smoke \
  --chunk-seconds 30 \
  --max-chunks 1 \
  --record-cmd 'ffmpeg -f avfoundation -i :0 -t {duration} -ar 16000 -ac 1 {audio}' \
  --asr-cmd 'whisper-cli -m /models/ggml-large-v3-turbo.bin -f {audio} -l {language} -otxt -osrt -oj -of {output_base}'
```

Run continuously until interrupted:

```bash
npm run guild-hall:voice-capture -- run \
  --label office-day \
  --chunk-seconds 60 \
  --until-stopped \
  --terms-prompt 'KVDS, LIG, SAS, 1147B, current probe, 로텍, 슬립링, SE50, 검교정, 전류 프로브, 커패시터, IP67, 40G' \
  --record-cmd 'ffmpeg -f avfoundation -i :0 -t {duration} -ar 16000 -ac 1 {audio}' \
  --asr-cmd 'whisper-cli -m /models/ggml-large-v3-turbo.bin -f {audio} -l {language} -otxt -osrt -oj -of {output_base}'
```

Validate a generated session directory:

```bash
npm run guild-hall:voice-capture -- validate-session \
  --session-dir _workspaces/system/voice_capture/sessions/2026-06-26/<session-id>
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
