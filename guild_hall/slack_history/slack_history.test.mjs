import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  SLACK_HISTORY_COVERAGE_STATES,
  SlackHistoryError,
  applyBoundedSlackBackfill,
  assessSlackCollectorActivation,
  createSlackBackfillCursor,
  createSlackCoverageReceipt,
  createSlackMessageIdentity,
  createSlackRevision,
  dedupeSlackDeliveries,
  replaySlackDeliveries,
  resolveSlackProjectScope,
  validateSlackCoverageReceipt,
  validateSlackRevisionCollection,
} from "./slack_history.mjs";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020.js").default;
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(moduleDirectory, "slack_history.schema.json");
const fixturePath = path.join(moduleDirectory, "fixtures", "synthetic_slack_history.json");
const modulePath = path.join(moduleDirectory, "slack_history.mjs");

const schema = JSON.parse(await readFile(schemaPath, "utf8"));
const fixtureText = await readFile(fixturePath, "utf8");
const fixture = JSON.parse(fixtureText);

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertErrorCode(action, expectedCode) {
  assert.throws(action, (error) => (
    error instanceof SlackHistoryError && error.code === expectedCode
  ));
}

function materializeFixtureEvents() {
  const revisionRefs = new Map();
  const revisionInputs = new Map();
  const revisions = new Map();
  const deliveries = new Map();

  for (const scenario of fixture.events) {
    const supersedesRevisionRef = scenario.supersedes_alias === null
      ? null
      : revisionRefs.get(scenario.supersedes_alias);
    assert.notEqual(
      supersedesRevisionRef,
      undefined,
      `fixture supersession alias must already exist: ${scenario.supersedes_alias}`,
    );

    const revisionInput = {
      revision_kind: scenario.revision_kind,
      workspace_id: scenario.workspace_id,
      channel_id: scenario.channel_id,
      message_ts: scenario.message_ts,
      thread_ts: scenario.thread_ts,
      revision_ts: scenario.revision_ts,
      actor: {
        slack_user_id: scenario.slack_user_id,
        erp_account_ref: scenario.erp_account_ref,
      },
      source_metadata_digest: scenario.source_metadata_digest,
      attachment_pointers: deepClone(scenario.attachment_pointers),
      supersedes_revision_ref: supersedesRevisionRef,
    };
    const revision = createSlackRevision(revisionInput);
    const existingRef = revisionRefs.get(scenario.revision_alias);
    if (existingRef !== undefined) {
      assert.equal(existingRef, revision.revision_ref, "retry alias must preserve revision identity");
    } else {
      revisionRefs.set(scenario.revision_alias, revision.revision_ref);
      revisionInputs.set(scenario.revision_alias, revisionInput);
      revisions.set(scenario.revision_alias, revision);
    }
    deliveries.set(scenario.delivery_alias, {
      event_id: scenario.event_id,
      retry_num: scenario.retry_num,
      retry_reason: scenario.retry_reason,
      received_at: scenario.received_at,
      revision: revisionInput,
    });
  }
  return {
    revisionRefs,
    revisionInputs,
    revisions,
    deliveries,
    deliveryList: fixture.events.map((event) => deliveries.get(event.delivery_alias)),
  };
}

function materializePages(deliveries) {
  return fixture.backfill_pages.map((page) => ({
    page_id: page.page_id,
    previous_cursor_digest: page.previous_cursor_digest,
    next_cursor_digest: page.next_cursor_digest,
    deliveries: page.delivery_aliases.map((alias) => deliveries.get(alias)),
  }));
}

test("synthetic fixture parses and passes the strict JSON schema", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  assert.equal(validate(fixture), true, JSON.stringify(validate.errors, null, 2));

  const extraFieldFixture = deepClone(fixture);
  extraFieldFixture.events[0].message_body = "forbidden";
  assert.equal(validate(extraFieldFixture), false);

  const locatorFixture = deepClone(fixture);
  locatorFixture.binding.owner_approval_ref = "file:synthetic";
  assert.equal(validate(locatorFixture), false);
});

