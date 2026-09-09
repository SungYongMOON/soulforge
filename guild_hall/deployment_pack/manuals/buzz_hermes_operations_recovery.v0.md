# Buzz and Hermes operations recovery — Internal RC candidate

- Artifact ref: `artifact.manual.buzz_hermes_operations_recovery.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog target: `candidate` / `current` after catalog registration; no verified release or human restore acceptance is recorded.

## Purpose

Review the evidence needed to recover a bounded Buzz collaboration surface and Hermes agent-runtime metadata without conflating either with ERP task truth, accepted project knowledge, or artifact acceptance. This runbook validates public-safe backup-generation contracts; it does not inspect or operate a live server.

## Prerequisites

- One exact approved scope, deployment/reference set, backup generation reference, and recovery-owner separation are supplied through their owning surfaces.
- The recovery plan classifies canonical, rebuildable, and ephemeral state; protected identity material is represented only by a `secret_ref`.
- A distinct human acceptance owner is available for any physical restore exercise. The backup operator cannot self-accept the result.

## Allowed and forbidden actions

- Allowed: validate Buzz/Hermes backup-generation contracts, inspect safe generation/restore/audit/identity-recovery references, and prepare a bounded recovery request for its exact owner.
- Forbidden: reading or exporting message bodies, attachments, prompts, memory, sessions, keys, tokens, database data, object-store bytes, or Git data; starting/stopping/reconfiguring a server; restoring a live system; treating a delivery receipt as consumer acknowledgement or task acceptance.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:backup-generation-contracts
npm.cmd run validate:agent-observation
npm.cmd run validate:hermes-bot-submit-executor
```

- `guild_hall/backup_controller/buzz_backup_generation_manifest.mjs` evaluates metadata-only Buzz backup-generation packets.
- `guild_hall/backup_controller/hermes_agent_backup_manifest.mjs` evaluates metadata-only Hermes agent backup-generation packets.
- `guild_hall/agent_observation/agent_mark_lineage.mjs` owns public-safe Mark/Deployment/Run lineage, not runtime recovery execution.

## Hermes 봇 창구별 도구 설정

Buzz의 기본 Claude 연결기 설정은 별도 문서(`workshop_operator.v0.md`)가 소유한다. 이 절은
**Hermes 봇**만 다룬다. 둘은 스킬 인식 경로도 권한 모델도 다르므로 서로의 절차를 옮겨 쓰지 않는다.

Hermes는 같은 봇·같은 모델이어도 **창구(platform)별로 도구를 따로 켠다.** 데스크톱/CLI에서 되는
동작이 Buzz DM에서 안 되는 것은 고장이 아니라 그 창구에 그 도구를 켜지 않은 상태다.

상태는 설정 파일을 읽어 추론하지 말고 앱에 직접 묻는다. 프로필이 여러 개일 때 어느 설정이
적용면인지 파일만 보고는 알 수 없다.

```powershell
hermes tools --summary
hermes tools list --platform buzz
hermes tools list --platform cli
hermes tools enable terminal --platform buzz
```

- 적용면 판정: 그 창구의 세션이 어느 hermes home의 상태 저장소에 기록되는지로 확인한다.
  프로필 폴더에 세션이 하나도 없으면 그 프로필의 `platform_toolsets`는 그 창구의 근거가 아니다.
- 코드 차원의 창구 제한은 `discord` 계열뿐이다. `terminal`을 포함한 나머지는 어느 창구에서도
  켤 수 있으므로, 안 되는 것은 금지가 아니라 미설정이다.
- 도구 목록은 턴마다 디스크에서 다시 읽히므로 **게이트웨이 재시작 없이 다음 턴부터 적용**된다.
  이미 응답 대기에 들어간 턴은 스스로 회복하지 않으니 그 대화에 아무 메시지나 보내 다음 턴을 연다.
- 스킬 앞머리의 `requires_toolsets`는 실제로 강제된다. 필요한 toolset이 없는 창구에서는 그 스킬을
  프롬프트에 아예 노출하지 않는다. 이 값을 비워 두면 도구 없는 창구에서도 스킬이 보여서, 봇이
  실행하겠다고 답한 뒤 되묻기만 반복하는 상태에 빠진다. 스킬을 만들 때 실제 요구 도구를 적는다.
- 되묻기 대기는 일정 시간마다 같은 질문을 재발행하며 회차 상한까지 이어진다. 진행이 없는 `clarify`
  반복은 그 창구에 실행 도구가 없다는 신호로 먼저 의심한다.

`terminal`을 원격 창구에 켜는 것은 권한 확장이다. 그 창구의 허용 사용자 목록에 오른 모든 신원이
봇을 통해 호스트 명령을 실행할 수 있게 되며, 그 목록에는 사람뿐 아니라 다른 AI 에이전트 신원이
포함될 수 있다. 명령 단위 허용목록 설정은 없으므로 범위를 좁히려면 허용 사용자 목록 자체를 줄인다.
어느 신원이 사람인지의 판단과 이 확장의 승인은 Owner가 소유한다.

## Expected readback and evidence

- Exact scope, deployment/app/schema/migration/config references, generation digest, and backup/restore/audit/identity-recovery receipt references.
- Explicit Redis/state classification: canonical data needs capture evidence; rebuildable data needs rebuild proof; ephemeral data needs explicit exclusion.
- An isolated restore readback and audit-integrity result tied to the same generation digest, followed by a separately recorded human acceptance if the physical gate is open.
- No task result, project artifact, project knowledge, or Official Task acceptance claim from the recovery receipt.

## HOLD / stop

Stop on missing scope, deployment pin, generation digest, ownership separation, recovery/rotation/revocation evidence, state classification, isolated readback, audit integrity, or human acceptance. Stop if a request would expose protected content, conflate a Buzz channel/session with a canonical Bot Chat, or use backup success as authorization to activate an Agent.

## Rollback and escalation

Do not repair a failed proof by changing runtime configuration or restoring an unverified generation. Preserve the safe receipt/HOLD references and escalate to the exact Buzz/Hermes operations owner and independent acceptance owner. Runtime rollback, credential recovery, and project-task correction are separate procedures.

## Known issues

- The executor's default current-capability resolver returns unsupported before
  reading a Work Brief. Its JSONL protocol tests use explicit synthetic support
  and a copied Node fixture; they do not establish support in installed Hermes.
  An actual text-CLI adapter and its protected deployment/current-capability
  binding remain development work. Recovery does not supply that authority.
- The tracked contracts are metadata-only/pure validation; no live Buzz or Hermes backup, restore, service health, or route is proven by this candidate.
- A backup-generation acceptance does not prove end-user message delivery, consumer acknowledgement, Bot result acceptance, or task completion.
- This candidate has no `last_verified_release` and no exercise receipt, so it cannot release a Buzz/Hermes recovery workflow.
