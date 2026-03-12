import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type ViteDevServer } from "vite";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "../..");

function deriveUiStatePlugin() {
  return {
    name: "soulforge-derive-ui-state",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/ui-state", (req, res, next) => {
        if (req.method !== "GET") {
          next();
          return;
        }

        const result = spawnSync(
          "python3",
          [".agent_class/tools/local_cli/ui_sync/ui_sync.py", "derive-ui-state", "--json"],
          {
            cwd: repoRoot,
            encoding: "utf-8"
          }
        );

        const body = result.stdout?.trim();

        res.setHeader("Content-Type", "application/json; charset=utf-8");

        if (!body) {
          res.statusCode = 500;
          res.end(
            JSON.stringify(
              {
                error: "derive-ui-state returned no JSON payload",
                stderr: result.stderr?.trim() || null
              },
              null,
              2
            )
          );
          return;
        }

        res.statusCode = result.status === 0 ? 200 : 207;
        res.end(body);
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), deriveUiStatePlugin()],
  server: {
    fs: {
      allow: [repoRoot]
    }
  }
});
