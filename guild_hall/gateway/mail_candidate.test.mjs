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
  loadMailBodyExcerptIndex,
  mailBodyExcerptFromRecord,
  promoteMailCandidate,
  readMailBodyPreview,
  triageMailCandidate,
} from "./mail_candidate.mjs";
import {
  buildMailCandidateBacklogReport,
} from "./mail_candidate_backlog.mjs";

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

test("buildMailIntakeRequest preserves safe automation metadata only", () => {
  const baseCandidate = sampleCandidate();
  const candidate = {
    ...baseCandidate,
    mail_summary: {
      ...baseCandidate.mail_summary,
      attachment_count: 2,
      attachment_types: ["binary_attachment", "private-plan.xlsx"],
      classification: {
        bucket: "mail",
        label: "erp_task",
        reasons: ["business_review_ready"],
        blocked_attachment_count: 2,
      },
      route_hint_candidates: ["P25-057"],
    },
    business_review: {
      ...baseCandidate.business_review,
      status: "triaged",
      reason: "owner_triage",
      project_routing_suggestion: {
        schema_version: "mail_project_routing_suggestion.v1",
        status: "suggested",
        project_code: "P26-030",
        stage: "erp_entry",
        route_id: "p26030_owner",
        routing_rule_ref: "_workmeta/system/bindings/rules/p26030.yaml",
        confidence: 0.82,
        route_source: "metadata_triage",
        matched_on: ["classification_bucket", "subject"],
        reason_codes: ["owner_route"],
        route_hint_candidates: ["P26-030", "P25-057"],
      },
      owner_assignment_override: {
        assignee_id: "owner-a",
        assignee_label: "Owner A",
        reason_codes: ["owner_override"],
        source: "manual_triage",
        raw_body: "DO_NOT_COPY_BODY",
        attachment_name: "secret.xlsx",
      },
      suggested_assignee: {
        assignee_id: "erp-ops",
        assignee_label: "ERP Ops",
        source: "router",
      },
    },
  };

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
        name: "private-plan.xlsx",
        url: "https://example.test/private-plan.xlsx",
        local_path: "/private/path/private-plan.xlsx",
      },
    ],
  });
  const rendered = JSON.stringify(request);

  assert.equal(request.candidate_metadata.route_candidate, "P26-030");
  assert.equal(request.candidate_metadata.route_confidence, "review");
  assert.equal(request.candidate_metadata.route_suggestion_confidence, 0.82);
  assert.equal(request.candidate_metadata.route_source, "metadata_triage");
  assert.deepEqual(request.candidate_metadata.route_reason_codes, ["owner_route"]);
  assert.deepEqual(request.candidate_metadata.route_hint_candidates, ["P25-057", "P26-030"]);
  assert.equal(request.candidate_metadata.review_status, "triaged");
  assert.equal(request.candidate_metadata.review_reason, "owner_triage");
  assert.equal(request.candidate_metadata.classification_label, "erp_task");
  assert.deepEqual(request.candidate_metadata.classification_reasons, ["business_review_ready"]);
  assert.equal(request.candidate_metadata.blocked_attachment_count, 2);
  assert.deepEqual(request.candidate_metadata.attachment_types, ["attachment_metadata", "binary_attachment"]);
  assert.deepEqual(request.candidate_metadata.owner_assignment_override, {
    assignee_id: "owner-a",
    assignee_label: "Owner A",
    reason_codes: ["owner_override"],
    source: "manual_triage",
  });
  assert.deepEqual(request.candidate_metadata.suggested_assignee, {
    assignee_id: "erp-ops",
    assignee_label: "ERP Ops",
    source: "router",
  });
  assert.deepEqual(request.monsters[0].project_hints, ["P26-030", "P25-057"]);
  assert.deepEqual(request.monsters[0].stage_hints, ["erp_entry"]);
  assert.equal(request.candidate_metadata.boundary.raw_payload_copied, false);
  assert.equal(request.candidate_metadata.boundary.body_copied, false);
  assert.equal(request.candidate_metadata.boundary.attachment_names_copied, false);

  assert(!rendered.includes("private body"));
  assert(!rendered.includes("private html"));
  assert(!rendered.includes("raw private"));
  assert(!rendered.includes("private-plan.xlsx"));
  assert(!rendered.includes("example.test/private-plan.xlsx"));
  assert(!rendered.includes("/private/path"));
  assert(!rendered.includes("DO_NOT_COPY_BODY"));
  assert(!rendered.includes("secret.xlsx"));
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

