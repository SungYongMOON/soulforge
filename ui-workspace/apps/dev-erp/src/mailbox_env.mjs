// src/mailbox_env.mjs — 계정 메일함 자격증명을 env 파일에 기록(자격증명은 DB 아닌 env 파일에만).
// 서버가 owner/관리자 입력(이메일·비번·호스트)을 받아 repo-relative env 파일로 atomic upsert 한다.
//   · 경로는 계정 username 에서 파생(사용자 입력 경로 금지 → traversal 차단), 허용 디렉터리로만 기록.
//   · 비밀번호는 이 env 파일 텍스트에만 들어가고 DB/로그/응답엔 절대 넣지 않는다.
//   · 수신(fetch)은 이 모듈이 아니라 별도 수집기 프로세스가 한다(no_server_egress 유지).
// zero-dependency: node:fs/path.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, rmSync, statSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { createHash } from "node:crypto";

export const MAILBOX_ENV_DIR_REL = "guild_hall/state/gateway/mailbox/state";

function mailboxConfigRoot(repoRoot, privateRoot = "") {
  const root = resolve(repoRoot);
  const configured = String(privateRoot || "").trim();
  return configured ? resolve(root, configured) : null;
}

export function resolveMailboxEnvPath(repoRoot, relPath, { privateRoot = "" } = {}) {
  const root = mailboxConfigRoot(repoRoot, privateRoot);
  if (!root) return null;
  const target = resolve(root, relPath);
  const allowedDir = resolve(root, MAILBOX_ENV_DIR_REL);
  const allowedPrefix = allowedDir + sep;
  if (target === allowedDir || !`${target}`.startsWith(allowedPrefix)) return null;
  return target;
}

// 파일명 키는 계정 id(항상 ASCII·고유)를 넘긴다 — 호출부는 acct.id 사용. 한글 등으로 sanitize 결과가
// 비면 raw 입력의 해시로 고유 파일명을 만들어, 비ASCII 이름 계정들이 같은 acct_mailbox.env 로 충돌하는 것을 막는다.
export function safeAccountEnvName(accountKey) {
  const s = String(accountKey || "").toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").replace(/^[_.\-]+|[_.\-]+$/g, "").slice(0, 80);
  if (s) return `acct_${s}.env`;
  return `acct_x${createHash("sha1").update(String(accountKey || "")).digest("hex").slice(0, 12)}.env`;
}
export function mailboxEnvRelPath(accountKey) {
  return `${MAILBOX_ENV_DIR_REL}/${safeAccountEnvName(accountKey)}`;
}

export function mailboxCredentialState(repoRoot, accountKey, envRef, { privateRoot = "" } = {}) {
  if (!String(privateRoot || "").trim()) return { exists: false, error: "mailbox_private_config_root_required" };
  const expectedRef = mailboxEnvRelPath(accountKey);
  const normalizedRef = String(envRef || "").replace(/\\/g, "/").trim();
  if (normalizedRef !== expectedRef) return { exists: false, error: "mailbox_env_ref_noncanonical" };
  const target = resolveMailboxEnvPath(repoRoot, expectedRef, { privateRoot });
  if (!target) return { exists: false, error: "mailbox_env_path_unsafe" };
  try {
    return statSync(target).isFile()
      ? { exists: true, error: null }
      : { exists: false, error: "mailbox_credential_file_missing" };
  } catch {
    return { exists: false, error: "mailbox_credential_file_missing" };
  }
}

// 기존 env 텍스트에 key=value upsert(주석/타 키 보존). 새 키는 끝에 추가.
export function upsertEnv(existingText, updates) {
  const lines = String(existingText || "").split(/\r?\n/);
  const seen = new Set();
  const out = lines.map((line) => {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m && Object.prototype.hasOwnProperty.call(updates, m[1])) { seen.add(m[1]); return `${m[1]}=${updates[m[1]]}`; }
    return line;
  });
  for (const k of Object.keys(updates)) if (!seen.has(k)) out.push(`${k}=${updates[k]}`);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n*$/, "\n");
}

// Hiworks 자격증명 → env 키 묶음(받기 POP3 + 보내기 SMTP). 같은 이메일·비번 공유.
// (Gmail 은 OAuth 토큰이라 이 단순 비번 흐름 대상 아님.)
export function hiworksEnvUpdates({ host, username, password, port = 995, useSsl = true, gmailOff = true, smtpHost, smtpPort = 465 }) {
  const popHost = String(host || "").trim();
  const user = String(username || "").trim();
  const pass = String(password ?? "");
  // SMTP 호스트: 지정 없으면 POP3 호스트에서 유추(pop3s.hiworks.com → smtps.hiworks.com), 그도 없으면 Hiworks 표준.
  const sHost = String(smtpHost || (popHost ? popHost.replace(/pop3/i, "smtp") : "") || "smtps.hiworks.com").trim();
  const u = {
    EMAIL_FETCH_SOURCE_HIWORKS_ENABLED: "true",
    HIWORKS_POP3_HOST: popHost,
    HIWORKS_POP3_PORT: String(Number(port) || 995),
    HIWORKS_POP3_USE_SSL: useSsl ? "true" : "false",
    HIWORKS_POP3_USERNAME: user,
    HIWORKS_POP3_PASSWORD: pass,
    // 보내기(SMTP) — 받기와 동일 자격증명, Hiworks 표준 smtps:465. guild_hall/gateway/mail_send/send_mail.py 가 읽음.
    EMAIL_SEND_PROVIDER: "hiworks",
    HIWORKS_SMTP_HOST: sHost,
    HIWORKS_SMTP_PORT: String(Number(smtpPort) || 465),
    HIWORKS_SMTP_USE_SSL: "true",
    HIWORKS_SMTP_USERNAME: user,
    HIWORKS_SMTP_PASSWORD: pass,
    HIWORKS_SMTP_FROM: user,
  };
  if (gmailOff) u.EMAIL_FETCH_SOURCE_GMAIL_ENABLED = "false"; // 계정별 단일 메일함은 Gmail 끔
  return u;
}

