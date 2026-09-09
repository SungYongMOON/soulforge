#!/usr/bin/env node
/**
 * Topology v2 check-only CLI.
 *
 *   node topology_v2_cli.mjs check --binding <absolute-path> [--evidence-out <absolute-path>]
 *   node topology_v2_cli.mjs generate --draft <absolute-path> --out <absolute-path>
 *
 * `check` reads the bound resources, builds the preflight_v2 evidence packet
 * and runs the pure judge. It writes nothing outside an optional evidence file
 * and it activates nothing: a green verdict is still `feature_state: off`.
 *
 * `generate` is the author-time leg. It derives the public-safe v2 binding from
 * observed state and writes the completed private binding to `--out`. Freezing
 * that output is what gives every later `check` something to fail against.
 *
 * Output paths are checked against the input's control directory and declared
 * protected roots, including realpath/link checks, then published by an atomic
 * no-replace hard link. The control directory must be owner-protected and stable:
 * pathname APIs cannot exclude an active ancestor replacement between checks.
 *
 * Neither mode prints an absolute path: the private binding holds the paths and
 * stays on the protected control root.
 */

import { randomBytes } from 'node:crypto';
import {
  closeSync, constants, fstatSync, fsyncSync, linkSync, lstatSync, openSync,
  readFileSync, realpathSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateBackupTopologyPreflightV2 } from './preflight_v2.mjs';
import { createTopologyV2ActualPort } from './topology_v2_actual_port.mjs';
import {
  TOPOLOGY_V2_ACTUAL_READER_STATUS,
  TOPOLOGY_V2_PRIVATE_BINDING_SCHEMA,
  TOPOLOGY_V2_RESOURCE_IDS,
  buildTopologyV2Evidence,
  generatePublicBindingV2,
  isSafeRelativePosixPath,
  pathIdentity,
} from './topology_v2_actual_reader.mjs';

export const DRAFT_SCHEMA = 'soulforge.backup_controller.topology_v2_private_binding_draft.v0';

function usage() {
  process.stderr.write(
    'usage: node topology_v2_cli.mjs check --binding <absolute-path> [--evidence-out <absolute-path>]\n'
    + '       node topology_v2_cli.mjs generate --draft <absolute-path> --out <absolute-path>\n',
  );
  process.exit(2);
}

