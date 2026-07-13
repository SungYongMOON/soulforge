import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  WORKFLOW_JOB_ID_RE,
  WORKFLOW_PROJECT_RE,
  canonicalJson,
  sha256Bytes,
} from './workflow_job_contract.mjs';

const BLOCKED_VALUE_KEYS = new Set([
  'body',
  'bytes',
  'content',
  'draft_text',
  'html',
  'markdown',
  'report_text',
  'source_text',
]);

function fail(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  throw error;
}

function isStrictChild(root, path) {
  const rel = relative(root, path);
  return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel);
}

function assertMetadataOnly(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) assertMetadataOnly(item);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (BLOCKED_VALUE_KEYS.has(key.toLowerCase())) fail('workflow_receipt_contains_body', 409);
    assertMetadataOnly(child);
  }
}

function verifiedReceipt(path, expected) {
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || stat.size !== BigInt(expected.size)) {
    fail('workflow_receipt_file_unsafe', 409);
  }
  const bytes = readFileSync(path);
  if (sha256Bytes(bytes) !== expected.sha256) fail('workflow_receipt_hash_mismatch', 409);
  return bytes;
}

function ensureDirectory(path) {
  if (!existsSync(path)) mkdirSync(path);
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('workflow_receipt_directory_unsafe', 409);
}

export class WorkflowJobReceiptStore {
  constructor({ repositoryRoot }) {
    if (typeof repositoryRoot !== 'string' || !isAbsolute(repositoryRoot)) {
      fail('workflow_receipt_root_invalid', 503);
    }
    this.repositoryRoot = resolve(repositoryRoot);
    const configured = resolve(this.repositoryRoot, '_workmeta');
    if (!isStrictChild(this.repositoryRoot, configured)) fail('workflow_receipt_root_invalid', 503);
    if (!existsSync(configured)) mkdirSync(configured, { recursive: true });
    this.configuredRoot = configured;
    this.root = realpathSync.native(configured);
    const rootStat = lstatSync(this.root, { bigint: true });
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('workflow_receipt_root_unsafe', 503);
  }

  assertReady() {
    if (realpathSync.native(this.configuredRoot) !== this.root) fail('workflow_receipt_root_retargeted', 409);
  }

  persist({ projectCode, jobId, bytes }) {
    this.assertReady();
    if (!WORKFLOW_PROJECT_RE.test(String(projectCode || ''))) fail('workflow_project_invalid');
    if (!WORKFLOW_JOB_ID_RE.test(String(jobId || ''))) fail('workflow_job_id_invalid');
    if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > 131_072) fail('workflow_receipt_body_invalid');
    let receipt;
    try {
      receipt = JSON.parse(bytes.toString('utf8'));
    } catch {
      fail('workflow_receipt_json_invalid', 409);
    }
    if (receipt?.schema !== 'soulforge.workflow_receipt.v1'
      || !Buffer.from(`${canonicalJson(receipt)}\n`, 'utf8').equals(bytes)) {
      fail('workflow_receipt_canonical_bytes_invalid', 409);
    }
    assertMetadataOnly(receipt);

    const projectRoot = join(this.root, projectCode);
    const runsRoot = join(projectRoot, 'runs');
    const runRoot = join(runsRoot, jobId);
    const finalPath = join(runRoot, 'workflow_receipt.json');
    if (!isStrictChild(this.root, projectRoot)
      || !isStrictChild(projectRoot, runsRoot)
      || !isStrictChild(runsRoot, runRoot)
      || !isStrictChild(runRoot, finalPath)) fail('workflow_receipt_path_escape', 409);
    ensureDirectory(projectRoot);
    ensureDirectory(runsRoot);
    ensureDirectory(runRoot);

    const sha256 = sha256Bytes(bytes);
    const metadata = {
      payload_ref: `wfr:${jobId}:${sha256}`,
      sha256,
      size: bytes.length,
      media_type: 'application/json',
    };
    const stagingPath = join(runRoot, `.workflow_receipt.${sha256}.staging`);
    if (!isStrictChild(runRoot, stagingPath)) fail('workflow_receipt_path_escape', 409);
    if (existsSync(finalPath)) {
      if (existsSync(stagingPath)) {
        const finalStat = lstatSync(finalPath, { bigint: true });
        const stagingStat = lstatSync(stagingPath, { bigint: true });
        if (finalStat.isFile()
          && stagingStat.isFile()
          && !finalStat.isSymbolicLink()
          && !stagingStat.isSymbolicLink()
          && finalStat.ino === stagingStat.ino
          && finalStat.nlink === 2n
          && stagingStat.nlink === 2n) {
          unlinkSync(stagingPath);
        }
      }
      const stored = verifiedReceipt(finalPath, metadata);
      if (!stored.equals(bytes)) fail('workflow_receipt_adoption_conflict', 409);
      return { ...metadata, adopted: true };
    }

    if (existsSync(stagingPath)) fail('workflow_receipt_staging_conflict', 409);
    let descriptor;
    try {
      descriptor = openSync(stagingPath, 'wx', 0o600);
      writeFileSync(descriptor, bytes);
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      linkSync(stagingPath, finalPath);
      unlinkSync(stagingPath);
      verifiedReceipt(finalPath, metadata);
      try {
        const directoryDescriptor = openSync(dirname(finalPath), 'r');
        fsyncSync(directoryDescriptor);
        closeSync(directoryDescriptor);
      } catch {}
      return { ...metadata, adopted: false };
    } catch (error) {
      if (descriptor !== undefined) closeSync(descriptor);
      if (existsSync(stagingPath)) unlinkSync(stagingPath);
      throw error;
    }
  }
}

export function createWorkflowJobReceiptStore(options) {
  return new WorkflowJobReceiptStore(options);
}
