// The broom, not the judge: what a walk noticed about the folders themselves.
//
// The candidate supplier answers "which artifact does this file look like". Walking a real
// project turns up a second, entirely different kind of finding — two issues of one drawing left
// side by side in `03_Out`, a submitted zip nobody unpacked, an interim copy that was never
// replaced, two task folders for one artifact, an output folder that was never created. None of
// that is an observation and none of it is an engine judgement. It is housekeeping: things a
// person can tidy in a minute, which nobody sees because nobody looks at 8,000 files.
//
// So it lives here, in its own module, with its own output, and it is kept strictly out of the
// observation path. Three boundaries hold that line.
//
// 1. **Never an observation.** Nothing here is fed to the generator or the engine. An item is a
//    note about a folder, and the worst thing an item can be is ignored.
// 2. **Never a judgement.** This module does not say a stage is incomplete, a document is late,
//    or a requirement is unmet. `out_folder_empty` says the folder holds no output *file*, not
//    that the artifact is missing — the artifact may be in a mailbox, on a share, or not due yet.
// 3. **Never reads content.** Only what the walk already recorded: paths, names, sizes, digests,
//    modification times, and the candidate rows built from them. No file is opened.
//
// The Owner's standing instruction is that this check stays after workers start filing properly:
// it is the guard that shows they still are.
//
// Pure: no file, clock, random source, environment value, or network.
import { createHash } from 'node:crypto';

import { canonicalise, compareCodePoints } from '../kernel/canonical.mjs';
import { INTERIM_WORDINGS, OUT_FOLDER } from './artifact_observation_candidates.mjs';

export const OBSERVATION_HOUSEKEEPING_SCHEMA_VERSION = 'soulforge.observation_housekeeping.v0';

export const HOUSEKEEPING_ERROR_CODES = Object.freeze({
  REQUEST_INVALID: 'OBSERVATION_HOUSEKEEPING_REQUEST_INVALID',
});

