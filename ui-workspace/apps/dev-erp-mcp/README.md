# Soulforge dev-ERP MCP sidecar

이 앱에는 서로 권한과 저장 목적이 다른 두 MCP 프로세스가 있다.

| 프로세스 | 시작 파일 | 저장 대상 | 현재 상태 |
| --- | --- | --- | --- |
| 개인 ERP MCP | `server.mjs` | dev-ERP API/DB와 ERP artifact inbox | 기존 파일럿, 기본 OFF |
| HPP evidence ingress MCP | `ingress_server.mjs` | HPP local outbox의 미분류 파일·bounded PC work·run receipt | 구현·합성 검증 완료, private binding 기본 OFF |

두 프로세스 모두 LLM을 호출하지 않는다. 개인 ERP MCP는 사용자 bearer를 기존 dev-ERP의
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

## HPP evidence ingress MCP

제공 도구는 `ingress_whoami`, resumable file upload 준비/상태, bounded PC work/run receipt 게시,
submission ack 조회다. 사람·장치·AI agent를 한 credential에서 각각 식별하고 exact project scope와
capability를 검사한다. 파일 bytes는 MCP JSON이 아니라 같은 bearer가 필요한 chunked HTTP 경로로
보낸다. HPP receiver ack 전에는 `pending_server_ack`, digest/size가 맞는 ack 뒤에만
`verified_server_ack`이다. 어느 상태도 프로젝트 승격, ERP 기록, 공식 업무 완료를 뜻하지 않는다.

```powershell
# private binding의 enabled=true는 별도 운영 승인 뒤에만 사용한다.
npm.cmd run start:ingress -- --config <private-absolute-binding-path>

# 팀원 PC: token은 명령행이 아니라 OS-protected environment에만 둔다.
$env:SOULFORGE_INGRESS_URL="https://<approved-internal-host>"
$env:SOULFORGE_INGRESS_TOKEN="<one-time-issued-personal-token>"
npm.cmd run ingress:client -- whoami
```

`ingress_access_admin_cli.mjs`는 private registry의 초기화·발급·목록·폐기를 제공한다. 발급 token은
한 번만 출력하고 registry에는 SHA-256 hash만 저장하며 목록은 hash도 반환하지 않는다. 현재 공개
코드와 D runtime feature-OFF 배치만으로 실제 token, LAN listener, TLS proxy, firewall 또는 팀 PC
등록이 생기지 않는다.
