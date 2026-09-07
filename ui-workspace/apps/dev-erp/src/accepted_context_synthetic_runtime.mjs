// Test-only file-backed binding. No target-store materialization or writer route.
import { createHash } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { sameExactRef, exactRefIdentityKey } from '../../../../guild_hall/engineering_engine/kernel/identity.mjs';
import { sha256Canonical } from '../../../../guild_hall/shared/project_history_envelope.mjs';
import { createAcceptedContextReader } from './accepted_context_reader.mjs';
import { makeUniformNotAvailable } from './accepted_context_query.mjs';

const FILES = new Set(['binding.json', 'pointer.json', 'source-revisions.json', 'acl.json', 'accepted-generation.json']);
const MAX_BYTES = 2 * 1024 * 1024;
function keys(value, fields) {
  return value && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === fields.length && fields.every(k => Object.hasOwn(value, k));
}
function digest(bytes) { return 'sha256:' + createHash('sha256').update(bytes).digest('hex'); }
function aclFromJson(value) {
  if (!keys(value, ['actors', 'revoked_actors', 'revoked_generations']) || !Array.isArray(value.actors)
    || !Array.isArray(value.revoked_actors) || !Array.isArray(value.revoked_generations)) throw new Error('unavailable');
  const actors = new Map();
  for (const row of value.actors) {
    if (!keys(row, ['actor_ref', 'grant']) || actors.has(row.actor_ref)) throw new Error('unavailable');
    const grant = row.grant;
    if (!keys(grant, ['grant_revision_ref', 'allowed_projects', 'allowed_scopes', 'allowed_purposes',
      'field_allowed', 'chunk_allowed', 'locator_allowed'])
      || !['allowed_projects', 'allowed_scopes', 'allowed_purposes'].every(k => Array.isArray(grant[k]))) throw new Error('unavailable');
    actors.set(row.actor_ref, { ...grant, allowed_projects: new Set(grant.allowed_projects),
      allowed_scopes: new Set(grant.allowed_scopes), allowed_purposes: new Set(grant.allowed_purposes) });
  }
  return { actors, revoked_actors: new Set(value.revoked_actors), revoked_generations: new Set(value.revoked_generations) };
}

