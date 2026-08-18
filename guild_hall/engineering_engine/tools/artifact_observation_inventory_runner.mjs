#!/usr/bin/env node
// Walks one project root, hashes what it finds, and asks the observation modules what those files
// might be.
//
// This is the caller. The three modules under `observation/` are pure by contract — no file, no
// clock, no network — so somebody has to read the disk and read the clock, and that somebody is
// here, in one place, with the boundary written down:
//
//   * reads: the project root, the compiled variant specs, the project overlays.
//   * writes: only under `--out`, and only files that do not exist yet. A run that would
//     overwrite an earlier run's output refuses instead, because an observation run is evidence
//     and evidence that can be silently replaced is not evidence.
//   * asserts nothing about absence. A file this walk did not reach is not reported missing.
//
// The output is a candidate set and a confirmation sheet for a person, plus the observations that
// the `03_Out` rule already confirms on its own. Nothing here reaches the engine directly.
//
//   node tools/artifact_observation_inventory_runner.mjs \
//     --project-root <abs> --out <abs dir> \
//     --compiled-variant <abs json> [--compiled-variant <abs json>] \
//     [--overlay <abs json>] [--include-globs '<glob>,<glob>'] [--max-files N] \
//     [--known-at <instant>] [--no-auto-confirm]

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';
import process from 'node:process';

import {
  buildArtifactObservationCandidates,
} from '../observation/artifact_observation_candidates.mjs';
import {
  applyConfirmationSheet, buildObservationConfirmationSheet,
} from '../observation/observation_confirmation_sheet.mjs';
import {
  buildArtifactObservationsFromConfirmed,
} from '../observation/artifact_observations_from_confirmed.mjs';
import {
  buildHousekeepingReport, renderHousekeepingMarkdown,
} from '../observation/observation_housekeeping.mjs';
import { ARTIFACT_VOCABULARY_V0 } from '../stage_rules/artifact_vocabulary.mjs';

const RUNNER_SCHEMA_VERSION = 'soulforge.artifact_observation_inventory_runner.v0';

// Directories that hold no evidence of what a stage produced: version control and dependency
// trees, the scratch folder the folder-tree contract reserves, python build caches, and anything
// already moved to a trash holding area.
const SKIP_DIRECTORY_NAMES = new Set(['.git', 'node_modules', '00_Temp', '__pycache__', '.venv']);
const SKIP_DIRECTORY_PREFIXES = ['_trash'];

const DEFAULTS = Object.freeze({
  maxFiles: 200000,
  maxFileBytes: 200 * 1024 * 1024,
});

const OUTPUT_FILES = Object.freeze([
  'inventory.json', 'candidates.json', 'confirmation_sheet.md', 'confirmation_sheet.json',
  'artifact_observations_auto.json', 'housekeeping_report.md', 'receipt.json',
]);

// A refusal is a stated outcome, not a crash: the reason is written once, the exit code says
// "refused", and the stack trace that would otherwise bury the reason is dropped.
class RunnerRefusal extends Error {}

const die = (message) => {
  process.stderr.write(`artifact_observation_inventory_runner: ${message}\n`);
  process.exitCode = 2;
  throw new RunnerRefusal(message);
};

// ---------------------------------------------------------------- arguments

