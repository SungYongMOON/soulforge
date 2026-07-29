import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

import {
  AI_WORK_RECORD_EVENT_SCHEMA_VERSION,
  AiWorkRecordEventError,
  canonicalJson,
  computeAiWorkRecordEventDigest,
  reduceAiWorkRecordEvents,
  sealAiWorkRecordEvent,
  validateAiWorkRecordEvent,
  validateAiWorkRecordIdAliasMapping,
} from "./ai_work_record_event.mjs";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020.js").default;
const STARTED_AT = "2026-07-29T00:00:00.000Z";
const SHA_A = `sha256:${"a".repeat(64)}`;

function metadataRef(refKind, refId, extra = {}) {
  return {
    ref_kind: refKind,
    ref_id: refId,
    ...extra,
  };
}

function baseEvent(overrides = {}) {
  return sealAiWorkRecordEvent({
    schema_version: AI_WORK_RECORD_EVENT_SCHEMA_VERSION,
    event_id: "aiwr.event.001",
    work_id: "aiwr.work.001",
    idempotency_key: "aiwr.idem.001",
    event_kind: "start",
    sequence: 0,
    previous_event_digest: null,
    project_ref: "project.synthetic",
    task_ref: "pending",
    actor: {
      node_id: "node.synthetic",
      agent_id: "agent.synthetic",
      tool: "codex",
      tool_version: "v1.0",
    },
    started_at: STARTED_AT,
    occurred_at: STARTED_AT,
    recorded_at: STARTED_AT,
    status: "active",
    purpose: "Create a bounded metadata event.",
    scope: "Synthetic A1 contract fixture.",
    source_refs: [],
    result_refs: [],
    evidence_refs: [],
    stop_conditions: [],
    uncertainties: [],
    metadata_boundary: "metadata_only",
    official_completion: false,
    whole_chat_capture: false,
    screen_capture: false,
    keyboard_capture: false,
    os_activity_capture: false,
    ...overrides,
  });
}

function nextEvent(previous, overrides = {}) {
  const sequence = previous.sequence + 1;
  const eventKind = overrides.event_kind ?? "checkpoint";
  const event = {
    schema_version: AI_WORK_RECORD_EVENT_SCHEMA_VERSION,
    event_id: `aiwr.event.${String(sequence + 1).padStart(3, "0")}`,
    work_id: previous.work_id,
    idempotency_key: `aiwr.idem.${String(sequence + 1).padStart(3, "0")}`,
    event_kind: eventKind,
    sequence,
    previous_event_digest: previous.event_digest,
    project_ref: previous.project_ref,
    task_ref: previous.task_ref,
    actor: { ...previous.actor },
    started_at: previous.started_at,
    occurred_at: new Date(
      Date.parse(previous.occurred_at) + 1000,
    ).toISOString(),
    recorded_at: new Date(
      Date.parse(previous.recorded_at) + 1000,
    ).toISOString(),
    status: {
      checkpoint: "active",
      closeout_pending: "closeout_pending",
      closeout: "closed",
      correction: "closed",
    }[eventKind],
    purpose: "Record the next bounded metadata event.",
    scope: previous.scope,
    source_refs: [],
    result_refs: [],
    evidence_refs: [],
    stop_conditions: [],
    uncertainties: [],
    metadata_boundary: "metadata_only",
    official_completion: false,
    whole_chat_capture: false,
    screen_capture: false,
    keyboard_capture: false,
    os_activity_capture: false,
    ...overrides,
  };
  return sealAiWorkRecordEvent(event);
}

function terminalEvent(pending, closeoutKind, overrides = {}) {
  const resultRefs = closeoutKind === "handoff"
    ? [metadataRef("packet", "packet.synthetic.001")]
    : [metadataRef("result", "result.synthetic.001")];
  return nextEvent(pending, {
    event_kind: "closeout",
    status: "closed",
    closeout_kind: closeoutKind,
    result_refs: resultRefs,
    evidence_refs: [metadataRef("evidence", "evidence.synthetic.001")],
    stop_conditions: closeoutKind === "blocked"
      ? ["blocked.synthetic"]
      : [],
    uncertainties: closeoutKind === "abandoned"
      ? ["uncertainty.synthetic"]
      : [],
    ...overrides,
  });
}

