// Who decides which mail is a project's, and what happens when that decision
// changes.
//
// The mail text used to decide it here: an event belonged to a project when the
// project code stood alone somewhere in its subject or body. The workspace
// ledgers decide it now -- the Owner's saved subject rules, the bundle table and
// the reading table -- and publish that as an index this side reads by address.
// These tests hold both ends of that: what the index says reaches the grant, what
// it stops saying leaves the grant, and what it deliberately refuses to say
// (a two-project collision, an unresolved hold) reaches nothing at all.
//
// Every root here is a fresh temp directory and every mail is synthetic: invented
// ids, invented subjects, invented addresses.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readRootTable, ROOT_TABLE_SCHEMA } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { grantCandidates } from '../harness/estate_inventory.mjs';
import { scopeChangeByKind } from '../harness/estate_graph_sync.mjs';
import { MAIL_ATTRIBUTION_INDEX_ADDRESS, MAIL_ATTRIBUTION_INDEX_SCHEMA, MailRouteError,
  mailAttributionCounts, mailAttributionFor, readMailAttributionIndex } from '../harness/mail_routes.mjs';

const MAIL_ROOT = 'mail.hiworks.company';
const MINE = 'P26-000', OTHER = 'P24-000';
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

/** One estate: a data root holding the mail custody, a control root holding the index. */
async function estate() {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'ctx-mail-data-'));
  const controlRoot = await mkdtemp(path.join(os.tmpdir(), 'ctx-mail-control-'));
  const tableDir = await mkdtemp(path.join(os.tmpdir(), 'ctx-mail-table-'));
  const tablePath = path.join(tableDir, 'estate_roots.json');
  const bytes = Buffer.from(`${JSON.stringify({ schema_version: ROOT_TABLE_SCHEMA,
    roots: { data_root: dataRoot, control_root: controlRoot } })}\n`);
  await writeFile(tablePath, bytes);
  const io = createAliasedStoreIo(readRootTable({ tablePath, expectedSha256: sha(bytes) }));
  const mailRoot = path.join(dataRoot, 'ingress', 'mail', 'hiworks', 'company');
  await mkdir(path.join(mailRoot, '2026'), { recursive: true });
  await mkdir(path.join(controlRoot, 'mail-routes'), { recursive: true });
  return { dataRoot, controlRoot, io, mailRoot,
    address: 'data_root/ingress/mail/hiworks/company', indexFile: path.join(controlRoot, 'mail-routes', 'mail_attribution_index.json') };
}

// Mail custody as the collector writes it: one jsonl per month under a year folder.
// Not one of these subjects names a project code -- that is the point: the old rule
// would attribute none of them, and the ledgers attribute most of them.
const EVENTS = [
  { event_id: 'e-rule', subject: '착수 회의 일정 안내', body_text: '' },
  { event_id: 'e-bundle', subject: '워크숍 자료 공유', body_text: '' },
  { event_id: 'e-review', subject: '봇이 제안한 건', body_text: '' },
  { event_id: 'e-held', subject: '두 과제 합동 안내', body_text: '' },
  { event_id: 'e-hold', subject: '아직 모르는 건', body_text: '' },
  { event_id: 'e-other', subject: '다른 과제 자료', body_text: '' },
  { event_id: 'e-none', subject: '전혀 무관한 안내', body_text: '' },
];

async function custody(dirs, events = EVENTS) {
  await writeFile(path.join(dirs.mailRoot, '2026', '09.jsonl'),
    `${events.map(row => JSON.stringify({ ...row, received_at: '2026-09-01T01:00:00Z',
      from: [{ name: '', address: 'x@client.example' }], to: [], cc: [], attachments: [] })).join('\n')}\n`);
}

/**
 * An index as the workspace ledgers publish it. Written here by hand rather than
 * built, so these tests hold THIS side's contract (what a reader does with an
 * index) independently of the builder's own tests on the other side.
 */
const ORG_CONFIG_BYTES = Buffer.from('{"synthetic":"org config"}\n');
// The clock every read in this file is judged against, so "fresh" and "stale" are
// properties of the fixture rather than of when the suite happens to run.
const NOW = '2026-09-22T12:00:00Z';

