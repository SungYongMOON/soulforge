import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {closeSync, fsyncSync, mkdirSync, mkdtempSync, openSync, readdirSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runBoundedToolProcess} from './bounded_tool_process.mjs';
import {boundedRead, directPath, disjointRoots, exactKeys, reject, sha256} from './workshop_files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SCRIPT = 'guild_hall/tool_workshop/src/hwpx_pdf_readback.py';
const SOURCES = [SCRIPT, 'guild_hall/tool_workshop/src/hwpx_pdf_verifier.mjs',
  'guild_hall/tool_workshop/src/bounded_tool_process.mjs', 'guild_hall/tool_workshop/src/workshop_files.mjs'];
const MAX = 8 * 1024 * 1024;
const DIGEST = /^[a-f0-9]{64}$/u;
const inside = (root, file) => {const rel = path.relative(root, file); return rel !== '' && !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel);};

function workingRoot(value) {
  const root = directPath(value, true);
  if (/(?:^|[\\/])(?:_workspaces|_workmeta|private-state|install|source-lanes)(?:[\\/]|$)/iu.test(root)) reject('pdf_working_root_required');
  return root;
}

function filesBelow(root, accept, prefix = '') {
  directPath(root, true);
  const found = [];
  for (const item of readdirSync(root, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
    if (item.name === '__pycache__') continue;
    const file = path.join(root, item.name), relative_path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isSymbolicLink()) reject('binding_drift');
    if (item.isDirectory()) found.push(...filesBelow(file, accept, relative_path));
    else if (accept(item.name)) found.push({relative_path, sha256: sha256(boundedRead(file, 128 * 1024 * 1024, true))});
  }
  return found;
}

function pythonIdentity(executable) {
  directPath(executable);
  const program = `import json,os,pathlib,sys,pypdf,PIL.Image,PIL.ImageChops,PIL.PngImagePlugin
root=pathlib.Path(sys.base_prefix).resolve(); libraries={'pypdf':str(pathlib.Path(pypdf.__file__).parent),'PIL':str(pathlib.Path(PIL.__file__).parent)}
extra=pathlib.Path(PIL.__file__).parent.parent/'pillow.libs'
if extra.is_dir(): libraries['pillow.libs']=str(extra)
files=set()
for module in list(sys.modules.values()):
 p=getattr(module,'__file__',None)
 if p and os.path.isfile(p) and 'site-packages' not in pathlib.Path(p).parts: files.add(os.path.abspath(p))
for folder in [root,root/'DLLs']:
 if folder.is_dir(): files.update(str(p) for p in folder.glob('*.dll'))
print(json.dumps({'version':sys.version.split()[0],'pypdf':pypdf.__version__,'pillow':PIL.__version__,'libraries':libraries,'files':sorted(files)}))`;
  const cache = path.join(os.tmpdir(), `sf-pdf-probe-${randomUUID()}`);
  const run = spawnSync(executable, ['-I', '-B', '-X', `pycache_prefix=${cache}`, '-c', program],
    {encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 65536, env: {SystemRoot: process.env.SystemRoot ?? ''}});
  if (run.status !== 0) reject('pdf_python_runtime_unavailable');
  let info; try {info = JSON.parse(run.stdout);} catch {reject('pdf_python_runtime_unavailable');}
  if (!/^3\.12\.\d+$/u.test(info.version)) reject('pdf_python_runtime_unavailable');
  const pythonRoot = path.dirname(executable);
  for (const file of [...info.files, ...Object.values(info.libraries)]) {
    if (!inside(pythonRoot, directPath(file, Object.values(info.libraries).includes(file)))) reject('pdf_python_runtime_unavailable');
  }
  return info;
}

