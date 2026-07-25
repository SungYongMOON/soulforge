import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createSourceArrivalAnnotation } from "./source_timeline_annotation.mjs";
import {
  buildProjectTimelineShadow,
  PROJECT_TIMELINE_SHADOW_INPUT_SCHEMA_VERSION,
  renderProjectTimelineCsv,
  renderProjectTimelineMonthJsonl,
  validateProjectTimelineShadow,
} from "./project_timeline_shadow.mjs";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const GENERATED_AT = "2026-07-25T13:00:00.000Z";

function coverage(overrides = {}) {
  const blank = {
    state: "not_collected",
    observed_count: 0,
    accepted_count: 0,
    held_count: 0,
    gap_codes: ["feature_off"],
  };
  return {
    mail: {
      state: "partial",
      observed_count: 3,
      accepted_count: 2,
      held_count: 1,
      gap_codes: ["raw_copy_rows_excluded"],
    },
    slack: {
      state: "complete_with_events",
      observed_count: 1,
      accepted_count: 1,
      held_count: 0,
      gap_codes: [],
    },
    voice: {
      state: "partial",
      observed_count: 1,
      accepted_count: 1,
      held_count: 0,
      gap_codes: ["raw_audio_unavailable"],
    },
    structured_pc_work: { ...blank },
    team_files: { ...blank },
    run_logs: { ...blank },
    ...overrides,
  };
}

function slackAnnotation(projectCode = "P26-014") {
  return createSourceArrivalAnnotation({
    source_lane: "slack",
    item_id: "slack-msg:001",
    source_revision_id: "slack-rev:001",
    body_sha256: HASH_B,
    source_unit_ref: "slack-msg:001",
    source_span_ref: "slack-revision:001",
    source_sequence: 0,
    occurred_at: "2026-07-24T12:00:00.000+09:00",
    project_ref: projectCode,
    project_resolution_state: "confirmed",
    project_basis_refs: ["slack-binding:kvds"],
    actor_refs: [],
    producer_ref: "slack_continuous_runner_v2",
  });
}

function input() {
  return {
    schema_version: PROJECT_TIMELINE_SHADOW_INPUT_SCHEMA_VERSION,
    project_code: "P26-014",
    generation_id: "kvds_shadow_20260725_v1",
    generated_at: GENERATED_AT,
    mail_history: {
      source_ref: "workmeta:P26-014:mail-history",
      source_sha256: HASH_A,
      rows: [
        {
          history_key: "mail001",
          occurred_at: "2026-06-01T01:00:00.000Z",
          project_code: "P26-014",
          event_type: "mail_received",
          raw_copied: false,
        },
        {
          history_key: "mail002",
          occurred_at: "2026-07-01T02:00:00.000Z",
          project_code: "P26-014",
          event_type: "mail_sent",
          raw_copied: false,
        },
        {
          history_key: "mail003",
          occurred_at: "2026-07-02T03:00:00.000Z",
          project_code: "P26-014",
          event_type: "mail_received",
          raw_copied: true,
        },
      ],
    },
    source_annotations: [slackAnnotation()],
    explicit_events: [{
      source_lane: "voice",
      event_id: "voice_20260625_100600_kvds",
      occurred_at: "2026-06-25T10:06:00+09:00",
      project_code: "P26-014",
      content_sha256: HASH_B,
      source_sequence: 0,
      known_at: GENERATED_AT,
      binding_basis_refs: ["owner-confirmed:P26-014"],
    }],
    coverage: coverage(),
  };
}

test("builds one isolated project shadow from mail, Slack, and voice metadata", () => {
  const shadow = buildProjectTimelineShadow(input());
  assert.equal(shadow.project_code, "P26-014");
  assert.equal(shadow.source_inventory.mail_history_row_count, 3);
  assert.equal(shadow.source_inventory.excluded_raw_mail_row_count, 1);
  assert.equal(shadow.projection.project_timelines.length, 1);
  const entries = shadow.projection.project_timelines[0].entries;
  assert.equal(entries.length, 4);
  assert.deepEqual(
    entries.map((entry) => entry.source_lane).sort(),
    ["mail", "mail", "slack", "voice"],
  );
  assert.equal(
    Object.values(shadow.projection.routing).every((rows) => rows.length === 0),
    true,
  );
  assert.deepEqual(validateProjectTimelineShadow(shadow), { ok: true, errors: [] });
});

test("is deterministic across exact replay and renders bounded views", () => {
  const first = buildProjectTimelineShadow(input());
  const second = buildProjectTimelineShadow(input());
  assert.equal(first.shadow_digest, second.shadow_digest);
  assert.equal(
    first.projection.projection_digest,
    second.projection.projection_digest,
  );
  const csv = renderProjectTimelineCsv(first);
  assert.match(csv, /^occurred_at,project_ref,source_lane/mu);
  assert.equal(csv.includes("mail_received"), false);
  const months = renderProjectTimelineMonthJsonl(first);
  assert.deepEqual([...months.keys()], ["2026-06", "2026-07"]);
});

test("rejects a source annotation confirmed for another project", () => {
  const value = input();
  value.source_annotations = [slackAnnotation("P24-049")];
  assert.throws(() => buildProjectTimelineShadow(value), {
    code: "annotation_project_not_confirmed",
  });
});

test("rejects coverage that overclaims accepted data", () => {
  const value = input();
  value.coverage.voice.accepted_count = 2;
  assert.throws(() => buildProjectTimelineShadow(value), {
    code: "coverage_accepted_count_mismatch",
  });
});

test("rejects raw-copied mail when coverage does not preserve the exclusion", () => {
  const value = input();
  value.coverage.mail.held_count = 0;
  assert.throws(() => buildProjectTimelineShadow(value), {
    code: "coverage_held_count_mismatch",
  });
});

test("CLI dry-run and private materialization are replay-safe", () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "project-timeline-shadow-"));
  const projectRoot = path.join(temporaryRoot, "P26-014");
  mkdirSync(projectRoot);
  const cliPath = fileURLToPath(new URL("./project_timeline_shadow_cli.mjs", import.meta.url));
  try {
    const payload = JSON.stringify(input());
    const dryRun = spawnSync(process.execPath, [cliPath], {
      input: payload,
      encoding: "utf8",
    });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.equal(JSON.parse(dryRun.stdout).entry_count, 4);

    const args = [cliPath, "--apply", "--project-root", projectRoot];
    const first = spawnSync(process.execPath, args, { input: payload, encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    const second = spawnSync(process.execPath, args, { input: payload, encoding: "utf8" });
    assert.equal(second.status, 0, second.stderr);
    const timelineRoot = path.join(
      projectRoot,
      "project_context",
      "projections",
      "timeline",
    );
    assert.equal(existsSync(path.join(timelineRoot, "current.csv")), true);
    const generation = JSON.parse(readFileSync(path.join(
      timelineRoot,
      "generations",
      "kvds_shadow_20260725_v1",
      "generation.json",
    ), "utf8"));
    assert.equal(generation.shadow_digest, buildProjectTimelineShadow(input()).shadow_digest);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
