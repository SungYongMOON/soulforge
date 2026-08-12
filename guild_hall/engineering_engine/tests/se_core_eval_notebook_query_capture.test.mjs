import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test, { afterEach } from 'node:test';
import { fileURLToPath } from 'node:url';

import { captureQaInteraction } from '../evaluation/se_core_eval_qa_capture.mjs';
import {
  SE_CORE_NOTEBOOK_QUERY_COMMAND,
  SE_CORE_NOTEBOOK_QUERY_SOURCE_ID_COUNT,
  buildNotebookQueryArgv,
  captureSeCoreNotebookQuery,
} from '../evaluation/se_core_eval_notebook_query_capture.mjs';
import { runCli } from '../tools/se_core_eval_notebook_query_capture.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = resolve(HERE, '../evaluation/se_core_eval_notebook_query_capture.mjs');
const CLI_PATH = resolve(HERE, '../tools/se_core_eval_notebook_query_capture.mjs');

// Synthetic public-safe placeholders. No real notebook, source, account, or conversation.
const NOTEBOOK_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_IDS = Object.freeze([
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
]);
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_CONVERSATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FOREIGN_ID = '99999999-9999-4999-8999-999999999999';
const FOREIGN_ALIAS = 'foreign-source-alias';
const PROFILE = 'evaluation-profile';
const QUESTION_TEXT = 'Use only the selected public systems-engineering corpus and the synthetic '
  + 'facts in this prompt. State the finding and the evidence limit, and do not create or '
  + 'approve work.';
const ANSWER_CANARY = 'RAW_ANSWER_CANARY_MUST_STAY_PRIVATE';
const CITATION_CANARY = 'RAW_CITED_TEXT_CANARY_MUST_STAY_PRIVATE';
const TABLE_CANARY = 'RAW_CITED_TABLE_CANARY_MUST_STAY_PRIVATE';
const OUTSIDE_CANARY = 'OUTSIDE_THE_EVALUATION_ROOT_CANARY';

const QUESTION_SHA256 = createHash('sha256').update(Buffer.from(QUESTION_TEXT, 'utf8')).digest('hex');

const ROOTS = new Set();

afterEach(() => {
  for (const root of ROOTS) rmSync(root, { recursive: true, force: true });
  ROOTS.clear();
});

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'se-core-notebook-query-'));
  ROOTS.add(root);
  return root;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function baseRequest(root, overrides = {}) {
  return {
    root_path: root,
    interaction_id: 'se-q-01',
    scope: 'fixed_benchmark',
    attempt_id: 'attempt-01',
    event_time: '2026-08-12T01:00:00Z',
    question_bytes: Buffer.from(QUESTION_TEXT, 'utf8'),
    notebook_id: NOTEBOOK_ID,
    source_ids: [...SOURCE_IDS],
    profile: PROFILE,
    timeout_seconds: 240,
    ...overrides,
  };
}

/**
 * The exact nlm 0.9.10 closed shape.
 *
 * `sources_used` is a unique source uuid list, `citations` maps a 1-based citation number to the
 * source uuid it resolves, and each `references` record binds one citation number to one source
 * with an optional quoted `cited_text` or extracted `cited_table`.
 */
function responseDocument(overrides = {}) {
  return {
    answer: `${ANSWER_CANARY} 판정: 합성 관측 범위의 후보 답변입니다.`,
    question: QUESTION_TEXT,
    conversation_id: CONVERSATION_ID,
    sources_used: [SOURCE_IDS[0], SOURCE_IDS[1]],
    citations: { 1: SOURCE_IDS[0], 2: SOURCE_IDS[1] },
    references: [
      { source_id: SOURCE_IDS[0], citation_number: 1, cited_text: CITATION_CANARY },
      {
        source_id: SOURCE_IDS[1],
        citation_number: 2,
        cited_table: { num_columns: 2, rows: [[TABLE_CANARY, 'v0'], ['bounded', 'plain']] },
      },
    ],
    ...overrides,
  };
}

function responseStdout(overrides = {}) {
  return Buffer.from(JSON.stringify(responseDocument(overrides)), 'utf8');
}

/** A recording fake. Nothing in this suite reaches a shell, a network, or the real CLI. */
function fakeExecutor(options = {}) {
  const calls = [];
  const execute = (invocation) => {
    calls.push(invocation);
    if (options.throws) throw new Error('EXECUTOR_EXPLODED');
    return {
      status: Object.hasOwn(options, 'status') ? options.status : 0,
      timed_out: options.timed_out === true,
      failed: options.failed === true,
      stdout: options.stdout ?? responseStdout(),
      stderr: options.stderr ?? Buffer.alloc(0),
    };
  };
  return { execute, calls };
}

function refusingExecutor() {
  const calls = [];
  return {
    calls,
    execute: (invocation) => {
      calls.push(invocation);
      throw new Error('THIS_ATTEMPT_MUST_NOT_QUERY_AGAIN');
    },
  };
}

function dependencies(execute, conversationId = CONVERSATION_ID) {
  return { execute, newConversationId: () => conversationId };
}

