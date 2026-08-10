import {
  createUnavailableLiveThreadProjection,
  isAcknowledgeableLiveThread,
  normalizeLiveThreadProjection
} from "./live-thread-projection.mjs";

export const LIVE_THREAD_SNAPSHOT_PATH = "/codex-threads.snapshot.json";
export const LIVE_THREAD_POLL_INTERVAL_MS = 10_000;
export const LIVE_THREAD_ACK_STORAGE_PREFIX = "soulforge.team_ops_board.thread_ack.v1";

function createCancelledConsumerError() {
  const error = new Error("live thread projection consumer cancelled");
  error.name = "AbortError";
  return error;
}

function attachConsumer(request, signal) {
  if (!signal) return request;
  if (signal.aborted) return Promise.reject(createCancelledConsumerError());
  return new Promise((resolve, reject) => {
    const cancel = () => {
      signal.removeEventListener("abort", cancel);
      reject(createCancelledConsumerError());
    };
    signal.addEventListener("abort", cancel, { once: true });
    request.then(
      (value) => {
        signal.removeEventListener("abort", cancel);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", cancel);
        reject(error);
      }
    );
  });
}

async function fetchLiveThreadProjection(fetchImpl, { force = false } = {}) {
  try {
    const path = force ? `${LIVE_THREAD_SNAPSHOT_PATH}?refresh=1` : LIVE_THREAD_SNAPSHOT_PATH;
    const response = await fetchImpl(path, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
      mode: "same-origin",
      redirect: "error"
    });
    if (!response.ok) return createUnavailableLiveThreadProjection({ health: "error", enrollmentHealth: "invalid" });
    try {
      return normalizeLiveThreadProjection(await response.json());
    } catch {
      return createUnavailableLiveThreadProjection({ health: "error", enrollmentHealth: "invalid" });
    }
  } catch {
    return createUnavailableLiveThreadProjection({ health: "unavailable", enrollmentHealth: "missing" });
  }
}

export function createLiveThreadProjectionRequest(fetchImpl = globalThis.fetch) {
  let inFlight = null;
  return {
    load({ signal, force = false } = {}) {
      if (inFlight === null) {
        inFlight = fetchLiveThreadProjection(fetchImpl, { force }).finally(() => {
          inFlight = null;
        });
      }
      return attachConsumer(inFlight, signal);
    }
  };
}

export const liveThreadProjectionRequest = createLiveThreadProjectionRequest();

export function liveThreadAcknowledgementKey(thread) {
  if (typeof thread?.thread_id !== "string" || typeof thread?.updated_at !== "string") return null;
  return `${LIVE_THREAD_ACK_STORAGE_PREFIX}:${thread.thread_id}:${thread.updated_at}`;
}

export function isLiveThreadAcknowledged(storage, thread) {
  const key = liveThreadAcknowledgementKey(thread);
  if (!key || !storage) return false;
  try {
    return storage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function acknowledgeLiveThread(storage, thread) {
  const key = liveThreadAcknowledgementKey(thread);
  if (!key || !isAcknowledgeableLiveThread(thread) || !storage) return false;
  try {
    storage.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
}

export function restoreLiveThread(storage, thread) {
  const key = liveThreadAcknowledgementKey(thread);
  if (!key || !storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function sortThreads(left, right) {
  return right.updated_at.localeCompare(left.updated_at) || left.thread_id.localeCompare(right.thread_id);
}

export function selectLiveThreadView(projectionInput, storage, view = "active") {
  const projection = normalizeLiveThreadProjection(projectionInput);
  const acknowledged = projection.threads.filter((thread) => (
    isAcknowledgeableLiveThread(thread) && isLiveThreadAcknowledged(storage, thread)
  ));
  if (view === "history") {
    return {
      projection,
      threads: [...acknowledged, ...projection.history].sort(sortThreads),
      acknowledged
    };
  }
  return {
    projection,
    threads: projection.threads.filter((thread) => !isLiveThreadAcknowledged(storage, thread)).sort(sortThreads),
    acknowledged
  };
}

export function selectOwnerAttentionThreads(projectionInput, storage) {
  const projection = normalizeLiveThreadProjection(projectionInput);
  const candidates = projection.threads.filter((thread) => (
    thread.status === "owner_attention" && thread.attention_target === "owner"
  ));
  const acknowledged = candidates.filter((thread) => (
    isAcknowledgeableLiveThread(thread) && isLiveThreadAcknowledged(storage, thread)
  ));
  return {
    projection,
    threads: candidates.filter((thread) => !acknowledged.includes(thread)).sort(sortThreads),
    acknowledged
  };
}

export function buildExactThreadTree(threads) {
  const values = Array.isArray(threads) ? threads.slice().sort(sortThreads) : [];
  const nodesByThreadId = new Map(values.map((thread) => [thread.thread_id, { ...thread, children: [], direct_child_count: 0 }]));
  const roots = [];
  for (const node of nodesByThreadId.values()) {
    const parent = node.parent_thread_id === null ? null : nodesByThreadId.get(node.parent_thread_id);
    if (!parent) {
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }
  for (const node of nodesByThreadId.values()) {
    node.children.sort(sortThreads);
    node.direct_child_count = node.children.length;
  }
  return roots.sort(sortThreads);
}

const ORGANIZATION_COMPANIES = Object.freeze([
  {
    organization_company_id: "development1_company",
    label: "개발1팀 회사",
    group_ids: new Set(["development1_company", "development1_ops", "development1_projects", "development1_kvds"])
  },
  {
    organization_company_id: "ai_platform_company",
    label: "AI 기반시스템 회사",
    group_ids: new Set(["ai_platform_company", "ai_platform_ax", "ai_platform_erp", "ai_platform_system"])
  }
]);

export function organizationCompanyForGroup(groupId) {
  return ORGANIZATION_COMPANIES.find((company) => company.group_ids.has(groupId))?.organization_company_id ?? "unassigned_company";
}

export function organizationCompanyLabel(companyId) {
  return ORGANIZATION_COMPANIES.find((company) => company.organization_company_id === companyId)?.label ?? "조직 미분류";
}

export function groupExactThreadTreesByCompany(threads) {
  const groups = new Map();
  for (const root of buildExactThreadTree(threads)) {
    const companyId = organizationCompanyForGroup(root.organization_group_id);
    const company = groups.get(companyId) ?? [];
    company.push(root);
    groups.set(companyId, company);
  }
  const orderedCompanyIds = [
    ...ORGANIZATION_COMPANIES.map((company) => company.organization_company_id),
    ...[...groups.keys()].filter((companyId) => !ORGANIZATION_COMPANIES.some((company) => company.organization_company_id === companyId)).sort()
  ];
  return orderedCompanyIds
    .map((organization_company_id) => ({
      organization_company_id,
      label: organizationCompanyLabel(organization_company_id),
      roots: (groups.get(organization_company_id) ?? []).sort(sortThreads)
    }))
    .filter((company) => company.roots.length > 0);
}

export function groupLiveThreadsByOrganization(threads) {
  const groups = new Map();
  for (const thread of Array.isArray(threads) ? threads : []) {
    const group = groups.get(thread.organization_group_id) ?? [];
    group.push(thread);
    groups.set(thread.organization_group_id, group);
  }
  return [...groups.entries()]
    .map(([organization_group_id, members]) => ({ organization_group_id, threads: members.sort(sortThreads) }))
    .sort((left, right) => left.organization_group_id.localeCompare(right.organization_group_id));
}
