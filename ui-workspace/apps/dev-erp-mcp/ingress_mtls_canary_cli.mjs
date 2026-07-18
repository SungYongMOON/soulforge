#!/usr/bin/env node
import { isAbsolute, resolve } from "node:path";

import { preflightIngressMtlsCanary, probeIngressMtlsCanary } from "./src/ingress_mtls_canary.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function bindingArgument(args) {
  if (args.length !== 2 || args[0] !== "--binding" || !args[1]) fail("usage: preflight|probe --binding <path>");
  return isAbsolute(args[1]) ? resolve(args[1]) : resolve(process.cwd(), args[1]);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const bindingPath = bindingArgument(rest);
  let output;
  if (command === "preflight") {
    output = await preflightIngressMtlsCanary({ bindingPath });
  } else if (command === "probe") {
    const token = process.env.SOULFORGE_INGRESS_TOKEN;
    if (!token) fail("SOULFORGE_INGRESS_TOKEN_required");
    output = await probeIngressMtlsCanary({ bindingPath, token });
  } else {
    fail("usage: preflight|probe --binding <path>");
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: "error", code: error?.code || error?.message || "mtls_canary_failed" })}\n`);
  process.exitCode = 1;
});
