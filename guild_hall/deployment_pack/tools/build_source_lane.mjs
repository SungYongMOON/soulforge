// Source-lane builder — makes the lane that actually runs reproducible from a commit.
//
// A "source lane" is the copy of the repository that a scheduled task executes.
// Unlike a deployment pack it is not a pure function of tracked files: it also
// carries an untracked dependency closure (node_modules) and a gitignored build
// output (the Board's vite dist/). The operations lane that has been running
// since 2026-09-02 was assembled by a scratchpad script that no longer exists,
// so nobody could rebuild it, and every repository fix since then stayed in the
// repository. This tool closes that gap.
//
// What it proves:
// - tracked files are pinned to an exact commit: every file's git blob object id
//   is recomputed from the bytes actually copied and matched against `ls-tree`,
//   so a working-directory file that differs from the commit cannot enter
// - the working tree must be clean, so the recorded commit is the whole truth
// - carried-forward files (the untracked closure) are copied from a previous
//   lane only after every one of them is re-hashed and matched against that
//   lane's own manifest — inherited with proof, not with trust
// - tracked and carried sets may not overlap: exactly one origin per file
// - nothing is written until all of the above passes, and everything written is
//   re-hashed afterwards against the manifest this tool just emitted
//
// What it does NOT do: register or modify a scheduled task, delete a previous
// lane, promote a ring, or claim a release gate. Cutover stays an Owner step and
// is a bundle, not a copy: collector pin, binding digest, launcher, state digest
// fence, and the recovery-binding action_digest re-pin. This tool produces the
// input to that bundle and nothing else.

import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const SOURCE_LANE_SPEC_SCHEMA = "soulforge.source_lane_spec.v0";
export const SOURCE_LANE_RECEIPT_SCHEMA = "soulforge.source_lane_build_receipt.v0";

export const MANIFEST_SHA256_NAME = "LANE_MANIFEST.sha256";
export const MANIFEST_MD_NAME = "LANE_MANIFEST.md";
export const RECEIPT_NAME = "build.receipt.json";

// Repository-relative POSIX path: no absolute, no drive letter, no traversal.
// The character class alone is not enough — it admits "." and ".." as whole
// segments, so `../escape` would pass shape while escaping the repository.
const REL_PATH = /^[A-Za-z0-9_.@+-]+(?:\/[A-Za-z0-9_.@+-]+)*$/;
const DIR_PREFIX = /^[A-Za-z0-9_.@+-]+(?:\/[A-Za-z0-9_.@+-]+)*\/$/;

function hasDotSegment(path) {
  return path.split("/").some((segment) => segment === "." || segment === "..");
}

export function isRepoRelativeFile(path) {
  return typeof path === "string" && REL_PATH.test(path) && !hasDotSegment(path);
}

export function isRepoRelativeDirPrefix(path) {
  return typeof path === "string" && DIR_PREFIX.test(path) && !hasDotSegment(path);
}
// `sha256sum -b` output shape, as the existing lanes write it.
const MANIFEST_LINE = /^([0-9a-f]{64}) \*\.\/(.+)$/;

const GIT_MODE_SYMLINK = "120000";
const GIT_MODE_GITLINK = "160000";

export function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

// A git blob object id is sha1 over `blob <bytelength>\0<contents>`. Recomputing
// it from the bytes we are about to copy is what turns "the tree looked clean"
// into "this exact file is the commit's file".
export function gitBlobOid(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, "utf8");
  return createHash("sha1").update(Buffer.concat([header, buffer])).digest("hex");
}

function git(repoRoot, args, { encoding = "utf8" } = {}) {
  const run = spawnSync("git", ["--no-optional-locks", ...args], {
    cwd: repoRoot,
    encoding,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_ADVICE: "0", GIT_OPTIONAL_LOCKS: "0" },
  });
  if (run.error) fail("git_spawn_failed", run.error.message);
  if (run.status !== 0) fail("git_failed", `${args.join(" ")}:${String(run.stderr ?? "").trim()}`);
  return run.stdout;
}

