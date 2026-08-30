# Deployment pack contract — pack·release gate·ring·runbook 계약 (contract only)

Owner: `guild_hall/deployment_pack`. Status: `CURRENT = 계약 데이터 + validator + 테스트`; 실제 pack build·install·ring 승격·runbook 발행은 전부 `TARGET`(별도 leaf, 물리 ring은 Owner gate).

Program plan 12·16의 배포 규율을 코드로 고정한다: **"release는 폴더나 artifact가 존재한다는 뜻이 아니다."**

- **Pack 카탈로그 5종**(HPP Server / Team Client / Tool Workshop / Project AI Team / Backup-Recovery ext.): contains·must_not_contain 경계와 initial release gate를 pin. 금지물(평문 secret·raw project data·license secret·cross-project memory 등) 선언 시 fail-closed.
- **릴리스 gate 사다리 15단** `build→unit→contract→integration→e2e→package→sbom→install→start→smoke→upgrade→rollback→restore→canary→acceptance` — 단조성 강제: gate N 주장에는 0..N 전 구간 evidence ref가 필요하다. `released` 상태는 acceptance까지 전 사다리, `release_candidate`는 최소 package 이상.
- **rollout ring 8단**(synthetic→…→broader) — 건너뛰기 금지, 승격마다 대상 release manifest·결정 ref·evidence bundle·support owner·rollback trigger·known issues 6종 필수(plan 12).
- **runbook 카탈로그 13종**(plan 16 표) — owner/전제/허용행동/evidence 출력/rollback 경로/버전 필수, secret material 내장 금지.
- secret_refs는 참조만: base64 자료처럼 보이는 값은 거부.

검증: `npm.cmd run validate:deployment-pack` / 관련 정본: plan 12·16과 Owner 지시문 §20(Release Gate), `guild_hall/engineering_engine/topology/engine_release.json`(엔진 release manifest 선례).
