# Development Roadmap v0

## Historical slice — SE-core public-synthetic evaluation (2026-08-12)

This section records the superseded evaluation slice. The current active slice is
the 2026-08-14 M2 Project Context and Knowledge View vertical described below.

- The four-source public source pack and closed scorer corpus now pin exact
  revisions, byte lengths, and SHA-256 values without publishing source bodies.
- An independently reviewed page-to-rule crosswalk can be compiled into a
  candidate Engine projection. Evaluator labels and Notebook output remain
  outside the runtime projection.
- The fixed seven-case runner exercises typed Engine, revision, ACL, and binding
  semantics without a learned model, network, provider call, ERP write, or
  default file write. It is not a general natural-language classifier.
- Notebook rounds and Engine attempts remain contestants. Raw artifacts stay in
  `_workspaces/**`; the evaluation ledger stores metadata-only hashes and links.
  A final same-byte end-to-end comparison remains blocked because provider-side
  post-ingest byte parity is not observable and the Engine input is structured.
- Both contestants can now be captured automatically at answer time. The
  source-cited Engine CLI has an all-or-nothing `--capture-*` opt-in, and a
  query-only NotebookLM wrapper records its turn through the same metadata-only
  contract with create-only intent/response evidence and no second query per
  attempt. Historical row-pointer import stays on `HOLD`, and live NotebookLM
  execution still needs owner-supplied runtime identifiers plus a fresh Level-3
  review before any production claim.
- Every capture lane now keeps one fixed-basename Markdown report level with the
  ledger through a single shared writer, so a captured turn is readable without a
  separate manual command. The report stays a reconstructable derived view with
  no authority, refuses to overwrite anything it cannot prove from that file's
  own bytes that it generated, and reports a refused refresh honestly instead of
  unwinding a recorded turn. Refused files are repaired by hand, not migrated
  automatically. This
  automation side-effect change needs a fresh Level-3 B/V accept before any
  production or main-integration claim.
- An evaluation-only source-bound answer lane now exists in public code beside
  that fixed runner: it answers an arbitrary natural-language question over one
  exact four-source public corpus, binds every rendered block to retrieved
  evidence, and holds rather than answers when nothing matches. As of 2026-08-13
  it is an implementation candidate that is tested, not an executed benchmark —
  the private 7-question × 3-run actual execution has not produced a usable
  result at this point, so no result, score, or comparison exists for it yet.
  The first attempt at that execution failed as a process failure before any cell
  answered, on a provider request that inherited the daemon's reasoning channel
  and context window; that record stays failed and is neither retried nor
  overwritten. The runner's generation request is now pinned and verified end to
  end on the public synthetic corpus, so a benchmark execution is possible again,
  but it would be a new separately versioned run and remains an operator
  decision, not a step this correction performs. A follow-up correction then
  required a reply to state both of its completion claims before it is answered
  and moved the command execution receipt to schema
  `soulforge.se_core_sourcebound_answer_command_receipt.v1`; that contract is
  covered by synthetic replies only, so one end-to-end run against the local
  daemon is a precondition for the next benchmark attempt, not a formality. A
  further diagnostic-only change then named *which* output-safety check refuses a
  run, as one token from a closed payload-free vocabulary, and moved the lane
  receipt to `soulforge.se_core_sourcebound_answer_receipt.v1` and the command
  execution receipt to
  `soulforge.se_core_sourcebound_answer_command_receipt.v2`. It changed no
  output-safety acceptance behaviour and is covered by synthetic probes only, so
  it makes an eventual hold readable and does not by itself move the benchmark
  attempt any closer to a result.
- A structural correction on 2026-08-13 removed model-authored answer prose from
  this lane. A candidate token/proposition authority parser was explicitly stopped
  after independent public-synthetic attacks kept finding the same class of scope
  error: a negative or condition attached to one clause could suppress a positive
  action in another, or a condition about another draft could be inherited by the
  current answer. No further phrase exceptions are allowed on this slice.
- The replacement model response is one closed statement-selection contract. The
  model sees exact host chunks as `{ statement_id, excerpt }` and returns only
  `answer|abstain` plus up to eight statement-id/relation pairs. The host renders
  fixed Korean labels, the exact selected public-source excerpt, and one
  machine-bound citation per selection. A model-authored heading, answer sentence,
  quotation, citation, authority state, project-use direction, Task, or winner is
  not representable. Selection relevance and semantic entailment remain unknown
  until independent review.
- That moves the answer-lane policy to
  `soulforge.se_core_sourcebound_answer_lane.v2`, the loopback adapter to
  `soulforge.se_core_sourcebound_answer_ollama_adapter.v3`, the final answer to
  `soulforge.se_core_sourcebound_answer.v1`, and the lane receipt to
  `soulforge.se_core_sourcebound_answer_receipt.v2`. The command receipt stays v2
  because its closed field set is unchanged. This slice is covered by public
  synthetic tests only and executes no benchmark while the public gate is open.
- Any question set this lane has already been run against, the earlier homefield
  set included, is seen material from here on. It may be re-run only as post-hoc
  diagnostic regression. No score, ranking, winner, NotebookLM comparison, parity,
  or production-readiness claim may rest on it; that requires a fresh unseen
  frozen set pinned before the run, with its own cohort pin and receipts. No such
  set is claimed to exist or to have been executed.
- The public-synthetic loopback compatibility gate is now closed as `HOLD`, not
  `PASS`: one no-expansion `qwen3.5:9b` call reached model output and the lane
  refused its object as `SE_CORE_SOURCEBOUND_ANSWER_MODEL_OUTPUT_INVALID`. It
  rendered no answer and exposed no provider payload. The no-retry/no-tuning stop
  condition therefore seals this v4 attempt; private 7x3 execution is not allowed.
  Any future compatibility change must be a separately scoped successor, not an
  in-place retry or a reinterpretation of this result.
- The fixed seven-case structured Engine runner stays distinct and historical.
  It is model-free, the two lanes are not comparable, and its recorded outputs
  are not reused as the new lane's results.
- Provider-effective post-ingest byte parity — and therefore any formal
  Engine-versus-Notebook comparison, numeric score, or winner — remains `HOLD`
  for the same unchanged reason: that parity is not observable on the provider
  side. The new lane does not address that blocker and does not claim to.

## 목적

- 이 문서는 Soulforge의 큰 개발 방향과 현재 우선순위를 한곳에 모으는 단일 정본이다.
- 앞으로 "무엇을 먼저 개발할까" 를 판단할 때는 이 문서를 먼저 읽는다.
- 구체화된 작업만 각 owner 문서, mission, workflow, UI plan, private worklog 로 내려보낸다.

## 운영 규칙

- 큰 방향, phase, active slice, 우선순위 변경은 이 문서에서 먼저 바꾼다.
- `PROJECT_MAP_V0.md` 는 탐색 지도이며, 개발 우선순위 정본을 중복 소유하지 않는다.
- `VISION_AND_GOALS.md` 는 북극성 문서이며, backlog 로 쓰지 않는다.
- `Agent_Fantasy_Vision_Phases_WorldBible.md` 는 제품 감각과 세계관 phase 를 설명하되, active development queue 는 이 문서가 소유한다.
- `.mission/**` 은 실행 계획과 readiness 를 소유한다. 큰 방향이 실제 실행 단위로 잘렸을 때만 mission 으로 내려간다.
- `ui-workspace/docs/**` 는 UI 구현 세부 계획을 소유한다. UI 전체 우선순위는 이 문서에서 먼저 정한다.
- current legacy `_workmeta/**` 는 project-local evidence, worklog, promotion candidate 를 소유한다. 큰 제품 방향을 `_workmeta` 에만 남기지 않는다.
- 이 문서의 아래 legacy `_workmeta/**` 경로는 모두 current reference-in-place route다. W-AUTH, Genesis, applicable Freeze, named sole writer가 adopted 되기 전에는 future target `_workmeta`에 run/worklog/report/queue/knowledge-access history를 새로 쓰지 않는다. designated Event Timeline/Analytics/AI Workforce writer가 accepted 되기 전까지 legacy source가 해당 noncanonical history의 authority다.

## 개발 예정 저장 규칙

개발하기로 한 내용이 흩어지지 않게 아래 순서로 저장한다.

1. 아직 owner, 입력, 출력, 검증이 불명확하면 새 파일을 만들지 않고 이 문서의 `다음 후보` 또는 `현재 보류` 수준으로만 남긴다.
2. public-safe 이고 Soulforge 전체 우선순위에 영향을 주면 이 문서에 한 줄 후보로만 남긴다.
3. 특정 owner 로 내려갈 만큼 구체적이면 아래 `구체화 규칙` 표의 저장 위치로 보낸다.
4. project-local 이거나 raw/private 근거가 섞이면 current legacy `_workmeta/<project_code>/reports/procedure_capture/` 또는 해당 project 의 legacy queue 로 보낸다.
5. agent 가 발견했지만 아직 owner-approved 가 아닌 구현 작업도 별도 후보 장부에 흩어두지 않고 current legacy `_workmeta/<project_code>/dev_worker_queue/*.yaml` 에 `status: proposed` 로 둔다.
6. project 가 불명확하지만 Soulforge system/reusable 후보가 분명하면 current legacy `_workmeta/system/dev_worker_queue/*.yaml` 에 `status: proposed` 로 둔다.
7. 바로 실행 가능한 public-safe 개발 작업은 `.mission/<mission_id>/dev_worker_request.yaml` 처럼 명시 task packet 으로 만들 수 있고, private/system 작업은 same current legacy `dev_worker_queue` packet 을 `status: approved` 또는 `status: queued` 로 올린다.
8. 기존 `dev_worker_candidate_queue` 는 legacy migration input 으로만 취급한다. 새 개발 항목은 넣지 않고, 기존 항목은 내용 보존과 reader 호환성을 확인한 뒤 `dev_worker_queue` 로 이관한다.

### 아이디어 캡처 계단

앞으로 토큰이나 대기 시간이 남을 때 개발할 수 있는 아이디어는 아래 계단으로만 적재한다.

| 상태 | 판단 기준 | 저장 위치 | 금지 |
| --- | --- | --- | --- |
| 말로 던진 아이디어 | owner, 입력, 출력, 검증 중 하나라도 불명확함 | 이 문서의 `다음 후보` 또는 `현재 보류` 한 줄 | 별도 `TODO`, 임의 `*_plan.md`, README backlog |
| system/reusable 후보 | Soulforge 공통 개발 후보지만 아직 승인/실행 조건이 덜 닫힘 | current legacy `_workmeta/system/dev_worker_queue/*.yaml` with `status: proposed` | 별도 후보 장부 생성, public canon 승격 주장, target `_workmeta` write |
| project-local 후보 | 특정 project 의 private 근거, 업무 맥락, raw/source 포인터가 필요함 | current legacy `_workmeta/<project_code>/dev_worker_queue/*.yaml` with `status: proposed` | public repo 기록, raw payload 복사, 후보/실행 장부 분산, target `_workmeta` write |
| 실행 준비 완료 | owner, 입력, 출력, 경계, 완료 기준, validator 가 닫힘 | public-safe 는 `.mission/<mission_id>/dev_worker_request.yaml`, private/system 은 같은 `dev_worker_queue` packet 을 `status: approved` 또는 `status: queued` 로 승격 | owner 선택이 필요한 항목을 실행 상태로 밀어 넣기 |
| 지식/RAG 후보 | 개발할 코드보다 source 사용, 반복 질문, 지식 접근, RAG metadata 정리가 핵심임 | current legacy `_workmeta/<project_code>/reports/procedure_capture/**`, `_workmeta/<project_code>/reports/knowledge_access/**`, 또는 system/reusable 은 current legacy `_workmeta/system/**` | source text/chunk/body 를 public repo 또는 `_workmeta` 에 저장, target `_workmeta` write |

닫힌 항목(`completed`/`promoted`/`rejected`/`dropped`/`cancelled`)은 큐 가시성을 위해 `dev_worker_queue/archive/<year>/` 로 이동만 한다(내용 불변, `archive/ARCHIVE_INDEX.md` 에 이동 기록). 기존 `dev_worker_candidate_queue/archive/**` 는 legacy archive 로 보존하되 새 이동 대상이 아니다.

실행 준비 완료로 올릴 때 최소 필드는 `task_id`, `status`, `project_code`, `summary`, `allowed_write_paths`, `acceptance_checks`, `stop_conditions`, `origin.evidence_refs` 다.
`owner_approval.required: true` 이고 `approved: false` 인 후보는 사용자의 새 명시 승인이나 같은 파일의 start condition 충족 증거가 없으면 실행 큐로 승격하지 않는다.
대신 작은 public-safe 선행 작업, 규칙 정리, validator 보강, synthetic fixture 작성처럼 승인 대상을 침범하지 않는 하위 slice 만 수행한다.

금지:

- top-level 임시 TODO, 임의 `*_plan.md`, owner 없는 scratch 파일을 만들지 않는다.
- README, CHANGELOG, architecture 문서에 같은 backlog 를 중복 복제하지 않는다.
- chat transcript, raw mail, secret, `_workspaces` 실자료를 개발 예정 기록으로 저장하지 않는다.
- 저장 위치가 애매하면 private 쪽으로 해석하되, 임의 project code 를 고르지 않고 `ASSUMPTIONS` 로 모호성을 보고한다.
- `VISION_AND_GOALS.md` 와 `Agent_Fantasy_Vision_Phases_WorldBible.md` 는 방향/제품 감각 문서로만 쓰고, 활성 backlog 나 실행 큐를 소유하지 않는다.

## 현재 큰 방향

Soulforge는 현실 업무를 게임식 운영 루프로 바꾸는 시스템이다. 이 운영 루프가 장기 북극성이고, 2026-08-14 owner 결정 기준 현재 active build는 프로젝트 상태를 읽어 다음 engineering mission을 제안하는 read-only AX·SE 판단 Engine이다. dev-ERP는 폐기하지 않고 장기 통합 자산·운영 표면으로 유지하되 전면 개편은 후속 phase로 둔다.

현재 큰 방향은 아래 하나다.

```text
read-only snapshot
  -> Dungeon Map
  -> Mission Board
  -> manual monster
  -> mission draft
  -> battle log
  -> promotion candidate
```

## 현재 phase

- active slice(2026-08-14): **read-only AX·SE project assessment Engine** — owner 1순위.
  exact project goal/context/evidence/artifact-state snapshot을 받아 current SE stage,
  missing/unknown/conflict/risk, 다음 1~3개 mission candidate, 정확히 한 logical role
  candidate 또는 `HOLD`, done/HOLD 조건을 반환한다.
  같은 slice에 exact context packet 하나를 이 input으로 봉인하는 deterministic sealing
  builder(`buildAxSeAssessmentInput`)를 포함한다. builder는 source를 직접 읽거나
  sanitize하지 않고, caller-asserted snapshot hash, cross-project packet, policy
  불일치를 거부한다.
- active boundary: public pure function과 public-safe synthetic vertical만 구현한다. project
  write, TaskDriver activation, ERP write, 자동 assignment, stage clear, actual project
  적용은 모두 `false`다. Context Graph·deterministic RAG·thin Wiki는 exact revision-bound
  context를 찾고 제시하는 support layer이며 Engine 전제나 판단 authority가 아니다.
  learned model은 나중의 optional advisory rendering에만 둘 수 있다.
- completion gate: (1) 동일 exact input에 대한 deterministic output, (2) public-safe
  synthetic vertical의 stage/gap/risk/role-or-HOLD/done-HOLD 경로, (3) fail-closed
  UNKNOWN·conflict·authority 회귀시험, (4) 관련 validator, (5) 독립 review가 모두
  통과해야 한다. 그 전에는 actual project-ready 또는 accepted로 부르지 않는다.
- accepted public slice(2026-08-14): 위 assessment v0와 zero-write runner는 focused
  51/51, 기존 SE-core 348 pass/6 environment skip, Watchtower 44/44, changed path-policy
  0 violations와 fresh Claude Opus B/V 검토를 통과했다. 이는 public deterministic
  candidate acceptance이며 actual-project, live-current 또는 assignment acceptance가 아니다.
- adjacent Team Member Engineering Program build(2026-08-30): Owner-활성화된
  PERSISTENT_FINISH_LOOP가 프로그램 plan suite(00–16) 기준으로 합성/격리 leaf
  22건을 main에 착지시켰다 — MCP 계약+기본 OFF read facade, Vault 상태기계+
  bundle/redaction/external gate(criterion-1 합성 완결), Forge core+brief draft,
  Watch/Bastion 계약, capacity-1 Tool Workshop core, Deployment pack 계약+builder+
  tracked spec 2종(tool_workshop 4파일·hpp_server 267파일: 실 unit gate·격리
  install 검증·선언 78/89 smoke+제외장부 11), 4192 Board 기본 OFF watch strip과
  실공급자 3/9, cross-module dogfood 통합 증명, dev-ERP 신원 바이너리 System32
  고정. 전 leaf가 fresh 비작성 검토를 거쳤고 maturity(합성/package-install/
  actual-provider/physical-pilot) 분리 원장은
  `docs/architecture/foundation/team_member_engineering_program/14_ROADMAP_GATES_AND_DAG.md`의
  Executed-leaf ledger가 소유한다. 이 build는 위 AX·SE active slice의 우선순위를
  바꾸지 않으며 actual provider·물리 pilot·ring 승격은 전부 기존 Owner gate 뒤다.
- adjacent physical-organization rebaseline(2026-08-30): Owner는 Linear나 Agent 한
  기능이 아니라 Soulforge 전체 source/runtime/data/control/project-work/tool/recovery
  구조를 먼저 고정하라고 명시했다. 다음 adjacent priority는 기존 payload를 옮기는
  big-bang migration이 아니라 root class·Path Registry·source/asset catalog view·
  unregistered-write guard·4192 Storage & Backup Map으로 이루어진 organization spine다.
  상세 범위, original-vision coverage, R0~R7 순서는
  `team_member_engineering_program/17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md`가
  소유한다. 실제 이동·새 writer·credential·restore 적용은 계속 기존 Owner gate 뒤다.
