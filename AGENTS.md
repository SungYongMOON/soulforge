# Soulforge — 에이전트 작업 라우터

- 이 파일은 Soulforge 에이전트 지침의 짧은 정본 진입점이다. 상세 정책은 아래 owner 문서와 작업별 skill이 소유하며 여기서 복제하지 않는다.
- 모든 코딩 에이전트가 같은 지침을 본다: Codex(GPT)는 이 `AGENTS.md`를 직접 읽고, Claude는 `CLAUDE.md`, Gemini·Antigravity는 `GEMINI.md`가 각각 `@AGENTS.md` 한 줄로 이 파일을 가리킨다. 도구별 지침 파일과 개인 지침에는 별도 모델 전용 정책을 두지 않으며, 산출물과 자동화는 어느 도구든 이어받을 수 있는 도구 비종속 형태를 유지한다.

## 권한과 먼저 읽을 문서

- 코드, 문서, 구조, 검토, 적용성 판단, 변경 계획 또는 파일 편집 전 `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`를 읽고 따른다.
- 최신 사용자 요청과 명시된 중단선을 우선하되 secret, public/private, 외부·파괴적 행위의 권한 경계는 추정으로 넘지 않는다.
- 전체 항법은 `docs/architecture/foundation/SOULFORGE_OWNER_MASTER_ARCHITECTURE_AND_RELEASE_MAP_V1.md`(M0–M16)를 먼저 읽고, 정본 구조와 owner는 `README.md`, `docs/architecture/foundation/TARGET_TREE.md`, `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md`를 따른다.
- 큰 개발 방향, active slice, 우선순위와 backlog 저장 판단은 `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`를, 팀 파일럿 접속 모델·출시 사다리·봇 명부 규칙은 `docs/architecture/foundation/team_member_engineering_program/18_TEAM_PILOT_ACCESS_AND_RELEASE_PLAN_V0.md`를 먼저 확인한다.
- 작업에 필요한 owner 문서와 skill만 단계적으로 읽고 관련 없는 문서를 선적재하지 않는다.

## 작업 위치와 실행면 (2026-09-02 D: 이관 이후)

- 코드 작업은 Git `dev` checkout(현재 `<TARGET_SOULFORGE_ROOT>/dev/source_checkout`) 또는 그 worktree에서 한다. 옛 legacy checkout은 legacy `_workmeta`/`_workspaces` 정션의 owner로만 남기며 새 코드 작업 기본 위치가 아니다.
- 운영 실행은 어떤 checkout에서도 하지 않는다. 운영 포트 4300은 버전이 박힌 `install/server-pack/<x.y.z>/payload`만 사용하고, 아직 Pack에 없는 운영 lane(상황판·수집기·전달기·정리기)은 `install/source-lanes/<lane>-vN`에서만 실행한다. 예약작업은 해당 lane의 등록기(`register-*-task.ps1`)로만 등록한다.
- 데스크톱 클라이언트 앱은 **패키지형(MSIX) 에이전트 세션에서 직접 실행하지 않는다**. 패키지 세션이 앱을 낳으면 그 앱의 `%LOCALAPPDATA%`·`%APPDATA%` 쓰기가 세션 전용 가상 저장소로 리다이렉트되어 사용자 데이터가 실경로와 갈라진다(Buzz Desktop에서 2026-08-29·09-01 두 번 발생해 기존 신원이 사라지고 새 신원 생성 화면이 떴다). 기동은 등록된 비패키지 예약작업으로만 하며, 이미 떠 있는 창을 조작하는 것은 무관하다. 같은 이유로 사용자 AppData 경로의 존부·내용 판정은 패키지 세션의 관측을 신뢰하지 않고 WSL의 C: 드라이브 drvfs 마운트, UNC `\\localhost\C$\...`, 예약작업 컨텍스트 중 둘 이상으로 교차 검증한다. lane별 예약작업 이름·드리프트 감지기는 해당 lane runbook이 소유한다.
- 운영 상태 root는 `SOULFORGE_STATE_ROOT`(공유 상태 root)와 `SOULFORGE_OWNER_ROOT`(legacy `_workmeta` overlay용 checkout root)가 정하며, 우선순위는 파일별 명시 flag/env > `SOULFORGE_STATE_ROOT` > `SOULFORGE_OWNER_ROOT` > git-derived다. 값이 잘못되면 fail-closed이며 조용한 fallback을 만들지 않는다.
- 경로가 바뀌는 lane 전환은 **수집기 pin · 바인딩 digest · VBS/launcher · 채널/상태 digest 울타리** 넷을 한 묶음으로 갱신하고, 재등록 직후 launcher `--preflight`를 등록된 인자로 확인한다. 전환은 트리거 사이 시간에, lease가 없을 때만 하며 이전 lane 사본은 삭제하지 않고 rename 보존하고 영수증은 `local-recovery/`에 남긴다.
- 수집(collection/custody)과 백업(backup/DR)은 다른 축이다. 현재 수집 lane은 메일·음성·PC파일·Codex 작업맥락·Slack·Linear 6종이며 custody는 백업이 아니다.
- 정확한 host-local 경로·binding 값은 private inventory가 소유한다. public 문서·commit·CHANGELOG에는 `<TARGET_SOULFORGE_ROOT>`, `<private_root>` 같은 자리표시자만 쓴다.

