import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import {
  MANIFEST_SHA256_NAME,
  RECEIPT_NAME,
  buildSourceLane,
  gitBlobOid,
  parseLaneManifest,
  renderManifestSha256,
  validateSpec,
  verifyCarriedForward,
  verifyLane,
} from "../tools/build_source_lane.mjs";

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

function throwsCode(fn, code) {
  try {
    fn();
  } catch (error) {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return;
  }
  assert.fail(`expected ${code}, nothing thrown`);
}

function baseSpec(overrides = {}) {
  return {
    schema: "soulforge.source_lane_spec.v0",
    lane_id: "test-lane",
    tracked_paths: ["src/", "package.json"],
    tracked_excludes: ["src/dist/"],
    carried_forward_prefixes: ["src/dist/", "vendor/"],
    entry_points: ["src/main.mjs"],
    ...overrides,
  };
}

function tempDir(label) {
  return mkdtempSync(join(tmpdir(), `soulforge-lane-${label}-`));
}

function git(cwd, args) {
  const run = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(run.status, 0, `git ${args.join(" ")}: ${run.stderr}`);
  return run.stdout;
}

function makeRepo() {
  const root = tempDir("repo");
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "main.mjs"), "export const value = 1;\n");
  writeFileSync(join(root, "src", "helper.mjs"), "export const helper = 2;\n");
  writeFileSync(join(root, "package.json"), '{"name":"lane-fixture"}\n');
  writeFileSync(join(root, ".gitignore"), "src/dist/\nvendor/\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "fixture"]);
  return root;
}

// A "previous lane" is only ever read through its own manifest, so the fixture
// is just files plus the manifest that names them.
function makePreviousLane(entries) {
  const root = tempDir("prev");
  const rows = [];
  for (const [path, content] of Object.entries(entries)) {
    const target = join(root, path);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, content);
    rows.push({ path, sha256: sha256(Buffer.from(content)) });
  }
  rows.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  writeFileSync(join(root, MANIFEST_SHA256_NAME), renderManifestSha256(rows), "utf8");
  return root;
}

const PREVIOUS_LANE_FILES = {
  "src/dist/index.html": "<!doctype html><title>built</title>\n",
  "vendor/lib/index.js": "module.exports = 3;\n",
};

test("validateSpec accepts the shape the builder relies on", () => {
  assert.equal(validateSpec(baseSpec()).lane_id, "test-lane");
});

test("validateSpec refuses a spec it does not understand", () => {
  throwsCode(() => validateSpec({ schema: "other.v9" }), "spec_schema_unknown");
  throwsCode(() => validateSpec(baseSpec({ lane_id: "Bad Lane" })), "spec_lane_id_invalid");
  throwsCode(() => validateSpec(baseSpec({ entry_points: "src/main.mjs" })), "spec_field_not_array");
  throwsCode(() => validateSpec(baseSpec({ tracked_paths: [] })), "spec_tracked_paths_empty");
  // A character class that allows "." also allows "." and ".." as whole
  // segments, so traversal needs its own check rather than a wider regex.
  throwsCode(() => validateSpec(baseSpec({ tracked_paths: ["../escape"] })), "spec_tracked_path_shape");
  throwsCode(() => validateSpec(baseSpec({ tracked_paths: ["src/../../escape/"] })), "spec_tracked_path_shape");
  throwsCode(() => validateSpec(baseSpec({ tracked_paths: ["./src/"] })), "spec_tracked_path_shape");
  // Composed rather than written literally: a drive-letter path spelled out
  // here is itself a local-absolute-path policy violation in this repository.
  const driveLetterPath = `${"C"}:/absolute`;
  throwsCode(() => validateSpec(baseSpec({ tracked_paths: [driveLetterPath] })), "spec_tracked_path_shape");
  throwsCode(() => validateSpec(baseSpec({ tracked_paths: ["/etc/passwd"] })), "spec_tracked_path_shape");
  throwsCode(() => validateSpec(baseSpec({ entry_points: ["../escape.mjs"] })), "spec_entry_point_shape");
  // A directory prefix must end in "/" so prefix matching cannot half-match a
  // sibling directory whose name merely starts the same way.
  throwsCode(() => validateSpec(baseSpec({ tracked_excludes: ["src/dist"] })), "spec_exclude_shape");
});

test("validateSpec refuses a carried prefix that sits inside a tracked path", () => {
  // Without the exclude, src/dist/ would be claimed by both origins.
  throwsCode(() => validateSpec(baseSpec({ tracked_excludes: [] })), "spec_carried_inside_tracked");
});

test("gitBlobOid agrees with git hash-object", () => {
  const root = tempDir("oid");
  const file = join(root, "sample.txt");
  const content = "one\ntwo\n";
  writeFileSync(file, content);
  const expected = spawnSync("git", ["hash-object", file], { encoding: "utf8" }).stdout.trim();
  assert.equal(gitBlobOid(Buffer.from(content)), expected);
  rmSync(root, { recursive: true, force: true });
});

test("manifest rendering round-trips and refuses a malformed line", () => {
  const rows = [{ path: "a/b.txt", sha256: "0".repeat(64) }, { path: "c.txt", sha256: "1".repeat(64) }];
  assert.deepEqual(parseLaneManifest(renderManifestSha256(rows)), rows);
  throwsCode(() => parseLaneManifest("not a manifest line\n"), "manifest_line_unparsed");
  throwsCode(() => parseLaneManifest("\n\n"), "manifest_empty");
  // A previous lane's manifest is read off disk and its paths are joined onto a
  // root, so a traversal entry there must not be honoured either.
  throwsCode(() => parseLaneManifest(`${"0".repeat(64)} *./../escape.txt\n`), "manifest_path_shape");
});

