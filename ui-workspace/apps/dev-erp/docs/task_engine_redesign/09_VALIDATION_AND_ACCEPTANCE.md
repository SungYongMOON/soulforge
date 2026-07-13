# 09. validation과 acceptance

| 항목 | 내용 |
| --- | --- |
| owner | ENGINE-13 validators + independent review |
| authority | deterministic pass/fail matrix, claim ceiling |
| CURRENT | docs/candidate only; production validation 없음 |
| TARGET | synthetic pass 후 one-project real pilot, rollback 증거 |
| non-goals | broad real-data scan, UI demo만으로 승인, production-ready claim |
| stop | secret/raw leak, nondeterminism, missing rollback, owner boundary violation |

## deterministic matrix

| ID | check | synthetic | real pilot gate |
| --- | --- | --- | --- |
| V-01 | TaskDriver schema/intent/driver digest + exact typed refs | required | required |
| V-02 | two-axis state legality and ERP crosswalk gaps | required | required |
| V-03 | LLM output cannot directly apply | required | required |
| V-04 | explicit deterministic policy authority/ref/expiry | required | if enabled |
| V-05 | completion emits follow-up Driver candidate only | required | required |
| V-06 | same cause/digest idempotent; conflict quarantined | required | required |
| V-07 | replay parity for task current state and life tree | required | required |
| V-08 | `valid_at/known_at` point-in-time replay | required | required |
| V-09 | source/file revision exact joins; no fuzzy auto-binding | required | required |
| V-10 | 모든 project RAG asset/consumer target + common-only legacy guard | required | required |
| V-11 | cross-project isolation and path traversal/symlink rejection | required | required |
| V-12 | public에는 raw/body/chunk/private path/secret 없음; `_workmeta`는 metadata pointer·approved binding만 | required | required |
| V-13 | sole reconciler, immutable packet duplicate/conflict | required | required |
| V-14 | state-change/cooldown/weekend/recovery alert clock | required | before alert activation |
| V-15 | projection calls cause zero owner mutations | required | required |
| V-16 | rollback restores reader/state and preserves event history | required | required |

## security/public-private checks

- tracked diff contains only allowed public docs/contracts/tests when implemented.
- examples use synthetic IDs; no real project name, hostname, absolute/UNC path, provider/account ID.
- `.env`, credentials, token/cookie/session files are never opened.
- `_workmeta` contains metadata/pointers/hashes/receipts only; payload stays `_workspaces`.
  지정된 private binding에는 owner-approved 절대경로 pointer가 있을 수 있으나 public 출력이나
  일반 event/report로 복제하지 않는다.
- Telegram output allowlist is generic role/service/state/cause/time only.
- RAG/Wiki/Neo4j/life tree remain non-authoritative read models.

## test order

1. schema/link/lint and synthetic fixture tests
2. deterministic replay twice with byte-identical output
3. adversarial duplicate/conflict/path/clock/authority tests
4. read-only high-PC inventory and dry-run
5. one-project pilot and rollback drill
6. relevant root/dev-ERP validators
7. independent post-development review Level appropriate to actual mutation/claim

## acceptance states

- `accepted_for_pilot`: synthetic matrix pass, real mutation still off
- `pilot_accepted`: one-project pass + rollback; expansion still separate
- `needs_revision`: bounded failures with safe state preserved
- `blocked`: authority/boundary/rollback/source gap prevents safe continuation

## evidence packet minimum

- subject/version/commit and allowed write paths
- fixture or opaque pilot refs; raw payload 제외
- matrix row별 pass/fail/blocked와 command exit
- before/after counts and deterministic digest where applicable
- public/private/secret/path boundary verdict
- rollback command/result or unrun blocker
- independent reviewer verdict and residual risks

validator가 실행되지 않았으면 `not_run`과 이유를 기록한다. 일부 pass를 전체 pass로
올리거나 screenshot을 deterministic evidence로 대체하지 않는다.

실패 fixture와 rejected approach도 재시도를 막을 만큼 bounded metadata로 남긴다.

이 패키지의 현재 최고 주장은 `canon_candidate`다. live activation과 production-ready는
별도의 writer/runtime evidence와 review gate 없이는 금지한다.

## future ML readiness

이 구조가 먼저 준비할 수 있는 모델은 project routing, task/actionability 후보 분류,
retrieval ranking, due/block risk, branch-link 추천, 운영 이상 탐지다. 학습 데이터는 후보와
사람/정책 확정 label을 구분하고 `known_at` 기준으로 train/test를 나눠 미래 정보 누출을 막는다.
raw source·개인 평가·미확정 actor link를 기본 학습 corpus로 쓰지 않으며, 모델 성능이 좋아져도
task apply/source truth/공식 승인 authority를 넘기지 않는다.

## refs

- [`PROJECT_TASK_ENGINE_LIFECYCLE_V0.md`](../../../../../docs/architecture/workspace/PROJECT_TASK_ENGINE_LIFECYCLE_V0.md)
- [`AGENT_EXECUTION_CONTRACT_V0.md`](../../../../../docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md)
- [`08_MIGRATION_AND_IMPLEMENTATION_PLAN.md`](08_MIGRATION_AND_IMPLEMENTATION_PLAN.md)
