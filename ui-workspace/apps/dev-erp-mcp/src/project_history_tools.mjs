import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const READ_ONLY = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

const READ_ONLY_TICKET = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
});

const PATH_ID = z.string().min(1).max(256);

export const PROJECT_HISTORY_MCP_INSTRUCTIONS = `This feature-OFF server reads exactly one private-binding- and artifact-manifest-attested generation from an existing copied ERP database. Always provide both project_id and generation_id. There is no latest-generation or raw-source fallback. Download tools return only a short-lived one-time ticket and safe metadata; fetch artifact bytes from the returned localhost URL outside MCP JSON.`;

function result(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function errorResult() {
  const payload = { error: "project_history_unavailable" };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

function guarded(handler) {
  return async (input) => {
    try {
      return result(await handler(input || {}));
    } catch {
      return errorResult();
    }
  };
}

export function createProjectHistoryMcpToolServer({ service, requestBaseUrl } = {}) {
  if (!service || !(requestBaseUrl instanceof URL)) throw new TypeError("project_history_tool_context_required");
  const server = new McpServer(
    { name: "soulforge-project-history", version: "0.1.0" },
    { instructions: PROJECT_HISTORY_MCP_INSTRUCTIONS },
  );

  server.registerTool("erp_get_project_history", {
    title: "Read exact copied-project history",
    description: "Read the bounded event and coverage rows for one explicit project_id and generation_id from the attested copied ERP database.",
    inputSchema: {
      project_id: PATH_ID,
      generation_id: PATH_ID,
    },
    annotations: READ_ONLY,
  }, guarded(({ project_id, generation_id }) => service.getProjectHistory(project_id, generation_id)));

  server.registerTool("erp_prepare_project_history_download", {
    title: "Prepare exact copied-project history download",
    description: "Prepare a short-lived one-time localhost URL for the server-bound CSV or XLSX artifact. Client paths are not accepted.",
    inputSchema: {
      project_id: PATH_ID,
      generation_id: PATH_ID,
      format: z.enum(["csv", "xlsx"]),
    },
    annotations: READ_ONLY_TICKET,
  }, guarded(({ project_id, generation_id, format }) => {
    const prepared = service.prepareDownload(project_id, generation_id, format);
    return {
      ...prepared,
      download_url: new URL(`/download/${encodeURIComponent(prepared.ticket)}`, requestBaseUrl).toString(),
      one_time: true,
    };
  }));

  return server;
}
