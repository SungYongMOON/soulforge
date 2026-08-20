// Public-synthetic characterisation for the bounded P4 persistence runner.
// This fixture reuses the existing one-page public synthetic PDF only.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

import { canonicalise } from "../engineering_engine/kernel/canonical.mjs";
import {
  PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN,
  PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_VERSION,
  PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_VERSION,
} from "../shared/project_knowledge_view.mjs";
import {
  prepareProjectPdfAdmissionLaunchCandidate,
  sealProjectPdfAdmissionLaunch,
} from "./project_pdf_launch_authoring.mjs";
import { buildProjectPdfKnowledgeCandidate } from "./project_pdf_knowledge_projection.mjs";
import {
  runProjectPdfKnowledgePilot,
  runProjectPdfKnowledgePilotCli,
} from "./project_pdf_knowledge_pilot_runner.mjs";

const require = createRequire(import.meta.url);
const commonFs = require("node:fs");
const FIXED_EXTRACTOR_PYTHON = process.platform === "win32"
  ? "guild_hall/state/tools/source_extraction_venv/Scripts/python.exe"
  : "guild_hall/state/tools/source_extraction_venv/bin/python";

const FEATURE_STATE = "off";
const PDF_BYTES = Buffer.from("JVBERi0xLjcKJcK1wrYKJSBXcml0dGVuIGJ5IE11UERGIDEuMjcuMgoKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFIvSW5mbzw8L1Byb2R1Y2VyKE11UERGIDEuMjcuMik+Pj4+CmVuZG9iagoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1s0IDAgUl0+PgplbmRvYmoKCjMgMCBvYmoKPDwvRm9udDw8L2hlbHYgNSAwIFI+Pj4+CmVuZG9iagoKNCAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDMwMCAyMDBdL1JvdGF0ZSAwL1Jlc291cmNlcyAzIDAgUi9QYXJlbnQgMiAwIFIvQ29udGVudHNbNiAwIFJdPj4KZW5kb2JqCgo1IDAgb2JqCjw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYS9FbmNvZGluZy9XaW5BbnNpRW5jb2Rpbmc+PgplbmRvYmoKCjYgMCBvYmoKPDwvTGVuZ3RoIDk5L0ZpbHRlci9GbGF0ZURlY29kZT4+CnN0cmVhbQp42h2KMQrDQAwEe71CP7Ckk/ZcBBeBNOkC6oKrw4cLu0jj9+cwWwwzLP3omaQsY8oFrDZznjTt23GxKmfn7yMKeg00YNBQESYh7g6T6qMoCqKaCez+tWG+rPmmV9KH/oHxFqwKZW5kc3RyZWFtCmVuZG9iagoKeHJlZgowIDcKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDQyIDAwMDAwIG4gCjAwMDAwMDAxMjAgMDAwMDAgbiAKMDAwMDAwMDE3MiAwMDAwMCBuIAowMDAwMDAwMjEzIDAwMDAwIG4gCjAwMDAwMDAzMjAgMDAwMDAgbiAKMDAwMDAwMDQwOSAwMDAwMCBuIAoKdHJhaWxlcgo8PC9TaXplIDcvUm9vdCAxIDAgUi9JRFs8MTdDM0FDQzI5MDY4QzI5MjU2QzM4NzdFMTRDMzhGQzM+PDhEOENBRUNDNzNGREU3MkRGNDc5NzBGQzM0NUQ3ODNFPl0+PgpzdGFydHhyZWYKNTc2CiUlRU9GCg==", "base64");
const PDF_SHA256 = "dabb2b0ac21c6506a621f3bfe6d0685e7e3eda2886f205c4ef066c7f656326a3";
assert.equal(
  createHash("sha256").update(PDF_BYTES).digest("hex"),
  PDF_SHA256,
  "public PDF fixture pin must remain stable",
);
const EXTRACTED_TEXT = "Soulforge PDF tracer bullet\n";
const EXTRACTED_TEXT_SHA256 = "3dceeabc3c008cd7e7700aa1414a0b522cdd091d8f5618b625e0bbbfe7347b86";
const BODY_MARKER = "Soulforge PDF tracer bullet";

const RUN_AUTHORITY_SCHEMA_VERSION = "soulforge.project_pdf_knowledge_pilot_run_authority.v0";
const RUN_AUTHORITY_HASH_DOMAIN = "soulforge.project_pdf_knowledge_pilot.run_authority.v0";
const PACKET_SCHEMA_VERSION = "soulforge.project_pdf_knowledge_pilot_authority_packet.v0";
const OUTPUT_ROOT_HASH_DOMAIN = "soulforge.project_pdf_knowledge_pilot.output_root.v0";
const PORTABLE_MATERIAL_HASH_DOMAIN = "soulforge.project_pdf_admission.portable_material.v0";
const RELATIVE_LOCATOR_HASH_DOMAIN = "soulforge.project_pdf_admission.relative_locator.v0";
const SOURCE_BINDING_HASH_DOMAIN = "soulforge.project_pdf_source_revision_binding.v0";
const SOURCE_RECEIPT_HASH_DOMAIN = "soulforge.project_pdf_source_revision_receipt.v0";
const EXTERNAL_SEAL_HASH_DOMAIN = "soulforge.project_pdf_launch_authoring.external_owner_seal.v0";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function identity(seed) {
  const token = String(seed).padStart(12, "0");
  return {
    entity_id: "00000000-0000-4000-8000-" + token,
    revision_id: "10000000-0000-4000-8000-" + token,
  };
}

