# Deployment pack — 계약 + 첫 pack builder (isolated, 기본 산출물 없음)

Owner: `guild_hall/deployment_pack`. Status: `CURRENT = 계약 데이터 + validator + 테스트 + pack builder CLI(격리 install/smoke 증거까지)`; ring 승격·runbook 발행·서비스 기동·물리 ring은 전부 `TARGET`(Owner gate).

Program plan 12·16의 배포 규율을 코드로 고정한다: **"release는 폴더나 artifact가 존재한다는 뜻이 아니다."**

Pack builder는 HPP·Team Client·Backup-Recovery의 명세를 카탈로그에 고정된
emitter의 `--print` 결과와 비교한 뒤 빌드를 시작한다. 파일 목록·검토 pin·vendored
hash 등이 현재 트리와 다르면 `spec_drifted_from_tree`로 산출물을 쓰기 전에 거부한다.
명세 자체는 검사기를 바꾸거나 검사를 끌 수 없다. 직접 관리하는 나머지 Pack은
`not_recomputed_no_emitter`로 기록한다. 변경 내용을 검토한 뒤 현행 emitter로
재생성하며, 기존 SBOM·source/installed 검사·생애주기 검증은 그대로 적용한다.

`tools/detect_runtime_lane_drift.mjs`는 예약작업 action이 가리키는 Pack/source-lane
세대와 실제 상주 프로세스 세대를 읽기 전용으로 대조한다. 싱글턴 런처가 이전
세대를 유지한 채 `LastTaskResult=0`을 보고하는 경우도 구분하며 자동 재시작이나
재등록은 하지 않는다. 결과는 `drift`, `consistent`, `no_resident`, `unknown`이고
종료 코드는 차이 관찰 2, 차이 미관찰 0, 질의 실패 1이다. 0은 모든 lane 정상이나
release 수락을 뜻하지 않는다. `--observation <file>`로 저장된 관측을 재검토하고
`--json`은 원래 관측도 포함하므로 로컬 운영 자료로 취급한다.
실행은 `npm run guild-hall:runtime-lane-drift -- --help`, 합성 검증은
`npm run validate:runtime-lane-drift`이며 루트 validate·done-check에 연결된다.

`main_node`는 이 물리 PC의 **배포 topology 역할**이고, 기존 local bootstrap
identity `tool_pc`는 CAD/Office/EDA 작업과 Local Activity cadence를 위한 **작업
capability 역할**이다. 현행 단일값 bootstrap schema를 억지로 덮어쓰지 않으며,
Main Node profile이 Tool Workshop Cell을 포함해 두 역할의 결합을 명시한다.
따라서 `validate:role-boundary`의 `tool_pc`와 Main Node 배포 profile은 서로를
대체하지 않는다.

- **Pack 카탈로그 5종**(HPP Server / Team Client / Tool Workshop / Project AI Team / Backup-Recovery ext.): contains·must_not_contain 경계와 initial release gate를 pin. 금지물(평문 secret·raw project data·license secret·cross-project memory 등) 선언 시 fail-closed.
- **Project AI Team admission** (`src/project_ai_team_pack_admission.mjs`): future pack input만 준비한다. Project Mark는 별도 trusted authority pin/current state가 필요하고 manager·responsibility·specialist·common 각 slot은 현재 유효한 verified Agent binding을 각각 가져야 한다. role/capability/tool/authority/project/memory/runtime identity mismatch, duplicate Mark/Deployment/profile/session, expiry/revocation은 HOLD다. 출력은 refs-only binding/runtime input이며 profile/runtime/spec/release를 만들지 않는다.
- **릴리스 gate 사다리 15단** `build→unit→contract→integration→e2e→package→sbom→install→start→smoke→upgrade→rollback→restore→canary→acceptance` — 단조성 강제: gate N 주장에는 0..N 전 구간 evidence ref가 필요하다. `released` 상태는 acceptance까지 전 사다리, `release_candidate`는 최소 package 이상.
- **rollout ring 8단**(synthetic→…→broader) — 건너뛰기 금지, 승격마다 대상 release manifest·결정 ref·evidence bundle·support owner·rollback trigger·known issues 6종 필수(plan 12).
- **runbook 카탈로그 16종**(plan 16 exact order) — owner/전제/허용행동/evidence 출력/rollback 경로/버전 필수, secret material 내장 금지. `manuals/manual_release_catalog.v0.json`과 `src/manual_release_resolver.mjs`는 procedure ref를 semantic role·artifact digest·호환범위·last-verified release·exercise receipt에 결속한다. 16종 모두 actual Markdown+sha256이 있는 `candidate/current`이나 exercise·last-verified release가 없어 catalog/release는 HOLD다. build_pack integration은 후속 Gate다.
- **Manual HTML projection** (`src/manual_html_projection.mjs`) — approved Markdown+versioned image metadata를 deterministic self-contained accessible HTML/print view와 digest receipt로 변환하는 pure renderer. raw HTML/script, remote/local URL, missing alt/digest를 거부하며 별도 content authority를 만들지 않는다.
- **Internal RC prephysical readiness** (`src/internal_rc_prephysical_readiness.mjs`) — exact pack/product/manual/authority/recovery/binding evidence를 주입받아 exhaustive `HOLD` 또는 `READY_FOR_ONE_PHYSICAL_SEAT_GATE`만 반환하는 no-I/O binder. 현재 public evidence는 manual exercise·Human acceptance·device binding이 없어 HOLD다.
- secret_refs는 참조만: base64 자료처럼 보이는 값은 거부.

