// Fixed, read-only DOCX extraction: exact bytes in, one bounded candidate out.
// The caller may select only a trusted interpreter; worker path, profile, flags,
// timeout and output contract are owned here.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';

export const DOCX_PREPARATION_PROFILE = 'python-docx-structure-v1';
const WORKER_URL = new URL('../../src/workers/document_docx_extract.py', import.meta.url);
const WORKER_PATH = fileURLToPath(WORKER_URL);
const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const WORKER_TIMEOUT_MS = 30 * 1000;
const MAX_BLOCKS = 2001;
const MAX_UNIT_CHARACTERS = 20000;
const MAX_DOCUMENT_CHARACTERS = 400000;
const SHA_HEX = /^[0-9a-f]{64}$/u;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:[a-z0-9.+-]*)$/u;
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
const TYPED_ARRAY_NAME_OF = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, Symbol.toStringTag).get;
const BYTE_LENGTH_OF = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, 'byteLength').get;
const COPY_BYTES_INTO = Uint8Array.prototype.set;
const BYTE_VIEW_SHADOW_KEYS = ['buffer', 'byteLength', 'byteOffset', 'length', 'valueOf',
  Symbol.iterator, Symbol.toPrimitive];
const REFUSAL_CODES = new Set([
  'docx_alt_chunk_unsupported', 'docx_alternate_content_unsupported', 'docx_comments_unsupported',
  'docx_content_types_invalid', 'docx_content_unavailable', 'docx_custom_xml_wrapper_unsupported',
  'docx_drawing_unsupported', 'docx_embedded_object_unsupported', 'docx_endnote_unsupported',
  'docx_external_relationship_unsupported', 'docx_field_unsupported', 'docx_footnote_unsupported',
  'docx_headers_footers_unsupported', 'docx_hidden_text_unsupported', 'docx_input_bounds_exceeded',
  'docx_main_document_invalid', 'docx_math_unsupported', 'docx_numbering_unsupported',
  'docx_package_invalid', 'docx_package_member_unsupported', 'docx_parser_unavailable',
  'docx_preparation_document_limit_exceeded', 'docx_preparation_unit_limit_exceeded',
  'docx_profile_invalid', 'docx_relationship_invalid', 'docx_relationship_unsupported',
  'docx_revision_unsupported', 'docx_ruby_unsupported', 'docx_sdt_unsupported',
  'docx_smart_tag_unsupported', 'docx_structure_mismatch', 'docx_structure_unsupported',
  'docx_styles_invalid', 'docx_symbol_unsupported', 'docx_table_merge_unsupported',
  'docx_table_nested_content_unsupported', 'docx_table_structure_unsupported', 'docx_unreadable',
  'docx_worker_failed', 'docx_worker_output_exceeded', 'docx_xml_directive_unsupported',
  'docx_xml_encoding_unsupported', 'docx_xml_invalid', 'docx_zip_bounds_exceeded',
  'docx_zip_compression_unsupported', 'docx_zip_corrupt', 'docx_zip_encrypted_unsupported',
  'docx_zip_member_unsafe',
]);

const workerSha256 = () => `sha256:${createHash('sha256').update(readFileSync(WORKER_URL)).digest('hex')}`;
export const DOCX_PREPARATION_WORKER_SHA256 = workerSha256();

export class DocxPreparationError extends Error {
  constructor(code) { super(code); this.name = 'DocxPreparationError'; this.code = code; }
}
const fail = code => { throw new DocxPreparationError(code); };
const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const countCharacters = value => [...value].length;

function assertWorkerUnchanged() {
  try { if (workerSha256() === DOCX_PREPARATION_WORKER_SHA256) return; } catch { /* closed below */ }
  fail('docx_preparation_worker_changed');
}

function ownData(value, key, code = 'docx_preparation_request_invalid') {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail(code);
  return descriptor.value;
}

