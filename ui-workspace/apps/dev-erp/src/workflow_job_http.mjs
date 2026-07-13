import { TextDecoder } from 'node:util';

import {
  WORKFLOW_RAW_INPUT_MAX_BYTES,
  WorkflowJobError as ServiceWorkflowJobError,
  normalizeWorkflowMediaType,
} from './workflow_job_contract.mjs';

const JSON_BODY_MAX_BYTES = 65_536;
const JOB_PATH_RE = /^\/api\/workflow-jobs\/([^/]+)$/;
const JOB_RESULT_PATH_RE = /^\/api\/workflow-jobs\/([^/]+)\/result$/;
const JOB_CANCEL_PATH_RE = /^\/api\/workflow-jobs\/([^/]+)\/cancel$/;
const JOB_RECOVERY_PATH_RE = /^\/api\/workflow-jobs\/([^/]+)\/recovery$/;
const JOB_ARTIFACT_PATH_RE = /^\/api\/workflow-jobs\/([^/]+)\/artifacts\/([^/]+)$/;

class WorkflowJobError extends Error {
  constructor(status, code, publicMessage) {
    super(publicMessage);
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

function sendJson(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': body.byteLength,
    'content-type': 'application/json; charset=utf-8',
  });
  res.end(body);
}

function publicError(error) {
  if (error instanceof WorkflowJobError || error instanceof ServiceWorkflowJobError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.publicMessage || error.message || '워크플로우 요청이 거부되었습니다.',
        },
      },
    };
  }
  return {
    status: 500,
    body: {
      error: {
        code: 'workflow_job_internal_error',
        message: '워크플로우 작업 처리 중 오류가 발생했습니다.',
      },
    },
  };
}

function decodePathPart(value, field) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new WorkflowJobError(400, 'invalid_path_parameter', `${field} 값이 올바르지 않습니다.`);
  }
}

