# GATEWAY_MAIL_FETCH_V0

## 목적

- 이 문서는 Soulforge clone 만으로 메일 수집 edge 를 다시 세팅할 수 있게 `gateway mail fetch` 캡슐의 tracked source 와 local runtime 경계를 잠근다.
- 수집기는 `guild_hall/state/gateway/` 아래 mailbox raw/events/attachments 를 materialize 하고, 이후 `guild-hall:gateway:intake` 가 그 결과를 monster intake 로 소비한다고 본다.

## tracked source 위치

- 실행 캡슐: `guild_hall/gateway/mail_fetch/`
- launcher: `guild_hall/gateway/mail_fetch/cli.py`
- healthcheck: `guild_hall/gateway/mail_fetch/healthcheck.py`
- env example: `guild_hall/gateway/mail_fetch/email_fetch.env.example`
- collector tests: 같은 캡슐 아래에 둔다.
- spec/runbook/policy 정본: `docs/architecture/guild_hall/gateway/mail_fetch/` 아래에 둔다.

## local runtime 위치

- mailbox root: `guild_hall/state/gateway/mailbox/`
- runtime root: `guild_hall/state/gateway/log/mail_fetch/`
- mail candidate queue root: `guild_hall/state/gateway/mail_candidate/`
- default env file: `guild_hall/state/gateway/mailbox/state/email_fetch.env`

Env 파일의 경로 값은 Soulforge root 기준 상대경로를 권장한다. 예를 들어
`guild_hall/state/gateway/log/mail_fetch` 는 현재 clone 의 해당 runtime root 로
해석한다. 기존 env 파일 호환을 위해 `../../log/mail_fetch` 처럼 env 파일
위치 기준 상대경로도 유지하지만, 새 예시와 기록에는 PC별 mount/home 절대경로를
쓰지 않는다.

## mailbox materialization shape

```text
guild_hall/state/gateway/
├── mailbox/
│   ├── company/
│   │   ├── mail/
│   │   │   ├── raw/
│   │   │   ├── source_custody/
│   │   │   ├── events/
│   │   │   └── attachments/
│   │   └── ads/
│   │       └── events/
│   ├── personal/
│   │   └── mail/
│   │       ├── raw/
│   │       ├── source_custody/
│   │       ├── events/
│   │       └── attachments/
│   └── state/
│       └── email_fetch.env
├── mail_candidate/
│   └── queue/
│       └── pending/
├── bindings/
│   └── notify_policy.yaml
└── log/
    └── mail_fetch/
        ├── state/
        ├── logs/
        └── monitor/
```

## 실행 명령

```bash
npm run guild-hall:gateway:fetch -- --once --json
npm run guild-hall:gateway:fetch:healthcheck -- --json
```

## Telegram mail brief

- `mail_received` gateway notify 가 켜져 있으면 fetch pipeline 은 dedupe 를 통과한 fresh event 마다 `town_crier` queue 에 Telegram brief request 를 적재한다.
- brief 는 한국어 문장형으로 만들고, Siri 가 읽어도 자연스럽게 들리도록 `NOTIFY_BRIEF_FORMAT_V0.md` 규칙을 따른다.
- brief 에는 source, subject, 첫 발신자, 첨부 개수, 수신 시각, 다음 행동만 포함한다.
- mail body, HTML body, attachment 원문/파일명/URL, raw row, secret 값은 Telegram text 에 포함하지 않는다.

## Mail candidate queue

- fetch pipeline 은 fresh event 를 mailbox event JSONL 에 쓴 뒤, classification bucket 이 `mail` 인 event 만 `mail_candidate` local queue 에 적재한다.
- queue item 은 `mail_candidate.queue_item.v1` JSON 파일이며 기본 위치는 `guild_hall/state/gateway/mail_candidate/queue/pending/<candidate_id>.json` 이다.
- candidate 는 monster current state 가 아니라 `mail_intake_request` 생성 전 업무화 검토 대기 item 이다.
- candidate item 에는 source event pointer, subject, sender, recipient count, attachment count/type, classification summary 만 넣는다.
- body text, HTML body, raw provider payload, attachment filename/URL/local path, token, password 는 넣지 않는다.
- 업무화 검토가 끝난 candidate 는 `guild-hall:gateway:mail-candidate:promote` 로 local-only `mail_intake_request` payload 로 승격할 수 있다.
- 상세 계약은 [`MAIL_CANDIDATE_QUEUE_V0.md`](MAIL_CANDIDATE_QUEUE_V0.md) 를 따른다.

## PLAUD transcript-ready trigger