function byteLengthOf(bytes) {
  if (bytes === null || typeof bytes !== 'object' || types.isProxy(bytes)
    || TYPED_ARRAY_NAME_OF.call(bytes) !== 'Uint8Array'
    || ![Buffer.prototype, Uint8Array.prototype].includes(Object.getPrototypeOf(bytes))
    || BYTE_VIEW_SHADOW_KEYS.some(key => Object.getOwnPropertyDescriptor(bytes, key) !== undefined)) {
    fail('docx_preparation_request_invalid');
  }
  return BYTE_LENGTH_OF.call(bytes);
}

function prepareRequest(request) {
  if (request === null || typeof request !== 'object' || types.isProxy(request)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(request))
    || Reflect.ownKeys(request).length !== 2) fail('docx_preparation_request_invalid');
  const bytes = ownData(request, 'docxBytes'), expectedSha256 = ownData(request, 'expectedSha256');
  if (typeof expectedSha256 !== 'string' || !SHA_HEX.test(expectedSha256)) fail('docx_preparation_request_invalid');
  const length = byteLengthOf(bytes);
  if (!Number.isSafeInteger(length) || length < 1) fail('docx_preparation_request_invalid');
  if (length > MAX_INPUT_BYTES) fail('docx_input_bounds_exceeded');
  const snapshot = Buffer.allocUnsafe(length);
  COPY_BYTES_INTO.call(snapshot, bytes);
  const sha256 = createHash('sha256').update(snapshot).digest('hex');
  if (sha256 !== expectedSha256) fail('docx_preparation_digest_mismatch');
  return { snapshot, sha256 };
}

function prepareOptions(options) {
  if (options === null || typeof options !== 'object' || types.isProxy(options)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(options))) fail('docx_preparation_tool_invalid');
  const keys = Reflect.ownKeys(options);
  if (![2, 3].includes(keys.length)
    || keys.some(key => !['disableSiteStartup', 'extractionProfile', 'interpreterPath'].includes(key))) {
    fail('docx_preparation_tool_invalid');
  }
  const interpreterPath = ownData(options, 'interpreterPath', 'docx_preparation_tool_invalid');
  const extractionProfile = ownData(options, 'extractionProfile', 'docx_preparation_tool_invalid');
  const disableSiteStartup = keys.includes('disableSiteStartup')
    ? ownData(options, 'disableSiteStartup', 'docx_preparation_tool_invalid') : false;
  if (typeof interpreterPath !== 'string' || !isAbsolute(interpreterPath) || /[\x00-\x1f]/u.test(interpreterPath)
    || extractionProfile !== DOCX_PREPARATION_PROFILE || typeof disableSiteStartup !== 'boolean'
    || (disableSiteStartup && process.platform !== 'win32')) fail('docx_preparation_tool_invalid');
  return { interpreterPath, extractionProfile, disableSiteStartup };
}

function runWorker(bytes, options) {
  return new Promise(resolve => {
    let child, timer = null, settled = false, size = 0;
    const chunks = [];
    const finish = value => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      resolve(value);
    };
    try {
      const args = options.disableSiteStartup
        ? ['-I', '-B', '-S', '-c', "import sys,runpy;from pathlib import Path;sys.path.append(str(Path(sys.executable).parent/'Lib'/'site-packages'));sys.argv=sys.argv[1:];runpy.run_path(sys.argv[0],run_name='__main__')", WORKER_PATH]
        : ['-I', '-B', WORKER_PATH];
      args.push(options.extractionProfile);
      child = spawn(options.interpreterPath, args, { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    } catch { finish(null); return; }
    timer = setTimeout(() => { child.kill(); finish(null); }, WORKER_TIMEOUT_MS);
    if (typeof timer.unref === 'function') timer.unref();
    child.on('error', () => finish(null));
    child.stdin.on('error', () => {});
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_OUTPUT_BYTES) { child.kill(); finish(null); return; }
      chunks.push(chunk);
    });
    child.on('close', code => finish(code === 0 ? Buffer.concat(chunks) : null));
    child.stdin.end(bytes);
  });
}

