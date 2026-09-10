# Soulforge — 에이전트 작업 라우터

- 이 파일은 Soulforge 에이전트 지침의 짧은 정본 진입점이다. 상세 정책은 아래 owner 문서와 작업별 skill이 소유하며 여기서 복제하지 않는다.
- 코딩 에이전트는 같은 정책 정본을 공유한다. `CLAUDE.md`와 `GEMINI.md`의 `@AGENTS.md` 브리지는 유지하되 global 지침·override·import·시작 cwd에 따른 실제 로딩은 실행 도구별로 확인한다. 모델별 권한·안전·완료 정책을 복제하지 않으며 산출물과 자동화는 도구 비종속 형태를 유지한다.

## 권한과 먼저 읽을 문서

- 코드·문서·구조·검토·계획·편집 전 `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`의 목적·우선순위·감사 경계와 §1–4 공통 원칙을 읽는다. 이후 상세는 그 문서의 `조건부 읽기` 표에서 실제 작업에 해당하는 절만 읽고 따른다.
- 최신 사용자 요청과 명시된 중단선을 우선하되 secret, public/private, 외부·파괴적 행위의 권한 경계는 추정으로 넘지 않는다.
- 전체 구조를 판단하거나 owner·적용 조건이 불명확할 때 `docs/architecture/foundation/SOULFORGE_OWNER_MASTER_ARCHITECTURE_AND_RELEASE_MAP_V1.md`에서 필요한 owner로 내려간다. 구조·책임 변경은 `README.md`, `docs/architecture/foundation/TARGET_TREE.md`, `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md`를 확인한다.
- 큰 개발 방향·active slice·우선순위·backlog 판단 때 `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`를 읽는다. 파일럿 접속·출시·운영 전환 때는 `docs/architecture/foundation/team_member_engineering_program/18_TEAM_PILOT_ACCESS_AND_RELEASE_PLAN_V0.md`의 해당 절을 읽는다.
- 작업에 필요한 owner 문서와 skill만 단계적으로 읽고 관련 없는 문서를 선적재하지 않는다.
- 스킬·지침 자체의 조사·비교·수정에서는 실행 계약의 `작업 의도와 스킬 검토 경계`를 먼저 적용한다. 검토 대상의 절차를 자동 실행하지 않으며 사용자에게 제외된 workflow를 종료 시 우회 호출하지 않는다.

## 작업 위치와 실행면

- 코드 작업은 승인된 개발 checkout/worktree에서 한다. `git rev-parse --show-toplevel`로 실제 root를 확인하고 개발면 지정은 private inventory·binding의 비밀이 아닌 메타데이터와 별도로 대조한다. 경로 불일치만으로 이동·rename·새 repo·origin을 만들지 않는다. legacy checkout은 기존 `_workmeta`/`_workspaces` 정션 owner이며 새 코드 작업 기본 위치가 아니다.
- 운영 실행은 어떤 checkout에서도 하지 않는다. 운영 포트 4300은 버전이 박힌 `install/server-pack/<x.y.z>/payload`만 사용하고, 아직 Pack에 없는 운영 lane(Vigil(포트 4192)·수집기·전달기·정리기)은 `install/source-lanes/<lane>-vN`에서만 실행한다. 예약작업은 해당 lane의 등록기(`register-*-task.ps1`)로만 등록한다.
- 데스크톱 클라이언트 앱은 **패키지형(MSIX) 에이전트 세션에서 직접 실행하지 않는다**. 앱 기동·AppData 판정·운영 경로 전환 전 `guild_hall/deployment_pack/README.md`의 `운영 실행면과 MSIX`를 읽는다. 등록된 비패키지 예약작업·교차 확인·전환 묶음·lease 경계는 유지한다.
- 운영 상태 root 선택과 lane 전환은 위 배포 owner 및 파일럿 계획 §13A를 따른다. 잘못된 명시 값은 fail-closed이며 조용한 fallback을 만들지 않는다. 수집/custody는 백업/DR이 아니다.
- 정확한 host-local 경로·binding 값은 private inventory가 소유한다. public 문서·commit·CHANGELOG에는 `<TARGET_SOULFORGE_ROOT>`, `<private_root>` 같은 자리표시자만 쓴다.

## 안전·저장 경계

