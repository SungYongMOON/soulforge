import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  PROJECT_CONTEXT_FILES,
  runProjectContextUpdate,
} from "../tools/haengbogwan_project_context.mjs";
import { buildContextGraph } from "../src/context_graph.mjs";

const TOOL = resolve(import.meta.dirname, "..", "tools", "haengbogwan_project_context.mjs");
const GENERATED_AT = "2026-06-28T09:00:00.000Z";
const MAIL_LEDGER_REL = join("reports", "\uBA54\uC77C_\uC774\uB825", "\uBA54\uC77C_\uC774\uB825.csv");
const TASK_LEDGER_REL = join("reports", "\uD560\uC77C_\uC7A5\uBD80", "\uD560\uC77C_\uC7A5\uBD80.csv");

function makeTempWorkmeta() {
  const root = mkdtempSync(join(tmpdir(), "sf-haengbogwan-project-context-"));
  return {
    root,
    cleanup: () => {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    },
  };
}

function readCsvRows(path) {
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  const lines = text.trim().split(/\r?\n/);
  return {
    headers: lines[0].split(","),
    rows: lines.slice(1),
  };
}

function readCsvObjects(path) {
  const { headers, rows } = readCsvRows(path);
  return rows.map((row) => {
    const cells = row.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function readProjectContextSnapshot(root, project) {
  return Object.fromEntries(Object.entries(PROJECT_CONTEXT_FILES).map(([key, relativePath]) => [
    key,
    readFileSync(join(root, project, relativePath), "utf8"),
  ]));
}

function csvEscape(value) {
  const raw = String(value ?? "");
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function writeCsv(path, headers, rows) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ];
  writeFileSync(path, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

function sampleEvents(projectCode = "P26-014") {
  return [
    {
      source_kind: "mail",
      source_id: "mail:P26-014:M001",
      project_code: projectCode,
      received_at: "2026-06-28T08:10:00+09:00",
      title: "KVDS schedule confirmation",
      branch_hint: "KVDS test schedule",
      branch_kind: "legacy",
      summary_hint: "Customer asked to confirm the test schedule.",
      action_required: true,
      work_type: "schedule",
      completion_criteria: "Test schedule confirmed and reflected in ERP.",
      due: "2026-06-30",
      suggested_actor_ref: "team:dev1",
      confidence: 0.78,
      milestone_label: "KVDS test readiness",
      pointer_ref: "mailcsv:M001",
    },
  ];
}

function writeRebuildLedgerFixture(root, project) {
  const projectRoot = join(root, project);
  const meetingTitle = "[\uAD70\uC9D1] \uBB34\uC778\uC7A0\uC218\uC815 \uC2E0\uD638\uCC98\uB9AC\uC7A5\uCE58 \uC2E4\uBB34\uD611\uC758";
  writeCsv(
    join(projectRoot, TASK_LEDGER_REL),
    [
      "\uD560\uC77C\uD0A4",
      "\uAE30\uB85D\uC77C",
      "\uD504\uB85C\uC81D\uD2B8\uCF54\uB4DC",
      "\uD560\uC77C\uBA85",
      "\uB2F4\uB2F9\uC790",
      "\uC5C5\uBB34\uC720\uD615",
      "\uC0C1\uD0DC",
      "\uB9C8\uAC10\uC77C",
      "SE\uB2E8\uACC4",
      "\uC5F0\uACB0\uC720\uD615",
      "\uC5F0\uACB0\uB300\uC0C1",
      "\uC644\uB8CC\uAE30\uC900",
      "\uAC80\uD1A0\uC0C1\uD0DC",
      "\uC644\uB8CC\uC77C",
    ],
    [
      {
        "\uD560\uC77C\uD0A4": "TASK-OPEN",
        "\uAE30\uB85D\uC77C": "2026-01-02T00:00:00Z",
        "\uD504\uB85C\uC81D\uD2B8\uCF54\uB4DC": project,
        "\uD560\uC77C\uBA85": "open anchored task",
        "\uB2F4\uB2F9\uC790": "owner",
        "\uC5C5\uBB34\uC720\uD615": "review",
        "\uC0C1\uD0DC": "open",
        "\uB9C8\uAC10\uC77C": "2026-01-20",
        "SE\uB2E8\uACC4": "120_CDR",
        "\uC5F0\uACB0\uC720\uD615": "artifact",
        "\uC5F0\uACB0\uB300\uC0C1": "D-001",
        "\uC644\uB8CC\uAE30\uC900": "reviewed",
        "\uAC80\uD1A0\uC0C1\uD0DC": "needs_review",
        "\uC644\uB8CC\uC77C": "",
      },
      {
        "\uD560\uC77C\uD0A4": "TASK-DONE",
        "\uAE30\uB85D\uC77C": "2026-01-03T00:00:00Z",
        "\uD504\uB85C\uC81D\uD2B8\uCF54\uB4DC": project,
        "\uD560\uC77C\uBA85": "closed anchored task",
        "\uB2F4\uB2F9\uC790": "owner",
        "\uC5C5\uBB34\uC720\uD615": "review",
        "\uC0C1\uD0DC": "done",
        "\uB9C8\uAC10\uC77C": "2026-01-21",
        "SE\uB2E8\uACC4": "130_TRR",
        "\uC5F0\uACB0\uC720\uD615": "artifact",
        "\uC5F0\uACB0\uB300\uC0C1": "D-002",
        "\uC644\uB8CC\uAE30\uC900": "closed",
        "\uAC80\uD1A0\uC0C1\uD0DC": "needs_review",
        "\uC644\uB8CC\uC77C": "2026-01-10T00:00:00Z",
      },
      {
        "\uD560\uC77C\uD0A4": "TASK-LOOSE",
        "\uAE30\uB85D\uC77C": "2026-01-04T00:00:00Z",
        "\uD504\uB85C\uC81D\uD2B8\uCF54\uB4DC": project,
        "\uD560\uC77C\uBA85": "loose task without anchor",
        "\uB2F4\uB2F9\uC790": "owner",
        "\uC5C5\uBB34\uC720\uD615": "review",
        "\uC0C1\uD0DC": "open",
        "\uB9C8\uAC10\uC77C": "2026-01-22",
        "SE\uB2E8\uACC4": "",
        "\uC5F0\uACB0\uC720\uD615": "",
        "\uC5F0\uACB0\uB300\uC0C1": "",
        "\uC644\uB8CC\uAE30\uC900": "tracked",
        "\uAC80\uD1A0\uC0C1\uD0DC": "needs_review",
        "\uC644\uB8CC\uC77C": "",
      },
    ],
  );
  writeCsv(
    join(projectRoot, MAIL_LEDGER_REL),
    [
      "\uC774\uB825\uD0A4",
      "\uBC1C\uC0DD\uC2DC\uAC01",
      "\uBA54\uC77C\uC218\uC2E0\uC2DC\uAC01",
      "\uC774\uBCA4\uD2B8\uC720\uD615",
      "\uBA54\uC77C\uC18C\uC2A4ID",
      "\uC2A4\uB808\uB4DC",
      "\uC81C\uBAA9",
      "\uBC1C\uC2E0\uC790",
    ],
    [
      { "\uC774\uB825\uD0A4": "M-H1", "\uBC1C\uC0DD\uC2DC\uAC01": "2026-01-01T09:00:00Z", "\uBA54\uC77C\uC218\uC2E0\uC2DC\uAC01": "2026-01-01T09:00:00Z", "\uC774\uBCA4\uD2B8\uC720\uD615": "received", "\uBA54\uC77C\uC18C\uC2A4ID": "SRC-H1", "\uC2A4\uB808\uB4DC": "", "\uC81C\uBAA9": meetingTitle, "\uBC1C\uC2E0\uC790": "a@example.test" },
      { "\uC774\uB825\uD0A4": "M-H2", "\uBC1C\uC0DD\uC2DC\uAC01": "2026-01-20T09:00:00Z", "\uBA54\uC77C\uC218\uC2E0\uC2DC\uAC01": "2026-01-20T09:00:00Z", "\uC774\uBCA4\uD2B8\uC720\uD615": "received", "\uBA54\uC77C\uC18C\uC2A4ID": "SRC-H2", "\uC2A4\uB808\uB4DC": "", "\uC81C\uBAA9": `RE: ${meetingTitle}`, "\uBC1C\uC2E0\uC790": "a@example.test" },
      { "\uC774\uB825\uD0A4": "M-H3", "\uBC1C\uC0DD\uC2DC\uAC01": "2026-02-15T09:00:00Z", "\uBA54\uC77C\uC218\uC2E0\uC2DC\uAC01": "2026-02-15T09:00:00Z", "\uC774\uBCA4\uD2B8\uC720\uD615": "received", "\uBA54\uC77C\uC18C\uC2A4ID": "SRC-H3", "\uC2A4\uB808\uB4DC": "", "\uC81C\uBAA9": meetingTitle, "\uBC1C\uC2E0\uC790": "a@example.test" },
      { "\uC774\uB825\uD0A4": "M-LOOSE", "\uBC1C\uC0DD\uC2DC\uAC01": "2026-03-01T09:00:00Z", "\uBA54\uC77C\uC218\uC2E0\uC2DC\uAC01": "2026-03-01T09:00:00Z", "\uC774\uBCA4\uD2B8\uC720\uD615": "received", "\uBA54\uC77C\uC18C\uC2A4ID": "SRC-L", "\uC2A4\uB808\uB4DC": "", "\uC81C\uBAA9": "One-off loose note", "\uBC1C\uC2E0\uC790": "b@example.test" },
    ],
  );
}

function stemV2Events(project) {
  return [
    {
      source_kind: "project_meta",
      source_id: "project-skeleton",
      project_code: project,
      title: "Project skeleton",
      branch_kind: "skeleton",
      anchor_ref: `project:${project}`,
      received_at: "2026-01-01T00:00:00Z",
    },
    {
      source_kind: "task_ledger",
      source_id: "TASK-1",
      item_id: "TASK-1",
      project_code: project,
      title: "Filter coefficient delivery",
      review_status: "approved",
      status: "open",
      anchor_stage_code: "120_CDR",
      created_at: "2026-01-02T00:00:00Z",
      action_required: true,
    },
    {
      source_kind: "task_ledger",
      source_id: "TASK-2",
      item_id: "TASK-2",
      project_code: project,
      title: "Closed review response",
      review_status: "approved",
      status: "done",
      anchor_stage_code: "130_TRR",
      created_at: "2026-01-03T00:00:00Z",
      done_at: "2026-01-10T00:00:00Z",
      action_required: true,
    },
    {
      source_kind: "mail",
      source_id: "MAIL-H1",
      project_code: project,
      title: "Weekly sync",
      received_at: "2026-01-01T09:00:00Z",
    },
    {
      source_kind: "mail",
      source_id: "MAIL-H2",
      project_code: project,
      title: "Re: Weekly sync",
      received_at: "2026-02-01T09:00:00Z",
    },
    {
      source_kind: "mail",
      source_id: "MAIL-H3",
      project_code: project,
      title: "Weekly sync",
      received_at: "2026-02-20T09:00:00Z",
    },
    {
      source_kind: "mail",
      source_id: "MAIL-PENDING-1",
      project_code: project,
      title: "Loose unanchored note",
      received_at: "2026-03-06T09:00:00Z",
    },
    {
      source_kind: "mail",
      source_id: "MAIL-PENDING-2",
      project_code: project,
      title: "Another loose note",
      received_at: "2026-03-07T09:00:00Z",
    },
  ];
}

test("HAENGBOGWAN-PROJECT-CONTEXT: dry-run reports plan without writing project_context", () => {
  const tmp = makeTempWorkmeta();
  try {
    const report = runProjectContextUpdate({
      workmetaRoot: tmp.root,
      projectCode: "P26-014",
      events: sampleEvents(),
      generatedAt: GENERATED_AT,
      apply: false,
    });
    assert.equal(report.apply, false);
    assert.equal(report.body_access, "metadata_only");
    assert.equal(report.raw_payload_copied, false);
    assert.equal(report.accepted_event_count, 1);
    assert.equal(report.incoming_counts.sources, 1);
    assert.equal(report.incoming_counts.review_queue, 2);
    assert.equal(existsSync(join(tmp.root, "P26-014", "project_context")), false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-PROJECT-CONTEXT: apply creates live-state files and review queue", () => {
  const tmp = makeTempWorkmeta();
  try {
    const report = runProjectContextUpdate({
      workmetaRoot: tmp.root,
      projectCode: "P26-014",
      events: sampleEvents(),
      generatedAt: GENERATED_AT,
      apply: true,
    });
    assert.equal(report.apply, true);
    assert.deepEqual(report.files_written.sort(), [
      PROJECT_CONTEXT_FILES.branches,
      PROJECT_CONTEXT_FILES.occurrences,
      PROJECT_CONTEXT_FILES.branchSummaries,
      PROJECT_CONTEXT_FILES.edges,
      PROJECT_CONTEXT_FILES.judgments,
      PROJECT_CONTEXT_FILES.nodes,
      PROJECT_CONTEXT_FILES.projectSummary,
      PROJECT_CONTEXT_FILES.reviewQueue,
      PROJECT_CONTEXT_FILES.sources,
    ].sort());
    for (const rel of report.files_written) {
      assert.equal(existsSync(join(tmp.root, "P26-014", rel)), true, rel);
    }

    const nodes = readCsvRows(join(tmp.root, "P26-014", PROJECT_CONTEXT_FILES.nodes));
    assert.equal(nodes.rows.some((row) => row.includes("project_trunk")), true);
    assert.equal(nodes.rows.some((row) => row.includes("context_branch")), true);
    assert.equal(nodes.rows.some((row) => row.includes("task_candidate")), true);

    const reviews = readCsvRows(join(tmp.root, "P26-014", PROJECT_CONTEXT_FILES.reviewQueue));
    assert.equal(reviews.rows.length, 2);
    assert.equal(readFileSync(join(tmp.root, "P26-014", PROJECT_CONTEXT_FILES.projectSummary), "utf8").includes("raw_payload_copied: false"), true);
    assert.equal(existsSync(join(tmp.root, "P26-014", "reports", "context_graph")), false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-PROJECT-CONTEXT ENGINE-11: emits stem v2 skeleton/work/history and holds unanchored mail", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P99-001";
    runProjectContextUpdate({
      workmetaRoot: tmp.root,
      projectCode: project,
      events: stemV2Events(project),
      generatedAt: GENERATED_AT,
      apply: true,
    });

    const branches = readCsvObjects(join(tmp.root, project, PROJECT_CONTEXT_FILES.branches));
    assert.equal(branches.filter((row) => row.branch_kind === "skeleton").length, 1);
    assert.equal(branches.filter((row) => row.branch_kind === "work").length, 2);
    assert.equal(branches.filter((row) => row.branch_kind === "history").length, 1);
    assert.ok(branches.some((row) => row.anchor_ref === "item:TASK-1" && row.status === "open"));
    assert.ok(branches.some((row) => row.anchor_ref === "item:TASK-2" && row.status === "closed" && row.closed_at === "2026-01-10T00:00:00Z"));
    assert.ok(branches.some((row) => row.branch_kind === "history" && row.status === "proposed" && row.anchor_ref.startsWith("series:")));

    const occurrences = readCsvObjects(join(tmp.root, project, PROJECT_CONTEXT_FILES.occurrences));
    assert.equal(occurrences.length, 3);
    assert.equal(occurrences.every((row) => row.source_count === "1"), true);

    const sources = readCsvObjects(join(tmp.root, project, PROJECT_CONTEXT_FILES.sources));
    const pending = sources.filter((row) => row.external_ref.startsWith("MAIL-PENDING"));
    assert.equal(pending.length, 2);
    assert.equal(pending.every((row) => row.branch_ref === ""), true, "unanchored mail does not create title-fragment branches");
    assert.equal(branches.some((row) => /Loose|Another/.test(row.label)), false);
    assert.equal(sources.filter((row) => row.external_ref.startsWith("MAIL-H")).every((row) => /history-/.test(row.branch_key) && row.branch_ref), true);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-PROJECT-CONTEXT ENGINE-11: context graph exposes v2 branch metadata", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "sf-haengbogwan-project-context-graph-"));
  try {
    const project = "P99-002";
    runProjectContextUpdate({
      workmetaRoot: join(repoRoot, "_workmeta"),
      projectCode: project,
      events: stemV2Events(project),
      generatedAt: GENERATED_AT,
      apply: true,
    });
    const graph = buildContextGraph(repoRoot, project);
    assert.equal(graph.error, undefined);
    assert.equal(graph.occurrences.length, 3);
    assert.equal(graph.counts.stem_occurrences, 3);
    assert.ok(graph.branches.some((row) => row.branch_kind === "history" && row.status === "proposed" && row.anchor_ref.startsWith("series:")));
    assert.ok(graph.branches.some((row) => row.branch_kind === "work" && row.anchor_ref === "item:TASK-1"));
  } finally {
    if (existsSync(repoRoot)) rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("HAENGBOGWAN-PROJECT-CONTEXT ENGINE-11: rebuild-from-ledgers is dry-run by default and idempotent", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P99-003";
    writeRebuildLedgerFixture(tmp.root, project);

    const dry = spawnSync(process.execPath, [
      TOOL,
      "--workmeta-root",
      tmp.root,
      "--project",
      project,
      "--rebuild-from-ledgers",
      "--generated-at",
      GENERATED_AT,
      "--json",
    ], { encoding: "utf8" });
    assert.equal(dry.status, 0, dry.stderr);
    const dryReport = JSON.parse(dry.stdout);
    assert.equal(dryReport.apply, false);
    assert.equal(dryReport.mode, "rebuild_from_ledgers");
    assert.equal(dryReport.rebuild_counts.task_rows, 3);
    assert.equal(dryReport.rebuild_counts.mail_rows, 4);
    assert.equal(dryReport.rebuild_counts.work_events, 2);
    assert.equal(existsSync(join(tmp.root, project, "project_context")), false);

    const applyArgs = [
      TOOL,
      "--workmeta-root",
      tmp.root,
      "--project",
      project,
      "--rebuild-from-ledgers",
      "--generated-at",
      GENERATED_AT,
      "--apply",
      "--json",
    ];
    const first = spawnSync(process.execPath, applyArgs, { encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    const firstReport = JSON.parse(first.stdout);
    const firstSnapshot = readProjectContextSnapshot(tmp.root, project);
    const second = spawnSync(process.execPath, applyArgs, { encoding: "utf8" });
    assert.equal(second.status, 0, second.stderr);
    const secondReport = JSON.parse(second.stdout);
    const secondSnapshot = readProjectContextSnapshot(tmp.root, project);
    assert.deepEqual(secondReport.total_counts, firstReport.total_counts);
    assert.deepEqual(secondSnapshot, firstSnapshot);

    const branches = readCsvObjects(join(tmp.root, project, PROJECT_CONTEXT_FILES.branches));
    assert.ok(branches.filter((row) => row.branch_kind === "skeleton").length >= 5);
    assert.equal(branches.filter((row) => row.branch_kind === "work").length, 2);
    assert.equal(branches.filter((row) => row.branch_kind === "history").length, 1);
    assert.ok(branches.some((row) => row.anchor_ref === "item:TASK-OPEN" && row.status === "open"));
    assert.ok(branches.some((row) => row.anchor_ref === "item:TASK-DONE" && row.status === "closed"));
    const meetingHistory = branches.find((row) => row.branch_kind === "history");
    assert.equal(meetingHistory.status, "proposed");
    assert.match(meetingHistory.label, /\uC2E4\uBB34\uD611\uC758/u);

    const occurrences = readCsvObjects(join(tmp.root, project, PROJECT_CONTEXT_FILES.occurrences));
    assert.equal(occurrences.length, 3);
    assert.equal(occurrences.filter((row) => row.branch_ref === meetingHistory.branch_id).length, 3);

    const sources = readCsvObjects(join(tmp.root, project, PROJECT_CONTEXT_FILES.sources));
    assert.equal(sources.find((row) => row.external_ref === "mailcsv:M-LOOSE").branch_ref, "");
    assert.equal(sources.some((row) => row.external_ref === "TASK-LOOSE"), false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-PROJECT-CONTEXT: apply is idempotent for stable source refs", () => {
  const tmp = makeTempWorkmeta();
  try {
    const opts = {
      workmetaRoot: tmp.root,
      projectCode: "P26-014",
      events: sampleEvents(),
      generatedAt: GENERATED_AT,
      apply: true,
    };
    const first = runProjectContextUpdate(opts);
    const second = runProjectContextUpdate(opts);
    assert.deepEqual(second.total_counts, first.total_counts);
    assert.equal(readCsvRows(join(tmp.root, "P26-014", PROJECT_CONTEXT_FILES.sources)).rows.length, 1);
    assert.equal(readCsvRows(join(tmp.root, "P26-014", PROJECT_CONTEXT_FILES.judgments)).rows.length, 1);
    assert.equal(readCsvRows(join(tmp.root, "P26-014", PROJECT_CONTEXT_FILES.reviewQueue)).rows.length, 2);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-PROJECT-CONTEXT: raw and secret fields are skipped without leaking payload", () => {
  const tmp = makeTempWorkmeta();
  try {
    const report = runProjectContextUpdate({
      workmetaRoot: tmp.root,
      projectCode: "P26-014",
      events: [
        ...sampleEvents(),
        {
          source_kind: "mail",
          source_id: "mail:P26-014:RAW",
          title: "raw payload should not pass",
          body: "RAW_BODY_SENTINEL_MUST_NOT_APPEAR",
          token: "SECRET_SENTINEL_MUST_NOT_APPEAR",
        },
      ],
      generatedAt: GENERATED_AT,
      apply: true,
    });
    assert.equal(report.accepted_event_count, 1);
    assert.equal(report.skipped_event_count, 1);
    assert.equal(report.raw_boundary_skips[0].reason, "unsafe_raw_or_secret_field");
    const contextText = readFileSync(join(tmp.root, "P26-014", PROJECT_CONTEXT_FILES.sources), "utf8")
      + readFileSync(join(tmp.root, "P26-014", PROJECT_CONTEXT_FILES.judgments), "utf8")
      + JSON.stringify(report);
    assert.equal(contextText.includes("RAW_BODY_SENTINEL_MUST_NOT_APPEAR"), false);
    assert.equal(contextText.includes("SECRET_SENTINEL_MUST_NOT_APPEAR"), false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-PROJECT-CONTEXT: CSV output guards formula-leading values", () => {
  const tmp = makeTempWorkmeta();
  try {
    runProjectContextUpdate({
      workmetaRoot: tmp.root,
      projectCode: "P26-014",
      events: [{
        source_kind: "mail",
        source_id: "mail:P26-014:FORMULA",
        title: "=HYPERLINK(\"http://example.test\")",
        branch_hint: "+formula branch",
        branch_kind: "legacy",
        action_required: true,
      }],
      generatedAt: GENERATED_AT,
      apply: true,
    });
    const sourcesText = readFileSync(join(tmp.root, "P26-014", PROJECT_CONTEXT_FILES.sources), "utf8");
    const nodesText = readFileSync(join(tmp.root, "P26-014", PROJECT_CONTEXT_FILES.nodes), "utf8");
    assert.equal(sourcesText.includes("'=HYPERLINK"), true);
    assert.equal(nodesText.includes("'+formula branch"), true);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-PROJECT-CONTEXT: CLI help and unsafe project checks", () => {
  const help = spawnSync(process.execPath, [TOOL, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /project_context metadata state/);

  const unsafe = spawnSync(process.execPath, [
    TOOL,
    "--project",
    "../escape",
    "--input",
    "[]",
  ], { encoding: "utf8" });
  assert.equal(unsafe.status, 2);
  assert.match(unsafe.stderr, /unsafe_project_code/);
});
