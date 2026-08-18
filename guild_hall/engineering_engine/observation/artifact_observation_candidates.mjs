// The eye, part one: project material to *candidate* artifact observations.
//
// The engine compares an expected state ("what should this stage hold") with an observed state
// ("what does it actually hold"). The expected side is compiled from the rule spec. This module
// is the first half of the observed side: given a plain inventory of files that a caller walked,
// plus the same compiled rule specs the compiler reads, it proposes which file looks like which
// standard artifact, at which stage, at which maturity — and says how it reached each proposal.
//
// Three rules give this module its shape.
//
// 1. **A proposal is not an observation.** Design D37 puts automatic extraction at candidate
//    level and leaves confirmation to a person. Every row this module emits carries
//    `needs_owner_confirmation`, and the single exception is stated in rule 2. Nothing here
//    writes an observation the engine will read; that is `artifact_observations_from_confirmed`,
//    and it only accepts rows a person (or rule 2) confirmed.
// 2. **One rule is clear enough to confirm itself.** A file sitting in a task folder's `03_Out`
//    is, by the folder-tree contract, the output of exactly that task. When the task maps to
//    exactly one artifact type, that is not an inference, it is the folder convention read back,
//    so such a row may be auto-confirmed. Anything less certain waits for a person.
// 3. **Never invent.** A file with no cue is `unmatched`, a file with two competing cues is
//    `ambiguous`, and neither is quietly resolved. Matching is rule-based only: task folder
//    numbers, spec terms, vocabulary labels, overlay aliases. No model is called, no neighbouring
//    artifact type is guessed at, and absence is never asserted — this module can only ever say
//    `present`, because not finding a file is not the same as confirming one is missing.
//
// Nothing here reads a file, a clock, a random source, an environment value, or a network: the
// caller owns all of that (`tools/artifact_observation_inventory_runner.mjs` is the caller that
// does). Two callers holding the same inventory must reach byte-identical output, which is why
// every ordering is declared and every digest is taken over a canonical form.
import { createHash } from 'node:crypto';

import { canonicalise, compareCodePoints, isCanonicalInstant } from '../kernel/canonical.mjs';
import { artifactTypeEntry, isKnownArtifactType } from '../stage_rules/artifact_vocabulary.mjs';

export const ARTIFACT_OBSERVATION_CANDIDATES_SCHEMA_VERSION = 'soulforge.artifact_observation_candidates.v0';
export const COMPILED_VARIANT_SCHEMA_PIN = 'soulforge.se_foldertree_compiled_variant.v0';

export const OBSERVATION_CANDIDATE_ERROR_CODES = Object.freeze({
  REQUEST_INVALID: 'OBSERVATION_CANDIDATE_REQUEST_INVALID',
  INVENTORY_INVALID: 'OBSERVATION_CANDIDATE_INVENTORY_INVALID',
  VARIANT_INVALID: 'OBSERVATION_CANDIDATE_VARIANT_INVALID',
  ALIAS_INVALID: 'OBSERVATION_CANDIDATE_ALIAS_INVALID',
  ALIAS_PATTERN_INVALID: 'OBSERVATION_CANDIDATE_ALIAS_PATTERN_INVALID',
  VOCABULARY_INVALID: 'OBSERVATION_CANDIDATE_VOCABULARY_INVALID',
  STAGE_CODE_UNKNOWN: 'OBSERVATION_CANDIDATE_STAGE_CODE_UNKNOWN',
});

export class ArtifactObservationCandidateError extends Error {
  constructor(code, message, detail = {}) {
    super(`${code}: ${message}`);
    this.name = 'ArtifactObservationCandidateError';
    this.code = code;
    this.detail = detail;
  }
}

// Refusals carry a static field label and nothing else. A rejected path, file name, or project
// term must not travel back to the caller inside the error it caused.
const fail = (code, message, detail = {}) => {
  throw new ArtifactObservationCandidateError(code, message, detail);
};

// ---------------------------------------------------------------- declared vocabularies

// Gate code to engine stage code, restated from `stage_rules/stage_rule_compiler.mjs`.
//
// The compiler keeps this map private, and importing it is not worth widening that module's
// export surface, so it is pinned here and the test suite asserts the two agree by compiling a
// variant and comparing stage codes. A gate code outside this map is refused rather than
// guessed, because guessing would file a real artifact under a stage nobody chose.
const STAGE_CODE_BY_GATE_CODE = new Map([
  [0, '000_REF'],
  [20, '020_MGMT'],
  [30, '030_SRR'],
  [60, '060_SFR'],
  [90, '090_PDR'],
  [120, '120_CDR'],
  [150, '150_TRR_DT'],
  [180, '180_FCA_OT'],
  [210, '210_PCA'],
  [240, '240_LL'],
  [270, '270_UNCLASSIFIED'],
]);

/**
 * The engine stage code one gate code names, or `null`.
 *
 * Exported so the test suite can hold this map against the compiler's own answer rather than
 * against a second copy of the same list.
 */
export function engineStageCodeForGate(gateCode) {
  return STAGE_CODE_BY_GATE_CODE.get(gateCode) ?? null;
}

