import { useMemo, useState } from "react";
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
  ListChecks,
  MessageSquare,
  Plus,
  Search,
  Settings,
  UserCircle,
  Users,
  X
} from "lucide-react";

type ViewId = "board" | "projects" | "schedule" | "people" | "settings";
type RangeFilter = "today" | "week";
type Status = "queued" | "in_progress" | "blocked" | "waiting" | "done";
type Priority = "P0" | "P1" | "P2";
type BucketId = "today" | "blocked" | "due_soon" | "waiting" | "done" | "no_owner";

interface Project {
  id: string;
  name: string;
  code: string;
  color: string;
  stage: string;
}

interface Person {
  id: string;
  name: string;
  role: string;
  color: string;
}

interface Comment {
  author: string;
  message: string;
  at: string;
}

interface WorkItem {
  id: string;
  title: string;
  projectId: string;
  ownerId: string | null;
  status: Status;
  priority: Priority;
  dueDate: string;
  estimate: string;
  statusNote?: string;
  comments: Comment[];
}

interface NewItemForm {
  title: string;
  projectId: string;
  ownerId: string;
  status: Status;
  priority: Priority;
  dueDate: string;
}

const TODAY_KEY = "2026-06-04";
const WEEK_END_KEY = "2026-06-10";

const projects: Project[] = [
  { id: "p-gateway", name: "Gateway Intake", code: "GTW", color: "#0e7490", stage: "Daily flow" },
  { id: "p-knowledge", name: "Knowledge Ops", code: "KOP", color: "#7c3aed", stage: "Review pass" },
  { id: "p-ui", name: "UI Workspace", code: "UIW", color: "#d97706", stage: "Mockup build" }
];

const people: Person[] = [
  { id: "u-jina", name: "Jina Park", role: "Operations lead", color: "#0f766e" },
  { id: "u-marco", name: "Marco Lee", role: "Project coordinator", color: "#2563eb" },
  { id: "u-ilya", name: "Ilya Kim", role: "Workflow owner", color: "#9333ea" },
  { id: "u-hana", name: "Hana Cho", role: "QA reviewer", color: "#ca8a04" },
  { id: "u-owen", name: "Owen Han", role: "Data steward", color: "#c2410c" },
  { id: "u-priya", name: "Priya Nair", role: "Delivery manager", color: "#15803d" }
];

