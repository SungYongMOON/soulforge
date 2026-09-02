// Operational transport for the Buzz collection lane (Tributary).
//
// The relay lives inside a WSL distribution's Docker stack, so the lane
// reaches it exactly twice per run and both times read-only:
//   1. an HTTP GET of the loopback `_liveness` endpoint, and
//   2. one `wsl.exe -d <distro> --exec bash <buzz_export.sh> …` process that
//      writes a bounded export into the run's staging directory.
// There is no persistent connection, no credential, and no SQL in this file:
// PostgreSQL is reached over the container's local socket by the pinned
// exporter script, whose bytes the runtime manifest already fixes.
//
// Nothing here writes into custody, state, or the repository.

import { execFile } from "node:child_process";
import { request as httpRequest } from "node:http";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

export const BUZZ_EXPORT_SCHEMA_VERSION = "buzz_export.v1";
export const BUZZ_EXPORT_BASENAME = "buzz_export.sh";
export const BUZZ_EXPORT_RUNTIME_RELATIVE_PATH = "guild_hall/buzz_history/buzz_export.sh";
export const BUZZ_EXPORT_FILE_KINDS = Object.freeze(["events", "tombstones", "audit", "snapshot"]);
export const BUZZ_LIVENESS_URL_PATTERN = /^http:\/\/127\.0\.0\.1:\d{1,5}\/_liveness$/u;

const META_FIELDS = Object.freeze([
  "schema_version",
  "run_id",
  "generated_at",
  "community_count",
  "window",
  "files",
]);
const META_WINDOW_FIELDS = Object.freeze([
  "received_since",
  "deleted_since",
  "audit_seq_min",
  "overlap_seconds",
  "row_limit",
]);
const META_FILE_FIELDS = Object.freeze(["kind", "name", "sha256", "bytes", "rows"]);
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
// The exporter's own `--out-dir` allowlist. A path component the script would
// refuse must never be handed to it in the first place.
const WSL_SEGMENT_PATTERN = /^[A-Za-z0-9._-]{1,255}$/u;
const DRIVE_PATH_PATTERN = /^([A-Za-z]):[\\/](.*)$/su;

export class BuzzExporterError extends Error {
  constructor(code, target, message) {
    super(`${code} at ${target}: ${message}`);
    this.name = "BuzzExporterError";
    this.code = code;
    this.path = target;
  }
}

function fail(code, target, message) {
  throw new BuzzExporterError(code, target, message);
}

function plainRecord(value, target) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("export_meta_invalid", target, "Expected a plain object");
  }
  return value;
}

function exactKeys(value, fields, target) {
  plainRecord(value, target);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) {
    fail("export_meta_invalid", target, `Expected exact keys: ${expected.join(",")}`);
  }
  return value;
}

// A Windows path becomes the drvfs path the distribution sees. Only a plain
// drive-letter path can be translated: a UNC share, a mapped network drive, or
// a device path has no unambiguous /mnt equivalent and is refused rather than
// guessed at.
export function toWslPath(windowsPath, mountPrefix = "/mnt") {
  if (typeof mountPrefix !== "string" || !/^\/[a-z]{1,32}$/u.test(mountPrefix)) {
    fail("wsl_mount_prefix_invalid", "$mount_prefix", "Expected a single-segment absolute mount prefix");
  }
  if (typeof windowsPath !== "string" || !path.isAbsolute(windowsPath)) {
    fail("wsl_path_unsupported", "$path", "Expected an absolute Windows path");
  }
  const match = DRIVE_PATH_PATTERN.exec(path.resolve(windowsPath));
  if (match === null) {
    fail("wsl_path_unsupported", "$path", "Only drive-letter paths can be translated");
  }
  const segments = match[2].split(/[\\/]/u).filter((segment) => segment.length > 0);
  for (const segment of segments) {
    if (segment === "." || segment === ".." || !WSL_SEGMENT_PATTERN.test(segment)) {
      fail("wsl_path_unsupported", "$path", "Path component is not a plain translatable name");
    }
  }
  return `${mountPrefix}/${match[1].toLowerCase()}${segments.length === 0 ? "" : `/${segments.join("/")}`}`;
}

