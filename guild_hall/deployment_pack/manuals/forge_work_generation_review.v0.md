# Forge work generation and review — Internal RC candidate

- Artifact ref: `artifact.manual.forge_work_generation_review.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog target: `candidate` / `current` after catalog registration; no verified release or human exercise acceptance is recorded.

## Purpose

Review one bounded work-generation path: accepted-context reference → Work Candidate → immutable TaskIntent → approval record → Official Task writer port → assignment → issued Work Brief. Forge prepares and checks this seam; it is not the Official Task system of record and it does not complete work.

## Prerequisites

- An exact accepted-context reference, Engine-finding references, proposed primary role, and independent review authority are supplied by their owners.
- The requested TaskIntent has an exact digest and expected prior state. No inferred context, newest-record fallback, or free-form work brief is permitted.
- A real task writer, if ever used, is separately approved and pinned; this repository's tracked writer adapter is synthetic only.

## Allowed and forbidden actions

- Allowed: validate the pure Forge contract; prepare and inspect a draft Work Brief; inspect missing critical bindings; review an exact intent/approval/assignment/brief reference chain.
- Forbidden: treating a candidate as an Official Task, writing Linear or another task system without its separate writer gate, selecting a person automatically, issuing an incomplete Work Brief, marking work done, accepting an artifact, or sending an external instruction.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:forge-intent
npm.cmd run validate:forge-linear-execution-packet-admission
```

- `guild_hall/forge_intent/src/forge_intent_core.mjs` provides `createForgeIntentCore`, `draftWorkBrief`, and `issueWorkBriefFromDraft`.
- `ui-workspace/apps/dev-erp/src/forge_linear_execution_packet_admission.mjs` is the separate admission seam for an already observed Official Task/assignment/issued Work Brief.
- `docs/architecture/foundation/team_member_engineering_program/04_FORGE_AX_SE_WORK_AND_ENGINE.md` owns the work-generation policy.

## Expected readback and evidence

### 과제 업무 발견 화면에서 먼저 확인하기

World Tree에 로그인한 뒤 메뉴의 **과제 업무 발견**을 연다. 현재 접근 가능한 과제의
신규 업무·기존 업무 후속·자료 보강·무조치·보류 후보를 확인하고, **업무 후보·근거 보기**로
판단 이유와 관련 업무를 읽는다. 참조·판본·검증 기록은 접힌 상세에서 확인할 수 있다.
**이어보기**는 다음 기록을 읽고 **새로고침**은 현재 권한으로 다시 조회한다.

가벼운 업무 발견에는 전체 공학 규칙 준비를 기다리지 않는다. 공학 근거가 필요한 후보는
현재 수락 자료와 Rune 결과가 있어야 하며, 미확인은 누락 확정으로 표시하지 않는다.
화면에 준비된 후보와 저장 성공은 공식 업무 등록·사람 수락·완료를 뜻하지 않는다.

미준비 표시가 나오면 운영 담당자가 설치 설정·공개 입력·현재 권한과 기존 저장소를
확인한다. 조회 서버는 모델을 시작하거나 빈 DB를 만들어 복구하지 않는다. 종료 확인이
필요한 작업은 재실행 전에 독립 실행 증거로 확인하고, 기존 기록·권한을 지우지 않는다.

- Exact accepted-context, finding, candidate, intent, intent-digest, approval, assignment, and Work Brief references.
- For a draft, the complete `missing_bindings` view; a draft is not issuable material.
- For an issued brief, all eight required bindings, one primary role, assignment authority/epoch/expiry, and the required review role.
- A writer result only when the separately approved writer returns one; writer success is still not execution, result, review, acceptance, or Official Done.

## HOLD / stop

Stop when accepted context, finding, exact digest, approval, assignment authority/epoch/expiry, writer binding, or any Work Brief critical binding is absent, stale, rejected, held, or mismatched. Stop when a real task writer, project assignment, or automation would be inferred from a label, profile, or conversation.

## Rollback and escalation

Do not rewrite an intent, approval, assignment, or issued Work Brief to hide a mismatch. Preserve the exact reference and escalate to the context/Engine owner, assignment authority, or task-writer owner as appropriate. A rejected or held intent remains blocked; correction requires a new bounded proposal through its owner path.

## Known issues

- Forge is a pure in-memory seam; actual Linear writer binding, accepted-context supply, and physical assignment are held.
- An issued Work Brief is an execution input, not evidence that a worker ran or a result was accepted.
- This candidate has no `last_verified_release` and no exercise receipt, so it cannot release a work-generation workflow.
