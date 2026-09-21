// R-1 (fresh-review-4): a raw NUL/0x1F byte inside src/classifier.mjs made git treat
// the whole file as binary (`git show --stat` says "Bin", `git diff` prints "Binary
// files differ", grep tools return nothing from it) -- an editing tool had turned a
// typed regex-escape-looking construct into an actual control byte instead of a
// JS-level escape/`String.fromCharCode` call. A stray U+200B (zero-width space) in a
// src/mail_events.mjs comment was a related, quieter version of the same class of
// problem (invisible in an editor, invisible in a diff, but present in the tracked
// byte stream). This test scans every file `git ls-files` reports as tracked under
// this module for either class of problem, so a future edit that reintroduces one
// fails CI instead of silently shipping an opaque blob or an invisible character.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// tests/ -> workspace_ledgers/ -> guild_hall/ -> repo root
const REPO_ROOT = path.resolve(HERE, '../../..');
const MODULE_REL = 'guild_hall/workspace_ledgers';

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', MODULE_REL], { cwd: REPO_ROOT, encoding: 'utf8' });
  return out.split('\n').map(line => line.trim()).filter(Boolean);
}

/** Tab (9), LF (10) and CR (13) are the only control bytes a text source file legitimately carries. */
const ALLOWED_CONTROL_BYTES = new Set([9, 10, 13]);

function findStrayControlBytes(buffer) {
  const offsets = [];
  for (let index = 0; index < buffer.length; index += 1) {
    const byte = buffer[index];
    if (byte < 32 && !ALLOWED_CONTROL_BYTES.has(byte)) offsets.push({ index, byte });
  }
  return offsets;
}

test('every tracked file under guild_hall/workspace_ledgers is free of stray control bytes (other than tab/LF/CR)', () => {
  const files = trackedFiles();
  assert.ok(files.length > 5, 'sanity: git ls-files should have found this module\'s tracked files');
  const offenders = [];
  for (const relPath of files) {
    const buffer = readFileSync(path.join(REPO_ROOT, relPath));
    const strays = findStrayControlBytes(buffer);
    if (strays.length > 0) offenders.push({ relPath, strays: strays.slice(0, 5) });
  }
  assert.deepEqual(offenders, [], `stray control bytes found: ${JSON.stringify(offenders)}`);
});

test('every tracked file under guild_hall/workspace_ledgers is free of U+200B (zero-width space)', () => {
  const files = trackedFiles();
  const offenders = [];
  for (const relPath of files) {
    const text = readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
    const index = text.indexOf('​');
    if (index !== -1) offenders.push({ relPath, index });
  }
  assert.deepEqual(offenders, [], `U+200B found: ${JSON.stringify(offenders)}`);
});

test('git no longer reports src/classifier.mjs as binary content (a NUL byte sniff, independent of git diff --stat cosmetics)', () => {
  const buffer = readFileSync(path.join(REPO_ROOT, MODULE_REL, 'src/classifier.mjs'));
  assert.equal(buffer.includes(0), false, 'src/classifier.mjs must not contain a raw NUL byte');
  // grep-ability is the practical symptom the review named -- a working-tree read as
  // utf8 text (not latin1/binary fallback) and a successful string search stands in
  // for "grep tools return something from the file".
  const text = buffer.toString('utf8');
  assert.match(text, /CANARY_MISMATCH_CANDIDATES/u);
});
