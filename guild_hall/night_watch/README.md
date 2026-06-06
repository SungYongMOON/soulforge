# guild_hall/night_watch

## 목적

- `night_watch/` 는 nightly review / summary owner 다.
- v1 에서는 naming 과 state root 만 고정하고, 기존 `nightly_sweep` 와의 alias 호환을 유지한다.

## 현재 기준

- tracked canon 은 `night_watch` 자동화가 왜 필요한지와 무엇을 점검하는지만 적고, 실제 실행 시간표와 on/off 상태는 Codex app local automation 이 맡는다.
- tracked automation source 는 `guild_hall/night_watch/automations/*.spec.json`, `*.prompt.txt`, `render_local_automation.mjs`, `preflight_repo_sync.mjs` 로 관리하고, 각 PC 의 local `automation.toml` 은 이 source 로 다시 생성한다.
- current-default 장기 운영 자동화는 `Preflight Repo Sync -> Boundary Check -> Portability Check -> Context Drift Check -> Fix Draft` 순서의 single pipeline 을 기본으로 본다.
- 점검 결과와 draft report 는 `guild_hall/state/operations/soulforge_activity/**` 아래의 `latest_context.json`, `events/*.jsonl`, `log/**/*.md` 로 저장한다.
- Codex app automation 이 `worktree` 에서 돌아가더라도, 실제 read/write 는 이 PC 의 active absolute Soulforge root 를 써야 한다.
- pipeline 은 점검 전에 public `Soulforge`, `_workmeta`, `private-state` 를 fast-forward sync 하고, 그 preflight 가 깨끗할 때만 후속 점검을 이어간다.
- preflight 는 `fail-closed` 를 유지하되, DNS/일시 네트워크 오류 같은 retryable failure 에 한해서만 bounded retry 후 최종 중단한다.
- `guild_master` / `night_watch` lane 은 반복되는 상위 개념이나 reusable relation pattern 을 ontology review candidate 로 다시 상기하고, 필요하면 activity surface 에 carry-forward 한다.
- daily work packet 의 표시용 `dev_worker.candidates` 는 전체 후보 수와 summary count 를 유지하되, `promotable`, auto-approvable, `proposed`/`open`/`approved`/`approval-only` 후보를 closed/completed 후보보다 먼저 8개까지 보여준다.
- 표시용 후보 row 는 `owner_approval_state` 를 함께 보여서 owner-approved active 후보가 generic not-approved 후보와 구분되지만, 이 label 은 직접 promotion 이나 ready queue 생성을 수행하지 않는다. 자동 개발 트리거가 ACTIVE 일 때 dev-worker lane 이 별도로 승인 후보를 승격한다.
- `Fix Draft` 는 tracked docs/code 를 바로 수정하지 않고, draft-only 후속 조치 제안만 남기는 lane 으로 둔다.
- 상세 운영 계약은 [`docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`](../../docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md) 를 따른다.

## 로컬 생성

- 현재 PC 에 local automation 을 다시 만들 때는 아래 명령을 쓴다.
- `npm run guild-hall:night-watch:render -- --install --local-root <runtime-local-root> --workmeta-root <runtime-workmeta-root> --private-state-root <runtime-private-state-root>`
- Stage 0 preflight 를 단독으로 실행할 때는 아래 명령을 쓴다.
- `npm run guild-hall:night-watch:preflight -- --local-root <runtime-local-root> --workmeta-root <runtime-workmeta-root> --private-state-root <runtime-private-state-root>`
