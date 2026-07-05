import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  PROJECT_CONTEXT_FILES,
  runProjectContextUpdate,
} from "../tools/haengbogwan_project_context.mjs";
import { buildContextGraph } from "../src/context_graph.mjs";

const TOOL = resolve(import.meta.dirname, "..", "tools", "haengbogwan_project_context.mjs");
const GENERATED_AT = "2026-06-28T09:00:00.000Z";

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
