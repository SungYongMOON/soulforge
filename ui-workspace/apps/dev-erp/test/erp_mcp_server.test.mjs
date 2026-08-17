import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer as createNetServer } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";

import { openStore } from "../src/store.mjs";

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url, child, stderr) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`server_exited:${child.exitCode}:${stderr()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server_not_ready:${stderr()}`);
}

function hasFile(root) {
  if (!existsSync(root)) return false;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile()) return true;
    if (entry.isDirectory() && hasFile(join(root, entry.name))) return true;
  }
  return false;
}

function slowJsonPost(url, { headers = {}, body, duringBody }) {
  const payload = Buffer.from(JSON.stringify(body));
  const split = Math.max(1, Math.floor(payload.length / 2));
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Content-Length": String(payload.length),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.once("error", reject);
    req.write(payload.subarray(0, split), () => {
      setTimeout(() => {
        Promise.resolve(duringBody())
          .then(() => req.end(payload.subarray(split)))
          .catch((error) => {
            req.destroy();
            reject(error);
          });
      }, 150);
    });
  });
}

test("ERP MCP remains feature-OFF without an explicit runtime flag", async () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-mcp-off-"));
  const dbPath = join(root, "erp.db");
  const artifactRoot = join(root, "artifact-inbox");
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const childEnv = { ...process.env };
  delete childEnv.DEV_ERP_MCP_ENABLED;
  const child = spawn(process.execPath, ["server.mjs", "--port", String(port), "--db", dbPath], {
    cwd: APP_DIR,
    env: {
      ...childEnv,
      DEV_ERP_NO_TLS: "1",
      DEV_ERP_AUTOSYNC: "0",
      DEV_ERP_NO_FIXTURE: "1",
      DEV_ERP_MCP_ARTIFACT_ROOT: artifactRoot,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderrText = "";
  child.stderr.on("data", (chunk) => { stderrText += chunk.toString(); });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
  };
  try {
    await waitForHttp(`${base}/api/health`, child, () => stderrText);
    const response = await fetch(`${base}/api/mcp/whoami`);
    assert.equal(response.status, 404);
    await stop();

    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const tables = db.prepare(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'erp_mcp_%' ORDER BY name",
      ).all();
      assert.deepEqual(tables, []);
    } finally {
      db.close();
    }
    assert.equal(hasFile(artifactRoot), false);
  } finally {
    await stop();
    rmSync(root, { recursive: true, force: true });
  }
});