function indexBody(rows, { builtAt = '2026-09-22T06:00:00Z', orgConfigSha = sha(ORG_CONFIG_BYTES),
  ownerTablesMissing = [] } = {}) {
  const attributions = rows.map(([mail_id, projects, strength, basis]) => ({ mail_id, projects, strength, basis }))
    .sort((a, b) => (a.mail_id < b.mail_id ? -1 : 1));
  const byProject = {};
  for (const row of attributions) {
    for (const code of row.projects) {
      byProject[code] ??= { confirmed: 0, unconfirmed: 0 };
      byProject[code][row.strength] += 1;
    }
  }
  const body = { schema_version: MAIL_ATTRIBUTION_INDEX_SCHEMA, built_at: builtAt,
    builder: { id: 'workspace-ledgers-mail-attribution', version: '0.1.0' },
    inputs: { org_config_sha256: orgConfigSha, owner_tables: [], owner_tables_missing: ownerTablesMissing },
    counts: { records: EVENTS.length, attributed: attributions.length,
      confirmed: attributions.filter(row => row.strength === 'confirmed').length,
      unconfirmed: attributions.filter(row => row.strength === 'unconfirmed').length,
      held_two_projects: 0, not_attributed: EVENTS.length - attributions.length, by_project: byProject },
    attributions };
  return { ...body, content_sha256: contentSha(body) };
}

/** The builder's own content digest recipe, restated here so this side pins it too. */
function contentSha(body) {
  const { built_at: _builtAt, content_sha256: _stated, ...rest } = body;
  return sha(Buffer.from(JSON.stringify(rest), 'utf8'));
}

const writeIndex = (dirs, rows, options) =>
  writeFile(dirs.indexFile, `${JSON.stringify(indexBody(rows, options), null, 2)}\n`);

const readIndex = (dirs, extra = {}) =>
  readMailAttributionIndex({ io: dirs.io, now: NOW, ...extra });

const DEFAULT_ROWS = [
  ['e-rule', [MINE], 'confirmed', '제목'],
  ['e-bundle', [MINE], 'confirmed', '묶음 확정'],
  ['e-review', [MINE], 'unconfirmed', '판독(검토 필요)'],
  ['e-other', [OTHER], 'confirmed', '제목'],
];

const candidatesFor = (dirs, index, code = MINE) => grantCandidates({ io: dirs.io, code,
  roots: { [MAIL_ROOT]: dirs.address }, everyCode: [MINE, OTHER], mailAttribution: index });

const mailItemIds = candidates => (candidates.find(source => source.kind === 'mail')?.items ?? [])
  .map(item => item.item_id).sort();

const grantOf = sources => ({ sources: sources.map(source => ({ ...source })) });

test('the ledgers decide, and what they place is exactly what reaches the grant', async () => {
  const dirs = await estate();
  await custody(dirs);
  await writeIndex(dirs, DEFAULT_ROWS);
  const index = readIndex(dirs, { address: MAIL_ATTRIBUTION_INDEX_ADDRESS });

  const mine = candidatesFor(dirs, index);
  assert.deepEqual(mailItemIds(mine), ['e-bundle', 'e-review', 'e-rule']);
  // Not one of those subjects carries a project code: under the old rule this
  // project's grant would have been empty.
  const byText = grantCandidates({ io: dirs.io, code: MINE, roots: { [MAIL_ROOT]: dirs.address }, everyCode: [MINE, OTHER] });
  assert.deepEqual(mailItemIds(byText), []);

  // Every grant item still says where in custody its event actually is.
  const items = mine.find(source => source.kind === 'mail').items;
  assert.ok(items.every(item => Array.isArray(item.path) && item.path.join('/') === '2026/09.jsonl'));

  // The receipt-facing counts, and nothing beyond counts.
  assert.deepEqual(mine.mail, { decided_by: 'workspace_ledgers_attribution_index',
    built_at: '2026-09-22T06:00:00Z', age_hours: 6, index_sha256: index.index_sha256,
    content_sha256: index.content_sha256, owner_tables_missing: [],
    attributed: 3, confirmed: 2, unconfirmed: 1, in_custody: 3 });
  assert.equal(mine.unattributed.mail_events_scanned, EVENTS.length);
  assert.equal(mine.unattributed.mail_events, 3);   // e-held, e-hold, e-none
});

test('a mail lands in exactly the project the ledgers name it for, and in no other store', async () => {
  const dirs = await estate();
  await custody(dirs);
  await writeIndex(dirs, DEFAULT_ROWS);
  const index = readIndex(dirs);
  const mine = mailItemIds(candidatesFor(dirs, index, MINE));
  const other = mailItemIds(candidatesFor(dirs, index, OTHER));
  assert.deepEqual(other, ['e-other']);
  assert.equal(mine.some(id => other.includes(id)), false);
  // A mail the Owner deliberately shares between two projects is the one exception,
  // and it is an explicit decision in their own table, never an accident here.
  await writeIndex(dirs, [...DEFAULT_ROWS, ['e-none', [MINE, OTHER].sort(), 'confirmed', '묶음 확정']]);
  const shared = readIndex(dirs);
  assert.ok(mailItemIds(candidatesFor(dirs, shared, MINE)).includes('e-none'));
  assert.ok(mailItemIds(candidatesFor(dirs, shared, OTHER)).includes('e-none'));
});

