# dev-erp — 개발팀 운영 콕핏 (P1: 읽기 전용)

설계 정본: [`docs/DESIGN.md`](docs/DESIGN.md) · 작업 큐: [`docs/checklist_phase1.json`](docs/checklist_phase1.json)

하드웨어/체계공학 개발팀의 운영 레이어. P1 은 read-only 콕핏이다:
프로젝트 홈, 할 일, 메일 이력(메타만), 산출물 포인터, 현장 검색 + 업무/판타지
표시 모드 전환.

## 실행 (의존성 설치 불필요)

```bash
node --watch server.mjs    # 권장: 파일 변경 시 자동 재시작 (AI 수정 즉시 반영)
node server.mjs            # 일반 실행. http://127.0.0.1:4300, DB: data/dev-erp.db
node server.mjs --db :memory:   # 일회성 실행
node server.mjs --ingest path/to/normalized.json   # 실데이터 메타 적재
node server.mjs --host 0.0.0.0  # 같은 Wi-Fi 공유 (합성 데이터 파일럿 한정)
```

## 인증 (G1: 로그인·계정)

모든 화면과 `/api/*` 는 로그인 필요(공개 경로: `/healthz`, `/api/login`, 로그인 페이지).
역할은 `admin`(관리자) / `member`(팀원, 담당자 구분용) 2단계. 비밀번호는
`node:crypto` scrypt 해시 + per-user salt 로만 저장(원문 저장 안 함). 계정 DB 는
`data/`(gitignore) 안에만 있다.

```bash
# 최초 실행 시 계정이 없으면 초기 admin 을 자동 생성하고 임시비번을 1회 출력
node server.mjs

# 팀원 계정 추가 (임시비번 1회 출력 → 사용자에게 전달, 첫 로그인 시 변경 강제)
node server.mjs --add-user kim --role member --name 김팀원
node server.mjs --add-user park --role admin            # 관리자 추가
node server.mjs --reset-pw kim                           # 비번 초기화(새 임시비번)
node server.mjs --list-users                             # 계정 목록
node server.mjs --disable-user kim                       # 비활성화(세션 무효)

# 네트워크로 열 때(사내망)는 TLS 뒤에 두고 --secure 로 쿠키 Secure 부여
node server.mjs --host 0.0.0.0 --secure
```

세션은 HttpOnly 쿠키(`deid`, 12시간). 임시비번은 발급 시 콘솔에 1회만 표시되며
저장되지 않는다. **평문 HTTP 로 네트워크에 직접 노출하지 말 것** — 사내망 공유는
리버스 프록시 TLS(G2) 뒤에서만. 역할별 read/write 강제(G3)는 후속 항목이다.

운영 메모: AI(Claude)가 코드를 수정하면 `--watch` 실행 중인 서버가 스스로
재시작한다 — 수동 재시작 불필요. 상시 운영(tool_pc 이전 시)은 Soulforge
always-on(launchd) 패턴으로 등록해 부팅 자동 시작 + 비정상 종료 자동 복구를
붙인다 (P2 항목).

- 요구: Node.js 22.5+ (내장 `node:sqlite` 사용. 외부 패키지 0개)
- DB 가 비어 있으면 합성 fixture(synthetic 라벨) 자동 적재 — 실데이터 0
- 실데이터 적재는 정규화 JSON(`{projects[],items[],mail[],artifacts[]}`) 또는
  soulforge snapshot JSON 의 보수적 매핑만 지원. **원본 폴더를 직접 훑지 않는다**

## 검증

```bash
npm test          # 코어 8건 (스키마/라벨링/어댑터/사전/검색)
```

## 구조 (DESIGN.md 7절)

- `src/store.mjs` — core_*(업무 진실) / event_log(append-only, used_refs+data_label
  라벨 장착) / game_*(게임 확장, core 는 모름)
- `src/adapter.mjs` — 승인된 메타 표면만 읽는 ingest (불량 행은 skipped 보고)
- `src/lexicon.mjs` — 업무/판타지 이중 사전 (라벨 하드코딩 금지)
- `server.mjs` — node:http API + 정적 서빙 (빌드 단계 없음)
- `static/` — vanilla JS 클라이언트

## 한계 (P1 의도된 것)

- read-only: 항목 생성/수정 없음 (쓰기 도메인은 P2 구매/발주부터)
- localhost 단독, 로그인 없음 (팀 공개 시점에 Workspace 도메인 + RBAC)
- 메일 원문/파일 본문 미저장 — 포인터와 메타만
- 전장 뷰(몹 시각화 본격판)는 P-G 별도 페이즈. P1 은 홈 카드의 몹 미터까지만
