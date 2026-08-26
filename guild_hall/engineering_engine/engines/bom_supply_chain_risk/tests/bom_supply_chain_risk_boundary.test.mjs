import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import {
  assembleEffectiveRuleSet,
  evaluate,
  resolveProfileBindings,
} from "../../../core/interfaces/domain_engine_adapter.mjs";
import { bomSupplyChainRiskAdapter } from "../evaluator/bom_supply_chain_risk_evaluator_adapter.mjs";
import {
  buildBomSupplyChainRiskPublicSyntheticObservation,
  buildBomSupplyChainRiskPublicSyntheticProfile,
  buildBomSupplyChainRiskPublicSyntheticTypedFacts,
} from "../fixtures/bom_supply_chain_risk_public_synthetic.mjs";
import { createBomSupplyChainRiskModuleManifest } from "../topology/bom_supply_chain_risk_module_manifest.mjs";
import { BOM_SCR_SOURCE_PACKET_REF } from "../rules/bom_supply_chain_risk_rules.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const domainRoot = join(here, "..");

function packageFiles(directory = domainRoot) {
  const absoluteFiles = readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory()
      ? packageFiles(join(directory, entry.name))
      : [join(directory, entry.name)]));
  return directory === domainRoot
    ? absoluteFiles.map((file) => relative(domainRoot, file).replaceAll("\\", "/")).sort()
    : absoluteFiles;
}

function loadJson(relativePath) {
  return JSON.parse(readFileSync(join(domainRoot, relativePath), "utf8"));
}

function publicSyntheticAssembly() {
  const [profile] = resolveProfileBindings(buildBomSupplyChainRiskPublicSyntheticProfile(), null);
  return assembleEffectiveRuleSet(bomSupplyChainRiskAdapter, [profile], {});
}

