#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const schemaVersion = "soulforge.canon.validate.v0";

async function main() {
  const args = parseArgs(process.argv.slice(2));
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

  for (const token of argv) {
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
  const workflowCatalog = await loadWorkflowCatalog(errors, checked);
  const partyCatalog = await loadPartyCatalog(errors, checked, workflowCatalog.ids);
  const unitCatalog = await loadUnitCatalog(errors, checked);
  const missionCatalog = await loadMissionCatalog(errors, checked);

  await assertPathExists("_workspaces/README.md", { errors, checked });
  await assertPathExists(".registry/index.yaml", { errors, checked });

  validateUnitCatalog(unitCatalog, speciesCatalog, classCatalog.ids, { errors });
  validateMissionCatalog(missionCatalog, workflowCatalog.ids, partyCatalog.ids, { errors });

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

    const document = await readYaml(speciesPath);
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

  for (const entry of await listDirectories(root, errors, ".registry/classes")) {
    const classPath = path.join(root, entry, "class.yaml");
    checked.push(`.registry/classes/${entry}/class.yaml`);

    if (!(await fileExists(classPath))) {
      errors.push(buildIssue("missing_class_file", `.registry/classes/${entry}/class.yaml`, "class.yaml is missing"));
      continue;
    }

    const document = await readYaml(classPath);
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

  return { ids: classIds };
}

async function loadWorkflowCatalog(errors, checked) {
  const indexPath = path.join(repoRoot, ".workflow", "index.yaml");
  checked.push(".workflow/index.yaml");
  const workflowIds = new Set();
  const indexDocument = await readYaml(indexPath);

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

    const document = await readYaml(absolutePath);
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
  const indexDocument = await readYaml(indexPath);

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

    const document = await readYaml(absolutePath);
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
    units.push({ dirName: entry, path: unitPath, document: await readYaml(unitPath) });
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
  const indexDocument = await readYaml(indexPath);

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

    missions.push({
      indexEntry: entry,
      path: missionPath,
      readinessPath,
      document: await readYaml(missionPath),
      readiness: await readYaml(readinessPath),
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
