# Deployment pack — 계약 + 첫 pack builder (isolated, 기본 산출물 없음)

Owner: `guild_hall/deployment_pack`. Status: `CURRENT = 계약 데이터 + validator + 테스트 + pack builder CLI(격리 install/smoke 증거까지)`; ring 승격·runbook 발행·서비스 기동·물리 ring은 전부 `TARGET`(Owner gate).

Program plan 12·16의 배포 규율을 코드로 고정한다: **"release는 폴더나 artifact가 존재한다는 뜻이 아니다."**

- **Pack 카탈로그 5종**(HPP Server / Team Client / Tool Workshop / Project AI Team / Backup-Recovery ext.): contains·must_not_contain 경계와 initial release gate를 pin. 금지물(평문 secret·raw project data·license secret·cross-project memory 등) 선언 시 fail-closed.
- **릴리스 gate 사다리 15단** `build→unit→contract→integration→e2e→package→sbom→install→start→smoke→upgrade→rollback→restore→canary→acceptance` — 단조성 강제: gate N 주장에는 0..N 전 구간 evidence ref가 필요하다. `released` 상태는 acceptance까지 전 사다리, `release_candidate`는 최소 package 이상.
- **rollout ring 8단**(synthetic→…→broader) — 건너뛰기 금지, 승격마다 대상 release manifest·결정 ref·evidence bundle·support owner·rollback trigger·known issues 6종 필수(plan 12).
- **runbook 카탈로그 13종**(plan 16 표) — owner/전제/허용행동/evidence 출력/rollback 경로/버전 필수, secret material 내장 금지.
- secret_refs는 참조만: base64 자료처럼 보이는 값은 거부.

## Pack builder (`tools/build_pack.mjs`)

§3 위임의 isolated/default-OFF package 작업 범위에서 tracked spec(`packs/*.spec.json`) 1개를 미추적 `dist/`로 빌드한다. 규율:

- **validate-before-write**: 모든 파일 resolve·경로 shape 검사(절대·drive·traversal·dot-segment 금지)·secret-material 내용 스캔(경로만 보고, 내용 불보고; UTF-8 텍스트 전제라 향후 바이너리 payload에는 best-effort)·해시 계산과 **unit gate 통과**가 끝나기 전에는 출력 1바이트도 쓰지 않는다. spec의 role은 해당 pack의 `contains` 경계 안이어야 한다. 같은 outDir 재빌드는 pack dir를 먼저 비워 탈락 파일이 orphan으로 살아남지 못한다.
- **결정론**: `pack.manifest.json`은 timestamp 무포함 — 동일 입력이면 byte-동일 manifest·동일 `pack_digest`(정렬 파일목록의 canonical sha256). 시각은 receipt에만(주입 clock).
- **정직한 gate 주장**: 방출되는 `release.candidate.json`은 `status: draft`, `claimed_gate: contract`(build/unit/contract 증거만)이며 그 이상을 주장하지 않는다. 격리 install(digest **양방향** 전수 재검증 — manifest 밖 unmanifested 파일도 실패이며, 실패한 install은 복사본을 남기지 않는다)과 installed-copy 내부 smoke(validator 재실행; `--smoke`는 `--install-verify` 필수)는 **out-of-ladder receipt**로만 남는다 — integration/e2e/package/sbom/start gate가 정의되기 전에는 install/smoke ladder gate를 주장하지 않는다. gate evidence ref `evidence.<gate>.<digest 앞8>`은 `receipts/<gate>.receipt.json`과 digest-prefix 관례로 연결되는 opaque label이다(서명·변조방지는 주장하지 않음 — digest 재검증까지가 보증 범위). "release≠폴더 존재"는 builder에도 그대로 적용된다.
- 첫 tracked spec: `packs/tool_workshop_pack.spec.json` (4 파일). CLI: `node guild_hall/deployment_pack/tools/build_pack.mjs --spec <spec> --out guild_hall/deployment_pack/dist [--install-verify <dir>] [--smoke]`.

검증: `npm.cmd run validate:deployment-pack` / 관련 정본: plan 12·16과 Owner 지시문 §20(Release Gate), `guild_hall/engineering_engine/topology/engine_release.json`(엔진 release manifest 선례).
