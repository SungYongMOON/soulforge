import { useEffect, useState } from "react";
import { RendererDesk } from "@soulforge/renderer-react";
import { AVAILABLE_THEMES, applyThemeSelection, selectTheme } from "./themes";
import { selectStory, SKIN_LAB_STORIES } from "./storyStates";

interface LabRouteState {
  storyId: string;
  themeId: string;
}

function routeFromSearch(search: string): LabRouteState {
  const params = new URLSearchParams(search);
  const story = selectStory(params.get("story"));
  const theme = selectTheme(params.get("theme"));

  return {
    storyId: story.id,
    themeId: theme.id
  };
}

function searchFromRoute(route: LabRouteState) {
  const params = new URLSearchParams();
  params.set("story", route.storyId);
  params.set("theme", route.themeId);
  return `?${params.toString()}`;
}

function App() {
  const [route, setRoute] = useState<LabRouteState>(() => routeFromSearch(window.location.search));

  useEffect(() => {
    applyThemeSelection(route.themeId);
    window.history.replaceState(null, "", searchFromRoute(route));
  }, [route]);

  const theme = selectTheme(route.themeId);
  const story = selectStory(route.storyId);

  return (
    <div className="skin-lab-shell">
      <section className="skin-lab-note" data-material={theme.material_hooks.summary_strip ?? "parchment-ribbon"}>
        <p className="skin-lab-note__eyebrow">Skin Lab / Story State</p>
        <h1>{story.label}</h1>
        <p>{story.description}</p>
        <div className="skin-lab-note__chips">
          <span>{theme.label}</span>
          {story.coverage.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </section>

      <RendererDesk
        chrome={{
          eyebrow: "Skin Lab / Theme Contract",
          title: "Adventurer's Desk",
          subtitle: story.description,
          modeLabel: "Skin Preview"
        }}
        controls={[
          {
            id: "story",
            label: "Story",
            options: SKIN_LAB_STORIES.map((candidate) => ({
              id: candidate.id,
              label: candidate.label,
              active: story.id === candidate.id
            })),
            onSelect(nextStoryId) {
              setRoute((current) => ({
                ...current,
                storyId: selectStory(nextStoryId).id
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
        error={null}
        loading={false}
        theme={theme}
        uiState={story.uiState}
      />
    </div>
  );
}

export default App;
