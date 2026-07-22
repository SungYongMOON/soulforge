import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import {
  assertProjectHistoryBindHost,
  createProjectHistoryMcpHttpServer,
} from "../project_history_server.mjs";
import {
  createProjectHistoryMcpService,
} from "../src/project_history_service.mjs";
import {
  ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION,
} from "../../../../guild_hall/shared/project_history_actual_shadow.mjs";
import {
  PROJECT_HISTORY_LANES,
  canonicalJson,
  sha256Canonical,
} from "../../../../guild_hall/shared/project_history_envelope.mjs";
import {
  PROJECT_HISTORY_RECEIPT_ADAPTER_REQUEST_SCHEMA_VERSION,
  PROJECT_HISTORY_SHADOW_ADAPTER_AUTHORITY_RECORD_SCHEMA_VERSION,
  openProjectHistoryShadowAdapterAuthorityV1,
} from "../../../../guild_hall/shared/project_history_receipt_adapter_v2.mjs";
import {
  buildSyntheticFiveLaneShadowFixture,
  buildSyntheticH06CoverageFixture,
} from "../../../../guild_hall/shared/project_history_readiness.mjs";
import {
  canonicalProjectHistoryProjectionSchemaFingerprint,
  createProjectHistoryProjectionSchema,
  projectCopiedErpHistory,
} from "../../dev-erp/tools/project_history_copy_projector.mjs";
import {
  createProjectHistoryCopyBinding,
  resolveProjectHistoryCopyArtifactPaths,
  writeProjectHistoryCopyBinding,
} from "../../dev-erp/tools/project_history_copy_binding.mjs";

const windowsPathLockTest = process.platform === "win32"
  ? test
  : (name, fn) => test(name, { skip: "requires the Windows identity-bound path lock" }, fn);

const TOKEN = "synthetic_project_history_token_000000000001";

function makeGeneration() {
  const shadow = buildSyntheticFiveLaneShadowFixture();
  const coverage = buildSyntheticH06CoverageFixture(shadow.envelopes);
  return {
    schema_version: ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION,
    generation_id: "generation:001",
    project_ref: shadow.project_ref,
    classification_state: "shadow",
    envelopes: shadow.envelopes,
    coverage_receipts: coverage.receipts,
    ordered_event_digest: sha256Canonical(shadow.envelopes.map((envelope) => envelope.metadata_digest)),
    source_attestation_digest: sha256Canonical({ source: "synthetic-mcp-attestation" }),
    raw_payload_copied: false,
    accepted_history: false,
  };
}

const GENERATION = makeGeneration();
const PROJECT_ID = GENERATION.project_ref.entity_id;
const GENERATION_ID = GENERATION.generation_id;

function makeXlsxContainer(marker = "verified") {
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
      marker,
    ].join("\0"), "utf8"),
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    Buffer.alloc(18),
  ]);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function digestFile(filePath) {
  return sha256(readFileSync(filePath));
}

function authorityRef(entityType, ownerSurface, entityId) {
  return { entity_type: entityType, owner_surface: ownerSurface, entity_id: entityId };
}

