# ERP Codex 팀 작업실 운영

## 한 문장 구조

Soulforge `_workspaces`가 유일한 논리 프로젝트 본체다. ERP runtime은 업무 원문을
소유하지 않는 껍데기/read model이며, ERP 할일의 Codex 스레드는 처음 선택한
`workspace_id + workspace revision + root fingerprint`에 고정된다.

## 개인 Codex ERP MCP와 중앙 Codex worker의 구분

중앙 Codex worker는 ERP 내부 할일 대화 패널을 위한 저권한 read-only 실행면이다.
`dev-erp-mcp`는 팀원이 자기 PC의 개인 Codex에서 자기 ERP 계정으로 오늘/내일 일정,
업무, 메일, artifact를 조회하고 구조화 작업 결과나 완성 파일을 ERP에 전달하는 별도
실행면이다. 개인 Codex의 모델 사용량은 각 팀원 계정에 귀속되고 sidecar는 LLM을 호출하지
않는다. 이 연결은 중앙 worker의 MCP/hooks/network 금지나 workspace write 권한을
넓히지 않는다.

개인 PC 파일은 원격 MCP가 경로로 직접 읽지 않는다. 개인 Codex가 로컬에서 size/hash를
계산하고 MCP로 1회용 URL만 준비한 뒤 bytes는 raw HTTPS PUT로 보낸다. 중앙 ERP는
service-owned `_workspaces/system/dev-erp/mcp-artifacts` inbox에 먼저 저장하며, 공유
worksite나 공식 산출 폴더로의 승격은 별도 승인이다. 상세 계약은
[`slices/ERP-MCP-V0.md`](slices/ERP-MCP-V0.md)를 따른다.

## 파일의 실제 위치

- ERP 서버 코드는 별도 runtime checkout에 있다.
- 업무 원문과 산출물의 논리 진입점은 Soulforge `_workspaces/<과제>/...` 하나다.
  실제 바이트는 owner-approved OneDrive/NAS/팀 PC worksite에 있고 `_workspaces`가
  junction/symlink로 이를 materialize할 수 있다. 물리 위치가 달라도 두 번째 논리
  프로젝트 본체를 만들지 않는다.
- 대화 본문과 업로드 첨부는 Soulforge `_workspaces/system/dev-erp/...`의
  ERP 서비스 전용 보관영역에 두며, 팀 공유폴더 안에는 ERP가 파일을 만들지 않는다.
- worker 저장소에는 정적 sanitized workspace projection과 현재 메시지의 선택 첨부만
  담는 single-active turn projection만 둔다. 둘 다 재생성 가능한 실행 재료이며
  영구 대화·첨부·프로젝트 원본을 두지 않는다.
- ERP runtime의 `DATA/`는 runtime-local 보조파일 전용이다. 프로젝트 body나 Codex
  payload owner로 쓰지 않는다. NAS/Z 영역은 backup/restore 전용이며 live body가 아니다.
- ERP DB에는 대화/첨부의 opaque pointer, 논리 작업실 ID, 매핑 해시,
  승인/감사 메타데이터만 저장한다. 대화 본문은 SQLite에 넣지 않는다.
- UNC 경로, 로컬 절대경로, SMB 자격증명은 브라우저 응답·공개 저장소·감사 로그에
  기록하지 않는다.

## Runtime-local 등록부

기본 위치는 `ui-workspace/apps/dev-erp/data/codex-workspaces.runtime.json`이며
`data/`는 Git에서 제외된다. 다른 위치를 쓰려면
`DEV_ERP_CODEX_WORKSPACE_REGISTRY`를 설정한다.

아래 값은 형식 설명용 합성 예시다.

```json
{
  "schema": "dev_erp.codex_workspace_registry.v1",
  "machine_id": "erp-runtime-01",
  "trust_domain_id": "erp-team-shared",
  "workspaces": [
    {
      "workspace_id": "p26_014_hw",
      "label": "P26-014 회로설계 자료",
      "root_kind": "unc",
      "root": "\\\\HW-PC-01\\ApprovedShare\\P26-014",
      "default_access": "read-only",
      "enabled": true,
      "allowed_project_ids": ["P26-014"],
      "allowed_account_ids": ["acc_hw_team"],
      "allowed_roles": ["admin"],
      "allowed_write_prefixes": ["Output", "Review/Approved"]
    }
  ]
}
```

