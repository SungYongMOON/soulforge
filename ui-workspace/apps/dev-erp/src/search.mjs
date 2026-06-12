// UI-005: 현장 검색 — 검색 1회로 할 일/메일/산출물(+프로젝트)을 묶는다.
export function crossSearch(store, q) {
  const term = String(q ?? "").trim();
  if (!term) {
    return { q: "", projects: [], items: [], mail: [], artifacts: [] };
  }
  const like = `%${term}%`;
  const projects = store.db
    .prepare("SELECT * FROM core_project WHERE id LIKE ? OR title LIKE ? LIMIT 20")
    .all(like, like);
  const items = store.db
    .prepare("SELECT * FROM core_item WHERE title LIKE ? OR id LIKE ? OR project_id LIKE ? ORDER BY (due IS NULL), due LIMIT 50")
    .all(like, like, like);
  const mail = store.db
    .prepare("SELECT * FROM core_mail WHERE subject LIKE ? OR counterpart LIKE ? OR project_id LIKE ? ORDER BY at DESC LIMIT 50")
    .all(like, like, like);
  const artifacts = store.db
    .prepare("SELECT * FROM core_artifact WHERE title LIKE ? OR kind LIKE ? OR project_id LIKE ? ORDER BY updated_at DESC LIMIT 50")
    .all(like, like, like);
  return { q: term, projects, items, mail, artifacts };
}