export class ObservationHousekeepingError extends Error {
  constructor(code, message, detail = {}) {
    super(`${code}: ${message}`);
    this.name = 'ObservationHousekeepingError';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, message, detail = {}) => {
  throw new ObservationHousekeepingError(code, message, detail);
};

// The six things a walk can notice about a folder. Ordered as a person would want to act on
// them: what is duplicated, what looks wrong, what is still packaged, what is still a draft,
// what is structurally doubled, what is empty.
export const HOUSEKEEPING_KINDS = Object.freeze([
  'duplicate_output',
  'wrong_material',
  'transport_package',
  'draft_wording',
  'duplicate_task_folder',
  'out_folder_empty',
]);

const KIND_LABEL_KO = Object.freeze({
  duplicate_output: '같은 산출물 여러 개',
  wrong_material: '엉뚱한 자료 가능성',
  transport_package: '전송용 압축본',
  draft_wording: '중간본 표현',
  duplicate_task_folder: '업무폴더 중복',
  out_folder_empty: '03_Out 파일 없음',
});

// Archive containers and the split-part naming that comes with them. A `03_Out` is where a
// finished artifact lives; a container is transport, and whatever is inside it has not been filed.
const ARCHIVE_EXTENSIONS = new Set(['zip', '7z', 'rar', 'alz', 'egg', 'tar', 'gz']);
const SPLIT_PART_EXPRESSIONS = Object.freeze([
  /(?:^|[^a-z0-9])\d{1,3}\s*of\s*\d{1,3}(?:[^a-z0-9]|$)/u,
  /(?:^|[^a-z0-9])part[._\s-]?\d{1,3}(?:[^a-z0-9]|$)/u,
  /\.(?:z\d{2}|\d{3})$/u,
]);

// Strongest first, matching the observation builder's own order, so the file this report calls
// "chosen" is the file that builder would carry.
const MATURITY_RANK = new Map([['final', 4], ['baseline', 3], ['updated', 2], ['preliminary', 1]]);

const MAX = Object.freeze({ inventory: 200000, candidates: 200000, items: 20000, detail: 400 });

// ---------------------------------------------------------------- helpers

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function assertArray(value, where, limit) {
  if (!Array.isArray(value) || value.length > limit) {
    fail(HOUSEKEEPING_ERROR_CODES.REQUEST_INVALID, `${where} must be an array within its item limit`, { where });
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
    return fail(HOUSEKEEPING_ERROR_CODES.REQUEST_INVALID,
      'housekeeping material is not canonically serialisable',
      { domain, contract_code: error?.code ?? null });
  }
}

const housekeepingDomain = (name) => `${OBSERVATION_HOUSEKEEPING_SCHEMA_VERSION}.${name}`;

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const fold = (value) => value.normalize('NFC').toLowerCase();
const baseName = (fileRef) => fileRef.slice(fileRef.lastIndexOf('/') + 1);
const clamp = (text) => (text.length <= MAX.detail ? text : `${text.slice(0, MAX.detail - 1)}…`);

/**
 * The (gate, task folder) a file sits in, and whether it sits in that folder's output folder.
 *
 * A file outside the `gate/task/03_Out/...` shape has no task folder for this report's purposes:
 * housekeeping is about the folders the folder-tree contract defines, not about loose material.
 */
function locate(fileRef) {
  const segments = fileRef.split('/');
  if (segments.length < 3) return null;
  if (!/^\d{1,6}_/u.test(segments[0]) || !/^\d{1,6}_/u.test(segments[1])) return null;
  return {
    gate: segments[0],
    task_folder: segments[1],
    in_out_folder: segments[2] === OUT_FOLDER,
  };
}

const looksLikeTransport = (name, ext) => ARCHIVE_EXTENSIONS.has(fold(ext ?? ''))
  || SPLIT_PART_EXPRESSIONS.some((expression) => expression.test(fold(name)));

const looksLikeInterim = (name) => INTERIM_WORDINGS.some((word) => fold(name).includes(word));

// ---------------------------------------------------------------- the seam

/**
 * Lists what a walk noticed about the folders, separately from what it decided about the files.
 *
 * @param request `{ inventory, candidates, unmatched?, ambiguous?, known_at }`
 * @returns deeply frozen `{ schema_version, items, counts, receipt }`
 */
export function buildHousekeepingReport(request) {
  if (!isPlainObject(request)) {
    fail(HOUSEKEEPING_ERROR_CODES.REQUEST_INVALID, 'request must be an object', { where: 'request' });
  }
  for (const key of Object.keys(request)) {
    if (!['inventory', 'candidates', 'unmatched', 'ambiguous', 'known_at'].includes(key)) {
      fail(HOUSEKEEPING_ERROR_CODES.REQUEST_INVALID, 'request carries an undeclared field', { where: 'request' });
    }
  }
  const inventory = assertArray(request.inventory, 'request.inventory', MAX.inventory);
  const candidates = assertArray(request.candidates, 'request.candidates', MAX.candidates);
  const unmatched = Object.hasOwn(request, 'unmatched')
    ? assertArray(request.unmatched, 'request.unmatched', MAX.inventory) : [];
  const ambiguous = Object.hasOwn(request, 'ambiguous')
    ? assertArray(request.ambiguous, 'request.ambiguous', MAX.inventory) : [];
  const knownAt = typeof request.known_at === 'string' && request.known_at.length > 0
    ? request.known_at : null;
  if (knownAt === null) {
    fail(HOUSEKEEPING_ERROR_CODES.REQUEST_INVALID, 'request.known_at must be a non-empty string',
      { where: 'request.known_at' });
  }

  const inventoryByRef = new Map();
  for (const row of inventory) {
    if (!isPlainObject(row) || typeof row.file_ref !== 'string') {
      fail(HOUSEKEEPING_ERROR_CODES.REQUEST_INVALID, 'an inventory row must name a file_ref',
        { where: 'request.inventory[]' });
    }
    inventoryByRef.set(row.file_ref, row);
  }
  const candidateByRef = new Map();
  for (const row of candidates) {
    if (!isPlainObject(row) || typeof row.file_ref !== 'string') {
      fail(HOUSEKEEPING_ERROR_CODES.REQUEST_INVALID, 'a candidate row must name a file_ref',
        { where: 'request.candidates[]' });
    }
    candidateByRef.set(row.file_ref, row);
  }

  const items = [];
  const push = (gate, taskFolder, artifactTypeId, kind, detail, filesCount) => {
    if (items.length >= MAX.items) return;
    items.push({
      gate,
      task_folder: taskFolder,
      artifact_type_id: artifactTypeId,
      kind,
      detail: clamp(detail),
      files_count: filesCount,
    });
  };

  // ---- what each task folder holds, and where
  const folders = new Map();
  const folderOf = (gate, taskFolder) => {
    const key = `${gate}/${taskFolder}`;
    let folder = folders.get(key);
    if (folder === undefined) {
      folder = {
        gate, task_folder: taskFolder, out_files: [], other_files: 0, artifact_type_ids: new Set(),
      };
      folders.set(key, folder);
    }
    return folder;
  };
  for (const row of inventory) {
    const where = locate(row.file_ref);
    if (where === null) continue;
    const folder = folderOf(where.gate, where.task_folder);
    if (where.in_out_folder) folder.out_files.push(row.file_ref);
    else folder.other_files += 1;
    const candidate = candidateByRef.get(row.file_ref);
    // What the folder is *for*, which is not the same as what happens to be lying in it. Only a
    // candidate that resolved through the task folder number itself counts: an HRS filed in the
    // work-log folder makes that folder hold an HRS, it does not make it the HRS folder, and
    // treating it as one would report every internal folder as a duplicate of a real one.
    if (candidate !== undefined && typeof candidate.artifact_type_id === 'string'
        && Array.isArray(candidate.cues)
        && candidate.cues.some((cue) => cue.kind === 'task_folder')) {
      folder.artifact_type_ids.add(candidate.artifact_type_id);
    }
  }

  const unmatchedRefs = new Set(unmatched.map((row) => row?.file_ref).filter((ref) => typeof ref === 'string'));
  const ambiguousRefs = new Set(ambiguous.map((row) => row?.file_ref).filter((ref) => typeof ref === 'string'));

  for (const key of [...folders.keys()].sort(compareCodePoints)) {
    const folder = folders.get(key);
    const { gate, task_folder: taskFolder } = folder;
    // The artifact this folder is for. A folder whose files landed on two artifact types has no
    // single answer, and this report does not pick one.
    const folderArtifact = folder.artifact_type_ids.size === 1
      ? [...folder.artifact_type_ids][0] : null;
    const outFiles = [...folder.out_files].sort(compareCodePoints);

    // ---- (f) the output folder holds nothing, although the task folder is in use
    //
    // Only for a folder this walk can name an artifact for. The fixed internal folders (inbox,
    // work log, technical data exchange) and the management gate have no `03_Out` by contract,
    // and reporting every one of them would bury the folders that do.
    if (outFiles.length === 0) {
      if (folderArtifact !== null) {
        push(gate, taskFolder, folderArtifact, 'out_folder_empty',
          `업무폴더에 파일 ${folder.other_files}개가 있으나 03_Out 아래에는 없음 (산출물이 다른 곳에 있을 수 있어 결손 판정이 아님)`,
          folder.other_files);
      }
      continue;
    }

    // ---- (a) more than one file in 03_Out for the same artifact
    //
    // Counted over files that name the artifact themselves. A file that only inherited the
    // reading from the folder is not a second issue of the document; it is material in the wrong
    // place, which is the next item's business. Keeping the two apart stops one misfiled drawing
    // from being reported as a revision of the minutes.
    const byArtifact = new Map();
    for (const fileRef of outFiles) {
      const candidate = candidateByRef.get(fileRef);
      if (candidate === undefined || typeof candidate.artifact_type_id !== 'string') continue;
      if (candidate.own_name_cue === false) continue;
      const list = byArtifact.get(candidate.artifact_type_id) ?? [];
      list.push({ file_ref: fileRef, maturity: candidate.maturity ?? null });
      byArtifact.set(candidate.artifact_type_id, list);
    }
    for (const artifactTypeId of [...byArtifact.keys()].sort(compareCodePoints)) {
      const rows = byArtifact.get(artifactTypeId);
      if (rows.length < 2) continue;
      const rank = (row) => MATURITY_RANK.get(row.maturity) ?? 0;
      const ordered = [...rows].sort((left, right) => rank(right) - rank(left)
        || compareCodePoints(right.file_ref, left.file_ref));
      const [chosen, ...rest] = ordered;
      push(gate, taskFolder, artifactTypeId, 'duplicate_output',
        `03_Out에 같은 산출물 파일 ${rows.length}개. 성숙도 기준 우선: ${baseName(chosen.file_ref)}`
        + ` / 뒤로 밀림: ${rest.map((row) => baseName(row.file_ref)).join(', ')}`,
        rows.length);
    }

    // ---- (b) material in 03_Out that says nothing about the folder's artifact
    //
    // Only asked of a folder that is *for* something. In a folder with no artifact of its own —
    // an inbox, an activity node, a task number the spec does not carry — an unrecognised file is
    // not misfiled, it is simply unclassified, and the candidate report already says so.
    const wrongMaterial = folderArtifact === null ? [] : outFiles.filter((fileRef) => {
      if (unmatchedRefs.has(fileRef) || ambiguousRefs.has(fileRef)) return true;
      const candidate = candidateByRef.get(fileRef);
      return candidate !== undefined && candidate.own_name_cue === false;
    });
    if (wrongMaterial.length > 0) {
      push(gate, taskFolder, folderArtifact, 'wrong_material',
        `03_Out 파일 ${wrongMaterial.length}개가 이 업무의 산출물 이름을 갖고 있지 않음: `
        + `${wrongMaterial.map((fileRef) => baseName(fileRef)).join(', ')}`,
        wrongMaterial.length);
    }

    // ---- (c) transport packaging left in 03_Out
    const packaged = outFiles.filter((fileRef) => {
      const row = inventoryByRef.get(fileRef);
      return row !== undefined && looksLikeTransport(row.name ?? baseName(fileRef), row.ext);
    });
    if (packaged.length > 0) {
      push(gate, taskFolder, folderArtifact, 'transport_package',
        `03_Out에 전송용 압축·분할 파일 ${packaged.length}개: `
        + `${packaged.map((fileRef) => baseName(fileRef)).join(', ')}`,
        packaged.length);
    }

    // ---- (d) interim wording left in 03_Out
    const interim = outFiles.filter((fileRef) => looksLikeInterim(baseName(fileRef)));
    if (interim.length > 0) {
      push(gate, taskFolder, folderArtifact, 'draft_wording',
        `03_Out에 중간본·검토본 표현이 있는 파일 ${interim.length}개: `
        + `${interim.map((fileRef) => baseName(fileRef)).join(', ')}`,
        interim.length);
    }
  }

  // ---- (e) two task folders in one gate carrying one artifact
  //
  // Read from the folder numbers, for the same reason as above: two folders the rules point at
  // one artifact is a folder-tree duplication worth tidying, whereas one copy of a document
  // sitting in an inbox is not.
  const foldersByGateArtifact = new Map();
  for (const candidate of candidates) {
    const where = locate(candidate.file_ref);
    if (where === null || typeof candidate.artifact_type_id !== 'string') continue;
    if (!Array.isArray(candidate.cues) || !candidate.cues.some((cue) => cue.kind === 'task_folder')) {
      continue;
    }
    const key = `${where.gate}|${candidate.artifact_type_id}`;
    const set = foldersByGateArtifact.get(key) ?? new Set();
    set.add(where.task_folder);
    foldersByGateArtifact.set(key, set);
  }
  for (const key of [...foldersByGateArtifact.keys()].sort(compareCodePoints)) {
    const taskFolders = [...foldersByGateArtifact.get(key)].sort(compareCodePoints);
    if (taskFolders.length < 2) continue;
    const [gate, artifactTypeId] = key.split('|');
    push(gate, taskFolders[0], artifactTypeId, 'duplicate_task_folder',
      `같은 단계에서 업무폴더 ${taskFolders.length}개가 한 산출물을 담고 있음: ${taskFolders.join(', ')}`,
      taskFolders.length);
  }

  const kindRank = new Map(HOUSEKEEPING_KINDS.map((kind, index) => [kind, index]));
  items.sort((left, right) => compareCodePoints(left.gate, right.gate)
    || compareCodePoints(left.task_folder, right.task_folder)
    || (kindRank.get(left.kind) ?? 99) - (kindRank.get(right.kind) ?? 99)
    || compareCodePoints(left.detail, right.detail));

  const byKind = Object.fromEntries(HOUSEKEEPING_KINDS.map((kind) => [kind, 0]));
  const byGate = {};
  for (const item of items) {
    byKind[item.kind] += 1;
    byGate[item.gate] = (byGate[item.gate] ?? 0) + 1;
  }

  const counts = {
    items: items.length,
    task_folders_seen: folders.size,
    by_kind: byKind,
    by_gate: byGate,
  };

  const receipt = {
    schema_version: OBSERVATION_HOUSEKEEPING_SCHEMA_VERSION,
    known_at: knownAt,
    input_digests: {
      inventory: canonicalDigest(housekeepingDomain('inventory'), inventory),
      candidates: canonicalDigest(housekeepingDomain('candidates'), candidates),
    },
    output_digests: {
      items: canonicalDigest(housekeepingDomain('items'), items),
    },
    counts,
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
    schema_version: OBSERVATION_HOUSEKEEPING_SCHEMA_VERSION, items, counts, receipt,
  });
}

