#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(__dirname, "../..");
let repoRoot = defaultRepoRoot;
const schemaVersion = "soulforge.canon.validate.v0";
const publicMissionDraftSchemaVersion = "soulforge.dungeon_assignment.public_mission_draft.v1";
const publicMissionDraftAllowedMarkerKeys = new Set(["raw_payload_copied", "raw_payload_markers_absent"]);
const publicMissionDraftSafeTrueFieldIssues = new Map([
  ["private_refs_removed", "public_mission_draft_unredacted_private_ref"],
  ["source_refs_redacted", "public_mission_draft_unredacted_private_ref"],
  ["raw_payload_markers_absent", "public_mission_draft_forbidden_marker"],
  ["local_file_refs_absent", "public_mission_draft_local_file_ref"],
  ["secret_like_values_absent", "public_mission_draft_secret_like_value"],
]);
const publicMissionDraftRequiredRedactionFields = new Map([
  ["raw_payload_copied", false],
  ["private_refs_removed", true],
  ["source_refs_redacted", true],
  ["raw_payload_markers_absent", true],
  ["local_file_refs_absent", true],
  ["secret_like_values_absent", true],
]);
const publicMissionDraftForbiddenMarkerPattern =
  /\b(?:body_text|body_html|provider_payload|provider_attachment_id|raw_mail|mail_body|source_text|chunk_text|notebooklm_answer|source_payload|raw_payload_body|attachment_url|download_url|local_path)\b/iu;
const publicMissionDraftPrivateRefPattern =
  /(?:^|[\s"'`()\[\]{}<>./\\])(?:_workmeta\/|_workspaces\/|private-state\/|guild_hall\/state\/|source:\/\/|mailbox:\/\/|mail_candidate:|provider_message_id\s*[:=]|thread_id\s*[:=]|attachment_url\s*[:=]|download_url\s*[:=]|local_path\s*[:=])/iu;
const publicMissionDraftLocalFileRefPattern = /\bfile:\/\/[^\s"'<>]+/iu;
const publicMissionDraftSecretKeyPattern =
  /^(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|token|cookie|session|credential|client[_-]?secret|authorization)$/iu;
const publicMissionDraftSecretValuePattern =
  /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?cookie|client[_-]?secret|authorization)\s*[:=]\s*["']?(?:Bearer\s+)?[^"'\s]{8,}/iu;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  repoRoot = path.resolve(args.root ?? defaultRepoRoot);
  const context = await buildContext();
  const report = buildReport(context);

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHuman(report);
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--root") {
      flags.root = argv[index + 1];
      index += 1;
      continue;
    }

    if (token.startsWith("--root=")) {
      flags.root = token.slice("--root=".length);
      continue;
    }

    if (token.startsWith("--")) {
      flags[token.slice(2)] = true;
    }
  }

  return flags;
}

async function buildContext() {
  const errors = [];
  const warnings = [];
  const checked = [];

  const speciesCatalog = await loadSpeciesCatalog(errors, checked);
  const classCatalog = await loadClassCatalog(errors, checked);
  const knowledgeCatalog = await loadKnowledgeCatalog(errors, checked);
  const workflowCatalog = await loadWorkflowCatalog(errors, checked);
  const partyCatalog = await loadPartyCatalog(errors, checked, workflowCatalog.ids);
  const unitCatalog = await loadUnitCatalog(errors, checked);
  const missionCatalog = await loadMissionCatalog(errors, checked);

  await assertPathExists("_workspaces/README.md", { errors, checked });
  await assertPathExists(".registry/index.yaml", { errors, checked });

  validateUnitCatalog(unitCatalog, speciesCatalog, classCatalog.ids, { errors });
  validateMissionCatalog(missionCatalog, workflowCatalog.ids, partyCatalog.ids, { errors });
  await validateClassKnowledgeRefs(classCatalog.documents, knowledgeCatalog.ids, { errors, checked });

  return { errors, warnings, checked };
}

