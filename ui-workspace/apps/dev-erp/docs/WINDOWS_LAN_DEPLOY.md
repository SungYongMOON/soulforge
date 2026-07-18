# dev-erp Windows 배포 런북 (Tailscale HTTPS 우선, LAN HTTP 파일럿)

서버 1대(회사 고성능 **Windows** PC)에서 돌리고, 팀원이 각자 PC에서 사내 LAN으로 접속하는 구성.
팀 공개 기본값은 Tailscale Serve HTTPS 이며, 직접 LAN HTTP 는 owner 가 승인한 소수 파일럿일 때만 쓴다.

> Scope boundary: 이 문서의 LAN HTTP/direct HTTPS/browser pilot은 HPP MCP target acceptance가 아니다.
> HPP MCP target은 backend loopback + strict private office LAN의 mTLS reverse proxy를 control plane으로,
> authenticated HTTPS ticket transfer를 binary plane으로 사용한다. VPN/Tailscale/remote access, public
> Internet ingress, router port forwarding/Funnel, direct SMB/UNC와 ticket URL-only authority는 `OFF/DEFER`다.
> 아래 existing legacy dev-ERP Tailscale Serve CURRENT는 HPP authority를 만들지 않는다. Remote lane은
> 별도 future owner approval·threat model·trust/CA/ACL·acceptance gate가 필요하다. 상세 gate는
> [`TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md`](TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md)의
> `A8-SYNTH`/`A8-CANARY`, D27~D29를 따른다.

전제: **Node.js 22.5 이상**(내장 `node:sqlite` 사용 — 외부 패키지 설치 0개).

---

운영 PC에서 실제 팀에게 열 때는 `<dev-checkout>` 개발 checkout 을 직접 서비스로
쓰지 않는다. 승인된 commit 을 별도 runtime clone 인 `<runtime-checkout>` 에
반영한 뒤 그 clone 에서 서비스를 실행한다. 운영 경계, Tailscale HTTPS, secret 경계,
owner 승인 gate 는 [`RUNTIME_OPERATING_CONTRACT_20260617.md`](RUNTIME_OPERATING_CONTRACT_20260617.md)를
정본으로 둔다. Runtime maintenance, watchdog recovery, NSSM setup,
backup/restore-test, and incident troubleshooting are tracked in
[`RUNTIME_MAINTENANCE_RUNBOOK_20260618.md`](RUNTIME_MAINTENANCE_RUNBOOK_20260618.md).

포트는 checkout 경계를 겸한다. `<runtime-checkout>`만
운영 포트 `4300`을 사용한다. `<dev-checkout>` 등 개발/작업본은
기본 `4310`을 사용하고, `4300` 실행은 서버가 기본 거부한다. 따라서 4300에
보이는 화면은 항상 운영본이어야 한다.

## 0. 최신 코드 받기 (Windows 서버 PC — Soulforge 이미 설치됨)
수동 복사 불필요. 그 PC에서 **`/soulforge-github-down`** 실행 → 공개 repo 최신(개발 PC에서 올린 변경)
· 설치된 Codex 스킬 · `_workmeta`/`private-state` private repo 신선도 · 워크스페이스 정션을
한 번에 동기화한다(경계별로 처리, PowerShell/Windows 지원).

- **DB는 git 제외**(`ui-workspace/apps/dev-erp/data/dev-erp.db`) → 동기화가 그 PC의 **로컬 데이터
  (관리자·과제·메일)를 덮지 않는다**. 안전. (처음이면 DB 없음 → 부트스트랩에서 생성.)
- 메일/팀 데이터(`_workmeta`, `guild_hall/state` 등)는 private repo 신선도 체크로 따라온다.
- **메일함 자격증명 env 파일**은 어느 repo 에도 안 올린다 — 그 PC 비공개 경로에 직접 둔다.
  ERP DB 엔 `mailbox_env_ref` 포인터만(도구가 내용 안 읽음).
- 코드를 받은 뒤에는 **서버를 재시작**해야 새 코드가 적용된다(아래 4 NSSM 이면 `nssm restart dev-erp`).

## 1. Node 설치
- https://nodejs.org → **22.5 이상**(LTS 22.x 또는 그 이상) 설치.
- 확인(명령 프롬프트): `node -v` → v22.5.0 이상.

