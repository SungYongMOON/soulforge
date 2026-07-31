import { useEffect, useMemo, useRef, useState } from "react";
import antigravityBrandIcon from "@lobehub/icons-static-svg/icons/antigravity-color.svg";
import codexBrandIcon from "@lobehub/icons-static-svg/icons/codex-color.svg";
import kimiBrandIcon from "@lobehub/icons-static-svg/icons/kimi-color.svg";
import {
  AlertCircle,
  ArchiveRestore,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  CircleUserRound,
  FileCheck2,
  Filter,
  GitBranch,
  History,
  Info,
  Menu,
  OctagonAlert,
  Play,
  RotateCcw,
  Search,
  ScanSearch,
  ShieldAlert,
  UsersRound,
  X
} from "lucide-react";

import {
  DEFAULT_CARD_LIMIT,
  INBOX_STATUSES,
  INBOX_STATUS_LABELS,
  acknowledgeFixtureTask,
  buildOwnerInboxFixture,
  selectInboxTasks
} from "./core/owner-inbox.mjs";
import {
  getMobileDialogFocusCycleKey,
  MOBILE_DETAIL_MEDIA_QUERY,
  pickFocusRestoreIndex,
  resolveMobileDialogKey
} from "./core/mobile-detail.mjs";
import {
  PROVIDER_ICON_KEYS,
  buildCompactCardView,
  resolveProviderVisual,
  selectObservedProviderEntries
} from "./core/provider-visual.mjs";

type InboxView = "active" | "history";
type FixtureMode = "normal" | "empty" | "error";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

const statusMeta = {
  in_progress: { label: "진행 중", Icon: Play, hint: "현재 실행 중인 대상" },
  review_needed: { label: "검토·결정 필요", Icon: ScanSearch, hint: "Owner 또는 검토자의 판단 필요" },
  blocked: { label: "막힘", Icon: OctagonAlert, hint: "사유와 다음 결정을 유지" },
  completed_unread: { label: "완료·미확인", Icon: CheckCircle2, hint: "읽고 확인 전까지 표시" }
} as const;