test("triageMailCandidate private-deep marks quoted-chain project evidence without leaking raw content", async () => {
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

  await writeJson(candidateFile, {
    ...sampleCandidate(),
    mail_summary: {
      ...sampleCandidate().mail_summary,
      subject: "RE: 확인했습니다",
      from: [{ name: "Internal Reviewer", address: "reviewer@example.test" }],
      attachment_count: 0,
      attachment_types: [],
    },
  });
  await writeJsonl(eventFile, [
    {
      event_id: "hiworks_evt_candidate_001",
      source: "hiworks",
      provider_message_id: "provider-message-001",
      received_at: "2026-03-19T00:15:00+00:00",
      body_text: [
        "확인했습니다. 아래 요청 기준으로 처리했습니다.",
        "",
        "-----Original Message-----",
        "From: Project Owner <owner@example.test>",
        "Subject: [SYNTHETIC-ROUTE] Routed quoted request",
        "SYNTHETIC_ROUTE_TOKEN appears only in the quoted chain.",
      ].join("\n"),
    },
  ]);
  await writeText(
    bindingFile,
    [
      "version: mail_project_router.v1",
      "routes:",
      "  - route_id: synthetic_subject_exact",
      "    project_code: P-SYN-001",
      "    match:",
      "      subject_any: [SYNTHETIC_ROUTE_TOKEN]",
      "  - route_id: synthetic_quoted_body_exact",
      "    project_code: P-SYN-001",
      "    stage: project_inbox_original_collection",
      "    next_action: promote_for_private_filing",
      "    match:",
      "      private_body_any: [SYNTHETIC_ROUTE_TOKEN]",
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

  assert.equal(result.status, "triaged");
  assert.equal(suggestion.status, "suggested");
  assert.equal(suggestion.project_code, "P-SYN-001");
  assert.equal(suggestion.route_id, "synthetic_quoted_body_exact");
  assert.equal(suggestion.route_source, "quoted_chain_private_deep");
  assert.deepEqual(suggestion.matched_on, ["quoted_body"]);
  assert.deepEqual(suggestion.reason_codes, ["private_body_any"]);
  assert.equal(suggestion.body_safe, true);

  for (const rendered of [JSON.stringify(result), JSON.stringify(updatedCandidate)]) {
    assert(!rendered.includes("SYNTHETIC_ROUTE_TOKEN appears"));
    assert(!rendered.includes("Routed quoted request"));
    assert(!rendered.includes("Project Owner"));
  }
});

test("triageMailCandidate private-deep does not match required body terms split across current and quoted text", async () => {
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
      body_text: [
        "Current section has ALPHA only.",
        "",
        "-----Original Message-----",
        "From: Project Owner <owner@example.test>",
        "Subject: Prior message",
        "Quoted section has BETA only.",
      ].join("\n"),
    },
  ]);
  await writeText(
    bindingFile,
    [
      "version: mail_project_router.v1",
      "routes:",
      "  - route_id: split_required_terms",
      "    project_code: SPLIT",
      "    match:",
      "      private_body_includes: [ALPHA, BETA]",
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

  assert.equal(result.routing_suggestion.status, "unmatched");
  assert.equal(updatedCandidate.business_review.project_routing_suggestion.status, "unmatched");
  assert.deepEqual(result.routing_suggestion.matched_on, []);

  for (const rendered of [JSON.stringify(result), JSON.stringify(updatedCandidate)]) {
    assert(!rendered.includes("Current section"));
    assert(!rendered.includes("Quoted section"));
    assert(!rendered.includes("Project Owner"));
  }
});

test("triageMailCandidate private-deep treats a current body Subject line as current body evidence", async () => {
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
      body_text: "Subject: SYNTHETIC_ROUTE_TOKEN current checklist\nPlease handle this current note.",
    },
  ]);
  await writeText(
    bindingFile,
    [
      "version: mail_project_router.v1",
      "routes:",
      "  - route_id: current_subject_line",
      "    project_code: P-SYN-001",
      "    match:",
      "      private_body_any: [SYNTHETIC_ROUTE_TOKEN]",
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
  const suggestion = result.routing_suggestion;

  assert.equal(suggestion.status, "suggested");
  assert.equal(suggestion.route_id, "current_subject_line");
  assert.equal(suggestion.route_source, "private_deep");
  assert.deepEqual(suggestion.matched_on, ["body"]);
});