const initialItems: WorkItem[] = [
  {
    id: "wi-001",
    title: "Confirm today intake owner map",
    projectId: "p-gateway",
    ownerId: "u-jina",
    status: "in_progress",
    priority: "P0",
    dueDate: "2026-06-04",
    estimate: "35m",
    comments: [{ author: "Marco Lee", message: "Owner split is ready for review.", at: "08:42" }]
  },
  {
    id: "wi-002",
    title: "Draft handoff note for source packet review",
    projectId: "p-knowledge",
    ownerId: "u-ilya",
    status: "queued",
    priority: "P1",
    dueDate: "2026-06-04",
    estimate: "45m",
    comments: []
  },
  {
    id: "wi-003",
    title: "Check build output for new board shell",
    projectId: "p-ui",
    ownerId: "u-hana",
    status: "queued",
    priority: "P1",
    dueDate: "2026-06-04",
    estimate: "25m",
    comments: []
  },
  {
    id: "wi-004",
    title: "Resolve stale blocker labels",
    projectId: "p-gateway",
    ownerId: "u-marco",
    status: "blocked",
    priority: "P0",
    dueDate: "2026-06-04",
    estimate: "20m",
    statusNote: "Waiting for owner to confirm whether two labels are obsolete.",
    comments: [{ author: "Jina Park", message: "Hold until owner confirms the rename scope.", at: "09:11" }]
  },
  {
    id: "wi-005",
    title: "Verify weekly review slate",
    projectId: "p-knowledge",
    ownerId: "u-priya",
    status: "waiting",
    priority: "P1",
    dueDate: "2026-06-05",
    estimate: "30m",
    statusNote: "Waiting for final reviewer availability.",
    comments: []
  },
  {
    id: "wi-006",
    title: "Collect acceptance screenshots",
    projectId: "p-ui",
    ownerId: "u-hana",
    status: "in_progress",
    priority: "P1",
    dueDate: "2026-06-05",
    estimate: "40m",
    comments: [{ author: "Hana Cho", message: "Desktop pass is first; mobile follows.", at: "10:06" }]
  },
  {
    id: "wi-007",
    title: "Assign no-owner intake items",
    projectId: "p-gateway",
    ownerId: null,
    status: "queued",
    priority: "P0",
    dueDate: "2026-06-05",
    estimate: "15m",
    comments: []
  },
  {
    id: "wi-008",
    title: "Normalize candidate queue labels",
    projectId: "p-knowledge",
    ownerId: "u-owen",
    status: "queued",
    priority: "P2",
    dueDate: "2026-06-06",
    estimate: "50m",
    comments: []
  },
  {
    id: "wi-009",
    title: "Review low-risk mock data set",
    projectId: "p-ui",
    ownerId: "u-priya",
    status: "done",
    priority: "P2",
    dueDate: "2026-06-04",
    estimate: "20m",
    comments: [{ author: "Priya Nair", message: "Sample rows are safe to use.", at: "08:15" }]
  },
  {
    id: "wi-010",
    title: "Prepare Friday status digest",
    projectId: "p-gateway",
    ownerId: "u-jina",
    status: "queued",
    priority: "P1",
    dueDate: "2026-06-06",
    estimate: "45m",
    comments: []
  },
  {
    id: "wi-011",
    title: "Confirm manual review gate wording",
    projectId: "p-knowledge",
    ownerId: "u-ilya",
    status: "blocked",
    priority: "P1",
    dueDate: "2026-06-06",
    estimate: "30m",
    statusNote: "Needs owner wording before publishing the checklist.",
    comments: []
  },
  {
    id: "wi-012",
    title: "Tighten mobile board columns",
    projectId: "p-ui",
    ownerId: "u-hana",
    status: "queued",
    priority: "P1",
    dueDate: "2026-06-06",
    estimate: "35m",
    comments: []
  },
  {
    id: "wi-013",
    title: "Update operator handoff index",
    projectId: "p-knowledge",
    ownerId: "u-owen",
    status: "waiting",
    priority: "P0",
    dueDate: "2026-06-07",
    estimate: "30m",
    statusNote: "Waiting for last usage record to be attached.",
    comments: [{ author: "Owen Han", message: "Index skeleton is ready.", at: "11:25" }]
  },
  {
    id: "wi-014",
    title: "Review sample weekly CSV",
    projectId: "p-ui",
    ownerId: "u-marco",
    status: "queued",
    priority: "P2",
    dueDate: "2026-06-07",
    estimate: "20m",
    comments: []
  },
  {
    id: "wi-015",
    title: "Close completed intake receipts",
    projectId: "p-gateway",
    ownerId: "u-priya",
    status: "done",
    priority: "P2",
    dueDate: "2026-06-04",
    estimate: "25m",
    comments: []
  },
  {
    id: "wi-016",
    title: "Match board labels to review packet",
    projectId: "p-ui",
    ownerId: null,
    status: "queued",
    priority: "P1",
    dueDate: "2026-06-08",
    estimate: "30m",
    comments: []
  },
  {
    id: "wi-017",
    title: "Schedule source packet dry run",
    projectId: "p-knowledge",
    ownerId: "u-jina",
    status: "queued",
    priority: "P1",
    dueDate: "2026-06-09",
    estimate: "35m",
    comments: []
  },
  {
    id: "wi-018",
    title: "Check people workload balance",
    projectId: "p-gateway",
    ownerId: "u-marco",
    status: "in_progress",
    priority: "P2",
    dueDate: "2026-06-09",
    estimate: "25m",
    comments: []
  },
  {
    id: "wi-019",
    title: "Confirm board settings placeholder",
    projectId: "p-ui",
    ownerId: "u-hana",
    status: "queued",
    priority: "P2",
    dueDate: "2026-06-10",
    estimate: "15m",
    comments: []
  },
  {
    id: "wi-020",
    title: "Export weekly owner summary",
    projectId: "p-gateway",
    ownerId: "u-priya",
    status: "queued",
    priority: "P1",
    dueDate: "2026-06-10",
    estimate: "35m",
    comments: []
  }
];

