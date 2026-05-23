import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCodexBridgePrompt,
  buildCodexExecArgs,
  getCodexBridgeStatus,
} from "./codex_bridge.mjs";

test("buildCodexExecArgs uses read-only ephemeral Codex exec without API key flags", () => {
  const args = buildCodexExecArgs({
    repoRoot: "/repo",
    outputLastMessage: "guild_hall/state/tools/codex_bridge/out.md",
  });

  assert.deepEqual(args.slice(0, 8), [
    "--ask-for-approval",
    "never",
    "exec",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--cd",
    "/repo",
  ]);
  assert.ok(args.includes("--output-last-message"));
  assert.equal(args.at(-1), "-");
  assert.equal(args.includes("--dangerously-bypass-approvals-and-sandbox"), false);
  assert.equal(args.includes("--with-api-key"), false);
});

test("buildCodexBridgePrompt carries account-bridge boundaries", () => {
  const prompt = buildCodexBridgePrompt({ prompt: "탐지 카드 설명", mode: "graph_node_review" });

  assert.match(prompt, /bounded Soulforge Codex account bridge/);
  assert.match(prompt, /Answer in Korean/);
  assert.match(prompt, /Do not request or expose secrets/);
  assert.match(prompt, /Bridge mode: graph_node_review/);
  assert.match(prompt, /탐지 카드 설명/);
});

test("getCodexBridgeStatus recognizes ChatGPT login from codex status output", () => {
  const calls = [];
  const status = getCodexBridgeStatus({
    command: "codex",
    spawnSyncImpl: (command, args) => {
      calls.push([command, args]);
      if (args.includes("--version")) {
        return { status: 0, stdout: "codex-cli 1.2.3\n", stderr: "" };
      }
      return { status: 0, stdout: "Logged in using ChatGPT\n", stderr: "" };
    },
  });

  assert.equal(status.command_available, true);
  assert.equal(status.logged_in_with_chatgpt, true);
  assert.equal(status.boundary.no_api_key_required_by_bridge, true);
  assert.equal(status.boundary.auth_file_not_read_by_bridge, true);
  assert.deepEqual(calls.map((call) => call[1][0]), ["--version", "login"]);
});

test("buildCodexExecArgs rejects output paths outside the repo", () => {
  assert.throws(
    () =>
      buildCodexExecArgs({
        repoRoot: "/repo",
        outputLastMessage: "../out.md",
      }),
    /must stay inside the repo/,
  );
});
