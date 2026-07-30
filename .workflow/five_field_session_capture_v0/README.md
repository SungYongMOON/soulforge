# five_field_session_capture_v0

어떤 AI 세션(Codex CLI, Claude Code, 기타)이든 **bounded 작업이 끝날 때 자동화 자산
5필드 — 입력/판단/출력/검증/중단조건 — 와 집계키(request_kind)를 `_workmeta` 레저에
남기는** 세션 종료 캡처 워크플로우다. owner 의 request-to-automation ladder(2026-07-04)
계단 1단("이 5개가 안 남으면 자동화로 자라지 않는다")의 개발 세션 레인 구현이다.

## 현재 상태

- location: `.workflow/five_field_session_capture_v0/`
- package status: `draft` (index.yaml 미등록 — workflow-check 통과 후 owner 결정)
- CLI smoke check: append/duplicate-skip/check-hit(0)/check-miss(2)/slug-guard 통과 (2026-07-04)
- **AI 작업 결과 누락 복구**: `five_field_cursor_sweep.mjs` 공개·합성 planner가
  `{repo, ref, source_lane}`별 `last_successful_source_commit` 뒤부터 승인된 target까지
  커밋을 오래된 순서로 계획한다. 기능은 **OFF**이며 private cursor·ledger·Git을 직접
  쓰지 않는다(2026-07-30).
- blocking hook status: **disabled** (2026-07-14 owner 요청). 운영 장애와 자동화 효용 재검토를 위해 Codex/Claude Code의 PostToolUse 마킹과 Stop 차단 배선을 함께 중지했다.
- historical Codex hook smoke check: commit sentinel/no-record block, record-after pass, no-commit no-op 통과 (2026-07-05, 현재 비활성)

## 두 레인 분담 (이중 기록 금지)

| 레인 | 캡처 주체 | 착지면 |
|---|---|---|
| ERP 업무 (완료버튼/Codex 과제 스레드) | dev-erp 완료 훅 (FIVE-FIELD-CAPTURE 슬라이스) | `completion_log` (runtime DB) |
| 개발/일반 세션 (평소 Codex·Claude 대화) | **이 워크플로우** — 세션의 AI 가 종료 시 CLI 실행 | `_workmeta/<project>/reports/procedure_capture/five_field_log.jsonl` |

같은 스키마 계열(`soulforge.five_field_capture.v0`)이라 승격 감지기(request_kind 반복
집계 — 2회=packet 후보, 3회=helper 후보)가 두 레인을 함께 읽는다.

## 사용법 (세션 종료 시 1회)

```
node .workflow/five_field_session_capture_v0/tools/five_field_capture.mjs \
  --project P26-014 --session-ref codex_20260704_p26014a --worker codex_gpt-5.3 \
  --request-kind review/mail \
  --json '{"input_refs":["mail:P26-014:abc123","_workmeta/P26-014/..."],
           "judgment":"어떤 기준으로 분류/결정했나",
           "output":"무엇을 만들었나(경로/커밋 ref)",
           "verification":"성공/실패를 어떻게 확인했나(테스트 N건 등)",
           "stop_conditions":["다음부터 자동으로 하면 안 되는 경우"]}'
```

- `--json -` 로 stdin 입력 가능. 재실행 멱등(동일 내용 → duplicate skip).
- 신규 행은 source 발생시각 `occurred_at`과 첫 레저 기록시각 `recorded_at`을 분리한다.
  기존 `at`은 `recorded_at`과 같은 호환 alias로 유지한다. legacy 행은 기존 모양과
  digest를 바꾸지 않고 읽는다.
- 전체 persisted record를 canonical JSON으로 직렬화한 SHA-256은 receipt에만 남긴다.
  같은 `id`·같은 digest는 no-op, 같은 `id`·다른 digest는 HOLD한다.
- worktree 세션은 `_workmeta` 가 안 보이므로 `--repo-root C:/Soulforge` 또는 `SOULFORGE_ROOT` 지정.
- 원문 복사 금지: input_refs 는 포인터만(항목 300자·12개 제한), 전체 12KB 초과 시 거부.

## 차단형 하네스 훅 상태

2026-07-14부터 `five_field_session_capture_v0` 전용 차단형 훅은 모든 하네스에서
**비활성**이다. Codex와 Claude Code 모두 `PostToolUse` 마킹 훅과 `Stop` 차단 훅을
한 쌍으로 제거해야 하며, 어느 한쪽만 남기지 않는다.

