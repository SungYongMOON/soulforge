// src/mail_collect.mjs — 메일 수집 오케스트레이션.
//   웹서버는 직접 외부접속하지 않는다(no_server_egress). 활성·메일함 enabled 계정마다
//   수집기(자식 프로세스, guild_hall/gateway/mail_fetch/cli.py)를 실행해 egress 는 자식이 하고,
//   이어서 scan_mail_ledger 로 원장 → core_mail 인입(역시 자식 프로세스).
//   수동 버튼(/api/mail/collect)과 자동 인터벌(DEV_ERP_MAIL_COLLECT_SEC)이 같은 경로를 쓴다.
//   원문 미노출: 요약은 건수만(제목·발신자 등 업무 원문 없음).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileP = promisify(execFile);

let collecting = false; // 동시/중복 수집 방지(자동+수동 겹침 차단)
export function isCollecting() { return collecting; }

function pyBin() { return process.platform === "win32" ? "python" : "python3"; }

function parseFetchSummary(stdout) {
  let j = null;
  try { j = JSON.parse(stdout); } catch { const m = String(stdout).match(/\{[\s\S]*\}/); if (m) { try { j = JSON.parse(m[0]); } catch { /* noop */ } } }
  if (!j) return { fetched: 0, new_events: 0, errors: ["parse_error"] };
  const src = (Array.isArray(j.sources) ? j.sources[0] : null) || {};
  return {
    fetched: src.fetched ?? 0,
    new_events: src.new_events ?? 0,
    duplicates: src.duplicates ?? 0,
    errors: (Array.isArray(src.errors) ? src.errors : []).map((e) => e?.code || e?.message || String(e)).slice(0, 3),
  };
}

function parseIngestSummary(stdout) {
  const m = String(stdout).match(/메일\s+(\d+)\s*건\s*ingest\(신규\s+(\d+)/);
  return m ? { ingested: Number(m[1]), new: Number(m[2]) } : { raw: "ok" };
}

// store: dev-erp Store. repoRoot: soulforge root(수집기 cwd). appDir: dev-erp 앱 dir(scan cwd). dbRel: scan --db 경로.
export async function collectAllMailboxes(store, { repoRoot, appDir, dbRel = "data/dev-erp.db", fetchTimeoutMs = 120000, ingestTimeoutMs = 60000, log = () => {} } = {}) {
  if (collecting) return { ok: false, error: "already_collecting" };
  collecting = true;
  const started = Date.now();
  const py = pyBin();
  const result = { ok: true, mailboxes: [], ingest: null, errors: [] };
  try {
    const accts = store.listAccounts().filter((a) =>
      a.status === "active" && a.mailbox_enabled && a.mailbox_provider && a.mailbox_provider !== "none" && a.mailbox_env_ref);
    if (!accts.length) { result.note = "no_enabled_mailbox"; return result; }
    for (const a of accts) {
      const who = a.display_name || a.username;
      try {
        const { stdout } = await execFileP(py,
          ["guild_hall/gateway/mail_fetch/cli.py", "--env-file", a.mailbox_env_ref, "--once", "--json"],
          { cwd: repoRoot, timeout: fetchTimeoutMs, maxBuffer: 8 * 1024 * 1024 });
        result.mailboxes.push({ who, ...parseFetchSummary(stdout) });
      } catch (e) {
        result.mailboxes.push({ who, fetched: 0, errors: [String(e?.message || e).slice(0, 160)] });
        result.errors.push(`fetch:${who}`);
      }
    }
    // 원장 → core_mail 인입(자식 프로세스). 메일함별로 원장에 쌓인 뒤 한 번에 ingest.
    try {
      const { stdout } = await execFileP("node",
        ["tools/scan_mail_ledger.mjs", "--apply", "--db", dbRel],
        { cwd: appDir, timeout: ingestTimeoutMs, maxBuffer: 8 * 1024 * 1024 });
      result.ingest = parseIngestSummary(stdout);
    } catch (e) {
      result.ingest = { error: String(e?.message || e).slice(0, 160) };
      result.errors.push("ingest");
    }
    result.ok = result.errors.length === 0;
    result.elapsed_ms = Date.now() - started;
    log(`[mail-collect] ${result.mailboxes.length}개 메일함 · ingest=${JSON.stringify(result.ingest)} · ${result.elapsed_ms}ms`);
    return result;
  } finally {
    collecting = false;
  }
}
