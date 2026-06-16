// dev-erp P1 클라이언트 (no-build vanilla JS).
// 모든 라벨은 /api/lexicon 사전을 거친다 (하드코딩 금지, INFRA-004).
const state = {
  mode: localStorage.getItem("dev_erp_mode") || "business",
  view: "home",
  lex: {},
  projectFilter: "",
  navTop: localStorage.getItem("dev_erp_navtop") || "work",       // L1 대분류(상단 가로)
  navGroup: localStorage.getItem("dev_erp_navgroup") || "work_mine", // L2 중분류(상단 가로, 섹터)
  navFold: new Set(JSON.parse(localStorage.getItem("dev_erp_navfold") || "[]")), // 좌측 L3 접힘 키
  pins: JSON.parse(localStorage.getItem("dev_erp_pins") || "[]"),
  // P2b: 계정/권한. 익명(account=null)이면 앱은 현행대로(전체 접근·localStorage).
  account: null, perms: [], accountCount: 0,
  mineOnly: localStorage.getItem("dev_erp_mine") !== "0", // 내 할 일: 기본 '내 일만'(로그인 시). 익명이면 무시.
  chatLog: [],
  chatThread: null,
  poProject: "",
  poParty: "",
  ctProject: "",
  bomBoard: "",
  itemEdit: null
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

// 보기 대상(팀/사용자별) 스코프 — 로그인 시 1회 로드. 관리자=팀+사용자별, 팀원=본인만(선택기 숨김).
async function ensureScopes() {
  if (!state.account) { state._scopes = null; return; }
  if (state._scopes) return;
  try {
    const r = await api("/api/accounts/scopes");
    state._scopes = r.scopes || [];
    if (!state.viewScope) state.viewScope = r.is_admin ? "team" : (r.self ?? null);
  } catch { state._scopes = []; }
}
// 선택기 노출 조건: 로그인 + 고를 대상 2개 이상(=관리자). 팀원 1인은 굳이 안 띄움.
function showViewScope() { return !!(state.account && state._scopes && state._scopes.length > 1); }
function viewSelectHtml(L) {
  if (!showViewScope()) return "";
  const opts = state._scopes.map((s) => `<option value="${esc(s.id)}" ${state.viewScope === s.id ? "selected" : ""}>${esc(s.label)}</option>`).join("");
  return `<select id="fView" class="view-scope" title="${esc(L.view_scope ?? "보기 대상")}">${opts}</select>`;
}
function wireViewSelect() { $("#fView")?.addEventListener("change", (e) => { state.viewScope = e.target.value; render(); }); }
// 현재 보기 스코프를 쿼리에 적용(team/미지정=전체). items·mail 공용.
function applyViewScope(params) {
  if (showViewScope() && state.viewScope && state.viewScope !== "team") params.set("view", state.viewScope);
  return params;
}

// 상단 인증 UI. 계정 0(익명 파일럿)=숨김 / 로그인=사용자+로그아웃 / 계정 있고 미로그인=로그인 버튼.
function renderAuth() {
  const box = $("#authBox"); if (!box) return;
  const L = state.lex;
  if (state.account) {
    // 실제 가입 이름(display_name) 우선 표기, 없으면 아이디. 관리자면 관리 버튼.
    const name = esc(state.account.display_name || state.account.username);
    const adminBtn = state.account.is_admin ? `<button id="adminBtn" class="fav-chip">${L.admin_panel}</button>` : "";
    box.innerHTML = `<span class="auth-user" title="${esc(state.account.email || "")}">${name}</span>${adminBtn}<button id="logoutBtn" class="fav-chip">${L.logout}</button>`;
    if (state.account.is_admin) $("#adminBtn").addEventListener("click", openAdminPanel);
    $("#logoutBtn").addEventListener("click", async () => { await fetch("/api/auth/logout", { method: "POST" }).catch(() => {}); location.reload(); });
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
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) }).catch(() => null);
    if (r && r.ok) { close(); location.reload(); }
    else ov.querySelector(".login-err").textContent = L.login_fail;
  };
  ov.querySelector(".ui-confirm-ok").addEventListener("click", submit);
  ov.querySelector("#loginPw").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  ov.querySelector("#loginUser").focus();
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
    const r = await post("/api/auth/bootstrap", body).catch(() => null);
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
        <button class="gate-switch" data-go="register">${L.gate_to_register}</button>`;
    }
    const isMaster = tab === "master";
    return `${isMaster ? `<div class="gate-formhead"><div class="gate-fh-title">${L.gate_master_title}</div><div class="gate-fh-sub">${L.gate_master_sub}</div></div>` : ""}
      ${inp("gName", L.acct_name, "text", "name")}${inp("gUser", L.acct_user, "text", "username")}${inp("gEmail", L.acct_email, "email", "email")}${inp("gPw", L.acct_pw, "password", "new-password")}
      <div class="gate-err danger-text"></div>
      <button class="gate-btn" id="gateSubmit">${isMaster ? L.gate_master_btn : L.gate_register_btn}</button>
      ${isMaster ? "" : `<button class="gate-switch" data-go="login">${L.gate_to_login}</button>`}`;
  }
  function paint() {
    gate.innerHTML = `
      ${decor}
      <button class="gate-mode" id="gateMode">${fant ? L.gate_mode_to_biz : L.gate_mode_to_fant}</button>
      <div class="gate-card">
        <div class="gate-crest">${crest}</div>
        <div class="gate-brand">${L.gate_title}</div>
        <div class="gate-tagline">${L.gate_sub}</div>
        ${firstRun ? "" : `<div class="gate-tabs">
          <button class="gate-tab ${tab === "login" ? "on" : ""}" data-tab="login">${L.gate_tab_login}</button>
          <button class="gate-tab ${tab === "register" ? "on" : ""}" data-tab="register">${L.gate_tab_register}</button>
        </div>`}
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
    const v = (id) => gate.querySelector("#" + id)?.value.trim() ?? "";
    const pw = gate.querySelector("#gPw")?.value ?? "";
    const J = (b) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    try {
      let r;
      if (tab === "login") {
        r = await fetch("/api/auth/login", J({ username: v("gUser"), password: pw }));
        if (!r.ok) { err.textContent = L.login_fail; return; }
      } else {
        const ep = tab === "master" ? "/api/auth/bootstrap" : "/api/auth/register";
        r = await fetch(ep, J({ display_name: v("gName"), username: v("gUser"), email: v("gEmail"), password: pw }));
        if (!r.ok) { err.textContent = tab === "master" ? L.login_fail : L.register_fail; return; }
      }
      location.reload();
    } catch { err.textContent = L.login_fail; }
  }
  document.body.appendChild(gate);
  paint();
}

