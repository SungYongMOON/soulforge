# CHANGELOG

## 2026-06-17

### Revision `working` - dev-erp 공용 분류 큐와 장부 페이지 계약

- `status=unclassified` 할일을 팀 공용 분류 큐로 명시해 일반 팀원도 미배정 메일 파생 할일을
  조회·확정할 수 있게 함. 정식 할일 조회는 기존처럼 본인 담당자 범위를 유지.
- 미분류 할일 확정 시 담당자를 함께 저장하고, 입력이 비어 있으면 추천 담당자 또는 현재 로그인
  사용자를 기본 담당자로 기록해 공용 큐에서 개인 실행 목록으로 자연스럽게 이동하게 함.
- `/api/items` 와 `/api/mail` 에 `page=1` 페이지 응답(`rows,total,limit,offset,has_more`)을
  추가하고, 기존 배열 응답은 유지해 다른 화면 호환성을 보존.
- 할일/메일 화면에 이전·다음 페이지 컨트롤과 정확한 총량 표시를 추가해 메일·할일이 계속
  쌓여도 고정 500건 제한에 가려지지 않도록 함.
- 미분류 연체 알림, 출처 메일/소스/스레드 추적 표시, 출처 ref 검색을 보강해 메일에서 파생된
  일이 어디서 시작됐는지 화면에서 추적할 수 있게 함.

### Revision `working` - dev-erp 기존 메일 이력 754건 할일 장부화

- 기존 `_workmeta/*/reports/메일_이력/메일_이력.csv` 8개 장부의 754개 메일 이력에서
  `mailtask:<이력키>` 할일 장부 행을 생성하고 dev-ERP DB에 수입할 수 있게 함.
- 메일에 명시 기한이 있으면 해당 날짜를 우선 사용하고, 없으면 수신일+3일 첫 검토기한과
  기한+2일 리마인드/급한 재검토 문구를 장부에 남기도록 `mail_to_task_ledger.mjs` 를 보강.
- `P00-000_INBOX` 예약 코드를 dev-ERP의 인박스 프로젝트로 수입할 수 있게 해 회사 일반/미해결
  메일도 메일 원장과 할일 원장에서 누락되지 않도록 함.
- 메일 행의 스레드 헤더 alias, 소스 계보 해시, 생성런/규칙, 메일소스ID를 보존해
  메일→할일 추적성을 강화.

### Revision `working` - dev-erp 계정별 메일함 등록 메타데이터

- `guild-hall:gateway:fetch:team` 과 `mail_fetch/team_cli.py` 를 추가해 metadata-only
  `team_mailboxes.json` 등록부의 여러 메일함을 순회 수집할 수 있게 함. 메일함별 cursor/dedupe/run
  로그를 분리하고, 후보 ID와 메일 후보 메타데이터에도 mailbox scope 를 반영.
- `dev-erp:export-team-mailboxes` 를 추가해 dev-ERP 계정의 safe mailbox 메타데이터에서
  `team_mailboxes.json` 등록부를 생성할 수 있게 함(비밀값 미포함).
- `core_account` 에 메일함 provider/env ref/enabled/status/last-fetch/error/summary 메타데이터를
  추가하고, env ref 는 repo-relative 포인터만 허용하도록 검증을 추가.
- 관리자 계정 패널과 `/api/accounts/mailbox` 엔드포인트에서 계정별 메일함 메타데이터를
  저장할 수 있게 하되 password/token/secret 값은 받거나 표시하지 않음.
- 메일 장부 스캔이 `메일함` 값을 `core_mail.mailbox` 로 보존하고, 메일→할일 장부 생성은
  기본적으로 메일함 수신자를 `제안담당자` 로만 넣으며 `--assign-mailbox-owner` 사용 시에만
  확정 `담당자` 로 기록.
- 팀원 계정의 기본 메일/검색/할일/대시보드 요약/최근 이벤트 조회는 본인 mailbox/담당자 범위로
  좁히고, 메일 배정·라벨·승격 및 할일 변경 요청도 자기 범위 밖이면 거부하도록 서버 측 가드를 보강.

### Revision `working` - dev-erp 메일 기반 할일 자동화 메타데이터 보강

- 메일 후보 → 할일 장부 → ERP 인입 흐름에서 검토상태, 라우트 후보/신뢰도, 필요 역할·역량,
  제안 담당자, 소스 메일/후보/스레드/그룹, 생성런/규칙, 동기화 상태/해시/리비전을
  보존하도록 할일 장부와 `core_item` 메타데이터를 확장.
- 할일 장부 인입은 기존 할일을 조용히 덮어쓰지 않고 해시 차이가 나면
  `conflict` 로 표시해 사람 수정 이력을 보호하도록 정리.
- dev-erp 화면의 할일 목록·허브·미분류 카드에 검토/라우트/담당자/동기화 힌트를 표시해
  자동 생성된 할일을 사람이 바로 검토할 수 있게 함.
- gateway 메일 후보/상태 집계가 원문·첨부명 없이 구조화된 후보 메타데이터만 전달하도록 보강.

### Revision `working` - dev-erp 지식 대분류 분리 + 분야 4그룹 + canon 뷰어

- `지식·지원`(대도서관) 대분류를 **지식**(전승 서고) / **도구·지원**(제작 도구) **두
  대분류로 분리**.
- **지식**: 분야 4그룹을 가로 서브탭(표준·규격집 / 분야 기술 / 지식·RAG 방법 /
  운영 규범·교리) + 검색·지침. 각 그룹의 canon 항목을 **왼쪽에 동적 나열**(`.registry/
  knowledge` 리더 소비), 클릭하면 항목 뷰어(제목·분야·요약·공개 출처·소스카드 포인터)
  또는 그룹 카드 목록. 원문 미저장.
- 라벨/카테고리는 모드별(business/fantasy). 잔존 `kb` localStorage 는 안전하게 리셋.

### Revision `working` - dev-erp 메일 이력 프로젝트별 구분(기본)

- 메일 이력이 **기본으로 프로젝트별 그룹**(헤더=프로젝트 칩+제목+건수)으로 구분됨.
  툴바 토글로 프로젝트별 ⇄ 날짜별 전환. 미분류/INBOX 그룹은 맨 아래, 그룹은 최신 메일 순.
- 실제 붙은 라벨(수동 색 라벨)은 행에 칩으로 표시 — 프로젝트별 그룹에선 프로젝트 칩이
  헤더로 올라가 행은 부가 라벨만 표시.
- 메일 분류 차원(스키마 기준): 프로젝트(주력)·방향(받은/보낸)·상대(counterpart)·수동 라벨·
  SE 단계(stage_code)·메일함(mailbox, 담당자 프록시). 담당자(내부)는 메일 직접 필드가 아니라
  할 일 승격 후 부여.

### Revision `working` - dev-erp 인증 벽 + 첫 페이지(달빛 길드 입성)

- dev-erp 가 팀 모드(계정 1개 이상)에서 **로그인 없이는 앱·데이터를 볼 수 없게** 됨.
  미인증이면 풀스크린 첫 페이지(게이트)만 표시: 첫 실행=길드마스터 창설(bootstrap),
  이후=입성(로그인)·길드 가입(회원가입) 탭. **모드별 첫 화면 스킨** — 판타지=달빛
  야간(달·별·안개·능선), 실무=전문가용 흰 카드(네이비). 게이트 우상단 토글로 전환.
- 서버: GET 읽기도 미인증 차단(종전엔 쓰기만 차단). 랜딩에 필요한 비민감 메타데이터
  (`/api/me`·`/api/auth/*`·`/api/health`·`/api/lexicon`·`/api/modules`)만 예외. `/api/health`
  의 counts(데이터 규모)는 미인증엔 숨김.
- 길드원 자가 가입 엔드포인트 `/api/auth/register` 추가(member 역할, localhost 바인딩
  전용으로 안전 — 외부 노출 시 초대코드/관리자 승인으로 제한 권장). 가입은
  `account_register` 이벤트로 기록(감사로그 "회원가입").

## 2026-06-16

### Revision `working` - gateway mail history Python 3.9 compatibility

- Changed the project mail history ICS writer to use `Path.open(...,
  newline="")` instead of `Path.write_text(..., newline="")`, preserving
  explicit ICS line endings on Python 3.9 runtimes used by the mail-fetch test
  harness.

### Revision `working` - workspace-system report command added

- Added `guild-hall:workspace-system:report` so another PC can create a
  metadata-only `_workspaces/system` inventory report without pasting a long
  prompt.
- The report command writes JSON, Markdown, and CSV under
  `_workmeta/system/reports/workspace_system_inventory/<timestamp>_<node_id>/`
  and keeps payload bodies, local absolute paths, secrets, and workspace
  mutations out of the capture.
- Updated the workspace path identity and system migration runbooks to make the
  report folder the normal private evidence packet for cross-PC comparison.

### Revision `working` - workspace-system full scan inventory hardened

- Changed `guild-hall:workspace-system:inventory` so the default metadata
  inventory is an unrestricted recursive scan instead of a bounded sample.
- Added `scan_policy`, row-level `scan_complete`/`scan_limited` fields, and
  activation blockers for any bounded inventory result.
- Split project-coded reference payload folders such as
  `p25_054_reference_payloads` into `project_reference_payload_review` so they
  require owner mapping to a project payload relocation/reference surface rather
  than direct project-root movement.
- Updated workspace migration docs and tests so full-scan evidence is required
  before `_workspaces/system` migration or junction activation decisions.

### Revision `working` - system workspace tool-worker procedure saved

- Rewrote `docs/ws.md` as a readable public-safe prompt for per-PC
  `_workspaces/system` junction preflight checks.
- Clarified that licensed or high-performance tool-worker runtimes such as
  Allegro, Cadence, and OrCAD stay PC-local under `_workspaces/_local/<node_id>/...`
  or an owner-approved OS/tool location.
- Documented that only owner-classified outputs move to shared
  `_workspaces/system`, project workspaces, or `_workspaces/knowledge`, while
  execution evidence stays in `_workmeta` as metadata only.
- Added explicit owner approval gates before copy, rename, link creation,
  shared-tree build, upload, delete, or permission changes.
- Updated the system inventory action text so migrated runtime/tool payloads
  point to `_workspaces/_local/<node_id>/...` or owner-approved OS/tool
  locations, while reinstallable repo tools remain a separate bootstrap flow.

### Revision `working` - dev-erp 산출물(중간번호 등록 + 입력파일 폴더/장부 기초)

- 산출물 중간번호 등록: 고정 단계 밖 31·32 등 산출물을 ERP에서 직접 추가·관리
  (`addDeliverable`, `POST /api/deliverables`, 레지스터 추가 폼).
- 산출물 입력파일(설계+데이터층+UI+장부동기): 산출물 종류별 In 하위폴더 매핑 +
  `deliverable_input` 장부(포인터·메타 전용·원문 미저장·절대경로 거부) + ERP/메일/Codex
  3루트 출처. `core_deliverable.in_pointer`(01_In 상대, out_pointer 대칭). 엔드포인트
  `/api/deliverables/inputs`·`/input-subfolders`. 산출물별 입력파일 UI 패널(종류별
  하위폴더 제안·등록·상태토글). **입력파일_장부.csv write-through/read 동기**(autosync
  패턴 — 할일_장부처럼 ERP↔장부 양방향, 신규행만 import·사람편집 보호).
- 입력파일 업/다운로드(보안우선, 기본 OFF=`DEV_ERP_FILEIO`): `filevault.mjs` path-safety
  게이트(절대/`../`/백슬래시/심볼릭탈출 TOCTOU/널/제어 차단, realpath 이중 봉쇄, _workspaces
  안으로만). 다운로드=등록 입력 화이트리스트, 업로드=01_In 하위 기록+장부 등록(50MB 상한).
  쓰기 경계에서 traversal 포인터 저장 차단. 적대적 검토(9벡터)로 read-outside/write-outside
  없음 확인. 보안 문서 `FILE_IO_SECURITY_20260616.md`. `in_pointer`(01_In) 스캐너 도출.
- 설계 문서 `DELIVERABLE_INPUT_FILES_DESIGN_20260616.md`. 장부 정본·폴더 생성·파일
  라우팅은 Codex(se_foldertree/장부) 소유로 라우팅.

### Revision `working` - dev-erp 팀 사용 백본(계정·다중접속·로컬LLM 동시성)

- dev-erp 에 팀원 다중 접속 백본을 추가: 계정(이메일=메일 인입 키·실제 가입 이름),
  관리자 모드, 인증 엔드포인트(`/api/auth/*`)·계정 관리(`/api/accounts*`), 담당자별
  보기범위(`view=계정id|team`)로 할일·메일 이력 분리, 계정별 메일함(`core_mail.mailbox`).
  비밀번호 해시는 어떤 응답에도 미노출. 계정 0개면 익명 모드로 현행 동작(하위호환).
- 보조용 로컬 LLM 다중 사용자 기초설계: 단일 Ollama 공유 가정에서 ERP 서버가 LLM 호출을
  동시성 게이트(`ERP_LLM_CONCURRENCY`)로 직렬화하고 대기 초과 시 검색 폴백(끊김 방지).
- 설계 문서 추가: `MULTI_USER_TEAM_MODEL_20260616.md`,
  `LOCAL_LLM_MULTIUSER_DESIGN_20260616.md`. 계정별 메일 인입 계약은 Codex 소유로 라우팅.
- 데이터 경계 불변: 원문/첨부·자격증명 미저장, 코어 LLM 0%(제안/검색만), 메타 전송만.
### Revision `working` - standardization HWPX source-text indexes prepared

- Updated the public-safe `standardization_document_samples` knowledge entry to
  record that 2 existing HWPX files were repacked, validated, extracted, and
  indexed in private source-text indexes.
- Kept the 1,446 HWP files blocked until true HWPX export through a verified
  converter or owner-approved GUI export.
- Preserved the public claim ceiling: no document bodies, file names, hashes,
  source chunks, NotebookLM answers, Drive payloads, or private source payloads
  were added to public canon.

## 2026-06-15

### Revision `working` - standardization document sample corpus routed

- Added a public-safe `.registry/knowledge/standardization_document_samples/`
  routing entry for the private company standardization document sample corpus.
- Recorded the public claim ceiling as metadata routing only: private packets
  hold inventory/hash refs, HWPX blockers, NotebookLM manifest materialization,
  and RAG source-card backlog state.
- Kept document bodies, file names, hashes, source chunks, Drive payloads,
  NotebookLM answers, private paths, and company source payloads out of public
  canon.

### Revision `working` - defense quality standards knowledge entry

- Added a public-safe `.registry/knowledge` entry for the prepared defense
  quality management standards source family.
- Registered only source-family routing, RAG validation refs, and blocker
  boundaries for the 56 official-public indexed sources, while keeping source
  bodies, chunks, NotebookLM output, paid standards, HWP body claims, and
  private payloads out of public canon.

### Revision `working` - knowledge audit workflow and launcher added

- Registered `knowledge_source_audit_v0` as the script-backed workflow for the
  private metadata-only knowledge source storage audit runner.
- Added the simple `knowledge_audit` Codex launcher package so the workflow can
  be invoked as `$soulforge-knowledge-audit` after skill sync.
- Kept source payload mutation, raw source decoding, NotebookLM/Drive mutation,
  source truth approval, public canon promotion, and default-route safety out of
  scope; owner decision queues remain advisory follow-up surfaces.

### Revision `working` - knowledge source storage audit runner added

- Added a metadata-only `guild_hall/rag` audit runner that compares `_workmeta`
  source ledgers and source-root bindings against actual source file presence.
- The runner emits private `_workmeta` reports for workspace-backed sources,
  external pointer-only sources, missing originals, duplicate recorded hashes,
  and orphan workspace files without copying, moving, uploading, deleting, or
  decoding source payloads.
- Wired the runner into `guild-hall:rag` plus focused and RAG-wide validation
  scripts with fixture coverage for workspace, external, missing, and orphan
  source storage states.

### Revision `working` - outbound mail attachment selection guard

- Added an outbound-mail guard that separates collected source attachments
  from selected send attachments before any owner-approved send handoff.
- Required duplicate/superseded versions to be excluded or explicitly approved,
  and required requester/customer/external-stakeholder attachments to be
  forwarded only when the owner has approved them as send material.
- Updated the mail style policy and outbound-mail workflow checks so attachment
  existence alone is not enough for send readiness.

### Revision `working` - Windows relative CLI test paths

- Fixed Windows CLI test invocation paths for mission close, morning report,
  and battle log tests by passing repo-relative script paths to spawned Node
  processes instead of URL pathname values.
- This prevents drive-prefixed URL pathname values from being interpreted as
  duplicated drive-prefixed module paths on Windows.

### Revision `working` - UI fixture workspace notes

- Clarified UI public fixture workspace notes so they explicitly describe the
  local-only mount policy with scanning disabled.
- Adjusted the dev ERP slice index wording so doc link checks do not interpret
  an inline code-location note as a relative link.

## 2026-06-14

### Revision `working` - knowledge master inventory runner added

- Added `guild_hall/rag` `master-inventory-refresh` as the deterministic
  metadata-only aggregate runner for the private master knowledge control
  surface under `_workmeta/system/reports/knowledge_wiki/`.
- The runner emits inventory JSON/CSV, summary, reconcile report, RAG refresh
  handoff, candidate priority triage, first sourcebound-review selection, and
  validation log without reading source bodies, NotebookLM answers, embeddings,
  BM25/vector payloads, private payloads, secrets, or runtime absolute paths.
- Documented the master inventory as the recurring control surface in the
  knowledge operating model and `rag_metadata_refresh_v0` README.
- Added explicit `claim_ceiling: observed` to the 5 active public knowledge
  entries that previously lacked an explicit claim ceiling.

### Revision `working` - knowledge wiki/RAG route registration consolidated

- Registered `rag_source_text_quality_review_v0` and
  `rag_work_card_router_v0` in `.workflow/index.yaml` as pilot-executed RAG
  source-text support workflows while keeping them not default-route-safe and
  below source truth, answer authority, project execution authority, owner
  approval, and public canon promotion.
- Extended `.party/knowledge_wiki_cell` and the
  `knowledge_wiki_cell_launcher` Codex bridge so RAG quality/work-card routes
  and the existing LLM wiki stack are optional routes behind the registered
  `knowledge_wiki_pipeline_v0` default entry.
- Updated knowledge/RAG operating docs and the ERP/BOM hierarchy map so the
  launcher skill is the caller-facing route for wiki/RAG knowledge registration,
  with older LLM wiki workflows treated as optional compatibility/narrow routes.
- Kept raw source text, chunks, NotebookLM answers, private payloads, runtime
  absolute paths, secrets, default-route switches, and production-ready claims
  out of scope.

### Revision `working` - SE 폴더트리 ERP 일정 힌트 추가

- Added compact `se_foldertree_generate` schedule hints in
  `.registry/skills/se_foldertree_generate/codex/assets/schedule_rules.yaml`
  so ERP work can reuse source-backed relative date rules without bloating the
  foldertree spec or guessing dates for artifacts with no explicit rule.
- Linked the schedule rules from the Codex bridge, mapping reference, and
  system-development bundled spec while keeping `generate_tree.py` behavior
  unchanged.

### Revision `working` - Opus 2차 독립검증 후속 실행 (안전 batch + active slice 전환)

- 검증 게이트 위신호 차단: `run_root_acceptance`(=`validate`/`done:check`)가
  하드코딩 STEP 리스트라 핵심 게임루프 테스트 8건(canon_validate 검증기 자체·
  mission_close·dungeon_assignment·loop_e2e·night_watch 2종·
  candidate_queue_archive·boot_digest_guard)이 CI 에서 skip 됐음 →
  `validate:core-loop` 신설·양 모드 편입. path-policy 게이트도 `--scope changed`
  라 깨끗한 트리/CI 에서 0파일 no-op → runner step 을 test + `--scope tracked`
  전수로 교체(로컬 빠른 `validate:path-policy` 는 유지).
- active slice 전환: `DEVELOPMENT_ROADMAP_V0` 의 active slice 를
  `snapshot_to_operation_board_v0` → dev-erp(사내 개발팀 운영 콕핏)로 갱신
  (최근 7일 커밋의 78%가 dev-erp 인데 로드맵이 이를 non-goal 로 잠가둔 모순 해소).
  snapshot 슬라이스는 다음 후보로 강등(스펙 보존), Team Ops Board 의 'Full ERP
  scope' non-goal 은 dev-erp 소유로 개정.
- owner 경계 정합: `DOCUMENT_OWNERSHIP`·`AGENT_WORLD_MODEL` 을 guild_hall 포함
  7축으로 동기화, `guild_hall/README` 에 누락 5모듈 보강.
- 온보딩 정합: `AGENT_BOOT_DIGEST`·`TEAM_DAY_1_GUIDE` 의 폐지된 'main push
  금지/전용 branch' 규칙을 `AGENTS.md` 현행(main 직접 작업 허용)으로 동기화,
  boot_digest manifest 재서명.
- 노출 가드: 루트 `.gitignore` 에 secret/credential deny 패턴 추가.
- gateway README 의 stale package caveat 정리(helper 2종 tracked).
- 근거: `_workmeta/system/reports/procedure_capture/20260614_claude_opus48_independent_revalidation.md`.

## 2026-06-13

### Revision `working` - ERP/BOM 계층 구조 지도 추가

- Added `docs/architecture/foundation/SOULFORGE_ERP_BOM_HIERARCHY_V0.md`
  as a public-safe hierarchy map that reads Soulforge like an ERP/BOM:
  canon roots, registry entries, workflow/party catalogs, dev-erp runtime
  modules, widget/API/table layers, knowledge/RAG layers, and private/worksite
  boundaries.
- Linked the map from `docs/architecture/foundation/README.md` so structure
  review starts from the foundation document index.
- Kept private payloads, mail bodies, attachments, local database contents,
  and secret values out of the public document; protected surfaces are described
  by role and repo-relative path only.

### Revision `working` - workspace system inventory gate added

- Added a read-only `_workspaces/system` inventory/classification gate through
  `guild-hall:workspace-system:inventory` and `validate:workspace-system`.
- Added deterministic classes for shared generated views, fixture candidates,
  project moves, knowledge moves, PC-local runtime/tools, cache/temp files,
  repo promotion review, conflicts, and unknown review rows.
- Blocked default RAG and knowledge graph writes to `_workspaces/system/**`
  while the `system` binding is still planned or the local path is not a link;
  PC-local temporary outputs must use `_workspaces/_local/<node_id>/system/**`.
- Updated `docs/ws.md` so other PCs start from the inventory gate and produce a
  dry-run cleanup plan without file mutation or host-local path leakage.

### Revision `working` - workspace path identity policy fixed

- Added a public workspace path identity policy so the same `_workspaces/<name>`
  path cannot mean different physical folders on different PCs unless it is
  explicitly under `_workspaces/_local/<node_id>/`.
- Reclassified `_workspaces/system` as a path-identity controlled shared system
  view, with pre-migration local copies preserved under
  `_workspaces/_local_hold/system/<timestamp>_<node_id>/`.
- Updated workspace, installation, knowledge graph, RAG, Obsidian export, and
  short PC handoff docs so default system outputs use the shared view and
  PC-local experiments use `_workspaces/_local/<node_id>/system/...`.
- Updated workspace junction audit and RAG/knowledge graph path guards to
  recognize `SE_TEMPLATE_LIBRARY`, `_local`, and `_local_hold` boundaries
  without allowing arbitrary `_workspaces` aliases.

### Revision `working` - workspace system check prompt shortcut

- Added `docs/ws.md` as a short hand-typed prompt entry for checking
  `_workspaces/system` or `Systems` sharing/junction drift on another PC.
- The prompt requires repo-relative reporting only, forbids local absolute path
  recording and secret/raw payload inspection, and limits the run to diagnosis
  plus dry-run repair planning unless the owner separately approves mutation.
- Expanded the prompt from diagnosis-only to a per-PC cleanup planning flow:
  classify local workspace-system entries, produce a dry-run cleanup plan, and
  keep all mutation behind explicit owner approval.
- Reframed the prompt goal so each PC drives toward `_workspaces/system` as the
  final junction path: preserve any existing local folder under a repo-relative
  hold location, create the junction only after explicit owner approval, and
  keep shared target paths out of reports.

### Revision `working` - 하네스 강화 B1·B2 (verify_gate + doctor 확장)

- B1: dev-erp `tools/verify_gate.mjs` — 페이즈 종료 기계 체크 9종 +
  AGENT_EXECUTION_CONTRACT_V0 Level 0~3 매핑, 자기검증 테스트, 브라우저
  검증은 도구 비종속 절차 문서(BROWSER_QA_PROCEDURE.md)로 분리.
- B2: doctor safe_smokes 2종 추가 — `platform_binary_native_match`
  (guild_hall/doctor/platform_binary_check.mjs, 외장 볼륨 호스트 이동 시
  네이티브 바이너리 불일치를 npm ci 안내로 검출, doctor_platform_binary_check_v0
  흡수) + `dev_erp_doctor` (dev-erp tools/doctor.mjs: node/syntax/DB 스키마·
  실메타 신선도/gitignore, --live 선택). 전부 표준 Node — Codex 동일 실행.
- B3: `docs/architecture/foundation/AGENT_BOOT_DIGEST_V0.md` — 필독 체인
  (AGENTS+계약+로드맵+PROJECT_MAP ~1,270줄)을 81줄 companion 다이제스트로
  압축 (정본 아님, AGENTS 라우팅 불변 — owner 결정 대기). 드리프트 가드
  `guild_hall/validate/boot_digest_guard.mjs` (원본 해시 manifest, 변경 시
  실패→재검토 후 --update 재서명, 100줄 상한 강제).
- B4: 후보큐 archive 자동화 — `candidate_queue.mjs --archive-closed [--apply]`
  (candidate_queue_archive_policy_v0 흡수). 닫힌 후보를
  `archive/<year>/` 로 이동만(내용 불변, ARCHIVE_INDEX.md 기록), 발견
  로직은 하위 디렉토리 무시라 자연 차폐. 로드맵 저장 규칙에 1줄 등재.
- B5: dev-erp `tools/label_audit.mjs` — event_log 라벨링 우선 원칙
  (used_refs/data_label/project_ref/actor) 커버리지 감사, 읽기 전용,
  --min 게이트 옵션. 첫 감사로 view 이벤트의 project_ref 결손을 발견해
  logView 에 차원 추가.
- B6: INSPECTOR_PROTOCOL.md (도구 비종속 — 계약 Level 2 를 실행 절차로) +
  verify_gate Level>=2 연동. 통합 inspector 패스(fresh) 1회 수행 — B1~B5
  전부 accept, 발견 반영(reject/hold/revise verdict 는 게이트 FAIL 처리).

## 2026-06-13

### Revision `working` - system workspace drift migration runbook added

- Added `docs/architecture/workspace/SYSTEM_WORKSPACE_SYNC_MIGRATION_V0.md`
  as a public-safe coordination runbook for resolving drift in
  `_workspaces/system/` across multiple PCs before deciding whether the
  folder should remain local-only or become an owner-approved shared junction.
- The runbook defines a freeze, metadata-only manifest inventory, hash-based
  comparison classes, conflict handling, shared-root decision points, and
  public/private boundaries without exposing actual workspace files, PC names,
  local absolute paths, cloud account details, raw payloads, or secrets.
- Linked the runbook from `docs/architecture/workspace/README.md` so the team
  can find the migration status and procedure from GitHub.

## 2026-06-12

### Revision `working` - Towed-body sensor stability knowledge entry added

- Added `.registry/knowledge/towed_body_sensor_stability/` as a public-safe
  source-supported reusable knowledge entry for towfish stability, tow point
  and CG/CB separation, internal liquid damping mechanisms, vibration
  isolation, cable strumming, appendage case planning, and pointing error
  budgeting.
- Registered only public source references and bounded mechanism claims,
  including NASA/NTRS, NREL, ITTC, OSTI, NAVSEA/Navy public records, NOAA,
  NIST, USGS, and supporting open technical literature.
- Kept SONAR2093 design intent, P26-014 acceptance, private reports, raw
  payloads, NotebookLM answers, vendor source truth, and numerical reverse
  engineering values out of the public registry entry.

### Revision `working` - Team Ops Board MVP 1: 로컬 실동작 앱 1차 구현

- owner 결정(2026-06-12): 진실 저장소는 하이브리드(Option C, Smartsheet 가
  공식 프로젝트 장부로 유지), 팀원 직접 수정 + 전 변경 감사 로그, UI 한국어
  우선. 2026-06-02 fresh design 의 MVP 1 을 시작 조건 충족으로 착수.
- `ui-workspace/apps/team-ops-board` 추가 (MVP 0 목업은 동결 유지):
  localStorage 영속 저장, CSV 내보내기/가져오기(UTF-8 BOM, 행 단위 오류
  보고), 담당/프로젝트/상태/기간/검색 필터, 전 변경 감사 추적(누가/언제/
  이전→이후), 일일 기준선 고정과 기준선 대비 변경 표시, JSON 백업/복원,
  차단 사유·대기 대상 입력 강제. 코어 로직은 의존성 없는 `src/core/*.mjs`
  모듈로 분리.
- 명령 표면: root `ui:team-ops-app:dev/build/preview/test`,
  `validate:team-ops-app`, ui-workspace `team-ops-app:*` 추가, 새 앱을
  `ui:build` 체인에 포함.
- 검증: 코어 node:test 9/9 통과, `tsc --noEmit` 통과, ui
  `docs:check-links` 통과 (Linux sandbox). vite 빌드와 `ui:done:check` 는
  sandbox esbuild 플랫폼 제약으로 owner PC 에서 재실행 필요
  (`npm run ui:workspace:install` 후 `npm run ui:build`).
- 근거: `_workmeta/system/reports/procedure_capture/team_ops_board_fresh_design_20260602.md`
  의 MVP 1 범위. owner 결정 기록은
  `_workmeta/system/reports/procedure_capture/team_ops_board_mvp1_owner_decision_20260612.md`.
  작업자: `claude_fable-5`, branch `claude/fable5-deep-verification`,
  merge 전 owner/Codex 검증 대상.

### Revision `working` - Fable5 심층 검증: 장기 사용성 후보 12건 기록

- Fable 5 심층 검증(비전-실태 격차, 규칙 질량 대비 1인 운영 부담, 정본
  경계 drift, 문서 신선도)을 수행하고 결과를 backlog 기록으로만 남겼다.
  이번 변경에 동작/구조 수정은 없다.
- `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md` 다음 후보 표에
  10~21행을 추가했다: mission 경량 등록 경로, workflow/skill 사용 ledger,
  AI 세션 boot digest, foundation 문서 staleness 정리, CHANGELOG rotation,
  `.workflow` lifecycle/calibrations 위치 재결정, candidate queue archive
  규칙, doctor 플랫폼 binary 점검, 종료 절차 경량화 검토, V0 버전 기준,
  knowledge/RAG 통합 색인, Python 테스트 확장.
- 후보 10~17 의 상세 패킷 8건은 `_workmeta/system/dev_worker_candidate_queue/`
  에 `status: proposed`, `owner_approval.approved: false` 로 남겼다. 승인
  전에는 실행 큐로 승격하지 않는다.
- 검증 과정에서 양호로 판정한 항목(공개 문서 깨진 링크 0/164, done:check
  가 validate 단계를 포함하는 구조, node_modules gitignore 상태, 후보 큐
  처리율 17/20)은 후보에서 제외했다.
- 근거: 2026-06-12 Fable5 심층 검증 (owner 요청). 작업자: `claude_fable-5`,
  branch `claude/fable5-deep-verification`, merge 전 owner/Codex 검증 대상.

### Revision `working` - DB/검색 슬라이스: SQLite projection 스키마 계약과 Team Day-1 가이드

- `docs/architecture/guild_hall/SQLITE_PROJECTION_V0.md` 를 추가해 daily
  ledger, mission index, battle log 일 단위 aggregate, activity event 를
  local read-only SQLite projection 으로 모으는 스키마(DDL v0), loader 계약,
  FTS5 PoC 경계, rebuild-from-files 원칙을 고정했다. DB 파일은
  `guild_hall/state/projection/` local-only 로 두고 어떤 repo 에도 commit
  하지 않는다. loader/FTS5 구현은 Codex 몫으로 남긴다.
- `docs/architecture/foundation/TEAM_DAY_1_GUIDE_V0.md` 를 추가해 팀
  합류자/새 PC 운영자의 첫날 읽기 순서, 정본 7축 요약, 첫 명령, 경계
  5가지, 첫 기여 체크리스트를 한 장으로 고정했다.
- `docs/architecture/foundation/README.md` 와
  `docs/architecture/guild_hall/README.md` 색인에 두 문서 행을 추가했다.
- 근거: 20260611 보안 슬라이스 패킷의 DB/검색 슬라이스(6/18-20) Fable 5
  산출물 선행 작성. 작업자: `claude_fable-5`, merge 전 Codex 검증 대상.

### Revision `working` - 루프 슬라이스: triage board 계약, loop e2e 테스트 초안, 게임-업무 용어 대조표

- `docs/architecture/guild_hall/TRIAGE_BOARD_V0.md` 를 추가해
  `operation_board.sections.triage_board` projection 의 field 계약,
  metadata-only 입력 경계(INBOX triage register 의 count/date 신호만),
  validation 규칙, 구현 순서를 고정했다. 구현은 Codex 몫으로 남긴다.
- `guild_hall/snapshot/loop_e2e.test.mjs` 를 추가했다.
  `monster -> mission -> battle log` 가 synthetic fixture 에서 operation
  board 까지 보이는지 한 테스트로 고정하고, triage board 와 promotion
  projection 은 `test.todo` 로 남겼다. validate 스크립트 연결은 구현과 함께
  Codex 가 수행한다 (단독 실행: `node --test`, 현재 1 pass / 2 todo).
- `docs/architecture/foundation/SHARED_GLOSSARY_V0.md` 에 게임 용어 ↔ 업무
  용어 대조표 섹션을 추가해 팀 합류자가 게임식 표시 이름을 업무 용어로 읽을
  수 있게 했다.
- `docs/architecture/guild_hall/README.md` 색인에 triage board 계약 행을
  추가했다.
- 근거: 20260611 보안 슬라이스 패킷의 루프 슬라이스(6/15-17) Fable 5 산출물
  선행 작성. 작업자: `claude_fable-5`, merge 전 Codex 검증 대상.

### Revision `working` - index drift 정리: 정본 7축 표기와 party 한글 표면 보정

- `docs/architecture/foundation/REPOSITORY_PURPOSE.md` 의 `정본 6축` 을
  `AGENTS.md` 정본 구조와 일치하는 `정본 7축` 으로 갱신하고, 구조 개요도에
  `guild_hall` cross-project operations root 노드를 추가했다.
- `.party/pcb_revision_library_cell/party.yaml` 과
  `.party/systems_engineering_cell/party.yaml` 의 `primary_name_ko` 영문값
  2건을 한글(`설계자산`, `체계공학`)로 보정했다.
- `.workflow/authoring/` 의 승격 전 사본 2건(se_stage_artifact_gap_scan_v0,
  test_evaluation_execution_result_ingest_v0)은 승격본과 동일하지 않고
  authoring 전용 `task_note.md` 를 포함해 기계적 제거 조건을 충족하지 않았다.
  orphan workflow 2건(rag_source_text_quality_review_v0, rag_work_card_router_v0)
  과 함께 owner 결정 항목으로 `_workmeta/system` 기록에 남긴다.
