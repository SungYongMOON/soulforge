# guild_hall/night_watch

## 목적

- `night_watch/` 는 nightly review / summary owner 다.
- v1 에서는 naming 과 state root 만 고정하고, 기존 `nightly_sweep` 와의 alias 호환을 유지한다.

## 현재 기준

- tracked canon 은 `night_watch` 자동화가 왜 필요한지와 무엇을 점검하는지만 적고, 실제 실행 시간표와 on/off 상태는 Codex app local automation 이 맡는다.
- current-default 장기 운영 자동화는 `Boundary Check`, `Portability Check`, `Context Drift Check` 와 companion `Fix Draft` 설계를 포함한다.
- 점검 결과와 draft report 는 `guild_hall/state/operations/soulforge_activity/**` 아래의 `latest_context.json`, `events/*.jsonl`, `log/**/*.md` 로 저장한다.
- Codex app automation 이 `worktree` 에서 돌아가더라도, 실제 read/write 는 이 PC 의 active absolute Soulforge root 를 써야 한다.
- `Fix Draft` 는 tracked docs/code 를 바로 수정하지 않고, draft-only 후속 조치 제안만 남기는 lane 으로 둔다.
- 상세 운영 계약은 [`docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`](../../docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md) 를 따른다.
