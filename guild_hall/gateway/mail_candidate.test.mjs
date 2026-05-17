import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  buildMailIntakeRequest,
  listMailCandidates,
  promoteMailCandidate,
  triageMailCandidate,
} from "./mail_candidate.mjs";

const cliPath = fileURLToPath(new URL("./cli.mjs", import.meta.url));
const execFile = promisify(execFileCallback);

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

test("triageMailCandidate annotates project routing from private binding without copying raw payload", async () => {
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
  const bindingFile = path.join(repoRoot, "_workmeta", "system", "bindings", "mail_project_router.yaml");
  const candidate = {
    ...sampleCandidate(),
    body_text: "private body must not be copied",
    body_html: "<html>private html</html>",
    raw: { body: "raw private body" },
    attachments: [
      {
        name: "private.xlsx",
        url: "https://example.test/private.xlsx",
        local_path: "/private/path/private.xlsx",
      },
    ],
  };

  await writeJson(candidateFile, candidate);
  await writeText(
    bindingFile,
    [
      "version: mail_project_router.v1",
      "routes:",
      "  - route_id: pdr_company",
      "    project_code: PDR",
      "    stage: intake",
      "    confidence: 0.82",
      "    match:",
      "      subject_includes: [PDR]",
      "      from_domains: [example.test]",
      "      sources: [hiworks]",
      "      workspaces: [company]",
      "      classification_buckets: [mail]",
      "      attachment_types: [reference_attachment]",
      "",
    ].join("\n"),
  );

  const result = await triageMailCandidate({
    repoRoot,
    candidateFile,
    bindingFile,
    now: new Date("2026-03-19T00:25:00+00:00"),
  });

  const updatedCandidate = JSON.parse(await readFile(candidateFile, "utf8"));
  const suggestion = updatedCandidate.business_review.project_routing_suggestion;
  const renderedSuggestion = JSON.stringify(suggestion);
  const renderedResult = JSON.stringify(result);

  assert.equal(updatedCandidate.status, "pending_review");
  assert.equal(updatedCandidate.business_review.status, "triaged");
  assert.equal(updatedCandidate.business_review.next_action, "review_project_routing_suggestion");
  assert.equal(suggestion.schema_version, "mail_project_routing_suggestion.v1");
  assert.equal(suggestion.status, "suggested");
  assert.equal(suggestion.project_code, "PDR");
  assert.equal(suggestion.stage, "intake");
  assert.equal(suggestion.route_id, "pdr_company");
  assert.equal(suggestion.confidence, 0.82);
  assert.deepEqual(suggestion.matched_on, [
    "attachment_types",
    "classification_bucket",
    "from",
    "source",
    "subject",
    "workspace",
  ]);
  assert.equal(suggestion.binding_ref, "_workmeta/system/bindings/mail_project_router.yaml");
  assert.equal(suggestion.triaged_at, "2026-03-19T00:25:00.000Z");

  for (const rendered of [renderedSuggestion, renderedResult]) {
    assert(!rendered.includes("private body"));
    assert(!rendered.includes("private html"));
    assert(!rendered.includes("raw private"));
    assert(!rendered.includes("private.xlsx"));
    assert(!rendered.includes("example.test/private.xlsx"));
    assert(!rendered.includes("/private/path"));
  }
});

test("triageMailCandidate ignores private routing predicates by default", async () => {
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
  const bindingFile = path.join(repoRoot, "_workmeta", "system", "bindings", "mail_project_router.yaml");

  await writeJson(candidateFile, sampleCandidate());
  await writeText(bindingFile, privateDeepBindingText());

  const result = await triageMailCandidate({
    repoRoot,
    candidateFile,
    bindingFile,
    now: new Date("2026-03-19T00:25:00+00:00"),
  });

  assert.equal(result.routing_suggestion.status, "unmatched");
  assert.equal(result.routing_suggestion.project_code, null);
  assert.equal(result.routing_suggestion.body_safe, true);
  assert.deepEqual(result.routing_suggestion.matched_on, []);
  assert.deepEqual(result.routing_suggestion.reason_codes, ["no_route_matched"]);
});