## Source-lane builder (`tools/build_source_lane.mjs`)

새 lane에 추적 코드만 필요하면 `carried_forward_prefixes: []`와 함께 이전 lane 없이
조립할 수 있다. 이때 이전 manifest digest와 이전 lane 검증 주장은 `null`이며, 기존
작업·프로필·메타데이터를 상속했다고 기록하지 않는다. 상속 prefix가 하나라도 있으면
기존처럼 `--previous-lane`과 그 manifest 검증이 필수다. 예시는
`lanes/tool_workshop_claude_acp_lane.spec.json`의 고정 코드 네 파일이며, 실제 봇 등록·
반출 허가·Node/Claude 설치와 별개다.
추적 코드 전용 spec에 불필요한 `--previous-lane`을 함께 지정하면 명시적으로 거부한다.

**Pack과 lane은 다른 물건이다.** Pack은 spec의 파일 목록과 byte pin을 입력으로 재현되며 HPP는 이미 명시된 vendored npm 의존성을 포함한다. Lane은 예약 작업이 실제로 실행하는 저장소 사본이고, tracked 파일 외에 **미추적 의존 closure**(`ui-workspace/node_modules/`, `node_modules/yaml/`)와 **gitignore된 빌드 산출물**(Board의 vite `dist/`)을 함께 담는다. Board의 전체 빌드 입력과 산출물 provenance는 아직 Pack spec에 선언되지 않았다.

운영 lane(`operations-lane-v2`, 2026-09-02 구축)은 `scratchpad/`의 스크립트로 조립되었고 그 스크립트는 D: 이관 과정에서 사라졌다. 결과: **아무도 lane을 다시 만들 수 없었고, 그 뒤 저장소에 들어온 수정은 전부 저장소에만 남았다.** 감시 시스템(watchtower·Board·usage meter)은 lane에만 존재하므로 release train이 아예 없는 상태였다. 이 도구는 그 구멍을 메운다.

무엇을 증명하는가:

- **tracked = 커밋 그 자체**: 복사할 바이트로 git blob object id를 재계산해 `ls-tree`의 oid와 대조한다. 작업 디렉터리가 커밋과 다른 파일은 lane에 들어올 수 없다. worktree가 clean해야 시작하므로 기록된 커밋이 lane 전체에 대한 참인 주장이다.
- **carried_forward = 증거를 동반한 상속**: 미추적 closure는 이전 lane에서 복사하되, **전량을 재해시해 그 lane 자신의 manifest와 대조한 뒤에만** 복사한다. 다시 만들지 않고, 그렇다고 믿지도 않는다.
- **origin은 파일당 하나**: tracked ∩ carried = ∅. spec 단계에서 carried prefix가 tracked path 안에 있으면 거부한다(해당 exclude가 선언된 경우만 허용).
- **validate-before-write**: 위 전부와 entry point 존재 확인이 끝나기 전에는 출력 1바이트도 쓰지 않는다. 쓴 뒤에는 방금 발행한 manifest로 전량 재해시한다.
- 경로 shape은 spec·git·이전 lane manifest **세 입력 모두**에 적용된다. dot-segment(`.`/`..`)는 문자 클래스만으로는 걸러지지 않으므로 별도 검사한다.

