// Fixed official CycloneDX 1.6 closure; no schema retrieval or network loader.
import { createHash } from "node:crypto";
import { readFileSync, lstatSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Ajv = require("ajv");
export const SCHEMA_COMMIT = "595d98f16159bdf7463adc140509ded479130b8b";
export const SCHEMA_PINS = Object.freeze({
  "bom-1.6.schema.json": "18f57f7482593bad9f21b4feed09084640cbeff419d62ad5090c5ceccca5b37d",
  "jsf-0.82.schema.json": "8bae002c25e723db7ee1f26afde680ae1a2b1a8f6b4b4b0fd65dc3becb090aae",
  "spdx.schema.json": "ea6e844ee6fba1e93473d94834d0ee0996970533497935f932f73d488ffdf4a3",
  LICENSE: "6c29f22a4a7385285c6f579ec9f33c5e989f00739d6b257243a0b082ec9447ae",
});
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
let validator;

export function validateCycloneDx16(bom) {
  const schemas = [];
  // Recheck pins even when the compiled validator is cached.
  for (const [name, pin] of Object.entries(SCHEMA_PINS)) {
    const path = new URL(`../vendor/cyclonedx-1.6/${name}`, import.meta.url);
    let bytes;
    try {
      const info = lstatSync(path);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 300_000) fail("sbom_schema_pin_invalid");
      bytes = readFileSync(path);
    } catch { fail("sbom_schema_pin_invalid"); }
    if (createHash("sha256").update(bytes).digest("hex") !== pin) fail("sbom_schema_pin_invalid");
    if (name.endsWith(".json")) schemas.push(JSON.parse(bytes));
  }
  // Official specVersion is a string, so the product profile checks 1.6 itself.
  if (bom?.bomFormat !== "CycloneDX" || bom?.specVersion !== "1.6") fail("sbom_version_invalid");
  if (!validator) {
    const ajv = new Ajv({ strict: false, validateFormats: true, allErrors: false });
    // This inventory profile emits no format-bearing fields. Refuse any
    // exercised format rather than silently ignoring unsupported validators.
    const formats = new Set();
    const visit = (value) => {
      if (!value || typeof value !== "object") return;
      if (typeof value.format === "string") formats.add(value.format);
      for (const child of Object.values(value)) visit(child);
    };
    schemas.forEach(visit);
    for (const format of formats) ajv.addFormat(format, { type: "string", validate: () => fail("sbom_format_unsupported") });
    for (const schema of schemas) ajv.addSchema(schema);
    validator = ajv.getSchema("http://cyclonedx.org/schema/bom-1.6.schema.json");
  }
  if (!validator(bom)) fail("sbom_schema_invalid");
  return { schema_commit: SCHEMA_COMMIT, schema_sha256: SCHEMA_PINS["bom-1.6.schema.json"], schema_validation: "PASS", network: "NOT_USED" };
}
