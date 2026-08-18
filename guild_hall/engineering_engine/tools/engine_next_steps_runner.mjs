#!/usr/bin/env node
// Reads one compiled stage, one assessment result, and answers "이제 뭐 해야 해?".
//
// This is the caller. The three modules under `guidance/` are pure by contract — no file, no
// clock, no network — so somebody has to read the disk, and that somebody is here, in one place,
// with the boundary written down:
//
//   * reads: the compile directory a driver already wrote (`mapping_table.json`,
//     `needs_stage_declarations.json`), the runner's assessment stdout, and optionally the
//     compiled variant spec (for `desc` / `template` / `verification_status`), the artifact
//     observations, a source catalogue and a context fill.
//   * writes: only under `--out`, and only files that do not exist yet. A run that would
//     overwrite an earlier answer refuses instead: an answer is a record of what the engine said
//     at a moment, and a record that can be silently replaced is not a record.
//   * changes nothing about the judgement. It never calls the engine, never re-decides a count,
//     and never marks anything present or done.
//
//   node tools/engine_next_steps_runner.mjs \
//     --compile-dir <abs dir> --assessment <abs json> --stage <stage code> --out <abs dir> \
//     [--compiled-variant <abs json>] [--observations <abs json>] [--source-catalog <abs json>] \
//     [--context-fill <abs json>] [--top N] [--known-at <instant>]

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { orderStageWork } from '../stage_rules/stage_rule_compiler.mjs';
import { ARTIFACT_VOCABULARY_V0 } from '../stage_rules/artifact_vocabulary.mjs';
import { buildGuideCards } from '../guidance/guide_cards.mjs';
import { buildInstructionPackets } from '../guidance/instruction_packet.mjs';
import { renderNextStepsAnswer } from '../guidance/answer_render.mjs';

export const NEXT_STEPS_RUNNER_SCHEMA_VERSION = 'soulforge.engine_next_steps_runner.v0';

const OUTPUT_FILES = Object.freeze([
  'guide_cards.json', 'instructions.json', 'next_steps.md', 'next_steps.json', 'receipt.json',
]);

const DEFAULT_TOP = 3;

class RunnerRefusal extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'RunnerRefusal';
    this.code = code;
    this.detail = detail;
  }
}

const refuse = (code, message, detail = {}) => {
  throw new RunnerRefusal(code, message, detail);
};

function parseArgs(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) refuse('NEXT_STEPS_ARGUMENT_INVALID', 'expected a --flag', { token });
    const name = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      refuse('NEXT_STEPS_ARGUMENT_INVALID', 'a flag is missing its value', { flag: name });
    }
    flags.set(name, value);
    index += 1;
  }
  for (const required of ['compile-dir', 'assessment', 'stage', 'out']) {
    if (!flags.has(required)) {
      refuse('NEXT_STEPS_ARGUMENT_MISSING', 'a required flag was not supplied', { flag: required });
    }
  }
  const top = flags.has('top') ? Number(flags.get('top')) : DEFAULT_TOP;
  if (!Number.isSafeInteger(top) || top < 1 || top > 32) {
    refuse('NEXT_STEPS_ARGUMENT_INVALID', '--top must be an integer between 1 and 32', {});
  }
  return {
    compileDir: resolve(flags.get('compile-dir')),
    assessmentPath: resolve(flags.get('assessment')),
    stageCode: flags.get('stage'),
    outDir: resolve(flags.get('out')),
    compiledVariantPath: flags.has('compiled-variant') ? resolve(flags.get('compiled-variant')) : null,
    observationsPath: flags.has('observations') ? resolve(flags.get('observations')) : null,
    sourceCatalogPath: flags.has('source-catalog') ? resolve(flags.get('source-catalog')) : null,
    contextFillPath: flags.has('context-fill') ? resolve(flags.get('context-fill')) : null,
    knownAt: flags.get('known-at') ?? null,
    top,
  };
}

async function readJson(path, label) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    refuse('NEXT_STEPS_INPUT_UNREADABLE', 'an input file could not be read', { label, code: error?.code ?? null });
  }
  try {
    return JSON.parse(text);
  } catch {
    refuse('NEXT_STEPS_INPUT_NOT_JSON', 'an input file is not JSON', { label });
  }
  return null;
}

async function readOptionalJson(path, label) {
  if (path === null) return null;
  return readJson(path, label);
}

// An observation file may be the generator's `artifact_observations` shape (with revision refs and
// instants) or the plain `[{artifact_type_id, presence_state}]` the work order reads. Only the two
// fields the work order declares are carried through: the rest belongs to the packet generator.
function toWorkOrderObservations(loaded) {
  if (loaded === null) return [];
  const rows = Array.isArray(loaded) ? loaded : loaded.artifact_observations ?? loaded.observations ?? [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const token = row.artifact_type_id ?? null;
    if (token === null || seen.has(token)) continue;
    seen.add(token);
    out.push({ artifact_type_id: token, presence_state: row.presence_state });
  }
  return out;
}

async function writeCreateOnly(path, bytes) {
  try {
    await writeFile(path, bytes, { flag: 'wx' });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      refuse('NEXT_STEPS_OUTPUT_EXISTS', 'an output file already exists and is not overwritten', { path });
    }
    refuse('NEXT_STEPS_OUTPUT_UNWRITABLE', 'an output file could not be written', { code: error?.code ?? null });
  }
}

