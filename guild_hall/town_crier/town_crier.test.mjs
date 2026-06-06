import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { emitNotification, processTownCrierOnce } from "./runtime.mjs";

const cliPath = fileURLToPath(new URL("./cli.mjs", import.meta.url));
const execFile = promisify(execFileCallback);

test("status CLI reads only the explicit local root", async () => {
  const repoRoot = await makeTempRoot("status");

  try {
    await writeJson(path.join(repoRoot, "guild_hall", "state", "town_crier", "queue", "pending", "one.json"), {
      request_id: "one",
    });
    await writeJson(path.join(repoRoot, "guild_hall", "state", "town_crier", "queue", "pending", "two.json"), {
      request_id: "two",
    });
    await writeJson(
      path.join(repoRoot, "guild_hall", "state", "town_crier", "queue", "processing", "three.json"),
      { request_id: "three" },
    );

    const { stdout } = await execFile(process.execPath, [cliPath, "status", "--local-root", repoRoot]);
    const status = JSON.parse(stdout);

    assert.equal(status.state_root, "guild_hall/state/town_crier");
    assert.equal(status.env_file, "guild_hall/state/town_crier/telegram_notify.env");
    assert.equal(status.env_exists, false);
    assert.equal(status.pending_count, 2);
    assert.equal(status.processing_count, 1);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("status CLI rejects a local root flag without a value", async () => {
  await assert.rejects(
    execFile(process.execPath, [cliPath, "status", "--local-root"]),
    (error) => {
      assert.match(error.stderr, /missing required flag: --local-root/);
      return true;
    },
  );
});

test("status CLI rejects filesystem root as an explicit local root", async () => {
  await assert.rejects(
    execFile(process.execPath, [cliPath, "status", "--local-root", path.parse(process.cwd()).root]),
    (error) => {
      assert.match(error.stderr, /--local-root must not be the filesystem root/);
      return true;
    },
  );
});

test("disabled gateway notification is a no-op and does not create pending queue", async () => {
  const repoRoot = await makeTempRoot("disabled");

  try {
    await writeText(
      path.join(repoRoot, "guild_hall", "state", "gateway", "bindings", "notify_policy.yaml"),
      [
        "kind: gateway_notify_policy",
        "scope: gateway",
        "channels:",
        "  telegram:",
        "    enabled: false",
        "    env_file: guild_hall/state/town_crier/telegram_notify.env",
        "events:",
        "  monster_created:",
        "    telegram: true",
        "  mail_received:",
        "    telegram: false",
        "updated_at: '2026-06-05T00:00:00.000Z'",
        "",
      ].join("\n"),
    );

    const result = await emitNotification(repoRoot, {
      scope: "gateway",
      event: "monster_created",
      text: "Synthetic disabled gateway notification",
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "disabled");
    assert.equal(result.scope, "gateway");
    assert.equal(result.event, "monster_created");
    assert.equal(
      await pathExists(path.join(repoRoot, "guild_hall", "state", "town_crier", "queue", "pending")),
      false,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("invalid pending request rolls back without executing telegram sender", async () => {
  const repoRoot = await makeTempRoot("invalid");
  const markerFile = path.join(repoRoot, "telegram-marker.txt");
  const pendingFile = path.join(
    repoRoot,
    "guild_hall",
    "state",
    "town_crier",
    "queue",
    "pending",
    "invalid-one.json",
  );
  const processingFile = path.join(
    repoRoot,
    "guild_hall",
    "state",
    "town_crier",
    "queue",
    "processing",
    "invalid-one.json",
  );
  const rawText = "Synthetic raw text must not be logged";
  const rawSourceRef = "synthetic-source-ref-must-not-be-logged";

  try {
    await writeText(
      path.join(repoRoot, "guild_hall", "town_crier", "telegram_send.py"),
      [
        "from pathlib import Path",
        `Path(${JSON.stringify(markerFile)}).write_text("executed\\n", encoding="utf-8")`,
        "print('{\"ok\": true}')",
        "",
      ].join("\n"),
    );
    await writeJson(pendingFile, {
      request_id: "invalid-one",
      owner_scope: "gateway",
      channel: "telegram",
      event: "mission_closed",
      text: rawText,
      source_ref: rawSourceRef,
      env_file: "guild_hall/state/town_crier/synthetic.env",
    });

    const result = await processTownCrierOnce(repoRoot, { limit: 1 });

    assert.equal(result.ok, false);
    assert.equal(result.processed, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.results[0].request_id, "invalid-one");
    assert.equal(result.results[0].status, "runner_error");
    assert.equal(await pathExists(pendingFile), true);
    assert.equal(await pathExists(processingFile), false);
    assert.equal(await pathExists(markerFile), false);

    const log = await readTownCrierLogs(repoRoot);
    assert.match(log, /invalid_pending_request:unsupported_event/);
    assert.equal(log.includes(rawText), false);
    assert.equal(log.includes(rawSourceRef), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("healer failure pending request is accepted by town crier", async () => {
  const repoRoot = await makeTempRoot("healer");
  const markerFile = path.join(repoRoot, "telegram-marker.txt");
  const pendingFile = path.join(
    repoRoot,
    "guild_hall",
    "state",
    "town_crier",
    "queue",
    "pending",
    "healer-one.json",
  );

  try {
    await writeText(
      path.join(repoRoot, "guild_hall", "town_crier", "telegram_send.py"),
      [
        "from pathlib import Path",
        `Path(${JSON.stringify(markerFile)}).write_text("executed\\n", encoding="utf-8")`,
        "print('{\"ok\": true}')",
        "",
      ].join("\n"),
    );
    await writeJson(pendingFile, {
      request_id: "healer-one",
      owner_scope: "healer",
      channel: "telegram",
      event: "healer_failed",
      text: "healer 실패: root_validate",
      source_ref: "guild_hall/state/operations/soulforge_activity/log/2026/2026-06/report.md",
      env_file: "guild_hall/state/town_crier/synthetic.env",
    });

    const result = await processTownCrierOnce(repoRoot, { limit: 1 });

    assert.equal(result.ok, true);
    assert.equal(result.processed, 1);
    assert.equal(result.sent, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.results[0].request_id, "healer-one");
    assert.equal(result.results[0].status, "sent");
    assert.equal(await pathExists(pendingFile), false);
    assert.equal((await readFile(markerFile, "utf8")).replace(/\r\n/g, "\n"), "executed\n");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("pending request with env file outside town crier state rolls back without executing telegram sender", async () => {
  const cases = [
    {
      label: "absolute-outside",
      envFile: (repoRoot) => path.join(repoRoot, "guild_hall", "state", "gateway", "telegram_notify.env"),
    },
    {
      label: "traversal-outside",
      envFile: () => "guild_hall/state/town_crier/../gateway/telegram_notify.env",
    },
  ];

  for (const testCase of cases) {
    const repoRoot = await makeTempRoot(`env-guard-${testCase.label}`);
    const markerFile = path.join(repoRoot, "telegram-marker.txt");
    const pendingFile = path.join(
      repoRoot,
      "guild_hall",
      "state",
      "town_crier",
      "queue",
      "pending",
      `${testCase.label}.json`,
    );
    const processingFile = path.join(
      repoRoot,
      "guild_hall",
      "state",
      "town_crier",
      "queue",
      "processing",
      `${testCase.label}.json`,
    );
    const rawText = `Synthetic guarded text must not be logged ${testCase.label}`;
    const rawSourceRef = `synthetic-guarded-source-ref-must-not-be-logged-${testCase.label}`;
    const envFile = testCase.envFile(repoRoot);

    try {
      await writeText(
        path.join(repoRoot, "guild_hall", "town_crier", "telegram_send.py"),
        [
          "from pathlib import Path",
          `Path(${JSON.stringify(markerFile)}).write_text("executed\\n", encoding="utf-8")`,
          "print('{\"ok\": true}')",
          "",
        ].join("\n"),
      );
      await writeJson(pendingFile, {
        request_id: testCase.label,
        owner_scope: "gateway",
        channel: "telegram",
        event: "monster_created",
        text: rawText,
        source_ref: rawSourceRef,
        env_file: envFile,
      });

      const result = await processTownCrierOnce(repoRoot, { limit: 1 });

      assert.equal(result.ok, false);
      assert.equal(result.processed, 1);
      assert.equal(result.failed, 1);
      assert.equal(result.results[0].request_id, testCase.label);
      assert.equal(result.results[0].status, "runner_error");
      assert.equal(await pathExists(pendingFile), true);
      assert.equal(await pathExists(processingFile), false);
      assert.equal(await pathExists(markerFile), false);

      const resultText = JSON.stringify(result);
      const log = await readTownCrierLogs(repoRoot);
      assert.match(log, /town_crier_env_file_must_stay_under_state_root/);
      for (const outputText of [resultText, log]) {
        assert.equal(outputText.includes(rawText), false);
        assert.equal(outputText.includes(rawSourceRef), false);
        assert.equal(outputText.includes(envFile), false);
        assert.equal(outputText.includes(repoRoot), false);
      }
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  }
});

async function makeTempRoot(label) {
  return mkdtemp(path.join(os.tmpdir(), `soulforge-town-crier-${label}-`));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readTownCrierLogs(repoRoot) {
  const logRoot = path.join(repoRoot, "guild_hall", "state", "town_crier", "log");
  const files = await listFiles(logRoot);
  const chunks = await Promise.all(files.map((filePath) => readFile(filePath, "utf8")));
  return chunks.join("\n");
}

async function listFiles(rootPath) {
  if (!(await pathExists(rootPath))) {
    return [];
  }

  const entries = await readdir(rootPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(rootPath, entry.name);
      if (entry.isDirectory()) {
        return listFiles(entryPath);
      }
      if (entry.isFile()) {
        return [entryPath];
      }
      return [];
    }),
  );
  return nested.flat();
}
