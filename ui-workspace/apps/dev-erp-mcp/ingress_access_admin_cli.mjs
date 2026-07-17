#!/usr/bin/env node
import { isAbsolute, resolve } from "node:path";

import {
  initializeIngressAuthRegistry,
  issueIngressCredential,
  listIngressCredentials,
  revokeIngressCredential,
} from "./src/ingress_access_admin.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function args(values, allowed) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag?.startsWith("--") || !allowed.has(flag.slice(2)) || !value || value.startsWith("--")) {
      fail("invalid_admin_arguments");
    }
    const key = flag.slice(2);
    if (Object.hasOwn(parsed, key)) fail("duplicate_admin_argument");
    parsed[key] = value;
  }
  return parsed;
}

function required(values, names) {
  for (const name of names) if (!values[name]) fail(`required_admin_argument_${name}`);
}

function absolute(value) {
  return isAbsolute(value) ? resolve(value) : resolve(process.cwd(), value);
}

function list(value) {
  const values = String(value || "").split(",").map((entry) => entry.trim()).filter(Boolean);
  if (!values.length) fail("empty_admin_list");
  return values;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  let output;
  if (command === "init") {
    const values = args(rest, new Set(["registry"]));
    required(values, ["registry"]);
    output = await initializeIngressAuthRegistry({ registryPath: absolute(values.registry) });
  } else if (command === "list") {
    const values = args(rest, new Set(["registry"]));
    required(values, ["registry"]);
    output = await listIngressCredentials({ registryPath: absolute(values.registry) });
  } else if (command === "issue") {
    const values = args(rest, new Set([
      "registry", "credential", "account", "device", "agent", "projects", "capabilities", "expires-at",
    ]));
    required(values, ["registry", "credential", "account", "device", "agent", "projects", "capabilities", "expires-at"]);
    output = await issueIngressCredential({
      registryPath: absolute(values.registry),
      credentialId: values.credential,
      accountId: values.account,
      deviceId: values.device,
      agentId: values.agent,
      projectScopes: list(values.projects),
      capabilities: list(values.capabilities),
      expiresAt: Date.parse(values["expires-at"]),
    });
  } else if (command === "revoke") {
    const values = args(rest, new Set(["registry", "credential"]));
    required(values, ["registry", "credential"]);
    output = await revokeIngressCredential({
      registryPath: absolute(values.registry),
      credentialId: values.credential,
    });
  } else {
    fail("usage: init | list | issue | revoke");
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: "error", code: error?.code || error?.message || "ingress_access_admin_failed" })}\n`);
  process.exitCode = 1;
});
