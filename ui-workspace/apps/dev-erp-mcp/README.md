# Soulforge dev-ERP MCP sidecar

## 팀원 PC 1회 등록 도구

`ingress:mtls-enrollment`은 client private key를 HPP에서 만들거나 복사하지
않는다. `prepare`는 팀원 PC의 미리 보호된 로컬 디렉터리에 key와 CSR을 만들고,
HPP로 전달 가능한 공개 request/CSR 경로만 반환한다. `sign`은 HPP에서 CSR hash를
대조한 뒤 clientAuth 인증서만 만든다. `finalize`는 팀원 PC에서 반환 인증서가
원래 로컬 key 및 HPP CA와 일치하는지 확인한 뒤 pinned client binding을 만든다.

```powershell
# 1) 팀원 PC — 개인키는 이 디렉터리 밖으로 이동하지 않는다.
npm.cmd run ingress:mtls-enrollment -- prepare --output-dir <protected-local-dir> `
  --openssl <absolute-openssl-path> --account <account-id> --device <device-id> --agent <agent-id>

# 2) HPP — 공개 request/CSR만 받아 서명한다. CA key 값은 읽거나 출력하지 않는다.
npm.cmd run ingress:mtls-enrollment -- sign --request <request-json> --csr <csr-pem> `
  --ca-cert <ca-cert> --ca-key <ca-key> --certificate-output <new-client-cert> `
  --openssl <absolute-openssl-path> --days 30

# 3) 팀원 PC — 서명 인증서와 공개 CA를 가져와 로컬 binding을 완성한다.
npm.cmd run ingress:mtls-enrollment -- finalize --request <local-request-json> `
  --key <local-private-key> --certificate <signed-client-cert> --ca-cert <ca-cert> `
  --binding-output <local-binding-json> --base-url https://<hpp-private-ip>:4313 `
  --server-pin <sha256> --openssl <absolute-openssl-path>
