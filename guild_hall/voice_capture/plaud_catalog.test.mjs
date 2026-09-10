import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectPlaudCatalog, parsePlaudFilesPage } from "./plaud_catalog.mjs";

const row = (n, date = "2026-09-10") => ({ id: n.toString(16).padStart(32, "0"), date });
function table(page, rows) {
  return `\nFiles on this page: ${rows.length}\n\n`
    + `  ${"ID".padEnd(34)}  ${"NAME".padEnd(36)}  ${"DATE".padEnd(12)}  DURATION\n`
    + `  ${"─".repeat(98)}\n`
    + rows.map((item) => `  ${item.id.padEnd(34)}  ${"synthetic fixture".padEnd(36)}  ${(item.date ?? "-").padEnd(12)}  1m00s\n`).join("")
    + `\nPage ${page}\n`;
}
function fixture(pages, overrides = {}) {
  const calls = [];
  return {
    calls,
    options: {
      command: "synthetic-plaud", clock: () => 1000, deadlineAtMs: 100000,
      commandTimeoutMs: 100, platform: "win32",
      commandRunner(command, args, options) {
        calls.push({ command, args, options });
        const page = Number(args[2]);
        return table(page, pages[page - 1] ?? []);
      },
      ...overrides,
    },
  };
}

test("407 metadata rows exceed recent cap; explicit empty plus three stable rechecks", async () => {
  const all = Array.from({ length: 407 }, (_, n) => row(n + 1));
  const pages = Array.from({ length: 5 }, (_, n) => all.slice(n * 100, (n + 1) * 100));
  const f = fixture(pages);
  const result = await collectPlaudCatalog(f.options);
  assert.deepEqual(result.rows, all);
  assert.equal(result.page_count, 6);
  assert.equal(result.complete, true);
  assert.equal(result.observed_at, "1970-01-01T00:00:01.000Z");
  assert.deepEqual(f.calls.map((call) => Number(call.args[2])), [1, 2, 3, 4, 5, 6, 1, 5, 6]);
  assert.ok(f.calls.every((call) => call.options.timeoutMs === 100 && call.args[0] === "files"));
  assert.ok(result.rows.every((item) => Object.keys(item).join(",") === "id,date"));
});

test("short intermediate pages continue; empty catalog must also be rechecked", async () => {
  const f = fixture([[row(1)], [row(2)]]);
  assert.equal((await collectPlaudCatalog(f.options)).rows.length, 2);
  assert.deepEqual(f.calls.map((call) => Number(call.args[2])), [1, 2, 3, 1, 2, 3]);
  const empty = fixture([]);
  assert.deepEqual((await collectPlaudCatalog(empty.options)).rows, []);
  assert.equal(empty.calls.length, 2);
});

test("pinned layout accepts ANSI and unavailable dates but rejects malformed rows and envelopes", () => {
  assert.deepEqual(parsePlaudFilesPage(`\u001b[1m${table(1, [row(1, null)])}\u001b[0m`, { page: 1 }), [row(1, null)]);
  const valid = table(1, [row(1)]);
  for (const raw of ["", valid.replace("page: 1", "page: 2"), valid.replace("Page 1", "Page 2"),
    valid.replace("DURATION", "UNKNOWN"), valid.replace("2026-09-10", "2026-02-30"),
    valid.replace("1m00s", "unparsed"), valid.replace("00000000000000000000000000000001", "broken"),
    valid + "unexpected payload\n", table(1, [row(1, "unknown")])]) {
    assert.throws(() => parsePlaudFilesPage(raw, { page: 1 }), { code: /^plaud_catalog_malformed_/u });
  }
  assert.throws(() => parsePlaudFilesPage(table(1, Array.from({ length: 11 }, (_, n) => row(n + 1))), { page: 1, pageSize: 10 }),
    { code: "plaud_catalog_malformed_page" });
});

test("repeated pages and duplicate IDs fail closed rather than deduplicating", async () => {
  for (const pages of [[[row(1), row(1)]], [[row(1)], [row(1)]], [[row(1), row(2)], [row(2), row(3)]]]) {
    await assert.rejects(collectPlaudCatalog(fixture(pages).options), { code: "plaud_catalog_duplicate_id" });
  }
});

test("page budget includes explicit empty and never claims partial completeness", async () => {
  const f = fixture([[row(1)], [row(2)]], { maxPages: 2 });
  await assert.rejects(collectPlaudCatalog(f.options), { code: "plaud_catalog_page_limit" });
  assert.equal(f.calls.length, 2);
});

