#!/usr/bin/env node
import { open } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TUNNEL_ID_PATTERN = /^tunnel_[a-f0-9]{32}$/;

export function assertTunnelId(value) {
  const tunnelId = String(value || "");
  if (!TUNNEL_ID_PATTERN.test(tunnelId)) throw new Error("company_mail_tunnel_id_invalid");
  return tunnelId;
}

export function renderCompanyMailTunnelProfile({ tunnelId }) {
  const exactTunnelId = assertTunnelId(tunnelId);
  return `config_version: 1
control_plane:
  base_url: https://api.openai.com
  tunnel_id: ${exactTunnelId}
  api_key: env:CONTROL_PLANE_API_KEY
health:
  listen_addr: 127.0.0.1:4315
admin_ui:
  open_browser: false
mcp:
  server_urls:
    - channel: main
      url: http://127.0.0.1:4314/mcp
  extra_headers:
    X-Soulforge-MCP-Token: env:SOULFORGE_COMPANY_MAIL_MCP_TOKEN
  discovery_extra_headers:
    X-Soulforge-MCP-Token: env:SOULFORGE_COMPANY_MAIL_MCP_TOKEN
  max_concurrent_requests: 4
`;
}

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function writeCompanyMailTunnelProfile({ tunnelId, output }) {
  if (!isAbsolute(String(output || ""))) throw new Error("company_mail_tunnel_profile_absolute_output_required");
  const target = resolve(output);
  const handle = await open(target, "wx", 0o600);
  try {
    await handle.writeFile(renderCompanyMailTunnelProfile({ tunnelId }), "utf8");
  } finally {
    await handle.close();
  }
  return target;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    if (process.argv[2] !== "generate") throw new Error("usage: generate --tunnel-id <tunnel_id> --output <absolute-private-path>");
    const target = await writeCompanyMailTunnelProfile({
      tunnelId: option("tunnel-id"),
      output: option("output"),
    });
    console.log(`[company-mail-tunnel-profile] created ${target}; secret values were not written`);
  } catch (error) {
    console.error(`[company-mail-tunnel-profile] ${error.message}`);
    process.exitCode = 1;
  }
}
