# Shared Glossary v0

## 목적

- Soulforge owner 와 agent 가 개발, 검증, 지식, 정본, public/private 경계를 같은 말로 읽게 한다.
- 이 문서는 공통 용어의 얇은 해설이다. 새 backlog, 새 owner, 새 source truth 를 만들지 않는다.
- 실제 프로젝트 payload, 메일 원문, 첨부, secret, private runtime 값은 담지 않는다.

## 읽는 기준

- 경로와 owner 경계가 충돌하면 각 owner README 와 architecture 계약이 우선한다.
- AI 출력, NotebookLM/RAG 답변, access ledger 는 후보를 찾거나 route 할 수 있지만 단독으로 승인, 검증, 정본 승격을 만들지 않는다.
- 상태 단어는 문맥을 같이 읽는다. 예를 들어 `완료` 는 task 완료일 수 있고, merge 또는 canon entry 를 뜻하지 않을 수 있다.

## 핵심 용어

| 용어 | 함께 쓰는 표기 | 뜻 | 주의 |
| --- | --- | --- | --- |
| 개발 후보 | `development candidate`, `candidate` | 구현할 만한 가능성이 보이지만 아직 실행 조건, owner, 입력, 출력, 검증이 모두 닫히지 않은 항목 | 후보는 승인, 실행, 정본 등록과 다르다. 별도 후보 장부에 흩어두지 않고 개발 작업 장부에 `status: proposed` 로 둔다. |
| 승인 | `approval`, `approved` | owner 또는 owner 가 위임한 정책이 특정 bounded action 을 진행해도 된다고 정한 상태 | 승인은 성공, 검증 통과, merge, canon entry 를 자동으로 뜻하지 않는다. |
| 개발 작업 장부 | `development work ledger`, `dev-worker queue` | 제안, 승인, 대기, 진행, 완료, 보류된 개발 작업 packet 을 한곳에 모으는 장부. 기본 위치는 `_workmeta/<project_code>/dev_worker_queue/*.yaml` 이며 system 공통 작업은 `_workmeta/system/dev_worker_queue/*.yaml` 에 둔다. | 후보/실행을 폴더 두 개로 나누지 않는다. 준비도는 `status` 값으로 구분한다. |
| 실행 대기열 | `execution queue`, `queued work` | 개발 작업 장부 안에서 owner, 입력, 출력, 경계, 완료 기준, validator 가 닫혀 `approved` 또는 `queued` 상태가 된 항목 | 별도 장부 이름이 아니다. 실행 대기 항목은 allowed write scope 와 acceptance checks 가 있어야 한다. |
| dev-worker queue | `_workmeta/<project_code>/dev_worker_queue/*.yaml`, public-safe `.mission/**/dev_worker_request.yaml` | bounded dev worker 가 task packet 을 읽고 branch/report 를 만드는 lane 이자 개발 작업 장부의 canonical storage | dev worker 는 reviewable branch/report 까지 만들며 auto-merge 나 main 직접 push 권한을 갖지 않는다. |
| dev-worker candidate queue | legacy `_workmeta/<project_code>/dev_worker_candidate_queue/*.yaml` | 과거에 개발 후보를 따로 두던 legacy path | 새 항목을 넣지 않는다. 기존 항목은 내용 보존과 reader 호환성을 확인한 뒤 `dev_worker_queue` 로 이관한다. |
| 시작 | `start`, `claim`, `in progress` | worker 가 특정 task packet 을 잡고 allowed scope 안에서 실행을 시작한 상태 | 시작은 결과 보장이나 승인 변경이 아니다. |
| 완료 | `done`, `completed` | 요청된 산출물, 문서 동기화, 검증 기록, closeout 보고가 끝난 상태 | merge, 배포, 정본 승격, owner acceptance 는 별도일 수 있다. |
| 보류 | `hold`, `blocked` | source gap, owner decision, validator failure, private/public boundary, secret/raw 요구 때문에 안전하게 진행할 수 없는 상태 | 보류는 실패 낙인이 아니라 다음 필요한 결정을 드러내는 상태다. |
| 지식 | `knowledge` | 반복해서 다시 쓸 수 있는 개념, source 사용 방식, 판단 기준, relation, retrieval 단서 | 단순 대화 요약이나 AI 주장만으로 정본 지식이 되지 않는다. |
| RAG | `Retrieval-Augmented Generation` | 질문이나 검토 전에 source/ref 를 찾아 답변에 연결하는 방식 | Soulforge 에서는 기본적으로 metadata-only 로 다루며, source text lane 은 owner-approved private 경계가 필요하다. |
| 정본 | `canon`, `canonical` | 특정 계층의 기준으로 인정된 owner surface 와 그 안의 entry | 옛 relocation pointer, archive, working log, raw payload 는 정본으로 보지 않는다. |
| 비공개 메타데이터 | `private metadata`, `_workmeta` | project rules, run evidence, 판단 근거, 검증 로그, 경로 포인터, 크기, hash 같은 metadata | Office/PDF/HWPX/메일 원문/첨부 같은 실제 원문 파일을 저장하지 않는다. |
| 실제 원문 | `raw payload`, `source payload`, `actual files` | HWP/HWPX, Word, Excel, PowerPoint, PDF, 압축파일, 메일 원문/첨부 등 실제 입력/출력 파일 | `_workspaces/<project_code>/...`, `_workspaces/system/...`, 또는 owner-approved shared worksite 에 둔다. |
| 공용 운영 | `cross-project operations`, `guild_hall` | gateway, doctor, town_crier, night_watch, dev_worker 처럼 여러 project 를 가로지르는 운영 root | cross-project state 는 `guild_hall/state/**` 아래 local-only 로 둔다. 명령 표면은 `guild-hall:*` 를 쓴다. |
| 프로젝트 전용 | `project-local` | 특정 project code 에 속한 작업장, metadata, 판단 근거, 산출물 | public canon 으로 올릴 때는 raw/private payload 를 제거하고 public-safe abstraction 만 남긴다. |
| 작업 기록 | `worklog`, `procedure capture`, `run evidence` | repeatable steps, decision criteria, folder/packet shape, completion criteria, next action 을 남기는 기록 | bounded 업무는 chat 기억만으로 끝내지 않는다. 필요한 근거는 `_workmeta/**/reports/**` 쪽에 남긴다. |
| 검증 | `validation`, `validator` | deterministic command, lint, schema check, review gate 로 산출물이 계약을 지키는지 확인하는 일 | validator 통과는 강한 근거지만 owner approval 또는 source truth 를 대체하지 않는다. |
| owner decision | 책임자 판단 | 승인, 보류, scope 확정, public-safe abstraction, 정본 승격 여부처럼 agent 가 임의로 정할 수 없는 결정 | boundary 나 authority 가 불명확하면 owner decision needed 로 멈춘다. |
| sourcebound review | source-bound review | 승인된 source packet, source ref, fixture 범위 안에서만 주장과 gap 을 검토하는 방식 | source 에 없는 내용은 추론으로 채우지 않고 missing evidence 로 남긴다. |
| claim ceiling | 주장 한계 | 현재 증거로 말할 수 있는 가장 강한 상태 | 예: `observed`, `source_supported`, `validated_private`, `canon_candidate`, `canon_entry`, `rejected_or_blocked`. |
| workflow | `.workflow/<workflow_id>/` | 반복 가능한 절차, step graph, handoff, validator route 를 소유하는 orchestration canon | 특정 실행 결과나 raw run truth 를 소유하지 않는다. |
| party | `.party/<party_id>/` | 여러 workflow 를 연결한 reusable workflow-chain/loadout template | workflow 내부 step 이나 실제 성능 log 를 소유하지 않는다. |
| mission | `.mission/<mission_id>/` | held mission plan, readiness, dispatch, resolved execution plan 을 소유하는 surface | raw run truth 와 실제 project files 는 `_workmeta` 또는 `_workspaces` 경계에 둔다. |
| promotion | 승격 | 반복 성공, source support, review evidence 를 바탕으로 후보를 skill/workflow/party/knowledge/canon 쪽으로 올리는 일 | 승격은 해당 owner surface, README/schema, changelog, 검증 경로를 함께 맞춰야 한다. |
| public-safe | 공개 안전 | private payload, raw source body, secret, local runtime 값 없이 공개 repo 에 둘 수 있게 추상화된 상태 | 공개 가능 여부가 애매하면 public 이 아니라 private 으로 해석한다. |