test("moving head, tail, and terminal cause one bounded full restart", async () => {
  for (const driftPage of [1, 3, 4]) {
    const initial = [[row(1)], [row(2)], [row(3)], []];
    const changed = [[row(4)], [row(2)], [row(5)], [row(6)], []];
    let switched = false;
    let calls = 0;
    const f = fixture([], {
      commandRunner(_command, args) {
        const page = Number(args[2]);
        calls += 1;
        if (calls > 4 && page === driftPage) switched = true;
        return table(page, (switched ? changed : initial)[page - 1] ?? []);
      },
    });
    const result = await collectPlaudCatalog(f.options);
    assert.deepEqual(result.rows, changed.flat());
    assert.ok(calls <= 15);
  }
});

test("continued movement stops after second attempt with fixed error and bounded calls", async () => {
  let calls = 0;
  const f = fixture([], {
    commandRunner(_command, args) {
      calls += 1;
      const page = Number(args[2]);
      return table(page, page === 1 ? [row(calls)] : []);
    },
  });
  await assert.rejects(collectPlaudCatalog(f.options), { code: "plaud_catalog_unstable" });
  assert.equal(calls, 6);
});

test("deadline admission reserves two full Windows timeouts without lowering configured timeout", async () => {
  const f = fixture([], { deadlineAtMs: 1199 });
  await assert.rejects(collectPlaudCatalog(f.options), { code: "plaud_catalog_deadline_exceeded" });
  assert.equal(f.calls.length, 0);
  const permitted = fixture([], { deadlineAtMs: 1200 });
  await collectPlaudCatalog(permitted.options);
  assert.equal(permitted.calls.length, 2);
  assert.ok(permitted.calls.every((call) => call.options.timeoutMs === 100));
});

test("deadline rejection leaves the synthetic worksite unchanged", async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "plaud-catalog-test-"));
  t.after(async () => {
    await fs.unlink(path.join(cwd, "sentinel.txt"));
    await fs.rmdir(cwd);
  });
  await fs.writeFile(path.join(cwd, "sentinel.txt"), "synthetic fixture\n");
  const f = fixture([], { cwd, deadlineAtMs: 1199 });
  await assert.rejects(collectPlaudCatalog(f.options), { code: "plaud_catalog_deadline_exceeded" });
  assert.deepEqual(await fs.readdir(cwd), ["sentinel.txt"]);
  assert.equal(await fs.readFile(path.join(cwd, "sentinel.txt"), "utf8"), "synthetic fixture\n");
  assert.equal(f.calls.length, 0);
});

test("deadline expiration after command or before recheck fails without a result", async () => {
  let time = 1000;
  let calls = 0;
  const f = fixture([], {
    clock: () => time, deadlineAtMs: 1400,
    commandRunner(_command, args) {
      calls += 1;
      time = 1400;
      return table(Number(args[2]), []);
    },
  });
  await assert.rejects(collectPlaudCatalog(f.options), { code: "plaud_catalog_deadline_exceeded" });
  assert.equal(calls, 1);
  time = 1000;
  const beforeRecheck = fixture([], {
    clock: () => time, deadlineAtMs: 1400,
    commandRunner(_command, args) { time = 1250; return table(Number(args[2]), []); },
  });
  await assert.rejects(collectPlaudCatalog(beforeRecheck.options), { code: "plaud_catalog_deadline_exceeded" });
});

test("command failures discard provider payload and expose only fixed code", async () => {
  const f = fixture([], { commandRunner() { throw Object.assign(new Error("synthetic sensitive payload"), { stderr: "synthetic detail" }); } });
  await assert.rejects(collectPlaudCatalog(f.options), (error) => {
    assert.equal(error.message, "plaud_catalog_command_failed");
    assert.deepEqual(Object.keys(error), ["code"]);
    return true;
  });
});

test("command error allowlist preserves fixed classification without raw error fields", async () => {
  for (const code of ["plaud_deadline_exceeded", "plaud_command_timeout", "plaud_rate_limited",
    "plaud_authentication_failed", "plaud_network_failed", "unknown_provider_code"]) {
    const f = fixture([], {
      commandRunner() {
        throw Object.assign(new Error("synthetic sensitive payload"), { code, stderr: "synthetic detail" });
      },
    });
    await assert.rejects(collectPlaudCatalog(f.options), (error) => {
      const expected = code === "unknown_provider_code" ? "plaud_catalog_command_failed" : code;
      assert.equal(error.code, expected);
      assert.equal(error.message, expected);
      assert.deepEqual(Object.keys(error), ["code"]);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test("hard maximum admits no more than 38 calls even with one complete restart", async () => {
  let calls = 0;
  const f = fixture([], {
    commandRunner(_command, args) {
      calls += 1;
      const page = Number(args[2]);
      if (calls === 19) return table(page, [row(100)]);
      return table(page, page === 16 ? [] : [row(page)]);
    },
  });
  assert.equal((await collectPlaudCatalog(f.options)).rows.length, 15);
  assert.equal(calls, 38);
  await assert.rejects(collectPlaudCatalog({ ...f.options, maxPages: 17 }), { code: "plaud_catalog_invalid_options" });
});