const navItems: Array<{ id: ViewId; label: string; Icon: typeof Columns3 }> = [
  { id: "board", label: "Board", Icon: Columns3 },
  { id: "projects", label: "Projects", Icon: ClipboardList },
  { id: "schedule", label: "Schedule", Icon: CalendarDays },
  { id: "people", label: "People", Icon: Users },
  { id: "settings", label: "Settings", Icon: Settings }
];

const bucketMeta: Array<{ id: BucketId; label: string; tone: string }> = [
  { id: "today", label: "Today", tone: "blue" },
  { id: "blocked", label: "Blocked", tone: "red" },
  { id: "due_soon", label: "Due soon", tone: "amber" },
  { id: "waiting", label: "Waiting", tone: "purple" },
  { id: "done", label: "Done", tone: "green" },
  { id: "no_owner", label: "No owner", tone: "slate" }
];

const emptyForm: NewItemForm = {
  title: "",
  projectId: projects[0].id,
  ownerId: people[0].id,
  status: "queued",
  priority: "P1",
  dueDate: TODAY_KEY
};

function App() {
  const [items, setItems] = useState<WorkItem[]>(initialItems);
  const [activeView, setActiveView] = useState<ViewId>("board");
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>("today");
  const [projectFilter, setProjectFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(initialItems[0].id);
  const [pendingStatus, setPendingStatus] = useState<Status>(initialItems[0].status);
  const [pendingStatusNote, setPendingStatusNote] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"text" | "csv">("text");
  const [newItem, setNewItem] = useState<NewItemForm>(emptyForm);
  const [settingsState, setSettingsState] = useState({
    requireBlockedNote: true,
    requireWaitingNote: true,
    compactRows: true,
    weeklyDigest: true
  });

  const selectedItem = items.find((item) => item.id === selectedId) ?? items[0];
  const filteredItems = useMemo(
    () => applyFilters(items, rangeFilter, projectFilter, query),
    [items, projectFilter, query, rangeFilter]
  );

  const buckets = useMemo(() => {
    const groups: Record<BucketId, WorkItem[]> = {
      today: [],
      blocked: [],
      due_soon: [],
      waiting: [],
      done: [],
      no_owner: []
    };

    for (const item of filteredItems) {
      groups[bucketForItem(item)].push(item);
    }

    return groups;
  }, [filteredItems]);

  const weeklySummary = useMemo(() => buildWeeklySummary(items), [items]);

  function selectItem(item: WorkItem) {
    setSelectedId(item.id);
    setPendingStatus(item.status);
    setPendingStatusNote("");
    setCommentDraft("");
  }

  function createItem() {
    const title = newItem.title.trim();
    if (!title) {
      return;
    }

    const item: WorkItem = {
      id: `wi-${String(items.length + 1).padStart(3, "0")}`,
      title,
      projectId: newItem.projectId,
      ownerId: newItem.ownerId === "none" ? null : newItem.ownerId,
      status: newItem.status,
      priority: newItem.priority,
      dueDate: newItem.dueDate,
      estimate: "30m",
      comments: []
    };

    setItems((current) => [item, ...current]);
    setSelectedId(item.id);
    setPendingStatus(item.status);
    setPendingStatusNote("");
    setNewItem(emptyForm);
    setAddOpen(false);
  }

  function updateOwner(ownerId: string) {
    if (!selectedItem) {
      return;
    }

    setItems((current) =>
      current.map((item) => (item.id === selectedItem.id ? { ...item, ownerId: ownerId === "none" ? null : ownerId } : item))
    );
  }

  function applyStatusChange() {
    if (!selectedItem || pendingStatus === selectedItem.status) {
      return;
    }

    const note = pendingStatusNote.trim();
    if (statusNeedsNote(pendingStatus) && !note) {
      return;
    }

    setItems((current) =>
      current.map((item) => {
        if (item.id !== selectedItem.id) {
          return item;
        }

        return {
          ...item,
          status: pendingStatus,
          statusNote: statusNeedsNote(pendingStatus) ? note : undefined,
          comments: note
            ? [
                ...item.comments,
                {
                  author: "Board operator",
                  message: note,
                  at: "now"
                }
              ]
            : item.comments
        };
      })
    );

    setPendingStatusNote("");
  }

  function addComment() {
    const message = commentDraft.trim();
    if (!selectedItem || !message) {
      return;
    }

    setItems((current) =>
      current.map((item) =>
        item.id === selectedItem.id
          ? {
              ...item,
              comments: [
                ...item.comments,
                {
                  author: "Board operator",
                  message,
                  at: "now"
                }
              ]
            }
          : item
      )
    );
    setCommentDraft("");
  }

  const statusChangeBlocked =
    Boolean(selectedItem) &&
    pendingStatus !== selectedItem.status &&
    statusNeedsNote(pendingStatus) &&
    !pendingStatusNote.trim();

  return (
    <div className="ops-shell">
      <aside className="ops-sidebar" aria-label="Team Ops Board navigation">
        <div className="ops-brand">
          <div className="ops-brand-mark">
            <ListChecks size={20} aria-hidden="true" />
          </div>
          <div>
            <h1>Team Ops Board</h1>
            <p>June 4, 2026</p>
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
      </aside>

      <main className="ops-main">
        <header className="ops-topbar">
          <div className="ops-title-group">
            <p className="ops-kicker">Daily operations</p>
            <h2>{viewTitle(activeView)}</h2>
          </div>

          <div className="ops-actions">
            <label className="ops-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search work"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button className="ops-button" type="button" onClick={() => setExportOpen(true)}>
              <Download size={16} aria-hidden="true" />
              <span>Export</span>
            </button>
            <button className="ops-button ops-button-primary" type="button" onClick={() => setAddOpen(true)}>
              <Plus size={16} aria-hidden="true" />
              <span>Add</span>
            </button>
          </div>
        </header>

        {activeView === "board" && (
          <BoardView
            buckets={buckets}
            filteredItems={filteredItems}
            projectFilter={projectFilter}
            rangeFilter={rangeFilter}
            selectedId={selectedItem?.id}
            onProjectFilterChange={setProjectFilter}
            onRangeFilterChange={setRangeFilter}
            onSelectItem={selectItem}
          />
        )}

        {activeView === "projects" && <ProjectsView items={items} onSelectItem={selectItem} />}
        {activeView === "schedule" && <ScheduleView items={items} onSelectItem={selectItem} />}
        {activeView === "people" && <PeopleView items={items} onSelectItem={selectItem} />}
        {activeView === "settings" && (
          <SettingsView settingsState={settingsState} onSettingsChange={setSettingsState} />
        )}

        {activeView === "board" && selectedItem && (
          <DetailPanel
            item={selectedItem}
            pendingStatus={pendingStatus}
            pendingStatusNote={pendingStatusNote}
            commentDraft={commentDraft}
            statusChangeBlocked={statusChangeBlocked}
            onOwnerChange={updateOwner}
            onPendingStatusChange={setPendingStatus}
            onPendingStatusNoteChange={setPendingStatusNote}
            onApplyStatusChange={applyStatusChange}
            onCommentDraftChange={setCommentDraft}
            onAddComment={addComment}
          />
        )}
      </main>

      {addOpen && (
        <AddItemModal
          form={newItem}
          onClose={() => setAddOpen(false)}
          onCreate={createItem}
          onFormChange={setNewItem}
        />
      )}

      {exportOpen && (
        <ExportModal
          format={exportFormat}
          summary={weeklySummary}
          onClose={() => setExportOpen(false)}
          onFormatChange={setExportFormat}
        />
      )}
    </div>
  );
}

interface BoardViewProps {
  buckets: Record<BucketId, WorkItem[]>;
  filteredItems: WorkItem[];
  projectFilter: string;
  rangeFilter: RangeFilter;
  selectedId: string | undefined;
  onProjectFilterChange: (value: string) => void;
  onRangeFilterChange: (value: RangeFilter) => void;
  onSelectItem: (item: WorkItem) => void;
}

function BoardView({
  buckets,
  filteredItems,
  projectFilter,
  rangeFilter,
  selectedId,
  onProjectFilterChange,
  onRangeFilterChange,
  onSelectItem
}: BoardViewProps) {
  return (
    <section className="ops-board-shell" aria-label="Daily operations board">
      <div className="ops-board-toolbar">
        <div className="ops-segmented" aria-label="Date range">
          <button
            className={rangeFilter === "today" ? "is-selected" : ""}
            type="button"
            onClick={() => onRangeFilterChange("today")}
          >
            Today
          </button>
          <button
            className={rangeFilter === "week" ? "is-selected" : ""}
            type="button"
            onClick={() => onRangeFilterChange("week")}
          >
            This week
          </button>
        </div>

        <label className="ops-filter-select">
          <Filter size={16} aria-hidden="true" />
          <select value={projectFilter} onChange={(event) => onProjectFilterChange(event.target.value)}>
            <option value="all">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="ops-metrics" aria-label="Board counts">
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
                  item={item}
                  selected={item.id === selectedId}
                  onSelect={() => onSelectItem(item)}
                />
              ))}
              {buckets[bucket.id].length === 0 && <div className="ops-empty-line">No items</div>}
            </div>
          </section>
        ))}
      </div>

      <div className="ops-board-footer">{filteredItems.length} visible work items</div>
    </section>
  );
}

