// Head window and tail anchoring for the Slack continuous ingress runner.
//
// The tail walk pages backward from the provider's newest page. Before this
// slice a channel whose stored cursor landed on a page accepted by an earlier
// walk replayed that page on every run and never advanced (P26-014, P24-049,
// P23-043 stalled between 2026-08-07 and 2026-09-04), and a channel that had
// reached the provider end restarted a full walk whenever its newest page
// changed. These tests pin the replacement contract with the synthetic
// transport: a head pass that pulls only messages newer than the channel
// watermark, a tail that steps over replayed pages mid-walk, and a tail that
// stays anchored at the newest page once the walk is complete.
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256Canonical } from "../shared/project_history_envelope.mjs";
import {
  digestSlackContinuousBinding,
  runSlackContinuousIngress,
} from "./slack_continuous_runner.mjs";
import { createSyntheticSlackTransport } from "./slack_transport.mjs";

async function makeBinding() {
  const parent = await mkdtemp(path.join(os.tmpdir(), "soulforge-slack-head-"));
  const privateRoot = path.join(parent, "private-owner");
  return {
    schema_version: "soulforge.slack_continuous.binding.v1",
    feature_enabled: false,
    binding_id: "binding:slack:project-head",
    workspace_id: "T00000001",
    channel_id: "C00000001",
    project_code: "P01-001",
    channel: {
      kind: "project",
      visibility: "public",
      is_shared: false,
      is_ext_shared: false,
      is_archived: false,
      is_member: true,
    },
    credentials: {
      app_token_env: "SLACK_APP_TOKEN",
      bot_token_env: "SLACK_BOT_TOKEN",
      app_token_file: null,
      bot_token_file: null,
    },
    attachment_policy: {
      feature_enabled: false,
      custody_root: path.join(privateRoot, "slack-custody", "attachments"),
      max_files_per_message: 4,
      max_file_bytes: 1_048_576,
      max_total_bytes: 2_097_152,
      allowed_mime_types: ["image/png"],
      allowed_file_types: ["png"],
      timeout_ms: 1_000,
      max_retries: 2,
      max_retry_after_seconds: 2,
    },
    private_root: privateRoot,
    data_root: path.join(privateRoot, "slack-custody"),
    forbidden_roots: [path.join(parent, "public-runtime")],
    writer: {
      authority_id: "writer:synthetic-head",
      epoch: 1,
    },
  };
}

// Records are listed newest first, the way the provider returns a page.
function message(index) {
  const ts = `1720000${String(index).padStart(3, "0")}.000100`;
  return {
    event_id: `Ev${String(index).padStart(8, "0")}`,
    retry_num: 0,
    retry_reason: null,
    received_at: new Date(Number.parseFloat(ts) * 1000).toISOString(),
    workspace_id: "T00000001",
    channel_id: "C00000001",
    channel_kind: "project",
    is_private: false,
    is_shared: false,
    is_ext_shared: false,
    is_archived: false,
    is_member: true,
    source_refs: [`slack-event:Ev${String(index).padStart(8, "0")}`],
    raw_event: {
      type: "message",
      subtype: null,
      ts,
      user: "U00000001",
      text: `private synthetic body ${index}`,
    },
  };
}

function newestFirst(indices) {
  return [...indices].sort((left, right) => right - left).map(message);
}

function statePath(binding) {
  return path.join(binding.data_root, "state", "slack-continuous.json");
}

async function readState(binding) {
  return JSON.parse(await readFile(statePath(binding), "utf8"));
}

function run(binding, records, {
  pass = "tail",
  max_events: maxEvents = 100,
  transport = null,
} = {}) {
  return runSlackContinuousIngress({
    binding,
    expected_binding_digest: digestSlackContinuousBinding(binding),
    writer_authority_id: binding.writer.authority_id,
    writer_epoch: binding.writer.epoch,
    transport: transport ?? createSyntheticSlackTransport(records),
    dry_run: false,
    max_events: maxEvents,
    pass,
  });
}

