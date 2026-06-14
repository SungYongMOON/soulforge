// dev-erp P1 클라이언트 (no-build vanilla JS).
// 모든 라벨은 /api/lexicon 사전을 거친다 (하드코딩 금지, INFRA-004).
const state = {
  mode: localStorage.getItem("dev_erp_mode") || "business",
  view: "home",
  lex: {},
  projectFilter: "",
  navGroup: localStorage.getItem("dev_erp_navgroup") || "group_project", // 대분류(객체축) 선택 그룹
  pins: JSON.parse(localStorage.getItem("dev_erp_pins") || "[]"),
  // P2b: 계정/권한. 익명(account=null)이면 앱은 현행대로(전체 접근·localStorage).
  account: null, perms: [], accountCount: 0,
  chatLog: [],
  chatThread: null,
  poProject: "",
  poParty: "",
  ctProject: "",
  bomBoard: ""
};

// P2b 권한: 정의 없거나 익명이면 기본 허용(visible·access). 정의 있으면 그 값.
function permOf(resource) {
  if (!state.account) return { visible: true, access: true };
  const p = state.perms.find((x) => x.resource === resource);
  return p ? { visible: !!p.visible, access: !!p.access } : { visible: true, access: true };
}

async function loadMe() {
  try {
    const me = await api("/api/me");
    state.account = me.anonymous ? null : (me.account ?? null);
    state.perms = me.perms ?? [];
    state.accountCount = me.account_count ?? (me.anonymous ? me.account_count : state.accountCount) ?? 0;
  } catch { state.account = null; state.perms = []; }
}
// 로그인 시 서버 레이아웃을 localStorage 로 동기화(이후 dashLayout()이 그대로 사용 → sync 코드 무변경)
async function pullServerLayout() {
  if (!state.account) return;
  try {
    const { layout } = await api("/api/dashboard/layout");
    if (Array.isArray(layout) && layout.length) localStorage.setItem("dev_erp_widgets", JSON.stringify(layout));
  } catch { /* 무시: localStorage 폴백 */ }
}

// 상단 인증 UI. 계정 0(익명 파일럿)=숨김 / 로그인=사용자+로그아웃 / 계정 있고 미로그인=로그인 버튼.
function renderAuth() {
  const box = $("#authBox"); if (!box) return;
  const L = state.lex;
  if (state.account) {
    box.innerHTML = `<span class="auth-user">${esc(state.account.username)}</span><button id="logoutBtn" class="fav-chip">${L.logout}</button>`;
    $("#logoutBtn").addEventListener("click", async () => { await fetch("/api/auth/logout", { method: "POST" }).catch(() => {}); location.reload(); });
  } else if (state.accountCount > 0) {
    box.innerHTML = `<button id="loginBtn" class="fav-chip">${L.login}</button>`;
    $("#loginBtn").addEventListener("click", openLogin);
  } else {
    box.innerHTML = ""; // 계정 0 = 익명 파일럿
  }
}

// 로그인 모달(화면 정중앙). 비밀번호는 사용자가 직접 입력(에이전트 자동입력 아님).
function openLogin() {
  const L = state.lex;
  document.querySelector(".ui-confirm-overlay")?.remove();
  const ov = document.createElement("div");
  ov.className = "ui-confirm-overlay";
  ov.innerHTML = `<div class="ui-confirm" role="dialog" aria-label="${L.login}">
    <p class="ui-confirm-msg">${L.login}</p>
    <input id="loginUser" class="login-input" placeholder="${L.login_user}" autocomplete="username" />
    <input id="loginPw" class="login-input" type="password" placeholder="${L.login_pw}" autocomplete="current-password" />
    <div class="login-err danger-text"></div>
    <div class="ui-confirm-btns"><button class="ui-confirm-cancel">${L.btn_cancel}</button><button class="ui-confirm-ok">${L.btn_confirm}</button></div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector(".ui-confirm-cancel").addEventListener("click", close);
  const submit = async () => {
    const username = ov.querySelector("#loginUser").value.trim();
    const password = ov.querySelector("#loginPw").value;
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) }).catch(() => null);
    if (r && r.ok) { close(); location.reload(); }
    else ov.querySelector(".login-err").textContent = L.login_fail;
  };
  ov.querySelector(".ui-confirm-ok").addEventListener("click", submit);
  ov.querySelector("#loginPw").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  ov.querySelector("#loginUser").focus();
}

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
  // B5 라벨 감사 발견 반영: 과제 화면 조회에는 project_ref 차원을 단다
  const projectRef = state.view === "project" ? state.hubProject : (state.projectFilter || null);
  post("/api/events", {
    actor_ref: "owner", actor_kind: "human", kind: "view",
    to: view, used_refs: [`view:${view}`], data_label: "real", note: `mode=${state.mode}`,
    project_ref: projectRef
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
  // 좌상단 로고 = 홈(위젯 대시보드)로 복귀 (ECount 로고 동작). onclick 으로 중복바인딩 방지.
  $("#appTitle").classList.add("brand-home");
  $("#appTitle").title = state.lex.nav_home;
  $("#appTitle").onclick = () => { state.view = "home"; render(); };
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

// 대분류 = 다루는 '대상(객체)'축 (owner 결정 2026-06-13): 프로젝트/할일/산출물·문서/메일·소통/자재·거래처/사람·팀
const NAV_LAYOUT = [
  { g: "group_project", items: ["home", "guide", "mod:gates", "search"] },
  { g: "group_task", items: ["items"] },
  { g: "group_doc", items: ["artifacts", "mod:reports", "mod:knowledge", "mod:calculators"] },
  { g: "group_comm", items: ["mail", "mod:meetings"] },
  { g: "group_material", items: ["mod:purchase", "mod:inventory", "mod:boards", "mod:stockwatch"] },
  { g: "group_team", items: ["mod:contacts", "mod:requests", "mod:analytics"] }
];

function navButton(v) {
  const perm = permOf(v.startsWith("mod:") ? v : `view:${v}`);
  if (!perm.visible) return "";                       // RBAC: 숨김
  const locked = !perm.access;                        // RBAC: 보이되 잠김
  const lock = locked ? ` <i class="lock" title="${state.lex.perm_locked ?? "권한 없음"}">🔒</i>` : "";
  const dis = locked ? " disabled" : "";
  const pinned = state.pins.includes(v);
  const star = `<i class="pin-btn ${pinned ? "on" : ""}" data-pin="${v}" title="${state.lex.pin_toggle}">${pinned ? "★" : "☆"}</i>`;
  if (v.startsWith("mod:")) {
    const m = (state.modules ?? []).find((x) => `mod:${x.id}` === v);
    if (!m) return "";
    return `<button data-v="${v}" class="${state.view === v ? "active" : ""}"${dis}>
      <span>${m.nav}${lock}</span><span class="nav-side"><em class="phase-tag">${m.phase}</em>${star}</span></button>`;
  }
  return `<button data-v="${v}" class="${state.view === v ? "active" : ""}"${dis}><span>${state.lex[navKey[v]]}${lock}</span><span class="nav-side">${star}</span></button>`;
}

// IA 2.5단 (ECount 관찰 반영): 현재 view 가 속한 그룹을 찾아 상단 탭 동기화
function groupOfView(v) {
  const g = NAV_LAYOUT.find((grp) => grp.items.includes(v));
  return g ? g.g : null;
}

function renderGroupBar() {
  // 상단 대분류 탭(ECount 1단). 클릭 시 좌측 하위만 교체.
  if (!NAV_LAYOUT.some((g) => g.g === state.navGroup)) state.navGroup = NAV_LAYOUT[0].g; // stale 값 가드
  $("#groupBar").innerHTML = NAV_LAYOUT.map((group) =>
    `<button class="group-tab ${state.navGroup === group.g ? "on" : ""}" data-g="${group.g}">${state.lex[group.g]}</button>`
  ).join("");
  $("#groupBar").querySelectorAll(".group-tab").forEach((b) =>
    b.addEventListener("click", () => {
      state.navGroup = b.dataset.g;
      localStorage.setItem("dev_erp_navgroup", state.navGroup);
      // 그룹 전환 시 그 그룹의 첫 화면으로 이동(ECount: 모듈 클릭→기본 화면 랜딩)
      const grp = NAV_LAYOUT.find((x) => x.g === state.navGroup);
      const first = grp?.items.find((v) => !v.startsWith("mod:")) ?? grp?.items[0];
      if (first) state.view = first;
      render();
    })
  );
}

function renderNav() {
  // 현재 view 가 속한 그룹으로 상단 탭 자동 동기화(팔레트/허브 점프 대응)
  const vg = groupOfView(state.view);
  if (vg && vg !== state.navGroup) state.navGroup = vg;
  renderGroupBar();

  const pinnedGroup = state.pins.length
    ? `<div class="nav-group"><div class="nav-group-label">${state.lex.group_pinned}</div>${state.pins.map(navButton).join("")}</div>`
    : "";
  // 좌측 = 선택된 상단 그룹의 하위 항목만(ECount 좌측 트리)
  const active = NAV_LAYOUT.find((grp) => grp.g === state.navGroup) ?? NAV_LAYOUT[0];
  $("#nav").innerHTML = pinnedGroup + `<div class="nav-group">
      <div class="nav-group-label">${state.lex[active.g]}</div>
      ${active.items.map(navButton).join("")}</div>`;
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
  // 현재 화면 바로가기 등록 버튼(ECount: 최상단 ☆로 현재 화면 담기)
  const cur = state.view;
  const pinnable = !cur.startsWith("project") && cur !== "search"; // 동적/검색 제외
  const btn = $("#pinCurrentBtn");
  if (btn) {
    const on = state.pins.includes(cur);
    btn.textContent = on ? "★" : "☆";
    btn.classList.toggle("on", on);
    btn.disabled = !pinnable;
    btn.title = pinnable ? (on ? state.lex.pin_remove : state.lex.pin_add) : "";
    btn.onclick = () => { if (pinnable) togglePin(cur); };
  }
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

// 위젯 대시보드 (ECount 위젯 보드 관찰 반영): 그리드 스냅 colSpan + 드래그
// reorder + 리사이즈 + 추가/삭제. localStorage 저장(계정별 서버 저장은 P2b).
// 자유 배치 위젯 보드 (ECount식): 절대좌표 격자 — 가로 12칼럼, 세로 행 단위.
// 드래그하면 위젯이 마우스를 따라 자유 이동, 놓으면 격자에 스냅(빈칸 허용).
// 위젯 전체 계획(대분류=객체축). ready:true 만 실제 동작(드래그 추가), 나머지는 '준비 중' 슬롯으로 노출.
// ECount 관찰 위젯 포함: 시작하기(onboarding)·ToDo(mine)·일정관리(deadline_cal)·전자결재(approval)·쪽지(notices)·업그레이드내역(announce)·집체교육(training).
const WIDGET_PLAN = [
  { id: "projects", cat: "group_project", ready: true },
  { id: "kpi", cat: "group_project", ready: true },
  { id: "events", cat: "group_project", ready: true },
  { id: "gatewait", cat: "group_project", ready: true },
  { id: "artifact_progress", cat: "group_project", ready: true },
  { id: "nudges", cat: "group_task", ready: true },
  { id: "today", cat: "group_task", ready: true },
  { id: "blocked", cat: "group_task", ready: true },
  { id: "mine", cat: "group_task" },
  { id: "deadline_cal", cat: "group_task" },
  { id: "artifacts", cat: "group_doc", ready: true },
  { id: "reports_w", cat: "group_doc" },
  { id: "meetings_w", cat: "group_doc", ready: true },
  { id: "onboarding", cat: "group_doc" },
  { id: "training", cat: "group_doc" },
  { id: "stddocs", cat: "group_doc" },
  { id: "mail", cat: "group_comm", ready: true },
  { id: "inbox", cat: "group_comm", ready: true },
  { id: "approval", cat: "group_comm" },
  { id: "notices", cat: "group_comm" },
  { id: "announce", cat: "group_comm" },
  { id: "purchase_w", cat: "group_material", ready: true },
  { id: "stocklow", cat: "group_material", ready: true },
  { id: "bomchg", cat: "group_material", ready: true },
  { id: "vendors", cat: "group_material", ready: true },
  { id: "buyapprove", cat: "group_material" },
  { id: "unassigned", cat: "group_team", ready: true },
  { id: "contacts", cat: "group_team", ready: true },
  { id: "teamload", cat: "group_team", ready: true },
  { id: "throughput", cat: "group_team" },
  { id: "requests_w", cat: "group_team" },
  { id: "analytics_w", cat: "group_team" }
];
const WIDGET_CATALOG = WIDGET_PLAN.filter((w) => w.ready).map((w) => w.id); // 실제 보드에 올릴 수 있는 위젯
const CREATE_WIDGETS = new Set(["today", "blocked", "unassigned"]); // 작성(✎) → 할일 생성 화면으로
const CAT_ORDER = ["group_project", "group_task", "group_doc", "group_comm", "group_material", "group_team"];
const DASH_GCOLS = 12;     // 가로 12칼럼 (fine snap)
const DASH_ROW = 22;       // 세로 행 px
const DASH_WMIN = 2, DASH_HMIN = 3;
const DEFAULT_DASH = [
  { id: "projects", x: 0, y: 0, w: 12, h: 12 },
  { id: "nudges", x: 0, y: 12, w: 6, h: 8 }, { id: "teamload", x: 6, y: 12, w: 6, h: 8 },
  { id: "today", x: 0, y: 20, w: 3, h: 8 }, { id: "blocked", x: 3, y: 20, w: 3, h: 8 },
  { id: "mail", x: 6, y: 20, w: 3, h: 8 }, { id: "events", x: 9, y: 20, w: 3, h: 8 }
];

function dashLayout() {
  const saved = JSON.parse(localStorage.getItem("dev_erp_widgets") || "null");
  if (Array.isArray(saved) && saved.length && saved.every((x) => x && WIDGET_CATALOG.includes(x.id) && "x" in x)) {
    return saved.map((x) => ({
      id: x.id,
      x: Math.max(0, Math.min(DASH_GCOLS - DASH_WMIN, Number(x.x) || 0)),
      y: Math.max(0, Number(x.y) || 0),
      w: Math.max(DASH_WMIN, Math.min(DASH_GCOLS, Number(x.w) || 3)),
      h: Math.max(DASH_HMIN, Number(x.h) || 6),
      c: !!x.c
    }));
  }
  return DEFAULT_DASH.map((x) => ({ ...x }));
}
function saveDashLayout(arr) {
  localStorage.setItem("dev_erp_widgets", JSON.stringify(arr));
  // 로그인 상태면 계정별 서버 저장(logout 내성). 미로그인=localStorage 만.
  if (state.account) fetch("/api/dashboard/layout", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ layout: arr }) }).catch(() => {});
}
// 충돌 해소: anchor(방금 옮기거나 키운 위젯)는 고정, 겹치는 나머지는 아래로 밀어냄(겹침 금지).
function dashEffH(w) { return w.c ? 2 : w.h; }
function dashOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + dashEffH(b) && a.y + dashEffH(a) > b.y;
}
function resolveDashCollisions(layout, anchorId) {
  const anchor = layout.find((w) => w.id === anchorId);
  const placed = anchor ? [anchor] : [];
  const rest = layout.filter((w) => w.id !== anchorId).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const w of rest) {
    let guard = 0;
    while (placed.some((p) => dashOverlap(w, p)) && guard++ < 500) w.y += 1;
    placed.push(w);
  }
  return layout;
}
// 정렬(컴팩트): 각 위젯을 현재 x에서 최상단 빈자리로 — 빈 간격 제거 + 겹침 해소.
function compactDash(layout) {
  const placed = [];
  for (const w of [...layout].sort((a, b) => a.y - b.y || a.x - b.x)) {
    w.y = 0;
    let guard = 0;
    while (placed.some((p) => dashOverlap(w, p)) && guard++ < 500) w.y += 1;
    placed.push(w);
  }
  return layout;
}

function miniRow(cells) {
  return `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
}

