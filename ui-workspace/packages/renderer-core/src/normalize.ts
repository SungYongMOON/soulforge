import { DEFAULT_UI_HINTS } from "./constants";
import type { UiState } from "@soulforge/ui-contract";

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

  throw new Error("Unsupported UI state payload. Expected a v1 UI state document.");
}
