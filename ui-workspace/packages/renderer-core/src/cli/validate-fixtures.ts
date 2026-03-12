import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const cliDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(cliDir, "../../../..");
const schemaPath = path.resolve(repoRoot, "schemas/ui-state.schema.json");
const fixtureDir = path.resolve(repoRoot, "fixtures/ui-state");

const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

let failures = 0;

for (const fileName of readdirSync(fixtureDir).filter((entry) => entry.endsWith(".json")).sort()) {
  const payload = JSON.parse(readFileSync(path.resolve(fixtureDir, fileName), "utf-8"));
  const valid = validate(payload);
  if (!valid) {
    failures += 1;
    console.error(`FAIL ${fileName}`);
    for (const error of validate.errors ?? []) {
      console.error(`  ${error.instancePath || "/"} ${error.message ?? "invalid"}`);
    }
    continue;
  }
  console.log(`PASS ${fileName}`);
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log("PASS ui-state fixture validation");
}
