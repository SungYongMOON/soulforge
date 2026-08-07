import {
  createUnavailableLiveThreadProjection,
  isAcknowledgeableLiveThread,
  normalizeLiveThreadProjection,
  organizationGroupLabel
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

function catalogCompanies(organization) {
  return Array.isArray(organization?.companies)
    ? organization.companies
      .filter((company) => (
        typeof company?.company_id === "string"
        && typeof company?.display_label === "string"
        && typeof company?.ceo_group_id === "string"
        && Number.isSafeInteger(company?.sort_order)
      ))
      .slice()
      .sort((left, right) => left.sort_order - right.sort_order || left.company_id.localeCompare(right.company_id))
    : [];
}

function catalogGroups(organization) {
  return Array.isArray(organization?.groups)
    ? organization.groups
      .filter((group) => (
        typeof group?.organization_group_id === "string"
        && typeof group?.company_id === "string"
        && typeof group?.display_label === "string"
        && Number.isSafeInteger(group?.sort_order)
      ))
      .slice()
      .sort((left, right) => left.sort_order - right.sort_order || left.organization_group_id.localeCompare(right.organization_group_id))
    : [];
}

export function organizationCompanyForGroup(groupId, organization = null) {
  return catalogGroups(organization).find((group) => group.organization_group_id === groupId)?.company_id ?? null;
}

export function organizationCompanyLabel(companyId, organization = null) {
  return catalogCompanies(organization).find((company) => company.company_id === companyId)?.display_label ?? "미할당/보류";
}

export function organizationCompanyCeoLabel(companyId, organization = null) {
  const company = catalogCompanies(organization).find((item) => item.company_id === companyId);
  return company
    ? catalogGroups(organization).find((group) => group.organization_group_id === company.ceo_group_id)?.display_label ?? "CEO 그룹 미확정"
    : "미할당/보류";
}

export function groupExactThreadTreesByCompany(threads, organization = null) {
  const rootsByCompany = new Map();
  for (const root of buildExactThreadTree(threads)) {
    const companyId = organizationCompanyForGroup(root.organization_group_id, organization);
    if (companyId === null) continue;
    const companyRoots = rootsByCompany.get(companyId) ?? [];
    companyRoots.push(root);
    rootsByCompany.set(companyId, companyRoots);
  }
  return catalogCompanies(organization)
    .map((company) => ({
      organization_company_id: company.company_id,
      label: company.display_label,
      roots: (rootsByCompany.get(company.company_id) ?? []).sort(sortThreads)
    }))
    .filter((company) => company.roots.length > 0);
}

export function groupLiveThreadsByOrganization(threads, organization = null) {
  const knownGroups = catalogGroups(organization);
  const groups = new Map(knownGroups.map((group) => [
    group.organization_group_id,
    {
      organization_group_id: group.organization_group_id,
      company_id: group.company_id,
      display_label: group.display_label,
      parent_group_id: group.parent_group_id ?? null,
      presentation_role: group.presentation_role ?? "group_node",
      sort_order: group.sort_order,
      catalog_state: "assigned",
      threads: []
    }
  ]));
  for (const thread of Array.isArray(threads) ? threads : []) {
    if (typeof thread?.organization_group_id !== "string") continue;
    const existing = groups.get(thread.organization_group_id);
    if (existing) {
      existing.threads.push(thread);
      continue;
    }
    groups.set(thread.organization_group_id, {
      organization_group_id: thread.organization_group_id,
      company_id: null,
      display_label: organizationGroupLabel(thread.organization_group_id, organization),
      parent_group_id: null,
      presentation_role: "group_node",
      sort_order: Number.MAX_SAFE_INTEGER,
      catalog_state: "unassigned_hold",
      threads: [thread]
    });
  }
  return [...groups.values()]
    .map((group) => ({ ...group, threads: group.threads.sort(sortThreads) }))
    .sort((left, right) => (
      (left.catalog_state === "assigned" ? 0 : 1) - (right.catalog_state === "assigned" ? 0 : 1)
      || left.sort_order - right.sort_order
      || left.organization_group_id.localeCompare(right.organization_group_id)
    ));
}

function mergedBuckets(groups) {
  const buckets = { active: [], waiting: [], owner_result: [], unavailable: [], parent_result: [] };
  for (const group of groups) {
    for (const key of Object.keys(buckets)) buckets[key].push(...(group?.buckets?.[key] ?? []));
  }
  return buckets;
}

// This is a human-facing layout projection only. It keeps every exact
// organization_group_id on its source thread and never changes authority.
export function buildCompactOrganizationLanes(groupsInput, organization = null) {
  const groups = Array.isArray(groupsInput) ? groupsInput.filter((group) => typeof group?.organization_group_id === "string") : [];
  const byGroupId = new Map(groups.map((group) => [group.organization_group_id, group]));
  const companies = catalogCompanies(organization).map((company) => {
    const companyGroups = catalogGroups(organization)
      .filter((group) => group.company_id === company.company_id)
      .map((group) => byGroupId.get(group.organization_group_id))
      .filter(Boolean);
    const ceoGroup = byGroupId.get(company.ceo_group_id) ?? null;
    const lanes = companyGroups
      .filter((group) => group.organization_group_id !== company.ceo_group_id)
      .map((group) => {
        const threads = Array.isArray(group.threads) ? group.threads.slice().sort(sortThreads) : [];
        const managerThreads = group.presentation_role === "manager_peers"
          ? threads.filter((thread) => thread.thread_kind === "manager" && thread.parent_thread_id === null)
          : [];
        return {
          lane_id: group.organization_group_id,
          label: group.display_label,
          presentation_role: group.presentation_role,
          group_ids: [group.organization_group_id],
          groups: [group],
          primary_group_id: group.organization_group_id,
          threads,
          manager_threads: managerThreads,
          buckets: mergedBuckets([group])
        };
      });
    return {
      company_id: company.company_id,
      label: company.display_label,
      ceo_label: organizationCompanyCeoLabel(company.company_id, organization),
      ceo_group: ceoGroup,
      lanes
    };
  });
  return {
    companies,
    unassigned_groups: groups.filter((group) => group.catalog_state !== "assigned" || group.company_id === null)
  };
}

const OPERATIONAL_TOPOLOGY_THREAD_KINDS = new Set(["manager", "task", "verifier"]);
const OPERATIONAL_TOPOLOGY_CONTEXT_STATUSES = new Set(["stopped", "not_loaded_unknown"]);

function hasTopologyThreadId(thread) {
  return typeof thread?.thread_id === "string" && thread.thread_id.length > 0;
}

function sortTopologyThreads(left, right) {
  return left.thread_id.localeCompare(right.thread_id);
}

function uniqueTopologyThreads(threadsInput) {
  const candidates = Array.isArray(threadsInput)
    ? threadsInput.filter(hasTopologyThreadId)
    : [];
  const counts = new Map();
  for (const thread of candidates) {
    counts.set(thread.thread_id, (counts.get(thread.thread_id) ?? 0) + 1);
  }
  return candidates
    .filter((thread) => counts.get(thread.thread_id) === 1)
    .slice()
    .sort(sortTopologyThreads);
}

// Only observed execution and explicit result-delivery states get a transient
// operational node. Unknown, dormant, closed, and stopped data remains in its
// existing history/observation surfaces instead of being presented as work.
export function operationalTopologyStatusTone(thread, storage = null) {
  if (!hasTopologyThreadId(thread) || isLiveThreadAcknowledged(storage, thread)) return "unknown";
  if (thread.status === "active") return "active";
  if (thread.status === "waiting") return "waiting";
  if (thread.status === "parent_result_ready" && thread.attention_target === "parent") return "result";
  if (
    thread.status === "stopped"
    && thread.result_state === "delivered_to_parent"
    && thread.attention_target === "parent"
  ) return "result";
  if (thread.status === "owner_attention" && thread.attention_target === "owner") return "result";
  return "unknown";
}

export function isOperationalTopologyTransient(thread, storage = null) {
  return OPERATIONAL_TOPOLOGY_THREAD_KINDS.has(thread?.thread_kind)
    && operationalTopologyStatusTone(thread, storage) !== "unknown";
}

function isOperationalTopologyContextAncestor(thread, storage = null) {
  return OPERATIONAL_TOPOLOGY_THREAD_KINDS.has(thread?.thread_kind)
    && OPERATIONAL_TOPOLOGY_CONTEXT_STATUSES.has(thread?.status)
    && !isLiveThreadAcknowledged(storage, thread);
}

function strongerOperationalTopologyTone(left, right) {
  const priority = { unknown: 0, result: 1, waiting: 2, active: 3 };
  return (priority[right] ?? 0) > (priority[left] ?? 0) ? right : left;
}

// This is a display-only graph projection. Company edges come only from the
// owner-provided catalog; all live descendant edges are exact parent_thread_id
// relationships that stay inside one company and either stay in one group or
// follow the catalog's direct parent-group edge. Nothing here changes
// enrollment, routes, or lifecycle state.
export function buildOperationalOrganizationTopology({
  threadsInput,
  organization = null,
  storage = null,
  mode = "all"
} = {}) {
  const topologyMode = mode === "live" ? "live" : "all";
  const threads = uniqueTopologyThreads(threadsInput);
  const threadsById = new Map(threads.map((thread) => [thread.thread_id, thread]));
  const companies = catalogCompanies(organization);
  const companiesById = new Map(companies.map((company) => [company.company_id, company]));
  const groupsById = new Map(catalogGroups(organization).map((group) => [group.organization_group_id, group]));
  const companyIdForThread = (thread) => {
    const companyId = groupsById.get(thread?.organization_group_id)?.company_id ?? null;
    return companiesById.has(companyId) ? companyId : null;
  };
  const hasGovernedParentEdge = (parent, child) => {
    const parentGroup = groupsById.get(parent?.organization_group_id) ?? null;
    const childGroup = groupsById.get(child?.organization_group_id) ?? null;
    return parentGroup !== null
      && childGroup !== null
      && parentGroup.company_id === childGroup.company_id
      && (
        parentGroup.organization_group_id === childGroup.organization_group_id
        || childGroup.parent_group_id === parentGroup.organization_group_id
      );
  };
  const rootManagersByCompany = new Map(companies.map((company) => [company.company_id, []]));

  for (const thread of threads) {
    const companyId = companyIdForThread(thread);
    if (
      companyId !== null
      && thread.thread_kind === "manager"
      && thread.parent_thread_id === null
    ) {
      rootManagersByCompany.get(companyId).push(thread);
    }
  }

  const nodes = [];
  const edges = [];
  const nodesByThreadId = new Map();
  const rootManagerIds = new Set();
  for (const company of companies) {
    nodes.push({
      node_id: `company:${company.company_id}`,
      node_kind: "company_anchor",
      company_id: company.company_id,
      organization_group_id: company.ceo_group_id,
      display_label: organizationCompanyCeoLabel(company.company_id, organization),
      company_label: company.display_label,
      tone: "anchor",
      depth: 0,
      stable: true
    });
    const rootManagers = (rootManagersByCompany.get(company.company_id) ?? []).sort(sortTopologyThreads);
    for (const thread of rootManagers) {
      const node = {
        node_id: `thread:${thread.thread_id}`,
        node_kind: "manager_anchor",
        thread_id: thread.thread_id,
        company_id: company.company_id,
        organization_group_id: thread.organization_group_id,
        display_label: thread.display_label,
        thread_kind: thread.thread_kind,
        tone: operationalTopologyStatusTone(thread, storage),
        depth: 1,
        stable: true,
        acknowledged: isLiveThreadAcknowledged(storage, thread),
        thread
      };
      nodes.push(node);
      nodesByThreadId.set(thread.thread_id, node);
      rootManagerIds.add(thread.thread_id);
      edges.push({
        edge_id: `authority:${company.company_id}:${thread.thread_id}`,
        edge_kind: "organization_authority",
        source: `company:${company.company_id}`,
        target: node.node_id,
        company_id: company.company_id
      });
    }
  }

  // The full organization roster is the exact current manager hierarchy from
  // enrollment. Governance supplies company/group placement; exact
  // parent_thread_id edges supply the individual team-manager/responsibility
  // rows. Terminal/history rows and locally acknowledged result rows never
  // become fixed organization anchors.
  const rosterManagerIds = new Set();
  const pendingRosterManagers = threads.filter((thread) => (
    thread.thread_kind === "manager"
    && !rootManagerIds.has(thread.thread_id)
    && thread.lifecycle !== "history"
    && thread.status !== "accepted_closed"
    && !isLiveThreadAcknowledged(storage, thread)
  ));
  let rosterProgressed = true;
  while (rosterProgressed && pendingRosterManagers.length > 0) {
    rosterProgressed = false;
    for (let index = pendingRosterManagers.length - 1; index >= 0; index -= 1) {
      const thread = pendingRosterManagers[index];
      const parent = typeof thread.parent_thread_id === "string"
        ? threadsById.get(thread.parent_thread_id) ?? null
        : null;
      if (
        parent === null
        || parent.thread_kind !== "manager"
        || !hasGovernedParentEdge(parent, thread)
        || (!rootManagerIds.has(parent.thread_id) && !rosterManagerIds.has(parent.thread_id))
      ) {
        continue;
      }
      rosterManagerIds.add(thread.thread_id);
      pendingRosterManagers.splice(index, 1);
      rosterProgressed = true;
    }
  }

  const transientThreads = threads.filter((thread) => (
    !rootManagerIds.has(thread.thread_id)
    && isOperationalTopologyTransient(thread, storage)
  ));
  const transientIds = new Set(transientThreads.map((thread) => thread.thread_id));
  const includedTransientIds = new Set();
  const contextThreadIds = new Set();
  const omittedTransientIds = new Set();

  // A live descendant may retain only a stopped or not_loaded_unknown exact
  // ancestor chain as neutral context. Terminal and acknowledged result states
  // are deliberate boundaries: fail closed instead of reparenting or guessing.
  for (const transient of transientThreads) {
    const visited = new Set([transient.thread_id]);
    const contextPath = [];
    let current = transient;
    let reachesRootAnchor = false;
    while (typeof current.parent_thread_id === "string") {
      const parent = threadsById.get(current.parent_thread_id) ?? null;
      if (
        parent === null
        || visited.has(parent.thread_id)
        || !hasGovernedParentEdge(parent, current)
        || !OPERATIONAL_TOPOLOGY_THREAD_KINDS.has(parent.thread_kind)
      ) {
        break;
      }
      visited.add(parent.thread_id);
      if (rootManagerIds.has(parent.thread_id)) {
        reachesRootAnchor = true;
        break;
      }
      if (
        !isOperationalTopologyTransient(parent, storage)
        && !isOperationalTopologyContextAncestor(parent, storage)
      ) {
        break;
      }
      contextPath.push(parent);
      current = parent;
    }
    if (!reachesRootAnchor) {
      omittedTransientIds.add(transient.thread_id);
      continue;
    }
    includedTransientIds.add(transient.thread_id);
    for (const contextThread of contextPath) {
      if (!transientIds.has(contextThread.thread_id)) contextThreadIds.add(contextThread.thread_id);
    }
  }

  const pending = threads.filter((thread) => (
    includedTransientIds.has(thread.thread_id)
    || contextThreadIds.has(thread.thread_id)
    || rosterManagerIds.has(thread.thread_id)
  ));
  let progressed = true;
  while (progressed && pending.length > 0) {
    progressed = false;
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const thread = pending[index];
      const parent = typeof thread.parent_thread_id === "string"
        ? threadsById.get(thread.parent_thread_id) ?? null
        : null;
      const parentNode = parent ? nodesByThreadId.get(parent.thread_id) ?? null : null;
      if (
        parentNode === null
        || !hasGovernedParentEdge(parent, thread)
        || parentNode.company_id !== companyIdForThread(thread)
      ) {
        continue;
      }
      const isTransient = includedTransientIds.has(thread.thread_id);
      const isRosterManager = rosterManagerIds.has(thread.thread_id) && thread.thread_kind === "manager";
      const node = {
        node_id: `thread:${thread.thread_id}`,
        node_kind: isTransient ? "transient_thread" : isRosterManager ? "responsibility_anchor" : "context_thread",
        thread_id: thread.thread_id,
        company_id: parentNode.company_id,
        organization_group_id: thread.organization_group_id,
        display_label: thread.display_label,
        thread_kind: thread.thread_kind,
        tone: isTransient || isRosterManager ? operationalTopologyStatusTone(thread, storage) : "context",
        depth: parentNode.depth + 1,
        stable: isRosterManager,
        acknowledged: false,
        parent_node_id: parentNode.node_id,
        thread
      };
      nodes.push(node);
      nodesByThreadId.set(thread.thread_id, node);
      edges.push({
        edge_id: `parent:${parent.thread_id}:${thread.thread_id}`,
        edge_kind: "parent_thread_id",
        source: parentNode.node_id,
        target: node.node_id,
        parent_thread_id: parent.thread_id,
        child_thread_id: thread.thread_id,
        company_id: parentNode.company_id,
        organization_group_id: thread.organization_group_id
      });
      pending.splice(index, 1);
      progressed = true;
    }
  }

  const nodeByNodeId = new Map(nodes.map((node) => [node.node_id, node]));
  for (const node of nodes.slice().sort((left, right) => right.depth - left.depth)) {
    const directTone = ["active", "waiting", "result"].includes(node.tone) ? node.tone : "unknown";
    node.rollup_tone = strongerOperationalTopologyTone(node.rollup_tone ?? "unknown", directTone);
    if (typeof node.parent_node_id !== "string") continue;
    const parent = nodeByNodeId.get(node.parent_node_id);
    if (parent) {
      parent.rollup_tone = strongerOperationalTopologyTone(parent.rollup_tone ?? "unknown", node.rollup_tone);
    }
  }

  const projectedCompanies = companies.map((company) => ({
      company_id: company.company_id,
      organization_group_id: company.ceo_group_id,
      node_id: `company:${company.company_id}`
    }));
  let projectedNodes = nodes;
  let projectedEdges = edges;
  let visibleCompanies = projectedCompanies;
  if (topologyMode === "live") {
    const actionableTones = new Set(["active", "waiting", "result"]);
    const parentByNodeId = new Map(edges.map((edge) => [edge.target, edge.source]));
    const visibleNodeIds = new Set();
    for (const node of nodes.filter((candidate) => actionableTones.has(candidate.tone))) {
      let currentNodeId = node.node_id;
      while (typeof currentNodeId === "string" && !visibleNodeIds.has(currentNodeId)) {
        visibleNodeIds.add(currentNodeId);
        currentNodeId = parentByNodeId.get(currentNodeId) ?? null;
      }
    }
    const visibleCompanyIds = new Set(nodes
      .filter((node) => node.node_kind === "company_anchor" && visibleNodeIds.has(node.node_id))
      .map((node) => node.company_id));
    projectedNodes = nodes.filter((node) => visibleNodeIds.has(node.node_id));
    projectedEdges = edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));
    visibleCompanies = projectedCompanies.filter((company) => visibleCompanyIds.has(company.company_id));
  }

  return {
    mode: topologyMode,
    companies: visibleCompanies,
    nodes: projectedNodes,
    edges: projectedEdges,
    omitted_transient_thread_ids: [...new Set([
      ...omittedTransientIds,
      ...pending.filter((thread) => includedTransientIds.has(thread.thread_id)).map((thread) => thread.thread_id)
    ])].filter((threadId) => !nodesByThreadId.has(threadId)).sort()
  };
}

