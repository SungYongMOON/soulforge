import { createHash } from "node:crypto";

export const CLAIM_CEILING = "operational_evidence_only";
export const DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;
export const PUBLIC_COMMIT_RE = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
export const PUBLIC_REF_RE =
  /^refs\/(?:heads|tags)\/[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/u;

export const OPERATIONAL_NON_ACCEPTANCE = Object.freeze({
  official_completion: false,
  worksession_acceptance: false,
  taskdriver_acceptance: false,
  erp_acceptance: false,
  mcp_acceptance: false,
  claim_ceiling: CLAIM_CEILING,
});

const ERROR_CODE_RE = /^[a-z][a-z0-9_]{0,79}$/u;
const FORBIDDEN_INPUT_KEY_RE =
  /^(?:raw|chat|payload|body|messages?|transcript|credentials?|tokens?|passwords?|cookies?|sessions?|remote_url|url|userinfo)$/iu;
const ABSOLUTE_PATH_SENTINEL_RE =
  /(?:[A-Za-z]:[\\/]|\\\\[^\\\s]+\\|\/(?:Users|home|tmp|var|etc)\/|file:\/\/)/iu;
const SECRET_SENTINEL_RE =
  /(?:ghp_[A-Za-z0-9]{8,}|xoxb-[A-Za-z0-9-]{8,}|AKIA[A-Z0-9]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|passwd|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|authorization|bearer|credential|cookie)\s*[:=]\s*\S+)/iu;
const PRIVATE_URL_OR_REF_RE =
  /(?:^(?:https?|ssh|git):\/\/|^git@|^refs\/(?!heads\/|tags\/))/iu;

export class RecoveryContractError extends Error {
  constructor(code) {
    super(code);
    this.name = "RecoveryContractError";
    this.code = publicErrorCode({ code }, "contract_error");
  }
}

export function codedError(code) {
  return new RecoveryContractError(code);
}

export function publicErrorCode(error, fallback = "internal_error") {
  const candidate = typeof error?.code === "string" ? error.code : "";
  return ERROR_CODE_RE.test(candidate) ? candidate : fallback;
}

export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Digest(value) {
  const bytes = typeof value === "string" || ArrayBuffer.isView(value)
    ? value
    : canonicalize(value);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function exactKeys(value, allowed) {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.includes(key));
}

export function assertExactKeys(value, allowed, code = "input_contract_invalid") {
  if (!exactKeys(value, allowed)) throw codedError(code);
  return value;
}

export function rejectForbiddenInput(
  value,
  {
    allowedAbsolutePathKeys = [],
    code = "input_boundary_rejected",
  } = {},
  key = null,
) {
  if (key && FORBIDDEN_INPUT_KEY_RE.test(key)) throw codedError(code);
  if (Array.isArray(value)) {
    for (const item of value) {
      rejectForbiddenInput(item, { allowedAbsolutePathKeys, code });
    }
    return value;
  }
  if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) {
      rejectForbiddenInput(
        child,
        { allowedAbsolutePathKeys, code },
        childKey,
      );
    }
    return value;
  }
  if (typeof value !== "string") return value;
  if (
    SECRET_SENTINEL_RE.test(value)
    || PRIVATE_URL_OR_REF_RE.test(value)
    || (
      !allowedAbsolutePathKeys.includes(key)
      && ABSOLUTE_PATH_SENTINEL_RE.test(value)
    )
  ) {
    throw codedError(code);
  }
  return value;
}

export function operationalNonAcceptanceReceipt(overrides = {}) {
  return {
    ...overrides,
    ...OPERATIONAL_NON_ACCEPTANCE,
  };
}

export function normalizePublicCommitRef(value, code = "public_commit_ref_invalid") {
  if (typeof value !== "string" || !PUBLIC_COMMIT_RE.test(value)) {
    throw codedError(code);
  }
  return value;
}

export function normalizeUtc(value, code = "timestamp_invalid") {
  if (typeof value !== "string" || !value.endsWith("Z")) {
    throw codedError(code);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf())) throw codedError(code);
  return parsed.toISOString();
}