- adjacent staged physical migration authorization and Fable5/Opus execution correction(2026-09-01): Owner는 현재 비어 있는
  `<TARGET_SOULFORGE_ROOT>` 목표 root 생성과 전체 estate의 단계 전환을 승인했고, cutover 시
  Buzz·Hermes·4192·BuzzServer 정지를 허용했으며 PC 재부팅은 금지했다. 이는 R2~R7을
  순차 실행하라는 방향 승인이지 big-bang move/delete 승인이 아니다. copy-only staging·
  digest·restore·rollback·compatibility Gate를 사용하며, 기존
  `<LEGACY_SOULFORGE_ROOT>`와 사용자 소유 dirty state는 새 경로 수락 전까지 보존한다.
  Exact executor/writer/reviewer/Human-gate boundaries, N0 placeholder reconciliation,
  no-reboot, 4192-resume, and NAS-retirement rules are owned solely by Plan 17's
  task-local Sol/high authority annex and N0–N11 DAG; this Roadmap adds no role
  authority. Only N0/N1 read-only preparation may start, and N2+ remains HOLD
  under that owner packet.
- adjacent greenfield workspace canonical-store/W-AUTH correction(2026-09-01): Plan 17 plus the workspace contracts distinguish potentially mutable reference-in-place legacy `_workspaces`/`_workmeta` from empty target canonical stores. Only Human/project-authority accepted exact bytes may enter target `_workspaces`; target `_workmeta` holds only their byte-lineage. W-AUTH separates input source revision/digest from candidate revision/content digest; Genesis requires authoritative backup classification/synthetic restore; scoped Legacy Freeze governs legacy origins; N8.5-WS-PUBLISH alone performs named-sole-writer atomic publication after distinct pre-publish readiness and post-publish closure. NW leaves cannot bind/write either workspace target store. Current legacy sources remain authoritative for noncanonical history until an accepted Event Timeline, Analytics, or AI Workforce writer exists. Contract only: writer, binding, file migration, and physical target state remain unchanged.
- adjacent N2 private-binding application(2026-09-01): Path Registry models nine target siblings and an atomic all-nine binding set. One exact private control generation passed the pinned writer-exclusive ACL admission, registered all nine bindings, and replayed as `NO_OP`; target `_workspaces` and `_workmeta` remain empty. This opens address resolution only. It does not grant the shared canonical publisher, project acceptance, project-byte migration, NAS backup, or legacy retirement authority.
- adjacent runtime cutover correction(2026-09-01): Source checkout, versioned Server Pack and Slack source-lane bytes are materialized under the D target with no reboot. HPP `0.1.4` initially passed build/install/smoke but a later full-manifest readback found 765 of 1,020 payload files missing, so it was quarantined and the Main Node rolled back to the full-readback-clean `0.1.2` generation. ERP is healthy and digest-bound on `0.1.2`; Ingress restart remains HOLD until its pre-cutover lease expires. Cause of the post-smoke payload loss is `UNKNOWN`, so no release or production claim follows.
- adjacent Backup Controller topology-v2 preflight(2026-09-01): the legacy v1 containment contract cannot represent the separated D installed runtime, external ERP data owner, C transition metadata sources, and empty D canonical targets. A new pure/default-OFF v2 schema and preflight binds those resources plus rollback by exact owner/epoch/digest and separate ERP root/file evidence. It authorizes no private binding or NAS run; actual v2 adapter, installed Pack, private evidence, backup generation, restore and Human acceptance remain HOLD.
- adjacent internal-release candidate(2026-08-31): Owner Master Map M16의
  Development Team 1 internal RC는 이번 주 time-boxed 목표 후보다. 현 active slice를
  대체하지 않는다. Fresh Grill decision gate는 exact one-seat와 포함/제외 capability를
  닫았지만, Lane F의 support/rollback evidence와 Plan 12 physical ring gate는 아직
  통과하지 않았다. Team rollout,
  production readiness, live connector write와 NAS recovery-ready 주장은 계속 HOLD다.
- adjacent Internal RC contract build(2026-09-01): OD-11 pure taxonomy는 기존 A0~A6와
  별도 R0~R4·EV1~EV3를 결속하고 R3/R4 grant를 거부한다(34 tests, writer/runtime 0).
  세 no-move product manifests는 enrolled 31 Module을 8 Product-owned/23 Shared로
  분류한다(4 tests+preflight, release/root migration 0). Manual resolver의 첫 contract-only
  측정은 actual artifact 0·전 row `HOLD`였다(11 tests); 이 과거 상태는 바로 아래
  manual/preflight leaf의 16 candidate·12-test 상태로 대체됐다. Synthetic recovery
  canary는 temp-only backup/readback/isolated restore와 별도 Human acceptance seam을
  검증한다(17 tests, actual acceptance/NAS/RPO/RTO 0). Current tracked Pack specs는 HPP 1,020,
  Universal Client 19, Backup-Recovery 76 files로 재계산됐고 focused validators가 통과했다.
  Active HPP는 위 rollback correction에 따라 `0.1.2`다. 이는 one-seat physical Gate의 준비
  증거이며 설치·RC 수락은 아니다.
- adjacent Internal RC manual/preflight leaf(2026-09-01): exact 16-role manual 전부가
  actual Markdown+sha256 `candidate/current`이며 exercise·last-verified release는 HOLD다. Pure HTML
  renderer는 self-contained accessible projection을 만들지만 release artifact를 쓰지 않는다
  (5 tests). Pure readiness binder는 exact pack/product/manual/authority/recovery/device evidence를
  검사하고 current public packet을 HOLD, 완전한 합성 packet만
  `READY_FOR_ONE_PHYSICAL_SEAT_GATE`로 판정한다(5 tests). Actual exercise·Human acceptance·
  device/credential/project binding·install/doctor receipt는 계속 physical Gate 뒤다.
- adjacent Task execution foundation(2026-08-25): 기존 `TaskExecutionCore`/SQLite를
  변경하지 않는 default-OFF in-memory `CandidateExecutionCoordinator` 구조가 exact
  Role/Capability와 actor→agent→Bot→Executor binding, `responsible_ceo_triage`, opaque nested
  coverage custody, performing-agent별 slot, Waiting/HOLD release, exact successor,
  replay `NO_OP`/conflict `HOLD`, metadata-only attribution을 합성 검증했다. `AI 실행 후보`는
  GPT/ingress prefilter marker일 뿐이다. Owner 승인 team-only 합성 `SON-59` 1건은 Codex Linear
  connector, exact 제품 총괄 Bot/session, 기본 Hermes runner를 통해 marker digest 일치와
  same-process replay `NO_OP`, 4192 matched Bot `working→idle`, Official Done/mutation false를
  관찰했다. 이 adjacent foundation은 현재 AX·SE active slice와 P5→P8 순서를 대체하거나
  unlock하지 않으며, live collector/organization source, persistent ledger, scheduler, writer,
  automatic assignment, 실업무 Work Brief와 production route는 계속 `HOLD`다.
- active follow-up(2026-08-14): `ax_se_project_role_roster.v0`는 logical role rows를 exact
  project/source/capability-vocabulary/time/coverage에 묶고 자체 content ref를 계산하는
  독립 public-safe module이다. coverage가 complete이고 unknown routing이 0일 때만
  exclusivity를 지지한다. 사람 신원·live availability·조직 승인·assignment 권한은 0이며,
  assessment v0와 아직 연결하지 않는다.
- active follow-up(2026-08-14): 별도 `ax_se_project_role_bound_assessment.v1` pure subject가
  context/policy packet과 source-bound roster를 결합한다. full roster exact ref는 packet 밖의
  독립 pin으로 유지하고, policy/roster capability-vocabulary exact ref 일치도 확인한다.
  incomplete roster에서도 stage/gap 평가는 유지하되 role routing과 overall resolution은
  `HOLD`이며 stage 미관측 `UNKNOWN`은 별도 stage-gap 축에 보존한다. 사람·live availability·
  assignment·Task·ERP 권한은 모두 0이다.
- pilot command seam(2026-08-14): zero-write CLI
  `guild_hall/engineering_engine/tools/ax_se_project_assessment_runner.mjs`가
  `--packet` absolute local file 하나와 `--packet-sha256`만 받아 UTF-8/JSON 해석 전에
  exact raw byte pin을 검증하고, stdout에 canonical assessment 하나, stderr에
  payload-free receipt 하나만 낸다. command PASS는 domain
  `HOLD`/`UNKNOWN`/`READY_FOR_OWNER_REVIEW`와 분리되고 model/RAG/Wiki/ERP/TaskDriver/
  network/file write가 없다. 검증은 public synthetic/process/adversarial test까지이며
  embedded local path, 파일 동일성 시각 축소, 적용 대상 없는 stage를 fail-closed하고,
  engine topology가 현재 source의 fresh emit과 byte-equal한지도 함께 확인한다. actual
  project pilot은 실행하지 않았고 live-current 주장을 하지 않는다. snapshot freshness와
  terminal provenance가 아직 input에 없으므로 issue-free stage도 `active`로만 표시하고
  `boss_clear_candidate`를 주장하지 않는다.
- role-bound pilot command seam(2026-08-14): accepted v0 bytes를 보존한 별도 zero-write CLI
  `guild_hall/engineering_engine/tools/ax_se_project_role_bound_assessment_runner.mjs`가
  정확히 다섯 flag(`--packet`, `--packet-sha256`, `--expected-role-roster-entity-id`,
  `--expected-role-roster-revision-id`, `--expected-role-roster-content-sha256`)만 받는다.
  기대 roster ref는 packet 밖의 독립 입력이고, packet pin은 UTF-8/JSON 해석 전에 exact raw
  byte 위에서 검증하며, stdout에 canonical assessment 하나와 stderr에 payload-free receipt
  하나만 낸다. command PASS는 domain `HOLD`/`UNKNOWN`과 분리되고 model/RAG/Wiki/ERP/
  TaskDriver/network/file write가 0이다.
- **M1 public deterministic closeout(종료)**: public deterministic role-bound AX·SE v1
  subject, 그 zero-write 명령 runner, 두 표면을 모두 덮는 focused validator와 fresh
  Level 3 B/V review까지 닫혔다. 이 수락은 public deterministic 경계에 한정하며 actual
  project, live-current, assignment, project-ready 수락을 포함하지 않는다.
- **M2(현재 active slice)**는 아래 authoritative 순서를 바꾸지 않는다: M2-2 observed ephemeral
  pilot → P4/M2-3 project-local deterministic persistent RAG + thin Wiki exact revision receipt →
  P5 accepted context generation/freshness → P6 TaskIntent.
  1. **M2-0 계약 고정(완료 후보)**: 공통 Engine 하나, project별 물리 지식 root,
     exact project 하나 + 명시 allowlist common revisions로 구성한 Knowledge View,
     foreign-project no-enumeration/no-retrieval, Owner/global metadata-only catalog를 TARGET으로
     고정했다. bounded B/V/Claude review는 이 문서 경계를 수락했지만 runtime 격리 완료나
     activation 주장은 아니다.
  2. **M2-1 경계 구현(현재 public-synthetic 후보)**: `guild_hall/shared`의 selector가
     exact project 하나와 explicit common revision 집합을 별도 expected grant ref 및
     grant 전체 canonical hash에 결속한다. root resolver는 선택 root를 containment root의
     strict descendant로 제한하고 project/common overlap을 거부하되 body를 읽거나 열거하지
     않는다. portable scope fingerprint와 local admission fingerprint를 분리한다. local path
     commitment는 stable file identity·content identity·actual-project approval이 아니며
     durable/public actual-root 증거로 저장하지 않는다. model, ERP, TaskDriver, explicit network,
     project write는 0이다.
  3. **M2-2 observed ephemeral pilot(첫 판단 vertical, 현재 public-synthetic 구현 후보)**:
     Project Context Adapter v0는 별도 expected pilot-grant ref, complete project-source
     reference manifest, explicit common-revision→policy-requirement bindings와 roster pin을
     한 portable material fingerprint로 묶고 기존 role-bound Engine을 한 번만 호출한다.
     two-flag zero-write runner는 Owner-frozen launch를 먼저 pin한 뒤 admitted project root
     아래 relative locator의 canonical packet 한 파일만 stable-open한다.
     source body·RAG·Wiki·LLM을 읽거나 호출하지 않고 persistent RAG/Wiki store도 만들지
     않으며 출력은 `observed` ephemeral candidate다. public synthetic 독립검토 뒤에도 실제
     과제 pilot은 Owner가 exact launch/packet/grant/root provenance를 별도로 고정할 때까지
     `HOLD`다. 이 수동 packet이 첫 pilot의 자료를 공급하므로 RAG/Wiki 자동화가 선행조건은
     아니다.
  4. **P4/M2-3 project-local deterministic persistent RAG + thin Wiki**: M2-2 observed ephemeral
     pilot 뒤에만 project-local deterministic persistent RAG와 thin Wiki를 붙이고, 두 표면은
     exact source revision을 pin한 receipt 없이 context를 공급하지 않는다. Project
     History/Context Graph semantic adapter도 같은 receipt 경계 위에서만 연결한다.
     - P4 첫 조각(2026-08-17): 요구사항 ID 색인 seam(`guild_hall/rag/project_pdf_requirement_index.mjs`)을
       feature-OFF·zero-write·모델 없음으로 착수하고 public synthetic 합성 PDF로 검증했다.
       admitted project PDF 하나를 고정 profile `kr_defense_spec_v0`의 정규식으로만 읽어
       요구항목 색인과 payload-free 영수증을 만든다. 이는 나중 engine packet과 RTM 커버리지의
       원료 후보일 뿐이며 persistent RAG/Wiki 부착, 실제 과제 실행, RTM 주장은 여전히 `HOLD`다.
     - P4 실행 기반(2026-08-20): exact admitted revision을 project-local RAG·citation-only Thin Wiki
       sibling candidate로 투영하는 pure Module과, 새 authority packet을 create-only attempt claim으로
       먼저 소비한 뒤 admission/projection을 각각 한 번만 호출하는 bounded runner를 통합했다.
       public main의 synthetic extractor까지 검증했지만 actual KVDS run, source-body persistence,
       operational RAG index/Wiki writer와 accepted-context 공급은 새 private packet·독립검토 전까지
       `HOLD`다.
  5. **P5 accepted context generation/freshness**: M2-3 exact revision receipt 위에서 accepted
     context generation과 freshness를 닫는다. accepted generation 최소조건은
     `PROJECT_CONTEXT_GRAPH_MODEL_V0.md`의 `M2-3A Knowledge→Context Gate Crosswalk`가 소유하며,
     그 전에는 live current-state를 주장하지 않는다.
     - P5 사전조립 기반(2026-08-20): authentic P4/M2-2/timeline output과 별도 Owner context
       contract를 하나의 body-free generation candidate로 정규화하는 pure Module을 통합했다.
       trusted expected pin은 request 밖의 두 번째 인자이며 complete snapshotted request를 결속한다.
       출력의 `ready_for_registered_human_review`는 입력 완전성만 뜻하고 human acceptance,
       generation advance, HPP writer/ERP/P6 authority는 모두 false/0으로 남는다.
   6. **P6 TaskIntent**: accepted context generation이 닫힌 뒤에만 TaskIntent 후보를 만든다.
      이 순서를 앞당기거나 runtime activation을 주장하지 않는다.
   7. **병렬 support lane — Linear 업무 백업**: 백업 범위·데이터 모델과
      public-synthetic feature-OFF offline LB1 manifest/restore contract, 그리고 exact Owner
      decision·Linear read scope·Drive target·retention/RPO·restore reviewer를 하나의 trusted
      packet으로 결속하는 pure start Gate까지 구현됐다.
      synthetic-only runtime adapter binding과 runner effect-evidence v3 foundation은 구현됐지만,
      실제 authorized Linear/Drive client binding, webhook, scheduler와 actual one-shot은 없다.
      Task Engine 마스터플랜 §12의 `LB1` exact start Gate가 통과되면 P5 전에도 one-shot
      read-only backup pilot을 병렬로 시작할 수 있다. 첫 pilot은 Linear mutation·webhook 등록·예약 실행 없이 bounded
      snapshot/API read를 승인된 private backup target에 새 revision으로 저장하고 manifest/hash/
      coverage와 restore check를 남긴다. 이 support lane은 P4/P5/P6/P7/P8 acceptance를 증명하거나
      unlock하지 않으며 실제 Task 실행·Linear writer는 P5→P6→P7→P8 receipt, P9 canary,
      P10 capability별 Owner activation 순서를 그대로 따른다.
   title/summary만으로 상태를 추론하거나 raw content를 Wiki/RAG/canon으로 자동 승격하지 않는다.
  실제 project write, live-current 주장, cross-project body retrieval, LLM/project write
  activation은 별도 계획·검토·Owner gate 전까지 `HOLD`다.
- target flow(방향 요약): 공통 SE 지식과 격리된 project context는 각각 별도로 유지하고,
  둘을 bounded packet 하나로 봉인해 공통 AX·SE Engine에 넣는다. Engine 판단은 model-free
  deterministic이며, LLM은 그 결과를 사람이 읽기 좋게 설명하는 optional advisory rendering
  으로만 붙일 수 있다. ERP 기록은 그 뒤의 별도 gate다.

```text
공통 SE 지식 + 격리된 project context
  -> bounded packet (exact refs·hash pin)
  -> 공통 AX·SE Engine (deterministic, model-free)
  -> [optional] LLM 설명 (advisory only, 판단 authority 아님)
  -> [later gate] ERP 기록
```

### 2026-08-21 Owner 완료 지도 — 현재 위치·남은 Gate·종료선

한 줄 결론: **판단 Engine과 P4/P5/Linear의 feature-OFF 기반 코드는 통합됐지만,
실제 프로젝트 지식·실제 Linear 백업·accepted context·Task mutation을 끝까지 증명한
운영 폐루프는 아직 없다.** 아래 `C0~C6`은 이 절에서만 쓰는 완료 조각 이름이며 기존
P0~P10 또는 Knowledge P4/P5 단계 번호를 바꾸지 않는다.

