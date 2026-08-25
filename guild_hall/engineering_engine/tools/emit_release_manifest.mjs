#!/usr/bin/env node
// Emits or checks the engine's release manifest (topology/engine_release.json).
//
// The release manifest is the build-time contract that states what code and rule layers
// define this version of the engine. It is NOT emitted per-run — it is updated when the
// engine version bumps or when the compiler / rule layers change, and checked in tests.
//
// Components bound:
//   - engine_version (from topology/ENGINE_VERSION)
//   - engine_code_manifest sha256 (from topology/engine_manifest.sha256)
//   - stage_rule_compiler sha256 + version (canonical engines/systems_engineering/rules/)
//   - pilot_packet_generator sha256 + version (canonical engines/systems_engineering/rules/)
//   - artifact_vocabulary sha256 (canonical engines/systems_engineering/rules/)
//   - rule_layers sha256 (compiled layers from .registry/skills/se_foldertree_generate/codex/assets/compiled/)
//   - prime_overlays sha256 (overlays from compiled/overlays/)
//
// Usage:
//   node tools/emit_release_manifest.mjs [--out topology/engine_release.json]
//   node tools/emit_release_manifest.mjs --check topology/engine_release.json

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(HERE, '..');
const REPO = path.resolve(ENGINE, '..', '..');
const SE_RULES = path.join(ENGINE, 'engines', 'systems_engineering', 'rules');

const sha = (filePath) => createHash('sha256').update(readFileSync(filePath)).digest('hex');
const rel = (p) => path.relative(REPO, p).replace(/\\/g, '/');

const versionFile = path.join(ENGINE, 'topology', 'ENGINE_VERSION');
const version = existsSync(versionFile) ? readFileSync(versionFile, 'utf8').trim() : '0.0.0';

const compiledDir = path.join(REPO, '.registry', 'skills', 'se_foldertree_generate', 'codex', 'assets', 'compiled');
const layers = {};
if (existsSync(compiledDir)) {
  for (const f of readdirSync(compiledDir).filter((f) => f.endsWith('.json')).sort()) {
    const j = JSON.parse(readFileSync(path.join(compiledDir, f), 'utf8'));
    layers[j.support_key || f] = {
      file: rel(path.join(compiledDir, f)),
      spec_version: j.spec_version ?? null,
      spec_sha256: j.spec_sha256 ?? null,
      compiled_sha256: sha(path.join(compiledDir, f)),
    };
  }
}

const overlays = {};
const ovDir = path.join(compiledDir, 'overlays');
if (existsSync(ovDir)) {
  for (const f of readdirSync(ovDir).filter((f) => f.endsWith('.json')).sort()) {
    overlays[f] = { file: rel(path.join(ovDir, f)), sha256: sha(path.join(ovDir, f)) };
  }
}

const compiler = await import(pathToFileURL(path.join(SE_RULES, 'stage_rule_compiler.mjs')).href);
const generator = await import(pathToFileURL(path.join(SE_RULES, 'pilot_packet_generator.mjs')).href);

export function buildReleaseManifest() {
  return {
    schema_version: 'soulforge.engine_release_manifest.v0',
    engine_version: version,
    status: version === '0.0.0' ? 'under_construction' : 'released',
    generated_at: null,
    generated_from_commit: null,
    git_commit: null,
    components: {
      engine_code_manifest: {
        file: rel(path.join(ENGINE, 'topology', 'engine_manifest.sha256')),
        sha256: sha(path.join(ENGINE, 'topology', 'engine_manifest.sha256')),
      },
      stage_rule_compiler: {
        file: rel(path.join(SE_RULES, 'stage_rule_compiler.mjs')),
        version: compiler.COMPILER_VERSION,
        schema: compiler.STAGE_RULE_COMPILER_SCHEMA_VERSION,
        sha256: sha(path.join(SE_RULES, 'stage_rule_compiler.mjs')),
      },
      pilot_packet_generator: {
        file: rel(path.join(SE_RULES, 'pilot_packet_generator.mjs')),
        version: generator.GENERATOR_VERSION,
        schema: generator.PILOT_PACKET_GENERATOR_SCHEMA_VERSION,
        sha256: sha(path.join(SE_RULES, 'pilot_packet_generator.mjs')),
      },
      artifact_vocabulary: {
        file: rel(path.join(SE_RULES, 'artifact_vocabulary.mjs')),
        sha256: sha(path.join(SE_RULES, 'artifact_vocabulary.mjs')),
      },
      rule_layers: layers,
      prime_overlays: overlays,
    },
    note: 'engine_version 0.0.0 = 만드는 중(Owner 2026-08-18). 정본 승격 시 실제 번호 시작. run receipts의 policy_ref는 이 매니페스트의 rule_layers/compiler 지문에서 나온다. generated_from_commit은 emit 시점 base HEAD이며 이 파일을 담는 후속 commit을 self-bind하지 않고, git_commit은 호환 alias다.',
  };
}

const generationCommit = () => {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(); } catch { return null; }
};

export const stamp = (m) => {
  const copy = structuredClone(m);
  const commit = generationCommit();
  copy.generated_at = new Date().toISOString();
  copy.generated_from_commit = commit;
  copy.git_commit = commit;
  return copy;
};

export const strip = (m) => {
  const c = structuredClone(m);
  delete c.generated_at;
  delete c.generated_from_commit;
  delete c.git_commit;
  return c;
};

const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
export const releaseIdentity = (stored) => {
  const generated = has(stored, 'generated_from_commit') ? stored.generated_from_commit : (stored.git_commit ?? null);
  const validCommit = generated === null || /^[0-9a-f]{40}$/.test(generated);
  const aliasesAgree = !has(stored, 'generated_from_commit') || !has(stored, 'git_commit')
    || stored.generated_from_commit === stored.git_commit;
  return { generated, valid: validCommit && aliasesAgree };
};

export function checkReleaseManifest(storedPath, baseManifest = buildReleaseManifest()) {
  const stored = JSON.parse(readFileSync(path.resolve(REPO, storedPath), 'utf8'));
  const identity = releaseIdentity(stored);
  const same = JSON.stringify(strip(stored)) === JSON.stringify(strip(baseManifest));
  const ok = same && identity.valid;
  return {
    ok,
    engine_version: baseManifest.engine_version,
    stored_version: stored.engine_version,
    generated_from_commit: identity.generated,
    identity_valid: identity.valid,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const checkFlag = process.argv.indexOf('--check');
  const outFlag = process.argv.indexOf('--out');
  const checkPath = checkFlag >= 0 ? process.argv[checkFlag + 1] : null;
  const outPath = outFlag >= 0 ? process.argv[outFlag + 1] : null;

  if (checkPath) {
    const result = checkReleaseManifest(checkPath);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } else if (outPath) {
    const manifest = buildReleaseManifest();
    const stamped = stamp(manifest);
    writeFileSync(path.resolve(REPO, outPath), JSON.stringify(stamped, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify({
      written: outPath, engine_version: stamped.engine_version, layers: Object.keys(layers).length,
      overlays: Object.keys(overlays).length, generated_from_commit: stamped.generated_from_commit,
    }, null, 2));
  } else {
    console.error('usage: node tools/emit_release_manifest.mjs [--out <path> | --check <path>]');
    process.exit(2);
  }
}
