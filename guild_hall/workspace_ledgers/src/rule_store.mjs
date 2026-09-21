// Rule store for per-project mail routing rules (`soulforge.project_mail_routing_rule.v0`).
// Owns discovery, reading, validation and versioned saving of the
// `020_MGMT/021_자동화설정_운영규칙/mail_routing_rule.{json,md}` pair the SE folder tree
// fixes per `docs/architecture/workspace/PROJECT_ONBOARDING_V0.md`.
//
// `saveRuleVersion` never overwrites: it archives the previous json+md pair to
// `history/mail_routing_rule.<old_version>.<json|md>` (create-only) before writing the
// new pair atomically (staging file + rename), bumps `rule_version` (vN -> vN+1), and
// carries the previous md's "Owner 확인 기록"/"Owner 확인이 필요한 것" sections forward
// plus the new note. `by` must be a human actor string -- machine actor ids (the
// `actor:...` convention used elsewhere in this codebase, e.g. `RECONCILE_ACTOR`) are
// refused.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { compileRule, CONFLICT_POLICY, normalizeYieldsTo, RULE_SCHEMA_VERSION, SENDER_POLICY } from './classifier.mjs';

export const RULE_REL_DIR = '020_MGMT/021_자동화설정_운영규칙';
export const RULE_JSON_NAME = 'mail_routing_rule.json';
export const RULE_MD_NAME = 'mail_routing_rule.md';
export const LINEAGE_SCHEMA = 'soulforge.canonical_byte_lineage.draft.v0';
// A quick save/reject loop should not be blocked by a crashed prior attempt for long;
// a lock this old is reclaimed rather than trusted.
export const RULE_SAVE_STALE_LOCK_MS = 15 * 60 * 1000;
const LOCK_FILE_NAME = 'rule_save.lock';
const MACHINE_ACTOR_PATTERN = /^actor:/iu;

export class RuleStoreError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'RuleStoreError';
    this.code = code;
    // S-8 (fresh-review-4): exposed as a field (not just folded into the message
    // string) so a caller wrapping a per-rule read (e.g. `refresh.mjs` excluding one
    // bad project's rule rather than aborting every project) can report the detail
    // structurally instead of parsing it back out of `error.message`.
    this.detail = detail ?? null;
  }
}
const fail = (code, detail) => { throw new RuleStoreError(code, detail); };

const sha256 = text => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const encode = value => `${JSON.stringify(value, null, 2)}\n`;

/** True when `by` is empty or looks like a machine actor id (the `actor:...` convention), never a person's own name. */
export function isMachineActor(by) {
  return typeof by !== 'string' || by.trim() === '' || MACHINE_ACTOR_PATTERN.test(by.trim());
}

function ruleJsonPath(workspacesRoot, folder) { return path.join(workspacesRoot, folder, RULE_REL_DIR, RULE_JSON_NAME); }
function ruleMdPath(workspacesRoot, folder) { return path.join(workspacesRoot, folder, RULE_REL_DIR, RULE_MD_NAME); }

/** Folders directly under `workspacesRoot` matching `<CODE>_...` that hold a 021 rule json. */
export function listProjects({ workspacesRoot }) {
  let entries;
  try { entries = readdirSync(workspacesRoot, { withFileTypes: true }); }
  catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const underscoreIndex = entry.name.indexOf('_');
    if (underscoreIndex <= 0) continue;
    const code = entry.name.slice(0, underscoreIndex);
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/u.test(code)) continue;
    const jsonPath = ruleJsonPath(workspacesRoot, entry.name);
    if (!existsSync(jsonPath)) continue;
    projects.push({ project_code: code, folder_name: entry.name, rule_json_path: jsonPath, rule_md_path: ruleMdPath(workspacesRoot, entry.name) });
  }
  return projects.sort((a, b) => a.project_code.localeCompare(b.project_code));
}