```text
판단 Engine                    [구현·검증됨]
  ├─ P4 지식/RAG·Thin Wiki     [기반 코드 완료] ── actual one-shot HOLD ─┐
  └─ Linear LB1 백업           [기반 코드 완료] ── actual backup HOLD     ├─ 병렬 가능
                                                                        │
actual P4 evidence ──> P5 accepted context [builder만 완료 / acceptance HOLD]
                         └─> TaskIntent·TaskDriver·Official Task·AgentRun [운영 HOLD]
```

| 완료 조각 | 지금까지 된 것 | 정확히 남은 것 | 완료 증거 | 병렬성 |
| --- | --- | --- | --- | --- |
| `C0` Task mutation 기본 차단 | `start-windows.bat`의 4300 기반 auto-intake/autosync 암묵 기본값 제거와 4300/4310·background opt-in 합성 회귀 완료; actual Task 실행 route activation·write receipt는 계속 0 | `VF-1` 완료 상태 유지. 실제 mutation canary는 `C6`와 별도 Owner 승인 전 `HOLD` | pre-fix RED 1/2 뒤 focused 2/2·launcher 13/13·core 290/290 PASS, fresh independent review `ACCEPT`; live restart 0 | 완료; `C1~C4`와 독립 |
| `C1` actual P4 지식 vertical | PDF admission·추출·RAG/Thin Wiki candidate·Preparation·bounded runner 구현 | Owner 승인 fully-local copy-only staging, fresh authority/launch/output, actual one-document one-shot | exact revision/hash/citation을 가진 body-free candidate와 receipt, raw body persistence 0 | `C2`와 병렬 가능 |
| `C2` actual Linear LB1 | `RUNTIME_ADAPTER_FOUNDATION_DONE_FOR_SYNTHETIC_SCOPE`: v2 snapshot/Gate/Runner + exact-scope reader/create-only storage/durable claim binding + runner v3 effect evidence 구현. 역행 revocation counter는 attestation 대신 `COUNTER_MISMATCH/HOLD`로 고정했다. 실제 authorized clients·one-shot·human restore는 0 | Owner-approved credential/workspace/target/writer/reviewer refs와 actual clients를 exact bind한 one-shot, stored-byte readback, human restore review; hourly Bot writer와 quiesced window를 만들거나 non-quiesced snapshot 수락을 명시 결정한 뒤 `LB2` scheduler 별도 승인 | runtime adapters 22/22, LB1 51/51, Backup Controller 136/136; synthetic-only attested effects, actual Linear mutation 0 | `C1`과 병렬 가능; actual binding은 Owner gate |
| `C3` Decision/NO_ACTION ledger | `DONE_FOR_PUBLIC_SYNTHETIC_SCOPE / V0_4_1_PROJECT_CONTEXT_GATE_CONFIGURED`: pinned required-source/A0 Cycle Contract, branded in-memory append-only Project Decision Ledger, typed Portfolio Projection, live-only ShadowEvaluator 구현·검증. 기존 `업무 인입 감시`에 project instruction snapshot·`DO_NOT_ASSUME`·`HOLD_PROJECT_CONTEXT/effect=0`을 저장했고 ID·매시간·활성 상태를 유지했다. v0.4.0 first receipt는 Linear 5·다른 앱 0·`gmail_sent=0`을 보고했지만 provider/app readback은 미검증이며 persistent private writer도 미구현 | `HB-D1` first v0.4.1 receipt의 project fields·effect=0 HOLD·actual provider/app readback, exact prompt digest·permission snapshot, prohibited-action 0 검증; `HB-D2` private ledger owner·writer epoch·retention binding | repo synthetic foundation 53/53 + Task Core 28/28; 저장 후 exact v0.4.1 prompt 재조회 일치. v0.4.1 run은 아직 없고 provider truth는 `UNKNOWN/HOLD` | synthetic foundation·task configuration 완료; actual readback은 Owner gate |
| `C4` actual P5 accepted generation | `ACCEPTANCE_FOUNDATION_DONE_FOR_SYNTHETIC_SCOPE`: authentic candidate에 canonical review-content digest를 추가하고 registered-human review/coverage/supersession/writer epoch/current-pointer CAS를 검증하는 in-memory append-only acceptance gate·manifest·receipt 구현. actual HPP writer/persistence/human acceptance 0 | actual P4/M2/timeline packet, registered reviewer identity evidence, HPP fenced writer/epoch·private persistence binding으로 generation 1개 human acceptance | acceptance/query 31/31, P5 candidate 12/12; synthetic pointer만 advance, `writer_called=false`, ERP/P6 effect 0 | actual `C1`과 Owner binding에 의존 |
| `C5` Reactive+SE proposal shadow | C3 live-only evaluator와 generation-pinned mandatory-ACL/no-fallback/no-existence-leak Accepted Context Query public-synthetic foundation 구현. hostile wrong-generation manifest/receipt는 uniform `NOT_AVAILABLE`로 고정했다. 실제 accepted generation·adjudicated corpus·live query binding은 없음 | actual accepted generation을 current pointer/manifest/receipt로 bind한 read-only query와 실제 사람 결정/후속결과 corpus | query는 unauthorized/foreign/absent/stale/wrong-generation을 동일 `NOT_AVAILABLE`로 수렴; current foundation 31/31, live precision/recall·Official Task mutation 주장 0 | actual `C3+C4`와 `HB-D5`에 의존 |
| `C6` 첫 bounded mutation canary | `CANARY_GATE_FOUNDATION_DONE_FOR_SYNTHETIC_SCOPE`: exact tuple/approval/C5 pins, single tuple claim, sole writer/CAS/fencing, create/readback, non-destructive voided compensation과 terminal replay를 검증하는 synthetic gate 구현. actual canary readiness=false | actual C5 adjudicated evidence, exact first tuple/action/Owner approval, real sole coordinator/writer/rollback/readback packet으로 one bounded canary. 선택 tuple이 v0.4.0 hourly Bot write surface 밖이거나 같은 writer/fence 아래임을 증명해야 하며 다른 업무는 계속 gated | synthetic canary 17/17, Core 28/28, fresh Opus 5 `ACCEPT`; synthetic trusted-pin consistency only, live effect/authority 0 | actual `C0~C5`와 별도 Owner 승인 뒤 |

지식·Wiki·맥락·메모리는 같은 저장소나 같은 승인 상태가 아니다. P4의 RAG와 Thin Wiki는
exact source revision을 찾고 안내하는 지식 투영이며, P5 human acceptance를 통과해야 비로소
accepted Project Context가 된다. 개인 memory와 reviewed `memory_candidate`는 이 흐름과
분리하고 Wiki/RAG/canon으로 자동 승격하지 않는다.

Chat 1시간 Bot은 Worker가 다시 구현할 제품 기능이 아니라 C3/C5가 필요한 실제 오류·누락·
`NO_ACTION` 근거를 만드는 Shadow 실험면이다. LLM은 의미·관계·제안을 담당하고, read-set·
coverage·cursor·idempotency·권한·외부 effect·receipt는 결정론적 계약이 담당한다. 같은 Cycle의
성공률 하나로 합치지 않고 `retrieval coverage`, `reasoning quality`, `external effect`를 각각
평가한다. ChatGPT Scheduled Task의 exact 설정과 실제 app 권한은 Owner 관찰값이며 repo의
operational truth로 승격하지 않는다.

Owner decision `HB-DEC-01`(2026-08-21): 장기 방향은 **점진 실행 C**다. Chat Bot은 연결된
업무 전반을 계속 읽고 판단하지만 실제 mutation은 검증된 저위험 task type부터 하나씩 연다.
월간 부서장회의 자료수합은 첫 후보 예시일 뿐 Bot의 전체 업무범위를 제한하지 않는다.
전면 Shadow-only를 최종 상태로 두는 안과 대부분 업무를 한꺼번에 자동 실행하는 안은 채택하지
않았다. exact 첫 task type·Source scope·effect 권한은 후속 Grill Me 결정 전까지 `HOLD`다.

후속 Owner 대화로 Voice provenance, Thin Voice Context→Project Manager routing, Hierarchical
Project Isolation, 판단 성숙도 `JM0~JM6`와 실행권한 `A0~A6` 분리, Project Decision Ledger+
Portfolio Projection, Meaningful/Skillable Work Unit과 Capability Learning Loop를 확정했다.
정본은 `ui-workspace/apps/dev-erp/docs/SOULFORGE_VOICE_FIRST_BOT_AGENT_OPERATING_MODEL_V0_2.md`다.

종료선은 하나로 뭉뚱그리지 않는다.

1. **현재 목표 종료 — 실제 지식·백업·맥락 증거 폐루프**: `C0+C1+C2+C4`.
   승인과 exact ref/credential이 즉시 제공되고 한 과제·한 문서·한 Linear workspace로
   고정된다는 가정에서 병렬 **약 1~2 작업주**, 순차 **약 2~3 작업주**다.
2. **안전한 shadow pilot 종료**: 위 종료선 뒤 `C3+C5`. 관찰 기간을 포함해 추가
   **약 2~4 작업주**다. 이때도 Official Task write는 0이다.
3. **첫 제한적 운영 canary 종료**: shadow 근거와 별도 Owner 승인 뒤 `C6`. rollback
   rehearsal을 포함해 추가 **약 2~4 작업주**다.

위 기간은 개발 난이도 추정이며 약속된 일정이 아니다. Owner 승인, Linear/Drive 계정과
저장 authority, 실제 파일 상태, 독립검토 대기시간은 제외한다. 다과제 완전자율 운영의
종료 시점은 A/B writer 선택, 운영 품질 근거와 보안정책이 아직 미정이므로 `UNKNOWN`이다.

- ERP position: dev-ERP는 mail, voice, schedule, artifact, skill, 발주 이력, task,
  project memory를 연결할 장기 통합 자산·운영 표면이다. 전면 개편은 위 판단 Engine과
  source-bound context gate 이후로 유예한다. 아래 dev-ERP 중심 기록과
  `ENGINE_EXPANSION_MASTER_PLAN_20260702.md`는 당시 설계 history이며 현재 실행 큐가 아니다.

### 2026-06~2026-07 dev-ERP 중심 history

- 당시 active slice: **dev-erp (사내 개발팀 운영 콕핏)**. 정본:
  `ui-workspace/apps/dev-erp/docs/DESIGN.md`,
  `ui-workspace/apps/dev-erp/docs/MASTER_PLAN_20260613.md`; 당시 작업 큐:
  `ui-workspace/apps/dev-erp/docs/SLICES_INDEX.md`. `checklist_phase1.json`은 완료된 P1
  이력 체크리스트로 보존한다.
- 당시 상태 해석: 2026-06 실제 개발의 대부분이 dev-erp(읽기 콕핏 P1 → 할일쓰기 P2 → 재고/BOM/부품 P3 → 챗봇 RAG/Ollama → 매뉴얼/FAQ, run1~17)에 집중됐고 owner 1순위가 이쪽으로 이동했다.
- active sub-slice(2026-07-12): `ENGINE-12-CONTEXT-LIFE-TREE`가 source-local 시간 이력을
  읽기 전용 사건축과 일별 과제 생명수로 투영한다. 네 PC/ERP 파일 이력은 logical file,
  immutable revision, node observation을 분리하고 24시간 hash-cache TTL, 월별 receipt/event,
  checkpoint-only rebuild, strict 생명수 projection/ERP exact-dedupe validator까지 public-safe
  candidate로 구현했다. live scheduler·private transport·reconciler-primary·ERP correlation
  emitter·scanner ACL과 graph compaction/tail replay 활성화는 owner binding과 후속 검증 뒤 진행한다.
- active design follow-up(2026-07-13): `TEMPORAL-KNOWLEDGE-ONTOLOGY`가
  `source_revision_id`를 중앙 연결키로 고정해 프로젝트 사건·파일 개정과
  source/RAG/Wiki/claim/rule/knowledge/SE 산출물 계보를 잇는다. 첫 vertical pilot은
  등록된 방사청 시험평가 가이드북에서 일정 규칙 1개와 산출물 규칙 1개의 exact
  page/chunk crosswalk를 닫는 것이다. writer/ERP/graph migration과 legacy bulk rewrite는
  별도 activation gate로 유지한다.
- active design follow-up(2026-07-13): `ENGINE-13-TASK-DRIVER-CLOSED-LOOP`는 기존
  `core_item`/append-only event task truth 위에 `why/why-now` TaskDriver, 판단/적용과
  작업 상태의 두 축, completion feedback을 잇는 `canon_candidate`다. 현재 PC는 public
  docs/synthetic까지만, 고성능 PC는 read-only inventory→dry-run→한 project pilot까지만
  진행하고 live writer/scanner/scheduler는 별도 activation gate로 유지한다.
- owner authority decision(2026-07-29): TARGET의 책임공학 AX engine은 사람과 exact
  policy authority 아래에서 engineering task 후보 생성, project routing, 정확히 하나의
  주관 책임 role과 협업·검토 role 지정, 재분류·에스컬레이션, 실행 agent/capability
  선택을 소유한다. 순서는 accepted P5 context → P6 TaskIntent 후보 → P7
  `why/why-now`·authority·idempotency TaskDriver → P8 원자적 ERP 기록이며, ERP는
  정본 기록면이지 engineering judge가 아니고 MCP는 transport/query interface일 뿐이다.
  accepted assignment 전에는 WorkSession/AgentRun을 열지 않으며 closeout·agent success는
  공식 완료가 아니다. 이 결정은 schema·entity·runtime을 추가하거나 feature-OFF 및
  non-operational claim을 올리지 않는다.
- organization governance decision(2026-07-30): 한 명의 사람 Owner 아래
  `개발1팀 회사형 실행조직`과 별도의 `개인 AI 기반시스템 개발회사`를 둔다.
  사람용 두 회사 projection은 승인됐지만 현행 five-branch domain routing은
  그대로 유지한다. 두 CEO의 cross-branch 자동 routing은 별도 governance
  overlay 또는 directory v2 계약·validator·Owner 승인 전까지
  `HOLD/non-routable`이다.
- historical 판단(2026-06-14): 당시 active slice는 dev-erp였고 `snapshot_to_operation_board_v0`는 '다음 후보'로 내렸다. 이 우선순위는 위 2026-08-14 active slice 결정으로 대체됐으며, 스펙은 아래 'Active Slice 001' 절에 history로 보존한다.

### Owner-approved adjacent lane — AI usage meter

- 2026-08-03 owner가 Soulforge 전체, 두 회사 조직, 별도 프로젝트, 향후 팀원 Codex와 MCP에서 공통으로 사용할 AI 사용량 미터기 구축을 승인했다.
- v1은 `guild_hall/ai_usage_meter/`가 소유하며 Codex session backfill, Stop/SubagentStop 계측, parent-child lineage, `work_id` binding, 버전 고정 rate card, local ledger, JSON/CSV/HTML, MCP query/binding adapter를 제공한다.
- 원문 prompt, reasoning 내용, tool payload는 수집하지 않으며 일반 ChatGPT 사용량을 Codex 원장에 합치지 않는다. 일반 ChatGPT는 저장소 접근이 필요 없는 조사·전략 작업의 보조 라우팅 선택지다.
- 이 lane은 품질을 낮추거나 `AGENTS.md`를 감으로 축약하기 전에 실제 비용 원인을 관찰하기 위한 운영 기반이다. 현재 read-only AX·SE active slice를 대체하지 않으며 중앙 집계, 예산 자동 차단, App Server streaming, non-Codex provider adapter는 별도 owner gate다.
- 정본 계약은 `docs/architecture/guild_hall/AI_USAGE_METER_V1.md`, 실행 runbook은 `guild_hall/ai_usage_meter/README.md`가 소유한다.

### Owner-approved adjacent lane — autonomous voice context resolver

- 2026-07-13 owner는 24시간 맥미니를 voice processing operational-primary로
  지정하고, 사람의 매 건 확인을 기다리지 않는 `AI 임시 확정 -> 재검증 -> 예외만
  사람 확인` 방향을 승인했다. 이 장비 지정은 아래 2026-07-18 결정으로 대체됐지만,
  AI 임시 확정 방향과 PLAUD 단독 정본 채택의 별도 파일럿 경계는 유지한다.
- 2026-07-18 owner는 회사 NAS에 접근할 수 있고 장시간 고성능 처리가 가능한 HPP를
  voice processing, central ingress/custody, Task Engine/AX의 정상 운영
  operational-primary TARGET으로 재지정했다. 맥미니는 경량 상시 감시·source
  spool·fallback/mirror와 별도 worktree의 public 개발면을 맡는다. HPP가 꺼져 있거나
  exact binding/cutover receipt가 아직 없을 때는 기존 맥미니 writer를 즉시 끄지 않고
  temporary failover로 유지하며, 두 장비의 동일 shared surface 동시 write는 금지한다.
- 목표는 평상시 녹음·회의·통화를 구분하고, 긴 녹음을 회의/주제별로 나눈 뒤,
  동의된 화자 후보와 mail·SE schedule·project context를 결합해 프로젝트, 담당자,
  결정, 할일, 기한을 내부 임시 상태로 계속 적재하는 것이다.
- AI 임시 확정은 현재 `accepted_project_route`나 사람 승인 필드를 재사용하지 않는다.
  외부 발송, 외부 공유, 구매, 공식 승인, 기술 truth 변경은 계속 별도 승인을 요구한다.
- 이 lane은 현재 read-only AX·SE active slice를 대체하지 않는 승인된 인접 구현 작업이다. 실행
  정본과 acceptance/stop 조건은
  `_workmeta/system/dev_worker_queue/autonomous_voice_context_resolver_v0.yaml`이
  소유하며, public 문서에는 상세 backlog를 복제하지 않는다.

## SE assistant program direction

Current structural target:

- Keep the read-only AX·SE project assessment Engine as the current active
  slice. Preserve dev-ERP as the deferred integrated operating surface and
  `snapshot_to_operation_board_v0` as a structural north-star/history surface.