function WorkItemCard({ item, selected, onSelect }: { item: WorkItem; selected: boolean; onSelect: () => void }) {
  const project = projectById(item.projectId);
  const owner = personById(item.ownerId);

  return (
    <button className={`ops-work-card ${selected ? "is-selected" : ""}`} type="button" onClick={onSelect}>
      <span className={`ops-priority ops-priority-${item.priority.toLowerCase()}`}>{item.priority}</span>
      <strong>{item.title}</strong>
      <span className="ops-work-meta">
        <span style={{ "--project-color": project.color } as CSSProperties}>{project.code}</span>
        <span>{formatDate(item.dueDate)}</span>
        <span>{item.estimate}</span>
      </span>
      <span className="ops-work-owner">
        <Avatar person={owner} />
        <span>{owner?.name ?? "No owner"}</span>
      </span>
    </button>
  );
}

interface DetailPanelProps {
  item: WorkItem;
  pendingStatus: Status;
  pendingStatusNote: string;
  commentDraft: string;
  statusChangeBlocked: boolean;
  onOwnerChange: (ownerId: string) => void;
  onPendingStatusChange: (status: Status) => void;
  onPendingStatusNoteChange: (note: string) => void;
  onApplyStatusChange: () => void;
  onCommentDraftChange: (value: string) => void;
  onAddComment: () => void;
}

