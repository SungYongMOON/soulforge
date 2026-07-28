# Project-local PC, file, and Codex activity collection V0

## Decision

All currently bound project workspaces may use one common HPP-local collector
before another one-project context experiment is attempted.

```text
프로젝트 파일 관찰 ────────────┐
5필드 업무 결과 요약 ─────────┼─> project-local HPP outbox
Codex-origin relation ─────────┘
                                  └─ later: sole-writer reconciliation
                                            ├─> 파일 이력
                                            └─> 프로젝트 시간장부/context

HPP Codex 작업 맥락 수집기
  └─> HPP 로컬 업무 장부
        └─> 로컬 업무 (`work_id`)
              └─> 업무 사건 + source/file/run refs
```

This stage is evidence collection, not context inference. A known project
workspace stays in that project from the beginning; it is not mixed into one
cross-project timeline and classified again.

같은 owner는 명시적 `HPP Codex 작업 맥락 수집기`와 그 프로그램이 쓰는
`HPP 로컬 업무 장부`도 포함한다. 프로젝트 하나에는 서로 다른 실제 업무마다
로컬 업무를 하나씩 둘 수 있다. 하나의 `work_id`에는 같은 업무를 이어가는
project leader task, 팀장이 직접 수행한 task, child·continuation·verifier task를
연결할 수 있다. 이 lane은 bounded 업무 사건과 ref만 저장하며 conversation을
복사하거나 ERP task 결과를 추론하지 않는다.

사람이 보는 정본 정의는
[`SHARED_GLOSSARY_V0.md`](../foundation/SHARED_GLOSSARY_V0.md#task-engine--ax-업무증거-용어).

## 수집 표면

| view | current HPP source | event rule |
| --- | --- | --- |
| 5필드 업무 결과 요약 | bounded project five-field end-of-task record | one candidate work occurrence; internal `bounded_work` compatibility |
| 파일 관찰 | exact project workspace observation packet | reconciler later decides 파일 이력 events |
| Codex-origin relation | relation over the same 5필드 업무 결과 요약 | relation only; no second occurrence |
| HPP 로컬 업무 장부 | explicit `work_id` and attached Codex task refs | append-only 업무 사건; no ERP completion |

계획된 ERP WorkSession/MCP/client-plugin path가 live가 아닌 동안 5필드 업무
결과 요약이 current-HPP의 실용적 bridge 역할을 한다. 미래 WorkSession owner를
대체하거나 H03/H05 acceptance를 만들지는 않는다.

HPP 로컬 업무 장부는 비활성 completion hook에 의존하지 않는다. Project
leader가 로컬 업무를 시작하고, 업무가 다른 task로 이동할 때 그 task를 붙이고,
의미 있는 checkpoint만 추가한 뒤 bounded result·verification ref와 함께
`work_id`를 닫는다. Closeout을 빠뜨리면 업무는 active로 남으며 collector가
종료를 추측하지 않는다. 완료 요약이 잘못됐으면 기존 업무를 immutable하게
보존하고 bounded `supersede_work` 사건으로 같은 프로젝트의 이미 시작된
non-superseded replacement `work_id`를 가리킬 수 있다. Self·dangling replacement
ref는 거부한다.

## Storage boundary

Machine-local 수집 결과는 먼저 HPP control root 아래에 둔다. HPP 로컬 업무
장부는 accepted project metadata가 아니다. Accepted project metadata는
`_workmeta/<project_code>/`, project payload file은
`_workspaces/<project_code>/` 또는 approved shared worksite가 계속 소유한다.
Collector는 ERP를 쓰지 않는다.

The later sole-writer step imports or reconciles accepted receipts into:

```text
_workmeta/<project_code>/
├── reports/file_activity/**
├── reports/PC_업무_이력/**
├── reports/실행_이력/**
└── project_context/projections/timeline/**
```

그 단계 전까지 local outbox packet은 collection evidence일 뿐이다. 파일 관찰은
파일 이력이 아니며, HPP 로컬 업무 장부는 프로젝트 시간장부가 아니다.

## Project and privacy rules

- An exact private allowlist owns project membership; no root-wide discovery.
- A new project needs a binding row and pinned digest before collection.
- Whole Codex chat, screen, keystroke, and OS surveillance remain prohibited.
- Project code and availability come only from the pinned private allowlist.
- Thread title, keyword similarity, or an LLM cannot silently attach work.
  Every task ref must be explicitly bound to one existing `work_id`.
- File bytes may be streamed only for exact SHA-256 and are never retained.
- A 5필드 record full-record digest and same-ID conflict check are mandatory.
- Team-PC records remain deferred to the accepted assignment, WorkSession,
  outbox/ack, and Codex client-plugin contract.

## Build order

1. HPP-local exact project binding and local outbox collection.
2. Explicit HPP project-leader/로컬 업무 task binding.
3. Repeated scan until OneDrive hydration and hash-budget gaps are visible.
4. Sole-writer reconciliation into project-private metadata.
5. Generate one representative 프로젝트 시간장부 from accepted refs.
6. Add team-PC MCP/client-plugin delivery after WorkSession is live.
