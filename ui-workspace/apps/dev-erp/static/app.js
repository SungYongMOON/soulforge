// dev-erp P1 클라이언트 (no-build vanilla JS).
// 모든 라벨은 /api/lexicon 사전을 거친다 (하드코딩 금지, INFRA-004).
const VERSION_FALLBACK = Object.freeze({
  erp: Object.freeze({ release: "v?", build: "unknown", source: "unavailable" }),
  chatbot: Object.freeze({ release: "v?", build: "unknown", source: "unavailable" }),
  runtime: Object.freeze({ port: "?", checkout: "unknown", llm: Object.freeze({}), codex_task: Object.freeze({ mode: "?", bridge: "v?" }) })
});
const CHAT_REQUEST_TIMEOUT_MS = 310000;
const REQUEST_TIMEOUT_MS = 15000;
const UPLOAD_REQUEST_TIMEOUT_MS = 120000;

function browserVersionText(ua = navigator.userAgent || "") {
  const rules = [
    ["Edge", /Edg\/([\d.]+)/],
    ["Chrome", /Chrome\/([\d.]+)/],
    ["Firefox", /Firefox\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, re] of rules) {
    const m = String(ua).match(re);
    if (m) return `${name} ${m[1]}`;
  }
  return "Unknown";
}

const isMobileViewport = () => window.matchMedia?.("(max-width: 640px)")?.matches || window.innerWidth <= 640;

function versionPart(kind) {
  const fallback = VERSION_FALLBACK[kind] || VERSION_FALLBACK.erp;
  const v = state.version?.[kind] || fallback;
  return {
    release: String(v.release || fallback.release),
    build: String(v.build || fallback.build),
    source: String(v.source || fallback.source)
  };
}

function codexBridgePart(source = state.version?.runtime?.codex_task) {
  const c = source || VERSION_FALLBACK.runtime.codex_task;
  return {
    mode: String(c.mode || "?"),
    release: String(c.release || c.bridge || "v?"),
    source: String(c.source || "runtime.codex_task")
  };
}

const state = {
  mode: localStorage.getItem("dev_erp_mode") || "business",
  // 새로고침 시 보던 화면 유지. 컨텍스트(hubProject/knowSel) 필요한 project·knowledge 는 home 으로 폴백.
  view: ["home", "projects", "items", "guide", "mail", "artifacts", "search", "mod:calendar"].includes(localStorage.getItem("dev_erp_view")) ? localStorage.getItem("dev_erp_view") : "home",
  lex: {},
  version: VERSION_FALLBACK,
  projectFilter: "",
  viewScope: localStorage.getItem("dev_erp_view_scope") || null, // 보던 인원/팀 뷰(새로고침 유지)
  navTop: localStorage.getItem("dev_erp_navtop") || "work",       // L1 대분류(상단 가로)
  navGroup: localStorage.getItem("dev_erp_navgroup") || "work_mine", // L2 중분류(상단 가로, 섹터)
  knowGroup: "standards", knowSel: null, _knowCache: null, // 지식: 현재 분야그룹 / 선택 항목 / canon 캐시
  navFold: new Set(JSON.parse(localStorage.getItem("dev_erp_navfold") || "[]")), // 좌측 L3 접힘 키
  pins: JSON.parse(localStorage.getItem("dev_erp_pins") || "[]"),
  // P2b: 계정/권한. 익명(account=null)이면 앱은 현행대로(전체 접근·localStorage).
  account: null, perms: [], accountCount: 0, allowSelfRegister: false,
  mineOnly: localStorage.getItem("dev_erp_mine") !== "0", // 내 할 일: 기본 '내 일만'(로그인 시). 익명이면 무시.
  suggestedMine: localStorage.getItem("dev_erp_sug_mine") === "1", // B-5 제안 수신함: '내게 제안된 것만' 렌즈(분류 필요 탭)
  chatLog: [],
  chatThread: null,
  chatDock: JSON.parse(localStorage.getItem("dev_erp_chat_dock") || "{}"),
  taskCodexDock: JSON.parse(localStorage.getItem("dev_erp_task_codex_dock") || "{}"),
  taskCodexOptions: JSON.parse(localStorage.getItem("dev_erp_task_codex_options") || "{}"),
  poProject: "",
  poParty: "",
  ctProject: "",
  bomBoard: "",
  itemEdit: null,
  itemLimit: 100,
  itemOffset: Number(localStorage.getItem("dev_erp_item_offset")) || 0,
  mailLimit: 100,
  mailOffset: Number(localStorage.getItem("dev_erp_mail_offset")) || 0,
  connection: { status: "checking", failure: null },
  booted: false
};
// 새로고침/이동 시 "보던 페이지에서" 유지: 언로드 직전 현재 위치(페이지 offset·뷰)를 저장 → 시작 시 위에서 복원.
window.addEventListener("beforeunload", () => {
  try {
    localStorage.setItem("dev_erp_view", state.view || "home");
    localStorage.setItem("dev_erp_mail_offset", String(state.mailOffset || 0));
    localStorage.setItem("dev_erp_item_offset", String(state.itemOffset || 0));
    localStorage.setItem("dev_erp_view_scope", state.viewScope ?? "");
  } catch { /* noop */ }
});

function newChatThreadId() {
  let suffix = "";
  try {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    suffix = buf[0].toString(36);
  } catch {
    suffix = Math.random().toString(36).slice(2, 10);
  }
  return `th_${Date.now().toString(36)}_${suffix}`;
}

function chatOwnerKey() {
  const raw = state.account?.username || state.account?.id || "anon";
  try {
    return encodeURIComponent(String(raw)).replace(/%/g, "_").slice(0, 120) || "anon";
  } catch {
    return String(raw).replace(/[^\w.-]+/g, "_").slice(0, 80) || "anon";
  }
}

function chatThreadStorageKey() {
  return `dev_erp_chat_thread_${chatOwnerKey()}`;
}

function chatLogStorageKey(thread = state.chatThread) {
  return `dev_erp_chat_log_${chatOwnerKey()}_${thread || "none"}`;
}

function ensureChatThread() {
  if (state.chatThread) return state.chatThread;
  const saved = localStorage.getItem(chatThreadStorageKey());
  state.chatThread = saved || newChatThreadId();
  localStorage.setItem(chatThreadStorageKey(), state.chatThread);
  return state.chatThread;
}

function saveChatLog() {
  if (!state.chatThread) return;
  try {
    const compact = state.chatLog
      .filter((m) => !m.pending)
      .slice(-40)
      .map((m) => ({
        role: m.role,
        text: m.text,
        source: m.source || null,
        matched: m.matched,
        candidates: Array.isArray(m.candidates) ? m.candidates.slice(0, 5) : [],
        llm: !!m.llm,
        handled_by_llm: !!m.handled_by_llm,
        handled_by_runtime: !!m.handled_by_runtime,
        context_used: !!m.context_used,
        mode: m.mode || null,
      }));
    localStorage.setItem(chatLogStorageKey(), JSON.stringify(compact));
  } catch { /* storage best effort */ }
}

function restoreChatLog() {
  if (!state.chatThread || state.chatLog.length) return;
  try {
    const rows = JSON.parse(localStorage.getItem(chatLogStorageKey()) || "[]");
    state.chatLog = Array.isArray(rows) ? rows.filter((m) => m && (m.role === "user" || m.role === "ai") && typeof m.text === "string").slice(-40) : [];
  } catch { state.chatLog = []; }
}

function startFreshChatThread() {
  const oldKey = state.chatThread ? chatLogStorageKey(state.chatThread) : null;
  state.chatThread = newChatThreadId();
  state.chatLog = [];
  localStorage.setItem(chatThreadStorageKey(), state.chatThread);
  if (oldKey) localStorage.removeItem(oldKey);
  saveChatLog();
  return state.chatThread;
}

// P2b 권한: 정의 없거나 익명이면 기본 허용(visible·access). 정의 있으면 그 값.
function permOf(resource) {
  if (!state.account) return { visible: true, access: true };
  const p = state.perms.find((x) => x.resource === resource);
  return p ? { visible: !!p.visible, access: !!p.access } : { visible: true, access: true };
}

async function loadMe() {
  const me = await api("/api/me");
  state.account = me.anonymous ? null : (me.account ?? null);
  state.perms = me.perms ?? [];
  state.accountCount = me.account_count ?? (me.anonymous ? me.account_count : state.accountCount) ?? 0;
  state.allowSelfRegister = !!me.allow_self_register;
}
// 로그인 시 서버 레이아웃을 localStorage 로 동기화(이후 dashLayout()이 그대로 사용 → sync 코드 무변경)
async function pullServerLayout() {
  if (!state.account) return;
  try {
    const { layout } = await api("/api/dashboard/layout");
    if (Array.isArray(layout) && layout.length) localStorage.setItem("dev_erp_widgets", JSON.stringify(layout));
  } catch { /* 무시: localStorage 폴백 */ }
}

// 보기 대상(팀/사용자별) 스코프 — 로그인 시 1회 로드. 관리자=팀+사용자별, 팀원=본인만(선택기 숨김).
async function ensureScopes() {
  if (!state.account) { state._scopes = null; return; }
  if (state._scopes) return;
  try {
    const r = await api("/api/accounts/scopes");
    state._scopes = r.scopes || [];
    // 복원된 viewScope 가 무효(삭제된 계정·권한없는 team)면 기본값으로 폴백.
    const scopeValid = state.viewScope === "team" ? !!r.is_admin : state._scopes.some((s) => s.id === state.viewScope);
    if (!scopeValid) state.viewScope = r.is_admin ? "team" : (r.self ?? null);
  } catch { state._scopes = []; }
}
// 선택기 노출 조건: 로그인 + 고를 대상 2개 이상(=관리자). 팀원 1인은 굳이 안 띄움.
function showViewScope() { return !!(state.account && state._scopes && state._scopes.length > 1); }
function viewSelectHtml(L) {
  if (!showViewScope()) return "";
  const opts = state._scopes.map((s) => `<option value="${esc(s.id)}" ${state.viewScope === s.id ? "selected" : ""}>${esc(s.label)}</option>`).join("");
  return `<select id="fView" class="view-scope" title="${esc(L.view_scope ?? "보기 대상")}">${opts}</select>`;
}
function wireViewSelect() { $("#fView")?.addEventListener("change", (e) => { state.viewScope = e.target.value; resetItemPaging(); resetMailPaging(); render(); }); }
// 이름 클릭 로스터: 같은 메일함/할일 화면에서 인원 이름을 눌러 그 사람 것만 보기(드롭다운 대체, 같은 state.viewScope 사용).
function viewRosterHtml(L) {
  if (!showViewScope()) return "";
  const chips = state._scopes.map((s) =>
    `<button type="button" class="fav-chip view-name-chip${state.viewScope === s.id ? " on" : ""}" data-scope="${esc(s.id)}" title="${esc(s.email || s.label)}">${esc(s.label)}</button>`
  ).join("");
  return `<span class="view-roster" title="${esc(L.view_scope ?? "보기 대상")}">${chips}</span>`;
}
function wireViewRoster() {
  document.querySelectorAll(".view-name-chip").forEach((b) => b.addEventListener("click", () => {
    if (state.viewScope === b.dataset.scope) return;
    state.viewScope = b.dataset.scope; resetItemPaging(); resetMailPaging(); render();
  }));
}
// 현재 보기 스코프를 쿼리에 적용(team/미지정=전체). items·mail 공용.
function applyViewScope(params) {
  if (showViewScope() && state.viewScope && state.viewScope !== "team") params.set("view", state.viewScope);
  return params;
}
function asPage(data, fallbackLimit = 100, fallbackOffset = 0) {
  if (Array.isArray(data)) return { rows: data, total: data.length, limit: fallbackLimit, offset: fallbackOffset, has_more: false };
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  return {
    rows,
    total: Number.isFinite(Number(data?.total)) ? Number(data.total) : rows.length,
    limit: Number.isFinite(Number(data?.limit)) ? Number(data.limit) : fallbackLimit,
    offset: Number.isFinite(Number(data?.offset)) ? Number(data.offset) : fallbackOffset,
    has_more: !!data?.has_more
  };
}
function resetItemPaging() { state.itemOffset = 0; state.itemEdit = null; }
function resetMailPaging() { state.mailOffset = 0; state.mailSel = null; state.mailChecked = new Set(); } // 필터/스코프 변경 시 선택도 초기화(유령 '해제' 버튼 제거)

// 상단 인증 UI. 계정 0(익명 파일럿)=숨김 / 로그인=사용자+로그아웃 / 계정 있고 미로그인=로그인 버튼.
function renderAuth() {
  const box = $("#authBox"); if (!box) return;
  const L = state.lex;
  if (state.account) {
    // 실제 가입 이름(display_name) 우선 표기, 없으면 아이디. 관리자면 관리 버튼.
    const name = esc(state.account.display_name || state.account.username);
    // 관리자 버튼에 팀 준비상태 점(빨강=막힘, 노랑=준비됐으나 메일 수집 전, 초록=준비+수집됨) — 안 열어도 한눈에.
    const trd = state._teamReady;
    const dot = state.account.is_admin && trd ? `<i class="ready-dot ${trd.ready ? (trd.fetch_observed ? "ok" : "warn") : "danger"}" title="${L.team_ready_title ?? "팀 사용 준비"}"></i>` : "";
    const adminBtn = state.account.is_admin ? `<button id="adminBtn" class="fav-chip">${dot}${L.admin_panel}</button>` : "";
    box.innerHTML = `<span class="auth-user" title="${esc(state.account.email || "")}">${name}</span>${adminBtn}<button id="myMemBtn" class="fav-chip" title="${L.my_memory_hint ?? "내 업무 메모리 — 할일 시작 시 AI에 주입됩니다"}">${L.my_memory ?? "내 메모리"}</button><button id="pwBtn" class="fav-chip">${L.password_change}</button><button id="logoutBtn" class="fav-chip">${L.logout}</button>`;
    if (state.account.is_admin) {
      $("#adminBtn").addEventListener("click", openAdminPanel);
      // 관리자면 준비상태 1회 조회해 점 갱신(읽기 전용, 백엔드 변경 없음).
      if (state._teamReady === undefined) {
        state._teamReady = null;
        api("/api/accounts/readiness").then((r) => { state._teamReady = r; renderAuth(); }).catch(() => {});
      }
    }
    $("#myMemBtn")?.addEventListener("click", openMyMemory);
    $("#pwBtn").addEventListener("click", openPasswordChange);
    $("#logoutBtn").addEventListener("click", async () => {
      await request("/api/auth/logout", { method: "POST", acceptHttpError: true }).catch(() => {});
      location.reload();
    });
  } else if (state.accountCount > 0) {
    box.innerHTML = `<button id="loginBtn" class="fav-chip">${L.login}</button>`;
    $("#loginBtn").addEventListener("click", openLogin);
  } else {
    // 계정 0 = 미초기화. 팀 사용 시작을 위한 '첫 관리자 만들기'(bootstrap) 노출.
    box.innerHTML = `<button id="bootstrapBtn" class="fav-chip">${L.acct_create_admin}</button>`;
    $("#bootstrapBtn").addEventListener("click", openBootstrap);
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
    const r = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
      acceptHttpError: true,
      retryableUnauthorized: true
    }).catch(() => null);
    if (r && r.ok) { close(); location.reload(); }
    else ov.querySelector(".login-err").textContent = L.login_fail;
  };
  ov.querySelector(".ui-confirm-ok").addEventListener("click", submit);
  ov.querySelector("#loginPw").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  ov.querySelector("#loginUser").focus();
}

async function openMyMemory() {
  const L = state.lex;
  document.querySelector(".ui-confirm-overlay")?.remove();
  let cur = "", items = [];
  try { const r = await api("/api/me/memory"); cur = (r && r.content) || ""; items = (r && r.items) || []; } catch { /* 빈 메모리로 시작 */ }
  const typeLabel = (t) => ({ preference: L.mem_t_pref ?? "선호", fact: L.mem_t_fact ?? "사실", open_thread: L.mem_t_open ?? "진행중", decision: L.mem_t_dec ?? "결정" }[t] || t);
  const renderItems = () => items.length
    ? items.map((it) => `<div class="mem-item" data-id="${it.id}"><span class="mem-item-type">${esc(typeLabel(it.type))}</span><span class="mem-item-text">${esc(it.text)}</span><button class="mem-item-del" data-del="${it.id}" title="${L.mem_item_del ?? "이 항목 보관(주입 제외)"}">×</button></div>`).join("")
    : `<div class="dim mini">${L.mem_item_empty ?? "아직 누적된 항목이 없습니다. 일을 완료하면 지식이 항목으로 쌓입니다."}</div>`;
  const ov = document.createElement("div");
  ov.className = "ui-confirm-overlay";
  ov.innerHTML = `<div class="ui-confirm" role="dialog" aria-label="${L.my_memory ?? "내 메모리"}" style="max-width:560px;text-align:left">
    <p class="ui-confirm-msg">${L.my_memory ?? "내 메모리"}</p>
    <div class="dim mini" style="margin-bottom:6px">${L.my_memory_desc ?? "내 업무 스타일·규칙·자주 쓰는 맥락 — 할일을 시작(Codex 대화)할 때 그 담당자 메모리로 자동 주입됩니다. 평가 아님."}</div>
    <textarea id="memText" class="login-input" style="width:100%;min-height:140px;resize:vertical" placeholder="${L.my_memory_ph ?? "예: 메일 회신은 존댓말·간결하게. 보고서는 결론부터. 자주 쓰는 약어…"}">${esc(cur)}</textarea>
    <div class="login-err danger-text"></div>
    <div class="ui-confirm-btns" style="margin-bottom:10px"><button class="ui-confirm-cancel">${L.btn_cancel}</button><button class="ui-confirm-ok">${L.act_save ?? "저장"}</button></div>
    <div class="mem-items-head dim mini">${L.mem_items_title ?? "누적 메모리 항목"} <span class="mem-items-n">${items.length}</span> — <span class="dim">${L.mem_items_hint ?? "완료 지식이 자동으로 쌓이고, 시작 시 관련 항목이 주입됩니다"}</span></div>
    <div id="memItems" class="mem-items">${renderItems()}</div>
    <div class="mem-item-add"><input id="memNewText" class="login-input" style="flex:1" placeholder="${L.mem_item_add_ph ?? "새 항목(규칙·맥락) 직접 추가…"}" /><button id="memAddBtn" class="fav-chip mini">${L.mem_item_add ?? "+ 항목"}</button></div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector(".ui-confirm-cancel").addEventListener("click", close);
  ov.querySelector(".ui-confirm-ok").addEventListener("click", async () => {
    const content = ov.querySelector("#memText").value;
    const r = await post("/api/me/memory", { content }).then((x) => x.json()).catch(() => null);
    if (r && r.ok) { toast(L.my_memory_saved ?? "메모리 저장됨", "ok"); close(); }
    else { ov.querySelector(".login-err").textContent = (r && r.error) || "오류"; }
  });
  const refreshItems = () => { ov.querySelector("#memItems").innerHTML = renderItems(); ov.querySelector(".mem-items-n").textContent = items.length; wireItems(); };
  const wireItems = () => ov.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    const id = Number(b.dataset.del);
    const r = await post("/api/me/memory/item", { op: "delete", id }).then((x) => x.json()).catch(() => null);
    if (r && r.ok) { items = items.filter((it) => it.id !== id); refreshItems(); toast(L.mem_item_deleted ?? "항목 보관됨", "ok"); }
    else toast((r && r.error) || "오류", "error");
  }));
  wireItems();
  ov.querySelector("#memAddBtn").addEventListener("click", async () => {
    const inp = ov.querySelector("#memNewText"); const text = inp.value.trim();
    if (!text) return;
    const r = await post("/api/me/memory/item", { op: "add", type: "fact", text }).then((x) => x.json()).catch(() => null);
    if (r && r.ok) { const g = await api("/api/me/memory").catch(() => null); items = (g && g.items) || items; inp.value = ""; refreshItems(); toast(L.mem_item_added ?? "항목 추가됨", "ok"); }
    else toast((r && r.error) || "오류", "error");
  });
}
function openPasswordChange() {
  const L = state.lex;
  document.querySelector(".ui-confirm-overlay")?.remove();
  const ov = document.createElement("div");
  ov.className = "ui-confirm-overlay";
  ov.innerHTML = `<div class="ui-confirm" role="dialog" aria-label="${L.password_change}">
    <p class="ui-confirm-msg">${L.password_change}</p>
    <input id="pwCurrent" class="login-input" type="password" placeholder="${L.password_current}" autocomplete="current-password" />
    <input id="pwNew" class="login-input" type="password" placeholder="${L.password_new}" autocomplete="new-password" />
    <input id="pwConfirm" class="login-input" type="password" placeholder="${L.password_confirm}" autocomplete="new-password" />
    <div class="login-err danger-text"></div>
    <div class="ui-confirm-btns"><button class="ui-confirm-cancel">${L.btn_cancel}</button><button class="ui-confirm-ok">${L.btn_confirm}</button></div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector(".ui-confirm-cancel").addEventListener("click", close);
  const submit = async () => {
    const err = ov.querySelector(".login-err");
    err.textContent = "";
    const current = ov.querySelector("#pwCurrent").value;
    const next = ov.querySelector("#pwNew").value;
    const confirm = ov.querySelector("#pwConfirm").value;
    if (next !== confirm) { err.textContent = L.password_mismatch; return; }
    const r = await post("/api/auth/password", { current_password: current, new_password: next }).then((x) => x.json()).catch(() => null);
    if (r && r.ok) { err.textContent = L.password_changed; setTimeout(close, 500); }
    else err.textContent = r?.error === "current_password_invalid" ? L.password_wrong
      : r?.error === "password_too_short" ? L.password_too_short
      : L.login_fail;
  };
  ov.querySelector(".ui-confirm-ok").addEventListener("click", submit);
  ov.querySelector("#pwConfirm").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  ov.querySelector("#pwCurrent").focus();
}

// 첫 관리자 만들기(bootstrap, 계정 0개일 때 1회). 아이디/비밀번호는 사용자가 직접 입력.
function openBootstrap() {
  const L = state.lex;
  document.querySelector(".ui-confirm-overlay")?.remove();
  const ov = document.createElement("div");
  ov.className = "ui-confirm-overlay";
  ov.innerHTML = `<div class="ui-confirm" role="dialog" aria-label="${L.acct_create_admin}">
    <p class="ui-confirm-msg">${L.acct_create_admin}</p>
    <input id="bsName" class="login-input" placeholder="${L.acct_name}" autocomplete="name" />
    <input id="bsUser" class="login-input" placeholder="${L.acct_user}" autocomplete="username" />
    <input id="bsEmail" class="login-input" placeholder="${L.acct_email}" autocomplete="email" />
    <input id="bsPw" class="login-input" type="password" placeholder="${L.acct_pw}" autocomplete="new-password" />
    <div class="login-err danger-text"></div>
    <div class="ui-confirm-btns"><button class="ui-confirm-cancel">${L.btn_cancel}</button><button class="ui-confirm-ok">${L.btn_confirm}</button></div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector(".ui-confirm-cancel").addEventListener("click", close);
  const submit = async () => {
    const body = {
      display_name: ov.querySelector("#bsName").value.trim(),
      username: ov.querySelector("#bsUser").value.trim(),
      email: ov.querySelector("#bsEmail").value.trim(),
      password: ov.querySelector("#bsPw").value
    };
    const r = await request("/api/auth/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      acceptHttpError: true,
      retryableUnauthorized: true
    }).catch(() => null);
    if (r && r.ok) { close(); location.reload(); }
    else ov.querySelector(".login-err").textContent = L.login_fail;
  };
  ov.querySelector(".ui-confirm-ok").addEventListener("click", submit);
  ov.querySelector("#bsName").focus();
}

// 🌙 인증 벽 + 첫 페이지(달빛 길드 입성). 미인증이면 앱 대신 이 풀스크린 게이트만.
// 첫 실행(계정 0)=길드마스터 창설 / 이후=입성(로그인)·가입(회원가입) 탭. 성공 시 reload → 앱 진입.
function renderGate() {
  const L = state.lex;
  document.querySelector(".ui-confirm-overlay")?.remove();
  const app = document.getElementById("app"); if (app) app.style.display = "none";
  document.getElementById("gate")?.remove();
  const gate = document.createElement("div");
  gate.id = "gate";
  const fant = state.mode === "fantasy";       // 모드별 첫 화면: 판타지=달빛 / 실무=깔끔한 전문가용
  gate.dataset.skin = fant ? "fantasy" : "business";
  const firstRun = (state.accountCount ?? 0) === 0;
  const canRegister = !firstRun && !!state.allowSelfRegister;
  let tab = firstRun ? "master" : "login"; // master | login | register
  const crest = fant
    ? `<svg viewBox="0 0 64 64" width="46" height="46" aria-hidden="true">
        <defs><radialGradient id="gMoon" cx="50%" cy="42%" r="60%"><stop offset="0" stop-color="#fbf0c8"/><stop offset="1" stop-color="#d9b25a"/></radialGradient></defs>
        <circle cx="32" cy="32" r="29" fill="none" stroke="#e0c06a" stroke-width="1.4" opacity="0.55"/>
        <path d="M40 16a18 18 0 1 0 0 32 14 14 0 0 1 0-32z" fill="url(#gMoon)"/>
        <g fill="#e9d79a"><circle cx="20" cy="20" r="1.5"/><circle cx="46" cy="44" r="1.2"/><circle cx="24" cy="46" r="1"/></g>
      </svg>`
    : `<svg viewBox="0 0 64 64" width="42" height="42" aria-hidden="true">
        <path d="M32 5 L54 17 V40 Q54 52 32 59 Q10 52 10 40 V17 Z" fill="none" stroke="#19358c" stroke-width="2.4"/>
        <path d="M22 33 l7 7 14-15" fill="none" stroke="#19358c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
  const decor = fant
    ? `<div class="gate-sky"></div><span class="gate-moon"></span><div class="gate-fog gate-fog-a"></div><div class="gate-fog gate-fog-b"></div><div class="gate-ridge"></div>`
    : `<div class="gate-biz-bg"></div><div class="gate-biz-glow"></div>`;
  const inp = (id, ph, type, ac) => `<input id="${id}" class="gate-input" type="${type}" placeholder="${esc(ph)}" autocomplete="${ac}" />`;
  function formHtml() {
    if (tab === "login") {
      return `${inp("gUser", L.login_user, "text", "username")}${inp("gPw", L.login_pw, "password", "current-password")}
        <div class="gate-err danger-text"></div>
        <button class="gate-btn" id="gateSubmit">${L.gate_login_btn}</button>
        ${canRegister ? `<button class="gate-switch" data-go="register">${L.gate_to_register}</button>` : ""}`;
    }
    const isMaster = tab === "master";
    return `${isMaster ? `<div class="gate-formhead"><div class="gate-fh-title">${L.gate_master_title}</div><div class="gate-fh-sub">${L.gate_master_sub}</div></div>` : ""}
      ${inp("gName", L.acct_name, "text", "name")}${inp("gUser", L.acct_user, "text", "username")}${inp("gEmail", L.acct_email, "email", "email")}${inp("gPw", L.acct_pw, "password", "new-password")}
      <div class="gate-err danger-text"></div>
      <button class="gate-btn" id="gateSubmit">${isMaster ? L.gate_master_btn : L.gate_register_btn}</button>
      ${isMaster ? "" : `<button class="gate-switch" data-go="login">${L.gate_to_login}</button>`}`;
  }
  function paint() {
    const browserVersion = browserVersionText();
    const ua = navigator.userAgent || browserVersion;
    const erpVersion = versionPart("erp");
    const chatbotVersion = versionPart("chatbot");
    const bridgeVersion = codexBridgePart();
    gate.innerHTML = `
      ${decor}
      <button class="gate-mode" id="gateMode">${fant ? L.gate_mode_to_biz : L.gate_mode_to_fant}</button>
      <div class="gate-card">
        <div class="gate-crest">${crest}</div>
        <div class="gate-brand">${L.gate_title}</div>
        <div class="gate-tagline">${L.gate_sub}</div>
        <div class="gate-version-row">
          <span class="gate-version-chip" title="${esc(`${L.app_version_label} ${erpVersion.build} · ${erpVersion.source}`)}">${esc(L.app_version_label)} ${esc(erpVersion.release)}</span>
          <span class="gate-version-chip" title="${esc(ua)}">${esc(L.browser_version_label)} ${esc(browserVersion)}</span>
          <span class="gate-version-chip" title="${esc(`${L.chat_version_label} ${chatbotVersion.build} · ${chatbotVersion.source}`)}">${esc(L.chat_version_label)} ${esc(chatbotVersion.release)}</span>
          <span class="gate-version-chip" title="${esc(`${bridgeVersion.mode} · ${bridgeVersion.source}`)}">브리지 ${esc(bridgeVersion.release)}</span>
        </div>
        ${canRegister ? `<div class="gate-tabs">
          <button class="gate-tab ${tab === "login" ? "on" : ""}" data-tab="login">${L.gate_tab_login}</button>
          <button class="gate-tab ${tab === "register" ? "on" : ""}" data-tab="register">${L.gate_tab_register}</button>
        </div>` : ""}
        <div class="gate-form">${formHtml()}</div>
      </div>`;
    gate.querySelector("#gateMode")?.addEventListener("click", async () => {
      state.mode = fant ? "business" : "fantasy"; // 첫 화면에서 실무 ⇄ 판타지 전환
      localStorage.setItem("dev_erp_mode", state.mode);
      await loadLexicon(); // 라벨 갱신(/api/lexicon 은 미인증 예외)
      renderGate();
    });
    gate.querySelectorAll(".gate-tab").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; paint(); }));
    gate.querySelectorAll(".gate-switch").forEach((s) => s.addEventListener("click", () => { tab = s.dataset.go; paint(); }));
    gate.querySelector("#gateSubmit")?.addEventListener("click", submit);
    gate.querySelector("#gPw")?.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    gate.querySelector(".gate-form input")?.focus();
  }
  async function submit() {
    const err = gate.querySelector(".gate-err"); err.textContent = "";
    if (tab === "register" && !canRegister) { err.textContent = L.register_fail; return; }
    const v = (id) => gate.querySelector("#" + id)?.value.trim() ?? "";
    const pw = gate.querySelector("#gPw")?.value ?? "";
    const J = (b) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    try {
      let r;
      if (tab === "login") {
        r = await request("/api/auth/login", { ...J({ username: v("gUser"), password: pw }), acceptHttpError: true, retryableUnauthorized: true });
        if (!r.ok) { err.textContent = L.login_fail; return; }
      } else {
        const ep = tab === "master" ? "/api/auth/bootstrap" : "/api/auth/register";
        r = await request(ep, { ...J({ display_name: v("gName"), username: v("gUser"), email: v("gEmail"), password: pw }), acceptHttpError: true, retryableUnauthorized: true });
        if (!r.ok) { err.textContent = tab === "master" ? L.login_fail : L.register_fail; return; }
      }
      location.reload();
    } catch { err.textContent = L.login_fail; }
  }
  document.body.appendChild(gate);
  paint();
}

// 메일 제외 규칙 섹션(관리자 패널 내) — 발신자·제목·수신함 패턴으로 개인메일·차단발신자를 ERP 인입 차단(+기존 숨김).
async function wireMailRules(ov) {
  const L = state.lex;
  const box = ov.querySelector("#mailRuleBox");
  if (!box) return;
  const fieldLab = { from: L.mrule_from ?? "발신자", subject: L.mrule_subject ?? "제목", mailbox: L.mrule_mailbox ?? "수신함" };
  const matchLab = { contains: L.mrule_contains ?? "포함", equals: L.mrule_equals ?? "완전일치" };
  const draw = async () => {
    let rules = [];
    try { rules = await api("/api/mail/exclude-rules"); } catch {}
    const rows = (Array.isArray(rules) && rules.length)
      ? rules.map((r) => `<div class="mrule-row" data-rid="${r.id}">
          <span class="badge mini">${esc(fieldLab[r.field] ?? r.field)}</span>
          <span class="dim mini">${esc(matchLab[r.match] ?? r.match)}</span>
          <span class="mrule-pat">${esc(r.pattern)}</span>
          <button class="fav-chip mini danger mrule-del">${L.mrule_del ?? "삭제"}</button></div>`).join("")
      : `<div class="empty small">${L.mrule_empty ?? "규칙 없음 — 추가하면 해당 메일은 수집돼도 ERP에 안 들어옵니다"}</div>`;
    box.innerHTML = `<p class="ui-confirm-msg" style="margin-top:12px">${L.mrule_title ?? "메일 제외 규칙"} <span class="dim" style="font-weight:400">· ${L.mrule_hint ?? "급여명세서 등 개인메일·차단 발신자를 팀 ERP에 안 받기"}</span></p>
      <div class="admin-create" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
        <select id="mrField" class="login-input" style="width:92px">${Object.entries(fieldLab).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
        <select id="mrMatch" class="login-input" style="width:96px">${Object.entries(matchLab).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
        <input id="mrPattern" class="login-input" style="width:210px" placeholder="${L.mrule_ph ?? "예: 급여명세서 / hr@회사.com"}" />
        <button id="mrAdd" class="fav-chip active">${L.mrule_add ?? "규칙 추가"}</button>
      </div>
      <div class="mrule-list">${rows}</div>`;
    box.querySelector("#mrAdd")?.addEventListener("click", async () => {
      const field = box.querySelector("#mrField").value, match = box.querySelector("#mrMatch").value, pattern = box.querySelector("#mrPattern").value.trim();
      if (!pattern) { toast(L.mrule_need_pattern ?? "차단할 값을 입력하세요", "error"); return; }
      const resp = await post("/api/mail/exclude-rules", { field, pattern, match });
      const d = await resp.json().catch(() => ({}));
      if (resp.ok) { toast(`${L.mrule_added ?? "규칙 추가됨"}${d.hidden ? ` · ${d.hidden}${L.mrule_hidden_unit ?? "건 숨김"}` : ""}`, "ok"); draw(); }
      else toast((L.mrule_fail ?? "추가 실패") + (d.error ? ` (${d.error})` : ""), "error");
    });
    box.querySelectorAll(".mrule-del").forEach((b) => b.addEventListener("click", async () => {
      const rid = b.closest(".mrule-row").dataset.rid;
      const resp = await post("/api/mail/exclude-rules/delete", { id: Number(rid) });
      if (resp.ok) { toast(L.mrule_deleted ?? "규칙 삭제됨", "ok"); draw(); } else toast(L.mrule_fail ?? "실패", "error");
    }));
  };
  await draw();
}

// 메일→과제 라우팅 규칙 섹션(관리자 패널 내, 2026-07-05 owner — Outlook 규칙식).
// 위: 사용자 규칙 CRUD + '기존 받은함에 지금 적용'. 아래: 엔진 바인딩 규칙(정본 YAML) 읽기 전용 표
// — "이미 만들어진 규칙이 보여야 거기에 맞게 추가·수정"(owner). 사용자 규칙이 엔진 규칙보다 우선.
async function wireMailRouteRules(ov) {
  const L = state.lex;
  const box = ov.querySelector("#mailRouteBox");
  if (!box) return;
  const fieldLab = { from: L.mrule_from ?? "발신자", subject: L.mrule_subject ?? "제목" };
  const matchLab = { contains: L.mrule_contains ?? "포함", equals: L.mrule_equals ?? "완전일치" };
  const confLab = { exact: L.rrule_conf_exact ?? "확정", hint: L.rrule_conf_hint ?? "힌트(검토대기)", ambiguous: L.rrule_conf_amb ?? "애매(문의)" };
  const draw = async () => {
    let data = { user_rules: [], engine: { rules: [] } };
    try { data = await api("/api/mail/route-rules"); } catch { /* 로그인/권한 */ }
    let projects = state._projCache;
    if (!projects) { try { projects = (await api("/api/summary")).projects; state._projCache = projects; } catch { projects = []; } }
    const projOpts = (projects ?? []).filter((p) => p.class !== "inbox" && p.class !== "archive")
      .map((p) => `<option value="${esc(p.id)}">${esc(p.id)} ${esc((p.title ?? "").slice(0, 14))}</option>`).join("");
    const userRows = (data.user_rules ?? []).length
      ? data.user_rules.map((r) => `<div class="mrule-row" data-rid="${r.id}">
          <span class="badge mini">${esc(fieldLab[r.field] ?? r.field)}</span>
          <span class="dim mini">${esc(matchLab[r.match] ?? r.match)}</span>
          <span class="mrule-pat">${esc(r.pattern)}</span>
          <span class="dim mini">→</span><strong class="mini">${esc(r.project_id)}</strong>
          <button class="fav-chip mini rrule-apply" title="${L.rrule_apply_tip ?? "받은함의 기존 메일에도 이 규칙 적용"}">${L.rrule_apply ?? "기존 적용"}</button>
          <button class="fav-chip mini danger rrule-del">${L.mrule_del ?? "삭제"}</button></div>`).join("")
      : `<div class="empty small">${L.rrule_empty ?? "사용자 규칙 없음 — 추가하면 새로 오는 메일이 그 과제로 바로 들어갑니다"}</div>`;
    // 엔진 규칙 요약(읽기): 조건 리스트는 앞 3개 + N (전체는 title 툴팁)
    const engineRows = (data.engine?.rules ?? []).map((r) => {
      const conds = Object.entries(r.match ?? {}).filter(([, v]) => Array.isArray(v) && v.length);
      const summary = conds.map(([k, v]) => {
        const kind = k === "sender_addresses" ? (L.mrule_from ?? "발신자") : /body|html/.test(k) ? (L.rrule_body ?? "본문") : (L.mrule_subject ?? "제목");
        const head = v.slice(0, 3).join(", ");
        return `<span title="${esc(v.join(", "))}">${kind}: ${esc(head)}${v.length > 3 ? ` +${v.length - 3}` : ""}</span>`;
      }).join(" · ");
      return `<tr><td class="dim mini">${esc(r.rule_id)}</td><td><strong>${esc(r.project_code)}</strong></td>
        <td><span class="badge mini">${esc(confLab[r.confidence] ?? r.confidence)}</span></td><td class="mini">${summary || "-"}</td></tr>`;
    }).join("");
    box.innerHTML = `<p class="ui-confirm-msg" style="margin-top:14px">${L.rrule_title ?? "메일 → 과제 라우팅 규칙"} <span class="dim" style="font-weight:400">· ${L.rrule_hint ?? "Outlook 규칙처럼 — 조건에 맞는 메일을 과제로 자동 분류"}</span></p>
      <div class="admin-create" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
        <select id="rrField" class="login-input" style="width:92px">${Object.entries(fieldLab).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
        <select id="rrMatch" class="login-input" style="width:96px">${Object.entries(matchLab).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
        <input id="rrPattern" class="login-input" style="width:180px" placeholder="${L.rrule_ph ?? "예: KVDS / lig.co.kr"}" />
        <span class="dim">→</span>
        <select id="rrProject" class="login-input" style="width:200px">${projOpts}</select>
        <button id="rrAdd" class="fav-chip active">${L.mrule_add ?? "규칙 추가"}</button>
        <button id="rrApplyAll" class="fav-chip mini">${L.rrule_apply_all ?? "모든 규칙 기존 메일에 적용"}</button>
      </div>
      <div class="mrule-list">${userRows}</div>
      <details style="margin-top:10px"><summary class="dim" style="cursor:pointer">${L.rrule_engine ?? "엔진 규칙(자동 분류 정본)"} ${data.engine?.rules?.length ?? 0}${L.rrule_engine_unit ?? "개 — 읽기 전용, 수정은 엔진 레인"}</summary>
        <table style="margin-top:6px"><thead><tr><th>${L.rrule_col_id ?? "규칙"}</th><th>${L.know_col_project ?? "과제"}</th><th>${L.rrule_col_conf ?? "신뢰도"}</th><th>${L.rrule_col_cond ?? "조건(요약)"}</th></tr></thead><tbody>${engineRows}</tbody></table>
        <div class="dim small" style="margin-top:4px">${L.rrule_engine_note ?? "정본: _workmeta/system/bindings/mail_project_router.yaml · 사용자 규칙이 이 표보다 우선 적용됩니다"}</div>
      </details>`;
    const applyRun = async (ruleId, label) => {
      const resp = await post("/api/mail/route-rules/apply", ruleId != null ? { rule_id: ruleId } : {});
      const d = await resp.json().catch(() => ({}));
      if (resp.ok) toast(`${label}: ${L.rrule_moved ?? "메일"} ${d.moved ?? 0}${L.rrule_moved_unit ?? "건 이동"}${d.items_moved ? ` · ${L.rrule_items_moved ?? "할일 동행"} ${d.items_moved}` : ""}`, "ok");
      else toast((L.mrule_fail ?? "실패") + (d.error ? ` (${d.error})` : ""), "error");
    };
    // 인라인 확인 바 — uiConfirm(전역 오버레이)은 관리자 패널 자체를 제거하므로 패널 내부에서는 못 쓴다.
    const confirmBar = (msg, onYes) => {
      box.querySelector(".rr-confirm")?.remove();
      const bar = document.createElement("div");
      bar.className = "rr-confirm admin-create";
      bar.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:6px 0";
      bar.innerHTML = `<span style="font-size:.92em">${msg}</span>
        <button class="fav-chip active rr-yes">${L.btn_confirm ?? "확인"}</button>
        <button class="fav-chip rr-no">${L.btn_cancel ?? "취소"}</button>`;
      box.querySelector(".mrule-list")?.before(bar);
      bar.querySelector(".rr-yes").addEventListener("click", async () => { bar.remove(); await onYes(); draw(); });
      bar.querySelector(".rr-no").addEventListener("click", () => bar.remove());
    };
    box.querySelector("#rrAdd")?.addEventListener("click", async () => {
      const field = box.querySelector("#rrField").value, match = box.querySelector("#rrMatch").value;
      const pattern = box.querySelector("#rrPattern").value.trim(), project_id = box.querySelector("#rrProject").value;
      if (!pattern) { toast(L.mrule_need_pattern ?? "조건 값을 입력하세요", "error"); return; }
      if (!project_id) { toast(L.rrule_need_project ?? "대상 과제를 선택하세요", "error"); return; }
      const resp = await post("/api/mail/route-rules", { field, pattern, match, project_id });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok) { toast((L.mrule_fail ?? "추가 실패") + (d.error ? ` (${d.error})` : ""), "error"); return; }
      toast(L.mrule_added ?? "규칙 추가됨", "ok");
      await draw(); // 새 규칙이 목록에 먼저 보이고
      // Outlook 식: "지금 받은함의 기존 메일에도 적용할까요?" — 인라인 확인
      confirmBar(L.rrule_apply_confirm ?? "받은함(미분류)의 기존 메일에도 이 규칙을 지금 적용할까요?",
        () => applyRun(d.id, L.rrule_applied ?? "기존 적용"));
    });
    box.querySelectorAll(".rrule-del").forEach((b) => b.addEventListener("click", async () => {
      const rid = b.closest(".mrule-row").dataset.rid;
      const resp = await post("/api/mail/route-rules/delete", { id: Number(rid) });
      if (resp.ok) { toast(L.mrule_deleted ?? "규칙 삭제됨", "ok"); draw(); } else toast(L.mrule_fail ?? "실패", "error");
    }));
    box.querySelectorAll(".rrule-apply").forEach((b) => b.addEventListener("click", () => {
      const rid = Number(b.closest(".mrule-row").dataset.rid);
      confirmBar(L.rrule_apply_confirm ?? "받은함(미분류)의 기존 메일에도 이 규칙을 지금 적용할까요?",
        () => applyRun(rid, L.rrule_applied ?? "기존 적용"));
    }));
    box.querySelector("#rrApplyAll")?.addEventListener("click", () => {
      confirmBar(L.rrule_apply_all_confirm ?? "모든 사용자 규칙을 받은함(미분류) 전체에 지금 적용할까요?",
        () => applyRun(null, L.rrule_applied_all ?? "전체 적용"));
    });
  };
  await draw();
}

// 관리자 패널: 계정 목록 + 추가 + 역할/상태 관리(관리자 전용).
async function openAdminPanel() {
  const L = state.lex;
  document.querySelector(".ui-confirm-overlay")?.remove();
  const ov = document.createElement("div");
  ov.className = "ui-confirm-overlay";
  ov.innerHTML = `<div class="ui-confirm admin-panel" role="dialog" aria-label="${L.admin_panel}" style="max-width:1080px;text-align:left">
    <p class="ui-confirm-msg">${L.admin_panel} · ${L.acct_new}</p>
    <div class="admin-create" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      <input id="acName" class="login-input" style="width:96px" placeholder="${L.acct_name}" />
      <input id="acUser" class="login-input" style="width:96px" placeholder="${L.acct_user}" autocomplete="off" />
      <input id="acEmail" class="login-input" style="width:150px" placeholder="${L.acct_email}" autocomplete="off" />
      <input id="acPw" class="login-input" style="width:110px" type="password" placeholder="${L.acct_pw}" autocomplete="new-password" />
      <select id="acRole" class="login-input" style="width:84px"><option value="member">${L.acct_role_member}</option><option value="admin">${L.acct_role_admin}</option></select>
      <button id="acAdd" class="fav-chip">${L.acct_new}</button>
    </div>
    <div class="admin-err danger-text" style="min-height:1em;margin-bottom:6px"></div>
    <div id="teamReady" class="admin-readiness"></div>
    <div id="acList"></div>
    <div id="mailRouteBox" class="admin-mailrules"></div>
    <div id="mailRuleBox" class="admin-mailrules"></div>
    <div class="ui-confirm-btns"><button class="ui-confirm-cancel">${L.btn_cancel}</button></div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => { ov.remove(); renderAuth(); }; // 닫을 때 관리자 버튼 준비상태 점 갱신
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector(".ui-confirm-cancel").addEventListener("click", close);
  wireMailRouteRules(ov); // 메일→과제 라우팅 규칙 섹션(자기완결 렌더·바인드)
  wireMailRules(ov); // 메일 제외 규칙 섹션(자기완결 렌더·바인드)
  const errBox = ov.querySelector(".admin-err");
  const issueLabel = (issue) => {
    const labels = {
      admin_missing: "관리자 계정 없음",
      member_missing: "활성 팀원 없음",
      target_members_short: "목표 팀원 수 미달",
      unclassified_queue: "분류 대기 할일 있음",
      unclassified_overdue: "기한 지난 분류 대기 있음",
      email_missing: "이메일 없음",
      mailbox_disabled: "메일함 꺼짐",
      mailbox_env_ref_missing: "env ref 없음",
      mailbox_error: "메일함 오류",
      mailbox_stale: "메일함 오래됨",
      mailbox_never_fetched: "수집 이력 없음",
      mailbox_no_mail_rows: "메일 원장 0건",
      account_email_missing: "이메일 없음",
      account_mailbox_disabled: "메일함 꺼짐",
      account_mailbox_env_ref_missing: "env ref 없음",
      account_mailbox_error: "메일함 오류",
      account_mailbox_stale: "메일함 오래됨",
      account_mailbox_never_fetched: "수집 이력 없음",
      account_mailbox_no_mail_rows: "메일 원장 0건",
      create_admin_account: "관리자 계정 만들기",
      add_member_accounts: "팀원 계정 추가",
      fill_member_emails: "팀원 이메일 입력",
      fix_member_mailbox_errors: "메일함 오류 해결",
      configure_member_mailboxes: "팀원 메일함 설정",
      export_and_fetch_team_mailboxes: "메일함 등록부 export 후 수집 실행",
      triage_overdue_unclassified: "기한 지난 분류 대기 처리",
      triage_unclassified: "분류 대기 처리",
      resolve_readiness_blockers: "준비 차단 사유 해결",
      ready_for_team_pilot: "팀 파일럿 사용 가능",
    };
    const base = labels[issue.code] || issue.code;
    const detail = issue.expected ? ` ${issue.actual}/${issue.expected}` : issue.count ? ` ${issue.count}` : "";
    return `${issue.account_label ? `${issue.account_label}: ` : ""}${base}${detail}`;
  };
  const renderReadiness = (ready) => {
    if (!ready) return `<div class="readiness-panel muted">${L["team_ready_unavailable"] ?? "팀 준비상태를 불러오지 못했습니다"}</div>`;
    const counts = ready.counts || {};
    const queues = ready.queues || {};
    const statusText = ready.ready ? (L["team_ready_ready"] ?? "팀 메일 자동화 준비됨") : (L["team_ready_blocked"] ?? "보강 필요");
    const statusClass = ready.ready ? "ok" : "danger";
    const chips = [
      `${L.acct_role_admin}: ${counts.active_admin_count ?? 0}`,
      `${L.acct_role_member}: ${counts.active_member_count ?? 0}/${ready.target_members ?? 5}`,
      `${L["mailbox_provider"] ?? "메일함"}: ${counts.configured_mailbox_count ?? 0}/${counts.active_member_count ?? 0}`,
      `${L["mailbox_status"] ?? "수집"}: ${counts.fetch_seen_count ?? 0}/${counts.active_member_count ?? 0}`,
      `${L["triage_queue"] ?? "분류대기"}: ${queues.unclassified ?? 0}`,
    ];
    const issueHtml = (items, klass) => (items || []).slice(0, 8)
      .map((x) => `<span class="ready-issue ${klass}">${esc(issueLabel(x))}</span>`).join("");
    const rows = (ready.accounts || []).map((a) => {
      const issues = (a.issues || []).map((x) => `<span class="ready-issue ${x.level === "blocker" ? "danger" : "warn"}">${esc(issueLabel(x))}</span>`).join("");
      const at = a.mailbox_last_fetch_at ? String(a.mailbox_last_fetch_at).replace("T", " ").slice(0, 16) : "-";
      return `<tr>
        <td>${esc(a.display_name || a.username)}<div class="mini muted">${esc(a.username)}</div></td>
        <td class="muted">${esc(a.email || "-")}</td>
        <td>${a.mailbox_enabled ? "ON" : "OFF"}<div class="mini muted">${esc(a.mailbox_provider || "none")}</div></td>
        <td class="muted">${esc(at)}</td>
        <td>${Number(a.mail_count || 0)}</td>
        <td>${Number(a.open_item_count || 0)}</td>
        <td>${issues || `<span class="ready-issue ok">${L["team_ready_ok"] ?? "정상"}</span>`}</td>
      </tr>`;
    }).join("");
    // owner 명시 3상태를 신호등처럼: 설정 준비(mail_config_ready) → 메일 수집 관측(fetch_observed) → 팀 사용 준비(ready).
    const stage = (name, on, onTxt, offTxt, offDanger) =>
      `<div class="ready-stage ${on ? "ok" : (offDanger ? "danger" : "warn")}">
        <span class="ready-stage-ico">${on ? "✓" : (offDanger ? "✕" : "⏳")}</span>
        <span class="ready-stage-body"><b>${esc(name)}</b><span>${on ? onTxt : offTxt}</span></span></div>`;
    const checklist = (ready.next_actions || []).map((x) => {
      const kind = x.priority === "blocker" ? "danger" : x.priority === "ok" ? "ok" : "warn";
      return `<li class="ready-check ${kind}"><span class="ready-check-box">${x.priority === "ok" ? "✓" : "▢"}</span>${esc(issueLabel(x))}</li>`;
    }).join("");
    return `<div class="readiness-panel">
      <div class="readiness-head">
        <strong>${L["team_ready_title"] ?? "팀 사용 준비"}</strong>
        <span class="ready-pill ${statusClass}">${esc(statusText)}</span>
      </div>
      <div class="ready-stages">
        ${stage(L.stage_config ?? "① 설정 준비", ready.mail_config_ready, L.stage_config_ok ?? "준비됨", L.stage_config_off ?? "미완", true)}
        ${stage(L.stage_fetch ?? "② 메일 수집", ready.fetch_observed, L.stage_fetch_ok ?? "관측됨", L.stage_fetch_off ?? "수집 전", false)}
        ${stage(L.stage_team ?? "③ 팀 사용", ready.ready, L.stage_team_ok ?? "준비됨", L.stage_team_off ?? "막힘", true)}
      </div>
      <div class="ready-chips">${chips.map((x) => `<span>${esc(x)}</span>`).join("")}</div>
      <div class="ready-issues">${issueHtml(ready.blockers, "danger")}${issueHtml(ready.warnings, "warn")}</div>
      <div class="ready-actions"><strong>${esc(L.next_actions ?? "다음 행동")}</strong></div>
      <ul class="ready-checklist">${checklist}</ul>
      <table class="admin-table readiness-table" style="width:100%;border-collapse:collapse"><thead><tr>
        <th>${L.acct_name}</th><th>${L.acct_email}</th><th>${L["mailbox_provider"] ?? "메일함"}</th>
        <th>${L["mailbox_status"] ?? "수집"}</th><th>${L["mail_count"] ?? "메일"}</th><th>${L["item_count"] ?? "할일"}</th><th>${L.acct_status}</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  };
  const renderList = async () => {
    const [data, readiness] = await Promise.all([
      api("/api/accounts").catch(() => ({ accounts: [] })),
      api("/api/accounts/readiness").catch(() => null),
    ]);
    if (readiness) state._teamReady = readiness; // 관리자 버튼 점도 최신으로
    ov.querySelector("#teamReady").innerHTML = renderReadiness(readiness);
    const providerLabels = { none: L["mailbox_provider_none"] ?? "없음", gmail: "Gmail", hiworks: "Hiworks" };
    const providerOptions = (value) => Object.entries(providerLabels)
      .map(([k, label]) => `<option value="${k}" ${value === k ? "selected" : ""}>${esc(label)}</option>`).join("");
    const rows = (data.accounts || []).map((a) => {
      const role = a.is_admin ? "admin" : "member";
      const roleLbl = a.is_admin ? L.acct_role_admin : L.acct_role_member;
      const statusLbl = a.status === "active" ? L.acct_active : L.acct_disabled;
      const otherRole = a.is_admin ? "member" : "admin";
      const isSelf = state.account && a.id === state.account.id;
      const selfRoleDisabled = isSelf ? "disabled" : "";
      const mailboxEnabled = !!a.mailbox_enabled;
      const mailboxStatus = a.mailbox_status || (mailboxEnabled ? "ready" : "disabled");
      const mailboxAt = a.mailbox_last_fetch_at ? String(a.mailbox_last_fetch_at).replace("T", " ").slice(0, 16) : "-";
      return `<tr>
        <td><input class="login-input ac-name" style="width:110px" value="${esc(a.display_name || "")}" placeholder="${L.acct_name}" /></td>
        <td class="muted">${esc(a.username)}</td>
        <td><input class="login-input ac-email" style="width:155px" value="${esc(a.email || "")}" placeholder="${L.acct_email}" /></td>
        <td><button class="fav-chip ac-role" data-id="${a.id}" data-role="${otherRole}" ${selfRoleDisabled}>${roleLbl}</button>
          <button class="fav-chip ac-status" data-id="${a.id}" data-status="${a.status === "active" ? "disabled" : "active"}" ${isSelf ? "disabled" : ""}>${statusLbl}</button>
          <button class="fav-chip ac-delete" data-id="${a.id}" ${isSelf ? "disabled" : ""} title="${esc(L.acct_delete_confirm ?? "")}">${L.acct_delete ?? "삭제"}</button>
          <button class="fav-chip ac-save" data-id="${esc(a.id)}">${L.acct_save ?? "저장"}</button>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
            <input class="login-input ac-reset-pw" style="width:112px" type="password" placeholder="${L.password_reset}" autocomplete="new-password" />
            <button class="fav-chip ac-reset" data-id="${esc(a.id)}">${L.password_reset}</button>
          </div></td>
        <td><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <select class="login-input mb-provider" style="width:92px" data-user="${esc(a.username)}">${providerOptions(a.mailbox_provider || "none")}</select>
          <label class="dim mini"><input type="checkbox" class="mb-enabled" ${mailboxEnabled ? "checked" : ""} /> ${mailboxEnabled ? (L.acct_active ?? "활성") : (L.acct_disabled ?? "비활성")}</label>
          <input class="login-input mb-env" style="width:170px" value="${esc(a.mailbox_env_ref || "")}" placeholder="${L["mailbox_env_ref"] ?? "env ref"}" autocomplete="off" />
          <button class="fav-chip mb-save" data-id="${esc(a.id)}">${L.acct_save ?? "저장"}</button>
          <button class="fav-chip mb-connect" data-id="${esc(a.id)}" data-user="${esc(a.username)}" data-email="${esc(a.email || "")}" data-provider="${esc(a.mailbox_provider || "none")}">${L.mailbox_connect ?? "메일 연결"}</button>
          ${(a.mailbox_provider && a.mailbox_provider !== "none") || a.mailbox_env_ref ? `<button class="fav-chip mb-disconnect" data-id="${esc(a.id)}" title="${L.mailbox_disconnect_hint ?? "연결 해제 + 비번 파일 삭제(메일·할일 보존)"}">${L.mailbox_disconnect ?? "해제"}</button>` : ""}
        </div></td>
        <td class="muted" title="${esc(a.mailbox_last_error || "")}">${esc(mailboxStatus)}<div class="mini">${esc(mailboxAt)}</div></td>
      </tr>`;
    }).join("");
    ov.querySelector("#acList").innerHTML =
      `<table class="admin-table" style="width:100%;border-collapse:collapse"><thead><tr>
        <th>${L.acct_name}</th><th>${L.acct_user}</th><th>${L.acct_email}</th><th>${L.acct_role}·${L.acct_status}</th>
        <th>${L["mailbox_provider"] ?? "메일함"}</th><th>${L["mailbox_status"] ?? "상태/시각"}</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    ov.querySelectorAll(".ac-role").forEach((b) => b.addEventListener("click", async () => {
      await post("/api/accounts/update", { id: b.dataset.id, role: b.dataset.role }); renderList();
    }));
    ov.querySelectorAll(".ac-status").forEach((b) => b.addEventListener("click", async () => {
      await post("/api/accounts/status", { id: b.dataset.id, status: b.dataset.status }); renderList();
    }));
    ov.querySelectorAll(".ac-delete").forEach((b) => b.addEventListener("click", async () => {
      if (!(await uiConfirm(L.acct_delete_confirm ?? "이 계정을 삭제할까요?"))) return;
      errBox.textContent = "";
      const r = await post("/api/accounts/delete", { id: b.dataset.id }).then((x) => x.json()).catch(() => null);
      if (r && r.ok) { errBox.textContent = L.acct_delete_done ?? "삭제됨"; renderList(); }
      else errBox.textContent = r?.error === "cannot_delete_self" ? (L.cannot_delete_self ?? "본인 삭제 불가")
        : r?.error === "cannot_delete_last_admin" ? (L.cannot_delete_last_admin ?? "마지막 관리자 삭제 불가")
        : (r?.error || L.login_fail);
    }));
    ov.querySelectorAll(".ac-save").forEach((b) => b.addEventListener("click", async () => {
      errBox.textContent = "";
      const tr = b.closest("tr");
      const r = await post("/api/accounts/update", {
        id: b.dataset.id,
        display_name: tr.querySelector(".ac-name").value.trim(),
        email: tr.querySelector(".ac-email").value.trim()
      }).then((x) => x.json()).catch(() => null);
      if (r && r.ok) { errBox.textContent = L.acct_save ?? "저장"; renderList(); }
      else errBox.textContent = (r && /taken|format/.test(r.error || "")) ? L.acct_taken : (r?.error || L.login_fail);
    }));
    ov.querySelectorAll(".ac-reset").forEach((b) => b.addEventListener("click", async () => {
      errBox.textContent = "";
      const tr = b.closest("tr");
      const password = tr.querySelector(".ac-reset-pw").value;
      const r = await post("/api/accounts/password", { id: b.dataset.id, password }).then((x) => x.json()).catch(() => null);
      if (r && r.ok) { tr.querySelector(".ac-reset-pw").value = ""; errBox.textContent = L.password_reset_done; }
      else errBox.textContent = r?.error === "password_too_short" ? L.password_too_short : (r?.error || L.login_fail);
    }));
    ov.querySelectorAll(".mb-save").forEach((b) => b.addEventListener("click", async () => {
      errBox.textContent = "";
      const tr = b.closest("tr");
      const r = await post("/api/accounts/mailbox", {
        id: b.dataset.id,
        provider: tr.querySelector(".mb-provider").value,
        enabled: tr.querySelector(".mb-enabled").checked,
        env_ref: tr.querySelector(".mb-env").value.trim()
      }).then((x) => x.json()).catch(() => null);
      if (r && r.ok) { errBox.textContent = L.acct_save ?? "저장"; renderList(); }
      else {
        const e = r?.error || "";
        errBox.textContent = e === "mailbox_env_ref_required" ? (L["mailbox_env_ref_required"] ?? "활성 메일함은 env ref가 필요합니다")
          : e === "mailbox_env_ref_invalid" ? (L["mailbox_env_ref_invalid"] ?? "env ref는 상대경로만 가능합니다")
          : e === "mailbox_secret_not_allowed" ? (L["mailbox_secret_not_allowed"] ?? "비밀값은 저장할 수 없습니다")
          : e === "mailbox_provider_invalid" ? (L["mailbox_provider_invalid"] ?? "지원하지 않는 메일 provider입니다")
          : (e || L.login_fail);
      }
    }));
    // provider 선택 시 env ref 가 비어 있으면 표준 경로를 제안(손 타이핑 제거). 사용자가 덮어쓸 수 있음.
    ov.querySelectorAll(".mb-provider").forEach((sel) => sel.addEventListener("change", () => {
      const tr = sel.closest("tr");
      const envInput = tr.querySelector(".mb-env");
      const enabledBox = tr.querySelector(".mb-enabled");
      if (sel.value !== "none") {
        if (envInput && !envInput.value.trim()) {
          const user = String(sel.dataset.user || "mailbox").toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").replace(/^[_.\-]+|[_.\-]+$/g, "") || "mailbox";
          envInput.value = `guild_hall/state/gateway/mailbox/state/${user}.env`;
        }
        if (enabledBox && !enabledBox.checked) enabledBox.checked = true; // provider 고르면 보통 켜려는 의도
      }
    }));
    ov.querySelectorAll(".mb-connect").forEach((b) => b.addEventListener("click", () =>
      openMailConnect({ id: b.dataset.id, username: b.dataset.user, email: b.dataset.email, provider: b.dataset.provider }, renderList)));
    ov.querySelectorAll(".mb-disconnect").forEach((b) => b.addEventListener("click", async () => {
      if (!(await uiConfirm(L.mailbox_disconnect_confirm ?? "메일함 연결을 해제할까요? 저장된 비밀번호 파일이 삭제됩니다. (메일·할일은 보존)"))) return;
      errBox.textContent = "";
      const r = await post("/api/accounts/mailbox/disconnect", { id: b.dataset.id }).then((x) => x.json()).catch(() => null);
      if (r && r.ok) { errBox.textContent = L.mailbox_disconnected ?? "메일함 해제됨"; renderList(); }
      else errBox.textContent = (r?.error) || (L.mailbox_disconnect_fail ?? "메일함 해제 실패");
    }));
  };
  ov.querySelector("#acAdd").addEventListener("click", async () => {
    errBox.textContent = "";
    const body = {
      display_name: ov.querySelector("#acName").value.trim(),
      username: ov.querySelector("#acUser").value.trim(),
      email: ov.querySelector("#acEmail").value.trim(),
      password: ov.querySelector("#acPw").value,
      role: ov.querySelector("#acRole").value
    };
    const r = await post("/api/accounts", body).then((x) => x.json()).catch(() => null);
    if (r && r.ok) { ["#acName", "#acUser", "#acEmail", "#acPw"].forEach((s) => (ov.querySelector(s).value = "")); renderList(); }
    else errBox.textContent = (r && /taken|format/.test(r.error || "")) ? L.acct_taken : L.login_fail;
  });
  renderList();
}

// 메일 연결: 계정에 이메일+비밀번호+호스트 입력 → 서버가 env 파일에 기록(DB 아님). 수신은 별도 수집기.
function openMailConnect(acct, onDone) {
  const L = state.lex;
  const configured = acct.provider && acct.provider !== "none"; // 이미 메일 연결됨?(덮어쓰기 안내용)
  const ov = document.createElement("div");
  ov.className = "ui-confirm-overlay";
  ov.innerHTML = `<div class="ui-confirm" role="dialog" aria-label="${esc(L.mailbox_connect_title ?? "메일 연결")}" style="text-align:left">
    <p class="ui-confirm-msg">${esc(L.mailbox_connect_title ?? "메일 연결")} · ${esc(acct.username || "")}</p>
    ${configured ? `<div class="triage-note">${esc(L.mailbox_overwrite_note ?? "이미 메일이 연결돼 있습니다 — 저장하면 기존 설정을 덮어씁니다.")}</div>` : ""}
    <input id="mcHost" class="login-input" value="pop3s.hiworks.com" placeholder="${esc(L.mailbox_host ?? "POP3 호스트")}" autocomplete="off" />
    <input id="mcUser" class="login-input" value="${esc(acct.email || "")}" placeholder="${esc(L.acct_email ?? "이메일")}" autocomplete="off" />
    <input id="mcPw" class="login-input" type="password" placeholder="${esc(L.acct_pw ?? L.login_pw ?? "비밀번호")}" autocomplete="new-password" />
    <div class="dim mini" style="margin:4px 0 6px">${esc(L.mailbox_connect_hint ?? "")}</div>
    <div class="login-err" style="min-height:1.2em"></div>
    <div class="ui-confirm-btns">
      <button class="ui-confirm-cancel">${L.btn_cancel}</button>
      <button class="mc-test fav-chip" ${configured ? "" : "disabled"}>${esc(L.mailbox_test_btn ?? "연결 테스트")}</button>
      <button class="ui-confirm-ok">${esc(L.mailbox_connect_save ?? "연결 저장")}</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector(".ui-confirm-cancel").addEventListener("click", close);
  const errBox = ov.querySelector(".login-err");
  const testBtn = ov.querySelector(".mc-test");
  const runTest = async () => {
    errBox.style.color = "var(--muted)"; errBox.textContent = L.mailbox_testing ?? "연결 테스트 중…"; testBtn.disabled = true;
    const t = await post("/api/accounts/mailbox/test", { id: acct.id }).then((x) => x.json()).catch(() => null);
    testBtn.disabled = false;
    if (t && t.ok) { errBox.style.color = "var(--ok)"; errBox.textContent = `${L.mailbox_test_ok ?? "✅ 연결 성공"}${t.fetched ? ` (${t.fetched})` : ""}`; }
    else { errBox.style.color = "var(--danger)"; const code = t?.error || ""; errBox.textContent = `${L.mailbox_test_fail ?? "❌ 연결 실패"}${code ? `: ${code === "auth_failed" ? "아이디/비번/POP3설정 확인" : code}` : ""}`; }
  };
  testBtn.addEventListener("click", runTest);
  ov.querySelector(".ui-confirm-ok").addEventListener("click", async () => {
    errBox.style.color = ""; errBox.textContent = "";
    const host = ov.querySelector("#mcHost").value.trim();
    const username = ov.querySelector("#mcUser").value.trim();
    const password = ov.querySelector("#mcPw").value;
    if (!host || !username || !password) { errBox.style.color = "var(--danger)"; errBox.textContent = L.mailbox_connect_incomplete ?? "호스트·이메일·비밀번호를 모두 입력하세요"; return; }
    const r = await post("/api/accounts/mailbox/credentials", { id: acct.id, provider: "hiworks", host, username, password })
      .then((x) => x.json()).catch(() => null);
    if (r && r.ok) {
      toast(L.mailbox_connect_done ?? "저장됨");
      onDone?.(); // 목록 갱신(provider/env 반영)
      errBox.style.color = "var(--ok)";
      errBox.textContent = `${L.mailbox_saved ?? "✅ 저장되었습니다"} — ${L.mailbox_test_prompt ?? "연결을 테스트할까요?"}`;
      testBtn.disabled = false; testBtn.focus(); // "연결 테스트" 버튼으로 안내(자동 아님, 눌러서 테스트)
    } else {
      errBox.style.color = "var(--danger)";
      errBox.textContent = r?.error === "mailbox_credentials_incomplete" ? (L.mailbox_connect_incomplete ?? "입력 누락") : (r?.error || L.login_fail);
    }
  });
}

// 분해: 부모 할일을 세부할일로 나누기 — 한 줄에 하나씩(수동) 또는 'AI 제안'(로컬 LLM이 채움, owner 확인 후 생성).
// AI 제안은 monster_type→party 매핑까지 받아 생성 시 party_ref 기록(S5). LLM은 제안만, 확정은 사람.
function openSplitModal(itemId, projectId, parentTitle, onDone) {
  const L = state.lex;
  document.querySelector(".ui-confirm-overlay")?.remove(); // 기존 모달 중복 스택 방지(다른 모달과 동일 패턴)
  let aiMap = {}; // title → { monster_type, party_ref } (AI 제안분만; 수동 입력 줄은 매핑 없음)
  const ov = document.createElement("div");
  ov.className = "ui-confirm-overlay";
  ov.innerHTML = `<div class="ui-confirm" role="dialog" aria-label="${esc(L.split_subtasks ?? "세부할일로 나누기")}" style="text-align:left">
    <p class="ui-confirm-msg">${esc(L.split_subtasks ?? "세부할일로 나누기")} · ${esc(parentTitle || "")}</p>
    <div class="dim mini" style="margin:0 0 6px">${esc(L.split_hint ?? "한 줄에 하나씩 세부할일을 적으세요")}</div>
    <div class="ui-confirm-btns" style="justify-content:flex-start;margin:0 0 6px"><button class="sp-ai fav-chip">${esc(L.split_ai_btn ?? "🤖 AI 제안")}</button></div>
    <div class="sp-ai-result dim mini" style="min-height:1.2em"></div>
    <textarea id="splitLines" class="login-input" rows="5" style="width:100%;resize:vertical" placeholder="${esc(L.split_hint ?? "한 줄에 하나씩")}"></textarea>
    <div class="login-err" style="min-height:1.2em"></div>
    <div class="ui-confirm-btns">
      <button class="ui-confirm-cancel">${L.btn_cancel ?? "취소"}</button>
      <button class="ui-confirm-ok">${esc(L.split_subtasks ?? "만들기")}</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove(); // escClose는 ov에 달려 ov 제거 시 자동 GC(누수 방지)
  const escClose = (e) => { if (e.key === "Escape") close(); }; // Esc로 닫기(다른 모달과 일관)
  ov.addEventListener("keydown", escClose);
  ov.tabIndex = -1; // ov가 keydown 받도록(자식 textarea 포커스에서 버블 + ov 자체 포커스 가능)
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector(".ui-confirm-cancel").addEventListener("click", close);
  const errBox = ov.querySelector(".login-err");
  const ta = ov.querySelector("#splitLines");
  const aiRes = ov.querySelector(".sp-ai-result");
  const aiBtn = ov.querySelector(".sp-ai");
  ta.focus();
  aiBtn.addEventListener("click", async () => {
    aiBtn.disabled = true; aiRes.style.color = "var(--muted)"; aiRes.textContent = L.split_ai_wait ?? "AI 분석 중…";
    const r = await post("/api/items/split-suggest", { id: itemId }).then((x) => x.json()).catch(() => null);
    aiBtn.disabled = false;
    if (!r) { aiRes.style.color = "var(--danger)"; aiRes.textContent = L.split_ai_off ?? "AI 미연결 — 수동 입력하세요"; return; }
    if (r.reason === "llm_unavailable") { aiRes.textContent = L.split_ai_off ?? "로컬 AI 미연결 — 수동 입력하세요"; return; }
    if (r.is_task === false) { aiRes.textContent = `${L.split_ai_notask ?? "AI: 처리할 업무가 아닐 수 있음"}`; return; }
    if (!r.should_split || !(r.sub_tasks || []).length) { aiRes.textContent = `${L.split_ai_nosplit ?? "AI: 쪼갤 필요 없음"}${r.reason ? ` — ${esc(r.reason)}` : ""}`; return; }
    ta.value = r.sub_tasks.map((s) => s.title).join("\n");
    aiMap = {}; for (const s of r.sub_tasks) aiMap[String(s.title).trim()] = { monster_type: s.monster_type, party_ref: s.party_ref }; // trim 키로 textarea 줄(trim)과 일치
    const parties = [...new Set(r.sub_tasks.map((s) => s.party_ref).filter(Boolean))];
    aiRes.style.color = "var(--ok)";
    aiRes.textContent = `${L.split_ai_suggested ?? "AI 제안"} ${r.sub_tasks.length}${parties.length ? ` · ${parties.join(", ")}` : ""}`;
  });
  const okBtn = ov.querySelector(".ui-confirm-ok");
  okBtn.addEventListener("click", async () => {
    if (okBtn.disabled) return;
    const lines = ta.value.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!lines.length) { errBox.style.color = "var(--danger)"; errBox.textContent = L.split_empty ?? "세부할일을 한 줄 이상 적으세요"; return; }
    okBtn.disabled = true; // 더블클릭→중복 자식 생성 방지(성공 시 close, 실패 시 아래서 재활성)
    errBox.style.color = "var(--muted)"; errBox.textContent = "…";
    let ok = 0; const failed = [];
    for (const title of lines) {
      const a = aiMap[title];
      const r = await post("/api/items", { project_id: projectId, title, parent_item_id: itemId, ...(a && a.party_ref ? { party_ref: a.party_ref } : {}) });
      const data = await r.json().catch(() => ({})); // 응답 바디 소비(커넥션 누수 방지) + 에러 수집
      if (r.ok) ok++; else failed.push({ title, error: data.error });
    }
    if (failed.length) { // 부분 실패를 조용히 넘기지 않음 — 실패 목록 보이고 모달 유지
      errBox.style.color = "var(--danger)";
      errBox.textContent = `${ok}${L.split_done ?? "개 생성"} · ${failed.length}${L.split_failed ?? "개 실패"}: ${failed.map((f) => f.title).join(", ")}`;
      const failedTitles = new Set(failed.map((f) => f.title));
      ta.value = lines.filter((l) => failedTitles.has(l)).join("\n"); // 성공분 제거 → 재클릭해도 중복 생성 안 함
      okBtn.disabled = false; // 실패분만 재시도 허용
      onDone?.(); // 성공분은 반영
      return;
    }
    toast(`${ok}${L.split_done ?? "개 세부할일을 만들었습니다"}`, "ok");
    close();
    onDone?.();
  });
}

// 산출물 입력파일 패널: 종류→In 하위폴더 제안 + 등록(포인터·출처·상태) + 목록(상태토글·포인터복사).
// 원문 미저장: 포인터·메타만. 실제 파일 업/다운로드는 보안 검토 후 별도(여기선 장부 등록).
async function openDeliverableInputs(deliverableId, name) {
  const L = state.lex;
  const TYPES = ["schematic", "pcb", "bom", "gerber", "report", "test"];
  const SRC = ["erp", "mail", "codex"];
  const STAT = ["needed", "received", "used"];
  document.querySelector(".ui-confirm-overlay")?.remove();
  const ov = document.createElement("div");
  ov.className = "ui-confirm-overlay";
  ov.innerHTML = `<div class="ui-confirm di-panel" role="dialog" aria-label="${L.di_section ?? "입력파일"}" style="max-width:760px;text-align:left">
    <p class="ui-confirm-msg">${L.di_section ?? "입력파일"} · ${esc(name ?? deliverableId)}</p>
    <div class="di-create filters" style="gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
      <label class="dim mini">${L.di_type ?? "종류"} <select id="diType">${TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}</select></label>
      <input id="diSub" list="diSubs" size="9" placeholder="${L.di_subfolder ?? "하위폴더"}" />
      <datalist id="diSubs"></datalist>
      <input id="diFile" size="13" placeholder="${L.di_file ?? "파일명"}" />
      <input id="diPtr" size="22" placeholder="${L.di_pointer ?? "상대 포인터(_workspaces/…/02_Input/…)"}" />
      <select id="diSrc">${SRC.map((s) => `<option value="${s}">${s}</option>`).join("")}</select>
      <select id="diStat">${STAT.map((s) => `<option value="${s}" ${s === "received" ? "selected" : ""}>${L["di_st_" + s] ?? s}</option>`).join("")}</select>
      <button id="diAdd" class="fav-chip">${L.di_register ?? "등록"}</button>
      <span id="diMsg" class="dim mini"></span>
    </div>
    <div class="di-upload filters" style="gap:6px;align-items:center;margin-bottom:8px">
      <input type="file" id="diUpload" />
      <button id="diUploadBtn" class="fav-chip">${L.di_upload ?? "파일 업로드"}</button>
      <span class="dim mini">${L.di_upload_hint ?? "선택한 하위폴더의 02_Input 에 올립니다"}</span>
      <span id="diUpMsg" class="dim mini"></span>
    </div>
    <div id="diList"></div>
    <div class="ui-confirm-btns"><button class="ui-confirm-cancel">${L.btn_cancel ?? "닫기"}</button></div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector(".ui-confirm-cancel").addEventListener("click", close);
  // 종류 선택 → In 하위폴더 제안 채우기
  const loadSubs = async () => {
    const t = ov.querySelector("#diType").value;
    const r = await api(`/api/deliverables/input-subfolders?type=${encodeURIComponent(t)}`).catch(() => ({ subfolders: [] }));
    ov.querySelector("#diSubs").innerHTML = (r.subfolders || []).map((s) => `<option value="${esc(s)}"></option>`).join("");
  };
  ov.querySelector("#diType").addEventListener("change", loadSubs);
  const renderList = async () => {
    const rows = await api(`/api/deliverables/inputs?deliverable=${encodeURIComponent(deliverableId)}`).catch(() => []);
    if (!rows.length) { ov.querySelector("#diList").innerHTML = `<div class="empty small">${L.di_none ?? "등록된 입력파일 없음"}</div>`; return; }
    ov.querySelector("#diList").innerHTML =
      `<table class="di-table" style="width:100%;border-collapse:collapse"><thead><tr>
        <th>${L.di_subfolder ?? "하위폴더"}</th><th>${L.di_file ?? "파일명"}</th><th>${L.di_source ?? "출처"}</th><th>${L.di_status ?? "상태"}</th><th>${L.di_pointer ?? "포인터"}</th>
      </tr></thead><tbody>${rows.map((x) => {
        const next = x.status === "needed" ? "received" : x.status === "received" ? "used" : "needed";
        return `<tr>
          <td class="dim">${esc(x.subfolder ?? "-")}</td><td>${esc(x.file_name ?? "-")}</td>
          <td class="dim">${esc(x.source)}</td>
          <td><button class="fav-chip mini di-stat" data-id="${esc(x.id)}" data-to="${next}">${L["di_st_" + x.status] ?? x.status}</button></td>
          <td class="pointer">${x.pointer ? `<span class="ptr-text">${esc(x.pointer)}</span><button class="copy-btn mini" data-c="${esc(x.pointer)}">${L.copy}</button> <a class="fav-chip mini" href="/api/deliverables/inputs/file?id=${encodeURIComponent(x.id)}" download>${L.di_download ?? "다운로드"}</a>` : "-"}</td>
        </tr>`; }).join("")}</tbody></table>`;
    ov.querySelectorAll(".di-stat").forEach((b) => b.addEventListener("click", async () => {
      await post("/api/deliverables/inputs/status", { id: b.dataset.id, status: b.dataset.to }); renderList();
    }));
    ov.querySelectorAll(".copy-btn").forEach((b) => b.addEventListener("click", () => navigator.clipboard?.writeText(b.dataset.c)));
  };
  ov.querySelector("#diAdd").addEventListener("click", async () => {
    const v = (s) => ov.querySelector(s).value.trim();
    const msg = ov.querySelector("#diMsg");
    const body = { deliverable_id: deliverableId, subfolder: v("#diSub"), file_name: v("#diFile"),
      pointer: v("#diPtr"), source: v("#diSrc"), status: v("#diStat") };
    if (!body.file_name && !body.pointer) { msg.textContent = L.di_need ?? "파일명 또는 포인터 필요"; return; }
    const r = await post("/api/deliverables/inputs", body).then((x) => x.json()).catch(() => null);
    if (r && r.ok) { ["#diFile", "#diPtr"].forEach((s) => (ov.querySelector(s).value = "")); msg.textContent = L.di_added ?? "등록됨"; renderList(); }
    else { msg.textContent = (r && r.error === "pointer_must_be_relative") ? (L.di_abs ?? "상대경로만 가능") : (r?.error ?? "오류"); }
  });
  // 파일 업로드: 선택 파일을 02_Input/<하위폴더> 에 올리고 장부 등록(서버 path-safety·기본 OFF).
  ov.querySelector("#diUploadBtn").addEventListener("click", async () => {
    const f = ov.querySelector("#diUpload").files?.[0];
    const msg = ov.querySelector("#diUpMsg");
    if (!f) { msg.textContent = L.di_pick ?? "파일을 선택하세요"; return; }
    const sub = ov.querySelector("#diSub").value.trim();
    const url = `/api/deliverables/inputs/upload?deliverable=${encodeURIComponent(deliverableId)}&subfolder=${encodeURIComponent(sub)}&filename=${encodeURIComponent(f.name)}`;
    msg.textContent = L.di_uploading ?? "업로드 중…";
    const r = await request(url, {
      method: "POST",
      body: f,
      timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS,
      acceptHttpError: true
    }).then((x) => x.json()).catch(() => null);
    if (r && r.ok) { ov.querySelector("#diUpload").value = ""; msg.textContent = L.di_added ?? "등록됨"; renderList(); }
    else {
      const e = r?.error || "오류";
      msg.textContent = e === "fileio_disabled" ? (L.di_fileio_off ?? "파일 IO 비활성")
        : e === "in_pointer_unset" ? (L.di_no_folder ?? "산출물 폴더 경로 미설정")
        : e === "too_large" ? (L.di_too_large ?? "용량 초과") : e;
    }
  });
  await loadSubs();
  renderList();
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

class RequestFailure extends Error {
  constructor(kind, path, { status = null, message = "" } = {}) {
    super(message || kind);
    this.name = "RequestFailure";
    this.kind = kind;
    this.path = path;
    this.status = status;
  }
}

function connectionCopy(status = state.connection.status, failure = state.connection.failure) {
  if (status === "checking") return { title: "서버 연결 확인 중", detail: "잠시만 기다려 주세요." };
  if (status === "timeout") return { title: "요청 시간이 초과되었습니다", detail: "서버 응답이 늦습니다. 저장 작업은 연결이 확인될 때까지 중지됩니다." };
  if (status === "unauthorized") return { title: "로그인이 만료되었거나 권한이 없습니다", detail: "다시 연결한 뒤 로그인 화면에서 인증해 주세요." };
  if (status === "http") return { title: "서버가 요청을 처리하지 못했습니다", detail: `HTTP ${failure?.status ?? "오류"}. 잠시 후 다시 연결해 주세요.` };
  return { title: "ERP 서버에 연결할 수 없습니다", detail: "서버가 꺼져 있거나 네트워크 연결이 끊겼습니다. 저장 작업은 중지되었습니다." };
}

function syncConnectionControls() {
  const blocked = state.connection.status !== "online";
  document.querySelectorAll("button, input, select, textarea").forEach((el) => {
    if (el.matches("[data-connection-action]")) return;
    if (blocked) {
      if (!el.disabled) {
        el.dataset.connectionDisabled = "1";
        el.disabled = true;
      }
    } else if (el.dataset.connectionDisabled === "1") {
      delete el.dataset.connectionDisabled;
      el.disabled = false;
    }
  });
}

function renderConnectionStatus() {
  const el = $("#connectionStatus");
  if (!el) return;
  const online = state.connection.status === "online";
  el.hidden = online;
  el.dataset.kind = state.connection.status;
  if (online) return;
  const copy = connectionCopy();
  $("#connectionTitle").textContent = copy.title;
  $("#connectionDetail").textContent = copy.detail;
  const retry = $("#connectionRetry");
  retry.textContent = state.connection.status === "checking" ? "확인 중…" : "다시 연결";
  retry.disabled = state.connection.status === "checking";
}

function renderColdConnectionFailure() {
  if (state.booted) return;
  const copy = connectionCopy();
  $("#viewTitle").textContent = "ERP 연결 문제";
  $("#view").innerHTML = `<div class="connection-recovery" role="alert">
    <strong>${esc(copy.title)}</strong>
    <p>${esc(copy.detail)}</p>
    <p class="dim">위의 ‘다시 연결’을 누르면 현재 화면에서 서버 상태와 로그인을 다시 확인합니다.</p>
  </div>`;
}

function setConnectionState(status, failure = null) {
  state.connection = { status, failure };
  document.body.dataset.connection = status;
  renderConnectionStatus();
  syncConnectionControls();
  if (status !== "online" && status !== "checking") renderColdConnectionFailure();
}

function requestFailureFromResponse(path, response) {
  if (response.status === 401) {
    return new RequestFailure("unauthorized", path, { status: response.status, message: "unauthorized" });
  }
  return new RequestFailure("http", path, { status: response.status, message: `http_${response.status}` });
}

async function request(path, {
  timeoutMs = REQUEST_TIMEOUT_MS,
  acceptHttpError = false,
  acceptedDomainStatuses = [],
  retryableUnauthorized = false,
  ...options
} = {}) {
  const method = String(options.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") assertMutationAllowed(path);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(path, { ...options, cache: "no-store", signal: ctl.signal });
  } catch (error) {
    const failure = error?.name === "AbortError"
      ? new RequestFailure("timeout", path, { message: "request_timeout" })
      : new RequestFailure("network", path, { message: "network_unavailable" });
    setConnectionState(failure.kind, failure);
    throw failure;
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const failure = requestFailureFromResponse(path, response);
    const acceptedDomainStatus = response.status >= 400
      && response.status !== 401
      && response.status < 500
      && Array.isArray(acceptedDomainStatuses)
      && acceptedDomainStatuses.includes(response.status);
    const acceptedFailure = acceptHttpError || acceptedDomainStatus;
    const retryableAuthFailure = retryableUnauthorized
      && failure.kind === "unauthorized"
      && ["/api/auth/login", "/api/auth/bootstrap", "/api/auth/register"].includes(path);
    if (!retryableAuthFailure && (!acceptedFailure || failure.kind === "unauthorized" || response.status >= 500)) {
      setConnectionState(failure.kind, failure);
    }
    if (!acceptedFailure) throw failure;
  }
  return response;
}

const api = async (path, options = {}) => {
  const response = await request(path, options);
  try {
    return await response.json();
  } catch {
    const failure = new RequestFailure("http", path, { status: response.status, message: "invalid_json_response" });
    setConnectionState(failure.kind, failure);
    throw failure;
  }
};
// XSS 방지: 외부 유래 문자열(메일 제목/상대/할일 제목 등)은 전부 esc() 경유
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const daysAgo = (iso, lex) => {
  if (!iso) return "-";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? lex.today_word : `${d}${lex.days_ago}`;
};
function assertMutationAllowed(path) {
  if (state.connection.status === "online") return;
  const failure = state.connection.failure || new RequestFailure("network", path, { message: "connection_not_ready" });
  syncConnectionControls();
  throw failure;
}

const post = async (path, body) => {
  return request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    acceptHttpError: true
  });
};

const postJsonWithTimeout = async (path, body, timeoutMs = CHAT_REQUEST_TIMEOUT_MS) => {
  return request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs,
    acceptHttpError: true
  });
};

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
  const [data, mods, version] = await Promise.all([
    api(`/api/lexicon?mode=${state.mode}`),
    api(`/api/modules?mode=${state.mode}`),
    api("/api/version").catch(() => VERSION_FALLBACK)
  ]);
  state.lex = data.labels;
  state.modules = mods;
  state.version = version || VERSION_FALLBACK;
  document.body.dataset.mode = state.mode;
  // 맨 왼쪽 콕핏 버튼 = 위젯 대시보드 진입(ECount 로고/MyPage 식). 아이콘+라벨, 홈일 때 활성.
  const browserVersion = browserVersionText();
  const ua = navigator.userAgent || browserVersion;
  const erpVersion = versionPart("erp");
  const chatbotVersion = versionPart("chatbot");
  const runtime = state.version?.runtime || {};
  const llm = runtime.llm || {};
  const bridgeVersion = codexBridgePart(runtime.codex_task);
  const erpReleaseTitle = `ERP ${erpVersion.release} · ${state.lex.app_version_label} ${erpVersion.build} · ${erpVersion.source} · ${state.lex.browser_version_label} ${browserVersion} · ${ua}`;
  const chatbotReleaseTitle = `${state.lex.chat_version_label} ${chatbotVersion.release} · ${chatbotVersion.build} · ${chatbotVersion.source} · ${runtime.checkout || "unknown"}:${runtime.port ?? "?"} · ${llm.provider || "?"}/${llm.model || "?"} · thinking=${llm.thinking === true}`;
  const bridgeReleaseTitle = `Codex ${bridgeVersion.mode} · bridge ${bridgeVersion.release} · ${bridgeVersion.source} · ${runtime.checkout || "unknown"}:${runtime.port ?? "?"}`;
  $("#appTitle").innerHTML = `<span class="cockpit-ico" aria-hidden="true">▦</span><span>${esc(state.lex.app_title)}</span>`;
  $("#appVersionChips").innerHTML = `<span class="version-chip" title="${esc(erpReleaseTitle)}">ERP ${esc(erpVersion.release)}</span><span class="version-chip" title="${esc(chatbotReleaseTitle)}">${esc(state.lex.chat_version_label)} ${esc(chatbotVersion.release)}</span><span class="version-chip" title="${esc(bridgeReleaseTitle)}">브리지 ${esc(bridgeVersion.release)}</span>`;
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

const VIEWS = ["home", "projects", "items", "guide", "mail", "artifacts", "search"];
const navKey = { home: "nav_home", projects: "nav_projects", items: "nav_items", guide: "nav_guide", mail: "nav_mail", artifacts: "nav_artifacts", search: "nav_search", auditlog: "nav_audit" };

// 대분류 = 다루는 '대상(객체)'축 (owner 결정 2026-06-13). IA 4단(ECount식):
// ① 대분류(상단 가로, 큰글씨) → ② 중분류(상단 가로, 작은글씨) → ③ 분류(좌측 헤더) → ④ 항목(좌측 하위).
// 분류 초안 = 3안(흐름/빈도/도메인) 병렬설계+심사 종합(2026-06-14): 도메인 골격 위에 SE 강제엔진
// (게이트·제안·일정)을 '단계 운영'으로 좌상단 집중, 메일·요청은 '받은 일'(인입)로 분리.
// 라벨은 {b 업무 / f 판타지}. 이 NAV_TREE 가 단일 편집 지점.
// 4대분류(owner 2026-06-14 지시): 프로젝트 관리(과제시작년도 계층) / 업무 관리 / 자원 관리 / 지식·지원.
// 콕핏(home)은 대분류 밖 좌상단 버튼 표면(ECount MyPage식). 단일 편집점.
// 프로젝트 관리는 정적 항목이 아니라 동적 트리: 과제시작년도 → 과제번호(과제명) → 허브. sector.tree="projects".
const NAV_TREE = [
  // L2 중분류 = 과제시작년도(동적), L3 왼쪽 = 과제명, L4 = 과제 facet. dynamicYears 분기로 렌더.
  { id: "proj", b: "프로젝트 관리", f: "원정 관리", dynamicYears: true, sectors: [] },
  { id: "work", b: "업무 관리", f: "원정 본부", sectors: [
    { g: "work_inbox", b: "받은 일", f: "전령함", subs: [
      { b: "메일", f: "전령", items: ["mail"] },
      { b: "개발 요청", f: "의뢰 게시판", items: ["mod:requests"] },
    ] },
    { g: "work_mine", b: "내 할 일", f: "내 할 일", subs: [
      { b: "할 일", f: "할 일", items: ["items"] },
      { b: "캘린더", f: "성좌 달력", items: ["mod:calendar"] },
    ] },
    { g: "work_flow", b: "승인·현황", f: "재가·전황", subs: [
      { b: "승인 대기", f: "재가 대기", items: ["mod:proposals"] },
      { b: "단계·게이트", f: "관문", items: ["mod:gates", "mod:schedule"] },
      { b: "투입 분석", f: "전훈 분석", items: ["mod:analytics"] },
    ] },
    { g: "work_record", b: "보고·회의", f: "연대기·원탁", subs: [
      { b: "보고·일지", f: "연대기", items: ["mod:reports"] },
      { b: "전체 이력", f: "대연대기", items: ["auditlog"] },
      { b: "회의·결정", f: "원탁", items: ["mod:meetings"] },
      { b: "산출물", f: "전리품", items: ["artifacts"] },
    ] },
  ] },
  { id: "res", b: "자원 관리", f: "병참·서고", sectors: [
    { g: "res_procure", b: "구매·재고", f: "보급·창고", subs: [
      { b: "구매·발주", f: "보급", items: ["mod:purchase"] },
      { b: "재고·자산", f: "병참 창고", items: ["mod:inventory"] },
    ] },
    { g: "res_part", b: "부품·보드", f: "설계·부품", subs: [
      { b: "보드·BOM", f: "설계도", items: ["mod:boards"] },
      { b: "부품 감시", f: "보급 정찰", items: ["mod:stockwatch"] },
    ] },
    { g: "res_vendor", b: "거래처", f: "상단", subs: [
      { b: "거래처·연락처", f: "상단·인명록", items: ["mod:contacts"] },
    ] },
  ] },
  // 지식 = 분야 4그룹(서브탭) + 항목은 canon 에서 동적으로 왼쪽 나열(knowGroup). 검색·지침은 정적.
  { id: "know", b: "지식", f: "전승 서고", sectors: [
    { g: "kg_standards", b: "표준·규격집", f: "율법·규격집", knowGroup: "standards", subs: [] },
    { g: "kg_domain", b: "분야 기술", f: "분야 비술", knowGroup: "domain", subs: [] },
    { g: "kg_method", b: "지식·RAG 방법", f: "지식 연성술", knowGroup: "method", subs: [] },
    { g: "kg_doctrine", b: "운영 규범·교리", f: "교리·규범", knowGroup: "doctrine", subs: [] },
    { g: "kg_search", b: "검색·지침", f: "전승 검색", subs: [
      { b: "지식·RAG·표준", f: "전승 검색", items: ["mod:knowledge"] },
      { b: "SE 가이드·검색", f: "원정 지침", items: ["guide", "search"] },
    ] },
  ] },
  { id: "tool", b: "도구·지원", f: "제작 도구", sectors: [
    { g: "tool_make", b: "도구·템플릿", f: "제작 도구", subs: [
      { b: "계산기", f: "계산 마법구", items: ["mod:calculators"] },
      { b: "템플릿·작성법", f: "제작 비법서", items: ["mod:recipe"] },
      { b: "외부 시트", f: "외부 점술판", items: ["mod:embeds"] },
    ] },
  ] },
];
// 준비 중(모듈 0) 슬롯 — 구조 선점용 비활성 표면. owner 결정/후속 슬라이스 대기.
const SOON_NAV = {
  "soon:ai": { b: "AI 제안·승인", f: "신탁·승인" },   // ai_proposal 착지면 owner 결정 #1 후 활성
  "soon:perm": { b: "권한·설정", f: "길드 율법" },     // RBAC·게이트모드 설정 표면화 후속
};
// 과제 facet(L4) — 프로젝트 관리에서 과제(L3) 밑에 펼쳐지는 항목. 클릭 시 과제 허브의 해당 탭 진입.
const PROJ_FACETS = [
  { key: "overview", b: "개요", f: "개요" },
  { key: "trunk", b: "줄기", f: "세계수" },
  { key: "contacts", b: "연락처", f: "관계자" },
  { key: "schedule", b: "일정", f: "운명표" },
  { key: "gates", b: "단계·게이트", f: "관문" },
  { key: "items", b: "할 일", f: "할 일" },
  { key: "mail", b: "메일", f: "전령" },
  { key: "requirements", b: "요구사항", f: "요구사항" },
  { key: "artifacts", b: "산출물", f: "전리품" },
  { key: "meetings", b: "회의·결정", f: "원탁" },
  { key: "bom", b: "자재·BOM", f: "병참·설계" },
  { key: "risk", b: "리스크·이슈", f: "위험" },
  { key: "history", b: "이력", f: "연대기" },
];
const navTL = (o) => (state.mode === "fantasy" ? o.f : o.b); // 모드별 라벨
function navTopOf(id) { return NAV_TREE.find((t) => t.id === id) ?? NAV_TREE[0]; }
function navSectorOf(topId, g) { const t = navTopOf(topId); const ss = t.sectors ?? []; return ss.find((s) => s.g === g) ?? ss[0]; }
// 과제시작년도 목록(내림차순, 0=미지정 맨 뒤). 프로젝트 관리 L2 중분류 = 이 년도들.
function projYears() {
  const ys = new Set();
  for (const p of state._projCache ?? []) ys.add(p.start_year ?? 0);
  return [...ys].sort((a, b) => (b || -1) - (a || -1));
}
function projYearLabel(y) { return y ? `${y}${state.lex.proj_year_suffix ?? "년 시작"}` : (state.lex.proj_year_none ?? "시작년도 미지정"); }
function curProjYear() { const m = String(state.navGroup ?? "").match(/^year:(\d+)$/); return m ? Number(m[1]) : null; }
function navFirstView(sec) { for (const sub of sec?.subs ?? []) for (const it of sub.items) return it; return "home"; }
// view → (대분류, 중분류) 위치 검색(팔레트/허브 점프 시 상단 탭 동기화)
function navLocate(v) {
  // 프로젝트 허브/목록은 '프로젝트 관리' 대분류로 동기화(현재 year 중분류 유지, 없으면 최신 년도)
  if (v === "project" || v === "projects") {
    const y = curProjYear() ?? projYears()[0] ?? 0;
    return { top: "proj", g: `year:${y}` };
  }
  for (const top of NAV_TREE) for (const sec of top.sectors ?? [])
    for (const sub of sec.subs ?? []) if (sub.items.includes(v)) return { top: top.id, g: sec.g };
  return null;
}

// 가상 뷰(MODULES 에 없는 화면) — nav 항목 라벨. render() 에 dispatch 가 있어야 동작.
const VIRTUAL_NAV = {
  "mod:calendar": { b: "캘린더", f: "성좌 달력" },
  "mod:schedule": { b: "SE 일정", f: "운명 직조" },
  "mod:recipe": { b: "작성법 위저드", f: "제작 비법서" },
  "mod:embeds": { b: "외부 시트", f: "외부 점술판" },
  "mod:proposals": { b: "제안 큐", f: "제안 두루마리" },
};
function navButton(v) {
  if (v.startsWith("soon:")) {                          // 준비 중 슬롯 — 비활성, 구조만 노출
    const sn = SOON_NAV[v];
    return `<button class="soon" disabled><span>${navTL(sn)} <em class="phase-tag">${state.lex.nav_soon ?? "준비 중"}</em></span></button>`;
  }
  const perm = permOf(v.startsWith("mod:") ? v : `view:${v}`);
  if (!perm.visible) return "";                       // RBAC: 숨김
  const locked = !perm.access;                        // RBAC: 보이되 잠김
  const lock = locked ? ` <i class="lock" title="${state.lex.perm_locked ?? "권한 없음"}">🔒</i>` : "";
  const dis = locked ? " disabled" : "";
  const pinned = state.pins.includes(v);
  const star = `<i class="pin-btn ${pinned ? "on" : ""}" data-pin="${v}" title="${state.lex.pin_toggle}">${pinned ? "★" : "☆"}</i>`;
  if (v.startsWith("mod:")) {
    const m = (state.modules ?? []).find((x) => `mod:${x.id}` === v);
    if (m) return `<button data-v="${v}" class="${state.view === v ? "active" : ""}"${dis}>
      <span>${m.nav}${lock}</span><span class="nav-side"><em class="phase-tag">${m.phase}</em>${star}</span></button>`;
    const vn = VIRTUAL_NAV[v]; // 가상 뷰
    if (vn) return `<button data-v="${v}" class="${state.view === v ? "active" : ""}"${dis}>
      <span>${navTL(vn)}${lock}</span><span class="nav-side">${star}</span></button>`;
    return "";
  }
  return `<button data-v="${v}" class="${state.view === v ? "active" : ""}"${dis}><span>${state.lex[navKey[v]]}${lock}</span><span class="nav-side">${star}</span></button>`;
}

// L1 대분류(상단 가로, 큰 글씨). 클릭 → 첫 중분류·첫 화면 랜딩.
function renderTopBar() {
  if (!NAV_TREE.some((t) => t.id === state.navTop)) state.navTop = NAV_TREE[0].id;
  // 홈(위젯)일 때는 대분류 미강조 — 좌상단 콕핏 버튼이 활성(ECount: MyPage 는 대분류 밖).
  const onHome = state.view === "home";
  $("#appTitle")?.classList.toggle("on", onHome);
  $("#groupBar").innerHTML = NAV_TREE.map((t) =>
    `<button class="group-tab ${!onHome && state.navTop === t.id ? "on" : ""}" data-top="${t.id}">${navTL(t)}</button>`
  ).join("");
  $("#groupBar").querySelectorAll(".group-tab").forEach((b) =>
    b.addEventListener("click", () => {
      state.navTop = b.dataset.top;
      localStorage.setItem("dev_erp_navtop", state.navTop);
      const top = navTopOf(state.navTop);
      if (top.dynamicYears) {                        // 프로젝트 관리 → 최신 년도(L2) + 카드 랜딩
        const y = projYears()[0] ?? 0;
        state.navGroup = `year:${y}`;
        state.view = "projects";
      } else {
        const sec = top.sectors[0];
        state.navGroup = sec.g;
        if (sec.knowGroup) { state.knowGroup = sec.knowGroup; state.knowSel = null; state.view = "knowledge"; }
        else state.view = navFirstView(sec);
      }
      localStorage.setItem("dev_erp_navgroup", state.navGroup);
      render();
    })
  );
}

// L2 중분류(상단 가로). 일반 대분류=정적 섹터, 프로젝트 관리=동적 과제시작년도.
function renderSubBar() {
  const top = navTopOf(state.navTop);
  if (top.dynamicYears) return renderYearSubBar();
  if (!(top.sectors ?? []).some((s) => s.g === state.navGroup)) state.navGroup = top.sectors[0].g;
  $("#subBar").innerHTML = top.sectors.map((s) =>
    `<button class="sub-tab ${state.navGroup === s.g ? "on" : ""}" data-g="${s.g}">${navTL(s)}</button>`
  ).join("");
  $("#subBar").querySelectorAll(".sub-tab").forEach((b) =>
    b.addEventListener("click", () => {
      state.navGroup = b.dataset.g;
      localStorage.setItem("dev_erp_navgroup", state.navGroup);
      const sec = navSectorOf(state.navTop, state.navGroup);
      if (sec.knowGroup) { state.knowGroup = sec.knowGroup; state.knowSel = null; state.view = "knowledge"; }
      else state.view = navFirstView(sec);
      render();
    })
  );
}

// 프로젝트 관리 L2 = 과제시작년도 탭(동적). 클릭 → 그 년도 과제 카드(view=projects).
function renderYearSubBar() {
  const years = projYears();
  if (curProjYear() === null || !years.includes(curProjYear())) state.navGroup = `year:${years[0] ?? 0}`;
  $("#subBar").innerHTML = years.length
    ? years.map((y) => `<button class="sub-tab ${state.navGroup === `year:${y}` ? "on" : ""}" data-g="year:${y}">${y || (state.lex.proj_year_none ?? "미지정")}</button>`).join("")
    : `<span class="dim" style="padding:6px 10px;font-size:12px">${state.lex.proj_tree_loading ?? "불러오는 중…"}</span>`;
  $("#subBar").querySelectorAll(".sub-tab").forEach((b) =>
    b.addEventListener("click", () => {
      state.navGroup = b.dataset.g;
      localStorage.setItem("dev_erp_navgroup", state.navGroup);
      state.view = "projects";
      render();
    })
  );
}

function renderNav() {
  // 현재 view → 대분류/중분류 자동 동기화(팔레트/허브 점프 대응)
  const loc = navLocate(state.view);
  if (loc) { state.navTop = loc.top; state.navGroup = loc.g; }
  renderTopBar();
  renderSubBar();

  // 핀(내 메뉴)은 좌측 상단에 중복 표시하지 않음 — 우측 상단 바로가기 바(#favBar)가 담당(ECount식).
  // 좌측: 프로젝트 관리 = 과제(L3 헤더)→facet(L4 항목), 그 외 = 정적 L3 분류 + L4 항목
  const top = navTopOf(state.navTop);
  let tree;
  if (top.dynamicYears) {
    tree = renderProjectYearNav();
  } else if (navSectorOf(state.navTop, state.navGroup)?.knowGroup) {
    tree = renderKnowledgeNav(navSectorOf(state.navTop, state.navGroup).knowGroup);
  } else {
    const sec = navSectorOf(state.navTop, state.navGroup);
    tree = (sec.subs ?? []).map((sub, i) => {
      const btns = sub.items.map(navButton).join("");
      if (!btns.trim()) return ""; // RBAC 로 항목이 전부 숨으면 헤더도 생략
      const key = `${sec.g}:${i}`;
      const active = sub.items.includes(state.view); // 이 분류에 현재 선택 항목 있음 → 헤더 강조·자동 펼침
      const collapsed = !active && state.navFold.has(key) ? " collapsed" : "";
      return `<div class="nav-group nav-sub-group${collapsed}" data-fold="${key}">
        <div class="nav-sub-head${active ? " has-active" : ""}"><i class="fold-ico"></i><span>${navTL(sub)}</span></div>
        <div class="nav-items">${btns}</div></div>`;
    }).join("");
  }
  $("#nav").innerHTML = tree;
  // L3/과제 헤더 클릭 → 접기/펼치기(상태 영속)
  $("#nav").querySelectorAll(".nav-sub-group > .nav-sub-head").forEach((h) =>
    h.addEventListener("click", (e) => {
      const grp = h.closest(".nav-sub-group");
      // 쉐브론 클릭 = 접기/펴기. 라벨(나머지) 클릭 = 첫 항목으로 바로 이동·선택(이카운트식).
      if (e.target.closest(".fold-ico")) {
        const k = grp.dataset.fold;
        if (state.navFold.has(k)) state.navFold.delete(k); else state.navFold.add(k);
        localStorage.setItem("dev_erp_navfold", JSON.stringify([...state.navFold]));
        grp.classList.toggle("collapsed");
        return;
      }
      const first = grp.querySelector(".nav-items button[data-v], .nav-items button[data-hub]");
      if (first) first.click();
    })
  );
  // 정적 항목 버튼(data-v) → view 전환
  $("#nav").querySelectorAll("button[data-v]").forEach((b) =>
    b.addEventListener("click", () => { state.view = b.dataset.v; render(); })
  );
  // 지식 항목(data-k) → 뷰어. 같은 항목 다시 누르면 그룹 목록으로(토글).
  $("#nav").querySelectorAll("button[data-k]").forEach((b) =>
    b.addEventListener("click", () => { state.knowSel = state.knowSel === b.dataset.k ? null : b.dataset.k; state.view = "knowledge"; render(); })
  );
  // 과제 facet 버튼(data-hub + data-facet) → 과제 허브의 해당 탭 진입
  $("#nav").querySelectorAll("button[data-hub]").forEach((b) =>
    b.addEventListener("click", () => { state.hubProject = b.dataset.hub; state.hubTab = b.dataset.facet ?? "overview"; state.view = "project"; render(); })
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

// 지식 좌측 동적 leaves: 현재 분야그룹의 canon 항목(제목)을 왼쪽에 쭉. 캐시 미준비면 로딩 표시.
function renderKnowledgeNav(groupKey) {
  if (!state._knowCache) return `<div class="nav-group"><div class="nav-items"><span class="dim" style="padding:6px 10px;font-size:12px">${state.lex.proj_tree_loading ?? "불러오는 중…"}</span></div></div>`;
  const entries = (state._knowCache.find((g) => g.key === groupKey)?.entries) ?? [];
  if (!entries.length) return `<div class="nav-group"><div class="nav-items"><span class="dim" style="padding:6px 10px;font-size:12px">${state.lex.empty_knowledge ?? "지식 없음"}</span></div></div>`;
  const btns = entries.map((e) => `<button data-k="${esc(e.id)}" class="${state.knowSel === e.id ? "active" : ""}"><span>${esc(e.title)}</span></button>`).join("");
  return `<div class="nav-group"><div class="nav-items">${btns}</div></div>`;
}

// 지식 뷰: 선택 항목 없으면 그룹 카드 목록, 있으면 항목 뷰어(메타·요약·출처 포인터만 — 원문 미저장).
async function renderKnowledgeEntry() {
  if (!state._knowCache) { try { state._knowCache = (await api("/api/knowledge/registry")).groups; } catch { state._knowCache = []; } }
  const L = state.lex;
  const grp = (state._knowCache ?? []).find((g) => g.key === state.knowGroup) ?? state._knowCache?.[0];
  if (!grp) { $("#view").innerHTML = `<div class="empty">${L.empty_knowledge ?? "지식 없음"}</div>`; return; }
  const sel = state.knowSel ? grp.entries.find((e) => e.id === state.knowSel) : null;
  if (!sel) {
    const cards = grp.entries.map((e) => `<button class="know-card" data-k="${esc(e.id)}">
      <span class="know-card-t">${esc(e.title)}</span>
      ${e.primary_domain ? `<span class="know-card-d">${esc(e.primary_domain)}</span>` : ""}
      ${e.summary ? `<span class="know-card-s">${esc(e.summary.slice(0, 120))}</span>` : ""}</button>`).join("");
    $("#view").innerHTML = `<div class="know-grid">${cards || `<div class="empty">${L.empty_knowledge ?? "지식 없음"}</div>`}</div>`;
    $("#view").querySelectorAll(".know-card").forEach((b) => b.addEventListener("click", () => { state.knowSel = b.dataset.k; render(); }));
    return;
  }
  $("#view").innerHTML = `<article class="know-view">
    <button class="know-back" id="knowBack">← ${esc(grp.label)}</button>
    <h2 class="know-h">${esc(sel.title)}</h2>
    ${sel.primary_domain ? `<div class="know-domain">${esc(sel.primary_domain)}</div>` : ""}
    ${sel.summary ? `<p class="know-summary">${esc(sel.summary)}</p>` : ""}
    <dl class="know-meta">
      ${sel.public_ref ? `<div><dt>${L.know_source ?? "공개 출처"}</dt><dd><a href="${esc(sel.public_ref)}" target="_blank" rel="noopener">${esc(decodeURIComponent(sel.public_ref).slice(0, 90))}…</a></dd></div>` : ""}
      ${sel.pointer ? `<div><dt>${L.know_pointer ?? "소스카드"}</dt><dd class="pointer">${esc(sel.pointer)} <button class="copy-btn" data-c="${esc(sel.pointer)}">${L.copy}</button></dd></div>` : ""}
      <div><dt>id</dt><dd class="dim">${esc(sel.id)}</dd></div>
    </dl>
    <p class="know-note">${L.know_note ?? "원문 미저장 — canon 메타·요약·출처 포인터만 표시."}</p>
  </article>`;
  $("#knowBack")?.addEventListener("click", () => { state.knowSel = null; render(); });
  $("#view").querySelector(".copy-btn")?.addEventListener("click", (e) => navigator.clipboard?.writeText(e.target.dataset.c));
}

// --- 프로젝트 관리: L2 년도 선택 → L3 과제(헤더) → L4 facet ---
const HEALTH_LABEL = { ok: ["진행중", "진행중"], watch: ["주의", "주의"], risk: ["위험", "위험"], stopped: ["보류", "봉인"] };
function projHealthLabel(h) { const m = HEALTH_LABEL[h] ?? HEALTH_LABEL.ok; return state.mode === "fantasy" ? m[1] : m[0]; }
function projsOfYear(year) {
  return (state._projCache ?? []).filter((p) => (p.start_year ?? 0) === year)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
// 좌측열: 선택 년도의 과제(L3 접기 헤더) → 그 밑 facet(L4). facet 클릭 → 허브 해당 탭.
function renderProjectYearNav() {
  if (!state._projCache) return `<div class="nav-loading">${state.lex.proj_tree_loading ?? "불러오는 중…"}</div>`;
  const year = curProjYear() ?? projYears()[0] ?? 0;
  const projs = projsOfYear(year);
  if (!projs.length) return `<div class="nav-loading">${state.lex.proj_tree_empty ?? "해당 없음"}</div>`;
  const cap = `<div class="proj-tree-cap">${projYearLabel(year)} · ${state.lex.proj_path_cap ?? "과제 > facet"}</div>`;
  return cap + projs.map((p) => {
    const key = `projf:${p.id}`;
    const onThis = state.view === "project" && state.hubProject === p.id;
    const collapsed = !onThis && state.navFold.has(key) ? " collapsed" : ""; // 선택 과제는 자동 펼침
    const ptitle = p.title && p.title !== p.id ? `<span class="pn-title">${esc(p.title)}</span>` : "";
    const facets = PROJ_FACETS.map((f) => {
      const on = onThis && (state.hubTab ?? "overview") === f.key ? " active" : "";
      return `<button data-hub="${esc(p.id)}" data-facet="${f.key}" class="proj-facet${on}">${navTL(f)}</button>`;
    }).join("");
    return `<div class="nav-group nav-sub-group${collapsed}" data-fold="${key}">
      <div class="nav-sub-head proj-head${onThis ? " on" : ""}" title="${esc(p.title ?? p.id)}">
        <i class="fold-ico"></i><span class="pn-id">${esc(p.id)}</span>${ptitle}</div>
      <div class="nav-items proj-facets">${facets}</div></div>`;
  }).join("");
}
// 메인 패널: 프로젝트 관리 랜딩 — 선택 년도의 과제 카드(상태/단계/워크로드). 클릭→허브 개요.
async function renderProjectsList() {
  if (!state._projCache) { try { state._projCache = (await api("/api/summary")).projects; } catch { state._projCache = []; } }
  const year = curProjYear() ?? projYears()[0] ?? 0;
  const list = projsOfYear(year);
  const archivedCount = list.filter((p) => p.class === "archive").length; // 보관된 과제는 기본 숨김(토글로 표시·복원)
  const visible = state.showArchivedProj ? list : list.filter((p) => p.class !== "archive");
  const cards = visible.map((p) => {
    const wl = [];
    if (p.overdue) wl.push(`<em class="wl over">${state.lex.proj_wl_overdue ?? "연체"} ${p.overdue}</em>`);
    if (p.due_today) wl.push(`<em class="wl due">${state.lex.proj_wl_today ?? "오늘"} ${p.due_today}</em>`);
    if (p.open) wl.push(`<em class="wl open">${state.lex.proj_wl_open ?? "열림"} ${p.open}</em>`);
    const ptitle = p.title && p.title !== p.id ? esc(p.title) : "";
    return `<div class="proj-card${p.class === "archive" ? " archived" : ""}" data-hub="${esc(p.id)}">
      <div class="pc-head"><span class="pc-id">${esc(projDisplay(p.id))}</span>${p.class === "archive" ? `<span class="badge mini">${state.lex.proj_archived_badge ?? "보관됨"}</span>` : ""}${p.provisional ? `<span class="badge mini warn">${state.lex.proj_provisional ?? "정션 미연결"}</span>` : ""}<span class="status-chip s-${p.health ?? "ok"}">${projHealthLabel(p.health)}</span></div>
      ${ptitle ? `<div class="pc-title">${ptitle}</div>` : `<div class="pc-title dim-title">—</div>`}
      <div class="pc-meta">${state.lex.proj_start ?? "시작"} ${p.start_year ?? "—"} · ${state.lex.proj_stage ?? "현재"} ${esc(p.stage_current ?? "—")}</div>
      <div class="pc-wl">${wl.join("") || `<em class="wl none">${state.lex.proj_wl_none ?? "열린 일 없음"}</em>`}</div></div>`;
  }).join("");
  const newForm = `<div class="proj-new item-form">
    <input id="npId" placeholder="${state.lex.proj_new_id_ph ?? "과제코드 (예: P26-099)"}" size="14" />
    <input id="npTitle" placeholder="${state.lex.proj_new_title_ph ?? "과제명"}" />
    <button id="npAdd" class="fav-chip">${state.lex.proj_new_btn ?? "＋ 임시 과제"}</button>
    <span class="dim mini">${state.lex.proj_new_hint ?? "정션 동기화 전까지 '정션 미연결'로 표시됩니다"}</span>
  </div>`;
  $("#view").innerHTML = `<div class="proj-list-head">${state.lex.nav_projects ?? "프로젝트 관리"} › <strong>${projYearLabel(year)}</strong> · ${state.lex.proj_path_hint ?? "과제 클릭 → facet 열림"}${archivedCount ? ` <button id="projArchToggle" class="fav-chip mini">${state.showArchivedProj ? (state.lex.proj_arch_hide ?? "보관 숨기기") : `${state.lex.proj_arch_show ?? "보관 보기"} (${archivedCount})`}</button>` : ""}</div>${newForm}${visible.length ? `<div class="proj-cards">${cards}</div>` : `<div class="empty">${state.lex.proj_tree_empty ?? "해당 없음"}</div>`}`;
  $("#projArchToggle")?.addEventListener("click", () => { state.showArchivedProj = !state.showArchivedProj; render(); });
  $("#npAdd")?.addEventListener("click", async () => {
    const id = $("#npId").value.trim(), title = $("#npTitle").value.trim();
    if (!id || !title) return;
    const r = await post("/api/projects", { id, title });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.project) {
      state._projCache = null; state.hubProject = d.project.id; state.hubTab = "overview"; state.view = "project"; render(); return;
    }
    alert(d.error === "admin_only" ? (state.lex.proj_new_admin ?? "임시 과제 생성은 관리자만 가능합니다")
      : d.error === "project_exists" ? (state.lex.proj_new_dup ?? "이미 있는 과제 코드입니다")
      : d.error === "project_id_format" ? (state.lex.proj_new_fmt ?? "코드 형식: 영문/숫자/-/_ (예 P26-099)")
      : (d.error || "생성 실패"));
  });
  $("#view").querySelectorAll(".proj-card").forEach((c) =>
    c.addEventListener("click", () => { state.hubProject = c.dataset.hub; state.hubTab = "overview"; state.view = "project"; render(); }));
}

// 준비 중 슬롯 화면 — 모듈 0인 운영·관리 칸(AI·승인/권한·설정)의 구조 선점 안내.
function renderSoon(v) {
  const sn = SOON_NAV[v] ?? { b: "준비 중", f: "준비 중" };
  const notes = {
    "soon:ai": state.lex.soon_ai ?? "AI 제안→사람 승인 단일 표면. ai_proposal 착지면 owner 결정 후 활성됩니다.",
    "soon:perm": state.lex.soon_perm ?? "RBAC 권한·게이트모드(hard/soft) 설정 표면. 후속 슬라이스에서 활성됩니다.",
  };
  $("#view").innerHTML = `
    <div class="module-head">
      <span class="phase-tag big">${state.lex.nav_soon ?? "준비 중"}</span>
      <p>${notes[v] ?? ""}</p>
    </div>
    <div class="empty">${navTL(sn)} — ${state.lex.nav_soon ?? "준비 중"}</div>`;
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
  { id: "mine", cat: "group_task", ready: true },
  { id: "deadline_cal", cat: "group_task", ready: true },
  { id: "month_cal", cat: "group_task", ready: true },
  { id: "artifacts", cat: "group_doc", ready: true },
  { id: "reports_w", cat: "group_doc", ready: true },
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
  { id: "throughput", cat: "group_team", ready: true },
  { id: "requests_w", cat: "group_team", ready: true },
  { id: "analytics_w", cat: "group_team", ready: true },
  { id: "proposals", cat: "group_team", ready: true }
];
const WIDGET_CATALOG = WIDGET_PLAN.filter((w) => w.ready).map((w) => w.id); // 실제 보드에 올릴 수 있는 위젯
const CREATE_WIDGETS = new Set(["today", "blocked", "unassigned"]); // 작성(✎) → 할일 생성 화면으로
const CAT_ORDER = ["group_project", "group_task", "group_doc", "group_comm", "group_material", "group_team"];
const DASH_GCOLS = 12;     // 가로 12칼럼 (fine snap)
const DASH_ROW = 22;       // 세로 행 px
const DASH_WMIN = 2, DASH_HMIN = 3;
const DEFAULT_DASH = [
  // member-first: 로그인 직후 '내 할 일'+'먼저 할 일'을 최상단에 — 신규도 본인 업무를 바로 봄. 팀 현황은 상단 건강 신호등+과제표가 커버(teamload는 드로어 opt-in).
  { id: "mine", x: 0, y: 0, w: 6, h: 10 }, { id: "nudges", x: 6, y: 0, w: 6, h: 10 },
  { id: "projects", x: 0, y: 10, w: 12, h: 11 },
  { id: "unassigned", x: 0, y: 21, w: 6, h: 9 }, { id: "teamload", x: 6, y: 21, w: 6, h: 9 }, // 미배정 작업 + 팀원별 부하(관리자)
  { id: "today", x: 0, y: 30, w: 3, h: 8 }, { id: "blocked", x: 3, y: 30, w: 3, h: 8 },
  { id: "mail", x: 6, y: 30, w: 3, h: 8 }, { id: "events", x: 9, y: 30, w: 3, h: 8 },
  { id: "analytics_w", x: 0, y: 38, w: 12, h: 9 } // 담당자별 처리량 분석(관리자) — 신규 레이아웃에 노출, 기존 사용자는 드로어에서 추가
];
// 정해둔 위젯 배치(프리셋). 내 배치는 localStorage 자동저장 + 이름 붙인 저장 슬롯(SLOTS_KEY, 여러 개).
const SAVED_KEY = "dev_erp_widgets_saved"; // (구) 단일 슬롯 — 첫 로드 시 SLOTS_KEY로 마이그레이션
const SLOTS_KEY = "dev_erp_widget_slots";
const DASH_PRESETS = {
  basic: { label: "기본", layout: DEFAULT_DASH },
  task: { label: "할일 집중", layout: [
    { id: "today", x: 0, y: 0, w: 4, h: 10 }, { id: "mine", x: 4, y: 0, w: 4, h: 10 }, { id: "blocked", x: 8, y: 0, w: 4, h: 10 },
    { id: "nudges", x: 0, y: 10, w: 6, h: 9 }, { id: "deadline_cal", x: 6, y: 10, w: 6, h: 9 },
    { id: "projects", x: 0, y: 19, w: 12, h: 10 },
  ] },
  status: { label: "현황 요약", layout: [
    { id: "kpi", x: 0, y: 0, w: 12, h: 6 },
    { id: "projects", x: 0, y: 6, w: 8, h: 12 }, { id: "gatewait", x: 8, y: 6, w: 4, h: 12 },
    { id: "events", x: 0, y: 18, w: 6, h: 8 }, { id: "teamload", x: 6, y: 18, w: 6, h: 8 },
  ] },
};

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
  if (state.account) request("/api/dashboard/layout", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ layout: arr }),
    acceptHttpError: true
  }).catch(() => {});
}
// 이름 붙인 저장 배치 슬롯들. 구버전 단일 슬롯(SAVED_KEY)은 첫 로드 시 '내 배치'로 마이그레이션.
function savedSlots() {
  let a; try { a = JSON.parse(localStorage.getItem(SLOTS_KEY) || "null"); } catch { a = null; }
  if (!Array.isArray(a)) {
    a = [];
    try { const old = JSON.parse(localStorage.getItem(SAVED_KEY) || "null"); if (Array.isArray(old) && old.length) { a = [{ name: "내 배치", layout: old }]; localStorage.setItem(SLOTS_KEY, JSON.stringify(a)); } } catch { /* noop */ }
  }
  return a.filter((s) => s && s.name && Array.isArray(s.layout) && s.layout.length);
}
function setSavedSlots(arr) { localStorage.setItem(SLOTS_KEY, JSON.stringify(arr)); }
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

function taskCodexSeenStore() {
  try {
    const v = JSON.parse(localStorage.getItem("dev_erp_task_codex_seen") || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function saveTaskCodexSeenStore(store) {
  localStorage.setItem("dev_erp_task_codex_seen", JSON.stringify(store || {}));
}

function latestAssistantMessageIdFromItem(item) {
  if (!item || item.codex_last_message_role !== "assistant") return 0;
  const n = Number(item.codex_last_message_id);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function latestAssistantMessageIdFromPayload(payload) {
  const rows = Array.isArray(payload?.messages) ? payload.messages : [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i]?.role === "assistant") {
      const n = Number(rows[i].id);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
  }
  return 0;
}

function markTaskCodexSeen(itemId, messageId) {
  const id = String(itemId || "");
  const mid = Number(messageId);
  if (!id || !Number.isFinite(mid) || mid <= 0) return;
  const store = taskCodexSeenStore();
  if ((Number(store[id]) || 0) >= mid) return;
  store[id] = mid;
  saveTaskCodexSeenStore(store);
}

function codexTaskBadgeHtml(state) {
  if (state === "error") return `<span class="codex-task-badge error" title="Codex 대화 오류">오류</span>`;
  if (state === "waiting") return `<span class="codex-task-badge waiting" title="Codex 답변 작성 중"><i class="codex-task-spin" aria-hidden="true"></i>대기</span>`;
  if (state === "reply-fresh") return `<span class="codex-task-badge fresh" title="새 Codex 답변">답변</span>`;
  if (state === "reply") return `<span class="codex-task-badge" title="Codex 답변 있음">답변</span>`;
  return "";
}

function codexTaskIndicatorHtml(i) {
  if (i?.codex_has_error) return codexTaskBadgeHtml("error");
  if (i?.codex_waiting_reply) return codexTaskBadgeHtml("waiting");
  const replyId = latestAssistantMessageIdFromItem(i);
  if (!replyId) return "";
  const seen = Number(taskCodexSeenStore()[i.id]) || 0;
  return codexTaskBadgeHtml(replyId > seen ? "reply-fresh" : "reply");
}

function attrSelectorValue(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function updateTaskCodexRowBadge(itemId, badgeState) {
  const id = String(itemId || "");
  if (!id) return;
  const selector = attrSelectorValue(id);
  const rows = new Set();
  document.querySelectorAll(`tr[data-item="${selector}"]`).forEach((row) => rows.add(row));
  document.querySelectorAll(`.codex-task-chat[data-codex-task="${selector}"]`).forEach((button) => {
    const row = button.closest("tr");
    if (row) rows.add(row);
  });
  const badge = codexTaskBadgeHtml(badgeState);
  rows.forEach((row) => {
    const cell = row.querySelector("td");
    if (!cell) return;
    cell.querySelectorAll(".codex-task-badge").forEach((node) => node.remove());
    if (!badge) return;
    const title = cell.querySelector(".mini-title");
    if (title) title.insertAdjacentHTML("afterend", badge);
    else {
      const firstHint = cell.querySelector(".cc-hint");
      if (firstHint) firstHint.insertAdjacentHTML("beforebegin", badge);
      else cell.insertAdjacentHTML("beforeend", badge);
    }
  });
}

// 시작 전(open/unclassified=미시작)이면 대화 잠금 — 시작이 스레드를 준비하므로 그 전엔 열 게 없음.
function itemStarted(i) { return !["open", "unclassified"].includes(i?.status); }
function codexTaskButtonHtml(itemId, extraClass = "", started = true) {
  if (!started)
    return `<button class="act-btn codex-task-locked ${extraClass}" disabled title="${esc(state.lex.codex_chat_locked ?? "먼저 '시작'을 누르세요")}">🔒 대화</button>`;
  return `<button class="act-btn codex-task-chat ${extraClass}" data-codex-task="${esc(itemId)}" title="Codex 대화">대화</button>`;
}

function wireTaskCodexButtons(scope) {
  scope.querySelectorAll(".codex-task-chat[data-codex-task]").forEach((b) => {
    if (b.dataset.codexBound === "1") return;
    b.dataset.codexBound = "1";
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openTaskCodex(b.dataset.codexTask);
    });
  });
}

// 위젯 할일 행 — 클릭하면 인라인 빠른편집(상태 변경/할일 이동). data-item 있으면 대시보드 click 위임이 처리.
function itemMiniRow(i, tail = []) {
  (state._itemCache || (state._itemCache = {}))[i.id] = i; // 행 클릭 상세용 캐시 — openItemQuickEdit 의 정보 블록에서 사용(서버 재요청 없이).
  const title = `${i.urgency === "high" ? '<span class="prio-star" title="우선">⭐</span> ' : ""}<span class="mini-title">${esc(i.title)}</span>${codexTaskIndicatorHtml(i)}`;
  const cells = [`<td>${title}</td>`, `<td class="dim">${esc(i.project_id ?? "")}</td>`,
    ...tail.map((c) => `<td class="dim num">${c}</td>`),
    `<td class="mini-actions">${itemActionsHtml(i)}${codexTaskButtonHtml(i.id, "mini", itemStarted(i))}</td>`];
  return `<tr class="wrow" data-item="${esc(i.id)}" data-proj="${esc(i.project_id ?? "")}" data-title="${esc(i.title)}">${cells.join("")}</tr>`;
}
// 활동 이벤트 → 사람이 읽는 변경 설명(한국어). 변경 아닌 잡음(view/LLM/조회)은 호출부에서 제외.
const EVENT_HIDE = new Set(["view", "llm_call", "chat_query", "recommender_run"]);
function eventDesc(e, L) {
  const st = (v) => (v ? (L["status_" + v] ?? v) : "");
  switch (e.kind) {
    case "item_status": return `할일 상태 ${st(e.from_val)} → ${st(e.to_val)}`;
    case "item_create": return `할일 생성: ${e.to_val ?? ""}`;
    case "item_assign": return `담당 지정 → ${e.to_val ?? "(해제)"}`;
    case "item_confirm": return `할일 분류 확정${e.to_val ? ` (${e.to_val})` : ""}`;
    case "item_edit": return `할일 수정: ${e.to_val ?? ""}`;
    case "item_priority": return e.to_val === "high" ? "우선순위 지정 (⭐)" : "우선순위 해제";
    case "item_archive": return `할일 보관(삭제): ${e.to_val ?? ""}${e.note ? ` — 사유: ${e.note}` : ""}`;
    case "item_restore": return `할일 복구: ${e.to_val ?? ""}`;
    case "item_promote": return `메일→할일 승격: ${e.to_val ?? ""}`;
    case "project_create": return `과제 생성: ${e.to_val ?? ""}`;
    case "gate_clear": return `게이트 통과: ${e.to_val ?? ""}${e.note ? ` (${e.note})` : ""}`;
    case "gate_mode_set": return `게이트 모드 → ${e.to_val ?? ""}`;
    case "deliverable_add": return `산출물 추가: ${e.to_val ?? ""}`;
    case "deliverable_due": return "산출물 일정 변경";
    case "deliverable_review": return "산출물 검토단계 변경";
    case "deliverable_input": return "입력파일 등록";
    case "input_upload": return "입력파일 업로드";
    case "input_download": return "입력파일 다운로드";
    case "mail_register": return `메일 등록: ${e.to_val ?? ""}`;
    case "mail_assign": return "메일 과제 분류";
    case "schedule_spawn": return "일정→할일 생성";
    case "anchor_move": return `마일스톤 일정 이동 ${e.to_val ?? ""}`;
    case "account_create": return `계정 생성: ${e.to_val ?? ""}`;
    case "auth_bootstrap": return "첫 관리자 생성";
    case "account_register": return `회원가입: ${e.actor_ref ?? ""}`;
    case "auth_login": return "로그인";
    case "ingest": return "데이터 수집(ingest)";
    case "proposal_approve": return "AI 제안 승인";
    case "proposal_reject": return "AI 제안 반려";
    default: return e.note || e.kind;
  }
}
// 할일 클릭 상세 — 렌더 시 캐시된 항목 객체로 "이게 무슨 할 일인지" 읽기전용 표기(상태/과제/담당/마감/등록/출처/업무유형/완료기준).
function itemDetailBlockHtml(info, L) {
  if (!info) return "";
  const ORIGIN_LABEL = { manual: "직접 추가", mail: "메일", voice: "음성", request: "요청", meeting: "회의", schedule: "일정" };
  const rows = [];
  rows.push(["상태", (info.urgency === "high" ? "⭐ " : "") + esc(info.status ? (L["status_" + info.status] ?? info.status) : "—")]);
  rows.push(["과제", esc(info.project_id ? projDisplay(info.project_id) : "—")]);
  rows.push(["담당", esc(info.assignee_ref || "미배정")]);
  rows.push(["마감", esc(info.due || "없음")]);
  const created = info.created_at ? esc(String(info.created_at).slice(0, 16).replace("T", " ")) : "—";
  rows.push(["등록", created + (info.origin ? ` · ${esc(ORIGIN_LABEL[info.origin] ?? info.origin)}` : "")]);
  if (info.work_type) rows.push(["업무유형", esc(info.work_type)]);
  if (info.guide_artifact_name) rows.push(["산출물", esc(info.guide_artifact_name)]);
  if (info.completion_criteria) rows.push(["완료기준", esc(info.completion_criteria)]);
  const body = rows.map(([k, v]) => `<div style="display:flex;gap:8px"><span class="dim" style="flex:0 0 60px">${k}</span><span style="flex:1;min-width:0;word-break:break-word">${v}</span></div>`).join("");
  return `<div class="qe-info" style="margin:2px 0 10px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);font-size:12px;line-height:1.7">${body}</div>`;
}
// 할일 인라인 빠른편집 — 상태 즉시 변경(거기서 바로 편집) + 할일 화면 이동.
async function openItemQuickEdit(itemId, projectId, title) {
  const L = state.lex;
  const info = state._itemCache?.[itemId] || null; // 클릭 상세 정보 — 목록 렌더 시 캐시됨(itemMiniRow).
  const STATUSES = ["open", "doing", "waiting", "blocked", "done"];
  // 담당자 배정/재배정(#1) — 신규 '내가 잡기'+관리자 재배정 동시. 기존 /api/items/assign 재사용. 나+미배정+팀원(scopes).
  const qeMe = state.account?.display_name || state.account?.username || state.account?.email || "";
  const qeMembers = (state._scopes ?? []).filter((s) => s.id !== "team" && s.label !== qeMe);
  const qeAssignOpts = `<option value="">${L.qe_assign_ph ?? "담당 변경…"}</option>`
    + (qeMe ? `<option value="${esc(qeMe)}">${L.claim_me ?? "나"}</option>` : "")
    + `<option value="__UNASSIGN__">${L.assign_unassigned ?? "미배정"}</option>`
    + qeMembers.map((m) => `<option value="${esc(m.label)}">${esc(m.label)}</option>`).join("");
  // 과제 변경(2026-07-07 owner: AI 과제 오분류 교정) — 담당 변경과 같은 '액션 선택' 방식(현재값 선택 아님).
  let qeProjList = state._projCache;
  if (!qeProjList) { try { qeProjList = (await api("/api/summary")).projects; state._projCache = qeProjList; } catch { qeProjList = []; } }
  const qeProjOpts = `<option value="">${L.qe_project_ph ?? "과제 변경…"}</option>`
    + (qeProjList ?? []).filter((p) => p.class !== "inbox" && p.class !== "archive")
      .map((p) => `<option value="${esc(p.id)}">${esc(p.id)}${p.title ? " " + esc(String(p.title).slice(0, 14)) : ""}</option>`).join("");
  document.querySelector(".ui-confirm-overlay")?.remove();
  const ov = document.createElement("div");
  ov.className = "ui-confirm-overlay";
  ov.innerHTML = `<div class="ui-confirm qedit" role="dialog" aria-label="${esc(title ?? "")}" style="width:min(760px,94vw);max-width:none;max-height:90vh;overflow-y:auto;text-align:left">
    <div class="qe-title-row" style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
      <input class="qe-title login-input" value="${esc(info?.title ?? title ?? "")}" style="flex:1;font-weight:600;font-size:15px" title="${L.qe_title_hint ?? "할일 이름 — 메일 제목이 아니라 '무엇을 할지'로 고쳐 쓰세요"}" />
      <button class="qe-title-save fav-chip mini" title="${L.qe_title_save_hint ?? "할일 이름 저장"}">${L.qe_title_save ?? "이름 저장"}</button>
    </div>
    ${itemDetailBlockHtml(info, L)}
    ${info?.origin_mail_id ? `<details class="qe-mail" open style="margin:0 0 8px"><summary class="dim mini" style="cursor:pointer">${L.qe_mail_head ?? "원본 메일 내용 (해석이 맞는지 확인)"}</summary><div class="qe-mail-body" id="qeMailBody" style="margin-top:6px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg)"><span class="dim mini">${L.qe_mail_loading ?? "불러오는 중…"}</span></div></details>` : ""}
    <div class="qe-status" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
      ${STATUSES.map((s) => `<button class="fav-chip qe-st" data-st="${s}">${L["status_" + s] ?? s}</button>`).join("")}
    </div>
    <div class="qe-prio" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
      <button class="fav-chip qe-pr" data-pr="high">${L.prio_set ?? "⭐ 우선"}</button>
      <button class="fav-chip qe-pr" data-pr="normal">${L.prio_unset ?? "우선 해제"}</button>
    </div>
    <div class="qe-assign-row" style="display:flex;gap:6px;margin-bottom:8px">
      <select class="qe-assign" style="flex:1">${qeAssignOpts}</select>
    </div>
    <div class="qe-project-row" style="display:flex;gap:6px;margin-bottom:8px">
      <select class="qe-project" style="flex:1" title="${L.qe_project_hint ?? "과제가 잘못 분류됐으면 여기서 바꾸세요"}">${qeProjOpts}</select>
    </div>
    <div class="qe-msg dim mini" style="min-height:1em"></div>
    <div class="ui-confirm-btns">
      <button class="ui-confirm-cancel">${L.btn_cancel}</button>
      <button class="qe-goto fav-chip">${L.w_goto ?? "할일 화면으로"}</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  let changed = false; // 팝업 안에서 인플레이스로 바꾼 게 있으면 닫을 때 목록 재그림.
  const close = () => { ov.remove(); if (changed) render(); };
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector(".ui-confirm-cancel").addEventListener("click", close);
  // 할일 이름 저장 — 메일 제목이 아니라 '할 일'로 고쳐 쓰게. 닫지 않고 인플레이스(원본 메일을 보며 확인·수정).
  const saveTitle = async () => {
    const t = ov.querySelector(".qe-title").value.trim();
    if (!t) { ov.querySelector(".qe-msg").textContent = L.qe_title_empty ?? "할일 이름을 입력하세요"; return; }
    const r = await post("/api/items/update", { id: itemId, title: t });
    if (r.ok) { if (info) info.title = t; changed = true; ov.querySelector(".qe-msg").textContent = L.qe_title_saved ?? "이름 저장됨"; }
    else { const e = await r.json().catch(() => ({})); ov.querySelector(".qe-msg").textContent = e.error || "오류"; }
  };
  ov.querySelector(".qe-title-save")?.addEventListener("click", saveTitle);
  ov.querySelector(".qe-title")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveTitle(); } });
  // 과제 변경 — 담당 변경과 같은 액션 select. 메일 유래 할일이면 서버가 원본 메일도 함께 이동.
  ov.querySelector(".qe-project")?.addEventListener("change", async (e) => {
    const pid = e.target.value; if (!pid) return;
    const r = await post("/api/items/project", { id: itemId, project_id: pid });
    if (r.ok) { toast(L.qe_project_moved ?? "과제를 변경했습니다", "ok"); close(); render(); }
    else { const er = await r.json().catch(() => ({})); ov.querySelector(".qe-msg").textContent = er.error || (L.qe_project_move_fail ?? "과제 변경 실패"); }
  });
  // 원본 메일 내용 로드(있으면) — AI 가 메일을 오해석해 엉뚱한 할일이 됐는지 사람이 대조. 본문은 esc 로 무해화.
  if (info?.origin_mail_id) {
    const mbox = ov.querySelector("#qeMailBody");
    api("/api/mail/detail?id=" + encodeURIComponent(info.origin_mail_id), { acceptedDomainStatuses: [403, 404] }).then((m) => {
      if (m?.error) throw new Error(m.error);
      if (!mbox) return;
      const bodyText = String(m.body_text || m.body_preview || "").trim();
      const head = `<div class="dim mini" style="margin-bottom:4px">${esc(m.counterpart || "")}${m.at ? " · " + esc(String(m.at).slice(0, 16).replace("T", " ")) : ""}</div>`;
      const subj = m.subject ? `<div style="font-weight:600;margin-bottom:4px;word-break:break-word">${esc(m.subject)}</div>` : "";
      const body = bodyText
        ? `<div style="white-space:pre-wrap;max-height:360px;overflow:auto;font-size:13px;line-height:1.65">${esc(bodyText)}</div>`
        : `<span class="dim mini">${L.qe_mail_body_empty ?? "본문이 저장되지 않은 메일입니다(제목·발신자만)"}</span>`;
      mbox.innerHTML = head + subj + body;
    }).catch(() => { if (mbox) mbox.innerHTML = `<span class="dim mini">${L.qe_mail_none ?? "메일을 불러오지 못했습니다"}</span>`; });
  }
  ov.querySelectorAll(".qe-st").forEach((b) => b.addEventListener("click", async () => {
    const r = await post("/api/items/status", { id: itemId, status: b.dataset.st });
    if (r.ok) { close(); render(); }
    else { const e = await r.json().catch(() => ({})); ov.querySelector(".qe-msg").textContent = e.error || "오류"; }
  }));
  ov.querySelectorAll(".qe-pr").forEach((b) => b.addEventListener("click", async () => {
    const r = await post("/api/items/priority", { id: itemId, urgency: b.dataset.pr }); // ⭐ 우선(high) / 해제(normal)
    if (r.ok) { close(); render(); }
    else { const e = await r.json().catch(() => ({})); ov.querySelector(".qe-msg").textContent = e.error || "오류"; }
  }));
  ov.querySelector(".qe-assign")?.addEventListener("change", async (e) => {
    const v = e.target.value; if (!v) return;
    const who = v === "__UNASSIGN__" ? "" : v; // 나/팀원 → 그 사람, 미배정 → 빈값(해제)
    const r = await post("/api/items/assign", { id: itemId, assignee_ref: who });
    if (r.ok) { close(); render(); }
    else { const er = await r.json().catch(() => ({})); ov.querySelector(".qe-msg").textContent = er.error || "오류"; }
  });
  ov.querySelector(".qe-goto").addEventListener("click", () => {
    close(); state.projectFilter = projectId || ""; state.statusFilter = ""; state.view = "items"; render();
  });
}

// 연락처 마스터 화면(mod:contacts). 거래처/과제 링크·필터. 메타 전용.
// 지식 화면(mod:knowledge) — 2026-07-04 owner: 서가 현황(무엇이/언제/얼마나) + 위키 본문 +
// 줄기(project_context) 그래프 + 기존 FAQ·매뉴얼 관리 4탭. 서가·그래프는 메타 전용, 위키 본문은
// owner 승인 예외(로그인 팀 한정).
async function renderKnowledge() {
  const L = state.lex;
  const tab = state.knowTab ?? "shelf";
  const tabs = [["shelf", L.know_tab_shelf], ["wiki", L.know_tab_wiki], ["trunk", L.know_tab_trunk], ["faq", L.know_tab_faq]]
    .map(([k, label]) => `<button class="fav-chip mini know-tab ${tab === k ? "on" : ""}" data-tab="${k}">${esc(label)}</button>`).join(" ");
  const shell = `<div class="item-form" style="gap:6px">${tabs}
    <span style="flex:1"></span>
    <button class="fav-chip mini" id="knowGraph3d">${L.know_open_3d}</button></div><div id="knowBody"></div>`;
  $("#view").innerHTML = shell;
  $("#view").querySelectorAll(".know-tab").forEach((b) => b.addEventListener("click", () => { state.knowTab = b.dataset.tab; render(); }));
  $("#knowGraph3d").addEventListener("click", () => window.open("/knowledge-graph/knowledge_graph_v0/graph_preview.html", "_blank"));
  const body = $("#knowBody");
  if (tab === "shelf") return renderKnowShelf(body);
  if (tab === "wiki") return renderKnowWiki(body);
  if (tab === "trunk") return renderKnowTrunk(body);
  return renderKnowFaq(body);
}

// overview 는 서버 풀스캔이라 탭 전환마다 재요청하지 않는다 — 세션 캐시(서버도 60s TTL memo).
async function knowOverview() {
  if (!state._knowOverview) state._knowOverview = api("/api/knowledge/overview").catch(() => null);
  return state._knowOverview;
}

// 탭1: 서가 현황 — 계층(공통/도메인/과제) + 자산 총량 + 수집 타임스탬프 + 사용 rollup(공백 정직 표기)
async function renderKnowShelf(el) {
  const L = state.lex;
  el.innerHTML = `<div class="empty small">…</div>`;
  const o = await knowOverview();
  if (!o) { el.innerHTML = `<div class="empty">-</div>`; return; }
  const approx = o.shelves_truncated ? "≈" : "";
  const fmtT = (ms) => ms ? localTime(new Date(ms).toISOString()) : "-";
  const shelfRows = (list) => (list || []).map((s) => `<tr><td>${esc(s.key)}</td><td class="num">${s.truncated ? "≈" : ""}${s.file_count}</td><td class="dim">${fmtT(s.latest_mtime_ms)}</td></tr>`).join("");
  const projRows = (o.projects || []).map((p) => `<tr>
    <td><strong>${esc(p.project)}</strong></td>
    <td class="num">${p.bookshelf_total ?? "-"}</td>
    <td class="num">${p.wiki_pages}</td>
    <td class="num">${p.ingest_receipts}</td>
    <td class="dim">${p.last_ingest_at ? localTime(p.last_ingest_at) : "-"}</td>
    <td class="num">${p.candidates}</td>
  </tr>`).join("");
  const u = o.usage || {};
  const typeChips = Object.entries(u.by_access_type || {}).map(([t, n]) => `<span class="fav-chip mini">${esc(t)} ${n}</span>`).join(" ");
  const topRefs = (u.top_refs || []).map((r) => `<div class="dim small">· ${esc(r.ref)} — ${r.n}회</div>`).join("");
  el.innerHTML = `
    <div class="hub-grid">
      <section><h4 class="hub-h4">${L.know_shelf_common}</h4>
        <table><thead><tr><th>${L.know_col_area}</th><th>${L.know_col_files}</th><th>${L.know_col_latest}</th></tr></thead><tbody>${shelfRows(o.shelves?.common) || ""}</tbody></table></section>
      <section><h4 class="hub-h4">${L.know_shelf_domain}</h4>
        <table><thead><tr><th>${L.know_col_area}</th><th>${L.know_col_files}</th><th>${L.know_col_latest}</th></tr></thead><tbody>${shelfRows(o.shelves?.domain) || ""}</tbody></table></section>
    </div>
    <h4 class="hub-h4">${L.know_shelf_project}</h4>
    ${(o.projects || []).length ? `<table><thead><tr><th>${L.know_col_project}</th><th>${L.know_col_bookshelf}</th><th>${L.know_tab_wiki}</th><th>${L.know_col_ingests}</th><th>${L.know_col_last_ingest}</th><th>${L.know_col_candidates}</th></tr></thead><tbody>${projRows}</tbody></table>` : `<div class="empty small">-</div>`}
    ${approx ? `<div class="dim small">${L.know_shelf_approx}</div>` : ""}
    <h4 class="hub-h4">${L.know_assets}</h4>
    <div><span class="fav-chip mini">source card ${o.assets?.source_cards ?? 0}</span>
      <span class="fav-chip mini">text index ${o.assets?.source_text_indexes ?? 0}</span></div>
    <h4 class="hub-h4">${L.know_usage}</h4>
    <div class="dim small">${L.know_usage_total}: ${u.total_events ?? 0} · ${L.know_usage_last}: ${u.last_access_at ? localTime(u.last_access_at) : "-"}</div>
    <div style="margin:4px 0">${typeChips || ""}</div>${topRefs}
    ${u.auto_capture_wired === false ? `<div class="empty small">${L.know_usage_unwired}</div>` : ""}`;
}

// 탭2: 위키 — 목록 + 본문 뷰어(owner 승인 예외, 로그인 필요)
async function renderKnowWiki(el) {
  const L = state.lex;
  el.innerHTML = `<div class="empty small">…</div>`;
  const o = await knowOverview();
  const pages = o?.wiki_pages ?? [];
  const rows = pages.map((p) => `<tr class="wiki-row" data-ref="${esc(p.ref)}" style="cursor:pointer">
    <td><strong>${esc(p.title)}</strong></td><td>${esc(p.project ?? "공통")}</td>
    <td class="dim">${p.mtime_ms ? localTime(new Date(p.mtime_ms).toISOString()) : "-"}</td>
    <td class="num dim">${Math.round((p.size_bytes ?? 0) / 1024)}KB</td></tr>`).join("");
  el.innerHTML = `
    ${pages.length ? `<table><thead><tr><th>${L.know_wiki_title}</th><th>${L.know_col_project}</th><th>${L.know_col_latest}</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">${L.know_wiki_empty}</div>`}
    <div id="wikiBody"></div>`;
  el.querySelectorAll(".wiki-row").forEach((tr) => tr.addEventListener("click", async () => {
    const box = $("#wikiBody");
    box.innerHTML = `<div class="empty small">…</div>`;
    const r = await api(`/api/knowledge/wiki/page?ref=${encodeURIComponent(tr.dataset.ref)}`, { acceptedDomainStatuses: [400] }).catch(() => null);
    if (!r || r.error) { box.innerHTML = `<div class="empty small">${esc(r?.error ?? L.know_wiki_login)}</div>`; return; }
    box.innerHTML = `<section class="calc-card" style="margin-top:10px"><h4 class="hub-h4">${esc(r.title)} <span class="dim small">(${esc(r.ref)})</span></h4>
      <div style="white-space:pre-wrap;font-size:13px;line-height:1.55;max-height:60vh;overflow-y:auto">${esc(r.body)}</div></section>`;
    box.scrollIntoView({ behavior: "smooth" });
  }));
}

// 탭3: 줄기 그래프 — 시간축 강줄기 SVG + 목록/우선순위/진단/일일 생명수, 가지 클릭→이야기.
async function renderKnowTrunk(el) {
  const L = state.lex;
  el.innerHTML = `<div class="empty small">…</div>`;
  const pj = await api("/api/context/projects").catch(() => null);
  if (!pj || pj.error) { el.innerHTML = `<div class="empty">${L.know_wiki_login}</div>`; return; }
  const projects = pj.projects ?? [];
  if (!projects.length) { el.innerHTML = `<div class="empty">${L.trunk_empty}</div>`; return; }
  const cur = projects.includes(state._ctxProject) ? state._ctxProject : projects[0];
  state._ctxProject = cur;
  const g = await api(`/api/context/graph?project=${encodeURIComponent(cur)}`, { acceptedDomainStatuses: [400] }).catch(() => null);
  const sel = `<select id="ctxProj">${projects.map((p) => `<option ${p === cur ? "selected" : ""}>${esc(p)}</option>`).join("")}</select>`;
  if (!g || g.error) { el.innerHTML = `<div class="item-form">${sel}</div><div class="empty">${esc(g?.error ?? "-")}</div>`; $("#ctxProj").addEventListener("change", (e) => { state._ctxProject = e.target.value; render(); }); return; }
  return drawTrunkGraph(el, g, {
    headerHtml: sel,
    afterRender: () => $("#ctxProj").addEventListener("change", (e) => { state._ctxProject = e.target.value; render(); }),
  });
}

// 과제 허브 '줄기' 탭(2026-07-05 owner: 줄기는 과제 안에서 바로) — 고정 과제, 드롭다운 없음.
// 데이터가 아직 없으면(엔진 E9 전) 정직한 빈 상태를 보여준다.
async function hubTrunk(mount, p) {
  const L = state.lex;
  mount.innerHTML = `<div class="empty small">…</div>`;
  const g = await api(`/api/context/graph?project=${encodeURIComponent(p.id)}`, { acceptedDomainStatuses: [400] }).catch(() => null);
  if (!g || g.error) {
    const msg = g?.error === "context_not_found" ? (L.trunk_none_hub ?? "이 과제의 줄기 데이터가 아직 없습니다")
      : g?.error === "login_required" ? L.know_wiki_login : (g?.error ?? "-");
    mount.innerHTML = `<div class="empty">${esc(msg)}</div>`;
    return;
  }
  drawTrunkGraph(mount, g);
}

// 줄기 노드 종류 라벨(사전 경유). 표시 대상 = leaf 4종만. 구조 타입(project_trunk·context_branch)은
// null 반환 → 범례에서 제외(내부 식별자 노출 방지, context_branch 는 가지 수 중복이라 정보가치도 0).
function trunkTypeLabel(t) {
  const L = state.lex;
  return ({ source_event: L.trunk_type_event, task_candidate: L.trunk_type_task, milestone: L.trunk_type_milestone, actor: L.trunk_type_actor }[t]) ?? null;
}
// 한 가지의 하위(이벤트·할일 후보) 최신순 — 지도/목록/우선순위 3뷰 공용(DRY).
function trunkBranchChildren(g, key, cap = 40) {
  const kids = (g.nodes ?? []).filter((x) => x.branch_key === key && x.type !== "context_branch")
    .sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  const shown = kids.slice(0, cap);
  const rows = shown.map((k) => `<tr><td class="dim">${esc(trunkTypeLabel(k.type) ?? k.type)}</td><td>${esc(k.label ?? "")}</td><td class="dim">${esc(k.status ?? "")}</td><td class="dim">${k.updated_at ? localTime(k.updated_at) : "-"}</td></tr>`).join("");
  return { rows, hidden: kids.length - shown.length, count: kids.length };
}
function trunkChildTable(g, key) {
  const L = state.lex; const ch = trunkBranchChildren(g, key);
  if (!ch.count) return `<div class="empty small">-</div>`;
  return `<table><thead><tr><th>${L.trunk_col_type}</th><th>${L.trunk_col_label}</th><th>${L.th_status}</th><th>${L.th_time}</th></tr></thead><tbody>${ch.rows}</tbody></table>${ch.hidden > 0 ? `<div class="dim small">… ${(L.trunk_more ?? "+{n}개 더").replace("{n}", ch.hidden)}</div>` : ""}`;
}
// B9a §3 가지 이야기 3단(기원/경로/종결) — 지도 렌즈 전용. 목록·우선순위 렌즈는 trunkChildTable 유지.
function trunkStoryHtml(story, L) {
  const dirMark = (p) => (p.direction === "out" ? (L.trunk_story_sent ?? "→보냄") : p.direction === "in" ? (L.trunk_story_received ?? "←받음") : "");
  const when = (v) => (v ? esc(String(v).slice(0, 16).replace("T", " ")) : "-");
  const who = (p) => p.counterpart ?? p.actor ?? "";
  const o = story.origin;
  const originHtml = o
    ? `<div class="small" style="margin:4px 0"><b>${esc(L.trunk_story_origin ?? "기원")}</b> · ${when(o.at)} · ${esc(who(o))} — ${esc(String(o.title ?? "").slice(0, 90))}</div>`
    : "";
  const rows = (story.path ?? []).map((p) =>
    `<tr><td class="dim num">${when(p.at)}</td><td>${esc(dirMark(p))}${String(p.kind ?? "").startsWith("event:") ? `<span class="badge">${esc(p.kind.slice(6))}</span>` : ""}</td><td class="dim">${esc(String(who(p)).slice(0, 24))}</td><td>${esc(String(p.title ?? "").slice(0, 80))}</td></tr>`).join("");
  const trunc = story.counts?.truncated
    ? `<div class="dim small">${L.trunk_story_truncated ?? "…일부만 표시"} (${story.counts.shown}/${story.counts.points})</div>` : "";
  const c = story.closure ?? {};
  const closeHtml = c.done
    ? `<div class="small" style="margin:4px 0"><b>${esc(L.trunk_story_end ?? "종결")}</b> · ${when(c.done_at)}${c.completed_by ? ` · ${esc(c.completed_by)}` : ""}${(c.deliverables ?? []).length ? ` · ${esc(L.trunk_story_deliverables ?? "산출물")}: ${c.deliverables.map((d) => esc(d.name)).join(", ")}` : ""}</div>`
    : `<div class="small" style="margin:4px 0"><b>${esc(L.trunk_story_open ?? "열려 있음")}</b> · ${esc(L.trunk_story_last ?? "마지막 움직임")} ${when(c.last_activity_at)}</div>`;
  return `${originHtml}<table class="small"><tbody>${rows || `<tr><td class="dim">${L.trunk_story_empty ?? "기록 점 없음"}</td></tr>`}</tbody></table>${trunc}${closeHtml}`;
}

// 공용 줄기 렌더러 — 5렌즈(시간축 지도 / 목록 / 우선순위 / 모양 진단 / 일일 생명수), 각 뷰는 결정 하나에 대응.
// 지식 탭(전역 탐색, 드롭다운 header)과 과제 허브(고정 과제) 겸용. 앞의 4렌즈는 g로 파생하고 일일 생명수만 선택 시 읽기 전용 API를 부른다.
function drawTrunkGraph(el, g, { headerHtml = "", afterRender = null } = {}) {
  const L = state.lex;
  const view = ["map", "tree", "triage", "diagnostics", "life"].includes(state.trunkView) ? state.trunkView : "map";
  state.trunkView = view;
  const c = g.counts ?? {};
  // 중요도(소스+할일+미결) 순 정렬 — 전 뷰 공용 랭킹.
  const ranked = (g.branches ?? []).slice().sort((a, b) =>
    (b.source_count + b.task_count + b.open_review_count) - (a.source_count + a.task_count + a.open_review_count));
  // 줄기 v2(STEM-V2-ONTOLOGY): v2 가지(골격/작업/이력)가 있으면 legacy(구 제목 클러스터)는 기본 숨김 —
  // 지도가 '업무 단위'로 읽히게. 옛 가지는 토글로만 노출(소급 대조용).
  const hasV2 = ranked.some((b) => ["work", "history"].includes(trunkKindOf(b)));
  const legacyCount = ranked.filter((b) => trunkKindOf(b) === "legacy").length;
  const showLegacy = !hasV2 || !!state.trunkShowLegacy;
  const visible = showLegacy ? ranked : ranked.filter((b) => trunkKindOf(b) !== "legacy");
  const legend = Object.entries(c.by_node_type ?? {})
    .map(([t, n]) => [trunkTypeLabel(t), n]).filter(([label]) => label) // 표시 leaf 4종만(구조 타입 제외)
    .map(([label, n]) => `<span class="fav-chip mini">${esc(label)} ${n}</span>`).join(" ");
  const kindLegend = hasV2 ? [["skeleton", L.trunk_kind_skeleton], ["work", L.trunk_kind_work], ["history", L.trunk_kind_history]]
    .map(([k, label]) => `<span class="fav-chip mini"><span class="trunk-dot" style="background:${TRUNK_KIND_STYLE[k].fill}"></span>${esc(label)} ${visible.filter((b) => trunkKindOf(b) === k).length}</span>`).join(" ") : "";
  const legacyToggle = hasV2 && legacyCount
    ? `<button id="trunkLegacyToggle" class="fav-chip mini ${state.trunkShowLegacy ? "on" : ""}">${state.trunkShowLegacy ? esc(L.trunk_legacy_hide) : esc(String(L.trunk_legacy_show ?? "").replace("{n}", legacyCount))}</button>` : "";
  const views = [["map", L.trunk_view_map], ["tree", L.trunk_view_tree], ["triage", L.trunk_view_triage], ["diagnostics", L.trunk_view_diagnostics], ["life", L.trunk_view_life]];
  const switcher = views.map(([k, label]) => `<button class="fav-chip mini trunk-view ${view === k ? "on" : ""}" data-tv="${k}" aria-pressed="${view === k}">${esc(label)}</button>`).join(" ");
  el.innerHTML = `
    <div class="item-form">${headerHtml}
      <span class="fav-chip mini danger-text">${L.trunk_open_reviews}: ${c.open_reviews ?? 0}</span>
      <span style="flex:1"></span>${switcher}</div>
    <div class="dim small" style="margin:2px 0 6px">${kindLegend}${kindLegend ? " · " : ""}${legend} ${legacyToggle}</div>
    ${hasV2 ? `<div class="dim small" style="margin:0 0 6px">${esc(L.trunk_legend_hint)} · ${esc(L.trunk_drag_hint)}</div>` : ""}
    <div id="trunkBody"></div>`;
  if (afterRender) afterRender();
  const body = $("#trunkBody");
  const paint = () => {
    if (state.trunkView === "tree") return drawTrunkTree(body, g, visible);
    if (state.trunkView === "triage") return drawTrunkTriage(body, g, visible);
    if (state.trunkView === "diagnostics") return drawTrunkDiagnostics(body, g);
    if (state.trunkView === "life") return drawTrunkLifeTree(body, g);
    return drawTrunkMap(body, g, visible);
  };
  el.querySelectorAll(".trunk-view").forEach((b) => b.addEventListener("click", () => {
    state.trunkView = b.dataset.tv;
    el.querySelectorAll(".trunk-view").forEach((x) => {
      const on = x.dataset.tv === state.trunkView;
      x.classList.toggle("on", on);
      x.setAttribute("aria-pressed", String(on));
    });
    paint();
  }));
  $("#trunkLegacyToggle")?.addEventListener("click", () => {
    state.trunkShowLegacy = !state.trunkShowLegacy;
    drawTrunkGraph(el, g, { headerHtml, afterRender });
  });
  paint();
}

// ENGINE-12 일일 생명수 — source truth를 건드리지 않고 과제→날짜→확정 맥락/확인 필요→사건을 읽는 다섯 번째 렌즈.
// API는 이 렌즈가 선택된 뒤에만 호출하고, exact ref + confirmed marker가 둘 다 있을 때만 기존 상세 행동을 연다.
const LIFE_TREE_SCHEMA = "dev_erp.context_life_tree.v1";
const LIFE_TREE_ACTUAL_ROLES = Object.freeze(["occurred", "observed", "state_change"]);
const LIFE_TREE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIFE_TREE_CACHE_TTL_MS = 60_000;

function lifeTreePayloadProjectId(payload, fallback = "") {
  const value = payload?.project_id ?? (payload?.project && typeof payload.project === "object" ? payload.project.id : payload?.project) ?? fallback;
  return String(value ?? "");
}

// 백엔드 이행 중의 flat events+context_nodes와 정본 nested contexts+events 둘 다를 표시 모델로 정규화한다.
// 표시에 필요한 allowlist 필드만 복사하며 raw payload/source body를 보관·표시하지 않는다.
function normalizeLifeTreePayload(payload, project) {
  const list = (v) => Array.isArray(v) ? v : [];
  const text = (v) => v == null ? "" : String(v);
  const numberOf = (v) => v != null && Number.isFinite(Number(v)) ? Number(v) : null;
  const reasonsOf = (v) => list(v).filter((x) => typeof x === "string" && x.trim()).slice(0, 8);
  const dayKeyOf = (v) => {
    const key = text(v);
    if (!LIFE_TREE_DATE_RE.test(key)) return "undated";
    const probe = new Date(`${key}T00:00:00Z`);
    return Number.isFinite(probe.getTime()) && probe.toISOString().slice(0, 10) === key ? key : "undated";
  };
  const uncertaintyOf = (v, fallback = null) => {
    if (v && typeof v === "object" && !Array.isArray(v)) return {
      context: text(v.context || v.state || fallback) || null,
      time: text(v.time) || null,
      reasons: reasonsOf(v.reasons),
    };
    return { context: text(v || fallback) || null, time: null, reasons: [] };
  };
  const taskLinkOf = (v) => v && typeof v === "object" && !Array.isArray(v) ? {
    ref: text(v.ref), item_id: text(v.item_id || v.task_id),
    link_state: text(v.link_state || v.binding_state), label: text(v.label),
  } : null;
  const contextLinkOf = (v) => v && typeof v === "object" && !Array.isArray(v) ? {
    ref: text(v.ref || v.branch_ref), branch_key: text(v.branch_key),
    link_state: text(v.link_state || v.binding_state), label: text(v.label),
  } : null;
  const eventOf = (v, fallbackId, fallbackDay = null) => {
    const raw = v && typeof v === "object" && !Array.isArray(v) ? v : {};
    const projectBinding = raw.project_binding && typeof raw.project_binding === "object"
      ? text(raw.project_binding.state || raw.project_binding.binding_state)
      : text(raw.project_binding);
    const uncertainty = uncertaintyOf(raw.uncertainty, projectBinding || null);
    return {
      event_id: text(raw.event_id || raw.id || raw.ref || fallbackId),
      lane_id: text(raw.lane_id || raw.lane) || "unknown",
      kind: text(raw.kind), summary_label: text(raw.summary_label || raw.title),
      temporal_role: text(raw.temporal_role), display_at: text(raw.display_at),
      day_key: dayKeyOf(raw.day_key || raw.day || fallbackDay),
      time_basis: text(raw.time_basis), time_state: text(raw.time_state || raw.state || uncertainty.time),
      project_binding: projectBinding || uncertainty.context || null,
      task_links: list(raw.task_links).map(taskLinkOf).filter(Boolean),
      context_links: list(raw.context_links).map(contextLinkOf).filter(Boolean),
      uncertainty: {
        ...uncertainty,
        reasons: [...new Set([...uncertainty.reasons, ...reasonsOf(raw.reasons), ...reasonsOf(raw.evidence_gaps), text(raw.gap_reason)].filter(Boolean))].slice(0, 8),
      },
    };
  };

  const laneById = new Map();
  const addLane = (v) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return;
    const laneId = text(v.lane_id || v.lane || v.id);
    if (!laneId) return;
    const old = laneById.get(laneId) || {};
    const cv = v.coverage && typeof v.coverage === "object" && !Array.isArray(v.coverage)
      ? v.coverage : (v.coverage != null && Number.isFinite(Number(v.coverage)) ? { events: Number(v.coverage) } : {});
    laneById.set(laneId, {
      lane_id: laneId, label: text(v.label) || old.label || laneId,
      status: text(v.status) || old.status || "available",
      coverage: {
        scanned: numberOf(cv.scanned) ?? old.coverage?.scanned ?? null,
        accepted: numberOf(cv.accepted) ?? old.coverage?.accepted ?? null,
        events: numberOf(cv.events ?? cv.shown) ?? old.coverage?.events ?? null,
        skipped: numberOf(cv.skipped) ?? old.coverage?.skipped ?? null,
        undated: numberOf(cv.undated) ?? old.coverage?.undated ?? null,
        cap: numberOf(cv.cap) ?? old.coverage?.cap ?? null,
        truncated: Boolean(cv.truncated ?? old.coverage?.truncated),
        scope_limited: Boolean(cv.scope_limited ?? old.coverage?.scope_limited),
        scope_withheld_reasons: reasonsOf(cv.scope_withheld_reasons ?? old.coverage?.scope_withheld_reasons),
      },
      gap_reason: text(v.gap_reason) || old.gap_reason || null,
    });
  };
  list(payload?.lane_catalog).forEach(addLane);
  list(payload?.lanes).forEach(addLane);
  for (const laneId of list(payload?.coverage?.gap_lane_ids).map(text).filter(Boolean)) {
    if (!laneById.has(laneId)) addLane({ lane_id: laneId, status: "gap" });
  }

  const topEvents = list(payload?.events).map((e, i) => eventOf(e, `flat:${i}`));
  const eventById = new Map(topEvents.map((e) => [e.event_id, e]));
  const usedEventIds = new Set();
  const missingEventIds = new Set();
  const dayByKey = new Map();
  const ensureDay = (rawKey) => {
    const key = dayKeyOf(rawKey);
    if (!dayByKey.has(key)) dayByKey.set(key, { day_key: key, state: key === "undated" ? "undated" : "dated", contexts: [] });
    return dayByKey.get(key);
  };
  const rawDays = list(payload?.days);
  rawDays.forEach((rawDay, dayIndex) => {
    const day = ensureDay(rawDay?.day_key || rawDay?.day);
    const directIds = new Set(list(rawDay?.event_ids).map(text).filter(Boolean));
    const contextRows = list(rawDay?.contexts).length ? list(rawDay.contexts) : list(rawDay?.context_nodes);
    contextRows.forEach((rawContext, contextIndex) => {
      const nested = list(rawContext?.events).map((rawEvent, eventIndex) => {
        const candidateId = text(rawEvent?.event_id || rawEvent?.id || rawEvent?.ref);
        const event = (candidateId && eventById.get(candidateId)) || eventOf(rawEvent, `nested:${dayIndex}:${contextIndex}:${eventIndex}`, day.day_key);
        if (!eventById.has(event.event_id)) eventById.set(event.event_id, event);
        return event;
      });
      const linked = list(rawContext?.event_ids).map((id) => {
        const key = text(id); const event = eventById.get(key);
        if (key && !event) missingEventIds.add(key);
        return event;
      }).filter(Boolean);
      const events = nested.length ? nested : linked;
      for (const event of events) { usedEventIds.add(event.event_id); directIds.delete(event.event_id); }
      day.contexts.push({
        context_ref: text(rawContext?.context_ref || rawContext?.node_id || rawContext?.branch_ref) || null,
        branch_key: text(rawContext?.branch_key) || null,
        label: text(rawContext?.label),
        binding_state: text(rawContext?.binding_state || rawContext?.state) || "review_needed",
        reasons: [...new Set([...reasonsOf(rawContext?.reasons), text(rawContext?.gap_reason)].filter(Boolean))].slice(0, 8),
        events,
      });
    });
    const directEvents = [
      ...list(rawDay?.events).map((rawEvent, eventIndex) => {
        const candidateId = text(rawEvent?.event_id || rawEvent?.id || rawEvent?.ref);
        return (candidateId && eventById.get(candidateId)) || eventOf(rawEvent, `day:${dayIndex}:${eventIndex}`, day.day_key);
      }),
      ...[...directIds].map((id) => {
        const event = eventById.get(id);
        if (id && !event) missingEventIds.add(id);
        return event;
      }).filter(Boolean),
    ].filter((event) => !usedEventIds.has(event.event_id));
    if (directEvents.length) {
      directEvents.forEach((event) => usedEventIds.add(event.event_id));
      day.contexts.push({ context_ref: null, branch_key: null, label: "", binding_state: "review_needed", reasons: [], events: directEvents });
    }
  });
  for (const event of topEvents) {
    if (usedEventIds.has(event.event_id)) continue;
    ensureDay(event.day_key).contexts.push({ context_ref: null, branch_key: null, label: "", binding_state: "review_needed", reasons: [], events: [event] });
    usedEventIds.add(event.event_id);
  }

  const days = [...dayByKey.values()].sort((a, b) => {
    if (a.day_key === "undated") return b.day_key === "undated" ? 0 : 1;
    if (b.day_key === "undated") return -1;
    return b.day_key.localeCompare(a.day_key);
  });
  const derivedUndatedCount = (dayByKey.get("undated")?.contexts ?? [])
    .reduce((count, context) => count + (context.events?.length ?? 0), 0);
  return {
    schema: text(payload?.schema), project: lifeTreePayloadProjectId(payload, project), timezone: text(payload?.timezone || payload?.query?.timezone || "Asia/Seoul"),
    lanes: [...laneById.values()], days,
    coverage: payload?.coverage && typeof payload.coverage === "object" && !Array.isArray(payload.coverage) ? {
      truncated: Boolean(payload.coverage.truncated),
      gap_lane_ids: list(payload.coverage.gap_lane_ids).map(text).filter(Boolean),
      scanned: numberOf(payload.coverage.scanned ?? payload.counts?.scanned),
      accepted: numberOf(payload.coverage.accepted ?? payload.counts?.accepted),
      shown: numberOf(payload.coverage.shown ?? payload.counts?.events),
      undated_count: numberOf(payload.coverage.undated_count) ?? derivedUndatedCount,
      projection_gap_count: missingEventIds.size,
      scope_limited: Boolean(payload.coverage.scope_limited),
      scope_withheld_lane_ids: list(payload.coverage.scope_withheld_lane_ids).map(text).filter(Boolean),
    } : {
      truncated: false, gap_lane_ids: [], scanned: numberOf(payload?.counts?.scanned), accepted: numberOf(payload?.counts?.accepted),
      shown: numberOf(payload?.counts?.events), undated_count: derivedUndatedCount, projection_gap_count: missingEventIds.size,
      scope_limited: false, scope_withheld_lane_ids: [],
    },
  };
}

function lifeTreeProjectState(project) {
  if (!(state._lifeTreeProjects instanceof Map)) state._lifeTreeProjects = new Map();
  if (!state._lifeTreeProjects.has(project)) state._lifeTreeProjects.set(project, {
    days: 30, showPlanned: false, selectedLanes: null, knownLanes: [],
  });
  return state._lifeTreeProjects.get(project);
}

function lifeTreeCacheKey(project, config) {
  const lanes = config.selectedLanes instanceof Set ? [...config.selectedLanes].sort().join(",") : "*";
  const roles = [...LIFE_TREE_ACTUAL_ROLES, ...(config.showPlanned ? ["planned"] : [])].join(",");
  return `${project}|${config.days}|${lanes}|${roles}`;
}

function lifeTreeRequestPath(project, config) {
  const q = new URLSearchParams({
    project, days: String(config.days),
    temporal_roles: [...LIFE_TREE_ACTUAL_ROLES, ...(config.showPlanned ? ["planned"] : [])].join(","),
  });
  if (config.selectedLanes instanceof Set) q.set("lanes", [...config.selectedLanes].sort().join(","));
  return `/api/context/life_tree?${q}`;
}

function lifeTreeLaneLabel(lane, L) {
  const keys = {
    mail_received: "life_lane_mail_received", mail_sent: "life_lane_mail_sent", erp_work: "life_lane_erp_work",
    se_planned: "life_lane_se_planned", voice_intake: "life_lane_voice_intake", codex_instruction: "life_lane_codex_instruction",
    artifact_metadata: "life_lane_artifact_metadata", general_activity: "life_lane_general_activity", file_activity: "life_lane_file_activity",
  };
  return L[keys[lane?.lane_id]] ?? lane?.label ?? lane?.lane_id ?? L.life_lane_unknown;
}

function lifeTreeStateLabel(value, L) {
  return ({
    confirmed_exact: L.life_confirmed, confirmed: L.life_confirmed,
    review_needed: L.life_review_needed, suggested: L.life_review_needed,
    unassigned: L.life_unassigned, inbox: L.life_unassigned,
    conflict: L.life_conflict, partial: L.life_partial,
    exact: L.life_time_exact, date_only: L.life_time_date_only,
    fallback: L.life_time_fallback, unknown: L.life_time_unknown,
    missing_or_invalid: L.life_time_unknown,
  })[value] ?? (value ? value : L.life_time_unknown);
}

function lifeTreeRoleLabel(value, L) {
  return ({ occurred: L.life_role_occurred, observed: L.life_role_observed, state_change: L.life_role_state_change, planned: L.life_role_planned })[value] ?? (value ? value : L.life_role_unknown);
}

function lifeTreeGapReason(value, L) {
  return ({
    no_canonical_general_activity_collector: L.life_gap_general_activity,
    no_canonical_filesystem_create_collector: L.life_gap_file_activity,
    general_filesystem_activity_unobserved: L.life_gap_file_activity,
  })[value] ?? value ?? L.life_gap_unknown;
}

function lifeTreeScopeReasonLabel(value, L) {
  return ({
    other_mailboxes_withheld: L.life_scope_mail_withheld,
    inaccessible_actor_item_mailbox_events_withheld: L.life_scope_work_withheld,
    inaccessible_items_and_unbound_project_plans_withheld: L.life_scope_plan_withheld,
    inaccessible_items_withheld: L.life_scope_work_withheld,
    unbound_project_artifacts_withheld: L.life_scope_artifact_withheld,
    inaccessible_upload_events_withheld: L.life_scope_file_withheld,
    general_filesystem_activity_unobserved: L.life_gap_file_activity,
  })[value] ?? L.life_scope_limited;
}

function lifeTreeReasonLabel(value, L) {
  const keys = {
    multiple_exact_context_links: "life_reason_multiple_contexts",
    suggested_context_not_confirmed: "life_reason_suggested_context",
    no_exact_context_link: "life_reason_no_context",
    source_time_missing: "life_reason_time_missing",
    source_time_invalid: "life_reason_time_invalid",
    date_only_precision: "life_reason_date_only",
    voice_occurrence_clock_unavailable: "life_reason_voice_clock_missing",
    message_text_withheld: "life_reason_content_withheld",
    registration_timestamp_unavailable: "life_reason_registration_time_missing",
    scope_withheld: "life_reason_scope_withheld",
    cross_project_item_mismatch: "life_reason_cross_project_mismatch",
    item_link_withheld_or_project_mismatch: "life_reason_cross_project_mismatch",
  };
  const key = keys[String(value ?? "")];
  return key ? L[key] : L.life_reason_review;
}

function lifeTreeTimeBasisLabel(value, L) {
  const keys = {
    occurred_at: "life_basis_occurred",
    observed_at: "life_basis_observed",
    recorded_at: "life_basis_recorded",
    ingested_at: "life_basis_ingested",
    planned_for: "life_basis_planned",
    undated: "life_basis_undated",
  };
  const key = keys[String(value ?? "")];
  return key ? L[key] : L.life_basis_unknown;
}

function lifeTreeMergeKnownLanes(config, lanes) {
  const merged = new Map((config.knownLanes ?? []).map((lane) => [lane.lane_id, lane]));
  for (const lane of lanes ?? []) merged.set(lane.lane_id, { ...(merged.get(lane.lane_id) || {}), ...lane });
  config.knownLanes = [...merged.values()];
}

function lifeTreeFiltersHtml(config) {
  const L = state.lex;
  const lanes = config.knownLanes ?? [];
  const laneButtons = lanes.map((lane) => {
    const on = !(config.selectedLanes instanceof Set) || config.selectedLanes.has(lane.lane_id);
    const gap = ["gap", "partial"].includes(lane.status) ? ` · ${L.life_gap}` : "";
    return `<button type="button" class="fav-chip mini life-lane-filter ${on ? "on" : ""}" data-life-lane="${esc(lane.lane_id)}" aria-pressed="${on}">${esc(lifeTreeLaneLabel(lane, L))}${esc(gap)}</button>`;
  }).join("");
  return `<details class="life-filter-details" open>
    <summary>${esc(L.life_filters)}</summary>
    <div class="life-filter-row">
      <label>${esc(L.life_range)} <select class="life-days" aria-label="${esc(L.life_range)}">
        ${[7, 30, 90].map((n) => `<option value="${n}" ${config.days === n ? "selected" : ""}>${n}${esc(L.life_days_suffix)}</option>`).join("")}
      </select></label>
      <span class="life-role-fixed">${esc(L.life_role_actual_state)} · ${esc(L.life_on)}</span>
      <button type="button" class="fav-chip mini life-planned ${config.showPlanned ? "on" : ""}" aria-pressed="${config.showPlanned}">${esc(L.life_role_planned)} · ${esc(config.showPlanned ? L.life_on : L.life_off)}</button>
    </div>
    ${laneButtons ? `<div class="life-filter-lanes"><span>${esc(L.life_lanes)}</span>${laneButtons}</div>` : ""}
  </details>`;
}

function lifeTreeEventVisible(event, config) {
  if (!config.showPlanned && event.temporal_role === "planned") return false;
  return !(config.selectedLanes instanceof Set) || config.selectedLanes.has(event.lane_id);
}

function lifeTreeContextConfirmed(context) {
  return ["confirmed_exact", "confirmed"].includes(String(context?.binding_state ?? ""));
}

function lifeTreeConfirmedTaskLink(link) {
  if (!link || !["confirmed_exact", "confirmed"].includes(String(link.link_state ?? ""))) return null;
  const itemId = String(link.item_id ?? "");
  if (!itemId || String(link.ref ?? "") !== `item:${itemId}`) return null;
  return { item_id: itemId, label: String(link.label ?? "") };
}

function lifeTreeConfirmedBranchLink(link, project, branches) {
  if (!link || !["confirmed_exact", "confirmed"].includes(String(link.link_state ?? ""))) return null;
  const branchKey = String(link.branch_key ?? "");
  const ref = String(link.ref ?? "");
  if (!branchKey || ref !== `branch:${project}:${branchKey}`) return null;
  const branch = (branches ?? []).find((row) => String(row.branch_key ?? "") === branchKey);
  return branch ? { branch_key: branchKey, label: String(link.label || branch.label || branchKey) } : null;
}

function lifeTreeEventNeedsReview(event, context) {
  if (!lifeTreeContextConfirmed(context)) return true;
  const states = [event.project_binding, event.uncertainty?.context].map((v) => String(v ?? ""));
  return states.some((v) => ["review_needed", "suggested", "unassigned", "inbox", "conflict", "partial", "withheld"].includes(v));
}

function lifeTreeEventActionsHtml(event, context, g) {
  if (lifeTreeEventNeedsReview(event, context)) return "";
  const L = state.lex;
  const tasks = [...new Map((event.task_links ?? []).map(lifeTreeConfirmedTaskLink).filter(Boolean).map((link) => [link.item_id, link])).values()];
  const branches = [...new Map((event.context_links ?? [])
    .map((link) => lifeTreeConfirmedBranchLink(link, g.project, g.branches)).filter(Boolean)
    .map((link) => [link.branch_key, link])).values()];
  const taskButtons = tasks.map((link) => `<button type="button" class="fav-chip mini life-open-item" data-life-item="${esc(link.item_id)}" data-life-label="${esc(link.label || event.summary_label)}" aria-label="${esc(`${L.life_open_task}: ${link.item_id}`)}">${esc(L.life_open_task)}</button>`).join("");
  const branchButtons = branches.map((link) => `<button type="button" class="fav-chip mini life-open-story" data-life-branch="${esc(link.branch_key)}" aria-label="${esc(`${L.life_open_story}: ${link.label}`)}">${esc(L.life_open_story)}</button>`).join("");
  return taskButtons || branchButtons ? `<div class="life-event-actions">${taskButtons}${branchButtons}</div>` : "";
}

function lifeTreeTimeHtml(event) {
  const L = state.lex;
  const shown = String(event.display_at ?? "");
  const time = shown ? `<time datetime="${esc(shown)}">${esc(shown.slice(0, 16).replace("T", " "))}</time>` : `<span>${esc(L.life_undated)}</span>`;
  const basis = event.time_basis ? `${L.life_time_basis}: ${lifeTreeTimeBasisLabel(event.time_basis, L)}` : "";
  const stateLabel = lifeTreeStateLabel(event.time_state, L);
  return `${time}<span>${esc([basis, stateLabel].filter(Boolean).join(" · "))}</span>`;
}

function lifeTreeEventHtml(event, context, g, laneById) {
  const L = state.lex;
  const lane = laneById.get(event.lane_id) ?? { lane_id: event.lane_id, label: event.lane_id };
  const review = lifeTreeEventNeedsReview(event, context);
  const reasons = [...new Set([...(context.reasons ?? []), ...(event.uncertainty?.reasons ?? [])].filter(Boolean))].slice(0, 8);
  const evidence = review || reasons.length ? `<div class="life-evidence">
    <strong>${esc(review ? L.life_review_needed : L.life_evidence)}</strong>
    ${reasons.length ? `<ul>${reasons.map((reason) => `<li>${esc(lifeTreeReasonLabel(reason, L))}</li>`).join("")}</ul>` : `<span>${esc(L.life_gap_unknown)}</span>`}
  </div>` : "";
  const binding = event.project_binding ? `<span>${esc(lifeTreeStateLabel(event.project_binding, L))}</span>` : "";
  return `<li><article class="life-event ${review ? "needs-review" : "confirmed"}">
    <header><span class="life-lane-badge">${esc(lifeTreeLaneLabel(lane, L))}</span><span class="life-role-badge">${esc(lifeTreeRoleLabel(event.temporal_role, L))}</span>${binding}</header>
    <strong class="life-event-title">${esc(event.summary_label || L.life_event_untitled)}</strong>
    <div class="life-event-time">${lifeTreeTimeHtml(event)}</div>
    ${evidence}${lifeTreeEventActionsHtml(event, context, g)}
  </article></li>`;
}

function lifeTreeCoverageHtml(model, config) {
  const L = state.lex;
  const gaps = new Set([...(model.coverage?.gap_lane_ids ?? []), ...(config.knownLanes ?? []).filter((lane) => ["gap", "partial"].includes(lane.status)).map((lane) => lane.lane_id)]);
  const laneRows = (config.knownLanes ?? []).map((lane) => {
    const cv = lane.coverage ?? {};
    const count = cv.events != null && Number.isFinite(Number(cv.events)) ? Number(cv.events) : null;
    const cap = cv.cap != null && Number.isFinite(Number(cv.cap)) ? Number(cv.cap) : null;
    const bits = [
      cv.scanned == null ? "" : `${L.life_scanned} ${cv.scanned}`,
      cv.accepted == null ? "" : `${L.life_accepted} ${cv.accepted}`,
      count == null ? "" : `${L.life_shown} ${count}`,
      cv.skipped == null ? "" : `${L.life_skipped} ${cv.skipped}`,
      cv.undated == null || Number(cv.undated) === 0 ? "" : `${L.life_undated} ${cv.undated}`,
      cap == null ? "" : `${L.life_cap} ${cap}`,
      cv.truncated ? L.life_truncated : "",
    ].filter(Boolean).join(" · ");
    const gap = ["gap", "partial"].includes(lane.status) || gaps.has(lane.lane_id);
    const scopeReasons = (cv.scope_withheld_reasons ?? []).map((reason) => lifeTreeScopeReasonLabel(reason, L));
    const scopeDetail = cv.scope_limited
      ? [L.life_scope_limited, ...new Set(scopeReasons)].filter(Boolean).join(" · ")
      : "";
    return `<li><div><strong>${esc(lifeTreeLaneLabel(lane, L))}</strong><span>${esc(gap ? L.life_gap : L.life_available)}</span></div>
      ${bits ? `<small>${esc(bits)}</small>` : ""}${gap ? `<small class="danger-text">${esc(lifeTreeGapReason(lane.gap_reason, L))}</small>` : ""}
      ${scopeDetail ? `<small class="danger-text">${esc(scopeDetail)}</small>` : ""}</li>`;
  }).join("");
  const undated = model.coverage?.undated_count;
  const totalBits = [
    model.coverage?.scanned == null ? "" : `${L.life_scanned} ${model.coverage.scanned}`,
    model.coverage?.accepted == null ? "" : `${L.life_accepted} ${model.coverage.accepted}`,
    model.coverage?.shown == null ? "" : `${L.life_shown} ${model.coverage.shown}`,
  ].filter(Boolean).join(" · ");
  const alerts = [
    model.coverage?.truncated ? L.life_truncated_detail : "",
    gaps.size ? `${L.life_gap_lanes}: ${[...gaps].map((id) => lifeTreeLaneLabel((config.knownLanes ?? []).find((lane) => lane.lane_id === id) ?? { lane_id: id }, L)).join(", ")}` : "",
    Number(undated) > 0 ? `${L.life_undated} ${Number(undated)}` : "",
    Number(model.coverage?.projection_gap_count) > 0 ? `${L.life_projection_gaps} ${Number(model.coverage.projection_gap_count)}` : "",
    model.coverage?.scope_limited ? L.life_scope_limited : "",
  ].filter(Boolean);
  return `<aside class="life-coverage" aria-live="polite">
    <h4>${esc(L.life_coverage)}</h4>
    <p class="dim small">${esc(L.life_timezone)}: ${esc(model.timezone || "Asia/Seoul")}</p>
    ${totalBits ? `<p class="dim small">${esc(totalBits)}</p>` : ""}
    ${alerts.length ? `<div class="life-coverage-alert">${alerts.map((line) => `<p>${esc(line)}</p>`).join("")}</div>` : `<p class="dim small">${esc(L.life_coverage_complete)}</p>`}
    <ul>${laneRows}</ul>
  </aside>`;
}

function lifeTreeDaysHtml(model, config, g) {
  const L = state.lex;
  const laneById = new Map((config.knownLanes ?? []).map((lane) => [lane.lane_id, lane]));
  const days = [];
  for (const day of model.days ?? []) {
    const contextHtml = [];
    let dayCount = 0;
    for (const context of day.contexts ?? []) {
      const events = (context.events ?? []).filter((event) => lifeTreeEventVisible(event, config));
      if (!events.length) continue;
      dayCount += events.length;
      const confirmed = lifeTreeContextConfirmed(context);
      const label = context.label || (confirmed ? L.life_confirmed_context : L.life_review_needed);
      const groupBranch = confirmed ? lifeTreeConfirmedBranchLink({
        ref: context.context_ref, branch_key: context.branch_key, link_state: context.binding_state,
      }, g.project, g.branches) : null;
      const groupAction = groupBranch
        ? `<button type="button" class="fav-chip mini life-open-story" data-life-branch="${esc(groupBranch.branch_key)}" aria-label="${esc(`${L.life_open_story}: ${groupBranch.label}`)}">${esc(L.life_open_story)}</button>` : "";
      const contextEvidence = !confirmed && (context.reasons ?? []).length
        ? `<div class="life-evidence"><strong>${esc(L.life_review_needed)}</strong><ul>${context.reasons.map((reason) => `<li>${esc(lifeTreeReasonLabel(reason, L))}</li>`).join("")}</ul></div>` : "";
      contextHtml.push(`<details class="life-context ${confirmed ? "confirmed" : "needs-review"}" open>
        <summary><span>${esc(label)}</span><small>${esc(lifeTreeStateLabel(context.binding_state, L))} · ${events.length}</small></summary>
        ${groupAction}${contextEvidence}<ul class="life-event-list">${events.map((event) => lifeTreeEventHtml(event, context, g, laneById)).join("")}</ul>
      </details>`);
    }
    if (!dayCount) continue;
    const dated = day.day_key !== "undated" && LIFE_TREE_DATE_RE.test(day.day_key);
    const dayLabel = dated ? day.day_key : L.life_undated;
    days.push(`<details class="life-day ${dated ? "dated" : "undated"}" ${days.length === 0 ? "open" : ""}>
      <summary>${dated ? `<time datetime="${esc(day.day_key)}">${esc(dayLabel)}</time>` : `<span>${esc(dayLabel)}</span>`}<small>${dayCount}${esc(L.life_event_suffix)}</small></summary>
      <div class="life-contexts">${contextHtml.join("")}</div>
    </details>`);
  }
  return days.join("") || `<div class="empty">${esc(L.life_no_events)}</div>`;
}

function wireLifeTreeFilters(body, g, config) {
  body.querySelector(".life-days")?.addEventListener("change", (event) => {
    const days = Number(event.target.value);
    config.days = [7, 30, 90].includes(days) ? days : 30;
    drawTrunkLifeTree(body, g);
  });
  body.querySelector(".life-planned")?.addEventListener("click", () => {
    config.showPlanned = !config.showPlanned;
    drawTrunkLifeTree(body, g);
  });
  body.querySelectorAll(".life-lane-filter").forEach((button) => button.addEventListener("click", () => {
    const allIds = (config.knownLanes ?? []).map((lane) => lane.lane_id);
    const next = config.selectedLanes instanceof Set ? new Set(config.selectedLanes) : new Set(allIds);
    if (next.has(button.dataset.lifeLane)) {
      if (next.size === 1) return;
      next.delete(button.dataset.lifeLane);
    } else next.add(button.dataset.lifeLane);
    config.selectedLanes = next.size === allIds.length ? null : next;
    drawTrunkLifeTree(body, g);
  }));
}

async function lifeTreeOpenStory(body, g, branchKey, trigger) {
  const L = state.lex;
  const panel = body.querySelector(".life-story-panel");
  if (!panel) return;
  const requestKey = `${branchKey}:${Date.now()}`;
  panel.dataset.lifeStoryRequest = requestKey;
  panel.onkeydown = (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    panel.innerHTML = "";
    panel.removeAttribute("tabindex");
    trigger?.focus();
  };
  panel.innerHTML = `<div class="life-live-status" role="status" aria-live="polite">${esc(L.life_story_loading)}</div>`;
  const story = await api(`/api/context/branch_story?project=${encodeURIComponent(g.project)}&branch=${encodeURIComponent(branchKey)}`, { acceptedDomainStatuses: [400] }).catch(() => null);
  if (!panel.isConnected || panel.dataset.lifeStoryRequest !== requestKey) return;
  if (!story || story.error || story.content_policy !== "metadata_only" || story.branch?.branch_key !== branchKey) {
    panel.innerHTML = `<div class="life-live-status" role="status" aria-live="polite">${esc(L.life_story_error)}</div>`;
    return;
  }
  panel.innerHTML = `<details class="life-story" open><summary>${esc(L.life_story_title)} · ${esc(story.branch?.label || branchKey)}</summary>${trunkStoryHtml(story, L)}</details>`;
  panel.setAttribute("tabindex", "-1");
  panel.focus({ preventScroll: true });
}

function wireLifeTreeActions(body, g) {
  const L = state.lex;
  body.querySelectorAll(".life-open-story").forEach((button) => button.addEventListener("click", () => {
    lifeTreeOpenStory(body, g, button.dataset.lifeBranch, button);
  }));
  body.querySelectorAll(".life-open-item").forEach((button) => button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    const rows = await api(`/api/items?project=${encodeURIComponent(g.project)}&limit=1000`).catch(() => null);
    const items = Array.isArray(rows) ? rows : (Array.isArray(rows?.rows) ? rows.rows : []);
    const item = items.find((row) => String(row.id) === button.dataset.lifeItem && String(row.project_id) === String(g.project));
    if (item) {
      (state._itemCache || (state._itemCache = {}))[item.id] = item;
      openItemQuickEdit(item.id, item.project_id, item.title || button.dataset.lifeLabel);
    } else toast(L.life_item_unavailable, "warn");
    if (button.isConnected) { button.disabled = false; button.removeAttribute("aria-busy"); }
  }));
}

function renderLifeTreeModel(body, g, config, model) {
  lifeTreeMergeKnownLanes(config, model.lanes);
  body.innerHTML = `${lifeTreeFiltersHtml(config)}
    <div class="life-tree-layout">
      <section class="life-tree-main" aria-label="${esc(state.lex.life_title)}">
        <div class="life-story-panel"></div>
        ${lifeTreeDaysHtml(model, config, g)}
      </section>
      ${lifeTreeCoverageHtml(model, config)}
    </div>`;
  wireLifeTreeFilters(body, g, config);
  wireLifeTreeActions(body, g);
}

async function drawTrunkLifeTree(body, g) {
  const L = state.lex;
  const config = lifeTreeProjectState(g.project);
  if (!(state._lifeTreeCache instanceof Map)) state._lifeTreeCache = new Map();
  // Every draw invalidates an older in-flight request, including a cache hit. Without
  // this generation bump, an earlier filter response can overwrite the cached view.
  const requestId = String((state._lifeTreeRequestSeq = (state._lifeTreeRequestSeq ?? 0) + 1));
  body.dataset.lifeRequest = requestId;
  const cacheKey = lifeTreeCacheKey(g.project, config);
  const cached = state._lifeTreeCache.get(cacheKey);
  if (cached && Date.now() - cached.cached_at < LIFE_TREE_CACHE_TTL_MS) {
    renderLifeTreeModel(body, g, config, cached.model);
    return;
  }
  if (cached) state._lifeTreeCache.delete(cacheKey);

  body.innerHTML = `${lifeTreeFiltersHtml(config)}<div class="life-live-status" role="status" aria-live="polite">${esc(L.life_loading)}</div>`;
  wireLifeTreeFilters(body, g, config);
  const raw = await api(lifeTreeRequestPath(g.project, config), { acceptedDomainStatuses: [400, 403] }).catch(() => null);
  if (!body.isConnected || state.trunkView !== "life" || body.dataset.lifeRequest !== requestId) return;
  if (!raw || raw.error) {
    body.innerHTML = `${lifeTreeFiltersHtml(config)}<div class="life-live-status danger-text" role="status" aria-live="polite">${esc(L.life_error)}</div>`;
    wireLifeTreeFilters(body, g, config);
    return;
  }
  if (raw.schema !== LIFE_TREE_SCHEMA || raw.content_policy !== "metadata_only" || raw.read_only !== true || lifeTreePayloadProjectId(raw) !== String(g.project)) {
    body.innerHTML = `${lifeTreeFiltersHtml(config)}<div class="life-live-status danger-text" role="status" aria-live="polite">${esc(L.life_contract_error)}</div>`;
    wireLifeTreeFilters(body, g, config);
    return;
  }
  const model = normalizeLifeTreePayload(raw, g.project);
  state._lifeTreeCache.set(cacheKey, { cached_at: Date.now(), model });
  renderLifeTreeModel(body, g, config, model);
}

// B9c 진단 렌즈 — 저장/자동판정 없이 context/graph 응답의 설명 통계만 렌더한다.
// 사람 표는 개인 점수가 아니라 담당 가지·사람 확정 이벤트·완료 건수의 단순 분포다.
function trunkHeatmapHtml(series, L, color = "122,92,192") {
  const weeks = series?.weeks ?? [];
  if (!weeks.length) return `<div class="empty small">${esc(L.trunk_diag_none)}</div>`;
  const max = Math.max(1, ...weeks.map((w) => Number(w.count) || 0));
  return `<div style="display:flex;gap:3px;align-items:flex-end;overflow-x:auto;padding:4px 0 2px">
    ${weeks.map((w) => {
      const count = Number(w.count) || 0;
      const alpha = count ? (0.18 + (count / max) * 0.72).toFixed(2) : "0.05";
      return `<span title="${esc(L.trunk_diag_week)} ${esc(w.week)} · ${count}" style="min-width:22px;height:24px;border:1px solid var(--border,#8883);border-radius:3px;background:rgba(${color},${alpha});display:inline-flex;align-items:center;justify-content:center;font-size:9px">${count || ""}</span>`;
    }).join("")}</div>${series.truncated ? `<div class="dim small">${esc(L.trunk_diag_truncated)}</div>` : ""}`;
}

function drawTrunkDiagnostics(body, g) {
  const L = state.lex;
  const d = g.diagnostics;
  if (!d || d.content_policy !== "metadata_only") { body.innerHTML = `<div class="empty">${esc(L.trunk_diag_none)}</div>`; return; }
  const s = d.shape ?? {};
  const cv = d.coverage ?? {};
  const capDetails = [];
  if ((cv.graph_nodes_shown ?? 0) < (cv.graph_nodes_total ?? 0)) capDetails.push(`${L.trunk_diag_nodes} ${cv.graph_nodes_shown}/${cv.graph_nodes_total}`);
  if (cv.branch_input_truncated) capDetails.push(`${L.trunk_diag_branches} ${cv.branch_inputs_shown}/${cv.branch_inputs_total}`);
  if (cv.source_input_truncated) capDetails.push(`${L.trunk_diag_sources} ${cv.source_inputs_shown}/${cv.source_inputs_total}`);
  if (d.heatmap?.truncated) capDetails.push(`${L.trunk_diag_heatmap} ${d.heatmap.shown_points}/${d.heatmap.total_points}`);
  if (d.requests?.truncated) capDetails.push(`${L.trunk_diag_requests} ${d.requests.shown_dated_count}/${d.requests.dated_count}`);
  if (cv.people_truncated) capDetails.push(`${L.trunk_diag_people} ${cv.people_shown}/${cv.people_total}`);
  if (cv.counterparts_truncated) capDetails.push(`${L.trunk_diag_counterpart} ${cv.counterparts_shown}/${cv.counterparts_total}`);
  if (cv.dead_list_truncated) capDetails.push(`${L.trunk_diag_dead_title} ${cv.dead_list_shown}/${s.dead_count ?? 0}`);
  const capped = capDetails.length > 0;
  const deadWithheld = String(cv.dead_classification ?? "").startsWith("withheld_");
  const coverage = [
    `${L.trunk_diag_dated} ${cv.dated_points ?? 0}`,
    `${L.trunk_diag_undated} ${cv.undated_points ?? 0}`,
    `${L.trunk_diag_mail_joined} ${cv.mail_joined ?? 0}/${cv.mail_sources ?? 0}`,
    `${L.trunk_diag_item_joined} ${cv.item_refs_resolved ?? 0}/${cv.item_count ?? 0}`,
    `${L.trunk_diag_ref_coverage} ${cv.post_close_references_observed ?? 0}/${cv.relation_time_unknown ?? 0}`,
    `${L.trunk_diag_legacy_excluded} ${d.scope?.legacy_excluded ?? 0}`,
    capped ? `${L.trunk_diag_capped}: ${capDetails.join(", ")}` : "",
    deadWithheld ? L.trunk_diag_dead_withheld : "",
  ].filter(Boolean).join(" · ");
  const deadRows = (d.dead_branches ?? []).map((b) => `<tr style="color:var(--muted,#777)">
    <td><strong>${esc(b.label ?? b.branch_key)}</strong></td><td class="dim">${esc(b.closed_at ? String(b.closed_at).slice(0, 10) : "-")}</td>
    <td class="num">${b.reference_count ?? 0}</td><td class="num">${b.knowledge_count ?? 0}</td></tr>`).join("");
  const peopleRows = (d.people ?? []).map((p) => `<tr><td>${esc(p.person_ref)}</td><td class="num">${p.branch_count}</td><td class="num">${p.point_count}</td><td class="num">${p.resolved_count}</td></tr>`).join("");
  const requestRows = (d.requests?.counterparts ?? []).map((r) => `<tr><td>${esc(r.counterpart)}</td><td class="num">${r.count}</td></tr>`).join("");
  body.innerHTML = `<section class="calc-card" style="margin-top:6px">
      <h4 class="hub-h4">${esc(L.trunk_diag_title)}</h4>
      <div class="item-form" style="gap:6px"><span class="fav-chip mini">${esc(L.trunk_diag_branches)} ${s.branch_count ?? 0}</span><span class="fav-chip mini">${esc(L.trunk_diag_points)} ${s.point_count ?? 0}</span><span class="fav-chip mini">${esc(deadWithheld ? L.trunk_diag_dead_withheld : `${L.trunk_diag_dead} ${s.dead_count ?? 0}`)}</span></div>
      <div class="dim small" style="margin-top:6px">${esc(L.trunk_diag_caveat)}</div>
      <div class="dim small" style="margin-top:4px"><b>${esc(L.trunk_diag_coverage)}</b>: ${esc(coverage)}</div>
    </section>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px;margin-top:10px">
      <section class="calc-card"><h4 class="hub-h4">${esc(L.trunk_diag_heatmap)}</h4>${trunkHeatmapHtml(d.heatmap, L)}</section>
      <section class="calc-card"><h4 class="hub-h4">${esc(L.trunk_diag_requests)} · ${esc(L.trunk_diag_received)} ${d.requests?.received_count ?? 0}</h4>
        ${trunkHeatmapHtml({ weeks: d.requests?.weeks ?? [], truncated: d.requests?.truncated }, L, "74,125,191")}
        ${requestRows ? `<table class="small"><thead><tr><th>${esc(L.trunk_diag_counterpart)}</th><th class="num">${esc(L.trunk_diag_received)}</th></tr></thead><tbody>${requestRows}</tbody></table>` : `<div class="empty small">${esc(L.trunk_diag_none)}</div>`}</section>
      <section class="calc-card"><h4 class="hub-h4">${esc(L.trunk_diag_people)}</h4>
        ${peopleRows ? `<table class="small"><thead><tr><th>${esc(L.trunk_diag_person)}</th><th class="num">${esc(L.trunk_diag_assigned)}</th><th class="num">${esc(L.trunk_diag_human_events)}</th><th class="num">${esc(L.trunk_diag_resolved)}</th></tr></thead><tbody>${peopleRows}</tbody></table>` : `<div class="empty small">${esc(L.trunk_diag_none)}</div>`}</section>
      <section class="calc-card"><h4 class="hub-h4">${esc(L.trunk_diag_dead_title)}</h4><div class="dim small" style="margin-bottom:6px">${esc(L.trunk_diag_dead_rule)}</div>
        ${deadWithheld ? `<div class="empty small">${esc(L.trunk_diag_dead_withheld)}</div>` : deadRows ? `<table class="small"><thead><tr><th>${esc(L.trunk_col_label)}</th><th>${esc(L.trunk_diag_closed)}</th><th class="num">${esc(L.trunk_diag_refs)}</th><th class="num">${esc(L.trunk_diag_knowledge)}</th></tr></thead><tbody>${deadRows}</tbody></table>` : `<div class="empty small">${esc(L.trunk_diag_none)}</div>`}</section>
    </div>`;
}

// 뷰1 지도(방사형) — "전체 모양·큰 갈래 한눈에". 가지 클릭 → 그 가지 주변으로 하위가 부채꼴로
// 펼쳐짐(한 번에 한 가지, 다시 클릭하면 접힘 — 전부 펼치면 363노드 털뭉치라 아코디언) + 아래 상세 목록.
const TRUNK_TYPE_COLOR = { source_event: "#8aa4c8", task_candidate: "#e0a63a", milestone: "#7a5cc0", actor: "#4fa36b" };
// 줄기 v2 가지 종류(STEM-V2-ONTOLOGY): 골격=보라 사각(기둥), 작업=초록(생애 있는 일), 이력=주황(회의체 시간축), legacy=옅은 파랑.
const TRUNK_KIND_STYLE = {
  skeleton: { fill: "#7a5cc0", opacity: 0.9 },
  work: { fill: "#3f9e63", opacity: 0.9 },
  history: { fill: "#d99a2b", opacity: 0.9 },
  legacy: { fill: "#4a7dbf", opacity: 0.35 },
};
const TRUNK_KIND_ORDER = { skeleton: 0, history: 1, work: 2, legacy: 3 };
function trunkKindOf(b) {
  const k = String(b?.branch_kind ?? "").trim();
  return TRUNK_KIND_STYLE[k] ? k : "legacy";
}
// 지도 라벨용 표시 정제 — 잘림(16자) 안에 알맹이가 들어가게 접두를 벗긴다(표시 전용, 데이터 무변경).
// "History: FW: [군집] 신호/영상처리장치" → "신호/영상처리장치". 상세 뷰는 원문 라벨 유지.
function trunkMapLabel(b) {
  let s = String(b?.label ?? b?.branch_key ?? "").trim();
  s = s.replace(/^History:\s*/i, "");
  for (let i = 0; i < 3; i++) {
    const t = s.replace(/^(?:FW|RE|회신|전달)\s*:\s*/i, "").replace(/^\[[^\]]{1,24}\]\s*/, "").replace(/^!{1,}중요!*\s*/, "").trim();
    if (t === s || t.length < 3) break;
    s = t;
  }
  return s || String(b?.label ?? b?.branch_key ?? "");
}
// 이력줄기의 회차 목록 — occurrence.branch_ref(가지 키) 또는 series anchor 로 조인.
function trunkOccurrencesFor(g, b) {
  if (!b) return [];
  return (g.occurrences ?? []).filter((o) =>
    (o.branch_ref && o.branch_ref === b.branch_key)
    || (b.anchor_ref && o.series_key && b.anchor_ref === `series:${o.series_key}`))
    .sort((a, x) => String(a.occurrence_key).localeCompare(String(x.occurrence_key)));
}
// 강줄기 뷰(B9b, 2026-07-07 owner "근본 해결" 지시): 방사형 폐기 — 가로축=시간, 기둥(SE 골격) 위에
// 게이트 큰 점, 가지는 탄생 시점에서 갈라져 자기 가로줄(레인)을 갖는다(겹침 구조적 제거, git log --graph 원리).
// 줄 위의 점 = 그 일의 기록들(시간순), 가지 사이 가는 곡선 = 실제 관계(edges). 정본: docs/slices/B9-STEM-RIVER-VIEW.md §2.
function drawTrunkMap(body, g, ranked) {
  const L = state.lex;
  const deadKeys = new Set((g.diagnostics?.branch_signals ?? []).filter((b) => b.dead).map((b) => b.branch_key));
  const skeleton = ranked.filter((b) => trunkKindOf(b) === "skeleton").slice(0, 10);
  const laneCap = 32;
  const laneAll = ranked.filter((b) => trunkKindOf(b) !== "skeleton");
  const T = (s) => { const t = Date.parse(String(s ?? "").slice(0, 19)); return Number.isFinite(t) ? t : null; };
  const nodesByBranch = new Map();
  for (const n of g.nodes ?? []) {
    if (!n.branch_key || n.type === "context_branch") continue;
    if (!nodesByBranch.has(n.branch_key)) nodesByBranch.set(n.branch_key, []);
    nodesByBranch.get(n.branch_key).push(n);
  }
  // 가지 시작은 born_at 만 신뢰 — 노드 created_at/updated_at 은 대량 이관·리빌드가 일괄 스탬프해 시간축에 못 쓴다.
  const laneStart = (b) => T(b.born_at) ?? Infinity;
  const isProposed = (b) => trunkKindOf(b) === "history" && b.status === "proposed";
  const isClosed = (b) => b.status === "closed" || !!b.closed_at;
  const sortedAll = laneAll.slice().sort((a, b) => (laneStart(a) === Infinity ? 1 : laneStart(b) === Infinity ? -1 : laneStart(a) - laneStart(b)));
  const proposedN = sortedAll.filter(isProposed).length;
  const closedN = sortedAll.filter((b) => !isProposed(b) && isClosed(b)).length;
  let lanes = []; // paintSvg 가 접기 상태로 재계산 — 클릭 상세·드래그 공용 목록도 함께 갱신
  let branches = [...skeleton];
  const W = 1180; const ML = 12; const MR = 24;
  const trunkY = 46; const laneTop = 92;
  const c = g.counts ?? {};
  const moreNote = (ranked.length - skeleton.length - sortedAll.length > 0 || c.truncated)
    ? `<div class="dim small">${(L.trunk_more ?? "가지 +{n}개는 중요도 하위라 생략됨").replace("{n}", Math.max(0, ranked.length - skeleton.length - laneCap))}${c.truncated ? ` · ${L.trunk_node_cap ?? "노드 상한 도달(일부 생략)"}` : ""}</div>` : "";
  const foldChips = `<div class="item-form" style="gap:6px;margin:2px 0">
    ${proposedN ? `<button class="fav-chip mini" id="trunkFoldP"></button>` : ""}
    ${closedN ? `<button class="fav-chip mini" id="trunkFoldC"></button>` : ""}</div>`;
  body.innerHTML = `${foldChips}<div id="trunkMapSvg"></div>${moreNote}<div id="ctxDetail" class="dim small">${L.trunk_hint}</div>`;

  // 드래그 재부착(B6 계약): 작업(초록) 가지를 끌어 골격 게이트(gate:*) 사각에 놓으면 그 일의 SE 단계가 이동.
  // 6px 이상 이동해야 드래그로 간주(클릭=펼치기와 구분). move/up 리스너는 컨테이너가 영속하므로 여기서 1회만 부착
  // (paintSvg 안에 두면 가지 클릭마다 중복 부착 → 드래그 1번에 reanchor 다발 발사).
  // 벙어리 UX 금지(2026-07-07 owner): 끌리는 게 보이고(고스트), 놓을 곳이 빛나고(게이트 하이라이트),
  // 어떤 결과든 토스트가 말한다 — 못 끄는 가지·빈 곳 드롭도 침묵하지 않는다.
  const svgHost = $("#trunkMapSvg");
  let drag = null;
  const svgXY = (svg, x, y) => { const p = svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  const clearDragFx = () => {
    svgHost.querySelector("#trunkDragGhost")?.remove();
    svgHost.querySelectorAll(".drop-ok").forEach((n) => n.classList.remove("drop-ok"));
  };
  svgHost.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.sx) > 6 || Math.abs(e.clientY - drag.sy) > 6) drag.moved = true;
    if (!drag.moved || drag.kind !== "work") return;
    const svg = svgHost.querySelector("svg");
    if (!svg) return;
    const pt = svgXY(svg, e.clientX, e.clientY);
    let ghost = svg.querySelector("#trunkDragGhost");
    if (!ghost) {
      ghost = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      ghost.id = "trunkDragGhost";
      ghost.setAttribute("r", "13");
      ghost.setAttribute("fill", "#3f9e63");
      ghost.setAttribute("opacity", "0.5");
      ghost.setAttribute("pointer-events", "none"); // elementFromPoint 가 고스트를 집지 않게
      svg.appendChild(ghost);
    }
    ghost.setAttribute("cx", pt.x); ghost.setAttribute("cy", pt.y);
    const t = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".ctx-branch");
    svgHost.querySelectorAll(".drop-ok").forEach((n) => n.classList.remove("drop-ok"));
    if (t && t.dataset.kind === "skeleton" && (t.dataset.anchor || "").startsWith("gate:")) t.classList.add("drop-ok");
  });
  svgHost.addEventListener("pointerup", async (e) => {
    clearDragFx();
    const d = drag; drag = null;
    if (!d || !d.moved) return;
    if (d.kind !== "work" || !d.item) { toast(L.trunk_drag_only_work, "warn"); return; }
    const t = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".ctx-branch");
    if (t && t.dataset.key === d.key) return;
    const anchor = t?.dataset.anchor || "";
    if (!t || t.dataset.kind !== "skeleton" || !anchor.startsWith("gate:")) { toast(L.trunk_drag_only_gate, "warn"); return; }
    const r = await post("/api/items/reanchor", { id: d.item, anchor_stage_code: anchor.slice(5) });
    if (r.ok) { toast(L.trunk_drag_done, "ok"); render(); }
    else { const er = await r.json().catch(() => ({})); toast(`${L.trunk_drag_fail}: ${er.error ?? "-"}`, "warn"); }
  });
  svgHost.addEventListener("pointercancel", () => { clearDragFx(); drag = null; });

  const paintSvg = () => {
    const expandedKey = state._trunkExpandKey ?? null;
    // ── 접기(2026-07-07 owner "기본기"): 제안/완료 가지는 칩으로 접었다 편다 — 접힌 종류는 레인에서 제외.
    lanes = sortedAll.filter((b) => !(state.trunkFoldProposed && isProposed(b)) && !(state.trunkFoldClosed && !isProposed(b) && isClosed(b))).slice(0, laneCap);
    branches = [...skeleton, ...lanes];
    const rowH = lanes.length > 24 ? 24 : 30;
    const H = laneTop + Math.max(1, lanes.length) * rowH + 20;
    const chipP = $("#trunkFoldP"); const chipC = $("#trunkFoldC");
    // 어휘 폴백: 운영 재시작 전(구 서버 lexicon)에도 UI 가 깨지지 않게 — 다중 세션 부하로 재시작이 지연될 수 있음.
    if (chipP) chipP.textContent = `${L.trunk_kind_proposed} ${proposedN} ${state.trunkFoldProposed ? (L.trunk_unfold ?? "펼치기") : (L.trunk_fold ?? "접기")}`;
    if (chipC) chipC.textContent = `${L.trunk_closed_mark} ${closedN} ${state.trunkFoldClosed ? (L.trunk_unfold ?? "펼치기") : (L.trunk_fold ?? "접기")}`;
    // ── 시간 영역: 가지 탄생/종료 + 회차 + 기록 날짜 전부에서 산출
    const ts = [];
    for (const b of lanes) { const a = T(b.born_at); if (a) ts.push(a); const z = T(b.closed_at); if (z) ts.push(z); }
    for (const o of g.occurrences ?? []) { const t = T(o.occurrence_key); if (t) ts.push(t); }
    const now = Date.now();
    const domMin = ts.length ? Math.min(...ts) : now - 90 * 864e5;
    const domMax = Math.max(ts.length ? Math.max(...ts) : now, domMin + 7 * 864e5, now);
    const X = (t) => ML + 150 + ((t - domMin) / (domMax - domMin)) * (W - ML - MR - 150 - 10);
    // ── 월 눈금(기간 길면 분기 단위)
    const months = [];
    { const d = new Date(domMin); d.setDate(1); d.setHours(0, 0, 0, 0);
      const span = (domMax - domMin) / (30 * 864e5); const step = span > 30 ? 3 : 1;
      while (d.getTime() <= domMax) { months.push(new Date(d)); d.setMonth(d.getMonth() + step); } }
    const grid = months.map((d) => { const x = X(d.getTime()); if (x < ML + 150) return "";
      return `<line x1="${x}" y1="${trunkY - 14}" x2="${x}" y2="${H - 8}" stroke="var(--border,#8883)" stroke-width="1"/>
        <text x="${x + 3}" y="${trunkY - 18}" font-size="9" fill="currentColor" opacity="0.55">${d.getFullYear() % 100}.${String(d.getMonth() + 1).padStart(2, "0")}</text>`; }).join("");
    // ── 기둥(SE 골격): 가로선 + 게이트 큰 점(드롭 대상) + 관리 기둥 작은 사각
    const gates = skeleton.filter((b) => (b.anchor_ref ?? "").startsWith("gate:"));
    const mgmts = skeleton.filter((b) => !(b.anchor_ref ?? "").startsWith("gate:"));
    const skGap = (W - ML - MR - 150) / (skeleton.length + 1);
    const trunkEls = [`<line x1="${ML + 150}" y1="${trunkY}" x2="${W - MR}" y2="${trunkY}" stroke="#7a5cc0" stroke-width="3" opacity="0.85"/>`,
      `<text x="${ML}" y="${trunkY + 4}" font-size="12" font-weight="600" fill="#7a5cc0">${esc(g.project)}</text>`];
    [...gates, ...mgmts].forEach((b, i) => {
      const x = ML + 150 + skGap * (i + 1);
      const isGate = (b.anchor_ref ?? "").startsWith("gate:");
      const sel = b.branch_key === expandedKey ? ` stroke="var(--accent,#1f48d4)" stroke-width="2.5"` : "";
      trunkEls.push(`<g class="ctx-branch" data-key="${esc(b.branch_key)}" data-kind="skeleton" data-anchor="${esc(b.anchor_ref ?? "")}" style="cursor:pointer">
        ${isGate ? `<circle cx="${x}" cy="${trunkY}" r="10" fill="#7a5cc0"${sel}/>` : `<rect x="${x - 6}" y="${trunkY - 6}" width="12" height="12" rx="3" fill="#7a5cc0" opacity="0.7"${sel}/>`}
        <text x="${x}" y="${trunkY - (isGate ? 15 : 11)}" text-anchor="middle" font-size="${isGate ? 10 : 8.5}" fill="currentColor"${isGate ? ` font-weight="600"` : ` opacity="0.75"`}>${esc(trunkMapLabel(b).slice(0, isGate ? 18 : 12))}</text></g>`);
    });
    // ── 레인(가지 한 줄 = 한 맥락): 탄생점→진행/닫힘, 줄 위 점=기록, 이력은 회차 점
    const pos = new Map(); // node_id → {x,y,key} (교차 곡선용)
    const laneEls = lanes.map((b, i) => {
      const kind = trunkKindOf(b);
      const ks = TRUNK_KIND_STYLE[kind];
      const dead = deadKeys.has(b.branch_key);
      const laneColor = dead ? "#8c8f94" : ks.fill;
      const y = laneTop + i * rowH + rowH / 2;
      const st = laneStart(b);
      const x1 = st === Infinity ? ML + 150 : X(st);
      const closed = isClosed(b);
      const proposed = isProposed(b);
      const sel = b.branch_key === expandedKey;
      const dots = [];
      let lastT = st === Infinity ? null : st;
      // 노드(기록) 점은 임시 비활성 — 현 원장의 created_at 이 대량 이관일(예: 641/722건이 같은 날)로
      // 스탬프돼 시간 배치가 거짓이 된다. 실일자는 B9a branch_story/B9c diagnostics 가 별도 조인해 복원한다.
      // 회차 점(occurrence_key=실날짜)만 신뢰해 표시한다.
      if (kind === "history") for (const o of trunkOccurrencesFor(g, b)) {
        const t = T(o.occurrence_key); if (!t) continue;
        if (!lastT || t > lastT) lastT = t;
        dots.push(`<circle cx="${X(t)}" cy="${y}" r="4.5" fill="${ks.fill}" stroke="#fff" stroke-width="1"><title>${esc(String(o.occurrence_key).slice(0, 10))} (${o.source_count})</title></circle>`);
      }
      // 줄의 끝: 완료=완료일, 진행 중 작업=오늘까지, 그 외(제안·이력)=마지막 기록까지 — 잠든 가지가 한눈에 보이게.
      const x2 = closed && T(b.closed_at) ? X(T(b.closed_at))
        : (kind === "work" && !closed) ? X(now)
        : Math.max(x1 + 6, lastT ? X(lastT) : x1 + 6);
      const badge = b.open_review_count ? ` <tspan fill="#e5534b" font-weight="600">●${b.open_review_count > 99 ? "99+" : b.open_review_count}</tspan>` : "";
      const label = (closed && kind === "work" ? "✓ " : "") + trunkMapLabel(b).slice(0, 34);
      // 늦게 태어난 가지는 라벨을 점 왼쪽으로(anchor=end) — 오른쪽 잘림 방지.
      const flip = x1 > (W - MR) * 0.55;
      return `<g class="ctx-branch" data-key="${esc(b.branch_key)}" data-kind="${kind}" data-anchor="${esc(b.anchor_ref ?? "")}" style="cursor:pointer" opacity="${dead ? 0.42 : closed && kind === "work" ? 0.55 : 1}">
        ${dead ? `<title>${esc(L.trunk_diag_dead_rule)}</title>` : ""}
        <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${laneColor}" stroke-width="${sel ? 4 : 2.5}" opacity="${proposed ? 0.55 : 0.8}"${proposed ? ` stroke-dasharray="5 4"` : ""}/>
        <line x1="${x1}" y1="${trunkY + 8}" x2="${x1}" y2="${y}" stroke="${laneColor}" stroke-width="1" opacity="0.25"/>
        <circle cx="${x1}" cy="${y}" r="5" fill="${laneColor}"${proposed ? ` fill-opacity="0.4" stroke="${laneColor}" stroke-dasharray="3 2"` : ""}/>
        ${closed && T(b.closed_at) ? `<circle cx="${x2}" cy="${y}" r="4" fill="${laneColor}" opacity="0.9"/>` : ""}
        <text x="${flip ? x1 - 8 : x1}" y="${y - 8}" font-size="10.5" fill="currentColor"${sel ? ` font-weight="700"` : ""}${flip ? ` text-anchor="end"` : ""}>${esc(label)}${proposed ? ` <tspan fill="${laneColor}" font-size="8.5">${esc(L.trunk_kind_proposed)}</tspan>` : ""}${badge}</text>
        ${dots.join("")}</g>`;
    }).join("");
    // ── 오늘 세로선 — 어디까지가 과거인지 기준선.
    const todayX = X(now);
    const todayEl = todayX > ML + 150 && todayX < W - 4
      ? `<line x1="${todayX}" y1="${trunkY - 10}" x2="${todayX}" y2="${H - 8}" stroke="#e5534b" stroke-width="1" stroke-dasharray="2 3" opacity="0.6"/>
         <text x="${todayX - 3}" y="${trunkY - 14}" text-anchor="end" font-size="9" fill="#e5534b" opacity="0.8">${esc(L.trunk_today ?? "오늘")}</text>` : "";
    // ── 교차 곡선: 서로 다른 가지의 기록을 잇는 관계(edges) — "엉킴"을 실제 관계로 노출
    const cross = (g.edges ?? []).filter((e) => pos.has(e.from) && pos.has(e.to) && pos.get(e.from).key !== pos.get(e.to).key).slice(0, 60)
      .map((e) => { const a = pos.get(e.from); const b = pos.get(e.to);
        return `<path d="M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - Math.min(46, Math.abs(a.y - b.y) / 2 + 14)} ${b.x} ${b.y}" fill="none" stroke="#889" stroke-width="1" opacity="0.28"/>`; }).join("");
    $("#trunkMapSvg").innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;background:transparent">
        ${grid}${todayEl}${cross}${trunkEls.join("")}${laneEls}</svg>`;
    $("#trunkMapSvg").querySelectorAll(".ctx-branch").forEach((n2) => n2.addEventListener("click", async () => {
      const key = n2.dataset.key;
      state._trunkExpandKey = state._trunkExpandKey === key ? null : key; // 같은 가지 재클릭 = 접기
      const b = branches.find((x) => x.branch_key === key);
      const kind = trunkKindOf(b);
      const kindLabel = { skeleton: L.trunk_kind_skeleton, work: L.trunk_kind_work, history: L.trunk_kind_history, legacy: L.trunk_kind_legacy }[kind];
      const metaBits = [kindLabel, b?.status === "proposed" ? L.trunk_kind_proposed : (b?.status || ""),
        b?.born_at ? `${String(b.born_at).slice(0, 10)}~` : "",
        b?.closed_at ? `${L.trunk_closed_mark} ${String(b.closed_at).slice(0, 10)}` : ""].filter(Boolean).join(" · ");
      // 이력줄기: 회차 타임라인(날짜(자료수)) — occurrences.csv 조인.
      const occs = trunkOccurrencesFor(g, b);
      const occHtml = occs.length ? `<div class="small" style="margin:4px 0">${esc(L.trunk_occ_label)}: ${occs.map((o) => `${esc(String(o.occurrence_key).slice(0, 10))}(${o.source_count})`).join(" · ")}</div>` : "";
      const head = `<h4 class="hub-h4">${esc(b?.label ?? key)} <span class="dim small">(${esc(metaBits)} · ${L.trunk_open_reviews} ${b?.open_review_count ?? 0})</span></h4>${occHtml}`;
      $("#ctxDetail").innerHTML = `${head}<div class="dim small">${L.trunk_story_loading ?? "이야기 불러오는 중…"}</div>`;
      paintSvg();
      // B9a 이야기 뷰(§3 기원/경로/종결) — 연속 클릭 out-of-order 가드: 늦은 응답이 새 선택을 덮지 않게.
      const seq = (state._trunkStorySeq = (state._trunkStorySeq ?? 0) + 1);
      let story = null;
      try { story = await api(`/api/context/branch_story?project=${encodeURIComponent(g.project)}&branch=${encodeURIComponent(key)}`, { acceptedDomainStatuses: [400] }); } catch { story = null; }
      if (seq !== state._trunkStorySeq) return;
      const detail = document.getElementById("ctxDetail");
      if (!detail) return; // 렌즈/뷰 전환됨
      detail.innerHTML = head + (story && !story.error ? trunkStoryHtml(story, L) : trunkChildTable(g, key));
    }));
    // pointerdown 은 repaint 마다 새로 생기는 가지 노드에 다시 건다(옛 노드는 innerHTML 교체로 소멸).
    // 모든 가지에 걸어 "못 끄는 가지" 시도도 잡는다(작업 외 드래그 → 안내 토스트). preventDefault 로
    // 실마우스 드래그 중 텍스트 선택(파랗게 긁힘)을 차단 — click(펼치기)은 영향 없음.
    svgHost.querySelectorAll(".ctx-branch").forEach((n2) => {
      n2.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const anchor = n2.dataset.anchor || "";
        drag = { key: n2.dataset.key, kind: n2.dataset.kind, item: anchor.startsWith("item:") ? anchor.slice(5) : null, sx: e.clientX, sy: e.clientY, moved: false };
      });
    });
  };
  // 접기 칩은 svg 밖(영속)이라 1회만 바인딩 — 상태는 세션 유지(state).
  $("#trunkFoldP")?.addEventListener("click", () => { state.trunkFoldProposed = !state.trunkFoldProposed; paintSvg(); });
  $("#trunkFoldC")?.addEventListener("click", () => { state.trunkFoldClosed = !state.trunkFoldClosed; paintSvg(); });
  paintSvg();
}

// 뷰2 목록(아웃라인) — "각 갈래에 뭐가 쌓였고 뭘 할지 읽기". 접이식 details 로 그래프 없이 드릴다운.
function drawTrunkTree(body, g, ranked) {
  const L = state.lex;
  const branches = ranked.slice(0, 60);
  const hidden = ranked.length - branches.length;
  if (!branches.length) { body.innerHTML = `<div class="empty">${L.trunk_tree_empty}</div>`; return; }
  const items = branches.map((b) => {
    const rev = b.open_review_count ? `<span class="fav-chip mini danger-text">${L.trunk_col_reviews} ${b.open_review_count}</span>` : "";
    return `<details class="trunk-tree-item" data-key="${esc(b.branch_key)}">
      <summary style="cursor:pointer;padding:5px 2px;border-bottom:1px solid var(--border,#8883)">
        <strong>${esc(b.label || b.branch_key)}</strong>
        <span class="dim small"> · ${L.trunk_col_sources} ${b.source_count} · ${L.trunk_col_tasks} ${b.task_count}</span> ${rev}
        <span class="dim small" style="float:right">${b.updated_at ? localTime(b.updated_at) : "-"}</span>
      </summary>
      <div class="trunk-tree-kids" style="padding:2px 0 8px 12px"></div>
    </details>`;
  }).join("");
  body.innerHTML = items + (hidden > 0 ? `<div class="dim small">… ${(L.trunk_more ?? "+{n}개 더").replace("{n}", hidden)}</div>` : "");
  // 펼칠 때 lazy 렌더(초기 전개 비용 회피)
  body.querySelectorAll(".trunk-tree-item").forEach((d) => d.addEventListener("toggle", () => {
    if (!d.open) return;
    const kidsEl = d.querySelector(".trunk-tree-kids");
    if (kidsEl.dataset.loaded) return;
    kidsEl.dataset.loaded = "1";
    kidsEl.innerHTML = trunkChildTable(g, d.dataset.key);
  }));
}

// 뷰3 우선순위(트리아지) — "뭐부터 손대나". 미결 리뷰 내림차순(동수는 오래된 갱신 먼저). 행 클릭→하위 펼침.
function drawTrunkTriage(body, g, ranked) {
  const L = state.lex;
  const sorted = ranked.slice().sort((a, b) =>
    (b.open_review_count - a.open_review_count) || String(a.updated_at ?? "").localeCompare(String(b.updated_at ?? "")));
  const rows = sorted.map((b) => `<tr class="trunk-triage-row" data-key="${esc(b.branch_key)}" style="cursor:pointer">
    <td><strong>${esc(b.label || b.branch_key)}</strong></td>
    <td class="num">${b.open_review_count ? `<span class="danger-text">${b.open_review_count}</span>` : "0"}</td>
    <td class="num">${b.source_count}</td><td class="num">${b.task_count}</td>
    <td class="dim">${b.updated_at ? localTime(b.updated_at) : "-"}</td></tr>`).join("");
  body.innerHTML = `
    <table><thead><tr><th>${L.trunk_col_label}</th><th>${L.trunk_col_reviews}</th><th>${L.trunk_col_sources}</th><th>${L.trunk_col_tasks}</th><th>${L.trunk_col_updated}</th></tr></thead><tbody>${rows}</tbody></table>
    <div id="ctxDetail" class="dim small" style="margin-top:8px">${L.trunk_triage_hint}</div>`;
  body.querySelectorAll(".trunk-triage-row").forEach((tr) => tr.addEventListener("click", () => {
    const b = sorted.find((x) => x.branch_key === tr.dataset.key);
    $("#ctxDetail").innerHTML = `<h4 class="hub-h4">${esc(b?.label ?? tr.dataset.key)} <span class="dim small">(${L.trunk_open_reviews} ${b?.open_review_count ?? 0})</span></h4>${trunkChildTable(g, tr.dataset.key)}`;
  }));
}

// 탭4: 기존 매뉴얼/FAQ 관리. 챗봇 검색 소스 + 미응답 질문 큐(야간 갱신 대상). 메타 전용.
async function renderKnowFaq(el) {
  const L = state.lex;
  const [faqs, unanswered] = await Promise.all([api("/api/faq"), api("/api/chat/unanswered?limit=30")]);
  const rows = faqs.map((f) => `<tr>
    <td>${esc(f.topic ?? "-")}</td><td><strong>${esc(f.question)}</strong></td>
    <td>${esc((f.answer ?? "").slice(0, 60))}${(f.answer ?? "").length > 60 ? "…" : ""}</td>
    <td class="dim">${esc(f.keywords ?? "")}</td><td class="pointer">${esc(f.pointer ?? "-")}</td>
  </tr>`).join("");
  const unRows = unanswered.map((u) => `<tr><td>${esc(u.question)}</td><td class="num">${u.n}</td><td class="dim">${u.last_at ? localTime(u.last_at) : "-"}</td>
    <td><button class="fav-chip mini faq-from" data-q="${esc(u.question)}">+ ${L.faq_new}</button></td></tr>`).join("");
  el.innerHTML = `
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
  el.querySelectorAll(".faq-from").forEach((b) => b.addEventListener("click", () => { $("#fqQ").value = b.dataset.q; $("#fqA").focus(); }));
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
        <input id="calcName" placeholder="${L.calc_name}" />
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

// P-13 작성법 위저드 — 문서 종류 select + 필요 입력 칩 + 7스텝 절차(읽기 전용 안내).
async function renderRecipe() {
  const L = state.lex;
  const recipes = await api(`/api/doc/recipes?mode=${state.mode}`);
  state.recipeKey ??= recipes[0]?.key;
  const cur = recipes.find((r) => r.key === state.recipeKey) || recipes[0];
  const opts = recipes.map((r) => `<option value="${esc(r.key)}" ${r.key === cur?.key ? "selected" : ""}>${esc(r.name)}</option>`).join("");
  const inputChips = (cur?.required_input || []).map((x) => `<span class="badge">${esc(x)}</span>`).join(" ");
  const steps = (cur?.steps || []).map((s, i) => `<li class="recipe-step"><strong>${i + 1}. ${esc(s.name)}</strong><div class="dim">${esc(s.tip)}</div></li>`).join("");
  $("#view").innerHTML = `
    <div class="filters">
      <label>${L.recipe_pick}</label> <select id="recipeSel">${opts}</select>
      <span class="dim">${L.recipe_readonly ?? ""}</span>
    </div>
    <div class="recipe-req"><span class="dim">${L.recipe_required}:</span> ${inputChips || '<span class="dim">-</span>'}</div>
    <h3>${L.recipe_steps}</h3>
    <ol class="recipe-steps">${steps || `<li class="dim">-</li>`}</ol>`;
  $("#recipeSel").addEventListener("change", (e) => { state.recipeKey = e.target.value; render(); });
}

// P-19/P-4 키스톤: 제안 큐 독립 화면 — 추천 스캔 + 승인/반려(게이트 화면 섹션과 동일 라우트).
async function loadProposalsForCurrentAccount() {
  if (!state.account?.is_admin) return [];
  const proposals = await api("/api/proposals", { acceptedDomainStatuses: [403] });
  return Array.isArray(proposals) ? proposals : [];
}

async function renderProposals() {
  const L = state.lex;
  const props = await loadProposalsForCurrentAccount();
  const rows = props.length
    ? `<table><tbody>${props.map((p) => `<tr data-prop="${esc(p.id)}">
        <td><span class="badge">${esc(p.kind === "completion_digest" ? (L.prop_kind_digest ?? "완료 요약") : eventKindLabel(p.kind))}</span></td>
        <td>${p.kind === "completion_digest"
          ? `${esc(p.payload?.summary ?? p.summary ?? "")}${(p.payload?.next_actions || []).length ? `<div class="dim mini">${L.prop_next_actions ?? "다음 할 일"}</div>${p.payload.next_actions.map((a) => `<div class="digest-na"><span>${esc(a)}</span><button class="fav-chip na-add" data-na-proj="${esc(p.payload?.project_id ?? "")}" data-na-title="${esc(a)}">${L.prop_na_add ?? "+ 할일로"}</button></div>`).join("")}` : ""}${p.payload?.knowledge ? `<div class="dim mini">💡 ${esc(p.payload.knowledge)}${p.payload?.assignee_ref ? ` <button class="fav-chip mini mem-add" data-mem-ref="${esc(p.payload.assignee_ref)}" data-mem-proj="${esc(p.payload?.project_id ?? "")}" data-mem-text="${esc(p.payload.knowledge)}" title="${esc(p.payload.assignee_ref)} ${L.prop_mem_add_hint ?? "메모리에 추가 — 다음 시작에 주입"}">${L.prop_mem_add ?? "+ 메모리"}</button>` : ""}</div>` : ""}`
          : esc(p.summary ?? p.payload?.title ?? p.id)}</td>
        <td class="dim">${esc(p.source)}</td>
        <td><button class="fav-chip prop-approve">${L.prop_approve}</button> <button class="fav-chip prop-reject">${L.prop_reject}</button> <span class="prop-msg dim"></span></td>
      </tr>`).join("")}</tbody></table>`
    : `<div class="empty">${L.prop_empty}</div>`;
  $("#view").innerHTML = `<div class="filters"><button id="runRec2" class="fav-chip">${L.rec_run}</button>
    <span class="dim">${L.prop_queue_title} (${props.length})</span></div>${rows}`;
  $("#runRec2").addEventListener("click", async () => { await post("/api/recommenders/run", { scope: "all" }); render(); });
  $("#view").querySelectorAll("[data-prop]").forEach((tr) => {
    const id = tr.dataset.prop;
    tr.querySelector(".prop-approve").addEventListener("click", async () => {
      const res = await (await post("/api/proposals/approve", { id })).json();
      if (res.ok) render(); else tr.querySelector(".prop-msg").textContent = `✗ ${res.error ?? ""}`;
    });
    tr.querySelector(".prop-reject").addEventListener("click", async () => { await post("/api/proposals/reject", { id, reason: "" }); render(); });
  });
  // S7 핸드오프: 완료 요약의 '다음 할 일'을 한 클릭으로 실제 할일로 생성(같은 프로젝트). AI가 완료를 분석→사람이 한 번에 이어받기.
  $("#view").querySelectorAll(".na-add").forEach((b) => {
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const proj = b.dataset.naProj, title = b.dataset.naTitle;
      if (!proj) { toast(L.prop_na_noproj ?? "프로젝트를 알 수 없어 생성할 수 없어요", "error"); return; }
      const resp = await post("/api/items", { project_id: proj, title });
      if (resp.ok) { b.disabled = true; b.textContent = L.prop_na_added ?? "✓ 생성됨"; toast(L.prop_na_done ?? "할 일로 만들었어요", "ok"); }
      else { const er = await resp.json().catch(() => ({})); toast((L.prop_na_fail ?? "생성 실패") + (er.error ? ` (${er.error})` : ""), "error"); }
    });
  });
  $("#view").querySelectorAll(".mem-add").forEach((b) => {
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const resp = await post("/api/memory/append", { ref: b.dataset.memRef, text: b.dataset.memText, project_id: b.dataset.memProj || null });
      if (resp.ok) { b.disabled = true; b.textContent = L.prop_mem_added ?? "✓ 메모리"; toast(`${b.dataset.memRef} ${L.prop_mem_added_toast ?? "메모리에 추가됨 — 다음 시작에 주입"}`, "ok"); }
      else { const er = await resp.json().catch(() => ({})); toast((L.prop_mem_fail ?? "메모리 추가 실패") + (er.error ? ` (${er.error})` : ""), "error"); }
    });
  });
}

// P-18 외부 시트 임베드(Smartsheet) read-only — 게시 URL 등록 + iframe 표시. 양방향/토큰 없음.
async function renderEmbeds() {
  const L = state.lex;
  const embeds = await api("/api/embeds");
  const frames = embeds.map((e) => `<section class="embed-card">
    <h3>${esc(e.title)} <span class="dim">${esc(e.kind)}</span> <a href="${esc(e.url)}" target="_blank" rel="noopener" class="dim">↗</a></h3>
    <iframe src="${esc(e.url)}" sandbox="allow-scripts allow-same-origin allow-popups" loading="lazy" class="embed-frame" title="${esc(e.title)}"></iframe>
  </section>`).join("");
  $("#view").innerHTML = `
    <div class="item-form">
      <input id="embTitle" placeholder="${L.th_subject}" size="10" />
      <input id="embUrl" placeholder="${L.embed_url}" size="32" />
      <button id="embAdd" class="fav-chip">${L.embed_add}</button>
      <span id="embMsg" class="dim"></span>
    </div>
    ${frames || `<div class="empty">${L.embed_empty}</div>`}`;
  $("#embAdd").addEventListener("click", async () => {
    const title = $("#embTitle").value.trim(), url = $("#embUrl").value.trim();
    if (!title || !url) return;
    const r = await (await post("/api/embeds", { title, url })).json();
    if (r.ok) render(); else $("#embMsg").textContent = r.error === "url_not_allowed" ? L.embed_url_bad : (r.error ?? "");
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
  const selectedBoard = boards.find((p) => p.id === state.bomBoard);
  const sel = selectedBoard?.id || boards[0]?.id || "";
  if (state.bomBoard && !selectedBoard) state.bomBoard = sel;
  const bom = sel ? await api(`/api/bom?parent=${encodeURIComponent(sel)}`) : [];
  const comp = sel ? await api(`/api/parts/completeness?part=${encodeURIComponent(sel)}`, { acceptedDomainStatuses: [404] }) : null;
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
    <td>${c.projects.map((x) => `<span class="badge">${esc(x)}</span>`).join(" ") || '<span class="dim">-</span>'} <button class="fav-chip mini ct-edit" data-ct-edit="${esc(c.id)}" title="${L.master_edit ?? "수정"}">✎</button><button class="fav-chip mini danger ct-del" data-ct-del="${esc(c.id)}" title="${L.master_del ?? "삭제"}">×</button></td>
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
  $("#view").querySelectorAll(".ct-del").forEach((b) => b.addEventListener("click", async () => {
    if (!(await uiConfirm(L.master_del_confirm ?? "삭제할까요? 되돌릴 수 없습니다."))) return;
    const r = await post("/api/contacts/delete", { id: b.dataset.ctDel });
    if (r.ok) { toast(L.master_deleted ?? "삭제됨", "ok"); render(); } else toast(L.master_del_fail ?? "삭제 실패", "error");
  }));
  $("#view").querySelectorAll(".ct-edit").forEach((b) => b.addEventListener("click", async () => {
    const c = contacts.find((x) => x.id === b.dataset.ctEdit);
    const nt = prompt(L.master_edit_name_ph ?? "이름", c?.name ?? "");
    if (nt === null) return;
    if (!nt.trim()) { toast(L.master_edit_fail ?? "수정 실패", "error"); return; }
    const r = await post("/api/contacts/update", { id: b.dataset.ctEdit, name: nt.trim() });
    if (r.ok) { toast(L.master_edited ?? "수정됨", "ok"); render(); } else toast(L.master_edit_fail ?? "수정 실패", "error");
  }));
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
      <td>${po.projects.map((x) => `<span class="badge">${esc(x)}</span>`).join(" ") || '<span class="dim">-</span>'} <button class="fav-chip mini danger po-del" data-po-del="${esc(po.id)}" title="${L.master_del ?? "삭제"}">×</button></td>
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
  $("#view").querySelectorAll(".po-del").forEach((b) => b.addEventListener("click", async () => {
    if (!(await uiConfirm(L.master_del_confirm ?? "삭제할까요? 되돌릴 수 없습니다."))) return;
    const r = await post("/api/purchases/delete", { id: b.dataset.poDel });
    if (r.ok) { toast(L.master_deleted ?? "삭제됨", "ok"); render(); } else toast(L.master_del_fail ?? "삭제 실패", "error");
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
function closeMobileFloatingOverlays({ keepChat = false, keepTaskCodexItemId = null } = {}) {
  if (!isMobileViewport()) return;
  if (!keepChat) document.querySelector(".chat-overlay")?.remove();
  for (const node of taskCodexOverlays()) {
    if (keepTaskCodexItemId !== null && node.dataset.itemId === String(keepTaskCodexItemId)) continue;
    node.remove();
  }
}

function openChat() {
  const L = state.lex;
  const chatVersion = versionPart("chatbot");
  const runtime = state.version?.runtime || {};
  const llm = runtime.llm || {};
  closeMobileFloatingOverlays({ keepChat: true });
  document.querySelector(".chat-overlay")?.remove();
  const ov = document.createElement("div");
  ov.className = "chat-overlay";
  ensureChatThread();
  restoreChatLog();
  ov.innerHTML = `<div class="chat-panel" role="complementary" aria-label="${L.chat_title}" aria-busy="false">
    <div class="chat-head"><strong>${L.chat_title}</strong><span class="dim">${L.chat_note}</span>
      <span class="chat-ver" title="${esc(`${L.chat_version_label} ${chatVersion.build} · ${chatVersion.source} · ${runtime.checkout || "unknown"}:${runtime.port ?? "?"} · ${llm.provider || "?"}/${llm.model || "?"} · thinking=${llm.thinking === true}`)}">${esc(L.chat_version_label)} ${esc(chatVersion.release)}</span><button class="chat-new" title="${L.chat_new}">${L.chat_new}</button><button class="chat-collapse" title="접기/펼치기" aria-label="접기/펼치기" aria-expanded="true">-</button><button class="chat-x">✕</button></div>
    <div class="chat-log" role="log" aria-live="polite" aria-busy="false"></div>
    <div class="chat-status" role="status" aria-live="polite"></div>
    <div class="chat-input"><input id="chatMsg" placeholder="${L.chat_placeholder}" /><button id="chatMic" class="fav-chip mic-btn" type="button" title="${L.chat_mic ?? "음성 입력(브라우저 인식 — 민감 내용 주의)"}">🎤</button><button id="chatSend" class="fav-chip">${L.chat_send}</button></div>
    <div class="chat-resize" title="크기 조절" aria-hidden="true"></div>
  </div>`;
  document.body.appendChild(ov);
  const panel = ov.querySelector(".chat-panel");
  const headEl = ov.querySelector(".chat-head");
  const headNote = ov.querySelector(".chat-head .dim");
  const resizeEl = ov.querySelector(".chat-resize");
  const logEl = ov.querySelector(".chat-log");
  const statusEl = ov.querySelector(".chat-status");
  const inputEl = ov.querySelector("#chatMsg");
  const sendBtn = ov.querySelector("#chatSend");
  const collapseBtn = ov.querySelector(".chat-collapse");
  wireMicDictation(ov.querySelector("#chatMic"), inputEl);
  const saveDock = () => localStorage.setItem("dev_erp_chat_dock", JSON.stringify(state.chatDock || {}));
  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
  const resetMobileDockFrame = () => {
    ov.style.left = "";
    ov.style.top = "";
    ov.style.right = "";
    ov.style.bottom = "";
    panel.style.width = "";
    panel.style.height = "";
  };
  const applyDock = () => {
    if (isMobileViewport()) {
      resetMobileDockFrame();
      return;
    }
    const d = state.chatDock || {};
    const nextW = Number.isFinite(d.w)
      ? clamp(d.w, 320, Math.max(320, window.innerWidth - 16))
      : Math.min(420, Math.max(320, window.innerWidth - 32));
    const nextH = Number.isFinite(d.h)
      ? clamp(d.h, 360, Math.max(260, window.innerHeight - 16))
      : Math.min(560, Math.max(260, window.innerHeight - 32));
    if (Number.isFinite(d.w)) panel.style.width = `${nextW}px`;
    if (Number.isFinite(d.h)) panel.style.height = `${nextH}px`;
    if (Number.isFinite(d.x) && Number.isFinite(d.y)) {
      const nx = clamp(d.x, 8, Math.max(8, window.innerWidth - nextW - 8));
      const ny = clamp(d.y, 8, Math.max(8, window.innerHeight - nextH - 8));
      ov.style.left = `${nx}px`; ov.style.top = `${ny}px`; ov.style.right = "auto"; ov.style.bottom = "auto";
      if (nx !== d.x || ny !== d.y) {
        state.chatDock = { ...(state.chatDock || {}), x: nx, y: ny };
        saveDock();
      }
    }
  };
  const setCollapsed = (v) => {
    state.chatDock = { ...(state.chatDock || {}), collapsed: !!v };
    panel.classList.toggle("collapsed", !!v);
    collapseBtn.textContent = v ? "+" : "-";
    collapseBtn.setAttribute("aria-expanded", String(!v));
    saveDock();
  };
  applyDock();
  setCollapsed(!!state.chatDock?.collapsed);
  let pending = false;
  let activePendingId = null;
  let waitTimers = [];
  const CHAT_PENDING_MIN_MS = 700;
  const nextPaintFrame = () => new Promise((resolve) => {
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 16);
  });
  const waitPendingMinimum = (startedAt) => new Promise((resolve) => {
    const elapsed = performance.now() - startedAt;
    setTimeout(resolve, Math.max(0, CHAT_PENDING_MIN_MS - elapsed));
  });
  const pendingLabel = (stage) => stage === "slow" ? L.chat_wait_slow : (stage === "working" ? L.chat_wait_working : (stage === "queued" ? L.chat_wait_queued : L.chat_wait_preparing));
  const pendingStatus = (stage) => stage === "slow" ? L.chat_wait_slow_status : (stage === "working" ? L.chat_wait_working_status : (stage === "queued" ? L.chat_wait_queued_status : L.chat_wait_preparing_status));
  const clearWaitTimers = () => { waitTimers.forEach(clearTimeout); waitTimers = []; };
  const setWaitStage = (stage) => {
    const m = state.chatLog.find((x) => x.pending && x.id === activePendingId);
    if (!m) return;
    m.wait_stage = stage;
    statusEl.textContent = pendingStatus(stage);
    headNote.textContent = pendingLabel(stage);
    paint();
  };
  const setPending = (v) => {
    pending = v;
    sendBtn.disabled = v;
    panel.setAttribute("aria-busy", String(v));
    logEl.setAttribute("aria-busy", String(v));
    clearWaitTimers();
    if (v) {
      statusEl.textContent = pendingStatus("queued");
      headNote.textContent = pendingLabel("queued");
      waitTimers = [
        setTimeout(() => setWaitStage("preparing"), 600),
        setTimeout(() => setWaitStage("working"), 1600),
        setTimeout(() => setWaitStage("slow"), 8000),
      ];
    } else {
      statusEl.textContent = "";
      headNote.textContent = L.chat_note;
      activePendingId = null;
    }
  };
  const wrapLongText = (text) => {
    const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && next.length > 96) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    return lines.join("\n\n");
  };
  const readableChatText = (text, role) => {
    const raw = String(text ?? "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (role !== "ai" || raw.includes("\n")) return raw;
    const sentences = raw.match(/[^.!?。！？]+[.!?。！？]+["')\]]*|[^.!?。！？]+$/g)?.map((s) => s.trim()).filter(Boolean) || [];
    if (sentences.length <= 1) return raw.length > 120 ? wrapLongText(raw) : raw;
    const chunks = [];
    let chunk = "";
    for (const sentence of sentences) {
      const next = chunk ? `${chunk} ${sentence}` : sentence;
      if (chunk && next.length > 110) { chunks.push(chunk); chunk = sentence; }
      else chunk = next;
    }
    if (chunk) chunks.push(chunk);
    return chunks.join("\n\n");
  };
  const chatMeta = (m) => {
    if (m.role !== "ai") return "";
    const bits = [];
    if (m.handled_by_runtime) bits.push("즉답");
    else if (m.llm) bits.push((m.thinking || m.reasoning) ? "LLM 추론" : "LLM");
    else if (m.matched === false) bits.push("검색/폴백");
    if (m.provider && m.model) bits.push(`${m.provider}/${m.model}`);
    const ver = m.chatbot_version?.release || m.chatbot_version?.build;
    if (ver) bits.push(ver);
    return bits.length ? `<div class="chat-meta">${esc(bits.join(" · "))}</div>` : "";
  };
  const paint = () => {
    logEl.innerHTML = state.chatLog.length
      ? state.chatLog.map((m) => {
          if (m.pending) {
            const txt = pendingLabel(m.wait_stage);
            return `<div class="chat-row ai pending"><div class="chat-msg ai pending" aria-label="${esc(txt)}"><span>${esc(txt)}</span><span class="chat-typing" aria-hidden="true"><i></i><i></i><i></i></span></div></div>`;
          }
          const src = m.source ? `<div class="chat-src">📖 ${esc(m.source.topic ?? "")} · ${esc(m.source.question ?? "")}</div>`
            : (m.role === "ai" && m.matched === false && !m.handled_by_llm && !m.handled_by_runtime ? `<div class="chat-src dim">${L.chat_unmatched}</div>` : "");
          const meta = chatMeta(m);
          // 약매칭/미매칭 후보 → 눌러서 바로 그 매뉴얼 질문으로 다시 묻기(끊기지 않게).
          const cand = (m.role === "ai" && !m.matched && Array.isArray(m.candidates) && m.candidates.length)
            ? `<div class="chat-cands">${m.candidates.map((c) => `<button class="fav-chip chat-cand" data-q="${esc(c.question)}">${esc(c.question)}</button>`).join("")}</div>` : "";
          return `<div class="chat-row ${m.role}"><div class="chat-msg ${m.role}"><span>${esc(readableChatText(m.text, m.role))}</span>${src}${meta}</div>${cand}</div>`;
        }).join("")
      : `<div class="empty small">${L.chat_empty}</div>`;
    logEl.scrollTop = logEl.scrollHeight;
  };
  paint();
  const close = () => ov.remove();
  ov.querySelector(".chat-x").addEventListener("click", close);
  collapseBtn.addEventListener("click", () => {
    if (pending) { statusEl.textContent = pendingStatus("working"); return; }
    setCollapsed(!state.chatDock?.collapsed);
    if (!state.chatDock?.collapsed) inputEl.focus();
  });
  let suppressHeadClick = false;
  let drag = null;
  const rememberSize = () => {
    if (isMobileViewport()) return;
    if (state.chatDock?.collapsed) return;
    const r = panel.getBoundingClientRect();
    state.chatDock = { ...(state.chatDock || {}), w: Math.round(r.width), h: Math.round(r.height) };
    saveDock();
  };
  new ResizeObserver(rememberSize).observe(panel);
  const moveDock = (x, y, w, h) => {
    if (isMobileViewport()) {
      resetMobileDockFrame();
      return;
    }
    const nx = clamp(x, 8, Math.max(8, window.innerWidth - w - 8));
    const ny = clamp(y, 8, Math.max(8, window.innerHeight - h - 8));
    ov.style.left = `${nx}px`; ov.style.top = `${ny}px`; ov.style.right = "auto"; ov.style.bottom = "auto";
    state.chatDock = { ...(state.chatDock || {}), x: Math.round(nx), y: Math.round(ny) };
    saveDock();
  };
  const onDragMove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    moveDock(e.clientX - drag.offsetX, e.clientY - drag.offsetY, drag.width, drag.height);
  };
  const onDragUp = () => {
    if (drag?.moved) suppressHeadClick = true;
    drag = null;
    document.removeEventListener("pointermove", onDragMove);
    document.removeEventListener("pointerup", onDragUp);
  };
  headEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    if (isMobileViewport()) return;
    const r = panel.getBoundingClientRect();
    drag = { startX: e.clientX, startY: e.clientY, offsetX: e.clientX - r.left, offsetY: e.clientY - r.top, width: r.width, height: r.height, moved: false };
    document.addEventListener("pointermove", onDragMove);
    document.addEventListener("pointerup", onDragUp);
  });
  headEl.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    if (suppressHeadClick) { suppressHeadClick = false; return; }
    if (pending) { statusEl.textContent = pendingStatus("working"); return; }
    setCollapsed(!state.chatDock?.collapsed);
    if (!state.chatDock?.collapsed) inputEl.focus();
  });
  let resizeDrag = null;
  const resizeDock = (w, h, left, top) => {
    if (isMobileViewport()) {
      resetMobileDockFrame();
      return;
    }
    const nw = clamp(w, 320, Math.max(320, window.innerWidth - left - 8));
    const nh = clamp(h, 360, Math.max(360, window.innerHeight - top - 8));
    panel.style.width = `${nw}px`;
    panel.style.height = `${nh}px`;
    state.chatDock = { ...(state.chatDock || {}), w: Math.round(nw), h: Math.round(nh) };
    saveDock();
  };
  const onResizeMove = (e) => {
    if (!resizeDrag) return;
    resizeDock(resizeDrag.startW + e.clientX - resizeDrag.startX, resizeDrag.startH + e.clientY - resizeDrag.startY, resizeDrag.left, resizeDrag.top);
  };
  const onResizeUp = () => {
    resizeDrag = null;
    document.removeEventListener("pointermove", onResizeMove);
    document.removeEventListener("pointerup", onResizeUp);
  };
  resizeEl.addEventListener("pointerdown", (e) => {
    if (isMobileViewport()) return;
    if (state.chatDock?.collapsed) return;
    e.preventDefault();
    e.stopPropagation();
    const r = panel.getBoundingClientRect();
    resizeDrag = { startX: e.clientX, startY: e.clientY, startW: r.width, startH: r.height, left: r.left, top: r.top };
    document.addEventListener("pointermove", onResizeMove);
    document.addEventListener("pointerup", onResizeUp);
  });
  window.addEventListener("resize", () => { if (isMobileViewport()) resetMobileDockFrame(); }, { passive: true });
  // /new: 새 대화 — 스레드 리셋(로컬 LLM 스레드 오염 방지). 로그는 서버에 남아 야간 갱신에 쓰임.
  ov.querySelector(".chat-new").addEventListener("click", () => {
    if (pending) return;
    startFreshChatThread(); paint();
    inputEl.focus();
  });
  const send = async () => {
    if (pending) return;
    const msg = inputEl.value.trim(); if (!msg) return;
    if (msg === "/new") { startFreshChatThread(); inputEl.value = ""; paint(); return; }
    const pendingId = `pending_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const replacePending = (entry) => {
      const i = state.chatLog.findIndex((m) => m.pending && m.id === pendingId);
      if (i >= 0) state.chatLog.splice(i, 1, entry);
      else state.chatLog.push(entry);
      saveChatLog();
    };
    activePendingId = pendingId;
    let finalStatus = "";
    let finalEntry = null;
    const pendingStartedAt = performance.now();
    state.chatLog.push({ role: "user", text: msg }, { role: "ai", pending: true, wait_stage: "queued", id: pendingId });
    saveChatLog();
    inputEl.value = ""; paint(); setPending(true);
    try {
      await nextPaintFrame();
      const resp = await postJsonWithTimeout("/api/chat", { message: msg, thread_id: state.chatThread });
      const r = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(r.error || "chat_failed");
      finalEntry = { role: "ai", text: r.text || L.chat_empty_reply, source: r.source, matched: r.matched, candidates: r.candidates || [], llm: r.llm, thinking: r.thinking, reasoning: r.reasoning, provider: r.provider, model: r.model, chatbot_version: r.chatbot_version, handled_by_llm: r.handled_by_llm, handled_by_runtime: r.handled_by_runtime, context_used: r.context_used, mode: r.mode };
      finalStatus = L.chat_done_status || "답변 완료";
    } catch (error) {
      const msgText = error?.name === "AbortError" || error?.kind === "timeout"
        ? (L.chat_timeout_retry || "답변이 오래 걸려 중단했어요. 입력창은 다시 열렸으니 같은 질문을 한 번만 다시 보내 주세요.")
        : (error?.message === "login_required" || error?.kind === "unauthorized"
          ? (L.chat_login_required || "로그인이 풀렸어요. 다시 로그인한 뒤 질문해 주세요.")
          : L.chat_error_retry);
      finalEntry = { role: "ai", text: msgText, matched: false, candidates: [] };
      finalStatus = msgText;
    } finally {
      await waitPendingMinimum(pendingStartedAt);
      if (finalEntry) replacePending(finalEntry);
      setPending(false);
      if (finalStatus) statusEl.textContent = finalStatus;
      paint();
      inputEl.focus();
    }
  };
  sendBtn.addEventListener("click", send);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
  // 후보 칩 클릭 → 그 질문으로 즉시 재질의(끊기지 않는 흐름).
  logEl.addEventListener("click", (e) => {
    const b = e.target.closest(".chat-cand"); if (!b) return;
    if (pending) return;
    inputEl.value = b.dataset.q || ""; send();
  });
  if (!state.chatDock?.collapsed) inputEl.focus();
}

// 화면 정중앙 확인 모달 (native confirm 은 위치 제어 불가 → 커스텀). Promise<boolean> 반환.
let taskCodexStackZ = 730;

function taskCodexOverlays() {
  return Array.from(document.querySelectorAll(".task-codex-overlay"));
}

function taskCodexClamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

function taskCodexDockStore() {
  const current = state.taskCodexDock || {};
  if (Number.isFinite(current.x) || Number.isFinite(current.y) || Number.isFinite(current.w) || Number.isFinite(current.h)) {
    return { __last: { ...current }, byItem: {} };
  }
  return {
    __last: current.__last || {},
    byItem: current.byItem || {},
  };
}

function saveTaskCodexDockStore(store) {
  state.taskCodexDock = { __last: store.__last || {}, byItem: store.byItem || {} };
  localStorage.setItem("dev_erp_task_codex_dock", JSON.stringify(state.taskCodexDock));
}

function taskCodexDockFor(itemId) {
  const store = taskCodexDockStore();
  const key = String(itemId);
  if (Object.prototype.hasOwnProperty.call(store.byItem || {}, key)) return store.byItem[key] || {};
  return Object.keys(store.byItem || {}).length ? {} : (store.__last || {});
}

function saveTaskCodexDockFor(itemId, layout) {
  const clean = {};
  for (const key of ["x", "y", "w", "h"]) {
    if (Number.isFinite(layout?.[key])) clean[key] = Math.round(layout[key]);
  }
  const store = taskCodexDockStore();
  store.byItem[String(itemId)] = { ...(store.byItem[String(itemId)] || {}), ...clean };
  store.__last = { ...(store.__last || {}), ...clean };
  saveTaskCodexDockStore(store);
}

function bringTaskCodexToFront(ov) {
  taskCodexStackZ += 1;
  ov.style.zIndex = String(taskCodexStackZ);
}

function tileTaskCodexPanels() {
  const panels = taskCodexOverlays();
  if (!panels.length) return;
  if (isMobileViewport()) {
    panels.forEach((panel) => {
      panel.style.left = "";
      panel.style.top = "";
      panel.style.right = "";
      panel.style.bottom = "";
      panel.style.width = "";
      panel.style.height = "";
    });
    bringTaskCodexToFront(panels[panels.length - 1]);
    return;
  }
  const gap = 10;
  const margin = 10;
  const count = panels.length;
  const cols = window.innerWidth < 800 ? 1 : (count <= 1 ? 1 : (count <= 4 ? 2 : Math.ceil(Math.sqrt(count))));
  const rows = Math.ceil(count / cols);
  const rawW = Math.floor((window.innerWidth - margin * 2 - gap * (cols - 1)) / cols);
  const rawH = Math.floor((window.innerHeight - margin * 2 - gap * (rows - 1)) / rows);
  const minW = 300;
  const minH = 340;
  const clampTile = (n, min, max) => Math.min(Math.max(n, min), Math.max(min, max));
  if (rawW < minW || rawH < minH) {
    const w = Math.min(Math.max(minW, Math.min(390, window.innerWidth - margin * 2)), window.innerWidth - margin * 2);
    const h = Math.min(Math.max(minH, Math.floor(window.innerHeight * 0.62)), window.innerHeight - margin * 2);
    panels.forEach((panel, index) => {
      const offset = (index % 4) * 28;
      const x = clampTile(margin + offset, margin, window.innerWidth - w - margin);
      const y = clampTile(margin + offset, margin, window.innerHeight - h - margin);
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.width = `${w}px`;
      panel.style.height = `${h}px`;
      saveTaskCodexDockFor(panel.dataset.itemId || `panel-${index}`, { x, y, w, h });
    });
    bringTaskCodexToFront(panels[panels.length - 1]);
    return;
  }
  const w = Math.max(minW, rawW);
  const h = Math.max(minH, rawH);
  panels.forEach((panel, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = margin + col * (w + gap);
    const y = margin + row * (h + gap);
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.width = `${w}px`;
    panel.style.height = `${h}px`;
    saveTaskCodexDockFor(panel.dataset.itemId || `panel-${index}`, { x, y, w, h });
  });
  bringTaskCodexToFront(panels[panels.length - 1]);
}

function openTaskCodex(itemId) {
  closeMobileFloatingOverlays({ keepTaskCodexItemId: itemId });
  const existing = taskCodexOverlays().find((node) => node.dataset.itemId === String(itemId));
  if (existing) {
    bringTaskCodexToFront(existing);
    existing.querySelector("#taskCodexMsg")?.focus();
    return;
  }
  const ov = document.createElement("div");
  ov.className = "task-codex-overlay";
  ov.dataset.itemId = String(itemId);
  ov.innerHTML = `<div class="task-codex-panel" role="complementary" aria-label="Codex task thread" aria-busy="false">
    <div class="task-codex-head">
      <div><strong>Codex 대화</strong><span class="task-codex-sub">할일 전용 스레드</span></div>
      <div class="task-codex-actions">
        <button class="task-codex-tile" title="열린 대화 4분할" aria-label="열린 대화 4분할">▦</button>
        <button class="task-codex-x" title="닫기" aria-label="닫기">×</button>
      </div>
    </div>
    <div class="task-codex-meta"></div>
    <div class="task-codex-tools">
      <select id="taskCodexWorkspace" title="승인된 Codex 작업실"></select>
      <select id="taskCodexModel" title="Codex model"></select>
      <select id="taskCodexEffort" title="Reasoning effort"></select>
      <label class="task-codex-attach" title="이미지·문서 첨부 — 브라우저에는 실제 경로를 노출하지 않습니다">
        <input id="taskCodexImage" type="file" accept="image/*,.pdf,.txt,.md,.csv,.json,.xml,.yaml,.yml,.log,.xlsx,.xls,.docx,.doc,.pptx,.ppt,.hwp,.hwpx,.zip,.7z,.msg,.eml,.step,.stp,.dxf" multiple />
        <span>📎 파일</span>
      </label>
      <button id="taskCodexWrite" class="task-codex-fa" type="button" title="관리자가 지정한 하위 폴더에만 임시 쓰기 승인">🔒 읽기 전용</button>
    </div>
    <div class="task-codex-attachments"></div>
    <div class="task-codex-log" role="log" aria-live="polite"></div>
    <div class="task-codex-status" role="status" aria-live="polite"></div>
    <div class="task-codex-suggest" hidden></div>
    <div class="task-codex-input"><input id="taskCodexMsg" placeholder="이 할일에 대해 Codex에게 지시" /><button id="taskCodexMic" class="fav-chip mic-btn" type="button" title="음성 입력 — 브라우저 음성인식 사용(민감 내용 구두 입력 주의)">🎤</button><button id="taskCodexSend" class="fav-chip">보내기</button></div>
    <div class="task-codex-resize" title="크기 조절" aria-hidden="true"></div>
  </div>`;
  document.body.appendChild(ov);
  bringTaskCodexToFront(ov);
  const panel = ov.querySelector(".task-codex-panel");
  const resizeEl = ov.querySelector(".task-codex-resize");
  const logEl = ov.querySelector(".task-codex-log");
  const metaEl = ov.querySelector(".task-codex-meta");
  const statusEl = ov.querySelector(".task-codex-status");
  const suggestEl = ov.querySelector(".task-codex-suggest");
  const attachEl = ov.querySelector(".task-codex-attachments");
  const inputEl = ov.querySelector("#taskCodexMsg");
  const sendBtn = ov.querySelector("#taskCodexSend");
  const workspaceEl = ov.querySelector("#taskCodexWorkspace");
  const modelEl = ov.querySelector("#taskCodexModel");
  const effortEl = ov.querySelector("#taskCodexEffort");
  const imageEl = ov.querySelector("#taskCodexImage");
  const writeBtn = ov.querySelector("#taskCodexWrite");
  wireMicDictation(ov.querySelector("#taskCodexMic"), inputEl);
  let payload = null;
  let pending = false;
  let pendingTimer = null;
  let pendingStartedAt = 0;
  let capabilities = {
    skills: [],
    defaults: { model: "gpt-5.5", effort: "medium", workspace_id: null },
    model_options: ["gpt-5.5"],
    effort_options: ["low", "medium", "high", "xhigh"],
    service_tier_options: [],
    model_catalog: [{
      slug: "gpt-5.5",
      display_name: "GPT-5.5",
      is_default: true,
      hidden: false,
      default_reasoning_effort: "medium",
      reasoning_efforts: ["low", "medium", "high", "xhigh"].map((id) => ({ id, description: "" })),
      default_service_tier: null,
      service_tiers: [],
    }],
    model_catalog_source: "fallback",
    model_catalog_error: "codex_model_catalog_not_loaded",
    workspace_registry: { configured: false, error: "workspace_registry_not_loaded", default_workspace_id: null, workspaces: [] },
  };
  let stagedImages = [];
  let workspaceExplicitlySelected = false;
  let modelSelectionOrigin = "auto";
  const taskCodexWaitStages = {
    open: [
      [0, "Codex 스레드 연결 중", "서버 PC의 Codex app-server에 연결하고 있어요."],
      [8000, "스레드 생성/재사용 중", "처음 여는 할일은 보통 20-60초 걸릴 수 있어요."],
      [25000, "Codex 첫 응답 작성 중", "스레드 제목과 할일 메타데이터를 맞추고 있어요."],
      [60000, "아직 처리 중", "창을 닫지 않아도 요청은 계속 기다립니다."]
    ],
    send: [
      [0, "Codex에 메시지 전달 중", "할일 전용 스레드로 요청을 보내고 있어요."],
      [8000, "Codex 응답 작성 중", "스킬이나 파일 확인이 있으면 조금 더 걸릴 수 있어요."],
      [25000, "아직 작업 중", "긴 응답이나 스킬 적용은 1분 안팎 걸릴 수 있어요."],
      [60000, "응답을 계속 기다리는 중", "네트워크나 Codex 앱 상태에 따라 지연될 수 있어요."]
    ]
  };
  const taskCodexOptionLabels = {
    effort: { none: "없음", minimal: "최소", low: "낮음", medium: "보통", high: "높음", xhigh: "매우 높음", max: "최대" },
    tier: { fast: "fast", flex: "flex" },
  };
  const taskCodexCatalogEntry = (slug) => (Array.isArray(capabilities.model_catalog) ? capabilities.model_catalog : [])
    .find((entry) => entry && !entry.hidden && entry.slug === slug);
  const taskCodexModelOptions = () => {
    const catalogOptions = (Array.isArray(capabilities.model_catalog) ? capabilities.model_catalog : [])
      .filter((entry) => entry && !entry.hidden && entry.slug)
      .map((entry) => String(entry.slug));
    return catalogOptions.length ? catalogOptions : (Array.isArray(capabilities.model_options) ? capabilities.model_options.map(String) : ["gpt-5.5"]);
  };
  const taskCodexEffortOptions = (slug) => {
    const entry = taskCodexCatalogEntry(slug);
    const modelEfforts = (Array.isArray(entry?.reasoning_efforts) ? entry.reasoning_efforts : [])
      .map((option) => String(option?.id || "").trim())
      .filter(Boolean);
    return modelEfforts.length ? modelEfforts : (Array.isArray(capabilities.effort_options) ? capabilities.effort_options.map(String) : ["medium"]);
  };
  const taskCodexWorkspaces = () => (Array.isArray(capabilities.workspace_registry?.workspaces)
    ? capabilities.workspace_registry.workspaces
    : []).filter((entry) => entry && entry.workspace_id);
  const taskCodexWorkspaceOptions = () => taskCodexWorkspaces().map((entry) => String(entry.workspace_id));
  const taskCodexWorkspaceEntry = (workspaceId) => taskCodexWorkspaces().find((entry) => entry.workspace_id === workspaceId);
  const normalizeTaskCodexOptions = (raw = {}) => {
    const defaults = capabilities.defaults || {};
    const pick = (selectedValue, values, fallback = "") => {
      const selected = String(selectedValue || "").trim();
      const list = Array.isArray(values) ? values.map(String) : [];
      if (selected && (!list.length || list.includes(selected))) return selected;
      const preferred = String(fallback || "").trim();
      if (preferred && (!list.length || list.includes(preferred))) return preferred;
      return list[0] || fallback;
    };
    const model = pick(raw.model, taskCodexModelOptions(), defaults.model || "gpt-5.5");
    modelSelectionOrigin = raw.model_selection_origin === "explicit" && String(raw.model || "").trim() === model
      ? "explicit"
      : "auto";
    const entry = taskCodexCatalogEntry(model);
    const efforts = taskCodexEffortOptions(model);
    const boundWorkspaceId = String(payload?.binding?.workspace_id || "").trim();
    const requestedWorkspaceId = workspaceExplicitlySelected ? String(raw.workspace_id || "").trim() : "";
    return {
      workspace_id: boundWorkspaceId || (taskCodexWorkspaceOptions().includes(requestedWorkspaceId) ? requestedWorkspaceId : ""),
      model,
      model_selection_origin: modelSelectionOrigin,
      effort: pick(raw.effort, efforts, entry?.default_reasoning_effort || defaults.effort || "medium"),
      service_tier: "", // 속도(tier) 미사용 — codex 기본값(flex·fast 제거)
    };
  };
  const currentTaskCodexOptions = () => ({
    workspace_id: workspaceEl.value || "",
    model: modelEl.value || "",
    model_selection_origin: modelSelectionOrigin,
    effort: effortEl.value || "",
    service_tier: "", // 속도(tier) 미사용 — codex 기본값
  });
  const describeTaskCodexOptions = (opt = currentTaskCodexOptions()) => [
    taskCodexWorkspaceEntry(opt.workspace_id)?.label || opt.workspace_id,
    taskCodexCatalogEntry(opt.model)?.display_name || opt.model,
    taskCodexOptionLabels.effort[opt.effort] || opt.effort,
    taskCodexOptionLabels.tier[opt.service_tier] || opt.service_tier,
  ].filter(Boolean).join(" / ");
  const saveTaskCodexOptions = () => {
    state.taskCodexOptions = currentTaskCodexOptions();
    localStorage.setItem("dev_erp_task_codex_options", JSON.stringify(state.taskCodexOptions));
  };
  const fillSelect = (el, values, labels, selected) => {
    const list = Array.isArray(values) && values.length ? values : [""];
    const selectedValue = String(selected || "");
    const fullList = selectedValue && !list.map(String).includes(selectedValue) ? [selectedValue, ...list] : list;
    el.innerHTML = fullList.map((v) => `<option value="${esc(v)}" ${selectedValue === String(v) ? "selected" : ""}>${esc(labels[v] || v || "기본")}</option>`).join("");
  };
  const renderTools = () => {
    const opt = normalizeTaskCodexOptions(state.taskCodexOptions || {});
    state.taskCodexOptions = opt;
    localStorage.setItem("dev_erp_task_codex_options", JSON.stringify(opt));
    const modelLabels = Object.fromEntries((capabilities.model_catalog || []).map((entry) => [entry.slug, entry.display_name || entry.slug]));
    const workspaceLabels = { "": "작업실 설정 필요", ...Object.fromEntries(taskCodexWorkspaces().map((entry) => [entry.workspace_id, entry.label || entry.workspace_id])) };
    fillSelect(workspaceEl, ["", ...taskCodexWorkspaceOptions()], workspaceLabels, opt.workspace_id);
    fillSelect(modelEl, taskCodexModelOptions(), modelLabels, opt.model);
    fillSelect(effortEl, taskCodexEffortOptions(opt.model), taskCodexOptionLabels.effort, opt.effort);
    modelEl.title = capabilities.model_catalog_error
      ? `Codex 모델 목록 확인 실패 — GPT-5.5 폴백: ${capabilities.model_catalog_error}`
      : "현재 Codex 계정에서 사용 가능한 모델";
    workspaceEl.disabled = !!payload?.binding?.workspace_id;
    workspaceEl.title = capabilities.workspace_registry?.error
      ? `작업실 설정 확인 필요: ${capabilities.workspace_registry.error}`
      : (workspaceEl.disabled ? "이 스레드에 고정된 작업실" : "승인된 작업실 선택");
  };
  const loadCapabilities = async () => {
    try {
      const nextCapabilities = await api(`/api/codex-task/capabilities?item_id=${encodeURIComponent(itemId)}`, { acceptedDomainStatuses: [403, 404] });
      if (nextCapabilities?.error) throw new Error(nextCapabilities.error);
      capabilities = nextCapabilities;
    } catch {
      capabilities = {
        skills: [],
        defaults: { model: "gpt-5.5", effort: "medium", workspace_id: null },
        model_options: ["gpt-5.5"],
        effort_options: ["low", "medium", "high", "xhigh"],
        service_tier_options: [],
        model_catalog: [{
          slug: "gpt-5.5",
          display_name: "GPT-5.5",
          is_default: true,
          hidden: false,
          default_reasoning_effort: "medium",
          reasoning_efforts: ["low", "medium", "high", "xhigh"].map((id) => ({ id, description: "" })),
          default_service_tier: null,
          service_tiers: [],
        }],
        model_catalog_source: "fallback",
        model_catalog_error: "codex_model_capabilities_request_failed",
        workspace_registry: { configured: false, error: "workspace_capabilities_request_failed", default_workspace_id: null, workspaces: [] },
      };
    }
    renderTools();
  };
  const renderAttachments = () => {
    attachEl.innerHTML = stagedImages.length
      ? stagedImages.map((f, idx) => `<button class="task-codex-chip" data-img-remove="${idx}" title="${esc(f.name)}">${esc(f.name)}</button>`).join("")
      : "";
  };
  const uploadStagedImages = async () => {
    const uploaded = [];
    for (const file of stagedImages) {
      const url = `/api/codex-task/attachment?item_id=${encodeURIComponent(itemId)}&filename=${encodeURIComponent(file.name)}`;
      const resp = await request(url, {
        method: "POST",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
        timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS,
        acceptHttpError: true
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body.error || "image_upload_failed");
      if (body.attachment) uploaded.push(body.attachment);
    }
    stagedImages = [];
    renderAttachments();
    return uploaded;
  };
  const currentSkillToken = () => {
    const left = inputEl.value.slice(0, inputEl.selectionStart ?? inputEl.value.length);
    const m = left.match(/(^|\s)([$/])([A-Za-z0-9_.:-]*)$/);
    if (!m) return null;
    return { prefix: m[3] || "", start: left.length - m[0].trimStart().length, sigil: m[2] };
  };
  const renderSkillSuggest = () => {
    const token = currentSkillToken();
    const prefix = token?.prefix?.toLowerCase() || "";
    if (!token || !capabilities.skills?.length) {
      suggestEl.hidden = true;
      suggestEl.innerHTML = "";
      return;
    }
    const matches = capabilities.skills
      .filter((s) => s.name.toLowerCase().includes(prefix))
      .slice(0, 8);
    if (!matches.length) {
      suggestEl.hidden = true;
      suggestEl.innerHTML = "";
      return;
    }
    suggestEl.hidden = false;
    suggestEl.innerHTML = matches.map((s) => `<button type="button" data-skill="${esc(s.name)}"><b>${esc(s.name)}</b><span>${esc(s.description || "")}</span></button>`).join("");
  };
  const saveDock = (layout) => saveTaskCodexDockFor(itemId, layout);
  const resetMobileFrame = () => {
    ov.style.left = "";
    ov.style.top = "";
    ov.style.right = "";
    ov.style.bottom = "";
    ov.style.width = "";
    ov.style.height = "";
  };
  const minPanelWidth = () => Math.min(300, Math.max(240, window.innerWidth - 16));
  const minPanelHeight = () => Math.min(window.innerWidth <= 640 ? 320 : 340, Math.max(260, window.innerHeight - 16));
  const clampSize = (w, h, left = 8, top = 8) => {
    const minW = minPanelWidth();
    const minH = minPanelHeight();
    return {
      w: taskCodexClamp(w, minW, Math.max(minW, window.innerWidth - left - 8)),
      h: taskCodexClamp(h, minH, Math.max(minH, window.innerHeight - top - 8)),
    };
  };
  const clampDock = (x, y, w, h) => ({
    x: Math.min(Math.max(x, 8), Math.max(8, window.innerWidth - w - 8)),
    y: Math.min(Math.max(y, 8), Math.max(8, window.innerHeight - h - 8)),
  });
  const applyPanelFrame = (x, y, w, h, { save = true } = {}) => {
    if (isMobileViewport()) {
      resetMobileFrame();
      return;
    }
    const sized = clampSize(w, h);
    const p = clampDock(x, y, sized.w, sized.h);
    const finalSize = clampSize(sized.w, sized.h, p.x, p.y);
    ov.style.left = `${p.x}px`;
    ov.style.top = `${p.y}px`;
    ov.style.right = "auto";
    ov.style.bottom = "auto";
    ov.style.width = `${finalSize.w}px`;
    ov.style.height = `${finalSize.h}px`;
    if (save) {
      saveDock({ x: p.x, y: p.y, w: finalSize.w, h: finalSize.h });
    }
  };
  const applyDockPosition = (x, y, w, h, options) => applyPanelFrame(x, y, w, h, options);
  const restoreDockPosition = () => {
    if (isMobileViewport()) {
      resetMobileFrame();
      return;
    }
    const d = taskCodexDockFor(itemId);
    const r = panel.getBoundingClientRect();
    const w = Number.isFinite(d.w) ? d.w : r.width;
    const h = Number.isFinite(d.h) ? d.h : r.height;
    if (Number.isFinite(d.x) && Number.isFinite(d.y)) {
      applyDockPosition(d.x, d.y, w, h, { save: false });
      return;
    }
    const idx = Math.max(0, taskCodexOverlays().indexOf(ov));
    applyDockPosition(window.innerWidth - w - 18 - idx * 28, window.innerHeight - h - 18 - idx * 28, w, h, { save: false });
  };
  restoreDockPosition();
  const elapsedLabel = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, "0")}초`;
  };
  const pendingStage = (kind, elapsedMs) => {
    const stages = taskCodexWaitStages[kind] || taskCodexWaitStages.send;
    return stages.reduce((current, stage) => (elapsedMs >= stage[0] ? stage : current), stages[0]);
  };
  const stopPendingTimer = () => {
    if (pendingTimer) clearInterval(pendingTimer);
    pendingTimer = null;
  };
  const paintPendingStatus = (kind) => {
    const elapsed = performance.now() - pendingStartedAt;
    const [, title, note] = pendingStage(kind, elapsed);
    statusEl.classList.add("is-pending");
    statusEl.innerHTML = `<span class="task-codex-progress"><span>${esc(title)} · ${esc(elapsedLabel(elapsed))}</span><span class="chat-typing" aria-hidden="true"><i></i><i></i><i></i></span></span><small>${esc(note)}</small>`;
  };
  const startPendingTimer = (kind) => {
    pendingStartedAt = performance.now();
    paintPendingStatus(kind);
    stopPendingTimer();
    pendingTimer = setInterval(() => paintPendingStatus(kind), 1000);
  };
  const setPending = (v, kindOrText = "") => {
    pending = !!v;
    panel.setAttribute("aria-busy", String(pending));
    sendBtn.disabled = pending;
    if (pending) {
      startPendingTimer(kindOrText || "send");
    } else {
      stopPendingTimer();
      statusEl.classList.remove("is-pending");
      statusEl.textContent = kindOrText || "";
    }
  };
  const roleLabel = (role) => role === "assistant" ? "Codex" : (role === "user" ? "나" : (role === "error" ? "오류" : "시스템"));
  const render = () => {
    const item = payload?.item;
    const binding = payload?.binding;
    const mode = payload?.mode || state.version?.runtime?.codex_task?.mode || "?";
    const bridgeVersion = codexBridgePart(payload?.bridge || state.version?.runtime?.codex_task);
    const bridgeLabel = bridgeVersion.release && bridgeVersion.release !== "v?" ? `브리지 ${bridgeVersion.release}` : "";
    const configLabel = describeTaskCodexOptions();
    const catalogLabel = capabilities.model_catalog_source === "fallback" ? "모델 목록 실패 · GPT-5.5 폴백" : "";
    const accessLabel = payload?.workspace_access === "write-approved" ? "쓰기 승인 활성 · 실행 시 재검증" : "읽기 전용";
    metaEl.innerHTML = item
      ? `<span>${esc(item.project_id)}</span><strong>${esc(item.title)}</strong><small>${esc([mode, bridgeLabel, configLabel, accessLabel, catalogLabel].filter(Boolean).join(" · "))}</small>`
      : `<span>연결 준비 중</span>`;
    const rows = payload?.messages || [];
    const latestAssistantId = latestAssistantMessageIdFromPayload(payload);
    const latestRole = rows.length ? rows[rows.length - 1]?.role : null;
    markTaskCodexSeen(item?.id || itemId, latestAssistantId);
    if (latestRole === "assistant") updateTaskCodexRowBadge(item?.id || itemId, "reply");
    else if (latestRole === "error" || payload?.detail) updateTaskCodexRowBadge(item?.id || itemId, "error");
    else if (latestRole === "user" || latestRole === "system") updateTaskCodexRowBadge(item?.id || itemId, "waiting");
    logEl.innerHTML = rows.length
      ? rows.map((m) => `<div class="task-codex-row ${esc(m.role)}"><div class="task-codex-msg ${esc(m.role)}"><b>${roleLabel(m.role)}</b><span>${esc(m.text)}</span></div></div>`).join("")
      : `<div class="empty small">이 할일의 Codex 대화가 아직 없습니다.</div>`;
    if (payload?.detail) statusEl.textContent = payload.detail;
    if (writeBtn) {
      const grants = Array.isArray(payload?.write_grants) ? payload.write_grants : [];
      const workerReadOnly = mode === "worker";
      writeBtn.hidden = workerReadOnly && grants.length === 0;
      writeBtn.disabled = workerReadOnly && grants.length === 0;
      writeBtn.textContent = grants.length ? `✍ 쓰기 승인 ${grants.length}` : "🔒 읽기 전용";
      writeBtn.classList.toggle("on", grants.length > 0);
      writeBtn.title = grants.length
        ? `승인 폴더: ${grants.map((grant) => grant.relative_prefix).join(", ")} — 클릭하면 철회`
        : "관리자가 지정한 기존 하위 폴더에만 최대 8시간 임시 쓰기 승인";
    }
    renderTools();
    logEl.scrollTop = logEl.scrollHeight;
  };
  writeBtn?.addEventListener("click", async () => {
    if (!payload?.binding?.opened) return toast("먼저 작업실과 Codex 스레드를 연결하세요.", "error");
    const grants = Array.isArray(payload?.write_grants) ? payload.write_grants : [];
    if (grants.length) {
      if (!window.confirm("이 할일의 현재 쓰기 승인을 모두 철회할까요?")) return;
      for (const grant of grants) {
        const resp = await post("/api/codex-task/write-grant/revoke", { grant_id: grant.grant_id });
        const body = await resp.json().catch(() => ({}));
        if (!resp.ok) return toast(`쓰기 승인 철회 실패 (${body.error || resp.status})`, "error");
        payload = body;
      }
      render();
      return toast("쓰기 승인을 철회했습니다. 다음 메시지부터 읽기 전용입니다.", "ok");
    }
    if ((payload?.mode || state.version?.runtime?.codex_task?.mode) === "worker") {
      return toast("첫 production worker 단계에서는 쓰기 승인을 만들 수 없습니다.", "error");
    }
    const prefix = window.prompt("쓰기를 허용할 작업실 내부의 기존 하위 폴더를 입력하세요.\n예: 03_Out/검토결과", "");
    if (prefix == null || !prefix.trim()) return;
    const reason = window.prompt("왜 쓰기가 필요한지 짧게 적어주세요.", "검증 산출물 저장");
    if (reason == null || !reason.trim()) return;
    const resp = await post("/api/codex-task/write-grant", {
      item_id: itemId,
      relative_prefix: prefix.trim(),
      reason: reason.trim(),
      ttl_minutes: 60,
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) return toast(`쓰기 승인 실패 (${body.error || resp.status})`, "error");
    payload = body;
    render();
    toast("해당 하위 폴더에 60분 쓰기를 승인했습니다.", "ok");
  });
  const load = async () => {
    setPending(true, "연결 상태 확인 중");
    try {
      const nextPayload = await api(`/api/codex-task/thread?item_id=${encodeURIComponent(itemId)}`, { acceptedDomainStatuses: [403, 404] });
      if (nextPayload?.error) throw new Error(nextPayload.error);
      payload = nextPayload;
      render();
      setPending(false, payload.binding?.opened ? "연결됨" : "작업실을 직접 선택한 뒤 첫 메시지를 보내면 연결됩니다.");
    } catch (error) {
      payload = payload || { messages: [] };
      payload.detail = error?.message || "Codex 연결 실패";
      render();
      setPending(false, payload.detail);
    }
  };
  const ensureCodexThread = async () => {
    if (payload?.binding?.opened) return true;
    const opt = currentTaskCodexOptions();
    const workspace = taskCodexWorkspaceEntry(opt.workspace_id);
    if (!workspace) {
      toast("이 과제에 허용된 작업실을 먼저 직접 선택하세요.", "error");
      workspaceEl.focus();
      return false;
    }
    if (!window.confirm(`이 과제를 '${workspace.label || workspace.workspace_id}' 작업실에 읽기 전용으로 연결할까요?\n한번 연결하면 이 스레드의 작업실은 바꿀 수 없습니다.`)) return false;
    setPending(true, "open");
    const resp = await postJsonWithTimeout("/api/codex-task/open", {
      item_id: itemId,
      workspace_id: workspace.workspace_id,
      model: opt.model || null,
      model_selection_origin: opt.model_selection_origin,
      effort: opt.effort || null,
      service_tier: opt.service_tier || null,
    }, CHAT_REQUEST_TIMEOUT_MS);
    payload = await resp.json().catch(() => ({}));
    render();
    if (!resp.ok) {
      setPending(false, payload.detail || payload.error || "Codex 연결 실패");
      throw new Error(payload.detail || payload.error || "codex_task_open_failed");
    }
    setPending(false, "연결됨");
    return true;
  };
  const send = async () => {
    if (pending) return;
    const msg = inputEl.value.trim();
    if (!msg) return;
    try {
      if (!(await ensureCodexThread())) return;
    } catch (error) {
      toast(error?.message || "Codex 연결 실패", "error");
      return;
    }
    inputEl.value = "";
    // 낙관적 echo: 입력 즉시 내 메시지를 로그에 표시(답변은 나중에 render에서 채워짐). 입력글이 답변과 함께 늦게 뜨던 문제 수정.
    logEl.insertAdjacentHTML("beforeend", `<div class="task-codex-row user"><div class="task-codex-msg user"><b>${roleLabel("user")}</b><span>${esc(msg)}</span></div></div>`);
    logEl.scrollTop = logEl.scrollHeight;
    suggestEl.hidden = true;
    setPending(true, "send");
    updateTaskCodexRowBadge(itemId, "waiting");
    try {
      saveTaskCodexOptions();
      const opt = currentTaskCodexOptions();
      const attachments = await uploadStagedImages();
      const resp = await postJsonWithTimeout("/api/codex-task/message", {
        item_id: itemId,
        workspace_id: payload?.binding?.workspace_id || opt.workspace_id || null,
        message: msg,
        model: opt.model || null,
        model_selection_origin: opt.model_selection_origin,
        effort: opt.effort || null,
        service_tier: opt.service_tier || null,
        attachments,
      }, CHAT_REQUEST_TIMEOUT_MS);
      payload = await resp.json().catch(() => ({}));
      render();
      if (!resp.ok) {
        updateTaskCodexRowBadge(itemId, "error");
        throw new Error(payload.detail || payload.error || "codex_task_message_failed");
      }
      updateTaskCodexRowBadge(itemId, "reply");
      setPending(false, "응답 완료");
    } catch (error) {
      payload = payload || { messages: [] };
      payload.detail = error?.message || "Codex 응답 실패";
      render();
      updateTaskCodexRowBadge(itemId, "error");
      setPending(false, payload.detail);
    } finally {
      inputEl.focus();
    }
  };
  ov.addEventListener("pointerdown", () => bringTaskCodexToFront(ov));
  let drag = null;
  const moveDock = (x, y, w, h) => {
    applyDockPosition(x, y, w, h);
  };
  const onMove = (e) => {
    if (!drag) return;
    moveDock(e.clientX - drag.offsetX, e.clientY - drag.offsetY, drag.width, drag.height);
  };
  const onUp = () => {
    drag = null;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
  };
  ov.querySelector(".task-codex-head").addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    if (isMobileViewport()) return;
    const r = panel.getBoundingClientRect();
    drag = { offsetX: e.clientX - r.left, offsetY: e.clientY - r.top, width: r.width, height: r.height };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  });
  let resizeDrag = null;
  const onResizeMove = (e) => {
    if (!resizeDrag) return;
    applyPanelFrame(
      resizeDrag.left,
      resizeDrag.top,
      resizeDrag.startW + e.clientX - resizeDrag.startX,
      resizeDrag.startH + e.clientY - resizeDrag.startY
    );
  };
  const onResizeUp = () => {
    resizeDrag = null;
    document.removeEventListener("pointermove", onResizeMove);
    document.removeEventListener("pointerup", onResizeUp);
  };
  resizeEl.addEventListener("pointerdown", (e) => {
    if (isMobileViewport()) return;
    e.preventDefault();
    e.stopPropagation();
    bringTaskCodexToFront(ov);
    const r = panel.getBoundingClientRect();
    resizeDrag = { startX: e.clientX, startY: e.clientY, startW: r.width, startH: r.height, left: r.left, top: r.top };
    document.addEventListener("pointermove", onResizeMove);
    document.addEventListener("pointerup", onResizeUp);
  });
  const closePanel = () => {
    stopPendingTimer();
    window.removeEventListener("resize", restoreDockPosition);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointermove", onResizeMove);
    document.removeEventListener("pointerup", onResizeUp);
    ov.remove();
  };
  ov.querySelector(".task-codex-tile").addEventListener("click", tileTaskCodexPanels);
  ov.querySelector(".task-codex-x").addEventListener("click", closePanel);
  window.addEventListener("resize", restoreDockPosition, { passive: true });
  modelEl.addEventListener("change", () => {
    modelSelectionOrigin = "explicit";
    saveTaskCodexOptions();
    renderTools();
    render();
  });
  workspaceEl.addEventListener("change", () => {
    workspaceExplicitlySelected = !!workspaceEl.value;
    saveTaskCodexOptions();
    render();
  });
  effortEl.addEventListener("change", () => {
    saveTaskCodexOptions();
    render();
  });
  imageEl.addEventListener("change", () => {
    stagedImages = [...stagedImages, ...Array.from(imageEl.files || [])].slice(0, 6);
    imageEl.value = "";
    renderAttachments();
  });
  attachEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-img-remove]");
    if (!b) return;
    stagedImages.splice(Number(b.dataset.imgRemove), 1);
    renderAttachments();
  });
  suggestEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-skill]");
    if (!b) return;
    const token = currentSkillToken();
    const cursor = inputEl.selectionStart ?? inputEl.value.length;
    const start = token ? token.start : cursor;
    const before = inputEl.value.slice(0, start);
    const after = inputEl.value.slice(cursor);
    const inserted = `$${b.dataset.skill} `;
    inputEl.value = `${before}${inserted}${after}`;
    inputEl.focus();
    inputEl.setSelectionRange((before + inserted).length, (before + inserted).length);
    renderSkillSuggest();
  });
  sendBtn.addEventListener("click", send);
  inputEl.addEventListener("input", renderSkillSuggest);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !suggestEl.hidden) {
      suggestEl.hidden = true;
      e.preventDefault();
      return;
    }
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
  loadCapabilities().then(load).then(() => inputEl.focus());
}

// 스팸 처리 선택 대화상자(2026-07-07 owner: '스팸으로 분류' 버튼). 관리자는 발신자 영구 차단 옵션,
// 팀원은 이 메일만 숨김. 규칙 관리 위치(관리자 패널 › 메일 제외 규칙)를 함께 안내 — "분류 기준 어디 있는지" 해소.
function spamChoice({ sender, isAdmin }) {
  return new Promise((resolve) => {
    const L = state.lex;
    document.querySelector(".ui-confirm-overlay")?.remove();
    const ov = document.createElement("div");
    ov.className = "ui-confirm-overlay";
    const senderBtn = isAdmin ? `<button class="fav-chip danger sc-sender">${L.mail_spam_block_sender ?? "이 발신자 차단(앞으로도)"}</button>` : "";
    ov.innerHTML = `<div class="ui-confirm" role="alertdialog" aria-modal="true" style="text-align:left">
      <p class="ui-confirm-msg">${L.mail_spam_title ?? "스팸/광고 메일 처리"}</p>
      <div class="dim mini" style="margin-bottom:8px;word-break:break-all">${esc(sender)}${isAdmin ? "" : ` · ${L.mail_spam_member_note ?? "발신자 영구 차단은 관리자만 — 이 메일만 숨깁니다"}`}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${senderBtn}
        <button class="fav-chip sc-one">${L.mail_spam_hide_one ?? "이 메일만 숨기기"}</button>
        <button class="fav-chip sc-cancel">${L.btn_cancel ?? "취소"}</button>
      </div>
      ${isAdmin ? `<div class="dim mini" style="margin-top:8px">${L.mail_spam_manage_hint ?? "차단 규칙 관리: 관리자 패널 › 메일 제외 규칙"}</div>` : ""}
    </div>`;
    document.body.appendChild(ov);
    const done = (v) => { ov.remove(); resolve(v); };
    ov.querySelector(".sc-sender")?.addEventListener("click", () => done("sender"));
    ov.querySelector(".sc-one").addEventListener("click", () => done("one"));
    ov.querySelector(".sc-cancel").addEventListener("click", () => done(null));
    ov.addEventListener("click", (e) => { if (e.target === ov) done(null); });
  });
}

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

// 전역 피드백 토스트 — 영속 액션의 성공/실패를 잠깐 띄우고 자동으로 사라짐. kind: "ok"|"error"|"info".
// (이전엔 전역 피드백 함수가 없어 액션 결과가 render() 재그림으로만 표현 → "눌러도 됐는지 모름" 발생)
function toast(message, kind = "ok") {
  if (!message) return;
  let host = document.querySelector(".toast-host");
  if (!host) {
    host = document.createElement("div");
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.setAttribute("role", "status");
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  const ttl = kind === "error" ? 4200 : 2400;
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 260);
  }, ttl);
}

async function renderHome() {
  const layout = dashLayout();
  const todayKey = new Date().toISOString().slice(0, 10);
  await ensureScopes(); // 담당자별 드롭 레인 멤버 소스
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

  // #6 팀 건강 신호등 — 흩어진 숫자를 한눈 위험/주의/정상 + '왜'로 종합(관리자 판단부하 해소). 기존 summary 데이터만 사용.
  const blockedTotal = actives.reduce((s, p) => s + p.blocked, 0);
  const overdueTotal = actives.reduce((s, p) => s + p.overdue, 0);
  const dueTodayTotal = actives.reduce((s, p) => s + p.due_today, 0);
  const teamHealth = (blockedTotal > 0 || overdueTotal > 2) ? "risk" : (overdueTotal > 0 || dueTodayTotal > 0) ? "watch" : "ok";
  const healthTop = teamHealth !== "ok" ? actives[0] : null; // actives 는 risk() 내림차순 정렬 → 첫 항목이 최우선
  const healthParts = [];
  if (blockedTotal) healthParts.push(`${L.kpi_blocked} ${blockedTotal}`);
  if (overdueTotal) healthParts.push(`${L.kpi_overdue} ${overdueTotal}`);
  if (dueTodayTotal) healthParts.push(`${L.kpi_today} ${dueTodayTotal}`);
  const healthLabel = teamHealth === "risk" ? (L.team_health_risk ?? "위험") : teamHealth === "watch" ? (L.team_health_watch ?? "주의") : (L.team_health_ok ?? "정상");
  const healthBanner = `<div class="team-health th-${teamHealth}"${healthTop ? ` data-p="${esc(healthTop.id)}" role="button" tabindex="0" title="${L.team_health_jump ?? "가장 시급한 과제로 이동"}"` : ""}>
    <span class="th-dot"></span>
    <strong>${L.team_health_label ?? "팀 상태"}: ${healthLabel}</strong>
    <span class="dim">${healthParts.length ? healthParts.join(" · ") : (L.team_health_clear ?? "막힘·연체 없음 — 정상 운영")}</span>
    ${healthTop ? `<span class="th-top">→ ${esc(healthTop.title)}</span>` : ""}
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
      <strong>${esc(projDisplay(p.id))}</strong> · ${L.kpi_inbox} ${p.mail_cnt}
      <button class="fav-chip" data-jump-mail="${esc(p.id)}">${L.view_mail}</button></div>`).join("");

  const internalBlock = internals.length
    ? `<details class="internal-fold"><summary>${L.class_internal} (${internals.length})</summary>
        ${internals.map((p) => `<span class="badge">${esc(projDisplay(p.id))}</span>`).join(" ")}</details>`
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
      return { title: L.tile_today, html: due.length ? `<table><tbody>${due.map((i) => itemMiniRow(i, [esc(i.due ?? "-")])).join("")}</tbody></table>` : `<div class="empty">${L.empty_items}</div>` };
    }
    if (id === "blocked") {
      const blocked = (await api("/api/items?status=blocked")).slice(0, 6);
      return { title: L.tile_blocked, html: blocked.length ? `<table><tbody>${blocked.map((i) => itemMiniRow(i, [statusBadge(i.status)])).join("")}</tbody></table>` : `<div class="empty">${L.empty_items}</div>` };
    }
    if (id === "mine") {
      // 내 담당 할 일 — 로그인 계정 식별자(내 일 필터와 동일 경로). 익명이면 로그인 안내.
      if (!state.account) return { title: L.tile_mine, html: `<div class="empty">${L.mine_login ?? "로그인하면 내 담당 할 일이 보입니다"}</div>` };
      // 미분류(unclassified)는 정식 목록에서 격리되므로(자동 인입 산출물 포함) 위젯에 "분류 필요" 점프 라인으로 노출.
      // 미분류함은 팀 공용 뷰(할일 목록의 분류 필요 칩과 동일 스코프)라 mine 필터를 붙이지 않는다.
      const [mineItems, triageItems] = await Promise.all([
        api("/api/items?mine=1"),
        api("/api/items?status=unclassified"),
      ]);
      // 전체 표시 — 위젯 body가 스크롤(overflow-y:auto). 시작한 일(doing/waiting/blocked)을 맨 위로 올려
      // '시작' 누른 뒤 하단으로 사라지지 않게 한다. 그룹 내부(시작/미시작)는 서버 정렬 유지(Array.sort 안정성, ES2019).
      const mine = mineItems.filter((i) => i.status !== "done")
        .sort((a, b) => (itemStarted(b) ? 1 : 0) - (itemStarted(a) ? 1 : 0));
      // D2(S8-2) 노출 레인: 마감 미지정 미착수(open+no due)는 모든 재방문 표면에서 뒤로 밀린다 — 상단 고정 섹션.
      const noDueNew = mine.filter((i) => !i.due && i.status === "open");
      const mineRest = mine.filter((i) => i.due || i.status !== "open");
      const qaOpts = projects.filter((p) => p.class === "active" || p.class === "internal")
        .map((p) => `<option value="${esc(p.id)}"${p.id === "general_work" ? " selected" : ""}>${esc(p.title === p.id ? projDisplay(p.id) : `${p.id} · ${p.title}`)}</option>`).join("");
      const quickAdd = `<div class="mine-qa"><input class="mqa-title" placeholder="${L.mine_qa_ph ?? "빠른 할 일 추가…"}" /><select class="mqa-proj" title="${L.project}">${qaOpts}</select><button class="mqa-add fav-chip active">${L.mine_qa_add ?? "추가"}</button></div>`;
      const triageLine = triageItems.length
        ? `<div class="mine-triage-line"><button class="status-chip triage on" data-nav-triage="1" title="${L.status_unclassified ?? "분류 필요"}">🔎 ${L.status_unclassified ?? "분류 필요"} <em>${triageItems.length}</em></button></div>`
        : "";
      const noDueSect = noDueNew.length
        ? `<tr class="date-sep"><td colspan="4" class="amber">${L.mine_nodue_head ?? "마감 미지정 신규"} ${noDueNew.length}</td></tr>`
          + noDueNew.map((i) => itemMiniRow(i, [esc(L.mine_nodue_badge ?? "미지정")])).join("")
        : "";
      const list = (noDueNew.length || mineRest.length)
        ? `<table><tbody>${noDueSect}${mineRest.map((i) => itemMiniRow(i, [esc(i.due ?? "-")])).join("")}</tbody></table>`
        : `<div class="empty">${L.empty_items}</div>`;
      return { title: L.tile_mine, html: triageLine + quickAdd + list };
    }
    if (id === "requests_w") {
      // 개발요청함 — 미승격 열린 요청(분류·요청자). api/requests 소비.
      const reqs = (await api("/api/requests")).filter((r) => r.status !== "done" && !r.promoted_item_id).slice(0, 8);
      return { title: L.tile_requests_w, html: reqs.length ? `<table><tbody>${reqs.map((r) => miniRow([esc(r.title), esc(r.category ?? "-"), esc(r.requester ?? "-")])).join("")}</tbody></table>` : `<div class="empty">${L.req_empty ?? "등록된 요청 없음"}</div>` };
    }
    if (id === "throughput") {
      // 처리량 추세 — 최근 14일 완료(→done) 일별. 유니코드 스파크라인(zero-dep). 팀 합계(개인 점수 미산출).
      const t = await api("/api/throughput?days=14");
      const blocks = " ▁▂▃▄▅▆▇█";
      const spark = (t.daily || []).map((x) => blocks[t.max ? Math.round((x.n / t.max) * 8) : 0]).join("");
      return { title: L.tile_throughput ?? "완료 추세", html: t.total
        ? `<div class="thr-spark" title="${(t.daily || []).map((x) => `${x.d}:${x.n}`).join("  ")}">${spark}</div>
           <div class="dim mini">${L.thr_recent ?? "최근 14일"} ${t.total}${L.thr_done ?? "건 완료"} · ${L.thr_peak ?? "최고"} ${t.max}/${L.thr_day ?? "일"}</div>`
        : `<div class="empty">${L.thr_none ?? "최근 완료 없음"}</div>` };
    }
    if (id === "analytics_w") {
      // #4 담당자별 처리량 분석 — completion_log 집계(/api/completions): 담당자별 완료 수 + 업무종류 분해(최근 30일). 토큰은 #5b 계측 후.
      const data = await api("/api/completions?days=30");
      const stats = (data && data.stats) || [];
      if (!stats.length && !((data && data.log) || []).length) return { title: L.tile_analytics_w, html: `<div class="empty">${L.an_none ?? "최근 완료 없음"}</div>` };
      const byA = {};
      for (const s of stats) {
        const a = s.assignee_ref || (L.assign_unassigned ?? "미배정");
        (byA[a] ??= { total: 0, wt: {} });
        byA[a].total += s.n;
        const wt = s.work_type || "_none";
        byA[a].wt[wt] = (byA[a].wt[wt] || 0) + s.n;
      }
      const rows = Object.entries(byA).sort((x, y) => y[1].total - x[1].total).map(([a, d]) => {
        const wtStr = Object.entries(d.wt).sort((x, y) => y[1] - x[1])
          .map(([wt, n]) => `${wt === "_none" ? (L.an_untyped ?? "기타") : (WORK_TYPE_LABELS[wt] ?? wt)} ${n}`).join(" · ");
        return `<tr><td>${esc(a)}</td><td class="num"><strong>${d.total}</strong></td><td class="dim mini">${esc(wtStr)}</td></tr>`;
      }).join("");
      // 할일 로그: 최근 완료 기록(요약 있으면 함께) — 관리자=전체·그외=본인.
      const recent = ((data && data.log) || []).slice(0, 8);
      const logHtml = recent.length
        ? `<div class="dim mini" style="margin:8px 0 2px">${L.an_recent_done ?? "최근 완료"}</div>`
          + `<table><tbody>${recent.map((c) => `<tr><td class="dim num">${esc(String(c.done_at || c.created_at || "").slice(5, 10))}</td><td>${esc(c.title || "")}</td><td class="dim mini">${esc(c.assignee_ref || (L.assign_unassigned ?? "미배정"))}${c.summary ? ` · ${esc(String(c.summary).slice(0, 36))}` : ""}</td></tr>`).join("")}</tbody></table>`
        : "";
      return { title: L.tile_analytics_w, html:
        (rows ? `<div class="dim mini" style="margin-bottom:4px">${L.an_recent ?? "최근 30일 완료"}</div>`
          + `<table><thead><tr><th>${L.col_person}</th><th>${L.an_done ?? "완료"}</th><th>${L.an_bywt ?? "업무종류"}</th></tr></thead><tbody>${rows}</tbody></table>` : "")
        + logHtml };
    }
    if (id === "nudges") {
      // P-6 콕핏 알림 — '먼저 해야 할 일' 순위(연체>차단>⭐우선>오늘>미완). 연체/차단=번쩍임, ⭐우선=금색 배지.
      const ns = await api("/api/nudges?limit=6");
      const rlabel = { priority: L.prio_label ?? "우선", overdue: L.overdue, blocked: L.blocked, due_today: L.today_due, no_due: L.nudge_no_due ?? "마감 미지정", open: L.open };
      const rcls = { priority: "gold", overdue: "red", blocked: "red", due_today: "amber", no_due: "amber", open: "" };
      return { title: L.tile_nudges, html: ns.length
        ? `<table><tbody>${ns.map((n) => `<tr class="wrow nudge-row${n.reason === "overdue" || n.reason === "blocked" ? " flash" : ""}" data-item="${esc(n.id)}" data-proj="${esc(n.project_id ?? "")}" data-title="${esc(n.title)}">
            <td><span class="badge ${rcls[n.reason]}">${rlabel[n.reason] ?? esc(n.reason)}</span></td>
            <td>${esc(n.title)}${n.block_reason ? ` <span class="dim">· ${esc(n.block_reason)}</span>` : ""}</td><td class="dim">${esc(n.project_id)}</td><td class="dim num">${esc(n.due ?? "-")}</td></tr>`).join("")}</tbody></table>`
        : `<div class="empty">${L.empty_items}</div>` };
    }
    if (id === "deadline_cal") {
      // P-8 일정 카드 — 마감 있는 미완 할일만 3버킷(연체/이번주/이후). 휴가·due 없는 일정 제외.
      const items = await api("/api/items");
      const t = new Date().toISOString().slice(0, 10);
      const wk = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
      const over = items.filter((i) => i.due && i.due < t && i.status !== "done");
      const soon = items.filter((i) => i.due && i.due >= t && i.due <= wk && i.status !== "done");
      const later = items.filter((i) => i.due && i.due > wk && i.status !== "done");
      const sect = (lab, arr, cls) => arr.length
        ? `<tr class="date-sep"><td colspan="4" class="${cls}">${lab} ${arr.length}</td></tr>` + arr.slice(0, 5).map((i) => itemMiniRow(i, [esc(i.due)])).join("")
        : "";
      return { title: L.tile_deadline_cal, html: (over.length || soon.length || later.length)
        ? `<table><tbody>${sect(L.bucket_overdue, over, "due-over")}${sect(L.bucket_thisweek, soon, "")}${sect(L.bucket_later, later, "")}</tbody></table>`
        : `<div class="empty">${L.empty_items}</div>` };
    }
    if (id === "month_cal") {
      // B10 미니 달력 — 내 마감·일정 점 표시, 클릭 → 캘린더 뷰(위임 [data-cal-jump]).
      const month = calLocalDateKey().slice(0, 7);
      const g = await api(`/api/calendar?month=${month}&mine=1`);
      const today = calLocalDateKey();
      const wds = String(L.calv_weekdays).split(",").map((w) => `<span class="mcal-wd">${esc(w)}</span>`).join("");
      const cells = g.weeks.flat().map((c) =>
        `<span class="mcal-d${c.in_month ? "" : " dim"}${c.date === today ? " mcal-now" : ""}">${Number(c.date.slice(8, 10))}${
          c.items.length || c.meetings.length ? `<i class="mcal-dot${c.items.some((i) => i.due < today) ? " mcal-over" : ""}"></i>` : ""
        }</span>`).join("");
      return { title: L.tile_month_cal, html: `<div class="mcal" data-cal-jump="${month}">${wds}${cells}</div>` };
    }
    if (id === "teamload") {
      // P-7 팀원별 할일 — 담당별 미완/대화/연체 + 제목 인라인(행 클릭 시 펼침). NULL=(미배정).
      const wl = await api("/api/workload");
      // 명단은 workload(할일 있는 담당)만이 아니라 활성 팀원 전체(roster=_scopes)에서 — 할일 0인 멤버도 보이게(예: 김민재).
      const tlMembers = (state._scopes ?? []).filter((s) => s.id !== "team");
      const wlByName = new Map(); let wlUnassigned = null;
      for (const w of wl) { if (w.assignee_ref) wlByName.set(w.name, w); else wlUnassigned = w; }
      const tlZero = (name) => ({ assignee_ref: name, name, total: 0, open_cnt: 0, blocked_cnt: 0, overdue_cnt: 0, chat_cnt: 0 });
      const tlRows = tlMembers.map((m) => wlByName.get(m.label) ?? tlZero(m.label)).sort((a, b) => b.open_cnt - a.open_cnt);
      for (const w of wl) { if (w.assignee_ref && !tlMembers.some((m) => m.label === w.name)) tlRows.push(w); } // roster 밖 담당(라벨 불일치·퇴사 등) 보존
      if (wlUnassigned) tlRows.push(wlUnassigned);
      // 남은 항목(=open_cnt 집합: 미분류·보관·완료 제외)을 담당자별로 묶어 제목 표시. 별도 위젯 없이 인라인.
      const remaining = (await api("/api/items")).filter((it) => it.status !== "done");
      const byOwner = {};
      for (const it of remaining) { const k = (it.assignee_ref && it.assignee_ref.trim()) || "__UNASSIGN__"; (byOwner[k] ??= []).push(it); }
      const titleRows = (key) => (byOwner[key] ?? []).slice(0, 12).map((it) =>
        `<tr class="wrow tl-title-row" data-owner="${esc(key)}" data-item="${esc(it.id)}" data-proj="${esc(it.project_id)}" data-title="${esc(it.title)}" style="display:none">`
        + `<td></td><td colspan="3" class="tl-title">${esc(it.title)}${it.due ? ` <span class="dim">· ${esc(it.due)}</span>` : ""}</td></tr>`).join("");
      return { title: L.tile_teamload, html: tlRows.length
        ? `<table><thead><tr><th>${L.col_person}</th><th>${L.tl_remaining ?? "남은"}</th><th>${L.tl_chat ?? "대화"}</th><th>${L.overdue}</th></tr></thead><tbody>${tlRows.map((w) => {
            const key = w.assignee_ref ? w.name : "__UNASSIGN__";
            return `<tr class="wrow tl-row" data-member="${esc(w.name)}" data-owner="${esc(key)}" data-unassigned="${w.assignee_ref ? "" : "1"}">`
              + `<td>${esc(w.name)}</td><td class="num">${w.open_cnt || '<span class="dim">0</span>'}</td>`
              + `<td class="num">${w.chat_cnt ? `<span class="badge">💬 ${w.chat_cnt}</span>` : '<span class="dim">·</span>'}</td>`
              + `<td class="num">${w.overdue_cnt ? `<span class="badge red">${w.overdue_cnt}</span>` : '<span class="dim">0</span>'}</td></tr>`
              + titleRows(key);
          }).join("")}</tbody></table>`
        : `<div class="empty">-</div>` };
    }
    if (id === "mail") {
      const mail = (await api("/api/mail?days=90")).slice(0, 6);
      return { title: L.tile_mail, html: mail.length ? `<table><tbody>${mail.map((m) => `<tr data-mail="${esc(m.id)}"><td>${localTime(m.at)}</td><td>${esc(m.subject)}</td></tr>`).join("")}</tbody></table>` : `<div class="empty">${L.empty_mail}</div>` };
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
      // 미배정 활성(open/doing/blocked) — 서버 unassigned 전용뷰. 시작했거나 막힌 '주인 없는' 일도 노출(#5).
      const un = (await api("/api/items?unassigned=1")).filter((i) => i.status !== "done").slice(0, 8);
      return { title: L.tile_unassigned, html: un.length ? `<table><tbody>${un.map((i) => itemMiniRow(i, [esc(i.due ?? "-")])).join("")}</tbody></table>` : `<div class="empty">${L.empty_items}</div>` };
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
    if (id === "proposals") {
      // P-19/P-4 키스톤: AI/규칙 제안 대기 큐(승인 필요). 게이트 화면에서 승인/반려·추천 스캔.
      const props = await loadProposalsForCurrentAccount();
      return { title: L.prop_queue_title, html: props.length
        ? `<table><tbody>${props.slice(0, 8).map((p) => miniRow([esc(p.kind), esc(p.summary ?? p.payload?.title ?? p.id)])).join("")}</tbody></table>`
        : `<div class="empty">${L.prop_empty}</div>` };
    }
    if (id === "reports_w") {
      // P-12 자동보고 노출 — 최근 7일 업무일지 초안 미리보기 + 보고서 화면 점프(자동발신 0).
      const d = await api("/api/worklog/draft?days=7");
      const preview = (d.text || "").split("\n").slice(0, 6).join("\n");
      return { title: L.tile_reports_w, html: `<pre class="gen-preview mini">${esc(preview) || L.gen_run}</pre><button class="fav-chip mini" data-goreports="1">${L.reports_open}</button>` };
    }
    if (id === "inbox") {
      const ids = new Set(inbox.map((p) => p.id));
      const inboxTotal = inbox.reduce((s, p) => s + (p.mail_cnt || 0), 0); // 실제 미분류 총건수(서버 집계)
      const mails = (await api("/api/mail?days=3650")).filter((m) => ids.has(m.project_id)).slice(0, 30); // 최신 30건(위젯 내부 스크롤) — 새로고침 시 분류돼 빠진 만큼 다음 메일로 재충전
      // 위젯 행에서 바로 팀원 배정(권장): 담당 선택 → 그 메일을 일반업무로 옮기고 그 팀원 할 일로(받은함에서 빠짐). 미배정으로 두려면 분류 화면 사용.
      const inboxMembers = (state._scopes ?? []).filter((s) => s.id !== "team");
      const inboxAssignOpts = `<option value="">${L.inbox_assign_ph ?? "배정…"}</option><option value="__UNASSIGN__">${L.assign_unassigned ?? "미배정"}</option>` + inboxMembers.map((m) => `<option value="${esc(m.label)}">${esc(m.label)}</option>`).join("");
      const canAssign = state.account; // 최소 미배정으로는 항상 분배 가능
      const more = inboxTotal > mails.length
        ? `<div class="widget-more"><a data-inbox-all="${esc(inbox[0]?.id ?? "")}">${(L.inbox_see_all ?? "전체 %n건 분류하러 가기 →").replace("%n", inboxTotal)}</a></div>` : "";
      // 대화(conversation) 단위로 묶기 — 같은 정규화 제목(RE/FW·부분분할 제거)은 한 줄(최신 대표)+💬N. 분류하면 그 대화 메일 전체를 함께 file(data-conv).
      const convMap = new Map();
      for (const m of mails) { const k = mailThreadSubject(m.subject); if (!convMap.has(k)) convMap.set(k, []); convMap.get(k).push(m); }
      const convRows = [...convMap.values()].map((ms) => {
        ms.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")); // 최신 먼저
        const m = ms[0];
        const convIds = ms.map((x) => x.id).join(",");
        const recip = Math.max(1, ...ms.map((x) => x.recipients || 1));
        return `<tr data-mail="${esc(m.id)}"><td>${localTime(m.at)}</td><td>${esc(m.subject)}${ms.length > 1 ? ` <span class="mail-conv" title="${L.mail_conv ?? "이 대화의 메일 수(분류 시 함께 처리)"}">💬 ${ms.length}</span>` : ""}${recip > 1 ? ` <span class="mail-recip" title="${L.mail_recipients ?? "이 메일을 받은 팀원 수(중복 메일 합침)"}">👥 ${recip}</span>` : ""}</td>${canAssign ? `<td class="inbox-assign-cell"><select class="inbox-assign" data-mail="${esc(m.id)}" data-conv="${esc(convIds)}">${inboxAssignOpts}</select></td>` : ""}</tr>`;
      }).join("");
      return { title: `${L.tile_inbox} (${inboxTotal})`, html: mails.length
        ? `<table><tbody>${convRows}</tbody></table>${more}`
        : `<div class="empty">${L.empty_mail}</div>` };
    }
    // 최근 변경 = 사람이 읽는 변경 이력. 조회/잡음(view 등) 제외, kind 를 한국어 설명으로. 할일 변경은 클릭→빠른편집.
    const events = (await api("/api/events/recent?limit=40")).filter((e) => !EVENT_HIDE.has(e.kind)).slice(0, 10);
    return { title: L.tile_events, html: events.length
      ? `<table class="evt-table"><tbody>${events.map((e) => {
          const clickable = e.kind.startsWith("item") && e.item_ref;
          return `<tr class="${clickable ? "wrow" : ""}"${clickable ? ` data-item="${esc(e.item_ref)}" data-proj="${esc(e.project_ref ?? "")}" data-title="${esc(eventDesc(e, L))}"` : ""}>
            <td class="dim num">${localTime(e.at)}</td><td>${esc(eventDesc(e, L))}</td><td class="dim">${esc(e.actor_ref)}</td></tr>`;
        }).join("")}</tbody></table>`
      : `<div class="empty">${L.evt_empty ?? "최근 변경 없음"}</div>` };
  }

  // 위젯 인라인 검색: 리스트(테이블 행) 위젯 본문 앞에 검색 input 주입 → 행 텍스트 클라 필터(드래그 전 빨리 찾기).
  const widgetSearchHtml = (id, bodyHtml) => /<tbody>[\s\S]*?<tr/.test(bodyHtml) // tbody에 실제 행이 있을 때만(빈 표 제외)
    ? `<input class="widget-search" data-wsearch="${id}" placeholder="${L.widget_search_ph ?? "이 위젯에서 검색…"}" />${bodyHtml}`
    : bodyHtml;
  // 위젯 카드 — 절대좌표(% 가로 + px 세로). 본문 고정 높이 → 내부 스크롤.
  const GAP = 10; // 위젯 간 간격(px) — ECount식으로 살짝 떨어뜨림(너무 붙지 않게)
  const cardStyle = (w) => `left:calc(${(w.x / DASH_GCOLS) * 100}% + ${GAP / 2}px); width:calc(${(w.w / DASH_GCOLS) * 100}% - ${GAP}px);`
    + `top:${w.y * DASH_ROW + GAP / 2}px; height:${(w.c ? 2 : w.h) * DASH_ROW - GAP}px;`;
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
          ${(w.id === "inbox" && state.account?.is_admin) ? `<i class="wcollect" data-collect="1" title="${L.mail_collect ?? "메일 수집"}">📥</i>` : ""}
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
      <div class="widget-body" data-body="${w.id}">${widgetSearchHtml(w.id, html)}</div>
      <i class="widget-resize" data-rid="${w.id}" title="${L.widget_resize}"></i>
    </section>`);
  }
  const maxBottom = Math.max(0, ...layout.map((w) => (w.y + (w.c ? 2 : w.h)))) * DASH_ROW + 20;
  const slots = savedSlots(); // 이름 붙인 저장 배치들(드롭다운 + 삭제 대상)
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

  $("#view").innerHTML = `${healthBanner}${kpi}
    ${claimDropBarHtml()}
    <button id="widgetEdge" class="widget-edge" title="${L.widget_add}" aria-label="${L.widget_add}">❙❙</button>
    <aside id="widgetDrawer" class="widget-drawer">
      <div class="widget-drawer-list">${drawerItems}</div>
      <div class="widget-drawer-foot">
        <select id="widgetPreset" title="${L.widget_preset ?? "정해둔/저장 배치 적용"}">
          <option value="">${L.widget_preset ?? "배치 불러오기"}…</option>
          ${slots.length ? `<optgroup label="${L.widget_my_saved ?? "내 저장 배치"}">${slots.map((s, i) => `<option value="slot:${i}">${esc(s.name)}</option>`).join("")}</optgroup>` : ""}
          <optgroup label="${L.widget_preset_group ?? "기본 프리셋"}">${Object.entries(DASH_PRESETS).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join("")}</optgroup>
        </select>
        <button id="widgetSaveMine" class="fav-chip" title="${L.widget_save_mine ?? "현재 배치를 이름 붙여 저장"}">💾 ${L.widget_save_mine ?? "배치 저장"}</button>
        <button id="widgetDelSlot" class="fav-chip" title="${L.widget_del_slot ?? "선택한 저장 배치 삭제"}">🗑</button>
        <button id="widgetArrangeBtn" class="fav-chip" title="${L.widget_arrange}">⊟ ${L.widget_arrange}</button>
        <button id="widgetResetBtn" class="fav-chip" title="${L.widget_reset}">↺ ${L.widget_reset}</button>
      </div>
    </aside>
    <div class="dashboard" style="height:${maxBottom}px;">${cards.join("")}</div>`;

  const grid = $("#view").querySelector(".dashboard");
  // 위젯 내 할일 행 클릭 → 인라인 빠른편집(상태 변경/이동). 위임이라 위젯 새로고침 후에도 동작.
  grid.addEventListener("click", (e) => {
    const tri = e.target.closest("[data-nav-triage]");
    if (tri && grid.contains(tri)) { // '분류 필요' 점프 → 할일 목록의 미분류함(기존 칩과 동일 상태)
      state.projectFilter = ""; state.statusFilter = "unclassified"; state.view = "items"; render(); return;
    }
    const cal = e.target.closest("[data-cal-jump]");
    if (cal && grid.contains(cal)) { state.calMonth = cal.dataset.calJump; state.view = "mod:calendar"; render(); return; }
    const tr = e.target.closest("tr.wrow[data-item]");
    if (tr && grid.contains(tr)) openItemQuickEdit(tr.dataset.item, tr.dataset.proj, tr.dataset.title);
  });
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
  // 프리셋 적용 / 내 배치 저장 — 내 배치(현재)는 자동저장(localStorage), 저장 슬롯은 되돌아올 스냅샷.
  $("#widgetPreset")?.addEventListener("change", (e) => {
    const v = e.target.value; if (!v) return;
    const layout = v.startsWith("slot:") ? savedSlots()[Number(v.slice(5))]?.layout : DASH_PRESETS[v]?.layout;
    if (Array.isArray(layout) && layout.length) { saveDashLayout(layout.map((x) => ({ ...x }))); render(); }
  });
  $("#widgetSaveMine")?.addEventListener("click", () => {
    const sl = savedSlots();
    const name = (window.prompt(L.widget_save_name ?? "저장할 배치 이름", `배치${sl.length + 1}`) || "").trim();
    if (!name) return;
    const i = sl.findIndex((s) => s.name === name);
    const entry = { name, layout: dashLayout() };
    if (i >= 0) sl[i] = entry; else sl.push(entry); // 같은 이름이면 덮어쓰기
    setSavedSlots(sl); render();
  });
  $("#widgetDelSlot")?.addEventListener("click", async () => {
    const v = $("#widgetPreset")?.value || "";
    if (!v.startsWith("slot:")) { alert(L.widget_del_pick ?? "삭제할 저장 배치를 드롭다운에서 먼저 고르세요"); return; }
    const sl = savedSlots(); const i = Number(v.slice(5));
    if (!sl[i]) return;
    if (!(await uiConfirm(`${L.widget_del_confirm ?? "이 저장 배치를 삭제할까요?"} (${sl[i].name})`))) return;
    sl.splice(i, 1); setSavedSlots(sl); render();
  });
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
    if (!id || id.startsWith("claim-")) return; // claim-(행→내할일) 드래그는 위젯 추가가 아님 — 무시
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
      const prevQ = body?.querySelector(".widget-search")?.value ?? ""; // 새로고침 전 검색어 보존
      if (body) body.innerHTML = widgetSearchHtml(r.dataset.refresh, html);
      bindWidgetInner();
      if (body && prevQ) { const ni = body.querySelector(".widget-search"); if (ni) { ni.value = prevQ; ni.dispatchEvent(new Event("input")); } } // 검색어·필터 복원
      setTimeout(() => r.classList.remove("spinning"), 400);
    });
  });
  // 메일 수집 버튼(미분류함·관리자) — 수집기 호출(서버가 자식프로세스로 fetch→ingest) 후 화면 갱신
  $("#view").querySelectorAll("[data-collect]").forEach((c) => {
    c.addEventListener("mousedown", (e) => e.stopPropagation());
    c.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (c.classList.contains("spinning")) return; // 중복 클릭 방지
      c.classList.add("spinning");
      toast(L.mail_collect_running ?? "메일 수집 중…", "ok");
      let r = {};
      try { const resp = await post("/api/mail/collect", {}); r = await resp.json().catch(() => ({})); if (!resp.ok && !r.error) r.error = "http_" + resp.status; } // HTTP 4xx/5xx 도 실패로
      catch { r = { error: "net" }; }
      c.classList.remove("spinning");
      if (r.error === "admin_only") { toast(L.mail_collect_admin ?? "관리자만 수집할 수 있습니다", "error"); return; }
      if (r.error === "already_collecting") { toast(L.mail_collect_busy ?? "이미 수집 중입니다", "error"); return; }
      if (r.error) { toast(L.mail_collect_fail ?? "메일 수집 실패", "error"); return; }
      const newN = (r.ingest && r.ingest.new) ?? (r.mailboxes || []).reduce((s, m) => s + (m.new_events ?? 0), 0);
      toast(`${L.mail_collect_done ?? "메일 수집 완료"} · ${L.mail_collect_new ?? "신규"} ${newN}`, "ok");
      render(); // 미분류 메일함 등 갱신
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
    ov.querySelectorAll("[data-goreports]").forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); state.view = "mod:reports"; close(); render(); }));
    ov.querySelectorAll("tr.wrow[data-item]").forEach((tr) =>
      tr.addEventListener("click", (e) => {
        if (e.target.closest(".act-btn")) return;
        openItemQuickEdit(tr.dataset.item, tr.dataset.proj, tr.dataset.title);
      }));
    wireItemActions(ov);
    wireTaskCodexButtons(ov);
  }

  function bindWidgetInner() {
    $("#view").querySelectorAll(".proj-row").forEach((r) =>
      r.addEventListener("click", () => { state.hubProject = r.dataset.p; state.hubTab = "overview"; state.view = "project"; render(); }));
    $("#view").querySelector(".team-health[data-p]")?.addEventListener("click", (ev) => {
      state.hubProject = ev.currentTarget.dataset.p; state.hubTab = "overview"; state.view = "project"; render();
    });
    $("#view").querySelectorAll("[data-jump-mail]").forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); state.projectFilter = b.dataset.jumpMail; state.view = "mail"; render(); }));
    // 콕핏 홈 '메일' KPI 타일: 핸들러가 없어 dead-click 이던 것 → 메일 화면(전체 메일함)으로 이동.
    $("#view").querySelectorAll("[data-jump='inbox-mail']").forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); state.projectFilter = ""; state.view = "mail"; render(); }));
    // 콕핏 메일/미분류 위젯 행 클릭 → 메일 화면에서 그 메일 선택(우측 '과제로 분류' 진입). 행이 클릭 액션 0개이던 갭(감사 + 설계 #1).
    $("#view").querySelectorAll('[data-body="mail"] tr[data-mail], [data-body="inbox"] tr[data-mail]').forEach((tr) =>
      tr.addEventListener("click", (e) => {
        e.stopPropagation();
        state.mailSel = tr.dataset.mail;
        state.viewScope = "team"; state.projectFilter = ""; state.mailOffset = 0;
        if (state.mailFilters) state.mailFilters.q = "";
        state.view = "mail"; render();
      }));
    // 미분류 메일함 위젯 행에서 바로 팀원 배정 → 일반업무로 옮기고 그 팀원 할 일 생성. 위젯 드래그/행클릭과 분리.
    $("#view").querySelectorAll('[data-body="inbox"] .inbox-assign').forEach((sel) => {
      sel.addEventListener("mousedown", (e) => e.stopPropagation());
      sel.addEventListener("click", (e) => e.stopPropagation());
      sel.addEventListener("change", async (e) => {
        e.stopPropagation();
        const v = sel.value; if (!v) return;
        const who = v === "__UNASSIGN__" ? "" : v; // 미배정이면 담당 없이(open 미배정 할일)
        const convIds = (sel.dataset.conv || sel.dataset.mail).split(",").filter(Boolean); // 대화 전체 메일(대표 first) — single_item 으로 할일은 대표 1개만, 나머지는 file
        const resp = await post("/api/mail/assign", { mail_ids: convIds, project_id: "general_work", make_items: true, single_item: true, assignee_ref: who, open: true });
        const d = await resp.json().catch(() => ({}));
        if (resp.ok && !d.error) {
          toast(`${who || (L.assign_unassigned ?? "미배정")} ${L.inbox_assign_done ?? "배정했어요"} (${INTERNAL_PROJ_LABELS["general_work"] ?? "일반업무"})`, "ok");
          $("#view").querySelector('[data-refresh="inbox"]')?.click();
          $("#view").querySelector('[data-refresh="teamload"]')?.click();
          $("#view").querySelector('[data-refresh="unassigned"]')?.click();
        } else { toast((L.inbox_assign_fail ?? "배정 실패") + (d.error ? ` (${d.error})` : ""), "error"); sel.value = ""; }
      });
    });
    // 팀원별 위젯 행 클릭 → 그 사람(또는 미배정)의 할 일 제목을 인라인으로 펼침/접기. 제목 행은 위임 클릭으로 열림.
    $("#view").querySelectorAll('[data-body="teamload"] tr.tl-row').forEach((tr) => {
      tr.addEventListener("click", () => {
        const owner = tr.dataset.owner ?? tr.dataset.member;
        const body = tr.closest('[data-body="teamload"]');
        const rows = body ? body.querySelectorAll(`tr.tl-title-row[data-owner="${CSS.escape(owner)}"]`) : [];
        const showing = rows.length > 0 && rows[0].style.display !== "none";
        rows.forEach((r) => { r.style.display = showing ? "none" : ""; });
        tr.classList.toggle("tl-open", !showing);
      });
      // 메일/항목 행을 이 팀원(또는 미배정) 행에 직접 드롭 → 그 사람에게 배정(open). 레인 바 없이 위젯에서 바로.
      if (state.account) dndWireDrop(tr, tr.dataset.unassigned === "1" ? "__UNASSIGN__" : tr.dataset.member);
    });
    // '미분류 메일함' 위젯 → 전체 보기: 받은함 프로젝트로 필터된 메일 화면(전 미분류 메일 분류용).
    $("#view").querySelectorAll("[data-inbox-all]").forEach((a) =>
      a.addEventListener("click", (e) => {
        e.stopPropagation();
        state.viewScope = "team"; state.projectFilter = a.dataset.inboxAll || ""; state.mailSel = null; state.mailOffset = 0;
        if (state.mailFilters) state.mailFilters.q = "";
        state.view = "mail"; render();
      }));
    $("#view").querySelectorAll("[data-goreports]").forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); state.view = "mod:reports"; render(); }));
    // '내 할 일' 위젯 빠른 추가 — 입력+과제 선택 후 바로 할일 생성(담당=본인 백필). 추가 후 그 위젯만 갱신.
    $("#view").querySelectorAll('[data-body="mine"] .mine-qa').forEach((box) => {
      if (box.dataset.qaBound === "1") return; box.dataset.qaBound = "1";
      box.addEventListener("mousedown", (e) => e.stopPropagation()); // 위젯 드래그와 분리
      const add = async () => {
        const titleEl = box.querySelector(".mqa-title"), title = titleEl.value.trim(), proj = box.querySelector(".mqa-proj")?.value;
        if (!title) { toast(L.mine_qa_need ?? "할 일 내용을 입력하세요", "error"); return; }
        if (!proj) { toast(L.mine_qa_need_proj ?? "과제를 고르세요", "error"); return; }
        const resp = await post("/api/items", { project_id: proj, title });
        if (resp.ok) { titleEl.value = ""; toast(L.mine_qa_done ?? "할 일을 추가했어요", "ok"); $("#view").querySelector('[data-refresh="mine"]')?.click(); }
        else { const er = await resp.json().catch(() => ({})); toast((L.mine_qa_fail ?? "추가 실패") + (er.error ? ` (${er.error})` : ""), "error"); }
      };
      box.querySelector(".mqa-add")?.addEventListener("click", (e) => { e.stopPropagation(); add(); });
      box.querySelector(".mqa-title")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
    });
    $("#view").querySelectorAll(".widget-search").forEach((inp) => {
      if (inp.dataset.wsBound === "1") return; // 새로고침 시 리스너 중복 누적 방지
      inp.dataset.wsBound = "1";
      inp.addEventListener("mousedown", (e) => e.stopPropagation()); // 위젯 드래그와 분리
      inp.addEventListener("input", () => {
        const q = inp.value.trim().toLowerCase();
        const body = inp.closest(".widget-body");
        if (!body) return;
        body.querySelectorAll("tbody tr").forEach((tr) => {
          if (tr.classList.contains("date-sep") || tr.classList.contains("proj-sep")) return; // 그룹 헤더는 필터 제외
          tr.style.display = (!q || tr.textContent.toLowerCase().includes(q)) ? "" : "none";
        });
        // 표 밖 보조 목록(예: projects 위젯 inbox-strip)도 같은 질의로 숨김
        body.querySelectorAll(".inbox-strip").forEach((el) => {
          el.style.display = (!q || el.textContent.toLowerCase().includes(q)) ? "" : "none";
        });
      });
    });
    // 행-레벨 DnD: 미배정 할일/메일 행 → 담당자별 드롭 레인(콕핏 상단 바) + '내 할 일(mine)' 위젯.
    wireClaimDropBar($("#view"));
    if (state.account) dndWireDrop($("#view").querySelector('[data-body="mine"]'));
    wireItemActions($("#view"));
    wireTaskCodexButtons($("#view"));
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
  scope.querySelectorAll(".act-btn[data-act]").forEach((b) => {
    if (b.dataset.actionBound === "1") return;
    b.dataset.actionBound = "1";
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const body = { id: b.dataset.i, status: b.dataset.act };
      if (b.dataset.act === "blocked") {
        const reason = window.prompt(state.lex.block_reason_ph, "");
        if (reason === null) return;
        if (reason.trim()) body.bottleneck_reason = reason.trim();
      }
      const r = await post("/api/items/status", body);
      if (r.ok) toast(body.status === "done"
        ? (state.lex.item_done_toast ?? "완료 처리됨 — '완료' 탭에서 '다시 열기'로 되돌릴 수 있어요")
        : (state.lex.item_status_toast ?? "상태가 변경되었습니다"), "ok");
      else toast(state.lex.item_status_fail ?? "상태 변경 실패", "error");
      render();
    });
  });
}

// SE 업무유형·연결대상 라벨(분류 폼 + 배지)
const WORK_TYPE_LABELS = { answer: "답변", review: "검토", author: "작성", revise: "수정", purchase: "구매", verify: "확인", decide: "결정", schedule: "일정등록" };
const LINK_KIND_LABELS = { requirement: "요구사항", artifact: "산출물", meeting: "회의록", bom: "BOM", part: "부품", vendor: "업체", risk: "리스크" };
// 내부 영어 프로젝트 코드 → 한글 표시명(데이터/ID는 그대로, 화면 텍스트만). owner: general_work=일반업무.
const INTERNAL_PROJ_LABELS = { general_work: "일반업무", external_reviews: "외부 검토", system: "시스템", "P00-000_INBOX": "받은편지함" };
const projDisplay = (id) => INTERNAL_PROJ_LABELS[id] ?? id;
function itemLinkCell(i) {
  const se = [];
  if (i.work_type) se.push(`<span class="badge">${WORK_TYPE_LABELS[i.work_type] ?? i.work_type}</span>`);
  if (i.link_kind) se.push(`<span class="badge teal">${LINK_KIND_LABELS[i.link_kind] ?? i.link_kind}${i.link_ref ? `: ${esc(i.link_ref)}` : ""}</span>`);
  if (i.party_ref) se.push(`<span class="badge party" title="${esc(state.lex.party_label ?? "파티")}">🧩 ${esc(i.party_ref)}</span>`);
  if (se.length) return se.join(" ");
  if (i.guide_artifact_name) return `<span class="badge">${esc(i.guide_stage_code)} ${esc(i.guide_artifact_name)}</span>`;
  if (i.origin === "mail") return `<span class="badge blue">${state.lex.origin_mail_badge}</span>`;
  if (i.origin === "voice") return '<span class="badge blue">음성</span>';
  return '<span class="dim">-</span>';
}

function itemAutomationHints(i) {
  const hints = [];
  if (i.review_reason) hints.push(`검토: ${i.review_reason}`);
  if (i.route_candidate) hints.push(`라우트: ${i.route_candidate}${i.route_confidence ? `/${i.route_confidence}` : ""}`);
  if (i.suggested_assignee_ref) {
    // 제안 출처를 assignee_reason 으로 결정적 판별(규칙 기반 vs 메일함 보수 제안) — 신뢰 판단 근거.
    const src = String(i.assignee_reason ?? "").includes("브랜치 규칙") ? "규칙" : (i.assignee_reason ? "메일함" : "");
    hints.push(`추천담당: ${i.suggested_assignee_ref}${i.assignee_confidence ? `/${i.assignee_confidence}` : ""}${src ? ` (${src})` : ""}`);
  }
  if (i.required_role || i.required_capability) hints.push(`필요: ${[i.required_role, i.required_capability].filter(Boolean).join(" · ")}`);
  if (i.sync_state && !["synced", "pending"].includes(i.sync_state)) hints.push(`동기화: ${i.sync_state}${i.sync_error ? ` · ${i.sync_error}` : ""}`);
  const line = hints.length ? `<div class="cc-hint">${hints.map(esc).join(" · ")}</div>` : "";
  // "왜 이 제안인가" — 접이식 근거(1클릭 승인의 신뢰 기반). 저장돼 있던 route_reason/assignee_reason 첫 노출.
  const why = [i.route_reason ? `라우트 근거: ${i.route_reason}` : "", i.assignee_reason ? `담당 근거: ${i.assignee_reason}` : ""].filter(Boolean);
  const whyHtml = why.length ? `<details class="cc-hint cc-why"><summary>왜 이 제안?</summary>${why.map((w) => `<div>${esc(w)}</div>`).join("")}</details>` : "";
  return line + whyHtml;
}

function itemSourceTrace(i) {
  const refs = [];
  const mailRef = String(i.source_mail_ref || i.origin_mail_id || "");
  if (mailRef) {
    // 내부 접두(mailcsv:/<코드>:)는 숨기고 이력키만 — 클릭하면 통합검색으로 원 메일 점프(id 공간 조인과 동일 키).
    const hk = mailRef.startsWith("mailcsv:") ? mailRef.slice(8) : (mailRef.includes(":") ? mailRef.slice(mailRef.indexOf(":") + 1) : mailRef);
    refs.push(`<span class="mail-jump" data-mailq="${esc(hk)}" title="통합검색에서 원 메일 찾기">메일 ${esc(hk)}</span>`);
  }
  if (i.source_mail_source_id) refs.push(esc(`소스 ${i.source_mail_source_id}`));
  if (i.source_thread_ref) refs.push(esc(String(i.source_thread_ref).startsWith("thread-fallback:") ? "추정 스레드" : `스레드 ${i.source_thread_ref}`));
  if (i.source_lineage_ref && i.source_lineage_ref !== i.source_mail_ref) refs.push(esc(`이력 ${i.source_lineage_ref}`));
  return refs.length ? `<div class="cc-hint source-trace">${refs.join(" · ")}</div>` : "";
}

// B-5: 추천담당 ref 를 계정(스코프)으로 resolve — 이메일/표시명 대조(대소문자 무시).
// 미매칭 제안을 그대로 확정하면 '내 할 일' 스코프에 안 잡히므로 치환/경고의 근거가 된다.
function resolveScopeRef(ref) {
  const v = String(ref ?? "").trim().toLowerCase();
  if (!v || !Array.isArray(state._scopes)) return null;
  return state._scopes.find((s) => s.id !== "team"
    && ((s.email && String(s.email).toLowerCase() === v) || (s.label && String(s.label).toLowerCase() === v))) || null;
}

function itemReviewTrace(i) {
  const bits = [];
  if (i.due) bits.push(`기한 ${i.due}`);
  if (i.review_status) bits.push(`검토 ${i.review_status}`);
  if (i.created_at) bits.push(`생성 ${String(i.created_at).slice(0, 10)}`);
  return bits.length ? `<div class="cc-hint">${bits.map(esc).join(" · ")}</div>` : "";
}

async function renderItems() {
  const todayKey = new Date().toISOString().slice(0, 10);
  await ensureScopes();
  const summary = await api("/api/summary");
  const projects = summary.projects;
  state._projCache = projects;
  // 보기범위 선택기(관리자)가 있으면 그걸로 담당자 스코프, 없으면 '내 일' 토글(팀원).
  const useView = showViewScope();
  // 내 일 필터: 로그인 시에만 의미. '분류 필요'(미분류 인입함)는 팀 공용이라 mine/view 적용 안 함.
  const mine = !useView && state.mineOnly && !!state.account;
  const isUnassigned = state.statusFilter === "unassigned"; // #8 미배정 전용뷰: 담당자 스코프 미적용(주인 없는 일=팀 전체)
  const applyMine = mine && state.statusFilter !== "unclassified" && !isUnassigned;
  const scoped = state.statusFilter !== "unclassified" && !isUnassigned; // 미분류함·미배정뷰는 팀 공용
  const q = new URLSearchParams();
  if (state.projectFilter) q.set("project", state.projectFilter);
  if (isUnassigned) q.set("unassigned", "1");
  else if (state.statusFilter) q.set("status", state.statusFilter);
  if (useView && scoped) applyViewScope(q); else if (applyMine) q.set("mine", "1");
  q.set("page", "1");
  q.set("limit", String(state.itemLimit));
  q.set("offset", String(state.itemOffset));
  const itemPage = asPage(await api(`/api/items?${q}`), state.itemLimit, state.itemOffset);
  let items = itemPage.rows;
  // 칩 count 는 상태 무관(과제+담당자 스코프)에서 서버 count 계약으로 계산 — 페이지 제한과 분리
  const baseQ = new URLSearchParams();
  if (state.projectFilter) baseQ.set("project", state.projectFilter);
  if (useView) applyViewScope(baseQ); else if (mine) baseQ.set("mine", "1");
  const counts = await api(`/api/items/counts?${baseQ}`).catch(() => ({ total: itemPage.total, statuses: {} }));
  const opts = projects.map((p) => `<option value="${p.id}" ${state.projectFilter === p.id ? "selected" : ""}>${p.title}</option>`).join("");
  const L = state.lex;
  // ECount식 상태 필터칩 (전체 + 각 상태). count 표시.
  const statuses = ["open", "doing", "waiting", "blocked", "done"];
  const statusCount = (s) => counts.statuses?.[s] ?? 0;
  const triageTotal = counts.statuses?.unclassified ?? 0;
  const archivedTotal = counts.statuses?.archived ?? 0;
  const unassignedTotal = counts.statuses?.unassigned ?? 0;
  const chip = (val, label, n, cls = "") =>
    `<button class="status-chip ${cls} ${state.statusFilter === val ? "on" : ""}" data-st="${val}">${label}${n != null ? ` <em>${n}</em>` : ""}</button>`;
  const chipsHtml = [chip("", L.all_label, counts.total ?? itemPage.total)]
    .concat(statuses.map((s) => chip(s, L[`status_${s}`], statusCount(s))))
    .concat(triageTotal || state.statusFilter === "unclassified" ? [chip("unclassified", L.status_unclassified ?? "분류 필요", triageTotal, "triage")] : [])
    .concat(unassignedTotal || state.statusFilter === "unassigned" ? [chip("unassigned", L.status_unassigned ?? "미배정", unassignedTotal, "unassigned-chip")] : [])
    .concat(archivedTotal || state.statusFilter === "archived" ? [chip("archived", L.status_archived ?? "보관함", archivedTotal, "archived-chip")] : [])
    .join("");
  const triageNote = state.statusFilter === "unclassified"
    ? `<div class="triage-note">${L.triage_note ?? "메일/요청에서 자동 추출됐지만 과제·단계·산출물 연결이 없는 임시 할 일입니다. 분류해야 정식 실행 목록에 들어갑니다."}</div>`
    : "";
  // 담당 나누기: 관리자면 담당 칸을 팀원 드롭다운으로(클릭 한 번에 재배정 → 그 팀원 '내 할 일'로 이동).
  // 메일은 각자 인박스로 와 각자 일이 되지만, 한 곳(인박스)에 몰린 일은 실제 담당에게 나눠야 하므로.
  const reassignMembers = (state._scopes ?? []).filter((s) => s.id !== "team");
  const canReassign = showViewScope() && reassignMembers.length > 0;
  const reassignCell = (i) => {
    if (!canReassign || i.status === "archived") return esc(i.assignee_ref ?? "-");
    const cur = i.assignee_ref ?? "";
    const matched = reassignMembers.some((m) => m.label === cur);
    const memberOpts = reassignMembers.map((m) => `<option value="${esc(m.label)}" ${m.label === cur ? "selected" : ""}>${esc(m.label)}</option>`).join("");
    const customOpt = cur && !matched ? `<option value="${esc(cur)}" selected>${esc(cur)}</option>` : "";
    return `<select class="reassign" data-i="${esc(i.id)}" title="${L.reassign_hint ?? "담당 나누기"}"><option value="" ${!cur ? "selected" : ""}>${L.assignee_none ?? "미배정"}</option>${customOpt}${memberOpts}</select>`;
  };
  const orphanIds = new Set(); // 부모가 현재 목록 밖(상태필터/페이지)인 자식 — 들여쓰기 오인 방지 위해 평면 처리
  const renderItemRow = (i) => state.itemEdit === i.id
    ? `<tr class="item-edit-row"><td colspan="7"><div class="item-edit">
        <input class="ie-title" value="${esc(i.title)}" placeholder="${L.col_title ?? "제목"}" />
        <input class="ie-due" type="date" value="${i.due ?? ""}" />
        <input class="ie-assignee" value="${esc(i.assignee_ref ?? "")}" placeholder="${L.col_assignee ?? "담당"}" size="10" />
        <button class="fav-chip active ie-save" data-i="${esc(i.id)}">${L.act_save ?? "저장"}</button>
        <button class="fav-chip ie-cancel">${L.act_cancel ?? "취소"}</button>
        <button class="fav-chip ie-del" data-i="${esc(i.id)}">${L.act_delete ?? "삭제"}</button>
      </div></td></tr>`
    : `<tr class="${i.parent_item_id && !orphanIds.has(i.id) ? "item-child" : ""}" data-item="${esc(i.id)}">
	      <td>${i.parent_item_id && !orphanIds.has(i.id) ? '<span class="child-twig">↳</span> ' : ""}${i.urgency === "high" ? '<span class="prio-star" title="우선">⭐</span> ' : ""}${esc(i.title)}${i.child_total > 0 ? ` <span class="badge child-prog" title="${esc(L.child_progress ?? "세부할일")}">${i.child_done}/${i.child_total}</span>` : ""}${i.encounter_role === "boss" ? " 👑" : ""}${codexTaskIndicatorHtml(i)}${itemAutomationHints(i)}${itemSourceTrace(i)}</td>
      <td><span class="proj-link" data-hub="${esc(i.project_id)}">${esc(i.project_id)}</span></td>
      <td>${statusBadge(i.status)}</td>
      ${dueCell(i.due, todayKey)}
      <td>${reassignCell(i)}</td>
      <td>${itemLinkCell(i)}</td>
      <td class="acts">${i.status === "archived"
        ? `<button class="act-btn restore-btn" data-restore="${esc(i.id)}">${L.act_restore ?? "복구"}</button>`
        : `${itemActionsHtml(i)}${codexTaskButtonHtml(i.id, "", itemStarted(i))}${i.parent_item_id ? "" : `<button class="act-btn split" data-split="${esc(i.id)}" data-sp-proj="${esc(i.project_id)}" data-sp-title="${esc(i.title)}">${L.split_subtasks ?? "나누기"}</button>`}<button class="act-btn edit" data-edit="${esc(i.id)}">${L.act_edit ?? "수정"}</button>`}</td>
    </tr>`;
  const isTriage = state.statusFilter === "unclassified";
  const isArchived = state.statusFilter === "archived";
  const isDone = state.statusFilter === "done";
  // B-5 제안 수신함: '내게 제안된 것만' 렌즈(팀 공용 미분류함 데이터는 그대로, 개인 필터만).
  const sugMineActive = isTriage && state.suggestedMine && !!state.account;
  if (sugMineActive) {
    const me = [state.account.email, state.account.display_name, state.account.username]
      .filter(Boolean).map((s) => String(s).toLowerCase());
    items = items.filter((i) => {
      const v = String(i.suggested_assignee_ref ?? i.assignee_ref ?? "").trim().toLowerCase();
      return v && me.includes(v);
    });
  }
  // 자동 정리 영수증(스레드 귀속·사본 정리) 집계 — "화면에 안 뜨는 메일 = 삭제 아님" 가시화.
  const receipts = isTriage
    ? await api(state.projectFilter ? `/api/mail/receipts?project=${encodeURIComponent(state.projectFilter)}` : "/api/mail/receipts").catch(() => null)
    : null;
  const autoCleanedNote = receipts && receipts.total
    ? `<div class="triage-note">${esc(`자동 정리됨(영수증): 스레드 귀속 ${receipts.by_reason?.thread_followup ?? 0} · 팀 사본 정리 ${receipts.by_reason?.duplicate_of ?? 0} · 할일 아님 ${receipts.by_reason?.not_task ?? 0} — 여기 안 뜨는 메일은 삭제가 아니라 기존 할일/대표 메일에 귀속된 것입니다`)}</div>`
    : "";
  // 분해: 부모가 현재 목록 밖(상태필터/페이지)인 자식 = 평면 처리. done 뷰 포함 모든 뷰 공통으로 먼저 계산(들여쓰기 오인 방지).
  {
    const topIds0 = new Set(items.filter((i) => !i.parent_item_id).map((i) => i.id));
    orphanIds.clear();
    for (const i of items) if (i.parent_item_id && !topIds0.has(i.parent_item_id)) orphanIds.add(i.id);
  }
  let rows;
  if (isDone) {
    // '한 일'을 완료 날짜(요일)별로 묶어 최근순으로 — 무엇을 언제 끝냈는지 돌아보게. done_at 없는 이전 완료분은 맨 아래.
    const wk = ["일", "월", "화", "수", "목", "금", "토"];
    const sorted = [...items].sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
    let lastDay = null;
    rows = sorted.map((i) => {
      // 로컬 달력일 기준 — done_at(UTC ISO) 을 slice 하면 KST 저녁 완료분이 하루 밀리므로 로컬 Date 에서 일자·요일을 함께 뽑음.
      const dt = i.done_at ? new Date(i.done_at) : null;
      const day = dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}` : "";
      let head = "";
      if (day !== lastDay) {
        lastDay = day;
        const lbl = dt ? `${day} (${wk[dt.getDay()]})` : (L.done_no_date ?? "완료일 미상(이전 완료분)");
        head = `<tr class="date-sep"><td colspan="7">${esc(lbl)}</td></tr>`;
      }
      return head + renderItemRow(i);
    }).join("");
  } else {
    // 분해: 부모를 먼저, 그 자식들을 바로 밑에 들여쓰기로. 부모가 이 목록에 없는 자식은 제자리에 평면 표시.
    const byParent = new Map();
    for (const i of items) {
      if (!i.parent_item_id) continue;
      if (!byParent.has(i.parent_item_id)) byParent.set(i.parent_item_id, []);
      byParent.get(i.parent_item_id).push(i);
    }
    const topIds = new Set(items.filter((i) => !i.parent_item_id).map((i) => i.id)); // 그룹핑용(orphanIds는 위에서 이미 계산)
    const out = [];
    for (const i of items) {
      if (i.parent_item_id && topIds.has(i.parent_item_id)) continue; // 자식은 부모 밑에서 렌더
      out.push(renderItemRow(i));
      for (const c of byParent.get(i.id) ?? []) out.push(renderItemRow(c));
    }
    rows = out.join("");
  }
  // 분류 카드는 항목의 기존값(메일/LLM 제안·결정적 SE단계)을 pre-fill → 사람은 확인만. (코어 LLM 0%: LLM은 제안, 확정은 사람)
  const optsSel = (labels, sel) => Object.entries(labels).map(([k, v]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${v}</option>`).join("");
	  const triageBody = !isTriage ? "" : (items.length
	    ? `<div class="classify-list">${items.map((i) => {
	        const suggested = !!(i.work_type || i.completion_criteria); // 제안값이 채워져 옴
	        // B-5: 추천담당을 계정으로 resolve — 매칭되면 계정 표기로 치환(승인 후 '내 할 일' 스코프에 잡히게),
	        // 미매칭이면 원문 유지 + 경고 배지(그대로 확정 시 그 팀원 화면에 안 잡히는 함정 방지).
	        const suggestedRef = i.assignee_ref || i.suggested_assignee_ref || "";
	        const resolvedScope = resolveScopeRef(suggestedRef);
	        const assigneeDefault = (resolvedScope ? resolvedScope.label : suggestedRef) || state.account?.display_name || state.account?.username || state.account?.email || "";
	        const mismatchBadge = suggestedRef && !resolvedScope && Array.isArray(state._scopes) && state._scopes.length
	          ? `<span class="dim mini" title="추천담당이 계정 목록과 일치하지 않습니다 — 확인 후 담당 칸을 수정하세요">⚠ 계정 미매칭</span>` : "";
	        return `<div class="classify-card" data-id="${esc(i.id)}">
	        <div class="cc-head"><span class="cc-title">${esc(i.title)}</span><span class="proj-link label-chip" data-hub="${esc(i.project_id)}">${esc(projDisplay(i.project_id))}</span>
	          ${suggested ? `<span class="badge mini">${L.cls_suggested ?? "제안"}</span>` : ""}${i.anchor_stage_code ? `<span class="dim mini">SE ${esc(i.anchor_stage_code)}</span>` : ""}</div>
	        ${itemAutomationHints(i)}
	        ${itemReviewTrace(i)}
	        ${itemSourceTrace(i)}
	        <div class="cc-form">
	          <select class="cc-wt"><option value="">${L.cls_work_type ?? "업무유형"}…</option>${optsSel(WORK_TYPE_LABELS, i.work_type)}</select>
	          <select class="cc-lk"><option value="">${L.cls_link_kind ?? "연결대상"}…</option>${optsSel(LINK_KIND_LABELS, i.link_kind)}</select>
	          <input class="cc-ref" placeholder="${L.cls_link_ref ?? "연결 대상(산출물/BOM/업체…)"}" value="${esc(i.link_ref ?? "")}" />
	          <input class="cc-cc" placeholder="${L.cls_completion ?? "완료기준(무엇을 하면 닫히나)"}" value="${esc(i.completion_criteria ?? "")}" />
	          <input class="cc-assignee" placeholder="${L.col_assignee ?? "담당"}" value="${esc(assigneeDefault)}" size="10" />${mismatchBadge}
	          <button class="fav-chip cc-go">${L.cls_confirm ?? "정식 등록"}</button><span class="cc-msg dim"></span>
	        </div></div>`; }).join("")}</div>`
	    : `<div class="empty">${L.cls_none ?? "분류할 항목 없음"}</div>`);
	  const pageFrom = itemPage.total ? itemPage.offset + 1 : 0;
	  const pageTo = itemPage.offset + items.length;
	  const itemPager = itemPage.total > itemPage.limit
	    ? `<div class="pager-row"><span class="dim">${pageFrom}-${pageTo} / ${itemPage.total}</span>
	        <button id="itemPrev" class="fav-chip mini" ${itemPage.offset <= 0 ? "disabled" : ""}>이전</button>
	        <button id="itemNext" class="fav-chip mini" ${!itemPage.has_more ? "disabled" : ""}>다음</button></div>`
	    : "";
	  $("#view").innerHTML = `
    <div class="filters">
      <select id="fProject"><option value="">${L.project}: ${L.all_label}</option>${opts}</select>
      ${useView ? `<label class="view-scope-lab">${L.view_scope ?? "보기 대상"} ${viewRosterHtml(L)}</label>`
        : (state.account ? `<button id="mineToggle" class="fav-chip ${mine ? "on" : ""}" title="${L.mine_hint ?? ""}">${mine ? L.mine_only : L.mine_all}</button>` : "")}
      ${isTriage && state.account ? `<button id="sugMineToggle" class="fav-chip ${sugMineActive ? "on" : ""}" title="추천담당이 나인 제안만 표시(제안 수신함 렌즈)">내게 제안만${sugMineActive ? ` ${items.length}` : ""}</button>` : ""}
    </div>
    <div class="status-chips">${chipsHtml}</div>
    ${triageNote}${autoCleanedNote}
    ${isArchived ? `<div class="triage-note">${L.archived_note ?? "보관(삭제)된 할 일입니다. '복구'를 누르면 활성 목록으로 되돌아갑니다. 이력은 event_log에 그대로 남습니다."}</div>` : ""}
    ${isDone ? `<div class="triage-note">${L.done_view_note ?? "완료한 일을 완료 날짜별로 모았습니다. 각 항목의 '다시 열기'로 되돌릴 수 있어요."}</div>` : ""}
    ${(isTriage || isArchived) ? "" : `<div class="item-form">
      <select id="niProject">${opts || `<option value="">${L.project}</option>`}</select>
      <input id="niTitle" placeholder="${L.item_new_ph}" />
      <input id="niAssignee" placeholder="${L.assignee_ph}" size="9" value="${esc(state.account?.display_name || state.account?.username || "")}" />
      <input id="niDue" type="date" />
      <button id="niAdd" class="fav-chip">${L.item_add}</button>
    </div>`}
	    ${isTriage ? triageBody : (rows ? `<table><thead><tr><th>${L.item}</th><th>${L.project}</th><th>${L.th_status}</th><th>${L.th_due}</th><th>${L.th_assignee}</th><th>${L.tab_guide}</th><th>${L.th_actions}</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">${L.empty_items}</div>`)}
	    ${itemPager}`;
	  $("#fProject").addEventListener("change", (e) => { state.projectFilter = e.target.value; resetItemPaging(); render(); });
  wireViewRoster();
	  $("#mineToggle")?.addEventListener("click", () => {
	    state.mineOnly = !state.mineOnly;
	    localStorage.setItem("dev_erp_mine", state.mineOnly ? "1" : "0");
	    resetItemPaging();
	    render();
	  });
	  $("#sugMineToggle")?.addEventListener("click", () => {
	    state.suggestedMine = !state.suggestedMine;
	    localStorage.setItem("dev_erp_sug_mine", state.suggestedMine ? "1" : "0");
	    render();
	  });
  $("#niAdd")?.addEventListener("click", async () => {
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
  $("#niTitle")?.addEventListener("keydown", (e) => { if (e.key === "Enter") $("#niAdd").click(); });
  if (state.focusNewItem && $("#niTitle")) { state.focusNewItem = false; $("#niTitle").focus(); }
  // 분류 폼: 미분류 → confirmItem(정식 등록)
  $("#view").querySelectorAll(".classify-card").forEach((card) => {
    card.querySelector(".cc-go").addEventListener("click", async () => {
      const v = (sel) => card.querySelector(sel).value.trim();
      const body = { id: card.dataset.id };
      if (v(".cc-wt")) body.work_type = v(".cc-wt");
	      if (v(".cc-lk")) body.link_kind = v(".cc-lk");
	      if (v(".cc-ref")) body.link_ref = v(".cc-ref");
	      if (v(".cc-cc")) body.completion_criteria = v(".cc-cc");
	      if (v(".cc-assignee")) body.assignee_ref = v(".cc-assignee");
	      const res = await post("/api/items/confirm", body);
      if (res.ok) { // #1 분류 연속성: 등록 후 스크롤 위치 유지 → 다음 미분류 항목이 제자리로(메일 '분류하고 다음'과 같은 흐름). 맨 위로 안 튐.
        toast(L.cls_confirmed ?? "정식 등록됨", "ok");
        const y = window.scrollY;
        await render();
        requestAnimationFrame(() => window.scrollTo(0, y));
        return;
      }
      const err = await res.json().catch(() => ({}));
      card.querySelector(".cc-msg").textContent = err.error === "needs_se_anchor"
        ? (L.cls_need ?? "업무유형 + 연결대상(또는 단계)이 있어야 정식 등록됩니다") : (err.error ?? "등록 실패");
    });
  });
	  $("#view").querySelectorAll(".status-chip").forEach((c) =>
	    c.addEventListener("click", () => { state.statusFilter = c.dataset.st || ""; resetItemPaging(); render(); })
	  );
	  $("#itemPrev")?.addEventListener("click", () => { state.itemOffset = Math.max(0, state.itemOffset - state.itemLimit); render(); });
	  $("#itemNext")?.addEventListener("click", () => { state.itemOffset += state.itemLimit; render(); });
  $("#view").querySelectorAll("[data-hub]").forEach((c) =>
    c.addEventListener("click", () => { state.hubProject = c.dataset.hub; state.hubTab = "overview"; state.view = "project"; render(); })
  );
  // B-5: 출처의 '메일 <이력키>' 클릭 → 통합검색으로 원 메일 점프(승격 조인과 같은 이력키 기준).
  $("#view").querySelectorAll(".mail-jump").forEach((el) =>
    el.addEventListener("click", () => { state.searchTerm = el.dataset.mailq; state.view = "search"; render(); })
  );
  wireItemActions($("#view"));
  wireTaskCodexButtons($("#view"));
  wireItemEdit($("#view"));
  // 담당 드롭다운 → 즉시 재배정(/api/items/assign). 그 팀원 '내 할 일'로 이동.
  $("#view").querySelectorAll("select.reassign").forEach((sel) =>
    sel.addEventListener("change", async (e) => {
      e.stopPropagation();
      const r = await post("/api/items/assign", { id: sel.dataset.i, assignee_ref: e.target.value });
      if (r.ok) render();
      else { const er = await r.json().catch(() => ({})); alert(er.error || (state.lex.act_save_failed ?? "저장 실패")); render(); }
    })
  );
}

// F2: 할 일 인라인 수정(제목·마감·담당) + 소프트삭제. 재배정은 기존 /api/items/assign 연결.
function wireItemEdit(scope) {
  scope.querySelectorAll(".edit[data-edit]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); state.itemEdit = b.dataset.edit; render(); })
  );
  // 행 클릭 → 인라인 편집 열기(버튼·셀렉트·과제링크 등 컨트롤 클릭은 제외). 일반 표 UX(행 클릭=편집).
  scope.querySelectorAll("tr[data-item]").forEach((tr) =>
    tr.addEventListener("click", (e) => {
      if (e.target.closest("button, select, input, a, .proj-link")) return;
      state.itemEdit = tr.dataset.item; render();
    })
  );
  scope.querySelectorAll(".split[data-split]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); openSplitModal(b.dataset.split, b.dataset.spProj, b.dataset.spTitle, () => render()); })
  );
  scope.querySelectorAll(".ie-cancel").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); state.itemEdit = null; render(); })
  );
  scope.querySelectorAll(".ie-save").forEach((b) =>
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const row = b.closest(".item-edit");
      const id = b.dataset.i;
      const title = row.querySelector(".ie-title").value.trim();
      if (!title) { row.querySelector(".ie-title").focus(); return; }
      const due = row.querySelector(".ie-due").value || "";
      const assignee = row.querySelector(".ie-assignee").value.trim();
      const r1 = await post("/api/items/update", { id, title, due });
      if (!r1.ok) { const er = await r1.json().catch(() => ({})); alert(er.error || (state.lex.act_save_failed ?? "저장 실패")); return; }
      const r2 = await post("/api/items/assign", { id, assignee_ref: assignee });
      if (!r2.ok) { const er = await r2.json().catch(() => ({})); alert(er.error || (state.lex.act_save_failed ?? "저장 실패")); return; }
      state.itemEdit = null;
      render();
    })
  );
  scope.querySelectorAll(".ie-del").forEach((b) =>
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      // 사유 입력 = 확인 겸용(취소=Esc/취소, 빈칸 확인=사유 없이 보관). 사유는 event_log 이력에 남음.
      const reason = window.prompt(state.lex.item_delete_reason ?? "삭제(보관) 사유 — 비워도 됩니다. 이력에 남습니다. (취소하려면 Esc)", "");
      if (reason === null) return;
      const r = await post("/api/items/delete", { id: b.dataset.i, reason: reason.trim() });
      if (!r.ok) { const er = await r.json().catch(() => ({})); alert(er.error || (state.lex.act_delete_failed ?? "삭제 실패")); return; }
      state.itemEdit = null;
      render();
    })
  );
  // 보관함 복구: archived → open(활성 목록 복귀)
  scope.querySelectorAll(".restore-btn[data-restore]").forEach((b) =>
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const r = await post("/api/items/restore", { id: b.dataset.restore });
      if (!r.ok) { const er = await r.json().catch(() => ({})); alert(er.error || (state.lex.act_restore_failed ?? "복구 실패")); return; }
      render();
    })
  );
}

// 결정적 프로젝트 라벨 색 (저채도 12팔레트 — 파워유저 페르소나 제안)
const LABEL_PALETTE = ["#3b6ea5", "#7c5db0", "#2c7a4b", "#9a6a00", "#b3552f", "#0e7490", "#a04668", "#5b7a2f", "#705a9e", "#207a6c", "#8a6d3b", "#54708a"];
function projColor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return LABEL_PALETTE[h % LABEL_PALETTE.length];
}
function projChip(projectId, cls) {
  if (!projectId) return `<span class="label-chip gray">${state.lex.unlabeled}</span>`;
  if (cls === "inbox") return `<span class="label-chip gray" data-lp="${esc(projectId)}">${esc(projectId)}</span>`;
  return `<span class="label-chip" style="--lc:${projColor(projectId)}" data-lp="${esc(projectId)}">${esc(projectId)}</span>`;
}

const MAIL_THREAD_PREFIX_RE = /^(\s*(?:re|fw|fwd|전달|회신)\s*[:：]\s*)+/i;
// 끝의 부분/버전 표시 제거: (P.2) (2) (2/3) [2] [2/3] — 첨부 쪼갬·재송부 변형을 같은 대화로. 1~2자리만(연도 (2026) 오인 방지)
const MAIL_THREAD_PART_RE = /\s*[([]\s*(?:p\s*\.?\s*)?\d{1,2}(?:\s*\/\s*\d{1,2})?\s*[)\]]\s*$/i;
function mailThreadSubject(subject) {
  const base = String(subject ?? "").replace(MAIL_THREAD_PREFIX_RE, "").replace(MAIL_THREAD_PART_RE, "").trim();
  return base || String(subject ?? "").trim() || "(제목 없음)";
}
function mailThreadKind(subject) {
  const s = String(subject ?? "").trim();
  if (/^(fw|fwd|전달)\s*[:：]/i.test(s)) return "전달";
  if (/^(re|회신)\s*[:：]/i.test(s)) return "회신";
  return "";
}
function mailShortRef(value, max = 42) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
function mailIdTail(id) {
  const s = String(id ?? "").trim();
  return s.length <= 8 ? s : s.slice(-8);
}
function mailPreviewLine(m) {
  // 목록 둘째줄 = 사람이 읽는 본문 발췌. 내부 plumbing(메일함/소스/원문/ID)은 목록에서 빼고 상세 패널에만 둔다.
  const body = String(m.body_text ?? m.body_preview ?? "").replace(/\s+/g, " ").trim();
  return body ? (body.length > 140 ? `${body.slice(0, 140)}…` : body) : "";
}
function mailIdentLine(m) {
  // 상세 패널 '식별 정보' 전용 — 내부 plumbing(메일함/소스/원문/ID). 목록엔 안 씀.
  return [
    m.mailbox ? `메일함 ${m.mailbox}` : "",
    m.source_ref ? `소스 ${m.source_ref}` : "",
    m.pointer_ref ? `원문 ${m.pointer_ref}` : "",
    m.id ? `ID ${mailIdTail(m.id)}` : ""
  ].filter(Boolean).map((x) => mailShortRef(x, 54)).join(" · ");
}

// ── 공통 DnD: 행(미배정 할일/메일)을 '내 할일' 드롭존에 놓으면 내 일로. 대시보드 mine 위젯 + 미분류 메일함 화면 공용. ──
function dndPayload(tr) {
  if (tr.dataset.item) return `claim-item:${tr.dataset.item}`;
  const mid = tr.dataset.mail || tr.dataset.m; // 대시보드=data-mail, 메일함 화면=data-m
  return mid ? `claim-mail:${mid}` : "";
}
function dndMakeRows(scope) {
  scope.querySelectorAll('[data-body="unassigned"] tr[data-item], [data-body="mail"] tr[data-mail], [data-body="inbox"] tr[data-mail], .mail-table tr.mail-row[data-m]').forEach((tr) => {
    if (tr.dataset.dndBound === "1") return; // 재바인드 방지
    tr.dataset.dndBound = "1";
    tr.setAttribute("draggable", "true");
    tr.classList.add("dnd-row");
    tr.addEventListener("dragstart", (e) => {
      const p = dndPayload(tr); if (!p) return;
      e.stopPropagation(); // 위젯 재배치/grid 로 버블 차단
      e.dataTransfer.setData("text/plain", p);
      e.dataTransfer.effectAllowed = "move";
      document.body.classList.add("dnd-active"); // 드롭존 노출/강조
    });
    tr.addEventListener("dragend", () => document.body.classList.remove("dnd-active"));
  });
}
async function dndHandleDrop(data, assignee) {
  const L = state.lex;
  const me = state.account?.display_name || state.account?.username || state.account?.email || "";
  const unassign = assignee === "__UNASSIGN__"; // 미배정 레인에 드롭
  const who = unassign ? "" : ((assignee && String(assignee).trim()) || me); // 레인이 담당자면 그 사람, 아니면 나
  const okMsg = unassign ? (L.claim_unassigned_done ?? "미배정 할일로 등록했어요")
    : (who === me ? (L.claim_done ?? "내 일로 가져왔습니다") : `${who}${L.claim_assigned_suffix ?? " 님에게 배정했습니다"}`);
  if (data.startsWith("claim-item:")) {
    const r = await post("/api/items/assign", { id: data.slice(11), assignee_ref: who }); // 미배정이면 빈값 → 담당 해제
    toast(r.ok ? okMsg : (L.claim_fail ?? "배정 실패"), r.ok ? "ok" : "error");
    if (r.ok) render();
  } else if (data.startsWith("claim-mail:")) {
    // 메일 승격 → (담당 배정) → open. 미배정 드롭이면 배정 건너뛰고 open 미배정 할일로. 타인 open 항목이면 assign 403 → 가로채기 방지.
    const pr = await post("/api/items/promote", { mail_id: data.slice(11) });
    const body = await pr.json().catch(() => ({}));
    const itemId = body.item?.id || body.item_id;
    if (!itemId) { toast(mailPromoteErrorText(body.error, L), "error"); return; }
    if (!unassign) {
      const ar = await post("/api/items/assign", { id: itemId, assignee_ref: who });
      if (!ar.ok) { toast(L.claim_taken ?? "이미 다른 사람의 할 일입니다", "error"); render(); return; }
    }
    const sr = await post("/api/items/status", { id: itemId, status: "open" });
    if (!sr.ok) { toast(L.claim_fail ?? "배정 실패", "error"); render(); return; }
    toast(okMsg, "ok");
    render();
  }
}
function dndWireDrop(el, assignee) {
  if (!el || el.dataset.dropBound === "1") return;
  el.dataset.dropBound = "1";
  el.classList.add("dnd-target");
  el.addEventListener("dragover", (e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; el.classList.add("drop-active"); });
  el.addEventListener("dragleave", (e) => { if (e.target === el) el.classList.remove("drop-active"); });
  el.addEventListener("drop", async (e) => {
    e.preventDefault(); e.stopPropagation();
    el.classList.remove("drop-active"); document.body.classList.remove("dnd-active");
    await dndHandleDrop(e.dataTransfer.getData("text/plain") || "", assignee);
  });
}
// 담당자별 드롭 바(콕핏+메일함 공용) — 드래그 중에만 노출. 멤버 = 활성 계정(scopes). 관리자=전체, 그 외=본인.
function claimDropBarHtml() {
  if (!state.account) return "";
  const L = state.lex;
  const members = (state._scopes ?? []).filter((s) => s.id !== "team");
  const myId = state.account.id;
  const memberLanes = members.map((m) =>
    `<button class="claim-lane" data-assignee="${esc(m.label)}">${esc(m.label)}${m.id === myId ? ` (${L.claim_me ?? "나"})` : ""}</button>`).join("");
  // 미배정 레인 — 항상 제공(팀원 없어도 미배정으로 드롭 가능). 담당자 레인이 있으면 그 뒤에.
  const unassignLane = `<button class="claim-lane claim-unassign" data-assignee="__UNASSIGN__">${esc(L.assign_unassigned ?? "미배정")}</button>`;
  return `<div class="claim-drop" id="claimDropBar">
    <span class="claim-drop-hint">📥 ${esc(L.mail_claim_drop_multi ?? "끌어다 담당자나 미배정에 놓으면 그 할 일이 됩니다")}</span>
    <div class="claim-lanes">${unassignLane}${memberLanes}</div></div>`;
}
function wireClaimDropBar(scope) {
  if (!state.account) return;
  dndMakeRows(scope); // 끌 수 있는 행(미배정 할일/메일) 바인딩
  const lanes = scope.querySelectorAll(".claim-lane");
  if (lanes.length) lanes.forEach((el) => dndWireDrop(el, el.dataset.assignee));
  else dndWireDrop(scope.querySelector("#claimDropBar")); // 레인 0(폴백)=나
}

async function renderMail() {
  const L = state.lex;
  await ensureScopes();
  const f = state.mailFilters ?? (state.mailFilters = { days: 90, direction: "", q: "", label: null, groupBy: "project", threaded: true });
  if (f.threaded === undefined) f.threaded = f.groupBy === "thread" || f.groupBy === undefined;
  if (!f.groupBy || f.groupBy === "thread") f.groupBy = "project";
  const params = new URLSearchParams({ days: String(f.days) });
  if (state.projectFilter) params.set("project", state.projectFilter);
  if (f.q) params.set("q", f.q);
  if (f.direction) params.set("direction", f.direction);
  if (f.label) params.set("label_id", String(f.label));
  applyViewScope(params); // 보기 대상(계정 메일함)별 메일 이력
  params.set("page", "1");
  params.set("limit", String(state.mailLimit));
  params.set("offset", String(state.mailOffset));
  const [mailData, labels, summary, promotedRes] = await Promise.all([
    api(`/api/mail?${params}`), api("/api/labels"),
    state._projCache ? Promise.resolve({ projects: state._projCache }) : api("/api/summary"),
    api(state.projectFilter ? `/api/mail/promoted?project=${encodeURIComponent(state.projectFilter)}` : "/api/mail/promoted")
  ]);
  const mailPage = asPage(mailData, state.mailLimit, state.mailOffset);
  const mail = mailPage.rows;
  state._projCache = summary.projects;
  // 승격 표시는 전용 진실원(/api/mail/promoted = origin_mail_id) 기준 — assignee 스코프·unclassified 격리·limit 무관이라
  // 새로고침/다른 PC에서도 ✓ 유지(이전 /api/items 재사용은 unclassified 격리에 걸려 단일유저도 소실됐음).
  const promotedSet = new Set(promotedRes?.ids ?? []);
  for (const id of state._promotedMails ?? []) promotedSet.add(id);
  const clsById = new Map(summary.projects.map((p) => [p.id, p.class]));
  const labelById = new Map(labels.map((l) => [l.id, l]));

  const labelBar = `<div class="label-bar">
    ${labels.map((l) => `<span class="label-chip manual ${f.label === l.id ? "on" : ""}" style="--lc:${esc(l.color)}" data-l="${l.id}">${esc(l.name)}<b class="chip-color" data-color-label="${l.id}" style="background:${esc(l.color)}" title="${L.label_color ?? "색 변경(클릭)"}"></b><b class="chip-edit" data-edit-label="${l.id}" title="${L.label_rename ?? "이름 변경"}">✎</b><b class="chip-del" data-del-label="${l.id}" title="${L.label_delete ?? "라벨 삭제"}">×</b></span>`).join("")}
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
    <select id="mGroup" title="${L.mail_group_project}/${L.mail_group_date}">
      <option value="project" ${f.groupBy === "project" ? "selected" : ""}>${L.mail_group_project}</option>
      <option value="date" ${f.groupBy === "date" ? "selected" : ""}>${L.mail_group_date}</option>
    </select>
    <label class="view-scope-lab"><input id="mThreaded" type="checkbox" ${f.threaded ? "checked" : ""} /> ${L.mail_group_thread}</label>
    <input id="mSearch" type="search" placeholder="${L.search_placeholder}" value="${esc(f.q)}" />
    ${showViewScope() ? `<label class="view-scope-lab">${L.view_scope ?? "보기 대상"} ${viewRosterHtml(L)}</label>` : ""}
  </div>`;

  const todayKey = new Date().toISOString().slice(0, 10);
  const weekStart = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const section = (m) => {
    const d = m.at.slice(0, 10);
    return d === todayKey ? "sec_today" : d >= weekStart ? "sec_week" : "sec_older";
  };
  const checked = (state.mailChecked ??= new Set());
  const pageIds = mail.map((m) => String(m.id));
  const pageSelected = pageIds.filter((id) => checked.has(id)).length;
  const titleById = new Map(summary.projects.map((p) => [p.id, p.title]));
  const subjectCounts = new Map();
  for (const m of mail) {
    const key = mailThreadSubject(m.subject).toLowerCase();
    subjectCounts.set(key, (subjectCounts.get(key) ?? 0) + 1);
  }
  // 팀 전체 보기일 때 각 메일이 누구 메일함인지(차오름/문성용)를 칩으로 표시(개인 뷰에선 중복이라 생략).
  const teamView = !state.viewScope || state.viewScope === "team";
  const ownerScopes = (state._scopes ?? []).filter((s) => s.email && s.id !== "team");
  // 팀원별로 칩 색을 다르게(구분용). 팔레트 인덱스 = scopes 순서 → 인접 멤버 색 보장(과제 칩과 같은 LABEL_PALETTE).
  const ownerColorById = new Map(ownerScopes.map((s, i) => [s.id, LABEL_PALETTE[i % LABEL_PALETTE.length]]));
  const ownerInfoFor = (mailbox) => {
    const mb = String(mailbox || "");
    if (!mb) return null;
    const s = ownerScopes.find((x) => mb === x.email || mb.startsWith(`${x.email}/`) || mb.startsWith(`${x.email}\\`));
    if (s) return { label: s.label, shared: false, color: ownerColorById.get(s.id) };
    if (mb === "company_mailbox") return { label: L.mailbox_shared ?? "공용함", shared: true }; // 옛 메일: 주인 미상(개인귀속 전 초기 수집분, 서버에 없어 재수신 불가)
    return null;
  };
  // 한 줄 렌더. showProj 인자는 예전 호출 호환용으로 남기되, 프로젝트 칩은 항상 보여준다.
  const mailRow = (m, showProj, extraCls = "") => {
    const picked = checked.has(String(m.id));
    const manual = m.label_ids.map((id) => labelById.get(id)).filter(Boolean)
      .map((l) => `<span class="label-chip manual mini" style="--lc:${esc(l.color)}">${esc(l.name)}</span>`).join("");
    const oi = teamView ? ownerInfoFor(m.mailbox) : null;
    const ownerChip = oi ? `<span class="label-chip mailbox-owner mini${oi.shared ? " shared" : ""}"${oi.color ? ` style="--lc:${oi.color}"` : ""} title="${L.mailbox_owner ?? "메일함 주인"}">${esc(oi.label)}</span>` : "";
    const meta = ownerChip + projChip(m.project_id, clsById.get(m.project_id)) + manual;
    const threadSubject = mailThreadSubject(m.subject);
    const kind = mailThreadKind(m.subject);
    const dupe = subjectCounts.get(threadSubject.toLowerCase()) > 1;
    const preview = mailPreviewLine(m);
    return `<tr class="mail-row ${kind ? "thread-child" : ""} ${state.mailSel === m.id ? "sel" : ""} ${extraCls}" data-m="${esc(m.id)}">
      <td class="mail-check"><input type="checkbox" data-chk="${esc(m.id)}" ${picked ? "checked" : ""} />
        <button class="mail-pick ${picked ? "on" : ""}" data-pick="${esc(m.id)}" title="${picked ? "선택 해제" : "선택"}">${picked ? "해제" : "선택"}</button></td>
      <td class="mail-from">${meta ? `<span class="mail-chips">${meta}</span>` : ""}${m.direction === "out" ? `<i>→</i> ` : ""}${esc(m.counterpart ?? "-")}</td>
      <td class="mail-subj" title="${esc([m.subject, preview].filter(Boolean).join(" · "))}">
        <div class="mail-subj-main">${kind ? `<span class="mail-thread-kind">${esc(kind)}</span>` : ""}${esc(m.subject)}${m.recipients > 1 ? `<span class="mail-recip" title="${L.mail_recipients ?? "이 메일을 받은 팀원 수(중복 메일 합침)"}">👥 ${m.recipients}</span>` : ""}${dupe ? `<span class="mail-dupe" title="같은 대화/제목의 다른 메일">#${esc(mailIdTail(m.id))}</span>` : ""}${promotedSet.has(m.id) ? `<span class="mail-promoted" title="${L.promote_done ?? "할 일로 등록됨"}">✓ ${L.item}</span>` : ""}</div>
        ${preview ? `<div class="mail-preview">${esc(preview)}</div>` : ""}
      </td>
      <td class="mail-time">${localTime(m.at)}</td>
    </tr>`;
  };
  state.expandedThreads = state.expandedThreads || new Set();
  let threadSeq = 0;
  // 스레드(대화) 그룹 단위 일괄 처리(2026-07-07 owner) — 그룹 헤더의 담당/과제 select 옵션.
  // 담당 배정은 스레드의 현재 실과제를 유지(없으면 general_work)하고, 과제 이동은 thread-proj 가 담당.
  const threadAssignMembers = (state._scopes ?? []).filter((s) => s.id !== "team");
  const threadAssignOpts = `<option value="">${L.thread_assign_ph ?? "이 대화 담당…"}</option>`
    + `<option value="__UNASSIGN__">${L.assign_unassigned ?? "미배정"}</option>`
    + threadAssignMembers.map((m) => `<option value="${esc(m.label)}">${esc(m.label)}</option>`).join("");
  const threadProjAssignables = summary.projects.filter((p) => p.class !== "inbox" && p.class !== "archive");
  const threadProjIds = new Set(threadProjAssignables.map((p) => p.id));
  const threadProjOpts = `<option value="">${L.thread_proj_ph ?? "이 대화 분류…"}</option>`
    + threadProjAssignables.map((p) => `<option value="${esc(p.id)}">${esc(p.title === p.id ? projDisplay(p.id) : `${p.id} · ${p.title}`)}</option>`).join("");
  const canThreadOps = !!state.account; // 로그인 팀원은 대화 단위 분류·배정 가능(미분류 위젯과 동일 기준)
  const renderThreadRows = (items, showProj, scopeKey) => {
    if (!f.threaded) return items.map((m) => mailRow(m, showProj)).join("");
    const groups = new Map();
    for (const m of items) {
      const key = mailThreadSubject(m.subject);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    const ordered = [...groups.entries()].sort((a, b) => (b[1][0]?.at ?? "").localeCompare(a[1][0]?.at ?? ""));
    return ordered.map(([subject, ms]) => {
      if (ms.length === 1) return mailRow(ms[0], showProj);
      const sorted = [...ms].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
      const tkey = `thr${threadSeq++}`;
      const stateKey = `${scopeKey}::${subject}`;
      const open = state.expandedThreads.has(stateKey);
      const latest = sorted[0];
      const convIds = sorted.map((m) => m.id).join(","); // 대화 전체 메일 id — 그룹 일괄 처리 대상
      const threadProj = threadProjIds.has(latest.project_id) ? latest.project_id : "general_work"; // 담당 배정 시 현재 실과제 유지(없으면 일반업무)
      const threadCtl = canThreadOps
        ? ` <select class="thread-assign" data-conv="${esc(convIds)}" data-proj="${esc(threadProj)}" title="${L.thread_assign_hint ?? "이 대화 전체를 한 사람에게 배정"}">${threadAssignOpts}</select>`
          + `<select class="thread-proj" data-conv="${esc(convIds)}" title="${L.thread_proj_hint ?? "이 대화 전체를 다른 과제로 이동"}">${threadProjOpts}</select>`
        : "";
      const head = `<tr class="thread-head${open ? " open" : ""}" data-tkey="${tkey}" data-thread="${esc(stateKey)}"><td colspan="4">`
        + `<span class="thread-toggle">${open ? "▾" : "▸"}</span> <strong>${esc(subject)}</strong> `
        + `<span class="proj-sep-n" title="${L.mail_thread_count ?? "이 대화의 메일 수"}">💬 ${ms.length}</span> `
        + `<span class="dim mini">${esc(latest.counterpart ?? "")} · ${localTime(latest.at)}${promotedSet.has(latest.id) ? " · ✓" : ""}</span>`
        + threadCtl + `</td></tr>`;
      const children = sorted.map((m) => mailRow(m, showProj, `thread-body ${tkey}${open ? " open" : ""}`)).join("");
      return head + children;
    }).join("");
  };
  let rows;
  if (f.groupBy === "date") {
    const groups = new Map();
    for (const m of mail) {
      const key = section(m);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    rows = [...groups.entries()].map(([sec, ms]) =>
      `<tr class="date-sep"><td colspan="4">${L[sec]}</td></tr>` + renderThreadRows(ms, true, `date:${sec}`)
    ).join("");
  } else {
    // 기본: 프로젝트별 구분. 미분류/inbox 는 맨 아래, 그룹은 최신 메일 순.
    const groups = new Map();
    for (const m of mail) {
      const key = m.project_id || "__none__";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    const ordered = [...groups.entries()].sort((a, b) => {
      const an = a[0] === "__none__", bn = b[0] === "__none__";
      if (an !== bn) return an ? 1 : -1;
      return (b[1][0]?.at ?? "").localeCompare(a[1][0]?.at ?? "");
    });
    rows = ordered.map(([pid, ms]) => {
      const none = pid === "__none__";
      const title = titleById.get(pid);
      const headInner = none
        ? `<span class="label-chip gray">${L.unlabeled}</span>`
        : `${projChip(pid, clsById.get(pid))}${title && title !== pid ? `<span class="proj-sep-title">${esc(title)}</span>` : ""}`;
      const header = `<tr class="proj-sep"><td colspan="4">${headInner}<span class="proj-sep-n">${ms.length}</span></td></tr>`;
      return header + renderThreadRows(ms, false, `project:${pid}`);
    }).join("");
  }

  // run17: 분류(재배정) 대상 과제 — inbox 류 제외, 진행 과제 우선
  const assignables = summary.projects.filter((p) => p.class !== "inbox" && p.class !== "archive");
  const assignOpts = assignables.map((p) =>
    `<option value="${esc(p.id)}"${state.lastAssignProject === p.id ? " selected" : ""}>${esc(p.title === p.id ? projDisplay(p.id) : `${p.id} · ${p.title}`)}</option>`).join(""); // 직전 분류 과제 sticky(④) — 연속 분류 시 매번 재선택 불필요
  // 분류 시 담당 선택(미배정/나/팀원). 값=담당자 식별 라벨(claim-drop 과 동일 소스 _scopes). 기본=나.
  const assigneeMembers = (state._scopes ?? []).filter((s) => s.id !== "team");
  const assigneeMyId = state.account?.id;
  let assigneeOpts = `<option value="">${L.assign_unassigned ?? "미배정"}</option>`;
  if (assigneeMembers.length) {
    const meScope = assigneeMembers.find((m) => m.id === assigneeMyId);
    if (meScope) assigneeOpts += `<option value="${esc(meScope.label)}" selected>${esc(meScope.label)} (${L.claim_me ?? "나"})</option>`;
    for (const m of assigneeMembers) { if (m.id === assigneeMyId) continue; assigneeOpts += `<option value="${esc(m.label)}">${esc(m.label)}</option>`; }
  } else if (state.account) {
    const myName = state.account.display_name || state.account.username || "";
    if (myName) assigneeOpts += `<option value="${esc(myName)}" selected>${esc(myName)} (${L.claim_me ?? "나"})</option>`;
  }
  const selectBar = `<div class="mail-selectbar">
      <span class="dim">${pageSelected}/${mail.length} 선택 · 전체 선택 ${checked.size}</span>
      <button id="mailSelectPage" class="fav-chip mini" ${mail.length ? "" : "disabled"}>현재 페이지 전체 선택</button>
      <button id="mailClearPage" class="fav-chip mini" ${pageSelected ? "" : "disabled"}>현재 페이지 해제</button>
      <button id="mailClearAll" class="fav-chip mini" ${checked.size ? "" : "disabled"}>선택 전체 해제</button>
    </div>`;
  const bulkBar = checked.size ? `<div class="assign-bar">
      <strong>${checked.size}${L.assign_unit}</strong>
      <select id="assignTarget">${assignOpts}</select>
      <select id="assignWho2" title="${L.assign_who ?? "담당"}">${assigneeOpts}</select>
      <label class="assign-mk"><input type="checkbox" id="assignMk" checked /> ${L.assign_make_items}</label>
      <button id="assignGo" class="fav-chip active">${L.assign_btn}</button>
    </div>` : "";

  let sel = mail.find((m) => m.id === state.mailSel);
  if (sel) {
    state.mailDetailCache ??= {};
    const cached = state.mailDetailCache[sel.id];
    if (cached) {
      sel = {
        ...sel,
        body_text: cached.body_text,
        body_preview: cached.body_preview ?? sel.body_preview,
        body_text_available: cached.body_text_available ?? sel.body_text_available,
        body_text_len: cached.body_text_len ?? sel.body_text_len,
      };
    } else if (sel.body_text_available && !sel.body_text) {
      try {
        const detailMail = await api(`/api/mail/detail?id=${encodeURIComponent(sel.id)}`, { acceptedDomainStatuses: [403, 404] });
        if (detailMail?.error) throw new Error(detailMail.error);
        state.mailDetailCache[sel.id] = detailMail;
        sel = {
          ...sel,
          body_text: detailMail.body_text,
          body_preview: detailMail.body_preview ?? sel.body_preview,
          body_text_available: detailMail.body_text_available ?? sel.body_text_available,
          body_text_len: detailMail.body_text_len ?? sel.body_text_len,
        };
      } catch {
        // Keep the preview-only row if the detail endpoint is temporarily unavailable.
      }
    }
  }
  const selIdx = sel ? mail.findIndex((m) => m.id === sel.id) : -1; // #10: 현재 페이지 내 위치 → 이전/다음 단건 처리
  const prevMailId = selIdx > 0 ? mail[selIdx - 1].id : null;
  const nextMailId = selIdx >= 0 && selIdx + 1 < mail.length ? mail[selIdx + 1].id : null;
  const selIdent = sel ? mailIdentLine(sel) : "";
  const selKind = sel ? mailThreadKind(sel.subject) : "";
  const detail = sel ? `<aside class="mail-detail">
      <div class="mail-nav">
        <button id="mailDetailPrev" class="fav-chip mini" ${prevMailId ? "" : "disabled"}>◀ ${L.mail_prev ?? "이전"}</button>
        <span class="dim">${selIdx + 1} / ${mail.length} <span class="kbd-hint" title="${L.mail_kbd_hint ?? "j/k 또는 ↑↓ 이동 · Enter 분류하고 다음"}">⌨ j/k·Enter</span></span>
        <button id="mailDetailNext" class="fav-chip mini" ${nextMailId ? "" : "disabled"}>${L.mail_next ?? "다음"} ▶</button>
      </div>
      <h3 class="mail-subject">${esc(sel.subject)}</h3>
      <div class="mail-meta-line"><span class="mail-from-name">${esc(sel.counterpart ?? "-")}</span><span class="dim"> · ${localTime(sel.at)} · ${sel.direction === "in" ? L.mail_in : L.mail_out}</span>${sel.recipient_role === "to" ? ` <span class="badge mini" title="이 메일함이 받는사람(To)으로 수신 — 직접 요청일 가능성이 높음">받는사람</span>` : (sel.recipient_role === "cc" ? ` <span class="badge mini dim" title="이 메일함이 참조(CC)로 수신 — 참고용일 가능성">참조</span>` : "")}${sel.recipients > 1 ? ` <span class="mail-recip" title="${L.mail_recipients ?? "받은 팀원 수"}">👥 ${sel.recipients}</span>` : ""}${sel.project_id ? ` ${projChip(sel.project_id, clsById.get(sel.project_id))}` : ""}</div>
      ${(sel.body_text || sel.body_preview) ? `<div class="mail-body"><div class="mail-body-text">${esc(sel.body_text || sel.body_preview)}</div></div>` : `<div class="mail-body mail-body-empty"><div class="dim mini">${L.mail_body_none ?? "본문 미수집 — 원문은 메일함에서 확인하세요."}</div></div>`}
      <details class="mail-details"><summary class="dim mini">${L.mail_details ?? "세부정보"}</summary>
        <dl>${selKind ? `<div><dt>${L.mail_thread_kind ?? "대화 유형"}</dt><dd>${esc(selKind)} · ${esc(mailThreadSubject(sel.subject))}</dd></div>` : ""}
        ${sel.mailbox ? `<div><dt>${L.mailbox_provider ?? "메일함"}</dt><dd>${esc(sel.mailbox)}</dd></div>` : ""}
        ${sel.source_ref ? `<div><dt>${L.mail_source_ref ?? "소스"}</dt><dd class="dim mini">${esc(sel.source_ref)}</dd></div>` : ""}
        ${selIdent ? `<div><dt>${L.mail_preview_meta ?? "식별 정보"}</dt><dd class="dim mini">${esc(selIdent)}</dd></div>` : ""}
        <div><dt>${L.detail_pointer}</dt><dd class="pointer">${esc(sel.pointer_ref ?? "-")} <button class="copy-btn" data-c="${esc(sel.pointer_ref ?? "")}">${L.copy}</button></dd></div></dl>
      </details>
      ${state.mailEdit === sel.id ? `<div class="mail-edit-form item-form" style="margin:6px 0;display:flex;gap:4px;flex-wrap:wrap">
        <input id="meSubject" value="${esc(sel.subject ?? "")}" placeholder="${L.mail_reg_subject ?? "제목"}" />
        <input id="meFrom" value="${esc(sel.counterpart ?? "")}" placeholder="${L.mail_reg_from ?? "상대"}" size="12" />
        <input id="meDate" type="date" value="${esc((sel.at ?? "").slice(0, 10))}" />
        <button id="meSave" class="fav-chip active">${L.mail_edit_save ?? "저장"}</button>
        <button id="meCancel" class="fav-chip">${L.mail_edit_cancel ?? "취소"}</button>
      </div>` : `<button id="mailEditBtn" class="fav-chip mini">${L.mail_edit ?? "메일 수정"}</button>`}
      <h4>${L.detail_labels}</h4>
      <div class="label-bar">${labels.map((l) => `<span class="label-chip manual ${sel.label_ids.includes(l.id) ? "on" : ""}" style="--lc:${esc(l.color)}" data-toggle="${l.id}">${esc(l.name)}</span>`).join("") || `<span class="dim">-</span>`}</div>
      <div class="detail-actions">${promotedSet.has(sel.id)
        ? `<span class="badge green">✓ ${L.item}</span> <button id="promoteGoTriage" class="fav-chip mini">${L.promote_go_triage ?? "분류하러 가기 →"}</button>`
        : sel.project_id
          ? `<button id="promoteBtn" class="fav-chip">${L.promote_item}</button>`
          : `<span class="dim">${L.promote_need_project ?? "과제로 분류 후 할 일로 승격"}</span>`}</div>
      <h4>${L.assign_to}</h4>
      <div class="assign-bar inline">
        <select id="assignOne">${assignOpts}</select>
        <select id="assignWho1" title="${L.assign_who ?? "담당"}">${assigneeOpts}</select>
        <button id="assignOneGo" class="fav-chip">${L.assign_btn}</button>
        <button id="assignOneNext" class="fav-chip active" ${nextMailId ? "" : "disabled"} title="${L.assign_next_hint ?? "이 메일을 분류하고 바로 다음 메일로"}">${L.assign_next ?? "분류하고 다음 ▶"}</button>
        ${sel.project_id && clsById.get(sel.project_id) !== "inbox" ? `<button id="mailUnassign" class="fav-chip mini" title="${L.mail_unassign_hint ?? "받은함으로 되돌리기"}">${L.mail_unassign ?? "분류 취소"}</button>` : ""}
        <button id="mailSpam" class="fav-chip mini danger" title="${L.mail_spam_hint ?? "스팸/광고 메일 — 이 메일 숨김 또는 발신자 차단"}">${L.mail_spam ?? "스팸"}</button>
        <button id="mailDelete" class="fav-chip mini danger" title="${L.mail_delete_hint ?? "이 메일을 목록에서 삭제(재수집돼도 다시 안 보임)"}">${L.mail_delete ?? "메일 삭제"}</button>
      </div>
    </aside>` : "";

  // 베타1: 각자 메일 등록 폼(원문 미저장 — 제목·상대·날짜·포인터만). 등록 → 분류 → 할 일.
	  const regForm = `<details class="mail-reg" ${state.mailRegOpen ? "open" : ""}>
    <summary>${L.mail_reg_open ?? "＋ 메일 등록"}</summary>
    <div class="item-form">
      <input id="mrSubject" placeholder="${L.mail_reg_subject ?? "제목"}" />
      <input id="mrFrom" placeholder="${L.mail_reg_from ?? "상대(보낸/받는 사람)"}" size="12" />
      <select id="mrDir"><option value="in">${L.mail_in}</option><option value="out">${L.mail_out}</option></select>
      <input id="mrDate" type="date" />
      <select id="mrProject"><option value="">${L.project}: ${L.req_no_project ?? "미연결"}</option>${assignOpts}</select>
      <input id="mrPtr" placeholder="${L.mail_reg_ptr ?? "원문 위치 포인터(Outlook/파일 경로)"}" />
      <textarea id="mrBody" rows="4" placeholder="${L.mail_reg_body ?? "메일 본문"}"></textarea>
      <button id="mrAdd" class="fav-chip active">${L.mail_reg_add ?? "등록"}</button>
    </div>
    <p class="hub-note">${L.mail_reg_note ?? "메일 본문은 ERP 런타임 DB에 저장합니다. 원장·_workmeta에는 본문을 넣지 않습니다."}</p>
  </details>`;
	  const mailFrom = mailPage.total ? mailPage.offset + 1 : 0;
	  const mailTo = mailPage.offset + mail.length;
	  const mailPager = mailPage.total > mailPage.limit
	    ? `<div class="pager-row"><span class="dim">${mailFrom}-${mailTo} / ${mailPage.total}</span>
	        <button id="mailPrev" class="fav-chip mini" ${mailPage.offset <= 0 ? "disabled" : ""}>이전</button>
	        <button id="mailNext" class="fav-chip mini" ${!mailPage.has_more ? "disabled" : ""}>다음</button></div>`
	    : "";
	  // 팀원별 드롭 레인(콕핏·메일함 공용 헬퍼). 메일을 끌어 담당자 레인에 놓으면 승격→배정→open.
	  const claimDrop = claimDropBarHtml();
	  $("#view").innerHTML = `${labelBar}${filterChips}${toolbar}${selectBar}${regForm}${bulkBar}${claimDrop}${mailPager}
	    <div class="mail-split">${rows ? `<table class="mail-table"><tbody>${rows}</tbody></table>` : `<div class="empty">${L.empty_mail}</div>`}${detail}</div>`;

  $("#view").querySelector(".mail-reg")?.addEventListener("toggle", (e) => { state.mailRegOpen = e.target.open; });
  $("#mrAdd")?.addEventListener("click", async () => {
    const subject = $("#mrSubject").value.trim();
    if (!subject) { toast(L.mail_reg_need_subject ?? "제목을 입력하세요", "error"); $("#mrSubject")?.focus(); return; }
    const body = { subject, direction: $("#mrDir").value || "in" };
    if ($("#mrFrom").value.trim()) body.counterpart = $("#mrFrom").value.trim();
    if ($("#mrDate").value) body.at = $("#mrDate").value;
    if ($("#mrProject").value) body.project_id = $("#mrProject").value;
    if ($("#mrPtr").value.trim()) body.pointer_ref = $("#mrPtr").value.trim();
    if ($("#mrBody").value.trim()) body.body_text = $("#mrBody").value.trim();
    const r = await post("/api/mail", body);
    if (r.ok) { state.mailRegOpen = true; toast(L.mail_reg_done ?? "메일이 등록되었습니다", "ok"); render(); }
    else toast(L.mail_reg_fail ?? "메일 등록에 실패했습니다", "error");
  });
	  $("#mDays").addEventListener("change", (e) => { f.days = Number(e.target.value); resetMailPaging(); render(); });
	  $("#mDir").addEventListener("change", (e) => { f.direction = e.target.value; resetMailPaging(); render(); });
	  $("#mGroup")?.addEventListener("change", (e) => { f.groupBy = e.target.value; render(); });
	  $("#mThreaded")?.addEventListener("change", (e) => { f.threaded = e.target.checked; render(); });
	  $("#mSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") { f.q = e.target.value; resetMailPaging(); render(); } });
	  wireViewRoster();
	  $("#view").querySelector("[data-clear]")?.addEventListener("click", () => { state.projectFilter = ""; resetMailPaging(); render(); });
  $("#newLabelBtn").addEventListener("click", async () => {
    const name = $("#newLabelName").value.trim();
    if (!name) { toast(L.label_need_name ?? "라벨 이름을 입력하세요", "error"); $("#newLabelName")?.focus(); return; }
    const r = await post("/api/labels", { name, color: LABEL_PALETTE[labels.length % LABEL_PALETTE.length] });
    const d = await r.json().catch(() => ({}));
    if (r.ok && !d.error) { toast(L.label_created ?? "라벨 생성됨", "ok"); render(); }
    else toast(d.error === "label_exists" ? (L.label_exists ?? "이미 있는 라벨입니다") : (L.label_create_fail ?? "라벨 생성 실패"), "error");
  });
	  $("#view").querySelectorAll(".label-bar [data-l]").forEach((c) =>
	    c.addEventListener("click", () => { f.label = f.label === Number(c.dataset.l) ? null : Number(c.dataset.l); resetMailPaging(); render(); })
	  );
	  $("#view").querySelectorAll("[data-color-label]").forEach((b) =>
	    b.addEventListener("click", async (e) => {
	      e.stopPropagation();
	      const id = Number(b.dataset.colorLabel);
	      const lab = labels.find((l) => l.id === id);
	      const idx = LABEL_PALETTE.indexOf(lab?.color);
	      const next = LABEL_PALETTE[(idx + 1) % LABEL_PALETTE.length]; // 클릭마다 다음 색으로 순환
	      const r = await post("/api/labels/update", { id, color: next });
	      if (r.ok) render();
	      else toast(L.label_color_fail ?? "색 변경 실패", "error");
	    }));
	  $("#view").querySelectorAll("[data-edit-label]").forEach((b) =>
	    b.addEventListener("click", async (e) => {
	      e.stopPropagation(); // 칩 본체(필터 토글)로 안 번지게
	      const id = Number(b.dataset.editLabel);
	      const lab = labels.find((l) => l.id === id);
	      const nt = prompt(L.label_rename_ph ?? "라벨 이름 변경", lab?.name ?? "");
	      if (nt === null) return;
	      if (!nt.trim()) { toast(L.label_need_name ?? "라벨 이름을 입력하세요", "error"); return; }
	      const r = await post("/api/labels/update", { id, name: nt.trim() });
	      const d = await r.json().catch(() => ({}));
	      if (r.ok && !d.error) { toast(L.label_renamed ?? "라벨 이름 변경됨", "ok"); render(); }
	      else toast(d.error === "label_exists" ? (L.label_exists ?? "이미 있는 라벨입니다") : (L.label_rename_fail ?? "라벨 변경 실패"), "error");
	    }));
	  $("#view").querySelectorAll("[data-del-label]").forEach((b) =>
	    b.addEventListener("click", async (e) => {
	      e.stopPropagation(); // 칩 본체(필터 토글)로 안 번지게
	      const id = Number(b.dataset.delLabel);
	      const lab = labels.find((l) => l.id === id);
	      if (!confirm((L.label_delete_confirm ?? "라벨 '%s' 삭제? 모든 메일에서도 제거됩니다.").replace("%s", lab?.name ?? id))) return;
	      const r = await post("/api/labels/delete", { id });
	      if (r.ok) { if (f.label === id) { f.label = null; resetMailPaging(); } toast(L.label_deleted ?? "라벨 삭제됨", "ok"); render(); }
	      else toast(L.label_delete_fail ?? "라벨 삭제 실패", "error");
	    })
	  );
  $("#view").querySelectorAll(".mail-row").forEach((r) =>
    // 토글: 같은 메일 다시 누르면 오른쪽 설명 닫힘
    r.addEventListener("click", () => { state.mailSel = state.mailSel === r.dataset.m ? null : r.dataset.m; render(); })
  );
  // Gmail식 대화 헤더 접기/펼치기 — 재렌더 없이 자식 메일 행 토글(부드럽게). 펼친 상태는 state.expandedThreads로 유지.
  $("#view").querySelectorAll(".thread-head").forEach((h) =>
    h.addEventListener("click", () => {
      const tkey = h.dataset.tkey, subj = h.dataset.thread;
      const open = h.classList.toggle("open");
      if (open) state.expandedThreads.add(subj); else state.expandedThreads.delete(subj);
      const tog = h.querySelector(".thread-toggle"); if (tog) tog.textContent = open ? "▾" : "▸";
      $("#view").querySelectorAll(`.thread-body.${tkey}`).forEach((r) => r.classList.toggle("open", open));
    })
  );
  // 스레드(대화) 그룹 단위 담당/과제 일괄 처리(2026-07-07 owner) — 미분류 위젯 inbox-assign 패턴 이식.
  // select 조작은 헤더 펼침 토글과 분리(stopPropagation). /api/mail/assign 이 mail_ids 배열을 받아 대화 전체 처리.
  $("#view").querySelectorAll(".thread-assign, .thread-proj").forEach((sel) => {
    sel.addEventListener("mousedown", (e) => e.stopPropagation());
    sel.addEventListener("click", (e) => e.stopPropagation());
    sel.addEventListener("change", async (e) => {
      e.stopPropagation();
      const v = sel.value; if (!v) return;
      const conv = (sel.dataset.conv || "").split(",").filter(Boolean);
      if (!conv.length) return;
      const isAssign = sel.classList.contains("thread-assign");
      const body = isAssign
        ? { mail_ids: conv, project_id: sel.dataset.proj || "general_work", assignee_ref: v === "__UNASSIGN__" ? "" : v, make_items: true, single_item: true, open: true }
        : { mail_ids: conv, project_id: v, make_items: true, single_item: true };
      const resp = await post("/api/mail/assign", body);
      const d = await resp.json().catch(() => ({}));
      if (resp.ok && !d.error) {
        if (isAssign) toast((L.thread_assign_done ?? "%n건 대화를 %who에게 배정").replace("%n", conv.length).replace("%who", v === "__UNASSIGN__" ? (L.assign_unassigned ?? "미배정") : v), "ok");
        else { state.lastAssignProject = v; toast((L.thread_proj_done ?? "%n건 대화를 %p로 분류").replace("%n", conv.length).replace("%p", projDisplay(v)), "ok"); }
        render();
      } else { toast((L.thread_op_fail ?? "대화 처리 실패") + (d.error ? ` (${d.error})` : ""), "error"); sel.value = ""; }
    });
  });
  // 메일함 화면 DnD: 메일 행을 끌어 담당자 레인에 놓으면 그 사람 할 일로(공용 헬퍼).
  wireClaimDropBar($("#view"));
	  $("#view").querySelectorAll("[data-lp]").forEach((c) =>
	    c.addEventListener("click", (e) => { e.stopPropagation(); state.projectFilter = c.dataset.lp; resetMailPaging(); render(); })
	  );
	  $("#mailPrev")?.addEventListener("click", () => { state.mailOffset = Math.max(0, state.mailOffset - state.mailLimit); render(); });
	  $("#mailNext")?.addEventListener("click", () => { state.mailOffset += state.mailLimit; render(); });
  $("#mailSelectPage")?.addEventListener("click", () => {
    for (const id of pageIds) checked.add(id);
    render();
  });
  $("#mailClearPage")?.addEventListener("click", () => {
    for (const id of pageIds) checked.delete(id);
    render();
  });
  $("#mailClearAll")?.addEventListener("click", () => {
    checked.clear();
    render();
  });
  $("#view").querySelectorAll("[data-toggle]").forEach((c) =>
    c.addEventListener("click", async () => {
      const on = !c.classList.contains("on");
      await post("/api/mail/label", { mail_id: state.mailSel, label_id: Number(c.dataset.toggle), on });
      render();
    })
  );
  $("#view").querySelectorAll(".copy-btn").forEach((b) =>
    b.addEventListener("click", () => {
      if (navigator.clipboard) { navigator.clipboard.writeText(b.dataset.c); toast(L.copied ?? "복사됨", "ok"); }
      else toast(L.copy_unsupported ?? "이 브라우저에서 복사가 지원되지 않습니다", "error");
    })
  );
  $("#promoteBtn")?.addEventListener("click", async () => {
    const result = await promoteMailToItem(state.mailSel, { button: $("#promoteBtn") });
    if (result.ok) {
      toast(result.already ? (L.promote_already ?? "이미 할 일로 등록됨") : (L.promote_done_go ?? "할 일로 등록 — 분류로 이동"), "ok");
      if (!result.already) { state.statusFilter = "unclassified"; resetItemPaging(); state.view = "items"; } // 승격 직후 '분류 필요'로 바로 진입(수동 탭 클릭 제거)
      render();
    }
  });
  $("#promoteGoTriage")?.addEventListener("click", () => { state.statusFilter = "unclassified"; resetItemPaging(); state.view = "items"; render(); });
  // run17: 분류(재배정) — 체크박스/묶음 바/상세 단건
  $("#view").querySelectorAll("[data-chk]").forEach((cb) =>
    cb.addEventListener("click", (e) => {
      e.stopPropagation();
      cb.checked ? checked.add(cb.dataset.chk) : checked.delete(cb.dataset.chk);
      render();
    })
  );
  $("#view").querySelectorAll("[data-pick]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      checked.has(b.dataset.pick) ? checked.delete(b.dataset.pick) : checked.add(b.dataset.pick);
      render();
    })
  );
  const doAssign = async (mailIds, target, makeItems, nextSel = null, assigneeRef = null) => {
    if (!target) { toast(L.assign_need_target ?? "분류할 과제를 고르세요", "error"); return; }
    const r = await post("/api/mail/assign", { mail_ids: mailIds, project_id: target, make_items: makeItems, assignee_ref: assigneeRef || null, open: makeItems });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) { toast(L.assign_fail ?? "분류 실패", "error"); return; }
    const whoLabel = makeItems ? ` · ${assigneeRef ? assigneeRef : (L.assign_unassigned ?? "미배정")}` : ""; // 누구 담당으로 갔는지 피드백
    toast(`${mailIds.length}${L.assign_unit ?? "건"} ${L.assign_done ?? "분류 완료"}${makeItems ? ` · ${L.assign_made_short ?? "할일 생성"}` : ""}${whoLabel}`, "ok");
    checked.clear();
    state.lastAssignProject = target; // 직전 분류 과제 기억(④) → 다음 렌더 시 드롭다운 기본값
    state.mailSel = nextSel; // '분류하고 다음'이면 다음 메일 선택 유지, 일반 분류면 null(해제)
    render();
  };
  $("#assignGo")?.addEventListener("click", () =>
    doAssign([...checked], $("#assignTarget").value, $("#assignMk").checked, null, $("#assignWho2")?.value));
  $("#assignOneGo")?.addEventListener("click", () =>
    doAssign([state.mailSel], $("#assignOne").value, true, null, $("#assignWho1")?.value));
  $("#assignOneNext")?.addEventListener("click", () =>
    doAssign([state.mailSel], $("#assignOne").value, true, nextMailId, $("#assignWho1")?.value)); // 분류하고 다음 + 담당 지정
  $("#mailDetailPrev")?.addEventListener("click", () => { if (prevMailId) { state.mailSel = prevMailId; render(); } });
  $("#mailDetailNext")?.addEventListener("click", () => { if (nextMailId) { state.mailSel = nextMailId; render(); } });
  $("#mailUnassign")?.addEventListener("click", async () => {
    const r = await post("/api/mail/unassign", { mail_id: state.mailSel });
    if (r.ok) { toast(L.mail_unassigned ?? "분류를 취소했습니다(받은함)", "ok"); render(); }
    else toast(L.mail_unassign_fail ?? "분류 취소 실패", "error");
  });
  $("#mailDelete")?.addEventListener("click", async () => {
    if (!(await uiConfirm(L.mail_delete_confirm ?? "이 메일을 삭제할까요? 목록에서 사라집니다(재수집돼도 다시 안 보임)."))) return;
    const r = await post("/api/mail/delete", { mail_id: state.mailSel });
    if (r.ok) { state.mailSel = null; toast(L.mail_deleted ?? "메일을 삭제했습니다", "ok"); render(); }
    else toast(L.mail_delete_fail ?? "메일 삭제 실패", "error");
  });
  $("#mailSpam")?.addEventListener("click", async () => {
    const cp = String(sel.counterpart || "").trim();
    const m = cp.match(/[\w.+-]+@[\w-]+\.[\w.-]+/); // 발신 주소 추출(있으면) — 없으면 이 메일만 숨김으로 폴백
    const senderPat = m ? m[0] : "";
    const isAdmin = !!state.account?.is_admin;
    const choice = await spamChoice({ sender: senderPat || cp || "(발신자 불명)", isAdmin: isAdmin && !!senderPat });
    if (!choice) return;
    if (choice === "sender") {
      // 관리자만: 발신자 제외 규칙 추가 + 기존 메일 소급 숨김(엔진 인입 단계에서도 앞으로 차단).
      const r = await post("/api/mail/exclude-rules", { field: "from", pattern: senderPat, match: "contains" });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { state.mailSel = null; toast(`${L.mail_spam_blocked ?? "발신자 차단"}${d.hidden ? ` · ${d.hidden}${L.mrule_hidden_unit ?? "건 숨김"}` : ""}`, "ok"); render(); }
      else toast((L.mail_spam_fail ?? "차단 실패") + (d.error ? ` (${d.error})` : ""), "error");
      return;
    }
    // 'one' — 이 메일만 숨김(누구나 가능, /api/mail/delete = soft-hide)
    const r = await post("/api/mail/delete", { mail_id: state.mailSel });
    if (r.ok) { state.mailSel = null; toast(L.mail_spam_hidden ?? "이 메일을 숨겼습니다", "ok"); render(); }
    else toast(L.mail_delete_fail ?? "숨김 실패", "error");
  });
  $("#mailEditBtn")?.addEventListener("click", () => { state.mailEdit = state.mailSel; render(); });
  $("#meCancel")?.addEventListener("click", () => { state.mailEdit = null; render(); });
  $("#meSave")?.addEventListener("click", async () => {
    const subject = $("#meSubject").value.trim();
    if (!subject) { toast(L.mail_edit_need_subject ?? "제목을 입력하세요", "error"); return; }
    const r = await post("/api/mail/update", { mail_id: state.mailSel, subject, counterpart: $("#meFrom").value.trim(), at: $("#meDate").value || undefined });
    if (r.ok) { state.mailEdit = null; toast(L.mail_edited ?? "메일을 수정했습니다", "ok"); render(); }
    else toast(L.mail_edit_fail ?? "메일 수정 실패", "error");
  });
}

function mailPromoteErrorText(error, L = state.lex) {
  if (error === "mail_project_missing") return L.promote_need_project ?? "먼저 메일을 과제로 분류하세요";
  if (error === "already_promoted") return L.promote_already ?? "이미 할 일로 등록된 메일입니다";
  if (error === "mail_forbidden") return "이 메일을 할 일로 만들 권한이 없습니다";
  if (error === "login_required") return "다시 로그인한 뒤 시도하세요";
  if (error === "network_error") return "서버 연결 오류입니다";
  return error || "할 일 승격 실패";
}

async function promoteMailToItem(mailId, { button = null, messageEl = null } = {}) {
  const L = state.lex;
  const oldText = button?.textContent || L.promote_item || "할일로 승격";
  if (button) {
    button.disabled = true;
    button.textContent = "승격 중...";
  }
  if (messageEl) {
    messageEl.textContent = "";
    messageEl.className = "mail-promote-msg";
  }
  let resp = null;
  let body = {};
  try {
    resp = await post("/api/items/promote", { mail_id: mailId });
    body = await resp.json().catch(() => ({}));
  } catch {
    body = { error: "network_error" };
  }
  const ok = !!(resp?.ok && (body.ok || body.item));
  const already = body.error === "already_promoted";
  if (ok || already) {
    (state._promotedMails ??= new Set()).add(mailId);
    if (messageEl) {
      messageEl.textContent = already ? (L.promote_already ?? "이미 할 일로 등록됨") : "할 일 등록됨";
      messageEl.classList.add("ok");
    }
    return { ok: true, already, body };
  }
  const message = mailPromoteErrorText(body.error, L);
  if (messageEl) {
    messageEl.textContent = message;
    messageEl.classList.add("error");
  } else {
    alert(message);
  }
  if (button) {
    button.disabled = false;
    button.textContent = oldText;
  }
  return { ok: false, error: body.error || "promote_failed", body };
}

// 전체 감사로그(event_log 원천) — 과제·종류·행위자·기간 필터 + 조회잡음 토글. 가공된 '이력 탭'과 달리 전부 표시.
async function renderAuditLog() {
  const L = state.lex;
  $("#viewTitle").textContent = L.nav_audit ?? "전체 이력(감사로그)";
  logView(state.view);
  const f = (state.audit ??= { kind: "", actor: "", project: "", days: "30", noise: false });
  if (!state._projCache) { try { state._projCache = (await api("/api/summary")).projects; } catch { state._projCache = []; } }
  const since = f.days ? new Date(Date.now() - Number(f.days) * 86400000).toISOString().slice(0, 10) : null;
  const q = new URLSearchParams();
  if (f.project) q.set("project", f.project);
  if (f.kind) q.set("kind", f.kind);
  if (f.actor) q.set("actor", f.actor);
  if (since) q.set("since", since);
  q.set("limit", "300");
  q.set("noise", f.noise ? "1" : "0"); // noise=0 → 서버가 잡음 제외(limit 이 의미 이벤트에만 걸림). 1 → 전체 포함.
  const data = await api(`/api/events/audit?${q}`);
  const events = f.noise ? data.events : data.events.filter((e) => !EVENT_HIDE.has(e.kind));
  const projOpts = (state._projCache ?? []).map((p) => `<option value="${esc(p.id)}" ${f.project === p.id ? "selected" : ""}>${esc(p.id)}</option>`).join("");
  const kindOpts = data.facets.kinds.map((k) => `<option value="${esc(k)}" ${f.kind === k ? "selected" : ""}>${esc(k)}</option>`).join("");
  const dayOpt = (v, lab) => `<option value="${v}" ${f.days === v ? "selected" : ""}>${lab}</option>`;
  const rows = events.map((e) => `<tr>
      <td class="dim num">${localTime(e.at)}</td>
      <td><span class="badge mini">${esc(eventKindLabel(e.kind))}</span></td>
      <td>${esc(eventDesc(e, L))}${e.bottleneck_reason ? ` · ${esc(e.bottleneck_reason)}` : ""}</td>
      <td class="dim">${esc(e.actor_ref)}</td>
      <td class="dim">${esc(e.project_ref ?? "")}</td>
    </tr>`).join("");
  $("#view").innerHTML = `
    <div class="filters">
      <select id="alProject"><option value="">${L.project}: ${L.all_label}</option>${projOpts}</select>
      <select id="alKind"><option value="">${L.al_kind ?? "종류"}: ${L.all_label}</option>${kindOpts}</select>
      <input id="alActor" placeholder="${L.al_actor ?? "행위자"}" size="8" value="${esc(f.actor)}" />
      <select id="alDays">${dayOpt("7", L.al_d7 ?? "최근 7일")}${dayOpt("30", L.al_d30 ?? "최근 30일")}${dayOpt("90", L.al_d90 ?? "최근 90일")}${dayOpt("", L.al_all ?? "전체 기간")}</select>
      <label class="al-noise"><input type="checkbox" id="alNoise" ${f.noise ? "checked" : ""}/> ${L.al_noise ?? "조회·잡음 포함"}</label>
    </div>
    ${events.length
      ? `<table class="evt-table"><thead><tr><th>${L.th_time ?? "시각"}</th><th>${L.al_kind ?? "종류"}</th><th>${L.al_desc ?? "설명"}</th><th>${L.al_actor ?? "행위자"}</th><th>${L.project}</th></tr></thead><tbody>${rows}</tbody></table>${data.events.length >= 300 ? `<div class="dim small">${L.al_more ?? "최근 300건만 — 필터로 좁혀보세요"}</div>` : ""}`
      : `<div class="empty">${L.evt_empty ?? "이벤트 없음"}</div>`}`;
  $("#alProject").addEventListener("change", (e) => { f.project = e.target.value; render(); });
  $("#alKind").addEventListener("change", (e) => { f.kind = e.target.value; render(); });
  $("#alActor").addEventListener("keydown", (e) => { if (e.key === "Enter") { f.actor = e.target.value.trim(); render(); } });
  $("#alDays").addEventListener("change", (e) => { f.days = e.target.value; render(); });
  $("#alNoise").addEventListener("change", (e) => { f.noise = e.target.checked; render(); });
}

async function renderArtifacts() {
  const q = new URLSearchParams();
  if (state.projectFilter) q.set("project", state.projectFilter);
  const arts = await api(`/api/artifacts?${q}`);
  const L = state.lex;
  const rows = arts.map((a) => `<tr>
      <td>${esc(a.title)}</td><td>${esc(a.kind)}</td><td>${esc(a.project_id)}</td>
      <td>${a.updated_at ?? "-"}</td>
      <td class="pointer">${esc(a.pointer)} <button class="copy-btn" data-c="${esc(a.pointer)}">${L.copy}</button></td>
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
  const items = data.items.map((i) => `<tr><td>${esc(i.title)}${itemSourceTrace(i)}</td><td>${esc(i.project_id)}</td><td>${statusBadge(i.status)}</td><td>${i.due ?? "-"}</td></tr>`).join("");
  const mail = data.mail.map((m) => `<tr><td>${m.at.slice(0, 10)}</td><td>${esc(m.subject)}${m.source_ref || m.pointer_ref ? `<div class="cc-hint">${esc(m.source_ref || m.pointer_ref)}</div>` : ""}</td><td>${esc(m.counterpart ?? "-")}</td></tr>`).join("");
  const arts = data.artifacts.map((a) => `<tr><td>${esc(a.title)}</td><td>${esc(a.kind)}</td><td class="pointer">${esc(a.pointer)}</td></tr>`).join("");
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
      <button id="openRecipe" class="fav-chip">${L.recipe_open}</button>
    </div>
    ${g.html}`;

  $("#gProject").addEventListener("change", (e) => { state.guideProject = e.target.value; render(); });
  $("#openRecipe")?.addEventListener("click", () => { state.view = "mod:recipe"; render(); });
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
  let tab = state.hubTab ?? "overview";
  if (!PROJ_FACETS.some((f) => f.key === tab)) tab = "overview"; // 구 탭키(guide/mail) 호환
  const yr = p.start_year ? ` · ${p.start_year}${L.proj_year_suffix ?? "년 시작"}` : "";
  $("#view").innerHTML = `
    <div class="hub-tabs">
      <button id="hubBack" class="fav-chip">${L.back_home}</button>
      ${PROJ_FACETS.map((f) => `<button class="hub-tab ${tab === f.key ? "on" : ""}" data-tab="${f.key}">${navTL(f)}</button>`).join("")}
      <span class="badge">${L[`class_${p.class}`] ?? esc(p.class)}</span><span class="badge dim">${esc(p.id)}${yr}</span>
      ${p.class !== "inbox" ? `<button id="hubEdit" class="fav-chip mini">${L.proj_edit ?? "수정"}</button>
      <button id="hubArchive" class="fav-chip mini">${p.class === "archive" ? (L.proj_unarchive ?? "복원") : (L.proj_archive ?? "보관")}</button>` : ""}
    </div>
    <div id="hubBody"></div>`;
  $("#hubBack").addEventListener("click", () => { state.view = "home"; render(); });
  $("#view").querySelectorAll(".hub-tab").forEach((b) =>
    b.addEventListener("click", () => { state.hubTab = b.dataset.tab; render(); })
  );
  $("#hubEdit")?.addEventListener("click", async () => {
    const nt = prompt(L.proj_edit_title_ph ?? "과제명 수정", p.title || "");
    if (nt === null) return;
    if (!nt.trim()) { toast(L.proj_edit_need_title ?? "과제명을 입력하세요", "error"); return; }
    const r = await post("/api/projects/update", { id: p.id, title: nt.trim() });
    if (r.ok) { state._projCache = null; toast(L.proj_edited ?? "과제 수정됨", "ok"); render(); }
    else { const d = await r.json().catch(() => ({})); toast(d.error === "admin_only" ? (L.proj_new_admin ?? "관리자만 가능") : (L.proj_edit_fail ?? "과제 수정 실패"), "error"); }
  });
  $("#hubArchive")?.addEventListener("click", async () => {
    const toArchive = p.class !== "archive";
    if (toArchive && !(await uiConfirm(L.proj_archive_confirm ?? "이 과제를 보관할까요? 목록에서 숨겨집니다(메일·할일 보존, 복원 가능)."))) return;
    const r = await post("/api/projects/archive", { id: p.id, archived: toArchive });
    if (r.ok) { state._projCache = null; toast(toArchive ? (L.proj_archived ?? "보관됨") : (L.proj_unarchived ?? "복원됨"), "ok"); if (toArchive) state.view = "home"; render(); }
    else { const d = await r.json().catch(() => ({})); toast(d.error === "cannot_archive_inbox" ? (L.proj_archive_inbox ?? "받은함은 보관 불가") : d.error === "admin_only" ? (L.proj_new_admin ?? "관리자만 가능") : (L.proj_archive_fail ?? "보관 실패"), "error"); }
  });
  const mount = $("#hubBody");
  if (tab === "trunk") return hubTrunk(mount, p);
  if (tab === "contacts") return hubContacts(mount, p);
  if (tab === "schedule") return hubSchedule(mount, p);
  if (tab === "gates") return hubGates(mount, p);
  if (tab === "items") return hubItems(mount, p);
  if (tab === "mail") return hubMail(mount, p);
  if (tab === "requirements") return hubRequirements(mount, p);
  if (tab === "artifacts") return hubGuide(mount, p);
  if (tab === "meetings") return hubMeetings(mount, p);
  if (tab === "bom") return hubBom(mount, p);
  if (tab === "risk") return hubRisk(mount, p);
  if (tab === "history") return hubHistory(mount, p);
  return hubOverview(mount, p);
}

// --- 과제 facet 렌더러(프로젝트 필터 실 API). 컴팩트 테이블 — 편집은 전역 모듈에서. ---
async function hubItems(mount, p) {
  const L = state.lex, todayKey = new Date().toISOString().slice(0, 10);
  // 과제 맥락 뷰: 정식 할 일은 단계·연결대상·완료기준까지, 미분류는 카운트만(분류는 전역에서).
  const [items, triage] = await Promise.all([
    api(`/api/items?project=${encodeURIComponent(p.id)}`),
    api(`/api/items?project=${encodeURIComponent(p.id)}&status=unclassified`)
  ]);
  const note = triage.length
    ? `<div class="triage-note">${L.hub_triage_pre ?? "이 과제에 분류 필요 할 일"} ${triage.length}${L.hub_triage_post ?? "건 — 업무 관리 › 내 할 일 › 분류 필요에서 처리"}</div>`
    : "";
  mount.innerHTML = note + (items.length
    ? `<table><thead><tr><th>${L.col_title ?? "할 일"}</th><th>${L.col_stage ?? "단계"}</th><th>${L.col_link ?? "유형·연결"}</th><th>${L.col_status ?? "상태"}</th><th>${L.col_due ?? "마감"}</th><th>${L.col_assignee ?? "담당"}</th></tr></thead><tbody>${items.map((i) => `<tr>
        <td>${esc(i.title)}${i.completion_criteria ? `<div class="cc-hint">✓ ${esc(i.completion_criteria)}</div>` : ""}${itemAutomationHints(i)}</td>
        <td class="dim">${esc(i.anchor_stage_code ?? i.guide_stage_code ?? "-")}</td>
        <td>${itemLinkCell(i)}</td>
        <td>${statusBadge(i.status)}</td>${dueCell(i.due, todayKey)}<td class="dim">${esc(i.assignee_ref ?? "-")}</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty">${L.empty_items ?? "할 일 없음"}</div>`);
}
async function hubContacts(mount, p) {
  const L = state.lex;
  const cs = await api(`/api/contacts?project=${encodeURIComponent(p.id)}`);
  mount.innerHTML = cs.length
    ? `<table><thead><tr><th>${L.ct_name ?? "이름"}</th><th>${L.ct_org ?? "소속"}</th><th>${L.ct_role ?? "역할"}</th><th>${L.ct_email ?? "메일"}</th></tr></thead><tbody>${cs.map((c) => `<tr>
        <td>${esc(c.name)}</td><td class="dim">${esc(c.org ?? c.party_name ?? "-")}</td><td class="dim">${esc(c.role ?? "-")}</td><td class="dim">${esc(c.email ?? "-")}</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty">${L.hub_no_contacts ?? "연결된 연락처 없음"}</div>`;
}
async function hubGates(mount, p) {
  const L = state.lex;
  const r = await api(`/api/gates?project=${encodeURIComponent(p.id)}`);
  const stages = r.stages ?? [];
  mount.innerHTML = stages.length
    ? `<table><thead><tr><th>${L.col_stage ?? "단계"}</th><th>${L.col_status ?? "상태"}</th><th>${L.gate_reason ?? "사유"}</th></tr></thead><tbody>${stages.map((s) => `<tr>
        <td>${esc(s.stage_code ?? s.title)}</td><td>${s.status === "cleared" ? `<span class="badge green">✓</span>` : (s.blocked ? `<span class="status-chip s-risk">${L.gate_blocked ?? "차단"}</span>` : statusBadge(s.status))}</td>
        <td class="dim">${esc((s.reasons ?? []).join(", ") || "-")}</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty">${L.hub_no_gates ?? "단계 없음"}</div>`;
}
async function hubMeetings(mount, p) {
  const L = state.lex;
  const ms = await api(`/api/meetings?project=${encodeURIComponent(p.id)}`);
  mount.innerHTML = ms.length
    ? `<table><thead><tr><th>${L.col_title ?? "회의"}</th><th>${L.col_date ?? "일자"}</th><th>${L.mt_actions ?? "액션"}</th></tr></thead><tbody>${ms.map((m) => `<tr>
        <td>${esc(m.title)}</td><td class="dim">${esc(m.date ?? m.created_at ?? "-")}</td><td class="dim num">${m.action_count ?? 0}</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty">${L.hub_no_meetings ?? "회의 없음"}</div>`;
}
async function hubBom(mount, p) {
  const L = state.lex;
  const [parts, pos] = await Promise.all([
    api(`/api/parts?project=${encodeURIComponent(p.id)}`),
    api(`/api/purchases?project=${encodeURIComponent(p.id)}`)
  ]);
  const partRows = parts.length ? `<h3 class="hub-h3">${L.bom_parts ?? "부품·BOM"}</h3><table><thead><tr><th>${L.col_part ?? "부품"}</th><th>${L.col_type ?? "유형"}</th><th>${L.col_onhand ?? "재고"}</th></tr></thead><tbody>${parts.map((x) => `<tr><td>${esc(x.name ?? x.id)}</td><td class="dim">${esc(x.type ?? "-")}</td><td class="dim num">${x.on_hand ?? "-"}</td></tr>`).join("")}</tbody></table>` : "";
  const poRows = pos.length ? `<h3 class="hub-h3">${L.bom_purchase ?? "구매·발주"}</h3><table><thead><tr><th>${L.col_item ?? "품목"}</th><th>${L.col_stage ?? "단계"}</th><th>${L.col_due ?? "납기"}</th></tr></thead><tbody>${pos.map((x) => `<tr><td>${esc(x.title)}</td><td class="dim">${esc(x.stage ?? "-")}</td><td class="dim">${esc(x.due ?? "-")}</td></tr>`).join("")}</tbody></table>` : "";
  mount.innerHTML = (partRows + poRows) || `<div class="empty">${L.hub_no_bom ?? "자재·BOM 없음"}</div>`;
}
async function hubRisk(mount, p) {
  const L = state.lex;
  const risks = await api(`/api/risk?project=${encodeURIComponent(p.id)}`);
  mount.innerHTML = risks.length
    ? `<table><thead><tr><th>${L.col_title ?? "항목"}</th><th>${L.risk_score ?? "위험도"}</th><th>${L.col_due ?? "마감"}</th></tr></thead><tbody>${risks.map((r) => `<tr>
        <td>${esc(r.item_title ?? "-")}</td><td><span class="status-chip s-${r.severity === "watch" ? "watch" : "risk"}">${esc(L[`risk_sev_${r.severity}`] ?? r.severity ?? "-")}</span></td><td class="dim">${esc(r.due ?? "-")}${Number.isFinite(r.days_left) ? ` <span class="dim">(${r.days_left >= 0 ? `D-${r.days_left}` : (L.risk_overdue ?? "지남")})</span>` : ""}</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty">${L.hub_no_risk ?? "위험 항목 없음"}</div>`;
}
async function hubRequirements(mount, p) {
  const L = state.lex;
  const f = await api(`/api/inputs/fulfillment?project=${encodeURIComponent(p.id)}`);
  mount.innerHTML = (f ?? []).length
    ? `<p class="hub-note">${L.req_note ?? "산출물별 필수 입력(요구사항) 충족 현황."}</p><table><thead><tr><th>${L.req_scope ?? "산출물"}</th><th>${L.req_need ?? "필요"}</th><th>${L.req_have ?? "충족"}</th><th></th></tr></thead><tbody>${f.map((d) => `<tr>
        <td>${esc(d.scope_key)}</td><td class="dim num">${(d.required ?? []).length}</td><td class="dim num">${(d.satisfied ?? []).length}</td><td>${d.fulfilled ? `<span class="badge green">✓</span>` : `<span class="status-chip s-watch">${L.req_partial ?? "미충족"}</span>`}</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty">${L.hub_no_req ?? "요구사항(입력 규칙) 없음"}</div>`;
}

async function hubOverview(mount, p) {
  const L = state.lex;
  const todayKey = new Date().toISOString().slice(0, 10);
  // 과제 안에서 '불러온 장부'가 한눈에 보이게: 메일·산출물·분류필요 KPI(ERP=장부 통합 가시화).
  const [items, mail, delivs, triage] = await Promise.all([
    api(`/api/items?project=${encodeURIComponent(p.id)}`),
    api(`/api/mail?project=${encodeURIComponent(p.id)}&days=3650`),
    api(`/api/deliverables?project=${encodeURIComponent(p.id)}`),
    api(`/api/items?project=${encodeURIComponent(p.id)}&status=unclassified`)
  ]);
  const openCnt = items.filter((i) => i.status !== "done").length;
  const spawn = state.spawnItems ?? new Set();
  const rows = items.map((i) => `<tr class="${spawn.has(i.id) ? "spawned" : ""}">
      <td>${esc(i.title)}${itemAutomationHints(i)}</td>
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
      <div class="kpi ledger"><span>${L.kpi_mail ?? "메일"}</span><strong>${mail.length}</strong></div>
      <div class="kpi ledger"><span>${L.deliv_name}</span><strong>${delivs.length}</strong></div>
      ${triage.length ? `<div class="kpi amber"><span>${L.status_unclassified}</span><strong>${triage.length}</strong></div>` : ""}
    </div>
    <div class="item-form">
      <input id="niTitle" placeholder="${L.item_new_ph}" />
      <input id="niAssignee" placeholder="${L.assignee_ph}" size="9" value="${esc(state.account?.display_name || state.account?.username || "")}" />
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

// 산출물 레지스터(ingest된 core_deliverable)를 게이트별로 묶어 표로 렌더. 읽기 위주(검토 진행 버튼은 슬라이스 C).
function deliverableStateLabel(d, L) {
  if (d.review_stage >= 4) return { txt: L.deliv_state_done, cls: "green" };
  if (d.review_stage === 3) return { txt: L.deliv_rv_team, cls: "" };
  if (d.review_stage === 2) return { txt: L.deliv_rv_self, cls: "" };
  if (d.produced || d.review_stage >= 1) return { txt: L.deliv_state_produced, cls: "" };
  return { txt: L.deliv_state_todo, cls: "dim" };
}
// 완료게이트 진행 컨트롤: 작성됨(1)→본인검토(2)→팀검토(3)→리드완료(4). 파일(03_Out) 없으면 검토 불가.
function reviewControlHtml(d, L) {
  const s = d.review_stage;
  if (!d.produced && s < 1) return ""; // 미작성은 검토 진행 버튼 없음(파일 먼저)
  const NEXT = { 1: L.deliv_rv_to_self, 2: L.deliv_rv_to_team, 3: L.deliv_rv_to_lead };
  const fwd = s < 4
    ? `<button class="fav-chip mini dr-adv" data-id="${esc(d.id)}" data-to="${s + 1}">▷ ${NEXT[s] ?? ""}</button>`
    : "";
  const back = s >= 2 ? `<button class="fav-chip mini ghost dr-adv" data-id="${esc(d.id)}" data-to="${s - 1}" title="${L.deliv_rv_back}">◁</button>` : "";
  return `<div class="deliv-review">${fwd}${back}<span class="dr-msg dim mini"></span></div>`;
}
function deliverableRegisterHtml(rows, L) {
  if (!rows.length) return `<div class="empty small">${L.deliv_empty}</div>`;
  const byGate = new Map();
  for (const d of rows) { const g = d.stage_code || "(미지정)"; if (!byGate.has(g)) byGate.set(g, []); byGate.get(g).push(d); }
  const gates = [...byGate.keys()].sort();
  const submitTL = (t) => t === "final" ? L.deliv_submit_final : t === "draft" ? L.deliv_submit_draft : "-";
  return gates.map((g) => {
    const list = byGate.get(g);
    const done = list.filter((d) => d.produced).length;
    const body = list.map((d) => {
      const st = deliverableStateLabel(d, L);
      const srcL = d.due_source === "owner" ? L.deliv_due_owner : d.due_source === "auto" ? L.deliv_due_auto : L.deliv_due_ingest;
      const spawnCell = d.task_id
        ? `<span class="badge green mini">✓ ${L.item}</span>`
        : `<button class="fav-chip mini ds-spawn" data-id="${esc(d.id)}" title="${L.deliv_spawn_hint ?? ""}">${L.deliv_spawn_task ?? "할 일로"}</button>`;
      const inN = d.input_count ?? 0, inR = d.input_received ?? 0;
      const inputBtn = `<button class="fav-chip mini di-open" data-id="${esc(d.id)}" data-name="${esc(d.name)}" title="${esc(L.di_hint ?? "")}">${L.di_open ?? "입력"} ${inR}/${inN}</button>`;
      return `<tr>
        <td>${esc(d.name)} ${spawnCell} ${inputBtn}<span class="ds-msg dim mini"></span></td>
        <td class="dim">${submitTL(d.submit_type)}</td>
        <td><span class="badge ${st.cls}">${st.txt}</span>${reviewControlHtml(d, L)}</td>
        <td class="deliv-due">
          <input type="date" class="dd-date" value="${esc(d.due ?? "")}" />
          <button class="fav-chip mini dd-save" data-id="${esc(d.id)}">${L.deliv_due_save}</button>
          <span class="badge dim mini">${srcL}</span><span class="dd-msg dim mini"></span></td>
        <td class="pointer">${d.out_pointer ? `<span class="ptr-text">${esc(d.out_pointer)}</span><button class="copy-btn mini" data-c="${esc(d.out_pointer)}">${L.copy}</button>` : "-"}</td>
      </tr>`;
    }).join("");
    return `<div class="deliv-gate"><div class="deliv-gate-h"><b>${esc(g)}</b> <span class="badge dim">${done}/${list.length}</span></div>
      <table><thead><tr><th>${L.deliv_name}</th><th>${L.deliv_submit}</th><th>${L.deliv_state}</th><th>${L.deliv_due}</th><th>${L.deliv_pointer}</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }).join("");
}

async function hubGuide(mount, p) {
  const L = state.lex;
  const [g, delivs] = await Promise.all([
    buildGuideSection(p.id),
    api(`/api/deliverables?project=${encodeURIComponent(p.id)}`)
  ]);
  const gateList = [...new Set(delivs.map((d) => d.stage_code).filter(Boolean))].sort();
  // 산출물 추가: 고정 단계 밖 중간번호(31·32…) 등 실제 산출물을 owner 가 직접 등록.
  const addForm = `<div class="deliv-add filters">
    <input id="ndStage" list="ndGates" size="7" placeholder="${L.deliv_stage}" />
    <datalist id="ndGates">${gateList.map((g) => `<option value="${esc(g)}"></option>`).join("")}</datalist>
    <input id="ndNo" size="4" placeholder="${L.deliv_no}" />
    <input id="ndName" size="16" placeholder="${L.deliv_name}" />
    <input id="ndCrit" size="16" placeholder="${L.deliv_criteria}" />
    <input id="ndDue" type="date" />
    <button id="ndAdd" class="fav-chip">${L.deliv_add}</button>
    <span id="ndMsg" class="dim mini"></span>
  </div>`;
  mount.innerHTML = `
    <div class="filters"><span class="badge">${L.deliv_section} ${delivs.length}</span></div>
    ${addForm}
    ${delivs.length ? `<p class="hub-note">${L.deliv_due_note}</p>` : ""}
    ${deliverableRegisterHtml(delivs, L)}
    <div class="filters"><span class="dim guide-principle">${L.guide_principle}</span>
      ${g.totalSteps ? `<span class="badge">${L.guide_progress} ${g.totalDone}/${g.totalSteps}</span>` : ""}</div>
    ${g.html}`;
  mount.querySelectorAll(".copy-btn").forEach((b) =>
    b.addEventListener("click", () => navigator.clipboard?.writeText(b.dataset.c))
  );
  // 산출물 추가(중간번호 등): owner 직접 등록 → core_deliverable. 같은 게이트·번호면 거부.
  mount.querySelector("#ndAdd")?.addEventListener("click", async () => {
    const v = (s) => mount.querySelector(s).value.trim();
    const msg = mount.querySelector("#ndMsg");
    const name = v("#ndName");
    if (!name) { msg.textContent = L.deliv_name; return; }
    const body = { project_id: p.id, stage_code: v("#ndStage"), deliverable_no: v("#ndNo"), name,
      completion_criteria: v("#ndCrit"), due: v("#ndDue") };
    const resp = await post("/api/deliverables", body);
    if (resp.ok) { msg.textContent = L.deliv_add_done; setTimeout(render, 350); }
    else { const e = await resp.json().catch(() => ({})); msg.textContent = e.error === "deliverable_exists" ? L.deliv_exists : (e.error ?? "오류"); }
  });
  // 일정(due) owner 직접 지정. '언제'는 RAG/스캔에 없어 사람이 바꾼다(나중에 Codex 자동 분석).
  mount.querySelectorAll(".dd-save").forEach((b) =>
    b.addEventListener("click", async () => {
      const cell = b.closest(".deliv-due");
      const inp = cell.querySelector(".dd-date");
      const msg = cell.querySelector(".dd-msg");
      const resp = await post("/api/deliverables/due", { id: b.dataset.id, due: inp.value });
      if (resp.ok) { msg.textContent = L.deliv_due_saved; setTimeout(render, 500); }
      else { const e = await resp.json().catch(() => ({})); msg.textContent = e.error ?? "오류"; }
    })
  );
  // 일정→할일: 산출물 → 작성 할일 생성(SE앵커·마감 상속). 중복이면 안내.
  mount.querySelectorAll(".ds-spawn").forEach((b) =>
    b.addEventListener("click", async () => {
      const msg = b.parentElement?.querySelector(".ds-msg");
      const resp = await post("/api/deliverables/spawn-task", { id: b.dataset.id });
      if (resp.ok) { setTimeout(render, 300); }
      else if (msg) { const e = await resp.json().catch(() => ({})); msg.textContent = e.error === "already_spawned" ? (L.deliv_already_task ?? "이미 할일 있음") : (e.error ?? "오류"); }
    })
  );
  // 산출물 입력파일 패널 열기(종류별 In 하위폴더·필요/수집 상태·포인터 등록)
  mount.querySelectorAll(".di-open").forEach((b) =>
    b.addEventListener("click", () => openDeliverableInputs(b.dataset.id, b.dataset.name))
  );
  // 완료게이트 진행/되돌리기
  mount.querySelectorAll(".dr-adv").forEach((b) =>
    b.addEventListener("click", async () => {
      const msg = b.closest(".deliv-review")?.querySelector(".dr-msg");
      const resp = await post("/api/deliverables/review", { id: b.dataset.id, stage: Number(b.dataset.to) });
      if (resp.ok) { setTimeout(render, 300); }
      else if (msg) { const e = await resp.json().catch(() => ({})); msg.textContent = e.error === "needs_produced" ? L.deliv_rv_need_file : (e.error ?? "오류"); }
    })
  );
  wireGuideSection(mount, p.id);
}

async function hubMail(mount, p) {
  const L = state.lex;
  const [mail, promotedRes] = await Promise.all([
    api(`/api/mail?project=${encodeURIComponent(p.id)}&days=3650`), // 과제 장부 전체(연단위) — 1년 컷 금지
    api(`/api/mail/promoted?project=${encodeURIComponent(p.id)}`) // 승격 진실원(격리·스코프 무관)
  ]);
  const promoted = new Set(promotedRes?.ids ?? []);
  for (const id of state._promotedMails ?? []) promoted.add(id);
  const rows = mail.map((m) => `<tr class="mail-row">
      <td class="mail-time">${localTime(m.at)}</td>
      <td class="mail-from">${m.direction === "out" ? "<i>→</i> " : ""}${esc(m.counterpart ?? "-")}</td>
      <td class="mail-subj">${esc(m.subject)}</td>
      <td class="acts">${promoted.has(m.id)
        ? `<span class="badge green">✓ ${L.item}</span>`
        : `<button type="button" class="fav-chip mini" data-promote="${esc(m.id)}">${L.promote_item}</button><span class="mail-promote-msg" data-promote-msg="${esc(m.id)}"></span>`}
        ${m.pointer_ref ? `<button class="copy-btn" data-c="${esc(m.pointer_ref)}">${L.copy}</button>` : ""}</td>
    </tr>`).join("");
  mount.innerHTML = rows
    ? `<table class="mail-table"><tbody>${rows}</tbody></table>`
    : `<div class="empty">${L.empty_mail}</div>`;
  mount.querySelectorAll("[data-promote]").forEach((b) =>
    b.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const mailId = b.dataset.promote;
      const result = await promoteMailToItem(mailId, { button: b, messageEl: mount.querySelector(`[data-promote-msg="${attrSelectorValue(mailId)}"]`) });
      if (result.ok) setTimeout(render, 250);
    })
  );
  mount.querySelectorAll(".copy-btn").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigator.clipboard?.writeText(b.dataset.c);
    })
  );
}

async function hubHistory(mount, p) {
  const L = state.lex;
  // 변경 이력: 조회/잡음(view·llm) 제외, kind 를 사람이 읽는 설명(eventDesc)으로. 누가(actor)·시각 표시.
  const events = (await api(`/api/events/recent?project=${encodeURIComponent(p.id)}&limit=80`)).filter((e) => !EVENT_HIDE.has(e.kind));
  mount.innerHTML = events.length
    ? `<table class="evt-table"><tbody>${events.map((e) => `<tr>
        <td class="dim num">${localTime(e.at)}</td>
        <td>${esc(eventDesc(e, L))}${e.bottleneck_reason ? ` · ${esc(e.bottleneck_reason)}` : ""}</td>
        <td class="dim">${esc(e.actor_ref)}</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty small">${L.evt_empty ?? "변경 이력 없음"}</div>`;
}

// U-1c 과제 허브 '일정' 탭 — 마일스톤(anchor_stage_code)별 산출물 묶음 + 날짜 인라인 변경(setAnchor 1-hop).
async function hubSchedule(mount, p) {
  const L = state.lex;
  const items = await api(`/api/items?project=${encodeURIComponent(p.id)}`);
  const anchored = items.filter((i) => i.anchor_stage_code);
  if (!anchored.length) {
    mount.innerHTML = `<div class="empty">${L.hub_no_schedule} <button class="fav-chip" id="hubGoSched">${L.sched_open}</button></div>`;
    mount.querySelector("#hubGoSched")?.addEventListener("click", () => { state.view = "mod:schedule"; render(); });
    return;
  }
  const groups = {};
  for (const i of anchored) (groups[i.anchor_stage_code] ||= []).push(i);
  mount.innerHTML = Object.entries(groups).map(([code, arr]) => {
    const anchorDate = arr.find((x) => x.anchor_date)?.anchor_date ?? "";
    const rows = arr.map((i) => `<tr>
      <td>${esc(i.title)}</td><td class="dim">${esc(i.due ?? "-")}</td><td class="dim num">${i.offset_days ?? 0}</td>
      <td class="dim">${i.status === "done" ? "✓" : (i.due_overridden ? "✎" : "")}</td></tr>`).join("");
    return `<section class="hub-sched-grp" data-code="${esc(code)}">
      <div class="item-form"><strong>${L.risk_milestone} ${esc(code)}</strong>
        <input type="date" class="hub-anchor-date" value="${esc(anchorDate)}" />
        <button class="fav-chip hub-anchor-apply">${L.hub_anchor_apply}</button>
        <span class="hub-anchor-msg dim"></span></div>
      <table><thead><tr><th>${L.sched_deliverable}</th><th>${L.col_due}</th><th>${L.sched_offset}</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    </section>`;
  }).join("");
  mount.querySelectorAll(".hub-sched-grp").forEach((grp) => {
    grp.querySelector(".hub-anchor-apply").addEventListener("click", async () => {
      const date = grp.querySelector(".hub-anchor-date").value;
      if (!date) return;
      const r = await (await post("/api/schedule/anchor", { project_id: p.id, anchor_stage_code: grp.dataset.code, date })).json();
      if (r.shifted != null) { grp.querySelector(".hub-anchor-msg").textContent = `${r.shifted}${L.sched_shifted}`; setTimeout(render, 600); }
      else grp.querySelector(".hub-anchor-msg").textContent = r.error ?? "";
    });
  });
}

// 회의록(메타 전용 읽기+생성). 자동추출·원문첨부 없음 — 액션아이템은 기존 할일 수동 링크.
// A1/A2 게이트 판정·강제 화면. hard 기본(미충족 차단), soft 전환 가능. 게임코드 0.
async function renderGates() {
  const L = state.lex;
  // SE-UI: 게이트 + 납기위험(P-9) + 제안 큐(P-4 키스톤) 를 한 화면에 표면화.
  const [data, risks, props] = await Promise.all([api("/api/gates"), api("/api/risk"), loadProposalsForCurrentAccount()]);
  const stages = data.stages || [];
  const byProj = {};
  for (const s of stages) (byProj[s.project_id] ||= []).push(s);
  const modeBtns = `<div class="gate-mode">
    <span class="dim">${L.gate_mode_label}:</span>
    <button class="fav-chip ${data.mode === "hard" ? "active" : ""}" data-mode="hard">${L.gate_hard}</button>
    <button class="fav-chip ${data.mode === "soft" ? "active" : ""}" data-mode="soft">${L.gate_soft}</button>
  </div>`;
  // U-1d: required_artifacts_missing 는 빨강 badge 로 강조, 그 외 reason 은 회색 텍스트.
  const reasonChip = (r) => r.code === "required_artifacts_missing"
    ? `<span class="badge red">${L.gate_reason_required_artifacts_missing} ${r.n}</span>`
    : `<span class="dim">${L[`gate_reason_${r.code}`] ?? r.code} ${r.n}</span>`;
  // 보드별 누락 기술자료 폴침(details). at_* 라벨 있으면 재사용, 없으면 타입코드 폴백.
  const missingDetails = (reasons) => {
    const r = reasons.find((x) => x.code === "required_artifacts_missing" && Array.isArray(x.detail) && x.detail.length);
    if (!r) return "";
    return `<details class="gate-missing"><summary>${L.gate_missing_summary} (${r.n})</summary>`
      + r.detail.map((d) => `${esc(d.board)}: ${d.missing.map((t) => state.lex[`at_${t}`] ?? t).join(", ")}`).join("<br>")
      + `</details>`;
  };
  const sec = Object.entries(byProj).map(([pid, ss]) => `<section class="gate-proj"><h3>${esc(pid)}</h3>
    <table><thead><tr><th>${L.stage}</th><th>${L.th_status}</th><th>${L.col_remaining}</th><th>${L.blocked}</th><th>${L.tab_guide}</th><th></th></tr></thead><tbody>
    ${ss.map((s) => `<tr>
      <td><strong>${esc(s.title)}</strong>${s.gate_rule ? `<div class="dim">${esc(s.gate_rule)}</div>` : ""}</td>
      <td>${s.status === "cleared" ? `<span class="badge green">${L.gate_cleared}</span>` : (s.passable ? `<span class="badge">${L.gate_passable}</span>` : `<span class="badge red">${L.gate_held}</span>`)}${state.mode === "fantasy" ? `<div class="boss-hp" title="${L.gate_boss_hp}"><i style="width:${s.status === "cleared" ? 0 : Math.min(100, s.remaining * 8)}%"></i></div><span class="dim boss-hp-n">${s.status === "cleared" ? L.gate_boss_slain : `HP ${s.remaining}`}</span>` : ""}</td>
      <td class="num">${s.open_items}</td>
      <td class="num">${s.blocked_items || '<span class="dim">0</span>'}</td>
      <td>${s.artifacts ? `${s.steps_done}/${s.steps_total}` : '<span class="dim">-</span>'}</td>
      <td>${s.status === "cleared" ? "" : `<button class="fav-chip gate-pass-btn" data-stage="${esc(s.id)}" data-passable="${s.passable}">${L.gate_pass}</button>${s.reasons.length ? `<div class="gate-reasons">${s.reasons.map(reasonChip).join(" ")}</div>${missingDetails(s.reasons)}` : ""}`}</td>
    </tr>`).join("")}
    </tbody></table></section>`).join("");
  // P-9 납기/CDR 위험 — severity 배지(critical/risk=빨강, watch=주황). 빈 목록이면 dim 안내.
  const sevCls = { critical: "red", risk: "red", watch: "amber" };
  const riskSection = risks.length
    ? `<section class="se-risk"><h4>${L.risk_title}</h4>${risks.slice(0, 12).map((r) => `<span class="badge ${sevCls[r.severity] ?? ""}" title="${esc(r.project_title)} · ${L.risk_pct} ${r.pct}%${r.is_milestone ? ` · ${L.risk_milestone}` : ""}">${L[`risk_sev_${r.severity}`] ?? r.severity} · ${esc(r.item_title)} (${r.days_left}${L.risk_days_left})</span>`).join(" ")}</section>`
    : `<section class="se-risk dim">${L.risk_title}: ${L.empty_risk}</section>`;
  // P-4 키스톤 제안 큐 — AI/규칙 제안을 사람이 승인/반려(승인해야만 실제 쓰기).
  const propSection = props.length
    ? `<section class="se-prop"><h4>${L.prop_queue_title} (${props.length})</h4>
        <table><tbody>${props.map((p) => `<tr data-prop="${esc(p.id)}">
          <td><span class="badge">${esc(p.kind)}</span></td>
          <td>${esc(p.summary ?? p.payload?.title ?? p.id)}</td>
          <td class="dim">${esc(p.source)}</td>
          <td><button class="fav-chip prop-approve">${L.prop_approve}</button> <button class="fav-chip prop-reject">${L.prop_reject}</button> <span class="prop-msg dim"></span></td>
        </tr>`).join("")}</tbody></table></section>`
    : `<section class="se-prop dim">${L.prop_queue_title}: ${L.prop_empty}</section>`;
  $("#view").innerHTML = `<div class="gate-head"><button id="openSched" class="fav-chip">${L.sched_open}</button><button id="openEmbeds" class="fav-chip">${L.embed_open}</button><button id="runRec" class="fav-chip">${L.rec_run}</button></div>${riskSection}${propSection}${modeBtns}${stages.length ? sec : `<div class="empty">${L.empty_gates}</div>`}`;
  $("#openSched").addEventListener("click", () => { state.view = "mod:schedule"; render(); });
  $("#openEmbeds").addEventListener("click", () => { state.view = "mod:embeds"; render(); });
  // P-19: 추천 스캔(수동 트리거) → 결정적 규칙이 갭을 제안 큐에 적재(자동 적용 0). 결과는 위 제안 큐에 표시.
  $("#runRec").addEventListener("click", async () => { await post("/api/recommenders/run", { scope: "all" }); render(); });
  $("#view").querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", async () => {
    const r = await post("/api/settings/gate_mode", { mode: b.dataset.mode });
    if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error === "admin_only" ? (L.gate_admin_only ?? "게이트 모드는 관리자만 변경할 수 있습니다") : (e.error || "변경 실패")); }
    render();
  }));
  $("#view").querySelectorAll(".gate-pass-btn").forEach((b) => b.addEventListener("click", async () => {
    const r = await post("/api/gates/clear", { stage_id: b.dataset.stage });
    let res; try { res = await r.json(); } catch { res = {}; }
    if (res.error === "gate_blocked") {
      if (await uiConfirm(L.gate_force_confirm)) {
        const reason = window.prompt(L.gate_force_reason ?? "강제 통과 사유를 입력하세요 (기록에 남습니다)", "");
        if (reason === null) return;
        const fr = await post("/api/gates/clear", { stage_id: b.dataset.stage, force: true, reason: reason.trim() });
        if (!fr.ok) { const e = await fr.json().catch(() => ({})); alert(e.error === "admin_only" ? (L.gate_admin_only ?? "강제 통과는 관리자만 가능합니다") : (e.error || "실패")); }
        render();
      }
    } else { render(); }
  }));
  // P-4 키스톤: 제안 승인(→화이트리스트 도메인 쓰기)·반려. 승인 실패 시 사유만 표시.
  $("#view").querySelectorAll("[data-prop]").forEach((tr) => {
    const id = tr.dataset.prop;
    tr.querySelector(".prop-approve").addEventListener("click", async () => {
      const res = await (await post("/api/proposals/approve", { id })).json();
      if (res.ok) render(); else tr.querySelector(".prop-msg").textContent = `✗ ${res.error ?? ""}`;
    });
    tr.querySelector(".prop-reject").addEventListener("click", async () => {
      await post("/api/proposals/reject", { id, reason: "" });
      render();
    });
  });
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
  // P-14 입력 충족 — 선택 과제의 deliverable_input 충족 시 '초안 생성'(→제안 큐, 자동 생성 0).
  const fulfillment = state.schedProject ? await api(`/api/inputs/fulfillment?project=${encodeURIComponent(state.schedProject)}`) : [];
  const inputSection = fulfillment.length
    ? `<section class="sched-inputs"><h3>${L.input_generate_btn}</h3>
        <table><thead><tr><th>${L.sched_deliverable}</th><th>${L.risk_pct}</th><th></th></tr></thead><tbody>
        ${fulfillment.map((d) => `<tr data-deliv="${esc(d.deliverable_name)}">
          <td>${esc(d.deliverable_name)}</td>
          <td>${d.satisfied.length}/${d.required.length}${d.missing.length ? ` <span class="dim">(${d.missing.map((m) => state.lex[`at_${m.artifact_type}`] ?? m.artifact_type).join(", ")})</span>` : ""}</td>
          <td>${d.fulfilled ? `<button class="fav-chip input-gen">${L.input_generate_btn}</button>` : `<button class="fav-chip" disabled>${L.input_generate_blocked}</button>`} <span class="input-msg dim"></span></td>
        </tr>`).join("")}</tbody></table></section>`
    : "";
  $("#view").innerHTML = `<div class="sched-head">
      <button id="schedBack" class="fav-chip">${L.sched_back}</button>
      <label>${L.sched_pick_project}</label> <select id="schedProj">${projOpts}</select>
      <span class="sched-ics"><label>${L.cal_export}</label> <select id="icsPerson">${icsPersonOpts}</select>
        <button id="icsDl" class="fav-chip" title="${L.cal_export_hint}">⤓ .ics</button></span>
    </div>
    <div id="schedMsg" class="dim"></div>
    <div class="dim sched-note">${L.sched_timing_note}</div>
    ${anchorInputs ? `<div class="sched-anchors">${anchorInputs}</div>` : ""}
    ${inputSection}
    ${tplCards || `<div class="empty">-</div>`}`;
  $("#schedBack").addEventListener("click", () => { state.view = "mod:gates"; render(); });
  $("#schedProj").addEventListener("change", (e) => { state.schedProject = e.target.value; render(); });
  $("#view").querySelectorAll(".input-gen").forEach((b) => b.addEventListener("click", async () => {
    const tr = b.closest("[data-deliv]");
    const res = await (await post("/api/inputs/generate", { project_id: state.schedProject, deliverable_name: tr.dataset.deliv })).json();
    tr.querySelector(".input-msg").textContent = res.queued ? `✓ ${L.input_pending_keystone}` : (L[`input_generate_blocked`] && res.error === "inputs_incomplete" ? L.input_generate_blocked : (res.error ?? ""));
  }));
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

// B10 캘린더(월간 그리드) — docs/slices/B10-CALENDAR-VIEW.md. 그리드는 서버 /api/calendar 산출(로직 실행-테스트),
// 여기는 렌더+상호작용만. '오늘' 강조는 클라이언트 로컬 날짜(브리핑 localDateKey 관례와 동일 취지 — UTC slice 는 아침에 전날로 밀림).
function calLocalDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
async function renderCalendar() {
  const L = state.lex;
  state.calMonth ??= calLocalDateKey().slice(0, 7);
  state.calScope ??= "mine"; // 기본 = 내 마감(멤버-퍼스트). 팀 전체/계정은 드롭다운(팀원의 타인 선택은 서버가 본인 강등).
  const qs = [`month=${state.calMonth}`];
  if (state.calScope === "mine") qs.push("mine=1");
  else if (state.calScope !== "team") qs.push(`view=${encodeURIComponent(state.calScope)}`);
  if (state.calProject) qs.push(`project=${encodeURIComponent(state.calProject)}`);
  const grid = await api(`/api/calendar?${qs.join("&")}`);
  await ensureScopes(); // 공유 캐시(state._scopes = r.scopes 배열) — 직접 fetch 로 원형 객체를 넣으면 안 됨
  if (!state._projCache) { try { state._projCache = (await api("/api/summary")).projects; } catch { state._projCache = []; } }
  const today = calLocalDateKey();
  const meetById = new Map();
  const scopeOpts = [
    `<option value="mine" ${state.calScope === "mine" ? "selected" : ""}>${L.calv_scope_mine}</option>`,
    `<option value="team" ${state.calScope === "team" ? "selected" : ""}>${L.calv_scope_team}</option>`,
    ...(state._scopes ?? []).filter((s) => s.id !== "team").map((s) => `<option value="${esc(s.id)}" ${state.calScope === s.id ? "selected" : ""}>${esc(s.label)}</option>`),
  ].join("");
  const projOpts = `<option value="">${L.calv_project_all}</option>` + (state._projCache ?? [])
    .filter((p) => p.class !== "archive")
    .map((p) => `<option value="${esc(p.id)}" ${state.calProject === p.id ? "selected" : ""}>${esc(p.id)}</option>`).join("");
  // 강조색은 nudges 순위 관례와 일치: 연체 > 차단 > ⭐긴급 > 오늘.
  const chipCls = (i) => (i.due < today ? "due-over" : i.status === "blocked" ? "cal-blocked" : i.urgency === "high" ? "cal-urgent" : i.due === today ? "cal-due-today" : "");
  const head = String(L.calv_weekdays).split(",").map((w, idx) => `<div class="cal-wd${idx === 0 ? " cal-sun" : ""}">${esc(w)}</div>`).join("");
  const cells = grid.weeks.flat().map((c) => {
    const chips = [
      ...c.meetings.map((m) => {
        meetById.set(m.id, m);
        const hm = /[T ](\d{2}:\d{2})/.exec(String(m.at ?? ""))?.[1];
        return `<div class="cal-chip cal-meet" draggable="true" data-meet="${esc(m.id)}" title="${esc(m.title)}">${hm ? `<span class="cal-time">${hm}</span> ` : ""}${esc(m.title)}</div>`;
      }),
      ...c.items.map((i) => `<div class="cal-chip cal-item ${chipCls(i)}" draggable="true" data-item="${esc(i.id)}" data-proj="${esc(i.project_id ?? "")}" data-title="${esc(i.title)}" title="${esc(i.title)}">${esc(i.title)}</div>`),
    ].join("");
    return `<div class="cal-cell${c.in_month ? "" : " cal-out"}${c.date === today ? " cal-now" : ""}" data-date="${c.date}">
      <div class="cal-daynum">${Number(c.date.slice(8, 10))}</div>${chips}</div>`;
  }).join("");
  $("#view").innerHTML = `<div class="cal-head">
      <button id="calPrev" class="fav-chip">◀</button>
      <strong id="calMonthLabel">${esc(state.calMonth)}</strong>
      <button id="calNext" class="fav-chip">▶</button>
      <button id="calToday" class="fav-chip">${L.calv_today}</button>
      <select id="calScope">${scopeOpts}</select>
      <select id="calProj">${projOpts}</select>
      <span class="dim mini">${L.calv_drag_hint}</span>
      <button id="calIcs" class="fav-chip" title="${L.cal_export_hint}">⤓ .ics</button>
    </div>
    <div class="cal-grid">${head}${cells}</div>`;
  const shiftCal = (delta) => {
    const [y, m] = state.calMonth.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    state.calMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    render();
  };
  $("#calPrev").addEventListener("click", () => shiftCal(-1));
  $("#calNext").addEventListener("click", () => shiftCal(1));
  $("#calToday").addEventListener("click", () => { state.calMonth = today.slice(0, 7); render(); });
  $("#calScope").addEventListener("change", (e) => { state.calScope = e.target.value; render(); });
  $("#calProj").addEventListener("change", (e) => { state.calProject = e.target.value; render(); });
  $("#calIcs").addEventListener("click", () => { window.location = "/api/calendar.ics"; });
  const gridEl = $("#view").querySelector(".cal-grid");
  // 칩 클릭 → 할일 빠른편집 / 셀·일정 클릭 → 당일 패널. 뷰 innerHTML 전체 교체라 리스너 중복 없음.
  gridEl.addEventListener("click", (e) => {
    const item = e.target.closest(".cal-item");
    if (item) return openItemQuickEdit(item.dataset.item, item.dataset.proj, item.dataset.title);
    const cell = e.target.closest(".cal-cell");
    if (cell) return openCalDayPanel(cell.dataset.date, meetById);
  });
  // 드래그 이동: 할일 → /api/items/update(due_overridden 계약), 일정 → /api/meetings/update(시각부 보존).
  gridEl.addEventListener("dragstart", (e) => {
    const chip = e.target.closest(".cal-chip");
    if (!chip) return;
    e.dataTransfer.setData("text/plain", JSON.stringify(chip.dataset.item ? { kind: "item", id: chip.dataset.item } : { kind: "meet", id: chip.dataset.meet }));
  });
  gridEl.addEventListener("dragover", (e) => { if (e.target.closest(".cal-cell")) e.preventDefault(); });
  gridEl.addEventListener("drop", async (e) => {
    const cell = e.target.closest(".cal-cell");
    if (!cell) return;
    e.preventDefault();
    let payload; try { payload = JSON.parse(e.dataTransfer.getData("text/plain") || "{}"); } catch { return; }
    if (payload.kind === "item") await post("/api/items/update", { id: payload.id, due: cell.dataset.date });
    else if (payload.kind === "meet") {
      const old = meetById.get(payload.id);
      const hm = /[T ](\d{2}:\d{2})/.exec(String(old?.at ?? ""))?.[1];
      await post("/api/meetings/update", { id: payload.id, at: hm ? `${cell.dataset.date}T${hm}` : cell.dataset.date });
    } else return;
    render();
  });
}
// 당일 패널 — 일정 추가/삭제(기존 ui-confirm-overlay 팝업 관례).
function openCalDayPanel(date, meetById) {
  const L = state.lex;
  const dayMeets = [...meetById.values()].filter((m) => String(m.at ?? "").slice(0, 10) === date);
  document.querySelector(".ui-confirm-overlay")?.remove();
  const ov = document.createElement("div");
  ov.className = "ui-confirm-overlay";
  const projOpts = `<option value="">${L.calv_project_all}</option>` + (state._projCache ?? [])
    .filter((p) => p.class !== "inbox" && p.class !== "archive")
    .map((p) => `<option value="${esc(p.id)}">${esc(p.id)}</option>`).join("");
  ov.innerHTML = `<div class="ui-confirm" role="dialog" style="width:min(460px,94vw);text-align:left">
    <h3 style="margin:0 0 8px">${esc(date)}</h3>
    ${dayMeets.map((m) => `<div class="cal-day-meet" style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
      <span style="flex:1">${/[T ](\d{2}:\d{2})/.exec(String(m.at))?.[1] ?? ""} ${esc(m.title)}${m.project_id ? ` <span class="dim mini">${esc(m.project_id)}</span>` : ""}</span>
      <button class="fav-chip mini cal-meet-del" data-meet="${esc(m.id)}">${L.calv_del}</button></div>`).join("")}
    <div style="display:flex;gap:6px;margin:8px 0">
      <input class="cal-new-title login-input" placeholder="${L.calv_add_ph}" style="flex:1" />
      <input class="cal-new-time" type="time" style="width:7.5em" />
    </div>
    <div style="display:flex;gap:6px;margin-bottom:8px"><select class="cal-new-proj" style="flex:1">${projOpts}</select></div>
    <div class="cal-day-msg dim mini" style="min-height:1em"></div>
    <div class="ui-confirm-btns">
      <button class="ui-confirm-cancel">${L.btn_cancel}</button>
      <button class="cal-add-btn fav-chip">${L.calv_add}</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.querySelector(".ui-confirm-cancel").addEventListener("click", close);
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector(".cal-add-btn").addEventListener("click", async () => {
    const title = ov.querySelector(".cal-new-title").value.trim();
    if (!title) return;
    const time = ov.querySelector(".cal-new-time").value;
    const project_id = ov.querySelector(".cal-new-proj").value || null;
    const r = await post("/api/meetings", { title, at: time ? `${date}T${time}` : date, project_id });
    let res; try { res = await r.json(); } catch { res = {}; }
    if (res.error) { ov.querySelector(".cal-day-msg").textContent = res.error; return; }
    close();
    render();
  });
  ov.querySelectorAll(".cal-meet-del").forEach((b) => b.addEventListener("click", async () => {
    await post("/api/meetings/delete", { id: b.dataset.meet });
    close();
    render();
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

// 개발요청함(slice6): 인입 채널. 요청 등록 → 과제 연결 → '할 일로' 승격(미분류) → 분류 필요에서 SE 기준점 분류.
async function renderRequests() {
  const L = state.lex;
  const [summary, reqs] = await Promise.all([api("/api/summary"), api("/api/requests")]);
  const opts = summary.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join("");
  const rows = reqs.map((r) => `<tr>
    <td>${esc(r.title)}</td>
    <td class="dim">${esc(r.requester ?? "-")}</td>
    <td class="dim">${esc(r.category ?? "-")}</td>
    <td>${r.project_id ? esc(r.project_id) : `<span class="dim">${L.req_no_project ?? "미연결"}</span>`}</td>
    <td>${statusBadge(r.status)}</td>
    <td class="acts">${r.promoted_item_id
      ? `<span class="badge green">✓ ${L.item ?? "할 일"}</span>`
      : (r.project_id
        ? `<button class="fav-chip mini" data-promote-req="${esc(r.id)}">${L.req_promote ?? "할 일로"}</button>`
        : `<span class="dim">${L.req_need_project ?? "과제 연결 필요"}</span>`)} <button class="fav-chip mini req-edit" data-req-edit="${esc(r.id)}" title="${L.master_edit ?? "수정"}">✎</button><button class="fav-chip mini danger req-del" data-req-del="${esc(r.id)}" title="${L.master_del ?? "삭제"}">×</button></td>
  </tr>`).join("");
  $("#view").innerHTML = `
    <div class="item-form">
      <input id="reqTitle" placeholder="${L.req_title_ph ?? "개발 요청 내용"}" />
      <input id="reqWho" placeholder="${L.req_requester_ph ?? "요청자"}" size="9" />
      <select id="reqCat">
        <option value="">${L.req_category_ph ?? "분류"}…</option>
        <option value="요구사항">${L.req_cat_requirement ?? "요구사항"}</option>
        <option value="기능 아이디어">${L.req_cat_feature ?? "기능 아이디어"}</option>
        <option value="개선">${L.req_cat_improve ?? "개선"}</option>
        <option value="버그">${L.req_cat_bug ?? "버그"}</option>
        <option value="기타">${L.req_cat_etc ?? "기타"}</option>
      </select>
      <select id="reqProject"><option value="">${L.project}: ${L.req_no_project ?? "미연결"}</option>${opts}</select>
      <button id="reqAdd" class="fav-chip">${L.req_add ?? "요청 등록"}</button>
    </div>
    <p class="hub-note">${L.req_intake_note ?? "팀원 인입함 — 개발 요청·요구사항·업데이트하면 좋은 기능 아이디어·개선·버그를 자유롭게 적습니다(분류로 구분). 그대로 목록에 쌓이고, 과제에 연결해 '할 일로' 승격하면 분류 필요로 들어가 SE 기준점(단계·산출물·업무유형)에 거는 분류를 거칩니다."}</p>
    ${reqs.length
      ? `<table><thead><tr><th>${L.req_col_title ?? "요청"}</th><th>${L.req_col_who ?? "요청자"}</th><th>${L.req_col_cat ?? "분류"}</th><th>${L.project}</th><th>${L.th_status}</th><th>${L.th_actions}</th></tr></thead><tbody>${rows}</tbody></table>`
      : `<div class="empty">${L.req_empty ?? "등록된 요청 없음"}</div>`}`;
  $("#reqAdd").addEventListener("click", async () => {
    const title = $("#reqTitle").value.trim();
    if (!title) return;
    const body = { title };
    if ($("#reqWho").value.trim()) body.requester = $("#reqWho").value.trim();
    if ($("#reqCat").value.trim()) body.category = $("#reqCat").value.trim();
    if ($("#reqProject").value) body.project_id = $("#reqProject").value;
    const r = await post("/api/requests", body);
    if (r.ok) render();
  });
  $("#reqTitle").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#reqAdd").click(); });
  $("#view").querySelectorAll("[data-promote-req]").forEach((b) =>
    b.addEventListener("click", async () => { const res = await post("/api/requests/promote", { id: b.dataset.promoteReq }); if (res.ok) render(); })
  );
  $("#view").querySelectorAll(".req-del").forEach((b) => b.addEventListener("click", async () => {
    if (!(await uiConfirm(L.master_del_confirm ?? "삭제할까요? 되돌릴 수 없습니다."))) return;
    const r = await post("/api/requests/delete", { id: b.dataset.reqDel });
    if (r.ok) { toast(L.master_deleted ?? "삭제됨", "ok"); render(); } else toast(L.master_del_fail ?? "삭제 실패", "error");
  }));
  $("#view").querySelectorAll(".req-edit").forEach((b) => b.addEventListener("click", async () => {
    const cur = b.closest("tr")?.querySelector("td")?.textContent?.trim() ?? "";
    const nt = prompt(L.master_edit_title_ph ?? "제목", cur);
    if (nt === null) return;
    if (!nt.trim()) { toast(L.master_edit_fail ?? "수정 실패", "error"); return; }
    const r = await post("/api/requests/update", { id: b.dataset.reqEdit, title: nt.trim() });
    if (r.ok) { toast(L.master_edited ?? "수정됨", "ok"); render(); } else toast(L.master_edit_fail ?? "수정 실패", "error");
  }));
}

// 던전 배경: 판타지 모드 + 과제 허브 진입 시 과제별 배경 이미지(/skins/dungeons/<과제번호>.jpg, 로컬·비공개).
// 파일 없으면 그냥 미스트 그라데이션(404 레이어는 투명 → 폴백). 과제마다 다른 '던전'.
// 던전 배경 레이어 우선순위: owner 지정 이미지(<과제>.jpg/.png) → 게임 컨셉아트 풀(_pN, 과제별 배정) → 내 원본 SVG → 그라데이션.
// 앞 레이어가 404면 투명 → 다음이 비침. 게임 이미지는 로컬·비공개(gitignore).
const DUNGEON_POOL = 11; // /skins/dungeons/_p1..N.png
function poolFor(id) { let h = 0; const s = String(id); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return (h % DUNGEON_POOL) + 1; }
function applyDungeonBg() {
  let layers = null;
  if (state.mode === "fantasy") {
    if (state.view === "home") layers = `url("/skins/main.png"), url("/skins/main.jpg"), url("/skins/regions/guild.svg")`;
    else if (state.view === "project" && state.hubProject) {
      const id = encodeURIComponent(state.hubProject);
      layers = `url("/skins/dungeons/${id}.jpg"), url("/skins/dungeons/${id}.png"), url("/skins/dungeons/_p${poolFor(state.hubProject)}.png"), url("/skins/regions/forest.svg")`;
    }
  }
  if (layers) {
    document.body.dataset.dungeon = "1";
    document.body.style.setProperty("--dungeon-bg", layers);
  } else {
    document.body.removeAttribute("data-dungeon");
    document.body.style.removeProperty("--dungeon-bg");
  }
}

async function render() {
  document.getElementById("app").dataset.view = state.view; // 홈(위젯)에선 좌측 열 숨김용
  // 지식 대분류면 canon 항목 캐시를 nav 렌더 전에 준비(동적 왼쪽 leaves 용).
  if (state.navTop === "know" && !state._knowCache) {
    try { state._knowCache = (await api("/api/knowledge/registry")).groups; } catch { state._knowCache = []; }
  }
  applyDungeonBg();
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
  if (state.view === "mod:calendar") {
    $("#viewTitle").textContent = state.lex.calv_title ?? "캘린더";
    logView(state.view);
    return renderCalendar();
  }
  if (state.view === "mod:reports") {
    const m = (state.modules ?? []).find((x) => x.id === "reports");
    $("#viewTitle").textContent = m?.nav ?? "보고서";
    logView(state.view);
    return renderReports();
  }
  if (state.view === "knowledge") { $("#viewTitle").textContent = navTL(navTopOf("know")); logView(state.view); return renderKnowledgeEntry(); }
  if (state.view === "mod:knowledge") { const m=(state.modules??[]).find(x=>x.id==="knowledge"); $("#viewTitle").textContent=m?.nav??"지식"; logView(state.view); return renderKnowledge(); }
  if (state.view === "mod:calculators") { const m=(state.modules??[]).find(x=>x.id==="calculators"); $("#viewTitle").textContent=m?.nav??"계산기"; logView(state.view); return renderCalculators(); }
  if (state.view === "mod:recipe") { $("#viewTitle").textContent = state.lex.recipe_title; logView(state.view); return renderRecipe(); }
  if (state.view === "mod:embeds") { $("#viewTitle").textContent = state.lex.embed_title; logView(state.view); return renderEmbeds(); }
  if (state.view === "mod:proposals") { $("#viewTitle").textContent = state.lex.prop_queue_title; logView(state.view); return renderProposals(); }
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
  if (state.view === "mod:requests") {                  // 개발요청함(인입 채널)
    const m = (state.modules ?? []).find((x) => x.id === "requests");
    $("#viewTitle").textContent = m?.nav ?? "개발요청함";
    logView(state.view);
    return renderRequests();
  }
  if (state.view === "projects") {                      // 프로젝트 관리 랜딩(시작년도별 카드)
    $("#viewTitle").textContent = state.lex.nav_projects ?? "프로젝트 관리";
    logView(state.view);
    return renderProjectsList();
  }
  if (state.view.startsWith("soon:")) {                 // 준비 중 슬롯 진입(중분류 탭 클릭 등)
    const sn = SOON_NAV[state.view];
    $("#viewTitle").textContent = sn ? navTL(sn) : (state.lex.nav_soon ?? "준비 중");
    logView(state.view);
    return renderSoon(state.view);
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
  if (state.view === "auditlog") return renderAuditLog();
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
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
  // #10+ 메일 단건 처리 키보드 단축키 — 마우스 없이 받은함 완주. 기존 버튼을 재사용(렌더당 리스너 누수 없음, 단일 전역 핸들러).
  if (state.view === "mail" && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (e.key === "Enter") { // 텍스트 입력 중이 아니면: 현재 과제로 '분류하고 다음'
      if (e.target.matches("input, textarea")) return;
      const b = document.getElementById("assignOneNext");
      if (b && !b.disabled) { e.preventDefault(); b.click(); }
      return;
    }
    if (e.target.matches("input, textarea, select")) return; // 입력/드롭다운 조작 중엔 j/k 무시
    if (e.key === "j" || e.key === "ArrowDown") {
      e.preventDefault();
      const nx = document.getElementById("mailDetailNext");
      if (nx && !nx.disabled) nx.click(); else if (!document.querySelector(".mail-detail")) document.querySelector(".mail-row")?.click(); // 선택 없으면 첫 메일
    } else if (e.key === "k" || e.key === "ArrowUp") {
      e.preventDefault();
      const pv = document.getElementById("mailDetailPrev");
      if (pv && !pv.disabled) pv.click();
    }
  }
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

// ──────── 상단 툴바 기능(ECount 참고): 알림 · 타임라인 · 개인 메모 · 다크/라이트 ────────
// 공용 드롭다운(알림·타임라인) — 버튼 아래 우측 정렬, 바깥 클릭 시 닫힘.
function closeTopDropdowns() { document.querySelectorAll(".top-dropdown").forEach((d) => d.remove()); }
function showTopDropdown(anchorId, html) {
  const open = document.querySelector(`.top-dropdown[data-for="${anchorId}"]`);
  closeTopDropdowns();
  if (open) return; // 토글: 열려있으면 닫기만
  const a = $(`#${anchorId}`); if (!a) return;
  const dd = document.createElement("div");
  dd.className = "top-dropdown"; dd.dataset.for = anchorId; dd.innerHTML = html;
  document.body.appendChild(dd);
  const r = a.getBoundingClientRect();
  dd.style.top = `${Math.round(r.bottom + 4)}px`;
  dd.style.right = `${Math.round(window.innerWidth - r.right)}px`;
  setTimeout(() => document.addEventListener("click", function h(e) {
    if (!dd.contains(e.target) && e.target !== a && !a.contains(e.target)) { dd.remove(); document.removeEventListener("click", h); }
  }), 0);
  return dd;
}

// 🌙 다크/라이트 — 업무/판타지 mode 와 독립(색만 전환, 라벨 그대로). body[data-theme].
const ICON_MOON = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13a8 8 0 1 1-9-9 6.5 6.5 0 0 0 9 9z"/></svg>`;
const ICON_SUN = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19"/></svg>`;
function applyTheme(t) {
  document.body.dataset.theme = t;
  localStorage.setItem("dev_erp_theme", t);
  const b = $("#themeBtn"); if (b) { b.innerHTML = t === "dark" ? ICON_SUN : ICON_MOON; b.title = t === "dark" ? "라이트로 전환" : "다크로 전환"; }
}
applyTheme(localStorage.getItem("dev_erp_theme") || "light");
$("#themeBtn")?.addEventListener("click", () => applyTheme(document.body.dataset.theme === "dark" ? "light" : "dark"));

// 📝 개인 메모(E Note) — 어느 화면에서나 여는 개인 메모. 이 기기(localStorage)에만 저장.
function openNote() {
  document.querySelector(".note-overlay")?.remove();
  const ov = document.createElement("div");
  ov.className = "note-overlay";
  ov.innerHTML = `<div class="note-panel" role="dialog" aria-label="내 메모">
    <div class="note-head"><strong>📝 내 메모</strong><span class="dim">이 기기에만 저장</span><button class="note-x" title="닫기">✕</button></div>
    <textarea id="noteText" placeholder="개인 메모·할 일을 자유롭게 적으세요 (이 기기에만 저장됩니다)"></textarea></div>`;
  document.body.appendChild(ov);
  const ta = ov.querySelector("#noteText");
  ta.value = localStorage.getItem("dev_erp_note") || "";
  ta.addEventListener("input", () => localStorage.setItem("dev_erp_note", ta.value));
  ov.querySelector(".note-x").addEventListener("click", () => ov.remove());
  ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
  ta.focus();
}
$("#noteBtn")?.addEventListener("click", openNote);

// ✉ Outlook 메일 쓰기 — 웹 표준 mailto 로 기본 메일 클라이언트(Outlook) 작성창을 직접 연다. 샌드박스/Codex 무관(브라우저+OS가 처리). 발송은 사람이.
function openMailCompose(prefill = {}) {
  const L = state.lex;
  document.querySelector(".note-overlay")?.remove();
  const ov = document.createElement("div");
  ov.className = "note-overlay";
  ov.innerHTML = `<div class="note-panel mail-compose" role="dialog" aria-label="${L.compose_title ?? "Outlook 메일 쓰기"}">
    <div class="note-head"><strong>✉ ${L.compose_title ?? "Outlook 메일 쓰기"}</strong><span class="dim">${L.compose_hint ?? "Outlook 작성창이 열립니다 — 검토 후 직접 발송"}</span><button class="note-x" title="닫기">✕</button></div>
    <div class="compose-form">
      <input id="cmTo" placeholder="${L.compose_to ?? "받는 사람 (이름 또는 메일주소)"}" value="${esc(prefill.to ?? "")}" />
      <input id="cmCc" placeholder="${L.compose_cc ?? "참조 (선택)"}" value="${esc(prefill.cc ?? "")}" />
      <input id="cmSubject" placeholder="${L.compose_subject ?? "제목"}" value="${esc(prefill.subject ?? "")}" />
      <textarea id="cmBody" placeholder="${L.compose_body ?? "본문 (Codex 초안을 붙여넣으세요)"}">${esc(prefill.body ?? "")}</textarea>
      <div class="compose-actions">
        <button id="cmOpen" class="fav-chip active">${L.compose_open ?? "Outlook로 열기"}</button>
        <button id="cmCopy" class="fav-chip">${L.compose_copy ?? "전체 복사"}</button>
        <span id="cmMsg" class="dim"></span>
      </div>
    </div></div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.querySelector(".note-x").addEventListener("click", close);
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  const msg = ov.querySelector("#cmMsg");
  ov.querySelector("#cmOpen").addEventListener("click", () => {
    const to = ov.querySelector("#cmTo").value.trim();
    const cc = ov.querySelector("#cmCc").value.trim();
    const subject = ov.querySelector("#cmSubject").value;
    const body = ov.querySelector("#cmBody").value;
    const qs = [];
    if (cc) qs.push(`cc=${encodeURIComponent(cc)}`);
    if (subject) qs.push(`subject=${encodeURIComponent(subject)}`);
    if (body) qs.push(`body=${encodeURIComponent(body)}`);
    const url = `mailto:${encodeURIComponent(to)}${qs.length ? "?" + qs.join("&") : ""}`;
    if (url.length > 1900) msg.textContent = L.compose_too_long ?? "본문이 길어 잘릴 수 있어요 — '전체 복사' 후 붙여넣기 권장";
    window.location.href = url; // 브라우저가 기본 메일 클라이언트(Outlook) 작성창을 연다(페이지 이동 없음)
  });
  ov.querySelector("#cmCopy").addEventListener("click", async () => {
    const txt = `${ov.querySelector("#cmSubject").value}\n\n${ov.querySelector("#cmBody").value}`;
    try { await navigator.clipboard.writeText(txt); msg.textContent = L.compose_copied ?? "복사됨 — Outlook에 붙여넣기"; }
    catch { msg.textContent = L.compose_copy_fail ?? "복사 실패"; }
  });
  ov.querySelector("#cmTo").focus();
}
$("#mailComposeBtn")?.addEventListener("click", () => openMailCompose());

// 이벤트 종류 한글 라벨 — 타임라인·활동로그가 raw kind("item_status" 등) 대신 읽을 수 있게(papercut). 미등록 kind 는 원문 표시.
const EVENT_KIND_LABELS = {
  item_status: "상태 변경", item_create: "할일 생성", create_item: "할일 생성", item_assign: "담당 배정",
  item_confirm: "분류 확정", item_edit: "할일 수정", item_archive: "보관", item_restore: "복원",
  item_move: "이동", item_promote: "할일 승격", completion_digest: "완료 요약", split_suggest: "분해 제안",
  add_attachment_type: "첨부유형 추가", set_artifact_requirement: "산출물 요건", link_part_project: "부품-과제 연결",
  mail_assign: "메일 분류", mail_unassign: "분류 취소", mail_delete: "메일 삭제", mail_update: "메일 수정",
  mail_register: "메일 등록", mail_collect_manual: "메일 수집", mail_rule_set: "메일 제외규칙 설정", mail_rule_delete: "메일 제외규칙 삭제", ai_proposal_approve: "제안 승인",
  mail_route_rule_set: "메일 라우팅규칙 추가", mail_route_rule_delete: "메일 라우팅규칙 삭제", mail_route_apply: "라우팅규칙 소급 적용",
  ai_proposal_reject: "제안 반려", recommender_run: "추천 실행", chat_query: "AI 질문", knowledge_upsert: "지식 갱신",
  gate_clear: "게이트 통과", gate_mode_set: "게이트 설정", anchor_move: "단계 이동", attachment_add: "첨부 추가",
  deliverable_add: "산출물 추가", deliverable_edit: "산출물 수정", deliverable_due_edit: "마감 수정",
  deliverable_input: "산출물 입력", deliverable_review: "산출물 검토", guide_artifact_add: "가이드 추가",
  task_spawn_deliverable: "산출물 할일", label_create: "라벨 생성", label_update: "라벨 수정", label_delete: "라벨 삭제",
  contact_create: "연락처 추가", contact_update: "연락처 수정", contact_delete: "연락처 삭제",
  request_create: "요청 등록", request_update: "요청 수정", request_delete: "요청 삭제",
  purchase_create: "발주 생성", purchase_delete: "발주 삭제", purchase_stage: "발주 단계",
  project_create: "과제 생성", project_update: "과제 수정", meeting_create: "회의 등록", part_upsert: "부품 갱신",
  bom_change: "BOM 변경", stock_set: "재고 설정", person_skill_set: "역량 설정", account_create: "계정 생성",
  account_register: "가입", account_deleted: "계정 삭제", account_mailbox_update: "메일함 설정",
  account_mailbox_disconnect: "메일함 해제", account_mailbox_credentials_set: "메일함 인증",
  account_password_reset: "비번 초기화", auth_login: "로그인", auth_bootstrap: "초기 설정",
  mail_followup: "후속 메일 귀속", auto_intake_run: "자동 인입 실행", followup_due: "회신 없음 신호",
  due_reminder: "마감 임박 신호", knowledge_feed_run: "지식 후보 적재", auth_login_failed: "로그인 실패",
  auth_password_change: "비번 변경", codex_task_thread_open: "AI 대화 시작", codex_task_message: "AI 대화",
  codex_task_image_attach: "이미지 첨부", codex_task_file_attach: "파일 첨부", embed_register: "시트 연결", schedule_spawn: "일정 생성",
  input_upload: "입력 업로드", input_download: "입력 다운로드",
  work_started: "업무 시작", work_completed: "업무 완료", completion_hook_skipped: "완료 훅 스킵", completion_hook_failed: "완료 훅 실패",
  five_field_partial: "5필드 부분 캡처",
  morning_brief_run: "아침 브리핑 실행", morning_brief_sent: "아침 브리핑 발송", morning_brief_error: "아침 브리핑 실패",
};
const eventKindLabel = (kind) => EVENT_KIND_LABELS[kind] ?? kind;

// 🕘 타임라인 — 최근 활동(event_log) 드롭다운.
async function openTimeline() {
  const dd = showTopDropdown("timelineBtn", `<div class="dd-head">타임라인 · 최근 활동</div><div class="dd-loading dim">불러오는 중…</div>`);
  if (!dd) return;
  let evs = []; try { evs = await api("/api/events/recent?limit=30"); } catch {}
  if (!document.body.contains(dd)) return;
  const rows = evs.length
    ? evs.map((e) => `<div class="tl-row"><span class="tl-time dim">${localTime(e.at)}</span>
        <span class="badge">${esc(eventKindLabel(e.kind))}</span>
        <span class="tl-body">${esc(e.actor_ref ?? "")}${e.to_val ? ` · ${esc(String(e.to_val)).slice(0, 40)}` : ""}</span></div>`).join("")
    : `<div class="empty small">최근 활동 없음</div>`;
  dd.innerHTML = `<div class="dd-head">타임라인 · 최근 활동</div>${rows}`;
}
$("#timelineBtn")?.addEventListener("click", openTimeline);

// 🔔 알림 — 봐야 할 것 집계(대기 제안·차단/연체 할일·막힌 게이트·품절 부품). 전부 기존 API.
async function loadNotifications() {
  const [props, blockedData, overdueData, triageOverdueData, gates, low] = await Promise.all([
    loadProposalsForCurrentAccount().catch(() => []),
    api("/api/items?status=blocked&page=1&limit=1").catch(() => ({ rows: [], total: 0 })),
    api("/api/items?due=overdue&page=1&limit=1").catch(() => ({ rows: [], total: 0 })),
    api("/api/items?status=unclassified&due=overdue&page=1&limit=1").catch(() => ({ rows: [], total: 0 })),
    api("/api/gates").catch(() => ({ stages: [] })),
    api("/api/stock/low").catch(() => []),
  ]);
  const blocked = asPage(blockedData, 1, 0).total;
  const overdue = asPage(overdueData, 1, 0).total;
  const triageOverdue = asPage(triageOverdueData, 1, 0).total;
  const heldGates = (gates.stages || []).filter((s) => s.status !== "cleared" && !s.passable);
  const groups = [
    { label: "승인 대기 제안", n: props.length, view: "mod:proposals" },
    { label: "차단된 할 일", n: blocked, view: "items", status: "blocked" },
    { label: "연체 할 일", n: overdue, view: "items" },
    { label: "분류 필요 연체", n: triageOverdue, view: "items", status: "unclassified" },
    { label: "막힌 단계 게이트", n: heldGates.length, view: "mod:gates" },
    { label: "품절 임박 부품", n: low.length, view: "mod:stockwatch" },
  ].filter((g) => g.n > 0);
  return { groups, total: groups.reduce((s, g) => s + g.n, 0) };
}
function refreshNotifBadge() {
  loadNotifications().then(({ total }) => {
    const b = $("#notifBadge"); if (!b) return;
    b.textContent = total > 99 ? "99+" : String(total);
    b.classList.toggle("hidden", total === 0);
  }).catch(() => {});
}
async function openNotifications() {
  const dd = showTopDropdown("notifBtn", `<div class="dd-head">알림</div><div class="dd-loading dim">불러오는 중…</div>`);
  if (!dd) return;
  const { groups, total } = await loadNotifications();
  if (!document.body.contains(dd)) return;
  const body = total
    ? groups.map((g) => `<div class="nt-group" data-go="${g.view}" data-status="${esc(g.status ?? "")}"><span class="nt-cnt">${g.n}</span><span class="nt-label">${g.label}</span><span class="dim">→</span></div>`).join("")
    : `<div class="empty small">새 알림 없음</div>`;
  dd.innerHTML = `<div class="dd-head">알림 (${total})</div>${body}`;
  dd.querySelectorAll(".nt-group").forEach((g) => g.addEventListener("click", () => {
    closeTopDropdowns();
    state.view = g.dataset.go;
    if (g.dataset.status) { state.statusFilter = g.dataset.status; resetItemPaging(); }
    render();
  }));
}
$("#notifBtn")?.addEventListener("click", openNotifications);

let reconnecting = false;
let refreshLoopsStarted = false;

function startRefreshLoops() {
  if (refreshLoopsStarted) return;
  refreshLoopsStarted = true;
  // 배지를 세션 내내 살려둔다 — 완료 시 생기는 AI 요약 제안·새 차단/연체가 새로고침 없이 ~30초 내 벨에 뜨도록(발견성).
  setInterval(() => { if (state.account && document.visibilityState !== "hidden") refreshNotifBadge(); }, 30000);
  // 메일 위젯(미분류 메일함·최근 메일) 자동 갱신 — 스냅샷이라 새 메일이 안 뜨던 문제. 90초 주기 + 탭 복귀 시. 위젯 검색 입력 중엔 스킵(검색어 보존).
  const autoRefreshMailWidgets = () => {
    if (document.visibilityState === "hidden") return;
    if (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains("widget-search")) return;
    document.querySelectorAll('#view [data-refresh="inbox"], #view [data-refresh="mail"]').forEach((b) => b.click());
  };
  setInterval(autoRefreshMailWidgets, 90000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") autoRefreshMailWidgets(); });
  // 로그인 여부와 무관하게 서버 단절을 감지한다. 실패 후에는 같은 주기로 자동 재연결을 시도한다.
  setInterval(() => {
    if (document.visibilityState === "hidden") return;
    if (state.connection.status === "online") request("/api/health", { timeoutMs: 5000 }).catch(() => {});
    else if (navigator.onLine !== false) retryConnection();
  }, 30000);
}

async function retryConnection() {
  if (reconnecting) return;
  reconnecting = true;
  setConnectionState("checking");
  try {
    await request("/api/health", { timeoutMs: 5000 });
    await loadMe();
    await loadLexicon(); // 인증 화면과 본문 양쪽의 라벨을 함께 복구한다.
    if (state.account && !state.booted) await pullServerLayout();
    setConnectionState("online");
    if (!state.account) {
      // 인증 벽: 미로그인이면 앱 대신 첫 페이지(달빛 길드 입성)만 보인다.
      renderGate();
    } else {
      await render();
      refreshNotifBadge();
    }
    state.booted = true;
    startRefreshLoops();
  } catch (error) {
    const failure = error instanceof RequestFailure
      ? error
      : new RequestFailure("http", "bootstrap", { message: error?.message || "bootstrap_failed" });
    setConnectionState(failure.kind, failure);
  } finally {
    reconnecting = false;
    renderConnectionStatus();
  }
}

document.addEventListener("click", (event) => {
  if (state.connection.status === "online" || event.target.closest("[data-connection-action]")) return;
  if (event.target.closest("button, input, select, textarea")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    syncConnectionControls();
  }
}, true);
document.addEventListener("submit", (event) => {
  if (state.connection.status !== "online") {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);
new MutationObserver(() => {
  if (state.connection.status !== "online") syncConnectionControls();
}).observe(document.body, { childList: true, subtree: true });

$("#connectionRetry").addEventListener("click", retryConnection);
window.addEventListener("offline", () => {
  const failure = new RequestFailure("network", location.pathname, { message: "browser_offline" });
  setConnectionState(failure.kind, failure);
});
window.addEventListener("online", () => retryConnection());

setConnectionState("checking");
await retryConnection();

// ── 마이크 받아쓰기(공용): 브라우저 내장 SpeechRecognition 을 입력창에 연결 ──────────────
//   주의: Chrome/Edge 의 음성 인식은 브라우저 벤더 서버에서 처리될 수 있음 — 민감 내용 구두 입력 주의(툴팁 고지).
//   미지원 브라우저는 버튼 비활성(기능 저하 없이 안내만). 서버 전송/저장 없음 — 인식 결과는 입력창 텍스트로만.
function wireMicDictation(btn, input) {
  if (!btn || !input) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    btn.disabled = true;
    btn.classList.add("off");
    btn.title = L.mic_unsupported ?? "이 브라우저는 음성 인식을 지원하지 않아요 (Chrome/Edge 사용)";
    return;
  }
  // HTTP+IP 접속(LAN 파일럿)은 브라우저가 마이크를 원천 차단(secure context 필요).
  // 해결: 접속 PC Chrome 의 chrome://flags/#unsafely-treat-insecure-origin-as-secure 에
  // 이 주소를 예외 등록(1회) 하거나, Tailscale HTTPS 경로로 접속.
  if (!window.isSecureContext) {
    btn.disabled = true;
    btn.classList.add("off");
    btn.title = L.mic_insecure ?? "HTTP 접속에서는 브라우저가 마이크를 차단해요 — 이 PC Chrome의 flags에서 unsafely-treat-insecure-origin-as-secure 에 이 주소를 예외 등록(1회)하거나 HTTPS(Tailscale)로 접속하세요";
    return;
  }
  let rec = null;
  const idleTitle = btn.title || (L.chat_mic ?? "음성 입력");
  const setIdle = () => { rec = null; btn.classList.remove("rec"); btn.textContent = "🎤"; btn.title = idleTitle; };
  btn.addEventListener("click", () => {
    if (rec) { try { rec.stop(); } catch { setIdle(); } return; }
    rec = new SR();
    rec.lang = "ko-KR";
    rec.interimResults = true;
    rec.continuous = true;
    const base = input.value ? `${input.value.replace(/\s+$/, "")} ` : "";
    let finals = "";
    btn.classList.add("rec");
    btn.textContent = "⏹";
    btn.title = L.mic_listening ?? "듣는 중 — 누르면 종료";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        if (r.isFinal) finals += r[0].transcript;
        else interim += r[0].transcript;
      }
      input.value = base + finals + interim;
    };
    rec.onerror = (e) => {
      const code = String(e?.error || "");
      if (code === "not-allowed" || code === "service-not-allowed") {
        toast(L.mic_err_not_allowed ?? "마이크 권한이 차단됐어요 — 주소창 자물쇠(사이트 설정)에서 마이크를 허용해 주세요", "error");
      } else if (code === "network") {
        toast(L.mic_err_network ?? "음성 인식 서비스 연결 실패 — 네트워크/방화벽 확인", "error");
      } else if (code === "audio-capture") {
        toast(L.mic_err_audio ?? "마이크 장치를 찾을 수 없어요 — 연결/OS 입력장치 확인", "error");
      } // no-speech 등은 조용히 종료
      try { rec?.stop(); } catch { /* noop */ }
    };
    rec.onend = () => { setIdle(); input.focus(); };
    try { rec.start(); } catch { setIdle(); }
  });
}