function lifecycle(closeoutKind = "completed_candidate") {
  const start = baseEvent();
  const checkpoint = nextEvent(start);
  const pending = nextEvent(checkpoint, {
    event_kind: "closeout_pending",
    status: "closeout_pending",
  });
  const closeout = terminalEvent(pending, closeoutKind);
  return { start, checkpoint, pending, closeout };
}

function correctionEvent(previous, target, reason = "Correct synthetic metadata annotation.") {
  return nextEvent(previous, {
    event_kind: "correction",
    status: "closed",
    correction_ref: {
      event_id: target.event_id,
      event_digest: target.event_digest,
      reason,
    },
  });
}

function looseDigest(event) {
  const value = { ...event };
  delete value.event_digest;
  value.event_digest = computeAiWorkRecordEventDigest(value);
  return value;
}

async function compiledSchema() {
  const schema = JSON.parse(await readFile(
    new URL("./ai_work_record_event.v1.schema.json", import.meta.url),
    "utf8",
  ));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  return ajv.compile(schema);
}

test("strict schema compiles and accepts the clarified lifecycle", async () => {
  const validate = await compiledSchema();
  const { start, checkpoint, pending, closeout } = lifecycle();
  const correction = correctionEvent(closeout, checkpoint);
  const secondCorrection = correctionEvent(
    correction,
    correction,
    "Annotate the prior correction without changing projection.",
  );

  for (const event of [
    start,
    checkpoint,
    pending,
    closeout,
    correction,
    secondCorrection,
  ]) {
    assert.equal(validate(event), true, JSON.stringify(validate.errors));
  }

  const correctionFieldOnCheckpoint = looseDigest({
    ...checkpoint,
    correction_ref: {
      event_id: start.event_id,
      event_digest: start.event_digest,
      reason: "Invalid static correction field.",
    },
  });
  assert.equal(validate(correctionFieldOnCheckpoint), false);
  assert.equal(validate(looseDigest({ ...correction, event_kind: "unknown" })), false);
});

test("canonical digest is deterministic and excludes only event_digest", () => {
  assert.equal(
    canonicalJson({ z: 1, a: { y: 2, x: 3 } }),
    canonicalJson({ a: { x: 3, y: 2 }, z: 1 }),
  );
  const start = baseEvent();
  assert.equal(computeAiWorkRecordEventDigest(start), start.event_digest);
  assert.notEqual(
    computeAiWorkRecordEventDigest({ ...start, purpose: "Changed summary." }),
    start.event_digest,
  );

  const protoPayload = {};
  Object.defineProperty(protoPayload, "__proto__", {
    enumerable: true,
    value: "bound",
  });
  assert.match(canonicalJson(protoPayload), /"__proto__":"bound"/u);
});

test("lifecycle requires pending, forbids checkpoint after pending, and is terminal", () => {
  const { start, checkpoint, pending, closeout } = lifecycle();
  const directCloseout = terminalEvent(start, "completed_candidate");
  assert.equal(
    reduceAiWorkRecordEvents([start, directCloseout]).reason_code,
    "closeout_pending_required",
  );

  const checkpointAfterPending = nextEvent(pending);
  assert.equal(
    reduceAiWorkRecordEvents([
      start,
      checkpoint,
      pending,
      checkpointAfterPending,
    ]).reason_code,
    "checkpoint_after_closeout_pending",
  );

  const repeatedPending = nextEvent(pending, {
    event_kind: "closeout_pending",
    status: "closeout_pending",
  });
  assert.equal(
    reduceAiWorkRecordEvents([start, checkpoint, pending, repeatedPending])
      .reason_code,
    "duplicate_closeout_pending",
  );

  const eventAfterCloseout = nextEvent(closeout);
  assert.equal(
    reduceAiWorkRecordEvents([
      start,
      checkpoint,
      pending,
      closeout,
      eventAfterCloseout,
    ]).reason_code,
    "event_after_closeout",
  );
});

