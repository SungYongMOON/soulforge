// A bounded metadata file reader; producing inputs and writing generations belong
// to the coverage owner. Nothing is refreshed merely because this endpoint is read.
import { open, lstat, realpath } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, dirname } from 'node:path';
import { worldCoverageDigest } from '../../../../../guild_hall/requirement_trace/forge_world_coverage.mjs';
import { REQUIREMENT_COVERAGE_REASON_CODES } from '../../../../../guild_hall/requirement_trace/requirement_coverage.mjs';
import { projectWorldCoverage } from '../core/forge-world-state.mjs';
import { isDirectLoopbackRequest } from './loopback-request-guard.mjs';

export const WORLD_COVERAGE_PATH = '/project-coverage.snapshot.json';
const MAX_BYTES = 2 * 1024 * 1024;
const CODE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const STATES = ['satisfied', 'gap_missing', 'gap_unknown', 'gap_conflict', 'not_applicable'];
const REASONS = ['satisfied', 'not_applicable', ...REQUIREMENT_COVERAGE_REASON_CODES];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeId = value => typeof value === 'string' && ID.test(value);
const count = value => Number.isSafeInteger(value) && value >= 0 && value <= 20000;
const tally = (value, allowed) => object(value) && Object.entries(value).every(([key, number]) => allowed.includes(key) && count(number));
const instant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/u.test(value) && Number.isFinite(Date.parse(value));
const contained = (root, target) => { const path = relative(root, target); return path !== '..' && !path.startsWith(`..\\`) && !path.startsWith('../') && !isAbsolute(path); };

export function parseWorldCoverage(raw, projectCode) {
  try {
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_BYTES) return null;
    const doc = JSON.parse(raw);
    if (!object(doc) || doc.project_code !== projectCode || typeof projectCode !== 'string' || !CODE.test(projectCode)
      || doc.schema_version !== 'soulforge.forge_world.coverage.v1' || !['sample', 'observed'].includes(doc.source_kind)
      || !instant(doc.observed_at) || !instant(doc.valid_at) || !DIGEST.test(doc.generation)
      || !Array.isArray(doc.slots) || doc.slots.length > 1000 || !DIGEST.test(doc.input_revision)) return null;
    const {generation, ...body} = doc;
    if (generation !== worldCoverageDigest(body)) return null;
    if (!tally(doc.unbound_counts, ['needs_undeclared', 'policy_slot_unmapped', 'unexpected_observed'])) return null;
    for (const slot of doc.slots) {
      if (!object(slot) || slot.project_code !== projectCode || !safeId(slot.stage_code) || !safeId(slot.artifact_family_id)
        || !count(slot.cell_count) || !count(slot.observation_count) || !instant(slot.source_observed_at)
        || !STATES.includes(slot.coverage_state) || ![...REASONS, 'mixed'].includes(slot.coverage_reason)
        || !tally(slot.state_counts, STATES) || !tally(slot.reason_counts, REASONS)
        || !Array.isArray(slot.evidence_refs) || slot.evidence_refs.length > 20000
        || !slot.evidence_refs.every(ref => typeof ref === 'string' && DIGEST.test(ref))) return null;
    }
    return doc;
  } catch { return null; }
}

export function createWorldCoverageReader({ stateRoot, projectCodes = [], now = Date.now } = {}) {
  if (typeof stateRoot !== 'string' || !isAbsolute(stateRoot) || !Array.isArray(projectCodes)
    || projectCodes.length > 100 || projectCodes.some(code => typeof code !== 'string' || !CODE.test(code))
    || new Set(projectCodes).size !== projectCodes.length) throw new Error('WORLD_READER_CONFIG_INVALID');
  const root = resolve(stateRoot);
  async function readProject(code) {
    const file = join(root, 'operations', 'forge_world', 'coverage', `${code}.json`);
    let handle;
    try {
      const realRoot = await realpath(root);
      const parent = await realpath(dirname(file));
      if (!contained(realRoot, parent)) return {project_code: code, state: 'unavailable', reason: 'source_unavailable'};
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) return {project_code: code, state: 'unavailable', reason: 'source_unavailable'};
      handle = await open(file, 'r');
      const before = await handle.stat();
      if (before.size > MAX_BYTES) throw new Error('oversize');
      const buffer = Buffer.alloc(MAX_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const {bytesRead} = await handle.read(buffer, length, buffer.length - length, length);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      if (length > MAX_BYTES) throw new Error('oversize');
      const raw = buffer.subarray(0, length).toString('utf8');
      const after = await handle.stat();
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('changed');
      const document = parseWorldCoverage(raw, code);
      return document ? projectWorldCoverage(document, {projectCode: code, nowMs: now()})
        : {project_code: code, state: 'unavailable', reason: 'source_unavailable'};
    } catch (error) {
      return {project_code: code, state: error.code === 'ENOENT' ? 'unknown' : 'unavailable', reason: 'source_unavailable'};
    } finally { await handle?.close(); }
  }
  return {
    async readSnapshot() {
      return {schema_version: 'soulforge.forge_world.projects.v1', read_at: new Date(now()).toISOString(),
        projects: await Promise.all(projectCodes.map(readProject)),
        authority_boundary: {read_only: true, runtime_authority: false, repair_authority: false}};
    },
  };
}

export function createWorldCoverageAdapterPlugin(options) {
  const reader = createWorldCoverageReader(options);
  const configure = server => { server.middlewares.use((request, response, next) => {
    if ((request.url ?? '').split('?')[0] !== WORLD_COVERAGE_PATH) { next(); return; }
    if (request.method !== 'GET') { response.statusCode = 405; response.setHeader('Allow', 'GET'); response.end(); return; }
    if (!isDirectLoopbackRequest(request)) {
      response.statusCode = 403; response.end(); return;
    }
    if (request.url.includes('?')) { response.statusCode = 400; response.end(); return; }
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    void reader.readSnapshot().then(snapshot => {response.statusCode = 200; response.end(JSON.stringify(snapshot));}, () => {
      response.statusCode = 503; response.end('{"state":"unavailable"}');
    });
  }); };
  return {name: 'soulforge-world-coverage-adapter', configureServer: configure, configurePreviewServer: configure};
}
