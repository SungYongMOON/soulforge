// Installs `SKILL.md` (this folder) into a skill directory given by `--out`.
//
// The repository copy is the template: it names `<lane>`, `<config>`,
// `<config sha256>` and `<guideline>` as placeholders, because all four are
// host-local facts that must not live in the public tree. This installer fills
// them in and prints the sha256 of exactly what it wrote.
//
// Modelled on `guild_hall/context_engine/ops/hermes-skill/install_skill.mjs`, with
// two deliberate differences:
//
//   1. It reads nothing but the template. That installer queries a graph database to
//      build a project table; this skill has no such table -- every host-local fact
//      it needs arrives as an argument, so the installer is a pure function of
//      (source bytes, arguments) and `--check` can therefore be an exact byte
//      comparison rather than a fuzzy one.
//   2. The trailer it appends carries no timestamp, for the same reason: a
//      timestamp would make every installed copy differ from every other one and
//      turn `--check` into "it changed" noise. The timestamp lives in the receipt,
//      which is not the installed file.
//
// Four substitutions, and nothing else:
//   1. `'<lane>/`                            -> the lane root the commands run out of.
//   2. `--config '<config>'`                 -> the pinned bot-triage config file.
//   3. `--config-sha256 '<config sha256>'`   -> that file's digest.
//   4. `'<guideline>'`                       -> the Owner's private classification
//      guideline document, which the skill tells the bot to read before deciding.
//
// The prose sentence that EXPLAINS the placeholders names them bare (`<lane>`,
// without the quote/slash), so it survives substitution and still reads correctly in
// the installed copy -- the same convention the context-engine installer uses.
//
// Every path is written with forward slashes inside single quotes, because the
// Hermes `terminal` tool runs its command through Git Bash on Windows: a backslash
// there is an escape character, so a Windows-style path reaches node with its
// separators eaten and fails as `Cannot find module`.
//
// usage:
//   node install_skill.mjs --lane <lane root> --config <file> --config-sha256 sha256:<...>
//        --guideline <file> --out <skill directory> [--source <SKILL.md>]
//        [--receipt <file>] [--dry-run]
//   node install_skill.mjs --check --lane ... --config ... --config-sha256 ...
//        --guideline ... --out <skill directory> [--source <SKILL.md>]
//
// Exit codes: 0 ok (or `--check` matched); 2 bad arguments or a broken template;
// 3 `--check` found the installed copy different from what these arguments render.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SKILL_INSTALL_SCHEMA = 'soulforge.workspace_ledgers_bot_skill_install_receipt.v1';
export const INSTALLED_FILE_NAME = 'SKILL.md';
const SHA256_PIN = /^sha256:[0-9a-f]{64}$/u;
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export class SkillInstallError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'SkillInstallError';
    this.code = code;
    this.detail = detail ?? null;
  }
}
const fail = (code, detail) => { throw new SkillInstallError(code, detail); };

/** Git Bash reads the command line: a Windows path survives only quoted, with forward slashes. */
export const shellPath = value => String(value).replaceAll('\\', '/').replace(/\/+$/u, '');

const LANE_NEEDLE = "'<lane>/";
const CONFIG_NEEDLE = "--config '<config>'";
const CONFIG_SHA_NEEDLE = "--config-sha256 '<config sha256>'";
const GUIDELINE_NEEDLE = "'<guideline>'";
const NEEDLES = Object.freeze([LANE_NEEDLE, CONFIG_NEEDLE, CONFIG_SHA_NEEDLE, GUIDELINE_NEEDLE]);

/**
 * Renders the installed copy. A pure function of the template bytes and the
 * arguments -- no clock, no filesystem, no network -- so two installs from the same
 * inputs are byte-identical and `--check` can compare exactly.
 */
