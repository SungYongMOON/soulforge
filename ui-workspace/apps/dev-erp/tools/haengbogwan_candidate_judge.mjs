#!/usr/bin/env node
// Deterministic skeleton judge for haengbogwan source events.
// This tool does not call an LLM and never applies ledger changes.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildContextPacketForProject, enrichContextPacketWithDbProjection } from "./haengbogwan_context_packet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");
const DEFAULT_WORKMETA_ROOT = resolve(REPO, "_workmeta");
const DEFAULT_LIMIT = 20;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_GENERATION_RULE_REF = "haengbogwan_candidate_judge_skeleton.v0";
const REQUIRED_FALSE_BOUNDARY_FLAGS = [
  "raw_body_loaded",
  "attachments_loaded",
  "workspace_payload_loaded",
  "secret_loaded",
];
const FORBIDDEN_EVENT_PAYLOAD_FIELDS = new Set([
  "body",
  "body_preview",
  "raw_body",
  "attachment",
  "attachments",
  "payload",
  "payload_pointer",
  "raw_payload",
  "secret",
  "token",
  "password",
  "credential",
  "cookie",
]);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function validateLimit(value, label = "limit") {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`invalid_${label}:${value}`);
  return n;
}

function validateToday(today) {
  const normalized = String(today || todayIso()).trim();
  if (!DATE_RE.test(normalized)) throw new Error(`invalid_today:${today}`);
  return normalized;
}

function normalizeDateOnly(value) {
  const raw = String(value ?? "").trim();
  const direct = raw.slice(0, 10);
  return DATE_RE.test(direct) ? direct : "";
}

function historyKeyForEvent(event) {
  const explicit = String(event?.history_key ?? "").trim();
  if (explicit) return explicit;
  const mailRef = String(event?.source_refs?.mail_history_ref ?? "").trim();
  if (mailRef.startsWith("mailcsv:")) return mailRef.slice("mailcsv:".length);
  const taskRef = String(event?.idempotency_key ?? "").trim();
  if (taskRef.startsWith("mailtask:")) return taskRef.slice("mailtask:".length);
  return "";
}

function sourceLineageForEvent(event) {
  return String(
    event?.source_refs?.source_lineage_ref
    ?? event?.source_refs?.mail_history_ref
    ?? event?.event_ref
    ?? ""
  ).trim();
}

function titleForEvent(event, historyKey) {
  const subject = String(event?.subject ?? "").trim();
  return subject ? `Review mail metadata: ${subject}` : `Review mail metadata: ${historyKey}`;
}

function dueForEvent(event) {
  return normalizeDateOnly(event?.due_hint);
}

function normalizeToken(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function explicitlySupportsMailRouting(value) {
  const token = normalizeToken(value);
  if (!token) return false;
  const parts = token.split("_").filter(Boolean);
  if (token.includes("mail_triage") || token.includes("mail_metadata_review") || token.includes("mail_review")) return true;
  if (token.includes("classify_mail") || token.includes("extract_action")) return true;
  if (token.includes("project_management") || token.includes("systems_engineering")) return true;
  if (token === "se" || parts.includes("review") || parts.includes("triage")) return true;
  return false;
}

function roleSupportsMailRouting(role) {
  if (explicitlySupportsMailRouting(role?.role_area) || explicitlySupportsMailRouting(role?.role_ref)) return true;
  return (Array.isArray(role?.capabilities) ? role.capabilities : [])
    .some((cap) => explicitlySupportsMailRouting(cap.capability));
}

function actorSupportsMailRouting(actor) {
  return (Array.isArray(actor?.capabilities) ? actor.capabilities : [])
    .some((cap) => explicitlySupportsMailRouting(cap.capability));
}

function uniqueRefs(refs) {
  const out = [];
  const seen = new Set();
  for (const ref of refs.map((value) => String(value ?? "").trim()).filter(Boolean)) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    out.push(ref);
  }
  return out;
}

function overlayLoaded(contextPacket) {
  return contextPacket?.not_loaded?.roles?.status === "loaded_from_db_projection"
    || contextPacket?.not_loaded?.actors?.status === "loaded_from_db_projection"
    || Array.isArray(contextPacket?.role_overlay)
    || Array.isArray(contextPacket?.actor_overlay);
}

