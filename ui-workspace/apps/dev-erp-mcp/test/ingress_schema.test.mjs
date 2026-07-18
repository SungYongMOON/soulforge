import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schemaUrls = [
  new URL("../schema/ingress_mcp_binding.v1.schema.json", import.meta.url),
  new URL("../schema/ingress_mcp_auth_registry.v1.schema.json", import.meta.url),
  new URL("../schema/ingress_mcp_upload_ticket.v1.schema.json", import.meta.url),
  new URL("../schema/ingress_mcp_submission.v1.schema.json", import.meta.url),
  new URL("../schema/ingress_bounded_event.v1.schema.json", import.meta.url),
  new URL("../schema/ingress_mtls_gateway_binding.v1.schema.json", import.meta.url),
  new URL("../schema/ingress_mtls_device_registry.v1.schema.json", import.meta.url),
  new URL("../schema/ingress_mtls_client_binding.v1.schema.json", import.meta.url),
  new URL("../schema/ingress_mtls_enrollment_request.v1.schema.json", import.meta.url),
];

test("all ingress MCP schemas compile under strict Ajv 2020", async () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  for (const url of schemaUrls) {
    const schema = JSON.parse(await readFile(fileURLToPath(url), "utf8"));
    assert.doesNotThrow(() => ajv.compile(schema), fileURLToPath(url));
  }
});

test("mTLS gateway schema permits a null client IP only while disabled", async () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const schema = JSON.parse(await readFile(fileURLToPath(schemaUrls[5]), "utf8"));
  const validate = ajv.compile(schema);
  const binding = {
    schema_version: "soulforge.ingress.mtls_gateway_binding.v1",
    enabled: false,
    audience: "hpp_ingress_mcp",
    listen_host: "172.20.0.10",
    allowed_client_ipv4: null,
    listen_port: 8443,
    public_url: "https://172.20.0.10:8443",
    backend_url: "http://127.0.0.1:4312",
    ingress_mcp_binding_path: "private-binding.json",
    tls_cert_path: "server.crt",
    tls_key_path: "server.key",
    client_ca_path: "ca.crt",
    device_registry_path: "devices.json",
    max_requests_per_minute: 100,
    max_concurrent_requests_per_device: 8,
    max_body_bytes: 1048576,
    upstream_timeout_ms: 10000,
  };
  assert.equal(validate(binding), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...binding, enabled: true }), false);
  assert.equal(validate({ ...binding, enabled: true, allowed_client_ipv4: "172.20.0.11" }), true);
  assert.equal(validate({ ...binding, enabled: true, allowed_client_ipv4: "172.20.0.999" }), false);
});

test("bounded-event schema rejects transcript and official completion fields", async () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const schema = JSON.parse(await readFile(fileURLToPath(schemaUrls[4]), "utf8"));
  const validate = ajv.compile(schema);
  const event = {
    schema_version: "soulforge.ingress.bounded_event.v1",
    lane: "structured_pc_work",
    actor: { account_id: "alice", device_id: "pc_1", agent_id: "codex_1" },
    project_hint: "PRJ_A",
    occurrence_id: "work_1",
    idempotency_key: "work:event:001",
    event_kind: "checkpoint",
    occurred_at: "2026-07-17T00:00:00.000Z",
    task_ref: null,
    summary: "bounded",
    outputs: [],
    verification: null,
    next_actions: [],
    stop_conditions: [],
    official_completion: false,
    full_transcript_included: false,
    screen_capture_included: false,
    keystroke_capture_included: false,
    os_surveillance_included: false,
    accepted_history: false,
  };
  assert.equal(validate(event), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...event, official_completion: true }), false);
  assert.equal(validate({ ...event, transcript: "forbidden" }), false);
});