function createProjectionAuthority(root) {
  const now = Date.now();
  const issuedAt = new Date(now - 60 * 60 * 1000).toISOString();
  const expiresAt = new Date(now + 60 * 60 * 1000).toISOString();
  const request = {
    schema_version: PROJECT_HISTORY_RECEIPT_ADAPTER_REQUEST_SCHEMA_VERSION,
    feature_state: "off",
    generation_id: "generation:mcp-projector-authority:test",
    generated_at: new Date(now).toISOString(),
    receipt_root: path.resolve(root),
    project_ref: GENERATION.project_ref,
    window_start: new Date(now - 1000).toISOString(),
    window_end: new Date(now + 1000).toISOString(),
    classification_state: "shadow",
    required_writer_epoch: 23,
    writer_authority: {
      epoch: 23,
      digest: sha256Canonical({ pending: true }),
      node_id: "mcp-projector-test-node",
      issued_at: issuedAt,
      expires_at: expiresAt,
      revoked: false,
    },
    coverage: PROJECT_HISTORY_LANES.map((lane) => ({
      lane,
      source_owner_ref: authorityRef("source_owner", "private_mcp_test", `owner-${lane}`),
      project_ref: GENERATION.project_ref,
      state: "complete_no_events",
      gap_codes: [],
    })),
    occurrences: [],
    raw_payload_copied: false,
    accepted_history: false,
  };
  const record = {
    schema_version: PROJECT_HISTORY_SHADOW_ADAPTER_AUTHORITY_RECORD_SCHEMA_VERSION,
    authority_scope: "project_history_shadow_adapter",
    feature_state: "off",
    classification_state: "shadow",
    epoch: 23,
    node_id: "mcp-projector-test-node",
    not_before: issuedAt,
    expires_at: expiresAt,
    revoked: false,
    owner_approval_ref: authorityRef(
      "owner_approval",
      "private_mcp_projector_authority",
      "approval:mcp-projector-test",
    ),
    classification_epoch: null,
    projector_epoch: null,
    production_authority_granted: false,
    raw_ingress_authority_reused: false,
    accepted_history: false,
  };
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
  const authorityPath = path.join(root, "private-mcp-projector-authority.json");
  writeFileSync(authorityPath, bytes);
  const authorityDigest = `sha256:${sha256(bytes)}`;
  request.writer_authority.digest = authorityDigest;
  return openProjectHistoryShadowAdapterAuthorityV1({
    authorityPath,
    authorityDigest,
    request,
  });
}

function createFixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "sf-project-history-mcp-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dbPath = path.join(root, "copied-erp.sqlite");
  const projectionRoot = path.join(root, "project-history");
  const bindingPath = path.join(root, "private-binding.json");
  mkdirSync(projectionRoot, { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE copied_erp_sentinel (value TEXT NOT NULL); INSERT INTO copied_erp_sentinel VALUES ('unchanged');");
  db.close();

  const binding = createProjectHistoryCopyBinding({
    dbPath,
    projectionRoot,
    allowedProjectIds: [PROJECT_ID],
  });
  writeProjectHistoryCopyBinding(bindingPath, binding);
  const paths = resolveProjectHistoryCopyArtifactPaths(binding, {
    projectId: PROJECT_ID,
    generationId: GENERATION_ID,
  });
  const attestation = sha256Canonical(GENERATION);
  const authoritySnapshot = createProjectionAuthority(root);
  const projected = projectCopiedErpHistory({
    ...paths,
    dbPath,
    bindingPath,
    bindingDigest: binding.binding_digest,
    generation: GENERATION,
    authoritySnapshot,
    pilotCopy: true,
    attestation,
  });
  const artifactManifestPacket = JSON.parse(readFileSync(paths.artifactManifestPath, "utf8"));
  return {
    root,
    dbPath,
    projectionRoot,
    bindingPath,
    binding,
    bindingDigest: binding.binding_digest,
    artifactDirectory: paths.directory,
    ...paths,
    artifactManifestPacket,
    attestation,
    artifactManifestDigest: projected.artifact_manifest_digest,
    csvBytes: readFileSync(paths.csvPath),
    xlsxBytes: readFileSync(paths.xlsxPath),
    dbDigest: digestFile(dbPath),
  };
}

function createService(fixture, options = {}) {
  return createProjectHistoryMcpService({
    bindingPath: fixture.bindingPath,
    bindingDigest: fixture.bindingDigest,
    artifactManifestPath: fixture.artifactManifestPath,
    artifactManifestDigest: fixture.artifactManifestDigest,
    bearerToken: TOKEN,
    pilotCopy: true,
    ...options,
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function connectMcp(baseUrl, token = TOKEN) {
  const client = new Client({ name: "project-history-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return { client, transport };
}

function payload(result) {
  return JSON.parse(result.content[0].text);
}

function rawRequest({ port, path: requestPath, host = `127.0.0.1:${port}`, headers = {} }) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      host: "127.0.0.1",
      port,
      path: requestPath,
      method: "GET",
      headers: { Host: host, ...headers },
    }, async (response) => {
      const chunks = [];
      for await (const chunk of response) chunks.push(chunk);
      resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      });
    });
    request.once("error", reject);
    request.end();
  });
}