- public repo에는 기능 코드, 구조 문서와 public-safe example만 둔다.
- current legacy `_workmeta/<project_code>/`는 private metadata-only companion plane이다. 문서·메일·첨부·산출 원문은 current legacy `_workspaces/**` 또는 owner-approved shared worksite에 두고 current legacy `_workmeta`에는 포인터·해시·상태만 남긴다. current store는 actual Legacy Freeze 전 reference-in-place이며 writer가 남아 있을 수 있다.
- future target `_workspaces`에는 Human/project authority가 accepted 한 exact canonical bytes만, future target `_workmeta`에는 그 canonical byte-lineage만 들어간다. target에는 run, worklog, battle, task, collector, analytics, procedure-capture를 새로 쓰지 않는다. W-AUTH, Canonical Empty-State Genesis, and applicable Legacy Freeze가 adopted 되기 전에는 target binding/write/materialization을 하지 않는다.
- `_workmeta`에 파일이나 디렉터리를 만들기 전 `npm run guard:workmeta-write -- --assert-write-target "<target>"`를 실행한다. 디렉터리는 `--target-kind directory`를 추가한다. 거부된 대상은 생성하지 말고 current legacy `_workspaces/**` 또는 owner-approved worksite로 바꾼 뒤 current legacy `_workmeta`에는 compact metadata receipt만 남긴다.
- cross-project 보호 상태는 `private-state/`에 두며, 저장 위치나 공개 가능성이 불명확하면 public으로 올리지 않고 private 또는 `HOLD`로 해석한다.
- `.env`, token, password, cookie, session, credential JSON의 값이나 내용을 읽거나 출력하지 않는다. lane 자격증명은 `<private_root>/config/<lane>/credentials/` 아래 한 줄 파일이며 Owner만 배치한다. 형식 검사(존재·크기·한 줄·BOM)만 허용하고 값은 어떤 로그·영수증·문서에도 남기지 않는다.
- 삭제·이동·외부 전송·업로드·권한·결제·writer/route 활성화처럼 되돌리기 어려운 행위는 정확한 범위의 명시적 권한 없이는 실행하지 않는다. 실행 환경의 권한 시스템이 명령을 거부하면 우회하지 않고 일관된 상태에서 멈춘 뒤 거부된 명령을 그대로 보고한다.
- workspace·문서 입력 처리 때 `docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md`를 따른다. HWP 입력은 `docs/architecture/workspace/HWP_NORMALIZATION_V0.md`, PLAUD 시간은 `docs/architecture/workspace/PLAUD_ADOPTION_DECISION_V0.md`를 먼저 확인한다.
- 문서·화면·예약작업 이름·CHANGELOG 제목·보고에는 `SHARED_GLOSSARY_V0.md` §세계 이름의 표시명을 쓴다. 은퇴한 표시어(같은 문서 §옛 표기 → 표시명 대조표)는 새로 쓰지 않는다. 파일·폴더·포트·스키마·예약작업 ID 같은 식별자는 바꾸지 않으며 첫 등장에 괄호로 한 번 병기한다.

## 작업별 라우팅

- Hammer(Task Engine)의 collector, scheduler, binding, custody, timeline, context 또는 TaskDriver를 바꾸면 `ui-workspace/apps/dev-erp/docs/TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md`의 최신 CURRENT 상태표를 같은 변경에서 갱신한다.
- 새 HPP 최상위 data surface는 `guild_hall/backup_controller/README.md`의 backup/restore 분류와 synthetic restore gate를 따른다.
- 프로젝트 문서 RAG·맥락·회수 메모리의 새 저장 배치는 `docs/architecture/foundation/team_member_engineering_program/17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md`의 프로젝트 store 계약을 따른다. 기존 legacy 기록과 future target을 섞지 않는다.
- 지식 authority·저장·투영·재해복구를 다룰 때 `docs/architecture/guild_hall/ONTOLOGY_CANON_OPERATING_POLICY_V0.md`를 읽는다. 지식 접근 원장은 `guild_hall/knowledge_access/README.md`가 소유한다.
- manager route는 `docs/architecture/guild_hall/CODEX_WORK_DIRECTORY_V1.md`에서 exact resolve하고 ambiguous, stale, unknown route에는 자동 전송하지 않는다.
- Hammer/AX 표시 용어는 `docs/architecture/foundation/SHARED_GLOSSARY_V0.md`를 따른다.
- Soulforge 최신화·다른 PC 준비 요청은 설치된 `soulforge-github-down` skill, `docs/architecture/bootstrap/BOOTSTRAP_PROFILES_V0.md`, `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md`를 따른다.
- SE 폴더 생성·정리·rename은 `docs/architecture/workspace/SE_WORKSPACE_FOLDER_NAMING_CONVENTION_V0.md`를 따르며 실제 rename 전 dry-run, pointer migration plan과 Owner 승인을 요구한다.

