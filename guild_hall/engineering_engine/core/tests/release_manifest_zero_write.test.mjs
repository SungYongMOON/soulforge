import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(HERE, '..', '..');
const TRACKED_RELEASE = path.join(ENGINE, 'topology', 'engine_release.json');

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

test('Release Manifest: importing emitter module performs ZERO writes and causes no drift to tracked file', async () => {
  const beforeSha = sha256(TRACKED_RELEASE);
  const beforeContent = readFileSync(TRACKED_RELEASE, 'utf8');

  // Dynamic import of the release manifest module
  const releaseMod = await import('../../tools/emit_release_manifest.mjs');

  const manifest = releaseMod.buildReleaseManifest();
  assert.equal(typeof manifest, 'object');
  assert.equal(manifest.engine_version, '0.0.0');

  // Verify tracked release file remains completely untouched
  const afterSha = sha256(TRACKED_RELEASE);
  const afterContent = readFileSync(TRACKED_RELEASE, 'utf8');
  assert.equal(afterSha, beforeSha, 'Tracked engine_release.json sha256 must not change on module import');
  assert.equal(afterContent, beforeContent, 'Tracked engine_release.json content must remain byte-identical');
});

test('Release Manifest: pure check helper operates safely against temporary outputs', async () => {
  const releaseMod = await import('../../tools/emit_release_manifest.mjs');
  const tempDir = mkdtempSync(path.join(tmpdir(), 'release_zero_write_'));
  const tempRelease = path.join(tempDir, 'engine_release.json');

  try {
    const manifest = releaseMod.buildReleaseManifest();
    const stamped = releaseMod.stamp(manifest);
    writeFileSync(tempRelease, JSON.stringify(stamped, null, 2) + '\n', 'utf8');

    const checkRes = releaseMod.checkReleaseManifest(tempRelease, manifest);
    assert.equal(checkRes.ok, true, 'Check against stamped manifest must succeed');
    assert.equal(checkRes.identity_valid, true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
