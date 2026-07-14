#!/usr/bin/env node
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createErpMcpService } from "../src/erp_mcp_service.mjs";
import { openStore } from "../src/store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(HERE, "..");
const REPO_ROOT = resolve(APP_DIR, "..", "..", "..");
const args = process.argv.slice(2);
const command = ["--help", "-h"].includes(args[0]) ? "help" : (args[0] || "help");
const option = (name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

function usage() {
  console.log(`Usage:
  node tools/mcp_access_admin.mjs issue  --username <name> [--label <label>] [--days 30] [--db <path>]
  node tools/mcp_access_admin.mjs list   --username <name> [--db <path>]
  node tools/mcp_access_admin.mjs revoke --username <name> --token-id <id> [--db <path>]

The plaintext token is printed once by issue. Never put it in Git or chat logs.`);
}

if (!["issue", "list", "revoke"].includes(command)) {
  usage();
  process.exit(command === "help" ? 0 : 2);
}

const username = String(option("username", "")).trim();
if (!username) {
  console.error("--username is required");
  process.exit(2);
}

const dbPath = resolve(option("db", join(APP_DIR, "data", "dev-erp.db")));
const artifactRoot = resolve(
  process.env.DEV_ERP_MCP_ARTIFACT_ROOT
    || join(REPO_ROOT, "_workspaces", "system", "dev-erp", "mcp-artifacts"),
);
const store = openStore(dbPath);
try {
  const account = store.db.prepare(
    "SELECT id,username,status FROM core_account WHERE username=?",
  ).get(username);
  if (!account) throw new Error("account_not_found");
  const service = createErpMcpService({ store, artifactRoot });
  if (command === "issue") {
    const result = service.issueToken({
      accountId: account.id,
      label: option("label", "Personal Codex"),
      expiresInDays: Number(option("days", 30)),
    });
    console.log(JSON.stringify(result, null, 2));
  } else if (command === "list") {
    console.log(JSON.stringify({ username, tokens: service.listTokens(account.id) }, null, 2));
  } else {
    const tokenId = String(option("token-id", "")).trim();
    if (!tokenId) throw new Error("--token-id is required");
    console.log(JSON.stringify(service.revokeToken({ accountId: account.id, tokenId }), null, 2));
  }
} catch (error) {
  console.error(error?.code || error?.message || String(error));
  process.exitCode = 1;
} finally {
  try { store.db.close(); } catch {}
}
