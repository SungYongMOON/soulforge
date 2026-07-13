# 10. 고성능 PC Plan-mode runbook

| 항목 | 내용 |
| --- | --- |
| owner | high-performance-PC cold-start planning session |
| authority | bootstrap/read order/required outputs/approval stops |
| VERIFY_HP | exact node profile, bindings, primary, actual ledgers must be verified there |
| TARGET | read-only inventory and approved ENGINE-13 implementation plan |
| non-goals | prompt만으로 private access, migration, writer/network activation 허용 |
| stop | dirty/divergent repo, unknown profile/role, secret/raw need, competing writer |

## 첫 메시지: exact bootstrap prompt

```text
Plan mode only. Soulforge 할일 엔진 ENGINE-13을 과거 대화 없이 준비한다.

1) 먼저 $soulforge-github-down 을 사용해 public-only 안전 기본값으로 Soulforge를
동기화·진단하라. role/profile/operational-primary를 폴더 존재나 hostname으로 추정하지 말라.
dirty/divergent/detached/conflict가 있으면 pull하지 말고 중단 보고하라.
2) secret 파일 내용, 실제 project raw/body/transcript/chunk를 읽지 말라. private surface는
명시된 owner-with-state profile과 이번 단계의 승인 없이는 열지 말라.
3) root AGENTS.md와 실행 계약, roadmap, PROJECT_TASK_ENGINE_LIFECYCLE_V0.md,
task_engine_redesign/README.md의 정확한 reading order를 따른 뒤 ENGINE-13을 읽어라.
4) 이번 turn은 read-only inventory/crosswalk/dry-run 계획까지만 한다. runtime code,
writer/scanner/scheduler, RAG migration apply, Tailscale/Telegram mutation은 하지 말라.
5) CURRENT/TARGET/VERIFY_HP를 구분하고, 실제로 확인한 command와 exit만 보고하라.
6) required outputs를 작성한 뒤 approval stops에서 멈춰 owner 선택을 요청하라.
Claim ceiling은 canon_candidate를 넘지 말라.
```

## `soulforge-github-down` 다음 첫 확인

skill이 public status/remotes/safe sync, tracked skill sync, explicit-profile capability doctor와
role report를 소유한다. secret, private binding, junction repair, install, writer activation은
일반 준비 요청으로 수행하지 않는다. skill 완료 뒤에만 public `git status`, HEAD, lock,
allowed-file overlap과 아래 read order를 확인한다.

## read order

1. `AGENTS.md`
2. `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`
3. `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`
4. `docs/architecture/workspace/PROJECT_TASK_ENGINE_LIFECYCLE_V0.md`
5. `ui-workspace/apps/dev-erp/docs/task_engine_redesign/README.md`와 01~09
6. `ui-workspace/apps/dev-erp/docs/slices/ENGINE-13-TASK-DRIVER-CLOSED-LOOP.md`
7. ENGINE-13이 직접 링크한 current contracts/runtime surfaces만

## required planning outputs

- observed role/profile/capabilities and blocked capabilities
- exact node-role/reconciler/approved-root unknowns
- task ledger/`core_item`/event/status/auto-open read-only crosswalk
- source revision and project/common RAG path inventory schema (payload 없는 counts/opaque refs)
- TaskDriver physical storage options and recommended minimal delta
- legacy RAG dry-run map shape + collision/consumer/rollback checks
- one-project vertical pilot packet with validators and stop conditions
- activation gate matrix for writer/scanner/scheduler/Tailscale/Telegram
- commands actually run with exit status; unrun validators explicitly marked

## 첫 read-only code inspection matrix

아래는 tracked public code만 읽는다. 각 명령은 exit `0`과 해당 symbol/line을 기대하며 `1`이면
문서의 CURRENT가 stale한 것이므로 구현 계획을 쓰지 말고 crosswalk를 먼저 수정한다.

| 목적 | 명령 | 기대/기록 |
| --- | --- | --- |
| current task/event schema | `rg -n 'CREATE TABLE IF NOT EXISTS (core_item|event_log)' ui-workspace/apps/dev-erp/src/store.mjs` | 두 table anchor와 line |
| status allowlist | `rg -n 'static ITEM_STATUSES' ui-workspace/apps/dev-erp/src/store.mjs` | exact enum; 문서 표와 diff |
| event/status writer | `rg -n 'appendEvent\(|setItemStatus\(' ui-workspace/apps/dev-erp/src/store.mjs` | application append와 current-row mutation surface |
| auto-open gates | `rg -n -- '--auto-open|autoOpen|auto_open' ui-workspace/apps/dev-erp/src ui-workspace/apps/dev-erp/tools` | 모든 caller/policy path; raw output 금지 |
| task ledger drift | `rg -n 'SCHEMA|HEADERS|TASK_REL' ui-workspace/apps/dev-erp/tools/task_ledger.mjs ui-workspace/apps/dev-erp/src/autosync.mjs` | schema/header/owner crosswalk |
| RAG default roots/assets | `rg -n '_workspaces/knowledge/rag|traceability_sidecars|answer_runs|source_text_quality_reviews|source_text_work_cards|work_cards' guild_hall/rag docs/architecture/guild_hall ui-workspace/apps/dev-erp/src ui-workspace/apps/dev-erp/tools` | project-bound asset/consumer migration list |
| package docs | `npm run ui:docs:check` | exit `0`; 실제 실행 여부 기록 |

실제 DB/ledger inventory는 public code inspection과 분리한다. 승인된 private profile에서만
schema/row count/opaque ID/status count를 읽고 body/title/path/value는 출력하지 않는다.

## approval stops

다음은 plan에서 멈추고 별도 authority를 받는다.

- `owner-with-state`/private repo access or actual project payload read
- pilot project/source roots, raw/hash/path display ACL 선택
- schema/data migration `--apply`, legacy deletion, junction/NAS/Drive mutation
- sole reconciler designation or live writer/scanner/scheduler enablement
- Tailscale ACL/peer mutation, Telegram secret/destination/send
- software install, credential entry, external upload/API use

## closeout/handoff

plan 결과는 public-safe stable design만 public docs에, actual inventory/evidence는 correct private
metadata owner에 둔다. PC/controller 전환 또는 unresolved forward-state가 남으면 compact
`NIGHT_WORK_HANDOFF`를 갱신한다. final에는 goal/current/refs/decisions/rejected paths/validation/
blockers/next exact action/unknowns를 남기고, bounded task closeout의 review·knowledge trigger·
five-field capture·conversation rule hardening을 따른다.

## refs

- [`README.md`](README.md)
- [`08_MIGRATION_AND_IMPLEMENTATION_PLAN.md`](08_MIGRATION_AND_IMPLEMENTATION_PLAN.md)
- [`ENGINE-13`](../slices/ENGINE-13-TASK-DRIVER-CLOSED-LOOP.md)