test("all terminal kinds require result-capable and evidence-capable refs", async () => {
  const validateSchema = await compiledSchema();
  for (const kind of [
    "completed_candidate",
    "blocked",
    "handoff",
    "abandoned",
  ]) {
    const { closeout } = lifecycle(kind);
    assert.equal(validateSchema(closeout), true, kind);
    assert.equal(validateAiWorkRecordEvent(closeout), closeout);
  }

  const { pending } = lifecycle();
  for (const kind of [
    "completed_candidate",
    "blocked",
    "handoff",
    "abandoned",
  ]) {
    assert.throws(
      () => terminalEvent(pending, kind, { result_refs: [] }),
      /terminal_result_ref_required/u,
      `${kind}: result gate`,
    );
    assert.throws(
      () => terminalEvent(pending, kind, { evidence_refs: [] }),
      /terminal_evidence_ref_required/u,
      `${kind}: evidence gate`,
    );
  }
  assert.throws(
    () => terminalEvent(pending, "completed_candidate", {
      result_refs: [metadataRef("source", "source.synthetic.result")],
      evidence_refs: [metadataRef("source", "source.synthetic.evidence")],
    }),
    /terminal_result_ref_required/u,
  );
  const sourceOnly = looseDigest({
    ...terminalEvent(pending, "completed_candidate"),
    result_refs: [metadataRef("source", "source.synthetic.result")],
    evidence_refs: [metadataRef("source", "source.synthetic.evidence")],
  });
  assert.equal(validateSchema(sourceOnly), false);

  assert.throws(
    () => terminalEvent(pending, "blocked", { stop_conditions: [] }),
    /blocked_stop_condition_required/u,
  );
  assert.throws(
    () => terminalEvent(pending, "handoff", {
      result_refs: [metadataRef("result", "result.synthetic.no-packet")],
    }),
    /handoff_packet_required/u,
  );
  assert.throws(
    () => terminalEvent(pending, "abandoned", {
      stop_conditions: [],
      uncertainties: [],
    }),
    /abandoned_reason_required/u,
  );
  assert.throws(
    () => terminalEvent(pending, "blocked", {
      evidence_refs: [metadataRef("source", "source.synthetic.only")],
    }),
    /terminal_evidence_ref_required/u,
  );
});

test("closeout_pending may carry refs but never auto-closes", () => {
  const start = baseEvent();
  const pending = nextEvent(start, {
    event_kind: "closeout_pending",
    status: "closeout_pending",
    result_refs: [metadataRef("result", "result.synthetic.ready")],
    evidence_refs: [metadataRef("evidence", "evidence.synthetic.ready")],
  });
  const reduced = reduceAiWorkRecordEvents([start, pending]);
  assert.equal(reduced.decision, "accept");
  assert.equal(reduced.terminal_projection, null);
  assert.equal(reduced.events.at(-1).event_kind, "closeout_pending");
});

test("correction is post-closeout audit-only with zero projection", async () => {
  const validateSchema = await compiledSchema();
  const { start, checkpoint, pending, closeout } = lifecycle();
  const before = reduceAiWorkRecordEvents([start, checkpoint, pending, closeout]);
  const snapshot = structuredClone([start, checkpoint, pending, closeout]);
  const correction = correctionEvent(closeout, checkpoint);
  const secondCorrection = correctionEvent(correction, correction);
  const after = reduceAiWorkRecordEvents([
    start,
    checkpoint,
    pending,
    closeout,
    correction,
    secondCorrection,
  ]);

  assert.equal(after.decision, "accept");
  assert.deepEqual(after.terminal_projection, before.terminal_projection);
  assert.deepEqual([start, checkpoint, pending, closeout], snapshot);
  assert.equal(after.events.at(-1).event_kind, "correction");
  assert.throws(
    () => correctionEvent(closeout, checkpoint, "User: transcript marker"),
    /forbidden_capture_content/u,
  );
  assert.throws(
    () => nextEvent(closeout, {
      event_kind: "correction",
      status: "closed",
      correction_ref: {
        event_id: checkpoint.event_id,
        event_digest: checkpoint.event_digest,
        reason: "Attempt projected result.",
      },
      result_refs: [metadataRef("result", "result.synthetic.forbidden")],
    }),
    /correction_projection_forbidden/u,
  );
  assert.equal(
    validateSchema(looseDigest({
      ...correction,
      result_refs: [metadataRef("result", "result.synthetic.forbidden")],
    })),
    false,
  );
  assert.throws(
    () => nextEvent(closeout, {
      event_kind: "correction",
      status: "closed",
      correction_ref: {
        event_id: checkpoint.event_id,
        event_digest: checkpoint.event_digest,
        reason: "Attempt source-list result smuggling.",
      },
      source_refs: [metadataRef("result", "result.synthetic.smuggled")],
    }),
    /correction_source_ref_kind_forbidden/u,
  );
  assert.equal(
    validateSchema(looseDigest({
      ...correction,
      source_refs: [metadataRef("evidence", "evidence.synthetic.smuggled")],
    })),
    false,
  );
});