- 근거: 20260611 보안 슬라이스 패킷 Task D (감사 취약점 #13, #14).
  작업자: `claude_fable-5`, merge 전 Codex 검증 대상.

### Revision `working` - control center file PUT 쓰기 토큰 가드 추가

- `ui-workspace/apps/renderer-web/controlCenterPlugin.ts` 의 control center
  file PUT API 에 `SOULFORGE_CONTROL_CENTER_WRITE_TOKEN` 기반 쓰기 가드를
  추가했다. 토큰 미설정 시 모든 PUT 은 403 으로 차단되고(fail-closed),
  GET/tree/snapshot 읽기 경로는 기존대로 동작한다.
- `docs/architecture/ui/UI_CONTROL_CENTER_MODEL.md` 핵심 원칙에 쓰기 가드
  한 줄을 동기화했다.
- 근거: 2026-06-11 Claude Fable 5 read-only 감사 취약점 #2 (무인증 write API),
  `_workmeta/system/reports/procedure_capture/20260611_claude_fable5_security_slice_packet.md`
  Task A. 작업자: `claude_fable-5`, branch `claude/fable5-slices-20260612`,
  merge 전 Codex 검증 대상.

### Revision `working` - Claude Code 용 CLAUDE.md 임포트 추가

- 루트에 `CLAUDE.md` 를 추가해 `@AGENTS.md` 한 줄로 저장소 헌장을 임포트하게 했다.
  Claude Code CLI 가 Codex 와 동일한 `AGENTS.md` 지침을 자동 로드한다.
- 이 변경은 `claude/add-claude-md` branch 에서 `claude_fable-5` 가 작성했고,
  merge 전 검증은 owner/Codex 몫으로 남겼다.

## 2026-06-11

### Revision `working` - Workflow generator provenance gaps closed by retrofit verdicts

- Added workflow-generator retrofit verdict evidence for the remaining
  generator-provenance gap queue under `_workmeta/system`, closing the
  registered workflow generator gap status without broad package logic rewrites.
- Preserved existing workflow logic and calibration evidence where packages
  were already valid, including simulation, RAG metadata/wiki, SE governance,
  and legacy active workflow packages.
- Kept default routes, party bindings, registrations, production-ready claims,
  private payloads, source payloads, and secrets unchanged.

### Revision `working` - Supplemental RAG workflow draft calibrations added

- Added public-safe synthetic quality-equivalence calibrations for the two
  unregistered RAG workflow packages that were outside the initial registered
  workflow precheck:
  `.workflow/rag_source_text_quality_review_v0/` and
  `.workflow/rag_work_card_router_v0/`.
- Recorded supplemental all-workflow profile-policy scan evidence under
  `_workmeta/system` showing 62 workflow packages and no remaining optimizer
  profile-policy gaps.
- Kept both RAG workflows unregistered and not default-route-safe; no index
  update, owner approval, source-truth claim, private payload, source text,
  NotebookLM answer/conversation payload, or production-ready claim was added.

### Revision `working` - Remaining workflow optimizer gap queue completed

- Added public-safe synthetic quality-equivalence calibrations for the final
  optimizer gap queue:
  `.workflow/se_assistant_operating_loop_v0/`,
  `.workflow/long_thread_handoff_v0/`,
  `.workflow/codex_thread_manager_v0/`, and
  `.workflow/daily_work_ledger_capture_v0/`.
- Updated each workflow profile policy to an active calibrated policy and
  recorded optimizer/workflow-check evidence under `_workmeta/system`.
- Closed the active optimizer sweep status with no remaining
  missing/placeholder optimizer entries, while keeping live pilots,
  default-route changes, production-ready claims, private payloads, and secrets
  out of scope.

### Revision `working` - Outlook mail reconcile calibration added

- Added a public-safe synthetic quality-equivalence calibration for
  `.workflow/outlook_mail_reconcile_v0/` and updated its profile policy from
  placeholder to an active measured policy.
- Recorded optimizer run and workflow-check evidence under `_workmeta/system`.
- Kept real Outlook access, Outlook mutation, mail body/HTML/msg/eml payloads,
  attachment payloads, attachment filename basis, project ledger writes,
  project mail-row publication, secrets, default-route changes, and
  production-ready claims out of scope.

### Revision `working` - External reasoning workspace calibration added

- Added a public-safe synthetic quality-equivalence calibration for
  `.workflow/external_reasoning_workspace_v0/` and updated its profile policy
  from uncalibrated runtime binding to an active measured controller-profile
  policy.
- Kept the external ChatGPT mode label as a visible user-authorized runtime
  selection rather than a hard-coded model or account claim.
- Recorded optimizer run and workflow-check evidence under `_workmeta/system`.
- Kept real browser actions, real ChatGPT prompt submission, cookies, tokens,
  passwords, session/storage inspection, raw URLs, account ids, conversation
  ids, transcripts, uploads, share links, account/permission/payment changes,
  default-route changes, and production-ready claims out of scope.

### Revision `working` - Outbound mail workflow calibration added

- Added a public-safe synthetic quality-equivalence calibration for
  `.workflow/outbound_mail_authoring_v0/` and updated its profile policy from
  not-requested placeholder to an active measured policy.
- Recorded optimizer run and workflow-check evidence under `_workmeta/system`.
- Kept real mail sends, Outlook mutation, SMTP action, real recipient payloads,
  attachment payloads, footer payloads, secrets, default-route changes, and
  production-ready claims out of scope.

### Revision `working` - AI 작업자 표기와 비-Codex 작업 branch 규칙 추가

- `AGENTS.md` 업무 기록 규칙에 AI 작업자의 도구+모델 표기 규칙을 추가했다.
  예: `codex_gpt-5.3`, `claude_fable-5`.
- Codex 외 AI 도구의 직접 수정을 전용 작업 branch 로 제한하고 merge 전
  owner/Codex 검증을 요구하는 규칙을 추가했다.
- 이 변경은 `claude/fable5-actor-logging-rule` branch 에서 `claude_fable-5` 가
  작성했고, 호스트 검증(`npm run validate`)은 merge 전 Codex 몫으로 남겼다.

## 2026-06-09

### Revision `working` - Latest update workflow calibration added

- Added a public-safe synthetic quality-equivalence calibration for
  `.workflow/latest_update_sync_and_followup_v0/` and updated its profile policy
  from draft/default to an active measured policy.
- Recorded optimizer run and workflow-check evidence under `_workmeta/system`.
- Kept real pulls, skill syncs, junction audits/repairs, host-local cloud roots,
  default-route changes, and production-ready claims out of scope.

### Revision `working` - GitHub upload workflow calibration added

- Added a public-safe synthetic quality-equivalence calibration for
  `.workflow/github_upload_publish_v0/` and updated its profile policy from
  draft/default to an active measured policy.
- Recorded per-workflow generator retrofit, optimizer run, and workflow-check
  evidence under `_workmeta/system`.
- Kept real git commands, commits, pushes, default-route changes, and
  production-ready claims out of scope.

### Revision `working` - Workflow canon sweep evidence added

- Added the missing `.workflow/meeting_followup/README.md` package surface so
  the registered workflow matches the `.workflow` package-shape contract.
- Recorded a metadata-only workflow-generator provenance sweep and optimizer
  preflight under `_workmeta/system`, separating package defects from missing
  provenance and blocked optimizer prerequisites.
- Kept default routes, party bindings, registration state, and production-ready
  claims unchanged.

### Revision `working` - Codex worker subagent-first policy tightened

- Updated `$soulforge-codex-thread-manager` and
  `.workflow/codex_thread_manager_v0/` so role worker threads are
  subagent-first lane controllers for substantive research, implementation,
  analysis, debugging, or review work.
- Added named no-subagent exceptions for lane planning, packet authoring, small
  deterministic local checks, integration, validators/status commands,
  manager-authorized narrow mechanical edits, unavailable subagent tools, and
  unsafe minimal packet boundaries.
- Required workers to record subagent use or a no-subagent exception, so direct
  worker execution becomes the exception rather than the default.

### Revision `working` - Codex thread manager verifier independence tightened

- Updated `$soulforge-codex-thread-manager` and
  `.workflow/codex_thread_manager_v0/` so fork, rollover, and continuation are
  same-role continuity surfaces, not independent verification evidence.
- Required fresh-context verifier, judge, reviewer, workflow-check, or
  acceptance lanes for claims that depend on independent judgment.
- Defined minimal verifier packets around objective, changed refs, acceptance
  criteria, validators, claims, and risk areas while excluding raw transcript
  leakage.
- Added stop/claim-lowering behavior when a fresh independent verifier is
  unavailable for a stronger readiness or approval claim.

### Revision `working` - Outbound mail authoring workflow added

- Added `.workflow/outbound_mail_authoring_v0/` as a registered structure-only
  workflow for owner-style outbound mail drafting, project keyword subject
  resolution, mandatory signature/security footer checks, and owner-approved
  send handoff preparation.
- Set the workflow footer preference to the Outlook default signature logical
  name `서명+보안`, while keeping the account-specific suffix and exact footer
  payload out of public canon.
- Registered `/outbound-mail` as the human-facing alias while keeping default
  external send authority disabled.
- Added `.registry/skills/outbound_mail_authoring/` as the thin Codex launcher
  skill that resolves to the workflow and reads workflow-owned profile policy
  at execution time.
- Kept exact project keyword tables, raw mail bodies, attachment payloads,
  secrets, exact footer contact values, and full company security disclaimer
  text out of public workflow canon.

### Revision `working` - Workflow launcher skill author added

- Added `.registry/skills/workflow_launcher_skill_author/` as the tracked
  Codex authoring aid for turning existing `.workflow/<workflow_id>/` packages
  into thin launcher skills.
- Mirrored the existing party launcher author pattern while keeping workflow
  bodies, step graphs, profile policies, optimizer outputs, project payloads,
  and runtime bindings outside the generated launcher skill.
- Added guidance for default launcher ids by stripping trailing workflow
  version suffixes, for example `outbound_mail_authoring_v0` to
  `outbound_mail_authoring`.

### Revision `working` - Codex thread manager launcher semantics tightened

- Updated `$soulforge-codex-thread-manager` so explicit invocation with an
  actionable goal is treated as authorization for the current Codex thread to
  act as manager and create a bounded worker Codex thread when runtime tools are
  available.
- Kept fresh manager creation for rollover, cross-PC/overnight continuity,
  mission-boundary changes, context drift, or explicit request rather than the
  default launcher behavior.
- Added worker subagent rules: bounded worker subagents are allowed by default
  when useful, worker packets must state subagent bounds or denial, and larger
  side effects require manager permission.
- Added routing rules separating non-durable subagent work from durable Codex
  worker threads, and clarified that worker threads may create bounded
  subagents inside their assigned lane.
- Re-centered the workflow on the declared thread as main team lead for long
  context management: handoff refresh, compact, clear/reset, rollover,
  re-anchoring, role worker threads, cross-worker result routing, and worker
  subagent fan-out.
- Removed the fixed worker-subagent count. Worker subagent fan-out is now
  scope-driven unless the manager packet sets a specific limit.

### Revision `working` - Mail send style policy added

- Added `MAIL_SEND_STYLE_POLICY_V0.md` to lock draft, approval, Outlook manual
  sending, subject, body style, and metadata-only sent-mail recording rules.
- Corrected the subject convention so outgoing mail uses real mail keywords
  such as `[기뢰전]`, not internal company/Soulforge project numbers.
- Required final sent mail to retain the owner Outlook footer block: signature
  plus company security notice, exactly once.
- Kept actual mail bodies, raw Outlook items, attachments, private paths,
  secrets, and recipient payloads out of the public contract.
- Linked the policy from the existing mail send/workspace docs while leaving
  the SMTP runner and Outlook reconcile workflows under their existing owners.

### Revision `working` - O-ring calculator tool canon registered

- Added `.registry/tools/oring_selection_calculator/` as a limited-authority
  canonical tool entry for first-pass O-ring squeeze, installed-stretch, and
  gland-fill screening.
- Kept the actual workbook outside public canon as a workspace artifact with
  private metadata pointers, and recorded that the tool does not replace
  manufacturer catalogs, official size tables, tolerance analysis, extrusion
  review, or owner engineering judgment.

### Revision `working` - Charge breaker and evidence sift bridges added

- Added tracked Codex bridges for `charge_breaker` and `evidence_sift` so the
  existing canon skills sync into global installed skills as
  `$soulforge-charge-breaker` and `$soulforge-evidence-sift`.
- Kept both bridges lean: `charge_breaker` owns only localized blocker forward
  pressure, and `evidence_sift` owns only claim-confidence separation before
  drafting or deciding.
- Updated the skill registry README without moving workflow, owner approval,
  source truth, or validation authority into either skill.

### Revision `working` - Browser recovery standing approval documented

- Recorded the owner's standing approval for Soulforge agents to recover
  Chrome/Codex browser connections across threads without repeated prompts.
- Scoped the approval to opening the selected Chrome profile window, retrying
  Codex Chrome connection, and running non-secret local setup checks for an
  already requested browser-backed task.
- Kept external transmission, uploads, permission changes, purchases, CAPTCHA,
  secret handling, and extension/software install or repair under the existing
  action-time confirmation and secret-boundary rules.

## 2026-06-08

### Revision `working` - Codex thread manager workflow draft added

- Added `.workflow/codex_thread_manager_v0/` as a public-safe pilot-ready
  workflow package for actual Codex manager, worker, and worktree thread
  orchestration.
- Captured manager lifecycle, `NIGHT_WORK_HANDOFF` refresh, worker packet
  shape, thread id/title recording, manager rollover acceptance, worktree
  boundary routing, recursive fan-out blocking, and conservative closeout rules.
- Kept the package unregistered: no `.workflow/index.yaml` registration, no
  `.party` chain, no registry skill bridge, no default-route-safety claim, no
  production-ready claim, and no full manager rollover/worktree-worker execution
  claim.

### Revision `working` - Codex thread manager registered bridge completed

- Added `.registry/skills/codex_thread_manager/` as the tracked Codex launcher
  for invoking the `codex_thread_manager_v0` workflow through installed skill
  `$soulforge-codex-thread-manager`.
- Registered `.workflow/codex_thread_manager_v0/` in `.workflow/index.yaml` and
  raised the package from pilot-ready draft to registered public-safe workflow
  bridge.
- Kept the same non-party structure as `long_thread_handoff_v0`: no `.party`
  chain, no default-route switch, no production-ready claim, and no full manager
  rollover/worktree-worker execution claim.

### Revision `working` - Dual deep research external lanes added

- Extended `.workflow/dual_deep_research_v0/` to keep its NotebookLM CLI +
  Codex direct research core while allowing optional Gemini and GPT web Deep
  Research advisory packets before comparison.
- Added external Deep Research packet, comparison, handoff, boundary, role, and
  monster-rule coverage so Gemini/GPT reports remain independent, advisory, and
  public-safe.
- Updated the canonical `dual_deep_research` Codex launcher metadata to trigger
  for Gemini/GPT Deep Research comparison requests without moving account auth,
  Drive upload, source truth, owner approval, or canon promotion authority into
  the skill.

## 2026-06-07

### Revision `working` - External GPT launcher skill added

- Added `.registry/skills/external_gpt/` as the tracked Codex
  launcher for invoking the registered `.workflow/external_reasoning_workspace_v0`
  workflow by skill name, with installed invocation
  `$soulforge-external-gpt`.
- Kept the launcher thin: the workflow still owns browser preflight,
  same-goal session reuse, sanitized prompt packets, DOM message-role readback,
  advisory handoff, profile policy, and public/private side-effect boundaries.
- Preserved non-claims: no party binding, no default-route switch, no source
  truth, no validation authority, no production-ready claim, and no
  default-route-safety claim.

### Revision `working` - External reasoning workspace registered

- Registered `.workflow/external_reasoning_workspace_v0/` in
  `.workflow/index.yaml` after the owner requested making the workflow official.
- Updated the package state from draft/unregistered to registered while keeping
  the existing private pilot evidence boundary: advisory-only output, no source
  truth, no validation authority, no production-ready claim, and no
  default-route-safety claim.
- Kept party binding and runtime profile selection unbound; browser session
  pointers, raw transcripts, account-bound ids, cookies, credentials, and
  private payloads remain outside public canon.

### Revision `working` - Healer snapshot refresh added

- Updated healer runs to refresh the local sanitized snapshot before always-on
  freshness checks, so gateway metadata changes do not repeatedly trigger
  `latest_snapshot_map_freshness` failure notifications.
- Ignored accidental literal `$CODEX_HOME/` runtime mirrors at the repo root so
  local automation memory files are not treated as public changed-scope source.
- Corrected the mail task register latest-file boundary to resolve relative
  projection paths against the active repo root while still checking realpaths
  for denied private-state, mailbox, and `_workspaces` targets.
- Kept the behavior local-state only: no automatic commit, push, merge, reset,
  stash, raw mail payload read, or secret/env inspection was added.

### Revision `working` - External reasoning workspace workflow draft added

- Added `.workflow/external_reasoning_workspace_v0/` as a public-safe draft
  workflow package for a session-aware external ChatGPT advisory browser loop.
- Captured bounded goal and side-effect authorization, Chrome/ChatGPT preflight
  without secret inspection, same-goal conversation reuse, visible
  user-authorized Pro / Thinking-like mode label selection, marker/nonce prompt
  packets, DOM message-role readback, default turn limits, and advisory handoff
  rules.
- Kept the package unregistered: no `.workflow/index.yaml` change, no raw
  private payloads or transcripts, no account-bound URLs or ids, no source-truth
  or verifier-authority claim, and no default-route-safety claim.
- Recorded bounded private pilot evidence with marker-verified assistant-role
  DOM readback. This upgrades the package claim only to private pilot execution
  evidence; it remains unregistered and makes no production-ready or
  default-route-safety claim.

### Revision `working` - External reasoning workspace handoff captured

- Added a public-safe external reasoning workspace candidate note for using a
  session-aware ChatGPT Pro / Thinking browser loop as an advisory support lane.
- Documented that `long_thread_handoff_v0` remains the manager/checkpoint owner
  while any future `external_reasoning_workspace_v0` workflow should own Chrome
  session preflight, bounded prompt packets, multi-turn DOM readback, private
  URL pointers, and side-effect boundaries.
- Kept raw transcripts, account-bound conversation/project identifiers, secrets,
  cookies, local storage, credentials, and external validation claims out of the
  public repo.

## 2026-06-06

### Revision `working` - Knowledge RAG candidate ledger added

- Added `guild_hall/knowledge_access/knowledge_rag_candidate_ledger.mjs`
  with metadata-only candidate row building, validation, append-only JSONL
  capture, and batch dry-run triage for deferred knowledge/RAG candidates.
- Added `candidate-ledger-append`, `candidate-ledger-validate`, and
  `candidate-ledger-triage` to the knowledge access CLI, plus
  `validate:knowledge-rag-candidate-ledger` and coverage in
  `validate:knowledge-access`.
- Documented `_workmeta/<system|Pxx-xxx>/knowledge_rag_candidate_ledger/**`
  as the runtime storage surface while keeping raw payloads, Office/PDF/HWP
  refs, NotebookLM answers, private prompts/questions, source-text chunks,
  sourcebound review, RAG ingestion, ontology/canon promotion, graph mutation,
  archive, and retire actions out of scope.

### Revision `working` - Daily work ledger validator and renderer added

- Added `guild_hall/daily_ledger/` with an explicit-file/ref validator, CLI,
  and ledger-only Markdown draft renderer for project, `P00-000_INBOX`, and
  Soulforge sub-ledger daily ledgers.
- Added `validate:daily-ledger` and root acceptance wiring, with fixture tests
  for project/inbox/Soulforge ordering, missing/incomplete gaps, raw payload
  refs/fields, runtime paths, secret-like refs, invalid project codes, unknown
  sub-ledgers, and non-ledger renderer inputs.
- Documented the automation boundary while keeping live `_workmeta` scans,
  raw mail/attachment/Office/PDF/HWP/waveform payloads, `_workspaces` payloads,
  git/system-log rediscovery, project-code truth, and production rollout out of
  scope.

### Revision `working` - Mail task register always-on lane added

- Added `guild_hall/gateway/mail_task_register.mjs` and the
  `register-mail-tasks` gateway CLI command to convert safe exact-route
  `mail_work_priority` rows into project-local open-action Markdown rows.
- Kept the command dry-run by default; `--apply` is required for
  `_workmeta/<project_code>/reports/open_actions/open_action_register.md`
  writes, and non-exact/P00/personal/promo/terminal/raw-boundary rows stay
  owner-review or skipped.
- Added optional `--notify` queueing through existing town_crier
  `mail_received` gateway policy and reported private metadata sync as manual
  commit/push preparation, not an automatic raw data copy.

### Revision `working` - Mail projection private-state rebuild policy documented

- Documented that `mail_candidate` queue/status projections and
  `mail_work_status` / `mail_work_priority` latest JSON outputs are not
  mirrored into `private-state`.
- Clarified that owner-with-state PCs restore only the existing private-state
  continuity allowlist and rebuild body-safe activity summaries, mail work
  projections, and Assistant Dashboard health locally.
- Added dashboard guidance to show missing/stale/degraded mail projection state
  instead of treating private-state copies as source truth.
- Kept raw mail bodies, HTML, attachment payloads, attachment names/URLs/paths,
  secrets, `_workspaces` payloads, and private-state allowlist expansion out of
  scope.

### Revision `working` - Team Ops Board package-clean caveat resolved

- Verified the standalone Team Ops Board mockup app files are tracked under
  `ui-workspace/apps/team-ops-board-mockup/`.
- Documented that the mockup is a tracked `ui-workspace` app package included
  in the Team Ops, UI workspace, and root UI build paths.
- Kept this to sample-data package tracking only: no Smartsheet integration,
  private project data, raw mail or attachments, `_workspaces` payload,
  renderer-web integration, write-back behavior, or source-of-truth behavior was
  added.

### Revision `working` - Gateway helper package-clean caveat resolved

- Verified `guild_hall/gateway/mail_candidate_backlog.mjs` and
  `guild_hall/gateway/deadline_watchdog_reminder.mjs` are tracked package refs.
- Changed gateway CLI package coverage from the previous skip diagnostic to a
  hard tracking assertion, so gateway index validation no longer carries the
  package-clean caveat skip.
- Updated the mail work status and deadline watch contracts to mark the helper
  tracking gate closed while keeping raw mail, attachment payload, `_workspaces`
  payload, and secret reads out of scope.

### Revision `working` - Project mail history XLSX readability implemented

- Reformatted the JavaScript project mail-history XLSX export into
  human-readable ledger sheets for all mail, received mail, sent mail, and
  review-needed rows.
- Added frozen/filterable headers, readable widths, wrapped subject/status/source
  text, date and attachment-count formatting, and a hidden technical metadata
  sheet while keeping CSV and ICS behavior unchanged.
- Added XLSX smoke coverage proving the export avoids raw mail bodies,
  attachments, raw paths, and secrets.

### Revision `working` - Shared glossary added

- Added a public-safe Korean-facing shared glossary for Soulforge development
  terms including candidate, approval, execution queue, RAG, canon,
  sourcebound review, claim ceiling, workflow, party, mission, and dev-worker
  queue.
- Linked the glossary from the foundation index and root README as a vocabulary
  bridge, not a new backlog owner or source-truth surface.
- Kept private project payloads, raw source content, mail bodies, attachments,
  and secrets out of the glossary.

### Revision `working` - Mail quoted-chain project routing evidence added

- Extended mail project routing suggestions so private-deep body/html matches
  can distinguish current-message evidence from quoted reply/forward-chain
  evidence.
- Added `route_source: quoted_chain_private_deep`, `route_source:
  mixed_private_deep`, and `quoted_body` / `quoted_html` matched surfaces for
  reply/forward cases while keeping raw body, raw HTML, attachment filenames,
  URLs, and provider payloads out of routing outputs.
- Added gateway mail-candidate regression tests for quoted-only, mixed
  current/quoted, HTML blockquote, current `Subject:` line, and split required
  term routing cases.

### Revision `working` - Outlook project mail reconcile workflow draft added

- Added an authoring draft workflow for metadata-only Outlook sent-mail
  reconciliation and received-mail cross-validation.
- Kept the workflow unregistered, with Outlook mutation, raw body reads,
  `.msg` export, attachment export, secrets, and public project mail rows out of
  scope.
- Preserved `_workmeta` project mail history as the source-truth ledger and
  treated `_workspaces` XLSX files only as readable owner-facing exports.

### Revision `working` - Outlook mail reconcile workflow registered

- Promoted the Outlook project mail reconciliation draft into registered
  workflow `outlook_mail_reconcile_v0`.
- Added short human invocation alias `/outlook-reconcile` while keeping canonical
  execution resolution on `outlook_mail_reconcile_v0`.
- Kept the workflow structure-only and metadata-only: no Outlook mutation, no
  raw body reads, no `.msg` or attachment export, no default-route authority,
  and no pilot-execution claim.

### Revision `working` - Outlook mail reconcile launcher skill added

- Added `.registry/skills/outlook_mail_reconcile/` as the tracked Codex launcher
  for invoking `/outlook-reconcile` through registered workflow
  `outlook_mail_reconcile_v0`.
- Kept the launcher thin: it resolves workflow-owned contracts at execution
  time and does not copy Outlook runtime state, mail payloads, profile policy,
  project ledger rows, or mutation authority into the skill.
- Documented that legacy Outlook `.msg` intake and expansion routes are not
  canonical dependencies of the metadata-only reconciliation launcher.

### Revision `working` - Outlook reconcile default project scope corrected

- Updated `outlook_mail_reconcile_v0` so `/outlook-reconcile` defaults to all
  Codex-managed project mail ledgers when the user does not name a project.
- Excluded unresolved inbox holding ledgers such as `P00-000_INBOX` from
  automatic project sync while keeping them available as review/mapping buckets.
- Clarified that the planned Codex-managed Outlook folder area is a separate
  owner-approved Outlook operations task; the reconcile workflow still does not
  create folders, move mail, or edit Outlook rules.

### Revision `working` - Daily automation post-ledger checks recorded

- Extended `.party/daily_automation_party/` so the evening activity-sync to
  daily-ledger flow now hands off to `npm run guild-hall:snapshot` and then
  `npm run validate:workmeta-payload` before night watch runs.
- Documented the snapshot refresh as a local state regeneration step for
  healer and operation-board freshness, and the workmeta-payload validation as
  a metadata-boundary receipt.
- Kept the additions as command-backed handoffs, not new workflow
  registrations, scheduler ACTIVE/PAUSED state, or raw/private payload writes.

### Revision `working` - Healer failure notification route fixed

- Allowed `town_crier` to process `healer_failed` pending notifications so a
  healer failure queue item no longer loops as
  `invalid_pending_request:unsupported_owner_scope`.
- Normalized the synthetic marker assertion so the healer failure notification
  test passes on Windows text-mode newline output.
- Localized healer run summaries, next actions, and failure notification text
  into Korean for owner-facing reports and Telegram messages.
- Kept mail fetch, mailbox storage, and public/private payload boundaries
  unchanged.

### Revision `working` - Daily automation party registered and locally bound

- Promoted `daily_work_ledger_capture_v0` from workflow authoring into
  `.workflow/daily_work_ledger_capture_v0/` and registered it in
  `.workflow/index.yaml`.
- Promoted `daily_automation_party` into `.party/daily_automation_party/` and
  registered it in `.party/index.yaml`.
- Bound the local daily automation concept so morning and evening activity sync
  are followed by daily work ledger capture before report rendering.
- Kept scheduler clock and ACTIVE/PAUSED state in the local Codex app
  automation layer, not public canon.

### Revision `working` - Daily automation party draft added

- Added `.party/authoring/daily_automation_party/` as a draft cadence party
  where the existing morning and evening activity sync automations hand off to
  daily work ledger capture before owner-facing reports consume ledgers.
- Kept the party unregistered in `.party/index.yaml` and made no Codex app
  automation, launchd, scheduler, or default-route state change.
- Updated the automation party model and Codex app automation catalog so the
  future `Soulforge Daily Work Ledger Collector` runs after activity sync
  receipts instead of acting as a report-time search job.

### Revision `working` - Daily work ledger taxonomy and capture workflow draft added

- Added `.workflow/authoring/daily_work_ledger_capture_v0/` as a
  workflow-generator-authored draft for writing company project,
  `P00-000_INBOX`, and Soulforge sub-ledger daily work ledgers from approved
  metadata surfaces before reports run.
- Kept the draft unregistered in `.workflow/index.yaml`, unbound from
  `daily_automation_party`, and separate from Codex app local schedule state.
- Added metadata-only ledger, skipped-source, review-needed, receipt, handoff,
  and boundary-review templates so later report renderers can read ledgers only.
- Clarified that `P00-000_INBOX` is the reserved company general/unresolved
  work ledger for real company work without a confirmed project code, separate
  from the Soulforge system ledger and personal/promotional buckets.
- Added `docs/architecture/workspace/DAILY_WORK_LEDGER_TAXONOMY_V0.md` to fix
  the owner-facing split between confirmed company projects, company
  general/unassigned work, and Soulforge sub-ledgers.

### Revision `working` - Automation party operating model added

- Added a project-wide automation party operating model that separates
  workflow, party, cadence party, local scheduler, ledger, and report
  authority.
- Strengthened the rule that recurring jobs must enter the daily, weekly, or
  monthly party worldview before becoming shared Codex app automation defaults.
- Documented the daily work ledger collector as a daily automation party stage,
  keeping collection separate from report rendering.

### Revision `working` - Project mail history XLSX readability candidate added

- Added a roadmap candidate to improve project mail-history XLSX exports under
  `_workspaces` so the spreadsheet is usable for human review instead of
  looking like an unformatted CSV mirror.
- Added a proposed dev-worker candidate packet that keeps `_workmeta` as the
  metadata-ledger surface while treating `_workspaces` XLSX files as
  owner-facing readable exports.
- Kept raw mail bodies, attachments, Outlook rule state, secrets, and workbook
  source-of-truth changes out of scope.

### Revision `working` - SE template library rules clarified

- Defined `_workspaces/SE_TEMPLATE_LIBRARY/` as the canonical actual-file
  reusable SE artifact library/store, not a pointer-only surface and not a
  project execution baseline.
- Clarified that project-local latest authoring files stay project-local;
  library samples are copied or materialized as sample outputs/files, not moved.
- Kept library workflow files limited to executable procedure, with paths,
  hashes, copy history, version/classification, and provenance recorded in
  manifests or catalogs.
- Kept common document rules separate from artifact-specific authoring rules,
  and reaffirmed that `_workmeta` stores metadata, pointers, hashes, and
  evidence only, not actual payload files.

### Revision `working` - SE template library workspace alias seeded

- Added `_workspaces/SE_TEMPLATE_LIBRARY/` as the local-only SE foldertree-shaped
  artifact library root and kept `_workspaces/system/` scoped to reusable lab
  and fixture outputs.
- Corrected document-producing snapshot rules so project work materializes a
  chosen official form or owner-approved artifact material into `00_Temp/template_snapshot/` before
  generation.

### Revision `working` - Project document template snapshot rules added

- Clarified that `_workspaces/SE_TEMPLATE_LIBRARY/` is the local-only SE
  foldertree-shaped artifact library root, while document-producing project work uses a project-local
  `00_Temp/template_snapshot/` baseline and optional
  `00_Temp/workflow_candidate/` candidates.
- Documented separate official form, snapshot, input bundle, artifact, and workflow
  version axes, plus snapshot manifest metadata and post-edit validation
  refresh requirements.

### Revision `working` - Mail fetch project history ICS LF writer fixed

- Wrote Python mail-fetch project-history ICS files with explicit newline
  handling so Windows hosts do not convert the repository metadata export to
  CRLF.
- Kept CSV and ICS metadata exports aligned with the existing line-ending
  hygiene expectations and gateway mail-fetch fixture assertions.

### Revision `working` - Workmeta payload symlink fixture Windows skip added

- Skipped the synthetic workmeta payload symlink fixture when Windows denies
  symlink creation with `EPERM` or `EINVAL`, matching the existing local path
  policy symlink test behavior.
- Kept the actual workmeta payload policy unchanged; the change only prevents a
  validator fixture from failing on Windows hosts without symlink privileges.

### Revision `working` - Daily work ledger automation candidate added

- Added a roadmap candidate for metadata-only daily work ledgers that separate
  project ledger collection, system ledger collection, and final worklog
  writing.
- Defined the intended source split so worklog writing reads only daily ledger
  surfaces, orders company project work before system work, and avoids scanning
  mail bodies, attachments, raw source files, or ad hoc git history directly.
- Kept raw payloads, owner-only ledgers, and scheduled host runtime details out
  of public canon; detailed operating evidence stays under `_workmeta`.

### Revision `working` - Long thread handoff Codex bridge refreshed

- Refreshed the `soulforge-long-thread-handoff` Codex bridge with the latest
  checkpoint refresh, compact/clear, fresh-session, and context hygiene
  guidance from the installed skill mirror.
- Added the public-safe context-management notes reference under the tracked
  skill bridge without storing raw transcript, private payload, or credential
  material.
- Aligned the tracked Soulforge skill entry with the new autonomous context
  reset decision capability.

## 2026-06-05

### Revision `working` - Codex app automation catalog added

- Added a tracked Codex app automation catalog that separates versioned
  automation concepts from PC-local Codex app `automation.toml` state.
- Documented the current default automation purposes, reader tiers, paused
  companion checks, and the small set of reports meant for routine human
  reading.
- Captured the planned daily work ledger split where a background collector
  writes daily ledgers first and report automations only format those ledgers.
- Linked the catalog from the guild_hall architecture README.

### Revision `working` - Long thread handoff workflow registered

- Added registered structure-only workflow `long_thread_handoff_v0` for
  long-running, overnight, or cross-session Soulforge work.
- Captured durable `NIGHT_WORK_HANDOFF`, fresh-subagent delegation,
  autonomous compact/clear timing, validation, and conservative closeout as a
  public-safe workflow package without raw transcript, private payload, secret,
  pilot-execution, default-route, or production-ready claims.
- Registered the workflow in `.workflow/index.yaml` and documented it in
  `.workflow/README.md`.

### Revision `working` - Private-state continuous sync added

- Added a deterministic `guild-hall:private-state:sync` command that mirrors
  only the private-state allowlist from local `guild_hall/state/**`, blocks
  denied secret-like filenames, and commits/pushes only the nested
  `private-state` repo.
- Added LaunchAgent coverage for `ai.soulforge.private-state-sync` so the
  always-on node can keep protected mailbox continuity updated without using
  the public repo.
- Moved generated LaunchAgent stdout/stderr paths to
  `~/Library/Logs/Soulforge/` so launchd jobs do not depend on writing log
  files under the external workspace root.
- Removed the redundant LaunchAgent `WorkingDirectory` key; each command still
  changes into the repo explicitly, avoiding launchd getcwd noise on external
  workspaces.

### Revision `working` - Source text traceability sidecar risk inventory guard added

- Hardened source-text traceability sidecar validation with metadata-only
  risk inventory consistency checks for chunk counts, page-backed chunk counts,
  page summary totals, and required warning codes.
- Blocked synthetic source-truth, owner-approval, and canon-promotion authority
  aliases from source-text metadata artifacts.
- Added synthetic sidecar coverage without reading live `_workspaces`,
  `_workmeta`, guild_hall state, private-state, source payload, or NotebookLM
  payload content.

### Revision `working` - Renderer Operation Board fixture smoke added

- Added renderer-web smoke coverage for the public-safe Operation Board
  fixture snapshot mapping without reading live state or private payloads.

### Revision `working` - Team Ops Board mockup read-only lint coverage

- Extended UI read-only boundary lint coverage to include Team Ops Board mockup
  TS/TSX code without reading protected paths or live payloads.

### Revision `working` - Assistant Dashboard secret alias marker hardening

- Hardened Assistant Dashboard read-only metadata rollup marker checks for
  broader secret and credential alias labels.
- Added coverage with a synthetic ledger fixture only, without reading real
  private ledger payloads or secret files.

### Revision `working` - Dev-worker owner-approved trigger policy updated

- Changed dev-worker candidate promotion so owner-approved active candidates are
  promotable when the local dev-worker automation trigger is ACTIVE, without a
  second per-task start phrase.
- Updated the dev-worker automation prompt, docs, audit display tests, and
  current approved candidate metadata so the owner controls automatic
  development by toggling the local automation on or off.

### Revision `working` - Town crier env state-root guard added

- Hardened town_crier runtime env file resolution so explicit Telegram env file
  paths must stay under `guild_hall/state/town_crier/**`.
- Added synthetic temp-root rollback coverage for absolute and traversal env
  paths outside the town_crier state root, without reading real env files,
  live state payloads, or sending Telegram notifications.

### Revision `working` - Source sync ready live-id authority alias guard added

- Hardened source sync ready manifest validation so live Drive/NotebookLM ID
  aliases and approval/canon authority aliases are rejected as metadata-only
  boundary contamination.
- Added synthetic negative coverage for those aliases with file checks disabled,
  keeping the guard free of live Drive, NotebookLM, source payload, or
  `_workspaces` file reads.

### Revision `working` - Dev-worker gateway broad-scope rejection fixture added

- Added synthetic auto-approval coverage confirming direct
  `guild_hall/gateway/**` write scope stays rejected.

### Revision `working` - Local absolute path symlink no-follow guard added

- Hardened local absolute path policy scanning so git-listed symlink file
  entries are skipped before any content read, without resolving or reporting
  their targets.
- Added synthetic temp-repo coverage proving an outside symlink target carrying
  a sentinel local path does not create violations or leak target details in
  human or JSON output.

### Revision `working` - Daily work packet owner-approval display guard added

- Added display-only `owner_approval_state` labels to daily work packet
  dev-worker candidate rows so owner-approved proposed candidates are distinct
  from unapproved proposed candidates.
- Added synthetic regression coverage confirming approval-only display does not
  change candidate counts, promotable counts, candidate status, input candidate
  objects, or promotion claims.

### Revision `working` - Morning report source ref scheme guard added

- Hardened morning report battle-log source cell parsing so rows must use a
  known safe `source_kind:source_ref` scheme with a non-empty safe ref.
- Added synthetic rejection coverage for malformed source cells, URL/file refs,
  token-bearing refs, local absolute paths, traversal, unknown kinds, and
  private/raw/source-payload labels without echoing unsafe source values.

### Revision `working` - Workspace junction non-link redaction fixture added

- Added synthetic coverage for declared workspace aliases that are real
  directories or regular files instead of symlink/junction pointers, confirming
  they report owner-decision-required non-link gaps without local absolute path
  leakage in object or human CLI output.

### Revision `working` - Workmeta payload symlink extension guard added

- Flagged blocked `_workmeta/**` symlink names such as `.xlsx`, `.pdf`, and
  `.zip` by entry path without following targets, while keeping `.git` and
  `_workspaces` out of scope.

### Revision `working` - Local absolute path report redaction added

- Redacted local absolute path policy violation and repo-root values in object,
  JSON, and human report output while keeping category, location, length, and
  fingerprint metadata for debugging.

### Revision `working` - Knowledge graph explicit graph-ref payload guard added

- Blocked explicit retrieval-plan `--graph-ref` graphs when synthetic
  source/chunk text, NotebookLM answer/question, raw query, secret-like values,
  file URLs, or local absolute paths appear inside graph JSON without echoing
  payload values in blocker output.

### Revision `working` - Workmeta sync skip-commit dirty guard added

- Blocked workmeta sync when metadata remains dirty after pull while
  `skipCommit` is enabled, so the run cannot report completed or already
  current with uncommitted metadata still present.
- Added synthetic runCommand coverage for the post-pull dirty skip-commit path
  without touching a real `_workmeta` repo or git remote.

### Revision `working` - RAG work-card payload boundary fixture added

- Added synthetic negative coverage for source-text quality review and RAG
  work-card validators so source text, chunk text, raw query, question, file
  URL, local absolute path, and fake secret-like markers are blocked without
  echoing fixture body values in validation output.
- Hardened work-card boundary scanning with path-scoped blocker codes for
  forbidden payload keys, secret-like keys/values, file URLs, and local
  absolute paths while keeping generated validation output metadata-only.

### Revision `working` - Daily work packet candidate visibility guard added

- Prioritized daily work packet display candidates so promotable,
  auto-approvable, and active attention candidates stay visible ahead of
  completed or closed dev-worker candidates.
- Kept dev-worker candidate counts and summary counts based on the full
  candidate queue, without changing candidate approval, promotion, or status
  records.

### Revision `working` - Dev-worker stale automation handoff guard added

- Added read-only dev-worker automation check mode for synthetic or provided
  TOML files, comparing only `id`, rendered `prompt`, `cwds`, and
  `execution_environment` against the tracked local render settings.
- Kept `status`, `rrule`, and timestamps as PC-local owner settings, and limited
  check output to short status metadata plus prompt hashes without printing
  prompt bodies, TOML bodies, local paths, or private payloads.

### Revision `working` - Operation Board fixture lint added

- Added a synthetic public-safe Operation Board snapshot fixture under
  `ui-workspace/fixtures/operation-board/` without copying live
  `guild_hall/state/**` payloads.
- Added a dedicated UI lint that checks Operation Board fixture schema versions,
  public-safe privacy mode, section count mirrors, row/group/item allowed
  fields, action queue mirrors, and raw/private/source contamination markers.
- Extended the fixture lint so Knowledge Lane blockers, Battle Log project
  aggregates, Diagnostics items, and top-level Diagnostics warning/error rows
  reject unknown fields while keeping the whole `operation_board` projection
  open to future fields.
- Added Diagnostics mirror checks between Operation Board diagnostics counts,
  section items, and top-level Diagnostics summary/warnings/errors arrays.
- Wired the fixture lint into UI lint scripts and documented that the fixture is
  not source truth.

### Revision `working` - Operation Board section field guard added

- Hardened snapshot validation so Operation Board Dungeon Map, Mission Board,
  and Monster Gate row/group/item projection objects reject unknown fields.
- Kept the guard scoped to documented section row/group/item shapes instead of
  closing the whole `operation_board` projection against future fields.
- Added synthetic negative coverage for raw/source/attachment ref-like fields
  without reading live state or private payloads.

### Revision `working` - Snapshot next action field guard added

- Hardened snapshot validation so `next_actions[*]` rejects unknown fields
  beyond the public action summary shape.
- Hardened Operation Board action queue validation so
  `operation_board.sections.action_queue.items[*]` rejects unknown fields
  beyond the mirrored action summary and rank.
- Added synthetic negative coverage for raw payload/source ref-like fields
  without regenerating live snapshot state.

### Revision `working` - Assistant dashboard snapshot contract health guard added

- Hardened assistant dashboard `ai_data_health` so the snapshot row reports
  `invalid` when the stored snapshot contract fails even if its timestamp is
  fresh.
- Degraded the dashboard status for invalid snapshot health while keeping
  valid snapshot freshness as `fresh`, `stale`, or `missing`.
- Added synthetic metadata-only coverage without reading real
  `guild_hall/state/**` payloads.

### Revision `working` - Town crier local status guard added

- Added `status --local-root <path>` for synthetic town_crier status checks
  without reading the live operation state or Telegram env.
- Rejected missing `--local-root` values and filesystem root targets.
- Added synthetic disabled-notification coverage so gateway no-op policy paths
  do not create a pending town_crier queue.

### Revision `working` - RAG source-text artifact contamination guard added

- Hardened source-text index, answer-run, and traceability-sidecar validation
  against hidden raw query, NotebookLM answer, credential/session/token/secret,
  file URL, and local absolute path contamination.
- Kept `chunks[].chunk_text` and `response.answer_text` as private payload
  exception paths while blocking the same keys and values elsewhere.
- Tightened those exception paths so only string payloads bypass recursive
  contamination scanning.
- Added synthetic negative coverage without reading real workspace payloads,
  raw mail, NotebookLM answers, private state, or secrets.

### Revision `working` - RAG run report shape guard added

- Hardened `source_text_extraction_run_report_v0` validation so generated
  report objects reject unknown top-level and nested keys before they can carry
  source locator, private payload, raw payload, or harmless-looking extra
  fields.
- Added synthetic coverage for unknown keys in run report sections, dynamic
  count maps, array fields, and generated invalid-packet report shapes without
  reading source text or private payloads.

### Revision `working` - Public mission draft redaction validator added

- Added canon validation for public mail-derived mission drafts using
  `soulforge.dungeon_assignment.public_mission_draft.v1`.
- Required public draft redaction flags to prove raw payloads, private/source
  refs, local file refs, and secret-like values were removed before a draft can
  pass canon validation.
- Added synthetic mission fixture coverage for blocked null-workflow drafts,
  missing redaction fields, private/source markers, local file URL markers, and
  secret-like authorization values.

### Revision `working` - Snapshot battle log aggregate projection added

- Added a top-level `battle_log` aggregate to the read-only snapshot from
  schema-valid battle event JSONL rows, limited to counts, latest timestamps,
  result/bottleneck/mode/automation buckets, and per-project aggregate rows.
- Mirrored the aggregate into `operation_board.sections.battle_log` and added a
  drift guard so the Operation Board section must exactly match the top-level
  summary.
- Added metadata-only freshness observation for battle event file surfaces and
  synthetic regression coverage to keep event ids, mission ids, stages, source
  refs, party/unit/loop ids, next action notes, and rendered prose out of the
  snapshot.

### Revision `working` - Snapshot mission terminal provenance markers added

- Added public-safe mission terminal provenance markers to `missions.items[*]`
  and mirrored them into Operation Board Mission Board rows without serializing
  `run_id` or `battle_event_id` pointer values.
- Added metadata-only freshness observation for `.mission/*/readiness.yaml`
  surfaces so terminal marker changes make stored snapshots stale.
- Extended synthetic snapshot coverage so terminal provenance pointer values do
  not leak and Mission Board marker drift is rejected by validation.

### Revision `working` - Snapshot monster gate row mirror guard added

- Hardened snapshot validation so Operation Board Monster Gate groups must
  mirror the pending monster display group contract and each group's display
  sample rows.
- Added synthetic regression coverage for Monster Gate group/order/row field
  drift without reading real `_workmeta/**`, `_workspaces/**`, raw mail,
  NotebookLM payloads, or secrets.

### Revision `working` - Snapshot mission board row mirror guard added

- Hardened snapshot validation so Operation Board Mission Board rows must
  mirror mission projection order, mission id set, display grouping fields, and
  row-level mission summary fields.
- Added synthetic regression coverage for Mission Board projection drift without
  reading real `_workmeta/**`, `_workspaces/**`, raw mail, NotebookLM payloads,
  or secrets.

### Revision `working` - Snapshot dungeon map row mirror guard added

- Hardened snapshot validation so Operation Board Dungeon Map rows must mirror
  project order, project surface fields, per-project mission counts, assigned
  pending monster counts, and surface status.
- Added synthetic regression coverage for row-level Dungeon Map projection drift
  without reading real `_workmeta/**`, `_workspaces/**`, or raw gateway payloads.

### Revision `working` - Snapshot operation board count mirror guard added

- Hardened snapshot validation so Operation Board project, mission, and monster
  count projections must mirror their source arrays and display groups.
- Added synthetic regression coverage for projection count drift without
  reading real `_workmeta/**`, `_workspaces/**`, or gateway private payloads.

### Revision `working` - Gateway command surface README index synced

- Synced gateway owner README/index entries for the metadata-only mail backlog
  and deadline-watch command surfaces.
- Added missing workspace contract links for mail work status, deadline watch,
  and gateway notify context without changing command implementations or
  package state.

### Revision `working` - Dev-worker auto-approval control-character guard expanded

- Rejected control characters in raw dev-worker auto-approval
  `allowed_write_paths` before safe-path matching.
- Rejected control characters in dev-worker auto-approval acceptance checks
  before command allowlist matching.
- Escaped control characters in auto-approval rejection reasons so details and
  skipped-output surfaces do not emit raw newline, tab, NUL, or DEL characters.

### Revision `working` - Dev-worker approval-only audit state surfaced

- Added owner-approval state to the dev-worker candidate `--details` view so
  approval-only candidates are distinct from promotable work.
- Added regression coverage for unapproved, approval-only, and promotable
  candidate detail output without changing candidate promotion behavior.

### Revision `working` - Gateway helper packaging tracking guard recorded

- Added the initial gateway CLI packaging diagnostic for backlog and deadline
  watchdog helper package tracking before package inclusion was closed.
- Documented that package-clean claims require the backlog and deadline
  watchdog helper modules to be tracked with their CLI consumers.

### Revision `working` - Mail candidate backlog display bounded

- Added bounded stdout display controls for `mail-candidate-backlog` so latest
  reports stay full while normal CLI output shows limit/omitted metadata.
- Aligned the documented canonical backlog command to omit the redundant
  `--json` flag because stdout is JSON by default.

### Revision `working` - Snapshot action queue mirror guard added

- Hardened snapshot validation so `next_actions` statuses stay within `started`/`next` and action queue items mirror id/status/summary/rank.

### Revision `working` - Battle event schema contract guard added

- Added regression coverage that compares the battle log writer contract against
  the canonical `battle_event` schema fields and enums.
- Kept the guard synthetic and metadata-only, without reading or writing real
  project battle logs under `_workmeta/**`.

### Revision `working` - Dev-worker auto-approval path guard documented

- Documented that dev-worker auto-approval safe-path checks reject parent
  directory segments and compare normalized path boundaries before approving
  low-risk candidates.

### Revision `working` - Knowledge graph source-support path wording aligned

- Aligned retrieval-plan and browser detection-card missing-evidence checks so
  `no_source_support_edges` is reported only when the graph lacks a `source`
  node or lacks both `supports` and `derived_from` source-support relations.
- Added derived-from-only regression coverage without changing real knowledge
  canon entries or source payload boundaries.

## 2026-06-04

### Revision `working` - Knowledge graph source-edge gap scout added

- Added a metadata-only connectivity diagnostic for `source_supported`
  knowledge nodes that have `source_support` metadata but no linked `source`
  node through `supports` or `derived_from` edges in the current graph.
- Kept the scout diagnostic limited to node id/ref, claim ceiling, source ref
  count, and missing edge type without creating source nodes, source edges, or
  source-truth/canon-promotion claims.
- Added regression coverage for resolved `supports`/`derived_from` source
  endpoints and for non-source endpoints that must remain
  `source_node_endpoint` gaps.
- Updated the graph view model contract to keep the new scout explicitly
  metadata-only and non-authoritative.

### Revision `working` - Deadline watchdog reminder preview added

- Added a dry-run/manual-confirm deadline watchdog reminder preview command
  that reads project-local `deadline_register.csv` ledgers and produces
  Telegram-ready brief candidates without sending notifications or writing
  `town_crier` queue entries.
- Added cooldown, snooze, terminal-status, max-nudge, due-window, and
  raw-payload boundary suppression checks for reminder candidates.
- Documented the preview-only reminder surface in `DEADLINE_WATCH_V0.md`.

### Revision `working` - Mail candidate backlog age check added

- Added a metadata-only `mail-candidate-backlog` gateway command for pending
  mail candidates, including candidate counts, age/stale state, and pending
  count trend without exposing subjects, senders, bodies, attachments, or
  secrets.
- Added the backlog age check to the always-on healer checks so stale pending
  mail candidates can warn before the queue silently piles up.
- Documented the backlog surface in the mail work status contract and the
  always-on healer rollout plan.

### Revision `working` - Team Ops Board clickable mockup added

- Promoted the owner-approved Team Ops Board v0 candidate into a standalone
  React/Vite mockup under `ui-workspace/apps/team-ops-board-mockup/`.
- Added sample-data Board, Projects, Schedule, People, and Settings surfaces
  with item creation, detail editing, owner/status changes, comment capture,
  Blocked/Waiting note gating, range filters, and weekly summary export.
- Wired the mockup into UI workspace build scripts while keeping it separate
  from `renderer-web`, Smartsheet APIs, private work data, and write-back
  behavior.

### Revision `working` - Mail history line endings normalized

- Updated the gateway mail-fetch project mail history writer so derived
  `_workmeta/**/reports/메일_이력/` CSV and calendar metadata use LF line
  endings.
- Added regression coverage so future P00 mail-history updates do not create
  CRLF trailing-whitespace failures under `git diff --check`.
## 2026-06-03

### Revision `working` - Dev-worker candidate audit details added

- Added a `--details` text view for `guild-hall:dev-worker:candidates` so
  stalled development candidates show their promotion and auto-approval
  blockers without changing candidate promotion behavior.
- Added status, active-candidate, and closed-candidate counts so completed
  candidate packets are easier to distinguish from still-proposed work.
- Added focused test coverage, README guidance, and architecture contract
  wording for the candidate audit view.

### Revision `working` - Development idea capture lane clarified

- Clarified `DEVELOPMENT_ROADMAP_V0.md` so future development ideas move
  through a fixed ladder: roadmap line, system/project candidate queue,
  executable dev-worker request, or metadata-only knowledge/RAG capture.
- Added minimum fields and approval guards for candidate-to-execution
  promotion so owner-decision-pending tasks are not silently treated as ready.
- Reframed the WorldBible `Idea Backlog` as product-sense notes only, with
  actual development storage owned by the roadmap and `_workmeta` queues.

### Revision `working` - Experiment report authoring draft added

- Added `.workflow/authoring/experiment_report_authoring_v0/` as a
  public-safe draft workflow for team experiment report authoring.
- Included a reusable Korean experiment report outline reference template so
  report authors can copy a stable section spine into project-local reports.
- Clarified `.workflow/authoring/README.md` so new workflow drafts are authored
  through `soulforge-workflow-generator` and closed through
  `soulforge-workflow-check`, with missing generator evidence kept as a draft
  status gap.
- Kept the draft limited to report authoring, evidence mapping, HTML review-copy
  planning, gaps, next actions, and boundary review without claiming contract
  acceptance, final pass/fail judgment, or customer approval.
- Added report-tone guidance so judgment limits are written as `자료 성격`,
  `검토 범위`, and `별도 확인 대상` instead of AI-style disclaimer banners.
- Added an HTML table-of-contents rule that suppresses automatic list numbering
  when Markdown headings already carry section numbers.
- Added core-summary guidance so experiment reports use a `검토 항목 / 결과 요약`
  table with report-level judgment, bounded numbers, and interpretation limits
  instead of file-by-file calculation-log bullets.

### Revision `working` - SE workspace folder naming convention added

- Added `SE_WORKSPACE_FOLDER_NAMING_CONVENTION_V0.md` as the public-safe
  convention for human-facing SE project workspace folder names.
- Added a short `AGENTS.md` routing rule so folder create, cleanup, rename, and
  dry-run work reads the detailed workspace naming convention first.
- Linked the convention from the workspace architecture README and kept actual
  workspace rename behind dry-run mapping, pointer migration planning, and
  owner approval.

## 2026-06-02

### Revision `working` - Team Ops Board mockup candidate added

- Added a roadmap candidate for a standalone Team Ops Board v0 clickable
  mockup that ignores the existing renderer-web baseline and treats Smartsheet
  as an optional future input source.
- Recorded the private dev-worker candidate packet for the mockup handoff so a
  later session or worker PC can pick up the task without reading private
  project payloads or connector secrets.

### Revision `working` - Soulforge report format pair added

- Added `SOULFORGE_REPORT_FORMAT_V0.md` to make owner-facing report material
  default to a Markdown or structured-text source-of-truth plus a standalone
  HTML companion for human review.
- Added a public-safe owner-facing technical report tone rule so experimental
  and test reports default to `시험 목적`, `시험 조건`, `요청/검토 항목`,
  `검토 결과`, `고려사항`, and `후속 조치` rather than advisory prose.
- Extended the AI output format policy so HTML report companions stay derived
  artifacts and preserve public/private/raw/secret boundaries.
- Added public-safe Markdown and HTML report templates under workspace
  examples, and generated a private HTML companion for the P24-049 LIG SAS
  group-delay report.

### Revision `working` - Team Operations Console draft added

- Reworked the renderer-web Assistant pane into a read-only Team Operations
  Console draft that foregrounds open actions, waiting items, schedule adapter
  readiness, project status, source-review posture, and data-health gates.
- Added an explicit Smartsheet-pending state so the operations board remains
  usable from local Soulforge rollups before any Smartsheet API integration.

## 2026-05-31

### Revision `working` - Deadline watch contract scaffold added

- Added `DEADLINE_WATCH_V0.md` to define project-local deadline ledgers,
  P00 unresolved deadline inbox behavior, reminder metadata events, completion
  rules, and raw-payload exclusion.
- Seeded metadata-only `deadline_watch` skeletons for P00 and P26-014 in
  `_workmeta` so the assistant v0 pilot has a concrete source-of-truth surface
  before dashboard, UI, or reminder automation work.
- Aligned the renderer-web gateway notification toggle list to the supported
  v0 gateway events, `monster_created` and `mail_received`.
- Added a dry-run-first gateway deadline-watch importer for deterministic
  `mail_work_priority` due observations.
- Added a deadline-watch validator command for project-local deadline register
  and reminder event-log hygiene.
- Added a local-only read-only assistant dashboard composer that rolls up
  project deadline, open-action, work-ledger, and data-health metadata into
  `guild_hall/state/assistant_dashboard/latest.json`.
- Added an Assistant Home pane in renderer-web that reads the local dashboard
  through a read-only control-center API and surfaces degraded data-health and
  ledger-guard states without write-back.

## 2026-05-28

### Revision `working` - RAG three-stage operating model added

- Added `RAG_THREE_STAGE_OPERATING_MODEL_V0.md` to separate searchable RAG,
  work-ready RAG, and canon knowledge so whole-document progress is not
  confused with sample route pilots.
- Linked the three-stage model from the RAG manifest contract, guild_hall RAG
  README, and architecture guild_hall README.

### Revision `working` - RAG operational route resolver added

- Added metadata-only operational route validation, resolution, and smoke-run
  commands so private/manual-review RAG route registries can select a stable
  work card, operator answer card, wiki page, evidence pages, and claim ceiling
  without loading raw source text or chunks.
- Added a terminal-only operational route answer-shell renderer that prints the
  selected private operator answer card without writing answer bodies to public
  files or `_workmeta/**`.
- Added operational route answer-card validation so private operator cards can
  be checked for route id, work-card id, evidence pages, manual-review notice,
  and stronger-authority denial markers without returning card bodies.
- Added operational route preflight artifacts that combine registry validation,
  smoke tests, answer-card validation, and current status into one
  metadata-only private/manual-review readiness check.
- Added an operational route catalog command so operators can list available
  private/manual-review routes, refs, evidence pages, review gaps, and claim
  ceilings before entering a question or recording usage.
- Added an operational route dashboard command that combines catalog,
  preflight, usage counts, candidate counts, answer-card status, and smoke-test
  state into one metadata-only terminal surface for operator readiness checks.
- Added an operational route call-plan command that combines dashboard and
  route-session checks for one transient query label without persisting raw
  queries, answer bodies, usage records, or candidate records.
- Added operational route call-plan write, validate, and view commands so a
  real operator question can preserve its fingerprint-only routing decision
  under `_workmeta` without storing the raw query, answer body, source text,
  chunks, usage records, candidates, or stronger authority.
- Added an operational route operator-run command that prints the selected
  private/manual-review answer shell after call-plan checks while keeping the
  output terminal-only and avoiding usage/candidate side effects.
- Added an optional operator-health gate to operational route operator-run so
  answer-shell output and usage recording are skipped unless the supplied
  stored health artifact passes for the same route registry.
- Added `--skip-answer-shell` to operational route operator-run so automation
  or probe runs can verify the health-gated call plan without printing the
  private answer card body or writing usage.
- Added an explicit operator-run usage-record option so real delivered answers
  can write metadata-only usage records only when `--record-usage` and a safe
  `--usage-id` are provided.
- Added post-write operator-run usage evidence so explicit usage recording
  validates the written record and reports the route usage count against the
  repeated-use review threshold.
- Fixed post-write operator-run usage counting to derive the summary root from
  the written usage record, including custom `_workmeta/<project>/...` usage
  output refs.
- Added an operational route closeout command so operators can confirm the
  post-answer gate, route usage count, repeated-use threshold, and unmatched
  candidate state without persisting answer bodies, raw queries, usage records,
  or candidates.
- Hardened operational route closeout validation so injected answer-shell
  output, answer-card body fields, source/chunk loading flags, source truth,
  public canon, graph truth, and default-route mutation claims are blocked.
- Added an operational route review-gate command so operators can check the
  whole route set for repeated-use readiness or unmatched candidate blockers
  without launching sourcebound review, writing usage/candidate records, loading
  source text/chunks, or granting stronger authority.
- Added an operational route command-sheet command so operators can print the
  safe command sequence for a private/manual-review route set without executing
  commands, recording usage/candidates, or persisting answer bodies/raw queries.
- Added an operational route suggestion-safety command so generated command
  suggestions can be checked for direct usage-record writes, direct answer-shell
  calls, and healthless `--record-usage` paths before private/manual-review
  operator use.
- Hardened operational route suggestion-safety to count direct candidate and
  call-plan write suggestions separately, block unsafe candidate/call-plan write
  suggestions, and keep unmatched probe suggestions on candidate preview unless
  a real unmatched operator question explicitly requests a write.
- Added an operational route ops-check command that combines preflight,
  dashboard, command-sheet, suggestion-safety, and review-gate validation into
  one metadata-only private/manual-review readiness verdict without executing
  commands, recording usage/candidates, launching sourcebound review, or
  granting stronger authority.
- Added an operational route readiness command that combines ops-check and
  route-set session sweep evidence into one metadata-only go/no-go operator
  surface without persisting raw queries, executing answer shells, recording
  usage/candidates, launching sourcebound review, or granting stronger
  authority.
- Added an operational route readiness-view command so stored readiness
  artifacts can be reopened as operator-readable go/no-go digests without
  regenerating checks or reading raw queries, answer-card bodies, source text,
  or chunks.
- Added stored preflight, ops-check, and session-sweep view commands so
  pre-use readiness evidence can be reopened as operator-readable digests
  without rerunning checks or loading source/answer payloads.
- Expanded the operational route command sheet with read-only stored evidence
  view commands for preflight, ops-check, route sweeps, readiness, status,
  usage, and candidate records.
- Added an operational route suggestion-safety artifact so command-sheet,
  call-plan, and session suggested commands can be validated and reopened as
  metadata-only evidence without executing commands or writing
  usage/candidate/call-plan records.
- Added an operational route evidence-sweep command that validates and
  summarizes supplied stored evidence refs into one metadata-only closure check
  without reading source/answer payloads or granting stronger authority.
- Added an operational route latest-evidence command that finds the latest
  stored `_workmeta` evidence refs for a route registry so operators do not need
  to manually track the newest preflight, ops-check, readiness, status, usage
  summary, or evidence-sweep paths.
- Expanded latest-evidence to include the latest suggestion-safety artifact and
  report dangerous suggestion counts alongside the stored ops-check evidence.
- Added an operational route operator-brief command that turns the latest
  evidence refs into a one-page private/manual-review run surface with the
  route list and safe next commands.
- Added an operational route operator-doc drift check so local runbooks,
  status digests, and closeout maps can be checked against the latest stored
  evidence and operator brief refs without reading source payloads or raw
  queries.
- Added an operational route operator-health command that combines latest
  evidence, operator brief, and operator doc-drift validation into one
  metadata-only go/no-go surface without executing commands, writing
  usage/candidate/call-plan records, reading source payloads, or granting
  stronger authority.
- Added operational route session artifacts that combine preflight and route
  resolution for one transient query while persisting only query fingerprints,
  selected refs, evidence pages, claim ceilings, and next operator steps.
- Added a text digest for operational route sessions so operators can read the
  selected route and next steps without opening JSON, raw queries, or answer
  bodies.
- Added an operational route session-sweep command so smoke-test route labels
  can prove the full private/manual-review route set opens to the expected work
  cards and evidence pages without persisting raw query labels, answer bodies,
  usage/candidate records, source text, chunks, or stronger authority.
- Added an operational route-run view command so stored metadata-only route
  decisions can be reopened as the same safe operator digest without loading
  raw queries, answer-card bodies, source text, or chunks.
- Connected route registry validation to existing source-text work-card
  validation, keeping source truth, final-answer authority, public canon,
  ontology acceptance, graph truth mutation, external upload, and default-route
  switching outside the resolver.
- Added metadata-only operational route usage records under `_workmeta/**` so
  repeated private route use can be counted with query fingerprints instead of
  persisted raw questions.
- Clarified no-write candidate previews so `operational-route-candidate-record
  --text` renders a preview status instead of looking like a persisted candidate
  record.
- Added operational route usage summaries so repeated-use review readiness can
  be reported per route without granting stronger knowledge, canon, or answer
  authority.
- Added operational route usage record/summary text and view renderers so
  stored usage evidence can be reopened as operator-readable digests without
  loading raw queries, answer-card bodies, source text, or chunks.
- Added operational route candidate records for unmatched public-safe labels,
  storing only query fingerprints and route-resolution metadata without
  changing route registries, default routes, source text permissions, or claim
  ceilings.
- Added operational route candidate text/view rendering so unmatched-route
  candidates can be reviewed as metadata-only operator digests before or after
  a real candidate record is written.
- Added an operational route status command that combines registry validation,
  repeated-use summaries, and unmatched candidate counts into a single
  metadata-only operator dashboard for private/manual-review RAG routes.
- Added an operational route status-view command so stored dashboard snapshots
  can be reopened as terminal digests without rerunning checks or loading
  source/answer payloads.
- Added a knowledge-graph graph-relation review queue overlay so DAPA
  route/work-card/wiki candidate links can render as review-required graph edges
  through redacted alias nodes, without exposing private `_workspaces/knowledge`
  refs or mutating graph truth/default routes.

## 2026-05-27

### Revision `working` - RAG source-family promotion policy added

- Added a source-family promotion policy that separates official source canon
  from derived knowledge canon and fixes default promotion ceilings for
  official public sources, private project sources, owner notes, parser/OCR
  outputs, advisory LLM/NotebookLM output, protected payloads, and public
  web/community sources.
- Linked the policy from the RAG manifest and RAG README so source-text,
  work-card, private wiki, and public canon promotion decisions have a shared
  family-specific rule set.

### Revision `working` - Owner-delegated auto-canon lane clarified

- Added a standing auto-canon lane to the agent execution contract so an
  applicable owner policy can allow same-task canon registration without
  per-item owner confirmation when all public/private, source, schema,
  changelog, and review guards pass.
- Kept source truth, ontology acceptance, external upload, default-route
  mutation, final domain doctrine, secret inspection, and production-ready
  authority outside the delegated lane unless separately granted by an owner
  surface and required review gate.

### Revision `working` - SE review workflow optimizer closeout

- Added a public-safe optimizer calibration archive and active profile policy
  for `se_cross_stage_mapping_governance_v0`, selecting
  `gpt-5.4|low|dwarf|auditor` as the quality-equivalent governance profile
  while keeping `gpt-5.4-mini|low|dwarf|auditor` as a minimum-viable shadow.
- Corrected the SE assistant operating loop note so
  `se_cross_stage_mapping_governance_v0` is treated as an optional governance
  route rather than an excluded unresolved workflow.
- Reconciled `se_stage_artifact_gap_scan_v0` calibration telemetry and
  calibration README wording with the existing active calibration archive.

### Revision `working` - RAG metadata refresh workflow calibrated

- Updated `rag_metadata_refresh_v0` from registered pilot-ready to
  pilot-executed based on the existing controlled metadata-only pilot evidence.
- Added a public-safe synthetic optimizer calibration archive and active profile
  policy for `rag_metadata_refresh_v0`, selecting
  `gpt-5.4-mini|low|dwarf|archivist` as the cheapest quality-gate-passing
  profile.
- Kept source-text RAG, NotebookLM mutation, owner approval, public canon,
  ontology promotion, answer authority, and default-route safety out of scope.
- Added the source-text quality review and source-text work-card command surface
  so approved private source-text answer runs can be turned into page-audited
  work cards without persisting raw questions, source text, or chunk text in the
  card/review payload.

## 2026-05-26

### Revision `working` - RAG Docling JSON page-order index added

- Added `source-text-index --docling-json-ref` so approved private source-text
  indexes can be built from Docling JSON element/page order while preserving
  the existing Markdown/text index path.
- Added native chunk page spans, layout labels, and warning codes for Docling
  JSON indexes, allowing `source-text-answer-run` citations to carry page-level
  traceability even without a separate sidecar.
- Updated the traceability sidecar to recognize native chunk page spans, so
  Docling JSON indexes can be checked without falling back to weak token
  overlap mapping.

### Revision `working` - RAG page traceability sidecar added

- Added `source-text-traceability-sidecar` and validation so private Docling
  JSON exports can map source-text chunk ids to page spans, layout labels, and
  warning codes without copying source text into public files or `_workmeta`.
- Allowed `source-text-answer-run` to attach optional sidecar-derived page
  spans to citations, making page-backed citation review possible while keeping
  raw questions ephemeral.
- Documented the sidecar as a sourcebound audit aid, not extraction-quality
  approval, owner approval, NotebookLM authority, or canon promotion.

### Revision `working` - RAG runtime preflight resolver added

- Added `source-text-runtime-preflight` to the RAG CLI so local extraction
  readiness can be checked from repo-local venv refs, PATH, Windows user
  environment, and tool env vars without hard-coding executable paths.
- Added validation coverage that blocks runtime absolute paths from the
  preflight JSON while still reporting required tool, OCR language, and optional
  HWP/HWPX converter readiness.
- Documented the preflight as the preferred public-safe smoke surface before
  real source extraction or source-text indexing work.

### Revision `working` - RAG source extraction runtime install guidance added

- Added the RAG/source-text extraction runtime to the installation manual for
  owner/tool PCs that convert source documents before indexing.
- Documented the required Docling-first toolchain, including Tika/Java,
  PyMuPDF/`pypdf`, LibreOffice, Tesseract Korean OCR data, and HWP-to-HWPX
  converter requirements.
- Clarified that actual local executable paths, versions, OCR data hashes, and
  smoke results belong under `_workmeta/system/reports/procedure_capture/source_extraction_runtime/`,
  while public docs keep only portable tool families, package ids, and
  validation commands.

### Revision `working` - Mail history Excel export moved out of `_workmeta`

- Changed the gateway project mail history writers so `_workmeta/<project_code>/reports/메일_이력/` keeps only metadata-oriented CSV and calendar outputs.
- Moved generated `메일_이력.xlsx` exports to `_workspaces/<project_code>/reports/메일_이력/` and made the writers remove legacy `_workmeta` Excel exports on the next upsert.
- Added `validate:workmeta-payload` to catch HWP/HWPX, Office, PDF, archive, and mail raw/archive files under `_workmeta`, including ignored local payloads.
- Fixed the workmeta payload validator CLI entrypoint so the npm script actually runs on Windows file paths instead of silently stopping after tests.
- Updated gateway, mail-fetch, dungeon-assignment, validation, and workspace intake docs/tests to keep Excel files out of the private metadata plane.

### Revision `working` - RAG source sync ready gate added

- Added `source_sync_ready_manifest_v0` validation for OneDrive/cross-PC source
  handoff, checking Soulforge-root-relative refs, source card/source text
  matching, byte sizes, SHA-256 hashes, and optional file stability delay.
- Added `validate-source-sync-ready` and `source-text-index --ready-ref` so
  indexing can block with `blocked_sync_not_ready` instead of reading a file
  that has not fully synced locally.
- Added a public-safe ready manifest template for company knowledge intake and
  kept the manifest metadata-only: no source payloads, chunks, NotebookLM
  answers, credentials, local absolute paths, owner approval, or source truth.

### Revision `working` - RAG source extraction tool standard selected

- Set the RAG/source-text intake method as parser-first rather than direct
  LLM raw-document analysis.
- Selected a Docling-first local extraction standard with Apache Tika,
  PyMuPDF/`pypdf`, LibreOffice headless, and Tesseract OCR as fallback routes.
- Kept HWP under the existing HWP-to-HWPX normalization rule before any body
  extraction, and kept LLM/NotebookLM/LlamaParse/cloud parser outputs advisory
  unless explicitly owner-approved.
- Clarified that `source-text-index` consumes approved derived `.md`/`.txt`
  under `_workspaces/knowledge/**` after extraction, while `_workmeta/**`
  records only hashes, tool/version metadata, counts, warnings, blocker codes,
  and relative output refs.

### Revision `working` - Workspace junction and Codex bridge portability fixes

- Treated `_workspaces/00_project_index.html` as a local navigation surface instead of a junction gap, matching the workspace binding rule that human index views are not routing authority.
- Made the Codex account bridge argument test expect the platform-native resolved repo root so Windows clones do not fail `done:check` on `/repo` versus drive-qualified paths.
- Kept junction repair owner-gated: the audit reports relative aliases, expected suffixes, and redacted target tails only, and does not write host-local cloud roots into tracked canon.

### Revision `working` - RAG and gateway path portability tightened

- Tightened RAG/source-text profile and extraction packet validators so URL-like path fields such as `file://...` cannot bypass local absolute path guards.
- Required company knowledge intake `source_ref` values to use Soulforge-root-relative `_workspaces/knowledge/**` refs instead of floating Drive IDs or machine-local paths.
- Switched the gateway mail fetch env example and path docs to Soulforge-root-relative paths, while keeping legacy env-file-relative path resolution for existing local env files.

### Revision `working` - RAG operating standard docs clarified

- Clarified the two RAG boundaries: default manifest/index/trace/evaluation/answer flows are metadata-only, while approved private source-text commands may read only owner-approved `_workspaces/knowledge/**` source text.
- Added the raw-question storage policy for RAG artifacts: persisted JSON/review outputs use labels, query fingerprints, and token fingerprints, not raw questions.
- Added a public-safe company knowledge intake packet template surface for parallel PC handoff without raw source text, NotebookLM answers, account IDs, conversation IDs, secrets, or company payloads.
- Recorded RAG/source-text standardization as a bounded support/follow-on lane under the roadmap, not a replacement for the active playable loop.

## 2026-05-25

### Revision `working` - RAG source-text starter index lane added

- Added the first owner-approved `_workspaces/knowledge` source-text lane with source card validation, source-text indexing, derived text output, and source-text answer proof runs.
- Added CLI commands `validate-knowledge-source-card`, `source-text-index`, `validate-source-text-index`, `source-text-answer-run`, and `validate-source-text-answer-run`.
- Kept source-text payloads out of public repo and `_workmeta`: starter source, derived text, index chunks, and source-text answer runs live under `_workspaces/knowledge/**`.
- Added official-source authority handling so owner-approved public agency sources may create public-safe summaries, ontology seeds, NotebookLM packet manifests, and registry entries while full source text and chunks remain private workspace payloads.

### Revision `working` - RAG answer-engine preflight MVP added

- Added `source_text_extraction_run_report_v0` as the report-only dry-run layer after `source_text_extraction_packet_v0`.
- Added `rag_answer_engine_run_v0` as the current metadata/preflight answer-engine MVP, connecting the metadata retrieval index with the source-text packet/report readiness chain.
- Added CLI commands `source-text-extraction-run-report`, `validate-source-text-extraction-run-report`, `answer-engine-run`, and `validate-answer-engine-run`.
- Kept written answer-engine runs below source-text RAG: they persist query fingerprints, not raw queries, and do not read source bodies, write private payloads, build indexes, use NotebookLM answers, or grant owner approval.

### Revision `working` - RAG source text extraction packet added

- Added `source_text_extraction_packet_v0` under `guild_hall/rag` as the dry-run preflight contract after `source_text_metadata_profile_v0`.
- Added `source-text-extraction-packet` and `validate-source-text-extraction-packet` CLI commands to bind profile fields, source-slice targets, extraction-log import tasks, adapter routes, and planned metadata outputs before extractor execution.
- Kept the packet below owner approval and source-text retrieval: it does not execute extractors, read source bodies, write private payloads, build indexes, upload to NotebookLM, or promote public canon.

### Revision `working` - RAG source text metadata profile added

- Added `source_text_metadata_profile_v0` under `guild_hall/rag` as a planning-only bridge before source-text extraction.
- Added `source-text-metadata-profile` and `validate-source-text-metadata-profile` CLI commands to reuse source-slice metadata, public-safe field scans, and extraction-status CSV column/count metadata without loading source bodies.
- Kept the profile below source-text retrieval, private extracted text, chunks, BM25/vector indexes, NotebookLM answers, owner approval, and public canon promotion.

## 2026-05-24

### Revision `working` - Knowledge wiki pipeline renamed for general use

- Renamed the Knowledge Wiki Cell default composite route from the SE-prefixed workflow id to `knowledge_wiki_pipeline_v0` so it is clearly usable for general knowledge, sourcebound wiki, NotebookLM bookshelf, and RAG metadata handoff work.
- Updated Knowledge Wiki Cell party routing, workflow index entries, downstream workflow references, and launcher skill mappings to use `knowledge_wiki_pipeline_v0`.
- Kept behavior and authority boundaries unchanged: the rename does not grant source truth, NotebookLM or Drive mutation, RAG answer authority, public canon promotion, ontology acceptance, or any new default-route expansion beyond the existing Knowledge Wiki Cell route.

### Revision `working` - RAG metadata refresh workflow route added

- Added `rag_metadata_refresh_v0` as the registered metadata-only refresh workflow route after wiki/sourcebound metadata changes.
- Extended `knowledge_wiki_pipeline_v0` and `knowledge_wiki_cell` with an optional RAG refresh handoff while keeping RAG artifact refresh outside the wiki party itself.
- Updated the Knowledge Wiki Cell launcher contract so it can prepare a metadata-only refresh handoff without granting source-text retrieval, BM25/vector index build, NotebookLM mutation, public canon promotion, or answer authority.

### Revision `working` - RAG metadata retrieval index and indexed answer path added

- Added safe-default `source_slice_owner_decision_record_v0` generation and validation so decision packets can be carried into the next layer without being mistaken for owner approval or stronger source permissions.
- Added `rag_metadata_index_v0`, retrieval trace, smoke evaluation, and `answer --metadata-index-ref` under `guild_hall/rag`, with token fingerprints instead of raw terms and `_workmeta` trace/evaluation outputs that do not persist raw questions.
- Tightened RAG and graph guards: `rag_manifest_v0` must keep `indexes: []`, metadata indexes cannot persist source handles/locators, and knowledge graph exports can only write under `_workspaces/system/knowledge_view/**`.

### Revision `working` - RAG source slice decision packet added

- Added metadata-only `source_slice_decision_packet_v0` generation and validation under `guild_hall/rag` as the owner-decision preparation layer before source-text retrieval, index build, NotebookLM packet membership, or public canon promotion.
- Added explicit `source-slice-decision-packet` and `validate-source-slice-decision-packet` CLI commands with `_workmeta` output-root guards and project-code enforcement for private source slices.
- Kept decision packets below owner approval: they list pending decisions and default stronger permissions to false, but do not apply decisions, load source text, create chunks, build indexes, use NotebookLM answers, or promote canon.

### Revision `working` - Sonar signal chain knowledge entry registered

- Added `.registry/knowledge/sonar_signal_chain/` as a source-supported reusable knowledge entry for sonar engineering orientation from underwater acoustics and hydrophone sensing through AFE, ADC, digital front-end processing, beamforming, detection, and calibration.
- Recorded public source-support boundaries for TI AFE receive-chain references, DOSITS detection-threshold context, QARTOD/NPL/IHO calibration and QA context, and MathWorks detection/CFAR seed references.
- Kept the entry below production design approval and below complete sourcebound packet status: NotebookLM outputs, weak web sources, military operational doctrine, and unsupported component-level design claims remain excluded.

### Revision `working` - RAG triage graph lens visibility added

- Added explicit source-slice triage/register inputs to the knowledge graph export so generated graph views can show metadata registration state alongside the existing RAG manifest lens.
- Embedded redacted `source_slice_projection` and `node.source_slice` overlays with registered, owner-review, blocked, and stronger-permission-needed counts for 3D filtering.
- Kept the projection metadata-only: it does not expose source text, source-handle arrays, source locator payloads, indexes, NotebookLM answers, applied owner decisions, or public canon promotion.

### Revision `working` - Dual deep research workflow and launcher added

- Added `.workflow/dual_deep_research_v0` as the workflow-owned procedure for running the repo-defined `nlm` NotebookLM CLI Deep Research path and Codex direct source research as separated advisory lanes before comparison.
- Encoded the existing CLI-first contract directly in the workflow, including `nlm research start ... --mode deep`, `status`, `import`, and bounded `notebook query`, so future agents do not rediscover the basic NotebookLM command shape every run.
- Added an explicit first goal-declaration step plus a `subagent_stage_manifest` so material NotebookLM, Codex direct research, and comparison stages run through fresh bounded subagent contexts or record a blocker and lower the claim.
- Routed the completed research packet to `knowledge_wiki_cell` / `knowledge_wiki_pipeline_v0` as an automatic downstream handoff while keeping registration, Drive placement, NotebookLM packet-map updates, source sufficiency, owner decision, and wiki/canon promotion outside the research workflow.
- Added `.registry/skills/dual_deep_research` as a thin Codex launcher for the workflow while keeping Google Drive, NotebookLM packet maps, wiki registration, source truth, owner approval, ontology acceptance, and canon promotion outside the skill's authority.
- Evolved the workflow and launcher contract so downstream or adjacent workflow creation/evolution discovered during research routes through `$soulforge-workflow-generator`, then requires `$soulforge-workflow-check` before any completion, readiness, registration, or promotion claim.
- Tightened the workflow-check closeout guard so default-route switching/default-route-safety claims are explicitly outside the research lane, and changed the boundary-review template defaults from prefilled pass values to pending/unchecked values.
- Added a public-safe staged profile calibration archive for `dual_deep_research_v0`, promoted `profile_policy.yaml` from draft to active, selected `gpt-5.4-mini` / `low` / `dwarf` / `archivist` as the cheapest passing synthetic profile, and retained `gpt-5.5` / `low` / `dwarf` / `archivist` as the high-assurance shadow for first real pilots.
- Promoted the `dual_deep_research` Codex launcher skill to active and taught it to resolve the calibrated workflow `profile_policy.yaml` at execution time, without copying optimizer outputs or moving source truth, NotebookLM runtime, Drive/wiki registration, or owner approval authority into the skill.

### Revision `working` - RAG source slice review queue added

- Added metadata-only `source_slice_review_queue_v0` generation and validation under `guild_hall/rag` as the owner-review preparation layer after `source_slice_card_v0`.
- Added explicit `source-slice-review-queue` and `validate-source-slice-review-queue` CLI commands with `_workmeta` output-root guards.
- Kept review queues below owner approval, source-text retrieval, chunks, indexes, source truth, answer evidence, graph mutation, ontology acceptance, and canon promotion.

### Revision `working` - RAG source slice triage register added

- Added metadata-only `source_slice_triage_register_v0` generation and validation under `guild_hall/rag` so existing wiki/source intake criteria can auto-register passing public-safe source cards as `rag_metadata_knowledge_only`.
- Added explicit `source-slice-triage-register` and `validate-source-slice-triage-register` CLI commands with `_workmeta` output-root guards.
- Added a standing owner policy block that treats owner-defined criteria as automatic metadata-registration authority while keeping source-text retrieval, index build, NotebookLM packet membership, and public canon promotion false by default.
- Extended source-slice review queues to consume triage registers and emit only hold/blocked items, so passing metadata knowledge does not accumulate in owner review backlog.
- Kept triage registration below owner approval, source-text retrieval, NotebookLM packet membership, public canon promotion, source truth, graph mutation, ontology acceptance, and index build permission.

### Revision `working` - RAG source slice cards added

- Added metadata-only `source_slice_card_set_v0` generation and validation under `guild_hall/rag` as the preparation layer after `rag_manifest_v0` and before BM25/vector/source-text retrieval.
- Added explicit `source-slice-cards` and `validate-source-slice-cards` CLI commands with system/private output-root guards.
- Kept source slice cards below chunks, indexes, source truth, answer evidence, owner approval, and canon promotion.

### Revision `working` - RAG manifest graph lens projection added

- Added `--rag-manifest-ref` to the knowledge graph export so generated graph views can consume explicit `rag_manifest_v0` files as sanitized metadata-only overlays.
- Embedded `rag_projection` and `node.rag` readiness metadata for 3D RAG lens filtering, including answer-ready and lens-profile views.
- Kept the projection below source-text retrieval and answer authority: it does not load source text, NotebookLM answers, vector stores, BM25 indexes, private payloads, secrets, or runtime absolute paths.

### Revision `working` - Metadata-only RAG MVP added

- Added `guild_hall/rag` with `rag_manifest_v0` generation, validation, and a first manifest-backed metadata-only answer command.
- Added `npm run guild-hall:rag` and `npm run validate:rag` so RAG work can be generated, checked, and answered through the canonical command surface.
- Kept the MVP below source-text retrieval: it does not load private payloads, NotebookLM answers, vector stores, BM25 indexes, secrets, or runtime absolute paths.

### Revision `working` - Knowledge graph Codex review command connected

- Added `guild-hall:knowledge-graph -- review` to send a compact metadata-only retrieval plan through the Codex bridge for advisory relation-candidate review, defaulting to `gpt-5.5`.
- Added a generated 3D 탐지 카드 button that copies the exact terminal command for the selected node instead of letting the static browser execute local commands.
- Kept the bridge path below RAG answer generation, source truth, owner approval, validation, ontology acceptance, canon promotion, and graph mutation.

## 2026-05-23

### Revision `working` - Knowledge graph detection card guidance clarified

- Added an operator-facing Korean `판정` and `지금 할 일` block at the top of generated 3D preview detection cards.
- Clarified in the preview that a detection card is a review guide, not a RAG answer surface, and mapped missing-evidence signals to concrete next steps such as adding source/support edges, retrieval wiring, and benchmark checks.

### Revision `working` - GitHub down strict junction audit added

- Added `guild-hall:workspace-junction:audit` and `validate:workspace-junction` to make GitHub-down workspace junction checks deterministic.
- The audit now verifies each `_workspaces/<alias>` link target suffix against `_workmeta/system/bindings/workspace_junctions.yaml` `cloud_relative_path`, reports extra root mirrors such as `_workspaces/company`, and avoids printing host-local cloud roots.
- Updated the latest-update workflow and `github_down` Codex bridge so future download/update runs do not treat a merely existing but mis-targeted link as ready.

### Revision `working` - Tracked absolute paths normalized

- Replaced concrete host-local absolute paths in tracked test fixtures, calibration telemetry, public-safe docs, and helper references with relative or portable placeholders.
- Extended the path-policy cleanup from changed-file scope to tracked-repo scope so `validate:path-policy:all` reports zero tracked violations.
- Kept runtime-local roots, plugin cache locations, generated outputs, and source-file locations as metadata placeholders rather than repo-specific machine paths.

### Revision `working` - Knowledge graph preview detection card added

- Added a local metadata-only `탐지 카드 열기` action to the generated 3D knowledge graph node context menu.
- Rendered the selected-node card in the preview sidebar with candidate nodes, one-hop relation paths, source refs, coded missing-evidence items, and coded next-action items built only from embedded graph metadata.
- Added browser-test hooks for the card state while keeping the preview below NotebookLM, vector search, source text loading, Codex bridge auto-calls, graph mutation, and canon promotion.

### Revision `working` - Weekly mail visibility register added

- Added a metadata-only weekly visibility register for unresolved mail-derived work under `_workmeta/P00-000_INBOX/reports/triage/unresolved_weekly_visibility_register.md`.
- Extended mail work priority rows with deterministic due-date extraction, week-window matching, and route hint candidates so broad AUV/AXV/mAUV/O-ring and P24-049/군집/LIG SAS signals are visible without unsafe auto-assignment.
- Added `guild-hall:gateway:mail-work:weekly-visibility` plus week-window priority filtering, including event-only/quarantine fallback rows that remain `claim_ceiling: observed` and do not copy mail bodies, raw provider payloads, attachment filenames, URLs, or local paths.
- Guarded the private register output path, sanitized attachment type labels, and suppressed event-only fallback rows for mailbox events that already have gateway/project work status.

### Revision `working` - Knowledge graph retrieval plan contract stabilized

- Extended the metadata-only retrieval planner with selected-node mode through `--node-ref`, stable `candidate_nodes`, `selected_node`, `input`, coded missing/action items, and `detection_card` fields for future graph UI 탐지 카드 rendering.
- Made explicit missing `--graph-ref` paths fail instead of silently falling back to a different in-memory graph.
- Added fixture coverage for question-only planning, selected-node planning, and isolated selected-node missing-evidence honesty.
- Kept the planner below RAG/GraphRAG answer generation: it still does not load source text, query NotebookLM, run vector search, use a local LLM, mutate graph data, or promote canon.

### Revision `working` - Codex account bridge added

- Added `guild_hall/codex_bridge` and `npm run guild-hall:codex-bridge` to wrap the installed `codex exec` command for bounded analysis through the current Codex/ChatGPT login without storing an API key.
- Kept the bridge read-only, ephemeral, and advisory by default, with no auth-file reading and no claims of source truth, owner approval, ontology acceptance, canon promotion, or production readiness.
- Documented when to use the Codex account bridge versus deterministic graph CLI output or future sourcebound RAG workflows.

### Revision `working` - Knowledge graph detection-card roadmap recorded

- Added a roadmap candidate for extending the metadata-only knowledge graph preview and retrieval-plan CLI into a node-driven `탐지 카드` flow.
- Captured the recommended implementation sequence: planner contract stabilization, browser-side planner reuse, node context-menu action, sidebar card rendering, and later reviewed source/support edges.
- Scoped step 1 to stable planner JSON, fixtures, and validation so the graphics UI can consume the result without treating it as GraphRAG/RAG answer generation.

### Revision `working` - Knowledge graph retrieval plan command added

- Added a metadata-only `guild-hall:knowledge-graph -- plan` command that maps a question to candidate graph nodes, one-hop relation paths, source refs, claim ceilings, missing evidence, and next-action hints.
- Kept the command below GraphRAG/RAG answer generation: it does not load source text, query NotebookLM, run vector search, assemble citations, mutate graph data, or promote canon.
- Documented the retrieval plan surface as a navigation and sourcebound review planning step before any future retrieval workflow.

### Revision `working` - GraphRAG knowledge entry registered

- Added `.registry/knowledge/graph_rag/` as a source-supported reusable knowledge entry for GraphRAG / graph-assisted RAG orientation and query-routing decisions.
- Recorded claim limits so the entry does not assert Soulforge production adoption, benchmark superiority, private corpus suitability, source truth, ontology acceptance, or NotebookLM answer authority.
- Updated the knowledge graph exporter to read `claim_ceiling` from knowledge entries when present instead of always rendering registry knowledge as `canon_entry`.

### Revision `working` - Grill Me candidate skill added

- Added `.registry/skills/grill_me/` as a tracked candidate Codex skill for `/grill-me` style plan pressure-testing and design-decision interviews.
- Kept the package as a Soulforge implementation of the interview pattern rather than copying external product runtime content.
- Documented the installed mirror target as `soulforge-grill-me` through the existing skill sync flow.

## 2026-05-22

### Revision `working` - P26-014 masked KVDS mail routing added

- Updated gateway mail priority routing so KVDS/기뢰탐색음탐기 exact matches route to official `P26-014`, including masked `기X탐` subject prefixes such as `기0탐` and `기ㅇ탐`.
- Updated the mail work status contract sample and P26-014 private routing rule to keep the former P26-030 working label from capturing new KVDS 체계개발 mail.

### Revision `working` - HWP normalization-first rule added

- Added `HWP_NORMALIZATION_V0.md` as the public-safe rule that HWP source files are not body-analysis targets until re-saved/exported as HWPX derivatives.
- Clarified workspace/workmeta contracts so HWP originals, HWPX exports, and optional PDF/text companions stay in `_workspaces` or owner-approved shared worksite storage while `_workmeta` records only inventory, queue, hash, status, extraction summary, and comparison metadata.
- Kept password entry owner-controlled, NAS/source originals read-only, and P25/reference examples below official/current/approved/accepted authority claims.

### Revision `working` - Workspace root junction exclusion rule clarified

- Clarified that shared cloud/company roots are external link targets, not `_workspaces/company` direct-child materialization roots.
- Updated `_workspaces`, workspace model, installation, and multi-PC docs so other PCs remove stale root junction pointers locally while preserving the shared worksite target.
- Kept project payloads, host-local absolute paths, private binding values, and real workspace contents out of public canon.

### Revision `working` - Recurring project ledger update canon added

- Added `PROJECT_LEDGER_UPDATE_V0.md` as the public-safe procedure for treating owner-provided recurring company PJT ledger workbooks as private project-registration source inputs.
- Clarified that workbook payloads, real project lists, actual project codes, project names, 담당자 values, customer names, row dumps, and host-local OneDrive paths stay out of public repo.
- Extended the workmeta contract schema with optional ledger, workspace materialization, responsibility, schedule, and status hint fields for private metadata projection.
- Linked the recurring ledger rule from workspace onboarding, workspace project model, workspace docs index, and `_workspaces/README.md`.

### Revision `working` - `_workmeta` raw payload storage boundary clarified

- Clarified that `_workmeta` stores metadata, run records, evidence summaries, pointers, sizes, hashes, source notes, and relocation manifests, not actual source/reference files.
- Routed HWP/HWPX, Word, Excel, PowerPoint, PDF, archive, and mail payload files to `_workspaces` or owner-approved shared worksite storage.
- Updated workspace/workmeta contracts and procedure-capture rules so future SE reference packets keep raw files out of `_workmeta`.

### Revision `working` - Knowledge graph view v0 added

- Added a metadata-only knowledge graph view model for one-variable/one-meaning visual encoding, source trace, graph scope, layout presets, and the Obsidian canon read view versus operations graph view split.
- Added `guild_hall/knowledge_graph` to generate local `_workspaces/system/knowledge_view/**` graph JSON, adjustable HTML preview, and Obsidian-readable read-only notes from public canon metadata plus explicit knowledge-access ledger refs.
- Upgraded the default generated HTML preview to a bundled Three.js 3D graph while keeping `graph_preview_2d.html` as the SVG fallback view.
- Added generated connectivity diagnostics to `graph.json`, the 3D preview sidebar, and the Obsidian graph index so sparse layouts can be checked by component count, isolated nodes, relation counts, and extraction-scope gaps.
- Fixed generated graph tooltip positioning so hover cards use graph-panel-relative coordinates and stay near the hovered node instead of drifting by the sidebar offset.
- Added workflow profile policy extraction so `.workflow/*/profile_policy.yaml` primary species/class recommendations render as `recommends` edges, and added 3D node double-click focus with adjustable chain depth plus background double-click reset.
- Updated the 3D preview so connectivity counters follow the currently selected node/relation filters, node and relation controls use Korean labels, and the active palette appears as a top-right legend.
- Separated the default relation-color palette into higher-contrast hues so common edge types such as chain, routing, use, class, species, and recommendation lines are easier to distinguish on the dark 3D canvas.
- Added short connectivity metric definitions and optional component halos so large visible connected components can be read as subtle grouped outlines without changing node-type colors.
- Increased knowledge graph node-size thresholds, added a 3D node-size basis selector that defaults to visible connection count, and slightly reduced/repositioned arrowheads so usage or hub differences read more clearly against directed edges.
- Added an in-preview collapsible visual-rules panel explaining node size, node color, border, opacity, edge width/color/style, arrows, and component outlines directly in the 3D graph UI.
- Added 3D preview sliders for overall node scale and relative node-size spread so circle size can be tuned interactively without changing graph data.
- Added selectable component halo styles so the owner can switch between visible multi-angle component outlines and restrained single-line outlines.
- Replaced the 3D default component halo from a lime multi-ring outline with a softer `연두 글로우` cloud so component grouping is visible without large crossing bands.
- Brightened the 3D `연두 글로우`, fixed the preview to scroll only the sidebar instead of clipping the canvas, and grouped sidebar settings into collapsible sections.
- Refined the 3D `연두 글로우` particles from sparse square points into denser soft round points so component clouds read less like pixel noise.
- Spread the 3D `연두 글로우` particles across the full component cloud instead of concentrating them near the center.
- Tightened the 3D candidate-edge dash spacing and clarified the visual rules panel so candidate relations read as short dotted lines rather than broken geometry.
- Hid unrelated component glows during node focus so only the selected focus range keeps its `연두 글로우`.
- Changed the default component glow into a boundary-oriented `연두 윤곽 글로우` with a dotted spherical cloud so groups are wrapped by adjustable round points instead of filled from the center.
- Scaled `연두 윤곽 글로우` shell point count from component radius so large components keep visible point spacing instead of disappearing into sparse dots.
- Replaced the shell's spiral-like point placement with seeded 3D sphere-volume sampling so close zoom reads as a sphere instead of filled orbit lines.
- Added in-preview controls for `연두 윤곽 글로우` point spacing, point size, brightness, depth, inner radius, and jitter so the owner can tune the component cloud directly.
- Set the owner's tuned `연두 윤곽 글로우` values as the new 3D preview defaults and added a single `현재 설정 저장` button that persists the full local view configuration in browser storage.
- Added a node right-click exploration menu to the 3D preview with `탐구 프롬프트 복사`, `연결만 보기`, and `ref 복사` actions, including a manual-copy fallback when clipboard access is blocked, so graph observations can be carried into a Codex follow-up without changing graph data.
- Explicitly added `Knowledge` to the foundation ontology relation matrix so graph nodes align with `.registry/knowledge/**` canon entries and class-local `knowledge_refs.yaml` bindings.
- Kept graph weights, usage counts, recency, Obsidian links, and generated previews as navigation signals only, not source truth, ontology acceptance, owner approval, archive/retire execution, or canon promotion.

### Revision `working` - SE current-authority route wording tightened

- Tightened Systems Engineering Cell party and launcher wording so official/current source questions and accepted review/action/verification claims route to source acquisition, sufficiency review, review/action closure, or accepted-result workflows before stronger claims.
- Reflected the private current-source and claim-specific evidence route pilots as route posture only, without embedding private evidence paths, raw source payloads, project truth, official artifact authority, review approval, action closure, or verification acceptance.

### Revision `working` - SE cross-stage governance workflow registered

- Registered `se_cross_stage_mapping_governance_v0` as a governance-only workflow after private pilot review across the primary SE artifact-family rows.
- Added it as an optional Systems Engineering Cell route for cross-stage artifact coverage, claim ceilings, source gaps, owner-decision needs, and downstream rerun aggregation.
- Kept source truth, official artifact authority, stage readiness, review approval, verification acceptance, private evidence, and raw reference payloads outside the public route.

### Revision `working` - SE requirements traceability route pilot added

- Added a private `requirements_traceability_set` source acquisition and lookup pilot that keeps DAPA public sources at general-context scope, P25 examples at reference-only scope, and project-specific requirement/RTM/test/acceptance sources as explicit gaps.
- Added `page_module_trace_matrix_v0` as an optional Systems Engineering Cell route for trace-governance rows, missing evidence rows, and review/verification seed rows after source-intake state is known.
- Kept the route below final RTM authority, review approval, verification completion, production-ready behavior, and official artifact authority.

### Revision `working` - Systems Engineering Cell reference lookup route added

- Added party-owned `reference_lookup_route_candidates` to `systems_engineering_cell` so source-sensitive SE requests first consider official source packs and registered reference-example lookup hints.
- Kept `se_authority_example_bridge_agentic_lookup_v0` at `pilot_executed_private_candidate` posture: route hint only, not public canon, production-ready behavior, or official artifact authority.
- Thinly synced the Systems Engineering Cell launcher skill so it can notice party-declared private lookup candidates without embedding private evidence paths, source excerpts, or raw reference content.
- Recorded next pilot families as `requirements_traceability_set` and `quality_qgate_forms`.

## 2026-05-21

### Revision `working` - Project mail history private writer added

- Added a `_workmeta/<project_code>/reports/메일_이력/` private writer for mail-derived monster create/update/filing events.
- Added candidate-stage `_workmeta/P00-000_INBOX/reports/메일_이력/` history so received work-like mail is recorded before and even without monster creation.
- The writer now refreshes Korean-named `메일_이력.csv`, `메일_이력.xlsx`, and `메일_일정이벤트.ics` outputs with `이력키` upsert dedupe.
- Wired mail fetch candidate queue, gateway intake/update, and dungeon assignment filing to the writers without copying raw mail body, HTML, raw payload, attachment names, URLs, or local paths.

### Revision `working` - Always-on healer seven checks added

- Added a reusable healer check module for snapshot/map freshness, launchd liveness, stray development-file placement, report freshness, repo sync, secret/raw path leakage, and restore readiness.
- Integrated the seven checks into `guild-hall:healer:run`, with warning checks carried forward in activity context without marking the whole run failed.
- Documented the 24-hour PC check set and kept the mail-candidate-to-monster resolver classified as later work outside the healer success criteria.
- Added the concrete 24-hour PC pull, snapshot refresh, launchd install/verify, and healer light/full smoke rollout checklist.

### Revision `working` - Development intake storage rule clarified

- Added a roadmap-owned storage rule for development candidates, backlog, and future work so agents do not create ad hoc TODO or plan files.
- Routed unclear work to roadmap-level candidates, concrete owner work to existing owner surfaces, and unapproved agent-discovered implementation work to `_workmeta/**/dev_worker_candidate_queue`.
- Added a short `AGENTS.md` pointer so future development-intent capture checks the roadmap rule before writing files.

### Revision `working` - Mail notify attachment count excludes body links

- Updated gateway mail notification and mail candidate summaries so body links discovered in message HTML/text are not counted as user-visible attached files.
- Kept `body_link` entries in the event attachment array for link handling, while reporting attachment counts from actual message attachment parts only.

### Revision `working` - PCB Revision Library Cell launcher skill added

- Added `.registry/skills/pcb_revision_library_cell_launcher/` as the tracked Codex launcher for invoking the existing `.party/pcb_revision_library_cell` loadout.
- Framed the launcher around the practical route `allegro_pcb_dbdoctor_uprev_batch_v0` before `allegro_pcb_dlib_export_organize_v0`.
- Kept party chains, workflow procedures, optimizer profile policies, PCB payloads, Cadence paths, generated scripts, tool logs, owner mutation approvals, electrical/manufacturing claims, and local runtime bindings outside the launcher skill.
- Documented the Codex bridge shape so the installed mirror can be synced as `soulforge-pcb-revision-library-cell-launcher`.

### Revision `working` - PCB revision/library party registered

- Added `.party/pcb_revision_library_cell/` as the reusable party for chaining `allegro_pcb_dbdoctor_uprev_batch_v0` into `allegro_pcb_dlib_export_organize_v0`.
- Registered the party in `.party/index.yaml`, updated party docs, and added compatibility hints to both Allegro workflow packages.
- Kept runtime board roots, Cadence executable paths, generated scripts, PCB payloads, tool logs, owner mutation approvals, and workflow profile choices outside party canon.
- Preserved non-claims for electrical correctness, manufacturing readiness, symbol geometry correctness, padstack engineering approval, and unattended archive-wide mutation.

### Revision `working` - Systems Engineering Cell launcher skill added

- Added `.registry/skills/systems_engineering_cell_launcher/` as the tracked Codex launcher for invoking the existing `.party/systems_engineering_cell` loadout.
- Framed the launcher around the practical request "find where this SE project is blocked and route the next workflow" rather than design automation.
- Kept party chains, workflow procedures, optimizer profile policies, project payloads, design authority, review approval, verification acceptance, owner decisions, and local runtime bindings outside the launcher skill.
- Documented the Codex bridge shape so the installed mirror can be synced as `soulforge-systems-engineering-cell-launcher`.

### Revision `working` - Allegro DB Doctor workflow profile calibrated

- Added public-safe synthetic CLI calibration archive `cal_20260521_cli_quality_equiv_001` for `.workflow/allegro_pcb_dbdoctor_uprev_batch_v0/`.
- Updated the workflow profile policy to prefer `gpt-5.4-mini` / `medium` / `dwarf` / `auditor`, with `gpt-5.4` / `medium` and `gpt-5.5` / `medium` shadows for quality-sensitive reruns.
- Kept DB Doctor runtime paths, real PCB payloads, private run truth, and secrets out of the public archive; the calibration remains a profile recommendation, not an unattended full-archive conversion claim.

### Revision `working` - Knowledge Wiki Cell launcher skill added

- Added `.registry/skills/knowledge_wiki_cell_launcher/` as the tracked Codex launcher for invoking the existing `.party/knowledge_wiki_cell` loadout.
- Kept party chains, workflow procedures, optimizer profile policies, source truth, owner decisions, archive authority, and local runtime bindings outside the launcher skill.
- Documented the Codex bridge shape so the installed mirror can be synced as `soulforge-knowledge-wiki-cell-launcher`.

### Revision `working` - Sample party templates retired

- Removed the sample `vanguard_strike` and `lineage_strike` party packages from active `.party` canon.
- Updated the party catalog, party README, naming draft docs, workflow compatibility notes, and sample species bias so no active reference points at the retired party ids.
- Kept the underlying sample workflows as unbound workflow entries rather than deleting additional workflow canon in the same cleanup.

### Revision `working` - Korean knowledge closeout wording clarified

- Clarified that bounded Soulforge completion reports should show user-facing Korean knowledge trigger and claim-ceiling labels first, such as `지식 트리거 확인: 책임자 판단 필요` and `주장 한계: 관찰됨`.
- Kept internal enum values for ledger, CLI, review packet, and template compatibility, while treating enum-only final wording as legacy/compatibility rather than the preferred user surface.
- Updated the knowledge trigger stop guard to accept `책임자 판단 필요` while preserving the older `오너 판단 필요` and English compatibility lines.

### Revision `working` - Knowledge pass-to-registration rule clarified

- Clarified that knowledge, source, candidate, and canon criteria that pass must be registered in the matching owner surface during the same bounded task.
- Split the 5-question knowledge trigger check from public canon registration: trigger pass records candidate, metadata, follow-up, sourcebound review, or owner-decision evidence; canon pass records the canon entry or package.
- Required concrete hold reasons when passed registration is deferred, such as owner hold, unclear owner surface, validator blockage, missing access, or public/private boundary risk.

### Revision `working` - Party launcher skill author added

- Added `.registry/skills/party_launcher_skill_author/` as the tracked Codex authoring aid for turning an existing `.party/<party_id>` loadout into a thin callable launcher skill.
- Kept party chains, workflow procedures, optimizer profile policy, runtime bindings, project payloads, and default-route authority outside the generated launcher skill.
- Documented the Codex app bridge shape with lean `codex/SKILL.md`, `codex/agents/openai.yaml`, and on-demand `codex/references/mapping.md`, so the installed mirror can be synced as `soulforge-party-launcher-skill-author`.

### Revision `working` - Drive warehouse and NotebookLM bookshelf rules clarified

- Added `KNOWLEDGE_WAREHOUSE_BOOKSHELF_RULES_V0.md` to separate Google Drive as the source warehouse, NotebookLM notebooks as query bookshelves, `_workmeta` as the source catalog, and ontology candidates as review-gated metadata.
- Updated the knowledge operating model, workflow stack, curation runbook, and public LLM wiki example templates so Drive folders are no longer described as NotebookLM bookshelves.
- Linked the same warehouse/bookshelf rule from `knowledge_wiki_cell` so party execution inherits the terminology without duplicating the rule body.
- Preserved the existing `Soulforge_LLM_Wiki_Bookshelf/` Drive root as a compatibility label while clarifying that its role is warehouse/archive storage, not query authority or canon.

### Revision `working` - Allegro DB Doctor uprev workflow added

- Added `.workflow/allegro_pcb_dbdoctor_uprev_batch_v0/` as a registered workflow for owner-gated Cadence DB Doctor legacy PCB database uprev batches.
- Kept sample folders and installed Cadence executable paths out of the public workflow package; operators supply absolute runtime paths through the batch scope packet.
- Captured the old/new packet shape, DB Doctor `-outfile` route, log-based warning-bearing completion classifier, and non-claims for electrical correctness, manufacturing readiness, and unattended full-archive mutation.

### Revision `working` - Allegro dlib export organize workflow added

- Added `.workflow/allegro_pcb_dlib_export_organize_v0/` as a registered workflow for owner-gated Cadence Allegro `dlib` board library export and library folder organization.
- Kept board roots, installed Allegro paths, generated scripts, and raw PCB payloads out of the public workflow package; operators supply absolute runtime paths through the library export scope packet.
- Captured the `padpath`, `psmpath`, `devpath`, and `logs` folder classification rules, `dump_libraries.log` zero-error success check, transient export folder cleanup check, and non-claims for electrical correctness, symbol geometry correctness, manufacturing readiness, and unattended full-archive mutation.

### Revision `working` - Allegro dlib workflow profile calibrated

- Added public-safe staged CLI calibration archive `.workflow/allegro_pcb_dlib_export_organize_v0/calibrations/cal_20260521_dlib_public_fixture_001/`.
- Promoted the workflow profile policy to `gpt-5.5` / `medium` / `dwarf` / `archivist` after semantic quality-gate review on a synthetic fixture.
- Recorded calibration limitations: no real Allegro execution, raw PCB payload, installed Cadence path, private-state data, `_workspaces` output, or `_workmeta` run truth was used.

## 2026-05-20

### Revision `working` - SE assistant operating loop registered

- Added `.workflow/se_assistant_operating_loop_v0/` as a structure-only request router for systems-engineering assistant work across scaffold, stage-gap, source/wiki, readiness, owner-decision, review, and closeout workflows.
- Added `.party/systems_engineering_cell/` as the reusable party/loadout for SE assistant routing, while keeping workflow profile choices and project-local run truth outside party canon.
- Added `docs/architecture/workspace/SE_ASSISTANT_OPERATING_MODEL_V0.md` and tightened Boss Clear wording so stage completion cannot be inferred from folder/output presence alone.
- Kept the new route below production-ready or pilot-executed claims; it is registered public-safe orchestration structure, not design authority, source truth, review approval, or verification acceptance.

### Revision `working` - Mail work priority queue projection added

- Added metadata-only `mail_work_priority` refresh/list command surfaces on top of `mail_work_status`, writing local priority output to `guild_hall/state/gateway/mail_work_status/priority_latest.json`.
- Added deterministic subject-only routing rules for exact `P26-030`, unresolved work review inbox, duplicate thread grouping, personal/admin holds, and promo/non-work holds without reading raw mail payloads.
- Documented the priority projection contract and added gateway tests for exact routing, duplicate threads, personal/admin, promo non-work, raw boundary false, and list filtering.

### Revision `working` - Long-thread handoff Codex wrapper added

- Added `.registry/skills/long_thread_handoff/` as the tracked Codex wrapper for explicit long-thread contamination-free handoff requests.
- Kept the launcher opt-in only, so normal short tasks do not automatically inherit the fresh-subagent manager mode.
- Preserved Telegram delivery as a safe closeout handoff unless a configured sender and explicit authorization are available.

### Revision `working` - GitHub up/down Codex wrappers added

- Added `.registry/skills/github_down/` as the tracked Codex wrapper for GitHub down/latest-update/download requests.
- Added `.registry/skills/github_up/` as the tracked Codex wrapper for GitHub up/upload/publish requests.
- Bound the wrappers to the existing `.workflow/latest_update_sync_and_followup_v0/` and `.workflow/github_upload_publish_v0/` procedures instead of moving GitHub policy into skills.
- Documented that `skill sync` only materializes repo-tracked `.registry/skills/**/codex` wrappers and cannot infer local-only skills from another PC.

### Revision `working` - Mail work status projection and gateway sync-back added

- Added `docs/architecture/workspace/MAIL_WORK_STATUS_V0.md` and `guild_hall/gateway/mail_work_status.mjs` so local-only `mail_work_status/latest.json` can reconcile mail candidate, gateway intake, project monster, private mission index, and battle event metadata into one status projection.
- Added `guild-hall:gateway:mail-work:refresh` and `guild-hall:gateway:mail-work:list` command surfaces plus gateway projection tests.
- Updated dungeon assignment filing so gateway-origin monsters sync back to `transferred` current state, populate `project_monster_ref` and private `mission_ref` when available, and append matching gateway history / global event rows without copying raw mail payload.

### Revision `working` - GitHub upload workflow added

- Added `.workflow/github_upload_publish_v0/` as a reusable upload workflow for validating, committing, and pushing public Soulforge changes together with `_workmeta` and `private-state` metadata repo changes.
- Registered the workflow in `.workflow/index.yaml`, added it to `guild_master_cell` allowed workflows, and recorded the Korean global-name candidate `운영_깃허브업로드_v0`.
- Kept public/private Git roots separate and required validation plus boundary review before claiming upload completion.

### Revision `working` - Latest update follow-up workflow added

- Added `.workflow/latest_update_sync_and_followup_v0/` as a draft event-driven workflow for checking latest GitHub/upstream updates, companion repo freshness, project material completeness, workspace junction state, and follow-up routes.
- Registered the workflow in `.workflow/index.yaml` and linked it from `.workflow/README.md`.
- Ran a report-only private pilot, moved the workflow to active report-only maturity, added it to `guild_master_cell` allowed workflows, and recorded the Korean global-name candidate `운영_최신업데이트후속점검_v0`.
- Added Codex skill mirror drift handling so latest-update runs can compare `.registry/skills/**/codex` against the local installed skill mirror and sync missing or stale skills through `npm run skills:sync`.
- Kept junction repair authority owner-gated: public workflow canon references `_workmeta/system/bindings/workspace_junctions.yaml` as portable intent only and does not store host-local cloud roots, secrets, source payloads, or automatic mutation authority.

### Revision `working` - Workspace shared-link rule clarified

- Clarified that project payloads shared across owner PCs should live in an owner-approved shared worksite, with `_workspaces/<project_code>/` materialized as a local junction or symlink view.
- Updated onboarding, workspace model, installation, and multi-PC docs to keep host-local shared target paths out of public tracked files.
- Kept public Git scope limited to generic workspace rules; raw project media and measurement payloads remain outside public tracking.

## 2026-05-19

### Revision `working` - 21 workflow optimizer gap batch closed

- Applied workflow-check and workflow-optimizer follow-through to the 21 workflows listed in the 2026-05-19 optimizer gap scan.
- Added or replaced `profile_policy.yaml` calibration state, public-safe `calibrations/cal_20260519_quality_equiv_001/` archives, and `history/2026-05-19_quality_equiv_001.md` notes across the affected workflow packages.
- Added missing workflow package READMEs for `frontline_assault` and `build_lineage_map`, while keeping readiness labels conservative and leaving `post_development_review_gate_v0` locked to its strongest review profile.

### Revision `working` - Workflow check skill registered

- Added `.registry/skills/workflow_check/` as the tracked canonical skill package for the installed `soulforge-workflow-check` Codex skill.
- Added the Codex bridge and UI metadata so other PCs can materialize it with `npm run skills:sync -- workflow_check` or the bootstrap `--all` sync.
- Linked the skill from `.registry/skills/README.md` and kept registration/default-route authority outside the checker itself.

## 2026-05-18

### Revision `working` - Knowledge wiki Obsidian contract and synthetic pilot smoke

- Added an Obsidian export decision surface to `knowledge_wiki_pipeline_v0` so the composite candidate now records when a generated read-only view is requested and blocks export unless the source is canon-backed.
- Fixed the default Obsidian posture to `_workspaces/system/knowledge_view/obsidian_export/` as a local generated runtime surface, not a canon owner root and not a Drive-synced primary vault.
- Clarified in `knowledge_wiki_cell` party docs that Obsidian consumes canon-backed `.registry/knowledge` entries or approved canon packages only; `_workmeta` payloads, Drive candidate files, and NotebookLM answers remain outside the vault body.
- Expanded `KNOWLEDGE_WIKI_WORLDVIEW_V0.md` with concrete Obsidian file naming, frontmatter, link, metadata-ref, read-only, and regen/drift rules.
- Recorded a latest-policy synthetic manifest-only smoke under `_workmeta/system/runs/knowledge_wiki_cell_latest_policy_smoke_20260518/` and kept `knowledge_wiki_pipeline_v0` unregistered even after the pilot.

### Revision `working` - SE knowledge wiki composite registered and selected

- Registered `knowledge_wiki_pipeline_v0` in `.workflow/index.yaml`.
- Switched `knowledge_wiki_cell` to use `knowledge_wiki_pipeline_v0` as the default party entry by owner direction.
- Kept the older four-stage lane as the composite workflow's downstream execution chain rather than removing those registered workflows.

### Revision `working` - Workflow knowledge preflight added

- Removed the mistaken `knowledge_investigation_cell` party surface because the intended abstraction is a cross-cutting pre-start investigation workflow, not a reusable party chain.
- Added `.workflow/workflow_knowledge_preflight_v0/` as the generic workflow that checks `.registry/knowledge`, canon-backed Obsidian export, NotebookLM bindings, `_workmeta` evidence, and Drive refs before a target workflow starts.
- Kept the result metadata-only so the preflight seeds claim ceilings and next routes without becoming source truth, owner approval, or canon authority.

### Revision `working` - Knowledge wiki worldview overview added

- Added a teammate-facing Markdown and standalone HTML overview for the Soulforge knowledge wiki worldview.
- Explained source truth, private projection, concept candidates, review gates, canon knowledge, access ledger, current development status, and the SE wikiization next steps in public-safe language.
- Added the workspace map for local PC, `_workmeta`, Google Drive, NotebookLM, `.workflow`, `.party`, `.registry/knowledge`, and access ledger roles.
- Revised the workspace map so Google Drive is the owner-held file archive and backup for inbox candidates, source files, working bundles, and canon packages; `_workmeta` remains the Karpathy-style data-work location, NotebookLM remains the canon-package query interface, and Obsidian remains a canon-only read view.
- Threaded the Drive archive model into the wiki party/workflow surfaces by adding owner-held archive manifest fields to source intake, sourcebound projection, and the draft SE knowledge wiki pipeline.
- Added `codex_skill_auto_sync` archive authority so approved Codex skills or the Google Drive connector may upload/sync bounded archive files without per-file owner confirmation while preserving source/canon/secret boundaries.
- Linked the overview from the guild hall architecture README.

### Revision `working` - Knowledge wiki party registered

- Registered `.party/knowledge_wiki_cell` as the reusable Karpathy-style sourcebound wikiization party.
- Linked source intake, private sourcebound projection, metadata-only knowledge access capture, and post-development review into one party-level workflow chain.
- Kept workflow execution profiles, model/reasoning/species/class/unit optimization, source payloads, extracted text, and private wiki projections outside party canon.

### Revision `working` - Party model re-scoped to workflow chains

- Re-scoped `.party` from reusable unit/team composition to reusable workflow-chain/loadout orchestration.
- Clarified that workflow optimizer outputs for model, reasoning effort, species, class, and unit/profile choices belong under each `.workflow` profile/calibration surface.
- Updated party, mission, runner, autohunt, ontology, UI source-map, and workspace docs to treat party as a higher-level workflow sequence that prevents agents from re-expanding every lower workflow by default.

## 2026-05-17

### Revision `working` - Knowledge workflow stack and missing layers added

- Added `monster_knowledge_preflight_v0` as the query-first front gate for source-heavy or ambiguity-heavy monsters so project wiki, NotebookLM bindings, and source ledgers can be inspected before the main workflow runs.
- Added `knowledge_candidate_triage_v0` as the explicit filter between candidate material and reusable wiki state, covering bookshelf placement, packet eligibility, owner review routing, and metadata-only boundary review.
- Added `wiki_curation_maintenance_v0` as the executable metadata-only curation layer and `llm_wiki_builder_v0` as the end-to-end stack orchestrator that ties preflight, triage, optional sourcebound deepening, curation, usage capture, and governance into one bounded route.
- Added `KNOWLEDGE_WORKFLOW_STACK_V0.md` and `WIKI_CURATION_MAINTENANCE_V0.md` to document the usable six-layer knowledge stack, the current-default project operating loop, and the human-readable curation runbook that sits beside the executable curation layer.
- Clarified in `KNOWLEDGE_OPERATING_MODEL_V0.md` and `AUTOHUNT_MODEL.md` that source-heavy monsters may use a knowledge preflight front gate and that curation remains a separate metadata-only maintenance layer.

## 2026-05-18

### Revision `working` - Workflow lane and party service lane boundary added

- Added workflow `classification_lane` guidance so workflow lanes are discovery/indexing metadata only, not owner or execution authority.
- Added party `service_lane` guidance and fields to the three current party templates so party fit can be described without owning workflow steps.
- Extended the workflow draft template with `classification_lane` and `execution_binding` placeholders, keeping actual execution binding in party allowed-workflows or mission assignment.
- Updated the canonical `workflow_generator` skill and installed `soulforge-workflow-generator` mirror so future generated workflows preserve the same lane and party-binding boundary.
- Added a draft lane taxonomy and Korean display-name fields for workflow classification lanes and party service lanes.

### Revision `working` - Workflow and party name mapping drafts added

- Added `.workflow/docs/WORKFLOW_NAME_MAPPING_TABLE_V0.md` with draft Korean alias/display-name candidates for all 44 workflows currently registered in `.workflow/index.yaml`, without renaming ids, folders, or index entries.
- Added `.party/docs/PARTY_NAMING_CONTRACT_V0.md` and `.party/docs/PARTY_NAME_MAPPING_TABLE_V0.md` to separate stable `party_id`, slash-free Korean `global_name_ko` alias candidates, and descriptive `display_name_ko` values for the 3 current party entries.
- Added derived static HTML review pages at `.workflow/docs/WORKFLOW_NAMING_DRAFT_V0.html` and `.party/docs/PARTY_NAMING_DRAFT_V0.html` so humans can review the draft naming layers and full mapping tables without treating HTML as canon.
- Clarified the draft resolve chain `global_name_ko -> workflow_id -> party_id -> path` while keeping alias catalog placement, namespace policy, and any future rename/deprecation as follow-up owner decisions.
- Linked the new draft mapping documents from `.workflow/README.md` and `.party/README.md`.

### Revision `working` - Workflow naming contract draft added

- Added `.workflow/docs/WORKFLOW_NAMING_CONTRACT_V0.md` as a draft authoring contract for separating slash-free Korean invocation aliases, descriptive Korean display names, and canonical English `snake_case` workflow ids.
- Linked the draft from `.workflow/README.md`, `.workflow/authoring/README.md`, and the workflow draft template, including draft-only `global_name_ko` and `display_name_ko` fields, so new workflow authoring can reference it without adding validator enforcement.
- Clarified that Codex official feature constraints do not define Soulforge workflow global names, and that Korean invocation aliases must resolve to canonical `workflow_id` entries in `.workflow/index.yaml`.
- Documented a conservative migration posture for the 44 registered workflows observed on 2026-05-18, including mixed `_v0` usage and legacy short ids.

### Revision `working` - Knowledge stack made runnable and practiced

- Raised `monster_knowledge_preflight_v0`, `knowledge_candidate_triage_v0`, `wiki_curation_maintenance_v0`, and `llm_wiki_builder_v0` to `pilot_executed_private_evidence` after a bounded private P24 practice run.
- Recorded that the stack can now execute `query-first preflight -> candidate triage -> known-gap stop -> curation packet -> final builder handoff` without rereading raw sources or overclaiming technical authority.
- Kept the remaining gaps narrow: per-source Drive-backed source rows still need to be populated over time, and scheduled maintenance binding is still weaker than the manual/review-driven path.

### Revision `working` - LLM wiki bookshelf public example added

- Added a public-safe `llm_wiki_bookshelf/` example package with an offline/manual canonical-source intake checklist, metadata-only source ledger template, and NotebookLM packet map template.
- Linked the example from the workspace examples index and knowledge operating model while keeping source payloads, live Drive or NotebookLM IDs, account state, runtime absolute paths, and NotebookLM answers out of public canon.
- Kept Google Drive bookshelf and NotebookLM packet claims at manual/advisory metadata level without requiring live external state.

### Revision `working` - Google Drive LLM wiki bookshelf boundary added

- Documented Google Drive `Soulforge_LLM_Wiki_Bookshelf/` as the owner-held source bookshelf model for LLM wiki material across PCs.
- Clarified that NotebookLM should use approved CANON bookshelf sources while OneDrive remains for active work files and `_workmeta` remains the metadata ledger.
- Kept Drive folder placement, NotebookLM output, drafts, raw mail, local-only working files, and uncertain versions out of canon authority without source approval, review evidence, and owner records.
- Added the planned development direction for metadata-only source ledgers, NotebookLM packet maps, knowledge-use records, review packets, and promotion candidates.

### Revision `working` - Mac mini and MacBook role split clarified

- Clarified the current owner device split: MacBook Air as `portable_dev_pc`, Mac mini operations clone as `always_on_node`, and Mac mini development worktree as a separate `dev_worker_pc`-style surface.
- Updated always-on and dev-worker bootstrap prompts so the Mac mini can run long-lived development tasks without dirtying the clean operations clone.
- Documented that OneDrive/cloud workspaces may hold actual project files only, while public repos, `_workmeta`, `private-state`, `guild_hall/state` runtime, env files, sessions, and tokens stay outside cloud sync.

### Revision `working` - Local absolute path upload guard added

- Added `validate:path-policy` to block concrete local absolute paths in changed tracked/upload candidates before root validation proceeds.
- Added `validate:path-policy:all` and `validate:path-policy:state` for full tracked audits and companion repo changed-file audits.
- Fixed registry knowledge YAML notes that became invalid once the canon validator started parsing knowledge entries.

### Revision `working` - End-of-task knowledge trigger check added

- Added an end-of-task Knowledge Trigger Check to the Soulforge execution contract so bounded work closes with `no_trigger`, `metadata_only_record`, `sourcebound_review_candidate`, or `owner_decision_needed`.
- Extended `post_development_review_gate_v0` and its review packet template to record the trigger result before supervisor acceptance without granting source-truth, ontology, owner-approval, graph, archive/retire, or canon authority.
- Clarified that existing `knowledge_access_event.accumulation_delta_hint` can carry lightweight trigger signals for already-used refs, while new unregistered patterns should route through procedure capture, daily sweep, sourcebound review, or owner decision.
- Added `guild-hall:knowledge-access record` trigger flags so end-of-task checks can append metadata-only `accumulation_delta_hint` rows from the CLI, with validation coverage for allowed trigger results, routes, and claim ceilings.
- Defined task end as bounded completion reporting rather than thread closure, and added a low-noise Codex Stop hook guard helper that only catches missing `Knowledge trigger check:` lines without judging or storing knowledge.
- Localized the user-facing Stop hook closeout to Korean `지식 트리거 확인: 없음` while keeping legacy English closeout lines accepted for compatibility.

### Revision `working` - Renderer Knowledge Lane review fixes

- Whitelisted renderer Knowledge Lane owner-gated states, the `observed` claim ceiling, and known private/local `evidence_counts` keys before display.
- Suppressed Knowledge Lane state/claim rendering unless the loaded snapshot is fresh, so stale or invalid stored lanes degrade instead of looking current.
- Added the snapshot contract presence fields `helper_present`, `notebooklm_bridge_present`, `workflow_present_count`, and `fixture_present` to the renderer display.

### Revision `working` - Renderer Knowledge Lane slice added

- Added renderer-web consumption of `operation_board.sections.knowledge_lane` as a metadata-only Operation Board section.
- Rendered only sanitized owner-gated state, claim ceiling, evidence counts, blockers, and next owner-review action without validation, ontology acceptance, owner decision, or canon promotion authority.

### Revision `working` - Snapshot knowledge lane review fixes

- Enforced snapshot v0 `knowledge_lane` state/blocker/evidence support and claim-ceiling validation in freshness comparison so manually strengthened stored lanes fail instead of passing as fresh.
- Kept public helper/docs/workflows/fixtures out of `knowledge_lane.evidence` counts; private/local metadata evidence is counted separately from public metadata surfaces.
- Excluded auth/session-shaped knowledge access files from entry counts while continuing to avoid reading or exposing their contents/names.

### Revision `working` - Snapshot knowledge lane status added

- Added a metadata-only `knowledge_lane` snapshot surface and Operation Board section for knowledge/NotebookLM/ontology lane status.
- Summarized only owner-gated state, helper/workflow/fixture presence, evidence presence/counts, claim ceiling, blockers, and next owner-review action.
- Kept NotebookLM auth/session data, query/answer/source payloads, private report prose/filenames, ontology candidate statements, owner decisions, graph mutations, and registry promotion claims out of the snapshot.

### Revision `working` - NotebookLM metadata bridge helper promoted

- Added `guild_hall/knowledge_access/notebooklm_bridge.mjs` plus `notebooklm-bridge`/`notebooklm-import` CLI commands for importing explicit NotebookLM-like binding/source-ledger/query-log metadata into `imported_log_entry` ledger rows.
- Kept the bridge metadata-only and advisory: no `nlm` calls, no auth/session file reads, no source payload or free-form query-log reason copying, no no-query event fabrication, and no canon/ontology mutation.
- Blocked malformed `timestamp_utc` rows, unsafe `entry_ref` auth/session/runtime paths, and invalid event enum cells before deriving imported ledger refs or emitting bridge summaries.
- Extended the public synthetic NotebookLM fixture with a blocked no-query case and validation coverage for positive imports, CLI import, and no-query/no-fabrication behavior.

### Revision `working` - Synthetic NotebookLM bridge fixture added

- Added a public-safe synthetic NotebookLM bridge fixture under `docs/architecture/workspace/examples/notebooklm_bridge/`.
- Covered NotebookLM-like `imported_log_entry` advisory rows in the knowledge access analyzer test without changing helper code.

### Revision `working` - Test/evaluation result ingest workflow registered

- Registered `.workflow/test_evaluation_execution_result_ingest_v0` as a contract-level/private-evidence workflow for packaging non-simulation-specific execution or result-ingest evidence into candidate result rows, blockers, owner follow-up, and downstream acceptance-review handoffs.
- Kept the claim ceiling at `registered_contract_private_evidence`: this registers the reusable package only, not accepted verification, owner acceptance, TRR/DT/FCA/OT/PCA approval, usable status, production readiness, or profile optimization.
- Recorded private registration governance under `_workmeta/system/runs/test_evaluation_execution_result_ingest_registration_20260517_014107/` and left controlled pilot execution plus accepted-result handoff verification as future strengthening gates.

### Revision `working` - Knowledge validation guardrails tightened

- Added shared knowledge claim states for `observed`, `source_supported`, `validated_private`, `canon_candidate`, `canon_entry`, and `rejected_or_blocked` knowledge.
- Clarified that NotebookLM, LLM advice, ledgers, and analysis labels are advisory signals only, not validation, ontology acceptance, owner approval, or canon-promotion authority.
- Added minimal canon entry guards for registry knowledge entries and public canon promotion.

### Revision `working` - SE stage artifact gap scan workflow registered

- Registered `.workflow/se_stage_artifact_gap_scan_v0` as the reusable controller package for one-stage SE artifact/gap scanning, owner/source queueing, blocker preservation, draftable/diagram lane surfacing, and downstream route mapping.
- Kept the claim ceiling at `registered_controller_private_evidence`: this registers the controller package only, not PDR/CDR/TRR/FCA/OT readiness, approval, test execution, verification completion, production readiness, or profile optimization.
- Recorded private registration governance under `_workmeta/system/runs/se_stage_gap_scan_registration_20260517_013027/` and linked later-stage route vocabulary to already registered generic workflows such as verification planning, harness planning, accepted result packets, FCA, and PCA lanes.

### Revision `working` - Knowledge operating model documented

- Added `docs/architecture/guild_hall/KNOWLEDGE_OPERATING_MODEL_V0.md` to explain how the knowledge access ledger, manual candidate capture, LLM suggestion approval, end-of-work sweep, sourcebound packet loop, and access-event analysis workflow combine without crossing public/private owner boundaries.
- Linked the operating model from the guild_hall architecture index and the knowledge access helper README, including the rule that normal file reads are not automatically observed unless the helper/read wrapper or explicit record is used.

### Revision `working` - HTML outbound mail runner added

- Added `guild-hall:gateway:send-mail` as a local SMTP outbound runner under `guild_hall/gateway/mail_send/`.
- Enabled `multipart/alternative` HTML report emails with plain-text fallback while keeping SMTP credentials in local-only `guild_hall/state/gateway/mailbox/state/mail_send.env`.
- Updated the mail send owner docs so outbound snapshots and append-only send logs remain under ignored `guild_hall/state/gateway/**` local state.

### Revision `working` - AI output format policy added

- Added `AI_OUTPUT_FORMAT_POLICY_V0.md` to keep durable source-of-truth records in Markdown/YAML/JSON while allowing self-contained HTML as derived human-review artifacts.
- Required HTML review artifacts to preserve public/private/secret boundaries and export durable decisions back to text or structured data.
- Added a dedicated validator/test surface for the output-format policy.

### Revision `working` - Dev worker candidate promotion lane added

- Added a `dev_worker_candidate_queue` lane for agent-discovered work so self-generated tasks can be recorded as candidates without being immediately claimable by high-performance worker PCs.
- Added `guild-hall:dev-worker:candidates` to list candidates and promote owner-approved candidates into `_workmeta/<project_code>/dev_worker_queue/*.yaml`.
- Tightened `dev_worker` claim eligibility so `origin.kind: agent_generated` ready packets require `owner_approval.approved: true`.
- Added a low-risk `auto_approval` policy so eligible agent-generated candidates can be policy-approved and promoted without manual owner approval.
- Updated the local dev-worker automation prompt to run auto-promotion before claiming one ready task.
- Updated daily work packets to show candidate, promotable candidate, and auto-approvable candidate counts.
- Documented high-performance PC setup, candidate approval, promotion, and worker activation boundaries.
- Added a self-contained HTML next-steps review artifact for owner-facing setup and operation handoff.

## 2026-05-16

### Revision `working` - Repository line ending policy pinned

- Added root `.gitattributes` and `.editorconfig` to keep text files normalized to LF across Windows, editors, and GitHub workflows while preserving common binary artifact formats.

- Documented the always-on Mac mini strategic review stack, separating deterministic `healer`, daily `night_watch`, and weekly `ouroboros_strategic_review_harness_v0` responsibilities.
- Strengthened `ouroboros_strategic_review_harness_v0` with a Socratic question router, ambiguity ledger, owner-question option shape, and closure restatement gate so strategic gaps become answerable decisions instead of broad meta-questions.

### Revision `working` - Knowledge access ledger operating model clarified

- Clarified that ordinary knowledge use creates lightweight metadata-only ledger/register rows, while `knowledge_access_event_capture_v0` is the later normalization, rollup, analysis, and routing workflow rather than a required per-access run.
- Added minimal capture-mode, manual-note, reason-used, output-ref, and ledger/register refs to the public-safe event and binding templates while keeping source truth, payload truth, ontology acceptance, archive/retire decisions, and owner decisions out of scope.

### Revision `working` - Knowledge access ledger helper added

- Added `guild_hall/knowledge_access` as a minimal helper for appending metadata-only knowledge access JSONL rows from explicit `read` and `record` commands.
- Blocked secret-like, private/runtime, absolute, and traversal knowledge refs before ledger append, and added focused `validate:knowledge-access` coverage to the root acceptance harness.

### Revision `working` - Knowledge access event capture workflow registered

- Added `.workflow/knowledge_access_event_capture_v0` as a reviewed public-safe draft workflow for capturing metadata-only knowledge access events across workflows, skills, missions, user tasks, tools, and advisory handoffs.
- Defined actor, target knowledge ref, access type, work context, timestamp, outcome/usefulness, relation hints, usage rollups, hot/warm/cold/stale/archive/retire candidate labels, strong/weak/orphan/redundant link candidates, and graph update packets.
- Linked the workflow as an optional downstream usage-lineage lane from `sourcebound_knowledge_packet_operating_loop_v0` while keeping source truth, private payloads, advisory answers, archive/retire execution, owner decisions, and profile optimization out of scope.

### Revision `working` - Sourcebound knowledge packet loop registered

- Registered `.workflow/sourcebound_knowledge_packet_operating_loop_v0` as a pilot-executed private-evidence workflow for Karpathy-style source intake, private source-bound projection/index/log generation, contradiction/gap lint, concept-candidate extraction, claim-ceiling routing, optional advisory NotebookLM handoff, and workflowization review packets.
- Kept source truth in source packets or owner-held sources, kept projection outputs private and derivative, and left profile policy draft/conservative with no production-ready or profile-optimized claim.

### Revision `working` - Ouroboros strategic review harness drafted

- Added `.workflow/ouroboros_strategic_review_harness_v0` as a reviewed public-safe draft workflow for periodic vision alignment review and owner-intent gap probing.
- Added templates for `vision_alignment_report`, `owner_intent_gap_register`, `owner_question_queue`, `canon_constraint_candidate_register`, `next_focus_recommendation`, and `ouroboros_loop_ledger`.
- Recorded a private Ouroboros harness study/adoption packet under `_workmeta/system` and kept external runtime installation, ontology convergence claims, and automatic canon mutation out of scope.
- Allowed `guild_master_cell` to route strategic review and owner-intent gap requests through the new harness.
- Documented the harness as a weekly or owner-triggered `night_watch` candidate rather than a replacement for nightly boundary, portability, and context-drift checks.

### Revision `working` - SE assistant program direction documented

- Added an SE assistant north-star to `VISION_AND_GOALS.md` while keeping `se_foldertree_generate` limited to folder and plan-tracking scaffold generation.
- Added an SE assistant program lane to `DEVELOPMENT_ROADMAP_V0.md` without replacing the current `snapshot_to_operation_board_v0` active slice.
- Fixed the owner split so proactive orchestration lives in `.workflow`, `.mission`, `_workmeta`, and `guild_hall/night_watch`, while missing design content stays as owner questions or blockers instead of agent inference.

### Revision `working` - SE assistant widened to design-support artifact scope

- Sharpened the SE assistant wording toward a systems-engineering design-support aide rather than a narrow document helper.
- Clarified that `artifact` in the SE assistant lane includes documents, diagrams, traceability matrices, analysis packets, review evidence, owner-decision records, open-question registers, and verification-planning artifacts.
- Kept `se_stage_artifact_gap_scan_v0` as the first safe workflow name while broadening its private draft outputs to cover design-support queues such as `draftable_artifact_queue`, `diagram_need_register`, and `stage_readiness_summary`.

### Revision `working` - Post-development review gate and Windows acceptance portability

- Added a risk-tiered post-development independent review gate to the agent execution contract, from Level 0 self-check through Level 3 full B/V verification.
- Added a public-safe post-development review packet template for reusable review evidence.
- Added the immediate repository improvement plan for independent review routing, LLM Wiki-style sandbox evaluation, and daily/weekly review boundaries.
- Registered `.workflow/post_development_review_gate_v0` as the generic closing workflow for applying the new review gate to bounded development work.
- Added public-safe templates for all declared post-development review gate outputs, including boundary review, judge decision, B/V handoff, and follow-up register packets.
- Allowed `guild_master_cell` to route post-development review requests through the new gate workflow.
- Added `.registry/skills/post_development_review_gate` plus the installed Codex bridge `soulforge-post-development-review-gate` for consistent task-closing invocation.
- Locked the review gate workflow profile policy to conservative `gpt-5.5 / xhigh / auditor` final acceptance review instead of cost optimization.
- Made root UI lint/done-check scripts set the canonical root through a Node wrapper instead of Unix-only environment assignment.
- Updated the UI theme package smoke test and UI workspace wrapper so `npm pack` / UI scripts run through direct `npm.cmd` on Windows and direct `npm` elsewhere, avoiding shell quoting drift.

## 2026-05-14

### Revision `working` - SE foldertree exploratory and operational basic variants added

- Added two dry-runable bundled specs to `se_foldertree_generate`: `탐색개발 / 공통 / 없음` and `운용연구개발 / 공통 / 없음`.
- Updated `generate_tree.py` to bind each supported input combination to an explicit default spec, allow `--spec` omission for supported variants, and validate that a chosen spec matches the requested input combination.
- Added production-bound variant metadata for the new basic variants and tightened `preview_variants.py` so production-enabled variants must declare explicit supported inputs and spec assets.
- Kept the existing `체계개발 / LIG 넥스원 / A` behavior as the current system-development/LIG overlay path without folding its Q-gates into the new common basic variants.

## 2026-05-15

### Revision `working` - Dev worker branch lane added

- Added `guild_hall/dev_worker` as a bounded task-packet-to-branch automation lane for worker PCs.
- Defined the `dev_worker` policy surface, bootstrap prompt, task packet shape, local automation render, preflight, claim helper, and validation test.
- Updated multi-PC and guild_hall docs so worker PCs may push review branches while `main` merge authority remains with the reviewer/supervisor lane.

### Revision `working` - Dev worker preflight doctor scoped

- Scoped the dev-worker preflight default doctor command to `public-only --remote`, leaving `_workmeta` and `private-state` readiness to the lane-specific companion repo sync checks.
- Added `dev_worker_pc` to the local node identity role allow-list and updated the bootstrap prompt so branch-worker setup does not require gateway, mailbox, or town-crier operator env files.

### Revision `working` - Always-on Codex token budget lowered

- Lowered the tracked `Soulforge Night Watch Pipeline` default from `gpt-5.4`/`xhigh` to `gpt-5.2`/`medium` so future local renders do not default to the more expensive frontier model for advisory checks.
- Updated the always-on healer rollout plan to reflect the 4-hour Codex heartbeat cadence and low-reasoning activity sync fallback.
- Kept short-interval mail fetch, mail healthcheck, and town-crier monitoring in deterministic launchd jobs without LLM usage.

### Revision `working` - Simulation source collection profile calibrated

- Calibrated `.workflow/simulation_source_collect_v0/` against a public-safe synthetic mixed model-source fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.3-codex / low / dwarf / auditor` as the primary profile.
- Archived the calibration under `.workflow/simulation_source_collect_v0/calibrations/20260515T000000Z_staged_public_fixture/`, including fixture, quality gate, candidate summaries, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note while keeping raw project truth, `_workspaces` material, credentials, account-bound downloads, private payloads, and runtime absolute paths out of public workflow canon.

### Revision `working` - Verification plan from page contracts profile calibrated

- Calibrated `.workflow/verification_plan_from_page_contracts_v0/` against a public-safe synthetic verification-planning fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.4 / low / human / auditor` as the primary profile.
- Archived the staged calibration under `.workflow/verification_plan_from_page_contracts_v0/calibrations/cal_20260515T121105_public_fixture/`, including fixture, quality gate, candidate summaries, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note while keeping raw project truth, `_workspaces` material, credentials, private payloads, and runtime absolute paths out of public workflow canon.

### Revision `working` - Simulation deck prepare profile calibrated

- Calibrated `.workflow/simulation_deck_prepare_v0/` against a public-safe synthetic LTspice deck-prepare fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.4-mini / medium / dwarf / auditor` as the primary profile and `gpt-5.4 / medium / dwarf / auditor` as the quality shadow.
- Archived the staged calibration under `.workflow/simulation_deck_prepare_v0/calibrations/20260515T120213KST/`, including fixture, quality gate, candidate summaries, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note while keeping raw project truth, `_workspaces` material, credentials, model payloads, simulator outputs, and runtime absolute paths out of public workflow canon.

### Revision `working` - Review gate evidence pack profile calibrated

- Calibrated `.workflow/review_gate_evidence_pack_v0/` against a public-safe synthetic TRR-like/PDR-like review fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.4 / medium / darkelf / auditor` as the primary profile and `gpt-5.4 / low / darkelf / auditor` as the smoke shadow.
- Archived the staged calibration under `.workflow/review_gate_evidence_pack_v0/calibrations/cal_20260515_public_synthetic_staged_v0/`, including fixture, quality gate, candidate summaries, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note while keeping raw project truth, `_workspaces` material, credentials, private payloads, and runtime absolute paths out of public workflow canon.

### Revision `working` - Interface control and harness readiness profile calibrated

- Calibrated `.workflow/interface_control_and_harness_readiness_v0/` against a public-safe synthetic interface/harness readiness fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.3-codex-spark / high / dwarf / auditor` as the primary profile and `gpt-5.4 / medium / elf / auditor` as the quality shadow.
- Archived the staged calibration under `.workflow/interface_control_and_harness_readiness_v0/calibrations/cal_20260515_public_synthetic_staged_v0/`, including fixture, quality gate, candidate summaries, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note while keeping raw project truth, `_workspaces` material, credentials, and private payloads out of public workflow canon.

### Revision `working` - Simulation run verify profile calibrated

- Calibrated `.workflow/simulation_run_verify_v0/` against a public-safe synthetic blocked-run and synthetic-stub fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.4 / low / human / auditor` as the primary profile.
- Archived the calibration under `.workflow/simulation_run_verify_v0/calibrations/cal_20260515_public_synthetic/`, including fixture, quality gate, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note while keeping raw project truth, `_workspaces` material, credentials, waveforms, private payloads, and runtime absolute paths out of public workflow canon.

### Revision `working` - Page quantitative enrichment profile calibrated

- Calibrated `.workflow/page_quantitative_enrichment_v0/` against a public-safe synthetic quantitative-enrichment fixture.
- Promoted `profile_policy.yaml` from draft to active with `gpt-5.4 / low / elf / auditor` as the primary profile and `gpt-5.4 / medium / dwarf / auditor` as the stability shadow.
- Archived the calibration under `.workflow/page_quantitative_enrichment_v0/calibrations/cal_20260515_synth_qe_001/`, including fixture, quality gate, candidate summaries, CLI proxy telemetry, final ranking, and recommendation.
- Added a public-safe history note for the profile decision while keeping raw project truth, `_workspaces` material, credentials, and private payloads out of public workflow canon.

### Revision `working` - Quality-equivalence follow-up archives integrated

- Added follow-up public-safe `quality_equiv` calibration archives for page quantitative enrichment, interface control, verification planning, review gate, simulation source collection, and simulation run verify where later candidate comparisons were preserved as public-safe synthetic evidence.
- Recalibrated `.workflow/interface_control_and_harness_readiness_v0/` under the later quality-equivalence pass and updated its primary profile from `gpt-5.3-codex-spark / high / dwarf / auditor` to `gpt-5.5 / medium / elf / auditor`, while keeping the previous spark profile as a latency shadow and preserving the local-internal / no-connect / source-supported join ceilings.
- Recalibrated `.workflow/verification_plan_from_page_contracts_v0/` under the later quality-equivalence pass and updated its primary profile from `gpt-5.4 / low / human / auditor` to `gpt-5.5 / medium / human / auditor`, while keeping `gpt-5.5 / xhigh` as the fuller quality shadow and demoting the old low-effort profile to minimum-viable planning output.
- Recalibrated `.workflow/review_gate_evidence_pack_v0/` under the later quality-equivalence pass and updated its primary profile from `gpt-5.4 / medium / darkelf / auditor` to `gpt-5.5 / medium / darkelf / auditor`, while preserving source/checksum propagation, CAN/reset gap handling, blocker/action structure, and owner-decision non-claim boundaries.
- Recalibrated `.workflow/simulation_source_collect_v0/` under the later quality-equivalence pass and updated its primary profile from `gpt-5.3-codex / low / dwarf / auditor` to `gpt-5.5 / medium / dwarf / auditor`, while demoting the old low-cost primary to minimum-viable because it lost model manifest, compatibility, and per-need handoff detail against the `gpt-5.5 / xhigh` anchor.
- Recalibrated `.workflow/simulation_deck_prepare_v0/` under the later quality-equivalence pass and updated its primary profile from `gpt-5.4-mini / medium / dwarf / auditor` to the previous shadow `gpt-5.4 / medium / dwarf / auditor`, after required `gpt-5.5` low/medium/xhigh comparison showed all required profiles were quality-equivalent but the previous shadow had the best CLI proxy value.
- Recalibrated `.workflow/simulation_run_verify_v0/` under the later quality-equivalence pass and updated its primary profile from `gpt-5.4 / low / human / auditor` to `gpt-5.5 / low / human / auditor`, while keeping `gpt-5.5 / xhigh` as the evaluator ceiling and preserving the blocked-vs-failed / execution-vs-acceptance boundaries.
- Recalibrated `.workflow/page_quantitative_enrichment_v0/` after tightening the local `workflow-optimizer` skill's quality-equivalence policy: demoted the cheap `gpt-5.4 / low / elf / auditor` recommendation, selected `gpt-5.4 / medium / dwarf / auditor` as the quality-equivalent primary, and kept `gpt-5.5 / low / elf / auditor` as the quality shadow.

### Revision `working` - Additional safe workflow profiles quality-equivalence calibrated

- Integrated only the lane-relevant, integration-complete, public-safe recalibrations from the later `workflow-optimizer` sweep after screening out pending, out-of-lane, or not-yet-safe archive variants.
- Promoted stronger quality-equivalent `gpt-5.5` primaries for `whole_xml_page_split_v0`, `page_xml_normalize_spec_v0`, and `capture_xml_intake_library_v0`.
- Activated or refreshed safe workflow defaults for `official_source_packet_collect_v0`, `asset_patch_attach_mdd_v0`, `simulator_policy_packet_v0`, `simulation_stimulus_measurement_packet_v0`, `xml_harness_composition_v0`, `source_gap_followup_packet_v0`, `review_action_item_closure_loop_v0`, `configuration_baseline_and_change_control_v0`, `project_readiness_digest_v0`, `accepted_verification_result_packet_v0`, and `owner_decision_packet_v0`.
- Archived each adopted recalibration under `calibrations/cal_20260515_quality_equiv_001/` inside the target workflow and labeled these runs as CLI-only fallbacks where isolated subagent/candidate-runner telemetry was unavailable.

### Revision `working` - Review gate evidence pack workflow added

- Added `.workflow/review_gate_evidence_pack_v0/` as a public-safe review-readiness workflow over trace, interface-control, verification-plan, source-gap, harness, configuration, owner-decision, and open-question refs.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after the verification planning lane.
- Defined explicit outputs for `review_gate_packet`, `source_index`, `evidence_matrix`, `entrance_criteria_checklist`, `success_criteria_checklist`, `review_blockers`, `action_item_register`, `decision_summary`, `review_gate_provenance`, `readiness_summary`, and `boundary_review_note`.
- Mapped the packet shape lightly to SRR/SFR/PDR/CDR/TRR/FCA/SVR/PCA-style review conversations while keeping review families as local readiness lenses, not heavyweight ceremony or automatic gate closure.
- Required decisions to stay separate from proposed decisions and deferred decisions, with actual decisions needing scoped owner decision evidence.
- Kept the package evidence-packaging-only: it does not approve a review gate, certify verification completion, replace owner judgment, make missing sources true, mutate upstream packets, or make private evidence public-safe.
- Kept source XML, normalized sidecars, upstream packets, verification results, test logs, simulation outputs, raw project payloads, vendor text, runtime absolute paths, credentials, cookies, sessions, `_workspaces` outputs, and private run truth out of public workflow canon.
- Executed a first controlled private mixed-tailored review-readiness pilot that consumed trace, interface-control, verification-plan, source-gap, and harness packet refs and produced a `ready_with_named_caveats` review packet with explicit blockers, action items, proposed decisions, and carry-forward routes.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Review action item closure loop workflow added

- Added `.workflow/review_action_item_closure_loop_v0/` as a public-safe downstream governance workflow after review packets.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `review_gate_evidence_pack_v0`.
- Defined explicit closure-loop outputs for `action_closure_packet`, `action_closure_ledger`, `closure_status_matrix`, `unresolved_action_items`, `closure_ready_reruns`, `closure_blockers`, `carry_forward_register`, `owner_decision_request_queue`, `closure_provenance`, and `boundary_review_note`.
- Kept the first version contract-only: it tracks action status, closure evidence refs, rerun-ready routes, and carry-forward state, but it does not approve decisions, auto-close actions, execute reruns, or mutate upstream packets.
- Executed a first controlled private closure-loop pilot over the representative review gate action register, writing closure rows, unresolved-action tracking, carry-forward routes, owner decision requests, and rerun-ready logic without claiming action closure or owner approval.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Verification plan from page contracts workflow added

- Added `.workflow/verification_plan_from_page_contracts_v0/` as a public-safe verification planning workflow over trace rows, quantitative gaps, simulation-source readiness, interface-control ceilings, harness blockers, source gaps, configuration refs, and scoped owner decisions.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after the source-gap follow-up lane.
- Defined explicit planning outputs for `verification_plan`, `verification_requirements_matrix`, `method_map`, `evidence_need_register`, `verification_gap_register`, `test_or_simulation_readiness`, `owner_followup_needed`, `trr_readiness_handoff`, and `fca_svr_handoff_index`.
- Required inspection, analysis, simulation, test, demonstration, owner-review, and not-ready methods to remain distinct, with missing evidence preserved as blockers or review-needed actions.
- Kept the package planning-only: it does not run tests or simulations, accept verification results, approve TRR, accept FCA/SVR evidence, promote harness connections, or claim pass/fail outcomes.
- Kept source XML, normalized sidecars, upstream packets, model payloads, simulation outputs, test logs, raw project payloads, vendor text, runtime absolute paths, credentials, cookies, sessions, `_workspaces` outputs, and private run truth out of public workflow canon.
- Executed a first controlled private representative-item pilot that turned trace/source/quantitative/interface/harness evidence into distinct `inspection`, `analysis`, `simulation`, and `owner_review` planning items with TRR/FCA-SVR handoff seeds.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Simulation source collection workflow added

- Added `.workflow/simulation_source_collect_v0/` as a public-safe pre-deck and pre-run/verify workflow for collecting or indexing official, owner-approved local, and tool-library simulation source assets.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after quantitative enrichment and before harness composition.
- Defined explicit outputs for `simulation_source_packet`, `model_inventory`, `model_file_manifest`, `demo_circuit_manifest`, `simulator_compatibility_matrix`, `missing_models`, `access_blockers`, `owner_followup_needed`, and `downstream_handoff`.
- Required PSpice, LTspice, generic SPICE, IBIS, IBIS-AMI, S-parameter, and demo-circuit source families to preserve provenance, dependency, license/terms, and compatibility basis instead of guessing readiness from names or file extensions.
- Made missing models, blocked access, unclear license/tool dependency, unapproved third-party mirrors, and owner follow-up first-class outputs so downstream deck, run, quantitative, and harness workflows can block safely.
- Kept model payloads, raw project data, vendor text, simulator outputs, runtime absolute paths, credentials, cookies, sessions, `_workspaces` outputs, and private run truth out of public workflow canon.
- Executed a first controlled private mixed model-source pilot that separated an available official LTspice demo-circuit source, a missing page_02 major-IC model set, and a missing connector-facing SI model need into explicit downstream readiness states.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Simulation deck prepare workflow added

- Added `.workflow/simulation_deck_prepare_v0/` as a public-safe pre-run workflow for staging simulation deck inputs from approved model packets, demo circuits, stimuli, measurements, and simulator policy.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `simulation_source_collect_v0`.
- Defined explicit outputs for `simulation_deck_packet`, `deck_input_manifest`, `model_dependency_map`, `unresolved_deck_inputs`, `deck_prepare_blockers`, `owner_followup_needed`, `downstream_handoff`, and `boundary_review_note`.
- Kept the first version conservative: it prepares or blocks deck inputs, but it does not execute simulations, verify results, or invent missing models.
- Executed a first controlled private representative deck-prepare pilot that separated one prepared LTspice demo-circuit input from unresolved policy/measurement prerequisites and missing-model blockers.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Simulation run verify workflow added

- Added `.workflow/simulation_run_verify_v0/` as a public-safe run/verify workflow for executing a bounded simulation or recording why execution is blocked.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `simulation_deck_prepare_v0`.
- Defined explicit outputs for `simulation_run_packet`, `run_manifest`, `measurement_results`, `result_verdicts`, `run_blockers`, `owner_followup_needed`, `downstream_handoff`, and `boundary_review_note`.
- Executed a first controlled private blocked-run pilot that wrote run metadata, blocker rows, and a blocked verdict without inventing measurement or waveform results.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Configuration baseline and change control workflow added

- Added `.workflow/configuration_baseline_and_change_control_v0/` as a public-safe governance workflow for inventorying baseline refs, tracking change requests, and routing baseline-affecting reruns or carry-forward actions without approving baselines or mutating upstream artifacts.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `review_action_item_closure_loop_v0`.
- Defined explicit outputs for `configuration_baseline_packet`, `baseline_inventory`, `change_request_register`, `impact_matrix`, `baseline_gap_register`, `rerun_routing`, `owner_followup_needed`, `closure_handoff`, and `boundary_review_note`.
- Executed a first controlled private representative baseline/change-control pilot that inventoried pre-baseline evidence packets, derived change requests from the review lane, and routed reruns or owner follow-up without claiming baseline approval.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Test harness asset planning workflow added

- Added `.workflow/test_harness_asset_planning_v0/` as a public-safe planning workflow for the physical, simulation, or software harness assets needed to verify page modules and composed harness candidates.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `functional_configuration_audit_page_library_v0`.
- Defined explicit outputs for `test_harness_manifest`, `test_interface_list`, `simulation_fixture_needs`, `instrumentation_resource_list`, `trr_readiness_checklist`, `planning_blockers`, `owner_followup_needed`, and `boundary_review_note`.
- Executed a first controlled private representative planning pilot that turned verification-plan TRR seeds into test-interface, simulation-fixture, instrumentation-resource, and planning-blocker packets.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Source packet sufficiency review workflow added

- Added `.workflow/source_packet_sufficiency_review_v0/` as a public-safe governance workflow for deciding whether current source/material/layout/simulation packets are sufficient for a bounded claim family.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `test_harness_asset_planning_v0`.
- Defined explicit outputs for `source_sufficiency_packet`, `evidence_coverage_table`, `blocked_fields_register`, `owner_followup_needed`, `allowed_claim_ceiling`, `rerun_routes`, and `boundary_review_note`.
- Executed a first controlled private representative sufficiency-review pilot that classified LT8624S power evidence, EXT_IO boundary evidence, page_02 rail semantics, and page_02 simulation evidence into source-supported, review-required, or blocked claim ceilings.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Owner decision packet workflow added

- Added `.workflow/owner_decision_packet_v0/` as a public-safe workflow for recording scoped owner decisions and their downstream effect.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `accepted_verification_result_packet_v0`.
- Defined explicit outputs for `owner_decision_packet`, `decision_effect_register`, `downstream_effect_map`, and `boundary_review_note`.
- Executed a first controlled private representative pilot that recorded architecture-policy owner decisions for immutable source XML, sidecar-first module contracts, and harness-as-derived-layer boundaries.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Accepted verification result packet workflow added

- Added `.workflow/accepted_verification_result_packet_v0/` as a public-safe workflow for recording accepted verification results, blocked/inconclusive result rows, and acceptance provenance.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` before `owner_decision_packet_v0`.
- Defined explicit outputs for `accepted_verification_result_packet`, `result_summary`, `accepted_result_rows`, `blocked_or_inconclusive_rows`, `acceptance_provenance`, and `boundary_review_note`.
- Executed a first controlled private representative blocked-result pilot using the device-name-fix integrity report as candidate evidence, while keeping `accepted_result_rows` empty pending scoped owner acceptance and tool-flow confirmation.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Simulator policy packet workflow added

- Added `.workflow/simulator_policy_packet_v0/` as a public-safe workflow for recording trusted local simulator runtime identity or probe evidence, owner execution authorization posture, and runtime blockers.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `simulation_run_verify_v0`.
- Defined explicit outputs for `simulator_policy_packet`, `runtime_probe_summary`, `execution_authorization_state`, `runtime_blockers`, and `boundary_review_note`.
- Executed a first controlled private representative blocked-runtime pilot using the local simulation-runtime probe and LT3045 demo candidate context, while keeping execution authorization blocked pending trusted runtime and owner approval.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.
- Later private runtime-refresh evidence confirmed that local `psp_cmd.exe` is callable, so the main remaining blocker is now scoped execution approval and runnable input completeness rather than total runtime absence.

### Revision `working` - Simulation stimulus measurement packet workflow added

- Added `.workflow/simulation_stimulus_measurement_packet_v0/` as a public-safe workflow for recording bounded stimuli or operating conditions, measurement definitions, execution-scope notes, and missing-input blockers.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `simulator_policy_packet_v0`.
- Defined explicit outputs for `stimuli_or_operating_conditions_packet`, `measurement_definition_packet`, `execution_scope_note`, `input_packet_blockers`, and `boundary_review_note`.
- Executed a first controlled private representative seed-input pilot using the LT3045 demo template example, while keeping owner approval and execution readiness out of scope.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Simulation run verify positive example added

- Added a second private representative `simulation_run_verify_v0` example using a local vendor `OPA197` PSpice example staged into a bounded run-local workspace.
- Confirmed callable `psp_cmd.exe` execution and captured a positive executed-run packet with observed output data.
- Kept the result verdict `inconclusive` because no approved pass/fail rule was bound, preserving the boundary between execution success and accepted verification.

### Revision `working` - Technical risk open question burndown workflow added

- Added `.workflow/technical_risk_open_question_burndown_v0/` as a public-safe governance workflow for packaging current technical risks and open questions into a bounded burndown register.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `physical_configuration_audit_asset_package_v0`.
- Defined explicit outputs for `technical_risk_register`, `open_question_register`, `burndown_summary`, `closure_criteria_register`, `owner_followup_needed`, `rerun_routes`, and `boundary_review_note`.
- Executed a first controlled private representative risk/open-question pilot that grouped source, interface, quantitative, and simulation uncertainty into one burndown packet with closure criteria and rerun routes.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Functional configuration audit page library workflow added

- Added `.workflow/functional_configuration_audit_page_library_v0/` as a public-safe governance consumer for later FCA/SVR-style functional claim auditing.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `configuration_baseline_and_change_control_v0`.
- Defined explicit outputs for `functional_audit_packet`, `verified_claim_register`, `unverified_claim_register`, `discrepancy_register`, `residual_risk_register`, `audit_readiness`, `closure_handoff`, and `boundary_review_note`.
- Executed a first controlled private representative audit pilot that packaged unverified, discrepancy, and residual-risk rows without claiming accepted verification evidence or owner acceptance.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Physical configuration audit asset package workflow added

- Added `.workflow/physical_configuration_audit_asset_package_v0/` as a public-safe governance consumer for later PCA-style package alignment auditing.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `source_packet_sufficiency_review_v0`.
- Defined explicit outputs for `physical_audit_packet`, `artifact_inventory_report`, `checksum_report`, `missing_or_mismatched_artifacts`, `release_blocking_discrepancies`, `owner_followup_needed`, `closure_handoff`, and `boundary_review_note`.
- Executed a first controlled private representative physical audit pilot that verified LT8624S package artifacts and checksum rows while keeping missing formal baseline approval as a release-blocking discrepancy.
- Updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Interface control and harness readiness workflow added

- Added `.workflow/interface_control_and_harness_readiness_v0/` as a public-safe governance bridge before or alongside harness composition.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `page_module_trace_matrix_v0` and before source-gap follow-up aggregation.
- Defined explicit outputs for `interface_control_ledger`, `harness_readiness_matrix`, `blocked_interface_items`, `review_required_interface_items`, `candidate_safe_possible_items`, `source_supported_possible_items`, `owner_followup_needed`, and `interface_open_questions`.
- Required `local_internal_candidates` to remain non-external by default and to block harness endpoint use unless scoped reclassification evidence exists.
- Kept readiness statuses as ceilings for downstream `xml_harness_composition_v0`; the package does not mutate upstream packets, replace harness composition, or overclaim source support.
- Kept source XML, normalized sidecars, intake packets, source packets, materials outputs, layout guides, quantitative overlays, trace matrices, harness packets, raw project payloads, vendor text, runtime absolute paths, credentials, cookies, sessions, `_workspaces` outputs, and private run truth out of public workflow canon.
- Executed a first controlled private pilot over the representative power/interface/ambiguous page trio plus an existing blocked/review-required harness packet, writing full readiness-ceiling, blocker, follow-up, and harness-input-delta outputs.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Page module trace matrix workflow added

- Added `.workflow/page_module_trace_matrix_v0/` as a public-safe governance workflow for row-level traceability across page, source, materials, layout, quantitative, and harness packets.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `xml_harness_composition_v0` and before source-gap follow-up aggregation.
- Defined explicit outputs for `trace_matrix`, `evidence_authority_map`, `trace_gap_register`, `harness_trace_delta`, `verification_seed_matrix`, `review_gate_evidence_index`, `trace_provenance`, and `boundary_review_note`.
- Required row-level `source_confirmed`, `derived`, `review_required`, and `missing` evidence states to remain distinct from harness claim status and review decisions.
- Kept source XML, normalized sidecars, intake packets, source packets, materials outputs, layout guides, quantitative overlays, harness contracts, raw project payloads, vendor text, runtime absolute paths, credentials, cookies, sessions, `_workspaces` outputs, and private run truth out of public workflow canon.
- Extended the contract so trace runs may also consume `interface_control_and_harness_readiness_v0` packet refs and write `interface_readiness_ceiling` rows.
- Executed a first controlled private representative-row pilot that linked page identity, source coverage, quantitative fills/gaps, interface readiness ceilings, blocked/review-required harness claims, open questions, and verification seeds into one trace spine.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Source gap follow-up packet workflow added

- Added `.workflow/source_gap_followup_packet_v0/` as a public-safe follow-up workflow for aggregating source/evidence gaps from source, materials, layout, quantitative, and harness lanes.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after `xml_harness_composition_v0`.
- Defined explicit outputs for `source_gap_followup_packet`, `gap_dedup_index`, `owner_action_queue`, `owner_source_batch_manifest.template`, `download_or_reuse_batch_manifest`, `retry_trigger_register`, and `downstream_unblock_map`.
- Required owner-provided files and manual downloads to be re-indexed by the narrowest owning source/evidence workflow before any source-supported, quantitative, layout, material, or harness claim can change.
- Kept raw project payloads, source files, vendor text, runtime absolute paths, credentials, cookies, sessions, `_workspaces` outputs, and private run truth out of public workflow canon.
- Executed a first controlled private mixed-gap pilot that aggregated 19 upstream gap refs into 14 stable aggregate gaps, deduplicated repeated Analog public-source failures, wrote concrete owner-action batches, and produced narrow retry triggers without changing source authority.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Official source packet collection workflow added

- Added `.workflow/official_source_packet_collect_v0/` as a public-safe source-bootstrap workflow for official, owner-approved local, missing, blocked, and not-applicable source states.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` as an upstream/sidecar source packet lane for materials, layout, simulation, ECAD, and harness workflows.
- Defined provenance-first outputs for `source_packet_manifest`, `source_inventory`, `source_gap_report`, `owner_followup_needed`, `download_or_reuse_manifest`, and `downstream_ready_refs`.
- Kept raw project payloads, vendor document text, downloaded binaries, model payloads, runtime absolute paths, credentials, cookies, sessions, and private run truth out of public workflow canon.
- Executed a first controlled private mixed-state pilot that combined owner-approved local official LT8624S collateral, reachable official public URLs for AD8338/AD7380-4/ADG1634 source families, rejected third-party Mouser mirrors, and missing simulation/ECAD source kinds into one downstream-ready packet.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Page quantitative enrichment workflow added

- Added `.workflow/page_quantitative_enrichment_v0/` as a public-safe overlay workflow for source-backed quantitative enrichment of `page_module_spec_v0` sidecars.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after optional source/material/layout evidence workflows and before harness composition.
- Defined explicit outputs for `quantitative_claims`, `enriched_sidecar_overlay`, `source_gap_report`, `owner_followup_needed`, `harness_readiness_delta`, and enrichment provenance.
- Required every quantitative value to be `source_confirmed`, transparently `derived`, `review_required`, or `missing`; forbidden label/default/memory/harness-pressure guessing.
- Kept the original sidecar, source XML, intake packets, source packets, materials packets, layout guides, raw project payloads, vendor text, runtime absolute paths, credentials, cookies, sessions, and private run truth out of public workflow canon.
- Completed controlled private helper-card pilots across power (`lt8624s`), interface (`ext_io_conn`), and ambiguous/channelized (`02_4ch_vga_ch5_8`) pages, including an ambiguous-page run that consumed an upstream official-source packet and wrote device-scope fills plus page-scope gaps.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - SE foldertree pre-study basic variant added

- Added a dry-runable `선행연구 / 공통 / 없음` bundled basic spec to `se_foldertree_generate`.
- Updated the supported input matrix and references so pre-study can be selected as its own explicit variant instead of overloading `탐색개발`.
- Kept the new pre-study spec contractor-neutral and public-safe, with task surfaces focused on background definition, prior-art review, concept options, transition judgment, and next-stage recommendation.

### Revision `working` - SE foldertree draft variant preview lane added

- Added a non-materializing draft variant preview lane to `se_foldertree_generate`, separating `common_se_base_v0`, `lig_grade_a_overlay_v0`, and `operational_rd_no_grade_candidate_v0`.
- Added `preview_variants.py` so draft variant metadata can be checked without changing the production `generate_tree.py` path or creating project folders.
- Documented that current production support remains `체계개발 / LIG 넥스원 / A` and that operational-R&D/no-quality-grade remains blocked until source or owner policy evidence exists.

### Revision `working` - workmeta always-on merge guard clarified

- Clarified that the 24-hour PC only auto-syncs `_workmeta/main` by fast-forward and must not auto-merge stale work branches or PC-specific branches into `main`.
- Documented that bounded metadata from another PC should be promoted by cherry-pick, rebase, or manual port after `main` is current.
- Added conflict handling guidance for shared `_workmeta` policy/log surfaces so `README.md`, `CHANGELOG.md`, worklogs, and promotion registers preserve latest `main` policy and append new records.
## 2026-05-15

### Revision `working` - Page XML normalization profile refreshed

- Re-ran `.workflow/page_xml_normalize_spec_v0/` profile calibration after the workflow contract added stronger `system_contract`, interface-group, annotation-variant, and harness-readiness expectations.
- Kept the primary profile as `gpt-5.4` `medium` with `elf` + `auditor` after repeat Top-K subagent quality runs and CLI proxy telemetry for pass candidates.
- Archived the public-safe repeat calibration under `.workflow/page_xml_normalize_spec_v0/calibrations/20260515-021140_repeat_topk_contract_refresh/`.
- Rejected `gpt-5.4-mini` shadows under the refreshed gate because they altered source identity, left `system_contract` too empty, or collapsed required per-page sidecar blocks.
- Kept raw XML bodies, generated page XML payloads, runtime paths, `_workspaces`, `_workmeta` raw truth, credentials, cookies, and private-state material out of the public workflow archive.

### Revision `working` - XML harness composition workflow added

- Added `.workflow/xml_harness_composition_v0/` as a public-safe derived harness-layer workflow for composing prepared page-level XML assets into a project-local harness packet.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` after the page split, normalize, intake, materials, and layout-guide preparation chain.
- Defined explicit `blocked`, `review_required`, `candidate_safe`, and `source_supported` lanes, including missing-source, source-gap, missing-quantitative, local/internal misuse, no-connect, and ambiguity handling.
- Kept source XML, normalized sidecars, intake packets, materials packets, layout guides, raw project payloads, vendor text, runtime paths, credentials, cookies, `_workspaces`, and private run truth out of public workflow canon.
- Marked the package `pilot_ready_contract_only`; a controlled project-local harness pilot and independent review are still required before claiming pilot-executed or usable behavior.
- After the private harness pilot landed, updated the profile-policy gate from `pending_pilot_and_calibration` to `pending_profile_calibration` so the public execution-profile note matches the actual pilot state.

## 2026-05-14

### Revision `working` - EXP XML materials quality profile promoted

- Promoted `.workflow/exp_xml_component_materials/profile_policy.yaml` from `gpt-5.4-mini` `medium` to `gpt-5.5` `medium` with `orc` + `archivist` after a quality-first scoped contract probe.
- Archived the public-safe page-fragment/local-reuse probe under `.workflow/exp_xml_component_materials/calibrations/20260514-2155_quality_priority_contract_probe/`.
- Selected the cleaner `gpt-5.5` profile because it preserved page-level scope, context-only handoff boundaries, owner-approved local official collateral evidence, and explicit `DATA Sheet`/`EVAL` destination placement.
- Kept real EXP.xml bodies, downloaded vendor binaries, runtime paths, `_workspaces`, `_workmeta` raw truth, credentials, cookies, and private-state material out of the public archive.

### Revision `working` - Page XML normalization profile calibrated

- Calibrated `.workflow/page_xml_normalize_spec_v0/` with public-safe structural metadata derived from the already public-safe `whole_xml_page_split_v0` calibration archive, covering 11 ordered page sidecars, source checksums, immutable source XML policy, blank normalized refs, review-required semantics, local/internal candidate separation, and downstream `capture_xml_intake_library_v0` handoff.
- Set the workflow primary profile to `gpt-5.4` `medium` with `elf` + `auditor`, retaining faster `gpt-5.4-mini` shadows after their Stage C reruns stayed `pass_with_gaps` or failed coverage.
- Archived staged CLI candidate outputs, telemetry, frozen criteria, manual gate review, final ranking, and recommendation under `.workflow/page_xml_normalize_spec_v0/calibrations/20260514-205331_staged_cli_public_structural/`.
- Kept raw XML bodies, generated page XML payloads, runtime paths, `_workspaces`, `_workmeta` raw truth, credentials, cookies, and private-state material out of the public workflow archive.

### Revision `working` - Capture/materials page-fragment contracts clarified

- Clarified `.workflow/capture_xml_intake_library_v0/` so whole-export inputs and page-fragment XML inputs have distinct expectations: page fragments produce page-level intake only, with normalize sidecars/handoffs accepted only as non-authoritative review context.
- Clarified `.workflow/exp_xml_component_materials/` so page-fragment `exp_xml_source` inputs can produce bounded page-level source packets without implying full-design material coverage.
- Allowed owner-approved local official collateral reuse in `exp_xml_component_materials` when provenance and checksum/file evidence are preserved, while keeping `exp_xml_source` authoritative and downstream handoff context-only.

### Revision `working` - Layout guide source-gap fallback clarified

- Clarified `.workflow/component_pcb_layout_guide_extraction/` so missing official layout guidance no longer means the workflow must silently stall or fabricate guidance.
- Added a bounded degraded path where the workflow writes a `Layout Guide/` source-gap packet that records attempted sources, blocker reasons, unresolved gaps, and owner follow-up needs when official layout guidance cannot be acquired.
- Kept source-bound output requirements intact: no unsupported layout claims, no public-canon vendor text, and no runtime project payload leakage.

### Revision `working` - Page normalize system-contract slots expanded

- Expanded `.workflow/page_xml_normalize_spec_v0/` so `page_module_spec_v0` now includes a required `system_contract` block for harness-facing electrical, signal, quantitative, and readiness/source-gap slots.
- Added support for interface groups, electrical domains, signal families, quantitative placeholder slots, and explicit `harness_ready` / `source_gap` / `owner_followup` contract fields while keeping all of them conservative and review-oriented.
- Kept normalization source-safe: the workflow still does not infer confirmed topology, perform harness composition, or promote unsupported quantitative values to truth.

### Revision `working` - Harness composition first private pilot executed

- Executed the first private pilot of `.workflow/xml_harness_composition_v0/` against representative power, interface, and ambiguous/channelized prepared page assets.
- The resulting derived harness packet produced explicit `blocked` and `review_required` joins, with no `candidate_safe` or `source_supported` promotions, confirming the intended conservative behavior.
- Updated the workflow package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Page module sidecar refinement hints

- Refined `.workflow/page_xml_normalize_spec_v0/` with optional `module_scope`, `channelization`, `classification_basis`, and `interfaces.local_internal_candidates` fields for conservative page-module sidecars.
- Kept required external interface containers unchanged and preserved the sidecar-first, immutable-source-page contract.
- Aligned the private `page_module_spec_v0` first-draft note and example YAML with the new review-hint fields.

### Revision `working` - Page XML normalization sidecar alignment

- Realigned `.workflow/page_xml_normalize_spec_v0/` with the fixed `page_module_spec_v0` first draft so per-page `page_module_spec_v0.yaml` sidecars and manifests are the primary outputs.
- Recentered the workflow on immutable source page XML, metadata-first identity/provenance/interface/review fields, and optional derived annotated XML variants that remain review-only.
- Kept the existing `.workflow/index.yaml` registration in place and updated the workflow catalog wording to describe the sidecar-first package.
- Followed the alignment with a private 11-page split-fixture pilot matrix, lifting the workflow package from `pilot_ready_contract_only` to `pilot_executed_private_fixture` while keeping ambiguous semantics as review-required.

### Revision `working` - Page XML normalization workflow added

- Added `.workflow/page_xml_normalize_spec_v0/` as a public-safe bridge workflow for turning page XML assets from `whole_xml_page_split_v0` into project-local normalized page assets, registration-prep units, manifests, provenance updates, warnings, and downstream handoff packets.
- Registered the workflow in `.workflow/index.yaml` between `whole_xml_page_split_v0` and XML-first asset registration, and listed it in `.workflow/README.md`.
- Kept raw page XML bodies, generated normalized page payloads, runtime absolute paths, `_workspaces` output data, `_workmeta` raw truth, credentials, cookies, secret material, material collection, MDD attachment, and harness composition out of the public workflow package.
- Marked the workflow as `pilot_ready_contract_only`; a controlled normalization pilot is still required before claiming pilot-executed behavior.

### Revision `working` - Whole XML page split workflow added

- Added `.workflow/whole_xml_page_split_v0/` as a public-safe first-step workflow for splitting one project-bound large multi-page XML source into project-local page XML assets, manifest, index, provenance, and readiness notes.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` as upstream of planned `page_xml_normalize_spec_v0`.
- Kept source XML read-only and kept normalization, XML-first asset registration, material collection, MDD attachment, raw XML bodies, runtime paths, project-local output payloads, credentials, cookies, and private run truth out of the public workflow package.
- Completed a controlled private real-sample pilot that split one large multi-page XML source into 11 page XML assets and downstream manifest/index/provenance/readiness outputs consumed by the page-normalization lane.
- Updated the package maturity from `pilot_ready_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Whole XML page split profile calibrated

- Calibrated `.workflow/whole_xml_page_split_v0/` with public-safe structural metadata derived from the supplied real sample XML, covering 11 `Page` boundaries, titleblock `Page Count = 8` conflict handling, missing/non-contiguous page-number signals, source-order page ids, manifest/index/provenance shape, and downstream `page_xml_normalize_spec_v0` handoff.
- Set the workflow primary profile to `gpt-5.4` `high` with `dwarf` + `archivist`, retaining `gpt-5.5` shadows and a downgraded `gpt-5.4-mini` fallback note after Stage C instability.
- Archived staged CLI candidate outputs, telemetry, frozen criteria, rule evaluation, shortlist review, final ranking, and recommendation under `.workflow/whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/`.
- Kept real XML bodies, generated page XML payloads, runtime paths, `_workspaces`, `_workmeta` raw truth, credentials, cookies, and private-state material out of the public workflow archive.

### Revision `working` - XML-first asset registration and later MDD patch workflows

- Extended `.workflow/capture_xml_intake_library_v0/` so XML-first intake now creates `asset_identity` and `pcb_pairing_placeholder` metadata, and can record an optional owner-supplied initial MDD attachment without overclaiming XML↔MDD pairing proof.
- Added `.workflow/asset_patch_attach_mdd_v0/` as a follow-on workflow for later owner-supplied MDD attachment and asset-version bump after the initial XML-first registration already exists.
- Kept raw XML, raw MDD payloads, runtime absolute paths, `_workspaces` output data, credentials, cookies, and private run truth out of public workflow canon.
- Executed a first controlled private LT8624S attachment pilot using a real owner-supplied `.mdd` file and updated the package maturity from `draft_contract_only` to `pilot_executed_private_fixture`.

### Revision `working` - Capture XML intake profile calibrated

- Calibrated `.workflow/capture_xml_intake_library_v0/` with a public-safe synthetic Capture XML fixture covering PartInst-vs-Package separation, explicit net extraction, connector confidence, power/no-connect review, provenance, and downstream handoff.
- Set the workflow primary profile to `gpt-5.4` `medium` with `elf` + `administrator`, retaining `gpt-5.5` shadows and lower-cost fallback notes.
- Archived staged CLI candidate outputs, telemetry, frozen criteria, rule evaluation, finalist review, final ranking, and recommendation under `.workflow/capture_xml_intake_library_v0/calibrations/20260514-135122_staged_cli_matrix/`.
- Kept real EXP.xml bodies, runtime paths, `_workspaces`, `_workmeta` raw truth, credentials, cookies, and private-state material out of the public workflow archive.

### Revision `working` - EXP XML materials handoff profile recalibrated

- Re-ran `.workflow/exp_xml_component_materials/` profile optimization against a public-safe synthetic fixture that includes optional `capture_xml_intake_library_v0` `downstream_handoff` context.
- Archived the repeat Top-K calibration under `.workflow/exp_xml_component_materials/calibrations/20260514-1401_repeat_intake_handoff_topk/`.
- Updated `.workflow/exp_xml_component_materials/profile_policy.yaml` from `gpt-5.4-mini` `low` to `gpt-5.4-mini` `medium` while keeping `orc` + `archivist`, because the previous low-effort primary did not pass the richer handoff-context quality gate.

### Revision `working` - Capture XML intake library workflow added

- Added `.workflow/capture_xml_intake_library_v0/` as an upstream read-only intake workflow for turning a project-bound Capture `EXP.xml` into block, net, connector, power, open-question, provenance, and downstream handoff artifacts.
- Registered the workflow in `.workflow/index.yaml` and listed it in `.workflow/README.md` before `exp_xml_component_materials`.
- Recorded the first package as pilot-executed from a bounded private system-lab fixture while keeping raw XML, fixture values, runtime paths, `_workspaces`, `_workmeta` raw truth, credentials, and cookies out of public canon.

### Revision `working` - EXP XML materials intake handoff context linked

- Updated `.workflow/exp_xml_component_materials/` so it can optionally read `capture_xml_intake_library_v0` `downstream_handoff` context without making the handoff mandatory.
- Kept `exp_xml_source` authoritative for component identity, placed inventory, manufacturer part number, and connectivity while allowing intake context to prioritize connector/interface refs, power-sensitive refs, and open topology review items.
- Documented candidate-only intake observations as review context, not confirmed material-collection truth.

## 2026-05-13

### Revision `working` - workmeta shared metadata plane clarified

- Clarified current-default `_workmeta` policy as the owner-only shared metadata plane across PCs, including project metadata, run truth, logs, analytics, and artifact metadata when they are part of cross-PC handoff.
- Clarified that non-metadata state such as actual `_workspaces` files, machine-local temp/cache, secrets, raw mail bodies, and attachment binaries stay outside `_workmeta` shared history.
- Added a deterministic `guild-hall:workmeta:sync` command and updated always-on/update/handoff docs so a 24-hour PC can periodically pull/push `_workmeta` metadata alongside activity continuity handling.

### Revision `working` - always-on short fixes added

- Removed tracked Python bytecode artifacts from gateway mail-fetch and town-crier so runtime commands stop dirtying the public worktree.
- Added healer failure queueing via `--notify-on-failure`, keeping the Telegram brief body-safe with only failed check ids, summary, and report ref.
- Added a public-safe launchd deployment surface with render/install/verify helpers for mail-fetch, healthcheck, town-crier, and healer light/full jobs.

### Revision `working` - always-on sync retry policy clarified

- Added a bounded retry policy for always-on public pull and activity sync failures that look like transient GitHub, DNS, or network issues.
- Limited retries to three total attempts with 60-second and 180-second waits, while keeping dirty worktree, non-main branch, and merge-required states as immediate blockers.
- Kept raw mail, attachment, mailbox payload, `_workmeta`, `_workspaces`, and secret reads out of retry handling.

### Revision `working` - always-on heartbeat pull preflight clarified

- Clarified that the hourly Codex `Soulforge 운영 감시` heartbeat should fast-forward pull clean public `main` before health checks and activity sync.
- Kept the 09:00/18:00 `always-on activity sync` automation as a dedicated fallback path for activity mirror sync.
- Documented that GitHub/DNS/network failures should be reported as stale/blocker conditions without reading raw mail, attachments, mailbox payloads, or secrets.

### Revision `working` - workflow_optimizer default execution gate clarified

- Clarified that a full `workflow_optimizer` run request covers the skill's default isolated quality matrix and CLI telemetry probes without requiring separate user wording for subagents or CLI.
- Preserved the guard that CLI-only full-matrix calibration is an explicit fallback and must not be mislabeled as `subagent_quality_first`.
- Kept the default candidate set excluding the `gpt-5.3-*` family unless the user explicitly asks for 5.3 comparison.

### Revision `working` - workflow lab owner and maturity ladder clarified

- Clarified `_workmeta/system/` as the reserved private reusable-workflow lab owner for project-agnostic run evidence and procedure-capture notes.
- Clarified reserved `_workspaces/system/` usage for local-only workflow pilot outputs and fixture materialization that are not owned by a delivery project.
- Added a human-facing workflow maturity ladder of `draft -> pilot -> usable -> canon` and documented that canon registration in `.workflow/index.yaml` is separate from runtime validation/readiness notes.
- Corrected the project map so the top-level root list no longer advertises a `scripts/` directory that is not part of the current repo tree.

### Revision `working` - component PCB layout guide profile calibration

- Calibrated `.workflow/component_pcb_layout_guide_extraction/` with a public-safe synthetic component-material fixture covering source-bound layout spans, supplemental source handling, cited-page figures, table promotion/rejection, and unresolved component review.
- Set the workflow primary profile to `gpt-5.4-mini | medium | elf | archivist`, with `gpt-5.4 | low | elf | archivist` and `gpt-5.4 | medium | elf | archivist` retained as quality-passing shadows.
- Archived staged CLI candidate outputs, telemetry, frozen criteria, rule evaluation, semantic shortlist evaluation, final ranking, and recommendation under `.workflow/component_pcb_layout_guide_extraction/calibrations/20260513-204517_staged_cli_matrix/`.
- Kept real PDFs, copied vendor text, runtime Layout Guide outputs, project-local paths, credentials, cookies, `_workspaces`, `_workmeta`, and private-state material out of the public workflow archive.

### Revision `working` - device system diagram profile calibration

- Calibrated `.workflow/device_system_diagram_generation/` with a public-safe synthetic wearable gateway fixture.
- Set the workflow primary profile to `gpt-5.4-mini | low | human | administrator`, with `gpt-5.4 | low | human | administrator` retained as the quality-upgrade shadow.
- Archived staged CLI candidate outputs, telemetry, quality-gate criteria, finalist ranking, and recommendation under `.workflow/device_system_diagram_generation/calibrations/20260513-202816_staged_cli_matrix/`.
- Kept project raw input, REF packets, accepted outputs, verifier reports, credentials, `_workspaces`, `_workmeta`, and private-state material out of the public workflow archive.

### Revision `working` - exp XML materials profile calibration

- Calibrated `.workflow/exp_xml_component_materials/` with a public-safe synthetic EXP.xml fixture and mocked official-source/download evidence.
- Set the workflow primary profile to `gpt-5.4-mini | low | orc | archivist`, with `gpt-5.5` and `gpt-5.4-mini|medium` profiles preserved as shadows.
- Archived CLI JSONL telemetry, candidate outputs, quality-gate criteria, final ranking, and recommendation under `.workflow/exp_xml_component_materials/calibrations/20260513-183307_staged_matrix/`.
- Kept real EXP.xml contents, downloaded vendor binaries, credentials, cookies, `_workspaces`, `_workmeta`, and private-state material out of the public workflow archive.

### Revision `working` - workflow_optimizer Codex bridge refactor

- Refactored `.registry/skills/workflow_optimizer/codex/SKILL.md` into a lean operating router and moved detailed run flow, candidate matrix, telemetry/evaluation, and archive/policy contracts into `codex/references/`.
- Clarified that isolated subagent matrix execution requires available tools plus user/developer policy authorization, and that CLI-only calibration must be explicit rather than silent fallback.
- Tightened workflow policy write boundaries so public `.workflow/**` updates happen only when the user requested or confirmed calibration archive/profile policy writes.

### Revision `working` - sample workflow canon cleanup

- Removed the old `frontline_assault` and `build_lineage_map` sample workflows from active workflow canon to avoid presenting test scaffolds as current operating workflows.
- Removed the matching `vanguard_strike` and `lineage_strike` sample party templates and retired their demo unit surfaces from `.unit/`.
- Updated species recommendation biases and UI fixtures to use the current guild-master authoring lane instead of the retired sample workflow/party.
- Fixed guild-master party slot references to the actual `guild_master` unit id.
- Fixed Windows validation execution for the UI done-check and theme package smoke paths.

### Revision `working` - PCB layout guide extraction workflow added

- Added `.workflow/component_pcb_layout_guide_extraction/` as a follow-on workflow for turning per-component `DATA Sheet` and `EVAL` materials into project-local `Layout Guide` Markdown, source maps, extraction manifests, and checksum-keyed caches.
- Registered the workflow in `.workflow/index.yaml` while keeping runtime part folders, extracted vendor text, figures, tables, and supplemental downloads outside public canon.
- Added token-control gates so PDF files are indexed and filtered into layout candidate spans before AI synthesis reads them.
- Added official supplemental-source download gates for missing layout guidance, with PDF/ZIP magic validation, source URL, byte size, and SHA256 requirements.
- Evolved the figure/table stage to use separate extraction tools by signal type: PyMuPDF for layout-candidate page/context PNG renders, Camelot strict quality-filtered Markdown tables, and pdfplumber only as a raw fallback candidate extractor.
- Clarified figure/table source-map and manifest records, including strict-vs-raw table counts, tool versions, output checksums, extraction warnings, and separate raw candidate folders.
- Added a layout-only promotion stage so PCB-layout-relevant visuals and tables are copied into dedicated `layout_only/` folders while software/setup/noisy candidates remain as context evidence with rejection reasons.
- Reworked figure capture policy so layout-only images must come from `layout_guide.md` cited evidence rather than earlier keyword-only candidate pages.
- Updated cited figure capture so `layout_only/` stores one full-page PNG per unique `layout_guide.md` cited source page, with repeated citations deduplicated and older cited-region crops retained only as runtime context evidence.
- Corrected cited figure output placement so current full-page PNGs live directly under `Layout Guide/figures/`; `figures/layout_only/` is no longer the figure output folder.
- Registered `component_pcb_layout_guide_extraction` as an owner-accepted usable workflow canon entry, with runtime vendor content and generated figures remaining project-local.

### Revision `working` - EXP XML component materials workflow added

- Added `.workflow/exp_xml_component_materials/` as a pilot-ready workflow for parsing a project-provided `EXP.xml` and collecting official datasheets plus EVAL/reference-design files into per-component `DATA Sheet` and `EVAL` folders.
- Registered the workflow in `.workflow/index.yaml` while keeping real EXP.xml contents, downloaded PDFs, PCB archives, credentials, and project-local run truth outside public canon.
- Added a project binding template for output folder shape, official-source download policy, checksum/source manifests, and review queues for ambiguous part identities or gated vendor material.
- Piloted the workflow against a concrete Cadence Capture EXP.xml, confirmed `PartInst` as the placed-component extraction node, and saved official Analog Devices PDF/ZIP materials into the project-local material tree.
- Tightened the workflow completion gate so source links and `.url` shortcuts are not accepted as downloads; actual files with byte size, content type or magic check, and SHA256 are required.
- Evolved the workflow with a larger Cadence Capture fixture, adding DOM-failure parser fallback, Package/SymbolUserProp identity recovery for placeholder part values, generic-passive review queue handling, and strict PDF/ZIP payload validation.

## 2026-05-11

### Revision `working` - device system diagram workflow canon entry added

- Added `.workflow/device_system_diagram_generation/` as an owner-accepted usable workflow for generating editable draw.io device system diagrams from one Markdown input and deriving SVG, PPTX, and PNG outputs.
- Registered the workflow in `.workflow/index.yaml` while keeping project-local paths, REF packets, raw candidates, and run evidence outside the public workflow canon.
- Marked the workflow as usable for project execution and timing checks, not strict REF canon-ready; future REF matching requires a non-oracle schema/source packet or owner-approved acceptance contract update.

Soulforge public repo 의 구조/기능/운영 문서 변경을 버전 대신 revision 단위로 기록한다.
Git log 는 원문 이력을 남기고, 이 문서는 사람이 읽는 patch note 와 운영 영향만 요약한다.

## 기록 원칙

- public repo changelog 는 기능 코드, 구조 문서, bootstrap/doctor/update/handoff 규칙 변경을 기록한다.
- 보호 대상 업무 데이터와 continuity record 는 여기 적지 않고 nested `private-state/CHANGELOG.md` 에 적는다.
- secret 값, credential, token, password 는 절대 기록하지 않는다.

## 2026-05-09

### Revision `working` - workflow_generator portable path policy

- `workflow_generator` Codex bridge now requires reusable workflow/canon outputs to use Soulforge-root-relative POSIX paths instead of host-specific absolute paths.
- Runtime-only absolute paths are explicitly limited to local/private run evidence or subagent prompts with `*_runtime_path` fields paired to portable `*_repo_path` identities.
- Updated workflow generator manifest and evaluation templates to prevent installed skill paths, drive-letter paths, and local run paths from being promoted into `.workflow/**` packages.

### Revision `working` - workflow_generator Codex bridge refactor

- Refactored `.registry/skills/workflow_generator/codex/SKILL.md` into a lean operating router and moved detailed goal/run-state/reporting governance into `codex/references/run-governance.md`.
- Added table-of-contents navigation to long workflow generator references so Codex can load specific details progressively.
- Updated the installed skill UI display name to a human-facing title while preserving the `soulforge-workflow-generator` skill id.

### Revision `working` - mail candidate activity projection 추가

- `guild-hall:activity:project-mail-candidates` 를 추가해 local-only `mail_candidate` queue 의 body-safe 후보 요약을 activity event 로 투영할 수 있게 했다.
- `guild-hall:activity:sync` 가 기본적으로 pending mail candidate 를 `mail_candidate_summary` event 로 투영한 뒤 private-state activity mirror 를 병합/commit/push 하도록 연결했다.
- private-state 로 넘어가는 것은 candidate id, subject, sender, attachment count, received_at, local ref 수준의 summary 이며 raw mail body/html/attachment filename/URL/local path/provider payload/secret 값은 제외한다고 문서화했다.

### Revision `working` - workflow_generator 누적 artifact chain 규칙 보강

- `workflow_generator` Codex bridge가 warm artifact transformation 라운드에서 B1 이후 `EXPn-1 -> EXPn` 누적 후보 체인을 필수로 쓰도록 보강했다.
- fresh subagent와 fresh artifact를 분리해, S는 현재 후보를 검증하고 직전 후보는 delta/regression 기준으로만 사용하며 V는 현재 후보만 REF와 비교하도록 명시했다.
- chain을 사용할 수 없는 warm transformation run은 `blocked_invalid_artifact_chain_policy`로 중단하고, baseline 재시작은 baseline-fixed 평가와 cold/final replay에만 남겼다.

### Revision `working` - always-on healer rollout 기준 추가

- 24시간 PC 감시를 Codex heartbeat 중심이 아니라 launchd + deterministic healer/doctor script 중심으로 늘리는 rollout plan 을 추가했다.
- MacBook Air 는 repo 코드/문서/test/commit/push 를 맡고, 실제 LaunchAgent 설치와 secret/env 연결은 24시간 PC 에서 수행하는 역할 분리를 문서화했다.
- mail fetch, mail healthcheck, town_crier 는 LLM 을 쓰지 않고, LLM 은 morning report 또는 장애 triage 같은 낮은 빈도 advisory 계층에 둔다는 운영 기준을 명시했다.

### Revision `working` - workflow optimizer skill package 등록

- local Codex `workflow-optimizer` 를 `.registry/skills/workflow_optimizer/` canon package 로 등록해 public Git sync 후 다른 PC 에서 `npm run skills:sync -- workflow_optimizer` 또는 `--all` 로 설치할 수 있게 했다.
- tracked Codex bridge 는 현재 workflow profile calibration 규칙을 포함하며, 기본 후보에서 `gpt-5.3-*` 계열을 제외하고 최초 full quality matrix 는 subagent, 품질 통과 후보 telemetry 는 CLI 로 분리한다.

### Revision `working` - author_skill_package profile calibration

- `author_skill_package` workflow 의 public-safe staged subagent calibration archive 를 추가하고, `profile_policy.yaml` 의 active primary profile 을 `gpt-5.4-mini|low|darkelf|archivist` 로 설정했다.
- calibration 은 synthetic `api_contract_drift_check` skill authoring fixture 를 사용했으며, 실제 API spec, customer endpoint, production log, credential, `_workspaces`, `_workmeta`, `private-state` material 은 archive 에 포함하지 않았다.
- Spark 후보는 quality-pass 및 speed shadow 로 보존하되, 공식 Codex rate card 에서 research preview 로 표시되어 primary cost recommendation 에서는 제외했다.
- 후속 분석에서 `gpt-5.3-*` 계열은 active/default 후보에서 제외했다.

### Revision `working` - workflow calibration archive 경계 추가

- `.workflow/<workflow_id>/profile_policy.yaml` 과 `.workflow/<workflow_id>/calibrations/<calibration_id>/` 를 workflow-level profile optimizer 결과의 public-safe 저장 위치로 명시했다.
- 300개 후보 같은 전체 calibration archive 는 public-safe synthetic/redacted artifact 일 때만 workflow 아래에 둘 수 있고, 실제 프로젝트 원문, private transcript, secret, project-local raw run truth 는 계속 제외하도록 owner 경계를 좁혔다.
- profile optimizer 는 추천만 보고하는 것이 아니라 workflow profile policy 와 shadow Top-K 운영 기준을 업데이트하는 흐름으로 정렬했다.
- workflow authoring template 에 `profile_policy.yaml` 과 `calibrations/` scaffold 를 추가해, workflow creator 가 만든 canon entry 를 profile optimizer 가 바로 갱신할 수 있게 했다.
- 실제 앱 운영 품질과 맞추기 위해 기본 calibration mode 를 subagent quality full matrix 로 두고, 비용/토큰 telemetry 는 품질 통과 후보만 CLI proxy 로 측정하도록 profile policy template 을 보강했다.
- `meeting_followup` workflow canon 을 추가하고, 기존 public-safe CLI 300개 후보 matrix 를 workflow-local calibration archive 로 이관할 수 있게 했다.

### Revision `working` - activity sync 명령 추가

- `guild-hall:activity:sync` 를 추가해 24시간 PC 가 local activity event ledger 와 `private-state` activity mirror 를 `entry_id` 기준으로 병합하고 양쪽 `latest_context.json` 을 재생성할 수 있게 했다.
- sync 는 nested `private-state` 의 `main` branch 만 대상으로 fast-forward pull 한 뒤 변경이 있으면 activity surface 만 commit/push 하며, `_workspaces`, `_workmeta`, mailbox raw, attachment payload, secret file 은 읽지 않도록 경계를 고정했다.
- sync 는 allowlist 된 activity event field 만 mirror 하고, malformed JSONL row 는 원본에 보존하되 다른 surface 로 복제하지 않는다. `log/**` markdown/report file 은 별도 sanitizer 가 생길 때까지 mirror 하지 않는다.
- `--json` 결과에서 private git command 의 stdout/stderr 원문을 숨겨 remote URL/credential 이 터미널 출력에 섞이지 않게 했다.
- 복사/붙여넣기가 어려운 24시간 PC 용 `ALWAYS_ON_ACTIVITY_SYNC_PROMPT_V0.md` 를 추가했다.

### Revision `working` - always-on harness 설치 prompt 추가

- 복사/붙여넣기가 어려운 24시간 PC 에서 파일명 한 줄로 workflow evolution harness dependency 설치 확인을 실행할 수 있도록 always-on 전용 prompt source 를 추가했다.
- prompt 는 Codex `/goal`, promptfoo, OpenAI SDK, DSPy 설치 확인까지만 수행하고 gateway/healer/night_watch 설정과 workflow evolution 실험 실행은 건드리지 않도록 경계를 명시했다.
### Revision `working` - workflow_generator skill package added

- Added `.registry/skills/workflow_generator/` as the tracked canon and Codex bridge package for the source-bound workflow generation skill.
- The package materializes to the installed `soulforge-workflow-generator` skill through `npm run skills:sync -- workflow_generator`.
- Kept runtime run evidence, local artifact paths, candidates, and verifier outputs outside the tracked skill package.

### Revision `working` - Windows doctor harness 확인 보정

- bootstrap doctor 가 Windows 에서 `npm`, `codex`, `promptfoo` 같은 `.cmd` shim 기반 CLI 를 확인할 수 있도록 command check 실행을 보정했다.
- workflow evolution venv 확인이 Windows venv 의 `Scripts/python.exe` 경로도 인식하도록 local path 판정을 보강했다.
- mail candidate queue 가 public-safe source path 를 Windows 에서도 POSIX-style repo path 로 기록하도록 보정했다.

### Revision `working` - workflow evolution harness 설치 계획 추가

- B skill 제작 흐름을 단일 skill 제작이 아니라 `workflow_evolution` discovery/slimming 실험으로 다루는 authoring plan 을 추가했다.
- Codex `/goal`, Ralph-style loop, promptfoo, OpenAI SDK, DSPy, class/species compression 을 public-safe harness 후보로 분리하고, 다른 owner PC 에 반복 설치할 수 있는 runbook 을 추가했다.
- bootstrap checklist 에 Codex CLI, promptfoo, workflow evolution venv optional 확인을 추가하고, MacBook Air baseline 으로 Codex CLI `0.129.0` + `goals=true`, promptfoo `0.121.11`, OpenAI SDK `2.36.0`, DSPy `3.2.1` 을 확인했다.

### Revision `working` - battle_event 최소 schema 추가

- `_workmeta/<project_code>/log/events/YYYY/MM/battle_events.jsonl` 에 append 되는 mission-level battle outcome 의 public-safe schema anchor 를 추가했다.
- battle log chain sample 과 play loop 문서를 schema 의 필수 `bottleneck_reason` 및 monthly event stream 위치에 맞게 정렬했다.

### Revision `working` - UI Operation Board projection 소비

- renderer-web Dungeon Map 이 snapshot 의 `operation_board` projection 을 우선 소비해 Dungeon Map, Mission Board, Monster Gate, Next Actions 섹션을 표시하게 했다.
- legacy snapshot field fallback 은 유지하되, UI 가 pending monster group 을 직접 재분류하는 경로는 projection 이 없을 때만 사용하도록 좁혔다.

### Revision `working` - Operation Board projection 추가

- snapshot 에 `operation_board` top-level projection 을 추가해 작전판이 Dungeon Map, Mission Board, Monster Gate, Next Actions 섹션을 원본 재분류 없이 읽을 수 있게 했다.
- projection 은 기존 `projects`, `missions`, `gateway.pending_monsters`, `next_actions`, `diagnostics` 의 sanitized field 만 재조립하며 raw mail body/html/source quote/raw ref/attachment/provider id/secret 값은 계속 제외한다.

## 2026-05-08

### Revision `working` - 작전판 pending monster 분류 표시

- snapshot pending monster projection 에 `display_group` 분류와 `by_display_group` count 를 추가해 Monster Gate 가 blocked/due/routing/identification/open intake 기준으로 묶어 볼 수 있게 했다.
- pending monster display sample cap 을 24건으로 올려 현재 18건 규모의 작전판 표시가 truncation 없이 가능하게 했다.
- UI Dungeon Map 은 snapshot 의 sanitized pending monster item 만 사용해 group별 섹션으로 표시하며 raw mail body/html/source quote/raw ref/attachment 값은 계속 제외한다.

### Revision `working` - 작전판 pending monster snapshot 요약 추가

- snapshot gateway projection 이 `intake_inbox/*/monsters.json` 의 pending/blocked monster 를 제한된 summary 로 집계하게 했다.
- UI Dungeon Map 의 Monster Gate 에 pending monster count 와 sample card 를 표시하게 했다.
- snapshot 과 UI 응답은 body/html/source quote/raw ref/attachment ref/provider id 원문을 복제하지 않고 fixture 기반 test 로 비노출을 고정했다.

### Revision `working` - mail_candidate 승격 명령 추가

- `guild-hall:gateway:mail-candidate:list` 와 `guild-hall:gateway:mail-candidate:promote` 를 추가해 local-only mail candidate 를 `mail_intake_request` payload 로 승격할 수 있게 했다.
- promotion output 은 mailbox event/raw pointer 와 기본 `unknown_monster` 1건을 포함하되 body/html/raw provider payload/첨부명/첨부 URL/secret 은 포함하지 않도록 했다.
- mail candidate promotion 계약과 public-safe request sample 을 문서화했다.

### Revision `working` - mail_candidate 후보 큐 추가

- gateway mail fetch 가 fresh mail event 를 mailbox event JSONL 에 저장한 뒤, `mail` bucket event 를 local-only `mail_candidate` queue 에 적재하게 했다.
- 후보 queue item 은 source event pointer, subject, sender, 수신자/첨부 count, classification summary 만 담고 body/html/raw/첨부명/첨부 URL/secret 은 제외한다.
- `MAIL_CANDIDATE_QUEUE_V0.md` 와 public-safe sample 을 추가해 다른 PC 가 실제 `guild_hall/state/**` 운영 데이터 없이 queue shape 를 재현할 수 있게 했다.

### Revision `working` - gateway index stale 판정 보강

- `intake_inbox` monster index manifest 가 `monsters.json` 의 mtime millisecond 만 보지 않고 size/sha256 fingerprint 도 확인하게 했다.
- 같은 tick 안에서 monster 파일이 갱신돼도 stale manifest 를 재사용하지 않도록 gateway validation flake 를 줄였다.

### Revision `working` - node role public contract guard 추가

- 모든 PC clone 에서 local `node_identity.yaml` 의 `primary_writer.public_repo` 를 기준으로 protected public contract 문서 변경을 검사하는 `validate:role-boundary` 를 추가했다.
- root `validate` / `done:check` 가 role-boundary guard 를 먼저 실행해, public repo primary 가 아닌 node 의 전역 계약 문서 승격 변경을 기본 차단하게 했다.
- `MULTI_PC_DEVELOPMENT_V0.md` 에 protected public contract 경로와 owner 승인 override 규칙을 명시했다.

### Revision `working` - skill first-build 검증 게이트 명시

- Soulforge 에서 skill 을 새로 만들거나 수정할 때 파일 생성만으로 완료 보고하지 않고, validator 와 fresh-context evaluator review 를 거친 뒤 보고하도록 project-level 실행 계약에 명시했다.
- subagent 는 현재 실행 환경에서 허용되고 사용 가능한 경우에만 쓰며, 불가능한 경우에는 별도 새 컨텍스트 evaluator session 또는 수동 evaluator checklist 로 대체하고 한계를 보고하도록 했다.

### Revision `working` - private-state changelog 링크 검사 보정

- `CHANGELOG_POLICY_V0.md` 의 private repo changelog 참조를 public CI 가 따라가야 하는 상대 링크가 아니라 local path 리터럴로 표시하게 했다.
- `private-state/CHANGELOG.md` 는 owner-only nested private repo 표면이므로 public docs link check 대상에 넣지 않는 경계를 명확히 했다.

### Revision `working` - mail_received Telegram brief v0 추가

- gateway notify event set 에 `mail_received` 를 추가하고, mail fetch 가 fresh event 를 materialize 한 뒤 `town_crier` queue 에 한국어 Telegram brief request 를 적재할 수 있게 했다.
- `mail_received` brief 는 source, subject, 첫 발신자, 첨부 개수, 수신 시각, 다음 행동만 담고 body/html/첨부 원문/URL/secret 은 포함하지 않도록 formatter 와 테스트를 추가했다.
- Telegram brief format 문서에 한국어/Siri 친화 공통 원칙과 `mail_received` 표시 규칙을 추가했다.

### Revision `working` - workmeta system surface 제외

- snapshot project scan 이 `_workmeta/system/**` 같은 private metadata repo 내부 운영 기록을 project 후보로 오인하지 않도록 제외했다.
- `WORKMETA_RESOLVE_CONTRACT_V0.md` 에 `_workmeta/system/` 은 node/system smoke 기록용 non-project support surface 라고 명시했다.

### Revision `working` - tool PC owner-with-state 역할 보강

- 고성능 `tool_pc` 를 skill 제작 전용이 아니라 project metadata 를 읽고 쓰는 tool-bound 설계 작업 node 로 명시했다.
- `MULTI_PC_DEVELOPMENT_V0.md` 에 `tool_pc` 의 `_workspaces` / `_workmeta` writer 경계와 중복 방지 규칙을 추가했다.
- `TOOL_PC_BOOTSTRAP_PROMPT_V0.md` 를 추가해 고성능 PC 를 `owner-with-state` 로 재설정하고 회로설계/PCBArtwork/tool run evidence 를 기록할 수 있게 했다.

### Revision `working` - gateway env 상대 경로 해석 보강

- `gateway:fetch:healthcheck`, state backup/restore, retention cleanup 이 `EMAIL_FETCH_RUNTIME_DIR` 와 `EMAIL_FETCH_INBOX_ROOT` 의 상대 경로를 env 파일 위치 기준으로 해석하게 했다.
- always-on node 의 post-review smoke 에서 상대 runtime 경로가 repo 밖으로 해석되어 healthcheck/healer 가 중단되는 문제를 재현 테스트로 고정했다.
- gateway mail fetch 문서와 env example 에 운영 node 는 절대 경로를 권장하되, 상대 경로는 env 파일 기준이라는 규칙을 명시했다.

### Revision `working` - always-on next action prompt 추가

- `ALWAYS_ON_NEXT_ACTION_PROMPT_V0.md` 를 추가해 복사/붙여넣기가 어려운 24시간 PC 에서 짧은 파일명 지시만으로 post-review gateway 점검과 activity mirror 를 수행할 수 있게 했다.
- bootstrap README 에 prompt source 를 색인해 항상 켜 두는 PC 가 pull 후 다음 운영 작업을 파일 기반으로 찾게 했다.

### Revision `working` - gateway healthcheck/healer 판정 보강

- `guild-hall:healer:run` 이 gateway fetch healthcheck JSON 의 `WARN`/`CRITICAL` 상태를 실패 점검으로 기록해 activity carry-forward 에 남기도록 했다.
- `gateway:fetch:healthcheck` 가 `EMAIL_FETCH_ALERT_TELEGRAM_ENABLED` 와 `EMAIL_FETCH_ALERT_TELEGRAM_*` env 설정을 실제 alert decision 에 반영하게 했다.
- Hiworks POP3 fetch 가 `last_uidl` 이후 메시지부터 진행하고, 중복 이벤트의 raw row 를 반복 append 하지 않도록 보강했다.

### Revision `working` - activity logger 와 healer run 구현

- `guild-hall:activity:log` / `guild-hall:activity:refresh` 를 추가해 모든 PC 가 public-safe summary event 를 공용 activity surface 에 남길 수 있게 했다.
- `guild-hall:healer:run` 을 추가해 24시간 PC 가 repo 상태, root validation, gateway fetch healthcheck 결과를 report/event/latest_context 로 기록하게 했다.
- activity/healer 단위 테스트를 root validation harness 에 연결하고, 관련 README 와 activity/multi-PC 문서에 실행 경계를 반영했다.

### Revision `working` - multi-PC node employee model 추가

- `MULTI_PC_DEVELOPMENT_V0.md` 에 각 PC 가 bounded hotfix 를 맡을 수 있는 node employee model 을 추가했다.
- 24시간 운영용 clone 은 clean `main` 으로 유지하고, 간단 수정은 같은 PC 의 별도 worktree/branch 에서 처리한 뒤 운영용 clone 이 pull 받는 구조로 정리했다.

## 2026-05-07

### Revision `working` - play loop 병목 원인 기록 추가

- `PLAY_LOOP_V0` 에 agent 가 stop condition 까지 진행할 수 있는 최소 packet 기준을 추가해 사용자가 다음 prompt 병목이 되는 지점을 기록하게 했다.
- battle event 에 `bottleneck_reason` 을 추가해 `intervention_count` 가 왜 발생했는지 집계할 수 있게 했다.
- runner execution packet 과 snapshot next action 에 anti-bottleneck loop 를 연결해 반복 병목을 workflow/mission handoff 개선 후보로 올리게 했다.

### Revision `working` - Hiworks POP3 long line 수신 보강

- Hiworks POP3 `RETR` 수신에서 Python `poplib` 기본 2048 byte line limit 에 걸리지 않도록 connector-local long-line reader 를 추가했다.
- `HIWORKS_POP3_MAX_LINE_BYTES` env 설정과 synthetic long-line 테스트를 추가해 raw mail body 없이 긴 라인 수신 경로를 검증하게 했다.

### Revision `working` - gateway mail fetch operator 출력 redaction

- `gateway:fetch` run summary/debug/CLI error output 에 raw mail body, HTML, URL, token-like cursor 가 섞여도 operator terminal 에 그대로 노출되지 않도록 sanitize 경로를 추가했다.
- 24시간 PC `email -> monster` smoke prompt 는 live fetch 에서 `--json` 을 사용하지 않고 count/status 중심으로 확인하도록 조정했다.

## 2026-05-04

### Revision `working` - always-on email monster smoke prompt 추가

- `docs/architecture/bootstrap/ALWAYS_ON_EMAIL_MONSTER_SMOKE_PROMPT_V0.md` 를 추가해 원격 24시간 PC 에서 긴 붙여넣기 없이 파일 기반 `email -> monster` smoke test 를 실행할 수 있게 했다.
- bootstrap README 에 prompt source 를 색인해 `always_on_node` 가 public repo 수정 없이 `doctor`, `gateway:fetch`, `gateway:intake` smoke 를 순서대로 확인하게 했다.

### Revision `working` - multi-PC primary writer map 추가

- `MULTI_PC_DEVELOPMENT_V0.md` 에 색상 Mermaid 기반 PC별 primary writer map 을 추가해 `always_on_node`, `work_pc`, `portable_dev_pc` 가 쓰는 영역과 blocked 작업을 한눈에 볼 수 있게 했다.
- 같은 repo 를 여러 PC 가 clone 해도 `guild_hall/state/**`, `_workspaces/**`, `_workmeta/**`, `private-state/**`, public `Soulforge` 의 primary writer 가 겹치지 않도록 표와 중복 방지 규칙을 보강했다.

### Revision `working` - doctor local node identity 점검 추가

- `guild-hall:doctor` 가 `guild_hall/state/local/node_identity.yaml` 을 읽어 현재 PC 의 `node_role`, `bootstrap_profile`, active Soulforge root, public Git 비추적 상태를 먼저 보고하도록 했다.
- `operator`, `owner-with-state` 프로필에서는 local node identity 를 필수로 보고, `public-only` 에서는 missing 을 허용하되 결과에 표시한다.

### Revision `working` - work PC bootstrap prompt 추가

- `docs/architecture/bootstrap/WORK_PC_BOOTSTRAP_PROMPT_V0.md` 를 추가해 업무 PC 가 Git pull 후 Codex 에게 파일 기반 `work_pc` bootstrap 지시를 받을 수 있게 했다.
- prompt 는 실제 프로젝트 파일과 `_workmeta` 기록을 다루는 업무 PC 역할을 설정하되, always-on scheduler 와 고성능 tool 작업은 기본 차단하도록 정리했다.

### Revision `working` - always-on node bootstrap prompt 추가

- `docs/architecture/bootstrap/ALWAYS_ON_NODE_BOOTSTRAP_PROMPT_V0.md` 를 추가해 24시간 운영 PC 가 Git pull 후 Codex 에게 파일 기반 bootstrap 지시를 받을 수 있게 했다.
- bootstrap README 에 prompt source 를 색인해 긴 화면공유 붙여넣기 없이 `always_on_node` local identity, doctor, snapshot, night_watch preflight 절차를 찾게 했다.

### Revision `working` - 문서 색인과 multi-PC node 역할 정리

- `docs/architecture/**/README.md` 의 단순 포함 목록을 문서 역할 색인으로 보강해 AI 와 사람이 각 문서를 왜 읽어야 하는지 찾을 수 있게 했다.
- `MULTI_PC_DEVELOPMENT_V0.md` 에 `work_pc`, `tool_pc`, `portable_dev_pc`, `always_on_node` 역할과 local-only `node_identity.yaml` 기준을 추가했다.
- `AUTOHUNT_MODEL.md`, `NIGHT_WATCH_AUTOMATION_V0.md`, `PROJECT_MAP_V0.md` 를 기존 owner 체계 안에서 연결해 새 최상위 덤프 문서 없이 node capability / 24시간 운영 / 자동사냥 확장선을 찾게 했다.

### Revision `working` - Soulforge game UI 방향 문서화

- `SOULFORGE_GAME_UI_INFORMATION_ARCHITECTURE_V0.md` 를 추가해 UI 중심을 file editor 가 아니라 `Guild Hall / Dungeon Map` 작전판으로 고정했다.
- `SOULFORGE_2D_DUNGEON_UI_DIRECTION_V0.md` 를 추가해 3D 가 아닌 2D/2.5D 판타지 업무 작전판 방향과 v0/v1 경계를 정리했다.
- `SE_DUNGEON_STAGE_MODEL_V0.md` 를 추가해 project 를 dungeon, 체계공학 단계를 stage/floor, 단계 완료를 boss clear 로 읽는 public-safe UI 모델을 연결했다.

### Revision `working` - agent 실행 계약 추가

- `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md` 를 추가해 Karpathy-style coding agent 원칙을 Soulforge의 canon/public-private/secret 경계에 맞게 흡수했다.
- `AGENTS.md` 에 코드, 문서, 구조, 검토, 적용성 판단, 변경 계획, 파일 편집 작업 전 실행 계약을 읽는 라우팅 규칙을 추가했다.
- root README 와 foundation README 에 새 실행 계약 문서를 연결했다.

## 2026-05-02

### Revision `working` - Dungeon Map v0 read-only pane 추가

- `renderer-web` control center 에 `GET /__control_center_api/snapshot` dev API 와 `Dungeon Map` pane 을 추가했다.
- 새 pane 은 local snapshot projection 인 `guild_hall/state/snapshot/soulforge_snapshot.json` 의 summary 만 읽고, raw workspace/workmeta/private-state/gateway source 내용은 표시하지 않는다.

### Revision `working` - snapshot freshness 계약 추가

- `soulforge_snapshot.json` 에 `source_observations` 를 추가해 UI 가 보는 snapshot 이 어떤 원본 metadata 기준인지 판정할 수 있게 했다.
- `npm run guild-hall:snapshot:check-fresh` 를 추가해 저장된 local snapshot 과 현재 원본 surface 의 fingerprint mismatch 를 감지하게 했다.
- freshness 관측 범위는 repo metadata, roadmap, mission index, `_workspaces`, `_workmeta`, gateway state, private-state surface 로 제한하고 원본 업무 내용은 읽지 않는다.

### Revision `working` - read-only Soulforge snapshot producer 추가

- `guild_hall/snapshot/` 을 추가해 owner root, project surface, mission summary, gateway status 를 sanitized metadata JSON 으로 투영하게 했다.
- 기본 출력은 local-only `guild_hall/state/snapshot/soulforge_snapshot.json` 으로 두고, raw mailbox, attachment, token, `_workspaces` 파일 내용은 snapshot 에 포함하지 않도록 경계를 고정했다.
- `validate:snapshot` 을 root acceptance 에 연결해 snapshot shape 와 private content 비노출 최소 test 를 함께 돌리게 했다.

### Revision `working` - 큰 개발 방향 단일 정본 추가

- `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md` 를 추가해 Soulforge의 큰 개발 방향, active slice, 구체화 규칙을 한곳에서 관리하게 했다.
- `PROJECT_MAP_V0.md` 는 탐색 지도 역할로 좁히고, active backlog 와 세부 구현 checklist 는 roadmap 또는 각 owner 문서로 내려가도록 경계를 명시했다.
- `AGENTS.md` 에 큰 개발 방향과 우선순위 판단 시 roadmap 을 먼저 확인하는 짧은 라우팅 규칙을 추가했다.

### Revision `working` - 현재 구조 파악용 project map 추가

- `docs/architecture/foundation/PROJECT_MAP_V0.md` 를 추가해 Soulforge owner roots, 업무 RPG 루프, UI/gateway 상태, local/private 경계를 한 장에서 다시 볼 수 있게 했다.
- root README 와 architecture index 에 새 지도 문서를 연결해 멈춘 뒤 재개할 때 첫 읽기 순서를 분명히 했다.

## 2026-03-27

### Revision `working` - bootstrap 프로필을 public-only/operator/owner-with-state 3단으로 정리

- `public-only` 가 operator env 없이도 성립하도록 bootstrap profile 문서, checklist, doctor 계약을 정리했다.
- 새 `operator` 프로필을 추가해 private repo 없이도 gateway/town_crier local env 와 smoke/live 를 다룰 수 있게 했다.
- `owner-with-state` 는 계속 `_workmeta/`, `private-state/` 와 continuity restore 를 요구하는 owner 전용 프로필로 유지했다.

### Revision `working` - root canon validator 첫 버전 추가

- `guild_hall/validate/canon_validate.mjs` 를 추가해 `.registry`, `.unit`, `.workflow`, `.party`, `.mission`, `_workspaces/README.md` 의 최소 path/ref/readiness 무결성을 점검하게 했다.
- canonical entrypoint 는 `npm run guild-hall:validate:canon` 으로 두고, convenience alias 로 `npm run canon:validate` 를 함께 제공한다.
- mission 의 `workflow_id: null` 예외가 readiness blocked 규칙과 맞는지도 첫 validator 범위에 포함했다.

### Revision `working` - root validate/done-check 와 GitHub Actions 최소 게이트 추가

- root `validate`, `done:check`, `validate:gateway` entrypoint 를 추가해 canon validator, UI acceptance, `mail_fetch` pytest harness 를 한 surface 로 묶었다.
- `.github/workflows/validate.yml` 을 추가해 PR 과 `main` push 에서 `npm run done:check` 를 돌리는 최소 public CI gate 를 열었다.
- `CONTRIBUTING.md`, `SECURITY.md` 를 추가해 public contribution 기준선과 비공개 보안 제보 원칙을 정리했다.

### Revision `working` - update manual 에 operator 프로필 절차 추가

- `UPDATE_MANUAL_V0.md` 에 `operator` update 절차를 추가해 `public-only`, `operator`, `owner-with-state` 3단 프로필이 bootstrap 과 update 문서에서 같은 구조를 갖도록 맞췄다.
- `operator` 는 public repo pull + local operator env 유지까지만 다루고, private repo pull 은 하지 않는다고 다시 고정했다.

### Revision `working` - night_watch Stage 0 preflight 를 script owner 로 분리 시작

- `guild_hall/night_watch/preflight_repo_sync.mjs` 와 `npm run guild-hall:night-watch:preflight` 를 추가해 repo sync, retry, owner-with-state remote doctor, activity log write 를 deterministic script 가 맡게 했다.
- `soulforge-night-watch-pipeline.prompt.txt` 와 `NIGHT_WATCH_AUTOMATION_V0.md` 의 Stage 0 는 이제 자연어로 git/doctor 제어를 다시 서술하지 않고, preflight script 실행과 그 결과 소비를 기준으로 삼는다.

### Revision `working` - gateway intake dedupe index manifest 추가

- `guild_hall/gateway/monster_index.mjs` 를 추가해 `intake_inbox/**/monsters.json` 전역 파싱 대신 `intake_inbox/_index/monster_index.json` manifest cache 를 우선 읽는 구조를 넣었다.
- `runIntake`, `touchExistingMonster`, `update-monster` 는 `monsters.json` 저장 뒤 manifest 를 함께 갱신하도록 맞췄다.
- `validate:gateway` 에 Node builtin test 를 추가해 manifest rebuild 와 stale detection 을 최소 범위로 검증하게 했다.

### Revision `working` - guild_hall 공용 io/path helper 추가

- `guild_hall/shared/io.mjs` 를 추가해 `doctor`, `gateway`, `town_crier`, `night_watch` 가 공통으로 쓰는 repo-relative path 정규화, JSON/JSONL state 입출력, 존재 여부 점검 helper 를 한 surface 로 모았다.
- `night_watch` preflight 와 `gateway` dedupe index 는 이제 같은 JSON/경로 helper 를 써서 `/` 기준 repo path 와 state write 형식을 맞춘다.
- `guild_hall/shared/README.md` 를 추가하고 `guild_hall` owner 문서에 새 내부 helper surface 를 연결했다.

### Revision `working` - doctor 출력 책임 일부를 reporting helper 로 분리

- `guild_hall/doctor/reporting.mjs` 를 추가해 human/json 출력 렌더링과 fatal payload 조립 책임을 CLI 본체에서 분리했다.
- `guild_hall/doctor/cli.mjs` 는 bootstrap check 실행과 결과 조합에 더 집중하고, 출력 형식 변경은 reporting helper 에서 다루도록 정리했다.

### Revision `working` - gateway message rendering helper 분리

- `guild_hall/gateway/message_rendering.mjs` 를 추가해 관문 알림 문구, monster label, 문장 정규화 helper 를 CLI 본체에서 분리했다.
- `guild_hall/gateway/cli.mjs` 는 intake/update/notify 흐름에 집중하고, 새 의뢰 알림 텍스트 조립은 message rendering helper 가 맡도록 정리했다.

### Revision `working` - 1차 world-facing class 4종 추가와 2차 후보군 기록

- `archer`, `rogue`, `healer`, `envoy` canonical class sample 4종을 starter lineup 에 추가했다.
- 현재 registry skill/tool/knowledge 가 아직 작기 때문에, 이 4종은 기존 canon refs 를 재조합한 starter interpretation 으로 두었다.
- `blacksmith`, `artificer`, `mage`, `fighter` 는 2차 후보군으로 `.registry/classes/README.md` 에 기록해 later expansion 에서 잊지 않게 했다.

### Revision `working` - class title 을 세계관 톤으로 보정

- `archivist` 의 사람용 title 을 `기록관` 으로, `administrator` 의 사람용 title 을 `총관` 으로 조정했다.
- 내부 `class_id` 는 그대로 유지하고, world-facing 설명만 조정해 기존 unit/workflow binding 과 경로를 깨지 않게 유지했다.
- `human` species hero 와 guild master 관련 설명도 governance / archive 톤으로 같이 맞췄다.

### Revision `working` - ontology review 상기 manual 과 guild_master carry-forward 규칙 추가

- `docs/architecture/foundation/ONTOLOGY_REVIEW_MANUAL_V0.md` 를 추가해 ontology review trigger, 저장 위치, carry-forward owner 를 고정했다.
- root `AGENTS.md` 와 `night_watch` 문서/prompt 에 ontology candidate 상기 규칙을 넣어, 현재 프로젝트가 아니어도 `guild_master` / `night_watch` lane 이 cross-project 후보를 다시 떠올리게 했다.
- activity surface 에는 ontology review candidate 를 `carry_forward: true` 로 남길 수 있다는 규칙을 추가했다.

### Revision `working` - ontology-style 저장 규칙 기준선 추가

- Soulforge 핵심 개념을 `개체 + 관계` 기준으로 읽는 `Ontology Model v0` foundation 문서를 추가했다.
- ontology 정의와 관계 규칙은 public foundation 문서가 들고, project-specific instance 는 `_workmeta/<project_code>/ontology/` 에 두며, runtime event 는 계속 `guild_hall/state/**` 와 `private-state/**` 가 소유하도록 저장 위치를 고정했다.
- 새 top-level `ontology/` root 는 만들지 않고, 기존 owner root 안에서 정의/canon instance/runtime event 를 분리하는 방향으로 정리했다.

### Revision `working` - starter class lineup 을 6종으로 확장

- 기존 `knight`, `archivist`, `administrator` 에 더해 `pathfinder`, `marshal`, `auditor` canonical class sample 3종을 추가했다.
- 새 class 들은 species 와 독립된 축을 유지하고, 실제 조합은 계속 unit/party/workflow/mission 에서 결정하도록 유지했다.
- ref 는 기존 `.registry/skills`, `.registry/tools`, `.registry/knowledge` canon 안에서만 조합해 `정찰`, `집행`, `검증` lane 을 드러내도록 맞췄다.

### Revision `working` - night_watch preflight 에 transient retry 추가

- `night_watch` current-default pipeline 의 preflight 는 계속 `fail-closed` 로 유지하되, dirty repo, detached HEAD, missing origin, non-main branch 는 즉시 hard fail 하도록 명시했다.
- 반대로 DNS 해석 실패, temporary name resolution failure, timeout, connection reset, TLS handshake timeout, network unreachable, transient 5xx gateway 오류 같은 일시적 network-class 실패는 bounded retry 뒤 최종 판정하도록 규칙을 추가했다.
- repo sync 는 최대 3회 시도, doctor remote 검사는 repo sync 성공 후 1회 재시도만 허용하고, 그래도 실패하면 blocked preflight 로 중단하게 prompt/source 와 운영 문서를 맞췄다.

## 2026-03-26

### Revision `working` - 종족 직업 몬스터의 사람용 한글 표시 규칙 추가

- canonical id 는 계속 stable ASCII 를 유지하고, 사람에게 보여주는 이름은 `title`, `display_name`, `monster_label` 같은 human-facing 필드에 한국어로 둘 수 있다는 규칙을 public canon 문서에 추가했다.
- current sample species/class title 과 human hero title 을 한국어로 바꿨다.
- `monster` 계열은 `monster_family` / `monster_name` / `monster_type` id 를 유지하되, candidate note 와 lineup 문서에서 optional `monster_label` 로 한국어 표시를 둘 수 있게 했다.

### Revision `working` - species 와 class 독립 조합 규칙 추가

- `.registry` canon 에서 species 와 class 는 서로 종속되지 않는 독립 catalog 축이라고 명시했다.
- 실제 조합은 `.unit/<unit_id>/unit.yaml` 의 `identity.species_id + class_ids` 가 결정하도록 문서와 schema 를 정리했다.
- 그래서 `orc + knight` 같은 조합도 canon 상 허용되며, 제한이 필요하면 unit/party/workflow/mission 에서만 표현하도록 규칙을 고정했다.
- starter species lineup 은 `human`, `orc`, `elf`, `dwarf`, `darkelf` 5종으로 맞췄다.

## 2026-03-25

### Revision `working` - mission model 에 monster 와 artifact 구분 규칙 추가

- `docs/architecture/workspace/MISSION_MODEL.md` 에 `monster = 요청`, `artifact = 산출물`, `mission = 실행 계획` 구분을 명시했다.
- 같은 artifact 가 한 mission 에서는 output 이고, 다음 mission 에서는 input 이 될 수 있다는 generic meeting-followup 예시를 추가했다.

### Revision `working` - agent procedure capture entrypoint rule

- Added a root `AGENTS.md` rule so every bounded business task leaves tracked promotion-ready evidence in `_workmeta/<project_code>/reports/**` instead of relying on chat memory or ignored runtime logs.
- Kept `AGENTS.md` as the short routing surface and pointed detailed capture fields to `_workmeta/PROCEDURE_CAPTURE_RULE.md`, including repeatable steps, decision criteria, folder or packet shape, and completion criteria for later promotion into `skill`, `workflow`, `mission`, `role_or_class`, or `data_contract`.

### Revision `working` — night_watch local automation source 를 tracked renderer 구조로 고정

- `Soulforge Night Watch Pipeline` 의 prompt/spec source 를 public tracked tree 아래 `guild_hall/night_watch/automations/` 로 옮기고, 각 PC 의 local `automation.toml` 은 renderer 로 재생성하는 구조를 추가했다.
- 이 변경으로 automation prompt 업데이트 자체는 Git 형상관리되고, 다른 PC 는 repo pull 후 같은 source 를 보고 local automation 을 다시 install 할 수 있다.
- 관련 경로:
  - `guild_hall/night_watch/automations/soulforge-night-watch-pipeline.spec.json`
  - `guild_hall/night_watch/automations/soulforge-night-watch-pipeline.prompt.txt`
  - `guild_hall/night_watch/render_local_automation.mjs`
  - `guild_hall/night_watch/README.md`

### Revision `working` — night_watch 시작 전에 전 repo 최신 동기화 gate 추가

- 항상 켜 두는 운영 PC 의 `night_watch` pipeline 이 점검 전에 public `Soulforge`, `_workmeta`, `private-state` 를 모두 fast-forward pull 하도록 preflight stage 를 추가했다.
- preflight stage 는 세 repo 중 하나라도 dirty, missing, origin 누락, branch mismatch, pull 실패, `owner-with-state --remote` doctor 실패가 있으면 그 run 에서 후속 점검을 건너뛰고 blocked report 만 남기도록 규칙을 고정했다.
- 관련 경로:
  - `docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`
  - `docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md`
  - `guild_hall/night_watch/README.md`

### Revision `working` — legacy `_workspaces` continuity lane 제거와 runtime README 경계 정리

- bootstrap/install checklist 에서 `private-state/_workspaces` restore 경로를 제거했다.
- `owner-with-state` bootstrap 은 `guild_hall/state/**` continuity subset 만 `private-state/` 에서 복원하고, `_workspaces/<project_code>/` 는 각 PC 에서 다시 materialize 하도록 정리했다.
- tracked `guild_hall/state/README.md` 가 runtime root 안의 유일한 boundary note 라는 점을 문구로 명시해 public tracking 예외를 정리했다.
- 관련 경로:
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_CHECKLIST_V0.json`
  - `guild_hall/state/README.md`
  - `guild_hall/doctor/cli.mjs`

## 2026-03-24

### Revision `working` — night_watch automation 을 worktree-safe local path 기준으로 재설계

- Codex app automation 이 임시 worktree 에서 실행될 수 있다는 전제를 문서에 반영했다.
- tracked canon 의 상대 경로 계약은 유지하되, local automation prompt 에는 `<LOCAL_SOULFORGE_ROOT>`, `<LOCAL_ACTIVITY_ROOT>`, `<LOCAL_PRIVATE_STATE_ROOT>`, `<LOCAL_WORKMETA_ROOT>` 같은 absolute path 입력을 쓰도록 규칙을 추가했다.
- `soulforge_activity` writer 는 worktree-local copy 가 아니라 이 PC 의 active absolute root 를 canonical sink 로 삼는다고 명시했다.
- 관련 경로:
  - `docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`
  - `docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md`
  - `guild_hall/night_watch/README.md`

### Revision `working` — night_watch 결과 저장 surface 와 Fix Draft companion 설계 추가

- night_watch 자동화가 Codex inbox/thread 에만 머물지 않고 `guild_hall/state/operations/soulforge_activity/**` 에도 결과를 남기도록 output contract 를 보강했다.
- `latest_context.json`, `events/YYYY/YYYY-MM.jsonl` 외에 상세 실행 결과를 저장하는 `log/YYYY/YYYY-MM-DD/HHMM-<automation-id>.md` surface 를 추가했다.
- 자동 수정은 current-default 에 넣지 않고, draft-only 후속 조치 제안을 만드는 `Soulforge Fix Draft` companion spec 을 추가했다.
- 새 점검 자동화가 추가되거나 출력 형식이 바뀌면 `Fix Draft` spec 도 같은 patch 에서 함께 갱신하는 동기화 규칙을 문서화했다.
- 관련 경로:
  - `docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`
  - `docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md`
  - `guild_hall/night_watch/README.md`

### Revision `working` — night_watch 자동화 후보 문서화

- `guild_hall/night_watch` owner 아래에서 장기 운영용 새벽 점검 자동화 후보 3개를 문서화했다.
- `Boundary Check`, `Portability Check`, `Context Drift Check` 의 목적과 입력 경로, 결과 surface 를 정리했다.
- 자동화 규칙 문서는 tracked repo 에 두고, 실제 스케줄과 ACTIVE 상태는 Codex app local automation 이 맡는다는 경계를 분리했다.
- 다른 PC 에서 그대로 다시 만들 수 있도록 각 자동화의 이름, 권장 주기, 작업 경로, 실행 프롬프트를 문서 안에 ready-to-create spec 으로 추가했다.
- 다른 PC 에서는 repo pull 후 같은 문서를 보고 Codex automation 을 다시 만들도록 절차를 적었다.
- 관련 경로:
  - `docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md`
  - `docs/architecture/guild_hall/README.md`
  - `guild_hall/night_watch/README.md`
  - `README.md`

### Revision `working` — Soulforge 전체 활동 recent-context surface 추가

- Soulforge 전체 작업의 최근 맥락을 project `_workmeta` 가 아니라 `guild_hall/state/operations/soulforge_activity/**` 에 두는 규칙을 추가했다.
- 최근 PC/session 에서는 `latest_context.json` 을 먼저 읽고, 부족할 때만 월별 `events/*.jsonl` 마지막 몇 건을 추가로 읽는 recent-window 규칙을 문서화했다.
- `private-state/` mirror 범위와 update/handoff restore 절차에 `operations/soulforge_activity/**` 를 포함했다.
- 관련 경로:
  - `docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md`
  - `docs/architecture/guild_hall/GUILD_HALL_MODEL_V0.md`
  - `docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`
  - `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`

### Revision `working` — private-state mailbox continuity mirror 범위 확대

- `private-state/` allowlist 를 intake/monster/outbound 중심에서 mailbox continuity mirror 까지 확대했다.
- owner handoff/update/private-state 문서에서 `mailbox/company/**`, `mailbox/personal/**`, `log/mail_fetch/**` sync/restore 절차를 추가했다.
- active runtime 경로는 그대로 두고, `private-state/` 는 mirror copy plane 으로만 쓰도록 문서를 정리했다.
- 관련 경로:
  - `docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`
  - `docs/architecture/workspace/examples/private_state_repo/README.md`
  - `docs/architecture/workspace/examples/private_state_repo/gitignore.example`

### Revision `working` — 메일 수신/이동 이력 폴더와 skill spec 추가

- `020_MGMT/027_수신이력_이동이력` 폴더를 관리 폴더 quick map 과 SE 폴더트리 skill spec 에 추가했다.
- generator 가 `management_static_folders` 설명을 `폴더_인덱스.txt` 와 `plan_manifest.json` 에 반영할 수 있게 갱신했다.
- 관련 경로:
  - `.registry/skills/se_foldertree_generate/codex/assets/SE_FolderTree_Guide.md`
  - `.registry/skills/se_foldertree_generate/codex/scripts/generate_tree.py`
  - `docs/architecture/workspace/PROJECT_ONBOARDING_V0.md`

### Revision `working` — 온보딩 가이드에 관리 폴더 설명 추가

- `PROJECT_ONBOARDING_V0.md` 에 `020_MGMT` 관리 폴더 quick map 과 `022 -> stage별 *_INBOX_분류전 -> gate 내부 세부 폴더` 흐름 설명을 추가했다.
- 관련 경로:
  - `docs/architecture/workspace/PROJECT_ONBOARDING_V0.md`

### Revision `working` — owner 전용 `_workmeta` clone/pull 절차 문서화

- `_workmeta/` 를 `_workspaces/` 와 같은 레벨의 owner-only private metadata repo 로 clone/pull 하는 절차를 bootstrap/update/multi-PC 문서에 추가했다.
- `owner-with-state` 프로필이 public `Soulforge` 외에 `_workmeta/` 와 `private-state/` 를 함께 다루도록 문서를 정리했다.
- `private-state` 문서와 예시 템플릿에서 `_workmeta` 를 범위 밖의 별도 private repo 로 분리했다.
- 관련 경로:
  - `README.md`
  - `docs/architecture/bootstrap/README.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_UPDATE_PROMPT_V0.md`
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_PROFILES_V0.md`
  - `docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`
  - `docs/architecture/workspace/examples/private_state_repo/README.md`
  - `docs/architecture/workspace/examples/private_state_repo/gitignore.example`

## 2026-03-23

### Revision `working` — SE 폴더트리 생성 skill package 편입

- internal SE folder-tree generator 리소스를 Soulforge canonical skill package 로 편입했다.
- 새 package 는 `.registry/skills/se_foldertree_generate/` 아래 canon entry 와 sync 가능한 `codex/` bridge 를 함께 두고, bundled asset/script/reference 를 local Codex mirror 로 materialize 할 수 있게 구성했다.
- skill package 와 generator 를 입력 확인형으로 보강해 `layout mode(new-root/in-place)`, `business type`, `prime contractor`, `quality grade` 를 먼저 확인하고, 현재 지원 조합이 아니면 중단하도록 했다.
- generator 는 `in-place` 모드를 추가해 기존 프로젝트 루트에 한 단계 더 nested root 를 만들지 않고 직접 tree 내용을 생성할 수 있게 했다.
- bundled asset/script/reference 는 skill root 기준 상대경로 사용을 기본 원칙으로 명시해 이식성을 높였다.
- 기존 install/sync 문서는 이미 `skills:sync` 전체 동기화 규약을 갖고 있어 이번 변경에서는 새 package 추가만 반영했다.
- 관련 경로:
  - `.registry/skills/se_foldertree_generate/skill.yaml`
  - `.registry/skills/se_foldertree_generate/README.md`
  - `.registry/skills/se_foldertree_generate/codex/SKILL.md`
  - `.registry/skills/se_foldertree_generate/codex/agents/openai.yaml`
  - `.registry/skills/se_foldertree_generate/codex/references/mapping.md`
  - `.registry/skills/se_foldertree_generate/codex/references/workflow.md`
  - `.registry/skills/se_foldertree_generate/codex/assets/SE_FolderTree_Guide.md`
  - `.registry/skills/se_foldertree_generate/codex/scripts/generate_tree.py`
  - `.registry/skills/se_foldertree_generate/codex/scripts/convert_gate_numbers.py`
  - `.registry/skills/se_foldertree_generate/codex/requirements.txt`
  - `.registry/skills/README.md`

### Revision `working` — 첫 실제 프로젝트 온보딩 manual 승격

- 첫 실제 프로젝트를 `_workspaces/<project_code>/` 에 붙이는 절차를 별도 workspace manual 로 승격했다.
- short `project_code`, full `display_name`, read-only first, bounded first run/use, local-only junction/symlink materialization 규칙을 workspace 정본 문서에 반영했다.
- tracked 정본 문서와 public-safe example 에는 실제 project code / 과제명 대신 generic placeholder 만 쓰는 규칙을 추가했다.
- 실제 프로젝트별 실험 문서와 근거는 local-only `reports/onboarding/`, `artifacts/onboarding/` 아래에 두고, 안정 규칙만 정본 문서로 승격하는 흐름을 명시했다.
- 사람과 Codex 가 함께 첫 과제를 여는 `project_start_worklog.md` 와 project start workflow manual 을 추가했다.
- 새 시작 행위는 사용자가 따로 요청하지 않아도 실제 작업 순서를 worklog 와 workflow note 로 저장하는 규칙을 추가했다.
- project assignment 규칙을 승격할 때는 비밀 project code 나 내부 관리번호 대신 공개 가능한 대표 업무명/주제어를 우선 쓰고, 약어·제품군명·일반 사업유형은 보조 힌트로만 다루도록 정리했다.
- project metadata 와 raw runtime truth 를 project root 내부 metadata folder 대신 Soulforge root 아래 nested private repo `_workmeta/<project_code>/` 로 분리하는 모델로 구조 문서, 예시, UI 경로 해석을 전환했다.
- 관련 경로:
  - `docs/architecture/workspace/PROJECT_ONBOARDING_V0.md`
  - `docs/architecture/workspace/PROJECT_START_WORKFLOW_V0.md`
  - `docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md`
  - `docs/architecture/workspace/WORKMETA_SCHEMA_FIELD_MATRIX.md`
  - `docs/architecture/workspace/WORKMETA_MINIMUM_SCHEMA.md`
  - `docs/architecture/workspace/README.md`
  - `_workspaces/README.md`

### Revision `working` — Windows runbook shell 차이 보강

- bootstrap, handoff, private-state runbook 에 남아 있던 Unix shell 예시에 Windows PowerShell 대응 명령을 보강했다.
- `npm.ps1` execution policy, `which`, `mkdir -p`, `cp`, `rsync` 같은 shell 차이 때문에 새 Windows PC 에서 막히는 지점을 문서에서 바로 풀 수 있게 정리했다.
- 관련 경로:
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md`
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`
  - `docs/architecture/bootstrap/README.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_UPDATE_PROMPT_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_PROFILES_V0.md`
  - `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`

### Revision `working` — Windows bootstrap skill sync Ruby 의존 제거

- `npm run skills:sync -- --all` 이 Ruby 미설치 환경에서도 동작하도록 Node 기반 sync script 로 전환했다.
- skill install sync 운영 문서를 새 script 경로와 사용 예시로 갱신했다.
- 관련 경로:
  - `.registry/docs/operations/scripts/sync_codex_skill.mjs`
  - `package.json`
  - `.registry/docs/operations/SKILL_INSTALL_SYNC.md`

### Revision `working` — doctor skill sync 범위 확대

- bootstrap/doctor 계약을 기본 3개 skill 에서 sync 가능한 Soulforge Codex skill 전체로 확대했다.
- `codex/SKILL.md` 가 없는 registry entry 는 canon-only 또는 test package 로 보고 기본 sync 대상에서 제외하도록 문서를 정리했다.
- 관련 경로:
  - `docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_CHECKLIST_V0.json`
  - `docs/architecture/bootstrap/README.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_UPDATE_PROMPT_V0.md`
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`
  - `.registry/skills/README.md`
  - `.registry/docs/operations/SKILL_INSTALL_SYNC.md`
  - `guild_hall/doctor/README.md`
  - `guild_hall/doctor/cli.mjs`

### Revision `1b58127` — owner handoff 체크리스트 추가

- `OWNER_HANDOFF_CHECKLIST_V0.md` 를 추가해 회사/집 사이 handoff 순서를 고정했다.
- owner 는 작업 시작 전 `doctor --remote`, 작업 종료 전 public/private push 를 확인하는 흐름을 문서화했다.
- 관련 경로:
  - `docs/architecture/bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/bootstrap/README.md`

### Revision `e128441` — private-state 원격 연결과 owner push 규칙 보강

- nested `private-state/` 가 local Git repo 만 있고 `origin` remote 가 비어 있는 예외 복구 절차를 추가했다.
- public/private 두 저장소의 역할과 owner PC 의 private-state push 조건을 명시했다.
- 관련 경로:
  - `docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md`
  - `docs/architecture/bootstrap/UPDATE_MANUAL_V0.md`
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/bootstrap/CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`

### Revision `b878873` — bootstrap 인증과 continuity 가이드 보강

- 설치 완료 기준에 `gh auth login` 과 owner `doctor --remote` 통과를 포함했다.
- continuity sync/pull/restore 절차를 owner 전용 가이드로 보강했다.
- 관련 경로:
  - `docs/architecture/workspace/INSTALLATION_MANUAL_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md`
  - `docs/architecture/bootstrap/BOOTSTRAP_PROFILES_V0.md`
  - `docs/architecture/bootstrap/README.md`

### Revision `b6df3a7` — public sync probe

- 다른 PC 에서 public repo round-trip sync 를 검증하기 위한 harmless probe 파일을 추가했다.
- 목적은 public `pull/push` 동작 검증이며, 기능 변화는 없다.
- 관련 경로:
  - `docs/architecture/bootstrap/SYNC_PROBE_PUBLIC_2026-03-23.md`

## 2026-03-22

### Revision `3bbd424` — update 절차와 owner prompt 추가

- 설치 후 업데이트 표준 절차를 별도 문서로 분리했다.
- owner 가 다른 PC Codex 에 업데이트를 맡길 때 사용할 프롬프트 문서를 추가했다.

### Revision `f9680da` — secret 규칙과 필수 skill 기준 정리

- secret 파일 비열람 원칙을 agent/document 규칙에 추가했다.
- 기본 Soulforge skill 3개를 bootstrap doctor 필수 항목으로 승격했다.

### Revision `029560a` — public 기능과 private 업무데이터 저장 규칙 정리

- public repo 와 private repo 의 역할을 owner 관점에서 문서화했다.
- 팀원/public-only 와 owner-with-state 의 경계를 더 명확히 했다.

### Revision `77d6db0` — nested private-state 구조와 bootstrap 가이드 정리

- `Soulforge/private-state/` nested repo 구조를 기준으로 bootstrap/doctor 경로를 정리했다.
- active workspace 는 `Soulforge/` 하나라는 운영 모델을 문서에 반영했다.

### Revision `82672d5` — doctor 원격 점검과 bootstrap 프로필 추가

- `guild-hall:doctor` 에 `--profile owner-with-state`, `--remote`, `fix_hint` 를 추가했다.
- 팀원용 `public-only`, owner 용 `owner-with-state` bootstrap 프로필을 정식화했다.

### Revision `20f9b49` — doctor fatal schema 정리

- fatal path JSON 도 normal path 와 같은 top-level schema 를 유지하도록 정리했다.

### Revision `58621c6` — doctor 계약과 outbound ledger 정리

- `doctor` JSON/exit code 계약을 보강했다.
- outbound mail ledger 최소 필드와 private state 경계를 문서로 잠갔다.

### Revision `60b8870` — bootstrap doctor 와 private state 기준 추가

- bootstrap 문서 묶음과 `guild-hall:doctor` entrypoint 를 추가했다.
- private state repo 기준과 outbound mail 기록 자리의 초기 계약을 마련했다.
