# Soulforge — 에이전트 작업 라우터

- 이 파일은 Soulforge 에이전트 지침의 짧은 정본 진입점이다. 상세 정책은 아래 owner 문서와 작업별 skill이 소유하며 여기서 복제하지 않는다.
- `CLAUDE.md`와 개인 지침에는 별도 모델 전용 정책을 두지 않고 이 파일을 가리킨다. 산출물과 자동화는 Codex가 이어받을 수 있는 도구 비종속 형태를 유지한다.

## 권한과 먼저 읽을 문서

- 코드, 문서, 구조, 검토, 적용성 판단, 변경 계획 또는 파일 편집 전 `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`를 읽고 따른다.
- 최신 사용자 요청과 명시된 중단선을 우선하되 secret, public/private, 외부·파괴적 행위의 권한 경계는 추정으로 넘지 않는다.
- 정본 구조와 owner는 `README.md`, `docs/architecture/foundation/TARGET_TREE.md`, `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md`를 따른다.
- 큰 개발 방향, active slice, 우선순위와 backlog 저장 판단은 `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`를 먼저 확인한다.
- 작업에 필요한 owner 문서와 skill만 단계적으로 읽고 관련 없는 문서를 선적재하지 않는다.

## 안전·저장 경계

- public repo에는 기능 코드, 구조 문서와 public-safe example만 둔다.
- current legacy `_workmeta/<project_code>/`는 private metadata-only companion plane이다. 문서·메일·첨부·산출 원문은 current legacy `_workspaces/**` 또는 owner-approved shared worksite에 두고 current legacy `_workmeta`에는 포인터·해시·상태만 남긴다. current store는 actual Legacy Freeze 전 reference-in-place이며 writer가 남아 있을 수 있다.
- future target `_workspaces`에는 Human/project authority가 accepted 한 exact canonical bytes만, future target `_workmeta`에는 그 canonical byte-lineage만 들어간다. target에는 run, worklog, battle, task, collector, analytics, procedure-capture를 새로 쓰지 않는다. W-AUTH, Canonical Empty-State Genesis, and applicable Legacy Freeze가 adopted 되기 전에는 target binding/write/materialization을 하지 않는다.
- `_workmeta`에 파일이나 디렉터리를 만들기 전 `npm run guard:workmeta-write -- --assert-write-target "<target>"`를 실행한다. 이 guard는 current legacy metadata-write target 검사일 뿐 future target canonical admission이나 writer authority를 만들지 않는다. 디렉터리는 `--target-kind directory`를 추가한다. 거부된 대상은 생성하지 말고 current legacy `_workspaces/**` 또는 owner-approved worksite로 바꾼 뒤 current legacy `_workmeta`에는 compact metadata receipt만 남긴다.
- cross-project 보호 상태는 `private-state/`에 두며, 저장 위치나 공개 가능성이 불명확하면 public으로 올리지 않고 private 또는 `HOLD`로 해석한다.
- `.env`, token, password, cookie, session, credential JSON의 값이나 내용을 읽거나 출력하지 않는다. 필요한 경로와 Owner가 직접 처리할 단계만 안내한다.
- 삭제·이동·외부 전송·업로드·권한·결제·writer/route 활성화처럼 되돌리기 어려운 행위는 정확한 범위의 명시적 권한 없이는 실행하지 않는다.
- 상세 workspace 경계는 `docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md`를 따른다.
- HWP는 `docs/architecture/workspace/HWP_NORMALIZATION_V0.md`에 따라 HWPX로 정규화한 뒤 읽고, PLAUD 시간은 `docs/architecture/workspace/PLAUD_ADOPTION_DECISION_V0.md`를 따른다.

## 작업별 라우팅