export const PRESENCE_STATE_PRESENT = 'present';
export const CONFIDENCE = Object.freeze({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low' });
export const MATURITY = Object.freeze({
  PRELIMINARY: 'preliminary', UPDATED: 'updated', BASELINE: 'baseline', FINAL: 'final',
});
// Ordered strongest first; the sheet a person reads lists cues in this order.
//
// `type_token` is the standard token itself (`bom`, `hdd`, `icd`) appearing in a file name. It is
// separated from `filename_term` because it says something different: the spec's term is what
// this business type calls the artifact, the token is what every business type calls it, so a
// token match is the one cue that works in a project whose spec row carries no short term.
// `alias_pattern` is a project-registered shape (a drawing-number prefix, a document-number
// scheme) — a name that names the artifact by convention rather than by word.
export const CUE_KINDS = Object.freeze([
  'task_folder', 'filename_term', 'type_token', 'label_ko', 'label_en',
  'alias', 'alias_pattern', 'title',
]);

// The folder the folder-tree contract reserves for a task's finished output. Rule 2 above rests
// on this one name; a file anywhere else in the task folder is working material.
export const OUT_FOLDER = '03_Out';

// Families that are real rows but never a document this layer can observe.
//
// `internal` covers the fixed folders every variant carries; their labels ("Inbox", "Work Log")
// are common words that would match half a project. `activity` and `decision` are the D46 node
// kinds: an activity is work a canonical text says has to happen, a decision is a state that has
// to be declared, and neither is a file. Finding a PDF in an activity's folder would say the
// folder is not empty, not that the work was done — the row that answers "did it happen" is the
// evidence record the rule table names, which is an artifact row of its own. So these families
// take no part in cue matching and can never become a candidate.
const NON_EVIDENCE_FAMILIES = new Set(['internal', 'activity', 'decision']);

// The D46 node kind a rule row must carry to be observable at all. A row that predates the field
// is read as an artifact, which is what every row was before D46.
const OBSERVABLE_NODE_KIND = 'artifact';

// Maturity readings, strongest first. A name that says both "final" and "draft" is read as the
// stronger claim rather than as an ambiguity, because that is what a file called
// `..._초안_최종.pdf` means in practice: a draft that has since been finalised.
// A `patterns` entry beginning with an underscore is a maturity suffix: it matches at the end of
// the stem, or anywhere the same letter stands alone as its own token (`..._F_20260101`). The
// `expressions` entries catch the numbered forms a person actually types — `rev3`, `Rev_2`, and
// the `v0.x` that means "not finished yet" whatever else the name says.
// `승인본`/`확정본`/`배포본` sit with FINAL rather than with BASELINE and are listed before the
// bare `승인`, because the `-본` suffix names the copy that was issued, while `승인` on its own
// names the act of approving. Order decides which reading wins, so the longer word comes first.
// The interim wordings on the PRELIMINARY row are the ones a real project produces between two
// issues (`중간수정본`, `검토본`, `임시`); they mean "not the issue", which is the draft side.
const MATURITY_RULES = Object.freeze([
  Object.freeze({
    maturity: MATURITY.FINAL,
    patterns: Object.freeze(['승인본', '확정본', '배포본', '최종', 'final', '_f']),
    expressions: Object.freeze([]),
  }),
  Object.freeze({
    maturity: MATURITY.BASELINE,
    patterns: Object.freeze(['승인', '기준선', 'baseline', 'approved']),
    expressions: Object.freeze([]),
  }),
  Object.freeze({
    maturity: MATURITY.UPDATED,
    patterns: Object.freeze(['업데이트', '개정', 'update', 'updated', 'rev', '_u']),
    expressions: Object.freeze([/(?:^|[^a-z0-9])rev[._-]?\d+/u]),
  }),
  Object.freeze({
    maturity: MATURITY.PRELIMINARY,
    patterns: Object.freeze([
      '중간수정본', '수정본', '검토본', '중간본', '임시', 'wip',
      '초안', 'draft', 'preliminary', '_d',
    ]),
    expressions: Object.freeze([/(?:^|[^a-z0-9])[vr]0[._]\d+/u]),
  }),
]);

// The interim wordings, restated for the housekeeping report so that "this 03_Out still holds a
// working copy" is asked of one list rather than of a second copy of it.
export const INTERIM_WORDINGS = Object.freeze([
  '중간수정본', '수정본', '검토본', '중간본', '임시', 'wip', '초안', 'draft',
]);

// ---------------------------------------------------------------- bounds

const MAX = Object.freeze({
  inventory: 200000, variants: 16, aliases: 4096, gates: 64, tasks: 4096,
  vocabulary: 4096, string: 1024, cues: 24, options: 32,
  patterns: 512, pattern: 200,
});

// ---------------------------------------------------------------- small assertions

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function assertPlainObject(value, where, code) {
  if (!isPlainObject(value)) fail(code, `${where} must be an object`, { where });
  return value;
}

function assertArray(value, where, code, limit) {
  if (!Array.isArray(value) || value.length > limit) {
    fail(code, `${where} must be an array within its item limit`, { where });
  }
  return value;
}

function assertExactKeys(value, required, optional, where, code) {
  assertPlainObject(value, where, code);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(code, `${where} carries an undeclared field`, { where });
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(code, `${where} is missing a declared field`, { where, field: key });
  }
  return value;
}

function assertText(value, where, code) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX.string
      || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(code, `${where} must be bounded single-line text`, { where });
  }
  return value;
}

const SHA256_HEX = /^[0-9a-f]{64}$/u;

// ---------------------------------------------------------------- canonical digests

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
  let canonical;
  try {
    canonical = canonicalise(projected, arrayOrderRules(projected));
  } catch (error) {
    // The canonical layer names the offending path and echoes the rejected value in its detail.
    // Neither belongs in a refusal that travels back to a caller.
    return fail(OBSERVATION_CANDIDATE_ERROR_CODES.REQUEST_INVALID,
      'observation candidate material is not canonically serialisable',
      { domain, contract_code: error?.code ?? null });
  }
  return sha256Hex(`${domain}\n${canonical}`);
}

