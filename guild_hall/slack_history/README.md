# Slack history foundation

This package is the public-safe, source-native foundation for the Task Engine
Slack communication-history extension (`H07A -> H07B`). It is not a sixth lane
in the shared five-lane project-history envelope.

## Current posture

- The v1 synthetic collector remains feature `OFF` by default.
- The source-native history module remains pure and read-only.
- A private-custody continuous harness now validates one exact joined public
  project-channel binding at a time, writer lease/epoch fencing, immutable raw
  event custody for accepted records, restart-safe cursor/dedupe,
  edits/deletes/replies, metadata-only HOLD routing, and common source-arrival
  timeline annotations.
- A v2 private binding can use bounded Web API polling. It verifies the exact
  token workspace with `auth.test` and the joined public nonshared project
  channel with `conversations.info`, then reads at most 15 history objects per
  request. Each request, including body parsing, has a 15-second wall-clock
  timeout. Slack bot or user access tokens are read only from the approved
  private environment name or a single-link, identity-fenced credential file
  and are never returned in stdout.
- Live collection still requires an owner-managed Slack App, exact workspace
  and channel bindings, minimal read scopes, and private token provisioning.
  The current HPP app uses a user access token so no bot membership or Slack
  write scope is required. None are fabricated by the public package.
- Attachment custody is a separately fenced binding feature and remains `OFF`
  unless `attachment_policy.feature_enabled` is explicitly true. Its policy
  fixes a strict-child custody root under `data_root`, per-message file count,
  per-file and total byte caps, MIME/file-type allowlists, request timeout, and
  bounded `429 Retry-After` retry limits. Policy `OFF` performs no file call.
- When enabled, only Slack-hosted files proven again by `files.info` are
  eligible. The exact workspace/file identity, declared size, MIME/file type,
  hosted/visible/nonexternal state, Slack-owned HTTPS download host, response
  framing, and streamed byte count must all agree. External files, unfurls,
  Slack Connect, `check_file_info`, deleted/tombstoned files, redirects, and
  unknown states fail closed to an explicit metadata-only `HOLD`.
- Accepted attachment bytes use message-batch atomic SHA-256
  content-addressed custody plus single-file-ID identity receipts. Every file
  in one message is downloaded and checked before any content/identity object
  is committed; a later page/state failure rolls back only the exact objects
  created by that transaction. Exact retries and restart dedupe are
  idempotent; changed file ID/revision/content evidence, target tampering, and
  reparse escapes fail closed. Persistent state reads require a stable,
  single-link regular file through opened-handle pre/post identity checks. Raw
  message custody replaces authenticated file and thumbnail locators with
  bounded digest proofs.
- Public fixtures are synthetic metadata. Live cursor values, credentials,
  message bodies, attachment bytes, authenticated locators, and private paths
  do not belong here.

The separate `slack_source_inventory_cli.mjs` is a query-only sanitizer. It
accepts only a pre-observed, metadata-only Slack inventory on standard input
and returns fingerprints and aggregate counts. It does not authenticate,
connect to Slack, discover channels, read messages, or persist its input. The
connected Slack tool remains the read-only source transport and must pass only
the allowlisted fields into this sanitizer.

Live app creation, scope selection, membership changes, token provisioning,
retention/legal-hold policy, user mapping, and production activation remain
private gates.

`slack_app_manifest.yaml` is the public-safe owner-managed app template for the
current polling collector. It requests only `channels:read`,
`channels:history`, and `files:read`; it has no message-write, file-write,
channel-join, user-directory, Socket Mode, bot-user, or Events API authority.
The app must still be installed by the owner and its private user access token
must be provisioned outside Git. The token can read only channels and files
already visible to the installing account; the private stable-ID allowlist
remains the narrower runtime boundary.

The connected interactive Slack reader does not provide a reusable background
token to this Node harness. HPP continuous collection instead uses the
separately installed owner-managed read-only app and a private v3 access-token
binding outside Git. The exact project-channel allowlist is collected in one
bounded batch at 02:00 and 12:00 KST; `IgnoreNew` prevents overlapping runs.

Attachment collection additionally requires owner-approved `files:read` on
that same access token. `files.info` metadata and the selected
`url_private_download` (falling back to `url_private`) are used only in memory;
the token and authenticated locator are not written to state, receipts, raw
custody, pointers, stdout, or errors.

