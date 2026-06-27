#!/usr/bin/env node
// Import workspace-owned team/person/bot actor overlays into the dev-erp projection DB.
// Dry-run by default. Source truth stays under _workspaces/knowledge/common/**.
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openStore, Store } from "../src/store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const SCHEMA = "dev_erp.actor_overlay_import.v1";
const ACTOR_SCHEMA = "soulforge.company.actor_overlay.v1";
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{1,100}$/;
const STATUS_VALUES = ["active", "pending", "disabled"];
const ACTOR_TYPES = ["team", "person", "bot"];
const AUTHORITY_VALUES = ["responsible_owner", "read_only", "propose_only", "draft_only", "safe_apply"];
const RAW_PAYLOAD_KEY_RE = /(^|_)(body|raw|html|attachment|attachments|chunk|chunks|excerpt|payload)(_|$)|^(source|message|mail|document|full|original|content)_text$/i;

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};
const has = (n) => process.argv.includes(`--${n}`);

function fail(message, code = 2) {
  console.error(`[import-actor-overlay] ${message}`);
  process.exit(code);
}

function resolveDb(raw) {
  if (!raw) fail("--db <dev-erp.db> required");
  if (isAbsolute(raw)) return raw;
  const cwdPath = resolve(process.cwd(), raw);
  if (existsSync(cwdPath)) return cwdPath;
  const appPath = resolve(APP, raw);
  if (existsSync(appPath)) return appPath;
  if (existsSync(dirname(cwdPath))) return cwdPath;
  if (existsSync(dirname(appPath))) return appPath;
  fail("db_parent_not_found");
}

function resolveInput(raw, flag) {
  if (!raw) return null;
  const resolved = isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
  if (!existsSync(resolved)) fail(`${flag}_not_found`);
  return resolved;
}

function parseJsonFile(path, label) {
  if (!path) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    fail(`${label}_json_invalid:${String(error.message || error)}`);
  }
}

function clean(value) {
  return String(value ?? "").trim();
}