운영에서는 mapped drive보다 UNC를 우선한다. 서비스/예약 작업은 사용자 로그인
세션의 drive mapping을 보지 못할 수 있기 때문이다. 등록부에는 credential,
password, token 같은 secret을 넣지 않는다.
한 등록부의 enabled root는 local 또는 UNC 한 종류만 사용한다. UNC는 모두 같은
대소문자 무시 `server/share` namespace의 서로 겹치지 않는 하위폴더여야 한다.
다른 share나 trust domain은 별도 worker·등록부로 분리한다.

`allowed_project_ids`는 필수이며 비어 있을 수 없다. 활성 row는
`allowed_account_ids` 또는 `allowed_roles`도 반드시 가져야 한다. 역할만으로 여는
경우는 `admin`만 허용하며, 팀원 작업실은 계정 ID를 명시한다. 계정 ID와 admin
역할을 함께 두면 둘 중 하나가 일치할 때만 열린다. 이 allowlist와 raw root는
capability 응답에 노출되지 않는다.

`allowed_write_prefixes`는 이 workspace에서 Codex가 쓸 수 있는 최대 범위다. 생략하거나
빈 배열이면 영구적으로 읽기 전용이다. ERP 관리자의 시간제 write grant는 이 목록 안의
같은 경로 또는 하위 경로에만 발급할 수 있다. 실제 파일 접근의 최종 상한은 이 등록부와
worker Windows 계정의 NTFS/SMB ACL 중 더 좁은 쪽이다.
브라우저는 현재 로그인 계정과 현재 할일의 과제에 허용된 `workspace_id + label`만
받는다. 등록부에 workspace가 하나뿐이어도 자동 선택하지 않으며, 새 스레드 연결 전
사용자가 직접 선택하고 고정 사실을 확인해야 한다.

`trust_domain_id`도 필수다. 한 등록부의 모든 workspace는 **동일한 OS 읽기 권한
영역**이어야 한다. `allowed_account_ids`/`allowed_roles`는 ERP UI의 표시·라우팅
경계이지 파일 기밀성 경계가 아니다. Codex worker 계정이 작업실 A와 B를 모두 읽을
수 있다면 A 사용자도 알려진 B 경로를 요청할 수 있으므로, A와 B의 열람자가 다르면
등록부·worker 계정·서비스 인스턴스를 분리한다.

Enabled workspace root끼리는 문자열상 동일·상하위 경로뿐 아니라 realpath, filesystem
object(dev/ino), junction/share alias 기준으로도 겹치면 등록을 거부한다. 이 검사는 raw
UNC를 명령줄이나 출력에 넣지 않는 별도 child process에서 수행하며, 오프라인 SMB가
멈추면 제한시간 뒤 child를 종료하고 `workspace_root_isolation_timeout`으로 fail-closed한다.

## 접근 경계

1. 브라우저는 원시 경로가 아닌 `workspace_id`만 보낸다.
2. ERP는 매 턴 선택된 workspace의 revision과 binding fingerprint를 다시 비교한다.
   다른 workspace의 label/allowlist 변경은 기존 스레드를 막지 않지만, 선택된 root
   변경은 중단한다.
3. 공유 폴더가 offline이거나 mapping이 바뀌면 다른 폴더로 fallback하지 않고
   중단한다.
4. 첫 production slice의 sandbox는 read-only다. 기존 `danger-full-access` API는
   비활성화하고 write prefix가 하나라도 오면 `workspace_write_unsupported`로 중단한다.
5. 향후 쓰기를 열려면 별도 설계·검토에서 output-only writeback, 충돌·승인·회수 계약을
   먼저 확정해야 한다. 현재 등록부의 legacy write grant는 worker 권한을 넓히지 않는다.
6. Codex sandbox의 network access는 끈다.
7. 계정 bootstrap 전 또는 익명 세션에서는 Codex 조회·스레드·메시지·첨부·승인을
   모두 차단한다.
8. 첨부는 브라우저에 item-bound opaque ID만 반환한다. 서비스 전용 보관영역에서
   배타적으로 생성하고 실제 경로, 저장 파일명, SHA-256은 서버 manifest에서만
   사용하며 매 턴 item/크기/hash/realpath를 재검증한다. `.hwp`는 직접 읽지 않고
   owner-approved worksite에서 HWPX로 전처리한 뒤 `.hwpx`만 첨부한다.
