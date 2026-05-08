import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";

import {
  buildMailIntakeRequest,
  listMailCandidates,
  promoteMailCandidate,
} from "./mail_candidate.mjs";

test("buildMailIntakeRequest creates body-safe unknown monster request", () => {
  const candidate = sampleCandidate();
  const request = buildMailIntakeRequest(candidate, {
    provider_message_id: "<provider-001@example.test>",
    thread_id: "thread-private-id",
    to: [{ name: "Owner", address: "owner@example.test" }],
    cc: [{ name: "Reviewer", address: "reviewer@example.test" }],
    body_text: "private body must not be copied",
    body_html: "<html>private html</html>",
    raw: { body: "raw private body" },
    attachments: [
      {
        type: "reference_attachment",
        name: "private.xlsx",
        url: "https://example.test/private.xlsx",
        local_path: "/private/path/private.xlsx",
      },
    ],
  });
  const rendered = JSON.stringify(request);

  assert.equal(request.action, "mail_intake_request");
  assert.equal(request.event_id, "hiworks_evt_candidate_001");
  assert.equal(request.mailbox_id, "company_mailbox");
  assert.equal(request.provider_message_id, "<provider-001@example.test>");
  assert.equal(request.raw_ref, "guild_hall/state/gateway/mailbox/company/mail/raw/hiworks/2026/2026-03.jsonl#provider_message_id=<provider-001@example.test>");
  assert.equal(request.body_excerpt, null);
  assert.deepEqual(request.attachment_refs, []);
  assert.equal(request.monsters.length, 1);
  assert.equal(request.monsters[0].monster_family, "unknown_monster");
  assert.equal(request.monsters[0].work_pattern, "mail_candidate_review");
  assert.equal(request.monsters[0].dedupe_key, "mail:hiworks:hiworks_evt_candidate_001");

  assert(!rendered.includes("private body"));
  assert(!rendered.includes("private html"));
  assert(!rendered.includes("raw private"));
  assert(!rendered.includes("private.xlsx"));
  assert(!rendered.includes("example.test/private.xlsx"));
  assert(!rendered.includes("/private/path"));
});

test("promoteMailCandidate writes request and marks candidate promoted", async () => {
  const repoRoot = await createRepoRoot();
  const candidateFile = path.join(
    repoRoot,
    "guild_hall",
    "state",
    "gateway",
    "mail_candidate",
    "queue",
    "pending",
    "mail_candidate_hiworks_evt_candidate_001.json",
  );
  const eventFile = path.join(
    repoRoot,
    "guild_hall",
    "state",
    "gateway",
    "mailbox",
    "company",
    "mail",
    "events",
    "hiworks",
    "2026",
    "2026-03.jsonl",
  );
  const outputFile = path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate", "requests", "request.json");
  const candidate = sampleCandidate({
    event_file: "guild_hall/state/gateway/mailbox/company/mail/events/hiworks/2026/2026-03.jsonl",
  });

  await writeJson(candidateFile, candidate);
  await writeJsonl(eventFile, [
    {
      schema_version: "email.fetch.event.v1",
      event_id: "hiworks_evt_candidate_001",
      source: "hiworks",
      provider_message_id: "provider-message-001",
      thread_id: "thread-001",
      subject: "PDR 검토 요청",
      from: [{ name: "PM", address: "pm@example.test" }],
      to: [{ name: "Owner", address: "owner@example.test" }],
      cc: [{ name: "Reviewer", address: "reviewer@example.test" }],
      received_at: "2026-03-19T00:15:00+00:00",
      body_text: "private body must not be copied",
      body_html: "<html>private html</html>",
      attachments: [{ type: "reference_attachment", name: "private.xlsx", url: "https://example.test/private.xlsx" }],
      raw: { body: "raw private body" },
      ingested_at: "2026-03-19T00:16:00+00:00",
      ingest_status: "ok",
    },
  ]);

  const result = await promoteMailCandidate({
    repoRoot,
    candidateFile,
    outputFile,
    now: new Date("2026-03-19T00:20:00+00:00"),
  });

  const request = JSON.parse(await readFile(outputFile, "utf8"));
  const updatedCandidate = JSON.parse(await readFile(candidateFile, "utf8"));
  const pending = await listMailCandidates({
    repoRoot,
    queueRoot: path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate"),
  });
  const all = await listMailCandidates({
    repoRoot,
    queueRoot: path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate"),
    status: "",
  });

  assert.equal(result.status, "promoted");
  assert.equal(result.mail_intake_request_ref, "guild_hall/state/gateway/mail_candidate/requests/request.json");
  assert.equal(request.provider_message_id, "provider-message-001");
  assert.equal(request.thread_ref, "thread-001");
  assert.equal(updatedCandidate.status, "promoted_to_intake_request");
  assert.equal(updatedCandidate.business_review.intake_request_status, "created");
  assert.equal(updatedCandidate.business_review.intake_request_ref, "guild_hall/state/gateway/mail_candidate/requests/request.json");
  assert.equal(pending.length, 0);
  assert.equal(all.length, 1);
  assert.equal(all[0].status, "promoted_to_intake_request");
});

