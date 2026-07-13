import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../static/app.js', import.meta.url), 'utf8');

test('report view preserves legacy draft controls and adds a separate fixed final-polish card', () => {
  for (const legacyId of ['genType', 'genProject', 'genDays', 'genPresets', 'genRun', 'genCopy']) {
    assert.match(source, new RegExp(`id=["']${legacyId}["']`));
  }
  for (const workflowId of ['wfReportCard', 'wfProject', 'wfReportType', 'wfAudience', 'wfDraft', 'wfSources', 'wfRun', 'wfRefresh']) {
    assert.match(source, new RegExp(`${workflowId}`));
  }
  assert.match(source, /mode:\s*["']final_polish["']/);
  assert.match(source, /\/api\/workflow-jobs\/capabilities/);
  assert.doesNotMatch(source, /id="wfSources"[^>]*\smultiple(?:\s|>)/);
});

test('browser payload exposes only the fixed public request vocabulary', () => {
  const start = source.indexOf('id="wfReportCard"');
  const end = source.indexOf('const run = async () => {', start);
  assert.ok(start > 0 && end > start);
  const workflowUi = source.slice(start, end);
  for (const forbidden of [
    'prompt:',
    'model:',
    'skill:',
    'workflow_id:',
    'binding_revision:',
    'filesystem_path:',
    'instruction_source:',
    'network_access:',
    'approval_policy:',
  ]) {
    assert.equal(workflowUi.includes(forbidden), false, forbidden);
  }
  for (const allowed of ['schema:', 'project_code:', 'mode:', 'report_type:', 'audience:', 'input_handles:']) {
    assert.equal(workflowUi.includes(allowed), true, allowed);
  }
});
