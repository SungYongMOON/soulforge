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

import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { isKnownArtifactType } from '../rules/artifact_vocabulary.mjs';
import { locateInTaskFolder } from './artifact_observation_candidates.mjs';

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
// A folder decision answers the question a person actually asks when a task folder holds ninety
// drawings: "is this folder's output what the folder says it is?" One tick then stands for every
// file in that folder's `03_Out`. It deliberately does not reach the working material elsewhere
// in the folder, because `01_Work` and `02_Input` are not claims about what was produced.
export const FOLDER_DECISIONS = Object.freeze(['confirm_folder', 'reject_folder']);
export const CONFIRMATION_SOURCES = Object.freeze({
  AUTO_OUT_FOLDER: 'auto_03_out',
  OWNER_CONFIRMED: 'owner_confirmed',
  OWNER_REASSIGNED: 'owner_reassigned',
  OWNER_FOLDER_CONFIRMED: 'owner_folder_confirmed',
  OWNER_FOLDER_REASSIGNED: 'owner_folder_reassigned',
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

const MAX = Object.freeze({ candidates: 200000, decisions: 200000, note: 512, inventory: 200000 });

/**
 * The task folders a person can decide as a whole, derived from the candidates themselves.
 *
 * A folder qualifies when its candidates resolved *through the task folder number* onto exactly
 * one artifact type. That is the same test the housekeeping report applies, and for the same
 * reason: a document lying in an inbox does not make the inbox that document's folder, and
 * offering a folder tick for it would let one click confirm material nobody filed there on
 * purpose.
 */
function taskFolderRows(candidates, inventory) {
  const folders = new Map();
  for (const candidate of candidates) {
    const where = locateInTaskFolder(candidate.file_ref);
    if (where === null) continue;
    let folder = folders.get(where.task_folder_ref);
    if (folder === undefined) {
      folder = {
        task_folder_ref: where.task_folder_ref,
        stage_code: candidate.stage_code,
        task_folder: where.task_folder,
        declared_types: new Set(),
        candidate_count: 0,
        out_candidate_count: 0,
      };
      folders.set(where.task_folder_ref, folder);
    }
    folder.candidate_count += 1;
    if (where.in_out_folder) folder.out_candidate_count += 1;
    if (Array.isArray(candidate.cues) && candidate.cues.some((cue) => cue.kind === 'task_folder')
        && typeof candidate.artifact_type_id === 'string') {
      folder.declared_types.add(candidate.artifact_type_id);
    }
  }

  const outFileCounts = new Map();
  for (const row of inventory) {
    const where = locateInTaskFolder(row?.file_ref ?? '');
    if (where === null || !where.in_out_folder) continue;
    outFileCounts.set(where.task_folder_ref, (outFileCounts.get(where.task_folder_ref) ?? 0) + 1);
  }

  return [...folders.values()]
    .filter((folder) => folder.declared_types.size === 1)
    .map((folder) => ({
      task_folder_ref: folder.task_folder_ref,
      stage_code: folder.stage_code,
      task_folder: folder.task_folder,
      artifact_type_id: [...folder.declared_types][0],
      candidate_count: folder.candidate_count,
      // The real file count when the caller handed over the walk it built the sheet from;
      // otherwise what the candidates alone can show, which is never more than the truth.
      out_file_count: outFileCounts.get(folder.task_folder_ref) ?? folder.out_candidate_count,
      decision: null,
    }))
    .sort((left, right) => compareCodePoints(left.task_folder_ref, right.task_folder_ref));
}

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

function renderMarkdown(rows, counts, folders) {
  const lines = [];
  lines.push('# 관측 후보 확인표 (artifact observation candidates)');
  lines.push('');
  lines.push(`- 후보 ${counts.candidates}건 = 자동확정 ${counts.auto_confirmed}건 + 확인 필요 ${counts.needs_owner_confirmation}건`);
  lines.push('- 자동확정 조건 세 가지를 모두 만족할 때만 붙는다: (1) 업무폴더 `03_Out` 아래, (2) 그 업무가 산출물 종류 하나에만 대응, (3) **파일 이름·제목이 그 산출물을 가리킴**. 나머지는 사람이 판단한다.');
  lines.push('- 근거 단서가 `업무폴더`뿐인 줄은 폴더만 보고 붙인 추정이다(예: 회의록 폴더 `03_Out`에 들어 있는 제출 도면). 그 줄부터 확인한다.');
  lines.push('- 확인 방법: JSON 시트(`confirmation_sheet.json`)의 같은 줄 `decision`에 `confirm`(맞음) · `reject`(아님) · `reassign`(다른 종류; `artifact_type_id`도 함께)을 적는다.');
  lines.push('- 이 표는 후보일 뿐이며 확인 전에는 엔진 관측이 되지 않는다(설계 D37).');
  lines.push('');

  // The folder table comes first because it is the cheap way through: one tick can settle a
  // folder that holds ninety files, and only what it does not cover needs the file table below.
  lines.push('## 1. 업무폴더 단위 확인 (먼저 볼 것)');
  lines.push('');
  lines.push('업무폴더가 산출물 하나에 대응하고 그 폴더에 후보가 있으면 여기서 한 줄로 확정할 수 있다.');
  lines.push('`confirm_folder`는 그 폴더 `03_Out` 아래의 후보 전부를 확정한다(`01_Work`·`02_Input` 등 나머지는 그대로 후보로 남는다).');
  lines.push('개별 파일 결정이 폴더 결정보다 우선한다. JSON 시트의 `folders[]`에 `decision`을 적는다.');
  lines.push('');
  if (folders.length === 0) {
    lines.push('폴더 단위로 확정할 수 있는 업무폴더 없음.');
    lines.push('');
  } else {
    lines.push('| 단계 | 업무폴더 | 산출물 | 후보 수 | 03_Out 파일 수 | 확인[ ] |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const folder of folders) {
      lines.push([
        '',
        cell(folder.stage_code),
        cell(folder.task_folder),
        cell(folder.artifact_type_id),
        String(folder.candidate_count),
        String(folder.out_file_count),
        '[ ]',
        '',
      ].join(' | ').trim());
    }
    lines.push('');
  }

  lines.push('## 2. 파일 단위 확인');
  lines.push('');

  const stages = [...new Set(rows.map((row) => row.stage_code))].sort(compareCodePoints);
  for (const stageCode of stages) {
    const stageRows = rows.filter((row) => row.stage_code === stageCode);
    lines.push(`### ${stageCode} (${stageRows.length}건)`);
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
  const inventory = Object.hasOwn(request, 'inventory')
    ? assertArray(request.inventory, 'request.inventory', code, MAX.inventory) : [];
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

  const folders = taskFolderRows(rows, inventory);
  const counts = {
    candidates: rows.length,
    auto_confirmed: rows.filter((row) => row.auto_confirmed).length,
    needs_owner_confirmation: rows.filter((row) => row.needs_owner_confirmation).length,
    decidable_task_folders: folders.length,
  };

  const sheet = {
    schema_version: OBSERVATION_CONFIRMATION_SHEET_SCHEMA_VERSION,
    ...(knownAt === null ? {} : { known_at: knownAt }),
    counts,
    folders,
    rows,
    rows_digest: canonicalDigest(sheetDomain('rows'), rows),
    folders_digest: canonicalDigest(sheetDomain('folders'), folders),
  };

  return deepFreeze({ markdown: renderMarkdown(rows, counts, folders), sheet });
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

  const foldersByRef = new Map(taskFolderRows(rows, []).map((folder) => [folder.task_folder_ref, folder]));
  const folderDecisionByRef = new Map();
  const fileDecisions = [];
  for (const decision of decisionRows) {
    if (!isPlainObject(decision)) fail(decisionCode, 'a decision must be an object', { where: 'decisions[]' });
    if (!Object.hasOwn(decision, 'task_folder_ref')) {
      fileDecisions.push(decision);
      continue;
    }
    for (const key of Object.keys(decision)) {
      if (!['task_folder_ref', 'decision', 'artifact_type_id', 'note'].includes(key)) {
        fail(decisionCode, 'a folder decision carries an undeclared field', { where: 'decisions[]' });
      }
    }
    const ref = decision.task_folder_ref;
    if (typeof ref !== 'string' || !foldersByRef.has(ref)) {
      fail(decisionCode, 'a folder decision names a task folder this sheet does not offer',
        { where: 'decisions[].task_folder_ref' });
    }
    if (folderDecisionByRef.has(ref)) {
      fail(decisionCode, 'one task folder carries two decisions', { where: 'decisions[].task_folder_ref' });
    }
    if (!FOLDER_DECISIONS.includes(decision.decision)) {
      fail(decisionCode, 'a folder decision must be confirm_folder or reject_folder',
        { where: 'decisions[].decision' });
    }
    if (Object.hasOwn(decision, 'artifact_type_id')) {
      if (decision.decision !== 'confirm_folder'
          || typeof decision.artifact_type_id !== 'string'
          || !isKnownArtifactType(decision.artifact_type_id)) {
        fail(decisionCode, 'only a folder confirmation may name a known artifact type',
          { where: 'decisions[].artifact_type_id' });
      }
    }
    if (Object.hasOwn(decision, 'note')
        && (typeof decision.note !== 'string' || decision.note.length > MAX.note)) {
      fail(decisionCode, 'a note must be bounded text', { where: 'decisions[].note' });
    }
    folderDecisionByRef.set(ref, decision);
  }

  const decisionById = new Map();
  for (const decision of fileDecisions) {
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
      // A folder decision reaches the folder's output files only, and only where the person did
      // not already say something about this particular file.
      const where = locateInTaskFolder(row.file_ref);
      const folderDecision = where === null ? undefined : folderDecisionByRef.get(where.task_folder_ref);
      if (folderDecision !== undefined && where.in_out_folder) {
        if (folderDecision.decision === 'reject_folder') {
          rejected.push({
            candidate_id: row.candidate_id,
            file_ref: row.file_ref,
            note: Object.hasOwn(folderDecision, 'note') ? folderDecision.note : null,
          });
          continue;
        }
        const reassignedFolder = Object.hasOwn(folderDecision, 'artifact_type_id');
        confirmed.push({
          candidate_id: row.candidate_id,
          file_ref: row.file_ref,
          stage_code: row.stage_code,
          artifact_type_id: reassignedFolder ? folderDecision.artifact_type_id : row.artifact_type_id,
          maturity: row.maturity ?? null,
          confidence: row.confidence,
          confirmation: reassignedFolder
            ? CONFIRMATION_SOURCES.OWNER_FOLDER_REASSIGNED
            : CONFIRMATION_SOURCES.OWNER_FOLDER_CONFIRMED,
          note: Object.hasOwn(folderDecision, 'note') ? folderDecision.note : null,
        });
        continue;
      }
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
      folder_decisions: folderDecisionByRef.size,
      confirmed: confirmed.length,
      confirmed_auto: confirmed.filter((row) => row.confirmation === CONFIRMATION_SOURCES.AUTO_OUT_FOLDER).length,
      confirmed_owner: confirmed.filter((row) => row.confirmation !== CONFIRMATION_SOURCES.AUTO_OUT_FOLDER).length,
      confirmed_by_folder: confirmed.filter((row) => row.confirmation === CONFIRMATION_SOURCES.OWNER_FOLDER_CONFIRMED
        || row.confirmation === CONFIRMATION_SOURCES.OWNER_FOLDER_REASSIGNED).length,
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
