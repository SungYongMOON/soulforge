// src/mail_collect.mjs — 메일 수집 오케스트레이션.
//   웹서버는 직접 외부접속하지 않는다(no_server_egress). 수집·인입은 모두 자식 프로세스가 한다.
//   흐름: ① export_team_mailboxes 로 팀 등록부 갱신(현재 활성 메일함 반영 — 신규 팀원 자동 포함)
//        ② team_cli 로 등록부의 메일함을 fetch. team_cli 는 메일마다 owner 메타(metadata.mailbox=
//           {email, display_name, account_id})를 붙여, 원장 '메일함' 컬럼이 계정 이메일이 된다
//           (단일 cli.py 는 owner 메타가 없어 company_mailbox 로 떨어짐 → 개인별 뷰 안 됨).
//        ③ scan_mail_ledger 로 원장 → core_mail 인입.
//        ④ mail_project_route_backfill 로 P00 exact 프로젝트 라우팅 반영.
//   수동 버튼(/api/mail/collect)과 자동 인터벌(DEV_ERP_MAIL_COLLECT_SEC)이 같은 경로를 쓴다.
//   legacy writer 는 DEV_ERP_LEGACY_MAIL_WRITER_ENABLED=1 명시 opt-in 없이는 실행하지 않는다.
//   원문 미노출: 요약은 건수만(제목·발신자 등 업무 원문 없음).
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
const execFileP = promisify(execFile);

let collecting = false; // 동시/중복 수집 방지(자동+수동 겹침 차단)
export function isCollecting() { return collecting; }

export function legacyMailWriterPolicy(env = process.env) {
  const enabled = env.DEV_ERP_LEGACY_MAIL_WRITER_ENABLED === "1";
  return { enabled, reason: enabled ? "explicitly_enabled" : "legacy_mail_writer_disabled" };
}

function pyBin() { return process.platform === "win32" ? "python" : "python3"; }

function parseJsonLoose(stdout) {
  try { return JSON.parse(stdout); } catch { const m = String(stdout).match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch { /* noop */ } } }
  return null;
}

export function parseTeamFetchSummary(stdout) {
  const j = parseJsonLoose(stdout);
  if (!j) return { error: "parse_error" };
  if (j.error) return { error: j.error.code || j.error.message || "team_cli_error" };
  const results = Array.isArray(j.results) ? j.results : (Array.isArray(j.mailboxes) ? j.mailboxes : []);
  let fetched = 0, newEvents = 0, mailboxesError = 0;
  const perMailbox = [];
  for (const r of results) {
    // team_cli(email.fetch.team_mailbox_run.v1)는 results[]={mailbox, result:{sources[],partial,errors[]}}.
    // 종전 파서는 r.sources 를 읽어 실값과 무관하게 항상 0 이었다(3주 침묵 표시버그). 구형 flat 형태도 계속 수용.
    const run = (r && typeof r === "object" && r.result && typeof r.result === "object") ? r.result : (r ?? {});
    const sources = Array.isArray(run.sources) ? run.sources : [];
    const f = sources.length ? sources.reduce((a, s) => a + Number(s?.fetched ?? 0), 0) : Number(run.fetched ?? 0);
    const n = sources.length ? sources.reduce((a, s) => a + Number(s?.new_events ?? 0), 0) : Number(run.new_events ?? 0);
    const errCount = Array.isArray(run.errors) ? run.errors.length : 0;
    const partial = Boolean(run.partial);
    if (partial || errCount) mailboxesError += 1;
    fetched += f;
    newEvents += n;
    perMailbox.push({ id: String(r?.mailbox?.id ?? r?.id ?? ""), fetched: f, new_events: n, partial, errors: errCount });
  }
  return { mailboxes_run: j.mailboxes_run ?? results.length, fetched, new_events: newEvents, mailboxes_error: mailboxesError, per_mailbox: perMailbox };
}

