import { deepFreeze, digestOf, guardEntry, isDenseArray, isPlainObject, unknownKeyIn } from "../../../../../guild_hall/agent_observation/guard_primitives.mjs";
import { normalizeWorkBindingRequest, evaluateWorkBinding, isWorkBindingResult } from "../../../../../guild_hall/shared/work_binding.mjs";

export const WORKBENCH_INTAKE_REQUEST_SCHEMA = "soulforge.workbench.intake_request.v0";
const CONTEXT_FIELDS = ["trusted_evidence", "existing_records", "request_id", "created_at"];
const RECORD_FIELDS = ["schema_version", "request_id", "created_at", "status", "request", "request_digest", "binding", "boundary", "record_digest"];
const BOUNDARY = Object.freeze({
  raw_content_included: false, host_path_included: false, secret_included: false,
  writer_authority: false, acceptance_authority: false, task_creation_authority: false,
  execution_authority: false, claim_created: false, model_called: false, external_transmission: false,
});
const CODES = Object.fromEntries(["unknownField", "secret", "localPath", "tooDeep", "tooLarge", "hostileInput", "accessor"].map(key => [key, "INTAKE_CONTEXT_INVALID"]));
const exact = (value, fields) => isPlainObject(value) && unknownKeyIn(value, fields) === null
  && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
const requestId = value => typeof value === "string" && /^w_[a-f0-9]{32}$/u.test(value);
const utc = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const reject = hold_code => deepFreeze({ status: "HOLD", hold_code, append_required: false, replayed: false });

export function isWorkbenchIntakeRecord(record) {
  if (!exact(record, RECORD_FIELDS) || record.schema_version !== WORKBENCH_INTAKE_REQUEST_SCHEMA
    || !requestId(record.request_id) || !utc(record.created_at) || record.status !== "RECORDED"
    || !exact(record.boundary, Object.keys(BOUNDARY)) || Object.values(record.boundary).some(value => value !== false)
    || !isWorkBindingResult(record.binding)) return false;
  const normalized = normalizeWorkBindingRequest(record.request);
  if (normalized.status !== "NORMALIZED" || normalized.request_digest !== record.request_digest
    || record.binding.request_digest !== record.request_digest) return false;
  const { binding_digest: bindingDigest, ...bindingBody } = record.binding;
  const { record_digest: recordDigest, ...recordBody } = record;
  return digestOf(bindingBody) === bindingDigest && digestOf(recordBody) === recordDigest;
}

/**
 * Pure append proposal. The caller supplies server ID/time, authenticated current evidence and
 * durable records; it owns atomic idempotency reservation/persistence. This function writes
 * nothing and never treats a matching work slot as an idempotent retry or LINKED_EXISTING.
 */
export function evaluateWorkbenchIntakeRecord(rawRequest, rawContext) {
  const normalized = normalizeWorkBindingRequest(rawRequest);
  if (normalized.status !== "NORMALIZED") return reject(normalized.hold_code);
  const entry = guardEntry(rawContext, CONTEXT_FIELDS, CODES);
  if (entry.status !== "OK" || !exact(entry.value, CONTEXT_FIELDS)) return reject("INTAKE_CONTEXT_INVALID");
  const context = entry.value;
  if (!requestId(context.request_id) || !utc(context.created_at)
    || !isDenseArray(context.existing_records) || context.existing_records.length > 256) return reject("INTAKE_CONTEXT_INVALID");
  const binding = evaluateWorkBinding(normalized.request, context.trusted_evidence);
  if (binding.status === "HOLD") return reject(binding.hold_code);
  if (!context.existing_records.every(isWorkbenchIntakeRecord)) return reject("EXISTING_RECORD_INVALID");
  const matches = context.existing_records.filter(record => record.request.idempotency_key === normalized.request.idempotency_key);
  if (matches.length > 1) return reject("EXISTING_RECORD_AMBIGUOUS");
  if (matches.length === 1) {
    const existing = matches[0];
    if (existing.request_digest !== normalized.request_digest) return reject("IDEMPOTENCY_KEY_CONFLICT");
    return deepFreeze({ status: "RECORDED", hold_code: null, append_required: false, replayed: true, record: existing });
  }
  if (context.existing_records.some(record => record.request_id === context.request_id)) return reject("REQUEST_ID_CONFLICT");
  if (normalized.request.revision_of !== null) {
    const parent = context.existing_records.find(record => record.request_id === normalized.request.revision_of);
    const lineageFields = ["requester", "project_code", "product_ref", "work_package_ref", "stage_code", "artifact_family_id", "kind"];
    // Missing and foreign parents share one answer. Revision links are not a
    // way to learn about another actor's request or move work across scopes.
    if (!parent || lineageFields.some(field => parent.request[field] !== normalized.request[field])) return reject("REVISION_PARENT_UNAVAILABLE");
    if (normalized.request.revision_no !== parent.request.revision_no + 1) return reject("REVISION_SEQUENCE_CONFLICT");
    if (context.existing_records.some(record => record.request.revision_of === parent.request_id)) return reject("REVISION_ALREADY_EXISTS");
  }
  const body = {
    schema_version: WORKBENCH_INTAKE_REQUEST_SCHEMA, request_id: context.request_id,
    created_at: context.created_at, status: "RECORDED", request: normalized.request,
    request_digest: normalized.request_digest, binding, boundary: { ...BOUNDARY },
  };
  const record = deepFreeze({ ...body, record_digest: digestOf(body) });
  return deepFreeze({ status: "RECORDED", hold_code: null, append_required: true, replayed: false, record });
}