function scriptedPageTransport({
  label,
  expected_cursor: expectedCursor = null,
  expected_oldest: expectedOldest = null,
  records,
  next_cursor: nextCursor = null,
}) {
  return {
    kind: "synthetic",
    async pull({ cursor_token: cursorToken, oldest }) {
      assert.equal(cursorToken, expectedCursor, `${label}: cursor`);
      assert.equal(oldest, expectedOldest, `${label}: oldest`);
      return {
        page_id: `scripted-page:${label}`,
        previous_cursor_digest: cursorToken === null ? null : sha256Canonical(cursorToken),
        next_cursor_digest: nextCursor === null ? null : sha256Canonical(nextCursor),
        next_cursor_token: nextCursor,
        records,
      };
    },
  };
}

test("head pass pulls only messages newer than the watermark and the anchored tail never restarts a walk", async () => {
  const binding = await makeBinding();

  // Run 1: the first tail page (provider end reached) defines the watermark.
  const first = await run(binding, newestFirst([1, 2, 3]));
  assert.equal(first.pass, "tail");
  assert.equal(first.processed_pages, 1);
  assert.equal(first.revision_count, 3);
  let state = await readState(binding);
  assert.equal(state.provider_cursor_token, null);
  assert.deepEqual(state.head, { latest_ts: message(3).raw_event.ts, chain: null });

  // Two messages arrive. The head pass asks for messages newer than the
  // watermark only, so the three retained messages are not pulled again.
  const arrived = newestFirst([1, 2, 3, 4, 5]);
  const head = await run(binding, arrived, { pass: "head" });
  assert.equal(head.pass, "head");
  assert.equal(head.skipped, null);
  assert.equal(head.pulled_count, 2);
  assert.equal(head.accepted_count, 2);
  assert.equal(head.processed_pages, 1);
  assert.equal(head.revision_count, 5);
  state = await readState(binding);
  assert.equal(state.head.latest_ts, message(5).raw_event.ts);
  assert.equal(state.head.chain, null);
  assert.equal(state.provider_cursor_token, null, "the head pass does not touch the tail cursor");
  assert.equal(state.cursor.provider_cursor_digest, null);
  assert.equal(state.cursor.accepted_pages.length, 2);

  // The anchored tail re-reads the newest page: it changed, so the page is
  // accepted, every delivery replays its retained revision, and the token
  // stays null instead of starting a walk through the older pages.
  const tail = await run(binding, arrived, { pass: "tail", max_events: 2 });
  assert.equal(tail.processed_pages, 1);
  assert.equal(tail.revision_count, 5);
  assert.equal(tail.cursor_advanced, false);
  state = await readState(binding);
  assert.equal(state.provider_cursor_token, null);
  assert.equal(state.cursor.provider_cursor_digest, null);
  assert.equal(state.cursor.accepted_pages.length, 3);

  // Unchanged newest page: replay, nothing written.
  const before = await stat(statePath(binding));
  const again = await run(binding, arrived, { pass: "tail", max_events: 2 });
  assert.equal(again.replayed_pages, 1);
  assert.equal(again.processed_pages, 0);
  assert.equal(again.cursor_advanced, false);
  assert.equal(again.private_writes, 0);
  const after = await stat(statePath(binding));
  assert.equal(after.mtimeMs, before.mtimeMs);
});

test("head pass with nothing new pulls once and writes nothing", async () => {
  const binding = await makeBinding();
  const records = newestFirst([1, 2]);
  await run(binding, records);
  const before = await readFile(statePath(binding), "utf8");
  const head = await run(binding, records, { pass: "head" });
  assert.equal(head.skipped, "head_empty");
  assert.equal(head.pulled_count, 0);
  assert.equal(head.processed_pages, 0);
  assert.equal(head.private_writes, 0);
  assert.equal(head.state_digest, sha256Canonical(JSON.parse(before)));
  assert.equal(await readFile(statePath(binding), "utf8"), before);
});

test("head pass is skipped until the tail has defined a watermark", async () => {
  const binding = await makeBinding();
  const head = await run(binding, newestFirst([1]), { pass: "head" });
  assert.equal(head.skipped, "head_no_watermark");
  assert.equal(head.pulled_count, 0);
  assert.equal(head.network_used, false);
  await assert.rejects(stat(statePath(binding)), { code: "ENOENT" });
});

