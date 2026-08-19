#!/usr/bin/env node
// Soulforge Slack Archive Query MCP Server over stdio JSON-RPC 2.0.
//
// Usage:
//   node guild_hall/slack_history/slack_archive_mcp_server.mjs --binding <abs-path> --archive <abs-path> --expected-archive-sha256 <sha256:64hex>
//
// Pure read-only MCP server over local validated archive records.
// Never connects to Slack, never discovers network resources, never writes to disk.

import { createHash } from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";

import {
  createSlackArchiveIndex,
  SlackArchiveError,
  validateSlackArchiveEnvelope,
} from "./slack_archive_query.mjs";
import {
  createSlackArchiveJsonRpcHandler,
  validateSlackArchiveMcpBinding,
} from "./slack_archive_mcp_adapter.mjs";

export const EXIT = Object.freeze({
  OK: 0,
  ARGUMENTS: 64,
  CONFIG_ERROR: 3,
  INTERNAL_ERROR: 70,
});

export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB bound

export async function readBoundedRegularFile(targetPath, { maxBytes = MAX_FILE_BYTES } = {}) {
  if (typeof targetPath !== "string" || !isAbsolute(targetPath)) {
    throw new SlackArchiveError("absolute_path_required", "absolute_path_required");
  }

  let beforeStat;
  try {
    beforeStat = await lstat(targetPath);
  } catch {
    throw new SlackArchiveError("archive_read_failed", "archive_read_failed");
  }

  if (!beforeStat.isFile() || beforeStat.isSymbolicLink() || beforeStat.nlink !== 1) {
    throw new SlackArchiveError("file_type_invalid", "file_type_invalid");
  }

  if (beforeStat.size > maxBytes) {
    throw new SlackArchiveError("file_oversized", "file_oversized");
  }

  let canonicalPath;
  try {
    canonicalPath = await realpath(targetPath);
  } catch {
    throw new SlackArchiveError("archive_read_failed", "archive_read_failed");
  }

  if (resolve(canonicalPath) !== resolve(targetPath)) {
    throw new SlackArchiveError("reparse_path_forbidden", "reparse_path_forbidden");
  }

  let handle;
  try {
    handle = await open(targetPath, "r");
    const openedStat = await handle.stat();
    if (!openedStat.isFile() || openedStat.nlink !== 1
      || String(openedStat.dev) !== String(beforeStat.dev)
      || String(openedStat.ino) !== String(beforeStat.ino)
      || openedStat.size !== beforeStat.size
      || openedStat.mtimeMs !== beforeStat.mtimeMs) {
      throw new SlackArchiveError("file_identity_changed", "file_identity_changed");
    }

    const bytes = await handle.readFile();
    const afterHandleStat = await handle.stat();
    const afterPathStat = await lstat(targetPath);

    if (!afterPathStat.isFile() || afterPathStat.isSymbolicLink() || afterPathStat.nlink !== 1
      || String(afterHandleStat.dev) !== String(openedStat.dev)
      || String(afterHandleStat.ino) !== String(openedStat.ino)
      || afterHandleStat.size !== openedStat.size
      || afterHandleStat.mtimeMs !== openedStat.mtimeMs
      || String(afterPathStat.dev) !== String(openedStat.dev)
      || String(afterPathStat.ino) !== String(openedStat.ino)
      || afterPathStat.size !== openedStat.size
      || afterPathStat.mtimeMs !== openedStat.mtimeMs) {
      throw new SlackArchiveError("file_identity_changed", "file_identity_changed");
    }

    return bytes;
  } catch (error) {
    if (error instanceof SlackArchiveError) throw error;
    throw new SlackArchiveError("archive_read_failed", "archive_read_failed");
  } finally {
    if (handle !== undefined) {
      await handle.close().catch(() => {});
    }
  }
}

export function parseCliArguments(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) return { error: "unexpected_argument" };
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      return { error: "missing_flag_value" };
    }
    flags.set(token.slice(2), value);
    index += 1;
  }

  if (!flags.has("binding")) return { error: "binding_required" };
  if (!flags.has("archive")) return { error: "archive_required" };
  if (!flags.has("expected-archive-sha256")) return { error: "expected_archive_sha256_required" };

  for (const key of flags.keys()) {
    if (!["binding", "archive", "expected-archive-sha256"].includes(key)) {
      return { error: "unknown_flag" };
    }
  }

  const bindingRaw = flags.get("binding");
  const archiveRaw = flags.get("archive");
  const expectedSha = flags.get("expected-archive-sha256");

  if (!isAbsolute(bindingRaw)) return { error: "binding_path_must_be_absolute" };
  if (!isAbsolute(archiveRaw)) return { error: "archive_path_must_be_absolute" };
  if (!/^sha256:[0-9a-f]{64}$/.test(expectedSha)) {
    return { error: "expected_archive_sha256_invalid" };
  }

  return {
    bindingPath: resolve(bindingRaw),
    archivePath: resolve(archiveRaw),
    expectedArchiveSha256: expectedSha,
  };
}