// 연락처 마스터 화면(mod:contacts). 거래처/과제 링크·필터. 메타 전용.
// 매뉴얼/FAQ 관리(mod:knowledge). 챗봇 검색 소스 + 미응답 질문 큐(야간 갱신 대상). 메타 전용.
async function renderKnowledge() {
  const L = state.lex;
  const [faqs, unanswered] = await Promise.all([api("/api/faq"), api("/api/chat/unanswered?limit=30")]);
  const rows = faqs.map((f) => `<tr>
    <td>${esc(f.topic ?? "-")}</td><td><strong>${esc(f.question)}</strong></td>
    <td>${esc((f.answer ?? "").slice(0, 60))}${(f.answer ?? "").length > 60 ? "…" : ""}</td>
    <td class="dim">${esc(f.keywords ?? "")}</td><td class="pointer">${esc(f.pointer ?? "-")}</td>
  </tr>`).join("");
  const unRows = unanswered.map((u) => `<tr><td>${esc(u.question)}</td><td class="num">${u.n}</td><td class="dim">${u.last_at ? localTime(u.last_at) : "-"}</td>
    <td><button class="fav-chip mini faq-from" data-q="${esc(u.question)}">+ ${L.faq_new}</button></td></tr>`).join("");
  $("#view").innerHTML = `
    <div class="item-form">
      <input id="fqTopic" placeholder="${L.faq_topic}" size="8" />
      <input id="fqQ" placeholder="${L.faq_q}" />
      <input id="fqA" placeholder="${L.faq_a}" />
      <input id="fqKw" placeholder="${L.faq_kw}" size="12" />
      <input id="fqPtr" placeholder="${L.faq_ptr}" size="10" />
      <button id="fqAdd" class="fav-chip">${L.faq_new}</button>
    </div>
    ${faqs.length ? `<table><thead><tr><th>${L.faq_topic}</th><th>${L.faq_q}</th><th>${L.faq_a}</th><th>${L.faq_kw}</th><th>${L.faq_ptr}</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">${L.empty_faq}</div>`}
    <h4 class="hub-h4">${L.faq_unanswered}</h4>
    ${unanswered.length ? `<table><thead><tr><th>${L.faq_q}</th><th>${L.faq_freq}</th><th>${L.th_time}</th><th></th></tr></thead><tbody>${unRows}</tbody></table>` : `<div class="empty small">-</div>`}`;
  const add = async (preset) => {
    const q = preset ?? $("#fqQ").value.trim(); const a = $("#fqA").value.trim();
    if (!q || (!preset && !a)) return;
    const body = { question: q, answer: a || "(작성 필요)", topic: $("#fqTopic").value.trim() || null, keywords: $("#fqKw").value.trim() || null, pointer: $("#fqPtr").value.trim() || null };
    const r = await post("/api/faq", body).then((x) => x.json()).catch(() => ({}));
    if (r.ok) render();
  };
  $("#fqAdd").addEventListener("click", () => add());
  $("#view").querySelectorAll(".faq-from").forEach((b) => b.addEventListener("click", () => { $("#fqQ").value = b.dataset.q; $("#fqA").focus(); }));
}

// P3 재고/부품 화면(mod:inventory). 부품 마스터(공유)+가용재고+부족 강조+재고 조정. 외부전송 0.
// P-11: 엔지니어링 계산기 — 안전 평가·검증·활성화. 공식 unsafe 면 등록 거부.
async function renderCalculators() {
  const L = state.lex;
  const calcs = await api("/api/calculators");
  const cards = calcs.map((c) => {
    let vars = []; try { vars = JSON.parse(c.variables || "[]"); } catch { vars = []; }
    const inputs = vars.map((v) => `<input class="calc-in" data-name="${esc(v.name)}" placeholder="${esc(v.name)}" size="6" />`).join(" ");
    return `<section class="calc-card" data-id="${esc(c.id)}">
      <h3>${esc(c.name)} <span class="badge ${c.status === "active" ? "green" : ""}">${c.status === "active" ? L.calc_active : L.calc_draft}</span></h3>
      <div class="dim">${esc(c.formula)}</div>
      <div class="item-form">${inputs} <button class="fav-chip calc-run">${L.calc_run}</button> <span class="calc-out"></span></div>
      <div class="item-form"><button class="fav-chip calc-verify">${L.calc_verify}</button> <button class="fav-chip calc-activate">${L.calc_activate}</button> <span class="calc-vout dim"></span></div>
    </section>`;
  }).join("");
  $("#view").innerHTML = `${cards || `<div class="empty">-</div>`}
    <section class="calc-new"><h3>${L.calc_title}</h3>
      <div class="item-form">
        <input id="calcName" placeholder="${L.item}" />
        <input id="calcFormula" placeholder="${L.calc_formula} (예: Math.sqrt(a*a+b*b))" size="24" />
        <input id="calcVars" placeholder="a,b" size="8" />
        <button id="calcAdd" class="fav-chip">${L.calc_add}</button>
        <span id="calcMsg" class="dim"></span>
      </div></section>`;
  $("#view").querySelectorAll(".calc-card").forEach((card) => {
    const id = card.dataset.id;
    const vals = () => { const o = {}; card.querySelectorAll(".calc-in").forEach((i) => o[i.dataset.name] = Number(i.value) || 0); return o; };
    card.querySelector(".calc-run").addEventListener("click", async () => {
      const res = await (await post("/api/calculators/eval", { id, inputs: vals() })).json();
      card.querySelector(".calc-out").textContent = res.ok ? `= ${res.value}` : (res.error ?? "");
    });
    card.querySelector(".calc-verify").addEventListener("click", async () => {
      const res = await (await post("/api/calculators/verify", { id })).json();
      card.querySelector(".calc-vout").textContent = res.ok ? `✓ ${res.passed}` : `✗ ${res.failed ?? res.error}`;
    });
    card.querySelector(".calc-activate").addEventListener("click", async () => {
      const res = await (await post("/api/calculators/activate", { id })).json();
      if (res.ok) render(); else card.querySelector(".calc-vout").textContent = `✗ ${res.error}`;
    });
  });
  $("#calcAdd").addEventListener("click", async () => {
    const name = $("#calcName").value.trim(), formula = $("#calcFormula").value.trim();
    if (!name || !formula) return;
    const variables = $("#calcVars").value.split(",").map((s) => s.trim()).filter(Boolean).map((n) => ({ name: n }));
    const res = await (await post("/api/calculators", { name, formula, variables })).json();
    if (res.ok) render(); else $("#calcMsg").textContent = res.error === "unsafe_formula" ? L.calc_unsafe : (res.error ?? "");
  });
}

async function renderInventory() {
  const L = state.lex;
  const [summary, parts, locations] = await Promise.all([api("/api/summary"), api("/api/parts"), api("/api/locations")]);
  const projOpts = summary.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join("");
  const partOpts = parts.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  const locOpts = locations.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}${l.is_virtual ? "(가상)" : ""}</option>`).join("");
  const rows = parts.map((p) => {
    const low = p.min_qty > 0 && p.on_hand < p.min_qty;
    return `<tr>
      <td><strong>${esc(p.name)}</strong></td><td>${esc(p.part_no ?? "-")}</td><td>${esc(p.type ?? "-")}</td>
      <td class="num ${low ? "due-over" : ""}">${p.on_hand}${low ? ` <span class="badge red">${L.inv_low}</span>` : ""}</td>
      <td class="num">${p.min_qty || "-"}</td>
      <td>${p.projects.map((x) => `<span class="badge">${esc(x)}</span>`).join(" ") || '<span class="dim">-</span>'}</td>
    </tr>`;
  }).join("");
  $("#view").innerHTML = `
    <div class="item-form">
      <input id="ptName" placeholder="${L.ct_name}" /><input id="ptNo" placeholder="${L.part_no}" size="8" />
      <input id="ptType" placeholder="${L.part_type}" size="8" /><input id="ptGrp" placeholder="${L.part_grp}" size="7" />
      <input id="ptUom" placeholder="${L.part_uom}" size="4" value="ea" /><input id="ptMin" type="number" placeholder="${L.part_min}" style="width:80px" />
      <button id="ptAdd" class="fav-chip">${L.inv_new}</button>
    </div>
    <div class="item-form">
      <span class="dim">${L.stock_adjust}:</span>
      <select id="stPart"><option value="">${L.item}</option>${partOpts}</select>
      <select id="stLoc"><option value="">${L.loc_label}</option>${locOpts}</select>
      <input id="stQty" type="number" placeholder="0" style="width:80px" /><button id="stSet" class="fav-chip">${L.stock_adjust}</button>
    </div>
    ${parts.length ? `<table><thead><tr><th>${L.item}</th><th>${L.part_no}</th><th>${L.part_type}</th><th>${L.on_hand}</th><th>${L.part_min}</th><th>${L.project}</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">${L.empty_parts}</div>`}`;
  $("#ptAdd").addEventListener("click", async () => {
    const name = $("#ptName").value.trim(); if (!name) return;
    const body = { name, part_no: $("#ptNo").value.trim() || null, type: $("#ptType").value.trim() || null, grp: $("#ptGrp").value.trim() || null, uom: $("#ptUom").value.trim() || "ea", min_qty: Number($("#ptMin").value) || 0 };
    const r = await post("/api/parts", body).then((x) => x.json()).catch(() => ({}));
    if (r.ok) render();
  });
  $("#stSet").addEventListener("click", async () => {
    const part_id = $("#stPart").value, location_id = $("#stLoc").value;
    if (!part_id || !location_id) return;
    await post("/api/stock", { part_id, location_id, qty: Number($("#stQty").value) || 0 });
    render();
  });
}

