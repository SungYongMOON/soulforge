// The eye, part two: candidates to a sheet a person can tick, and back again.
//
// Design D37 says automatic extraction produces candidates and a human confirms them. That
// sentence only means something if confirming is cheap, so this module renders the candidate set
// as one Korean table grouped by stage — the thing the Owner actually reads — alongside a JSON
// sheet carrying the same rows with `decision: null`, which is the thing that comes back.
//
// `applyConfirmationSheet` is the return path. It is deliberately narrow: a decision may confirm
// a row, reject it, or reassign it to a different artifact type, and nothing else. A row nobody
// decided stays pending rather than defaulting either way, because "we never looked at it" and
// "we looked and it is not that" are different facts and only the second is a decision. The one
// exception is the `03_Out` auto-confirmation the candidate supplier already made under its own
// stated rule; those rows arrive confirmed and stay confirmed unless a decision overrides them.
//
// Pure: no file, clock, random source, environment value, or network. The caller renders and
// stores; this module only shapes.
import { createHash } from 'node:crypto';

import { canonicalise, compareCodePoints } from '../kernel/canonical.mjs';
import { isKnownArtifactType } from '../stage_rules/artifact_vocabulary.mjs';

export const OBSERVATION_CONFIRMATION_SHEET_SCHEMA_VERSION = 'soulforge.observation_confirmation_sheet.v0';

export const CONFIRMATION_SHEET_ERROR_CODES = Object.freeze({
  REQUEST_INVALID: 'OBSERVATION_CONFIRMATION_REQUEST_INVALID',
  CANDIDATE_INVALID: 'OBSERVATION_CONFIRMATION_CANDIDATE_INVALID',
  DECISION_INVALID: 'OBSERVATION_CONFIRMATION_DECISION_INVALID',
});

export class ObservationConfirmationError extends Error {
  constructor(code, message, detail = {}) {
    super(`${code}: ${message}`);
    this.name = 'ObservationConfirmationError';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, message, detail = {}) => {
  throw new ObservationConfirmationError(code, message, detail);
};

export const DECISIONS = Object.freeze(['confirm', 'reject', 'reassign']);
export const CONFIRMATION_SOURCES = Object.freeze({
  AUTO_OUT_FOLDER: 'auto_03_out',
  OWNER_CONFIRMED: 'owner_confirmed',
  OWNER_REASSIGNED: 'owner_reassigned',
});

// How each machine value is written for a person. Display text only: the decision is always made
// on the token, never on the label, so correcting a label here is not a rule change.
const MATURITY_LABEL_KO = Object.freeze({
  preliminary: '초안(D)',
  updated: '개정(U)',
  baseline: '기준선',
  final: '최종(F)',
});
const CONFIDENCE_LABEL_KO = Object.freeze({
  high: '높음',
  medium: '보통',
  low: '낮음',
});
const CUE_LABEL_KO = Object.freeze({
  task_folder: '업무폴더',
  filename_term: '파일명',
  label_ko: '표준어(한글)',
  label_en: '표준어(영문)',
  alias: '과제별칭',
  title: '제목',
});

const MAX = Object.freeze({ candidates: 200000, decisions: 200000, note: 512 });

const CANDIDATE_REQUIRED = Object.freeze([
  'candidate_id', 'file_ref', 'artifact_type_id', 'stage_code', 'maturity',
  'presence_state', 'confidence', 'cues', 'auto_confirmed', 'needs_owner_confirmation',
]);

// ---------------------------------------------------------------- assertions and digests

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function assertArray(value, where, code, limit) {
  if (!Array.isArray(value) || value.length > limit) {
    fail(code, `${where} must be an array within its item limit`, { where });
  }
  return value;
}

function assertCandidate(row, code) {
  if (!isPlainObject(row)) fail(code, 'a candidate must be an object', { where: 'candidates[]' });
  for (const field of CANDIDATE_REQUIRED) {
    if (!Object.hasOwn(row, field)) {
      fail(code, 'a candidate is missing a declared field', { where: 'candidates[]', field });
    }
  }
  if (typeof row.candidate_id !== 'string' || row.candidate_id.length === 0) {
    fail(code, 'candidate_id must be a non-empty string', { where: 'candidates[].candidate_id' });
  }
  if (!Array.isArray(row.cues)) {
    fail(code, 'cues must be an array', { where: 'candidates[].cues' });
  }
  return row;
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
    return fail(CONFIRMATION_SHEET_ERROR_CODES.REQUEST_INVALID,
      'confirmation material is not canonically serialisable',
      { domain, contract_code: error?.code ?? null });
  }
}

