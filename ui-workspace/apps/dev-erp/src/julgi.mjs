// ui-workspace/apps/dev-erp/src/julgi.mjs — 과제 줄기 메모리 (project narrative tree)
//   행보관(상태 스냅샷)과 상보: 행보관=지금 상황 요약, 줄기=시작→지금 연결된 가닥(나무) + 완료=열매.
//   슬라이스1 = 데이터층만. 모델/추출 없음(척추 빌더·증분은 슬라이스2+). zero-dep: node:sqlite.
//   경계: 본문/첨부/secret 미저장 — text 는 한 줄 요약, source_ref 는 포인터(메일#·문서§·산출물)만.
import { DatabaseSync } from "node:sqlite";

// 줄기 항목 종류 8종 (착수문서·메일 어디서 와도 이 8종으로 흡수).
export const JULGI_TYPES = ["요구사항", "요청", "결정", "우리약속", "상대약속", "마감", "리스크", "전달완료"];
// 상태: 대기→열림→갱신→닫힘(완료) / 폐기. 시각화는 visualState 가 결정.
export const JULGI_STATUS = ["waiting", "open", "updated", "closed", "dropped"];
const SALIENCE = ["high", "normal", "low"];

export function ensureJulgiSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_memory_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      text TEXT NOT NULL,
      source_ref TEXT,
      salience TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'open',
      parent_id INTEGER,
      thread_key TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_julgi_project ON project_memory_item(project_id);
    CREATE INDEX IF NOT EXISTS idx_julgi_thread ON project_memory_item(project_id, thread_key);
  `);
}

const nowIso = () => new Date().toISOString();
const validType = (t) => { if (!JULGI_TYPES.includes(t)) throw new Error(`invalid_type:${t}`); return t; };
const validStatus = (s) => { if (!JULGI_STATUS.includes(s)) throw new Error(`invalid_status:${s}`); return s; };
const validSalience = (s) => (SALIENCE.includes(s) ? s : "normal");

// 항목 추가(가지 하나 붙이기). parent_id 로 척추→가지 트리, thread_key 로 같은 가닥 묶음.
export function addItem(db, item) {
  const { project_id, type, text } = item;
  if (!project_id) throw new Error("project_id_required");
  if (!String(text ?? "").trim()) throw new Error("text_required");
  validType(type);
  const now = nowIso();
  const status = item.status ? validStatus(item.status) : "open";
  const r = db.prepare(
    `INSERT INTO project_memory_item
       (project_id,type,text,source_ref,salience,status,parent_id,thread_key,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(
    project_id, type, String(text).trim(), item.source_ref ?? null, validSalience(item.salience),
    status, item.parent_id ?? null, item.thread_key ?? null, now, now
  );
  return Number(r.lastInsertRowid);
}

// 항목 갱신(가닥의 역사). text 만 바뀌면 status=updated 로 자동 표시(덮지 않고 흐름으로 남김).
export function updateItem(db, id, patch = {}) {
  const cur = db.prepare("SELECT * FROM project_memory_item WHERE id=?").get(id);
  if (!cur) throw new Error(`not_found:${id}`);
  const text = patch.text != null ? String(patch.text).trim() : cur.text;
  const status = patch.status != null
    ? validStatus(patch.status)
    : (patch.text != null && String(patch.text).trim() !== cur.text ? "updated" : cur.status);
  const salience = patch.salience != null ? validSalience(patch.salience) : cur.salience;
  const source_ref = patch.source_ref !== undefined ? patch.source_ref : cur.source_ref;
  db.prepare("UPDATE project_memory_item SET text=?,status=?,salience=?,source_ref=?,updated_at=? WHERE id=?")
    .run(text, status, salience, source_ref, nowIso(), id);
  return id;
}

export const closeItem = (db, id) => updateItem(db, id, { status: "closed" });

export function listByProject(db, project_id, { status, type } = {}) {
  let q = "SELECT * FROM project_memory_item WHERE project_id=?";
  const args = [project_id];
  if (status) { q += " AND status=?"; args.push(validStatus(status)); }
  if (type) { q += " AND type=?"; args.push(validType(type)); }
  q += " ORDER BY created_at ASC, id ASC";
  return db.prepare(q).all(...args);
}

// 시각 상태: 완료=열매(fruit), 대기=봉오리(bud), 폐기=dropped, 그 외=잎(leaf).
export function visualState(item) {
  if (item.type === "전달완료" || item.status === "closed") return "fruit";
  if (item.status === "waiting") return "bud";
  if (item.status === "dropped") return "dropped";
  return "leaf";
}

// 나무: 척추(parent 없음)를 root 로, parent_id 로 가지를 매단다. 각 노드에 visual(열매/잎/봉오리) 부착.
export function buildTree(db, project_id) {
  const rows = listByProject(db, project_id);
  const byId = new Map(rows.map((r) => [r.id, { ...r, visual: visualState(r), children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) byId.get(node.parent_id).children.push(node);
    else roots.push(node);
  }
  return roots;
}

// 1페이지 상태 뷰: 활성(대기/열림/갱신)만, salience 높은·최근 우선, 종류별 그룹. (행보관과 비슷한 '지금' 보기)
export function renderState(db, project_id, { limitPerType = 5 } = {}) {
  const active = listByProject(db, project_id).filter((r) => ["waiting", "open", "updated"].includes(r.status));
  const order = { high: 0, normal: 1, low: 2 };
  const groups = {};
  for (const t of JULGI_TYPES) groups[t] = [];
  for (const r of active) groups[r.type].push(r);
  for (const t of JULGI_TYPES) {
    groups[t].sort((a, b) => (order[a.salience] - order[b.salience]) || b.updated_at.localeCompare(a.updated_at));
    groups[t] = groups[t].slice(0, limitPerType);
  }
  return groups;
}

// 편의 핸들: openJulgi(path) → 작은 API. dbPath=":memory:" 면 인메모리(테스트용).
export function openJulgi(dbPath) {
  const db = new DatabaseSync(dbPath);
  ensureJulgiSchema(db);
  return {
    db,
    add: (i) => addItem(db, i),
    update: (id, p) => updateItem(db, id, p),
    close: (id) => closeItem(db, id),
    list: (p, o) => listByProject(db, p, o),
    tree: (p) => buildTree(db, p),
    state: (p, o) => renderState(db, p, o),
    close_db: () => db.close(),
  };
}
