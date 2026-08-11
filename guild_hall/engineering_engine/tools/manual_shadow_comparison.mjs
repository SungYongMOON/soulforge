#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluateManualShadowComparison } from '../evaluation/manual_shadow_comparison.mjs';

function arg(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function safeFailure(code) {
  return {
    schema_version: 'soulforge.engineering_engine.manual_shadow_comparison_report.v0',
    result: 'FAIL',
    claim_ceiling: 'external_advisory_candidate',
    authority: { official_acceptance: false, task_creation: false, baseline_change: false },
    issues: [code],
  };
}

export function runCli(argv = process.argv) {
  const packetRef = arg(argv, '--packet');
  if (!packetRef) return safeFailure('CLI_PACKET_REQUIRED');
  try {
    const packet = JSON.parse(readFileSync(packetRef, 'utf8'));
    const rawExportBytes = {};
    const notebookRef = arg(argv, '--notebook-only-export');
    const hybridRef = arg(argv, '--hybrid-export');
    if (notebookRef) rawExportBytes.notebook_only = readFileSync(notebookRef);
    if (hybridRef) rawExportBytes.hybrid = readFileSync(hybridRef);
    return evaluateManualShadowComparison(packet, { rawExportBytes });
  } catch {
    return safeFailure('CLI_INPUT_UNREADABLE');
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const result = runCli();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.result === 'PASS' ? 0 : 1;
}
