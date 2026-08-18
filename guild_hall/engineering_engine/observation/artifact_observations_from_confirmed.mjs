// The eye, part three: confirmed candidates to the `artifact_observations` the generator accepts.
//
// This is the seam where a human decision becomes an engine input. Everything upstream is
// proposal and confirmation; everything downstream is judgement. So the shape emitted here is
// not a convenient local shape — it is exactly the row
// `stage_rules/pilot_packet_generator.mjs` validates, field for field, and the test suite feeds
// the output straight into that generator so a drift fails here rather than in a project run.
//
// Two rules give this module its shape.
//
// 1. **One observation per (stage, artifact type).** The generator refuses two observations bound
//    to one requirement, and rightly: two would be a contradiction it has no authority to
//    resolve. When several confirmed files map to one pair, the strongest maturity wins, then the
//    newest modification time, then the digest — a declared order, so two callers pick the same
//    file — and the others are listed in the receipt as superseded rather than dropped silently.
// 2. **Only `present` is ever asserted.** A walked inventory can show that a file exists. It
//    cannot show that one does not: the file may sit in a mailbox, on a share, or under a name
//    nobody indexed. `absence_confirmed` is a human judgement and never comes from here.
//
// Identifiers are minted from digests rather than drawn at random, so one confirmed set reaches
// one byte-identical observation set. Nothing here reads a file, a clock, a random source, an
// environment value, or a network.
import { createHash } from 'node:crypto';

import { canonicalise, compareCodePoints, isCanonicalInstant } from '../kernel/canonical.mjs';
import { PRESENCE_STATE_PRESENT, mintIdentifier } from './artifact_observation_candidates.mjs';

export const ARTIFACT_OBSERVATIONS_SCHEMA_VERSION = 'soulforge.artifact_observations_from_confirmed.v0';

export const ARTIFACT_OBSERVATION_ERROR_CODES = Object.freeze({
  REQUEST_INVALID: 'ARTIFACT_OBSERVATION_REQUEST_INVALID',
  CONFIRMED_INVALID: 'ARTIFACT_OBSERVATION_CONFIRMED_INVALID',
  INVENTORY_INVALID: 'ARTIFACT_OBSERVATION_INVENTORY_INVALID',
});

export class ArtifactObservationBuildError extends Error {
  constructor(code, message, detail = {}) {
    super(`${code}: ${message}`);
    this.name = 'ArtifactObservationBuildError';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, message, detail = {}) => {
  throw new ArtifactObservationBuildError(code, message, detail);
};

// Strongest first. A file that says nothing about its maturity ranks below one that does, because
// an unstated maturity is unknown rather than superseding.
const MATURITY_RANK = new Map([['final', 4], ['baseline', 3], ['updated', 2], ['preliminary', 1]]);

const SHA256_HEX = /^[0-9a-f]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const MAX = Object.freeze({ confirmed: 200000, inventory: 200000, stages: 32 });

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function assertArray(value, where, code, limit) {
  if (!Array.isArray(value) || value.length > limit) {
    fail(code, `${where} must be an array within its item limit`, { where });
  }
  return value;
}

const sha256Hex = (input) => createHash('sha256').update(input).digest('hex');

function arrayOrderRules(value) {
  const rules = {};
  const visit = (row, path = '') => {
    if (Array.isArray(row)) {
      rules[path] = 'insertion_ordered';
      for (const child of row) visit(child, `${path}[]`);
    } else if (row !== null && typeof row === 'object') {
      for (const [key, child] of Object.entries(row)) visit(child, path ? `${path}.${key}` : key);
    }
  };
  visit(value);
  return rules;
}

function withoutNulls(value) {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== null) out[key] = withoutNulls(child);
    }
    return out;
  }
  return value;
}

function canonicalDigest(domain, value) {
  const projected = withoutNulls(value);
  try {
    return sha256Hex(`${domain}\n${canonicalise(projected, arrayOrderRules(projected))}`);
  } catch (error) {
    return fail(ARTIFACT_OBSERVATION_ERROR_CODES.REQUEST_INVALID,
      'observation material is not canonically serialisable',
      { domain, contract_code: error?.code ?? null });
  }
}

const observationDomain = (name) => `${ARTIFACT_OBSERVATIONS_SCHEMA_VERSION}.${name}`;

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// ---------------------------------------------------------------- the seam

/**
 * Turns confirmed candidates into generator-shaped artifact observations.
 *
 * @param request `{ confirmed, inventory, known_at, target_stage_codes? }`
 * @returns deeply frozen `{ artifact_observations, by_stage, superseded, receipt }`
 */