test('a two-project collision and an unresolved hold reach no grant at all', async () => {
  const dirs = await estate();
  await custody(dirs);
  // The ledgers simply do not list them: `held`, `hold_owner_review`, `vendor_only`
  // and an Owner-confirmed exclusion all leave the index without a row.
  await writeIndex(dirs, DEFAULT_ROWS);
  const index = readIndex(dirs);
  for (const code of [MINE, OTHER]) {
    const ids = mailItemIds(candidatesFor(dirs, index, code));
    for (const absent of ['e-held', 'e-hold', 'e-none']) assert.equal(ids.includes(absent), false);
  }
});

test('the same index over the same custody proposes the same grant -- nothing to add, nothing to retire', async () => {
  const dirs = await estate();
  await custody(dirs);
  await writeIndex(dirs, DEFAULT_ROWS);
  const first = candidatesFor(dirs, readIndex(dirs));
  const second = candidatesFor(dirs, readIndex(dirs));
  assert.deepEqual(JSON.parse(JSON.stringify(second)), JSON.parse(JSON.stringify(first)));
  assert.deepEqual(scopeChangeByKind(grantOf(first), grantOf(second)),
    { mail: { add: 0, retire: 0, unchanged: 3 } });
});

test('a re-attributed mail is retired from the project it left and added to the one it joined', async () => {
  const dirs = await estate();
  await custody(dirs);
  await writeIndex(dirs, DEFAULT_ROWS);
  const before = readIndex(dirs);
  const mineBefore = candidatesFor(dirs, before, MINE), otherBefore = candidatesFor(dirs, before, OTHER);

  // The Owner corrects the reading table: `e-review` is the other project's, and
  // `e-bundle` turns out to belong to no project at all.
  await writeIndex(dirs, [
    ['e-rule', [MINE], 'confirmed', '제목'],
    ['e-review', [OTHER], 'confirmed', '판독'],
    ['e-other', [OTHER], 'confirmed', '제목'],
  ]);
  const after = readIndex(dirs);
  const mineAfter = candidatesFor(dirs, after, MINE), otherAfter = candidatesFor(dirs, after, OTHER);

  assert.deepEqual(mailItemIds(mineAfter), ['e-rule']);
  assert.deepEqual(mailItemIds(otherAfter), ['e-other', 'e-review']);
  // Said as the pass says it: two retires here, one add there, and nothing silent.
  assert.deepEqual(scopeChangeByKind(grantOf(mineBefore), grantOf(mineAfter)),
    { mail: { add: 0, retire: 2, unchanged: 1 } });
  assert.deepEqual(scopeChangeByKind(grantOf(otherBefore), grantOf(otherAfter)),
    { mail: { add: 1, retire: 0, unchanged: 1 } });
  // And the strength travelled with it: what was unconfirmed for one project is
  // confirmed for the other, because a person decided it in between.
  assert.equal(mailAttributionFor(before, MINE).get('e-review'), 'unconfirmed');
  assert.equal(mailAttributionFor(after, OTHER).get('e-review'), 'confirmed');
  assert.deepEqual(mailAttributionCounts(after, MINE), { attributed: 1, confirmed: 1, unconfirmed: 0 });
});

test('reading an index never writes anything, and a project with no attribution simply has no mail', async () => {
  const dirs = await estate();
  await custody(dirs);
  await writeIndex(dirs, DEFAULT_ROWS);
  const before = (await readdir(dirs.controlRoot)).sort();
  const index = readIndex(dirs);
  const empty = candidatesFor(dirs, index, 'P99-999');
  assert.deepEqual(mailItemIds(empty), []);
  assert.deepEqual(mailAttributionCounts(index, 'P99-999'), { attributed: 0, confirmed: 0, unconfirmed: 0 });
  assert.deepEqual((await readdir(dirs.controlRoot)).sort(), before);
  assert.deepEqual((await readdir(path.join(dirs.mailRoot, '2026'))).sort(), ['09.jsonl']);
});

