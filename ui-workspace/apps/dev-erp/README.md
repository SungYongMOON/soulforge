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
node server.mjs --host 0.0.0.0  # trusted 사내 LAN 직접 파일럿(HTTP, Secure cookie OFF)
DEV_ERP_COOKIE_SECURE=1 node server.mjs --host 127.0.0.1  # HTTPS proxy/tunnel 뒤 운영
DEV_ERP_ALLOW_SELF_REGISTER=1 node server.mjs  # localhost 자가가입 파일럿 전용
```

HTTP 직접 LAN에서는 `DEV_ERP_COOKIE_SECURE=1` 을 켜지 않는다. Secure cookie 는
HTTPS proxy/tunnel 뒤에서만 로그인 세션이 정상 유지된다. 첫 관리자 이후 자가가입은
기본 차단되며, 팀 운영은 관리자 패널 또는 roster import 로 계정을 만든다.

운영 메모: AI(Claude)가 코드를 수정하면 `--watch` 실행 중인 서버가 스스로
재시작한다 — 수동 재시작 불필요. 상시 운영(tool_pc 이전 시)은 Soulforge
always-on(launchd) 패턴으로 등록해 부팅 자동 시작 + 비정상 종료 자동 복구를
붙인다 (P2 항목).

- 요구: Node.js 22.5+ (내장 `node:sqlite` 사용. 외부 패키지 0개)
- DB 가 비어 있으면 합성 fixture(synthetic 라벨) 자동 적재 — 실데이터 0
- 실데이터 적재는 정규화 JSON(`{projects[],items[],mail[],artifacts[]}`) 또는
  soulforge snapshot JSON 의 보수적 매핑만 지원. **원본 폴더를 직접 훑지 않는다**

## 팀 온보딩

회사 PC를 신뢰된 호스트로 두고 팀원이 접속한다. 메일 계정 비밀번호/토큰은 그
PC의 비공개 env 파일에 저장하고, ERP DB에는 `mailbox_env_ref` 포인터만 저장한다.
임시 비밀번호가 들어간 roster 파일은 public repo에 두지 않고, import 후 삭제하거나
회사 PC의 ignored/private 위치에만 보관한다.

```bash
npm run dev-erp:import-team-roster -- --db ui-workspace/apps/dev-erp/data/dev-erp.db --roster <private-team-roster.json>
npm run dev-erp:import-team-roster -- --db ui-workspace/apps/dev-erp/data/dev-erp.db --roster <private-team-roster.json> --apply
npm run dev-erp:export-team-mailboxes -- --db ui-workspace/apps/dev-erp/data/dev-erp.db --apply
npm run guild-hall:gateway:fetch:team -- --once --dry-run --json
npm run dev-erp:scan-mail-ledger -- --db ui-workspace/apps/dev-erp/data/dev-erp.db --apply
npm run dev-erp:mail-to-task-ledger -- --project P00-000_INBOX --skeleton --skeleton-review-tasks --default-review-days 3 --reminder-days 2 --apply
npm run dev-erp:task-ledger -- --db ui-workspace/apps/dev-erp/data/dev-erp.db --project P00-000_INBOX --apply
```

`import-team-roster` 는 dry-run 이 기본이며, roster 안의 임시 비밀번호는 출력하지
않는다. 기존 계정 비밀번호를 다시 초기화할 때만 `--reset-passwords` 를 붙인다.
`mail-to-task-ledger` 예시는 미배정 인박스용 폴백이며, 프로젝트별 메일 장부는
`--project <프로젝트코드>` 로 반복 실행한다.

## 검증

```bash
npm test
```

## 구조 (DESIGN.md 7절)

- `src/store.mjs` — core_*(업무 진실) / event_log(append-only, used_refs+data_label
  라벨 장착) / game_*(게임 확장, core 는 모름)
- `src/adapter.mjs` — 승인된 메타 표면만 읽는 ingest (불량 행은 skipped 보고)
- `src/lexicon.mjs` — 업무/판타지 이중 사전 (라벨 하드코딩 금지)
- `server.mjs` — node:http API + 정적 서빙 (빌드 단계 없음)
- `static/` — vanilla JS 클라이언트

## 한계 (P1 의도된 것)

- SQLite 파일럿. 소규모 팀 동시 읽기/간헐 쓰기 전제이며, 대규모 동시 쓰기는 PostgreSQL 검토.
- 팀 공개는 회사 PC 호스트 + 계정/RBAC + HTTPS proxy/tunnel 전제.
- 메일 원문/파일 본문 미저장 — 포인터와 메타만
- 전장 뷰(몹 시각화 본격판)는 P-G 별도 페이즈. P1 은 홈 카드의 몹 미터까지만
