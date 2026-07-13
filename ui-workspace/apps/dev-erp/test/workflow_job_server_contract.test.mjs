import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

test('server keeps the report route default-off behind deployment attestation and a receipt sink', () => {
  assert.match(server, /evaluateWorkflowDeploymentAttestation/);
  assert.match(server, /DEV_ERP_REPORT_WORKFLOW_ENABLED/);
  assert.match(server, /enabled:\s*false/);
  assert.match(server, /actualProbePassed:\s*false/);
  assert.match(server, /workflow_receipt_store_unconfigured/);
  assert.match(server, /erp_shared_runner_single_writer_path_unattested/);
});

test('workflow controller is installed after global auth and before ordinary API routes', () => {
  const controllerCall = server.indexOf('await workflowHttpController(req, res, url)');
  const healthRoute = server.indexOf('path === "/api/health"');
  assert.ok(controllerCall > 0);
  assert.ok(healthRoute > controllerCall);
});

test('fixed workflow integration does not replace legacy draft or chat routes', () => {
  assert.match(server, /\/api\/worklog\/draft/);
  assert.match(server, /\/api\/report\/draft/);
  assert.match(server, /\/api\/chat/);
});
