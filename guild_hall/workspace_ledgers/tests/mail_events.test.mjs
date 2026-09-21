import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { compileRules, MAX_BODY_TEXT_CHARS, RULE_SCHEMA_VERSION } from '../src/classifier.mjs';
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

test('parseAddressField: a multi-recipient single string splits on top-level commas/semicolons (S6)', () => {
  assert.deepEqual(parseAddressField('"Hong" <hong@example.com>, "Kim" <kim@example.com>'), [
    { name: 'Hong', email: 'hong@example.com' },
    { name: 'Kim', email: 'kim@example.com' },
  ]);
  assert.deepEqual(parseAddressField('a@example.com; b@example.com'), [
    { name: '', email: 'a@example.com' },
    { name: '', email: 'b@example.com' },
  ]);
  // a quoted display name containing a comma must not be split on
  assert.deepEqual(parseAddressField('"Kim, S." <kim@example.com>'), [{ name: 'Kim, S.', email: 'kim@example.com' }]);
});

test('parseAddressField: an unparseable residue (leftover whitespace or <) is dropped, never kept as an address (S6)', () => {
  assert.deepEqual(parseAddressField('not an address at all'), []);
  assert.deepEqual(parseAddressField('broken <unterminated'), []);
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

test('loadMailEvents: a missing event_id is synthesised from content, and two different mails never collide (S7)', () => {
  const dir = tempDir();
  try {
    const lines = [
      { subject: 'first mail', from: 'a@example.com', to: [], cc: [], received_at: '2026-09-01T00:00:00Z', body_text: '', attachments: [] },
      { subject: 'second mail', from: 'b@example.com', to: [], cc: [], received_at: '2026-09-01T01:00:00Z', body_text: '', attachments: [] },
    ];
    writeFileSync(path.join(dir, 'events.jsonl'), lines.map(line => JSON.stringify(line)).join('\n'));
    const compiled = compileRules([rule('P00-001', 'P00-001_x', [['P00-001', 'P00-001']])]);
    const { events } = loadMailEvents({ dirs: [dir], source: 'test', compiledRules: compiled });
    assert.equal(events.length, 2);
    assert.notEqual(events[0].event_id, '');
    assert.notEqual(events[1].event_id, '');
    assert.notEqual(events[0].event_id, events[1].event_id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadMailEvents: two custody lines sharing one event_id dedupe to one event, keeping the one with more attachments', () => {
  const dir = tempDir();
  try {
    const lines = [
      { event_id: 'dup-1', subject: '[P00-001] repeated mail', from: 'a@example.com', to: [], cc: [], received_at: '2026-09-01T00:00:00Z', body_text: '', attachments: [] },
      { event_id: 'dup-1', subject: '[P00-001] repeated mail', from: 'a@example.com', to: [], cc: [], received_at: '2026-09-01T00:00:00Z', body_text: '', attachments: [{ name: 'x.pdf' }, { name: 'y.pdf' }] },
    ];
    writeFileSync(path.join(dir, 'events.jsonl'), lines.map(line => JSON.stringify(line)).join('\n'));
    const compiled = compileRules([rule('P00-001', 'P00-001_x', [['P00-001', 'P00-001']])]);
    const { events, scanned, duplicatesDropped } = loadMailEvents({ dirs: [dir], source: 'test', compiledRules: compiled });
    assert.equal(scanned, 2); // both lines were read
    assert.equal(events.length, 1); // but only one event survives
    assert.equal(duplicatesDropped, 1);
    assert.equal(events[0].attachment_count, 2); // the one with more attachments was kept
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadMailEvents: a tie on attachment count keeps the later line', () => {
  const dir = tempDir();
  try {
    // same fingerprint (subject/at/from) so this is recognised as a genuine duplicate,
    // not an id collision; the two `to` lists (not part of the fingerprint) tell us
    // which copy survived.
    const lines = [
      { event_id: 'dup-2', subject: 'same subject', from: 'a@example.com', to: ['first@example.com'], cc: [], received_at: '2026-09-01T00:00:00Z', body_text: '', attachments: [{ name: 'a.pdf' }] },
      { event_id: 'dup-2', subject: 'same subject', from: 'a@example.com', to: ['second@example.com'], cc: [], received_at: '2026-09-01T00:00:00Z', body_text: '', attachments: [{ name: 'b.pdf' }] },
    ];
    writeFileSync(path.join(dir, 'events.jsonl'), lines.map(line => JSON.stringify(line)).join('\n'));
    const compiled = compileRules([rule('P00-001', 'P00-001_x', [['P00-001', 'P00-001']])]);
    const { events, duplicatesDropped, idCollisionsKept } = loadMailEvents({ dirs: [dir], source: 'test', compiledRules: compiled });
    assert.equal(events.length, 1);
    assert.equal(duplicatesDropped, 1);
    assert.equal(idCollisionsKept, 0);
    assert.equal(events[0].to[0]?.email, 'second@example.com'); // the later line wins the tie
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadMailEvents: distinct missing-event_id lines are never treated as duplicates of each other', () => {
  const dir = tempDir();
  try {
    const lines = [
      { subject: 'first', from: 'a@example.com', to: [], cc: [], received_at: '2026-09-01T00:00:00Z', body_text: '', attachments: [] },
      { subject: 'second', from: 'b@example.com', to: [], cc: [], received_at: '2026-09-01T01:00:00Z', body_text: '', attachments: [] },
    ];
    writeFileSync(path.join(dir, 'events.jsonl'), lines.map(line => JSON.stringify(line)).join('\n'));
    const compiled = compileRules([rule('P00-001', 'P00-001_x', [['P00-001', 'P00-001']])]);
    const { events, duplicatesDropped } = loadMailEvents({ dirs: [dir], source: 'test', compiledRules: compiled });
    assert.equal(events.length, 2);
    assert.equal(duplicatesDropped, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadMailEvents (fresh-review-3 #2): two byte-identical no-id lines collapse as a duplicate, not a permanent fresh-duplicate-key failure', () => {
  const dir = tempDir();
  try {
    // Custody is append-only: re-running against the same two identical lines every
    // day must keep collapsing to one event, not fail every single run.
    const line = { subject: '[P00-001] 반복', from: 'a@example.com', to: [], cc: [], received_at: '2026-09-01T00:00:00Z', body_text: '', attachments: [] };
    writeFileSync(path.join(dir, 'events.jsonl'), `${JSON.stringify(line)}\n${JSON.stringify(line)}`);
    const compiled = compileRules([rule('P00-001', 'P00-001_x', [['P00-001', 'P00-001']])]);
    const { events, duplicatesDropped, idCollisionsKept } = loadMailEvents({ dirs: [dir], source: 'test', compiledRules: compiled });
    assert.equal(events.length, 1);
    assert.equal(duplicatesDropped, 1);
    assert.equal(idCollisionsKept, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadMailEvents (fresh-review-3 #8): a later-file read failure discards that whole directory, not just the failing file', () => {
  const dir = tempDir();
  try {
    writeFileSync(path.join(dir, 'a-first.jsonl'), JSON.stringify(
      { event_id: 'a1', subject: '[P00-001] 첫 파일', from: 'a@example.com', to: [], cc: [], received_at: '2026-09-01T00:00:00Z', body_text: '', attachments: [] },
    ));
    // A later-sorting "file" that is actually a directory: readFileSync on it throws
    // EISDIR once the generator reaches it.
    mkdirSync(path.join(dir, 'b-second.jsonl'));
    const compiled = compileRules([rule('P00-001', 'P00-001_x', [['P00-001', 'P00-001']])]);
    const { events, unreadableDirs } = loadMailEvents({ dirs: [dir], source: 'test', compiledRules: compiled });
    assert.equal(unreadableDirs.length, 1);
    assert.equal(unreadableDirs[0].dir, dir);
    assert.equal(events.length, 0); // the readable first file's record is not silently kept either
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadMailEvents (N-5, fresh-review-4): id-collision subgroup ids are a stable hash of their own fingerprint, never an ordinal that shifts when a sibling subgroup appears', () => {
  const dir = tempDir();
  try {
    const zSubjectLine = { event_id: 'shared', subject: '[P00-001] z 나중 정렬 제목', from: 'a@example.com', to: [], cc: [], received_at: '2026-09-01T00:00:00Z', body_text: '', attachments: [] };
    const aSubjectLine = { event_id: 'shared', subject: '[P00-001] a 먼저 정렬 제목', from: 'b@example.com', to: [], cc: [], received_at: '2026-09-01T01:00:00Z', body_text: '', attachments: [] };
    writeFileSync(path.join(dir, 'a-earlier.jsonl'), JSON.stringify(zSubjectLine));
    writeFileSync(path.join(dir, 'b-later.jsonl'), JSON.stringify(aSubjectLine));
    const compiled = compileRules([rule('P00-001', 'P00-001_x', [['P00-001', 'P00-001']])]);
    const { events: firstRun, idCollisionsKept } = loadMailEvents({ dirs: [dir], source: 'test', compiledRules: compiled });
    assert.equal(firstRun.length, 2);
    assert.equal(idCollisionsKept, 1);
    // Neither subgroup keeps the bare "shared" id once a real collision exists --
    // both are suffixed by a hash of their OWN fingerprint, and never `shared#2`/`#3`.
    const aEventIdFirstRun = firstRun.find(event => event.subject.includes('a 먼저')).event_id;
    const zEventIdFirstRun = firstRun.find(event => event.subject.includes('z 나중')).event_id;
    assert.notEqual(aEventIdFirstRun, 'shared');
    assert.notEqual(zEventIdFirstRun, 'shared');
    assert.match(aEventIdFirstRun, /^shared~fp:[0-9a-f]{8}$/u);
    assert.match(zEventIdFirstRun, /^shared~fp:[0-9a-f]{8}$/u);
    assert.notEqual(aEventIdFirstRun, zEventIdFirstRun);

    // A THIRD mail arrives, sharing the same event_id, with a fingerprint that sorts
    // before both existing ones (an ordinal scheme would renumber #1 vs #2 here).
    writeFileSync(path.join(dir, '0-newest.jsonl'), JSON.stringify(
      { event_id: 'shared', subject: '[P00-001] 0 새로 도착 제목', from: 'c@example.com', to: [], cc: [], received_at: '2026-09-01T02:00:00Z', body_text: '', attachments: [] },
    ));
    const { events: secondRun } = loadMailEvents({ dirs: [dir], source: 'test', compiledRules: compiled });
    assert.equal(secondRun.length, 3);
    const aEventIdSecondRun = secondRun.find(event => event.subject.includes('a 먼저')).event_id;
    const zEventIdSecondRun = secondRun.find(event => event.subject.includes('z 나중')).event_id;
    // The two PRE-EXISTING subgroups' ids are unchanged by the new arrival -- neither
    // Owner-entered cell keyed to their old 이력키 would be silently dropped.
    assert.equal(aEventIdSecondRun, aEventIdFirstRun);
    assert.equal(zEventIdSecondRun, zEventIdFirstRun);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadMailEvents (fresh-review-2 #4/S4): two different mails coincidentally sharing an event_id are both kept, never silently collapsed', () => {
  const dir = tempDir();
  try {
    const lines = [
      { event_id: 'shared-id', subject: 'first distinct mail', from: 'a@example.com', to: [], cc: [], received_at: '2026-09-01T00:00:00Z', body_text: '', attachments: [] },
      { event_id: 'shared-id', subject: 'a completely different mail', from: 'b@example.com', to: [], cc: [], received_at: '2026-09-01T05:00:00Z', body_text: '', attachments: [] },
    ];
    writeFileSync(path.join(dir, 'events.jsonl'), lines.map(line => JSON.stringify(line)).join('\n'));
    const compiled = compileRules([rule('P00-001', 'P00-001_x', [['P00-001', 'P00-001']])]);
    const { events, duplicatesDropped, idCollisionsKept } = loadMailEvents({ dirs: [dir], source: 'test', compiledRules: compiled });
    assert.equal(events.length, 2); // both kept
    assert.equal(duplicatesDropped, 0); // this is not a duplicate
    assert.equal(idCollisionsKept, 1);
    const ids = events.map(event => event.event_id);
    assert.equal(new Set(ids).size, 2); // disambiguated -- never collide downstream
    // N-5: neither copy keeps the bare "shared-id" -- both carry a fingerprint-hash suffix.
    for (const id of ids) assert.match(id, /^shared-id~fp:[0-9a-f]{8}$/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadMailEvents (fresh-review-2 #4): an id collision fingerprint ignores attachment count (real custody repeats a mail with only that differing)', () => {
  const dir = tempDir();
  try {
    const lines = [
      { event_id: 'same-mail', subject: 'identical mail', from: 'a@example.com', to: [], cc: [], received_at: '2026-09-01T00:00:00Z', body_text: '', attachments: [] },
      { event_id: 'same-mail', subject: 'identical mail', from: 'a@example.com', to: [], cc: [], received_at: '2026-09-01T00:00:00Z', body_text: '', attachments: [{ name: 'x.pdf' }] },
    ];
    writeFileSync(path.join(dir, 'events.jsonl'), lines.map(line => JSON.stringify(line)).join('\n'));
    const compiled = compileRules([rule('P00-001', 'P00-001_x', [['P00-001', 'P00-001']])]);
    const { events, duplicatesDropped, idCollisionsKept } = loadMailEvents({ dirs: [dir], source: 'test', compiledRules: compiled });
    assert.equal(events.length, 1); // treated as the same mail, not a collision
    assert.equal(duplicatesDropped, 1);
    assert.equal(idCollisionsKept, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadMailEvents (fresh-review-2 #3): the synthesised id folds in the full raw line, so two no-id lines differing only in recipients never collide', () => {
  const dir = tempDir();
  try {
    const lines = [
      { subject: 'same subject', from: 'a@example.com', to: ['first@example.com'], cc: [], received_at: '2026-09-01T00:00:00Z', body_text: '', attachments: [] },
      { subject: 'same subject', from: 'a@example.com', to: ['second@example.com'], cc: [], received_at: '2026-09-01T00:00:00Z', body_text: '', attachments: [] },
    ];
    writeFileSync(path.join(dir, 'events.jsonl'), lines.map(line => JSON.stringify(line)).join('\n'));
    const compiled = compileRules([rule('P00-001', 'P00-001_x', [['P00-001', 'P00-001']])]);
    const { events } = loadMailEvents({ dirs: [dir], source: 'test', compiledRules: compiled });
    assert.equal(events.length, 2);
    assert.notEqual(events[0].event_id, events[1].event_id); // different raw lines -> different synthetic ids
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadMailEvents: custody timestamps normalise to UTC instants that sort chronologically regardless of offset (S12)', () => {
  const dir = tempDir();
  try {
    // 2026-09-01T23:30:00+09:00 is 2026-09-01T14:30:00Z -- earlier than the Z event below,
    // even though its raw string, compared lexically, would sort *after* it.
    const lines = [
      { event_id: 'later', subject: 'late', from: 'a@example.com', to: [], cc: [], received_at: '2026-09-01T15:00:00Z', body_text: '', attachments: [] },
      { event_id: 'earlier', subject: 'early', from: 'a@example.com', to: [], cc: [], received_at: '2026-09-01T23:30:00+09:00', body_text: '', attachments: [] },
    ];
    writeFileSync(path.join(dir, 'events.jsonl'), lines.map(line => JSON.stringify(line)).join('\n'));
    const compiled = compileRules([rule('P00-001', 'P00-001_x', [['P00-001', 'P00-001']])]);
    const { events } = loadMailEvents({ dirs: [dir], source: 'test', compiledRules: compiled });
    const earlier = events.find(event => event.event_id === 'earlier');
    const later = events.find(event => event.event_id === 'later');
    assert.equal(earlier.at, '2026-09-01T14:30:00.000Z'); // normalised to a canonical UTC instant
    assert.ok(earlier.at.localeCompare(later.at) < 0); // and now sorts correctly as the earlier one
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadMailEvents (fresh-review-2 #1): a missing directory is reported as unreadable, never silently empty', () => {
  const dir = tempDir();
  try {
    const compiled = compileRules([rule('P00-001', 'P00-001_x', [['P00-001', 'P00-001']])]);
    const missing = path.join(dir, 'does-not-exist');
    const { events, unreadableDirs } = loadMailEvents({ dirs: [missing], source: 'test', compiledRules: compiled });
    assert.deepEqual(events, []);
    assert.equal(unreadableDirs.length, 1);
    assert.equal(unreadableDirs[0].dir, missing);
    assert.equal(unreadableDirs[0].code, 'ENOENT');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadMailEvents (N-1, fresh-review-4): the same no-id mail re-serialised with a different key order still collapses as one duplicate', () => {
  const dir = tempDir();
  try {
    // Same content, different key insertion order -- JSON.stringify preserves
    // insertion order, so these two lines are byte-different but content-identical.
    const forward = { subject: '[P00-001] 재직렬화 테스트', from: 'a@example.com', to: [], cc: [], received_at: '2026-09-01T00:00:00Z', body_text: '', attachments: [] };
    const reordered = { attachments: [], body_text: '', cc: [], to: [], from: 'a@example.com', received_at: '2026-09-01T00:00:00Z', subject: '[P00-001] 재직렬화 테스트' };
    assert.notEqual(JSON.stringify(forward), JSON.stringify(reordered)); // sanity: genuinely different bytes
    writeFileSync(path.join(dir, 'events.jsonl'), `${JSON.stringify(forward)}\n${JSON.stringify(reordered)}`);
    const compiled = compileRules([rule('P00-001', 'P00-001_x', [['P00-001', 'P00-001']])]);
    const { events, duplicatesDropped } = loadMailEvents({ dirs: [dir], source: 'test', compiledRules: compiled });
    assert.equal(events.length, 1);
    assert.equal(duplicatesDropped, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadMailEvents (N-4, fresh-review-4): a body far past MAX_BODY_TEXT_CHARS still classifies correctly on content within the bound', () => {
  const dir = tempDir();
  try {
    const padding = 'x'.repeat(MAX_BODY_TEXT_CHARS * 3); // several times the bound
    const line = { event_id: 'e1', subject: 'no subject match', from: 'a@example.com', to: [], cc: [], received_at: '2026-09-01T00:00:00Z', body_text: `needle-up-front ${padding}`, attachments: [] };
    writeFileSync(path.join(dir, 'events.jsonl'), JSON.stringify(line));
    const compiled = compileRules([rule('P00-001', 'P00-001_x', [['NEEDLE', 'needle-up-front']])]);
    const { events } = loadMailEvents({ dirs: [dir], source: 'test', compiledRules: compiled, fields: ['body_text'] });
    assert.equal(events.length, 1);
    assert.equal(events[0].match.hits.length, 1); // the keyword, safely within the bound, still matches
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// fresh-review-5 (design simplification): the per-mail vm-timeout machinery two
// tests here used to exercise (S-1's matchTimeouts, S-2/S-3's shared
// boundedClassifier) was removed by coordinator decision -- see classifier.mjs's
// classifyMail doc. Matching is a direct classifyMail call now; there is nothing left
// to test a timeout or a shared bounded-classifier instance against.