무엇을 하지 않는가: 예약 작업 등록·수정, 이전 lane 삭제, ring 승격, release gate 주장. **Cutover는 Owner 단계이며 복사가 아니라 묶음이다** — collector pin, binding digest, launcher, state digest fence, 그리고 recovery binding의 `action_digest` 재핀. 이 도구는 그 묶음의 입력만 만든다. 출력 디렉터리가 비어있지 않으면 거부하는 것도 같은 이유다(제자리 덮어쓰기는 탈락한 파일이 살아남는 경로다).

```
node guild_hall/deployment_pack/tools/build_source_lane.mjs \
  --spec guild_hall/deployment_pack/lanes/operations_lane.spec.json \
  --previous-lane <이전 lane 루트> --out <새 lane 루트> [--repo <저장소 루트>]

node guild_hall/deployment_pack/tools/build_source_lane.mjs --verify <lane 루트>
```

`--verify`는 lane을 자기 manifest로 전량 재해시한다(런타임이 추가한 미등재 파일은 무시). 검증: `npm.cmd run validate:source-lane`.

`dist/`를 carry forward 하는 것은 **이전 lane의 커밋 이후 Board 클라이언트 소스(`ui-workspace/apps/team-ops-board/src`, `src/server` 제외)가 바뀌지 않은 동안만** 정당하다. 바뀌었다면 vite 빌드를 다시 돌려 그 결과를 담은 lane을 previous-lane 입력으로 삼아야 한다. spec의 `carried_forward_rationale`에 같은 조건이 적혀 있다.

## Pack builder (`tools/build_pack.mjs`)

§3 위임의 isolated/default-OFF package 작업 범위에서 tracked spec(`packs/*.spec.json`) 1개를 미추적 `dist/`로 빌드한다. 규율:

