#!/usr/bin/env node
// Company-PC team host preflight. Opens SQLite read-only, checks metadata/file presence,
// and never initializes schema or reads credential env contents.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { Store } from "../src/store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(HERE, "..", "..", "..", "..");
const DEFAULT_REGISTER = resolve(REPO, "guild_hall/state/gateway/mailbox/state/team_mailboxes.json");
const SCHEMA = "dev_erp_company_pc_team_preflight.v1";

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

function fail(message, code = 2) {
  console.error(`[team-preflight] ${message}`);
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

export function openTeamPreflightStore(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec("PRAGMA query_only=ON;");
    db.exec("PRAGMA busy_timeout=5000;");
    return new Store(db);
  } catch (error) {
    db.close();
    throw error;
  }
}

function levelFrom(ok, code = "blocker") {
  return ok ? "ok" : code;
}

function existsAsFile(path) {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function safeLabel(account) {
  return account.display_name || account.username || account.id || "account";
}

function checkEnvRef(root, envRef) {
  const normalized = Store.safeRelativePathRef(envRef, { allowEmpty: false, error: "mailbox_env_ref_invalid" });
  if (normalized.error) return { valid: false, present: false, code: normalized.error };
  const path = resolve(root, normalized.value);
  return { valid: true, present: existsAsFile(path), code: existsAsFile(path) ? "ok" : "mailbox_env_file_missing" };
}

function readTeamMailboxRegister(path) {
  if (!existsSync(path)) return { exists: false, count: 0, mailboxes: [], error: null };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    const mailboxes = Array.isArray(parsed.mailboxes) ? parsed.mailboxes : [];
    return {
      exists: true,
      count: mailboxes.filter((m) => m?.enabled !== false).length,
      mailboxes,
      error: Array.isArray(parsed.mailboxes) ? null : "team_mailbox_register_shape_invalid",
    };
  } catch {
    return { exists: true, count: 0, mailboxes: [], error: "team_mailbox_register_json_invalid" };
  }
}

function addIssue(bucket, code, extras = {}) {
  bucket.push({ code, ...extras });
}

