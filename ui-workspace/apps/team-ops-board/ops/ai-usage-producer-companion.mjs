import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const DEFAULT_USAGE_PRODUCER_INTERVAL_MS = 5 * 60 * 1_000;

export async function runUsageProducerSweep({ repoRoot, stateRoot, run = execFileAsync } = {}) {
  if (!path.isAbsolute(repoRoot ?? "") || !path.isAbsolute(stateRoot ?? "")) {
    return { status: "hold", completed: 0 };
  }
  const cli = path.join(repoRoot, "guild_hall", "ai_usage_meter", "cli.mjs");
  let completed = 0;
  for (const args of [
    [cli, "collect", "--state-root", stateRoot, "--apply"],
    [cli, "collect-claude", "--state-root", stateRoot, "--max-age-days", "2", "--apply"],
  ]) {
    try {
      await run(process.execPath, args, { cwd: repoRoot, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
      completed += 1;
    } catch {
      // Each producer remains fail-closed and the next interval retries it.
    }
  }
  return { status: completed === 2 ? "observed" : "partial", completed };
}

export function startUsageProducerCompanion({
  repoRoot,
  stateRoot,
  intervalMs = DEFAULT_USAGE_PRODUCER_INTERVAL_MS,
  sweep = runUsageProducerSweep,
} = {}) {
  let stopped = false;
  let inFlight = null;
  const trigger = () => {
    if (stopped || inFlight !== null) return inFlight;
    inFlight = Promise.resolve(sweep({ repoRoot, stateRoot })).finally(() => { inFlight = null; });
    return inFlight;
  };
  void trigger();
  const timer = setInterval(() => { void trigger(); }, intervalMs);
  timer.unref?.();
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight?.catch(() => {});
    },
  };
}