- Use `systems_engineering_cell` as the party/loadout for SE assistant requests.
- Use `se_assistant_operating_loop_v0` as the request-level router before
  calling stage gap scan, source/wiki, readiness, owner-decision, review, or
  closeout workflows.
- Keep `se_foldertree_generate` limited to scaffold generation and plan-tracking
  bootstrap.
- Treat missing engineering truth as owner input, source gap, blocker,
  draftable queue, or downstream route; never infer it into the design record.
- Keep stage readiness, review approval, verification acceptance, and public
  canon promotion outside the assistant's authority.

현재 AX·SE Engine은 이 program의 판단 kernel을 먼저 닫는 slice다. 기존 SE assistant party/router는 요청·workflow routing을 계속 소유하지만 판단 결과를 승인하거나 project/ERP를 쓰지 않는다. 장기 snapshot UI와 후속 dev-ERP 통합은 이 read-only 판단 계약이 안정된 뒤 연결한다.

핵심 owner 분리:

- `se_foldertree_generate` 는 supported input matrix, dry-run, manifest/progress/index 생성만 담당하는 scaffold skill 로 고정한다.
- project-specific context, schedule, missing inputs, owner backlog, daily digest 는 `_workmeta/<project_code>/` 와 `.mission/<mission_id>/` 가 소유한다.
- reusable stage-aware procedure 는 `.workflow/` 로 올리고, cross-project advisory 와 야간 감시는 `guild_hall/night_watch` 로 붙인다.

추천 build order:

1. `se_foldertree_generate` 를 단순 scaffold skill 로 고정하고, business type / contractor / quality grade 별 supported input matrix 만 유지한다.
2. 폴더 생성 이후 owner 가 제공한 project brief, 설계 목적, 제약, source 위치를 `.mission` 후보와 `_workmeta/<project_code>/reports/**` evidence 로 묶는다.
3. official source intake, standards extraction, sufficiency review 를 묶어 stage 별 source/규격 packet 흐름을 먼저 안정화한다.
4. stage/gate 기준으로 필요한 설계지원 산출물, 필수 입력, owner 질문, blocker 를 정리하는 `se_stage_artifact_preparation` 계열 workflow 를 만든다.
5. draft packet, checklist seed, diagram handoff, traceability seed, review readiness digest 를 연결해 산출물 초안 준비와 누락 항목 경고를 분리된 workflow 로 만든다.
6. `guild_hall/night_watch` 는 active/blocked mission, owner 질문, source gap, promotion candidate 를 밤 사이 요약하는 advisory 로 붙이고, final readiness/승격 판정은 owner lane 에 남긴다.

SE assistant 불변 조건:

- 요구사항, 설계 수치, 검토 결론이 비어 있으면 추론으로 채우지 않고 owner question 또는 blocker 로 남긴다.
- 팀 템플릿 기반 draft 는 만들 수 있어도, source-backed required content 와 owner decision 이 없는 항목은 미완으로 표시한다.
- 산출물 본문 작성과 readiness 판정은 foldertree generator 안에 넣지 않고, 상위 workflow/mission orchestration 으로 분리한다.

`artifact` 의미:

- 문서 파일만 뜻하지 않는다.
- formal documents, diagrams, traceability matrices, analysis packets, review evidence, owner decision records, open question registers, verification planning artifacts 를 모두 포함한다.

first workflow posture:

- 첫 workflow 는 문서 작성기가 아니라 `design-support gap scan` 이다.
- 현재 stage 에서 필요한 문서, 도식, 분석, trace, review evidence 중 무엇이 있는지, 없는지, AI가 초안 가능한지, owner input이 필요한지 판정하는 데 집중한다.

## RAG/source-text standardization support lane

RAG/source-text standardization is a bounded support and follow-on lane. It
does not replace the active playable loop roadmap.

Purpose:

- keep metadata-only RAG manifest, metadata index, trace/evaluation, and answer
  paths safe enough to support later operation-board and knowledge-use views;
- define the separate owner-approved private source-text lane under
  `_workspaces/knowledge/**`;
- standardize a parser-first source extraction stage before source-text
  indexing so company-PC intake does not rely on direct LLM file reading;
- add a source sync ready manifest gate for cloud/OneDrive handoff so another
  PC's export is not indexed until file size, SHA-256, and optional stability
  checks pass locally;
- keep raw questions ephemeral and store only labels, query fingerprints, token
  fingerprints, source-card refs, hashes, and status metadata in JSON/review
  artifacts;
- provide a public-safe company knowledge intake packet template for parallel
  PC handoff without copying company source text, NotebookLM answers, account
  IDs, conversation IDs, secrets, or private payloads.

Boundaries:

- This lane is support infrastructure for knowledge retrieval and evidence
  hygiene, not the current active slice.
- It must not delay or redefine the current read-only AX·SE project assessment
  Engine. Deterministic RAG is a planned revision-bound context support layer;
  it is neither an Engine prerequisite nor a judgment authority.
- Automatic promotion from raw ingest into Wiki, RAG, or canon is not authorized
  in the current slice. Existing RAG and Wiki contracts remain preserved for a
  later bounded review rather than being deleted or silently activated.
- Source-text commands may read only owner-approved `_workspaces/knowledge/**`
  source text and must keep public tracked files and `_workmeta` metadata-only
  unless an explicit private workspace command/source card allows private proof
  payloads under `_workspaces/knowledge/**`.
- LLM, NotebookLM, LlamaParse, and other cloud/advisory parsers are not default
  raw-document extraction authority. They may help only behind owner approval
  and cannot replace parser evidence, hashes, tool/version metadata, or source
  cards.

Follow-on fit:

1. Stabilize the metadata-only RAG command and validation surface.
2. Add the company intake packet validator after the code command exists.
3. Add the source sync ready manifest gate before source-text indexing for
   cross-PC OneDrive handoff.
4. Add a Docling-first local extraction worker standard before source-text
   indexing, with fallback routes for broad text/metadata extraction, PDF
   checks, Office conversion, OCR, and HWP-to-HWPX normalization.
5. Use the resulting metadata to support later knowledge-use analytics and
   sourcebound review queues.
6. Keep any answer-quality, NotebookLM, source-text BM25/vector, or ontology
   promotion work behind separate owner/review gates.
7. Migrate the legacy sourcebound compiled-projection binding from `_workmeta/**`
   payloads to `_workspaces/**` payloads plus metadata-only `_workmeta/**` refs;
   keep payload-producing execution blocked until its workflow review passes.
8. Add the temporal knowledge identity bridge: canonical source alias crosswalk,
   exact source revision records, source-revision-bound RAG/Wiki lineage, and
   project-local SE rule/application relation packets before wider automation.

## 장기 후보: engineering co-pilot expansion

이 후보는 read-only AX·SE judgment, source-bound context support, SE assistant routing이 안정된 뒤 실제 설계 업무를 더 넓게 보조하는 후속 방향으로 둔다. 핵심은 owner의 거친 아이디어, 작업 흔적, 자료 접근 패턴을 실행 가능한 산출물 준비와 개선 제안으로 바꾸는 것이다.

후보 기능:

- schematic intake aide: 회로도 또는 회로 관련 입력을 받으면 block/function 단위로 분할하고, 필요한 부품 datasheet, layout guide 후보, PSpice/simulation 준비 자료, 팀 library handoff packet 으로 정리한다.
- stage artifact manager: 개발 단계별로 필요한 산출물, 입력 자료, reviewer 질문, 누락 작업을 추적하고 문서 작성 전에 필요한 조사와 초안 준비 항목을 제안한다.
- daily worklog analyst: 그날 PC 작업 로그와 explicit work note 를 public/private 경계 안에서 요약하고, 완료 업무 정리뿐 아니라 반복 병목과 업무 개선 후보를 도출한다.
- knowledge-use analytics: 실제 자료 중 어느 ref 를 자주 열었는지, 어떤 질문을 많이 했는지, 어느 workflow/mission 에 지식 접근이 몰리는지 metadata-only ledger 로 분석해 다음 정리 방향을 제안한다.
- external signal scout: Karpathy 같은 공개 AI/engineering practitioner 의 GitHub, 글, 영상 등 public source 를 주기적으로 살펴보고 Soulforge 에 add-on 할 만한 패턴을 후보로 제안한다.
- idea-to-candidate capture: owner 가 말로 던진 아이디어를 즉시 canon 으로 승격하지 않고, owner review 가능한 future candidate, mission 후보, workflow 후보, skill 후보로 분리해 적재한다.

불변 조건:

- 회로 원본, 업무 원문, 회사 자료, PC activity raw truth, private log 는 public repo 에 남기지 않는다.
- datasheet/source 수집은 공식 source 또는 owner-approved source packet 기준으로 하고, 출처 없는 값을 설계 사실처럼 채우지 않는다.
- 외부 신호 감시는 public source 요약과 후보 제안까지만 하며, 자동으로 canon/workflow/skill 을 바꾸지 않는다.
- knowledge-use analytics 는 기본적으로 metadata-only 로 시작하고,
  working/derived payload는 `_workspaces` 또는 owner-approved worksite,
  source truth는 owner-held source나 승인된 source packet 경계에 남긴다.
- 팀 library 반영, 산출물 승인, 설계 판단, workflow/skill 승격은 owner approval 또는 별도 review gate 를 거친다.

구체화 순서:

1. `knowledge_access_event_capture_v0` 와 ledger helper 를 안정화해 어떤 지식이 언제, 왜 쓰였는지 metadata-only 로 남긴다. 2026-07-13 첫 수직 경로로 저장되는 metadata/source-text RAG 답변의 selected-evidence `retrieve`, occurrence-immutable output revision, pending receipt/reconciliation, snapshot/UI 집계를 연결했다. 다음 단계는 exact source revision 전파, Wiki adapter, 실제 `cite/apply`, 중요도 결합 retention pilot 이다.
2. SE assistant 의 `design-support gap scan` 이 stage artifact manager 의 최소 입력/출력 shape 을 제공하도록 만든다.
3. schematic intake 는 먼저 public-safe synthetic fixture 로 datasheet/source packet, simulation prep, layout guide handoff 의 output shape 만 검증한다.
4. daily worklog analyst 는 private `_workmeta/<project_code>/reports/**` evidence 를 대상으로 owner-only digest 로 시작한다.
5. external signal scout 는 GitHub/YouTube 등 public source ref 와 adoption candidate register 만 만들고, 실제 채택은 `workflow evolution harness` 또는 post-development review gate 로 보낸다.

### Daily work ledger automation lane

This lane adds a metadata-only daily work ledger surface so weekly and daily
worklog drafting does not rediscover work from scattered project reports, mail
metadata, git history, and system logs each time.

In the project-wide automation model, this is a
`daily_automation_party` stage: the collector writes ledgers first, and report
renderers consume those ledgers later.

Current registered surface:

- `.workflow/daily_work_ledger_capture_v0/` defines the registered collection
  workflow shape.
- `.party/daily_automation_party/` defines the registered local daily
  automation chain where activity sync runs before ledger capture, followed by
  snapshot refresh, metadata-boundary validation, and reports/checks.
- Local Codex app automations own the actual clock and ACTIVE/PAUSED state.

Confirmed owner intent:

- Split collection from reporting.
- A daily collector writes the work ledger every day as its own job.
- A daily or weekly reporter reads the already-written ledger and formats it
  for the owner.
- The reporter must not search mail, git history, system logs, attachments, or
  project files at report time to reconstruct the day.
- If the ledger is missing or incomplete, the report says the ledger is missing
  or incomplete instead of silently re-collecting from raw sources.
- General company work means real company work that does not yet have a
  project code. The default ledger code for that work is `P00-000_INBOX`, not a
  separate `general_work` bucket.

Owner split:

- Project ledger agents: write one daily metadata ledger per project under the
  **current legacy** project-local `_workmeta/<project_code>/daily_ledger/**` surface;
  future target `_workmeta` is not this writer's destination.
- Company general/unresolved ledger agent: writes one daily metadata ledger
  under current legacy `_workmeta/P00-000_INBOX/daily_ledger/**` for real company work that is
  not assigned to a project yet or is intentionally project-less.
- Soulforge ledger agent: writes daily metadata ledgers under current legacy
  `_workmeta/system/daily_ledger/<subledger_id>/**` using
  `docs/architecture/workspace/DAILY_WORK_LEDGER_TAXONOMY_V0.md`. Soulforge
  work must not collapse into one owner-facing `system` bucket.
- Daily ledger collector: runs on the always-on host, reads only approved
  metadata surfaces, and writes draft ledger entries plus skipped/review-needed
  notes.
- Worklog writer: reads only the daily ledger surfaces, sorts company projects,
  `P00-000_INBOX`, and then Soulforge sub-ledgers, applies the owner worklog
  style profile, and produces the final daily or weekly worklog.
- Always-on local host: runs scheduled ledger collection on an owner-approved
  machine, but does not become source truth or store raw payloads in
  `_workmeta`.

Next development target:

1. Inspect the first scheduled collector receipts and review-needed registers
   from the local always-on node.
2. Strengthen the daily ledger YAML schema for project, `P00-000_INBOX`, and
   Soulforge sub-ledgers.
3. Add a validator for metadata-only ledger entries, source refs, project
   ordering, reserved `P00-000_INBOX` routing, and raw-payload exclusion.
4. Keep the scheduled ledger collectors metadata-only and treat missing
   upstream sync receipts as gaps.
5. Add a worklog writer that reads only project, `P00-000_INBOX`, and system
   ledgers and never scans mail bodies, attachments, raw source files, or ad
   hoc git history directly.
6. Add a review packet and receipt path so the always-on host can record what
   it collected, what it skipped, and which entries need owner review.
7. Finish migrating weekly report automations so their normal input is the
   daily ledger only.

Non-goals:

- Do not copy mail bodies, attachments, Office/PDF/HWP payloads, waveform data,
  account data, secrets, or raw source text into `_workmeta`.
- Do not let the worklog writer infer work from source payloads. It must use
  ledger entries only.
- Do not let the report automation become a fallback collector. Missing ledger
  data is a reported gap, not permission to scan raw sources at report time.
- Do not make scheduled automation a truth authority. It records observed
  metadata and owner-review gaps.
- Do not push company project payloads or owner-only ledgers into the public
  repo.

Current gate:

- Local party and workflow registration are in place for the always-on host.
- The first scheduled collector receipts still need review before copying the
  route to another PC or calling it production-ready.

Acceptance criteria:

- Representative project, `P00-000_INBOX`, and Soulforge sub-ledgers can be
  generated from metadata-only fixtures.
- The validator rejects raw-payload extensions, absolute runtime payload paths,
  secrets, and unclassified project codes while accepting `P00-000_INBOX` as
  the reserved company general/unresolved work code.
- The worklog writer can create a date/project/topic/task draft using only
  ledger entries.
- Company project entries and `P00-000_INBOX` entries are ordered before
  Soulforge sub-ledger entries for each day.
- A missing or incomplete ledger produces an explicit gap section instead of
  triggering ad hoc collection during reporting.

### Project mail history XLSX readability candidate

This candidate improves the `_workspaces/<project_code>/reports/메일_이력/`
XLSX export generated from project mail-history metadata so it is useful as a
human-facing ledger, not just a machine-shaped CSV mirror.

Owner split:

- `_workmeta/<project_code>/reports/메일_이력/**` remains the metadata ledger
  and schedule sidecar surface.
- `_workspaces/<project_code>/reports/메일_이력/메일_이력.xlsx` is the
  owner-facing spreadsheet export for reading, review, filtering, and manual
  project follow-up.
- The gateway mail-history writer owns export generation and must not read or
  copy mail bodies, HTML, raw `.msg` payloads, attachments, secrets, or
  recipient lists beyond the existing metadata contract.

Initial development target:

1. Define a human-readable workbook layout for project mail ledgers.
2. Keep technical identifiers available but visually secondary, hidden, or moved
   behind review columns where appropriate.
3. Add readable column widths, wrapped subject/status text, frozen header row,
   filter-ready headers, sensible row height, and date/time formatting.
4. Add separate views or sheets for received mail, sent mail, and open review
   items if that stays simpler than a single dense sheet.
5. Add fixture or smoke coverage so future exports do not regress to unreadable
   clipped cells or unformatted technical dumps.

Non-goals:

- Do not move the canonical metadata ledger out of `_workmeta`.
- Do not put raw mail bodies, attachments, Office/PDF/HWP payloads, account
  data, secrets, or Outlook rule state into the workbook.
- Do not make the spreadsheet a source of truth that diverges from the CSV
  metadata ledger.
- Do not require Excel automation; prefer deterministic file generation.

Start condition:

- Owner confirms the first preferred human-facing columns and whether technical
  columns should be hidden, moved to a separate sheet, or kept visible.

Acceptance criteria:

- A generated project mail-history XLSX can be opened by a person and read
  without clipped key text, unreadable narrow columns, or noisy technical fields
  dominating the first view.
- Received and sent mail rows are easy to distinguish.
- Date, subject, sender/direction, event type, attachment count, status, and
  source reference remain available without exposing raw payloads.
- Existing metadata CSV/ICS behavior and workmeta payload validation still pass.

Implementation status:

- 2026-06-06 dev-worker slice added readable JavaScript XLSX export sheets,
  wrapped key text, filter/freeze metadata, a hidden technical sheet, and
  synthetic XLSX smoke coverage. CSV/ICS metadata ledger behavior remains the
  source contract.

### Google Drive LLM wiki source warehouse candidate

This candidate adds Google Drive as the durable cross-PC source warehouse for
NotebookLM-ready materials. It does not replace OneDrive as the active working
file share, and Drive folder placement, a `CANON` label, connector visibility,
or a successful read does not approve a source or create Soulforge canon.

Owner split:

- Google Drive: durable source warehouse for candidate and approved source files
  used by LLM wiki and NotebookLM source sets.
- NotebookLM: question, summary, and synthesis interface over the approved
  source set.