## 2. 실행 (LAN HTTP 파일럿)
runtime dev-erp 폴더에서:
```
node server.mjs --host 0.0.0.0 --port 4300
```
또는 같은 폴더의 **`start-windows.bat` 더블클릭**. 이 배치 파일은
runtime checkout 에서는 `4300`, 개발 checkout 에서는 `4310`으로 자동 분리한다.
(`--host 0.0.0.0` = 사내 네트워크에서 접속 허용. 기본은 127.0.0.1 = 이 PC만.)

## 3. 접속 주소 + 방화벽
- 이 PC IP 확인: `ipconfig` → 활성 어댑터의 **IPv4 주소**(예 192.168.0.50). 팀원은 **`http://192.168.0.50:4300`**.
- IP 고정 권장: 공유기 DHCP 예약 또는 고정 IP(재부팅 때 IP 바뀌면 팀 북마크 깨짐).
- Windows 방화벽 인바운드 **TCP 4300 허용**:
  - 첫 실행 때 "Windows Defender 방화벽" 팝업 → **개인 네트워크 허용**, 또는
  - 관리자 명령 프롬프트:
    ```
    netsh advfirewall firewall add rule name="dev-erp 4300" dir=in action=allow protocol=TCP localport=4300
    ```

## 3.4 사내망 직접 HTTPS (자체서명 — LAN 파일럿 기본 권장, 2026-07-04 owner 승인)

서버가 같은 포트(4300)에서 TLS 를 직접 종단한다. 팀원 접속 주소는 `https://<서버IP>:4300`
으로 바뀌고, 비밀번호·세션 쿠키 평문 노출(아래 6절)과 마이크 차단이 함께 해결된다.
외부 소프트웨어 없이 Node 내장 `node:https`/`node:net` 만 쓴다(zero-dependency 유지).

**서버 PC 1회 — 인증서 생성** (Git 동봉 openssl 사용, runtime dev-erp 폴더에서).
1회용 로컬 CA 로 서버 인증서를 발급하고 **CA 키는 즉시 삭제**한다 — 팀 PC 는 `ca.crt` 만
신뢰 등록하고, 서버 키(`server.key`)가 유출돼도 CA:FALSE leaf 라 다른 사이트 위조 서명은 불가능하다:

```powershell
New-Item -ItemType Directory -Force data\tls | Out-Null
$ssl = Join-Path $env:ProgramFiles "Git\usr\bin\openssl.exe"
# 1) 1회용 로컬 CA — 팀 PC 신뢰 등록 대상은 이 ca.crt
& $ssl req -x509 -newkey rsa:2048 -nodes -keyout data\tls\ca.key -out data\tls\ca.crt -days 3650 -subj "/CN=dev-erp local CA"
# 2) 서버 인증서 발급 (CA:FALSE + IP SAN)
Set-Content data\tls\san.cnf -Encoding ascii -Value "subjectAltName=IP:<서버IP>,IP:127.0.0.1,DNS:localhost`nbasicConstraints=CA:FALSE`nkeyUsage=digitalSignature,keyEncipherment`nextendedKeyUsage=serverAuth"
& $ssl req -newkey rsa:2048 -nodes -keyout data\tls\server.key -out data\tls\server.csr -subj "/CN=dev-erp"
& $ssl x509 -req -in data\tls\server.csr -CA data\tls\ca.crt -CAkey data\tls\ca.key -CAcreateserial -days 3650 -out data\tls\server.crt -extfile data\tls\san.cnf
# 3) CA 키·부산물 즉시 삭제 — 인증서 재발급이 필요해지면(IP 변경 등) CA 부터 다시 만들고 팀 PC 재등록
Remove-Item data\tls\ca.key, data\tls\server.csr, data\tls\san.cnf, data\tls\ca.srl -ErrorAction SilentlyContinue
```

`data/` 는 git 제외라 키가 repo 에 올라가지 않는다. `data/tls/server.crt`+`server.key` 가
있으면 서버가 **자동으로 HTTPS 모드**로 뜬다(재시작만 필요, 실행 명령·서비스 설정 변경 없음).
`/dev-erp-ca.crt` 다운로드는 `ca.crt` 가 있으면 그것을, 없으면(단순 자체서명) `server.crt` 를 배포한다.
끄기: `--no-tls` 또는 `DEV_ERP_NO_TLS=1`. 경로 재지정: `--tls-cert/--tls-key/--tls-ca` 또는
`DEV_ERP_TLS_CERT/DEV_ERP_TLS_KEY/DEV_ERP_TLS_CA`.

인증서와 private key를 서로 다른 runtime 위치에 보관하면서 hardened background launcher로
직접 LAN HTTPS를 열 때는 env가 아니라 명시적 launcher 인자를 쓴다. 아래 두 명령은 같은
PowerShell 세션에서 실행하며, 첫 명령의 출력이 `host=0.0.0.0`과 `tls=explicit`인지 확인한
뒤 두 번째 명령을 실행한다. launcher 출력에는 세 경로가 표시되지 않는다.

```powershell
$launcher = ".\ops\run-dev-erp-background.ps1"
$cert = "<certificate-root>\server.crt"
$key = "<protected-key-root>\server.key"
$ca = "<certificate-root>\ca.crt"

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $launcher -ListenOnLan `
  -TlsCertPath $cert -TlsKeyPath $key -TlsCaPath $ca -DryRun
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $launcher -ListenOnLan `
  -TlsCertPath $cert -TlsKeyPath $key -TlsCaPath $ca
