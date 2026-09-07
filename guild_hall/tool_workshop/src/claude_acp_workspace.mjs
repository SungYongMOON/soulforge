import fs from 'node:fs';
import path from 'node:path';
import { assertCurrent, exactKeys, fingerprint, regularPath, refuse, sha256, validateWorkspaceRelativePath } from './claude_acp_policy.mjs';

const LIMIT = 64 * 1024;
const createdDrafts = new WeakMap();
function permittedFiles(binding) {
  if (!createdDrafts.has(binding)) createdDrafts.set(binding, new Map());
  return new Map([...binding.inputFiles.map(entry => [entry.path, entry.sha256]), ...createdDrafts.get(binding)]);
}
function targetPath(binding, relative) {
  validateWorkspaceRelativePath(relative);
  const target = path.join(binding.jobRoot, ...relative.split('/'));
  regularPath(path.dirname(target), 'directory');
  return target;
}
function sameFile(before, after) {
  if (fingerprint(before) !== fingerprint(after) || before.mtimeMs !== after.mtimeMs || before.size !== after.size || after.nlink !== 1) refuse('FILE_CHANGED');
}
export function workspaceTools(binding) {
  return binding.tools.map(name => ({ name, description: name === 'workspace_write_text' ? 'Create a new work draft in this assigned job. Never overwrites or accepts a canonical artifact.' : 'Inspect only this assigned job working folder.', inputSchema: name === 'workspace_list' ? { type: 'object', properties: {}, additionalProperties: false } : { type: 'object', properties: { path: { type: 'string' }, ...(name === 'workspace_write_text' ? { text: { type: 'string' }, purpose: { const: 'work_draft' }, jobRef: { type: 'string' } } : {}) }, required: name === 'workspace_write_text' ? ['path', 'text', 'purpose', 'jobRef'] : ['path'], additionalProperties: false } }));
}
export function callWorkspaceTool(binding, name, args) {
  assertCurrent(binding);
  if (!binding.tools.includes(name)) refuse('TOOL_DENIED');
  if (name === 'workspace_list') {
    exactKeys(args, []);
    const entries = [...permittedFiles(binding).keys()];
    if (entries.length > 200) refuse('DIRECTORY_TOO_LARGE');
    const result = entries.map(relative => {
      const stat = regularPath(targetPath(binding, relative));
      return { name: relative, kind: 'file', bytes: stat.size };
    });
    assertCurrent(binding); return { entries: result };
  }
  if (name === 'workspace_read_text') {
    exactKeys(args, ['path']);
    const target = targetPath(binding, args.path);
    const expected = permittedFiles(binding).get(args.path);
    if (!expected) refuse('INPUT_NOT_BOUND');
    const before = regularPath(target);
    if (before.size > LIMIT) refuse('FILE_TOO_LARGE');
    const fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
      sameFile(before, fs.fstatSync(fd));
      const buffer = Buffer.alloc(LIMIT + 1);
      const length = fs.readSync(fd, buffer, 0, buffer.length, 0);
      if (length > LIMIT) refuse('FILE_TOO_LARGE');
      sameFile(before, fs.fstatSync(fd)); sameFile(before, regularPath(target)); assertCurrent(binding);
      if (sha256(buffer.subarray(0, length)) !== expected) refuse('INPUT_BYTES_CHANGED');
      return { path: args.path, text: new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length)), sha256: sha256(buffer.subarray(0, length)) };
    } finally { fs.closeSync(fd); }
  }
  if (name === 'workspace_write_text') {
    exactKeys(args, ['path', 'text', 'purpose', 'jobRef']);
    if (args.purpose !== 'work_draft' || args.jobRef !== binding.jobRef) refuse('WRITE_PURPOSE');
    if (typeof args.text !== 'string' || Buffer.byteLength(args.text) > LIMIT || args.text.includes('\0')) refuse('WRITE_CONTENT');
    const target = targetPath(binding, args.path);
    const parent = path.dirname(target); const parentId = fingerprint(regularPath(parent, 'directory'));
    assertCurrent(binding);
    const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
    try {
      const buffer = Buffer.from(args.text);
      const created = fs.fstatSync(fd);
      if (created.nlink !== 1 || fingerprint(regularPath(parent, 'directory')) !== parentId) refuse('ROOT_CHANGED');
      assertCurrent(binding);
      let offset = 0;
      while (offset < buffer.length) { const n = fs.writeSync(fd, buffer, offset); if (n === 0) refuse('SHORT_WRITE'); offset += n; }
      fs.fsyncSync(fd);
      const after = regularPath(target);
      if (fingerprint(after) !== fingerprint(created) || after.size !== buffer.length || fingerprint(regularPath(parent, 'directory')) !== parentId) refuse('FILE_CHANGED');
      assertCurrent(binding);
      permittedFiles(binding); createdDrafts.get(binding).set(args.path, sha256(buffer));
      return { path: args.path, bytes: buffer.length, sha256: sha256(buffer), state: 'work_draft', accepted: false };
    } finally { fs.closeSync(fd); }
  }
  refuse('TOOL_DENIED');
}
