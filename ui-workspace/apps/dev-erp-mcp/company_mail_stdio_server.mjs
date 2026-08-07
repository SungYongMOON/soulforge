#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { CompanyMailEventStore } from "./src/company_mail_store.mjs";
import { createCompanyMailMcpToolServer } from "./src/company_mail_tools.mjs";

const SAFE_RUNTIME_ENV_KEYS = new Set([
  "COMSPEC",
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "WINDIR",
]);

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

export function sanitizeCompanyMailProcessEnvironment(environment = process.env) {
  for (const key of Object.keys(environment)) {
    if (!SAFE_RUNTIME_ENV_KEYS.has(key)) delete environment[key];
  }
  return environment;
}

export async function runCompanyMailStdioServer({ eventRoot, mailboxId } = {}) {
  sanitizeCompanyMailProcessEnvironment();
  const store = new CompanyMailEventStore({ eventRoot, mailboxId });
  const server = createCompanyMailMcpToolServer({ store });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return { server, transport };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    await runCompanyMailStdioServer({
      eventRoot: option("event-root", process.env.SOULFORGE_COMPANY_MAIL_EVENT_ROOT),
      mailboxId: option("mailbox-id", process.env.SOULFORGE_COMPANY_MAIL_MAILBOX_ID),
    });
  } catch (error) {
    console.error(`[company-mail-stdio] ${error.message}`);
    process.exitCode = 1;
  }
}