test("BOM/SCR topology manifest remains candidate, owned, and zero-effect", () => {
  const manifest = createBomSupplyChainRiskModuleManifest();
  assert.equal(manifest.domain_engine_id, "bom_supply_chain_risk");
  assert.equal(manifest.status, "candidate");
  assert.equal(manifest.execution_mode, "deterministic_only");
  assert.match(manifest.manifest_sha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(manifest.effects, {
    filesystem_writes: 0,
    network_requests: 0,
    model_calls: 0,
    procurement_actions: 0,
    erp_writes: 0,
    authority_actions: 0,
  });
  assert.ok(manifest.owned_paths.includes("integration_request.md"));
  assert.ok(manifest.owned_paths.includes("topology/bom_supply_chain_risk_topology.json"));
});

test("BOM/SCR local manifest and topology exactly enumerate every package file including themselves", () => {
  const expected = packageFiles();
  const manifest = createBomSupplyChainRiskModuleManifest();
  assert.deepEqual(manifest.owned_paths, expected);
  assert.ok(manifest.owned_paths.includes("topology/bom_supply_chain_risk_module_manifest.mjs"));

  const topology = loadJson("topology/bom_supply_chain_risk_topology.json");
  assert.equal(topology.schema_version, "soulforge.domain_engine_topology.v0");
  assert.deepEqual(topology.owned_paths, expected);
  assert.ok(topology.nodes.includes("topology/bom_supply_chain_risk_module_manifest.mjs"));

  const descriptor = readFileSync(join(domainRoot, "engine.yaml"), "utf8");
  assert.match(descriptor, /^topology:/mu);
  assert.match(descriptor, /^integration_request:/mu);
});

test("BOM/SCR package-wide boundary scan permits test-only IO but proves production code has zero forbidden effects or payload sentinels", () => {
  const allFiles = packageFiles();
  const secretOrPayload = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+\/-]{8,}|\b(?:sk-|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{8,}/imu;
  const forbiddenProductionImports = /node:(?:fs|child_process|net|http|https|tls|dgram)|\bfetch\s*\(|\b(?:spawn|exec|fork)\s*\(|\bprocess\.env\b|\b(?:openai|anthropic)\b/iu;

  for (const relativePath of allFiles) {
    const absolutePath = join(domainRoot, relativePath);
    assert.equal(lstatSync(absolutePath).isSymbolicLink(), false, relativePath);
    const content = readFileSync(absolutePath, "utf8");
    assert.doesNotMatch(content, secretOrPayload, relativePath);
    if (relativePath.endsWith(".mjs") && !relativePath.startsWith("tests/")) {
      const productionContent = relativePath === "tools/bom_supply_chain_risk_runner.mjs"
        ? content.replaceAll("process.stdout.write", "")
        : content;
      assert.doesNotMatch(productionContent, forbiddenProductionImports, relativePath);
      assert.doesNotMatch(productionContent, /\bprocess\b/u, relativePath);
    }
  }
});

test("BOM/SCR public source packet keeps only public-safe source metadata and explicit non-authorities", () => {
  for (const schemaFile of [
    "bom_supply_chain_risk_schema_v0.json",
    "bom_supply_chain_risk_ruleset_schema_v0.json",
    "bom_supply_chain_risk_result_schema_v0.json",
    "bom_supply_chain_risk_assessment_schema_v0.json",
    "bom_supply_chain_risk_receipt_schema_v0.json",
  ]) {
    assert.doesNotThrow(() => JSON.parse(readFileSync(join(domainRoot, "schemas", schemaFile), "utf8")), schemaFile);
  }
  const sourcePacketBytes = readFileSync(join(domainRoot, "contracts", "bom_supply_chain_risk_source_packet_v0.md"));
  const sourcePacket = sourcePacketBytes.toString("utf8");
  assert.equal(
    BOM_SCR_SOURCE_PACKET_REF.content_id,
    `sha256:${createHash("sha256").update(sourcePacketBytes).digest("hex")}`,
  );
  for (const sourceId of ["S1-DODM-4245.15", "S2-DFARS-252.246-7007", "S3-DFARS-252.246-7008", "S4-NIST-MEP-2024", "S5-NIST-SP-800-161R1-UPD1"]) {
    assert.match(sourcePacket, new RegExp(sourceId, "u"));
  }
  assert.match(sourcePacket, /RAG may retrieve a candidate source locator/u);
  assert.match(sourcePacket, /does not own or perform BOM authoring/u);
  assert.doesNotMatch(sourcePacket, /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/u);
});

test("BOM/SCR AJV schemas accept the actual public synthetic snapshot, compiler ruleset, evaluator result, assessment, and receipt", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const candidates = [
    ["schemas/bom_supply_chain_risk_schema_v0.json", buildBomSupplyChainRiskPublicSyntheticObservation()],
    ["schemas/bom_supply_chain_risk_ruleset_schema_v0.json", publicSyntheticAssembly().effective_rule_set],
  ];
  const result = evaluate(
    bomSupplyChainRiskAdapter,
    publicSyntheticAssembly(),
    buildBomSupplyChainRiskPublicSyntheticTypedFacts(),
    {},
    {},
  );
  candidates.push(
    ["schemas/bom_supply_chain_risk_result_schema_v0.json", result.domain_result],
    ["schemas/bom_supply_chain_risk_assessment_schema_v0.json", result.assessment],
    ["schemas/bom_supply_chain_risk_receipt_schema_v0.json", result.receipt],
  );
  for (const [schemaPath, candidate] of candidates) {
    const validate = ajv.compile(loadJson(schemaPath));
    assert.equal(validate(candidate), true, `${schemaPath}: ${ajv.errorsText(validate.errors)}`);
  }

  const snapshotWithExtra = { ...buildBomSupplyChainRiskPublicSyntheticObservation(), extra: true };
  const snapshotValidator = new Ajv2020({ allErrors: true, strict: false }).compile(loadJson("schemas/bom_supply_chain_risk_schema_v0.json"));
  assert.equal(snapshotValidator(snapshotWithExtra), false);

  const rulesetWithExtra = structuredClone(publicSyntheticAssembly().effective_rule_set);
  rulesetWithExtra.profile_threshold_provenance.max_lead_time_days.extra = true;
  const rulesetValidator = new Ajv2020({ allErrors: true, strict: false }).compile(loadJson("schemas/bom_supply_chain_risk_ruleset_schema_v0.json"));
  assert.equal(rulesetValidator(rulesetWithExtra), false);

  const resultWithExtra = structuredClone(result.domain_result);
  resultWithExtra.findings[0].source.extra = true;
  const resultValidator = new Ajv2020({ allErrors: true, strict: false }).compile(loadJson("schemas/bom_supply_chain_risk_result_schema_v0.json"));
  assert.equal(resultValidator(resultWithExtra), false);
});

test("BOM/SCR documentation names exact focused validation surfaces instead of only the runner", () => {
  const readme = readFileSync(join(domainRoot, "README.md"), "utf8");
  const manual = readFileSync(join(domainRoot, "manual", "05_runs_receipts_and_limits.md"), "utf8");
  for (const commandName of [
    "node --test guild_hall/engineering_engine/engines/bom_supply_chain_risk/tests/*.test.mjs",
    "validate:engineering-engine-core-domain",
    "validate:engineering-profile-schemas",
    "validate:engineering-engine-no-duplicate-authority",
  ]) {
    assert.match(`${readme}\n${manual}`, new RegExp(commandName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
});
