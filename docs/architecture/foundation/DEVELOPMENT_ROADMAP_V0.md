# Development Roadmap v0

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
- `_workmeta/**` 는 project-local evidence, worklog, promotion candidate 를 소유한다. 큰 제품 방향을 `_workmeta` 에만 남기지 않는다.

## 개발 예정 저장 규칙

개발하기로 한 내용이 흩어지지 않게 아래 순서로 저장한다.

1. 아직 owner, 입력, 출력, 검증이 불명확하면 새 파일을 만들지 않고 이 문서의 `다음 후보` 또는 `현재 보류` 수준으로만 남긴다.
2. public-safe 이고 Soulforge 전체 우선순위에 영향을 주면 이 문서에 한 줄 후보로만 남긴다.
3. 특정 owner 로 내려갈 만큼 구체적이면 아래 `구체화 규칙` 표의 저장 위치로 보낸다.
4. project-local 이거나 raw/private 근거가 섞이면 `_workmeta/<project_code>/reports/procedure_capture/` 또는 해당 project 의 queue 로 보낸다.
5. agent 가 발견했지만 아직 owner-approved 가 아닌 구현 작업도 별도 후보 장부에 흩어두지 않고 `_workmeta/<project_code>/dev_worker_queue/*.yaml` 에 `status: proposed` 로 둔다.
6. project 가 불명확하지만 Soulforge system/reusable 후보가 분명하면 `_workmeta/system/dev_worker_queue/*.yaml` 에 `status: proposed` 로 둔다.
7. 바로 실행 가능한 public-safe 개발 작업은 `.mission/<mission_id>/dev_worker_request.yaml` 처럼 명시 task packet 으로 만들 수 있고, private/system 작업은 같은 `dev_worker_queue` packet 을 `status: approved` 또는 `status: queued` 로 올린다.
8. 기존 `dev_worker_candidate_queue` 는 legacy migration input 으로만 취급한다. 새 개발 항목은 넣지 않고, 기존 항목은 내용 보존과 reader 호환성을 확인한 뒤 `dev_worker_queue` 로 이관한다.

### 아이디어 캡처 계단

앞으로 토큰이나 대기 시간이 남을 때 개발할 수 있는 아이디어는 아래 계단으로만 적재한다.

| 상태 | 판단 기준 | 저장 위치 | 금지 |
| --- | --- | --- | --- |
| 말로 던진 아이디어 | owner, 입력, 출력, 검증 중 하나라도 불명확함 | 이 문서의 `다음 후보` 또는 `현재 보류` 한 줄 | 별도 `TODO`, 임의 `*_plan.md`, README backlog |
| system/reusable 후보 | Soulforge 공통 개발 후보지만 아직 승인/실행 조건이 덜 닫힘 | `_workmeta/system/dev_worker_queue/*.yaml` with `status: proposed` | 별도 후보 장부 생성, public canon 승격 주장 |
| project-local 후보 | 특정 project 의 private 근거, 업무 맥락, raw/source 포인터가 필요함 | `_workmeta/<project_code>/dev_worker_queue/*.yaml` with `status: proposed` | public repo 기록, raw payload 복사, 후보/실행 장부 분산 |
| 실행 준비 완료 | owner, 입력, 출력, 경계, 완료 기준, validator 가 닫힘 | public-safe 는 `.mission/<mission_id>/dev_worker_request.yaml`, private/system 은 같은 `dev_worker_queue` packet 을 `status: approved` 또는 `status: queued` 로 승격 | owner 선택이 필요한 항목을 실행 상태로 밀어 넣기 |
| 지식/RAG 후보 | 개발할 코드보다 source 사용, 반복 질문, 지식 접근, RAG metadata 정리가 핵심임 | `_workmeta/<project_code>/reports/procedure_capture/**`, `_workmeta/<project_code>/reports/knowledge_access/**`, 또는 system/reusable 은 `_workmeta/system/**` | source text/chunk/body 를 public repo 또는 `_workmeta` 에 저장 |

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

Soulforge는 현실 업무를 게임식 운영 루프로 바꾸는 시스템이다. 이 운영 루프가 장기 북극성이고, 지금 이를 실제 개발팀 업무에서 구현하는 현재 active build 는 dev-erp 앱(아래 '현재 phase')이다.

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