export async function runNextSteps(options) {
  const mappingTable = await readJson(join(options.compileDir, 'mapping_table.json'), 'mapping_table');
  const declarations = await readJson(join(options.compileDir, 'needs_stage_declarations.json'),
    'needs_stage_declarations');
  const assessment = await readJson(options.assessmentPath, 'assessment');
  const compiledVariant = await readOptionalJson(options.compiledVariantPath, 'compiled_variant');
  const sourceCatalog = await readOptionalJson(options.sourceCatalogPath, 'source_catalog');
  const contextFill = await readOptionalJson(options.contextFillPath, 'context_fill');
  const observationsFile = await readOptionalJson(options.observationsPath, 'observations');

  const compileResult = {
    mapping_table: mappingTable,
    needs_stage_declarations: declarations,
  };
  const observations = toWorkOrderObservations(observationsFile);
  const workOrder = orderStageWork(compileResult, observations);

  const cards = buildGuideCards({
    compile_result: compileResult,
    vocabulary: ARTIFACT_VOCABULARY_V0,
    ...(compiledVariant === null ? {} : { compiled_variant: compiledVariant }),
    ...(sourceCatalog === null ? {} : { source_catalog: sourceCatalog }),
    work_order: workOrder,
  });

  const bound = Object.hasOwn(assessment, 'role_bound_assessment')
    ? assessment.role_bound_assessment : assessment;
  const missionCount = (bound.next_mission_candidates ?? []).length;
  const knownAt = options.knownAt
    ?? contextFill?.known_at
    ?? bound.current_stage?.known_at
    ?? null;
  if (knownAt === null) {
    refuse('NEXT_STEPS_KNOWN_AT_MISSING',
      'supply --known-at: this runner does not read a clock', {});
  }
  const { known_at: _contextKnownAt, ...contextFillFields } = contextFill ?? {};

  const instructions = buildInstructionPackets({
    assessment,
    work_order: workOrder,
    guide_cards: cards,
    known_at: knownAt,
    ...(contextFill === null ? {} : { context_fill: contextFillFields }),
    // The engine emits at most three mission candidates. Where it emitted fewer than asked for,
    // the remainder is filled with work that is ready and has never been observed — labelled as
    // its own kind, because nobody judged it.
    include_next_ready: missionCount < options.top,
    top_n: Math.max(options.top - missionCount, 0),
  });

  const answer = renderNextStepsAnswer({
    assessment,
    work_order: workOrder,
    instructions,
    guide_cards: cards,
    stage_code: options.stageCode,
    locale: 'ko',
  });

  const receipt = {
    schema_version: NEXT_STEPS_RUNNER_SCHEMA_VERSION,
    stage_code: options.stageCode,
    known_at: knownAt,
    top: options.top,
    inputs: {
      mapping_table_rows: mappingTable.length,
      observations_supplied: observations.length,
      compiled_variant_supplied: compiledVariant !== null,
      source_catalog_supplied: sourceCatalog !== null,
      context_fill_supplied: contextFill !== null,
    },
    work_order_receipt: workOrder.receipt,
    guide_card_receipt: cards.receipt,
    instruction_receipt: instructions.receipt,
    answer_receipt: answer.receipt,
    output_files: [...OUTPUT_FILES],
    authority: {
      judgment_changed: false,
      observation_written: false,
      task_created: false,
      approval_made: false,
    },
    effects: {
      erp_writes: 0,
      filesystem_writes: OUTPUT_FILES.length,
      model_calls: 0,
      network_calls: 0,
    },
  };

  await mkdir(options.outDir, { recursive: true });
  const write = async (name, value) => writeCreateOnly(join(options.outDir, name),
    typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
  await write('guide_cards.json', cards);
  await write('instructions.json', instructions);
  await write('next_steps.md', answer.markdown);
  await write('next_steps.json', { schema_version: answer.schema_version, locale: answer.locale, answer: answer.answer });
  await write('receipt.json', receipt);

  return { receipt, answer, instructions, cards, work_order: workOrder };
}

/** True when this file is the process entry point, on Windows drive letters included. */
export function isDirectInvocation(entryPath, moduleUrl) {
  if (typeof entryPath !== 'string' || entryPath.length === 0
    || typeof moduleUrl !== 'string' || moduleUrl.length === 0) return false;
  try {
    const entryUrl = pathToFileURL(entryPath).href;
    if (process.platform !== 'win32') return entryUrl === moduleUrl;
    const normalizedDrive = (value) => value.replace(
      /^file:\/\/\/[A-Za-z]:/u,
      (drivePrefix) => drivePrefix.toLowerCase(),
    );
    return normalizedDrive(entryUrl) === normalizedDrive(moduleUrl);
  } catch {
    return false;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runNextSteps(options);
  process.stdout.write(`${JSON.stringify({
    status: 'WRITTEN',
    out_dir: options.outDir,
    stage_code: options.stageCode,
    counts: {
      cards: result.cards.receipt.counts.cards,
      instructions: result.instructions.receipt.counts.instructions,
      requirement_counts: result.answer.answer.position.requirement_counts,
    },
    next_steps: result.answer.answer.next_steps.map((step) => ({
      order: step.order, artifact_type_id: step.artifact_type_id, kind: step.instruction_kind,
    })),
  }, null, 2)}\n`);
}

if (isDirectInvocation(process.argv[1], import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      status: 'REFUSED',
      code: error?.code ?? 'NEXT_STEPS_FAILED',
      message: error?.message ?? String(error),
      detail: error?.detail ?? null,
    }, null, 2)}\n`);
    process.exitCode = 65;
  });
}
