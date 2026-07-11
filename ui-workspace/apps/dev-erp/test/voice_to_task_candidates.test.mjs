import assert from "node:assert/strict";
import test from "node:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openStore } from "../src/store.mjs";
import { parseCsv, runVoiceToTaskCandidates } from "../tools/voice_to_task_candidates.mjs";

function fixture(routeState = {}) {
  return {
    schema_version: "soulforge.voice_recording_library_entry.v0",
    recording_id: "voice-20260711-001",
    route_state: {
      project_code_candidate: "P26-014",
      route_status: "unclassified_needs_owner_confirmation",
      accepted_project_code: null,
      accepted_by: null,
      accepted_at: null,
      ...routeState,
    },
    payload_refs: {
      source_event_draft_ref: "_workspaces/system/voice_capture/sessions/2026-07-11/voice-20260711-001/source_event_draft.yaml",
      source_audio_ref: "_workspaces/system/voice_capture/sessions/2026-07-11/voice-20260711-001/audio/source.m4a",
      transcript_txt_ref: "_workspaces/system/voice_capture/sessions/2026-07-11/voice-20260711-001/transcript.txt",
    },
  };
}

function runtime(manifest = fixture()) {
  const root = mkdtempSync(join(tmpdir(), "sf-voice-task-"));
  const manifestPath = join(root, "recording_manifest.json");
  const ledgerPath = join(root, "_workmeta", "P26-014", "reports", "할일_장부", "할일_장부.csv");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    root,
    manifestPath,
    ledgerPath,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function accepted() {
  return fixture({
    route_status: "accepted_project_route",
    accepted_project_code: "P26-014",
    accepted_by: "owner",
    accepted_at: "2026-07-11T09:30:00+09:00",
  });
}

function records(path) {
  const rows = parseCsv(readFileSync(path, "utf8").replace(/^﻿/, ""));
  const header = rows[0];
  return rows.slice(1).filter((row) => row.some(Boolean)).map((row) => Object.fromEntries(header.map((name, index) => [name, row[index] ?? ""])));
}

test("unconfirmed and candidate routes remain review-required and write zero rows", () => {
  for (const routeStatus of ["unclassified_needs_owner_confirmation", "project_candidate_needs_review"]) {
    const rt = runtime(fixture({ route_status: routeStatus }));
    try {
      const report = runVoiceToTaskCandidates({ recordingManifestPath: rt.manifestPath, taskLedgerPath: rt.ledgerPath, apply: true });
      assert.equal(report.disposition, "review_required");
      assert.equal(report.written_rows, 0);
      assert.equal(report.route_suggestion, "P26-014");
      assert.equal(existsSync(rt.ledgerPath), false);
    } finally { rt.cleanup(); }
  }
});

test("incomplete accepted route and absolute draft ref write zero rows", () => {
  const cases = [
    fixture({ route_status: "accepted_project_route", accepted_project_code: "P26-014", accepted_at: "2026-07-11T09:30:00+09:00" }),
    { ...accepted(), payload_refs: { source_event_draft_ref: "/private/transcript/source_event_draft.yaml" } },
  ];
  for (const manifest of cases) {
    const rt = runtime(manifest);
    try {
      const report = runVoiceToTaskCandidates({ recordingManifestPath: rt.manifestPath, taskLedgerPath: rt.ledgerPath, apply: true });
      assert.equal(report.disposition, "review_required");
      assert.equal(report.written_rows, 0);
      assert.equal(existsSync(rt.ledgerPath), false);
    } finally { rt.cleanup(); }
  }
});

test("dry-run plans one accepted voice task without creating the ledger", () => {
  const rt = runtime(accepted());
  try {
    const report = runVoiceToTaskCandidates({ recordingManifestPath: rt.manifestPath, taskLedgerPath: rt.ledgerPath });
    assert.equal(report.disposition, "ready_to_apply");
    assert.equal(report.planned_rows, 1);
    assert.equal(report.written_rows, 0);
    assert.equal(existsSync(rt.ledgerPath), false);
  } finally { rt.cleanup(); }
});

test("accepted route atomically appends one metadata-only needs-review voice row and preserves unknown data", () => {
  const rt = runtime(accepted());
  try {
    mkdirSync(join(rt.root, "_workmeta", "P26-014", "reports", "할일_장부"), { recursive: true });
    writeFileSync(rt.ledgerPath, "﻿할일키,할일명,상태,사용자열\nmanualtask:1,기존 할일,open,보존값\n");
    const report = runVoiceToTaskCandidates({ recordingManifestPath: rt.manifestPath, taskLedgerPath: rt.ledgerPath, apply: true });
    assert.equal(report.disposition, "applied");
    assert.equal(report.written_rows, 1);

    const rows = records(rt.ledgerPath);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]["사용자열"], "보존값");
    const voice = rows[1];
    assert.equal(voice["할일키"], "voicetask:voice-20260711-001");
    assert.equal(voice["프로젝트코드"], "P26-014");
    assert.equal(voice["상태"], "unclassified");
    assert.equal(voice["출처"], "voice");
    assert.equal(voice["검토상태"], "needs_review");
    assert.equal(voice["원문복사여부"], "아니오");
    assert.equal(voice["소스계보"], "voicedraft:_workspaces/system/voice_capture/sessions/2026-07-11/voice-20260711-001/source_event_draft.yaml");
    const text = readFileSync(rt.ledgerPath, "utf8");
    assert.equal(text.includes("source.m4a"), false);
    assert.equal(text.includes("transcript.txt"), false);
  } finally { rt.cleanup(); }
});

