// Derived views of one attachment: its text, and page images when a reader asks
// for them.
//
// Nothing here touches the original. The verified bytes are written once into a
// scratch folder under the cache, and every parser and LibreOffice sees only
// that copy -- LibreOffice writes a lock file beside whatever it opens, and
// beside a collected original is not a place this tool writes. The scratch
// folder is removed when the call ends; what stays is the derived result and the
// record of how it was made.
//
// The cache is keyed by the original's digest and re-used only when the whole
// recipe matches: same format, same worker bytes, same interpreter and renderer
// versions. A changed parser therefore re-extracts rather than serving an answer
// nobody could reproduce.
//
// LibreOffice runs headless with its own `UserInstallation` profile inside that
// scratch folder, so a conversion never joins, configures or closes the Owner's
// own LibreOffice session.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ATTACHMENT_DERIVATION_SCHEMA = 'soulforge.context_attachment_derivation.v1';
export const TEXT_WORKER_SCHEMA = 'soulforge.context_attachment_text_worker.v1';
export const RENDER_WORKER_SCHEMA = 'soulforge.context_attachment_render_worker.v1';
export const EXTRACT_FILE = 'extract.v1.json';
export const META_FILE = 'meta.json';
const SCRATCH = '.work';
const TEXT_WORKER = fileURLToPath(new URL('../workers/attachment_text_worker.py', import.meta.url));
const RENDER_WORKER = fileURLToPath(new URL('../workers/attachment_render_worker.py', import.meta.url));
const MAX_WORKER_OUTPUT_BYTES = 64 * 1024 * 1024;
/** Formats this tool claims to read. Anything else is `unsupported_format`, said out loud. */
export const SUPPORTED_FORMATS = Object.freeze(['pptx', 'pdf', 'xlsx', 'txt', 'md', 'csv']);
/** Formats LibreOffice is asked to turn into a PDF before pages are rasterized. */
const CONVERTIBLE = Object.freeze(['pptx', 'xlsx']);
const MIME_FORMAT = Object.freeze({
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-powerpoint': 'pptx',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xlsx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
});
const EXTENSION_FORMAT = Object.freeze({ pptx: 'pptx', pdf: 'pdf', xlsx: 'xlsx', txt: 'txt', md: 'md', csv: 'csv' });
const HEX = /^[0-9a-f]{64}$/u;

export class AttachmentDerivationError extends Error {
  constructor(code) { super(code); this.name = 'AttachmentDerivationError'; this.code = code; }
}
const fail = code => { throw new AttachmentDerivationError(code); };
const digestOf = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const fileDigest = path => digestOf(readFileSync(path));

export const TOOLS_CONFIG_SCHEMA = 'soulforge.context_read_tools.v0';
const DEFAULT_LIMITS = Object.freeze({ max_shapes_per_slide: 400, max_runs_per_shape: 200, max_pages: 200,
  max_rows_per_sheet: 200, max_columns_per_sheet: 40, max_characters: 200000, max_bytes: 8 * 1024 * 1024 });

/**
 * The tool configuration: which interpreter, which converter, which formats, how
 * large an attachment may be, where the attachment roots and the derived cache
 * are. Every one of those is a host fact, so they are declared once in the
 * control root and pinned by digest at each call rather than discovered on PATH.
 */