export function buildArtifactObservationsFromConfirmed(request) {
  const code = ARTIFACT_OBSERVATION_ERROR_CODES.REQUEST_INVALID;
  if (!isPlainObject(request)) fail(code, 'request must be an object', { where: 'request' });
  for (const key of Object.keys(request)) {
    if (!['confirmed', 'inventory', 'known_at', 'target_stage_codes'].includes(key)) {
      fail(code, 'request carries an undeclared field', { where: 'request' });
    }
  }
  const confirmed = assertArray(request.confirmed, 'request.confirmed',
    ARTIFACT_OBSERVATION_ERROR_CODES.CONFIRMED_INVALID, MAX.confirmed);
  const inventory = assertArray(request.inventory, 'request.inventory',
    ARTIFACT_OBSERVATION_ERROR_CODES.INVENTORY_INVALID, MAX.inventory);
  if (!isCanonicalInstant(request.known_at)) {
    fail(code, 'request.known_at must be a canonical instant', { where: 'request.known_at' });
  }
  const knownAt = request.known_at;
  const targetStages = Object.hasOwn(request, 'target_stage_codes')
    ? new Set(assertArray(request.target_stage_codes, 'request.target_stage_codes', code, MAX.stages))
    : null;

  const inventoryByRef = new Map();
  for (const row of inventory) {
    if (!isPlainObject(row) || typeof row.file_ref !== 'string') {
      fail(ARTIFACT_OBSERVATION_ERROR_CODES.INVENTORY_INVALID,
        'an inventory row must be an object naming a file_ref', { where: 'request.inventory[]' });
    }
    if (!SHA256_HEX.test(row.sha256 ?? '')) {
      fail(ARTIFACT_OBSERVATION_ERROR_CODES.INVENTORY_INVALID,
        'an inventory row must carry a lower-case sha256 digest', { where: 'request.inventory[].sha256' });
    }
    if (!isCanonicalInstant(row.mtime_iso)) {
      fail(ARTIFACT_OBSERVATION_ERROR_CODES.INVENTORY_INVALID,
        'an inventory row must carry a canonical mtime', { where: 'request.inventory[].mtime_iso' });
    }
    inventoryByRef.set(row.file_ref, row);
  }

  // ---- group the confirmed rows by the pair the engine binds on
  const groups = new Map();
  for (const row of confirmed) {
    if (!isPlainObject(row)) {
      fail(ARTIFACT_OBSERVATION_ERROR_CODES.CONFIRMED_INVALID,
        'a confirmed row must be an object', { where: 'request.confirmed[]' });
    }
    for (const field of ['file_ref', 'stage_code', 'artifact_type_id']) {
      if (typeof row[field] !== 'string' || row[field].length === 0) {
        fail(ARTIFACT_OBSERVATION_ERROR_CODES.CONFIRMED_INVALID,
          'a confirmed row is missing a declared field', { where: `request.confirmed[].${field}` });
      }
    }
    if (targetStages !== null && !targetStages.has(row.stage_code)) continue;
    const file = inventoryByRef.get(row.file_ref);
    if (file === undefined) {
      // Confirming a file the inventory does not carry would produce an observation with no
      // bytes behind it. The caller has to hand over the same inventory the sheet was built from.
      fail(ARTIFACT_OBSERVATION_ERROR_CODES.CONFIRMED_INVALID,
        'a confirmed row names a file the inventory does not carry',
        { where: 'request.confirmed[].file_ref' });
    }
    const key = `${row.stage_code}|${row.artifact_type_id}`;
    let group = groups.get(key);
    if (group === undefined) { group = []; groups.set(key, group); }
    group.push({
      candidate_id: typeof row.candidate_id === 'string' ? row.candidate_id : null,
      file_ref: row.file_ref,
      stage_code: row.stage_code,
      artifact_type_id: row.artifact_type_id,
      maturity: row.maturity ?? null,
      confirmation: typeof row.confirmation === 'string' ? row.confirmation : null,
      sha256: file.sha256,
      mtime_iso: file.mtime_iso,
    });
  }

  // ---- one winner per pair, by a declared order
  const rank = (row) => MATURITY_RANK.get(row.maturity) ?? 0;
  const observations = [];
  const superseded = [];
  for (const key of [...groups.keys()].sort(compareCodePoints)) {
    const rows = [...groups.get(key)].sort((left, right) => rank(right) - rank(left)
      || compareCodePoints(right.mtime_iso, left.mtime_iso)
      || compareCodePoints(left.sha256, right.sha256)
      || compareCodePoints(left.file_ref, right.file_ref));
    const [winner, ...rest] = rows;
    const { stage_code: stageCode, artifact_type_id: artifactTypeId } = winner;

    const observationId = `obs_${stageCode}_${artifactTypeId}`;
    if (!TOKEN.test(observationId)) {
      fail(ARTIFACT_OBSERVATION_ERROR_CODES.CONFIRMED_INVALID,
        'a confirmed stage code and artifact type do not form a usable observation id',
        { where: 'request.confirmed[]' });
    }
    // The instant the artifact is asserted to have existed. A file whose modification time is
    // later than the moment this request speaks as of is read as of that moment instead: the
    // observation cannot claim to have known, at `known_at`, about a fact dated after it.
    const validAt = compareCodePoints(winner.mtime_iso, knownAt) > 0 ? knownAt : winner.mtime_iso;
    const evidenceContentId = sha256Hex(`${observationDomain('evidence')}\n${[
      stageCode, artifactTypeId, winner.file_ref, winner.sha256, knownAt,
    ].join('|')}`);

    observations.push({
      observation_id: observationId,
      artifact_type_id: artifactTypeId,
      presence_state: PRESENCE_STATE_PRESENT,
      observation_attempt_ref: `observation:artifact_scan:${sha256Hex(
        `${observationDomain('attempt')}\n${[stageCode, artifactTypeId, knownAt].join('|')}`,
      ).slice(0, 24)}`,
      artifact_revision_ref: {
        entity_id: mintIdentifier(observationDomain('artifact_entity'), [stageCode, artifactTypeId]),
        revision_id: mintIdentifier(observationDomain('artifact_revision'),
          [stageCode, artifactTypeId, winner.sha256]),
        content_id: `sha256:${winner.sha256}`,
        content_hash_alg: 'sha256',
      },
      evidence_refs: [{
        entity_id: mintIdentifier(observationDomain('evidence_entity'),
          [stageCode, artifactTypeId, winner.file_ref]),
        revision_id: mintIdentifier(observationDomain('evidence_revision'),
          [stageCode, artifactTypeId, winner.file_ref, winner.sha256]),
        content_id: `sha256:${evidenceContentId}`,
        content_hash_alg: 'sha256',
      }],
      valid_at: validAt,
      known_at: knownAt,
    });

    if (rest.length > 0) {
      superseded.push({
        stage_code: stageCode,
        artifact_type_id: artifactTypeId,
        chosen: { file_ref: winner.file_ref, maturity: winner.maturity, mtime_iso: winner.mtime_iso },
        superseded_refs: rest.map((row) => ({
          file_ref: row.file_ref, maturity: row.maturity, mtime_iso: row.mtime_iso,
        })),
      });
    }
  }

  observations.sort((left, right) => compareCodePoints(left.observation_id, right.observation_id));

  const byStage = {};
  for (const key of [...groups.keys()].sort(compareCodePoints)) {
    const [stageCode] = key.split('|');
    const observationId = `obs_${key.split('|').join('_')}`;
    const observation = observations.find((row) => row.observation_id === observationId);
    if (observation === undefined) continue;
    byStage[stageCode] = [...(byStage[stageCode] ?? []), observation];
  }

  const receipt = {
    schema_version: ARTIFACT_OBSERVATIONS_SCHEMA_VERSION,
    known_at: knownAt,
    input_digests: {
      confirmed: canonicalDigest(observationDomain('confirmed'), confirmed),
      inventory: canonicalDigest(observationDomain('inventory'), inventory),
    },
    output_digests: {
      artifact_observations: canonicalDigest(observationDomain('artifact_observations'), observations),
    },
    counts: {
      confirmed_rows: confirmed.length,
      artifact_observations: observations.length,
      superseded_pairs: superseded.length,
      superseded_files: superseded.reduce((total, row) => total + row.superseded_refs.length, 0),
      observations_by_stage: Object.fromEntries(
        Object.entries(byStage).map(([stageCode, rows]) => [stageCode, rows.length]),
      ),
    },
    superseded,
    effects: {
      erp_writes: 0,
      filesystem_writes: 0,
      filesystem_reads: 0,
      model_calls: 0,
      network_calls: 0,
      clock_reads: 0,
    },
  };

  return deepFreeze({
    artifact_observations: observations, by_stage: byStage, superseded, receipt,
  });
}