export async function runSlackArchiveStdioServer({
  bindingPath,
  archivePath,
  expectedArchiveSha256,
  input = process.stdin,
  output = process.stdout,
} = {}) {
  const bindingBytes = await readBoundedRegularFile(bindingPath);
  let bindingRaw;
  try {
    bindingRaw = JSON.parse(bindingBytes.toString("utf8"));
  } catch {
    throw new SlackArchiveError("invalid_binding_json", "invalid_binding_json");
  }

  const runtimeBinding = validateSlackArchiveMcpBinding(bindingRaw);

  const normBindingPath = resolve(bindingPath);
  const normPrivateRoot = resolve(runtimeBinding.private_root);
  const relBinding = relative(normPrivateRoot, normBindingPath);
  if (relBinding === "" || normBindingPath === normPrivateRoot || relBinding.startsWith("..") || isAbsolute(relBinding)) {
    throw new SlackArchiveError("binding_outside_private_root", "binding_outside_private_root");
  }
  if (normBindingPath === runtimeBinding.archive_path) {
    throw new SlackArchiveError("binding_matches_archive_path", "binding_matches_archive_path");
  }

  if (resolve(archivePath) !== runtimeBinding.archive_path) {
    throw new SlackArchiveError("archive_path_binding_mismatch", "archive_path_binding_mismatch");
  }
  if (expectedArchiveSha256 !== runtimeBinding.archive_sha256) {
    throw new SlackArchiveError("archive_sha256_binding_mismatch", "archive_sha256_binding_mismatch");
  }

  const archiveBytes = await readBoundedRegularFile(runtimeBinding.archive_path, {
    maxBytes: runtimeBinding.max_archive_bytes,
  });

  const computedSha256 = `sha256:${createHash("sha256").update(archiveBytes).digest("hex")}`;
  if (computedSha256 !== runtimeBinding.archive_sha256) {
    throw new SlackArchiveError("archive_digest_mismatch", "archive_digest_mismatch");
  }

  let archiveRawPayload;
  try {
    archiveRawPayload = JSON.parse(archiveBytes.toString("utf8"));
  } catch {
    throw new SlackArchiveError("invalid_archive_json", "invalid_archive_json");
  }

  // Enforce strict archive envelope validation (no fallback, no loose shape)
  const validatedEnvelope = validateSlackArchiveEnvelope(archiveRawPayload);

  if (validatedEnvelope.binding.workspace_id !== runtimeBinding.scope.workspace_id
    || validatedEnvelope.binding.channel_id !== runtimeBinding.scope.channel_id) {
    throw new SlackArchiveError("binding_scope_mismatch", "binding_scope_mismatch", 403);
  }
  if (validatedEnvelope.binding.project_code !== runtimeBinding.scope.project_code) {
    throw new SlackArchiveError("binding_project_mismatch", "binding_project_mismatch", 403);
  }
  if (runtimeBinding.scope.binding_id && validatedEnvelope.binding.binding_id !== runtimeBinding.scope.binding_id) {
    throw new SlackArchiveError("binding_id_mismatch", "binding_id_mismatch", 403);
  }

  const index = createSlackArchiveIndex({
    binding: validatedEnvelope.binding,
    records: validatedEnvelope.records,
    coverage: validatedEnvelope.coverage,
  });

  const handleMessage = createSlackArchiveJsonRpcHandler({
    index,
    runtimeBinding,
  });

  const write = (payload) => output.write(`${JSON.stringify(payload)}\n`);
  const reader = createInterface({ input, crlfDelay: Infinity });

  for await (const line of reader) {
    const text = line.trim();
    if (text.length === 0) continue;
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      continue;
    }
    let outcome;
    try {
      outcome = await handleMessage(message);
    } catch (error) {
      const code = error?.code || "internal_error";
      outcome = { error: { code: -32603, message: "Internal error", data: { code } } };
    }
    if (outcome.notification === true) continue;
    const id = message?.id ?? null;
    if (id === null && outcome.result !== undefined) continue;
    write(outcome.result !== undefined
      ? { jsonrpc: "2.0", id, result: outcome.result }
      : { jsonrpc: "2.0", id, error: outcome.error });
  }
}

export function isDirectInvocation(entryPath, moduleUrl) {
  if (typeof entryPath !== "string" || entryPath.length === 0) return false;
  try {
    const entryUrl = new URL(`file://${entryPath.startsWith("/") ? "" : "/"}${entryPath.split("\\").join("/")}`).href;
    const normalise = (value) => value.replace(/^file:\/\/\/[A-Za-z]:/u, (prefix) => prefix.toLowerCase());
    return normalise(entryUrl) === normalise(moduleUrl);
  } catch {
    return false;
  }
}

async function main() {
  const parsed = parseCliArguments(process.argv.slice(2));
  if (parsed.error !== undefined) {
    process.stderr.write(`slack-archive-mcp: ${parsed.error}\n`);
    process.exitCode = EXIT.ARGUMENTS;
    return;
  }

  try {
    await runSlackArchiveStdioServer({
      bindingPath: parsed.bindingPath,
      archivePath: parsed.archivePath,
      expectedArchiveSha256: parsed.expectedArchiveSha256,
    });
  } catch (error) {
    const code = error?.code || "config_error";
    process.stderr.write(`slack-archive-mcp error: ${code}\n`);
    process.exitCode = EXIT.CONFIG_ERROR;
  }
}

if (isDirectInvocation(process.argv[1], import.meta.url)) {
  main().catch((error) => {
    const code = error?.code || "internal_fatal";
    process.stderr.write(`slack-archive-mcp fatal: ${code}\n`);
    process.exitCode = EXIT.INTERNAL_ERROR;
  });
}
