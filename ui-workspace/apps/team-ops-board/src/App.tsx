import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { Background, BackgroundVariant, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Activity,
  AlertCircle,
  AudioLines,
  ArchiveRestore,
  Building2,
  Check,
  CircleCheckBig,
  ChevronDown,
  ChevronRight,
  CircleDot,
  CircleHelp,
  Clock3,
  Cloud,
  Cpu,
  Database,
  EyeOff,
  FolderOpen,
  Gauge,
  History,
  Inbox,
  ListChecks,
  Mail,
  MessageSquare,
  Monitor,
  PanelsTopLeft,
  Radio,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  UserRound,
  UsersRound,
  Workflow,
  X
} from "lucide-react";

import codexBrandIconUrl from "@lobehub/icons-static-svg/icons/codex-color.svg";
import notebookLmBrandIconUrl from "@lobehub/icons-static-svg/icons/notebooklm.svg";
import oneDriveBrandIconUrl from "./assets/topology/microsoft-onedrive.svg";
import slackBrandIconUrl from "./assets/topology/slack.svg";
import { siGmail, siGoogledrive } from "simple-icons";

import { aiUsageProjectionRequest } from "./core/ai-usage-projection-request.mjs";
import { createUnmeasuredAiUsageSnapshot } from "./core/ai-usage-snapshot.mjs";
import { buildClaudeQuotaPresentation, selectCodexRateLimitObservation } from "./core/provider-limits.mjs";
import { monotoneAreaPath, monotoneLinePath } from "./core/monotone-area.mjs";
import { UNMEASURED_REQUEST_FAMILY_LABELS } from "./core/ai-usage-history-snapshot.mjs";
import {
  LIVE_THREAD_POLL_INTERVAL_MS,
  acknowledgeLiveThread,
  buildCompactOrganizationLanes,
  buildManagerDescendantProjection,
  buildOperationalOrganizationTopology,
  buildProjectManagerCards,
  findExactManagerAncestor,
  groupLiveThreadsByOrganization,
  isLiveThreadAcknowledged,
  liveThreadProjectionRequest,
  restoreLiveThread,
  selectOwnerAttentionThreads,
  selectLiveThreadView
} from "./core/live-thread-board.mjs";
import {
  createUnavailableLiveThreadProjection,
  isAcknowledgeableLiveThread,
  liveThreadRoleLabel,
  liveThreadResultStateLabel,
  liveThreadStatusLabel,
  liveThreadStatusPriority,
  organizationGroupLabel
} from "./core/live-thread-projection.mjs";
import {
  MOBILE_DETAIL_MEDIA_QUERY,
  isFocusRestoreCandidate
} from "./core/mobile-detail.mjs";
import { readCollapsedPanelIds, setPanelCollapsed } from "./core/panel-collapse.mjs";
import { buildTopologyConnectionDiagnostic, isTopologyDiagnosticNode } from "./core/topology-connection-diagnostics.mjs";
import { buildTopologyRecoverySupervision } from "./core/topology-recovery-view.mjs";
import { buildTopologyStructuralPaths, buildTopologyViewModel } from "./core/topology-view.mjs";
import { buildEngineeringClassicTopologyViewModel } from "./core/topology-engine-classic-view.mjs";
import {
  TOPOLOGY_FEDERATION_DOES_NOT_PROVE_LABELS,
  buildTopologyFederationViewModel,
  selectTopologyFederationProvider,
} from "./core/topology-federation-view.mjs";
import {
  UNIFIED_TOPOLOGY_CATEGORIES,
  buildUnifiedTopologyViewModel,
  toggleUnifiedTopologyExpansion,
} from "./core/topology-unified-view.mjs";
import { buildHostStatsViewModel } from "./core/host-stats.mjs";
import {
  ANTIGRAVITY_QUOTA_SCHEMA_VERSION,
  ANTIGRAVITY_QUOTA_STATUS_SCHEMA_VERSION,
  antigravityQuotaRows,
  quotaSeverityForRemaining,
} from "./core/antigravity-quota.mjs";
import {
  buildOrganizationUsageChartRows,
  buildProjectUsageChartRows,
  buildRealtimeStatusBuckets,
  countRealtimeConnectedSessions,
  formatRealtimeCoverage,
  isOrganizationUsageAttributionReady,
  liveProjectionLoadPresentation,
  observationGapBreakdown,
  paginateExactItems,
  realtimeThreadConnectionPresentation,
  realtimeStatusCopy,
  resolveLiveProjectionRefresh,
} from "./core/live-thread-ui-model.mjs";

type BoardView = "active" | "history";
type BoardSurface = "owner" | "organization" | "work" | "system";

function compactClock(value: string | null): string {
  if (value === null) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return [parsed.getHours(), parsed.getMinutes(), parsed.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

const SURFACE_WORDMARKS: Record<BoardSurface, string> = {
  owner: "FLEET MONITOR",
  organization: "ORG TOPOLOGY",
  work: "LEDGER",
  system: "SYSTEM TOPOLOGY",
};

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const date = `${now.getFullYear()}. ${String(now.getMonth() + 1).padStart(2, "0")}. ${String(now.getDate()).padStart(2, "0")}.`;
  return (
    <span className="live-board-clock" aria-hidden="true">
      <strong>{hh}:{mm}<small>:{ss}</small></strong>
      <span>{date}</span>
    </span>
  );
}
type OrganizationSubview = "tree" | "flow";
type OrganizationTopologyMode = "live" | "all";

const MOBILE_DETAIL_QUERY = MOBILE_DETAIL_MEDIA_QUERY;
const ORGANIZATION_TOPOLOGY_MODE_STORAGE_KEY = "soulforge.workspace_board.organization_topology_mode.v1";

function canRestoreFocus(node: HTMLElement | null): node is HTMLElement {
  const disabled = Boolean(node && "disabled" in node && (node as HTMLButtonElement).disabled);
  return Boolean(node && isFocusRestoreCandidate({
    exists: true,
    isConnected: node.isConnected,
    disabled,
    hidden: node.hidden || node.getAttribute("aria-hidden") === "true",
    inert: node.inert || Boolean(node.closest("[inert]"))
  }));
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function usePersistentPanelCollapse(panelId: string) {
  const [collapsed, setCollapsed] = useState(() => readCollapsedPanelIds(browserStorage()).has(panelId));
  const toggle = () => {
    setCollapsed((current) => {
      const next = !current;
      setPanelCollapsed(browserStorage(), panelId, next);
      return next;
    });
  };
  return { collapsed, toggle };
}

function PanelCollapseButton({ panelId, label, collapsed, onToggle }: {
  panelId: string;
  label: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="panel-collapse-button"
      aria-expanded={!collapsed}
      aria-controls={`panel-collapse-${panelId.replace(/[^a-z0-9_-]/giu, "-")}`}
      aria-label={`${label} ${collapsed ? "펼치기" : "접기"}`}
      title={collapsed ? "펼치기" : "접기"}
      onClick={onToggle}
      data-testid={`panel-collapse-${panelId}`}
    >
      {collapsed ? <ChevronRight size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
      <span>{collapsed ? "펼치기" : "접기"}</span>
    </button>
  );
}

function CollapsiblePanelBody({ panelId, collapsed, children }: { panelId: string; collapsed: boolean; children: any }) {
  return <div id={`panel-collapse-${panelId.replace(/[^a-z0-9_-]/giu, "-")}`} className="panel-collapse-body" hidden={collapsed}>{children}</div>;
}

function formatRefreshTime(value: string | null) {
  if (!value) return "아직 갱신되지 않음";
  const time = new Date(value);
  if (Number.isNaN(time.valueOf())) return "시간 미확정";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(time);
}

function resultGateHealthLabel(value: string) {
  const labels: Record<string, string> = {
    available: "명시 게이트 적용",
    missing: "미구성 · idle 미확정",
    invalid: "무효 · fail-closed",
    disabled: "비상 중지"
  };
  return labels[value] ?? "미확정";
}

function lifecycleSourceHealthLabel(value: string) {
  const labels: Record<string, string> = {
    available: "\uc0ac\uc6a9 \uac00\ub2a5",
    hold: "\ub300\uae30 \u00b7 fail-closed",
    missing: "\ubbf8\uad6c\uc131",
    invalid: "\ubb34\ud6a8 \u00b7 fail-closed",
    disabled: "\ube44\uc0c1 \uc911\uc9c0",
    stale: "\uc624\ub798\ub41c \uc2a4\ub0c5\uc0f7"
  };
  return labels[value] ?? "\ubbf8\ud655\uc815";
}

function hasExactObservedActiveLifecycle(thread: any) {
  return typeof thread?.thread_id === "string" && thread.status === "active";
}

function isActiveTaskThread(thread: any) {
  return thread?.thread_kind === "task" && thread?.status === "active";
}

const OPERATIONAL_TOPOLOGY_NODE_WIDTH = 196;
const OPERATIONAL_TOPOLOGY_NODE_HEIGHT = 76;
const OPERATIONAL_TOPOLOGY_COLUMN_GAP = 238;
const OPERATIONAL_TOPOLOGY_LANE_GAP = 26;

function topologyToneLabel(tone: string) {
  return {
    active: "실행 중",
    waiting: "입력·승인 대기",
    result: "결과 확인",
    unknown: "관측 불가"
  }[tone] ?? "정확한 연결";
}

function topologyNodeRoleLabel(data: any) {
  if (data.node_kind === "company_anchor") return "회사 / CEO";
  if (data.node_kind === "manager_anchor") return "팀장";
  if (data.node_kind === "responsibility_anchor") return "책임자";
  if (data.node_kind === "context_thread") return "상위 연결";
  if (data.thread_kind === "manager") return "책임자";
  if (data.thread_kind === "verifier") return "독립 검토자";
  if (data.thread_kind === "task") return "TASK";
  return "작업";
}

function topologyNodeStateLabel(data: any) {
  if (data.node_kind === "context_thread") {
    return data.rollup_tone && data.rollup_tone !== "unknown"
      ? `하위 ${topologyToneLabel(data.rollup_tone)}`
      : "정확한 연결";
  }
  if (["manager_anchor", "responsibility_anchor"].includes(data.node_kind) && data.tone === "unknown" && data.rollup_tone && data.rollup_tone !== "unknown") {
    return `하위 ${topologyToneLabel(data.rollup_tone)}`;
  }
  if (data.node_kind === "manager_anchor" && data.tone === "unknown") return "고정 기준점";
  if (data.node_kind === "responsibility_anchor" && data.tone === "unknown") return "고정 책임자";
  return topologyToneLabel(data.tone);
}

function OrganizationTopologyNode({ data }: NodeProps<any>) {
  const rollupTone = data.rollup_tone && data.rollup_tone !== "unknown" ? data.rollup_tone : null;
  const nodeTone = data.node_kind === "context_thread"
    ? "context"
    : ["manager_anchor", "responsibility_anchor"].includes(data.node_kind) && data.tone === "unknown" && rollupTone
      ? rollupTone
      : data.tone;
  return (
    <div className={`organization-topology-node organization-topology-node-${data.node_kind} is-${nodeTone} ${data.is_selected ? "is-selected" : ""}`}>
      <Handle type="target" position={Position.Left} isConnectable={false} aria-hidden="true" />
      <button
        type="button"
        className="organization-topology-node-button nodrag nopan"
        aria-pressed={data.is_selected}
        aria-label={`${data.company_label ? `${data.company_label} · ` : ""}${data.display_label} · ${topologyNodeStateLabel(data)}`}
        data-live-thread-id={data.thread_id ?? undefined}
        data-testid={data.test_id}
        onClick={(event) => data.onActivate(event.currentTarget)}
      >
        <span className="organization-topology-node-kicker">
          <span>{topologyNodeRoleLabel(data)}</span>
          {rollupTone && <span className={`organization-topology-rollup-badge is-${rollupTone}`} aria-label={`하위 ${topologyToneLabel(rollupTone)}`}>하위</span>}
        </span>
        <strong>{data.company_label ?? data.display_label}</strong>
        {data.company_label ? <small>{data.display_label}</small> : <small>{topologyNodeStateLabel(data)}</small>}
      </button>
      <Handle type="source" position={Position.Right} isConnectable={false} aria-hidden="true" />
    </div>
  );
}

const organizationTopologyNodeTypes = { organizationTopology: OrganizationTopologyNode };

function buildOperationalTopologyCanvas(
  topology: any,
  selectedGroupId: string | null,
  selectedThreadId: string | null,
  onSelectGroup: (groupId: string) => void,
  onSelect: (threadId: string, trigger: HTMLButtonElement) => void
) {
  const topologyNodes: any[] = Array.isArray(topology?.nodes) ? topology.nodes as any[] : [];
  const topologyEdges: any[] = Array.isArray(topology?.edges) ? topology.edges as any[] : [];
  const nodesById = new Map<string, any>(topologyNodes.map((node: any): [string, any] => [node.node_id, node]));
  const childrenByNodeId = new Map<string, string[]>();
  for (const edge of topologyEdges.filter((edge: any) => edge.edge_kind === "parent_thread_id")) {
    const children = childrenByNodeId.get(edge.source) ?? [];
    children.push(edge.target);
    childrenByNodeId.set(edge.source, children);
  }
  for (const children of childrenByNodeId.values()) {
    children.sort((left, right) => String(nodesById.get(left)?.thread_id ?? left).localeCompare(String(nodesById.get(right)?.thread_id ?? right)));
  }
  const positions = new Map<string, { x: number; y: number }>();
  const placeDescendantLane = (nodeId: string, y: number, visited = new Set<string>()): number => {
    if (visited.has(nodeId)) return OPERATIONAL_TOPOLOGY_NODE_HEIGHT;
    const node = nodesById.get(nodeId);
    if (!node) return OPERATIONAL_TOPOLOGY_NODE_HEIGHT;
    const nextVisited = new Set(visited);
    nextVisited.add(nodeId);
    positions.set(nodeId, {
      x: 252 + Math.max(0, Number(node.depth ?? 1) - 1) * OPERATIONAL_TOPOLOGY_COLUMN_GAP,
      y
    });
    const children = childrenByNodeId.get(nodeId) ?? [];
    if (children.length === 0) return OPERATIONAL_TOPOLOGY_NODE_HEIGHT;
    let childY = y;
    for (const childId of children) {
      const childHeight = placeDescendantLane(childId, childY, nextVisited);
      childY += childHeight + OPERATIONAL_TOPOLOGY_LANE_GAP;
    }
    return Math.max(OPERATIONAL_TOPOLOGY_NODE_HEIGHT, childY - y - OPERATIONAL_TOPOLOGY_LANE_GAP);
  };

  let companyY = 24;
  for (const company of (Array.isArray(topology?.companies) ? topology.companies as any[] : [])) {
    const companyNode = nodesById.get(company.node_id);
    if (companyNode) positions.set(companyNode.node_id, { x: 24, y: companyY });
    const managers = topologyNodes
      .filter((node: any) => node.node_kind === "manager_anchor" && node.company_id === company.company_id)
      .sort((left: any, right: any) => String(left.thread_id).localeCompare(String(right.thread_id)));
    if (managers.length === 0) {
      companyY += OPERATIONAL_TOPOLOGY_NODE_HEIGHT + OPERATIONAL_TOPOLOGY_LANE_GAP * 2;
      continue;
    }
    for (const manager of managers) {
      positions.set(manager.node_id, { x: 252, y: companyY });
      const children = childrenByNodeId.get(manager.node_id) ?? [];
      let childY = companyY;
      for (const childId of children) {
        const childHeight = placeDescendantLane(childId, childY);
        childY += childHeight + OPERATIONAL_TOPOLOGY_LANE_GAP;
      }
      const laneHeight = children.length > 0
        ? Math.max(OPERATIONAL_TOPOLOGY_NODE_HEIGHT, childY - companyY - OPERATIONAL_TOPOLOGY_LANE_GAP)
        : OPERATIONAL_TOPOLOGY_NODE_HEIGHT;
      companyY += laneHeight + OPERATIONAL_TOPOLOGY_LANE_GAP;
    }
    companyY += OPERATIONAL_TOPOLOGY_LANE_GAP;
  }

  const graphNodes = topologyNodes
    .filter((node: any) => positions.has(node.node_id))
    .map((node: any) => ({
      id: node.node_id,
      type: "organizationTopology",
      position: positions.get(node.node_id),
      draggable: false,
      selectable: false,
      focusable: false,
      data: {
        ...node,
        is_selected: node.node_kind === "company_anchor"
          ? node.organization_group_id === selectedGroupId
          : node.thread_id === selectedThreadId,
        test_id: node.node_kind === "company_anchor"
          ? `organization-topology-company-${node.company_id}`
          : `organization-topology-thread-${node.thread_id}`,
        onActivate: (trigger: HTMLButtonElement) => {
          if (node.node_kind === "company_anchor") {
            onSelectGroup(node.organization_group_id);
            return;
          }
          onSelectGroup(node.organization_group_id);
          onSelect(node.thread_id, trigger);
        }
      },
      style: { width: OPERATIONAL_TOPOLOGY_NODE_WIDTH, height: OPERATIONAL_TOPOLOGY_NODE_HEIGHT }
    }));
  const graphEdges = topologyEdges
    .filter((edge: any) => positions.has(edge.source) && positions.has(edge.target))
    .map((edge: any) => {
      const target = nodesById.get(edge.target);
      const tone = target?.node_kind === "context_thread" ? target.rollup_tone : target?.tone;
      const stroke = edge.edge_kind === "organization_authority"
        ? "#54717c"
        : tone === "active"
          ? "#70d98c"
          : tone === "waiting"
            ? "#e3aa62"
            : tone === "result"
              ? "#6faee9"
              : "#526973";
      return {
        id: edge.edge_id,
        source: edge.source,
        target: edge.target,
        type: "smoothstep",
        animated: false,
        selectable: false,
        focusable: false,
        pathOptions: { borderRadius: 18, offset: 14 },
        style: { stroke, strokeWidth: 1.25 }
      };
    });
  return { graphNodes, graphEdges };
}

const PROVIDER_POLL_INTERVAL_MS = 30_000;
const PROVIDER_POLL_TIMEOUT_MS = 12_000;

type ProviderRefreshState = "ready" | "refreshing" | "hold";

function createProviderSnapshots(refreshState: ProviderRefreshState = "hold") {
  return {
    antigravity: null,
    antigravityQuota: null,
    limits: null,
    refresh_state: refreshState,
  };
}

function retainStaleProviderLimits(snapshot: any) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const official = snapshot.claude_official;
  if (!official || typeof official !== "object") return snapshot;
  return {
    ...snapshot,
    claude_official: {
      ...official,
      capture_status: "hold",
      freshness: "stale",
    },
  };
}

function retainStaleAntigravityQuota(snapshot: any) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  return { ...snapshot, freshness: "stale" };
}

function retainStaleAntigravityUsage(snapshot: any) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  return { ...snapshot, stale: true };
}