// repoRoot 아래 허용 디렉터리(MAILBOX_ENV_DIR_REL)로만 atomic 기록. 그 밖이면 거부(traversal 방지).
export function writeMailboxEnv(repoRoot, relPath, updates, { privateRoot = "" } = {}) {
  const target = resolveMailboxEnvPath(repoRoot, relPath, { privateRoot });
  if (!target) return { error: "mailbox_env_path_unsafe" };
  const existing = existsSync(target) ? readFileSync(target, "utf-8") : "";
  const content = upsertEnv(existing, updates);
  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, target);
  return { ok: true, path: target };
}

// 계정 삭제 시 그 계정의 env 파일(자격증명) 제거. 허용 디렉터리 밖이면 거부.
// 호출부는 per-account 파생 경로(acct_<user>.env)만 넘겨 공유 파일(email_fetch.env 등)을 절대 지우지 않게 한다.
export function deleteMailboxEnv(repoRoot, relPath, { privateRoot = "" } = {}) {
  const target = resolveMailboxEnvPath(repoRoot, relPath, { privateRoot });
  if (!target) return { error: "mailbox_env_path_unsafe" };
  if (existsSync(target)) { rmSync(target, { force: true }); return { ok: true, deleted: true }; }
  return { ok: true, deleted: false };
}

// 수집기 dry-run JSON → 연결 테스트 결과 {ok, fetched, error, message}. ERP "메일 연결" ✅/❌ 표시용.
export function parseMailTestResult(jsonText) {
  let d;
  try { d = JSON.parse(String(jsonText || "")); } catch { return { ok: false, fetched: 0, error: "parse_error", message: "" }; }
  const sources = Array.isArray(d?.sources) ? d.sources : [];
  const s = sources.find((x) => x && x.source === "hiworks");
  if (!s) return { ok: false, fetched: 0, error: "hiworks_source_missing", message: "" };
  if (s.enabled === false || s.disabled === true || String(s.status || "").toLowerCase() === "disabled") {
    return { ok: false, fetched: 0, error: "hiworks_disabled", message: "" };
  }
  const errs = Array.isArray(s.errors) ? s.errors : [];
  const bad = errs[0];
  if (bad) return { ok: false, fetched: Number(s.fetched) || 0, error: safeMailTestErrorCode(bad.code), message: "" };
  if (s.partial === true || d?.partial === true) return { ok: false, fetched: Number(s.fetched) || 0, error: "connection_test_partial", message: "" };
  return { ok: true, fetched: Number(s.fetched) || 0, error: null, message: "" };
}

function safeMailTestErrorCode(raw) {
  const code = String(raw || "").trim().toLowerCase();
  const allowed = new Set([
    "auth_failed", "missing_config", "missing_token", "network_error", "connect_error",
    "uidl_error", "timeout", "unexpected_error", "source_pipeline_error", "no_enabled_sources",
    "hiworks_source_missing", "hiworks_disabled", "parse_error", "connection_test_partial",
    "mailbox_private_config_root_required", "mailbox_env_ref_noncanonical", "mailbox_env_path_unsafe",
    "mailbox_credential_file_missing", "test_run_error",
  ]);
  return allowed.has(code) ? code : "connection_test_failed";
}

export function mailboxStatusPatch(result) {
  return result?.ok
    ? { status: "ok", last_error: "" }
    : { status: "error", last_error: safeMailTestErrorCode(result?.error) };
}

export async function runMailboxConnectionDryRun({
  repoRoot,
  accountKey,
  envRef,
  privateRoot = "",
  execFile,
  pythonBin = process.platform === "win32" ? "python" : "python3",
  timeout = 25000,
} = {}) {
  const presence = mailboxCredentialState(repoRoot, accountKey, envRef, { privateRoot });
  if (!presence.exists) return { ok: false, fetched: 0, error: presence.error, message: "" };
  try {
    const { stdout } = await execFile(
      pythonBin,
      ["guild_hall/gateway/mail_fetch/cli.py", "--env-file", mailboxEnvRelPath(accountKey), "--dry-run", "--limit", "3", "--once", "--json"],
      { cwd: resolve(repoRoot), timeout, maxBuffer: 4 * 1024 * 1024 },
    );
    return parseMailTestResult(stdout);
  } catch {
    return { ok: false, fetched: 0, error: "test_run_error", message: "" };
  }
}