// P3 BOM 화면(mod:boards). board 선택→BOM 구성 표+추가.
async function renderBoards() {
  const L = state.lex;
  const parts = await api("/api/parts");
  const boards = parts.filter((p) => p.type === "board");
  const sel = state.bomBoard || (boards[0] && boards[0].id) || "";
  const bom = sel ? await api(`/api/bom?parent=${encodeURIComponent(sel)}`) : [];
  const comp = sel ? await api(`/api/parts/completeness?part=${encodeURIComponent(sel)}`) : null;
  const atts = sel ? await api(`/api/attachments?entity_type=part&entity_id=${encodeURIComponent(sel)}`) : [];
  const ATYPES = ["bom", "gerber", "digikey", "schematic", "pcb", "block_diagram"];
  const boardOpts = boards.map((b) => `<option value="${esc(b.id)}" ${sel === b.id ? "selected" : ""}>${esc(b.name)}</option>`).join("");
  const childOpts = parts.filter((p) => p.id !== sel).map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  const rows = bom.map((b) => `<tr><td>${esc(b.ref_des ?? "-")}</td><td><strong>${esc(b.name)}</strong></td><td>${esc(b.part_no ?? "-")}</td><td class="num">${b.qty}</td></tr>`).join("");
  $("#view").innerHTML = `
    <div class="filters">
      <span class="dim">${L.bom_parent}:</span>
      <select id="bomBoardSel">${boardOpts || `<option value="">-</option>`}</select>
    </div>
    ${sel ? `<div class="item-form">
      <select id="bomChild"><option value="">${L.item}</option>${childOpts}</select>
      <input id="bomQty" type="number" placeholder="${L.bom_qty}" value="1" style="width:80px" />
      <input id="bomRef" placeholder="${L.bom_ref}" size="8" />
      <button id="bomAdd" class="fav-chip">${L.bom_add}</button>
    </div>` : ""}
    ${bom.length ? `<table><thead><tr><th>${L.bom_ref}</th><th>${L.item}</th><th>${L.part_no}</th><th>${L.bom_qty}</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">${L.empty_bom}</div>`}
    ${sel && comp && comp.required ? `<div class="attach-section"><h3>${L.att_required}</h3>
      <div class="attach-comp">${comp.required.map((t) => `<span class="badge ${comp.missing.find((m) => m.artifact_type === t) ? "red" : "green"}">${L["at_" + t] ?? t}</span>`).join(" ")}</div>
      <div class="item-form"><input id="attName" placeholder="${L.att_name}" /><input id="attPtr" placeholder="${L.att_pointer}" size="14" /><select id="attType">${ATYPES.map((t) => `<option value="${t}">${L["at_" + t] ?? t}</option>`).join("")}</select><button id="attAdd" class="fav-chip">${L.att_add}</button></div>
      ${(atts || []).length ? `<table><thead><tr><th>${L.att_name}</th><th>${L.att_type}</th><th>${L.att_pointer}</th></tr></thead><tbody>${(atts || []).map((a) => `<tr><td>${esc(a.name)}</td><td class="dim">${L["at_" + (a.artifact_type || "")] ?? esc(a.artifact_type || "-")}</td><td class="dim">${esc(a.pointer)}</td></tr>`).join("")}</tbody></table>` : ""}
    </div>` : ""}`;
  $("#bomBoardSel").addEventListener("change", (e) => { state.bomBoard = e.target.value; render(); });
  if ($("#bomAdd")) $("#bomAdd").addEventListener("click", async () => {
    const child = $("#bomChild").value; if (!child) return;
    await post("/api/bom", { parent_part_id: sel, child_part_id: child, qty: Number($("#bomQty").value) || 1, ref_des: $("#bomRef").value.trim() || null });
    render();
  });
  if ($("#attAdd")) $("#attAdd").addEventListener("click", async () => {
    const name = $("#attName").value.trim(), pointer = $("#attPtr").value.trim();
    if (!name || !pointer) return;
    await post("/api/attachments", { entity_type: "part", entity_id: sel, name, pointer, artifact_type: $("#attType").value });
    render();
  });
}

// P3 부품 감시 화면(mod:stockwatch). 내부 재고 부족만(외부 공급사 조회 보류).
async function renderStockwatch() {
  const L = state.lex;
  const low = await api("/api/stock/low");
  const rows = low.map((p) => `<tr><td><strong>${esc(p.name)}</strong></td><td>${esc(p.part_no ?? "-")}</td><td class="num due-over">${p.on_hand}</td><td class="num">${p.min_qty}</td><td class="num">${p.min_qty - p.on_hand}</td></tr>`).join("");
  $("#view").innerHTML = `
    <div class="module-head"><p class="dim">${L.sw_note}</p></div>
    ${low.length ? `<table><thead><tr><th>${L.item}</th><th>${L.part_no}</th><th>${L.on_hand}</th><th>${L.part_min}</th><th>${L.inv_low}</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">${L.empty_stocklow}</div>`}`;
}

async function renderContacts() {
  const L = state.lex;
  const [summary, parties, contacts] = await Promise.all([
    api("/api/summary"), api("/api/parties"),
    api(`/api/contacts${state.ctProject ? `?project=${encodeURIComponent(state.ctProject)}` : ""}`)
  ]);
  const projOpts = summary.projects.map((p) => `<option value="${esc(p.id)}" ${state.ctProject === p.id ? "selected" : ""}>${esc(p.title)}</option>`).join("");
  const partyOpts = parties.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  const rows = contacts.map((c) => `<tr>
    <td><strong>${esc(c.name)}</strong></td>
    <td>${esc(c.org ?? "-")}</td>
    <td>${esc(c.role ?? "-")}</td>
    <td>${esc(c.email ?? "-")}${c.phone ? ` · ${esc(c.phone)}` : ""}</td>
    <td>${esc(c.party_name ?? "-")}</td>
    <td>${c.projects.map((x) => `<span class="badge">${esc(x)}</span>`).join(" ") || '<span class="dim">-</span>'}</td>
  </tr>`).join("");
  $("#view").innerHTML = `
    <div class="filters">
      <select id="ctProjFilter"><option value="">${L.project}: ${L.all_label}</option>${projOpts}</select>
    </div>
    <div class="item-form">
      <input id="ctName" placeholder="${L.ct_name}" />
      <input id="ctOrg" placeholder="${L.ct_org}" size="10" />
      <input id="ctRole" placeholder="${L.ct_role_label}" size="8" />
      <input id="ctEmail" placeholder="${L.ct_email}" />
      <select id="ctParty"><option value="">${L.po_party}</option>${partyOpts}</select>
      <select id="ctProjLink"><option value="">${L.project}</option>${projOpts}</select>
      <button id="ctAddBtn" class="fav-chip">${L.ct_new}</button>
    </div>
    ${contacts.length ? `<table><thead><tr><th>${L.ct_name}</th><th>${L.ct_org}</th><th>${L.ct_role_label}</th><th>${L.ct_email}</th><th>${L.po_party}</th><th>${L.project}</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">${L.empty_contacts}</div>`}`;
  $("#ctProjFilter").addEventListener("change", (e) => { state.ctProject = e.target.value; render(); });
  $("#ctAddBtn").addEventListener("click", async () => {
    const name = $("#ctName").value.trim(); if (!name) return;
    const body = { name };
    if ($("#ctOrg").value.trim()) body.org = $("#ctOrg").value.trim();
    if ($("#ctRole").value.trim()) body.role = $("#ctRole").value.trim();
    if ($("#ctEmail").value.trim()) body.email = $("#ctEmail").value.trim();
    if ($("#ctParty").value) body.party_id = $("#ctParty").value;
    if ($("#ctProjLink").value) body.projects = [$("#ctProjLink").value];
    const r = await post("/api/contacts", body).then((x) => x.json()).catch(() => ({}));
    if (r.ok) render();
  });
}

// 구매/발주 화면(mod:purchase). 거래처 마스터·발주 체인·과제 N:N·과제 필터. created_by 기록.
const PURCHASE_STAGES = ["request", "quote", "order", "receive", "inspect", "closed"];
async function renderPurchase() {
  const L = state.lex;
  const pq = new URLSearchParams();
  if (state.poProject) pq.set("project", state.poProject);
  if (state.poParty) pq.set("party", state.poParty);
  const [summary, parties, purchases, ledger] = await Promise.all([
    api("/api/summary"), api("/api/parties"),
    api(`/api/purchases${pq.toString() ? `?${pq}` : ""}`),
    api("/api/parties/ledger")
  ]);
  const projOpts = summary.projects.map((p) => `<option value="${esc(p.id)}" ${state.poProject === p.id ? "selected" : ""}>${esc(p.title)}</option>`).join("");
  const partyOpts = parties.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  const stageChip = (st) => `<span class="status ${st === "closed" ? "done" : st === "inspect" ? "doing" : ""}">${L[`pstage_${st}`] ?? st}</span>`;
  const rows = purchases.map((po) => {
    const idx = PURCHASE_STAGES.indexOf(po.stage);
    const next = idx >= 0 && idx < PURCHASE_STAGES.length - 1 ? PURCHASE_STAGES[idx + 1] : null;
    return `<tr>
      <td><strong>${esc(po.title)}</strong></td>
      <td>${esc(po.party_name ?? "-")}</td>
      <td>${stageChip(po.stage)}${next ? ` <button class="fav-chip mini po-next" data-id="${esc(po.id)}" data-next="${next}">→ ${L[`pstage_${next}`]}</button>` : ""}</td>
      <td class="num">${po.amount != null ? Number(po.amount).toLocaleString() : "-"}</td>
      <td>${po.due ?? "-"}</td>
      <td>${po.projects.map((x) => `<span class="badge">${esc(x)}</span>`).join(" ") || '<span class="dim">-</span>'}</td>
    </tr>`;
  }).join("");
  $("#view").innerHTML = `
    <div class="filters">
      <select id="poProjFilter"><option value="">${L.project}: ${L.all_label}</option>${projOpts}</select>
      <select id="poPartyFilter"><option value="">${L.all_parties}</option>${parties.map((p) => `<option value="${esc(p.id)}" ${state.poParty === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
      <span class="party-add"><input id="partyName" placeholder="${L.party_name}" size="10" /><button id="partyAddBtn" class="fav-chip">${L.party_add}</button></span>
    </div>
    <details class="party-ledger" ${state.poParty ? "open" : ""}><summary>${L.party_ledger}</summary>
      <table><thead><tr><th>${L.po_party}</th><th>${L.po_count}</th><th>${L.po_open}</th><th>${L.po_total}</th></tr></thead><tbody>
      ${ledger.length ? ledger.map((g) => `<tr class="ledger-row" data-party="${esc(g.party_id)}"><td>${esc(g.party_name)}</td><td class="num">${g.count}</td><td class="num">${g.open}</td><td class="num">${Number(g.total_amount).toLocaleString()}</td></tr>`).join("") : `<tr><td colspan="4" class="dim">-</td></tr>`}
      </tbody></table></details>
    <div class="item-form">
      <input id="poTitle" placeholder="${L.po_title}" />
      <select id="poParty"><option value="">${L.po_party}</option>${partyOpts}</select>
      <input id="poAmount" type="number" placeholder="${L.po_amount}" style="width:110px" />
      <input id="poDue" type="date" />
      <select id="poProjLink"><option value="">${L.project}</option>${projOpts}</select>
      <button id="poAddBtn" class="fav-chip">${L.po_new}</button>
    </div>
    ${purchases.length ? `<table><thead><tr><th>${L.po_title}</th><th>${L.po_party}</th><th>${L.stage}</th><th>${L.po_amount}</th><th>${L.po_due}</th><th>${L.project}</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">${L.empty_purchases}</div>`}`;
  $("#poProjFilter").addEventListener("change", (e) => { state.poProject = e.target.value; render(); });
  $("#poPartyFilter").addEventListener("change", (e) => { state.poParty = e.target.value; render(); });
  $("#view").querySelectorAll(".ledger-row").forEach((r) => r.addEventListener("click", () => { state.poParty = r.dataset.party; render(); }));
  $("#partyAddBtn").addEventListener("click", async () => {
    const name = $("#partyName").value.trim(); if (!name) return;
    await post("/api/parties", { name }); render();
  });
  $("#poAddBtn").addEventListener("click", async () => {
    const title = $("#poTitle").value.trim(); if (!title) return;
    const body = { title };
    if ($("#poParty").value) body.party_id = $("#poParty").value;
    if ($("#poAmount").value) body.amount = Number($("#poAmount").value);
    if ($("#poDue").value) body.due = $("#poDue").value;
    if ($("#poProjLink").value) body.projects = [$("#poProjLink").value];
    const r = await post("/api/purchases", body).then((x) => x.json()).catch(() => ({}));
    if (r.ok) render();
  });
  $("#view").querySelectorAll(".po-next").forEach((b) => b.addEventListener("click", async () => {
    await post("/api/purchases/stage", { id: b.dataset.id, stage: b.dataset.next }); render();
  }));
}

// A4/A5 생성기(업무일지·보고서·연구노트). 메타 기반 템플릿 초안(원문 미사용). 미리보기+복사.
async function renderReports() {
  const L = state.lex;
  const summary = await api("/api/summary");
  const opts = summary.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join("");
  $("#view").innerHTML = `
    <div class="filters">
      <select id="genType">
        <option value="worklog">${L.gen_worklog}</option>
        <option value="report">${L.gen_report}</option>
        <option value="note">${L.gen_note}</option>
      </select>
      <select id="genProject"><option value="">${L.project}: ${L.all_label}</option>${opts}</select>
      <input id="genDays" type="number" min="1" value="7" title="${L.gen_days}" style="width:80px" />
      <span id="genPresets" class="gen-presets"><button class="fav-chip mini" data-days="7">7</button><button class="fav-chip mini" data-days="14">14</button><button class="fav-chip mini" data-days="30">30</button></span>
      <button id="genRun" class="fav-chip">${L.gen_run}</button>
      <button id="genCopy" class="copy-btn" style="display:none">${L.copy}</button>
    </div>
    <pre class="gen-preview empty">${L.gen_run} →</pre>`;
  const run = async () => {
    const type = $("#genType").value;
    const proj = $("#genProject").value;
    const q = new URLSearchParams(); if (proj) q.set("project", proj);
    let data;
    if (type === "worklog") { q.set("days", $("#genDays").value || "7"); data = await api(`/api/worklog/draft?${q}`); }
    else { q.set("kind", type === "note" ? "note" : "report"); data = await api(`/api/report/draft?${q}`); }
    const pre = $("#view").querySelector(".gen-preview");
    pre.classList.remove("empty"); pre.textContent = data.text;
    const cp = $("#genCopy"); cp.style.display = "";
    cp.onclick = () => navigator.clipboard?.writeText(data.text);
  };
  $("#genRun").addEventListener("click", run);
  $("#genDays").style.display = "none";
  const togglePeriod = (v) => { const d = v === "worklog" ? "" : "none"; $("#genDays").style.display = d; const ps = $("#genPresets"); if (ps) ps.style.display = d === "" ? "" : "none"; };
  $("#genType").addEventListener("change", (e) => togglePeriod(e.target.value));
  $("#genPresets")?.querySelectorAll("[data-days]").forEach((b) => b.addEventListener("click", () => { $("#genDays").value = b.dataset.days; run(); }));
  togglePeriod($("#genType").value);
}

// A7 ERP 챗봇 패널(메타 컨텍스트, 원문 미전송). 외부전송은 어댑터의 codex_cli만(tool_pc).
function openChat() {
  const L = state.lex;
  document.querySelector(".chat-overlay")?.remove();
  const ov = document.createElement("div");
  ov.className = "chat-overlay";
  if (!state.chatThread) state.chatThread = `th_${Date.now().toString(36)}`;
  ov.innerHTML = `<div class="chat-panel" role="dialog" aria-label="${L.chat_title}">
    <div class="chat-head"><strong>${L.chat_title}</strong><span class="dim">${L.chat_note}</span>
      <button class="chat-new" title="${L.chat_new}">${L.chat_new}</button><button class="chat-x">✕</button></div>
    <div class="chat-log"></div>
    <div class="chat-input"><input id="chatMsg" placeholder="${L.chat_placeholder}" /><button id="chatSend" class="fav-chip">${L.chat_send}</button></div>
  </div>`;
  document.body.appendChild(ov);
  const logEl = ov.querySelector(".chat-log");
  const paint = () => {
    logEl.innerHTML = state.chatLog.length
      ? state.chatLog.map((m) => {
          const src = m.source ? `<div class="chat-src">📖 ${esc(m.source.topic ?? "")} · ${esc(m.source.question ?? "")}</div>`
            : (m.role === "ai" && m.matched === false ? `<div class="chat-src dim">${L.chat_unmatched}</div>` : "");
          // 약매칭/미매칭 후보 → 눌러서 바로 그 매뉴얼 질문으로 다시 묻기(끊기지 않게).
          const cand = (m.role === "ai" && !m.matched && Array.isArray(m.candidates) && m.candidates.length)
            ? `<div class="chat-cands">${m.candidates.map((c) => `<button class="fav-chip chat-cand" data-q="${esc(c.question)}">${esc(c.question)}</button>`).join("")}</div>` : "";
          return `<div class="chat-msg ${m.role}"><span>${esc(m.text)}</span>${src}${cand}</div>`;
        }).join("")
      : `<div class="empty small">${L.chat_empty}</div>`;
    logEl.scrollTop = logEl.scrollHeight;
  };
  paint();
  const close = () => ov.remove();
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector(".chat-x").addEventListener("click", close);
  // /new: 새 대화 — 스레드 리셋(로컬 LLM 스레드 오염 방지). 로그는 서버에 남아 야간 갱신에 쓰임.
  ov.querySelector(".chat-new").addEventListener("click", () => {
    state.chatLog = []; state.chatThread = `th_${Date.now().toString(36)}`; paint();
    ov.querySelector("#chatMsg").focus();
  });
  const send = async () => {
    const inp = ov.querySelector("#chatMsg");
    const msg = inp.value.trim(); if (!msg) return;
    if (msg === "/new") { state.chatLog = []; state.chatThread = `th_${Date.now().toString(36)}`; inp.value = ""; paint(); return; }
    state.chatLog.push({ role: "user", text: msg }); inp.value = ""; paint();
    const r = await post("/api/chat", { message: msg, thread_id: state.chatThread }).then((x) => x.json()).catch(() => ({ text: "(오류)" }));
    state.chatLog.push({ role: "ai", text: r.text || "(응답 없음)", source: r.source, matched: r.matched, candidates: r.candidates }); paint();
  };
  ov.querySelector("#chatSend").addEventListener("click", send);
  ov.querySelector("#chatMsg").addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
  // 후보 칩 클릭 → 그 질문으로 즉시 재질의(끊기지 않는 흐름).
  logEl.addEventListener("click", (e) => {
    const b = e.target.closest(".chat-cand"); if (!b) return;
    const inp = ov.querySelector("#chatMsg"); inp.value = b.dataset.q || ""; send();
  });
  ov.querySelector("#chatMsg").focus();
}

// 화면 정중앙 확인 모달 (native confirm 은 위치 제어 불가 → 커스텀). Promise<boolean> 반환.
function uiConfirm(message) {
  return new Promise((resolve) => {
    const L = state.lex;
    document.querySelector(".ui-confirm-overlay")?.remove();
    const ov = document.createElement("div");
    ov.className = "ui-confirm-overlay";
    ov.innerHTML = `<div class="ui-confirm" role="alertdialog" aria-modal="true">
      <p class="ui-confirm-msg"></p>
      <div class="ui-confirm-btns">
        <button class="ui-confirm-cancel">${L.btn_cancel}</button>
        <button class="ui-confirm-ok">${L.btn_confirm}</button>
      </div></div>`;
    ov.querySelector(".ui-confirm-msg").textContent = message;
    document.body.appendChild(ov);
    const done = (v) => { ov.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") done(false); if (e.key === "Enter") done(true); };
    ov.querySelector(".ui-confirm-ok").addEventListener("click", () => done(true));
    ov.querySelector(".ui-confirm-cancel").addEventListener("click", () => done(false));
    ov.addEventListener("click", (e) => { if (e.target === ov) done(false); });
    document.addEventListener("keydown", onKey);
    ov.querySelector(".ui-confirm-ok").focus();
  });
}

async function renderHome() {
  const layout = dashLayout();
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

  // 위젯 본문 빌더 (id → {title, html})
  async function widgetBody(id) {
    if (id === "projects") return { title: `${L.class_active} (${actives.length})`, html:
      `<table class="proj-table"><thead><tr>
        <th>${L.project}</th><th>${L.stage}</th><th>${L.col_remaining}</th>
        <th>${L.col_due}</th><th>${L.blocked}</th><th>${L.col_last_activity}</th><th>${L.col_last_mail}</th>
      </tr></thead><tbody>${activeRows}</tbody></table>${inboxStrip}${internalBlock}` };
    if (id === "today") {
      const due = (await api("/api/items?due=soon")).slice(0, 8);
      return { title: L.tile_today, html: due.length ? `<table><tbody>${due.map((i) => miniRow([esc(i.title), esc(i.project_id), i.due ?? "-"])).join("")}</tbody></table>` : `<div class="empty">${L.empty_items}</div>` };
    }
    if (id === "blocked") {
      const blocked = (await api("/api/items?status=blocked")).slice(0, 6);
      return { title: L.tile_blocked, html: blocked.length ? `<table><tbody>${blocked.map((i) => miniRow([esc(i.title), esc(i.project_id), statusBadge(i.status)])).join("")}</tbody></table>` : `<div class="empty">${L.empty_items}</div>` };
    }
    if (id === "nudges") {
      // P-6 콕핏 알림 — '먼저 해야 할 일' 우선순위(연체>차단>오늘>미완). 연체/차단은 번쩍임.
      const ns = await api("/api/nudges?limit=6");
      const rlabel = { overdue: L.overdue, blocked: L.blocked, due_today: L.today_due, open: L.open };
      const rcls = { overdue: "red", blocked: "red", due_today: "amber", open: "" };
      return { title: L.tile_nudges, html: ns.length
        ? `<table><tbody>${ns.map((n) => `<tr class="nudge-row${n.reason === "overdue" || n.reason === "blocked" ? " flash" : ""}">
            <td><span class="badge ${rcls[n.reason]}">${rlabel[n.reason] ?? esc(n.reason)}</span></td>
            <td>${esc(n.title)}</td><td class="dim">${esc(n.project_id)}</td><td class="dim num">${esc(n.due ?? "-")}</td></tr>`).join("")}</tbody></table>`
        : `<div class="empty">${L.empty_items}</div>` };
    }
    if (id === "teamload") {
      // P-7 팀 부하 — 담당별 미완/차단/연체 건수(집계만, 개인 점수 미산출). NULL=(미배정).
      const wl = await api("/api/workload");
      return { title: L.tile_teamload, html: wl.length
        ? `<table><thead><tr><th>${L.col_person}</th><th>${L.open}</th><th>${L.blocked}</th><th>${L.overdue}</th></tr></thead><tbody>${wl.map((w) => `<tr>
            <td>${esc(w.name)}</td><td class="num">${w.open_cnt}</td>
            <td class="num">${w.blocked_cnt || '<span class="dim">0</span>'}</td>
            <td class="num">${w.overdue_cnt ? `<span class="badge red">${w.overdue_cnt}</span>` : '<span class="dim">0</span>'}</td></tr>`).join("")}</tbody></table>`
        : `<div class="empty">-</div>` };
    }
    if (id === "mail") {
      const mail = (await api("/api/mail?days=90")).slice(0, 6);
      return { title: L.tile_mail, html: mail.length ? `<table><tbody>${mail.map((m) => miniRow([localTime(m.at), esc(m.subject)])).join("")}</tbody></table>` : `<div class="empty">${L.empty_mail}</div>` };
    }
    if (id === "kpi") {
      return { title: L.tile_kpi, html: `<div class="kpi-row mini">
        <div class="kpi red"><span>${L.kpi_blocked}</span><strong>${actives.reduce((s, p) => s + p.blocked, 0)}</strong></div>
        <div class="kpi red"><span>${L.kpi_overdue}</span><strong>${actives.reduce((s, p) => s + p.overdue, 0)}</strong></div>
        <div class="kpi amber"><span>${L.kpi_today}</span><strong>${actives.reduce((s, p) => s + p.due_today, 0)}</strong></div>
        <div class="kpi blue"><span>${L.kpi_inbox}</span><strong>${inbox.reduce((s, p) => s + p.mail_cnt, 0)}</strong></div>
      </div>` };
    }
    if (id === "unassigned") {
      const open = await api("/api/items?status=open");
      const un = open.filter((i) => !i.assignee_ref).slice(0, 8);
      return { title: L.tile_unassigned, html: un.length ? `<table><tbody>${un.map((i) => miniRow([esc(i.title), esc(i.project_id), i.due ?? "-"])).join("")}</tbody></table>` : `<div class="empty">${L.empty_items}</div>` };
    }
    if (id === "artifacts") {
      const arts = (await api("/api/artifacts")).slice(0, 6);
      return { title: L.tile_artifacts, html: arts.length ? `<table><tbody>${arts.map((a) => miniRow([esc(a.title), esc(a.kind), esc(a.project_id)])).join("")}</tbody></table>` : `<div class="empty">${L.empty_artifacts}</div>` };
    }
    if (id === "contacts") {
      // 연락처 마스터(core_contact). 비어 있으면 사내 인원(core_person)으로 폴백.
      const cs = (await api("/api/contacts")).slice(0, 8);
      if (cs.length) return { title: L.tile_contacts, html: `<table><tbody>${cs.map((c) => miniRow([esc(c.name), esc(c.org ?? c.role ?? "-")])).join("")}</tbody></table>` };
      const people = (await api("/api/people")).slice(0, 8);
      return { title: L.tile_contacts, html: people.length ? `<table><tbody>${people.map((p) => miniRow([esc(p.name), esc(p.role ?? "-")])).join("")}</tbody></table>` : `<div class="empty">-</div>` };
    }
    if (id === "artifact_progress") {
      const sum = await api("/api/guide/summary");
      return { title: L.tile_artifact_progress, html: sum.length
        ? `<table><tbody>${sum.map((g) => miniRow([esc(g.project_id), `${g.steps_done}/${g.steps_total}`, `${g.pct}%`])).join("")}</tbody></table>`
        : `<div class="empty">-</div>` };
    }
    if (id === "gatewait") {
      const g = await api("/api/gates");
      const wait = (g.stages || []).filter((s) => s.status !== "cleared" && !s.passable).slice(0, 8);
      return { title: L.tile_gatewait, html: wait.length
        ? `<table><tbody>${wait.map((s) => miniRow([esc(s.project_id), esc(s.title), `${L.gate_held} ${s.remaining}`])).join("")}</tbody></table>`
        : `<div class="empty">${L.gate_passable}</div>` };
    }
    if (id === "stocklow") {
      const low = (await api("/api/stock/low")).slice(0, 8);
      return { title: L.tile_stocklow, html: low.length
        ? `<table><tbody>${low.map((p) => miniRow([esc(p.name), `${p.on_hand}/${p.min_qty}`])).join("")}</tbody></table>`
        : `<div class="empty">${L.empty_stocklow}</div>` };
    }
    if (id === "bomchg") {
      const ch = await api("/api/bom/changes?limit=8");
      return { title: L.tile_bomchg, html: ch.length
        ? `<table><tbody>${ch.map((e) => miniRow([localTime(e.at), esc(e.item_ref) + " ← " + esc(e.to_val)])).join("")}</tbody></table>`
        : `<div class="empty">-</div>` };
    }
    if (id === "purchase_w") {
      const pos = (await api("/api/purchases")).slice(0, 6);
      return { title: L.tile_purchase_w, html: pos.length
        ? `<table><tbody>${pos.map((p) => miniRow([esc(p.title), esc(p.party_name ?? "-"), L[`pstage_${p.stage}`] ?? p.stage])).join("")}</tbody></table>`
        : `<div class="empty">-</div>` };
    }
    if (id === "vendors") {
      const led = (await api("/api/parties/ledger")).slice(0, 6);
      return { title: L.tile_vendors, html: led.length
        ? `<table><tbody>${led.map((g) => miniRow([esc(g.party_name), `${g.count}`, Number(g.total_amount).toLocaleString()])).join("")}</tbody></table>`
        : `<div class="empty">-</div>` };
    }
    if (id === "meetings_w") {
      const ms = (await api("/api/meetings")).slice(0, 6);
      return { title: L.tile_meetings_w, html: ms.length
        ? `<table><tbody>${ms.map((m) => miniRow([m.at ? localTime(m.at) : "-", esc(m.title)])).join("")}</tbody></table>`
        : `<div class="empty">${L.empty_meetings}</div>` };
    }
    if (id === "inbox") {
      const ids = new Set(inbox.map((p) => p.id));
      const mails = (await api("/api/mail?days=3650")).filter((m) => ids.has(m.project_id)).slice(0, 8);
      return { title: L.tile_inbox, html: mails.length
        ? `<table><tbody>${mails.map((m) => miniRow([localTime(m.at), esc(m.subject)])).join("")}</tbody></table>`
        : `<div class="empty">${L.empty_mail}</div>` };
    }
    const events = await api("/api/events/recent");
    return { title: L.tile_events, html: events.length ? `<table><tbody>${events.slice(0, 6).map((e) => miniRow([localTime(e.at), esc(e.actor_ref), esc(e.kind)])).join("")}</tbody></table>` : `<div class="empty">-</div>` };
  }

  // 위젯 카드 — 절대좌표(% 가로 + px 세로). 본문 고정 높이 → 내부 스크롤.
  const cardStyle = (w) => `left:${(w.x / DASH_GCOLS) * 100}%; width:${(w.w / DASH_GCOLS) * 100}%;`
    + `top:${w.y * DASH_ROW}px; height:${(w.c ? 2 : w.h) * DASH_ROW}px;`;
  const cards = [];
  for (const w of layout) {
    const { title, html } = await widgetBody(w.id);
    const canCreate = CREATE_WIDGETS.has(w.id);
    cards.push(`<section class="widget ${w.c ? "collapsed" : ""}" data-wid="${w.id}" style="${cardStyle(w)}">
      <div class="widget-head" data-grip="${w.id}">
        <i class="wfold" data-fold="${w.id}" title="${w.c ? L.widget_expand : L.widget_collapse}">${w.c ? "▸" : "▾"}</i>
        <h4>${title}</h4>
        <span class="widget-ctrls">
          <i class="wpop" data-pop="${w.id}" title="${L.widget_popout}">⤢</i>
          <i class="wrefresh" data-refresh="${w.id}" title="${L.widget_refresh}">⟳</i>
          ${canCreate ? `<i class="wcreate" data-create="${w.id}" title="${L.widget_create}">✎</i>` : ""}
          <span class="widget-menu-wrap">
            <i class="wdots" data-menu="${w.id}" title="${L.widget_menu}">⋮</i>
            <div class="widget-menu hidden" data-menufor="${w.id}">
              <button data-mfold="${w.id}">${w.c ? L.widget_expand : L.widget_collapse}</button>
              <button data-mdel="${w.id}">${L.widget_remove}</button>
            </div>
          </span>
        </span>
      </div>
      <div class="widget-body" data-body="${w.id}">${html}</div>
      <i class="widget-resize" data-rid="${w.id}" title="${L.widget_resize}"></i>
    </section>`);
  }
  const maxBottom = Math.max(0, ...layout.map((w) => (w.y + (w.c ? 2 : w.h)))) * DASH_ROW + 20;
  // 서랍 = 전체 위젯을 대분류(객체축)별로 묶어 항상 표시(ECount식). 보드에 올라간 건 ● 동그라미.
  const widgetChip = (w) => {
    if (!w.ready) // 준비 중 슬롯: 비활성, 드래그 불가
      return `<div class="drawer-widget soon"><span class="dw-dot"></span><span class="grip">⠿</span> ${L[`tile_${w.id}`]}<span class="soon-tag dim">${L.widget_soon}</span></div>`;
    const placed = layout.some((x) => x.id === w.id);
    return `<div class="drawer-widget ${placed ? "placed" : ""}" ${placed ? "" : 'draggable="true"'} data-add="${w.id}">
      <span class="dw-dot ${placed ? "on" : ""}" title="${placed ? L.widget_placed : ""}"></span>
      <span class="grip">⠿</span> ${L[`tile_${w.id}`]}</div>`;
  };
  const drawerItems = CAT_ORDER.map((cat) => {
    const ws = WIDGET_PLAN.filter((w) => w.cat === cat);
    const body = ws.length ? ws.map(widgetChip).join("") : `<div class="drawer-empty dim">${L.widget_soon}</div>`;
    return `<div class="drawer-cat"><div class="drawer-cat-head">${L[cat]}</div>${body}</div>`;
  }).join("");

  $("#view").innerHTML = `${kpi}
    <button id="widgetEdge" class="widget-edge" title="${L.widget_add}" aria-label="${L.widget_add}">❙❙</button>
    <aside id="widgetDrawer" class="widget-drawer">
      <div class="widget-drawer-head">${L.widget_add}<span class="dim">${L.widget_drag_hint}</span></div>
      <div class="widget-drawer-list">${drawerItems}</div>
      <div class="widget-drawer-foot">
        <button id="widgetArrangeBtn" class="fav-chip" title="${L.widget_arrange}">⊟ ${L.widget_arrange}</button>
        <button id="widgetResetBtn" class="fav-chip" title="${L.widget_reset}">↺ ${L.widget_reset}</button>
      </div>
    </aside>
    <div class="dashboard" style="height:${maxBottom}px;">${cards.join("")}</div>`;

  const grid = $("#view").querySelector(".dashboard");
  const colW = () => grid.getBoundingClientRect().width / DASH_GCOLS;
  // 드래그/리사이즈 도중 실시간으로 다른 위젯을 격자 위치로 재배치(겹치면 밀려나고, 줄이면 되돌아옴)
  const applyLiveLayout = (resolved, anchorId) => {
    for (const w of resolved) {
      if (w.id === anchorId) continue;
      const c = grid.querySelector(`.widget[data-wid="${w.id}"]`);
      if (!c) continue;
      c.style.left = `${(w.x / DASH_GCOLS) * 100}%`;
      c.style.width = `${(w.w / DASH_GCOLS) * 100}%`;
      c.style.top = `${w.y * DASH_ROW}px`;
      c.style.height = `${(w.c ? 2 : w.h) * DASH_ROW}px`;
    }
    const maxB = Math.max(0, ...resolved.map((w) => w.y + (w.c ? 2 : w.h))) * DASH_ROW + 20;
    grid.style.height = `${maxB}px`;
  };
  // 매 이동마다 커밋된 base 에서 새로 계산 → 줄이면 원위치 복귀(누적 안 함)
  const liveResolve = (base, anchorId, patch) => {
    const layout = base.map((b) => b.id === anchorId ? { ...b, ...patch } : { ...b });
    resolveDashCollisions(layout, anchorId);
    applyLiveLayout(layout, anchorId);
  };
  // 이동/리사이즈/접기 후 anchor 고정 + 겹친 위젯 아래로 밀어냄(겹침 금지)
  const updateWidget = (id, patch) => {
    const next = dashLayout().map((x) => x.id === id ? { ...x, ...patch } : x);
    saveDashLayout(resolveDashCollisions(next, id)); render();
  };

  // 위젯 추가: ❙❙ 서랍을 펴서 목록 표시 → 드래그&드롭(또는 클릭)으로 보드에 추가
  const addWidgetAt = (id, x, y) => {
    if (!WIDGET_CATALOG.includes(id)) return;
    const l = dashLayout();
    if (l.some((w) => w.id === id)) return; // 이미 배치됨
    l.push({ id, x: Math.max(0, Math.min(DASH_GCOLS - 3, x | 0)), y: Math.max(0, y | 0), w: 3, h: 7 });
    saveDashLayout(resolveDashCollisions(l, id)); render();
  };
  $("#widgetEdge").addEventListener("click", () => {
    const open = $("#widgetDrawer").classList.toggle("open");
    $("#widgetEdge").classList.toggle("on", open);
  });
  $("#widgetArrangeBtn").addEventListener("click", () => { saveDashLayout(compactDash(dashLayout())); render(); });
  $("#widgetResetBtn").addEventListener("click", async () => { if (!(await uiConfirm(L.confirm_reset))) return; localStorage.removeItem("dev_erp_widgets"); render(); });
  // 서랍 항목: 드래그 시작 + 클릭(맨 아래 추가) 폴백
  $("#view").querySelectorAll(".drawer-widget:not(.placed):not(.soon)").forEach((d) => {
    d.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", d.dataset.add); e.dataTransfer.effectAllowed = "copy"; d.classList.add("dragging"); });
    d.addEventListener("dragend", () => d.classList.remove("dragging"));
    d.addEventListener("click", () => {
      const y = Math.max(0, ...dashLayout().map((w) => w.y + (w.c ? 2 : w.h)));
      addWidgetAt(d.dataset.add, 0, y);
    });
  });
  // 보드에 드롭 → 놓은 위치에 추가
  grid.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; grid.classList.add("drop-active"); });
  grid.addEventListener("dragleave", (e) => { if (e.target === grid) grid.classList.remove("drop-active"); });
  grid.addEventListener("drop", (e) => {
    e.preventDefault(); grid.classList.remove("drop-active");
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const r = grid.getBoundingClientRect();
    addWidgetAt(id, Math.round((e.clientX - r.left) / colW()), Math.round((e.clientY - r.top) / DASH_ROW));
  });
  // 접기/펼치기
  const toggleFold = (id) => { const cur = dashLayout().find((x) => x.id === id); updateWidget(id, { c: !cur?.c }); };
  $("#view").querySelectorAll("[data-fold]").forEach((f) =>
    f.addEventListener("mousedown", (e) => e.stopPropagation()));
  $("#view").querySelectorAll("[data-fold]").forEach((f) =>
    f.addEventListener("click", (e) => { e.stopPropagation(); toggleFold(f.dataset.fold); }));
  $("#view").querySelectorAll("[data-mfold]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); toggleFold(b.dataset.mfold); }));
  // 새로고침 (위젯 본문만 다시 렌더)
  $("#view").querySelectorAll("[data-refresh]").forEach((r) => {
    r.addEventListener("mousedown", (e) => e.stopPropagation());
    r.addEventListener("click", async (e) => {
      e.stopPropagation();
      r.classList.add("spinning");
      const { html } = await widgetBody(r.dataset.refresh);
      const body = $("#view").querySelector(`[data-body="${r.dataset.refresh}"]`);
      if (body) body.innerHTML = html;
      bindWidgetInner();
      setTimeout(() => r.classList.remove("spinning"), 400);
    });
  });
  // ⋮ 메뉴
  $("#view").querySelectorAll(".wdots").forEach((d) => {
    d.addEventListener("mousedown", (e) => e.stopPropagation());
    d.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = $("#view").querySelector(`.widget-menu[data-menufor="${d.dataset.menu}"]`);
      $("#view").querySelectorAll(".widget-menu").forEach((m) => { if (m !== menu) m.classList.add("hidden"); });
      menu.classList.toggle("hidden");
    });
  });
  document.addEventListener("click", () => $("#view")?.querySelectorAll(".widget-menu").forEach((m) => m.classList.add("hidden")), { once: true });
  $("#view").querySelectorAll("[data-mdel]").forEach((x) =>
    x.addEventListener("click", async (e) => { e.stopPropagation(); if (!(await uiConfirm(L.confirm_remove))) return; saveDashLayout(dashLayout().filter((w) => w.id !== x.dataset.mdel)); render(); }));
  // 팝아웃(크게 보기) — 위젯 본문을 큰 오버레이로
  $("#view").querySelectorAll(".wpop").forEach((p) => {
    p.addEventListener("mousedown", (e) => e.stopPropagation());
    p.addEventListener("click", async (e) => { e.stopPropagation(); await openPopout(p.dataset.pop); });
  });
  // 작성(✎) — 해당 도메인 작성 화면으로 (할일 생성)
  $("#view").querySelectorAll(".wcreate").forEach((c) => {
    c.addEventListener("mousedown", (e) => e.stopPropagation());
    c.addEventListener("click", (e) => { e.stopPropagation(); state.view = "items"; state.focusNewItem = true; render(); });
  });

  // 헤더: 끌면 자유 이동(마우스 추종→격자 스냅), 그냥 클릭하면 제자리 접기/펼치기
  $("#view").querySelectorAll("[data-grip]").forEach((head) => {
    head.addEventListener("mousedown", (e) => {
      if (e.target.closest(".wfold,.wrefresh,.wdots,.wpop,.wcreate,.widget-menu")) return;
      e.preventDefault();
      const card = head.closest(".widget"); const id = card.dataset.wid;
      const gridRect = grid.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const offX = e.clientX - cardRect.left, offY = e.clientY - cardRect.top;
      const startX = e.clientX, startY = e.clientY;
      const base = dashLayout();
      let moved = false;
      const onMove = (ev) => {
        if (!moved && Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return;
        if (!moved) { moved = true; card.classList.add("dragging"); }
        const px = ev.clientX - gridRect.left - offX;
        const py = ev.clientY - gridRect.top - offY;
        card.style.left = `${Math.max(0, px)}px`;
        card.style.top = `${Math.max(0, py)}px`;
        card.dataset.x = Math.max(0, Math.min(DASH_GCOLS - DASH_WMIN, Math.round(px / colW())));
        card.dataset.y = Math.max(0, Math.round(py / DASH_ROW));
        liveResolve(base, id, { x: Number(card.dataset.x), y: Number(card.dataset.y) }); // 실시간 밀어내기
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp);
        if (!moved) { toggleFold(id); return; }   // 클릭 = 제자리 접기 (위치 유지)
        card.classList.remove("dragging");
        updateWidget(id, { x: Number(card.dataset.x) || 0, y: Number(card.dataset.y) || 0 });
      };
      document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    });
  });
  // 자유 리사이즈 (우하단 핸들 — 마우스 따라 실시간, 놓으면 격자 스냅)
  $("#view").querySelectorAll(".widget-resize").forEach((h) => {
    h.addEventListener("mousedown", (e) => {
      e.preventDefault(); e.stopPropagation();
      const card = h.closest(".widget"); const id = h.dataset.rid;
      const cardRect = card.getBoundingClientRect();
      const base = dashLayout();
      card.classList.add("resizing");
      const onMove = (ev) => {
        const wpx = Math.max(colW() * DASH_WMIN, ev.clientX - cardRect.left);
        const hpx = Math.max(DASH_ROW * DASH_HMIN, ev.clientY - cardRect.top);
        card.style.width = `${wpx}px`; card.style.height = `${hpx}px`;
        card.dataset.w = Math.max(DASH_WMIN, Math.min(DASH_GCOLS, Math.round(wpx / colW())));
        card.dataset.h = Math.max(DASH_HMIN, Math.round(hpx / DASH_ROW));
        liveResolve(base, id, { w: Number(card.dataset.w), h: Number(card.dataset.h) }); // 실시간 밀어내기/복귀
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp);
        card.classList.remove("resizing");
        updateWidget(id, { w: Number(card.dataset.w) || 3, h: Number(card.dataset.h) || 6 });
      };
      document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    });
  });

  async function openPopout(id) {
    const { title, html } = await widgetBody(id);
    document.querySelector(".widget-pop-overlay")?.remove();
    const ov = document.createElement("div");
    ov.className = "widget-pop-overlay";
    ov.innerHTML = `<div class="widget-pop" role="dialog" aria-label="${title}">
      <div class="widget-pop-head"><h3>${title}</h3><button class="widget-pop-x" title="${L.filter_clear}">✕</button></div>
      <div class="widget-pop-body">${html}</div></div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    ov.querySelector(".widget-pop-x").addEventListener("click", close);
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); } });
    ov.querySelectorAll(".proj-row").forEach((r) =>
      r.addEventListener("click", () => { state.hubProject = r.dataset.p; state.hubTab = "overview"; state.view = "project"; close(); render(); }));
    ov.querySelectorAll("[data-jump-mail]").forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); state.projectFilter = b.dataset.jumpMail; state.view = "mail"; close(); render(); }));
  }

  function bindWidgetInner() {
    $("#view").querySelectorAll(".proj-row").forEach((r) =>
      r.addEventListener("click", () => { state.hubProject = r.dataset.p; state.hubTab = "overview"; state.view = "project"; render(); }));
    $("#view").querySelectorAll("[data-jump-mail]").forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); state.projectFilter = b.dataset.jumpMail; state.view = "mail"; render(); }));
  }
  bindWidgetInner();
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

// P2a (run16): 할일 상태 전이 빠른 동작 — 모든 변경은 서버가 event_log 에 기록
const ITEM_ACTS = {
  open: [["doing", "act_start"], ["done", "act_done"]],
  doing: [["done", "act_done"], ["blocked", "act_block"]],
  waiting: [["doing", "act_resume"], ["done", "act_done"]],
  blocked: [["doing", "act_resume"]],
  done: [["open", "act_reopen"]]
};

function itemActionsHtml(i) {
  return (ITEM_ACTS[i.status] ?? []).map(([to, key]) =>
    `<button class="act-btn ${to}" data-act="${to}" data-i="${esc(i.id)}">${state.lex[key]}</button>`).join("");
}

function wireItemActions(scope) {
  scope.querySelectorAll(".act-btn").forEach((b) =>
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const body = { id: b.dataset.i, status: b.dataset.act };
      if (b.dataset.act === "blocked") {
        const reason = window.prompt(state.lex.block_reason_ph, "");
        if (reason === null) return;
        if (reason.trim()) body.bottleneck_reason = reason.trim();
      }
      await post("/api/items/status", body);
      render();
    })
  );
}

function itemLinkCell(i) {
  if (i.guide_artifact_name) return `<span class="badge">${esc(i.guide_stage_code)} ${esc(i.guide_artifact_name)}</span>`;
  if (i.origin === "mail") return `<span class="badge blue">${state.lex.origin_mail_badge}</span>`;
  return '<span class="dim">-</span>';
}

async function renderItems() {
  const todayKey = new Date().toISOString().slice(0, 10);
  const summary = await api("/api/summary");
  const projects = summary.projects;
  state._projCache = projects;
  const q = new URLSearchParams();
  if (state.projectFilter) q.set("project", state.projectFilter);
  if (state.statusFilter) q.set("status", state.statusFilter);
  const items = await api(`/api/items?${q}`);
  // 칩 count 는 상태 무관 전체(과제 필터만)에서 계산 — 필터 걸려도 정확
  const baseQ = new URLSearchParams();
  if (state.projectFilter) baseQ.set("project", state.projectFilter);
  const allItems = state.statusFilter ? await api(`/api/items?${baseQ}`) : items;
  const opts = projects.map((p) => `<option value="${p.id}" ${state.projectFilter === p.id ? "selected" : ""}>${p.title}</option>`).join("");
  const L = state.lex;
  // ECount식 상태 필터칩 (전체 + 각 상태). count 표시.
  const statuses = ["open", "doing", "waiting", "blocked", "done"];
  const statusCount = (s) => allItems.filter((i) => i.status === s).length;
  const chip = (val, label, n) =>
    `<button class="status-chip ${state.statusFilter === val ? "on" : ""}" data-st="${val}">${label}${n != null ? ` <em>${n}</em>` : ""}</button>`;
  const chipsHtml = [chip("", L.all_label, allItems.length)]
    .concat(statuses.map((s) => chip(s, L[`status_${s}`], statusCount(s))))
    .join("");
  const rows = items.map((i) => `<tr>
      <td>${esc(i.title)}${i.encounter_role === "boss" ? " 👑" : ""}</td>
      <td><span class="proj-link" data-hub="${esc(i.project_id)}">${esc(i.project_id)}</span></td>
      <td>${statusBadge(i.status)}</td>
      ${dueCell(i.due, todayKey)}
      <td>${esc(i.assignee_ref ?? "-")}</td>
      <td>${itemLinkCell(i)}</td>
      <td class="acts">${itemActionsHtml(i)}</td>
    </tr>`).join("");
  $("#view").innerHTML = `
    <div class="filters">
      <select id="fProject"><option value="">${L.project}: ${L.all_label}</option>${opts}</select>
    </div>
    <div class="status-chips">${chipsHtml}</div>
    <div class="item-form">
      <select id="niProject">${opts || `<option value="">${L.project}</option>`}</select>
      <input id="niTitle" placeholder="${L.item_new_ph}" />
      <input id="niAssignee" placeholder="${L.assignee_ph}" size="9" />
      <input id="niDue" type="date" />
      <button id="niAdd" class="fav-chip">${L.item_add}</button>
    </div>
    ${rows ? `<table><thead><tr><th>${L.item}</th><th>${L.project}</th><th>${L.th_status}</th><th>${L.th_due}</th><th>${L.th_assignee}</th><th>${L.tab_guide}</th><th>${L.th_actions}</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">${L.empty_items}</div>`}`;
  $("#fProject").addEventListener("change", (e) => { state.projectFilter = e.target.value; render(); });
  $("#niAdd").addEventListener("click", async () => {
    const title = $("#niTitle").value.trim();
    const pid = $("#niProject").value;
    if (!title || !pid) return;
    const body = { project_id: pid, title };
    const a = $("#niAssignee").value.trim();
    if (a) body.assignee_ref = a;
    if ($("#niDue").value) body.due = $("#niDue").value;
    const r = await post("/api/items", body);
    if (r.ok) render();
  });
  $("#niTitle").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#niAdd").click(); });
  if (state.focusNewItem) { state.focusNewItem = false; $("#niTitle").focus(); }
  $("#view").querySelectorAll(".status-chip").forEach((c) =>
    c.addEventListener("click", () => { state.statusFilter = c.dataset.st || ""; render(); })
  );
  $("#view").querySelectorAll("[data-hub]").forEach((c) =>
    c.addEventListener("click", () => { state.hubProject = c.dataset.hub; state.hubTab = "overview"; state.view = "project"; render(); })
  );
  wireItemActions($("#view"));
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
  const checked = (state.mailChecked ??= new Set());
  let lastSec = null;
  const rows = mail.map((m) => {
    const sec = section(m);
    const head = sec !== lastSec ? `<tr class="date-sep"><td colspan="5">${L[sec]}</td></tr>` : "";
    lastSec = sec;
    const manual = m.label_ids.map((id) => labelById.get(id)).filter(Boolean)
      .map((l) => `<span class="label-chip manual mini" style="--lc:${esc(l.color)}">${esc(l.name)}</span>`).join("");
    return `${head}<tr class="mail-row ${state.mailSel === m.id ? "sel" : ""}" data-m="${esc(m.id)}">
      <td class="mail-check"><input type="checkbox" data-chk="${esc(m.id)}" ${checked.has(m.id) ? "checked" : ""} /></td>
      <td class="mail-meta">${projChip(m.project_id, clsById.get(m.project_id))}${manual}</td>
      <td class="mail-from">${m.direction === "out" ? `<i>→</i> ` : ""}${esc(m.counterpart ?? "-")}</td>
      <td class="mail-subj">${esc(m.subject)}</td>
      <td class="mail-time">${localTime(m.at)}</td>
    </tr>`;
  }).join("");

  // run17: 분류(재배정) 대상 과제 — inbox 류 제외, 진행 과제 우선
  const assignables = summary.projects.filter((p) => p.class !== "inbox");
  const assignOpts = assignables.map((p) =>
    `<option value="${esc(p.id)}">${esc(p.title === p.id ? p.id : `${p.id} · ${p.title}`)}</option>`).join("");
  const bulkBar = checked.size ? `<div class="assign-bar">
      <strong>${checked.size}${L.assign_unit}</strong>
      <select id="assignTarget">${assignOpts}</select>
      <label class="assign-mk"><input type="checkbox" id="assignMk" checked /> ${L.assign_make_items}</label>
      <button id="assignGo" class="fav-chip active">${L.assign_btn}</button>
    </div>` : "";

  const sel = mail.find((m) => m.id === state.mailSel);
  const detail = sel ? `<aside class="mail-detail">
      <h3>${esc(sel.subject)}</h3>
      <dl><div><dt>${L.th_counterpart}</dt><dd>${esc(sel.counterpart ?? "-")}</dd></div>
        <div><dt>${L.th_time}</dt><dd>${localTime(sel.at)} · ${sel.direction === "in" ? L.mail_in : L.mail_out}</dd></div>
        <div><dt>${L.project}</dt><dd>${esc(sel.project_id ?? "-")}</dd></div>
        <div><dt>${L.detail_pointer}</dt><dd class="pointer">${esc(sel.pointer_ref ?? "-")} <button class="copy-btn" data-c="${esc(sel.pointer_ref ?? "")}">${L.copy}</button></dd></div></dl>
      <h4>${L.detail_labels}</h4>
      <div class="label-bar">${labels.map((l) => `<span class="label-chip manual ${sel.label_ids.includes(l.id) ? "on" : ""}" style="--lc:${esc(l.color)}" data-toggle="${l.id}">${esc(l.name)}</span>`).join("") || `<span class="dim">-</span>`}</div>
      <div class="detail-actions">${state._promotedMails?.has(sel.id)
        ? `<span class="badge green">✓ ${L.item}</span>`
        : `<button id="promoteBtn" class="fav-chip">${L.promote_item}</button>`}</div>
      <h4>${L.assign_to}</h4>
      <div class="assign-bar inline">
        <select id="assignOne">${assignOpts}</select>
        <button id="assignOneGo" class="fav-chip">${L.assign_btn}</button>
      </div>
    </aside>` : "";

  $("#view").innerHTML = `${labelBar}${filterChips}${toolbar}${bulkBar}
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
  $("#promoteBtn")?.addEventListener("click", async () => {
    await post("/api/items/promote", { mail_id: state.mailSel });
    (state._promotedMails ??= new Set()).add(state.mailSel);
    render();
  });
  // run17: 분류(재배정) — 체크박스/묶음 바/상세 단건
  $("#view").querySelectorAll("[data-chk]").forEach((cb) =>
    cb.addEventListener("click", (e) => {
      e.stopPropagation();
      cb.checked ? checked.add(cb.dataset.chk) : checked.delete(cb.dataset.chk);
      render();
    })
  );
  const doAssign = async (mailIds, target, makeItems) => {
    const r = await post("/api/mail/assign", { mail_ids: mailIds, project_id: target, make_items: makeItems });
    if (!r.ok) return;
    const data = await r.json();
    checked.clear();
    // 출몰 연출 대상: 이번 분류로 생긴/이동한 할일들
    state.spawnItems = new Set(data.results.flatMap((x) => [x.item_created, x.item_moved].filter(Boolean)));
    state.hubProject = target;
    state.hubTab = state.mode === "fantasy" ? "overview" : "mail";
    state.view = "project";
    render();
  };
  $("#assignGo")?.addEventListener("click", () =>
    doAssign([...checked], $("#assignTarget").value, $("#assignMk").checked));
  $("#assignOneGo")?.addEventListener("click", () =>
    doAssign([state.mailSel], $("#assignOne").value, true));
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

// 가이드형 워크플로우 (run13, run16 재사용화): "폴더 순서 = 업무 순서" 를 화면으로.
// 전역 가이드 화면과 과제 허브 산출물 탭이 같은 섹션 빌더를 공유한다.
async function buildGuideSection(projectId) {
  const L = state.lex;
  const [tpl, arts] = await Promise.all([
    api(`/api/guide/templates?mode=${state.mode}`),
    projectId ? api(`/api/guide?project=${encodeURIComponent(projectId)}`) : Promise.resolve([])
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
      const currentName = currentKey ? tpl.flow.find((f) => f.key === currentKey).name : "";
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
          ${currentKey
            ? `<span class="badge amber">${L.guide_next}: ${esc(currentName)}</span>
               <button class="fav-chip mini" data-mkitem="${a.id}" data-step="${esc(currentKey)}" data-title="${esc(a.name)}: ${esc(currentName)}">${L.guide_make_item}</button>`
            : `<span class="badge green">${L.status_done}</span>`}
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

  return { html: tpl.stages.map(stageBlock).join(""), totalSteps, totalDone };
}

function wireGuideSection(scope, projectId) {
  scope.querySelectorAll("[data-open]").forEach((h) =>
    h.addEventListener("click", () => { state.guideOpen = state.guideOpen === Number(h.dataset.open) ? null : Number(h.dataset.open); render(); })
  );
  scope.querySelectorAll(".step-row").forEach((r) =>
    r.addEventListener("click", async () => {
      const on = !r.classList.contains("done");
      await post("/api/guide/step", { artifact_id: Number(r.dataset.a), step_key: r.dataset.s, on });
      render();
    })
  );
  scope.querySelectorAll("[data-add]").forEach((b) =>
    b.addEventListener("click", async () => {
      const input = scope.querySelector(`input[data-stage="${b.dataset.add}"]`);
      const name = input.value.trim();
      if (!name) return;
      const r = await post("/api/guide/artifact", { project_id: projectId, stage_code: b.dataset.add, name });
      if (r.ok) render();
    })
  );
  // P2a: 현재 스텝을 할 일로 — 가이드 산출물·스텝 연결된 item 생성
  scope.querySelectorAll("[data-mkitem]").forEach((b) =>
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      await post("/api/items", {
        project_id: projectId, title: b.dataset.title,
        guide_artifact_id: Number(b.dataset.mkitem), guide_step_key: b.dataset.step
      });
      render();
    })
  );
}

async function renderGuide() {
  const L = state.lex;
  const summary = state._projCache ? { projects: state._projCache } : await api("/api/summary");
  state._projCache = summary.projects;
  const actives = summary.projects.filter((p) => p.class === "active");
  if (!state.guideProject && actives[0]) state.guideProject = actives[0].id;
  const g = await buildGuideSection(state.guideProject);

  $("#view").innerHTML = `
    <div class="filters">
      <select id="gProject">${actives.map((p) => `<option value="${esc(p.id)}" ${state.guideProject === p.id ? "selected" : ""}>${esc(p.title)}</option>`).join("")}</select>
      <span class="dim guide-principle">${L.guide_principle}</span>
      ${g.totalSteps ? `<span class="badge">${L.guide_progress} ${g.totalDone}/${g.totalSteps}</span>` : ""}
    </div>
    ${g.html}`;

  $("#gProject").addEventListener("change", (e) => { state.guideProject = e.target.value; render(); });
  wireGuideSection($("#view"), state.guideProject);
}

// --- 과제 허브 (run16): "프로젝트 안에 산출물" — 과제가 컨테이너, 탭으로 내용물 ---
async function renderProjectHub() {
  const L = state.lex;
  const pid = state.hubProject;
  const summary = await api("/api/summary");
  state._projCache = summary.projects;
  const p = summary.projects.find((x) => x.id === pid);
  if (!p) { state.view = "home"; return render(); }
  const tab = state.hubTab ?? "overview";
  const tabs = ["overview", "guide", "mail", "history"];
  $("#view").innerHTML = `
    <div class="hub-tabs">
      <button id="hubBack" class="fav-chip">${L.back_home}</button>
      ${tabs.map((t) => `<button class="hub-tab ${tab === t ? "on" : ""}" data-tab="${t}">${L[`tab_${t}`]}</button>`).join("")}
      <span class="badge">${L[`class_${p.class}`] ?? esc(p.class)}</span>
    </div>
    <div id="hubBody"></div>`;
  $("#hubBack").addEventListener("click", () => { state.view = "home"; render(); });
  $("#view").querySelectorAll(".hub-tab").forEach((b) =>
    b.addEventListener("click", () => { state.hubTab = b.dataset.tab; render(); })
  );
  const mount = $("#hubBody");
  if (tab === "guide") return hubGuide(mount, p);
  if (tab === "mail") return hubMail(mount, p);
  if (tab === "history") return hubHistory(mount, p);
  return hubOverview(mount, p);
}

async function hubOverview(mount, p) {
  const L = state.lex;
  const todayKey = new Date().toISOString().slice(0, 10);
  const [items, mail] = await Promise.all([
    api(`/api/items?project=${encodeURIComponent(p.id)}`),
    api(`/api/mail?project=${encodeURIComponent(p.id)}&days=90`)
  ]);
  const openCnt = items.filter((i) => i.status !== "done").length;
  const spawn = state.spawnItems ?? new Set();
  const rows = items.map((i) => `<tr class="${spawn.has(i.id) ? "spawned" : ""}">
      <td>${esc(i.title)}</td>
      <td>${statusBadge(i.status)}</td>
      ${dueCell(i.due, todayKey)}
      <td>${esc(i.assignee_ref ?? "-")}</td>
      <td>${itemLinkCell(i)}</td>
      <td class="acts">${itemActionsHtml(i)}</td>
    </tr>`).join("");
  state.spawnItems = null; // 일회성 연출
  const mailRows = mail.slice(0, 5).map((m) => `<tr>
      <td class="mail-time">${localTime(m.at)}</td>
      <td class="mail-from">${m.direction === "out" ? "<i>→</i> " : ""}${esc(m.counterpart ?? "-")}</td>
      <td class="mail-subj">${esc(m.subject)}</td></tr>`).join("");
  mount.innerHTML = `
    <div class="kpi-row">
      <div class="kpi"><span>${L.col_remaining}</span><strong>${openCnt}</strong></div>
      <div class="kpi red"><span>${L.kpi_blocked}</span><strong>${p.blocked}</strong></div>
      <div class="kpi red"><span>${L.kpi_overdue}</span><strong>${p.overdue}</strong></div>
      <div class="kpi amber"><span>${L.kpi_today}</span><strong>${p.due_today}</strong></div>
    </div>
    <div class="item-form">
      <input id="niTitle" placeholder="${L.item_new_ph}" />
      <input id="niAssignee" placeholder="${L.assignee_ph}" size="9" />
      <input id="niDue" type="date" />
      <button id="niAdd" class="fav-chip">${L.item_add}</button>
    </div>
    ${rows ? `<table><thead><tr><th>${L.item}</th><th>${L.th_status}</th><th>${L.th_due}</th><th>${L.th_assignee}</th><th>${L.tab_guide}</th><th>${L.th_actions}</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">${L.empty_items}</div>`}
    <h4 class="hub-h4">${L.tile_mail}</h4>
    ${mailRows ? `<table class="mail-table"><tbody>${mailRows}</tbody></table>` : `<div class="empty small">${L.empty_mail}</div>`}`;
  $("#niAdd").addEventListener("click", async () => {
    const title = $("#niTitle").value.trim();
    if (!title) return;
    const body = { project_id: p.id, title };
    const a = $("#niAssignee").value.trim();
    if (a) body.assignee_ref = a;
    if ($("#niDue").value) body.due = $("#niDue").value;
    const r = await post("/api/items", body);
    if (r.ok) render();
  });
  $("#niTitle").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#niAdd").click(); });
  wireItemActions(mount);
}

async function hubGuide(mount, p) {
  const L = state.lex;
  const g = await buildGuideSection(p.id);
  mount.innerHTML = `
    <div class="filters"><span class="dim guide-principle">${L.guide_principle}</span>
      ${g.totalSteps ? `<span class="badge">${L.guide_progress} ${g.totalDone}/${g.totalSteps}</span>` : ""}</div>
    ${g.html}`;
  wireGuideSection(mount, p.id);
}

async function hubMail(mount, p) {
  const L = state.lex;
  const [mail, items] = await Promise.all([
    api(`/api/mail?project=${encodeURIComponent(p.id)}&days=365`),
    api(`/api/items?project=${encodeURIComponent(p.id)}`)
  ]);
  const promoted = new Set(items.map((i) => i.origin_mail_id).filter(Boolean));
  const rows = mail.map((m) => `<tr class="mail-row">
      <td class="mail-time">${localTime(m.at)}</td>
      <td class="mail-from">${m.direction === "out" ? "<i>→</i> " : ""}${esc(m.counterpart ?? "-")}</td>
      <td class="mail-subj">${esc(m.subject)}</td>
      <td class="acts">${promoted.has(m.id)
        ? `<span class="badge green">✓ ${L.item}</span>`
        : `<button class="fav-chip mini" data-promote="${esc(m.id)}">${L.promote_item}</button>`}
        ${m.pointer_ref ? `<button class="copy-btn" data-c="${esc(m.pointer_ref)}">${L.copy}</button>` : ""}</td>
    </tr>`).join("");
  mount.innerHTML = rows
    ? `<table class="mail-table"><tbody>${rows}</tbody></table>`
    : `<div class="empty">${L.empty_mail}</div>`;
  mount.querySelectorAll("[data-promote]").forEach((b) =>
    b.addEventListener("click", async () => {
      await post("/api/items/promote", { mail_id: b.dataset.promote });
      render();
    })
  );
  mount.querySelectorAll(".copy-btn").forEach((b) =>
    b.addEventListener("click", () => navigator.clipboard?.writeText(b.dataset.c))
  );
}

async function hubHistory(mount, p) {
  const L = state.lex;
  const events = await api(`/api/events/recent?project=${encodeURIComponent(p.id)}&limit=50`);
  mount.innerHTML = events.length
    ? `<table><tbody>${events.map((e) => `<tr>
        <td class="mail-time">${localTime(e.at)}</td>
        <td><span class="badge">${esc(e.kind)}</span></td>
        <td>${esc(e.from_val ? `${e.from_val} → ` : "")}${esc(e.to_val ?? "")}${e.bottleneck_reason ? ` · ${esc(e.bottleneck_reason)}` : ""}</td>
        <td class="dim">${esc(e.actor_ref)}</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty small">-</div>`;
}

// 회의록(메타 전용 읽기+생성). 자동추출·원문첨부 없음 — 액션아이템은 기존 할일 수동 링크.
// A1/A2 게이트 판정·강제 화면. hard 기본(미충족 차단), soft 전환 가능. 게임코드 0.
async function renderGates() {
  const L = state.lex;
  const data = await api("/api/gates");
  const stages = data.stages || [];
  const byProj = {};
  for (const s of stages) (byProj[s.project_id] ||= []).push(s);
  const modeBtns = `<div class="gate-mode">
    <span class="dim">${L.gate_mode_label}:</span>
    <button class="fav-chip ${data.mode === "hard" ? "active" : ""}" data-mode="hard">${L.gate_hard}</button>
    <button class="fav-chip ${data.mode === "soft" ? "active" : ""}" data-mode="soft">${L.gate_soft}</button>
  </div>`;
  const reason = (r) => `${L[`gate_reason_${r.code}`] ?? r.code} ${r.n}`;
  const sec = Object.entries(byProj).map(([pid, ss]) => `<section class="gate-proj"><h3>${esc(pid)}</h3>
    <table><thead><tr><th>${L.stage}</th><th>${L.th_status}</th><th>${L.col_remaining}</th><th>${L.blocked}</th><th>${L.tab_guide}</th><th></th></tr></thead><tbody>
    ${ss.map((s) => `<tr>
      <td><strong>${esc(s.title)}</strong>${s.gate_rule ? `<div class="dim">${esc(s.gate_rule)}</div>` : ""}</td>
      <td>${s.status === "cleared" ? `<span class="badge green">${L.gate_cleared}</span>` : (s.passable ? `<span class="badge">${L.gate_passable}</span>` : `<span class="badge red">${L.gate_held}</span>`)}${state.mode === "fantasy" ? `<div class="boss-hp" title="${L.gate_boss_hp}"><i style="width:${s.status === "cleared" ? 0 : Math.min(100, s.remaining * 8)}%"></i></div><span class="dim boss-hp-n">${s.status === "cleared" ? L.gate_boss_slain : `HP ${s.remaining}`}</span>` : ""}</td>
      <td class="num">${s.open_items}</td>
      <td class="num">${s.blocked_items || '<span class="dim">0</span>'}</td>
      <td>${s.artifacts ? `${s.steps_done}/${s.steps_total}` : '<span class="dim">-</span>'}</td>
      <td>${s.status === "cleared" ? "" : `<button class="fav-chip gate-pass-btn" data-stage="${esc(s.id)}" data-passable="${s.passable}">${L.gate_pass}</button>${s.reasons.length ? `<div class="dim gate-reasons">${s.reasons.map(reason).join(", ")}</div>` : ""}`}</td>
    </tr>`).join("")}
    </tbody></table></section>`).join("");
  $("#view").innerHTML = `<div class="gate-head"><button id="openSched" class="fav-chip">${L.sched_open}</button></div>${modeBtns}${stages.length ? sec : `<div class="empty">${L.empty_gates}</div>`}`;
  $("#openSched").addEventListener("click", () => { state.view = "mod:schedule"; render(); });
  $("#view").querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", async () => {
    await post("/api/settings/gate_mode", { mode: b.dataset.mode }); render();
  }));
  $("#view").querySelectorAll(".gate-pass-btn").forEach((b) => b.addEventListener("click", async () => {
    const r = await post("/api/gates/clear", { stage_id: b.dataset.stage });
    let res; try { res = await r.json(); } catch { res = {}; }
    if (res.error === "gate_blocked") {
      if (await uiConfirm(L.gate_force_confirm)) {
        await post("/api/gates/clear", { stage_id: b.dataset.stage, force: true });
        render();
      }
    } else { render(); }
  }));
}

