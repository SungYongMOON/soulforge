// host-stats-adapter.mjs — 로컬 호스트 자원(CPU·메모리·디스크·가동시간) 스냅샷을
// loopback 전용 GET /host-stats.snapshot.json 으로 서빙하는 Vite dev/preview 플러그인.
// 샘플링은 5초 TTL·동시요청 단일화로 억제하고, 실패 시 마지막 정상 스냅샷(없으면 null)을 낸다.

import os from "node:os";
import { promises as fsPromises } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

import { HOST_STATS_SCHEMA_VERSION, cpuPercentFromSamples } from "../core/host-stats.mjs";

export const HOST_STATS_SNAPSHOT_PATH = "/host-stats.snapshot.json";
export const DEFAULT_HOST_STATS_SAMPLE_TTL_MS = 5_000;
export const DEFAULT_HOST_STATS_CPU_SAMPLE_DELAY_MS = 180;
export const DEFAULT_HOST_STATS_HISTORY_LIMIT = 24;
export const DEFAULT_HOST_STATS_SAMPLE_TIMEOUT_MS = 4_000;

const DRIVE_PATTERN = /^[A-Z]:$/u;

// 드라이브 후보는 런타임에 열거한다 — 추적 코드에 로컬 절대경로 리터럴을 두지 않는
// path-policy를 지키면서, 존재하는 고정 드라이브만 statfs 성공 여부로 걸러진다.
function candidateDriveRoots(env = process.env) {
  const configured = typeof env.TEAM_OPS_BOARD_HOST_DISK_ROOTS === "string" && env.TEAM_OPS_BOARD_HOST_DISK_ROOTS.trim()
    ? env.TEAM_OPS_BOARD_HOST_DISK_ROOTS.split(";").map((root) => root.trim()).filter((root) => root.length > 0)
    : null;
  if (configured !== null) return configured;
  const roots = [];
  for (let index = 2; index < 26; index += 1) {
    roots.push(`${String.fromCharCode(65 + index)}:/`);
  }
  return roots;
}

const DEFAULT_DISK_ROOTS = Object.freeze(candidateDriveRoots());

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function roundPercent(value) {
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

function pushRing(ring, value, limit) {
  ring.push(value);
  if (ring.length > limit) ring.splice(0, ring.length - limit);
}

// 멈춘 statfs(예: 끊긴 네트워크 드라이브)가 요청을 무한히 잡아두지 않도록
// 샘플 전체에 마감시한을 건다. 시한 초과는 실패 경로(lastGood/null 서빙)로 합류한다.
function withDeadline(promise, timeoutMs) {
  let timer = null;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("host_stats_sample_timeout")), timeoutMs);
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