test("collector defaults OFF and enabled validation requires a private binding", () => {
  assert.deepEqual(assessSlackCollectorActivation(), {
    status: "OFF",
    coverage_state: "not_collected",
    gap_codes: ["feature_off"],
    network_enabled: false,
    write_enabled: false,
  });

  assertErrorCode(
    () => assessSlackCollectorActivation({ feature_enabled: true, runtime_binding: null }),
    "private_binding_required",
  );
  assertErrorCode(
    () => assessSlackCollectorActivation({
      feature_enabled: true,
      runtime_binding: fixture.binding,
    }),
    "private_binding_required",
  );

  const privateBinding = { ...fixture.binding, binding_origin: "private" };
  assert.deepEqual(
    assessSlackCollectorActivation({
      feature_enabled: true,
      runtime_binding: privateBinding,
    }),
    {
      status: "BOUND_READ_ONLY",
      coverage_state: "not_collected",
      gap_codes: ["live_transport_not_present"],
      network_enabled: false,
      write_enabled: false,
    },
  );
});

test("effective channel-ID binding allows one project and holds unsafe scopes", () => {
  const allowed = resolveSlackProjectScope({
    binding: fixture.binding,
    channel: fixture.channel_facts,
    occurred_at: "2026-07-03T00:00:00.000Z",
  });
  assert.equal(allowed.status, "ALLOW");
  assert.equal(allowed.project_code, fixture.binding.project_code);

  const renamed = {
    ...fixture.channel_facts,
    channel_name: "renamed-display-only",
  };
  assert.deepEqual(
    resolveSlackProjectScope({
      binding: fixture.binding,
      channel: renamed,
      occurred_at: "2026-07-03T00:00:00.000Z",
    }),
    allowed,
  );

  for (const holdCase of fixture.hold_cases) {
    const result = resolveSlackProjectScope({
      binding: fixture.binding,
      channel: holdCase.channel_facts,
      occurred_at: "2026-07-03T00:00:00.000Z",
    });
    assert.equal(result.status, "HOLD", holdCase.case_id);
    assert.equal(result.project_code, null, holdCase.case_id);
    assert.ok(result.hold_reasons.includes(holdCase.expected_hold_reason), holdCase.case_id);
  }

  const explicitConnectBinding = {
    ...fixture.binding,
    allowed_exceptions: ["slack_connect"],
  };
  const explicitConnectChannel = {
    ...fixture.channel_facts,
    slack_connect: true,
    explicit_rule_ref: "rule:synthetic-connect",
  };
  assert.equal(
    resolveSlackProjectScope({
      binding: explicitConnectBinding,
      channel: explicitConnectChannel,
      occurred_at: "2026-07-03T00:00:00.000Z",
    }).status,
    "ALLOW",
  );

  assert.ok(resolveSlackProjectScope({
    binding: fixture.binding,
    channel: fixture.channel_facts,
    occurred_at: "2026-06-30T23:59:59.999Z",
  }).hold_reasons.includes("outside_effective_window"));
});

test("message identity excludes delivery and retry evidence", () => {
  const materialized = materializeFixtureEvents();
  const identity = createSlackMessageIdentity({
    workspace_id: fixture.binding.workspace_id,
    channel_id: fixture.binding.channel_id,
    message_ts: fixture.events[0].message_ts,
  });
  assert.equal(identity.message_ref, materialized.revisions.get("root").message_ref);

  const receipts = dedupeSlackDeliveries(materialized.deliveryList);
  assert.equal(receipts.length, 5);
  const rootReceipt = receipts.find((receipt) => receipt.event_id === "Ev00000001");
  assert.equal(rootReceipt.attempt_count, 2);
  assert.deepEqual(rootReceipt.retry_numbers, [0, 1]);
  assert.equal(rootReceipt.revision_ref, materialized.revisionRefs.get("root"));

  const conflictingRetry = deepClone(materialized.deliveries.get("root-retry"));
  conflictingRetry.revision = materialized.revisionInputs.get("reply");
  assertErrorCode(
    () => dedupeSlackDeliveries([
      materialized.deliveries.get("root-delivery"),
      conflictingRetry,
    ]),
    "delivery_retry_conflict",
  );

  const changedAttemptTime = deepClone(materialized.deliveries.get("root-retry"));
  changedAttemptTime.received_at = "2026-07-03T00:00:01.200Z";
  assertErrorCode(
    () => dedupeSlackDeliveries([
      materialized.deliveries.get("root-retry"),
      changedAttemptTime,
    ]),
    "delivery_retry_evidence_conflict",
  );
});

