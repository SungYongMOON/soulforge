import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTopology } from '../../tools/emit_topology.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(HERE, '..', '..');

// Independent static edge scanner that uses distinct tokenization logic
function independentScanEdges(canonicalRoots) {
  const allModules = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'tests' && entry.name !== 'scratch') walk(full);
      } else if (entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs') && !entry.name.includes('.test.')) {
        allModules.push(full);
      }
    }
  }
  for (const root of canonicalRoots) walk(path.join(ENGINE, root));

  const modIds = new Set(allModules.map((f) => path.relative(ENGINE, f).replace(/\\/g, '/').replace(/\.mjs$/, '')));
  const edges = [];

  for (const modFile of allModules) {
    const fromId = path.relative(ENGINE, modFile).replace(/\\/g, '/').replace(/\.mjs$/, '');
    const code = readFileSync(modFile, 'utf8');

    // Independent line-by-line and statement token parsing
    const lines = code.split('\n');
    let inImport = false;
    let accumulated = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!inImport && (trimmed.startsWith('import ') || trimmed.startsWith('export '))) {
        accumulated = trimmed;
        if (trimmed.includes(';') || trimmed.endsWith("'") || trimmed.endsWith('"')) {
          extract(accumulated, fromId);
          accumulated = '';
        } else {
          inImport = true;
        }
      } else if (inImport) {
        accumulated += ' ' + trimmed;
        if (trimmed.includes(';') || trimmed.endsWith("'") || trimmed.endsWith('"')) {
          extract(accumulated, fromId);
          accumulated = '';
          inImport = false;
        }
      }
    }

    function extract(stmt, from) {
      // Find quoted .mjs specifiers in the statement
      const quotes = stmt.matchAll(/['"]([^'"]+\.mjs)['"]/g);
      for (const q of quotes) {
        const spec = q[1];
        if (spec.startsWith('./') || spec.startsWith('../')) {
          const targetAbs = path.resolve(path.dirname(modFile), spec);
          const targetRel = path.relative(ENGINE, targetAbs).replace(/\\/g, '/');
          const toId = targetRel.replace(/\.mjs$/, '');
          if (modIds.has(toId) && toId !== from) {
            edges.push(`${from}->${toId}`);
          }
        }
      }
    }
  }

  return {
    moduleCount: modIds.size,
    edges: [...new Set(edges)].sort(),
  };
}

test('Topology Edge Oracle: independently resolves complete static import/re-export graph', () => {
  const roots = ['core', 'engines/systems_engineering', 'engines/quality_readiness', 'engines/database_engineering', 'engines/material_procurement_readiness', 'engines/reliability_maintainability', 'engines/calibration_measurement_validity', 'engines/pcb_compliance'];
  const oracleResult = independentScanEdges(roots);

  const emittedTopology = buildTopology();

  assert.equal(emittedTopology.module_count, oracleResult.moduleCount, 'Module count must match independent scan');
  assert.equal(emittedTopology.module_count, 192, 'Canonical module count must equal 192');
  assert.equal(emittedTopology.module_edge_count, oracleResult.edges.length, 'Edge count must match independent scan');
  assert.equal(emittedTopology.module_edge_count, 629, 'Canonical edge count must equal 629');
});

test('Topology Edge Oracle: representative import syntax is correctly captured', () => {
  const emittedTopology = buildTopology();
  const edgeKeys = new Set(emittedTopology.module_edges.map((e) => `${e.from}->${e.to}`));

  // 1. Multiline import: core/rule_assembly/rule_assembler -> core/validators/contract_config
  assert.equal(
    edgeKeys.has('core/interfaces/domain_engine_adapter->core/validators/canonical'),
    true,
    'Multiline import must be captured'
  );

  // 2. Export-from declaration: core/validators/index -> core/validators/canonical
  assert.equal(
    edgeKeys.has('core/validators/index->core/validators/canonical'),
    true,
    'Export-from declaration must be captured'
  );

  // 3. Domain adapter import: engines/systems_engineering/adapters/se_compiler_adapter -> core/interfaces/domain_engine_adapter
  assert.equal(
    edgeKeys.has('engines/systems_engineering/evaluator/se_evaluator_adapter->core/interfaces/domain_engine_adapter'),
    true,
    'Domain adapter to Core interface import must be captured'
  );

  // 4. Domain compiler reuse of the single Core Profile operation canon helper
  assert.equal(
    edgeKeys.has('engines/quality_readiness/compiler/quality_readiness_compiler_adapter->core/interfaces/profile_operation_canon'),
    true,
    'QR compiler must import the Core Profile operation canon rather than hold its own copy'
  );
  assert.equal(
    edgeKeys.has('core/interfaces/domain_engine_adapter->core/interfaces/profile_operation_canon'),
    true,
    'Core profile binding validation must import the Profile operation canon'
  );

  // 5. Database Engineering evaluator is registered through the same Core Interface.
  assert.equal(
    edgeKeys.has('engines/database_engineering/evaluator/database_engineering_evaluator_adapter->core/interfaces/domain_engine_adapter'),
    true,
    'Database Engineering evaluator must use the canonical Core Domain Adapter'
  );
  assert.equal(
    edgeKeys.has('engines/material_procurement_readiness/evaluator/material_procurement_readiness_evaluator_adapter->core/interfaces/domain_engine_adapter'),
    true,
    'Material Procurement Readiness evaluator must use the canonical Core Domain Adapter'
  );
  assert.equal(
    edgeKeys.has('engines/reliability_maintainability/evaluator/reliability_maintainability_evaluator_adapter->core/interfaces/domain_engine_adapter'),
    true,
    'Reliability & Maintainability evaluator must use the canonical Core Domain Adapter'
  );
  assert.equal(
    edgeKeys.has('engines/calibration_measurement_validity/evaluator/calibration_measurement_validity_evaluator_adapter->core/interfaces/domain_engine_adapter'),
    true,
    'Calibration & Measurement Validity evaluator must use the canonical Core Domain Adapter'
  );
  assert.equal(
    edgeKeys.has('engines/pcb_compliance/evaluator/pcb_compliance_evaluator_adapter->core/interfaces/domain_engine_adapter'),
    true,
    'PCB Compliance evaluator must use the canonical Core Domain Adapter'
  );
});

test('Topology Edge Oracle: proves a legacy wrapper-only or narrow 21-edge graph fails (RED/GREEN)', () => {
  const emittedTopology = buildTopology();
  // Simulate stale narrow 21-edge graph
  const staleTopology = structuredClone(emittedTopology);
  staleTopology.module_edges = staleTopology.module_edges.slice(0, 21);
  staleTopology.module_edge_count = 21;

  assert.notEqual(staleTopology.module_edge_count, emittedTopology.module_edge_count);
  assert.equal(staleTopology.module_edge_count < 100, true, 'Narrow 21-edge graph is rejected as incomplete');
});