- OneDrive: active project working files and editable deliverables.
- Soulforge: metadata-only source ledgers, NotebookLM packet maps, usage
  records, review packets, and promotion candidates.
- `_workmeta`: metadata-only refs, hashes, approval/review evidence, bindings,
  claim ceilings, and ontology candidates. It stores no source, projection,
  wiki, chunk, or generated-answer bodies.

Initial development target:

1. Define an approved-source intake checklist for the Google Drive source warehouse.
2. Define a metadata-only source ledger shape that can point at Drive sources
   without copying source payloads.
3. Define a NotebookLM packet map that records which approved source handles belong
   to which notebook or topic.
4. Route source-use events through `guild_hall/knowledge_access` and keep
   accumulated evidence under `_workmeta/**/reports/knowledge_access`. Persisted
   RAG answer writers now cover selected-evidence `retrieve`; Wiki queries and
   actual downstream `cite/apply` remain follow-up adapters.

Non-goals:

- Do not use Google Drive as the active working-file root for current project
  edits unless a separate pilot proves the sync behavior.
- Do not put drafts, raw mail, uncertain versions, or local-only working files
  into NotebookLM source sets.
- Do not treat NotebookLM output as validation, owner approval, ontology
  acceptance, or public canon promotion.

### Knowledge graph 탐지 카드 integration candidate

이 후보는 현재 metadata-only 지식 그래프 preview 와 retrieval-plan CLI 를
그래픽 UI 에서 노드 기반 `탐지 카드` 로 여는 흐름으로 확장한다. 목적은
RAG/GraphRAG 답변 엔진을 바로 만드는 것이 아니라, 사용자가 노드를 눌렀을
때 "이 노드를 기준으로 어떤 관련 지식, 근거 경로, 부족한 증거, 다음 검토
행동이 보이는가" 를 같은 계약으로 확인하게 만드는 것이다.

Owner split:

- `guild_hall/knowledge_graph`: graph export, planner scoring, CLI output
  contract, preview-side metadata-only 탐지 카드 payload 를 소유한다.
- `docs/architecture/guild_hall/KNOWLEDGE_GRAPH_VIEW_MODEL_V0.md`: 그래프
  시각화와 탐지 카드가 claim/trust/source boundary 를 어떻게 표현하는지
  기록한다.
- `ui-workspace/**`: root-owned UI 에 같은 contract 를 소비하는 구현이
  필요해질 때만 세부 계획을 내려받는다.
- `_workmeta/system/**`: NotebookLM 결과의 metadata-only ref/status, source
  delta metadata, pilot evidence, review packet 같은 private/procedure
  evidence를 남긴다. NotebookLM answer나 wiki/projection 본문은 두지 않는다.

Recommended sequence:

1. planner output contract 와 fixture 를 안정화한다.
2. 같은 planner logic 을 3D graph preview/browser side 에 붙인다.
3. 노드 context menu 에 `탐지 카드 열기` action 을 추가한다.
4. 오른쪽 sidebar/panel 에 owner-readable 탐지 카드를 표시한다.
5. 검토된 source refs 만 public-safe source node 와 `supports` /
   `derived_from` edge 로 확장해 카드 품질을 올린다.

#### Step 1 detailed plan - planner contract stabilization

Goal:

- 그래픽 UI 가 재해석 없이 사용할 수 있는 `retrieval_plan` JSON contract 를
  고정한다.
- question-only 탐색과 selected-node 탐색을 같은 출력 shape 으로 다룬다.
- 현재 구현이 metadata-only navigation/review planner 임을 output 자체에
  드러낸다.

Inputs:

- generated `graph.json` 또는 exporter in-memory graph.
- user question string.
- optional selected node ref, 예: `.registry/knowledge/graph_rag`.
- optional limits: max candidate nodes, max relation paths, max source refs.

Output contract:

- `schema_version`: contract version.
- `question`: 원문 질문.
- `selected_node_ref`: 선택 노드가 있을 때만 채움.
- `boundary`: answer generation, source text loading, NotebookLM querying,
  vector search, canon promotion 을 하지 않는다는 한계.
- `candidate_nodes[]`: ref, label, type, score, score reasons, claim ceiling,
  source refs.
- `relation_paths[]`: selected/query candidate 주변의 짧은 relation path.
- `missing_evidence[]`: source/support edge, vector baseline, benchmark,
  sourcebound validation 등 부족한 증거.
- `next_actions[]`: UI 가 버튼이나 작업 제안으로 보여줄 수 있는 다음 행동.

Tasks:

1. CLI 에 selected-node 모드를 추가할지 결정하고, 필요하면 `--node-ref` 같은
   explicit option 으로 붙인다.
2. planner module 의 output field 이름과 필수/선택 필드를 fixture 로 고정한다.
3. 최소 fixture 3개를 둔다: query-only GraphRAG, selected-node 탐색,
   evidence/path 가 부족한 isolated node.
4. test 는 ranking 점수 전체가 아니라 contract shape, deterministic ordering,
   missing-evidence honesty 를 확인한다.
5. README 와 view model 문서는 UI 소비자가 알아야 하는 입력/출력/한계만
   남기고, 장기 RAG 엔진 설명으로 부풀리지 않는다.

Acceptance criteria:

- CLI sample 이 stable JSON 을 출력하고, 그래픽 UI 가 별도 추론 없이 카드
  제목, 후보 노드, 근거 경로, 부족한 증거, 다음 행동을 렌더링할 수 있다.
- selected node 가 주어져도 source text, NotebookLM answer, vector result 를
  꾸며내지 않는다.
- fixture 테스트가 future UI port 의 회귀 기준으로 쓸 만큼 작고 명확하다.

Validation:

- `node --check guild_hall/knowledge_graph/retrieval_plan.mjs`
- `node --check guild_hall/knowledge_graph/cli.mjs`
- `npm run validate:knowledge-graph`
- representative CLI samples for question-only and selected-node modes.
- `npm run validate`

Non-goals:

- browser UI 카드 렌더링.
- GraphRAG/RAG 답변 생성.
- source body import, private payload indexing, NotebookLM source import.
- ontology acceptance, owner approval, canon promotion.

Step 1 implementation status:

- 2026-05-23 pilot slice added selected-node-aware planner output, stable
  `candidate_nodes` / `selected_node` / `detection_card` fields, coded
  missing-evidence and next-action items, source-ref limits, explicit
  `--graph-ref` failure, and fixture coverage. Browser-side rendering remains
  Step 2.

Step 2/3/4 implementation status:

- 2026-05-23 pilot slice added the same metadata-only card shape to the
  generated 3D preview browser side, added the node context-menu action
  `탐지 카드 열기`, and rendered the selected-node card in the preview sidebar.
  The browser card is local-only and still does not load source text, call
  NotebookLM, run vector search, auto-call the Codex bridge, mutate graph data,
  or promote canon.

## Active Slice 001

## Development candidate - Team Ops Board v0 clickable mockup

Status: MVP 0 clickable mockup delivered 2026-06-04. Owner decisions closed
2026-06-12: truth posture hybrid (Smartsheet stays the official project
ledger), teammates edit directly with a full audit trail, UI Korean-first.
MVP 1 local working app slice started at `ui-workspace/apps/team-ops-board`
(verification pending on owner PC before merge).

Goal:

- Create a standalone clickable mockup for a small-team operations board.
- Do not use the existing Soulforge `renderer-web` screen or old HTML as the
  product baseline.
- Treat Smartsheet as a possible future input source, not as a required first
  dependency.

MVP shape:

- First screen is the daily operations board itself.
- Show Today, Blocked, Due soon, Waiting, Done, and No owner counts.
- Include Board, Projects, Schedule, People, and Settings placeholder views.
- Use sample data only: about 3 projects, 6 people, and 20 work items.
- Allow local-only mock interactions: add item, select item, change status,
  change owner, add comment, and require a note for Blocked or Waiting.

Non-goals:

- Smartsheet API connection or write-back.
- Real private project data import.
- Mail body, attachment, secret, or credential handling.
- Existing renderer reuse.
- AI automatic priority, owner, or status decisions.
- Full ERP scope (ERP 범위는 후속 전면 개편 대상인 dev-ERP 앱이 소유한다).

Development packet:

- `_workmeta/system/dev_worker_queue/team_ops_board_clickable_mockup_v0.yaml`
- `_workmeta/system/reports/procedure_capture/team_ops_board_fresh_design_20260602.md`

Start condition:

- Owner chooses clickable mockup versus working local app and confirms whether
  teammates may update items directly in the first pilot.
- Fulfilled 2026-06-12: working local app (MVP 1), direct teammate edits with
  audit logging. Decision record:
  `_workmeta/system/reports/procedure_capture/team_ops_board_mvp1_owner_decision_20260612.md`.

### 이름

`snapshot_to_operation_board_v0`

> (2026-08-14 상태) 이 슬라이스는 2026-06-14 active에서 '다음 후보'로 내려간 history다. 현재 active slice는 read-only AX·SE project assessment Engine이며, 아래 스펙은 후속 UI/projection 재개 시 참조용으로 보존한다.

### 목표

- 파일트리와 private owner 경계를 사람이 외우지 않아도 현재 상태를 볼 수 있게 한다.
- UI 또는 외부 host 가 `_workspaces`, `_workmeta`, `private-state` 원본을 직접 훑지 않게 한다.
- `Guild Master 작전판` 의 첫 데이터 입력을 sanitized snapshot 으로 고정한다.

### 범위

1. `soulforge_snapshot.json` 필드 초안 작성
2. read-only snapshot processor 구현
3. snapshot fixture 또는 sample 추가
4. UI가 snapshot 만 읽는 `Dungeon Map` 초안 표시
5. `.mission` 과 `_workmeta` 요약을 연결하는 `Mission Board` 초안 표시

### 현재 구현 surface

- contract: `docs/architecture/guild_hall/SOULFORGE_SNAPSHOT_V0.md`
- producer: `guild_hall/snapshot/`
- local output: `guild_hall/state/snapshot/soulforge_snapshot.json`
- validation: `npm run validate:snapshot`

### 범위 밖

- OpenClaw 직접 연결
- 완전 자동 전투
- 복수 프로젝트 동시 운영
- 정교한 종족, 직업, 경제, 레벨 시스템
- `_workspaces` 실제 파일 내용 indexing
- 메일 원문, attachment, token, credential 을 snapshot 에 포함

### 성공 기준

- 현재 repo owner root, private repo 존재, project code, mission summary, gateway status 를 한 JSON 에서 볼 수 있다.
- UI는 private 원본을 직접 읽지 않고 snapshot 만 읽는다.
- 사용자는 `Dungeon Map` 에서 어느 owner root 와 project surface 를 봐야 하는지 알 수 있다.
- 사용자는 `Mission Board` 에서 다음에 처리할 mission 후보와 blocker 를 볼 수 있다.

## 다음 후보

| 순서 | 후보 | 시작 조건 | 내려갈 owner |
| --- | --- | --- | --- |
| 1 | battle log 최소 event schema | snapshot board 에서 mission 후보가 보임 | `_workmeta`, `.mission`, `docs/architecture/workspace` |
| 2 | manual monster one-shot flow | mission board 에서 수동 candidate 를 만들 수 있음 | `guild_hall/gateway`, `.mission` |
| 3 | promotion candidate projection | battle log 가 최소 1건 남음 | `_workmeta`, `.registry`, `.workflow` |
| 4 | workflow evolution harness | B skill 같은 one-off reconstruction 에서 반복 절차와 fixture 후보가 보임 | `_workmeta/system`, `.workflow/authoring`, `.registry`, `.workflow` |
| 5 | OpenClaw snapshot bridge | snapshot 출력 경계가 안정됨 | `guild_hall`, external host setup |
| 6 | nightly sweep advisory | mission/battle log 상태가 안정됨 | `.mission`, `guild_hall/night_watch` |
| 7 | engineering co-pilot expansion | SE assistant lane, knowledge ledger, private worklog evidence 흐름이 안정됨 | `.workflow`, `.mission`, `_workmeta`, `guild_hall/night_watch`, `.registry` |
| 8 | knowledge graph 탐지 카드 integration | retrieval-plan command contract 와 graph export 가 안정됨 | `guild_hall/knowledge_graph`, `docs/architecture/guild_hall`, `ui-workspace`, `_workmeta/system` |
| 9 | project mail history XLSX readability | project mail-history writer and metadata ledger are stable | `guild_hall/gateway`, `_workspaces`, `_workmeta/system` |
| 10 | mission 경량 등록 경로 (mission-lite / run 기반 mission 후보) | owner 가 계약 축소 vs 자동 후보 생성 방향을 정함 | `.mission`, `docs/architecture/foundation`, `_workmeta` |
| 11 | workflow/skill 사용 ledger (승급 판단 데이터 기반) | knowledge_access ledger 패턴 재사용 확인 | `guild_hall`, `docs/architecture/guild_hall`, `_workmeta` |
| 12 | AI 세션 boot digest 와 필수 읽기 체인 경량화 | owner 가 digest 의 라우팅 지위를 정함 | `AGENTS.md`, `docs/architecture/foundation` |
| 13 | foundation 문서 staleness 정리 (roadmap 구조/완료 잔존, PROJECT_MAP 표, 개선계획 현행화) | owner 가 정리 범위를 승인함 | `docs/architecture/foundation` |
| 14 | CHANGELOG rotation 규칙과 1차 분할 | owner 가 크기 예산과 분할 단위를 정함 | `docs/architecture/foundation`, `CHANGELOG.md` |
| 15 | `.workflow` lifecycle 정책과 calibrations 실행 기록 위치 재결정 | owner 가 calibration 보존 위치를 정함 | `.workflow`, `docs/architecture/foundation`, `_workmeta/system` |
| 16 | dev-worker queue archive 와 legacy candidate queue 이관 규칙 | dev_worker 큐 reader 의 flat-path 의존 확인 | `_workmeta`, `guild_hall/dev_worker` |
| 17 | doctor 플랫폼 native binary 점검 (esbuild 등) | 없음 - public-safe 단독 작업 | `guild_hall/doctor`, `docs/architecture/bootstrap` |
| 18 | bounded task 종료 절차(ceremony) 경량화 검토 | owner 가 유지/축소 방침을 정함 | `docs/architecture/foundation`, `AGENTS.md` |
| 19 | V0 문서 버전 승격/유지 기준 정의 | 없음 - 기준 한 장이면 충분 | `docs/architecture/foundation` |
| 20 | knowledge/RAG 문서 통합 색인 | 분산 문서 8+건 목록 확정 | `docs/architecture/foundation`, `docs/architecture/workspace` |
| 21 | Python 테스트 커버리지 확장 (town_crier, mail_send 등) | 없음 - synthetic fixture 로 가능 | `guild_hall` |
| 22 | 메일 수집 계정별 owner 메타 → core_mail (개인별 메일 뷰) | 메일 수집 통합 완료(자동 15분+수동 버튼); Codex 원장 스키마에서 owner 필드 위치(신규 컬럼 vs `메일함` 재정의) 확정 | `guild_hall/gateway`, `ui-workspace/apps/dev-erp`, `docs/architecture/workspace` |
| 23 | 메일 원장 시간 분할 + 증분 스캔 (무한 누적 대비) | owner 가 분할 단위(연/월) 정함; Codex 원장 표준 `soulforge.project_mail_history.private.v1` 변경 조율 | `guild_hall/gateway`, `docs/architecture/workspace`, `_workmeta` |
| 24 | Rhino x Claude Code 연결 패턴 검토 | engineering co-pilot / SE assistant lane 재개 시 owner 가 Rhino 자동화 연결 필요성을 정함; 공개 영상 source ref 를 먼저 검토 | `.workflow`, `_workmeta/system`, external host setup |
| 25 | Chat-first·MCP-first connected reasoning workspace | Owner 계정의 ChatGPT plan/model/app 제약을 재확인하고, compact 구현 패킷과 품질 gate 및 첫 read-only Smartsheet 대표 업무를 확정 | `.workflow/external_reasoning_workspace_v0`, `docs/architecture/guild_hall`, `guild_hall/ai_usage_meter`, external ChatGPT app/MCP setup |
| 26 | 산출물별 문서 검사기(content checker) — 파일 유무·해시 관측을 넘어 산출물 종류별 검사기(양식 준수·필수 절/항 누락·요구 ID 커버·논리 일관성)를 붙이고, 검사 점수를 `CoverageObservation.checker_scores[]`로 요구항목·산출물에 매칭. 자동 점수는 상한을 두고 사람 확인 항목으로만 100%(Innoslate/OpsLevel 방식). 첫 검사기 후보 = 요구사항 ID 색인 seam(2026-08-17 착수)·양식 검사(HWPX 구조 validator 재사용) | Owner 2026-08-17 제안. `PROJECT_REQUIREMENT_TRACE_MODEL_V0.md` R3(투영)·엔진 observations 자동 생성이 먼저 닫히고, 검사기별 점수 스키마·상한 규칙을 Owner가 정하면 시작 | `guild_hall/rag`(추출·검사 seam), `guild_hall/engineering_engine`(관측 입력), `docs/architecture/workspace` |
| 27 | 팀원 Engineering MCP·Vault/Forge/Guild/Watch/Bastion 통합 프로그램 | Owner가 `team_member_engineering_program` 계획 세트의 start gate를 승인하면, D27/D28/D29 등 leaf별 gate를 지키며 safe in-scope branch를 연속 실행; excluded authority/state branch만 HOLD | `docs/architecture/foundation`, `guild_hall`, `ui-workspace`, existing owner paths only |

후보 10~21 의 출처는 2026-06-12 Fable5 심층 검증이다. 10~17 의 상세 후보
패킷은 `_workmeta/system/dev_worker_queue/` 에 `status: proposed`
로 두며, owner 승인 전에는 `approved` 또는 `queued` 상태로 승격하지 않는다. 기존 `dev_worker_candidate_queue` 참조는 legacy path 로 이관 대상이다.