function scanForbiddenKeys(value, errors, path = "$") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, i) => scanForbiddenKeys(entry, errors, `${path}[${i}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (Store.MAILBOX_SECRET_KEY_RE.test(key)) errors.push(`${path}.${key}:secret_key_not_allowed`);
    if (RAW_PAYLOAD_KEY_RE.test(key)) errors.push(`${path}.${key}:raw_payload_key_not_allowed`);
    scanForbiddenKeys(child, errors, `${path}.${key}`);
  }
}

function safeRef(value, errors, code, { allowEmpty = true, workspacePathIfPath = false } = {}) {
  const normalized = Store.safeMetadataRef(value, { allowEmpty, error: code });
  if (normalized.error) {
    errors.push(normalized.error);
    return null;
  }
  const ref = normalized.value;
  if (ref && /^[A-Za-z][A-Za-z0-9+.-]*:/.test(ref)) {
    errors.push(code);
    return null;
  }
  if (workspacePathIfPath && ref) {
    const pathRef = ref.replaceAll("\\", "/");
    if ((pathRef.includes("/") || ref.includes("\\")) && !pathRef.startsWith("_workspaces/knowledge/")) {
      errors.push(`${code}_outside_knowledge_workspace`);
      return null;
    }
    return pathRef;
  }
  return ref;
}

function normalizeSourceRefs(raw, errors, prefix) {
  const values = Array.isArray(raw) ? raw : [];
  return values.map((ref, i) => safeRef(ref, errors, `${prefix}_source_ref_${i}_invalid`, { allowEmpty: false, workspacePathIfPath: true })).filter(Boolean);
}

function normalizeCapability(raw, index, actor, errors) {
  const row = typeof raw === "string" ? { capability: raw } : (raw || {});
  const capability = clean(row.capability).toLowerCase();
  if (!capability || !REF_RE.test(capability)) errors.push(`actors[${index}].capability_invalid`);
  const label = clean(row.label || row.display_name || row.name);
  const sourceRef = safeRef(row.source_ref ?? actor.source_ref ?? null, errors, `actors[${index}].capability_source_ref_invalid`, { workspacePathIfPath: true });
  return {
    capability,
    label: label || null,
    source_ref: sourceRef,
  };
}

function normalizeActorOverlay(raw, errors, { knownOrgUnits = [] } = {}) {
  const doc = raw || {};
  if (doc.schema_version !== ACTOR_SCHEMA) errors.push("actor_overlay_schema_version_invalid");
  scanForbiddenKeys(doc, errors);
  const sourceRefs = normalizeSourceRefs(doc.source_refs, errors, "actor_overlay");
  const knownOrgSet = new Set(knownOrgUnits);
  const rows = Array.isArray(doc.actors) ? doc.actors : [];
  if (!rows.length) errors.push("actor_overlay_actors_required");
  const seen = new Set();
  const actors = rows.map((actor, i) => {
    const actorRef = clean(actor.actor_ref).toLowerCase();
    if (!actorRef || !REF_RE.test(actorRef)) errors.push(`actors[${i}].actor_ref_invalid`);
    if (seen.has(actorRef)) errors.push(`actors[${i}].duplicate_actor_ref`);
    seen.add(actorRef);

    const actorType = clean(actor.actor_type || "team").toLowerCase();
    if (!ACTOR_TYPES.includes(actorType)) errors.push(`actors[${i}].actor_type_invalid`);
    const displayName = clean(actor.display_name || actor.name || actorRef);
    if (!displayName || /[\0\r\n]/.test(displayName)) errors.push(`actors[${i}].display_name_invalid`);
    const status = clean(actor.status || "active").toLowerCase();
    if (!STATUS_VALUES.includes(status)) errors.push(`actors[${i}].status_invalid`);
    const authority = clean(actor.authority || (actorType === "team" || actorType === "person" ? "responsible_owner" : "propose_only")).toLowerCase();
    if (!AUTHORITY_VALUES.includes(authority)) errors.push(`actors[${i}].authority_invalid`);

    const teamRef = clean(actor.team_ref).toLowerCase() || null;
    if (teamRef && !REF_RE.test(teamRef)) errors.push(`actors[${i}].team_ref_invalid`);
    if (actorType === "team" && teamRef && knownOrgSet.size && !knownOrgSet.has(teamRef)) errors.push(`actors[${i}].team_ref_unknown`);
    if (actorType === "team" && knownOrgSet.size && !knownOrgSet.has(actorRef)) errors.push(`actors[${i}].team_actor_ref_unknown_org_unit`);
    if (teamRef && knownOrgSet.size && !knownOrgSet.has(teamRef)) errors.push(`actors[${i}].team_ref_unknown`);

    const handoffTo = safeRef(actor.handoff_to_ref ?? actor.default_owner_actor_ref ?? null, errors, `actors[${i}].handoff_to_ref_invalid`);
    const sourceRef = safeRef(actor.source_ref ?? sourceRefs[0] ?? null, errors, `actors[${i}].source_ref_invalid`, { workspacePathIfPath: true });
    const notes = clean(actor.notes);
    if (notes.length > 500 || /[\0\r]/.test(notes)) errors.push(`actors[${i}].notes_invalid`);

    const capabilities = Array.isArray(actor.capabilities)
      ? actor.capabilities.map((cap) => normalizeCapability(cap, i, { source_ref: sourceRef }, errors))
      : [];
    if (!capabilities.length) errors.push(`actors[${i}].capabilities_required`);
    const capSeen = new Set();
    for (const cap of capabilities) {
      if (capSeen.has(cap.capability)) errors.push(`actors[${i}].duplicate_capability`);
      capSeen.add(cap.capability);
    }

    const forbidden = Array.isArray(actor.forbidden_actions) ? actor.forbidden_actions.map((x) => clean(x).toLowerCase()).filter(Boolean) : [];
    const forbiddenSeen = new Set();
    for (const action of forbidden) {
      if (!REF_RE.test(action)) errors.push(`actors[${i}].forbidden_action_invalid`);
      if (forbiddenSeen.has(action)) errors.push(`actors[${i}].duplicate_forbidden_action`);
      forbiddenSeen.add(action);
    }

    const approvalRequired = actor.approval_required !== false;
    if (actorType === "bot" && authority === "responsible_owner") errors.push(`actors[${i}].bot_cannot_be_responsible_owner`);
    if (actorType === "bot" && authority === "safe_apply" && !approvalRequired) errors.push(`actors[${i}].bot_safe_apply_requires_approval`);
    if (actorType === "bot" && capSeen.has("draft_reply_email")) {
      if (!approvalRequired) errors.push(`actors[${i}].mail_drafter_requires_approval`);
      if (!forbiddenSeen.has("send_email_without_owner_approval")) errors.push(`actors[${i}].mail_drafter_missing_send_forbidden_action`);
    }

    return {
      actor_ref: actorRef,
      actor_type: actorType,
      display_name: displayName,
      team_ref: teamRef,
      authority,
      approval_required: approvalRequired,
      handoff_to_ref: handoffTo,
      status,
      source_ref: sourceRef,
      notes: notes || null,
      capabilities,
      forbidden_actions: [...forbiddenSeen],
      data_label: "real",
    };
  });

  const actorRefs = new Set(actors.map((actor) => actor.actor_ref));
  for (const [i, actor] of actors.entries()) {
    if (actor.handoff_to_ref && !actorRefs.has(actor.handoff_to_ref)) errors.push(`actors[${i}].handoff_to_ref_unknown`);
  }

  return { schema_version: ACTOR_SCHEMA, source_refs: sourceRefs, actors };
}

function publicPlan(plan) {
  return {
    schema_version: plan.schema_version,
    generated_at: plan.generated_at,
    dry_run: plan.dry_run,
    apply_ready: plan.apply_ready,
    totals: plan.totals,
    errors: plan.errors,
    actor_overlay: plan.actor_overlay,
  };
}

export function buildActorOverlayImportPlan(store, { actorOverlay = null, knownOrgUnits = null } = {}) {
  const errors = [];
  if (!actorOverlay) errors.push("actor_overlay_required");
  const orgUnits = knownOrgUnits ?? (store ? store.listRoleOrgUnits().map((org) => org.org_unit_ref) : []);
  const normalizedActor = normalizeActorOverlay(actorOverlay, errors, { knownOrgUnits: orgUnits });
  const totals = {
    actors: normalizedActor.actors.length,
    teams: normalizedActor.actors.filter((actor) => actor.actor_type === "team").length,
    people: normalizedActor.actors.filter((actor) => actor.actor_type === "person").length,
    bots: normalizedActor.actors.filter((actor) => actor.actor_type === "bot").length,
    capabilities: normalizedActor.actors.reduce((n, actor) => n + actor.capabilities.length, 0),
    forbidden_actions: normalizedActor.actors.reduce((n, actor) => n + actor.forbidden_actions.length, 0),
    existing_actors: store ? store.db.prepare("SELECT COUNT(*) AS n FROM role_actor").get().n : null,
    known_org_units: orgUnits.length,
    error_count: errors.length,
  };
  return {
    schema_version: SCHEMA,
    generated_at: new Date().toISOString(),
    dry_run: true,
    apply_ready: errors.length === 0,
    totals,
    errors,
    actor_overlay: normalizedActor,
  };
}

export function applyActorOverlayImport(store, overlays = {}) {
  const plan = buildActorOverlayImportPlan(store, overlays);
  if (!plan.apply_ready) {
    return { ...publicPlan(plan), dry_run: false, applied: false };
  }
  const applied = store.replaceActorOverlayProjection({
    actors: plan.actor_overlay.actors,
    generated_at: plan.generated_at,
  });
  if (applied.error) {
    return {
      ...publicPlan(plan),
      dry_run: false,
      applied: false,
      apply_ready: false,
      errors: [...plan.errors, applied.error],
    };
  }
  return {
    ...publicPlan(plan),
    dry_run: false,
    applied: true,
    applied_counts: applied,
  };
}

function usage() {
  return `Usage:
  node tools/import_actor_overlay.mjs --db data/dev-erp.db --actor-overlay <actor_overlay.json> [--apply]

Notes:
  - Dry-run is default. Add --apply to replace only the dev-erp actor projection.
  - Source truth remains in _workspaces/knowledge/common/**.
  - Bots are conservative by default: no outbound sending without owner approval.`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (has("help") || has("h")) {
    console.log(usage());
    process.exit(0);
  }
  const actorPath = resolveInput(arg("actor-overlay"), "actor_overlay");
  if (!actorPath) fail("--actor-overlay <actor_overlay.json> required");
  const actorOverlay = parseJsonFile(actorPath, "actor_overlay");
  const store = openStore(resolveDb(arg("db")));
  const result = has("apply")
    ? applyActorOverlayImport(store, { actorOverlay })
    : buildActorOverlayImportPlan(store, { actorOverlay });
  store.db.close();
  console.log(JSON.stringify(result, null, 2));
  if (result.dry_run) console.error(`[import-actor-overlay] dry-run actors=${result.totals.actors}; add --apply to write.`);
  else console.error(`[import-actor-overlay] apply ${result.applied ? "ok" : "failed"} actors=${result.totals.actors}.`);
  process.exit(result.apply_ready || result.applied ? 0 : 2);
}