// 등록부 id(export_team_mailboxes 의 safeToken(계정 id, email))와 같은 규칙 — 계정 매핑용.
export function mailboxRegisterToken(raw, fallback) {
  const clean = (s) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").replace(/^[_\-.]+|[_\-.]+$/g, "").slice(0, 80);
  return clean(raw) || clean(fallback) || "mailbox";
}

function parseIngestSummary(stdout) {
  const m = String(stdout).match(/메일\s+(\d+)\s*건\s*ingest\(신규\s+(\d+)/);
  return m ? { ingested: Number(m[1]), new: Number(m[2]) } : { raw: "ok" };
}

function truthyEnv(name) {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function routeBindingPath(repoRoot, backendRoot = repoRoot) {
  const explicit = String(process.env.DEV_ERP_MAIL_PROJECT_ROUTER_BINDING || "").trim();
  if (explicit) return resolve(explicit);
  const backendBinding = resolve(backendRoot || repoRoot, "_workmeta", "system", "bindings", "mail_project_router.yaml");
  if (existsSync(backendBinding)) return backendBinding;
  const localBinding = resolve(repoRoot, "_workmeta", "system", "bindings", "mail_project_router.yaml");
  if (existsSync(localBinding)) return localBinding;
  const siblingSourceBinding = resolve(repoRoot, "..", "Soulforge", "_workmeta", "system", "bindings", "mail_project_router.yaml");
  return existsSync(siblingSourceBinding) ? siblingSourceBinding : "";
}

export function mailRouteBackfillConfig({ repoRoot = process.cwd(), backendRoot = repoRoot } = {}) {
  const explicitEnabled = String(process.env.DEV_ERP_MAIL_ROUTE_BACKFILL || "").trim() !== "";
  const explicitBinding = String(process.env.DEV_ERP_MAIL_PROJECT_ROUTER_BINDING || "").trim() !== "";
  const binding = routeBindingPath(repoRoot, backendRoot);
  const enabled = truthyEnv("DEV_ERP_MAIL_ROUTE_BACKFILL") || explicitBinding || (!explicitEnabled && !!binding);
  if (!enabled) return { enabled: false, required: explicitEnabled || explicitBinding, reason: "disabled" };
  if (!binding || !existsSync(binding)) return { enabled: false, required: true, reason: "binding_missing" };
  return {
    enabled: true,
    binding,
    includeHidden: truthyEnv("DEV_ERP_MAIL_ROUTE_BACKFILL_INCLUDE_HIDDEN"),
    includeHint: truthyEnv("DEV_ERP_MAIL_ROUTE_BACKFILL_INCLUDE_HINT"),
    privateDeep: truthyEnv("DEV_ERP_MAIL_ROUTE_BACKFILL_PRIVATE_DEEP"),
  };
}

export function buildAutoIntakeArgs({ dbRel = "data/dev-erp.db", workmetaRoot, projects = [] } = {}) {
  const args = ["tools/auto_intake_cycle.mjs", "--db", dbRel, "--apply", "--json"];
  if (workmetaRoot) args.push("--workmeta", workmetaRoot);
  for (const project of projects) if (project) args.push("--project", project);
  return args;
}

export function teamMailboxRegisterPath({ repoRoot = process.cwd(), env = process.env } = {}) {
  const explicit = String(env.EMAIL_FETCH_TEAM_REGISTER || "").trim();
  if (explicit) return resolve(repoRoot, explicit);
  const privateRoot = String(env.EMAIL_FETCH_PRIVATE_CONFIG_ROOT || "").trim();
  if (!privateRoot) return "";
  return resolve(repoRoot, privateRoot, "guild_hall", "state", "gateway", "mailbox", "state", "team_mailboxes.json");
}

function parseRouteBackfillSummary(stdout) {
  const j = parseJsonLoose(stdout);
  if (!j) return { raw: "ok" };
  return {
    scanned: Number(j.scanned ?? 0),
    matched: Number(j.matched ?? 0),
    moved: Number(j.moved ?? 0),
    skipped: j.skipped || {},
    by_project: j.by_project || {},
    by_rule: j.by_rule || {},
    errors: Array.isArray(j.errors) ? j.errors : [],
  };
}

// ⑤ 수집 후 자동 인입(opt-in): pending→LLM분류→할일_장부→줄기(project_context) 갱신.
//    DEV_ERP_AUTO_INTAKE=1 로 켠다. LLM 재판단 비용을 줄이기 위해 신규 유입이 있을 때만 돌리고,
//    DEV_ERP_AUTO_INTAKE_ALWAYS=1 이면 항상 돌린다. 실패는 수집 성공/실패와 분리(베스트에포트 후속 단계).
export function autoIntakeConfig(env = process.env) {
  return {
    enabled: (() => { const v = String(env.DEV_ERP_AUTO_INTAKE ?? "").trim().toLowerCase(); return v === "1" || v === "true" || v === "yes" || v === "on"; })(),
    always: (() => { const v = String(env.DEV_ERP_AUTO_INTAKE_ALWAYS ?? "").trim().toLowerCase(); return v === "1" || v === "true" || v === "yes" || v === "on"; })(),
  };
}

export function shouldRunAutoIntake(result, cfg = autoIntakeConfig()) {
  if (!cfg.enabled) return false;
  if (cfg.always) return true;
  const newMail = Number(result?.fetch?.new_events ?? 0) + Number(result?.ingest?.new ?? 0) + Number(result?.route_backfill?.moved ?? 0);
  return newMail > 0;
}

// store: dev-erp Store. repoRoot: soulforge root(수집기·등록부 cwd). appDir: dev-erp 앱 dir(도구 cwd). dbRel: --db 경로.
export async function collectAllMailboxes(store, { repoRoot, backendRoot = repoRoot, appDir, dbRel = "data/dev-erp.db", projects = [], fetchTimeoutMs = 180000, ingestTimeoutMs = 60000, routeBackfillTimeoutMs = 60000, autoIntakeTimeoutMs = 300000, log = () => {} } = {}) {
  if (collecting) return { ok: false, error: "already_collecting" };
  collecting = true;
  const started = Date.now();
  const py = pyBin();
  const workmetaRoot = resolve(backendRoot || repoRoot || process.cwd(), "_workmeta");
  const result = { ok: true, register: null, fetch: null, ingest: null, errors: [] };
  try {
    // 활성·메일함 enabled 계정이 없으면 자식 프로세스 없이 조기반환.
    const accts = store.listAccounts().filter((a) =>
      a.status === "active" && a.mailbox_enabled && a.mailbox_provider && a.mailbox_provider !== "none" && a.mailbox_env_ref);
    if (!accts.length) { result.note = "no_enabled_mailbox"; return result; }
    const writerPolicy = legacyMailWriterPolicy();
    if (!writerPolicy.enabled) return { ok: false, error: writerPolicy.reason };

    // ① 팀 등록부 갱신(현재 활성 메일함 반영)
    try {
      const exportArgs = ["tools/export_team_mailboxes.mjs", "--db", dbRel, "--apply"];
      const registerPath = teamMailboxRegisterPath({ repoRoot });
      if (registerPath) exportArgs.push("--out", registerPath);
      await execFileP("node", exportArgs,
        { cwd: appDir, timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
      result.register = "refreshed";
    } catch (e) { result.register = { error: String(e?.message || e).slice(0, 160) }; result.errors.push("register"); }

    // ② team_cli 로 전체 메일함 fetch(메일별 owner 메타 부착)
    try {
      const { stdout } = await execFileP(py, ["guild_hall/gateway/mail_fetch/team_cli.py", "--once", "--json"],
        { cwd: repoRoot, timeout: fetchTimeoutMs, maxBuffer: 8 * 1024 * 1024 });
      result.fetch = parseTeamFetchSummary(stdout);
      if (result.fetch?.error) result.errors.push("fetch");
      // 계정별 마지막 수집 시각/상태 반영(관리자 패널 '마지막 수집' 표시·에러 가시화).
      // 매핑은 email 이 아니라 등록부 token(safeToken(계정 id)) 기준 — operator_summary 에 email 이 없다.
      if (Array.isArray(result.fetch?.per_mailbox)) {
        const byToken = new Map(accts.map((a) => [mailboxRegisterToken(a.id, a.email), a]));
        const fetchedAt = new Date().toISOString();
        for (const m of result.fetch.per_mailbox) {
          const acct = byToken.get(String(m.id ?? ""));
          if (!acct) continue;
          const failed = m.partial || m.errors > 0;
          store.updateAccountMailbox(acct.id, {
            last_fetch_at: fetchedAt,
            status: failed ? "error" : "ok",
            last_error: failed ? `partial=${m.partial} errors=${m.errors}` : "",
          });
        }
      }
    } catch (e) { result.fetch = { error: String(e?.message || e).slice(0, 160) }; result.errors.push("fetch"); }

    // ③ 원장 → core_mail 인입
    try {
      const { stdout } = await execFileP("node", ["tools/scan_mail_ledger.mjs", "--apply", "--db", dbRel, "--workmeta", workmetaRoot],
        { cwd: appDir, timeout: ingestTimeoutMs, maxBuffer: 8 * 1024 * 1024 });
      result.ingest = parseIngestSummary(stdout);
    } catch (e) { result.ingest = { error: String(e?.message || e).slice(0, 160) }; result.errors.push("ingest"); }

    // ④ P00에 들어온 메일을 프로젝트 라우터 규칙으로 exact backfill.
    // hint와 private-deep은 오분류 위험이 있어 env로 명시할 때만 켠다.
    const routeCfg = mailRouteBackfillConfig({ repoRoot, backendRoot });
    if (routeCfg.enabled) {
      try {
        const args = ["tools/mail_project_route_backfill.mjs", "--apply", "--db", dbRel, "--repo-root", repoRoot, "--binding", routeCfg.binding, "--json"];
        if (routeCfg.includeHidden) args.push("--include-hidden");
        if (routeCfg.includeHint) args.push("--include-hint");
        if (routeCfg.privateDeep) args.push("--private-deep");
        const { stdout } = await execFileP("node", args,
          { cwd: appDir, timeout: routeBackfillTimeoutMs, maxBuffer: 8 * 1024 * 1024 });
        result.route_backfill = parseRouteBackfillSummary(stdout);
        if (result.route_backfill.errors?.length) result.errors.push("route_backfill");
      } catch (e) {
        result.route_backfill = { error: String(e?.message || e).slice(0, 160) };
        result.errors.push("route_backfill");
      }
    } else {
      result.route_backfill = routeCfg.required ? { error: routeCfg.reason } : { skipped: routeCfg.reason };
      if (routeCfg.required) result.errors.push("route_backfill");
    }

    result.ok = result.errors.length === 0;

    // ⑤ 자동 인입 사이클(opt-in, 베스트에포트 — 실패해도 수집 결과(ok)는 바꾸지 않는다)
    if (shouldRunAutoIntake(result)) {
      try {
        const { stdout } = await execFileP("node", buildAutoIntakeArgs({ dbRel, workmetaRoot, projects }),
          { cwd: appDir, timeout: autoIntakeTimeoutMs, maxBuffer: 8 * 1024 * 1024 });
        result.auto_intake = parseJsonLoose(stdout) ?? { raw: "ok" };
      } catch (e) {
        result.auto_intake = { error: String(e?.message || e).slice(0, 160) };
      }
    } else if (autoIntakeConfig().enabled) {
      result.auto_intake = { skipped: "no_new_mail" };
    }

    result.elapsed_ms = Date.now() - started;
    log(`[mail-collect] register=${JSON.stringify(result.register)} fetch=${JSON.stringify(result.fetch)} ingest=${JSON.stringify(result.ingest)} route_backfill=${JSON.stringify(result.route_backfill)} auto_intake=${JSON.stringify(result.auto_intake ?? null)} ${result.elapsed_ms}ms`);
    return result;
  } finally {
    collecting = false;
  }
}