- **validate-before-write**: 모든 파일 resolve·경로 shape 검사(절대·drive·traversal·dot-segment 금지)·secret-material 내용 스캔(경로만 보고, 내용 불보고; UTF-8 텍스트 전제라 향후 바이너리 payload에는 best-effort)·해시 계산과 **unit gate 통과**가 끝나기 전에는 출력 1바이트도 쓰지 않는다. spec의 role은 해당 pack의 `contains` 경계 안이어야 한다. 같은 outDir 재빌드는 pack dir를 먼저 비워 탈락 파일이 orphan으로 살아남지 못한다.
- **결정론**: `pack.manifest.json`은 timestamp 무포함 — 동일 입력이면 byte-동일 manifest·동일 `pack_digest`(정렬 파일목록의 canonical sha256). 시각은 receipt에만(주입 clock).
- **정직한 gate 주장**: 방출되는 `release.candidate.json`은 `status: draft`, `claimed_gate: contract`(build/unit/contract 증거만)이며 그 이상을 주장하지 않는다. 격리 install(digest **양방향** 전수 재검증 — manifest 밖 unmanifested 파일도 실패이며, 실패한 install은 복사본을 남기지 않는다)과 installed-copy 내부 smoke(validator 재실행; `--smoke`는 `--install-verify` 필수)는 **out-of-ladder receipt**로만 남는다 — integration/e2e/package/sbom/start gate가 정의되기 전에는 install/smoke ladder gate를 주장하지 않는다. gate evidence ref `evidence.<gate>.<digest 앞8>`은 `receipts/<gate>.receipt.json`과 digest-prefix 관례로 연결되는 opaque label이다(서명·변조방지는 주장하지 않음 — digest 재검증까지가 보증 범위). "release≠폴더 존재"는 builder에도 그대로 적용된다.
- **Scan-review 장부**(`content_scan_reviewed_files`): 인증·로그인 코드를 담는 pack은 "password" 같은 식별자를 정당하게 포함한다. spec은 secret-regex에 걸리는 파일을 **exact content pin**(path+sha256)으로 개별 등재할 수 있고, pin된 정확한 내용의 hit만 허용된다 — 파일이 1바이트라도 바뀌면 `scan_review_pin_stale`(재검토 강제), 더는 hit가 없는 pin은 `scan_review_pin_unused`(장부 부패 금지), pin 없는 hit는 기존대로 거부. 수용된 hit 수는 build receipt의 `content_scan`에 가시화된다. pin 등재 = "이 hit들이 식별자/합성 픽스처임을 검토했다"는 기록이므로 검토 없이 emit하지 않는다.
- **`test_concurrency`**: 제한 병렬로 설계된 suite(dev-erp=4 — 포트·임시DB 바인딩)는 spec이 동시성을 선언한다. 미선언 시 node 기본(per-CPU)이며, 넓은 머신에서 기본값이 suite를 충돌시키는 실사례가 이 필드를 만들었다(unit·smoke 양쪽 적용).
- **`test_cwd`**: 앱 디렉터리를 cwd로 전제하는 suite(dev-erp)를 위해 spec이 테스트 작업 디렉터리를 선언한다(unit=repo 기준, smoke=installed payload 기준; entries는 test_cwd 상대). 미선언 시 기존 동작.
- **HPP 공개 static 자산**: emitter는 Git에 추적된 일반 파일만 포함한다. `static/skins/README.md`가 로컬·비공개로 정한 `skins/dungeons/**`와 `skins/main.*`는 강제 추적되어도 제외하며, 공개 `skins/regions/*.svg` fallback은 포함한다. 로컬 scratch·ignored 이미지의 존재 여부가 후보 바이트를 바꾸지 않는다.
- **HPP 공통 runner closure**: ERP의 계산된 URL import가 요구하는 `workflow_runner`와 `report_authoring_v0`의 exact binding·code·policy·fixture·schema를 함께 담는다. emitter는 컴파일된 binding allowlist·bundle digest·Git 추적 여부를 검증하며, default route OFF와 candidate 상태는 그대로 유지한다. 설치본 회귀시험은 두 공통 runner 시험이 skip 없이 실제 실행되는지 확인한다.
- **Backup 설치본 의존성**: NAS DR schema 시험의 Ajv와 runtime 의존 4종은 `vendored_dependencies`로 함께 담는다. emitter는 HPP가 이미 검토·pin한 정확한 패키지 바이트만 재사용하고 hash 불일치·누락된 검토 pin은 거부한다. 실제 NAS runner 실행이나 backup 목적지 접속은 하지 않는다.
- tracked spec 4종: `packs/tool_workshop_pack.spec.json`, `packs/backup_recovery_extension.spec.json`(read-only topology v2 actual reader 포함), compatibility ID를 유지한 Universal Client `packs/team_client_pack.spec.json`(self-contained mTLS/MCP bundle과 durable outbox 포함), `packs/hpp_server_pack.spec.json`(dev-ERP와 Voice/Ingress/Local Activity 운영 entrypoint 및 shared runtime-path contract 포함). 현재 파일·smoke·pin 개수의 정본은 각 spec이며 emitter `--check`와 격리 후보 리허설 영수증이 실제 목록에서 계산한다. 모든 Pack은 reboot/driver/system-update를 금지하고 자기 서비스만 재기동할 수 있다. Project AI Team Pack은 actual approved input 전 absent다.
- **Current Backup-Recovery result boundary (2026-08-31):** the first bounded connected Linear run produced an immutable generation and exact-byte isolated restore copy, but remains `PARTIAL_TECHNICAL_RESTORE_CANDIDATE`; the new synthetic canary is a separate temp-only pre-physical proof. Missing history/evidence dimensions and absent actual Human Owner acceptance prevent any full-backup, recurring-operation, RPO/RTO or recovery-ready claim. Independent network effects remain `UNKNOWN`.
- **Installed-smoke 선언 파티션**(`installed_smoke_entries`/`installed_smoke_excluded`): 전체 suite를 청소 설치본에서 다 돌릴 수 없는 pack은 실행 가능한 부분집합과 사유 있는 제외 장부를 선언한다. 현재 HPP는 파일 제외 없이 vendored dependency와 git-free attestation으로 설치본 검증을 선언한다. 다만 개발 checkout 전용 mock Codex bridge·호스트 기능·외부 도구 조건은 test-level skip을 낼 수 있으므로 파일 제외 0은 시험 skip 0을 뜻하지 않는다. `release_rehearsal.mjs`는 실제 TAP 합계와 skip 이름을 기록하고 skip·todo·파일 제외가 하나라도 있으면 전체 리허설을 HOLD로 종료한다. manifest digest는 entries에서 재계산하고 외부 pin이 전달 채널 변조를 판정한다. CLI: `node guild_hall/deployment_pack/tools/build_pack.mjs --spec <spec> --out guild_hall/deployment_pack/dist [--install-verify <dir>] [--smoke]`.
- **격리 start/stop 증명**(`tools/prove_start_stop.mjs --target <설치 대상>`): hpp initial gate 문구("isolated install/**start/stop**/smoke/upgrade/rollback/restore proof")의 start/stop 다리. pre-gate로 강화 reader가 설치본 전 파일 byte+digest 재계산 검증(server.mjs 자신의 등재도 selfPath로 요구) → 쓰기 표면 전부를 `<target>/runtime_probe/`로 재지향하고 **env를 중화**(상속 `DEV_ERP_*` 전면 wipe 후 pin만 적용 — `DEV_ERP_SOURCE_COMMIT` 은폐·opt-in 번짐 차단; `GIT_DIR`류 strip + `GIT_CEILING_DIRECTORIES`로 dev 셸 git 문맥의 40-hex 강탈 차단; codex bridge=mock 고정, TLS/autosync off)한 채 **ephemeral port**로 기동 → `/api/health`의 attestation.source_commit이 manifest와 **동일한 64-hex pack digest**임을 요구(설치본이 40-hex git 신원을 답하면 실패 — 서버측 env→git→pack ladder의 라이브 증명) → 종료 후 exit 관측·port 실해방 확인 → **post-gate에서 강화 reader 재실행으로 재계산 digest가 pre-gate digest와 동일함을 요구한 뒤**(사이드카 manifest는 자식이 쓸 수 있는 위치라 단독 신뢰하지 않음 — 일관 개서는 `start_stop_identity_changed`로 거부) 양방향 byte-clean 재검증. 격리는 **구성상**(모든 쓰기 표면 재지향), 검증은 **payload byte-clean에 대해** — probe dir 밖·payload 밖 제3 위치 무쓰기는 주장하지 않는다. `start_stop.receipt.json`은 성공한 실행만 남기고(시작 시 이전 영수증 삭제) out-of-ladder receipt로서 start gate를 주장하지 않는다; stop은 플랫폼-정직 plan: posix에서는 SIGTERM→server의 shutdownDevErp handler→**exit 0을 assert**(`sigterm_graceful` — 아니면 `stop_not_graceful` 실패)하고, win32는 hard-terminate라 exit 관측+코드 기록만 하며 graceful은 not_claimed. posix 실행 자체는 이 호스트에 Linux node 런타임이 없어 environment-gated(packet은 plan-14).
- **Pack 생애주기**(`tools/pack_lifecycle.mjs backup|upgrade|rollback|restore`): initial gate 문구의 나머지 세 다리. 대상 모델은 현재 세대 `{pack.manifest.json, payload/}` + 보존 이전 세대 1개 `{pack.manifest.prev.json, payload.prev/}`(상시 rollback 경로). 규율: **verify-before-mutate**(모든 소스 세대를 digest 재계산+양방향 byte walk로 전수 검증한 뒤에야 대상 1바이트 변경 — 거부는 대상을 그대로 둠), **이전 세대 보존**(upgrade/rollback은 세대 swap이며 파괴 아님; 보존은 1세대 계약), **stale 영수증 선삭제**(모든 gate 앞 — 실패 실행 뒤 green 영수증 생존 불가), 모든 영수증 out-of-ladder. upgrade는 **깨끗한 현재 세대를 요구**(보존될 prev가 rollback 약속이므로; 손상 복구는 restore 소관), rollback은 **손상된 현재에서도 동작**하되 검증 불가 세대는 manifest 없이 보존해 roll-forward를 거부한다(검증할 수 없는 세대는 rollback 약속이 아님). backup은 검증된 현재 세대의 검증된 사본(점유된 backup dir 거부는 기존 backup의 영수증도 건드리지 않음), restore는 검증된 backup으로 손상 대상 재구축. **crash 원자성은 주장하지 않는다**: swap 창(rename 사이)에서 중단되면 `payload.next`/`payload.swap`/무-payload 상태가 남을 수 있고, 이후 모든 op는 coded로 거부하며(`rollback_half_swap_residue` 등 — 잔여물이 유일 사본일 수 있어 자동 정리하지 않음) 복구는 backup에서 restore다. manifest 엔트리는 builder와 동일한 repo-상대 경로 shape만 허용(traversal-shaped 엔트리로 payload 밖 읽기 유도 불가 — attestation reader도 동일). 이는 **코드 payload 생애주기**(격리 evidence 대상 안)이며 runtime 데이터면 backup/restore는 `guild_hall/backup_controller` 소관 그대로다.

