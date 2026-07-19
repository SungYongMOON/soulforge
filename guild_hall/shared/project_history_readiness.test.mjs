import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { computeMetadataDigest, deriveOccurrenceId } from "./project_history_envelope.mjs";
import {
  PROJECT_HISTORY_READINESS_PROFILES,
  ProjectHistoryReadinessError,
  buildSyntheticFiveLaneShadowFixture,
  buildSyntheticH06CoverageFixture,
  replayProjectHistoryShadow,
  validateSyntheticH06CoverageFixture,
  validateTaskEnginePublicGateMap,
} from "./project_history_readiness.mjs";

const GATE_MAP_URL = new URL(
  "../../docs/architecture/workspace/examples/task_engine_history_foundation/task_engine_public_gate_map_v1.json",
  import.meta.url,
);

function clone(value) {
  return structuredClone(value);
}

function assertCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ProjectHistoryReadinessError);
    assert.equal(error.code, code);
    return true;
  });
}

test("public gate map connects bounded evidence without opening P0 or activation", async () => {
  const gateMap = JSON.parse(await readFile(GATE_MAP_URL, "utf8"));
  assert.equal(validateTaskEnginePublicGateMap(gateMap), gateMap);
  assert.equal(gateMap.activation_allowed, false);
  assert.equal(gateMap.private_locator_copied, false);
  assert.equal(gateMap.entries.find((entry) => entry.gate_id === "C00Q").status, "retained_formal_pass_receipt");
  assert.equal(gateMap.entries.find((entry) => entry.gate_id === "C00B").status, "blocked");
  assert.equal(gateMap.entries.every((entry) => entry.progression_accepted === false), true);
});

test("public gate map rejects progression grants, receipt skips, locators, and activation", async () => {
  const original = JSON.parse(await readFile(GATE_MAP_URL, "utf8"));
  const overclaim = clone(original);
  overclaim.entries[1].progression_accepted = true;
  assertCode(() => validateTaskEnginePublicGateMap(overclaim), "public_map_progression_forbidden");

  const skipped = clone(original);
  skipped.entries[1].status = "hold";
  skipped.entries[2].status = "retained_formal_pass_receipt";
  assertCode(() => validateTaskEnginePublicGateMap(skipped), "current_gate_status_mismatch");

  const locator = clone(original);
  locator.entries[0].evidence_ref = ["D:", "private", "receipt.yaml"].join("\\");
  assertCode(() => validateTaskEnginePublicGateMap(locator), "evidence_ref_invalid");

  for (const endpointLike of ["10.0.0.5", "10.0.0.5:8443", "private-host:8443", "internal-host.example", "user@example.com"]) {
    const endpoint = clone(original);
    endpoint.entries[0].evidence_ref = endpointLike;
    assertCode(() => validateTaskEnginePublicGateMap(endpoint), "evidence_ref_invalid");
  }

  const mapLocator = clone(original);
  mapLocator.map_id = "private-host:8443";
  assertCode(() => validateTaskEnginePublicGateMap(mapLocator), "map_id_invalid");

  const futureOverclaim = clone(original);
  for (let index = 2; index < futureOverclaim.entries.length; index += 1) {
    futureOverclaim.entries[index].status = "retained_formal_pass_receipt";
    futureOverclaim.entries[index].evidence_ref = `task_engine_${futureOverclaim.entries[index].gate_id.toLowerCase()}_formal_receipt_v1`;
    futureOverclaim.entries[index].evidence_scope = "private_metadata_ref";
  }
  assertCode(() => validateTaskEnginePublicGateMap(futureOverclaim), "current_gate_status_mismatch");

  const mismatched = clone(original);
  mismatched.entries[3].evidence_ref = "task_engine_p0_candidate_receipt_v1";
  assertCode(() => validateTaskEnginePublicGateMap(mismatched), "evidence_ref_scope_mismatch");

  const evidenceFree = clone(original);
  evidenceFree.entries[1].evidence_ref = "none";
  evidenceFree.entries[1].evidence_scope = "none";
  assertCode(() => validateTaskEnginePublicGateMap(evidenceFree), "accepted_receipt_evidence_required");

  const wrongHistoricalScope = clone(original);
  wrongHistoricalScope.entries[0].evidence_scope = "public_synthetic";
  assertCode(() => validateTaskEnginePublicGateMap(wrongHistoricalScope), "historical_receipt_scope_invalid");

  const contradictoryReason = clone(original);
  contradictoryReason.entries[1].blocking_reasons = ["current_execution_authority_present"];
  assertCode(() => validateTaskEnginePublicGateMap(contradictoryReason), "current_gate_reasons_mismatch");

  const reasonLocator = clone(original);
  reasonLocator.entries[1].blocking_reasons = ["internal-host.example"];
  assertCode(() => validateTaskEnginePublicGateMap(reasonLocator), "blocking_reason_invalid");

  const wrongCurrentScope = clone(original);
  wrongCurrentScope.entries[1].evidence_scope = "private_metadata_ref";
  assertCode(() => validateTaskEnginePublicGateMap(wrongCurrentScope), "current_gate_evidence_mismatch");

  const activation = clone(original);
  activation.activation_allowed = true;
  assertCode(() => validateTaskEnginePublicGateMap(activation), "gate_map_boundary_invalid");
});

