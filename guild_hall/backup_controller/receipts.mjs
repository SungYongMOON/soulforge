import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { BackupControllerError } from "./controller.mjs";

export const EXTERNAL_RECEIPT_SCHEMA_VERSION = "soulforge.backup_controller.external_receipt.v1";
const SHA256 = /^[a-f0-9]{64}$/;
const OPERATION_KEY = /^backup-operation-[a-f0-9]{64}$/;
const FENCE_TOKEN = /^[a-f0-9-]{36}$/;

function fail(code) {
  throw new BackupControllerError(code);
}

function exactKeys(value, expected, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function assertMetadataOnly(value) {
  if (Array.isArray(value)) {
    for (const item of value) assertMetadataOnly(item);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) assertMetadataOnly(item);
    return;
  }
  if (typeof value === "string" && path.isAbsolute(value)) fail("receipt_absolute_path_rejected");
}

export function validateExternalReceipt(receipt, expected = {}) {
  exactKeys(receipt, ["schema_version", "operation_key", "stage_id", "period_key", "fence_token", "completed_at", "result_sha256", "result"], "external_receipt_shape_invalid");
  if (receipt.schema_version !== EXTERNAL_RECEIPT_SCHEMA_VERSION || !OPERATION_KEY.test(receipt.operation_key)) fail("external_receipt_invalid");
  if (typeof receipt.stage_id !== "string" || !/^[a-z][a-z0-9_]{2,63}$/.test(receipt.stage_id)) fail("external_receipt_invalid");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receipt.period_key) || !FENCE_TOKEN.test(receipt.fence_token)) fail("external_receipt_invalid");
  if (typeof receipt.completed_at !== "string" || Number.isNaN(Date.parse(receipt.completed_at)) || new Date(receipt.completed_at).toISOString() !== receipt.completed_at) fail("external_receipt_invalid");
  if (!SHA256.test(receipt.result_sha256) || receipt.result_sha256 !== createHash("sha256").update(stableJson(receipt.result)).digest("hex")) fail("external_receipt_result_digest_invalid");
  assertMetadataOnly(receipt.result);
  for (const [key, value] of Object.entries(expected)) {
    if (value !== undefined && receipt[key] !== value) fail("external_receipt_identity_mismatch");
  }
  return receipt;
}

export function createExternalReceiptStore(reportRoot) {
  const receiptRoot = path.join(path.resolve(reportRoot), "backup-controller-receipts");
  const receiptRef = (operationKey) => {
    if (!OPERATION_KEY.test(operationKey)) fail("external_receipt_operation_invalid");
    return path.join(receiptRoot, `${operationKey}.json`);
  };
  return Object.freeze({
    async read(expected, { acceptedFenceTokens } = {}) {
      let bytes;
      try {
        bytes = await readFile(receiptRef(expected.operation_key));
      } catch (error) {
        if (error?.code === "ENOENT") return null;
        fail("external_receipt_read_failed");
      }
      let receipt;
      try {
        receipt = JSON.parse(bytes.toString("utf8"));
      } catch {
        fail("external_receipt_json_invalid");
      }
      validateExternalReceipt(receipt, { operation_key: expected.operation_key, stage_id: expected.stage_id, period_key: expected.period_key });
      if (acceptedFenceTokens && !acceptedFenceTokens.includes(receipt.fence_token)) fail("external_receipt_fence_mismatch");
      return { receipt, receipt_sha256: createHash("sha256").update(bytes).digest("hex") };
    },

    async write(context, result, completedAt = new Date()) {
      let normalizedResult;
      try {
        normalizedResult = JSON.parse(JSON.stringify(result));
      } catch {
        fail("external_receipt_result_invalid");
      }
      assertMetadataOnly(normalizedResult);
      const existing = await this.read(context, { acceptedFenceTokens: [context.fence_token, context.previous_fence_token].filter(Boolean) });
      if (existing) return existing;
      const receipt = validateExternalReceipt({
        schema_version: EXTERNAL_RECEIPT_SCHEMA_VERSION,
        operation_key: context.operation_key,
        stage_id: context.stage_id,
        period_key: context.period_key,
        fence_token: context.fence_token,
        completed_at: completedAt.toISOString(),
        result_sha256: createHash("sha256").update(stableJson(normalizedResult)).digest("hex"),
        result: normalizedResult,
      });
      const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
      const target = receiptRef(context.operation_key);
      const temporary = path.join(receiptRoot, `.${context.operation_key}.${randomUUID()}.tmp`);
      await mkdir(receiptRoot, { recursive: true });
      try {
        await writeFile(temporary, bytes, { flag: "wx" });
        await rename(temporary, target);
      } catch (error) {
        await unlink(temporary).catch(() => {});
        if (error?.code !== "EEXIST") fail("external_receipt_write_failed");
      }
      return this.read(context, { acceptedFenceTokens: [context.fence_token, context.previous_fence_token].filter(Boolean) });
    },
  });
}
