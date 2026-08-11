// topology-unified-view.mjs — declared federation is the only structure/identity
// authority. Watchtower W1 is an optional exact-ID/tuple observation overlay.

import { buildTopologyFederationViewModel } from "./topology-federation-view.mjs";
import { buildTopologyViewModel } from "./topology-view.mjs";

export const UNIFIED_TOPOLOGY_CATEGORIES = Object.freeze({
  input: { label: "입력·수집", color: "#5aa7ff" },
  preprocess: { label: "전처리·custody", color: "#4fd1c5" },
  knowledge: { label: "지식·RAG·Wiki", color: "#63c995" },
  advisory: { label: "LLM·Notebook 자문", color: "#a98cff" },
  engine: { label: "SE Engine", color: "#e3b34f" },
  observation: { label: "실행·관측", color: "#ed8b4a" },
});

const PROVIDER_PRESENTATION = Object.freeze({
  watchtower: {
    order: 0, shortLabel: "Watchtower", category: "input", position: { x: 90, y: 90 },
  },
  engineering_engine: {
    order: 1, shortLabel: "Engineering Engine", category: "engine", position: { x: 1000, y: 160 },
  },
  knowledge_stack: {
    order: 2, shortLabel: "Knowledge", category: "knowledge", position: { x: 430, y: 690 },
  },
  watchtower_notebook_advisory_adapter: {
    order: 3, shortLabel: "Notebook advisory", category: "advisory", position: { x: 1260, y: 720 },
  },
});

const HEALTH_RANK = Object.freeze({ down: 5, stale: 4, degraded: 3, ok: 2, unmonitored: 1 });