test("public gate map rejects hidden, symbol, accessor, and array-extra fields", async () => {
  const original = JSON.parse(await readFile(GATE_MAP_URL, "utf8"));

  const hidden = clone(original);
  Object.defineProperty(hidden.entries[0], "private_path", {
    enumerable: false,
    value: "private locator sentinel",
  });
  assertCode(() => validateTaskEnginePublicGateMap(hidden), "data_property_required");

  const symbol = clone(original);
  symbol[Symbol("private_locator")] = "private locator sentinel";
  assertCode(() => validateTaskEnginePublicGateMap(symbol), "symbol_key_not_allowed");

  const accessor = clone(original);
  Object.defineProperty(accessor.entries[0], "gate_id", {
    enumerable: true,
    get: () => "C00A",
  });
  assertCode(() => validateTaskEnginePublicGateMap(accessor), "data_property_required");

  const arrayExtra = clone(original);
  arrayExtra.entries.private_locator = "private locator sentinel";
  assertCode(() => validateTaskEnginePublicGateMap(arrayExtra), "array_extra_property");
});

test("five-lane readiness profiles stay candidate-only and preserve exact lane distinctions", () => {
  assert.deepEqual(Object.keys(PROJECT_HISTORY_READINESS_PROFILES), [
    "mail", "voice", "structured_pc_work", "file", "run_log",
  ]);
  assert.equal(PROJECT_HISTORY_READINESS_PROFILES.mail.candidate_owner_surfaces.length, 0);
  assert.equal(PROJECT_HISTORY_READINESS_PROFILES.voice.native_occurrence_entity_types[0], "voice_recording");
  assert.equal(PROJECT_HISTORY_READINESS_PROFILES.structured_pc_work.native_occurrence_entity_types[0], "erp_mcp_work_session");
  assert.deepEqual(PROJECT_HISTORY_READINESS_PROFILES.file.native_occurrence_entity_types, [
    "file_observation", "file_reconciliation_event", "erp_upload_event",
  ]);
  assert.equal(PROJECT_HISTORY_READINESS_PROFILES.run_log.candidate_owner_surfaces[0], "report_authoring_v0");
  assert.equal(Object.values(PROJECT_HISTORY_READINESS_PROFILES).some((profile) => profile.binding_state === "ratified"), false);
});

test("one synthetic project receives one classified shadow event per lane", () => {
  const fixture = buildSyntheticFiveLaneShadowFixture();
  assert.equal(fixture.envelopes.length, 5);
  assert.equal(fixture.raw_payload_copied, false);
  for (const envelope of fixture.envelopes) {
    assert.equal(envelope.classification_before.state, "unclassified");
    assert.equal(envelope.classification_after.state, "classified");
    assert.deepEqual(envelope.project_ref, fixture.project_ref);
    assert.equal(envelope.raw_payload_copied, false);
  }
});

test("synthetic project override rejects host, endpoint, and email carriers", () => {
  for (const unsafeId of ["private-host:8443", "10.0.0.5", "internal-host.example", "user@example.com"]) {
    assertCode(
      () => buildSyntheticFiveLaneShadowFixture({ project_entity_id: unsafeId }),
      "synthetic_project_id_invalid",
    );
  }
  assert.equal(
    buildSyntheticFiveLaneShadowFixture({ project_entity_id: "synthetic-project-beta" }).project_ref.entity_id,
    "synthetic-project-beta",
  );
});

