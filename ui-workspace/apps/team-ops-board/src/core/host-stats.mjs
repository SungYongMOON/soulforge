// host-stats.mjs — 호스트 자원 스냅샷(CPU·메모리·디스크·가동시간)을 Board
// 스탯 스트립 셀 모델로 변환하는 순수 정규화 계층. 프레임워크 비종속(node:test 검증 대상).

export const HOST_STATS_SCHEMA_VERSION = "soulforge.team_ops_board_host_stats.v1";

const CPU_TIME_FIELDS = Object.freeze(["user", "nice", "sys", "idle", "irq"]);
const MAX_HISTORY_ENTRIES = 64;
const GIB = 1024 ** 3;
const DRIVE_PATTERN = /^[A-Z]:$/u;

const SNAPSHOT_ALLOWED_KEYS = new Set([
  "schema_version",
  "observed_at",
  "cpu",
  "memory",
  "disks",
  "uptime_seconds",
]);
const CPU_ALLOWED_KEYS = new Set(["percent", "cores", "history"]);
const MEMORY_ALLOWED_KEYS = new Set(["total_bytes", "used_bytes", "percent", "history"]);
const DISK_ALLOWED_KEYS = new Set(["drive", "total_bytes", "used_bytes", "percent"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowedKeys) {
  if (!isPlainObject(value)) return false;
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isNonNegativeFinite(value) {
  return Number.isFinite(value) && value >= 0;
}

function isPercent(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function isHistory(value) {
  return Array.isArray(value)
    && value.length <= MAX_HISTORY_ENTRIES
    && value.every((entry) => isNonNegativeFinite(entry));
}

function sumCpuTimes(sample) {
  if (!Array.isArray(sample) || sample.length === 0) return null;
  let total = 0;
  let idle = 0;
  for (const core of sample) {
    if (!isPlainObject(core) || !isPlainObject(core.times)) return null;
    for (const field of CPU_TIME_FIELDS) {
      const value = core.times[field];
      if (!isNonNegativeFinite(value)) return null;
      total += value;
    }
    idle += core.times.idle;
  }
  return { total, idle };
}

export function cpuPercentFromSamples(prev, next) {
  const prevTotals = sumCpuTimes(prev);
  const nextTotals = sumCpuTimes(next);
  if (prevTotals === null || nextTotals === null) return null;
  const totalDelta = nextTotals.total - prevTotals.total;
  if (!Number.isFinite(totalDelta) || totalDelta <= 0) return null;
  const busyDelta = totalDelta - (nextTotals.idle - prevTotals.idle);
  const percent = (busyDelta / totalDelta) * 100;
  return Math.round(Math.min(100, Math.max(0, percent)) * 10) / 10;
}

export function formatGb(bytes) {
  if (!isNonNegativeFinite(bytes)) return null;
  const gb = bytes / GIB;
  if (gb >= 100) return String(Math.round(gb));
  const rounded = Math.round(gb * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatUptime(seconds) {
  if (!isNonNegativeFinite(seconds)) return null;
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function isValidDisk(disk) {
  return hasOnlyKeys(disk, DISK_ALLOWED_KEYS)
    && typeof disk.drive === "string"
    && DRIVE_PATTERN.test(disk.drive)
    && isNonNegativeFinite(disk.total_bytes)
    && isNonNegativeFinite(disk.used_bytes)
    && isPercent(disk.percent);
}

function isValidSnapshot(snapshot) {
  return hasOnlyKeys(snapshot, SNAPSHOT_ALLOWED_KEYS)
    && snapshot.schema_version === HOST_STATS_SCHEMA_VERSION
    && typeof snapshot.observed_at === "string"
    && !Number.isNaN(Date.parse(snapshot.observed_at))
    && hasOnlyKeys(snapshot.cpu, CPU_ALLOWED_KEYS)
    && isPercent(snapshot.cpu.percent)
    && isNonNegativeFinite(snapshot.cpu.cores)
    && isHistory(snapshot.cpu.history)
    && hasOnlyKeys(snapshot.memory, MEMORY_ALLOWED_KEYS)
    && isNonNegativeFinite(snapshot.memory.total_bytes)
    && isNonNegativeFinite(snapshot.memory.used_bytes)
    && isPercent(snapshot.memory.percent)
    && isHistory(snapshot.memory.history)
    && Array.isArray(snapshot.disks)
    && snapshot.disks.every((disk) => isValidDisk(disk))
    && isNonNegativeFinite(snapshot.uptime_seconds);
}

export function buildHostStatsViewModel(snapshot) {
  if (!isValidSnapshot(snapshot)) {
    return { available: false, cells: [], observedAt: null };
  }
  const cells = [
    {
      key: "cpu",
      label: "CPU",
      value: `${Math.round(snapshot.cpu.percent)}%`,
      history: [...snapshot.cpu.history],
    },
    {
      key: "mem",
      label: "MEM",
      value: `${formatGb(snapshot.memory.used_bytes)}/${formatGb(snapshot.memory.total_bytes)}GB`,
      history: [...snapshot.memory.history],
    },
    ...snapshot.disks.map((disk) => ({
      key: `disk_${disk.drive[0].toLowerCase()}`,
      label: `DISK ${disk.drive}`,
      value: `${formatGb(disk.used_bytes)}/${formatGb(disk.total_bytes)}GB`,
      history: [],
    })),
    {
      key: "up",
      label: "UP",
      value: formatUptime(snapshot.uptime_seconds),
      history: [],
    },
  ];
  return { available: true, cells, observedAt: snapshot.observed_at };
}
