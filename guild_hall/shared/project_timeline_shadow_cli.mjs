#!/usr/bin/env node

import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  buildProjectTimelineShadow,
  renderProjectTimelineCsv,
  renderProjectTimelineMonthJsonl,
} from "./project_timeline_shadow.mjs";

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function parseArgs(argv) {
  const args = {
    apply: false,
    project_root: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") {
      args.apply = true;
      continue;
    }
    if (token === "--project-root") {
      args.project_root = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    fail("argument_invalid", `unsupported argument ${token}`);
  }
  return args;
}

async function statOrNull(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function canonicalProjectRoot(projectRoot, projectCode) {
  if (typeof projectRoot !== "string" || !path.isAbsolute(projectRoot)) {
    fail("absolute_project_root_required", "--project-root must be absolute");
  }
  const stat = await statOrNull(projectRoot);
  if (stat === null || !stat.isDirectory() || stat.isSymbolicLink()) {
    fail("project_root_invalid", "--project-root must be an existing normal directory");
  }
  const canonical = await realpath(projectRoot);
  if (path.resolve(canonical) !== path.resolve(projectRoot)) {
    fail("project_root_alias_forbidden", "--project-root must not resolve through an alias");
  }
  if (path.basename(canonical) !== projectCode) {
    fail("project_root_code_mismatch", "--project-root basename must equal project_code");
  }
  return canonical;
}

async function ensureNoAliasInExistingAncestors(target, stopRoot) {
  let cursor = path.resolve(target);
  const stop = path.resolve(stopRoot);
  while (cursor !== stop) {
    const stat = await statOrNull(cursor);
    if (stat !== null && stat.isSymbolicLink()) {
      fail("output_alias_forbidden", "output path contains a symlink or junction");
    }
    const parent = path.dirname(cursor);
    if (parent === cursor || !cursor.startsWith(`${stop}${path.sep}`)) {
      fail("output_escape", "output path escaped the project root");
    }
    cursor = parent;
  }
}

async function atomicWrite(target, content, { replace = false } = {}) {
  const existing = await statOrNull(target);
  if (existing !== null && (!existing.isFile() || existing.isSymbolicLink())) {
    fail("output_target_invalid", "output target must be a normal file");
  }
  if (existing !== null) {
    const current = await readFile(target, "utf8");
    if (current === content) return;
    if (!replace) {
      fail("immutable_output_conflict", "an immutable generation output already differs");
    }
  }
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
  try {
    if (existing !== null) await rm(target);
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function materialize(shadow, projectRoot) {
  const canonicalRoot = await canonicalProjectRoot(projectRoot, shadow.project_code);
  const timelineRoot = path.join(
    canonicalRoot,
    "project_context",
    "projections",
    "timeline",
  );
  await ensureNoAliasInExistingAncestors(timelineRoot, canonicalRoot);
  const generationRoot = path.join(
    timelineRoot,
    "generations",
    shadow.generation_id,
  );
  const monthRoot = path.join(generationRoot, "by_month");
  await mkdir(monthRoot, { recursive: true });
  await ensureNoAliasInExistingAncestors(monthRoot, canonicalRoot);
  await atomicWrite(
    path.join(generationRoot, "generation.json"),
    `${JSON.stringify(shadow, null, 2)}\n`,
  );
  await atomicWrite(
    path.join(timelineRoot, "current.csv"),
    renderProjectTimelineCsv(shadow),
    { replace: true },
  );
  const monthFiles = [];
  for (const [month, jsonl] of renderProjectTimelineMonthJsonl(shadow)) {
    const filename = `${month}.jsonl`;
    await atomicWrite(path.join(monthRoot, filename), jsonl);
    monthFiles.push(filename);
  }
  const receipt = {
    schema_version: "soulforge.project_timeline_shadow_materialization.v1",
    project_code: shadow.project_code,
    generation_id: shadow.generation_id,
    generated_at: shadow.generated_at,
    shadow_digest: shadow.shadow_digest,
    entry_count: shadow.projection.project_timelines[0].entries.length,
    month_files: monthFiles,
    output_refs: {
      generation: `project_context/projections/timeline/generations/${shadow.generation_id}/generation.json`,
      current_csv: "project_context/projections/timeline/current.csv",
    },
    boundaries: shadow.boundaries,
  };
  await atomicWrite(
    path.join(generationRoot, "materialization_receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  return receipt;
}

async function readStdinBytes() {
  const chunks = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > 16 * 1024 * 1024) {
      fail("stdin_size_invalid", "stdin JSON must be 2 bytes to 16 MiB");
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputBytes = await readStdinBytes();
  if (inputBytes.length < 2 || inputBytes.length > 16 * 1024 * 1024) {
    fail("stdin_size_invalid", "stdin JSON must be 2 bytes to 16 MiB");
  }
  let input;
  try {
    input = JSON.parse(inputBytes.toString("utf8").replace(/^\uFEFF/u, ""));
  } catch (error) {
    fail("stdin_json_invalid", String(error?.message ?? error));
  }
  const shadow = buildProjectTimelineShadow(input);
  const entryCount = shadow.projection.project_timelines[0].entries.length;
  if (!args.apply) {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      apply: false,
      project_code: shadow.project_code,
      generation_id: shadow.generation_id,
      shadow_digest: shadow.shadow_digest,
      entry_count: entryCount,
      coverage: shadow.coverage,
    })}\n`);
    return;
  }
  if (!args.project_root) {
    fail("project_root_required", "--apply requires --project-root");
  }
  const receipt = await materialize(shadow, args.project_root);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    apply: true,
    project_code: receipt.project_code,
    generation_id: receipt.generation_id,
    shadow_digest: receipt.shadow_digest,
    entry_count: receipt.entry_count,
    month_file_count: receipt.month_files.length,
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`project_timeline_shadow_rejected:${error?.code ?? "unexpected"}\n`);
  process.exitCode = 1;
});