- Hiworks fresh event의 발신 domain이 owner-configured PLAUD domain과 일치하고 제목 또는 첨부 이름에서 전사 완료 신호가 확인되면 shared voice trigger를 만든다. 메일 본문의 일반 기능 안내만으로는 trigger를 만들지 않는다.
- trigger 기본 위치는 `_workspaces/system/voice_capture/plaud_mail_triggers/pending/`이다. 여러 PC가 같은 OneDrive-backed `_workspaces/system` view를 볼 때 메일 수집 PC와 맥미니 collector 사이의 전달면이 된다.
- trigger에는 mail event/provider message의 hash, source, 수신 시각만 기록한다. 제목, 주소, 본문, 첨부명, PLAUD link, token은 복사하지 않는다.
- trigger는 메일 내용을 회의록 근거로 승격하지 않는다. 맥미니가 공식 PLAUD CLI로 원본 오디오와 provider 전사·요약을 다시 수집하게 하는 신호일 뿐이다.
- 정상 경로는 mail event → shared trigger → macOS `WatchPaths` → PLAUD CLI 원음 import → local-ASR queue → 독립 `whisper.cpp` 전사다. 독립 30분 polling은 사용하지 않는다.
- 원음 import 완료와 독립 전사 완료는 서로 다른 durable queue 상태다. 원음이 이미 확보됐으면 mail trigger는 닫을 수 있지만, 독립 전사 실패 queue는 남겨 launchd가 5분 throttle로 재시도한다.

## Mail task register follow-on

`register-mail-tasks` is a follow-on consumer of the derived
`mail_work_priority` latest JSON, not a mailbox fetch stage. It must not read
`guild_hall/state/gateway/mailbox/**`, raw mail bodies, HTML, attachment
payloads, provider payloads, env files, tokens, cookies, or `_workspaces/**`
payloads.

The command is dry-run by default. With `--apply`, it may write only
metadata-safe, non-terminal, exact project routes such as `P26-014` into
`_workmeta/<project_code>/reports/open_actions/open_action_register.md`.
Ambiguous `P00-000_INBOX` review routes and personal/promo routes stay out of
project truth. With `--notify`, it queues through the existing town_crier
gateway `mail_received` Telegram policy only after rows are written.

## Hiworks POP3 long line

- Hiworks POP3 메시지는 Python `poplib` 기본 라인 제한보다 긴 body/HTML/encoded attachment 라인을 반환할 수 있다.
- 수집기는 Hiworks `RETR` 응답만 별도 reader 로 읽고, 기본 한 줄 허용치는 `HIWORKS_POP3_MAX_LINE_BYTES=10485760` 이다.
- 이 값은 raw mail/body 를 터미널에 출력하지 않고, 수집 실패 시 operator summary 에는 sanitized error code/count 만 남긴다.

## Hiworks POP3 cursor

- Hiworks POP3 수집은 `last_uidl` 이 현재 mailbox 에 남아 있으면 그 이후 메시지만 후보로 본다.
- `seen_uidls` 는 dedupe 보조 window 로 유지하되, window 밖의 오래된 UIDL 이 새 메일보다 먼저 재수집되지 않도록 `last_uidl` 진행선을 우선한다.
- pipeline 은 dedupe 를 통과한 fresh event 의 raw row 만 materialize 한다.

## Hiworks RFC822 source custody

- Hiworks POP3 `RETR`로 받은 exact RFC822 bytes는 MIME 파싱과 pipeline dedupe
  전에 mailbox workspace의
  `mail/source_custody/hiworks/sha256/<prefix>/<sha256>.eml`에 저장한다.
- `storage_ref`는 `source_custody` root 기준 상대경로이며 normalized event의
  `raw.source_custody`에 SHA-256과 exact byte size와 함께 남는다. `.eml` bytes는
  raw/event JSONL이나 public fixture에 복사하지 않는다.
- content-addressed replay는 같은 bytes를 다시 쓰지 않는다. 기존 hash path가
  다른 bytes, symlink, junction, reparse point, 또는 root escape를 가리키면
  fail closed하고 해당 UIDL 진행을 멈춘다.
- `--ingress-only`에서도 이 immutable source custody는 기록한다. native/link
  attachment 추출과 project history, candidate, notification, ERP/MCP/project
  promotion은 계속 비활성화한다. 첨부 복구의 원천은 저장된 RFC822 MIME이다.
- offline custody link CLI는 private normalized-event JSONL과 이 custody root를
  명시 입력으로 받아 immutable metadata receipt를 만든다. EML은 정확히
  `hiworks/sha256/<2-lowercase-hex-prefix>/<64-lowercase-hex-sha256>.eml` shape만
  허용한다. output은 caller-selected private mailbox runtime/custody evidence
  owner가 소유하며 public/tracked 또는 publication surface로 자동 이동하지 않는다.

## 경계

- tracked source 는 Soulforge 가 소유한다.
- 실제 mailbox dump, token, password, last cursor, run summary 는 `guild_hall/state/gateway/**` local runtime 이 소유한다.
- 외부 별도 저장소의 runtime/state/token 파일을 전제로 두지 않는다.

## 관련 경로

- [`MULTI_PC_DEVELOPMENT_V0.md`](../../../docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md)
- [`MAIL_CANDIDATE_QUEUE_V0.md`](../../../docs/architecture/workspace/MAIL_CANDIDATE_QUEUE_V0.md)
- [`MAIL_INTAKE_REQUEST_V0.md`](../../../docs/architecture/workspace/MAIL_INTAKE_REQUEST_V0.md)
- [`WORKSPACE_INTAKE_INBOX_V0.md`](../../../docs/architecture/workspace/WORKSPACE_INTAKE_INBOX_V0.md)
- [`guild_hall/gateway/mail_fetch/README.md`](../../../guild_hall/gateway/mail_fetch/README.md)
- [`docs/architecture/guild_hall/gateway/mail_fetch/README.md`](../../../docs/architecture/guild_hall/gateway/mail_fetch/README.md)
