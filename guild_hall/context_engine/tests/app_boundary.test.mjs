import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import * as app from '../src/app.mjs';
// main keeps the pre-APP dev-ERP copies until the HPP-gated caller switch (CTX-S0-G2).
import * as legacyQuery from '../../../ui-workspace/apps/dev-erp/src/accepted_context_query.mjs';
import * as legacyReader from '../../../ui-workspace/apps/dev-erp/src/accepted_context_reader.mjs';
import * as legacyRuntime from '../../../ui-workspace/apps/dev-erp/src/accepted_context_synthetic_runtime.mjs';
import { createT3Fixture, materializeT3 } from '../harness/fixtures/context_memory_t3_fixture.mjs';
import { compareMemoryCandidates } from '../algorithms/memory/ranked_decision_v1.mjs';

const appRoot = new URL('../', import.meta.url);
const cliPath = fileURLToPath(new URL('../src/app.mjs', import.meta.url));

function comparablePack(pack) {
  // Elapsed time and its serialized width vary between real executions.
  const { elapsed_ms, output_characters, ...counters } = pack.metrics;
  assert.ok(Number.isFinite(elapsed_ms) && elapsed_ms >= 0);
  assert.ok(output_characters > 0 && output_characters <= 12000);
  return { ...pack, metrics: counters };
}

function modules(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    return entry.isDirectory() ? modules(target) : entry.name.endsWith('.mjs') ? [target] : [];
  });
}

test('APP source and algorithms have no development harness, gold or ERP imports', () => {
  const source = modules(new URL('src/', appRoot));
  const algorithms = modules(new URL('algorithms/', appRoot));
  assert.ok(source.length > 0 && algorithms.length > 0);
  for (const url of [...source, ...algorithms]) {
    const body = readFileSync(url, 'utf8');
    for (const match of body.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)(['"])([^'"\n]+)\1/g)) {
      const specifier = match[2];
      if (specifier.startsWith('node:')) continue;
      assert.ok(specifier.startsWith('.'), `${url.pathname}: undeclared bare import ${specifier}`);
      const dependency = new URL(specifier, url);
      assert.doesNotMatch(dependency.pathname, /\/(?:harness|tests?|ui-workspace)\/|\/examples\/context-memory\//,
        `${url.pathname}: runtime imported development/evaluation material`);
      if (algorithms.includes(url)) assert.doesNotMatch(dependency.pathname, /\/context_engine\/src\//,
        'algorithms must not own or import admission guards');
    }
  }
  // This is an import boundary check; installed execution has a separate receipt.
});

test('APP entry defaults off and retains old factory and constant exports', () => {
  assert.equal(app.createContextEngineRuntime(), null);
  assert.equal(app.createContextEngineRuntime({}), null);
  assert.equal(app.createContextEngineRuntime({ root: '.', bindingSha256: 'invalid' }), null);
  // Every legacy caller-visible name is served by the APP with the same kind,
  // constant value and uniform refusal envelope, so the later shim switch is compatible.
  for (const legacy of [legacyQuery, legacyReader, legacyRuntime]) {
    for (const [name, value] of Object.entries(legacy)) {
      assert.ok(Object.hasOwn(app, name), name);
      assert.equal(typeof app[name], typeof value, name);
      if (typeof value !== 'function') assert.ok(isDeepStrictEqual(app[name], value), name);
    }
  }
  assert.deepEqual(app.makeUniformNotAvailable(), legacyQuery.makeUniformNotAvailable());
});

test('APP public query and CLI consume accepted bytes with the same legacy result', async () => {
  const x = await materializeT3();
  const options = { root: x.root, bindingSha256: x.bindingSha256, syntheticOnly: true };
  const runtime = app.createContextEngineRuntime(options);
  // The candidate compared through a dev-ERP shim of this same APP factory.
  const legacy = app.createSyntheticAcceptedContextRuntime(options);
  assert.ok(runtime && legacy);
  const result = await runtime.contextPack(x.request);
  assert.equal(result.status, 'PARTIAL');
  assert.ok(result.facts.some(row => row.id === 'D-CURRENT' && row.value === '28V'));
  assert.ok(!result.facts.some(row => ['D-OLD', 'D-WITHDRAWN'].includes(row.id)));
  assert.deepEqual(comparablePack(await legacy.contextPack(x.request)), comparablePack(result));
  const stdout = execFileSync(process.execPath, [cliPath, '--root', x.root,
    '--binding-sha256', x.bindingSha256, '--request-json', JSON.stringify(x.request), '--synthetic-only'],
  { encoding: 'utf8', windowsHide: true, cwd: x.root });
  const cli = JSON.parse(stdout);
  assert.equal(cli.digest, result.digest);
  assert.deepEqual(cli.facts, result.facts);
  x.acl.revoked_actors.push(x.request.actor_ref);
  await x.put('acl.json', x.acl);
  const denied = await runtime.contextPack(x.request);
  assert.equal(denied.status, 'NOT_AVAILABLE');
  assert.equal(denied.metrics.source_body_loads, 0);
  assert.deepEqual(comparablePack(await legacy.contextPack(x.request)), comparablePack(denied));
});

test('algorithm ranking remains behind common ACL, acceptance and current-source guards', async () => {
  const ranked = [{ record: { id: 'F', kind: 'fact' } }, { record: { id: 'D', kind: 'decision' } }];
  assert.deepEqual(ranked.sort(compareMemoryCandidates).map(row => row.record.id), ['D', 'F']);
  for (const failure of ['acl', 'acceptance', 'source']) {
    const x = createT3Fixture();
    if (failure === 'acl') x.state.acl.revoked_actors.add(x.request.actor_ref);
    if (failure === 'acceptance') x.providers.readAcceptedGeneration = async () => null;
    if (failure === 'source') x.state.source.source_revision_refs.pop();
    const pack = app.createAcceptedContextPack({ enabled: true, binding: x.binding,
      providers: x.providers, sourceReadback: x.sourceReadback });
    const result = await pack.query(x.request);
    assert.equal(result.status, 'NOT_AVAILABLE', failure);
    assert.equal(result.facts.length, 0, failure);
    assert.equal(x.readLog.length, 0, `${failure}: denied input reached body loading/algorithm assembly`);
  }
});

test('APP CLI rejects malformed input without exposing request or filesystem contents', () => {
  const result = spawnSync(process.execPath, [cliPath, '--unknown', 'private-marker'],
    { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.ok(result.stderr.trim().length > 0);
  assert.doesNotMatch(result.stderr, /private-marker|Error:|\bat file:/);
});
