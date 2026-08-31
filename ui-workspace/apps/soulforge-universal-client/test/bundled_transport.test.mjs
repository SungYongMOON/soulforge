import test from "node:test";
import assert from "node:assert/strict";

import {
  INGRESS_MTLS_CLIENT_SCHEMA,
  createBoundIngressClient,
  createIngressMtlsFetch,
  loadIngressMtlsClientBinding,
} from "../generated/ingress_mtls_client.bundle.mjs";
import { ErpClient } from "../../dev-erp-mcp/src/erp_client.mjs";
import { enqueueLocalOutboxFile } from "../../../../guild_hall/ingress/local_outbox.mjs";
import { evaluateDeploymentReadiness } from "../../../../guild_hall/doctor/deployment_readiness.mjs";

test("installed transport bundle exposes the exact mTLS Client surface without external npm resolution", () => {
  assert.equal(INGRESS_MTLS_CLIENT_SCHEMA, "soulforge.ingress.mtls_client_binding.v1");
  assert.equal(typeof createBoundIngressClient, "function");
  assert.equal(typeof createIngressMtlsFetch, "function");
  assert.equal(typeof loadIngressMtlsClientBinding, "function");
  assert.equal(typeof ErpClient, "function");
  assert.equal(typeof enqueueLocalOutboxFile, "function");
  assert.equal(typeof evaluateDeploymentReadiness, "function");
  assert.doesNotThrow(() => new ErpClient({ baseUrl: "https://erp.example.test" }));
});