## 팀원·봇·조직 라우팅

- 팀원 접속 경로는 Buzz(팀원 PC 클라이언트, Main Node 서버)와 Main Node의 Hermes 봇이 대신 호출하는 MCP다. 브라우저 World Tree(코드 dev-erp, 포트 4300)는 Owner 감독용 loopback으로 두고 팀에 열지 않는다. World Tree에는 MCP를 통한 수락 정본만 들어간다.
- 결과 등록은 제출 영수증일 뿐이다. Linear `done`은 검토 → 사람 수락 → 지정 sole writer 순서이며 파일럿에서는 사람이 직접 누른다. 작업 과정은 원문 대화가 아니라 5필드 요약과 refs로 결과와 같은 꾸러미로 제출한다.
- 팀·봇 업무 때 아래 조직 owner와 파일럿 계획 §13을 읽는다. 봇 명부는 조직도의 투영이며 실제 프로필 이름·ID·Bot Chat 값은 private 명부에만 둔다.
- 음성 세션은 사람 Owner의 짧은 비서·라우터이며 CEO나 기술 승인권자가 아니다. 다른 task 전송은 Owner가 그 음성 세션에서 명시적으로 요청한 경우에만 하고 대상 task의 model·reasoning effort를 유지한다. 목적지가 모호하면 먼저 확인한다.
- Codex에서 Hermes Bot으로 업무지시·후속질문을 전달할 때는 해당 profile의 기존 canonical `Bot Chat`을 기본 통로로 재사용한다. 일반 CLI/tool 세션과 Kanban은 별도 목적이나 Owner 요청이 있을 때만 쓴다.
- 상세 권한과 route는 `docs/architecture/guild_hall/AI_ORGANIZATION_MODEL_OPERATING_POLICY_V0.md`, `docs/architecture/guild_hall/DEVELOPMENT1_TEAM_AND_AI_PLATFORM_ORGANIZATION_V0.md`, `docs/architecture/guild_hall/COMMON_TEAM_OPERATIONS_AND_ROUTING_V0.md`를 따른다.

## 실행·검증

- 요청 전체의 성공 기준을 충족하는 최소한의 완결된 변경을 한다(실행 계약 §4). 작은 diff·단계별 구현은 변경·검증 단위이지 요청 축소나 중간 종료의 근거가 아니다. 기존 사용자·다른 agent 변경을 되돌리지 않는다.
- Git 사용이 허용된 저장소 작업 전 HEAD, `git rev-parse --git-path index.lock`, dirty·staged 변경의 소유권과 동시 편집 징후를 확인한다. 사용자가 금지한 명령은 이 점검에도 실행하지 않는다. lock 부재는 안전 증거가 아니다. 충돌 쓰기는 격리/직렬화하며 사용자 브랜치·staged 변경을 임의로 바꾸지 않는다. staging·금지 동작은 실행 계약 §3을 따른다.
- 재사용 하네스와 스크립트는 가능한 표준 Node/CLI로 만들고 특정 agent 환경만의 기능을 정본 의존성으로 만들지 않는다. `validate:*` 스크립트가 PowerShell에 의존하면 플랫폼 게이트를 두거나 `:windows` 변형으로 분리한다.
- 관찰하지 않은 명령·결과·권한·모델·상태를 주장하지 않는다. 불확실하면 `UNKNOWN` 또는 `HOLD`로 둔다. 문서의 상태선은 물리 영수증과 같은 변경에서 갱신하며, "production"은 `release_state`가 실제로 그럴 때만 쓴다(그 전에는 `internal_rc`/`pilot`).
- 개발1팀 또는 AI 조직 TASK의 create/fork/continue/rollover/handoff에서 exact Codex `thread_id`가 실제로 반환되면 `.workflow/codex_thread_manager_v0`의 Workspace Board local enrollment gate를 반드시 완료한다. 등록·validate·가능한 live reconcile 영수증 없이는 task operation 완료를 주장하지 않으며, title·cwd·prefix·similarity·age·idle로 thread ID를 추정하지 않는다. actual ID·roster·등록값은 ignored local state에만 둔다.
- 위험도에 맞는 deterministic validator와 실행 계약의 post-development review level을 적용한다. 스킬·지침 감사 예외를 우선하며 실제 적용되는 종료 검증만 `.workflow/post_development_review_gate_v0/`로 수행한다. 여러 브랜치 통합은 fresh 비작성 검토(Level 2 이상) 뒤 통합 브랜치에서 수정·검증한 뒤 fast-forward한다.
- 브라우저 연결 복구의 허용·금지 범위는 실행 계약의 `Local browser connection standing approval`을 따른다.
- `NIGHT_WORK_HANDOFF`는 unresolved forward-state가 context 경계를 넘어야 할 때만 `.registry/skills/long_thread_handoff/codex/SKILL.md`에 따라 사용한다.