function buildReport(context) {
  return {
    schema_version: schemaVersion,
    generated_at: new Date().toISOString(),
    ok: context.errors.length === 0,
    summary: {
      checked_total: context.checked.length,
      errors_total: context.errors.length,
      warnings_total: context.warnings.length,
    },
    errors: context.errors,
    warnings: context.warnings,
    checked: context.checked,
  };
}

function printHuman(report) {
  const lines = [
    "Soulforge Canon Validate",
    `ok: ${report.ok ? "yes" : "no"}`,
    `checked: ${report.summary.checked_total}`,
    `errors: ${report.summary.errors_total}`,
    `warnings: ${report.summary.warnings_total}`,
  ];

  if (report.errors.length > 0) {
    lines.push("");
    lines.push("Errors:");
    for (const error of report.errors) {
      lines.push(`- ${error.id}: ${error.file}`);
      lines.push(`  ${error.detail}`);
    }
  }

  if (report.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of report.warnings) {
      lines.push(`- ${warning.id}: ${warning.file}`);
      lines.push(`  ${warning.detail}`);
    }
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

async function loadSpeciesCatalog(errors, checked) {
  const root = path.join(repoRoot, ".registry", "species");
  const speciesIds = new Set();
  const heroIdsBySpecies = new Map();

  for (const entry of await listDirectories(root, errors, ".registry/species")) {
    const speciesPath = path.join(root, entry, "species.yaml");
    checked.push(`.registry/species/${entry}/species.yaml`);

    if (!(await fileExists(speciesPath))) {
      errors.push(buildIssue("missing_species_file", `.registry/species/${entry}/species.yaml`, "species.yaml is missing"));
      continue;
    }

    const document = await readYamlOrIssue(speciesPath, `.registry/species/${entry}/species.yaml`, errors);
    if (document === YAML_READ_FAILED) {
      continue;
    }
    const speciesId = stringValue(document?.species_id);
    if (speciesId !== entry) {
      errors.push(
        buildIssue(
          "species_id_mismatch",
          `.registry/species/${entry}/species.yaml`,
          `expected species_id ${entry}, got ${speciesId ?? "(missing)"}`,
        ),
      );
      continue;
    }

    speciesIds.add(speciesId);
    const heroIds = new Set();
    for (const hero of arrayValue(document?.heroes)) {
      const heroId = stringValue(hero?.hero_id);
      if (heroId) {
        heroIds.add(heroId);
      }
    }
    heroIdsBySpecies.set(speciesId, heroIds);
  }

  return { ids: speciesIds, heroIdsBySpecies };
}

async function loadClassCatalog(errors, checked) {
  const root = path.join(repoRoot, ".registry", "classes");
  const classIds = new Set();
  const documents = [];

  for (const entry of await listDirectories(root, errors, ".registry/classes")) {
    const classPath = path.join(root, entry, "class.yaml");
    checked.push(`.registry/classes/${entry}/class.yaml`);

    if (!(await fileExists(classPath))) {
      errors.push(buildIssue("missing_class_file", `.registry/classes/${entry}/class.yaml`, "class.yaml is missing"));
      continue;
    }

    const document = await readYamlOrIssue(classPath, `.registry/classes/${entry}/class.yaml`, errors);
    if (document === YAML_READ_FAILED) {
      continue;
    }
    documents.push({ dirName: entry, path: classPath, document });
    const classId = stringValue(document?.class_id);
    if (classId !== entry) {
      errors.push(
        buildIssue(
          "class_id_mismatch",
          `.registry/classes/${entry}/class.yaml`,
          `expected class_id ${entry}, got ${classId ?? "(missing)"}`,
        ),
      );
      continue;
    }

    classIds.add(classId);
  }

  return { ids: classIds, documents };
}

async function loadKnowledgeCatalog(errors, checked) {
  const root = path.join(repoRoot, ".registry", "knowledge");
  const knowledgeIds = new Set();

  for (const entry of await listDirectories(root, errors, ".registry/knowledge")) {
    const knowledgePath = path.join(root, entry, "knowledge.yaml");
    const repoPath = `.registry/knowledge/${entry}/knowledge.yaml`;
    checked.push(repoPath);

    if (!(await fileExists(knowledgePath))) {
      errors.push(buildIssue("missing_knowledge_file", repoPath, "knowledge.yaml is missing"));
      continue;
    }

    const document = await readYamlOrIssue(knowledgePath, repoPath, errors);
    if (document === YAML_READ_FAILED) {
      continue;
    }
    const knowledgeId = stringValue(document?.knowledge_id);
    if (!knowledgeId) {
      errors.push(buildIssue("knowledge_id_missing", repoPath, "knowledge_id must be present"));
    } else if (knowledgeId !== entry) {
      errors.push(buildIssue("knowledge_id_mismatch", repoPath, `expected knowledge_id ${entry}, got ${knowledgeId}`));
    } else {
      knowledgeIds.add(knowledgeId);
    }

    const kind = stringValue(document?.kind);
    if (kind !== "knowledge") {
      errors.push(buildIssue("knowledge_kind_invalid", repoPath, `expected kind knowledge, got ${kind ?? "(missing)"}`));
    }

    const status = stringValue(document?.status);
    if (!status) {
      errors.push(buildIssue("knowledge_status_missing", repoPath, "status must be present"));
    }
  }

  return { ids: knowledgeIds };
}

async function loadWorkflowCatalog(errors, checked) {
  const indexPath = path.join(repoRoot, ".workflow", "index.yaml");
  checked.push(".workflow/index.yaml");
  const workflowIds = new Set();
  const indexDocument = await readYamlOrIssue(indexPath, ".workflow/index.yaml", errors);
  if (indexDocument === YAML_READ_FAILED) {
    return { ids: workflowIds };
  }

  for (const entry of arrayValue(indexDocument?.entries)) {
    const workflowId = stringValue(entry?.workflow_id);
    const workflowPath = stringValue(entry?.path);
    if (!workflowId || !workflowPath) {
      errors.push(buildIssue("workflow_index_entry_invalid", ".workflow/index.yaml", "workflow entry must include workflow_id and path"));
      continue;
    }

    const absolutePath = path.join(repoRoot, ".workflow", workflowPath);
    const repoPath = normalizeRepoPath(path.relative(repoRoot, absolutePath));
    checked.push(repoPath);

    if (!(await fileExists(absolutePath))) {
      errors.push(buildIssue("missing_workflow_file", repoPath, "workflow path from index.yaml does not exist"));
      continue;
    }

    const document = await readYamlOrIssue(absolutePath, repoPath, errors);
    if (document === YAML_READ_FAILED) {
      continue;
    }
    const actualWorkflowId = stringValue(document?.workflow_id);
    if (actualWorkflowId !== workflowId) {
      errors.push(
        buildIssue(
          "workflow_id_mismatch",
          repoPath,
          `expected workflow_id ${workflowId}, got ${actualWorkflowId ?? "(missing)"}`,
        ),
      );
      continue;
    }

    workflowIds.add(workflowId);
    const workflowDir = path.dirname(absolutePath);
    for (const key of ["role_slots", "step_graph", "handoff_rules", "monster_rules", "party_compatibility"]) {
      const relativeRef = stringValue(document?.[key]);
      if (!relativeRef) {
        errors.push(buildIssue("workflow_missing_ref", repoPath, `${key} must be present`));
        continue;
      }
      const refPath = path.join(workflowDir, relativeRef);
      if (!(await fileExists(refPath))) {
        errors.push(buildIssue("workflow_ref_missing", repoPath, `${key} target is missing: ${relativeRef}`));
      }
    }
  }

  return { ids: workflowIds };
}

async function loadPartyCatalog(errors, checked, workflowIds) {
  const indexPath = path.join(repoRoot, ".party", "index.yaml");
  checked.push(".party/index.yaml");
  const partyIds = new Set();
  const indexDocument = await readYamlOrIssue(indexPath, ".party/index.yaml", errors);
  if (indexDocument === YAML_READ_FAILED) {
    return { ids: partyIds };
  }

  for (const entry of arrayValue(indexDocument?.entries)) {
    const partyId = stringValue(entry?.party_id);
    const partyPath = stringValue(entry?.path);
    if (!partyId || !partyPath) {
      errors.push(buildIssue("party_index_entry_invalid", ".party/index.yaml", "party entry must include party_id and path"));
      continue;
    }

    const absolutePath = path.join(repoRoot, ".party", partyPath);
    const repoPath = normalizeRepoPath(path.relative(repoRoot, absolutePath));
    checked.push(repoPath);

    if (!(await fileExists(absolutePath))) {
      errors.push(buildIssue("missing_party_file", repoPath, "party path from index.yaml does not exist"));
      continue;
    }

    const document = await readYamlOrIssue(absolutePath, repoPath, errors);
    if (document === YAML_READ_FAILED) {
      continue;
    }
    const actualPartyId = stringValue(document?.party_id);
    if (actualPartyId !== partyId) {
      errors.push(
        buildIssue(
          "party_id_mismatch",
          repoPath,
          `expected party_id ${partyId}, got ${actualPartyId ?? "(missing)"}`,
        ),
      );
      continue;
    }

    partyIds.add(partyId);
    const defaultWorkflowId = stringValue(document?.default_workflow_id);
    if (defaultWorkflowId && !workflowIds.has(defaultWorkflowId)) {
      errors.push(buildIssue("party_default_workflow_missing", repoPath, `default_workflow_id ${defaultWorkflowId} does not resolve`));
    }

    const partyDir = path.dirname(absolutePath);
    for (const key of ["member_slots", "allowed_species", "allowed_classes", "allowed_workflows", "appserver_profile"]) {
      const relativeRef = stringValue(document?.[key]);
      if (!relativeRef) {
        errors.push(buildIssue("party_missing_ref", repoPath, `${key} must be present`));
        continue;
      }
      const refPath = path.join(partyDir, relativeRef);
      if (!(await fileExists(refPath))) {
        errors.push(buildIssue("party_ref_missing", repoPath, `${key} target is missing: ${relativeRef}`));
      }
    }
  }

  return { ids: partyIds };
}

async function loadUnitCatalog(errors, checked) {
  const root = path.join(repoRoot, ".unit");
  const units = [];

  for (const entry of await listDirectories(root, errors, ".unit")) {
    const unitPath = path.join(root, entry, "unit.yaml");
    if (!(await fileExists(unitPath))) {
      errors.push(buildIssue("missing_unit_file", `.unit/${entry}/unit.yaml`, "unit.yaml is missing"));
      continue;
    }
    checked.push(`.unit/${entry}/unit.yaml`);
    const document = await readYamlOrIssue(unitPath, `.unit/${entry}/unit.yaml`, errors);
    if (document === YAML_READ_FAILED) {
      continue;
    }
    units.push({ dirName: entry, path: unitPath, document });
  }

  return units;
}

function validateUnitCatalog(unitDocuments, speciesCatalog, classIds, context) {
  for (const unit of unitDocuments) {
    const repoPath = normalizeRepoPath(path.relative(repoRoot, unit.path));
    const unitId = stringValue(unit.document?.unit_id);
    if (unitId !== unit.dirName) {
      context.errors.push(buildIssue("unit_id_mismatch", repoPath, `expected unit_id ${unit.dirName}, got ${unitId ?? "(missing)"}`));
    }

    const speciesId = stringValue(unit.document?.identity?.species_id);
    if (!speciesId || !speciesCatalog.ids.has(speciesId)) {
      context.errors.push(buildIssue("unit_species_missing", repoPath, `identity.species_id ${speciesId ?? "(missing)"} does not resolve`));
    }

    const heroId = stringValue(unit.document?.identity?.hero_id);
    if (speciesId && heroId) {
      const heroIds = speciesCatalog.heroIdsBySpecies.get(speciesId) ?? new Set();
      if (!heroIds.has(heroId)) {
        context.errors.push(buildIssue("unit_hero_missing", repoPath, `identity.hero_id ${heroId} does not resolve within species ${speciesId}`));
      }
    }

    for (const classId of arrayValue(unit.document?.class_ids).map(stringValue).filter(Boolean)) {
      if (!classIds.has(classId)) {
        context.errors.push(buildIssue("unit_class_missing", repoPath, `class_id ${classId} does not resolve`));
      }
    }
  }
}

async function loadMissionCatalog(errors, checked) {
  const indexPath = path.join(repoRoot, ".mission", "index.yaml");
  checked.push(".mission/index.yaml");
  const missions = [];
  const indexDocument = await readYamlOrIssue(indexPath, ".mission/index.yaml", errors);
  if (indexDocument === YAML_READ_FAILED) {
    return missions;
  }

  for (const entry of arrayValue(indexDocument?.entries)) {
    const missionId = stringValue(entry?.mission_id);
    if (!missionId) {
      errors.push(buildIssue("mission_index_entry_invalid", ".mission/index.yaml", "mission entry must include mission_id"));
      continue;
    }

    const missionDir = path.join(repoRoot, ".mission", missionId);
    const missionPath = path.join(missionDir, "mission.yaml");
    const readinessPath = path.join(missionDir, "readiness.yaml");
    const dispatchPath = path.join(missionDir, "dispatch_request.yaml");
    const resolvedPlanPath = path.join(missionDir, "resolved_plan.yaml");

    for (const filePath of [missionPath, readinessPath, dispatchPath, resolvedPlanPath]) {
      const repoPath = normalizeRepoPath(path.relative(repoRoot, filePath));
      if (!(await fileExists(filePath))) {
        errors.push(buildIssue("mission_support_file_missing", repoPath, "mission support file is missing"));
      } else {
        checked.push(repoPath);
      }
    }

    if (!(await fileExists(missionPath)) || !(await fileExists(readinessPath))) {
      continue;
    }

    const missionDocument = await readYamlOrIssue(missionPath, normalizeRepoPath(path.relative(repoRoot, missionPath)), errors);
    const readinessDocument = await readYamlOrIssue(readinessPath, normalizeRepoPath(path.relative(repoRoot, readinessPath)), errors);
    if (missionDocument === YAML_READ_FAILED || readinessDocument === YAML_READ_FAILED) {
      continue;
    }

    missions.push({
      indexEntry: entry,
      path: missionPath,
      readinessPath,
      document: missionDocument,
      readiness: readinessDocument,
    });
  }

  return missions;
}

function validateMissionCatalog(missionDocuments, workflowIds, partyIds, context) {
  for (const mission of missionDocuments) {
    const missionRepoPath = normalizeRepoPath(path.relative(repoRoot, mission.path));
    const readinessRepoPath = normalizeRepoPath(path.relative(repoRoot, mission.readinessPath));
    const expectedMissionId = stringValue(mission.indexEntry?.mission_id);
    const missionId = stringValue(mission.document?.mission_id);

    if (missionId !== expectedMissionId) {
      context.errors.push(buildIssue("mission_id_mismatch", missionRepoPath, `expected mission_id ${expectedMissionId}, got ${missionId ?? "(missing)"}`));
    }

    const readinessMissionId = stringValue(mission.readiness?.mission_id);
    if (readinessMissionId !== expectedMissionId) {
      context.errors.push(buildIssue("readiness_mission_id_mismatch", readinessRepoPath, `expected mission_id ${expectedMissionId}, got ${readinessMissionId ?? "(missing)"}`));
    }

    const partyId = stringValue(mission.document?.party_id);
    if (!partyId || !partyIds.has(partyId)) {
      context.errors.push(buildIssue("mission_party_missing", missionRepoPath, `party_id ${partyId ?? "(missing)"} does not resolve`));
    }

    const workflowId = stringValue(mission.document?.workflow_id);
    if (workflowId) {
      if (!workflowIds.has(workflowId)) {
        context.errors.push(buildIssue("mission_workflow_missing", missionRepoPath, `workflow_id ${workflowId} does not resolve`));
      }
    } else {
      const readinessStatus = stringValue(mission.readiness?.status);
      const workflowPresent = stringValue(mission.readiness?.checks?.workflow_present);
      if (readinessStatus !== "blocked" || workflowPresent !== "missing") {
        context.errors.push(
          buildIssue(
            "mission_null_workflow_invalid",
            missionRepoPath,
            "workflow_id null is only allowed when readiness.status is blocked and checks.workflow_present is missing",
          ),
        );
      }
    }

    const indexStatus = stringValue(mission.indexEntry?.status);
    const missionStatus = stringValue(mission.document?.status);
    if (indexStatus && missionStatus && indexStatus !== missionStatus) {
      context.errors.push(buildIssue("mission_status_mismatch", missionRepoPath, `index status ${indexStatus} does not match mission status ${missionStatus}`));
    }

    const indexReadinessStatus = stringValue(mission.indexEntry?.readiness_status);
    const readinessStatus = stringValue(mission.readiness?.status);
    if (indexReadinessStatus && readinessStatus && indexReadinessStatus !== readinessStatus) {
      context.errors.push(
        buildIssue(
          "mission_readiness_status_mismatch",
          readinessRepoPath,
          `index readiness_status ${indexReadinessStatus} does not match readiness status ${readinessStatus}`,
        ),
      );
    }

    if (stringValue(mission.document?.schema_version) === publicMissionDraftSchemaVersion) {
      validatePublicMissionDraft(mission.document, { errors: context.errors, missionRepoPath });
    }
  }
}

function validatePublicMissionDraft(document, context) {
  validatePublicMissionDraftRequiredRedactionFields(document, context);

  for (const item of walkYamlValue(document)) {
    if (item.kind === "field") {
      validatePublicMissionDraftField(item, context);
      continue;
    }

    validatePublicMissionDraftString(item, context);
  }
}

function validatePublicMissionDraftRequiredRedactionFields(document, context) {
  const boundary = document?.boundary && typeof document.boundary === "object" && !Array.isArray(document.boundary) ? document.boundary : {};

  for (const [field, expectedValue] of publicMissionDraftRequiredRedactionFields) {
    if (!Object.hasOwn(boundary, field)) {
      context.errors.push(
        buildIssue(
          "public_mission_draft_required_redaction_field_missing",
          context.missionRepoPath,
          `boundary.${field} must be present for public mission drafts`,
        ),
      );
      continue;
    }

    if (boundary[field] !== expectedValue) {
      context.errors.push(
        buildIssue(
          issueIdForPublicMissionDraftRedactionField(field),
          context.missionRepoPath,
          `boundary.${field} must be ${expectedValue} for public mission drafts`,
        ),
      );
    }
  }
}

function issueIdForPublicMissionDraftRedactionField(field) {
  if (field === "raw_payload_copied") {
    return "public_mission_draft_raw_payload_copied";
  }
  return publicMissionDraftSafeTrueFieldIssues.get(field) ?? "public_mission_draft_required_redaction_field_invalid";
}

function validatePublicMissionDraftField(item, context) {
  const fieldPath = formatTrail(item.trail);

  if (item.key === "raw_payload_copied" && item.value !== false) {
    context.errors.push(
      buildIssue(
        "public_mission_draft_raw_payload_copied",
        context.missionRepoPath,
        `${fieldPath} must be false for public mission drafts`,
      ),
    );
  }

  const safeTrueIssueId = publicMissionDraftSafeTrueFieldIssues.get(item.key);
  if (safeTrueIssueId && item.value !== true) {
    context.errors.push(
      buildIssue(
        safeTrueIssueId,
        context.missionRepoPath,
        `${fieldPath} must be true for public mission drafts`,
      ),
    );
  }

  if (publicMissionDraftSecretKeyPattern.test(item.key) && scalarHasContent(item.value)) {
    context.errors.push(
      buildIssue(
        "public_mission_draft_secret_like_value",
        context.missionRepoPath,
        `${fieldPath} contains a secret-like key or value`,
      ),
    );
  }

  if (!publicMissionDraftAllowedMarkerKeys.has(item.key) && publicMissionDraftForbiddenMarkerPattern.test(item.key)) {
    context.errors.push(
      buildIssue(
        "public_mission_draft_forbidden_marker",
        context.missionRepoPath,
        `${fieldPath} uses a forbidden raw/private/source payload marker`,
      ),
    );
  }
}

function validatePublicMissionDraftString(item, context) {
  const fieldPath = formatTrail(item.trail);
  if (publicMissionDraftPrivateRefPattern.test(item.value)) {
    context.errors.push(
      buildIssue(
        "public_mission_draft_unredacted_private_ref",
        context.missionRepoPath,
        `${fieldPath} contains an unredacted private/source reference marker`,
      ),
    );
  }

  if (publicMissionDraftForbiddenMarkerPattern.test(item.value)) {
    context.errors.push(
      buildIssue(
        "public_mission_draft_forbidden_marker",
        context.missionRepoPath,
        `${fieldPath} contains a forbidden raw/private/source payload marker`,
      ),
    );
  }

  if (publicMissionDraftLocalFileRefPattern.test(item.value)) {
    context.errors.push(
      buildIssue(
        "public_mission_draft_local_file_ref",
        context.missionRepoPath,
        `${fieldPath} contains a URL-style local file reference`,
      ),
    );
  }

  if (publicMissionDraftSecretValuePattern.test(item.value)) {
    context.errors.push(
      buildIssue(
        "public_mission_draft_secret_like_value",
        context.missionRepoPath,
        `${fieldPath} contains a secret-like assignment`,
      ),
    );
  }
}

async function validateClassKnowledgeRefs(classDocuments, knowledgeIds, context) {
  for (const classDocument of classDocuments) {
    const classDir = path.dirname(classDocument.path);
    const pointer = stringValue(classDocument.document?.knowledge_refs);
    const defaultRefsPath = path.join(classDir, "knowledge_refs.yaml");
    let refsPath = null;

    if (pointer) {
      refsPath = path.resolve(classDir, pointer);
      const classRelativePath = path.relative(classDir, refsPath);
      if (path.isAbsolute(pointer) || classRelativePath === ".." || classRelativePath.startsWith(`..${path.sep}`)) {
        const classRepoPath = normalizeRepoPath(path.relative(repoRoot, classDocument.path));
        context.errors.push(buildIssue("knowledge_refs_pointer_not_class_local", classRepoPath, `knowledge_refs target must stay class-local: ${pointer}`));
        continue;
      }

      if (!(await fileExists(refsPath))) {
        const refsRepoPath = normalizeRepoPath(path.relative(repoRoot, refsPath));
        context.errors.push(buildIssue("knowledge_refs_file_missing", refsRepoPath, "knowledge_refs target from class.yaml is missing"));
        continue;
      }
    } else if (await fileExists(defaultRefsPath)) {
      refsPath = defaultRefsPath;
    } else {
      continue;
    }

    const repoPath = normalizeRepoPath(path.relative(repoRoot, refsPath));
    context.checked.push(repoPath);
    const document = await readYamlOrIssue(refsPath, repoPath, context.errors);
    if (document === YAML_READ_FAILED) {
      continue;
    }
    validateKnowledgeRefsDocument(document, {
      classId: classDocument.dirName,
      knowledgeIds,
      repoPath,
      errors: context.errors,
    });
  }
}

function validateKnowledgeRefsDocument(document, context) {
  const classId = stringValue(document?.class_id);
  if (!classId) {
    context.errors.push(buildIssue("knowledge_refs_class_id_missing", context.repoPath, "class_id must be present"));
  } else if (classId !== context.classId) {
    context.errors.push(buildIssue("knowledge_refs_class_id_mismatch", context.repoPath, `expected class_id ${context.classId}, got ${classId}`));
  }

  const kind = stringValue(document?.kind);
  if (kind !== "knowledge_refs") {
    context.errors.push(buildIssue("knowledge_refs_kind_invalid", context.repoPath, `expected kind knowledge_refs, got ${kind ?? "(missing)"}`));
  }

  const status = stringValue(document?.status);
  if (!status) {
    context.errors.push(buildIssue("knowledge_refs_status_missing", context.repoPath, "status must be present"));
  }

  if (!Array.isArray(document?.assign)) {
    context.errors.push(buildIssue("knowledge_refs_assign_invalid", context.repoPath, "assign must be an array"));
    return;
  }

  const seenAssignKeys = new Set();
  for (const [index, assignment] of document.assign.entries()) {
    const assignKey = stringValue(assignment?.assign);
    if (!assignKey) {
      context.errors.push(buildIssue("knowledge_refs_assign_key_missing", context.repoPath, `assign[${index}].assign must be present`));
    } else if (seenAssignKeys.has(assignKey)) {
      context.errors.push(buildIssue("knowledge_refs_duplicate_assign", context.repoPath, `duplicate assign key: ${assignKey}`));
    } else {
      seenAssignKeys.add(assignKey);
    }

    const knowledgeRef = stringValue(assignment?.ref);
    if (!knowledgeRef) {
      context.errors.push(buildIssue("knowledge_refs_ref_missing", context.repoPath, `assign[${index}].ref must be present`));
    } else if (!context.knowledgeIds.has(knowledgeRef)) {
      context.errors.push(buildIssue("knowledge_refs_ref_unresolved", context.repoPath, `assign[${index}].ref does not resolve: ${knowledgeRef}`));
    }
  }
}

async function assertPathExists(relativePath, context) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!(await fileExists(absolutePath))) {
    context.errors.push(buildIssue("required_path_missing", relativePath, "required path is missing"));
    return;
  }
  context.checked.push(relativePath);
}

