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

test("BOM/SCR AJV schemas reject bounded semantic forgeries that runtime also refuses", () => {
  const result = evaluate(
    bomSupplyChainRiskAdapter,
    publicSyntheticAssembly(),
    buildBomSupplyChainRiskPublicSyntheticTypedFacts(),
    {},
    {},
  );
  const snapshotValidator = new Ajv2020({ allErrors: true, strict: false }).compile(loadJson("schemas/bom_supply_chain_risk_schema_v0.json"));
  const rulesetValidator = new Ajv2020({ allErrors: true, strict: false }).compile(loadJson("schemas/bom_supply_chain_risk_ruleset_schema_v0.json"));
  const resultValidator = new Ajv2020({ allErrors: true, strict: false }).compile(loadJson("schemas/bom_supply_chain_risk_result_schema_v0.json"));
  const receiptValidator = new Ajv2020({ allErrors: true, strict: false }).compile(loadJson("schemas/bom_supply_chain_risk_receipt_schema_v0.json"));

  const affirmativeWithoutEvidence = buildBomSupplyChainRiskPublicSyntheticObservation();
  affirmativeWithoutEvidence.applicability_evidence = [];
  assert.equal(snapshotValidator(affirmativeWithoutEvidence), false);

  const evidenceWithoutApplicability = buildBomSupplyChainRiskPublicSyntheticObservation();
  delete evidenceWithoutApplicability.source_applicability;
  assert.equal(snapshotValidator(evidenceWithoutApplicability), false);

  const forgedRuleId = structuredClone(publicSyntheticAssembly().effective_rule_set);
  forgedRuleId.rules[0].rule_id = "BOM-SCR-99";
  assert.equal(rulesetValidator(forgedRuleId), false);

  const forgedRuleSource = structuredClone(publicSyntheticAssembly().effective_rule_set);
  forgedRuleSource.rules[0].source_id = "FORGED-SOURCE";
  assert.equal(rulesetValidator(forgedRuleSource), false);

  const forgedResultRule = structuredClone(result.domain_result);
  forgedResultRule.findings[0].rule_id = "BOM-SCR-99";
  assert.equal(resultValidator(forgedResultRule), false);

  const forgedResultSource = structuredClone(result.domain_result);
  forgedResultSource.findings[0].source.source_id = "FORGED-SOURCE";
  assert.equal(resultValidator(forgedResultSource), false);

  const forgedReason = structuredClone(result.domain_result);
  forgedReason.findings[0].reason_code = "forged_reason";
  assert.equal(resultValidator(forgedReason), false);

  const forgedSourcePacket = structuredClone(result.receipt);
  forgedSourcePacket.bindings.source_packet_ref.entity_id = "forged-source-packet";
  assert.equal(receiptValidator(forgedSourcePacket), false);
});