export function renderInstalledSkill({ source, lane, configPath, configSha256, guideline, sourceSha256 }) {
  for (const needle of NEEDLES) {
    if (!source.includes(needle)) fail('skill_template_placeholder_missing', needle);
  }
  if (!SHA256_PIN.test(String(configSha256))) fail('skill_install_config_sha256_invalid');
  const body = source
    .replaceAll(LANE_NEEDLE, `'${shellPath(lane)}/`)
    .replaceAll(CONFIG_NEEDLE, `--config '${shellPath(configPath)}'`)
    .replaceAll(CONFIG_SHA_NEEDLE, `--config-sha256 '${configSha256}'`)
    .replaceAll(GUIDELINE_NEEDLE, `'${shellPath(guideline)}'`);
  for (const needle of NEEDLES) {
    if (body.includes(needle)) fail('skill_template_placeholder_left', needle);
  }
  return `${body.replace(/\n+$/u, '\n')}\n<!-- installed from ${INSTALLED_FILE_NAME} ${sourceSha256} -->\n`;
}

function options(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) fail('skill_install_unexpected_argument', token);
    const name = token.slice(2);
    const next = argv[index + 1];
    const value = next === undefined || next.startsWith('--') ? true : (index += 1, next);
    flags.set(name, value);
  }
  return flags;
}

const stringFlag = (flags, name) => (typeof flags.get(name) === 'string' ? flags.get(name) : null);

export function runCli(argv, { stdout = process.stdout, stderr = process.stderr, at = new Date().toISOString() } = {}) {
  let flags;
  try { flags = options(argv); }
  catch (error) { stderr.write(`[install-skill] ${error.code}\n`); return 2; }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const sourcePath = stringFlag(flags, 'source') ?? path.join(here, INSTALLED_FILE_NAME);
  const lane = stringFlag(flags, 'lane');
  const configPath = stringFlag(flags, 'config');
  const configSha256 = stringFlag(flags, 'config-sha256');
  const guideline = stringFlag(flags, 'guideline');
  const outDir = stringFlag(flags, 'out');
  const check = flags.get('check') === true || flags.get('check') === 'true';
  const dryRun = flags.get('dry-run') === true || flags.get('dry-run') === 'true';

  try {
    if (!lane || !configPath || !configSha256 || !guideline || !outDir) fail('skill_install_arguments_required');
    let sourceBytes;
    try { sourceBytes = readFileSync(sourcePath); }
    catch { fail('skill_install_source_unreadable', path.basename(sourcePath)); }
    const sourceSha256 = sha256(sourceBytes);
    const rendered = renderInstalledSkill({
      source: sourceBytes.toString('utf8'), lane, configPath, configSha256, guideline, sourceSha256,
    });
    const bytes = Buffer.from(rendered, 'utf8');
    const installedSha256 = sha256(bytes);
    const target = path.join(outDir, INSTALLED_FILE_NAME);

    if (check) {
      const present = existsSync(target);
      const actual = present ? sha256(readFileSync(target)) : null;
      const match = present && actual === installedSha256;
      const receipt = {
        schema_version: SKILL_INSTALL_SCHEMA, at, mode: 'check', match, installed_present: present,
        target: shellPath(target), expected_sha256: installedSha256, actual_sha256: actual,
        source: shellPath(path.resolve(sourcePath)), source_sha256: sourceSha256,
      };
      stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
      writeReceiptFile(flags, receipt, false);
      return match ? 0 : 3;
    }

    const before = existsSync(target) ? sha256(readFileSync(target)) : null;
    if (!dryRun) {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(target, bytes);
    }
    const receipt = {
      schema_version: SKILL_INSTALL_SCHEMA, at, mode: 'install', dry_run: dryRun,
      lane: shellPath(lane), config: shellPath(configPath), config_sha256: configSha256,
      guideline: shellPath(guideline), target: shellPath(target),
      existed: before !== null, sha256_before: before, sha256_after: installedSha256,
      source: shellPath(path.resolve(sourcePath)), source_sha256: sourceSha256,
    };
    stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    writeReceiptFile(flags, receipt, dryRun);
    return 0;
  } catch (error) {
    stderr.write(`[install-skill] ${error?.code ?? 'skill_install_failed'}${error?.detail ? `: ${error.detail}` : ''}\n`);
    return 2;
  }
}

function writeReceiptFile(flags, receipt, dryRun) {
  const receiptPath = stringFlag(flags, 'receipt');
  if (!receiptPath || dryRun) return;
  mkdirSync(path.dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli(process.argv.slice(2));
}