windowsPathLockTest("feature-OFF MCP exposes exactly two exact-generation tools without mutating the copied DB", async (t) => {
  const fixture = createFixture(t);
  assert.notEqual(
    `sha256:${fixture.dbDigest}`,
    fixture.artifactManifestPacket.database_after_sha256,
  );
  const service = createService(fixture);
  const server = createProjectHistoryMcpHttpServer({ service });
  const port = await listen(server);
  const base = `http://127.0.0.1:${port}`;
  const connected = await connectMcp(base);
  try {
    const tools = await connected.client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      "erp_get_project_history",
      "erp_prepare_project_history_download",
    ]);
    assert.ok(tools.tools.every((tool) => tool.annotations.readOnlyHint === true));

    const history = payload(await connected.client.callTool({
      name: "erp_get_project_history",
      arguments: { project_id: PROJECT_ID, generation_id: GENERATION_ID },
    }));
    assert.equal(history.project_id, PROJECT_ID);
    assert.equal(history.generation_id, GENERATION_ID);
    assert.equal(history.events.length, 5);
    assert.deepEqual(history.events.map((row) => row.sort_ordinal), [0, 1, 2, 3, 4]);
    assert.equal(history.coverage.length, 5);
    assert.equal(history.raw_payload_copied, false);
    assert.equal(history.accepted_history, false);

    const missing = await connected.client.callTool({
      name: "erp_get_project_history",
      arguments: { project_id: "project-missing", generation_id: GENERATION_ID },
    });
    assert.equal(missing.isError, true);
    assert.deepEqual(payload(missing), { error: "project_history_unavailable" });

    const unauthorized = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { Authorization: "Bearer invalid_project_history_token_000000000" },
    });
    assert.equal(unauthorized.status, 404);
    assert.deepEqual(await unauthorized.json(), payload(missing));

    assert.deepEqual(service.diagnostics(), {
      feature_state: "off",
      query_only: true,
      total_changes: 0,
      projection_schema_fingerprint: canonicalProjectHistoryProjectionSchemaFingerprint(),
      sealed_artifact_bytes: fixture.csvBytes.length + fixture.xlsxBytes.length,
      active_tickets: 0,
      active_ticket_bytes: 0,
    });
  } finally {
    await connected.transport.close();
    await connected.client.close();
    await close(server);
    service.close();
  }
  assert.equal(digestFile(fixture.dbPath), fixture.dbDigest);
  const verify = new DatabaseSync(fixture.dbPath, { readOnly: true });
  assert.equal(Number(verify.prepare("SELECT total_changes() AS count").get().count), 0);
  assert.equal(verify.prepare("SELECT value FROM copied_erp_sentinel").get().value, "unchanged");
  verify.close();
});

