import { createHash } from "node:crypto";

import { fail } from "./errors.mjs";

function normalize(value, path) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail("canonical_json_non_finite", `Non-finite number at ${path}`);
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => normalize(item, `${path}[${index}]`));
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      fail("canonical_json_non_plain_object", `Non-plain object at ${path}`);
    }
    const output = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child === undefined || typeof child === "function" || typeof child === "symbol" || typeof child === "bigint") {
        fail("canonical_json_unsupported_value", `Unsupported value at ${path}.${key}`);
      }
      output[key] = normalize(child, `${path}.${key}`);
    }
    return output;
  }
  fail("canonical_json_unsupported_value", `Unsupported value at ${path}`);
}

export function canonicalJson(value) {
  return JSON.stringify(normalize(value, "$"));
}

export function sha256Bytes(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256Canonical(value) {
  return sha256Bytes(Buffer.from(canonicalJson(value), "utf8"));
}