// U-1a: SE 스케줄러 화면 — 템플릿 적용(산출물 자동 spawn) + 마일스톤 날짜 전파.
async function renderSchedule() {
  const L = state.lex;
  const tpls = await api("/api/schedule/templates");
  const sum = await api("/api/summary");
  const projects = sum.projects || [];
  const people = await api("/api/people");
  const icsPersonOpts = `<option value="">${L.all_label}</option>` + (people || []).map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  state.schedProject ??= (projects.find((p) => p.class === "active") || projects[0])?.id;
  state.schedAnchors ??= {};
  const projOpts = projects.map((p) => `<option value="${esc(p.id)}" ${p.id === state.schedProject ? "selected" : ""}>${esc(p.title || p.id)}</option>`).join("");
  const milestones = [];
  const tplCards = (tpls || []).map((t) => {
    const stageRows = (t.stages || []).map((s) => { if (s.is_milestone) milestones.push(s.stage_code); return `<li>${esc(s.stage_code)}${s.is_milestone ? ` <span class="badge">${L.sched_milestone}</span>` : ""}</li>`; }).join("");
    const delRows = (t.deliverables || []).map((d) => `<tr>
      <td>${esc(d.deliverable_name)}</td>
      <td class="dim">${esc(d.anchor_stage_code)}</td>
      <td><input type="number" class="sched-off" style="width:4.2em" value="${d.offset_days}" /> <span class="dim">${L.sched_offset_unit}</span></td>
      <td><button class="fav-chip sched-off-save" data-key="${esc(t.key)}" data-stage="${esc(d.anchor_stage_code)}" data-name="${esc(d.deliverable_name)}">${L.sched_save}</button></td></tr>`).join("");
    return `<section class="sched-tpl"><h3>${esc(t.name)} <span class="dim">(${esc(t.key)})</span></h3>
      <ul class="sched-stages">${stageRows}</ul>
      <table><thead><tr><th>${L.sched_deliverable}</th><th>${L.sched_milestone}</th><th>${L.sched_offset}</th><th></th></tr></thead><tbody>${delRows}</tbody></table>
      <button class="fav-chip sched-apply" data-key="${esc(t.key)}">${L.sched_apply}</button></section>`;
  }).join("");
  const uniqMs = [...new Set(milestones)];
  const anchorInputs = uniqMs.map((code) => `<div class="sched-anchor"><label>${L.sched_milestone} ${esc(code)}</label>
    <input type="date" data-anchor="${esc(code)}" value="${state.schedAnchors[code] ?? ""}" />
    <button class="fav-chip sched-anchor-apply" data-code="${esc(code)}">${L.sched_anchor_apply}</button></div>`).join("");
  $("#view").innerHTML = `<div class="sched-head">
      <button id="schedBack" class="fav-chip">${L.sched_back}</button>
      <label>${L.sched_pick_project}</label> <select id="schedProj">${projOpts}</select>
      <span class="sched-ics"><label>${L.cal_export}</label> <select id="icsPerson">${icsPersonOpts}</select>
        <button id="icsDl" class="fav-chip" title="${L.cal_export_hint}">⤓ .ics</button></span>
    </div>
    <div id="schedMsg" class="dim"></div>
    <div class="dim sched-note">${L.sched_timing_note}</div>
    ${anchorInputs ? `<div class="sched-anchors">${anchorInputs}</div>` : ""}
    ${tplCards || `<div class="empty">-</div>`}`;
  $("#schedBack").addEventListener("click", () => { state.view = "mod:gates"; render(); });
  $("#schedProj").addEventListener("change", (e) => { state.schedProject = e.target.value; });
  $("#icsDl").addEventListener("click", () => { const p = $("#icsPerson").value; window.location = "/api/calendar.ics" + (p ? `?person=${encodeURIComponent(p)}` : ""); });
  $("#view").querySelectorAll("[data-anchor]").forEach((inp) => inp.addEventListener("change", (e) => { state.schedAnchors[e.target.dataset.anchor] = e.target.value; }));
  $("#view").querySelectorAll(".sched-apply").forEach((b) => b.addEventListener("click", async () => {
    const r = await post("/api/schedule/apply", { project_id: state.schedProject, template_key: b.dataset.key, anchorDates: state.schedAnchors });
    let res; try { res = await r.json(); } catch { res = {}; }
    $("#schedMsg").textContent = res.created ? `${res.created.length}${L.sched_created}` : (res.error ?? "");
  }));
  $("#view").querySelectorAll(".sched-anchor-apply").forEach((b) => b.addEventListener("click", async () => {
    const date = state.schedAnchors[b.dataset.code];
    if (!date) return;
    const r = await post("/api/schedule/anchor", { project_id: state.schedProject, anchor_stage_code: b.dataset.code, date });
    let res; try { res = await r.json(); } catch { res = {}; }
    $("#schedMsg").textContent = res.shifted != null ? `${res.shifted}${L.sched_shifted}` : (res.error ?? "");
  }));
  $("#view").querySelectorAll(".sched-off-save").forEach((b) => b.addEventListener("click", async () => {
    const inp = b.closest("tr").querySelector(".sched-off");
    const r = await post("/api/schedule/deliverable", { template_key: b.dataset.key, anchor_stage_code: b.dataset.stage, deliverable_name: b.dataset.name, offset_days: Number(inp.value) });
    let res; try { res = await r.json(); } catch { res = {}; }
    $("#schedMsg").textContent = res.ok ? L.sched_saved : (res.error ?? "");
  }));
}

