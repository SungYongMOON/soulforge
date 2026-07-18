#!/usr/bin/env node
import { isAbsolute, resolve } from "node:path";

import {
  finalizeIngressMtlsEnrollment,
  prepareIngressMtlsEnrollment,
  signIngressMtlsEnrollment,
} from "./src/ingress_mtls_enrollment.mjs";

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
      fail("invalid_mtls_enrollment_arguments");
    }
    const key = flag.slice(2);
    if (Object.hasOwn(parsed, key)) fail("duplicate_mtls_enrollment_argument");
    parsed[key] = value;
  }
  return parsed;
}

function required(values, names) {
  for (const name of names) if (!values[name]) fail(`required_mtls_enrollment_argument_${name}`);
}

function absolute(value) {
  return isAbsolute(value) ? resolve(value) : resolve(process.cwd(), value);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  let output;
  if (command === "prepare") {
    const values = flags(rest, new Set(["output-dir", "openssl", "account", "device", "agent"]));
    required(values, ["output-dir", "openssl", "account", "device", "agent"]);
    output = await prepareIngressMtlsEnrollment({
      outputDir: absolute(values["output-dir"]), opensslPath: absolute(values.openssl),
      accountId: values.account, deviceId: values.device, agentId: values.agent,
    });
  } else if (command === "sign") {
    const values = flags(rest, new Set([
      "request", "csr", "ca-cert", "ca-key", "certificate-output", "openssl", "days",
    ]));
    required(values, ["request", "csr", "ca-cert", "ca-key", "certificate-output", "openssl"]);
    output = await signIngressMtlsEnrollment({
      requestPath: absolute(values.request), csrPath: absolute(values.csr),
      caCertPath: absolute(values["ca-cert"]), caKeyPath: absolute(values["ca-key"]),
      certificateOutputPath: absolute(values["certificate-output"]),
      opensslPath: absolute(values.openssl), days: values.days === undefined ? 30 : Number(values.days),
    });
  } else if (command === "finalize") {
    const values = flags(rest, new Set([
      "request", "key", "certificate", "ca-cert", "binding-output", "base-url", "server-pin", "openssl",
    ]));
    required(values, [
      "request", "key", "certificate", "ca-cert", "binding-output", "base-url", "server-pin", "openssl",
    ]);
    output = await finalizeIngressMtlsEnrollment({
      requestPath: absolute(values.request), clientKeyPath: absolute(values.key),
      clientCertPath: absolute(values.certificate), caCertPath: absolute(values["ca-cert"]),
      bindingOutputPath: absolute(values["binding-output"]), baseUrl: values["base-url"],
      serverCertificateSha256: values["server-pin"], opensslPath: absolute(values.openssl),
    });
  } else {
    fail("usage: prepare | sign | finalize");
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: "error", code: error?.code || error?.message || "mtls_enrollment_failed" })}\n`);
  process.exitCode = 1;
});