function flag(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? null : (argv[index + 1] ?? null);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function utcMs(date) {
  return `${date.toISOString().slice(0, 19)}.${String(date.getUTCMilliseconds()).padStart(3, '0')}Z`;
}

function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function collectForbiddenRoots(bindingOrDraft) {
  const roots = [];
  if (isPlainObject(bindingOrDraft?.resources)) {
    for (const resource of Object.values(bindingOrDraft.resources)) {
      if (typeof resource?.path === 'string' && resource.path.length > 0) {
        roots.push(resolve(resource.path));
      }
    }
  }
  if (typeof bindingOrDraft?.installed_pack?.installed_root_path === 'string'
    && bindingOrDraft.installed_pack.installed_root_path.length > 0) {
    roots.push(resolve(bindingOrDraft.installed_pack.installed_root_path));
  }
  return roots;
}

function isInsideOrEqual(parentPath, targetPath, platform = process.platform) {
  const parentId = pathIdentity(resolve(parentPath), platform);
  const targetId = pathIdentity(resolve(targetPath), platform);
  return targetId === parentId || targetId.startsWith(`${parentId}/`);
}

function plainDirectoryIdentity(directory, platform) {
  const absolute = resolve(directory);
  const real = realpathSync.native(absolute);
  if (pathIdentity(real, platform) !== pathIdentity(absolute, platform)) throw new Error('directory resolution drift');
  for (let cursor = absolute; ; cursor = dirname(cursor)) {
    const stat = lstatSync(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('directory link or kind mismatch');
    if (dirname(cursor) === cursor) break;
  }
  return pathIdentity(real, platform);
}

function entryExists(path) {
  try { lstatSync(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export function validateOutputDestination({
  destination,
  approvedControlDir,
  forbiddenRoots = [],
  platform = process.platform,
}) {
  if (typeof destination !== 'string' || !isAbsolute(destination)
    || !isSafeRelativePosixPath(basename(destination))
    || typeof approvedControlDir !== 'string' || !isAbsolute(approvedControlDir)) {
    return { ok: false, code: 'DESTINATION_INVALID', message: 'output destination must be a non-empty string' };
  }
  const destResolved = resolve(destination);
  const approvedResolved = resolve(approvedControlDir);

  const destId = pathIdentity(destResolved, platform);
  const approvedId = pathIdentity(approvedResolved, platform);

  // Must be strictly inside approved control directory (not outside, and not equal to the directory itself)
  if (!destId.startsWith(`${approvedId}/`) || destId === approvedId) {
    return {
      ok: false,
      code: 'CONFINEMENT_ESCAPE',
      message: 'output path outside approved control directory',
    };
  }

  // Check forbidden/protected/canonical roots
  for (const forbidden of forbiddenRoots) {
    if (isInsideOrEqual(forbidden, destResolved, platform) || isInsideOrEqual(destResolved, forbidden, platform)) {
      return {
        ok: false,
        code: 'PROTECTED_ROOT_VIOLATION',
        message: 'output path targets protected or canonical root',
      };
    }
    if (isInsideOrEqual(forbidden, approvedResolved, platform)) {
      return {
        ok: false,
        code: 'APPROVED_CONTROL_DIR_FORBIDDEN',
        message: 'approved control directory inside protected root',
      };
    }
  }

  // Refuse aliases/reparse ancestors, including a link planted below the
  // otherwise legitimate control root. Missing parents are not created here.
  try {
    plainDirectoryIdentity(approvedResolved, platform);
    plainDirectoryIdentity(dirname(destResolved), platform);
    for (const forbidden of forbiddenRoots) {
      // Missing protected targets still retain the lexical fence above.
      let real;
      try { real = realpathSync.native(forbidden); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      if (isInsideOrEqual(real, destResolved, platform)
        || isInsideOrEqual(destResolved, real, platform)
        || isInsideOrEqual(real, approvedResolved, platform)) {
        return { ok: false, code: 'PROTECTED_ROOT_VIOLATION', message: 'output path targets protected or canonical root' };
      }
    }
  } catch {
    return { ok: false, code: 'CONTROL_DIRECTORY_UNSAFE', message: 'output parent is missing, linked, or unresolved' };
  }

  // lstat includes dangling links; publication below also enforces no-replace
  // atomically, so a competing destination after this check is preserved.
  if (entryExists(destResolved)) {
    return {
      ok: false,
      code: 'DESTINATION_EXISTS',
      message: 'output destination already exists (create-only)',
    };
  }

  return { ok: true, resolvedPath: destResolved };
}

export function writeCreateOnlyAtomic({
  destination, content, approvedControlDir, forbiddenRoots = [], linkImpl = linkSync,
}) {
  const checked = validateOutputDestination({ destination, approvedControlDir, forbiddenRoots });
  if (!checked.ok) throw new Error(checked.message);
  const destPath = checked.resolvedPath;
  const destDir = resolve(dirname(destPath));
  const tempName = `.${basename(destPath)}.${process.pid}.${Date.now()}.${randomBytes(6).toString('hex')}.tmp`;
  const tempPath = join(destDir, tempName);
  let descriptor;
  let created;
  try {
    descriptor = openSync(tempPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    created = fstatSync(descriptor);
    writeFileSync(descriptor, content, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    const readbackTemp = readFileSync(tempPath, 'utf8');
    if (readbackTemp !== content) {
      throw new Error('temp readback mismatch');
    }
    const rechecked = validateOutputDestination({ destination: destPath, approvedControlDir, forbiddenRoots });
    if (!rechecked.ok) throw new Error(rechecked.message);
    const staged = lstatSync(tempPath);
    if (!staged.isFile() || staged.isSymbolicLink() || staged.dev !== created.dev
      || staged.ino !== created.ino || staged.nlink !== 1) throw new Error('temp identity changed');
    // Same no-replace publication primitive as the custody/outbox writers.
    // Unlike exists + rename, link fails if any destination wins the race.
    linkImpl(tempPath, destPath);
    const published = lstatSync(destPath);
    if (!published.isFile() || published.isSymbolicLink() || published.dev !== created.dev
      || published.ino !== created.ino) throw new Error('destination identity changed');
    const readbackFinal = readFileSync(destPath, 'utf8');
    if (readbackFinal !== content) {
      throw new Error('destination readback mismatch');
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try {
      // Never remove a replaced entry or follow a changed parent on cleanup.
      plainDirectoryIdentity(destDir, process.platform);
      const remaining = lstatSync(tempPath);
      if (created && remaining.isFile() && !remaining.isSymbolicLink()
        && remaining.dev === created.dev && remaining.ino === created.ino) {
        unlinkSync(tempPath);
      }
    } catch {
      // Preserve uncertain state; never delete a competing destination.
    }
  }
}

function runCli() {
  const [mode, ...argv] = process.argv.slice(2);
  if (!mode) usage();
  const port = createTopologyV2ActualPort();

  if (mode === 'check') {
    const bindingPath = flag(argv, '--binding');
    if (bindingPath === null) usage();
    let privateBinding = null;
    try {
      privateBinding = readJson(bindingPath);
    } catch {
      process.stderr.write('failed to read binding JSON\n');
      process.exit(1);
    }
    const approvedControlDir = dirname(resolve(bindingPath));
    const forbiddenRoots = collectForbiddenRoots(privateBinding);

    const clock = {
      now_utc: utcMs(new Date()),
      current_epoch: privateBinding.binding_epoch,
    };
    const read = buildTopologyV2Evidence({ privateBinding, port, clock });
    if (read.status !== TOPOLOGY_V2_ACTUAL_READER_STATUS.EVIDENCE_READY) {
      process.stdout.write(`${JSON.stringify({
        mode: 'check',
        reader_status: read.status,
        reader_holds: read.holds,
        reader_detail: read.detail,
        preflight_status: null,
      }, null, 2)}\n`);
      process.exit(1);
    }
    const verdict = evaluateBackupTopologyPreflightV2(read.evidence);
    const evidenceOut = flag(argv, '--evidence-out');
    if (evidenceOut !== null) {
      const check = validateOutputDestination({
        destination: evidenceOut,
        approvedControlDir,
        forbiddenRoots,
      });
      if (!check.ok) {
        process.stderr.write(`${check.message}\n`);
        process.exit(1);
      }
      try {
        writeCreateOnlyAtomic({
          destination: check.resolvedPath,
          content: `${JSON.stringify(read.evidence, null, 2)}\n`,
          approvedControlDir,
          forbiddenRoots,
        });
      } catch {
        process.stderr.write('evidence output write failed\n');
        process.exit(1);
      }
    }
    process.stdout.write(`${JSON.stringify({
      mode: 'check',
      reader_status: read.status,
      reader_holds: read.holds,
      preflight_status: verdict.status,
      effect: verdict.effect,
      feature_state: verdict.feature_state,
      activation_authority: verdict.activation_authority,
      backup_run_authorized: verdict.backup_run_authorized,
      evaluated_at: verdict.evaluated_at,
      evaluation_epoch: verdict.evaluation_epoch,
      blockers: verdict.blockers,
      topology: verdict.topology,
      inspected_resource_ids: TOPOLOGY_V2_RESOURCE_IDS,
    }, null, 2)}\n`);
    process.exit(verdict.status === 'PREFLIGHT_OFF_READY' ? 0 : 1);
  } else if (mode === 'generate') {
    const draftPath = flag(argv, '--draft');
    const outPath = flag(argv, '--out');
    if (draftPath === null || outPath === null) usage();
    let draft = null;
    try {
      draft = readJson(draftPath);
    } catch {
      process.stderr.write('failed to read draft JSON\n');
      process.exit(1);
    }
    if (draft?.schema_version !== DRAFT_SCHEMA) {
      process.stderr.write(`draft schema must be ${DRAFT_SCHEMA}\n`);
      process.exit(2);
    }
    const approvedControlDir = dirname(resolve(draftPath));
    const forbiddenRoots = collectForbiddenRoots(draft);

    const check = validateOutputDestination({
      destination: outPath,
      approvedControlDir,
      forbiddenRoots,
    });
    if (!check.ok) {
      process.stderr.write(`${check.message}\n`);
      process.exit(1);
    }

    const skeleton = {
      schema_version: TOPOLOGY_V2_PRIVATE_BINDING_SCHEMA,
      binding_epoch: draft.binding_epoch,
      evaluation_ref: draft.evaluation_ref,
      clock_ref: draft.clock_ref,
      receipt_ref: draft.receipt_ref,
      inspection_refs: draft.inspection_refs,
      installed_pack: draft.installed_pack,
      resources: draft.resources,
      public_binding: null,
    };
    const publicBinding = generatePublicBindingV2({
      privateBinding: skeleton,
      port,
      refs: draft.refs,
      packDigest: draft.installed_pack_digest,
    });
    if (publicBinding === null) {
      process.stderr.write('public binding generation refused: unreadable resource, pack or refs\n');
      process.exit(1);
    }
    skeleton.public_binding = publicBinding;

    try {
      writeCreateOnlyAtomic({
        destination: check.resolvedPath,
        content: `${JSON.stringify(skeleton, null, 2)}\n`,
        approvedControlDir,
        forbiddenRoots,
      });
    } catch {
      process.stderr.write('generate output write failed\n');
      process.exit(1);
    }

    process.stdout.write(`${JSON.stringify({
      mode: 'generate',
      binding_ref: publicBinding.binding_ref,
      binding_digest: publicBinding.binding_digest,
      binding_epoch: publicBinding.binding_epoch,
      installed_pack_ref: publicBinding.installed_controller.installed_pack_ref,
      installed_pack_digest: publicBinding.installed_controller.installed_pack_digest,
      resource_count: TOPOLOGY_V2_RESOURCE_IDS.length,
    }, null, 2)}\n`);
  } else {
    usage();
  }
}

// Run CLI when invoked directly as a script
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try { runCli(); }
  catch {
    process.stderr.write('topology v2 operation failed\n');
    process.exitCode = 1;
  }
}
