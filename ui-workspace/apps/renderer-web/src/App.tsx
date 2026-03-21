import { useEffect, useState } from "react";
import { normalizeUiState } from "@soulforge/renderer-core";
import { RendererDesk } from "@soulforge/renderer-react";
import { SOULFORGE_SIGIL_ICON } from "@soulforge/theme-adventurers-desk";
import type { UiState } from "@soulforge/ui-contract";
import YAML from "yaml";
import { applyThemeSelection, selectTheme } from "./themes";
import appPackage from "../package.json";

type ControlCenterOwnerId = "body" | "class" | "guild_hall" | "operations" | "docs";
type ControlCenterPaneId = "editor" | "notifications" | "preview" | "diagnostics";
type ControlCenterCategory = "canonical" | "generated" | "doc" | "archive";
type HeaderThemeMode = "system" | "dark" | "white";

interface ControlCenterRouteState {
  ownerId: ControlCenterOwnerId;
  filePath: string | null;
  activePane: ControlCenterPaneId;
  themeId: HeaderThemeMode;
}

interface ControlCenterFileRecord {
  path: string;
  label: string;
  ownerId: ControlCenterOwnerId;
  sectionId: string;
  sectionLabel: string;
  sectionDescription: string;
  editable: boolean;
  category: ControlCenterCategory;
  size: number;
  updatedAt: string;
}

interface ControlCenterFileDetail extends ControlCenterFileRecord {
  content: string;
}

interface ControlCenterSection {
  id: string;
  label: string;
  description: string;
  files: ControlCenterFileRecord[];
}

interface ControlCenterOwner {
  id: ControlCenterOwnerId;
  label: string;
  description: string;
  sections: ControlCenterSection[];
}

interface ControlCenterTree {
  generatedAt: string;
  owners: ControlCenterOwner[];
}

interface ValidationFinding {
  level: string;
  code: string;
  message: string;
}

interface ValidationPayload {
  command: string;
  summary: {
    pass: number;
    warn: number;
    fail: number;
    result: string;
  };
  warnings: ValidationFinding[];
  errors: ValidationFinding[];
  findings: ValidationFinding[];
}

interface ValidationRunResult {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  payload: ValidationPayload | null;
}

interface ActionNotice {
  tone: "info" | "success" | "error";
  message: string;
}

interface ValidationState {
  loading: boolean;
  result: ValidationRunResult | null;
  error: string | null;
  updatedAt: string | null;
}

interface PreviewState {
  loading: boolean;
  uiState: UiState | null;
  error: string | null;
  updatedAt: string | null;
}

const API_PREFIX = "/__control_center_api";
const OWNER_IDS: ControlCenterOwnerId[] = ["body", "class", "guild_hall", "operations", "docs"];
const VISIBLE_OWNER_IDS: ControlCenterOwnerId[] = ["body", "class", "guild_hall", "operations", "docs"];
const PANE_IDS: ControlCenterPaneId[] = ["editor", "notifications", "preview", "diagnostics"];
const GATEWAY_NOTIFY_EVENTS = ["monster_created", "intake_failed", "mail_fetch_failed"] as const;
const MISSION_NOTIFY_EVENTS = ["mission_blocked", "mission_ready", "mission_closed", "mission_failed"] as const;
const CATEGORY_LABELS: Record<ControlCenterCategory, string> = {
  canonical: "Canonical",
  generated: "Generated",
  doc: "Docs",
  archive: "Archive"
};
const PREVIEW_CHROME = {
  eyebrow: "Control Center / Derived Preview",
  title: "Derived UI Preview",
  subtitle: "Integrated fixture sample normalized through renderer-core and rendered in renderer-react.",
  modeLabel: "Derived Preview"
} as const;
const CONTROL_CENTER_VERSION = appPackage.version;
const HEADER_THEME_OPTIONS: { id: HeaderThemeMode; label: string }[] = [
  { id: "system", label: "System" },
  { id: "dark", label: "Dark" },
  { id: "white", label: "White" }
];

