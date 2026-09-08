# HPP Server operator — Owner-PC one-seat candidate

- Artifact ref: `artifact.manual.hpp_server_operator.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog state: `candidate` / `current`; no verified release or user-exercise acceptance is recorded.

## Purpose

Build and inspect the HPP Server Pack in an approved isolated one-seat canary. This runbook produces only bounded build, install, smoke, start/stop, lifecycle, and escalation evidence. It does not declare a released service.

### 응답 대기 관리

발행된 Buzz 업무 reader가 연결된 서버에서는 작업대의 “응답 대기함”으로 이동한다.
실제로 전달된 질문과 응답할 사람·대기 시간·Buzz 링크를 확인하고 읽음이나 미루기를
설정한다. 미루기는 보기 설정이며 업무 일시정지·답변·재개가 아니다. 답변은 같은 Buzz
대화에서 하고 실제 답변 관측으로 대기가 해제되는지 확인한다.

별도 viewer도 기존 Owner 세션을 재확인한다. 상단 복귀·로그인 링크는 연결된 원본
서버를 가리킨다. 보기 선호는 viewer의 기존 ERP DB 백업에 포함하고 원본 인증 DB와
native control DB를 변경하지 않는다. 상태 미확인은 완료나 Owner 응답 대기로 판단하지
않는다. “Buzz 질문 전달 확인”은 원래 질문의 전송 근거이며 추가 알림 설치를 뜻하지 않는다.

## Prerequisites

The pack also carries Sonar Intel as an optional Main Node application. Follow
[its installation and data recovery procedure](sonar_intel_install_recovery.v0.md)
for an explicit loopback start with a separate working-data directory. Installing
the pack does not start Sonar, schedule collection or authorize external sources.
Code rollback and Sonar data-generation restore are separate operations; a
restored collection stays disabled until its budget and source state are reconciled.

- The Owner has approved the exact one-seat canary and supplied an isolated target and backup destination outside this manual.
- The requested pack version is compatible with the catalog range and the HPP pack specification is unchanged for the run.
- The operator has the approved role and can read the resulting receipts. Credential material, production service activation, and external connector authority are out of scope.

## Allowed and forbidden actions

- Allowed: deterministic validation, isolated pack build, installed-copy smoke, start/stop proof, and a bounded lifecycle rehearsal after the canary gate is open.
- Forbidden: publishing a release, treating a smoke result as human acceptance, changing network/firewall/service registration, or copying source, project, or credential material into a receipt.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:deployment-pack
npm.cmd run validate:pack-sbom
node guild_hall/deployment_pack/tools/build_pack.mjs --spec guild_hall/deployment_pack/packs/hpp_server_pack.spec.json --out APPROVED_STAGING_OUTPUT --install-verify APPROVED_ISOLATED_TARGET --smoke
node guild_hall/deployment_pack/tools/pack_sbom.mjs --pack APPROVED_ISOLATED_TARGET --manifest-sha256 EXPECTED_MANIFEST_SHA256
node guild_hall/deployment_pack/tools/prove_start_stop.mjs --target APPROVED_ISOLATED_TARGET
node guild_hall/deployment_pack/tools/pack_lifecycle.mjs backup --target APPROVED_ISOLATED_TARGET --backup APPROVED_ISOLATED_BACKUP
```

- `guild_hall/deployment_pack/tools/build_pack.mjs` provides `buildPack`, `verifyInstalledCopy`, `installPack`, and `runInstalledSmoke`.
- `guild_hall/deployment_pack/tools/prove_start_stop.mjs` provides `proveStartStop` and `assertStartHealth`.
- `guild_hall/deployment_pack/tools/pack_lifecycle.mjs` provides `backupPack`, `upgradePack`, `rollbackPack`, and `restorePack`.

Do not supply a real target to a lifecycle command until the exact Owner-PC canary gate is approved.

## Expected readback and evidence

- Pack manifest digest and installed-copy verification agree.
- The independently retained expected manifest hash matches the manifest bytes.
  New packs declare `sbom_policy: required_cyclonedx_1_6`; the verifier checks the
  complete payload against the file SBOM and pinned offline CycloneDX 1.6 schema.
  `pack.sbom.cdx.json` and `pack.sbom.receipt.json` stay beside the manifest and
  must follow the same generation through backup, upgrade, rollback and restore.
- Missing, changed or mixed-generation required sidecars are a HOLD. A legacy
  manifest without the policy remains `NOT_VERIFIED`, even with valid sidecars;
  do not use `--create` to silently upgrade that policy. File verification is
  separate from runtime dependency completeness, vulnerability/license audits,
  signature authentication, human acceptance and release promotion.
- Smoke and start/stop receipts show the requested pack digest, without any release or production claim.
- A lifecycle rehearsal, if separately approved, reports a retained previous generation or a bounded restore result.
- Record only opaque receipt references and digests in the release packet.

## HOLD / stop

Stop and keep the result `HOLD` when the canary approval, compatibility, isolated target, digest readback, smoke, start/stop proof, or receipt is missing or mismatched. A runtime or network failure is an incident input, not permission to change host configuration.

## Rollback and escalation

Use `pack_lifecycle.mjs rollback` only for the approved isolated target with a verified previous generation. If rollback cannot verify the previous generation, stop and escalate the exact receipt and hold code to the HPP service owner; use a verified backup restore only under its separate approval.

## Known issues

### 개발 관리 조회 사용

설치된 조회 설정이 준비되면 현재 World Tree 계정으로 로그인하고 상단 **개발 관리**를
연다. 화면은 관리자로 지정된 과제의 개선 작업 결과·검토 기록·운영 알림을 보여준다.
로컬에 기록된 결과, Buzz 전달 확인, 사람의 수락은 서로 다른 상태다. 결과가 있다는
이유로 업무가 공식 완료되거나 사람이 답해야 할 요청이 자동 생성되지는 않는다.

전달 여부가 불명확하면 운영 담당자가 보존된 전달 영수증을 확인한다. 전달 DB를
지우거나 같은 알림을 다시 보내서 불확실성을 해소하지 않는다. 권한 철회·만료는
새 조회부터 적용된다. 설치자는 [서버의 개발 관리 조회 설정](../../../ui-workspace/apps/dev-erp/README.md)을
따르며 설정이 없거나 잘못되면 비활성/조회 불가를 표시한다. 이 화면을 여는 것만으로
작업자·전달기가 실행되거나 새 저장소가 만들어지지 않는다.

- Existing evidence is isolated and synthetic; it is not an Owner-PC installation or user acceptance.
- On Windows, stop observation is not a graceful-stop claim.
- This candidate has no `last_verified_release` and no exercise receipt, so it cannot release a pack.