export function buildTeamHostPreflight(store, {
  root = REPO,
  targetMembers = 5,
  requireEnvFiles = true,
  registerPath = DEFAULT_REGISTER,
  today = new Date().toISOString().slice(0, 10),
} = {}) {
  const rootPath = isAbsolute(root) ? root : resolve(process.cwd(), root);
  const mailRegisterPath = isAbsolute(registerPath) ? registerPath : resolve(process.cwd(), registerPath);
  const readiness = store.teamReadiness({ target_members: targetMembers, today });
  const blockers = [...readiness.blockers.map((x) => ({ ...x }))];
  const warnings = [...readiness.warnings.map((x) => ({ ...x }))];
  const checks = [];

  const activeMembers = readiness.accounts.filter((a) => a.status === "active" && !a.is_admin);
  const configuredMembers = activeMembers.filter((a) => a.email && a.mailbox_enabled && a.mailbox_provider !== "none" && a.mailbox_env_ref);
  const targetShort = activeMembers.length < readiness.target_members;

  checks.push({
    code: "company_pc_host_model",
    level: "ok",
    detail: "server_keeps_mail_credentials_team_uses_browser",
  });
  checks.push({
    code: "active_admin_present",
    level: levelFrom(readiness.counts.active_admin_count > 0),
    actual: readiness.counts.active_admin_count,
  });
  checks.push({
    code: "active_members_target_met",
    level: levelFrom(!targetShort),
    actual: readiness.counts.active_member_count,
    target: readiness.target_members,
  });
  if (targetShort) {
    addIssue(blockers, "target_members_short", { expected: readiness.target_members, actual: activeMembers.length });
  }
  checks.push({
    code: "member_mailboxes_configured",
    level: levelFrom(readiness.counts.configured_mailbox_count === activeMembers.length),
    actual: readiness.counts.configured_mailbox_count,
    expected: activeMembers.length,
  });

  const envResults = new Map();
  if (requireEnvFiles) {
    for (const account of configuredMembers) {
      const result = checkEnvRef(rootPath, account.mailbox_env_ref);
      envResults.set(account.id, result);
      if (!result.valid || !result.present) {
        addIssue(blockers, result.code, { account_id: account.id, account_label: safeLabel(account) });
      }
    }
  }
  const missingEnvCount = [...envResults.values()].filter((x) => !x.valid || !x.present).length;
  checks.push({
    code: "company_pc_mail_env_files_present",
    level: requireEnvFiles ? levelFrom(missingEnvCount === 0) : "skipped",
    checked: requireEnvFiles,
    present: requireEnvFiles ? configuredMembers.length - missingEnvCount : 0,
    missing: requireEnvFiles ? missingEnvCount : 0,
  });

  const register = readTeamMailboxRegister(mailRegisterPath);
  const registerMissing = !register.exists && configuredMembers.length > 0;
  const registerMailboxByEmail = new Map(register.mailboxes
    .filter((m) => m?.enabled !== false && m?.email)
    .map((m) => [String(m.email).trim().toLowerCase(), m]));
  const registerMemberIssues = [];
  if (register.exists && !register.error) {
    for (const account of configuredMembers) {
      const entry = registerMailboxByEmail.get(String(account.email).trim().toLowerCase());
      if (!entry) {
        registerMemberIssues.push({ code: "team_mailbox_register_account_missing", account_id: account.id, account_label: safeLabel(account) });
      } else if (String(entry.provider ?? "").trim().toLowerCase() !== account.mailbox_provider) {
        registerMemberIssues.push({ code: "team_mailbox_register_provider_mismatch", account_id: account.id, account_label: safeLabel(account) });
      } else {
        const entryEnv = Store.safeRelativePathRef(entry.env_file, { allowEmpty: false, error: "team_mailbox_register_env_ref_invalid" });
        if (entryEnv.error) {
          registerMemberIssues.push({ code: entryEnv.error, account_id: account.id, account_label: safeLabel(account) });
        } else {
          if (entryEnv.value !== account.mailbox_env_ref) {
            registerMemberIssues.push({ code: "team_mailbox_register_env_ref_mismatch", account_id: account.id, account_label: safeLabel(account) });
          }
          const entryEnvFile = checkEnvRef(rootPath, entryEnv.value);
          if (!entryEnvFile.present) {
            registerMemberIssues.push({ code: "team_mailbox_register_env_file_missing", account_id: account.id, account_label: safeLabel(account) });
          }
        }
      }
    }
  }
  const registerMismatch = register.exists && !register.error && register.count !== configuredMembers.length;
  if (register.error) addIssue(blockers, register.error);
  if (registerMissing) addIssue(blockers, "team_mailbox_register_missing", { expected: configuredMembers.length });
  if (registerMismatch) addIssue(blockers, "team_mailbox_register_count_mismatch", { expected: configuredMembers.length, actual: register.count });
  for (const issue of registerMemberIssues) addIssue(blockers, issue.code, { account_id: issue.account_id, account_label: issue.account_label });
  checks.push({
    code: "team_mailbox_register_ready",
    level: register.error || registerMissing || registerMismatch || registerMemberIssues.length ? "blocker" : "ok",
    exists: register.exists,
    actual: register.count,
    expected: configuredMembers.length,
  });

  checks.push({
    code: "team_mail_fetch_observed",
    level: readiness.fetch_observed ? "ok" : (configuredMembers.length ? "warning" : "skipped"),
    actual: readiness.counts.fetch_seen_count,
    expected: configuredMembers.length,
  });

  const nextActions = [...readiness.next_actions.map((x) => ({ ...x }))];
  if (missingEnvCount > 0) nextActions.unshift({ code: "create_company_pc_mail_env_files", priority: "blocker", count: missingEnvCount });
  if (register.error) nextActions.unshift({ code: "repair_team_mailbox_register", priority: "blocker" });
  else if (registerMissing) nextActions.unshift({ code: "export_team_mailbox_register", priority: "blocker", expected: configuredMembers.length });
  else if (registerMismatch || registerMemberIssues.length) nextActions.unshift({ code: "refresh_team_mailbox_register", priority: "blocker", expected: configuredMembers.length, actual: register.count });
  if (!readiness.fetch_observed && configuredMembers.length > 0) nextActions.push({ code: "run_team_mail_fetch", priority: "warning", expected: configuredMembers.length, actual: readiness.counts.fetch_seen_count });

  const uniqueBlockers = blockers.filter((issue, index, arr) =>
    index === arr.findIndex((x) => x.code === issue.code && x.account_id === issue.account_id));
  const uniqueWarnings = warnings.filter((issue, index, arr) =>
    index === arr.findIndex((x) => x.code === issue.code && x.account_id === issue.account_id));
  const accounts = readiness.accounts.map((account) => {
    const env = envResults.get(account.id);
    return {
      id: account.id,
      username: account.username,
      display_name: account.display_name,
      status: account.status,
      is_admin: account.is_admin,
      email_present: !!account.email,
      mailbox_provider: account.mailbox_provider,
      mailbox_enabled: account.mailbox_enabled,
      mailbox_status: account.mailbox_status,
      env_ref_present: !!account.mailbox_env_ref,
      env_file_present: env ? env.present : null,
      mail_count: account.mail_count,
      open_item_count: account.open_item_count,
      ready: account.ready && (!env || env.present),
      issues: account.issues.map((x) => ({ ...x })),
    };
  });

  const configurationReady = uniqueBlockers.length === 0;
  const teamUseReady = configurationReady && (!configuredMembers.length || readiness.fetch_observed);
  if (teamUseReady && !nextActions.some((x) => x.code === "ready_for_company_pc_team_use")) {
    nextActions.push({ code: "ready_for_company_pc_team_use", priority: "ok" });
  }

  return {
    schema_version: SCHEMA,
    generated_at: new Date().toISOString(),
    host_model: "company_pc_shared_host",
    secret_policy: "credential_values_stay_on_company_pc_env_files_not_in_erp_db_or_output",
    preflight_ready: configurationReady,
    configuration_ready: configurationReady,
    mail_fetch_observed: readiness.fetch_observed,
    team_use_ready: teamUseReady,
    counts: readiness.counts,
    queues: readiness.queues,
    checks,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    next_actions: nextActions,
    accounts,
  };
}

