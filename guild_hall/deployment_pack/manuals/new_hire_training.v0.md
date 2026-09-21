# New-hire orientation — Internal RC candidate

- Artifact ref: `artifact.manual.new_hire_training.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog target: `candidate` / `current` after catalog registration; no verified release or trainee exercise acceptance is recorded.

## Purpose

Give a new team member a public-safe orientation to Soulforge's product boundaries: ERP assets, Engineering Engine findings, Agent Platform execution, task/receipt separation, and the difference between collection, backup, review, and acceptance. It does not provision an account, device, project access, or agent authority.

## Prerequisites

- A named trainer, approved learning scope, and a public-safe training environment are supplied by the team owner.
- The trainee receives no credential, private project payload, customer material, or production writer authority through this document.
- Training examples use synthetic/public-safe records only and state their non-operational status.

## Allowed and forbidden actions

- Allowed: read the architecture/manual catalog, run deterministic public validators, practice classifying evidence versus acceptance, and record a separate training-completion reference if the training owner permits it.
- Forbidden: self-enrollment, access requests by implication, copying project data, changing a task or asset, sending a message, opening a connector, operating a Bot, treating a quiz as role activation, or granting an authority level.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:manual-release
npm.cmd run validate:product-composition
npm.cmd run validate:authority-taxonomy
```

- `docs/architecture/foundation/SOULFORGE_OWNER_MASTER_ARCHITECTURE_AND_RELEASE_MAP_V1.md` is the high-level product/release map.
- `guild_hall/authority_taxonomy/README.md` distinguishes action shape (A0–A6) from risk (R0–R4); it grants no authority.
- `guild_hall/deployment_pack/manuals/manual_release_catalog.v0.json` shows candidate/HOLD/release status and must not be treated as an access-control system.

## 과제 폴더에서 규칙·연락처·메일 이력의 자리

SE 프로젝트 폴더에는 `020_MGMT` 아래 고정 관리 폴더가 있고, 과제별 운영 자료는 항상 그 안에 둔다.

- `021_자동화설정_운영규칙`: 그 과제의 메일 라우팅 규칙 같은 운영 규칙 파일 자리. 규칙 파일은 `상태`(초안 vN → 확정)와 `Owner 확인 기록`을 안에 적어 두므로, 상태를 확인하려면 파일을 직접 열어 본다.
- `022_INBOX_원본수집`: 그 과제로 들어온 메일·원본 자료가 맨 처음 닿는 자리.
- `023_연락처_이해관계자`: 연락처, 조직, 담당자 같은 이해관계자 정보의 정본 자리.
- `027_수신이력_이동이력`: 메일 수신 이력과 파일 이동 이력을 append-only 로 쌓는 자리.

프로젝트 폴더 이름은 `project_code` 다음에 밑줄과 짧은 한글명을 붙이는 형태로, 코드가 항상 먼저 온다.

새 분류 기준이나 새 연락처 장부가 필요해 보여도 새 폴더 체계를 만들지 말고 이 고정 자리에 둔다. 자리를 못 찾겠으면 `docs/architecture/workspace/PROJECT_ONBOARDING_V0.md`의 관리 폴더 quick map을 먼저 확인한다.

## Expected readback and evidence

- The trainee can name the difference between source/asset, candidate, receipt, review, acceptance, task truth, and backup/restore.
- The trainee can identify that `HOLD`/`UNKNOWN` means stop and escalate rather than retry by using a wider permission or another tool.
- Any training evidence is a bounded training reference only; it is not a device enrollment, project approval, role grant, or production readiness receipt.

## HOLD / stop

Stop when a lesson would require private source material, credential entry, a real project/system write, an external connector, or an ambiguous access request. Stop when the trainer cannot identify the accountable owner or when the trainee asks to bypass a held gate.

## Rollback and escalation

There is no automatic enrollment rollback because this manual does not enroll anything. Preserve the safe training reference and escalate access, device, project, or role requests to the exact team/identity/project owner. Remove only the approved local training copy through the owning endpoint's separate procedure.

## Known issues

- This is an orientation candidate, not an account/device installation guide or a certification program.
- Passing public validators demonstrates contract health, not trainee competence or authorization.
- This candidate has no `last_verified_release` and no exercise receipt, so it cannot release a new-hire training path.
