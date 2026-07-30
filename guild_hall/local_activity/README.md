# HPP all-project local activity

`guild_hall/local_activity` collects three HPP-local views for an exact private
project allowlist:

1. project workspace `파일 관찰` through the existing
   `guild_hall/file_activity` scanner;
2. `AI 작업 결과` from the project five-field ledger;
3. a relation-only Codex-origin view over the same summaries.

별도 `HPP Codex 작업 맥락 수집기`도 제공한다. 이 프로그램은 명시적으로
전달받은 정보만 `HPP 로컬 업무 장부`에 append한다. 프로젝트마다 서로 다른 실제
업무 수만큼 `로컬 업무`를 둘 수 있다. 같은 업무를 이어가는 팀장·자식·계속·검증
task만 하나의 `work_id`를 공유하고, bounded `업무 사건`과 결과·검증 ref를
추가한다. 이는 향후 ERP WorkSession이나 H05 machine-verifiable
`실행·검증 영수증`을 대체하지 않는다.

`AI 작업 결과`와 Codex-origin view는 하나의 `native_occurrence_id`를
공유하며, 서로 다른 업무 사건 두 건으로 세지 않는다.

사람이 보는 데이터 이름은 `AI 작업 결과`다. v1 schema, binding key,
ID, machine-local directory는 호환성을 위해 내부 이름 `bounded_work`를 유지한다.
이는 AI가 작성한 요약이며 PC 감시, formal WorkSession, 자동 생성된
`실행·검증 영수증`이 아니다. 더 넓은 데이터 종류는 `실행·검증 증거`이고, 그
안의 exact immutable 단일 객체가 `실행·검증 영수증`이다. 일반 Codex 업무용
common receipt는 아직 구현되지 않았다.

