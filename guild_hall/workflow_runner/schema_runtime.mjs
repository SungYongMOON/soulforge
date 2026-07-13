import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

import { fail } from "./errors.mjs";
import { isCanonicalDate, isCanonicalDateTime } from "./temporal.mjs";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONTRACT_ROOT = path.join(REPOSITORY_ROOT, ".workflow", "report_authoring_v0", "contracts");
const CONTRACT_FILES = Object.freeze({
  request: "workflow_job_request.v1.schema.json",
  state: "workflow_job_state.v1.schema.json",
  result: "workflow_job_result.v1.schema.json",
  outcome: "workflow_job_outcome.v1.schema.json",
  receipt: "workflow_receipt.v1.schema.json",
  report_document: "report_document.v1.schema.json",
  semantic_verifier: "semantic_verifier_result.v1.schema.json",
  semantic_preservation: "semantic_preservation_audit.v1.schema.json",
  editorial_pass: "editorial_pass_record.v1.schema.json",
  summary_derivation: "summary_derivation_record.v1.schema.json",
  identity_authority_record: "identity_authority_record.v1.schema.json",
  finalize_config: "workflow_cli_finalize.v1.schema.json",
  execution_packet: "workflow_execution_packet.v1.schema.json",
  issue_authority_config: "workflow_cli_issue_authority.v1.schema.json",
});

const validators = new Map();

function createAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addFormat("date", { type: "string", validate: isCanonicalDate });
  ajv.addFormat("date-time", { type: "string", validate: isCanonicalDateTime });
  return ajv;
}

async function validatorFor(kind) {
  const filename = CONTRACT_FILES[kind];
  if (!filename) fail("schema_contract_kind_invalid", `Unknown schema contract kind: ${kind}`);
  let promise = validators.get(kind);
  if (!promise) {
    promise = (async () => {
      const schema = JSON.parse(await fs.readFile(path.join(CONTRACT_ROOT, filename), "utf8"));
      return createAjv().compile(schema);
    })();
    validators.set(kind, promise);
  }
  return promise;
}

export async function validateSchemaContract(kind, value) {
  const validate = await validatorFor(kind);
  if (!validate(value)) {
    const first = validate.errors?.[0];
    fail("schema_validation_failed", `JSON Schema rejected ${kind} at ${first?.instancePath || "$"} (${first?.keyword ?? "unknown"})`, {
      kind,
      instance_path: first?.instancePath || "$",
      keyword: first?.keyword ?? "unknown",
    });
  }
  return value;
}

export async function compileAllRuntimeSchemas() {
  for (const kind of Object.keys(CONTRACT_FILES)) await validatorFor(kind);
  return { schema: "soulforge.workflow_schema_compilation.v1", status: "pass", kinds: Object.keys(CONTRACT_FILES) };
}

export function listRuntimeSchemaKinds() {
  return Object.keys(CONTRACT_FILES);
}
