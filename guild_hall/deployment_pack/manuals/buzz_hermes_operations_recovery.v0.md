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

## Hermes 봇을 Buzz 창구에 올리는 절차

Hermes 봇은 클라이언트가 관리하는 봇이 아니라 **relay의 한 구성원**으로 참여한다. 관리 봇
목록에는 나타나지 않고 사람 계정과 같은 모양의 프로필을 갖는다. 그래서 관리 화면에서 봇을
만드는 경로와 이 절차는 다르다.

프로필·SOUL·모델·작업 폴더가 이미 서 있다는 전제에서, 창구에 올리는 데 필요한 것은 넷이다.

**1. 봇의 신원 키.** 프로필 `.env`의 `BUZZ_PRIVATE_KEY` 하나가 유일한 비밀이며 어댑터가 그
값을 읽는다. 키가 없으면 창구 설정을 넣어도 붙지 않는다. 키 생성과 배치는 Owner 행위다.

**2. relay 구성원 등록.** 닫힌 relay는 구성원이 아닌 신원을 거절한다(`relay_membership_required`).
등록은 relay 컨테이너 안의 관리 도구가 소유하며, 클라이언트 CLI에도 relay의 공개 응답에도
그 경로가 없다. 관리 도구는 DB 행을 넣는 데 그치지 않고 구성원 명부를 재발행하므로 살아 있는
클라이언트에 바로 반영된다. 역할은 `member`가 기본이고 `owner`는 이 도구로 줄 수 없다.
되돌리는 명령이 같은 도구에 있다.

**3. 프로필 발행.** 구성원이 되어도 그 신원의 프로필이 relay에 없으면 어댑터가 자기를 찾지
못하고 붙지 않는다(`'users get' returned no profile`). 봇 자신의 키로 표시 이름과 소개를
발행한다. 이 단계는 Owner 키가 아니라 봇 키로 하는 일이다.

**4. 창구 설정.** 프로필 `config.yaml`의 `gateway.platforms`에 창구를 켜고 relay 주소와 CLI
경로를 적는다. 이미 붙어 있는 다른 Hermes 봇의 같은 블록을 그대로 따르면 된다. 허용 사용자
목록은 그 봇에게 말을 걸 수 있는 신원이다.

### 실패를 읽는 법

세 오류가 서로 다른 단계를 가리키므로 구분해서 읽는다.

| 게이트웨이 로그 | 막힌 단계 |
| --- | --- |
| relay 403 membership required | 2. 구성원 등록 안 됨 |
| 자기 프로필 조회 결과 없음 | 3. 프로필 미발행 |
| 키 필요 오류 | 1. 신원 키 없음 |

창구 연결에 실패하면 게이트웨이 전체가 뜨지 않는 경우가 있다. 그때는 예약 작업도 함께 멈추므로,
원인을 찾는 동안에는 창구 설정을 잠시 빼 두고 게이트웨이를 살려 둔다.

### 확인

연결 성공은 게이트웨이 로그에 봇 표시 이름과 함께 남는다. 붙었다는 것과 채널을 보고 있다는
것은 다르다. 채널 목록이 비어 있으면 DM만 오간다. 설정 파일을 읽어 성공을 주장하지 말고
로그의 연결 줄과 실제 대화 왕복으로 확인한다.

### 자동 유지

프로필마다 게이트웨이가 따로 뜬다. 감시 작업은 프로필 폴더를 훑어 공식 런처가 있는 것을
챙기므로 목록을 따로 적지 않아도 된다. 그 작업은 읽고 다시 띄우기만 하며 게이트웨이를 죽이거나
프로필·키·세션을 고치지 않는다. 관리자 승인을 쓰지 못하면 로그인 항목으로 대신 걸린다.

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