test("triageMailCandidate private-deep marks mixed current and quoted body evidence", async () => {
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
      body_text: [
        "SYNTHETIC_ROUTE_TOKEN appears in the current reply.",
        "",
        "-----Original Message-----",
        "From: Project Owner <owner@example.test>",
        "Subject: Prior message",
        "SYNTHETIC_ROUTE_TOKEN also appears in the quoted chain.",
      ].join("\n"),
    },
  ]);
  await writeText(
    bindingFile,
    [
      "version: mail_project_router.v1",
      "routes:",
      "  - route_id: mixed_body",
      "    project_code: P-SYN-001",
      "    match:",
      "      private_body_any: [SYNTHETIC_ROUTE_TOKEN]",
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
  const suggestion = result.routing_suggestion;

  assert.equal(suggestion.status, "suggested");
  assert.equal(suggestion.route_id, "mixed_body");
  assert.equal(suggestion.route_source, "mixed_private_deep");
  assert.deepEqual(suggestion.matched_on, ["body", "quoted_body"]);
});

test("triageMailCandidate private-deep marks quoted html blockquote evidence", async () => {
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
      body_html: "<p>Acknowledged.</p><blockquote><p>SYNTHETIC_ROUTE_TOKEN quoted request.</p></blockquote>",
    },
  ]);
  await writeText(
    bindingFile,
    [
      "version: mail_project_router.v1",
      "routes:",
      "  - route_id: quoted_html_blockquote",
      "    project_code: P-SYN-001",
      "    match:",
      "      private_html_any: [SYNTHETIC_ROUTE_TOKEN]",
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

  assert.equal(result.status, "triaged");
  assert.equal(suggestion.status, "suggested");
  assert.equal(suggestion.route_id, "quoted_html_blockquote");
  assert.equal(suggestion.route_source, "quoted_chain_private_deep");
  assert.deepEqual(suggestion.matched_on, ["quoted_html"]);
  assert.equal(suggestion.body_safe, true);

  for (const rendered of [JSON.stringify(result), JSON.stringify(updatedCandidate)]) {
    assert(!rendered.includes("SYNTHETIC_ROUTE_TOKEN quoted request"));
    assert(!rendered.includes("Acknowledged"));
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

test("buildMailCandidateBacklogReport warns on stale pending candidates without leaking mail payload", async () => {
  const repoRoot = await createRepoRoot();
  const queueRoot = path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate");
  const oldCandidateFile = path.join(queueRoot, "queue", "pending", "old.json");
  const freshCandidateFile = path.join(queueRoot, "queue", "pending", "fresh.json");

  await writeJson(oldCandidateFile, {
    ...sampleCandidate({
      event_id: "hiworks_evt_old",
      received_at: "2026-06-03T00:00:00.000Z",
    }),
    candidate_id: "mail_candidate_hiworks_evt_old",
    status: "pending_review",
    created_at: "2026-06-03T00:05:00.000Z",
    updated_at: "2026-06-03T00:05:00.000Z",
    raw_body: "private body must not leak",
    provider_payload: {
      token: "provider token must not leak",
      raw_payload: "provider payload must not leak",
    },
    secret_value: "secret value must not leak",
    mail_summary: {
      subject: "Private customer subject must not leak",
      from: [{ name: "Secret Sender", address: "secret@example.test" }],
      attachment_count: 1,
      attachments: [
        {
          filename: "private_attachment_name_must_not_leak.pdf",
          url: "https://example.invalid/private-attachment-url",
          local_path: "LOCAL_PRIVATE_ATTACHMENT_PATH_MUST_NOT_LEAK",
        },
      ],
    },
  });
  await writeJson(freshCandidateFile, {
    ...sampleCandidate({
      event_id: "hiworks_evt_fresh",
      received_at: "2026-06-04T03:00:00.000Z",
    }),
    candidate_id: "mail_candidate_hiworks_evt_fresh",
    status: "pending_review",
    created_at: "2026-06-04T03:05:00.000Z",
    updated_at: "2026-06-04T03:05:00.000Z",
  });

  const report = await buildMailCandidateBacklogReport({
    repoRoot,
    queueRoot,
    now: new Date("2026-06-04T06:00:00.000Z"),
    previousReport: {
      summary: {
        pending_count: 1,
      },
    },
  });
  const rendered = JSON.stringify(report);

  assert.equal(report.status, "warn");
  assert.equal(report.summary.pending_count, 2);
  assert.equal(report.summary.stale_pending_count, 1);
  assert.equal(report.summary.pending_count_delta, 1);
  assert.equal(report.summary.trend, "increased");
  assert.equal(report.pending_candidates[0].candidate_id, "mail_candidate_hiworks_evt_old");
  assert.equal(rendered.includes("private body"), false);
  assert.equal(rendered.includes("Private customer subject"), false);
  assert.equal(rendered.includes("Secret Sender"), false);
  assert.equal(rendered.includes("secret@example.test"), false);
  assert.equal(rendered.includes("provider token"), false);
  assert.equal(rendered.includes("provider payload"), false);
  assert.equal(rendered.includes("secret value"), false);
  assert.equal(rendered.includes("private_attachment_name"), false);
  assert.equal(rendered.includes("private-attachment-url"), false);
  assert.equal(rendered.includes("LOCAL_PRIVATE_ATTACHMENT_PATH"), false);
});

test("mail-candidate-backlog CLI defaults to bounded display while output file stays full", async () => {
  const repoRoot = await createRepoRoot();
  const queueRoot = path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate");
  const outputFile = path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate", "backlog_age", "latest.json");

  for (let index = 1; index <= 12; index += 1) {
    await writeBacklogCandidate(queueRoot, index);
    await writeInvalidBacklogCandidate(queueRoot, index);
  }

  const { stdout } = await execFile(process.execPath, [
    cliPath,
    "mail-candidate-backlog",
    "--queue-root",
    queueRoot,
    "--output-file",
    outputFile,
  ]);
  const result = JSON.parse(stdout);
  const latestReport = JSON.parse(await readFile(outputFile, "utf8"));

  assert.equal(result.request_id, "mail_candidate_backlog");
  assert.equal(result.display_mode, "bounded");
  assert.equal(result.display_limit, 10);
  assert.equal(result.summary.pending_count, 12);
  assert.equal(result.summary.invalid_candidate_count, 12);
  assert.equal(result.pending_candidates.length, 10);
  assert.equal(result.pending_candidates_omitted_count, 2);
  assert.equal(result.invalid_candidates.length, 10);
  assert.equal(result.invalid_candidates_omitted_count, 2);
  assert.equal(latestReport.pending_candidates.length, 12);
  assert.equal(latestReport.invalid_candidates.length, 12);
  assert.equal(latestReport.display_mode, undefined);

  const { stdout: limitedStdout } = await execFile(process.execPath, [
    cliPath,
    "mail-candidate-backlog",
    "--queue-root",
    queueRoot,
    "--limit",
    "5",
  ]);
  const limited = JSON.parse(limitedStdout);

  assert.equal(limited.display_mode, "bounded");
  assert.equal(limited.display_limit, 5);
  assert.equal(limited.pending_candidates.length, 5);
  assert.equal(limited.pending_candidates_omitted_count, 7);
  assert.equal(limited.invalid_candidates.length, 5);
  assert.equal(limited.invalid_candidates_omitted_count, 7);
});

test("mail-candidate-backlog CLI supports summary-only and full display modes", async () => {
  const repoRoot = await createRepoRoot();
  const queueRoot = path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate");

  for (let index = 1; index <= 3; index += 1) {
    await writeBacklogCandidate(queueRoot, index);
  }
  for (let index = 1; index <= 2; index += 1) {
    await writeInvalidBacklogCandidate(queueRoot, index);
  }

  const { stdout: summaryStdout } = await execFile(process.execPath, [
    cliPath,
    "mail-candidate-backlog",
    "--queue-root",
    queueRoot,
    "--summary-only",
    "--limit",
    "1",
  ]);
  const summaryOnly = JSON.parse(summaryStdout);

  assert.equal(summaryOnly.display_mode, "summary_only");
  assert.equal(summaryOnly.display_limit, 0);
  assert.equal(summaryOnly.summary.pending_count, 3);
  assert.equal(summaryOnly.summary.invalid_candidate_count, 2);
  assert.deepEqual(summaryOnly.pending_candidates, []);
  assert.deepEqual(summaryOnly.invalid_candidates, []);
  assert.equal(summaryOnly.pending_candidates_omitted_count, 3);
  assert.equal(summaryOnly.invalid_candidates_omitted_count, 2);

  const { stdout: fullStdout } = await execFile(process.execPath, [
    cliPath,
    "mail-candidate-backlog",
    "--queue-root",
    queueRoot,
    "--full",
    "--limit",
    "1",
  ]);
  const full = JSON.parse(fullStdout);

  assert.equal(full.display_mode, "full");
  assert.equal(full.display_limit, null);
  assert.equal(full.pending_candidates.length, 3);
  assert.equal(full.invalid_candidates.length, 2);
  assert.equal(full.pending_candidates_omitted_count, 0);
  assert.equal(full.invalid_candidates_omitted_count, 0);
});

test("mail-candidate-backlog CLI prints metadata-only report", async () => {
  const repoRoot = await createRepoRoot();
  const queueRoot = path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate");
  const candidateFile = path.join(queueRoot, "queue", "pending", "candidate.json");

  await writeJson(candidateFile, {
    ...sampleCandidate({
      event_id: "hiworks_evt_cli",
      received_at: "2026-06-03T00:00:00.000Z",
    }),
    candidate_id: "mail_candidate_hiworks_evt_cli",
    status: "pending_review",
    updated_at: "2026-06-03T00:00:00.000Z",
    raw_body: "private body must not leak",
    provider_payload: {
      token: "provider token must not leak",
      raw_payload: "provider payload must not leak",
    },
    secret_value: "secret value must not leak",
    mail_summary: {
      subject: "Private customer subject must not leak",
      from: [{ name: "Secret Sender", address: "secret@example.test" }],
      attachment_count: 1,
      attachments: [
        {
          filename: "private_attachment_name_must_not_leak.pdf",
          url: "https://example.invalid/private-attachment-url",
          local_path: "LOCAL_PRIVATE_ATTACHMENT_PATH_MUST_NOT_LEAK",
        },
      ],
    },
  });

  const { stdout } = await execFile(process.execPath, [
    cliPath,
    "mail-candidate-backlog",
    "--queue-root",
    queueRoot,
    "--warn-age-hours",
    "1",
  ]);
  const result = JSON.parse(stdout);
  const rendered = JSON.stringify(result);

  assert.equal(result.request_id, "mail_candidate_backlog");
  assert.equal(result.display_mode, "bounded");
  assert.equal(result.status, "warn");
  assert.equal(result.summary.pending_count, 1);
  assert.equal(result.pending_candidates_omitted_count, 0);
  assert.equal(JSON.stringify(result).includes("private body"), false);
  assert.equal(rendered.includes("Private customer subject"), false);
  assert.equal(rendered.includes("Secret Sender"), false);
  assert.equal(rendered.includes("secret@example.test"), false);
  assert.equal(rendered.includes("provider token"), false);
  assert.equal(rendered.includes("provider payload"), false);
  assert.equal(rendered.includes("secret value"), false);
  assert.equal(rendered.includes("private_attachment_name"), false);
  assert.equal(rendered.includes("private-attachment-url"), false);
  assert.equal(rendered.includes("LOCAL_PRIVATE_ATTACHMENT_PATH"), false);
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

test("mailBodyExcerptFromRecord prefers text, falls back to stripped html, collapses and caps", () => {
  assert.equal(
    mailBodyExcerptFromRecord({ body_text: "  안녕하세요\n\n  업무  요청 입니다.  " }),
    "안녕하세요 업무 요청 입니다.",
  );
  assert.equal(
    mailBodyExcerptFromRecord({ body_html: "<style>.x{}</style><p>HTML&nbsp;본문 &amp; 검토</p>" }),
    "HTML 본문 & 검토",
  );
  assert.equal(mailBodyExcerptFromRecord({ body_text: "  ", body_html: "<p>fallback</p>" }), "fallback");
  assert.equal(mailBodyExcerptFromRecord({}), null);
  assert.equal(mailBodyExcerptFromRecord({ body_text: "abcdef" }, { maxChars: 3 }), "abc");
});

test("loadMailBodyExcerptIndex maps event_id to excerpt and rejects paths outside mailbox state", async () => {
  const repoRoot = await createRepoRoot();
  const eventRel = "guild_hall/state/gateway/mailbox/company/mail/events/hiworks/2026/2026-03.jsonl";
  await writeJsonl(path.join(repoRoot, eventRel), [
    { event_id: "evt_a", body_text: "본문 A 입니다." },
    { event_id: "evt_b", body_html: "<p>본문 B</p>" },
    { event_id: "" },
  ]);

  const index = await loadMailBodyExcerptIndex({ repoRoot, eventFile: eventRel });
  assert.equal(index.get("evt_a"), "본문 A 입니다.");
  assert.equal(index.get("evt_b"), "본문 B");
  assert.equal(index.has(""), false);

  const missing = await loadMailBodyExcerptIndex({ repoRoot, eventFile: "guild_hall/state/gateway/mailbox/company/mail/events/hiworks/2026/2099-01.jsonl" });
  assert.equal(missing.size, 0);

  await assert.rejects(
    loadMailBodyExcerptIndex({ repoRoot, eventFile: "_workmeta/P00-000_INBOX/reports/메일_이력/메일_이력.csv" }),
    /source event file must stay under guild_hall\/state\/gateway\/mailbox/,
  );
});

test("readMailBodyPreview resolves excerpt through candidate pointer, caches, and stays null-safe", async () => {
  const repoRoot = await createRepoRoot();
  const candidateRel = "guild_hall/state/gateway/mail_candidate/queue/pending/mail_candidate_hiworks_evt_candidate_001.json";
  const eventRel = "guild_hall/state/gateway/mailbox/company/mail/events/hiworks/2026/2026-03.jsonl";
  await writeJson(path.join(repoRoot, candidateRel), sampleCandidate());
  await writeJsonl(path.join(repoRoot, eventRel), [
    {
      event_id: "hiworks_evt_candidate_001",
      body_text: "검토 부탁드립니다. 첨부 확인 후 회신 주세요.",
      body_html: "<html><body>무시되는 html</body></html>",
    },
  ]);

  const cache = new Map();
  const preview = await readMailBodyPreview({ repoRoot, candidateRef: candidateRel, cache });
  assert.equal(preview, "검토 부탁드립니다. 첨부 확인 후 회신 주세요.");
  assert.equal(cache.size, 1); // event_file 인덱스가 캐시됨

  // 같은 후보 재요청 — 캐시된 인덱스 재사용(추가 파일 읽기 없음)
  const again = await readMailBodyPreview({ repoRoot, candidateRef: candidateRel, cache });
  assert.equal(again, "검토 부탁드립니다. 첨부 확인 후 회신 주세요.");
  assert.equal(cache.size, 1);

  // 후보 부재·빈 포인터·큐 밖 경로 → throw 없이 null(상세 패널 '본문 미수집')
  assert.equal(await readMailBodyPreview({ repoRoot, candidateRef: "" }), null);
  assert.equal(
    await readMailBodyPreview({ repoRoot, candidateRef: "guild_hall/state/gateway/mail_candidate/queue/pending/missing.json" }),
    null,
  );
  assert.equal(await readMailBodyPreview({ repoRoot, candidateRef: "_workmeta/escape.json" }), null);
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

async function writeBacklogCandidate(queueRoot, index, overrides = {}) {
  const suffix = String(index).padStart(3, "0");
  const minute = String(index).padStart(2, "0");
  await writeJson(path.join(queueRoot, "queue", "pending", `candidate-${suffix}.json`), {
    ...sampleCandidate({
      event_id: `hiworks_evt_backlog_${suffix}`,
      received_at: `2026-06-03T00:${minute}:00.000Z`,
    }),
    candidate_id: `mail_candidate_hiworks_evt_backlog_${suffix}`,
    status: "pending_review",
    created_at: `2026-06-03T00:${minute}:01.000Z`,
    updated_at: `2026-06-03T00:${minute}:01.000Z`,
    ...overrides,
  });
}

async function writeInvalidBacklogCandidate(queueRoot, index) {
  const suffix = String(index).padStart(3, "0");
  await writeText(path.join(queueRoot, "queue", "pending", `invalid-${suffix}.json`), "{");
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
