import { adaptLegacyDerivedState } from "./legacy-adapter";
import { DEFAULT_UI_HINTS } from "./constants";
import type { LegacyDerivedState, UiState } from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isUiState(value: unknown): value is UiState {
  const record = asRecord(value);
  if (!record) {
    return false;
  }

  return (
    typeof record.schema_version === "string" &&
    !!record.source &&
    !!record.overview &&
    !!record.body &&
    !!record.class_view &&
    !!record.workspaces &&
    !!record.diagnostics &&
    !!record.catalogs &&
    !!record.ui_hints
  );
}

export function isLegacyDerivedState(value: unknown): value is LegacyDerivedState {
  const record = asRecord(value);
  if (!record) {
    return false;
  }

  return !!record.overview && !!record.body && !!record.class && !!record.workspaces && !!record.diagnostics;
}

export function normalizeUiState(value: unknown): UiState {
  if (isUiState(value)) {
    return {
      ...value,
      ui_hints: {
        ...DEFAULT_UI_HINTS,
        ...value.ui_hints
      },
      source: {
        ...value.source,
        fixture_name: value.source.fixture_name ?? null,
        notes: value.source.notes ?? []
      }
    };
  }

  if (isLegacyDerivedState(value)) {
    return adaptLegacyDerivedState(value);
  }

  throw new Error("Unsupported UI state payload. Expected v1 UI state or legacy derive-ui-state output.");
}