export function validateSpec(spec) {
  if (!spec || typeof spec !== "object") fail("spec_not_object");
  if (spec.schema !== SOURCE_LANE_SPEC_SCHEMA) fail("spec_schema_unknown", String(spec.schema));
  if (typeof spec.lane_id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(spec.lane_id)) {
    fail("spec_lane_id_invalid", String(spec.lane_id));
  }
  const arrays = ["tracked_paths", "tracked_excludes", "carried_forward_prefixes", "entry_points"];
  for (const key of arrays) {
    if (!Array.isArray(spec[key])) fail("spec_field_not_array", key);
  }
  if (spec.tracked_paths.length === 0) fail("spec_tracked_paths_empty");
  for (const p of spec.tracked_paths) {
    // A tracked path is either a file (`package.json`) or a directory prefix
    // (`guild_hall/watchtower/`). Both shapes are repository-relative.
    if (!isRepoRelativeFile(p) && !isRepoRelativeDirPrefix(p)) fail("spec_tracked_path_shape", String(p));
  }
  for (const p of spec.tracked_excludes) {
    if (!isRepoRelativeDirPrefix(p)) fail("spec_exclude_shape", String(p));
  }
  for (const p of spec.carried_forward_prefixes) {
    if (!isRepoRelativeDirPrefix(p)) fail("spec_carried_prefix_shape", String(p));
  }
  for (const p of spec.entry_points) {
    if (!isRepoRelativeFile(p)) fail("spec_entry_point_shape", String(p));
  }
  // A carried prefix that sits inside a tracked path would give one file two
  // origins. Catch it in the spec rather than in the overlap check, so the
  // message names the spec line that is wrong.
  for (const carried of spec.carried_forward_prefixes) {
    for (const tracked of spec.tracked_paths) {
      if (isRepoRelativeDirPrefix(tracked) && carried.startsWith(tracked)) {
        const excluded = spec.tracked_excludes.some((ex) => carried.startsWith(ex) || ex.startsWith(carried));
        if (!excluded) fail("spec_carried_inside_tracked", `${carried} inside ${tracked}`);
      }
    }
  }
  return spec;
}

export function requireCleanTree(repoRoot) {
  const status = git(repoRoot, ["status", "--porcelain"]).trim();
  if (status !== "") fail("worktree_dirty", status.split("\n").slice(0, 5).join(" | "));
  const format = git(repoRoot, ["rev-parse", "--show-object-format"]).trim();
  // The blob-oid proof below is sha1. A sha256 repository is not wrong, it is
  // just not something this tool has been taught to verify.
  if (format !== "sha1") fail("object_format_unsupported", format);
  return git(repoRoot, ["rev-parse", "HEAD"]).trim();
}

// Select the tracked file set at `commit`. Excludes are applied here rather than
// through pathspec magic so the selection rule is visible in one place.
export function selectTrackedFiles(repoRoot, commit, spec) {
  const raw = git(repoRoot, ["ls-tree", "-r", "-z", commit, "--", ...spec.tracked_paths]);
  const rows = [];
  for (const record of raw.split("\0")) {
    if (record === "") continue;
    const tab = record.indexOf("\t");
    if (tab < 0) fail("ls_tree_unparsed", record.slice(0, 80));
    const [mode, type, oid] = record.slice(0, tab).split(/\s+/u);
    const path = record.slice(tab + 1);
    if (spec.tracked_excludes.some((ex) => path.startsWith(ex))) continue;
    if (!isRepoRelativeFile(path)) fail("tracked_path_shape", path);
    if (mode === GIT_MODE_SYMLINK) fail("tracked_symlink_refused", path);
    if (mode === GIT_MODE_GITLINK || type !== "blob") fail("tracked_not_blob", `${path}:${type}`);
    rows.push({ path, oid });
  }
  if (rows.length === 0) fail("tracked_set_empty");
  return rows.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
}

export function parseLaneManifest(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const match = MANIFEST_LINE.exec(line.replace(/\r$/u, ""));
    if (!match) fail("manifest_line_unparsed", line.slice(0, 80));
    // A manifest is an untrusted input: it comes from a previous lane on disk,
    // and its paths are joined onto a root and read.
    if (!isRepoRelativeFile(match[2])) fail("manifest_path_shape", match[2]);
    rows.push({ sha256: match[1], path: match[2] });
  }
  if (rows.length === 0) fail("manifest_empty");
  return rows;
}

// Read the previous lane's own manifest, keep the carried prefixes, and prove
// every one of those files still hashes to what that manifest says.
//
// `keepBytes` returns the verified bytes alongside the row. A lane carries
// thousands of small files across a mounted filesystem where per-file cost
// dominates, so reading each one twice - once to verify, once to copy - is not
// just slower, it opens a window in which the bytes verified and the bytes
// copied are not the same bytes.
export function verifyCarriedForward(previousLaneRoot, spec, { keepBytes = false } = {}) {
  const manifestPath = join(previousLaneRoot, MANIFEST_SHA256_NAME);
  if (!existsSync(manifestPath)) fail("previous_lane_manifest_absent", manifestPath);
  const all = parseLaneManifest(readFileSync(manifestPath, "utf8"));
  const selected = all.filter((row) => spec.carried_forward_prefixes.some((p) => row.path.startsWith(p)));
  if (selected.length === 0) fail("carried_set_empty");
  const drift = [];
  for (const row of selected) {
    const filePath = join(previousLaneRoot, row.path);
    if (!existsSync(filePath)) { drift.push({ path: row.path, reason: "absent" }); continue; }
    if (lstatSync(filePath).isSymbolicLink()) { drift.push({ path: row.path, reason: "symlink" }); continue; }
    const bytes = readFileSync(filePath);
    const actual = sha256(bytes);
    if (actual !== row.sha256) { drift.push({ path: row.path, reason: "digest_mismatch" }); continue; }
    if (keepBytes) row.bytes = bytes;
  }
  if (drift.length > 0) {
    fail("carried_forward_drift", `${drift.length} file(s), first=${drift[0].path}:${drift[0].reason}`);
  }
  return selected.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
}