function App() {
  const [fixture, setFixture] = useState<any>(() => buildOwnerInboxFixture());
  const [view, setView] = useState<InboxView>("active");
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("all");
  const [responsibility, setResponsibility] = useState("all");
  const [status, setStatus] = useState("all");
  const [fixtureMode, setFixtureMode] = useState<FixtureMode>("normal");
  const [isMobileDetail, setIsMobileDetail] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_DETAIL_MEDIA_QUERY).matches
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    () => isMobileDetail ? null : "fixture-aurora-supply"
  );
  const [limits, setLimits] = useState<Record<string, number>>(
    Object.fromEntries(INBOX_STATUSES.map((entry: string) => [entry, DEFAULT_CARD_LIMIT]))
  );
  const [notice, setNotice] = useState("");
  const detailRef = useRef<HTMLElement | null>(null);
  const detailCloseRef = useRef<HTMLButtonElement | null>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pendingRestoreTaskIdRef = useRef<string | null>(null);

  const maxLimit = Math.max(...Object.values(limits));
  const selection = useMemo(
    () =>
      selectInboxTasks(fixture, {
        view,
        query,
        project,
        responsibility,
        status,
        limit: maxLimit
      }),
    [fixture, view, query, project, responsibility, status, maxLimit]
  );
  const selectedTask = fixture.tasks.find((task: any) => task.id === selectedId) ?? null;
  const mobileDialogOpen = Boolean(isMobileDetail && selectedTask);
  const mobileDialogFocusCycleKey = getMobileDialogFocusCycleKey({
    open: mobileDialogOpen,
    taskId: selectedTask?.id,
    taskStatus: selectedTask?.status
  });
  const responsibilityOptions = useMemo(
    () =>
      Array.from(
        new Set(
          fixture.responsibilities
            .filter((entry: any) => project === "all" || entry.projectCode === project)
            .map((entry: any) => entry.responsibility)
        )
      ).sort((left, right) => String(left).localeCompare(String(right), "ko")),
    [fixture.responsibilities, project]
  );

  function resetFilters() {
    setQuery("");
    setProject("all");
    setResponsibility("all");
    setStatus("all");
  }

  function selectTask(taskId: string, trigger: HTMLButtonElement) {
    detailTriggerRef.current = trigger;
    setSelectedId(taskId);
  }

  function closeDetail() {
    if (mobileDialogOpen && selectedTask) {
      pendingRestoreTaskIdRef.current = selectedTask.id;
    }
    setSelectedId(null);
  }

  function acknowledge(taskId: string) {
    const result = acknowledgeFixtureTask(fixture, {
      taskId,
      atKst: "2026-07-31 16:05 KST",
      actor: "Owner"
    });
    if (result.error) {
      setNotice("완료·미확인 상태만 읽고 확인할 수 있습니다.");
      return;
    }
    setFixture(result.fixture);
    setView("history");
    setNotice("합성 fixture를 읽고 확인했습니다. 원 pointer와 이벤트는 이력에 보존됩니다.");
  }

  useEffect(() => {
    const media = window.matchMedia(MOBILE_DETAIL_MEDIA_QUERY);
    const syncViewport = () => setIsMobileDetail(media.matches);
    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    if (!mobileDialogOpen || !detailRef.current) {
      return;
    }

    const backgroundNodes = Array.from(
      document.querySelectorAll<HTMLElement>("[data-dialog-background]")
    );
    const previousBodyOverflow = document.body.style.overflow;

    backgroundNodes.forEach((node) => {
      node.inert = true;
      node.setAttribute("aria-hidden", "true");
    });
    document.body.style.overflow = "hidden";

    const dialogFocusCandidates = [
      detailCloseRef.current,
      detailRef.current.querySelector<HTMLElement>('[data-dialog-focus-fallback="heading"]')
    ];
    const dialogFocusIndex = pickFocusRestoreIndex(
      dialogFocusCandidates.map((node) => {
        const style = node ? window.getComputedStyle(node) : null;
        return {
          exists: Boolean(node),
          isConnected: Boolean(node?.isConnected),
          disabled: Boolean(
            node && "disabled" in node && (node as HTMLButtonElement).disabled
          ),
          hidden: Boolean(
            node &&
              (node.hidden ||
                node.getAttribute("aria-hidden") === "true" ||
                style?.display === "none" ||
                style?.visibility === "hidden")
          ),
          inert: Boolean(node?.closest("[inert]"))
        };
      })
    );
    dialogFocusCandidates[dialogFocusIndex]?.focus({ preventScroll: true });

    function handleDialogKeydown(event: KeyboardEvent) {
      const dialog = detailRef.current;
      if (!dialog) {
        return;
      }

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((node) => node.getAttribute("aria-hidden") !== "true" && node.offsetParent !== null);
      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const decision = resolveMobileDialogKey({
        key: event.key,
        shiftKey: event.shiftKey,
        activeIndex,
        focusableCount: focusable.length
      });

      if (decision.action === "close") {
        event.preventDefault();
        closeDetail();
      } else if (decision.action === "focus" && typeof decision.index === "number") {
        event.preventDefault();
        focusable[decision.index]?.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeydown, true);
    return () => {
      document.removeEventListener("keydown", handleDialogKeydown, true);
      backgroundNodes.forEach((node) => {
        node.inert = false;
        node.removeAttribute("aria-hidden");
      });
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [mobileDialogOpen, mobileDialogFocusCycleKey]);

  useEffect(() => {
    const taskId = pendingRestoreTaskIdRef.current;
    if (mobileDialogOpen || !taskId) {
      return;
    }

    pendingRestoreTaskIdRef.current = null;
    window.requestAnimationFrame(() => {
      const logicalTaskTarget = Array.from(
        document.querySelectorAll<HTMLElement>("[data-task-focus-id]")
      ).find((node) => node.dataset.taskFocusId === taskId) ?? null;
      const viewControl =
        document.querySelector<HTMLElement>(`[data-view-focus="${view}"]`);
      const candidates = [
        detailTriggerRef.current,
        logicalTaskTarget,
        viewControl,
        document.querySelector<HTMLElement>('[data-focus-fallback="search"]'),
        document.querySelector<HTMLElement>('[data-focus-fallback="scope-heading"]'),
        document.querySelector<HTMLElement>('[data-focus-fallback="main"]')
      ];
      const candidateStates = candidates.map((node) => {
        const style = node ? window.getComputedStyle(node) : null;
        return {
          exists: Boolean(node),
          isConnected: Boolean(node?.isConnected),
          disabled: Boolean(
            node && "disabled" in node && (node as HTMLButtonElement | HTMLInputElement).disabled
          ),
          hidden: Boolean(
            node &&
              (node.hidden ||
                node.getAttribute("aria-hidden") === "true" ||
                style?.display === "none" ||
                style?.visibility === "hidden")
          ),
          inert: Boolean(node?.closest("[inert]"))
        };
      });
      const restoreIndex = pickFocusRestoreIndex(candidateStates);
      const restoreTarget = restoreIndex >= 0 ? candidates[restoreIndex] : null;
      restoreTarget?.focus({ preventScroll: true });
    });
  }, [mobileDialogOpen, view]);

  return (
    <div className="inbox-app">
      <a className="inbox-skip-link" href="#inbox-content" data-dialog-background>
        본문으로 건너뛰기
      </a>

      <header className="inbox-topbar" data-dialog-background>
        <button className="inbox-icon-button" type="button" aria-label="메뉴 열기" title="메뉴">
          <Menu size={19} aria-hidden="true" />
        </button>
        <div className="inbox-brand">
          <strong>Owner Action Inbox</strong>
          <span>Workspace Board</span>
        </div>
        <label className="inbox-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">프로젝트, TASK, Agent 검색</span>
          <input
            type="search"
            data-focus-fallback="search"
            value={query}
            placeholder="검색 (프로젝트, TASK, Agent)"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button type="button" aria-label="검색어 지우기" onClick={() => setQuery("")}>
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </label>
        <div className="inbox-synthetic-banner" role="note">
          <Info size={14} aria-hidden="true" />
          <span>합성 데이터 · 실제 시스템 미연동 · 2026-07-31 KST</span>
        </div>
        <div className="inbox-top-icons">
          <button type="button" aria-label="알림 예시" title="알림 예시">
            <Bell size={18} aria-hidden="true" />
          </button>
          <button type="button" aria-label="도움말" title="도움말">
            <CircleHelp size={18} aria-hidden="true" />
          </button>
          <span className="inbox-avatar" aria-label="현재 사용자 Owner">
            O
          </span>
        </div>
      </header>

      <section className="inbox-controls" aria-label="보드 필터" data-dialog-background>
        <label>
          <span>프로젝트</span>
          <select
            value={project}
            onChange={(event) => {
              setProject(event.target.value);
              setResponsibility("all");
            }}
          >
            <option value="all">전체</option>
            {fixture.projects.map((entry: any) => (
              <option key={entry.code} value={entry.code}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>책임분야</span>
          <select value={responsibility} onChange={(event) => setResponsibility(event.target.value)}>
            <option value="all">전체</option>
            {responsibilityOptions.map((entry) => (
              <option key={String(entry)} value={String(entry)}>
                {String(entry)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>상태</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">전체 active</option>
            {INBOX_STATUSES.map((entry: string) => (
              <option key={entry} value={entry}>
                {INBOX_STATUS_LABELS[entry as keyof typeof INBOX_STATUS_LABELS]}
              </option>
            ))}
          </select>
        </label>
        <button className="inbox-text-button" type="button" onClick={resetFilters}>
          <RotateCcw size={14} aria-hidden="true" />
          필터 초기화
        </button>
        <div className="inbox-view-switch" aria-label="표시 화면">
          <button
            type="button"
            data-view-focus="active"
            className={view === "active" ? "is-active" : ""}
            aria-pressed={view === "active"}
            onClick={() => setView("active")}
          >
            <Filter size={14} aria-hidden="true" />
            Active
          </button>
          <button
            type="button"
            data-view-focus="history"
            className={view === "history" ? "is-active" : ""}
            aria-pressed={view === "history"}
            onClick={() => setView("history")}
          >
            <History size={14} aria-hidden="true" />
            이력·제외
          </button>
        </div>
      </section>

      {notice && (
        <div className="inbox-notice" role="status" data-dialog-background>
          <Check size={15} aria-hidden="true" />
          {notice}
          <button type="button" aria-label="알림 닫기" onClick={() => setNotice("")}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      <main
        id="inbox-content"
        className="inbox-layout"
        data-focus-fallback="main"
        tabIndex={-1}
      >
        <section
          className="inbox-workspace"
          aria-label={view === "active" ? "Owner Action 보드" : "이력과 제외 항목"}
          data-dialog-background
        >
          <div className="inbox-scope-row">
            <div>
              <strong data-focus-fallback="scope-heading" tabIndex={-1}>
                {view === "active" ? `Active target ${selection.eligible.length}건` : `회수 가능한 이력·제외 ${selection.eligible.length}건`}
              </strong>
              <span>전체 fixture {fixture.projects.length} projects × {fixture.responsibilities.length / fixture.projects.length} responsibilities · {fixture.tasks.length} TASK</span>
            </div>
            <label className="inbox-fixture-mode">
              <span>화면 상태 예시</span>
              <select
                value={fixtureMode}
                onChange={(event) => {
                  setFixtureMode(event.target.value as FixtureMode);
                  if (event.target.value !== "normal") {
                    setSelectedId(null);
                  }
                }}
              >
                <option value="normal">정상</option>
                <option value="empty">빈 화면</option>
                <option value="error">오류</option>
              </select>
            </label>
          </div>

          {fixtureMode === "error" ? (
            <ErrorState onReset={() => setFixtureMode("normal")} />
          ) : fixtureMode === "empty" ? (
            <EmptyState filtered={false} onReset={() => setFixtureMode("normal")} />
          ) : view === "history" ? (
            <HistoryView
              tasks={selection.eligible}
              events={fixture.history}
              selectedId={selectedId}
              onSelect={selectTask}
              onReset={resetFilters}
            />
          ) : (
            <Board
              selection={selection}
              limits={limits}
              selectedId={selectedId}
              onSelect={selectTask}
              onMore={(statusId) =>
                setLimits((current) => ({ ...current, [statusId]: current[statusId] + DEFAULT_CARD_LIMIT }))
              }
              onReset={resetFilters}
            />
          )}
        </section>

        {mobileDialogOpen && (
          <div
            className="inbox-modal-backdrop"
            aria-hidden="true"
            onClick={closeDetail}
          />
        )}

        {selectedTask && (
          <DetailPanel
            task={selectedTask}
            isModal={mobileDialogOpen}
            panelRef={detailRef}
            closeButtonRef={detailCloseRef}
            onClose={closeDetail}
            onAcknowledge={() => acknowledge(selectedTask.id)}
          />
        )}
      </main>

      <footer className="inbox-footer" data-dialog-background>
        <span>fixture/read-only adapter · 새로고침 시 합성 상태 초기화</span>
        <span>실제 thread·ERP·worktree·provider truth가 아닙니다</span>
      </footer>
    </div>
  );
}

function Board({
  selection,
  limits,
  selectedId,
  onSelect,
  onMore,
  onReset
}: {
  selection: any;
  limits: Record<string, number>;
  selectedId: string | null;
  onSelect: (taskId: string, trigger: HTMLButtonElement) => void;
  onMore: (statusId: string) => void;
  onReset: () => void;
}) {
  if (selection.eligible.length === 0) {
    return <EmptyState filtered onReset={onReset} />;
  }

  return (
    <div className="inbox-board">
      {INBOX_STATUSES.map((statusId: string) => {
        const meta = statusMeta[statusId as keyof typeof statusMeta];
        const group = selection.grouped[statusId];
        const visible = group.all.slice(0, limits[statusId]);
        const Icon = meta.Icon;

        return (
          <section className={`inbox-column inbox-column-${statusId}`} key={statusId} aria-labelledby={`column-${statusId}`}>
            <header className="inbox-column-header">
              <Icon size={18} aria-hidden="true" />
              <h2 id={`column-${statusId}`}>{meta.label}</h2>
              <span aria-label={`${group.total}건`}>{group.total}</span>
            </header>
            <p className="inbox-column-hint">{meta.hint}</p>
            <div className="inbox-card-list">
              {visible.map((task: any) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  selected={selectedId === task.id}
                  onSelect={(trigger) => onSelect(task.id, trigger)}
                />
              ))}
              {group.total === 0 && <div className="inbox-column-empty">대상 없음</div>}
            </div>
            {group.total > visible.length && (
              <button className="inbox-more-button" type="button" onClick={() => onMore(statusId)}>
                더보기 {group.total - visible.length}건
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

function TaskCard({
  task,
  selected,
  onSelect
}: {
  task: any;
  selected: boolean;
  onSelect: (trigger: HTMLButtonElement) => void;
}) {
  const compact = buildCompactCardView(task);
  const statusLabel =
    INBOX_STATUS_LABELS[compact.status as keyof typeof INBOX_STATUS_LABELS] ?? compact.status;

  return (
    <button
      className={`inbox-task-card ${selected ? "is-selected" : ""}`}
      type="button"
      data-task-focus-id={task.id}
      aria-pressed={selected}
      aria-label={`${task.project}, ${task.title}, ${INBOX_STATUS_LABELS[task.status as keyof typeof INBOX_STATUS_LABELS]}`}
      onClick={(event) => onSelect(event.currentTarget)}
    >
      <span className="inbox-card-meta">
        <span>{compact.project}</span>
        <span>{compact.responsibility}</span>
        <span className={`inbox-card-status inbox-card-status-${compact.status}`}>
          {statusLabel}
        </span>
      </span>
      <strong>
        <FileCheck2 size={15} aria-hidden="true" />
        {compact.title}
      </strong>
      <span className="inbox-card-route">{compact.route}</span>
      <ProviderRow task={task} />
    </button>
  );
}

const providerIconMap = {
  [PROVIDER_ICON_KEYS.CODEX_GPT]: codexBrandIcon,
  [PROVIDER_ICON_KEYS.ANTIGRAVITY_GEMINI]: antigravityBrandIcon,
  [PROVIDER_ICON_KEYS.KIMI]: kimiBrandIcon
} as const;

function ProviderRow({ task }: { task: any }) {
  const observedProviders = selectObservedProviderEntries(task);

  if (task.agentState !== "observed") {
    return (
      <span className="inbox-agent-unknown" data-provider-icon={PROVIDER_ICON_KEYS.UNKNOWN}>
        <Bot size={12} aria-hidden="true" />
        Agent/provider UNKNOWN · 추정 안 함
      </span>
    );
  }

  if (observedProviders.length === 0) {
    return null;
  }

  return (
    <span className="inbox-provider-row" aria-label={`관찰된 agent ${observedProviders.length}개`}>
      {observedProviders.map((entry: any) => {
        const visual = resolveProviderVisual(entry);
        const brandIcon = providerIconMap[visual.iconKey as keyof typeof providerIconMap];
        return (
          <span
            className={`inbox-provider-badge inbox-provider-${visual.iconKey}`}
            data-provider-icon={visual.iconKey}
            key={`${entry.agent}-${entry.provider}`}
            aria-label={visual.accessibleName}
            title={visual.accessibleName}
          >
            {brandIcon ? (
              <img
                className="inbox-provider-brand-icon"
                src={brandIcon}
                alt=""
                aria-hidden="true"
              />
            ) : (
              <Bot size={12} aria-hidden="true" />
            )}
            {visual.label}
          </span>
        );
      })}
      {observedProviders.length > 1 && (
        <span className="inbox-multi-badge">
          <UsersRound size={12} aria-hidden="true" />
          복수 agent
        </span>
      )}
    </span>
  );
}

function DetailPanel({
  task,
  isModal,
  panelRef,
  closeButtonRef,
  onClose,
  onAcknowledge
}: {
  task: any;
  isModal: boolean;
  panelRef: React.RefObject<HTMLElement | null>;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onAcknowledge: () => void;
}) {
  const statusLabel =
    INBOX_STATUS_LABELS[task.status as keyof typeof INBOX_STATUS_LABELS] ?? task.status;
  const panelTitle =
    task.status === "blocked" || task.status === "review_needed"
      ? "Owner 판단 필요"
      : task.status === "completed_unread"
        ? "완료 결과 확인"
        : task.status === "owner_acknowledged"
          ? "이력 상세"
          : statusLabel;

  const headingId = `inbox-detail-heading-${task.id}`;

  return (
    <aside
      ref={panelRef}
      className={`inbox-detail inbox-detail-${task.status}`}
      role={isModal ? "dialog" : undefined}
      aria-modal={isModal ? true : undefined}
      aria-labelledby={headingId}
    >
      <header>
        <div>
          <span className="inbox-detail-kicker">{task.synthetic ? "SYNTHETIC FIXTURE" : "관찰됨"}</span>
          <h2
            id={headingId}
            data-dialog-focus-fallback="heading"
            tabIndex={isModal ? -1 : undefined}
          >
            {panelTitle}
          </h2>
        </div>
        <button
          ref={closeButtonRef}
          className="inbox-icon-button"
          type="button"
          onClick={onClose}
          aria-label="상세 닫기"
          title="닫기"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <section className="inbox-detail-title">
        <span>{task.project} · {task.responsibility || "책임분야 미관찰"}</span>
        <h3>
          <FileCheck2 size={17} aria-hidden="true" />
          {task.title}
        </h3>
        <p>{task.route || "route 미관찰 · UNKNOWN"}</p>
      </section>

      <dl className="inbox-detail-grid">
        <div>
          <dt>책임자</dt>
          <dd>{task.owner}</dd>
        </div>
        <div>
          <dt>검토자</dt>
          <dd>{task.reviewer}</dd>
        </div>
        <div>
          <dt>검토 필요</dt>
          <dd>{task.reviewNeeded ? "예" : "아니오"}</dd>
        </div>
        <div>
          <dt>최근 활동</dt>
          <dd>{task.lastActivityKst}</dd>
        </div>
      </dl>

      <section className="inbox-detail-section">
        <h4>Agent/provider 관찰 상태</h4>
        <ProviderRow task={task} />
        {task.worktree && (
          <p className="inbox-worktree">
            <GitBranch size={13} aria-hidden="true" />
            실제 연결 fixture metadata: {task.worktree}
          </p>
        )}
      </section>

      {task.status === "blocked" && (
        <>
          <section className="inbox-blocker">
            <h4>
              <ShieldAlert size={15} aria-hidden="true" />
              Blocker
            </h4>
            <strong>{task.blockerReason}</strong>
          </section>
          <section className="inbox-decision">
            <span>다음 결정</span>
            <strong>{task.nextDecision}</strong>
            <p>막힘은 결정되기 전까지 active 보드에 잔류합니다.</p>
          </section>
          {task.evidenceSummary && (
            <section className="inbox-detail-section">
              <h4>주요 근거</h4>
              <p>{task.evidenceSummary}</p>
            </section>
          )}
          {task.impact && (
            <section className="inbox-detail-section">
              <h4>영향</h4>
              <p>{task.impact}</p>
            </section>
          )}
          {task.requestMessage && (
            <section className="inbox-request-message">
              <span>요청 메시지</span>
              <p>{task.requestMessage}</p>
            </section>
          )}
        </>
      )}

      {task.nextDecision && task.status !== "blocked" && (
        <section className="inbox-decision">
          <span>다음 행동</span>
          <strong>{task.nextDecision}</strong>
        </section>
      )}

      <section className="inbox-detail-section">
        <h4>Thread / TASK pointer</h4>
        <code>{task.pointer}</code>
        <p>표시용 synthetic pointer이며 실제 thread를 열거나 변경하지 않습니다.</p>
      </section>

      {task.events.length > 0 && (
        <section className="inbox-detail-section">
          <h4>
            <History size={14} aria-hidden="true" />
            보존된 이벤트
          </h4>
          {task.events.map((event: any) => (
            <div className="inbox-event" key={event.id}>
              <strong>{event.atKst} · {event.actor}</strong>
              <span>{event.from} → {event.to}</span>
              <code>{event.originalPointer}</code>
            </div>
          ))}
        </section>
      )}

      {task.status === "completed_unread" && (
        <button className="inbox-ack-button" type="button" onClick={onAcknowledge}>
          <CheckCircle2 size={17} aria-hidden="true" />
          읽고 확인
        </button>
      )}
      {task.status === "owner_acknowledged" && (
        <div className="inbox-acknowledged">
          <Check size={15} aria-hidden="true" />
          읽고 확인됨 · active에서 제외
        </div>
      )}
    </aside>
  );
}

function HistoryView({
  tasks,
  events,
  selectedId,
  onSelect,
  onReset
}: {
  tasks: any[];
  events: any[];
  selectedId: string | null;
  onSelect: (taskId: string, trigger: HTMLButtonElement) => void;
  onReset: () => void;
}) {
  if (tasks.length === 0) {
    return <EmptyState filtered onReset={onReset} />;
  }

  return (
    <div className="inbox-history">
      <div className="inbox-history-summary">
        <ArchiveRestore size={18} aria-hidden="true" />
        <div>
          <strong>acknowledged·제외 상태 회수</strong>
          <span>검색과 필터로 원 TASK pointer를 다시 찾을 수 있습니다. 확인 이벤트 {events.length}건.</span>
        </div>
      </div>
      <div className="inbox-history-list">
        {tasks.slice(0, 60).map((task) => (
          <button
            key={task.id}
            type="button"
            data-task-focus-id={task.id}
            className={selectedId === task.id ? "is-selected" : ""}
            onClick={(event) => onSelect(task.id, event.currentTarget)}
          >
            <span>
              <strong>{task.title}</strong>
              <small>{task.project} · {task.responsibility || "책임분야 미관찰"}</small>
            </span>
            <span>
              {INBOX_STATUS_LABELS[task.status as keyof typeof INBOX_STATUS_LABELS] ?? task.status}
            </span>
            <code>{task.pointer}</code>
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        ))}
      </div>
      {tasks.length > 60 && <p className="inbox-history-cap">상위 60건만 표시 · 필터로 범위를 좁혀 주세요.</p>}
    </div>
  );
}

function EmptyState({ filtered, onReset }: { filtered: boolean; onReset: () => void }) {
  return (
    <div className="inbox-state-panel">
      <CircleUserRound size={28} aria-hidden="true" />
      <h2>{filtered ? "조건에 맞는 항목이 없습니다" : "현재 표시할 합성 항목이 없습니다"}</h2>
      <p>
        {filtered
          ? "검색어나 프로젝트·책임분야 필터를 초기화해 다시 확인하세요."
          : "실제 시스템 상태로 해석하지 마세요. 이 화면은 빈 상태 fixture입니다."}
      </p>
      <button className="inbox-text-button" type="button" onClick={onReset}>
        <RotateCcw size={14} aria-hidden="true" />
        {filtered ? "필터 초기화" : "정상 fixture로 돌아가기"}
      </button>
    </div>
  );
}

function ErrorState({ onReset }: { onReset: () => void }) {
  return (
    <div className="inbox-state-panel inbox-state-error" role="alert">
      <AlertCircle size={28} aria-hidden="true" />
      <h2>fixture adapter를 읽지 못했습니다</h2>
      <p>실제 writer나 외부 backend로 우회하지 않습니다. 합성 표본만 다시 불러올 수 있습니다.</p>
      <button className="inbox-text-button" type="button" onClick={onReset}>
        <RotateCcw size={14} aria-hidden="true" />
        합성 fixture 다시 불러오기
      </button>
    </div>
  );
}

export default App;
