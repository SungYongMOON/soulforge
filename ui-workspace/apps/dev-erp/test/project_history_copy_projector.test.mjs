import assert from "node:assert/strict";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import {
  ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION,
} from "../../../../guild_hall/shared/project_history_actual_shadow.mjs";
import {
  sha256Canonical,
} from "../../../../guild_hall/shared/project_history_envelope.mjs";
import {
  buildSyntheticFiveLaneShadowFixture,
  buildSyntheticH06CoverageFixture,
} from "../../../../guild_hall/shared/project_history_readiness.mjs";
import {
  PROJECT_HISTORY_COPY_COLUMNS,
  inspectStandaloneSqliteCopy,
  productionLookingPathReasons,
  projectCopiedErpHistory,
  protectSpreadsheetFormula,
} from "../tools/project_history_copy_projector.mjs";
import {
  PROJECT_HISTORY_COPY_XLSX_READBACK_SCHEMA_VERSION,
  verifyCopiedProjectHistoryProjection,
} from "../tools/project_history_copy_verifier.mjs";

function makeGeneration(overrides = {}) {
  const shadow = buildSyntheticFiveLaneShadowFixture();
  const coverage = buildSyntheticH06CoverageFixture(shadow.envelopes);
  return {
    schema_version: ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION,
    generation_id: "-copied-erp-shadow-generation",
    project_ref: shadow.project_ref,
    classification_state: "shadow",
    envelopes: shadow.envelopes,
    coverage_receipts: coverage.receipts,
    ordered_event_digest: sha256Canonical(shadow.envelopes.map((envelope) => envelope.metadata_digest)),
    source_attestation_digest: sha256Canonical({ source: "synthetic-copy-attestation" }),
    raw_payload_copied: false,
    accepted_history: false,
    ...overrides,
  };
}

function createCopiedDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      CREATE TABLE accepted_project_history_current (
        pointer_name TEXT PRIMARY KEY,
        generation_id TEXT NOT NULL
      ) STRICT;
      INSERT INTO accepted_project_history_current VALUES ('accepted', 'production-generation-sentinel');
    `);
  } finally {
    db.close();
  }
}

function makeFixture(t, directoryName = "copy") {
  const root = mkdtempSync(path.join(os.tmpdir(), "soulforge-ph-copy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, directoryName);
  const dbPath = path.join(directory, "pilot-copy.sqlite");
  const csvPath = path.join(directory, "project-history.csv");
  const xlsxInputPath = path.join(directory, "project-history.xlsx-input.json");
  const readbackPath = path.join(directory, "project-history.xlsx-readback.json");
  const parent = path.dirname(dbPath);
  mkdirSync(parent, { recursive: true });
  createCopiedDatabase(dbPath);
  return { root, dbPath, csvPath, xlsxInputPath, readbackPath };
}

test("projects one immutable generation into an existing copied DB and replays byte-identically", (t) => {
  const fixture = makeFixture(t);
  const generation = makeGeneration();
  const attestation = sha256Canonical(generation);

  const inserted = projectCopiedErpHistory({
    ...fixture,
    generation,
    pilotCopy: true,
    attestation,
  });
  assert.equal(inserted.status, "inserted");
  assert.equal(inserted.event_count, 5);
  assert.equal(inserted.coverage_count, 5);
  assert.equal(inserted.accepted_history, false);
  assert.equal(inserted.raw_payload_copied, false);

  const firstCsv = readFileSync(fixture.csvPath);
  const firstXlsxInput = readFileSync(fixture.xlsxInputPath);
  const xlsxInput = JSON.parse(firstXlsxInput.toString("utf8"));
  assert.deepEqual(xlsxInput.columns, PROJECT_HISTORY_COPY_COLUMNS);
  assert.equal(xlsxInput.rows.length, 5);
  assert.equal(xlsxInput.rows[0].generation_id, "'-copied-erp-shadow-generation");
  assert.equal(xlsxInput.hidden_sheets, false);
  assert.equal(xlsxInput.external_links, false);
  assert.equal(xlsxInput.formula_cells, false);

  const replayed = projectCopiedErpHistory({
    ...fixture,
    generation,
    pilotCopy: true,
    attestation,
  });
  assert.equal(replayed.status, "replayed");
  assert.deepEqual(readFileSync(fixture.csvPath), firstCsv);
  assert.deepEqual(readFileSync(fixture.xlsxInputPath), firstXlsxInput);

  const db = new DatabaseSync(fixture.dbPath);
  try {
    const pointer = db.prepare("SELECT generation_id FROM accepted_project_history_current").get();
    assert.equal(pointer.generation_id, "production-generation-sentinel");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_history_generation").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_history_event").get().count, 5);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_history_coverage").get().count, 5);
    assert.throws(
      () => db.exec("UPDATE project_history_generation SET classification_state = 'shadow'"),
      /immutable/u,
    );
    assert.throws(
      () => db.exec("DELETE FROM project_history_event"),
      /immutable/u,
    );
    assert.throws(
      () => db.prepare(`
        INSERT OR REPLACE INTO project_history_generation (
          generation_id, schema_version, project_id, project_ref_json, classification_state,
          event_count, coverage_count, ordered_event_digest, source_attestation_digest,
          packet_digest, raw_payload_copied, accepted_history
        ) SELECT generation_id, schema_version, project_id, project_ref_json, classification_state,
                 event_count, coverage_count, ordered_event_digest, source_attestation_digest,
                 packet_digest, raw_payload_copied, accepted_history
            FROM project_history_generation LIMIT 1
      `).run(),
      /immutable/u,
    );
  } finally {
    db.close();
  }

  const readback = {
    schema_version: PROJECT_HISTORY_COPY_XLSX_READBACK_SCHEMA_VERSION,
    generation_id: xlsxInput.generation_id,
    event_count: xlsxInput.event_count,
    coverage_count: xlsxInput.coverage_count,
    ordered_event_digest: xlsxInput.ordered_event_digest,
    ordered_row_digest: xlsxInput.ordered_row_digest,
    columns: xlsxInput.columns,
    rows: xlsxInput.rows,
    hidden_sheet_count: 0,
    external_link_count: 0,
    formula_cell_count: 0,
  };
  writeFileSync(fixture.readbackPath, `${JSON.stringify(readback)}\n`, "utf8");
  const verified = verifyCopiedProjectHistoryProjection({
    ...fixture,
    generationId: generation.generation_id,
    xlsxReadbackPath: fixture.readbackPath,
    pilotCopy: true,
    attestation,
  });
  assert.equal(verified.query_only, true);
  assert.equal(verified.sqlite_total_changes, 0);
  assert.equal(verified.db_csv_parity, true);
  assert.equal(verified.db_xlsx_input_parity, true);
  assert.equal(verified.xlsx_readback, "verified");
});

test("fails closed on conflicting generation digest without touching accepted pointers", (t) => {
  const fixture = makeFixture(t);
  const generation = makeGeneration();
  projectCopiedErpHistory({
    ...fixture,
    generation,
    pilotCopy: true,
    attestation: sha256Canonical(generation),
  });

  const conflict = makeGeneration({
    source_attestation_digest: sha256Canonical({ source: "different-synthetic-attestation" }),
  });
  assert.throws(
    () => projectCopiedErpHistory({
      ...fixture,
      generation: conflict,
      pilotCopy: true,
      attestation: sha256Canonical(conflict),
    }),
    (error) => error.code === "generation_digest_conflict",
  );

  const db = new DatabaseSync(fixture.dbPath, { readOnly: true });
  try {
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_history_generation").get().count, 1);
    assert.equal(
      db.prepare("SELECT generation_id FROM accepted_project_history_current").get().generation_id,
      "production-generation-sentinel",
    );
  } finally {
    db.close();
  }
});

test("requires explicit pilot authorization and an existing sidecar-free SQLite copy", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "soulforge-ph-guard-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const missingPath = path.join(root, "missing.sqlite");
  const generation = makeGeneration();
  assert.throws(
    () => projectCopiedErpHistory({
      dbPath: missingPath,
      generation,
      csvPath: path.join(root, "projection.csv"),
      xlsxInputPath: path.join(root, "projection.xlsx-input.json"),
      pilotCopy: true,
      attestation: sha256Canonical(generation),
    }),
    (error) => error.code === "sqlite_copy_missing",
  );
  assert.equal(readFileDoesNotExist(missingPath), true);

  const fixture = makeFixture(t, "production");
  assert(productionLookingPathReasons(fixture.dbPath).includes("production_segment"));
  assert.throws(
    () => projectCopiedErpHistory({
      ...fixture,
      generation,
      attestation: sha256Canonical(generation),
    }),
    (error) => error.code === "pilot_copy_flag_required",
  );
  assert.throws(
    () => projectCopiedErpHistory({
      ...fixture,
      generation,
      pilotCopy: true,
      attestation: null,
    }),
    (error) => error.code === "digest_invalid",
  );
  const productionCopyResult = projectCopiedErpHistory({
    ...fixture,
    generation,
    pilotCopy: true,
    attestation: sha256Canonical(generation),
  });
  assert.equal(productionCopyResult.status, "inserted");
  writeFileSync(`${fixture.dbPath}-wal`, "synthetic sidecar sentinel", "utf8");
  assert.throws(
    () => inspectStandaloneSqliteCopy(fixture.dbPath),
    (error) => error.code === "sqlite_sidecar_present",
  );
});

test("classifies a non-system Windows drive without embedding a host locator", () => {
  if (process.platform !== "win32") return;
  const systemDrive = path.parse(process.env.SystemRoot ?? "").root.slice(0, 1).toUpperCase();
  const alternateDrive = systemDrive === "Z" ? "Y" : "Z";
  const candidate = `${alternateDrive}:${path.sep}isolated-pilot${path.sep}copy.sqlite`;
  assert(productionLookingPathReasons(candidate).includes("live_drive"));
});

test("standalone-copy inspection rejects hardlinked database aliases", (t) => {
  const fixture = makeFixture(t);
  const aliasPath = path.join(fixture.root, "copy-hardlink.sqlite");
  linkSync(fixture.dbPath, aliasPath);
  assert.throws(
    () => inspectStandaloneSqliteCopy(aliasPath),
    (error) => error.code === "sqlite_copy_hardlink_forbidden",
  );
});

test("weakened lookalike projection schema rolls back all newly created schema", (t) => {
  const fixture = makeFixture(t);
  const db = new DatabaseSync(fixture.dbPath);
  try {
    db.exec("CREATE TABLE project_history_generation (generation_id TEXT PRIMARY KEY)");
  } finally {
    db.close();
  }
  const generation = makeGeneration();
  assert.throws(
    () => projectCopiedErpHistory({
      ...fixture,
      generation,
      pilotCopy: true,
      attestation: sha256Canonical(generation),
    }),
    (error) => error.code === "projection_schema_conflict",
  );
  const readback = new DatabaseSync(fixture.dbPath, { readOnly: true });
  try {
    const names = readback.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'project_history_%' ORDER BY name",
    ).all().map((row) => row.name);
    assert.deepEqual(names, ["project_history_generation"]);
  } finally {
    readback.close();
  }
});

test("verifier detects CSV and XLSX-readback parity or boundary tampering", (t) => {
  const fixture = makeFixture(t);
  const generation = makeGeneration();
  const attestation = sha256Canonical(generation);
  projectCopiedErpHistory({ ...fixture, generation, pilotCopy: true, attestation });

  const originalCsv = readFileSync(fixture.csvPath, "utf8");
  writeFileSync(fixture.csvPath, originalCsv.replace(",mail,", ",voice,"), "utf8");
  assert.throws(
    () => verifyCopiedProjectHistoryProjection({
      ...fixture,
      generationId: generation.generation_id,
      pilotCopy: true,
      attestation,
    }),
    (error) => error.code === "csv_parity_mismatch",
  );

  writeFileSync(fixture.csvPath, originalCsv, "utf8");
  const model = JSON.parse(readFileSync(fixture.xlsxInputPath, "utf8"));
  writeFileSync(fixture.readbackPath, JSON.stringify({
    schema_version: PROJECT_HISTORY_COPY_XLSX_READBACK_SCHEMA_VERSION,
    generation_id: model.generation_id,
    event_count: model.event_count,
    coverage_count: model.coverage_count,
    ordered_event_digest: model.ordered_event_digest,
    ordered_row_digest: model.ordered_row_digest,
    columns: model.columns,
    rows: model.rows,
    hidden_sheet_count: 1,
    external_link_count: 0,
    formula_cell_count: 0,
  }), "utf8");
  assert.throws(
    () => verifyCopiedProjectHistoryProjection({
      ...fixture,
      generationId: generation.generation_id,
      xlsxReadbackPath: fixture.readbackPath,
      pilotCopy: true,
      attestation,
    }),
    (error) => error.code === "xlsx_readback_boundary_invalid",
  );
});

test("formula protection neutralizes every spreadsheet execution prefix", () => {
  for (const value of ["=1+1", "+cmd", "-2+3", "@SUM(A1:A2)", "  =HYPERLINK(\"x\")"]) {
    const protectedValue = protectSpreadsheetFormula(value);
    assert(protectedValue.startsWith("'"));
    assert(!/^[\t\r\n ]*[=+\-@]/u.test(protectedValue));
  }
  assert.equal(protectSpreadsheetFormula("2026-07-19T00:00:00.000Z"), "2026-07-19T00:00:00.000Z");
});

test("projector and query-only verifier CLIs require the explicit copied-pilot contract", (t) => {
  const fixture = makeFixture(t);
  const generation = makeGeneration();
  const attestation = sha256Canonical(generation);
  const packetPath = path.join(fixture.root, "actual-generation.json");
  writeFileSync(packetPath, `${JSON.stringify(generation)}\n`, "utf8");
  const projectorPath = fileURLToPath(new URL("../tools/project_history_copy_projector.mjs", import.meta.url));
  const verifierPath = fileURLToPath(new URL("../tools/project_history_copy_verifier.mjs", import.meta.url));

  const projected = spawnSync(process.execPath, [
    projectorPath,
    "--pilot-copy",
    "--attestation", attestation,
    "--db", fixture.dbPath,
    "--packet", packetPath,
    "--csv", fixture.csvPath,
    "--xlsx-input", fixture.xlsxInputPath,
  ], { encoding: "utf8" });
  assert.equal(projected.status, 0, projected.stderr);
  assert.equal(JSON.parse(projected.stdout).status, "inserted");

  const verified = spawnSync(process.execPath, [
    verifierPath,
    "--pilot-copy",
    "--attestation", attestation,
    "--db", fixture.dbPath,
    "--generation-id", generation.generation_id,
    "--csv", fixture.csvPath,
    "--xlsx-input", fixture.xlsxInputPath,
  ], { encoding: "utf8" });
  assert.equal(verified.status, 0, verified.stderr);
  const receipt = JSON.parse(verified.stdout);
  assert.equal(receipt.query_only, true);
  assert.equal(receipt.db_csv_parity, true);
  assert.equal(receipt.db_xlsx_input_parity, true);
});

function readFileDoesNotExist(filePath) {
  try {
    readFileSync(filePath);
    return false;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}