## 안전·저장 경계

- public repo에는 기능 코드, 구조 문서와 public-safe example만 둔다.
- current legacy `_workmeta/<project_code>/`는 private metadata-only companion plane이다. 문서·메일·첨부·산출 원문은 current legacy `_workspaces/**` 또는 owner-approved shared worksite에 두고 current legacy `_workmeta`에는 포인터·해시·상태만 남긴다. current store는 actual Legacy Freeze 전 reference-in-place이며 writer가 남아 있을 수 있다.
- future target `_workspaces`에는 Human/project authority가 accepted 한 exact canonical bytes만, future target `_workmeta`에는 그 canonical byte-lineage만 들어간다. target에는 run, worklog, battle, task, collector, analytics, procedure-capture를 새로 쓰지 않는다. W-AUTH, Canonical Empty-State Genesis, and applicable Legacy Freeze가 adopted 되기 전에는 target binding/write/materialization을 하지 않는다.
- `_workmeta`에 파일이나 디렉터리를 만들기 전 `npm run guard:workmeta-write -- --assert-write-target "<target>"`를 실행한다. 디렉터리는 `--target-kind directory`를 추가한다. 거부된 대상은 생성하지 말고 current legacy `_workspaces/**` 또는 owner-approved worksite로 바꾼 뒤 current legacy `_workmeta`에는 compact metadata receipt만 남긴다.
- cross-project 보호 상태는 `private-state/`에 두며, 저장 위치나 공개 가능성이 불명확하면 public으로 올리지 않고 private 또는 `HOLD`로 해석한다.
- `.env`, token, password, cookie, session, credential JSON의 값이나 내용을 읽거나 출력하지 않는다. lane 자격증명은 `<private_root>/config/<lane>/credentials/` 아래 한 줄 파일이며 Owner만 배치한다. 형식 검사(존재·크기·한 줄·BOM)만 허용하고 값은 어떤 로그·영수증·문서에도 남기지 않는다.
- 삭제·이동·외부 전송·업로드·권한·결제·writer/route 활성화처럼 되돌리기 어려운 행위는 정확한 범위의 명시적 권한 없이는 실행하지 않는다. 실행 환경의 권한 시스템이 명령을 거부하면 우회하지 않고 일관된 상태에서 멈춘 뒤 거부된 명령을 그대로 보고한다.
- 상세 workspace 경계는 `docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md`를 따른다. HWP는 `docs/architecture/workspace/HWP_NORMALIZATION_V0.md`에 따라 HWPX로 정규화한 뒤 읽고, PLAUD 시간은 `docs/architecture/workspace/PLAUD_ADOPTION_DECISION_V0.md`를 따른다.
- 문서·화면·예약작업 이름·CHANGELOG 제목·보고에는 `SHARED_GLOSSARY_V0.md` §세계 이름의 표시명을 쓴다. 은퇴한 표시어(같은 문서 §옛 표기 → 표시명 대조표)는 새로 쓰지 않는다. 파일·폴더·포트·스키마·예약작업 ID 같은 식별자는 바꾸지 않으며 첫 등장에 괄호로 한 번 병기한다.

## 작업별 라우팅

