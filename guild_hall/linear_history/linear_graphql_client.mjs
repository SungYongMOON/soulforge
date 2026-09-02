// Minimal read-only Linear GraphQL client for the HPP collection lane.
//
// Boundary: this module can only POST `query` documents. It has no mutation
// document, no write helper, and no capability name that mutates Linear. The
// API key is read only through the binding's `credentials` object
// (`api_key_env`, then the identity-fenced `api_key_file`) with the exact
// boundary rule the Slack lane uses for its access token; the value is never
// logged, persisted, returned in receipts, or echoed in errors.

import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

export const LINEAR_GRAPHQL_ENDPOINT = "https://api.linear.app/graphql";
export const LINEAR_API_KEY_PATTERN = /^lin_(?:api|oauth)_[A-Za-z0-9]{16,}$/u;
export const LINEAR_READ_OPERATIONS = Object.freeze([
  "linear.read.viewer_organization",
  "linear.read.teams",
  "linear.read.users",
  "linear.read.projects",
  "linear.read.issue_labels",
  "linear.read.workflow_states",
  "linear.read.cycles",
  "linear.read.issues_window",
  "linear.read.comments_window",
]);
export const LINEAR_CATALOG_KINDS = Object.freeze([
  "teams",
  "users",
  "projects",
  "labels",
  "states",
  "cycles",
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const TIMELESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const MAX_TEXT_LENGTH = 262_144;

export class LinearClientError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "LinearClientError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new LinearClientError(code, message);
}

// ---------------------------------------------------------------------------
// Credential loading. This is the Slack lane's readApprovedCredentialFile /
// loadSlackAccessToken rule set applied to the Linear API key: the same
// private_root / data_root / forbidden_roots boundary, the same lstat / realpath
// / size / single-link checks, the same opened-handle identity check, and the
// same environment-then-file precedence. No different rule is invented here.
// ---------------------------------------------------------------------------

function normalizedBoundaryPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isPathWithin(parent, candidate, strict = false) {
  const relative = path.relative(normalizedBoundaryPath(parent), normalizedBoundaryPath(candidate));
  if (relative === "") return !strict;
  return relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function assertCredentialBoundary(filePath, options) {
  const privateRoot = options?.private_root;
  const dataRoot = options?.data_root;
  const forbiddenRoots = options?.forbidden_roots;
  if (typeof privateRoot !== "string"
    || !path.isAbsolute(privateRoot)
    || (dataRoot !== undefined && (typeof dataRoot !== "string" || !path.isAbsolute(dataRoot)))
    || !Array.isArray(forbiddenRoots)
    || forbiddenRoots.some((root) => typeof root !== "string" || !path.isAbsolute(root))) {
    fail("credential_boundary_required", "Credential file loading requires validated private boundaries");
  }
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)
    || !isPathWithin(privateRoot, filePath, true)
    || (dataRoot && (isPathWithin(dataRoot, filePath) || isPathWithin(filePath, dataRoot)))
    || forbiddenRoots.some((root) => isPathWithin(root, filePath) || isPathWithin(filePath, root))) {
    fail("credential_file_outside_owner", "Credential file is outside its approved private boundary");
  }
  return { privateRoot, dataRoot, forbiddenRoots };
}

