// Engine release manifest: one label that binds the pieces a judgment depends on.
//
//   node guild_hall/engineering_engine/tools/emit_release_manifest.mjs --out guild_hall/engineering_engine/topology/engine_release.json
//   node guild_hall/engineering_engine/tools/emit_release_manifest.mjs --check guild_hall/engineering_engine/topology/engine_release.json
//
// The version label lives in topology/ENGINE_VERSION (plain text). While the engine is under construction it is
// 0.0.0 (Owner 2026-08-18); real numbering starts when the engine is promoted to canon. The manifest records, next to
// that label, the identity of every piece a run receipt's policy_ref is derived from: rule specs (sha per compiled
// layer file), overlays, vocabulary, compiler/generator versions, the engine code manifest, and the commit checked
// out when this file was generated. That base commit is not, and cannot be, the later commit that contains this
// generated file. `git_commit` remains a compatibility alias for `generated_from_commit`.
// `--check` recomputes everything except generation metadata and fails on any drift or alias disagreement.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(HERE, '..');
const REPO = path.resolve(ENGINE, '..', '..');
const rel = (p) => path.relative(REPO, p).split(path.sep).join('/');
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const outPath = flag('--out'); const checkPath = flag('--check');
if (!outPath && !checkPath) { console.error('usage: --out <file> | --check <file>'); process.exit(64); }

const versionFile = path.join(ENGINE, 'topology', 'ENGINE_VERSION');
const version = existsSync(versionFile) ? readFileSync(versionFile, 'utf8').trim() : '0.0.0';
const compiledDir = path.join(REPO, '.registry', 'skills', 'se_foldertree_generate', 'codex', 'assets', 'compiled');
const layers = {};
for (const f of readdirSync(compiledDir).filter((f) => f.endsWith('.json')).sort()) {
  const j = JSON.parse(readFileSync(path.join(compiledDir, f), 'utf8'));
  layers[j.support_key || f] = { file: rel(path.join(compiledDir, f)), spec_version: j.spec_version ?? null, spec_sha256: j.spec_sha256 ?? null, compiled_sha256: sha(path.join(compiledDir, f)) };
}
const overlays = {};
const ovDir = path.join(compiledDir, 'overlays');
if (existsSync(ovDir)) for (const f of readdirSync(ovDir).filter((f) => f.endsWith('.json')).sort()) overlays[f] = { file: rel(path.join(ovDir, f)), sha256: sha(path.join(ovDir, f)) };
const compiler = await import(pathToFileURL(path.join(ENGINE, 'stage_rules', 'stage_rule_compiler.mjs')).href);
const generator = await import(pathToFileURL(path.join(ENGINE, 'stage_rules', 'pilot_packet_generator.mjs')).href);
const manifest = {
  schema_version: 'soulforge.engine_release_manifest.v0',
  engine_version: version,
  status: version === '0.0.0' ? 'under_construction' : 'released',
  generated_at: null,
  generated_from_commit: null,
  git_commit: null,
  components: {
    engine_code_manifest: { file: rel(path.join(ENGINE, 'topology', 'engine_manifest.sha256')), sha256: sha(path.join(ENGINE, 'topology', 'engine_manifest.sha256')) },
    stage_rule_compiler: { version: compiler.COMPILER_VERSION, schema: compiler.STAGE_RULE_COMPILER_SCHEMA_VERSION, sha256: sha(path.join(ENGINE, 'stage_rules', 'stage_rule_compiler.mjs')) },
    pilot_packet_generator: { version: generator.GENERATOR_VERSION, schema: generator.PILOT_PACKET_GENERATOR_SCHEMA_VERSION, sha256: sha(path.join(ENGINE, 'stage_rules', 'pilot_packet_generator.mjs')) },
    artifact_vocabulary: { sha256: sha(path.join(ENGINE, 'stage_rules', 'artifact_vocabulary.mjs')) },
    rule_layers: layers,
    prime_overlays: overlays,
  },
  note: 'engine_version 0.0.0 = 만드는 중(Owner 2026-08-18). 정본 승격 시 실제 번호 시작. run receipts의 policy_ref는 이 매니페스트의 rule_layers/compiler 지문에서 나온다. generated_from_commit은 emit 시점 base HEAD이며 이 파일을 담는 후속 commit을 self-bind하지 않고, git_commit은 호환 alias다.',
};
const generationCommit = () => {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(); } catch { return null; }
};
const stamp = (m) => {
  const copy = structuredClone(m);
  const commit = generationCommit();
  copy.generated_at = new Date().toISOString();
  copy.generated_from_commit = commit;
  copy.git_commit = commit;
  return copy;
};
const strip = (m) => {
  const c = structuredClone(m);
  delete c.generated_at;
  delete c.generated_from_commit;
  delete c.git_commit;
  return c;
};
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const releaseIdentity = (stored) => {
  const generated = has(stored, 'generated_from_commit') ? stored.generated_from_commit : (stored.git_commit ?? null);
  const validCommit = generated === null || /^[0-9a-f]{40}$/.test(generated);
  const aliasesAgree = !has(stored, 'generated_from_commit') || !has(stored, 'git_commit')
    || stored.generated_from_commit === stored.git_commit;
  return { generated, valid: validCommit && aliasesAgree };
};
if (checkPath) {
  const stored = JSON.parse(readFileSync(path.resolve(REPO, checkPath), 'utf8'));
  const identity = releaseIdentity(stored);
  const same = JSON.stringify(strip(stored)) === JSON.stringify(strip(manifest));
  const ok = same && identity.valid;
  console.log(JSON.stringify({
    ok, engine_version: manifest.engine_version, stored_version: stored.engine_version,
    generated_from_commit: identity.generated, identity_valid: identity.valid,
  }, null, 2));
  process.exit(ok ? 0 : 1);
}
const stamped = stamp(manifest);
writeFileSync(path.resolve(REPO, outPath), JSON.stringify(stamped, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  written: outPath, engine_version: stamped.engine_version, layers: Object.keys(layers).length,
  overlays: Object.keys(overlays).length, generated_from_commit: stamped.generated_from_commit,
}, null, 2));
