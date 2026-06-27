#!/usr/bin/env node
// Import workspace-owned team/project role overlays into the dev-erp projection DB.
// Dry-run by default. Source truth stays under _workspaces/knowledge/common/**.
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openStore, Store } from "../src/store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const SCHEMA = "dev_erp.role_overlay_import.v1";
const TEAM_SCHEMA = "soulforge.company.team_role_overlay.v1";
const PROJECT_SCHEMA = "soulforge.company.project_role_overlay.v1";
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{1,100}$/;
const PROJECT_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{1,100}$/;
const STATUS_VALUES = ["active", "pending", "disabled"];
const CONFIDENCE_VALUES = ["person_primary", "person_backup", "team_only", "owner_pending", "unknown"];
const RAW_PAYLOAD_KEY_RE = /(^|_)(body|raw|html|attachment|attachments|chunk|chunks|excerpt|payload)(_|$)|^(source|message|mail|document|full|original|content)_text$/i;

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};
const has = (n) => process.argv.includes(`--${n}`);

function fail(message, code = 2) {
  console.error(`[import-role-overlay] ${message}`);
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
  if (workspacePathIfPath && ref && ref.includes("/") && !ref.startsWith("_workspaces/knowledge/")) {
    errors.push(`${code}_outside_knowledge_workspace`);
    return null;
  }
  return ref;
}

function normalizeSourceRefs(raw, errors, prefix) {
  const values = Array.isArray(raw) ? raw : [];
  return values.map((ref, i) => safeRef(ref, errors, `${prefix}_source_ref_${i}_invalid`, { allowEmpty: false, workspacePathIfPath: true })).filter(Boolean);
}

function normalizeCapability(raw, index, org, errors) {
  const row = typeof raw === "string" ? { capability: raw } : (raw || {});
  const capability = clean(row.capability).toLowerCase();
  if (!capability || !REF_RE.test(capability)) errors.push(`org_units[${index}].capability_invalid`);
  const label = clean(row.label || row.display_name || row.name);
  const sourceRef = safeRef(row.source_ref ?? org.source_ref ?? null, errors, `org_units[${index}].capability_source_ref_invalid`, { workspacePathIfPath: true });
  return {
    capability,
    label: label || null,
    source_ref: sourceRef,
  };
}

function normalizeTeamOverlay(raw, errors) {
  const doc = raw || {};
  if (doc.schema_version !== TEAM_SCHEMA) errors.push("team_overlay_schema_version_invalid");
  scanForbiddenKeys(doc, errors);
  const sourceRefs = normalizeSourceRefs(doc.source_refs, errors, "team_overlay");
  const orgs = Array.isArray(doc.org_units) ? doc.org_units : [];
  if (!orgs.length) errors.push("team_overlay_org_units_required");
  const seen = new Set();
  const org_units = orgs.map((org, i) => {
    const orgRef = clean(org.org_unit_ref).toLowerCase();
    if (!orgRef || !REF_RE.test(orgRef)) errors.push(`org_units[${i}].org_unit_ref_invalid`);
    if (seen.has(orgRef)) errors.push(`org_units[${i}].duplicate_org_unit_ref`);
    seen.add(orgRef);
    const displayName = clean(org.display_name || org.name || orgRef);
    if (!displayName || /[\0\r\n]/.test(displayName)) errors.push(`org_units[${i}].display_name_invalid`);
    const status = clean(org.status || "active").toLowerCase();
    if (!STATUS_VALUES.includes(status)) errors.push(`org_units[${i}].status_invalid`);
    const sourceRef = safeRef(org.source_ref ?? sourceRefs[0] ?? null, errors, `org_units[${i}].source_ref_invalid`, { workspacePathIfPath: true });
    const notes = clean(org.notes);
    if (notes.length > 500 || /[\0\r]/.test(notes)) errors.push(`org_units[${i}].notes_invalid`);
    const capabilities = Array.isArray(org.capabilities)
      ? org.capabilities.map((cap) => normalizeCapability(cap, i, { source_ref: sourceRef }, errors))
      : [];
    if (!capabilities.length) errors.push(`org_units[${i}].capabilities_required`);
    const capSeen = new Set();
    for (const cap of capabilities) {
      if (capSeen.has(cap.capability)) errors.push(`org_units[${i}].duplicate_capability`);
      capSeen.add(cap.capability);
    }
    return {
      org_unit_ref: orgRef,
      display_name: displayName,
      status,
      source_ref: sourceRef,
      notes: notes || null,
      capabilities,
      data_label: "real",
    };
  });
  return { schema_version: TEAM_SCHEMA, source_refs: sourceRefs, org_units };
}

