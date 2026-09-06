# Deployment pack — 계약 + 첫 pack builder (isolated, 기본 산출물 없음)

Owner: `guild_hall/deployment_pack`. Status: `CURRENT = 계약 데이터 + validator + 테스트 + pack builder CLI(격리 install/smoke 증거까지)`; ring 승격·runbook 발행·서비스 기동·물리 ring은 전부 `TARGET`(Owner gate).

Program plan 12·16의 배포 규율을 코드로 고정한다: **"release는 폴더나 artifact가 존재한다는 뜻이 아니다."**

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

**Pack과 lane은 다른 물건이다.** Pack은 tracked 파일만의 순수 함수라 spec에서 전부 재현된다. Lane은 예약 작업이 실제로 실행하는 저장소 사본이고, tracked 파일 외에 **미추적 의존 closure**(`ui-workspace/node_modules/`, `node_modules/yaml/`)와 **gitignore된 빌드 산출물**(Board의 vite `dist/`)을 함께 담는다. 그래서 pack builder로는 만들 수 없다.

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
- tracked spec 4종: `packs/tool_workshop_pack.spec.json`(4 파일), `packs/backup_recovery_extension.spec.json`(**82 파일·26 smoke·제외 0·pin 22**, read-only topology v2 actual reader 포함), compatibility ID를 유지한 Universal Client `packs/team_client_pack.spec.json`(**19 파일·5 smoke·pin 3**, self-contained mTLS/MCP bundle과 durable outbox 포함), `packs/hpp_server_pack.spec.json`(**1,022 파일·95 smoke entry·pin 72**, dev-ERP와 Voice/Ingress/Local Activity 운영 entrypoint 및 shared runtime-path contract 포함). 모든 Pack은 reboot/driver/system-update를 금지하고 자기 서비스만 재기동할 수 있다. Project AI Team Pack은 actual approved input 전 absent다.
- **Current Backup-Recovery result boundary (2026-08-31):** the first bounded connected Linear run produced an immutable generation and exact-byte isolated restore copy, but remains `PARTIAL_TECHNICAL_RESTORE_CANDIDATE`; the new synthetic canary is a separate temp-only pre-physical proof. Missing history/evidence dimensions and absent actual Human Owner acceptance prevent any full-backup, recurring-operation, RPO/RTO or recovery-ready claim. Independent network effects remain `UNKNOWN`.
- **Installed-smoke 선언 파티션**(`installed_smoke_entries`/`installed_smoke_excluded`): 전체 suite를 청소 설치본에서 다 돌릴 수 없는 pack은 실행 가능한 부분집합과 사유 있는 제외 장부를 선언한다. current tracked hpp는 **95 entry + 파일 제외 0**이며 vendored dependency와 git-free attestation으로 청소 설치본 검증을 실행한다. 이 중 개발 checkout에서만 허용되는 mock Codex bridge 시험 7개는 runtime checkout의 production 거부 경계를 약화하지 않도록 test-level explicit skip으로 기록되고, 동일 시험은 source unit gate에서 실제 실행된다. manifest digest는 entries에서 재계산하고 외부 pin이 전달 채널 변조를 판정한다. CLI: `node guild_hall/deployment_pack/tools/build_pack.mjs --spec <spec> --out guild_hall/deployment_pack/dist [--install-verify <dir>] [--smoke]`.
- **격리 start/stop 증명**(`tools/prove_start_stop.mjs --target <설치 대상>`): hpp initial gate 문구("isolated install/**start/stop**/smoke/upgrade/rollback/restore proof")의 start/stop 다리. pre-gate로 강화 reader가 설치본 전 파일 byte+digest 재계산 검증(server.mjs 자신의 등재도 selfPath로 요구) → 쓰기 표면 전부를 `<target>/runtime_probe/`로 재지향하고 **env를 중화**(상속 `DEV_ERP_*` 전면 wipe 후 pin만 적용 — `DEV_ERP_SOURCE_COMMIT` 은폐·opt-in 번짐 차단; `GIT_DIR`류 strip + `GIT_CEILING_DIRECTORIES`로 dev 셸 git 문맥의 40-hex 강탈 차단; codex bridge=mock 고정, TLS/autosync off)한 채 **ephemeral port**로 기동 → `/api/health`의 attestation.source_commit이 manifest와 **동일한 64-hex pack digest**임을 요구(설치본이 40-hex git 신원을 답하면 실패 — 서버측 env→git→pack ladder의 라이브 증명) → 종료 후 exit 관측·port 실해방 확인 → **post-gate에서 강화 reader 재실행으로 재계산 digest가 pre-gate digest와 동일함을 요구한 뒤**(사이드카 manifest는 자식이 쓸 수 있는 위치라 단독 신뢰하지 않음 — 일관 개서는 `start_stop_identity_changed`로 거부) 양방향 byte-clean 재검증. 격리는 **구성상**(모든 쓰기 표면 재지향), 검증은 **payload byte-clean에 대해** — probe dir 밖·payload 밖 제3 위치 무쓰기는 주장하지 않는다. `start_stop.receipt.json`은 성공한 실행만 남기고(시작 시 이전 영수증 삭제) out-of-ladder receipt로서 start gate를 주장하지 않는다; stop은 플랫폼-정직 plan: posix에서는 SIGTERM→server의 shutdownDevErp handler→**exit 0을 assert**(`sigterm_graceful` — 아니면 `stop_not_graceful` 실패)하고, win32는 hard-terminate라 exit 관측+코드 기록만 하며 graceful은 not_claimed. posix 실행 자체는 이 호스트에 Linux node 런타임이 없어 environment-gated(packet은 plan-14).
- **Pack 생애주기**(`tools/pack_lifecycle.mjs backup|upgrade|rollback|restore`): initial gate 문구의 나머지 세 다리. 대상 모델은 현재 세대 `{pack.manifest.json, payload/}` + 보존 이전 세대 1개 `{pack.manifest.prev.json, payload.prev/}`(상시 rollback 경로). 규율: **verify-before-mutate**(모든 소스 세대를 digest 재계산+양방향 byte walk로 전수 검증한 뒤에야 대상 1바이트 변경 — 거부는 대상을 그대로 둠), **이전 세대 보존**(upgrade/rollback은 세대 swap이며 파괴 아님; 보존은 1세대 계약), **stale 영수증 선삭제**(모든 gate 앞 — 실패 실행 뒤 green 영수증 생존 불가), 모든 영수증 out-of-ladder. upgrade는 **깨끗한 현재 세대를 요구**(보존될 prev가 rollback 약속이므로; 손상 복구는 restore 소관), rollback은 **손상된 현재에서도 동작**하되 검증 불가 세대는 manifest 없이 보존해 roll-forward를 거부한다(검증할 수 없는 세대는 rollback 약속이 아님). backup은 검증된 현재 세대의 검증된 사본(점유된 backup dir 거부는 기존 backup의 영수증도 건드리지 않음), restore는 검증된 backup으로 손상 대상 재구축. **crash 원자성은 주장하지 않는다**: swap 창(rename 사이)에서 중단되면 `payload.next`/`payload.swap`/무-payload 상태가 남을 수 있고, 이후 모든 op는 coded로 거부하며(`rollback_half_swap_residue` 등 — 잔여물이 유일 사본일 수 있어 자동 정리하지 않음) 복구는 backup에서 restore다. manifest 엔트리는 builder와 동일한 repo-상대 경로 shape만 허용(traversal-shaped 엔트리로 payload 밖 읽기 유도 불가 — attestation reader도 동일). 이는 **코드 payload 생애주기**(격리 evidence 대상 안)이며 runtime 데이터면 backup/restore는 `guild_hall/backup_controller` 소관 그대로다.

