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

async function renderHome() {
  const data = await api("/api/summary");
  $("#freshness").textContent = data.freshness ? `${state.lex.freshness}: ${localTime(data.freshness)}` : "";
  const cards = data.projects.map((p) => {
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
  }).join("");
  $("#view").innerHTML = `<div class="cards">${cards || `<div class="empty">${state.lex.empty_items}</div>`}</div>`;
  $("#view").querySelectorAll(".card").forEach((c) =>
    c.addEventListener("click", () => { state.projectFilter = c.dataset.p; state.view = "items"; render(); })
  );
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