test("correction before closeout and wrong correction target are HOLD", () => {
  const { start, checkpoint, pending, closeout } = lifecycle();
  const early = correctionEvent(checkpoint, start);
  assert.equal(
    reduceAiWorkRecordEvents([start, checkpoint, early]).reason_code,
    "correction_before_closeout",
  );

  const wrongTarget = correctionEvent(closeout, checkpoint);
  const tampered = looseDigest({
    ...wrongTarget,
    correction_ref: {
      ...wrongTarget.correction_ref,
      event_digest: SHA_A,
    },
  });
  assert.equal(
    reduceAiWorkRecordEvents([
      start,
      checkpoint,
      pending,
      closeout,
      tampered,
    ]).reason_code,
    "correction_target_digest_mismatch",
  );
});

test("batch reducer is atomic and aggregate accept survives a trailing replay", () => {
  const start = baseEvent();
  const checkpoint = nextEvent(start);
  const accepted = reduceAiWorkRecordEvents([start, checkpoint, start]);
  assert.equal(accepted.decision, "accept");
  assert.equal(accepted.accepted_count, 2);
  assert.equal(accepted.no_op_count, 1);
  assert.equal(accepted.persistence, "append_accepted");
  assert.equal(accepted.acknowledgement, "ack_after_persist");

  const replayOnly = reduceAiWorkRecordEvents([start], [start]);
  assert.equal(replayOnly.decision, "no_op");
  assert.equal(replayOnly.accepted_count, 0);
  assert.equal(replayOnly.no_op_count, 1);
  assert.equal(replayOnly.persistence, "none");

  const conflict = sealAiWorkRecordEvent({
    ...start,
    purpose: "Conflicting event under the same identifier.",
  });
  const held = reduceAiWorkRecordEvents([start, checkpoint, conflict]);
  assert.equal(held.decision, "HOLD");
  assert.equal(held.accepted_count, 0);
  assert.equal(held.persistence, "forbidden");
  assert.equal(held.acknowledgement, "hold");
  assert.deepEqual(held.events, []);

  const policyFailure = looseDigest({
    ...checkpoint,
    purpose: "ghp_",
  });
  const policyHeld = reduceAiWorkRecordEvents([start, policyFailure]);
  assert.equal(policyHeld.decision, "HOLD");
  assert.equal(policyHeld.reason_code, "secret_like_content");
  assert.equal(policyHeld.accepted_count, 0);
  assert.equal(policyHeld.persistence, "forbidden");
});

test("sequence, previous digest, and idempotency conflicts HOLD", () => {
  const start = baseEvent();
  const checkpoint = nextEvent(start);
  const gap = nextEvent(start, { sequence: 2 });
  assert.equal(
    reduceAiWorkRecordEvents([start, gap]).reason_code,
    "sequence_gap_or_conflict",
  );

  const wrongPrevious = nextEvent(start, { previous_event_digest: SHA_A });
  assert.equal(
    reduceAiWorkRecordEvents([start, wrongPrevious]).reason_code,
    "previous_event_digest_mismatch",
  );

  const reusedKey = nextEvent(start, {
    idempotency_key: start.idempotency_key,
  });
  assert.equal(
    reduceAiWorkRecordEvents([start, reusedKey]).reason_code,
    "idempotency_key_conflict",
  );

  const duplicateSequence = nextEvent(checkpoint, { sequence: 1 });
  assert.equal(
    reduceAiWorkRecordEvents([start, checkpoint, duplicateSequence]).reason_code,
    "sequence_gap_or_conflict",
  );
});