추가(2026-06-14, Opus 2차 검증 + owner 결정): `snapshot_to_operation_board_v0`
는 과거 active slice였으나 당시 active가 dev-erp로 바뀌며 다음 후보로 내려갔다.
2026-08-14 기준 시작 조건은 read-only AX·SE 판단과 source-bound context projection이
안정되고 owner가 snapshot UI 재개를 정하는 것이다. 내려갈 owner:
`guild_hall/snapshot`, `docs/architecture/guild_hall`, `ui-workspace`. 스펙은
위 'Active Slice 001' 절에 보존.

추가(2026-06-22, dev-erp 메일 수집 통합 작업 중 발견): 후보 22 는 개인별 메일 뷰가
비는 실제 증상이다 — 게이트웨이가 메일을 workspace 버킷(`company_mailbox`)으로 묶어
`core_mail.mailbox` 가 계정 이메일이 아니라서, ERP "보기 대상"(계정별) 필터가 매칭하지
못한다. owner 메타(`team_cli` 의 `event.metadata.mailbox.email`)는 후보 큐엔 있으나
원장 21컬럼·core_mail 까지 흐르지 않는다. 후보 23 은 단일 누적 CSV 원장(`메일_이력.csv`)이
git 추적 대상으로 무한 성장하고 scan 이 매 수집마다 전건 재파싱하는 장기 확장성 문제다.
둘 다 Codex 소유 게이트웨이/원장 스키마라 표준 변경은 Codex 규칙과 조율한다.

추가(2026-06-25, owner 가 YouTube 링크로 later work 지시): 후보 24 는
`클로드 코드에 라이노 연결하면 이런 일이 가능 합니다 | 설치부터 실전까지`
영상의 공개 source ref(`https://www.youtube.com/watch?v=1FtxZyI3UOU`)를
나중에 검토해 Rhino/3D CAD 자동화 연결 패턴이 Soulforge SE assistant 또는
engineering co-pilot 확장에 들어갈 수 있는지 판단하는 항목이다. 현 상태는
아이디어 캡처이며 영상 본문, transcript, 설치 절차 원문은 저장하지 않았다.

추가(2026-08-04, owner 지시): 후보 25 는 Codex가 Chat에서 사용할 app/MCP와
검증 가능한 데이터 도구를 먼저 개발하고, 저장소·로컬 상태가 필요 없는 조사,
계산 해석, 요구사항 정리, 대안 비교와 기본설계 초안을 ChatGPT/Deep Research/Pro
지원 lane으로 옮기는 개발 계획이다. 기존
`.workflow/external_reasoning_workspace_v0/`를 확장 대상으로 사용하고 같은 목적의
병렬 workflow를 새로 만들지 않는다.

단계는 (1) 계정별 plan/model/app·privacy 제약과 compact 구현 패킷·품질 gate 고정,
(2) 기존 Google Drive app 기반 read-only 조사·인계 pilot, (3) server-side 필터·집계·
근거 포인터를 반환하는 Smartsheet 업무형 read-only MCP pilot, (4) 직접 Codex 대비
Codex 계산 크레딧·호출 수·추가 질문·재작업·first-pass acceptance 비교,
(5) 품질 gate를 통과하고 반복 절감 근거가 확인된 system만 Outlook·PLAUD·사내 DB로
확장하는 순서다. 일반 ChatGPT 토큰은 Usage Meter에 합치지 않고 `direct Codex`와
`Chat handoff`의 downstream Codex 비용·품질만 비교한다.

첫 완료 기준은 read-only 연결 업무 1종에서 출처 추적성, 저장소 상태 허위 주장 0,
외부 write 0, 사전 acceptance 통과를 유지하면서 direct Codex 기준선과 비교 가능한
사용량·재작업 evidence를 남기는 것이다. ChatGPT Work를 비용 우회로로 취급하거나,
raw transcript/private payload를 넘기거나, write action·default route·조직 authority를
활성화하는 일은 이 후보의 첫 단계 범위 밖이다.

Owner 재확인(2026-08-15): 후보 25와 이후 Plugin/App 도입은 위 AX Context-to-Execution
북극성의 연결부를 가속하는 lane으로 해석한다. provider별 인증·검색·pagination·webhook·
승인된 action transport 같은 비권위 commodity adapter는 검증된 managed App/Plugin을
우선할 수 있고, custom MCP/adapter는 관리형 연결로 채울 수 없는 bounded gap에만 만든다.

Soulforge는 cross-source identity, Context/세계수, provenance·temporal correction,
Evidence/Claim, derived ACL, Task·authorization·verification·receipt 계약을 계속 소유한다.
MCP는 queue나 판단 authority가 아니라 query/control/result/evidence/receipt interface다.
Plugin을 제거해도 Task state와 source/revision refs, identity, provenance, authorization,
execution receipts가 남아야 한다(`Plugin deletion test`). provider-native task·memory·history·
`done`을 Soulforge 정본으로 자동 승격하거나 새 shadow state/evidence plane으로 쓰지 않는다.

AI·agent 데일리 브리핑은 이 roadmap의 후보·active slice 우선순위를 재검토하는 입력이다.
실제 정보 공백, authority 영향, provenance/ACL·보안, 총 통합비용과 exit 경로, Soulforge
acceptance evidence를 대조해 `REPLACE|ACCELERATE|COMPLEMENT|WATCH|HOLD|REJECT`로
분류한다. 이 판단만으로 Plugin 설치, TASK·canon·route 생성, 외부 action 또는 제품축 기술수락을
자동 실행하지 않는다. 상세 CEO 책임과 보고 경계는
`DEVELOPMENT1_TEAM_AND_AI_PLATFORM_ORGANIZATION_V0.md`가 소유한다.

## SE Engine 공통 지식 외부 shadow 평가 (2026-08-12 Owner 지시)

목적은 실제 프로젝트 자료를 넣기 전에 동일한 공통 체계공학 자료와 완전 합성 case를
사용해 결정론 Engineering Engine 결과를 Gemini Notebook / NotebookLM의 source-grounded
advisory 결과와 교차 비교하는 것이다. Notebook을 Engine 내부 provider나 truth owner로
연결하지 않으며, 이 lane은 Engine 개발·RAG/Wiki 개발과 병렬로 진행할 수 있다.

현재 public slice:

- `guild_hall/engineering_engine/subjects/common_se_corpus_projection.mjs`: exact
  revision/hash·authority·ACL·bounded selector가 붙은 immutable common-SE projection을
  기존 Engine Expected State 입력으로 바꾸는 읽기 전용 adapter.
- `guild_hall/engineering_engine/evaluation/manual_shadow_comparison.mjs`: Engine 7행,
  Notebook-only 21회, synthetic state pack을 유일한 차이로 둔 hybrid 21회를 사람이
  검토한 sidecar 기준으로 비교하는 결정론 scorer.
- `docs/architecture/workspace/examples/se_core_eval/`: public-safe source eligibility와
  synthetic projection shape. 실제 source body, Notebook answer, 계정·경로·secret,
  프로젝트 payload는 포함하지 않는다.

실행 순서와 gate:

1. 권리가 확인된 NASA/DoD source의 exact bytes·revision·SHA-256을 private knowledge
   worksite에서 materialize하고 동일 membership을 동결한다.
2. seven-question set, fully synthetic case/state pack, rubric, Engine reference와
   evaluator-only gold를 서로 분리해 동결한다.
3. Engine adapter와 7개 reference를 독립 검증한다.
4. Owner가 Notebook 계정·전용 notebook·standalone selected-source-grounded mode를
   직접 확인한 뒤 동일 source와 질문으로 수동 shadow run을 수행한다. web·agentic·
   cross-app·cross-notebook context는 섞지 않는다.
5. 사람이 answer/citation을 검토하고 raw answer가 아닌 normalized sidecar만 scorer에
   전달한다. 결과의 최대 claim은 `external_advisory_candidate`다.

DAPA guidebook은 로컬 materialization 여부와 별개로 외부 AI 재사용 권리가 확인될 때까지
`HOLD`다. ISO 본문은 별도 허가 전 metadata/link-only다. 이 slice는 Notebook 로그인,
source upload, 자동 answer 회수, accepted context, P5/P6/P7/P8, ERP Task, runtime·MCP·UI
활성화 권한을 부여하지 않는다.

## 구체화 규칙

큰 방향이 아래 조건을 만족하면 각 개발 항목으로 내려간다.

1. owner 가 분명하다.
2. 입력과 출력이 분명하다.
3. private/raw/secret 경계가 분명하다.
4. 완료 기준이 한 문장으로 적힌다.
5. 검증 방법이 있다.

내려가는 위치는 아래를 따른다.

| 구체화 대상 | 저장 위치 |
| --- | --- |
| 실제 실행 계획 | `.mission/<mission_id>/` |
| UI 구현 세부 | `ui-workspace/docs/` 또는 UI package 내부 |
| gateway 기능 세부 | `docs/architecture/guild_hall/`, `guild_hall/gateway/` |
| workspace/private data contract | `docs/architecture/workspace/` |
| project-local evidence | `_workmeta/<project_code>/reports/**` |
| reusable skill/workflow 후보 | `_workmeta/<project_code>/reports/procedure_capture/**` 에 먼저 기록 후 `.registry` 또는 `.workflow` 로 승격 |
| project 가 불명확한 workflow evolution 실험 | `_workmeta/system/reports/procedure_capture/workflow_evolution/**` 에 먼저 기록 후 public-safe 요약만 `.workflow/authoring` 으로 승격 |

## 현재 보류

- repo 3개 구조를 single private monorepo 로 통합하지 않는다.
- 팀원 공유를 고려해 public-safe core, owner private metadata, continuity state 분리 구조를 유지한다.
- OpenClaw 는 원본 repo 접근이 아니라 snapshot bridge 이후에 다시 판단한다.
- UI polish 보다 read-only data contract 를 먼저 잠근다.

## 계획 대비 변경 기록 (plan delta log)

계획서(마스터플랜·이 로드맵)와 실제로 만들어진 것 사이의 차이를 사람이 추적할 수 있게 남기는 표다.
행은 append만 하고, 각 행은 "계획이 말한 것 → 실제로 한 것 → 차이·이유 → 근거"를 짧게 적는다.
raw 산출물·private 수치는 `_workmeta` 영수증을 가리키고 여기엔 상태값과 public ref만 둔다.

