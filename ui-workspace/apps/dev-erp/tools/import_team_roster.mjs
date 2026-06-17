#!/usr/bin/env node
// dev-ERP team roster import: private roster file -> account/mailbox metadata.
// Dry-run by default. Password values are read only to hash into the DB and are never printed.
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { openStore, Store } from "../src/store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const SCHEMA = "dev_erp.team_roster_import.v1";
const USERNAME_RE = /^[A-Za-z0-9_.@-]{2,80}$/;
const ROLE_VALUES = ["member", "admin"];
const MAILBOX_FIELDS = ["mailbox_provider", "provider", "mailbox_enabled", "enabled", "mailbox_env_ref", "env_ref"];

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};
const has = (n) => process.argv.includes(`--${n}`);

function fail(message, code = 2) {
  console.error(`[import-team-roster] ${message}`);
  process.exit(code);
}

function resolveDb(raw) {
  if (!raw) fail("--db <dev-erp.db> required");
  if (isAbsolute(raw)) return raw;
  const cwdPath = resolve(process.cwd(), raw);
  if (existsSync(cwdPath)) return cwdPath;
  const appPath = resolve(APP, raw);
  if (existsSync(appPath)) return appPath;
  if (existsSync(dirname(cwdPath))) return cwdPath;
  if (existsSync(dirname(appPath))) return appPath;
  fail("db_parent_not_found");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c === "\r") {
      if (text[i + 1] === "\n") continue;
      row.push(cur); rows.push(row); row = []; cur = "";
    } else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim()));
}

function csvRowsToObjects(records) {
  if (!records.length) return [];
  const headers = records[0].map((h) => String(h).trim());
  return records.slice(1).map((record) => Object.fromEntries(headers.map((h, i) => [h, record[i] ?? ""])));
}

export function parseRosterText(text, sourceName = "") {
  const clean = String(text ?? "").replace(/^\uFEFF/, "");
  const trimmed = clean.trim();
  if (!trimmed) return [];
  const ext = String(sourceName).toLowerCase().split(".").pop();
  if (ext === "csv" || (!["json"].includes(ext) && !trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return csvRowsToObjects(parseCsv(clean));
  }
  const parsed = JSON.parse(trimmed);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.accounts)) return parsed.accounts;
  if (Array.isArray(parsed.members)) return parsed.members;
  throw new Error("roster_json_requires_array_or_accounts");
}

function cell(row, names, fallback = "") {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  }
  return fallback;
}

function cleanCell(value) {
  return String(value ?? "").trim();
}

function boolValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === true || value === 1) return true;
  const s = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(s);
}

function mailboxSpecified(row) {
  return MAILBOX_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(row, field));
}

function normalizeRosterRow(row, index, options = {}) {
  const errors = [];
  const warnings = [];
  const username = cleanCell(cell(row, ["username", "login", "id"]));
  const email = cleanCell(cell(row, ["email", "mail"])).toLowerCase();
  const displayName = cleanCell(cell(row, ["display_name", "name", "team_member", "member_name"]));
  const roleCell = cleanCell(cell(row, ["role"], ""));
  const roleSupplied = roleCell.length > 0;
  const role = roleSupplied ? roleCell.toLowerCase() : "member";
  const password = String(cell(row, ["password", "temp_password", "initial_password"], ""));
  const provider = cleanCell(cell(row, ["mailbox_provider", "provider"], "none")).toLowerCase() || "none";
  const enabled = boolValue(cell(row, ["mailbox_enabled", "enabled"], provider !== "none"), provider !== "none");
  const envRef = cleanCell(cell(row, ["mailbox_env_ref", "env_ref"], ""));
  const wantsMailbox = mailboxSpecified(row) || provider !== "none" || !!envRef;

  if (!username) errors.push("username_required");
  else if (!USERNAME_RE.test(username)) errors.push("username_invalid");
  if (email && !Store.EMAIL_RE.test(email)) errors.push("email_format");
  if (!ROLE_VALUES.includes(role)) errors.push("role_invalid");
  if (role === "admin" && !options.allowAdmin) errors.push("admin_role_requires_allow_admin");
  if (/[\0\r\n]/.test(displayName)) errors.push("display_name_invalid");
  if (/[\0\r\n]/.test(password)) errors.push("password_invalid");
  if (password && password.length < 6) errors.push("password_too_short");
  if (!Store.MAILBOX_PROVIDERS.includes(provider)) errors.push("mailbox_provider_invalid");
  if (wantsMailbox) {
    const normalizedMailbox = Store.normalizeMailboxConfig({
      provider,
      enabled,
      env_ref: envRef,
    });
    if (normalizedMailbox.error) errors.push(normalizedMailbox.error);
  }

  return {
    index,
    username,
    email,
    display_name: displayName,
    role,
    role_supplied: roleSupplied,
    password,
    password_supplied: password.length > 0,
    mailbox_provider: provider,
    mailbox_enabled: enabled,
    mailbox_env_ref: envRef,
    mailbox_specified: wantsMailbox,
    errors,
    warnings,
  };
}