const candidateDomain = (name) => `${ARTIFACT_OBSERVATION_CANDIDATES_SCHEMA_VERSION}.${name}`;

/**
 * Mints one opaque identifier in canonical UUID layout from declared material.
 *
 * The layout matters: every consumer downstream accepts an identifier only if it is opaque, and
 * a canonical UUID is opaque by construction because every character is hex in a fixed shape and
 * so cannot carry a project code, a path, or a date. The bits are a digest rather than a random
 * draw, which is what makes two callers holding one inventory reach one candidate id.
 */
export function mintIdentifier(domain, parts) {
  const h = sha256Hex(`${domain}\n${parts.join('\u001f')}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// ---------------------------------------------------------------- text helpers

const nfc = (value) => value.normalize('NFC');
const fold = (value) => nfc(value).toLowerCase();

// A latin cue term matches only on a token boundary. Without this, `srs` would match inside
// `versrsion` and, more realistically, `dt` would match inside every date-stamped file name.
const LATIN = /^[\u0020-\u007e]+$/u;
const isBoundary = (character) => character === undefined || !/[a-z0-9]/u.test(character);

function containsTerm(haystack, term) {
  if (term.length === 0) return false;
  if (!LATIN.test(term)) return haystack.includes(term);
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(term, from);
    if (at < 0) return false;
    if (isBoundary(haystack[at - 1]) && isBoundary(haystack[at + term.length])) return true;
    from = at + 1;
  }
}

/**
 * Where a file sits in the folder-tree shape, or `null` if it does not sit in one.
 *
 * `gate/task/03_Out/...` is the only shape this layer reads structurally. Exported because the
 * confirmation sheet and the housekeeping report both group by task folder, and one parse shared
 * between them is one definition of "the same folder".
 */
export function locateInTaskFolder(fileRef) {
  const segments = String(fileRef).split('/');
  if (segments.length < 3) return null;
  if (!/^\d{1,6}_/u.test(segments[0]) || !/^\d{1,6}_/u.test(segments[1])) return null;
  return {
    gate: segments[0],
    task_folder: segments[1],
    task_folder_ref: `${segments[0]}/${segments[1]}`,
    in_out_folder: segments[2] === OUT_FOLDER,
  };
}

/** The leading `NNN_` number of a gate or task folder name, or `null`. */
function leadingNumber(folderName) {
  const match = /^(\d{1,6})_/u.exec(folderName);
  return match === null ? Number.NaN : Number(match[1]);
}

/**
 * Cue terms carried by one spec task name.
 *
 * `HW설계기술서(HDD)_F` yields `hdd` (the abbreviation a person actually types into a file name),
 * `hw설계기술서` (the words), and the whole base name. The maturity suffix is stripped first: it
 * describes the folder's expected maturity, not the artifact's identity.
 */
function taskNameTerms(name) {
  const base = nfc(name).replace(/_(?:d|u|f)$/iu, '');
  const terms = [base];
  for (const match of base.matchAll(/\(([^()]{1,64})\)/gu)) terms.push(match[1]);
  const withoutParens = base.replace(/\([^()]*\)/gu, '').replace(/[_\s]+/gu, ' ').trim();
  if (withoutParens.length > 0) terms.push(withoutParens);
  return terms;
}

/**
 * True when a cue term is specific enough to be evidence.
 *
 * Latin terms need three characters (`ICD`, `RTM`, `BOM`); two-letter latin tokens appear inside
 * ordinary words and dates too often to mean anything. Korean terms need two, because two Korean
 * characters already carry a word.
 */
function isUsableTerm(term) {
  const trimmed = term.trim();
  if (trimmed.length === 0 || /^[\d\s_.-]+$/u.test(trimmed)) return false;
  return LATIN.test(trimmed) ? trimmed.length >= 3 : trimmed.length >= 2;
}

// ---------------------------------------------------------------- rule index

const stageTypeKey = (stageCode, artifactTypeId) => `${stageCode}\u001f${artifactTypeId}`;

function addCueTerm(index, term, kind, stageCode, artifactTypeId) {
  if (!isUsableTerm(term)) return;
  const folded = fold(term).trim();
  if (!isUsableTerm(folded)) return;
  let row = index.get(folded);
  if (row === undefined) {
    row = { kind, targets: new Set() };
    index.set(folded, row);
  }
  // A term claimed by two cue kinds keeps the first (strongest) kind it was registered under;
  // registration order below is spec term, then vocabulary label, then overlay alias.
  row.targets.add(stageTypeKey(stageCode, artifactTypeId));
}

/**
 * Builds the one index every match is read out of: cue term to the (stage, artifact type) pairs
 * that term can mean, plus the task-number map that rule 2 rests on.
 */
function buildRuleIndex(variants, overlayAliases, vocabulary, aliasPatterns) {
  const code = OBSERVATION_CANDIDATE_ERROR_CODES.VARIANT_INVALID;
  const termIndex = new Map();
  const taskTargets = new Map();
  const stagesByType = new Map();
  const declaredPairs = new Set();
  const nonEvidenceTypes = new Set();

  const vocabularyById = new Map();
  for (const row of assertArray(vocabulary, 'request.vocabulary',
    OBSERVATION_CANDIDATE_ERROR_CODES.VOCABULARY_INVALID, MAX.vocabulary)) {
    assertPlainObject(row, 'request.vocabulary[]', OBSERVATION_CANDIDATE_ERROR_CODES.VOCABULARY_INVALID);
    const id = assertText(row.artifact_type_id, 'request.vocabulary[].artifact_type_id',
      OBSERVATION_CANDIDATE_ERROR_CODES.VOCABULARY_INVALID);
    vocabularyById.set(id, row);
    if (NON_EVIDENCE_FAMILIES.has(row.family)) nonEvidenceTypes.add(id);
  }
  if (vocabularyById.size === 0) {
    fail(OBSERVATION_CANDIDATE_ERROR_CODES.VOCABULARY_INVALID,
      'request.vocabulary must declare at least one artifact type',
      { where: 'request.vocabulary' });
  }

  for (const variant of variants) {
    assertPlainObject(variant, 'request.compiled_variants[]', code);
    if (variant.schema_version !== COMPILED_VARIANT_SCHEMA_PIN) {
      fail(code, 'a compiled variant carries an unsupported schema version',
        { where: 'request.compiled_variants[].schema_version' });
    }
    for (const gate of assertArray(variant.gates, 'request.compiled_variants[].gates', code, MAX.gates)) {
      assertPlainObject(gate, 'request.compiled_variants[].gates[]', code);
      if (!Number.isSafeInteger(gate.code)) {
        fail(code, 'a gate code must be an integer', { where: 'request.compiled_variants[].gates[].code' });
      }
      const stageCode = STAGE_CODE_BY_GATE_CODE.get(gate.code);
      if (stageCode === undefined) {
        fail(OBSERVATION_CANDIDATE_ERROR_CODES.STAGE_CODE_UNKNOWN,
          'gate code does not map to an engine stage code',
          { where: 'request.compiled_variants[].gates[].code', gate_code: gate.code });
      }
      for (const task of assertArray(gate.tasks, 'request.compiled_variants[].gates[].tasks',
        code, MAX.tasks)) {
        assertPlainObject(task, 'request.compiled_variants[].gates[].tasks[]', code);
        const artifactTypeId = task.artifact_type_id;
        if (typeof artifactTypeId !== 'string' || artifactTypeId.length === 0) continue;
        if (!isKnownArtifactType(artifactTypeId)) continue;
        if (nonEvidenceTypes.has(artifactTypeId)) continue;
        if (task.is_fixed === true) continue;
        if (Object.hasOwn(task, 'node_kind') && task.node_kind !== OBSERVABLE_NODE_KIND) continue;

        declaredPairs.add(stageTypeKey(stageCode, artifactTypeId));
        let stages = stagesByType.get(artifactTypeId);
        if (stages === undefined) { stages = new Set(); stagesByType.set(artifactTypeId, stages); }
        stages.add(stageCode);

        if (Number.isSafeInteger(task.id)) {
          let targets = taskTargets.get(task.id);
          if (targets === undefined) { targets = new Set(); taskTargets.set(task.id, targets); }
          targets.add(stageTypeKey(stageCode, artifactTypeId));
        }
        if (typeof task.term === 'string') {
          addCueTerm(termIndex, task.term, 'filename_term', stageCode, artifactTypeId);
        }
        if (typeof task.name === 'string') {
          for (const term of taskNameTerms(task.name)) {
            addCueTerm(termIndex, term, 'filename_term', stageCode, artifactTypeId);
          }
        }
      }
    }
  }

  // Vocabulary labels and the token itself are stage-agnostic: they say what an artifact type is
  // called, not where it belongs. They are registered against every stage the rule specs place
  // that type in, so neither can invent a stage the rules do not declare.
  //
  // The token is registered because it is what people actually type. A parts list filed as
  // `K-VDS_BOM_260818.xlsx` names its artifact perfectly well; the spec row for that task calls
  // it `Q-BOM` and the vocabulary calls it 부품목록, and before this the file matched neither.
  // Token matching is boundary-bounded like every other latin cue, so `bom` does not find `bomb`.
  for (const [artifactTypeId, stages] of stagesByType) {
    const entry = vocabularyById.get(artifactTypeId) ?? artifactTypeEntry(artifactTypeId);
    for (const stageCode of stages) {
      addCueTerm(termIndex, artifactTypeId, 'type_token', stageCode, artifactTypeId);
      if (entry === null || entry === undefined) continue;
      if (typeof entry.label_ko === 'string') {
        addCueTerm(termIndex, entry.label_ko, 'label_ko', stageCode, artifactTypeId);
      }
      if (typeof entry.label_en === 'string') {
        addCueTerm(termIndex, entry.label_en, 'label_en', stageCode, artifactTypeId);
      }
    }
  }

  for (const row of overlayAliases) {
    const aliasCode = OBSERVATION_CANDIDATE_ERROR_CODES.ALIAS_INVALID;
    assertExactKeys(row, ['stage_code', 'artifact_type_id', 'alias'], ['label'],
      'request.overlay_aliases[]', aliasCode);
    const stageCode = assertText(row.stage_code, 'request.overlay_aliases[].stage_code', aliasCode);
    if (![...STAGE_CODE_BY_GATE_CODE.values()].includes(stageCode)) {
      fail(OBSERVATION_CANDIDATE_ERROR_CODES.STAGE_CODE_UNKNOWN,
        'an overlay alias names a stage code the engine does not declare',
        { where: 'request.overlay_aliases[].stage_code' });
    }
    const artifactTypeId = assertText(row.artifact_type_id,
      'request.overlay_aliases[].artifact_type_id', aliasCode);
    if (nonEvidenceTypes.has(artifactTypeId)) continue;
    assertText(row.alias, 'request.overlay_aliases[].alias', aliasCode);
    declaredPairs.add(stageTypeKey(stageCode, artifactTypeId));
    let stages = stagesByType.get(artifactTypeId);
    if (stages === undefined) { stages = new Set(); stagesByType.set(artifactTypeId, stages); }
    stages.add(stageCode);
    addCueTerm(termIndex, row.alias, 'alias', stageCode, artifactTypeId);
    if (Object.hasOwn(row, 'label')) {
      // An overlay `add` row (a prime-contractor item) has a label rather than a spec term, and
      // that label is exactly the words the project puts in the folder and file name.
      addCueTerm(termIndex, assertText(row.label, 'request.overlay_aliases[].label', aliasCode),
        'alias', stageCode, artifactTypeId);
      for (const term of taskNameTerms(row.label)) {
        addCueTerm(termIndex, term, 'alias', stageCode, artifactTypeId);
      }
    }
  }

  return {
    termIndex,
    taskTargets,
    stagesByType,
    declaredPairs,
    patterns: compileAliasPatterns(aliasPatterns, stagesByType, nonEvidenceTypes, declaredPairs),
  };
}

/**
 * Compiles the project-registered name shapes into matchers.
 *
 * Some artifacts are named by a scheme rather than by a word. A project's drawings are filed as
 * `F245-013001001002(...).pdf`: nothing in that name says "drawing", and no vocabulary label,
 * spec term or token ever will. The Owner registers the shape once, privately, and from then on
 * such a file names its artifact as clearly as one called `..._도면_....pdf` does.
 *
 * `stage_code: null` means "wherever the rules place this artifact", which is why this runs after
 * the variants have been read: the pattern is registered against the stages the rule specs
 * already declare for that type, and so cannot invent a stage of its own.
 */
function compileAliasPatterns(aliasPatterns, stagesByType, nonEvidenceTypes, declaredPairs) {
  const code = OBSERVATION_CANDIDATE_ERROR_CODES.ALIAS_PATTERN_INVALID;
  const compiled = [];
  aliasPatterns.forEach((row, index) => {
    assertExactKeys(row, ['stage_code', 'artifact_type_id', 'pattern', 'basis'], [],
      'request.alias_patterns[]', code);
    const artifactTypeId = assertText(row.artifact_type_id,
      'request.alias_patterns[].artifact_type_id', code);
    if (!isKnownArtifactType(artifactTypeId)) {
      fail(code, 'an alias pattern names an artifact type no vocabulary owns',
        { where: 'request.alias_patterns[].artifact_type_id', index });
    }
    if (nonEvidenceTypes.has(artifactTypeId)) return;
    assertText(row.basis, 'request.alias_patterns[].basis', code);
    if (typeof row.pattern !== 'string' || row.pattern.length === 0
        || row.pattern.length > MAX.pattern) {
      fail(code, 'an alias pattern must be bounded regular-expression source',
        { where: 'request.alias_patterns[].pattern', index });
    }

    let stageCodes;
    if (row.stage_code === null) {
      stageCodes = [...(stagesByType.get(artifactTypeId) ?? [])];
      if (stageCodes.length === 0) {
        // The rules place this artifact nowhere in the compiled variants given, so a pattern for
        // it could only ever produce a candidate with no stage. Registered and inert rather than
        // refused: the same pattern file is meant to outlive one compile.
        return;
      }
    } else {
      const stageCode = assertText(row.stage_code, 'request.alias_patterns[].stage_code', code);
      if (![...STAGE_CODE_BY_GATE_CODE.values()].includes(stageCode)) {
        fail(OBSERVATION_CANDIDATE_ERROR_CODES.STAGE_CODE_UNKNOWN,
          'an alias pattern names a stage code the engine does not declare',
          { where: 'request.alias_patterns[].stage_code', index });
      }
      stageCodes = [stageCode];
    }

    let expression;
    try {
      expression = new RegExp(row.pattern, 'u');
    } catch {
      // The rejected pattern never travels back to the caller: a refusal names the field and the
      // row, and the pattern itself stays in the private file it came from.
      fail(code, 'an alias pattern is not a valid regular expression',
        { where: 'request.alias_patterns[].pattern', index });
    }
    for (const stageCode of stageCodes) declaredPairs.add(stageTypeKey(stageCode, artifactTypeId));
    compiled.push({
      artifact_type_id: artifactTypeId,
      targets: stageCodes.map((stageCode) => stageTypeKey(stageCode, artifactTypeId)),
      expression,
    });
  });
  return compiled;
}

// ---------------------------------------------------------------- maturity

/**
 * Reads the maturity a file name (and, failing that, its task folder) claims.
 *
 * The file wins over the folder: the folder suffix states what the stage expects to end up with,
 * the file name states what this particular file is. `null` when neither says anything — an
 * unstated maturity is unknown, never assumed final.
 */
export function readMaturity(fileName, taskFolderName) {
  for (const [source, from] of [[fileName, 'filename_term'], [taskFolderName, 'task_folder']]) {
    if (typeof source !== 'string' || source.length === 0) continue;
    const folded = fold(source);
    const stem = folded.replace(/\.[a-z0-9]{1,12}$/u, '');
    for (const rule of MATURITY_RULES) {
      for (const pattern of rule.patterns) {
        const hit = pattern.startsWith('_')
          ? stem.endsWith(pattern) || containsTerm(stem, pattern.slice(1))
          : containsTerm(folded, pattern);
        if (hit) return { maturity: rule.maturity, matched: pattern, cue_kind: from };
      }
      for (const expression of rule.expressions) {
        const hit = expression.exec(stem);
        if (hit !== null) return { maturity: rule.maturity, matched: hit[0].trim(), cue_kind: from };
      }
    }
  }
  return { maturity: null, matched: null, cue_kind: null };
}

// ---------------------------------------------------------------- inventory rows

const INVENTORY_REQUIRED = Object.freeze(['file_ref', 'name', 'ext', 'bytes', 'sha256', 'mtime_iso']);
const INVENTORY_OPTIONAL = Object.freeze(['gate_hint', 'task_folder_hint', 'title_hint']);

function readInventoryRow(row, index) {
  const code = OBSERVATION_CANDIDATE_ERROR_CODES.INVENTORY_INVALID;
  const where = 'request.inventory[]';
  assertExactKeys(row, INVENTORY_REQUIRED, INVENTORY_OPTIONAL, where, code);
  const fileRef = assertText(row.file_ref, `${where}.file_ref`, code);
  if (fileRef.includes('\\') || fileRef.startsWith('/') || /^[A-Za-z]:/u.test(fileRef)
      || fileRef.split('/').includes('..')) {
    fail(code, 'file_ref must be a relative forward-slash path inside the project root',
      { where: `${where}.file_ref`, index });
  }
  assertText(row.name, `${where}.name`, code);
  if (typeof row.ext !== 'string' || row.ext.length > 32) {
    fail(code, 'ext must be a bounded string', { where: `${where}.ext`, index });
  }
  if (!Number.isSafeInteger(row.bytes) || row.bytes < 0) {
    fail(code, 'bytes must be a non-negative integer', { where: `${where}.bytes`, index });
  }
  if (typeof row.sha256 !== 'string' || !SHA256_HEX.test(row.sha256)) {
    fail(code, 'sha256 must be a lower-case hex digest', { where: `${where}.sha256`, index });
  }
  if (!isCanonicalInstant(row.mtime_iso)) {
    fail(code, 'mtime_iso must be a canonical instant', { where: `${where}.mtime_iso`, index });
  }
  for (const field of INVENTORY_OPTIONAL) {
    if (Object.hasOwn(row, field)) assertText(row[field], `${where}.${field}`, code);
  }
  return row;
}

// ---------------------------------------------------------------- matching

function collectCues(row, ruleIndex, stageFromGate) {
  const name = fold(row.name);
  const title = Object.hasOwn(row, 'title_hint') ? fold(row.title_hint) : null;
  const byTarget = new Map();
  const record = (target, cue) => {
    let cues = byTarget.get(target);
    if (cues === undefined) { cues = []; byTarget.set(target, cues); }
    if (cues.length < MAX.cues) cues.push(cue);
  };

  for (const [term, entry] of ruleIndex.termIndex) {
    const inName = containsTerm(name, term);
    const inTitle = !inName && title !== null && containsTerm(title, term);
    if (!inName && !inTitle) continue;
    for (const target of entry.targets) {
      if (stageFromGate !== null && target.split('\u001f')[0] !== stageFromGate) continue;
      record(target, { kind: inName ? entry.kind : 'title', matched: term });
    }
  }

  // Registered name shapes are matched against the file name as written rather than the folded
  // form: the pattern is the Owner's own text and decides its own case handling.
  for (const pattern of ruleIndex.patterns) {
    const hit = pattern.expression.exec(nfc(row.name));
    if (hit === null) continue;
    for (const target of pattern.targets) {
      if (stageFromGate !== null && target.split('\u001f')[0] !== stageFromGate) continue;
      record(target, { kind: 'alias_pattern', matched: hit[0].slice(0, 64) });
    }
  }
  return byTarget;
}

function bestCues(cues) {
  // Cue order is declared so the sheet a person reads is stable: strongest kind first, then the
  // longer (more specific) matched text, then code-point order.
  const rank = new Map(CUE_KINDS.map((kind, index) => [kind, index]));
  return [...cues]
    .sort((left, right) => (rank.get(left.kind) ?? 99) - (rank.get(right.kind) ?? 99)
      || right.matched.length - left.matched.length
      || compareCodePoints(left.matched, right.matched))
    .slice(0, MAX.cues);
}

// ---------------------------------------------------------------- the seam

/**
 * Proposes candidate artifact observations for one walked inventory.
 *
 * @param request `{ inventory, compiled_variants, overlay_aliases?, alias_patterns?, vocabulary,
 *   known_at, rules? }`
 * @returns deeply frozen `{ candidates, unmatched, ambiguous, receipt }`
 */
export function buildArtifactObservationCandidates(request) {
  const code = OBSERVATION_CANDIDATE_ERROR_CODES.REQUEST_INVALID;
  assertExactKeys(request, ['inventory', 'compiled_variants', 'vocabulary', 'known_at'],
    ['overlay_aliases', 'alias_patterns', 'rules'], 'request', code);

  const inventory = assertArray(request.inventory, 'request.inventory',
    OBSERVATION_CANDIDATE_ERROR_CODES.INVENTORY_INVALID, MAX.inventory);
  const variants = assertArray(request.compiled_variants, 'request.compiled_variants',
    OBSERVATION_CANDIDATE_ERROR_CODES.VARIANT_INVALID, MAX.variants);
  if (variants.length === 0) {
    fail(OBSERVATION_CANDIDATE_ERROR_CODES.VARIANT_INVALID,
      'request.compiled_variants must carry at least one compiled variant',
      { where: 'request.compiled_variants' });
  }
  const overlayAliases = Object.hasOwn(request, 'overlay_aliases')
    ? assertArray(request.overlay_aliases, 'request.overlay_aliases',
      OBSERVATION_CANDIDATE_ERROR_CODES.ALIAS_INVALID, MAX.aliases)
    : [];
  const aliasPatterns = Object.hasOwn(request, 'alias_patterns')
    ? assertArray(request.alias_patterns, 'request.alias_patterns',
      OBSERVATION_CANDIDATE_ERROR_CODES.ALIAS_PATTERN_INVALID, MAX.patterns)
    : [];
  if (!isCanonicalInstant(request.known_at)) {
    fail(code, 'request.known_at must be a canonical instant', { where: 'request.known_at' });
  }
  const rules = Object.hasOwn(request, 'rules')
    ? assertExactKeys(request.rules, [], ['auto_confirm_03_out'], 'request.rules', code)
    : {};
  if (Object.hasOwn(rules, 'auto_confirm_03_out') && typeof rules.auto_confirm_03_out !== 'boolean') {
    fail(code, 'request.rules.auto_confirm_03_out must be a boolean',
      { where: 'request.rules.auto_confirm_03_out' });
  }
  const autoConfirmOut = rules.auto_confirm_03_out === true;

  const ruleIndex = buildRuleIndex(variants, overlayAliases, request.vocabulary, aliasPatterns);

  const candidates = [];
  const unmatched = [];
  const ambiguous = [];
  const seenFileRefs = new Set();
  // Rows that sat in the right `03_Out` under an unambiguous task folder and still did not
  // auto-confirm, because the file itself said nothing about what it is. Counted rather than
  // hidden: this number is how a person sees whether the tightened rule is doing work.
  let withheldForNoOwnCue = 0;

  inventory.forEach((raw, index) => {
    const row = readInventoryRow(raw, index);
    if (seenFileRefs.has(row.file_ref)) {
      fail(OBSERVATION_CANDIDATE_ERROR_CODES.INVENTORY_INVALID,
        'request.inventory names one file twice', { where: 'request.inventory[].file_ref', index });
    }
    seenFileRefs.add(row.file_ref);

    const segments = row.file_ref.split('/');
    const gateHint = Object.hasOwn(row, 'gate_hint') ? row.gate_hint : null;
    const taskFolderHint = Object.hasOwn(row, 'task_folder_hint') ? row.task_folder_hint : null;

    let stageFromGate = null;
    if (gateHint !== null) {
      const gateCode = leadingNumber(gateHint);
      stageFromGate = Number.isNaN(gateCode) ? null : STAGE_CODE_BY_GATE_CODE.get(gateCode) ?? null;
      if (stageFromGate === null) {
        unmatched.push({ file_ref: row.file_ref, reason: 'gate_hint_is_not_an_engine_stage' });
        return;
      }
    }

    // ---- rule 2: the task folder number, read straight out of the folder-tree contract.
    let taskTargets = null;
    if (taskFolderHint !== null) {
      const taskId = leadingNumber(taskFolderHint);
      const targets = Number.isNaN(taskId) ? undefined : ruleIndex.taskTargets.get(taskId);
      if (targets !== undefined) {
        const scoped = [...targets].filter(
          (target) => stageFromGate === null || target.split('\u001f')[0] === stageFromGate,
        );
        if (scoped.length > 0) taskTargets = scoped;
      }
    }

    const cueTargets = collectCues(row, ruleIndex, stageFromGate);

    let target = null;
    let cues = [];
    let confidence = CONFIDENCE.LOW;
    // A cue for this artifact found in the file's own name or title, as opposed to inherited from
    // the folder it happens to sit in. Rule 2 below turns on this distinction.
    let ownNameCues = [];
    if (taskTargets !== null && taskTargets.length === 1) {
      target = taskTargets[0];
      ownNameCues = bestCues(cueTargets.get(target) ?? []);
      cues = [{ kind: 'task_folder', matched: taskFolderHint }, ...ownNameCues];
      confidence = CONFIDENCE.HIGH;
    } else if (taskTargets !== null && taskTargets.length > 1) {
      ambiguous.push({
        file_ref: row.file_ref,
        options: [...new Set(taskTargets.map((key) => key.split('\u001f')[1]))]
          .sort(compareCodePoints).slice(0, MAX.options),
      });
      return;
    } else {
      const types = new Set([...cueTargets.keys()].map((key) => key.split('\u001f')[1]));
      if (types.size === 0) {
        unmatched.push({ file_ref: row.file_ref, reason: 'no_rule_cue_in_name_or_title' });
        return;
      }
      if (types.size > 1) {
        ambiguous.push({
          file_ref: row.file_ref,
          options: [...types].sort(compareCodePoints).slice(0, MAX.options),
        });
        return;
      }
      const [artifactTypeId] = [...types];
      const matchedKeys = [...cueTargets.keys()].filter(
        (key) => key.split('\u001f')[1] === artifactTypeId,
      );
      let stageCode = stageFromGate;
      if (stageCode === null) {
        const stages = [...new Set(matchedKeys.map((key) => key.split('\u001f')[0]))];
        if (stages.length !== 1) {
          // The name says what it is but nothing says where it belongs, and this module does not
          // choose a stage on a project's behalf.
          unmatched.push({ file_ref: row.file_ref, reason: 'stage_not_resolvable_from_path_or_rules' });
          return;
        }
        [stageCode] = stages;
      }
      target = stageTypeKey(stageCode, artifactTypeId);
      cues = bestCues(matchedKeys.flatMap((key) => cueTargets.get(key) ?? []));
      // This branch only exists because the name or the title named the artifact, so every cue
      // it found is the file's own.
      ownNameCues = cues;
      confidence = cues.some((cue) => cue.kind !== 'title') ? CONFIDENCE.MEDIUM : CONFIDENCE.LOW;
    }

    const [stageCode, artifactTypeId] = target.split('\u001f');
    // A pair the rule specs do not declare is still reported — the file exists and a person may
    // want to see it — but it cannot be read as confidently as one the rules expect.
    if (!ruleIndex.declaredPairs.has(target) && confidence !== CONFIDENCE.HIGH) {
      confidence = CONFIDENCE.LOW;
    }

    const inOutFolder = taskFolderHint !== null
      && segments.length >= 4
      && segments[0] === gateHint
      && segments[1] === taskFolderHint
      && segments[2] === OUT_FOLDER;
    const folderResolvesToOneArtifact = taskTargets !== null && taskTargets.length === 1;
    // The file has to say what it is, not only sit where it should be.
    //
    // The first version of this rule auto-confirmed on the folder alone, and a real project broke
    // it immediately: a review-minutes task folder whose `03_Out` held the drawings and the parts
    // list that were submitted at that review, all filed as the minutes. The folder was right
    // about what belongs there and wrong about what was actually put there, and nothing in the
    // path could tell the difference. So the third condition is a cue for *this* artifact in the
    // file's own name or title. Without one the row is still a candidate — the file exists and
    // the folder still means something — but a person confirms it.
    const carriesOwnCue = ownNameCues.length > 0;
    const autoConfirmed = autoConfirmOut && inOutFolder && folderResolvesToOneArtifact && carriesOwnCue;
    if (autoConfirmOut && inOutFolder && folderResolvesToOneArtifact && !carriesOwnCue) {
      withheldForNoOwnCue += 1;
    }

    const maturityReading = readMaturity(row.name, taskFolderHint);
    const { maturity } = maturityReading;
    if (maturityReading.matched !== null && cues.length < MAX.cues) {
      cues = [...cues, { kind: maturityReading.cue_kind, matched: maturityReading.matched }];
    }

    candidates.push({
      candidate_id: mintIdentifier(candidateDomain('candidate_id'),
        [stageCode, artifactTypeId, row.file_ref, row.sha256]),
      file_ref: row.file_ref,
      artifact_type_id: artifactTypeId,
      stage_code: stageCode,
      maturity,
      presence_state: PRESENCE_STATE_PRESENT,
      confidence,
      cues,
      // Whether the file's own name or title named this artifact, as opposed to inheriting the
      // reading from its folder. The auto-confirmation rule turns on it, and the housekeeping
      // report reads it to ask "is this the right material for this folder".
      own_name_cue: carriesOwnCue,
      auto_confirmed: autoConfirmed,
      needs_owner_confirmation: !autoConfirmed,
    });
  });

  candidates.sort((left, right) => compareCodePoints(left.stage_code, right.stage_code)
    || compareCodePoints(left.artifact_type_id, right.artifact_type_id)
    || compareCodePoints(left.file_ref, right.file_ref));
  unmatched.sort((left, right) => compareCodePoints(left.file_ref, right.file_ref));
  ambiguous.sort((left, right) => compareCodePoints(left.file_ref, right.file_ref));

  const byStage = {};
  const byConfidence = { high: 0, medium: 0, low: 0 };
  for (const candidate of candidates) {
    byStage[candidate.stage_code] = (byStage[candidate.stage_code] ?? 0) + 1;
    byConfidence[candidate.confidence] += 1;
  }

  const receipt = {
    schema_version: ARTIFACT_OBSERVATION_CANDIDATES_SCHEMA_VERSION,
    known_at: request.known_at,
    input_digests: {
      inventory: canonicalDigest(candidateDomain('inventory'), inventory),
      compiled_variants: canonicalDigest(candidateDomain('compiled_variants'), variants),
      overlay_aliases: canonicalDigest(candidateDomain('overlay_aliases'), overlayAliases),
      alias_patterns: canonicalDigest(candidateDomain('alias_patterns'), aliasPatterns),
      vocabulary: canonicalDigest(candidateDomain('vocabulary'), request.vocabulary),
      rules: canonicalDigest(candidateDomain('rules'), { auto_confirm_03_out: autoConfirmOut }),
    },
    output_digests: {
      candidates: canonicalDigest(candidateDomain('candidates'), candidates),
      unmatched: canonicalDigest(candidateDomain('unmatched'), unmatched),
      ambiguous: canonicalDigest(candidateDomain('ambiguous'), ambiguous),
    },
    counts: {
      inventory_files: inventory.length,
      candidates: candidates.length,
      auto_confirmed: candidates.filter((candidate) => candidate.auto_confirmed).length,
      auto_confirm_withheld_no_own_cue: withheldForNoOwnCue,
      needs_owner_confirmation: candidates.filter((candidate) => candidate.needs_owner_confirmation).length,
      ambiguous: ambiguous.length,
      unmatched: unmatched.length,
      candidates_by_stage: byStage,
      candidates_by_confidence: byConfidence,
    },
    effects: {
      erp_writes: 0,
      filesystem_writes: 0,
      filesystem_reads: 0,
      model_calls: 0,
      network_calls: 0,
      clock_reads: 0,
    },
  };

  return deepFreeze({ candidates, unmatched, ambiguous, receipt });
}
