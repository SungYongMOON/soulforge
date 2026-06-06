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
| 개발 후보 | `development candidate`, `candidate` | 구현할 만한 가능성이 보이지만 아직 실행 조건, owner, 입력, 출력, 검증이 모두 닫히지 않은 항목 | 후보는 승인, 실행, 정본 등록과 다르다. |
| 승인 | `approval`, `approved` | owner 또는 owner 가 위임한 정책이 특정 bounded action 을 진행해도 된다고 정한 상태 | 승인은 성공, 검증 통과, merge, canon entry 를 자동으로 뜻하지 않는다. |
| 실행 대기열 | `execution queue`, `dev-worker queue` | worker 가 바로 claim 해서 작업할 수 있는 task packet 묶음 | candidate queue 와 구분한다. 실행 대기열 항목은 allowed write scope 와 acceptance checks 가 있어야 한다. |
| dev-worker queue | `_workmeta/<project_code>/dev_worker_queue/*.yaml`, public-safe `.mission/**/dev_worker_request.yaml` | bounded dev worker 가 task packet 을 읽고 branch/report 를 만드는 lane | dev worker 는 reviewable branch/report 까지 만들며 auto-merge 나 main 직접 push 권한을 갖지 않는다. |
| dev-worker candidate queue | `_workmeta/<project_code>/dev_worker_candidate_queue/*.yaml` | agent 또는 owner 가 발견했지만 아직 실행 대기열로 올리지 않은 개발 후보 저장소 | owner approval 또는 추적된 low-risk auto-approval 정책 없이는 실행 대상으로 보지 않는다. |
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

## 짧은 상태 구분

```text
아이디어
  -> 개발 후보
  -> 승인
  -> 실행 대기열
  -> 시작
  -> 완료 또는 보류
  -> review
  -> promotion candidate 또는 정본 등록
```

- 이 흐름은 읽기 보조용이다. 각 queue, mission, workflow 의 실제 상태 전이는 해당 owner 문서가 소유한다.
- `보류` 에서 다시 진행하려면 부족한 source, owner decision, validator, allowed write scope, public/private 경계를 먼저 닫는다.