## 파일 SBOM (`src/pack_sbom.mjs`, `tools/pack_sbom.mjs`)

완성된 코드 payload의 **전 파일 SHA-256·길이·정확한 파일집합**을 확인한 뒤 CycloneDX 1.6 파일 구성명세를 만든다. `createPackSbom`/`verifyPackSbom`의 입력은 exact manifest bytes, expected manifest SHA-256, 그 manifest가 가리키는 동일한 실제 payload root다. 별도 metadata root나 전수검사 생략 모드는 없다. 모든 `package.json`은 검증된 그 payload에서만 읽고 name/version과 bounded dependency/license 선언을 담는다. npm 배포물 해시나 해석된 runtime graph로 바꾸지 않으며 URL 해석·다운로드도 하지 않는다. 절대 host 경로·URL credential/query data·관계없는 JSON 필드는 산출물에 복사하지 않는다.

생성기는 bytes와 byte-bound evidence만 반환한다. builder가 payload 완성 후 형제 파일 `pack.sbom.cdx.json`·`pack.sbom.receipt.json`을 쓰고 build receipt에 manifest SHA·SBOM SHA를 결속한다. payload 밖 파일이므로 기존 `pack_digest` recipe는 유지된다. 새 manifest는 `sbom_policy: required_cyclonedx_1_6`을 선언한다. 알 수 없는 정책, 필수 sidecar의 일부/전체 삭제, 다른 세대 BOM, receipt 변조는 거부한다. `VERIFIED`는 exact manifest에 이 정책이 선언된 경우에만 가능하다. 정책 없는 legacy 팩은 전 파일을 확인하되 sidecar가 없어도(`legacy_sbom_absent`), 정합한 sidecar가 있어도(`legacy_sbom_policy_absent`) `NOT_VERIFIED`로 남긴다. sidecar가 있으면 bytes·receipt 정합성 검사는 유지하여 손상되거나 거짓 `VERIFIED` receipt는 거부한다. unsigned manifest 자체와 marker를 함께 재작성하는 공격은 독립적인 expected-manifest pin/승인된 전달 채널이 잡아야 하며 이 구현은 출처 인증을 만들지 않는다.