9. 대화 원문은 서비스 전용 `_workspaces` payload store에 item-bound opaque ref로
   저장한다. ERP DB와 item 목록에는 본문이나 Codex thread ID를 넣지 않는다.

Codex의 cwd 선택이나 `read-only` sandbox만으로 호스트 전체의 읽기 권한을 제거할
수는 없다. 따라서 실제 읽기 경계는 **ERP HTTP/메일 프로세스와 분리된 저권한 Codex
worker Windows 계정**과 SMB/NTFS ACL이 담당해야 한다. worker 계정에는 한
`trust_domain_id`의 승인 공유폴더만 읽게 하고 ERP DB, mailbox credential,
`private-state`, 개인 프로필과 다른 과제 비밀영역은 OS ACL로 거부한다. worker는
Soulforge의 canonical attachment/message root를 읽지 않는다. ERP만 원본을 검증하고
현재 메시지에서 선택된 파일을 disposable projection으로 복사한다. 서로 다른 기밀영역은
별도 worker/등록부로 분리한다. 계정/SMB secret은 사용자가 Windows에 직접 설정하며
ERP JSON이나 Git에 복사하지 않는다.

worker가 시작하는 각 Codex app-server는 `dev_erp_bounded` named permission profile을
강제한다. 이 profile은 전체 디스크를 기본 거부하고 canonical payload root와 worker
부모를 명시적으로 deny한 뒤, 정적 sanitized cwd와 현재 projection의 검증된 파일만
다시 read로 연다. network는 비활성화한다. app-server가 돌려준
`activePermissionProfile`, `runtimeWorkspaceRoots`, 빈 `instructionSources`를 매 turn
확인한다. worker 시작 시 turn-projection probe v4는 workspace read, bounded write
carveout, 원본 첨부·다른 projection read 거부, projection write/delete/move 거부,
junction/hardlink 우회와 network 거부를 실제 실행한다. Probe가 통과한 Codex runtime의
aggregate SHA-256은 owner 기대값에 고정되고 health/attestation/model discovery/turn
전후에 다시 계산한다. 이 probe가 실패하거나 실행 파일이 바뀌면
`worker_permission_boundary_unproven`으로 기동을 중단하고 release audit도 차단한다.
현재 개발 PC의 Codex 0.144.1 native Windows sandbox는 shell subprocess가 원본 첨부를
읽는 것을 막지 못해 probe v4가 실패한다. OpenAI의 native Windows managed `deny_read`
안내도 shell subprocess read는 그 규칙을 사용하지 않는다고 명시한다. 따라서 실제 팀
PC에서 별도 저권한 identity의 NTFS/SMB ACL까지 통과하기 전에는 production 배포하지
않는다. WSL/container는 별도 구현과 검증이 필요한 향후 후보다.

정적 workspace projection은 owner-approved source에서 선택·검증된 범위만 담는 sanitized
read-only cwd다. turn projection root는 전체에서 한 번에 하나의 project/revision만 허용하고,
선택 첨부만 copy+rehash한 뒤 원자적으로 publish한다. manifest·descriptor·receipt에는
원본 절대경로가 없으며 stale/tampered/sibling entry가 있으면 새 turn을 막는다. 종료 시
전체를 다시 검증한 뒤 root를 빈 폴더로 되돌린다. metadata-only preflight만으로 TOCTOU를
없앨 수 없으므로 source 쪽은 ERP identity만 읽고 worker는 OS ACL로 거부해야 한다.

worker identity와 저장소 밖 전용 `DEV_ERP_CODEX_HOME` 환경에서 아래 명령을 먼저 실행한다.
출력은 경로나 secret 없이 `proven/source/error`와 aggregate revision만 담는다.

```powershell
npm.cmd run dev-erp:probe-codex-permission-boundary
```

Codex worker에는 개인 Codex home을 재사용하지 말고 전용 Windows 실행계정과 전용
`DEV_ERP_CODEX_HOME`을 지정한다. production worker는 skill을 항상 0개로 실행한다.
전용 home에는 hooks/plugins/marketplaces/rules/AGENTS/MCP connector를 두지 않으며,
legacy sandbox 설정이 profile을 덮지 않도록 `config.toml`도 두지 않는다.
팀 workspace 루트에도 `.codex`, `AGENTS.md`, `AGENTS.override.md`를 두지 않는다.
Codex 프로젝트 지침 탐색은 bridge 설정에서도 비활성화한다. Codex 인증은 그 전용
실행계정으로 사용자가 직접 수행한다.