export function createSyntheticAcceptedContextRuntime({ root, bindingSha256, syntheticOnly = false } = {}) {
  if (!syntheticOnly || !isAbsolute(root || '') || !/^sha256:[0-9a-f]{64}$/u.test(bindingSha256 || '')) return null;
  try {
    const temp = realpathSync(tmpdir());
    const canonical = realpathSync(root);
    const rel = relative(temp, canonical);
    if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel.includes(sep)
      || !basename(canonical).startsWith('accepted-context-synthetic-') || lstatSync(root).isSymbolicLink()) return null;
    function file(name) {
      if (!FILES.has(name) || realpathSync(root) !== canonical || lstatSync(root).isSymbolicLink()) throw new Error('unavailable');
      const target = join(canonical, name);
      const stat = lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size < 2 || stat.size > MAX_BYTES
        || realpathSync(target) !== target) throw new Error('unavailable');
      return { target, stat };
    }
    function readSync(name) {
      const checked = file(name);
      const fd = openSync(checked.target, 'r');
      try {
        const stat = fstatSync(fd);
        if (stat.ino !== checked.stat.ino || stat.dev !== checked.stat.dev || stat.size > MAX_BYTES) throw new Error('unavailable');
        const bytes = readFileSync(fd);
        if (bytes.length > MAX_BYTES) throw new Error('unavailable');
        return bytes;
      } finally { closeSync(fd); }
    }
    async function readAsync(name) {
      const checked = file(name);
      const fd = await open(checked.target, 'r');
      try {
        const stat = await fd.stat();
        if (stat.ino !== checked.stat.ino || stat.dev !== checked.stat.dev || stat.size > MAX_BYTES || stat.nlink !== 1) throw new Error('unavailable');
        const bytes = await fd.readFile();
        if (bytes.length > MAX_BYTES) throw new Error('unavailable');
        return JSON.parse(bytes.toString('utf8'));
      } finally { await fd.close(); }
    }
    function currentBinding() {
      const bytes = readSync('binding.json');
      if (digest(bytes) !== bindingSha256) throw new Error('unavailable');
      const value = JSON.parse(bytes.toString('utf8'));
      if (!keys(value, ['mode', 'project_ref', 'producer_binding_ref', 'project_label', 'actor_bindings', 'page_size'])
        || value.mode !== 'synthetic_only' || !exactRefIdentityKey(value.project_ref) || !exactRefIdentityKey(value.producer_binding_ref)
        || typeof value.project_label !== 'string' || value.project_label.length > 100 || !value.project_label.trim()
        || !Array.isArray(value.actor_bindings) || value.actor_bindings.length > 20
        || !Number.isSafeInteger(value.page_size) || value.page_size < 1 || value.page_size > 100) throw new Error('unavailable');
      const accounts = new Set(); const actors = new Set();
      for (const row of value.actor_bindings) {
        if (!keys(row, ['account_id', 'actor_ref']) || ![row.account_id, row.actor_ref].every(s => typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u.test(s))
          || accounts.has(row.account_id) || actors.has(row.actor_ref)) throw new Error('unavailable');
        accounts.add(row.account_id); actors.add(row.actor_ref);
      }
      return value;
    }
    const initial = currentBinding();
    const json = name => { currentBinding(); return JSON.parse(readSync(name).toString('utf8')); };
    const currentDigest = () => {
      currentBinding();
      return sha256Canonical(['pointer.json', 'source-revisions.json', 'acl.json', 'accepted-generation.json']
        .map(name => digest(readSync(name))));
    };
    const providers = {
      currentPointer: () => json('pointer.json'),
      currentSourceRevisions: () => json('source-revisions.json'),
      currentAclPolicy: () => aclFromJson(json('acl.json')),
      readAcceptedGeneration: async (project, generation) => {
        currentBinding();
        const result = await readAsync('accepted-generation.json');
        if (!sameExactRef(project, initial.project_ref) || !sameExactRef(generation, result.manifest?.accepted_generation_ref)) throw new Error('unavailable');
        return result;
      },
    };
    const reader = createAcceptedContextReader({ enabled: true,
      binding: { project_ref: initial.project_ref, producer_binding_ref: initial.producer_binding_ref }, providers });
    function actorForAccount(account) {
      try { return currentBinding().actor_bindings.find(row => row.account_id === account?.id)?.actor_ref || null; }
      catch { return null; }
    }
    async function selections(account) {
      const bound = currentBinding();
      const actor = actorForAccount(account);
      if (!actor) return [];
      const pointer = providers.currentPointer();
      const all = await providers.readAcceptedGeneration(bound.project_ref, pointer.generation_ref);
      const entries = [];
      for (const scope of ['project', 'common']) {
        const request = { actor_ref: actor, project_ref: bound.project_ref, accepted_generation_ref: pointer.generation_ref,
          scope, as_of: all.manifest.bitemporal_cutoff.known_at, purpose: 'pilot_context_query', budget: { max_units: bound.page_size }, cursor: null };
        const result = await reader.query(request);
        if (result.status !== 'ok') continue;
        const id = sha256Canonical({ actor, project: bound.project_ref, generation: pointer.generation_ref, scope,
          grant: providers.currentAclPolicy().actors.get(actor)?.grant_revision_ref, binding: bindingSha256 });
        entries.push({ selection_id: id, project_label: bound.project_label, scope, as_of: request.as_of,
          purpose: request.purpose, request });
      }
      return entries;
    }
    return Object.freeze({
      actorForAccount,
      async catalogue(account) {
        try {
          const before = currentDigest();
          const entries = await selections(account);
          if (!entries.length || !actorForAccount(account) || before !== currentDigest()) return makeUniformNotAvailable();
          return { status: 'ok', entries: entries.map(({ request, ...entry }) => entry) };
        } catch { return makeUniformNotAvailable(); }
      },
      async query(account, input) {
        try {
          if (!keys(input, ['selection_id', 'as_of', 'cursor']) || typeof input.selection_id !== 'string') return makeUniformNotAvailable();
          const before = currentDigest();
          const selected = (await selections(account)).find(entry => entry.selection_id === input.selection_id);
          if (!selected) return makeUniformNotAvailable();
          const result = await reader.query({ ...selected.request, as_of: input.as_of, cursor: input.cursor });
          return before === currentDigest() ? result : makeUniformNotAvailable();
        } catch { return makeUniformNotAvailable(); }
      },
    });
  } catch { return null; }
}