function ThemeModeGlyph({ mode }: { mode: HeaderThemeMode }) {
  if (mode === "system") {
    return (
      <svg aria-hidden="true" className="cc-theme-icon" viewBox="0 0 24 24">
        <rect x="4.5" y="5.5" width="15" height="10.5" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 19h6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (mode === "dark") {
    return (
      <svg aria-hidden="true" className="cc-theme-icon" viewBox="0 0 24 24">
        <path
          d="M15.3 4.9a7.8 7.8 0 1 0 3.8 14.7 8.8 8.8 0 1 1-3.8-14.7Z"
          fill="none"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="cc-theme-icon" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function FolderGlyph() {
  return (
    <svg aria-hidden="true" className="cc-folder-icon" viewBox="0 0 24 24">
      <path
        d="M3.5 7.75a2.25 2.25 0 0 1 2.25-2.25h4.1l1.75 1.8h6.65a2.25 2.25 0 0 1 2.25 2.25v6.7a2.25 2.25 0 0 1-2.25 2.25H5.75a2.25 2.25 0 0 1-2.25-2.25Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function parseThemeMode(value: string | null | undefined): HeaderThemeMode | null {
  if (value === "system" || value === "dark" || value === "white") {
    return value;
  }

  if (value === "moonlight_sculptor") {
    return "dark";
  }

  if (value === "adventurers_desk" || value === "adventurers_archive") {
    return "white";
  }

  return null;
}

function themeManifestIdForMode(themeMode: HeaderThemeMode, prefersDark: boolean) {
  if (themeMode === "dark") {
    return "moonlight_sculptor";
  }

  if (themeMode === "white") {
    return "adventurers_desk";
  }

  return prefersDark ? "moonlight_sculptor" : "adventurers_desk";
}

function routeFromSearch(search: string): ControlCenterRouteState {
  const params = new URLSearchParams(search);
  const ownerId = parseOwnerId(params.get("owner"));
  const activePane = parsePaneId(params.get("pane"));
  const filePath = params.get("file");
  const themeId = parseThemeMode(params.get("theme"));

  return {
    ownerId: ownerId ?? "body",
    filePath,
    activePane: activePane ?? "editor",
    themeId: themeId ?? "system"
  };
}

function searchFromRoute(route: ControlCenterRouteState) {
  const params = new URLSearchParams();
  params.set("owner", route.ownerId);
  params.set("pane", route.activePane);
  params.set("theme", route.themeId);
  if (route.filePath) {
    params.set("file", route.filePath);
  }
  return `?${params.toString()}`;
}

function parseOwnerId(value: string | null): ControlCenterOwnerId | null {
  if (value === "workspaces") {
    return "operations";
  }
  return value && OWNER_IDS.includes(value as ControlCenterOwnerId) ? (value as ControlCenterOwnerId) : null;
}

function parsePaneId(value: string | null): ControlCenterPaneId | null {
  return value && PANE_IDS.includes(value as ControlCenterPaneId) ? (value as ControlCenterPaneId) : null;
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json()) as T | { error?: string };

  if (!response.ok) {
    throw new Error(typeof payload === "object" && payload && "error" in payload ? payload.error || "Request failed." : "Request failed.");
  }

  return payload as T;
}

async function requestTree() {
  return requestJson<ControlCenterTree>(`${API_PREFIX}/tree`);
}

async function requestFile(filePath: string) {
  return requestJson<ControlCenterFileDetail>(`${API_PREFIX}/file?path=${encodeURIComponent(filePath)}`);
}

async function saveFile(filePath: string, content: string) {
  return requestJson<ControlCenterFileDetail>(`${API_PREFIX}/file?path=${encodeURIComponent(filePath)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ content })
  });
}

async function requestValidation() {
  return requestJson<ValidationRunResult>(`${API_PREFIX}/validate`, {
    method: "POST"
  });
}

async function requestPreview() {
  const payload = await requestJson<unknown>(`${API_PREFIX}/derive-ui-state`);
  return normalizeUiState(payload);
}

function findOwner(tree: ControlCenterTree | null, ownerId: ControlCenterOwnerId) {
  return tree?.owners.find((owner) => owner.id === ownerId) ?? null;
}

function findFileRecord(tree: ControlCenterTree | null, filePath: string | null) {
  if (!tree || !filePath) {
    return null;
  }

  for (const owner of tree.owners) {
    for (const section of owner.sections) {
      for (const file of section.files) {
        if (file.path === filePath) {
          return file;
        }
      }
    }
  }

  return null;
}

function firstFilePath(owner: ControlCenterOwner | null) {
  if (!owner) {
    return null;
  }

  for (const section of owner.sections) {
    if (section.files[0]) {
      return section.files[0].path;
    }
  }

  return null;
}

function resolveTreeSelection(
  tree: ControlCenterTree,
  desiredOwnerId: ControlCenterOwnerId,
  desiredFilePath: string | null
) {
  const matchedFile = findFileRecord(tree, desiredFilePath);

  if (matchedFile) {
    return {
      ownerId: matchedFile.ownerId,
      filePath: matchedFile.path
    };
  }

  const desiredOwner = findOwner(tree, desiredOwnerId) ?? tree.owners[0] ?? null;
  const fallbackFilePath = firstFilePath(desiredOwner);

  return {
    ownerId: desiredOwner?.id ?? "body",
    filePath: fallbackFilePath
  };
}

function patchTreeFileRecord(tree: ControlCenterTree | null, updatedFile: ControlCenterFileRecord) {
  if (!tree) {
    return tree;
  }

  return {
    ...tree,
    owners: tree.owners.map((owner) => ({
      ...owner,
      sections: owner.sections.map((section) => ({
        ...section,
        files: section.files.map((file) =>
          file.path === updatedFile.path
            ? {
                ...file,
                ...updatedFile
              }
            : file
        )
      }))
    }))
  };
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Not yet";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isGatewayNotifyPolicy(filePath: string | null) {
  return filePath === "guild_hall/state/gateway/bindings/notify_policy.yaml";
}

function isMissionYaml(filePath: string | null) {
  return Boolean(filePath && filePath.startsWith(".mission/") && filePath.endsWith("/mission.yaml"));
}

function defaultGatewayNotifyPolicy() {
  return {
    kind: "gateway_notify_policy",
    scope: "gateway",
    channels: {
      telegram: {
        enabled: true,
        env_file: "guild_hall/state/town_crier/telegram_notify.env"
      }
    },
    events: Object.fromEntries(GATEWAY_NOTIFY_EVENTS.map((event) => [event, { telegram: false }])),
    updated_at: null
  };
}

function defaultMissionNotifications() {
  return {
    telegram: Object.fromEntries(MISSION_NOTIFY_EVENTS.map((event) => [event, false]))
  };
}

function parseYamlObject(content: string) {
  const parsed = YAML.parse(content);
  return parsed && typeof parsed === "object" ? parsed : {};
}

function normalizeGatewayNotifyPolicy(raw: unknown) {
  const base = defaultGatewayNotifyPolicy();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return base;
  }

  const candidate = raw as Record<string, unknown>;
  const telegramChannel = candidate.channels && typeof candidate.channels === "object" && !Array.isArray(candidate.channels)
    ? (candidate.channels as Record<string, unknown>).telegram
    : null;
  const rawEvents = candidate.events && typeof candidate.events === "object" && !Array.isArray(candidate.events)
    ? (candidate.events as Record<string, unknown>)
    : {};

  return {
    ...base,
    kind: typeof candidate.kind === "string" && candidate.kind.trim() ? candidate.kind.trim() : base.kind,
    scope: typeof candidate.scope === "string" && candidate.scope.trim() ? candidate.scope.trim() : base.scope,
    channels: {
      telegram: {
        enabled:
          telegramChannel && typeof telegramChannel === "object" && !Array.isArray(telegramChannel) && typeof (telegramChannel as Record<string, unknown>).enabled === "boolean"
            ? Boolean((telegramChannel as Record<string, unknown>).enabled)
            : base.channels.telegram.enabled,
        env_file:
          telegramChannel && typeof telegramChannel === "object" && !Array.isArray(telegramChannel) && typeof (telegramChannel as Record<string, unknown>).env_file === "string"
            ? String((telegramChannel as Record<string, unknown>).env_file)
            : base.channels.telegram.env_file
      }
    },
    events: Object.fromEntries(
      GATEWAY_NOTIFY_EVENTS.map((event) => {
        const rawEvent = rawEvents[event];
        const telegramEnabled =
          rawEvent && typeof rawEvent === "object" && !Array.isArray(rawEvent) && typeof (rawEvent as Record<string, unknown>).telegram === "boolean"
            ? Boolean((rawEvent as Record<string, unknown>).telegram)
            : false;
        return [event, { telegram: telegramEnabled }];
      })
    ),
    updated_at: typeof candidate.updated_at === "string" ? candidate.updated_at : null
  };
}

function normalizeMissionNotifications(raw: unknown) {
  const base = defaultMissionNotifications();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return base;
  }

  const telegram = (raw as Record<string, unknown>).telegram;
  if (!telegram || typeof telegram !== "object" || Array.isArray(telegram)) {
    return base;
  }

  return {
    telegram: Object.fromEntries(
      MISSION_NOTIFY_EVENTS.map((event) => [event, typeof (telegram as Record<string, unknown>)[event] === "boolean" ? Boolean((telegram as Record<string, unknown>)[event]) : false])
    )
  };
}

function getNotificationPaneModel(filePath: string | null, content: string) {
  if (!filePath) {
    return { kind: "none", error: null } as const;
  }

  try {
    const parsed = parseYamlObject(content);

    if (isGatewayNotifyPolicy(filePath)) {
      return {
        kind: "gateway",
        error: null,
        document: parsed,
        policy: normalizeGatewayNotifyPolicy(parsed)
      } as const;
    }

    if (isMissionYaml(filePath)) {
      const missionDocument = parsed as Record<string, unknown>;
      return {
        kind: "mission",
        error: null,
        document: missionDocument,
        notifications: normalizeMissionNotifications(missionDocument.notifications),
      } as const;
    }

    return { kind: "unsupported", error: null } as const;
  } catch (error) {
    return {
      kind: "invalid",
      error: error instanceof Error ? error.message : "Failed to parse YAML."
    } as const;
  }
}

function updateGatewayNotifyToggle(content: string, eventId: (typeof GATEWAY_NOTIFY_EVENTS)[number], enabled: boolean) {
  const parsed = parseYamlObject(content) as Record<string, unknown>;
  const policy = normalizeGatewayNotifyPolicy(parsed);
  policy.events[eventId].telegram = enabled;
  policy.updated_at = new Date().toISOString();
  return YAML.stringify(policy);
}

function updateMissionNotifyToggle(content: string, eventId: (typeof MISSION_NOTIFY_EVENTS)[number], enabled: boolean) {
  const parsed = parseYamlObject(content) as Record<string, unknown>;
  parsed.notifications = normalizeMissionNotifications(parsed.notifications);
  (parsed.notifications as { telegram: Record<string, boolean> }).telegram[eventId] = enabled;
  return YAML.stringify(parsed);
}

function readOnlyReason(file: ControlCenterFileRecord | null) {
  if (!file || file.editable) {
    return null;
  }

  if (file.category === "generated") {
    return "This file is generated metadata. Edit the source file and regenerate instead of writing here.";
  }

  if (file.category === "archive") {
    return "Archive documents stay read-only in the control center.";
  }

  return "This file is read-only in the control center.";
}

function validationTone(result: ValidationRunResult | null) {
  if (result?.payload?.summary.result === "FAIL") {
    return "error";
  }

  if (result?.payload?.summary.result === "WARN") {
    return "warning";
  }

  return "ready";
}

function ownerFolderName(ownerId: ControlCenterOwnerId) {
  if (ownerId === "body") {
    return "IdentityUnit";
  }

  if (ownerId === "class") {
    return "Catalogs";
  }

  if (ownerId === "operations") {
    return "Operations";
  }

  if (ownerId === "guild_hall") {
    return "Guild Hall";
  }

  return "Docs";
}

function firstFilePathForSection(section: ControlCenterSection) {
  return section.files[0]?.path ?? null;
}

function App() {
  const [route, setRoute] = useState<ControlCenterRouteState>(() => routeFromSearch(window.location.search));
  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [tree, setTree] = useState<ControlCenterTree | null>(null);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [fileDetail, setFileDetail] = useState<ControlCenterFileDetail | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [validation, setValidation] = useState<ValidationState>({
    loading: false,
    result: null,
    error: null,
    updatedAt: null
  });
  const [preview, setPreview] = useState<PreviewState>({
    loading: false,
    uiState: null,
    error: null,
    updatedAt: null
  });
  const [isOwnerRailCollapsed, setIsOwnerRailCollapsed] = useState(false);
  const [collapsedOwners, setCollapsedOwners] = useState<Record<ControlCenterOwnerId, boolean>>({
    body: false,
    class: false,
    guild_hall: false,
    operations: false,
    docs: false
  });
  const notificationPane = getNotificationPaneModel(route.filePath, editorContent);

  const theme = selectTheme(themeManifestIdForMode(route.themeId, prefersDark));
  const selectedOwner = findOwner(tree, route.ownerId);
  const selectedFileRecord = findFileRecord(tree, route.filePath);
  const visibleOwners = VISIBLE_OWNER_IDS.map((ownerId) => findOwner(tree, ownerId)).filter(
    (owner): owner is ControlCenterOwner => owner !== null
  );
  const dirty = fileDetail !== null && editorContent !== fileDetail.content;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersDark(event.matches);
    };

    setPrefersDark(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    applyThemeSelection(theme.id);
    window.history.replaceState(null, "", searchFromRoute(route));
  }, [route, theme.id]);

  async function loadTree(preferred: Partial<Pick<ControlCenterRouteState, "ownerId" | "filePath">> = {}) {
    setTreeLoading(true);
    setTreeError(null);

    try {
      const nextTree = await requestTree();
      const nextSelection = resolveTreeSelection(
        nextTree,
        preferred.ownerId ?? route.ownerId,
        preferred.filePath ?? route.filePath
      );
      setTree(nextTree);
      setRoute((current) => ({
        ...current,
        ownerId: nextSelection.ownerId,
        filePath: nextSelection.filePath
      }));
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : "Failed to load control center tree.");
      setTree(null);
    } finally {
      setTreeLoading(false);
    }
  }

  useEffect(() => {
    void loadTree();
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!route.filePath) {
      setFileDetail(null);
      setEditorContent("");
      setFileError(null);
      setFileLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setFileLoading(true);
    setFileError(null);

    requestFile(route.filePath)
      .then((nextFile) => {
        if (cancelled) {
          return;
        }

        setFileDetail(nextFile);
        setEditorContent(nextFile.content);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setFileDetail(null);
        setEditorContent("");
        setFileError(error instanceof Error ? error.message : "Failed to load file.");
      })
      .finally(() => {
        if (!cancelled) {
          setFileLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [route.filePath]);

  useEffect(() => {
    if (route.activePane === "preview" && !preview.loading && !preview.uiState && !preview.error) {
      void handlePreviewRefresh(false);
    }
  }, [route.activePane]);

  useEffect(() => {
    if (route.activePane === "diagnostics" && !validation.loading && !validation.result && !validation.error) {
      void handleValidate(false);
    }
  }, [route.activePane]);

  function canDiscardUnsavedChanges() {
    if (!dirty) {
      return true;
    }

    return window.confirm("현재 파일의 미저장 변경을 버리고 이동할까요?");
  }

  function canRunDiskActions() {
    if (!dirty) {
      return true;
    }

    return window.confirm("미저장 변경은 Validate/Preview에 반영되지 않습니다. 저장하지 않고 계속할까요?");
  }

  function selectOwner(ownerId: ControlCenterOwnerId) {
    if (!canDiscardUnsavedChanges()) {
      return;
    }

    const owner = findOwner(tree, ownerId);
    setCollapsedOwners((current) => ({
      ...current,
      [ownerId]: false
    }));
    setRoute((current) => ({
      ...current,
      ownerId,
      filePath: firstFilePath(owner)
    }));
  }

  function selectOwnerSection(ownerId: ControlCenterOwnerId, section: ControlCenterSection) {
    if (!canDiscardUnsavedChanges()) {
      return;
    }

    const filePath = firstFilePathForSection(section);
    setCollapsedOwners((current) => ({
      ...current,
      [ownerId]: false
    }));

    setRoute((current) => ({
      ...current,
      ownerId,
      filePath
    }));
  }

  function toggleOwnerCollapse(ownerId: ControlCenterOwnerId) {
    setCollapsedOwners((current) => ({
      ...current,
      [ownerId]: !current[ownerId]
    }));
  }

  function selectFile(filePath: string) {
    if (!canDiscardUnsavedChanges()) {
      return;
    }

    const nextFile = findFileRecord(tree, filePath);
    setRoute((current) => ({
      ...current,
      ownerId: nextFile?.ownerId ?? current.ownerId,
      filePath
    }));
  }

  async function handleRefresh() {
    if (!route.filePath) {
      return;
    }

    if (!canDiscardUnsavedChanges()) {
      return;
    }

    setRefreshing(true);
    setNotice({
      tone: "info",
      message: "Refreshing tree and file from disk."
    });

    try {
      const [nextTree, nextFile] = await Promise.all([requestTree(), requestFile(route.filePath)]);
      const nextSelection = resolveTreeSelection(nextTree, route.ownerId, nextFile.path);
      setTree(nextTree);
      setRoute((current) => ({
        ...current,
        ownerId: nextSelection.ownerId,
        filePath: nextSelection.filePath
      }));
      setFileDetail(nextFile);
      setEditorContent(nextFile.content);
      setFileError(null);
      setNotice({
        tone: "success",
        message: `Reloaded ${nextFile.path} from disk.`
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Refresh failed."
      });
    } finally {
      setRefreshing(false);
    }
  }

  function handleReset() {
    if (!fileDetail) {
      return;
    }

    setEditorContent(fileDetail.content);
    setNotice({
      tone: "info",
      message: `Reset unsaved buffer for ${fileDetail.path}.`
    });
  }

  async function handleSave() {
    if (!fileDetail || !selectedFileRecord?.editable) {
      return;
    }

    setSaving(true);
    setNotice({
      tone: "info",
      message: `Saving ${fileDetail.path}.`
    });

    try {
      const updatedFile = await saveFile(fileDetail.path, editorContent);
      setFileDetail(updatedFile);
      setEditorContent(updatedFile.content);
      setTree((current) => patchTreeFileRecord(current, updatedFile));
      setNotice({
        tone: "success",
        message: `Saved ${updatedFile.path}.`
      });

      if (route.activePane === "preview") {
        void handlePreviewRefresh(false);
      }

      if (route.activePane === "diagnostics") {
        void handleValidate(false);
      }
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Save failed."
      });
    } finally {
      setSaving(false);
    }
  }

  function handleGatewayNotifyToggle(eventId: (typeof GATEWAY_NOTIFY_EVENTS)[number], enabled: boolean) {
    try {
      setEditorContent(updateGatewayNotifyToggle(editorContent, eventId, enabled));
      setNotice({
        tone: "info",
        message: `Queued ${eventId} notification ${enabled ? "on" : "off"} in the editor buffer.`
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to update gateway notification."
      });
    }
  }

  function handleMissionNotifyToggle(eventId: (typeof MISSION_NOTIFY_EVENTS)[number], enabled: boolean) {
    try {
      setEditorContent(updateMissionNotifyToggle(editorContent, eventId, enabled));
      setNotice({
        tone: "info",
        message: `Queued ${eventId} notification ${enabled ? "on" : "off"} in the editor buffer.`
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to update mission notification."
      });
    }
  }

  async function handleValidate(confirmUnsaved: boolean) {
    if (confirmUnsaved && !canRunDiskActions()) {
      return;
    }

    setValidation((current) => ({
      ...current,
      loading: true,
      error: null
    }));
    setNotice({
      tone: "info",
      message: "Running fixture-backed validate."
    });

    try {
      const result = await requestValidation();
      setValidation({
        loading: false,
        result,
        error: null,
        updatedAt: new Date().toISOString()
      });
      setRoute((current) => ({
        ...current,
        activePane: "diagnostics"
      }));
      setNotice({
        tone: result.ok ? "success" : "error",
        message: result.payload
          ? `Validate finished with ${result.payload.summary.result}.`
          : "Validate finished without parsed JSON payload."
      });
    } catch (error) {
      setValidation({
        loading: false,
        result: null,
        error: error instanceof Error ? error.message : "Validate failed.",
        updatedAt: null
      });
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Validate failed."
      });
    }
  }

  async function handlePreviewRefresh(confirmUnsaved: boolean) {
    if (confirmUnsaved && !canRunDiskActions()) {
      return;
    }

    setPreview((current) => ({
      ...current,
      loading: true,
      error: null
    }));
    setNotice({
      tone: "info",
      message: "Deriving UI state preview."
    });

    try {
      const uiState = await requestPreview();
      setPreview({
        loading: false,
        uiState,
        error: null,
        updatedAt: new Date().toISOString()
      });
      setRoute((current) => ({
        ...current,
        activePane: "preview"
      }));
      setNotice({
        tone: "success",
        message: "Derived UI preview updated."
      });
    } catch (error) {
      setPreview({
        loading: false,
        uiState: null,
        error: error instanceof Error ? error.message : "Preview refresh failed.",
        updatedAt: null
      });
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Preview refresh failed."
      });
    }
  }

  return (
    <div className="cc-shell" data-theme-family={theme.family} data-theme-id={theme.id} data-theme-phase={theme.phase}>
      <header className="cc-topbar">
        <div className="cc-brand-bar">
          <button
            aria-label={isOwnerRailCollapsed ? "Open owner rail" : "Collapse owner rail"}
            className="cc-menu-button"
            type="button"
            onClick={() => setIsOwnerRailCollapsed((current) => !current)}
          >
            <span />
            <span />
            <span />
          </button>

          <div className="cc-brand">
            <img alt="" className="cc-brand__icon" src={SOULFORGE_SIGIL_ICON} />
            <div className="cc-brand__copy">
              <span className="cc-brand__name">SOULFORGE</span>
              <span className="cc-brand__subtitle">Dashboard</span>
            </div>
          </div>
        </div>

        <div className="cc-topbar-meta">
          <span className="cc-version-pill">Version {CONTROL_CENTER_VERSION}</span>
          <div className="cc-theme-switcher cc-theme-switcher--header">
            {HEADER_THEME_OPTIONS.map((candidate) => (
              <button
                aria-label={candidate.label}
                className={candidate.id === route.themeId ? "cc-button cc-button--active" : "cc-button"}
                key={candidate.id}
                type="button"
                onClick={() =>
                  setRoute((current) => ({
                    ...current,
                    themeId: candidate.id
                  }))
                }
              >
                <ThemeModeGlyph mode={candidate.id} />
                <span className="cc-visually-hidden">{candidate.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {notice ? (
        <div className={`cc-notice cc-notice--${notice.tone}`}>
          <span>{notice.message}</span>
        </div>
      ) : null}

      <div className={isOwnerRailCollapsed ? "cc-layout cc-layout--rail-collapsed" : "cc-layout"}>
        <aside className="cc-sidebar">
          {treeError ? <p className="cc-error-text">{treeError}</p> : null}

          <div className="cc-owner-tree">
            {visibleOwners.map((owner) => {
              const isCollapsed = collapsedOwners[owner.id];

              return (
                  <section className="cc-owner-group" key={owner.id}>
                    <div className="cc-owner-heading">
                      <button className="cc-owner-heading__label" type="button" onClick={() => selectOwner(owner.id)}>
                        {ownerFolderName(owner.id)}
                      </button>

                      <button
                        aria-label={isCollapsed ? `Expand ${ownerFolderName(owner.id)}` : `Collapse ${ownerFolderName(owner.id)}`}
                        className="cc-owner-toggle"
                        type="button"
                        onClick={() => toggleOwnerCollapse(owner.id)}
                      >
                        <span aria-hidden="true" className="cc-owner-toggle__symbol">
                          {isCollapsed ? "+" : "-"}
                        </span>
                      </button>
                    </div>

                    {!isCollapsed ? (
                      <div className="cc-owner-children">
                        {owner.sections.map((section) => {
                          const isSectionActive =
                            owner.id === route.ownerId && selectedFileRecord?.sectionId === section.id;

                          return (
                            <button
                              className={isSectionActive ? "cc-owner-child is-active" : "cc-owner-child"}
                              key={`${owner.id}:${section.id}`}
                              type="button"
                              onClick={() => selectOwnerSection(owner.id, section)}
                            >
                              <FolderGlyph />
                              <span className="cc-owner-child__label">{section.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                );
              })}
          </div>
        </aside>

        <section className="cc-global-toolbar">
          <div className="cc-global-toolbar__meta">
            <span className="cc-chip">Tree {tree ? formatTimestamp(tree.generatedAt) : "Loading"}</span>
            <button className="cc-button" type="button" onClick={() => void handleValidate(true)} disabled={validation.loading}>
              {validation.loading ? "Validating..." : "Validate"}
            </button>
            <button className="cc-button" type="button" onClick={() => void handlePreviewRefresh(true)} disabled={preview.loading}>
              {preview.loading ? "Previewing..." : "Preview"}
            </button>
          </div>
        </section>

        <section className="cc-column cc-column--files">
          <div className="cc-column-header">
            <div>
              <p className="cc-eyebrow">Files</p>
              <h2>{selectedOwner ? ownerFolderName(selectedOwner.id) : "Select owner"}</h2>
              <p className="cc-section-note">{selectedOwner?.description ?? "Pick a canonical owner to inspect files."}</p>
            </div>
          </div>

          {selectedOwner ? (
            <div className="cc-section-list">
              {selectedOwner.sections.map((section) => (
                <section className="cc-file-section" key={section.id}>
                  <div className="cc-file-section__header">
                    <h3>{section.label}</h3>
                    <p>{section.description}</p>
                  </div>

                  <div className="cc-file-list">
                    {section.files.map((file) => (
                      <button
                        className={file.path === route.filePath ? "cc-file-card is-active" : "cc-file-card"}
                        key={file.path}
                        type="button"
                        onClick={() => selectFile(file.path)}
                      >
                        <div className="cc-file-card__top">
                          <strong>{file.label}</strong>
                          <span className="cc-chip">{CATEGORY_LABELS[file.category]}</span>
                        </div>
                        <span>{file.path}</span>
                        <span>
                          {formatBytes(file.size)} · {formatTimestamp(file.updatedAt)}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="cc-empty-state">
              <p>No owner is available yet.</p>
            </div>
          )}
        </section>

        <main className="cc-detail">
          <div className="cc-detail-header">
            <div>
              <p className="cc-eyebrow">Workspace File</p>
              <h2>{selectedFileRecord?.label ?? "Select a file"}</h2>
              <p className="cc-section-note">{selectedFileRecord?.path ?? "Choose a file from the center column."}</p>
              <div className="cc-chip-row">
                {selectedFileRecord ? <span className="cc-chip">{selectedFileRecord.sectionLabel}</span> : null}
                {selectedFileRecord ? <span className="cc-chip">{CATEGORY_LABELS[selectedFileRecord.category]}</span> : null}
                {selectedFileRecord ? <span className="cc-chip">{selectedFileRecord.editable ? "Editable" : "Read only"}</span> : null}
                {fileDetail ? <span className="cc-chip">{formatBytes(fileDetail.size)}</span> : null}
                {fileDetail ? <span className="cc-chip">Updated {formatTimestamp(fileDetail.updatedAt)}</span> : null}
                {dirty ? <span className="cc-chip cc-chip--active">Unsaved changes</span> : null}
              </div>
            </div>

            <div className="cc-action-row">
              <button className="cc-button" type="button" onClick={handleRefresh} disabled={!route.filePath || refreshing}>
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
              <button className="cc-button" type="button" onClick={handleReset} disabled={!dirty}>
                Reset
              </button>
              <button
                className="cc-button cc-button--primary"
                type="button"
                onClick={() => void handleSave()}
                disabled={!dirty || !selectedFileRecord?.editable || saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          <div className="cc-tab-row">
            {PANE_IDS.map((paneId) => (
              <button
                className={paneId === route.activePane ? "cc-tab is-active" : "cc-tab"}
                key={paneId}
                type="button"
                onClick={() =>
                  setRoute((current) => ({
                    ...current,
                    activePane: paneId
                  }))
                }
              >
                {paneId === "editor"
                  ? "Editor"
                  : paneId === "notifications"
                    ? "Notifications"
                    : paneId === "preview"
                      ? "Preview"
                      : "Diagnostics"}
              </button>
            ))}
          </div>

          {route.activePane === "editor" ? (
            <section className="cc-pane">
              {fileError ? <p className="cc-error-text">{fileError}</p> : null}
              {readOnlyReason(selectedFileRecord) ? <p className="cc-readonly-note">{readOnlyReason(selectedFileRecord)}</p> : null}
              <textarea
                className="cc-editor"
                spellCheck={false}
                value={editorContent}
                onChange={(event) => setEditorContent(event.target.value)}
                readOnly={!selectedFileRecord?.editable || fileLoading || saving}
                placeholder={fileLoading ? "Loading file..." : "Select a file to inspect or edit."}
              />
            </section>
          ) : null}

          {route.activePane === "notifications" ? (
            <section className="cc-pane">
              <div className="cc-pane-toolbar">
                <p>Toggle notification flags in the file buffer, then save to persist them.</p>
              </div>

              {notificationPane.kind === "gateway" ? (
                <div className="cc-notify-stack">
                  <div className="cc-summary-card">
                    <strong>Gateway / Telegram</strong>
                    <span>Env {notificationPane.policy.channels.telegram.env_file}</span>
                    <span>{notificationPane.policy.channels.telegram.enabled ? "Channel enabled" : "Channel disabled"}</span>
                  </div>

                  <section className="cc-notify-block">
                    <h3>Gateway Events</h3>
                    <div className="cc-notify-grid">
                      {GATEWAY_NOTIFY_EVENTS.map((eventId) => (
                        <label className="cc-notify-card" key={eventId}>
                          <div className="cc-notify-card__copy">
                            <strong>{eventId}</strong>
                            <span>Send Telegram when `{eventId}` is emitted.</span>
                          </div>
                          <input
                            checked={notificationPane.policy.events[eventId].telegram}
                            type="checkbox"
                            onChange={(event) => handleGatewayNotifyToggle(eventId, event.currentTarget.checked)}
                          />
                        </label>
                      ))}
                    </div>
                  </section>
                </div>
              ) : null}

              {notificationPane.kind === "mission" ? (
                <div className="cc-notify-stack">
                  <div className="cc-summary-card">
                    <strong>Mission / Telegram</strong>
                    <span>Mission-scoped tracked toggle set</span>
                    <span>Save writes back into `mission.yaml`.</span>
                  </div>

                  <section className="cc-notify-block">
                    <h3>Mission Events</h3>
                    <div className="cc-notify-grid">
                      {MISSION_NOTIFY_EVENTS.map((eventId) => (
                        <label className="cc-notify-card" key={eventId}>
                          <div className="cc-notify-card__copy">
                            <strong>{eventId}</strong>
                            <span>Emit Telegram when `{eventId}` is triggered for this mission.</span>
                          </div>
                          <input
                            checked={notificationPane.notifications.telegram[eventId]}
                            type="checkbox"
                            onChange={(event) => handleMissionNotifyToggle(eventId, event.currentTarget.checked)}
                          />
                        </label>
                      ))}
                    </div>
                  </section>
                </div>
              ) : null}

              {notificationPane.kind === "invalid" ? (
                <div className="cc-empty-state">
                  <p>YAML parse failed: {notificationPane.error}</p>
                </div>
              ) : null}

              {notificationPane.kind === "unsupported" || notificationPane.kind === "none" ? (
                <div className="cc-empty-state">
                  <p>Select `gateway` notify policy or a mission `mission.yaml` to edit notification toggles.</p>
                </div>
              ) : null}
            </section>
          ) : null}

          {route.activePane === "preview" ? (
            <section className="cc-pane">
              <div className="cc-pane-toolbar">
                <p>Preview uses the integrated fixture sample while canonical cleanup is in progress.</p>
                <button className="cc-button" type="button" onClick={() => void handlePreviewRefresh(true)} disabled={preview.loading}>
                  {preview.loading ? "Refreshing..." : "Refresh Preview"}
                </button>
              </div>

              {preview.error ? <p className="cc-error-text">{preview.error}</p> : null}
              {preview.updatedAt ? <p className="cc-section-note">Last derived {formatTimestamp(preview.updatedAt)}</p> : null}

              {preview.uiState ? (
                <div className="cc-preview-canvas">
                  <RendererDesk
                    chrome={PREVIEW_CHROME}
                    error={null}
                    loading={preview.loading}
                    theme={theme}
                    uiState={preview.uiState}
                  />
                </div>
              ) : (
                <div className="cc-empty-state">
                  <p>Run Preview to render the current derived UI state.</p>
                </div>
              )}
            </section>
          ) : null}

          {route.activePane === "diagnostics" ? (
            <section className="cc-pane">
              <div className="cc-pane-toolbar">
                <p>Validation runs against the saved repository state.</p>
                <button className="cc-button" type="button" onClick={() => void handleValidate(true)} disabled={validation.loading}>
                  {validation.loading ? "Running..." : "Run Validate"}
                </button>
              </div>

              {validation.error ? <p className="cc-error-text">{validation.error}</p> : null}

              {validation.result?.payload ? (
                <div className="cc-diagnostics-stack">
                  <div className={`cc-summary-card cc-summary-card--${validationTone(validation.result)}`}>
                    <strong>{validation.result.payload.summary.result}</strong>
                    <span>Pass {validation.result.payload.summary.pass}</span>
                    <span>Warn {validation.result.payload.summary.warn}</span>
                    <span>Fail {validation.result.payload.summary.fail}</span>
                    <span>Updated {formatTimestamp(validation.updatedAt)}</span>
                  </div>

                  {validation.result.payload.warnings.length > 0 ? (
                    <section className="cc-diagnostic-block">
                      <h3>Warnings</h3>
                      <ul className="cc-diagnostic-list">
                        {validation.result.payload.warnings.map((warning) => (
                          <li key={`${warning.code}:${warning.message}`}>
                            <strong>{warning.code}</strong>
                            <span>{warning.message}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {validation.result.payload.errors.length > 0 ? (
                    <section className="cc-diagnostic-block">
                      <h3>Errors</h3>
                      <ul className="cc-diagnostic-list">
                        {validation.result.payload.errors.map((error) => (
                          <li key={`${error.code}:${error.message}`}>
                            <strong>{error.code}</strong>
                            <span>{error.message}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  <section className="cc-diagnostic-block">
                    <h3>Command Output</h3>
                    <pre className="cc-plain-output">{validation.result.stdout || validation.result.stderr || "No command output."}</pre>
                  </section>
                </div>
              ) : (
                <div className="cc-empty-state">
                  <p>Run Validate to inspect repository health from the control center.</p>
                </div>
              )}
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}

export default App;