현재 저장소의 직접 `app-server` spawn은 개발·검증용 `in_process` 경로다. 실제 팀
운영은 별도 Windows identity의 `dedicated_worker` broker가 배치되고 live health가
그 경계를 증명하기 전까지 release audit가 의도적으로 차단한다.

## 두 Windows identity와 시작 순서

두 프로세스는 같은 Windows 계정으로 실행하지 않는다.

| identity | 가져야 하는 권한 | 가지면 안 되는 권한 |
| --- | --- | --- |
| ERP HTTP/메일 서비스 | runtime DB, 메일 설정, Soulforge ERP payload 영역 | 팀 공유폴더, worker Codex 인증/profile |
| Codex worker 서비스 | 전용 Codex home, 한 trust domain의 승인 공유폴더, 승인된 출력 하위폴더 | ERP DB, 메일 secret, `private-state`, 다른 trust domain, 개인 profile |

먼저 Codex worker identity로 Codex 로그인을 완료하고, secret token은 ACL이 제한된
Windows service secret 설정을 통해 두 서비스에 같은 값으로 주입한다. token을
명령줄 인자, Git 파일, 등록부, DB, 로그에 적지 않는다. 아래는 필요한 환경 이름과
시작 순서를 보여주는 자리표시자 예시다.

HMAC/HKDF 키는 암호학적 난수 32바이트를 canonical base64url(패딩 없음, 정확히 43자)로
한 번 생성해 승인된 Windows service secret store에 바로 저장한다. 생성값을 화면에
출력하거나 shell history에 남기지 않는다. 같은 값을 ERP와 worker 두 service secret에
주입한 뒤 생성 변수는 즉시 지운다. 실제 secret-store 명령은 현장 backend에 따라
다르므로 저장소 문서에 값이나 완성 명령을 기록하지 않는다.

```powershell
# Codex worker Windows identity의 서비스 환경
$env:DEV_ERP_CODEX_WORKER_HOST="127.0.0.1"
$env:DEV_ERP_CODEX_WORKER_PORT="4391"
$env:DEV_ERP_CODEX_WORKER_BRIDGE="app-server"
$env:DEV_ERP_CODEX_WORKER_TOKEN="<32-byte-base64url-HMAC-HKDF-key>"
$env:DEV_ERP_CODEX_WORKER_REF_KEYS_JSON='{"active_kid":"2026q3","keys":{"2026q3":"<32-byte-base64url>"}}'
$env:DEV_ERP_CODEX_WORKER_ATTEST_PRIVATE_KEY_FILE="<worker-only-ed25519-private-key.pem>"
$env:DEV_ERP_CODEX_HOME="<codex-worker-home>"
$env:DEV_ERP_CODEX_TURN_PROJECTION_ROOT="<worker-root>\turn-projections"
$env:DEV_ERP_CODEX_WORKSPACE_REGISTRY="<runtime-root>\ui-workspace\apps\dev-erp\data\codex-workspaces.runtime.json"
$env:DEV_ERP_CODEX_TRUST_DOMAIN="<trust-domain-id>"
$env:DEV_ERP_CODEX_TASK_ATTACHMENT_ROOT="<soulforge-root>\_workspaces\system\dev-erp\codex-task-attachments"
$env:DEV_ERP_CODEX_MESSAGE_PAYLOAD_ROOT="<soulforge-root>\_workspaces\system\dev-erp\codex-message-payloads"
$env:DEV_ERP_CODEX_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256="<owner-approved-codex-runtime-sha256>"
npm.cmd run dev-erp:codex-worker
```

Codex 설치가 바뀌지 않은 상태에서 먼저 아래 metadata-only 명령으로 aggregate runtime
fingerprint만 구한다. 이 값은 절대 실행 경로, 개별 파일 hash, 인증 자료를 출력하지 않는다.
owner가 값을 승인한 뒤 worker와 ERP 양쪽의
`DEV_ERP_CODEX_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256`에 같은 값으로 고정한다.

```powershell
node ui-workspace/apps/dev-erp/tools/codex_dedicated_worker.mjs --codex-runtime-identity-fingerprint
```

Codex CLI를 업데이트할 때는 worker를 먼저 중지하고, 새 fingerprint와 permission probe를
검토한 뒤 기대값을 갱신하고 재시작한다. 실행 중 파일이나 PATH가 바뀌면 기존 probe 결과를
재사용하지 않고 turn을 차단한다.

