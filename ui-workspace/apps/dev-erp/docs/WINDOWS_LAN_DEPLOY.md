# dev-erp Windows 배포 런북 (Tailscale HTTPS 우선, LAN HTTP 파일럿)

서버 1대(회사 고성능 **Windows** PC)에서 돌리고, 팀원이 각자 PC에서 사내 LAN으로 접속하는 구성.
팀 공개 기본값은 Tailscale Serve HTTPS 이며, 직접 LAN HTTP 는 owner 가 승인한 소수 파일럿일 때만 쓴다.

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
$ssl = "C:\Program Files\Git\usr\bin\openssl.exe"
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
$env:DEV_ERP_COOKIE_SECURE="1"
node server.mjs --host 127.0.0.1 --port 4300
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
  nssm install dev-erp "<node_exe_path>" server.mjs --host 127.0.0.1 --port 4300
  nssm set dev-erp AppDirectory "<runtime-checkout>\\ui-workspace\\apps\\dev-erp"
  nssm set dev-erp AppEnvironmentExtra DEV_ERP_COOKIE_SECURE=1
  nssm set dev-erp Start SERVICE_AUTO_START
  nssm start dev-erp
  ```
  이 설정은 Tailscale Serve HTTPS 전제다. 자동 재시작은 NSSM 기본. 중지:
  `nssm stop dev-erp`, 제거: `nssm remove dev-erp confirm`.

  owner 가 직접 LAN HTTP 파일럿을 승인한 경우에만 `--host 0.0.0.0` 로 바꾸고,
  `DEV_ERP_COOKIE_SECURE=1` 은 설정하지 않는다.

**B) 작업 스케줄러 (간단)**
- Tailscale HTTPS 운영이면 작업 스케줄러 → 작업 만들기 → 트리거 "시스템 시작 시" →
  동작 `start-tailscale-windows.bat` 실행 → "작업이 실패하면 다시 시작" 옵션.
  로그인 세션 의존도는 낮게 "사용자 로그온 여부 관계없이 실행"으로 둔다.
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

## 9. 지식 화면 데이터 평면 (2026-07-04)

지식 탭의 각 영역은 서로 다른 데이터 평면을 읽는다. 배포본에서 빈 화면이 나오면 아래를 확인한다:

- **서가 현황(공통·도메인·자산)·위키 본문**: `_workspaces/knowledge/**`(공유 OneDrive 정션)에서
  읽는다. 정션이 마운트돼 있으면 운영본에서도 정상.
- **과제별 표(장서·수집 영수증·후보)·사용 기록·줄기 그래프**: `_workmeta/<과제코드>/**` 에서
  읽는다. 이건 project-local private repo 라 운영 clone 에 **함께 pull 돼 있어야** 화면에 뜬다
  (`/soulforge-github-down` 의 private repo 신선도 체크 대상). 과제 위키 자체는 공유 정션에 있어
  `_workmeta` 없이도 목록·본문이 보이지만, 수집 이력/후보/줄기 그래프는 `_workmeta` 과제 디렉터리가
  운영본에 없으면 비어 보인다(현재 운영 `_workmeta` 는 P00-000_INBOX 만 있을 수 있음 — owner 가
  과제 `_workmeta` 동기화 범위를 결정한다).
