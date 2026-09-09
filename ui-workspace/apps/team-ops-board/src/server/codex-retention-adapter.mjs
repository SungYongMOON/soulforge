import {
  readCodexRetentionProjection,
  unavailableProjection,
  CODEX_RETENTION_ENDPOINT_PATH
} from "../core/codex-retention-projection.mjs";
import { isDirectLoopbackRequest } from "./loopback-request-guard.mjs";

export function createCodexRetentionServerAdapter(options = {}) {
  const configure = (server) => {
    server.middlewares.use((request, response, next) => {
      let url;
      try {
        url = new URL(request.url || "/", "http://127.0.0.1");
      } catch {
        response.statusCode = 400;
        response.end();
        return;
      }

      if (url.pathname !== CODEX_RETENTION_ENDPOINT_PATH) {
        next();
        return;
      }

      if (request.method !== "GET") {
        response.statusCode = 405;
        response.setHeader("Allow", "GET");
        response.end();
        return;
      }

      if (!isDirectLoopbackRequest(request)) {
        response.statusCode = 403;
        response.end();
        return;
      }

      void readCodexRetentionProjection(options).then((projection) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(JSON.stringify(projection));
      }, () => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(JSON.stringify(unavailableProjection("codex_retention_report_unreadable")));
      });
    });
  };

  return {
    name: "soulforge-codex-retention-adapter",
    configureServer: configure,
    configurePreviewServer: configure
  };
}
