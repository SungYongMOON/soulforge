import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const chapters = [
  '01_purpose_and_shape.md',
  '02_source_derivation.md',
  '03_vocabulary_and_quality_boundary.md',
  '04_rule_layers.md',
  '05_compiler_and_profile_bindings.md',
  '06_evaluator_and_error_contract.md',
  '07_metrics_and_availability.md',
  '08_fmeca_and_closure_gaps.md',
  '09_maintainability_spares_support.md',
  '10_runs_replay_zero_write.md',
  '11_decisions_and_holds.md',
  '12_integration_door.md',
];

test('R&M manual has all 12 domain chapters and source-bound boundary links', async () => {
  const manual = await readFile(new URL('../manual/README.md', import.meta.url), 'utf8');
  const packageReadme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const sourcePacket = await readFile(new URL('../contracts/reliability_maintainability_source_packet_v0.md', import.meta.url), 'utf8');

  for (const chapter of chapters) {
    const body = await readFile(new URL(`../manual/${chapter}`, import.meta.url), 'utf8');
    assert.ok(body.startsWith('# '), `${chapter} must have a chapter heading`);
    assert.match(manual, new RegExp(chapter.replace('.', '\\.')));
  }
  assert.match(packageReadme, /candidate/i);
  assert.match(packageReadme, /source_supported/i);
  assert.match(sourcePacket, /NASA-STD-8729\.1A/);
  assert.match(sourcePacket, /GSFC-HDBK-8004/);
  assert.match(sourcePacket, /UNKNOWN\/HOLD/);
});

function markdownFiles(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((entry) => {
    const path = resolve(root, entry);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return path.endsWith('.md') ? [path] : [];
  });
}

test('all R&M package-local Markdown links resolve across README, manual, contracts, and topology', () => {
  const packageRoot = fileURLToPath(new URL('../', import.meta.url));
  const scopes = ['README.md', 'manual', 'contracts', 'topology'];
  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/gu;
  for (const scope of scopes) {
    const path = resolve(packageRoot, scope);
    if (!existsSync(path)) continue;
    const files = statSync(path).isDirectory() ? markdownFiles(path) : [path];
    for (const file of files) {
      const contents = readFileSync(file, 'utf8');
      for (const match of contents.matchAll(linkPattern)) {
        const target = match[1].split('#', 1)[0].split('?', 1)[0];
        if (!target || /^(?:https?:|mailto:)/iu.test(target)) continue;
        assert.equal(existsSync(resolve(dirname(file), target)), true, `${file} -> ${target}`);
      }
    }
  }
});