## Runtime lane drift detector (`tools/detect_runtime_lane_drift.mjs`)

**예약작업의 인자 문자열은 실행 코드의 증거가 아니다.** 2026-09-06 0.1.9 cutover에서 `Soulforge-HPP-Voice-ASR-Label`은 `install/server-pack/0.1.6/payload`를 광고하면서, 실제 작업은 09-01에 뜬 `install/server-pack/0.1.2/payload`의 powershell·node 쌍이 하고 있었고 15분마다 `LastTaskResult=0`을 남겼다. 음성 ASR·라벨 감독기와 연속 ingress 감독기는 싱글턴이다 — `<state>\*.instance.lock` 배타 잠금과 명명 뮤텍스(`Threading.Mutex`)를 잡고, 이미 잡혀 있으면 "duplicate launch ignored"를 찍고 rc=0으로 끝난다. 그래서 새 팩으로 재등록해도 문자열만 바뀌고 옛 세대 감독기가 그대로 상주하며, rc=0은 거짓 초록이다. Local Activity 런처에는 lease가 없어 그 rc=0은 진짜 완료다.

무엇을 증명하는가 (전부 읽기 전용):

- **광고 세대**: `Soulforge-` 접두사 예약작업마다 action 문자열이 가리키는 `install/server-pack/<x.y.z>/payload` 또는 `install/source-lanes/<lane>-vN`. `Get-ScheduledTask` 개체의 이름 붙은 속성만 읽고 `schtasks /query` 텍스트는 파싱하지 않는다(이 호스트에서 CSV/LIST 출력이 깨진다). `LastTaskResult`는 int64로 받는다(`0xC000013A` 같은 값이 int32를 넘친다). 런처 경로가 세대를 정하고, 같은 action 안에 다른 세대가 섞여 있으면 `advertised_mixed_generations`다.
- **상주 세대**: `Win32_Process.CommandLine`에 런처의 모듈 루트(예 `guild_hall/voice_capture/`, `ui-workspace/apps/dev-erp/` — 뒤 슬래시까지 비교해 `dev-erp-mcp/`와 섞이지 않음)가 들어 있는 프로세스와 그 자손. 자손은 생성 시각이 부모보다 앞서면 PID 재사용으로 보고 채택하지 않는다. 고아가 된 worker도 자기 경로에 모듈 루트가 있으므로 직접 잡힌다. 세대를 읽을 수 없는 프로세스(checkout 실행 등)는 `resident_unversioned_process`로 따로 센다.
- **판정**: 두 세대가 다르면 `drift`, 같으면 `consistent`, 상주 프로세스가 없으면 `no_resident`, 광고 세대를 읽을 수 없으면 `unknown`. 런처 소스에 `instance.lock`·`Threading.Mutex`·"duplicate launch ignored" 중 하나라도 있으면 `singleton_launcher`로 표시해 rc=0을 근거로 읽지 말라고 알린다. 같은 세대라도 상주 host 프로세스의 sha256 pin 집합이 action과 다르면 `resident_digest_set_differs`(바인딩·프로필 드리프트). 어느 예약작업에도 붙지 않은 세대 프로세스는 `unattributed_versioned_processes`로 남긴다.

