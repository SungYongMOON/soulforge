import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { compileRules, RULE_SCHEMA_VERSION } from '../src/classifier.mjs';
import { loadMailEvents, parseAddressField } from '../src/mail_events.mjs';

function tempDir() {
  return mkdtempSync(path.join(tmpdir(), 'workspace-ledgers-mail-events-'));
}

function rule(code, folder, exact) {
  return {
    schema_version: RULE_SCHEMA_VERSION, project_code: code, folder_name: folder, rule_version: 'v1', status: 'draft',
    match_fields: ['subject', 'body_text', 'attachment_names'], case_insensitive_literals: true,
    exact: exact.map(([label, value]) => ({ label, kind: 'literal', value })), hint: [],
    yields_to: null, conflict_policy: 'two_projects_exact_on_one_mail_means_hold_no_attribution', sender_policy: 'hint_only',
  };
}

test('parseAddressField: string and object shapes, drops entries without an address', () => {
  assert.deepEqual(parseAddressField('"Hong Gildong" <hong@example.com>'), [{ name: 'Hong Gildong', email: 'hong@example.com' }]);
  assert.deepEqual(parseAddressField({ display_name: 'Kim', address: 'Kim@Example.com' }), [{ name: 'Kim', email: 'kim@example.com' }]);
  assert.deepEqual(parseAddressField([{ name: 'no address here' }]), []);
  assert.deepEqual(parseAddressField(null), []);
});

test('loadMailEvents: skips system senders and [Plaud-AutoFlow] subjects, classifies the rest', () => {
  const dir = tempDir();
  try {
    const lines = [
      { event_id: 'e1', subject: '[P00-001] status update', from: 'person@example.com', to: [], cc: [], received_at: '2026-09-01T00:00:00Z', body_text: 'hello', attachments: [] },
      { event_id: 'e2', subject: 'notify', from: 'noreply@slack.com', to: [], cc: [], received_at: '2026-09-01T00:00:00Z', body_text: '', attachments: [] },
      { event_id: 'e3', subject: '[Plaud-AutoFlow] daily digest', from: 'person@example.com', to: [], cc: [], received_at: '2026-09-01T00:00:00Z', body_text: '', attachments: [] },
      { event_id: 'e4', subject: 'no project mentioned', from: 'person@example.com', to: [], cc: [], received_at: '2026-09-01T00:00:00Z', body_text: '', attachments: [] },
    ];
    writeFileSync(path.join(dir, 'events.jsonl'), lines.map(line => JSON.stringify(line)).join('\n'));
    const compiled = compileRules([rule('P00-001', 'P00-001_x', [['P00-001', 'P00-001']])]);
    const { events, scanned, skippedSystem } = loadMailEvents({ dirs: [dir], source: 'test', compiledRules: compiled, fields: ['subject'] });
    assert.equal(scanned, 4); // scanned counts every non-empty-subject line, before the system/skip filter
    assert.equal(skippedSystem, 2);
    assert.equal(events.length, 2);
    assert.equal(events.find(event => event.event_id === 'e1').match.hits[0].project_code, 'P00-001');
    assert.equal(events.find(event => event.event_id === 'e4').match.hits.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadMailEvents: returned events never carry body_text or attachment names', () => {
  const dir = tempDir();
  try {
    const line = { event_id: 'e1', subject: 'subject only', from: 'person@example.com', to: [], cc: [],
      received_at: '2026-09-01T00:00:00Z', body_text: 'SECRET BODY TEXT', attachments: [{ name: 'secret_attachment.pdf' }] };
    writeFileSync(path.join(dir, 'events.jsonl'), JSON.stringify(line));
    const compiled = compileRules([rule('P00-001', 'P00-001_x', [['P00-001', 'P00-001']])]);
    const { events } = loadMailEvents({ dirs: [dir], source: 'test', compiledRules: compiled, fields: ['subject', 'body_text', 'attachment_names'] });
    assert.equal(events.length, 1);
    const [event] = events;
    assert.equal('body_text' in event, false);
    assert.equal('attachment_names' in event, false);
    assert.equal(event.attachment_count, 1);
    assert.deepEqual(JSON.stringify(event).includes('SECRET BODY TEXT'), false);
    assert.deepEqual(JSON.stringify(event).includes('secret_attachment.pdf'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadMailEvents: a missing directory reads as no events, not an error', () => {
  const dir = tempDir();
  try {
    const compiled = compileRules([rule('P00-001', 'P00-001_x', [['P00-001', 'P00-001']])]);
    const { events, unreadableDirs } = loadMailEvents({ dirs: [path.join(dir, 'does-not-exist')], source: 'test', compiledRules: compiled });
    assert.deepEqual(events, []);
    assert.deepEqual(unreadableDirs, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
