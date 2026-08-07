#!/usr/bin/env node

import {
  validateOrganizationCatalog,
  validateOrganizationCatalogEnrollment
} from "../core/live-organization-catalog.mjs";
import {
  MANUAL_ORGANIZATION_CATALOG_WRITES_DISABLED,
  defaultOrganizationCatalogPath,
  readOrganizationCatalog
} from "../server/live-organization-catalog-store.mjs";
import { readThreadEnrollmentRegistry } from "../core/live-thread-enrollment.mjs";

const HELP = [
  "Workspace Board organization governance projection (read-only)",
  "",
  "Commands:",
  "  validate [--registry PATH] [--assert-no-question-mark-labels]",
  "  reconcile-enrollment [--registry PATH]",
  "  list",
  "",
  "The Board does not write or upsert organization catalog data. Edit the local",
  "governance overlay through its owner workflow, then use this CLI to inspect the",
  "projected read-only catalog. This CLI never mutates a Codex thread, route,",
  "work item, or raw content.",
  ""
].join("\n");

function parseArgs(argv) {
  const [command = "help", ...tokens] = argv;
  const flags = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) throw new Error("invalid_argument");
    const key = token.slice(2);
    const next = tokens[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index += 1;
  }
  return { command, flags };
}

function flagValue(flags, key, fallback = undefined) {
  return flags[key] === undefined ? fallback : flags[key];
}

function safeOutput(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

function catalogSummary(catalog) {
  return {
    catalog_revision: catalog.catalog_revision,
    companies: catalog.companies.length,
    groups: catalog.groups.length,
    disabled: catalog.disabled
  };
}

function labelIntegrity(catalog, { assertNoQuestionMarkLabels = false } = {}) {
  const labels = [
    catalog.root_display_label,
    ...catalog.companies.map((company) => company.display_label),
    ...catalog.groups.map((group) => group.display_label)
  ];
  const literalQuestionMarkLabelCount = labels.filter((label) => label.includes("?")).length;
  const valid = !assertNoQuestionMarkLabels || literalQuestionMarkLabelCount === 0;
  return {
    valid,
    error: valid ? null : "organization_catalog_label_question_mark_detected",
    assertion: assertNoQuestionMarkLabels ? "no_literal_question_mark_labels" : "not_requested",
    literal_question_mark_label_count: literalQuestionMarkLabelCount
  };
}

async function loadCatalog(path) {
  const loaded = await readOrganizationCatalog(path);
  if (!loaded.catalog) throw new Error(`organization_catalog_${loaded.status}`);
  return loaded.catalog;
}

async function loadEnrollmentRegistry(path) {
  const loaded = await readThreadEnrollmentRegistry(path);
  if (!loaded.registry) throw new Error(loaded.status === "missing" ? "enrollment_registry_missing" : "invalid_enrollment_registry");
  return loaded.registry;
}

async function run() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(HELP);
    return;
  }

  const catalogPath = String(
    process.env.TEAM_OPS_BOARD_ORGANIZATION_GOVERNANCE_OVERLAY
    || flagValue(flags, "catalog", defaultOrganizationCatalogPath())
  );
  const registryPath = String(
    process.env.TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY
    || flagValue(flags, "registry")
    || ""
  );

  if (["init", "upsert-company", "upsert-group", "retire-group"].includes(command)) {
    throw new Error(MANUAL_ORGANIZATION_CATALOG_WRITES_DISABLED);
  }

  if (command === "validate" || command === "reconcile-enrollment") {
    const catalog = await loadCatalog(catalogPath);
    const catalogValidation = validateOrganizationCatalog(catalog);
    const labels = labelIntegrity(catalog, { assertNoQuestionMarkLabels: flags["assert-no-question-mark-labels"] === true });
    if (!registryPath) {
      safeOutput({
        command,
        valid: catalogValidation.valid && labels.valid,
        error: catalogValidation.error ?? labels.error,
        summary: catalogValidation.summary ?? null,
        label_integrity: labels
      });
      if (!catalogValidation.valid || !labels.valid) process.exitCode = 1;
      return;
    }
    const registry = await loadEnrollmentRegistry(registryPath);
    const reconciliation = validateOrganizationCatalogEnrollment(catalog, registry);
    safeOutput({
      command,
      valid: catalogValidation.valid && labels.valid && reconciliation.valid,
      error: catalogValidation.error ?? labels.error ?? reconciliation.error,
      summary: catalogValidation.summary ?? null,
      label_integrity: labels,
      enrollment: reconciliation
    });
    if (!catalogValidation.valid || !labels.valid || !reconciliation.valid) process.exitCode = 1;
    return;
  }

  if (command === "list") {
    const catalog = await loadCatalog(catalogPath);
    safeOutput({
      command,
      schema_version: catalog.schema_version,
      catalog_revision: catalog.catalog_revision,
      root_display_label: catalog.root_display_label,
      disabled: catalog.disabled,
      companies: catalog.companies,
      groups: catalog.groups
    });
    return;
  }

  throw new Error("unknown_command");
}

run().catch((error) => {
  process.stderr.write(String(error?.message || "organization_catalog_failed").replace(/[\r\n]+/gu, " ") + "\n");
  process.exitCode = 1;
});