// 관리자 패널: 계정 목록 + 추가 + 역할/상태 관리(관리자 전용).
async function openAdminPanel() {
  const L = state.lex;
  document.querySelector(".ui-confirm-overlay")?.remove();
  const ov = document.createElement("div");
  ov.className = "ui-confirm-overlay";
  ov.innerHTML = `<div class="ui-confirm admin-panel" role="dialog" aria-label="${L.admin_panel}" style="max-width:720px;text-align:left">
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
    <div id="acList"></div>
    <div class="ui-confirm-btns"><button class="ui-confirm-cancel">${L.btn_cancel}</button></div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector(".ui-confirm-cancel").addEventListener("click", close);
  const errBox = ov.querySelector(".admin-err");
  const renderList = async () => {
    const data = await api("/api/accounts").catch(() => ({ accounts: [] }));
    const rows = (data.accounts || []).map((a) => {
      const role = a.is_admin ? "admin" : "member";
      const roleLbl = a.is_admin ? L.acct_role_admin : L.acct_role_member;
      const statusLbl = a.status === "active" ? L.acct_active : L.acct_disabled;
      const otherRole = a.is_admin ? "member" : "admin";
      const isSelf = state.account && a.id === state.account.id;
      return `<tr>
        <td>${esc(a.display_name || a.username)}</td><td class="muted">${esc(a.username)}</td>
        <td class="muted">${esc(a.email || "-")}</td>
        <td><button class="fav-chip ac-role" data-id="${a.id}" data-role="${otherRole}">${roleLbl}</button></td>
        <td><button class="fav-chip ac-status" data-id="${a.id}" data-status="${a.status === "active" ? "disabled" : "active"}" ${isSelf ? "disabled" : ""}>${statusLbl}</button></td>
      </tr>`;
    }).join("");
    ov.querySelector("#acList").innerHTML =
      `<table class="admin-table" style="width:100%;border-collapse:collapse"><thead><tr>
        <th>${L.acct_name}</th><th>${L.acct_user}</th><th>${L.acct_email}</th><th>${L.acct_role}</th><th>${L.acct_status}</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    ov.querySelectorAll(".ac-role").forEach((b) => b.addEventListener("click", async () => {
      await post("/api/accounts/update", { id: b.dataset.id, role: b.dataset.role }); renderList();
    }));
    ov.querySelectorAll(".ac-status").forEach((b) => b.addEventListener("click", async () => {
      await post("/api/accounts/status", { id: b.dataset.id, status: b.dataset.status }); renderList();
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
    const r = await fetch(url, { method: "POST", body: f }).then((x) => x.json()).catch(() => null);
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
  // 맨 왼쪽 콕핏 버튼 = 위젯 대시보드 진입(ECount 로고/MyPage 식). 아이콘+라벨, 홈일 때 활성.
  $("#appTitle").innerHTML = `<span class="cockpit-ico" aria-hidden="true">▦</span><span>${esc(state.lex.app_title)}</span>`;
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
  { id: "kb", b: "지식·지원", f: "대도서관", sectors: [
    { g: "kb_know", b: "지식·표준", f: "전승·율법", subs: [
      { b: "지식·RAG·표준", f: "전승 검색", items: ["mod:knowledge"] },
      { b: "SE 가이드·검색", f: "원정 지침", items: ["guide", "search"] },
    ] },
    { g: "kb_tool", b: "도구·템플릿", f: "제작 도구", subs: [
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
        state.view = navFirstView(sec);
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
      state.view = navFirstView(navSectorOf(state.navTop, state.navGroup));
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
  const cards = list.map((p) => {
    const wl = [];
    if (p.overdue) wl.push(`<em class="wl over">${state.lex.proj_wl_overdue ?? "연체"} ${p.overdue}</em>`);
    if (p.due_today) wl.push(`<em class="wl due">${state.lex.proj_wl_today ?? "오늘"} ${p.due_today}</em>`);
    if (p.open) wl.push(`<em class="wl open">${state.lex.proj_wl_open ?? "열림"} ${p.open}</em>`);
    const ptitle = p.title && p.title !== p.id ? esc(p.title) : "";
    return `<div class="proj-card" data-hub="${esc(p.id)}">
      <div class="pc-head"><span class="pc-id">${esc(p.id)}</span>${p.provisional ? `<span class="badge mini warn">${state.lex.proj_provisional ?? "정션 미연결"}</span>` : ""}<span class="status-chip s-${p.health ?? "ok"}">${projHealthLabel(p.health)}</span></div>
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
  $("#view").innerHTML = `<div class="proj-list-head">${state.lex.nav_projects ?? "프로젝트 관리"} › <strong>${projYearLabel(year)}</strong> · ${state.lex.proj_path_hint ?? "과제 클릭 → facet 열림"}</div>${newForm}${list.length ? `<div class="proj-cards">${cards}</div>` : `<div class="empty">${state.lex.proj_tree_empty ?? "해당 없음"}</div>`}`;
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
  { id: "analytics_w", cat: "group_team" },
  { id: "proposals", cat: "group_team", ready: true }
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
  if (state.account) fetch("/api/dashboard/layout", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ layout: arr }) }).catch(() => {});
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
// 위젯 할일 행 — 클릭하면 인라인 빠른편집(상태 변경/할일 이동). data-item 있으면 대시보드 click 위임이 처리.
function itemMiniRow(i, tail = []) {
  const cells = [`<td>${esc(i.title)}</td>`, `<td class="dim">${esc(i.project_id ?? "")}</td>`,
    ...tail.map((c) => `<td class="dim num">${c}</td>`)];
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
// 할일 인라인 빠른편집 — 상태 즉시 변경(거기서 바로 편집) + 할일 화면 이동.
async function openItemQuickEdit(itemId, projectId, title) {
  const L = state.lex;
  const STATUSES = ["open", "doing", "waiting", "blocked", "done"];
  document.querySelector(".ui-confirm-overlay")?.remove();
  const ov = document.createElement("div");
  ov.className = "ui-confirm-overlay";
  ov.innerHTML = `<div class="ui-confirm qedit" role="dialog" aria-label="${esc(title ?? "")}" style="max-width:460px;text-align:left">
    <p class="ui-confirm-msg">${esc(title ?? itemId)}</p>
    <div class="qe-status" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
      ${STATUSES.map((s) => `<button class="fav-chip qe-st" data-st="${s}">${L["status_" + s] ?? s}</button>`).join("")}
    </div>
    <div class="qe-msg dim mini" style="min-height:1em"></div>
    <div class="ui-confirm-btns">
      <button class="ui-confirm-cancel">${L.btn_cancel}</button>
      <button class="qe-goto fav-chip">${L.w_goto ?? "할일 화면으로"}</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector(".ui-confirm-cancel").addEventListener("click", close);
  ov.querySelectorAll(".qe-st").forEach((b) => b.addEventListener("click", async () => {
    const r = await post("/api/items/status", { id: itemId, status: b.dataset.st });
    if (r.ok) { close(); render(); }
    else { const e = await r.json().catch(() => ({})); ov.querySelector(".qe-msg").textContent = e.error || "오류"; }
  }));
  ov.querySelector(".qe-goto").addEventListener("click", () => {
    close(); state.projectFilter = projectId || ""; state.statusFilter = ""; state.view = "items"; render();
  });
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
async function renderProposals() {
  const L = state.lex;
  const props = await api("/api/proposals");
  const rows = props.length
    ? `<table><tbody>${props.map((p) => `<tr data-prop="${esc(p.id)}">
        <td><span class="badge">${esc(p.kind)}</span></td>
        <td>${esc(p.summary ?? p.payload?.title ?? p.id)}</td>
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
      return { title: L.tile_today, html: due.length ? `<table><tbody>${due.map((i) => itemMiniRow(i, [esc(i.due ?? "-")])).join("")}</tbody></table>` : `<div class="empty">${L.empty_items}</div>` };
    }
    if (id === "blocked") {
      const blocked = (await api("/api/items?status=blocked")).slice(0, 6);
      return { title: L.tile_blocked, html: blocked.length ? `<table><tbody>${blocked.map((i) => itemMiniRow(i, [statusBadge(i.status)])).join("")}</tbody></table>` : `<div class="empty">${L.empty_items}</div>` };
    }
    if (id === "mine") {
      // 내 담당 할 일 — 로그인 계정 식별자(내 일 필터와 동일 경로). 익명이면 로그인 안내.
      if (!state.account) return { title: L.tile_mine, html: `<div class="empty">${L.mine_login ?? "로그인하면 내 담당 할 일이 보입니다"}</div>` };
      const mine = (await api("/api/items?mine=1")).filter((i) => i.status !== "done").slice(0, 8);
      return { title: L.tile_mine, html: mine.length ? `<table><tbody>${mine.map((i) => itemMiniRow(i, [esc(i.due ?? "-")])).join("")}</tbody></table>` : `<div class="empty">${L.empty_items}</div>` };
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
    if (id === "nudges") {
      // P-6 콕핏 알림 — '먼저 해야 할 일' 우선순위(연체>차단>오늘>미완). 연체/차단은 번쩍임.
      const ns = await api("/api/nudges?limit=6");
      const rlabel = { overdue: L.overdue, blocked: L.blocked, due_today: L.today_due, open: L.open };
      const rcls = { overdue: "red", blocked: "red", due_today: "amber", open: "" };
      return { title: L.tile_nudges, html: ns.length
        ? `<table><tbody>${ns.map((n) => `<tr class="wrow nudge-row${n.reason === "overdue" || n.reason === "blocked" ? " flash" : ""}" data-item="${esc(n.id)}" data-proj="${esc(n.project_id ?? "")}" data-title="${esc(n.title)}">
            <td><span class="badge ${rcls[n.reason]}">${rlabel[n.reason] ?? esc(n.reason)}</span></td>
            <td>${esc(n.title)}</td><td class="dim">${esc(n.project_id)}</td><td class="dim num">${esc(n.due ?? "-")}</td></tr>`).join("")}</tbody></table>`
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
        ? `<tr class="date-sep"><td colspan="3" class="${cls}">${lab} ${arr.length}</td></tr>` + arr.slice(0, 5).map((i) => itemMiniRow(i, [esc(i.due)])).join("")
        : "";
      return { title: L.tile_deadline_cal, html: (over.length || soon.length || later.length)
        ? `<table><tbody>${sect(L.bucket_overdue, over, "due-over")}${sect(L.bucket_thisweek, soon, "")}${sect(L.bucket_later, later, "")}</tbody></table>`
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
      const props = await api("/api/proposals");
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
      const mails = (await api("/api/mail?days=3650")).filter((m) => ids.has(m.project_id)).slice(0, 8);
      return { title: L.tile_inbox, html: mails.length
        ? `<table><tbody>${mails.map((m) => miniRow([localTime(m.at), esc(m.subject)])).join("")}</tbody></table>`
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

  $("#view").innerHTML = `${kpi}
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
    ov.querySelectorAll("[data-goreports]").forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); state.view = "mod:reports"; close(); render(); }));
  }

  function bindWidgetInner() {
    $("#view").querySelectorAll(".proj-row").forEach((r) =>
      r.addEventListener("click", () => { state.hubProject = r.dataset.p; state.hubTab = "overview"; state.view = "project"; render(); }));
    $("#view").querySelectorAll("[data-jump-mail]").forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); state.projectFilter = b.dataset.jumpMail; state.view = "mail"; render(); }));
    $("#view").querySelectorAll("[data-goreports]").forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); state.view = "mod:reports"; render(); }));
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
  scope.querySelectorAll(".act-btn[data-act]").forEach((b) =>
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

// SE 업무유형·연결대상 라벨(분류 폼 + 배지)
const WORK_TYPE_LABELS = { answer: "답변", review: "검토", author: "작성", revise: "수정", purchase: "구매", verify: "확인", decide: "결정", schedule: "일정등록" };
const LINK_KIND_LABELS = { requirement: "요구사항", artifact: "산출물", meeting: "회의록", bom: "BOM", part: "부품", vendor: "업체", risk: "리스크" };
function itemLinkCell(i) {
  const se = [];
  if (i.work_type) se.push(`<span class="badge">${WORK_TYPE_LABELS[i.work_type] ?? i.work_type}</span>`);
  if (i.link_kind) se.push(`<span class="badge teal">${LINK_KIND_LABELS[i.link_kind] ?? i.link_kind}${i.link_ref ? `: ${esc(i.link_ref)}` : ""}</span>`);
  if (se.length) return se.join(" ");
  if (i.guide_artifact_name) return `<span class="badge">${esc(i.guide_stage_code)} ${esc(i.guide_artifact_name)}</span>`;
  if (i.origin === "mail") return `<span class="badge blue">${state.lex.origin_mail_badge}</span>`;
  return '<span class="dim">-</span>';
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
  const applyMine = mine && state.statusFilter !== "unclassified";
  const scoped = state.statusFilter !== "unclassified"; // 미분류함은 팀 공용
  const q = new URLSearchParams();
  if (state.projectFilter) q.set("project", state.projectFilter);
  if (state.statusFilter) q.set("status", state.statusFilter);
  if (useView && scoped) applyViewScope(q); else if (applyMine) q.set("mine", "1");
  const items = await api(`/api/items?${q}`);
  // 칩 count 는 상태 무관(과제+담당자 스코프)에서 계산 — 필터 걸려도 정확
  const baseQ = new URLSearchParams();
  if (state.projectFilter) baseQ.set("project", state.projectFilter);
  if (useView) applyViewScope(baseQ); else if (mine) baseQ.set("mine", "1");
  const allItems = (state.statusFilter || mine) ? await api(`/api/items?${baseQ}`) : items;
  const opts = projects.map((p) => `<option value="${p.id}" ${state.projectFilter === p.id ? "selected" : ""}>${p.title}</option>`).join("");
  const L = state.lex;
  // ECount식 상태 필터칩 (전체 + 각 상태). count 표시.
  const statuses = ["open", "doing", "waiting", "blocked", "done"];
  const statusCount = (s) => allItems.filter((i) => i.status === s).length;
  // 분류 필요(미분류) — 정식 목록에서 격리됨. SE 기준점 미연결 인입 할 일. 별도 조회로 개수.
  const triageQ = new URLSearchParams({ status: "unclassified" });
  if (state.projectFilter) triageQ.set("project", state.projectFilter);
  const triage = await api(`/api/items?${triageQ}`);
  // 보관함(소프트삭제된 할 일) — 별도 조회로 개수. 활성 목록엔 안 뜨지만 여기서 보고 복구 가능.
  const archivedQ = new URLSearchParams({ status: "archived" });
  if (state.projectFilter) archivedQ.set("project", state.projectFilter);
  const archived = await api(`/api/items?${archivedQ}`);
  const chip = (val, label, n, cls = "") =>
    `<button class="status-chip ${cls} ${state.statusFilter === val ? "on" : ""}" data-st="${val}">${label}${n != null ? ` <em>${n}</em>` : ""}</button>`;
  const chipsHtml = [chip("", L.all_label, allItems.length)]
    .concat(statuses.map((s) => chip(s, L[`status_${s}`], statusCount(s))))
    .concat(triage.length || state.statusFilter === "unclassified" ? [chip("unclassified", L.status_unclassified ?? "분류 필요", triage.length, "triage")] : [])
    .concat(archived.length || state.statusFilter === "archived" ? [chip("archived", L.status_archived ?? "보관함", archived.length, "archived-chip")] : [])
    .join("");
  const triageNote = state.statusFilter === "unclassified"
    ? `<div class="triage-note">${L.triage_note ?? "메일/요청에서 자동 추출됐지만 과제·단계·산출물 연결이 없는 임시 할 일입니다. 분류해야 정식 실행 목록에 들어갑니다."}</div>`
    : "";
  const rows = items.map((i) => state.itemEdit === i.id
    ? `<tr class="item-edit-row"><td colspan="7"><div class="item-edit">
        <input class="ie-title" value="${esc(i.title)}" placeholder="${L.col_title ?? "제목"}" />
        <input class="ie-due" type="date" value="${i.due ?? ""}" />
        <input class="ie-assignee" value="${esc(i.assignee_ref ?? "")}" placeholder="${L.col_assignee ?? "담당"}" size="10" />
        <button class="fav-chip active ie-save" data-i="${esc(i.id)}">${L.act_save ?? "저장"}</button>
        <button class="fav-chip ie-cancel">${L.act_cancel ?? "취소"}</button>
        <button class="fav-chip ie-del" data-i="${esc(i.id)}">${L.act_delete ?? "삭제"}</button>
      </div></td></tr>`
    : `<tr>
      <td>${esc(i.title)}${i.encounter_role === "boss" ? " 👑" : ""}</td>
      <td><span class="proj-link" data-hub="${esc(i.project_id)}">${esc(i.project_id)}</span></td>
      <td>${statusBadge(i.status)}</td>
      ${dueCell(i.due, todayKey)}
      <td>${esc(i.assignee_ref ?? "-")}</td>
      <td>${itemLinkCell(i)}</td>
      <td class="acts">${i.status === "archived"
        ? `<button class="act-btn restore-btn" data-restore="${esc(i.id)}">${L.act_restore ?? "복구"}</button>`
        : `${itemActionsHtml(i)}<button class="act-btn edit" data-edit="${esc(i.id)}">${L.act_edit ?? "수정"}</button>`}</td>
    </tr>`).join("");
  const isTriage = state.statusFilter === "unclassified";
  const isArchived = state.statusFilter === "archived";
  // 분류 카드는 항목의 기존값(메일/LLM 제안·결정적 SE단계)을 pre-fill → 사람은 확인만. (코어 LLM 0%: LLM은 제안, 확정은 사람)
  const optsSel = (labels, sel) => Object.entries(labels).map(([k, v]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${v}</option>`).join("");
  const triageBody = !isTriage ? "" : (items.length
    ? `<div class="classify-list">${items.map((i) => {
        const suggested = !!(i.work_type || i.completion_criteria); // 제안값이 채워져 옴
        return `<div class="classify-card" data-id="${esc(i.id)}">
        <div class="cc-head"><span class="cc-title">${esc(i.title)}</span><span class="proj-link label-chip" data-hub="${esc(i.project_id)}">${esc(i.project_id)}</span>
          ${suggested ? `<span class="badge mini">${L.cls_suggested ?? "제안"}</span>` : ""}${i.anchor_stage_code ? `<span class="dim mini">SE ${esc(i.anchor_stage_code)}</span>` : ""}</div>
        <div class="cc-form">
          <select class="cc-wt"><option value="">${L.cls_work_type ?? "업무유형"}…</option>${optsSel(WORK_TYPE_LABELS, i.work_type)}</select>
          <select class="cc-lk"><option value="">${L.cls_link_kind ?? "연결대상"}…</option>${optsSel(LINK_KIND_LABELS, i.link_kind)}</select>
          <input class="cc-ref" placeholder="${L.cls_link_ref ?? "연결 대상(산출물/BOM/업체…)"}" value="${esc(i.link_ref ?? "")}" />
          <input class="cc-cc" placeholder="${L.cls_completion ?? "완료기준(무엇을 하면 닫히나)"}" value="${esc(i.completion_criteria ?? "")}" />
          <button class="fav-chip cc-go">${L.cls_confirm ?? "정식 등록"}</button><span class="cc-msg dim"></span>
        </div></div>`; }).join("")}</div>`
    : `<div class="empty">${L.cls_none ?? "분류할 항목 없음"}</div>`);
  $("#view").innerHTML = `
    <div class="filters">
      <select id="fProject"><option value="">${L.project}: ${L.all_label}</option>${opts}</select>
      ${useView ? `<label class="view-scope-lab">${L.view_scope ?? "보기 대상"} ${viewSelectHtml(L)}</label>`
        : (state.account ? `<button id="mineToggle" class="fav-chip ${mine ? "on" : ""}" title="${L.mine_hint ?? ""}">${mine ? L.mine_only : L.mine_all}</button>` : "")}
    </div>
    <div class="status-chips">${chipsHtml}</div>
    ${triageNote}
    ${isArchived ? `<div class="triage-note">${L.archived_note ?? "보관(삭제)된 할 일입니다. '복구'를 누르면 활성 목록으로 되돌아갑니다. 이력은 event_log에 그대로 남습니다."}</div>` : ""}
    ${(isTriage || isArchived) ? "" : `<div class="item-form">
      <select id="niProject">${opts || `<option value="">${L.project}</option>`}</select>
      <input id="niTitle" placeholder="${L.item_new_ph}" />
      <input id="niAssignee" placeholder="${L.assignee_ph}" size="9" value="${esc(state.account?.display_name || state.account?.username || "")}" />
      <input id="niDue" type="date" />
      <button id="niAdd" class="fav-chip">${L.item_add}</button>
    </div>`}
    ${isTriage ? triageBody : (rows ? `<table><thead><tr><th>${L.item}</th><th>${L.project}</th><th>${L.th_status}</th><th>${L.th_due}</th><th>${L.th_assignee}</th><th>${L.tab_guide}</th><th>${L.th_actions}</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">${L.empty_items}</div>`)}`;
  $("#fProject").addEventListener("change", (e) => { state.projectFilter = e.target.value; render(); });
  wireViewSelect();
  $("#mineToggle")?.addEventListener("click", () => {
    state.mineOnly = !state.mineOnly;
    localStorage.setItem("dev_erp_mine", state.mineOnly ? "1" : "0");
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
      const res = await post("/api/items/confirm", body);
      if (res.ok) { render(); return; }
      const err = await res.json().catch(() => ({}));
      card.querySelector(".cc-msg").textContent = err.error === "needs_se_anchor"
        ? (L.cls_need ?? "업무유형 + 연결대상(또는 단계)이 있어야 정식 등록됩니다") : (err.error ?? "등록 실패");
    });
  });
  $("#view").querySelectorAll(".status-chip").forEach((c) =>
    c.addEventListener("click", () => { state.statusFilter = c.dataset.st || ""; render(); })
  );
  $("#view").querySelectorAll("[data-hub]").forEach((c) =>
    c.addEventListener("click", () => { state.hubProject = c.dataset.hub; state.hubTab = "overview"; state.view = "project"; render(); })
  );
  wireItemActions($("#view"));
  wireItemEdit($("#view"));
}

// F2: 할 일 인라인 수정(제목·마감·담당) + 소프트삭제. 재배정은 기존 /api/items/assign 연결.
function wireItemEdit(scope) {
  scope.querySelectorAll(".edit[data-edit]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); state.itemEdit = b.dataset.edit; render(); })
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
  if (!projectId || cls === "inbox") return `<span class="label-chip gray">${state.lex.unlabeled}</span>`;
  return `<span class="label-chip" style="--lc:${projColor(projectId)}" data-lp="${esc(projectId)}">${esc(projectId)}</span>`;
}

async function renderMail() {
  const L = state.lex;
  await ensureScopes();
  const f = state.mailFilters ?? (state.mailFilters = { days: 90, direction: "", q: "", label: null });
  const params = new URLSearchParams({ days: String(f.days) });
  if (state.projectFilter) params.set("project", state.projectFilter);
  if (f.q) params.set("q", f.q);
  if (f.direction) params.set("direction", f.direction);
  if (f.label) params.set("label_id", String(f.label));
  applyViewScope(params); // 보기 대상(계정 메일함)별 메일 이력
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
    ${showViewScope() ? `<label class="view-scope-lab">${L.view_scope ?? "보기 대상"} ${viewSelectHtml(L)}</label>` : ""}
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
        : sel.project_id
          ? `<button id="promoteBtn" class="fav-chip">${L.promote_item}</button>`
          : `<span class="dim">${L.promote_need_project ?? "과제로 분류 후 할 일로 승격"}</span>`}</div>
      <h4>${L.assign_to}</h4>
      <div class="assign-bar inline">
        <select id="assignOne">${assignOpts}</select>
        <button id="assignOneGo" class="fav-chip">${L.assign_btn}</button>
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
      <button id="mrAdd" class="fav-chip active">${L.mail_reg_add ?? "등록"}</button>
    </div>
    <p class="hub-note">${L.mail_reg_note ?? "메일 본문은 저장 안 함 — 제목·상대·날짜·포인터만. 등록 후 분류해 할 일로 승격."}</p>
  </details>`;
  $("#view").innerHTML = `${labelBar}${filterChips}${toolbar}${regForm}${bulkBar}
    <div class="mail-split">${rows ? `<table class="mail-table"><tbody>${rows}</tbody></table>` : `<div class="empty">${L.empty_mail}</div>`}${detail}</div>`;

  $("#view").querySelector(".mail-reg")?.addEventListener("toggle", (e) => { state.mailRegOpen = e.target.open; });
  $("#mrAdd")?.addEventListener("click", async () => {
    const subject = $("#mrSubject").value.trim();
    if (!subject) return;
    const body = { subject, direction: $("#mrDir").value || "in" };
    if ($("#mrFrom").value.trim()) body.counterpart = $("#mrFrom").value.trim();
    if ($("#mrDate").value) body.at = $("#mrDate").value;
    if ($("#mrProject").value) body.project_id = $("#mrProject").value;
    if ($("#mrPtr").value.trim()) body.pointer_ref = $("#mrPtr").value.trim();
    const r = await post("/api/mail", body);
    if (r.ok) { state.mailRegOpen = true; render(); }
  });
  $("#mDays").addEventListener("change", (e) => { f.days = Number(e.target.value); render(); });
  $("#mDir").addEventListener("change", (e) => { f.direction = e.target.value; render(); });
  $("#mSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") { f.q = e.target.value; render(); } });
  wireViewSelect();
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
    const r = await post("/api/items/promote", { mail_id: state.mailSel });
    if (r.ok) {
      (state._promotedMails ??= new Set()).add(state.mailSel);
    } else {
      const e = await r.json().catch(() => ({}));
      alert(e.error === "mail_project_missing" ? (L.promote_need_project ?? "먼저 메일을 과제로 분류하세요")
        : e.error === "already_promoted" ? (L.promote_already ?? "이미 할 일로 등록된 메일입니다")
        : (e.error || "승격 실패"));
    }
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
      <td><span class="badge mini">${esc(e.kind)}</span></td>
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
  const items = data.items.map((i) => `<tr><td>${esc(i.title)}</td><td>${esc(i.project_id)}</td><td>${statusBadge(i.status)}</td><td>${i.due ?? "-"}</td></tr>`).join("");
  const mail = data.mail.map((m) => `<tr><td>${m.at.slice(0, 10)}</td><td>${esc(m.subject)}</td><td>${esc(m.counterpart ?? "-")}</td></tr>`).join("");
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
    </div>
    <div id="hubBody"></div>`;
  $("#hubBack").addEventListener("click", () => { state.view = "home"; render(); });
  $("#view").querySelectorAll(".hub-tab").forEach((b) =>
    b.addEventListener("click", () => { state.hubTab = b.dataset.tab; render(); })
  );
  const mount = $("#hubBody");
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
        <td>${esc(i.title)}${i.completion_criteria ? `<div class="cc-hint">✓ ${esc(i.completion_criteria)}</div>` : ""}</td>
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
        <td>${esc(r.title)}</td><td><span class="status-chip s-${r.score >= 70 ? "risk" : r.score >= 40 ? "watch" : "ok"}">${Math.round(r.score ?? 0)}</span></td><td class="dim">${esc(r.due ?? "-")}</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty">${L.hub_no_risk ?? "위험 항목 없음"}</div>`;
}
async function hubRequirements(mount, p) {
  const L = state.lex;
  const f = await api(`/api/inputs/fulfillment?project=${encodeURIComponent(p.id)}`);
  mount.innerHTML = (f ?? []).length
    ? `<p class="hub-note">${L.req_note ?? "산출물별 필수 입력(요구사항) 충족 현황."}</p><table><thead><tr><th>${L.req_scope ?? "산출물"}</th><th>${L.req_need ?? "필요"}</th><th>${L.req_have ?? "충족"}</th><th></th></tr></thead><tbody>${f.map((d) => `<tr>
        <td>${esc(d.scope_key)}</td><td class="dim num">${d.required ?? d.need ?? "-"}</td><td class="dim num">${d.have ?? d.fulfilled_count ?? "-"}</td><td>${d.fulfilled ? `<span class="badge green">✓</span>` : `<span class="status-chip s-watch">${L.req_partial ?? "미충족"}</span>`}</td></tr>`).join("")}</tbody></table>`
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
  const [mail, items] = await Promise.all([
    api(`/api/mail?project=${encodeURIComponent(p.id)}&days=3650`), // 과제 장부 전체(연단위) — 1년 컷 금지
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
  const [data, risks, props] = await Promise.all([api("/api/gates"), api("/api/risk"), api("/api/proposals")]);
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
        : `<span class="dim">${L.req_need_project ?? "과제 연결 필요"}</span>`)}</td>
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
  if (state.view === "mod:reports") {
    const m = (state.modules ?? []).find((x) => x.id === "reports");
    $("#viewTitle").textContent = m?.nav ?? "보고서";
    logView(state.view);
    return renderReports();
  }
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

// 🕘 타임라인 — 최근 활동(event_log) 드롭다운.
async function openTimeline() {
  const dd = showTopDropdown("timelineBtn", `<div class="dd-head">타임라인 · 최근 활동</div><div class="dd-loading dim">불러오는 중…</div>`);
  if (!dd) return;
  let evs = []; try { evs = await api("/api/events/recent?limit=30"); } catch {}
  if (!document.body.contains(dd)) return;
  const rows = evs.length
    ? evs.map((e) => `<div class="tl-row"><span class="tl-time dim">${localTime(e.at)}</span>
        <span class="badge">${esc(e.kind)}</span>
        <span class="tl-body">${esc(e.actor_ref ?? "")}${e.to_val ? ` · ${esc(String(e.to_val)).slice(0, 40)}` : ""}</span></div>`).join("")
    : `<div class="empty small">최근 활동 없음</div>`;
  dd.innerHTML = `<div class="dd-head">타임라인 · 최근 활동</div>${rows}`;
}
$("#timelineBtn")?.addEventListener("click", openTimeline);

// 🔔 알림 — 봐야 할 것 집계(대기 제안·차단/연체 할일·막힌 게이트·품절 부품). 전부 기존 API.
async function loadNotifications() {
  const today = new Date().toISOString().slice(0, 10);
  const [props, blocked, allItems, gates, low] = await Promise.all([
    api("/api/proposals").catch(() => []),
    api("/api/items?status=blocked").catch(() => []),
    api("/api/items").catch(() => []),
    api("/api/gates").catch(() => ({ stages: [] })),
    api("/api/stock/low").catch(() => []),
  ]);
  const overdue = (allItems || []).filter((i) => i.due && i.due < today && i.status !== "done");
  const heldGates = (gates.stages || []).filter((s) => s.status !== "cleared" && !s.passable);
  const groups = [
    { label: "승인 대기 제안", n: props.length, view: "mod:proposals" },
    { label: "차단된 할 일", n: blocked.length, view: "items" },
    { label: "연체 할 일", n: overdue.length, view: "items" },
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
    ? groups.map((g) => `<div class="nt-group" data-go="${g.view}"><span class="nt-cnt">${g.n}</span><span class="nt-label">${g.label}</span><span class="dim">→</span></div>`).join("")
    : `<div class="empty small">새 알림 없음</div>`;
  dd.innerHTML = `<div class="dd-head">알림 (${total})</div>${body}`;
  dd.querySelectorAll(".nt-group").forEach((g) => g.addEventListener("click", () => { closeTopDropdowns(); state.view = g.dataset.go; render(); }));
}
$("#notifBtn")?.addEventListener("click", openNotifications);

await loadMe();
await loadLexicon(); // 게이트 라벨에도 필요 — 인증 분기보다 먼저
if (!state.account) {
  // 인증 벽: 미로그인이면 앱 대신 첫 페이지(달빛 길드 입성)만 보인다. '무조건 회원가입해야 보임'.
  renderGate();
} else {
  await pullServerLayout();
  render();
  refreshNotifBadge(); // 🔔 알림 배지 초기 집계
}
