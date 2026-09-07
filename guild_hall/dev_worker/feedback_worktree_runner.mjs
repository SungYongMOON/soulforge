// Server-owned sparse source repair ports. This is not an OS sandbox: trusted
// proposers/reviewers and pinned validators must uphold their own authority and
// dependency contracts. No model, provider command, shell, merge, or activation
// is implemented here. Interrupted candidates remain for explicit local review.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { promises as fs, constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { normalizeTaskPacket } from './claim_task.mjs';
import { findDeniedAgentWritePaths } from '../shared/agent_write_boundary.mjs';

const HASH = /^[a-f0-9]{64}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonHash = value => sha(JSON.stringify(value));
const fail = code => { throw Object.assign(new Error(code), { feedbackCode: code }); };
const fold = value => process.platform === 'win32' ? value.toLowerCase() : value;
const samePath = (left, right) => fold(path.resolve(left)) === fold(path.resolve(right));
const inside = (root, target) => { const rel = path.relative(root, target); return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`)); };
const freeze = value => {
  const copy = structuredClone(value);
  const visit = part => { if (part && typeof part === 'object') { Object.values(part).forEach(visit); Object.freeze(part); } };
  visit(copy); return copy;
};

function sourcePath(value) {
  // Deliberately excludes quoting/escaping, root files, globs and platform aliases.
  if (typeof value !== 'string' || value.length > 240 || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/u.test(value)
    || value.split('/').some(bit => bit === '.' || bit === '..' || /[. ]$/u.test(bit)
      || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(bit)
      || /^\.(?:env|git)(?:[.-]|$)/iu.test(bit)
      || /(?:^|[_.-])(?:credentials?|secrets?|passwords?|tokens?|cookies?|sessions?)(?:[_.-]|$)/iu.test(bit))
    || /^(?:_workspaces|_workmeta|private-state)(?:\/|$)/iu.test(value)) fail('FEEDBACK_PATH_DENIED');
  return value;
}

function utf8(bytes, allowNul = false) {
  let value;
  try { value = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('FEEDBACK_NOT_UTF8'); }
  if ((!allowNul && value.includes('\0')) || !Buffer.from(value).equals(bytes)) fail('FEEDBACK_NOT_UTF8');
  return value;
}

function gitLine(bytes) {
  const text = utf8(bytes), match = /^([^\r\n]+)\r?\n$/u.exec(text);
  if (!match) fail('FEEDBACK_GIT_OUTPUT_INVALID');
  return match[1];
}

async function ordinaryRoot(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) fail('FEEDBACK_ROOT_INVALID');
  const root = path.resolve(value), stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(await fs.realpath(root), root)) fail('FEEDBACK_ROOT_INVALID');
  return root;
}

async function ordinaryFile(root, relative, maxBytes) {
  sourcePath(relative);
  const full = path.join(root, relative);
  if (!inside(root, full)) fail('FEEDBACK_PATH_DENIED');
  return pinnedFileRead(full, maxBytes);
}

// Open handles bind reads to the inspected file; parent and current-path checks
// detect replacement/reparse drift. This narrows observable races but is not an
// OS-enforced path sandbox or atomic executable dispatch primitive.
async function pinnedFileRead(full, maxBytes, requireSingleLink = true) {
  const sameIdentity = (left, right) => left.dev === right.dev && left.ino === right.ino && left.mode === right.mode;
  const sameFile = (left, right) => sameIdentity(left, right) && left.size === right.size && left.nlink === right.nlink
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
  const parentSnapshot = async () => {
    const result = [], parsed = path.parse(full);
    let current = parsed.root;
    for (const bit of path.relative(parsed.root, path.dirname(full)).split(path.sep).filter(Boolean)) {
      current = path.join(current, bit);
      const stat = await fs.lstat(current, { bigint: true });
      if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(await fs.realpath(current), current)) fail('FEEDBACK_FILE_INVALID');
      result.push({ path: current, stat });
    }
    return result;
  };
  const parents = await parentSnapshot();
  const before = await fs.lstat(full, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink < 1n || (requireSingleLink && before.nlink !== 1n) || before.size > BigInt(maxBytes)
    || !samePath(await fs.realpath(full), full)) fail('FEEDBACK_FILE_INVALID');
  const handle = await fs.open(full, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameFile(before, opened)) fail('FEEDBACK_FILE_INVALID');
    const bytes = Buffer.alloc(Number(before.size) + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = await handle.read(bytes, length, bytes.length - length, length);
      if (read.bytesRead === 0) break;
      length += read.bytesRead;
    }
    const after = await handle.stat({ bigint: true }), current = await fs.lstat(full, { bigint: true });
    if (length !== Number(before.size) || !sameFile(before, after) || !sameFile(before, current)
      || !current.isFile() || current.isSymbolicLink() || !samePath(await fs.realpath(full), full)) fail('FEEDBACK_FILE_INVALID');
    const finalParents = await parentSnapshot();
    if (parents.length !== finalParents.length || parents.some((entry, index) => entry.path !== finalParents[index].path
      || !sameIdentity(entry.stat, finalParents[index].stat))) fail('FEEDBACK_FILE_INVALID');
    return bytes.subarray(0, length);
  } finally { await handle.close(); }
}

async function pinExecutable(executable, expected) {
  if (typeof executable !== 'string' || !path.isAbsolute(executable) || !HASH.test(expected)) fail('FEEDBACK_EXECUTABLE_CHANGED');
  // Installed native tools may have installer-owned hardlinks (Git for Windows
  // does). Keep their link count stable and verify their exact pinned bytes;
  // writable source and candidate files still require a single link.
  try { if (sha(await pinnedFileRead(executable, 256_000_000, false)) !== expected) fail('FEEDBACK_EXECUTABLE_CHANGED'); }
  catch { fail('FEEDBACK_EXECUTABLE_CHANGED'); }
}

// Only a narrow ordinary unified-diff grammar is admitted. Git then independently
// parses numstat and --check, so extra headers and mode/rename/copy/binary forms
// cannot become a second interpretation of the same reviewer-approved bytes.
function inspectGrammar(patch, allowed, maxPatchBytes) {
  if (typeof patch !== 'string' || !patch.endsWith('\n') || Buffer.byteLength(patch) > maxPatchBytes || patch.includes('\0')) fail('FEEDBACK_PATCH_INVALID');
  utf8(Buffer.from(patch));
  const lines = patch.slice(0, -1).split('\n'), changed = [], stats = new Map();
  let i = 0;
  while (i < lines.length) {
    const header = /^diff --git a\/(\S+) b\/(\S+)$/u.exec(lines[i++]);
    if (!header || header[1] !== header[2]) fail('FEEDBACK_PATCH_INVALID');
    const file = sourcePath(header[1]);
    if (!allowed.includes(file) || changed.includes(file)) fail('FEEDBACK_PATCH_SCOPE');
    if (/^index [a-f0-9]{7,64}\.\.[a-f0-9]{7,64}(?: 100644)?$/u.test(lines[i] ?? '')) i++;
    if (lines[i++] !== `--- a/${file}` || lines[i++] !== `+++ b/${file}`) fail('FEEDBACK_PATCH_INVALID');
    let hunks = 0, added = 0, removed = 0;
    while (i < lines.length && !lines[i].startsWith('diff --git ')) {
      const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/u.exec(lines[i++]);
      if (!hunk) fail('FEEDBACK_PATCH_INVALID');
      let oldCount = Number(hunk[2] ?? 1), newCount = Number(hunk[4] ?? 1);
      if (![oldCount, newCount].every(n => Number.isSafeInteger(n) && n >= 0 && n <= maxPatchBytes)) fail('FEEDBACK_PATCH_INVALID');
      while (oldCount > 0 || newCount > 0) {
        const line = lines[i++];
        if (typeof line !== 'string') fail('FEEDBACK_PATCH_INVALID');
        if (line.startsWith(' ')) { oldCount--; newCount--; }
        else if (line.startsWith('-')) { oldCount--; removed++; }
        else if (line.startsWith('+')) { newCount--; added++; }
        else fail('FEEDBACK_PATCH_INVALID');
        if (oldCount < 0 || newCount < 0) fail('FEEDBACK_PATCH_INVALID');
        if (lines[i] === '\\ No newline at end of file') i++;
      }
      hunks++;
    }
    if (!hunks || added + removed === 0) fail('FEEDBACK_PATCH_INVALID');
    changed.push(file); stats.set(file, `${added}\t${removed}`);
  }
  if (changed.length === 0) fail('FEEDBACK_PATCH_INVALID');
  return { changed, stats };
}

/**
 * All configuration comes from trusted server code, never an issue or packet.
 * validationCatalog entries contain check_id, native executable/hash, fixed argv
 * whose first item is a repo-relative entry file, and file_pins for the complete
 * fixed dependency closure. Candidate dependencies belong in allowedFiles.
 * authorizeInput(packet, sourceRefs, context) authorizes the exact current input
 * before proposePatch({packet,sources,author_ref,context}) receives source bytes.
 * inspectPatch receives those refs plus exact patch bytes/hash and must return
 * ACCEPT with matching hash, author_ref, distinct configured reviewer_ref and
 * review_ref. These trusted ports are not inferred from packet approval fields.
 */
export function createFeedbackWorktreeRunner(config = {}) {
  const { proposePatch, inspectPatch, authorizeInput } = config;
  if (![proposePatch, inspectPatch, authorizeInput].every(fn => typeof fn === 'function') || proposePatch === inspectPatch) throw new TypeError('feedback_worktree_ports_required');
  const fixed = freeze(Object.fromEntries(Object.entries(config).filter(([key]) => !['proposePatch', 'inspectPatch', 'authorizeInput'].includes(key))));
  const { repoRoot: configuredRepo, worktreeRoot: configuredTrees, baseCommit, git: gitPin, allowedFiles,
    validationCatalog, authorRef, patchReviewerRef } = fixed;
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(baseCommit ?? '') || !REF.test(authorRef ?? '') || !REF.test(patchReviewerRef ?? '') || authorRef === patchReviewerRef
    || !Array.isArray(allowedFiles) || allowedFiles.length < 1 || allowedFiles.length > 32
    || new Set(allowedFiles.map(x => String(x).toLowerCase())).size !== allowedFiles.length
    || !Array.isArray(validationCatalog) || validationCatalog.length < 1 || validationCatalog.length > 16) throw new TypeError('feedback_worktree_config_invalid');
  for (const file of allowedFiles) sourcePath(file);
  if (findDeniedAgentWritePaths(allowedFiles).length || allowedFiles.some(file => /^guild_hall\/dev_worker\/feedback_(?:cycle|worktree_runner|linear_source|watchdog)(?:\.|\/)/iu.test(file))) fail('FEEDBACK_PATH_DENIED');
  const catalog = new Map(), closure = new Map();
  for (const command of validationCatalog) {
    if (!REF.test(command.check_id ?? '') || catalog.has(command.check_id) || !Array.isArray(command.argv) || command.argv.length < 1 || command.argv.length > 32
      || command.argv.some(arg => typeof arg !== 'string' || arg.length > 500 || /[\u0000-\u001f]/u.test(arg))
      || !Array.isArray(command.file_pins) || command.file_pins.length < 1 || command.file_pins.length > 64) fail('FEEDBACK_VALIDATOR_INVALID');
    for (const pin of command.file_pins) {
      sourcePath(pin.path);
      if (!HASH.test(pin.sha256) || allowedFiles.some(file => file.toLowerCase() === pin.path.toLowerCase())
        || (closure.has(pin.path) && closure.get(pin.path) !== pin.sha256)) fail('FEEDBACK_VALIDATOR_INVALID');
      closure.set(pin.path, pin.sha256);
    }
    if (!command.file_pins.some(pin => pin.path === command.argv[0])) fail('FEEDBACK_VALIDATOR_INVALID');
    catalog.set(command.check_id, command);
  }
  if (new Set([...allowedFiles, ...closure.keys()].map(file => file.toLowerCase())).size !== allowedFiles.length + closure.size) fail('FEEDBACK_VALIDATOR_INVALID');
  const maxSourceBytes = fixed.maxSourceBytes ?? 512_000, maxPatchBytes = fixed.maxPatchBytes ?? 256_000;
  const maxLogBytes = fixed.maxLogBytes ?? 65_536, childTimeoutMs = fixed.childTimeoutMs ?? 30_000;
  for (const [value, limit] of [[maxSourceBytes, 2_000_000], [maxPatchBytes, 1_000_000], [maxLogBytes, 1_000_000], [childTimeoutMs, 60_000]]) {
    if (!Number.isInteger(value) || value < 1 || value > limit) fail('FEEDBACK_LIMIT_INVALID');
  }
  const records = new Map(), candidates = new Map();
  let activeChildren = 0, activeOperation = false;
  const sealedEnv = Object.freeze({
    ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR } : {}),
    LANG: 'C', LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_LITERAL_PATHSPECS: '1',
    GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1',
  });

  function alive(context) {
    if (!context || !REF.test(context.run_ref ?? '') || !Number.isFinite(Date.parse(context.deadline_at)) || Date.parse(context.deadline_at) - Date.now() > 600_000
      || !context.signal || typeof context.signal.addEventListener !== 'function') fail('FEEDBACK_CONTEXT_INVALID');
    if (context.signal.aborted || Date.parse(context.deadline_at) <= Date.now()) fail('FEEDBACK_CHILD_INTERRUPTED');
  }

  async function run(executable, expectedHash, args, cwd, context, record, { input, cap = maxLogBytes, allowFailure = false } = {}) {
    alive(context); await pinExecutable(executable, expectedHash); alive(context);
    return new Promise((resolve, reject) => {
      let ended = false, interrupted = false, overflow = false, errorCode = null;
      const outputs = [], stdoutHash = createHash('sha256'), stderrHash = createHash('sha256');
      let stdoutBytes = 0, stderrBytes = 0;
      const child = spawn(executable, args, { cwd, env: sealedEnv, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      activeChildren++; record.state = 'execution_unknown';
      const stop = () => { interrupted = true; if (!ended) child.kill(); };
      const timer = setTimeout(stop, Math.min(childTimeoutMs, Math.max(1, Date.parse(context.deadline_at) - Date.now())));
      context.signal.addEventListener('abort', stop, { once: true });
      if (context.signal.aborted) stop();
      child.stdout.on('data', bytes => { stdoutBytes += bytes.length; stdoutHash.update(bytes); if (stdoutBytes <= cap) outputs.push(bytes); else { overflow = true; stop(); } });
      child.stderr.on('data', bytes => { stderrBytes += bytes.length; stderrHash.update(bytes); if (stderrBytes > cap) { overflow = true; stop(); } });
      child.on('error', () => { errorCode = 'FEEDBACK_CHILD_FAILED'; });
      child.stdin.on('error', () => {});
      child.on('close', (code, signal) => {
        ended = true; clearTimeout(timer); context.signal.removeEventListener('abort', stop); activeChildren--;
        record.logs.push({ log_ref: `feedback-worktree.log.${sha(`${context.run_ref}:${record.logs.length}`).slice(0, 24)}`,
          stdout_sha256: stdoutHash.digest('hex'), stderr_sha256: stderrHash.digest('hex'), stdout_bytes: stdoutBytes,
          stderr_bytes: stderrBytes, exit_code: code, signaled: Boolean(signal), closed: true });
        record.state = 'child_closed';
        const failure = overflow ? 'FEEDBACK_LOG_LIMIT' : interrupted ? 'FEEDBACK_CHILD_INTERRUPTED' : errorCode ?? ((!allowFailure && code !== 0) ? 'FEEDBACK_CHILD_FAILED' : null);
        if (failure) reject(Object.assign(new Error(failure), { feedbackCode: failure }));
        else resolve({ stdout: Buffer.concat(outputs), code, log_ref: record.logs.at(-1).log_ref });
      });
      child.stdin.end(input);
    });
  }

  async function roots() {
    const repo = await ordinaryRoot(configuredRepo), trees = await ordinaryRoot(configuredTrees);
    if (inside(repo, trees) || inside(trees, repo)) fail('FEEDBACK_ROOT_OVERLAP');
    for (const executable of [gitPin?.executable, ...validationCatalog.map(command => command.executable)]) {
      if (typeof executable !== 'string' || !path.isAbsolute(executable) || inside(trees, executable)
        || allowedFiles.some(file => samePath(path.join(repo, file), executable))) fail('FEEDBACK_EXECUTABLE_CHANGED');
    }
    return { repo, trees };
  }

  function gitArgs(args) {
    return ['-c', 'core.hooksPath=' + (process.platform === 'win32' ? 'NUL' : '/dev/null'), '-c', 'core.fsmonitor=false', '-c', 'core.splitIndex=false',
      '-c', 'core.untrackedCache=false', '-c', 'core.attributesFile=' + (process.platform === 'win32' ? 'NUL' : '/dev/null'),
      '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-c', 'diff.external=', ...args];
  }
  const git = (args, cwd, ctx, record, options) => run(gitPin?.executable, gitPin?.sha256, gitArgs(args), cwd, ctx, record, options);

  async function assertBase(repo, ctx, record) {
    const head = gitLine((await git(['rev-parse', '--verify', 'HEAD'], repo, ctx, record)).stdout);
    const top = gitLine((await git(['rev-parse', '--show-toplevel'], repo, ctx, record)).stdout);
    const status = (await git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], repo, ctx, record)).stdout;
    const lock = gitLine((await git(['rev-parse', '--git-path', 'index.lock'], repo, ctx, record)).stdout);
    const locked = await fs.lstat(path.resolve(repo, lock)).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
    if (head !== baseCommit || !samePath(top, repo) || status.length || locked) fail('FEEDBACK_BASE_CHANGED');
  }

  async function loadSource(repo, file, ctx, record) {
    const tree = utf8((await git(['ls-tree', '-z', baseCommit, '--', file], repo, ctx, record)).stdout, true);
    const match = /^100644 blob ([a-f0-9]{40}(?:[a-f0-9]{24})?)\t([^\0]+)\0$/u.exec(tree);
    if (!match || match[2] !== file) fail('FEEDBACK_FILE_INVALID');
    const bytes = (await git(['cat-file', 'blob', match[1]], repo, ctx, record, { cap: maxSourceBytes })).stdout;
    const content = utf8(bytes);
    if (!Buffer.from(await ordinaryFile(repo, file, maxSourceBytes)).equals(bytes)) fail('FEEDBACK_BASE_CHANGED');
    return { path: file, base_commit: baseCommit, blob_oid: match[1], source_ref: `git-blob.${match[1]}`,
      sha256: sha(bytes), bytes: bytes.length, content };
  }

  function normalize(packet) {
    const pinned = freeze(packet);
    if (Buffer.byteLength(JSON.stringify(pinned)) > maxSourceBytes) fail('FEEDBACK_PACKET_INVALID');
    const task = normalizeTaskPacket(pinned, { packet_path: 'feedback.yaml', packet_ref: 'feedback.input' });
    if (pinned.schema_version !== 'soulforge.dev_worker_request.v0' || !task.eligible || !task.draft_branch_allowed
      || !Array.isArray(pinned.allowed_write_paths) || !Array.isArray(pinned.acceptance_checks)
      || pinned.allowed_write_paths.length !== task.allowed_write_paths.length || pinned.acceptance_checks.length !== task.acceptance_checks.length
      || pinned.allowed_write_paths.some((file, index) => file !== task.allowed_write_paths[index] || !allowedFiles.includes(file))
      || pinned.acceptance_checks.some((id, index) => id !== task.acceptance_checks[index] || !catalog.has(id))) fail('FEEDBACK_PACKET_INVALID');
    return { pinned, task };
  }

  async function materialize(trees, worktree, sources) {
    await ordinaryRoot(trees); await ordinaryRoot(worktree);
    for (const source of sources) {
      let directory = worktree;
      for (const bit of source.path.split('/').slice(0, -1)) {
        directory = path.join(directory, bit);
        await fs.mkdir(directory).catch(error => { if (error.code !== 'EEXIST') throw error; });
        await ordinaryRoot(directory);
      }
      await fs.writeFile(path.join(worktree, source.path), source.content, { flag: 'wx', encoding: 'utf8' });
    }
  }

  async function assertCandidate(saved, ctx, record) {
    await ordinaryRoot(saved.worktree);
    // Inspect the physical sparse tree too: ignored files must not silently add
    // dependencies or mutable state that Git's usual status omits.
    const expectedPaths = new Set(saved.files.map(file => file.path));
    const walk = async (directory, relative = '') => {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const rel = relative ? `${relative}/${entry.name}` : entry.name;
        if (rel === '.git') {
          const stat = await fs.lstat(path.join(directory, entry.name));
          if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || sha(await pinnedFileRead(path.join(directory, entry.name), 4096)) !== saved.gitFileHash) fail('FEEDBACK_CANDIDATE_CHANGED');
        } else if (entry.isDirectory() && [...expectedPaths].some(file => file.startsWith(`${rel}/`))) {
          await ordinaryRoot(path.join(directory, entry.name)); await walk(path.join(directory, entry.name), rel);
        } else if (!entry.isFile() || !expectedPaths.has(rel)) fail('FEEDBACK_CANDIDATE_CHANGED');
      }
    };
    await walk(saved.worktree);
    const head = gitLine((await git(['rev-parse', '--verify', 'HEAD'], saved.worktree, ctx, record)).stdout);
    const branch = gitLine((await git(['symbolic-ref', '--short', 'HEAD'], saved.worktree, ctx, record)).stdout);
    if (head !== baseCommit || branch !== saved.candidate.branch_ref) fail('FEEDBACK_CANDIDATE_CHANGED');
    for (const file of saved.files) {
      try {
        if (sha(await ordinaryFile(saved.worktree, file.path, maxSourceBytes)) !== file.sha256) fail('FEEDBACK_CANDIDATE_CHANGED');
      } catch { fail('FEEDBACK_CANDIDATE_CHANGED'); }
    }
    const diff = utf8((await git(['diff', '--no-ext-diff', '--no-textconv', '--name-status', '-z', 'HEAD', '--'], saved.worktree, ctx, record)).stdout, true);
    const chunks = diff.split('\0');
    if (chunks.pop() !== '' || chunks.length !== saved.changed.length * 2) fail('FEEDBACK_CANDIDATE_CHANGED');
    const actual = [];
    for (let i = 0; i < chunks.length; i += 2) { if (chunks[i] !== 'M') fail('FEEDBACK_CANDIDATE_CHANGED'); actual.push(chunks[i + 1]); }
    if (JSON.stringify(actual.sort()) !== JSON.stringify([...saved.changed].sort())) fail('FEEDBACK_CANDIDATE_CHANGED');
    const untracked = (await git(['ls-files', '--others', '-z', '--exclude-standard'], saved.worktree, ctx, record)).stdout;
    if (untracked.length) fail('FEEDBACK_CANDIDATE_CHANGED');
  }

  async function execute(packet, context) {
    alive(context);
    if (activeOperation) fail('FEEDBACK_RUN_BUSY');
    if (records.has(context.run_ref)) fail('FEEDBACK_RUN_REUSED');
    if (records.size >= 1000) fail('FEEDBACK_HISTORY_LIMIT');
    activeOperation = true;
    const record = { run_ref: context.run_ref, deadline_at: context.deadline_at, state: 'preparing', logs: [] }; records.set(context.run_ref, record);
    try {
      const { pinned, task } = normalize(packet), { repo, trees } = await roots();
      await assertBase(repo, context, record);
      const sources = [], validationSources = [];
      let totalBytes = 0;
      for (const file of task.allowed_write_paths) {
        const source = await loadSource(repo, file, context, record); sources.push(source); totalBytes += source.bytes;
        if (totalBytes > maxSourceBytes) fail('FEEDBACK_SOURCE_LIMIT');
      }
      const checkIds = task.acceptance_checks;
      const pins = new Map(checkIds.flatMap(id => catalog.get(id).file_pins.map(pin => [pin.path, pin.sha256])));
      for (const [file, expected] of pins) {
        const source = await loadSource(repo, file, context, record);
        if (source.sha256 !== expected) fail('FEEDBACK_VALIDATOR_CHANGED');
        validationSources.push(source); totalBytes += source.bytes;
        if (totalBytes > maxSourceBytes) fail('FEEDBACK_SOURCE_LIMIT');
      }
      if (totalBytes > maxSourceBytes) fail('FEEDBACK_SOURCE_LIMIT');
      const sourceRefs = freeze(sources.map(({ content, ...ref }) => ref));
      alive(context);
      if (await authorizeInput(pinned, sourceRefs, context) !== true) fail('FEEDBACK_INPUT_DENIED');
      alive(context);
      const proposed = await proposePatch({ packet: pinned, sources: freeze(sources), author_ref: authorRef, context });
      alive(context);
      if (proposed?.author_ref !== authorRef) fail('FEEDBACK_PATCH_AUTHOR_INVALID');
      const patch = proposed.patch, grammar = inspectGrammar(patch, task.allowed_write_paths, maxPatchBytes), patchHash = sha(patch);
      const reviewed = await inspectPatch({ packet: pinned, source_refs: sourceRefs, patch, patch_sha256: patchHash, author_ref: authorRef, context });
      alive(context);
      if (reviewed?.status !== 'ACCEPT' || reviewed.patch_sha256 !== patchHash || reviewed.author_ref !== authorRef
        || reviewed.reviewer_ref !== patchReviewerRef || !REF.test(reviewed.review_ref ?? '')) fail('FEEDBACK_PATCH_REVIEW_DENIED');
      // Re-read authority after the advisory call and recheck the base before any
      // worktree mutation. The reviewer cannot supply branch, path, or commands.
      if (await authorizeInput(pinned, sourceRefs, context) !== true) fail('FEEDBACK_INPUT_DENIED');
      await assertBase(repo, context, record);
      const suffix = sha(context.run_ref).slice(0, 24), branch = `codex/feedback-${suffix}`, worktree = path.join(trees, `feedback-${suffix}`);
      if (await fs.lstat(worktree).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) fail('FEEDBACK_WORKTREE_EXISTS');
      const branchCheck = await git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], repo, context, record, { allowFailure: true });
      if (branchCheck.code !== 1) fail('FEEDBACK_BRANCH_EXISTS');
      record.worktree_path = worktree; record.branch_ref = branch;
      await git(['worktree', 'add', '--no-checkout', '-b', branch, '--', worktree, baseCommit], repo, context, record);
      await git(['read-tree', baseCommit], worktree, context, record);
      const allFiles = (await git(['ls-files', '-z'], worktree, context, record, { cap: 2_000_000 })).stdout;
      if (!allFiles.length || allFiles.at(-1) !== 0) fail('FEEDBACK_GIT_OUTPUT_INVALID');
      await git(['update-index', '--skip-worktree', '-z', '--stdin'], worktree, context, record, { input: allFiles });
      const materialized = [...sources, ...validationSources];
      await git(['update-index', '--no-skip-worktree', '-z', '--stdin'], worktree, context, record, { input: Buffer.from(materialized.map(source => source.path).join('\0') + '\0') });
      await materialize(trees, worktree, materialized);
      const numstat = utf8((await git(['apply', '--numstat', '-z', '-'], worktree, context, record, { input: patch })).stdout, true);
      const entries = numstat.split('\0');
      if (entries.pop() !== '' || entries.length !== grammar.changed.length) fail('FEEDBACK_GIT_OUTPUT_INVALID');
      const seen = new Set();
      for (const entry of entries) {
        const match = /^(\d+)\t(\d+)\t([^\t\0]+)$/u.exec(entry);
        if (!match || seen.has(match[3]) || grammar.stats.get(match[3]) !== `${match[1]}\t${match[2]}`) fail('FEEDBACK_GIT_OUTPUT_INVALID');
        seen.add(match[3]);
      }
      await git(['apply', '--check', '--whitespace=nowarn', '-'], worktree, context, record, { input: patch });
      alive(context);
      await git(['apply', '--whitespace=nowarn', '-'], worktree, context, record, { input: patch });
      const files = [];
      for (const source of materialized) {
        const bytes = await ordinaryFile(worktree, source.path, maxSourceBytes); utf8(bytes);
        const expected = pins.get(source.path);
        if (expected && sha(bytes) !== expected) fail('FEEDBACK_VALIDATOR_CHANGED');
        files.push({ path: source.path, sha256: sha(bytes), bytes: bytes.length });
      }
      const candidate = freeze({ candidate_ref: `feedback.candidate.${suffix}`, branch_ref: branch, worktree_path: worktree,
        base_commit: baseCommit, patch_sha256: patchHash, packet_sha256: jsonHash(pinned), patch_review_ref: reviewed.review_ref, files });
      const saved = { candidate, worktree, files, changed: grammar.changed, checkIds, run_ref: context.run_ref,
        gitFileHash: sha(await pinnedFileRead(path.join(worktree, '.git'), 4096)) };
      await assertCandidate(saved, context, record); await assertBase(repo, context, record);
      candidates.set(candidate.candidate_ref, saved); record.state = 'candidate_ready'; record.candidate_ref = candidate.candidate_ref;
      return candidate;
    } catch (error) { if (record.state !== 'execution_unknown') record.state = 'held_internal'; throw error; }
    finally { activeOperation = false; }
  }

  async function validate(candidate, packet, context) {
    alive(context);
    if (activeOperation) fail('FEEDBACK_RUN_BUSY');
    const saved = candidates.get(candidate?.candidate_ref), record = records.get(context.run_ref);
    if (!saved || saved.run_ref !== context.run_ref || !record || record.deadline_at !== context.deadline_at || jsonHash(candidate) !== jsonHash(saved.candidate)
      || jsonHash(packet) !== candidate.packet_sha256) fail('FEEDBACK_CANDIDATE_UNKNOWN');
    activeOperation = true;
    try {
      const { repo } = await roots(); await assertBase(repo, context, record); await assertCandidate(saved, context, record);
      const checks = [];
      for (const id of saved.checkIds) {
        const command = catalog.get(id);
        for (const pin of command.file_pins) {
          if (sha(await ordinaryFile(saved.worktree, pin.path, maxSourceBytes)) !== pin.sha256) fail('FEEDBACK_VALIDATOR_CHANGED');
        }
        const result = await run(command.executable, command.executable_sha256,
          [path.join(saved.worktree, command.argv[0]), ...command.argv.slice(1)], saved.worktree, context, record, { allowFailure: true });
        await assertCandidate(saved, context, record); await assertBase(repo, context, record);
        checks.push({ check_id: id, passed: result.code === 0, log_ref: result.log_ref });
        if (result.code !== 0) { record.state = 'validation_failed'; return freeze({ status: 'FAIL', validation_ref: `feedback.validation.${jsonHash(checks).slice(0, 24)}`, checks }); }
      }
      record.state = 'validated_candidate';
      return freeze({ status: 'PASS', validation_ref: `feedback.validation.${jsonHash([candidate.candidate_ref, checks]).slice(0, 24)}`, checks });
    } catch (error) { if (record.state !== 'execution_unknown') record.state = 'held_internal'; throw error; }
    finally { activeOperation = false; }
  }

  return Object.freeze({ execute, validate, state: () => freeze({ active_children: activeChildren,
    runs: [...records.values()], os_sandbox: false, descendant_isolation: false, candidate_preserved: true }) });
}