- active slice: **dev-erp (사내 개발팀 운영 콕핏)** — owner 1순위. 정본: `ui-workspace/apps/dev-erp/docs/DESIGN.md`, `ui-workspace/apps/dev-erp/docs/MASTER_PLAN_20260613.md`. `checklist_phase1.json`은 완료된 phase-1 baseline이고, 현재 slice queue와 next action은 `ui-workspace/apps/dev-erp/docs/SLICES_INDEX.md`가 소유한다.
- 상태 해석: 2026-06 실제 개발의 대부분이 dev-erp(읽기 콕핏 P1 → 할일쓰기 P2 → 재고/BOM/부품 P3 → 챗봇 RAG/Ollama → 매뉴얼/FAQ, run1~17)에 집중됐고 owner 1순위가 이쪽으로 이동했다.
- 판단(2026-06-14 갱신): snapshot→작전판 게임루프는 장기 북극성으로 유지하되, 지금 손이 가는 active slice 는 dev-erp 다. 과거 active slice `snapshot_to_operation_board_v0` 는 '다음 후보'로 내린다(스펙은 아래 'Active Slice 001' 절에 보존, 재개 시 참조).

## SE assistant program direction

Current structural target:

- Keep dev-erp as the current active slice and `snapshot_to_operation_board_v0`
  as the demoted structural north-star; make the SE assistant a bounded
  follow-on operating lane.
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

이 program lane 은 dev-erp active slice 나 장기 snapshot 북극성을 대체하지 않는다. SE assistant 는 dev-erp 가 안정되고 snapshot 표면이 굳은 뒤 project work 를 더 잘 굴리기 위한 후속 방향으로 둔다.

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
- It must not delay or redefine `snapshot_to_operation_board_v0`.
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

## 장기 후보: engineering co-pilot expansion

이 후보는 `snapshot_to_operation_board_v0` 와 SE assistant lane 이 안정된 뒤, 실제 설계 업무를 더 넓게 보조하는 후속 방향으로 둔다. 핵심은 owner 의 거친 아이디어, 작업 흔적, 자료 접근 패턴을 실행 가능한 산출물 준비와 개선 제안으로 바꾸는 것이다.

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
- knowledge-use analytics 는 기본적으로 metadata-only 로 시작하고, payload truth 는 `_workmeta`, source packet, owner-held source 경계에 남긴다.
- 팀 library 반영, 산출물 승인, 설계 판단, workflow/skill 승격은 owner approval 또는 별도 review gate 를 거친다.

구체화 순서:

1. `knowledge_access_event_capture_v0` 와 ledger helper 를 안정화해 어떤 지식이 언제, 왜 쓰였는지 metadata-only 로 남긴다.
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
  project-local `_workmeta/<project_code>/daily_ledger/**` surface.
- Company general/unresolved ledger agent: writes one daily metadata ledger
  under `_workmeta/P00-000_INBOX/daily_ledger/**` for real company work that is
  not assigned to a project yet or is intentionally project-less.
- Soulforge ledger agent: writes daily metadata ledgers under
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

### Google Drive LLM wiki bookshelf candidate

This candidate adds Google Drive as the cross-PC canonical source bookshelf for
NotebookLM-ready materials. It does not replace OneDrive as the active working
file share, and it does not move source payloads into Soulforge public canon.

Owner split:

- Google Drive: owner-approved canonical source bookshelf for LLM wiki and
  NotebookLM source sets.
- NotebookLM: question, summary, and synthesis interface over the approved
  source set.
- OneDrive: active project working files and editable deliverables.
- Soulforge: metadata-only source ledgers, NotebookLM packet maps, usage
  records, review packets, and promotion candidates.
- `_workmeta`: private/project-local evidence for why a source is canonical,
  where it is used, and which NotebookLM packet references it.

Initial development target:

1. Define a canonical-source intake checklist for the Google Drive bookshelf.
2. Define a metadata-only source ledger shape that can point at Drive sources
   without copying source payloads.
3. Define a NotebookLM packet map that records which canonical sources belong
   to which notebook or topic.
4. Route source-use events through `guild_hall/knowledge_access` and keep
   accumulated evidence under `_workmeta/**/reports/knowledge_access`.

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
- `_workmeta/system/**`: NotebookLM 결과, source delta, pilot evidence,
  review packet 같은 private/procedure evidence 를 남긴다.

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
- Full ERP scope (ERP 범위는 별도 active slice 인 dev-erp 앱이 소유한다).

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

