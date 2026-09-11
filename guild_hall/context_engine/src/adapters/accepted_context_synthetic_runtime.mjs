// Test-only file-backed binding. No target-store materialization or writer route.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { sameExactRef, exactRefIdentityKey } from '../../../engineering_engine/kernel/identity.mjs';
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { createAcceptedContextReader } from '../runtime/accepted_context_reader.mjs';
import { makeUniformNotAvailable } from '../guards/accepted_context_query.mjs';
import { createProjectAcceptedContextRuntime } from './accepted_context_project_runtime.mjs';

const FILES = new Set(['binding.json', 'pointer.json', 'source-revisions.json', 'acl.json', 'accepted-generation.json']);
const MAX_BYTES = 2 * 1024 * 1024;
function keys(value, fields) {
  return value && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === fields.length && fields.every(k => Object.hasOwn(value, k));
}
function digest(bytes) { return 'sha256:' + createHash('sha256').update(bytes).digest('hex'); }
// Source version witness uses metadata only, never another body/hash read.
function sourceStamp(stat) {
  return Object.fromEntries(['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].map(key => [key, stat[key]]));
}
function unavailablePack(metrics) {
  // Opt-in pack failures preserve measured IO while suppressing all source refs.
  // Ordinary metadata catalogue/query failures keep their original envelope.
  const result = { status: 'NOT_AVAILABLE', identity: null, accepted_generation_ref: null,
    facts: [], evidence: [], paths: [], gaps: ['CONTEXT_UNAVAILABLE'], digest: null,
    boundaries: { source_body_loaded: metrics.source_bytes_loaded > 0 },
    effects: { task_mutations: 0, writer_calls: 0, persistent_writes: 0, external_sends: 0, model_calls: 0 },
    metrics: { ...metrics, source_reads: metrics.source_read_attempts, tokens: 'UNKNOWN', output_characters: 0 } };
  for (let i = 0; i < 4; i++) result.metrics.output_characters = [...JSON.stringify(result)].length + 1;
  return result;
}
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
    function file(name, source = false) {
      if (!(source ? /^source-[0-9a-f]{64}\.json$/u.test(name) : FILES.has(name)) || realpathSync(root) !== canonical || lstatSync(root).isSymbolicLink()) throw new Error('unavailable');
      const target = join(canonical, name);
      const stat = lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size < 2 || stat.size > (source ? 131072 : MAX_BYTES)
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
      const fields = ['mode', 'project_ref', 'producer_binding_ref', 'project_label', 'actor_bindings', 'page_size'];
      if (Object.hasOwn(value, 'context_pack')) fields.push('context_pack');
      if (!keys(value, fields)
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
      if (value.context_pack) {
        const pack = value.context_pack;
        if (!keys(pack, ['source_bindings', 'source_files']) || !Array.isArray(pack.source_bindings)
          || pack.source_bindings.length > 100 || !Array.isArray(pack.source_files) || pack.source_files.length > 100) throw new Error('unavailable');
        for (const row of pack.source_bindings) {
          if (!keys(row, ['actor_ref', 'purpose', 'scope', 'source_lane', 'project_ref', 'accepted_generation_ref',
            'grant_revision_ref', 'source_revision_ref', 'source_span_ref', 'context_unit_ref', 'context_event_ref',
            'context_branch_ref', 'valid_at', 'known_at', 'locator'])
            || !['project_ref', 'accepted_generation_ref', 'grant_revision_ref', 'source_revision_ref'].every(key => exactRefIdentityKey(row[key]))
            || !['actor_ref', 'purpose', 'scope', 'source_lane', 'source_span_ref', 'context_unit_ref', 'context_event_ref',
              'context_branch_ref', 'valid_at', 'known_at'].every(key => typeof row[key] === 'string' && row[key].length <= 1024)
            || typeof row.locator !== 'string' || !/^paragraph:[1-9][0-9]{0,5}$/u.test(row.locator)) throw new Error('unavailable');
        }
        const revisions = new Set(); const names = new Set();
        for (const row of pack.source_files) {
          const key = exactRefIdentityKey(row?.source_revision_ref);
          if (!keys(row, ['source_revision_ref', 'file_name']) || !key
            || typeof row.file_name !== 'string' || !/^source-[0-9a-f]{64}\.json$/u.test(row.file_name)
            || revisions.has(key) || names.has(row.file_name)) throw new Error('unavailable');
          revisions.add(key); names.add(row.file_name);
        }
      } else if (Object.hasOwn(value, 'context_pack')) throw new Error('unavailable');
      return value;
    }
    const mode = JSON.parse(readSync('binding.json')).mode;
    if (mode === 'synthetic_project_context') return createProjectAcceptedContextRuntime({ root, bindingSha256 });
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
      async contextPack(request) {
        const metrics = { source_read_attempts: 0, source_body_loads: 0, source_bytes_loaded: 0 };
        try {
          const bound = currentBinding();
          const actorBound = bound.actor_bindings.some(row => row.actor_ref === request?.actor_ref);
          const config = bound.context_pack;
          const before = currentDigest();
          const sourceWitnesses = new Map();
          let invalidated = false;
          function assertCurrent() {
            try {
              if (invalidated || before !== currentDigest()) throw new Error('unavailable');
              for (const [name, stamp] of sourceWitnesses) {
                const checked = file(name, true);
                if (!isDeepStrictEqual(stamp, sourceStamp(lstatSync(checked.target, { bigint: true })))) throw new Error('unavailable');
              }
            } catch { invalidated = true; throw new Error('unavailable'); }
          }
          // Reader/assembler observations also carry source invalidation. After
          // a failed source witness they stop rather than attempt another body.
          const packProviders = Object.fromEntries(Object.entries(providers).map(([name, provider]) => [name, (...args) => {
            assertCurrent(); return provider(...args);
          }]));
          const { createAcceptedContextPack } = await import('../runtime/accepted_context_pack.mjs');
          const pack = createAcceptedContextPack({ enabled: actorBound,
            binding: { project_ref: bound.project_ref, producer_binding_ref: bound.producer_binding_ref },
            measureSourceReads: () => ({ ...metrics }),
            sourceReadback: config ? { enabled: true, max_reads: 2, bindings: config.source_bindings } : undefined,
            providers: { ...packProviders, async readSourceRevision(binding) {
              assertCurrent();
              metrics.source_read_attempts += 1;
              if (metrics.source_read_attempts > 2) throw new Error('unavailable');
              const current = currentBinding().context_pack;
              if (!current || !current.source_bindings.some(row => isDeepStrictEqual(row, binding))) throw new Error('unavailable');
              const matches = current.source_files.filter(row => sameExactRef(row.source_revision_ref, binding.source_revision_ref));
              if (matches.length !== 1) throw new Error('unavailable');
              const checked = file(matches[0].file_name, true);
              const stamp = sourceStamp(lstatSync(checked.target, { bigint: true }));
              const fd = await open(checked.target, 'r');
              try {
                const stat = await fd.stat();
                if (stat.ino !== checked.stat.ino || stat.dev !== checked.stat.dev || stat.nlink !== 1 || stat.size > 131072) throw new Error('unavailable');
                if (!isDeepStrictEqual(stamp, sourceStamp(fstatSync(fd.fd, { bigint: true })))) {
                  invalidated = true; throw new Error('unavailable');
                }
                sourceWitnesses.set(matches[0].file_name, stamp);
                // No await between this full approval check and first body IO.
                assertCurrent();
                metrics.source_body_loads += 1;
                const bytes = Buffer.alloc(131073);
                let length = 0;
                while (length < bytes.length) {
                  assertCurrent();
                  const { bytesRead } = await fd.read(bytes, length, bytes.length - length, null);
                  metrics.source_bytes_loaded += bytesRead;
                  // EOF is an await too: reject in-place writes/path replacement
                  // immediately, including changes made after bytes were read.
                  if (!isDeepStrictEqual(stamp, sourceStamp(fstatSync(fd.fd, { bigint: true })))) {
                    invalidated = true; throw new Error('unavailable');
                  }
                  assertCurrent();
                  if (!bytesRead) break;
                  length += bytesRead;
                }
                if (length > 131072) throw new Error('unavailable');
                return { binding, body: bytes.subarray(0, length).toString('utf8') };
              } finally { await fd.close(); }
            } },
          });
          const result = await pack.query(request);
          assertCurrent();
          return result;
        } catch { return unavailablePack(metrics); }
      },
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