function suggestAssigneeFromOverlay(contextPacket) {
  const roles = Array.isArray(contextPacket?.role_overlay) ? contextPacket.role_overlay : [];
  const actors = Array.isArray(contextPacket?.actor_overlay) ? contextPacket.actor_overlay : [];
  const actorByRef = new Map(actors.map((actor) => [actor.actor_ref, actor]));
  if (!overlayLoaded(contextPacket)) {
    return {
      suggested_assignee_ref: "",
      assignee_confidence: "",
      assignee_reason: "no actor overlay loaded in this slice",
      route_reason: "skeleton judge keeps project route pending human review",
      supporting_actor_refs: [],
    };
  }

  const supportedRoles = roles.filter(roleSupportsMailRouting);
  const supportedActors = actors.filter(actorSupportsMailRouting);
  const roleRefs = [];
  for (const role of supportedRoles) {
    roleRefs.push(role.primary_person_ref, ...(Array.isArray(role.backup_person_refs) ? role.backup_person_refs : []), role.team_ref, role.owning_org_unit_ref);
    for (const actor of actors) {
      if (actor.team_ref && actor.team_ref === (role.team_ref || role.owning_org_unit_ref)) roleRefs.push(actor.actor_ref);
    }
  }
  const candidateRefs = uniqueRefs([...roleRefs, ...supportedActors.map((actor) => actor.actor_ref)]);
  const suggested = candidateRefs.find((ref) => actorByRef.get(ref)?.kind !== "bot")
    || "";
  const supportingActorRefs = uniqueRefs([
    ...supportedActors.map((actor) => actor.actor_ref),
    ...candidateRefs,
  ]).filter((ref) => ref !== suggested).slice(0, 10);

  if (!suggested) {
    return {
      suggested_assignee_ref: "",
      assignee_confidence: "",
      assignee_reason: "role/actor overlay loaded, but no explicit routing actor matched mail triage/review/se/project_management",
      route_reason: "skeleton judge keeps project route pending human review; overlay loaded without an explicit routing match",
      supporting_actor_refs: supportingActorRefs,
    };
  }

  const actor = actorByRef.get(suggested);
  const source = supportedRoles.length ? `project_role:${supportedRoles[0].role_ref || supportedRoles[0].role_area}` : "actor_capability";
  const kind = actor?.kind || actor?.actor_type || "team";
  return {
    suggested_assignee_ref: suggested,
    assignee_confidence: "low",
    assignee_reason: `db projection suggestion only; ${kind} ref matched ${source}`,
    route_reason: "skeleton judge keeps project route pending human review; db projection offered a suggested assignee",
    supporting_actor_refs: supportingActorRefs,
  };
}

export function validateMetadataOnlyContextPacket(contextPacket) {
  if (!contextPacket || typeof contextPacket !== "object") throw new Error("invalid_context_packet");
  const boundary = contextPacket.boundary;
  if (!boundary || boundary.metadata_only !== true) throw new Error("unsafe_context_boundary:not_metadata_only");
  for (const flag of REQUIRED_FALSE_BOUNDARY_FLAGS) {
    if (boundary[flag] !== false) throw new Error(`unsafe_context_boundary:${flag}`);
  }
  const events = Array.isArray(contextPacket.source_events) ? contextPacket.source_events : [];
  for (const event of events) {
    if (String(event?.body_access ?? "") !== "metadata_only") {
      throw new Error(`unsafe_source_event_body_access:${event?.event_ref || "(unknown)"}`);
    }
    for (const key of Object.keys(event || {})) {
      if (FORBIDDEN_EVENT_PAYLOAD_FIELDS.has(key.toLowerCase())) {
        throw new Error(`unsafe_source_event_payload_field:${key}`);
      }
    }
  }
  return true;
}

function candidateForEvent(contextPacket, event, {
  generationRuleRef = DEFAULT_GENERATION_RULE_REF,
} = {}) {
  const historyKey = historyKeyForEvent(event);
  const sourceRefs = event?.source_refs ?? {};
  const due = dueForEvent(event);
  const reviewReason = due
    ? "skeleton_rule:metadata_only_due_hint_needs_review"
    : "skeleton_rule:metadata_only_needs_review";
  const overlaySuggestion = suggestAssigneeFromOverlay(contextPacket);
  return {
    title: titleForEvent(event, historyKey),
    work_type: "review",
    completion_criteria: "Metadata-only mail reference reviewed; required response, task action, or no-action decision is recorded.",
    due,
    review_status: "needs_review",
    review_reason: reviewReason,
    status_hint: "unclassified",
    route_candidate: contextPacket.project_id || event?.project_id || "",
    route_confidence: "review",
    route_reason: overlaySuggestion.route_reason,
    required_role: "mail_triage_owner",
    required_capability: "mail_metadata_review",
    suggested_assignee_ref: overlaySuggestion.suggested_assignee_ref,
    assignee_confidence: overlaySuggestion.assignee_confidence,
    assignee_reason: overlaySuggestion.assignee_reason,
    supporting_actor_refs: overlaySuggestion.supporting_actor_refs,
    source_candidate_ref: `haengbogwan:${historyKey}`,
    source_mail_ref: sourceRefs.mail_history_ref || `mailcsv:${historyKey}`,
    source_mail_source_id: sourceRefs.source_mail_source_id || "",
    source_thread_ref: sourceRefs.source_thread_ref || "",
    source_group_ref: sourceRefs.source_group_ref || "",
    source_lineage_ref: sourceLineageForEvent(event),
    generation_rule_ref: generationRuleRef,
    generation_run_ref: String(contextPacket.generated_at || "").slice(0, 10),
    next_action: "Review metadata-only mail reference and decide the follow-up action.",
    body_access: "metadata_only",
  };
}

