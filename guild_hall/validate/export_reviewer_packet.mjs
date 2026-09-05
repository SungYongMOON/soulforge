#!/usr/bin/env node

// Reviewer packet exporter.
//
// External reviewers (a person new to the project, or an outside model behind a
// repository connector that cannot index a tree this size) need one public-safe
// file that carries the whole picture: what Soulforge is, its canon roots, the
// three products, the world names, the physical spine, the team pilot model and
// what is running today. This tool concatenates a FIXED, ordered list of
// tracked public documents into `docs/reviews/reviewer_packet_<date>.md`
// plus a refs-only manifest, and refuses to write anything that fails the local
// absolute-path policy. Private nested trees (`_workmeta`, `private-state`,
// `_workspaces`) are never eligible, by construction.
//
//   node guild_hall/validate/export_reviewer_packet.mjs [--date YYYY-MM-DD]
//        [--out <relative .md path>] [--changelog-lines N] [--dry-run]
//
// Exit 0 on success (or a clean dry run); exit 1 on a policy violation,
// a missing document or a size overrun. The packet is a projection, not canon:
// every section names the owning document it was copied from.

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { findLocalAbsolutePathViolations } from "./local_absolute_path_policy.mjs";

export const REVIEWER_PACKET_SCHEMA_VERSION = "soulforge.reviewer_packet.v1";
export const REVIEWER_PACKET_DEFAULT_CHANGELOG_LINES = 400;
export const REVIEWER_PACKET_MAX_BYTES = 2_000_000;

// Ordered reading list. Each entry: relative path, short reason, optional line cap.
export const REVIEWER_PACKET_DOCUMENTS = Object.freeze([
  { path: "README.md", reason: "one-page identity, canon roots, reading order" },
  { path: "docs/architecture/foundation/SOULFORGE_WORLD_BIBLE_V0.md", reason: "world one-page, era, current state, retired display terms" },
  { path: "docs/architecture/foundation/SOULFORGE_OWNER_MASTER_ARCHITECTURE_AND_RELEASE_MAP_V1.md", reason: "master map M0-M16, current declaration" },
  { path: "docs/architecture/foundation/SHARED_GLOSSARY_V0.md", reason: "shared vocabulary and the world-name table with origins" },
  { path: "docs/architecture/foundation/DOCUMENT_OWNERSHIP.md", reason: "who owns which document" },
  { path: "docs/architecture/foundation/TARGET_TREE.md", reason: "canonical target tree" },
  { path: "docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md", reason: "how agents may act" },
  { path: "AGENTS.md", reason: "agent router: work locations, safety, routing" },
  { path: "docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md", reason: "direction, active slice, backlog rules" },
  { path: "docs/architecture/foundation/team_member_engineering_program/00_MASTER_INDEX_AND_DECISIONS.md", reason: "program index and decisions" },
  { path: "docs/architecture/foundation/team_member_engineering_program/10_EXTERNAL_CONNECTORS_AND_BACKUP.md", reason: "collection vs backup, connector matrix" },
  { path: "docs/architecture/foundation/team_member_engineering_program/17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md", reason: "physical spine and storage classes" },
  { path: "docs/architecture/foundation/team_member_engineering_program/18_TEAM_PILOT_ACCESS_AND_RELEASE_PLAN_V0.md", reason: "team pilot access model, bot roster, release ladder" },
  { path: "docs/reviews/EXTERNAL_REVIEW_MAP_2026-09-05.md", reason: "how the last external review maps onto the canon" },
  { path: "CHANGELOG.md", reason: "recent public changes (head only)", max_lines: REVIEWER_PACKET_DEFAULT_CHANGELOG_LINES },
]);