owner는 worker identity에서 `whoami.exe` 이름을 소문자로, SID를 대문자로 정규화한
`SHA-256(utf8(name + NUL + SID))`를 한 번 계산해 ERP 서비스의 기대값으로 둔다.
release audit는 이 값의 형식과 live 일치 여부만 기록하며 실제 hash·계정명·token은
출력하지 않는다.

```powershell
# ERP HTTP/메일 Windows identity의 서비스 환경
$env:DEV_ERP_CODEX_TASK_BRIDGE="worker"
$env:DEV_ERP_CODEX_WORKER_URL="http://127.0.0.1:4391"
$env:DEV_ERP_CODEX_WORKER_TOKEN="<same-32-byte-base64url-HMAC-HKDF-key>"
$env:DEV_ERP_CODEX_WORKER_EXPECTED_IDENTITY_HASH="<expected-worker-identity-sha256>"
$env:DEV_ERP_CODEX_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256="<same-owner-approved-codex-runtime-sha256>"
$env:DEV_ERP_CODEX_WORKER_ATTEST_PUBLIC_KEY_FILE="<erp-readable-ed25519-public-key.pem>"
$env:DEV_ERP_CODEX_WORKER_EXPECTED_ATTESTATION_KEY_ID="<approved-public-key-sha256>"
$env:DEV_ERP_BACKEND_ROOT="<soulforge-root>"
$env:DEV_ERP_CODEX_TURN_PROJECTION_ROOT="<worker-root>\turn-projections"
$env:DEV_ERP_CODEX_WORKSPACE_REGISTRY="<runtime-root>\ui-workspace\apps\dev-erp\data\codex-workspaces.runtime.json"
$env:DEV_ERP_CODEX_TRUST_DOMAIN="<trust-domain-id>"
$env:DEV_ERP_CODEX_TASK_ATTACHMENT_ROOT="<soulforge-root>\_workspaces\system\dev-erp\codex-task-attachments"
$env:DEV_ERP_CODEX_MESSAGE_PAYLOAD_ROOT="<soulforge-root>\_workspaces\system\dev-erp\codex-message-payloads"
node ui-workspace/apps/dev-erp/server.mjs --host 127.0.0.1 --port 4300
```

release 전에는 `--codex-worker-url http://127.0.0.1:4391`,
`--codex-worker-expected-identity-sha256 <expected-worker-identity-sha256>`,
`--codex-worker-expected-runtime-identity-sha256 <owner-approved-codex-runtime-sha256>`,
`--codex-worker-attestation-public-key <public-key-file>`,
`--codex-worker-expected-attestation-key-sha256 <approved-public-key-sha256>`, UNC가 있으면
`--codex-share-boundary-receipt <metadata-only-receipt.json>`을 포함한
`dev-erp:audit-runtime --require-live`를 실행한다. audit는 dedicated boundary,
worker ready/release/identity, owner-pinned Codex runtime, nonce 서명, source commit,
별도 process, registry revision, single-active projection root, denied-root revision,
ERP가 exact canonical attachment/message lexical root로 독립 계산한 pathless
`payload_deny_binding_revision` 일치, turn-projection permission profile과 실제
원본/다른 projection read 거부 probe,
`app-server` mode가 모두 맞지 않으면 차단한다.
UNC receipt는 raw path 없이 registry revision, worker identity, probe v4, server-side share
non-overlap, ADS 정리, 24시간 이내 sentinel 결과와 `acl_turn_lock` 또는
`immutable_projection`을 결박한다.

worker token 원문은 전송하지 않고 요청/응답의 경로·본문 hash·시각·일회용 nonce를
검증하는 HMAC 키로만 쓴다. 실제 turn은 worker가 서명해 발급한 일회용 channel nonce도
필요하다. 실제 operation의 요청·응답 JSON은 이 HMAC 키와 signed channel에서
HKDF-SHA256으로 파생한 일회용 키로 AES-256-GCM 암호화하므로 loopback port를 선점한
다른 process도 업무 본문을 읽거나 위조할 수 없다. HTTP redirect도 거부한다.
실제 Codex thread ID는 이 HMAC 키와 분리된 AES-256-GCM keyring으로 암호화한
`dwr2.<kid>.*` ref 안에만 존재한다. HMAC 키 회전은 기존
ref를 무효화하지 않는다. ref key 회전은 새 active key와 이전 key를 함께 둔 뒤 worker를
재시작하고, 모든 기존 binding이 새 key로 다시 발급된 것을 확인한 다음 이전 key를
제거한다. ref keyring을 잃으면 기존 ref는 복구할 수 없으므로 binding을 retire하고 새
스레드를 열어야 한다. 어떤 경우에도 in-process나 다른 workspace로 fallback하지 않는다.

