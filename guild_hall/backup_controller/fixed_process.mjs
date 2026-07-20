import { spawn } from "node:child_process";
import { once } from "node:events";

import { BackupControllerError } from "./controller.mjs";

function fail(code) {
  throw new BackupControllerError(code);
}

async function defaultTerminateTree(child) {
  if (!child || !Number.isInteger(child.pid)) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
    const [code] = await Promise.race([
      once(killer, "exit"),
      once(killer, "error").then(([error]) => { throw error; }),
    ]);
    if (code !== 0) fail("fixed_child_termination_failed");
  } else {
    if (child.kill("SIGKILL") !== true) fail("fixed_child_termination_failed");
  }
}

function bounded(promise, timeoutMs, code) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new BackupControllerError(code)), timeoutMs);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

export async function runFixedChild({ file, args, signal, spawnImpl = spawn, terminateTree = defaultTerminateTree, maxOutputBytes = 1024 * 1024, terminationTimeoutMs = 5000 }) {
  if (typeof file !== "string" || !Array.isArray(args) || args.some((arg) => typeof arg !== "string")) fail("fixed_child_contract_invalid");
  if (signal?.aborted) fail("fixed_child_aborted");
  const child = spawnImpl(file, args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  const append = (current, chunk) => {
    const next = current + String(chunk);
    if (Buffer.byteLength(next) > maxOutputBytes) fail("fixed_child_output_limit");
    return next;
  };
  child.stdout?.on("data", (chunk) => { stdout = append(stdout, chunk); });
  child.stderr?.on("data", (chunk) => { stderr = append(stderr, chunk); });
  let aborted = false;
  let terminationPromise = null;
  let signalAbort;
  const abortPromise = new Promise((resolve) => { signalAbort = resolve; });
  const onAbort = () => {
    aborted = true;
    terminationPromise = Promise.resolve(terminateTree(child));
    signalAbort();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const exitPromise = Promise.race([
      once(child, "exit"),
      once(child, "error").then(([error]) => { throw error; }),
    ]);
    const outcome = await Promise.race([
      exitPromise.then((value) => ({ kind: "exit", value })),
      abortPromise.then(() => ({ kind: "abort" })),
    ]);
    if (outcome.kind === "abort" || aborted) {
      try {
        await bounded(terminationPromise, terminationTimeoutMs, "fixed_child_termination_timeout");
      } catch (error) {
        if (error instanceof BackupControllerError) throw error;
        fail("fixed_child_termination_failed");
      }
      await bounded(exitPromise, terminationTimeoutMs, "fixed_child_exit_unconfirmed");
      fail("fixed_child_aborted");
    }
    const [code, terminationSignal] = outcome.value;
    return { code, signal: terminationSignal, stdout, stderr };
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

export function robocopyExitCodeAccepted(code) {
  return Number.isInteger(code) && code >= 0 && code <= 3;
}