test("single-line metadata bounds and known secret/raw sentinels fail closed", async () => {
  const validateSchema = await compiledSchema();
  for (const value of [
    "ghp_",
    "xoxb-",
    "AKIA",
    "-----BEGIN PRIVATE KEY-----",
    "password=synthetic",
    "cookie:synthetic",
    "credential=synthetic",
    "api_key=synthetic",
    "authorization=synthetic",
    "bearer synthetic",
    "session-token=synthetic",
    "Access-Token=synthetic",
    "refresh_token=synthetic",
    "AUTH_TOKEN=synthetic",
    "Client_Secret=synthetic",
    "private-key=synthetic",
    "SESSION_COOKIE=synthetic",
  ]) {
    assert.throws(
      () => baseEvent({ purpose: value }),
      /secret_like_content/u,
      value,
    );
  }
  assert.equal(
    validateSchema(looseDigest({ ...baseEvent(), purpose: "ghp_" })),
    false,
  );
  for (const marker of [
    "reference PRIVATE KEY material",
    "reference PrIvAtE KeY material",
    "reference private_key material",
    "reference private-key material",
    "-----BEGIN RSA PRIVATE KEY-----",
    "-----BEGIN EC PRIVATE KEY-----",
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    "-----BEGIN DSA PRIVATE KEY-----",
    "-----BEGIN ENCRYPTED PRIVATE KEY-----",
    "private key: synthetic",
  ]) {
    assert.throws(
      () => baseEvent({ purpose: marker }),
      /secret_like_content/u,
      `JS: ${marker}`,
    );
    assert.equal(
      validateSchema(looseDigest({ ...baseEvent(), purpose: marker })),
      false,
      `schema differential: ${marker}`,
    );
  }
  for (const field of [
    "body_text",
    "body_html",
    "provider_payload",
    "password",
    "cookie",
    "secret",
    "token",
    "credential",
    "api_key",
    "authorization",
    "bearer",
    "session-token",
    "access_token",
    "refresh-token",
    "auth_token",
    "client_secret",
    "private-key",
    "session_cookie",
  ]) {
    assert.throws(
      () => sealAiWorkRecordEvent({ ...baseEvent(), [field]: "synthetic" }),
      /forbidden_capture_field/u,
      field,
    );
  }
  assert.throws(
    () => baseEvent({ purpose: "Assistant: copied transcript" }),
    /forbidden_capture_content/u,
  );
  assert.throws(
    () => baseEvent({ scope: "line one\nline two" }),
    /bounded_text_required/u,
  );
  assert.throws(
    () => baseEvent({ purpose: "x".repeat(161) }),
    /bounded_text_required/u,
  );
  assert.throws(
    () => sealAiWorkRecordEvent({
      ...baseEvent(),
      nested: {
        role: "user",
        content: "synthetic chat body",
      },
    }),
    /chat_shape_forbidden/u,
  );
});

test("PRIVATE KEY schema and JS parity covers every free metadata string carrier", async () => {
  const validateSchema = await compiledSchema();
  const markers = [
    "reference PRIVATE KEY material",
    "reference PrIvAtE KeY material",
    "private_key",
    "private-key",
    "-----BEGIN RSA PRIVATE KEY-----",
    "-----BEGIN EC PRIVATE KEY-----",
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    "-----BEGIN DSA PRIVATE KEY-----",
    "-----BEGIN ENCRYPTED PRIVATE KEY-----",
  ];
  const carriers = [
    ["purpose", (marker) => ({
      ...baseEvent(),
      purpose: marker,
    })],
    ["opaque_ref", (marker) => ({
      ...baseEvent(),
      source_refs: [metadataRef("source", marker)],
    })],
    ["path_ref", (marker) => ({
      ...baseEvent(),
      source_refs: [metadataRef("file", "file.synthetic.private-marker", {
        path_ref: `synthetic/${marker}`,
      })],
    })],
    ["event_id", (marker) => ({
      ...baseEvent(),
      event_id: marker,
    })],
    ["actor.tool", (marker) => ({
      ...baseEvent(),
      actor: {
        ...baseEvent().actor,
        tool: marker,
      },
    })],
    ["metadata_ref.state", (marker) => ({
      ...baseEvent(),
      source_refs: [metadataRef("source", "source.synthetic.private-marker", {
        state: marker,
      })],
    })],
  ];

  for (const marker of markers) {
    for (const [carrier, build] of carriers) {
      const invalid = looseDigest(build(marker));
      assert.equal(
        validateSchema(invalid),
        false,
        `schema: ${carrier}: ${marker}`,
      );
      assert.throws(
        () => validateAiWorkRecordEvent(invalid),
        /secret_like_content/u,
        `JS: ${carrier}: ${marker}`,
      );
    }
  }

  const valid = baseEvent({
    source_refs: [metadataRef("file", "file.synthetic.valid", {
      path_ref: "_workspaces/synthetic_ai_work_record/valid.ref",
      state: "state.valid",
    })],
  });
  assert.equal(validateSchema(valid), true, JSON.stringify(validateSchema.errors));
  assert.equal(validateAiWorkRecordEvent(valid), valid);
});

