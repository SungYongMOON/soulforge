// dev-erp P1 클라이언트 (no-build vanilla JS).
// 모든 라벨은 /api/lexicon 사전을 거친다 (하드코딩 금지, INFRA-004).
const state = {
  mode: localStorage.getItem("dev_erp_mode") || "business",
  view: "home",
  lex: {},
  projectFilter: "",
  pins: JSON.parse(localStorage.getItem("dev_erp_pins") || "[]")
};

function togglePin(v) {
  const i = state.pins.indexOf(v);
  if (i >= 0) state.pins.splice(i, 1); else state.pins.push(v);
  localStorage.setItem("dev_erp_pins", JSON.stringify(state.pins));
  render();
}

function labelFor(v) {
  if (v.startsWith("mod:")) {
    return (state.modules ?? []).find((x) => `mod:${x.id}` === v)?.nav ?? v;
  }
  return state.lex[navKey[v]] ?? v;
}

const $ = (sel) => document.querySelector(sel);
const api = async (path) => (await fetch(path)).json();
// XSS 방지: 외부 유래 문자열(메일 제목/상대/할일 제목 등)은 전부 esc() 경유
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const daysAgo = (iso, lex) => {
  if (!iso) return "-";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? lex.today_word : `${d}${lex.days_ago}`;
};
const post = (path, body) =>
  fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

function logView(view) {
  post("/api/events", {
    actor_ref: "owner", actor_kind: "human", kind: "view",
    to: view, used_refs: [`view:${view}`], data_label: "real", note: `mode=${state.mode}`
  }).catch(() => {});
}

async function loadLexicon() {
  const [data, mods] = await Promise.all([
    api(`/api/lexicon?mode=${state.mode}`),
    api(`/api/modules?mode=${state.mode}`)
  ]);
  state.lex = data.labels;
  state.modules = mods;
  document.body.dataset.mode = state.mode;
  $("#appTitle").textContent = state.lex.app_title;
  $("#modeLabel").textContent = state.lex.mode_label;
  $("#globalSearch").placeholder = state.lex.search_placeholder;
  renderNav();
}

function localTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const VIEWS = ["home", "items", "guide", "mail", "artifacts", "search"];
const navKey = { home: "nav_home", items: "nav_items", guide: "nav_guide", mail: "nav_mail", artifacts: "nav_artifacts", search: "nav_search" };

// IA 그룹: 운영 / 기록·이력 / 자재·구매 / 지식·도구 / 팀 (DESIGN 3절)
const NAV_LAYOUT = [
  { g: "group_work", items: ["home", "guide", "items", "mod:gates", "search"] },
  { g: "group_records", items: ["mail", "mod:meetings", "mod:reports", "artifacts"] },
  { g: "group_supply", items: ["mod:purchase", "mod:inventory", "mod:boards", "mod:stockwatch"] },
  { g: "group_knowledge", items: ["mod:knowledge", "mod:calculators", "mod:contacts"] },
  { g: "group_team", items: ["mod:requests", "mod:analytics"] }
];

function navButton(v) {
  const pinned = state.pins.includes(v);
  const star = `<i class="pin-btn ${pinned ? "on" : ""}" data-pin="${v}" title="${state.lex.pin_toggle}">${pinned ? "★" : "☆"}</i>`;
  if (v.startsWith("mod:")) {
    const m = (state.modules ?? []).find((x) => `mod:${x.id}` === v);
    if (!m) return "";
    return `<button data-v="${v}" class="${state.view === v ? "active" : ""}">
      <span>${m.nav}</span><span class="nav-side"><em class="phase-tag">${m.phase}</em>${star}</span></button>`;
  }
  return `<button data-v="${v}" class="${state.view === v ? "active" : ""}"><span>${state.lex[navKey[v]]}</span><span class="nav-side">${star}</span></button>`;
}

function renderNav() {
  const pinnedGroup = state.pins.length
    ? `<div class="nav-group"><div class="nav-group-label">${state.lex.group_pinned}</div>${state.pins.map(navButton).join("")}</div>`
    : "";
  $("#nav").innerHTML = pinnedGroup + NAV_LAYOUT.map(
    (group) => `<div class="nav-group">
      <div class="nav-group-label">${state.lex[group.g]}</div>
      ${group.items.map(navButton).join("")}</div>`
  ).join("");
  $("#nav").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => { state.view = b.dataset.v; render(); })
  );
  $("#nav").querySelectorAll(".pin-btn").forEach((p) =>
    p.addEventListener("click", (e) => { e.stopPropagation(); togglePin(p.dataset.pin); })
  );
  $("#favBar").innerHTML = state.pins.map(
    (v) => `<button class="fav-chip ${state.view === v ? "active" : ""}" data-v="${v}">${labelFor(v)}</button>`
  ).join("");
  $("#favBar").querySelectorAll(".fav-chip").forEach((c) =>
    c.addEventListener("click", () => { state.view = c.dataset.v; render(); })
  );
}

