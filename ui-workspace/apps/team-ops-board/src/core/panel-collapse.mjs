export const PANEL_COLLAPSE_STORAGE_KEY = "soulforge.team_ops_board.panel_collapse.v1";

const STATIC_PANEL_IDS = new Set([
  "owner.limits",
  "owner.models",
  "owner.usage",
  "owner.realtime",
  "organization.workspace",
  "work.activity",
  "work.distribution",
  "work.usage_meter",
  "system.watchtower",
  "system.engineering",
]);

const DYNAMIC_WORK_GROUP_PATTERN = /^work\.group\.[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;

export function isPanelCollapseId(value) {
  return typeof value === "string"
    && (STATIC_PANEL_IDS.has(value) || DYNAMIC_WORK_GROUP_PATTERN.test(value));
}

export function readCollapsedPanelIds(storage) {
  if (!storage || typeof storage.getItem !== "function") return new Set();
  try {
    const raw = storage.getItem(PANEL_COLLAPSE_STORAGE_KEY);
    if (raw === null) return new Set();
    const parsed = JSON.parse(raw);
    if (
      !parsed
      || typeof parsed !== "object"
      || Array.isArray(parsed)
      || Object.keys(parsed).sort().join(",") !== "collapsed,schema_version"
      || parsed.schema_version !== 1
      || !Array.isArray(parsed.collapsed)
      || parsed.collapsed.length > 64
      || parsed.collapsed.some((panelId) => !isPanelCollapseId(panelId))
    ) {
      return new Set();
    }
    return new Set(parsed.collapsed);
  } catch {
    return new Set();
  }
}

export function setPanelCollapsed(storage, panelId, collapsed) {
  if (!storage || typeof storage.setItem !== "function" || !isPanelCollapseId(panelId)) return false;
  const next = readCollapsedPanelIds(storage);
  if (collapsed) next.add(panelId);
  else next.delete(panelId);
  try {
    storage.setItem(PANEL_COLLAPSE_STORAGE_KEY, JSON.stringify({
      schema_version: 1,
      collapsed: [...next].sort(),
    }));
    return true;
  } catch {
    return false;
  }
}