export function renderManifestSha256(entries) {
  return entries.map((e) => `${e.sha256} *./${e.path}`).join("\n") + "\n";
}

// Re-hash every file a lane's manifest names. This is the whole of `--verify`,
// and it also runs as the post-write gate of a build.
export function verifyLane(laneRoot) {
  const manifestPath = join(laneRoot, MANIFEST_SHA256_NAME);
  if (!existsSync(manifestPath)) fail("lane_manifest_absent", manifestPath);
  const rows = parseLaneManifest(readFileSync(manifestPath, "utf8"));
  const failures = [];
  for (const row of rows) {
    const filePath = join(laneRoot, row.path);
    if (!existsSync(filePath)) { failures.push({ path: row.path, reason: "absent" }); continue; }
    if (sha256(readFileSync(filePath)) !== row.sha256) failures.push({ path: row.path, reason: "digest_mismatch" });
  }
  return { checked: rows.length, failures };
}

function listExistingFiles(root, prefix = "") {
  const out = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listExistingFiles(root, rel));
    else out.push(rel);
  }
  return out;
}

export function buildSourceLane({ repoRoot, spec, previousLaneRoot, outRoot, now = () => new Date() }) {
  validateSpec(spec);
  const repo = resolve(repoRoot);
  const out = resolve(outRoot);
  const previous = resolve(previousLaneRoot);
  if (out === previous || out === repo) fail("out_root_conflict", out);
  // Refusing a populated output directory is deliberate: an in-place overwrite
  // is how a stale file survives a rebuild and how a half-written lane becomes
  // indistinguishable from a whole one.
  if (existsSync(out) && listExistingFiles(out).length > 0) fail("out_root_not_empty", out);

  const commit = requireCleanTree(repo);
  const tracked = selectTrackedFiles(repo, commit, spec);
  const carried = verifyCarriedForward(previous, spec, { keepBytes: true });

  const trackedPaths = new Set(tracked.map((r) => r.path));
  const overlap = carried.filter((r) => trackedPaths.has(r.path)).map((r) => r.path);
  if (overlap.length > 0) fail("tracked_carried_overlap", overlap.slice(0, 3).join(","));

  // ---- validate-before-write: read and prove every byte first ----
  const staged = [];
  for (const row of tracked) {
    const filePath = join(repo, row.path);
    if (!existsSync(filePath)) fail("tracked_file_absent_in_worktree", row.path);
    if (lstatSync(filePath).isSymbolicLink()) fail("tracked_symlink_refused", row.path);
    const bytes = readFileSync(filePath);
    const oid = gitBlobOid(bytes);
    if (oid !== row.oid) fail("tracked_content_not_at_commit", `${row.path}:${oid}!=${row.oid}`);
    staged.push({ path: row.path, bytes, sha256: sha256(bytes), origin: "tracked" });
  }
  for (const row of carried) {
    // These are the very bytes verifyCarriedForward hashed, not a second read
    // of the same path.
    if (!Buffer.isBuffer(row.bytes)) fail("carried_forward_bytes_absent", row.path);
    staged.push({ path: row.path, bytes: row.bytes, sha256: row.sha256, origin: "carried_forward" });
  }
  staged.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));

  const entryDigests = {};
  for (const entry of spec.entry_points) {
    const hit = staged.find((s) => s.path === entry);
    if (!hit) fail("entry_point_absent", entry);
    entryDigests[entry] = hit.sha256;
  }

  // ---- write ----
  for (const file of staged) {
    const target = join(out, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.bytes);
  }
  const manifestText = renderManifestSha256(staged.map((s) => ({ path: s.path, sha256: s.sha256 })));
  writeFileSync(join(out, MANIFEST_SHA256_NAME), manifestText, "utf8");

  // ---- post-write gate ----
  const verified = verifyLane(out);
  if (verified.failures.length > 0) {
    fail("post_write_verification_failed", `${verified.failures.length} file(s), first=${verified.failures[0].path}`);
  }

  const totals = {
    files: staged.length,
    bytes: staged.reduce((sum, s) => sum + s.bytes.length, 0),
    tracked: tracked.length,
    carried_forward: carried.length,
  };
  const receipt = {
    schema: SOURCE_LANE_RECEIPT_SCHEMA,
    lane_id: spec.lane_id,
    built_at: now().toISOString(),
    source_commit: commit,
    previous_lane_manifest_sha256: sha256(readFileSync(join(previous, MANIFEST_SHA256_NAME))),
    manifest_sha256: sha256(Buffer.from(manifestText, "utf8")),
    totals,
    entry_point_digests: entryDigests,
    claims: {
      // Said out loud so a reader never has to infer it from silence.
      tracked_content_pinned_to_commit: true,
      carried_forward_verified_against_previous_lane: true,
      post_write_reverified: true,
      release_gate_claimed: null,
      scheduled_task_touched: false,
      previous_lane_modified: false,
    },
  };
  writeFileSync(join(out, RECEIPT_NAME), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}