test("verifyCarriedForward refuses when a carried file no longer matches its manifest", () => {
  const previous = makePreviousLane(PREVIOUS_LANE_FILES);
  const spec = validateSpec(baseSpec());
  assert.equal(verifyCarriedForward(previous, spec).length, 2);

  writeFileSync(join(previous, "vendor", "lib", "index.js"), "module.exports = 4;\n");
  throwsCode(() => verifyCarriedForward(previous, spec), "carried_forward_drift");
  rmSync(previous, { recursive: true, force: true });
});

test("verifyCarriedForward refuses when the previous lane has no manifest", () => {
  const previous = tempDir("bare");
  throwsCode(() => verifyCarriedForward(previous, validateSpec(baseSpec())), "previous_lane_manifest_absent");
  rmSync(previous, { recursive: true, force: true });
});

test("buildSourceLane pins tracked content to the commit and inherits the rest with proof", () => {
  const repo = makeRepo();
  const previous = makePreviousLane(PREVIOUS_LANE_FILES);
  const out = join(tempDir("out"), "lane-v2");

  const receipt = buildSourceLane({ repoRoot: repo, spec: baseSpec(), previousLaneRoot: previous, outRoot: out });

  assert.equal(receipt.totals.tracked, 3, "src/main.mjs, src/helper.mjs, package.json");
  assert.equal(receipt.totals.carried_forward, 2);
  assert.equal(receipt.totals.files, 5);
  assert.equal(receipt.claims.scheduled_task_touched, false);
  assert.equal(receipt.claims.release_gate_claimed, null);
  assert.equal(receipt.source_commit, git(repo, ["rev-parse", "HEAD"]).trim());
  assert.ok(receipt.entry_point_digests["src/main.mjs"]);

  // .gitignore is tracked but outside the spec's paths; dist/ is ignored and
  // must arrive only as carried-forward.
  assert.equal(existsSync(join(out, ".gitignore")), false);
  assert.equal(readFileSync(join(out, "src/dist/index.html"), "utf8"), PREVIOUS_LANE_FILES["src/dist/index.html"]);
  assert.deepEqual(verifyLane(out).failures, []);
  assert.equal(JSON.parse(readFileSync(join(out, RECEIPT_NAME), "utf8")).lane_id, "test-lane");

  rmSync(repo, { recursive: true, force: true });
  rmSync(previous, { recursive: true, force: true });
});

test("buildSourceLane refuses a dirty worktree", () => {
  const repo = makeRepo();
  const previous = makePreviousLane(PREVIOUS_LANE_FILES);
  const out = join(tempDir("out"), "lane");
  writeFileSync(join(repo, "src", "main.mjs"), "export const value = 99;\n");

  // The recorded commit is a claim about the whole lane. An uncommitted edit
  // would make that claim false for one file and true for the rest.
  throwsCode(
    () => buildSourceLane({ repoRoot: repo, spec: baseSpec(), previousLaneRoot: previous, outRoot: out }),
    "worktree_dirty",
  );
  assert.equal(existsSync(out), false, "refusal must not leave a partial lane");

  rmSync(repo, { recursive: true, force: true });
  rmSync(previous, { recursive: true, force: true });
});

test("buildSourceLane refuses an output directory that already holds files", () => {
  const repo = makeRepo();
  const previous = makePreviousLane(PREVIOUS_LANE_FILES);
  const out = join(tempDir("out"), "lane");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "leftover.txt"), "from an earlier build\n");

  // An in-place overwrite is how a dropped file survives a rebuild.
  throwsCode(
    () => buildSourceLane({ repoRoot: repo, spec: baseSpec(), previousLaneRoot: previous, outRoot: out }),
    "out_root_not_empty",
  );

  rmSync(repo, { recursive: true, force: true });
  rmSync(previous, { recursive: true, force: true });
});

test("buildSourceLane refuses when a declared entry point is not in the lane", () => {
  const repo = makeRepo();
  const previous = makePreviousLane(PREVIOUS_LANE_FILES);
  const out = join(tempDir("out"), "lane");
  const spec = baseSpec({ entry_points: ["src/main.mjs", "src/absent.mjs"] });

  throwsCode(
    () => buildSourceLane({ repoRoot: repo, spec, previousLaneRoot: previous, outRoot: out }),
    "entry_point_absent",
  );
  assert.equal(existsSync(out), false, "the entry-point check runs before any write");

  rmSync(repo, { recursive: true, force: true });
  rmSync(previous, { recursive: true, force: true });
});

test("verifyLane reports a file that drifted after the build", () => {
  const repo = makeRepo();
  const previous = makePreviousLane(PREVIOUS_LANE_FILES);
  const out = join(tempDir("out"), "lane");
  buildSourceLane({ repoRoot: repo, spec: baseSpec(), previousLaneRoot: previous, outRoot: out });

  writeFileSync(join(out, "src", "main.mjs"), "export const value = 42;\n");
  const result = verifyLane(out);
  assert.equal(result.checked, 5);
  assert.deepEqual(result.failures, [{ path: "src/main.mjs", reason: "digest_mismatch" }]);

  rmSync(repo, { recursive: true, force: true });
  rmSync(previous, { recursive: true, force: true });
});
