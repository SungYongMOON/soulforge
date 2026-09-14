import { lstat, opendir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { readRootTable, physicalRootFor } from '../../../../../guild_hall/path_registry/src/root_table.mjs';
import { isDirectLoopbackRequest } from './loopback-request-guard.mjs';

export const DIRECTORY_PATH = '/operations-directory.json';
const BLOCKED = /(?:^\.|secret|credential|password|token|cookie|session|\.pem$|\.key$|^config$|^credentials$|^private$)/iu;
const safeSegment = name => typeof name === 'string' && name.length > 0 && name.length <= 255
  && !/[\\/:\x00-\x1f\x7f]/u.test(name) && !/[. ]$/u.test(name) && !BLOCKED.test(name);
const identity = stat => `${stat.dev}:${stat.ino}`;

// No file bodies, recursion, processes, or model calls. The existing pinned
// Path Registry table is the only source of physical addresses.
export function createOperationsDirectoryReader({ tablePath, expectedSha256, now = Date.now, maxEntries = 200 } = {}) {
  const cache = new Map();
  const pending = new Map();
  async function read({ root = '', relative = '' } = {}) {
    let table;
    try { table = readRootTable({ tablePath, expectedSha256 }); }
    catch { return { state: 'unavailable', reason: '허용 root 표 연결 또는 검증 실패', roots: [], scanned_at: null, entries: [] }; }
    const aliases = table.aliases.filter(alias => alias !== 'secret_owner_root');
    const base = { roots: aliases, root, relative, registry_digest: table.table_sha256, scope: 'direct_children_only' };
    if (!root) return { ...base, state: 'ready', entries: [], scanned_at: null };
    const parts = relative === '' ? [] : relative.split('/');
    if (!aliases.includes(root) || parts.length > 24 || parts.some(part => !safeSegment(part))) {
      return { ...base, state: 'denied', reason: '허용된 탐색 범위 밖', entries: [], scanned_at: null };
    }
    const physicalRoot = physicalRootFor(table, root);
    const target = path.join(physicalRoot, ...parts);
    async function admit() {
      let current = physicalRoot;
      let finalStat;
      for (const part of ['', ...parts]) {
        if (part) current = path.join(current, part);
        const stat = await lstat(current);
        if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(current) !== current) throw new Error('unsafe_directory');
        finalStat = stat;
      }
      return identity(finalStat);
    }
    let admitted;
    try { admitted = await admit(); }
    catch { return { ...base, state: 'denied', reason: '경로 이동·링크 또는 읽기 거부', entries: [], scanned_at: null }; }
    const key = `${table.table_sha256}:${root}:${relative}:${admitted}`;
    const previous = cache.get(key);
    if (previous && now() - previous.time < 60_000) return { ...previous.value, cached: true };
    if (pending.has(key)) return pending.get(key);
    const operation = (async () => {
      const entries = [];
      let examined = 0, excluded = 0, failed = 0, truncated = false;
      try {
        // opendir streams a bounded number of direct children, including hidden
        // entries in the work budget; no full-folder readdir or recursive size.
        for await (const entry of await opendir(target)) {
          if (examined++ >= maxEntries) { truncated = true; break; }
          if (!safeSegment(entry.name)) { excluded++; continue; }
          try {
            if (await admit() !== admitted) throw new Error('directory_changed');
            const stat = await lstat(path.join(target, entry.name));
            const link = stat.isSymbolicLink();
            entries.push({ name: entry.name, kind: link ? 'link' : stat.isDirectory() ? 'directory' : 'file',
              size: stat.isFile() && !link ? stat.size : null, modified_at: stat.mtime.toISOString(),
              browsable: stat.isDirectory() && !link, state: link ? 'blocked' : 'observed' });
          } catch { failed++; }
        }
        if (await admit() !== admitted) throw new Error('directory_changed');
      } catch {
        return { ...base, state: 'unavailable', reason: '목록 읽기 실패 또는 탐색 중 경로 변경', entries: [], scanned_at: null };
      }
      entries.sort((a,b) => Number(b.browsable) - Number(a.browsable) || a.name.localeCompare(b.name, 'ko'));
      const value = { ...base, state: truncated || failed ? 'partial' : 'ready', entries,
        scanned_at: new Date(now()).toISOString(), truncated, failed, excluded, cached: false,
        total_size: null, reason: truncated ? '직접 자식 200개 제한 · 전체 집계 아님' : failed ? '일부 항목 읽기 실패' : '현재 폴더의 허용 항목만 · 하위 폴더 크기 미집계' };
      if (cache.size >= 64) cache.delete(cache.keys().next().value);
      cache.set(key, { time: now(), value });
      return value;
    })();
    pending.set(key, operation);
    try { return await operation; } finally { pending.delete(key); }
  }
  return { read };
}

export function createOperationsDirectoryPlugin(options = {}) {
  const reader = createOperationsDirectoryReader(options);
  const configure = server => { server.middlewares.use((req, res, next) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname !== DIRECTORY_PATH) return next();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
    let originAllowed = true;
    try { if (req.headers.origin) originAllowed = new URL(req.headers.origin).host === req.headers.host; } catch { originAllowed = false; }
    if (!isDirectLoopbackRequest(req) || !/^(127\.0\.0\.1|localhost)(:\d+)?$/u.test(req.headers.host || '')
      || !originAllowed || req.headers['sec-fetch-site'] === 'cross-site') { res.statusCode = 403; res.end(); return; }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if ([...url.searchParams.keys()].some(key => !['root', 'relative'].includes(key))) { res.statusCode = 400; res.end('{}'); return; }
    void reader.read({ root: url.searchParams.get('root') || '', relative: url.searchParams.get('relative') || '' })
      .then(value => res.end(JSON.stringify(value)), () => { res.statusCode = 503; res.end('{"state":"unavailable","entries":[],"scanned_at":null}'); });
  }); };
  return { name: 'operations-directory-read-only', configureServer: configure, configurePreviewServer: configure };
}