test("triageMailCandidate ignores normalized private routing predicates by default", async () => {
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
  const bindingFile = path.join(repoRoot, "_workmeta", "system", "bindings", "mail_project_router.yaml");

  await writeJson(candidateFile, sampleCandidate());
  await writeJsonl(eventFile, [
    {
      event_id: "hiworks_evt_candidate_001",
      source: "hiworks",
      provider_message_id: "provider-message-001",
      received_at: "2026-03-19T00:15:00+00:00",
      body_text: "private OPENCLAW 42 text must not be copied",
      attachments: [{ type: "reference_attachment", name: "openclaw_42_plan.pdf" }],
    },
  ]);
  await writeText(
    bindingFile,
    [
      "version: mail_project_router.v1",
      "routes:",
      "  - route_id: openclaw_exact",
      "    project_code: OPENCLAW_EXACT",
      "    match:",
      "      private_normalized_exact_keywords: [OPENCLAW-42]",
      "",
    ].join("\n"),
  );

  const result = await triageMailCandidate({
    repoRoot,
    candidateFile,
    bindingFile,
    now: new Date("2026-03-19T00:25:00+00:00"),
  });
  const updatedCandidate = JSON.parse(await readFile(candidateFile, "utf8"));

  assert.equal(result.routing_suggestion.status, "unmatched");
  assert.equal(result.routing_suggestion.project_code, null);
  assert.deepEqual(result.routing_suggestion.matched_on, []);
  assert.deepEqual(result.routing_suggestion.reason_codes, ["no_route_matched"]);
  for (const rendered of [JSON.stringify(result), JSON.stringify(updatedCandidate)]) {
    assert(!rendered.includes("OPENCLAW 42"));
    assert(!rendered.includes("openclaw_42_plan.pdf"));
  }
});

test("triageMailCandidate private-deep routes on body html and attachment names without leaking raw content", async () => {
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
  const bindingFile = path.join(repoRoot, "_workmeta", "system", "bindings", "mail_project_router.yaml");

  await writeJson(candidateFile, sampleCandidate());
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
      cc: [],
      received_at: "2026-03-19T00:15:00+00:00",
      body_text: "private exact body signal RFQ-OMEGA-77 must not be copied",
      body_html: "<html><body>Private HTML Portal Alpha must not be copied</body></html>",
      attachments: [
        {
          type: "reference_attachment",
          name: "PDR-private-layout-v3.xlsx",
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          url: "https://example.test/PDR-private-layout-v3.xlsx",
          local_path: "/private/path/PDR-private-layout-v3.xlsx",
        },
      ],
      raw: { body: "raw private body must not appear" },
      ingested_at: "2026-03-19T00:16:00+00:00",
      ingest_status: "ok",
    },
  ]);
  await writeText(bindingFile, privateDeepBindingText());

  const result = await triageMailCandidate({
    repoRoot,
    candidateFile,
    bindingFile,
    now: new Date("2026-03-19T00:25:00+00:00"),
    privateDeep: true,
  });
  const updatedCandidate = JSON.parse(await readFile(candidateFile, "utf8"));
  const suggestion = updatedCandidate.business_review.project_routing_suggestion;

  assert.equal(result.status, "triaged");
  assert.equal(suggestion.status, "suggested");
  assert.equal(suggestion.project_code, "PDR_DEEP");
  assert.equal(suggestion.route_id, "pdr_private_deep");
  assert.equal(suggestion.confidence, 0.91);
  assert.equal(suggestion.next_action, "review_private_deep_project_routing");
  assert.equal(suggestion.body_safe, true);
  assert.deepEqual(suggestion.matched_on, ["attachment_mimes", "attachment_names", "body", "html"]);
  assert.deepEqual(suggestion.reason_codes, [
    "private_body_includes",
    "private_html_includes",
    "private_attachment_name_includes",
    "private_attachment_mimes",
  ]);

  for (const rendered of [JSON.stringify(result), JSON.stringify(updatedCandidate)]) {
    assert(!rendered.includes("RFQ-OMEGA-77"));
    assert(!rendered.includes("Portal Alpha"));
    assert(!rendered.includes("PDR-private-layout-v3.xlsx"));
    assert(!rendered.includes("example.test/PDR-private-layout-v3.xlsx"));
    assert(!rendered.includes("/private/path"));
    assert(!rendered.includes("raw private body"));
  }
});