- Task Engine의 collector, scheduler, binding, custody, timeline, context 또는 TaskDriver를 바꾸면 `ui-workspace/apps/dev-erp/docs/TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md`의 최신 CURRENT 상태표를 같은 변경에서 갱신한다.
- 새 HPP 최상위 data surface는 `guild_hall/backup_controller/README.md`의 backup/restore 분류와 synthetic restore gate를 따른다.
- 지식 authority와 저장·투영·재해복구 경계는 `docs/architecture/guild_hall/ONTOLOGY_CANON_OPERATING_POLICY_V0.md`를 따른다.
- manager route는 `docs/architecture/guild_hall/CODEX_WORK_DIRECTORY_V1.md`에서 exact resolve하고 ambiguous, stale, unknown route에는 자동 전송하지 않는다.
- Task Engine/AX 표시 용어는 `docs/architecture/foundation/SHARED_GLOSSARY_V0.md`를 따른다.
- Soulforge 최신화·다른 PC 준비 요청은 설치된 `soulforge-github-down` skill, `docs/architecture/bootstrap/BOOTSTRAP_PROFILES_V0.md`, `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`를 따른다.
- SE 폴더 생성·정리·rename은 `docs/architecture/workspace/SE_WORKSPACE_FOLDER_NAMING_CONVENTION_V0.md`를 따르며 실제 rename 전 dry-run, pointer migration plan과 Owner 승인을 요구한다.

## 팀원·봇·조직 라우팅

- 팀원 접속 경로는 Buzz(팀원 PC 클라이언트, Main Node 서버)와 Main Node의 Hermes 봇이 대신 호출하는 MCP다. 브라우저 ERP는 Owner 감독용 loopback으로 두고 팀에 열지 않는다. World Tree(ERP)에는 MCP를 통한 수락 정본만 들어간다.
- 결과 등록은 제출 영수증일 뿐이다. Linear `done`은 검토 → 사람 수락 → 지정 sole writer 순서이며 파일럿에서는 사람이 직접 누른다. 작업 과정은 원문 대화가 아니라 5필드 요약과 refs로 결과와 같은 꾸러미로 제출한다.
- 봇 명부는 조직도의 투영이다. 페르소나 이름은 계속 쓰는 봇(공통 운영·툴 공방)에만 붙이고 프로젝트 봇은 `과제코드 + 직책`으로 표기하며 판타지 직책은 표시 별칭이다. 실제 프로필 이름·ID·Bot Chat 값은 private 명부에만 둔다.
- 음성 세션은 사람 Owner의 짧은 비서·라우터이며 CEO나 기술 승인권자가 아니다. 다른 task 전송은 Owner가 그 음성 세션에서 명시적으로 요청한 경우에만 하고 대상 task의 model·reasoning effort를 유지한다. 목적지가 모호하면 먼저 확인한다.
- Codex에서 Hermes Bot으로 업무지시·후속질문을 전달할 때는 해당 profile의 기존 canonical `Bot Chat`을 기본 통로로 재사용한다. 일반 CLI/tool 세션과 Kanban은 별도 목적이나 Owner 요청이 있을 때만 쓴다.
- 상세 권한과 route는 `docs/architecture/guild_hall/AI_ORGANIZATION_MODEL_OPERATING_POLICY_V0.md`, `docs/architecture/guild_hall/DEVELOPMENT1_TEAM_AND_AI_PLATFORM_ORGANIZATION_V0.md`, `docs/architecture/guild_hall/COMMON_TEAM_OPERATIONS_AND_ROUTING_V0.md`를 따른다.

## 실행·검증

