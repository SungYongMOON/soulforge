import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Columns3,
  Download,
  FileText,
  Filter,
  Flag,
  History,
  ListChecks,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Upload,
  UserCircle,
  Users,
  X
} from "lucide-react";

import {
  HEALTH_LABELS_KO,
  PRIORITIES,
  PRIORITY_LABELS_KO,
  PROJECT_HEALTH,
  STATUSES,
  STATUS_LABELS_KO,
  addDaysKey,
  bucketForItem,
  requiredNoteField,
  statusLabel
} from "./core/model.mjs";
import {
  addComment,
  addItem,
  makeBackup,
  restoreBackup,
  updateItem,
  upsertPerson,
  upsertProject
} from "./core/store.mjs";
import { exportItemsCsv, importItemsCsv } from "./core/csv.mjs";
import { baselineSummaryKo, captureBaseline, diffSinceBaseline } from "./core/baseline.mjs";
import { buildSeedState, loadStoredState, nowIso, saveStoredState, todayKey } from "./storage";

type ViewId = "board" | "projects" | "schedule" | "people" | "settings";
type RangeFilter = "today" | "week";
type BucketId = "today" | "blocked" | "due_soon" | "waiting" | "done" | "no_owner";

const navItems: Array<{ id: ViewId; label: string; Icon: typeof Columns3 }> = [
  { id: "board", label: "보드", Icon: Columns3 },
  { id: "projects", label: "프로젝트", Icon: ClipboardList },
  { id: "schedule", label: "일정", Icon: CalendarDays },
  { id: "people", label: "팀원", Icon: Users },
  { id: "settings", label: "설정", Icon: Settings }
];

const bucketMeta: Array<{ id: BucketId; label: string; tone: string }> = [
  { id: "today", label: "오늘", tone: "blue" },
  { id: "blocked", label: "차단", tone: "red" },
  { id: "due_soon", label: "마감 임박", tone: "amber" },
  { id: "waiting", label: "대기", tone: "purple" },
  { id: "done", label: "완료", tone: "green" },
  { id: "no_owner", label: "담당 없음", tone: "slate" }
];

const ERROR_MESSAGES_KO: Record<string, string> = {
  title_required: "제목을 입력해 주세요.",
  blocker_reason_required: "차단 상태에는 차단 사유가 필요합니다.",
  waiting_on_required: "대기 상태에는 대기 대상이 필요합니다.",
  no_change: "변경된 내용이 없습니다.",
  comment_empty: "메모 내용을 입력해 주세요.",
  item_not_found: "항목을 찾을 수 없습니다.",
  backup_not_json: "백업 파일이 JSON 형식이 아닙니다.",
  backup_schema_mismatch: "백업 파일의 스키마 버전이 다릅니다.",
  backup_items_invalid: "백업 파일 안에 잘못된 항목이 있습니다.",
  project_name_required: "프로젝트 이름을 입력해 주세요.",
  person_name_required: "팀원 이름을 입력해 주세요."
};

function errorMessage(code: string | undefined): string {
  if (!code) {
    return "알 수 없는 오류";
  }
  return ERROR_MESSAGES_KO[code] ?? `처리하지 못했습니다 (${code})`;
}

interface NewItemForm {
  title: string;
  projectId: string;
  ownerId: string;
  status: string;
  priority: string;
  dueDate: string;
  nextAction: string;
  blockerReason: string;
  waitingOn: string;
}

