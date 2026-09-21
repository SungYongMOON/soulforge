# Manager coordination and acceptance training — Internal RC candidate

- Artifact ref: `artifact.manual.manager_training.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog target: `candidate` / `current` after catalog registration; no verified release or trainee exercise acceptance is recorded.

## Purpose

Train a manager to coordinate work without silently becoming every system's writer or technical accepter: assess evidence, select the accountable owner, request a bounded action, read receipts, route review, and preserve human acceptance boundaries. This manual does not grant task-writer, artifact-acceptance, release, budget, personnel, or external-send authority.

## Prerequisites

- A named manager trainer and a public-safe/synthetic scenario with exact owner pointers are supplied.
- The scenario separates task state, context/evidence, artifact revision, agent/runtime, backup/restore, and external-source ownership.
- Any real escalation is routed to its existing owner; this manual supplies no default route or broad administrative grant.

## Allowed and forbidden actions

- Allowed: interpret a candidate/receipt/HOLD/unknown state; rehearse an owner-specific request; verify a Work Brief's review and escalation bindings; file a bounded Watch/Bastion-style request where its policy allows.
- Forbidden: approving one's own result, treating a Bot response or delivery receipt as consumer acknowledgement, setting Official Done, changing a task/asset/agent/runtime, releasing a product, using staff data, or escalating through an ambiguous/stale route.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:authority-taxonomy
npm.cmd run validate:forge-intent
npm.cmd run validate:watch-bastion
```

- `guild_hall/authority_taxonomy/README.md` is the public-safe A0–A6 and R0–R4 interpretation guide; it is not a live enforcement writer.
- `guild_hall/forge_intent/src/forge_intent_core.mjs` makes approval, assignment, and Work Brief binding separate steps.
- `guild_hall/watch_panel_contract/src/watch_panel_contract.mjs` and `guild_hall/bastion_action/src/bastion_action_gate.mjs` separate a filed request from an executed action.

## 과제 폴더에서 규칙·연락처·메일 이력의 자리

SE 프로젝트 폴더의 `020_MGMT` 아래 고정 관리 폴더가 과제별 운영 자료의 정본 자리다. 매니저가 새 규칙판·연락처판을 별도로 만들라고 지시하지 않도록 이 구조를 알아 둔다.

- `021_자동화설정_운영규칙`: 메일 라우팅 규칙 등 운영 규칙 파일. 파일 안에 `상태`(초안 vN → 확정)와 `Owner 확인 기록`이 있으므로, 확정 여부는 그 파일을 읽어서 판단하지 감으로 판단하지 않는다.
- `022_INBOX_원본수집`: 과제로 들어온 메일·원본의 first landing 자리.
- `023_연락처_이해관계자`: 연락처·조직·담당자 정본 자리.
- `025_통합로그_의사결정조치`: 실제로 한 일을 적는 `작업_장부.csv`(작업 장부) 자리.
- `026_상태_진행현황`: 앞으로 해야 할 일을 적는 `할일_장부.csv`(할일 장부) 자리.
- `027_수신이력_이동이력`: 메일 수신 이력·자료 이동 이력을 두는 자리. 메일 이력은 매 refresh마다 수집 메일에서 다시 만드는 현재 시점 view이고(Owner기입 칸 보존, 이전 파일은 `history/`에 보관), append-only인 것은 그 아래 수집 메일 custody와 정정 이력이다.

프로젝트 폴더 이름은 `project_code` 다음에 밑줄과 짧은 한글명을 붙이는 형태로, 코드가 항상 먼저 온다.

새 폴더 규칙을 만들지 말고 이 자리에 둔다. 배분 전 규칙 파일의 상태와 Owner 확인 기록을 먼저 확인해, 미확정 규칙에 기대어 승인·배분하지 않는다.

### 작업 장부·할일 장부

- `025_통합로그_의사결정조치/작업_장부.csv`: 실제로 한 일을 적는 장부(누가·언제·어떤 task·근거·결과·다음 action).
- `026_상태_진행현황/할일_장부.csv`: 앞으로 해야 할 일을 적는 장부(항목·담당자·마감일·SE stage·출처·완료 기준·상태).

그 일을 한 사람이나 AI가 직접 행을 쓴다. 매니저는 AI가 남긴 작업 완료를 그대로 승인하지 않고 직접 확인하며, AI가 제안한 할일도 수락·수정·거절로 매니저가 판단한다.

장부에는 포인터만 남긴다(메일 본문·첨부·개인정보·secret 금지).

## Expected readback and evidence

- The manager can identify the source of truth for a scenario and name the exact owner/writer/reviewer/acceptance role instead of using a general manager label.
- The manager can distinguish a proposal, task state, delivery receipt, consumer acknowledgement, review verdict, human acceptance, and release decision.
- Any exercise output is a training reference only. It grants no action level, risk tier, project access, or production operating authority.

## HOLD / stop

Stop on missing evidence, no safe owner pointer, ambiguous routing, stale/expired/revoked authorization, cross-project scope, self-approval, automatic completion request, or a need for an external effect. Treat `unknown` and `hold` as escalation inputs, never as permission to continue.

## Rollback and escalation

The training path has no automatic rollback side effect. Preserve the scenario/receipt/HOLD references and escalate to the exact task, artifact, runtime, backup, project, or Owner authority. If an action was actually performed outside training, its owning system's independent readback and rollback procedure apply.

## Known issues

- This candidate teaches coordination and acceptance boundaries; it is not a delegation engine, a manager console, or a universal approval surface.
- A manager's review does not replace domain technical acceptance or Owner-reserved decisions.
- This candidate has no `last_verified_release` and no exercise receipt, so it cannot release a manager-training path.