test("path_ref permits synthetic private-owner pointers but rejects encoded or non-relative paths", async () => {
  const validateSchema = await compiledSchema();
  for (const pathRef of [
    "_workspaces/synthetic_ai_work_record/input.sha256",
    "_workmeta/synthetic_ai_work_record/run.ref",
    "guild_hall/state/synthetic_ai_work_record/event.ref",
    "docs/architecture/workspace/synthetic.ref",
  ]) {
    const event = baseEvent({
      source_refs: [
        metadataRef("file", `file.synthetic.${pathRef.length}`, {
          path_ref: pathRef,
        }),
      ],
    });
    assert.equal(validateSchema(event), true, pathRef);
  }

  for (const pathRef of [
    "_workspaces/synthetic/%2e%2e/private.ref",
    "_workspaces/synthetic/%252e%252e/private.ref",
    "folder/../private.ref",
    "./synthetic.ref",
    "folder\\private.ref",
    ["C", ":/synthetic/private.ref"].join(""),
    "//synthetic/share.ref",
    "https://example.invalid/ref",
  ]) {
    const invalid = looseDigest({
      ...baseEvent(),
      source_refs: [
        metadataRef("file", "file.synthetic.schema-invalid", {
          path_ref: pathRef,
        }),
      ],
    });
    assert.equal(validateSchema(invalid), false, `schema: ${pathRef}`);
    assert.throws(
      () => baseEvent({
        source_refs: [
          metadataRef("file", "file.synthetic.invalid", { path_ref: pathRef }),
        ],
      }),
      /path_ref_not_normalized_relative/u,
      pathRef,
    );
  }
});

test("controlled metadata refs cover receipts, hashes, exits, outbox, and packet state", () => {
  const event = baseEvent({
    source_refs: [
      metadataRef("tool_receipt", "tool-receipt.synthetic", {
        occurred_at: STARTED_AT,
      }),
      metadataRef("command_receipt", "command-receipt.synthetic", {
        exit_code: 0,
      }),
      metadataRef("file", "file.synthetic", {
        path_ref: "_workspaces/synthetic_ai_work_record/input.sha256",
        digest: SHA_A,
      }),
      metadataRef("git", "git.synthetic.ref"),
      metadataRef("test", "test.synthetic", { exit_code: 0 }),
      metadataRef("build", "build.synthetic", { exit_code: 0 }),
      metadataRef("outbox", "outbox.synthetic", {
        state: "ack",
        attempt: 2,
      }),
      metadataRef("packet", "packet.synthetic", { state: "ready" }),
    ],
  });
  assert.equal(validateAiWorkRecordEvent(event), event);
});

test("schema is static authority; JS rejects impossible calendar and ordering", async () => {
  const validateSchema = await compiledSchema();
  const impossible = looseDigest({
    ...baseEvent(),
    started_at: "2026-02-31T00:00:00.000Z",
    occurred_at: "2026-02-31T00:00:00.000Z",
    recorded_at: "2026-02-31T00:00:00.000Z",
  });
  assert.equal(validateSchema(impossible), true);
  assert.throws(
    () => validateAiWorkRecordEvent(impossible),
    /timestamp_invalid/u,
  );

  const start = baseEvent();
  const wrongCheckpoint = looseDigest({
    ...nextEvent(start),
    sequence: 0,
    previous_event_digest: null,
  });
  assert.equal(validateSchema(wrongCheckpoint), false);
  assert.throws(
    () => validateAiWorkRecordEvent(wrongCheckpoint),
    /non_start_chain_invalid/u,
  );

  const reversed = looseDigest({
    ...nextEvent(start),
    occurred_at: "2026-07-28T23:59:59.000Z",
  });
  assert.throws(
    () => validateAiWorkRecordEvent(reversed),
    /event_before_start/u,
  );

  const duplicateNotes = looseDigest({
    ...baseEvent(),
    stop_conditions: ["duplicate.synthetic", "duplicate.synthetic"],
  });
  assert.equal(validateSchema(duplicateNotes), false);
  assert.throws(
    () => validateAiWorkRecordEvent(duplicateNotes),
    /duplicate_note/u,
  );
});

