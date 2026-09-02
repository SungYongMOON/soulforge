// Synthetic Buzz exporter over a recorded, relay-shaped fixture.
//
// Used only by tests and dry validation. It performs the same work the live
// WSL transport does — apply the window, write the four export files into the
// run's staging directory, hash them, and return a `buzz_export.v1` meta — so
// the runner's verification path (digest re-check, row-count check, row-shape
// check, normalization, create-only custody) is exercised end to end without a
// WSL distribution, a container, a socket, or a clock dependency.
//
// The fixture is public-safe synthetic metadata. No process is spawned and no
// network call is made.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { BUZZ_EXPORT_FILE_KINDS, BUZZ_EXPORT_SCHEMA_VERSION } from "./buzz_wsl_exporter.mjs";

export const BUZZ_SYNTHETIC_FIXTURE_SCHEMA_VERSION = "soulforge.buzz_collect.synthetic_fixture.v1";

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export async function loadSyntheticBuzzFixture(fixturePath) {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  if (fixture?.schema_version !== BUZZ_SYNTHETIC_FIXTURE_SCHEMA_VERSION) {
    fail("synthetic_fixture_invalid", "Unexpected synthetic fixture schema");
  }
  return fixture;
}

// The relay's own comparison: PostgreSQL orders `timestamptz` values, and the
// exported ISO strings sort the same way for a fixed digit count, so the
// fixture is filtered on the parsed millisecond instant with the raw string as
// the microsecond tiebreak.
function instantOf(value) {
  const parts = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{1,6})Z$/u.exec(value);
  if (parts === null) fail("synthetic_clock_invalid", "Fixture timestamp is not a relay timestamp");
  return { ms: Date.parse(`${parts[1]}.${parts[2].padEnd(3, "0").slice(0, 3)}Z`), raw: value };
}

function after(candidate, boundaryIso, overlapSeconds) {
  if (boundaryIso === null) return true;
  const boundary = instantOf(boundaryIso).ms - overlapSeconds * 1000;
  return instantOf(candidate).ms > boundary;
}

function ascending(left, right, field) {
  const a = instantOf(left[field]);
  const b = instantOf(right[field]);
  if (a.ms !== b.ms) return a.ms - b.ms;
  if (a.raw !== b.raw) return a.raw < b.raw ? -1 : 1;
  return left.id.localeCompare(right.id);
}

export function createSyntheticBuzzExporter(fixture, { liveness = "ok", calls = [] } = {}) {
  if (fixture?.schema_version !== BUZZ_SYNTHETIC_FIXTURE_SCHEMA_VERSION) {
    fail("synthetic_fixture_invalid", "Unexpected synthetic fixture schema");
  }
  const working = structuredClone(fixture);
  return Object.freeze({
    kind: "synthetic",
    fixture: working,
    async probeLiveness({ timeout_ms: timeoutMs }) {
      calls.push({ operation: "buzz.read.liveness", timeout_ms: timeoutMs });
      if (liveness !== "ok") {
        const error = new Error("relay_liveness_unavailable");
        error.code = "relay_liveness_unavailable";
        throw error;
      }
      return { status_code: 200 };
    },
    async export({
      run_id: runId,
      staging_dir: stagingDir,
      received_since: receivedSince,
      deleted_since: deletedSince,
      audit_seq_min: auditSeqMin,
      overlap_seconds: overlapSeconds,
      row_limit: rowLimit,
    }) {
      calls.push({
        operation: "buzz.read.export",
        run_id: runId,
        received_since: receivedSince,
        deleted_since: deletedSince,
        audit_seq_min: auditSeqMin,
      });
      const events = working.events
        .filter((row) => row.deleted_at === null && after(row.received_at, receivedSince, overlapSeconds))
        .sort((left, right) => ascending(left, right, "received_at"))
        .slice(0, rowLimit);
      const tombstones = working.events
        .filter((row) => row.deleted_at !== null && after(row.deleted_at, deletedSince, overlapSeconds))
        .sort((left, right) => ascending(left, right, "deleted_at"))
        .slice(0, rowLimit);
      const audit = working.audit
        .filter((row) => Number(row.seq) >= auditSeqMin)
        .sort((left, right) => (
          left.community_id === right.community_id
            ? Number(left.seq) - Number(right.seq)
            : left.community_id.localeCompare(right.community_id)
        ))
        .slice(0, rowLimit);

      const payloads = new Map([
        ["events", `${events.map((row) => JSON.stringify(row)).join("\n")}${events.length === 0 ? "" : "\n"}`],
        ["tombstones", `${tombstones.map((row) => JSON.stringify(row)).join("\n")}${tombstones.length === 0 ? "" : "\n"}`],
        ["audit", `${audit.map((row) => JSON.stringify(row)).join("\n")}${audit.length === 0 ? "" : "\n"}`],
        ["snapshot", `${JSON.stringify(working.snapshot)}\n`],
      ]);
      const rowCounts = new Map([
        ["events", events.length],
        ["tombstones", tombstones.length],
        ["audit", audit.length],
        ["snapshot", 1],
      ]);

      const files = [];
      for (const kind of BUZZ_EXPORT_FILE_KINDS) {
        const name = `${kind}-${runId}.${kind === "snapshot" ? "json" : "jsonl"}`;
        const bytes = Buffer.from(payloads.get(kind), "utf8");
        // `wx` keeps the synthetic path create-only exactly like the shell
        // exporter's `set -C`, so a reused staging directory fails here too.
        await writeFile(path.resolve(stagingDir, name), bytes, { flag: "wx" });
        files.push({
          kind,
          name,
          sha256: sha256Bytes(bytes),
          bytes: bytes.length,
          rows: rowCounts.get(kind),
        });
      }
      return {
        schema_version: BUZZ_EXPORT_SCHEMA_VERSION,
        run_id: runId,
        generated_at: working.generated_at,
        community_count: working.community_count,
        window: {
          received_since: receivedSince,
          deleted_since: deletedSince,
          audit_seq_min: auditSeqMin,
          overlap_seconds: overlapSeconds,
          row_limit: rowLimit,
        },
        files,
      };
    },
  });
}