const sheetDomain = (name) => `${OBSERVATION_CONFIRMATION_SHEET_SCHEMA_VERSION}.${name}`;

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// ---------------------------------------------------------------- markdown rendering

/** Keeps one table cell inside one table cell whatever the file was called. */
function cell(text) {
  return String(text).split('|').join('\\|').split('`').join('\u02cb');
}

const maturityLabel = (maturity) => (maturity === null || maturity === undefined
  ? '미표기' : MATURITY_LABEL_KO[maturity] ?? maturity);

function cueLabel(cues) {
  if (cues.length === 0) return '-';
  return cues
    .slice(0, 4)
    .map((cue) => `${CUE_LABEL_KO[cue.kind] ?? cue.kind}: ${cell(cue.matched)}`)
    .join('; ');
}

function renderMarkdown(rows, counts) {
  const lines = [];
  lines.push('# 관측 후보 확인표 (artifact observation candidates)');
  lines.push('');
  lines.push(`- 후보 ${counts.candidates}건 = 자동확정 ${counts.auto_confirmed}건 + 확인 필요 ${counts.needs_owner_confirmation}건`);
  lines.push('- 자동확정은 업무폴더 `03_Out` 아래이고 그 업무가 산출물 종류 하나에만 대응할 때만 붙는다. 나머지는 사람이 판단한다.');
  lines.push('- 확인 방법: JSON 시트(`confirmation_sheet.json`)의 같은 줄 `decision`에 `confirm`(맞음) · `reject`(아님) · `reassign`(다른 종류; `artifact_type_id`도 함께)을 적는다.');
  lines.push('- 이 표는 후보일 뿐이며 확인 전에는 엔진 관측이 되지 않는다(설계 D37).');
  lines.push('');

  const stages = [...new Set(rows.map((row) => row.stage_code))].sort(compareCodePoints);
  for (const stageCode of stages) {
    const stageRows = rows.filter((row) => row.stage_code === stageCode);
    lines.push(`## ${stageCode} (${stageRows.length}건)`);
    lines.push('');
    lines.push('| 확인[ ] | 파일 | 산출물 종류(추정) | 단계 | 성숙도(추정) | 근거 단서 | 신뢰도 |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const row of stageRows) {
      lines.push([
        '',
        row.auto_confirmed ? '[x] 자동확정' : '[ ]',
        cell(row.file_ref),
        cell(row.artifact_type_id),
        cell(row.stage_code),
        maturityLabel(row.maturity),
        cueLabel(row.cues),
        CONFIDENCE_LABEL_KO[row.confidence] ?? row.confidence,
        '',
      ].join(' | ').trim());
    }
    lines.push('');
  }
  if (stages.length === 0) {
    lines.push('후보 없음.');
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- sheet

/**
 * Renders one candidate set as the Owner-facing table plus the machine sheet that comes back.
 *
 * @param request `{ candidates, known_at? }`
 * @returns deeply frozen `{ markdown, sheet }`
 */
export function buildObservationConfirmationSheet(request) {
  const code = CONFIRMATION_SHEET_ERROR_CODES.REQUEST_INVALID;
  if (!isPlainObject(request)) fail(code, 'request must be an object', { where: 'request' });
  const candidates = assertArray(request.candidates, 'request.candidates',
    CONFIRMATION_SHEET_ERROR_CODES.CANDIDATE_INVALID, MAX.candidates);
  const knownAt = Object.hasOwn(request, 'known_at') ? request.known_at : null;
  if (knownAt !== null && (typeof knownAt !== 'string' || knownAt.length === 0)) {
    fail(code, 'request.known_at must be a non-empty string when given', { where: 'request.known_at' });
  }

  const rows = candidates.map((candidate) => {
    assertCandidate(candidate, CONFIRMATION_SHEET_ERROR_CODES.CANDIDATE_INVALID);
    return {
      candidate_id: candidate.candidate_id,
      file_ref: candidate.file_ref,
      artifact_type_id: candidate.artifact_type_id,
      stage_code: candidate.stage_code,
      maturity: candidate.maturity ?? null,
      confidence: candidate.confidence,
      cues: candidate.cues.map((cue) => ({ kind: cue.kind, matched: cue.matched })),
      auto_confirmed: candidate.auto_confirmed === true,
      needs_owner_confirmation: candidate.needs_owner_confirmation === true,
      decision: null,
    };
  });
  rows.sort((left, right) => compareCodePoints(left.stage_code, right.stage_code)
    || compareCodePoints(left.artifact_type_id, right.artifact_type_id)
    || compareCodePoints(left.file_ref, right.file_ref));

  const counts = {
    candidates: rows.length,
    auto_confirmed: rows.filter((row) => row.auto_confirmed).length,
    needs_owner_confirmation: rows.filter((row) => row.needs_owner_confirmation).length,
  };

  const sheet = {
    schema_version: OBSERVATION_CONFIRMATION_SHEET_SCHEMA_VERSION,
    ...(knownAt === null ? {} : { known_at: knownAt }),
    counts,
    rows,
    rows_digest: canonicalDigest(sheetDomain('rows'), rows),
  };

  return deepFreeze({ markdown: renderMarkdown(rows, counts), sheet });
}

// ---------------------------------------------------------------- the return path

/**
 * Applies the Owner's decisions to a candidate set.
 *
 * @param candidates the candidate rows the sheet was built from
 * @param decisions `[{ candidate_id, decision, artifact_type_id?, maturity?, note? }]`
 * @returns deeply frozen `{ confirmed, pending, rejected, receipt }`
 */
export function applyConfirmationSheet(candidates, decisions = []) {
  const candidateCode = CONFIRMATION_SHEET_ERROR_CODES.CANDIDATE_INVALID;
  const decisionCode = CONFIRMATION_SHEET_ERROR_CODES.DECISION_INVALID;
  const rows = assertArray(candidates, 'candidates', candidateCode, MAX.candidates);
  const decisionRows = assertArray(decisions, 'decisions', decisionCode, MAX.decisions);

  const byId = new Map();
  for (const row of rows) {
    assertCandidate(row, candidateCode);
    if (byId.has(row.candidate_id)) {
      fail(candidateCode, 'candidates name one candidate id twice', { where: 'candidates[].candidate_id' });
    }
    byId.set(row.candidate_id, row);
  }

  const decisionById = new Map();
  for (const decision of decisionRows) {
    if (!isPlainObject(decision)) fail(decisionCode, 'a decision must be an object', { where: 'decisions[]' });
    for (const key of Object.keys(decision)) {
      if (!['candidate_id', 'decision', 'artifact_type_id', 'maturity', 'note'].includes(key)) {
        fail(decisionCode, 'a decision carries an undeclared field', { where: 'decisions[]' });
      }
    }
    const id = decision.candidate_id;
    if (typeof id !== 'string' || !byId.has(id)) {
      fail(decisionCode, 'a decision names a candidate this set does not carry',
        { where: 'decisions[].candidate_id' });
    }
    if (decisionById.has(id)) {
      fail(decisionCode, 'one candidate carries two decisions', { where: 'decisions[].candidate_id' });
    }
    if (!DECISIONS.includes(decision.decision)) {
      fail(decisionCode, 'decision must be confirm, reject, or reassign', { where: 'decisions[].decision' });
    }
    if (decision.decision === 'reassign') {
      if (typeof decision.artifact_type_id !== 'string' || !isKnownArtifactType(decision.artifact_type_id)) {
        // A reassignment to a token no vocabulary owns would produce an observation the engine
        // can never bind, so it is refused here rather than discovered three seams later.
        fail(decisionCode, 'a reassignment must name a known artifact type',
          { where: 'decisions[].artifact_type_id' });
      }
    } else if (Object.hasOwn(decision, 'artifact_type_id')) {
      fail(decisionCode, 'only a reassignment may name an artifact type',
        { where: 'decisions[].artifact_type_id' });
    }
    if (Object.hasOwn(decision, 'maturity') && decision.maturity !== null
        && !['preliminary', 'updated', 'baseline', 'final'].includes(decision.maturity)) {
      fail(decisionCode, 'maturity must be one of the declared maturities or null',
        { where: 'decisions[].maturity' });
    }
    if (Object.hasOwn(decision, 'note')
        && (typeof decision.note !== 'string' || decision.note.length > MAX.note)) {
      fail(decisionCode, 'a note must be bounded text', { where: 'decisions[].note' });
    }
    decisionById.set(id, decision);
  }

  const confirmed = [];
  const pending = [];
  const rejected = [];
  for (const row of rows) {
    const decision = decisionById.get(row.candidate_id) ?? null;
    if (decision === null) {
      if (row.auto_confirmed === true) {
        confirmed.push({
          candidate_id: row.candidate_id,
          file_ref: row.file_ref,
          stage_code: row.stage_code,
          artifact_type_id: row.artifact_type_id,
          maturity: row.maturity ?? null,
          confidence: row.confidence,
          confirmation: CONFIRMATION_SOURCES.AUTO_OUT_FOLDER,
          note: null,
        });
      } else {
        pending.push({ candidate_id: row.candidate_id, file_ref: row.file_ref });
      }
      continue;
    }
    if (decision.decision === 'reject') {
      rejected.push({
        candidate_id: row.candidate_id,
        file_ref: row.file_ref,
        note: Object.hasOwn(decision, 'note') ? decision.note : null,
      });
      continue;
    }
    const reassigned = decision.decision === 'reassign';
    confirmed.push({
      candidate_id: row.candidate_id,
      file_ref: row.file_ref,
      stage_code: row.stage_code,
      artifact_type_id: reassigned ? decision.artifact_type_id : row.artifact_type_id,
      maturity: Object.hasOwn(decision, 'maturity') ? decision.maturity : (row.maturity ?? null),
      confidence: row.confidence,
      confirmation: reassigned
        ? CONFIRMATION_SOURCES.OWNER_REASSIGNED
        : CONFIRMATION_SOURCES.OWNER_CONFIRMED,
      note: Object.hasOwn(decision, 'note') ? decision.note : null,
    });
  }

  const order = (left, right) => compareCodePoints(left.candidate_id, right.candidate_id);
  confirmed.sort(order);
  pending.sort(order);
  rejected.sort(order);

  const receipt = {
    schema_version: OBSERVATION_CONFIRMATION_SHEET_SCHEMA_VERSION,
    input_digests: {
      candidates: canonicalDigest(sheetDomain('candidates'), rows),
      decisions: canonicalDigest(sheetDomain('decisions'), decisionRows),
    },
    counts: {
      candidates: rows.length,
      decisions: decisionRows.length,
      confirmed: confirmed.length,
      confirmed_auto: confirmed.filter((row) => row.confirmation === CONFIRMATION_SOURCES.AUTO_OUT_FOLDER).length,
      confirmed_owner: confirmed.filter((row) => row.confirmation !== CONFIRMATION_SOURCES.AUTO_OUT_FOLDER).length,
      pending: pending.length,
      rejected: rejected.length,
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

  return deepFreeze({ confirmed, pending, rejected, receipt });
}
