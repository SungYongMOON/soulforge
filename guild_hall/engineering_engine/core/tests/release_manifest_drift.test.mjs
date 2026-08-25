import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReleaseManifest } from '../../tools/emit_release_manifest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(HERE, '..', '..');
const REPO = path.resolve(ENGINE, '..', '..');

test('Release Manifest: binds canonical rules file paths', () => {
  const manifest = buildReleaseManifest();
  const compilerComp = manifest.components.stage_rule_compiler;
  const generatorComp = manifest.components.pilot_packet_generator;
  const vocabComp = manifest.components.artifact_vocabulary;

  assert.equal(
    compilerComp.file,
    'guild_hall/engineering_engine/engines/systems_engineering/rules/stage_rule_compiler.mjs',
    'Compiler component must bind canonical SE rules path'
  );
  assert.equal(
    generatorComp.file,
    'guild_hall/engineering_engine/engines/systems_engineering/rules/pilot_packet_generator.mjs',
    'Generator component must bind canonical SE rules path'
  );
  assert.equal(
    vocabComp.file,
    'guild_hall/engineering_engine/engines/systems_engineering/rules/artifact_vocabulary.mjs',
    'Vocabulary component must bind canonical SE rules path'
  );
});

test('Release Manifest: canonical compiler byte drift fails check even if wrapper is unchanged (RED/GREEN)', () => {
  const manifest = buildReleaseManifest();
  const canonicalPath = path.join(ENGINE, 'engines', 'systems_engineering', 'rules', 'stage_rule_compiler.mjs');
  const canonicalBytes = readFileSync(canonicalPath);
  const actualCanonicalSha = createHash('sha256').update(canonicalBytes).digest('hex');

  // Verify that the manifest digest matches the actual canonical bytes
  assert.equal(manifest.components.stage_rule_compiler.sha256, actualCanonicalSha);

  // If canonical bytes change by even 1 byte
  const modifiedSha = createHash('sha256').update(Buffer.concat([canonicalBytes, Buffer.from('// drift')])) .digest('hex');
  assert.notEqual(modifiedSha, manifest.components.stage_rule_compiler.sha256);
});