test("ERP MCP HTTP pilot stores a completed file and completion hook consumes the structured session", async () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-mcp-http-"));
  const dbPath = join(root, "erp.db");
  const artifactRoot = join(root, "artifact-inbox");
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const pilotEnv = { ...process.env };
  delete pilotEnv.DEV_ERP_MCP_AUDIT_TOKEN_REF;
  const child = spawn(process.execPath, ["server.mjs", "--port", String(port), "--db", dbPath], {
    cwd: APP_DIR,
    env: {
      ...pilotEnv,
      DEV_ERP_NO_TLS: "1",
      DEV_ERP_AUTOSYNC: "0",
      DEV_ERP_NO_FIXTURE: "1",
      DEV_ERP_MCP_ENABLED: "1",
      DEV_ERP_MCP_ARTIFACT_ROOT: artifactRoot,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderrText = "";
  child.stderr.on("data", (chunk) => { stderrText += chunk.toString(); });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
  };
  try {
    await waitForHttp(`${base}/api/health`, child, () => stderrText);
    const bootstrap = await fetch(`${base}/api/auth/bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "owner", password: "ownerpass123" }),
    });
    assert.equal(bootstrap.status, 200);
    const cookie = bootstrap.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);

    const project = await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "P26-MCP", title: "MCP integration" }),
    });
    assert.equal(project.status, 200);
    const itemResponse = await fetch(`${base}/api/items`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: "P26-MCP",
        title: "Create final report",
        work_type: "author",
        completion_criteria: "Final PDF is attached",
      }),
    });
    assert.equal(itemResponse.status, 200);
    const item = (await itemResponse.json()).item;

    const issueMcpToken = async (label) => {
      const response = await fetch(`${base}/api/integrations/mcp/tokens`, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ label, expires_in_days: 30 }),
      });
      assert.equal(response.status, 201);
      return response.json();
    };

    const issued = await issueMcpToken("Owner Codex");
    assert.match(issued.token, /^sfmcp_v1_/);
    const auth = { Authorization: `Bearer ${issued.token}` };

    assert.equal((await fetch(`${base}/api/mcp/whoami`)).status, 401);
    const who = await fetch(`${base}/api/mcp/whoami`, { headers: auth });
    assert.equal(who.status, 200);
    assert.equal((await who.json()).username, "owner");

    const revokedDuringBody = await issueMcpToken("Revoked during body");
    const revokedRace = await slowJsonPost(`${base}/api/mcp/work-sessions`, {
      headers: { Authorization: `Bearer ${revokedDuringBody.token}` },
      body: {
        item_id: item.id,
        idempotency_key: "integration-race-revoke-0001",
        summary: "must not persist after revoke",
        outputs: [],
        next_actions: [],
        stop_conditions: [],
        artifact_ids: [],
      },
      duringBody: async () => {
        const response = await fetch(`${base}/api/integrations/mcp/tokens/revoke`, {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify({ token_id: revokedDuringBody.token_id }),
        });
        assert.equal(response.status, 200);
      },
    });
    assert.equal(revokedRace.status, 401, revokedRace.body);

    const disabledRaceBytes = Buffer.from("must not create disabled upload ticket");
    const disabledRace = await slowJsonPost(`${base}/api/mcp/uploads/prepare`, {
      headers: auth,
      body: {
        item_id: item.id,
        filename: "disabled-race.pdf",
        size: disabledRaceBytes.length,
        sha256: createHash("sha256").update(disabledRaceBytes).digest("hex"),
      },
      duringBody: () => {
        const mutator = openStore(dbPath);
        try {
          const owner = mutator.db.prepare("SELECT id FROM core_account WHERE username='owner'").get();
          mutator.db.prepare("UPDATE core_account SET status='disabled' WHERE id=?").run(owner.id);
        } finally {
          mutator.db.close();
        }
      },
    });
    assert.equal(disabledRace.status, 401, disabledRace.body);
    {
      const mutator = openStore(dbPath);
      try {
        const owner = mutator.db.prepare("SELECT id FROM core_account WHERE username='owner'").get();
        mutator.db.prepare("UPDATE core_account SET status='active' WHERE id=?").run(owner.id);
      } finally {
        mutator.db.close();
      }
    }

    const expiredDuringBody = await issueMcpToken("Expired during body");
    const expiredRace = await slowJsonPost(`${base}/api/mcp/work-sessions`, {
      headers: { Authorization: `Bearer ${expiredDuringBody.token}` },
      body: {
        item_id: item.id,
        idempotency_key: "integration-race-expiry-0001",
        summary: "must not persist after expiry",
        outputs: [],
        next_actions: [],
        stop_conditions: [],
        artifact_ids: [],
      },
      duringBody: () => {
        const mutator = openStore(dbPath);
        try {
          mutator.db.prepare("UPDATE erp_mcp_access_token SET expires_at=? WHERE id=?")
            .run("2000-01-01T00:00:00.000Z", expiredDuringBody.token_id);
        } finally {
          mutator.db.close();
        }
      },
    });
    assert.equal(expiredRace.status, 401, expiredRace.body);

    const bytes = Buffer.from("final pdf bytes", "utf8");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const preparedResponse = await fetch(`${base}/api/mcp/uploads/prepare`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: item.id, filename: "final.pdf", size: bytes.length, sha256: digest, kind: "report" }),
    });
    assert.equal(preparedResponse.status, 201);
    const prepared = await preparedResponse.json();
    assert.match(prepared.upload_path, /^\/api\/mcp\/uploads\/sfup_v1_/);
    assert.equal(JSON.stringify(prepared).includes(artifactRoot), false);

    writeFileSync(artifactRoot, "synthetic storage fault");
    const failedUpload = await fetch(`${base}${prepared.upload_path}`, { method: "PUT", body: bytes });
    assert.equal(failedUpload.status, 500);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(stderrText.includes(prepared.upload_path), false);
    assert.equal(stderrText.includes(prepared.upload_path.split("/").pop()), false);
    unlinkSync(artifactRoot);

    const uploadedResponse = await fetch(`${base}${prepared.upload_path}`, { method: "PUT", body: bytes });
    assert.equal(uploadedResponse.status, 201);
    const uploaded = await uploadedResponse.json();
    assert.equal(uploaded.artifact.sha256, digest);

    const sessionResponse = await fetch(`${base}/api/mcp/work-sessions`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        item_id: item.id,
        idempotency_key: "integration-session-0001",
        client_session_ref: "codex-task-integration",
        summary: "Final report completed and uploaded.",
        knowledge: "Use the approved cover template.",
        outputs: ["final.pdf"],
        verification: "SHA-256 and file open check passed.",
        next_actions: ["Owner review"],
        stop_conditions: ["Stop if requirements change"],
        request_kind: "document_authoring",
        artifact_ids: [uploaded.artifact.artifact_id],
      }),
    });
    assert.equal(sessionResponse.status, 201);

    const completeResponse = await fetch(`${base}/api/items/status`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, status: "done" }),
    });
    assert.equal(completeResponse.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await stop();

    const verify = openStore(dbPath);
    try {
      const tokenRow = verify.db.prepare("SELECT token_hash FROM erp_mcp_access_token WHERE id=?").get(issued.token_id);
      assert.notEqual(tokenRow.token_hash, issued.token);
      const completion = verify.db.prepare(
        "SELECT summary,knowledge,verification,needs_backfill FROM completion_log WHERE item_id=? ORDER BY id DESC LIMIT 1",
      ).get(item.id);
      assert.equal(completion.summary, "Final report completed and uploaded.");
      assert.equal(completion.verification, "SHA-256 and file open check passed.");
      assert.equal(completion.needs_backfill, 0);
      assert.equal(JSON.parse(completion.knowledge).artifact_ids[0], uploaded.artifact.artifact_id);
      const proposal = verify.db.prepare(
        "SELECT source,status FROM ai_proposal WHERE target_ref=? ORDER BY at DESC LIMIT 1",
      ).get(item.id);
      assert.equal(proposal.source, "erp_mcp_work_session");
      assert.equal(proposal.status, "pending");
      assert.equal(verify.itemById(item.id).status, "done");
      assert.equal(verify.db.prepare(
        "SELECT COUNT(*) AS n FROM erp_mcp_work_session WHERE idempotency_key LIKE 'integration-race-%'",
      ).get().n, 0);
      assert.equal(verify.db.prepare(
        "SELECT COUNT(*) AS n FROM erp_mcp_upload_ticket WHERE filename='disabled-race.pdf'",
      ).get().n, 0);
      // 감사 provenance flag 가 OFF 인 기본 파일럿에서는 mcp_tool_call event 내용이 그대로다.
      const audits = verify.db.prepare(
        "SELECT note,used_refs,actor_kind FROM event_log WHERE kind='mcp_tool_call' ORDER BY id",
      ).all();
      assert.ok(audits.length > 0);
      assert.deepEqual([...new Set(audits.map((row) => row.used_refs))], ['["erp_mcp"]']);
      assert.equal(audits.some((row) => row.note.includes("token=")), false);
      assert.deepEqual(
        audits.filter((row) => row.note === "tool=whoami").map((row) => row.actor_kind),
        ["human"],
      );
    } finally {
      verify.db.close();
    }
    assert.equal(hasFile(artifactRoot), true);
  } finally {
    await stop();
    rmSync(root, { recursive: true, force: true });
  }
});

test("ERP MCP reviewer read routes stay read-only and audited when enabled", async () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-mcp-review-"));
  const dbPath = join(root, "erp.db");
  const artifactRoot = join(root, "artifact-inbox");
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.mjs", "--port", String(port), "--db", dbPath], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      DEV_ERP_NO_TLS: "1",
      DEV_ERP_AUTOSYNC: "0",
      DEV_ERP_NO_FIXTURE: "1",
      DEV_ERP_MCP_ENABLED: "1",
      DEV_ERP_MCP_REVIEW_READ: "1",
      DEV_ERP_MCP_ARTIFACT_ROOT: artifactRoot,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderrText = "";
  child.stderr.on("data", (chunk) => { stderrText += chunk.toString(); });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
  };
  try {
    await waitForHttp(`${base}/api/health`, child, () => stderrText);
    const bootstrap = await fetch(`${base}/api/auth/bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "owner", password: "ownerpass123" }),
    });
    assert.equal(bootstrap.status, 200);
    const cookie = bootstrap.headers.get("set-cookie")?.split(";")[0];
    assert.equal((await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "P26-MCP", title: "MCP review" }),
    })).status, 200);
    const itemResponse = await fetch(`${base}/api/items`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: "P26-MCP", title: "Reviewer visibility task" }),
    });
    assert.equal(itemResponse.status, 200);
    const item = (await itemResponse.json()).item;

    const tokenResponse = await fetch(`${base}/api/integrations/mcp/tokens`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Review Codex", expires_in_days: 30 }),
    });
    assert.equal(tokenResponse.status, 201);
    const auth = { Authorization: `Bearer ${(await tokenResponse.json()).token}` };
    assert.equal((await fetch(`${base}/api/mcp/work-sessions`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        item_id: item.id,
        idempotency_key: "review-route-session-0001",
        summary: "Reviewer visible structured result.",
        outputs: [],
        next_actions: [],
        stop_conditions: [],
        artifact_ids: [],
      }),
    })).status, 201);

    assert.equal((await fetch(`${base}/api/mcp/reviews/pending`)).status, 401);
    const pendingResponse = await fetch(`${base}/api/mcp/reviews/pending?days=7&limit=5`, { headers: auth });
    assert.equal(pendingResponse.status, 200);
    const pending = await pendingResponse.json();
    assert.equal(pending.days, 7);
    assert.equal(pending.limit, 5);
    assert.equal(pending.work_sessions[0].item_id, item.id);
    assert.equal(pending.work_sessions[0].username, "owner");
    const pendingText = JSON.stringify(pending);
    assert.equal(pendingText.includes("payload_json"), false);
    assert.equal(pendingText.includes(artifactRoot), false);

    const sessionsResponse = await fetch(`${base}/api/items/work-sessions?item_id=${item.id}`, {
      headers: { Cookie: cookie },
    });
    assert.equal(sessionsResponse.status, 200);
    const sessions = await sessionsResponse.json();
    assert.deepEqual(sessions.work_sessions.map((row) => row.summary), ["Reviewer visible structured result."]);
    assert.equal((await fetch(`${base}/api/items/work-sessions?item_id=${item.id}`)).status, 401);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await stop();

    const verify = openStore(dbPath);
    try {
      assert.equal(verify.db.prepare(
        "SELECT COUNT(*) AS n FROM event_log WHERE kind='mcp_tool_call' AND note='tool=reviews_pending'",
      ).get().n, 1);
      // read-only: 검토 조회는 제안·업무·작업 세션 row 를 만들거나 바꾸지 않는다.
      assert.equal(verify.db.prepare("SELECT COUNT(*) AS n FROM erp_mcp_work_session").get().n, 1);
      assert.equal(verify.db.prepare("SELECT status FROM ai_proposal WHERE target_ref=?").get(item.id)?.status, undefined);
      assert.equal(verify.itemById(item.id).status, "open");
    } finally {
      verify.db.close();
    }
  } finally {
    await stop();
    rmSync(root, { recursive: true, force: true });
  }
});