test("native IDs use the common intersection and colon-bearing sources require exact mapping", async () => {
  const validateSchema = await compiledSchema();
  const colonNative = looseDigest({
    ...baseEvent(),
    event_id: "codex:event:legacy-001",
  });
  assert.equal(validateSchema(colonNative), false);
  assert.throws(
    () => validateAiWorkRecordEvent(colonNative),
    /native_id_required/u,
  );

  const sourceId = "codex:event:legacy-001";
  const alias = "a1.event.legacy-001";
  const mappingRef = metadataRef("mapping", sourceId, {
    mapping_field: "event_id",
    mapping_alias: alias,
  });
  const aliased = baseEvent({
    event_id: alias,
    source_refs: [mappingRef],
  });
  assert.equal(validateSchema(aliased), true, JSON.stringify(validateSchema.errors));
  assert.equal(
    validateAiWorkRecordIdAliasMapping(
      sourceId,
      "event_id",
      alias,
      aliased.source_refs,
    ).mapping_required,
    true,
  );
  assert.throws(
    () => validateAiWorkRecordIdAliasMapping(
      sourceId,
      "event_id",
      alias,
      [],
    ),
    /id_mapping_required/u,
  );
  assert.throws(
    () => baseEvent({
      event_id: alias,
      source_refs: [{
        ...mappingRef,
        mapping_alias: "different.alias",
      }],
    }),
    /mapping_alias_mismatch/u,
  );

  const secondSource = metadataRef("mapping", "codex:event:legacy-002", {
    mapping_field: "event_id",
    mapping_alias: alias,
  });
  assert.throws(
    () => baseEvent({
      event_id: alias,
      source_refs: [mappingRef, secondSource],
    }),
    /mapping_alias_conflict/u,
  );

  const secondAlias = metadataRef("mapping", sourceId, {
    mapping_field: "event_id",
    mapping_alias: "a1.event.legacy-002",
  });
  assert.throws(
    () => validateAiWorkRecordIdAliasMapping(
      sourceId,
      "event_id",
      alias,
      [mappingRef, secondAlias],
    ),
    /mapping_source_conflict/u,
  );
});

test("digest-only source tokens cannot substitute for exact reversible ID mappings", async () => {
  const validateSchema = await compiledSchema();
  const alias = "a1.event.digest-only";
  const mapping = (sourceId) => metadataRef("mapping", sourceId, {
    mapping_field: "event_id",
    mapping_alias: alias,
  });
  const digestOnlyIds = [
    `SHA256:${"A".repeat(64)}`,
    "b".repeat(64),
  ];

  for (const sourceId of digestOnlyIds) {
    const digestMapping = mapping(sourceId);
    const invalid = looseDigest({
      ...baseEvent(),
      event_id: alias,
      source_refs: [digestMapping],
    });
    assert.equal(validateSchema(invalid), false, `schema: ${sourceId}`);
    assert.throws(
      () => validateAiWorkRecordEvent(invalid),
      /mapping_digest_only_source_forbidden/u,
      `JS: ${sourceId}`,
    );
    assert.throws(
      () => validateAiWorkRecordIdAliasMapping(
        sourceId,
        "event_id",
        alias,
        [digestMapping],
      ),
      /mapping_digest_only_source_forbidden/u,
      `adapter: ${sourceId}`,
    );
  }

  assert.throws(
    () => validateAiWorkRecordIdAliasMapping(
      "codex:event:missing-map",
      "event_id",
      alias,
      [],
    ),
    /id_mapping_required/u,
  );

  const validStart = baseEvent();
  const hashOnlyCheckpoint = looseDigest({
    ...nextEvent(validStart),
    event_id: alias,
    source_refs: [mapping(SHA_A)],
  });
  const atomicHold = reduceAiWorkRecordEvents([
    validStart,
    hashOnlyCheckpoint,
  ]);
  assert.equal(atomicHold.decision, "HOLD");
  assert.equal(
    atomicHold.reason_code,
    "mapping_digest_only_source_forbidden",
  );
  assert.equal(atomicHold.accepted_count, 0);
  assert.equal(atomicHold.persistence, "forbidden");
});