function App() {
  const [projection, setProjection] = useState<any>(() =>
    createUnavailableLiveThreadProjection({ health: "unavailable", enrollmentHealth: "missing" })
  );
  const [surface, setSurface] = useState<BoardSurface>("owner");
  const [organizationSubview, setOrganizationSubview] = useState<OrganizationSubview>("tree");
  const [selectedOrganizationGroupId, setSelectedOrganizationGroupId] = useState<string | null>(null);
  const [view, setView] = useState<BoardView>("active");
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [isMobileDetail, setIsMobileDetail] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_DETAIL_QUERY).matches
  );
  const [refreshing, setRefreshing] = useState(false);
  const [initialProjectionPending, setInitialProjectionPending] = useState(true);
  const [refreshFailure, setRefreshFailure] = useState<"unavailable" | "error" | "lifecycle_hold" | null>(null);
  const [acknowledgementRevision, setAcknowledgementRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const [expandedThreadIds, setExpandedThreadIds] = useState<Set<string>>(() => new Set());
  const [aiUsageProjection, setAiUsageProjection] = useState(() => ({
    state: "unmeasured",
    snapshot: createUnmeasuredAiUsageSnapshot(),
    reconciliation: null
  }));
  const [aiUsagePending, setAiUsagePending] = useState(true);
  const [topologyProjection, setTopologyProjection] = useState<any>(null);
  const [topologyFederationProjection, setTopologyFederationProjection] = useState<any>(null);
  const [topologyRefreshing, setTopologyRefreshing] = useState(false);
  const topologyRefreshRef = useRef<(force?: boolean) => Promise<any> | void>(() => {});
  const [hostStatsSnapshot, setHostStatsSnapshot] = useState<any>(null);
  const [providerSnapshots, setProviderSnapshots] = useState<any>(() => createProviderSnapshots());

  useEffect(() => {
    if (surface !== "owner") return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/host-stats.snapshot.json");
        if (!cancelled && response.ok) setHostStatsSnapshot(await response.json());
      } catch {
        // 마지막 정상 샘플 유지 — 호스트 스탯은 보조 표시라 오류를 띄우지 않는다.
      }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [surface]);

  // Fleet 카드와 System Topology 연결 진단은 같은 loopback 수신면을 읽는다.
  // 표면 전환마다 폴링이 재시작되지 않도록 두 표면을 하나의 게이트로 묶는다.
  const providerPollingEnabled = surface === "owner" || surface === "system";

  useEffect(() => {
    if (!providerPollingEnabled) return undefined;
    let cancelled = false;
    let generation = 0;
    let inFlight: Promise<void> | null = null;
    const controllers = new Set<AbortController>();
    const publish = (requestGeneration: number, update: any) => {
      if (!cancelled && requestGeneration === generation) {
        setProviderSnapshots((previous: any) => typeof update === "function" ? update(previous) : update);
      }
    };
    const fetchJson = async (url: string) => {
      const controller = new AbortController();
      controllers.add(controller);
      const timeout = window.setTimeout(() => controller.abort(), PROVIDER_POLL_TIMEOUT_MS);
      try {
        const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) return null;
        return await response.json();
      } catch {
        return null;
      } finally {
        window.clearTimeout(timeout);
        controllers.delete(controller);
      }
    };
    const load = (): Promise<void> => {
      if (inFlight !== null) return inFlight;
      const requestGeneration = ++generation;
      // Keep last-known per-provider evidence visible while a refresh is pending.
      publish(requestGeneration, (previous: any) => ({ ...previous, refresh_state: "refreshing" }));
      const operation = Promise.all([
        fetchJson("/antigravity-usage.snapshot.json"),
        fetchJson("/antigravity-quota.snapshot.json"),
        fetchJson("/provider-limits.snapshot.json"),
      ]).then(([antigravity, antigravityQuota, limits]) => {
        const complete = [antigravity, antigravityQuota, limits]
          .every((snapshot) => snapshot !== null && snapshot !== undefined);
        publish(requestGeneration, (previous: any) => ({
          antigravity: antigravity ?? retainStaleAntigravityUsage(previous?.antigravity ?? null),
          antigravityQuota: antigravityQuota ?? retainStaleAntigravityQuota(previous?.antigravityQuota ?? null),
          limits: limits ?? retainStaleProviderLimits(previous?.limits ?? null),
          refresh_state: complete ? "ready" : "hold",
        }));
      }).catch(() => {
        publish(requestGeneration, (previous: any) => ({
          antigravity: retainStaleAntigravityUsage(previous?.antigravity ?? null),
          antigravityQuota: retainStaleAntigravityQuota(previous?.antigravityQuota ?? null),
          limits: retainStaleProviderLimits(previous?.limits ?? null),
          refresh_state: "hold",
        }));
      });
      inFlight = operation;
      void operation.finally(() => {
        if (inFlight === operation) inFlight = null;
      });
      return operation;
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, PROVIDER_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      generation += 1;
      for (const controller of controllers) controller.abort();
      controllers.clear();
      window.clearInterval(timer);
    };
  }, [providerPollingEnabled]);

  useEffect(() => {
    if (surface !== "system" && surface !== "owner") return undefined;
    let cancelled = false;
    const load = async (force = false) => {
      setTopologyRefreshing(true);
      try {
        const response = await fetch(`/topology-health.snapshot.json${force ? "?refresh=1" : ""}`);
        if (!response.ok) throw new Error("topology_projection_unavailable");
        const nextProjection = await response.json();
        if (!cancelled) setTopologyProjection(nextProjection);
        return nextProjection;
      } catch {
        // A retained display must remain explicitly HOLD, never an implied current success.
        if (!cancelled) {
          setTopologyProjection((previous: any) => previous === null ? previous : { ...previous, refresh_state: "hold" });
        }
        return null;
      } finally {
        if (!cancelled) setTopologyRefreshing(false);
      }
    };
    topologyRefreshRef.current = load;
    void load(false);
    const timer = window.setInterval(() => { void load(false); }, 30_000);
    return () => {
      cancelled = true;
      if (topologyRefreshRef.current === load) topologyRefreshRef.current = () => {};
      window.clearInterval(timer);
    };
  }, [surface]);

  // 선언 구조는 tracked artifact 한 개다. health 처럼 주기 관측할 대상이 아니므로
  // 표면 진입 시 한 번만 읽고, 실패는 조용한 성공이 아니라 명시 상태로 남긴다.
  useEffect(() => {
    if (surface !== "system") return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/topology-federation.snapshot.json", { cache: "no-store" });
        if (!response.ok) throw new Error("topology_federation_unavailable");
        const nextProjection = await response.json();
        if (!cancelled) setTopologyFederationProjection(nextProjection);
      } catch {
        if (!cancelled) {
          setTopologyFederationProjection((previous: any) => (
            previous?.snapshot
              ? { ...previous, state: "stale", reason: "federation_fetch_failed" }
              : { lens: "declared_structure", state: "unavailable", reason: "federation_fetch_failed", snapshot: null }
          ));
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [surface]);
  const detailRef = useRef<HTMLElement | null>(null);
  const closeDetailRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const lastSuccessfulProjectionRef = useRef<any | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const queuedManualRefreshRef = useRef(false);

  const storage = browserStorage();
  const selectedThread = useMemo(
    () => [...projection.threads, ...projection.history].find((thread: any) => thread.thread_id === selectedThreadId) ?? null,
    [projection, selectedThreadId]
  );
  const mobileDialogOpen = Boolean(isMobileDetail && selectedThread);
  const selectedView = useMemo(
    () => selectLiveThreadView(projection, storage, view),
    [projection, storage, view, acknowledgementRevision]
  );
  const ownerView = useMemo(
    () => selectOwnerAttentionThreads(projection, storage),
    [projection, storage, acknowledgementRevision]
  );
  const realtimeBuckets = useMemo(
    () => buildRealtimeStatusBuckets(projection.threads, ownerView.threads),
    [projection.threads, ownerView.threads]
  );
  const observationGap = useMemo(
    () => observationGapBreakdown(realtimeBuckets.unavailable),
    [realtimeBuckets]
  );
  const realtimeCoverage = useMemo(
    () => formatRealtimeCoverage(projection.adapter, projection.scope),
    [projection.adapter, projection.scope]
  );
  const liveProjectionPresentation = useMemo(
    () => liveProjectionLoadPresentation({ initialPending: initialProjectionPending, adapter: projection.adapter }),
    [initialProjectionPending, projection.adapter]
  );
  const realtimeOrganizationRollup = useMemo(() => {
    const visibleOwnerThreadIds = new Set(ownerView.threads.map((thread: any) => thread.thread_id));
    return groupLiveThreadsByOrganization(projection.threads, projection.organization).map((group) => {
      const ownerThreads = group.threads.filter((thread: any) => visibleOwnerThreadIds.has(thread.thread_id));
      return {
        ...group,
        buckets: buildRealtimeStatusBuckets(group.threads, ownerThreads)
      };
    });
  }, [projection.threads, projection.organization, ownerView.threads]);
  const filteredWorkThreads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return selectedView.threads.filter((thread: any) => {
      if (groupFilter !== "all" && thread.organization_group_id !== groupFilter) return false;
      if (statusFilter !== "all" && thread.status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return [
        thread.thread_id,
        thread.organization_group_id,
        organizationGroupLabel(thread.organization_group_id, projection.organization),
        thread.route_id,
        thread.work_id,
        thread.thread_kind,
        thread.display_label,
        thread.relationship,
        thread.status
      ].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery);
    });
  }, [selectedView.threads, query, groupFilter, statusFilter, projection.organization]);
  const workGroups = useMemo(
    () => groupLiveThreadsByOrganization(filteredWorkThreads, projection.organization),
    [filteredWorkThreads, projection.organization]
  );
  const directChildCounts = useMemo<Map<string, number>>(() => {
    const currentThreads = projection.threads as any[];
    return new Map<string, number>(currentThreads.map((thread: any) => [
      String(thread.thread_id),
      currentThreads.filter((candidate: any) => candidate.parent_thread_id === thread.thread_id).length
    ]));
  }, [projection]);
  const groupOptions = useMemo(
    () => groupLiveThreadsByOrganization([...projection.threads, ...projection.history], projection.organization)
      .map((group) => group.organization_group_id),
    [projection.threads, projection.history, projection.organization]
  );
  const exactTaskAttribution = useMemo(() => {
    const attribution = new Map<string, { display_label: string; organization_group_id: string; organization_label: string }>();
    for (const thread of [...projection.history, ...projection.threads] as any[]) {
      if (
        typeof thread.thread_id !== "string"
        || typeof thread.display_label !== "string"
        || typeof thread.organization_group_id !== "string"
      ) continue;
      attribution.set(thread.thread_id, {
        display_label: thread.display_label,
        organization_group_id: thread.organization_group_id,
        organization_label: organizationGroupLabel(thread.organization_group_id, projection.organization)
      });
    }
    return attribution;
  }, [projection]);
  const exactTaskLabels = useMemo(
    () => new Map([...exactTaskAttribution].map(([threadId, attribution]) => [threadId, attribution.display_label])),
    [exactTaskAttribution]
  );

  function updateProjection(force = false) {
    if (refreshInFlightRef.current) {
      if (force) {
        queuedManualRefreshRef.current = true;
        setRefreshing(true);
      }
      return;
    }
    if (force) setRefreshing(true);
    const applyProjection = (next: any) => {
      const result = resolveLiveProjectionRefresh({
        lastSuccessfulProjection: lastSuccessfulProjectionRef.current,
        nextProjection: next
      });
      if (result.accepted_success) lastSuccessfulProjectionRef.current = result.projection;
      startTransition(() => {
        setProjection((current: any) => current === result.projection ? current : result.projection);
        setRefreshFailure(result.refresh_failure);
      });
    };
    const liveRefresh = liveThreadProjectionRequest.load({ force }).then(
      applyProjection,
      () => applyProjection(createUnavailableLiveThreadProjection({ health: "error", enrollmentHealth: "invalid" }))
    ).finally(() => {
      startTransition(() => setInitialProjectionPending(false));
    });
    const usageRefresh = aiUsageProjectionRequest.load({ force }).then(
      (next: any) => startTransition(() => { setAiUsageProjection(next); setAiUsagePending(false); }),
      () => startTransition(() => { setAiUsageProjection({
          state: "unmeasured",
          snapshot: createUnmeasuredAiUsageSnapshot(),
          reconciliation: null
        }); setAiUsagePending(false); })
    );
    const operation = Promise.allSettled([liveRefresh, usageRefresh]).then(() => undefined).finally(() => {
      refreshInFlightRef.current = null;
      if (queuedManualRefreshRef.current) {
        queuedManualRefreshRef.current = false;
        updateProjection(true);
      } else if (force) {
        setRefreshing(false);
      }
    });
    refreshInFlightRef.current = operation;
    void operation;
  }

  async function refreshDiagnostics() {
    const usageRefresh = aiUsageProjectionRequest.load({ force: true }).then(
      (next: any) => startTransition(() => setAiUsageProjection(next)),
      () => startTransition(() => setAiUsageProjection({
        state: "unmeasured",
        snapshot: createUnmeasuredAiUsageSnapshot(),
        reconciliation: null
      }))
    );
    const topologyRefresh = Promise.resolve(topologyRefreshRef.current(true));
    const [, topologyResult] = await Promise.allSettled([usageRefresh, topologyRefresh]);
    return topologyResult.status === "fulfilled" ? topologyResult.value : null;
  }

  function selectThread(threadId: string, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setSelectedThreadId(threadId);
  }

  function selectOrganizationGroup(groupId: string) {
    setSelectedOrganizationGroupId(groupId);
    setSelectedThreadId(null);
  }

  function toggleThreadTree(threadId: string) {
    setExpandedThreadIds((previous) => {
      const next = new Set(previous);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }

  function closeDetail() {
    setSelectedThreadId(null);
  }

  function acknowledgeSelectedThread() {
    if (!selectedThread || !acknowledgeLiveThread(storage, selectedThread)) {
      setNotice("명시적으로 Owner에게 전달된 결과·에스컬레이션만 로컬에서 확인 처리할 수 있습니다.");
      return;
    }
    setAcknowledgementRevision((value) => value + 1);
    setView("history");
    setNotice("브라우저의 로컬 확인 표시만 저장했습니다. Codex thread에는 변경을 보내지 않았습니다.");
  }

  function restoreSelectedThread() {
    if (!selectedThread || !restoreLiveThread(storage, selectedThread)) return;
    setAcknowledgementRevision((value) => value + 1);
    setView("active");
    setNotice("로컬 확인 표시를 되돌렸습니다.");
  }

  useEffect(() => {
    updateProjection(false);
    const timer = window.setInterval(() => updateProjection(false), LIVE_THREAD_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_DETAIL_QUERY);
    const sync = () => setIsMobileDetail(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!mobileDialogOpen || !detailRef.current) return;
    const restoreThreadId = selectedThreadId;
    const background = Array.from(document.querySelectorAll<HTMLElement>("[data-live-dialog-background]"));
    const previousOverflow = document.body.style.overflow;
    background.forEach((node) => {
      node.inert = true;
      node.setAttribute("aria-hidden", "true");
    });
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => closeDetailRef.current?.focus({ preventScroll: true }));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDetail();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      background.forEach((node) => {
        node.inert = false;
        node.removeAttribute("aria-hidden");
      });
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => {
        const logicalTrigger = restoreThreadId
          ? Array.from(document.querySelectorAll<HTMLButtonElement>("[data-live-thread-id]"))
              .find((node) => node.dataset.liveThreadId === restoreThreadId) ?? null
          : null;
        const stableControl = document.querySelector<HTMLElement>("[data-live-focus-fallback]");
        const target = [triggerRef.current, logicalTrigger, stableControl].find(canRestoreFocus);
        target?.focus({ preventScroll: true });
      });
    };
  }, [mobileDialogOpen, selectedThreadId]);

  const healthText = {
    ready: "정상 관측",
    partial: "부분 관측",
    unavailable: "연결 불가",
    error: "관측 오류",
    disabled: "비상 중지"
  }[String(projection.adapter.health) as "ready" | "partial" | "unavailable" | "error" | "disabled"] ?? "미확정";

  const topActionRefreshing = surface === "system" ? topologyRefreshing : refreshing;

  return (
    <div className="inbox-app live-board-app">
      <a className="inbox-skip-link" href="#live-board-content" data-live-dialog-background>
        본문으로 건너뛰기
      </a>

      <header className="inbox-topbar live-board-topbar" data-live-dialog-background>
        <div className="live-board-rebuild-header">
          <div className="live-board-brand">
            <strong><span className="live-board-brand-mark" aria-hidden="true">◆</span> SOULFORGE</strong>
            <span className="live-board-brand-surface">{SURFACE_WORDMARKS[surface]}</span>
            <span className="live-board-brand-live"><span aria-hidden="true" /> LIVE</span>
          </div>
          <nav className="live-board-primary-nav" aria-label="Workspace Board 화면">
            <button type="button" data-testid="owner-overview-tab" className={surface === "owner" ? "is-active" : ""} aria-pressed={surface === "owner"} onClick={() => setSurface("owner")}>
              실시간 현황
            </button>
            <button type="button" data-testid="organization-tree-tab" className={surface === "organization" ? "is-active" : ""} aria-pressed={surface === "organization"} onClick={() => setSurface("organization")}>
              조직도
            </button>
            <button type="button" data-testid="work-history-tab" className={surface === "work" ? "is-active" : ""} aria-pressed={surface === "work"} onClick={() => setSurface("work")}>
              업무 현황·이력
            </button>
            <button type="button" data-testid="system-topology-tab" className={surface === "system" ? "is-active" : ""} aria-pressed={surface === "system"} onClick={() => setSurface("system")}>
              시스템 토폴로지
            </button>
          </nav>
          <div className="live-board-top-actions">
            <span className="live-board-top-meta" role="note">
              <EyeOff size={14} aria-hidden="true" />
              <span>LOCAL ONLY · READ ONLY</span>
            </span>
            <LiveClock />
            <span className={`live-health-state ${liveProjectionPresentation.state === "initial_loading" ? "live-health-loading" : `live-health-${projection.adapter.health}`}`} data-testid="realtime-coverage" aria-live="polite">
              <Activity size={15} aria-hidden="true" />
              {liveProjectionPresentation.state === "initial_loading"
                ? liveProjectionPresentation.label
                : refreshFailure
                  ? `마지막 정상 관측 · ${realtimeCoverage}`
                  : realtimeCoverage}
            </span>
            {refreshFailure && (
              <span className="live-health-state live-health-partial" role="status" aria-live="polite" data-testid="realtime-refresh-hold">
                <AlertCircle size={15} aria-hidden="true" />
                {refreshFailure === "error"
                  ? "최근 갱신 오류 · 마지막 정상 관측 유지"
                  : refreshFailure === "lifecycle_hold"
                    ? "구조 신호 갱신 중 · 마지막 정상 관측 유지"
                    : "최근 갱신 연결 불가 · 마지막 정상 관측 유지"}
              </span>
            )}
            <button
              className="live-refresh-button"
              type="button"
              aria-label="지금 갱신"
              title="지금 갱신"
              onClick={() => surface === "system" ? refreshDiagnostics() : updateProjection(true)}
              disabled={topActionRefreshing}
            >
              <RefreshCw size={15} aria-hidden="true" className={topActionRefreshing ? "is-spinning" : ""} />
            </button>
          </div>
        </div>
      </header>

      {surface === "work" && (
        <section className="live-board-controls" aria-label="업무와 기록 필터" data-live-dialog-background>
          <label className="inbox-search live-thread-search">
            <span className="sr-only">thread ID, 조직 그룹, route 또는 work 검색</span>
            <input
              type="search"
              data-live-focus-fallback
              value={query}
              placeholder="thread ID · 조직 그룹 · route · work 검색"
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button type="button" aria-label="검색어 지우기" onClick={() => setQuery("")}>
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </label>
          <label>
            <span>조직 그룹</span>
            <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
              <option value="all">전체</option>
              {groupOptions.map((group) => <option key={group} value={group}>{organizationGroupLabel(group, projection.organization)}</option>)}
            </select>
          </label>
          <label>
            <span>상태</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="stopped">응답 종료 · 결과 미확정</option>
              <option value="all">전체</option>
              <option value="owner_attention">Owner 확인 필요</option>
              <option value="parent_result_ready">하위 결과 도착/취합 중</option>
              <option value="waiting">입력·승인 대기</option>
              <option value="active">실행 중</option>
              <option value="not_loaded_unknown">상태 신호 없음</option>
              <option value="error">상태 관측 오류</option>
              <option value="accepted_closed">수락·종료 이력</option>
            </select>
          </label>
          <div className="inbox-view-switch" aria-label="업무 표시 범위">
            <button type="button" className={view === "active" ? "is-active" : ""} aria-pressed={view === "active"} onClick={() => setView("active")}>
              <CircleDot size={14} aria-hidden="true" />
              현재 업무
            </button>
            <button type="button" className={view === "history" ? "is-active" : ""} aria-pressed={view === "history"} onClick={() => setView("history")}>
              <History size={14} aria-hidden="true" />
              수락·확인 이력
            </button>
          </div>
          <div className="live-work-status-guide" aria-label="응답 종료와 상태 신호 없음 설명">
            <p><History size={14} aria-hidden="true" /><span><strong>응답 종료</strong> 마지막 응답/turn만 끝남 · TASK 완료 아님</span></p>
            <p><EyeOff size={14} aria-hidden="true" /><span><strong>상태 신호 없음</strong> 등록은 됐지만 실행·대기·결과를 판정할 최신 신호 없음</span></p>
          </div>
        </section>
      )}

      {notice && (
        <div className="inbox-notice" role="status" data-live-dialog-background>
          <Check size={15} aria-hidden="true" />
          {notice}
          <button type="button" aria-label="알림 닫기" onClick={() => setNotice("")}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      {surface === "work" && <LedgerActivity usage={aiUsageProjection} />}
      {surface === "work" && <LedgerDistribution usage={aiUsageProjection} exactTaskLabels={exactTaskLabels as any} />}
      {surface === "work" && <AiUsagePanel
        projection={aiUsageProjection}
        exactTaskLabels={exactTaskLabels}
        exactTaskAttribution={exactTaskAttribution}
        exactTaskAttributionState={initialProjectionPending
          ? "loading"
          : isOrganizationUsageAttributionReady(projection)
            ? "ready"
            : "unavailable"}
      />}

      <main id="live-board-content" className="live-board-layout" aria-busy={initialProjectionPending || undefined}>
        <section className="live-board-workspace" data-live-dialog-background aria-label={surface === "owner" ? "Owner 확인 현황" : surface === "organization" ? "정확한 조직 thread 계층" : view === "active" ? "현재 실제 Codex 업무" : "수락·확인 이력"}>
          {liveProjectionPresentation.should_render_projection ? <>
          {surface === "owner" && (
            <SystemStatStrip
              projection={topologyProjection}
              hostStats={hostStatsSnapshot}
              usage={aiUsageProjection}
              threadCount={Array.isArray(projection?.threads) ? projection.threads.length : 0}
              usageState={aiUsageProjection.state}
            />
          )}
          {surface === "owner" && <FleetUsageCards usage={aiUsageProjection} providers={providerSnapshots} pending={aiUsagePending} />}
          {surface === "owner" && <FleetStatusRows projection={topologyProjection} />}
          {surface === "owner" && (
            <RealtimeDashboard
              projection={projection}
              buckets={realtimeBuckets}
              observationGap={observationGap}
              organizationRows={realtimeOrganizationRollup}
              selectedThreadId={selectedThreadId}
              directChildCounts={directChildCounts}
              aiUsageProjection={aiUsageProjection}
              onSelect={selectThread}
              onRetry={() => updateProjection(true)}
            />
          )}
          {surface === "work" && (
          <div className="live-board-scope">
            <div>
              <strong>{view === "active" ? `현재 내부 업무 ${filteredWorkThreads.length}건` : `수락·확인 이력 ${filteredWorkThreads.length}건`}</strong>
              <p>Codex discovery는 관측만 합니다. 표시 authority와 parent edge는 owner가 등록한 정확한 thread_id뿐입니다.</p>
            </div>
            <span>{projection.adapter.coverage === "partial" ? "부분 관측 · 등록 외 항목은 숫자로만 제외" : "관측 범위 미확정"}</span>
          </div>
          )}

          {surface === "work" && <LiveProjectionState projection={projection} filteredCount={filteredWorkThreads.length} onRetry={() => updateProjection(true)} />}

          {surface === "organization" && (
            <OrganizationWorkspace
              organization={projection.organization}
              groups={realtimeOrganizationRollup}
              threads={projection.threads}
              history={projection.history}
              storage={storage}
              subview={organizationSubview}
              selectedGroupId={selectedOrganizationGroupId}
              selectedThread={selectedThread}
              selectedThreadId={selectedThreadId}
              expandedThreadIds={expandedThreadIds}
              directChildCounts={directChildCounts}
              onChangeSubview={setOrganizationSubview}
              onSelectGroup={selectOrganizationGroup}
              onToggle={toggleThreadTree}
              onSelect={selectThread}
            />
          )}

          {surface === "system" && (
            <div className="system-topology-stack" data-testid="system-topology-stack">
              <SystemTopologySurface
                projection={topologyProjection}
                refreshing={topologyRefreshing}
                providerSnapshots={providerSnapshots}
                onRefreshReadOnly={refreshDiagnostics}
              />
              <EngineeringEngineTopologySurface projection={topologyFederationProjection} />
            </div>
          )}

          {surface === "work" && workGroups.map((group) => (
            <WorkOrganizationGroup
              key={group.organization_group_id}
              group={group}
              selectedThreadId={selectedThreadId}
              storage={storage}
              directChildCounts={directChildCounts}
              onSelect={selectThread}
            />
          ))}
          </> : <InitialLiveProjectionLoading />}
        </section>

        {mobileDialogOpen && <div className="live-detail-backdrop" aria-hidden="true" onClick={closeDetail} />}

        {selectedThread && (
          <LiveThreadDetail
            thread={selectedThread}
            acknowledged={isAcknowledgeableLiveThread(selectedThread) && isLiveThreadAcknowledged(storage, selectedThread)}
            directChildCount={directChildCounts.get(selectedThread.thread_id) ?? 0}
            organization={projection.organization}
            isModal={mobileDialogOpen}
            panelRef={detailRef}
            closeButtonRef={closeDetailRef}
            onClose={closeDetail}
            onAcknowledge={acknowledgeSelectedThread}
            onRestore={restoreSelectedThread}
          />
        )}
      </main>

      <footer className="inbox-footer" data-live-dialog-background>
        <span>actual Codex runtime observation · exact local enrollment only</span>
        <span>no thread create, delete, archive, send, raw transcript, path, or worktree access</span>
      </footer>
    </div>
  );
}

function WorkOrganizationGroup({ group, selectedThreadId, storage, directChildCounts, onSelect }: {
  group: any;
  selectedThreadId: string | null;
  storage: Storage | null;
  directChildCounts: Map<string, number>;
  onSelect: (threadId: string, trigger: HTMLButtonElement) => void;
}) {
  const panelId = `work.group.${group.organization_group_id}`;
  const panel = usePersistentPanelCollapse(panelId);
  return (
    <section className={`live-organization-group${panel.collapsed ? " is-collapsed" : ""}`} aria-labelledby={`group-${group.organization_group_id}`} data-collapsed={panel.collapsed || undefined}>
      <header>
        <div>
          <span>ORGANIZATION GROUP</span>
          <h2 id={`group-${group.organization_group_id}`}>{group.display_label}</h2>
        </div>
        <strong>{group.threads.length}</strong>
        <PanelCollapseButton panelId={panelId} label={`${group.display_label} 업무`} collapsed={panel.collapsed} onToggle={panel.toggle} />
      </header>
      <CollapsiblePanelBody panelId={panelId} collapsed={panel.collapsed}>
        <div className="live-thread-card-list">
          {group.threads.map((thread: any) => (
            <LiveThreadCard
              key={`${thread.thread_id}:${thread.updated_at}`}
              thread={thread}
              selected={thread.thread_id === selectedThreadId}
              acknowledged={isAcknowledgeableLiveThread(thread) && isLiveThreadAcknowledged(storage, thread)}
              directChildCount={directChildCounts.get(thread.thread_id) ?? 0}
              onSelect={onSelect}
            />
          ))}
        </div>
      </CollapsiblePanelBody>
    </section>
  );
}

function InitialLiveProjectionLoading() {
  return (
    <section className="realtime-surface" aria-labelledby="live-projection-loading-heading" data-testid="live-projection-initial-loading">
      <div className="live-state-panel" role="status" aria-live="polite">
        <Radio size={18} aria-hidden="true" />
        <div>
          <h1 id="live-projection-loading-heading">실시간 현황 불러오는 중</h1>
          <p>첫 관측이 도착하기 전에는 0건이나 연결 불가를 실제 상태로 표시하지 않습니다.</p>
        </div>
      </div>
    </section>
  );
}

function RealtimeDashboard({
  projection,
  buckets,
  observationGap,
  organizationRows,
  selectedThreadId,
  directChildCounts,
  aiUsageProjection,
  onSelect,
  onRetry
}: {
  projection: any;
  buckets: Record<string, any[]>;
  observationGap: { stopped: number; not_loaded_unknown: number; error: number };
  organizationRows: any[];
  selectedThreadId: string | null;
  directChildCounts: Map<string, number>;
  aiUsageProjection: any;
  onSelect: (threadId: string, trigger: HTMLButtonElement) => void;
  onRetry: () => void;
}) {
  const panel = usePersistentPanelCollapse("owner.realtime");
  return (
    <section className={`realtime-surface${panel.collapsed ? " is-collapsed" : ""}`} aria-labelledby="realtime-heading" data-testid="realtime-dashboard" data-collapsed={panel.collapsed || undefined}>
      <header className="realtime-headline">
        <div>
          <span>REAL-TIME LOCAL PROJECTION</span>
          <h1 id="realtime-heading">지금 누가 일하고 있나?</h1>
          <p>명시적 실행·대기 이벤트와 exact 응답/turn 종료 신호만 표시합니다 · 추정하지 않음</p>
        </div>
        <div className="realtime-scope-note">
          <Radio size={15} aria-hidden="true" />
          <span>현재 등록 {projection.scope.included_count}건</span>
        </div>
        <PanelCollapseButton panelId="owner.realtime" label="실시간 업무 현황" collapsed={panel.collapsed} onToggle={panel.toggle} />
      </header>
      <CollapsiblePanelBody panelId="owner.realtime" collapsed={panel.collapsed}>
      <div className="realtime-metric-grid" aria-label="실시간 상태 요약">
        <RealtimeMetricCard statusKey="active" icon={<Activity size={25} aria-hidden="true" />} count={buckets.active.length} />
        <RealtimeMetricCard statusKey="waiting" icon={<Clock3 size={25} aria-hidden="true" />} count={buckets.waiting.length} />
        <RealtimeMetricCard statusKey="owner_result" icon={<CircleCheckBig size={25} aria-hidden="true" />} count={buckets.owner_result.length} />
        <RealtimeMetricCard statusKey="stopped" icon={<History size={25} aria-hidden="true" />} count={observationGap.stopped} />
        <RealtimeMetricCard
          statusKey="unknown"
          icon={<EyeOff size={25} aria-hidden="true" />}
          count={observationGap.not_loaded_unknown + observationGap.error}
          detail={`${realtimeStatusCopy("unknown").description}${observationGap.error > 0 ? ` · 오류 ${observationGap.error}` : ""}`}
        />
      </div>

      <div className="realtime-content-grid">
        <section className="realtime-status-panel" aria-labelledby="realtime-status-heading">
          <header>
            <div>
              <span>LIVE STATUS</span>
              <h2 id="realtime-status-heading">
                <em className="realtime-session-count">{countRealtimeConnectedSessions(buckets)}</em> 활성 세션
              </h2>
            </div>
            <span className="realtime-panel-meta">
              {buckets.active.length} 작업 중 · {buckets.waiting.length} 승인 대기 · {buckets.owner_result.length} 결과 확인 · 정확한 등록 ID 기준
            </span>
          </header>
          <LiveProjectionState projection={projection} filteredCount={projection.threads.length} onRetry={onRetry} />
          <div className="realtime-status-lanes" aria-label="상태별 상세">
            <RealtimeTaskGroup
              statusKey="active"
              icon={<Activity size={18} aria-hidden="true" />}
              threads={buckets.active}
              organization={projection.organization}
              selectedThreadId={selectedThreadId}
              directChildCounts={directChildCounts}
              onSelect={onSelect}
            />
            <RealtimeTaskGroup
              statusKey="waiting"
              icon={<Clock3 size={18} aria-hidden="true" />}
              threads={buckets.waiting}
              organization={projection.organization}
              selectedThreadId={selectedThreadId}
              directChildCounts={directChildCounts}
              onSelect={onSelect}
            />
            <RealtimeTaskGroup
              statusKey="owner_result"
              icon={<CircleCheckBig size={18} aria-hidden="true" />}
              threads={buckets.owner_result}
              organization={projection.organization}
              selectedThreadId={selectedThreadId}
              directChildCounts={directChildCounts}
              onSelect={onSelect}
            />
          </div>
        </section>

        <aside className="realtime-side-column" aria-label="조직 및 상태 기준">
          <RealtimeOrganizationRollup rows={organizationRows} organization={projection.organization} />
          <RealtimeStatusLegend observationGap={observationGap} />
          <RealtimeMeterHealth projection={aiUsageProjection} />
        </aside>
      </div>
      </CollapsiblePanelBody>
    </section>
  );
}

function RealtimeMetricCard({
  statusKey,
  icon,
  count,
  detail
}: {
  statusKey: "active" | "waiting" | "owner_result" | "stopped" | "unknown" | "unavailable";
  icon: React.ReactNode;
  count: number;
  detail?: string;
}) {
  const copy = realtimeStatusCopy(statusKey);
  return (
    <section className={`realtime-metric-card is-${copy.tone}`} data-testid={`realtime-card-${statusKey}`}>
      <div className="realtime-metric-title">{icon}<span>{copy.label}</span></div>
      <strong>{count}</strong>
      <p>{detail ?? copy.description}</p>
    </section>
  );
}

function RealtimeTaskGroup({
  statusKey,
  icon,
  threads,
  organization,
  selectedThreadId,
  directChildCounts,
  onSelect
}: {
  statusKey: "active" | "waiting" | "owner_result";
  icon: React.ReactNode;
  threads: any[];
  organization: any;
  selectedThreadId: string | null;
  directChildCounts: Map<string, number>;
  onSelect: (threadId: string, trigger: HTMLButtonElement) => void;
}) {
  const copy = realtimeStatusCopy(statusKey);
  const emptyText = statusKey === "owner_result"
    ? "Owner에게 명시적으로 전달된 결과가 없습니다."
    : `${copy.label} 상태의 명시적 이벤트가 없습니다.`;
  return (
    <section className={`realtime-task-group is-${copy.tone}`} aria-labelledby={`realtime-${statusKey}-heading`} data-testid={`realtime-${statusKey}-group`}>
      <header>
        <div>{icon}<h3 id={`realtime-${statusKey}-heading`}>{copy.label}</h3></div>
        <span>{threads.length}</span>
      </header>
      {statusKey === "owner_result" && <span className="sr-only">Owner 대상 명시 result gate만 포함합니다. 상위 thread 전달 결과는 조직도에서만 확인합니다.</span>}
      {threads.length === 0 ? (
        <p className="realtime-empty-row" role="status">{emptyText}</p>
      ) : (
        <div className="realtime-thread-list" role="table" aria-label={copy.label}>
          <div className="realtime-thread-list-head" role="row">
            <span role="columnheader">상태</span>
            <span role="columnheader">역할 / 담당자</span>
            <span role="columnheader">현재 TASK / work</span>
            <span role="columnheader">마지막 관측</span>
            <span role="columnheader">하위</span>
            <span role="columnheader">회사 / 팀</span>
          </div>
          {threads.map((thread) => (
            <RealtimeThreadRow
              key={`${thread.thread_id}:${thread.updated_at}`}
              thread={thread}
              organization={organization}
              selected={thread.thread_id === selectedThreadId}
              directChildCount={directChildCounts.get(thread.thread_id) ?? 0}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RealtimeThreadRow({
  thread,
  organization,
  selected,
  directChildCount,
  onSelect
}: {
  thread: any;
  organization: any;
  selected: boolean;
  directChildCount: number;
  onSelect: (threadId: string, trigger: HTMLButtonElement) => void;
}) {
  const connection = realtimeThreadConnectionPresentation(thread);
  return (
    <button
      className={`realtime-thread-row ${selected ? "is-selected" : ""}`}
      type="button"
      data-live-thread-id={thread.thread_id}
      data-testid={`realtime-thread-${thread.thread_id}`}
      aria-expanded={selected}
      onClick={(event) => onSelect(thread.thread_id, event.currentTarget)}
    >
      <span className={`realtime-status-icon is-${connection.tone}`} aria-label={connection.label} title={connection.label}><CircleDot size={16} aria-hidden="true" /></span>
      <span className="realtime-thread-role"><strong>{thread.display_label}</strong><small>{liveThreadRoleLabel(thread.thread_kind)} · <span className={`realtime-connection-state is-${connection.tone}`}>{connection.label}</span></small></span>
      <span>{thread.work_id ?? "work 미확정"}</span>
      <time dateTime={thread.updated_at}>{formatRefreshTime(thread.updated_at)}</time>
      <span>{directChildCount}</span>
      <span>{organizationGroupLabel(thread.organization_group_id, organization)}</span>
    </button>
  );
}

function RealtimeOrganizationRollup({ rows, organization }: { rows: any[]; organization: any }) {
  const companies = new Map<string, { company: any; rows: any[] }>(
    (Array.isArray(organization?.companies) ? organization.companies : [])
      .map((company: any) => [company.company_id, { company, rows: [] }])
  );
  const unassignedRows: any[] = [];
  for (const row of rows) {
    const entry = row.company_id ? companies.get(row.company_id) : null;
    if (entry) entry.rows.push(row);
    else unassignedRows.push(row);
  }
  return (
    <section className="realtime-organization-rollup" aria-labelledby="organization-rollup-heading" data-testid="organization-rollup">
      <header>
        <div><Building2 size={20} aria-hidden="true" /><h2 id="organization-rollup-heading">조직 상태</h2></div>
        <span>exact ID roll-up</span>
      </header>
      {companies.size === 0 && unassignedRows.length === 0 ? (
        <p className="realtime-empty-row">현재 조직 roll-up에 표시할 등록 항목이 없습니다.</p>
      ) : <>
        {[...companies.entries()].map(([companyId, entry]) => (
        <section className="realtime-company-rollup" key={companyId}>
          <header><strong>{entry.company.display_label}</strong><RealtimeRollupCounts buckets={sumRollupBuckets(entry.rows)} /></header>
          {entry.rows.map((row) => (
            <div className="realtime-organization-row" key={row.organization_group_id}>
              <span><UsersRound size={15} aria-hidden="true" />{row.display_label}</span>
              <RealtimeRollupCounts buckets={row.buckets} />
            </div>
          ))}
        </section>
        ))}
        {unassignedRows.length > 0 && (
          <section className="realtime-company-rollup" data-testid="organization-rollup-hold">
            <header><strong>미할당/보류</strong><RealtimeRollupCounts buckets={sumRollupBuckets(unassignedRows)} /></header>
            {unassignedRows.map((row) => (
              <div className="realtime-organization-row" key={row.organization_group_id}>
                <span><ShieldAlert size={15} aria-hidden="true" />{row.display_label}</span>
                <RealtimeRollupCounts buckets={row.buckets} />
              </div>
            ))}
          </section>
        )}
      </>}
    </section>
  );
}

function sumRollupBuckets(rows: any[]) {
  const totals = { active: [], waiting: [], owner_result: [], unavailable: [] } as Record<string, any[]>;
  for (const row of rows) {
    for (const key of Object.keys(totals)) totals[key].push(...(row.buckets[key] ?? []));
  }
  return totals;
}

function RealtimeRollupCounts({ buckets }: { buckets: Record<string, any[]> }) {
  return (
    <span className="realtime-rollup-counts" aria-label="상태별 건수">
      {(["active", "waiting", "owner_result", "unavailable"] as const).map((key) => (
        <span className={`is-${realtimeStatusCopy(key).tone}`} key={key} title={realtimeStatusCopy(key).label}>
          <CircleDot size={12} aria-hidden="true" />{buckets[key]?.length ?? 0}
        </span>
      ))}
    </span>
  );
}

function RealtimeStatusLegend({ observationGap }: { observationGap: { stopped: number; not_loaded_unknown: number; error: number } }) {
  const entries = [
    ["active", <Activity size={17} aria-hidden="true" />, realtimeStatusCopy("active").description],
    ["waiting", <Clock3 size={17} aria-hidden="true" />, realtimeStatusCopy("waiting").description],
    ["owner_result", <CircleCheckBig size={17} aria-hidden="true" />, "Owner 대상 명시 result gate"],
    ["stopped", <History size={17} aria-hidden="true" />, `${realtimeStatusCopy("stopped").description} · ${observationGap.stopped}건`],
    ["unknown", <EyeOff size={17} aria-hidden="true" />, `${realtimeStatusCopy("unknown").description} · ${observationGap.not_loaded_unknown}건${observationGap.error > 0 ? ` · 오류 ${observationGap.error}건` : ""}`],
    ["codex_unread", <CircleDot size={17} aria-hidden="true" />, "Codex 파란 점은 새 활동·미확인 알림이며 실행·대기·완료 판정에 사용하지 않음"]
  ] as const;
  return (
    <section className="realtime-status-legend" aria-labelledby="status-legend-heading" data-testid="status-legend">
      <header><ListChecks size={20} aria-hidden="true" /><h2 id="status-legend-heading">상태 기준</h2></header>
      <ul>
        {entries.map(([key, icon, description]) => (
          <li className={`is-${key}`} key={key}>
            {icon}
            <div><strong>{key === "codex_unread" ? "Codex 파란 점" : realtimeStatusCopy(key).label}</strong><span>{description}</span></div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RealtimeMeterHealth({ projection }: { projection: any }) {
  const snapshot = projection?.snapshot ?? createUnmeasuredAiUsageSnapshot();
  const measurementState = projection?.state ?? "unmeasured";
  const health = snapshot?.health?.hook_status ?? "unmeasured";
  const coverage = snapshot?.coverage ?? { measured_turns: 0, total_turns: 0 };
  return (
    <section className={`realtime-meter-health is-${measurementState}`} aria-label="AI Usage Meter 로컬 상태" data-testid="local-meter-health">
      <div><Gauge size={18} aria-hidden="true" /><strong>AI Usage Meter (로컬)</strong></div>
      <span>{health}</span>
      <small>측정 {coverage.measured_turns ?? 0}/{coverage.total_turns ?? 0} · {measurementState}</small>
    </section>
  );
}

function LiveProjectionState({ projection, filteredCount, onRetry }: { projection: any; filteredCount: number; onRetry: () => void }) {
  if (["error", "unavailable", "disabled"].includes(projection.adapter.health)) {
    return (
      <section className="live-state-panel live-state-error" role="alert">
        <AlertCircle size={18} aria-hidden="true" />
        <div>
          <h2>{projection.adapter.health === "disabled" ? "live thread 관측이 비상 중지됨" : "live thread 관측을 완료하지 못함"}</h2>
          <p>등록된 항목은 완료나 Owner 확인 대상으로 추정하지 않습니다. 명시 result gate가 없으면 ‘관측 불가’로 유지됩니다.</p>
        </div>
        {projection.adapter.health !== "disabled" && (
          <button type="button" onClick={onRetry}>
            <RefreshCw size={14} aria-hidden="true" />
            다시 시도
          </button>
        )}
      </section>
    );
  }
  if (filteredCount === 0) {
    return (
      <section className="live-state-panel" role="status">
        <ShieldAlert size={18} aria-hidden="true" />
        <div>
          <h2>표시할 정확 등록 thread가 없습니다</h2>
          <p>새 카드가 필요하면 owner가 정확한 thread_id를 local enrollment registry에 등록한 뒤 갱신하세요.</p>
        </div>
      </section>
    );
  }
  return null;
}

function OwnerAttentionSurface({
  threads,
  selectedThreadId,
  storage,
  directChildCounts,
  onSelect
}: {
  threads: any[];
  selectedThreadId: string | null;
  storage: Storage | null;
  directChildCounts: Map<string, number>;
  onSelect: (threadId: string, trigger: HTMLButtonElement) => void;
}) {
  const prioritized = [...threads].sort((left, right) => (
    liveThreadStatusPriority(left.status) - liveThreadStatusPriority(right.status)
    || right.updated_at.localeCompare(left.updated_at)
  ));
  return (
    <section className="live-owner-attention" aria-labelledby="owner-attention-heading" data-testid="owner-attention-surface">
      <header>
        <div>
          <span>OWNER RESULT CHECK</span>
          <h2 id="owner-attention-heading">Owner 확인 필요</h2>
          <p>Owner에게 명시적으로 전달된 result gate만 표시합니다. 업무 완료를 자동 추정하지 않습니다.</p>
        </div>
        <strong>{prioritized.length}</strong>
      </header>
      {prioritized.length === 0 ? (
        <div className="live-owner-empty" role="status">
          <Check size={18} aria-hidden="true" />
          <div><strong>현재 Owner 확인 대상이 없습니다</strong><span>idle/notLoaded, 제목, 경과 시간은 Owner attention을 만들지 않습니다.</span></div>
        </div>
      ) : (
        <div className="live-thread-card-list">
          {prioritized.map((thread) => (
            <LiveThreadCard
              key={`${thread.thread_id}:${thread.updated_at}`}
              thread={thread}
              selected={thread.thread_id === selectedThreadId}
              acknowledged={isAcknowledgeableLiveThread(thread) && isLiveThreadAcknowledged(storage, thread)}
              directChildCount={directChildCounts.get(thread.thread_id) ?? 0}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function OrganizationWorkspace({
  organization,
  groups,
  threads,
  history,
  storage,
  subview,
  selectedGroupId,
  selectedThread,
  selectedThreadId,
  expandedThreadIds,
  directChildCounts,
  onChangeSubview,
  onSelectGroup,
  onToggle,
  onSelect
}: {
  organization: any;
  groups: any[];
  threads: any[];
  history: any[];
  storage: Storage | null;
  subview: OrganizationSubview;
  selectedGroupId: string | null;
  selectedThread: any;
  selectedThreadId: string | null;
  expandedThreadIds: Set<string>;
  directChildCounts: Map<string, number>;
  onChangeSubview: (view: OrganizationSubview) => void;
  onSelectGroup: (groupId: string) => void;
  onToggle: (threadId: string) => void;
  onSelect: (threadId: string, trigger: HTMLButtonElement) => void;
}) {
  const companies = Array.isArray(organization?.companies) ? organization.companies : [];
  const currentCount = threads.length;
  const panel = usePersistentPanelCollapse("organization.workspace");
  return (
    <section className={`organization-workspace${panel.collapsed ? " is-collapsed" : ""}`} aria-labelledby="organization-workspace-heading" data-testid="organization-workspace" data-collapsed={panel.collapsed || undefined}>
      <header className="organization-workspace-header">
        <div>
          <span>EXACT PARENT EDGES · RESULT GATE METADATA</span>
          <h1 id="organization-workspace-heading">조직도</h1>
          <p>등록된 정확한 thread_id와 parent edge만 연결합니다. 실행 중은 정확히 등록한 ID에 명시적으로 관측된 active lifecycle이 있을 때만 표시하며, 제목·파란 점·경과 시간으로 추정하지 않습니다.</p>
        </div>
        <div className="organization-subview-tabs" role="tablist" aria-label="조직도 보기">
          <button type="button" role="tab" aria-selected={subview === "tree"} className={subview === "tree" ? "is-active" : ""} onClick={() => onChangeSubview("tree")} data-testid="organization-tree-subview">조직 트리</button>
          <button type="button" role="tab" aria-selected={subview === "flow"} className={subview === "flow" ? "is-active" : ""} onClick={() => onChangeSubview("flow")} data-testid="organization-flow-subview">책임 흐름</button>
        </div>
        <PanelCollapseButton panelId="organization.workspace" label="조직도" collapsed={panel.collapsed} onToggle={panel.toggle} />
      </header>
      <CollapsiblePanelBody panelId="organization.workspace" collapsed={panel.collapsed}>
      <div className="organization-context-strip">
        <span><Building2 size={15} aria-hidden="true" />회사 {companies.length}</span>
        <span><UsersRound size={15} aria-hidden="true" />정확한 현재 등록 {currentCount}</span>
        <span><CircleCheckBig size={15} aria-hidden="true" />결과 gate는 명시 수신자만 반영</span>
      </div>
      {subview === "tree" ? (
        <OrganizationGroupTree
          organization={organization}
          groups={groups}
          threads={threads}
          storage={storage}
          selectedGroupId={selectedGroupId}
          selectedThread={selectedThread}
          selectedThreadId={selectedThreadId}
          directChildCounts={directChildCounts}
          onSelectGroup={onSelectGroup}
          onSelect={onSelect}
        />
      ) : (
        <OrganizationGroupFlow
          organization={organization}
          groups={groups}
          threads={threads}
          history={history}
          selectedGroupId={selectedGroupId}
          selectedThread={selectedThread}
          selectedThreadId={selectedThreadId}
          onSelectGroup={onSelectGroup}
          onSelect={onSelect}
        />
      )}
      </CollapsiblePanelBody>
    </section>
  );
}

function countTreeNodes(node: any): number {
  return 1 + (Array.isArray(node?.children) ? node.children.reduce((total: number, child: any) => total + countTreeNodes(child), 0) : 0);
}

function organizationGroupsByCompany(groups: any[], organization: any) {
  const groupRows = new Map(groups.map((group) => [group.organization_group_id, group]));
  const catalogGroups = Array.isArray(organization?.groups) ? organization.groups : [];
  const catalogCompanies = Array.isArray(organization?.companies) ? organization.companies : [];
  return catalogCompanies.map((company: any) => ({
    company_id: company.company_id,
    label: company.display_label,
    ceo_label: catalogGroups.find((group: any) => group.organization_group_id === company.ceo_group_id)?.display_label ?? "CEO HOLD",
    groups: catalogGroups
      .filter((group: any) => group.company_id === company.company_id)
      .sort((left: any, right: any) => left.sort_order - right.sort_order || left.organization_group_id.localeCompare(right.organization_group_id))
      .map((group: any) => groupRows.get(group.organization_group_id))
      .filter(Boolean)
  }));
}

function OrganizationCatalogHold({ organization, groups }: { organization: any; groups: any[] }) {
  const health = organization?.health ?? "missing";
  const unassignedGroups = groups.filter((group) => group.catalog_state !== "assigned" || group.company_id === null);
  if (health === "available" && unassignedGroups.length === 0) return null;
  return (
    <section className="live-state-panel" role="status" data-testid="organization-catalog-hold">
      <ShieldAlert size={18} aria-hidden="true" />
      <div>
        <h2>조직 카탈로그 HOLD</h2>
        <p>카탈로그 상태: {health}. 미할당 그룹은 회사나 자리로 추정하지 않습니다.</p>
        {unassignedGroups.length > 0 && <p>{unassignedGroups.map((group) => group.organization_group_id).join(", ")}</p>}
      </div>
    </section>
  );
}

function sortedExactGroupThreads(group: any | null) {
  if (!group) return [];
  const kindOrder: Record<string, number> = { manager: 0, verifier: 1, task: 2, continuation: 3 };
  return [...group.threads].sort((left, right) => (
    (kindOrder[left.thread_kind] ?? 9) - (kindOrder[right.thread_kind] ?? 9)
    || String(right.updated_at ?? "").localeCompare(String(left.updated_at ?? ""))
    || String(left.thread_id).localeCompare(String(right.thread_id))
  ));
}

function OrganizationGroupTree({
  organization,
  groups,
  threads,
  storage,
  selectedGroupId,
  selectedThread,
  selectedThreadId,
  directChildCounts,
  onSelectGroup,
  onSelect
}: {
  organization: any;
  groups: any[];
  threads: any[];
  storage: Storage | null;
  selectedGroupId: string | null;
  selectedThread: any;
  selectedThreadId: string | null;
  directChildCounts: Map<string, number>;
  onSelectGroup: (groupId: string) => void;
  onSelect: (threadId: string, trigger: HTMLButtonElement) => void;
}) {
  const { companies, unassigned_groups: unassignedGroups } = buildCompactOrganizationLanes(groups, organization);
  const selectedGroup = groups.find((group) => group.organization_group_id === selectedGroupId) ?? null;
  const [topologyMode, setTopologyMode] = useState<OrganizationTopologyMode>(() => (
    storage?.getItem(ORGANIZATION_TOPOLOGY_MODE_STORAGE_KEY) === "all" ? "all" : "live"
  ));
  const topology = useMemo(
    () => buildOperationalOrganizationTopology({ threadsInput: threads, organization, storage, mode: topologyMode } as any),
    [threads, organization, storage, topologyMode]
  );
  const { graphNodes, graphEdges } = useMemo(
    () => buildOperationalTopologyCanvas(topology, selectedGroupId, selectedThreadId, onSelectGroup, onSelect),
    [topology, selectedGroupId, selectedThreadId, onSelectGroup, onSelect]
  );
  const selectTopologyMode = (nextMode: OrganizationTopologyMode) => {
    setTopologyMode(nextMode);
    try {
      storage?.setItem(ORGANIZATION_TOPOLOGY_MODE_STORAGE_KEY, nextMode);
    } catch {
      // Presentation preference only; localStorage failure must not affect the Board projection.
    }
  };
  if (companies.length === 0 && organization?.health !== "available") {
    return <OrganizationCatalogHold organization={organization} groups={unassignedGroups} />;
  }
  if (companies.length === 0) {
    return <section className="live-state-panel" role="status"><ShieldAlert size={18} aria-hidden="true" /><div><h2>Exact organization groups unavailable</h2><p>Company placement is held until the owner-provided organization catalog is available.</p></div></section>;
  }
  return (
    <div className="organization-group-tree-layout organization-topology-layout" role="tabpanel" aria-label="Operational organization topology">
      <section className="organization-group-tree-canvas organization-topology-canvas-shell" aria-label="Company, CEO, manager, and exact responsibility topology">
        <header>
          <div><Building2 size={19} aria-hidden="true" /><div><span>정확한 조직 등록 기준</span><h2>실시간 운영 조직도</h2></div></div>
          <div className="organization-topology-header-actions">
            <div className="organization-topology-mode-control" role="group" aria-label="조직도 표시 범위">
              <button type="button" aria-pressed={topologyMode === "live"} onClick={() => selectTopologyMode("live")}>실시간만</button>
              <button type="button" aria-pressed={topologyMode === "all"} onClick={() => selectTopologyMode("all")}>전체 조직</button>
            </div>
            <span>{topologyMode === "live"
              ? "실행·승인 대기·결과 확인 작업과 정확한 상위 연결만 표시합니다."
              : "조직 정본과 exact 등록부의 모든 회사·CEO·팀장·책임자를 표시합니다."}</span>
          </div>
        </header>
        <OrganizationCatalogHold organization={organization} groups={unassignedGroups} />
        <div className="organization-topology-canvas" data-testid="organization-operational-topology">
          {graphNodes.length === 0 ? (
            <div className="organization-topology-empty" role="status">
              <CircleDot size={18} aria-hidden="true" />
              <strong>현재 표시할 운영 작업이 없습니다.</strong>
              <span>실행·승인 대기·결과 확인 상태가 생기면 정확한 상위 조직과 함께 자동으로 나타납니다.</span>
            </div>
          ) : (
            <ReactFlow
              key={topologyMode}
              nodes={graphNodes as any}
              edges={graphEdges as any}
              nodeTypes={organizationTopologyNodeTypes as any}
              defaultViewport={{ x: 0, y: 0, zoom: 0.84 }}
              minZoom={0.45}
              maxZoom={1.2}
              nodesDraggable={false}
              nodesConnectable={false}
              nodesFocusable={false}
              elementsSelectable={false}
              panOnDrag
              panOnScroll
              zoomOnScroll={false}
              zoomOnDoubleClick={false}
              preventScrolling
              proOptions={{ hideAttribution: true }}
              aria-label={`${topologyMode === "live" ? "실시간 작업" : "전체 조직"} 운영 조직도. 끌어서 이동할 수 있으며, 정확한 노드를 선택하면 기존 상세 정보가 열립니다.`}
            />
          )}
        </div>
        <p className="organization-topology-note">색 테두리는 해당 역할 또는 하위 조직의 현재 상태를 나타냅니다. ‘하위’ 표시는 직접 실행이 아니라 아래 책임자·TASK에서 올라온 상태이며, 확인 동작은 로컬 결과 노드만 숨깁니다.</p>
      </section>
      <OrganizationGroupInspector group={selectedGroup} threads={threads} selectedThread={selectedThread} selectedThreadId={selectedThreadId} directChildCounts={directChildCounts} onSelect={onSelect} />
    </div>
  );
}

function OrganizationGroupInspector({
  group,
  threads,
  selectedThread,
  selectedThreadId,
  directChildCounts,
  onSelect
}: {
  group: any | null;
  threads: any[];
  selectedThread: any;
  selectedThreadId: string | null;
  directChildCounts: Map<string, number>;
  onSelect: (threadId: string, trigger: HTMLButtonElement) => void;
}) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [group?.organization_group_id, selectedThreadId]);
  if (!group) {
    return <aside className="organization-group-inspector" aria-label="현재 작업"><header><ListChecks size={19} aria-hidden="true" /><h2>현재 작업</h2></header><div className="organization-inspector-empty"><CircleDot size={18} aria-hidden="true" /><p>조직 그룹을 선택하면 해당 그룹에 등록된 정확한 manager, task, verifier thread만 표시합니다.</p></div></aside>;
  }
  const selectedManager = selectedThread
    ? findExactManagerAncestor(threads, selectedThread.thread_id)
    : null;
  const descendantProjection = selectedManager
    ? buildManagerDescendantProjection(threads, selectedManager.thread_id)
    : null;
  // A selected exact child remains in its manager scope.  When no exact
  // manager ancestor exists, show only that selected thread rather than
  // widening to peer managers in the group.
  const scopedThreads = selectedManager
    ? descendantProjection?.all_descendants ?? []
    : selectedThread
      ? [selectedThread]
      : sortedExactGroupThreads(group);
  const pageView = paginateExactItems(scopedThreads, page, 6);
  const scopedOwnerThreads = scopedThreads.filter((thread: any) => (
    thread.status === "owner_attention" && thread.attention_target === "owner"
  ));
  const scopedBuckets = buildRealtimeStatusBuckets(scopedThreads, scopedOwnerThreads);
  const directChildren = descendantProjection?.direct_children ?? [];
  const scopeLabel = selectedManager
    ? `${selectedManager.display_label} · 정확한 하위`
    : selectedThread
      ? `${selectedThread.display_label} · 상위 manager 미확정`
      : group.display_label;
  const scopeCount = selectedManager
    ? `선택 팀장 하위 ${pageView.total}`
    : selectedThread
      ? "선택 thread 1"
      : `정확한 등록 ${pageView.total}`;
  return (
    <aside className="organization-group-inspector" aria-label="현재 작업" data-testid="organization-group-inspector">
      <header><ListChecks size={19} aria-hidden="true" /><div><h2>현재 작업</h2><span>{scopeLabel}</span></div></header>
      <div className="organization-group-inspector-summary" data-testid="organization-inspector-scope"><strong>{scopeCount}</strong><RealtimeRollupCounts buckets={scopedBuckets} /></div>
      {pageView.items.length === 0 ? (
        <div className="organization-inspector-empty" data-testid="organization-manager-descendants-empty"><CircleDot size={18} aria-hidden="true" /><p>{selectedManager ? "등록된 parent_thread_id가 선택 팀장을 정확히 가리키는 하위 책임·TASK·검토 항목이 없습니다." : "선택 범위에 표시할 정확한 등록 항목이 없습니다."}</p></div>
      ) : (
        <div className="organization-group-thread-list">
          {pageView.items.map((thread: any) => (
            <button key={thread.thread_id} type="button" className={`${thread.thread_id === selectedThreadId ? "is-selected" : ""} ${hasExactObservedActiveLifecycle(thread) ? "is-active" : ""}`} aria-label={`${thread.display_label} · ${liveThreadStatusLabel(thread.status)}`} data-live-thread-id={thread.thread_id} data-testid={`organization-group-thread-${thread.thread_id}`} onClick={(event) => onSelect(thread.thread_id, event.currentTarget)}>
              <span className={`realtime-status-icon is-${thread.status}`}><CircleDot size={14} aria-hidden="true" /></span>
              <span><strong>{thread.display_label}</strong><small>{liveThreadRoleLabel(thread.thread_kind)} · 상위 {thread.parent_thread_id ?? "등록 root"}</small></span>
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      {pageView.page_count > 1 && <div className="organization-group-pagination"><button type="button" disabled={pageView.page === 0} onClick={() => setPage(pageView.page - 1)}>이전</button><span>{pageView.page + 1} / {pageView.page_count}</span><button type="button" disabled={pageView.page >= pageView.page_count - 1} onClick={() => setPage(pageView.page + 1)}>다음</button></div>}
      {selectedThread && (
        <section className="organization-group-current-work" aria-label="선택 thread 현재 작업"><header><Activity size={15} aria-hidden="true" /><strong>선택 thread</strong></header><p>{selectedThread.display_label}</p><dl><div><dt>work</dt><dd>{selectedThread.work_id ?? "미확정"}</dd></div><div><dt>직속 하위</dt><dd>{directChildCounts.get(selectedThread.thread_id) ?? 0}</dd></div><div><dt>결과 gate</dt><dd>{liveThreadResultStateLabel(selectedThread.result_state)}</dd></div><div><dt>수신자</dt><dd>{selectedThread.attention_target === "owner" ? "Owner" : selectedThread.attention_target === "parent" ? "상위 thread" : "없음"}</dd></div></dl></section>
      )}
      {selectedManager && (
        <section className="organization-manager-direct-children" aria-label={`${selectedManager.display_label}의 정확한 직속 하위 항목`} data-testid="organization-manager-direct-children">
          <header><ListChecks size={15} aria-hidden="true" /><strong>직속 하위 항목</strong><span>{directChildren.length}</span></header>
          {directChildren.length === 0 ? <p>등록된 parent_thread_id가 이 책임자를 정확히 가리키는 하위 항목이 없습니다.</p> : (
            <div>
              {directChildren.map((child: any) => (
                <button key={child.thread_id} type="button" className={hasExactObservedActiveLifecycle(child) ? "is-active" : ""} aria-label={`${child.display_label} · ${liveThreadRoleLabel(child.thread_kind)} · ${liveThreadStatusLabel(child.status)}`} data-live-thread-id={child.thread_id} data-testid={`organization-manager-child-${child.thread_id}`} onClick={(event) => onSelect(child.thread_id, event.currentTarget)}>
                  <span className={`realtime-status-icon is-${child.status}`}><CircleDot size={14} aria-hidden="true" /></span>
                  <span><strong>{child.display_label}</strong><small>{liveThreadRoleLabel(child.thread_kind)} · {child.work_id ?? "work 미확정"}</small></span>
                  <span className="organization-manager-status">{liveThreadStatusLabel(child.status)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      <p className="organization-inspector-note">상위 연결은 등록된 parent_thread_id만 표시합니다. 제목, idle, Stop, 시간으로 관계를 만들지 않습니다.</p>
    </aside>
  );
}

function OrganizationGroupFlow({
  organization,
  groups,
  threads,
  history,
  selectedGroupId,
  selectedThread,
  selectedThreadId,
  onSelectGroup,
  onSelect
}: {
  organization: any;
  groups: any[];
  threads: any[];
  history: any[];
  selectedGroupId: string | null;
  selectedThread: any;
  selectedThreadId: string | null;
  onSelectGroup: (groupId: string) => void;
  onSelect: (threadId: string, trigger: HTMLButtonElement) => void;
}) {
  const selectedGroup = groups.find((group) => group.organization_group_id === selectedGroupId) ?? null;
  const companies = organizationGroupsByCompany(groups, organization);
  const unassignedGroups = groups.filter((group) => group.catalog_state !== "assigned" || group.company_id === null);
  if (companies.length === 0 && organization?.health !== "available") {
    return <OrganizationCatalogHold organization={organization} groups={unassignedGroups} />;
  }
  if (groups.length === 0) {
    return <section className="live-state-panel" role="status"><ShieldAlert size={18} aria-hidden="true" /><div><h2>책임 흐름을 만들 수 없습니다</h2><p>현재 등록 조직 그룹이 없으므로 흐름을 추정하지 않았습니다.</p></div></section>;
  }
  return (
    <section className="organization-group-flow" role="tabpanel" aria-label="책임 흐름" data-testid="organization-responsibility-flow">
      <header className="organization-group-flow-headings"><span>회사</span><span>조직</span><span>팀장·책임 thread</span><span>실행·결과 상태</span></header>
      <div className="organization-group-flow-body">
        {companies.map((company: any) => (
          <section className="organization-group-flow-company" key={company.company_id}>
            <div className="organization-group-flow-company-card"><Building2 size={18} aria-hidden="true" /><strong>{company.label}</strong><small>조직 그룹 {company.groups.length}</small></div>
            <div className="organization-group-flow-groups">
              {company.groups.map((group: any) => {
                const managers = group.threads.filter((thread: any) => thread.thread_kind === "manager");
                const executionCount = group.threads.filter(isActiveTaskThread).length;
                const resultCount = group.threads.filter((thread: any) => thread.status === "owner_attention" || thread.status === "parent_result_ready").length;
                const primaryManager = managers[0] ?? null;
                return (
                  <button key={group.organization_group_id} type="button" className={group.organization_group_id === selectedGroupId ? "is-selected" : ""} onClick={() => onSelectGroup(group.organization_group_id)}>
                    <span className="organization-group-flow-identity"><UsersRound size={15} aria-hidden="true" /><strong>{group.display_label}</strong><small>{group.organization_group_id}</small></span>
                    <span className="organization-group-flow-manager"><UserRound size={15} aria-hidden="true" /><strong>{primaryManager?.display_label ?? "책임 thread 미등록"}</strong><small>정확한 manager {managers.length}</small></span>
                    <span className="organization-group-flow-execution"><Activity size={15} aria-hidden="true" /><strong>실행 TASK {executionCount}</strong><small>결과 gate {resultCount}</small></span>
                    <span className="organization-group-flow-status"><RealtimeRollupCounts buckets={group.buckets} /><ChevronRight size={14} aria-hidden="true" /></span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <OrganizationCatalogHold organization={organization} groups={unassignedGroups} />
      <OrganizationGroupFlowWorkStrip group={selectedGroup} threads={threads} history={history} selectedThread={selectedThread} selectedThreadId={selectedThreadId} onSelect={onSelect} />
      <footer><CircleCheckBig size={15} aria-hidden="true" />조직 그룹과 수치는 등록 metadata의 exact ID만 사용합니다. 개인 thread와 parent edge는 선택한 그룹에서만 drill-down 합니다.</footer>
    </section>
  );
}

function OrganizationGroupFlowWorkStrip({ group, threads, history, selectedThread, selectedThreadId, onSelect }: { group: any | null; threads: any[]; history: any[]; selectedThread: any; selectedThreadId: string | null; onSelect: (threadId: string, trigger: HTMLButtonElement) => void }) {
  if (!group) {
    return <section className="organization-group-flow-work-strip"><p>조직 그룹을 선택하면 해당 범위의 실행 TASK, 검토·결과, 완료·이력을 표시합니다.</p></section>;
  }
  const hierarchyThreads = [...threads, ...history];
  const selectedManager = selectedThread
    ? findExactManagerAncestor(hierarchyThreads, selectedThread.thread_id)
    : null;
  const descendants = selectedManager
    ? buildManagerDescendantProjection(hierarchyThreads, selectedManager.thread_id)
    : null;
  const scopedThreads = descendants
    ? descendants.all_descendants
    : selectedThread
      ? [selectedThread]
      : group.threads;
  const execution = scopedThreads.filter(isActiveTaskThread);
  const reviewResult = scopedThreads.filter((thread: any) => thread.status === "owner_attention" || (thread.status === "parent_result_ready" && thread.attention_target === "parent"));
  const completedHistory = selectedManager || selectedThread
    ? scopedThreads.filter((thread: any) => thread.status === "accepted_closed")
    : history.filter((thread: any) => thread.organization_group_id === group.organization_group_id && thread.status === "accepted_closed");
  return (
    <section className="organization-group-flow-work-strip" aria-label="선택 조직 그룹 업무 현황" data-testid="organization-flow-work-strip">
      <header><span>{selectedManager ? selectedManager.display_label : selectedThread ? selectedThread.display_label : group.display_label}</span><strong>{selectedManager ? "선택 팀장 하위 업무 현황" : selectedThread ? "선택 thread 업무 현황" : "선택 그룹 업무 현황"}</strong></header>
      <div><OrganizationFlowWorkColumn title="실행 TASK" icon={<Activity size={17} aria-hidden="true" />} threads={execution} selectedThreadId={selectedThreadId} onSelect={onSelect} emptyText="명시적 실행 TASK 없음" /><OrganizationFlowWorkColumn title="검토·결과" icon={<CircleCheckBig size={17} aria-hidden="true" />} threads={reviewResult} selectedThreadId={selectedThreadId} onSelect={onSelect} emptyText="명시 결과 gate 없음" /><OrganizationFlowWorkColumn title="완료·이력" icon={<History size={17} aria-hidden="true" />} threads={completedHistory} selectedThreadId={selectedThreadId} onSelect={onSelect} emptyText="수락·종료 이력 없음" /></div>
    </section>
  );
}

function OrganizationTreeMap({
  companies,
  selectedThread,
  selectedThreadId,
  expandedThreadIds,
  directChildCounts,
  onToggle,
  onSelect
}: {
  companies: any[];
  selectedThread: any;
  selectedThreadId: string | null;
  expandedThreadIds: Set<string>;
  directChildCounts: Map<string, number>;
  onToggle: (threadId: string) => void;
  onSelect: (threadId: string, trigger: HTMLButtonElement) => void;
}) {
  if (companies.length === 0) {
    return <section className="live-state-panel" role="status"><ShieldAlert size={18} aria-hidden="true" /><div><h2>정확한 조직 트리가 없습니다</h2><p>현재 등록 항목 또는 명시된 parent edge가 없어서 조직 관계를 만들지 않았습니다.</p></div></section>;
  }
  return (
    <div className="organization-tree-layout" role="tabpanel" aria-label="조직 트리">
      <section className="organization-tree-canvas" aria-label="정확한 조직 트리">
        <header>
          <div><Building2 size={19} aria-hidden="true" /><div><span>REGISTERED ORGANIZATION</span><h2>정확한 조직 트리</h2></div></div>
          <span>선택한 node의 상세는 오른쪽에 표시됩니다</span>
        </header>
        <div className="organization-tree-root">
          <span>등록 조직</span>
          <strong>현재 exact thread hierarchy</strong>
          <small>회사 {companies.length} · parent edge만 연결</small>
        </div>
        <div className="organization-company-grid">
          {companies.map((company) => (
            <section className="organization-tree-company" key={company.organization_company_id} aria-labelledby={`organization-tree-company-${company.organization_company_id}`}>
              <header>
                <Building2 size={17} aria-hidden="true" />
                <div><span>COMPANY</span><h3 id={`organization-tree-company-${company.organization_company_id}`}>{company.label}</h3></div>
                <strong>{company.roots.reduce((total: number, root: any) => total + countTreeNodes(root), 0)}</strong>
              </header>
              <ul className="organization-tree-node-list">
                {company.roots.map((root: any) => (
                  <OrganizationTreeMapNode
                    key={root.thread_id}
                    node={root}
                    depth={0}
                    selectedThreadId={selectedThreadId}
                    expandedThreadIds={expandedThreadIds}
                    directChildCounts={directChildCounts}
                    onToggle={onToggle}
                    onSelect={onSelect}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
      <OrganizationTreeInspector thread={selectedThread} directChildCounts={directChildCounts} />
    </div>
  );
}

function OrganizationTreeMapNode({
  node,
  depth,
  selectedThreadId,
  expandedThreadIds,
  directChildCounts,
  onToggle,
  onSelect
}: {
  node: any;
  depth: number;
  selectedThreadId: string | null;
  expandedThreadIds: Set<string>;
  directChildCounts: Map<string, number>;
  onToggle: (threadId: string) => void;
  onSelect: (threadId: string, trigger: HTMLButtonElement) => void;
}) {
  const hasChildren = node.children.length > 0;
  const expanded = depth < 1 || expandedThreadIds.has(node.thread_id);
  const role = liveThreadRoleLabel(node.thread_kind);
  return (
    <li className={`organization-tree-node depth-${Math.min(depth, 3)}`}>
      <div className={`organization-tree-node-card ${node.thread_id === selectedThreadId ? "is-selected" : ""}`}>
        <button
          type="button"
          className="organization-tree-node-select"
          data-live-thread-id={node.thread_id}
          data-testid={`organization-tree-node-${node.thread_id}`}
          aria-expanded={node.thread_id === selectedThreadId}
          onClick={(event) => onSelect(node.thread_id, event.currentTarget)}
        >
          <span className={`realtime-status-icon is-${node.status}`}><CircleDot size={15} aria-hidden="true" /></span>
          <span><strong>{node.display_label}</strong><small>{role} · {organizationGroupLabel(node.organization_group_id)}</small></span>
          <span className="organization-tree-node-metrics">하위 {directChildCounts.get(node.thread_id) ?? 0} · 결과 {node.child_result_count}</span>
          <code>{node.thread_id}</code>
        </button>
        {hasChildren && (
          <button className="organization-tree-node-toggle" type="button" aria-label={`${node.display_label} 하위 ${node.children.length}건 ${expanded ? "접기" : "펼치기"}`} aria-expanded={expanded} onClick={() => onToggle(node.thread_id)}>
            {expanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
          </button>
        )}
      </div>
      {hasChildren && expanded && (
        <ul className="organization-tree-node-list">
          {node.children.map((child: any) => (
            <OrganizationTreeMapNode
              key={child.thread_id}
              node={child}
              depth={depth + 1}
              selectedThreadId={selectedThreadId}
              expandedThreadIds={expandedThreadIds}
              directChildCounts={directChildCounts}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function OrganizationTreeInspector({ thread, directChildCounts }: { thread: any; directChildCounts: Map<string, number> }) {
  if (!thread) {
    return (
      <aside className="organization-tree-inspector" aria-label="현재 작업">
        <header><ListChecks size={19} aria-hidden="true" /><h2>현재 작업</h2></header>
        <div className="organization-inspector-empty"><CircleDot size={18} aria-hidden="true" /><p>조직 node를 선택하면 등록된 정확한 ID의 상태, work, 결과 gate를 표시합니다.</p></div>
      </aside>
    );
  }
  return (
    <aside className="organization-tree-inspector" aria-label="현재 작업">
      <header><ListChecks size={19} aria-hidden="true" /><h2>현재 작업</h2></header>
      <div className="organization-inspector-thread">
        <span className={`realtime-status-icon is-${thread.status}`}><CircleDot size={16} aria-hidden="true" />{liveThreadStatusLabel(thread.status)}</span>
        <strong>{thread.display_label}</strong>
        <code>{thread.thread_id}</code>
        <dl>
          <div><dt>역할</dt><dd>{liveThreadRoleLabel(thread.thread_kind)}</dd></div>
          <div><dt>work</dt><dd>{thread.work_id ?? "미확정"}</dd></div>
          <div><dt>직속 하위</dt><dd>{directChildCounts.get(thread.thread_id) ?? 0}</dd></div>
          <div><dt>결과 gate</dt><dd>{liveThreadResultStateLabel(thread.result_state)}</dd></div>
          <div><dt>수신자</dt><dd>{thread.attention_target === "owner" ? "Owner" : thread.attention_target === "parent" ? "상위 thread" : "없음"}</dd></div>
          <div><dt>마지막 관측</dt><dd>{formatRefreshTime(thread.updated_at)}</dd></div>
        </dl>
      </div>
      <p className="organization-inspector-note">idle, Stop, 제목, 경과 시간은 결과나 attention을 만들지 않습니다.</p>
    </aside>
  );
}

function OrganizationResponsibilityFlow({
  companies,
  history,
  selectedThreadId,
  onSelect
}: {
  companies: any[];
  history: any[];
  selectedThreadId: string | null;
  onSelect: (threadId: string, trigger: HTMLButtonElement) => void;
}) {
  if (companies.length === 0) {
    return <section className="live-state-panel" role="status"><ShieldAlert size={18} aria-hidden="true" /><div><h2>책임 흐름을 만들 수 없습니다</h2><p>명시된 exact parent edge가 없으므로 책임 흐름을 추정하지 않았습니다.</p></div></section>;
  }
  return (
    <section className="organization-responsibility-flow" role="tabpanel" aria-label="책임 흐름" data-testid="organization-responsibility-flow">
      <header className="organization-flow-headings">
        <span>회사</span><span>등록 root</span><span>직속 조직 thread</span><span>직속 책임 thread</span>
      </header>
      <div className="organization-flow-body">
        {companies.map((company) => <OrganizationFlowCompany key={company.organization_company_id} company={company} selectedThreadId={selectedThreadId} onSelect={onSelect} />)}
      </div>
      <OrganizationFlowWorkStrip companies={companies} history={history} selectedThreadId={selectedThreadId} onSelect={onSelect} />
      <footer>
        <CircleCheckBig size={15} aria-hidden="true" />
        선은 등록된 parent_thread_id만 나타냅니다. 각 열은 최근 4개 exact node만 요약하며, 전체 계층은 조직 트리에서 확인합니다.
      </footer>
    </section>
  );
}

function flattenOrganizationTree(node: any): any[] {
  return [node, ...(Array.isArray(node?.children) ? node.children.flatMap((child: any) => flattenOrganizationTree(child)) : [])];
}

function OrganizationFlowWorkStrip({
  companies,
  history,
  selectedThreadId,
  onSelect
}: {
  companies: any[];
  history: any[];
  selectedThreadId: string | null;
  onSelect: (threadId: string, trigger: HTMLButtonElement) => void;
}) {
  const currentThreads = companies.flatMap((company) => company.roots.flatMap((root: any) => flattenOrganizationTree(root)));
  const execution = currentThreads.filter(isActiveTaskThread);
  const reviewResult = currentThreads.filter((thread: any) => (
    thread.status === "owner_attention" || (thread.status === "parent_result_ready" && thread.attention_target === "parent")
  ));
  const completedHistory = history.filter((thread: any) => thread.status === "accepted_closed");
  return (
    <section className="organization-flow-work-strip" aria-label="선택 범위 업무 현황" data-testid="organization-flow-work-strip">
      <OrganizationFlowWorkColumn title="실행 TASK" icon={<Activity size={17} aria-hidden="true" />} threads={execution} selectedThreadId={selectedThreadId} onSelect={onSelect} emptyText="명시적 실행 TASK 없음" />
      <OrganizationFlowWorkColumn title="검토·결과" icon={<CircleCheckBig size={17} aria-hidden="true" />} threads={reviewResult} selectedThreadId={selectedThreadId} onSelect={onSelect} emptyText="명시 결과 gate 없음" />
      <OrganizationFlowWorkColumn title="완료·이력" icon={<History size={17} aria-hidden="true" />} threads={completedHistory} selectedThreadId={selectedThreadId} onSelect={onSelect} emptyText="수락·종료 이력 없음" />
    </section>
  );
}

function OrganizationFlowWorkColumn({
  title,
  icon,
  threads,
  selectedThreadId,
  onSelect,
  emptyText
}: {
  title: string;
  icon: React.ReactNode;
  threads: any[];
  selectedThreadId: string | null;
  onSelect: (threadId: string, trigger: HTMLButtonElement) => void;
  emptyText: string;
}) {
  const visibleThreads = threads.slice(0, 3);
  return (
    <section className="organization-flow-work-column" aria-label={title}>
      <header><div>{icon}<h2>{title}</h2></div><strong>{threads.length}</strong></header>
      {visibleThreads.length === 0 ? <p>{emptyText}</p> : visibleThreads.map((thread) => (
        <button key={thread.thread_id} type="button" className={`${thread.thread_id === selectedThreadId ? "is-selected" : ""} ${hasExactObservedActiveLifecycle(thread) ? "is-active" : ""}`} aria-label={`${thread.display_label} · ${liveThreadStatusLabel(thread.status)}`} data-live-thread-id={thread.thread_id} onClick={(event) => onSelect(thread.thread_id, event.currentTarget)}>
          <span className={`realtime-status-icon is-${thread.status}`}><CircleDot size={13} aria-hidden="true" /></span>
          <span><strong>{thread.display_label}</strong><small>{thread.work_id ?? "work 미확정"}</small></span>
        </button>
      ))}
      {threads.length > visibleThreads.length && <small className="organization-flow-more">총 {threads.length}건 중 최근 3건</small>}
    </section>
  );
}

function OrganizationFlowCompany({ company, selectedThreadId, onSelect }: { company: any; selectedThreadId: string | null; onSelect: (threadId: string, trigger: HTMLButtonElement) => void }) {
  const roots = company.roots;
  const directChildren = roots.flatMap((root: any) => root.children);
  const responsibilityThreads = directChildren.flatMap((node: any) => node.children);
  return (
    <section className="organization-flow-company" aria-labelledby={`organization-flow-${company.organization_company_id}`}>
      <div className="organization-flow-company-card"><Building2 size={19} aria-hidden="true" /><strong id={`organization-flow-${company.organization_company_id}`}>{company.label}</strong><span>정확한 등록 {roots.reduce((total: number, root: any) => total + countTreeNodes(root), 0)}</span></div>
      <OrganizationFlowColumn threads={roots} selectedThreadId={selectedThreadId} onSelect={onSelect} emptyText="등록 root 없음" />
      <OrganizationFlowColumn threads={directChildren} selectedThreadId={selectedThreadId} onSelect={onSelect} emptyText="직속 조직 thread 없음" />
      <OrganizationFlowColumn threads={responsibilityThreads} selectedThreadId={selectedThreadId} onSelect={onSelect} emptyText="직속 책임 thread 없음" />
    </section>
  );
}

function OrganizationFlowColumn({ threads, selectedThreadId, onSelect, emptyText }: { threads: any[]; selectedThreadId: string | null; onSelect: (threadId: string, trigger: HTMLButtonElement) => void; emptyText: string }) {
  const visibleThreads = threads.slice(0, 4);
  return (
    <div className="organization-flow-column">
      {visibleThreads.length === 0 ? <span className="organization-flow-empty">{emptyText}</span> : visibleThreads.map((thread) => (
        <button key={thread.thread_id} type="button" className={`organization-flow-thread ${thread.thread_id === selectedThreadId ? "is-selected" : ""}`} data-live-thread-id={thread.thread_id} data-testid={`organization-flow-node-${thread.thread_id}`} onClick={(event) => onSelect(thread.thread_id, event.currentTarget)}>
          <span className={`realtime-status-icon is-${thread.status}`}><CircleDot size={14} aria-hidden="true" /></span>
          <span><strong>{thread.display_label}</strong><small>{liveThreadRoleLabel(thread.thread_kind)} · 하위 {thread.direct_child_count} · 결과 {thread.child_result_count}</small></span>
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      ))}
      {threads.length > visibleThreads.length && <small className="organization-flow-more">총 {threads.length}건 · 조직 트리에서 전체 확인</small>}
    </div>
  );
}

function OrganizationHierarchy({
  companies,
  expandedThreadIds,
  selectedThreadId,
  storage,
  onToggle,
  onSelect
}: {
  companies: any[];
  expandedThreadIds: Set<string>;
  selectedThreadId: string | null;
  storage: Storage | null;
  onToggle: (threadId: string) => void;
  onSelect: (threadId: string, trigger: HTMLButtonElement) => void;
}) {
  if (companies.length === 0) {
    return <section className="live-state-panel" role="status"><ShieldAlert size={18} aria-hidden="true" /><div><h2>표시할 정확 등록 조직 계층이 없습니다</h2><p>등록이 없거나 관측이 비상 중지된 상태입니다.</p></div></section>;
  }
  return (
    <section className="live-organization-hierarchy" aria-labelledby="organization-hierarchy-heading" data-testid="organization-hierarchy">
      <header>
        <div>
          <span>TWO-COMPANY · EXACT PARENT EDGES</span>
          <h2 id="organization-hierarchy-heading">조직도</h2>
          <p>두 회사 아래에서 exact parent-child thread만 펼칩니다. 이름·경로·idle로 관계를 추정하지 않습니다.</p>
        </div>
      </header>
      {companies.map((company) => (
        <section className="live-company-tree" key={company.organization_company_id} aria-labelledby={`company-${company.organization_company_id}`}>
          <header><span>COMPANY</span><h3 id={`company-${company.organization_company_id}`}>{company.label}</h3><strong>{company.roots.length}</strong></header>
          <ul className="live-thread-tree">
            {company.roots.map((node: any) => (
              <OrganizationTreeNode
                key={node.thread_id}
                node={node}
                expandedThreadIds={expandedThreadIds}
                selectedThreadId={selectedThreadId}
                storage={storage}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}

function OrganizationTreeNode({
  node,
  expandedThreadIds,
  selectedThreadId,
  storage,
  onToggle,
  onSelect
}: {
  node: any;
  expandedThreadIds: Set<string>;
  selectedThreadId: string | null;
  storage: Storage | null;
  onToggle: (threadId: string) => void;
  onSelect: (threadId: string, trigger: HTMLButtonElement) => void;
}) {
  const hasChildren = node.children.length > 0;
  const expanded = expandedThreadIds.has(node.thread_id);
  const role = liveThreadRoleLabel(node.thread_kind);
  return (
    <li className="live-thread-tree-node">
      <div className={`live-thread-tree-row ${node.thread_id === selectedThreadId ? "is-selected" : ""}`}>
        {hasChildren ? (
          <button className="live-tree-toggle" type="button" data-testid={`tree-toggle-${node.thread_id}`} aria-label={`${node.display_label} 하위 ${node.direct_child_count}건 ${expanded ? "접기" : "펼치기"}`} aria-expanded={expanded} onClick={() => onToggle(node.thread_id)}>
            {expanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
          </button>
        ) : <span className="live-tree-leaf" aria-hidden="true" />}
        <button className="live-tree-select" type="button" data-live-thread-id={node.thread_id} data-testid={`organization-thread-${node.thread_id}`} aria-expanded={node.thread_id === selectedThreadId} onClick={(event) => onSelect(node.thread_id, event.currentTarget)}>
          <span className="live-card-meta"><span>{role}</span><span className={`live-status live-status-${node.status}`}>{liveThreadStatusLabel(node.status)}</span>{isAcknowledgeableLiveThread(node) && isLiveThreadAcknowledged(storage, node) && <span className="live-ack-badge">로컬 확인됨</span>}</span>
          <strong>{node.display_label}</strong>
          <span className="live-tree-summary">직속 {node.direct_child_count} · 하위 결과 {node.child_result_count} · {liveThreadResultStateLabel(node.result_state)}</span>
          <code>{node.thread_id}</code>
        </button>
      </div>
      {hasChildren && expanded && (
        <ul className="live-thread-tree">
          {node.children.map((child: any) => <OrganizationTreeNode key={child.thread_id} node={child} expandedThreadIds={expandedThreadIds} selectedThreadId={selectedThreadId} storage={storage} onToggle={onToggle} onSelect={onSelect} />)}
        </ul>
      )}
    </li>
  );
}

function LiveThreadCard({
  thread,
  selected,
  acknowledged,
  directChildCount,
  onSelect
}: {
  thread: any;
  selected: boolean;
  acknowledged: boolean;
  directChildCount: number;
  onSelect: (threadId: string, trigger: HTMLButtonElement) => void;
}) {
  const role = liveThreadRoleLabel(thread.thread_kind);
  const routeSummary = thread.organization_route_state === "exact"
    ? `실제 ${role} · exact binding 관측`
    : `실제 ${role} · 조직 route 미확정 · 자동 라우팅 HOLD`;
  return (
    <button
      className={`live-thread-card ${selected ? "is-selected" : ""}`}
      type="button"
      data-live-thread-id={thread.thread_id}
      data-testid={`live-thread-card-${thread.thread_id}`}
      aria-expanded={selected}
      onClick={(event) => onSelect(thread.thread_id, event.currentTarget)}
    >
      <span className="live-card-meta">
        <span>{role}</span>
        <span className={`live-status live-status-${thread.status}`}>{liveThreadStatusLabel(thread.status)}</span>
        {acknowledged && <span className="live-ack-badge">로컬 확인됨</span>}
      </span>
      <strong>{thread.display_label}</strong>
      <span className="live-card-secondary">{routeSummary}</span>
      <span className="live-tree-summary">직속 {directChildCount} · 하위 결과 {thread.child_result_count} · {liveThreadResultStateLabel(thread.result_state)}</span>
      <code>{thread.thread_id}</code>
      <span className="live-card-bottom">
        <span>{thread.work_id ?? "work 미확정"}</span>
        <ChevronRight size={16} aria-hidden="true" />
      </span>
    </button>
  );
}

function LiveThreadDetail({
  thread,
  organization,
  acknowledged,
  directChildCount,
  isModal,
  panelRef,
  closeButtonRef,
  onClose,
  onAcknowledge,
  onRestore
}: {
  thread: any;
  organization: any;
  acknowledged: boolean;
  directChildCount: number;
  isModal: boolean;
  panelRef: React.MutableRefObject<HTMLElement | null>;
  closeButtonRef: React.MutableRefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onAcknowledge: () => void;
  onRestore: () => void;
}) {
  const role = liveThreadRoleLabel(thread.thread_kind);
  const routeHold = thread.organization_route_state !== "exact";
  return (
    <aside
      className={`live-thread-detail ${isModal ? "is-modal" : ""}`}
      ref={panelRef}
      role={isModal ? "dialog" : undefined}
      aria-modal={isModal || undefined}
      aria-labelledby="live-thread-detail-title"
    >
      <header>
        <div>
          <span>ACTUAL CODEX THREAD · READ ONLY</span>
          <h2 id="live-thread-detail-title">{thread.display_label}</h2>
          <p className="live-detail-role">{routeHold ? `${role} · route HOLD` : `${role} · exact binding`}</p>
        </div>
        <button ref={closeButtonRef} type="button" aria-label="상세 닫기" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="live-detail-id"><code>{thread.thread_id}</code></div>
      <dl className="live-detail-grid">
        <div><dt>상태</dt><dd>{liveThreadStatusLabel(thread.status)}</dd></div>
        <div><dt>실시간 관측</dt><dd>{thread.observed ? "관측됨" : "미관측"}</dd></div>
        <div><dt>조직 그룹</dt><dd>{organizationGroupLabel(thread.organization_group_id, organization)}</dd></div>
        <div><dt>work</dt><dd>{thread.work_id ?? "미확정"}</dd></div>
        <div><dt>상위 thread</dt><dd>{thread.parent_thread_id ? <code>{thread.parent_thread_id}</code> : "직속 root"}</dd></div>
        <div><dt>직속 하위</dt><dd>{directChildCount}건</dd></div>
        <div><dt>하위 결과</dt><dd>{thread.child_result_count}건</dd></div>
        <div><dt>결과 게이트</dt><dd>{liveThreadResultStateLabel(thread.result_state)}</dd></div>
        <div><dt>결과 수신자</dt><dd>{thread.attention_target === "owner" ? "Owner" : thread.attention_target === "parent" ? "정확한 상위 thread" : "없음"}</dd></div>
        <div><dt>응답/turn 종료 관측</dt><dd>{thread.stop_observed_at ? formatRefreshTime(thread.stop_observed_at) : "없음"}</dd></div>
        <div><dt>관계</dt><dd>{thread.relationship}</dd></div>
        <div><dt>등록 lifecycle</dt><dd>{thread.lifecycle}</dd></div>
      </dl>
      <section className={`live-route-state ${routeHold ? "is-hold" : ""}`}>
        <h3>{routeHold ? `실제 ${role} · 조직 route 미확정 · 자동 라우팅 HOLD` : "separate exact binding supplied"}</h3>
        <p>{routeHold ? "등록은 가시성 권한만 부여합니다. route catalog 또는 live binding authority를 만들거나 추정하지 않습니다." : "실행 가능성은 separate exact binding의 metadata 값만 반영합니다."}</p>
        <dl>
          <div><dt>route</dt><dd>{thread.route_id ?? "미확정"}</dd></div>
          <div><dt>execution ready</dt><dd>{thread.execution_ready ? "true" : "false"}</dd></div>
        </dl>
      </section>
      <section className="live-detail-actions">
        {isAcknowledgeableLiveThread(thread) && !acknowledged && (
          <button className="live-acknowledge-button" type="button" onClick={onAcknowledge}>
            <Check size={15} aria-hidden="true" />
            읽었음 · 현황에서 숨기기
          </button>
        )}
        {acknowledged && (
          <button className="live-restore-button" type="button" onClick={onRestore}>
            <ArchiveRestore size={15} aria-hidden="true" />
            Active로 복원
          </button>
        )}
        <p>이 동작은 이 브라우저의 localStorage만 바꾸며, Codex TASK를 완료·보관·변경하지 않습니다.</p>
      </section>
    </aside>
  );
}

function formatUsageNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatUsageCredits(value: number | null) {
  return value === null ? "UNKNOWN" : value.toFixed(4);
}

function fleetTokenLabel(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(value);
}

function fleetSparkline(series: number[], width = 200, top = 5, bottom = 30) {
  const values = (Array.isArray(series) ? series : []).map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const points = values.map((value, index) => ({
    x: Math.round(index * step * 10) / 10,
    y: Math.round((bottom - (value / max) * (bottom - top)) * 10) / 10,
  }));
  return {
    points: points.map((point) => `${point.x},${point.y}`).join(" "),
    tip: points[points.length - 1],
  };
}

// 다음 갱신일(KST·요일)을 앞세우고 상대시간을 병기 — 계정마다 리셋 날짜가 달라 비교가 필요하다.
function fleetResetAtLabel(resetsAtMs: number | null): string {
  if (resetsAtMs === null || !Number.isFinite(resetsAtMs)) return "리셋 미상";
  const deltaMs = resetsAtMs - Date.now();
  if (deltaMs <= 0) return "리셋 경과";
  const kst = new Date(resetsAtMs + 9 * 3_600_000);
  const nowKst = new Date(Date.now() + 9 * 3_600_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  const sameDay = kst.getUTCFullYear() === nowKst.getUTCFullYear()
    && kst.getUTCMonth() === nowKst.getUTCMonth() && kst.getUTCDate() === nowKst.getUTCDate();
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][kst.getUTCDay()];
  const dayLabel = sameDay ? "오늘" : `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}(${weekday})`;
  const absolute = `${dayLabel} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
  let relative;
  if (deltaMs < 3_600_000) relative = `${Math.floor(deltaMs / 60_000)}m 후`;
  else if (deltaMs < 24 * 3_600_000) relative = `${Math.floor(deltaMs / 3_600_000)}h ${Math.floor((deltaMs % 3_600_000) / 60_000)}m 후`;
  else relative = `${Math.round(deltaMs / 86_400_000)}일 후`;
  return `${absolute} · ${relative}`;
}

function fleetObservedAgoLabel(observedAt: string): string {
  const ms = Date.parse(observedAt);
  if (!Number.isFinite(ms)) return "관측 시각 미상";
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (minutes < 90) return `${minutes}분 전 관측`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)}시간 전 관측`;
  return `${Math.round(minutes / 1440)}일 전 관측`;
}

function fleetCreditLabel(totals: any): string {
  // The generic Meter aggregate has no model-prefix provider attribution.
  const credits = totals?.credits === null || totals?.credits === undefined
    ? "미확정"
    : Math.round(totals.credits).toLocaleString("en-US");
  return `Meter 크레딧 ${credits}`;
}

const FLEET_TOKEN_PROVIDERS = [
  { id: "codex", label: "Codex" },
  { id: "claude", label: "Claude" },
  { id: "antigravity", label: "Antigravity/Gemini" },
];

function fleetAxisTokenLabel(value: number): string {
  if (value >= 1_000_000_000) return `${Number((value / 1_000_000_000).toFixed(1))}B`;
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}K`;
  return Math.round(value).toLocaleString("en-US");
}

function buildProviderTokenChart(providerDaily: any[]) {
  const series = FLEET_TOKEN_PROVIDERS.map((provider) => ({
    ...provider,
    values: providerDaily.map((row: any) => row.providers?.find((entry: any) => entry.provider === provider.id)?.total_tokens ?? null),
    unknownTurns: providerDaily.map((row: any) => row.providers?.find((entry: any) => entry.provider === provider.id)?.token_unknown_turns ?? 0),
  }));
  const knownTokens = series.flatMap((item) => item.values.filter((value: any) => typeof value === "number"));
  if (providerDaily.length !== 30 || knownTokens.length === 0) return { series, chart: null };
  const width = 1000, height = 220, left = 105, right = 8, top = 12, bottom = 36;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const totals = providerDaily.map((_: any, index: number) => series.reduce((sum, item) => sum + (typeof item.values[index] === "number" ? item.values[index] : 0), 0));
  const rawMax = Math.max(...totals, 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawMax));
  const maxToken = Math.ceil(rawMax / magnitude) * magnitude;
  const x = (index: number) => left + (index * plotWidth) / 29;
  const y = (value: number) => top + plotHeight - (value / maxToken) * plotHeight;
  const cumulative = providerDaily.map(() => 0);
  const areas = series.map((item) => {
    const lower = cumulative.slice();
    const upper = item.values.map((value: any, index: number) => {
      cumulative[index] += typeof value === "number" ? value : 0;
      return cumulative[index];
    });
    return {
      id: item.id,
      path: monotoneAreaPath(
        upper.map((value: number, index: number) => ({ x: x(index), y: y(value) })),
        lower.map((value: number, index: number) => ({ x: x(index), y: y(value) })),
      ),
    };
  });
  return { series, chart: { width, height, left, right, top, bottom, plotWidth, plotHeight, maxToken, totals, areas, x, y } };
}

const USAGE_TREND_COLORS = ["#d7e9ff", "#64aaf7", "#317fdf", "#23599f", "#c7a8f4", "#945be5", "#6840ae", "#546174"];

function buildModelTokenSeries(modelDaily: any[]) {
  const totals = new Map<string, number>();
  for (const day of modelDaily) {
    for (const row of day.models ?? []) totals.set(row.model_id, (totals.get(row.model_id) ?? 0) + row.total_tokens);
  }
  const ordered = [...totals].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "en"));
  const ids = ordered.slice(0, 7).map(([id]) => id);
  const hasOther = ordered.length > ids.length;
  return [...ids.map((id) => ({ id, label: id })), ...(hasOther ? [{ id: "other", label: "기타 모델" }] : [])].map((series) => ({
    ...series,
    values: modelDaily.map((day: any) => (day.models ?? []).reduce((sum: number, row: any) => (
      series.id === "other" ? (ids.includes(row.model_id) ? sum : sum + row.total_tokens) : sum + (row.model_id === series.id ? row.total_tokens : 0)
    ), 0)),
    unknownTurns: modelDaily.map((day: any) => (day.models ?? []).reduce((sum: number, row: any) => (
      series.id === "other" ? (ids.includes(row.model_id) ? sum : sum + row.token_unknown_turns) : sum + (row.model_id === series.id ? row.token_unknown_turns : 0)
    ), 0)),
  }));
}

function buildProviderTokenSeries(providerDaily: any[]) {
  return FLEET_TOKEN_PROVIDERS.map((provider) => ({
    ...provider,
    values: providerDaily.map((row: any) => row.providers?.find((entry: any) => entry.provider === provider.id)?.total_tokens ?? 0),
    unknownTurns: providerDaily.map((row: any) => row.providers?.find((entry: any) => entry.provider === provider.id)?.token_unknown_turns ?? 0),
  }));
}

function buildUsageTrendChart(days: any[], series: any[], requestSeries: any[] = []) {
  if (days.length !== 30 || series.length === 0) return null;
  const hasAgOverlay = requestSeries.length > 0 && requestSeries.some((s: any) => (s.totalRequests ?? 0) > 0);
  const width = 1000, height = 238, left = 58, right = hasAgOverlay ? 48 : 12, top = 16, bottom = 34;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const totals = days.map((_: any, index: number) => series.reduce((sum: number, item: any) => sum + (item.values[index] ?? 0), 0));
  const rawMax = Math.max(...totals, 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawMax));
  const maxToken = Math.ceil(rawMax / magnitude) * magnitude;

  const rawMaxReq = hasAgOverlay ? Math.max(...requestSeries.flatMap((s: any) => s.values ?? []), 1) : 0;
  const magnitudeReq = hasAgOverlay ? 10 ** Math.floor(Math.log10(rawMaxReq)) : 1;
  const maxRequests = hasAgOverlay ? Math.max(1, Math.ceil(rawMaxReq / magnitudeReq) * magnitudeReq) : 0;

  const x = (index: number) => left + (index * plotWidth) / 29;
  const y = (value: number) => top + plotHeight - (value / maxToken) * plotHeight;
  const yReq = (value: number) => top + plotHeight - (maxRequests > 0 ? (value / maxRequests) * plotHeight : 0);

  const cumulative = days.map(() => 0);
  const areas = series.map((item: any) => {
    const lower = cumulative.slice();
    const upper = item.values.map((value: number, index: number) => (cumulative[index] += value));
    return {
      id: item.id,
      stacked: monotoneAreaPath(upper.map((value: number, index: number) => ({ x: x(index), y: y(value) })), lower.map((value: number, index: number) => ({ x: x(index), y: y(value) }))),
      isolated: monotoneAreaPath(item.values.map((value: number, index: number) => ({ x: x(index), y: y(value) })), days.map((_: any, index: number) => ({ x: x(index), y: y(0) }))),
    };
  });

  const requestOverlays = hasAgOverlay
    ? requestSeries.map((fam: any) => {
        const points = fam.values.map((val: number, index: number) => ({ x: x(index), y: yReq(val) }));
        return {
          id: fam.id,
          label: fam.label,
          color: fam.color,
          values: fam.values,
          points,
          path: monotoneLinePath(points),
        };
      })
    : [];

  return {
    width,
    height,
    left,
    right,
    top,
    bottom,
    plotWidth,
    plotHeight,
    maxToken,
    maxRequests,
    hasAgOverlay,
    totals,
    areas,
    requestOverlays,
    x,
    y,
    yReq,
  };
}

function UsageTrendChart({ usage }: { usage: any }) {
  const [view, setView] = useState<"model" | "provider">("model");
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null);
  const [selectedReqFamily, setSelectedReqFamily] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const modelDaily = Array.isArray(usage?.history?.model_daily) ? usage.history.model_daily : [];
  const providerDaily = Array.isArray(usage?.history?.provider_daily) ? usage.history.provider_daily : [];
  const unmeasuredDaily = Array.isArray(usage?.history?.unmeasured_request_daily) && usage.history.unmeasured_request_daily.length === 30
    ? usage.history.unmeasured_request_daily
    : [];

  const days = view === "model" ? modelDaily : providerDaily;
  const series = view === "model" ? buildModelTokenSeries(modelDaily) : buildProviderTokenSeries(providerDaily);

  const hasValidAgDaily = unmeasuredDaily.length === 30;
  const requestSeries = hasValidAgDaily
    ? [
        {
          id: "ag_gemini",
          label: "AG·Gemini",
          color: "#2dd4bf",
          values: unmeasuredDaily.map((d: any) => d.families?.find((f: any) => f.family_id === "ag_gemini")?.requests ?? 0),
          models: unmeasuredDaily.map((d: any) => d.families?.find((f: any) => f.family_id === "ag_gemini")?.models ?? []),
          totalRequests: unmeasuredDaily.reduce((sum: number, d: any) => sum + (d.families?.find((f: any) => f.family_id === "ag_gemini")?.requests ?? 0), 0),
        },
        {
          id: "ag_claude_gpt",
          label: "AG·Claude+GPT",
          color: "#fb923c",
          values: unmeasuredDaily.map((d: any) => d.families?.find((f: any) => f.family_id === "ag_claude_gpt")?.requests ?? 0),
          models: unmeasuredDaily.map((d: any) => d.families?.find((f: any) => f.family_id === "ag_claude_gpt")?.models ?? []),
          totalRequests: unmeasuredDaily.reduce((sum: number, d: any) => sum + (d.families?.find((f: any) => f.family_id === "ag_claude_gpt")?.requests ?? 0), 0),
        },
      ]
    : [];
  const totalAgRequests = requestSeries.reduce((sum, item) => sum + item.totalRequests, 0);
  const showAgOverlay = hasValidAgDaily && totalAgRequests > 0;

  const chart = buildUsageTrendChart(days, series, showAgOverlay ? requestSeries : []);
  const knownTokens = series.reduce((sum: number, item: any) => sum + item.values.reduce((local: number, value: number) => local + value, 0), 0);
  const dailyTurns = modelDaily.reduce((sum: number, day: any) => sum + (day.models ?? []).reduce((local: number, row: any) => local + row.turns, 0), 0);
  const unknownTurns = series.reduce((sum: number, item: any) => sum + item.unknownTurns.reduce((local: number, value: number) => local + value, 0), 0);
  const chooseView = (next: "model" | "provider") => { setView(next); setSelectedSeries(null); setSelectedReqFamily(null); setActiveIndex(null); };
  if (chart === null) return <p className="usage-trend-empty">최근 30일의 정확한 로컬 토큰 시계열이 없습니다.</p>;
  return (
    <div className={`usage-trend${showAgOverlay ? " has-req-overlay" : ""}`} data-testid="usage-trend-chart" data-view={view}>
      <header className="usage-trend-header">
        <div>
          <span>토큰</span>
          <strong>{formatUsageNumber(knownTokens)}</strong>
          <small>{formatUsageNumber(dailyTurns)}회{showAgOverlay ? " (측정 원장)" : ""} · KST 최근 30일{showAgOverlay ? ` · AG ${formatUsageNumber(totalAgRequests)}회 (토큰 미측정)` : ""}</small>
        </div>
        <div className="usage-trend-tabs" role="tablist" aria-label="사용량 분류">
          <button type="button" role="tab" aria-selected={view === "model"} onClick={() => chooseView("model")}>모델별</button>
          <button type="button" role="tab" aria-selected={view === "provider"} onClick={() => chooseView("provider")}>제공자별</button>
        </div>
      </header>
      <p className="usage-trend-note">
        {showAgOverlay
          ? `사용 경로는 현재 원장에 기록되지 않아 표시하지 않습니다. Antigravity 요청(회)은 우측 축에 표시되며 토큰 미측정으로 토큰 합계에 합산되지 않습니다.${unknownTurns > 0 ? ` 토큰 미기록 ${formatUsageNumber(unknownTurns)}회는 토큰 합계에서 제외됩니다.` : ""}`
          : `사용 경로는 현재 원장에 기록되지 않아 표시하지 않습니다.${unknownTurns > 0 ? ` 토큰 미기록 ${formatUsageNumber(unknownTurns)}회는 합계에서 제외됩니다.` : ""}`}
      </p>
      <div className="usage-trend-plot">
        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`최근 30일 ${view === "model" ? "모델별" : "제공자별"} 로컬 토큰${showAgOverlay ? " 및 Antigravity 요청" : ""} 사용량`}>
          {showAgOverlay && (
            <>
              <text className="usage-trend-axis-title is-left" x={chart.left} y={11}>토큰 (tok)</text>
              <text className="usage-trend-axis-title is-right" x={chart.width - chart.right} y={11} textAnchor="end">AG 요청 (회 · 토큰 미측정)</text>
            </>
          )}
          {[0, 0.5, 1].map((ratio) => {
            const value = chart.maxToken * ratio;
            const y = chart.y(value);
            const reqVal = showAgOverlay ? Math.round(chart.maxRequests * ratio) : 0;
            return (
              <g key={ratio}>
                <line className="usage-trend-grid" x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} />
                <text className="usage-trend-axis" x={chart.left - 8} y={y + 4} textAnchor="end">{fleetAxisTokenLabel(value)}</text>
                {showAgOverlay && <text className="usage-trend-axis is-req" x={chart.width - chart.right + 8} y={y + 4} textAnchor="start">{reqVal}회</text>}
              </g>
            );
          })}
          {chart.areas.filter((area: any) => selectedSeries === null || area.id === selectedSeries).map((area: any, index: number) => (
            <path key={area.id} className="usage-trend-area" style={{ color: USAGE_TREND_COLORS[series.findIndex((item: any) => item.id === area.id) % USAGE_TREND_COLORS.length] }} d={selectedSeries === null ? area.stacked : area.isolated} />
          ))}
          {showAgOverlay && chart.requestOverlays.filter((ov: any) => selectedReqFamily === null || ov.id === selectedReqFamily).map((ov: any) => (
            <g key={ov.id} className={`usage-trend-req-group is-${ov.id}`}>
              {ov.path && <path className={`usage-trend-req-line is-${ov.id}`} d={ov.path} style={{ stroke: ov.color }} />}
              {ov.points.map((pt: any, i: number) => (
                (ov.values[i] > 0 || selectedReqFamily === ov.id) ? (
                  <circle
                    key={i}
                    className={`usage-trend-req-dot is-${ov.id}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={ov.values[i] > 0 ? 3.5 : 2}
                    style={{ fill: ov.color }}
                  />
                ) : null
              ))}
            </g>
          ))}
          {days.map((day: any, index: number) => (index % 5 === 0 || index === 29) && (
            <text key={day.date} className="usage-trend-axis" x={chart.x(index)} y={chart.height - 10} textAnchor="middle">{String(day.date).slice(5).replace("-", "/")}</text>
          ))}
          {activeIndex !== null && (() => {
            const x = chart.x(activeIndex);
            const visibleTokens = selectedSeries === null ? series : series.filter((item: any) => item.id === selectedSeries);
            const visibleReqs = showAgOverlay
              ? (selectedReqFamily === null ? requestSeries : requestSeries.filter((item: any) => item.id === selectedReqFamily))
              : [];
            const activeReqModels: { model_id: string; requests: number; color: string; familyLabel: string }[] = [];
            for (const fam of visibleReqs) {
              const dayModels = fam.models[activeIndex] ?? [];
              for (const m of dayModels) {
                activeReqModels.push({ model_id: m.model_id, requests: m.requests, color: fam.color, familyLabel: fam.label });
              }
            }
            const hasAg = showAgOverlay && visibleReqs.some((fam) => (fam.values[activeIndex] ?? 0) > 0);
            const totalLines = visibleTokens.length + (hasAg ? 1 + activeReqModels.length : 0);
            const boxHeight = 44 + totalLines * 16;
            const maxNameLen = Math.max(14, ...visibleTokens.map((t: any) => t.label.length), ...activeReqModels.map((m) => m.model_id.length));
            const boxWidth = Math.min(260, Math.max(190, maxNameLen * 8 + 60));
            const boxX = Math.min(Math.max(x - 90, chart.left), chart.width - boxWidth - 10);
            let curY = 47;
            return (
              <g className="usage-trend-tooltip" role="tooltip">
                <line x1={x} x2={x} y1={chart.top} y2={chart.top + chart.plotHeight} />
                <rect x={boxX} y={10} width={boxWidth} height={boxHeight} rx="8" />
                <text x={boxX + 11} y={29} className="is-title">{days[activeIndex]?.date}</text>
                {visibleTokens.map((item: any) => {
                  const yPos = curY;
                  curY += 16;
                  return (
                    <text key={item.id} x={boxX + 11} y={yPos} style={{ fill: USAGE_TREND_COLORS[series.indexOf(item) % USAGE_TREND_COLORS.length] }}>
                      {item.label}: {formatUsageNumber(item.values[activeIndex])} tok{item.unknownTurns[activeIndex] > 0 ? ` · 미기록 ${item.unknownTurns[activeIndex]}회` : ""}
                    </text>
                  );
                })}
                {hasAg && (
                  <>
                    <text x={boxX + 11} y={curY} className="is-req-header">── AG 요청 (토큰 미측정) ──</text>
                    {(() => {
                      curY += 15;
                      return activeReqModels.map((m) => {
                        const yPos = curY;
                        curY += 16;
                        return (
                          <text key={`${m.familyLabel}-${m.model_id}`} x={boxX + 11} y={yPos} style={{ fill: m.color }}>
                            [{m.familyLabel}] {m.model_id}: {m.requests}회
                          </text>
                        );
                      });
                    })()}
                  </>
                )}
              </g>
            );
          })()}
        </svg>
        <div className="usage-trend-hit-grid" aria-label={showAgOverlay ? "날짜별 토큰 및 Antigravity 요청 상세" : "날짜별 토큰 상세"}>
          {days.map((day: any, index: number) => {
            const tokenDesc = (selectedSeries === null ? series : series.filter((item: any) => item.id === selectedSeries))
              .map((item: any) => `${item.label} ${formatUsageNumber(item.values[index])} 토큰`).join(", ");
            const agDesc = showAgOverlay
              ? requestSeries.map((fam) => `${fam.label} ${fam.values[index] ?? 0}회`).join(", ")
              : "";
            const ariaLabel = showAgOverlay
              ? `${day.date}, ${tokenDesc}, ${agDesc} (토큰 미측정)`
              : `${day.date}, ${tokenDesc}`;
            return (
              <button
                key={day.date}
                type="button"
                aria-label={ariaLabel}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex(null)}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={(event) => { if (event.currentTarget !== document.activeElement) setActiveIndex(null); }}
                onKeyDown={(event) => {
                  const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                  if (offset !== 0) {
                    event.preventDefault();
                    const buttons = [...event.currentTarget.parentElement!.querySelectorAll("button")];
                    (buttons[Math.min(29, Math.max(0, index + offset))] as HTMLButtonElement)?.focus();
                  }
                  if (event.key === "Escape") {
                    setActiveIndex(null);
                    event.currentTarget.blur();
                  }
                }}
              />
            );
          })}
        </div>
      </div>
      <div className="usage-trend-legend" aria-label={`${view === "model" ? "모델" : "제공자"}${showAgOverlay ? " 및 Antigravity" : ""} 범례`}>
        {series.map((item: any, index: number) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={selectedSeries === item.id}
            className={selectedSeries !== null && selectedSeries !== item.id ? "is-muted" : ""}
            onClick={() => setSelectedSeries((current) => current === item.id ? null : item.id)}
          >
            <span style={{ background: USAGE_TREND_COLORS[index % USAGE_TREND_COLORS.length] }} />
            {item.label}
          </button>
        ))}
        {showAgOverlay && (
          <>
            <span className="usage-trend-legend-divider" aria-hidden="true">|</span>
            {requestSeries.map((fam) => (
              <button
                key={fam.id}
                type="button"
                aria-pressed={selectedReqFamily === fam.id}
                className={`usage-trend-req-toggle is-${fam.id}${selectedReqFamily !== null && selectedReqFamily !== fam.id ? " is-muted" : ""}`}
                onClick={() => setSelectedReqFamily((current) => current === fam.id ? null : fam.id)}
              >
                <span className="usage-trend-req-indicator" style={{ background: fam.color }} />
                <b>{fam.label}</b>
                <small>({fam.totalRequests.toLocaleString("en-US")}회 · 토큰 미측정)</small>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function FleetUsageCards({ usage, providers = null, pending = false }: { usage: any; providers?: any; pending?: boolean }) {
  const limitsPanel = usePersistentPanelCollapse("owner.limits");
  const modelsPanel = usePersistentPanelCollapse("owner.models");
  const usagePanel = usePersistentPanelCollapse("owner.usage");
  const history = usage?.history ?? null;
  const windows = history?.windows ?? null;
  const claudeEvidence = usage?.provider_evidence?.claude ?? null;
  const claudeQuota = buildClaudeQuotaPresentation(providers?.limits ?? null);
  const antigravityQuotaReady = providers?.antigravityQuota?.schema_version === ANTIGRAVITY_QUOTA_SCHEMA_VERSION
    && providers.antigravityQuota.freshness === "current";
  const claudeObservationState = claudeQuota.current
    ? "READY"
    : claudeQuota.status.state === "stale"
      ? "STALE"
      : "HOLD/UNKNOWN";
  const providerObservationNote = `Claude ${claudeObservationState} · Antigravity ${antigravityQuotaReady ? "READY" : "UNKNOWN/HOLD"}${providers?.refresh_state === "refreshing" ? " · 갱신 중" : ""}`;
  const dailyTokens = Array.isArray(history?.activity?.daily)
    ? history.activity.daily.map((row: any) => row.total_tokens ?? 0)
    : [];
  // Codex 공식 %는 미터 이벤트 관측과 최신 세션 텔레메트리 중 더 새로운 쪽을 쓴다.
  const meterRateLimit = history?.rate_limit ?? null;
  let liveRateLimit: any = null;
  const liveCodex = providers?.limits?.codex ?? null;
  if (liveCodex?.primary) {
    liveRateLimit = {
      limit_id: "codex",
      plan_type: liveCodex.plan_type ?? meterRateLimit?.plan_type ?? null,
      used_percent: liveCodex.primary.used_percent,
      window_minutes: liveCodex.primary.window_minutes,
      resets_at_epoch_s: liveCodex.primary.resets_at_epoch_s,
      observed_at: liveCodex.observed_at ?? new Date().toISOString(),
    };
  }
  const rateLimit: any = selectCodexRateLimitObservation({ meter: meterRateLimit, live: liveRateLimit });
  const week = windows?.calendar_week?.totals ?? null;
  const day = windows?.calendar_day?.totals ?? null;
  const month = windows?.calendar_month?.totals ?? null;
  const rolling7 = windows?.rolling_7d?.totals ?? null;

  // ── 패널 1: 창별 남은 한도 게이지 (계정·창마다 리셋 시점이 다름을 그대로 노출)
  const limitRows: any[] = [];
  const severityFor = (percent: number | null, idle: boolean): string => idle || percent === null
    ? "idle"
    : quotaSeverityForRemaining(100 - percent);
  // 같은 등급(창)끼리 묶는다: 5시간 창 → 주간 창 → 크레딧. 계정별 리셋 시각 비교가 목적.
  const claudeOfficial = claudeQuota.claude;
  const claudeStatus = claudeQuota.status;
  const claudeStateLabel = claudeStatus.state.toUpperCase();
  const claudeOutcomeLabel = claudeStatus.outcome ?? "unknown";
  const claudeLastSuccessLabel = claudeStatus.last_success_at === null
    ? "마지막 성공 UNKNOWN"
    : `마지막 성공 ${fleetObservedAgoLabel(claudeStatus.last_success_at)}`;
  const claudeLastSuccessShort = claudeStatus.last_success_at === null
    ? "관측 시각 미상"
    : fleetObservedAgoLabel(claudeStatus.last_success_at).replace(" 관측", "");
  // 마지막 성공과 마지막 시도는 다른 사실이다. 시도 기록이 있어야 "수집이 멈췄나,
  // 로그인이 거절됐나, 제공자가 안 닿나"를 구분할 수 있다.
  const claudeAttemptLabel = claudeStatus.attempted_at === null
    ? "시도 기록 없음"
    : `마지막 시도 ${fleetObservedAgoLabel(claudeStatus.attempted_at)}`;
  const claudeReauthNote = claudeQuota.requires_reauth ? " · 재로그인 필요" : "";
  const claudeStatusNote = `공식 쿼터 ${claudeStateLabel} · ${claudeStatus.attempt_label} · ${claudeOutcomeLabel} · ${claudeAttemptLabel} · ${claudeLastSuccessLabel}${claudeReauthNote}`;
  // 게이지를 지운 자리에 마지막 관측값을 근거로만 남긴다. 숫자는 남기되 현재
  // 잔여 용량으로 읽히지 않게 명시한다.
  const claudeHistoricalNote = (utilization: number): string =>
    `${claudeStatusNote} · 마지막 관측값 ${Math.round(utilization)}% 사용 (현재값 아님)`;
  const claudeResetLabel = (resetLabel: string): string => claudeQuota.current
    ? resetLabel
    : `${claudeLastSuccessShort} · ${resetLabel}`;
  const claudeFiveHour = claudeOfficial?.five_hour ?? null;
  const claudeSevenDay = claudeOfficial?.seven_day ?? null;
  if (claudeFiveHour !== null) {
    limitRows.push({
      key: "claude_five_hour",
      group: "5시간 창",
      provider: "Claude",
      percent: claudeQuota.current ? Number(claudeFiveHour.utilization) : null,
      severity: severityFor(Number(claudeFiveHour.utilization), !claudeQuota.current),
      stale: !claudeQuota.current,
      resetLabel: claudeResetLabel(fleetResetAtLabel(claudeFiveHour.resets_at ? Date.parse(claudeFiveHour.resets_at) : null)),
      note: claudeQuota.current ? claudeStatusNote : claudeHistoricalNote(Number(claudeFiveHour.utilization)),
    });
  } else {
    limitRows.push({
      key: "claude_official_status",
      group: "5시간 창",
      provider: "Claude",
      percent: null,
      severity: "idle",
      resetLabel: claudeAttemptLabel,
      note: `${claudeStatusNote} · 공식 값 UNKNOWN`,
    });
  }
  if (rateLimit !== null) {
    const used = Number(rateLimit.used_percent);
    const resetsMs = Number.isFinite(rateLimit.resets_at_epoch_s) ? rateLimit.resets_at_epoch_s * 1000 : null;
    // 리셋이 지난 관측치는 현재 사용률이 아니다 — 게이지를 idle로 내리고 재관측 대기로 표시한다.
    const expired = resetsMs !== null && resetsMs <= Date.now();
    limitRows.push({
      key: "codex_weekly",
      group: "주간 창",
      provider: "Codex",
      percent: expired ? null : used,
      severity: severityFor(used, expired),
      stale: false,
      resetLabel: expired ? "리셋 경과" : fleetResetAtLabel(resetsMs),
      note: expired
        ? `이전 창 ${used.toFixed(0)}% (${fleetObservedAgoLabel(rateLimit.observed_at)}) — 새 Codex 턴 실행 시 재관측`
        : fleetObservedAgoLabel(rateLimit.observed_at),
    });
  }
  if (claudeSevenDay !== null) {
    limitRows.push({
      key: "claude_weekly",
      group: "주간 창",
      provider: "Claude",
      percent: claudeQuota.current ? Number(claudeSevenDay.utilization) : null,
      severity: severityFor(Number(claudeSevenDay.utilization), !claudeQuota.current),
      stale: !claudeQuota.current,
      resetLabel: claudeResetLabel(fleetResetAtLabel(claudeSevenDay.resets_at ? Date.parse(claudeSevenDay.resets_at) : null)),
      note: claudeQuota.current ? claudeStatusNote : claudeHistoricalNote(Number(claudeSevenDay.utilization)),
    });
  }
  // Anthropic이 모델별 주간 창(예: Opus 전용 한도)을 보고하면 자동으로 행이 된다.
  for (const modelWindow of (claudeOfficial?.model_windows ?? []) as any[]) {
    limitRows.push({
      key: `claude_model_${modelWindow.key}`,
      group: "주간 창",
      provider: `Claude·${modelWindow.label}`,
      percent: claudeQuota.current ? Number(modelWindow.utilization) : null,
      severity: severityFor(Number(modelWindow.utilization), !claudeQuota.current),
      stale: !claudeQuota.current,
      resetLabel: claudeResetLabel(fleetResetAtLabel(modelWindow.resets_at ? Date.parse(modelWindow.resets_at) : null)),
      note: `모델별 공식 창 · ${claudeQuota.current ? claudeStatusNote : claudeHistoricalNote(Number(modelWindow.utilization))}`,
    });
  }
  // Antigravity 로컬 RPC의 그룹별 공식 잔여 쿼터 — 앱이 꺼지면 마지막 관측을 유지 표시한다.
  // 한도는 사용 시에만 소모되므로 과거 관측은 잔여 과소평가 방향(안전)이다.
  const agQuotaSnapshot = providers?.antigravityQuota ?? null;
  const agQuotaStatus = agQuotaSnapshot?.schema_version === ANTIGRAVITY_QUOTA_STATUS_SCHEMA_VERSION
    ? agQuotaSnapshot
    : null;
  const agObservedMs = agQuotaSnapshot?.observed_at ? Date.parse(agQuotaSnapshot.observed_at) : NaN;
  const agStale = Number.isFinite(agObservedMs) && Date.now() - agObservedMs > 10 * 60_000;
  const agAppRunning = agQuotaStatus?.app_state === "running"
    || (agQuotaSnapshot?.schema_version === ANTIGRAVITY_QUOTA_SCHEMA_VERSION && !agStale);
  for (const quotaRow of antigravityQuotaRows(agQuotaSnapshot)) {
    const usedPercent = Math.max(0, 100 - quotaRow.remaining_percent);
    const resetsMs = quotaRow.resets_at ? Date.parse(quotaRow.resets_at) : null;
    // 관측 이후 창 리셋이 지났으면(주로 5시간 창) 과거 %는 무의미 — 재관측 대기로 표시.
    if (agStale && resetsMs !== null && resetsMs <= Date.now()) {
      limitRows.push({
        key: `ag_quota_${quotaRow.provider}_${quotaRow.window}`,
        group: quotaRow.window,
        provider: quotaRow.provider,
        percent: null,
        severity: "idle",
        resetLabel: "앱 실행 시 재관측",
        note: `창 리셋 경과 — 마지막 관측 ${fleetObservedAgoLabel(agQuotaSnapshot.observed_at)}`,
      });
      continue;
    }
    limitRows.push({
      key: `ag_quota_${quotaRow.provider}_${quotaRow.window}`,
      group: quotaRow.window,
      provider: quotaRow.provider,
      percent: usedPercent,
      severity: quotaSeverityForRemaining(quotaRow.remaining_percent),
      stale: agStale,
      resetLabel: `${fleetResetAtLabel(resetsMs)}${agStale ? ` · ${fleetObservedAgoLabel(agQuotaSnapshot.observed_at)}` : ""}`,
      note: quotaRow.source_kind === "antigravity_sanitized_cli_usage_receipt"
        ? "Antigravity 설치 CLI 잔여 쿼터"
        : "Antigravity 로컬 RPC 잔여 쿼터",
    });
  }
  const antigravity = providers?.antigravity ?? null;
  if (antigravity?.credits) {
    const available = antigravity.credits.available;
    limitRows.push({
      key: "antigravity_credits",
      group: "크레딧",
      provider: "AG 크레딧",
      percent: null,
      severity: "idle",
      resetLabel: antigravity.stale
        ? "현재 수치 없음"
        : fleetObservedAgoLabel(antigravity.observed_at),
      note: antigravity.stale
        ? `레거시 기록 · ${fleetObservedAgoLabel(antigravity.observed_at).replace(" 관측", "")} · STALE`
        : `${available === null ? "—" : Number(available).toLocaleString("en-US")} 크레딧 남음 · 최소 단위 ${antigravity.credits.minimum_per_use ?? "—"}`,
    });
  } else if (agQuotaStatus !== null) {
    limitRows.push({
      key: "antigravity_status",
      group: "크레딧",
      provider: "Antigravity",
      percent: null,
      severity: "idle",
      stale: false,
      resetLabel: agAppRunning ? "숫자 한도 원천 미연결" : "앱 미감지",
      note: agAppRunning
        ? "Antigravity 2.0 실행 중 · 안전한 한도 원천 미연결"
        : "Antigravity 앱 미감지 · 안전한 한도 원천 없음",
    });
  }
  const codexPlan = rateLimit?.plan_type ?? null;
  const limitFoot = [
    codexPlan !== null ? `Codex ${codexPlan}` : null,
    `Claude ${claudeStateLabel}`,
  ].filter(Boolean).join(" · ");

  // ── 패널 2: 모델별 실사용 — 공통 Meter 원장 단일 출처. 모델 ID는 공급자 귀속 근거가 아니다.
  const modelRows: any[] = [];
  let meterTokens = 0;
  for (const row of windows?.rolling_7d?.breakdowns?.models?.top ?? []) {
    if (!Number.isFinite(row?.total_tokens) || row.total_tokens <= 0) continue;
    const rawId = String(row.model_id ?? "");
    meterTokens += row.total_tokens;
    modelRows.push({
      provider: "meter",
      model: rawId || "미상",
      tokens: row.total_tokens,
    });
  }
  modelRows.sort((left, right) => right.tokens - left.tokens);
  const topModelRows = modelRows.slice(0, 7);
  const maxModelTokens = Math.max(...topModelRows.map((row) => row.tokens), 1);
  // Antigravity 요청 모델별 7일 집계 (unmeasured_request_daily에서 추출하여 generic token_unknown과 분리)
  const ag7ModelCounts = new Map<string, { model: string; turns: number; family: string; familyLabel: string }>();
  for (const day of (history?.unmeasured_request_daily ?? []).slice(-7)) {
    for (const fam of (day.families ?? [])) {
      for (const m of (fam.models ?? [])) {
        const existing = ag7ModelCounts.get(m.model_id) ?? {
          model: m.model_id,
          turns: 0,
          family: fam.family_id,
          familyLabel: (UNMEASURED_REQUEST_FAMILY_LABELS as Record<string, string>)[fam.family_id] ?? fam.family_id,
        };
        existing.turns += m.requests;
        ag7ModelCounts.set(m.model_id, existing);
      }
    }
  }
  const topRequestRows = [...ag7ModelCounts.values()]
    .filter((row) => row.turns > 0)
    .sort((left, right) => right.turns - left.turns || left.model.localeCompare(right.model, "en"))
    .slice(0, 5);
  const maxRequestTurns = Math.max(...topRequestRows.map((row) => row.turns), 1);
  const totalRequestTurns = [...ag7ModelCounts.values()].reduce((sum, row) => sum + row.turns, 0);
  const claudeValuesVisible = ["ledger_fresh", "ledger_stale", "validated_empty"].includes(claudeEvidence?.value_state);
  const claudeLedgerSummary = !claudeValuesVisible
    ? "Claude 기록 없음"
    : claudeEvidence?.value_state === "validated_empty"
      ? "Claude 0 tok · 수집 기록 없음"
      : claudeEvidence?.value_state === "ledger_stale"
        ? `Claude ${fleetTokenLabel(claudeEvidence.total_tokens)} tok · ${Number(claudeEvidence.turns).toLocaleString("en-US")}턴 · ${fleetObservedAgoLabel(claudeEvidence.latest_usage_at).replace(" 관측", "")} · STALE`
        : `Claude ${fleetTokenLabel(claudeEvidence.total_tokens)} tok · ${Number(claudeEvidence.turns).toLocaleString("en-US")}턴 · ${fleetObservedAgoLabel(claudeEvidence.latest_usage_at).replace(" 관측", "")}`;
  const claudeLedgerTone = claudeEvidence?.value_state === "ledger_stale"
    ? "is-stale"
    : claudeEvidence?.value_state === "ledger_fresh"
      ? "is-ledger-fresh"
      : claudeEvidence?.value_state === "validated_empty"
        ? "is-empty-proven"
        : "is-unknown";
  // ── 패널 3: 로컬 원장 총괄 + 30일 provider 추이
  const totalsRows = [
    day !== null ? { key: "day", label: "오늘", value: `${fleetTokenLabel(day.total_tokens)} tok`, meta: `${day.turns.toLocaleString("en-US")}턴` } : null,
    week !== null ? { key: "week", label: "이번 주", value: `${fleetTokenLabel(week.total_tokens)} tok`, meta: `${week.turns.toLocaleString("en-US")}턴` } : null,
    month !== null ? { key: "month", label: "이번 달", value: `${fleetTokenLabel(month.total_tokens)} tok`, meta: fleetCreditLabel(month) } : null,
  ].filter(Boolean) as any[];
  const totalsFoot = "로컬 세션 사용량 · 최근 30일";

  if (limitRows.length === 0 && topModelRows.length === 0 && totalsRows.length === 0) return null;
  return (
    <div className="fleet-usage-cards is-panels" data-testid="fleet-usage-cards">
      <article className={`fleet-usage-card fleet-panel is-limits${limitsPanel.collapsed ? " is-collapsed" : ""}`} data-collapsed={limitsPanel.collapsed || undefined}>
        <header>
          <span className="fleet-usage-dot" aria-hidden="true" />
          <span className="fleet-usage-title">한도</span>
          <span className="fleet-usage-pill">공식 관측</span>
          <PanelCollapseButton panelId="owner.limits" label="한도" collapsed={limitsPanel.collapsed} onToggle={limitsPanel.toggle} />
        </header>
        <CollapsiblePanelBody panelId="owner.limits" collapsed={limitsPanel.collapsed}>
        {providerObservationNote !== null && <p className="fleet-panel-foot" data-testid="fleet-provider-observation-state">{providerObservationNote}</p>}
        <ul className="fleet-limit-rows">
          {["5시간 창", "주간 창", "크레딧"].flatMap((group) => {
            const rows = limitRows.filter((row) => row.group === group);
            if (rows.length === 0) return [];
            return [
              <li key={`caption-${group}`} className="fleet-limit-caption" aria-hidden="true">{group.replace(" 창", "")}</li>,
              ...rows.map((row) => (
                <li
                  key={row.key}
                  className={`fleet-limit-row is-${row.severity}${row.stale ? " is-stale" : ""}`}
                  data-severity={row.severity}
                  data-freshness={row.stale ? "stale" : "current"}
                  aria-label={`${row.provider} · ${row.severity === "crit" ? "위험" : row.severity === "warn" ? "주의" : row.severity === "ok" ? "양호" : "상태 미확인"}${row.stale ? " · STALE" : ""} · ${row.note}`}
                  title={`${row.stale ? "STALE · " : ""}${row.note}`}
                >
                  <span className="fleet-limit-name"><b>{row.provider}</b></span>
                  {row.percent === null ? (
                    <span className="fleet-limit-note-solo">{row.note}</span>
                  ) : (
                    <>
                      <span className="fleet-gauge" role="img" aria-label={`사용 ${Math.round(row.percent)}%`}>
                        <span style={{ width: `${Math.min(100, Math.max(2, row.percent))}%` }} />
                      </span>
                      <span className="fleet-limit-remain"><b>{Math.max(0, 100 - row.percent).toFixed(0)}%</b><small>{row.valueSmall ?? "남음"}</small></span>
                    </>
                  )}
                  <span className="fleet-limit-reset">{row.resetLabel}</span>
                </li>
              )),
            ];
          })}
        </ul>
        {limitFoot.length > 0 && <p className="fleet-panel-foot">{limitFoot}</p>}
        </CollapsiblePanelBody>
      </article>
      <article className={`fleet-usage-card fleet-panel is-models${modelsPanel.collapsed ? " is-collapsed" : ""}`} data-collapsed={modelsPanel.collapsed || undefined}>
        <header>
          <span className="fleet-usage-dot" aria-hidden="true" />
          <span className="fleet-usage-title">모델 사용량</span>
          <span className="fleet-usage-pill">최근 7일</span>
          <PanelCollapseButton panelId="owner.models" label="모델 사용량" collapsed={modelsPanel.collapsed} onToggle={modelsPanel.toggle} />
        </header>
        <CollapsiblePanelBody panelId="owner.models" collapsed={modelsPanel.collapsed}>
        {topModelRows.length === 0 ? (
          <p className="fleet-panel-empty">모델 사용 관측 없음</p>
        ) : (
          <ul className="fleet-model-rows">
            {topModelRows.map((row) => (
              <li key={`${row.provider}-${row.model}`}>
                <span className={`fleet-model-dot is-${row.provider}`} aria-hidden="true" />
                <span className="fleet-model-name">{row.model}</span>
                <span className="fleet-model-bar">
                  <span className={`is-${row.provider}`} style={{ width: `${Math.max(3, Math.round((row.tokens / maxModelTokens) * 100))}%` }} />
                </span>
                <span className="fleet-model-value">{fleetTokenLabel(row.tokens)}</span>
              </li>
            ))}
          </ul>
        )}
        {topRequestRows.length > 0 && (
          <>
            <p className="fleet-model-caption">Antigravity 요청 (토큰 미측정 · KST 달력일 최근 7일)</p>
            <ul className="fleet-model-rows is-requests">
              {topRequestRows.map((row) => (
                <li key={row.model}>
                  <span className={`fleet-model-dot is-${row.family}`} aria-hidden="true" />
                  <span className="fleet-model-name">{row.model} <small className="fleet-model-family-tag">[{row.familyLabel}]</small></span>
                  <span className="fleet-model-bar">
                    <span className={`is-${row.family}`} style={{ width: `${Math.max(3, Math.round((row.turns / maxRequestTurns) * 100))}%` }} />
                  </span>
                  <span className="fleet-model-value">{row.turns.toLocaleString("en-US")}회</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="fleet-panel-foot">{meterTokens > 0 ? `rolling 7일 토큰 ${fleetTokenLabel(meterTokens)} tok` : ""}{totalRequestTurns > 0 ? ` · KST 달력일 7일 AG ${totalRequestTurns.toLocaleString("en-US")}회 (토큰 미측정)` : ""}</p>
        <p className={`fleet-panel-foot fleet-claude-ledger-evidence ${claudeLedgerTone}`} data-testid="claude-ledger-evidence" data-ledger-freshness={claudeEvidence?.ledger_freshness ?? "unknown"}>{claudeLedgerSummary}</p>
        </CollapsiblePanelBody>
      </article>
      <article className={`fleet-usage-card fleet-panel is-totals${usagePanel.collapsed ? " is-collapsed" : ""}`} data-collapsed={usagePanel.collapsed || undefined}>
        <header>
          <span className="fleet-usage-dot" aria-hidden="true" />
          <span className="fleet-usage-title">사용량</span>
          <span className="fleet-usage-pill">로컬 집계</span>
          <PanelCollapseButton panelId="owner.usage" label="사용량" collapsed={usagePanel.collapsed} onToggle={usagePanel.toggle} />
        </header>
        <CollapsiblePanelBody panelId="owner.usage" collapsed={usagePanel.collapsed}>
        <ul className="fleet-total-rows">
          {totalsRows.map((row) => (
            <li key={row.key}><span>{row.label}</span><b>{row.value}</b><small>{row.meta}</small></li>
          ))}
        </ul>
        <UsageTrendChart usage={usage} />
        {totalsFoot.length > 0 && <p className="fleet-panel-foot">{totalsFoot}</p>}
        </CollapsiblePanelBody>
      </article>
    </div>
  );
}

function LedgerProviderTokenChart({ providerDaily }: { providerDaily: any[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const { series, chart } = buildProviderTokenChart(providerDaily);
  if (chart === null) return <p className="provider-credit-empty">최근 30일 provider별 정확한 로컬 token 근거가 없습니다.</p>;
  return (
    <>
      <div className="provider-credit-legend" aria-label="Provider별 30일 token 범례">
        {series.map((item) => <span key={item.id} className={`provider-credit-${item.id}`}>{item.label}</span>)}
      </div>
      <div className="fleet-provider-token-chart-wrap is-ledger">
        <svg className="fleet-provider-credit-chart is-ledger" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="최근 30일 Codex, Claude Code, Antigravity Gemini 로컬 token 사용량 차트">
          {[0, 0.5, 1].map((ratio) => {
            const value = chart.maxToken * ratio;
            const y = chart.y(value);
            return <g key={ratio}><line className="fleet-credit-grid" x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} /><text className="fleet-credit-axis-label" x={chart.left - 8} y={y + 4} textAnchor="end">{fleetAxisTokenLabel(value)}</text></g>;
          })}
          {chart.areas.map((area: any) => <path key={area.id} className={`fleet-credit-area provider-credit-${area.id}`} d={area.path} />)}
          {providerDaily.map((row: any, index: number) => <text key={row.date} className={`fleet-credit-axis-label fleet-credit-date-label${index % 5 === 0 || index === providerDaily.length - 1 ? " is-major" : ""}${index % 3 === 0 || index === providerDaily.length - 1 ? " is-wide" : ""}`} x={chart.x(index)} y={chart.height - 12} textAnchor="middle">{String(row.date).slice(5)}</text>)}
          {activeIndex !== null && (() => {
            const index = activeIndex;
            const x = chart.x(index);
            const boxX = Math.min(Math.max(x - 74, chart.left), chart.width - 170);
            return <g className="fleet-credit-tooltip" role="tooltip">
              <line x1={x} x2={x} y1={chart.top} y2={chart.top + chart.plotHeight} />
              <rect x={boxX} y={20} width="164" height="104" rx="7" />
              <text x={boxX + 10} y={39} className="is-title">{String(providerDaily[index]?.date ?? "")}</text>
              {series.map((item, rowIndex) => <text key={item.id} x={boxX + 10} y={59 + rowIndex * 17} className={`provider-credit-${item.id}`}>{item.label}: {typeof item.values[index] === "number" ? `${fleetTokenLabel(Number(item.values[index]))} tok` : item.unknownTurns[index] > 0 ? `토큰 미기록 ${item.unknownTurns[index]}회` : "근거 없음"}</text>)}
              <text x={boxX + 10} y={115}>{series.some((item) => item.unknownTurns[index] > 0) ? "합계(기록분)" : "합계"}: {fleetTokenLabel(chart.totals[index])} tok</text>
            </g>;
          })()}
        </svg>
        <div className="fleet-token-hit-grid" aria-label="최근 30일 provider token 상세">
          {providerDaily.map((row: any, index: number) => {
            const date = String(row.date ?? "");
            const hasUnknown = series.some((item) => item.unknownTurns[index] > 0);
            const details = series.map((item) => `${item.label} ${typeof item.values[index] === "number" ? `${fleetTokenLabel(Number(item.values[index]))} tok` : item.unknownTurns[index] > 0 ? `토큰 미기록 ${item.unknownTurns[index]}회` : "근거 없음"}`).join(", ");
            return <button key={date || index} type="button" aria-label={`${date}, ${details}, ${hasUnknown ? "합계 기록분" : "합계"} ${fleetTokenLabel(chart.totals[index])} tok`} onFocus={() => setActiveIndex(index)} onBlur={() => setActiveIndex(null)} onMouseEnter={() => setActiveIndex(index)} onMouseLeave={(event) => { if (event.currentTarget !== document.activeElement) setActiveIndex(null); }} onKeyDown={(event) => { if (event.key === "Escape") { setActiveIndex(null); event.currentTarget.blur(); } }} />;
          })}
        </div>
      </div>
    </>
  );
}

function LedgerActivity({ usage }: { usage: any }) {
  const panel = usePersistentPanelCollapse("work.activity");
  const activity = usage?.history?.activity ?? null;
  if (!activity || !Array.isArray(activity.daily) || activity.daily.length < 2 || !Array.isArray(activity.hourly)) return null;
  const hourly = activity.hourly;
  const totalHourTurns = hourly.reduce((sum: number, row: any) => sum + (row.turns ?? 0), 0);
  const maxHour = Math.max(...hourly.map((row: any) => row.turns ?? 0), 1);
  return (
    <section className={`ledger-activity${panel.collapsed ? " is-collapsed" : ""}`} aria-label="활동 빈도" data-testid="ledger-activity" data-collapsed={panel.collapsed || undefined}>
      <header>
        <span className="ledger-distribution-kicker">활동 빈도</span>
        <h2>최근 일자별 · 시간대별 작업</h2>
        <span className="ledger-distribution-meta">KST · 공통 Meter 원장</span>
        <PanelCollapseButton panelId="work.activity" label="활동 빈도" collapsed={panel.collapsed} onToggle={panel.toggle} />
      </header>
      <CollapsiblePanelBody panelId="work.activity" collapsed={panel.collapsed}>
      <div className="ledger-activity-panels">
        <div className="ledger-activity-panel is-usage-trend">
          <UsageTrendChart usage={usage} />
        </div>
        <div className="ledger-activity-panel">
          <h3>시간대별 (0-23시) <span>{totalHourTurns.toLocaleString("en-US")}턴</span></h3>
          <div className="ledger-activity-bars" role="img" aria-label="시간대별 턴 분포">
            {hourly.map((row: any) => (
              <span
                key={row.hour}
                title={`${String(row.hour).padStart(2, "0")}시 · ${row.turns.toLocaleString("en-US")}턴`}
                style={{ height: `${Math.max(3, Math.round(((row.turns ?? 0) / maxHour) * 100))}%` }}
              />
            ))}
          </div>
          <div className="ledger-activity-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
        </div>
      </div>
      </CollapsiblePanelBody>
    </section>
  );
}

function LedgerDistribution({ usage, exactTaskLabels }: { usage: any; exactTaskLabels: Map<string, string> | Record<string, string> | null }) {
  const panel = usePersistentPanelCollapse("work.distribution");
  const windows = usage?.history?.windows ?? null;
  const window = windows?.all_time ?? windows?.calendar_month ?? null;
  if (!window || !window.breakdowns) return null;
  const getLabel = (id: string): string | null => {
    if (!exactTaskLabels) return null;
    const mapped = exactTaskLabels instanceof Map ? exactTaskLabels.get(id) : (exactTaskLabels as any)[id];
    return typeof mapped === "string" && mapped.length > 0 ? mapped : null;
  };
  const topRows = (kind: string): any[] => {
    const group = window.breakdowns[kind];
    return Array.isArray(group?.top) ? group.top : [];
  };
  // 조직 기준 프로젝트: 등록부 display_label의 [프리픽스]로 task 사용량을 재집계한다.
  // 미터 project_id(저장소 귀속)와 다른, Owner 조직도 언어의 표시 전용 뷰다.
  const orgTokens = new Map<string, number>();
  for (const row of topRows("tasks")) {
    const label = getLabel(String(row.task_id));
    const prefix = label === null ? "미등록 TASK" : (/^\[([^\]]+)\]/u.exec(label)?.[1] ?? "기타 라벨");
    orgTokens.set(prefix, (orgTokens.get(prefix) ?? 0) + (row.total_tokens ?? 0));
  }
  const tasksOther = window.breakdowns.tasks?.other?.total_tokens ?? 0;
  if (tasksOther > 0) orgTokens.set("그 외 (상위 밖)", tasksOther);
  const orgRows = [...orgTokens.entries()]
    .map(([id, tokens]) => ({ id, total_tokens: tokens }))
    .sort((left, right) => right.total_tokens - left.total_tokens);

  const agModelCounts = new Map<string, { model_id: string; requests: number; family_id: string }>();
  for (const day of (usage?.history?.unmeasured_request_daily ?? [])) {
    for (const fam of (day.families ?? [])) {
      for (const m of (fam.models ?? [])) {
        const existing = agModelCounts.get(m.model_id) ?? { model_id: m.model_id, requests: 0, family_id: fam.family_id };
        existing.requests += m.requests;
        agModelCounts.set(m.model_id, existing);
      }
    }
  }
  const agRequestRows = [...agModelCounts.values()]
    .sort((left, right) => right.requests - left.requests || left.model_id.localeCompare(right.model_id, "en"));

  const displayId = (kind: string, row: any, index: number): string => (
    String(row.id ?? row.project_id ?? row.model_id ?? row.task_id ?? `row-${index}`)
  );
  const labelFor = (kind: string, id: string): string => {
    if (id === "unassigned") return "미귀속";
    if (kind === "tasks") {
      const mapped = getLabel(id);
      if (mapped !== null) return mapped;
    }
    return id.length > 22 ? `${id.slice(0, 20)}…` : id;
  };
  const columns = [
    { key: "org", tone: "amber", title: "프로젝트별 토큰", meta: "조직 라벨 기준", rows: orgRows },
    { key: "models", tone: "teal", title: "모델별 토큰", meta: "전체 누적", rows: topRows("models") },
    { key: "ag_requests", tone: "cyan", title: "AG 모델별 요청", meta: "토큰 미측정 · 최근 30일", rows: agRequestRows, isRequest: true },
    { key: "tasks", tone: "purple", title: "task별 토큰", meta: null, rows: topRows("tasks") },
    { key: "projects", tone: "green", title: "프로젝트 코드별 토큰", meta: "세션 귀속 기준", rows: topRows("projects") },
  ];
  return (
    <section className={`ledger-distribution${panel.collapsed ? " is-collapsed" : ""}`} aria-label="사용량 분포" data-testid="ledger-distribution" data-collapsed={panel.collapsed || undefined}>
      <header>
        <span className="ledger-distribution-kicker">분포</span>
        <h2>누적 사용 분포</h2>
        <span className="ledger-distribution-meta">전체 {window.totals.turns.toLocaleString("en-US")}턴 · {fleetTokenLabel(window.totals.total_tokens)} tok</span>
        <PanelCollapseButton panelId="work.distribution" label="누적 사용 분포" collapsed={panel.collapsed} onToggle={panel.toggle} />
      </header>
      <CollapsiblePanelBody panelId="work.distribution" collapsed={panel.collapsed}>
      <div className="ledger-distribution-columns">
        {columns.map((column) => {
          const rows = column.rows;
          const isReqCol = Boolean((column as any).isRequest);
          if (rows.length === 0) {
            return (
              <div key={column.key} className={`ledger-distribution-column is-${column.tone}`}>
                <h3>{column.title}{column.meta !== null && <span className="ledger-column-meta">{column.meta}</span>}</h3>
                <p className="ledger-distribution-empty">{isReqCol ? "Antigravity 요청 없음" : "귀속 항목 없음 — exact 바인딩 대기"}</p>
              </div>
            );
          }
          const max = isReqCol
            ? Math.max(...rows.map((row: any) => row.requests ?? 0), 1)
            : Math.max(...rows.map((row: any) => row.total_tokens ?? 0), 1);
          return (
            <div key={column.key} className={`ledger-distribution-column is-${column.tone}`}>
              <h3>{column.title}{column.meta !== null && <span className="ledger-column-meta">{column.meta}</span>}</h3>
              <ul>
                {rows.slice(0, 8).map((row: any, index: number) => {
                  const id = displayId(column.key, row, index);
                  const val = isReqCol ? (row.requests ?? 0) : (row.total_tokens ?? 0);
                  const valLabel = isReqCol ? `${val.toLocaleString("en-US")}회` : fleetTokenLabel(val);
                  return (
                    <li key={id}>
                      <span className="ledger-bar-label" title={id}>{labelFor(column.key, id)}</span>
                      <span className="ledger-bar"><span style={{ width: `${Math.max(4, Math.round((val / max) * 100))}%` }} /></span>
                      <span className="ledger-bar-value">{valLabel}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      </CollapsiblePanelBody>
    </section>
  );
}

function SystemStatStrip({ projection, hostStats, usage, threadCount, usageState }: { projection: any; hostStats: any; usage: any; threadCount: number; usageState: string }) {
  const model = useMemo(() => buildTopologyViewModel(projection?.snapshot ?? null), [projection]);
  const host = useMemo(() => buildHostStatsViewModel(hostStats), [hostStats]);
  const summary = model.available ? model.summary : null;
  const observed = compactClock(model.observedAt);
  const windows = usage?.history?.windows ?? null;
  const allTokens = windows?.all_time?.totals?.total_tokens;
  const rolling30 = windows?.rolling_30d?.totals?.total_tokens;
  const daily = usage?.history?.activity?.daily;
  const dayMax = Array.isArray(daily) && daily.length > 0
    ? Math.max(...daily.map((row: any) => row.total_tokens ?? 0))
    : null;
  return (
    <div className="system-stat-strip" data-testid="system-stat-strip" role="note">
      {(host as any).available && (host as any).cells.map((cell: any) => {
        const spark = Array.isArray(cell.history) && cell.history.length > 1
          ? fleetSparkline(cell.history, 44, 2, 10)
          : null;
        return (
          <span key={cell.key}>{cell.label} <b>{cell.value}</b>{spark !== null && (
            <svg className="strip-spark" viewBox="0 0 44 12" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={spark.points} />
            </svg>
          )}</span>
        );
      })}
      <span>수집기 <b>{summary ? summary.ok + summary.degraded + summary.stale + summary.down : "—"}</b></span>
      <span>주의 <b className={summary && summary.degraded + summary.stale + summary.down > 0 ? "is-warn" : ""}>{summary ? summary.degraded + summary.stale + summary.down : "—"}</b></span>
      <span>등록 <b>{threadCount}</b></span>
      <span>판정 <b>{observed}</b></span>
      <span>METER <b className={usageState === "unmeasured" ? "" : "is-ok"}>{usageState === "unmeasured" ? "대기" : "가동"}</b> <span className="system-stat-strip-scope">공통 Meter 원장 · 별도 크레딧 관측</span></span>
      {Number.isFinite(allTokens) && (
        <span className="system-stat-strip-end">총 사용 토큰 <b className="is-total">{fleetTokenLabel(allTokens)}</b>
          {Number.isFinite(rolling30) && <> 일평균 <b>{fleetTokenLabel(Math.round((rolling30 as number) / 30))}</b></>}
          {dayMax !== null && <> 일 MAX <b className="is-max">{fleetTokenLabel(dayMax)}</b></>}
        </span>
      )}
    </div>
  );
}

function fleetWatchtowerPresentation(projection: any, model: any) {
  const refreshState = typeof projection?.refresh_state === "string" ? projection.refresh_state : "hold";
  const watchtowerSelf = model?.available && Array.isArray(model?.nodes)
    ? model.nodes.find((node: any) => node?.id === "watchtower_self" && node?.kind !== "lane") ?? null
    : null;
  const selfObservationMissing = watchtowerSelf === null
    || watchtowerSelf.state === "unmonitored"
    || watchtowerSelf.healthObserved === false;
  const selfReason = Array.isArray(watchtowerSelf?.reasons) && watchtowerSelf.reasons.length > 0
    ? ` · ${watchtowerSelf.reasons.join(" · ")}`
    : "";
  const selfDescription = watchtowerSelf === null
    ? "watchtower_self 없음 · 미감시/HOLD"
    : selfObservationMissing
      ? `watchtower_self 미감시/HOLD${selfReason}`
      : `watchtower_self ${watchtowerSelf.stateLabel ?? watchtowerSelf.state}${selfReason}`;
  const healthy = refreshState === "ready"
    && !selfObservationMissing
    && watchtowerSelf?.state === "ok";
  if (healthy) {
    return { healthy: true, state: "OK", description: selfDescription, refreshState };
  }
  return {
    healthy: false,
    state: selfObservationMissing
      ? "미감시/HOLD"
      : refreshState !== "ready" ? "HOLD" : watchtowerSelf?.stateLabel ?? "주의",
    description: `${selfDescription} · refresh ${refreshState.toUpperCase()}`,
    refreshState,
  };
}

function FleetStatusRows({ projection }: { projection: any }) {
  const model = useMemo(() => buildTopologyViewModel(projection?.snapshot ?? null), [projection]);
  const presentation = fleetWatchtowerPresentation(projection, model);
  const observed = model.available ? compactClock(model.observedAt) : "—";
  const attention = model.available && Array.isArray(model.attention) ? model.attention : [];
  return (
    <div className="fleet-status-rows" data-testid="fleet-status-rows">
      <div className="fleet-status-row">
        <span className="fleet-status-name"><Radio size={13} aria-hidden="true" /> Watchtower</span>
        <span className="fleet-status-desc">{presentation.description}</span>
        <span className="fleet-status-meta">last: {observed} · refresh: {presentation.refreshState.toUpperCase()} · next: ~30s</span>
        <span className={`fleet-status-dot ${presentation.healthy ? "is-ok" : "is-warn"}`} aria-hidden="true" />
        <span className="fleet-status-state">{presentation.state}</span>
      </div>
      {attention.length > 0 && (
        <div className="fleet-status-row is-attention">
          <span className="fleet-status-name"><AlertCircle size={13} aria-hidden="true" /> 주의</span>
          <span className="fleet-status-desc">{attention.map((node: any) => `${node.label}: ${node.reasons[0] ?? node.stateLabel}`).join(" · ")}</span>
          <span className="fleet-status-meta" />
          <span className="fleet-status-dot is-warn" aria-hidden="true" />
          <span className="fleet-status-state">{attention.length}건</span>
        </div>
      )}
      <div className="fleet-status-row is-dim">
        <span className="fleet-status-name"><ShieldAlert size={13} aria-hidden="true" /> Self-Heal Watchdog</span>
        <span className="fleet-status-desc">자동 복구·알림 — W2 승인 게이트 대기</span>
        <span className="fleet-status-meta">planned</span>
        <span className="fleet-status-dot" aria-hidden="true" />
        <span className="fleet-status-state">대기</span>
      </div>
    </div>
  );
}

const WATCHTOWER_NODE_ICON_BY_ID: Record<string, any> = {
  src_hiworks: Mail,
  src_plaud: AudioLines,
  ingress_supervisor: Inbox,
  mail_forwarder: Mail,
  voice_label_worker: AudioLines,
  slack_batch: MessageSquare,
  local_activity: FolderOpen,
  usage_meter: Gauge,
  watchtower_self: RadioTower,
  gate_five_field: ShieldCheck,
  consumer_timeline: Monitor,
  consumer_board: PanelsTopLeft,
};

const WATCHTOWER_FALLBACK_ICON_BY_KIND: Record<string, any> = {
  external: Cloud,
  supervisor: Workflow,
  worker: Cpu,
  store: Database,
  gate: ShieldCheck,
  consumer: PanelsTopLeft,
};

type WatchtowerBrandIcon =
  | { kind: "url"; url: string; monochrome: boolean }
  | { kind: "simple"; path: string; hex: string };

function watchtowerBrandIcon(data: any): WatchtowerBrandIcon | null {
  const id = String(data?.id ?? "").toLowerCase();
  if (id === "src_gmail") return { kind: "simple", path: siGmail.path, hex: siGmail.hex };
  if (id === "src_slack") return { kind: "url", url: slackBrandIconUrl, monochrome: false };
  if (id === "src_onedrive") return { kind: "url", url: oneDriveBrandIconUrl, monochrome: false };
  if (id === "src_codex") return { kind: "url", url: codexBrandIconUrl, monochrome: false };
  if (id.includes("notebooklm")) return { kind: "url", url: notebookLmBrandIconUrl, monochrome: true };
  if (id.includes("google_drive") || id.includes("googledrive")) return { kind: "simple", path: siGoogledrive.path, hex: siGoogledrive.hex };
  return null;
}

function watchtowerKindLabel(kind: string): string {
  if (kind === "external") return "외부 서비스";
  if (kind === "supervisor") return "감독·수집";
  if (kind === "worker") return "연산·처리";
  if (kind === "store") return "데이터 저장";
  if (kind === "gate") return "판단·검증";
  if (kind === "consumer") return "출력·소비";
  return "시스템 장치";
}

function watchtowerShapeLabel(kind: string): string {
  if (kind === "external") return "사선형 입력";
  if (kind === "supervisor") return "캡슐형 감독";
  if (kind === "worker") return "직사각형 연산";
  if (kind === "store") return "원통형 저장";
  if (kind === "gate") return "마름형 판단";
  if (kind === "consumer") return "출력형 소비";
  return "장치형";
}

function watchtowerCatalogOnly(data: any): boolean {
  return data?.healthBasis === "catalog_only"
    || data?.catalog_only === true
    || (data?.kind === "external" && data?.state === "unmonitored");
}

function watchtowerObservationText(data: any): string {
  const supplied = typeof data?.statusText === "string" && data.statusText.length > 0
    ? data.statusText
    : null;
  if (data?.state !== "unmonitored") {
    return supplied ?? `${data?.stateLabel ?? "상태 미상"} · ${data?.ageLabel ?? "연령 미상"}`;
  }
  const reason = Array.isArray(data?.reasons) && data.reasons.length > 0
    ? data.reasons.map((value: unknown) => String(value)).join(", ")
    : "probe_unbound";
  const observation = supplied ?? `관측 미구성 · ${reason}`;
  if (!watchtowerCatalogOnly(data) || observation.includes("구조/카탈로그")) return observation;
  return `구조/카탈로그 관계 · ${observation}`;
}

function watchtowerRefreshNotice(refreshState: unknown, refreshing: boolean): string | null {
  if (refreshing || refreshState === "refreshing") {
    return "관측 갱신 중: 화면의 보존 스냅샷과 구조/카탈로그 관계는 Claude·Antigravity의 현재 성공·정상 또는 독립적 공급자 증거를 뜻하지 않습니다.";
  }
  if (refreshState === "hold" || refreshState === "stale") {
    return `관측 ${String(refreshState).toUpperCase()}: 보존된 토폴로지 스냅샷은 현재 Claude·Antigravity 공급자 성공·정상, per-edge receipt, 또는 독립적 공급자 증거를 뜻하지 않습니다.`;
  }
  return null;
}

function watchtowerRefreshAgeLabel(value: unknown): string {
  if (value === null) return "없음";
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return `${Math.floor(value)}초 전`;
  return "미상";
}

function watchtowerRefreshMetadataText(metadata: any): string {
  return `마지막 성공 ${watchtowerRefreshAgeLabel(metadata?.last_success_age_seconds)} · 마지막 실패 ${watchtowerRefreshAgeLabel(metadata?.last_failure_age_seconds)}`;
}

function watchtowerTrackingTime(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "미정";
  return new Date(value).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function WatchtowerTopologyLane({ data }: NodeProps<any>) {
  return (
    <div
      className={`watchtower-lane watchtower-lane-${data.tone}`}
      style={{ width: data.width, height: data.height }}
    >
      <span>{data.roleLabel}</span>
      <strong>{data.label}</strong>
    </div>
  );
}

function WatchtowerTopologyNode({ data }: NodeProps<any>) {
  const BrandIcon = watchtowerBrandIcon(data);
  const DeviceIcon = data.icon ?? WATCHTOWER_NODE_ICON_BY_ID[data.id] ?? WATCHTOWER_FALLBACK_ICON_BY_KIND[data.kind] ?? Cpu;
  const kindLabel = watchtowerKindLabel(data.kind);
  const shapeLabel = watchtowerShapeLabel(data.kind);
  const catalogOnly = watchtowerCatalogOnly(data);
  const observationText = watchtowerObservationText(data);
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    updateNodeInternals(data.id);
  }, [data.id, data.portSignature, updateNodeInternals]);
  return (
    <div className={`watchtower-node is-${data.state} watchtower-node-${data.kind} ${catalogOnly ? "is-catalog-only" : ""} ${data.isSelected ? "is-selected" : ""} ${data.isDimmed ? "is-dimmed" : ""}`}>
      {data.kind === "store" && <span className="watchtower-node-cap" aria-hidden="true" />}
      {data.inputPorts.map((port: any) => (
        <Handle key={port.id} id={port.id} type="target" position={Position.Left} style={{ top: `${port.top}%` }} className="watchtower-port watchtower-port-input" isConnectable={false} aria-hidden="true" />
      ))}
      <button
        type="button"
        className="watchtower-node-hit nodrag nopan"
        onClick={(event) => {
          event.stopPropagation();
          data.onActivate(data.id, event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          data.onActivate(data.id, event.currentTarget);
        }}
        aria-pressed={data.isSelected}
        aria-label={`${data.label} · ${shapeLabel} · ${kindLabel} · ${observationText}${catalogOnly ? " · 구조/카탈로그 관계는 현재 공급자 성공 또는 독립 관측이 아님" : ""} · 입력 ${data.inputPorts.length}개 · 출력 ${data.outputPorts.length}개`}
        title={`${shapeLabel} · ${kindLabel} · ${observationText} · 입력 왼쪽 / 출력 오른쪽`}
      >
        <span className={`watchtower-node-icon watchtower-node-icon-${data.kind}`} aria-hidden="true">
          {BrandIcon
            ? BrandIcon.kind === "url"
              ? <img src={BrandIcon.url} alt="" className={BrandIcon.monochrome ? "is-monochrome" : ""} />
              : <svg className="watchtower-simple-icon" viewBox="0 0 24 24" role="presentation" style={{ color: `#${BrandIcon.hex}` }}><path d={BrandIcon.path} /></svg>
            : <DeviceIcon size={17} strokeWidth={1.8} />}
        </span>
        <span className="watchtower-node-dot" aria-hidden="true" />
        <span className="watchtower-node-body">
          <strong>{data.label}</strong>
          <small className="watchtower-node-observation">{observationText}</small>
        </span>
      </button>
      {data.outputPorts.map((port: any) => (
        <Handle key={port.id} id={port.id} type="source" position={Position.Right} style={{ top: `${port.top}%` }} className="watchtower-port watchtower-port-output" isConnectable={false} aria-hidden="true" />
      ))}
    </div>
  );
}

const watchtowerTopologyNodeTypes = {
  watchtowerTopology: WatchtowerTopologyNode,
  watchtowerLane: WatchtowerTopologyLane,
};

function watchtowerMiniMapColor(node: any): string {
  if (node?.data?.kind === "lane") return "transparent";
  if (node?.data?.state === "ok") return "#70d98c";
  if (node?.data?.state === "degraded" || node?.data?.state === "stale") return "#f5b849";
  if (node?.data?.state === "down") return "#ff8d84";
  return "#72b7ff";
}

function SystemTopologySurface({ projection, refreshing, providerSnapshots = null, onRefreshReadOnly }: {
  projection: any;
  refreshing: boolean;
  providerSnapshots?: any;
  onRefreshReadOnly: () => Promise<any>;
}) {
  const model = useMemo(() => buildTopologyViewModel(projection?.snapshot ?? null), [projection]);
  const panel = usePersistentPanelCollapse("system.watchtower");
  const refreshNotice = watchtowerRefreshNotice(projection?.refresh_state, refreshing);
  const refreshMetadataText = watchtowerRefreshMetadataText(projection?.refresh_metadata);
  const [flowInstance, setFlowInstance] = useState<any>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inspectorView, setInspectorView] = useState<"evidence" | "direct" | "all">("evidence");
  const [trackingInteraction, setTrackingInteraction] = useState<any>(null);
  const [connectionDiagnosis, setConnectionDiagnosis] = useState<any>(null);
  const fittedLayoutRef = useRef<string | null>(null);
  const selectedNodeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const inspectorRef = useRef<HTMLElement | null>(null);
  const layoutSignature = useMemo(() => model.nodes
    .filter((node: any) => node.kind !== "lane")
    .map((node: any) => `${node.id}:${node.position.x}:${node.position.y}:${node.inputPorts.length}:${node.outputPorts.length}`)
    .join("|"), [model.nodes]);
  useEffect(() => {
    if (flowInstance === null || layoutSignature.length === 0 || fittedLayoutRef.current === layoutSignature) return undefined;
    fittedLayoutRef.current = layoutSignature;
    const openFromInputLane = () => {
      try { flowInstance.setViewport({ x: 72, y: 22, zoom: 0.82 }, { duration: 180 }); } catch {
        // 초기 보기 보정 실패는 상태 판정과 무관하다.
      }
    };
    const frame = requestAnimationFrame(openFromInputLane);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [flowInstance, layoutSignature]);
  useEffect(() => {
    if (selectedNodeId === null) return;
    if (!model.nodes.some((node: any) => node.id === selectedNodeId && node.kind !== "lane")) {
      setSelectedNodeId(null);
    }
  }, [model, selectedNodeId]);

  function clearSelectedNode(restoreFocus = true) {
    const trigger = selectedNodeTriggerRef.current;
    setSelectedNodeId(null);
    setConnectionDiagnosis(null);
    if (restoreFocus && trigger !== null) {
      window.requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
    }
  }

  function activateTopologyNode(nodeId: string, trigger?: EventTarget | null) {
    if (trigger instanceof HTMLButtonElement) selectedNodeTriggerRef.current = trigger;
    setConnectionDiagnosis(null);
    setSelectedNodeId((current) => current === nodeId ? null : nodeId);
  }

  async function diagnoseTrackingItem(item: any, trigger: HTMLButtonElement) {
    activateTopologyNode(item.id, trigger);
    setInspectorView("evidence");
    setTrackingInteraction({
      nodeId: item.id,
      kind: "diagnosis",
      pending: true,
      text: "최신 Watchtower 진단을 실행하고 있습니다.",
      observedAt: null,
    });
    const nextProjection = await onRefreshReadOnly();
    const nextModel = buildTopologyViewModel(nextProjection?.snapshot ?? null);
    const currentItem = nextModel.available
      ? nextModel.nonGreenQueue.find((entry: any) => entry.id === item.id)
      : null;
    const text = !nextModel.available
      ? "진단 실패 · 최신 Watchtower 관측을 읽지 못했습니다."
      : currentItem
        ? `진단 완료 · ${currentItem.stateLabel} · ${currentItem.reasonLabel}`
        : "진단 완료 · 현재 비정상 목록에서 해제되었습니다.";
    setTrackingInteraction({
      nodeId: item.id,
      kind: "diagnosis",
      pending: false,
      text,
      observedAt: nextProjection?.observed_at ?? new Date().toISOString(),
    });
  }

  // 연결 진단은 이미 받아 둔 loopback 스냅샷만 다시 읽는 별도 근거 렌즈다. 노드 health 를
  // 바꾸지 않고, 공급자 계정·프로세스에 새 호출을 만들지 않으며, 복구를 실행하지 않는다.
  async function diagnoseNodeConnection(nodeId: string) {
    if (!isTopologyDiagnosticNode(nodeId)) {
      setConnectionDiagnosis({ nodeId, pending: false, result: buildTopologyConnectionDiagnostic({ nodeId }) });
      return;
    }
    setConnectionDiagnosis({ nodeId, pending: true, result: null });
    const nextProjection = await onRefreshReadOnly();
    setConnectionDiagnosis({
      nodeId,
      pending: false,
      result: buildTopologyConnectionDiagnostic({
        nodeId,
        healthProjection: nextProjection ?? projection,
        providerSnapshots,
      }),
    });
  }

  async function inspectTrackingRecovery(item: any, trigger: HTMLButtonElement) {
    activateTopologyNode(item.id, trigger);
    setInspectorView("evidence");
    setTrackingInteraction({
      nodeId: item.id,
      kind: "recovery",
      pending: true,
      text: "최근 안전 조치 내역을 확인하고 있습니다.",
      observedAt: null,
    });
    try {
      const response = await fetch("/topology-recovery.snapshot.json", { cache: "no-store" });
      if (!response.ok) throw new Error("recovery_projection_unavailable");
      const next = await response.json();
      const row = Array.isArray(next?.cycle?.recovery)
        ? next.cycle.recovery.find((entry: any) => entry?.node_id === item.id)
        : null;
      let text = `자동 조치 대상 아님 · ${item.repairabilityLabel}`;
      if (next?.state === "unavailable") {
        text = "조치 기록 없음 · 자동 조치 가능 여부를 확인하지 못했습니다.";
      } else if (row?.attempt === "succeeded" && row?.verification === "passed") {
        text = "안전 조치 완료 · 사후 검증 통과";
      } else if (row?.attempt === "denied") {
        text = row?.verification === "failed"
          ? "안전 조치 실행 안 함 · 사전 검증 실패"
          : "안전 조치 실행 안 함 · 허용 조건 불충족";
      } else if (row?.attempt === "failed") {
        text = "안전 조치 실패 · 상태를 그대로 유지합니다.";
      } else if (row?.repairability === "allowlisted") {
        text = "안전 조치 후보 확인 · 아직 실행되지 않았습니다.";
      }
      setTrackingInteraction({
        nodeId: item.id,
        kind: "recovery",
        pending: false,
        text: next?.state === "stale" ? `이전 기록 · ${text}` : text,
        observedAt: next?.cycle?.completed_at ?? next?.observed_at ?? null,
        supervision: buildTopologyRecoverySupervision({ projection: next, nodeId: item.id }),
      });
    } catch {
      setTrackingInteraction({
        nodeId: item.id,
        kind: "recovery",
        pending: false,
        text: "조치 기록을 읽지 못했습니다 · 현재 상태를 유지합니다.",
        observedAt: null,
        supervision: null,
      });
    }
  }

  useEffect(() => {
    if (selectedNodeId === null) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      clearSelectedNode(true);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [selectedNodeId]);

  // 다른 노드를 고르면 이전 진단 결과를 남기지 않는다. 남기면 다른 노드의 근거로 읽힌다.
  useEffect(() => {
    setConnectionDiagnosis((current: any) => (
      current === null || current.nodeId === selectedNodeId ? current : null
    ));
  }, [selectedNodeId]);

  useEffect(() => {
    if (selectedNodeId === null || !window.matchMedia("(max-width: 760px)").matches) return undefined;
    const frame = window.requestAnimationFrame(() => inspectorRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [selectedNodeId]);

  const structuralPaths = useMemo(
    () => buildTopologyStructuralPaths(model, selectedNodeId),
    [model, selectedNodeId]
  );
  const focusedNodeIds = useMemo(() => {
    if (selectedNodeId === null) return new Set<string>();
    const focused = new Set<string>([selectedNodeId]);
    if (inspectorView === "all") {
      for (const path of structuralPaths.all) {
        for (const nodeId of path.node_ids) focused.add(nodeId);
      }
    } else {
      for (const edge of structuralPaths.direct) {
        focused.add(edge.from);
        focused.add(edge.to);
      }
    }
    return focused;
  }, [inspectorView, selectedNodeId, structuralPaths]);
  const focusedEdgeIds = useMemo(() => {
    if (selectedNodeId === null) return new Set<string>();
    if (inspectorView === "all") {
      return new Set(structuralPaths.all.flatMap((path) => path.edges.map((edge) => edge.edge_id)));
    }
    return new Set(structuralPaths.direct.map((edge: any) => edge.edge_id));
  }, [inspectorView, selectedNodeId, structuralPaths]);
  const selectedNode = selectedNodeId === null
    ? null
    : model.nodes.find((node: any) => node.id === selectedNodeId && node.kind !== "lane") ?? null;
  const graphNodes = useMemo(() => model.nodes.map((node: any) => ({
    id: node.id,
    type: node.kind === "lane" ? "watchtowerLane" : "watchtowerTopology",
    position: node.position,
    data: node.kind === "lane"
      ? node
      : {
          ...node,
          isSelected: selectedNodeId === node.id,
          isDimmed: selectedNodeId !== null && !focusedNodeIds.has(node.id),
          onActivate: activateTopologyNode,
          portSignature: `${node.inputPorts.map((port: any) => `${port.id}:${port.top}`).join(",")}|${node.outputPorts.map((port: any) => `${port.id}:${port.top}`).join(",")}`,
        },
    style: node.kind === "lane" ? { width: node.width, height: node.height } : undefined,
    zIndex: node.kind === "lane" ? -2 : 2,
    draggable: false,
    selectable: node.kind !== "lane",
    focusable: false
  })), [focusedNodeIds, model.nodes, selectedNodeId]);
  const graphEdges = useMemo(() => model.edges.map((edge: any) => {
    const isFocused = selectedNodeId !== null && focusedEdgeIds.has(edge.id);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: "smoothstep",
      pathOptions: {
        borderRadius: 16,
        offset: Math.min(64, 32 + (edge.sourcePortIndex + edge.targetPortIndex) * 6),
        stepPosition: edge.stepPosition,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: edge.deliveryProven ? "#58c9a6" : "#6f8794",
      },
      className: `${edge.flow === "control" ? "watchtower-edge-control" : "watchtower-edge-data"} ${edge.deliveryProven ? "is-receipted" : "is-unreceipted"}${selectedNodeId !== null ? (isFocused ? " is-focused" : " is-dimmed") : ""}`,
      label: edge.label || undefined,
    };
  }), [focusedEdgeIds, model.edges, selectedNodeId]);

  if (projection === null) {
    return (
      <section className="live-state-panel" role="status" data-testid="system-topology-loading">
        <Radio size={18} aria-hidden="true" />
        <div><h2>시스템 토폴로지 판정 대기</h2><p>Watchtower 첫 판정을 기다리는 중입니다. 판정 전에는 상태를 추정하지 않습니다.</p></div>
      </section>
    );
  }
  if (!model.available || projection.refresh_state === "unconfigured") {
    return (
      <section className="live-state-panel" role="status" data-testid="system-topology-unconfigured">
        <ShieldAlert size={18} aria-hidden="true" />
        <div><h2>Watchtower 미구성</h2><p>로컬 binding pointer가 없어 판정할 수 없습니다. 이 상태는 오류가 아니라 미구성이며, 구성 전에는 아무것도 표시하지 않습니다.</p></div>
      </section>
    );
  }
  const summary = model.summary ?? { ok: 0, degraded: 0, stale: 0, down: 0, unmonitored: 0 };
  return (
    <section className={`watchtower-surface${panel.collapsed ? " is-collapsed" : ""}`} aria-label="Soulforge 시스템 토폴로지" data-testid="system-topology-surface" data-collapsed={panel.collapsed || undefined}>
      <header className="watchtower-header">
        <div>
          <span className="watchtower-kicker"><Radio size={15} aria-hidden="true" /> WATCHTOWER · 검사 전용(W1)</span>
          <h2>AX 시스템 토폴로지</h2>
          <p>하트비트를 period+grace 윈도로 판정합니다 · 추정하지 않음 · 원문 비저장</p>
        </div>
        <div className="watchtower-summary" role="status" aria-live="polite">
          <span className="watchtower-chip is-ok">정상 {summary.ok}</span>
          <span className="watchtower-chip is-degraded">열화 {summary.degraded}</span>
          <span className="watchtower-chip is-stale">신선도 {summary.stale}</span>
          <span className="watchtower-chip is-down">정지 {summary.down}</span>
          <span className="watchtower-chip is-unmonitored">증거 미연결 {summary.unmonitored}</span>
          <span className="watchtower-observed">
            판정 {model.observedAt ? new Date(model.observedAt).toLocaleTimeString("ko-KR") : "—"}
            {refreshing || projection.refresh_state === "refreshing" ? " · 갱신 중" : ""}
          </span>
          <span className="watchtower-refresh-ages" data-testid="system-topology-refresh-ages">{refreshMetadataText}</span>
        </div>
        <PanelCollapseButton panelId="system.watchtower" label="Watchtower 시스템 토폴로지" collapsed={panel.collapsed} onToggle={panel.toggle} />
      </header>
      <CollapsiblePanelBody panelId="system.watchtower" collapsed={panel.collapsed}>
      {summary.unmonitored > 0 && (
        <div className="watchtower-unmonitored-breakdown" data-testid="system-topology-unmonitored-breakdown">
          <span>구조 표식 {model.unmonitoredBreakdown.structuralOnly}</span>
          <span>공급자 증거 {model.unmonitoredBreakdown.providerEvidenceAbsent}</span>
          <span>수동 실행 {model.unmonitoredBreakdown.onDemand}</span>
          {model.unmonitoredBreakdown.other > 0 && <span>기타 {model.unmonitoredBreakdown.other}</span>}
          <small>회색은 장애가 아니라 독립 관측 근거가 아직 연결되지 않은 항목입니다.</small>
        </div>
      )}
      {refreshNotice !== null && (
        <div className="watchtower-observation-notice" role="status" data-testid="system-topology-observation-boundary">
          <EyeOff size={15} aria-hidden="true" />
          <span>{refreshNotice}</span>
        </div>
      )}
      {model.advisoryQueue.length > 0 && (
        <section className="watchtower-advisory" aria-labelledby="watchtower-advisory-title" data-testid="system-topology-advisory">
          <header>
            <div><span>HEALTHY WITH BACKLOG</span><strong id="watchtower-advisory-title">재시도/보류</strong></div>
            <b>{model.advisoryQueue.length}건</b>
          </header>
          <ul>
            {model.advisoryQueue.map((item: any) => (
              <li key={item.id} className={`is-${item.activityState}`}>
                <div>
                  <span>{item.stateLabel}</span>
                  <strong>{item.label}</strong>
                </div>
                <small>
                  {item.activityCount === null ? "항목 수 미제공" : `${item.activityCount}개 항목`}
                  {item.activityNextAt === null ? " · 다음 시각 없음" : ` · 다음 ${watchtowerTrackingTime(item.activityNextAt)}`}
                </small>
              </li>
            ))}
          </ul>
        </section>
      )}
      {model.nonGreenQueue.length > 0 && (
        <section className="watchtower-tracking" aria-labelledby="watchtower-tracking-title" data-testid="system-topology-tracking">
          <header>
            <div><span>NON-GREEN TRACKING</span><strong id="watchtower-tracking-title">추적 필요</strong></div>
            <b>{model.nonGreenQueue.length}건</b>
          </header>
          <ul>
            {model.nonGreenQueue.map((item: any) => (
              <li key={item.id} className={`is-${item.state}`}>
                <div className="watchtower-tracking-main">
                  <span>{item.stateLabel}</span>
                  <strong>{item.label}</strong>
                  <small>{item.reasonLabel}</small>
                </div>
                <div className="watchtower-tracking-meta">
                  <span>마지막 {watchtowerTrackingTime(item.lastCheckedAt)}</span>
                  <span>다음 점검 {watchtowerTrackingTime(item.nextCheckAt)}</span>
                  <span>근거 기한 {watchtowerTrackingTime(item.nextEvidenceDueAt)}</span>
                  <span>{item.repairabilityLabel}</span>
                  <span title={`근거 ${item.evidenceOwner} · 에스컬레이션 ${item.escalationOwner}`}>근거 소유자 {item.evidenceOwner}</span>
                </div>
                <div className="watchtower-tracking-actions" role="group" aria-label={`${item.label} 진단과 조치`}>
                  <button
                    type="button"
                    disabled={trackingInteraction?.nodeId === item.id && trackingInteraction?.pending === true}
                    onClick={(event) => { void diagnoseTrackingItem(item, event.currentTarget); }}
                  >진단</button>
                  <button
                    type="button"
                    disabled={trackingInteraction?.nodeId === item.id && trackingInteraction?.pending === true}
                    onClick={(event) => { void inspectTrackingRecovery(item, event.currentTarget); }}
                  >조치 내역</button>
                </div>
                {trackingInteraction?.nodeId === item.id && (
                  <div
                    id={`watchtower-tracking-result-${item.id}`}
                    className={`watchtower-tracking-result is-${trackingInteraction.kind}`}
                    role="status"
                    aria-live="polite"
                  >
                    <strong>{trackingInteraction.pending ? "확인 중" : trackingInteraction.kind === "diagnosis" ? "진단 결과" : "조치 결과"}</strong>
                    <span>{trackingInteraction.text}</span>
                    {trackingInteraction.observedAt && <small>{watchtowerTrackingTime(trackingInteraction.observedAt)}</small>}
                  </div>
                )}
                {trackingInteraction?.nodeId === item.id && trackingInteraction.kind === "recovery"
                  && trackingInteraction.pending !== true && trackingInteraction.supervision && (
                  <div
                    className="watchtower-tracking-supervision"
                    data-testid="watchtower-tracking-supervision"
                    data-state={trackingInteraction.supervision.stateKey}
                    aria-label={`${item.label} 복구 감독 상태`}
                  >
                    <dl>
                      <div><dt>복구 상태</dt><dd>{trackingInteraction.supervision.stateLabel}</dd></div>
                      <div><dt>마지막 시도</dt><dd>{watchtowerTrackingTime(trackingInteraction.supervision.lastAttemptAt)}</dd></div>
                      <div><dt>다음 재시도</dt><dd>{watchtowerTrackingTime(trackingInteraction.supervision.nextRetryAt)}</dd></div>
                      <div><dt>연속 실패</dt><dd>{trackingInteraction.supervision.consecutiveFailures}회</dd></div>
                      <div><dt>마지막 복구 성공</dt><dd>{watchtowerTrackingTime(trackingInteraction.supervision.lastVerifiedRepairAt)}</dd></div>
                    </dl>
                    {trackingInteraction.supervision.supervisorNotice && (
                      <p className="watchtower-tracking-supervisor-notice">{trackingInteraction.supervision.supervisorNotice}</p>
                    )}
                    {trackingInteraction.supervision.history.length > 0 ? (
                      <ul className="watchtower-tracking-history">
                        {trackingInteraction.supervision.history.map((entry: any) => (
                          <li key={entry.at}>
                            <span>{watchtowerTrackingTime(entry.at)}</span>
                            <b>{entry.outcomeLabel}</b>
                            <small>회로 {entry.circuitLabel}</small>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="watchtower-tracking-history-empty">최근 조치 기록 없음</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="watchtower-graph-guide">
        <span data-testid="system-topology-edge-evidence">
          <b>전달 근거</b> 영수증 관측 {model.edgeDelivery.deliveryProven}
          {` · 영수증 통로 없음 ${model.edgeDelivery.unprovenReasons.receiptChannelAbsent}`}
          {` · 상태 관측 전용 ${model.edgeDelivery.unprovenReasons.probeObservationOnly}`}
          {model.edgeDelivery.unprovenReasons.structuralOnly > 0
            ? ` · 구조 전용 ${model.edgeDelivery.unprovenReasons.structuralOnly}` : ""}
        </span>
        <span className="watchtower-shape-guide" aria-label="장치 도형 범례">
          <b>도형</b>
          <span><i className="is-external" />입력</span>
          <span><i className="is-supervisor" />감독</span>
          <span><i className="is-worker" />연산</span>
          <span><i className="is-store" />저장</span>
          <span><i className="is-gate" />판단</span>
          <span><i className="is-consumer" />출력</span>
        </span>
        <span><b>아이콘</b> 실제 서비스·장치</span>
        <span><b>색</b> 초록 정상 · 주황 주의/열화 · 파랑 구조/미감시 · 빨강 정지</span>
        <span><b>관측</b> “구조/카탈로그 관계 · 관측 미구성”은 현재 공급자 성공이 아닌 관계 표시</span>
        <span><b>연결</b> 왼쪽 IN → 오른쪽 OUT</span>
        <span className="watchtower-graph-focus" role="status" aria-live="polite">
          {selectedNode ? `${selectedNode.label} 직접 연결 강조` : "노드를 선택하면 직접 연결만 강조"}
        </span>
        {selectedNode && <button type="button" onClick={() => clearSelectedNode(true)}>선택 해제</button>}
      </div>
      <div className="watchtower-canvas" aria-label="토폴로지 그래프">
        <ReactFlow
          nodes={graphNodes}
          edges={graphEdges}
          nodeTypes={watchtowerTopologyNodeTypes as any}
          colorMode="dark"
          onInit={setFlowInstance}
          onNodeClick={(_event, node) => {
            if (node.data?.kind === "lane") return;
            activateTopologyNode(node.id, _event.target);
          }}
          onPaneClick={() => clearSelectedNode(false)}
          minZoom={0.35}
          maxZoom={1.7}
          nodesConnectable={false}
          nodesDraggable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={26} size={1.1} className="watchtower-canvas-dots" />
          <MiniMap
            ariaLabel="토폴로지 미니맵"
            nodeColor={watchtowerMiniMapColor}
            nodeStrokeColor={watchtowerMiniMapColor}
            nodeBorderRadius={5}
            maskColor="rgb(6 10 14 / 68%)"
            pannable
            zoomable
          />
          <Controls aria-label="토폴로지 보기 조절" showInteractive={false} fitViewOptions={{ padding: 0.04, minZoom: 0.35, maxZoom: 0.9 }} />
        </ReactFlow>
      </div>
      {selectedNode && (
        <aside ref={inspectorRef} className="watchtower-node-inspector" tabIndex={-1} aria-labelledby="watchtower-node-inspector-title" data-testid="system-topology-node-inspector">
          <header>
            <div>
              <span>READ-ONLY DIAGNOSTICS</span>
              <h3 id="watchtower-node-inspector-title">{selectedNode.label}</h3>
            </div>
            <button type="button" onClick={() => clearSelectedNode(true)}>선택 해제</button>
          </header>
          <div className="watchtower-inspector-actions" role="group" aria-label="선택 노드 읽기 전용 동작">
            <button type="button" onClick={onRefreshReadOnly} disabled={refreshing}>읽기 전용 갱신</button>
            {isTopologyDiagnosticNode(selectedNode.id) && (
              <button
                type="button"
                data-testid="system-topology-connection-diagnose"
                aria-controls="watchtower-connection-diagnosis"
                aria-expanded={connectionDiagnosis?.nodeId === selectedNode.id}
                disabled={connectionDiagnosis?.nodeId === selectedNode.id && connectionDiagnosis?.pending === true}
                onClick={() => { void diagnoseNodeConnection(selectedNode.id); }}
              >진단</button>
            )}
            <button type="button" aria-pressed={inspectorView === "evidence"} onClick={() => setInspectorView("evidence")}>근거 보기</button>
            <button type="button" aria-pressed={inspectorView === "direct"} onClick={() => setInspectorView("direct")}>직접 경로</button>
            <button type="button" aria-pressed={inspectorView === "all"} onClick={() => setInspectorView("all")}>전체 구조 경로</button>
          </div>
          {inspectorView === "evidence" ? (
            <dl className="watchtower-inspector-evidence">
              <div><dt>상태</dt><dd>{selectedNode.stateLabel}</dd></div>
              <div><dt>사유</dt><dd>{selectedNode.reasons.length > 0 ? selectedNode.reasons.join(" · ") : "관측 사유 없음"}</dd></div>
              <div><dt>근거 범위</dt><dd>{selectedNode.evidenceScope}</dd></div>
              <div><dt>근거 시각</dt><dd>{selectedNode.evidenceAt ? new Date(selectedNode.evidenceAt).toLocaleString("ko-KR") : "관측 없음"}</dd></div>
              <div><dt>입증</dt><dd>{selectedNode.proves.join(" · ")}</dd></div>
              <div><dt>입증하지 않음</dt><dd>{selectedNode.doesNotProve.join(" · ")}</dd></div>
            </dl>
          ) : (
            <section className="watchtower-inspector-paths" aria-label={inspectorView === "direct" ? "직접 구조 경로" : "전체 구조 경로"}>
              <p>경로는 선언 구조와 간선별 전달 영수증을 분리합니다. 노드 상태만으로 전달을 추정하지 않습니다.</p>
              {inspectorView === "direct" ? (
                structuralPaths.direct.length === 0 ? <p className="watchtower-inspector-empty">직접 구조 관계 없음</p> : (
                  <ol>
                    {structuralPaths.direct.map((edge: any) => (
                      <li key={edge.edge_id}>{edge.from} → {edge.to}{edge.label ? ` · ${edge.label}` : ""} · {edge.delivery_state}{edge.delivery_reason ? ` (${edge.delivery_reason})` : ""}</li>
                    ))}
                  </ol>
                )
              ) : (
                structuralPaths.all.length === 0 ? <p className="watchtower-inspector-empty">연결된 구조 경로 없음</p> : (
                  <ol>
                    {structuralPaths.all.map((path) => (
                      <li key={path.node_ids.join("-")}>{path.node_ids.join(" → ")}</li>
                    ))}
                  </ol>
                )
              )}
            </section>
          )}
          {connectionDiagnosis?.nodeId === selectedNode.id && (
            <section
              id="watchtower-connection-diagnosis"
              className="watchtower-connection-diagnosis"
              aria-label={`${selectedNode.label} 연결 진단 결과`}
              role="status"
              aria-live="polite"
              aria-busy={connectionDiagnosis.pending === true}
              data-testid="system-topology-connection-diagnosis"
            >
              {connectionDiagnosis.pending === true || connectionDiagnosis.result === null ? (
                <p className="watchtower-inspector-empty">이미 받아 둔 로컬 읽기 전용 관측만 다시 확인하고 있습니다.</p>
              ) : connectionDiagnosis.result.available !== true ? (
                <p className="watchtower-inspector-empty">진단 대상 노드가 아닙니다 · {connectionDiagnosis.result.account.reason_label}</p>
              ) : (
                <>
                  <dl className="watchtower-inspector-evidence">
                    <div>
                      <dt>계정 연결</dt>
                      <dd data-state={connectionDiagnosis.result.account.state}>
                        {connectionDiagnosis.result.account.state_label} · {connectionDiagnosis.result.account.reason_label}
                      </dd>
                    </div>
                    <div>
                      <dt>로컬 수집·소스</dt>
                      <dd data-state={connectionDiagnosis.result.local_source.state}>
                        {connectionDiagnosis.result.local_source.state_label} · {connectionDiagnosis.result.local_source.reason_label}
                      </dd>
                    </div>
                    <div>
                      <dt>마지막 안전 관측</dt>
                      <dd>
                        {connectionDiagnosis.result.last_safe_observation.observed_at === null
                          ? "관측 없음"
                          : `${new Date(connectionDiagnosis.result.last_safe_observation.observed_at).toLocaleString("ko-KR")} · ${connectionDiagnosis.result.last_safe_observation.age_label}`}
                        {` · ${connectionDiagnosis.result.last_safe_observation.state_label}`}
                      </dd>
                    </div>
                    <div>
                      <dt>토폴로지 상태</dt>
                      <dd>{connectionDiagnosis.result.node_health.state_label ?? "관측 없음"} · 진단으로 바뀌지 않음</dd>
                    </div>
                  </dl>
                  <p className="watchtower-connection-scope">
                    근거 범위 {connectionDiagnosis.result.evidence.owners.length > 0
                      ? connectionDiagnosis.result.evidence.owners.join(" · ")
                      : "연결된 근거 소유자 없음"}
                    {connectionDiagnosis.result.evidence.scopes.length > 0
                      ? ` · ${connectionDiagnosis.result.evidence.scopes.join(" · ")}`
                      : ""}
                  </p>
                  <ul className="watchtower-connection-limits">
                    {connectionDiagnosis.result.evidence.limits.map((limit: string) => (
                      <li key={limit}>{limit}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
          <p className="watchtower-inspector-owner-note">Owner 승인 필요</p>
        </aside>
      )}
      <footer className="watchtower-footnote">
        <EyeOff size={13} aria-hidden="true" />
        <span>노드 관측과 간선 전달은 별도 근거입니다. 흐린 간선은 선언 구조일 뿐이며, 영수증이 있는 간선만 관측 전달로 표시합니다.</span>
      </footer>
      </CollapsiblePanelBody>
    </section>
  );
}

const ENGINE_NODE_ICON_BY_ID: Record<string, any> = {
  authority: ShieldCheck,
  canonical: Database,
  capsule: ArchiveRestore,
  ceilings: Gauge,
  context_receipt: ListChecks,
  contract_config: ListChecks,
  custody: ArchiveRestore,
  delivery_receipt: CircleCheckBig,
  engine_pass: CircleCheckBig,
  engine_self_topology: Workflow,
  errors: AlertCircle,
  execution_mode: Cpu,
  finding: CircleHelp,
  fingerprint: CircleDot,
  graph: Workflow,
  heartbeat: Activity,
  identity: UserRound,
  index: ListChecks,
  lineage: History,
  mcp_contract: Workflow,
  minting: Gauge,
  module_binding: ListChecks,
  pipeline: Workflow,
  registration: ArchiveRestore,
  snapshot: Database,
};

function EngineeringEngineTopologySurface({ projection }: { projection: any }) {
  const model: any = useMemo(() => buildEngineeringClassicTopologyViewModel(projection), [projection]);
  const panel = usePersistentPanelCollapse("system.engineering");
  const [flowInstance, setFlowInstance] = useState<any>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const fittedLayoutRef = useRef<string | null>(null);
  const selectedNodeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const inspectorRef = useRef<HTMLElement | null>(null);
  const layoutSignature = useMemo(() => model.nodes
    .filter((node: any) => node.kind !== "lane")
    .map((node: any) => `${node.id}:${node.position.x}:${node.position.y}:${node.inputPorts.length}:${node.outputPorts.length}`)
    .join("|"), [model.nodes]);

  useEffect(() => {
    if (flowInstance === null || layoutSignature.length === 0 || fittedLayoutRef.current === layoutSignature) return undefined;
    fittedLayoutRef.current = layoutSignature;
    const frame = window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      try { flowInstance.fitView({ padding: 0.05, minZoom: 0.28, maxZoom: 0.82, duration: reducedMotion ? 0 : 180 }); } catch {
        // 보기 보정 실패는 선언 구조와 무관하다.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [flowInstance, layoutSignature]);

  useEffect(() => {
    if (selectedNodeId === null) return;
    if (!model.nodes.some((node: any) => node.id === selectedNodeId && node.kind !== "lane")) setSelectedNodeId(null);
  }, [model.nodes, selectedNodeId]);

  function clearSelectedNode(restoreFocus = true) {
    const trigger = selectedNodeTriggerRef.current;
    setSelectedNodeId(null);
    if (restoreFocus && trigger !== null) window.requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
  }

  function activateNode(nodeId: string, trigger?: EventTarget | null) {
    if (trigger instanceof HTMLButtonElement) selectedNodeTriggerRef.current = trigger;
    setSelectedNodeId((current) => current === nodeId ? null : nodeId);
  }

  useEffect(() => {
    if (selectedNodeId === null) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      clearSelectedNode(true);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [selectedNodeId]);

  useEffect(() => {
    if (selectedNodeId === null || !window.matchMedia("(max-width: 760px)").matches) return undefined;
    const frame = window.requestAnimationFrame(() => inspectorRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [selectedNodeId]);

  if (projection === null) {
    return (
      <section className="live-state-panel" role="status" data-testid="engineering-engine-topology-loading">
        <Workflow size={18} aria-hidden="true" />
        <div><h2>Engineering Engine 구조 확인 중</h2><p>검증된 선언 구조를 읽는 중입니다.</p></div>
      </section>
    );
  }
  if (!model.available) {
    return (
      <section className="live-state-panel" role="status" data-testid="engineering-engine-topology-unavailable">
        <ShieldAlert size={18} aria-hidden="true" />
        <div><h2>Engineering Engine 구조 표시 보류</h2><p>정본 구조 또는 권한 경계가 맞지 않아 표시하지 않습니다. 사유: {model.reason ?? "unknown"}</p></div>
      </section>
    );
  }

  const directEdges = selectedNodeId === null
    ? [] : model.edges.filter((edge: any) => edge.source === selectedNodeId || edge.target === selectedNodeId);
  const focusedEdgeIds = new Set(directEdges.map((edge: any) => edge.id));
  const focusedNodeIds = new Set<string>(selectedNodeId === null ? [] : [selectedNodeId]);
  for (const edge of directEdges) {
    focusedNodeIds.add(edge.source);
    focusedNodeIds.add(edge.target);
  }
  const selectedNode = selectedNodeId === null
    ? null : model.nodes.find((node: any) => node.id === selectedNodeId && node.kind !== "lane") ?? null;
  const graphNodes = model.nodes.map((node: any) => ({
    id: node.id,
    type: node.kind === "lane" ? "watchtowerLane" : "watchtowerTopology",
    position: node.position,
    data: node.kind === "lane" ? node : {
      ...node,
      icon: ENGINE_NODE_ICON_BY_ID[node.localId] ?? Cpu,
      isSelected: selectedNodeId === node.id,
      isDimmed: selectedNodeId !== null && !focusedNodeIds.has(node.id),
      onActivate: activateNode,
      portSignature: `${node.inputPorts.map((port: any) => `${port.id}:${port.top}`).join(",")}|${node.outputPorts.map((port: any) => `${port.id}:${port.top}`).join(",")}`,
    },
    style: node.kind === "lane" ? { width: node.width, height: node.height } : undefined,
    zIndex: node.kind === "lane" ? -2 : 2,
    draggable: false,
    selectable: node.kind !== "lane",
    focusable: false,
  }));
  const graphEdges = model.edges.map((edge: any) => {
    const focused = selectedNodeId !== null && focusedEdgeIds.has(edge.id);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: "smoothstep",
      pathOptions: {
        borderRadius: 18,
        offset: Math.min(72, 34 + (edge.sourcePortIndex + edge.targetPortIndex) * 4),
        stepPosition: edge.stepPosition,
      },
      markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13, color: "#8796a0" },
      className: `watchtower-edge-data engine-topology-edge is-unreceipted${selectedNodeId !== null ? (focused ? " is-focused" : " is-dimmed") : ""}`,
      label: focused ? edge.label : undefined,
    };
  });

  return (
    <section className={`watchtower-surface engineering-topology-surface${model.state === "stale" ? " is-stale" : ""}${panel.collapsed ? " is-collapsed" : ""}`} aria-label="Engineering Engine 선언 토폴로지" data-testid="engineering-engine-topology-surface" data-collapsed={panel.collapsed || undefined}>
      <header className="watchtower-header engineering-topology-header">
        <div>
          <span className="watchtower-kicker"><Workflow size={15} aria-hidden="true" /> ENGINEERING ENGINE · DECLARED STRUCTURE</span>
          <h2>Engineering Engine 연결 구조</h2>
          <p>기존 토폴로지 도형과 레인으로 표시한 검증된 모듈 import 관계 · 접기 없음</p>
        </div>
        <div className="engineering-topology-counts" role="status" aria-live="polite">
          <strong>{model.source.nodeCount} 모듈</strong>
          <strong>{model.source.edgeCount} 연결</strong>
          <span>runtime UNKNOWN</span>
        </div>
        <PanelCollapseButton panelId="system.engineering" label="Engineering Engine 연결 구조" collapsed={panel.collapsed} onToggle={panel.toggle} />
      </header>
      <CollapsiblePanelBody panelId="system.engineering" collapsed={panel.collapsed}>
      <div className="engineering-topology-boundary" role="status">
        <span>선언 구조 전용 · 실행 권한 false · 복구 권한 false</span>
        <span>{model.gap}</span>
      </div>
      <div className="watchtower-graph-guide engineering-topology-guide">
        <span><b>형태</b> 기존 입력·감독·연산·저장·판단·출력 도형 유지</span>
        <span><b>선</b> Engineering Engine 내부 import {model.source.edgeCount}개 · 전달 영수증 아님</span>
        <span className="watchtower-graph-focus" role="status" aria-live="polite">
          {selectedNode ? `${selectedNode.label} 직접 연결 ${directEdges.length}개 강조` : "모듈을 선택하면 직접 연결만 강조"}
        </span>
        {selectedNode && <button type="button" onClick={() => clearSelectedNode(true)}>선택 해제</button>}
      </div>
      <div className="watchtower-canvas engineering-topology-canvas" aria-label="Engineering Engine 연결 그래프">
        <ReactFlow
          nodes={graphNodes}
          edges={graphEdges}
          nodeTypes={watchtowerTopologyNodeTypes as any}
          colorMode="dark"
          onInit={setFlowInstance}
          onNodeClick={(event, node) => {
            if (node.data?.kind === "lane") return;
            activateNode(node.id, event.target);
          }}
          onPaneClick={() => clearSelectedNode(false)}
          minZoom={0.26}
          maxZoom={1.7}
          nodesConnectable={false}
          nodesDraggable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={26} size={1.1} className="watchtower-canvas-dots" />
          <MiniMap
            ariaLabel="Engineering Engine 토폴로지 미니맵"
            nodeColor={watchtowerMiniMapColor}
            nodeStrokeColor={watchtowerMiniMapColor}
            nodeBorderRadius={5}
            maskColor="rgb(6 10 14 / 68%)"
            pannable
            zoomable
          />
          <Controls aria-label="Engineering Engine 보기 조절" showInteractive={false} fitViewOptions={{ padding: 0.05, minZoom: 0.26, maxZoom: 0.82 }} />
        </ReactFlow>
      </div>
      {selectedNode && (
        <aside ref={inspectorRef} className="watchtower-node-inspector engineering-topology-inspector" tabIndex={-1} aria-labelledby="engineering-topology-inspector-title" data-testid="engineering-engine-node-inspector">
          <header>
            <div><span>DECLARED MODULE · READ-ONLY</span><h3 id="engineering-topology-inspector-title">{selectedNode.label}</h3></div>
            <button type="button" onClick={() => clearSelectedNode(true)}>선택 해제</button>
          </header>
          <dl className="watchtower-inspector-evidence">
            <div><dt>정본 ID</dt><dd>{selectedNode.id}</dd></div>
            <div><dt>선언 종류</dt><dd>{selectedNode.sourceKind} · {selectedNode.group}</dd></div>
            <div><dt>직접 연결</dt><dd>{directEdges.length}개</dd></div>
            <div><dt>상태</dt><dd>runtime UNKNOWN · 현재 실행 상태로 승격하지 않음</dd></div>
            <div><dt>근거 범위</dt><dd>{selectedNode.evidenceScope}</dd></div>
          </dl>
        </aside>
      )}
      <footer className="watchtower-footnote">
        <EyeOff size={13} aria-hidden="true" />
        <span>표시된 선은 같은 Engine provider 안의 선언된 import 관계입니다. Watchtower와 Engine 사이 연결은 정본에 없으므로 만들지 않습니다.</span>
      </footer>
      </CollapsiblePanelBody>
    </section>
  );
}

const DECLARED_TOPOLOGY_STATE_NOTICE: Record<string, string> = {
  stale: "구조 재읽기 실패 · 마지막으로 검증된 선언 구조를 유지합니다. 현재 성공이나 현재 health가 아닙니다.",
  unavailable: "선언 구조 계약을 읽지 못했습니다. 구조·관계·상태를 추정하지 않습니다.",
};

// 선언 구조 렌즈. Watchtower W1 live health 렌즈와 같은 화면에 있지만 근거가 다르므로
// 상태 색·요약·판정을 공유하지 않는다. 여기에는 복구 실행·변경·외부 호출 표면이 없다.
function DeclaredTopologyFederationSurface({ projection }: { projection: any }) {
  const model: any = useMemo(() => buildTopologyFederationViewModel(projection), [projection]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  useEffect(() => {
    if (selectedProviderId === null) return;
    if (!model.providers.some((provider: any) => provider.id === selectedProviderId)) {
      setSelectedProviderId(null);
    }
  }, [model, selectedProviderId]);
  const selection: any = useMemo(
    () => selectTopologyFederationProvider(model, selectedProviderId),
    [model, selectedProviderId]
  );

  if (projection === null) {
    return (
      <section className="live-state-panel" role="status" data-testid="declared-topology-loading">
        <Workflow size={18} aria-hidden="true" />
        <div>
          <h2>선언 구조 계약 확인 중</h2>
          <p>tracked federation projection을 읽는 중입니다. 읽기 전에는 구조를 추정하지 않습니다.</p>
        </div>
      </section>
    );
  }
  const summary = model.summary;
  if (!model.available || summary === null) {
    return (
      <section className="live-state-panel" role="status" data-testid="declared-topology-unavailable">
        <ShieldAlert size={18} aria-hidden="true" />
        <div>
          <h2>선언 구조 사용 불가</h2>
          <p>{DECLARED_TOPOLOGY_STATE_NOTICE.unavailable} 사유: {model.reason ?? "unknown"}</p>
        </div>
      </section>
    );
  }
  return (
    <section className="ax-declared" aria-label="AX 선언 구조 federation" data-testid="declared-topology-surface">
      <header className="ax-declared-header">
        <div>
          <span className="ax-declared-kicker"><Workflow size={15} aria-hidden="true" /> AX TOPOLOGY FEDERATION · v1</span>
          <h2>{model.lensLabel}</h2>
          <p>
            각 owner가 선언한 구조 계약만 표시합니다 · 현재 health·실행·전달 영수증이 아닙니다 ·
            위의 Watchtower W1 판정과 별도 근거입니다
          </p>
        </div>
        <dl className="ax-declared-counts" data-testid="declared-topology-counts">
          <div><dt>공급자</dt><dd>{summary.providerCount}</dd></div>
          <div><dt>선언 노드</dt><dd>{summary.nodeCount}</dd></div>
          <div><dt>선언 간선</dt><dd>{summary.edgeCount}</dd></div>
          <div><dt>구조 digest</dt><dd>{model.digest?.topologyShort}</dd></div>
        </dl>
      </header>
      <p className="ax-declared-authority" data-testid="declared-topology-authority">
        런타임 권한 {String(summary.runtimeAuthority)} · 복구 실행 권한 {String(summary.repairExecutionAuthority)} ·
        이 표면에는 실행·변경 동작이 없습니다
      </p>
      {model.state !== "ready" && (
        <div className="ax-declared-notice" role="status" data-testid="declared-topology-state-notice">
          <EyeOff size={15} aria-hidden="true" />
          <span>{DECLARED_TOPOLOGY_STATE_NOTICE[model.state] ?? "선언 구조 상태 미상"}{model.reason ? ` · 사유: ${model.reason}` : ""}</span>
        </div>
      )}
      <div className="ax-declared-providers" role="group" aria-label="선언 공급자 개요" data-testid="declared-topology-provider-overview">
        {model.providers.map((provider: any) => (
          <button
            key={provider.id}
            type="button"
            className={`ax-declared-provider${selectedProviderId === provider.id ? " is-selected" : ""}`}
            aria-pressed={selectedProviderId === provider.id}
            onClick={() => setSelectedProviderId((current) => current === provider.id ? null : provider.id)}
          >
            <span className="ax-declared-provider-head">
              <strong>{provider.label}</strong>
              <em>{provider.id} · {provider.kindLabel}</em>
            </span>
            <span className="ax-declared-provider-facts">
              <span>선언 상태 {provider.declaredStatusLabel}</span>
              <span>주장 한계 {provider.claimCeilingLabel}</span>
              <span>검증 {provider.validationStateLabel}</span>
              <span>런타임 {provider.runtimeStateLabel}</span>
            </span>
            <span className="ax-declared-provider-counts">
              노드 {provider.nodeCount} · 간선 {provider.edgeCount} · payload {provider.payloadStateLabel}
            </span>
            {provider.blockerCodes.length > 0 && (
              <span className="ax-declared-provider-blockers">선언 blocker {provider.blockerCodes.join(" · ")}</span>
            )}
          </button>
        ))}
      </div>
      {selection === null ? (
        <p className="ax-declared-empty" data-testid="declared-topology-empty-selection">
          공급자를 선택하면 그 공급자의 선언 노드·간선만 보여줍니다. 선택 전에는 내부 구조를 표시하지 않습니다.
        </p>
      ) : (
        <section className="ax-declared-detail" aria-label={`${selection.provider.label} 선언 내부 구조`} data-testid="declared-topology-provider-detail">
          <header>
            <div>
              <span>DECLARED STRUCTURE · READ-ONLY</span>
              <h3>{selection.provider.label}</h3>
            </div>
            <button type="button" onClick={() => setSelectedProviderId(null)}>선택 해제</button>
          </header>
          <dl className="ax-declared-detail-facts">
            <div><dt>선언 상태</dt><dd>{selection.provider.declaredStatusLabel}</dd></div>
            <div><dt>주장 한계</dt><dd>{selection.provider.claimCeilingLabel}</dd></div>
            <div><dt>구조 검증</dt><dd>{selection.provider.validationStateLabel} · {selection.provider.validatorId}</dd></div>
            <div><dt>검증 근거 ref</dt><dd>{selection.provider.validationEvidenceRef ?? "근거 ref 없음"}</dd></div>
            <div><dt>runtime_state</dt><dd>{selection.provider.runtimeState} · {selection.provider.runtimeStateLabel}</dd></div>
            <div><dt>source</dt><dd>{selection.provider.sourceId} · {selection.provider.sourceRevision} · {selection.provider.sourceDigestShort}</dd></div>
            <div><dt>선언 능력</dt><dd>관측 {selection.provider.capabilities.observe.join(" · ") || "없음"} / 진단 {selection.provider.capabilities.diagnose.join(" · ") || "없음"} / 복구 제안 후보 {selection.provider.capabilities.proposeRepair.join(" · ") || "없음"}</dd></div>
            <div><dt>복구 실행</dt><dd>{String(selection.provider.capabilities.executeRepair)} · 복구는 후보이며 Owner 승인 필요</dd></div>
            <div><dt>선언 규모</dt><dd>노드 {selection.counts.nodes} · 간선 {selection.counts.edges} · 구조 선언 간선 {selection.counts.structuralOnlyEdges} · 영수증 필요 간선 {selection.counts.receiptRequiredEdges}</dd></div>
            <div><dt>복구 후보 노드</dt><dd>{selection.counts.repairCandidateNodes} · Owner 승인 필요, 실행 동작 없음</dd></div>
          </dl>
          <div className="ax-declared-groups" aria-label="선언 그룹 분포">
            {selection.groups.map((group: any) => (
              <span key={group.group}>{group.group} {group.nodeCount}</span>
            ))}
          </div>
          <div className="ax-declared-lists">
            <section aria-label="선언 노드 목록">
              <h4>선언 노드 {selection.counts.nodes}</h4>
              <ul>
                {selection.nodes.map((node: any) => (
                  <li key={node.id}>
                    <strong>{node.label}</strong>
                    <code>{node.id}</code>
                    <span>{node.kindLabel} · {node.layerLabel} · {node.group ?? "그룹 없음"}</span>
                    <span>{node.diagnosticStateLabel} · {node.repairStateLabel}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label="선언 간선 목록">
              <h4>선언 간선 {selection.counts.edges}</h4>
              <ul>
                {selection.edges.map((edge: any) => (
                  <li key={edge.id}>
                    <strong>{edge.fromLabel} → {edge.toLabel}</strong>
                    <code>{edge.id}</code>
                    <span>{edge.relationLabel} · {edge.layerLabel}{edge.label ? ` · ${edge.label}` : ""}</span>
                    <span>{edge.evidenceModeLabel}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </section>
      )}
      <footer className="ax-declared-footnote" data-testid="declared-topology-boundary">
        <EyeOff size={13} aria-hidden="true" />
        <span>
          선언 구조가 입증하지 않는 것: {model.doesNotProve.map((key: string) => (TOPOLOGY_FEDERATION_DOES_NOT_PROVE_LABELS as Record<string, string>)[key] ?? key).join(" · ")}.
          선언 상태는 W1 health 색으로 승격되지 않으며, 복구는 후보 표시와 Owner 승인 문구까지입니다.
        </span>
      </footer>
    </section>
  );
}

function UnifiedTopologyNode({ data }: NodeProps<any>) {
  const category = (UNIFIED_TOPOLOGY_CATEGORIES as Record<string, { label: string; color: string }>)[data.category]
    ?? UNIFIED_TOPOLOGY_CATEGORIES.observation;
  const isDeclaredNode = data.displayKind === "node";
  const hasHealthStatus = (data.healthObserved || data.healthRetained) && typeof data.healthState === "string";
  const healthClass = hasHealthStatus
    ? ` has-health is-health-${data.healthState}${data.healthRetained ? " is-health-retained" : ""}` : " has-no-health";
  const healthAriaLabel = hasHealthStatus
    ? data.healthStateLabel ?? data.healthState ?? "관측 상태 미상"
    : "런타임 미관측";
  const actionLabel = data.displayKind === "provider"
    ? `${data.label} 섹터 ${data.expanded ? "접기" : "펼치기"}`
    : data.displayKind === "group"
      ? `${data.label} 선언 그룹 ${data.expanded ? "접기" : "펼치기"}`
      : `${data.label} 선언 노드 상세 보기`;
  return (
    <div
      className={`unified-topology-node is-${data.displayKind} is-category-${data.category}${healthClass}${data.isSelected ? " is-selected" : ""}`}
      style={{ "--unified-category-color": category.color } as any}
    >
      {isDeclaredNode && <Handle type="target" position={Position.Left} className="unified-topology-port" isConnectable={false} aria-hidden="true" />}
      <button
        type="button"
        className="unified-topology-node-hit nodrag nopan"
        onClick={(event) => {
          event.stopPropagation();
          data.onActivate(data, event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          data.onActivate(data, event.currentTarget);
        }}
        aria-pressed={data.displayKind === "node" ? data.isSelected : data.expanded}
        aria-label={`${actionLabel} · ${category.label} · ${data.detail} · ${healthAriaLabel}`}
      >
        <span className="unified-topology-node-meta">
          <span className="unified-topology-category-dot" aria-hidden="true" />
          <span>{data.displayKind === "provider" ? "SECTOR" : data.displayKind === "group" ? "DECLARED GROUP" : category.label}</span>
        </span>
        <strong>{data.label}</strong>
        <small>{data.detail}</small>
        <span className="unified-topology-runtime">
          <i aria-hidden="true" />
          {hasHealthStatus ? data.healthStateLabel ?? data.healthState : "런타임 UNKNOWN"}
        </span>
      </button>
      {isDeclaredNode && <Handle type="source" position={Position.Right} className="unified-topology-port" isConnectable={false} aria-hidden="true" />}
    </div>
  );
}

const unifiedTopologyNodeTypes = { unifiedTopology: UnifiedTopologyNode };

function unifiedTopologyMiniMapColor(node: any): string {
  const category = node?.data?.category;
  return (UNIFIED_TOPOLOGY_CATEGORIES as Record<string, { color: string }>)[category]?.color ?? "#7d8b94";
}

function UnifiedSystemTopologySurface({ healthProjection, federationProjection, refreshing, onRefreshReadOnly }: {
  healthProjection: any;
  federationProjection: any;
  refreshing: boolean;
  onRefreshReadOnly: () => void;
}) {
  const [expansion, setExpansion] = useState<{ providerIds: string[]; groupKeys: string[] }>({ providerIds: [], groupKeys: [] });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [flowInstance, setFlowInstance] = useState<any>(null);
  const selectedNodeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const inspectorRef = useRef<HTMLElement | null>(null);
  const fittedLayoutRef = useRef<string | null>(null);
  const model: any = useMemo(
    () => buildUnifiedTopologyViewModel(federationProjection, healthProjection, expansion),
    [expansion, federationProjection, healthProjection]
  );
  const layoutSignature = useMemo(() => model.nodes
    .map((node: any) => `${node.id}:${node.position.x}:${node.position.y}`)
    .join("|"), [model.nodes]);

  useEffect(() => {
    if (flowInstance === null || layoutSignature.length === 0 || fittedLayoutRef.current === layoutSignature) return undefined;
    fittedLayoutRef.current = layoutSignature;
    const frame = window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      try { flowInstance.fitView({ padding: 0.14, maxZoom: 0.92, duration: reducedMotion ? 0 : 180 }); } catch {
        // 보기 보정 실패는 선언 구조나 W1 관측 판정과 무관하다.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [flowInstance, layoutSignature]);

  useEffect(() => {
    if (selectedNodeId === null) return;
    if (!model.nodes.some((node: any) => node.id === selectedNodeId && node.displayKind === "node")) {
      setSelectedNodeId(null);
    }
  }, [model.nodes, selectedNodeId]);

  function clearSelectedNode(restoreFocus = true) {
    const trigger = selectedNodeTriggerRef.current;
    setSelectedNodeId(null);
    if (restoreFocus && trigger !== null) {
      window.requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
    }
  }

  function activateUnifiedNode(data: any, trigger: HTMLButtonElement) {
    if (data.displayKind === "provider") {
      setExpansion((current) => toggleUnifiedTopologyExpansion(current, { kind: "provider", providerId: data.providerId }));
      return;
    }
    if (data.displayKind === "group") {
      setExpansion((current) => toggleUnifiedTopologyExpansion(current, { kind: "group", groupKey: data.groupKey }));
      return;
    }
    selectedNodeTriggerRef.current = trigger;
    setSelectedNodeId((current) => current === data.id ? null : data.id);
  }

  useEffect(() => {
    if (selectedNodeId === null) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      clearSelectedNode(true);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [selectedNodeId]);

  useEffect(() => {
    if (selectedNodeId === null || !window.matchMedia("(max-width: 760px)").matches) return undefined;
    const frame = window.requestAnimationFrame(() => inspectorRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [selectedNodeId]);

  if (federationProjection === null) {
    return (
      <section className="live-state-panel" role="status" data-testid="system-topology-loading">
        <Workflow size={18} aria-hidden="true" />
        <div><h2>통합 토폴로지 확인 중</h2><p>선언 구조 정본을 읽는 중입니다. 읽기 전에는 구조를 추정하지 않습니다.</p></div>
      </section>
    );
  }
  if (!model.available) {
    return (
      <section className="live-state-panel" role="status" data-testid="system-topology-unavailable">
        <ShieldAlert size={18} aria-hidden="true" />
        <div><h2>통합 토폴로지 사용 불가</h2><p>구조 또는 권한 경계가 안전하지 않아 표시를 중단했습니다. 사유: {model.reason ?? "unknown"}</p></div>
      </section>
    );
  }

  const selectedNode = selectedNodeId === null
    ? null : model.nodes.find((node: any) => node.id === selectedNodeId && node.displayKind === "node") ?? null;
  const graphNodes = model.nodes.map((node: any) => ({
    id: node.id,
    type: "unifiedTopology",
    position: node.position,
    data: {
      ...node,
      isSelected: node.id === selectedNodeId,
      onActivate: activateUnifiedNode,
    },
    draggable: false,
    selectable: true,
    focusable: false,
    zIndex: node.displayKind === "provider" ? 1 : node.displayKind === "group" ? 2 : 3,
  }));
  const graphEdges = model.edges.map((edge: any) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "default",
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 14,
      height: 14,
      color: edge.receiptObserved ? "#63c995" : "#748891",
    },
    className: `unified-topology-edge${edge.receiptObserved ? " is-receipted" : " is-structural"}`,
    label: edge.label || undefined,
  }));
  const healthSummary = model.healthSummary ?? { ok: 0, degraded: 0, stale: 0, down: 0, unmonitored: 0 };
  const federationStale = model.state === "stale";
  const federationBoundary = federationStale
    ? `선언 구조 STALE · ${model.reason ?? "snapshot_stale"} · 보존 구조`
    : "선언 구조 READY";
  const healthBoundary = !model.diagnostics.w1Available
    ? "W1 관측 없음 · 선언 구조만 표시"
    : !model.diagnostics.w1Current
      ? `W1 ${String(model.healthRefreshState).toUpperCase()} · 보존 관측을 현재 상태로 승격하지 않음`
      : `W1 정확 ID 대응 ${model.diagnostics.matchedHealthNodeCount}/${model.diagnostics.watchtowerDeclaredNodeCount}`;

  return (
    <section className={`watchtower-surface unified-topology-surface${federationStale ? " is-federation-stale" : ""}`} aria-label="AX 통합 시스템 토폴로지" data-testid="system-topology-surface">
      <header className="watchtower-header unified-topology-header">
        <div>
          <span className="watchtower-kicker"><Workflow size={15} aria-hidden="true" /> AX UNIFIED TOPOLOGY · READ-ONLY</span>
          <h2>AX 시스템 토폴로지</h2>
          <p>선언 구조는 federation 정본 · 상태는 Watchtower W1 정확 일치 노드에만 별도 표시</p>
        </div>
        <dl className="unified-topology-counts" data-testid="unified-topology-counts">
          <div><dt>공급자</dt><dd>{model.source.providerCount}</dd></div>
          <div><dt>노드</dt><dd>{model.source.nodeCount}</dd></div>
          <div><dt>간선</dt><dd>{model.source.edgeCount}</dd></div>
          <div><dt>공급자 간</dt><dd>{model.diagnostics.crossProviderEdgeCount}</dd></div>
        </dl>
      </header>
      <div className="unified-topology-boundaries" role="status" aria-live="polite">
        <span className={`unified-topology-federation-state${federationStale ? " is-stale" : " is-ready"}`} data-testid="unified-topology-federation-state">{federationBoundary}</span>
        <span>{healthBoundary}</span>
        <span className="unified-topology-authority" data-testid="unified-topology-authority">런타임 권한 false · 복구 실행 권한 false</span>
        <button type="button" onClick={onRefreshReadOnly} disabled={refreshing}>{refreshing ? "읽기 갱신 중" : "W1 읽기 갱신"}</button>
      </div>
      <div className="unified-topology-provider-strip" aria-label="통합 토폴로지 섹터 요약">
        {model.providers.map((provider: any) => (
          <span key={provider.id} className={`is-category-${provider.category}`}>
            <i aria-hidden="true" /> {provider.label} {provider.nodeCount}/{provider.edgeCount} · {provider.healthObserved || provider.healthRetained ? provider.runtimeState : "runtime UNKNOWN"}
          </span>
        ))}
      </div>
      <div className="watchtower-summary unified-topology-health-summary" aria-label="Watchtower W1 상태 요약">
        <span className="watchtower-chip is-ok">정상 {healthSummary.ok}</span>
        <span className="watchtower-chip is-degraded">열화 {healthSummary.degraded}</span>
        <span className="watchtower-chip is-stale">신선도 {healthSummary.stale}</span>
        <span className="watchtower-chip is-down">정지 {healthSummary.down}</span>
        <span className="watchtower-chip is-unmonitored">미감시 {healthSummary.unmonitored}</span>
      </div>
      <div className="unified-topology-gap" data-testid="unified-topology-cross-provider-gap">
        <AlertCircle size={15} aria-hidden="true" />
        <span><strong>{model.diagnostics.gapLabel}</strong> · 공급자 간 연결은 정본에 없으므로 간선을 만들지 않습니다.</span>
      </div>
      <div className="unified-topology-guide">
        <span>섹터 선택 → 선언 그룹 선택 → 실제 노드</span>
        <span>면 색상은 시스템 종류 · 테두리/점은 W1 상태</span>
        <span>곡선은 같은 공급자 안의 선언 간선 · 초록 곡선만 정확 영수증 관측</span>
      </div>
      <div className="watchtower-canvas unified-topology-canvas" aria-label="통합 토폴로지 그래프">
        <ReactFlow
          nodes={graphNodes}
          edges={graphEdges}
          nodeTypes={unifiedTopologyNodeTypes as any}
          colorMode="dark"
          onInit={setFlowInstance}
          onPaneClick={() => clearSelectedNode(false)}
          minZoom={0.24}
          maxZoom={1.6}
          nodesConnectable={false}
          nodesDraggable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
        >
          <MiniMap
            ariaLabel="통합 토폴로지 미니맵"
            nodeColor={unifiedTopologyMiniMapColor}
            nodeStrokeColor={unifiedTopologyMiniMapColor}
            nodeBorderRadius={7}
            maskColor="rgb(6 10 14 / 68%)"
            pannable
            zoomable
          />
          <Controls aria-label="통합 토폴로지 보기 조절" showInteractive={false} fitViewOptions={{ padding: 0.14, minZoom: 0.24, maxZoom: 0.92 }} />
        </ReactFlow>
      </div>
      {selectedNode && (
        <aside ref={inspectorRef} className="watchtower-node-inspector unified-topology-inspector" tabIndex={-1} aria-labelledby="unified-topology-inspector-title" data-testid="system-topology-node-inspector">
          <header>
            <div><span>DECLARED STRUCTURE · READ-ONLY</span><h3 id="unified-topology-inspector-title">{selectedNode.label}</h3></div>
            <button type="button" onClick={() => clearSelectedNode(true)}>선택 해제</button>
          </header>
          <dl className="watchtower-inspector-evidence">
            <div><dt>정본 ID</dt><dd>{selectedNode.id}</dd></div>
            <div><dt>공급자</dt><dd>{selectedNode.providerId}</dd></div>
            <div><dt>분류</dt><dd>{(UNIFIED_TOPOLOGY_CATEGORIES as Record<string, { label: string }>)[selectedNode.category]?.label}</dd></div>
            <div><dt>선언 구조</dt><dd>{selectedNode.detail}</dd></div>
            <div><dt>W1 상태</dt><dd>{selectedNode.healthRetained ? `이전 관측 보존 · 현재 아님 · ${selectedNode.healthStateLabel} · ${selectedNode.healthAgeLabel ?? "시각 미상"}` : selectedNode.healthObserved ? `${selectedNode.healthStateLabel} · ${selectedNode.healthAgeLabel ?? "시각 미상"}` : "관측 없음 · 런타임 UNKNOWN"}</dd></div>
            <div><dt>관측 근거</dt><dd>{selectedNode.healthEvidenceScope ?? "선언 구조만"}</dd></div>
          </dl>
          <p className="watchtower-inspector-owner-note">읽기 전용 · 실행·복구 동작 없음</p>
        </aside>
      )}
      <footer className="watchtower-footnote">
        <EyeOff size={13} aria-hidden="true" />
        <span>Engineering·Knowledge·Notebook은 W1 상태를 상속하지 않습니다. Notebook은 violet 자문/HOLD이며 런타임 UNKNOWN입니다.</span>
      </footer>
    </section>
  );
}

function AiUsagePanel({ projection, exactTaskLabels, exactTaskAttribution, exactTaskAttributionState }: {
  projection: any;
  exactTaskLabels: ReadonlyMap<string, string>;
  exactTaskAttribution: ReadonlyMap<string, { display_label: string; organization_group_id: string; organization_label: string }>;
  exactTaskAttributionState: "loading" | "ready" | "unavailable";
}) {
  const { snapshot } = projection;
  const panel = usePersistentPanelCollapse("work.usage_meter");
  const [historyWindow, setHistoryWindow] = useState("calendar_day");
  const roles = snapshot.roles.length > 0
    ? snapshot.roles
    : [{ role: "unassigned", turns: 0, total_tokens: 0, credits: null, credit_unknown_turns: 0 }];
  const modelEffort = snapshot.model_effort.length > 0
    ? snapshot.model_effort
    : [{ model: "UNKNOWN", reasoning_effort: "UNKNOWN", turns: 0, total_tokens: 0, credits: null, credit_unknown_turns: 0 }];
  const isReady = projection.state === "ready";
  const refreshState = projection.refresh_state ?? (isReady ? "ready" : "unmeasured");
  const measurementStatus = !isReady
    ? `측정 불가 / ${refreshState.toUpperCase()}`
    : `${snapshot.coverage.status === "complete" && refreshState !== "hold" ? "자동 계측 정상" : "부분 계측"}${refreshState === "refreshing" ? " · 갱신 중" : refreshState === "hold" ? " · HOLD" : ""}`;
  return (
    <section className={`ai-usage-panel ai-usage-panel-${projection.state}${panel.collapsed ? " is-collapsed" : ""}`} aria-label="AI Usage Meter read-only projection" data-live-dialog-background data-collapsed={panel.collapsed || undefined}>
      <header className="ai-usage-header">
        <div>
          <span>READ-ONLY LOCAL PROJECTION</span>
          <h2>AI Usage Meter</h2>
          <p>현재/수락 exact enrollment ID만 집계합니다. Task 순위는 일치하는 Board label로만 보완하며, 미결합 항목은 exact ID 또는 unassigned로 유지합니다.</p>
        </div>
        <strong className="ai-usage-status" data-ai-usage-state={projection.state}>
          {measurementStatus}
        </strong>
        <PanelCollapseButton panelId="work.usage_meter" label="AI Usage Meter" collapsed={panel.collapsed} onToggle={panel.toggle} />
      </header>
      <CollapsiblePanelBody panelId="work.usage_meter" collapsed={panel.collapsed}>
      <dl className="ai-usage-summary">
        <div><dt>전체 토큰</dt><dd>{formatUsageNumber(snapshot.totals.total_tokens)}</dd></div>
        <div><dt>계산 크레딧</dt><dd>{formatUsageCredits(snapshot.totals.credits)}</dd></div>
        <div><dt>계측 범위</dt><dd>{snapshot.coverage.status}</dd><small>{formatUsageNumber(snapshot.coverage.measured_turns)} / {formatUsageNumber(snapshot.coverage.total_turns)} 회차 계측</small></div>
        <div><dt>계측 상태</dt><dd>{snapshot.health.hook_status}</dd><small>대기 이벤트 {formatUsageNumber(snapshot.health.pending_event_count)}건</small></div>
      </dl>
      <div className="ai-usage-signals" aria-label="사용량 계측 범위 신호">
        <span>미분류 {formatUsageNumber(snapshot.coverage.unassigned_turns)}</span>
        <span>단가 미확정 {formatUsageNumber(snapshot.coverage.rate_unknown_turns)}</span>
        <span>크레딧 미확정 {formatUsageNumber(snapshot.totals.credit_unknown_turns)}</span>
      </div>
      <p className="ai-usage-meter-detail">Meter hook 상태: {snapshot.health.hook_status} · lifecycle JSONL fallback은 local fail-closed 상태로 별도 반영됩니다.</p>
      <div className="ai-usage-grid">
        <section aria-labelledby="ai-usage-roles-heading"><h3 id="ai-usage-roles-heading">역할별 사용량</h3><UsageRows rows={roles} labelKey="role" /></section>
        <section aria-labelledby="ai-usage-models-heading"><h3 id="ai-usage-models-heading">모델 / 추론 강도</h3><UsageRows rows={modelEffort} labelKey="model" showEffort /></section>
      </div>
      <div className="ai-usage-activity" aria-label="실행과 조정 활동">
        <span>실행 {formatUsageNumber(snapshot.activity.execution_turns)}</span>
        <span>조정 {formatUsageNumber(snapshot.activity.coordination_turns)}</span>
        <span>검토 {formatUsageNumber(snapshot.activity.review_turns)}</span>
        <span>분기 {formatUsageNumber(snapshot.activity.fan_out_turns)}</span>
        <span>재시도 {formatUsageNumber(snapshot.activity.retry_count)}</span>
        <span>시간 초과 {formatUsageNumber(snapshot.activity.timeout_count)}</span>
      </div>
      {projection.history && <AiUsageHistoryPanel history={projection.history} selectedWindow={historyWindow} onSelectWindow={setHistoryWindow} exactTaskLabels={exactTaskLabels} exactTaskAttribution={exactTaskAttribution} exactTaskAttributionState={exactTaskAttributionState} />}
      </CollapsiblePanelBody>
    </section>
  );
}

const USAGE_HISTORY_PERIODS = [
  ["calendar_day", "오늘"],
  ["calendar_week", "이번 주"],
  ["calendar_month", "이번 달"],
  ["all_time", "전체"]
];

function AiUsageHistoryPanel({ history, selectedWindow, onSelectWindow, exactTaskLabels, exactTaskAttribution, exactTaskAttributionState }: {
  history: any;
  selectedWindow: string;
  onSelectWindow: (value: string) => void;
  exactTaskLabels: ReadonlyMap<string, string>;
  exactTaskAttribution: ReadonlyMap<string, { display_label: string; organization_group_id: string; organization_label: string }>;
  exactTaskAttributionState: "loading" | "ready" | "unavailable";
}) {
  const fallbackWindow = history.windows.all_time;
  const window = history.windows[selectedWindow] ?? fallbackWindow;
  const panelId = `ai-usage-history-${selectedWindow}`;
  const projectChartRows = buildProjectUsageChartRows(window.breakdowns.projects);
  const organizationChartRows = exactTaskAttributionState === "ready"
    ? buildOrganizationUsageChartRows(window.breakdowns.tasks, exactTaskAttribution)
    : [];
  return (
    <section className="ai-usage-history" aria-labelledby="ai-usage-history-heading">
      <header className="ai-usage-history-header">
        <div>
          <h3 id="ai-usage-history-heading">정확한 ID 기준 사용 이력</h3>
          <p>KST 기준 토큰·크레딧과 프로젝트/업무/TASK 순위를 보여줍니다.</p>
        </div>
        <div className="ai-usage-period-tabs" role="tablist" aria-label="AI usage period">
          {USAGE_HISTORY_PERIODS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selectedWindow === key}
              aria-controls={`ai-usage-history-${key}`}
              id={`ai-usage-period-${key}`}
              className={selectedWindow === key ? "is-selected" : ""}
              onClick={() => onSelectWindow(key)}
              data-testid={`ai-usage-period-${key}`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <section id={panelId} role="tabpanel" aria-labelledby={`ai-usage-period-${selectedWindow}`} className="ai-usage-history-panel" tabIndex={0}>
        <dl className="ai-usage-history-summary">
          <div><dt>작업 회차</dt><dd>{formatUsageNumber(window.totals.turns)}</dd></div>
          <div><dt>토큰</dt><dd>{formatUsageNumber(window.totals.total_tokens)}</dd></div>
          <div><dt>계산 크레딧</dt><dd>{formatUsageCredits(window.totals.credits)}</dd></div>
          <div><dt>크레딧 미확정</dt><dd>{formatUsageNumber(window.totals.credit_unknown_turns)}</dd></div>
        </dl>
        <p className="ai-usage-reconciliation" data-testid="ai-usage-history-reconciliation">project/work/task 합계가 선택 기간 총계와 일치합니다.</p>
        <div className="ai-usage-chart-grid" aria-label="선택 기간 사용량 비교 그래프">
          <UsageComparisonChart
            chartId="ai-usage-project-chart"
            heading="프로젝트별 토큰 사용량"
            subtitle="Meter project_id 기준 · 미결합은 unassigned로 표시"
            rows={projectChartRows}
            tone="project"
            emptyLabel="선택 기간에 계측된 프로젝트 사용량이 없습니다."
          />
          <UsageComparisonChart
            chartId="ai-usage-organization-chart"
            heading="조직별 연결 사용량"
            subtitle="TASK exact ID와 Board 조직 등록이 일치한 사용량"
            rows={organizationChartRows}
            tone="organization"
            emptyLabel={exactTaskAttributionState === "ready"
              ? "선택 기간에 조직으로 정확히 연결할 사용량이 없습니다."
              : exactTaskAttributionState === "loading"
                ? "조직 등록 연결을 불러오는 중입니다."
                : "조직 등록 연결을 확인할 수 없습니다. 그래프 귀속을 추정하지 않습니다."}
            footnote="상위 TASK 밖 집계와 조직 등록이 일치하지 않는 사용량은 미연결·기타로 유지합니다."
          />
        </div>
        <div className="ai-usage-history-grid">
          <UsageHistoryRows heading="프로젝트 사용량 순위" rows={window.breakdowns.projects} labelKey="project_id" />
          <UsageHistoryRows heading="업무 사용량 순위" rows={window.breakdowns.works} labelKey="work_id" />
          <UsageHistoryRows heading="TASK 사용량 순위" rows={window.breakdowns.tasks} labelKey="task_id" exactTaskLabels={exactTaskLabels} />
        </div>
      </section>
    </section>
  );
}

function UsageComparisonChart({ chartId, heading, subtitle, rows, tone, emptyLabel, footnote }: {
  chartId: string;
  heading: string;
  subtitle: string;
  rows: any[];
  tone: "project" | "organization";
  emptyLabel: string;
  footnote?: string;
}) {
  const visibleRows = rows.filter((row) => (
    row.total_tokens > 0 || row.turns > 0 || row.credits > 0 || row.credit_unknown_turns > 0
  ));
  const maxTokens = Math.max(1, ...visibleRows.map((row) => row.total_tokens));
  return (
    <section className={`ai-usage-chart is-${tone}`} aria-labelledby={`${chartId}-heading`} data-testid={chartId}>
      <header>
        <h4 id={`${chartId}-heading`}>{heading}</h4>
        <p>{subtitle}</p>
      </header>
      {visibleRows.length === 0
        ? <p className="ai-usage-chart-empty" role="status">{emptyLabel}</p>
        : (
          <ol className="ai-usage-chart-list">
            {visibleRows.map((row) => (
              <li key={row.usage_id}>
                <div className="ai-usage-chart-label">
                  <span><strong>{row.label}</strong><small>{row.secondary}</small></span>
                  <b>{formatUsageNumber(row.total_tokens)}</b>
                </div>
                <progress
                  max={maxTokens}
                  value={row.total_tokens}
                  aria-label={`${row.label} ${formatUsageNumber(row.total_tokens)} 토큰`}
                />
                <p>{formatUsageNumber(row.turns)}회 · {formatUsageCredits(row.credits)} 크레딧{row.credit_unknown_turns > 0 ? ` · 미확정 ${formatUsageNumber(row.credit_unknown_turns)}회` : ""}</p>
              </li>
            ))}
          </ol>
        )}
      {footnote && <p className="ai-usage-chart-footnote">{footnote}</p>}
    </section>
  );
}

function UsageHistoryRows({ heading, rows, labelKey, exactTaskLabels = new Map<string, string>() }: { heading: string; rows: any; labelKey: "project_id" | "work_id" | "task_id"; exactTaskLabels?: ReadonlyMap<string, string> }) {
  const tableRows = [...rows.top, { [labelKey]: "other", ...rows.other }];
  return (
    <section aria-label={heading}>
      <h4>{heading}</h4>
      <div className="ai-usage-table" role="table">
        <div className="ai-usage-row ai-usage-row-head" role="row">
          <span role="columnheader">ID</span><span role="columnheader">회차</span><span role="columnheader">토큰</span><span role="columnheader">크레딧</span>
        </div>
        {tableRows.map((row: any) => (
          <div className="ai-usage-row" role="row" key={row[labelKey]}>
            <span role="cell">
              {labelKey === "task_id" && exactTaskLabels.get(row[labelKey])
                ? <><strong>{exactTaskLabels.get(row[labelKey])}</strong><small>{row[labelKey]}</small></>
                : row[labelKey]}
            </span>
            <span role="cell">{formatUsageNumber(row.turns)}</span><span role="cell">{formatUsageNumber(row.total_tokens)}</span><span role="cell">{formatUsageCredits(row.credits)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function UsageRows({ rows, labelKey, showEffort = false }: { rows: any[]; labelKey: "role" | "model"; showEffort?: boolean }) {
  return (
    <div className="ai-usage-table" role="table">
      <div className="ai-usage-row ai-usage-row-head" role="row">
        <span role="columnheader">{labelKey === "role" ? "역할" : "모델"}</span><span role="columnheader">회차</span><span role="columnheader">토큰</span><span role="columnheader">크레딧</span>
      </div>
      {rows.map((row, index) => (
        <div className="ai-usage-row" role="row" key={`${row[labelKey]}-${row.reasoning_effort ?? index}`}>
          <span role="cell">{row[labelKey]}{showEffort && <small>{row.reasoning_effort}</small>}</span>
          <span role="cell">{formatUsageNumber(row.turns)}</span><span role="cell">{formatUsageNumber(row.total_tokens)}</span><span role="cell">{formatUsageCredits(row.credits)}</span>
        </div>
      ))}
    </div>
  );
}

export default App;