// The launcher already pins the executable it runs; this pins the interpreter
// the lane hands work to. A `wsl.exe` that is a link, a directory, or some
// other basename is refused before any process is started.
export async function assertWslExecutableShape(wslExecutable) {
  if (typeof wslExecutable !== "string" || !path.isAbsolute(wslExecutable)) {
    fail("wsl_executable_invalid", "$relay.wsl_executable", "Expected an absolute path");
  }
  if (path.basename(wslExecutable).toLowerCase() !== "wsl.exe") {
    fail("wsl_executable_invalid", "$relay.wsl_executable", "Expected the wsl.exe basename");
  }
  const stat = await lstat(wslExecutable).catch(() => null);
  if (stat === null || !stat.isFile() || stat.isSymbolicLink()) {
    fail("wsl_executable_invalid", "$relay.wsl_executable", "Expected an existing normal file");
  }
  const canonical = await realpath(wslExecutable);
  if (path.resolve(canonical).toLowerCase() !== path.resolve(wslExecutable).toLowerCase()) {
    fail("wsl_executable_invalid", "$relay.wsl_executable", "Executable must not resolve through an alias");
  }
  return canonical;
}

// A carriage return anywhere in the exporter makes `bash` fail in ways that
// look like a relay problem, so the byte check is part of preflight instead of
// a runtime surprise. `.gitattributes` pins the checked-in bytes to LF; this
// catches a runtime tree that was copied through a CRLF-rewriting transfer.
export async function assertExporterScriptShape(scriptPath) {
  if (typeof scriptPath !== "string" || !path.isAbsolute(scriptPath)) {
    fail("exporter_script_invalid", "$exporter_script", "Expected an absolute path");
  }
  if (path.basename(scriptPath) !== BUZZ_EXPORT_BASENAME) {
    fail("exporter_script_invalid", "$exporter_script", "Exporter basename is fixed");
  }
  const stat = await lstat(scriptPath).catch(() => null);
  if (stat === null || !stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 1_048_576) {
    fail("exporter_script_invalid", "$exporter_script", "Expected one bounded normal file");
  }
  const bytes = await readFile(scriptPath);
  if (bytes.includes(0x0d)) {
    fail("exporter_script_crlf", "$exporter_script", "Exporter script must have LF line endings");
  }
  return scriptPath;
}

export function validateBuzzExportMeta(meta, { runId, expectedFileKinds = BUZZ_EXPORT_FILE_KINDS } = {}) {
  exactKeys(meta, META_FIELDS, "$export_meta");
  if (meta.schema_version !== BUZZ_EXPORT_SCHEMA_VERSION) {
    fail("export_meta_invalid", "$export_meta.schema_version", "Unexpected export schema");
  }
  if (meta.run_id !== runId) {
    fail("export_run_id_mismatch", "$export_meta.run_id", "Export belongs to a different run");
  }
  if (!Number.isSafeInteger(meta.community_count) || meta.community_count < 0) {
    fail("export_meta_invalid", "$export_meta.community_count", "Expected a non-negative community count");
  }
  exactKeys(meta.window, META_WINDOW_FIELDS, "$export_meta.window");
  if (!Array.isArray(meta.files) || meta.files.length !== expectedFileKinds.length) {
    fail("export_meta_invalid", "$export_meta.files", "Expected one entry per export file");
  }
  const byKind = new Map();
  meta.files.forEach((entry, index) => {
    const target = `$export_meta.files[${index}]`;
    exactKeys(entry, META_FILE_FIELDS, target);
    if (!expectedFileKinds.includes(entry.kind) || byKind.has(entry.kind)) {
      fail("export_meta_invalid", `${target}.kind`, "Unexpected or duplicated export file kind");
    }
    if (typeof entry.name !== "string" || !WSL_SEGMENT_PATTERN.test(entry.name)) {
      fail("export_meta_invalid", `${target}.name`, "Export file name is not a plain basename");
    }
    if (typeof entry.sha256 !== "string" || !SHA256_PATTERN.test(entry.sha256)) {
      fail("export_meta_invalid", `${target}.sha256`, "Expected a lowercase sha256 digest");
    }
    for (const field of ["bytes", "rows"]) {
      if (!Number.isSafeInteger(entry[field]) || entry[field] < 0) {
        fail("export_meta_invalid", `${target}.${field}`, "Expected a non-negative count");
      }
    }
    byKind.set(entry.kind, entry);
  });
  return meta;
}

