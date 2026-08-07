import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createAiUsageAdapterPlugin } from "./src/server/ai-usage-adapter.mjs";
import { createLiveThreadAdapterPlugin } from "./src/server/live-thread-adapter.mjs";
import { createTopologyAdapterPlugin } from "./src/server/topology-adapter.mjs";

export default defineConfig({
  plugins: [react(), createLiveThreadAdapterPlugin(), createAiUsageAdapterPlugin(), createTopologyAdapterPlugin()],
  server: {
    host: "127.0.0.1",
    port: 4192
  },
  preview: {
    host: "127.0.0.1",
    port: 4193
  }
});
