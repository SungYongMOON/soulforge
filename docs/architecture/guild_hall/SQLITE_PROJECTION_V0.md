# SQLite Projection v0

## 목적

- 파일로 흩어진 metadata-only ledger (daily ledger, mission index, battle log
  aggregate, activity event) 를 local read-only SQLite projection 하나로 모아
  검색과 rollup 을 가능하게 한다.
- 목표는 "지난주에 무슨 일을 했지", "이 프로젝트에 어떤 기록이 남았지" 를
  파일 트리를 외우지 않고 질의하는 것이다.
- DB 는 파생물이다. source of truth 는 기존 파일 surface 에 남는다.

## owner

- contract: 이 문서 (`docs/architecture/guild_hall/SQLITE_PROJECTION_V0.md`)
- loader 구현 (Codex): `guild_hall/projection/` (신규 owner-local surface)
- local output: `guild_hall/state/projection/soulforge_projection.sqlite3`
- output tracking: local-only. public Git, `_workmeta`, `private-state` 어디에도
  commit 하지 않는다.

## 원칙

1. rebuild-from-files: loader 는 언제든 DB 파일을 지우고 source 파일에서
   전체 재구축할 수 있어야 한다. DB 에만 존재하는 truth 를 만들지 않는다.
2. metadata-only: 이미 metadata-only 로 설계된 surface 만 적재한다. 메일
   원문, 첨부, Office/PDF/HWP payload, source text chunk, NotebookLM 답변,
   secret, credential, raw payload 절대 경로는 적재 대상이 아니다.
3. read-only consumer: UI/검색 consumer 는 SELECT 만 수행한다. 업무 상태
   변경은 기존 owner surface (파일) 에서 한다.
4. 적재 실패는 gap 으로 기록한다. loader 가 source 를 추론으로 보완하지
   않는다.

## 적재 대상 (v0)

| source surface | 테이블 | 비고 |
| --- | --- | --- |
| `_workmeta/**/daily_ledger/**/*.yaml` | `daily_ledger_entries` | 이미 metadata-only 계약 (`DAILY_WORK_LEDGER_TAXONOMY_V0.md`) |
| `.mission/index.yaml` | `missions` | public-safe tracked summary |
| `_workmeta/*/log/events/**/battle_events.jsonl` | `battle_log_daily_aggregates` | snapshot 과 같은 aggregate 수준만. row-level pointer (event_id, stage, source_ref, party/unit/loop id, note) 는 적재하지 않는다 |
| `guild_hall/state/operations/soulforge_activity/events/**/*.jsonl` | `activity_events` | actor/scope/action/summary metadata. AI 작업자별 변경 추적 질의에 사용 |

v1 후보 (이번 범위 밖): knowledge_access ledger, triage register 신호,
gateway mail_work_status projection.

## 스키마 (DDL v0)

```sql
PRAGMA journal_mode = WAL;
PRAGMA user_version = 1;

CREATE TABLE IF NOT EXISTS projection_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
-- rows: schema_version=soulforge.sqlite_projection.v0,
--       generated_at, repo_ref, loader_version

CREATE TABLE IF NOT EXISTS daily_ledger_entries (
  entry_id TEXT NOT NULL,
  source_file_ref TEXT NOT NULL,
  ledger_date_local TEXT NOT NULL,
  ledger_family TEXT NOT NULL,
  ledger_code TEXT NOT NULL,
  project_code TEXT,
  soulforge_subledger TEXT,
  entry_kind TEXT NOT NULL,
  summary_label TEXT NOT NULL,
  work_item_ref TEXT,
  confidence TEXT NOT NULL,
  owner_review_state TEXT NOT NULL,
  report_visibility TEXT,
  started_at TEXT,
  ended_at TEXT,
  duration_minutes INTEGER,
  PRIMARY KEY (entry_id, source_file_ref)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_ledger_date ON daily_ledger_entries (ledger_date_local);
CREATE INDEX IF NOT EXISTS idx_ledger_project ON daily_ledger_entries (project_code, ledger_date_local);

CREATE TABLE IF NOT EXISTS missions (
  mission_id TEXT PRIMARY KEY,
  title TEXT,
  project_code TEXT,
  status TEXT,
  readiness_status TEXT,
  party_id TEXT,
  workflow_id_present INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE IF NOT EXISTS battle_log_daily_aggregates (
  project_code TEXT NOT NULL,
  event_date_local TEXT NOT NULL,
  event_count INTEGER NOT NULL,
  completed_count INTEGER NOT NULL,
  blocked_count INTEGER NOT NULL,
  intervention_total INTEGER NOT NULL,
  PRIMARY KEY (project_code, event_date_local)
) STRICT;

CREATE TABLE IF NOT EXISTS activity_events (
  entry_id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  date TEXT NOT NULL,
  node_id TEXT,
  node_role TEXT,
  actor TEXT NOT NULL,
  scope TEXT NOT NULL,
  project_code TEXT,
  action TEXT NOT NULL,
  summary TEXT
) STRICT;
CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_events (actor, date);

-- FTS5 PoC (Codex): 요약 텍스트 검색.
-- contentless 가 아닌 external-content 방식으로 원본 테이블과 동기화한다.
CREATE VIRTUAL TABLE IF NOT EXISTS ledger_fts USING fts5(
  summary_label,
  content='daily_ledger_entries',
  content_rowid='rowid'
);
```

- `STRICT` 테이블을 기본으로 한다 (SQLite 3.37+, Node 22 의 `node:sqlite`
  또는 시스템 sqlite3 모두 충족).
- battle log 는 일 단위 aggregate 로만 적재한다. 개별 event row 와 금지
  field 는 snapshot 계약 (`SOULFORGE_SNAPSHOT_V0.md`) 의 battle log 경계를
  그대로 따른다.

## loader 계약 (Codex 구현)

1. 입력: repo root. 출력: 위 local DB 파일.
2. 전체 rebuild 모드를 기본으로 한다 (`--rebuild`). 증분은 v1 후보다.
3. source 파일이 계약 위반 row 를 담고 있으면 해당 row 는 적재하지 않고
   `projection_meta` 에 skip count 를 남긴다.
4. 적재 후 row count 를 stdout JSON 으로 보고한다 (자동화/healer 연결용).
5. 명령 표면: `npm run guild-hall:projection:rebuild`,
   `npm run guild-hall:projection:query -- "<sql>"` (read-only 강제).
6. FTS5 PoC: `ledger_fts` 에 대해 한국어/영문 혼합 질의 smoke 3건을
   fixture 로 고정한다.

## validation

- synthetic fixture 로 rebuild → row count → 금지 패턴 부재
  (`DO_NOT_LEAK_*` sentinel, `.eml`, secret 패턴) 를 테스트로 고정한다.
- `npm run validate` 의 path policy 가 DB 파일을 tracked tree 에서
  거부하는지 확인한다 (`guild_hall/state/**` local-only 정책 재사용).

## non-goals

- 임베딩/벡터 인덱스, Postgres 전환 (패킷의 범위 제외 항목)
- DB 를 통한 상태 변경, 자동 라우팅, mission 생성
- source text indexing (RAG source-text lane 은 별도 owner-approved 경계)
- `_workspaces` 실파일 내용 적재

## 상태

- 2026-06-12: 스키마 계약 초안 작성 (`claude_fable-5`, 2026-06-11 보안
  슬라이스 패킷의 DB/검색 슬라이스 산출물). loader/FTS5 구현 전.
