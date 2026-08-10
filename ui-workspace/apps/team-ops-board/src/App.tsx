import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArchiveRestore,
  Check,
  ChevronRight,
  CircleDot,
  EyeOff,
  History,
  RefreshCw,
  ShieldAlert,
  X
} from "lucide-react";

import { aiUsageProjectionRequest } from "./core/ai-usage-projection-request.mjs";
import { createUnmeasuredAiUsageSnapshot } from "./core/ai-usage-snapshot.mjs";
import {
  LIVE_THREAD_POLL_INTERVAL_MS,
  acknowledgeLiveThread,
  groupLiveThreadsByOrganization,
  isLiveThreadAcknowledged,
  liveThreadProjectionRequest,
  restoreLiveThread,
  selectLiveThreadView
} from "./core/live-thread-board.mjs";
import {
  createUnavailableLiveThreadProjection,
  isAcknowledgeableLiveThread,
  liveThreadRoleLabel,
  liveThreadStatusLabel,
  organizationGroupLabel
} from "./core/live-thread-projection.mjs";

type BoardView = "active" | "history";

const MOBILE_DETAIL_QUERY = "(max-width: 760px)";

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
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

function App() {
  const [projection, setProjection] = useState(() =>
    createUnavailableLiveThreadProjection({ health: "unavailable", enrollmentHealth: "missing" })
  );
  const [view, setView] = useState<BoardView>("active");
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [isMobileDetail, setIsMobileDetail] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_DETAIL_QUERY).matches
  );
  const [refreshing, setRefreshing] = useState(false);
  const [acknowledgementRevision, setAcknowledgementRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const [aiUsageProjection, setAiUsageProjection] = useState(() => ({
    state: "unmeasured",
    snapshot: createUnmeasuredAiUsageSnapshot(),
    reconciliation: null
  }));
  const detailRef = useRef<HTMLElement | null>(null);
  const closeDetailRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

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
  const filteredThreads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return selectedView.threads.filter((thread: any) => {
      if (groupFilter !== "all" && thread.organization_group_id !== groupFilter) return false;
      if (statusFilter !== "all" && thread.status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return [
        thread.thread_id,
        thread.organization_group_id,
        organizationGroupLabel(thread.organization_group_id),
        thread.route_id,
        thread.work_id,
        thread.thread_kind,
        thread.display_label,
        thread.relationship,
        thread.status
      ].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery);
    });
  }, [selectedView.threads, query, groupFilter, statusFilter]);
  const groups = useMemo(() => groupLiveThreadsByOrganization(filteredThreads), [filteredThreads]);
  const groupOptions = useMemo(
    () => Array.from(new Set([...projection.threads, ...projection.history].map((thread: any) => thread.organization_group_id))).sort(),
    [projection]
  );

  function updateProjection(force = false) {
    setRefreshing(true);
    void liveThreadProjectionRequest.load({ force }).then(
      (next: any) => setProjection(next),
      () => setProjection(createUnavailableLiveThreadProjection({ health: "error", enrollmentHealth: "invalid" }))
    ).finally(() => setRefreshing(false));
  }

  function selectThread(threadId: string, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setSelectedThreadId(threadId);
  }

  function closeDetail() {
    setSelectedThreadId(null);
  }

  function acknowledgeSelectedThread() {
    if (!selectedThread || !acknowledgeLiveThread(storage, selectedThread)) {
      setNotice("결과 확인 또는 미확정 상태의 TASK만 로컬에서 확인 처리할 수 있습니다.");
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
    const controller = new AbortController();
    void aiUsageProjectionRequest.load({ signal: controller.signal }).then(
      (next: any) => {
        if (!controller.signal.aborted) setAiUsageProjection(next);
      },
      () => {
        if (!controller.signal.aborted) {
          setAiUsageProjection({
            state: "unmeasured",
            snapshot: createUnmeasuredAiUsageSnapshot(),
            reconciliation: null
          });
        }
      }
    );
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!mobileDialogOpen || !detailRef.current) return;
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
      window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
    };
  }, [mobileDialogOpen]);

  const healthText = {
    ready: "정상 관측",
    partial: "부분 관측",
    unavailable: "연결 불가",
    error: "관측 오류",
    disabled: "비상 중지"
  }[projection.adapter.health] ?? "미확정";

  return (
    <div className="inbox-app live-board-app">
      <a className="inbox-skip-link" href="#live-board-content" data-live-dialog-background>
        본문으로 건너뛰기
      </a>

      <header className="inbox-topbar live-board-topbar" data-live-dialog-background>
        <div className="inbox-brand">
          <strong>Organization Board</strong>
          <span>Actual Codex Thread Projection</span>
        </div>
        <div className="live-board-top-meta" role="note">
          <EyeOff size={14} aria-hidden="true" />
          <span>LOCAL ONLY · READ ONLY · METADATA ONLY</span>
        </div>
        <button
          className="live-refresh-button"
          type="button"
          onClick={() => updateProjection(true)}
          disabled={refreshing}
        >
          <RefreshCw size={15} aria-hidden="true" className={refreshing ? "is-spinning" : ""} />
          {refreshing ? "갱신 중" : "지금 갱신"}
        </button>
      </header>

      <section className="live-health-strip" aria-label="local projection health" data-live-dialog-background>
        <span className={`live-health-state live-health-${projection.adapter.health}`}>
          <CircleDot size={13} aria-hidden="true" />
          {healthText}
        </span>
        <span>마지막 갱신 {formatRefreshTime(projection.adapter.last_refresh_at)}</span>
        <span>등록 current {projection.scope.included_count}</span>
        <span>미등록 관측 제외 {projection.scope.excluded_unregistered_count}</span>
        <span>미관측 등록 {projection.scope.unseen_enrolled_count}</span>
        <span>route binding {projection.scope.binding_coverage === "exact" ? "exact" : "HOLD"}</span>
      </section>

      <section className="live-board-controls" aria-label="live thread filters" data-live-dialog-background>
        <label className="inbox-search live-thread-search">
          <span className="sr-only">thread ID, 조직 그룹, route 또는 work 검색</span>
          <input
            type="search"
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
            {groupOptions.map((group) => <option key={group} value={group}>{organizationGroupLabel(group)}</option>)}
          </select>
        </label>
        <label>
          <span>상태</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">전체</option>
            <option value="active">실행 중</option>
            <option value="waiting">입력·승인 대기</option>
            <option value="error">관측 오류</option>
            <option value="idle_result_check">결과 확인 필요</option>
            <option value="not_loaded_unknown">불러오지 못함 · 미확정</option>
          </select>
        </label>
        <div className="inbox-view-switch" aria-label="표시 화면">
          <button
            type="button"
            className={view === "active" ? "is-active" : ""}
            aria-pressed={view === "active"}
            onClick={() => setView("active")}
          >
            <CircleDot size={14} aria-hidden="true" />
            Current
          </button>
          <button
            type="button"
            className={view === "history" ? "is-active" : ""}
            aria-pressed={view === "history"}
            onClick={() => setView("history")}
          >
            <History size={14} aria-hidden="true" />
            읽은 이력
          </button>
        </div>
      </section>

      {notice && (
        <div className="inbox-notice" role="status" data-live-dialog-background>
          <Check size={15} aria-hidden="true" />
          {notice}
          <button type="button" aria-label="알림 닫기" onClick={() => setNotice("")}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      <AiUsagePanel projection={aiUsageProjection} />

      <main id="live-board-content" className="live-board-layout">
        <section className="live-board-workspace" data-live-dialog-background aria-label={view === "active" ? "현재 실제 Codex thread" : "읽은 이력과 enrollment history"}>
          <div className="live-board-scope">
            <div>
              <strong>{view === "active" ? `현재 등록 thread ${filteredThreads.length}건` : `읽은 이력·history ${filteredThreads.length}건`}</strong>
              <p>Codex discovery는 관측만 합니다. 표시 authority는 owner가 등록한 정확한 thread_id뿐입니다.</p>
            </div>
            <span>{projection.adapter.coverage === "partial" ? "부분 관측 · 등록 외 항목은 숫자로만 제외" : "관측 범위 미확정"}</span>
          </div>

          <LiveProjectionState
            projection={projection}
            filteredCount={filteredThreads.length}
            onRetry={() => updateProjection(true)}
          />

          {groups.map((group) => (
            <section className="live-organization-group" key={group.organization_group_id} aria-labelledby={`group-${group.organization_group_id}`}>
              <header>
                <div>
                  <span>ORGANIZATION GROUP</span>
                  <h2 id={`group-${group.organization_group_id}`}>{organizationGroupLabel(group.organization_group_id)}</h2>
                </div>
                <strong>{group.threads.length}</strong>
              </header>
              <div className="live-thread-card-list">
                {group.threads.map((thread: any) => (
                  <LiveThreadCard
                    key={`${thread.thread_id}:${thread.updated_at}`}
                    thread={thread}
                    selected={thread.thread_id === selectedThreadId}
                    acknowledged={isLiveThreadAcknowledged(storage, thread)}
                    onSelect={selectThread}
                  />
                ))}
              </div>
            </section>
          ))}
        </section>

        {mobileDialogOpen && <div className="live-detail-backdrop" aria-hidden="true" onClick={closeDetail} />}

        {selectedThread && (
          <LiveThreadDetail
            thread={selectedThread}
            acknowledged={isLiveThreadAcknowledged(storage, selectedThread)}
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

function LiveProjectionState({ projection, filteredCount, onRetry }: { projection: any; filteredCount: number; onRetry: () => void }) {
  if (["error", "unavailable", "disabled"].includes(projection.adapter.health)) {
    return (
      <section className="live-state-panel live-state-error" role="alert">
        <AlertCircle size={18} aria-hidden="true" />
        <div>
          <h2>{projection.adapter.health === "disabled" ? "live thread 관측이 비상 중지됨" : "live thread 관측을 완료하지 못함"}</h2>
          <p>등록된 항목은 완료로 추정하지 않습니다. 현재 상태는 ‘불러오지 못함 · 미확정’으로 유지됩니다.</p>
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

function LiveThreadCard({
  thread,
  selected,
  acknowledged,
  onSelect
}: {
  thread: any;
  selected: boolean;
  acknowledged: boolean;
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
  acknowledged,
  isModal,
  panelRef,
  closeButtonRef,
  onClose,
  onAcknowledge,
  onRestore
}: {
  thread: any;
  acknowledged: boolean;
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
        <div><dt>조직 그룹</dt><dd>{organizationGroupLabel(thread.organization_group_id)}</dd></div>
        <div><dt>work</dt><dd>{thread.work_id ?? "미확정"}</dd></div>
        <div><dt>relationship</dt><dd>{thread.relationship}</dd></div>
        <div><dt>lifecycle</dt><dd>{thread.lifecycle}</dd></div>
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
            로컬에서 읽고 확인
          </button>
        )}
        {acknowledged && (
          <button className="live-restore-button" type="button" onClick={onRestore}>
            <ArchiveRestore size={15} aria-hidden="true" />
            Active로 복원
          </button>
        )}
        <p>이 버튼은 브라우저 localStorage만 바꾸며 underlying Codex thread에는 아무 작업도 하지 않습니다.</p>
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

function AiUsagePanel({ projection }: { projection: any }) {
  const { snapshot } = projection;
  const roles = snapshot.roles.length > 0
    ? snapshot.roles
    : [{ role: "unassigned", turns: 0, total_tokens: 0, credits: null, credit_unknown_turns: 0 }];
  const modelEffort = snapshot.model_effort.length > 0
    ? snapshot.model_effort
    : [{ model: "UNKNOWN", reasoning_effort: "UNKNOWN", turns: 0, total_tokens: 0, credits: null, credit_unknown_turns: 0 }];
  const isReady = projection.state === "ready";
  return (
    <section className={`ai-usage-panel ai-usage-panel-${projection.state}`} aria-label="AI Usage Meter read-only projection" data-live-dialog-background>
      <header className="ai-usage-header">
        <div>
          <span>READ-ONLY LOCAL PROJECTION</span>
          <h2>AI Usage Meter</h2>
          <p>Metadata-only aggregate. Per-thread attribution is intentionally not inferred here.</p>
        </div>
        <strong className="ai-usage-status" data-ai-usage-state={projection.state}>
          {isReady ? `HOOK ${snapshot.health.hook_status}` : "UNMEASURED / UNKNOWN"}
        </strong>
      </header>
      <dl className="ai-usage-summary">
        <div><dt>Total tokens</dt><dd>{formatUsageNumber(snapshot.totals.total_tokens)}</dd></div>
        <div><dt>Credits</dt><dd>{formatUsageCredits(snapshot.totals.credits)}</dd></div>
        <div><dt>Coverage</dt><dd>{snapshot.coverage.status}</dd><small>{formatUsageNumber(snapshot.coverage.measured_turns)} / {formatUsageNumber(snapshot.coverage.total_turns)} measured</small></div>
        <div><dt>Health</dt><dd>{snapshot.health.hook_status}</dd><small>{formatUsageNumber(snapshot.health.pending_event_count)} pending events</small></div>
      </dl>
      <div className="ai-usage-signals" aria-label="usage coverage signals">
        <span>unassigned {formatUsageNumber(snapshot.coverage.unassigned_turns)}</span>
        <span>rate_unknown {formatUsageNumber(snapshot.coverage.rate_unknown_turns)}</span>
        <span>credit_unknown {formatUsageNumber(snapshot.totals.credit_unknown_turns)}</span>
      </div>
      <div className="ai-usage-grid">
        <section aria-labelledby="ai-usage-roles-heading"><h3 id="ai-usage-roles-heading">Role breakdown</h3><UsageRows rows={roles} labelKey="role" /></section>
        <section aria-labelledby="ai-usage-models-heading"><h3 id="ai-usage-models-heading">Model / effort</h3><UsageRows rows={modelEffort} labelKey="model" showEffort /></section>
      </div>
      <div className="ai-usage-activity" aria-label="execution and coordination activity">
        <span>execution {formatUsageNumber(snapshot.activity.execution_turns)}</span>
        <span>coordination {formatUsageNumber(snapshot.activity.coordination_turns)}</span>
        <span>review {formatUsageNumber(snapshot.activity.review_turns)}</span>
        <span>fan-out {formatUsageNumber(snapshot.activity.fan_out_turns)}</span>
        <span>retry {formatUsageNumber(snapshot.activity.retry_count)}</span>
        <span>timeout {formatUsageNumber(snapshot.activity.timeout_count)}</span>
      </div>
    </section>
  );
}

function UsageRows({ rows, labelKey, showEffort = false }: { rows: any[]; labelKey: "role" | "model"; showEffort?: boolean }) {
  return (
    <div className="ai-usage-table" role="table">
      <div className="ai-usage-row ai-usage-row-head" role="row">
        <span role="columnheader">{labelKey === "role" ? "Role" : "Model"}</span><span role="columnheader">Turns</span><span role="columnheader">Tokens</span><span role="columnheader">Credits</span>
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
