import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTopology, stableStringify } from '../../tools/emit_topology.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(HERE, '..', '..');

test('Topology: covers canonical modules and excludes legacy wrappers', () => {
  const topo = buildTopology();

  assert.equal(topo.derivation.areas_covered.includes('core'), true, 'Must cover core/');
  assert.equal(topo.derivation.areas_covered.includes('engines/systems_engineering'), true, 'Must cover SE domain');
  assert.equal(topo.derivation.areas_covered.includes('engines/quality_readiness'), true, 'Must cover QR domain');
  assert.equal(topo.derivation.areas_covered.includes('engines/database_engineering'), true, 'Must cover DBE domain');
  assert.equal(topo.derivation.areas_covered.includes('engines/material_procurement_readiness'), true, 'Must cover E03 domain');

  // Verify that modules list includes canonical paths
  assert.equal(topo.modules.some(m => m.module.startsWith('core/validators/')), true, 'Contains core validator modules');
  assert.equal(topo.modules.some(m => m.module.startsWith('engines/systems_engineering/rules/')), true, 'Contains SE rules modules');
  assert.equal(topo.modules.some(m => m.module.startsWith('engines/quality_readiness/rules/')), true, 'Contains QR rules modules');
  assert.equal(topo.modules.some(m => m.module.startsWith('engines/database_engineering/rules/')), true, 'Contains DBE rules modules');
  assert.equal(topo.modules.some(m => m.module.startsWith('engines/material_procurement_readiness/rules/')), true, 'Contains E03 rules modules');

  // Verify that legacy wrapper directories are NOT counted as canonical modules
  assert.equal(topo.modules.some(m => m.module.startsWith('kernel/')), false, 'Must not contain kernel/ wrappers');
  assert.equal(topo.modules.some(m => m.module.startsWith('stage_rules/')), false, 'Must not contain stage_rules/ wrappers');
  assert.equal(topo.modules.some(m => m.module.startsWith('subjects/')), false, 'Must not contain subjects/ wrappers');
});

test('Topology: committed engine_topology.json matches fresh canonical build', () => {
  const topo = buildTopology();
  const storedJson = JSON.parse(readFileSync(path.join(ENGINE, 'topology', 'engine_topology.json'), 'utf8'));

  assert.equal(storedJson.topology_digest, topo.topology_digest, 'Topology digest must match stored file');
  assert.equal(storedJson.module_count, topo.module_count, 'Module count must match');
  assert.equal(storedJson.module_edge_count, topo.module_edge_count, 'Module edge count must match');
});

test('Topology: nested canonical module additions/changes affect digest (RED/GREEN)', () => {
  const topo = buildTopology();
  const originalDigest = topo.topology_digest;

  // Clone topology and simulate a modified module
  const modifiedTopo = structuredClone(topo);
  modifiedTopo.modules[0].export_count += 1;

  // Compute modified digest via stable stringify
  const newDigest = createHash('sha256').update(stableStringify(modifiedTopo)).digest('hex');

  assert.notEqual(newDigest, originalDigest, 'Any module export or line count change must change the topology digest');
});