- Task Engine의 collector, scheduler, binding, custody, timeline, context 또는 TaskDriver를 바꾸면 `ui-workspace/apps/dev-erp/docs/TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md`의 최신 CURRENT 상태표를 같은 변경에서 갱신한다.
- 새 HPP 최상위 data surface는 `guild_hall/backup_controller/README.md`의 backup/restore 분류와 synthetic restore gate를 따른다.
- 지식 authority와 저장·투영·재해복구 경계는 `docs/architecture/guild_hall/ONTOLOGY_CANON_OPERATING_POLICY_V0.md`를 따른다.
- manager route는 `docs/architecture/guild_hall/CODEX_WORK_DIRECTORY_V1.md`에서 exact resolve하고 ambiguous, stale, unknown route에는 자동 전송하지 않는다.
- Task Engine/AX 표시 용어는 `docs/architecture/foundation/SHARED_GLOSSARY_V0.md`를 따른다.
- Soulforge 최신화·다른 PC 준비 요청은 설치된 `soulforge-github-down` skill, `docs/architecture/bootstrap/BOOTSTRAP_PROFILES_V0.md`, `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`를 따른다.
- SE 폴더 생성·정리·rename은 `docs/architecture/workspace/SE_WORKSPACE_FOLDER_NAMING_CONVENTION_V0.md`를 따르며 실제 rename 전 dry-run, pointer migration plan과 Owner 승인을 요구한다.

## 실시간 음성 비서·조직 라우팅

- 음성 세션은 사람 Owner의 짧은 비서·라우터이며 CEO나 기술 승인권자가 아니다. 다른 task 전송은 Owner가 그 음성 세션에서 명시적으로 요청한 경우에만 하고 대상 task의 model·reasoning effort를 유지한다. 목적지가 모호하면 먼저 확인한다.
- Codex에서 Hermes Bot으로 업무지시·후속질문을 전달할 때는 해당 profile의 기존 canonical `Bot Chat`을 기본 통로로 재사용한다. 일반 CLI/tool 세션과 Kanban은 별도 목적이나 Owner 요청이 있을 때만 쓰며, 정확한 중복 방지·직렬화 규칙은 아래 AI 조직 운영 정책을 따른다.
- 상세 권한과 route는 `docs/architecture/guild_hall/AI_ORGANIZATION_MODEL_OPERATING_POLICY_V0.md`, `docs/architecture/guild_hall/DEVELOPMENT1_TEAM_AND_AI_PLATFORM_ORGANIZATION_V0.md`, `docs/architecture/guild_hall/COMMON_TEAM_OPERATIONS_AND_ROUTING_V0.md`를 따른다.

## 실행·검증

- 요청에 직접 연결된 최소 범위만 변경하고 기존 사용자·다른 agent 변경을 되돌리지 않는다. 파일 편집은 작은 `apply_patch` diff를 우선한다.
- 작업 전 HEAD, `.git/index.lock`, dirty change ownership과 동시 편집 징후를 확인하고 충돌 가능성이 있으면 중단·보고한다.
- 재사용 하네스와 스크립트는 가능한 표준 Node/CLI로 만들고 특정 agent 환경만의 기능을 정본 의존성으로 만들지 않는다.
- 관찰하지 않은 명령·결과·권한·모델·상태를 주장하지 않는다. 불확실하면 `UNKNOWN` 또는 `HOLD`로 둔다.
- 개발1팀 또는 AI 조직 TASK의 create/fork/continue/rollover/handoff에서 exact Codex `thread_id`가 실제로 반환되면 `.workflow/codex_thread_manager_v0`의 Workspace Board local enrollment gate를 반드시 완료한다. owner-provided `organization_group_id`, safe `display_label`, kind·relationship·lifecycle을 쓰고 route/work 값은 known일 때만 쓴다. 프로젝트가 없는 TASK도 명시 delegation packet의 organization group과 exact nullable parent가 있을 때만 등록하며, 등록·validate·가능한 live reconcile 영수증 없이는 task operation 완료를 주장하지 않는다.
- title, cwd, prefix, similarity, age, idle 또는 parent-only 값으로 thread ID를 추정하지 않으며, actual ID·roster·등록값은 ignored local state에만 두고 tracked 문서·workflow data에는 넣지 않는다.
- idempotent `register-existing`, `validate`, 그리고 live adapter가 가능한 경우 `reconcile --live`가 통과하기 전에는 Board-visible 또는 enrollment-gate closed를 주장하지 않는다. CLI·registry·adapter의 disable/failure는 TASK 운영과 분리한 Board `HOLD`와 정확한 blocker로 남기며 우회·추측·자동 route를 금지한다.
- manager rollover는 stable role을 유지하고 compact handoff acceptance 뒤 새 exact ID의 pending enrollment을 CLI rollover로 accepted/current로만 승격하며 prior ID는 history로 보존한다. Codex archive/delete는 자동 수행하지 않고 별도 권한을 요구한다.
- `idle`/`notLoaded`는 explicit result gate를 대체하는 완료 신호가 아니며 Owner browser acknowledgement는 Board Active card만 localStorage에서 숨길 수 있고 Codex task를 변경하지 않는다. enrollment에는 raw preview/message/prompt/reasoning/tool I/O/content나 secret을 넣지 않으며 이 gate는 `create_thread`의 자동 interception을 주장하지 않는다.
- 위험도에 맞는 deterministic validator와 실행 계약의 post-development review level을 적용한다. 반복 종료 검증은 `.workflow/post_development_review_gate_v0/` 또는 설치된 `soulforge-post-development-review-gate` skill을 사용한다.
- 브라우저 연결 복구의 허용·금지 범위는 실행 계약의 `Local browser connection standing approval`을 따른다.
- `NIGHT_WORK_HANDOFF`는 unresolved forward-state가 context 경계를 넘어야 할 때만 `.registry/skills/long_thread_handoff/codex/SKILL.md`에 따라 사용한다.

