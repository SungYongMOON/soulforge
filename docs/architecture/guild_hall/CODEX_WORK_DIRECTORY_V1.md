# Codex Work Directory v1

## 상태

- claim ceiling: `canon_candidate`
- 이 문서는 public-safe 조직·라우팅 계약이다.
- 실제 route 목록과 live runtime binding은 이 문서나 public Git에 두지 않는다.

## 목적

Codex Work Directory는 업무를 받을 stable manager route를 찾는 조직·라우팅
계약이다. stable route identity는 역할, 권한 범위, 담당 프로젝트를 소유하며,
현재 실행 thread나 provider session 같은 교체 가능한 runtime identity와
분리한다.

공개 구현은 다음 두 schema만 정한다.

- `guild_hall/codex_work_directory/schema/route_catalog.v1.schema.json`:
  private stable route catalog의 public-safe shape
- `guild_hall/codex_work_directory/schema/live_bindings.v1.schema.json`:
  local-only live binding의 public-safe shape

schema와 public test fixture에는 generic placeholder와 synthetic value만 쓴다.
실제 프로젝트 코드·이름·담당자·task/thread id·title·host·status,
provider account·session·worktree 값은 public contract의 일부가 아니다.

## 고정 조직 토폴로지

directory root는 탐색 시작점일 뿐이며 `navigation_authority=none`이다. root
자체에는 업무를 보낼 수 없다. root 아래에는 다음 다섯 branch가 정확히
서로 같은 깊이의 sibling으로 존재한다.

1. `COMMON`
2. `PROJECTS`
3. `AX DEVELOPMENT`
4. `ERP DEVELOPMENT`
5. `SYSTEM DEVELOPMENT`

`COMMON`은 기계적으로 안정된 branch id다. 사람에게 보이는 projection에서는
`회사·팀 운영 (COMMON)`으로 표시하고, 구체적인 팀 공통업무 조직과 업무분장은
`COMMON_TEAM_OPERATIONS_AND_ROUTING_V0.md`를 따른다. 실제 팀명과 manager
title은 private stable catalog가 소유한다.

`PROJECTS` 아래 각 project manager는 서로 sibling인 leaf다. project manager를
`AX DEVELOPMENT`의 child로 두거나 AX 조직 소유자로 해석하지 않는다.

`AX DEVELOPMENT` 상세 projection은 AX CEO 한 자리와 정확히 다섯 AX
responsibility-owner 자리만 보여준다. 이 자리는 프로젝트 팀장 목록을
대체하거나 포함하지 않는다.

`manager_route_id`는 같은 branch 안의 실제 관리 관계에만 쓴다. branch를
넘는 요청은 `협업 요청`, `검토 요청`, `재분류 요청`으로 구분하며 지휘 명령으로
해석하지 않는다. COMMON의 directory curator/common routing route에 보내는
escalation은 재분류 요청일 뿐이고, project·AX·ERP·SYSTEM의 domain authority를
COMMON으로 이전하지 않는다. 반대로 다른 branch의 manager도 COMMON의 공통업무
authority를 가져오지 않는다. 사람 owner의 현재 지시는 peer 요청과 별도로
식별하고 그 authority ref를 보존한다.

## authority와 projection

한 private stable route catalog가 다음 human projection의 공통 입력이다.

- Soulforge 전체 조직 overview
- 회사·팀 운영과 모든 프로젝트별 팀장을 동급 branch로 보여주는 업무 조직도
- 회사·팀 운영 manager와 공통 책임 분야를 보여주는 COMMON detail view
- AX CEO와 다섯 responsibility owner를 보여주는 AX detail view

tree 또는 card 표현은 read-only projection이다. projection이 route를 새로
만들거나 authority를 바꾸지 않는다.

선택한 manager 아래 current work Kanban은 미래에 같은 data model을 소비할 수
있는 optional downstream view다. 조직·라우팅 directory는 “누구에게 보낼지”를
찾고, Kanban은 그 manager 아래 개별 업무의 요청·진행중·확인대기·보류·완료
상태를 보여준다. Kanban, 화면, board DB는 stable route의 source of truth나
이번 최소 구현의 authority가 아니다.

project/worktree/agent 실행 view와 durable task-status board는 서로 다른
projection이다. 둘 다 같은 future data model을 참조할 수 있지만 route
authority나 서로의 source of truth가 되지는 않는다.

## stable route와 live runtime 분리

stable route는 manager 역할, routing scope, 권한, project association과
lifecycle을 가진다. local live binding은 그 stable route가 현재 어떤
coordination/execution surface에 연결되는지를 표현한다.

public catalog에는 provider-neutral capability class만 둔다. 제품·provider별
실제 Codex/Orca/Kimi account, task/thread, agent, session, worktree 값은 모두
local-only다. local binding은 다음 책임을 서로 구분할 수 있어야 한다.