windowsPathLockTest("raw downloads are hash-bound, single-use, range-bounded, and expire", async (t) => {
  const fixture = createFixture(t);
  let clock = Date.parse("2026-07-19T00:00:00.000Z");
  const service = createService(fixture, { now: () => clock, ticketTtlMs: 1_000 });
  const server = createProjectHistoryMcpHttpServer({ service });
  const port = await listen(server);
  const base = `http://127.0.0.1:${port}`;
  const connected = await connectMcp(base);
  try {
    const preparedCsv = payload(await connected.client.callTool({
      name: "erp_prepare_project_history_download",
      arguments: { project_id: PROJECT_ID, generation_id: GENERATION_ID, format: "csv" },
    }));
    assert.equal(preparedCsv.filename, "project_history.csv");
    assert.equal(preparedCsv.size, fixture.csvBytes.length);
    assert.equal(preparedCsv.sha256, sha256(fixture.csvBytes));
    assert.equal(preparedCsv.one_time, true);
    assert.equal(JSON.stringify(preparedCsv).includes(fixture.projectionRoot), false);

    const csvUrl = preparedCsv.download_url;
    assert.equal(new URL(csvUrl).origin, base);
    const full = await fetch(csvUrl);
    assert.equal(full.status, 200);
    assert.equal(full.headers.get("cache-control"), "no-store");
    assert.equal(full.headers.get("x-content-type-options"), "nosniff");
    assert.equal(full.headers.get("accept-ranges"), "bytes");
    assert.deepEqual(Buffer.from(await full.arrayBuffer()), fixture.csvBytes);
    assert.equal((await fetch(csvUrl)).status, 404);

    const preparedXlsx = payload(await connected.client.callTool({
      name: "erp_prepare_project_history_download",
      arguments: { project_id: PROJECT_ID, generation_id: GENERATION_ID, format: "xlsx" },
    }));
    const xlsxUrl = preparedXlsx.download_url;
    const range = await fetch(xlsxUrl, { headers: { Range: "bytes=2-8" } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get("content-range"), `bytes 2-8/${fixture.xlsxBytes.length}`);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), fixture.xlsxBytes.subarray(2, 9));
    assert.equal((await fetch(xlsxUrl)).status, 404);

    const bounded = payload(await connected.client.callTool({
      name: "erp_prepare_project_history_download",
      arguments: { project_id: PROJECT_ID, generation_id: GENERATION_ID, format: "csv" },
    }));
    const boundedUrl = bounded.download_url;
    assert.equal((await fetch(boundedUrl, { headers: { Range: "bytes=0-1,4-5" } })).status, 416);
    assert.equal((await fetch(boundedUrl)).status, 200);

    const expiring = payload(await connected.client.callTool({
      name: "erp_prepare_project_history_download",
      arguments: { project_id: PROJECT_ID, generation_id: GENERATION_ID, format: "csv" },
    }));
    clock += 1_000;
    assert.equal((await fetch(expiring.download_url)).status, 404);
  } finally {
    await connected.transport.close();
    await connected.client.close();
    await close(server);
    service.close();
  }
  assert.equal(digestFile(fixture.dbPath), fixture.dbDigest);
});

windowsPathLockTest("projection traversal is rejected and artifacts remain sealed after startup", async (t) => {
  const fixture = createFixture(t);
  const service = createService(fixture);
  const server = createProjectHistoryMcpHttpServer({ service });
  const port = await listen(server);
  const base = `http://127.0.0.1:${port}`;
  const connected = await connectMcp(base);
  try {
    const traversal = await connected.client.callTool({
      name: "erp_prepare_project_history_download",
      arguments: { project_id: "..", generation_id: GENERATION_ID, format: "csv" },
    });
    assert.equal(traversal.isError, true);
    assert.deepEqual(payload(traversal), { error: "project_history_unavailable" });

    const rawTraversal = await rawRequest({
      port,
      path: "/download/../project_history.csv",
    });
    assert.equal(rawTraversal.status, 404);

    const projectDirectory = path.dirname(fixture.artifactDirectory);
    const outside = path.join(fixture.projectionRoot, "reparse-target");
    renameSync(projectDirectory, outside);
    symlinkSync(outside, projectDirectory, "junction");
    const sealed = payload(await connected.client.callTool({
      name: "erp_prepare_project_history_download",
      arguments: { project_id: PROJECT_ID, generation_id: GENERATION_ID, format: "xlsx" },
    }));
    const response = await fetch(sealed.download_url);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), fixture.xlsxBytes);
  } finally {
    await connected.transport.close();
    await connected.client.close();
    await close(server);
    service.close();
  }
});

