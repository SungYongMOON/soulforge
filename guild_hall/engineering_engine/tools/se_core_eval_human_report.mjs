#!/usr/bin/env node
import {
  lstatSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderSeCoreEvalHumanReport } from '../evaluation/se_core_eval_human_report.mjs';

const CLI_SCHEMA = 'soulforge.engineering_engine.se_core_eval_human_report_cli.v1';
const REQUIRED = Object.freeze([
  '--root',
  '--question-set-sha256',
  '--prior-ledger-sha256',
  '--continuation-ledger-sha256',
]);
const OPTIONAL = Object.freeze(['--out']);
const ALLOWED = new Set([...REQUIRED, ...OPTIONAL]);
const HEX64 = /^[0-9a-f]{64}$/;
const WINDOWS_RESERVED = /^(?:nul|con|prn|aux|com[1-9]|lpt[1-9])(?:\.|$)/iu;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(stableValue(value))}\n`, 'utf8');
}

function cliHold(code) {
  return {
    exit_code: 2,
    stdout: jsonBytes({
      schema_version: CLI_SCHEMA,
      result: 'HOLD',
      output_format: 'markdown',
      final_comparison_allowed: false,
      issues: [code],
    }),
  };
}

function parse(argv) {
  if (!Array.isArray(argv) || argv.length < 10 || (argv.length - 2) % 2 !== 0) {
    throw new Error('CLI_ARGUMENT_REFUSED');
  }
  const options = {};
  for (let index = 2; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!ALLOWED.has(name)
        || typeof value !== 'string'
        || value.length === 0
        || value.startsWith('--')
        || Object.hasOwn(options, name)) throw new Error('CLI_ARGUMENT_REFUSED');
    options[name] = value;
  }
  if (!REQUIRED.every((name) => Object.hasOwn(options, name))
      || !Object.keys(options).every((name) => ALLOWED.has(name))
      || !HEX64.test(options['--question-set-sha256'])
      || !HEX64.test(options['--prior-ledger-sha256'])
      || (options['--continuation-ledger-sha256'] !== 'not-recorded'
        && !HEX64.test(options['--continuation-ledger-sha256']))) {
    throw new Error('CLI_ARGUMENT_REFUSED');
  }
  return options;
}

function within(root, candidate) {
  const locator = relative(root, candidate);
  return locator === ''
    || (locator !== '..' && !locator.startsWith(`..${sep}`) && !isAbsolute(locator));
}

function assertCreateOnlyOutput(rootPath, outputPath) {
  if (WINDOWS_RESERVED.test(basename(outputPath))
      || !basename(outputPath).toLowerCase().endsWith('.md')) {
    throw new Error('CLI_OUTPUT_REFUSED');
  }
  let root;
  let parent;
  try {
    root = realpathSync(rootPath);
    if (!statSync(root).isDirectory()) throw new Error('CLI_OUTPUT_REFUSED');
    const requestedTarget = resolve(outputPath);
    parent = realpathSync(dirname(requestedTarget));
    const target = resolve(parent, basename(requestedTarget));
    if (!within(root, target) || !within(root, parent)) throw new Error('CLI_OUTPUT_REFUSED');
    try {
      lstatSync(target);
      throw new Error('CLI_OUTPUT_REFUSED');
    } catch (error) {
      if (error instanceof Error && error.message === 'CLI_OUTPUT_REFUSED') throw error;
    }
    return target;
  } catch (error) {
    if (error instanceof Error && error.message === 'CLI_OUTPUT_REFUSED') throw error;
    throw new Error('CLI_OUTPUT_REFUSED');
  }
}

export function runCli(argv = process.argv) {
  try {
    const options = parse(argv);
    const rendered = renderSeCoreEvalHumanReport({
      root_path: options['--root'],
      expected_question_set_sha256: options['--question-set-sha256'],
      expected_prior_ledger_sha256: options['--prior-ledger-sha256'],
      expected_continuation_ledger_sha256:
        options['--continuation-ledger-sha256'] === 'not-recorded'
          ? null
          : options['--continuation-ledger-sha256'],
    });
    if (rendered.result !== 'PASS') {
      return { exit_code: 2, stdout: jsonBytes(rendered.report) };
    }
    if (Object.hasOwn(options, '--out')) {
      const target = assertCreateOnlyOutput(options['--root'], options['--out']);
      try {
        writeFileSync(target, rendered.markdown_bytes, { flag: 'wx' });
      } catch {
        return cliHold('CLI_CREATE_ONLY_WRITE_REFUSED');
      }
    }
    return { exit_code: 0, stdout: rendered.markdown_bytes };
  } catch (error) {
    const code = error instanceof Error && /^CLI_[A-Z_]+$/.test(error.message)
      ? error.message
      : 'CLI_OPERATION_REFUSED';
    return cliHold(code);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const result = runCli();
  process.stdout.write(result.stdout);
  process.exitCode = result.exit_code;
}
