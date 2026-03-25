# guild_hall/night_watch

## 목적

- `night_watch/` 는 nightly review / summary owner 다.
- v1 에서는 naming 과 state root 만 고정하고, 기존 `nightly_sweep` 와의 alias 호환을 유지한다.

## 현재 기준

- tracked canon 은 `night_watch` 자동화가 왜 필요한지와 무엇을 점검하는지만 적고, 실제 실행 시간표와 on/off 상태는 Codex app local automation 이 맡는다.
- tracked automation source 는 `guild_hall/night_watch/automations/*.spec.json`, `*.prompt.txt`, `render_local_automation.mjs` 로 관리하고, 각 PC 의 local `automation.toml` 은 이 source 로 다시 생성한다.
- current-default 장기 운영 자동화는 `Preflight Repo Sync -> Boundary Check -> Portability Check -> Context Drift Check -> Fix Draft` 순서의 single pipeline 을 기본으로 본다.
- 점검 결과와 draft report 는 `guild_hall/state/operations/soulforge_activity/**` 아래의 `latest_context.json`, `events/*.jsonl`, `log/**/*.md` 로 저장한다.
- Codex app automation 이 `worktree` 에서 돌아가더라도, 실제 read/write 는 이 PC 의 active absolute Soulforge root 를 써야 한다.
- pipeline 은 점검 전에 public `Soulforge`, `_workmeta`, `private-state` 를 fast-forward sync 하고, 그 preflight 가 깨끗할 때만 후속 점검을 이어간다.
- `Fix Draft` 는 tracked docs/code 를 바로 수정하지 않고, draft-only 후속 조치 제안만 남기는 lane 으로 둔다.
- 상세 운영 계약은 [`docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`](../../docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md) 를 따른다.

## 로컬 생성

- 현재 PC 에 local automation 을 다시 만들 때는 아래 명령을 쓴다.
- `npm run guild-hall:night-watch:render -- --install --local-root /Volumes/OPENCLAW_WS/Soulforge --workmeta-root /Volumes/OPENCLAW_WS/Soulforge/_workmeta --private-state-root /Volumes/OPENCLAW_WS/Soulforge/private-state`