windowsPathLockTest("startup rejects symlink or reparse artifact directories before sealing", (t) => {
  const fixture = createFixture(t);
  const projectDirectory = path.dirname(fixture.artifactDirectory);
  const outside = path.join(fixture.projectionRoot, "reparse-target");
  renameSync(projectDirectory, outside);
  symlinkSync(outside, projectDirectory, "junction");
  assert.throws(
    () => createService(fixture),
    (error) => error.code === "project_history_projection_or_artifact_invalid",
  );
});

windowsPathLockTest("startup rejects weakened schema and generation JSON tampering", (t) => {
  const weakened = createFixture(t);
  let db = new DatabaseSync(weakened.dbPath);
  db.exec("DROP TRIGGER project_history_event_no_update");
  db.close();
  assert.throws(
    () => createService(weakened),
    (error) => error.code === "project_history_projection_or_artifact_invalid",
  );

  const tampered = createFixture(t);
  db = new DatabaseSync(tampered.dbPath);
  const row = db.prepare(
    "SELECT envelope_json FROM project_history_event WHERE generation_id = ? AND sort_ordinal = 0",
  ).get(GENERATION_ID);
  const envelope = JSON.parse(row.envelope_json);
  envelope.occurrence_id = `${envelope.occurrence_id}-tampered`;
  db.exec("DROP TRIGGER project_history_event_no_update");
  db.prepare(
    "UPDATE project_history_event SET envelope_json = ? WHERE generation_id = ? AND sort_ordinal = 0",
  ).run(JSON.stringify(envelope), GENERATION_ID);
  createProjectHistoryProjectionSchema(db);
  db.close();
  assert.throws(
    () => createService(tampered),
    (error) => error.code === "project_history_projection_or_artifact_invalid",
  );
});

windowsPathLockTest("artifact manifest rejects XLSX substitution and cannot launder readback parity", (t) => {
  const substituted = createFixture(t);
  writeFileSync(substituted.xlsxPath, makeXlsxContainer("substituted"));
  assert.throws(
    () => createService(substituted),
    (error) => error.code === "project_history_artifact_manifest_invalid",
  );

  const laundered = createFixture(t);
  const readback = JSON.parse(readFileSync(laundered.xlsxReadbackPath, "utf8"));
  readback.rows[0].lane = readback.rows[0].lane === "mail" ? "voice" : "mail";
  writeFileSync(laundered.xlsxReadbackPath, `${JSON.stringify(readback)}\n`, "utf8");
  const packet = structuredClone(laundered.artifactManifestPacket);
  const bytes = readFileSync(laundered.xlsxReadbackPath);
  packet.artifacts.xlsx_readback = {
    filename: "project_history.xlsx-readback.json",
    size: bytes.length,
    sha256: `sha256:${sha256(bytes)}`,
  };
  delete packet.artifact_manifest_digest;
  packet.artifact_manifest_digest = sha256Canonical(packet);
  writeFileSync(laundered.artifactManifestPath, `${canonicalJson(packet)}\n`, "utf8");
  assert.throws(
    () => createService(laundered, { artifactManifestDigest: packet.artifact_manifest_digest }),
    (error) => error.code === "project_history_artifact_manifest_invalid",
  );
});