| 날짜 | 계획 항목 | 계획이 말한 것 | 실제로 한 것 | 차이·이유 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-17 | M2-2 첫 실제 pilot | Owner-frozen launch/packet/grant/root 고정 뒤 수동 zero-write pilot 1회 | KVDS(P26-014) packet(120_CDR 14 requirement·관측 5·논리 역할 6·common 1)으로 runner 1회 PASS, domain UNKNOWN | 관측 5건은 사람이 폴더 1곳에서 손으로 넣음(자동 공급은 P4 몫); 로드맵 순서 그대로 | private run `ax_se_project_context_pilot_20260817_01`; 마스터플랜 CURRENT 표 "맥락·세계수·할일" 행 |
| 2026-08-17 | PDF 근거 읽기(admission+tracer) | Feature-OFF 합성 검증만 | 실제 KVDS 계약자료 텍스트 PDF 2건 admission+tracer 각 1회 PASS(인용 3+3) | 8-16 HOLD 원인은 driver의 상대경로 launchPath였음(프로그램 결함 아님) → 절대경로 preflight를 driver 규칙으로 고정 | private run `project_pdf_rag_pilot_20260817_01` |
| 2026-08-17 | MCP(내려받기·올리기·검토·승인) | 계획에 MCP 단계 번호 없음(P5D·P8·AX01/AXCP01·D28/D29/D35에 분산) | 개인 ERP MCP에 feature-OFF 조회 확장 3종(agenda no-due bucket, reviewer read-only, audit token ref) 착지 `main@8d702252`; 승인/거부 MCP는 D04로 미구현 | 계획이 비워둔 "검토자 read-only"를 앞당김(활성화는 여전히 D28/D29·Owner) | CHANGELOG 2026-08-17 항목, ERP-MCP-V0.md |
| 2026-08-17 | 과제 맥락 메모리 구조(Owner 질문) | 계획에 결정 없음(PROJECT_CONTEXT_GRAPH_MODEL·M2-3A만) | 설계 초안 `PROJECT_REQUIREMENT_TRACE_MODEL_V0.md`(DRAFT/canon_candidate): 사실 원장+재생 투영+수락 게이트+얇은 카드, Graph DB 미도입 트리거, RTM 계산 규칙, D37~D41 제안 | 새 결정 항목 D37~D41 제안(Owner 승인 전 후보) | 해당 문서 |
| 2026-08-17 | 마스터플랜 문서 정합 | CURRENT 표 유지 지침 :99-111 | :30 CURRENT 셀 08-17 보정, :56 HISTORICAL 태그, C09A evidence 정정, 남은 운영 게이트에 P6 삽입 | 07-31 이후 갱신 누락분 정정 | 이 커밋 |
| 2026-08-17 | P4/M2-3 첫 조각 실측 | P4는 M2-2 pilot 뒤 착수, RAG/Wiki는 revision 영수증 필수 | 요구사항 ID 색인 seam(`guild_hall/rag/project_pdf_requirement_index.mjs`, feature-OFF·zero-write) 착지 `main@1262dfd8` 후 pinned KVDS 요구사양서에 1회 실행: **118개 ID / 33쪽**, TBC 19·TBD 9, 중복 ID 4, 라벨 없는 언급 18, 라벨만 18 | 계획엔 없던 "측정 조각"을 앞세움(P4 크기 산정용); 첫 시도는 transient admission HOLD 후 재시도 PASS; profile v0.1 후보(단위 대괄호 제목 오탐·언급-only 처리) | private run `project_pdf_requirement_index_pilot_20260817_01`(pending Owner ratification), index는 project plane `reference_payloads/knowledge_extract/20260817_requirement_index/` |
| 2026-08-17 | M2-2 pilot 관측 확대(run 02) | "관측 확대 뒤 2차 pilot" (CURRENT 표 남은 연결) | run 01의 미관측 9개 중 4개(HRS·SRS·HDD 최종본, STP)를 03_Out 직접 확인으로 absence_confirmed 관측(증거=슬롯 카운트 JSON) → runner 1회 PASS: satisfied 5/missing 4/unknown 5, assessment UNKNOWN, mission 3(CDRL 취합·3D STEP·발표자료 취합) | Owner 야간 포괄 승인 근거로 실행(pending ratification); 남은 unknown 5는 STR·3D STEP·시험문서·CDRL·발표자료 취합(발표자료는 PART3 부분본만 존재) | private run `ax_se_project_context_pilot_20260817_02` |
| 2026-08-17 | 요구사항 ID 색인 profile v0.1 | — | `kr_defense_spec_v0_1` 추가(요구사양 라벨 뒤 제목·단위 대괄호 건너뜀·mentions_by_id·malformed_labels·id_family) `main@08c2ba0d`, KVDS 재실행: 118행 동일, 제목 24행 정상 추출, mention 108키 | 실측 품질 문제 3건을 결정론 규칙으로 정정 | private receipt(run project_pdf_requirement_index_pilot_20260817_01) |
| 2026-08-17 | Board classic engine view | 33모듈 topology 소비 | ENGINE_LANES 29→33·테스트를 tracked artifact에서 유도·README 수치 정합 `main@d8c3fa8e`; phase_1_integration_receipt는 비결정론(run_id 시각)+bundle 외부라 미갱신(사유 기록) | agent 위생 | CHANGELOG 08-17 항목 |
| 2026-08-17 | 요구사항 추적 모델 R1(순수 함수) | 설계 §8 R1: 계약 고정 + `computeRequirementCoverage` + fixture(1주차) | 당일 착지 `main@ee1002b1`: `guild_hall/requirement_trace/requirement_coverage.mjs`(bitemporal replay·coverage cells·fail-closed 상태·orphan 보존·gate 진입/성공 분리, kernel 어휘 재사용, fs/clock/net 0), fixture, 테스트 18/18, relation matrix `canon_candidate` 관계 3 | 설계 §5.3과 다른 판단 3건 소스 주석에 명시(supersession 2-pass, known_at≥valid_at 미강제, firstMark=MARK_ORDER 최소); D37~D41 Owner 결정 전 candidate | CHANGELOG 08-17 항목 |
| 2026-08-18 | Owner 결정 D37·D38 + 야간 실행 ratify + push | 야간 요약의 결정 5개 | Owner 승인(추천안 그대로): 야간 실행 2건 ratify, D37 = 자동 추출 요구 ID는 candidate만, D38 = Needs는 기존 `stage_expected_artifact_policy` 확장(새 store 없음), path-policy 48건 정리는 보류, public main push(`bc4b4915..d82d755a`) | `_workmeta` 실행 영수증은 launch 파일의 절대경로 pin이 workmeta path-policy에 걸려 커밋 보류(정책 판단 필요) | 설계 문서 §8.2, private upload receipt 2026-08-18 |
| 2026-08-18 | 요구사항 추적 R2 준비(coverage input builder) | 설계 §8 R2: 원장 writer + owner 승인 소량 pin 시드(2주차) | writer 대신 순수 **입력 생성기** `guild_hall/requirement_trace/coverage_input_builder.mjs` 착지 `main@fe13cb40`: 요구 ID 색인(candidate) + Needs 정책(`soulforge.requirement_needs_policy.v0`, D38 확장 계약) + 산출물 존재 관측 → R1 입력·manifest·영수증; 중복 ID 전행 보류(D40)·기능코드 미매핑 보류·문서 revision 불일치 시 stale·cutoff 역전 거부; 테스트 26 + R1 18 = 44/44; fresh 3-lens 리뷰 → major 1건(cutoff 역전 fail-open) 수정 | 원장 writer는 아직 없음(R2 본체는 Owner의 Needs 정책·중복 4쌍 판정 뒤); "시드는 owner pin부터"라는 설계 문구와 달리 118 candidate 전량을 **candidate 라벨로** 통과시켜 규모를 측정함 | CHANGELOG 08-18 항목, requirement_trace README |
| 2026-08-18 | KVDS 첫 커버리지 실측(R1 통과) | "요구 118개 + Needs 정책으로 coverage 입력 자동 생성 → R1 통과" (아침 다음 액션) | PASS(결정론 2회 동일): 118행 → 108 admitted / 보류 10(중복 4쌍 8·템플릿 예시 1·잘린 ID 1); Needs 170·관측 fan-out 126; 셀 = 충족 31 / 결손 95 / 미시도 44 / Needs 미선언 52; 요구 단위 = missing 12 / unknown 96(unknown 우선 규칙); HRS·HDD·SRS·STP 부재가 결손 95의 전부, 시험문서 슬롯 미관측이 미시도 44의 전부 | Needs 정책은 후보(PETB 14건, 기능코드 정의는 요구사양서 §2.3.2 근거·산출물 매핑은 SE 후보), 파일 존재=충족 semantics는 Owner 08-17 발언 근거(비교용 inconclusive 변형도 기록); RTM 주장 없음(claim observed) | private run `requirement_trace_coverage_pilot_20260818_01`; 산출물은 project plane `TB_Master_Doc/06_validation/requirement_trace_20260818_01/` |
| 2026-08-18 | 공용 규칙 원천 검증(Owner 질문: 폴더트리 variant가 사업유형별로 맞나) | 로드맵에 없음(폴더트리 스킬 variant는 "public-safe 기본형" 가정) | 방사청·국방부 정본 13종을 공식 출처에서 확보(신규 7: SE 기술검토회의 가이드북 2024/2017·SE 기술관리 실무지침서·국방 표준화 실무지침서·현존전력 지침 883호·선행연구 수행지침 881호·국방기술 연구개발 업무처리지침 974호)하고 variant 4종을 항목별 대조 → `.registry/skills/se_foldertree_generate/codex/references/source_verification_v0.md`(DRAFT): 체계개발 spine 부합(필수 17건 누락), 탐색개발·선행연구는 체계개발 명명틀 차용(재기준), 운용연구개발 트랙 분리, 응용연구 제안 v2 | 기본형 3종의 "public-safe baseline" 가정이 정본과 어긋남을 확인; 2024 가이드북은 산출물이 의무 아닌 조정 대상임을 명시 → 엔진 규칙에 필수/권고/N-A 구분 필요 | private intake receipt `dapa_se_guidebook_intake_20260818`, private report `se_foldertree_variant_source_verification_20260818`, CHANGELOG 08-18 항목 |
| 2026-08-18 | 엔진 단계 규칙 원천 통일(Owner: "KVDS만 끼워맞추는 게 아니라 공용으로") | 로드맵에 없음(엔진 stage policy는 과제별 손작성 슬롯) | 설계 `SE_STAGE_RULE_SOURCE_MODEL_V0.md`(DRAFT: L0 정본·L1 variant 스펙+기계 필드·L2 과제 overlay·L3 컴파일러, 표준어, D42~D45) → 구현: 체계개발 스펙 v0.8(기계 필드 145 task, 필수 17건 추가, `compiled/*.json` 내보내기+드리프트 가드 `validate:se-foldertree-compiled`) + 엔진 `stage_rules/` 컴파일러(순수 함수, 어휘 101 토큰+prime_ 규칙, overlay add/alias/N-A/condition, 엔진 validator 왕복, `validate:se-stage-rules` 17/17) | 원천 하나(폴더트리 스펙)·엔진은 읽기만; 코더 2명 병렬 후 통합 시 불일치 4건(status 값·applies_when 리스트·added_by 날짜·확장 토큰) 컴파일러 쪽에서 수용 | CHANGELOG 08-18 항목 3건, private run `se_stage_rules_kvds_120_cdr_20260818_01` |
| 2026-08-18 | KVDS 120_CDR 표준 vs 발주처 대응표 | 설계 §7 3단계(runner 1회 포함) | 컴파일 1회 PASS(결정론): 발주처 14슬롯 = 표준 유래 5·표준 강화 2(HRS/SRS 최종본)·발주처 추가 7; 발주처가 요청 안 한 표준 항목 11 중 **규정 필수 6**(ICD·사업중간점검·MRA·RAM 분석·핵심부품 공인시험 성적서·CDR 회의록) → 엔진 요구 25 | runner 실행·packet 재생성은 미수행(R3 packet 생성기 몫); Needs 정책 표준어 치환도 다음 조각 | private run `se_stage_rules_kvds_120_cdr_20260818_01`, project plane `TB_Master_Doc/06_validation/stage_rules_20260818_01/` |
| 2026-08-18 | 방사청·국방부 정본 색인 | 08-15 intake는 원문만(rag/index 미구축) | 정본 12종에 source card + sync-ready 작성(공식 공개 출처 owner rule), `guild_hall/rag` source-text-index 12건 생성·검증(청크 2,056), 검색 스모크 1회(규정 제70조③·제78조⑧ 인용) | 엔진·보고서가 규정 원문을 인용할 수 있는 기반; docling 추적 sidecar·품질 리뷰는 미수행 | private receipt `_workmeta/system/reports/rag/source_text_indexes/dapa_common_sources_index_build_20260818.json` |
| 2026-08-18 | 요구사항 추적 R3 전반부(packet 생성기) + M2-2 run 03 | 설계 §8 R3: 엔진 packet 생성기 + zero-write runner 1회(3주차) | 공개 순수 생성기 `guild_hall/engineering_engine/stage_rules/pilot_packet_generator.mjs`(`main@1150ca3d`, 테스트 14, se-stage-rules 31/31): 컴파일된 표준+발주처 정책(25 요구)과 산출물 관측 → pilot packet + launch material; KVDS run 03 runner 1회 PASS: assessment UNKNOWN, 25 요구 = 충족 5 / 결손 4 / 불명 16, mission 후보 3(핵심부품 성적서→qa_reviewer, DBDD→sw_engineer, ICD→systems_engineer) | 엔진이 처음으로 손작성 14슬롯이 아니라 표준 규칙 기반 25항목으로 판단; 불명 16 중 11은 발주처가 요청 안 한 표준 항목(규정 필수 6 포함) → 관측 확대가 다음 | private run `ax_se_project_context_pilot_20260818_03`(decision_record·receipts), Needs 정책 표준어 치환 run `requirement_trace_coverage_pilot_20260818_02`(수치 동일) |
| 2026-08-18 | 경로 길이 정리(Owner: 긴 경로 허용 안 함) | 계획에 없음 | 정책 `path_length_policy`(200/60/60/해시16/슬러그반복 금지) + `validate:path-length` + guard 통합(`main@abb525c8`); 전 plane 감사(24만 파일)·의존성 참조 스캔 후 미참조 백업·보존본 52,896개/8.4GB를 `_workspaces/_trash_260818/`로 이동(9-17 삭제 예정), 폴더 7종 이름 축약 → 260자 초과 4,463 → 2(로컬 LibreOffice 캐시) | 삭제 아닌 이동; 안 파일명 불변; 참조는 옛 인벤토리·핸드오프뿐 | private `path_length_audit_20260818/{path_length_audit,trash_move_manifest}` |
| 2026-08-18 | 규칙표 계층 분리(Owner: "LIG 계약 항목이 섞이면 재사용 못 한다") | 설계 L1/L2는 개념 분리만 | 같은 스펙에서 방사청 공통 기준선(131)·LIG 덧씌움(14)을 따로 내보내는 exporter + 드리프트 가드 3벌, 컴파일러에 provenance 필드·prime_contract 강등 예외 → 통합 경로와 계층 경로가 KVDS 120_CDR **27항목**으로 동일(이전 25 = LIG 계약 2건이 unsupported로 강등돼 있던 것) | 물리 분리로 다른 발주처 재사용 가능; run 03(25항목)은 27 기준으로 재실행 대상 | CHANGELOG 08-18 컴파일러 항목 bullet, 스킬 README/variants.md |
| 2026-08-18 | ① 일반 SE 바닥층(Owner: "체계공학이면 최소 이건 있어야") | 로드맵에 없음(공통 스타터 45줄뿐, 체크리스트 행 0) | 공개 원문 3종(NASA NPR 7123.1D·DoD SE Guidebook 2022·NASA SE Handbook) 확보·추출 → 스펙 `generic_se_base`(9게이트 229 task, must_have 132) + compiled JSON + 컴파일러 등급 `general_se_guidance`·어휘 30 + 테스트 35/35 (`main@77e53af2`); CDR 비교 ① 38 / ② 16 / KVDS 27, 공유 9 | 4층(일반SE·방사청·발주처·과제)이 전부 실체를 가짐; ①↔② 토큰 별칭 정합은 다음 | private intake `generic_se_sources_intake_20260818`, compare receipt `se_stage_rules/generic_layer_cdr_compare_20260818` |
| 2026-08-18 | 엔진 개발 매뉴얼(Owner: "항목을 어떻게 구했는지 기록에 있어야, 다른 LLM이 이어받게, 책처럼") | 로드맵에 없음(설계 문서·README·CHANGELOG에 흩어져 있음) | `guild_hall/engineering_engine/manual/` 9장(목적·4층·항목 도출 방법·어휘·컴파일러·요구추적·실행기록·결정·다음 작업) + ① 도출 기록 `references/generic_se_base_derivation_v0.md`(행별 인용·정정·미결, 스크립트 생성) + 도출 작업 파일 private 보관·영수증; 출처 정정(① 행은 NPR·DoD SEG만 인용, Handbook은 추출만·미반영) | 정본이 아니라 정본의 지도; 202행 = 셀 수(산출물 종류 100), must_have 124(합성 132→critic 정정) | receipt `se_stage_rules/generic_se_base_derivation_20260818` |
| 2026-08-18 | 엔진 판단 전 단계 확대(Owner: "엔진 판단 단계를 전부 다 만들자") | R3: CDR 1단계 packet→runner 1회 | P26-014 SRR·SFR·PDR·CDR·TRR·FCA·PCA 7단계 각각 ②+③+④ 컴파일→packet→zero-write runner 1회(재실행 바이트 동일): 요구 104 = 충족 5/결손 4/불명 95; CDR 27 정책 재실행(5/4/18) | 다른 단계는 관측을 아직 안 넣어 불명; 로컬 폴더 03_Out 스캔은 산출물 0. 관측 확대(문서 색인·메일 첨부→artifact_observations, 자동 분류는 candidate)가 다음 조각. 000_REF 비엔진 단계, 240_LL 정본 필수 없음 | private run `ax_se_project_context_pilot_20260818_04`, compile `stage_rules_20260818_02` |
| 2026-08-20 | Task Execution Core 최소 POC + Linear 백업 범위 검토 | P5→P6→P7→P8 뒤 승인된 TaskDriver/TaskEngine writer와 AgentRun 후속 gate | Drive v3.1을 우선해 Linear Official Todo를 읽기만 하는 feature-OFF Module을 dev-ERP에 격리 구현: Candidate 차단, Work Brief·Executor·authority gate, task별 active AgentRun 1개, append-only provider/run event, Waiting/terminal receipt, crash/retry HOLD, idempotent replay. CSV/Sheets/API/webhook의 Linear 백업 데이터 범위를 문서로 검토 | phase를 앞당긴 operational activation이 아니라 public-synthetic contract harness. `core_item`·Linear·MCP·scheduler·외부 effect·live backup 0, P5~P8 acceptance 0 | `ui-workspace/apps/dev-erp/docs/task_execution_core_poc/`, `validate:task-execution-core-poc` |
| 2026-08-20 | Linear 백업 support-lane 시작 순서 확정 | 백업은 Task 실행과 별도라는 구조만 있었고 시작 Gate가 없었음 | 실제 기능은 여전히 0. Task Engine 마스터플랜 §12 `LB1`의 단일 exact start Gate 뒤 one-shot read-only snapshot/API pilot을 P5 전 병렬 지원선으로 시작하고, restore 검증 뒤에만 예약 자동화를 별도 승인한다 | 백업 성공은 accepted Context·TaskIntent·TaskDriver·AgentRun 또는 Linear writer 준비 완료를 뜻하지 않음. live Task 실행은 P5→P10 순서 유지 | `LINEAR_BACKUP_SCOPE_REVIEW.md`, Task Engine 마스터플랜 §12 split lanes |
| 2026-08-20 | Engineering Engine release manifest 안전보정 | 새 `mcp/stage_rules/observation/guidance`가 release manifest 범위 밖이었음 | Git-index exact 184-file allowlist, untracked·omission·duplicate·malformed-NUL fail-close, explicit generation-base provenance와 MCP compatibility consumer를 구현·통합. fresh 독립검토 ACCEPT | manifest 28/28, MCP 135/135, stage 53/53, observation 67/67, guidance 55/55. MCP 등록·runtime·write authority는 계속 OFF | `guild_hall/engineering_engine/{tools,tests,topology,mcp}`, CHANGELOG 08-20 |
| 2026-08-20 | P4 project PDF RAG·Thin Wiki projection candidate | P4 첫 조각은 요구 ID zero-write 색인뿐이고 trusted retrieval/Wiki/P5 input seam 없음 | 이미 admitted된 PDF revision 하나에서 exact trusted digest를 요구하는 project-local RAG·Thin Wiki sibling candidate와 P5 non-accepted input을 생성·조회하는 public feature-OFF Module 통합. recomputed forgery·getter/alias·supersession-gap 방어, fresh+Opus 검토 후 기술 ACCEPT | main 환경에서 focused 13/13, root isolation 21/21, 기존 PDF ingest/launch/admission/tracer/index 전부 PASS. 실제 project persistence·KVDS body pilot·P5 acceptance는 HOLD | `guild_hall/rag/project_pdf_knowledge_projection.mjs`, focused validator, CHANGELOG 08-20 |
| 2026-08-20 | P4 bounded actual-pilot runner foundation | projection candidate는 있었지만 actual launch/authority/output을 한 번의 create-only 시도로 묶는 executor가 없었음 | raw-byte-pinned authority packet을 body-free attempt claim으로 admission 전에 소비하고 admission/projection 각 1회, exact candidate+claim 두 파일만 허용하는 feature-OFF runner/CLI 통합. pre-write HOLD replay·partial publish·foreign binding·payload echo를 fail-close | fresh Level-2 재검토 ACCEPT; main runner 13/13, admission 17/17, projection 13/13. actual KVDS 실행·운영 RAG/Wiki writer·P5 acceptance는 HOLD | `guild_hall/rag/project_pdf_knowledge_pilot_runner*.mjs`, CHANGELOG 08-20 |
| 2026-08-20 | P5 authentic-producer generation candidate foundation | acceptance gate는 이미-built input set만 검사했고 P4/M2-2/timeline을 조립하는 deep Module이 없었음 | authentic producer outputs + Owner context contract를 complete request pin에 결속하는 pure candidate builder 통합. gap/supersession/time/crosswalk/secret/coherent-repin을 fail-close하고 review-ready 또는 exhaustive HOLD만 반환 | fresh Level-2 폐루프 ACCEPT; main P5 10/10, P4 13/13, M2-2 42 pass/1 platform skip, timeline 24/24. registered-human acceptance·writer epoch 실바인딩·generation advance·ERP/P6는 HOLD | `guild_hall/engineering_engine/kernel/project_context_generation_candidate.mjs`, CHANGELOG 08-20 |
| 2026-08-20 | Linear LB1 offline backup contract candidate | 백업 범위·시작 Gate만 있고 collector/manifest/restore contract 0 | `backup_controller` 아래 feature-OFF 순수 Module로 immutable run/revision, deterministic coverage, duplicate/conflict, partial/failure, forged coverage와 restore completeness를 합성 검증. fresh 독립검토 ACCEPT | LB1 11/11, backup-controller 55/55; raw/path-like error code, deterministic revision ID와 status consistency hostile-run controls PASS. provider/storage/network/scheduler/Task/P5 effect 0; actual Linear/Drive/NAS와 LB1 Gate는 HOLD | `guild_hall/backup_controller/linear_lb1*.mjs`, CHANGELOG 08-20 |
| 2026-08-20 | Linear LB1 exact Owner start Gate | LB1 시작 조건은 문서 표에만 있고 Owner 결정·workspace/credential·Drive target·보존/복원 정책을 기계적으로 결속하지 못함 | `evaluateLinearLb1OwnerGate(packet, trustedExpectedPin)` pure Module로 full packet pin, pending/approved 결정, read-only scope, create-only Drive target, retention/RPO, partial HOLD와 human restore acceptance를 fail-close. 제안 기본안은 ref·Owner 승인 부재로 명시 HOLD | focused 8/8, backup-controller 63/63. provider/storage/network/filesystem/scheduler effect 0; 실제 Linear/Drive access·LB1 run은 exact Owner 승인 전 HOLD | `guild_hall/backup_controller/linear_lb1_owner_gate*.mjs`, CHANGELOG 08-20 |
| 2026-08-21 | P4 direct-path preparation gate | 실제 P4 시도가 OneDrive reparse 가능성 아래 admission HOLD로 소비됐고, 새 authority packet 생성 전 direct/non-reparse 사전검사와 정본 packet builder가 없었음 | authentic admission launch inspection을 재사용해 launch/root/ancestor/leaf/output을 metadata-only 검사하고 기존 authority-packet-v0만 canonical 생성하는 Preparation Module 통합. request/accessor·forged grant·fsutil 4390/path 혼동·packet drift를 fail-close | Flash 3.7 High builder + Opus 5 반복 executable review 최종 ACCEPT; main preparation 18/18, runner 13/13 PASS. PDF body/copy/write 0; actual new authority·local staging·P4 실행은 Owner gate HOLD | `guild_hall/rag/project_pdf_knowledge_pilot_{packet_contract,preparation}.mjs`, CHANGELOG 08-21 |
| 2026-08-21 | Linear LB1 v2 feature-OFF Bound Runner | v1은 metadata/hash 중심 합성 계약이라 whole-workspace body/history와 stored-byte restore, durable claim ordering을 표현하지 못했고 Gate도 실제 실행 Adapter와 결속되지 않았음 | v1을 보존한 별도 v2 18차원 snapshot/manifest/restore + full-packet Gate v2 + async Bound Runner 통합. claim-before-read, exact synthetic Adapter refs, limits/expiry, create-only memory store, exact-byte readback, body-free result와 post-claim `HOLD_CONSUMED` 고정 | Flash 3.7 High builder + Opus 5 반복 executable review 최종 ACCEPT; main v2 44/44, backup-controller 107/107 PASS. 실제 Linear/Drive/provider/storage/filesystem/scheduler effect 0; external Adapters·Owner binding·human restore는 HOLD | `guild_hall/backup_controller/linear_lb1_{v2,owner_gate_v2,one_shot_runner,synthetic_adapters}.mjs`, CHANGELOG 08-21 |
| 2026-08-21 | Owner 완료 지도와 예상 기간 고정 | 기반 코드 완료와 actual evidence·운영 activation이 한 문장에 섞여 전체 진행도를 오해하기 쉬웠음 | `C0~C6`으로 code foundation→actual P4/Linear→accepted P5→proposal shadow→bounded mutation canary의 의존관계와 세 종료선을 명시 | 현재 목표는 병렬 1~2 작업주 추정(외부 승인·계정 대기 제외). plan-only이며 runtime·authority·write activation 0 | 이 문서의 `Owner 완료 지도`, Task Engine 마스터플랜의 owner-facing completion horizon |
| 2026-08-21 | Chat 1시간 Shadow Bot 검증·Worker 접점 계획 | Chat Scheduled Task의 live-source 추론과 Soulforge C3/C5 제품 기반이 같은 완료 상태처럼 보였음 | Owner-observed Bot은 실제 판단·오류 표본을 만들고 Worker는 Cycle Contract·Decision Ledger·Shadow Evaluator·Accepted Context Query를 제공하도록 역할을 분리. retrieval/reasoning/effect 세 지표와 B0~B5 gate, Flash-ready/미결정 항목을 Task Engine 마스터플랜에 고정 | plan-only. 실제 Scheduled Task 설정·app 권한·run history는 독립 미확인이고 Gmail/Linear mutation·C6 activation 0 | Task Engine 마스터플랜 `Chat 1-hour Shadow Bot lane`, CHANGELOG 08-21 |
| 2026-08-21 | Grill Me `HB-DEC-01` 점진 실행 C 채택 | Shadow-only 유지와 전면 자동 실행 사이의 장기 권한 방향이 미결이었음 | 연결된 업무 전반은 계속 Shadow 판단하되 실제 mutation은 C5 품질근거를 통과한 저위험 task type·capability부터 하나씩 확대. 월간 자료수합은 첫 후보 예시이며 전체 Bot 범위가 아님 | 방향만 확정. 첫 task type, Source scope, app effect, ledger, Prompt, threshold는 후속 결정이며 현재 Linear mutation·C6 activation 0 | Task Engine 마스터플랜 Grill Me decision register, Owner conversation decision 2026-08-21 |
| 2026-08-21 | Voice-First Bot/Agent 운영모델 v0.2 확정 | Voice·Project Agent·Portfolio·Worker·Skill 학습과 권한 사다리가 여러 대화·초안에 흩어져 있었음 | Thin Voice Context+Deep Project Context, Project 격리/Portfolio projection, `JM6×A0~A6`, Project×TaskType×Action Canary, Voice receipt 4층, Decision Ledger, Meaningful Work Unit→Skill/Workflow/Party 승격과 VF-0~VF-8 실행순서를 하나의 Owner-confirmed 정본으로 고정 | plan finalization이며 실제 Chat task, app permission, Hermes/Grok install, external account, runtime, Linear mutation은 0. exact runtime binding은 각 실행 packet에서 별도 승인 | `SOULFORGE_VOICE_FIRST_BOT_AGENT_OPERATING_MODEL_V0_2.md`, Task Engine master plan, CHANGELOG 08-21 |
| 2026-08-21 | `VF-1/C0` mutation default-OFF | 4300 launcher의 auto-intake/autosync 암묵 기본값을 제거하고 합성 restart/launcher RED→GREEN으로 고정 | `start-windows.bat`의 두 port-derived enable만 제거하고 explicit env·PowerShell switch opt-in은 보존; focused 2/2, launcher 13/13, core 290/290, fresh independent review `ACCEPT` | live runtime·Scheduled Task·Linear/Gmail/Slack/Calendar/Drive mutation 0; `VF-2` 미착수, actual mutation canary는 `C6`와 별도 Owner 승인 전 `HOLD` | `start-windows.bat`, `run_dev_erp_background_launcher.test.mjs`, `MAIL_TO_TASK_INTAKE.md`, Task Engine master plan |
| 2026-08-21 | `VF-2/VF-3` Shadow Cycle·Decision Ledger foundation | Hourly Cycle Contract, in-memory Project Decision Ledger, Portfolio Projection, ShadowEvaluator가 문서 제안만 있고 코드·회귀시험은 없었음 | required-source manifest·A0 선언·payload/graph bound를 fail-close하는 branded cycle, per-project cursor/digest chain·replay/NO_OP/supersession, identical-horizon typed portfolio, ground-truth 분리 quality receipt를 public-synthetic 순수 모듈로 구현 | 53/53 + Task Core 28/28, fresh Opus 5 4회 revision 뒤 final `ACCEPT`; 실제 Scheduled Task prompt/read/app binding, persistent writer, live quality metric, external effect 0/HOLD | dev-ERP `hourly_shadow_cycle_contract`, `project_decision_ledger`, `portfolio_decision_projection`, `shadow_evaluator` |
| 2026-08-22 | `VF-4/C2` Linear LB1 runtime adapter foundation | v2 Gate/Runner는 synthetic adapter만 있었고 actual-client binding seam과 truthful effect evidence가 없었음 | capability-allowlisted synthetic-only reader/storage/claim binding, immutable scope/target/authority, runner result v3 effect-evidence reconciliation을 구현 | adapter 22/22, LB1 50/50, Backup Controller 135/135, fresh Opus 5 adapter+runner `ACCEPT`; authorized real clients·one-shot·human restore·LB2 scheduler는 0/HOLD | `linear_lb1_runtime_adapters*`, `linear_lb1_one_shot_runner*`, Backup Controller README |
| 2026-08-22 | Hourly Multi-App Work Intake Bot v0.4.0 Owner configuration report | 기존 Owner-confirmed plan은 현재 Bot을 A0 Shadow로 기록 | Owner가 기존 `업무 인입 감시` ID/매시간/활성 상태를 유지하며 Linear·Slack·Calendar·Drive bounded write, Gmail Draft-only, `gmail_sent=0`, 실행당 effect≤5, destructive/계약·비용·기술기준·대외약속 금지를 설정했다고 보고 | repo/agent가 설정을 변경하거나 first run을 관찰한 것은 아님. exact prompt digest·실제 app mutation/readback·prohibited effect 0은 첫 v0.4.0 run 뒤 검증 전 `UNKNOWN/HOLD` | Voice-First 운영모델·Task Engine CURRENT truth sync |
| 2026-08-22 | Voice-First Fable 재검토·first v0.4.0 receipt | Fable 5가 `489e3812`를 독립 재검토해 engine manifest 회귀와 LB1 counter·Accepted Context generation fencing 결함을 재현했고, Scheduled 결과가 일반 채팅으로 열리는 project-context gap을 확인 | 세 blocking defect에 RED→GREEN 보정을 적용하고 manifest/topology를 canonical 재생성했다. Shadow·launcher root validator alias도 정본 명령에 추가했다. Scheduled detail의 first receipt는 Linear 5·다른 앱 0·`gmail_sent=0`을 보고했으나 provider/app readback은 별도 HOLD로 유지한다 | LB1 51/51·Backup 136/136, acceptance/query 31/31+P5 12/12, manifest/topology·Shadow 53/53·launcher 13/13 PASS. root `done:check`는 기존 path-policy 51건으로 RED | `linear_lb1_one_shot_runner*`, `accepted_context_query*`, engine manifest/topology, root validators, Voice-First owner docs |
| 2026-08-22 | Hourly intake v0.4.1 project-context fail-closed update | v0.4.0 결과가 project path가 아닌 일반 채팅으로 열려 project memory/instruction 자동 상속을 가정할 수 없었음 | 기존 예약을 in-place 수정해 project scope·지침 v1.0 snapshot·`DO_NOT_ASSUME`·`HOLD_PROJECT_CONTEXT/effect=0`과 receipt fields를 추가. 새 origin/receipt/output은 `V041`, 기존 `V040`과 `V041`은 모두 application echo로 인식한다. ID·매시간·활성은 유지하고 새 예약은 만들지 않음 | 저장 후 9,396자 prompt exact readback, version/revision/project refs/gate/hold/output/origin 일치. first v0.4.1 run·provider/app readback은 대기 | Chat Scheduled detail과 Voice-First owner docs |
| 2026-08-22 | `VF-5` Accepted Generation + Context Query foundation | P5 authentic candidate는 있었지만 human-review content binding, append-only generation/CAS와 accepted-context query가 없었음 | candidate canonical review digest, exact reviewed-membership/coverage/supersession gate, in-memory append-only accepted manifest/receipt, mandatory ACL·uniform no-leak·generation-pinned query를 public-synthetic으로 구현 | acceptance/query 30/30, candidate 12/12, readiness 34/34, Task Core 28/28, fresh Opus 5 `ACCEPT`; actual human/HPP writer/private persistence/live query 0/HOLD | `project_context_generation_candidate`, `project_context_acceptance_gate`, `accepted_context_query`, root acceptance wiring |
| 2026-08-22 | `VF-6` Hermes proposal-runtime trial gate foundation | Hermes exact version/identity/tool/memory/custody/rollback 조건이 문서 HP-HERMES에만 있고 executable gate는 없었음 | immutable version/host/isolation digests, one-seat/account/project mapping, read/query/candidate-only tool include-list, forbidden tool digest, delivery idempotency, memory/transcript/attachment/rollback/time-window를 검증하는 pure proposal gate 구현 | Hermes gate 10/10, fresh Opus 5 `ACCEPT`; proposal authority/effects false/0, actual install·doctor·credential·MCP/scheduler 0/HOLD | `voice_first_hermes_trial_gate*`, root worker-runtime validator |
| 2026-08-22 | `VF-7` same-WorkUnit worker comparison foundation | Codex·Flash·Grok run을 같은 input/validator/quality basis로 비교하는 cohort receipt가 없었음 | exact Work Unit/run/validator/reviewer/quality/harness basis, causal timestamps, complete measurements, tie-aware no-selection을 검증하는 pure comparison receipt 구현 | comparison 14/14 + canonical evidence 2/2, fresh Opus 5 `ACCEPT`; actual provider runs·selection authority·auto-deploy 0 | `voice_first_worker_comparison*`, ai usage metadata-only evidence validator |
| 2026-08-22 | `VF-8/C6` bounded mutation canary gate foundation | exact canary tuple·C5/Owner trusted pins·single-use claim·CAS/fencing·readback·compensation을 함께 검증하는 executable gate가 없었음 | synthetic-only adapter와 atomic claim store로 tuple rate cap, terminal success/failure replay, tuple-bound digest readback, non-destructive voided/superseded compensation idempotency를 구현 | canary 17/17, Task Core 28/28, Shadow 53/53, Accepted Context 30/30, fresh Opus 5 `ACCEPT`; `actual_canary_readiness=false`, live provider effect 0 | `voice_first_mutation_canary_gate*`, root acceptance wiring |
| 2026-08-23 | Agent Observation P0~P2 foundation 현재 상태 정합 | owner README는 범위를 P0-S1/P0-S2로만 적었고 receipt v1 표기와 "Hermes를 넣으면 2.29 MB 영속 상태 마이그레이션"이라는 잘못된 근거가 남아 있었으며 P2가 화면 완료처럼 읽혔음 | 한 파일이던 관찰 표면을 Agent Registry·Run Observation·Usage Ledger·Evidence/Receipt 네 seam으로 나누고 private 공유 내부 `observation_internals.mjs`와 호환 barrel `agent_observation.mjs`을 두었다. delivery 영수증은 `result_receipt.v2`에서 `delivery_target`(target run/agent/work-unit)을 필수로 싣고 관찰된 run·project·agent·work unit에 대해 검사한다. Board view-model foundation은 투영을 panel 행으로 바꾸는 순수 builder로만 존재한다. 독립 검토가 지목한 세 경계는 RED를 먼저 잡고 보정했다 — (1) Board view가 알 수 없는 `hold_code`를 화면에 되쓰지 않고 고정 문구 하나로만 닫는다, (2) meter lineage key는 맨 앞 `/root` segment만 이름으로 면제하고 알려진 로컬 경로 모양은 meter root 아래 숨은 것까지 행에서 제외한다, (3) target run 시작 전에 관찰된 delivery receipt는 `DELIVERY_TARGET_TEMPORAL_INVERSION`으로 막고 동시각은 받아들이며 원장에 아무것도 append하지 않는다 | `delivery_target`은 producer가 관찰한 **의도된 hand-over 상대**이지 consumer의 수신 확인이 아니다. P2는 screen·route·server·runtime 배선이 없고 4192 런타임이 이 module을 import하지 않으며 가시적 배선과 live producer 활성화는 `HOLD`다. 위 세 보정도 view-model과 pure store 계약 안에서만 닫힌 것이고 런타임 배선을 만들지 않는다. Hermes meter mapping은 enum 확장이 가산적이라는 사실과 무관하게, 실제 collector가 token 신뢰도 의미를 증명하기 전까지 계속 보류다 | `guild_hall/agent_observation/**`(2026-08-23 관찰 `validate:agent-observation` 293/293), `ui-workspace/apps/team-ops-board/src/core/agent-observation-view.*`(`validate:team-ops-app` 631/631), owner README, CHANGELOG 08-23 |
| 2026-08-23 | Hermes Desktop install-only 현재 상태 | `VF-6` Hermes proposal-runtime trial gate는 executable 계약만 있고 실제 설치 상태 기록이 없었음 | 공식 NousResearch 배포원에서 Hermes Desktop을 설치하고 agent `v0.20.5` 설치를 확인했다. 숨김 local boot smoke 1회가 성공했고 그 뒤 관련 프로세스를 모두 정지했다 | OAuth·로그인·provider 연결·API key·MCP·scheduler·channel·Probe는 어느 것도 하지 않았다. 서명되지 않은 로컬 실행 파일과 dependency audit high 4·critical 0이 남아 있어 security `HOLD`를 유지한다. 로컬 machine 경로와 credential은 기록하지 않는다 | Owner-observed install-only 보고, `voice_first_hermes_trial_gate*`(계약만, 설치·실행 권한 없음), CHANGELOG 08-23 |
| 2026-08-25 | Candidate Execution Coordinator first bounded live canary | feature-OFF public-synthetic 구조가 실제 Linear marker→exact Bot command→4192 readback을 아직 증명하지 못했음 | Owner 승인 team-only 합성 `SON-59`와 `AI 실행 후보` label을 Codex Linear connector로 만들고, Role/Capability→responsible triage→Coordinator→기본 Hermes runner로 exact 제품 총괄 `gpt-5.6-terra` session에 1회 전달 | marker digest 일치, candidate run/receipt exact Bot 귀속, same-process replay `NO_OP`, 4192 matched 1·`working→idle`, Linear Todo/label 유지, Official Done/mutation false. Connector/label은 authority가 아니며 persistent ledger·scheduler·writer·automatic assignment·실업무 Work Brief·production route는 `HOLD` | `SON-59` metadata-only Evidence comment, 4192 read-only projection, post-development review packet, CHANGELOG 08-25 |
| 2026-08-25 | Engineering Engine 조립 모델과 package 표준 결정 | current main은 SE가 flat `contracts/stage_rules/subjects/tests/...`를 쓰고, 별도 E01 candidate branch(`codex/quality-engine-v0@f306f3c7`)도 같은 flat category에 prefix 파일을 더해 Compiler·Overlay를 제품 계층처럼 읽기 쉬웠음 | Owner가 `Engine Core / Domain Engine / Organization Profile / Project Profile / Project Binding / Effective Rule Set` 용어와 두 흐름(규칙 조립 vs evidence→Typed Facts)을 승인. target `core/ + engines/<domain>/` package와 organization/project storage owner, migration gate를 정본 문서·SE manual·source model·TARGET_TREE에 기록 | 이번 slice는 documentation decision만 수행하고 file relocation·schema 발행·E01 merge·E02 생성은 0. E02 전 SE+E01 two-adapter conformance→Core Interface 동결→SE/E01 migration→Profile provenance→zero-write replay를 닫아야 함 | `docs/architecture/guild_hall/ENGINE_CORE_DOMAIN_PROFILE_ASSEMBLY_MODEL_V0.md`, Engineering Engine README/manual, `SE_STAGE_RULE_SOURCE_MODEL_V0.md` |
| 2026-08-25 | Engineering Engine 물리 package layout migration | 조립 모델 승인 뒤 물리 마이그레이션 착수 | shared core/ + engines/systems_engineering/ + engines/quality_readiness/(E01) 통합, .registry/engineering_profiles/ schema/catalog 구축, Core Domain Adapter 인터페이스 및 two-domain conformance suite 구현, legacy re-export stubs 보존, release/topology/manifest 재생성 및 검증 완료 | E02(interface_consistency) 확장은 의도적으로 미포함, zero-write replay 및 provenance 100% 보존 | CHANGELOG 08-25, core_domain_conformance.test.mjs, validate:quality-readiness, validate:engineering-engine-core-domain |

## 갱신 규칙

- 큰 우선순위가 바뀌면 이 문서를 먼저 갱신한다.
- 이 문서가 바뀌면 관련 README 또는 project map 링크가 깨지지 않는지 확인한다.
- 구현 세부가 owner 문서로 내려간 뒤에는 이 문서에 세부 checklist 를 계속 복제하지 않는다.
- 완료된 slice 는 결과와 다음 후보만 남기고, 상세 기록은 해당 owner 문서나 `_workmeta` evidence 로 보낸다.
