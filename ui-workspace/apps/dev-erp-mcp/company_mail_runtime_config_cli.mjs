#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function requiredAbsolute(value, code) {
  const supplied = String(value || "");
  if (!isAbsolute(supplied)) throw new Error(code);
  return resolve(supplied);
}

async function regularFile(path, code) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(code);
  return realpath(path);
}

async function realDirectory(path, code) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(code);
  return realpath(path);
}

function hasEnvKey(text, key) {
  return text.split(/\r?\n/).some((line) => line.startsWith(`${key}=`));
}

export async function appendCompanyMailRuntimeSettings({ envFile, eventRoot, mailboxId, token } = {}) {
  const envPath = await regularFile(requiredAbsolute(envFile, "company_mail_env_file_absolute_required"), "company_mail_env_file_invalid");
  const eventsPath = await realDirectory(requiredAbsolute(eventRoot, "company_mail_event_root_absolute_required"), "company_mail_event_root_invalid");
  const exactMailboxId = String(mailboxId || "").trim();
  if (!/^[A-Za-z0-9._:-]{1,240}$/.test(exactMailboxId)) throw new Error("company_mail_mailbox_id_invalid");
  const localToken = token || randomBytes(48).toString("base64url");
  if (localToken.length < 32 || !/^[A-Za-z0-9_-]+$/.test(localToken)) throw new Error("company_mail_local_token_invalid");

  const existing = await readFile(envPath, "utf8");
  if (!hasEnvKey(existing, "CONTROL_PLANE_API_KEY")) throw new Error("control_plane_api_key_missing");
  for (const key of [
    "SOULFORGE_COMPANY_MAIL_MCP_TOKEN",
    "SOULFORGE_COMPANY_MAIL_EVENT_ROOT",
    "SOULFORGE_COMPANY_MAIL_MAILBOX_ID",
  ]) {
    if (hasEnvKey(existing, key)) throw new Error("company_mail_runtime_setting_already_exists");
  }

  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  const addition = `${prefix}SOULFORGE_COMPANY_MAIL_MCP_TOKEN=${localToken}\nSOULFORGE_COMPANY_MAIL_EVENT_ROOT=${eventsPath}\nSOULFORGE_COMPANY_MAIL_MAILBOX_ID=${exactMailboxId}\n`;
  const handle = await open(envPath, "a");
  try {
    await handle.writeFile(addition, "utf8");
  } finally {
    await handle.close();
  }
  return {
    env_file: envPath,
    added_env_names: [
      "SOULFORGE_COMPANY_MAIL_MCP_TOKEN",
      "SOULFORGE_COMPANY_MAIL_EVENT_ROOT",
      "SOULFORGE_COMPANY_MAIL_MAILBOX_ID",
    ],
    secret_values_printed: false,
  };
}

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    if (process.argv[2] !== "configure") throw new Error("usage: configure --env-file <absolute> --event-root <absolute> --mailbox-id <exact-id>");
    const result = await appendCompanyMailRuntimeSettings({
      envFile: option("env-file"),
      eventRoot: option("event-root"),
      mailboxId: option("mailbox-id"),
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(`[company-mail-runtime-config] ${error.message}`);
    process.exitCode = 1;
  }
}