/** Reads one project's current rule pair. Throws `workspace_ledgers_rule_not_found` if none exists. */
export function readRule({ workspacesRoot, code }) {
  const project = listProjects({ workspacesRoot }).find(row => row.project_code === code);
  if (!project) fail('workspace_ledgers_rule_not_found', code);
  const jsonText = readFileSync(project.rule_json_path, 'utf8');
  const mdText = existsSync(project.rule_md_path) ? readFileSync(project.rule_md_path, 'utf8') : '';
  let json;
  try { json = JSON.parse(jsonText); } catch (error) { fail('workspace_ledgers_rule_json_unparseable', error.message); }
  // `yields_to` may still be `null` or a single object on disk (older saves, or the
  // pre-array schema); normalise to an array here so every caller of `readRule` sees
  // the current shape regardless of what is actually on disk.
  try { json = { ...json, yields_to: normalizeYieldsTo(json.yields_to) }; }
  catch (error) { fail('workspace_ledgers_rule_invalid', error.code ?? error.message); }
  return {
    project_code: code, folder_name: project.folder_name, json, md: mdText,
    json_path: project.rule_json_path, md_path: project.rule_md_path,
    sha256_json: sha256(jsonText), sha256_md: mdText ? sha256(mdText) : null,
  };
}

/**
 * Structural validation of a draft rule JSON: schema id, project_code/folder_name
 * agreement, `rule_version` shape, fixed policy strings, and every term (regex
 * length/complexity bound included, via `classifier.mjs`'s `compileRule`).
 */
export function validateRule(draft, { folderName = null } = {}) {
  const errors = [];
  if (!draft || typeof draft !== 'object') return { valid: false, errors: ['workspace_ledgers_rule_not_object'] };
  if (draft.schema_version !== RULE_SCHEMA_VERSION) errors.push('workspace_ledgers_rule_schema_mismatch');
  if (typeof draft.project_code !== 'string' || draft.project_code.trim() === '') errors.push('workspace_ledgers_rule_project_code_missing');
  if (folderName && typeof draft.folder_name === 'string' && draft.folder_name !== folderName) errors.push('workspace_ledgers_rule_folder_name_mismatch');
  if (folderName && typeof draft.project_code === 'string' && !folderName.startsWith(`${draft.project_code}_`)) {
    errors.push('workspace_ledgers_rule_code_not_folder_prefix');
  }
  if (typeof draft.rule_version !== 'string' || !/^v\d+$/u.test(draft.rule_version)) errors.push('workspace_ledgers_rule_version_format');
  if (draft.conflict_policy !== CONFLICT_POLICY) errors.push('workspace_ledgers_rule_conflict_policy_mismatch');
  if (draft.sender_policy !== SENDER_POLICY) errors.push('workspace_ledgers_rule_sender_policy_mismatch');
  try { compileRule(draft); } catch (error) { errors.push(error.code ?? 'workspace_ledgers_rule_compile_failed'); }
  return { valid: errors.length === 0, errors };
}