test("re-running an accepted recording is idempotent", () => {
  const rt = runtime(accepted());
  try {
    const first = runVoiceToTaskCandidates({ recordingManifestPath: rt.manifestPath, taskLedgerPath: rt.ledgerPath, apply: true });
    const before = readFileSync(rt.ledgerPath, "utf8");
    const second = runVoiceToTaskCandidates({ recordingManifestPath: rt.manifestPath, taskLedgerPath: rt.ledgerPath, apply: true });
    assert.equal(first.written_rows, 1);
    assert.equal(second.disposition, "already_present");
    assert.equal(second.written_rows, 0);
    assert.equal(readFileSync(rt.ledgerPath, "utf8"), before);
  } finally { rt.cleanup(); }
});

test("unsafe existing ledger headers stop before mutation", () => {
  const rt = runtime(accepted());
  try {
    mkdirSync(join(rt.root, "_workmeta", "P26-014", "reports", "할일_장부"), { recursive: true });
    writeFileSync(rt.ledgerPath, "id,할일명\nlegacy,기존\n");
    const before = readFileSync(rt.ledgerPath, "utf8");
    assert.throws(
      () => runVoiceToTaskCandidates({ recordingManifestPath: rt.manifestPath, taskLedgerPath: rt.ledgerPath, apply: true }),
      /unsafe_task_ledger_headers/,
    );
    assert.equal(readFileSync(rt.ledgerPath, "utf8"), before);
  } finally { rt.cleanup(); }
});

test("dev-ERP preserves voice origin and keeps unanchored voice intake unclassified", () => {
  const rt = runtime(accepted());
  const dbPath = join(rt.root, "dev-erp.db");
  const store = openStore(dbPath);
  try {
    store.upsertProject({ id: "P26-014", title: "Synthetic", class: "active", data_label: "synthetic" });
    const result = store.ingestTaskItem({
      id: "voicetask:voice-20260711-001",
      project_code: "P26-014",
      title: "음성 기록 검토: voice-20260711-001",
      work_type: "review",
      status: "open",
      origin: "voice",
      review_status: "needs_review",
      source_lineage_ref: "voicedraft:_workspaces/system/voice_capture/source_event_draft.yaml",
    });
    assert.equal(result.ok, true);
    const row = store.db.prepare("SELECT origin, status, review_status FROM core_item WHERE id=?").get("voicetask:voice-20260711-001");
    assert.equal(row.origin, "voice");
    assert.equal(row.status, "unclassified");
    assert.equal(row.review_status, "needs_review");
  } finally {
    store.db.close();
    rt.cleanup();
  }
});

test("accepted route rejects a task-ledger owner mismatch before mutation", () => {
  const rt = runtime(accepted());
  const mismatched = join(rt.root, "_workmeta", "P99-999", "reports", "할일_장부", "할일_장부.csv");
  try {
    mkdirSync(join(rt.root, "_workmeta", "P99-999", "reports", "할일_장부"), { recursive: true });
    writeFileSync(mismatched, "﻿할일키,할일명\nmanualtask:1,기존 할일\n");
    const before = readFileSync(mismatched, "utf8");
    assert.throws(
      () => runVoiceToTaskCandidates({ recordingManifestPath: rt.manifestPath, taskLedgerPath: mismatched, apply: true }),
      /noncanonical_task_ledger_path:P26-014/,
    );
    assert.equal(readFileSync(mismatched, "utf8"), before);
  } finally { rt.cleanup(); }
});

test("accepted route requires the exact recording schema, safe accepter identity, and strict real ISO time", () => {
  const invalid = [
    { ...accepted(), schema_version: "soulforge.voice_recording_library_entry.v1" },
    fixture({ route_status: "accepted_project_route", accepted_project_code: "P26-014", accepted_by: "owner user", accepted_at: "2026-07-11T09:30:00+09:00" }),
    fixture({ route_status: "accepted_project_route", accepted_project_code: "P26-014", accepted_by: "../owner", accepted_at: "2026-07-11T09:30:00+09:00" }),
    fixture({ route_status: "accepted_project_route", accepted_project_code: "P26-014", accepted_by: "owner", accepted_at: "2026-02-30T09:30:00+09:00" }),
    fixture({ route_status: "accepted_project_route", accepted_project_code: "P26-014", accepted_by: "owner", accepted_at: "2026-07-11T09:30:00+15:00" }),
    fixture({ route_status: "accepted_project_route", accepted_project_code: "P26-014", accepted_by: "owner", accepted_at: "2026-07-11T09:30:00" }),
  ];
  for (const manifest of invalid) {
    const rt = runtime(manifest);
    try {
      const report = runVoiceToTaskCandidates({ recordingManifestPath: rt.manifestPath, taskLedgerPath: rt.ledgerPath, apply: true });
      assert.equal(report.disposition, "review_required");
      assert.equal(report.written_rows, 0);
      assert.equal(existsSync(rt.ledgerPath), false);
    } finally { rt.cleanup(); }
  }
});