function normalizeProjectOverlay(raw, errors, teamOverlay) {
  const doc = raw || { schema_version: PROJECT_SCHEMA, assignments: [] };
  if (doc.schema_version !== PROJECT_SCHEMA) errors.push("project_overlay_schema_version_invalid");
  scanForbiddenKeys(doc, errors);
  const sourceRefs = normalizeSourceRefs(doc.source_refs, errors, "project_overlay");
  const orgRefs = new Set((teamOverlay?.org_units ?? []).map((org) => org.org_unit_ref));
  const rows = Array.isArray(doc.assignments) ? doc.assignments : [];
  const seen = new Set();
  const assignments = rows.map((row, i) => {
    const projectCode = clean(row.project_code).toUpperCase();
    const roleArea = clean(row.role_area).toLowerCase();
    if (!projectCode || !PROJECT_RE.test(projectCode)) errors.push(`assignments[${i}].project_code_invalid`);
    if (!roleArea || !REF_RE.test(roleArea)) errors.push(`assignments[${i}].role_area_invalid`);
    const key = `${projectCode}:${roleArea}`;
    if (seen.has(key)) errors.push(`assignments[${i}].duplicate_project_role`);
    seen.add(key);
    const owningOrg = clean(row.owning_org_unit_ref).toLowerCase() || null;
    if (owningOrg && !REF_RE.test(owningOrg)) errors.push(`assignments[${i}].owning_org_unit_ref_invalid`);
    if (owningOrg && !orgRefs.has(owningOrg)) errors.push(`assignments[${i}].owning_org_unit_ref_unknown`);
    const primary = clean(row.primary_person_ref) || null;
    if (primary && !REF_RE.test(primary)) errors.push(`assignments[${i}].primary_person_ref_invalid`);
    const backup = Array.isArray(row.backup_person_refs) ? row.backup_person_refs.map((x) => clean(x)).filter(Boolean) : [];
    backup.forEach((ref, j) => {
      if (!REF_RE.test(ref)) errors.push(`assignments[${i}].backup_person_refs[${j}]_invalid`);
    });
    const confidence = clean(row.confidence || (primary ? "person_primary" : owningOrg ? "team_only" : "owner_pending")).toLowerCase();
    if (!CONFIDENCE_VALUES.includes(confidence)) errors.push(`assignments[${i}].confidence_invalid`);
    if (confidence === "person_primary" && !primary) errors.push(`assignments[${i}].confidence_requires_primary_person_ref`);
    if (confidence === "person_backup" && !backup.length) errors.push(`assignments[${i}].confidence_requires_backup_person_refs`);
    if (confidence === "team_only" && !owningOrg) errors.push(`assignments[${i}].confidence_requires_owning_org_unit_ref`);
    if (confidence === "team_only" && (primary || backup.length)) errors.push(`assignments[${i}].team_only_confidence_with_person_refs`);
    if (primary && confidence !== "person_primary") errors.push(`assignments[${i}].primary_person_ref_confidence_mismatch`);
    if (backup.length && !["person_primary", "person_backup"].includes(confidence)) errors.push(`assignments[${i}].backup_person_refs_confidence_mismatch`);
    const status = clean(row.status || "active").toLowerCase();
    if (!STATUS_VALUES.includes(status)) errors.push(`assignments[${i}].status_invalid`);
    const sourceRef = safeRef(row.source_ref ?? sourceRefs[0] ?? null, errors, `assignments[${i}].source_ref_invalid`, { workspacePathIfPath: true });
    const notes = clean(row.notes);
    if (notes.length > 500 || /[\0\r]/.test(notes)) errors.push(`assignments[${i}].notes_invalid`);
    return {
      project_code: projectCode,
      role_area: roleArea,
      owning_org_unit_ref: owningOrg,
      primary_person_ref: primary,
      backup_person_refs: backup,
      confidence,
      status,
      source_ref: sourceRef,
      notes: notes || null,
      data_label: "real",
    };
  });
  return { schema_version: PROJECT_SCHEMA, source_refs: sourceRefs, assignments };
}

