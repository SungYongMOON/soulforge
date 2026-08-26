import { createHash } from "node:crypto";

const REQUEST_SCHEMA = "development_team1_project_bootstrap_v0.request";
const REGISTER_SCHEMA = "development_team1_project_bootstrap_v0.register_snapshot";
const PREVIEW_SCHEMA = "development_team1_project_bootstrap_v0.preview";
const INTERNAL_CODE = /^D1-([0-9]{2})-([0-9]{3})$/u;
const FORMAL_CODE = /^P[0-9]{2}-[0-9]{3}$/u;
const INTEGRATION_STATES = new Set(["hold", "not_requested", "approved"]);

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTitle(value) {
  return cleanString(value).replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex")}`;
}

function addUnique(rows, value) {
  if (!rows.includes(value)) rows.push(value);
}

function projectRows(registerSnapshot, blockers) {
  if (!isPlainObject(registerSnapshot) || registerSnapshot.schema_version !== REGISTER_SCHEMA) {
    addUnique(blockers, "REGISTER_SNAPSHOT_INVALID");
    return [];
  }
  if (!Array.isArray(registerSnapshot.projects)) {
    addUnique(blockers, "REGISTER_PROJECTS_INVALID");
    return [];
  }
  const rows = [];
  for (const row of registerSnapshot.projects) {
    if (!isPlainObject(row) || !cleanString(row.code) || !cleanString(row.title)) {
      addUnique(blockers, "REGISTER_PROJECT_ROW_INVALID");
      continue;
    }
    rows.push({ code: cleanString(row.code), title: cleanString(row.title) });
  }
  return rows;
}

function resolveInternalCode(request, rows, blockers) {
  const year = request.project_year;
  if (!Number.isInteger(year) || year < 2000 || year > 2099) {
    addUnique(blockers, "PROJECT_YEAR_INVALID");
    return null;
  }
  const yy = String(year).slice(-2);
  const used = rows
    .map((row) => INTERNAL_CODE.exec(row.code))
    .filter((match) => match && match[1] === yy)
    .map((match) => Number(match[2]));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  if (next > 999) {
    addUnique(blockers, "INTERNAL_CODE_SEQUENCE_EXHAUSTED");
    return null;
  }
  const proposed = `D1-${yy}-${String(next).padStart(3, "0")}`;
  const requested = cleanString(request.identity?.requested_code);
  if (requested) {
    if (rows.some((row) => row.code === requested)) addUnique(blockers, "DUPLICATE_PROJECT_CODE");
    else if (requested !== proposed) addUnique(blockers, "NON_SEQUENTIAL_INTERNAL_CODE");
    return requested;
  }
  return proposed;
}

function resolveFormalCode(request, rows, blockers) {
  const requested = cleanString(request.identity?.requested_code);
  if (!FORMAL_CODE.test(requested)) addUnique(blockers, "FORMAL_PROJECT_CODE_INVALID_OR_MISSING");
  if (!cleanString(request.authority?.project_code_authority_ref)) {
    addUnique(blockers, "FORMAL_PROJECT_CODE_AUTHORITY_MISSING");
  }
  if (rows.some((row) => row.code === requested)) addUnique(blockers, "DUPLICATE_PROJECT_CODE");
  return requested || null;
}

function validatePeople(request, blockers) {
  const people = request.people;
  if (!isPlainObject(people)) {
    addUnique(blockers, "PEOPLE_PACKET_MISSING");
    return;
  }
  const responsible = cleanString(people.development_responsible);
  const practical = cleanString(people.practical_owner);
  const members = Array.isArray(people.team_members) ? people.team_members.map(cleanString).filter(Boolean) : [];
  if (!responsible) addUnique(blockers, "DEVELOPMENT_RESPONSIBLE_MISSING");
  if (!practical) addUnique(blockers, "PRACTICAL_OWNER_MISSING");
  if (members.length === 0) addUnique(blockers, "TEAM_MEMBERS_MISSING");
  if (responsible && !members.includes(responsible)) addUnique(blockers, "DEVELOPMENT_RESPONSIBLE_NOT_IN_TEAM");
  if (practical && !members.includes(practical)) addUnique(blockers, "PRACTICAL_OWNER_NOT_IN_TEAM");
  if (new Set(members).size !== members.length) addUnique(blockers, "TEAM_MEMBER_DUPLICATE");
}

function validateBoundaries(request, blockers) {
  const storage = request.storage;
  if (!isPlainObject(storage)
    || !cleanString(storage.project_payload_owner_ref)
    || !cleanString(storage.metadata_owner_ref)
    || !cleanString(storage.bot_workspace_policy_ref)) {
    addUnique(blockers, "STORAGE_BOUNDARY_INCOMPLETE");
  }
  const source = request.source_boundary;
  if (!isPlainObject(source) || !cleanString(source.approved_source_owner_ref)) {
    addUnique(blockers, "SOURCE_BOUNDARY_INCOMPLETE");
  }
  if (!isPlainObject(source) || source.raw_payload_in_workmeta !== false) {
    addUnique(blockers, "RAW_PAYLOAD_WORKMETA_BOUNDARY_INVALID");
  }
}