> (2026-06-14 갱신) 이 슬라이스는 active 에서 '다음 후보'로 내려갔다. 현재 active slice 는 dev-erp. 아래 스펙은 재개 시 참조용으로 보존한다.

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
| 11 | workflow/skill/party/automation 사용·결과 측정 (첫 measurement slice 구현: activity `asset_usage` + report, 실 writer 계측은 후속) | 실제 writer가 success/failure와 baseline/evidence pointer를 남김 | `guild_hall`, `docs/architecture/guild_hall`, `_workmeta` |
| 12 | AI 세션 boot digest 와 필수 읽기 체인 경량화 | owner 가 digest 의 라우팅 지위를 정함 | `AGENTS.md`, `docs/architecture/foundation` |
| 13 | foundation 문서 staleness 정리 (roadmap 구조/완료 잔존, PROJECT_MAP 표, 개선계획 현행화) | owner 가 정리 범위를 승인함 | `docs/architecture/foundation` |
| 14 | CHANGELOG rotation 규칙과 1차 분할 | owner 가 크기 예산과 분할 단위를 정함 | `docs/architecture/foundation`, `CHANGELOG.md` |
| 15 | `.workflow` active/deprecated/retired·supersede/fallback 정책 결정 (calibration 위치는 `.workflow/README.md`로 해결됨) | 후보 11의 실사용 evidence가 쌓이고 owner가 상태 전이 기준을 승인함 | `.workflow`, `docs/architecture/foundation`, `_workmeta/system` |
| 16 | dev-worker queue archive 와 legacy candidate queue 이관 규칙 | dev_worker 큐 reader 의 flat-path 의존 확인 | `_workmeta`, `guild_hall/dev_worker` |
| 17 | doctor 플랫폼 native binary 점검 (esbuild 등) | 없음 - public-safe 단독 작업 | `guild_hall/doctor`, `docs/architecture/bootstrap` |
| 18 | bounded task 종료 절차(ceremony) 경량화 검토 | owner 가 유지/축소 방침을 정함 | `docs/architecture/foundation`, `AGENTS.md` |
| 19 | V0 문서 버전 승격/유지 기준 정의 | 없음 - 기준 한 장이면 충분 | `docs/architecture/foundation` |
| 20 | knowledge/RAG 문서 통합 색인 | 분산 문서 8+건 목록 확정 | `docs/architecture/foundation`, `docs/architecture/workspace` |
| 21 | Python 테스트 커버리지 확장 (town_crier, mail_send 등) | 없음 - synthetic fixture 로 가능 | `guild_hall` |
| 22 | 메일 수집 계정별 owner 메타 → core_mail (개인별 메일 뷰) | 메일 수집 통합 완료(자동 15분+수동 버튼); Codex 원장 스키마에서 owner 필드 위치(신규 컬럼 vs `메일함` 재정의) 확정 | `guild_hall/gateway`, `ui-workspace/apps/dev-erp`, `docs/architecture/workspace` |
| 23 | 메일 원장 시간 분할 + 증분 스캔 (무한 누적 대비) | owner 가 분할 단위(연/월) 정함; Codex 원장 표준 `soulforge.project_mail_history.private.v1` 변경 조율 | `guild_hall/gateway`, `docs/architecture/workspace`, `_workmeta` |
| 24 | Rhino x Claude Code 연결 패턴 검토 | engineering co-pilot / SE assistant lane 재개 시 owner 가 Rhino 자동화 연결 필요성을 정함; 공개 영상 source ref 를 먼저 검토 | `.workflow`, `_workmeta/system`, external host setup |

후보 10~21 의 출처는 2026-06-12 Fable5 심층 검증이다. 10~17 의 상세 후보
패킷은 `_workmeta/system/dev_worker_queue/` 에 `status: proposed`
로 두며, owner 승인 전에는 `approved` 또는 `queued` 상태로 승격하지 않는다. 기존 `dev_worker_candidate_queue` 참조는 legacy path 로 이관 대상이다.

추가(2026-06-14, Opus 2차 검증 + owner 결정): `snapshot_to_operation_board_v0`
는 과거 active slice 였으나 active 가 dev-erp 로 바뀌며 다음 후보로 내려갔다.
시작 조건: dev-erp 가 안정되고 owner 가 snapshot 재개를 정함. 내려갈 owner:
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

## 갱신 규칙

- 큰 우선순위가 바뀌면 이 문서를 먼저 갱신한다.
- 이 문서가 바뀌면 관련 README 또는 project map 링크가 깨지지 않는지 확인한다.
- 구현 세부가 owner 문서로 내려간 뒤에는 이 문서에 세부 checklist 를 계속 복제하지 않는다.
- 완료된 slice 는 결과와 다음 후보만 남기고, 상세 기록은 해당 owner 문서나 `_workmeta` evidence 로 보낸다.
