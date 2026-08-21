import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HELD_PRODUCTION_PRESERVATION_ADAPTER,
  createSyntheticPreservationWriterAdapter,
  createSyntheticPreservationReaderAdapter
} from "./retention_preservation_gate.mjs";

describe("Backup Controller Retention Preservation Gate", () => {
  it("HELD_PRODUCTION_PRESERVATION_ADAPTER is feature-OFF and refuses write/read", () => {
    assert.equal(HELD_PRODUCTION_PRESERVATION_ADAPTER.feature_state, "off");
    assert.equal(HELD_PRODUCTION_PRESERVATION_ADAPTER.authority_state, "hold");

    const writeRes = HELD_PRODUCTION_PRESERVATION_ADAPTER.writePreservation();
    assert.equal(writeRes.success, false);
    assert.equal(writeRes.error_code, "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN");

    const readRes = HELD_PRODUCTION_PRESERVATION_ADAPTER.readPreservation();
    assert.equal(readRes.success, false);
    assert.equal(readRes.error_code, "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN");
  });

  it("synthetic writer and reader adapters write, readback, and track calls", () => {
    const store = new Map();
    const writer = createSyntheticPreservationWriterAdapter({ store });
    const reader = createSyntheticPreservationReaderAdapter({ store });

    const manifest = { manifest_id: "pmst-test1234", manifest_digest: "sha256:1111111111111111111111111111111111111111111111111111111111111111" };
    const objects = [{ object_id: "obj-1", kind: "payload", digest: "sha256:2222", byte_count: 5, bytes: Buffer.from("hello") }];

    const writeRes = writer.writePreservation(manifest, objects);
    assert.equal(writeRes.success, true);
    assert.equal(writer.getWriteCalls(), 1);

    const readRes = reader.readPreservation("pmst-test1234");
    assert.equal(readRes.success, true);
    assert.equal(reader.getReadCalls(), 1);
    assert.equal(readRes.objects[0].bytes.toString("utf8"), "hello");
  });
});