test("BOM/SCR AJV schemas close gate membership, ordered rules, programs, and output tuples", () => {
  const assembly = publicSyntheticAssembly();
  const result = evaluate(
    bomSupplyChainRiskAdapter,
    assembly,
    buildBomSupplyChainRiskPublicSyntheticTypedFacts(),
    {},
    {},
  );
  const snapshotValidator = new Ajv2020({ allErrors: true, strict: false }).compile(loadJson("schemas/bom_supply_chain_risk_schema_v0.json"));
  const rulesetValidator = new Ajv2020({ allErrors: true, strict: false }).compile(loadJson("schemas/bom_supply_chain_risk_ruleset_schema_v0.json"));
  const resultValidator = new Ajv2020({ allErrors: true, strict: false }).compile(loadJson("schemas/bom_supply_chain_risk_result_schema_v0.json"));
  const receiptValidator = new Ajv2020({ allErrors: true, strict: false }).compile(loadJson("schemas/bom_supply_chain_risk_receipt_schema_v0.json"));

  const oneAffirmativeGate = buildBomSupplyChainRiskPublicSyntheticObservation();
  oneAffirmativeGate.source_applicability["S2-DFARS-252.246-7007"] = {
    status: "unknown",
    clause_incorporation: {
      status: "affirmative",
      basis_ref: oneAffirmativeGate.applicability_evidence[0].basis_ref,
    },
    cost_accounting_standards_applicability: { status: "unknown" },
  };
  oneAffirmativeGate.applicability_evidence = oneAffirmativeGate.applicability_evidence.filter((entry) => entry.source_id !== "S2-DFARS-252.246-7007");
  assert.equal(snapshotValidator(oneAffirmativeGate), false);

  const s3WithoutEvidence = buildBomSupplyChainRiskPublicSyntheticObservation();
  s3WithoutEvidence.applicability_evidence = s3WithoutEvidence.applicability_evidence.filter((entry) => entry.source_id !== "S3-DFARS-252.246-7008");
  assert.equal(snapshotValidator(s3WithoutEvidence), false);

  const duplicateGateSlot = buildBomSupplyChainRiskPublicSyntheticObservation();
  duplicateGateSlot.source_applicability["S3-DFARS-252.246-7008"] = { status: "unknown" };
  duplicateGateSlot.applicability_evidence[2] = { ...duplicateGateSlot.applicability_evidence[0], basis_ref: "basis:duplicate-gate-slot" };
  assert.equal(snapshotValidator(duplicateGateSlot), false);

  const duplicateBasisRef = buildBomSupplyChainRiskPublicSyntheticObservation();
  duplicateBasisRef.source_applicability["S2-DFARS-252.246-7007"] = {
    status: "unknown",
    clause_incorporation: {
      status: "affirmative",
      basis_ref: duplicateBasisRef.applicability_evidence[0].basis_ref,
    },
    cost_accounting_standards_applicability: { status: "unknown" },
  };
  duplicateBasisRef.applicability_evidence[1] = { ...duplicateBasisRef.applicability_evidence[0] };
  assert.equal(snapshotValidator(duplicateBasisRef), false);

  const credentialShaped = ["s", "k", "-", "abcdefghijklmno"].join("");
  const unsafeItem = buildBomSupplyChainRiskPublicSyntheticObservation();
  unsafeItem.bom_items[0].item_id = credentialShaped;
  assert.equal(snapshotValidator(unsafeItem), false);
  const localLikeItem = buildBomSupplyChainRiskPublicSyntheticObservation();
  localLikeItem.bom_items[0].item_id = ["C", ":", "\\", "Users", "\\", "name"].join("");
  assert.equal(snapshotValidator(localLikeItem), false);
  const unsafeScope = structuredClone(result.domain_result);
  unsafeScope.assessment_scope.snapshot_revision = credentialShaped;
  assert.equal(resultValidator(unsafeScope), false);
  const unsafeReceiptScope = structuredClone(result.receipt);
  unsafeReceiptScope.bindings.assessment_scope.snapshot_revision = credentialShaped;
  assert.equal(receiptValidator(unsafeReceiptScope), false);
  for (const marker of ["PASSWORD", "SeCrEt", "ToKeN", "CrEdEnTiAl"]) {
    const unsafeSnapshotItem = buildBomSupplyChainRiskPublicSyntheticObservation();
    unsafeSnapshotItem.bom_items[0].item_id = marker;
    assert.equal(snapshotValidator(unsafeSnapshotItem), false);
    const unsafeResultItem = structuredClone(result.domain_result);
    unsafeResultItem.findings[0].item_id = marker;
    assert.equal(resultValidator(unsafeResultItem), false);
    const unsafeResultScope = structuredClone(result.domain_result);
    unsafeResultScope.assessment_scope.snapshot_revision = `ref:${marker}`;
    assert.equal(resultValidator(unsafeResultScope), false);
    const unsafeProjectBinding = structuredClone(result.receipt);
    unsafeProjectBinding.bindings.project_binding_ref.project_id = `ref:${marker}`;
    assert.equal(receiptValidator(unsafeProjectBinding), false);
  }

  const reorderedRules = structuredClone(assembly.effective_rule_set);
  [reorderedRules.rules[0], reorderedRules.rules[1]] = [reorderedRules.rules[1], reorderedRules.rules[0]];
  assert.equal(rulesetValidator(reorderedRules), false);

  const swappedLocator = structuredClone(assembly.effective_rule_set);
  swappedLocator.rules[4].source_locator = swappedLocator.rules[5].source_locator;
  assert.equal(rulesetValidator(swappedLocator), false);

  const badProgramCount = structuredClone(assembly.effective_rule_set);
  badProgramCount.profile_operation_programs[0].applied_operations_count = 2;
  assert.equal(rulesetValidator(badProgramCount), false);

  const duplicateProgramMetric = structuredClone(assembly.effective_rule_set);
  duplicateProgramMetric.profile_operation_programs[0].operations[1].metric = duplicateProgramMetric.profile_operation_programs[0].operations[0].metric;
  assert.equal(rulesetValidator(duplicateProgramMetric), false);

  const invalidProgramOrder = structuredClone(assembly.effective_rule_set);
  invalidProgramOrder.profile_operation_programs[0].order = 1;
  assert.equal(rulesetValidator(invalidProgramOrder), false);

  const duplicateProgramSlot = structuredClone(assembly.effective_rule_set);
  duplicateProgramSlot.profile_operation_programs.push({ ...duplicateProgramSlot.profile_operation_programs[0] });
  assert.equal(rulesetValidator(duplicateProgramSlot), false);

  const invalidProvenanceIndex = structuredClone(assembly.effective_rule_set);
  invalidProvenanceIndex.profile_threshold_provenance.max_lead_time_days.operation_index = 3;
  assert.equal(rulesetValidator(invalidProvenanceIndex), false);

  const wrongLocator = structuredClone(result.domain_result);
  const alternate = wrongLocator.findings.find((entry) => entry.rule_id === "BOM-SCR-05");
  alternate.source.source_locator = "introductory applicability sentence; (a), (c)(2), (c)(4)-(12)";
  assert.equal(resultValidator(wrongLocator), false);

  const wrongReason = structuredClone(result.domain_result);
  const lifecycle = wrongReason.findings.find((entry) => entry.rule_id === "BOM-SCR-01");
  lifecycle.reason_code = "obsolescence_signal_observed";
  assert.equal(resultValidator(wrongReason), false);
});