test('an index this side cannot vouch for whole is refused, not partly used', async () => {
  const dirs = await estate();
  await custody(dirs);
  const refuses = async (body, code) => {
    await writeFile(dirs.indexFile, typeof body === 'string' ? body : `${JSON.stringify(body)}\n`);
    assert.throws(() => readIndex(dirs),
      error => error instanceof MailRouteError && error.code === code, code);
  };
  await refuses('{ not json', 'mail_attribution_index_invalid');
  await refuses({ ...indexBody(DEFAULT_ROWS), schema_version: 'soulforge.something_else.v0' }, 'mail_attribution_index_invalid');
  await refuses({ ...indexBody(DEFAULT_ROWS), built_at: 'yesterday' }, 'mail_attribution_index_invalid');
  // A body edited after the builder signed it off is re-stamped here, so each case
  // below is refused for its OWN reason rather than all of them collapsing into the
  // content-digest check.
  const restamp = body => ({ ...body, content_sha256: contentSha(body) });
  // One bad row refuses the whole file: filing the good rows and dropping this one
  // would read downstream as "that mail was taken away from its project".
  const withBadRow = indexBody(DEFAULT_ROWS);
  withBadRow.attributions[0] = { ...withBadRow.attributions[0], strength: 'probably' };
  await refuses(restamp(withBadRow), 'mail_attribution_index_row_invalid');
  const duplicated = indexBody(DEFAULT_ROWS);
  duplicated.attributions.push({ ...duplicated.attributions[0], projects: [OTHER] });
  duplicated.counts.attributed += 1;
  await refuses(restamp(duplicated), 'mail_attribution_index_duplicate_mail_id');
  const drifted = indexBody(DEFAULT_ROWS);
  drifted.counts.attributed += 7;
  await refuses(restamp(drifted), 'mail_attribution_index_counts_disagree');
  // And a body whose stated content digest is NOT its own -- the case the re-stamp
  // above exists to step around, pinned here in its own right so a file cannot claim
  // decisions it does not carry.
  await refuses({ ...indexBody(DEFAULT_ROWS), content_sha256: sha(Buffer.from('not this body')) },
    'mail_attribution_index_content_digest_mismatch');

  // A pinned digest that no longer matches is a scope change, not a fault to absorb.
  await writeIndex(dirs, DEFAULT_ROWS);
  const held = readIndex(dirs);
  await writeIndex(dirs, DEFAULT_ROWS.slice(0, 1));
  assert.throws(() => readIndex(dirs, { expectedSha256: held.index_sha256 }),
    error => error.code === 'mail_attribution_index_digest_mismatch');

  // And an index that is not there at all refuses rather than reading as "empty".
  const bare = await estate();
  await custody(bare);
  assert.throws(() => readMailAttributionIndex({ io: bare.io, now: NOW }),
    error => error.code === 'mail_attribution_index_unavailable');
});

// ------------------------------------------------------- R3 (fresh review 2026-09-22)
test('R3: an index too old to trust is refused, however cleanly it parses', async () => {
  const dirs = await estate();
  await custody(dirs);
  // Built six hours ago: fine.
  await writeIndex(dirs, DEFAULT_ROWS, { builtAt: '2026-09-22T06:00:00Z' });
  assert.equal(readIndex(dirs).age_hours, 6);

  // Built three days ago. It still parses, every row is valid, and the lane would
  // have gone on re-applying its decisions while every mail collected since read as
  // unattributed -- the exact failure this bound exists to stop.
  await writeIndex(dirs, DEFAULT_ROWS, { builtAt: '2026-09-19T12:00:00Z' });
  assert.throws(() => readIndex(dirs),
    error => error instanceof MailRouteError && error.code === 'mail_attribution_index_stale');
  // A caller that genuinely means to read an old one says so.
  assert.equal(readIndex(dirs, { maxAgeHours: 24 * 7 }).age_hours, 72);

  // Just inside and just outside the default bound.
  await writeIndex(dirs, DEFAULT_ROWS, { builtAt: '2026-09-21T01:00:00Z' });   // 35h
  assert.equal(readIndex(dirs).counts.attributed, 4);
  await writeIndex(dirs, DEFAULT_ROWS, { builtAt: '2026-09-20T23:00:00Z' });   // 37h
  assert.throws(() => readIndex(dirs), error => error.code === 'mail_attribution_index_stale');

  // An index dated well into the future would never expire; refused on its own terms.
  await writeIndex(dirs, DEFAULT_ROWS, { builtAt: '2026-09-25T00:00:00Z' });
  assert.throws(() => readIndex(dirs), error => error.code === 'mail_attribution_index_built_in_future');
  // Ordinary clock skew between two machines is not that.
  await writeIndex(dirs, DEFAULT_ROWS, { builtAt: '2026-09-22T12:02:00Z' });
  assert.equal(readIndex(dirs).counts.attributed, 4);

  // A nonsense bound is refused rather than silently treated as "no bound".
  await writeIndex(dirs, DEFAULT_ROWS);
  for (const bad of [0, -1, Number.NaN]) {
    assert.throws(() => readIndex(dirs, { maxAgeHours: bad }),
      error => error.code === 'mail_attribution_index_max_age_invalid');
  }
});