- 프로젝트 `.codex/config.toml`에는 5필드 `PostToolUse`/`Stop` 등록을 두지 않는다.
- Claude Code의 프로젝트·사용자 `settings.json`/`hooks.json`에도 5필드 마킹·차단 등록을 두지 않는다.
- `tools/codex_hook_guard.mjs`와 `tools/claude_stop_guard.mjs`는 후속 검토를 위해 삭제하지 않고 비활성 상태로 보존한다.
- 기존 `_workmeta/**/five_field_log.jsonl`, `five_field_capture.mjs` CLI, dev-ERP `completion_log` 캡처는 보존한다.
- 재활성화하려면 현행 Codex/Claude Code 훅 스키마와 설정 로드를 다시 검증하고, 운영 장애·자동화 가치 재평가 후 owner 결정을 받아야 한다.

CLI의 비차단 확인 표면은 보존한다:

```
node .workflow/five_field_session_capture_v0/tools/five_field_capture.mjs --check --session-ref <ref>
# exit 0 = 기록 있음, exit 2 = 누락
```

- **Cursor sweep candidate**: 추적 automation 사본은 feature-OFF/PAUSED 설계 표면이다.
  최근 24시간 창과 foreground `pull`에 의존하지 않는다. 정확한 공개 source tuple과
  승인된 cursor/target을 입력받아 `(cursor, target]`을 oldest→newest로 계획한다.
  `Soulforge-Automation-Output: ai-work-result-recovery/v1`과 해당 tuple digest의
  `Soulforge-Source-Lane` trailer가 모두 맞는 커밋만 self-loop로 제외한다.
- cursor는 모든 레코드 검증, 결과 commit, push, remote 포함 확인과 source target 불변
  증거가 모두 성공한 경계에서만 target으로 전진한다. 어느 하나라도 실패하면 cursor는
  그대로다. 이 public candidate는 해당 작업을 실행하거나 private cursor를 만들지 않는다.
- planner는 source의 공개성을 스스로 판정하지 않는다. owner-approved caller가 logical
  tuple과 exact runtime `repo_path`를 같은 allowlist row로 제공해야 하며 receipt의
  public 표시는 이 caller attestation 범위를 넘지 않는다.

## 다른 PC 설정 (멀티 PC 수집)

수집 버스는 **git** 이다: 레저(five_field_log.jsonl)는 `_workmeta`(private repo)에 쌓이고,
각 PC 의 기록이 commit+push 로 origin 에 모인다. PC 별 체크리스트:

| 단계 | 무엇 | 어느 PC | 방법 |
|---|---|---|---|
| 1 | Codex 5필드 훅 비활성 확인 | Codex 로 Soulforge 작업하는 전 PC | repo 최신화(`github-down`/git pull) 후 `.codex/config.toml`에 5필드 `PostToolUse`/`Stop` 등록이 없는지 확인한다. 사용자 `~/.codex/config.toml`과 `hooks.json`의 중복 등록도 제거하고 Codex 앱 재시작 또는 새 thread에서 Hooks 화면에 두 훅이 없는지 확인한다. |
| 2 | `_workmeta` push 규율 | 전 PC | 각 PC 의 `_workmeta` 클론이 origin push 가능해야 레저가 모임(작업 후 commit+push — AGENTS 기존 규칙 그대로) |
| 3 | Claude Code 5필드 훅 비활성 확인 | Claude 쓰는 PC 만 | 프로젝트·사용자 `settings.json`/`hooks.json`에서 5필드 `PostToolUse` 마킹과 `Stop` 차단 등록을 함께 제거하고 Claude Code를 재시작한다. |
| 4 | AI 작업 결과 누락 복구 자동화 | 설치하지 않음 | 추적 사본은 PAUSED candidate다. exact private cursor owner/path와 isolated runner가 승인되기 전 설치·활성화·복사 금지 |

## 경계

- 원문(메일/첨부/문서 본문)·secret 값 기록 금지 — CLI 크기/슬러그 가드.
- 레저는 `_workmeta`(private) 전용. public tree 에 5필드 내용 커밋 금지.
- ERP 업무 레인과 이중 기록 금지(위 분담표).
- cursor planner 입력은 public-safe metadata와 caller-supplied synthetic/private-redacted
  ledger rows로 제한한다. foreground/private active tree, scheduler, runtime, hook,
  network를 변경하지 않는다.