function exactRef(seed, contentHex = String(seed).padStart(64, "0")) {
  return {
    ...identity(seed),
    content_id: "sha256:" + contentHex,
    content_hash_alg: "sha256",
  };
}

function insertionOrderRules(value) {
  const rules = {};
  const visit = (node, path = "") => {
    if (Array.isArray(node)) {
      rules[path] = "insertion_ordered";
      node.forEach((child) => visit(child, path + "[]"));
    } else if (node !== null && typeof node === "object") {
      Object.entries(node).forEach(([key, child]) => visit(
        child,
        path ? path + "." + key : key,
      ));
    }
  };
  visit(value);
  return rules;
}

function canonicalText(value) {
  return canonicalise(value, insertionOrderRules(value));
}

function canonicalBytes(value) {
  return Buffer.from(canonicalText(value) + "\n", "utf8");
}

function canonicalFingerprint(domain, material) {
  return "sha256:" + sha256(domain + "\0" + canonicalText(material));
}

function externalOwnerSeal(prepared, seed = 41) {
  const material = {
    schema_version: "soulforge.project_pdf_launch_external_owner_seal.v0",
    claim_ceiling: "correlation_only",
    challenge_sha256: prepared.challenge.challenge_sha256,
    launch_sha256: prepared.challenge.launch_sha256,
  };
  return {
    ...material,
    seal_ref: {
      ...identity(seed),
      content_id: canonicalFingerprint(EXTERNAL_SEAL_HASH_DOMAIN, material),
      content_hash_alg: "sha256",
    },
  };
}

function sourceReceiptDigest(launch) {
  const grant = launch.document_read_grant;
  const portableMaterialFingerprint = canonicalFingerprint(PORTABLE_MATERIAL_HASH_DOMAIN, {
    project_binding_ref: grant.project_binding_ref,
    knowledge_scope_fingerprint_sha256: grant.knowledge_scope_fingerprint_sha256,
    read_policy_ref: grant.read_policy_ref,
    relative_locator: grant.relative_locator,
    document_revision_ref: grant.document_revision_ref,
    media_type: grant.media_type,
  });
  const relativeLocatorFingerprint = canonicalFingerprint(RELATIVE_LOCATOR_HASH_DOMAIN, {
    project_binding_ref: grant.project_binding_ref,
    relative_locator: grant.relative_locator,
    document_revision_ref: grant.document_revision_ref,
  });
  const bindingMaterial = {
    feature_state: FEATURE_STATE,
    project_binding_ref: grant.project_binding_ref,
    document_revision_ref: grant.document_revision_ref,
    document_read_grant_ref: grant.grant_ref,
    knowledge_scope_fingerprint_sha256: grant.knowledge_scope_fingerprint_sha256,
    local_admission_fingerprint_sha256: grant.local_admission_fingerprint_sha256,
    portable_material_fingerprint_sha256: portableMaterialFingerprint,
    relative_locator_fingerprint_sha256: relativeLocatorFingerprint,
    source_content_sha256: grant.document_revision_ref.content_id,
    extraction_text_sha256: "sha256:" + EXTRACTED_TEXT_SHA256,
    page_count: 1,
    character_count: EXTRACTED_TEXT.length,
  };
  const sourceRevisionBinding = canonicalFingerprint(SOURCE_BINDING_HASH_DOMAIN, bindingMaterial);
  return canonicalFingerprint(SOURCE_RECEIPT_HASH_DOMAIN, {
    schema_version: "soulforge.project_pdf_source_revision_receipt.v0",
    kind: "project_pdf_source_revision_receipt",
    status: "candidate",
    feature_state: FEATURE_STATE,
    ...bindingMaterial,
    source_revision_binding_sha256: sourceRevisionBinding,
    supersession_status: "not_evaluated",
    project_count: 1,
  });
}

function runAuthority({
  expiresAtUtc = "2099-01-01T00:00:00.000Z",
  consumptionState = "unconsumed",
  attemptLimit = 1,
  seed = 51,
} = {}) {
  const material = {
    schema_version: RUN_AUTHORITY_SCHEMA_VERSION,
    kind: "project_pdf_knowledge_pilot_run_authority",
    feature_state: FEATURE_STATE,
    purpose: "one_admitted_pdf_knowledge_candidate_persist",
    expires_at_utc: expiresAtUtc,
    attempt_limit: attemptLimit,
    consumption_state: consumptionState,
    retry_allowed: false,
  };
  return { material, seed };
}

