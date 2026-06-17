# dev-erp Windows 사내 LAN 배포 런북 (HTTP 파일럿)

서버 1대(회사 고성능 **Windows** PC)에서 돌리고, 팀원이 각자 PC에서 사내 LAN으로 접속하는 구성.
신뢰된 사내망 소수 팀 파일럿 기준. (외부 공개·민감도 높으면 아래 7. HTTPS 로.)

전제: **Node.js 22.5 이상**(내장 `node:sqlite` 사용 — 외부 패키지 설치 0개).

---

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

## 2. 실행 (LAN)
dev-erp 폴더에서:
```
node server.mjs --host 0.0.0.0
```
또는 같은 폴더의 **`start-windows.bat` 더블클릭**. (`--host 0.0.0.0` = 사내 네트워크에서 접속 허용. 기본은 127.0.0.1 = 이 PC만.)

## 3. 접속 주소 + 방화벽
- 이 PC IP 확인: `ipconfig` → 활성 어댑터의 **IPv4 주소**(예 192.168.0.50). 팀원은 **`http://192.168.0.50:4300`**.
- IP 고정 권장: 공유기 DHCP 예약 또는 고정 IP(재부팅 때 IP 바뀌면 팀 북마크 깨짐).
- Windows 방화벽 인바운드 **TCP 4300 허용**:
  - 첫 실행 때 "Windows Defender 방화벽" 팝업 → **개인 네트워크 허용**, 또는
  - 관리자 명령 프롬프트:
    ```
    netsh advfirewall firewall add rule name="dev-erp 4300" dir=in action=allow protocol=TCP localport=4300
    ```

## 4. 상시 운영 (부팅 자동시작 + 죽으면 자동복구)
터미널 닫거나 재부팅하면 멈추므로 서비스로 등록한다. 둘 중 하나:

**A) NSSM (권장 — 로그인 안 해도 서비스로 상시)**
- https://nssm.cc 에서 nssm.exe 다운로드. 관리자 명령 프롬프트:
  ```
  nssm install dev-erp "C:\Program Files\nodejs\node.exe" server.mjs --host 0.0.0.0
  nssm set dev-erp AppDirectory "C:\경로\Soulforge\ui-workspace\apps\dev-erp"
  nssm set dev-erp Start SERVICE_AUTO_START
  nssm start dev-erp
  ```
  (자동 재시작은 NSSM 기본. 중지: `nssm stop dev-erp`, 제거: `nssm remove dev-erp confirm`.)

**B) 작업 스케줄러 (간단)**
- 작업 스케줄러 → 작업 만들기 → 트리거 "시스템 시작 시" → 동작 `start-windows.bat` 실행 → "작업이 실패하면 다시 시작" 옵션. (로그인 세션 의존도 낮게 "사용자 로그온 여부 관계없이 실행".)

## 5. 첫 길드마스터 + 팀원 + 점검
- 서버 PC 또는 같은 LAN 브라우저에서 `http://<서버IP>:4300` → 처음이면 게이트에서 **관리자 부트스트랩**(기존 DB 복사했으면 그대로 로그인).
- 관리자 패널 → 팀원 계정 추가(비밀번호는 사람이 입력) 또는 roster import. 메일함 설정.
- **릴리즈 게이트 점검**:
  ```
  npm run dev-erp:team-preflight -- --db ui-workspace/apps/dev-erp/data/dev-erp.db
  ```
  1차 `configuration_ready` → 메일 수집 후 2차 `team_use_ready`. (env 내용·경로·비번 출력 안 함.)
- 메일 수집 1회 → 할 일 생성 → '각자 메일=각자 일' 자동 배정. 지속 자동화: `set DEV_ERP_AUTOSYNC=1` 후 실행.

## 6. 보안 (정직하게)
- HTTP 라 로그인 비번·세션 쿠키가 **사내 LAN 에서 평문**으로 흐른다. 신뢰된 사내망 소수 팀 파일럿이면 시작 OK.
- HTTP 에서는 **`DEV_ERP_COOKIE_SECURE` 켜지 말 것**(Secure 쿠키는 HTTPS 필요 → 로그인 깨짐).
- 제대로 운영하려면 **HTTPS**: 리버스 프록시(예: Caddy 자동 인증서) 또는 터널 뒤에 두고 `set DEV_ERP_COOKIE_SECURE=1`.

## 7. 일단 릴리즈 최소 기준
preflight `configuration_ready` OK + 관리자·팀원 로그인 + 팀원이 자기 일 봄. (`team_use_ready`는 메일 수집 후 확인이어도 초기버전 충분.)

## 8. 평소 업데이트 절차 (개발 PC → 서버 PC)
새 기능·수정이 생기면:
1. **(개발 PC)** 변경 → **`/soulforge-github-up`** 으로 GitHub 푸시.
2. **(서버 Windows PC)** **`/soulforge-github-down`** 으로 풀(코드·스킬·private 신선도·정션 동기화).
3. **(서버 PC)** dev-erp 서버 **재시작** → 새 코드 적용:
   - NSSM 서비스면 `nssm restart dev-erp`
   - `start-windows.bat` 창이면 Ctrl+C 후 다시 더블클릭
   - 개발/즉시반영용이면 `node --watch server.mjs --host 0.0.0.0`(파일 변경 시 자동 재시작)

> DB·로컬 데이터·메일함 env 는 그대로 유지된다(git 제외). 코드만 갱신된다.
