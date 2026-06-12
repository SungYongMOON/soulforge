// dev-erp 저장 계층 (DESIGN.md 7절 구현)
// 구역 3개: core_*(업무 진실) / event_log(append-only) / game_*(게임 확장).
// 원칙: 몬스터=업무 레코드 동일 행, 게임 전용은 확장 테이블, 점수는 계산,
//       연결은 stable id + ref 문자열.
import { DatabaseSync } from "node:sqlite";

export const SCHEMA_VERSION = "dev_erp.v1";

const DDL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS core_project (
  id TEXT PRIMARY KEY,            -- 예: P00-TEST (stable id = 주소)
  title TEXT NOT NULL,
  health TEXT NOT NULL DEFAULT 'ok',   -- ok|watch|risk|stopped
  stage_current TEXT,
  source_ref TEXT,                -- soulforge ref (있다면)
  data_label TEXT NOT NULL DEFAULT 'synthetic'
);
CREATE TABLE IF NOT EXISTS core_stage (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES core_project(id),
  title TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  gate_rule TEXT,                 -- 필수 산출물/조건 설명 (P4에서 강제 로직)
  status TEXT NOT NULL DEFAULT 'open'  -- open|cleared
);
CREATE TABLE IF NOT EXISTS core_person (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  data_label TEXT NOT NULL DEFAULT 'synthetic'
);
CREATE TABLE IF NOT EXISTS core_item (   -- 몬스터 = 할일 (동일 행)
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES core_project(id),
  stage_id TEXT,
  title TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'manual',      -- mail|schedule|manual
  spawn_kind TEXT NOT NULL DEFAULT 'spawned', -- spawned|fixed|respawn
  encounter_role TEXT NOT NULL DEFAULT 'normal', -- normal|elite|boss
  difficulty INTEGER NOT NULL DEFAULT 2,      -- 1~5
  urgency TEXT NOT NULL DEFAULT 'normal',     -- low|normal|high
  automation_level TEXT NOT NULL DEFAULT 'manual', -- manual|assisted|semi|auto
  assignee_ref TEXT,                          -- core_person.id 또는 unit ref
  party_ref TEXT,
  status TEXT NOT NULL DEFAULT 'open',        -- open|doing|waiting|blocked|done
  due TEXT,                                   -- YYYY-MM-DD
  result TEXT,
  log_ref TEXT,
  data_label TEXT NOT NULL DEFAULT 'synthetic'
);
CREATE TABLE IF NOT EXISTS core_mail (   -- 메일 이력 metadata-only
  id TEXT PRIMARY KEY,
  project_id TEXT,
  at TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'in',  -- in|out
  subject TEXT NOT NULL,                 -- 제목 메타 (원문 본문 저장 금지)
  counterpart TEXT,                      -- 상대 (별칭/회사명 수준)
  pointer_ref TEXT,                      -- 원문 위치 포인터 (보호 저장소)
  data_label TEXT NOT NULL DEFAULT 'synthetic'
);
CREATE TABLE IF NOT EXISTS core_artifact ( -- 산출물 포인터 (원문 미저장)
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,                    -- bom|schematic|gerber|report|note|etc
  title TEXT NOT NULL,
  pointer TEXT NOT NULL,                 -- 경로/저장소 포인터
  sha256 TEXT,
  updated_at TEXT,
  data_label TEXT NOT NULL DEFAULT 'synthetic'
);
CREATE TABLE IF NOT EXISTS event_log (   -- append-only. battle_event 호환
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_ref TEXT NOT NULL,
  actor_kind TEXT NOT NULL DEFAULT 'human',  -- human|ai|mixed|system
  item_ref TEXT,
  kind TEXT NOT NULL,                    -- ingest|view|status|comment|...
  from_val TEXT,
  to_val TEXT,
  intervention_count INTEGER,
  bottleneck_reason TEXT,
  used_refs TEXT,                        -- JSON 배열: 사용한 skill/knowledge/tool ref
  data_label TEXT NOT NULL DEFAULT 'synthetic',
  note TEXT
);
CREATE TABLE IF NOT EXISTS game_profile ( -- 게임 전용 확장 (core 는 모름)
  item_ref TEXT PRIMARY KEY REFERENCES core_item(id),
  sprite TEXT,
  grade_override TEXT,                   -- 슬라임|오크|트롤|보스 표시 오버라이드
  lore TEXT
);
CREATE INDEX IF NOT EXISTS idx_item_proj ON core_item(project_id, status);
CREATE INDEX IF NOT EXISTS idx_item_due ON core_item(due);
CREATE INDEX IF NOT EXISTS idx_mail_at ON core_mail(at);
CREATE INDEX IF NOT EXISTS idx_event_at ON event_log(at);
`;

export function openStore(path = ":memory:") {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec(DDL);
  const cur = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get();
  if (!cur) {
    db.prepare("INSERT INTO meta(key,value) VALUES('schema_version',?)").run(SCHEMA_VERSION);
  }
  return new Store(db);
}

export class Store {
  constructor(db) {
    this.db = db;
  }

  // --- event log (라벨링 우선 원칙: used_refs[] + data_label 필수 자리) ---
  appendEvent(event) {
    const at = event.at ?? new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO event_log(at,actor_ref,actor_kind,item_ref,kind,from_val,to_val,
          intervention_count,bottleneck_reason,used_refs,data_label,note)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        at,
        event.actor_ref ?? "system",
        event.actor_kind ?? "system",
        event.item_ref ?? null,
        event.kind,
        event.from ?? null,
        event.to ?? null,
        event.intervention_count ?? null,
        event.bottleneck_reason ?? null,
        JSON.stringify(event.used_refs ?? []),
        event.data_label ?? "synthetic",
        event.note ?? null
      );
  }

  recentEvents(limit = 20) {
    return this.db
      .prepare("SELECT * FROM event_log ORDER BY id DESC LIMIT ?")
      .all(limit)
      .map((row) => ({ ...row, used_refs: JSON.parse(row.used_refs ?? "[]") }));
  }

  // --- upserts (adapter/fixture 용) ---
  upsertProject(p) {
    this.db
      .prepare(
        `INSERT INTO core_project(id,title,health,stage_current,source_ref,data_label)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, health=excluded.health,
           stage_current=excluded.stage_current, source_ref=excluded.source_ref`
      )
      .run(p.id, p.title, p.health ?? "ok", p.stage_current ?? null, p.source_ref ?? null, p.data_label ?? "synthetic");
  }

  upsertStage(s) {
    this.db
      .prepare(
        `INSERT INTO core_stage(id,project_id,title,seq,gate_rule,status) VALUES (?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, seq=excluded.seq,
           gate_rule=excluded.gate_rule, status=excluded.status`
      )
      .run(s.id, s.project_id, s.title, s.seq ?? 0, s.gate_rule ?? null, s.status ?? "open");
  }

  upsertPerson(p) {
    this.db
      .prepare(
        `INSERT INTO core_person(id,name,role,data_label) VALUES (?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role`
      )
      .run(p.id, p.name, p.role ?? null, p.data_label ?? "synthetic");
  }

  upsertItem(i) {
    this.db
      .prepare(
        `INSERT INTO core_item(id,project_id,stage_id,title,origin,spawn_kind,encounter_role,
           difficulty,urgency,automation_level,assignee_ref,party_ref,status,due,result,log_ref,data_label)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, stage_id=excluded.stage_id,
           status=excluded.status, due=excluded.due, assignee_ref=excluded.assignee_ref,
           urgency=excluded.urgency, automation_level=excluded.automation_level,
           encounter_role=excluded.encounter_role, result=excluded.result`
      )
      .run(
        i.id, i.project_id, i.stage_id ?? null, i.title,
        i.origin ?? "manual", i.spawn_kind ?? "spawned", i.encounter_role ?? "normal",
        i.difficulty ?? 2, i.urgency ?? "normal", i.automation_level ?? "manual",
        i.assignee_ref ?? null, i.party_ref ?? null, i.status ?? "open",
        i.due ?? null, i.result ?? null, i.log_ref ?? null, i.data_label ?? "synthetic"
      );
  }

  upsertMail(m) {
    this.db
      .prepare(
        `INSERT INTO core_mail(id,project_id,at,direction,subject,counterpart,pointer_ref,data_label)
         VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, subject=excluded.subject`
      )
      .run(m.id, m.project_id ?? null, m.at, m.direction ?? "in", m.subject, m.counterpart ?? null, m.pointer_ref ?? null, m.data_label ?? "synthetic");
  }

  upsertArtifact(a) {
    this.db
      .prepare(
        `INSERT INTO core_artifact(id,project_id,kind,title,pointer,sha256,updated_at,data_label)
         VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, title=excluded.title,
           pointer=excluded.pointer, sha256=excluded.sha256, updated_at=excluded.updated_at`
      )
      .run(a.id, a.project_id, a.kind, a.title, a.pointer, a.sha256 ?? null, a.updated_at ?? null, a.data_label ?? "synthetic");
  }

  // --- 조회 (읽기 콕핏) ---
  summary(todayKey) {
    const projects = this.db.prepare("SELECT * FROM core_project ORDER BY id").all();
    const counts = this.db
      .prepare(
        `SELECT project_id,
           SUM(CASE WHEN status NOT IN ('done') THEN 1 ELSE 0 END) AS open_cnt,
           SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END) AS blocked_cnt,
           SUM(CASE WHEN status NOT IN ('done') AND due IS NOT NULL AND due <= ? THEN 1 ELSE 0 END) AS due_cnt,
           SUM(CASE WHEN encounter_role='boss' AND status NOT IN ('done') THEN 1 ELSE 0 END) AS boss_cnt
         FROM core_item GROUP BY project_id`
      )
      .all(todayKey);
    const byId = new Map(counts.map((c) => [c.project_id, c]));
    return projects.map((p) => ({
      ...p,
      open: byId.get(p.id)?.open_cnt ?? 0,
      blocked: byId.get(p.id)?.blocked_cnt ?? 0,
      due_soon: byId.get(p.id)?.due_cnt ?? 0,
      boss_open: byId.get(p.id)?.boss_cnt ?? 0
    }));
  }

  items({ project, status, q, due_before } = {}) {
    const cond = [];
    const args = [];
    if (project) { cond.push("project_id=?"); args.push(project); }
    if (status) { cond.push("status=?"); args.push(status); }
    if (due_before) { cond.push("due IS NOT NULL AND due<=? AND status NOT IN ('done')"); args.push(due_before); }
    if (q) { cond.push("title LIKE ?"); args.push(`%${q}%`); }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return this.db
      .prepare(`SELECT * FROM core_item ${where} ORDER BY (due IS NULL), due, id LIMIT 500`)
      .all(...args);
  }

  mail({ project, days } = {}) {
    const cond = [];
    const args = [];
    if (project) { cond.push("project_id=?"); args.push(project); }
    if (days) {
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      cond.push("at>=?"); args.push(cutoff);
    }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return this.db.prepare(`SELECT * FROM core_mail ${where} ORDER BY at DESC LIMIT 500`).all(...args);
  }

  artifacts({ project, kind } = {}) {
    const cond = [];
    const args = [];
    if (project) { cond.push("project_id=?"); args.push(project); }
    if (kind) { cond.push("kind=?"); args.push(kind); }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return this.db.prepare(`SELECT * FROM core_artifact ${where} ORDER BY updated_at DESC, id LIMIT 500`).all(...args);
  }

  people() {
    return this.db.prepare("SELECT * FROM core_person ORDER BY id").all();
  }

  counts() {
    const one = (sql) => this.db.prepare(sql).get().c;
    return {
      projects: one("SELECT COUNT(*) c FROM core_project"),
      items: one("SELECT COUNT(*) c FROM core_item"),
      mail: one("SELECT COUNT(*) c FROM core_mail"),
      artifacts: one("SELECT COUNT(*) c FROM core_artifact"),
      events: one("SELECT COUNT(*) c FROM event_log")
    };
  }
}