async function renderMeetings() {
  const L = state.lex;
  const [summary, meetings] = await Promise.all([api("/api/summary"), api("/api/meetings")]);
  const opts = summary.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join("");
  const rows = await Promise.all(meetings.map(async (m) => {
    const acts = await api(`/api/meetings/actions?meeting=${encodeURIComponent(m.id)}`);
    const actHtml = acts.length ? acts.map((i) => `<span class="badge">${esc(i.title)}</span>`).join(" ") : `<span class="dim">-</span>`;
    return `<tr><td>${m.at ? localTime(m.at) : "-"}</td><td><strong>${esc(m.title)}</strong></td><td>${esc(m.project_id ?? "-")}</td><td>${esc(m.attendees ?? "-")}</td><td>${actHtml}</td><td class="pointer">${esc(m.summary_pointer ?? "-")}</td></tr>`;
  }));
  $("#view").innerHTML = `
    <div class="item-form">
      <input id="mtgTitle" placeholder="${L.meeting_title}" />
      <input id="mtgDate" type="date" />
      <select id="mtgProject"><option value="">${L.project}</option>${opts}</select>
      <input id="mtgAttend" placeholder="${L.meeting_attendees}" size="10" />
      <input id="mtgPtr" placeholder="${L.meeting_summary}" />
      <button id="mtgAdd" class="fav-chip">${L.meeting_add}</button>
    </div>
    ${meetings.length
      ? `<table><thead><tr><th>${L.meeting_date}</th><th>${L.meeting_title}</th><th>${L.project}</th><th>${L.meeting_attendees}</th><th>${L.meeting_actions}</th><th>${L.detail_pointer}</th></tr></thead><tbody>${rows.join("")}</tbody></table>`
      : `<div class="empty">${L.empty_meetings}</div>`}`;
  $("#mtgAdd").addEventListener("click", async () => {
    const title = $("#mtgTitle").value.trim();
    if (!title) return;
    const body = { title };
    if ($("#mtgDate").value) body.at = $("#mtgDate").value;
    if ($("#mtgProject").value) body.project_id = $("#mtgProject").value;
    if ($("#mtgAttend").value.trim()) body.attendees = $("#mtgAttend").value.trim();
    if ($("#mtgPtr").value.trim()) body.summary_pointer = $("#mtgPtr").value.trim();
    const r = await post("/api/meetings", body);
    if (r.ok) render();
  });
  $("#mtgTitle").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#mtgAdd").click(); });
}

