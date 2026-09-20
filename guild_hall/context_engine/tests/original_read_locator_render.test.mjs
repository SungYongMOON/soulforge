import assert from 'node:assert/strict';
import test from 'node:test';
import { render } from '../harness/estate_original_read.mjs';

test('human original-read output shows the exact locator and stored-fallback reason', () => {
  const locator = { path: ['trial.pdf'], source_sha256: `sha256:${'a'.repeat(64)}`,
    page_number: 2, table_number: 1, row_number: 1, column_number: 2 };
  const answer = { project_code: 'P01-001', generation: { generation_id: 'g1', selected: true, documents: 1 },
    status: 'tool_configuration_missing', item: { source_kind: 'document', item_id: 'trial.pdf', root_ref: 'doc.synthetic',
      data_class: 'public_synthetic', title: 'trial.pdf', occurred_at: null,
      primary_revision_sha256: `sha256:${'b'.repeat(64)}`, doc_key: `sha256:${'c'.repeat(64)}`,
      manifest_doc_key: `sha256:${'c'.repeat(64)}`, doc_key_matches: false, units_total: 1, characters_total: 120,
      units_from: 'generation_document', reread_code: 'pdf_preparation_not_connected', stored_fallback: true,
      revision_check: 'not_run_missing_tool' }, requested_unit_found: true,
    units: [{ unit_id: 'u0000', unit_kind: 'pdf_table_cell', occurred_at: null, locator,
      characters: 120, shown: 100, truncated: true, text: 'x'.repeat(100) }],
    attachments: { status: 'attachment_list_unavailable', entries: [], detail: 'not requested' }, attachment: null };
  const output = render(answer, { budget: { call: 1, remaining: 5, bucket: 'dev' },
    toolsSha256: `sha256:${'d'.repeat(64)}` });
  assert.match(output, /status tool_configuration_missing/u);
  assert.match(output, /비교 미실행 — 문서 도구 설정 없음, 저장 세대 사용/u);
  assert.ok(output.includes(`locator ${JSON.stringify(locator)}`));
});