// Trusted bootstrap. Runtime and source changes require a new explicit pin;
// verify never repairs a stale binding or searches for another installation.
export function pinHwpxPdfVerifierBinding({pythonExecutable, popplerExecutable, pdfRoot}) {
  workingRoot(pdfRoot); directPath(popplerExecutable);
  const python = pythonIdentity(pythonExecutable);
  const library_files = Object.entries(python.libraries).flatMap(([name, root]) =>
    filesBelow(root, file => /\.(?:py|pyd|dll|so|dylib)$/iu.test(file)).map(file => ({...file, package: name})));
  const popplerRoot = path.dirname(popplerExecutable);
  const poppler_files = filesBelow(popplerRoot, file => /\.(?:exe|dll|so|dylib)$/iu.test(file));
  return {code_root: ROOT, pdf_root: pdfRoot, python_executable: pythonExecutable,
    python_sha256: sha256(boundedRead(pythonExecutable, 128 * 1024 * 1024)), python_version: python.version,
    python_files: python.files.map(file => ({path: file, sha256: sha256(boundedRead(file, 128 * 1024 * 1024, true))})),
    libraries: python.libraries, library_files, pypdf_version: python.pypdf, pillow_version: python.pillow,
    poppler_executable: popplerExecutable, poppler_files,
    sources: SOURCES.map(relative_path => ({relative_path, sha256: sha256(boundedRead(path.join(ROOT, relative_path), MAX))}))};
}

export function verifyHwpxPdfVerifierBinding(binding) {
  exactKeys(binding, ['code_root', 'pdf_root', 'python_executable', 'python_sha256', 'python_version',
    'python_files', 'libraries', 'library_files', 'pypdf_version', 'pillow_version', 'poppler_executable', 'poppler_files', 'sources']);
  if (binding.code_root !== ROOT || !Array.isArray(binding.sources) || binding.sources.length !== SOURCES.length) reject('binding_drift');
  // Verification is read-only byte comparison. Re-running the bootstrap probe
  // could import modified live packages before discovering their hash drift.
  workingRoot(binding.pdf_root); directPath(binding.python_executable); directPath(binding.poppler_executable);
  if (!/^3\.12\.\d+$/u.test(binding.python_version) || !DIGEST.test(binding.python_sha256)
    || sha256(boundedRead(binding.python_executable, 128 * 1024 * 1024)) !== binding.python_sha256
    || !Array.isArray(binding.python_files) || !binding.python_files.length || binding.python_files.length > 1024) reject('binding_drift');
  const pythonRoot = path.dirname(binding.python_executable);
  for (const pin of binding.python_files) {
    exactKeys(pin, ['path', 'sha256']);
    if (!inside(pythonRoot, directPath(pin.path)) || !DIGEST.test(pin.sha256)
      || sha256(boundedRead(pin.path, 128 * 1024 * 1024, true)) !== pin.sha256) reject('binding_drift');
  }
  const names = Object.keys(binding.libraries ?? {});
  if (!names.includes('pypdf') || !names.includes('PIL') || names.some(name => !['pypdf', 'PIL', 'pillow.libs'].includes(name))) reject('binding_drift');
  const libraries = Object.entries(binding.libraries).flatMap(([name, libraryRoot]) => {
    if (!inside(pythonRoot, directPath(libraryRoot, true))) reject('binding_drift');
    return filesBelow(libraryRoot, file => /\.(?:py|pyd|dll|so|dylib)$/iu.test(file)).map(file => ({...file, package: name}));
  });
  if (JSON.stringify(libraries) !== JSON.stringify(binding.library_files)
    || JSON.stringify(filesBelow(path.dirname(binding.poppler_executable), file => /\.(?:exe|dll|so|dylib)$/iu.test(file))) !== JSON.stringify(binding.poppler_files)) reject('binding_drift');
  for (let i = 0; i < SOURCES.length; i++) {
    const pin = binding.sources[i]; exactKeys(pin, ['relative_path', 'sha256']);
    if (pin.relative_path !== SOURCES[i] || sha256(boundedRead(path.join(ROOT, SOURCES[i]), MAX)) !== pin.sha256) reject('binding_drift');
  }
  return sha256(JSON.stringify(binding));
}