install·backup·upgrade·rollback·restore는 manifest 원본 bytes와 SBOM/receipt를 같은 세대로 복사·보존·교환하고 다시 검증한다. 이전 세대는 `pack.manifest.prev.json`·`pack.sbom.prev.cdx.json`·`pack.sbom.prev.receipt.json`·`payload.prev/`다. 손상 세대는 기존 계약대로 payload만 보존하며 다음 rollback의 검증된 약속으로 표시하지 않는다. 기존 git-free source identity reader는 알려진 marker를 호환하고 알 수 없는 marker를 거부하지만, source identity만으로는 SBOM을 검증하지 않았으므로 `sbom_verification: NOT_VERIFIED`를 반환한다. 실제 SBOM 정합성은 별도 verifier/생애주기 receipt가 소유한다.

[고정 공식 스키마](vendor/cyclonedx-1.6/README.md)는 CycloneDX commit `595d98f16159bdf7463adc140509ded479130b8b`의 BOM·JSF·SPDX 3개와 Apache 2.0 LICENSE 원본이다. 네 파일 SHA를 실행마다 확인하며 기존 Ajv 의존성으로 로컬 ref만 검증한다. 네트워크 loader가 없고, 공식 schema가 버전 string만 검사하므로 `1.6`은 별도 확인한다. 현재 파일 inventory profile이 사용하지 않는 string format이 실제 입력에서 실행되면 무시하지 않고 거부한다. 임의 외부 BOM 검증기나 전자서명 검증기로 주장하지 않는다.

