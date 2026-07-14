# Soulforge dev-ERP MCP sidecar

팀원 개인 Codex와 dev-ERP를 연결하는 Streamable HTTP MCP adapter다. 이 프로세스는
LLM을 호출하거나 ERP SQLite를 직접 열지 않고, 사용자 bearer를 기존 dev-ERP의
account-scoped `/api/mcp/*` API로 전달한다.

설계, 연결, 파일 업로드, 운영 전 차단 조건은
[`../dev-erp/docs/slices/ERP-MCP-V0.md`](../dev-erp/docs/slices/ERP-MCP-V0.md)를 따른다.

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