worker 개인키는 worker 계정만 읽고, ERP는 공개키만 읽는다. ERP는 각 실제 turn 직전과
직후에 새 nonce를 서명받고 동일한 worker process/source/boundary인지 확인한 뒤에만
결과를 저장한다. ERP 프로세스에는 worker attestation 개인키와 ref keyring을 주입하지
않는다.

### 레거시 Codex 전환

기존 inline message가 남은 DB는 표준 v1 coherent backup이 fail-closed한다. 전환
중에는 maintenance lock을 유지하고 ERP 서비스와 전용 Codex worker를 모두 중지한다.

모든 불완전 binding을 retire하는 방안을 검토할 때만 metadata-only planner를 사용한다.

```powershell
npm.cmd run dev-erp:migrate-legacy-codex -- --plan-retire-all --db <runtime-db> --expected-count <owner-confirmed-legacy-binding-count>
npm.cmd run dev-erp:migrate-legacy-codex -- --plan-retire-all --db <runtime-db> --expected-count <owner-confirmed-legacy-binding-count> --expected-candidate-sha256 <reviewed-candidate-sha256>
```

planner는 complete binding을 제외하고 `core_item.project_id`가 확인된 불완전
binding만 candidate에 넣는다. 유효하지만 오래된 binding project는 current item
project로 덮어쓰지 않고 candidate v2 각 retirement의
`observed_binding_project_id`, `binding_project_status: mismatch`와
`binding_project_mismatch_count`에 기록되어 실제 관찰값까지 candidate hash에 포함된다.
다른 runtime binding 필드가 모두 완전하고 project만 다른 행은 candidate로 낮추지 않고
실패한다. count 불일치, 유효하지 않은 project, candidate hash drift는 중단 조건이다. 출력은
`candidate_only: true`이며 owner 승인이나 apply 권한을 만들지 않고, `--apply`,
`--mapping`, `--payload-root`와 함께 사용할 수 없다.

실제 migration 적용 전에는 v2 pre-migration generation을 만들고 같은 generation을
격리된 restore namespace에서 검증한다.

```powershell
npm.cmd run dev-erp:backup-codex-payloads-pre-migration -- --db <runtime-db> --attachment-root <soulforge-root>\_workspaces\system\dev-erp\codex-task-attachments --message-root <soulforge-root>\_workspaces\system\dev-erp\codex-message-payloads --backup-root <nas-root>\03_codex_payload_backups
node ui-workspace/apps/dev-erp/tools/codex_payload_backup.mjs pre-migration-restore-verify --backup-root <nas-root>\03_codex_payload_backups --generation-id <pre-migration-generation-id> --restore-root <nas-root>\04_codex_payload_restore_tests
```

v2는 complete externalized message와 pure legacy inline message의 혼합을 허용하지만
부분적인 `payload_ref`/length/hash 상태는 거부한다. legacy body는 WAL-safe SQLite
snapshot에만 남고 `generation-manifest.v2.json`에는
`id/item_id/role/byte_length/sha256` metadata만 기록된다. v2는 rollback evidence일
뿐 release evidence가 아니다.

owner가 별도로 작성한 정확한 mapping으로 dry-run과 apply를 실행한다. payload root는
Soulforge의 ERP 전용 영역이다.

```powershell
npm.cmd run dev-erp:migrate-legacy-codex -- --db <runtime-db> --payload-root <soulforge-root>\_workspaces\system\dev-erp\codex-message-payloads --mapping <owner-approved-mapping.json>
npm.cmd run dev-erp:migrate-legacy-codex -- --db <runtime-db> --payload-root <soulforge-root>\_workspaces\system\dev-erp\codex-message-payloads --mapping <owner-approved-mapping.json> --apply
```

적용 뒤 두 서비스가 계속 중지된 상태에서 표준 v1 backup과 `restore-verify`를 새
generation으로 다시 실행한다. release audit는 v2 generation을 의도적으로 인정하지
않으며, 이 post-migration v1 evidence만 release 경계를 충족한다.

## 모델 선택

