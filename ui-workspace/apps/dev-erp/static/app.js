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

const VIEWS = ["home", "items", "mail", "artifacts", "search"];
const navKey = { home: "nav_home", items: "nav_items", mail: "nav_mail", artifacts: "nav_artifacts", search: "nav_search" };

// IA 그룹: 운영 / 기록·이력 / 자재·구매 / 지식·도구 / 팀 (DESIGN 3절)
const NAV_LAYOUT = [
  { g: "group_work", items: ["home", "items", "mod:gates", "search"] },
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

async function renderMail() {
  const q = new URLSearchParams({ days: "90" });
  if (state.projectFilter) q.set("project", state.projectFilter);
  const mail = await api(`/api/mail?${q}`);
  const L = state.lex;
  const rows = mail.map((m) => `<tr>
      <td>${localTime(m.at)}</td>
      <td>${m.direction === "in" ? L.mail_in : L.mail_out}</td>
      <td>${m.subject}</td>
      <td>${m.counterpart ?? "-"}</td>
      <td>${m.project_id ?? "-"}</td>
    </tr>`).join("");
  $("#view").innerHTML = rows
    ? `<table><thead><tr><th>${L.th_time}</th><th>${L.th_direction}</th><th>${L.th_subject}</th><th>${L.th_counterpart}</th><th>${L.project}</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<div class="empty">${L.empty_mail}</div>`;
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

async function render() {
  renderNav();
  const titles = { home: "nav_home", items: "nav_items", mail: "nav_mail", artifacts: "nav_artifacts", search: "nav_search" };
  if (state.view.startsWith("mod:")) {
    const m = (state.modules ?? []).find((x) => `mod:${x.id}` === state.view);
    $("#viewTitle").textContent = m?.nav ?? "";
    logView(state.view);
    return renderModulePlaceholder(state.view.slice(4));
  }
  $("#viewTitle").textContent = state.lex[titles[state.view]] ?? "";
  logView(state.view);
  if (state.view === "home") return renderHome();
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