async function probeLoopbackLiveness(livenessUrl, timeoutMs) {
  if (typeof livenessUrl !== "string" || !BUZZ_LIVENESS_URL_PATTERN.test(livenessUrl)) {
    fail("relay_liveness_url_invalid", "$relay.liveness_url", "Only a loopback _liveness URL is allowed");
  }
  const url = new URL(livenessUrl);
  return new Promise((resolve, reject) => {
    const call = httpRequest(
      {
        // Pinned to the loopback literal rather than resolved by name: no DNS
        // lookup happens, so no name can redirect this probe off the host.
        host: "127.0.0.1",
        port: Number(url.port),
        path: url.pathname,
        method: "GET",
        timeout: timeoutMs,
        headers: { connection: "close" },
      },
      (response) => {
        const chunks = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > 4096) {
            response.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8").trim();
          if (response.statusCode !== 200 || body !== "ok") {
            reject(new BuzzExporterError(
              "relay_liveness_unavailable",
              "$relay.liveness_url",
              "Relay did not answer the liveness probe with ok",
            ));
            return;
          }
          resolve({ status_code: 200 });
        });
      },
    );
    call.on("timeout", () => {
      call.destroy();
      reject(new BuzzExporterError("relay_liveness_unavailable", "$relay.liveness_url", "Liveness probe timed out"));
    });
    call.on("error", () => {
      reject(new BuzzExporterError("relay_liveness_unavailable", "$relay.liveness_url", "Liveness probe failed"));
    });
    call.end();
  });
}

function runExportProcess(wslExecutable, argumentList, { timeoutMs, maxBuffer }) {
  return new Promise((resolve, reject) => {
    execFile(
      wslExecutable,
      argumentList,
      { timeout: timeoutMs, windowsHide: true, maxBuffer, encoding: "utf8" },
      (error, stdout) => {
        if (error) {
          reject(new BuzzExporterError(
            error.killed === true ? "export_process_timeout" : "export_process_failed",
            "$exporter",
            // The exporter prints only its own rejection code on stderr; the
            // message is dropped so no relay value can reach a log.
            "Buzz export process did not complete",
          ));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

// Live transport. `export` writes the run's files into the staging directory
// and returns the parsed `buzz_export.v1` meta; the caller re-hashes every
// named file before trusting a byte of it.
export function createBuzzWslExporter({ relay, runtime_root: runtimeRoot }) {
  const mountPrefix = relay.mount_prefix;
  const exporterScriptPath = path.resolve(runtimeRoot, ...BUZZ_EXPORT_RUNTIME_RELATIVE_PATH.split("/"));
  return Object.freeze({
    kind: "wsl",
    exporter_script_path: exporterScriptPath,
    async probeLiveness({ timeout_ms: timeoutMs }) {
      return probeLoopbackLiveness(relay.liveness_url, timeoutMs);
    },
    async export({
      run_id: runId,
      staging_dir: stagingDir,
      received_since: receivedSince,
      deleted_since: deletedSince,
      audit_seq_min: auditSeqMin,
      overlap_seconds: overlapSeconds,
      row_limit: rowLimit,
      timeout_ms: timeoutMs,
    }) {
      await assertExporterScriptShape(exporterScriptPath);
      const wslExecutable = await assertWslExecutableShape(relay.wsl_executable);
      const argumentList = [
        "-d", relay.wsl_distro,
        "--exec", "bash", toWslPath(exporterScriptPath, mountPrefix),
        "--run", runId,
        "--out-dir", toWslPath(stagingDir, mountPrefix),
      ];
      if (receivedSince !== null) argumentList.push("--received-since", receivedSince);
      if (deletedSince !== null) argumentList.push("--deleted-since", deletedSince);
      argumentList.push(
        "--audit-seq-min", String(auditSeqMin),
        "--overlap-seconds", String(overlapSeconds),
        "--limit", String(rowLimit),
        "--container", relay.postgres_container,
        "--db-name", relay.db_name,
        "--db-user", relay.db_user,
      );
      const stdout = await runExportProcess(wslExecutable, argumentList, {
        timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
      });
      let meta;
      try {
        meta = JSON.parse(stdout.replace(/^﻿/u, ""));
      } catch {
        fail("export_meta_invalid", "$exporter", "Exporter did not print a JSON meta document");
      }
      return validateBuzzExportMeta(meta, { runId });
    },
  });
}
