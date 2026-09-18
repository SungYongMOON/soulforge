#!/usr/bin/env node
// salpi audit CLI. Local only; nothing is sent anywhere.
//
//   project-mail --runtime-root <dir> --workspace-root <dir> --source <gmail|hiworks|o365> --scope-id <id> [--observed-at <utc>]
//   validate     --projection <file>
//   audit        --projection <file> [--previous <file>] [--audited-at <utc>] [--max-receipt-age-seconds <n>]
//   check-report --projection <file> --report <file> --audited-at <utc> [--previous <file>] [--max-receipt-age-seconds <n>]
//
// Exit code 0 = OK, 2 = HOLD, 1 = usage error. Output is JSON on stdout. A rejected projection is
// reported by its hold code only; the rejected content is never printed.

import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { projectMailPipeline } from './src/mail_pipeline_projector.mjs';
import { auditMailProjection, validateSalpiAuditReport } from './src/salpi_audit.mjs';
import { validateSafeProjection } from './src/safe_projection.mjs';

const COMMANDS = Object.freeze({
  'project-mail': ['runtime-root', 'workspace-root', 'source', 'scope-id', 'observed-at'],
  validate: ['projection'],
  audit: ['projection', 'previous', 'audited-at', 'max-receipt-age-seconds'],
  'check-report': ['projection', 'report', 'audited-at', 'previous', 'max-receipt-age-seconds'],
});

function usage(message) {
  process.stderr.write(`salpi_audit: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!(command in COMMANDS)) usage('unknown command');
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith('--') || value === undefined) usage('flags take one value each');
    const name = flag.slice(2);
    if (!COMMANDS[command].includes(name)) usage('unknown flag');
    options[name] = value;
  }
  return { command, options };
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    usage('input file is not readable JSON');
    return undefined;
  }
}

const emit = (value, ok) => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  process.exitCode = ok ? 0 : 2;
};

function positiveInt(value) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) usage('max-receipt-age-seconds must be a positive integer');
  return parsed;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === 'project-mail') {
    for (const name of ['runtime-root', 'workspace-root', 'source', 'scope-id']) if (!options[name]) usage(`--${name} is required`);
    const verdict = await projectMailPipeline({
      runtimeRoot: options['runtime-root'],
      workspaceRoot: options['workspace-root'],
      source: options.source,
      scopeId: options['scope-id'],
      observedAt: options['observed-at'],
    });
    if (verdict.status === 'OK') emit(verdict.value, true);
    else emit({ status: 'HOLD', hold_code: verdict.hold_code }, false);
    return;
  }
  if (!options.projection) usage('--projection is required');
  const projection = await readJson(options.projection);
  if (command === 'validate') {
    const verdict = validateSafeProjection(projection);
    emit(verdict.status === 'OK' ? { status: 'OK', digest: verdict.digest } : { status: 'HOLD', hold_code: verdict.hold_code }, verdict.status === 'OK');
    return;
  }
  const previous = options.previous ? await readJson(options.previous) : undefined;
  const maxReceiptAgeSeconds = positiveInt(options['max-receipt-age-seconds']);
  if (command === 'audit') {
    const report = auditMailProjection(projection, { auditedAt: options['audited-at'], maxReceiptAgeSeconds, previous });
    emit(report, report.overall !== 'HOLD');
    return;
  }
  if (!options.report) usage('--report is required');
  if (!options['audited-at']) usage('--audited-at is required: the audit clock belongs to the caller');
  const report = await readJson(options.report);
  const verdict = validateSalpiAuditReport(report, projection, { auditedAt: options['audited-at'], maxReceiptAgeSeconds, previous });
  emit(verdict, verdict.status === 'OK');
}

main().catch(() => {
  process.stderr.write('salpi_audit: failed\n');
  process.exit(1);
});