function validateIntegrations(request, blockers) {
  const integrations = isPlainObject(request.integrations) ? request.integrations : {};
  const states = {};
  for (const name of ["slack", "linear", "drive", "calendar"]) {
    const item = isPlainObject(integrations[name]) ? integrations[name] : { state: "hold", authority_ref: null };
    const state = cleanString(item.state) || "hold";
    states[name] = state;
    if (!INTEGRATION_STATES.has(state)) addUnique(blockers, `INTEGRATION_STATE_INVALID:${name}`);
    if (state === "approved" && !cleanString(item.authority_ref)) {
      addUnique(blockers, `INTEGRATION_AUTHORITY_MISSING:${name}`);
    }
  }
  return states;
}

export function evaluateProjectBootstrapPreview(request, registerSnapshot) {
  const blockers = [];
  const warnings = [];
  if (!isPlainObject(request) || request.schema_version !== REQUEST_SCHEMA) {
    addUnique(blockers, "REQUEST_SCHEMA_INVALID");
  }
  if (request?.mode !== "preview") addUnique(blockers, "PREFLIGHT_PREVIEW_MODE_REQUIRED");
  if (request?.authority?.owner_project_creation_approved !== true
    || !cleanString(request?.authority?.owner_decision_ref)) {
    addUnique(blockers, "OWNER_PROJECT_CREATION_AUTHORITY_MISSING");
  }
  const title = cleanString(request?.identity?.title);
  const normalizedTitle = normalizeTitle(title);
  if (!title) addUnique(blockers, "PROJECT_TITLE_MISSING");
  if (!cleanString(request?.identity?.alias)) addUnique(blockers, "PROJECT_ALIAS_MISSING");
  if (!cleanString(request?.identity?.objective)) addUnique(blockers, "PROJECT_OBJECTIVE_MISSING");

  const rows = projectRows(registerSnapshot, blockers);
  if (normalizedTitle && rows.some((row) => normalizeTitle(row.title) === normalizedTitle)) {
    addUnique(blockers, "DUPLICATE_PROJECT_TITLE");
  }

  let proposedProjectCode = null;
  if (request?.project_kind === "internal") {
    proposedProjectCode = resolveInternalCode(request, rows, blockers);
  } else if (request?.project_kind === "formal") {
    proposedProjectCode = resolveFormalCode(request, rows, blockers);
  } else {
    addUnique(blockers, "PROJECT_KIND_INVALID");
  }

  validatePeople(request ?? {}, blockers);
  validateBoundaries(request ?? {}, blockers);
  const integrationStates = validateIntegrations(request ?? {}, blockers);
  const compatibilityHolds = [];
  if (request?.compatibility?.daily_ledger_supported !== true) {
    compatibilityHolds.push("AUTOMATIC_DAILY_LEDGER_COMPATIBILITY_UNPROVEN");
  }
  if (request?.compatibility?.mail_routing_supported !== true) {
    compatibilityHolds.push("MAIL_ROUTING_COMPATIBILITY_UNPROVEN");
  }
  if (request?.runtime?.requested === true && !Array.isArray(request.runtime.profiles)) {
    addUnique(blockers, "RUNTIME_PROFILE_PLAN_INVALID");
  }
  if (request?.runtime?.requested !== true) warnings.push("NO_PERSISTENT_RUNTIME_REQUESTED");

  const preview = {
    schema_version: PREVIEW_SCHEMA,
    ok: blockers.length === 0,
    status: blockers.length === 0 ? "ready" : "hold",
    project_kind: request?.project_kind ?? null,
    proposed_project_code: proposedProjectCode,
    normalized_title: normalizedTitle || null,
    blockers,
    warnings,
    required_artifacts: [
      "project_contract_candidate",
      "project_context_candidate",
      "source_register_candidate",
      "responsibility_matrix_candidate",
      "onboarding_worklog",
      "first_work_packet",
      "compatibility_gate_packet",
      "bootstrap_receipt",
      "boundary_review_note",
    ],
    integration_states: integrationStates,
    compatibility_holds: compatibilityHolds,
    mutation_allowed: false,
  };
  return Object.freeze({ ...preview, preview_digest: digest(preview) });
}

export const projectBootstrapPreflightContract = Object.freeze({
  request_schema: REQUEST_SCHEMA,
  register_schema: REGISTER_SCHEMA,
  preview_schema: PREVIEW_SCHEMA,
  mutation_allowed: false,
});