const PRIVATE_PREFIXES = Object.freeze(["_workmeta", "private-state", "_workspaces", "node_modules", ".git"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function sha256Hex(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function assertPublicRelativePath(relativePath) {
  const normalized = relativePath.split("\\").join("/");
  if (path.posix.isAbsolute(normalized) || normalized.split("/").includes("..")) {
    fail("packet_path_invalid", "Documents must be repository-relative");
  }
  const head = normalized.split("/")[0];
  if (PRIVATE_PREFIXES.includes(head)) {
    fail("packet_private_tree_forbidden", "Private and generated trees are never packet members");
  }
  return normalized;
}

async function readCurrentCommit(root) {
  try {
    const head = (await readFile(path.join(root, ".git", "HEAD"), "utf8")).trim();
    if (!head.startsWith("ref: ")) return head;
    const ref = head.slice("ref: ".length);
    return (await readFile(path.join(root, ".git", ...ref.split("/")), "utf8")).trim();
  } catch {
    return null;
  }
}

function capLines(text, maxLines) {
  if (!Number.isSafeInteger(maxLines) || maxLines <= 0) return { text, included: text.split("\n").length, truncated: false };
  const lines = text.split("\n");
  if (lines.length <= maxLines) return { text, included: lines.length, truncated: false };
  return { text: `${lines.slice(0, maxLines).join("\n")}\n\n> [reviewer packet: truncated after ${maxLines} lines; the full file is in the repository]\n`, included: maxLines, truncated: true };
}

export async function buildReviewerPacket({
  root,
  date,
  documents = REVIEWER_PACKET_DOCUMENTS,
  changelog_lines: changelogLines = REVIEWER_PACKET_DEFAULT_CHANGELOG_LINES,
  max_bytes: maxBytes = REVIEWER_PACKET_MAX_BYTES,
}) {
  if (typeof root !== "string" || !path.isAbsolute(root)) fail("packet_root_invalid", "Repository root must be absolute");
  if (typeof date !== "string" || !DATE_PATTERN.test(date)) fail("packet_date_invalid", "Expected YYYY-MM-DD");
  const commit = await readCurrentCommit(root);
  const sections = [];
  const manifestDocuments = [];
  for (const [index, entry] of documents.entries()) {
    const relativePath = assertPublicRelativePath(entry.path);
    const absolute = path.resolve(root, ...relativePath.split("/"));
    let bytes;
    try {
      bytes = await readFile(absolute);
    } catch {
      fail("packet_document_missing", `Missing packet document: ${relativePath}`);
    }
    const maxLines = entry.max_lines ?? (relativePath === "CHANGELOG.md" ? changelogLines : 0);
    const capped = capLines(bytes.toString("utf8").replace(/^\uFEFF/u, ""), maxLines);
    sections.push([
      "",
      "---",
      "",
      `<!-- reviewer packet section ${index + 1}: ${relativePath} -->`,
      `# [${index + 1}/${documents.length}] ${relativePath}`,
      "",
      `> Source document: \`${relativePath}\` (${entry.reason}). Owner and status live in the source; this copy is a projection.`,
      "",
      capped.text.trimEnd(),
      "",
    ].join("\n"));
    manifestDocuments.push({
      relative_path: relativePath,
      reason: entry.reason,
      source_bytes: bytes.length,
      source_sha256: sha256Hex(bytes),
      lines_included: capped.included,
      truncated: capped.truncated,
    });
  }
  const header = [
    "# Soulforge reviewer packet",
    "",
    `Generated ${date} from the public repository${commit ? ` at commit \`${commit.slice(0, 12)}\`` : ""}.`,
    "",
    "This file is a projection for reviewers who cannot read the whole tree: one",
    "ordered concatenation of the public documents that carry the identity, the",
    "canon, the physical architecture, the team pilot model and the recent change",
    "history. It is not canon. Each section names its source; the source wins.",
    "Private trees (`_workmeta`, `private-state`, `_workspaces`) and every",
    "host-local path are excluded by construction, and the exporter refuses to",
    "write a packet that fails the local absolute-path policy.",
    "",
    "Reading order: sections are in the order a newcomer should read them.",
    "",
    "## Contents",
    "",
    ...manifestDocuments.map((document, index) => `${index + 1}. \`${document.relative_path}\` — ${document.reason}${document.truncated ? " (head only)" : ""}`),
    "",
  ].join("\n");
  const text = `${header}${sections.join("\n")}`;
  const violations = findLocalAbsolutePathViolations(text, "reviewer_packet");
  const packetBytes = Buffer.from(text, "utf8");
  const manifest = {
    schema_version: REVIEWER_PACKET_SCHEMA_VERSION,
    generated_on: date,
    source_commit: commit,
    document_count: manifestDocuments.length,
    documents: manifestDocuments,
    packet_bytes: packetBytes.length,
    packet_sha256: sha256Hex(packetBytes),
    path_policy_violations: violations.length,
  };
  if (packetBytes.length > maxBytes) fail("packet_too_large", `Packet exceeds ${maxBytes} bytes`);
  return { text, bytes: packetBytes, manifest, violations };
}

function parseArguments(argv) {
  const request = { date: null, out: null, changelog_lines: REVIEWER_PACKET_DEFAULT_CHANGELOG_LINES, dry_run: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--dry-run") {
      request.dry_run = true;
    } else if (["--date", "--out", "--changelog-lines"].includes(flag)) {
      if (index + 1 >= argv.length) fail("packet_argument_invalid", `${flag} requires a value`);
      const value = argv[index + 1];
      index += 1;
      if (flag === "--date") request.date = value;
      else if (flag === "--out") request.out = value;
      else request.changelog_lines = Number.parseInt(value, 10);
    } else {
      fail("packet_argument_invalid", `Unknown argument ${flag}`);
    }
  }
  if (request.date === null) request.date = new Date().toISOString().slice(0, 10);
  if (!Number.isSafeInteger(request.changelog_lines) || request.changelog_lines < 1) {
    fail("packet_argument_invalid", "--changelog-lines must be a positive integer");
  }
  return request;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const request = parseArguments(process.argv.slice(2));
  const built = await buildReviewerPacket({ root, date: request.date, changelog_lines: request.changelog_lines });
  const outRelative = assertPublicRelativePath(request.out ?? `docs/reviews/reviewer_packet_${request.date}.md`);
  const outAbsolute = path.resolve(root, ...outRelative.split("/"));
  const summary = {
    mode: request.dry_run ? "dry_run" : "write",
    out: outRelative,
    document_count: built.manifest.document_count,
    packet_bytes: built.manifest.packet_bytes,
    packet_sha256: built.manifest.packet_sha256,
    path_policy_violations: built.violations.length,
  };
  if (built.violations.length > 0) {
    process.stdout.write(`${JSON.stringify({ ...summary, written: false })}\n`);
    process.stderr.write(`reviewer_packet_rejected:path_policy_violation (${built.violations.length})\n`);
    process.exitCode = 1;
    return;
  }
  if (request.dry_run) {
    process.stdout.write(`${JSON.stringify({ ...summary, written: false })}\n`);
    return;
  }
  await mkdir(path.dirname(outAbsolute), { recursive: true });
  await writeFile(outAbsolute, built.bytes);
  await writeFile(`${outAbsolute.replace(/\.md$/u, "")}.manifest.json`, `${JSON.stringify(built.manifest, null, 2)}\n`, "utf8");
  const written = await stat(outAbsolute);
  process.stdout.write(`${JSON.stringify({ ...summary, written: true, bytes_on_disk: written.size })}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath !== null && invokedPath.toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  main().catch((error) => {
    const code = /^[a-z][a-z0-9_]{0,95}$/u.test(String(error?.code ?? "")) ? error.code : "unknown_failure";
    process.stderr.write(`reviewer_packet_rejected:${code}\n`);
    process.exitCode = 1;
  });
}
