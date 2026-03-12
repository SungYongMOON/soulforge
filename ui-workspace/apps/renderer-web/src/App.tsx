import { useEffect, useState } from "react";
import { loadUiState } from "@soulforge/renderer-core";
import { RendererDesk } from "@soulforge/renderer-react";
import { FIXTURE_NAMES, type FixtureName, type UiState, type UiStateRequest } from "@soulforge/ui-contract";

const FIXTURE_OPTIONS: FixtureName[] = [...FIXTURE_NAMES];

function requestFromSearch(search: string): UiStateRequest {
  const params = new URLSearchParams(search);
  const fixture = params.get("fixture") as FixtureName | null;

  return {
    kind: "fixture",
    fixture: fixture && FIXTURE_OPTIONS.includes(fixture) ? fixture : "integrated"
  };
}

function searchFromRequest(request: UiStateRequest) {
  const params = new URLSearchParams();
  params.set("fixture", request.fixture || "integrated");
  return `?${params.toString()}`;
}

function App() {
  const [request, setRequest] = useState<UiStateRequest>(() => requestFromSearch(window.location.search));
  const [uiState, setUiState] = useState<UiState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadUiState({
      kind: "fixture",
      fixture: request.fixture || "integrated"
    })
      .then((nextState) => {
        if (!cancelled) {
          setUiState(nextState);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load UI state.");
          setUiState(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    window.history.replaceState(null, "", searchFromRequest(request));

    return () => {
      cancelled = true;
    };
  }, [request]);

  return (
    <RendererDesk
      error={error}
      fixtureOptions={FIXTURE_OPTIONS}
      loading={loading}
      onRequestChange={setRequest}
      request={request}
      uiState={uiState}
    />
  );
}

export default App;
