import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createAiUsageAdapterPlugin } from "./src/server/ai-usage-adapter.mjs";
import { createAntigravityUsageAdapterPlugin } from "./src/server/antigravity-usage-adapter.mjs";
import { createClaudeUsageAdapterPlugin } from "./src/server/claude-usage-adapter.mjs";
import { createHostStatsAdapterPlugin } from "./src/server/host-stats-adapter.mjs";
import { createLiveThreadAdapterPlugin } from "./src/server/live-thread-adapter.mjs";
import { createProviderLimitsAdapterPlugin } from "./src/server/provider-limits-adapter.mjs";
import { createTopologyAdapterPlugin } from "./src/server/topology-adapter.mjs";

export default defineConfig({
  plugins: [
    react(),
    createLiveThreadAdapterPlugin(),
    createAiUsageAdapterPlugin(),
    createTopologyAdapterPlugin(),
    createHostStatsAdapterPlugin(),
    createClaudeUsageAdapterPlugin(),
    createAntigravityUsageAdapterPlugin(),
    createProviderLimitsAdapterPlugin()
  ],
  server: {
    host: "127.0.0.1",
    port: 4192
  },
  preview: {
    host: "127.0.0.1",
    port: 4193
  }
});