function renderModulePlaceholder(modId) {
  const m = (state.modules ?? []).find((x) => x.id === modId);
  if (!m) { $("#view").innerHTML = `<div class="empty">?</div>`; return; }
  const ths = m.columns.map((c) => `<th>${c}</th>`).join("");
  const dash = m.columns.map(() => `<td class="dim">—</td>`).join("");
  const incoming = m.incoming.map((i) => `<li>${i}</li>`).join("");
  $("#view").innerHTML = `
    <div class="module-head">
      <span class="phase-tag big">${m.phase} 가동 예정</span>
      <p>${m.desc}</p>
    </div>
    <table><thead><tr>${ths}</tr></thead>
      <tbody><tr>${dash}</tr><tr>${dash}</tr><tr>${dash}</tr></tbody></table>
    <div class="module-incoming"><h2>이 칸에 들어올 것</h2><ul>${incoming}</ul></div>`;
}

function statusBadge(s) {
  const label = state.lex[`status_${s}`] ?? s;
  return `<span class="status ${s}">${label}</span>`;
}

function dueCell(due, todayKey) {
  if (!due) return "<td>-</td>";
  const over = due <= todayKey;
  return `<td class="${over ? "due-over" : ""}">${due}</td>`;
}

const TILE_IDS = ["projects", "today", "blocked", "mail", "events"];

function activeTiles() {
  const saved = JSON.parse(localStorage.getItem("dev_erp_tiles") || "null");
  return Array.isArray(saved) ? saved : [...TILE_IDS]; // 기본: 전부 표시 (owner 질문: 기본 조합)
}

