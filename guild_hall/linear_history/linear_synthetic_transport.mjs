// Synthetic Linear transport over a recorded, GraphQL-shaped fixture.
//
// Used only by tests and dry validation: it serves the same normalized page
// shapes as the live transport without any network, credential, or clock
// dependency. The fixture is public-safe synthetic metadata.

import { readFile } from "node:fs/promises";

import {
  LINEAR_CATALOG_KINDS,
  LINEAR_NORMALIZERS,
  normalizeWorkspace,
} from "./linear_graphql_client.mjs";

export const LINEAR_SYNTHETIC_FIXTURE_SCHEMA_VERSION = "soulforge.linear_collect.synthetic_fixture.v1";

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

export async function loadSyntheticLinearFixture(fixturePath) {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  if (fixture?.schema_version !== LINEAR_SYNTHETIC_FIXTURE_SCHEMA_VERSION) {
    fail("synthetic_fixture_invalid", "Unexpected synthetic fixture schema");
  }
  return fixture;
}

function paginate(rows, after, pageSize) {
  const offset = after === null ? 0 : Number.parseInt(String(after).replace(/^synthetic:/u, ""), 10);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > rows.length) {
    fail("synthetic_cursor_invalid", "Cursor is outside the fixture");
  }
  const nodes = rows.slice(offset, offset + pageSize);
  const nextOffset = offset + nodes.length;
  const hasNextPage = nextOffset < rows.length;
  return {
    nodes,
    has_next_page: hasNextPage,
    end_cursor: hasNextPage ? `synthetic:${nextOffset}` : null,
  };
}

function windowed(rows, { lower, upper }, order) {
  const lowerMs = Date.parse(lower);
  const upperMs = Date.parse(upper);
  const retained = rows.filter((row) => {
    const updated = Date.parse(row.updated_at);
    return updated >= lowerMs && updated <= upperMs;
  });
  retained.sort((left, right) => {
    const delta = Date.parse(left.updated_at) - Date.parse(right.updated_at);
    if (delta !== 0) return order === "ascending" ? delta : -delta;
    return left.id.localeCompare(right.id);
  });
  if (order === "shuffled") {
    // Deterministic non-monotonic order: interleave halves.
    const half = Math.ceil(retained.length / 2);
    const first = retained.slice(0, half);
    const second = retained.slice(half);
    return first.flatMap((row, index) => (second[index] ? [row, second[index]] : [row]));
  }
  return retained;
}

export function createSyntheticLinearTransport(fixture, {
  order = "descending",
  page_size: pageSize = 2,
  calls = [],
} = {}) {
  if (fixture?.schema_version !== LINEAR_SYNTHETIC_FIXTURE_SCHEMA_VERSION) {
    fail("synthetic_fixture_invalid", "Unexpected synthetic fixture schema");
  }
  if (!["ascending", "descending", "shuffled"].includes(order)) {
    fail("synthetic_order_invalid", "Unknown synthetic order");
  }
  const working = structuredClone(fixture);
  const normalizedCatalog = (kind) => working[kind]
    .map((node) => LINEAR_NORMALIZERS[kind](node))
    .sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze({
    kind: "synthetic",
    fixture: working,
    async readWorkspace() {
      calls.push({ operation: "linear.read.viewer_organization" });
      return normalizeWorkspace(working.workspace);
    },
    async readCatalogPage(kind, after = null) {
      if (!LINEAR_CATALOG_KINDS.includes(kind)) fail("catalog_kind_invalid", "Unknown catalog kind");
      calls.push({ operation: `catalog:${kind}`, after });
      return paginate(normalizedCatalog(kind), after, pageSize);
    },
    async readIssuesPage({ lower, upper, after = null }) {
      calls.push({ operation: "linear.read.issues_window", lower, upper, after });
      const rows = windowed(working.issues.map((node) => LINEAR_NORMALIZERS.issues(node)), { lower, upper }, order);
      return paginate(rows, after, pageSize);
    },
    async readCommentsPage({ lower, upper, after = null }) {
      calls.push({ operation: "linear.read.comments_window", lower, upper, after });
      const rows = windowed(working.comments.map((node) => LINEAR_NORMALIZERS.comments(node)), { lower, upper }, order);
      return paginate(rows, after, pageSize);
    },
  });
}
