// dev-erp P1 클라이언트 (no-build vanilla JS).
// 모든 라벨은 /api/lexicon 사전을 거친다 (하드코딩 금지, INFRA-004).
const state = {
  mode: localStorage.getItem("dev_erp_mode") || "business",
  view: "home",
  lex: {},
  projectFilter: ""
};

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
  const data = await api(`/api/lexicon?mode=${state.mode}`);
  state.lex = data.labels;
  document.body.dataset.mode = state.mode;
  $("#appTitle").textContent = state.lex.app_title;
  renderNav();
}

const VIEWS = ["home", "items", "mail", "artifacts", "search"];
const navKey = { home: "nav_home", items: "nav_items", mail: "nav_mail", artifacts: "nav_artifacts", search: "nav_search" };

function renderNav() {
  $("#nav").innerHTML = VIEWS.map(
    (v) => `<button data-v="${v}" class="${state.view === v ? "active" : ""}">${state.lex[navKey[v]]}</button>`
  ).join("");
  $("#nav").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => { state.view = b.dataset.v; render(); })
  );
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
  $("#freshness").textContent = data.freshness ? `${state.lex.freshness}: ${data.freshness.slice(0, 16).replace("T", " ")}` : "";
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
      <select id="fProject"><option value="">${state.lex.project}: 전체</option>${opts}</select>
      <select id="fStatus"><option value="">상태: 전체</option>${sopts}</select>
    </div>
    ${rows ? `<table><thead><tr><th>${state.lex.item}</th><th>${state.lex.project}</th><th>상태</th><th>마감</th><th>담당</th><th>자동화</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">${state.lex.empty_items}</div>`}`;
  $("#fProject").addEventListener("change", (e) => { state.projectFilter = e.target.value; render(); });
  $("#fStatus").addEventListener("change", (e) => { state.statusFilter = e.target.value; render(); });
}

async function renderMail() {
  const q = new URLSearchParams({ days: "90" });
  if (state.projectFilter) q.set("project", state.projectFilter);
  const mail = await api(`/api/mail?${q}`);
  const rows = mail.map((m) => `<tr>
      <td>${m.at.slice(0, 16).replace("T", " ")}</td>
      <td>${m.direction === "in" ? "수신" : "발신"}</td>
      <td>${m.subject}</td>
      <td>${m.counterpart ?? "-"}</td>
      <td>${m.project_id ?? "-"}</td>
    </tr>`).join("");
  $("#view").innerHTML = rows
    ? `<table><thead><tr><th>시각</th><th>방향</th><th>제목</th><th>상대</th><th>${state.lex.project}</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<div class="empty">${state.lex.empty_mail}</div>`;
}

async function renderArtifacts() {
  const q = new URLSearchParams();
  if (state.projectFilter) q.set("project", state.projectFilter);
  const arts = await api(`/api/artifacts?${q}`);
  const rows = arts.map((a) => `<tr>
      <td>${a.title}</td><td>${a.kind}</td><td>${a.project_id}</td>
      <td>${a.updated_at ?? "-"}</td>
      <td class="pointer">${a.pointer} <button class="copy-btn" data-c="${a.pointer}">복사</button></td>
    </tr>`).join("");
  $("#view").innerHTML = rows
    ? `<table><thead><tr><th>제목</th><th>종류</th><th>${state.lex.project}</th><th>갱신</th><th>위치(포인터)</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<div class="empty">${state.lex.empty_artifacts}</div>`;
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
