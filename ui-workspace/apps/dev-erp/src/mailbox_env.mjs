// src/mailbox_env.mjs — 계정 메일함 자격증명을 env 파일에 기록(자격증명은 DB 아닌 env 파일에만).
// 서버가 owner/관리자 입력(이메일·비번·호스트)을 받아 repo-relative env 파일로 atomic upsert 한다.
//   · 경로는 계정 username 에서 파생(사용자 입력 경로 금지 → traversal 차단), 허용 디렉터리로만 기록.
//   · 비밀번호는 이 env 파일 텍스트에만 들어가고 DB/로그/응답엔 절대 넣지 않는다.
//   · 수신(fetch)은 이 모듈이 아니라 별도 수집기 프로세스가 한다(no_server_egress 유지).
// zero-dependency: node:fs/path.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";

export const MAILBOX_ENV_DIR_REL = "guild_hall/state/gateway/mailbox/state";

export function safeAccountEnvName(username) {
  const s = String(username || "").toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").replace(/^[_.\-]+|[_.\-]+$/g, "").slice(0, 80);
  return `acct_${s || "mailbox"}.env`;
}
export function mailboxEnvRelPath(username) {
  return `${MAILBOX_ENV_DIR_REL}/${safeAccountEnvName(username)}`;
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

// Hiworks POP3 자격증명 → env 키 묶음. (Gmail 은 OAuth 토큰이라 이 단순 비번 흐름 대상 아님.)
export function hiworksEnvUpdates({ host, username, password, port = 995, useSsl = true, gmailOff = true }) {
  const u = {
    EMAIL_FETCH_SOURCE_HIWORKS_ENABLED: "true",
    HIWORKS_POP3_HOST: String(host || "").trim(),
    HIWORKS_POP3_PORT: String(Number(port) || 995),
    HIWORKS_POP3_USE_SSL: useSsl ? "true" : "false",
    HIWORKS_POP3_USERNAME: String(username || "").trim(),
    HIWORKS_POP3_PASSWORD: String(password ?? ""),
  };
  if (gmailOff) u.EMAIL_FETCH_SOURCE_GMAIL_ENABLED = "false"; // 계정별 단일 메일함은 Gmail 끔
  return u;
}

// repoRoot 아래 허용 디렉터리(MAILBOX_ENV_DIR_REL)로만 atomic 기록. 그 밖이면 거부(traversal 방지).
export function writeMailboxEnv(repoRoot, relPath, updates) {
  const root = resolve(repoRoot);
  const target = resolve(root, relPath);
  const allowedPrefix = resolve(root, MAILBOX_ENV_DIR_REL) + sep;
  if (!`${target}`.startsWith(allowedPrefix)) return { error: "mailbox_env_path_unsafe" };
  const existing = existsSync(target) ? readFileSync(target, "utf-8") : "";
  const content = upsertEnv(existing, updates);
  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, target);
  return { ok: true, path: target };
}