function ledgerText(root) {
  const path = join(root, 'qa_interaction_ledger.jsonl');
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

/** The ledger facts as the ledger module itself reports them, for audit-truth comparison. */
function ledgerState(root) {
  const report = captureQaInteraction({ root_path: root, command: 'query' });
  return {
    event_count: report.event_count,
    ledger_sha256: report.ledger_sha256,
    head_event_hash: report.head_event_hash,
  };
}

function privatePath(root, kind, interactionId, attemptId) {
  return join(root, 'private', 'notebook_query', kind, interactionId, `${attemptId}.json`);
}

function writePrivateArtifact(root, kind, interactionId, attemptId, bytes) {
  const target = privatePath(root, kind, interactionId, attemptId);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return target;
}

test('the only selectable command is one query-only nlm argv with four unique source ids', () => {
  assert.equal(SE_CORE_NOTEBOOK_QUERY_COMMAND, 'nlm');
  assert.equal(SE_CORE_NOTEBOOK_QUERY_SOURCE_ID_COUNT, 4);

  const argv = buildNotebookQueryArgv({
    notebook_id: NOTEBOOK_ID,
    question_text: QUESTION_TEXT,
    conversation_id: CONVERSATION_ID,
    source_ids: [...SOURCE_IDS],
    profile: PROFILE,
    timeout_seconds: 240,
  });
  assert.deepEqual(argv, [
    'notebook', 'query', NOTEBOOK_ID, QUESTION_TEXT,
    '--conversation-id', CONVERSATION_ID,
    '--source-ids', SOURCE_IDS.join(','),
    '--profile', PROFILE,
    '--json',
    '--timeout', '240',
  ]);

  for (const source_ids of [
    SOURCE_IDS.slice(0, 3),
    [...SOURCE_IDS, FOREIGN_ID],
    [SOURCE_IDS[0], SOURCE_IDS[0], SOURCE_IDS[1], SOURCE_IDS[2]],
    [...SOURCE_IDS.slice(0, 3), 'not-a-uuid'],
  ]) {
    assert.throws(() => buildNotebookQueryArgv({
      notebook_id: NOTEBOOK_ID,
      question_text: QUESTION_TEXT,
      conversation_id: CONVERSATION_ID,
      source_ids,
      profile: PROFILE,
      timeout_seconds: 240,
    }), (error) => error.code === 'ARGV_REFUSED');
  }

  const source = readFileSync(MODULE_PATH, 'utf8');
  assert.match(source, /shell: false/u);
  assert.doesNotMatch(source, /shell:\s*true/u);
  assert.doesNotMatch(source, /exec(?:Sync|File|FileSync)?\s*\(/u);
});

test('no login, mutation, research, note, or delete verb can occupy the subcommand positions', () => {
  const forbidden = [
    'login', 'create', 'delete', 'add', 'sync', 'import', 'research', 'note', 'share',
    'studio', 'rename', 'refresh_auth', 'source', 'chat',
  ];
  for (const verb of forbidden) {
    let argv = null;
    try {
      argv = buildNotebookQueryArgv({
        notebook_id: NOTEBOOK_ID,
        question_text: `${verb} the notebook`,
        conversation_id: CONVERSATION_ID,
        source_ids: [...SOURCE_IDS],
        profile: verb,
        timeout_seconds: 240,
      });
    } catch (error) {
      assert.equal(error.code, 'ARGV_REFUSED');
      continue;
    }
    assert.equal(argv[0], 'notebook');
    assert.equal(argv[1], 'query');
    assert.equal(argv[10], '--json');
    assert.equal(argv.filter((part) => part === verb).length <= 1, true);
  }
});

test('a valid closed response records question and answer and keeps raw bytes private', () => {
  const root = makeRoot();
  const executor = fakeExecutor();
  const report = captureSeCoreNotebookQuery(baseRequest(root), dependencies(executor.execute));

  assert.equal(report.result, 'PASS');
  assert.equal(report.state, 'captured');
  assert.equal(report.query_performed, true);
  assert.equal(report.disposition, 'appended');
  assert.equal(report.event_count, 2);
  assert.equal(report.appended_event_count, 2);
  assert.equal(report.citation_count, 2);
  assert.equal(report.reference_count, 2);
  assert.equal(report.source_used_count, 2);
  assert.equal(report.source_id_count, 4);
  assert.equal(report.question_sha256, QUESTION_SHA256);
  assert.deepEqual(ledgerState(root), {
    event_count: report.event_count,
    ledger_sha256: report.ledger_sha256,
    head_event_hash: report.head_event_hash,
  });

  assert.equal(executor.calls.length, 1);
  assert.equal(executor.calls[0].command, 'nlm');
  assert.equal(executor.calls[0].args[0], 'notebook');
  assert.equal(executor.calls[0].args[1], 'query');
  assert.equal(executor.calls[0].timeout_ms, 245_000);

  const responseBytes = readFileSync(privatePath(root, 'response', 'se-q-01', 'attempt-01'));
  assert.equal(report.response_artifact_sha256, sha256(responseBytes));
  assert.equal(JSON.parse(responseBytes).answer.includes(ANSWER_CANARY), true);
  const intent = JSON.parse(readFileSync(privatePath(root, 'intent', 'se-q-01', 'attempt-01')));
  assert.equal(intent.conversation_id, CONVERSATION_ID);
  assert.equal(intent.source_ids.length, 4);

  const visible = [JSON.stringify(report), ledgerText(root)].join('\n');
  for (const canary of [
    ANSWER_CANARY, CITATION_CANARY, TABLE_CANARY, NOTEBOOK_ID, CONVERSATION_ID,
    ...SOURCE_IDS, QUESTION_TEXT, PROFILE,
  ]) {
    assert.equal(visible.includes(canary), false, `redaction leaked: ${canary.slice(0, 12)}`);
  }
  assert.equal(
    readFileSync(join(root, 'raw', 'questions', 'se-q-01.md'), 'utf8'),
    QUESTION_TEXT,
  );
  assert.equal(
    readFileSync(join(root, 'raw', 'answers', 'se-q-01', 'notebook', 'attempt-01.md'), 'utf8')
      .includes(ANSWER_CANARY),
    true,
  );
  assert.equal(captureQaInteraction({ root_path: root, command: 'validate' }).result, 'PASS');
});

test('the exact nlm 0.9.10 citation map and reference records are accepted as counts only', () => {
  const root = makeRoot();
  const executor = fakeExecutor({
    stdout: responseStdout({
      sources_used: [SOURCE_IDS[0], SOURCE_IDS[1], SOURCE_IDS[2]],
      citations: { 1: SOURCE_IDS[0], 2: SOURCE_IDS[1], 3: SOURCE_IDS[2] },
      references: [
        { source_id: SOURCE_IDS[0], citation_number: 1, cited_text: CITATION_CANARY },
        { source_id: SOURCE_IDS[1], citation_number: 2 },
        {
          source_id: SOURCE_IDS[2],
          citation_number: 3,
          cited_table: {
            num_columns: 3,
            rows: [[TABLE_CANARY, 'b', 'c'], ['d', 'e', 'f'], ['', '', '']],
          },
        },
      ],
    }),
  });
  const report = captureSeCoreNotebookQuery(baseRequest(root), dependencies(executor.execute));

  assert.equal(report.result, 'PASS');
  assert.equal(report.citation_count, 3);
  assert.equal(report.reference_count, 3);
  assert.equal(report.source_used_count, 3);

  // The raw citation map, quoted text, and extracted table survive privately, byte for byte.
  const stored = JSON.parse(readFileSync(privatePath(root, 'response', 'se-q-01', 'attempt-01')));
  assert.equal(stored.citations['3'], SOURCE_IDS[2]);
  assert.equal(stored.references[0].cited_text, CITATION_CANARY);
  assert.equal(stored.references[2].cited_table.rows[0][0], TABLE_CANARY);

  const visible = [JSON.stringify(report), ledgerText(root)].join('\n');
  for (const canary of [ANSWER_CANARY, CITATION_CANARY, TABLE_CANARY, ...SOURCE_IDS]) {
    assert.equal(visible.includes(canary), false, `redaction leaked: ${canary.slice(0, 12)}`);
  }
});

test('a drifting, aliased, unbound, or unbounded citation or reference is refused', () => {
  const wideRows = Array.from({ length: 513 }, () => ['row']);
  const cases = [
    // citations is a mapping, not a list, and every key is a canonical 1-based number.
    ['RESPONSE_CITATION_REFUSED', { citations: [SOURCE_IDS[0], SOURCE_IDS[1]], references: [] }],
    ['RESPONSE_CITATION_REFUSED', { citations: { 0: SOURCE_IDS[0] }, references: [] }],
    ['RESPONSE_CITATION_REFUSED', { citations: { '01': SOURCE_IDS[0] }, references: [] }],
    ['RESPONSE_CITATION_REFUSED', { citations: { first: SOURCE_IDS[0] }, references: [] }],
    ['RESPONSE_CITATION_REFUSED', { citations: { 9999: SOURCE_IDS[0] }, references: [] }],
    // Every citation value must be one of the exact four requested source ids.
    ['RESPONSE_CITATION_REFUSED', { citations: { 1: FOREIGN_ID }, references: [] }],
    ['RESPONSE_CITATION_REFUSED', { citations: { 1: FOREIGN_ALIAS }, references: [] }],
    ['RESPONSE_CITATION_REFUSED', { citations: { 1: 1 }, references: [] }],
    // references is a list of exact records.
    ['RESPONSE_REFERENCE_REFUSED', { references: { not: 'a list' } }],
    ['RESPONSE_REFERENCE_REFUSED', { references: [{ source_id: FOREIGN_ALIAS, citation_number: 1 }] }],
    ['RESPONSE_REFERENCE_REFUSED', { references: [{ source_id: FOREIGN_ID, citation_number: 1 }] }],
    ['RESPONSE_REFERENCE_REFUSED', { references: [{ source_id: SOURCE_IDS[0] }] }],
    ['RESPONSE_REFERENCE_REFUSED', { references: [{ citation_number: 1 }] }],
    ['RESPONSE_REFERENCE_REFUSED', {
      references: [{ source_id: SOURCE_IDS[0], citation_number: 1, page: 3 }],
    }],
    ['RESPONSE_REFERENCE_REFUSED', {
      references: [{ source_id: SOURCE_IDS[0], citation_number: '1' }],
    }],
    ['RESPONSE_REFERENCE_REFUSED', {
      references: [{ source_id: SOURCE_IDS[0], citation_number: 0 }],
    }],
    ['RESPONSE_REFERENCE_REFUSED', {
      references: [{
        source_id: SOURCE_IDS[0], citation_number: 1, cited_text: 'x'.repeat((64 * 1024) + 1),
      }],
    }],
    ['RESPONSE_REFERENCE_REFUSED', {
      references: [{ source_id: SOURCE_IDS[0], citation_number: 1, cited_text: 7 }],
    }],
    // cited_table declares its own width and stays bounded plain own data.
    ['RESPONSE_REFERENCE_REFUSED', {
      references: [{
        source_id: SOURCE_IDS[0],
        citation_number: 1,
        cited_table: { num_columns: 2, rows: [['ragged']] },
      }],
    }],
    ['RESPONSE_REFERENCE_REFUSED', {
      references: [{
        source_id: SOURCE_IDS[0],
        citation_number: 1,
        cited_table: { num_columns: 1, rows: [[7]] },
      }],
    }],
    ['RESPONSE_REFERENCE_REFUSED', {
      references: [{
        source_id: SOURCE_IDS[0],
        citation_number: 1,
        cited_table: { num_columns: 1, rows: [['ok']], caption: 'DRIFT' },
      }],
    }],
    ['RESPONSE_REFERENCE_REFUSED', {
      references: [{
        source_id: SOURCE_IDS[0],
        citation_number: 1,
        cited_table: { num_columns: 1, rows: wideRows },
      }],
    }],
    ['RESPONSE_REFERENCE_REFUSED', {
      references: [{
        source_id: SOURCE_IDS[0],
        citation_number: 1,
        cited_table: { num_columns: 65, rows: [] },
      }],
    }],
    ['RESPONSE_REFERENCE_REFUSED', {
      references: [{ source_id: SOURCE_IDS[0], citation_number: 1, cited_table: [] }],
    }],
    // Every reference number must bind to the citation mapping, and bind only once.
    ['RESPONSE_CITATION_BINDING_REFUSED', {
      references: [{ source_id: SOURCE_IDS[0], citation_number: 9 }],
    }],
    ['RESPONSE_CITATION_BINDING_REFUSED', {
      references: [{ source_id: SOURCE_IDS[1], citation_number: 1 }],
    }],
    ['RESPONSE_CITATION_BINDING_REFUSED', {
      references: [
        { source_id: SOURCE_IDS[0], citation_number: 1 },
        { source_id: SOURCE_IDS[0], citation_number: 1 },
      ],
    }],
    // sources_used stays a unique subset of the requested four.
    ['RESPONSE_SOURCE_DRIFT', { sources_used: [SOURCE_IDS[0], SOURCE_IDS[0]] }],
    ['RESPONSE_SOURCE_DRIFT', { sources_used: [FOREIGN_ALIAS] }],
    // A uuid that is not one of the bound identifiers is refused wherever it hides.
    ['RESPONSE_IDENTIFIER_DRIFT', { answer: `${ANSWER_CANARY} ${FOREIGN_ID}` }],
  ];

  for (const [expected, overrides] of cases) {
    const root = makeRoot();
    const executor = fakeExecutor({ stdout: responseStdout(overrides) });
    const report = captureSeCoreNotebookQuery(baseRequest(root), dependencies(executor.execute));
    assert.equal(report.result, 'HOLD', `${expected} should hold`);
    assert.deepEqual(report.issues, [expected]);
    assert.equal(report.citation_count, null);
    assert.equal(report.reference_count, null);
    const serialised = JSON.stringify(report);
    for (const canary of [ANSWER_CANARY, CITATION_CANARY, TABLE_CANARY, FOREIGN_ID, FOREIGN_ALIAS]) {
      assert.equal(serialised.includes(canary), false);
    }
    assert.equal(captureQaInteraction({ root_path: root, command: 'query' }).counts.answer_received, 0);
  }

  // An own `__proto__` data key is a nested key the record does not allow.
  const polluted = makeRoot();
  const injected = fakeExecutor({
    stdout: Buffer.from(
      JSON.stringify(responseDocument())
        .replace('"citation_number":1', '"citation_number":1,"__proto__":{"polluted":true}'),
      'utf8',
    ),
  });
  const pollutedReport = captureSeCoreNotebookQuery(
    baseRequest(polluted),
    dependencies(injected.execute),
  );
  assert.deepEqual(pollutedReport.issues, ['RESPONSE_REFERENCE_REFUSED']);
  assert.equal({}.polluted, undefined);
});

test('malformed, drifting, oversized, timed out, and failing responses all hold without echo', () => {
  const cases = [
    ['RESPONSE_SCHEMA_REFUSED', { stdout: Buffer.from('not json at all', 'utf8') }],
    ['RESPONSE_SCHEMA_REFUSED', { stdout: responseStdout({ extra_field: 'DRIFT' }) }],
    ['RESPONSE_SCHEMA_REFUSED', {
      stdout: Buffer.from(JSON.stringify((() => {
        const { references: _dropped, ...rest } = responseDocument();
        return rest;
      })()), 'utf8'),
    }],
    ['RESPONSE_QUESTION_DRIFT', {
      stdout: responseStdout({ question: `${QUESTION_TEXT} and one silently appended clause` }),
    }],
    ['RESPONSE_CONVERSATION_DRIFT', {
      stdout: responseStdout({ conversation_id: OTHER_CONVERSATION_ID }),
    }],
    ['RESPONSE_SOURCE_DRIFT', { stdout: responseStdout({ sources_used: [SOURCE_IDS[0], FOREIGN_ID] }) }],
    ['RESPONSE_ANSWER_REFUSED', { stdout: responseStdout({ answer: '' }) }],
    ['PROVIDER_QUERY_TIMED_OUT', { timed_out: true }],
    ['PROVIDER_QUERY_FAILED', { status: 1 }],
    ['PROVIDER_QUERY_FAILED', { throws: true }],
    ['PROVIDER_OUTPUT_REFUSED', { stdout: Buffer.alloc((1024 * 1024) + 1, 0x61) }],
    ['PROVIDER_OUTPUT_REFUSED', { stderr: Buffer.alloc((64 * 1024) + 1, 0x62) }],
  ];

  for (const [expected, options] of cases) {
    const root = makeRoot();
    const executor = fakeExecutor(options);
    const report = captureSeCoreNotebookQuery(baseRequest(root), dependencies(executor.execute));
    assert.equal(report.result, 'HOLD', `${expected} should hold`);
    assert.deepEqual(report.issues, [expected]);
    assert.equal(report.answer_sha256, null);
    const serialised = JSON.stringify(report);
    for (const canary of [ANSWER_CANARY, CITATION_CANARY, FOREIGN_ID, 'not json at all']) {
      assert.equal(serialised.includes(canary), false);
    }
    // The question turn survives; no fabricated answer is ever appended.
    const events = captureQaInteraction({ root_path: root, command: 'query' });
    assert.equal(events.counts.question_recorded, 1);
    assert.equal(events.counts.answer_received, 0);
  }
});

test('a refusal after the query reports that the query was attempted and the real ledger state', () => {
  const root = makeRoot();
  const executor = fakeExecutor({ timed_out: true });
  const report = captureSeCoreNotebookQuery(baseRequest(root), dependencies(executor.execute));

  assert.equal(report.result, 'HOLD');
  assert.deepEqual(report.issues, ['PROVIDER_QUERY_TIMED_OUT']);
  assert.equal(executor.calls.length, 1);
  assert.equal(report.query_performed, true);
  assert.equal(report.question_sha256, QUESTION_SHA256);
  assert.equal(report.appended_event_count, 1);
  assert.deepEqual(ledgerState(root), {
    event_count: report.event_count,
    ledger_sha256: report.ledger_sha256,
    head_event_hash: report.head_event_hash,
  });
  assert.equal(report.event_count, 1);
  assert.equal(report.answer_sha256, null);
  assert.equal(report.response_artifact_sha256, null);

  // A refusal raised by the executor itself is still an attempted query.
  const thrown = makeRoot();
  const exploding = fakeExecutor({ throws: true });
  const thrownReport = captureSeCoreNotebookQuery(
    baseRequest(thrown),
    dependencies(exploding.execute),
  );
  assert.equal(thrownReport.query_performed, true);
  assert.equal(exploding.calls.length, 1);
  assert.equal(thrownReport.event_count, 1);
});

test('a refusal on the resume path reports that no query was attempted', () => {
  const captured = makeRoot();
  assert.equal(
    captureSeCoreNotebookQuery(baseRequest(captured), dependencies(fakeExecutor().execute)).result,
    'PASS',
  );

  // The same recorded attempt resolves stored bytes that no longer validate.
  const resumed = makeRoot();
  cpSync(join(captured, 'private'), join(resumed, 'private'), { recursive: true });
  rmSync(privatePath(resumed, 'response', 'se-q-01', 'attempt-01'));
  writePrivateArtifact(
    resumed, 'response', 'se-q-01', 'attempt-01',
    responseStdout({ citations: [SOURCE_IDS[0]], references: [] }),
  );

  const executor = refusingExecutor();
  const report = captureSeCoreNotebookQuery(baseRequest(resumed), dependencies(executor.execute));
  assert.equal(report.result, 'HOLD');
  assert.deepEqual(report.issues, ['RESPONSE_CITATION_REFUSED']);
  assert.equal(executor.calls.length, 0);
  assert.equal(report.query_performed, false);
  assert.equal(report.question_sha256, QUESTION_SHA256);
  assert.equal(report.appended_event_count, 1);
  assert.equal(report.event_count, 1);
  assert.deepEqual(ledgerState(resumed), {
    event_count: report.event_count,
    ledger_sha256: report.ledger_sha256,
    head_event_hash: report.head_event_hash,
  });

  // An UNKNOWN raised before any query reports the same way.
  const unresolvedRoot = makeRoot();
  cpSync(join(captured, 'private'), join(unresolvedRoot, 'private'), { recursive: true });
  rmSync(privatePath(unresolvedRoot, 'response', 'se-q-01', 'attempt-01'));
  const idle = refusingExecutor();
  const unresolved = captureSeCoreNotebookQuery(
    baseRequest(unresolvedRoot),
    dependencies(idle.execute),
  );
  assert.equal(unresolved.result, 'UNKNOWN');
  assert.equal(unresolved.query_performed, false);
  assert.equal(unresolved.question_sha256, QUESTION_SHA256);
  assert.equal(unresolved.event_count, 1);
  assert.equal(unresolved.appended_event_count, 1);
  assert.equal(idle.calls.length, 0);
});

test('an orphaned recorded outcome closes before any query and never overwrites its bytes', () => {
  for (const kind of ['response', 'failure']) {
    const root = makeRoot();
    const bytes = kind === 'response'
      ? responseStdout()
      : Buffer.from('{"issue_code":"PROVIDER_QUERY_FAILED"}', 'utf8');
    const target = writePrivateArtifact(root, kind, 'se-q-01', 'attempt-01', bytes);

    const executor = fakeExecutor();
    const report = captureSeCoreNotebookQuery(baseRequest(root), dependencies(executor.execute));
    assert.equal(report.result, 'HOLD', `orphaned ${kind} should hold`);
    assert.deepEqual(report.issues, ['ORPHANED_QUERY_OUTCOME']);
    assert.equal(executor.calls.length, 0);
    assert.equal(report.query_performed, false);
    assert.deepEqual(readFileSync(target), bytes);
    assert.equal(existsSync(privatePath(root, 'intent', 'se-q-01', 'attempt-01')), false);
    assert.equal(captureQaInteraction({ root_path: root, command: 'query' }).counts.answer_received, 0);
  }
});

test('an attempt recorded as both answered and failed holds instead of picking one', () => {
  const root = makeRoot();
  const failing = fakeExecutor({ throws: true });
  const failed = captureSeCoreNotebookQuery(baseRequest(root), dependencies(failing.execute));
  assert.equal(failed.result, 'HOLD');
  assert.equal(failing.calls.length, 1);
  assert.equal(existsSync(privatePath(root, 'failure', 'se-q-01', 'attempt-01')), true);

  writePrivateArtifact(root, 'response', 'se-q-01', 'attempt-01', responseStdout());

  const executor = refusingExecutor();
  const report = captureSeCoreNotebookQuery(baseRequest(root), dependencies(executor.execute));
  assert.equal(report.result, 'HOLD');
  assert.deepEqual(report.issues, ['CONFLICTING_QUERY_OUTCOME']);
  assert.equal(executor.calls.length, 0);
  assert.equal(report.query_performed, false);
  assert.equal(captureQaInteraction({ root_path: root, command: 'query' }).counts.answer_received, 0);
});

test('every recorded outcome combination resolves without a second query', () => {
  // Intent plus a failure only: the attempt stays closed.
  const closedRoot = makeRoot();
  const first = fakeExecutor({ throws: true });
  assert.equal(
    captureSeCoreNotebookQuery(baseRequest(closedRoot), dependencies(first.execute)).result,
    'HOLD',
  );
  const closedExecutor = refusingExecutor();
  const closed = captureSeCoreNotebookQuery(
    baseRequest(closedRoot),
    dependencies(closedExecutor.execute),
  );
  assert.equal(closed.result, 'HOLD');
  assert.deepEqual(closed.issues, ['PROVIDER_QUERY_ATTEMPT_CLOSED']);
  assert.equal(closedExecutor.calls.length, 0);

  // Intent plus a response only: the attempt resumes.
  const resumeRoot = makeRoot();
  assert.equal(
    captureSeCoreNotebookQuery(baseRequest(resumeRoot), dependencies(fakeExecutor().execute)).result,
    'PASS',
  );
  const resumeExecutor = refusingExecutor();
  const resumed = captureSeCoreNotebookQuery(
    baseRequest(resumeRoot),
    dependencies(resumeExecutor.execute),
  );
  assert.equal(resumed.result, 'PASS');
  assert.equal(resumed.state, 'resumed');
  assert.equal(resumed.query_performed, false);
  assert.equal(resumeExecutor.calls.length, 0);

  // Intent with neither outcome: unresolved, and still never queried again.
  rmSync(privatePath(closedRoot, 'failure', 'se-q-01', 'attempt-01'));
  const idle = refusingExecutor();
  const unresolved = captureSeCoreNotebookQuery(
    baseRequest(closedRoot),
    dependencies(idle.execute),
  );
  assert.equal(unresolved.result, 'UNKNOWN');
  assert.deepEqual(unresolved.issues, ['UNRESOLVED_QUERY_ATTEMPT']);
  assert.equal(idle.calls.length, 0);
});

test('an unfinished attempt returns UNKNOWN and is never queried a second time', () => {
  const root = makeRoot();
  const first = fakeExecutor({ throws: true });
  const failed = captureSeCoreNotebookQuery(baseRequest(root), dependencies(first.execute));
  assert.equal(failed.result, 'HOLD');
  assert.equal(first.calls.length, 1);
  assert.equal(existsSync(privatePath(root, 'intent', 'se-q-01', 'attempt-01')), true);
  assert.equal(existsSync(privatePath(root, 'response', 'se-q-01', 'attempt-01')), false);

  // A closed failed attempt stays closed.
  const closed = refusingExecutor();
  const closedReport = captureSeCoreNotebookQuery(baseRequest(root), dependencies(closed.execute));
  assert.equal(closedReport.result, 'HOLD');
  assert.deepEqual(closedReport.issues, ['PROVIDER_QUERY_ATTEMPT_CLOSED']);
  assert.equal(closed.calls.length, 0);

  // Remove only the failure marker to model a crash between the intent and any outcome.
  rmSync(privatePath(root, 'failure', 'se-q-01', 'attempt-01'));
  const crashed = refusingExecutor();
  const unresolved = captureSeCoreNotebookQuery(baseRequest(root), dependencies(crashed.execute));
  assert.equal(unresolved.result, 'UNKNOWN');
  assert.deepEqual(unresolved.issues, ['UNRESOLVED_QUERY_ATTEMPT']);
  assert.equal(unresolved.state, 'unresolved_query_attempt');
  assert.equal(crashed.calls.length, 0);
  assert.equal(captureQaInteraction({ root_path: root, command: 'query' }).counts.answer_received, 0);
});

test('a persisted response resumes ledger capture without querying again', () => {
  const captured = makeRoot();
  const executor = fakeExecutor();
  assert.equal(
    captureSeCoreNotebookQuery(baseRequest(captured), dependencies(executor.execute)).result,
    'PASS',
  );

  // Same attempt, same bytes: idempotent, and the provider is not consulted again.
  const repeat = refusingExecutor();
  const again = captureSeCoreNotebookQuery(baseRequest(captured), dependencies(repeat.execute));
  assert.equal(again.result, 'PASS');
  assert.equal(again.state, 'resumed');
  assert.equal(again.query_performed, false);
  assert.equal(again.disposition, 'idempotent');
  assert.equal(again.event_count, 2);
  assert.equal(again.appended_event_count, 0);
  assert.equal(repeat.calls.length, 0);

  // A crash after persisting the response but before recording the answer still recovers.
  const recovered = makeRoot();
  cpSync(join(captured, 'private'), join(recovered, 'private'), { recursive: true });
  const resumer = refusingExecutor();
  const report = captureSeCoreNotebookQuery(baseRequest(recovered), dependencies(resumer.execute));
  assert.equal(report.result, 'PASS');
  assert.equal(report.state, 'resumed');
  assert.equal(report.query_performed, false);
  assert.equal(report.disposition, 'appended');
  assert.equal(report.event_count, 2);
  assert.equal(report.appended_event_count, 2);
  assert.equal(resumer.calls.length, 0);
  assert.equal(captureQaInteraction({ root_path: recovered, command: 'validate' }).result, 'PASS');
});

test('each attempt mints one fresh conversation and a reused conversation is refused', () => {
  const root = makeRoot();
  const first = fakeExecutor();
  assert.equal(
    captureSeCoreNotebookQuery(baseRequest(root), dependencies(first.execute)).result,
    'PASS',
  );

  const reuse = fakeExecutor();
  const refused = captureSeCoreNotebookQuery(
    baseRequest(root, { attempt_id: 'attempt-02' }),
    dependencies(reuse.execute, CONVERSATION_ID),
  );
  assert.equal(refused.result, 'HOLD');
  assert.deepEqual(refused.issues, ['CONVERSATION_ID_REUSED']);
  assert.equal(reuse.calls.length, 0);

  for (const conversationId of [NOTEBOOK_ID, SOURCE_IDS[0], 'not-a-uuid', '']) {
    const minted = fakeExecutor();
    const held = captureSeCoreNotebookQuery(
      baseRequest(root, { attempt_id: 'attempt-03' }),
      dependencies(minted.execute, conversationId),
    );
    assert.equal(held.result, 'HOLD');
    assert.deepEqual(held.issues, ['CONVERSATION_ID_REFUSED']);
    assert.equal(minted.calls.length, 0);
  }

  const second = fakeExecutor({
    stdout: responseStdout({ conversation_id: OTHER_CONVERSATION_ID }),
  });
  const accepted = captureSeCoreNotebookQuery(
    baseRequest(root, { attempt_id: 'attempt-02' }),
    dependencies(second.execute, OTHER_CONVERSATION_ID),
  );
  assert.equal(accepted.result, 'PASS');
  assert.equal(second.calls[0].args[5], OTHER_CONVERSATION_ID);
  assert.equal(captureQaInteraction({ root_path: root, command: 'query' }).event_count, 3);
});

test('conflicting attempt identity and conflicting question bytes hold before any query', () => {
  const root = makeRoot();
  assert.equal(
    captureSeCoreNotebookQuery(baseRequest(root), dependencies(fakeExecutor().execute)).result,
    'PASS',
  );

  const drifted = refusingExecutor();
  const conflict = captureSeCoreNotebookQuery(
    baseRequest(root, { profile: 'another-profile' }),
    dependencies(drifted.execute, OTHER_CONVERSATION_ID),
  );
  assert.equal(conflict.result, 'HOLD');
  assert.deepEqual(conflict.issues, ['ATTEMPT_IDENTITY_CONFLICT']);
  assert.equal(drifted.calls.length, 0);
  assert.equal(conflict.query_performed, false);

  const rewritten = refusingExecutor();
  const questionConflict = captureSeCoreNotebookQuery(
    baseRequest(root, { question_bytes: Buffer.from('a different question entirely', 'utf8') }),
    dependencies(rewritten.execute, OTHER_CONVERSATION_ID),
  );
  assert.equal(questionConflict.result, 'HOLD');
  assert.deepEqual(questionConflict.issues, ['QUESTION_CAPTURE_REFUSED']);
  assert.equal(rewritten.calls.length, 0);
  // The question turn was refused, so no question hash is claimed for it.
  assert.equal(questionConflict.question_sha256, null);
  assert.equal(captureQaInteraction({ root_path: root, command: 'validate' }).result, 'PASS');
});

test('unsafe roots, identifiers, profiles, questions, and timeouts refuse before any query', () => {
  const root = makeRoot();
  const cases = [
    ['EVALUATION_ROOT_REFUSED', { root_path: 'relative/evaluation/root' }],
    ['EVALUATION_ROOT_REFUSED', { root_path: join(root, 'missing-subdirectory') }],
    ['IDENTIFIER_REFUSED', { interaction_id: '../escape' }],
    ['IDENTIFIER_REFUSED', { interaction_id: 'se-q-p26-014' }],
    ['IDENTIFIER_REFUSED', { interaction_id: 'client-847293' }],
    ['IDENTIFIER_REFUSED', { attempt_id: 'attempt-account-owner' }],
    ['IDENTIFIER_REFUSED', { attempt_id: '../../attempt' }],
    ['PROFILE_REFUSED', { profile: '../profile' }],
    ['PROFILE_REFUSED', { profile: 'profile-credential-1' }],
    ['NOTEBOOK_ID_REFUSED', { notebook_id: 'not-a-uuid' }],
    ['SOURCE_ID_SET_REFUSED', { source_ids: [...SOURCE_IDS.slice(0, 3), NOTEBOOK_ID] }],
    ['SOURCE_ID_SET_REFUSED', { source_ids: SOURCE_IDS.slice(0, 3) }],
    ['SCOPE_REFUSED', { scope: 'accepted_context' }],
    ['EVENT_TIME_REFUSED', { event_time: '2026-02-31T00:00:00Z' }],
    ['TIMEOUT_REFUSED', { timeout_seconds: 0 }],
    ['TIMEOUT_REFUSED', { timeout_seconds: 601 }],
    ['QUESTION_BYTES_REFUSED', { question_bytes: Buffer.alloc(0) }],
    ['QUESTION_BYTES_REFUSED', { question_bytes: Buffer.from('--json', 'utf8') }],
    ['QUESTION_BYTES_REFUSED', { question_bytes: Buffer.alloc((16 * 1024) + 1, 0x61) }],
  ];
  for (const [expected, overrides] of cases) {
    const executor = refusingExecutor();
    const report = captureSeCoreNotebookQuery(
      baseRequest(root, overrides),
      dependencies(executor.execute),
    );
    assert.equal(report.result, 'HOLD');
    assert.deepEqual(report.issues, [expected]);
    assert.equal(executor.calls.length, 0);
    assert.equal(JSON.stringify(report).includes('escape'), false);
    // Nothing was staged before the request itself was refused.
    assert.equal(report.query_performed, false);
    assert.equal(report.question_sha256, null);
    assert.equal(report.event_count, null);
    assert.equal(report.appended_event_count, 0);
    assert.equal(report.ledger_sha256, null);
    assert.equal(report.head_event_hash, null);
  }

  const open = captureSeCoreNotebookQuery(
    { ...baseRequest(root), unexpected_field: 'DRIFT' },
    dependencies(refusingExecutor().execute),
  );
  assert.deepEqual(open.issues, ['REQUEST_REFUSED']);
  assert.equal(JSON.stringify(open).includes('DRIFT'), false);
});

test('a private artifact that is the protected ledger by hardlink refuses before any query', (t) => {
  const root = makeRoot();
  assert.equal(captureQaInteraction({ root_path: root, command: 'initialize' }).result, 'PASS');
  const ledger = join(root, 'qa_interaction_ledger.jsonl');
  writeFileSync(ledger, '');
  if (statSync(ledger, { bigint: true }).ino === 0n) {
    t.diagnostic('hardlink identity probe skipped: no usable inode on this filesystem');
    return;
  }
  const target = privatePath(root, 'intent', 'se-q-01', 'attempt-01');
  mkdirSync(dirname(target), { recursive: true });
  try {
    linkSync(ledger, target);
  } catch {
    t.diagnostic('hardlink identity probe skipped: hardlinks unavailable on this filesystem');
    return;
  }
  const executor = refusingExecutor();
  const report = captureSeCoreNotebookQuery(baseRequest(root), dependencies(executor.execute));
  assert.equal(report.result, 'HOLD');
  assert.deepEqual(report.issues, ['PRIVATE_ARTIFACT_COLLISION']);
  assert.equal(executor.calls.length, 0);
});

test('a private lane that escapes the evaluation root by reparse point refuses', (t) => {
  const root = makeRoot();
  const outside = makeRoot();
  const lane = join(root, 'private');
  try {
    symlinkSync(outside, lane, 'junction');
  } catch {
    t.diagnostic('reparse escape probe skipped: junction creation unavailable here');
    return;
  }
  const executor = refusingExecutor();
  const report = captureSeCoreNotebookQuery(baseRequest(root), dependencies(executor.execute));
  assert.equal(report.result, 'HOLD');
  assert.deepEqual(report.issues, ['PRIVATE_REF_REFUSED']);
  assert.equal(executor.calls.length, 0);
  assert.equal(readdirSync(outside).length, 0);
});

test('a populated reparse point inside the intent scan lane refuses before it is read', (t) => {
  const root = makeRoot();
  const outside = makeRoot();
  writeFileSync(join(outside, 'attempt-99.json'), JSON.stringify({
    conversation_id: OTHER_CONVERSATION_ID,
    leaked: OUTSIDE_CANARY,
  }));
  const lane = join(root, 'private', 'notebook_query', 'intent');
  mkdirSync(lane, { recursive: true });

  let flavour = null;
  for (const type of ['junction', 'dir']) {
    try {
      symlinkSync(outside, join(lane, 'se-q-99'), type);
      flavour = type;
      break;
    } catch { /* try the next reparse point flavour this filesystem supports */ }
  }
  if (flavour === null) {
    t.diagnostic('populated reparse probe skipped: no reparse point flavour is creatable here');
    return;
  }
  t.diagnostic(`populated reparse probe ran with a ${flavour} reparse point`);

  const executor = refusingExecutor();
  const report = captureSeCoreNotebookQuery(baseRequest(root), dependencies(executor.execute));
  assert.equal(report.result, 'HOLD');
  assert.deepEqual(report.issues, ['PRIVATE_REF_REFUSED']);
  assert.equal(executor.calls.length, 0);
  assert.equal(report.query_performed, false);
  assert.equal(JSON.stringify(report).includes(OUTSIDE_CANARY), false);
  assert.equal(existsSync(privatePath(root, 'intent', 'se-q-01', 'attempt-01')), false);
});

test('the intent scan reads only bounded plain files inside the evaluation root', () => {
  // A control that always runs, so bounded-read coverage never depends on reparse point support.
  const oversized = makeRoot();
  const oversizedLane = join(oversized, 'private', 'notebook_query', 'intent', 'se-q-99');
  mkdirSync(oversizedLane, { recursive: true });
  writeFileSync(join(oversizedLane, 'attempt-99.json'), Buffer.alloc((1024 * 1024) + 1, 0x61));
  const bounded = refusingExecutor();
  const boundedReport = captureSeCoreNotebookQuery(
    baseRequest(oversized),
    dependencies(bounded.execute),
  );
  assert.equal(boundedReport.result, 'HOLD');
  assert.deepEqual(boundedReport.issues, ['INTENT_ARTIFACT_REFUSED']);
  assert.equal(bounded.calls.length, 0);
  assert.equal(boundedReport.query_performed, false);

  const undecodable = makeRoot();
  const undecodableLane = join(undecodable, 'private', 'notebook_query', 'intent', 'se-q-99');
  mkdirSync(undecodableLane, { recursive: true });
  writeFileSync(join(undecodableLane, 'attempt-99.json'), Buffer.from([0xff, 0xfe, 0x00]));
  const refusing = refusingExecutor();
  const undecodableReport = captureSeCoreNotebookQuery(
    baseRequest(undecodable),
    dependencies(refusing.execute),
  );
  assert.equal(undecodableReport.result, 'HOLD');
  assert.deepEqual(undecodableReport.issues, ['INTENT_ARTIFACT_REFUSED']);
  assert.equal(refusing.calls.length, 0);

  // A recorded conversation in a sibling interaction is still found and refused.
  const populated = makeRoot();
  const populatedLane = join(populated, 'private', 'notebook_query', 'intent', 'se-q-99');
  mkdirSync(populatedLane, { recursive: true });
  writeFileSync(
    join(populatedLane, 'attempt-99.json'),
    JSON.stringify({ conversation_id: CONVERSATION_ID }),
  );
  const reusing = refusingExecutor();
  const reusedReport = captureSeCoreNotebookQuery(
    baseRequest(populated),
    dependencies(reusing.execute),
  );
  assert.equal(reusedReport.result, 'HOLD');
  assert.deepEqual(reusedReport.issues, ['CONVERSATION_ID_REUSED']);
  assert.equal(reusing.calls.length, 0);
});

test('the thin CLI emits redacted metadata only and maps hold and unknown to nonzero exits', () => {
  const root = makeRoot();
  const questionFile = join(root, 'question.txt');
  writeFileSync(questionFile, QUESTION_TEXT);
  const argv = [
    'node', CLI_PATH,
    '--root', root,
    '--interaction-id', 'se-q-01',
    '--scope', 'fixed_benchmark',
    '--attempt-id', 'attempt-01',
    '--event-time', '2026-08-12T01:00:00Z',
    '--question-file', questionFile,
    '--notebook-id', NOTEBOOK_ID,
    '--source-ids', SOURCE_IDS.join(','),
    '--profile', PROFILE,
    '--timeout-seconds', '240',
  ];

  const executor = fakeExecutor();
  const passed = runCli(argv, dependencies(executor.execute));
  assert.equal(passed.exit_code, 0);
  const stdout = passed.stdout.toString('utf8');
  assert.equal(JSON.parse(stdout).result, 'PASS');
  assert.equal(JSON.parse(stdout).citation_count, 2);
  assert.equal(JSON.parse(stdout).reference_count, 2);
  for (const canary of [
    ANSWER_CANARY, CITATION_CANARY, TABLE_CANARY, NOTEBOOK_ID, CONVERSATION_ID, ...SOURCE_IDS,
    QUESTION_TEXT, root, PROFILE,
  ]) {
    assert.equal(stdout.includes(canary), false);
  }

  rmSync(privatePath(root, 'response', 'se-q-01', 'attempt-01'));
  const unresolved = runCli(argv, dependencies(refusingExecutor().execute));
  assert.equal(unresolved.exit_code, 3);
  assert.equal(JSON.parse(unresolved.stdout).result, 'UNKNOWN');

  const missingFlag = runCli(argv.slice(0, -2), dependencies(refusingExecutor().execute));
  assert.equal(missingFlag.exit_code, 2);
  assert.deepEqual(JSON.parse(missingFlag.stdout).issues, ['CLI_ARGUMENT_REFUSED']);

  const unknownFlag = runCli(
    [...argv, '--login', 'true'],
    dependencies(refusingExecutor().execute),
  );
  assert.equal(unknownFlag.exit_code, 2);
  assert.equal(unknownFlag.stdout.toString('utf8').includes('--login'), false);

  const cliSource = readFileSync(CLI_PATH, 'utf8');
  assert.doesNotMatch(cliSource, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/u);
  assert.doesNotMatch(cliSource, /[A-Za-z]:[\\/]/u);
});