test("promoteMailCandidate rejects already promoted candidate unless forced", async () => {
  const repoRoot = await createRepoRoot();
  const candidateFile = path.join(repoRoot, "candidate.json");
  await writeJson(candidateFile, {
    ...sampleCandidate(),
    status: "promoted_to_intake_request",
  });

  await assert.rejects(
    promoteMailCandidate({ repoRoot, candidateFile, outputFile: path.join(repoRoot, "request.json") }),
    /candidate is not pending_review/,
  );
});

test("promoteMailCandidate requires the referenced mailbox event", async () => {
  const repoRoot = await createRepoRoot();
  const candidateFile = path.join(repoRoot, "candidate.json");
  await writeJson(candidateFile, sampleCandidate());

  await assert.rejects(
    promoteMailCandidate({
      repoRoot,
      candidateFile,
      outputFile: path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate", "requests", "request.json"),
    }),
    /source event file not found/,
  );
});

test("promoteMailCandidate keeps explicit output inside request state by default", async () => {
  const repoRoot = await createRepoRoot();
  const candidateFile = path.join(repoRoot, "candidate.json");
  await writeJson(candidateFile, sampleCandidate());

  await assert.rejects(
    promoteMailCandidate({
      repoRoot,
      candidateFile,
      outputFile: path.join(repoRoot, "tmp", "request.json"),
    }),
    /output file must stay under guild_hall\/state\/gateway\/mail_candidate\/requests/,
  );
});

test("promoteMailCandidate keeps source event under mailbox state", async () => {
  const repoRoot = await createRepoRoot();
  const candidateFile = path.join(repoRoot, "candidate.json");
  await writeJson(
    candidateFile,
    sampleCandidate({
      event_file: "docs/architecture/workspace/examples/guild_hall/state/gateway/mailbox/company/mail/events/hiworks/2026/2026-03.jsonl",
    }),
  );

  await assert.rejects(
    promoteMailCandidate({
      repoRoot,
      candidateFile,
      outputFile: path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate", "requests", "request.json"),
    }),
    /source event file must stay under guild_hall\/state\/gateway\/mailbox/,
  );
});

test("promoteMailCandidate requires matching mailbox event id", async () => {
  const repoRoot = await createRepoRoot();
  const candidateFile = path.join(repoRoot, "candidate.json");
  const eventFile = path.join(
    repoRoot,
    "guild_hall",
    "state",
    "gateway",
    "mailbox",
    "company",
    "mail",
    "events",
    "hiworks",
    "2026",
    "2026-03.jsonl",
  );
  await writeJson(candidateFile, sampleCandidate());
  await writeJsonl(eventFile, [
    {
      event_id: "different_event_id",
      source: "hiworks",
      provider_message_id: "provider-message-001",
      received_at: "2026-03-19T00:15:00+00:00",
    },
  ]);

  await assert.rejects(
    promoteMailCandidate({
      repoRoot,
      candidateFile,
      outputFile: path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate", "requests", "request.json"),
    }),
    /source event not found: hiworks_evt_candidate_001/,
  );
});

function sampleCandidate(overrides = {}) {
  return {
    schema_version: "mail_candidate.queue_item.v1",
    candidate_id: "mail_candidate_hiworks_evt_candidate_001",
    status: "pending_review",
    created_at: "2026-03-19T00:16:01+00:00",
    updated_at: "2026-03-19T00:16:01+00:00",
    created_by: "gateway_mail_fetch",
    review_reason: "fresh_mail_event",
    source_event: {
      event_id: "hiworks_evt_candidate_001",
      source: "hiworks",
      workspace: "company",
      event_file: "guild_hall/state/gateway/mailbox/company/mail/events/hiworks/2026/2026-03.jsonl",
      received_at: "2026-03-19T00:15:00+00:00",
      ingested_at: "2026-03-19T00:16:00+00:00",
      ...overrides,
    },
    mail_summary: {
      subject: "PDR 검토 요청",
      from: [{ name: "PM", address: "pm@example.test" }],
      to_count: 1,
      cc_count: 1,
      attachment_count: 1,
      attachment_types: ["reference_attachment"],
      classification: {
        bucket: "mail",
        reasons: [],
        ad_detected: false,
        blocked_attachment_count: 0,
      },
    },
    business_review: {
      required: true,
      status: "not_started",
      next_action: "review_for_mail_intake_request",
      intake_request_status: "not_created",
    },
  };
}

async function createRepoRoot() {
  return mkdtemp(path.join(os.tmpdir(), "soulforge-mail-candidate-"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonl(filePath, rows) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}