function parseArguments(argv) {
  const options = {
    projectRoot: null,
    out: null,
    compiledVariants: [],
    overlays: [],
    aliasPatternFiles: [],
    includeGlobs: [],
    excludeGlobs: [],
    maxFiles: DEFAULTS.maxFiles,
    maxFileBytes: DEFAULTS.maxFileBytes,
    knownAt: null,
    autoConfirm: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) die(`${flag} needs a value`);
      index += 1;
      return next;
    };
    switch (flag) {
      case '--project-root': options.projectRoot = value(); break;
      case '--out': options.out = value(); break;
      case '--compiled-variant': options.compiledVariants.push(value()); break;
      case '--overlay': options.overlays.push(value()); break;
      case '--alias-patterns': options.aliasPatternFiles.push(value()); break;
      case '--include-globs':
        options.includeGlobs.push(...value().split(',').map((glob) => glob.trim()).filter(Boolean));
        break;
      case '--exclude-globs':
        options.excludeGlobs.push(...value().split(',').map((glob) => glob.trim()).filter(Boolean));
        break;
      case '--max-files': options.maxFiles = Number.parseInt(value(), 10); break;
      case '--max-file-bytes': options.maxFileBytes = Number.parseInt(value(), 10); break;
      case '--known-at': options.knownAt = value(); break;
      case '--no-auto-confirm': options.autoConfirm = false; break;
      case '--help':
        process.stdout.write(`${[
          'usage: artifact_observation_inventory_runner.mjs --project-root <abs> --out <abs dir>',
          '         --compiled-variant <abs json> [--compiled-variant ...] [--overlay <abs json>]',
          '         [--alias-patterns <abs json>]',
          '         [--include-globs "<glob>,<glob>"] [--exclude-globs "<glob>,<glob>"]',
          '         [--max-files N] [--max-file-bytes N]',
          '         [--known-at <instant>] [--no-auto-confirm]',
        ].join('\n')}\n`);
        return null;
      default: die(`unknown argument ${flag}`);
    }
  }
  if (options.projectRoot === null) die('--project-root is required');
  if (options.out === null) die('--out is required');
  if (options.compiledVariants.length === 0) die('at least one --compiled-variant is required');
  if (!Number.isSafeInteger(options.maxFiles) || options.maxFiles <= 0) die('--max-files must be a positive integer');
  if (!Number.isSafeInteger(options.maxFileBytes) || options.maxFileBytes <= 0) {
    die('--max-file-bytes must be a positive integer');
  }
  return options;
}

// ---------------------------------------------------------------- globs

/** `**` crosses separators, `*` and `?` do not. Enough for "only look at these folders". */
function globToRegExp(glob) {
  let pattern = '';
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === '*') {
      if (glob[index + 1] === '*') { pattern += '.*'; index += 1; } else { pattern += '[^/]*'; }
    } else if (character === '?') {
      pattern += '[^/]';
    } else {
      pattern += character.replace(/[.+^${}()|[\]\\]/gu, (match) => `\\${match}`);
    }
  }
  return new RegExp(`^${pattern}$`, 'u');
}

// ---------------------------------------------------------------- the walk

const nfc = (value) => value.normalize('NFC');

async function hashFile(absolutePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(absolutePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function walkProject(projectRoot, options, excludedDirectory = null) {
  const includeMatchers = options.includeGlobs.map(globToRegExp);
  const excludeMatchers = options.excludeGlobs.map(globToRegExp);
  const inventory = [];
  const skipped = {
    directories: 0, too_large: 0, unreadable: 0, not_included: 0, symbolic_links: 0,
    non_canonical_mtime: 0, over_max_files: 0, own_output: 0, excluded: 0,
  };

  const walk = async (relativeDirectory) => {
    let entries;
    try {
      entries = await readdir(join(projectRoot, relativeDirectory), { withFileTypes: true });
    } catch {
      skipped.unreadable += 1;
      return;
    }
    for (const entry of [...entries].sort((left, right) => (left.name < right.name ? -1 : 1))) {
      const name = nfc(entry.name);
      const relative = relativeDirectory === '' ? name : `${relativeDirectory}/${name}`;
      const absolute = join(projectRoot, relative.split('/').join(sep));
      if (entry.isSymbolicLink()) { skipped.symbolic_links += 1; continue; }
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORY_NAMES.has(name)
            || SKIP_DIRECTORY_PREFIXES.some((prefix) => name.startsWith(prefix))) {
          skipped.directories += 1;
          continue;
        }
        // A run whose output folder sits inside the project would otherwise walk the previous
        // run's own files, which is how an observation run starts observing itself.
        if (excludedDirectory !== null && resolve(absolute) === excludedDirectory) {
          skipped.own_output += 1;
          continue;
        }
        await walk(relative);
        continue;
      }
      if (!entry.isFile()) continue;
      if (includeMatchers.length > 0 && !includeMatchers.some((matcher) => matcher.test(relative))) {
        skipped.not_included += 1;
        continue;
      }
      // What the caller says is not project material. The case this exists for is an earlier run
      // of this tool whose output folder lives inside the project: without excluding it, every
      // rerun inventories the last run's files and the walks stop being comparable.
      if (excludeMatchers.some((matcher) => matcher.test(relative))) {
        skipped.excluded += 1;
        continue;
      }
      if (inventory.length >= options.maxFiles) { skipped.over_max_files += 1; continue; }
      let stats;
      try {
        stats = await lstat(absolute);
      } catch {
        skipped.unreadable += 1;
        continue;
      }
      if (stats.size > options.maxFileBytes) { skipped.too_large += 1; continue; }
      let mtimeIso;
      try {
        mtimeIso = stats.mtime.toISOString();
      } catch {
        skipped.non_canonical_mtime += 1;
        continue;
      }
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(mtimeIso)) {
        skipped.non_canonical_mtime += 1;
        continue;
      }
      let sha256;
      try {
        sha256 = await hashFile(absolute);
      } catch {
        skipped.unreadable += 1;
        continue;
      }
      const segments = relative.split('/');
      const row = {
        file_ref: relative,
        name,
        ext: extname(name).replace(/^\./u, '').toLowerCase(),
        bytes: stats.size,
        sha256,
        mtime_iso: mtimeIso,
      };
      if (/^\d{1,6}_/u.test(segments[0]) && segments.length > 1) {
        row.gate_hint = segments[0];
        if (segments.length > 2 && /^\d{1,6}_/u.test(segments[1])) row.task_folder_hint = segments[1];
      }
      inventory.push(row);
    }
  };

  await walk('');
  inventory.sort((left, right) => (left.file_ref < right.file_ref ? -1 : 1));
  return { inventory, skipped };
}

