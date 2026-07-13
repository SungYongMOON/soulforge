#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HELP = `Usage:
  node validate_document_packet.mjs --packet <packet.json> --schema <schema.json> --tokens <tokens.yaml> [--json]

Validates the portable Soulforge team document packet contract without writing
files or using network access. The schema file is checked for the expected
identity and portable pointer policy; cross-reference and semantic rules are
enforced directly by this dependency-free validator.
`;

function parseArgs(argv) {
  const options = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (["--packet", "--schema", "--tokens"].includes(arg)) {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`missing value for ${arg}`);
      options[arg.slice(2)] = value;
      i += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  for (const name of ["packet", "schema", "tokens"]) {
    if (!options[name]) throw new Error(`missing required argument: --${name}`);
  }
  return options;
}

function sha256(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

function readUtf8(path) {
  return readFileSync(resolve(path), "utf8");
}

function parseJson(text, label, failures) {
  try {
    return JSON.parse(text);
  } catch (error) {
    failures.push(`${label} is not valid JSON: ${error.message}`);
    return null;
  }
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function collectIds(items, field, label, failures) {
  const ids = new Set();
  for (const [index, item] of asArray(items).entries()) {
    const id = item?.[field];
    if (typeof id !== "string" || id.length === 0) {
      failures.push(`${label}[${index}] is missing ${field}`);
      continue;
    }
    if (ids.has(id)) failures.push(`${label} contains duplicate ${field}: ${id}`);
    ids.add(id);
  }
  return ids;
}

function requireRefs(refs, allowed, label, failures) {
  for (const ref of asArray(refs)) {
    if (!allowed.has(ref)) failures.push(`${label} has unresolved ref: ${ref}`);
  }
}

function containsRawHtml(value) {
  if (typeof value === "string") return /<\s*[\/?a-zA-Z!][^>]*>/.test(value);
  if (Array.isArray(value)) return value.some(containsRawHtml);
  if (value && typeof value === "object") return Object.values(value).some(containsRawHtml);
  return false;
}

function portableWorkspacePointer(value) {
  return typeof value === "string"
    && /^_workspaces[\\/]/.test(value)
    && !/^[A-Za-z]:[\\/]/.test(value)
    && !value.startsWith("/")
    && !value.includes("..")
    && !value.startsWith("_workmeta/")
    && !value.startsWith("_workmeta\\");
}

function allowedSourcePointer(value) {
  return typeof value === "string"
    && (/^_workspaces[\\/]/.test(value)
      || value.startsWith("workspace://")
      || value.startsWith("fixture://")
      || value.startsWith("https://"))
    && !/^[A-Za-z]:[\\/]/.test(value)
    && !value.includes("..")
    && !value.startsWith("_workmeta/")
    && !value.startsWith("_workmeta\\");
}

function expectedMetricResult(metric, failures) {
  const comparison = metric?.comparison ?? {};
  const { operator, target, lower_bound: lower, upper_bound: upper, expected_text: expectedText } = comparison;
  const value = metric?.value;
  let passed = null;
  if (operator === "gte") passed = typeof value === "number" && typeof target === "number" && value >= target;
  if (operator === "lte") passed = typeof value === "number" && typeof target === "number" && value <= target;
  if (operator === "between_inclusive") {
    passed = typeof value === "number" && typeof lower === "number" && typeof upper === "number" && value >= lower && value <= upper;
  }
  if (operator === "equals") passed = value === expectedText;
  if (passed === null) {
    failures.push(`metric ${metric?.metric_id ?? "<unknown>"} uses unsupported or ill-typed comparison: ${operator ?? "<missing>"}`);
    return null;
  }
  return passed ? "pass" : "fail";
}

function cellMatchesType(value, type) {
  if (value === null) return true;
  if (type === "integer") return Number.isInteger(value);
  if (type === "decimal") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "date" || type === "datetime" || type === "string") return typeof value === "string";
  return false;
}

function validateTable(table, evidenceIds, failures) {
  const columns = asArray(table.columns);
  const columnKeys = collectIds(columns, "key", `${table.table_id}.columns`, failures);
  for (const [rowIndex, row] of asArray(table.rows).entries()) {
    const cells = asArray(row.cells);
    const cellKeys = collectIds(cells, "column_key", `${table.table_id}.rows[${rowIndex}].cells`, failures);
    if (!sameSet(columnKeys, cellKeys)) failures.push(`${table.table_id}.rows[${rowIndex}] cell keys do not match declared columns`);
    for (const cell of cells) {
      const column = columns.find((candidate) => candidate.key === cell.column_key);
      if (column && !cellMatchesType(cell.value, column.data_type)) {
        failures.push(`${table.table_id}.rows[${rowIndex}].${cell.column_key} violates data_type ${column.data_type}`);
      }
    }
    requireRefs(row.evidence_refs, evidenceIds, `${table.table_id}.rows[${rowIndex}].evidence_refs`, failures);
  }
}

function validateSectionBlocks(sections, ids, failures) {
  const order = [];
  for (const section of asArray(sections)) {
    order.push(section.purpose);
    for (const [blockIndex, block] of asArray(section.blocks).entries()) {
      const label = `${section.section_id}.blocks[${blockIndex}]`;
      requireRefs(block.evidence_refs, ids.evidence, `${label}.evidence_refs`, failures);
      requireRefs(block.metric_ids, ids.metric, `${label}.metric_ids`, failures);
      requireRefs(block.action_ids, ids.action, `${label}.action_ids`, failures);
      requireRefs(block.risk_ids, ids.risk, `${label}.risk_ids`, failures);
      requireRefs(block.source_ids, ids.source, `${label}.source_ids`, failures);
      requireRefs(block.omission_ids, ids.omission, `${label}.omission_ids`, failures);
      if (block.table_id && !ids.table.has(block.table_id)) failures.push(`${label}.table_id is unresolved: ${block.table_id}`);
      if (block.chart_id && !ids.chart.has(block.chart_id)) failures.push(`${label}.chart_id is unresolved: ${block.chart_id}`);
      for (const [itemIndex, item] of asArray(block.items).entries()) {
        requireRefs(item.evidence_refs, ids.evidence, `${label}.items[${itemIndex}].evidence_refs`, failures);
      }
    }
  }
  return order;
}

function validate(packet, schema, tokenText) {
  const failures = [];
  const warnings = [];
  const checks = [];
  const check = (condition, passLabel, failureLabel = passLabel) => {
    if (condition) checks.push(passLabel);
    else failures.push(failureLabel);
  };

  if (!packet || !schema) return { failures, warnings, checks };
  const requiredTop = asArray(schema.required);
  const allowedTop = new Set(Object.keys(schema.properties ?? {}));
  check(schema.$schema === "https://json-schema.org/draft/2020-12/schema", "schema_identity", "unexpected schema dialect");
  check(schema.title === "Soulforge Team Document Content Packet v0", "schema_title", "unexpected schema title");
  check(schema.additionalProperties === false, "schema_top_level_closed", "schema must set top-level additionalProperties false");
  check(requiredTop.every((key) => Object.hasOwn(packet, key)), "required_top_level_fields", "packet is missing required top-level fields");
  const unknownTop = Object.keys(packet).filter((key) => !allowedTop.has(key));
  check(unknownTop.length === 0, "unknown_top_level_fields", `packet has unknown top-level fields: ${unknownTop.join(", ")}`);
  check(packet.schema_version === "team_document_content_packet.v0", "packet_schema_version", "unexpected packet schema_version");
  check(["approved_for_render", "synthetic_fixture"].includes(packet.packet_state), "packet_state", "packet_state must be approved_for_render or synthetic_fixture");

  const outputs = asArray(packet.requested_outputs);
  const outputSet = new Set(outputs);
  check(outputs.length > 0 && outputs.length <= 3 && outputSet.size === outputs.length, "requested_outputs_cardinality", "requested_outputs must contain one to three unique values");
  check(outputs.every((value) => ["docx", "xlsx", "html"].includes(value)), "requested_outputs_boundary", "requested_outputs may contain only docx, xlsx, and html");
  check(!outputs.some((value) => /ppt/i.test(value)), "ppt_excluded", "PPT/PPTX is forbidden");
  check(portableWorkspacePointer(packet.storage_policy?.artifact_root_pointer), "portable_workspace_output_pointer", "artifact_root_pointer must be a portable _workspaces/... path");
  check(packet.storage_policy?.workmeta_policy === "pointer_hash_receipt_only", "workmeta_metadata_only", "workmeta_policy must be pointer_hash_receipt_only");

  check(packet.source_boundary?.raw_source_bodies_embedded === false, "no_raw_source_bodies", "raw source bodies must not be embedded");
  check(packet.source_boundary?.secrets_embedded === false, "no_secrets", "secrets must not be embedded");
  check(packet.source_boundary?.external_assets_embedded === false, "no_external_assets", "external assets must not be embedded");
  check(!containsRawHtml(packet), "no_raw_html", "packet contains raw HTML-like markup");

  const ids = {
    source: collectIds(packet.sources, "source_id", "sources", failures),
    evidence: collectIds(packet.evidence_items, "evidence_id", "evidence_items", failures),
    metric: collectIds(packet.metrics, "metric_id", "metrics", failures),
    section: collectIds(packet.sections, "section_id", "sections", failures),
    table: collectIds(packet.tables, "table_id", "tables", failures),
    chart: collectIds(packet.charts, "chart_id", "charts", failures),
    action: collectIds(packet.actions, "action_id", "actions", failures),
    risk: collectIds(packet.risks, "risk_id", "risks", failures),
    omission: collectIds(packet.omissions, "omission_id", "omissions", failures),
  };
  const allowedSourceIds = new Set(asArray(packet.source_boundary?.allowed_source_ids));
  check(sameSet(ids.source, allowedSourceIds), "allowed_source_id_set", "allowed_source_ids must exactly match source IDs");

  for (const source of asArray(packet.sources)) {
    check(allowedSourcePointer(source.pointer), `source_pointer:${source.source_id}`, `source ${source.source_id} has a non-portable or forbidden pointer`);
    check(/^sha256:[a-f0-9]{64}$/.test(source.sha256 ?? ""), `source_hash_shape:${source.source_id}`, `source ${source.source_id} has invalid SHA-256 shape`);
    if (source.hash_scope === "pointer_string_for_synthetic_fixture") {
      check(source.sha256 === sha256(source.pointer), `source_hash_value:${source.source_id}`, `source ${source.source_id} synthetic pointer hash mismatch`);
    }
  }

  for (const evidence of asArray(packet.evidence_items)) {
    requireRefs(evidence.source_refs, ids.source, `${evidence.evidence_id}.source_refs`, failures);
    requireRefs(evidence.derivation?.input_evidence_refs, ids.evidence, `${evidence.evidence_id}.derivation.input_evidence_refs`, failures);
    if (asArray(evidence.source_refs).length === 0 && !evidence.derivation) failures.push(`${evidence.evidence_id} needs source_refs or a derivation`);
  }
  for (const metric of asArray(packet.metrics)) {
    requireRefs(metric.evidence_refs, ids.evidence, `${metric.metric_id}.evidence_refs`, failures);
    const expected = expectedMetricResult(metric, failures);
    if (expected && metric.comparison?.result !== expected) failures.push(`${metric.metric_id} comparison result does not match its value and bounds`);
  }
  for (const table of asArray(packet.tables)) validateTable(table, ids.evidence, failures);
  for (const chart of asArray(packet.charts)) {
    if (!ids.table.has(chart.data_ref)) failures.push(`${chart.chart_id}.data_ref is unresolved: ${chart.data_ref}`);
    if (!ids.table.has(chart.table_fallback_id)) failures.push(`${chart.chart_id}.table_fallback_id is unresolved: ${chart.table_fallback_id}`);
    const table = asArray(packet.tables).find((candidate) => candidate.table_id === chart.data_ref);
    const keys = new Set(asArray(table?.columns).map((column) => column.key));
    if (!keys.has(chart.x_key)) failures.push(`${chart.chart_id}.x_key is not a column in ${chart.data_ref}`);
    for (const series of asArray(chart.series)) {
      if (!keys.has(series.column_key)) failures.push(`${chart.chart_id} series column is unresolved: ${series.column_key}`);
    }
    requireRefs(chart.evidence_refs, ids.evidence, `${chart.chart_id}.evidence_refs`, failures);
  }
  for (const action of asArray(packet.actions)) requireRefs(action.evidence_refs, ids.evidence, `${action.action_id}.evidence_refs`, failures);
  for (const risk of asArray(packet.risks)) requireRefs(risk.evidence_refs, ids.evidence, `${risk.risk_id}.evidence_refs`, failures);
  for (const omission of asArray(packet.omissions)) requireRefs(omission.source_refs, ids.source, `${omission.omission_id}.source_refs`, failures);

  const sectionPurposeOrder = validateSectionBlocks(packet.sections, ids, failures);
  const expectedPurposeOrder = ["executive_summary", "scope", "criteria", "results", "interpretation", "actions_and_risks", "sources_and_omissions"];
  check(sectionPurposeOrder.length === expectedPurposeOrder.length && sectionPurposeOrder.every((value, index) => value === expectedPurposeOrder[index]), "common_information_order", "sections do not follow the required common information order");

  const start = Date.parse(packet.document?.reporting_period?.start_date);
  const end = Date.parse(packet.document?.reporting_period?.end_date);
  check(Number.isFinite(start) && Number.isFinite(end) && end >= start, "reporting_period_order", "reporting period is invalid or reversed");
  check(packet.presentation_profile?.design_token_id === "soulforge_team_document_v0", "design_token_binding", "unexpected design_token_id");
  check(/token_version:\s*soulforge_team_document_v0\b/.test(tokenText), "token_file_identity", "token file does not declare soulforge_team_document_v0");
  for (const format of outputs) check(new RegExp(`^\\s*[-]\\s+${format}\\s*$`, "m").test(tokenText), `token_supports:${format}`, `token file does not support requested format ${format}`);
  check(/remote_dependencies:\s*forbidden\b/.test(tokenText), "tokens_forbid_remote_dependencies", "token file must forbid remote dependencies");
  check(/external_unlicensed_assets:\s*forbidden\b/.test(tokenText), "tokens_forbid_unlicensed_assets", "token file must forbid unlicensed external assets");

  if (packet.packet_state === "synthetic_fixture") warnings.push("synthetic fixture only; owner real-report pilots and approval remain required");
  return { failures, warnings, checks };
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`ERROR: ${error.message}\n\n${HELP}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  const failures = [];
  let packetText = "";
  let schemaText = "";
  let tokenText = "";
  try {
    packetText = readUtf8(options.packet);
    schemaText = readUtf8(options.schema);
    tokenText = readUtf8(options.tokens);
  } catch (error) {
    failures.push(`unable to read input: ${error.message}`);
  }
  const packet = failures.length ? null : parseJson(packetText, "packet", failures);
  const schema = failures.length ? null : parseJson(schemaText, "schema", failures);
  const result = validate(packet, schema, tokenText);
  failures.push(...result.failures);
  const report = {
    validator: "document_artifact_publisher_v0.packet_validator",
    validator_version: "0.1.0",
    status: failures.length === 0 ? "pass" : "fail",
    packet_sha256: packetText ? sha256(packetText) : null,
    schema_sha256: schemaText ? sha256(schemaText) : null,
    token_sha256: tokenText ? sha256(tokenText) : null,
    check_count: result.checks.length,
    checks: result.checks,
    warnings: result.warnings,
    failures,
    boundary: {
      writes_performed: false,
      network_access: false,
      ppt_or_pptx_supported: false,
      reusable_runtime_absolute_paths: false,
    },
  };
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${report.status.toUpperCase()}: ${report.check_count} checks; ${failures.length} failures`);
    for (const failure of failures) console.log(`- ${failure}`);
    for (const warning of result.warnings) console.log(`WARNING: ${warning}`);
  }
  if (failures.length > 0) process.exitCode = 1;
}

main();