// -------------------------------------------------------------------------- lock
/** Same stale-reclaim shape as `context_engine/harness/estate_voice_card_reconcile.mjs`'s lock, scoped per rule folder. */
export function acquireRuleSaveLock(ruleDir, now) {
  mkdirSync(ruleDir, { recursive: true });
  const lockFile = path.join(ruleDir, LOCK_FILE_NAME);
  if (existsSync(lockFile)) {
    let existing;
    try { existing = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { existing = {}; }
    const startedAt = typeof existing?.started_at === 'string' ? Date.parse(existing.started_at) : NaN;
    // fresh-review-3 #12 (mirrors the same fix in `refresh.mjs`'s `acquireRefreshLock`):
    // a `started_at` in the future relative to `now` (clock skew, or corrupted lock
    // data) is stale immediately, not "age 0 and therefore fresh" -- clamping a
    // negative age up to 0 used to make a future-dated lock look brand new and
    // un-reclaimable for up to `RULE_SAVE_STALE_LOCK_MS` past whatever future time it
    // claimed to start at.
    const ageMs = Number.isFinite(startedAt) ? (Date.parse(now) - startedAt) : Number.POSITIVE_INFINITY;
    if (ageMs >= 0 && ageMs <= RULE_SAVE_STALE_LOCK_MS) return { held: true, age_ms: ageMs };
    try { rmSync(lockFile, { force: true }); } catch (error) { fail('workspace_ledgers_lock_unavailable', error?.code); }
    try { writeFileSync(lockFile, encode({ pid: process.pid, started_at: now, reclaimed_from: existing }), { flag: 'wx' }); }
    catch (error) { if (error?.code === 'EEXIST') return { held: true, age_ms: ageMs }; fail('workspace_ledgers_lock_unavailable', error?.code); }
    return { held: false, reclaimed: true, age_ms: ageMs };
  }
  try { writeFileSync(lockFile, encode({ pid: process.pid, started_at: now }), { flag: 'wx' }); }
  catch (error) { if (error?.code === 'EEXIST') return { held: true, age_ms: 0 }; fail('workspace_ledgers_lock_unavailable', error?.code); }
  return { held: false, reclaimed: false, age_ms: null };
}
export function releaseRuleSaveLock(ruleDir) {
  try { rmSync(path.join(ruleDir, LOCK_FILE_NAME), { force: true }); } catch { /* nothing to release */ }
}

// --------------------------------------------------------------------- rendering
// The exact heading text `renderRuleMarkdown` always emits for its fixed, machine-
// regenerated sections (everything except "Owner 확인 기록"/"Owner 확인이 필요한 것",
// which are Owner-editable and carried forward verbatim by `saveRuleVersion`).
//
// R-2 (fresh-review-4): only "확정 트리거"/"검토 힌트" render with a trailing
// parenthetical (`## 확정 트리거 (제목·본문·첨부명에 있으면 이 과제로 본다)`), so a
// `startsWith` match against their short stem is safe -- nothing else can legitimately
// begin with that exact stem. Every OTHER fixed heading renders with no parenthetical
// at all (`## 근거`, `## Owner 확인 기록`, ...), so `startsWith` against those short
// stems was wrong: an Owner-authored heading that merely happens to start with the
// same stem plus more words (e.g. an evidence-adjacent heading beginning with the
// same two characters as "## 근거") matched `startsWith('## 근거')` and was silently
// treated as the fixed 근거 section -- its body dropped on the very next save, while a
// heading that did NOT share a fixed stem's prefix correctly survived. Those five
// headings now require exact equality.
const FIXED_HEADING_PREFIXES_WITH_PARENTHETICAL = ['## 확정 트리거', '## 검토 힌트'];
const FIXED_HEADINGS_EXACT = [
  '## 사람·발신자 원칙', '## Owner 확인 기록', '## Owner 확인이 필요한 것', '## 처리 순서와 기록 자리', '## 근거',
];
const isFixedHeading = heading => FIXED_HEADINGS_EXACT.includes(heading)
  || FIXED_HEADING_PREFIXES_WITH_PARENTHETICAL.some(prefix => heading.startsWith(prefix));

/**
 * S7 (fresh-review-2) + N13 (fresh-review-3): splits a rule markdown body into its
 * `## ` sections, verbatim -- prose, tables, nested bullets, blank lines between
 * paragraphs, everything an Owner may have written there, not only lines that happen
 * to start with `- `. Fence-aware: a `## ` line inside a ``` or ~~~ fenced code block
 * (e.g. an Owner pasting a markdown snippet as an example into "Owner 확인이 필요한
 * 것") is not mistaken for a section boundary and does not truncate the section early.
 * Lines before the first `## ` heading (title/status lines, always regenerated by
 * `renderRuleMarkdown`) are dropped. Leading and trailing blank lines within each
 * section are trimmed; internal blank lines (paragraph/table separators) are kept.
 */
function parseSections(mdText) {
  const lines = String(mdText ?? '').split(/\r?\n/u);
  const sections = [];
  let current = null;
  let inFence = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(```|~~~)/u.test(trimmed)) inFence = !inFence;
    if (!inFence && /^##\s/u.test(trimmed)) {
      current = { heading: trimmed, lines: [] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  for (const section of sections) {
    while (section.lines.length > 0 && section.lines[0].trim() === '') section.lines.shift();
    while (section.lines.length > 0 && section.lines[section.lines.length - 1].trim() === '') section.lines.pop();
  }
  return sections;
}

function findSectionLines(sections, headingPrefix) {
  const found = sections.find(section => section.heading.startsWith(headingPrefix));
  return found ? found.lines : [];
}

/**
 * N13: any `## ` section that is not one of `renderRuleMarkdown`'s fixed, always-
 * regenerated headings -- e.g. an ad hoc section an Owner added by hand -- used to be
 * silently dropped on the very next save, since `extractSection` only ever looked for
 * the two known headings and the renderer only ever emitted the fixed set. Every such
 * section is now carried forward verbatim (heading and body, unmodified) so a save
 * never discards Owner-authored content it does not itself understand.
 */
function unknownSections(sections) { return sections.filter(section => !isFixedHeading(section.heading)); }

const MEASURED_UNKNOWN_LINE = '- 실측: 이번 저장에서 preview-rule을 실행하지 않아 측정값 없음 (UNKNOWN).';

/**
 * Renders the 근거 section's measured line from either shape `measured` may arrive
 * in: `previewRule`'s own return (`{matched_before, matched_after, moved_in,
 * moved_out, newly_held, samples}` -- the UI adapter passes this straight through) or
 * the older CLI convenience shape (`{subjects, exact, hint_only}`). `samples` (real
 * mail subjects) is never rendered under any shape. Any field absent from whichever
 * shape is present renders nothing for that field, never the literal `undefined`; a
 * `measured` object with no recognised field at all falls back to the same "not
 * measured" line as `measured` being absent entirely.
 */
function renderMeasuredLine(measured, now) {
  if (!measured || typeof measured !== 'object') return MEASURED_UNKNOWN_LINE;
  const dateSuffix = `(측정 ${now.slice(0, 10)})`;
  const isPreviewShape = ['matched_before', 'matched_after', 'moved_in', 'moved_out', 'newly_held']
    .some(field => measured[field] !== undefined);
  if (isPreviewShape) {
    const parts = [];
    if (measured.matched_after !== undefined) parts.push(`확정 ${measured.matched_after}건`);
    if (measured.moved_in !== undefined) parts.push(`새로 매칭 ${measured.moved_in}건`);
    if (measured.moved_out !== undefined) parts.push(`매칭 해제 ${measured.moved_out}건`);
    if (measured.newly_held !== undefined) parts.push(`새로 보류 ${measured.newly_held}건`);
    return parts.length ? `- 실측: ${parts.join(', ')} ${dateSuffix}.` : MEASURED_UNKNOWN_LINE;
  }
  const parts = [];
  if (measured.subjects !== undefined) parts.push(`메일 ${measured.subjects}건 중`);
  if (measured.exact !== undefined) parts.push(`이 과제 확정 ${measured.exact}건`);
  if (measured.hint_only !== undefined) parts.push(`힌트만 ${measured.hint_only}건`);
  return parts.length ? `- 실측: ${parts.join(', ')} ${dateSuffix}.` : MEASURED_UNKNOWN_LINE;
}

function renderRuleMarkdown({ json, decided, open, note, by, now, measured, carriedSections = [] }) {
  const list = (items, empty) => (items.length ? items.map(item => `- ${item}`).join('\n') : `- ${empty}`);
  // S7: `decided`/`open` are verbatim lines from the previous md (see `parseSections`
  // above) -- copied as-is, never re-wrapped as if every line were a plain bullet.
  const noteLine = `- ${note} (${by}, ${now.slice(0, 10)})`;
  const decidedBlock = decided.length ? `${decided.join('\n')}\n${noteLine}` : `- (이 과제에 대한 개별 확인 없음)\n${noteLine}`;
  const openBlock = open.length ? open.join('\n') : '- 없음';
  const measuredLine = renderMeasuredLine(measured, now);
  // N13: any section an Owner added that this renderer does not itself know how to
  // regenerate, carried forward verbatim right after the two Owner-editable sections
  // and before the machine-owned "처리 순서와 기록 자리" -- never silently dropped.
  const carriedBlock = carriedSections.flatMap(section => ['', section.heading, '', ...section.lines]);
  return [
    `# 메일 라우팅 규칙 — ${json.project_code}`,
    '',
    `- 상태: ${json.status ?? `초안 ${json.rule_version}`} (${now.slice(0, 10)} 갱신, ${by}). "Owner 확인 기록"은 확정된 것, "Owner 확인이 필요한 것"이 비면 이 줄을 "확정"으로 바꾼다.`,
    `- 적용 범위: \`${json.project_code}\` 전용 프로젝트 규칙. 자리: \`_workspaces/${json.folder_name}/${RULE_REL_DIR}/\`.`,
    '',
    '## 확정 트리거 (제목·본문·첨부명에 있으면 이 과제로 본다)',
    '',
    ...json.exact.map(term => `- \`${term.label}\``),
    ...(json.yields_to.length
      ? ['', ...json.yields_to.map(entry => `- 넘김: 같은 메일에 \`${entry.when.label}\`이 있으면 이 과제가 아니라 \`${entry.project_code}\`로 본다.`)]
      : []),
    '',
    '- 첨부나 본문에 명시 PJT No.가 있으면 PJT No.를 키워드보다 우선한다.',
    '- 두 과제의 확정 트리거가 한 메일에 같이 걸리면 자동 귀속하지 않고 보류한다(아침 질문으로).',
    '',
    '## 검토 힌트 (단독으로는 귀속하지 않는다. 후보로만 올린다)',
    '',
    list(json.hint.map(term => `\`${term.label}\``), '없음'),
    '',
    '## 사람·발신자 원칙',
    '',
    '- 연락처·조직·역할은 `020_MGMT/023_연락처_이해관계자/` 장부에 두고, 이 규칙은 그 장부를 참조만 한다. 발신자는 힌트로만 쓴다.',
    '',
    '## Owner 확인 기록',
    '',
    decidedBlock,
    '',
    '## Owner 확인이 필요한 것',
    '',
    openBlock,
    ...carriedBlock,
    '',
    '## 처리 순서와 기록 자리',
    '',
    '- 메일박스 수신 → 후보 판단 → 프로젝트 라우팅 → `020_MGMT/022_INBOX_원본수집/` 최초 투입 → 단계별 `*_INBOX_분류전` 이동.',
    '- 수신 이력은 `020_MGMT/027_수신이력_이동이력/메일_수신이력.csv`, 발송 이력은 같은 폴더의 `메일_발송이력.csv`에 누적 기록한다.',
    '- 이 파일에는 메일 본문·첨부·자격증명·host-local 절대경로를 넣지 않는다.',
    '',
    '## 근거',
    '',
    measuredLine,
    '',
  ].join('\n');
}

function atomicWrite(filePath, text) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const staging = `${filePath}.writing-${process.pid}-${Date.now()}`;
  writeFileSync(staging, text);
  renameSync(staging, filePath);
}

function archiveCreateOnly(sourcePath, destPath) {
  if (!existsSync(sourcePath)) return false;
  mkdirSync(path.dirname(destPath), { recursive: true });
  const bytes = readFileSync(sourcePath);
  try { writeFileSync(destPath, bytes, { flag: 'wx' }); }
  catch (error) {
    if (error?.code === 'EEXIST') fail('workspace_ledgers_rule_history_collision', destPath);
    throw error;
  }
  return true;
}

/**
 * N15: stages both twin files (json + md), then renames both into place. If the json
 * rename succeeds but the md rename then fails, json is rolled back to its just-
 * archived previous-version bytes (`historyJsonPath`) before the failure is reported
 * -- the pair must never be left at two different versions. `renameFn` is an
 * injectable seam (default the real `renameSync`) purely so a test can force the
 * second rename to fail deterministically; it is not part of this module's stable API.
 */
function commitTwinFiles({ jsonPath, jsonText, mdPath, mdText, historyJsonPath, renameFn }) {
  mkdirSync(path.dirname(jsonPath), { recursive: true });
  mkdirSync(path.dirname(mdPath), { recursive: true });
  const jsonStaging = `${jsonPath}.writing-${process.pid}-${Date.now()}`;
  const mdStaging = `${mdPath}.writing-${process.pid}-${Date.now()}`;
  writeFileSync(jsonStaging, jsonText);
  writeFileSync(mdStaging, mdText);
  try {
    renameFn(jsonStaging, jsonPath);
  } catch (error) {
    try { rmSync(jsonStaging, { force: true }); } catch { /* best effort cleanup */ }
    try { rmSync(mdStaging, { force: true }); } catch { /* best effort cleanup */ }
    fail('workspace_ledgers_rule_save_write_failed', error?.code ?? error?.message);
  }
  try {
    renameFn(mdStaging, mdPath);
  } catch (error) {
    try {
      const rollbackBytes = readFileSync(historyJsonPath);
      const rollbackStaging = `${jsonPath}.rollback-${process.pid}-${Date.now()}`;
      writeFileSync(rollbackStaging, rollbackBytes);
      renameSync(rollbackStaging, jsonPath);
    } catch (rollbackError) {
      fail('workspace_ledgers_rule_save_rollback_failed', rollbackError?.code ?? rollbackError?.message);
    }
    try { rmSync(mdStaging, { force: true }); } catch { /* best effort cleanup */ }
    fail('workspace_ledgers_rule_save_write_failed', error?.code ?? error?.message);
  }
}

/**
 * Saves a new version of one project's mail routing rule. Requires a prior version to
 * exist (this store versions an existing rule; it does not author the first one).
 * `draft` is the caller's proposed rule body (schema fields only -- `project_code`,
 * `folder_name`, `rule_version` are set/overwritten by this function). `measured`
 * (optional) is a `{ subjects, exact, hint_only }` preview-rule result folded into the
 * rendered md's 근거 section. `allowedActors` (N16, optional) further restricts `by`
 * to an explicit allowlist (e.g. a console pinning `by: 'owner'` to exactly `['owner']`)
 * on top of the always-applied machine-actor refusal; omitted (the default), any
 * non-machine actor string is accepted, as before.
 */
export function saveRuleVersion({ workspacesRoot, workmetaRoot, code, draft, by, note, now = new Date().toISOString(),
  measured = null, allowedActors = undefined, _renameTwinFn = renameSync }) {
  if (isMachineActor(by)) fail('workspace_ledgers_actor_not_human', by);
  if (Array.isArray(allowedActors) && !allowedActors.includes(by)) fail('workspace_ledgers_actor_not_allowed', by);
  if (typeof note !== 'string' || note.trim() === '') fail('workspace_ledgers_note_missing');
  let previous;
  try { previous = readRule({ workspacesRoot, code }); }
  catch (error) { if (error.code === 'workspace_ledgers_rule_not_found') fail('workspace_ledgers_rule_prior_version_missing', code); throw error; }

  const folder = previous.folder_name;
  const ruleDir = path.join(workspacesRoot, folder, RULE_REL_DIR);
  const lock = acquireRuleSaveLock(ruleDir, now);
  if (lock.held) fail('workspace_ledgers_lock_held');
  try {
    const previousVersionMatch = /^v(\d+)$/u.exec(previous.json.rule_version ?? '');
    if (!previousVersionMatch) fail('workspace_ledgers_rule_version_unparseable', previous.json.rule_version);
    const newVersion = `v${Number(previousVersionMatch[1]) + 1}`;
    // `saveRuleVersion` always writes the array form of `yields_to`, even when the
    // caller's draft still holds `null` or a single legacy object.
    let normalizedYieldsTo;
    try { normalizedYieldsTo = normalizeYieldsTo(draft.yields_to); }
    catch (error) { fail('workspace_ledgers_rule_invalid', error.code ?? error.message); }
    const nextDraft = { ...draft, project_code: code, folder_name: folder, rule_version: newVersion, yields_to: normalizedYieldsTo };
    const validation = validateRule(nextDraft, { folderName: folder });
    if (!validation.valid) fail('workspace_ledgers_rule_invalid', validation.errors.join(','));

    const historyDir = path.join(ruleDir, 'history');
    const historyJsonPath = path.join(historyDir, `mail_routing_rule.${previous.json.rule_version}.json`);
    const historyMdPath = path.join(historyDir, `mail_routing_rule.${previous.json.rule_version}.md`);
    archiveCreateOnly(previous.json_path, historyJsonPath);
    archiveCreateOnly(previous.md_path, historyMdPath);

    const previousSections = parseSections(previous.md);
    const decided = findSectionLines(previousSections, '## Owner 확인 기록');
    const open = findSectionLines(previousSections, '## Owner 확인이 필요한 것');
    const carriedSections = unknownSections(previousSections);
    const newMd = renderRuleMarkdown({ json: nextDraft, decided, open, note, by, now, measured, carriedSections });
    const newJsonText = `${JSON.stringify(nextDraft, null, 2)}\n`;

    commitTwinFiles({ jsonPath: previous.json_path, jsonText: newJsonText, mdPath: previous.md_path, mdText: newMd,
      historyJsonPath, renameFn: _renameTwinFn });

    const lineageDir = path.join(workmetaRoot, folder, 'lineage');
    const jsonLineage = {
      schema_version: LINEAGE_SCHEMA, project_code: code,
      object: `_workspaces/${folder}/${RULE_REL_DIR}/${RULE_JSON_NAME}`, folder_name: folder,
      sha256: sha256(newJsonText), bytes: Buffer.byteLength(newJsonText), rule_version: newVersion,
      previous_rule_version: previous.json.rule_version, previous_sha256: previous.sha256_json,
      written_at: now, written_by: by, note,
    };
    const mdLineage = {
      schema_version: LINEAGE_SCHEMA, project_code: code,
      object: `_workspaces/${folder}/${RULE_REL_DIR}/${RULE_MD_NAME}`, folder_name: folder,
      sha256: sha256(newMd), bytes: Buffer.byteLength(newMd), rule_version: newVersion,
      previous_rule_version: previous.json.rule_version, previous_sha256: previous.sha256_md,
      written_at: now, written_by: by, note, twin_of: RULE_JSON_NAME,
    };
    atomicWrite(path.join(lineageDir, 'mail_routing_rule.json.lineage.json'), encode(jsonLineage));
    atomicWrite(path.join(lineageDir, 'mail_routing_rule.lineage.json'), encode(mdLineage));

    return {
      project_code: code, folder_name: folder, previous_version: previous.json.rule_version, rule_version: newVersion,
      json_path: previous.json_path, md_path: previous.md_path,
      history_json_path: historyJsonPath, history_md_path: historyMdPath,
      sha256_json: jsonLineage.sha256, sha256_md: mdLineage.sha256,
    };
  } finally {
    releaseRuleSaveLock(ruleDir);
  }
}