function publicEntry(entry) {
  const { normalized, existing, ...safe } = entry;
  return safe;
}

function buildPlan(store, rows, options = {}, { includePrivate = false } = {}) {
  const accounts = store.listAccounts();
  const byUsername = new Map(accounts.map((a) => [a.username, a]));
  const byEmail = new Map(accounts.filter((a) => a.email).map((a) => [String(a.email).toLowerCase(), a]));
  const seenUsernames = new Set();
  const entries = [];

  rows.forEach((row, i) => {
    const normalized = normalizeRosterRow(row, i + 1, options);
    const errors = [...normalized.errors];
    const warnings = [...normalized.warnings];
    if (normalized.username && seenUsernames.has(normalized.username)) errors.push("duplicate_username_in_roster");
    seenUsernames.add(normalized.username);

    const existing = normalized.username ? byUsername.get(normalized.username) : null;
    const emailOwner = normalized.email ? byEmail.get(normalized.email) : null;
    if (emailOwner && (!existing || emailOwner.id !== existing.id)) errors.push("email_taken_by_other_account");
    if (!existing && !normalized.password_supplied) errors.push("password_required_for_new_account");
    if (existing && normalized.password_supplied && !options.resetPasswords) warnings.push("password_ignored_without_reset_passwords");

    let mailboxAction = "skip";
    if (normalized.mailbox_specified) mailboxAction = normalized.mailbox_provider === "none" || !normalized.mailbox_enabled ? "disable" : "update";
    const passwordAction = !normalized.password_supplied ? "unchanged"
      : existing ? (options.resetPasswords ? "reset" : "ignored") : "set_initial";
    const roleAction = !existing ? "set_initial" : (normalized.role_supplied ? "update" : "unchanged");

    entries.push({
      index: normalized.index,
      username: normalized.username,
      email: normalized.email || null,
      display_name: normalized.display_name || null,
      role: normalized.role,
      role_supplied: normalized.role_supplied,
      role_action: roleAction,
      account_id: existing?.id ?? null,
      account_action: existing ? "update" : "create",
      password_supplied: normalized.password_supplied,
      password_action: passwordAction,
      mailbox_action: mailboxAction,
      mailbox_provider: normalized.mailbox_provider,
      mailbox_enabled: normalized.mailbox_enabled,
      mailbox_env_ref: normalized.mailbox_env_ref ? "[relative-ref]" : null,
      errors,
      warnings,
      ...(includePrivate ? { normalized, existing } : {}),
    });
  });

  const totals = {
    rows: entries.length,
    create: entries.filter((e) => e.account_action === "create" && !e.errors.length).length,
    update: entries.filter((e) => e.account_action === "update" && !e.errors.length).length,
    mailbox_update: entries.filter((e) => ["update", "disable"].includes(e.mailbox_action) && !e.errors.length).length,
    password_set_or_reset: entries.filter((e) => ["set_initial", "reset"].includes(e.password_action) && !e.errors.length).length,
    error_rows: entries.filter((e) => e.errors.length).length,
    warning_rows: entries.filter((e) => e.warnings.length).length,
  };

  return {
    schema_version: SCHEMA,
    generated_at: new Date().toISOString(),
    dry_run: true,
    apply_ready: totals.error_rows === 0,
    totals,
    entries: includePrivate ? entries : entries.map(publicEntry),
  };
}

export function planTeamRosterImport(store, rows, options = {}) {
  return buildPlan(store, rows, options, { includePrivate: false });
}

