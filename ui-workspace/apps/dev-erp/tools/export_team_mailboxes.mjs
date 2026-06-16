#!/usr/bin/env node
// dev-ERP 계정 메일함 메타데이터 → gateway team_mailboxes.json 등록부.
// secret/token/password 값은 읽거나 쓰지 않는다. enabled mailbox 의 provider/env ref/email 만 export.
import { existsSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore } from "../src/store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(HERE, "..", "..", "..", "..");
const DEFAULT_OUT = resolve(REPO, "guild_hall/state/gateway/mailbox/state/team_mailboxes.json");
const SCHEMA = "email.fetch.team_mailbox_register.v1";
const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};
const has = (n) => process.argv.includes(`--${n}`);

const dbArg = arg("db");
const outArg = arg("out", DEFAULT_OUT);
const apply = has("apply");

function fail(message, code = 2) {
  console.error(`[export-team-mailboxes] ${message}`);
  process.exit(code);
}

function resolveDb(raw) {
  if (!raw) fail("--db <dev-erp.db> required");
  if (isAbsolute(raw)) {
    if (!existsSync(raw)) fail("db_not_found");
    return raw;
  }
  const cwdPath = resolve(process.cwd(), raw);
  if (existsSync(cwdPath)) return cwdPath;
  const appPath = resolve(APP, raw);
  if (existsSync(appPath)) return appPath;
  fail("db_not_found");
}

function safeToken(raw, fallback) {
  const value = String(raw || fallback || "mailbox").trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").replace(/^[_\-.]+|[_\-.]+$/g, "");
  return value.slice(0, 80) || "mailbox";
}

function safeRelativeRef(raw) {
  const value = String(raw ?? "").replace(/\\/g, "/").trim();
  if (!value || value.length > 240 || /[\0\r\n=]/.test(value)) return "";
  if (value.startsWith("/") || value.startsWith("~") || /^[A-Za-z]:\//.test(value) || value.startsWith("//")) return "";
  if (value.split("/").some((part) => !part || part === "." || part === "..")) return "";
  return value;
}

const store = openStore(resolveDb(dbArg));
const rows = store.listAccountMailboxConfigs()
  .filter((row) => row.status === "active" && row.email && row.mailbox_enabled && ["gmail", "hiworks"].includes(row.mailbox_provider));

const mailboxes = [];
for (const row of rows) {
  const envRef = safeRelativeRef(row.mailbox_env_ref);
  if (!envRef) continue;
  mailboxes.push({
    id: safeToken(row.username || row.id, row.email),
    account_id: row.id,
    email: String(row.email).trim().toLowerCase(),
    display_name: row.display_name || row.username,
    provider: row.mailbox_provider,
    enabled: true,
    env_file: envRef,
  });
}
store.db.close();

const payload = {
  schema_version: SCHEMA,
  generated_by: "dev_erp_export_team_mailboxes",
  generated_at: new Date().toISOString(),
  mailboxes,
};

if (!apply) {
  console.log(JSON.stringify(payload, null, 2));
  console.error(`[export-team-mailboxes] dry-run mailboxes=${mailboxes.length}. Add --apply to write.`);
  process.exit(0);
}

const outPath = isAbsolute(outArg) ? outArg : resolve(process.cwd(), outArg);
mkdirSync(dirname(outPath), { recursive: true });
const tmp = `${outPath}.tmp`;
writeFileSync(tmp, JSON.stringify(payload, null, 2) + "\n");
renameSync(tmp, outPath);
console.log(`[export-team-mailboxes] wrote ${mailboxes.length} mailbox rows -> ${outPath}`);
