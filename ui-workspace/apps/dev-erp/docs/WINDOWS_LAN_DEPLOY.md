# dev-erp Windows 사내 LAN 배포 런북 (HTTP 파일럿)

서버 1대(회사 고성능 **Windows** PC)에서 돌리고, 팀원이 각자 PC에서 사내 LAN으로 접속하는 구성.
신뢰된 사내망 소수 팀 파일럿 기준. (외부 공개·민감도 높으면 아래 7. HTTPS 로.)

전제: **Node.js 22.5 이상**(내장 `node:sqlite` 사용 — 외부 패키지 설치 0개).

---

## 0. 옮길 것 (맥 → Windows PC)
공개 repo 코드만으로는 메일·팀 데이터가 안 따라온다. **작업 트리 전체**를 옮긴다:

- `Soulforge/` (앱 + `.registry/knowledge/` + `ui-workspace/apps/dev-erp/` + `tools/`)
- `ui-workspace/apps/dev-erp/data/dev-erp.db` — **현재 데이터 유지하려면 같이 복사**(관리자 계정·과제·메일). 새로 시작이면 빼고 → 새 PC에서 부트스트랩.
- 메일/팀 도구가 읽는 사내 데이터: `guild_hall/state/...`(메일 등록부 `team_mailboxes.json`), `_workmeta/...`(메일 장부). 메일 수집·preflight 쓰려면 함께.
- **메일함 자격증명 env 파일**: repo 에 두지 말고 그 PC의 비공개 경로에 둔다. ERP DB 엔 `mailbox_env_ref` 포인터만(도구가 내용 안 읽음).

> repo 를 git clone 으로 받아도 되지만, DB·`_workmeta`·`guild_hall/state` 같은 비공개 데이터는 별도로 복사해야 한다(공개 repo 에 없음).

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