test("a head window larger than one page continues through its own chain and closes at the window start", async () => {
  const binding = await makeBinding();
  await run(binding, newestFirst([1]));
  const arrived = newestFirst([1, 2, 3, 4, 5, 6]);

  const page1 = await run(binding, arrived, { pass: "head", max_events: 2 });
  assert.deepEqual([page1.pulled_count, page1.accepted_count, page1.revision_count], [2, 2, 3]);
  let state = await readState(binding);
  assert.equal(state.head.latest_ts, message(6).raw_event.ts, "the watermark moves with the newest page");
  assert.deepEqual(state.head.chain, {
    oldest: message(1).raw_event.ts,
    provider_cursor_token: "synthetic:2",
    provider_cursor_digest: sha256Canonical("synthetic:2"),
  });

  const page2 = await run(binding, arrived, { pass: "head", max_events: 2 });
  assert.deepEqual([page2.pulled_count, page2.revision_count], [2, 5]);
  state = await readState(binding);
  assert.equal(state.head.chain.provider_cursor_token, "synthetic:4");
  assert.equal(state.head.chain.oldest, message(1).raw_event.ts, "the window start is fixed for the chain");

  const page3 = await run(binding, arrived, { pass: "head", max_events: 2 });
  assert.deepEqual([page3.pulled_count, page3.revision_count], [1, 6]);
  state = await readState(binding);
  assert.equal(state.head.chain, null, "the provider end of the window closes the chain");
  assert.equal(state.cursor.accepted_pages.length, 4);
  assert.equal(state.provider_cursor_token, null);

  const done = await run(binding, arrived, { pass: "head", max_events: 2 });
  assert.equal(done.skipped, "head_empty");
  assert.equal(done.private_writes, 0);
  const uniqueRefs = new Set(state.revisions.map((revision) => revision.revision_ref));
  assert.equal(uniqueRefs.size, 6, "no message is retained twice");
});

