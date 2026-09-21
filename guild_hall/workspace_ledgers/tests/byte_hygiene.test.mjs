// R-1 (fresh-review-4): a raw NUL/0x1F byte inside src/classifier.mjs made git treat
// the whole file as binary (`git show --stat` says "Bin", `git diff` prints "Binary
// files differ", grep tools return nothing from it) -- an editing tool had turned a
// typed regex-escape-looking construct into an actual control byte instead of a
// JS-level escape/`String.fromCharCode` call. A stray U+200B (zero-width space) in a
// src/mail_events.mjs comment was a related, quieter version of the same class of
// problem (invisible in an editor, invisible in a diff, but present in the tracked
// byte stream). This test scans every file under this module -- tracked AND
// untracked (fresh-review-5 #1: `git ls-files` alone misses a file that was added but
// never staged/committed) -- for either class of problem, so a future edit that
// reintroduces one fails CI instead of silently shipping an opaque blob or an
// invisible character.
//
// fresh-review-5 #1: the FIRST version of this test embedded a literal U+200B
// character as its own search needle (`text.indexOf('<a literal ZWSP here>')`) --
// which is itself exactly the invisible-byte-in-tracked-source problem this test
// exists to catch, and made the test fail on its own source file. Every needle below
// is built with `String.fromCharCode(...)`, never typed as a literal character, so
// this file can never again reintroduce the class of bug it is checking for.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// tests/ -> workspace_ledgers/ (the module root this scan covers)
const MODULE_ROOT = path.resolve(HERE, '..');

const SKIP_DIR_NAMES = new Set(['node_modules', '.git']);

/** Every regular file under MODULE_ROOT, tracked or not (fresh-review-5 #1). */
function everyModuleFile(dir = MODULE_ROOT, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(name)) continue;
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) { everyModuleFile(full, out); continue; }
    if (stat.isFile()) out.push(full);
  }
  return out;
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

test('every file (tracked or not) under guild_hall/workspace_ledgers is free of stray control bytes (other than tab/LF/CR)', () => {
  const files = everyModuleFile();
  assert.ok(files.length > 5, 'sanity: the module directory should hold more than 5 files');
  const offenders = [];
  for (const filePath of files) {
    const buffer = readFileSync(filePath);
    const strays = findStrayControlBytes(buffer);
    if (strays.length > 0) offenders.push({ relPath: path.relative(MODULE_ROOT, filePath), strays: strays.slice(0, 5) });
  }
  assert.deepEqual(offenders, [], `stray control bytes found: ${JSON.stringify(offenders)}`);
});

// fresh-review-5 #1: every needle is a codepoint built with String.fromCharCode, not
// a literal character typed into this source -- see the file-header note above.
const INVISIBLE_CODEPOINTS = Object.freeze({
  'U+200B (zero-width space)': 0x200b,
  'U+FEFF (BOM / zero-width no-break space)': 0xfeff,
  'U+200C (zero-width non-joiner)': 0x200c,
  'U+200D (zero-width joiner)': 0x200d,
  'U+2060 (word joiner)': 0x2060,
});

test('every file (tracked or not) under guild_hall/workspace_ledgers is free of invisible zero-width/BOM codepoints', () => {
  const files = everyModuleFile();
  const offenders = [];
  for (const filePath of files) {
    const text = readFileSync(filePath, 'utf8');
    for (const [label, codepoint] of Object.entries(INVISIBLE_CODEPOINTS)) {
      const needle = String.fromCharCode(codepoint);
      const index = text.indexOf(needle);
      if (index !== -1) offenders.push({ relPath: path.relative(MODULE_ROOT, filePath), label, index });
    }
  }
  assert.deepEqual(offenders, [], `invisible codepoint(s) found: ${JSON.stringify(offenders)}`);
  // Sanity: the CSV BOM this module WRITES (src/ledgers.mjs's encodeCsv/decodeCsv) is
  // built at runtime from String.fromCharCode(0xFEFF), never embedded as a raw
  // character in tracked source -- so there is genuinely nothing for the scan above
  // to find there, no allow-list needed. Confirmed directly here too.
  const ledgersSource = readFileSync(path.join(MODULE_ROOT, 'src/ledgers.mjs'), 'utf8');
  assert.match(ledgersSource, /String\.fromCharCode\(0xFEFF\)/u);
  assert.equal(ledgersSource.includes(String.fromCharCode(0xfeff)), false);
});

test('git no longer reports src/classifier.mjs as binary content (a NUL byte sniff, independent of git diff --stat cosmetics)', () => {
  const buffer = readFileSync(path.join(MODULE_ROOT, 'src/classifier.mjs'));
  assert.equal(buffer.includes(0), false, 'src/classifier.mjs must not contain a raw NUL byte');
  // grep-ability is the practical symptom the review named -- a working-tree read as
  // utf8 text (not latin1/binary fallback) and a successful string search stands in
  // for "grep tools return something from the file".
  const text = buffer.toString('utf8');
  assert.match(text, /CANARY_MISMATCH_CANDIDATES/u);
});