test('R3: an index built from a different org config than the one on disk is refused', async () => {
  const dirs = await estate();
  await custody(dirs);
  const orgConfigFile = path.join(dirs.controlRoot, 'workspace-ledgers', 'org_config.json');
  await mkdir(path.dirname(orgConfigFile), { recursive: true });
  await writeFile(orgConfigFile, ORG_CONFIG_BYTES);
  const orgConfigAddress = 'control_root/workspace-ledgers/org_config.json';

  await writeIndex(dirs, DEFAULT_ROWS);
  assert.equal(readIndex(dirs, { orgConfigAddress }).counts.attributed, 4);

  // The Owner changes the routing configuration and nobody rebuilds the index. The
  // file is fresh and valid; its decisions were simply made under different rules.
  await writeFile(orgConfigFile, Buffer.from('{"synthetic":"org config, edited"}\n'));
  assert.throws(() => readIndex(dirs, { orgConfigAddress }),
    error => error instanceof MailRouteError && error.code === 'mail_attribution_index_org_config_changed');
  // Without the address the sync cannot know -- which is exactly why the registrar
  // is documented to pass it.
  assert.equal(readIndex(dirs).counts.attributed, 4);

  // A named org config that is not there is refused, never skipped.
  assert.throws(() => readIndex(dirs, { orgConfigAddress: 'control_root/workspace-ledgers/absent.json' }),
    error => error.code === 'mail_attribution_index_org_config_unavailable');
});

test('R3/S1: a pin may name the file’s bytes or the decisions, and the decisions survive a rebuild', async () => {
  const dirs = await estate();
  await custody(dirs);
  await writeIndex(dirs, DEFAULT_ROWS, { builtAt: '2026-09-22T06:00:00Z' });
  const first = readIndex(dirs);

  // Rebuilt an hour later over an unchanged estate: different file, same decisions.
  await writeIndex(dirs, DEFAULT_ROWS, { builtAt: '2026-09-22T07:00:00Z' });
  const second = readIndex(dirs);
  assert.notEqual(second.index_sha256, first.index_sha256);
  assert.equal(second.content_sha256, first.content_sha256);

  // Pinning the decisions still passes; pinning the exact earlier file does not.
  assert.equal(readIndex(dirs, { expectedSha256: first.content_sha256 }).counts.attributed, 4);
  assert.throws(() => readIndex(dirs, { expectedSha256: first.index_sha256 }),
    error => error.code === 'mail_attribution_index_digest_mismatch');
  // The current file's own digest pins it too.
  assert.equal(readIndex(dirs, { expectedSha256: second.index_sha256 }).counts.attributed, 4);
});

test('R3: an index built without an Owner table carries that fact to the receipt', async () => {
  const dirs = await estate();
  await custody(dirs);
  await writeIndex(dirs, DEFAULT_ROWS, { ownerTablesMissing: ['reading', 'vendor'] });
  const index = readIndex(dirs);
  assert.deepEqual([...index.owner_tables_missing], ['reading', 'vendor']);
  // It reaches the per-project scope block, so a pass run against a partial index is
  // visible in its own receipt rather than only in the build log.
  assert.deepEqual(candidatesFor(dirs, index).mail.owner_tables_missing, ['reading', 'vendor']);
});

test('without an index the older narrow rule still applies, and says so', async () => {
  const dirs = await estate();
  await custody(dirs, [{ event_id: 'e-coded', subject: `${MINE} 착수 안내`, body_text: '' },
    { event_id: 'e-plain', subject: '착수 안내', body_text: '' }]);
  const byText = grantCandidates({ io: dirs.io, code: MINE, roots: { [MAIL_ROOT]: dirs.address }, everyCode: [MINE, OTHER] });
  assert.deepEqual(mailItemIds(byText), ['e-coded']);
  assert.equal(byText.mail, undefined);
  assert.match(byText.unattributed.reason, /standalone token/u);
});