## 다음 (owner 결정 대기)

1. AGENTS.md end-of-task 체크리스트 1줄 편입 여부
2. post_development_review_gate_v0 바인딩 여부
3. workflow-check 후 index.yaml 정식 등록

## Phase B isolated cursor runner (public implementation, live HOLD)

The public package now contains
`tools/five_field_cursor_runner.mjs`. This is an injected, fail-closed runner
for a public source lane and a separate isolated private or synthetic writer
clone. It does not discover or mutate a foreground checkout.

The runner requires all of the following from an owner-approved caller:

- an exact public `{repo, ref, source_lane}` tuple, seed, approved target, and
  immutable source snapshot;
- an exact writer binding, non-force remote/ref, cursor logical path, ledger
  logical path, and matching source/writer allowlist rows;
- installed runtime metadata (`tool`, `model`, `installed_models`, and optional
  asserted worker identity). Missing or mismatched metadata returns `HOLD`;
- a strict UTC `recorded_at`. Each generated record retains the source commit
  time as `occurred_at` and uses this creation time as `recorded_at`;
- a cursor compare-and-swap revision computed from the complete cursor record.

Programmatic and CLI entrypoints:

```text
runCursorRunner(input, { faultAt, beforeLedgerPush })
node .workflow/five_field_session_capture_v0/tools/five_field_cursor_runner.mjs --input <json-file|->
```

`faultAt` and `beforeLedgerPush` are test-only and are not accepted by the CLI.
The latter creates a deterministic local-bare writer race in tests. The CLI
prints a redacted receipt and returns `0` for success/already-advanced, `2` for
`HOLD`, and `1` for a malformed CLI request.

The durable order is:

1. validate the immutable public source snapshot, writer binding, cursor CAS,
   ledger identities, and full-record digests;
2. append only missing records, create the ledger-output commit without using
   the writer worktree as a staging surface, push without force, fetch the
   remote ref again, and prove remote containment;
3. re-read the cursor from that remote tip, re-check CAS and the source target,
   create a separate cursor commit, push without force, fetch again, and verify
   both remote containment and the persisted cursor content;
4. leave the cursor unchanged on every failure before step 3. A crash after a
   ledger push is resumed by duplicate comparison. Existing ledger records are
   never deleted or rewritten.

After a cursor push attempt, a failed or unavailable inclusion observation is
not reported as unchanged. The receipt uses `after: null` with
`state: UNKNOWN_AFTER_PUSH` (or `UNKNOWN_AFTER_PUSH_ATTEMPT`) and requires a
fresh remote read on the next run. Only remote containment plus persisted
cursor-content verification produces `VERIFIED_ADVANCED`.

Same identity plus the same canonical full-record digest is a no-op. Same
identity plus a different digest is `HOLD`. Automation-output commits are
excluded only when both exact self-loop trailers match, and every exclusion is
itemized in the receipt. Metadata containing secret or absolute-path sentinels
is rejected before it can enter a public receipt.

Live boundaries remain closed:

- first-live source is public-only; an `_workmeta` source-commit lane remains
  `HOLD`;
- the active `C:\Soulforge`, its nested `_workmeta`, registered Orca
  worktrees, installed automation, scheduler, and live remote are not runner
  discovery surfaces;
- the tracked automation candidate remains `PAUSED`. It is not the installed
  automation and this package does not update or activate it;
- private cursor creation, private commit/push, and automation replacement
  require an immediately preceding human Owner gate plus a fresh independent
  Level 3 verification of the exact diff and live packet.

The public owner-approval boundary candidate is
`02beadfdd06a879a6c810fcc3b317f65f3c540eb`. It is not automatically a proven
`last_successful_source_commit`; real ledger identity/digest comparison or an
explicit Owner ratification is still required. The observed count `313` came
from an intentionally empty synthetic ledger over that public range and is
only a dry-run upper bound, never an actual missing-result count.

## Phase C dual-writer and fencing contract (public candidate, live HOLD)

Phase C replaces the Phase B single-writer topology with two owner-injected,
mutually isolated integration clones:

- `writer-workmeta` owns append-only result-ledger commit, non-force push, and
  remote-containment proof;