## 문서·기록 동기화

- 폴더 구조나 owner 책임이 바뀌면 `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md`에 따라 관련 README와 architecture 문서를 같은 변경에서 갱신한다.
- public 구조·기능·설치·운영 규칙 변경은 `docs/architecture/foundation/CHANGELOG_POLICY_V0.md`에 따라 `CHANGELOG.md`를, private continuity data plane 구조·운영 규칙 변경은 같은 정책에 따라 `private-state/CHANGELOG.md`를 갱신한다.
- 개발 예정과 후보는 임의 TODO 파일이 아니라 `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`의 저장 규칙을 따른다.
- 반복 절차와 promotion-ready 근거는 `_workmeta/PROCEDURE_CAPTURE_RULE.md`에 따라 current legacy metadata-only route에 남긴다. Event Timeline/Analytics/AI Workforce target writer가 없으면 그 legacy source가 history authority로 남으며, target `_workmeta`로 옮겨 쓰지 않는다.

## 완료·Git

- bounded AI 작업은 완료 전 `.workflow/five_field_session_capture_v0`의 capture CLI로 입력·판단·출력·검증·중단조건을 원문 없이 기록한다.
- 완료 보고 전 실행 계약의 knowledge trigger check를 수행한다.
- 완료 보고 전 대화에서 드러난 반복 실수·미정 규칙·자동 guard 후보를 확인하고 `규칙 강화 체크:`로 닫는다. 누락 검출 경계는 `guild_hall/knowledge_access/README.md`를 따른다.
- skill 생성·수정은 실행 계약의 first-build verification gate 전에는 production-ready로 보고하지 않는다.
- public 변경, current legacy project metadata, cross-project 보호 상태는 각각 public repo, current legacy `_workmeta`, `private-state`에 분리하고 원문·secret을 commit하지 않는다. target canonical byte-lineage는 별도 adopted W-AUTH/Genesis/Freeze 및 sole-writer route가 열리기 전까지 생성하지 않는다.
- commit 전 status와 diff를 확인하고 작업자 도구·모델과 실제 검증 결과를 남긴다. clean bounded slice는 commit+push+self-verify로 닫는다.

## 제외

- Owner 계약 없이 새 top-level root, schema, workflow, mission 또는 canon을 만들지 않는다.
- relocation stub, raw work log, archive pointer와 project payload를 active public canon으로 올리지 않는다.
- tracked workspace sample은 `docs/architecture/workspace/examples/**`만 사용한다.

Soulforge의 정본은 `.registry`, `.unit`, `.workflow`, `.party`, `.mission`, `guild_hall`, `_workspaces`와 그 계약 문서다.
