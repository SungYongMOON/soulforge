import { useEffect, useState } from "react";
import { loadUiState } from "@soulforge/renderer-core";
import { RendererDesk } from "@soulforge/renderer-react";
import { FIXTURE_NAMES, type FixtureName, type UiState } from "@soulforge/ui-contract";
import { AVAILABLE_THEMES, applyThemeSelection, selectTheme } from "./themes";

interface RendererRouteState {
  fixture: FixtureName;
  themeId: string;
}

const FIXTURE_OPTIONS: FixtureName[] = [...FIXTURE_NAMES];

function routeFromSearch(search: string): RendererRouteState {
  const params = new URLSearchParams(search);
  const fixture = params.get("fixture") as FixtureName | null;
  const themeId = params.get("theme");

  return {
    fixture: fixture && FIXTURE_OPTIONS.includes(fixture) ? fixture : "integrated",
    themeId: selectTheme(themeId).id
  };
}

function searchFromRoute(route: RendererRouteState) {
  const params = new URLSearchParams();
  params.set("fixture", route.fixture);
  params.set("theme", route.themeId);
  return `?${params.toString()}`;
}

function App() {
  const [route, setRoute] = useState<RendererRouteState>(() => routeFromSearch(window.location.search));
  const [uiState, setUiState] = useState<UiState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadUiState({
      kind: "fixture",
      fixture: route.fixture
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

    applyThemeSelection(route.themeId);
    window.history.replaceState(null, "", searchFromRoute(route));

    return () => {
      cancelled = true;
    };
  }, [route]);

  const theme = selectTheme(route.themeId);

  return (
    <RendererDesk
      chrome={{
        eyebrow: "UI Workspace / Renderer v1",
        title: "Adventurer's Desk",
        subtitle: "Fixture-first read-only renderer shell. Theme package selection stays outside renderer logic.",
        modeLabel: "Fixture Workspace"
      }}
      controls={[
        {
          id: "fixture",
          label: "Fixture",
          options: FIXTURE_OPTIONS.map((fixture) => ({
            id: fixture,
            label: fixture,
            active: route.fixture === fixture
          })),
          onSelect(nextFixture) {
            setRoute((current) => ({
              ...current,
              fixture: nextFixture as FixtureName
            }));
          }
        },
        {
          id: "theme",
          label: "Theme",
          options: AVAILABLE_THEMES.map((candidate) => ({
            id: candidate.id,
            label: candidate.label,
            active: theme.id === candidate.id
          })),
          onSelect(nextThemeId) {
            setRoute((current) => ({
              ...current,
              themeId: selectTheme(nextThemeId).id
            }));
          }
        }
      ]}
      error={error}
      loading={loading}
      theme={theme}
      uiState={uiState}
    />
  );
}

export default App;
