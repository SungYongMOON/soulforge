import {
  loadPersistedUsageEvents,
  summarizeUsageEvents,
} from "./usage_meter.mjs";
import { upsertUsageBinding } from "./binding_store.mjs";

const READ_ONLY = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});
const SAFE_WRITE = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

function selected(events, filters = {}) {
  const match = (actual, expected) => expected === undefined || expected === null || actual === expected;
  if (filters.from && !Number.isFinite(Date.parse(filters.from))) throw new TypeError("from_timestamp_invalid");
  if (filters.to && !Number.isFinite(Date.parse(filters.to))) throw new TypeError("to_timestamp_invalid");
  const from = filters.from ? new Date(filters.from).toISOString() : null;
  const to = filters.to ? new Date(filters.to).toISOString() : null;
  return events.filter((event) => (
    match(event.organization_id, filters.organization_id)
    && match(event.team_id, filters.team_id)
    && match(event.project_id, filters.project_id)
    && match(event.work_id, filters.work_id)
    && match(event.thread_id, filters.thread_id)
    && match(event.turn_id, filters.turn_id)
    && match(event.model.id, filters.model_id)
    && match(event.actor.agent_id, filters.agent_id)
    && (!from || event.time.started_at >= from)
    && (!to || event.time.started_at < to)
  ));
}

function safeDetail(event) {
  return {
    event_id: event.event_id,
    organization_id: event.organization_id,
    team_id: event.team_id,
    project_id: event.project_id,
    work_id: event.work_id,
    thread_id: event.thread_id,
    turn_id: event.turn_id,
    parent_thread_id: event.parent_thread_id,
    root_thread_id: event.root_thread_id,
    root_turn_id: event.root_turn_id,
    actor: event.actor,
    model: event.model,
    usage: event.usage,
    credits: event.credits,
    time: event.time,
    measurement: event.measurement,
    privacy: event.privacy,
  };
}

export function createUsageMeterMcpHandlers({ stateRoot } = {}) {
  if (!stateRoot) throw new TypeError("usage_meter_state_root_required");
  return {
    usage_meter_summary: async (input = {}) => {
      const events = selected(await loadPersistedUsageEvents(stateRoot), input);
      return summarizeUsageEvents(events);
    },
    usage_meter_work_detail: async ({ work_id, limit = 100 } = {}) => {
      if (typeof work_id !== "string" || !work_id) throw new TypeError("work_id_required");
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new TypeError("limit_invalid");
      const events = selected(await loadPersistedUsageEvents(stateRoot), { work_id });
      return {
        schema_version: "soulforge.ai_usage_work_detail.v1",
        work_id,
        event_count: events.length,
        returned_event_count: Math.min(events.length, limit),
        truncated: events.length > limit,
        summary: summarizeUsageEvents(events),
        events: events.slice(-limit).map(safeDetail),
      };
    },
    usage_meter_bind_work: async (input = {}) => upsertUsageBinding(stateRoot, input),
  };
}

function toolResult(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function guarded(handler) {
  return async (input) => {
    try { return toolResult(await handler(input || {})); }
    catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: error?.code || error?.message || "usage_meter_tool_failed" }) }],
      };
    }
  };
}

export function registerUsageMeterMcpTools(server, { stateRoot, z } = {}) {
  if (!server?.registerTool || !z) throw new TypeError("usage_meter_mcp_context_required");
  const handlers = createUsageMeterMcpHandlers({ stateRoot });
  const optionalId = () => z.string().min(1).max(120).optional();
  server.registerTool("usage_meter_summary", {
    title: "AI usage summary",
    description: "Read metadata-only AI token and credit totals by organization, team, project, work, model, and agent.",
    inputSchema: {
      organization_id: optionalId(),
      team_id: optionalId(),
      project_id: optionalId(),
      work_id: optionalId(),
      thread_id: optionalId(),
      turn_id: optionalId(),
      model_id: optionalId(),
      agent_id: z.string().min(1).max(512).optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    },
    annotations: READ_ONLY,
  }, guarded(handlers.usage_meter_summary));
  server.registerTool("usage_meter_work_detail", {
    title: "AI usage work detail",
    description: "Read safe turn-level metadata for one work ID; prompt, reasoning, and tool payloads are never returned.",
    inputSchema: {
      work_id: z.string().min(1).max(120),
      limit: z.number().int().min(1).max(500).default(100),
    },
    annotations: READ_ONLY,
  }, guarded(handlers.usage_meter_work_detail));
  server.registerTool("usage_meter_bind_work", {
    title: "Bind a Codex thread to work",
    description: "Bind one Codex thread or turn to an organization-approved work, project, team, and optional role.",
    inputSchema: {
      thread_id: z.string().min(1).max(120),
      turn_id: z.string().min(1).max(120).nullable().default(null),
      work_id: z.string().min(1).max(120),
      project_id: z.string().min(1).max(120).nullable().default(null),
      team_id: z.string().min(1).max(120).nullable().default(null),
      role: z.string().min(1).max(120).nullable().default(null),
    },
    annotations: SAFE_WRITE,
  }, guarded(handlers.usage_meter_bind_work));
  return server;
}