test("triageMailCandidate private-deep matches normalized exact keywords without leaking raw content", async () => {
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
  const bindingFile = path.join(repoRoot, "_workmeta", "system", "bindings", "mail_project_router.yaml");

  await writeJson(candidateFile, sampleCandidate());
  await writeJsonl(eventFile, [
    {
      event_id: "hiworks_evt_candidate_001",
      source: "hiworks",
      provider_message_id: "provider-message-001",
      received_at: "2026-03-19T00:15:00+00:00",
      body_text: "private body mentions OPENCLAW 42 but must not be copied",
      body_html: "<html><body>Private html mentions openclaw_42</body></html>",
      attachments: [
        {
          type: "reference_attachment",
          name: "openclaw_42_plan.pdf",
          mime: "application/pdf",
          url: "https://example.test/openclaw_42_plan.pdf",
          local_path: "/private/path/openclaw_42_plan.pdf",
        },
      ],
    },
  ]);
  await writeText(
    bindingFile,
    [
      "version: mail_project_router.v1",
      "routes:",
      "  - route_id: openclaw_near_miss",
      "    project_code: OPENCLAW_NEAR",
      "    match:",
      "      private_normalized_exact_keywords: [OPENCLAW-4]",
      "  - route_id: openclaw_exact",
      "    project_code: OPENCLAW_EXACT",
      "    stage: intake",
      "    next_action: review_private_deep_project_routing",
      "    match:",
      "      private_normalized_exact_keywords: [OPENCLAW-42]",
      "",
    ].join("\n"),
  );

  const result = await triageMailCandidate({
    repoRoot,
    candidateFile,
    bindingFile,
    now: new Date("2026-03-19T00:25:00+00:00"),
    privateDeep: true,
  });
  const updatedCandidate = JSON.parse(await readFile(candidateFile, "utf8"));
  const suggestion = updatedCandidate.business_review.project_routing_suggestion;

  assert.equal(suggestion.status, "suggested");
  assert.equal(suggestion.project_code, "OPENCLAW_EXACT");
  assert.equal(suggestion.route_id, "openclaw_exact");
  assert.deepEqual(suggestion.matched_on, ["attachment_names", "body", "html"]);
  assert.deepEqual(suggestion.reason_codes, ["private_normalized_exact_keywords"]);

  for (const rendered of [JSON.stringify(result), JSON.stringify(updatedCandidate)]) {
    assert(!rendered.includes("OPENCLAW 42"));
    assert(!rendered.includes("openclaw_42"));
    assert(!rendered.includes("openclaw_42_plan.pdf"));
    assert(!rendered.includes("example.test/openclaw_42_plan.pdf"));
    assert(!rendered.includes("/private/path"));
  }
});

test("triageMailCandidate private-deep matches normalized aliases without leaking raw content", async () => {
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
  const bindingFile = path.join(repoRoot, "_workmeta", "system", "bindings", "mail_project_router.yaml");

  await writeJson(candidateFile, sampleCandidate());
  await writeJsonl(eventFile, [
    {
      event_id: "hiworks_evt_candidate_001",
      source: "hiworks",
      provider_message_id: "provider-message-001",
      received_at: "2026-03-19T00:15:00+00:00",
      body_text: "private alias text says sf beta 7 but must not be copied",
      body_html: "<html><body>Private html says SF_BETA_7</body></html>",
      attachments: [
        {
          type: "reference_attachment",
          name: "sf-beta-7-layout.xlsx",
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          url: "https://example.test/sf-beta-7-layout.xlsx",
          local_path: "/private/path/sf-beta-7-layout.xlsx",
        },
      ],
    },
  ]);
  await writeText(
    bindingFile,
    [
      "version: mail_project_router.v1",
      "routes:",
      "  - route_id: sf_beta_alias",
      "    project_code: SF_BETA",
      "    stage: intake",
      "    next_action: review_private_deep_project_routing",
      "    match:",
      "      private_normalized_aliases: [SF-BETA-7]",
      "",
    ].join("\n"),
  );

  const result = await triageMailCandidate({
    repoRoot,
    candidateFile,
    bindingFile,
    now: new Date("2026-03-19T00:25:00+00:00"),
    privateDeep: true,
  });
  const updatedCandidate = JSON.parse(await readFile(candidateFile, "utf8"));
  const suggestion = updatedCandidate.business_review.project_routing_suggestion;

  assert.equal(suggestion.status, "suggested");
  assert.equal(suggestion.project_code, "SF_BETA");
  assert.equal(suggestion.route_id, "sf_beta_alias");
  assert.deepEqual(suggestion.matched_on, ["attachment_names", "body", "html"]);
  assert.deepEqual(suggestion.reason_codes, ["private_normalized_aliases"]);

  for (const rendered of [JSON.stringify(result), JSON.stringify(updatedCandidate)]) {
    assert(!rendered.includes("sf beta 7"));
    assert(!rendered.includes("SF_BETA_7"));
    assert(!rendered.includes("sf-beta-7-layout.xlsx"));
    assert(!rendered.includes("example.test/sf-beta-7-layout.xlsx"));
    assert(!rendered.includes("/private/path"));
  }
});

