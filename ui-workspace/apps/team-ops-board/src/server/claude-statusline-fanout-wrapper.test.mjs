import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { runClaudeStatuslineFanoutWrapper } from "./claude-statusline-fanout-wrapper.mjs";

test("status-line wrapper preserves the structured stdin for the existing renderer", async () => {
  const input = Buffer.from('{"rate_limits":{}}');
  let forwarded = Buffer.alloc(0);
  const spawnImpl = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stdin = new PassThrough();
    child.stdin.on("data", (chunk) => { forwarded = Buffer.concat([forwarded, chunk]); });
    child.stdin.on("end", () => queueMicrotask(() => child.emit("exit", 0)));
    return child;
  };
  const code = await runClaudeStatuslineFanoutWrapper({
    argv: ["--receipt-path", "C:\\safe\\provider_quota.receipt.v1.json", "--next-command-base64", Buffer.from("existing-renderer").toString("base64url")],
    stdin: [input], stdout: new PassThrough(), spawnImpl,
  });
  assert.equal(code, 0);
  assert.deepEqual(forwarded, input);
});