경로 traversal·Windows alias·symlink/junction·hardlink·관찰된 read identity 변경을 거부한다. 한 파일 64 MiB, descriptor 256 KiB, manifest 16 MiB, BOM 64 MiB, payload 합계 512 MiB, 파일 50,000개와 디렉터리 항목/깊이 제한을 적용한다. 호출자는 검사 동안 디렉터리 쓰기를 통제해야 한다. 적대적 OS 동시 변경 전체 방어나 crash 원자성은 보장하지 않는다.

```text
node guild_hall/deployment_pack/tools/pack_sbom.mjs --pack <pack-dir> --manifest-sha256 <expected-64-hex>
node guild_hall/deployment_pack/tools/pack_sbom.mjs --pack <pack-dir> --manifest-sha256 <expected-64-hex> --create
node --test guild_hall/deployment_pack/tests/pack_sbom.test.mjs
```

기본 CLI는 읽기/검사뿐이다. `--create`는 manifest의 SBOM 정책 선언을 요구하며 marker 없는 legacy 입력을 쓰기 전에 거부한다. manifest를 개정하거나 정책을 추가하지 않는다. 선언된 팩에서도 새 sidecar 생성 또는 exact bytes 재사용만 허용하며 기존 다른 bytes를 덮어쓰거나 고치지 않는다. legacy 미검증은 sidecar 유무와 관계없이 CLI exit 1이며 파일 inventory의 `VERIFIED`는 전체 Plan 12 `sbom` gate 통과가 아니다. runtime graph `UNKNOWN`, vulnerability/license approval `NOT_RUN`, release acceptance `NOT_GRANTED`를 유지하고 release candidate의 주장도 기존 `contract`에 머문다.

## 격리 후보 리허설 (`tools/release_rehearsal.mjs`)

HPP 0.1.11 후보는 소나 인텔을 선택 실행 앱으로 포함한다. 전용 closure helper가
실행 코드·고정 자료·검사를 수집하고, dev-ERP의 시험 bridge가 오프라인 검사를
설치본에서도 같은 위치에서 실행한다. 별도 Pack 종류나 자동 수집은 추가하지 않는다.
[소나 설치·자료 복구 안내](manuals/sonar_intel_install_recovery.v0.md)는 기존 HPP
운영 매뉴얼에서 연결한다. Tool Workshop은 고정 HWPX 구조 후보와 필요한 Python
fixture·기본 양식 파일을 함께 포장하며 실제 Hancom 렌더는 별도 미완료 범위다.

표준 리허설의 `--workshop-test-config`는 기존 합성 5필드를 유지한다. 그 안의
`pythonExecutable`을 PPTX와 HWPX의 source/installed 시험에 함께 전달한다.
부모 환경에서 임의 도구 설정을 가져오지 않으며 설정 부재는 계속 SKIP/HOLD다.
PDF 파일·페이지 검사도 실행할 때는 `--workshop-pdf-renderer <pdftoppm 절대경로>`를
같이 지정한다. 기존 5필드 JSON은 그대로 전달하며 별도 PDF selector만 전달하고
renderer 실행파일 hash를 영수증에 남긴다. Python의 lxml/pypdf/Pillow와 Poppler는
미리 준비된 외부 실행 자원이며 Pack에 재배포하지 않는다. 이 검사는 합성 PDF를
사용하며 실제 한글 기동이나 임시 예약작업·registry 변경을 자동 승인하지 않는다.

운영·교육 매뉴얼은 설치본의 `payload/guild_hall/deployment_pack/manuals/`에도
들어간다. HPP는 서버·업무·봇 운영 안내, Team Client는 설치·사용과 세 교육 안내,
Backup/Recovery는 자료 복구·경로·저장 지도 안내, Tool Workshop은 공방 안내를
담는다. 기존 16역할 catalog의 문서마다 적어도 하나의 배달 경로가 있고 각 Pack의
설치·업데이트·되돌리기 안내가 해당 Pack 안에 있는지, 실제 설치 bytes의 catalog
해시까지 검사한다. 문서 배달 확인을 사람 실습이나 매뉴얼 출시 수락으로 대신하지 않는다.

