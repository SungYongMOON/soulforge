import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAiUsageAdapterPlugin } from "./src/server/ai-usage-adapter.mjs";
import { createAntigravityQuotaAdapterPlugin } from "./src/server/antigravity-quota-adapter.mjs";
import { createAntigravityUsageAdapterPlugin } from "./src/server/antigravity-usage-adapter.mjs";
import { createClaudeUsageAdapterPlugin } from "./src/server/claude-usage-adapter.mjs";
import { createHostStatsAdapterPlugin } from "./src/server/host-stats-adapter.mjs";
import { createLiveThreadAdapterPlugin } from "./src/server/live-thread-adapter.mjs";
import { createProviderLimitsAdapterPlugin } from "./src/server/provider-limits-adapter.mjs";
import { createTopologyAdapterPlugin } from "./src/server/topology-adapter.mjs";
import { createTopologyFederationAdapterPlugin } from "./src/server/topology-federation-adapter.mjs";
import {
  createTeamOpsBoardRuntimeEnvironment,
  createTeamOpsBoardTopologyOptions,
} from "./src/core/team-ops-board-read-only-pilot.mjs";
import { resolveTeamOpsBoardAllowedHosts } from "./src/server/team-ops-board-allowed-hosts.mjs";

const boardEnvironment = createTeamOpsBoardRuntimeEnvironment();
const boardTopologyOptions = createTeamOpsBoardTopologyOptions(boardEnvironment);
const boardAllowedHosts = resolveTeamOpsBoardAllowedHosts();
const boardRoot = path.dirname(fileURLToPath(import.meta.url));
const soulforgeRoot = path.resolve(boardRoot, "../../..");
const providerQuotaReceiptPath = path.join(
  soulforgeRoot,
  "guild_hall",
  "state",
  "operations",
  "provider_quota",
  "claude",
  "statusline",
  "provider_quota.receipt.v1.json",
);

export default defineConfig({
  plugins: [
    react(),
    createLiveThreadAdapterPlugin({ env: boardEnvironment }),
    createAiUsageAdapterPlugin(),
    createTopologyAdapterPlugin(boardTopologyOptions),
    createTopologyFederationAdapterPlugin(),
    createHostStatsAdapterPlugin(),
    createClaudeUsageAdapterPlugin(),
    createAntigravityUsageAdapterPlugin(),
    createAntigravityQuotaAdapterPlugin({ env: boardEnvironment }),
    createProviderLimitsAdapterPlugin({ env: boardEnvironment, providerQuotaReceiptPath })
  ],
  server: {
    host: "127.0.0.1",
    port: 4192,
    allowedHosts: boardAllowedHosts
  },
  preview: {
    host: "127.0.0.1",
    port: 4193,
    allowedHosts: boardAllowedHosts
  }
});
