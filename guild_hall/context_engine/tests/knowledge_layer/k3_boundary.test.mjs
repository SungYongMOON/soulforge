import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../src/knowledge_layer/', import.meta.url));
test('knowledge runtime has no gold/test imports, dynamic imports, cycles or control bytes', () => {
  const visiting = new Set(), visited = new Set();
  function visit(file) {
    if (visited.has(file)) return;
    assert.ok(!visiting.has(file), 'import cycle: ' + file); visiting.add(file);
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u);
    assert.doesNotMatch(source, /\bimport\s*\(/u, 'no dynamic imports in this runtime');
    for (const match of source.matchAll(/(?:import|export)\s+[\w\s{},*]+from\s*['"]([^'"]+)['"]/gu)) {
      const spec = match[1]; if (spec.startsWith('node:')) continue;
      assert.ok(spec.startsWith('.')); assert.doesNotMatch(spec, /harness|fixtures|examples|tests/iu);
      const target = resolve(dirname(file), spec);
      if (target.startsWith(root)) visit(target);
    }
    visiting.delete(file); visited.add(file);
  }
  for (const name of readdirSync(root).filter(n => n.endsWith('.mjs'))) visit(resolve(root, name));
  assert.ok(visited.size >= 8);
});
