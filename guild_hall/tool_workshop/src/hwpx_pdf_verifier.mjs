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

export async function verifyRenderedHwpxPdf({pdfPath, pdfSha256, hwpxSha256, title, body, runRoot, binding, queue, lease, deadline}) {
  binding = structuredClone(binding);
  verifyHwpxPdfVerifierBinding(binding);
  workingRoot(runRoot); disjointRoots([runRoot, binding.pdf_root, ROOT]);
  if (!DIGEST.test(pdfSha256) || !DIGEST.test(hwpxSha256) || !inside(binding.pdf_root, path.resolve(pdfPath))
    || path.extname(pdfPath).toLowerCase() !== '.pdf') reject('pdf_input_invalid');
  queue.assertCurrentLease(lease, new Date().toISOString());
  const pdf = boundedRead(pdfPath, MAX);
  if (sha256(pdf) !== pdfSha256) reject('pdf_input_invalid');
  const qaRoot = mkdtempSync(path.join(runRoot, 'pdf-qa-'));
  const libraries = path.join(qaRoot, 'runtime'); mkdirSync(libraries);
  for (const entry of binding.library_files) {
    const bytes = boundedRead(path.join(binding.libraries[entry.package], entry.relative_path), 128 * 1024 * 1024, true);
    if (sha256(bytes) !== entry.sha256) reject('binding_drift');
    const target = path.join(libraries, entry.package, entry.relative_path);
    mkdirSync(path.dirname(target), {recursive: true}); writeFileSync(target, bytes, {flag: 'wx'});
  }
  const script = path.join(qaRoot, 'hwpx_pdf_readback.py');
  writeFileSync(script, boundedRead(path.join(ROOT, SCRIPT), MAX), {flag: 'wx'});
  writeFileSync(path.join(qaRoot, 'rendered.pdf'), pdf, {flag: 'wx'});
  writeFileSync(path.join(qaRoot, 'pdf-readback-request.json'), JSON.stringify({pdf_sha256: pdfSha256, hwpx_sha256: hwpxSha256, title, body}), {flag: 'wx'});
  const readback = mode => runBoundedToolProcess({executable: binding.python_executable,
    args: ['-I', '-S', '-B', '-X', `pycache_prefix=${path.join(qaRoot, 'cache')}`, script, mode, qaRoot, libraries],
    runRoot: qaRoot, queue, lease, deadline});
  const inspected = await readback('inspect');
  if (inspected.pdf_sha256 !== pdfSha256 || inspected.hwpx_sha256 !== hwpxSha256 || inspected.page_count !== 1) reject('validator_failed');
  const pngPath = path.join(qaRoot, 'page-1.png'), fd = openSync(pngPath, 'wx');
  try {
    await runBoundedToolProcess({executable: binding.poppler_executable,
      args: ['-png', '-singlefile', '-f', '1', '-l', '1', '-scale-to-x', '794', '-scale-to-y', '1123', path.join(qaRoot, 'rendered.pdf')],
      runRoot: qaRoot, queue, lease, deadline, resultFormat: 'exit_code', stdoutFd: fd});
    fsyncSync(fd);
  } finally {closeSync(fd);}
  const checked = await readback('validate'), png = boundedRead(pngPath, MAX);
  if (checked.pdf_sha256 !== pdfSha256 || checked.hwpx_sha256 !== hwpxSha256 || checked.page_count !== 1
    || checked.renders?.length !== 1 || checked.renders[0].sha256 !== sha256(png)
    || checked.renders[0].size_bytes !== png.length || !checked.text_readback || !checked.restricted_features_absent) reject('validator_failed');
  verifyHwpxPdfVerifierBinding(binding);
  queue.assertCurrentLease(lease, new Date().toISOString());
  if (sha256(boundedRead(pdfPath, MAX)) !== pdfSha256) reject('pdf_input_changed');
  return {pdf_path: path.join(qaRoot, 'rendered.pdf'), pdf_sha256: pdfSha256, pdf_size_bytes: pdf.length,
    hwpx_sha256: hwpxSha256, page_count: 1, image_paths: [pngPath], renders: checked.renders,
    render_manifest_digest: sha256(JSON.stringify(checked.renders)), visual_review_required: true};
}