- `writer-private-state` owns cursor/authority compare-and-swap commit,
  non-force push, and remote-containment proof;
- the cursor continuity owner is `private-state`, with the exact logical path
  `guild_hall/state/operations/ai_work_result_recovery/v1/cursors/<source_lane_digest>.json`;
- `_workmeta/system/bindings/**` is never a cursor owner path and is rejected.

Ledger publication and its independently recomputed remote inclusion must
finish before cursor CAS begins. Cursor sequence/revision and `writer_epoch`
are monotonic. A stale epoch cannot push either repository. An exclusive local
lease carries an owner token, PID, host identity, acquisition/expiry times, and
the monotonic writer epoch. A live owner always blocks. Stale recovery is
allowed only when the lease is expired, the recorded PID is dead on the same
host, and an explicit Owner policy permits recovery. The runner rechecks the
lease token and epoch immediately before the ledger push, cursor commit, and
cursor push.

The caller must supply canonical realpaths for the immutable source snapshot,
ledger writer, cursor writer, runtime root, and lease/lock root, plus every
active Codex/Orca worktree and other forbidden root. The runner rejects:

- equality, nesting, or mutual overlap among source, both writers, runtime, and
  lease/lock roots;
- equality with or nesting in active `C:\Soulforge`, active `_workmeta`, any
  owner-supplied Codex/Orca worktree, or the installed-automation control root;
- a reparse point, symlink, junction, or realpath escape on any guarded path.

All input objects and ledger records use an exact-key recursive contract.
Unknown keys are rejected at every depth. Keys representing raw/chat/payload,
body/messages/transcript, credentials, tokens, passwords, cookies, or sessions
are forbidden, as are secret-shaped values and absolute/private paths, URLs,
or refs. A `HOLD` receipt never echoes the rejected envelope, private path,
remote URL, or private ref.

Runner and planner receipts are operational evidence only and explicitly carry:

```text
official_completion=false
worksession_acceptance=false
taskdriver_acceptance=false
erp_acceptance=false
mcp_acceptance=false
claim_ceiling=operational_evidence_only
```

Phase C validation is synthetic-only: OS-temporary fixtures and local bare Git
remotes may exercise dual-repository ordering, lease/epoch contention,
fail/resume, duplicate/conflict, non-fast-forward and inclusion failures,
post-push reconciliation, and path/content sentinels. It does not read or write
an actual runtime root, `_workmeta`, `private-state`, installed automation,
scheduler, or network remote.

The one-shot live packet remains `HOLD` until the human Owner supplies and
approves both exact writer bindings, the derived cursor digest/path and initial
record, runtime and lease roots, fencing/recovery policy, writer epoch, immutable
source seed/target, and the complete installed-automation update and rollback
snapshot. A fresh independent Level 3 verdict is required immediately before
any private/live action. The count `313` remains the intentionally empty-ledger
synthetic upper bound and is never an actual missing-result count.

### Installed legacy automation and rollback evidence

The read-only observed installed automation on 2026-07-30 remains unchanged:

```text
id=soulforge-five-field-sweep
kind=cron
name=Soulforge 5-Field Sweep (daily)
status=ACTIVE
schedule=FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;BYHOUR=7;BYMINUTE=35;BYSECOND=0
model=gpt-5.3-codex
reasoning_effort=medium
execution_environment=local
target=project:local-1018ddaeecab99443b06b78022cb14b7
working_directory=C:\Soulforge
created_at=1783212029444
updated_at=1783212029444
```

Its exact legacy prompt performs foreground `pull --ff-only`, nested
`_workmeta pull --rebase`, a recent-24-hour scan, direct capture, and direct
`_workmeta` commit/push. That prompt is preserved verbatim as the rollback
snapshot in `codex/automation.soulforge-five-field-sweep.toml`; it is not
executed by this package.

Activation must atomically retain an owner-approved copy of that complete
installed TOML, replace only the approved fields with the reviewed runner
candidate, and keep the candidate `PAUSED` until the first-live dry-run receipt
is accepted. Rollback restores the saved complete TOML and the pre-run cursor
record; it never deletes or rewrites an already-pushed append-only ledger
commit. An exact isolated runner working directory and private writer binding
are intentionally `UNKNOWN/HOLD` until supplied by the human Owner.