## 문서·기록 동기화

- 폴더 구조나 owner 책임이 바뀌면 `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md`에 따라 관련 README와 architecture 문서를 같은 변경에서 갱신한다.
- public 구조·기능·설치·운영 규칙 변경은 `docs/architecture/foundation/CHANGELOG_POLICY_V0.md`에 따라 `CHANGELOG.md`를, private continuity data plane 구조·운영 규칙 변경은 같은 정책에 따라 `private-state/CHANGELOG.md`를 갱신한다.
- 개발 예정과 후보는 임의 TODO 파일이 아니라 `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`의 저장 규칙을 따른다.
- 반복 절차와 promotion-ready 근거는 `_workmeta/PROCEDURE_CAPTURE_RULE.md`에 따라 current legacy metadata-only route에 남긴다. 운영 전환·활성화 영수증은 `local-recovery/` 아래 작업별 receipt에 남기고 public 문서에는 digest·refs만 인용한다.

## 완료·Git

- bounded AI 작업은 완료 전 `.workflow/five_field_session_capture_v0`의 capture CLI로 입력·판단·출력·검증·중단조건을 원문 없이 기록한다. 단, 스킬·지침 감사는 diff와 직접 검증 결과로 기록을 갈음하며 별도 요청 없는 capture·종료 workflow를 실행하지 않는다. worktree나 D: checkout에서 capture가 적용되면 `--repo-root <legacy checkout>`으로 legacy `_workmeta` 장부를 지정한다.
- 완료 보고 전 실행 계약의 knowledge trigger check를 수행하고, 대화에서 드러난 반복 실수·미정 규칙·자동 guard 후보를 `규칙 강화 체크:`로 닫는다.
- skill 생성·수정은 실행 계약의 first-build verification gate 전에는 production-ready로 보고하지 않는다.
- public 변경, current legacy project metadata, cross-project 보호 상태는 각각 public repo, current legacy `_workmeta`, `private-state`에 분리하고 원문·secret을 commit하지 않는다. GitHub remote는 기존 하나(`origin`)를 유지하며 checkout 위치가 바뀌어도 새 repo를 만들지 않는다.
- 유효한 요청·기존 Owner 위임이 허용한 개발 lane·변경·origin/브랜치에서는 commit+push+self-verify 자동 마감을 유지한다(실행 계약 §3). 검토 전용·명시적 중단선·권한 밖 대상에는 적용하지 않는다. commit·push·배포·사람 수락은 별도 상태로 보고하며 관측하지 않은 모델·검증을 기록하지 않는다.

## 제외

- Owner 계약 없이 새 top-level root, schema, workflow, mission 또는 canon을 만들지 않는다.
- relocation stub, raw work log, archive pointer와 project payload를 active public canon으로 올리지 않는다.
- tracked workspace sample은 `docs/architecture/workspace/examples/**`만 사용한다.

Soulforge의 정본은 `.registry`, `.unit`, `.workflow`, `.party`, `.mission`, `guild_hall`, `_workspaces`와 그 계약 문서다.
