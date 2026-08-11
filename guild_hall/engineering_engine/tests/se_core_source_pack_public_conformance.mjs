import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE_ROOT = resolve(HERE, '../../../docs/architecture/workspace/examples/se_core_eval');
const SOURCE_PACK_PATH = resolve(EXAMPLE_ROOT, 'SE_CORE_EVAL_V1.source_pack.public.json');
const CORPUS_PATH = resolve(EXAMPLE_ROOT, 'SE_CORE_EVAL_V1.corpus.public.json');
const SYNTHETIC_PROJECT_MARKER = ['P', '00', '-', '000'].join('');

const PACK_KEYS = Object.freeze([
  'schema_version',
  'pack_id',
  'data_classification',
  'contains_actual_project_data',
  'contains_private_data',
  'source_count',
  'sources',
]);
const SOURCE_KEYS = Object.freeze([
  'source_id',
  'authority_family',
  'title',
  'filename',
  'revision',
  'sha256',
  'byte_length',
  'official_landing_url',
  'official_artifact_url',
  'rights_basis',
  'analysis_eligibility',
  'derivative_graphics_republication',
]);
const ANALYSIS_KEYS = Object.freeze(['engine', 'notebook_shadow', 'byte_scope']);
const DERIVATIVE_KEYS = Object.freeze(['state', 'basis']);
const CORPUS_KEYS = Object.freeze([
  'data_classification',
  'contains_actual_project_data',
  'contains_private_data',
  'source_commitments',
]);
const COMMITMENT_KEYS = Object.freeze(['source_id', 'revision', 'sha256']);

const EXPECTED_SOURCES = Object.freeze([
  Object.freeze({
    source_id: 'NASA_SE_HDBK_R2',
    authority_family: 'general_se_guidance',
    title: 'NASA Systems Engineering Handbook',
    filename: 'NASA_SP_2016_6105_Rev2.pdf',
    revision: 'NASA/SP-2016-6105 Rev 2',
    sha256: '3153ae2e53e29452d5997efafe280a5f05cd21b43a047e988a17e1dd5207a38e',
    byte_length: 4122125,
    official_landing_url: 'https://ntrs.nasa.gov/citations/20170001761',
    official_artifact_url: 'https://ntrs.nasa.gov/api/citations/20170001761/downloads/20170001761.pdf',
    rights_basis: 'NTRS Distribution Limits: Public; Copyright: Public Use Permitted',
  }),
  Object.freeze({
    source_id: 'NASA_HDBK_1009A',
    authority_family: 'general_se_guidance',
    title: 'NASA Systems Modeling Handbook',
    filename: 'NASA_HDBK_1009A.pdf',
    revision: 'Revision A approved 2025-03-12',
    sha256: '0433f3e9d7de8999182e2f64584ff3cbbcec507b2152aadd4bc48206f16f2cf9',
    byte_length: 8147085,
    official_landing_url: 'https://standards.nasa.gov/standard/NASA/NASA-HDBK-1009',
    official_artifact_url: 'https://standards.nasa.gov/system/files/tmp/2025-03-12-NASA-HDBK-1009A.pdf',
    rights_basis: 'Internet Public; PUBLIC: Upload Publicly Available Standard; Approved for public release, distribution unlimited',
  }),
  Object.freeze({
    source_id: 'DOD_SE_GUIDEBOOK_2022',
    authority_family: 'general_se_guidance',
    title: 'DoD Systems Engineering Guidebook',
    filename: 'DoD_Systems_Engineering_Guidebook_Feb2022.pdf',
    revision: 'February 2022',
    sha256: '1a4a839253c3580d1e3cec2bc3f0d066182e56cee1cbb9f0d3293d9fb6bffe62',
    byte_length: 4502336,
    official_landing_url: 'https://www.cto.mil/sea/pg/',
    official_artifact_url: 'https://www.cto.mil/wp-content/uploads/2024/05/SE-Guidebook-Feb2022.pdf',
    rights_basis: 'Distribution Statement A; approved for public release; distribution unlimited; DOPSR 22-S-0595',
  }),
  Object.freeze({
    source_id: 'DOD_EDS_GUIDEBOOK_C2',
    authority_family: 'general_se_guidance',
    title: 'Engineering of Defense Systems Guidebook',
    filename: 'DoD_Engineering_of_Defense_Systems_Guidebook_Change2_Oct2024.pdf',
    revision: 'Change 2 October 2024',
    sha256: 'e83901401a6dbf230a4bfaa5491762d9cf698618571f4e0957cdcdc8379908e5',
    byte_length: 2659791,
    official_landing_url: 'https://www.cto.mil/sea/pg/',
    official_artifact_url: 'https://www.cto.mil/wp-content/uploads/2024/10/Eng-Def-Sys-Change2-7October2024-v3.pdf',
    rights_basis: 'Distribution Statement A; approved for public release; distribution unlimited; DOPSR 22-S-0821',
  }),
]);