function publicPlan(plan) {
  return {
    schema_version: plan.schema_version,
    generated_at: plan.generated_at,
    dry_run: plan.dry_run,
    apply_ready: plan.apply_ready,
    totals: plan.totals,
    errors: plan.errors,
    team_overlay: plan.team_overlay,
    project_overlay: plan.project_overlay,
  };
}

export function buildRoleOverlayImportPlan(store, { teamOverlay = null, projectOverlay = null } = {}) {
  const errors = [];
  if (!teamOverlay) errors.push("team_overlay_required");
  const normalizedTeam = normalizeTeamOverlay(teamOverlay, errors);
  const normalizedProject = normalizeProjectOverlay(projectOverlay, errors, normalizedTeam);
  const totals = {
    org_units: normalizedTeam.org_units.length,
    capabilities: normalizedTeam.org_units.reduce((n, org) => n + org.capabilities.length, 0),
    project_assignments: normalizedProject.assignments.length,
    existing_org_units: store ? store.db.prepare("SELECT COUNT(*) AS n FROM role_org_unit").get().n : null,
    existing_project_assignments: store ? store.db.prepare("SELECT COUNT(*) AS n FROM role_project_assignment").get().n : null,
    error_count: errors.length,
  };
  return {
    schema_version: SCHEMA,
    generated_at: new Date().toISOString(),
    dry_run: true,
    apply_ready: errors.length === 0,
    totals,
    errors,
    team_overlay: normalizedTeam,
    project_overlay: normalizedProject,
  };
}

export function applyRoleOverlayImport(store, overlays = {}) {
  const plan = buildRoleOverlayImportPlan(store, overlays);
  if (!plan.apply_ready) {
    return { ...publicPlan(plan), dry_run: false, applied: false };
  }
  const applied = store.replaceRoleOverlayProjection({
    org_units: plan.team_overlay.org_units,
    project_assignments: plan.project_overlay.assignments,
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
  node tools/import_role_overlay.mjs --db data/dev-erp.db --team-overlay <team_role_overlay.json> [--project-overlay <project_role_overlay.json>] [--apply]

Notes:
  - Dry-run is default. Add --apply to replace the dev-erp role projection.
  - Source truth remains in _workspaces/knowledge/common/**.
  - Payload bodies, attachments, secret-like fields, absolute paths, and file:// refs are rejected.`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (has("help") || has("h")) {
    console.log(usage());
    process.exit(0);
  }
  const teamPath = resolveInput(arg("team-overlay"), "team_overlay");
  if (!teamPath) fail("--team-overlay <team_role_overlay.json> required");
  const projectPath = resolveInput(arg("project-overlay"), "project_overlay");
  const teamOverlay = parseJsonFile(teamPath, "team_overlay");
  const projectOverlay = parseJsonFile(projectPath, "project_overlay");
  const store = openStore(resolveDb(arg("db")));
  const result = has("apply")
    ? applyRoleOverlayImport(store, { teamOverlay, projectOverlay })
    : buildRoleOverlayImportPlan(store, { teamOverlay, projectOverlay });
  store.db.close();
  console.log(JSON.stringify(result, null, 2));
  if (result.dry_run) console.error(`[import-role-overlay] dry-run org_units=${result.totals.org_units}; add --apply to write.`);
  else console.error(`[import-role-overlay] apply ${result.applied ? "ok" : "failed"} org_units=${result.totals.org_units}.`);
  process.exit(result.apply_ready || result.applied ? 0 : 2);
}