function miniRow(cells) {
  return `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
}

async function renderHome() {
  const tiles = activeTiles();
  const todayKey = new Date().toISOString().slice(0, 10);
  const data = await api("/api/summary");
  state._projCache = data.projects;
  $("#freshness").textContent = data.freshness ? `${state.lex.freshness}: ${localTime(data.freshness)}` : "";

  const L = state.lex;
  const projects = data.projects;
  const actives = projects.filter((p) => p.class === "active");
  const inbox = projects.filter((p) => p.class === "inbox");
  const internals = projects.filter((p) => p.class === "internal");
  const risk = (p) => p.blocked * 100 + p.overdue * 10 + p.due_today * 5 + p.due_week;
  actives.sort((a, b) => risk(b) - risk(a) || (b.last_activity_at ?? "").localeCompare(a.last_activity_at ?? ""));

  const kpi = `<div class="kpi-row">
    <div class="kpi red"><span>${L.kpi_blocked}</span><strong>${actives.reduce((s, p) => s + p.blocked, 0)}</strong></div>
    <div class="kpi red"><span>${L.kpi_overdue}</span><strong>${actives.reduce((s, p) => s + p.overdue, 0)}</strong></div>
    <div class="kpi amber"><span>${L.kpi_today}</span><strong>${actives.reduce((s, p) => s + p.due_today, 0)}</strong></div>
    <div class="kpi blue" data-jump="inbox-mail"><span>${L.kpi_inbox}</span><strong>${inbox.reduce((s, p) => s + p.mail_cnt, 0)}</strong></div>
  </div>`;

  const remainCell = (p) => {
    if (!p.has_items) return `<td class="dim" title="${L.not_connected}">—</td>`;
    const mobs = state.mode === "fantasy"
      ? Array.from({ length: Math.min(p.open, 12) }, () => '<span class="mob"></span>').join("")
      : "";
    return `<td class="num">${p.open} ${mobs}</td>`;
  };
  const dueCellBuckets = (p) => `<td>
      ${p.overdue ? `<span class="badge red">${L.overdue} ${p.overdue}</span>` : ""}
      ${p.due_today ? `<span class="badge amber">${L.today_due} ${p.due_today}</span>` : ""}
      ${p.due_week ? `<span class="badge">${L.week_due} ${p.due_week}</span>` : ""}
      ${!p.overdue && !p.due_today && !p.due_week ? '<span class="dim">-</span>' : ""}</td>`;
  const activeRows = actives.map((p) => `<tr class="proj-row" data-p="${esc(p.id)}">
      <td><strong>${esc(p.title)}</strong></td>
      <td>${esc(p.stage_current ?? "-")}</td>
      ${remainCell(p)}
      ${dueCellBuckets(p)}
      <td class="num">${p.blocked || '<span class="dim">0</span>'}</td>
      <td>${daysAgo(p.last_activity_at, L)}</td>
      <td class="mail-snip" title="${esc(p.last_mail_subject ?? "")}">${esc((p.last_mail_subject ?? "-").slice(0, 38))}</td>
    </tr>`).join("");

  const inboxStrip = inbox.map((p) => `<div class="inbox-strip" data-p="${esc(p.id)}">
      <span class="badge blue">${L.class_inbox}</span>
      <strong>${esc(p.id)}</strong> · ${L.kpi_inbox} ${p.mail_cnt}
      <button class="fav-chip" data-jump-mail="${esc(p.id)}">${L.view_mail}</button></div>`).join("");

  const internalBlock = internals.length
    ? `<details class="internal-fold"><summary>${L.class_internal} (${internals.length})</summary>
        ${internals.map((p) => `<span class="badge">${esc(p.id)}</span>`).join(" ")}</details>`
    : "";

  const sections = [];
  if (tiles.includes("projects")) {
    sections.push(`<section class="tile wide"><h4>${L.class_active} (${actives.length})</h4>
      <table class="proj-table"><thead><tr>
        <th>${L.project}</th><th>${L.stage}</th><th>${L.col_remaining}</th>
        <th>${L.col_due}</th><th>${L.blocked}</th><th>${L.col_last_activity}</th><th>${L.col_last_mail}</th>
      </tr></thead><tbody>${activeRows}</tbody></table>
      ${inboxStrip}${internalBlock}</section>`);
  }
  if (tiles.includes("today")) {
    const due = (await api("/api/items?due=soon")).slice(0, 8);
    sections.push(`<section class="tile"><h4>${state.lex.tile_today}</h4>${
      due.length ? `<table><tbody>${due.map((i) => miniRow([i.title, i.project_id, i.due ?? "-"])).join("")}</tbody></table>` : `<div class="empty">${state.lex.empty_items}</div>`}</section>`);
  }
  if (tiles.includes("blocked")) {
    const blocked = (await api("/api/items?status=blocked")).slice(0, 6);
    sections.push(`<section class="tile"><h4>${state.lex.tile_blocked}</h4>${
      blocked.length ? `<table><tbody>${blocked.map((i) => miniRow([i.title, i.project_id, statusBadge(i.status)])).join("")}</tbody></table>` : `<div class="empty">${state.lex.empty_items}</div>`}</section>`);
  }
  if (tiles.includes("mail")) {
    const mail = (await api("/api/mail?days=90")).slice(0, 6);
    sections.push(`<section class="tile"><h4>${state.lex.tile_mail}</h4>${
      mail.length ? `<table><tbody>${mail.map((m) => miniRow([localTime(m.at), m.subject])).join("")}</tbody></table>` : `<div class="empty">${state.lex.empty_mail}</div>`}</section>`);
  }
  if (tiles.includes("events")) {
    const events = await api("/api/events/recent");
    sections.push(`<section class="tile"><h4>${state.lex.tile_events}</h4>${
      events.length ? `<table><tbody>${events.slice(0, 6).map((e) => miniRow([localTime(e.at), e.actor_ref, e.kind])).join("")}</tbody></table>` : `<div class="empty">-</div>`}</section>`);
  }

  $("#view").innerHTML = `
    ${kpi}
    <div class="tile-toolbar"><button id="tileConfigBtn" class="fav-chip">${state.lex.tile_config}</button>
      <div id="tileConfig" class="tile-config hidden">${TILE_IDS.map((t) =>
        `<label><input type="checkbox" data-t="${t}" ${tiles.includes(t) ? "checked" : ""}/> ${state.lex[`tile_${t}`]}</label>`).join("")}</div></div>
    <div class="tile-grid">${sections.join("")}</div>`;

  $("#tileConfigBtn").addEventListener("click", () => $("#tileConfig").classList.toggle("hidden"));
  $("#view").querySelectorAll("#tileConfig input").forEach((cb) =>
    cb.addEventListener("change", () => {
      const next = [...$("#view").querySelectorAll("#tileConfig input:checked")].map((x) => x.dataset.t);
      localStorage.setItem("dev_erp_tiles", JSON.stringify(next));
      render();
    })
  );
  $("#view").querySelectorAll(".proj-row").forEach((r) =>
    r.addEventListener("click", () => { state.projectFilter = r.dataset.p; state.view = "items"; render(); })
  );
  $("#view").querySelectorAll("[data-jump-mail]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); state.projectFilter = b.dataset.jumpMail; state.view = "mail"; render(); })
  );
}

function projectCards(data) {
  return data.projects.map((p) => {
    const mobs = Array.from({ length: Math.min(p.open, 20) }, () => '<span class="mob"></span>').join("");
    const boss = p.boss_open > 0 ? '<span class="mob boss" title="boss"></span>' : "";
    return `<div class="card" data-p="${p.id}">
      <h3>${p.title}</h3>
      <div class="sub">${p.id} · ${state.lex.stage}: ${p.stage_current ?? "-"}</div>
      <div class="badges">
        <span class="badge">${state.lex.open} ${p.open}</span>
        <span class="badge red">${state.lex.blocked} ${p.blocked}</span>
        <span class="badge amber">${state.lex.due_soon} ${p.due_soon}</span>
        <span class="badge green">${state.lex.boss} ${p.boss_open}</span>
      </div>
      <div class="mobmeter">${mobs}${boss}<span class="label">${state.lex.backlog_meter} ${p.open}</span></div>
    </div>`;
  }).join("") || `<div class="empty">${state.lex.empty_items}</div>`;
}

async function renderItems() {
  const todayKey = new Date().toISOString().slice(0, 10);
  const summary = await api("/api/summary");
  const projects = summary.projects;
  const q = new URLSearchParams();
  if (state.projectFilter) q.set("project", state.projectFilter);
  if (state.statusFilter) q.set("status", state.statusFilter);
  const items = await api(`/api/items?${q}`);
  const opts = projects.map((p) => `<option value="${p.id}" ${state.projectFilter === p.id ? "selected" : ""}>${p.title}</option>`).join("");
  const statuses = ["open", "doing", "waiting", "blocked", "done"];
  const sopts = statuses.map((s) => `<option value="${s}" ${state.statusFilter === s ? "selected" : ""}>${state.lex[`status_${s}`]}</option>`).join("");
  const L = state.lex;
  const rows = items.map((i) => `<tr>
      <td>${i.title}${i.encounter_role === "boss" ? " 👑" : ""}</td>
      <td>${i.project_id}</td>
      <td>${statusBadge(i.status)}</td>
      ${dueCell(i.due, todayKey)}
      <td>${i.assignee_ref ?? "-"}</td>
      <td>${i.automation_level}</td>
    </tr>`).join("");
  $("#view").innerHTML = `
    <div class="filters">
      <select id="fProject"><option value="">${L.project}: ${L.all_label}</option>${opts}</select>
      <select id="fStatus"><option value="">${L.th_status}: ${L.all_label}</option>${sopts}</select>
    </div>
    ${rows ? `<table><thead><tr><th>${L.item}</th><th>${L.project}</th><th>${L.th_status}</th><th>${L.th_due}</th><th>${L.th_assignee}</th><th>${L.th_automation}</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">${L.empty_items}</div>`}`;
  $("#fProject").addEventListener("change", (e) => { state.projectFilter = e.target.value; render(); });
  $("#fStatus").addEventListener("change", (e) => { state.statusFilter = e.target.value; render(); });
}

// 결정적 프로젝트 라벨 색 (저채도 12팔레트 — 파워유저 페르소나 제안)
const LABEL_PALETTE = ["#3b6ea5", "#7c5db0", "#2c7a4b", "#9a6a00", "#b3552f", "#0e7490", "#a04668", "#5b7a2f", "#705a9e", "#207a6c", "#8a6d3b", "#54708a"];
function projColor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return LABEL_PALETTE[h % LABEL_PALETTE.length];
}
function projChip(projectId, cls) {
  if (!projectId || cls === "inbox") return `<span class="label-chip gray">${state.lex.unlabeled}</span>`;
  return `<span class="label-chip" style="--lc:${projColor(projectId)}" data-lp="${esc(projectId)}">${esc(projectId)}</span>`;
}

async function renderMail() {
  const L = state.lex;
  const f = state.mailFilters ?? (state.mailFilters = { days: 90, direction: "", q: "", label: null });
  const params = new URLSearchParams({ days: String(f.days) });
  if (state.projectFilter) params.set("project", state.projectFilter);
  if (f.q) params.set("q", f.q);
  if (f.direction) params.set("direction", f.direction);
  if (f.label) params.set("label_id", String(f.label));
  const [mail, labels, summary] = await Promise.all([
    api(`/api/mail?${params}`), api("/api/labels"), state._projCache ? Promise.resolve({ projects: state._projCache }) : api("/api/summary")
  ]);
  state._projCache = summary.projects;
  const clsById = new Map(summary.projects.map((p) => [p.id, p.class]));
  const labelById = new Map(labels.map((l) => [l.id, l]));

  const labelBar = `<div class="label-bar">
    ${labels.map((l) => `<span class="label-chip manual ${f.label === l.id ? "on" : ""}" style="--lc:${esc(l.color)}" data-l="${l.id}">${esc(l.name)}</span>`).join("")}
    <input id="newLabelName" placeholder="${L.label_new_ph}" size="10" />
    <button id="newLabelBtn" class="fav-chip">${L.label_add}</button>
  </div>`;

  const filterChips = state.projectFilter
    ? `<div class="filter-chips"><span class="fav-chip active">${esc(state.projectFilter)} <b data-clear="p">×</b></span></div>` : "";

  const toolbar = `<div class="filters">
    <select id="mDays">
      <option value="90" ${f.days === 90 ? "selected" : ""}>${L.period_90}</option>
      <option value="365" ${f.days === 365 ? "selected" : ""}>${L.period_365}</option>
      <option value="0" ${f.days === 0 ? "selected" : ""}>${L.period_all}</option>
    </select>
    <select id="mDir">
      <option value="">${L.dir_all}</option>
      <option value="in" ${f.direction === "in" ? "selected" : ""}>${L.mail_in}</option>
      <option value="out" ${f.direction === "out" ? "selected" : ""}>${L.mail_out}</option>
    </select>
    <input id="mSearch" type="search" placeholder="${L.search_placeholder}" value="${esc(f.q)}" />
  </div>`;

  const todayKey = new Date().toISOString().slice(0, 10);
  const weekStart = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const section = (m) => {
    const d = m.at.slice(0, 10);
    return d === todayKey ? "sec_today" : d >= weekStart ? "sec_week" : "sec_older";
  };
  let lastSec = null;
  const rows = mail.map((m) => {
    const sec = section(m);
    const head = sec !== lastSec ? `<tr class="date-sep"><td colspan="4">${L[sec]}</td></tr>` : "";
    lastSec = sec;
    const manual = m.label_ids.map((id) => labelById.get(id)).filter(Boolean)
      .map((l) => `<span class="label-chip manual mini" style="--lc:${esc(l.color)}">${esc(l.name)}</span>`).join("");
    return `${head}<tr class="mail-row ${state.mailSel === m.id ? "sel" : ""}" data-m="${esc(m.id)}">
      <td class="mail-meta">${projChip(m.project_id, clsById.get(m.project_id))}${manual}</td>
      <td class="mail-from">${m.direction === "out" ? `<i>→</i> ` : ""}${esc(m.counterpart ?? "-")}</td>
      <td class="mail-subj">${esc(m.subject)}</td>
      <td class="mail-time">${localTime(m.at)}</td>
    </tr>`;
  }).join("");

  const sel = mail.find((m) => m.id === state.mailSel);
  const detail = sel ? `<aside class="mail-detail">
      <h3>${esc(sel.subject)}</h3>
      <dl><div><dt>${L.th_counterpart}</dt><dd>${esc(sel.counterpart ?? "-")}</dd></div>
        <div><dt>${L.th_time}</dt><dd>${localTime(sel.at)} · ${sel.direction === "in" ? L.mail_in : L.mail_out}</dd></div>
        <div><dt>${L.project}</dt><dd>${esc(sel.project_id ?? "-")}</dd></div>
        <div><dt>${L.detail_pointer}</dt><dd class="pointer">${esc(sel.pointer_ref ?? "-")} <button class="copy-btn" data-c="${esc(sel.pointer_ref ?? "")}">${L.copy}</button></dd></div></dl>
      <h4>${L.detail_labels}</h4>
      <div class="label-bar">${labels.map((l) => `<span class="label-chip manual ${sel.label_ids.includes(l.id) ? "on" : ""}" style="--lc:${esc(l.color)}" data-toggle="${l.id}">${esc(l.name)}</span>`).join("") || `<span class="dim">-</span>`}</div>
    </aside>` : "";

  $("#view").innerHTML = `${labelBar}${filterChips}${toolbar}
    <div class="mail-split">${rows ? `<table class="mail-table"><tbody>${rows}</tbody></table>` : `<div class="empty">${L.empty_mail}</div>`}${detail}</div>`;

  $("#mDays").addEventListener("change", (e) => { f.days = Number(e.target.value); render(); });
  $("#mDir").addEventListener("change", (e) => { f.direction = e.target.value; render(); });
  $("#mSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") { f.q = e.target.value; render(); } });
  $("#view").querySelector("[data-clear]")?.addEventListener("click", () => { state.projectFilter = ""; render(); });
  $("#newLabelBtn").addEventListener("click", async () => {
    const name = $("#newLabelName").value.trim();
    if (!name) return;
    const r = await post("/api/labels", { name, color: LABEL_PALETTE[labels.length % LABEL_PALETTE.length] });
    if (r.ok) render();
  });
  $("#view").querySelectorAll(".label-bar [data-l]").forEach((c) =>
    c.addEventListener("click", () => { f.label = f.label === Number(c.dataset.l) ? null : Number(c.dataset.l); render(); })
  );
  $("#view").querySelectorAll(".mail-row").forEach((r) =>
    r.addEventListener("click", () => { state.mailSel = r.dataset.m; render(); })
  );
  $("#view").querySelectorAll("[data-lp]").forEach((c) =>
    c.addEventListener("click", (e) => { e.stopPropagation(); state.projectFilter = c.dataset.lp; render(); })
  );
  $("#view").querySelectorAll("[data-toggle]").forEach((c) =>
    c.addEventListener("click", async () => {
      const on = !c.classList.contains("on");
      await post("/api/mail/label", { mail_id: state.mailSel, label_id: Number(c.dataset.toggle), on });
      render();
    })
  );
  $("#view").querySelectorAll(".copy-btn").forEach((b) =>
    b.addEventListener("click", () => navigator.clipboard?.writeText(b.dataset.c))
  );
}

async function renderArtifacts() {
  const q = new URLSearchParams();
  if (state.projectFilter) q.set("project", state.projectFilter);
  const arts = await api(`/api/artifacts?${q}`);
  const L = state.lex;
  const rows = arts.map((a) => `<tr>
      <td>${a.title}</td><td>${a.kind}</td><td>${a.project_id}</td>
      <td>${a.updated_at ?? "-"}</td>
      <td class="pointer">${a.pointer} <button class="copy-btn" data-c="${a.pointer}">${L.copy}</button></td>
    </tr>`).join("");
  $("#view").innerHTML = rows
    ? `<table><thead><tr><th>${L.th_subject}</th><th>${L.th_kind}</th><th>${L.project}</th><th>${L.th_updated}</th><th>${L.th_pointer}</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<div class="empty">${L.empty_artifacts}</div>`;
  $("#view").querySelectorAll(".copy-btn").forEach((b) =>
    b.addEventListener("click", () => navigator.clipboard?.writeText(b.dataset.c))
  );
}

async function renderSearch(term) {
  const data = await api(`/api/search?q=${encodeURIComponent(term ?? "")}`);
  if (!data.q) { $("#view").innerHTML = `<div class="empty">${state.lex.search_hint}</div>`; return; }
  const sec = (title, rowsHtml, empty) =>
    `<div class="search-section"><h2>${title} </h2>${rowsHtml || `<div class="empty">${empty}</div>`}</div>`;
  const items = data.items.map((i) => `<tr><td>${i.title}</td><td>${i.project_id}</td><td>${statusBadge(i.status)}</td><td>${i.due ?? "-"}</td></tr>`).join("");
  const mail = data.mail.map((m) => `<tr><td>${m.at.slice(0, 10)}</td><td>${m.subject}</td><td>${m.counterpart ?? "-"}</td></tr>`).join("");
  const arts = data.artifacts.map((a) => `<tr><td>${a.title}</td><td>${a.kind}</td><td class="pointer">${a.pointer}</td></tr>`).join("");
  $("#view").innerHTML =
    sec(state.lex.nav_items, items && `<table><tbody>${items}</tbody></table>`, state.lex.empty_items) +
    sec(state.lex.nav_mail, mail && `<table><tbody>${mail}</tbody></table>`, state.lex.empty_mail) +
    sec(state.lex.nav_artifacts, arts && `<table><tbody>${arts}</tbody></table>`, state.lex.empty_artifacts);
}

// 가이드형 워크플로우 (run13): "폴더 순서 = 업무 순서" 를 화면으로
async function renderGuide() {
  const L = state.lex;
  const summary = state._projCache ? { projects: state._projCache } : await api("/api/summary");
  state._projCache = summary.projects;
  const actives = summary.projects.filter((p) => p.class === "active");
  if (!state.guideProject && actives[0]) state.guideProject = actives[0].id;
  const [tpl, arts] = await Promise.all([
    api(`/api/guide/templates?mode=${state.mode}`),
    state.guideProject ? api(`/api/guide?project=${encodeURIComponent(state.guideProject)}`) : Promise.resolve([])
  ]);
  const flowKeys = tpl.flow.map((s) => s.key);
  const doneCount = (a) => flowKeys.filter((k) => a.steps[k]).length;
  const totalSteps = arts.length * flowKeys.length;
  const totalDone = arts.reduce((s, a) => s + doneCount(a), 0);

  const stageBlock = (stage) => {
    const stageArts = arts.filter((a) => a.stage_code === stage.code);
    const sDone = stageArts.reduce((s, a) => s + doneCount(a), 0);
    const sTotal = stageArts.length * flowKeys.length;
    const artCards = stageArts.map((a) => {
      const dc = doneCount(a);
      const currentKey = flowKeys.find((k) => !a.steps[k]);
      const open = state.guideOpen === a.id;
      const stepRows = tpl.flow.map((s) => {
        const st = a.steps[s.key];
        const cls = st ? "done" : s.key === currentKey ? "current" : "";
        return `<div class="step-row ${cls}" data-a="${a.id}" data-s="${s.key}">
          <span class="step-check">${st ? "✓" : "○"}</span>
          <span class="step-name">${esc(s.name)}</span>
          <span class="step-hint">${esc(s.hint)}</span>
          ${st ? `<span class="step-meta">${localTime(st.done_at)}</span>` : ""}</div>`;
      }).join("");
      return `<div class="art-card ${open ? "open" : ""}">
        <div class="art-head" data-open="${a.id}">
          <strong>${esc(a.name)}</strong>
          <span class="progress"><i style="width:${(dc / flowKeys.length) * 100}%"></i></span>
          <span class="art-count">${dc}/${flowKeys.length}</span>
          ${currentKey ? `<span class="badge amber">${L.guide_next}: ${esc(tpl.flow.find((f) => f.key === currentKey).name)}</span>` : `<span class="badge green">${L.status_done}</span>`}
        </div>
        ${open ? `<div class="art-steps">${stepRows}</div>` : ""}</div>`;
    }).join("");
    return `<section class="guide-stage">
      <header><span class="stage-code">${stage.code}</span><h3>${esc(stage.name)}</h3>
        ${sTotal ? `<span class="dim">${sDone}/${sTotal}</span>` : ""}</header>
      ${artCards || `<div class="empty small">${L.guide_empty}</div>`}
      <div class="art-add"><input data-stage="${stage.code}" placeholder="${L.guide_add_ph}" />
        <button class="fav-chip" data-add="${stage.code}">${L.guide_add}</button></div>
    </section>`;
  };

  $("#view").innerHTML = `
    <div class="filters">
      <select id="gProject">${actives.map((p) => `<option value="${esc(p.id)}" ${state.guideProject === p.id ? "selected" : ""}>${esc(p.title)}</option>`).join("")}</select>
      <span class="dim guide-principle">${L.guide_principle}</span>
      ${totalSteps ? `<span class="badge">${L.guide_progress} ${totalDone}/${totalSteps}</span>` : ""}
    </div>
    ${tpl.stages.map(stageBlock).join("")}`;

  $("#gProject").addEventListener("change", (e) => { state.guideProject = e.target.value; render(); });
  $("#view").querySelectorAll("[data-open]").forEach((h) =>
    h.addEventListener("click", () => { state.guideOpen = state.guideOpen === Number(h.dataset.open) ? null : Number(h.dataset.open); render(); })
  );
  $("#view").querySelectorAll(".step-row").forEach((r) =>
    r.addEventListener("click", async () => {
      const on = !r.classList.contains("done");
      await post("/api/guide/step", { artifact_id: Number(r.dataset.a), step_key: r.dataset.s, on });
      render();
    })
  );
  $("#view").querySelectorAll("[data-add]").forEach((b) =>
    b.addEventListener("click", async () => {
      const input = $("#view").querySelector(`input[data-stage="${b.dataset.add}"]`);
      const name = input.value.trim();
      if (!name) return;
      const r = await post("/api/guide/artifact", { project_id: state.guideProject, stage_code: b.dataset.add, name });
      if (r.ok) render();
    })
  );
}

async function render() {
  renderNav();
  const titles = { home: "nav_home", items: "nav_items", guide: "nav_guide", mail: "nav_mail", artifacts: "nav_artifacts", search: "nav_search" };
  if (state.view.startsWith("mod:")) {
    const m = (state.modules ?? []).find((x) => `mod:${x.id}` === state.view);
    $("#viewTitle").textContent = m?.nav ?? "";
    logView(state.view);
    return renderModulePlaceholder(state.view.slice(4));
  }
  $("#viewTitle").textContent = state.lex[titles[state.view]] ?? "";
  logView(state.view);
  if (state.view === "home") return renderHome();
  if (state.view === "guide") return renderGuide();
  if (state.view === "items") return renderItems();
  if (state.view === "mail") return renderMail();
  if (state.view === "artifacts") return renderArtifacts();
  if (state.view === "search") return renderSearch(state.searchTerm);
}

// --- Cmd/Ctrl+K 빠른 이동 팔레트 (벤치마크 N3) ---
let paletteEl = null;
let paletteIdx = 0;

async function paletteEntries(q) {
  const term = q.trim().toLowerCase();
  const views = [...VIEWS, ...(state.modules ?? []).map((m) => `mod:${m.id}`)]
    .map((v) => ({ kind: "view", label: labelFor(v), run: () => { state.view = v; render(); } }));
  const projects = (state._projCache ?? []).map((p) => ({
    kind: "project", label: `${p.title} (${p.id})`,
    run: () => { state.projectFilter = p.id; state.view = "items"; render(); }
  }));
  const actions = [{
    kind: "action", label: state.lex.palette_mode_switch,
    run: async () => {
      state.mode = state.mode === "business" ? "fantasy" : "business";
      localStorage.setItem("dev_erp_mode", state.mode);
      $("#modeSelect").value = state.mode;
      await loadLexicon(); render();
    }
  }];
  const all = [...views, ...projects, ...actions];
  return term ? all.filter((e) => e.label.toLowerCase().includes(term)) : all;
}

function closePalette() {
  paletteEl?.remove();
  paletteEl = null;
}

async function openPalette() {
  closePalette();
  if (!state._projCache) {
    try { state._projCache = (await api("/api/summary")).projects; } catch { state._projCache = []; }
  }
  paletteIdx = 0;
  paletteEl = document.createElement("div");
  paletteEl.className = "palette-backdrop";
  paletteEl.innerHTML = `<div class="palette">
    <input id="paletteInput" placeholder="${state.lex.palette_placeholder}" autocomplete="off" />
    <div id="paletteList"></div></div>`;
  document.body.appendChild(paletteEl);
  const input = paletteEl.querySelector("#paletteInput");
  const list = paletteEl.querySelector("#paletteList");

  async function refresh() {
    const entries = await paletteEntries(input.value);
    paletteIdx = Math.min(paletteIdx, Math.max(0, entries.length - 1));
    list.innerHTML = entries.length
      ? entries.slice(0, 12).map((e, i) =>
          `<div class="palette-item ${i === paletteIdx ? "sel" : ""}" data-i="${i}">
            <span class="palette-kind">${state.lex[`palette_kind_${e.kind}`]}</span>${e.label}</div>`).join("")
      : `<div class="palette-item dim">${state.lex.palette_empty}</div>`;
    list.querySelectorAll(".palette-item[data-i]").forEach((el) =>
      el.addEventListener("click", async () => { (await paletteEntries(input.value))[Number(el.dataset.i)]?.run(); closePalette(); })
    );
    return entries;
  }

  input.addEventListener("keydown", async (e) => {
    const entries = await paletteEntries(input.value);
    if (e.key === "Escape") closePalette();
    else if (e.key === "ArrowDown") { paletteIdx = Math.min(paletteIdx + 1, entries.length - 1); refresh(); }
    else if (e.key === "ArrowUp") { paletteIdx = Math.max(paletteIdx - 1, 0); refresh(); }
    else if (e.key === "Enter") { entries[paletteIdx]?.run(); closePalette(); }
  });
  input.addEventListener("input", () => { paletteIdx = 0; refresh(); });
  paletteEl.addEventListener("click", (e) => { if (e.target === paletteEl) closePalette(); });
  input.focus();
  refresh();
}

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); }
});
$("#paletteBtn").addEventListener("click", openPalette);

$("#modeSelect").value = state.mode;
$("#modeSelect").addEventListener("change", async (e) => {
  state.mode = e.target.value;
  localStorage.setItem("dev_erp_mode", state.mode);
  await loadLexicon();
  render();
});
$("#globalSearch").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { state.searchTerm = e.target.value; state.view = "search"; render(); }
});

await loadLexicon();
render();
