#!/usr/bin/env node
import { isAbsolute, resolve } from "node:path";

import {
  enrollIngressMtlsDevice,
  initializeIngressMtlsDeviceRegistry,
  listIngressMtlsDevices,
  revokeIngressMtlsDevice,
} from "./src/ingress_mtls_device_admin.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function flags(values, allowed) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag?.startsWith("--") || !allowed.has(flag.slice(2)) || !value || value.startsWith("--")) {
      fail("invalid_device_admin_arguments");
    }
    const key = flag.slice(2);
    if (Object.hasOwn(parsed, key)) fail("duplicate_device_admin_argument");
    parsed[key] = value;
  }
  return parsed;
}

function required(values, names) {
  for (const name of names) if (!values[name]) fail(`required_device_admin_argument_${name}`);
}

function absolute(value) {
  return isAbsolute(value) ? resolve(value) : resolve(process.cwd(), value);
}

function list(value) {
  const values = String(value || "").split(",").map((entry) => entry.trim()).filter(Boolean);
  if (!values.length) fail("empty_device_admin_list");
  return values;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  let output;
  if (command === "init" || command === "list") {
    const values = flags(rest, new Set(["registry"]));
    required(values, ["registry"]);
    output = command === "init"
      ? await initializeIngressMtlsDeviceRegistry({ registryPath: absolute(values.registry) })
      : await listIngressMtlsDevices({ registryPath: absolute(values.registry) });
  } else if (command === "enroll") {
    const values = flags(rest, new Set([
      "registry", "certificate", "credential", "account", "device", "agents", "expires-at",
    ]));
    required(values, ["registry", "certificate", "credential", "account", "device", "agents", "expires-at"]);
    output = await enrollIngressMtlsDevice({
      registryPath: absolute(values.registry),
      certificatePath: absolute(values.certificate),
      credentialId: values.credential,
      accountId: values.account,
      deviceId: values.device,
      allowedAgentIds: list(values.agents),
      expiresAt: Date.parse(values["expires-at"]),
    });
  } else if (command === "revoke") {
    const values = flags(rest, new Set(["registry", "credential"]));
    required(values, ["registry", "credential"]);
    output = await revokeIngressMtlsDevice({
      registryPath: absolute(values.registry),
      credentialId: values.credential,
    });
  } else {
    fail("usage: init | list | enroll | revoke");
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: "error", code: error?.code || error?.message || "device_admin_failed" })}\n`);
  process.exitCode = 1;
});