windowsPathLockTest("tickets share sealed buffers and enforce aggregate active byte quota", (t) => {
  const fixture = createFixture(t);
  const service = createService(fixture, { maxActiveTicketBytes: fixture.csvBytes.length });
  try {
    const first = service.prepareDownload(PROJECT_ID, GENERATION_ID, "csv");
    assert.equal(service.diagnostics().active_ticket_bytes, fixture.csvBytes.length);
    assert.throws(
      () => service.prepareDownload(PROJECT_ID, GENERATION_ID, "csv"),
      (error) => error.code === "project_history_ticket_byte_capacity" && error.status === 503,
    );
    const firstDownload = service.consumeDownload(first.ticket);
    assert.equal(service.diagnostics().active_ticket_bytes, 0);
    const second = service.prepareDownload(PROJECT_ID, GENERATION_ID, "csv");
    const secondDownload = service.consumeDownload(second.ticket);
    assert.strictEqual(firstDownload.bytes.buffer, secondDownload.bytes.buffer);
    assert.deepEqual(firstDownload.bytes, fixture.csvBytes);
  } finally {
    service.close();
  }
});

windowsPathLockTest("bind and Host guards remain loopback-only", async (t) => {
  const fixture = createFixture(t);
  const service = createService(fixture);
  const server = createProjectHistoryMcpHttpServer({ service });
  assert.throws(() => assertProjectHistoryBindHost("0.0.0.0"), /project_history_loopback_bind_required/u);
  assert.throws(() => assertProjectHistoryBindHost("localhost"), /project_history_loopback_bind_required/u);
  assert.doesNotThrow(() => assertProjectHistoryBindHost("127.0.0.1"));
  assert.throws(() => server.listen(0, "0.0.0.0"), /project_history_loopback_bind_required/u);
  const port = await listen(server);
  try {
    const rejected = await rawRequest({ port, path: "/health", host: "history.example.test" });
    assert.equal(rejected.status, 421);
    assert.equal(rejected.headers["cache-control"], "no-store");
    assert.equal(rejected.headers["x-content-type-options"], "nosniff");
    const allowed = await rawRequest({ port, path: "/health", host: `localhost:${port}` });
    assert.equal(allowed.status, 200);
    const matchingOrigin = await rawRequest({
      port,
      path: "/health",
      headers: { Origin: `http://127.0.0.1:${port}` },
    });
    assert.equal(matchingOrigin.status, 200);
    const aliasOrigin = await rawRequest({
      port,
      path: "/health",
      headers: { Origin: `http://localhost:${port}` },
    });
    assert.equal(aliasOrigin.status, 403);
    const wrongPort = await rawRequest({ port, path: "/health", host: "127.0.0.1:9" });
    assert.equal(wrongPort.status, 421);
  } finally {
    await close(server);
    service.close();
  }
});

windowsPathLockTest("CLI stays feature-OFF without explicit pilot-copy and never accepts a token argument", (t) => {
  const fixture = createFixture(t);
  assert.throws(
    () => createProjectHistoryMcpService({
      bindingPath: fixture.bindingPath,
      bindingDigest: fixture.bindingDigest,
      artifactManifestPath: fixture.artifactManifestPath,
      artifactManifestDigest: fixture.artifactManifestDigest,
      bearerToken: TOKEN,
    }),
    (error) => error.code === "project_history_mcp_feature_off",
  );
  const serverPath = fileURLToPath(new URL("../project_history_server.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [
    serverPath,
    "--binding", fixture.bindingPath,
    "--binding-digest", fixture.bindingDigest,
    "--artifact-manifest", fixture.artifactManifestPath,
    "--artifact-manifest-digest", fixture.artifactManifestDigest,
  ], {
    cwd: path.dirname(serverPath),
    encoding: "utf8",
    env: { ...process.env, SOULFORGE_PROJECT_HISTORY_MCP_TOKEN: TOKEN },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /project_history_mcp_feature_off/u);
  assert.equal(`${result.stdout}${result.stderr}`.includes(TOKEN), false);

  const tokenArgument = spawnSync(process.execPath, [serverPath, "--token", TOKEN], {
    cwd: path.dirname(serverPath),
    encoding: "utf8",
  });
  assert.equal(tokenArgument.status, 1);
  assert.match(tokenArgument.stderr, /unknown_argument/u);
  assert.equal(`${tokenArgument.stdout}${tokenArgument.stderr}`.includes(TOKEN), false);
});