ERP는 모델 이름을 하드코딩하지 않고 전용 worker가 연결한 `codex app-server`의
`model/list`를 캐시로 읽는다. 따라서 **worker identity의 Codex 계정**이 GPT-5.6을
제공하면 해당 slug와 모델별 reasoning effort가 UI에 나타나고 기본 선택도 5.6이 된다.
실제 turn 직전 worker의 최신 목록에서 자동 선택한 5.6이 사라진 경우에만 GPT-5.5로
내린다. 이때 기존 effort가 GPT-5.5에 없으면 GPT-5.5가 실제 광고한 effort 중 `high`,
모델 기본값, 첫 허용값 순으로 다시 선택한다. effort 변경도 turn 결과 metadata에 남긴다.
사용자가 5.6을 직접 선택했다면 모델이나 effort를 몰래 바꾸지 않고 오류로 중단한다.
감사 장부에는 요청 모델, 실제 모델, 자동/직접 선택, fallback 여부를 각각 기록한다.

현재 Codex CLI가 호스트 설정을 파싱하지 못하면 ERP가 `~/.codex/config.toml`을
자동 편집하지 않는다. 예를 들어 더 이상 지원되지 않는
`service_tier = "default"`가 있으면 사용자가 해당 줄을 직접 제거한 후 ERP를
재시작해야 한다.

## 실제 팀 폴더 등록에 필요한 owner 입력

코드만으로 팀 PC의 실제 공유 위치와 사람별 권한을 추측하지 않는다. 배포 전에 owner가
아래 형식으로 한 줄씩 확정한다.

```text
표시 이름 | PC 이름 또는 UNC 경로 | 실제 폴더 | 읽기만/쓰기 대상 하위폴더 | 사용할 과제·사용자
예: P26-014 설계자료 | HW-PC-01 | <approved-share-root>\<project-code> | 읽기만; Output만 쓰기 | P26-014; account-a
```

이 입력으로 Windows share/NTFS ACL을 먼저 만들고, 같은 범위를 registry의
`allowed_project_ids`, `allowed_account_ids`, `allowed_write_prefixes`로 좁혀 등록한다.
실제 ACL 확인 전에는 샘플 경로나 추정 경로로 production 배포하지 않는다.

## 등록 전 확인표

- 팀 PC 폴더가 별도 share로 공개되어 있고 UNC로 접근되는가
- ERP 실행 Windows 계정에 필요한 read 권한만 있는가
- ERP HTTP/메일 계정과 Codex worker 계정이 분리됐는가
- Codex worker가 전용 Windows 계정과 전용 `DEV_ERP_CODEX_HOME`으로 실행되는가
- 한 등록부의 모든 폴더가 같은 `trust_domain_id`인가
- worker ACL이 ERP DB/mail secret/private-state, canonical payload root 및 다른 trust domain을 거부하고 현재 turn projection만 읽게 하는가
- live health의 `codex_worker_payload_deny_binding_match`가 `true`이며, 서명값이 ERP의 exact-root 독립 계산값과 일치하는가
- 전용 home에 hooks/plugins/marketplaces/MCP connector가 없는가
- 전용 home이 source/runtime/team workspace 밖에 있고 `config.toml`이 없으며 turn-projection probe v4가 `proven:true`인가
- owner 승인 Codex runtime fingerprint가 worker와 ERP 기대값에 같게 고정됐는가
- enabled workspace root끼리 lexical/realpath/junction/share alias가 겹치지 않고 bounded isolation 검사가 통과하는가
- enabled root가 local/UNC를 섞지 않고 UNC라면 하나의 server/share namespace만 쓰는가
- 실제 UNC별 sentinel preflight와 turn 중 mutation 차단 ACL 또는 immutable projection 영수증이 있는가
- 첫 production slice에서 write grant가 전부 거부되고, projection root가 turn 종료 뒤 비워지는가
- 각 row에 정확한 `allowed_project_ids`와 필요한 계정/역할 allowlist가 있는가
- 등록부의 label/workspace ID가 과제와 사람에게 명확한가
- 브라우저 capability 응답에 raw UNC/local root가 없는가
- 브라우저 첨부 응답과 DB/event에 raw path와 hash가 없는가
- ERP DB의 `codex_thread_message.text`가 opaque payload ref만 가지는가
- offline, mapping 변경, 만료/철회 grant가 모두 fail-closed하는가
- 실제 Codex 계정의 model list와 선택한 모델로 합성 smoke turn이 성공하는가