## 게임 용어 ↔ 업무 용어 대조표

Soulforge 화면과 문서에 나오는 게임식 이름을 일반 업무 용어로 읽기 위한
대조표다. 팀 합류자가 게임 용어를 외우지 않아도 시스템을 읽을 수 있게 한다.
이 표는 표시 이름 해설일 뿐, 각 surface 의 owner 계약을 바꾸지 않는다.

| 게임 용어 | 업무 용어 | 실제 위치/표면 | 한 줄 설명 |
| --- | --- | --- | --- |
| monster (몬스터) | 처리 대기 업무 항목 | `guild_hall/gateway` intake | 메일 등에서 파생된, 아직 처리되지 않은 업무 요청 한 건 |
| dungeon (던전) | 프로젝트 | `_workspaces/<project_code>`, `_workmeta/<project_code>` | project code 하나가 던전 하나다 |
| Dungeon Map | 프로젝트 현황판 | snapshot `operation_board.sections.dungeon_map` | 프로젝트별 작업장/메타데이터 표면 상태 요약 |
| mission (미션) | 실행 계획 단위 | `.mission/<mission_id>/` | 승인된 작업 계획 1건과 그 준비 상태 |
| Mission Board | 실행 계획판 | snapshot `operation_board.sections.mission_board` | 미션들의 상태/막힘 여부 목록 |
| monster gate | 대기 업무 게이트 | snapshot `operation_board.sections.monster_gate` | 아직 프로젝트로 배정되지 않은 대기 업무 그룹 |
| triage (분류) | 미배정 업무 행선지 결정 | `_workmeta/P00-000_INBOX/reports/triage/` | INBOX 항목을 프로젝트/보류/일정으로 보내는 결정 |
| battle log (전투 기록) | 작업 실행 기록 | `_workmeta/<project_code>/log/events/**` | 실제 작업 1건이 어떻게 끝났는지의 이벤트 행 |
| party (파티) | 워크플로 체인 템플릿 | `.party/<party_id>/` | 여러 절차를 묶어 재사용하는 실행 조합 |
| guild_hall (길드홀) | 공용 운영 루트 | `guild_hall/` | 메일 수집, 알림, 점검처럼 프로젝트를 가로지르는 운영 기능 |
| Guild Master 작전판 | 운영 현황판 (operation board) | snapshot `operation_board` | 위 보드들을 묶은 read-only 종합 화면 |
| gateway (게이트웨이) | 입력 수집기 | `guild_hall/gateway/` | 메일 등 외부 입력을 안전 경계 안에서 수집/정리 |
| night_watch (야간 경비) | 야간 자동 점검 | `guild_hall/night_watch/` | 밤 사이 상태를 요약하는 advisory 자동화 |
| healer (힐러) | 자가 점검/복구 | `guild_hall/healer/` | 항상 켜 둔 PC 의 상태 self-check 와 보고 |
| town_crier (전령) | 알림 전달 | `guild_hall/town_crier/` | 사용자에게 가는 알림/메시지 전달 표면 |
| dev_worker | 경계 안 개발 작업자 | `guild_hall/dev_worker/` | task packet 을 받아 검토용 branch 를 만드는 bounded 작업자 |
| species / class / hero | 실행 프로필 분류 | `.registry/species`, `.registry/classes` | 모델/역할 조합을 게임식 이름으로 분류한 것 |
| promotion (승격) | 정식 절차 등록 | `.registry`, `.workflow` | 반복 검증된 작업 방식을 재사용 가능한 정본으로 올리는 일 |

## 짧은 상태 구분

```text
아이디어
  -> 개발 작업 장부(status: proposed)
  -> 승인
  -> 실행 대기열(status: approved/queued)
  -> 시작
  -> 완료 또는 보류
  -> review
  -> promotion candidate 또는 정본 등록
```

- 이 흐름은 읽기 보조용이다. 각 queue, mission, workflow 의 실제 상태 전이는 해당 owner 문서가 소유한다.
- `보류` 에서 다시 진행하려면 부족한 source, owner decision, validator, allowed write scope, public/private 경계를 먼저 닫는다.
