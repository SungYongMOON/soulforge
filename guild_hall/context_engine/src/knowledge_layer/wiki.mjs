import { linkApprovedUnits } from './span_link.mjs';
import { checkWikiOutput } from './wiki_check.mjs';
import { loadWikiRules } from './wiki_rules.mjs';
import { digest, fail, freeze, hashText, keys, sha, snapshot, token } from './data.mjs';
import { boundedCall, validateBudget } from './model.mjs';
import { validateGraphRecord } from './graph.mjs';
export const withdrawalFingerprint = text => hashText(text.normalize('NFC').replace(/\p{White_Space}+/gu, ' ').trim());
/** The exact object `generate()` hands to `session.generate(modelInput)`. Exported
 * additively (K3 built it inline before) so a caller that must show the identical
 * prompt out-of-band -- a human pasting into a chat model, an agent -- builds it
 * from this one function instead of a second, possibly-drifting copy.
 */
export const buildWikiModelInput = ({ project_ref, units, human_correction_unit_ids, operating_rules }) =>
  ({ project_ref, role: 'wiki_draft', units, human_correction_unit_ids, operating_rules });
const unique = values => [...new Set(values)].sort();
const markdown = value => String(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
  .replace(/[\\\x60*_{}\[\]#!|]/gu, c => '\\' + c).replace(/[\r\n\t]/gu, ' ')
  .replace(/[\p{Cc}\p{Cf}]/gu, c => '[U+' + c.codePointAt(0).toString(16).toUpperCase() + ']');
function argumentsOf(input) {
  const v = snapshot(input);
  if ((!keys(v, ['request', 'withdrawals', 'expected_previous']) && !keys(v, ['request', 'withdrawals', 'expected_previous', 'human_correction_unit_ids'])) || !Array.isArray(v.withdrawals) || v.withdrawals.length > 1000
    || v.withdrawals.some(h => !sha(h)) || (v.expected_previous !== null && !sha(v.expected_previous))) fail('wiki_request_invalid');
  const bundle = linkApprovedUnits(v.request), corrections = v.human_correction_unit_ids ?? [];
  if (!Array.isArray(corrections) || corrections.length > 100 || new Set(corrections).size !== corrections.length
    || corrections.some(id => !bundle.units.some(u => u.unit_id === id))) fail('wiki_correction_refs_invalid');
  return { ...v, bundle, human_correction_unit_ids: [...corrections].sort() };
}
function buildContent({ bundle, checked, withdrawals, previous, generator, now, requestDigest, viewDigest, rulesHash, corrections }) {
  const rejected = checked.results.filter(r => !r.eligible_for_wiki || withdrawals.includes(withdrawalFingerprint(r.text)));
  const statements = checked.results.filter(r => !rejected.includes(r));
  const inventory = bundle.units.map(u => ({ unit_id: u.unit_id, source_revision_ref: u.source_revision_ref,
    locator: u.locator, text_sha256: u.text_sha256, statement_ids: statements.filter(s => s.unit_id === u.unit_id).map(s => s.statement_id) }));
  const gaps = checked.review.gaps.map(g => ({ ...g, origin: 'model_proposal', meaning_verified: false }));
  const exceptions = checked.results.filter(s => s.exception_required).map(s => ({ statement_id: s.statement_id,
    impact_kinds: s.impact_kinds, reason: s.exception_reasons.join('; '), exception_required: true,
    evidence_strength: s.evidence_strength, exception_reasons: s.exception_reasons,
    origins: s.exception_origins, evidence_ref: s.evidence_ref }));
  const conflicts = checked.review.conflicts.map(c => ({ ...c, state: 'model_reported', meaning_verified: false }));
  const log = { at: now, source_digest: bundle.source_digest, request_digest: requestDigest,
    included: statements.length, excluded: rejected.length, gaps: gaps.length, exceptions: exceptions.length,
    previous_generation: previous?.generation_id ?? null };
  const workLog = [...(previous?.content.work_log ?? []), log];
  if (workLog.length > 200) fail('wiki_history_budget');
  const groups = [{ page_id: 'project:' + bundle.project_ref, title: bundle.project_ref, topic: null,
    units: bundle.units, statement_ids: null }];
  const topicMode = statements.some(s => s.topic !== null);
  if (topicMode) {
    const topics = unique(statements.map(s => s.topic ?? '기타'));
    for (const topic of topics) {
      const selected = statements.filter(s => (s.topic ?? '기타') === topic), unitIds = new Set(selected.map(s => s.unit_id));
      groups.push({ page_id: 'topic:' + hashText(topic).slice(7), title: topic, topic,
        units: bundle.units.filter(u => unitIds.has(u.unit_id)), statement_ids: selected.map(s => s.statement_id) });
    }
  } else {
    const sources = unique(bundle.units.map(u => u.source_revision_ref.entity_id));
    for (const source of sources) groups.push({ page_id: 'source:' + source, title: source, topic: null,
      units: bundle.units.filter(u => u.source_revision_ref.entity_id === source), statement_ids: null });
  }
  const pages = groups.map(group => {
    const held = group.statement_ids === null ? statements.filter(s => group.units.some(u => u.unit_id === s.unit_id))
      : statements.filter(s => group.statement_ids.includes(s.statement_id));
    const scopedIds = new Set(held.map(s => s.statement_id));
    const pageExceptions = exceptions.filter(e => scopedIds.has(e.statement_id));
    const pageConflicts = conflicts.filter(c => scopedIds.has(c.left) || scopedIds.has(c.right));
    const pageGaps = gaps.filter(g => group.units.some(u => g.unit_ids.includes(u.unit_id)));
    const prior = previous?.content.pages.find(p => p.page_id === group.page_id);
    const revision = digest({ project: bundle.project_ref, page_id: group.page_id, source_digest: bundle.source_digest,
      statements: held, exceptions: pageExceptions, conflicts: pageConflicts, gaps: pageGaps,
      previous_revision: prior?.revision_id ?? null });
    const body = '# ' + markdown(group.title) + '\n\n자동 정리본\n\n## 정리본\n\n'
      + (held.length ? held.map(s => '- ' + markdown(s.text) + ' [' + s.unit_id + ']').join('\n') : '현재 근거 문장 없음')
      + '\n\n## 확인 필요\n\n### 예외\n\n'
      + (pageExceptions.length ? pageExceptions.map(e => '- [' + markdown(e.statement_id) + '] ' + markdown(e.reason)).join('\n') : '없음')
      + '\n\n### 모순\n\n'
      + (pageConflicts.length ? pageConflicts.map(c => '- [' + markdown(c.left) + ' ↔ ' + markdown(c.right) + '] ' + markdown(c.note)).join('\n') : '없음')
      + '\n\n## 빈틈\n\n'
      + (pageGaps.length ? pageGaps.map(g => '- [' + g.unit_ids.map(markdown).join(', ') + '] ' + markdown(g.note)).join('\n') : '없음')
      + '\n\n## 재료 목록\n\n' + group.units.map(u => '- [' + u.unit_id + '] ' + markdown(u.locator)
        + ' · ' + u.text_sha256 + ' · 사용 문장 ' + held.filter(s => s.unit_id === u.unit_id).length).join('\n')
      + '\n\n## 기록 (추가 전용)\n\n' + workLog.map(l => '- ' + l.at + ' · 입력 ' + l.source_digest + ' · 포함 ' + l.included + ' · 제외 ' + l.excluded).join('\n') + '\n';
    return { page_id: group.page_id, topic: group.topic, revision_id: revision, previous_revision: prior?.revision_id ?? null,
      source_unit_ids: group.units.map(u => u.unit_id), statement_ids: held.map(s => s.statement_id),
      materials: inventory.filter(u => group.units.some(g => g.unit_id === u.unit_id)),
      display_label: '자동 정리본', claim_ceiling: 'observed', markdown: body };
  });
  const nodes = [], edges = [], nodeIds = new Set();
  const add = (kind, id, data, origin = 'deterministic_projection') => {
    const nodeId = digest({ project: bundle.project_ref, kind, id });
    if (!nodeIds.has(nodeId)) { nodes.push({ id: nodeId, kind, data, origin, state: 'candidate' }); nodeIds.add(nodeId); } return nodeId;
  };
  const link = (source, target, kind) => edges.push({ source, target, kind });
  const unitNodes = new Map(bundle.spans.map(s => [s.unit_id, add('SourceUnit', s.unit_id, s)]));
  const statementNodes = new Map(checked.results.map(s => [s.statement_id, add('Statement', s.statement_id, { ...s,
    current: statements.includes(s), withdrawn: withdrawals.includes(withdrawalFingerprint(s.text)) }, 'model_proposal')]));
  for (const s of checked.results) if (s.evidence_ref) link(statementNodes.get(s.statement_id), unitNodes.get(s.unit_id), 'SUPPORTED_BY');
  for (const page of pages) {
    const p = add('WikiPage', page.page_id, { page_id: page.page_id }), rev = add('WikiRevision', page.revision_id, page, 'model_proposal');
    link(p, rev, 'HAS_REVISION');
    for (const id of page.statement_ids) link(rev, statementNodes.get(id), 'HAS_STATEMENT');
    if (page.previous_revision) link(rev, add('WikiRevision', page.previous_revision,
      { revision_id: page.previous_revision, historical_stub: true, archive_generation: previous.generation_id }), 'SUPERSEDES');
  }
  for (const ex of exceptions) link(statementNodes.get(ex.statement_id), add('Exception', ex.statement_id, ex,
    ex.origins.includes('model_proposal') ? 'model_proposal' : 'deterministic_projection'), 'HAS_EXCEPTION');
  for (const gap of gaps) for (const unit of gap.unit_ids) link(unitNodes.get(unit), add('Gap', digest(gap), gap, 'model_proposal'), 'HAS_GAP');
  for (const conflict of conflicts) { add('Conflict', digest(conflict), conflict, 'model_proposal'); link(statementNodes.get(conflict.left), statementNodes.get(conflict.right), 'CONFLICTS_WITH'); }
  add('WorkLog', requestDigest, log);
  return { schema: 'soulforge.knowledge_layer.wiki_snapshot.v2', project_ref: bundle.project_ref, source_digest: bundle.source_digest,
    view_digest: viewDigest, request_digest: requestDigest, parent_generation: previous?.generation_id ?? null,
    generator: { id: generator.id, budget: generator.budget }, input_snapshot: { units: bundle.units, grant: bundle.grant, human_correction_unit_ids: corrections },
    material_inventory: inventory, wiki_rules_sha256: rulesHash,
    claim_ceiling: 'observed', display_label: '자동 정리본', semantic_fact_verified: false, knowledge_accepted: false,
    withdrawals, statements, excluded: rejected.map(s => ({ statement_id: s.statement_id, unit_id: s.unit_id, reasons: s.reasons,
      withdrawn: withdrawals.includes(withdrawalFingerprint(s.text)) })), pages, work_log: workLog, gaps, conflicts, exceptions,
    index_markdown: '# ' + bundle.project_ref + ' · 자동 정리본 색인\n\n' + pages.map(p => '- ' + p.page_id + ' · ' + p.revision_id).join('\n') + '\n', nodes, edges };
}
/** The sole knowledge-layer writer. Adapters are trusted caller dependencies.
 * It never connects existing voice/mail/graph pipelines or issues source grants.
 */
export function createWikiKnowledgeLayer({ graph, archive, generator } = {}) {
  if (!graph || !['read', 'commit'].every(k => typeof graph[k] === 'function')
    || !archive || !['put', 'get', 'addWithdrawals', 'getWithdrawals', 'getRecoveryWithdrawals'].every(k => typeof archive[k] === 'function')
    || !generator || !token(generator.id) || typeof generator.createSession !== 'function') fail('wiki_binding_invalid');
  const budget = validateBudget(generator.budget), modelId = generator.id;
  if (generator.role && generator.role !== 'wiki_draft') fail('wiki_model_role_mismatch');
  const rules = loadWikiRules();
  const viewDigestOf = (args, withdrawals) => digest({ source_digest: args.bundle.source_digest, withdrawals,
    human_correction_unit_ids: args.human_correction_unit_ids, wiki_rules_sha256: rules.sha256, model_id: modelId });
  const checkProject = args => { if (generator.project_ref && generator.project_ref !== args.bundle.project_ref) fail('model_project_mismatch'); };
  async function retained(project, supplied, prior = null) {
    return unique([...supplied, ...(prior?.content.withdrawals ?? []), ...await archive.getWithdrawals(project)]);
  }
  async function readCurrent(input) {
    const args = argumentsOf(input); checkProject(args); const prior = await graph.read(args.bundle.project_ref);
    if (!prior) return freeze({ status: 'HOLD', reason: 'wiki_not_generated' });
    const checked = validateGraphRecord(prior, args.bundle.project_ref), withdrawals = await retained(args.bundle.project_ref, args.withdrawals, checked);
    if (checked.content.view_digest !== viewDigestOf(args, withdrawals)) return freeze({ status: 'HOLD', reason: 'wiki_stale_or_withdrawn' });
    return freeze({ status: 'READY', record: checked });
  }
  async function generate(input) {
    const args = argumentsOf(input), { bundle } = args, project = bundle.project_ref;
    checkProject(args);
    const priorRaw = await graph.read(project), prior = priorRaw ? validateGraphRecord(priorRaw, project) : null;
    const withdrawals = await retained(project, args.withdrawals, prior);
    if (bundle.units.length === 0) return freeze({ status: 'HOLD', reason: 'empty_input', model_calls: 0 });
    const viewDigest = viewDigestOf(args, withdrawals), requestDigest = digest({ view_digest: viewDigest, budget });
    if ((prior?.generation_id ?? null) !== args.expected_previous) fail('wiki_prior_mismatch');
    if (prior?.content.request_digest === requestDigest) {
      await archive.addWithdrawals(project, prior.content.withdrawals);
      return freeze({ ...await readCurrent(input), unchanged: true, model_calls: 0 });
    }
    const modelInput = buildWikiModelInput({ project_ref: project, units: bundle.units,
      human_correction_unit_ids: args.human_correction_unit_ids, operating_rules: rules.text });
    if (JSON.stringify(modelInput).length > budget.max_input_characters) return freeze({ status: 'HOLD', reason: 'generation_input_budget', model_calls: 0 });
    let proposed;
    try { const session = generator.createSession(); proposed = snapshot(await boundedCall(signal => session.generate(modelInput, { signal }), budget.timeout_ms)); }
    catch { return freeze({ status: 'HOLD', reason: 'generation_failed', model_calls: 1 }); }
    if (JSON.stringify(proposed).length > budget.max_output_characters) return freeze({ status: 'HOLD', reason: 'generation_output_budget', model_calls: 1 });
    if (Array.isArray(proposed?.candidates) && proposed.candidates.length === 0) return freeze({ status: 'HOLD', reason: 'empty_generation', model_calls: 1 });
    const checked = checkWikiOutput(bundle, proposed);
    const content = buildContent({ bundle, checked, withdrawals, previous: prior, generator: { id: modelId, budget }, now: args.request.now,
      requestDigest, viewDigest, rulesHash: rules.sha256, corrections: args.human_correction_unit_ids });
    const record = validateGraphRecord({ generation_id: digest(content), content }, project);
    await archive.put(record.generation_id, content);
    if (digest(await retained(project, args.withdrawals, prior)) !== digest(withdrawals)) fail('wiki_withdrawals_changed');
    await graph.commit(project, args.expected_previous, record);
    try { await archive.addWithdrawals(project, withdrawals); }
    catch { return freeze({ status: 'HOLD', reason: 'withdrawal_archive_pending', graph_committed: true,
      generation_id: record.generation_id, model_calls: 1 }); }
    const result = await readCurrent(input);
    return freeze({ ...result, unchanged: false, model_calls: 1 });
  }
  async function restore({ input, generation_id }) {
    const args = argumentsOf(input); if (!sha(generation_id)) fail('wiki_archive_invalid');
    checkProject(args);
    const content = await archive.get(generation_id), record = validateGraphRecord({ generation_id, content }, args.bundle.project_ref);
    const prior = await graph.read(args.bundle.project_ref), withdrawals = unique([
      ...await retained(args.bundle.project_ref, args.withdrawals, prior), ...await archive.getRecoveryWithdrawals(args.bundle.project_ref)]);
    if (content.view_digest !== viewDigestOf(args, withdrawals)) fail('wiki_restore_stale');
    await graph.commit(args.bundle.project_ref, args.expected_previous, record); return readCurrent(input);
  }
  return Object.freeze({ generate, readCurrent, restore });
}