```

`tls=explicit`은 cert/key pair를 명시했다는 뜻이다. `-TlsCertPath`와 `-TlsKeyPath`는
항상 함께 지정해야 하고 `-TlsCaPath`는 그 pair와 함께만 쓸 수 있는 선택 사항이다.
launcher는 파일 존재만 확인하고 key 내용을 읽지 않는다. direct TLS가 session cookie의
`Secure` 속성을 자동으로 켜므로 이 구성에는 `-SecureCookie`가 필요 없다. hardened launcher는
상속된 `DEV_ERP_TLS_*` env를 제거하므로, split-key 경로를 env에만 저장해 두는 방식은 재시작
계약이 아니다.

기존 controller가 `127.0.0.1:4300` backend를 계속 소유해 direct replacement가 되돌아가는
환경에서는 두 번째 ERP 서버를 같은 DB로 띄우지 않는다. 대신 exact LAN IP에만 얇은 TLS
proxy를 바인딩한다. Windows는 loopback과 exact LAN IP가 다르면 같은 포트를 함께 쓸 수 있다.

```powershell
node .\ops\dev-erp-lan-https-proxy.mjs `
  --listen-host <서버IP> --port 4300 `
  --upstream-host 127.0.0.1 --upstream-port 4300 `
  --tls-cert "<certificate-root>\server.crt" `
  --tls-key "<protected-key-root>\server.key" `
  --tls-ca "<certificate-root>\ca.crt"
```

proxy는 wildcard/loopback listen 주소와 non-loopback upstream을 거부하고, client가 보낸
forwarding/hop-by-hop 헤더를 신뢰하지 않는다. HTTPS 응답의 session cookie에는 `Secure`를
강제하며 request/response body나 TLS 경로를 로그로 남기지 않는다. `/dev-erp-ca.crt`는
HTTPS proxy에서 public CA만 내려준다. 작업 스케줄러에는 위 Node 명령을 foreground Action으로
등록해 proxy process 자체가 task lifetime이 되게 한다. backend task/controller는 별도로 유지한다.
이 공존 proxy의 LAN socket은 HTTPS-only이므로 `http://<서버IP>:4300` 리다이렉트를 제공하지
않는다. 팀 북마크와 배포 주소는 처음부터 `https://<서버IP>:4300/`로 고정한다. 아래의 평문
301/health 예외 설명은 in-app direct TLS 모드에만 해당한다.

HTTPS 모드 동작:
- 같은 포트 평문 `http://` 요청은 `https://` 로 301 리다이렉트(기존 북마크 자동 이행).
- 예외 2개: `/api/health` 는 평문에서도 그대로 응답(watchdog·runtime_ops 등 기존 모니터링
  프로브 보존 — 재시작 루프 방지), `/dev-erp-ca.crt` 는 신뢰 등록 부트스트랩용 다운로드.
- 세션 쿠키 `Secure` 자동 ON (`DEV_ERP_COOKIE_SECURE` 별도 설정 불필요).
- Tailscale Serve 등 HTTPS 종단 프록시 공존: `X-Forwarded-Proto: https` 평문 요청을 앱으로
  통과시키되, 위조 방지를 위해 **loopback 소스(로컬 프록시)에서만** 신뢰한다.
