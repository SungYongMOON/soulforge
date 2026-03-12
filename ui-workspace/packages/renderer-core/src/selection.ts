import { TAB_ORDER } from "./constants";
import type { SelectionAction, SelectionState, TabId } from "@soulforge/ui-contract";

export function createInitialSelectionState(defaultTab?: string | null): SelectionState {
  const activeTab = TAB_ORDER.includes((defaultTab as TabId) || "overview")
    ? ((defaultTab as TabId) || "overview")
    : "overview";

  return {
    activeTab,
    selectedItemKey: null,
    previewCandidateKey: null,
    openedCatalog: null,
    infoDockSection: "summary"
  };
}

export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case "reset":
      return createInitialSelectionState(action.activeTab);
    case "tab":
      return {
        ...state,
        activeTab: action.tab,
        infoDockSection: state.previewCandidateKey ? "preview" : "summary"
      };
    case "select-item":
      return {
        ...state,
        selectedItemKey: action.key,
        infoDockSection: action.key ? "selection" : "summary"
      };
    case "preview-candidate":
      return {
        ...state,
        previewCandidateKey: action.key,
        infoDockSection: action.key ? "preview" : "summary"
      };
    case "open-catalog":
      return {
        ...state,
        openedCatalog: action.catalog
      };
    case "focus-diagnostics":
      return {
        ...state,
        infoDockSection: "diagnostics"
      };
    default:
      return state;
  }
}
