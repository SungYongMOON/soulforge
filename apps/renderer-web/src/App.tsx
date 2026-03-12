import { startTransition, useEffect, useReducer, useState } from "react";
import {
  TAB_LABELS,
  TAB_ORDER,
  buildCatalogSections,
  buildDiagnosticsTone,
  buildOverviewMetrics,
  buildRowGroups,
  buildWorkspaceGroups,
  catalogKey,
  createInitialSelectionState,
  findRenderableEntity,
  loadUiState,
  rowKey,
  selectionReducer,
  type FixtureName,
  type RowId,
  type UiState,
  type UiStateRequest
} from "@soulforge/renderer-core";

const FIXTURE_OPTIONS: FixtureName[] = ["integrated", "overview", "body", "class", "workspaces"];

function requestFromSearch(search: string): UiStateRequest {
  const params = new URLSearchParams(search);
  const mode = params.get("mode");
  const fixture = params.get("fixture") as FixtureName | null;
  const url = params.get("url");

  if (mode === "integration") {
    return {
      kind: "url",
      url: url || "/api/ui-state"
    };
  }

  return {
    kind: "fixture",
    fixture: fixture && FIXTURE_OPTIONS.includes(fixture) ? fixture : "integrated"
  };
}

function App() {
  const [request, setRequest] = useState<UiStateRequest>(() => requestFromSearch(window.location.search));
  const [uiState, setUiState] = useState<UiState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, dispatch] = useReducer(selectionReducer, createInitialSelectionState("overview"));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadUiState(request)
      .then((nextState) => {
        if (cancelled) {
          return;
        }

        setUiState(nextState);
        dispatch({
          type: "reset",
          activeTab: (nextState.ui_hints.default_tab as typeof selection.activeTab) || "overview"
        });
      })
      .catch((loadError: unknown) => {
        if (cancelled) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Failed to load UI state.");
        setUiState(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [request]);

  const metrics = uiState ? buildOverviewMetrics(uiState) : [];
  const rowGroups = uiState ? buildRowGroups(uiState.class_view) : [];
  const catalogSections = uiState ? buildCatalogSections(uiState) : [];
  const workspaceGroups = uiState ? buildWorkspaceGroups(uiState) : [];
  const activeCatalogSection =
    catalogSections.find((section) => section.id === selection.openedCatalog) ?? catalogSections[0] ?? null;
  const selectedEntity = uiState
    ? findRenderableEntity(uiState, selection.previewCandidateKey ?? selection.selectedItemKey)
    : null;
  const diagnosticsTone = uiState ? buildDiagnosticsTone(uiState.diagnostics) : "ready";

  function setFixture(fixture: FixtureName) {
    startTransition(() => {
      setRequest({
        kind: "fixture",
        fixture
      });
    });
  }

  function setIntegrationMode() {
    startTransition(() => {
      setRequest({
        kind: "url",
        url: "/api/ui-state"
      });
    });
  }

  function renderMainContent() {
    if (!uiState) {
      return null;
    }

    if (selection.activeTab === "body") {
      return (
        <section className="main-grid body-grid">
          {uiState.body.section_presence.map((section) => (
            <button
              className="section-card"
              key={section.id}
              type="button"
              onClick={() => dispatch({ type: "select-item", key: `row:body:${section.id}` })}
            >
              <div className="section-card__title">
                <span>{section.id}</span>
                <StatusPill tone={section.status}>{section.status}</StatusPill>
              </div>
              <p>{section.path}</p>
            </button>
          ))}
        </section>
      );
    }

    if (selection.activeTab === "workspaces") {
      return (
        <section className="workspace-grid">
          {workspaceGroups.map((group) => (
            <div className="workspace-column" key={group.id}>
              <div className="panel-heading">
                <h3>{group.label}</h3>
                <span>{group.projects.length} projects</span>
              </div>
              {group.projects.map((project) => (
                <article className="workspace-card" key={`${group.id}:${project.project_path}`}>
                  <div className="workspace-card__top">
                    <h4>{project.project_name || project.project_path}</h4>
                    <StatusPill tone={project.binding_status}>{project.state}</StatusPill>
                  </div>
                  <p className="workspace-card__path">{project.project_path}</p>
                  <div className="workspace-card__stats">
                    <span>Capsules {project.capsule_binding_count}</span>
                    <span>Flows {project.workflow_binding_count}</span>
                    <span>Local {project.local_state_entry_count}</span>
                  </div>
                </article>
              ))}
            </div>
          ))}
        </section>
      );
    }

    return (
      <section className="row-surface">
        {rowGroups.map((group) => (
          <div className="row-group" key={group.id}>
            <div className="panel-heading">
              <div className="panel-heading__title">
                <Glyph kind={group.icon} />
                <div>
                  <h3>{group.label}</h3>
                  <p>{group.hint}</p>
                </div>
              </div>
              <button
                className="text-button"
                type="button"
                onClick={() => dispatch({ type: "open-catalog", catalog: group.id })}
              >
                Browse Catalog
              </button>
            </div>
            <div className={`card-list card-list--${group.id}`}>
              {group.items.map((item) => (
                <button
                  className="asset-card"
                  key={item.id}
                  type="button"
                  onClick={() => dispatch({ type: "select-item", key: rowKey(group.id as RowId, item.id) })}
                >
                  <div className="asset-card__title">
                    <span>{item.display_name}</span>
                    {item.family ? <span className="family-pill">{item.family}</span> : null}
                  </div>
                  <p>{item.summary}</p>
                  <div className="asset-card__badges">
                    <Badge active={item.installed}>Installed</Badge>
                    <Badge active={item.equipped}>Equipped</Badge>
                    <Badge active={item.required === true}>Required</Badge>
                    <Badge active={item.preferred === true}>Preferred</Badge>
                  </div>
                </button>
              ))}
              {group.items.length === 0 ? <EmptyTile label="No installed asset yet." /> : null}
            </div>
          </div>
        ))}
      </section>
    );
  }

  return (
    <div className="app-shell">
      <header className="top-frame">
        <div>
          <p className="eyebrow">Renderer v1</p>
          <h1>Adventurer&apos;s Desk</h1>
          <p className="subtitle">Portable read-only renderer for derived Soulforge state.</p>
        </div>
        <div className="toolbar">
          <button
            className={request.kind === "fixture" ? "mode-button is-active" : "mode-button"}
            type="button"
            onClick={() => setFixture(request.fixture || "integrated")}
          >
            Fixture Mode
          </button>
          <button
            className={request.kind === "url" ? "mode-button is-active" : "mode-button"}
            type="button"
            onClick={setIntegrationMode}
          >
            Integration Mode
          </button>
          <div className="fixture-switcher">
            {FIXTURE_OPTIONS.map((fixture) => (
              <button
                className={request.fixture === fixture && request.kind === "fixture" ? "fixture-button is-active" : "fixture-button"}
                key={fixture}
                type="button"
                onClick={() => setFixture(fixture)}
              >
                {fixture}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="desk-layout">
        <aside className="left-panel">
          {uiState ? (
            <>
              <div className="character-card">
                <div className="character-card__header">
                  <p className="eyebrow">Body / Character</p>
                  <StatusPill tone={uiState.body.meta.status}>{uiState.body.meta.status}</StatusPill>
                </div>
                <SilhouettePlate />
                <div className="identity-block">
                  <h2>{uiState.body.meta.display_name}</h2>
                  <p>{uiState.overview.active_species?.display_name ?? "Species pending from producer"}</p>
                  <p className="muted">{uiState.overview.active_hero?.display_name ?? "No active hero overlay"}</p>
                </div>
                <div className="binding-list">
                  <div>
                    <span>Class Binding</span>
                    <strong>{uiState.body.current_bindings.class_binding.class_id ?? "Unbound"}</strong>
                  </div>
                  <div>
                    <span>Profile</span>
                    <strong>{uiState.body.current_bindings.class_binding.active_profile ?? "None"}</strong>
                  </div>
                  <div>
                    <span>Workspace</span>
                    <strong>{uiState.workspaces.summary.binding_status}</strong>
                  </div>
                </div>
              </div>

              <div className="catalog-card">
                <div className="panel-heading">
                  <h3>Catalog Shelf</h3>
                  <span>Preview only</span>
                </div>
                <div className="catalog-section-switcher">
                  {catalogSections.map((section) => (
                    <button
                      className={selection.openedCatalog === section.id ? "fixture-button is-active" : "fixture-button"}
                      key={section.id}
                      type="button"
                      onClick={() => dispatch({ type: "open-catalog", catalog: section.id })}
                    >
                      {section.label}
                    </button>
                  ))}
                </div>
                {activeCatalogSection?.items.map((item) => (
                  <button
                    className="catalog-pill"
                    key={`${activeCatalogSection.id}:${item.id}`}
                    type="button"
                    onClick={() => dispatch({ type: "preview-candidate", key: catalogKey(activeCatalogSection.id, item.id) })}
                  >
                    {item.display_name}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <EmptyState label="UI state has not loaded yet." />
          )}
        </aside>

        <main className="main-panel">
          <nav className="tab-row" aria-label="Root tabs">
            {TAB_ORDER.map((tab) => (
              <button
                className={selection.activeTab === tab ? "tab-button is-active" : "tab-button"}
                key={tab}
                type="button"
                onClick={() => dispatch({ type: "tab", tab })}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </nav>

          <section className={`summary-strip tone-${diagnosticsTone}`}>
            {uiState ? (
              <>
                <div className="summary-strip__metrics">
                  {metrics.map((metric) => (
                    <article className={`metric-card tone-${metric.tone}`} key={metric.id}>
                      <span>{metric.label}</span>
                      <strong>{metric.value}</strong>
                    </article>
                  ))}
                </div>
                <button className="diagnostics-button" type="button" onClick={() => dispatch({ type: "focus-diagnostics" })}>
                  Diagnostics {uiState.diagnostics.summary.warnings}W / {uiState.diagnostics.summary.errors}E
                </button>
              </>
            ) : (
              <p className="muted">Waiting for renderer state.</p>
            )}
          </section>

          {loading ? <EmptyState label="Loading renderer state..." /> : null}
          {error ? <ErrorState label={error} /> : null}
          {!loading && !error ? renderMainContent() : null}
        </main>
      </div>

      <footer className="info-dock">
        {uiState ? (
          <>
            <div className="dock-section">
              <div className="panel-heading">
                <h3>Info Dock</h3>
                <span>{selection.infoDockSection}</span>
              </div>
              {selectedEntity ? (
                <>
                  <h4>{selectedEntity.title}</h4>
                  <p>{selectedEntity.summary}</p>
                  <div className="asset-card__badges">
                    {selectedEntity.badges.map((badge) => (
                      <Badge active key={badge}>
                        {badge}
                      </Badge>
                    ))}
                  </div>
                  <p className="dock-source">{selectedEntity.sourceRef || "No source hint available."}</p>
                </>
              ) : (
                <>
                  <h4>{TAB_LABELS[selection.activeTab]}</h4>
                  <p>{uiState.overview.status_note || "Read-only viewer surface. Selection lives only in local state."}</p>
                  <p className="dock-source">{uiState.source.producer} / {uiState.source.mode}</p>
                </>
              )}
            </div>

            <div className="dock-section">
              <div className="panel-heading">
                <h3>Diagnostics</h3>
                <StatusPill tone={diagnosticsTone}>{diagnosticsTone}</StatusPill>
              </div>
              {uiState.diagnostics.warnings.length === 0 && uiState.diagnostics.errors.length === 0 ? (
                <p className="muted">No diagnostics.</p>
              ) : (
                <>
                  {uiState.diagnostics.warnings.map((item) => (
                    <article className="telegram warning" key={`warning:${item.code}`}>
                      <strong>{item.code}</strong>
                      <p>{item.message}</p>
                    </article>
                  ))}
                  {uiState.diagnostics.errors.map((item) => (
                    <article className="telegram error" key={`error:${item.code}`}>
                      <strong>{item.code}</strong>
                      <p>{item.message}</p>
                    </article>
                  ))}
                </>
              )}
            </div>
          </>
        ) : (
          <EmptyState label="No info dock content yet." />
        )}
      </footer>
    </div>
  );
}

function Glyph({ kind }: { kind: string }) {
  return (
    <span className={`glyph glyph-${kind}`} aria-hidden="true">
      {kind === "orb" ? "◌" : kind === "hook" ? "⌁" : kind === "spine" ? "▥" : kind === "combo" ? "⟡" : "•"}
    </span>
  );
}

function Badge({ active, children }: { active: boolean; children: string }) {
  return <span className={active ? "badge is-active" : "badge"}>{children}</span>;
}

function StatusPill({ tone, children }: { tone: string; children: string }) {
  return <span className={`status-pill tone-${tone}`}>{children}</span>;
}

function SilhouettePlate() {
  return (
    <div className="silhouette-plate" aria-hidden="true">
      <div className="silhouette silhouette-head" />
      <div className="silhouette silhouette-body" />
      <div className="silhouette silhouette-base" />
    </div>
  );
}

function EmptyTile({ label }: { label: string }) {
  return <div className="empty-tile">{label}</div>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="empty-state">{label}</div>;
}

function ErrorState({ label }: { label: string }) {
  return <div className="empty-state error-state">{label}</div>;
}

export default App;
