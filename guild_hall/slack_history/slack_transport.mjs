import { sha256Canonical } from "../shared/project_history_envelope.mjs";

export class SlackTransportError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "SlackTransportError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new SlackTransportError(code, message);
}

function assertLimit(limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    fail("transport_limit_invalid", "limit must be an integer from 1 to 1000");
  }
}

export function createSyntheticSlackTransport(records) {
  if (!Array.isArray(records)) fail("synthetic_records_invalid", "records must be an array");
  const retained = structuredClone(records);
  return Object.freeze({
    kind: "synthetic",
    async pull({ cursor_token: cursorToken = null, limit }) {
      assertLimit(limit);
      const offset = cursorToken === null
        ? 0
        : Number.parseInt(cursorToken.replace(/^synthetic:/u, ""), 10);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > retained.length) {
        fail("synthetic_cursor_invalid", "cursor token is outside the fixture");
      }
      const pageRecords = retained.slice(offset, offset + limit);
      const nextOffset = offset + pageRecords.length;
      const nextToken = nextOffset >= retained.length ? null : `synthetic:${nextOffset}`;
      return {
        page_id: `synthetic-page:${offset}:${nextOffset}`,
        previous_cursor_digest: cursorToken === null ? null : sha256Canonical(cursorToken),
        next_cursor_digest: nextToken === null ? null : sha256Canonical(nextToken),
        next_cursor_token: nextToken,
        records: structuredClone(pageRecords),
      };
    },
  });
}

export function createSlackWebApiCompatibleAdapter({ apiCall }) {
  if (typeof apiCall !== "function") {
    fail("api_call_required", "apiCall(method, params) must be injected");
  }
  return Object.freeze({
    kind: "web_api",
    async inspectChannel({ channel_id: channelId }) {
      return apiCall("conversations.info", {
        channel: channelId,
        include_num_members: false,
      });
    },
    async pullHistoryPage({ channel_id: channelId, cursor_token: cursorToken = null, limit }) {
      assertLimit(limit);
      return apiCall("conversations.history", {
        channel: channelId,
        cursor: cursorToken ?? undefined,
        inclusive: true,
        limit,
      });
    },
  });
}