- 가드: `ca.crt` 없이 `server.crt` 가 CA:TRUE(단순 `openssl req -x509` 기본형)면 앵커
  배포(/dev-erp-ca.crt)를 404 로 차단하고 시작 로그에 경고 — 상주 서버키가 범용 서명 키가
  되는 구성을 팀 PC 에 심지 않기 위함. 위 1회용 CA 절차를 그대로 쓰면 걸리지 않는다.

**팀원 PC 1회 — 인증서 신뢰 등록** (등록해야 경고 없이 🔒 + 마이크 사용).
루트 인증서 설치는 "이 인증서로 서명된 것은 뭐든 믿겠다"는 강한 신뢰 행위다. 다운로드 구간이
평문이므로, **설치 전 지문 대조**가 절차의 일부다(바꿔치기된 앵커를 설치하면 피해가 ERP 를 넘어선다):
1. 브라우저에서 `http://<서버IP>:4300/dev-erp-ca.crt` 열기 → 인증서 다운로드.
2. **지문 대조**: 명령 프롬프트에서 `certutil -hashfile "%USERPROFILE%\Downloads\dev-erp-ca.crt" SHA256`
   → 출력된 해시가 관리자가 공지한 값(서버 시작 로그의 `신뢰 앵커 SHA-256:` 값)과 일치하는지 확인.
   불일치하면 설치하지 말고 관리자에게 알린다.
3. 받은 파일 더블클릭 → **인증서 설치** → 저장 위치 "현재 사용자" → "모든 인증서를 다음
   저장소에 저장" → **신뢰할 수 있는 루트 인증 기관** → 마침.
4. 브라우저 완전 재시작 → `https://<서버IP>:4300` 접속(북마크 갱신).

(대안: 관리자가 `ca.crt` 를 USB/사내 공유폴더로 직접 전달하면 지문 대조를 겸한다.)
등록 없이 접속하면 "주의 요함" 경고가 뜬다 — 계속 진행해도 동작은 하지만, 팀 배포는
신뢰 등록을 기본 절차로 한다. IP 가 바뀌면 인증서를 다시 만들어야 하므로 서버 IP 고정(3절)이 전제.

## 3.5 Tailscale HTTPS 파일럿

Tailscale Serve 로 `127.0.0.1:4300` 만 HTTPS 로 노출하면 broad LAN inbound rule 없이도
owner 휴대폰과 승인된 팀 device 에서 pilot 이 가능하다.