`createSlackWebApiPollingTransport` is the bounded live pull transport.
`slack_live_cli.mjs` is an explicit `--apply` entrypoint and prints only
aggregate counts and coverage gaps. Web API polling cannot prove deletions or
reconstruct edit history that predates activation; those gaps stay explicit.
Full deletion/event fidelity requires a later Events API or Socket Mode
adapter.

`slack_batch_live_cli.mjs` runs one SHA-256-pinned private allowlist of project
channel bindings. Each channel retains its own state root, cursor, lease, and
attachment custody. A failure in one channel is reported only as a redacted
aggregate and does not prevent the remaining allowlisted channels from
running. The batch is bounded by per-channel page and event limits. If a
provider cursor still has another page when `max_pages` is reached, the batch
records `max_pages_continuation_pending` instead of implying complete catch-up.

The HPP scheduler is one hidden current-user Windows task with exactly two
daily local-time triggers: `02:00` and `12:00` KST. It has no persistent polling
loop or repetition trigger, uses `IgnoreNew`, and verifies the Node executable,
runtime manifest, complete runtime file allowlist, batch binding, and plan
digests before execution. Registration is dry-run first and re-attests the
exported task XML after mutation. A failed attestation removes the new task or
restores and re-attests the exact prior exported definition; rollback failure
leaves the task disabled. The scheduler does not change five-lane writer
authority; Slack remains the H07 communication-history extension.

## 프로젝트 채널 게시 운영지침

이 지침은 이미 프로젝트에 바인딩된 Slack 채널 안에서 권한 있는 사람이
수동으로 작성하는 원 게시글에 앞으로 적용한다. 여기서 프로젝트 채널 제목은
Slack 채널 이름이 아니라 원 게시글의 제목 또는 헤드라인을 뜻한다. 이 표시
지침은 `slack_history`, Slack 앱, bot, connector, automation에 쓰기 또는 게시
권한을 부여하지 않으며 채널·메시지 identity, 프로젝트 binding, 수집 coverage,
ERP·task 상태, schema 또는 wire contract를 바꾸지 않는다.

1. 프로젝트 채널의 원 게시글 제목에는 과제코드를 반복하지 않는다.
2. 제목은 `[유형] [선택 영역] 핵심 제목` 형식을 사용하며, 영역은 선택 사항이다.
3. 유형은 `업무지시`, `결정`, `문서`, `절차`, `회의`, `구매요청`, `질문`, `공지`만 사용한다.
4. 선택 영역은 `HW`, `SW`, `기구`, `전장`, `시험`, `구매`, `품질`, `운영`만 사용한다.
5. 원 게시글은 하나만 작성하고 상태 변경은 그 게시글의 thread에 남긴다.
6. 상태는 `요청`, `진행중`, `확인대기`, `보류`, `완료`, `취소`만 사용한다.
7. 진행과 완료 기록은 각각 `[진행중] 날짜 · 변경내용`, `[완료] 날짜 · 완료근거` 형식을 사용한다.
8. 기존 게시물을 소급 수정하지 않는다.
9. 다른 채널에 같은 내용을 중복 게시하지 않으며, 필요하면 원문 링크만 공유한다.
10. 원문, 개인정보, 메일 제목 등 부적절한 정보는 제목이나 태그에 넣지 않는다.

완전히 합성한 공개 안전 예시는 다음과 같다.

```text
[업무지시] [시험] 장비 점검

thread:
[진행중] 날짜 · 점검 시작
[완료] 날짜 · 점검 기록 확인
```

## Identity and revision contract

- Workspace/channel identity is `workspace_id + channel_id`.
- Logical message identity is
  `workspace_id + channel_id + message_ts`.
- An outer delivery `event_id` and its retry evidence never become message
  identity.
- A reply is its own logical message and preserves the root `thread_ts`.
- Message, reply, edit, delete, and tombstone revisions are append-only.
  Supersession cannot cross logical messages, branch, go backward in time, or
  continue after a tombstone.
- Replaying the same delivery evidence is idempotent. Reusing one `event_id`,
  revision ref, page ID, or accepted checkpoint with different evidence fails
  closed.

The module stores only a source metadata digest and attachment pointer
candidates. An attachment pointer can contain an opaque Slack file ID, an
opaque custody ref, a MIME type, an optional content hash, and an optional byte
count. It cannot contain bytes, URLs, local paths, or promotion authority. A
file-bearing message is accepted only after every file has a complete custody
receipt; any partial failure holds the whole message and adds
`attachment_custody_incomplete` to coverage gaps.