async function readApprovedCredentialFile(filePath, options) {
  const { privateRoot, dataRoot, forbiddenRoots } = assertCredentialBoundary(filePath, options);
  const rootInfo = await lstat(privateRoot);
  const fileInfo = await lstat(filePath);
  if (!rootInfo.isDirectory()
    || rootInfo.isSymbolicLink()
    || !fileInfo.isFile()
    || fileInfo.isSymbolicLink()
    || fileInfo.nlink !== 1
    || fileInfo.size < 1
    || fileInfo.size > 4096) {
    fail("credential_file_unsafe", "Credential source must be a bounded normal file under a normal private root");
  }
  const [realRoot, realFile] = await Promise.all([
    realpath(privateRoot),
    realpath(filePath),
  ]);
  if (!isPathWithin(realRoot, realFile, true)
    || (dataRoot && (isPathWithin(dataRoot, realFile) || isPathWithin(realFile, dataRoot)))
    || forbiddenRoots.some((root) => isPathWithin(root, realFile) || isPathWithin(realFile, root))) {
    fail("credential_file_identity_escape", "Credential source resolves outside its approved private boundary");
  }

  const handle = await open(filePath, "r");
  try {
    const opened = await handle.stat();
    if (!opened.isFile()
      || opened.nlink !== 1
      || String(opened.dev) !== String(fileInfo.dev)
      || String(opened.ino) !== String(fileInfo.ino)
      || opened.size !== fileInfo.size) {
      fail("credential_file_identity_changed", "Credential source changed before it was opened");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (String(after.dev) !== String(opened.dev)
      || String(after.ino) !== String(opened.ino)
      || after.nlink !== 1
      || after.size !== opened.size
      || after.mtimeMs !== opened.mtimeMs) {
      fail("credential_file_identity_changed", "Credential source changed while it was read");
    }
    return bytes.toString("utf8").replace(/^\uFEFF/u, "").trim();
  } finally {
    await handle.close();
  }
}

// Preflight-only shape check: the same boundary, lstat and size rules without
// reading the credential bytes.
export async function assertApiKeyFileShape(filePath, options) {
  assertCredentialBoundary(filePath, options);
  let fileInfo;
  try {
    fileInfo = await lstat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") fail("credential_file_missing", "API key file is not present");
    throw error;
  }
  if (!fileInfo.isFile() || fileInfo.isSymbolicLink()
    || fileInfo.nlink !== 1 || fileInfo.size < 1 || fileInfo.size > 4096) {
    fail("credential_file_unsafe", "Credential source must be a bounded normal file");
  }
  return { size_bytes: fileInfo.size };
}

export async function loadLinearApiKey(credentials, environment = process.env, options = {}) {
  const envName = credentials?.api_key_env;
  const filePath = credentials?.api_key_file;
  const fromEnvironment = envName ? String(environment[envName] ?? "").trim() : "";
  let fromFile = "";
  if (!fromEnvironment && filePath) fromFile = await readApprovedCredentialFile(filePath, options);
  const key = fromEnvironment || fromFile;
  if (!LINEAR_API_KEY_PATTERN.test(key)) {
    fail("api_key_unavailable", "A valid Linear API key was not available from the approved private source");
  }
  return key;
}

// ---------------------------------------------------------------------------
// Read-only GraphQL call.
// ---------------------------------------------------------------------------

const MUTATION_TOKEN = /(?:^|[^A-Za-z0-9_])mutation(?![A-Za-z0-9_])/u;

export function assertReadOnlyDocument(document) {
  if (typeof document !== "string" || !/^\s*query\b/u.test(document)) {
    fail("read_only_document_required", "Only GraphQL query documents are allowed");
  }
  if (MUTATION_TOKEN.test(document)) {
    fail("mutation_document_forbidden", "Mutation documents are forbidden in this lane");
  }
  return document;
}

function authorizationHeader(apiKey) {
  // Personal API keys are sent raw; OAuth access tokens use the Bearer scheme.
  return apiKey.startsWith("lin_oauth_") ? `Bearer ${apiKey}` : apiKey;
}

function safeToken(value) {
  const candidate = String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "");
  return /^[a-z][a-z0-9_]{0,60}$/u.test(candidate) ? candidate : null;
}

const OPERATION_NAME_PATTERN = /^\s*query\s+([A-Za-z_][A-Za-z0-9_]*)/u;

// The request `operationName` must name the operation written in the document
// (`SoulforgeLinear*`); Linear answers HTTP 400 `INPUT_ERROR` "operation does
// not exist" before authentication when it does not. The lane's `linear.read.*`
// ids stay internal to the transport and receipts.
function documentOperationName(document) {
  const match = OPERATION_NAME_PATTERN.exec(document);
  return match === null ? undefined : match[1];
}

function graphqlErrorCode(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)
    || !Array.isArray(body.errors) || body.errors.length === 0) {
    return null;
  }
  const code = safeToken(body.errors[0]?.extensions?.code ?? body.errors[0]?.extensions?.type);
  return code ? `linear_graphql_${code}` : "linear_graphql_error";
}