- durable coordination binding
- preferred execution surface
- runtime agent
- runtime session/worktree binding
- fallback binding
- validator binding
- bridge state
- execution readiness

execution surface가 기존 coordination history를 이어받거나 coordination
message API를 호출할 수 있다고 추정하지 않는다. 필요한 bridge가 입증되지
않으면 `planned`, `pilot`, `blocked` 같은 상태로만 기록하며
`execution_ready=false`다. 이 모델은 provider 설치, 로그인, 설정 변경,
session/worktree 생성 권한을 부여하지 않는다.

## 저장 owner와 공개 경계

- 실제 stable route catalog는 owner-approved `_workmeta` private surface가
  소유한다.
- 실제 live binding은
  `guild_hall/state/operations/codex_work_directory/`가 소유하며 local-only,
  Git-ignored, regenerable state다.
- public repo에는 schema, resolver, CLI, 문서, synthetic fixture만 둔다.
- public repo, `private-state`, snapshot에는 실제 route/binding을 기본
  mirror하지 않는다.
- secret, credential, provider account 값은 어느 catalog에도 넣지 않는다.

## 해석 규칙

resolver는 조회만 수행하며 route 생성, task 생성, message 전송, default route
변경 같은 side effect를 만들지 않는다.

1. public topology 계약을 만족하는 private stable catalog를 읽는다.
2. exact stable route 후보를 찾는다.
3. active하고 route 가능한 후보가 정확히 하나일 때만 그 route를 반환한다.
4. ambiguous, unknown, stale, retired, `do_not_route` 또는 guessed project
   code는 fail closed한다.
5. live binding이 필요하면 stable route와 정확히 한 binding이 대응하는지
   별도로 검증한다.
6. `execution_ready=false`이면 route identity를 찾았더라도 실행 가능하다고
   보고하지 않는다.

`list_threads` 같은 runtime discovery는 이미 등록된 route의 검증·유지보수
fallback일 뿐 stable catalog를 대신하는 bootstrap authority가 아니다.

resolver 결과는 `EXACT`, `AMBIGUOUS`, `STALE`, `UNKNOWN`, `RETIRED`,
`ROLLOVER_PENDING`으로 구분한다. active unique route만 `EXACT`가 될 수 있고,
나머지 결과는 actionable live binding을 노출하지 않는다.

## lifecycle

- create: owner-approved stable manager route를 private catalog에 등록한다.
- rollover: stable route identity는 유지하고 local live binding만 교체할 수
  있다.
- retire: route를 기록에서 지우는 대신 non-routable lifecycle로 보존한다.
- ephemeral worker: manager가 만든 일시 worker는 자동으로 permanent stable
  route가 되지 않는다.

lifecycle maintenance는 이미 승인된 owner surface의 변경 절차를 따라야 하며,
resolver나 workflow maintenance 자체는 send/default-route authority를 갖지
않는다.

## private writer 최소 입력 계약

별도 승인된 private writer는 위 두 public schema와
`guild_hall/codex_work_directory/directory.mjs`의 cross-record invariant
validator를 함께 exact validation authority로 사용해야 한다. 저장 전에는
read-only CLI의 `validate-catalog`와 `validate-binding`을 모두 통과해야 한다.

- stable catalog top-level:
  `schema_version`, `catalog_revision`, `navigation_authority`, `branches`,
  `routes`
- stable route:
  `route_id`, `branch_id`, `display_name`, `scope`, `aliases`, `project_code`,
  `owner_role`, `manager_route_id`, `escalation_route_id`, `request_examples`,
  `do_not_route`, `lifecycle`, `capability_classes`
- live binding top-level:
  `schema_version`, `catalog_schema_version`, `catalog_revision`, `bindings`
- route live binding:
  `route_id`, `durable_coordination_binding`,
  `preferred_execution_surface`, `runtime_agent`, optional `runtime_session`,
  optional `worktree_binding`, `fallback_bindings`, `validator_bindings`,
  `observed_status`, `verified_at_kst`, `source_kind`, `binding_state`,
  `prior_resource_history_pointer`, `prior_thread_history_pointer`,
  `bridge_state`, `execution_ready`

`durable_coordination_binding`의 local `thread_identifier`,
`resource_title`, `host_identifier`는 각각 현재 manager thread id,
exact title, host id를 보존한다. 이 실제 값은 local owner surface 밖으로
복사하지 않는다.

writer는 실제 값의 public 출력, guessed project code 생성, duplicate active
binding, retired/stale route 재활성화, non-ready runtime의 actionable 표시를
거부해야 한다.

## 이번 단계의 비목표

- 새 UI 또는 Kanban 구현
- Hermes DB 또는 다른 board DB 연동
- GitHub Projects 연동
- Orca, ERP 또는 provider runtime 연동
- Kimi 설치·로그인·설정·session/worktree 생성
- automation, party, message send, default route 변경