function usage() {
  return `Usage:
  node tools/team_preflight.mjs --db data/dev-erp.db [--target-members 5] [--root <repo-root>] [--register <team_mailboxes.json>] [--skip-env-file-check]

Notes:
  - Designed for the company-PC shared host model.
  - Opens SQLite read-only/query-only and never initializes or migrates its schema.
  - Checks credential env file presence only; it never reads env file contents.
  - Output redacts mailbox_env_ref paths and credential values.
  - Default rollout target is 5 active members. Use --target-members 1 for a one-person pilot.
  - configuration_ready means setup blockers are gone; team_use_ready also requires observed team mail fetch.`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (has("help") || has("h")) {
    console.log(usage());
    process.exit(0);
  }
  let store;
  let result;
  try {
    store = openTeamPreflightStore(resolveDb(arg("db")));
    result = buildTeamHostPreflight(store, {
      root: arg("root", REPO),
      targetMembers: arg("target-members", "5"),
      registerPath: arg("register", DEFAULT_REGISTER),
      requireEnvFiles: !has("skip-env-file-check"),
      today: arg("today", new Date().toISOString().slice(0, 10)),
    });
  } catch {
    store?.db.close();
    fail("db_schema_unready");
  }
  store.db.close();
  console.log(JSON.stringify(result, null, 2));
  if (!result.configuration_ready) {
    console.error(`[team-preflight] configuration blocked=${result.blockers.length}; resolve blockers before team rollout.`);
    process.exit(2);
  }
  if (!result.team_use_ready) {
    console.error("[team-preflight] configuration ok; run team mail fetch and preflight again before team use.");
    process.exit(1);
  }
  console.error("[team-preflight] team-use ready for company-PC host.");
  process.exit(0);
}
