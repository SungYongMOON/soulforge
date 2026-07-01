// src/mail_collect.mjs — 메일 수집 오케스트레이션.
//   웹서버는 직접 외부접속하지 않는다(no_server_egress). 수집·인입은 모두 자식 프로세스가 한다.
//   흐름: ① export_team_mailboxes 로 팀 등록부 갱신(현재 활성 메일함 반영 — 신규 팀원 자동 포함)
//        ② team_cli 로 등록부의 메일함을 fetch. team_cli 는 메일마다 owner 메타(metadata.mailbox=
//           {email, display_name, account_id})를 붙여, 원장 '메일함' 컬럼이 계정 이메일이 된다
//           (단일 cli.py 는 owner 메타가 없어 company_mailbox 로 떨어짐 → 개인별 뷰 안 됨).
//        ③ scan_mail_ledger 로 원장 → core_mail 인입.
//        ④ mail_project_route_backfill 로 P00 exact 프로젝트 라우팅 반영.
//   수동 버튼(/api/mail/collect)과 자동 인터벌(DEV_ERP_MAIL_COLLECT_SEC)이 같은 경로를 쓴다.
//   원문 미노출: 요약은 건수만(제목·발신자 등 업무 원문 없음).
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
const execFileP = promisify(execFile);

let collecting = false; // 동시/중복 수집 방지(자동+수동 겹침 차단)
export function isCollecting() { return collecting; }

function pyBin() { return process.platform === "win32" ? "python" : "python3"; }

function parseJsonLoose(stdout) {
  try { return JSON.parse(stdout); } catch { const m = String(stdout).match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch { /* noop */ } } }
  return null;
}

function parseTeamFetchSummary(stdout) {
  const j = parseJsonLoose(stdout);
  if (!j) return { error: "parse_error" };
  if (j.error) return { error: j.error.code || j.error.message || "team_cli_error" };
  const results = Array.isArray(j.results) ? j.results : (Array.isArray(j.mailboxes) ? j.mailboxes : []);
  let fetched = 0, newEvents = 0;
  for (const r of results) {
    const src = (Array.isArray(r?.sources) ? r.sources[0] : null) || r || {};
    fetched += Number(src.fetched ?? r?.fetched ?? 0);
    newEvents += Number(src.new_events ?? r?.new_events ?? 0);
  }
  return { mailboxes_run: j.mailboxes_run ?? results.length, fetched, new_events: newEvents };
}

function parseIngestSummary(stdout) {
  const m = String(stdout).match(/메일\s+(\d+)\s*건\s*ingest\(신규\s+(\d+)/);
  return m ? { ingested: Number(m[1]), new: Number(m[2]) } : { raw: "ok" };
}

function truthyEnv(name) {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function routeBindingPath(repoRoot) {
  const explicit = String(process.env.DEV_ERP_MAIL_PROJECT_ROUTER_BINDING || "").trim();
  if (explicit) return resolve(explicit);
  const localBinding = resolve(repoRoot, "_workmeta", "system", "bindings", "mail_project_router.yaml");
  if (existsSync(localBinding)) return localBinding;
  const siblingSourceBinding = resolve(repoRoot, "..", "Soulforge", "_workmeta", "system", "bindings", "mail_project_router.yaml");
  return existsSync(siblingSourceBinding) ? siblingSourceBinding : "";
}

export function mailRouteBackfillConfig({ repoRoot = process.cwd() } = {}) {
  const explicitEnabled = String(process.env.DEV_ERP_MAIL_ROUTE_BACKFILL || "").trim() !== "";
  const explicitBinding = String(process.env.DEV_ERP_MAIL_PROJECT_ROUTER_BINDING || "").trim() !== "";
  const binding = routeBindingPath(repoRoot);
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

// store: dev-erp Store. repoRoot: soulforge root(수집기·등록부 cwd). appDir: dev-erp 앱 dir(도구 cwd). dbRel: --db 경로.
export async function collectAllMailboxes(store, { repoRoot, appDir, dbRel = "data/dev-erp.db", fetchTimeoutMs = 180000, ingestTimeoutMs = 60000, routeBackfillTimeoutMs = 60000, log = () => {} } = {}) {
  if (collecting) return { ok: false, error: "already_collecting" };
  collecting = true;
  const started = Date.now();
  const py = pyBin();
  const result = { ok: true, register: null, fetch: null, ingest: null, errors: [] };
  try {
    // 활성·메일함 enabled 계정이 없으면 자식 프로세스 없이 조기반환.
    const accts = store.listAccounts().filter((a) =>
      a.status === "active" && a.mailbox_enabled && a.mailbox_provider && a.mailbox_provider !== "none" && a.mailbox_env_ref);
    if (!accts.length) { result.note = "no_enabled_mailbox"; return result; }

    // ① 팀 등록부 갱신(현재 활성 메일함 반영)
    try {
      await execFileP("node", ["tools/export_team_mailboxes.mjs", "--db", dbRel, "--apply"],
        { cwd: appDir, timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
      result.register = "refreshed";
    } catch (e) { result.register = { error: String(e?.message || e).slice(0, 160) }; result.errors.push("register"); }

    // ② team_cli 로 전체 메일함 fetch(메일별 owner 메타 부착)
    try {
      const { stdout } = await execFileP(py, ["guild_hall/gateway/mail_fetch/team_cli.py", "--once", "--json"],
        { cwd: repoRoot, timeout: fetchTimeoutMs, maxBuffer: 8 * 1024 * 1024 });
      result.fetch = parseTeamFetchSummary(stdout);
      if (result.fetch?.error) result.errors.push("fetch");
    } catch (e) { result.fetch = { error: String(e?.message || e).slice(0, 160) }; result.errors.push("fetch"); }

    // ③ 원장 → core_mail 인입
    try {
      const { stdout } = await execFileP("node", ["tools/scan_mail_ledger.mjs", "--apply", "--db", dbRel],
        { cwd: appDir, timeout: ingestTimeoutMs, maxBuffer: 8 * 1024 * 1024 });
      result.ingest = parseIngestSummary(stdout);
    } catch (e) { result.ingest = { error: String(e?.message || e).slice(0, 160) }; result.errors.push("ingest"); }

    // ④ P00에 들어온 메일을 프로젝트 라우터 규칙으로 exact backfill.
    // hint와 private-deep은 오분류 위험이 있어 env로 명시할 때만 켠다.
    const routeCfg = mailRouteBackfillConfig({ repoRoot });
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
    result.elapsed_ms = Date.now() - started;
    log(`[mail-collect] register=${JSON.stringify(result.register)} fetch=${JSON.stringify(result.fetch)} ingest=${JSON.stringify(result.ingest)} route_backfill=${JSON.stringify(result.route_backfill)} ${result.elapsed_ms}ms`);
    return result;
  } finally {
    collecting = false;
  }
}