// ---------------------------------------------------------------- markdown rendering

const cell = (text) => String(text).split('|').join('\\|').split('`').join('\u02cb');

/**
 * Renders the report as the Korean table a person actually reads.
 *
 * @param report the output of `buildHousekeepingReport`
 * @returns markdown text
 */
export function renderHousekeepingMarkdown(report) {
  const { items, counts } = report;
  const lines = [];
  lines.push('# 폴더 청소 알림 (observation housekeeping)');
  lines.push('');
  lines.push(`- 정리 항목 ${counts.items}건 · 살펴본 업무폴더 ${counts.task_folders_seen}개`);
  lines.push('- 이것은 **판단이 아니다**. 산출물이 있다/없다, 늦었다, 부족하다를 말하지 않는다. 폴더를 정리하면 사라지는 항목만 모았다.');
  lines.push('- `03_Out 파일 없음`은 결손 판정이 아니다. 산출물이 메일·공유폴더에 있거나 아직 만들 때가 아닐 수 있다.');
  lines.push('- 파일 내용을 열어보지 않는다. 경로·이름·크기·수정시각·해시만 본다.');
  lines.push('');
  const kinds = HOUSEKEEPING_KINDS.filter((kind) => (counts.by_kind[kind] ?? 0) > 0);
  if (kinds.length > 0) {
    lines.push(`- 종류별: ${kinds.map((kind) => `${KIND_LABEL_KO[kind]} ${counts.by_kind[kind]}건`).join(' · ')}`);
    lines.push('');
  }

  if (items.length === 0) {
    lines.push('정리할 항목 없음.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('| 단계 | 업무폴더 | 산출물 | 종류 | 내용 | 파일수 |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const item of items) {
    lines.push([
      '',
      cell(item.gate),
      cell(item.task_folder),
      item.artifact_type_id === null ? '-' : cell(item.artifact_type_id),
      KIND_LABEL_KO[item.kind] ?? item.kind,
      cell(item.detail),
      String(item.files_count),
      '',
    ].join(' | ').trim());
  }
  lines.push('');
  return lines.join('\n');
}