test("builder option bags reject null, primitives, arrays, extras, and accessors", () => {
  const shadow = buildSyntheticFiveLaneShadowFixture();
  for (const invalidOptions of [null, "options", 7, []]) {
    assertCode(() => buildSyntheticFiveLaneShadowFixture(invalidOptions), "plain_object_required");
    assertCode(() => buildSyntheticH06CoverageFixture(shadow.envelopes, invalidOptions), "plain_object_required");
  }

  assertCode(
    () => buildSyntheticFiveLaneShadowFixture({ unknown: true }),
    "unexpected_option",
  );
  assertCode(
    () => buildSyntheticH06CoverageFixture(shadow.envelopes, { unknown: true }),
    "unexpected_option",
  );

  const projectAccessor = {};
  Object.defineProperty(projectAccessor, "project_entity_id", {
    enumerable: true,
    get: () => { throw new Error("must not execute"); },
  });
  assertCode(() => buildSyntheticFiveLaneShadowFixture(projectAccessor), "data_property_required");

  const windowAccessor = {};
  Object.defineProperty(windowAccessor, "window_start", {
    enumerable: true,
    get: () => { throw new Error("must not execute"); },
  });
  assertCode(
    () => buildSyntheticH06CoverageFixture(shadow.envelopes, windowAccessor),
    "data_property_required",
  );
});

test("builder defaults never read inherited option accessors", () => {
  let inheritedReadCount = 0;
  Object.defineProperties(Object.prototype, {
    project_entity_id: {
      configurable: true,
      get: () => { inheritedReadCount += 1; throw new Error("must not execute"); },
    },
    window_start: {
      configurable: true,
      get: () => { inheritedReadCount += 1; throw new Error("must not execute"); },
    },
    window_end: {
      configurable: true,
      get: () => { inheritedReadCount += 1; throw new Error("must not execute"); },
    },
  });
  try {
    const shadow = buildSyntheticFiveLaneShadowFixture({});
    const coverage = buildSyntheticH06CoverageFixture(shadow.envelopes, {});
    assert.equal(shadow.project_ref.entity_id, "synthetic-project-alpha");
    assert.equal(coverage.receipts.length, 5);
    assert.equal(inheritedReadCount, 0);
  } finally {
    delete Object.prototype.project_entity_id;
    delete Object.prototype.window_start;
    delete Object.prototype.window_end;
  }
});

test("shadow replay is deterministic, idempotent, and conflict-closed", () => {
  const fixture = buildSyntheticFiveLaneShadowFixture();
  const first = replayProjectHistoryShadow([], fixture.envelopes);
  assert.equal(first.added_count, 5);
  assert.equal(first.replayed_count, 0);

  const replay = replayProjectHistoryShadow(first.envelopes, clone(fixture.envelopes));
  assert.equal(replay.added_count, 0);
  assert.equal(replay.replayed_count, 5);
  assert.equal(replay.ordered_event_digest, first.ordered_event_digest);

  const conflict = clone(fixture.envelopes[0]);
  conflict.project_ref.entity_id = "synthetic-project-beta";
  conflict.classification_after.project_ref = conflict.project_ref;
  conflict.metadata_digest = computeMetadataDigest(conflict);
  assertCode(() => replayProjectHistoryShadow(first.envelopes, [conflict]), "event_ref_conflict");
});

test("one source occurrence cannot be double-counted across lanes", () => {
  const fixture = buildSyntheticFiveLaneShadowFixture();
  const duplicate = clone(fixture.envelopes[1]);
  duplicate.native_occurrence_ref = clone(fixture.envelopes[0].native_occurrence_ref);
  duplicate.event_ref.entity_id = "event:cross-lane:01";
  duplicate.occurrence_id = deriveOccurrenceId(duplicate.lane, duplicate.native_occurrence_ref);
  duplicate.metadata_digest = computeMetadataDigest(duplicate);
  assertCode(
    () => replayProjectHistoryShadow([], [fixture.envelopes[0], duplicate]),
    "cross_lane_occurrence_conflict",
  );
});

