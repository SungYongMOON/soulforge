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
  class TEXT NOT NULL DEFAULT 'active', -- active|inbox|internal|archive (페르소나 합의 분류)
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
  guide_artifact_id INTEGER,                  -- P2a: 가이드 산출물 연결 (선택)
  guide_step_key TEXT,                        -- P2a: 가이드 스텝 연결 (선택)
  origin_mail_id TEXT,                        -- P2a: 메일→할일 승격 출처 (메일 메타 id)
  created_by TEXT,                            -- P2a: RBAC 설계 자리 (강제는 P2b)
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
  note TEXT,
  project_ref TEXT                       -- P2a: 과제 차원 (허브 이력 필터)
);
CREATE TABLE IF NOT EXISTS guide_artifact ( -- 가이드: 과제×단계의 산출물 등록 (메타)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  stage_code TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE(project_id, stage_code, name)
);
CREATE TABLE IF NOT EXISTS guide_step (     -- 가이드: 산출물 절차 스텝 체크 상태
  artifact_id INTEGER NOT NULL REFERENCES guide_artifact(id),
  step_key TEXT NOT NULL,
  done_at TEXT,
  actor TEXT,
  PRIMARY KEY (artifact_id, step_key)
);
CREATE TABLE IF NOT EXISTS mail_label (   -- Gmail식 수동 라벨 (메타데이터, 첫 쓰기 도메인)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#195a8e'
);
CREATE TABLE IF NOT EXISTS mail_label_map (
  mail_id TEXT NOT NULL,
  label_id INTEGER NOT NULL REFERENCES mail_label(id),
  PRIMARY KEY (mail_id, label_id)
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
  // 경량 마이그레이션: 기존 DB 에 새 컬럼 추가 (있으면 무시)
  try { db.exec("ALTER TABLE core_project ADD COLUMN class TEXT NOT NULL DEFAULT 'active'"); } catch { /* exists */ }
  for (const ddl of [
    "ALTER TABLE core_item ADD COLUMN guide_artifact_id INTEGER",
    "ALTER TABLE core_item ADD COLUMN guide_step_key TEXT",
    "ALTER TABLE core_item ADD COLUMN origin_mail_id TEXT",
    "ALTER TABLE core_item ADD COLUMN created_by TEXT",
    "ALTER TABLE event_log ADD COLUMN project_ref TEXT"
  ]) {
    try { db.exec(ddl); } catch { /* exists */ }
  }
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
          intervention_count,bottleneck_reason,used_refs,data_label,note,project_ref)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
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
        event.note ?? null,
        event.project_ref ?? null
      );
  }

  recentEvents(limit = 20, project = null) {
    const where = project ? "WHERE project_ref=?" : "";
    const args = project ? [project, limit] : [limit];
    return this.db
      .prepare(`SELECT * FROM event_log ${where} ORDER BY id DESC LIMIT ?`)
      .all(...args)
      .map((row) => ({ ...row, used_refs: JSON.parse(row.used_refs ?? "[]") }));
  }

  // --- upserts (adapter/fixture 용) ---
  upsertProject(p) {
    this.db
      .prepare(
        `INSERT INTO core_project(id,title,health,class,stage_current,source_ref,data_label)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, health=excluded.health,
           class=excluded.class, stage_current=excluded.stage_current, source_ref=excluded.source_ref`
      )
      .run(p.id, p.title, p.health ?? "ok", p.class ?? "active", p.stage_current ?? null, p.source_ref ?? null, p.data_label ?? "synthetic");
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
  // 페르소나 합의: due 3버킷 분리(연체/오늘/주내), 마지막 움직임, 미연결(—) 구분
  summary(todayKey, weekEndKey = todayKey) {
    const projects = this.db.prepare("SELECT * FROM core_project ORDER BY id").all();
    const counts = this.db
      .prepare(
        `SELECT project_id,
           COUNT(*) AS total_cnt,
           SUM(CASE WHEN status NOT IN ('done') THEN 1 ELSE 0 END) AS open_cnt,
           SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END) AS blocked_cnt,
           SUM(CASE WHEN status NOT IN ('done') AND due IS NOT NULL AND due < ? THEN 1 ELSE 0 END) AS overdue_cnt,
           SUM(CASE WHEN status NOT IN ('done') AND due = ? THEN 1 ELSE 0 END) AS today_cnt,
           SUM(CASE WHEN status NOT IN ('done') AND due > ? AND due <= ? THEN 1 ELSE 0 END) AS week_cnt,
           SUM(CASE WHEN encounter_role='boss' AND status NOT IN ('done') THEN 1 ELSE 0 END) AS boss_cnt
         FROM core_item GROUP BY project_id`
      )
      .all(todayKey, todayKey, todayKey, weekEndKey);
    const lastMail = this.db
      .prepare("SELECT project_id, MAX(at) AS last_at, COUNT(*) AS mail_cnt FROM core_mail GROUP BY project_id")
      .all();
    const lastSubject = new Map(
      this.db
        .prepare(
          `SELECT m1.project_id, m1.subject FROM core_mail m1
           JOIN (SELECT project_id, MAX(at) AS last_at FROM core_mail GROUP BY project_id) m2
             ON m1.project_id = m2.project_id AND m1.at = m2.last_at`
        )
        .all()
        .map((r) => [r.project_id, r.subject])
    );
    const byId = new Map(counts.map((c) => [c.project_id, c]));
    const mailById = new Map(lastMail.map((m) => [m.project_id, m]));
    return projects.map((p) => {
      const c = byId.get(p.id);
      return {
        ...p,
        has_items: (c?.total_cnt ?? 0) > 0,
        open: c?.open_cnt ?? 0,
        blocked: c?.blocked_cnt ?? 0,
        overdue: c?.overdue_cnt ?? 0,
        due_today: c?.today_cnt ?? 0,
        due_week: c?.week_cnt ?? 0,
        boss_open: c?.boss_cnt ?? 0,
        mail_cnt: mailById.get(p.id)?.mail_cnt ?? 0,
        last_activity_at: mailById.get(p.id)?.last_at ?? null,
        last_mail_subject: lastSubject.get(p.id) ?? null
      };
    });
  }

  items({ project, status, q, due_before } = {}) {
    const cond = [];
    const args = [];
    if (project) { cond.push("i.project_id=?"); args.push(project); }
    if (status) { cond.push("i.status=?"); args.push(status); }
    if (due_before) { cond.push("i.due IS NOT NULL AND i.due<=? AND i.status NOT IN ('done')"); args.push(due_before); }
    if (q) { cond.push("i.title LIKE ?"); args.push(`%${q}%`); }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return this.db
      .prepare(
        `SELECT i.*, ga.name AS guide_artifact_name, ga.stage_code AS guide_stage_code
         FROM core_item i LEFT JOIN guide_artifact ga ON ga.id = i.guide_artifact_id
         ${where} ORDER BY (i.due IS NULL), i.due, i.id LIMIT 500`
      )
      .all(...args);
  }

  // --- P2a 할일 쓰기 (run16): 생성/상태/담당/메일 승격 — 모든 변경은 server 가 event_log 에 기록 ---
  static ITEM_STATUSES = ["open", "doing", "waiting", "blocked", "done"];

  createItem({ project_id, title, assignee_ref, due, urgency, guide_artifact_id, guide_step_key, origin_mail_id, origin, created_by }) {
    const trimmed = String(title ?? "").trim();
    if (!trimmed) return { error: "title_required" };
    if (!this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(project_id)) return { error: "project_not_found" };
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { error: "due_format" };
    let artifact = null;
    if (guide_artifact_id) {
      artifact = this.db.prepare("SELECT * FROM guide_artifact WHERE id=?").get(Number(guide_artifact_id));
      if (!artifact) return { error: "guide_artifact_not_found" };
      if (artifact.project_id !== project_id) return { error: "guide_artifact_project_mismatch" };
    }
    const id = `itm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    this.db
      .prepare(
        `INSERT INTO core_item(id,project_id,title,origin,urgency,assignee_ref,status,due,
           guide_artifact_id,guide_step_key,origin_mail_id,created_by,data_label)
         VALUES (?,?,?,?,?,?,'open',?,?,?,?,?,'real')`
      )
      .run(
        id, project_id, trimmed, origin ?? "manual", urgency ?? "normal",
        assignee_ref ?? null, due ?? null,
        guide_artifact_id ? Number(guide_artifact_id) : null, guide_step_key ?? null,
        origin_mail_id ?? null, created_by ?? null
      );
    return { ok: true, item: this.db.prepare("SELECT * FROM core_item WHERE id=?").get(id) };
  }

  setItemStatus(id, status) {
    if (!Store.ITEM_STATUSES.includes(status)) return { error: "bad_status" };
    const prev = this.db.prepare("SELECT status, project_id FROM core_item WHERE id=?").get(id);
    if (!prev) return { error: "item_not_found" };
    this.db.prepare("UPDATE core_item SET status=? WHERE id=?").run(status, id);
    return { ok: true, from: prev.status, project_id: prev.project_id };
  }

  setItemAssignee(id, assignee_ref) {
    const prev = this.db.prepare("SELECT assignee_ref, project_id FROM core_item WHERE id=?").get(id);
    if (!prev) return { error: "item_not_found" };
    this.db.prepare("UPDATE core_item SET assignee_ref=? WHERE id=?").run(assignee_ref || null, id);
    return { ok: true, from: prev.assignee_ref, project_id: prev.project_id };
  }

  // run17: 메일 과제 분류(재배정). 연결된 할일(origin_mail_id)도 함께 이동
  // (단일 진실: 몬스터=core_item 행 — 메일이 던전을 옮기면 그 몬스터도 동행).
  setMailProject(mail_id, project_id) {
    const mail = this.db.prepare("SELECT project_id FROM core_mail WHERE id=?").get(mail_id);
    if (!mail) return { error: "mail_not_found" };
    if (!this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(project_id)) return { error: "project_not_found" };
    if (mail.project_id === project_id) return { ok: true, from: mail.project_id, unchanged: true, item_moved: null };
    this.db.prepare("UPDATE core_mail SET project_id=? WHERE id=?").run(project_id, mail_id);
    const linked = this.db.prepare("SELECT id FROM core_item WHERE origin_mail_id=?").get(mail_id);
    if (linked) this.db.prepare("UPDATE core_item SET project_id=? WHERE id=?").run(project_id, linked.id);
    return { ok: true, from: mail.project_id, item_moved: linked?.id ?? null };
  }

  // run17: 묶음 분류 (+선택: 할일 생성 = 판타지 '몬스터 출몰').
  // 이미 승격된 메일은 중복 생성 없이 이동만. 결과는 메일별로 반환(이벤트는 호출자가 기록).
  assignMails(mail_ids, project_id, { make_items = false, created_by = null } = {}) {
    if (!Array.isArray(mail_ids) || mail_ids.length === 0) return { error: "mail_ids_required" };
    if (!this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(project_id)) return { error: "project_not_found" };
    const results = [];
    for (const mail_id of mail_ids) {
      const moved = this.setMailProject(mail_id, project_id);
      if (moved.error) { results.push({ mail_id, error: moved.error }); continue; }
      const entry = { mail_id, from: moved.from, unchanged: moved.unchanged ?? false, item_moved: moved.item_moved, item_created: null };
      if (make_items && !moved.item_moved) {
        const promoted = this.promoteMail(mail_id, created_by);
        if (promoted.ok) entry.item_created = promoted.item.id;
      }
      results.push(entry);
    }
    return { ok: true, project_id, results };
  }

  // 메일→할일 승격: 메일 메타(제목/과제)만 복사. 본문 없음(애초에 미적재).
  promoteMail(mail_id, created_by) {
    const mail = this.db.prepare("SELECT * FROM core_mail WHERE id=?").get(mail_id);
    if (!mail) return { error: "mail_not_found" };
    const dup = this.db.prepare("SELECT id FROM core_item WHERE origin_mail_id=?").get(mail_id);
    if (dup) return { error: "already_promoted", item_id: dup.id };
    if (!mail.project_id || !this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(mail.project_id)) {
      return { error: "mail_project_missing" };
    }
    return this.createItem({
      project_id: mail.project_id, title: mail.subject,
      origin: "mail", origin_mail_id: mail_id, created_by
    });
  }

  // Gmail식 확장: 기간(0=전체)/검색(제목·상대)/방향/수동라벨 필터 + 라벨 동봉
  mail({ project, days, q, direction, label_id } = {}) {
    const cond = [];
    const args = [];
    if (project) { cond.push("m.project_id=?"); args.push(project); }
    if (days) {
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      cond.push("m.at>=?"); args.push(cutoff);
    }
    if (q) { cond.push("(m.subject LIKE ? OR m.counterpart LIKE ?)"); args.push(`%${q}%`, `%${q}%`); }
    if (direction) { cond.push("m.direction=?"); args.push(direction); }
    if (label_id) { cond.push("EXISTS (SELECT 1 FROM mail_label_map x WHERE x.mail_id=m.id AND x.label_id=?)"); args.push(Number(label_id)); }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    const rows = this.db
      .prepare(
        `SELECT m.*, (SELECT GROUP_CONCAT(label_id) FROM mail_label_map mm WHERE mm.mail_id=m.id) AS label_ids
         FROM core_mail m ${where} ORDER BY m.at DESC LIMIT 500`
      )
      .all(...args);
    return rows.map((r) => ({ ...r, label_ids: r.label_ids ? String(r.label_ids).split(",").map(Number) : [] }));
  }

  // --- 가이드형 워크플로우 (run13): 산출물 등록 + 스텝 체크 (메타만) ---
  addGuideArtifact(projectId, stageCode, name) {
    const trimmed = String(name ?? "").trim();
    if (!trimmed) return { error: "artifact_name_required" };
    if (!this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(projectId)) return { error: "project_not_found" };
    try {
      this.db.prepare("INSERT INTO guide_artifact(project_id,stage_code,name) VALUES(?,?,?)").run(projectId, stageCode, trimmed);
    } catch {
      return { error: "artifact_exists" };
    }
    return { ok: true };
  }

  setGuideStep(artifactId, stepKey, on, actor = "owner") {
    const art = this.db.prepare("SELECT project_id FROM guide_artifact WHERE id=?").get(artifactId);
    if (!art) return { error: "artifact_not_found" };
    if (on) {
      this.db.prepare(
        `INSERT INTO guide_step(artifact_id,step_key,done_at,actor) VALUES(?,?,?,?)
         ON CONFLICT(artifact_id,step_key) DO UPDATE SET done_at=excluded.done_at, actor=excluded.actor`
      ).run(Number(artifactId), stepKey, new Date().toISOString(), actor);
    } else {
      this.db.prepare("DELETE FROM guide_step WHERE artifact_id=? AND step_key=?").run(Number(artifactId), stepKey);
    }
    return { ok: true, project_id: art.project_id };
  }

  guideState(projectId) {
    const artifacts = this.db
      .prepare("SELECT * FROM guide_artifact WHERE project_id=? ORDER BY stage_code, id")
      .all(projectId);
    const steps = this.db
      .prepare(
        `SELECT s.* FROM guide_step s JOIN guide_artifact a ON a.id=s.artifact_id WHERE a.project_id=?`
      )
      .all(projectId);
    const byArtifact = new Map();
    for (const s of steps) {
      if (!byArtifact.has(s.artifact_id)) byArtifact.set(s.artifact_id, {});
      byArtifact.get(s.artifact_id)[s.step_key] = { done_at: s.done_at, actor: s.actor };
    }
    return artifacts.map((a) => ({ ...a, steps: byArtifact.get(a.id) ?? {} }));
  }

  // --- 수동 라벨 (첫 쓰기 도메인: 메타데이터만, event_log 기록은 호출측) ---
  labels() {
    return this.db.prepare("SELECT * FROM mail_label ORDER BY name").all();
  }

  createLabel(name, color) {
    const trimmed = String(name ?? "").trim();
    if (!trimmed) return { error: "label_name_required" };
    try {
      this.db.prepare("INSERT INTO mail_label(name,color) VALUES(?,?)").run(trimmed, color || "#195a8e");
    } catch {
      return { error: "label_exists" };
    }
    return { label: this.db.prepare("SELECT * FROM mail_label WHERE name=?").get(trimmed) };
  }

  setMailLabel(mailId, labelId, on) {
    if (!this.db.prepare("SELECT 1 FROM core_mail WHERE id=?").get(mailId)) return { error: "mail_not_found" };
    if (!this.db.prepare("SELECT 1 FROM mail_label WHERE id=?").get(labelId)) return { error: "label_not_found" };
    if (on) {
      this.db.prepare("INSERT OR IGNORE INTO mail_label_map(mail_id,label_id) VALUES(?,?)").run(mailId, Number(labelId));
    } else {
      this.db.prepare("DELETE FROM mail_label_map WHERE mail_id=? AND label_id=?").run(mailId, Number(labelId));
    }
    return { ok: true };
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

  getMeta(key) {
    return this.db.prepare("SELECT value FROM meta WHERE key=?").get(key)?.value ?? null;
  }

  setMeta(key, value) {
    this.db.prepare("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, String(value));
  }

  // 실데이터 도착 시 합성 표본 제거 (fixture 는 언제든 재생성 가능)
  purgeSynthetic() {
    let removed = 0;
    // stage 는 data_label 이 없으므로 synthetic 프로젝트 소속분을 먼저 제거
    removed += this.db.prepare(
      "DELETE FROM core_stage WHERE project_id IN (SELECT id FROM core_project WHERE data_label='synthetic')"
    ).run().changes ?? 0;
    for (const t of ["core_item", "core_mail", "core_artifact", "core_person", "core_project", "event_log"]) {
      removed += this.db.prepare(`DELETE FROM ${t} WHERE data_label='synthetic'`).run().changes ?? 0;
    }
    return removed;
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