```

이 도구는 bearer를 발급하지 않고 listener/firewall을 열지 않으며 live probe도 하지
않는다. request와 CSR은 공개키 자료지만 Git/채팅에 올리는 대신 승인된 사내 전달면을
사용한다. 실제 PC 한 대의 account/device/agent/project credential 발급과 `/32`
firewall 활성화는 물리 canary 절차에서 별도로 수행한다.

이 앱에는 서로 권한과 저장 목적이 다른 세 MCP 프로세스와 한 개의 보안 게이트웨이가 있다.

| 프로세스 | 시작 파일 | 저장 대상 | 현재 상태 |
| --- | --- | --- | --- |
| 개인 ERP MCP | `server.mjs` | dev-ERP API/DB와 ERP artifact inbox | 기존 파일럿, 기본 OFF |
| copied Project History MCP | `project_history_server.mjs` | 저장 없음; attested standalone ERP copy와 server-bound CSV/XLSX만 읽음 | feature OFF, 합성 및 bounded actual-copy loopback 검증 |
| HPP evidence ingress MCP | `ingress_server.mjs` | HPP local outbox의 미분류 파일·bounded PC work·run receipt | 구현·합성 검증 완료, private binding 기본 OFF |
| ingress mTLS gateway | `ingress_mtls_gateway.mjs` | 저장하지 않고 사설 LAN 요청을 loopback ingress로 전달 | 구현·합성 검증 완료, private binding 기본 OFF |

네 프로세스 모두 LLM을 호출하지 않는다. 개인 ERP MCP는 사용자 bearer를 기존 dev-ERP의
account-scoped `/api/mcp/*` API로 전달한다. HPP ingress MCP는 ERP DB나 `_workspaces`를 열지 않고
기존 HPP local outbox에만 전달한다.

설계, 연결, 파일 업로드, 운영 전 차단 조건은
[`../dev-erp/docs/slices/ERP-MCP-V0.md`](../dev-erp/docs/slices/ERP-MCP-V0.md)를 따른다.
HPP evidence ingress의 별도 경계는
[`../dev-erp/docs/slices/INGRESS-MCP-V1.md`](../dev-erp/docs/slices/INGRESS-MCP-V1.md)를 따른다.

```powershell
$env:ERP_MCP_ERP_BASE_URL="http://127.0.0.1:4300"
$env:ERP_MCP_PUBLIC_URL="http://127.0.0.1:4311"
npm.cmd start
```

기본 bind는 `127.0.0.1:4311`이다. LAN에서는 sidecar를 직접 평문 공개하지 않고 HTTPS
reverse proxy/tunnel 뒤에 둔다. `/health`만 공개 liveness이며 `/mcp`는 개인 ERP bearer,
`/upload/<one-time-ticket>`은 10분/1회/size/hash-bound raw upload만 받는다.
실제 listen host와 `ERP_MCP_PUBLIC_URL`은 non-loopback 평문을 기본 거부한다. 개인 bearer를
전달하는 `ERP_MCP_ERP_BASE_URL`도 `http://`이면 loopback만 허용한다. 토큰 회수, 계정 정지,
업무 접근권한 상실은 아직 쓰지 않은 upload ticket의 저장 권한도 무효화한다.

## copied Project History MCP

이 별도 서버는 기본 활성화 경로가 없다. 실행할 때마다 기존 standalone copied ERP DB, projection
root, full-generation attestation, artifact-attestation digest를 정확히 지정하고 `--pilot-copy`를
명시해야 한다. bearer는 명령행이나 stdout이 아니라
`SOULFORGE_PROJECT_HISTORY_MCP_TOKEN` 환경변수로만 주입한다.

```powershell
$env:SOULFORGE_PROJECT_HISTORY_MCP_TOKEN="<ephemeral-random-token>"
npm.cmd run start:project-history -- --pilot-copy --attestation <sha256:...> `
  --artifact-attestation <sha256:...> `
  --db <absolute-existing-copy.sqlite> --projection-root <absolute-existing-project-history-root>
```

서버는 `127.0.0.1`에만 bind하고 DB를 `readOnly`와 `PRAGMA query_only=ON`으로 연다. 한 read-only
transaction 안에서 canonical projection schema fingerprint를 확인하고 immutable JSON row로 exact
generation을 재구성·검증한 뒤 full-generation digest를 다시 계산한다. 도구는
`erp_get_project_history`, `erp_prepare_project_history_download` 두 개뿐이며 둘 다 exact
`project_id`와 `generation_id`를 요구한다. 다운로드 파일은
`<projection-root>/<project_id>/<generation_id>/project_history.{csv,xlsx}`에서만 고르고,
MCP JSON에는 bytes나 host path 대신 짧은 수명의 1회용 `/download/<ticket>`만 반환한다. URL authority는
설정값이나 Host alias가 아니라 실제 `127.0.0.1:<listener-port>`에서 만들며, `Origin`이 있으면 그
authority와 byte-exact 일치하지 않는 요청은 403으로 거부한다.

같은 generation 폴더에는 아래 다섯 파일이 모두 있어야 한다.

- `project_history.csv`
- `project_history.xlsx-input.json`
- `project_history.xlsx-readback.json`
- `project_history.xlsx`
- `project_history.artifact-attestation.json`

artifact attestation은 exact `schema_version`, `project_id`, `generation_id`, `generation_digest`,
`projection_schema_fingerprint`, `ordered_event_digest`, `ordered_row_digest`, `artifacts`만 가진다.
`artifacts`에는 `csv`, `xlsx_input`, `xlsx_readback`, `xlsx`가 각각 exact
`filename`, `size`, `sha256`을 가진다. `--artifact-attestation` 값은 이 object의 canonical SHA-256이다.
서버는 CSV rows, XLSX input, XLSX readback을 reconstructed DB model과 대조하고 네 파일의 size/hash를
attestation과 대조한 뒤 CSV/XLSX buffer를 시작 시 한 번만 seal한다. ticket은 buffer를 복제하지 않고
참조하며 active-ticket 개수와 총 byte quota를 함께 적용한다.

## HPP evidence ingress MCP

제공 도구는 `ingress_whoami`, resumable file upload 준비/상태, bounded PC work/run receipt 게시,
submission ack 조회다. 사람·장치·AI agent를 한 credential에서 각각 식별하고 exact project scope와
capability를 검사한다. 파일 bytes는 MCP JSON이 아니라 같은 bearer가 필요한 chunked HTTP 경로로
보낸다. HPP receiver ack 전에는 `pending_server_ack`, digest/size가 맞는 ack 뒤에만
`verified_server_ack`이다. 어느 상태도 프로젝트 승격, ERP 기록, 공식 업무 완료를 뜻하지 않는다.

```powershell
# private binding의 enabled=true는 별도 운영 승인 뒤에만 사용한다.
npm.cmd run start:ingress -- --config <private-absolute-binding-path>

# 팀원 PC: mTLS binding은 CA/client cert/key와 exact HPP IP/pin을 가리킨다.
# token은 명령행이나 binding JSON이 아니라 OS-protected environment에만 둔다.
$env:SOULFORGE_INGRESS_MTLS_BINDING="<private-absolute-client-binding-path>"
$env:SOULFORGE_INGRESS_TOKEN="<one-time-issued-personal-token>"
npm.cmd run ingress:client -- whoami
```

`ingress_access_admin_cli.mjs`는 private registry의 초기화·발급·목록·폐기를 제공한다. CLI 발급은
`--token-output`으로 operator가 준비한 OS-protected directory의 새 파일에만 token을 쓰고 stdout에는
반환하지 않으며, registry에는
SHA-256 hash만 저장하고 목록은 hash도 반환하지 않는다. 출력 파일이 이미 있으면 registry 변경 전
실패한다. 현재 공개
코드와 D runtime feature-OFF 배치만으로 실제 token, LAN listener, TLS proxy, firewall 또는 팀 PC
등록이 생기지 않는다.

## strict office-LAN mTLS 경계

LAN gateway는 RFC1918 사설 IPv4 하나에만 exact bind하고, 그 주소와 다른 private
`allowed_client_ipv4`의 RFC1918 주소 하나만 exact source로 허용한다. enabled일 때 이 필드는 null일
수 없다. `0.0.0.0`, loopback, 공인 IP, VPN/Tailscale 대역을 config 단계에서 거부하며 backend는 계속
`127.0.0.1` 평문이다. 외부 요청은 다음 다섯 값이 모두 일치해야 통과한다.

```text
socket의 exact source IPv4
  + CA가 서명한 등록 client certificate
  + 폐기되지 않은 credential bearer
  + exact account/device
  + certificate에 허용된 agent
        ↓
HPP loopback ingress MCP
```

gateway handler는 IPv4-mapped `::ffff:x.x.x.x`를 IPv4로 정규화한 뒤 certificate registry나 bearer
auth보다 먼저 exact source를 검사한다. 이 application-layer guard는 OS firewall을 대체하지 않으며 TLS
handshake 뒤 HTTP handler에서 적용된다. gateway는 exact Host, server certificate pin, TLS 1.3,
body/request/concurrency 제한도 적용한다.
ingress service는 credential별 open upload, pending bytes, retained bytes quota를 별도로 검사한다.
client key와 token은 CLI 인자로 받지 않으며, 등록 목록은 전체 certificate fingerprint나 token hash를
출력하지 않는다.

실제 한 대 PC를 연결하기 전 준비·중단선은
[`../dev-erp/docs/slices/INGRESS-MTLS-CANARY-V1.md`](../dev-erp/docs/slices/INGRESS-MTLS-CANARY-V1.md)에
고정한다. 합성 테스트는 private-LAN 주소와 실제 TLS/mTLS socket을 사용하지만 물리 `172.*` PC,
HPP LAN listener, firewall을 활성화하지 않는다.
