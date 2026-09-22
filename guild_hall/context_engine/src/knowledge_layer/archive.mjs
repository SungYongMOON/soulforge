import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { digest, fail, freeze, hashText, sha, snapshot, token } from './data.mjs';
const checkProject = project => { if (!token(project)) fail('archive_project_invalid'); };
const checkKey = key => { if (!sha(key)) fail('archive_key_invalid'); };
export function createMemoryArchive() {
  const values = new Map(), withdrawals = new Map();
  return Object.freeze({
    async put(key, value) { checkKey(key); if (digest(value) !== key) fail('archive_hash_mismatch');
      if (values.has(key) && digest(values.get(key)) !== key) fail('archive_hash_mismatch'); values.set(key, freeze(snapshot(value))); },
    async get(key) { checkKey(key); if (!values.has(key)) fail('archive_missing'); const v = snapshot(values.get(key)); if (digest(v) !== key) fail('archive_hash_mismatch'); return v; },
    async addWithdrawals(project, hashes) { checkProject(project); hashes.forEach(checkKey);
      withdrawals.set(project, new Set([...(withdrawals.get(project) ?? []), ...hashes])); },
    async getWithdrawals(project) { checkProject(project); return [...(withdrawals.get(project) ?? [])].sort(); },
    async getRecoveryWithdrawals(project) { checkProject(project);
      return [...new Set([...(withdrawals.get(project) ?? []), ...[...values.values()].filter(v => v.project_ref === project).flatMap(v => v.withdrawals ?? [])])].sort(); },
  });
}
/** Owned archive directory must already exist. No source directories are read.
 * Snapshots, rendered Markdown and withdrawal markers are create-only. The
 * snapshot is the reconstruction packet; rendered files are reproducible views.
 */
export function createFileArchive({ root } = {}) {
  if (typeof root !== 'string' || !isAbsolute(root) || !existsSync(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) fail('archive_root_invalid');
  const rootIdentity = lstatSync(root);
  function guardedPath(name) {
    const held = lstatSync(root); if (!held.isDirectory() || held.isSymbolicLink() || held.dev !== rootIdentity.dev || held.ino !== rootIdentity.ino) fail('archive_root_changed');
    const file = join(root, name); if (existsSync(file) && (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink())) fail('archive_entry_invalid'); return file;
  }
  const fileFor = key => { checkKey(key); return guardedPath(key.slice(7) + '.json'); };
  return Object.freeze({
    async put(key, value) {
      if (digest(value) !== key) fail('archive_hash_mismatch'); const file = fileFor(key), bytes = JSON.stringify(snapshot(value));
      if (Buffer.byteLength(bytes) > 2000000) fail('archive_budget');
      try { writeFileSync(file, bytes, { flag: 'wx' }); }
      catch (error) { if (error.code !== 'EEXIST') fail('archive_write_failed'); }
      if (digest(JSON.parse(readFileSync(fileFor(key), 'utf8'))) !== key) fail('archive_hash_mismatch');
      // Recovery intent is durable but NOT active withdrawal state. A failed
      // graph CAS leaves current reads unchanged; restoring an old snapshot must
      // conservatively reconcile unfinished withdrawal intents first.
      if (token(value.project_ref) && Array.isArray(value.withdrawals) && value.withdrawals.length) {
        value.withdrawals.forEach(checkKey);
        const intent = guardedPath('intent-' + hashText(value.project_ref).slice(7) + '-' + key.slice(7) + '.json');
        const bytes = JSON.stringify({ project_ref: value.project_ref, generation_id: key, withdrawals: value.withdrawals });
        try { writeFileSync(intent, bytes, { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') fail('archive_intent_write_failed'); }
        if (readFileSync(intent, 'utf8') !== bytes) fail('archive_intent_corrupt');
      }
      if (Array.isArray(value.pages) && typeof value.index_markdown === 'string') {
        const views = [{ name: 'index', text: value.index_markdown }, ...value.pages.map(p => ({ name: hashText(p.page_id).slice(7), text: p.markdown }))];
        for (const view of views) {
          if (typeof view.text !== 'string') fail('archive_view_invalid');
          const target = guardedPath(key.slice(7) + '-' + view.name + '.md');
          try { writeFileSync(target, view.text, { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') fail('archive_write_failed'); }
          if (readFileSync(target, 'utf8') !== view.text) fail('archive_view_corrupt');
        }
      }
    },
    async get(key) { const file = fileFor(key); if (!existsSync(file) || lstatSync(file).size > 2000000) fail('archive_missing_or_large');
      const value = snapshot(JSON.parse(readFileSync(file, 'utf8'))); if (digest(value) !== key) fail('archive_hash_mismatch'); return value; },
    async addWithdrawals(project, hashes) {
      checkProject(project); hashes.forEach(checkKey);
      for (const hash of hashes) { const file = guardedPath('withdraw-' + hashText(project).slice(7) + '-' + hash.slice(7) + '.json');
        const bytes = JSON.stringify({ project_ref: project, fingerprint: hash });
        try { writeFileSync(file, bytes, { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') fail('withdrawal_write_failed'); }
        if (readFileSync(file, 'utf8') !== bytes) fail('withdrawal_corrupt'); }
    },
    async getWithdrawals(project) {
      checkProject(project); guardedPath('probe'); const prefix = 'withdraw-' + hashText(project).slice(7) + '-';
      const files = readdirSync(root).filter(name => name.startsWith(prefix)); if (files.length > 10000) fail('withdrawal_budget');
      return files.map(name => {
        const suffix = name.slice(prefix.length); if (!/^[0-9a-f]{64}\.json$/u.test(suffix)) fail('withdrawal_corrupt');
        const file = guardedPath(name); if (lstatSync(file).size > 1000) fail('withdrawal_corrupt');
        const value = JSON.parse(readFileSync(file, 'utf8')), hash = 'sha256:' + suffix.slice(0, 64);
        if (value.project_ref !== project || value.fingerprint !== hash) fail('withdrawal_corrupt'); return hash;
      }).sort();
    },
    async getRecoveryWithdrawals(project) {
      checkProject(project); guardedPath('probe'); const prefix = 'intent-' + hashText(project).slice(7) + '-';
      const files = readdirSync(root).filter(name => name.startsWith(prefix)); if (files.length > 10000) fail('withdrawal_budget');
      return [...new Set(files.flatMap(name => {
        const suffix = name.slice(prefix.length); if (!/^[0-9a-f]{64}\.json$/u.test(suffix)) fail('archive_intent_corrupt');
        const path = guardedPath(name); if (lstatSync(path).size > 100000) fail('archive_intent_corrupt');
        const value = JSON.parse(readFileSync(path, 'utf8'));
        if (value.project_ref !== project || value.generation_id !== 'sha256:' + suffix.slice(0, 64) || !Array.isArray(value.withdrawals)) fail('archive_intent_corrupt');
        value.withdrawals.forEach(checkKey); return value.withdrawals;
      }))].sort();
    },
  });
}
