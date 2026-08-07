#!/usr/bin/env node
import { spawn } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createCompanyMailMcpHttpServer } from "./company_mail_server.mjs";
import { CompanyMailEventStore } from "./src/company_mail_store.mjs";

const PACKAGE_ROOT = fileURLToPath(new URL(".", import.meta.url));
const SAFE_CHILD_ENV_KEYS = Object.freeze([
  "COMSPEC",
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "WINDIR",
]);

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) throw new Error("company_mail_env_line_invalid");
    const key = line.slice(0, index).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error("company_mail_env_key_invalid");
    values[key] = line.slice(index + 1);
  }
  return values;
}

async function exactRegularFile(value, code) {
  if (!isAbsolute(String(value || ""))) throw new Error(`${code}_absolute_required`);
  const path = resolve(value);
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${code}_invalid`);
  return realpath(path);
}

export async function loadCompanyMailRuntimeEnvironment(envFile) {
  const path = await exactRegularFile(envFile, "company_mail_env_file");
  const values = parseEnv(await readFile(path, "utf8"));
  if (String(values.CONTROL_PLANE_API_KEY || "").length < 32) throw new Error("control_plane_api_key_invalid");
  if (String(values.SOULFORGE_COMPANY_MAIL_MCP_TOKEN || "").length < 32) throw new Error("company_mail_mcp_token_invalid");
  if (!isAbsolute(String(values.SOULFORGE_COMPANY_MAIL_EVENT_ROOT || ""))) throw new Error("company_mail_event_root_invalid");
  if (!String(values.SOULFORGE_COMPANY_MAIL_MAILBOX_ID || "")) throw new Error("company_mail_mailbox_id_invalid");
  return { path, values };
}

export function buildCompanyMailChildEnvironment(values, kind, parentEnvironment = process.env) {
  const env = {};
  for (const key of SAFE_CHILD_ENV_KEYS) {
    if (parentEnvironment[key] !== undefined) env[key] = parentEnvironment[key];
  }
  if (kind === "server") {
    env.SOULFORGE_COMPANY_MAIL_MCP_TOKEN = values.SOULFORGE_COMPANY_MAIL_MCP_TOKEN;
    env.SOULFORGE_COMPANY_MAIL_EVENT_ROOT = values.SOULFORGE_COMPANY_MAIL_EVENT_ROOT;
    env.SOULFORGE_COMPANY_MAIL_MAILBOX_ID = values.SOULFORGE_COMPANY_MAIL_MAILBOX_ID;
  } else {
    env.CONTROL_PLANE_API_KEY = values.CONTROL_PLANE_API_KEY;
    env.SOULFORGE_COMPANY_MAIL_MCP_TOKEN = values.SOULFORGE_COMPANY_MAIL_MCP_TOKEN;
    env.MCP_EXTRA_HEADERS = "X-Soulforge-MCP-Token: env:SOULFORGE_COMPANY_MAIL_MCP_TOKEN";
    env.MCP_DISCOVERY_EXTRA_HEADERS = "X-Soulforge-MCP-Token: env:SOULFORGE_COMPANY_MAIL_MCP_TOKEN";
  }
  return env;
}

function closeServer(server) {
  return new Promise((resolveClose) => server.close(resolveClose));
}

function runProcess(command, args, options = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { windowsHide: true, ...options });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolveRun({ code, stdout, stderr }));
  });
}

export async function verifyCompanyMailTunnel({ envFile, profileFile, tunnelClient }) {
  const runtime = await loadCompanyMailRuntimeEnvironment(envFile);
  const profile = await exactRegularFile(profileFile, "company_mail_tunnel_profile");
  const executable = await exactRegularFile(tunnelClient, "company_mail_tunnel_client");
  const store = new CompanyMailEventStore({
    eventRoot: runtime.values.SOULFORGE_COMPANY_MAIL_EVENT_ROOT,
    mailboxId: runtime.values.SOULFORGE_COMPANY_MAIL_MAILBOX_ID,
  });
  const status = await store.status();
  const server = createCompanyMailMcpHttpServer({
    store,
    token: runtime.values.SOULFORGE_COMPANY_MAIL_MCP_TOKEN,
  });
  try {
    await new Promise((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(4314, "127.0.0.1", resolveListen);
    });
    const doctor = await runProcess(executable, ["doctor", "--profile-file", profile, "--json", "--explain"], {
      env: buildCompanyMailChildEnvironment(runtime.values, "tunnel"),
    });
    if (doctor.code !== 0) {
      const error = new Error("company_mail_tunnel_doctor_failed");
      error.diagnostic = "tunnel_client_diagnostic_withheld";
      throw error;
    }
    return {
      mailbox: status.mailbox,
      event_count: status.event_count,
      latest_received_at: status.latest_received_at,
      tunnel_doctor: "passed",
      secret_values_printed: false,
    };
  } finally {
    if (server.listening) await closeServer(server);
  }
}

export async function runCompanyMailTunnel({ envFile, profileFile, tunnelClient }) {
  const runtime = await loadCompanyMailRuntimeEnvironment(envFile);
  const profile = await exactRegularFile(profileFile, "company_mail_tunnel_profile");
  const executable = await exactRegularFile(tunnelClient, "company_mail_tunnel_client");
  const serverPath = resolve(PACKAGE_ROOT, "company_mail_server.mjs");
  const server = spawn(process.execPath, [serverPath], {
    cwd: PACKAGE_ROOT,
    env: buildCompanyMailChildEnvironment(runtime.values, "server"),
    stdio: "inherit",
    windowsHide: true,
  });
  await new Promise((resolveReady, rejectReady) => {
    const started = Date.now();
    const poll = async () => {
      if (server.exitCode !== null) return rejectReady(new Error("company_mail_server_start_failed"));
      try {
        const response = await fetch("http://127.0.0.1:4314/health", { signal: AbortSignal.timeout(1000) });
        if (response.ok) return resolveReady();
      } catch {}
      if (Date.now() - started > 10000) return rejectReady(new Error("company_mail_server_health_timeout"));
      setTimeout(poll, 100);
    };
    poll();
  });
  const tunnel = spawn(executable, ["run", "--profile-file", profile], {
    env: buildCompanyMailChildEnvironment(runtime.values, "tunnel"),
    stdio: "inherit",
    windowsHide: true,
  });
  const stop = () => {
    if (server.exitCode === null) server.kill();
    if (tunnel.exitCode === null) tunnel.kill();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const exitCode = await new Promise((resolveExit) => {
    server.once("exit", (code) => resolveExit(code || 1));
    tunnel.once("exit", (code) => resolveExit(code || 1));
  });
  stop();
  process.exitCode = exitCode;
}

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    const args = {
      envFile: option("env-file"),
      profileFile: option("profile-file"),
      tunnelClient: option("tunnel-client"),
    };
    if (process.argv[2] === "verify") console.log(JSON.stringify(await verifyCompanyMailTunnel(args)));
    else if (process.argv[2] === "run") await runCompanyMailTunnel(args);
    else throw new Error("usage: <verify|run> --env-file <absolute> --profile-file <absolute> --tunnel-client <absolute>");
  } catch (error) {
    console.error(`[company-mail-tunnel-runtime] ${error.message}`);
    if (error.diagnostic) console.error(error.diagnostic);
    process.exitCode = 1;
  }
}