test("reversible ID mappings remain one-to-one across history and atomic batches", () => {
  const workAlias = "aiwr.work.001";
  const workMapping = (sourceId) => metadataRef("mapping", sourceId, {
    mapping_field: "work_id",
    mapping_alias: workAlias,
  });

  const manyToOneStart = baseEvent({
    source_refs: [workMapping("legacy:work:one")],
  });
  const manyToOneCheckpoint = nextEvent(manyToOneStart, {
    source_refs: [workMapping("legacy:work:two")],
  });
  const manyToOne = reduceAiWorkRecordEvents([
    manyToOneStart,
    manyToOneCheckpoint,
  ]);
  assert.equal(manyToOne.decision, "HOLD");
  assert.equal(manyToOne.reason_code, "mapping_alias_conflict");
  assert.equal(manyToOne.accepted_count, 0);
  assert.equal(manyToOne.persistence, "forbidden");

  const sharedSourceId = "legacy:event:shared";
  const oneToManyStart = baseEvent({
    source_refs: [metadataRef("mapping", sharedSourceId, {
      mapping_field: "event_id",
      mapping_alias: "aiwr.event.001",
    })],
  });
  const oneToManyCheckpoint = nextEvent(oneToManyStart, {
    source_refs: [metadataRef("mapping", sharedSourceId, {
      mapping_field: "event_id",
      mapping_alias: "aiwr.event.002",
    })],
  });
  const oneToMany = reduceAiWorkRecordEvents([
    oneToManyStart,
    oneToManyCheckpoint,
  ]);
  assert.equal(oneToMany.decision, "HOLD");
  assert.equal(oneToMany.reason_code, "mapping_source_conflict");
  assert.equal(oneToMany.accepted_count, 0);
  assert.equal(oneToMany.persistence, "forbidden");

  const repeatedMapping = workMapping("legacy:work:repeat");
  const repeatedStart = baseEvent({ source_refs: [repeatedMapping] });
  const repeatedCheckpoint = nextEvent(repeatedStart, {
    source_refs: [{ ...repeatedMapping }],
  });
  const repeated = reduceAiWorkRecordEvents([
    repeatedStart,
    repeatedCheckpoint,
  ]);
  assert.equal(repeated.decision, "accept");
  assert.equal(repeated.accepted_count, 2);

  const continuation = reduceAiWorkRecordEvents(
    [manyToOneCheckpoint],
    [manyToOneStart],
  );
  assert.equal(continuation.decision, "HOLD");
  assert.equal(continuation.reason_code, "mapping_alias_conflict");
  assert.equal(continuation.accepted_count, 0);
  assert.equal(continuation.persistence, "forbidden");
});

test("module behavior has no LLM, filesystem, network, or process side effect", async () => {
  const moduleUrl = new URL("./ai_work_record_event.mjs", import.meta.url);
  const source = await readFile(moduleUrl, "utf8");
  const imports = [...source.matchAll(/\bfrom\s+"([^"]+)"/gu)]
    .map((match) => match[1]);
  assert.deepEqual(imports, ["node:buffer", "node:crypto"]);
  assert.doesNotMatch(
    source,
    /\b(?:fetch|XMLHttpRequest|WebSocket|openai|anthropic|node:fs|node:http|node:https|child_process)\b/u,
  );

  const originalFetch = globalThis.fetch;
  const cwd = process.cwd();
  const sentinelName = "AI_WORK_RECORD_EVENT_TEST_SENTINEL";
  const previousSentinel = process.env[sentinelName];
  process.env[sentinelName] = "unchanged";
  globalThis.fetch = () => {
    throw new Error("network attempted");
  };
  try {
    const { start, checkpoint, pending, closeout } = lifecycle();
    assert.equal(
      reduceAiWorkRecordEvents([start, checkpoint, pending, closeout]).decision,
      "accept",
    );
    assert.equal(process.env[sentinelName], "unchanged");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousSentinel === undefined) {
      delete process.env[sentinelName];
    } else {
      process.env[sentinelName] = previousSentinel;
    }
  }
  assert.equal(process.cwd(), cwd);
});
