#!/usr/bin/env node
// Publishes one index a consumer can read first, instead of probing for files.
//
// The index answers, per artifact: is it there, when was it produced, what does it hash to, and
// what is it worth. Absence is a value in that answer, not a missing key — a consumer must be
// able to render "no evidence" without a file read failing, because the observations are
// host-local and a fresh checkout legitimately has none.
//
// Nothing here judges. It reports what exists so the consumer does not have to guess, and it
// carries each artifact's own honesty markers forward so a display cannot accidentally present
// a weak observation as a strong one.
//
//   node tools/emit_output_index.mjs [--init <output_root>] [--repo-root <dir>]

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  INDEX_SCHEMA, OUTPUT_ARTIFACTS, POINTER_RELATIVE_PATH,
  resolveOutputRoot, writePointer,
} from './output_binding.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, '..');
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const REPO_ROOT = arg('--repo-root') ?? join(ENGINE, '..', '..');

const init = arg('--init');
if (init) {
  const written = writePointer({ outputRoot: init, repoRoot: REPO_ROOT });
  console.log(JSON.stringify({ action: 'pointer_written', pointer: written, output_root: init }, null, 2));
}

const resolved = resolveOutputRoot({ repoRoot: REPO_ROOT });
if (resolved.root === null) {
  // Fail closed and say why. A consumer reading a guessed directory would render another run's
  // evidence as this run's.
  console.log(JSON.stringify({
    schema_version: INDEX_SCHEMA,
    resolved: false,
    reason: resolved.source,
    pointer_relative_path: POINTER_RELATIVE_PATH,
    remedy: 'run tools/emit_output_index.mjs --init <output_root>',
    artifacts: [],
  }, null, 2));
  process.exit(1);
}

const digestOf = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

const artifacts = OUTPUT_ARTIFACTS.map((spec) => {
  // A tracked artifact lives in the repository; an observation lives under the resolved root.
  const path = spec.tracked_in_repo
    ? join(REPO_ROOT, spec.repo_relative_path)
    : join(resolved.root, spec.file);

  if (!existsSync(path)) {
    return {
      ...spec,
      present: false,
      // Named so a display can distinguish "nobody has run this yet" from "it broke".
      absent_reason: spec.tracked_in_repo ? 'tracked_artifact_missing_from_checkout' : 'no_observation_recorded_on_this_host',
      produced_at: null,
      sha256: null,
    };
  }
  let producedAt = null;
  let recordCount = null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    producedAt = parsed.run_started_at ?? parsed.observed_at ?? null;
    if (producedAt === null && parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // heartbeats and receipts are keyed maps; take the newest observation they contain.
      const instants = Object.values(parsed).map((v) => v?.observed_at).filter((v) => typeof v === 'string').sort();
      producedAt = instants.length ? instants[instants.length - 1] : null;
      recordCount = Object.keys(parsed).length;
    }
  } catch {
    return { ...spec, present: true, readable: false, absent_reason: 'artifact_unparseable', produced_at: null, sha256: digestOf(path) };
  }
  return {
    ...spec,
    present: true,
    readable: true,
    produced_at: producedAt,
    file_mtime: statSync(path).mtime.toISOString(),
    record_count: recordCount,
    sha256: digestOf(path),
  };
});

const index = {
  schema_version: INDEX_SCHEMA,
  resolved: true,
  output_root_source: resolved.source,
  pointer_relative_path: POINTER_RELATIVE_PATH,
  artifacts,
  present_count: artifacts.filter((a) => a.present).length,
  absent_count: artifacts.filter((a) => !a.present).length,
  consumer_notes: [
    'read this index first; absence is a value here, not a failed file read',
    'the observations are host-local and git-ignored, so a fresh checkout has none and that is not an error',
    'each artifact states what it proves and what it does not; a display must not upgrade the weaker claim',
    'freshness is the consumer\'s judgement: compare produced_at against whatever window it declares',
  ],
};

mkdirSync(resolved.root, { recursive: true });
const indexPath = join(resolved.root, 'engine_outputs.index.json');
writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({ ...index, written_to: indexPath }, null, 2));