test("ERP MCP audit records an opaque credential id and reviewer reads stay flag-gated", async () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-mcp-audit-"));
  const dbPath = join(root, "erp.db");
  const artifactRoot = join(root, "artifact-inbox");
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const childEnv = { ...process.env };
  delete childEnv.DEV_ERP_MCP_REVIEW_READ;
  const child = spawn(process.execPath, ["server.mjs", "--port", String(port), "--db", dbPath], {
    cwd: APP_DIR,
    env: {
      ...childEnv,
      DEV_ERP_NO_TLS: "1",
      DEV_ERP_AUTOSYNC: "0",
      DEV_ERP_NO_FIXTURE: "1",
      DEV_ERP_MCP_ENABLED: "1",
      DEV_ERP_MCP_AUDIT_TOKEN_REF: "1",
      DEV_ERP_MCP_ARTIFACT_ROOT: artifactRoot,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderrText = "";
  child.stderr.on("data", (chunk) => { stderrText += chunk.toString(); });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
  };
  try {
    await waitForHttp(`${base}/api/health`, child, () => stderrText);
    const bootstrap = await fetch(`${base}/api/auth/bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "owner", password: "ownerpass123" }),
    });
    assert.equal(bootstrap.status, 200);
    const cookie = bootstrap.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);
    assert.equal((await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "P26-MCP", title: "MCP audit" }),
    })).status, 200);
    const itemResponse = await fetch(`${base}/api/items`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: "P26-MCP", title: "Audit provenance task" }),
    });
    assert.equal(itemResponse.status, 200);
    const item = (await itemResponse.json()).item;

    const tokenResponse = await fetch(`${base}/api/integrations/mcp/tokens`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Audit Codex", expires_in_days: 30 }),
    });
    assert.equal(tokenResponse.status, 201);
    const issued = await tokenResponse.json();
    const auth = { Authorization: `Bearer ${issued.token}` };
    assert.equal((await fetch(`${base}/api/mcp/whoami`, { headers: auth })).status, 200);

    // 검토자 조회 flag 는 별도이며 미설정이면 두 라우트 모두 열리지 않는다.
    assert.equal((await fetch(`${base}/api/mcp/reviews/pending`, { headers: auth })).status, 404);
    assert.equal((await fetch(`${base}/api/items/work-sessions?item_id=${item.id}`, {
      headers: { Cookie: cookie },
    })).status, 404);

    const bytes = Buffer.from("audit provenance bytes", "utf8");
    const preparedResponse = await fetch(`${base}/api/mcp/uploads/prepare`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        item_id: item.id,
        filename: "audit.pdf",
        size: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      }),
    });
    assert.equal(preparedResponse.status, 201);
    const prepared = await preparedResponse.json();
    assert.equal((await fetch(`${base}${prepared.upload_path}`, { method: "PUT", body: bytes })).status, 201);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await stop();

    const verify = openStore(dbPath);
    try {
      const audits = verify.db.prepare(
        "SELECT note,used_refs,actor_kind FROM event_log WHERE kind='mcp_tool_call' ORDER BY id",
      ).all();
      const whoami = audits.find((row) => row.note.startsWith("tool=whoami"));
      assert.equal(whoami.note, `tool=whoami;token=${issued.token_id}`);
      assert.deepEqual(JSON.parse(whoami.used_refs), ["erp_mcp", `erp_mcp_access_token:${issued.token_id}`]);
      assert.equal(whoami.actor_kind, "human");
      const upload = audits.find((row) => row.note.startsWith("tool=artifact_upload;"));
      assert.equal(upload.note, "tool=artifact_upload;token=ticket");
      assert.deepEqual(JSON.parse(upload.used_refs), ["erp_mcp"]);
      const tokenHash = verify.db.prepare(
        "SELECT token_hash FROM erp_mcp_access_token WHERE id=?",
      ).get(issued.token_id).token_hash;
      const serialized = JSON.stringify(audits);
      assert.equal(serialized.includes("sfmcp_v1_"), false);
      assert.equal(serialized.includes(tokenHash), false);
    } finally {
      verify.db.close();
    }
  } finally {
    await stop();
    rmSync(root, { recursive: true, force: true });
  }
});
