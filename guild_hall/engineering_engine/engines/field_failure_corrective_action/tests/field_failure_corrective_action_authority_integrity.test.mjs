import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import * as rules from "../rules/field_failure_corrective_action_rules.mjs";
import { assessFieldFailureCorrectiveAction } from "../evaluator/field_failure_corrective_action.mjs";
import { buildFieldFailureCorrectiveActionPublicSyntheticRequest } from "../fixtures/field_failure_corrective_action_public_synthetic.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PACKET_PATH = path.join(HERE, "..", "contracts", "field_failure_corrective_action_source_packet_v0.md");

test("FFCA rule lookup authority is not externally mutable", () => {
  assert.equal(Object.hasOwn(rules, "FFCA_RULE_BY_ID"), false);
  assert.throws(() => rules.FFCA_RULE_BY_ID.set("FFCA-INTAKE-01", {}), TypeError);

  const intake = rules.getFfcaRule("FFCA-INTAKE-01");
  assert.ok(Object.isFrozen(intake));
  assert.ok(Object.isFrozen(intake.source_refs));
  assert.throws(() => {
    intake.source_locator = "FORGED-LOCATOR";
  }, TypeError);

  const result = assessFieldFailureCorrectiveAction(buildFieldFailureCorrectiveActionPublicSyntheticRequest());
  assert.notEqual(result.results.find((row) => row.rule_id === "FFCA-INTAKE-01").source_locator, "FORGED-LOCATOR");
});

test("FFCA source packet identity pins the accepted public Markdown bytes", () => {
  const actual = createHash("sha256").update(readFileSync(SOURCE_PACKET_PATH)).digest("hex");
  assert.equal(actual, rules.FFCA_SOURCE_PACKET_MARKDOWN_SHA256);
  assert.equal(rules.FFCA_SOURCE_PACKET_REF.content_id, "sha256:" + actual);
});