사람이 보는 정본 정의와 폐기 별칭은
[`SHARED_GLOSSARY_V0.md`](../../docs/architecture/foundation/SHARED_GLOSSARY_V0.md#task-engine--ax-업무증거-용어).

## Boundary

- The collector reads only exact project workspace and five-field paths from a
  private binding. It does not discover projects.
- It never reads Codex conversation history, screen content, keyboard input,
  whole operating-system activity, mail, voice, Slack, or an ERP database.
- Workspace file bytes may be streamed for SHA-256 by the existing file
  activity scanner. Bytes are not retained.
- Output first lands in a machine-local HPP outbox. It does not directly mutate
  `_workmeta`, an accepted 프로젝트 시간장부, an official task, or ERP.
- Team-PC history still requires the planned MCP/client-plugin WorkSession
  path. This collector proves only the current HPP-local lane.
- 업무 사건은 whole conversation을 복사하지 않는다. 명시적 시작·task 연결·
  checkpoint·완료 요약과 bounded source/file/run pointer만 보존한다.
- `work_id`는 로컬 업무 하나를 식별한다. 이를 닫아도 ERP task가 완료되거나
  project context가 승인되거나 H03/H05 acceptance가 생기지 않는다.

## Private binding

The private JSON binding uses
`soulforge.hpp_all_project_local_activity_binding.v1` and lists every project
explicitly. It contains host-local absolute paths and therefore stays under
ignored local state or the HPP control root, never public Git.

For each project it binds:

- `workspace_root`;
- `workmeta_root`;
- one `workspace_binding_id`;
- file scan limits;
- the exact
  `reports/procedure_capture/five_field_log.jsonl` source.

New projects are not silently collected. Project onboarding must add one exact
binding row and re-pin the private binding digest.

별도 HPP Codex 작업 맥락 수집기 binding은
`soulforge.hpp_codex_work_context_binding.v1`을 쓴다. HPP `state_root`,
`node_id`, 명시적 `{project_code, enabled}` 목록을 pin하며 conversation text,
task summary, credential을 담지 않는다.

## Output

```text
<state_root>/
|- batches/<YYYY-MM-DD>/<batch_digest>.json
`- projects/<project_code>/
   |- current.json
   |- state/
   |  |- file_scan_cache.json
   |  `- file_inventory_state.json
   `- outbox/
      |- file_activity_delta/<YYYY-MM>/<delta_digest>.json
      `- bounded_work/<snapshot_digest>.json
```

HPP Codex 작업 맥락 수집기는 다음 별도 append-only HPP 로컬 업무 장부를 쓴다.

```text
<state_root>/projects/<project_code>/codex_work_context/
|- leader_events/<event_id_digest>.json
`- work_units/<work_id>/
   |- events/<time>-<event_digest>.json
   `- current.json
```

`events/**`가 증거 owner이고 `current.json`은 재생성 가능한 convenience
snapshot이다. 한 프로젝트에는 독립된 로컬 업무가 여러 개 있을 수 있다. 하나의
`work_id`에는 같은 업무를 이어가는 프로젝트 팀장 task와 worker·continuation·
verifier task 여러 개를 연결할 수 있다. 팀장이 직접 수행한 업무는
`leader_executor`로 기록한다.

The first successful inventory writes one metadata-only baseline delta. Later
scans still enumerate the exact project root but persist only new or changed
observations plus non-authoritative absence candidates. They do not persist a
second full observation packet when nothing changed. The mutable inventory
state retains one compact row per currently observed path so unchanged files
can be suppressed without an LLM. An incomplete listing preserves previously
seen rows and cannot emit absence candidates.
All non-exact hash queue reasons are normalized to one stable `pending`
inventory state so byte-budget ordering does not create false file-history
growth.

An absence candidate is never a deletion. This HPP collector has the `tool_pc`
role, so it cannot confirm deletion even after repeated scans. Exact hashes are
cached by unchanged size/mtime/ctime and may use an owner-bound TTL up to 30
days; pending or large hashes do not prevent path/size/time observations from
being retained.

legacy 내부 `bounded_work` packet은 AI 작업 결과, verification claim,
ref, full-record SHA-256을 보존한다. 같은 source ID가 다른 전체 내용을 가지면
HOLD한다. 이 packet은 candidate projection이며 formal H03 WorkSession, exact
실행·검증 영수증, P1 acceptance가 아니다.

legacy five-field 행은 `at`을 발생·기록 시각으로 함께 해석해 기존 digest와
`native_occurrence_id`를 유지한다. 신규 행은 `occurred_at`을 source 발생시각,
`recorded_at`을 최초 레저 기록시각으로 분리하며 `at == recorded_at`을 호환
alias로 요구한다. 두 additive clock 중 하나만 있거나 alias가 다르면 HOLD한다.

The CLI lock carries a process identity and owner token. A live owner always
blocks another run. A dead legacy or current owner lock is atomically
quarantined and removed after the next successful acquisition, so a crashed
Node process does not permanently stop the 30-minute scheduler.

## Commands

Dry-run is the default:

```powershell
node guild_hall/local_activity/cli.mjs `
  --binding <private-absolute-binding.json> `
  --binding-sha256 sha256:<digest>
```

`--apply` writes only the machine-local outbox. The scheduler wrapper pins the
same binding digest, uses `IgnoreNew`, and launches PowerShell with a hidden
window. The Task Scheduler definition itself is not claimed to have
`Hidden=true`.

HPP Codex 작업 맥락 수집기 command는 별도 pinned private binding과 JSON
payload 하나를 쓴다. CLI가 업무 사건의 `event_id`와 KST-normalized
`occurred_at`을 공급한다.
Pin the event ID when a write may need to be retried; the first accepted event
time remains authoritative on replay. `--occurred-at` remains available when
the caller must preserve a known source time:

```powershell
node guild_hall/local_activity/codex_work_context_cli.mjs `
  --binding <private-absolute-binding.json> `
  --binding-sha256 sha256:<digest> `
  --operation begin_work `
  --project P26-014 `
  --payload-json '{"work_id":null,"leader_thread_ref":"<opaque-ref>","executor_thread_ref":"<opaque-ref>","title":"bounded title","request_summary":"bounded summary","source_refs":[]}'
```

Supported operations are `register_leader`, `begin_work`, `attach_thread`,
`checkpoint`, `finish_work`, `supersede_work`, and read-only `status`. A
completed work unit is never edited in place; a correction marks it
`superseded` and may point to one already-started, non-superseded replacement
work ID in the same project. Self-replacement, missing replacement, and
replacement chains that point at another superseded unit are rejected. Event
occurrence time must not move backwards within a work ID. The writer is fenced
by one HPP-local lock. Dead locks are recovered; a live owner blocks a second
writer for a bounded 15-minute lease, after which a stale or PID-reused lock is
recovered. PowerShell callers should prefer `--payload-base64` because native
Windows argument parsing can remove JSON quote characters; direct process
callers may use `--payload-json`.
The payload cannot override CLI-owned `operation`, `project_code`,
`occurred_at`, or `event_id`. When `begin_work.work_id` is `null`, the generated
ID는 pinned event ID에 대해 deterministic `LW-<project>-<digest>` 형식이어서
retry가 다른 로컬 업무를 만들지 않는다. Caller-supplied `work_id` 값은 schema
validation을 거치지만 모두 자동 생성형 `LW-*`를 쓸 의무는 없다. 여기서
`<project>`는 `project_code`다. Replay는
immutable 업무 사건에서 `current.json`도 다시 만들므로, snapshot replacement가
중단돼도 로컬 업무가 영구 stale 상태로 남지 않는다.
The CLI does not automatically collect the whole conversation. All text fields
are structurally bounded, but callers remain responsible for submitting short
operational summaries and references rather than chat transcripts or source
contents.

Windows project-leader tasks should pass a PowerShell object through the
tracked wrapper so JSON quoting and UTF-8 text survive native argument parsing:

```powershell
$payload = @{
  work_id = $null
  leader_thread_ref = "<opaque-ref>"
  executor_thread_ref = "<opaque-ref>"
  title = "bounded title"
  request_summary = "bounded summary"
  source_refs = @()
} | ConvertTo-Json -Compress

& <runtime-root>\guild_hall\local_activity\ops\invoke-codex-work-context.ps1 `
  -Operation begin_work `
  -Project P26-014 `
  -PayloadJson $payload `
  -RuntimeRoot <runtime-root> `
  -BindingPath <private-binding> `
  -BindingSha256 sha256:<digest> `
  -EventId <stable-event-id> `
  -OccurredAt <optional-known-source-time>
```

For read-only `status`, the wrapper may omit `-PayloadJson`; it defaults to an
empty object and the CLI supplies `work_id=null`.

## Verification

```powershell
node --check guild_hall/local_activity/local_activity.mjs
node --check guild_hall/local_activity/cli.mjs
node --check guild_hall/local_activity/codex_work_context.mjs
node --check guild_hall/local_activity/codex_work_context_cli.mjs
node --test guild_hall/local_activity/local_activity.test.mjs guild_hall/local_activity/codex_work_context.test.mjs
```