async function render() {
  document.getElementById("app").dataset.view = state.view; // 홈(위젯)에선 좌측 열 숨김용
  renderAuth();
  renderNav();
  if (state.view === "mod:gates") {
    const m = (state.modules ?? []).find((x) => x.id === "gates");
    $("#viewTitle").textContent = m?.nav ?? "게이트";
    logView(state.view);
    return renderGates();
  }
  if (state.view === "mod:schedule") {
    $("#viewTitle").textContent = state.lex.sched_title;
    logView(state.view);
    return renderSchedule();
  }
  if (state.view === "mod:reports") {
    const m = (state.modules ?? []).find((x) => x.id === "reports");
    $("#viewTitle").textContent = m?.nav ?? "보고서";
    logView(state.view);
    return renderReports();
  }
  if (state.view === "mod:knowledge") { const m=(state.modules??[]).find(x=>x.id==="knowledge"); $("#viewTitle").textContent=m?.nav??"지식"; logView(state.view); return renderKnowledge(); }
  if (state.view === "mod:calculators") { const m=(state.modules??[]).find(x=>x.id==="calculators"); $("#viewTitle").textContent=m?.nav??"계산기"; logView(state.view); return renderCalculators(); }
  if (state.view === "mod:inventory") { const m=(state.modules??[]).find(x=>x.id==="inventory"); $("#viewTitle").textContent=m?.nav??"재고"; logView(state.view); return renderInventory(); }
  if (state.view === "mod:boards") { const m=(state.modules??[]).find(x=>x.id==="boards"); $("#viewTitle").textContent=m?.nav??"보드/BOM"; logView(state.view); return renderBoards(); }
  if (state.view === "mod:stockwatch") { const m=(state.modules??[]).find(x=>x.id==="stockwatch"); $("#viewTitle").textContent=m?.nav??"부품감시"; logView(state.view); return renderStockwatch(); }
  if (state.view === "mod:contacts") {
    const m = (state.modules ?? []).find((x) => x.id === "contacts");
    $("#viewTitle").textContent = m?.nav ?? "연락처";
    logView(state.view);
    return renderContacts();
  }
  if (state.view === "mod:purchase") {
    const m = (state.modules ?? []).find((x) => x.id === "purchase");
    $("#viewTitle").textContent = m?.nav ?? "구매/발주";
    logView(state.view);
    return renderPurchase();
  }
  if (state.view === "mod:meetings") {
    const m = (state.modules ?? []).find((x) => x.id === "meetings");
    $("#viewTitle").textContent = m?.nav ?? state.lex.tab_mail;
    logView(state.view);
    return renderMeetings();
  }
  const titles = { home: "nav_home", items: "nav_items", guide: "nav_guide", mail: "nav_mail", artifacts: "nav_artifacts", search: "nav_search" };
  if (state.view.startsWith("mod:")) {
    const m = (state.modules ?? []).find((x) => `mod:${x.id}` === state.view);
    $("#viewTitle").textContent = m?.nav ?? "";
    logView(state.view);
    return renderModulePlaceholder(state.view.slice(4));
  }
  if (state.view === "project") {
    const p = (state._projCache ?? []).find((x) => x.id === state.hubProject);
    $("#viewTitle").textContent = p ? (p.title === p.id ? p.id : `${p.id} · ${p.title}`) : (state.hubProject ?? "");
    logView(`project:${state.hubProject}`);
    return renderProjectHub();
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
    run: () => { state.hubProject = p.id; state.hubTab = "overview"; state.view = "project"; render(); }
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
// 상단 검색 인라인 드롭다운 (ECount 메뉴검색식: 타이핑 → 매칭 리스트가 아래 붙음)
function searchDropdownEl() {
  let el = document.getElementById("searchDropdown");
  if (!el) {
    el = document.createElement("div");
    el.id = "searchDropdown";
    el.className = "search-dropdown hidden";
    $("#globalSearch").parentElement.appendChild(el);
  }
  return el;
}
function clearSearchDropdown() {
  const el = searchDropdownEl();
  el.classList.add("hidden");
  el.innerHTML = "";
}
async function renderSearchDropdown(q) {
  const el = searchDropdownEl();
  if (!q.trim()) { clearSearchDropdown(); return; }
  if (!state._projCache) { try { state._projCache = (await api("/api/summary")).projects; } catch { state._projCache = []; } }
  const entries = (await paletteEntries(q)).slice(0, 10);
  const fullRow = `<div class="palette-item dim" data-full="1">🔎 ${esc(state.lex.nav_search)}: "${esc(q)}"</div>`;
  el.innerHTML = (entries.length
    ? entries.map((e, i) => `<div class="palette-item" data-i="${i}"><span class="palette-kind">${state.lex[`palette_kind_${e.kind}`]}</span>${esc(e.label)}</div>`).join("")
    : "") + fullRow;
  el.classList.remove("hidden");
  el.querySelectorAll(".palette-item[data-i]").forEach((item) =>
    item.addEventListener("mousedown", async (ev) => {
      ev.preventDefault();
      (await paletteEntries(q))[Number(item.dataset.i)]?.run();
      $("#globalSearch").value = ""; clearSearchDropdown();
    })
  );
  el.querySelector("[data-full]")?.addEventListener("mousedown", (ev) => {
    ev.preventDefault();
    state.searchTerm = q; state.view = "search"; render();
    $("#globalSearch").value = ""; clearSearchDropdown();
  });
}
$("#globalSearch").addEventListener("input", (e) => renderSearchDropdown(e.target.value));
$("#globalSearch").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { state.searchTerm = e.target.value; state.view = "search"; render(); clearSearchDropdown(); }
  else if (e.key === "Escape") { e.target.value = ""; clearSearchDropdown(); }
});
$("#globalSearch").addEventListener("blur", () => setTimeout(clearSearchDropdown, 150));

$("#chatBtn")?.addEventListener("click", openChat);
await loadMe();
await pullServerLayout();
await loadLexicon();
render();