export function buildLedgerCandidates(contextPacket, opts = {}) {
  validateMetadataOnlyContextPacket(contextPacket);
  const events = Array.isArray(contextPacket?.source_events) ? contextPacket.source_events : [];
  const out = {};
  for (const event of events) {
    const historyKey = historyKeyForEvent(event);
    if (!historyKey) continue;
    out[historyKey] = candidateForEvent(contextPacket, event, opts);
  }
  return out;
}

export function judgeContextPacket(contextPacket, opts = {}) {
  const candidates = buildLedgerCandidates(contextPacket, opts);
  return {
    project_id: contextPacket?.project_id || "",
    generation_rule_ref: opts.generationRuleRef || DEFAULT_GENERATION_RULE_REF,
    candidate_count: Object.keys(candidates).length,
    review_status: "needs_review",
    body_access: "metadata_only",
    candidates,
  };
}

function readContextPacket(contextPath) {
  const path = resolve(process.cwd(), contextPath);
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseArgs(argv) {
  const opts = {
    context: "",
    workmetaRoot: DEFAULT_WORKMETA_ROOT,
    projectId: "",
    limit: DEFAULT_LIMIT,
    today: todayIso(),
    dbPath: "",
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      opts.help = true;
    } else if (token === "--json") {
      opts.json = true;
    } else if (token === "--context") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--context_requires_value");
      opts.context = value;
      i += 1;
    } else if (token === "--workmeta-root" || token === "--workmeta") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`${token}_requires_value`);
      opts.workmetaRoot = value;
      i += 1;
    } else if (token === "--project") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--project_requires_value");
      opts.projectId = value;
      i += 1;
    } else if (token === "--limit") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--limit_requires_value");
      opts.limit = validateLimit(value);
      i += 1;
    } else if (token === "--today") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--today_requires_value");
      opts.today = value;
      i += 1;
    } else if (token === "--db") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--db_requires_value");
      opts.dbPath = value;
      i += 1;
    } else {
      throw new Error(`unknown_arg:${token}`);
    }
  }
  opts.today = validateToday(opts.today);
  return opts;
}

function usage() {
  return [
    "Usage: node tools/haengbogwan_candidate_judge.mjs --context <packet.json> [--db <dev-erp.db>] [--json]",
    "   or: node tools/haengbogwan_candidate_judge.mjs --workmeta-root <path> --project <code> [--limit N] [--today YYYY-MM-DD] [--db <dev-erp.db>] [--json]",
    "",
    "Emits a mail_to_task_ledger-compatible candidate JSON map keyed by mail history key.",
  ].join("\n");
}

export function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.help) {
      stdout.write(`${usage()}\n`);
      return 0;
    }
    if (opts.context && opts.projectId) throw new Error("--context_or_--project_not_both");
    if (!opts.context && !opts.projectId) throw new Error("--context_or_--project_required");
    const packet = opts.context
      ? readContextPacket(opts.context)
      : buildContextPacketForProject({
        workmetaRoot: opts.workmetaRoot,
        projectId: opts.projectId,
        limit: opts.limit,
        today: opts.today,
        dbPath: opts.dbPath,
      });
    const enrichedPacket = opts.context && opts.dbPath
      ? enrichContextPacketWithDbProjection(packet, { dbPath: opts.dbPath, limit: opts.limit })
      : packet;
    const candidates = buildLedgerCandidates(enrichedPacket);
    stdout.write(`${JSON.stringify(candidates, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`[haengbogwan_candidate_judge] ${error.message}\n`);
    return 2;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  process.exitCode = main();
}