function authorityBindingMaterial(packet) {
  const authority = packet.run_authority;
  return {
    schema_version: packet.schema_version,
    kind: packet.kind,
    feature_state: packet.feature_state,
    run_authority: {
      schema_version: authority.schema_version,
      kind: authority.kind,
      feature_state: authority.feature_state,
      purpose: authority.purpose,
      expires_at_utc: authority.expires_at_utc,
      attempt_limit: authority.attempt_limit,
      consumption_state: authority.consumption_state,
      retry_allowed: authority.retry_allowed,
      authority_ref_identity: {
        entity_id: authority.authority_ref.entity_id,
        revision_id: authority.authority_ref.revision_id,
        content_hash_alg: authority.authority_ref.content_hash_alg,
      },
    },
    launch: structuredClone(packet.launch),
    source_binding: structuredClone(packet.source_binding),
    output: structuredClone(packet.output),
  };
}

function bindRunAuthority(packet, seed = 51) {
  packet.run_authority.authority_ref = {
    ...identity(seed),
    content_id: "sha256:" + "0".repeat(64),
    content_hash_alg: "sha256",
  };
  const digest = canonicalFingerprint(RUN_AUTHORITY_HASH_DOMAIN, authorityBindingMaterial(packet));
  packet.run_authority.authority_ref.content_id = digest;
  packet.run_authority.authority_digest_sha256 = digest;
  return packet;
}

function makePacket(state, overrides = {}) {
  const outputRoot = overrides.outputRoot ?? state.outputRoot;
  const launch = state.launch;
  const authority = overrides.runAuthority ?? runAuthority();
  const packet = {
    schema_version: PACKET_SCHEMA_VERSION,
    kind: "project_pdf_knowledge_pilot_authority_packet",
    feature_state: FEATURE_STATE,
    run_authority: {
      ...authority.material,
      authority_ref: exactRef(91),
      authority_digest_sha256: "sha256:" + "0".repeat(64),
    },
    launch: {
      absolute_path: state.launchPath,
      sha256: state.launchSha256,
      byte_count: state.launchBytes.byteLength,
    },
    source_binding: {
      project_binding_ref: structuredClone(launch.document_read_grant.project_binding_ref),
      document_revision_ref: structuredClone(launch.document_read_grant.document_revision_ref),
      trusted_source_revision_receipt_sha256: sourceReceiptDigest(launch),
    },
    output: {
      absolute_root_path: resolve(outputRoot),
      root_commitment_sha256: canonicalFingerprint(OUTPUT_ROOT_HASH_DOMAIN, {
        absolute_root_path: resolve(outputRoot),
      }),
      candidate_filename: "project_pdf_knowledge_candidate.json",
      receipt_filename: "project_pdf_knowledge_persistence_receipt.json",
    },
  };
  bindRunAuthority(packet, authority.seed);
  return { ...packet, ...overrides.packet };
}

function writePacket(state, packet) {
  const bytes = canonicalBytes(packet);
  writeFileSync(state.packetPath, bytes);
  return {
    authorityPacketPath: state.packetPath,
    expectedAuthorityPacketSha256: sha256(bytes),
  };
}