export function createLinearGraphqlCall({
  api_key: apiKey,
  fetch_impl: fetchImpl = globalThis.fetch,
  timeout_ms: timeoutMs = 15_000,
  endpoint = LINEAR_GRAPHQL_ENDPOINT,
}) {
  if (!LINEAR_API_KEY_PATTERN.test(String(apiKey ?? ""))) {
    fail("api_key_invalid", "A Linear API key is required");
  }
  if (typeof fetchImpl !== "function") fail("fetch_unavailable", "fetch implementation is required");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) {
    fail("linear_timeout_invalid", "Linear request timeout must be an integer from 100 to 60000 milliseconds");
  }
  if (endpoint !== LINEAR_GRAPHQL_ENDPOINT) {
    fail("linear_endpoint_fixed", "The Linear GraphQL endpoint is fixed");
  }
  return async function linearReadCall(operationName, document, variables = {}) {
    assertReadOnlyDocument(document);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout.unref?.();
    let response;
    let body;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          authorization: authorizationHeader(apiKey),
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ query: document, variables, operationName: documentOperationName(document) }),
        signal: controller.signal,
        redirect: "error",
      });
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof LinearClientError) throw error;
      if (controller.signal.aborted) fail("linear_http_timeout", "Linear request exceeded its bounded timeout");
      fail("linear_http_failed", "Linear request failed");
    }
    try {
      if (response.status === 401 || response.status === 403) {
        fail("linear_auth_failed", "Linear rejected the configured credential");
      }
      if (response.status === 429) fail("linear_rate_limited", "Linear rate limit reached");
      try {
        body = await response.json();
      } catch (error) {
        if (controller.signal.aborted) fail("linear_http_timeout", "Linear response exceeded its bounded timeout");
        if (!response.ok) fail("linear_http_failed", `Linear HTTP status ${response.status}`);
        fail("linear_response_invalid", "Linear response was not JSON");
      }
      if (!response.ok) {
        // Linear reports request and validation problems as HTTP 400 with a
        // GraphQL `errors` body; surface that code instead of a bare HTTP failure
        // so a health receipt can name the offending query.
        fail(graphqlErrorCode(body) ?? "linear_http_failed", `Linear HTTP status ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      fail("linear_response_invalid", "Linear response envelope was not an object");
    }
    if (Array.isArray(body.errors) && body.errors.length > 0) {
      fail(graphqlErrorCode(body), "Linear returned a GraphQL error");
    }
    if (body.data === null || typeof body.data !== "object") {
      fail("linear_response_invalid", "Linear response had no data");
    }
    return body.data;
  };
}

// ---------------------------------------------------------------------------
// Query documents (all read-only) and normalizers.
// ---------------------------------------------------------------------------

const PAGE_INFO = "pageInfo { hasNextPage endCursor }";

export const LINEAR_QUERY_DOCUMENTS = Object.freeze({
  "linear.read.viewer_organization": `query SoulforgeLinearViewerOrganization {
  viewer { id name displayName email active admin createdAt updatedAt }
  organization { id name urlKey createdAt updatedAt }
}`,
  "linear.read.teams": `query SoulforgeLinearTeams($first: Int!, $after: String) {
  teams(first: $first, after: $after, includeArchived: true) {
    nodes { id key name description private timezone createdAt updatedAt archivedAt }
    ${PAGE_INFO}
  }
}`,
  "linear.read.users": `query SoulforgeLinearUsers($first: Int!, $after: String) {
  users(first: $first, after: $after, includeArchived: true) {
    nodes { id name displayName email active admin guest createdAt updatedAt archivedAt }
    ${PAGE_INFO}
  }
}`,
  "linear.read.projects": `query SoulforgeLinearProjects($first: Int!, $after: String) {
  projects(first: $first, after: $after, includeArchived: true) {
    nodes {
      id name slugId description priority startDate targetDate startedAt completedAt canceledAt
      createdAt updatedAt archivedAt
      status { id name type }
      lead { id }
      teams { nodes { id } }
    }
    ${PAGE_INFO}
  }
}`,
  "linear.read.issue_labels": `query SoulforgeLinearIssueLabels($first: Int!, $after: String) {
  issueLabels(first: $first, after: $after, includeArchived: true) {
    nodes { id name description color isGroup createdAt updatedAt archivedAt team { id } parent { id } }
    ${PAGE_INFO}
  }
}`,
  "linear.read.workflow_states": `query SoulforgeLinearWorkflowStates($first: Int!, $after: String) {
  workflowStates(first: $first, after: $after, includeArchived: true) {
    nodes { id name description type color position createdAt updatedAt archivedAt team { id } }
    ${PAGE_INFO}
  }
}`,
  "linear.read.cycles": `query SoulforgeLinearCycles($first: Int!, $after: String) {
  cycles(first: $first, after: $after, includeArchived: true) {
    nodes { id number name startsAt endsAt completedAt createdAt updatedAt archivedAt team { id } }
    ${PAGE_INFO}
  }
}`,
});

const CATALOG_OPERATIONS = Object.freeze({
  teams: ["linear.read.teams", "teams"],
  users: ["linear.read.users", "users"],
  projects: ["linear.read.projects", "projects"],
  labels: ["linear.read.issue_labels", "issueLabels"],
  states: ["linear.read.workflow_states", "workflowStates"],
  cycles: ["linear.read.cycles", "cycles"],
});

function assertIso(value, field) {
  if (typeof value !== "string" || !ISO_UTC_PATTERN.test(value)
    || new Date(value).toISOString() !== value) {
    fail("provider_shape_invalid", `Expected canonical UTC timestamp for ${field}`);
  }
  return value;
}

function windowLiteral(value, field) {
  return JSON.stringify(assertIso(value, field));
}

export function issuesWindowDocument({ lower, upper }) {
  return `query SoulforgeLinearIssuesWindow($first: Int!, $after: String) {
  issues(first: $first, after: $after, includeArchived: true, orderBy: updatedAt,
    filter: { updatedAt: { gte: ${windowLiteral(lower, "lower")}, lte: ${windowLiteral(upper, "upper")} } }) {
    nodes {
      id identifier number title description priority priorityLabel estimate url branchName
      createdAt updatedAt archivedAt startedAt completedAt canceledAt dueDate
      team { id key }
      state { id name type }
      assignee { id }
      creator { id }
      project { id }
      cycle { id }
      parent { id }
      labels { nodes { id } }
      relations { nodes { id type relatedIssue { id } } }
    }
    ${PAGE_INFO}
  }
}`;
}

export function commentsWindowDocument({ lower, upper }) {
  return `query SoulforgeLinearCommentsWindow($first: Int!, $after: String) {
  comments(first: $first, after: $after, includeArchived: true, orderBy: updatedAt,
    filter: { updatedAt: { gte: ${windowLiteral(lower, "lower")}, lte: ${windowLiteral(upper, "upper")} } }) {
    nodes {
      id body createdAt updatedAt editedAt archivedAt resolvedAt url
      user { id }
      issue { id identifier }
      parent { id }
    }
    ${PAGE_INFO}
  }
}`;
}

function plain(value, field) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("provider_shape_invalid", `Expected an object for ${field}`);
  }
  return value;
}

function uuid(value, field) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    fail("provider_shape_invalid", `Expected a UUID for ${field}`);
  }
  return value;
}

function nullableUuid(value, field) {
  return value === null || value === undefined ? null : uuid(value, field);
}

function refId(value, field) {
  if (value === null || value === undefined) return null;
  return uuid(plain(value, field).id, `${field}.id`);
}

function iso(value, field) {
  return assertIso(value, field);
}

function nullableIso(value, field) {
  return value === null || value === undefined ? null : iso(value, field);
}

function text(value, field, { nullable = false, max = MAX_TEXT_LENGTH } = {}) {
  if (value === null || value === undefined) {
    if (nullable) return null;
    fail("provider_shape_invalid", `Expected text for ${field}`);
  }
  if (typeof value !== "string" || value.length > max) {
    fail("provider_shape_invalid", `Expected bounded text for ${field}`);
  }
  // Custody digests require NFC; provider text is canonically equivalent
  // after normalization, so it is stored in that form.
  return value.normalize("NFC");
}

function nullableText(value, field, max) {
  return text(value, field, { nullable: true, max });
}

function nullableNumber(value, field) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("provider_shape_invalid", `Expected a finite number for ${field}`);
  }
  return value;
}

// Linear types `WorkflowState.position` as Float and fractional positions are
// normal (states inserted between neighbours). Custody digests admit only safe
// integers, so the value is kept as its shortest round-trip decimal text.
function nullableDecimalText(value, field) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("provider_shape_invalid", `Expected a finite number for ${field}`);
  }
  return String(value);
}

function nullableBoolean(value, field) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "boolean") fail("provider_shape_invalid", `Expected a boolean for ${field}`);
  return value;
}

function nullableTimelessDate(value, field) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !TIMELESS_DATE_PATTERN.test(value)) {
    fail("provider_shape_invalid", `Expected a timeless date for ${field}`);
  }
  return value;
}

function nodeIds(value, field) {
  const nodes = plain(value ?? { nodes: [] }, field).nodes ?? [];
  if (!Array.isArray(nodes)) fail("provider_shape_invalid", `Expected nodes for ${field}`);
  return nodes.map((node, index) => uuid(plain(node, `${field}[${index}]`).id, `${field}[${index}].id`)).sort();
}

export function normalizeWorkspace(data) {
  const viewer = plain(plain(data, "$data").viewer, "$data.viewer");
  const organization = plain(data.organization, "$data.organization");
  return {
    organization: {
      id: uuid(organization.id, "organization.id"),
      name: text(organization.name, "organization.name", { max: 512 }),
      url_key: text(organization.urlKey, "organization.urlKey", { max: 128 }),
      created_at: nullableIso(organization.createdAt, "organization.createdAt"),
      updated_at: nullableIso(organization.updatedAt, "organization.updatedAt"),
    },
    viewer: {
      id: uuid(viewer.id, "viewer.id"),
      name: nullableText(viewer.name, "viewer.name", 512),
      display_name: nullableText(viewer.displayName, "viewer.displayName", 512),
      email: nullableText(viewer.email, "viewer.email", 512),
      active: nullableBoolean(viewer.active, "viewer.active"),
      admin: nullableBoolean(viewer.admin, "viewer.admin"),
      created_at: nullableIso(viewer.createdAt, "viewer.createdAt"),
      updated_at: nullableIso(viewer.updatedAt, "viewer.updatedAt"),
    },
  };
}

export function normalizeTeam(node) {
  plain(node, "team");
  return {
    id: uuid(node.id, "team.id"),
    key: text(node.key, "team.key", { max: 64 }),
    name: text(node.name, "team.name", { max: 512 }),
    description: nullableText(node.description, "team.description"),
    private: nullableBoolean(node.private, "team.private"),
    timezone: nullableText(node.timezone, "team.timezone", 128),
    created_at: iso(node.createdAt, "team.createdAt"),
    updated_at: iso(node.updatedAt, "team.updatedAt"),
    archived_at: nullableIso(node.archivedAt, "team.archivedAt"),
  };
}

export function normalizeUser(node) {
  plain(node, "user");
  return {
    id: uuid(node.id, "user.id"),
    name: nullableText(node.name, "user.name", 512),
    display_name: nullableText(node.displayName, "user.displayName", 512),
    email: nullableText(node.email, "user.email", 512),
    active: nullableBoolean(node.active, "user.active"),
    admin: nullableBoolean(node.admin, "user.admin"),
    guest: nullableBoolean(node.guest, "user.guest"),
    created_at: iso(node.createdAt, "user.createdAt"),
    updated_at: iso(node.updatedAt, "user.updatedAt"),
    archived_at: nullableIso(node.archivedAt, "user.archivedAt"),
  };
}

export function normalizeProject(node) {
  plain(node, "project");
  const status = node.status === null || node.status === undefined ? null : plain(node.status, "project.status");
  return {
    id: uuid(node.id, "project.id"),
    name: text(node.name, "project.name", { max: 512 }),
    slug_id: nullableText(node.slugId, "project.slugId", 128),
    description: nullableText(node.description, "project.description"),
    priority: nullableNumber(node.priority, "project.priority"),
    status_id: status === null ? null : uuid(status.id, "project.status.id"),
    status_name: status === null ? null : nullableText(status.name, "project.status.name", 256),
    status_type: status === null ? null : nullableText(status.type, "project.status.type", 64),
    start_date: nullableTimelessDate(node.startDate, "project.startDate"),
    target_date: nullableTimelessDate(node.targetDate, "project.targetDate"),
    started_at: nullableIso(node.startedAt, "project.startedAt"),
    completed_at: nullableIso(node.completedAt, "project.completedAt"),
    canceled_at: nullableIso(node.canceledAt, "project.canceledAt"),
    created_at: iso(node.createdAt, "project.createdAt"),
    updated_at: iso(node.updatedAt, "project.updatedAt"),
    archived_at: nullableIso(node.archivedAt, "project.archivedAt"),
    lead_id: refId(node.lead, "project.lead"),
    team_ids: nodeIds(node.teams, "project.teams"),
  };
}

export function normalizeLabel(node) {
  plain(node, "label");
  return {
    id: uuid(node.id, "label.id"),
    name: text(node.name, "label.name", { max: 512 }),
    description: nullableText(node.description, "label.description"),
    color: nullableText(node.color, "label.color", 32),
    is_group: nullableBoolean(node.isGroup, "label.isGroup"),
    created_at: iso(node.createdAt, "label.createdAt"),
    updated_at: iso(node.updatedAt, "label.updatedAt"),
    archived_at: nullableIso(node.archivedAt, "label.archivedAt"),
    team_id: refId(node.team, "label.team"),
    parent_id: refId(node.parent, "label.parent"),
  };
}

export function normalizeState(node) {
  plain(node, "state");
  return {
    id: uuid(node.id, "state.id"),
    name: text(node.name, "state.name", { max: 256 }),
    description: nullableText(node.description, "state.description"),
    type: text(node.type, "state.type", { max: 64 }),
    color: nullableText(node.color, "state.color", 32),
    position: nullableDecimalText(node.position, "state.position"),
    created_at: iso(node.createdAt, "state.createdAt"),
    updated_at: iso(node.updatedAt, "state.updatedAt"),
    archived_at: nullableIso(node.archivedAt, "state.archivedAt"),
    team_id: refId(node.team, "state.team"),
  };
}

export function normalizeCycle(node) {
  plain(node, "cycle");
  return {
    id: uuid(node.id, "cycle.id"),
    number: nullableNumber(node.number, "cycle.number"),
    name: nullableText(node.name, "cycle.name", 512),
    starts_at: nullableIso(node.startsAt, "cycle.startsAt"),
    ends_at: nullableIso(node.endsAt, "cycle.endsAt"),
    completed_at: nullableIso(node.completedAt, "cycle.completedAt"),
    created_at: iso(node.createdAt, "cycle.createdAt"),
    updated_at: iso(node.updatedAt, "cycle.updatedAt"),
    archived_at: nullableIso(node.archivedAt, "cycle.archivedAt"),
    team_id: refId(node.team, "cycle.team"),
  };
}

export function normalizeIssue(node) {
  plain(node, "issue");
  const team = plain(node.team, "issue.team");
  const state = plain(node.state, "issue.state");
  const relationNodes = plain(node.relations ?? { nodes: [] }, "issue.relations").nodes ?? [];
  if (!Array.isArray(relationNodes)) fail("provider_shape_invalid", "Expected relation nodes");
  const relations = relationNodes.map((relation, index) => {
    plain(relation, `issue.relations[${index}]`);
    return {
      id: uuid(relation.id, `issue.relations[${index}].id`),
      type: text(relation.type, `issue.relations[${index}].type`, { max: 64 }),
      related_issue_id: refId(relation.relatedIssue, `issue.relations[${index}].relatedIssue`),
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  return {
    id: uuid(node.id, "issue.id"),
    identifier: text(node.identifier, "issue.identifier", { max: 64 }),
    number: nullableNumber(node.number, "issue.number"),
    title: text(node.title, "issue.title", { max: 4096 }),
    description: nullableText(node.description, "issue.description"),
    priority: nullableNumber(node.priority, "issue.priority"),
    priority_label: nullableText(node.priorityLabel, "issue.priorityLabel", 64),
    estimate: nullableNumber(node.estimate, "issue.estimate"),
    url: nullableText(node.url, "issue.url", 2048),
    branch_name: nullableText(node.branchName, "issue.branchName", 512),
    created_at: iso(node.createdAt, "issue.createdAt"),
    updated_at: iso(node.updatedAt, "issue.updatedAt"),
    archived_at: nullableIso(node.archivedAt, "issue.archivedAt"),
    started_at: nullableIso(node.startedAt, "issue.startedAt"),
    completed_at: nullableIso(node.completedAt, "issue.completedAt"),
    canceled_at: nullableIso(node.canceledAt, "issue.canceledAt"),
    due_date: nullableTimelessDate(node.dueDate, "issue.dueDate"),
    team_id: uuid(team.id, "issue.team.id"),
    team_key: text(team.key, "issue.team.key", { max: 64 }),
    state_id: uuid(state.id, "issue.state.id"),
    state_name: text(state.name, "issue.state.name", { max: 256 }),
    state_type: text(state.type, "issue.state.type", { max: 64 }),
    assignee_id: refId(node.assignee, "issue.assignee"),
    creator_id: refId(node.creator, "issue.creator"),
    project_id: refId(node.project, "issue.project"),
    cycle_id: refId(node.cycle, "issue.cycle"),
    parent_id: refId(node.parent, "issue.parent"),
    label_ids: nodeIds(node.labels, "issue.labels"),
    relations,
  };
}

export function normalizeComment(node) {
  plain(node, "comment");
  const issue = plain(node.issue, "comment.issue");
  return {
    id: uuid(node.id, "comment.id"),
    body: nullableText(node.body, "comment.body"),
    created_at: iso(node.createdAt, "comment.createdAt"),
    updated_at: iso(node.updatedAt, "comment.updatedAt"),
    edited_at: nullableIso(node.editedAt, "comment.editedAt"),
    archived_at: nullableIso(node.archivedAt, "comment.archivedAt"),
    resolved_at: nullableIso(node.resolvedAt, "comment.resolvedAt"),
    url: nullableText(node.url, "comment.url", 2048),
    user_id: refId(node.user, "comment.user"),
    issue_id: uuid(issue.id, "comment.issue.id"),
    issue_identifier: nullableText(issue.identifier, "comment.issue.identifier", 64),
    parent_id: refId(node.parent, "comment.parent"),
  };
}

export const LINEAR_NORMALIZERS = Object.freeze({
  teams: normalizeTeam,
  users: normalizeUser,
  projects: normalizeProject,
  labels: normalizeLabel,
  states: normalizeState,
  cycles: normalizeCycle,
  issues: normalizeIssue,
  comments: normalizeComment,
});

export function normalizeConnectionPage(connection, normalizer, field) {
  const page = plain(connection, field);
  if (!Array.isArray(page.nodes)) fail("provider_shape_invalid", `Expected nodes for ${field}`);
  const pageInfo = plain(page.pageInfo ?? {}, `${field}.pageInfo`);
  const hasNextPage = pageInfo.hasNextPage === true;
  const endCursor = pageInfo.endCursor === null || pageInfo.endCursor === undefined
    ? null
    : text(pageInfo.endCursor, `${field}.pageInfo.endCursor`, { max: 4096 });
  if (hasNextPage && endCursor === null) {
    fail("provider_shape_invalid", `Continuation without cursor for ${field}`);
  }
  return {
    nodes: page.nodes.map((node) => normalizer(node)),
    has_next_page: hasNextPage,
    end_cursor: hasNextPage ? endCursor : null,
  };
}

// ---------------------------------------------------------------------------
// Live transport: the only surface that touches the network.
// ---------------------------------------------------------------------------

export function createLinearGraphqlTransport({
  api_key: apiKey,
  fetch_impl: fetchImpl = globalThis.fetch,
  timeout_ms: timeoutMs = 15_000,
  page_size: pageSize = 50,
}) {
  const call = createLinearGraphqlCall({ api_key: apiKey, fetch_impl: fetchImpl, timeout_ms: timeoutMs });
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    fail("page_size_invalid", "Page size must be an integer from 1 to 100");
  }
  return Object.freeze({
    kind: "graphql",
    async readWorkspace() {
      const operation = "linear.read.viewer_organization";
      return normalizeWorkspace(await call(operation, LINEAR_QUERY_DOCUMENTS[operation], {}));
    },
    async readCatalogPage(kind, after = null) {
      const entry = CATALOG_OPERATIONS[kind];
      if (entry === undefined) fail("catalog_kind_invalid", "Unknown catalog kind");
      const [operation, field] = entry;
      const data = await call(operation, LINEAR_QUERY_DOCUMENTS[operation], { first: pageSize, after });
      return normalizeConnectionPage(data[field], LINEAR_NORMALIZERS[kind], field);
    },
    async readIssuesPage({ lower, upper, after = null }) {
      const data = await call("linear.read.issues_window", issuesWindowDocument({ lower, upper }), {
        first: pageSize,
        after,
      });
      return normalizeConnectionPage(data.issues, normalizeIssue, "issues");
    },
    async readCommentsPage({ lower, upper, after = null }) {
      const data = await call("linear.read.comments_window", commentsWindowDocument({ lower, upper }), {
        first: pageSize,
        after,
      });
      return normalizeConnectionPage(data.comments, normalizeComment, "comments");
    },
  });
}

export function operationForCatalogKind(kind) {
  const entry = CATALOG_OPERATIONS[kind];
  if (entry === undefined) fail("catalog_kind_invalid", "Unknown catalog kind");
  return entry[0];
}
