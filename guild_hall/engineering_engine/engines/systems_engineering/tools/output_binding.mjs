// Where the engine's outputs live, resolved through a pointer rather than a path.
//
// A consumer must not hardcode the directory this engine happened to run from. Whoever ran it
// may have been in a worktree, on another drive, or under a different checkout entirely, and a
// consumer wired to that path is wired to an accident.
//
// So this follows the idiom the operations plane already uses: a repository-relative pointer at
// a fixed location names the host-local root where the outputs actually are. The pointer path
// is stable across checkouts and survives a merge; the root it names is host-local and
// git-ignored, because these are measurements of one host at one time.
//
//   POINTER_RELATIVE_PATH   fixed, repository-relative, what a consumer hardcodes
//   pointer.output_root     host-local, where the artifacts actually are
//
// Fail-closed on every step. A malformed pointer resolves to nothing rather than to a guess,
// because a consumer silently reading the wrong directory would render another run's evidence.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, '..');
const REPO_ROOT = join(ENGINE, '..', '..');

export const POINTER_SCHEMA = 'soulforge.engineering_engine.output_pointer.v1';
export const INDEX_SCHEMA = 'soulforge.engineering_engine.output_index.v1';

/** What a consumer hardcodes. Repository-relative, so it is the same after a merge. */
export const POINTER_RELATIVE_PATH = 'guild_hall/state/engineering_engine/output.pointer.json';

/** Used only when no pointer exists, so a fresh checkout still has a defined answer. */
export const DEFAULT_OUTPUT_ROOT_RELATIVE = 'guild_hall/state/engineering_engine';

/**
 * The artifacts a consumer may read, and what each one is worth.
 *
 * `tracked` says whether the file survives a clone. The topology does; the observations do not,
 * and a consumer has to render their absence rather than assume they are there.
 */
export const OUTPUT_ARTIFACTS = Object.freeze([
  {
    id: 'engine_topology',
    file: 'engine_topology.json',
    tracked_in_repo: true,
    repo_relative_path: 'guild_hall/engineering_engine/topology/engine_topology.json',
    schema: 'engine_topology.v0',
    proves: 'which connections the source declares',
    does_not_prove: 'that any connection was used',
  },
  {
    id: 'heartbeats',
    file: 'runtime/heartbeats.json',
    tracked_in_repo: false,
    schema: 'per-surface heartbeat records',
    proves: 'a surface ran at a time, and whether it passed',
    does_not_prove: 'anything about a surface with no heartbeat, which must be shown as absent',
  },
  {
    id: 'receipts',
    file: 'runtime/receipts.json',
    tracked_in_repo: false,
    schema: 'per-edge delivery receipts',
    proves: 'the edge was traversed by a real run',
    does_not_prove: 'that data was processed on it',
  },
  {
    id: 'observation_summary',
    file: 'runtime/observation_summary.json',
    tracked_in_repo: false,
    schema: 'soulforge.engineering_engine.runtime_observation.v0',
    proves: 'how much of the declared graph the run could speak for',
    does_not_prove: 'that an unexercised edge is broken',
  },
]);

export const pointerPath = (repoRoot = REPO_ROOT) => resolve(join(repoRoot, POINTER_RELATIVE_PATH));

/**
 * Resolves the output root.
 *
 * Returns the source of the answer alongside it, so a consumer can say whether it is reading a
 * configured location or the fallback. A consumer that cannot tell those apart cannot explain
 * an empty screen.
 */
export function resolveOutputRoot({ repoRoot = REPO_ROOT, pointer = pointerPath(repoRoot) } = {}) {
  if (!existsSync(pointer)) {
    return { root: resolve(join(repoRoot, DEFAULT_OUTPUT_ROOT_RELATIVE)), source: 'default_no_pointer', pointer_path: pointer };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(pointer, 'utf8'));
  } catch {
    return { root: null, source: 'pointer_unreadable', pointer_path: pointer };
  }
  if (parsed === null || typeof parsed !== 'object' || parsed.schema_version !== POINTER_SCHEMA) {
    return { root: null, source: 'pointer_schema_invalid', pointer_path: pointer };
  }
  if (typeof parsed.output_root !== 'string' || parsed.output_root.length === 0) {
    return { root: null, source: 'pointer_root_missing', pointer_path: pointer };
  }
  // A relative root is resolved against the repository, not the caller's cwd: a consumer must
  // get the same answer no matter where it was launched from.
  const root = isAbsolute(parsed.output_root) ? parsed.output_root : resolve(join(repoRoot, parsed.output_root));
  return { root, source: 'pointer', pointer_path: pointer };
}

/** Writes a pointer. Kept here so the shape has exactly one author. */
export function writePointer({ outputRoot, repoRoot = REPO_ROOT } = {}) {
  if (typeof outputRoot !== 'string' || outputRoot.length === 0) {
    throw new Error('output_root is required');
  }
  const target = pointerPath(repoRoot);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify({ schema_version: POINTER_SCHEMA, output_root: outputRoot }, null, 2)}\n`, 'utf8');
  return target;
}