const decoder = new TextDecoder('utf-8', { fatal: true });
function readOutput(raw) {
  if (!Buffer.isBuffer(raw) || raw.length < 1 || raw.length > MAX_OUTPUT_BYTES) fail('docx_worker_unavailable');
  let output;
  try { output = JSON.parse(decoder.decode(raw)); } catch { fail('docx_worker_output_invalid'); }
  if (closed(output, ['status', 'code']) && output.status === 'refused'
    && typeof output.code === 'string' && REFUSAL_CODES.has(output.code)) fail(output.code);
  const fields = ['status', 'engine', 'profile', 'engine_version', 'block_count', 'unit_count', 'character_count', 'blocks'];
  if (!closed(output, fields) || output.status !== 'extracted' || output.engine !== 'python-docx'
    || output.profile !== DOCX_PREPARATION_PROFILE || !VERSION.test(output.engine_version ?? '')
    || !Number.isSafeInteger(output.block_count) || output.block_count < 1 || output.block_count > MAX_BLOCKS
    || !Number.isSafeInteger(output.unit_count) || output.unit_count < 1 || output.unit_count > 2000
    || !Number.isSafeInteger(output.character_count) || output.character_count < 1
    || output.character_count > MAX_DOCUMENT_CHARACTERS || !Array.isArray(output.blocks)
    || output.blocks.length !== output.block_count) fail('docx_worker_output_invalid');
  let lastBlock = 0, lastParagraph = 0, lastTable = 0, units = 0, characters = 0;
  for (const block of output.blocks) {
    if (block?.block_index !== lastBlock + 1) fail('docx_worker_output_invalid');
    lastBlock = block.block_index;
    if (block.kind === 'paragraph') {
      if (!closed(block, ['kind', 'block_index', 'paragraph_index', 'text'])
        || block.paragraph_index !== lastParagraph + 1 || typeof block.text !== 'string'
        || countCharacters(block.text) > MAX_UNIT_CHARACTERS) fail('docx_worker_output_invalid');
      lastParagraph = block.paragraph_index;
      if (block.text.trim()) { units += 1; characters += countCharacters(block.text.trim()); }
      continue;
    }
    if (block.kind !== 'table'
      || !closed(block, ['kind', 'block_index', 'table_index', 'row_count', 'column_count', 'cells'])
      || block.table_index !== lastTable + 1 || !Number.isSafeInteger(block.row_count) || block.row_count < 1
      || !Number.isSafeInteger(block.column_count) || block.column_count < 1
      || !Array.isArray(block.cells) || block.cells.length !== block.row_count * block.column_count) {
      fail('docx_worker_output_invalid');
    }
    lastTable = block.table_index;
    block.cells.forEach((cell, index) => {
      if (!closed(cell, ['row_number', 'column_number', 'text'])
        || cell.row_number !== Math.floor(index / block.column_count) + 1
        || cell.column_number !== index % block.column_count + 1 || typeof cell.text !== 'string'
        || countCharacters(cell.text) > MAX_UNIT_CHARACTERS) fail('docx_worker_output_invalid');
      if (cell.text.trim()) { units += 1; characters += countCharacters(cell.text.trim()); }
    });
  }
  if (units !== output.unit_count || characters !== output.character_count) fail('docx_worker_output_invalid');
  return output;
}

export async function preparePinnedDocxCandidate(request, trustedOptions) {
  const prepared = prepareRequest(request), options = prepareOptions(trustedOptions);
  assertWorkerUnchanged();
  const raw = await runWorker(prepared.snapshot, options);
  assertWorkerUnchanged();
  const extraction = readOutput(raw);
  const extractionSha256 = createHash('sha256').update(JSON.stringify({ source_sha256: prepared.sha256,
    profile: extraction.profile, engine: extraction.engine, engine_version: extraction.engine_version,
    worker_sha256: DOCX_PREPARATION_WORKER_SHA256, blocks: extraction.blocks }), 'utf8').digest('hex');
  return deepFreeze({ status: 'candidate', source: { media_type:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sha256: prepared.sha256,
    byte_count: prepared.snapshot.length }, extraction: { ...extraction, extraction_sha256: extractionSha256 },
  authority: { source_truth: false, canon: false, project_state: false, approval: false },
  effects: { persistent_writes: 0, network_calls: 0, model_calls: 0, rag_index_writes: 0, wiki_writes: 0 } });
}

function deepFreeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); }
  return value;
}