export function readToolsConfig(bytes) {
  let config;
  try { config = JSON.parse(bytes); } catch { fail('tools_config_unreadable'); }
  if (config?.schema !== TOOLS_CONFIG_SCHEMA) fail('tools_config_schema_unknown');
  for (const key of ['interpreter_path', 'soffice_path', 'receipts_root', 'derived_root']) {
    if (typeof config[key] !== 'string' || !isAbsolute(config[key])) fail('tools_config_path_invalid');
  }
  if (config.python_packages === null || typeof config.python_packages !== 'object') fail('tools_config_packages_invalid');
  // Optional: the shared-term registry this host generates and reads. A host that
  // has no registry yet has no path, and a consumer then has no verdict rather than
  // a wrong one -- but a path that is present and not absolute is a typo, not a hold.
  if (config.shared_terms_path !== undefined && config.shared_terms_path !== null
    && (typeof config.shared_terms_path !== 'string' || !isAbsolute(config.shared_terms_path))) fail('tools_config_path_invalid');
  if (config.formats === null || typeof config.formats !== 'object') fail('tools_config_formats_invalid');
  if (!Number.isSafeInteger(config.max_attachment_bytes) || config.max_attachment_bytes < 1
    || config.max_attachment_bytes > MAX_WORKER_OUTPUT_BYTES) fail('tools_config_bounds_invalid');
  const render = config.render ?? {};
  return Object.freeze({
    schema: config.schema,
    interpreter_path: config.interpreter_path,
    soffice_path: config.soffice_path,
    python_packages: Object.freeze({ ...config.python_packages }),
    formats: Object.freeze({ ...config.formats }),
    max_attachment_bytes: config.max_attachment_bytes,
    mail_attachments_layout: Object.freeze({ rule: config.mail_attachments_layout?.rule ?? 'declared_roots',
      roots: Object.freeze({ ...(config.mail_attachments_layout?.roots ?? {}) }) }),
    receipts_root: config.receipts_root,
    shared_terms_path: config.shared_terms_path ?? null,
    derived_root: config.derived_root,
    // Optional: the shared-term registry the voice read marks intervals with.
    // Absent means no marking, which is a smaller answer and never a guess.
    shared_terms_path: typeof config.shared_terms_path === 'string' && isAbsolute(config.shared_terms_path)
      ? config.shared_terms_path : null,
    derived_root_alias: typeof config.derived_root_alias === 'string' && config.derived_root_alias
      ? config.derived_root_alias : 'derived_root',
    derived_root_status: typeof config.derived_root_status === 'string' ? config.derived_root_status : 'declared',
    render: Object.freeze({ max_pages: Number.isSafeInteger(render.max_pages) ? render.max_pages : 8,
      dpi: Number.isSafeInteger(render.dpi) ? render.dpi : 120 }),
    worker_timeout_ms: Number.isSafeInteger(config.worker_timeout_ms) ? config.worker_timeout_ms : 120000,
    render_timeout_ms: Number.isSafeInteger(config.render_timeout_ms) ? config.render_timeout_ms : 300000,
    limits: Object.freeze({ ...DEFAULT_LIMITS, ...(config.limits ?? {}) }),
  });
}

/** The format this tool will read the attachment as: what the pointer says, else what the name says. */
export function formatFor({ mime = null, name = null } = {}) {
  const byMime = typeof mime === 'string' ? MIME_FORMAT[mime.split(';')[0].trim().toLowerCase()] : undefined;
  if (byMime) return byMime;
  const extension = typeof name === 'string' && name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  return EXTENSION_FORMAT[extension] ?? null;
}

function admitExecutable(value, code) {
  if (typeof value !== 'string' || !isAbsolute(value)) fail(code);
  const target = resolve(value);
  let stat;
  try { stat = lstatSync(target); } catch { return fail(code); }
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(target) !== target) fail(code);
  return target;
}

/** The version LibreOffice records beside its own binary; asking the binary costs a process. */
export function sofficeVersion(sofficePath) {
  try {
    const text = readFileSync(join(resolve(sofficePath), '..', 'version.ini'), 'utf8');
    const build = /^buildid=(.+)$/mu.exec(text);
    const update = /^UpdateID=LibreOffice_([0-9_]+)_/mu.exec(text);
    return { buildid: build ? build[1].trim() : null, update_id: update ? update[1] : null };
  } catch { return { buildid: null, update_id: null }; }
}

async function runWorker({ interpreter, worker, request, timeoutMs }) {
  const payload = Buffer.from(JSON.stringify(request), 'utf8');
  return new Promise((resolvePromise, reject) => {
    let settled = false, killed = false, size = 0, timer = null;
    const chunks = [];
    const settle = (action, value) => { if (!settled) { settled = true; clearTimeout(timer); action(value); } };
    // `-E` keeps every PYTHON* variable out, so UTF-8 mode is a flag rather than
    // an environment setting. `-I` is deliberately not used: it implies `-s`, and
    // on this host PyMuPDF is installed in the user site-packages while the other
    // parsers are in the interpreter's own, so `-I` makes the renderer invisible
    // (`renderer_unavailable`) while the text parsers work. The packages the tool
    // configuration declares are what a caller checks against.
    const child = spawn(interpreter, ['-E', '-B', '-X', 'utf8', worker],
      { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, env: workerEnv() });
    timer = setTimeout(() => { killed = true; child.kill(); }, timeoutMs);
    child.on('error', () => settle(reject, new AttachmentDerivationError('attachment_worker_unavailable')));
    child.stdin.on('error', () => {});
    child.stdout.on('data', bytes => {
      size += bytes.length;
      if (size > MAX_WORKER_OUTPUT_BYTES) { killed = true; child.kill(); return; }
      chunks.push(bytes);
    });
    child.on('close', code => {
      if (killed) return settle(reject, new AttachmentDerivationError('attachment_worker_timeout'));
      let output;
      try { output = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return settle(reject, new AttachmentDerivationError('attachment_worker_output_invalid')); }
      settle(resolvePromise, { exit_code: code, output });
    });
    child.stdin.end(payload);
  });
}