- 요청에 직접 연결된 최소 범위만 변경하고 기존 사용자·다른 agent 변경을 되돌리지 않는다. 파일 편집은 작은 diff를 우선한다.
- 작업 전 HEAD, `.git/index.lock`, dirty change ownership과 동시 편집 징후를 확인하고 충돌 가능성이 있으면 중단·보고한다. 같은 checkout에 다른 lane이 commit 중이면 공유 파일(CHANGELOG, 색인)은 짧게 편집하고 곧바로 commit한다.
- 재사용 하네스와 스크립트는 가능한 표준 Node/CLI로 만들고 특정 agent 환경만의 기능을 정본 의존성으로 만들지 않는다. `validate:*` 스크립트가 PowerShell에 의존하면 플랫폼 게이트를 두거나 `:windows` 변형으로 분리한다.
- 관찰하지 않은 명령·결과·권한·모델·상태를 주장하지 않는다. 불확실하면 `UNKNOWN` 또는 `HOLD`로 둔다. 문서의 상태선은 물리 영수증과 같은 변경에서 갱신하며, "production"은 `release_state`가 실제로 그럴 때만 쓴다(그 전에는 `internal_rc`/`pilot`).
- 개발1팀 또는 AI 조직 TASK의 create/fork/continue/rollover/handoff에서 exact Codex `thread_id`가 실제로 반환되면 `.workflow/codex_thread_manager_v0`의 Workspace Board local enrollment gate를 반드시 완료한다. 등록·validate·가능한 live reconcile 영수증 없이는 task operation 완료를 주장하지 않으며, title·cwd·prefix·similarity·age·idle로 thread ID를 추정하지 않는다. actual ID·roster·등록값은 ignored local state에만 둔다.
- 위험도에 맞는 deterministic validator와 실행 계약의 post-development review level을 적용한다. 반복 종료 검증은 `.workflow/post_development_review_gate_v0/` 또는 설치된 `soulforge-post-development-review-gate` skill을 사용한다. 여러 브랜치를 main에 붙일 때는 fresh 비작성 검토(Level 2 이상) 뒤 통합 브랜치에서 지적을 고치고 validator를 초록으로 만든 뒤 fast-forward한다.
- 브라우저 연결 복구의 허용·금지 범위는 실행 계약의 `Local browser connection standing approval`을 따른다.
- `NIGHT_WORK_HANDOFF`는 unresolved forward-state가 context 경계를 넘어야 할 때만 `.registry/skills/long_thread_handoff/codex/SKILL.md`에 따라 사용한다.

## 문서·기록 동기화

- 폴더 구조나 owner 책임이 바뀌면 `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md`에 따라 관련 README와 architecture 문서를 같은 변경에서 갱신한다.
- public 구조·기능·설치·운영 규칙 변경은 `docs/architecture/foundation/CHANGELOG_POLICY_V0.md`에 따라 `CHANGELOG.md`를, private continuity data plane 구조·운영 규칙 변경은 같은 정책에 따라 `private-state/CHANGELOG.md`를 갱신한다.
- 개발 예정과 후보는 임의 TODO 파일이 아니라 `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`의 저장 규칙을 따른다.
- 반복 절차와 promotion-ready 근거는 `_workmeta/PROCEDURE_CAPTURE_RULE.md`에 따라 current legacy metadata-only route에 남긴다. 운영 전환·활성화 영수증은 `local-recovery/` 아래 작업별 receipt에 남기고 public 문서에는 digest·refs만 인용한다.

## 완료·Git

- bounded AI 작업은 완료 전 `.workflow/five_field_session_capture_v0`의 capture CLI로 입력·판단·출력·검증·중단조건을 원문 없이 기록한다. worktree나 D: checkout에서는 `--repo-root <legacy checkout>`으로 legacy `_workmeta` 장부를 지정한다.
- 완료 보고 전 실행 계약의 knowledge trigger check를 수행하고, 대화에서 드러난 반복 실수·미정 규칙·자동 guard 후보를 `규칙 강화 체크:`로 닫는다.
- skill 생성·수정은 실행 계약의 first-build verification gate 전에는 production-ready로 보고하지 않는다.
- public 변경, current legacy project metadata, cross-project 보호 상태는 각각 public repo, current legacy `_workmeta`, `private-state`에 분리하고 원문·secret을 commit하지 않는다. GitHub remote는 기존 하나(`origin`)를 유지하며 checkout 위치가 바뀌어도 새 repo를 만들지 않는다.
- commit 전 status와 diff를 확인하고 작업자 도구·모델과 실제 검증 결과를 남긴다. clean bounded slice는 commit+push+self-verify로 닫는다.

## 제외

- Owner 계약 없이 새 top-level root, schema, workflow, mission 또는 canon을 만들지 않는다.
- relocation stub, raw work log, archive pointer와 project payload를 active public canon으로 올리지 않는다.
- tracked workspace sample은 `docs/architecture/workspace/examples/**`만 사용한다.

Soulforge의 정본은 `.registry`, `.unit`, `.workflow`, `.party`, `.mission`, `guild_hall`, `_workspaces`와 그 계약 문서다.
