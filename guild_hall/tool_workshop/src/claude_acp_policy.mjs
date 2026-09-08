import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const TOOL_NAMES = Object.freeze(['workspace_list', 'workspace_read_text', 'workspace_write_text']);
export const REQUIRED_FLAGS = Object.freeze(['--strict-mcp-config', '--mcp-config', '--setting-sources', '--settings', '--tools', '--disable-slash-commands', '--no-session-persistence', '--input-format', '--output-format', '--permission-mode', '--allowedTools', '--system-prompt', '--model']);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function refuse(code) { throw Object.assign(new Error(code), { code }); }
export function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) refuse('BINDING_SHAPE');
}
export function safeRef(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) refuse('INVALID_REF');
  return value;
}
export function validateWorkspaceRelativePath(relative) {
  if (typeof relative !== 'string' || relative.length > 240 || relative.includes('\\') || !relative.split('/').every(part => /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(part) && !part.endsWith('.') && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) refuse('WORKSPACE_PATH');
  if (!['.txt', '.md', '.json'].includes(path.posix.extname(relative).toLowerCase())) refuse('WORKSPACE_FILE_TYPE');
  return relative;
}
function freezeTree(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeTree(child); Object.freeze(value); }
  return value;
}
export function fingerprint(stat) { return `${stat.dev}:${stat.ino}:${stat.mode}:${stat.birthtimeMs}`; }
export function contained(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function inspectPath(target, kind = 'file', allowInstallerLinks = false) {
  if (typeof target !== 'string' || !path.isAbsolute(target) || path.resolve(target) !== target || /[\x00-\x1f]/.test(target) || target.startsWith('\\\\')) refuse('INVALID_PATH');
  const parsed = path.parse(target);
  let current = parsed.root;
  for (const part of target.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    if (part.endsWith('.') || part.endsWith(' ') || part.includes(':')) refuse('INVALID_PATH');
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || fs.realpathSync.native(current).toLowerCase() !== current.toLowerCase()) refuse('LINK_PATH');
    if (current !== target && !stat.isDirectory()) refuse('INVALID_PATH');
  }
  const stat = fs.lstatSync(target);
  if (kind === 'directory' ? !stat.isDirectory() : !stat.isFile() || (!allowInstallerLinks && stat.nlink !== 1)) refuse('UNSAFE_FILE');
  return stat;
}
export function regularPath(target, kind = 'file') {
  if (!['file', 'directory'].includes(kind)) refuse('PATH_KIND');
  return inspectPath(target, kind);
}
function readPinnedBytes(target, expected, limit, allowInstallerLinks = false) {
  if (!/^[a-f0-9]{64}$/.test(expected)) refuse('INVALID_HASH');
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 512 * 1024 * 1024) refuse('INVALID_READ_LIMIT');
  const before = inspectPath(target, 'file', allowInstallerLinks);
  if (before.size > limit) refuse('FILE_TOO_LARGE');
  const fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    if (fingerprint(fs.fstatSync(fd)) !== fingerprint(before)) refuse('FILE_CHANGED');
    const bytes = Buffer.alloc(before.size);
    let length = 0;
    while (length < bytes.length) {
      const count = fs.readSync(fd, bytes, length, bytes.length - length, length);
      if (count === 0) refuse('FILE_CHANGED');
      length += count;
    }
    if (fs.readSync(fd, Buffer.alloc(1), 0, 1, length) !== 0) refuse('FILE_CHANGED');
    const after = fs.fstatSync(fd);
    if (bytes.length > limit || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.nlink !== before.nlink || fingerprint(inspectPath(target, 'file', allowInstallerLinks)) !== fingerprint(before) || sha256(bytes) !== expected) refuse('FILE_CHANGED');
    return bytes;
  } finally { fs.closeSync(fd); }
}
export function readPinnedFile(target, expected, limit = 128 * 1024) {
  return readPinnedBytes(target, expected, limit);
}
const loadedBindings = new WeakSet();
const selfDir = path.dirname(fileURLToPath(import.meta.url));
export const SOURCE_FILES = Object.freeze(['claude_acp_policy.mjs', 'claude_acp_workspace.mjs', 'claude_acp_server.mjs', 'claude_acp_cli.mjs']);
const repositoryRoot=path.resolve(selfDir,'../../..');
export const HWPX_SOURCE_FILES=Object.freeze([
  ...SOURCE_FILES.map(file=>`guild_hall/tool_workshop/src/${file}`),
  ...['claude_hwpx_tools.mjs','hwpx_skill_author.mjs','hwpx_skill_author.py','hwpx_reference_runner.mjs','hwpx_reference_child.py',
    'tool_workshop_core.mjs','tool_workshop_durable.mjs','workshop_files.mjs','bounded_tool_process.mjs','hancom_hwpx_render.mjs',
    'hancom_hwpx_export.ps1','hwpx_pdf_verifier.mjs','hwpx_pdf_readback.py'].map(file=>`guild_hall/tool_workshop/src/${file}`),
  ...['validate.py','page_guard.py','office/pack.py'].map(file=>`.registry/skills/hwpx_document/codex/scripts/${file}`),
]);
function verifySources(binding) {
  const names=binding.version===2?HWPX_SOURCE_FILES:SOURCE_FILES;
  exactKeys(binding.sourceHashes,[...names]);
  for(const file of names)readPinnedFile(path.join(binding.version===2?repositoryRoot:selfDir,file),binding.sourceHashes[file],binding.version===2?2*1024*1024:128*1024);
}
function readHwpxConfiguration(raw) {
  exactKeys(raw.hwpx,['author','native','pdf']);
  if((raw.hwpx.native===null)!==(raw.hwpx.pdf===null))refuse('HWPX_RENDER_BINDING');
  const read=descriptor=>{
    exactKeys(descriptor,['path','sha256']);
    if(contained(raw.workRoot,descriptor.path))refuse('AUTHORITY_IN_WORK_ROOT');
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(readPinnedFile(descriptor.path,descriptor.sha256,2*1024*1024)));
  };
  const author=read(raw.hwpx.author);
  exactKeys(author,['version','project_ref','job_ref','source_ref','revision','approval_ref','provenance','input_root','work_root','output_root','queue_root','reference_binding','pack_sha256']);
  if(author.version!==1 || author.project_ref!==raw.projectRef || author.job_ref!==raw.jobRef)refuse('HWPX_JOB_BINDING');
  for(const root of ['input_root','work_root','output_root','queue_root'].map(key=>author[key])){
    regularPath(root,'directory');if(contained(raw.workRoot,root)||contained(root,raw.workRoot))refuse('HWPX_WRITABLE_AUTHORITY');
  }
  const reference=read(author.reference_binding);
  if(contained(raw.workRoot,reference.template_path))refuse('HWPX_WRITABLE_AUTHORITY');
  readPinnedFile(reference.template_path,reference.template_sha256,32*1024*1024);
  let native=null,pdf=null;
  if(raw.hwpx.native!==null){
    native=read(raw.hwpx.native);pdf=read(raw.hwpx.pdf);
    exactKeys(native,['enabled','renderer_ref','input_root','output_root','work_root','powershell_executable','powershell_sha256','hwp_executable','hwp_sha256','security_module_dll','security_module_sha256','script_path','script_sha256','user_sid','existing_module_name']);
    exactKeys(pdf,['code_root','pdf_root','python_executable','python_sha256','python_version','python_files','libraries','library_files','pypdf_version','pillow_version','poppler_executable','poppler_files','sources']);
    if(native.enabled!==true || native.existing_module_name!=='FilePathCheckerModule' || native.input_root!==author.output_root || pdf.pdf_root!==native.output_root)refuse('HWPX_RENDER_BINDING');
    for(const root of [native.input_root,native.output_root,native.work_root,pdf.pdf_root]){
      regularPath(root,'directory');if(contained(raw.workRoot,root)||contained(root,raw.workRoot))refuse('HWPX_WRITABLE_AUTHORITY');
    }
  }
  return {author,native,pdf};
}
export function loadBinding(bindingPath, bindingSha256) {
  const bytes = readPinnedFile(bindingPath, bindingSha256, 32 * 1024);
  let raw;
  try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { refuse('BINDING_JSON'); }
  if (![1,2].includes(raw.version)) refuse('BINDING_VERSION');
  exactKeys(raw, ['version', 'botRef', 'roleRef', 'projectRef', 'jobRef', 'inputFiles', 'workRoot', 'jobRoot', 'model', 'cliPath', 'cliSha256', 'nodeSha256', 'instructions', 'skills', 'tools', 'sourceHashes', 'expiresAt',...(raw.version===2?['hwpx',...(Object.hasOwn(raw,'turnTimeoutMs')?['turnTimeoutMs']:[])]:[])]);
  // Only the pinned v2 installer binding may choose a document work-turn
  // budget. Probe/control/closure deadlines remain independent and short.
  const requestedTurnTimeoutMs=raw.version===2?(Object.hasOwn(raw,'turnTimeoutMs')?raw.turnTimeoutMs:1800000):120000;
  if(!Number.isSafeInteger(requestedTurnTimeoutMs)||requestedTurnTimeoutMs<60000||requestedTurnTimeoutMs>7200000)refuse('TURN_TIMEOUT_BINDING');
  for (const key of ['botRef', 'roleRef', 'projectRef', 'jobRef', 'model']) safeRef(raw[key]);
  if (!Array.isArray(raw.inputFiles) || raw.inputFiles.length > 200) refuse('INPUT_MANIFEST');
  for (const entry of raw.inputFiles) {
    exactKeys(entry, ['path', 'sha256']);
    validateWorkspaceRelativePath(entry.path);
    if (typeof entry.path !== 'string' || !entry.path.length || !/^[a-f0-9]{64}$/.test(entry.sha256)) refuse('INPUT_MANIFEST');
  }
  if (new Set(raw.inputFiles.map(entry => entry.path.toLowerCase())).size !== raw.inputFiles.length) refuse('INPUT_MANIFEST');
  if (!Number.isSafeInteger(raw.expiresAt) || raw.expiresAt <= Date.now()) refuse('BINDING_EXPIRED');
  for (const value of [raw.workRoot, raw.jobRoot]) {
    regularPath(value, 'directory');
    if (value.split(/[\\/]/).some(part => ['_workspaces', '_workmeta'].includes(part.toLowerCase()))) refuse('CANON_ROOT_FORBIDDEN');
  }
  if (raw.jobRoot !== path.join(raw.workRoot, 'JOBS', raw.jobRef)) refuse('JOB_ROOT_MISMATCH');
  if (contained(raw.workRoot, bindingPath) || contained(raw.workRoot, selfDir) || contained(raw.workRoot, raw.cliPath)) refuse('AUTHORITY_IN_WORK_ROOT');
  // This reader never writes runtime bytes. Installer links do not imply OS write protection.
  readPinnedBytes(raw.cliPath, raw.cliSha256, 512 * 1024 * 1024, true);
  readPinnedFile(process.execPath, raw.nodeSha256, 256 * 1024 * 1024);
  verifySources(raw);
  const allowedTools=raw.version===2?[...TOOL_NAMES,'hwpx_build_candidate']:TOOL_NAMES;
  if (!Array.isArray(raw.tools) || !raw.tools.length || raw.tools.some(name => !allowedTools.includes(name)) || new Set(raw.tools).size !== raw.tools.length) refuse('TOOL_ALLOWLIST');
  const hwpxConfiguration=raw.version===2?readHwpxConfiguration(raw):null;
  if (!Array.isArray(raw.skills) || raw.skills.length > 8) refuse('SKILL_ALLOWLIST');
  const readInstruction = entry => {
    exactKeys(entry, ['ref', 'path', 'sha256']); safeRef(entry.ref);
    if (contained(raw.jobRoot, entry.path)) refuse('MUTABLE_INSTRUCTION');
    return new TextDecoder('utf-8', { fatal: true }).decode(readPinnedFile(entry.path, entry.sha256, 32 * 1024));
  };
  const instructionText = [readInstruction(raw.instructions), ...raw.skills.map(readInstruction)].join('\n\n');
  if (Buffer.byteLength(instructionText) > 64 * 1024) refuse('INSTRUCTIONS_TOO_LARGE');
  const remainingAuthorityMs=raw.expiresAt-Date.now();
  if(remainingAuthorityMs<=0)refuse('BINDING_EXPIRED');
  const state = { ...raw, turnTimeoutMs:Math.min(requestedTurnTimeoutMs,remainingAuthorityMs), instructionText, bindingPath, bindingSha256, rootIdentity: fingerprint(regularPath(raw.jobRoot, 'directory')), sourceDir: selfDir,...(raw.version===2?{hwpxConfiguration}:{}) };
  loadedBindings.add(state);
  return freezeTree(state);
}
export function assertCurrent(binding) {
  if (!loadedBindings.has(binding)) refuse('BINDING_REQUIRED');
  readPinnedFile(binding.bindingPath, binding.bindingSha256, 32 * 1024);
  if (binding.expiresAt <= Date.now()) refuse('BINDING_EXPIRED');
  if (fingerprint(regularPath(binding.jobRoot, 'directory')) !== binding.rootIdentity) refuse('ROOT_CHANGED');
  for (const entry of [binding.instructions, ...binding.skills]) readPinnedFile(entry.path, entry.sha256, 32 * 1024);
  if(binding.version===2){verifySources(binding);readHwpxConfiguration(binding);}
}
export function verifyCurrentCli(binding) {
  assertCurrent(binding);
  // Only the CLI path from a validated binding receives the installer-link exception.
  return readPinnedBytes(binding.cliPath, binding.cliSha256, 512 * 1024 * 1024, true);
}
export function childEnvironment(parent = process.env) {
  const env = {};
  // Authentication remains owned by the official CLI at its normal location.
  // No credentials, provider overrides, NODE_OPTIONS, Buzz keys or user tool env is forwarded.
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP']) if (typeof parent[key] === 'string') env[key] = parent[key];
  return { ...env, DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', ENABLE_CLAUDEAI_MCP_SERVERS: 'false' };
}
export function launchSpec(binding) {
  assertCurrent(binding);
  verifyCurrentCli(binding);
  readPinnedFile(process.execPath, binding.nodeSha256, 256 * 1024 * 1024);
  verifySources(binding);
  const tools = binding.tools.map(name => `mcp__soulforge_workspace__${name}`);
  const mcp = { mcpServers: { soulforge_workspace: { type: 'stdio', command: process.execPath, args: [path.join(selfDir, 'claude_acp_cli.mjs'), '--workspace-mcp', '--binding', binding.bindingPath, '--binding-sha256', binding.bindingSha256], env: {} } } };
  const settings = { disableAllHooks: true, autoMemoryEnabled: false, disableClaudeAiConnectors: true, enabledPlugins: {}, permissions: { defaultMode: 'default', allow: tools, deny: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Agent', 'Task', 'Skill', 'WebFetch', 'WebSearch'] } };
  return { command: binding.cliPath, cwd: binding.jobRoot, env: childEnvironment(), windowsHide: true,
    args: ['--print', '--verbose', '--input-format', 'stream-json', '--output-format', 'stream-json', '--strict-mcp-config', '--mcp-config', JSON.stringify(mcp), '--setting-sources', '', '--settings', JSON.stringify(settings), '--tools', '', '--disable-slash-commands', '--no-session-persistence', '--permission-mode', 'default', '--allowedTools', ...tools, '--system-prompt', binding.instructionText, '--model', binding.model] };
}