export function applyTeamRosterImport(store, rows, options = {}) {
  const plan = buildPlan(store, rows, options, { includePrivate: true });
  if (plan.totals.error_rows > 0) {
    return { ...plan, dry_run: false, applied: false, entries: plan.entries.map(publicEntry) };
  }

  const applied = [];
  store.db.exec("BEGIN IMMEDIATE");
  try {
    for (const entry of plan.entries) {
      const row = entry.normalized;
      let accountId = entry.existing?.id ?? null;
      if (entry.account_action === "create") {
        const created = store.createAccount({
          username: row.username,
          password: row.password,
          email: row.email || null,
          display_name: row.display_name || null,
          roles: [row.role],
        });
        if (created.error) throw new Error(`${row.username}:${created.error}`);
        accountId = created.id;
      } else {
        const updated = store.updateAccount(accountId, {
          email: row.email || null,
          display_name: row.display_name || null,
          ...(row.role_supplied ? { role: row.role } : {}),
        });
        if (updated.error) throw new Error(`${row.username}:${updated.error}`);
        if (entry.password_action === "reset") {
          const reset = store.setAccountPassword(accountId, row.password);
          if (reset.error) throw new Error(`${row.username}:${reset.error}`);
          store.deleteAccountSessions(accountId);
        }
      }
      if (["update", "disable"].includes(entry.mailbox_action)) {
        const mailbox = store.updateAccountMailbox(accountId, {
          provider: row.mailbox_provider,
          enabled: row.mailbox_enabled,
          env_ref: row.mailbox_env_ref || null,
        });
        if (mailbox.error) throw new Error(`${row.username}:${mailbox.error}`);
      }
      applied.push({ ...publicEntry(entry), account_id: accountId, applied: true });
    }
    store.appendEvent({
      actor_ref: "team_roster_import",
      actor_kind: "system",
      kind: "team_roster_import",
      used_refs: ["core_account", "mailbox_metadata"],
      data_label: "meta",
      note: `rows=${applied.length}; create=${plan.totals.create}; update=${plan.totals.update}; mailbox=${plan.totals.mailbox_update}; passwords=${plan.totals.password_set_or_reset}`,
    });
    store.db.exec("COMMIT");
  } catch (error) {
    store.db.exec("ROLLBACK");
    return {
      schema_version: SCHEMA,
      generated_at: new Date().toISOString(),
      dry_run: false,
      applied: false,
      apply_ready: false,
      totals: { ...plan.totals, error_rows: plan.totals.error_rows + 1 },
      entries: plan.entries.map(publicEntry),
      error: String(error.message || error),
    };
  }

  return {
    schema_version: SCHEMA,
    generated_at: new Date().toISOString(),
    dry_run: false,
    applied: true,
    apply_ready: true,
    totals: plan.totals,
    entries: applied,
  };
}

function usage() {
  return `Usage:
  node tools/import_team_roster.mjs --db data/dev-erp.db --roster <team_roster.json|csv> [--apply] [--reset-passwords] [--allow-admin]

Roster fields:
  username, display_name/name, email, role(member|admin), password/temp_password,
  mailbox_provider/provider(none|gmail|hiworks), mailbox_enabled/enabled, mailbox_env_ref/env_ref

Notes:
  - Dry-run is default. Add --apply to write.
  - Password values are never printed. Existing accounts only reset passwords with --reset-passwords.
  - Keep the roster file outside the public repo if it contains real people or temporary passwords.`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (has("help") || has("h")) {
    console.log(usage());
    process.exit(0);
  }
  const rosterPath = arg("roster");
  if (!rosterPath) fail("--roster <team_roster.json|csv> required");
  const resolvedRoster = isAbsolute(rosterPath) ? rosterPath : resolve(process.cwd(), rosterPath);
  if (!existsSync(resolvedRoster)) fail("roster_not_found");
  const rows = parseRosterText(readFileSync(resolvedRoster, "utf8"), resolvedRoster);
  const store = openStore(resolveDb(arg("db")));
  const options = { allowAdmin: has("allow-admin"), resetPasswords: has("reset-passwords") };
  const result = has("apply")
    ? applyTeamRosterImport(store, rows, options)
    : planTeamRosterImport(store, rows, options);
  store.db.close();
  console.log(JSON.stringify(result, null, 2));
  if (result.dry_run) console.error(`[import-team-roster] dry-run rows=${result.totals.rows}; add --apply to write.`);
  else console.error(`[import-team-roster] apply ${result.applied ? "ok" : "failed"} rows=${result.totals.rows}.`);
  process.exit(result.apply_ready || result.applied ? 0 : 2);
}
