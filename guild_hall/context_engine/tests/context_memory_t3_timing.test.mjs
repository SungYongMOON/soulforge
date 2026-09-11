// Real file IO; wrappers only schedule a mutation at an actual await boundary.
import assert from 'node:assert/strict';
import test from 'node:test';
import fsp from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { basename, join } from 'node:path';
import { materializeT3 } from '../harness/fixtures/context_memory_t3_fixture.mjs';
import { createSyntheticAcceptedContextRuntime } from '../src/adapters/accepted_context_synthetic_runtime.mjs';
// APP CLI main; the dev-ERP haengbogwan delegation is deferred on main (CTX-S0-G2).
import { main } from '../src/app.mjs';

async function atSourceBoundary(x, mode, action) {
  const originalOpen = fsp.open;
  const observed = { opens: 0, loads: 0, bytes: 0, fired: false };
  fsp.open = async function(path, ...args) {
    const fd = await originalOpen.call(this, path, ...args);
    if (!basename(String(path)).startsWith('source-')) return fd;
    observed.opens++;
    const stat = fd.stat.bind(fd); const read = fd.read.bind(fd); const close = fd.close.bind(fd);
    let loaded = false;
    fd.stat = async function(...statArgs) {
      const value = await stat(...statArgs);
      if (mode === 'acl_before_read' && !observed.fired) {
        observed.fired = true;
        x.acl.revoked_actors.push('actor:alpha'); await x.put('acl.json', x.acl);
      }
      return value;
    };
    fd.read = async function(...readArgs) {
      if (!loaded) { observed.loads++; loaded = true; }
      const value = await read(...readArgs);
      observed.bytes += value.bytesRead;
      if (value.bytesRead === 0 && !observed.fired && mode !== 'source_after_close') {
        observed.fired = true;
        if (mode === 'source_after_read') await fsp.writeFile(path, '{}');
        if (mode === 'source_same_size') {
          const original = await fsp.stat(path);
          await fsp.writeFile(path, Buffer.alloc(original.size, 32));
        }
        if (mode === 'binding_after_read') await fsp.appendFile(join(x.root,'binding.json'), ' ');
        if (mode === 'acl_after_read') { x.acl.revoked_actors.push('actor:alpha'); await x.put('acl.json', x.acl); }
      }
      return value;
    };
    fd.close = async function() {
      await close();
      if (mode === 'source_after_close' && !observed.fired) {
        observed.fired = true; await fsp.writeFile(path, '{}');
      }
    };
    return fd;
  };
  syncBuiltinESMExports();
  try { return { pack: await action(), observed }; }
  finally { fsp.open = originalOpen; syncBuiltinESMExports(); }
}

function assertSuppressed(pack, observed) {
  assert.equal(observed.fired, true);
  assert.equal(pack.status, 'NOT_AVAILABLE');
  assert.equal(pack.facts?.length || 0, 0);
  assert.equal(pack.evidence?.length || 0, 0);
  assert.equal(pack.identity, null);
  assert.equal(pack.accepted_generation_ref, null);
  assert.equal(pack.metrics?.source_read_attempts, observed.opens);
  assert.equal(pack.metrics?.source_body_loads, observed.loads);
  assert.equal(pack.metrics?.source_bytes_loaded, observed.bytes);
  assert.equal(pack.boundaries?.source_body_loaded, observed.bytes > 0);
  assert.ok(observed.opens <= 2);
  assert.ok(!JSON.stringify(pack).includes('timeline-span:'));
  assert.ok(!JSON.stringify(pack).includes('source-'));
  assert.equal(pack.metrics.output_characters, [...JSON.stringify(pack)].length + 1);
}

for (const mode of ['source_after_read','acl_before_read','binding_after_read','acl_after_read','source_same_size','source_after_close']) {
  test(`T3 real FD timing: ${mode}`, async () => {
    const x = await materializeT3();
    const runtime = createSyntheticAcceptedContextRuntime({ root:x.root,bindingSha256:x.bindingSha256,syntheticOnly:true });
    const { pack, observed } = await atSourceBoundary(x, mode, () => runtime.contextPack(x.request));
    if (mode === 'acl_before_read') assert.equal(observed.bytes, 0, 'revoked during stat: zero actual source bytes');
    else assert.ok(observed.bytes > 0, 'the original source was really read before mutation');
    assertSuppressed(pack, observed);
  });
}

test('T3 actual existing CLI main suppresses source changed immediately after EOF', async () => {
  const x = await materializeT3(); let stdout = ''; let stderr = '';
  const { pack, observed } = await atSourceBoundary(x, 'source_after_read', async () => {
    const exit = await main(['--root',x.root,'--binding-sha256',x.bindingSha256,'--request-json',JSON.stringify(x.request),'--synthetic-only'],
      { stdout:{ write(s) { stdout += s; } }, stderr:{ write(s) { stderr += s; } } });
    assert.equal(exit,0); assert.equal(stderr,''); return JSON.parse(stdout);
  });
  assertSuppressed(pack, observed);
  assert.equal([...stdout].length,pack.metrics.output_characters);
  assert.ok([...stdout].length <= x.request.budget.max_characters);
});