const EXACT_ANALYSIS_ELIGIBILITY = Object.freeze({
  engine: 'PASS',
  notebook_shadow: 'PASS',
  byte_scope: 'exact_unmodified_full_pdf',
});
const EXACT_DERIVATIVE_BOUNDARY = Object.freeze({
  state: 'HOLD',
  basis: 'UNKNOWN_not_authorized_by_this_pack',
});

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => isRecord(value)
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key));

const refusedKey = (key) => key !== 'contains_actual_project_data'
  && /(?:^|_)(?:absolute_path|local_path|filesystem_path|account|account_id|email|secret|token|credential|password|cookie|session|project|project_id|project_code|customer|contract)(?:$|_)/i.test(key);
const refusedString = (value) => /(?:(?:^|[\s"'(=])[a-z]:[\\/]|\\\\[^\\/\s]+[\\/]|(?:^|[\s"'(=:])\/(?:Users|home|workspace|mnt|var|tmp)\/)/i.test(value)
  || /\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\b/i.test(value)
  || /\bP\d{2,4}[-_]\d{2,6}\b/i.test(value);

function hasRefusedPublicValue(value, seen = new Set()) {
  if (typeof value === 'string') return refusedString(value);
  if (value === null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => hasRefusedPublicValue(entry, seen));
  return Object.entries(value).some(([key, entry]) => refusedKey(key)
    || hasRefusedPublicValue(entry, seen));
}

function sourceFacts(source) {
  if (!isRecord(source)) return null;
  return Object.fromEntries(Object.keys(EXPECTED_SOURCES[0])
    .filter((key) => key !== 'rights_basis')
    .map((key) => [key, source[key]]));
}

function expectedCorpusCommitments() {
  return EXPECTED_SOURCES.map(({ source_id, revision, sha256 }) => ({ source_id, revision, sha256 }));
}

export function validatePublicSourcePair(sourcePack, corpus) {
  const issues = new Set();
  if (hasRefusedPublicValue(sourcePack) || hasRefusedPublicValue(corpus)) issues.add('PUBLIC_BOUNDARY');

  if (!exactKeys(sourcePack, PACK_KEYS)) issues.add('SOURCE_PACK_SHAPE');
  if (!isRecord(sourcePack)
      || sourcePack.schema_version !== 'soulforge.se_core_eval.source_pack.public.v1'
      || sourcePack.pack_id !== 'SE_CORE_EVAL_V1'
      || sourcePack.data_classification !== 'public_se_sources_only'
      || sourcePack.contains_actual_project_data !== false
      || sourcePack.contains_private_data !== false
      || sourcePack.source_count !== EXPECTED_SOURCES.length) issues.add('SOURCE_PACK_METADATA');

  if (!Array.isArray(sourcePack?.sources)
      || sourcePack.sources.length !== EXPECTED_SOURCES.length
      || !isDeepStrictEqual(sourcePack.sources.map((source) => source?.source_id),
        EXPECTED_SOURCES.map((source) => source.source_id))) issues.add('SOURCE_MEMBERSHIP');

  if (Array.isArray(sourcePack?.sources)) {
    sourcePack.sources.forEach((source, index) => {
      if (!exactKeys(source, SOURCE_KEYS)) issues.add('SOURCE_SHAPE');
      const expected = EXPECTED_SOURCES[index];
      const expectedFacts = expected && Object.fromEntries(Object.entries(expected)
        .filter(([key]) => key !== 'rights_basis'));
      if (!expected || !isDeepStrictEqual(sourceFacts(source), expectedFacts)) issues.add('SOURCE_FACTS');
      if (!expected || source?.rights_basis !== expected.rights_basis) issues.add('RIGHTS_BASIS');
      if (!exactKeys(source?.analysis_eligibility, ANALYSIS_KEYS)
          || !isDeepStrictEqual(source.analysis_eligibility, EXACT_ANALYSIS_ELIGIBILITY)) {
        issues.add('ANALYSIS_ELIGIBILITY');
      }
      if (!exactKeys(source?.derivative_graphics_republication, DERIVATIVE_KEYS)
          || !isDeepStrictEqual(source.derivative_graphics_republication, EXACT_DERIVATIVE_BOUNDARY)) {
        issues.add('DERIVATIVE_RIGHTS_BOUNDARY');
      }
    });
  }

  if (!exactKeys(corpus, CORPUS_KEYS)) issues.add('CORPUS_SHAPE');
  if (!isRecord(corpus)
      || corpus.data_classification !== 'public_se_sources_only'
      || corpus.contains_actual_project_data !== false
      || corpus.contains_private_data !== false) issues.add('CORPUS_METADATA');
  if (!Array.isArray(corpus?.source_commitments)
      || corpus.source_commitments.length !== EXPECTED_SOURCES.length
      || corpus.source_commitments.some((entry) => !exactKeys(entry, COMMITMENT_KEYS))) {
    issues.add('CORPUS_COMMITMENT_SHAPE');
  }
  if (!isDeepStrictEqual(corpus?.source_commitments, expectedCorpusCommitments())) {
    issues.add('CORPUS_MEMBERSHIP_OR_PIN');
  }

  const projected = Array.isArray(sourcePack?.sources)
    ? sourcePack.sources.map((source) => (isRecord(source)
      ? { source_id: source.source_id, revision: source.revision, sha256: source.sha256 }
      : null))
    : null;
  if (!isDeepStrictEqual(corpus?.source_commitments, projected)) issues.add('PAIR_MISMATCH');

  return Object.freeze({ ok: issues.size === 0, issues: Object.freeze([...issues].sort()) });
}

const sourcePack = JSON.parse(readFileSync(SOURCE_PACK_PATH, 'utf8'));
const corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));
const clone = (value) => structuredClone(value);

function expectRefused(mutator, expectedIssue) {
  const changedPack = clone(sourcePack);
  const changedCorpus = clone(corpus);
  mutator(changedPack, changedCorpus);
  const result = validatePublicSourcePair(changedPack, changedCorpus);
  assert.equal(result.ok, false);
  assert.ok(result.issues.includes(expectedIssue), `expected ${expectedIssue}, got ${result.issues.join(',')}`);
}

test('the checked-in source pack and scorer-shaped corpus are an exact public-safe pair', () => {
  assert.deepEqual(validatePublicSourcePair(sourcePack, corpus), { ok: true, issues: [] });
  assert.deepEqual(Object.keys(corpus).sort(), [...CORPUS_KEYS].sort());
  assert.ok(corpus.source_commitments.every((entry) => isDeepStrictEqual(
    Object.keys(entry).sort(), [...COMMITMENT_KEYS].sort(),
  )));
});

test('hash and byte drift are refused', () => {
  expectRefused((pack) => { pack.sources[0].sha256 = '0'.repeat(64); }, 'SOURCE_FACTS');
  expectRefused((pack) => { pack.sources[0].byte_length += 1; }, 'SOURCE_FACTS');
  expectRefused((_, scorerCorpus) => { scorerCorpus.source_commitments[0].sha256 = '0'.repeat(64); },
    'CORPUS_MEMBERSHIP_OR_PIN');
});

test('revision drift is refused in either representation', () => {
  expectRefused((pack) => { pack.sources[1].revision = 'Revision B'; }, 'SOURCE_FACTS');
  expectRefused((_, scorerCorpus) => { scorerCorpus.source_commitments[1].revision = 'Revision B'; },
    'CORPUS_MEMBERSHIP_OR_PIN');
});

test('missing, extra, duplicated, or reordered membership is refused', () => {
  expectRefused((pack) => { pack.sources.pop(); pack.source_count = 3; }, 'SOURCE_MEMBERSHIP');
  expectRefused((pack) => { pack.sources.push(clone(pack.sources[0])); pack.source_count = 5; }, 'SOURCE_MEMBERSHIP');
  expectRefused((pack) => { [pack.sources[0], pack.sources[1]] = [pack.sources[1], pack.sources[0]]; },
    'SOURCE_MEMBERSHIP');
  expectRefused((_, scorerCorpus) => { scorerCorpus.source_commitments.pop(); }, 'CORPUS_COMMITMENT_SHAPE');
});

test('extra fields are refused at pack, source, corpus, and commitment boundaries', () => {
  expectRefused((pack) => { pack.note = 'extra'; }, 'SOURCE_PACK_SHAPE');
  expectRefused((pack) => { pack.sources[0].note = 'extra'; }, 'SOURCE_SHAPE');
  expectRefused((_, scorerCorpus) => { scorerCorpus.note = 'extra'; }, 'CORPUS_SHAPE');
  expectRefused((_, scorerCorpus) => { scorerCorpus.source_commitments[0].note = 'extra'; },
    'CORPUS_COMMITMENT_SHAPE');
});

test('local paths, account identifiers, and real-project markers are refused', () => {
  expectRefused((pack) => { pack.sources[0].title = ['C:', 'private', 'source.pdf'].join('\\'); },
    'PUBLIC_BOUNDARY');
  expectRefused((pack) => { pack.sources[0].title = 'owner@example.invalid'; }, 'PUBLIC_BOUNDARY');
  expectRefused((pack) => { pack.sources[0].title = SYNTHETIC_PROJECT_MARKER; }, 'PUBLIC_BOUNDARY');
  expectRefused((pack) => { pack.account_id = 'opaque'; }, 'PUBLIC_BOUNDARY');
});

test('rights basis and exact-byte analysis eligibility cannot drift', () => {
  expectRefused((pack) => { pack.sources[0].rights_basis = 'public'; }, 'RIGHTS_BASIS');
  expectRefused((pack) => { pack.sources[0].analysis_eligibility.engine = 'HOLD'; },
    'ANALYSIS_ELIGIBILITY');
  expectRefused((pack) => { pack.sources[0].analysis_eligibility.notebook_shadow = 'HOLD'; },
    'ANALYSIS_ELIGIBILITY');
  expectRefused((pack) => { pack.sources[0].analysis_eligibility.byte_scope = 'derived_excerpt'; },
    'ANALYSIS_ELIGIBILITY');
  expectRefused((pack) => { pack.sources[0].derivative_graphics_republication.state = 'PASS'; },
    'DERIVATIVE_RIGHTS_BOUNDARY');
});

test('the scorer corpus remains an exact projection of source id, revision, and hash only', () => {
  expectRefused((_, scorerCorpus) => { scorerCorpus.source_commitments[0].byte_length = 4122125; },
    'CORPUS_COMMITMENT_SHAPE');
  expectRefused((pack) => { pack.sources[0].sha256 = '0'.repeat(64); }, 'PAIR_MISMATCH');
});
