import test from "node:test";
import assert from "node:assert/strict";
import { edgeDeliveryVerdict, TOPOLOGY_EDGES, validateTopologyDefinition } from "./topology.mjs";

const NOW = Date.parse("2031-03-04T05:06:07.000Z");
const WINDOW = { period_seconds: 60, grace_seconds: 20 };

for (const id of ["ordinary_receipt", "constructor"]) {
  test(`registered ${id} receipt requires its own timing window`, () => {
    const edge = { receipt: id };
    for (const windows of [{}, { [id]: undefined }]) {
      assert.throws(() => edgeDeliveryVerdict(edge, { windows, now: NOW }), {
        code: "edge_delivery_window_absent",
      });
    }
    assert.throws(() => edgeDeliveryVerdict(edge, {
      windows: { [id]: { period_seconds: 0, grace_seconds: 20 } }, now: NOW,
    }), { code: "edge_delivery_window_invalid" });
  });

  test(`registered ${id} receipt uses only its own delivery evidence`, () => {
    const { unreceipted_reason, ...definition } = TOPOLOGY_EDGES[0];
    const edge = { ...definition, receipt: id };
    assert.doesNotThrow(() => validateTopologyDefinition({ edges: [edge] }));
    const verdict = (receipts) => edgeDeliveryVerdict(edge, {
      receipts, windows: { [id]: WINDOW }, now: NOW,
    });
    const missing = { state: "registered_no_delivery", reason: "no_receipt_observed", proves_delivery: false };
    assert.deepEqual(verdict({}), missing);
    assert.deepEqual(verdict({ [id]: null }), missing);
    assert.deepEqual(verdict({ [id]: undefined }), missing);
    assert.deepEqual(verdict({ [id]: { outcome: "delivered", observed_at_ms: NOW } }), {
      state: "delivering", age_seconds: 0, proves_delivery: true,
    });
    assert.deepEqual(verdict({ [id]: { outcome: "failed", failure_code: "synthetic_failure" } }), {
      state: "failed", reason: "synthetic_failure", proves_delivery: false,
    });
    assert.throws(() => verdict({ [id]: { outcome: "invalid" } }), {
      code: "edge_delivery_outcome_invalid",
    });
  });
}