무엇을 하지 않는가: 예약작업을 멈추거나 시작하거나 등록·해제하지 않고, 프로세스를 죽이지 않으며, 파일을 쓰지 않는다. 호스트 호출은 PowerShell 조회 1회(`Get-ScheduledTask`·`Get-ScheduledTaskInfo`·`Get-CimInstance Win32_Process`)와 발견한 런처 **스크립트** 읽기뿐이다(바인딩·자격증명 파일은 확장자 검사로 열지 않는다). 판정은 관찰이며 rebind·정지 결정은 lane runbook과 Owner 몫이다. 자손 프로세스는 자기 명령행에 Soulforge 경로가 있을 때만 관측되고, 공백이 든 스크립트 경로는 인식하지 못한다(`launcher_unknown`).

```
node guild_hall/deployment_pack/tools/detect_runtime_lane_drift.mjs                  # 사람용 표 · exit 0=드리프트 없음, 2=드리프트, 1=조회 실패
node guild_hall/deployment_pack/tools/detect_runtime_lane_drift.mjs --json           # 전체 보고(관찰 원본 포함 — 호스트 경로·pin이 들어 있으므로 private 취급)
node guild_hall/deployment_pack/tools/detect_runtime_lane_drift.mjs --observation <저장한 --json 보고>   # 재판정(비-Windows에서도)
```

검증: `npm run validate:runtime-lane-drift`(합성 관찰만, 루트 `validate`·`done:check` 게이트 포함). 2026-09-06 이 호스트 실측(exit 2): 음성 lane `drift`(0.1.6 광고 / 0.1.2 상주 ×2, 09-01부터, lease `supervisor.instance.lock`), 연속 ingress·World Tree `0.1.9`·Vigil `operations-lane-v4`·Tongs `tongs-lane-v2` `consistent`, 나머지 `no_resident`, NAS DR `unknown`(legacy checkout).


검증: `npm.cmd run validate:deployment-pack` / `validate:manual-release` / `validate:manual-projection` / `validate:internal-rc-prephysical` / `validate:project-ai-team-pack-admission` / 관련 정본: plan 12·16과 Owner 지시문 §20(Release Gate), `guild_hall/engineering_engine/topology/engine_release.json`(엔진 release manifest 선례).