## Project scope

An owner-approved, effective-dated
`workspace_id + channel_id -> project_code` binding can establish the default
project scope only when the exact channel is joined and allowlisted.

The following remain `HOLD` unless the binding names the matching exception and
the channel observation carries an explicit rule ref:

- DM
- `general`
- common/shared channel
- archived channel
- Slack Connect channel

An unmapped workspace/channel or `unmapped` channel kind always remains
`HOLD`. Channel name is display metadata only; rename does not change identity
or project scope. A missing user-to-ERP mapping leaves the actor unknown and
never permits display-name inference.

In this harness, `HOLD` is an irreversible exclusion with a metadata receipt,
not reviewable raw custody. The receipt binds the page ID and event ID to the
raw digest, retry metadata, hold reasons, and opaque source refs. Replaying the
exact receipt is idempotent; changing evidence for the same held event fails
closed. The held raw event is neither written nor recoverable from state. Any
future need for reviewable raw HOLD requires a separately approved private
custody policy before collection.

## Cursor and coverage

Backfill pages are bounded by whole-page and event limits. A page is accepted
only after its complete metadata batch validates; a page is never split to
advance the cursor. The cursor retains opaque digests, immutable page receipts,
and cumulative delivery-attempt evidence so an `event_id` conflict cannot be
hidden across page or restart boundaries. Replaying a completed page never
replaces the persisted provider cursor with an older page token. Its generation
digest must match the retained revision set before another page is accepted.
An immutable page-evidence receipt digests every validated record's metadata,
raw digest, and accepted/HOLD disposition, so changing HOLD membership under an
accepted page ID also fails closed. Exact page replay performs no raw-custody or
state rewrite.

The private binding declares `private_root`, a strict-child `data_root`, and one
or more `forbidden_roots` for public repositories and runtime trees. Runtime
validation rejects a data root outside/equal to its private owner root and
rejects either direction of overlap with every forbidden root. Absolute path
syntax alone is not a custody boundary.

The writer lease is fail-closed. A process crash can leave
`leases/slack-continuous.lock`; the harness does not guess that it is stale or
auto-delete it. That lock is a manual recovery blocker: an owner/operator must
first prove that no writer is live, then remove it only through the approved
private runtime procedure. It does not authorize live Slack activation.

Coverage uses the shared six states:

- `complete_with_events`
- `complete_no_events`
- `partial`
- `failed`
- `not_collected`
- `not_applicable`

Feature `OFF` is `not_collected` with an explicit gap, never
`complete_no_events`. `not_applicable` requires an explicit applicability rule.

## Authority ceiling

The output is source history metadata only. Requests, commitments, and
decisions remain downstream candidates. A message, reply, reaction, pin,
delete, or bot action cannot create or complete an ERP task and cannot promote
content into RAG or Wiki knowledge.

## Validation

Run the package without any live binding:

```powershell
node --check guild_hall/slack_history/slack_history.mjs
node --check guild_hall/slack_history/slack_source_inventory.mjs
node --check guild_hall/slack_history/slack_source_inventory_cli.mjs
node --check guild_hall/slack_history/slack_custody.mjs
node --check guild_hall/slack_history/slack_transport.mjs
node --check guild_hall/slack_history/slack_continuous_runner.mjs
node --check guild_hall/slack_history/slack_continuous_cli.mjs
node --check guild_hall/slack_history/slack_live_cli.mjs
node --check guild_hall/slack_history/slack_batch_live_runner.mjs
node --check guild_hall/slack_history/slack_batch_live_launcher.mjs
node --check guild_hall/slack_history/slack_batch_live_cli.mjs
node --test guild_hall/slack_history/slack_history.test.mjs guild_hall/slack_history/slack_source_inventory.test.mjs guild_hall/slack_history/slack_continuous.test.mjs guild_hall/slack_history/slack_batch_live.test.mjs
```

The tests compile the schemas, validate synthetic fixtures, exercise
retry/replay and append-only lineage, verify bounded cursor behavior, cover all
six coverage states, enforce exact metadata-only input fields, verify private
custody/lease/restart behavior, and prove that live activation and embedded
secrets fail closed. Hosted-file fixtures cover PNG/DOCX, duplicate content,
file-ID retry/conflict, framing and byte caps, timeout/network/429 behavior,
redirect isolation, locator/secret nonpersistence, unsafe file states, reparse
escape, tamper detection, partial-message HOLD, and restart dedupe without a
live Slack call.