function unavailable(reason, diagnostics = {}) {
  return {
    available: false,
    reason,
    state: "unavailable",
    nodes: [],
    edges: [],
    source: null,
    providers: [],
    healthSummary: null,
    diagnostics: {
      crossProviderEdgeCount: 0,
      gapLabel: "연결 계약 미선언",
      ...diagnostics,
    },
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactTuple(from, to, flow, label) {
  return `${from}\u0000${to}\u0000${flow}\u0000${label ?? ""}`;
}

function localId(namespacedId, providerId) {
  const prefix = `${providerId}::`;
  return typeof namespacedId === "string" && namespacedId.startsWith(prefix)
    ? namespacedId.slice(prefix.length)
    : null;
}

function categoryForNode(node) {
  if (node.provider_id === "engineering_engine") return "engine";
  if (node.provider_id === "knowledge_stack") return "knowledge";
  if (node.provider_id === "watchtower_notebook_advisory_adapter") return "advisory";
  const group = String(node.group ?? "");
  if (["데이터 평면", "후처리"].includes(group) || node.kind === "store") return "preprocess";
  if (["관측", "게이트", "소비"].includes(group)) return "observation";
  return "input";
}

function providerPresentation(provider, fallbackIndex) {
  const known = PROVIDER_PRESENTATION[provider.id];
  if (known !== undefined) return known;
  return {
    order: 20 + fallbackIndex,
    shortLabel: provider.label,
    category: "observation",
    position: { x: 90 + (fallbackIndex % 2) * 840, y: 90 + Math.floor(fallbackIndex / 2) * 600 },
  };
}

function normaliseExpansion(expansion) {
  const providerIds = new Set(Array.isArray(expansion?.providerIds) ? expansion.providerIds : []);
  const groupKeys = new Set(Array.isArray(expansion?.groupKeys) ? expansion.groupKeys : []);
  return { providerIds, groupKeys };
}

function worstHealth(nodes) {
  const observed = nodes.filter((node) => (node.healthObserved === true || node.healthRetained === true)
    && typeof node.healthState === "string");
  if (observed.length === 0) return null;
  return observed.reduce((worst, node) => (HEALTH_RANK[node.healthState] > HEALTH_RANK[worst]
    ? node.healthState : worst), observed[0].healthState);
}

function providerFlowRanks(nodes, edges) {
  const nodeIds = nodes.map((node) => node.id).sort((left, right) => left.localeCompare(right, "en"));
  const nodeIdSet = new Set(nodeIds);
  const outgoing = new Map(nodeIds.map((id) => [id, []]));
  const indegree = new Map(nodeIds.map((id) => [id, 0]));
  const rank = new Map(nodeIds.map((id) => [id, 0]));
  for (const edge of [...edges].sort((left, right) => left.id.localeCompare(right.id, "en"))) {
    if (!nodeIdSet.has(edge.from) || !nodeIdSet.has(edge.to) || edge.from === edge.to) continue;
    if (outgoing.get(edge.from).includes(edge.to)) continue;
    outgoing.get(edge.from).push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to) + 1);
  }
  const queue = nodeIds.filter((id) => indegree.get(id) === 0);
  const visited = new Set();
  while (queue.length > 0) {
    queue.sort((left, right) => left.localeCompare(right, "en"));
    const current = queue.shift();
    visited.add(current);
    for (const target of [...new Set(outgoing.get(current))].sort((left, right) => left.localeCompare(right, "en"))) {
      rank.set(target, Math.max(rank.get(target), rank.get(current) + 1));
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  const cycleBase = Math.max(0, ...rank.values()) + 1;
  nodeIds.filter((id) => !visited.has(id)).forEach((id, index) => rank.set(id, cycleBase + index));
  return rank;
}

function buildUnifiedLayout(providers, declaredNodes, declaredEdges, expansion) {
  const providerPositions = new Map();
  const groupPositions = new Map();
  const nodePositions = new Map();
  const providerLayouts = providers.map(({ provider }) => {
    const providerNodes = declaredNodes.filter((node) => node.provider_id === provider.id);
    const providerEdges = declaredEdges.filter((edge) => edge.provider_id === provider.id);
    const flowRanks = providerFlowRanks(providerNodes, providerEdges);
    const providerExpanded = expansion.providerIds.has(provider.id);
    let providerBlockWidth = 420;
    let providerBlockHeight = 180;
    const localGroups = [];
    if (providerExpanded) {
      const groups = [...new Set(providerNodes.map((node) => node.group ?? "그룹 없음"))]
        .sort((left, right) => {
          const leftRank = Math.min(...providerNodes.filter((node) => (node.group ?? "그룹 없음") === left)
            .map((node) => flowRanks.get(node.id) ?? 0));
          const rightRank = Math.min(...providerNodes.filter((node) => (node.group ?? "그룹 없음") === right)
            .map((node) => flowRanks.get(node.id) ?? 0));
          return leftRank - rightRank || left.localeCompare(right, "ko");
        });
      let groupCursorY = 190;
      for (const group of groups) {
        const groupKey = `${provider.id}::${group}`;
        const groupNodes = providerNodes
          .filter((node) => (node.group ?? "그룹 없음") === group)
          .sort((left, right) => (flowRanks.get(left.id) ?? 0) - (flowRanks.get(right.id) ?? 0)
            || left.id.localeCompare(right.id, "en"));
        const localNodes = [];
        let groupBlockHeight = 88;
        if (expansion.groupKeys.has(groupKey) && groupNodes.length > 0) {
          const rankOffsets = new Map();
          groupNodes.forEach((node) => {
            const flowRank = flowRanks.get(node.id) ?? 0;
            const offset = rankOffsets.get(flowRank) ?? 0;
            rankOffsets.set(flowRank, offset + 1);
            localNodes.push({
              id: node.id,
              x: 360 + flowRank * 260,
              y: groupCursorY + offset * 118 + (flowRank % 2) * 18,
            });
          });
          groupBlockHeight = Math.max(groupBlockHeight, ...[...rankOffsets.entries()]
            .map(([flowRank, count]) => count * 118 + (flowRank % 2) * 18));
          providerBlockWidth = Math.max(providerBlockWidth, ...localNodes.map((node) => node.x + 226));
        }
        localGroups.push({ groupKey, y: groupCursorY, nodes: localNodes });
        groupCursorY += groupBlockHeight + 64;
      }
      providerBlockHeight = groupCursorY;
    }
    return { provider, width: providerBlockWidth, height: providerBlockHeight, groups: localGroups };
  });
  const leftColumnWidth = Math.max(420, ...providerLayouts
    .filter((_, index) => index % 2 === 0).map((layout) => layout.width));
  const columnX = [90, 90 + leftColumnWidth + 320];
  const columnY = [90, 210];
  providerLayouts.forEach((layout, providerIndex) => {
    const column = providerIndex % 2;
    const providerX = columnX[column];
    const providerY = columnY[column];
    providerPositions.set(layout.provider.id, { x: providerX, y: providerY });
    for (const group of layout.groups) {
      groupPositions.set(group.groupKey, { x: providerX + 80, y: providerY + group.y });
      for (const node of group.nodes) {
        nodePositions.set(node.id, { x: providerX + node.x, y: providerY + node.y });
      }
    }
    columnY[column] += layout.height + 220;
  });
  return { providerPositions, groupPositions, nodePositions };
}

export function toggleUnifiedTopologyExpansion(expansion, target) {
  const current = normaliseExpansion(expansion);
  const providerIds = new Set(current.providerIds);
  const groupKeys = new Set(current.groupKeys);
  if (target?.kind === "provider" && typeof target.providerId === "string") {
    if (providerIds.has(target.providerId)) {
      providerIds.delete(target.providerId);
      for (const key of [...groupKeys]) {
        if (key.startsWith(`${target.providerId}::`)) groupKeys.delete(key);
      }
    } else {
      providerIds.add(target.providerId);
    }
  } else if (target?.kind === "group" && typeof target.groupKey === "string") {
    if (groupKeys.has(target.groupKey)) groupKeys.delete(target.groupKey);
    else groupKeys.add(target.groupKey);
  }
  return {
    providerIds: [...providerIds].sort(),
    groupKeys: [...groupKeys].sort(),
  };
}

export function buildUnifiedTopologyViewModel(federationProjection, healthProjection, expansion = {}) {
  const federation = buildTopologyFederationViewModel(federationProjection);
  if (federation.available !== true || federation.summary === null) {
    return unavailable(federation.reason ?? "federation_unavailable");
  }
  if (federation.summary.runtimeAuthority === true || federation.summary.repairExecutionAuthority === true) {
    return unavailable("authority_boundary_refused", {
      runtimeAuthority: federation.summary.runtimeAuthority,
      repairExecutionAuthority: federation.summary.repairExecutionAuthority,
    });
  }

  const sourceNodes = federation.flattened.nodes;
  const sourceEdges = federation.flattened.edges;
  const providerIds = new Set(federation.providers.map((provider) => provider.id));
  const sourceNodeIds = new Set();
  for (const node of sourceNodes) {
    if (!isPlainObject(node) || typeof node.id !== "string" || sourceNodeIds.has(node.id)
      || typeof node.provider_id !== "string" || !providerIds.has(node.provider_id)
      || !node.id.startsWith(`${node.provider_id}::`)) {
      return unavailable("federation_node_identity_invalid");
    }
    sourceNodeIds.add(node.id);
  }
  const sourceEdgeIds = new Set();
  let crossProviderEdgeCount = 0;
  for (const edge of sourceEdges) {
    if (!isPlainObject(edge) || typeof edge.id !== "string" || sourceEdgeIds.has(edge.id)
      || typeof edge.provider_id !== "string" || !providerIds.has(edge.provider_id)
      || !edge.id.startsWith(`${edge.provider_id}::`) || !sourceNodeIds.has(edge.from)
      || !sourceNodeIds.has(edge.to)) {
      return unavailable("federation_edge_identity_invalid");
    }
    sourceEdgeIds.add(edge.id);
    const fromProvider = sourceNodes.find((node) => node.id === edge.from)?.provider_id;
    const toProvider = sourceNodes.find((node) => node.id === edge.to)?.provider_id;
    if (fromProvider !== edge.provider_id || toProvider !== edge.provider_id || fromProvider !== toProvider) {
      crossProviderEdgeCount += 1;
    }
  }
  if (crossProviderEdgeCount > 0) {
    return unavailable("cross_provider_edge_refused", { crossProviderEdgeCount });
  }

  const healthModel = buildTopologyViewModel(healthProjection?.snapshot ?? null);
  const healthRefreshState = typeof healthProjection?.refresh_state === "string"
    ? healthProjection.refresh_state : "absent";
  const healthOverlayCurrent = healthModel.available && healthRefreshState === "ready";
  const healthNodes = healthModel.available
    ? healthModel.nodes.filter((node) => node.kind !== "lane")
    : [];
  const healthNodeByExactId = new Map(healthNodes.map((node) => [node.id, node]));
  const watchtowerSourceIds = new Set(sourceNodes
    .filter((node) => node.provider_id === "watchtower")
    .map((node) => localId(node.id, "watchtower")));
  const unmatchedHealthIds = healthNodes.map((node) => node.id)
    .filter((id) => !watchtowerSourceIds.has(id)).sort();
  const missingWatchtowerIds = [...watchtowerSourceIds]
    .filter((id) => !healthNodeByExactId.has(id)).sort();

  const healthEdgesByTuple = new Map();
  if (healthModel.available && Array.isArray(healthProjection?.snapshot?.edges)) {
    for (let index = 0; index < healthProjection.snapshot.edges.length; index += 1) {
      const raw = healthProjection.snapshot.edges[index];
      const normalised = healthModel.edges[index];
      healthEdgesByTuple.set(exactTuple(raw.from, raw.to, raw.flow, raw.label), normalised);
    }
  }

  const declaredNodes = sourceNodes.map((node) => {
    const exactHealth = node.provider_id === "watchtower"
      ? healthNodeByExactId.get(localId(node.id, "watchtower")) ?? null
      : null;
    const exactHealthObserved = exactHealth?.healthObserved === true;
    const retainedHealthObservation = exactHealthObserved && !healthOverlayCurrent;
    return {
      ...node,
      sourceId: node.id,
      category: categoryForNode(node),
      healthState: retainedHealthObservation ? "stale" : exactHealth?.state ?? null,
      healthStateLabel: retainedHealthObservation
        ? `W1 ${healthRefreshState.toUpperCase()} · 보존 관측`
        : exactHealth?.stateLabel ?? "런타임 미관측",
      healthMatched: exactHealth !== null,
      healthObserved: healthOverlayCurrent && exactHealthObserved,
      healthRetained: retainedHealthObservation,
      healthAgeLabel: exactHealth?.ageLabel ?? null,
      healthReasons: exactHealth?.reasons ?? [],
      healthEvidenceScope: exactHealth?.evidenceScope ?? null,
      runtimeState: exactHealth === null || !exactHealthObserved
        ? "unknown" : retainedHealthObservation ? healthRefreshState : exactHealth.state,
    };
  });
  const declaredNodeById = new Map(declaredNodes.map((node) => [node.id, node]));
  const declaredEdges = sourceEdges.map((edge) => {
    const fromLocal = localId(edge.from, edge.provider_id);
    const toLocal = localId(edge.to, edge.provider_id);
    const exactReceipt = edge.provider_id === "watchtower" && fromLocal !== null && toLocal !== null
      ? healthEdgesByTuple.get(exactTuple(fromLocal, toLocal, edge.relation, edge.label)) ?? null
      : null;
    return {
      ...edge,
      sourceId: edge.id,
      receiptMatched: exactReceipt !== null,
      receiptObserved: healthOverlayCurrent && exactReceipt?.deliveryProven === true,
      receiptState: exactReceipt?.deliveryState ?? null,
      receiptReason: exactReceipt?.deliveryReason ?? null,
      receiptEvidenceScope: exactReceipt?.evidenceScope ?? null,
    };
  });

  const current = normaliseExpansion(expansion);
  const providers = federation.providers
    .map((provider, index) => ({ provider, presentation: providerPresentation(provider, index) }))
    .sort((left, right) => left.presentation.order - right.presentation.order
      || left.provider.id.localeCompare(right.provider.id, "en"));
  const layout = buildUnifiedLayout(providers, declaredNodes, declaredEdges, current);
  const visibleNodes = [];
  const visibleSourceNodeIds = new Set();
  for (const { provider, presentation } of providers) {
    const providerNodes = declaredNodes.filter((node) => node.provider_id === provider.id);
    const expanded = current.providerIds.has(provider.id);
    visibleNodes.push({
      id: `sector::${provider.id}`,
      displayKind: "provider",
      providerId: provider.id,
      label: presentation.shortLabel,
      detail: `${providerNodes.length} nodes · ${declaredEdges.filter((edge) => edge.provider_id === provider.id).length} edges`,
      category: presentation.category,
      position: layout.providerPositions.get(provider.id),
      expanded,
      healthState: provider.id === "watchtower" ? worstHealth(providerNodes) : null,
      healthObserved: provider.id === "watchtower" && providerNodes.some((node) => node.healthObserved),
      healthRetained: provider.id === "watchtower" && providerNodes.some((node) => node.healthRetained),
      runtimeState: provider.id === "watchtower"
        && providerNodes.some((node) => node.healthObserved || node.healthRetained)
        ? healthRefreshState : "unknown",
      declaredStatus: provider.declaredStatus,
      claimCeiling: provider.claimCeiling,
      sourceNodeCount: providerNodes.length,
      sourceEdgeCount: declaredEdges.filter((edge) => edge.provider_id === provider.id).length,
    });
    if (!expanded) continue;
    const groups = [...new Set(providerNodes.map((node) => node.group ?? "그룹 없음"))].sort((a, b) => a.localeCompare(b, "ko"));
    groups.forEach((group) => {
      const groupKey = `${provider.id}::${group}`;
      const groupNodes = providerNodes.filter((node) => (node.group ?? "그룹 없음") === group);
      const position = layout.groupPositions.get(groupKey);
      const groupExpanded = current.groupKeys.has(groupKey);
      const category = groupNodes.reduce((counts, node) => {
        counts.set(node.category, (counts.get(node.category) ?? 0) + 1);
        return counts;
      }, new Map());
      const categoryName = [...category.entries()].sort((left, right) => right[1] - left[1]
        || left[0].localeCompare(right[0], "en"))[0]?.[0] ?? presentation.category;
      visibleNodes.push({
        id: `group::${groupKey}`,
        displayKind: "group",
        providerId: provider.id,
        groupKey,
        label: group,
        detail: `${groupNodes.length} nodes`,
        category: categoryName,
        position,
        expanded: groupExpanded,
        healthState: provider.id === "watchtower" ? worstHealth(groupNodes) : null,
        healthObserved: provider.id === "watchtower" && groupNodes.some((node) => node.healthObserved),
        healthRetained: provider.id === "watchtower" && groupNodes.some((node) => node.healthRetained),
        runtimeState: provider.id === "watchtower"
          && groupNodes.some((node) => node.healthObserved || node.healthRetained)
          ? healthRefreshState : "unknown",
        sourceNodeCount: groupNodes.length,
      });
      if (!groupExpanded) return;
      groupNodes.sort((left, right) => left.id.localeCompare(right.id, "en")).forEach((node) => {
        visibleSourceNodeIds.add(node.id);
        visibleNodes.push({
          id: node.id,
          displayKind: "node",
          providerId: provider.id,
          groupKey,
          label: node.label,
          detail: `${node.kind} · ${node.layer}`,
          category: node.category,
          position: layout.nodePositions.get(node.id),
          expanded: false,
          healthState: node.healthState,
          healthStateLabel: node.healthStateLabel,
          healthObserved: node.healthObserved,
          healthRetained: node.healthRetained,
          healthAgeLabel: node.healthAgeLabel,
          healthReasons: node.healthReasons,
          healthEvidenceScope: node.healthEvidenceScope,
          runtimeState: node.runtimeState,
          sourceNodeCount: 1,
          source: node,
        });
      });
    });
  }
  const visibleEdges = declaredEdges.filter((edge) => visibleSourceNodeIds.has(edge.from)
    && visibleSourceNodeIds.has(edge.to)).map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    label: edge.label,
    relation: edge.relation,
    category: declaredNodeById.get(edge.from)?.category ?? "observation",
    receiptObserved: edge.receiptObserved,
    receiptState: edge.receiptState,
    receiptReason: edge.receiptReason,
    evidenceMode: edge.evidence_mode,
  }));

  const healthSummary = Object.fromEntries(["ok", "degraded", "stale", "down", "unmonitored"]
    .map((state) => [state, declaredNodes.filter((node) => node.provider_id === "watchtower"
      && node.healthState === state).length]));
  return {
    available: true,
    reason: federation.reason,
    state: federation.state,
    nodes: visibleNodes,
    edges: visibleEdges,
    providers: providers.map(({ provider, presentation }) => ({
      id: provider.id,
      label: presentation.shortLabel,
      category: presentation.category,
      nodeCount: provider.nodeCount,
      edgeCount: provider.edgeCount,
      declaredStatus: provider.declaredStatus,
      claimCeiling: provider.claimCeiling,
      runtimeState: provider.id === "watchtower" && declaredNodes.some((node) => node.provider_id === "watchtower"
        && (node.healthObserved || node.healthRetained))
        ? healthRefreshState : "unknown",
      healthObserved: provider.id === "watchtower"
        && declaredNodes.some((node) => node.provider_id === "watchtower" && node.healthObserved),
      healthRetained: provider.id === "watchtower"
        && declaredNodes.some((node) => node.provider_id === "watchtower" && node.healthRetained),
    })),
    source: {
      providerCount: federation.summary.providerCount,
      nodeCount: federation.summary.nodeCount,
      edgeCount: federation.summary.edgeCount,
      providerIds: federation.providers.map((provider) => provider.id).sort(),
      nodeIds: [...sourceNodeIds].sort(),
      edgeIds: [...sourceEdgeIds].sort(),
      runtimeAuthority: false,
      repairExecutionAuthority: false,
    },
    healthSummary,
    healthRefreshState,
    diagnostics: {
      gapLabel: "연결 계약 미선언",
      crossProviderEdgeCount: 0,
      matchedHealthNodeCount: declaredNodes.filter((node) => node.provider_id === "watchtower" && node.healthMatched).length,
      watchtowerDeclaredNodeCount: watchtowerSourceIds.size,
      unmatchedHealthIds,
      missingWatchtowerIds,
      w1Available: healthModel.available,
      w1Current: healthOverlayCurrent,
      w1ObservedAt: healthModel.observedAt,
      receiptOverlayCount: declaredEdges.filter((edge) => edge.receiptMatched).length,
      receiptDeliveryProvenCount: declaredEdges.filter((edge) => edge.receiptObserved).length,
    },
    expansion: {
      providerIds: [...current.providerIds].sort(),
      groupKeys: [...current.groupKeys].sort(),
    },
  };
}