function DetailPanel({
  item,
  pendingStatus,
  pendingStatusNote,
  commentDraft,
  statusChangeBlocked,
  onOwnerChange,
  onPendingStatusChange,
  onPendingStatusNoteChange,
  onApplyStatusChange,
  onCommentDraftChange,
  onAddComment
}: DetailPanelProps) {
  const owner = personById(item.ownerId);
  const project = projectById(item.projectId);
  const applyDisabled = pendingStatus === item.status || statusChangeBlocked;

  return (
    <aside className="ops-detail" aria-label="Selected work item detail">
      <div className="ops-detail-heading">
        <span className={`ops-priority ops-priority-${item.priority.toLowerCase()}`}>{item.priority}</span>
        <h3>{item.title}</h3>
        <StatusBadge status={item.status} />
      </div>

      <dl className="ops-detail-grid">
        <div>
          <dt>Project</dt>
          <dd>{project.name}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{formatDate(item.dueDate)}</dd>
        </div>
        <div>
          <dt>Estimate</dt>
          <dd>{item.estimate}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{owner?.name ?? "No owner"}</dd>
        </div>
      </dl>

      {item.statusNote && (
        <div className="ops-status-note">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{item.statusNote}</span>
        </div>
      )}

      <div className="ops-field-group">
        <label>
          Owner
          <select value={item.ownerId ?? "none"} onChange={(event) => onOwnerChange(event.target.value)}>
            <option value="none">No owner</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Status
          <select value={pendingStatus} onChange={(event) => onPendingStatusChange(event.target.value as Status)}>
            <option value="queued">Queued</option>
            <option value="in_progress">In progress</option>
            <option value="blocked">Blocked</option>
            <option value="waiting">Waiting</option>
            <option value="done">Done</option>
          </select>
        </label>

        {statusNeedsNote(pendingStatus) && pendingStatus !== item.status && (
          <label>
            Status note
            <textarea
              value={pendingStatusNote}
              onChange={(event) => onPendingStatusNoteChange(event.target.value)}
              rows={3}
            />
          </label>
        )}

        <button className="ops-button ops-button-primary" type="button" disabled={applyDisabled} onClick={onApplyStatusChange}>
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>Apply status</span>
        </button>
      </div>

      <div className="ops-comments">
        <h4>
          <MessageSquare size={16} aria-hidden="true" />
          Comments
        </h4>
        <div className="ops-comment-list">
          {item.comments.map((comment, index) => (
            <div className="ops-comment" key={`${comment.author}-${comment.at}-${index}`}>
              <strong>{comment.author}</strong>
              <span>{comment.at}</span>
              <p>{comment.message}</p>
            </div>
          ))}
          {item.comments.length === 0 && <div className="ops-empty-line">No comments</div>}
        </div>
        <div className="ops-comment-box">
          <textarea value={commentDraft} onChange={(event) => onCommentDraftChange(event.target.value)} rows={3} />
          <button className="ops-button" type="button" disabled={!commentDraft.trim()} onClick={onAddComment}>
            <MessageSquare size={16} aria-hidden="true" />
            <span>Comment</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

function ProjectsView({ items, onSelectItem }: { items: WorkItem[]; onSelectItem: (item: WorkItem) => void }) {
  return (
    <section className="ops-view-panel">
      <div className="ops-section-header">
        <h3>Project load</h3>
        <span>{projects.length} active projects</span>
      </div>
      <div className="ops-project-grid">
        {projects.map((project) => {
          const projectItems = items.filter((item) => item.projectId === project.id);
          const blocked = projectItems.filter((item) => item.status === "blocked").length;
          const open = projectItems.filter((item) => item.status !== "done").length;

          return (
            <section className="ops-project-card" key={project.id}>
              <header>
                <span style={{ background: project.color }} aria-hidden="true" />
                <div>
                  <h4>{project.name}</h4>
                  <p>{project.stage}</p>
                </div>
              </header>
              <div className="ops-project-stats">
                <span>{open} open</span>
                <span>{blocked} blocked</span>
                <span>{projectItems.length} total</span>
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

function ScheduleView({ items, onSelectItem }: { items: WorkItem[]; onSelectItem: (item: WorkItem) => void }) {
  const days = groupBy(items, (item) => item.dueDate).sort(([left], [right]) => left.localeCompare(right));

  return (
    <section className="ops-view-panel">
      <div className="ops-section-header">
        <h3>Schedule</h3>
        <span>{items.length} planned items</span>
      </div>
      <div className="ops-schedule-list">
        {days.map(([day, dayItems]) => (
          <section className="ops-schedule-day" key={day}>
            <header>
              <CalendarDays size={18} aria-hidden="true" />
              <h4>{formatDate(day)}</h4>
              <span>{dayItems.length}</span>
            </header>
            {dayItems.map((item) => (
              <button key={item.id} type="button" onClick={() => onSelectItem(item)}>
                <span>{item.title}</span>
                <span>{projectById(item.projectId).code}</span>
                <StatusBadge status={item.status} />
              </button>
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}

function PeopleView({ items, onSelectItem }: { items: WorkItem[]; onSelectItem: (item: WorkItem) => void }) {
  return (
    <section className="ops-view-panel">
      <div className="ops-section-header">
        <h3>People</h3>
        <span>{people.length} assigned team members</span>
      </div>
      <div className="ops-people-table">
        {people.map((person) => {
          const personItems = items.filter((item) => item.ownerId === person.id);
          const blocked = personItems.filter((item) => item.status === "blocked").length;
          const dueToday = personItems.filter((item) => item.dueDate === TODAY_KEY && item.status !== "done").length;

          return (
            <section className="ops-person-row" key={person.id}>
              <Avatar person={person} />
              <div>
                <h4>{person.name}</h4>
                <p>{person.role}</p>
              </div>
              <strong>{personItems.filter((item) => item.status !== "done").length} open</strong>
              <span>{dueToday} today</span>
              <span>{blocked} blocked</span>
              <button type="button" onClick={() => personItems[0] && onSelectItem(personItems[0])}>
                View
              </button>
            </section>
          );
        })}
      </div>
    </section>
  );
}

interface SettingsViewProps {
  settingsState: {
    requireBlockedNote: boolean;
    requireWaitingNote: boolean;
    compactRows: boolean;
    weeklyDigest: boolean;
  };
  onSettingsChange: (settings: SettingsViewProps["settingsState"]) => void;
}

function SettingsView({ settingsState, onSettingsChange }: SettingsViewProps) {
  return (
    <section className="ops-view-panel">
      <div className="ops-section-header">
        <h3>Settings</h3>
        <span>Board v0</span>
      </div>
      <div className="ops-settings-grid">
        {Object.entries({
          requireBlockedNote: "Blocked status note",
          requireWaitingNote: "Waiting status note",
          compactRows: "Compact row density",
          weeklyDigest: "Weekly digest export"
        }).map(([key, label]) => (
          <label className="ops-toggle-row" key={key}>
            <span>{label}</span>
            <input
              checked={settingsState[key as keyof typeof settingsState]}
              type="checkbox"
              onChange={(event) =>
                onSettingsChange({
                  ...settingsState,
                  [key]: event.target.checked
                })
              }
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function AddItemModal({
  form,
  onClose,
  onCreate,
  onFormChange
}: {
  form: NewItemForm;
  onClose: () => void;
  onCreate: () => void;
  onFormChange: (form: NewItemForm) => void;
}) {
  return (
    <div className="ops-modal-backdrop" role="presentation">
      <section className="ops-modal" role="dialog" aria-modal="true" aria-label="Add work item">
        <header>
          <h3>Add work item</h3>
          <button className="ops-icon-button" type="button" onClick={onClose} aria-label="Close add item" title="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <label>
          Title
          <input value={form.title} onChange={(event) => onFormChange({ ...form, title: event.target.value })} />
        </label>
        <div className="ops-form-grid">
          <label>
            Project
            <select value={form.projectId} onChange={(event) => onFormChange({ ...form, projectId: event.target.value })}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Owner
            <select value={form.ownerId} onChange={(event) => onFormChange({ ...form, ownerId: event.target.value })}>
              <option value="none">No owner</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={form.status} onChange={(event) => onFormChange({ ...form, status: event.target.value as Status })}>
              <option value="queued">Queued</option>
              <option value="in_progress">In progress</option>
              <option value="blocked">Blocked</option>
              <option value="waiting">Waiting</option>
              <option value="done">Done</option>
            </select>
          </label>
          <label>
            Priority
            <select value={form.priority} onChange={(event) => onFormChange({ ...form, priority: event.target.value as Priority })}>
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
            </select>
          </label>
          <label>
            Due date
            <input
              type="date"
              value={form.dueDate}
              onChange={(event) => onFormChange({ ...form, dueDate: event.target.value })}
            />
          </label>
        </div>
        <footer>
          <button className="ops-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="ops-button ops-button-primary" type="button" disabled={!form.title.trim()} onClick={onCreate}>
            <Plus size={16} aria-hidden="true" />
            <span>Add item</span>
          </button>
        </footer>
      </section>
    </div>
  );
}

function ExportModal({
  format,
  summary,
  onClose,
  onFormatChange
}: {
  format: "text" | "csv";
  summary: { text: string; csv: string };
  onClose: () => void;
  onFormatChange: (format: "text" | "csv") => void;
}) {
  return (
    <div className="ops-modal-backdrop" role="presentation">
      <section className="ops-modal ops-export-modal" role="dialog" aria-modal="true" aria-label="Export weekly summary">
        <header>
          <h3>Export weekly summary</h3>
          <button className="ops-icon-button" type="button" onClick={onClose} aria-label="Close export" title="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="ops-segmented" aria-label="Export format">
          <button className={format === "text" ? "is-selected" : ""} type="button" onClick={() => onFormatChange("text")}>
            <FileText size={16} aria-hidden="true" />
            Text
          </button>
          <button className={format === "csv" ? "is-selected" : ""} type="button" onClick={() => onFormatChange("csv")}>
            <FileText size={16} aria-hidden="true" />
            CSV
          </button>
        </div>
        <textarea readOnly value={format === "text" ? summary.text : summary.csv} rows={14} />
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  return <span className={`ops-status ops-status-${status}`}>{statusLabel(status)}</span>;
}

function Avatar({ person }: { person: Person | null | undefined }) {
  if (!person) {
    return (
      <span className="ops-avatar ops-avatar-empty">
        <UserCircle size={18} aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className="ops-avatar" style={{ "--avatar-color": person.color } as CSSProperties}>
      {person.name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)}
    </span>
  );
}

function applyFilters(items: WorkItem[], rangeFilter: RangeFilter, projectFilter: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  return items.filter((item) => {
    const inRange = rangeFilter === "today" ? item.dueDate === TODAY_KEY : item.dueDate >= TODAY_KEY && item.dueDate <= WEEK_END_KEY;
    const inProject = projectFilter === "all" || item.projectId === projectFilter;
    const project = projectById(item.projectId);
    const owner = personById(item.ownerId);
    const inQuery =
      !normalizedQuery ||
      [item.title, project.name, project.code, owner?.name ?? "No owner", statusLabel(item.status)]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);

    return inRange && inProject && inQuery;
  });
}

function bucketForItem(item: WorkItem): BucketId {
  if (!item.ownerId) {
    return "no_owner";
  }
  if (item.status === "blocked") {
    return "blocked";
  }
  if (item.status === "waiting") {
    return "waiting";
  }
  if (item.status === "done") {
    return "done";
  }
  if (item.dueDate === TODAY_KEY) {
    return "today";
  }
  return "due_soon";
}

function projectById(projectId: string) {
  return projects.find((project) => project.id === projectId) ?? projects[0];
}

function personById(personId: string | null) {
  if (!personId) {
    return null;
  }
  return people.find((person) => person.id === personId) ?? null;
}

function statusNeedsNote(status: Status) {
  return status === "blocked" || status === "waiting";
}

function statusLabel(status: Status) {
  return {
    queued: "Queued",
    in_progress: "In progress",
    blocked: "Blocked",
    waiting: "Waiting",
    done: "Done"
  }[status];
}

function viewTitle(view: ViewId) {
  return {
    board: "Board",
    projects: "Projects",
    schedule: "Schedule",
    people: "People",
    settings: "Settings"
  }[view];
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(year, month - 1, day));
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return Array.from(map.entries());
}

function buildWeeklySummary(items: WorkItem[]) {
  const weekItems = items.filter((item) => item.dueDate >= TODAY_KEY && item.dueDate <= WEEK_END_KEY);
  const blocked = weekItems.filter((item) => item.status === "blocked");
  const waiting = weekItems.filter((item) => item.status === "waiting");
  const noOwner = weekItems.filter((item) => !item.ownerId);
  const done = weekItems.filter((item) => item.status === "done");
  const open = weekItems.filter((item) => item.status !== "done");

  const text = [
    "Team Ops Board weekly summary",
    `Window: ${formatDate(TODAY_KEY)}-${formatDate(WEEK_END_KEY)}, 2026`,
    `Open: ${open.length}`,
    `Done: ${done.length}`,
    `Blocked: ${blocked.length}`,
    `Waiting: ${waiting.length}`,
    `No owner: ${noOwner.length}`,
    "",
    "Blocked items:",
    ...blocked.map((item) => `- ${item.title} (${projectById(item.projectId).code}): ${item.statusNote ?? "No note"}`),
    "",
    "Waiting items:",
    ...waiting.map((item) => `- ${item.title} (${projectById(item.projectId).code}): ${item.statusNote ?? "No note"}`)
  ].join("\n");

  const csvRows = [
    ["id", "title", "project", "owner", "status", "priority", "due_date"],
    ...weekItems.map((item) => [
      item.id,
      item.title,
      projectById(item.projectId).name,
      personById(item.ownerId)?.name ?? "No owner",
      statusLabel(item.status),
      item.priority,
      item.dueDate
    ])
  ];

  return {
    text,
    csv: csvRows.map((row) => row.map(csvEscape).join(",")).join("\n")
  };
}

function csvEscape(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export default App;