test("triage-mail-candidate CLI can triage all pending candidates", async () => {
  const repoRoot = await createRepoRoot();
  const queueRoot = path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate");
  const bindingFile = path.join(repoRoot, "_workmeta", "system", "bindings", "mail_project_router.yaml");
  const firstCandidateFile = path.join(queueRoot, "queue", "pending", "first.json");
  const secondCandidateFile = path.join(queueRoot, "queue", "pending", "second.json");

  await writeJson(firstCandidateFile, sampleCandidate());
  await writeJson(
    secondCandidateFile,
    {
      ...sampleCandidate({
        event_id: "hiworks_evt_candidate_002",
        source: "gmail",
        workspace: "personal",
      }),
      candidate_id: "mail_candidate_hiworks_evt_candidate_002",
    },
  );
  await writeText(
    bindingFile,
    [
      "router_defaults:",
      "  default_next_action: ask_owner",
      "rules:",
      "  - rule_id: company_pdr",
      "    project_code: PDR",
      "    rule_ref: _workmeta/system/bindings/rules/company_pdr.yaml",
      "    confidence_if_matched: hint",
      "    next_action_if_matched: hold_for_owner_review",
      "    match_policy:",
      "      exact_keywords: [PDR]",
      "      workspaces: [company]",
      "",
    ].join("\n"),
  );

  const { stdout } = await execFile(process.execPath, [
    cliPath,
    "triage-mail-candidate",
    "--all-pending",
    "--queue-root",
    queueRoot,
    "--binding-file",
    bindingFile,
  ]);
  const result = JSON.parse(stdout);
  const firstCandidate = JSON.parse(await readFile(firstCandidateFile, "utf8"));
  const secondCandidate = JSON.parse(await readFile(secondCandidateFile, "utf8"));

  assert.equal(result.status, "completed");
  assert.equal(result.candidate_count, 2);
  assert.equal(result.triaged, 2);
  assert.equal(result.skipped_invalid, 0);
  assert.equal(firstCandidate.business_review.project_routing_suggestion.status, "suggested");
  assert.equal(firstCandidate.business_review.project_routing_suggestion.project_code, "PDR");
  assert.equal(firstCandidate.business_review.project_routing_suggestion.routing_rule_ref, "_workmeta/system/bindings/rules/company_pdr.yaml");
  assert.equal(firstCandidate.business_review.project_routing_suggestion.confidence, "hint");
  assert.equal(firstCandidate.business_review.next_action, "hold_for_owner_review");
  assert.equal(secondCandidate.business_review.project_routing_suggestion.status, "unmatched");
  assert.equal(secondCandidate.business_review.project_routing_suggestion.project_code, null);
  assert.equal(secondCandidate.business_review.next_action, "ask_owner");
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

function privateDeepBindingText() {
  return [
    "version: mail_project_router.v1",
    "routes:",
    "  - route_id: pdr_private_deep",
    "    project_code: PDR_DEEP",
    "    stage: intake",
    "    confidence: 0.91",
    "    next_action: review_private_deep_project_routing",
    "    match:",
    "      private_body_includes: [RFQ-OMEGA-77]",
    "      private_html_includes: [Portal Alpha]",
    "      private_attachment_name_includes: [PDR-private-layout-v3.xlsx]",
    "      private_attachment_mimes:",
    "        - application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "",
  ].join("\n");
}

async function createRepoRoot() {
  return mkdtemp(path.join(os.tmpdir(), "soulforge-mail-candidate-"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

async function writeJsonl(filePath, rows) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}