test("H06 synthetic coverage binds all five lanes and replays to the same digest", () => {
  const shadow = buildSyntheticFiveLaneShadowFixture();
  const coverage = buildSyntheticH06CoverageFixture(shadow.envelopes);
  assert.equal(validateSyntheticH06CoverageFixture(coverage), coverage);
  assert.equal(coverage.receipts.length, 5);
  assert.equal(coverage.receipts.every((receipt) => receipt.state === "complete_with_events"), true);
  assert.equal(coverage.receipts.every((receipt) => receipt.event_count === 1), true);

  const replay = replayProjectHistoryShadow([], [...shadow.envelopes].reverse());
  const replayCoverage = buildSyntheticH06CoverageFixture(replay.envelopes);
  assert.deepEqual(replayCoverage, coverage);
});

test("H06 coverage fixture rejects missing lanes and raw promotion", () => {
  const shadow = buildSyntheticFiveLaneShadowFixture();
  assertCode(() => buildSyntheticH06CoverageFixture(shadow.envelopes.slice(1)), "lane_fixture_missing");
  const coverage = buildSyntheticH06CoverageFixture(shadow.envelopes);
  coverage.raw_payload_copied = true;
  assertCode(() => validateSyntheticH06CoverageFixture(coverage), "raw_payload_forbidden");

  const nullReceipt = buildSyntheticH06CoverageFixture(shadow.envelopes);
  nullReceipt.receipts[0] = null;
  assertCode(() => validateSyntheticH06CoverageFixture(nullReceipt), "coverage_receipt_required");
});

test("H06 coverage fixture rejects mixed projects and non-synthetic provenance", () => {
  const mixed = buildSyntheticFiveLaneShadowFixture();
  mixed.envelopes[0].project_ref = {
    ...mixed.envelopes[0].project_ref,
    entity_id: "synthetic-project-beta",
  };
  mixed.envelopes[0].classification_after.project_ref = clone(mixed.envelopes[0].project_ref);
  mixed.envelopes[0].metadata_digest = computeMetadataDigest(mixed.envelopes[0]);
  assertCode(() => buildSyntheticH06CoverageFixture(mixed.envelopes), "single_project_required");

  const privateOwner = buildSyntheticFiveLaneShadowFixture();
  privateOwner.envelopes[0].native_occurrence_ref.owner_surface = "private_runtime_owner";
  privateOwner.envelopes[0].occurrence_id = deriveOccurrenceId(
    privateOwner.envelopes[0].lane,
    privateOwner.envelopes[0].native_occurrence_ref,
  );
  privateOwner.envelopes[0].metadata_digest = computeMetadataDigest(privateOwner.envelopes[0]);
  assertCode(() => buildSyntheticH06CoverageFixture(privateOwner.envelopes), "synthetic_provenance_required");
});

test("H06 coverage fixture rejects lane/type mismatch and missing Shadow transition", () => {
  const wrongType = buildSyntheticFiveLaneShadowFixture();
  const voice = wrongType.envelopes.find((envelope) => envelope.lane === "voice");
  voice.native_occurrence_ref.entity_type = "workflow_job";
  voice.occurrence_id = deriveOccurrenceId(voice.lane, voice.native_occurrence_ref);
  voice.metadata_digest = computeMetadataDigest(voice);
  assertCode(() => buildSyntheticH06CoverageFixture(wrongType.envelopes), "native_occurrence_type_invalid");

  const noTransition = buildSyntheticFiveLaneShadowFixture();
  const mail = noTransition.envelopes.find((envelope) => envelope.lane === "mail");
  mail.classification_before = {
    state: "classified",
    project_ref: clone(mail.project_ref),
  };
  mail.metadata_digest = computeMetadataDigest(mail);
  assertCode(
    () => buildSyntheticH06CoverageFixture(noTransition.envelopes),
    "synthetic_classification_transition_required",
  );

  for (const nullableField of ["classification_before", "classification_after"]) {
    const nullTransition = buildSyntheticFiveLaneShadowFixture();
    nullTransition.envelopes[0][nullableField] = null;
    nullTransition.envelopes[0].metadata_digest = computeMetadataDigest(nullTransition.envelopes[0]);
    assertCode(
      () => buildSyntheticH06CoverageFixture(nullTransition.envelopes),
      "synthetic_classification_transition_required",
    );
  }
});
