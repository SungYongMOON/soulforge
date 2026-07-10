# guild_hall/activity

## 목적

- `activity/` 는 Soulforge 전체 recent-context 장부를 쓰고 재생성하는 구현 surface 다.
- active write target 은 local-only `guild_hall/state/operations/soulforge_activity/**` 이며 public Git 에 올리지 않는다.

## 명령

```bash
npm run guild-hall:activity:log -- --scope healer --action manual_note --summary "short public-safe summary"
npm run guild-hall:activity:refresh -- --json
npm run guild-hall:activity:asset-usage-report -- --json
npm run guild-hall:activity:project-mail-candidates -- --json
npm run guild-hall:activity:sync -- --json
```

`log` 는 선택적으로 `--asset-type`, `--asset-id`, `--asset-ref`,
`--maintenance-owner`, `--baseline-ref`, `--outcome-evidence-ref`,
`--fallback-ref`, `--lifecycle-policy-ref`, `--duration-ms` 를 받아 custom
workflow/skill/party/automation 실행 metadata 를 같은 event 에 남긴다.
`asset-usage-report` 는 canonical workflow/party/skill catalog 와 기록된 event 를
합쳐 사용량·결과·owner/baseline/fallback/evidence 누락을 보여 준다. 기본/최대
최근 5,000 event와 한 건 lookahead를 읽고 실제 scan 수와 confirmed truncation
여부를 공개한다. local 또는
external automation 은 runtime event 가 있을 때만 목록에 나타난다.

`sync` 는 24시간 PC 가 `private-state` 의 activity mirror 를 pull 한 뒤 local/private activity event ledger 를 `entry_id` 기준으로 병합하고, 양쪽 `latest_context.json` 을 재생성한 다음 변경이 있으면 `private-state` 에 commit/push 한다.
기본 sync 는 먼저 local `mail_candidate` queue 의 body-safe pending 후보를 activity event 로 투영한다.
대상 `private-state` 는 Soulforge root 바로 아래 nested repo 이고 현재 branch 가 `main` 일 때만 실행한다.

## 경계

- `summary`, `next_action`, `refs` 같은 public-safe metadata 만 기록한다.
- custom asset report 는 기록된 metadata 의 집계일 뿐 품질, ROI, default route,
  retire/archive 결정을 만들지 않는다.
- `asset_usage`의 label/ref는 non-string scalar, secret-like value, raw HTML,
  encoded traversal, absolute/path-traversal ref/fragment를 거부한다. 성공 evidence는
  엄격한 timestamp가 있는 성공 result event에만 결합한다.
- raw mail body, HTML body, secret, token, cookie, session, attachment binary 는 기록하지 않는다.
- project 상세 근거는 각 owner surface 에 두고, activity event 는 이어받기용 요약만 남긴다.
- `sync` 는 mailbox raw, attachment payload, secret file, `_workspaces`, `_workmeta` 를 읽지 않는다.
- `sync` 는 activity JSONL row 를 읽더라도 allowlist 된 event 필드만 mirror 한다. legacy row 의 unknown field 는 복사하지 않고, malformed JSONL row 는 원본 ledger 안에 그대로 보존하되 다른 surface 로 복제하지 않는다.
- `mail_candidate` projection 은 candidate JSON 파일 자체를 private-state 로 복제하지 않고, candidate id, subject, sender, attachment count, received_at, local candidate ref 만 activity summary 로 남긴다.
- raw mail body, HTML body, attachment filename/URL/local path, raw provider payload 는 projection 에 포함하지 않는다.
- `sync` 는 `log/**` markdown/report file 을 mirror 하지 않는다. 상세 report 취합은 별도 sanitizer/allowlist 가 생길 때까지 v0 범위 밖이다.
- `sync --json` 은 private git command 의 stdout/stderr 를 출력하지 않고 단계 성공/실패만 표시한다.

상세 계약은
[`CUSTOM_ASSET_USAGE_LIFECYCLE_V0.md`](../../docs/architecture/guild_hall/CUSTOM_ASSET_USAGE_LIFECYCLE_V0.md)를 따른다.