// ---------------------------------------------------------------- rule inputs

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

/**
 * Reads the cue material an overlay carries.
 *
 * An `alias` op says "this project calls that artifact this". An `add` op is a prime-contractor
 * item the standard spec does not carry, and its label is exactly the words the project puts in
 * the folder name, so both become cues. Nothing else in an overlay is read here: this module
 * classifies documents, it does not compile rules.
 */
function overlayCues(overlay) {
  const rows = [];
  for (const op of overlay?.ops ?? []) {
    if (op?.op === 'alias' && typeof op.alias === 'string') {
      rows.push({ stage_code: op.stage_code, artifact_type_id: op.artifact_type_id, alias: op.alias });
    } else if (op?.op === 'add' && typeof op.label === 'string') {
      rows.push({
        stage_code: op.stage_code,
        artifact_type_id: op.artifact_type_id,
        alias: op.artifact_type_id,
        label: op.label,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- output

async function writeCreateOnly(outDirectory, name, text) {
  const path = join(outDirectory, name);
  try {
    await writeFile(path, text, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      die(`refusing to overwrite an existing run output: ${name}`);
    }
    throw error;
  }
  return path;
}

const asJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

// ---------------------------------------------------------------- main

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options === null) return;

  const projectRoot = resolve(options.projectRoot);
  const outDirectory = resolve(options.out);
  const knownAt = options.knownAt ?? new Date().toISOString();

  await mkdir(outDirectory, { recursive: true });
  for (const name of OUTPUT_FILES) {
    try {
      await lstat(join(outDirectory, name));
      die(`refusing to overwrite an existing run output: ${name}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  const compiledVariants = [];
  for (const path of options.compiledVariants) compiledVariants.push(await readJson(resolve(path)));
  const overlayAliases = [];
  for (const path of options.overlays) overlayAliases.push(...overlayCues(await readJson(resolve(path))));
  // Project-registered name shapes live in the project plane, not in the public rule specs: a
  // drawing-number prefix is one project's convention and belongs with that project's material.
  const aliasPatterns = [];
  for (const path of options.aliasPatternFiles) {
    const rows = await readJson(resolve(path));
    if (!Array.isArray(rows)) die('an --alias-patterns file must hold an array');
    aliasPatterns.push(...rows);
  }

  const { inventory, skipped } = await walkProject(projectRoot, options, outDirectory);

  const candidateResult = buildArtifactObservationCandidates({
    inventory,
    compiled_variants: compiledVariants,
    overlay_aliases: overlayAliases,
    alias_patterns: aliasPatterns,
    vocabulary: ARTIFACT_VOCABULARY_V0,
    known_at: knownAt,
    rules: { auto_confirm_03_out: options.autoConfirm },
  });

  const sheet = buildObservationConfirmationSheet({
    candidates: candidateResult.candidates,
    inventory,
    known_at: knownAt,
  });

  // Only the rows the `03_Out` rule confirms on its own: `applyConfirmationSheet` with no
  // decisions leaves every other candidate pending, which is the point.
  const applied = applyConfirmationSheet(candidateResult.candidates, []);
  const observations = buildArtifactObservationsFromConfirmed({
    confirmed: applied.confirmed,
    inventory,
    known_at: knownAt,
  });

  // Folder tidying, kept beside the classification and never mixed into it. The Owner's standing
  // instruction is that this stays after the team files properly: it is how anyone sees whether
  // they still do.
  const housekeeping = buildHousekeepingReport({
    inventory,
    candidates: candidateResult.candidates,
    unmatched: candidateResult.unmatched,
    ambiguous: candidateResult.ambiguous,
    known_at: knownAt,
  });

  const receipt = {
    schema_version: RUNNER_SCHEMA_VERSION,
    known_at: knownAt,
    project_root_name: basename(projectRoot),
    out_dir_name: basename(outDirectory),
    inputs: {
      compiled_variants: options.compiledVariants.map((path) => basename(path)),
      overlays: options.overlays.map((path) => basename(path)),
      alias_pattern_files: options.aliasPatternFiles.map((path) => basename(path)),
      alias_patterns: aliasPatterns.length,
      include_globs: options.includeGlobs,
      exclude_globs: options.excludeGlobs,
      max_files: options.maxFiles,
      max_file_bytes: options.maxFileBytes,
      auto_confirm_03_out: options.autoConfirm,
    },
    walk: {
      files_inventoried: inventory.length,
      bytes_inventoried: inventory.reduce((total, row) => total + row.bytes, 0),
      skipped,
    },
    candidates: candidateResult.receipt,
    confirmation: applied.receipt,
    observations: observations.receipt,
    housekeeping: housekeeping.receipt,
  };

  await writeCreateOnly(outDirectory, 'inventory.json', asJson({
    schema_version: `${RUNNER_SCHEMA_VERSION}.inventory`, known_at: knownAt, rows: inventory,
  }));
  await writeCreateOnly(outDirectory, 'candidates.json', asJson({
    schema_version: candidateResult.receipt.schema_version,
    known_at: knownAt,
    candidates: candidateResult.candidates,
    unmatched: candidateResult.unmatched,
    ambiguous: candidateResult.ambiguous,
    receipt: candidateResult.receipt,
  }));
  await writeCreateOnly(outDirectory, 'confirmation_sheet.md', `${sheet.markdown}\n`);
  await writeCreateOnly(outDirectory, 'confirmation_sheet.json', asJson(sheet.sheet));
  await writeCreateOnly(outDirectory, 'artifact_observations_auto.json', asJson({
    schema_version: observations.receipt.schema_version,
    known_at: knownAt,
    artifact_observations: observations.artifact_observations,
    by_stage: observations.by_stage,
    receipt: observations.receipt,
  }));
  await writeCreateOnly(outDirectory, 'housekeeping_report.md',
    `${renderHousekeepingMarkdown(housekeeping)}\n`);
  await writeCreateOnly(outDirectory, 'receipt.json', asJson(receipt));

  process.stdout.write(`${JSON.stringify({
    files_inventoried: inventory.length,
    candidates: candidateResult.candidates.length,
    auto_confirmed: candidateResult.receipt.counts.auto_confirmed,
    auto_confirm_withheld_no_own_cue: candidateResult.receipt.counts.auto_confirm_withheld_no_own_cue,
    needs_owner_confirmation: candidateResult.receipt.counts.needs_owner_confirmation,
    ambiguous: candidateResult.ambiguous.length,
    unmatched: candidateResult.unmatched.length,
    artifact_observations: observations.artifact_observations.length,
    candidates_by_stage: candidateResult.receipt.counts.candidates_by_stage,
    decidable_task_folders: sheet.sheet.counts.decidable_task_folders,
    housekeeping_items: housekeeping.counts.items,
    housekeeping_by_kind: housekeeping.counts.by_kind,
  }, null, 2)}\n`);
}

try {
  await main();
} catch (error) {
  if (!(error instanceof RunnerRefusal)) {
    process.stderr.write(`artifact_observation_inventory_runner: ${error?.code ?? error?.message ?? 'failed'}\n`);
    process.exitCode = 1;
  }
}