test("an anchored tail cannot move the watermark past arrivals omitted by an open head chain", async () => {
  const binding = await makeBinding();
  await run(binding, newestFirst([1]));

  const firstHeadCursor = "head-before-5";
  await run(binding, null, {
    pass: "head",
    max_events: 2,
    transport: scriptedPageTransport({
      label: "open-head-6-5",
      expected_oldest: message(1).raw_event.ts,
      records: newestFirst([5, 6]),
      next_cursor: firstHeadCursor,
    }),
  });
  let state = await readState(binding);
  assert.equal(state.head.latest_ts, message(6).raw_event.ts);
  assert.equal(state.head.chain.provider_cursor_token, firstHeadCursor);

  // New messages arrive after the first head page. The anchored tail sees only
  // the newest page; 7 and 8 remain solely the head window's responsibility.
  await run(binding, null, {
    max_events: 2,
    transport: scriptedPageTransport({
      label: "anchored-tail-10-9",
      records: newestFirst([9, 10]),
      next_cursor: "tail-before-9",
    }),
  });
  state = await readState(binding);
  assert.equal(
    state.head.latest_ts,
    message(6).raw_event.ts,
    "tail must not advance the head-owned watermark",
  );
  assert.equal(state.head.chain.provider_cursor_token, firstHeadCursor);

  const secondHeadCursor = "head-before-3";
  await run(binding, null, {
    pass: "head",
    max_events: 2,
    transport: scriptedPageTransport({
      label: "resume-head-4-3",
      expected_cursor: firstHeadCursor,
      expected_oldest: message(1).raw_event.ts,
      records: newestFirst([3, 4]),
      next_cursor: secondHeadCursor,
    }),
  });
  await run(binding, null, {
    pass: "head",
    max_events: 2,
    transport: scriptedPageTransport({
      label: "resume-head-2",
      expected_cursor: secondHeadCursor,
      expected_oldest: message(1).raw_event.ts,
      records: newestFirst([2]),
    }),
  });
  state = await readState(binding);
  assert.equal(state.head.latest_ts, message(6).raw_event.ts);
  assert.equal(state.head.chain, null);

  await run(binding, null, {
    pass: "head",
    max_events: 2,
    transport: scriptedPageTransport({
      label: "next-head-8-7",
      expected_oldest: message(6).raw_event.ts,
      records: newestFirst([7, 8]),
    }),
  });
  const retained = (await readState(binding)).revisions
    .map((revision) => revision.message_ts)
    .sort();
  assert.deepEqual(retained, newestFirst([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    .map((record) => record.raw_event.ts)
    .sort());
});

test("an anchored tail after an empty head probe leaves deeper arrivals discoverable", async () => {
  const binding = await makeBinding();
  await run(binding, newestFirst([1]));

  const empty = await run(binding, newestFirst([1]), { pass: "head", max_events: 2 });
  assert.equal(empty.skipped, "head_empty");

  // Four messages arrive between the empty head probe and the tail. The
  // anchored tail sees only the newest page, so 2 and 3 must remain inside the
  // next head window instead of being skipped by a tail-owned watermark move.
  const arrived = newestFirst([1, 2, 3, 4, 5]);
  await run(binding, arrived, { max_events: 2 });
  let state = await readState(binding);
  assert.equal(
    state.head.latest_ts,
    message(1).raw_event.ts,
    "tail must preserve the watermark from the completed head probe",
  );
  assert.deepEqual(
    state.revisions.map((revision) => revision.message_ts).sort(),
    [message(1).raw_event.ts, message(4).raw_event.ts, message(5).raw_event.ts].sort(),
  );

  await run(binding, arrived, { pass: "head", max_events: 2 });
  await run(binding, arrived, { pass: "head", max_events: 2 });
  state = await readState(binding);
  assert.deepEqual(
    state.revisions.map((revision) => revision.message_ts).sort(),
    arrived.map((record) => record.raw_event.ts).sort(),
  );
});

test("a tail cursor stalled on an already accepted page steps over it until the provider end", async () => {
  const binding = await makeBinding();
  const records = newestFirst([1, 2, 3, 4, 5, 6]);
  // Walk the whole history in three pages of two.
  for (let index = 0; index < 3; index += 1) await run(binding, records, { max_events: 2 });
  let state = await readState(binding);
  assert.equal(state.provider_cursor_token, null);
  assert.equal(state.cursor.accepted_pages.length, 3);

  // Reproduce the stall: point the stored cursor at the second page, which
  // this walk already accepted (the shape left behind by an aligned re-walk).
  state.provider_cursor_token = "synthetic:2";
  state.cursor.provider_cursor_digest = sha256Canonical("synthetic:2");
  await writeFile(statePath(binding), JSON.stringify(state));

  const first = await run(binding, records, { max_events: 2 });
  assert.equal(first.replayed_pages, 1);
  assert.equal(first.processed_pages, 0);
  assert.equal(first.cursor_advanced, true);
  assert.equal(first.private_writes, 1);
  state = await readState(binding);
  assert.equal(state.provider_cursor_token, "synthetic:4");
  assert.equal(state.cursor.provider_cursor_digest, sha256Canonical("synthetic:4"));

  const second = await run(binding, records, { max_events: 2 });
  assert.equal(second.replayed_pages, 1);
  assert.equal(second.cursor_advanced, true);
  state = await readState(binding);
  assert.equal(state.provider_cursor_token, null, "a replayed last page ends the walk");
  assert.equal(state.cursor.provider_cursor_digest, null);
  assert.equal(state.cursor.accepted_pages.length, 3, "stepping over pages accepts nothing twice");

  const anchored = await run(binding, records, { max_events: 2 });
  assert.equal(anchored.replayed_pages, 1);
  assert.equal(anchored.cursor_advanced, false);
  assert.equal(anchored.private_writes, 0);
});

test("a state written before the head window loads with its watermark derived from retained revisions", async () => {
  const binding = await makeBinding();
  await run(binding, newestFirst([1, 2]));
  const legacy = await readState(binding);
  assert.equal(legacy.head.latest_ts, message(2).raw_event.ts);
  delete legacy.head;
  await writeFile(statePath(binding), JSON.stringify(legacy));

  const head = await run(binding, newestFirst([1, 2, 3]), { pass: "head" });
  assert.equal(head.skipped, null);
  assert.equal(head.pulled_count, 1);
  assert.equal(head.revision_count, 3);
  const migrated = await readState(binding);
  assert.deepEqual(migrated.head, { latest_ts: message(3).raw_event.ts, chain: null });

  const broken = await readState(binding);
  broken.head = { latest_ts: "not-a-timestamp", chain: null };
  await writeFile(statePath(binding), JSON.stringify(broken));
  await assert.rejects(
    run(binding, newestFirst([1, 2, 3]), { pass: "head" }),
    (error) => error?.code === "state_head_invalid",
  );
});

test("the runner rejects an unknown pass before touching the transport", async () => {
  const binding = await makeBinding();
  await assert.rejects(
    run(binding, newestFirst([1]), { pass: "sideways" }),
    (error) => error?.code === "pass_invalid",
  );
});