export function renderManifestMarkdown(receipt, spec) {
  const lines = [
    `# ${spec.lane_id} — LANE MANIFEST`,
    "",
    `Built by \`guild_hall/deployment_pack/tools/build_source_lane.mjs\` at ${receipt.built_at}.`,
    "Whether any scheduled task points here is not recorded in this file — a built lane is not a live lane.",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Source commit | \`${receipt.source_commit}\` (clean worktree required at build time) |`,
    `| Files | ${receipt.totals.files} (${receipt.totals.tracked} tracked, ${receipt.totals.carried_forward} carried forward) |`,
    `| Bytes | ${receipt.totals.bytes} |`,
    `| Manifest digest | \`${receipt.manifest_sha256}\` |`,
    `| Previous lane manifest digest | \`${receipt.previous_lane_manifest_sha256}\` |`,
    "",
    "## What each origin means",
    "",
    "- **tracked** — read from the working tree and proved byte-identical to the commit by recomputing each file's git blob object id. A file the commit does not contain cannot be here.",
    "- **carried_forward** — the untracked dependency closure and build output, copied from the previous lane after every file was re-hashed against that lane's own manifest. Inherited with proof; not rebuilt.",
    "",
    "## Entry-point digests",
    "",
    "| Lane path | sha256 |",
    "| --- | --- |",
  ];
  for (const [path, digest] of Object.entries(receipt.entry_point_digests)) {
    lines.push(`| \`${path}\` | \`${digest}\` |`);
  }
  lines.push(
    "",
    "## Re-verify at any time",
    "",
    "```",
    "node guild_hall/deployment_pack/tools/build_source_lane.mjs --verify <lane root>",
    "```",
    "",
    "Runtime writers may add files this manifest does not name (a Python `__pycache__`, for example); verification checks the named files and ignores extras.",
    "",
  );
  return lines.join("\n");
}

function optionValue(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) fail("option_value_missing", name);
  return value;
}

async function main(argv) {
  const verifyTarget = optionValue(argv, "--verify");
  if (verifyTarget !== null) {
    const result = verifyLane(resolve(verifyTarget));
    process.stdout.write(`checked ${result.checked} file(s), ${result.failures.length} failure(s)\n`);
    for (const failure of result.failures.slice(0, 20)) {
      process.stdout.write(`  ${failure.reason}  ${failure.path}\n`);
    }
    process.exitCode = result.failures.length === 0 ? 0 : 1;
    return;
  }

  const specPath = optionValue(argv, "--spec");
  const outRoot = optionValue(argv, "--out");
  const previousLaneRoot = optionValue(argv, "--previous-lane");
  const repoRoot = optionValue(argv, "--repo") ?? process.cwd();
  if (specPath === null || outRoot === null || previousLaneRoot === null) {
    process.stdout.write(
      [
        "build_source_lane — assemble a runnable source lane from a commit.",
        "",
        "  --spec <spec.json>        lane spec (tracked paths, carried-forward prefixes, entry points)",
        "  --previous-lane <dir>     lane to inherit the untracked closure from, verified against its manifest",
        "  --out <dir>               output lane root (must be empty or absent)",
        "  --repo <dir>              repository root (default: cwd); its worktree must be clean",
        "",
        "  --verify <dir>            re-hash an existing lane against its own manifest and exit",
        "",
        "Builds bytes only. It does not register a scheduled task, touch the previous",
        "lane, or claim a release gate.",
        "",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  const spec = JSON.parse(readFileSync(resolve(specPath), "utf8"));
  const receipt = buildSourceLane({ repoRoot, spec, previousLaneRoot, outRoot });
  writeFileSync(join(resolve(outRoot), MANIFEST_MD_NAME), renderManifestMarkdown(receipt, spec), "utf8");
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/gu, "/")}`) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.code ?? "error"}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