// A short allow-list, not the caller's environment: nothing a parent process
// carries can redirect a parser. `APPDATA` is on it because Windows Python
// derives the user site-packages directory from it, and on this host PyMuPDF
// lives there -- without it the renderer is simply not importable.
function workerEnv() {
  const keep = ['SYSTEMROOT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA'];
  const env = Object.fromEntries(keep.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  return { ...env, NO_PROXY: '*', no_proxy: '*' };
}

async function runSoffice({ sofficePath, sourcePath, outDir, profileDir, timeoutMs }) {
  return new Promise(resolvePromise => {
    let settled = false, timer = null;
    const settle = value => { if (!settled) { settled = true; clearTimeout(timer); resolvePromise(value); } };
    const child = spawn(sofficePath, ['--headless', '--norestore', '--invisible', '--nolockcheck', '--nodefault',
      `-env:UserInstallation=${pathToFileURL(profileDir).href}`, '--convert-to', 'pdf', '--outdir', outDir, sourcePath],
    { stdio: 'ignore', windowsHide: true, env: workerEnv() });
    timer = setTimeout(() => { child.kill(); settle({ ok: false, code: 'render_converter_timeout' }); }, timeoutMs);
    child.on('error', () => settle({ ok: false, code: 'render_converter_unavailable' }));
    child.on('close', code => settle(code === 0 ? { ok: true, code: null } : { ok: false, code: 'render_converter_failed' }));
  });
}

/** The recipe a cached result was made by. Equal recipes may be re-used; anything else re-runs. */
export function derivationRecipe({ tools, format }) {
  return {
    format,
    text_worker_sha256: fileDigest(TEXT_WORKER),
    render_worker_sha256: fileDigest(RENDER_WORKER),
    interpreter_sha256: fileDigest(tools.interpreter_path),
    python_packages: { ...tools.python_packages },
    soffice: sofficeVersion(tools.soffice_path),
    schema: ATTACHMENT_DERIVATION_SCHEMA,
  };
}

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/**
 * The derivation context a source adapter takes: the admitted tools and the
 * function that turns verified bytes into an extract. The default is this
 * module's own deriveAttachment; a test passes a canned one so no interpreter
 * runs.
 */
export function derivationContext({ tools, derive = deriveAttachment } = {}) {
  if (tools === null || typeof tools !== 'object' || typeof tools.derived_root !== 'string') fail('tools_config_unreadable');
  if (typeof derive !== 'function') fail('attachment_derivation_invalid');
  return Object.freeze({ tools, derive });
}

/**
 * Extracts one attachment's text (and, when asked, its page images) into the
 * cache. `bytes` are the verified bytes; `sha256` is the digest they were
 * verified against. Returns the extraction, the cached locators, the recipe the
 * extract was made with and the counts a receipt records. Never throws for a
 * file a parser cannot read -- that is a status, not a crash.
 */
export async function deriveAttachment({ tools, bytes, sha256, mime = null, name = null, source = {},
  render = false, now = () => new Date() } = {}) {
  const hex = String(sha256 ?? '').replace(/^sha256:/u, '');
  if (!HEX.test(hex)) fail('attachment_digest_invalid');
  const format = formatFor({ mime, name });
  const internal = { parser_calls: 0, render_calls: 0 };
  if (format === null || !SUPPORTED_FORMATS.includes(format) || tools.formats[format] !== true) {
    return { status: 'unsupported_format', format, extract: null, pages: [], cache: null, recipe: null, internal };
  }
  const interpreter = admitExecutable(tools.interpreter_path, 'attachment_interpreter_refused');
  const cacheDir = join(resolve(tools.derived_root), hex);
  const scratch = join(cacheDir, SCRATCH);
  const metaPath = join(cacheDir, META_FILE);
  const extractPath = join(cacheDir, EXTRACT_FILE);
  const recipe = derivationRecipe({ tools, format });
  const prefix = format === 'pptx' ? 'slide' : 'page';
  let meta = null;
  if (existsSync(metaPath)) {
    try { meta = JSON.parse(readFileSync(metaPath, 'utf8')); } catch { meta = null; }
  }
  const reusable = meta !== null && same(meta.recipe, recipe) && meta.original?.sha256 === `sha256:${hex}` && existsSync(extractPath);
  let extract = null;
  try {
    mkdirSync(cacheDir, { recursive: true });
    if (reusable) {
      extract = JSON.parse(readFileSync(extractPath, 'utf8'));
    } else {
      mkdirSync(scratch, { recursive: true });
      const sourcePath = join(scratch, `source.${format}`);
      writeFileSync(sourcePath, bytes);
      internal.parser_calls += 1;
      const answer = await runWorker({ interpreter, worker: TEXT_WORKER, timeoutMs: tools.worker_timeout_ms,
        request: { schema_version: TEXT_WORKER_SCHEMA, operation: 'extract', path: sourcePath, format, limits: tools.limits } });
      extract = answer.output;
      writeFileSync(extractPath, `${JSON.stringify(extract)}\n`, 'utf8');
      meta = { schema_version: ATTACHMENT_DERIVATION_SCHEMA,
        original: { sha256: `sha256:${hex}`, size_bytes: bytes.length, mime, name },
        source: { ...source }, recipe, created_at: now().toISOString(), pages: [] };
      writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    }
    if (extract?.status === 'error') {
      return { status: extract.code === 'unsupported_format' ? 'unsupported_format' : 'ok', format, extract,
        pages: [], cache: cacheRefs(tools, hex, []), recipe, internal };
    }
    let pages = Array.isArray(meta?.pages) ? meta.pages : [];
    if (render) {
      if (pages.length === 0 || !pages.every(page => existsSync(join(cacheDir, page.file)))) {
        mkdirSync(scratch, { recursive: true });
        let pdfPath = join(scratch, `source.${format}`);
        if (!existsSync(pdfPath)) writeFileSync(pdfPath, bytes);
        if (CONVERTIBLE.includes(format)) {
          const profileDir = join(scratch, 'lo-profile');
          mkdirSync(profileDir, { recursive: true });
          internal.render_calls += 1;
          const converted = await runSoffice({ sofficePath: admitExecutable(tools.soffice_path, 'attachment_renderer_refused'),
            sourcePath: pdfPath, outDir: scratch, profileDir, timeoutMs: tools.render_timeout_ms });
          pdfPath = join(scratch, 'source.pdf');
          if (!converted.ok || !existsSync(pdfPath)) {
            return { status: 'ok', format, extract, pages: [], cache: cacheRefs(tools, hex, []),
              render_unavailable: converted.code ?? 'render_converter_failed', recipe, internal };
          }
        } else if (format !== 'pdf') {
          return { status: 'ok', format, extract, pages: [], cache: cacheRefs(tools, hex, []),
            render_unavailable: 'render_not_applicable', recipe, internal };
        }
        internal.render_calls += 1;
        const rendered = await runWorker({ interpreter, worker: RENDER_WORKER, timeoutMs: tools.render_timeout_ms,
          request: { schema_version: RENDER_WORKER_SCHEMA, operation: 'render_pages', pdf_path: pdfPath,
            out_dir: cacheDir, prefix, dpi: tools.render.dpi, max_pages: tools.render.max_pages } });
        if (rendered.output?.status !== 'ok') {
          return { status: 'ok', format, extract, pages: [], cache: cacheRefs(tools, hex, []),
            render_unavailable: rendered.output?.code ?? 'render_failed', recipe, internal };
        }
        pages = rendered.output.pages;
        meta = { ...(meta ?? {}), pages, rendered_at: now().toISOString() };
        writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
      }
    }
    return { status: 'ok', format, extract, pages: render ? pages : [], cache: cacheRefs(tools, hex, render ? pages : []), recipe, internal };
  } finally {
    // The scratch copy of the original never outlives the call.
    try { rmSync(scratch, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

/** Locators relative to the configured derived root. The host path stays with the configuration. */
function cacheRefs(tools, hex, pages) {
  const base = `${tools.derived_root_alias}/${hex}`;
  return {
    base_alias: tools.derived_root_alias,
    extract: `${base}/${EXTRACT_FILE}`,
    meta: `${base}/${META_FILE}`,
    pages: pages.map(page => ({ page: page.page, locator: `${base}/${page.file}`, width: page.width, height: page.height })),
  };
}