test("message, reply, edit, delete, and tombstone replay is append-only", () => {
  const materialized = materializeFixtureEvents();
  const forward = replaySlackDeliveries({ deliveries: materialized.deliveryList });
  const reversed = replaySlackDeliveries({ deliveries: [...materialized.deliveryList].reverse() });

  assert.equal(forward.revisions.length, 5);
  assert.equal(forward.delivery_receipts.length, 5);
  assert.equal(forward.generation_digest, reversed.generation_digest);
  assert.deepEqual(
    forward.revisions.map((revision) => revision.revision_ref),
    reversed.revisions.map((revision) => revision.revision_ref),
  );
  assert.deepEqual(
    new Set(forward.revisions.map((revision) => revision.revision_kind)),
    new Set(["message", "reply", "edit", "delete", "tombstone"]),
  );

  const root = materialized.revisions.get("root");
  const reply = materialized.revisions.get("reply");
  const tombstone = materialized.revisions.get("tombstone");
  assert.notEqual(root.message_ref, reply.message_ref);
  assert.equal(reply.thread_ts, root.message_ts);
  assert.equal(root.actor.erp_account_ref, null);
  assert.equal(tombstone.supersedes_revision_ref, materialized.revisionRefs.get("delete"));

  const crossMessageEdit = createSlackRevision({
    ...materialized.revisionInputs.get("edit"),
    message_ts: reply.message_ts,
    thread_ts: reply.thread_ts,
    revision_ts: "1720000000.000350",
    supersedes_revision_ref: root.revision_ref,
  });
  assertErrorCode(
    () => validateSlackRevisionCollection([root, reply, crossMessageEdit]),
    "cross_message_supersession",
  );
});

test("attachment records remain pointers and reject locators, bytes, and unknown payload fields", () => {
  const materialized = materializeFixtureEvents();
  const rootInput = materialized.revisionInputs.get("root");
  const root = createSlackRevision(rootInput);
  assert.deepEqual(root.attachment_pointers, [{
    file_id: "F00000001",
    pointer_ref: "slack-file:F00000001",
    content_sha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    size_bytes: 128,
  }]);

  const locatorAttachment = {
    ...rootInput.attachment_pointers[0],
    pointer_ref: "file://synthetic",
  };
  assertErrorCode(
    () => createSlackRevision({
      ...rootInput,
      attachment_pointers: [locatorAttachment],
    }),
    "safe_ref_required",
  );

  const byteBearingAttachment = {
    ...rootInput.attachment_pointers[0],
    bytes: "00",
  };
  assertErrorCode(
    () => createSlackRevision({
      ...rootInput,
      attachment_pointers: [byteBearingAttachment],
    }),
    "extra_field",
  );

  assertErrorCode(
    () => createSlackRevision({
      ...rootInput,
      raw_body: "forbidden",
    }),
    "extra_field",
  );
});