function App() {
  const [state, setState] = useState<any>(() => loadStoredState() ?? buildSeedState());
  const [actor, setActor] = useState("관리자");
  const [activeView, setActiveView] = useState<ViewId>("board");
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>("today");
  const [projectFilter, setProjectFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const today = todayKey();
  const weekEnd = addDaysKey(today, 6);

  useEffect(() => {
    const saved = saveStoredState(state);
    if (!saved) {
      setNotice("브라우저 저장에 실패했습니다. 백업 파일을 내려받아 주세요.");
    }
  }, [state]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function runMutation(result: { state: any; error?: string }, successNote?: string): boolean {
    if (result.error) {
      setNotice(errorMessage(result.error));
      return false;
    }
    setState(result.state);
    if (successNote) {
      setNotice(successNote);
    }
    return true;
  }

  const items = state.items as any[];
  const selectedItem = items.find((item) => item.id === selectedId) ?? null;

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const inRange =
        rangeFilter === "today"
          ? !item.dueDate || item.dueDate <= today || item.status === "blocked" || !item.ownerId
          : !item.dueDate || item.dueDate <= weekEnd;
      const inProject = projectFilter === "all" || item.projectId === projectFilter;
      const inOwner =
        ownerFilter === "all" || (ownerFilter === "none" ? !item.ownerId : item.ownerId === ownerFilter);
      const inStatus = statusFilter === "all" || item.status === statusFilter;
      const project = state.projects.find((entry: any) => entry.id === item.projectId);
      const owner = state.people.find((entry: any) => entry.id === item.ownerId);
      const inQuery =
        !normalizedQuery ||
        [item.title, item.nextAction, project?.name ?? "", owner?.name ?? "", statusLabel(item.status)]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      return inRange && inProject && inOwner && inStatus && inQuery;
    });
  }, [items, state.projects, state.people, rangeFilter, projectFilter, ownerFilter, statusFilter, query, today, weekEnd]);

  const buckets = useMemo(() => {
    const groups: Record<BucketId, any[]> = {
      today: [],
      blocked: [],
      due_soon: [],
      waiting: [],
      done: [],
      no_owner: []
    };
    for (const item of filteredItems) {
      groups[bucketForItem(item, today, weekEnd) as BucketId].push(item);
    }
    return groups;
  }, [filteredItems, today, weekEnd]);

  const baselineDiff = useMemo(() => diffSinceBaseline(state), [state]);

  function handleCaptureBaseline() {
    const baseline = captureBaseline(state, { at: nowIso(), actor });
    setState({ ...state, baseline });
    setNotice("오전 기준선을 고정했습니다.");
  }

  function handleCreateItem(form: NewItemForm) {
    const ok = runMutation(
      addItem(state, {
        at: nowIso(),
        actor,
        fields: {
          ...form,
          ownerId: form.ownerId === "none" ? null : form.ownerId
        }
      }),
      "항목을 추가했습니다."
    );
    if (ok) {
      setAddOpen(false);
    }
  }

  return (
    <div className="ops-shell">
      <aside className="ops-sidebar" aria-label="팀 운영 보드 탐색">
        <div className="ops-brand">
          <div className="ops-brand-mark">
            <ListChecks size={20} aria-hidden="true" />
          </div>
          <div>
            <h1>팀 운영 보드</h1>
            <p>{formatDateKo(today)}</p>
          </div>
        </div>

        <nav className="ops-nav">
          {navItems.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`ops-nav-button ${activeView === id ? "is-active" : ""}`}
              type="button"
              onClick={() => setActiveView(id)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="ops-actor">
          <label>
            현재 사용자
            <select value={actor} onChange={(event) => setActor(event.target.value)}>
              <option value="관리자">관리자</option>
              {state.people.map((person: any) => (
                <option key={person.id} value={person.name}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </aside>

      <main className="ops-main">
        <header className="ops-topbar">
          <div className="ops-title-group">
            <p className="ops-kicker">일일 운영</p>
            <h2>{viewTitle(activeView)}</h2>
          </div>

          <div className="ops-actions">
            <button className="ops-button" type="button" onClick={handleCaptureBaseline} title="현재 보드를 오전 기준선으로 고정">
              <Flag size={16} aria-hidden="true" />
              <span>기준선 고정</span>
            </button>
            <span className={`ops-baseline-chip ${baselineDiff && baselineDiff.count > 0 ? "has-change" : ""}`}>
              {baselineSummaryKo(baselineDiff)}
            </span>
            <label className="ops-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                placeholder="작업 검색"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button className="ops-button" type="button" onClick={() => setExportOpen(true)}>
              <Download size={16} aria-hidden="true" />
              <span>내보내기</span>
            </button>
            <button className="ops-button ops-button-primary" type="button" onClick={() => setAddOpen(true)}>
              <Plus size={16} aria-hidden="true" />
              <span>항목 추가</span>
            </button>
          </div>
        </header>

        {notice && <div className="ops-notice">{notice}</div>}

        {activeView === "board" && (
          <BoardView
            state={state}
            buckets={buckets}
            filteredItems={filteredItems}
            rangeFilter={rangeFilter}
            projectFilter={projectFilter}
            ownerFilter={ownerFilter}
            statusFilter={statusFilter}
            selectedId={selectedItem?.id}
            baselineDiff={baselineDiff}
            onRangeFilterChange={setRangeFilter}
            onProjectFilterChange={setProjectFilter}
            onOwnerFilterChange={setOwnerFilter}
            onStatusFilterChange={setStatusFilter}
            onSelectItem={(item) => setSelectedId(item.id)}
          />
        )}

        {activeView === "projects" && (
          <ProjectsView state={state} onSelectItem={(item) => { setSelectedId(item.id); setActiveView("board"); }} />
        )}
        {activeView === "schedule" && (
          <ScheduleView state={state} onSelectItem={(item) => { setSelectedId(item.id); setActiveView("board"); }} />
        )}
        {activeView === "people" && (
          <PeopleView state={state} today={today} onSelectItem={(item) => { setSelectedId(item.id); setActiveView("board"); }} />
        )}
        {activeView === "settings" && (
          <SettingsView state={state} actor={actor} runMutation={runMutation} setState={setState} setNotice={setNotice} />
        )}

        {activeView === "board" && selectedItem && (
          <DetailPanel
            key={selectedItem.id}
            state={state}
            item={selectedItem}
            actor={actor}
            runMutation={runMutation}
            onClose={() => setSelectedId(null)}
          />
        )}
      </main>

      {addOpen && (
        <AddItemModal state={state} today={today} onClose={() => setAddOpen(false)} onCreate={handleCreateItem} />
      )}

      {exportOpen && (
        <ExportModal state={state} today={today} weekEnd={weekEnd} onClose={() => setExportOpen(false)} />
      )}
    </div>
  );
}

function BoardView({
  state,
  buckets,
  filteredItems,
  rangeFilter,
  projectFilter,
  ownerFilter,
  statusFilter,
  selectedId,
  baselineDiff,
  onRangeFilterChange,
  onProjectFilterChange,
  onOwnerFilterChange,
  onStatusFilterChange,
  onSelectItem
}: {
  state: any;
  buckets: Record<BucketId, any[]>;
  filteredItems: any[];
  rangeFilter: RangeFilter;
  projectFilter: string;
  ownerFilter: string;
  statusFilter: string;
  selectedId: string | undefined;
  baselineDiff: any;
  onRangeFilterChange: (value: RangeFilter) => void;
  onProjectFilterChange: (value: string) => void;
  onOwnerFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onSelectItem: (item: any) => void;
}) {
  const recentEvents = (state.audit as any[]).slice(0, 8);

  return (
    <section className="ops-board-shell" aria-label="일일 운영 보드">
      <div className="ops-board-toolbar">
        <div className="ops-segmented" aria-label="기간">
          <button className={rangeFilter === "today" ? "is-selected" : ""} type="button" onClick={() => onRangeFilterChange("today")}>
            오늘
          </button>
          <button className={rangeFilter === "week" ? "is-selected" : ""} type="button" onClick={() => onRangeFilterChange("week")}>
            이번 주
          </button>
        </div>

        <label className="ops-filter-select">
          <Filter size={16} aria-hidden="true" />
          <select value={projectFilter} onChange={(event) => onProjectFilterChange(event.target.value)}>
            <option value="all">전체 프로젝트</option>
            {state.projects.map((project: any) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label className="ops-filter-select">
          <UserCircle size={16} aria-hidden="true" />
          <select value={ownerFilter} onChange={(event) => onOwnerFilterChange(event.target.value)}>
            <option value="all">전체 담당</option>
            <option value="none">담당 없음</option>
            {state.people.map((person: any) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>

        <label className="ops-filter-select">
          <ListChecks size={16} aria-hidden="true" />
          <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}>
            <option value="all">전체 상태</option>
            {STATUSES.map((status: string) => (
              <option key={status} value={status}>
                {STATUS_LABELS_KO[status as keyof typeof STATUS_LABELS_KO]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="ops-metrics" aria-label="보드 집계">
        {bucketMeta.map((bucket) => (
          <div className={`ops-metric ops-tone-${bucket.tone}`} key={bucket.id}>
            <span>{bucket.label}</span>
            <strong>{buckets[bucket.id].length}</strong>
          </div>
        ))}
      </div>

      <div className="ops-board-grid">
        {bucketMeta.map((bucket) => (
          <section className="ops-column" key={bucket.id}>
            <header>
              <span className={`ops-dot ops-tone-${bucket.tone}`} aria-hidden="true" />
              <h3>{bucket.label}</h3>
              <strong>{buckets[bucket.id].length}</strong>
            </header>
            <div className="ops-column-list">
              {buckets[bucket.id].map((item) => (
                <WorkItemCard
                  key={item.id}
                  state={state}
                  item={item}
                  selected={item.id === selectedId}
                  onSelect={() => onSelectItem(item)}
                />
              ))}
              {buckets[bucket.id].length === 0 && <div className="ops-empty-line">항목 없음</div>}
            </div>
          </section>
        ))}
      </div>

      <div className="ops-board-lower">
        <section className="ops-recent" aria-label="최근 변경">
          <h4>
            <History size={16} aria-hidden="true" />
            최근 변경
          </h4>
          {recentEvents.length === 0 && <div className="ops-empty-line">아직 변경 기록이 없습니다</div>}
          {recentEvents.map((event: any) => (
            <div className="ops-recent-row" key={event.id}>
              <span className="ops-recent-time">{formatTimeKo(event.at)}</span>
              <span className="ops-recent-actor">{event.actor}</span>
              <span className="ops-recent-summary">
                {event.summary}
                {event.field && event.from !== null && event.to !== null && (
                  <em>
                    {String(event.from || "없음")} → {String(event.to || "없음")}
                  </em>
                )}
              </span>
            </div>
          ))}
        </section>

        <section className="ops-recent" aria-label="기준선 대비 변경">
          <h4>
            <Flag size={16} aria-hidden="true" />
            기준선 대비
          </h4>
          {!baselineDiff && <div className="ops-empty-line">기준선이 아직 없습니다. 아침 회의에서 고정하세요.</div>}
          {baselineDiff && baselineDiff.count === 0 && <div className="ops-empty-line">기준선 이후 변경 없음</div>}
          {baselineDiff &&
            baselineDiff.changed.slice(0, 5).map((entry: any) => (
              <div className="ops-recent-row" key={entry.id}>
                <span className="ops-recent-summary">
                  {entry.title}
                  {entry.fields.slice(0, 2).map((field: any) => (
                    <em key={field.field}>
                      {field.label}: {field.from || "없음"} → {field.to || "없음"}
                    </em>
                  ))}
                </span>
              </div>
            ))}
          {baselineDiff && baselineDiff.added.length > 0 && (
            <div className="ops-recent-row">
              <span className="ops-recent-summary">기준선 이후 추가 {baselineDiff.added.length}건</span>
            </div>
          )}
        </section>
      </div>

      <div className="ops-board-footer">표시 중인 작업 {filteredItems.length}건</div>
    </section>
  );
}

function WorkItemCard({ state, item, selected, onSelect }: { state: any; item: any; selected: boolean; onSelect: () => void }) {
  const project = state.projects.find((entry: any) => entry.id === item.projectId);
  const owner = state.people.find((entry: any) => entry.id === item.ownerId);

  return (
    <button className={`ops-work-card ${selected ? "is-selected" : ""}`} type="button" onClick={onSelect}>
      <span className={`ops-priority ops-priority-${priorityClass(item.priority)}`}>
        {PRIORITY_LABELS_KO[item.priority as keyof typeof PRIORITY_LABELS_KO] ?? item.priority}
      </span>
      <strong>{item.title}</strong>
      <span className="ops-work-meta">
        <span style={{ "--project-color": project?.color ?? "#0e7490" } as CSSProperties}>{project?.code ?? "?"}</span>
        <span>{item.dueDate ? formatDateKo(item.dueDate) : "마감 없음"}</span>
        {item.nextAction && <span>{item.nextAction}</span>}
      </span>
      <span className="ops-work-owner">
        <Avatar person={owner} />
        <span>{owner?.name ?? "담당 없음"}</span>
      </span>
    </button>
  );
}

function DetailPanel({
  state,
  item,
  actor,
  runMutation,
  onClose
}: {
  state: any;
  item: any;
  actor: string;
  runMutation: (result: { state: any; error?: string }, successNote?: string) => boolean;
  onClose: () => void;
}) {
  const [pendingStatus, setPendingStatus] = useState<string>(item.status);
  const [pendingReason, setPendingReason] = useState("");
  const [nextActionDraft, setNextActionDraft] = useState(item.nextAction ?? "");
  const [commentDraft, setCommentDraft] = useState("");

  const owner = state.people.find((entry: any) => entry.id === item.ownerId);
  const project = state.projects.find((entry: any) => entry.id === item.projectId);
  const reasonField = requiredNoteField(pendingStatus);
  const reasonRequired = reasonField !== null && pendingStatus !== item.status;
  const applyDisabled = pendingStatus === item.status || (reasonRequired && !pendingReason.trim());
  const itemEvents = (state.audit as any[]).filter((event) => event.itemId === item.id).slice(0, 8);

  function applyStatus() {
    const patch: Record<string, string> = { status: pendingStatus };
    if (reasonField) {
      patch[reasonField] = pendingReason.trim() || item[reasonField] || "";
    }
    const ok = runMutation(
      updateItem(state, { at: nowIso(), actor, itemId: item.id, patch, note: pendingReason.trim() || "" }),
      "상태를 변경했습니다."
    );
    if (ok) {
      setPendingReason("");
    }
  }

  function applyField(field: string, value: string | null) {
    runMutation(updateItem(state, { at: nowIso(), actor, itemId: item.id, patch: { [field]: value } }));
  }

  function saveNextAction() {
    runMutation(
      updateItem(state, { at: nowIso(), actor, itemId: item.id, patch: { nextAction: nextActionDraft.trim() } }),
      "다음 행동을 저장했습니다."
    );
  }

  function submitComment() {
    const ok = runMutation(addComment(state, { at: nowIso(), actor, itemId: item.id, message: commentDraft }));
    if (ok) {
      setCommentDraft("");
    }
  }

  return (
    <aside className="ops-detail" aria-label="선택한 작업 상세">
      <div className="ops-detail-heading">
        <span className={`ops-priority ops-priority-${priorityClass(item.priority)}`}>
          {PRIORITY_LABELS_KO[item.priority as keyof typeof PRIORITY_LABELS_KO] ?? item.priority}
        </span>
        <h3>{item.title}</h3>
        <StatusBadge status={item.status} />
        <button className="ops-icon-button" type="button" onClick={onClose} aria-label="상세 닫기" title="닫기">
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <dl className="ops-detail-grid">
        <div>
          <dt>프로젝트</dt>
          <dd>{project?.name ?? "-"}</dd>
        </div>
        <div>
          <dt>마감</dt>
          <dd>{item.dueDate ? formatDateKo(item.dueDate) : "없음"}</dd>
        </div>
        <div>
          <dt>담당</dt>
          <dd>{owner?.name ?? "담당 없음"}</dd>
        </div>
        <div>
          <dt>최근 갱신</dt>
          <dd>
            {item.lastUpdate ? `${formatTimeKo(item.lastUpdate.at)} · ${item.lastUpdate.by}` : "-"}
          </dd>
        </div>
      </dl>

      {item.status === "blocked" && item.blockerReason && (
        <div className="ops-status-note">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>차단 사유: {item.blockerReason}</span>
        </div>
      )}
      {item.status === "waiting" && item.waitingOn && (
        <div className="ops-status-note">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>대기 대상: {item.waitingOn}</span>
        </div>
      )}

      <div className="ops-field-group">
        <label>
          담당자
          <select value={item.ownerId ?? "none"} onChange={(event) => applyField("ownerId", event.target.value === "none" ? null : event.target.value)}>
            <option value="none">담당 없음</option>
            {state.people.map((person: any) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          마감일
          <input type="date" value={item.dueDate ?? ""} onChange={(event) => applyField("dueDate", event.target.value)} />
        </label>

        <label>
          우선순위
          <select value={item.priority} onChange={(event) => applyField("priority", event.target.value)}>
            {PRIORITIES.map((priority: string) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS_KO[priority as keyof typeof PRIORITY_LABELS_KO]}
              </option>
            ))}
          </select>
        </label>

        <label>
          상태
          <select value={pendingStatus} onChange={(event) => setPendingStatus(event.target.value)}>
            {STATUSES.map((status: string) => (
              <option key={status} value={status}>
                {STATUS_LABELS_KO[status as keyof typeof STATUS_LABELS_KO]}
              </option>
            ))}
          </select>
        </label>

        {reasonRequired && (
          <label>
            {reasonField === "blockerReason" ? "차단 사유 (필수)" : "대기 대상 (필수)"}
            <textarea value={pendingReason} onChange={(event) => setPendingReason(event.target.value)} rows={3} />
          </label>
        )}

        <button className="ops-button ops-button-primary" type="button" disabled={applyDisabled} onClick={applyStatus}>
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>상태 적용</span>
        </button>

        <label>
          다음 행동
          <input value={nextActionDraft} onChange={(event) => setNextActionDraft(event.target.value)} placeholder="한 문장으로" />
        </label>
        <button className="ops-button" type="button" disabled={nextActionDraft.trim() === (item.nextAction ?? "")} onClick={saveNextAction}>
          다음 행동 저장
        </button>
      </div>

      <div className="ops-comments">
        <h4>
          <MessageSquare size={16} aria-hidden="true" />
          메모
        </h4>
        <div className="ops-comment-list">
          {item.comments.map((comment: any, index: number) => (
            <div className="ops-comment" key={`${comment.author}-${comment.at}-${index}`}>
              <strong>{comment.author}</strong>
              <span>{formatTimeKo(comment.at)}</span>
              <p>{comment.message}</p>
            </div>
          ))}
          {item.comments.length === 0 && <div className="ops-empty-line">메모 없음</div>}
        </div>
        <div className="ops-comment-box">
          <textarea value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} rows={3} />
          <button className="ops-button" type="button" disabled={!commentDraft.trim()} onClick={submitComment}>
            <MessageSquare size={16} aria-hidden="true" />
            <span>메모 추가</span>
          </button>
        </div>
      </div>

      <div className="ops-comments">
        <h4>
          <History size={16} aria-hidden="true" />
          변경 이력
        </h4>
        <div className="ops-comment-list">
          {itemEvents.map((event: any) => (
            <div className="ops-comment" key={event.id}>
              <strong>{event.actor}</strong>
              <span>{formatTimeKo(event.at)}</span>
              <p>
                {event.summary}
                {event.field && (
                  <>
                    {" "}
                    ({String(event.from || "없음")} → {String(event.to || "없음")})
                  </>
                )}
              </p>
            </div>
          ))}
          {itemEvents.length === 0 && <div className="ops-empty-line">기록 없음</div>}
        </div>
      </div>
    </aside>
  );
}

function ProjectsView({ state, onSelectItem }: { state: any; onSelectItem: (item: any) => void }) {
  return (
    <section className="ops-view-panel">
      <div className="ops-section-header">
        <h3>프로젝트 현황</h3>
        <span>{state.projects.length}개 진행 중</span>
      </div>
      <div className="ops-project-grid">
        {state.projects.map((project: any) => {
          const projectItems = (state.items as any[]).filter((item) => item.projectId === project.id);
          const blocked = projectItems.filter((item) => item.status === "blocked").length;
          const open = projectItems.filter((item) => item.status !== "done").length;

          return (
            <section className="ops-project-card" key={project.id}>
              <header>
                <span style={{ background: project.color }} aria-hidden="true" />
                <div>
                  <h4>{project.name}</h4>
                  <p>{project.currentGoal || "목표 미입력"}</p>
                </div>
                <span className={`ops-health ops-health-${project.health}`}>
                  {HEALTH_LABELS_KO[project.health as keyof typeof HEALTH_LABELS_KO] ?? project.health}
                </span>
              </header>
              <div className="ops-project-stats">
                <span>미완료 {open}</span>
                <span>차단 {blocked}</span>
                <span>다음 관문: {project.nextGate || "-"}</span>
                <span>목표일: {project.targetDate ? formatDateKo(project.targetDate) : "-"}</span>
              </div>
              <div className="ops-table-list">
                {projectItems.slice(0, 5).map((item) => (
                  <button key={item.id} type="button" onClick={() => onSelectItem(item)}>
                    <span>{item.title}</span>
                    <StatusBadge status={item.status} />
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function ScheduleView({ state, onSelectItem }: { state: any; onSelectItem: (item: any) => void }) {
  const items = state.items as any[];
  const dated = items.filter((item) => item.dueDate);
  const undated = items.filter((item) => !item.dueDate);
  const days = groupBy(dated, (item: any) => item.dueDate).sort(([left], [right]) => left.localeCompare(right));

  return (
    <section className="ops-view-panel">
      <div className="ops-section-header">
        <h3>일정</h3>
        <span>계획된 작업 {items.length}건</span>
      </div>
      <div className="ops-schedule-list">
        {days.map(([day, dayItems]) => (
          <section className="ops-schedule-day" key={day}>
            <header>
              <CalendarDays size={18} aria-hidden="true" />
              <h4>{formatDateKo(day)}</h4>
              <span>{dayItems.length}</span>
            </header>
            {dayItems.map((item: any) => (
              <button key={item.id} type="button" onClick={() => onSelectItem(item)}>
                <span>{item.title}</span>
                <span>{state.projects.find((entry: any) => entry.id === item.projectId)?.code ?? "?"}</span>
                <StatusBadge status={item.status} />
              </button>
            ))}
          </section>
        ))}
        {undated.length > 0 && (
          <section className="ops-schedule-day">
            <header>
              <CalendarDays size={18} aria-hidden="true" />
              <h4>마감 미정</h4>
              <span>{undated.length}</span>
            </header>
            {undated.map((item: any) => (
              <button key={item.id} type="button" onClick={() => onSelectItem(item)}>
                <span>{item.title}</span>
                <span>{state.projects.find((entry: any) => entry.id === item.projectId)?.code ?? "?"}</span>
                <StatusBadge status={item.status} />
              </button>
            ))}
          </section>
        )}
      </div>
    </section>
  );
}

function PeopleView({ state, today, onSelectItem }: { state: any; today: string; onSelectItem: (item: any) => void }) {
  return (
    <section className="ops-view-panel">
      <div className="ops-section-header">
        <h3>팀원</h3>
        <span>{state.people.length}명</span>
      </div>
      <div className="ops-people-table">
        {state.people.map((person: any) => {
          const personItems = (state.items as any[]).filter((item) => item.ownerId === person.id);
          const blocked = personItems.filter((item) => item.status === "blocked").length;
          const dueToday = personItems.filter((item) => item.dueDate === today && item.status !== "done").length;
          const open = personItems.filter((item) => item.status !== "done");

          return (
            <section className="ops-person-row" key={person.id}>
              <Avatar person={person} />
              <div>
                <h4>{person.name}</h4>
                <p>{person.role || "-"}</p>
              </div>
              <strong>미완료 {open.length}</strong>
              <span>오늘 {dueToday}</span>
              <span>차단 {blocked}</span>
              <button type="button" onClick={() => open[0] && onSelectItem(open[0])} disabled={!open[0]}>
                보기
              </button>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function SettingsView({
  state,
  actor,
  runMutation,
  setState,
  setNotice
}: {
  state: any;
  actor: string;
  runMutation: (result: { state: any; error?: string }, successNote?: string) => boolean;
  setState: (state: any) => void;
  setNotice: (notice: string | null) => void;
}) {
  const [projectForm, setProjectForm] = useState({ name: "", code: "", health: "ok", currentGoal: "", nextGate: "", targetDate: "" });
  const [personForm, setPersonForm] = useState({ name: "", role: "" });
  const [importReport, setImportReport] = useState<string | null>(null);

  function downloadCsv() {
    downloadFile(`team-ops-items-${todayKey()}.csv`, exportItemsCsv(state), "text/csv;charset=utf-8");
    setNotice("CSV 파일을 내려받았습니다.");
  }

  function downloadBackup() {
    downloadFile(`team-ops-backup-${todayKey()}.json`, makeBackup(state, { at: nowIso(), actor }), "application/json");
    setNotice("백업 파일을 내려받았습니다.");
  }

  async function handleCsvImport(file: File) {
    const raw = await file.text();
    const result = importItemsCsv(state, { raw, at: nowIso(), actor });
    setState(result.state);
    const errorLines = result.errors.map((entry: any) => `${entry.line}행: ${errorMessage(entry.error)}${entry.value ? ` (${entry.value})` : ""}`);
    setImportReport(
      [`가져오기 완료 - 추가 ${result.imported}건, 갱신 ${result.updated}건, 오류 ${result.errors.length}건`, ...errorLines].join("\n")
    );
  }

  async function handleRestore(file: File) {
    const raw = await file.text();
    const ok = runMutation(restoreBackup(state, { at: nowIso(), actor, raw }), "백업을 복원했습니다.");
    if (!ok) {
      setImportReport("백업 복원에 실패했습니다. 파일을 확인해 주세요.");
    }
  }

  function resetToSeed() {
    if (window.confirm("모든 데이터를 지우고 표본 데이터로 초기화할까요? 먼저 백업을 내려받는 것을 권장합니다.")) {
      setState(buildSeedState());
      setNotice("표본 데이터로 초기화했습니다.");
    }
  }

  function submitProject() {
    const ok = runMutation(upsertProject(state, { at: nowIso(), actor, project: projectForm }), "프로젝트를 추가했습니다.");
    if (ok) {
      setProjectForm({ name: "", code: "", health: "ok", currentGoal: "", nextGate: "", targetDate: "" });
    }
  }

  function submitPerson() {
    const ok = runMutation(upsertPerson(state, { at: nowIso(), actor, person: personForm }), "팀원을 추가했습니다.");
    if (ok) {
      setPersonForm({ name: "", role: "" });
    }
  }

  return (
    <section className="ops-view-panel">
      <div className="ops-section-header">
        <h3>설정</h3>
        <span>보드 v1 (로컬 저장)</span>
      </div>

      <div className="ops-settings-stack">
        <section className="ops-settings-card">
          <h4>데이터 관리</h4>
          <p className="ops-settings-hint">
            이 보드는 이 브라우저에만 저장됩니다. 공식 프로젝트 장부(Smartsheet)와는 주간 CSV 내보내기로 대조하고,
            중요한 시점마다 백업 파일을 내려받아 두세요.
          </p>
          <div className="ops-settings-actions">
            <button className="ops-button" type="button" onClick={downloadCsv}>
              <Download size={16} aria-hidden="true" />
              <span>CSV 내보내기</span>
            </button>
            <label className="ops-button ops-file-button">
              <Upload size={16} aria-hidden="true" />
              <span>CSV 가져오기</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleCsvImport(file);
                  }
                  event.target.value = "";
                }}
              />
            </label>
            <button className="ops-button" type="button" onClick={downloadBackup}>
              <Download size={16} aria-hidden="true" />
              <span>백업(JSON) 내려받기</span>
            </button>
            <label className="ops-button ops-file-button">
              <Upload size={16} aria-hidden="true" />
              <span>백업 복원</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleRestore(file);
                  }
                  event.target.value = "";
                }}
              />
            </label>
            <button className="ops-button" type="button" onClick={resetToSeed}>
              표본 데이터로 초기화
            </button>
          </div>
          {importReport && <pre className="ops-import-report">{importReport}</pre>}
        </section>

        <section className="ops-settings-card">
          <h4>프로젝트 관리</h4>
          <div className="ops-manage-list">
            {state.projects.map((project: any) => (
              <div className="ops-manage-row" key={project.id}>
                <span className="ops-manage-name">{project.name}</span>
                <select
                  value={project.health}
                  onChange={(event) =>
                    runMutation(
                      upsertProject(state, { at: nowIso(), actor, project: { ...project, health: event.target.value } })
                    )
                  }
                >
                  {PROJECT_HEALTH.map((health: string) => (
                    <option key={health} value={health}>
                      {HEALTH_LABELS_KO[health as keyof typeof HEALTH_LABELS_KO]}
                    </option>
                  ))}
                </select>
                <input
                  value={project.nextGate}
                  placeholder="다음 관문"
                  onChange={(event) =>
                    runMutation(
                      upsertProject(state, { at: nowIso(), actor, project: { ...project, nextGate: event.target.value } })
                    )
                  }
                />
              </div>
            ))}
          </div>
          <div className="ops-manage-form">
            <input
              value={projectForm.name}
              placeholder="새 프로젝트 이름"
              onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })}
            />
            <input
              value={projectForm.code}
              placeholder="코드 (예: GTW)"
              onChange={(event) => setProjectForm({ ...projectForm, code: event.target.value })}
            />
            <button className="ops-button" type="button" disabled={!projectForm.name.trim()} onClick={submitProject}>
              <Plus size={16} aria-hidden="true" />
              <span>프로젝트 추가</span>
            </button>
          </div>
        </section>

        <section className="ops-settings-card">
          <h4>팀원 관리</h4>
          <div className="ops-manage-list">
            {state.people.map((person: any) => (
              <div className="ops-manage-row" key={person.id}>
                <span className="ops-manage-name">{person.name}</span>
                <input
                  value={person.role}
                  placeholder="역할"
                  onChange={(event) =>
                    runMutation(upsertPerson(state, { at: nowIso(), actor, person: { ...person, role: event.target.value } }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="ops-manage-form">
            <input
              value={personForm.name}
              placeholder="새 팀원 이름"
              onChange={(event) => setPersonForm({ ...personForm, name: event.target.value })}
            />
            <input
              value={personForm.role}
              placeholder="역할"
              onChange={(event) => setPersonForm({ ...personForm, role: event.target.value })}
            />
            <button className="ops-button" type="button" disabled={!personForm.name.trim()} onClick={submitPerson}>
              <Plus size={16} aria-hidden="true" />
              <span>팀원 추가</span>
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}

function AddItemModal({
  state,
  today,
  onClose,
  onCreate
}: {
  state: any;
  today: string;
  onClose: () => void;
  onCreate: (form: NewItemForm) => void;
}) {
  const [form, setForm] = useState<NewItemForm>({
    title: "",
    projectId: state.projects[0]?.id ?? "",
    ownerId: state.people[0]?.id ?? "none",
    status: "todo",
    priority: "normal",
    dueDate: today,
    nextAction: "",
    blockerReason: "",
    waitingOn: ""
  });

  const reasonField = requiredNoteField(form.status);
  const createDisabled =
    !form.title.trim() || (reasonField === "blockerReason" && !form.blockerReason.trim()) || (reasonField === "waitingOn" && !form.waitingOn.trim());

  return (
    <div className="ops-modal-backdrop" role="presentation">
      <section className="ops-modal" role="dialog" aria-modal="true" aria-label="작업 항목 추가">
        <header>
          <h3>작업 항목 추가</h3>
          <button className="ops-icon-button" type="button" onClick={onClose} aria-label="추가 닫기" title="닫기">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <label>
          제목
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </label>
        <div className="ops-form-grid">
          <label>
            프로젝트
            <select value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}>
              {state.projects.map((project: any) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            담당자
            <select value={form.ownerId} onChange={(event) => setForm({ ...form, ownerId: event.target.value })}>
              <option value="none">담당 없음</option>
              {state.people.map((person: any) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            상태
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              {STATUSES.map((status: string) => (
                <option key={status} value={status}>
                  {STATUS_LABELS_KO[status as keyof typeof STATUS_LABELS_KO]}
                </option>
              ))}
            </select>
          </label>
          <label>
            우선순위
            <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
              {PRIORITIES.map((priority: string) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS_KO[priority as keyof typeof PRIORITY_LABELS_KO]}
                </option>
              ))}
            </select>
          </label>
          <label>
            마감일
            <input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
          </label>
          <label>
            다음 행동
            <input value={form.nextAction} onChange={(event) => setForm({ ...form, nextAction: event.target.value })} placeholder="한 문장으로" />
          </label>
        </div>
        {reasonField === "blockerReason" && (
          <label>
            차단 사유 (필수)
            <textarea value={form.blockerReason} onChange={(event) => setForm({ ...form, blockerReason: event.target.value })} rows={2} />
          </label>
        )}
        {reasonField === "waitingOn" && (
          <label>
            대기 대상 (필수)
            <textarea value={form.waitingOn} onChange={(event) => setForm({ ...form, waitingOn: event.target.value })} rows={2} />
          </label>
        )}
        <footer>
          <button className="ops-button" type="button" onClick={onClose}>
            취소
          </button>
          <button className="ops-button ops-button-primary" type="button" disabled={createDisabled} onClick={() => onCreate(form)}>
            <Plus size={16} aria-hidden="true" />
            <span>추가</span>
          </button>
        </footer>
      </section>
    </div>
  );
}

function ExportModal({
  state,
  today,
  weekEnd,
  onClose
}: {
  state: any;
  today: string;
  weekEnd: string;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<"text" | "csv">("text");
  const summary = useMemo(() => buildWeeklySummaryKo(state, today, weekEnd), [state, today, weekEnd]);
  const content = format === "text" ? summary.text : summary.csv;

  return (
    <div className="ops-modal-backdrop" role="presentation">
      <section className="ops-modal ops-export-modal" role="dialog" aria-modal="true" aria-label="주간 요약 내보내기">
        <header>
          <h3>주간 요약 내보내기</h3>
          <button className="ops-icon-button" type="button" onClick={onClose} aria-label="내보내기 닫기" title="닫기">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="ops-segmented" aria-label="내보내기 형식">
          <button className={format === "text" ? "is-selected" : ""} type="button" onClick={() => setFormat("text")}>
            <FileText size={16} aria-hidden="true" />
            텍스트
          </button>
          <button className={format === "csv" ? "is-selected" : ""} type="button" onClick={() => setFormat("csv")}>
            <FileText size={16} aria-hidden="true" />
            CSV
          </button>
        </div>
        <textarea readOnly value={content} rows={14} />
        <footer>
          <button
            className="ops-button"
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(content);
            }}
          >
            클립보드 복사
          </button>
          <button
            className="ops-button ops-button-primary"
            type="button"
            onClick={() =>
              downloadFile(
                `team-ops-weekly-${today}.${format === "text" ? "txt" : "csv"}`,
                format === "csv" ? "﻿" + content : content,
                format === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8"
              )
            }
          >
            <Download size={16} aria-hidden="true" />
            <span>파일로 내려받기</span>
          </button>
        </footer>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`ops-status ops-status-${statusClass(status)}`}>{statusLabel(status)}</span>;
}

function Avatar({ person }: { person: any | null | undefined }) {
  if (!person) {
    return (
      <span className="ops-avatar ops-avatar-empty">
        <UserCircle size={18} aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className="ops-avatar" style={{ "--avatar-color": person.color } as CSSProperties}>
      {String(person.name).slice(0, 2)}
    </span>
  );
}

function statusClass(status: string) {
  return {
    todo: "queued",
    doing: "in_progress",
    waiting: "waiting",
    blocked: "blocked",
    done: "done"
  }[status] ?? "queued";
}

function priorityClass(priority: string) {
  return { high: "p0", normal: "p1", low: "p2" }[priority] ?? "p1";
}

function viewTitle(view: ViewId) {
  return {
    board: "보드",
    projects: "프로젝트",
    schedule: "일정",
    people: "팀원",
    settings: "설정"
  }[view];
}

function formatDateKo(dateKeyValue: string) {
  const [year, month, day] = dateKeyValue.split("-").map(Number);
  if (!year || !month || !day) {
    return dateKeyValue;
  }
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" }).format(
    new Date(year, month - 1, day)
  );
}

function formatTimeKo(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return Array.from(map.entries());
}

function buildWeeklySummaryKo(state: any, today: string, weekEnd: string) {
  const items = state.items as any[];
  const weekItems = items.filter((item) => !item.dueDate || (item.dueDate >= today && item.dueDate <= weekEnd) || item.status !== "done");
  const blocked = weekItems.filter((item) => item.status === "blocked");
  const waiting = weekItems.filter((item) => item.status === "waiting");
  const noOwner = weekItems.filter((item) => !item.ownerId);
  const done = items.filter((item) => item.status === "done");
  const open = weekItems.filter((item) => item.status !== "done");
  const projectName = (projectId: string) => state.projects.find((entry: any) => entry.id === projectId)?.name ?? "-";
  const personName = (ownerId: string | null) => state.people.find((entry: any) => entry.id === ownerId)?.name ?? "담당 없음";

  const text = [
    "팀 운영 보드 주간 요약",
    `기간: ${formatDateKo(today)} ~ ${formatDateKo(weekEnd)}`,
    `미완료: ${open.length}건 / 완료: ${done.length}건 / 차단: ${blocked.length}건 / 대기: ${waiting.length}건 / 담당 없음: ${noOwner.length}건`,
    "",
    "차단 항목:",
    ...(blocked.length > 0
      ? blocked.map((item) => `- ${item.title} (${projectName(item.projectId)}) · ${item.blockerReason || "사유 미입력"}`)
      : ["- 없음"]),
    "",
    "대기 항목:",
    ...(waiting.length > 0
      ? waiting.map((item) => `- ${item.title} (${projectName(item.projectId)}) · 대기 대상: ${item.waitingOn || "미입력"}`)
      : ["- 없음"]),
    "",
    "담당 없는 항목:",
    ...(noOwner.length > 0 ? noOwner.map((item) => `- ${item.title} (${projectName(item.projectId)})`) : ["- 없음"])
  ].join("\n");

  const csvRows = [
    ["id", "title", "project", "owner", "status", "priority", "due_date", "next_action"],
    ...weekItems.map((item) => [
      item.id,
      item.title,
      projectName(item.projectId),
      personName(item.ownerId),
      statusLabel(item.status),
      PRIORITY_LABELS_KO[item.priority as keyof typeof PRIORITY_LABELS_KO] ?? item.priority,
      item.dueDate ?? "",
      item.nextAction ?? ""
    ])
  ];

  return {
    text,
    csv: csvRows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n")
  };
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default App;