앱을 localhost 로 실행한다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\run-dev-erp-background.ps1 -SecureCookie -DryRun
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\run-dev-erp-background.ps1 -SecureCookie
```

host/port 는 `DEV_ERP_HOST` 같은 env 가 아니라 `--host`/`--port` CLI flag 로 지정한다.

다른 관리자 PowerShell 에서 Tailscale Serve 를 켠다.

```powershell
tailscale serve --bg 4300
tailscale serve status
```

팀 초대 전에는 owner 휴대폰의 Tailscale 앱으로 `tailscale serve status` 가 알려주는
HTTPS URL 에 접속해 로그인, 세션 유지, 주요 화면 접근을 확인한다. Tailscale Funnel 은
public internet exposure 이므로 owner 가 명시 승인하기 전에는 사용하지 않는다.

## 4. 상시 운영 (부팅 자동시작 + 죽으면 자동복구)
터미널 닫거나 재부팅하면 멈추므로 서비스로 등록한다. 둘 중 하나:

**A) NSSM (권장 — 로그인 안 해도 서비스로 상시)**
- https://nssm.cc 에서 nssm.exe 다운로드. 관리자 명령 프롬프트:
  ```
  nssm install dev-erp "<node_exe_path>" server.mjs --host 127.0.0.1 --port 4300 --secure-cookie
  nssm set dev-erp AppDirectory "<runtime-checkout>\\ui-workspace\\apps\\dev-erp"
  nssm set dev-erp Start SERVICE_AUTO_START
  nssm start dev-erp
  ```
  이 설정은 Tailscale Serve HTTPS 전제다. 자동 재시작은 NSSM 기본. 중지:
  `nssm stop dev-erp`, 제거: `nssm remove dev-erp confirm`.

  owner 가 직접 LAN HTTP 파일럿을 승인한 경우에만 `--host 0.0.0.0` 로 바꾸고,
  `--secure-cookie` 은 사용하지 않는다.

**B) 작업 스케줄러 (현재 사용자 로그온 경로)**
- Tailscale HTTPS의 tracked core-only 경로는 다음 순서다. 첫 명령은 audit-only이고,
  두 번째도 `-WhatIf`라 task를 바꾸지 않는다. 세 번째만 등록 mutation이다.
  ```powershell
  $registrar = ".\ops\register-dev-erp-scheduled-task.ps1"
  & $registrar -SecureCookie
  & $registrar -SecureCookie -Register -WhatIf
  & $registrar -SecureCookie -Register
  ```
- 등록 action은 `run-dev-erp-background.ps1 -Foreground`와 명시적 DB 경로를 사용한다.
  현재 사용자 `AtLogOn` + `Interactive` + `Limited`로만 실행하고 credential을 저장하지
  않으므로 pre-login service가 아니다. Node가 끝나기 전에는 task가 완료되지 않으며,
  Node exit status가 task 결과로 전달되어 bounded restart setting이 작동한다.
- 같은 DB를 겨냥한 enabled launcher/direct-Node action이나 해석할 수 없는 enabled
  dev-ERP action이 하나라도 있으면 등록을 거부한다. 기존 controller 인계는 task와
  Node를 먼저 중지하고 task를 비활성화한 뒤 exact `-HandoffFromTaskId`를 명시한다.
  helper는 다른 task/process를 중지·비활성화·삭제하지 않는다. 상세 rollback은
  [`RUNTIME_MAINTENANCE_RUNBOOK_20260618.md`](RUNTIME_MAINTENANCE_RUNBOOK_20260618.md)의
  `Current-user Task Scheduler foreground registration` 절을 따른다.
- 이 helper는 core-only와 선택적 `-SecureCookie`만 등록한다. direct LAN TLS나 mail,
  autosync, morning brief, dedicated worker 같은 통합은 이 경로에 임의로 추가하지 말고
  별도 owner-approved service/runbook 변경으로 다룬다.
- 외부 controller가 loopback backend를 복구하는 환경에서는 그 process를 교체하지 말고
  `ops/dev-erp-lan-https-proxy.mjs`를 exact LAN IP에 등록한다. proxy와 backend를 서로 다른
  작업으로 유지하고, proxy Action은 Node foreground process로 등록한다.
- `start-windows.bat` 은 `--host 0.0.0.0` LAN HTTP 파일럿용이다. 팀 공개 기본값으로 쓰지 않는다.

## 5. 첫 길드마스터 + 팀원 + 점검
- Tailscale HTTPS 운영이면 `tailscale serve status` 가 알려주는 HTTPS URL 로 접속한다.
  LAN HTTP 파일럿이면 서버 PC 또는 같은 LAN 브라우저에서 `http://<서버IP>:4300` 로 접속한다.
  처음이면 게이트에서 **관리자 부트스트랩**(기존 DB 복사했으면 그대로 로그인).
- 관리자 패널 → 팀원 계정 추가(비밀번호는 사람이 입력) 또는 roster import. 메일함 설정.
- **릴리즈 게이트 점검**:
  ```
  npm run dev-erp:team-preflight -- --db ui-workspace/apps/dev-erp/data/dev-erp.db
  ```
  1차 `configuration_ready` → 메일 수집 후 2차 `team_use_ready`. (env 내용·경로·비번 출력 안 함.)
- 메일 수집 1회 → 할 일 생성 → '각자 메일=각자 일' 자동 배정. 지속 자동화: `set DEV_ERP_AUTOSYNC=1` 후 실행.

## 6. 보안 (정직하게)
- 평문 HTTP 로 열면 로그인 비번·세션 쿠키가 **사내 LAN 에서 평문**으로 흐른다. 2026-07-04 부터는
  3.4 절 직접 HTTPS 가 LAN 기본 권장 — 인증서만 만들면 같은 실행 명령으로 이 문제가 사라진다.
- 평문 HTTP 운영에서는 **`DEV_ERP_COOKIE_SECURE` 켜지 말 것**(Secure 쿠키는 HTTPS 필요 → 로그인 깨짐).
  직접 HTTPS(3.4)에서는 자동으로 켜지므로 신경 쓸 필요 없다.