test("bounded backfill advances only whole accepted pages and replays idempotently", () => {
  const materialized = materializeFixtureEvents();
  const pages = materializePages(materialized.deliveries);
  const initialCursor = createSlackBackfillCursor({
    workspace_id: fixture.binding.workspace_id,
    channel_id: fixture.binding.channel_id,
    binding_id: fixture.binding.binding_id,
    window_start: "2026-07-03T00:00:00.000Z",
    window_end: "2026-07-04T00:00:00.000Z",
  });

  const first = applyBoundedSlackBackfill({
    cursor: initialCursor,
    pages,
    max_pages: 1,
    max_events: 100,
  });
  assert.equal(first.processed_pages, 1);
  assert.equal(first.cursor.sequence, 1);
  assert.deepEqual(first.gap_codes, ["bounded_page_limit"]);
  assert.equal(first.revisions.length, 2);

  const second = applyBoundedSlackBackfill({
    cursor: first.cursor,
    pages: [pages[1]],
    existing_revisions: first.revisions,
    max_pages: 1,
    max_events: 100,
  });
  assert.equal(second.cursor.sequence, 2);
  assert.equal(second.revisions.length, 5);
  assert.deepEqual(second.gap_codes, []);

  assertErrorCode(
    () => applyBoundedSlackBackfill({
      cursor: first.cursor,
      pages: [],
      existing_revisions: [],
      max_pages: 1,
      max_events: 100,
    }),
    "cursor_generation_mismatch",
  );

  const crossPageEventConflict = deepClone(pages[1]);
  crossPageEventConflict.deliveries[0].event_id = "Ev00000001";
  assertErrorCode(
    () => applyBoundedSlackBackfill({
      cursor: first.cursor,
      pages: [crossPageEventConflict],
      existing_revisions: first.revisions,
      max_pages: 1,
      max_events: 100,
    }),
    "delivery_retry_conflict",
  );

  const replayed = applyBoundedSlackBackfill({
    cursor: second.cursor,
    pages: [pages[0]],
    existing_revisions: second.revisions,
    max_pages: 1,
    max_events: 100,
  });
  assert.equal(replayed.replayed_pages, 1);
  assert.deepEqual(replayed.cursor, second.cursor);

  const boundedByEvents = applyBoundedSlackBackfill({
    cursor: initialCursor,
    pages: [pages[0]],
    max_pages: 10,
    max_events: 2,
  });
  assert.equal(boundedByEvents.processed_pages, 0);
  assert.deepEqual(boundedByEvents.cursor, initialCursor);
  assert.deepEqual(boundedByEvents.gap_codes, ["bounded_event_limit"]);

  const changedAcceptedPage = deepClone(pages[0]);
  changedAcceptedPage.next_cursor_digest = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
  assertErrorCode(
    () => applyBoundedSlackBackfill({
      cursor: second.cursor,
      pages: [changedAcceptedPage],
      existing_revisions: second.revisions,
      max_pages: 1,
      max_events: 100,
    }),
    "accepted_page_conflict",
  );

  const cursorSnapshot = deepClone(initialCursor);
  const brokenChainPage = {
    ...pages[0],
    previous_cursor_digest: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  };
  assertErrorCode(
    () => applyBoundedSlackBackfill({
      cursor: initialCursor,
      pages: [brokenChainPage],
      max_pages: 1,
      max_events: 100,
    }),
    "backfill_cursor_chain_mismatch",
  );
  assert.deepEqual(initialCursor, cursorSnapshot);

  const wrongChannelPage = deepClone(pages[0]);
  wrongChannelPage.page_id = "page-wrong-channel";
  wrongChannelPage.deliveries = [wrongChannelPage.deliveries[0]];
  wrongChannelPage.deliveries[0].revision.channel_id = "C00000002";
  assertErrorCode(
    () => applyBoundedSlackBackfill({
      cursor: initialCursor,
      pages: [wrongChannelPage],
      max_pages: 1,
      max_events: 100,
    }),
    "backfill_scope_mismatch",
  );
});

test("coverage receipts enforce the exact shared six-state matrix", () => {
  const materialized = materializeFixtureEvents();
  const seenStates = new Set();
  for (const coverageCase of fixture.coverage_cases) {
    const receipt = createSlackCoverageReceipt({
      workspace_id: fixture.binding.workspace_id,
      channel_id: fixture.binding.channel_id,
      binding_id: fixture.binding.binding_id,
      project_code: fixture.binding.project_code,
      window_start: "2026-07-03T00:00:00.000Z",
      window_end: "2026-07-04T00:00:00.000Z",
      state: coverageCase.state,
      event_count: coverageCase.event_count,
      gap_codes: coverageCase.gap_codes,
      applicability_ref: coverageCase.applicability_ref,
      revision_refs: coverageCase.revision_aliases.map((alias) => materialized.revisionRefs.get(alias)),
    });
    validateSlackCoverageReceipt(receipt);
    seenStates.add(receipt.state);
    assert.equal(receipt.raw_payload_copied, false);
  }
  assert.deepEqual(seenStates, new Set(SLACK_HISTORY_COVERAGE_STATES));

  assertErrorCode(
    () => createSlackCoverageReceipt({
      workspace_id: fixture.binding.workspace_id,
      channel_id: fixture.binding.channel_id,
      binding_id: fixture.binding.binding_id,
      project_code: fixture.binding.project_code,
      window_start: "2026-07-03T00:00:00.000Z",
      window_end: "2026-07-04T00:00:00.000Z",
      state: "complete_no_events",
      event_count: 1,
      gap_codes: [],
      applicability_ref: null,
      revision_refs: [],
    }),
    "coverage_matrix_invalid",
  );
});

test("public fixture and runtime module have no live transport or private locator", async () => {
  assert.doesNotMatch(
    fixtureText,
    /(?:message_body|access_token|client_secret|credential|https?:\/\/|[A-Za-z]:\\|\/Users\/)/iu,
  );

  const moduleText = await readFile(modulePath, "utf8");
  assert.doesNotMatch(moduleText, /from\s+["'](?:node:fs|node:http|node:https|@slack\/|slack-sdk)/u);
  assert.doesNotMatch(moduleText, /\b(?:fetch|axios|WebSocket|createWriteStream|writeFile)\s*\(/u);
});