function fixture() {
  const tempRoot = mkdtempSync(join(tmpdir(), "soulforge-p4-pilot-runner-"));
  const containmentRoot = join(tempRoot, "workspace");
  const projectRoot = join(containmentRoot, "project");
  const commonRoot = join(containmentRoot, "common");
  const documentPath = join(projectRoot, "documents", "tracer.pdf");
  const launchPath = join(tempRoot, "launch.json");
  const packetPath = join(tempRoot, "authority.json");
  const outputRoot = join(tempRoot, "approved-output");
  mkdirSync(join(projectRoot, "documents"), { recursive: true });
  mkdirSync(commonRoot, { recursive: true });
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(documentPath, PDF_BYTES);

  const input = {
    project_binding_ref: exactRef(1),
    knowledge_view_policy_ref: exactRef(3),
    document_read_policy_ref: exactRef(12),
    knowledge_view_authority_grant_identity: identity(2),
    document_read_grant_identity: identity(11),
    document_revision_identity: identity(13),
    project_root_path: projectRoot,
    common_root_path: commonRoot,
    containment_root_path: containmentRoot,
    selected_common_revision_refs: [],
    approved_common_revision_refs: [],
    relative_locator: "documents/tracer.pdf",
    document_sha256: PDF_SHA256,
  };
  const prepared = prepareProjectPdfAdmissionLaunchCandidate(input);
  const sealed = sealProjectPdfAdmissionLaunch(prepared, externalOwnerSeal(prepared));
  writeFileSync(launchPath, sealed.launchBytes);

  const state = {
    tempRoot,
    documentPath,
    launchPath,
    launch: prepared.launch_material,
    launchBytes: Buffer.from(sealed.launchBytes),
    launchSha256: sealed.launchSha256,
    packetPath,
    outputRoot,
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
  state.packet = makePacket(state);
  state.request = writePacket(state, state.packet);
  return state;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function syntheticAdmittedCandidate(state) {
  const grant = state.launch.document_read_grant;
  const portableMaterialFingerprint = canonicalFingerprint(PORTABLE_MATERIAL_HASH_DOMAIN, {
    project_binding_ref: grant.project_binding_ref,
    knowledge_scope_fingerprint_sha256: grant.knowledge_scope_fingerprint_sha256,
    read_policy_ref: grant.read_policy_ref,
    relative_locator: grant.relative_locator,
    document_revision_ref: grant.document_revision_ref,
    media_type: grant.media_type,
  });
  const relativeLocatorFingerprint = canonicalFingerprint(RELATIVE_LOCATOR_HASH_DOMAIN, {
    project_binding_ref: grant.project_binding_ref,
    relative_locator: grant.relative_locator,
    document_revision_ref: grant.document_revision_ref,
  });
  return deepFreeze({
    schema_version: "soulforge.admitted_project_pdf_candidate.v0",
    kind: "admitted_project_pdf_candidate",
    status: "candidate",
    feature_state: FEATURE_STATE,
    route: "validation_only",
    admission: {
      project_binding_ref: structuredClone(grant.project_binding_ref),
      document_revision_ref: structuredClone(grant.document_revision_ref),
      document_read_grant_ref: structuredClone(grant.grant_ref),
      knowledge_scope_fingerprint_sha256: grant.knowledge_scope_fingerprint_sha256,
      local_admission_fingerprint_sha256: grant.local_admission_fingerprint_sha256,
      portable_material_fingerprint_sha256: portableMaterialFingerprint,
      relative_locator_fingerprint_sha256: relativeLocatorFingerprint,
      knowledge_view_project_read_allowed: false,
      document_read_grant_binding_verified: true,
    },
    ingest_candidate: {
      schema_version: "soulforge.project_document_ingest_candidate.v0",
      status: "candidate",
      source: {
        media_type: "application/pdf",
        sha256: PDF_SHA256,
        byte_count: PDF_BYTES.byteLength,
      },
      extraction: {
        engine: "pymupdf",
        page_count: 1,
        character_count: EXTRACTED_TEXT.length,
        text_sha256: EXTRACTED_TEXT_SHA256,
        pages: [{ page_number: 1, text: EXTRACTED_TEXT }],
      },
      authority: {
        source_truth: false,
        canon: false,
        project_state: false,
        approval: false,
      },
      effects: {
        persistent_writes: 0,
        network_calls: 0,
        model_calls: 0,
        rag_index_writes: 0,
        wiki_writes: 0,
      },
    },
    authority: {
      source_truth: false,
      canon: false,
      project_state: false,
      approval: false,
      engine_input_allowed: false,
      activation_allowed: false,
      wiki_write_allowed: false,
      rag_write_allowed: false,
      erp_write_allowed: false,
      taskdriver_allowed: false,
    },
    effects: {
      persistent_writes: 0,
      network_calls: 0,
      model_calls: 0,
      rag_index_writes: 0,
      wiki_writes: 0,
      engine_calls: 0,
    },
  });
}

function syntheticOperations(state, counts) {
  const admitted = syntheticAdmittedCandidate(state);
  return {
    inspectLaunch() {
      counts.inspections += 1;
      return deepFreeze({
        schema_version: "soulforge.project_pdf_admission_launch_inspection.v0",
        kind: "project_pdf_admission_launch_inspection",
        status: "inspected",
        feature_state: FEATURE_STATE,
        launch_sha256: state.launchSha256,
        launch_byte_count: state.launchBytes.byteLength,
        project_binding_ref: structuredClone(state.launch.document_read_grant.project_binding_ref),
        document_revision_ref: structuredClone(state.launch.document_read_grant.document_revision_ref),
        document_read_grant_ref: structuredClone(state.launch.document_read_grant.grant_ref),
      });
    },
    async admit() {
      counts.admissions += 1;
      return admitted;
    },
    project(request) {
      return buildProjectPdfKnowledgeCandidate(request);
    },
  };
}

async function loadRunnerTestHarness() {
  const runnerUrl = new URL("./project_pdf_knowledge_pilot_runner.mjs", import.meta.url);
  const source = readFileSync(runnerUrl, "utf8")
    + "\nexport { runProjectPdfKnowledgePilotWithOperations as __testRun, "
    + "runProjectPdfKnowledgePilotCliWithRunner as __testCli };\n";
  const runner = new vm.SourceTextModule(source, { identifier: runnerUrl.href });
  await runner.link(async (specifier, referencingModule) => {
    const resolved = specifier.startsWith(".")
      ? new URL(specifier, referencingModule.identifier).href
      : specifier;
    const namespace = await import(resolved);
    const names = Object.keys(namespace);
    return new vm.SyntheticModule(names, function setExports() {
      for (const name of names) this.setExport(name, namespace[name]);
    }, { identifier: "bridge:" + resolved });
  });
  await runner.evaluate();
  return {
    run: runner.namespace.__testRun,
    cli: runner.namespace.__testCli,
  };
}

function assertNoRawBody(value) {
  const text = JSON.stringify(value);
  assert.equal(text.includes(BODY_MARKER), false);
  assert.equal(/"text"\s*:/u.test(text), false);
  assert.equal(/"(?:raw_)?query"\s*:/u.test(text), false);
  assert.equal(/"(?:absolute_)?path"\s*:/u.test(text), false);
  assert.equal(/"relative_locator"\s*:/u.test(text), false);
}

function assertClosedCommandReceipt(receipt) {
  assert.equal(receipt !== null && typeof receipt === "object", true);
  assert.equal(receipt.feature_state, FEATURE_STATE);
  assertNoRawBody(receipt);
  assert.equal(Object.hasOwn(receipt, "error"), false);
  assert.equal(Object.hasOwn(receipt, "message"), false);
  assert.equal(Object.hasOwn(receipt, "cause"), false);
}

function assertPreAdmissionHold(receipt, code) {
  assert.equal(receipt.result, "HOLD");
  assert.equal(receipt.blocker_code, code);
  assert.equal(receipt.effects.admission_attempts, 0);
  assert.equal(receipt.effects.output_file_creations, 0);
  assertClosedCommandReceipt(receipt);
}

function writableSink() {
  const chunks = [];
  return {
    sink: { write(chunk) { chunks.push(chunk); } },
    text: () => chunks.join(""),
  };
}

test("persists exactly one body-free candidate and one metadata-only receipt in the runner core", async () => {
  const state = fixture();
  try {
    const counts = { inspections: 0, admissions: 0 };
    const harness = await loadRunnerTestHarness();
    const result = await harness.run(
      state.request,
      syntheticOperations(state, counts),
    );

    assert.equal(result.result, "PASS", JSON.stringify(result));
    assert.deepEqual(counts, { inspections: 1, admissions: 1 });
    assert.equal(result.effects.admission_attempts, 1);
    assert.equal(result.effects.projection_builds, 1);
    assert.equal(result.effects.output_file_creations, 2);
    assert.equal(result.effects.output_file_readbacks, 2);
    assertClosedCommandReceipt(result);

    assert.deepEqual(readdirSync(state.outputRoot).sort(), [
      state.packet.output.candidate_filename,
      state.packet.output.receipt_filename,
    ].sort());
    const candidate = JSON.parse(readFileSync(
      join(state.outputRoot, state.packet.output.candidate_filename), "utf8",
    ));
    const receipt = JSON.parse(readFileSync(
      join(state.outputRoot, state.packet.output.receipt_filename), "utf8",
    ));
    assert.equal(candidate.candidate_sha256, result.candidate.logical_candidate_sha256);
    assert.equal(receipt.candidate.logical_candidate_sha256, candidate.candidate_sha256);
    assert.equal(receipt.candidate.file_sha256, result.candidate.file_sha256);
    assert.equal(receipt.candidate.file_byte_count, result.candidate.file_byte_count);
    assertNoRawBody(candidate);
    assertNoRawBody(receipt);
    assert.equal(candidate.rag_candidate.body_included, false);
    assert.equal(candidate.thin_wiki_candidate.body_included, false);

    const replay = await runProjectPdfKnowledgePilot(state.request);
    assertPreAdmissionHold(replay, "PROJECT_PDF_KNOWLEDGE_PILOT_OUTPUT_EXISTS");
  } finally {
    state.cleanup();
  }
});

test("runs the production runner through the fixed public synthetic extractor", {
  skip: !existsSync(FIXED_EXTRACTOR_PYTHON)
    ? "fixed public-synthetic PyMuPDF runtime is unavailable in this worktree"
    : false,
}, async () => {
  const state = fixture();
  try {
    const result = await runProjectPdfKnowledgePilot(state.request);
    assert.equal(result.result, "PASS", JSON.stringify(result));
    assert.equal(result.effects.admission_attempts, 1);
    assert.equal(result.effects.projection_builds, 1);
    assert.equal(result.effects.output_file_creations, 2);
    assert.equal(result.effects.output_file_readbacks, 2);
    assertClosedCommandReceipt(result);
  } finally {
    state.cleanup();
  }
});

test("refuses authority and output mutations before admission or any output write", async () => {
  const rows = [
    {
      code: "PROJECT_PDF_KNOWLEDGE_PILOT_RUN_AUTHORITY_EXPIRED",
      change: (state) => makePacket(state, {
        runAuthority: runAuthority({ expiresAtUtc: "2000-01-01T00:00:00.000Z" }),
      }),
    },
    {
      code: "PROJECT_PDF_KNOWLEDGE_PILOT_RUN_AUTHORITY_CONSUMED",
      change: (state) => makePacket(state, {
        runAuthority: runAuthority({ consumptionState: "consumed" }),
      }),
    },
    {
      code: "PROJECT_PDF_KNOWLEDGE_PILOT_RUN_AUTHORITY_REFUSED",
      change: (state) => makePacket(state, {
        runAuthority: runAuthority({ attemptLimit: 2 }),
      }),
    },
    {
      code: "PROJECT_PDF_KNOWLEDGE_PILOT_RUN_AUTHORITY_BINDING_REFUSED",
      change: (state) => {
        const packet = makePacket(state);
        packet.run_authority.authority_digest_sha256 = "sha256:" + "f".repeat(64);
        return packet;
      },
    },
    {
      code: "PROJECT_PDF_KNOWLEDGE_PILOT_AUTHORITY_PACKET_REFUSED",
      change: (state) => ({ ...makePacket(state), unexpected_field: true }),
    },
    {
      code: "PROJECT_PDF_KNOWLEDGE_PILOT_LAUNCH_BINDING_REFUSED",
      change: (state) => {
        const packet = makePacket(state);
        packet.source_binding.document_revision_ref = exactRef(77);
        bindRunAuthority(packet);
        return packet;
      },
    },
    {
      code: "PROJECT_PDF_KNOWLEDGE_PILOT_LAUNCH_PIN_REFUSED",
      change: (state) => {
        const packet = makePacket(state);
        packet.launch.byte_count += 1;
        bindRunAuthority(packet);
        return packet;
      },
    },
    {
      code: "PROJECT_PDF_KNOWLEDGE_PILOT_OUTPUT_REFUSED",
      change: (state) => {
        const packet = makePacket(state);
        packet.output.candidate_filename = "../escaped.json";
        return packet;
      },
    },
  ];

  for (const row of rows) {
    const state = fixture();
    try {
      rmSync(state.documentPath, { force: true });
      const request = writePacket(state, row.change(state));
      const result = await runProjectPdfKnowledgePilot(request);
      assertPreAdmissionHold(result, row.code);
      assert.deepEqual(readdirSync(state.outputRoot), []);
    } finally {
      state.cleanup();
    }
  }
});

test("requires the raw-byte authority-packet pin before decode or admission", async () => {
  const state = fixture();
  try {
    rmSync(state.documentPath, { force: true });
    const result = await runProjectPdfKnowledgePilot({
      authorityPacketPath: state.request.authorityPacketPath,
      expectedAuthorityPacketSha256: "0".repeat(64),
    });
    assertPreAdmissionHold(result, "PROJECT_PDF_KNOWLEDGE_PILOT_AUTHORITY_PACKET_PIN_REFUSED");
    assert.deepEqual(readdirSync(state.outputRoot), []);
  } finally {
    state.cleanup();
  }
});

test("refuses proxied or accessor command inputs before a read, admission, or output write", async () => {
  const state = fixture();
  try {
    let requestTraps = 0;
    const proxiedRequest = new Proxy(state.request, {
      get() { requestTraps += 1; return undefined; },
      ownKeys() { requestTraps += 1; return []; },
      getOwnPropertyDescriptor() { requestTraps += 1; return undefined; },
    });
    const direct = await runProjectPdfKnowledgePilot(proxiedRequest);
    assertPreAdmissionHold(direct, "PROJECT_PDF_KNOWLEDGE_PILOT_REQUEST_INVALID");
    assert.equal(requestTraps, 0);

    let getterCalls = 0;
    const accessorRequest = {};
    Object.defineProperty(accessorRequest, "authorityPacketPath", {
      enumerable: true,
      get() { getterCalls += 1; return state.packetPath; },
    });
    Object.defineProperty(accessorRequest, "expectedAuthorityPacketSha256", {
      enumerable: true,
      value: state.request.expectedAuthorityPacketSha256,
    });
    const accessor = await runProjectPdfKnowledgePilot(accessorRequest);
    assertPreAdmissionHold(accessor, "PROJECT_PDF_KNOWLEDGE_PILOT_REQUEST_INVALID");
    assert.equal(getterCalls, 0);

    let argvTraps = 0;
    const argvProxy = new Proxy([
      "--authority-packet", state.request.authorityPacketPath,
      "--authority-packet-sha256", state.request.expectedAuthorityPacketSha256,
    ], {
      get() { argvTraps += 1; return undefined; },
      ownKeys() { argvTraps += 1; return []; },
      getOwnPropertyDescriptor() { argvTraps += 1; return undefined; },
    });
    const stdout = writableSink();
    const stderr = writableSink();
    const command = await runProjectPdfKnowledgePilotCli(
      argvProxy,
      { stdout: stdout.sink, stderr: stderr.sink },
    );
    assertPreAdmissionHold(command, "PROJECT_PDF_KNOWLEDGE_PILOT_ARGUMENTS_INVALID");
    assert.equal(argvTraps, 0);
    assert.equal(stdout.text(), "");
    assert.equal(stderr.text(), JSON.stringify(command) + "\n");
    assert.deepEqual(readdirSync(state.outputRoot), []);
  } finally {
    state.cleanup();
  }
});

test("binds one authority ref to the exact launch, source, and output material", async () => {
  const rows = [
    {
      mutate: (state, packet) => { packet.launch.byte_count += 1; },
    },
    {
      mutate: (state, packet) => { packet.source_binding.document_revision_ref = exactRef(88); },
    },
    {
      mutate: (state, packet) => {
        packet.source_binding.trusted_source_revision_receipt_sha256 = "sha256:" + "d".repeat(64);
      },
    },
    {
      mutate: (state, packet) => {
        const alternateRoot = join(state.tempRoot, "alternate-approved-output");
        mkdirSync(alternateRoot);
        packet.output.absolute_root_path = resolve(alternateRoot);
        packet.output.root_commitment_sha256 = canonicalFingerprint(OUTPUT_ROOT_HASH_DOMAIN, {
          absolute_root_path: resolve(alternateRoot),
        });
      },
    },
  ];
  for (const row of rows) {
    const state = fixture();
    try {
      rmSync(state.documentPath, { force: true });
      const packet = makePacket(state);
      const originalAuthorityRef = structuredClone(packet.run_authority.authority_ref);
      const originalAuthorityDigest = packet.run_authority.authority_digest_sha256;
      row.mutate(state, packet);
      assert.deepEqual(packet.run_authority.authority_ref, originalAuthorityRef);
      assert.equal(packet.run_authority.authority_digest_sha256, originalAuthorityDigest);
      const result = await runProjectPdfKnowledgePilot(writePacket(state, packet));
      assertPreAdmissionHold(result, "PROJECT_PDF_KNOWLEDGE_PILOT_RUN_AUTHORITY_BINDING_REFUSED");
      assert.deepEqual(readdirSync(state.outputRoot), []);
    } finally {
      state.cleanup();
    }
  }
});

test("does not allow an authority ref identity to be relabeled under the same digest", async () => {
  const state = fixture();
  try {
    rmSync(state.documentPath, { force: true });
    const packet = makePacket(state);
    packet.run_authority.authority_ref.entity_id = identity(97).entity_id;
    const result = await runProjectPdfKnowledgePilot(writePacket(state, packet));
    assertPreAdmissionHold(result, "PROJECT_PDF_KNOWLEDGE_PILOT_RUN_AUTHORITY_BINDING_REFUSED");
    assert.deepEqual(readdirSync(state.outputRoot), []);
  } finally {
    state.cleanup();
  }
});

test("requires the independently supplied source-receipt digest before publication", async () => {
  const state = fixture();
  try {
    const packet = makePacket(state);
    packet.source_binding.trusted_source_revision_receipt_sha256 = "sha256:" + "e".repeat(64);
    bindRunAuthority(packet);
    const counts = { inspections: 0, admissions: 0 };
    const harness = await loadRunnerTestHarness();
    const result = await harness.run(
      writePacket(state, packet),
      syntheticOperations(state, counts),
    );
    assert.equal(result.result, "HOLD");
    assert.equal(result.blocker_code, "PROJECT_PDF_KNOWLEDGE_PILOT_PROJECTION_REFUSED");
    assert.equal(result.effects.admission_attempts, 1);
    assert.equal(result.effects.projection_builds, 1);
    assert.equal(result.effects.output_file_creations, 0);
    assert.deepEqual(counts, { inspections: 1, admissions: 1 });
    assert.deepEqual(readdirSync(state.outputRoot), []);
    assertClosedCommandReceipt(result);
  } finally {
    state.cleanup();
  }
});

test("keeps partial create-only publication at HOLD without retry, cleanup, or a terminal PASS", async () => {
  const state = fixture();
  const originalFsync = commonFs.fsyncSync;
  let fsyncCalls = 0;
  try {
    commonFs.fsyncSync = (...args) => {
      fsyncCalls += 1;
      if (fsyncCalls === 1) throw new Error("synthetic fsync failure");
      return originalFsync(...args);
    };
    syncBuiltinESMExports();
    const counts = { inspections: 0, admissions: 0 };
    const harness = await loadRunnerTestHarness();
    const result = await harness.run(
      state.request,
      syntheticOperations(state, counts),
    );
    assert.equal(result.result, "HOLD");
    assert.equal(result.blocker_code, "PROJECT_PDF_KNOWLEDGE_PILOT_CANDIDATE_WRITE_REFUSED");
    assert.equal(result.effects.output_file_creations, 1);
    assert.equal(result.effects.output_file_readbacks, 0);
    assert.deepEqual(counts, { inspections: 1, admissions: 1 });
    assert.deepEqual(readdirSync(state.outputRoot), [state.packet.output.candidate_filename]);
    assertClosedCommandReceipt(result);
  } finally {
    commonFs.fsyncSync = originalFsync;
    syncBuiltinESMExports();
    state.cleanup();
  }
});

test("does not let a retained receipt-write partial claim terminal publication", async () => {
  const state = fixture();
  const originalFsync = commonFs.fsyncSync;
  let fsyncCalls = 0;
  try {
    commonFs.fsyncSync = (...args) => {
      fsyncCalls += 1;
      if (fsyncCalls === 2) throw new Error("synthetic receipt fsync failure");
      return originalFsync(...args);
    };
    syncBuiltinESMExports();
    const counts = { inspections: 0, admissions: 0 };
    const harness = await loadRunnerTestHarness();
    const result = await harness.run(
      state.request,
      syntheticOperations(state, counts),
    );
    assert.equal(result.result, "HOLD");
    assert.equal(result.blocker_code, "PROJECT_PDF_KNOWLEDGE_PILOT_RECEIPT_WRITE_REFUSED");
    assert.equal(result.effects.output_file_creations, 2);
    assert.equal(result.effects.output_file_readbacks, 1);
    assert.deepEqual(counts, { inspections: 1, admissions: 1 });
    assert.deepEqual(readdirSync(state.outputRoot).sort(), [
      state.packet.output.candidate_filename,
      state.packet.output.receipt_filename,
    ].sort());
    const retainedReceipt = JSON.parse(readFileSync(
      join(state.outputRoot, state.packet.output.receipt_filename),
      "utf8",
    ));
    assert.equal(retainedReceipt.status, "candidate_persisted_receipt_unverified");
    assert.equal(retainedReceipt.receipt_file_self_verification, "not_claimed");
    assert.equal(retainedReceipt.effects.filesystem_file_creations, 1);
    assertClosedCommandReceipt(result);
  } finally {
    commonFs.fsyncSync = originalFsync;
    syncBuiltinESMExports();
    state.cleanup();
  }
});

test("keeps the production runner on one admission, one projection, and no retrieval or provider surface", () => {
  const source = readFileSync(
    new URL("./project_pdf_knowledge_pilot_runner.mjs", import.meta.url),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/^[ \t]*\/\/.*$/gmu, " ");
  const count = (pattern) => (source.match(pattern) ?? []).length;

  assert.equal(count(/operations\.admit\(/gu), 1);
  assert.equal(count(/operations\.project\(/gu), 1);
  assert.equal(
    source.includes("admit: extractAdmittedProjectPdfCandidate"),
    true,
  );
  assert.equal(
    source.includes("project: buildProjectPdfKnowledgeCandidate"),
    true,
  );
  assert.equal(source.includes("__testOnly"), false);
  for (const forbidden of [
    "retrieveProjectPdfKnowledgeCandidate",
    "node:child_process",
    "node:net",
    "node:http",
    "fetch(",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden + " must stay absent");
  }
});

test("the CLI accepts one closed packet pin and emits one payload-free receipt on stderr", async () => {
  const state = fixture();
  try {
    const counts = { inspections: 0, admissions: 0 };
    const harness = await loadRunnerTestHarness();
    const operations = syntheticOperations(state, counts);
    const stdout = writableSink();
    const stderr = writableSink();
    const result = await harness.cli([
      "--authority-packet", state.request.authorityPacketPath,
      "--authority-packet-sha256", state.request.expectedAuthorityPacketSha256,
    ], { stdout: stdout.sink, stderr: stderr.sink }, (request) => harness.run(request, operations));
    assert.equal(result.result, "PASS", JSON.stringify(result));
    assert.deepEqual(counts, { inspections: 1, admissions: 1 });
    assert.equal(stdout.text(), "");
    assert.equal(stderr.text(), JSON.stringify(result) + "\n");
    assertClosedCommandReceipt(result);

    const refusedStdout = writableSink();
    const refusedStderr = writableSink();
    const refused = await harness.cli([
      "--authority-packet", state.request.authorityPacketPath,
      "--authority-packet-sha256", state.request.expectedAuthorityPacketSha256,
      "--retry", "1",
    ], { stdout: refusedStdout.sink, stderr: refusedStderr.sink }, (request) => harness.run(request, operations));
    assertPreAdmissionHold(refused, "PROJECT_PDF_KNOWLEDGE_PILOT_ARGUMENTS_INVALID");
    assert.equal(refusedStdout.text(), "");
    assert.equal(refusedStderr.text(), JSON.stringify(refused) + "\n");
  } finally {
    state.cleanup();
  }
});