`node guild_hall/deployment_pack/tools/release_rehearsal.mjs`는 현재 HPP·Team Client·Backup-Recovery·Tool Workshop spec을 순서대로 확인하고 실제 기본 Node runner로 source unit과 선언된 installed smoke **전부**를 실행한다. `--pack <pack_id>`로 하나만 실행할 수 있으며 `--work-dir <아직 존재하지 않는 디렉터리>`를 생략하면 새 임시 디렉터리를 만든다. 기존 경로·checkout 내부·운영/보호 경로·junction 부모는 거부하며 운영 lane이나 등록기는 호출하지 않는다. Node 24+와 필요한 의존성은 실행 전 설치되어 있어야 한다. 각 suite는 최대 10분으로 제한되며 로그·실패 영수증도 보존한다. Tool Workshop은 실제 작성기·공유 envelope·Python child·기존 PPTX 치환 코드까지 포장하며 선언된 시험을 source와 설치본에서 실행한다. 실제 PPTX·HWPX 시험에는 `--workshop-test-config <합성5필드JSON>`으로 명시한 외부 Python·렌더러·템플릿이 필요하다. 이 값은 해당 공방 시험에만 전달되고 영수증에는 config digest만 기록하며 외부 런타임은 재배포하지 않는다. 필수 실행 설정이 없으면 해당 시험의 skip과 HOLD를 보존한다. 리허설은 코드 팩의 복구 근거이며 실행 중인 작업 장부의 운영 백업이나 사람의 매뉴얼 수락을 뜻하지 않는다.

Windows native 경로 잠금은 신원 검증된 절대 로컬 경로를 extended-length Win32 경로로 전달하므로 260자를 넘는 artifact staging 경로도 같은 guard로 검증한다. 상대·UNC·device·dot-segment 입력을 새로 해석하지 않으며, 긴 경로·짧은 경로·신원 및 junction 경계 회귀시험을 유지한다. 파일 symlink 권한이 없는 호스트의 explicit skip은 그대로 실패 근거에 남긴다.

격리 Windows 프로필은 `home/AppData/Local`·`home/AppData/Roaming`을 실제로 만들고 환경값도 같은 경로로 맞춘다. PowerShell의 native known-folder API가 빈 경로를 반환해 캐시를 payload 작업 폴더에 만드는 현상을 막으며, native 경로 회귀시험과 installed byte readback으로 확인한다.

HPP는 설치본에서 loopback 임시 포트 기동·health digest·종료를 관찰한다. 각 Pack의 backup→upgrade→rollback→손상 후 restore는 동일 후보에서 명시적으로 파생한 **합성 이전 세대**와 실제 후보 사이의 서로 다른 byte digest로 검증한다. 보존 세대까지 파일 전수 해시를 다시 읽고 손상 세대는 manifest 없이 남았는지 확인한다. 합성 이전 세대는 과거 release의 실행 증거가 아니다.

Smoke 후 무결성 실패는 오염된 설치본과 경로 목록을 보존해 기록한다. 독립 start/stop은 같은 후보 digest의 별도 새 설치본에서 계속하며, 그 성공이 smoke 무결성 실패를 없애지는 않는다.

`release-rehearsal.receipt.json`에는 source commit/dirty 여부·spec hash·manifest hash·pack digest·실제 시험 합계·skip·각 세대 readback이 남는다. 상속 환경은 OS 실행 필수값만 허용하고 테스트 home/temp/state를 리허설 안으로 지정한다. 보장은 지정된 경로 구성과 packed bytes readback에 한정되며 외부 파일시스템 전체 무변경이나 실제 운영 데이터 DR은 주장하지 않는다. skip·실패·관찰하지 못한 합계는 성공으로 바꾸지 않는다. `release_state: candidate`를 유지하고 manual exercise·물리 좌석·Human acceptance는 `not_executed`로 남긴다.

검증: `npm.cmd run validate:deployment-pack` / `node --test guild_hall/deployment_pack/tests/release_rehearsal.test.mjs` / `validate:manual-release` / `validate:manual-projection` / `validate:internal-rc-prephysical` / `validate:project-ai-team-pack-admission` / 관련 정본: plan 12·16과 Owner 지시문 §20(Release Gate), `guild_hall/engineering_engine/topology/engine_release.json`(엔진 release manifest 선례).
