#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import { createIngressMtlsGateway, loadIngressMtlsGatewayConfig } from "./src/ingress_mtls_gateway.mjs";

function configArgument(args) {
  if (args.length !== 2 || args[0] !== "--config" || !args[1]) throw new Error("usage: --config <absolute-path>");
  return args[1];
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    const configPath = configArgument(process.argv.slice(2));
    const config = await loadIngressMtlsGatewayConfig(configPath);
    const server = await createIngressMtlsGateway({ configPath });
    server.listen(config.listenPort, config.listenHost, () => {
      console.log("[soulforge-ingress-mtls] listening on the approved exact LAN endpoint");
    });
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: "error", code: error?.code || error?.message || "mtls_gateway_start_failed" })}\n`);
    process.exitCode = 1;
  }
}