export function createHostStatsSampler({
  cpus = os.cpus,
  totalmem = os.totalmem,
  freemem = os.freemem,
  uptime = os.uptime,
  statfs = typeof fsPromises.statfs === "function" ? fsPromises.statfs : null,
  diskRoots = DEFAULT_DISK_ROOTS,
  sampleTtlMs = DEFAULT_HOST_STATS_SAMPLE_TTL_MS,
  cpuSampleDelayMs = DEFAULT_HOST_STATS_CPU_SAMPLE_DELAY_MS,
  historyLimit = DEFAULT_HOST_STATS_HISTORY_LIMIT,
  sampleTimeoutMs = DEFAULT_HOST_STATS_SAMPLE_TIMEOUT_MS,
  now = Date.now,
} = {}) {
  let inFlight = null;
  let lastAttemptAt = null;
  let lastGood = null;
  const cpuHistory = [];
  const memoryHistory = [];

  async function sampleDisks() {
    if (statfs === null) return [];
    const probes = await Promise.all(diskRoots.map(async (root) => {
      try {
        return { root, stats: await statfs(root) };
      } catch {
        return null;
      }
    }));
    const disks = [];
    for (const probe of probes) {
      if (probe === null) continue;
      const totalBytes = Number(probe.stats.bsize) * Number(probe.stats.blocks);
      const freeBytes = Number(probe.stats.bsize) * Number(probe.stats.bavail);
      const usedBytes = totalBytes - freeBytes;
      const drive = probe.root.slice(0, 2).toUpperCase();
      if (!DRIVE_PATTERN.test(drive) || !Number.isFinite(totalBytes) || totalBytes <= 0
        || !Number.isFinite(usedBytes) || usedBytes < 0) {
        continue;
      }
      disks.push({
        drive,
        total_bytes: totalBytes,
        used_bytes: usedBytes,
        percent: roundPercent((usedBytes / totalBytes) * 100),
      });
    }
    return disks;
  }

  async function takeSample() {
    const firstCpuSample = cpus();
    await delay(cpuSampleDelayMs);
    const secondCpuSample = cpus();
    const cpuPercent = cpuPercentFromSamples(firstCpuSample, secondCpuSample);
    if (cpuPercent === null) throw new Error("host_stats_cpu_sample_invalid");
    const totalBytes = totalmem();
    const freeBytes = freemem();
    if (!Number.isFinite(totalBytes) || totalBytes <= 0
      || !Number.isFinite(freeBytes) || freeBytes < 0 || freeBytes > totalBytes) {
      throw new Error("host_stats_memory_sample_invalid");
    }
    const usedBytes = totalBytes - freeBytes;
    const uptimeSeconds = uptime();
    if (!Number.isFinite(uptimeSeconds) || uptimeSeconds < 0) {
      throw new Error("host_stats_uptime_sample_invalid");
    }
    const disks = await sampleDisks();
    pushRing(cpuHistory, cpuPercent, historyLimit);
    pushRing(memoryHistory, roundPercent((usedBytes / totalBytes) * 100), historyLimit);
    return {
      schema_version: HOST_STATS_SCHEMA_VERSION,
      observed_at: new Date(now()).toISOString(),
      cpu: {
        percent: cpuPercent,
        cores: secondCpuSample.length,
        history: [...cpuHistory],
      },
      memory: {
        total_bytes: totalBytes,
        used_bytes: usedBytes,
        percent: memoryHistory[memoryHistory.length - 1],
        history: [...memoryHistory],
      },
      disks,
      uptime_seconds: uptimeSeconds,
    };
  }

  return {
    async readSnapshot() {
      const observedNow = now();
      // TTL은 성공 여부와 무관하게 최근 시도 기준 — 지속 실패 중에도 재샘플 폭주를 막는다.
      if (lastAttemptAt !== null && observedNow - lastAttemptAt < sampleTtlMs) {
        return lastGood;
      }
      if (inFlight === null) {
        lastAttemptAt = observedNow;
        const operation = withDeadline(takeSample(), sampleTimeoutMs)
          .then((snapshot) => {
            lastGood = snapshot;
          }, () => {})
          .finally(() => {
            if (inFlight === operation) inFlight = null;
          });
        inFlight = operation;
      }
      await inFlight;
      return lastGood;
    },
  };
}

export function createHostStatsAdapterPlugin(options = {}) {
  const sampler = createHostStatsSampler(options);
  const configure = (server) => {
    server.middlewares.use((request, response, next) => {
      let url;
      try {
        url = new URL(request.url || "/", "http://127.0.0.1");
      } catch {
        response.statusCode = 400;
        response.end();
        return;
      }
      if (url.pathname !== HOST_STATS_SNAPSHOT_PATH) {
        next();
        return;
      }
      if (request.method !== "GET") {
        response.statusCode = 405;
        response.setHeader("Allow", "GET");
        response.end();
        return;
      }
      if (!isLoopbackAddress(request.socket.remoteAddress)) {
        response.statusCode = 403;
        response.end();
        return;
      }
      const respond = (snapshot) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(JSON.stringify(snapshot ?? null));
      };
      void sampler.readSnapshot().then(respond, () => respond(null));
    });
  };
  return {
    name: "soulforge-host-stats-adapter",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