async function readLimitedBody(req, limit) {
  const contentLength = req.headers['content-length'];
  if (contentLength !== undefined) {
    if (!/^\d+$/.test(contentLength)) {
      throw new WorkflowJobError(400, 'invalid_content_length', 'Content-Length 값이 올바르지 않습니다.');
    }
    if (Number(contentLength) > limit) {
      throw new WorkflowJobError(413, 'workflow_body_too_large', `본문은 ${limit}바이트 이하여야 합니다.`);
    }
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > limit) {
      throw new WorkflowJobError(413, 'workflow_body_too_large', `본문은 ${limit}바이트 이하여야 합니다.`);
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

async function readJson(req) {
  let mediaType = null;
  try { mediaType = normalizeWorkflowMediaType(req.headers['content-type']); } catch {}
  if (mediaType !== 'application/json') {
    throw new WorkflowJobError(415, 'json_content_type_required', 'Content-Type application/json이 필요합니다.');
  }
  const body = await readLimitedBody(req, JSON_BODY_MAX_BYTES);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch {
    throw new WorkflowJobError(400, 'invalid_json', 'JSON 본문이 올바르지 않습니다.');
  }
}

function assertIdentityEncoding(req) {
  const encoding = String(req.headers['content-encoding'] || 'identity').trim().toLowerCase();
  if (encoding !== 'identity') {
    throw new WorkflowJobError(
      415,
      'compressed_workflow_input_forbidden',
      '워크플로우 입력에는 압축 Content-Encoding을 사용할 수 없습니다.',
    );
  }
}

function requirePrincipal(principal) {
  if (!principal || typeof principal.accountId !== 'string' || !principal.accountId.trim()) {
    throw new WorkflowJobError(401, 'workflow_authentication_required', '로그인이 필요합니다.');
  }
  return principal;
}

function requireEnabled(capability) {
  if (!capability?.enabled) {
    throw new WorkflowJobError(
      503,
      'report_workflow_unavailable',
      '보고서 작성 워크플로우는 현재 활성화되지 않았습니다.',
    );
  }
}

function requireService(service) {
  if (!service) {
    throw new WorkflowJobError(
      503,
      'report_workflow_service_unavailable',
      '보고서 작성 워크플로우 저장소를 사용할 수 없습니다.',
    );
  }
  return service;
}

export function createWorkflowJobHttpController({
  service,
  getCapability,
  resolvePrincipal,
  canAccessProject,
  isAuditAllowed = () => false,
  resumeReceiptAdapter = null,
  auditError = () => {},
}) {
  if (
    typeof getCapability !== 'function'
    || typeof resolvePrincipal !== 'function'
    || typeof canAccessProject !== 'function'
  ) {
    throw new TypeError('workflow job HTTP dependencies are required');
  }

  return async function handleWorkflowJobRequest(req, res, url) {
    const pathname = url.pathname;
    const isWorkflowPath = pathname === '/api/workflow-inputs'
      || pathname === '/api/workflow-jobs'
      || pathname === '/api/workflow-jobs/capabilities'
      || pathname.startsWith('/api/workflow-jobs/');
    if (!isWorkflowPath) return false;

    try {
      const principal = requirePrincipal(await resolvePrincipal(req));
      const capability = await getCapability();

      if (req.method === 'GET' && pathname === '/api/workflow-jobs/capabilities') {
        sendJson(res, 200, capability);
        return true;
      }

      requireService(service);

      if (req.method === 'POST' && pathname === '/api/workflow-inputs') {
        requireEnabled(capability);
        assertIdentityEncoding(req);
        const body = await readLimitedBody(req, WORKFLOW_RAW_INPUT_MAX_BYTES);
        const result = await service.createInput({
          accountId: principal.accountId,
          canAccessProject: (projectCode) => canAccessProject(req, projectCode),
          project_code: url.searchParams.get('project_code'),
          role: url.searchParams.get('role'),
          media_type: String(req.headers['content-type'] || ''),
          bytes: body,
        });
        sendJson(res, 201, result);
        return true;
      }

      if (req.method === 'POST' && pathname === '/api/workflow-jobs') {
        requireEnabled(capability);
        const result = await service.createJob({
          accountId: principal.accountId,
          canAccessProject: (projectCode) => canAccessProject(req, projectCode),
          idempotencyKey: req.headers['idempotency-key'],
          request: await readJson(req),
        });
        sendJson(res, result.replayed ? 200 : 202, result);
        return true;
      }

      if (req.method === 'GET' && pathname === '/api/workflow-jobs') {
        sendJson(res, 200, await service.listJobs({
          accountId: principal.accountId,
          canAccessProject: (projectCode) => canAccessProject(req, projectCode),
          projectCode: url.searchParams.get('project_code'),
          status: url.searchParams.get('status'),
          limit: url.searchParams.get('limit'),
          offset: url.searchParams.get('offset'),
        }));
        return true;
      }

      let match = pathname.match(JOB_RESULT_PATH_RE);
      if (req.method === 'GET' && match) {
        sendJson(res, 200, await service.result({
          accountId: principal.accountId,
          canAccessProject: (projectCode) => canAccessProject(req, projectCode),
          jobId: decodePathPart(match[1], 'job_id'),
        }));
        return true;
      }

      match = pathname.match(JOB_CANCEL_PATH_RE);
      if (req.method === 'POST' && match) {
        sendJson(res, 200, await service.cancel({
          accountId: principal.accountId,
          canAccessProject: (projectCode) => canAccessProject(req, projectCode),
          jobId: decodePathPart(match[1], 'job_id'),
          request: await readJson(req),
        }));
        return true;
      }

      match = pathname.match(JOB_RECOVERY_PATH_RE);
      if (req.method === 'POST' && match) {
        requireEnabled(capability);
        const request = await readJson(req);
        sendJson(res, 202, await service.resumeReceipt({
          accountId: principal.accountId,
          canAccessProject: (projectCode) => canAccessProject(req, projectCode),
          jobId: decodePathPart(match[1], 'job_id'),
          request,
          receiptAdapter: resumeReceiptAdapter,
        }));
        return true;
      }

      match = pathname.match(JOB_ARTIFACT_PATH_RE);
      if (req.method === 'GET' && match) {
        const artifact = await service.readArtifact({
          accountId: principal.accountId,
          canAccessProject: (projectCode) => canAccessProject(req, projectCode),
          projectCode: url.searchParams.get('project_code'),
          jobId: decodePathPart(match[1], 'job_id'),
          role: decodePathPart(match[2], 'role'),
          auditAllowed: Boolean(await isAuditAllowed(req, principal)),
        });
        res.writeHead(200, {
          'cache-control': 'no-store',
          'content-disposition': `attachment; filename="${artifact.filename}"`,
          'content-length': artifact.bytes.byteLength,
          'content-type': artifact.media_type,
          'x-content-type-options': 'nosniff',
        });
        res.end(artifact.bytes);
        return true;
      }

      match = pathname.match(JOB_PATH_RE);
      if (req.method === 'GET' && match) {
        sendJson(res, 200, await service.getJob({
          accountId: principal.accountId,
          canAccessProject: (projectCode) => canAccessProject(req, projectCode),
          jobId: decodePathPart(match[1], 'job_id'),
        }));
        return true;
      }

      throw new WorkflowJobError(404, 'workflow_route_not_found', '요청한 워크플로우 경로가 없습니다.');
    } catch (error) {
      auditError(error);
      const response = publicError(error);
      sendJson(res, response.status, response.body);
      return true;
    }
  };
}