export async function verifyRenderedHwpxPdf({pdfPath, pdfSha256, hwpxSha256, title, body, expectedText, expectedPageCount,
  runRoot, binding, queue, lease, deadline}) {
  const multi = expectedText !== undefined;
  if (multi && (!Array.isArray(expectedText) || expectedText.length < 1 || expectedText.length > 4096
    || expectedText.some(value => typeof value !== 'string' || !value.trim() || value.length > 32768)
    || expectedText.reduce((sum, value) => sum + value.length, 0) > 262144)
    || expectedPageCount !== undefined && (!multi || !Number.isInteger(expectedPageCount) || expectedPageCount < 1 || expectedPageCount > 64)) reject('pdf_input_invalid');
  let checkSnapshot = () => {};
  const guardedQueue = {assertCurrentLease(...args) {
    queue.assertCurrentLease(...args);
    // A lease callback can change local files. Check after that callback,
    // including the bounded child's last lease check before spawning.
    checkSnapshot();
  }};
  const assertActive = () => {
    guardedQueue.assertCurrentLease(lease, new Date().toISOString());
    if (!Number.isFinite(deadline) || performance.now() >= deadline || Date.parse(lease.expires_at) <= Date.now()) reject('runner_timeout');
  };
  assertActive();
  binding = structuredClone(binding);
  verifyHwpxPdfVerifierBinding(binding);
  workingRoot(runRoot); disjointRoots([runRoot, binding.pdf_root, ROOT]);
  if (!DIGEST.test(pdfSha256) || !DIGEST.test(hwpxSha256) || !inside(binding.pdf_root, path.resolve(pdfPath))
    || path.extname(pdfPath).toLowerCase() !== '.pdf') reject('pdf_input_invalid');
  assertActive();
  const pdf = boundedRead(pdfPath, MAX);
  if (sha256(pdf) !== pdfSha256) reject('pdf_input_invalid');
  const qaRoot = mkdtempSync(path.join(runRoot, 'pdf-qa-'));
  const libraries = path.join(qaRoot, 'runtime'); mkdirSync(libraries);
  for (const entry of binding.library_files) {
    assertActive();
    const bytes = boundedRead(path.join(binding.libraries[entry.package], entry.relative_path), 128 * 1024 * 1024, true);
    if (sha256(bytes) !== entry.sha256) reject('binding_drift');
    const target = path.join(libraries, entry.package, entry.relative_path);
    mkdirSync(path.dirname(target), {recursive: true}); writeFileSync(target, bytes, {flag: 'wx'});
  }
  const script = path.join(qaRoot, 'hwpx_pdf_readback.py');
  writeFileSync(script, boundedRead(path.join(ROOT, SCRIPT), MAX), {flag: 'wx'});
  writeFileSync(path.join(qaRoot, 'rendered.pdf'), pdf, {flag: 'wx'});
  const request = {pdf_sha256: pdfSha256, hwpx_sha256: hwpxSha256,
    ...(multi ? {expected_text: expectedText, ...(expectedPageCount === undefined ? {} : {expected_page_count: expectedPageCount})} : {title, body})};
  const requestBytes = Buffer.from(JSON.stringify(request));
  writeFileSync(path.join(qaRoot, 'pdf-readback-request.json'), requestBytes, {flag: 'wx'});
  const snapshotFiles = new Map(binding.library_files.map(entry => [`${entry.package}/${entry.relative_path}`, entry.sha256]));
  const snapshotDirectories = new Set();
  for (const file of snapshotFiles.keys()) {
    const parts = file.split('/');
    for (let size = 1; size < parts.length; size++) snapshotDirectories.add(parts.slice(0, size).join('/'));
  }
  checkSnapshot = () => {
    if (sha256(boundedRead(script, MAX)) !== binding.sources[0].sha256
      || sha256(boundedRead(path.join(qaRoot, 'pdf-readback-request.json'), 2 * 1024 * 1024)) !== sha256(requestBytes)) reject('binding_drift');
    const seen = new Set(), directories = new Set();
    const walk = (directory, prefix = '') => {
      directPath(directory, true);
      for (const entry of readdirSync(directory, {withFileTypes: true})) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name, file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!snapshotDirectories.has(relative)) reject('binding_drift');
          directories.add(relative); walk(file, relative);
        } else {
          if (!snapshotFiles.has(relative) || sha256(boundedRead(file, 128 * 1024 * 1024, true)) !== snapshotFiles.get(relative)) reject('binding_drift');
          seen.add(relative);
        }
      }
    };
    walk(libraries);
    if (seen.size !== snapshotFiles.size || directories.size !== snapshotDirectories.size) reject('binding_drift');
  };
  const readback = mode => runBoundedToolProcess({executable: binding.python_executable,
    args: ['-I', '-S', '-B', '-X', `pycache_prefix=${path.join(qaRoot, 'cache')}`, script, mode, qaRoot, libraries],
    runRoot: qaRoot, queue: guardedQueue, lease, deadline});
  const inspected = await readback('inspect');
  const pageCount = inspected.page_count, expectedCount = multi ? expectedPageCount : 1;
  if (inspected.pdf_sha256 !== pdfSha256 || inspected.hwpx_sha256 !== hwpxSha256
    || !Number.isInteger(pageCount) || pageCount < 1 || pageCount > 64
    || expectedCount !== undefined && pageCount !== expectedCount) reject('validator_failed');
  const imagePaths = [];
  for (let page = 1; page <= pageCount; page++) {
    assertActive();
    const pngPath = path.join(qaRoot, `page-${page}.png`), fd = openSync(pngPath, 'wx');
    try {
      await runBoundedToolProcess({executable: binding.poppler_executable,
        args: ['-png', '-singlefile', '-f', String(page), '-l', String(page), '-scale-to-x', '794', '-scale-to-y', '1123', path.join(qaRoot, 'rendered.pdf')],
        runRoot: qaRoot, queue: guardedQueue, lease, deadline, resultFormat: 'exit_code', stdoutFd: fd});
      fsyncSync(fd);
    } finally {closeSync(fd);}
    boundedRead(pngPath, MAX);
    imagePaths.push(pngPath);
  }
  const checked = await readback('validate');
  assertActive();
  const manifestPath = path.join(qaRoot, 'pdf-render-manifest.json'), manifestBytes = boundedRead(manifestPath, 32768);
  if (checked.pdf_sha256 !== pdfSha256 || checked.hwpx_sha256 !== hwpxSha256 || checked.page_count !== pageCount
    || checked.manifest_sha256 !== sha256(manifestBytes) || checked.manifest_size_bytes !== manifestBytes.length
    || checked.text_readback !== true || checked.restricted_features_absent !== true || checked.visual_review_required !== true) reject('validator_failed');
  let manifest;
  try {manifest = JSON.parse(manifestBytes);} catch {reject('validator_failed');}
  exactKeys(manifest, ['page_count', 'renders']);
  if (manifest.page_count !== pageCount || !Array.isArray(manifest.renders) || manifest.renders.length !== pageCount) reject('validator_failed');
  const pngNames = readdirSync(qaRoot).filter(name => /\.png$/iu.test(name)).sort();
  if (JSON.stringify(pngNames) !== JSON.stringify(imagePaths.map(file => path.basename(file)).sort())) reject('validator_failed');
  for (const [index, render] of manifest.renders.entries()) {
    assertActive();
    exactKeys(render, ['sha256', 'size_bytes', 'width', 'height']);
    const png = boundedRead(imagePaths[index], MAX);
    if (render.sha256 !== sha256(png) || render.size_bytes !== png.length || render.width !== 794 || render.height !== 1123) reject('validator_failed');
  }
  verifyHwpxPdfVerifierBinding(binding);
  assertActive();
  if (sha256(boundedRead(pdfPath, MAX)) !== pdfSha256 || sha256(boundedRead(path.join(qaRoot, 'rendered.pdf'), MAX)) !== pdfSha256) reject('pdf_input_changed');
  assertActive();
  return {pdf_path: path.join(qaRoot, 'rendered.pdf'), pdf_sha256: pdfSha256, pdf_size_bytes: pdf.length,
    hwpx_sha256: hwpxSha256, page_count: pageCount, page_count_basis: expectedCount === undefined ? 'observed' : 'expected_match',
    image_paths: imagePaths, renders: manifest.renders, render_manifest_path: manifestPath,
    render_manifest_sha256: sha256(manifestBytes), render_manifest_digest: sha256(JSON.stringify(manifest.renders)), visual_review_required: true};
}