- **마이크(음성 입력) 조건**: 브라우저는 마이크를 보안 컨텍스트(HTTPS 또는 localhost)에서만
  허용한다 — 평문 `http://<IP>:4300` 접속에서는 🎤 버튼이 비활성(사유 툴팁)으로 표시된다.
  해결 우선순위: ① 3.4 직접 HTTPS + 인증서 신뢰 등록(권장) ② Tailscale HTTPS
  ③ (임시) Chrome `chrome://flags/#unsafely-treat-insecure-origin-as-secure` 에
  `http://<서버IP>:4300` 입력 → Enabled → 재시작(Edge 는 edge://flags 동일).
  음성 인식 자체는 브라우저 내장(벤더 서버 처리 가능)이므로 민감 내용 구두 입력 주의
  고지는 버튼 툴팁에 포함되어 있다.

## 7. 일단 릴리즈 최소 기준
preflight `configuration_ready` OK + 관리자·팀원 로그인 + 팀원이 자기 일 봄. (`team_use_ready`는 메일 수집 후 확인이어도 초기버전 충분.)

## 8. 평소 업데이트 절차 (개발 PC → 서버 PC)
새 기능·수정이 생기면:
1. **(개발 PC)** 변경 → **`/soulforge-github-up`** 으로 GitHub 푸시.
2. **(서버 Windows PC)** **`/soulforge-github-down`** 으로 풀(코드·스킬·private 신선도·정션 동기화).
3. **(서버 PC)** dev-erp 서버 **재시작** → 새 코드 적용:
   - NSSM 서비스면 `nssm restart dev-erp`
   - `start-tailscale-windows.bat` 창이면 Ctrl+C 후 다시 더블클릭
   - LAN HTTP 파일럿의 `start-windows.bat` 창이면 Ctrl+C 후 다시 더블클릭
   - 개발/즉시반영용이면 `node --watch server.mjs --host 127.0.0.1 --port 4310`
     (파일 변경 시 자동 재시작, 운영 4300과 분리)

> DB·로컬 데이터·메일함 env 는 그대로 유지된다(git 제외). 코드만 갱신된다.

## 9. 데이터 평면 아키텍처 (2026-07-05 owner 결정)

아래는 기존 dev-ERP runtime의 `CURRENT`/legacy 운영 설명이다. HPP MCP/storage `TARGET`에서는
OneDrive-backed project workspace를 active DB/RAW/quarantine/queue/outbox plane으로 쓰지 않고 HPP private
custody의 logical storage classes로 분리한다. 다른 PC의 direct backend/D/UNC/SMB/SQLite 접근은 `0`이며
정확한 path/IP/domain/certificate binding은 private `VERIFY_HP`다.

**Soulforge(dev checkout, 예: `<backend-root>`) = 데이터 백엔드. runtime clone = 무상태 앱 서버(껍데기).**
runtime 에 데이터를 동기화하거나 쌓지 않는다 — owner 결정: "Soulforge 에 있는 데이터를 ERP 에
뿌린다. runtime 은 ERP 서버일 뿐, Soulforge 가 백엔드다."

- **읽기(적용됨)**: 지식 서가·위키 본문·줄기 그래프는 서버 기동 플래그
  `--knowledge_shell_root <백엔드루트>` 로 백엔드의 `_workmeta`·`_workspaces` 를 직접 읽는다.
  운영 기동 정경로 `ops/run-dev-erp-background.ps1` 은 `DEV_ERP_BACKEND_ROOT` 또는 runtime checkout 의 sibling backend 를 사용한다.
  기동 로그의 `데이터 평면 루트:` 줄로 어느 창고를 읽는지 확인한다.
- **쓰기(ENGINE-9, 적용됨)**: 엔진 체인(메일 원장 스캔→할일_장부→줄기)은
  `DEV_ERP_BACKEND_ROOT=<백엔드루트>` 의 `_workmeta` 를 사용한다. 운영 기동 정경로는
  `$env:DEV_ERP_BACKEND_ROOT = $BackendRoot` 를 설정하며, 기동 로그의 `backend write root:`
  줄로 어느 창고에 쓰는지 확인한다.
- **runtime 에 남는 것(의도)**: 앱 코드, SQLite DB(운영 상태 — `--db` 로 재지정 가능),
  TLS 인증서(`data/tls`), 메일함 자격증명 env(`guild_hall/state/**`, secret 은 PC 로컬), 로그.