export function buildManagerDescendantProjection(threadsInput, managerThreadId) {
  const threads = Array.isArray(threadsInput) ? threadsInput.filter((thread) => typeof thread?.thread_id === "string") : [];
  const byParent = new Map();
  for (const thread of threads) {
    if (thread.parent_thread_id === null || typeof thread.parent_thread_id !== "string") continue;
    const children = byParent.get(thread.parent_thread_id) ?? [];
    children.push(thread);
    byParent.set(thread.parent_thread_id, children);
  }
  const direct_children = (byParent.get(managerThreadId) ?? [])
    .filter((thread) => thread.thread_id !== managerThreadId)
    .sort(sortThreads);
  const descendants = [];
  const visited = new Set([managerThreadId]);
  const pending = [...direct_children];
  while (pending.length > 0) {
    const thread = pending.shift();
    if (!thread || visited.has(thread.thread_id)) continue;
    visited.add(thread.thread_id);
    descendants.push(thread);
    pending.push(...(byParent.get(thread.thread_id) ?? []));
  }
  return {
    direct_children,
    all_descendants: descendants.sort(sortThreads),
    task_descendants: descendants.filter((thread) => thread.thread_kind === "task").sort(sortThreads)
  };
}

// Build project cards only from exact registered manager roots and their exact
// direct manager children. Labels, titles, timestamps, and group proximity do
// not create a reporting relationship.
export function buildProjectManagerCards(managerThreadsInput, threadsInput) {
  const managers = Array.isArray(managerThreadsInput) ? managerThreadsInput : [];
  const threads = Array.isArray(threadsInput) ? threadsInput : [];
  const seen = new Set();
  return managers
    .filter((manager) => (
      typeof manager?.thread_id === "string"
      && manager.thread_kind === "manager"
      && manager.parent_thread_id === null
      && !seen.has(manager.thread_id)
      && seen.add(manager.thread_id)
    ))
    .map((manager) => ({
      manager,
      responsibility_threads: buildManagerDescendantProjection(threads, manager.thread_id)
        .direct_children
        .filter((thread) => (
          thread.thread_kind === "manager"
          && thread.organization_group_id === manager.organization_group_id
        ))
    }));
}

// Resolve scope only by an exact, registered parent_thread_id walk.  This is
// intentionally separate from labels, groups, timestamps, or lifecycle state:
// none of those may promote a thread into a manager's subtree.
export function findExactManagerAncestor(threadsInput, threadId) {
  if (typeof threadId !== "string") return null;
  const byThreadId = new Map(
    (Array.isArray(threadsInput) ? threadsInput : [])
      .filter((thread) => typeof thread?.thread_id === "string")
      .map((thread) => [thread.thread_id, thread])
  );
  const visited = new Set();
  let current = byThreadId.get(threadId) ?? null;
  while (current && !visited.has(current.thread_id)) {
    visited.add(current.thread_id);
    if (current.thread_kind === "manager") return current;
    if (typeof current.parent_thread_id !== "string") return null;
    current = byThreadId.get(current.parent_thread_id) ?? null;
  }
  return null;
}
