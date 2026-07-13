import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, request } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createProxyHandler,
  parseProxyOptions,
  proxyRequestHeaders,
  proxyResponseHeaders,
  secureSetCookie,
} from "../ops/dev-erp-lan-https-proxy.mjs";

const PROTECTED_RUNTIME_PORT = 4300;

async function reservePort() {
  while (true) {
    const port = await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const selected = server.address().port;
        server.close((error) => error ? reject(error) : resolve(selected));
      });
    });
    if (port !== PROTECTED_RUNTIME_PORT) return port;
  }
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function call(port, { method = "GET", path: requestPath = "/", headers = {}, body = "" } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method, path: requestPath, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

test("proxy options fail closed without disclosing TLS paths", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dev-erp-lan-proxy-"));
  const cert = path.join(root, "cert", "server.crt");
  const key = path.join(root, "key", "server.key");
  const ca = path.join(root, "cert", "ca.crt");
  try {
    await mkdir(path.dirname(cert), { recursive: true });
    await mkdir(path.dirname(key), { recursive: true });
    await writeFile(cert, "synthetic-cert");
    await writeFile(key, "synthetic-key");
    await writeFile(ca, "synthetic-ca");
    const valid = parseProxyOptions([
      "--listen-host", "192.0.2.10",
      "--port", "4300",
      "--upstream-host", "127.0.0.1",
      "--upstream-port", "4300",
      "--tls-cert", cert,
      "--tls-key", key,
      "--tls-ca", ca,
    ]);
    assert.equal(valid.listenHost, "192.0.2.10");
    assert.equal(valid.upstreamHost, "127.0.0.1");

    for (const args of [
      ["--listen-host", "0.0.0.0", "--tls-cert", cert, "--tls-key", key],
      ["--listen-host", "127.0.0.1", "--tls-cert", cert, "--tls-key", key],
      ["--listen-host", "192.0.2.10", "--upstream-host", "192.0.2.11", "--tls-cert", cert, "--tls-key", key],
      ["--listen-host", "192.0.2.10", "--tls-cert", cert],
      ["--listen-host", "192.0.2.10", "--tls-cert", `${cert}.missing`, "--tls-key", key],
    ]) {
      let message = "";
      assert.throws(() => parseProxyOptions(args), (error) => {
        message = error.message;
        return true;
      });
      assert.equal(message.includes(cert), false);
      assert.equal(message.includes(key), false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("proxy overwrites forwarding headers, strips hop-by-hop headers, and secures cookies", async () => {
  const upstreamPort = await reservePort();
  const proxyPort = await reservePort();
  let observed;
  const upstream = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      observed = { headers: req.headers, body: Buffer.concat(chunks).toString("utf8") };
      res.writeHead(201, {
        "set-cookie": ["alpha=1; HttpOnly", "beta=2; Secure; SameSite=Lax"],
        connection: "keep-alive, x-upstream-hop",
        "x-upstream-hop": "remove-me",
        "x-kept": "yes",
      });
      res.end("forwarded");
    });
  });
  const proxy = createServer(createProxyHandler({
    upstreamPort,
    listenHost: "192.0.2.10",
    listenPort: 4300,
    timeoutMs: 2_000,
  }));
  try {
    await listen(upstream, upstreamPort);
    await listen(proxy, proxyPort);
    const response = await call(proxyPort, {
      method: "POST",
      path: "/api/example",
      headers: {
        "content-type": "text/plain",
        connection: "keep-alive, x-client-hop",
        "x-client-hop": "remove-me",
        forwarded: "for=spoofed",
        "x-forwarded-for": "spoofed",
        "x-forwarded-proto": "http",
        "x-real-ip": "spoofed",
      },
      body: "payload",
    });
    assert.equal(response.status, 201);
    assert.equal(response.body, "forwarded");
    assert.equal(response.headers["x-kept"], "yes");
    assert.equal(response.headers["x-upstream-hop"], undefined);
    assert.deepEqual(response.headers["set-cookie"], [
      "alpha=1; HttpOnly; Secure",
      "beta=2; Secure; SameSite=Lax",
    ]);
    assert.equal(observed.body, "payload");
    assert.equal(observed.headers["x-client-hop"], undefined);
    assert.equal(observed.headers.forwarded, undefined);
    assert.equal(observed.headers["x-real-ip"], undefined);
    assert.equal(observed.headers["x-forwarded-proto"], "https");
    assert.equal(observed.headers["x-forwarded-host"], "192.0.2.10:4300");
    assert.equal(observed.headers["x-forwarded-for"], "127.0.0.1");
  } finally {
    await Promise.allSettled([close(proxy), close(upstream)]);
  }
});

test("proxy serves the public CA and sanitizes upstream failures and timeouts", async () => {
  const unavailablePort = await reservePort();
  const proxyPort = await reservePort();
  const caCertificate = Buffer.from("synthetic-public-ca");
  const proxy = createServer(createProxyHandler({
    upstreamPort: unavailablePort,
    listenHost: "192.0.2.10",
    listenPort: 4300,
    timeoutMs: 200,
    caCertificate,
  }));
  await listen(proxy, proxyPort);
  try {
    const ca = await call(proxyPort, { path: "/dev-erp-ca.crt" });
    assert.equal(ca.status, 200);
    assert.equal(ca.body, "synthetic-public-ca");
    const unavailable = await call(proxyPort, { path: "/api/health" });
    assert.equal(unavailable.status, 502);
    assert.deepEqual(JSON.parse(unavailable.body), { error: "upstream_unavailable" });
    assert.equal(unavailable.body.includes(String(unavailablePort)), false);
    const absoluteTarget = await call(proxyPort, { path: "http://spoofed.invalid/api/health" });
    assert.equal(absoluteTarget.status, 400);
    assert.deepEqual(JSON.parse(absoluteTarget.body), { error: "invalid_request_target" });
  } finally {
    await close(proxy);
  }

  const hangingPort = await reservePort();
  const timeoutProxyPort = await reservePort();
  const hanging = createServer(() => {});
  const timeoutProxy = createServer(createProxyHandler({
    upstreamPort: hangingPort,
    listenHost: "192.0.2.10",
    listenPort: 4300,
    timeoutMs: 100,
  }));
  try {
    await listen(hanging, hangingPort);
    await listen(timeoutProxy, timeoutProxyPort);
    const timeout = await call(timeoutProxyPort, { path: "/api/health" });
    assert.equal(timeout.status, 504);
    assert.deepEqual(JSON.parse(timeout.body), { error: "upstream_timeout" });
    assert.equal(timeout.body.includes(String(hangingPort)), false);
  } finally {
    await Promise.allSettled([close(timeoutProxy), close(hanging)]);
  }
});

test("header helpers preserve one Secure attribute and remove connection-nominated fields", () => {
  assert.equal(secureSetCookie("sid=1; HttpOnly"), "sid=1; HttpOnly; Secure");
  assert.equal(secureSetCookie("sid=1; Secure; HttpOnly"), "sid=1; Secure; HttpOnly");
  const requestHeaders = proxyRequestHeaders({ connection: "x-drop", "x-drop": "bad", "x-keep": "ok" }, {
    upstreamHost: "127.0.0.1",
    upstreamPort: 4300,
    listenHost: "192.0.2.10",
    listenPort: 4300,
    remoteAddress: "192.0.2.12",
  });
  assert.equal(requestHeaders["x-drop"], undefined);
  assert.equal(requestHeaders["x-keep"], "ok");
  const responseHeaders = proxyResponseHeaders({ connection: "x-drop", "x-drop": "bad", "x-keep": "ok" });
  assert.equal(responseHeaders["x-drop"], undefined);
  assert.equal(responseHeaders["x-keep"], "ok");
});