async function listDirectories(rootPath, errors, label) {
  try {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch (error) {
    errors.push(buildIssue("directory_read_failed", label, error instanceof Error ? error.message : String(error)));
    return [];
  }
}

async function readYaml(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return YAML.parse(prepareYamlText(text));
}

// 파싱/IO 실패는 fatal(exit 2, 보고 0바이트)이 아니라 검증 실패 항목이다(#S3-7).
// 실패 sentinel 은 정상 파싱 결과 null(빈 파일/주석만)과 반드시 구분한다 —
// null 은 기존 검증 로직(id mismatch 등)으로 그대로 흘려보낸다.
const YAML_READ_FAILED = Symbol("yaml_read_failed");

async function readYamlOrIssue(filePath, repoPath, errors) {
  try {
    return await readYaml(filePath);
  } catch (error) {
    const firstLine = String(error instanceof Error ? error.message : error).split(/\r?\n/u)[0];
    errors.push(buildIssue("yaml_read_failed", repoPath, firstLine));
    return YAML_READ_FAILED;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildIssue(id, file, detail) {
  return { id, file, detail };
}

function normalizeRepoPath(value) {
  return value.split(path.sep).join("/");
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function* walkYamlValue(value, trail = []) {
  if (typeof value === "string") {
    yield { kind: "string", trail, value };
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      yield* walkYamlValue(item, [...trail, `[${index}]`]);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    const fieldTrail = [...trail, key];
    yield { kind: "field", trail: fieldTrail, key, value: item };
    yield* walkYamlValue(item, fieldTrail);
  }
}

function scalarHasContent(value) {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return value === true || typeof value === "number";
}

function formatTrail(trail) {
  return trail.reduce((text, part) => {
    if (part.startsWith("[")) {
      return `${text}${part}`;
    }
    return text ? `${text}.${part}` : part;
  }, "");
}

function prepareYamlText(text) {
  const withoutBom = text.replace(/^\uFEFF/, "");
  return withoutBom
    .split("\n")
    .map((line) => {
      const match = line.match(/^(\s*-\s+)(`.*)$/);
      if (!match) {
        return line;
      }
      const [, prefix, content] = match;
      return `${prefix}"${escapeDoubleQuotedYaml(content)}"`;
    })
    .join("\n");
}

function escapeDoubleQuotedYaml(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Soulforge Canon Validate fatal: ${detail}\n`);
  process.exitCode = 2;
});
