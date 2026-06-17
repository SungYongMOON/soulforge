// UI-005: 현장 검색 — 검색 1회로 할 일/메일/산출물(+프로젝트)을 묶는다.
export function crossSearch(store, q, { assignee_any, mailbox } = {}) {
  const term = String(q ?? "").trim();
  if (!term) {
    return { q: "", projects: [], items: [], mail: [], artifacts: [] };
  }
  const like = `%${term}%`;
  const projects = store.db
    .prepare("SELECT * FROM core_project WHERE id LIKE ? OR title LIKE ? LIMIT 20")
    .all(like, like);
  const itemConds = ["(title LIKE ? OR id LIKE ? OR project_id LIKE ? OR origin_mail_id LIKE ? OR source_mail_ref LIKE ? OR source_mail_source_id LIKE ? OR source_thread_ref LIKE ? OR source_lineage_ref LIKE ?)"];
  const itemArgs = [like, like, like, like, like, like, like, like];
  if (Array.isArray(assignee_any)) {
    const ids = assignee_any.filter((x) => x != null && String(x).trim() !== "");
    if (ids.length) {
      itemConds.push(`(status='unclassified' OR assignee_ref IN (${ids.map(() => "?").join(",")}))`);
      itemArgs.push(...ids);
    } else {
      itemConds.push("status='unclassified'");
    }
  }
  const items = store.db
    .prepare(`SELECT * FROM core_item WHERE ${itemConds.join(" AND ")} ORDER BY (due IS NULL), due LIMIT 50`)
    .all(...itemArgs);
  const mailConds = ["(subject LIKE ? OR counterpart LIKE ? OR project_id LIKE ? OR id LIKE ? OR pointer_ref LIKE ? OR source_ref LIKE ?)"];
  const mailArgs = [like, like, like, like, like, like];
  if (mailbox && mailbox !== "team") {
    const mailScope = typeof store.mailboxScopeClause === "function" ? store.mailboxScopeClause("mailbox", mailbox) : null;
    if (mailScope) { mailConds.push(mailScope.sql); mailArgs.push(...mailScope.args); }
  }
  const mail = store.db
    .prepare(`SELECT * FROM core_mail WHERE ${mailConds.join(" AND ")} ORDER BY at DESC LIMIT 50`)
    .all(...mailArgs);
  const artifacts = store.db
    .prepare("SELECT * FROM core_artifact WHERE title LIKE ? OR kind LIKE ? OR project_id LIKE ? ORDER BY updated_at DESC LIMIT 50")
    .all(like, like, like);
  return { q: term, projects, items, mail, artifacts };
}