test("BOM/SCR AJV schemas bind distinct evidence basis refs and winning provenance operations", () => {
  const snapshotValidator = new Ajv2020({ allErrors: true, strict: false }).compile(loadJson("schemas/bom_supply_chain_risk_schema_v0.json"));
  const rulesetValidator = new Ajv2020({ allErrors: true, strict: false }).compile(loadJson("schemas/bom_supply_chain_risk_ruleset_schema_v0.json"));

  const crossGateDuplicateBasis = buildBomSupplyChainRiskPublicSyntheticObservation();
  crossGateDuplicateBasis.applicability_evidence[1].basis_ref = crossGateDuplicateBasis.applicability_evidence[0].basis_ref;
  assert.equal(snapshotValidator(crossGateDuplicateBasis), false);

  const organizationProfile = buildBomSupplyChainRiskPublicSyntheticProfile();
  const projectProfile = buildBomSupplyChainRiskPublicSyntheticProfile();
  projectProfile.profile_kind = "project";
  projectProfile.profile_id = "public-synthetic-bom-supply-chain-risk-schema-project";
  projectProfile.revision_or_hash = "public-synthetic-bom-supply-chain-risk-schema-project-v0";
  projectProfile.source_refs = ["public-synthetic:bom-supply-chain-risk-schema-project-profile-v0"];
  projectProfile.operations = [{ op: "set_threshold", metric: "max_lead_time_days", value: 45 }];
  projectProfile.order = 1;
  const overrideAssembly = assembleEffectiveRuleSet(
    bomSupplyChainRiskAdapter,
    resolveProfileBindings(organizationProfile, projectProfile),
    {},
  );
  assert.equal(rulesetValidator(overrideAssembly.effective_rule_set), true);

  const wrongWinningIndex = structuredClone(overrideAssembly.effective_rule_set);
  wrongWinningIndex.profile_threshold_provenance.max_lead_time_days.operation_index = 2;
  assert.equal(rulesetValidator(wrongWinningIndex), false);

  const wrongSupplierIndex = structuredClone(overrideAssembly.effective_rule_set);
  wrongSupplierIndex.profile_threshold_provenance.minimum_supplier_count.operation_index = 2;
  assert.equal(rulesetValidator(wrongSupplierIndex), false);
  const wrongGeographyIndex = structuredClone(overrideAssembly.effective_rule_set);
  wrongGeographyIndex.profile_threshold_provenance.minimum_geography_count.operation_index = 0;
  assert.equal(rulesetValidator(wrongGeographyIndex), false);

  const resultValidator = new Ajv2020({ allErrors: true, strict: false }).compile(loadJson("schemas/bom_supply_chain_risk_result_schema_v0.json"));
  const result = evaluate(bomSupplyChainRiskAdapter, publicSyntheticAssembly(), buildBomSupplyChainRiskPublicSyntheticTypedFacts(), {}, {});
  const nonS2Gates = structuredClone(result.domain_result);
  const s2 = nonS2Gates.findings.find((entry) => entry.rule_id === "BOM-SCR-06");
  nonS2Gates.findings.find((entry) => entry.rule_id === "BOM-SCR-01").source.applicability_gates = s2.source.applicability_gates;
  assert.equal(resultValidator(nonS2Gates), false);
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
