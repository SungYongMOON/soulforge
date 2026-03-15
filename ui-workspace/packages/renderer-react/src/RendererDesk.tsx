import { useEffect, useReducer } from "react";
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
  rowKey,
  selectionReducer
} from "@soulforge/renderer-core";
import type { ThemeManifest } from "@soulforge/theme-contract";
import type { RowId, RowItem, StatusTone, UiState } from "@soulforge/ui-contract";

export interface RendererDeskControlOption {
  id: string;
  label: string;
  active: boolean;
}

export interface RendererDeskControlGroup {
  id: string;
  label: string;
  options: RendererDeskControlOption[];
  onSelect(nextId: string): void;
}

export interface RendererDeskChrome {
  eyebrow: string;
  title: string;
  subtitle: string;
  modeLabel: string;
}

export interface RendererDeskProps {
  uiState: UiState | null;
  loading: boolean;
  error: string | null;
  theme: ThemeManifest;
  chrome?: Partial<RendererDeskChrome>;
  controls?: RendererDeskControlGroup[];
}

const DEFAULT_CHROME: RendererDeskChrome = {
  eyebrow: "UI Workspace / Renderer v1",
  title: "Adventurer's Desk",
  subtitle: "Read-only renderer surface. Theme packages remain swappable through the theme contract.",
  modeLabel: "Renderer Surface"
};

export function RendererDesk({ uiState, loading, error, theme, chrome, controls = [] }: RendererDeskProps) {
  const [selection, dispatch] = useReducer(selectionReducer, createInitialSelectionState("overview"));
  const resolvedChrome = { ...DEFAULT_CHROME, ...chrome };

  useEffect(() => {
    dispatch({
      type: "reset",
      activeTab: (uiState?.ui_hints.default_tab as typeof selection.activeTab | undefined) || "overview"
    });
  }, [uiState]);

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
              data-material={theme.material_hooks.card ?? "paper-card"}
              data-status-tone={section.status}
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
            <div
              className="workspace-column"
              data-material={theme.material_hooks.card ?? "paper-card"}
              key={group.id}
            >
              <div className="panel-heading">
                <h3>{group.label}</h3>
                <span>{group.projects.length} projects</span>
              </div>
              {group.projects.map((project) => (
                <article
                  className="workspace-card"
                  data-status-tone={project.binding_status}
                  key={`${group.id}:${project.project_path}`}
                >
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
        {rowGroups.map((group) => {
          const rowMaterial = materialForRow(uiState, theme, group.id, group.material);
          const rowIcon = iconForRow(uiState, theme, group.id, group.icon);

          return (
            <div className="row-group" data-material={rowMaterial} key={group.id}>
              <div className="panel-heading">
                <div className="panel-heading__title">
                  <Glyph kind={rowIcon} material={rowMaterial} />
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
                    data-asset-state={assetState(item)}
                    data-dependency-status={item.dependency_status ?? "none"}
                    data-material={rowMaterial}
                    key={item.id}
                    type="button"
                    onClick={() => dispatch({ type: "select-item", key: rowKey(group.id as RowId, item.id) })}
                  >
                    <div className="asset-card__title">
                      <div className="asset-card__lead">
                        <Glyph kind={rowIcon} material={rowMaterial} />
                        <span>{item.display_name}</span>
                      </div>
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
          );
        })}
      </section>
    );
  }

  return (
    <div className="app-shell" data-theme-family={theme.family} data-theme-id={theme.id} data-theme-phase={theme.phase}>
      <header className="top-frame" data-material={theme.material_hooks.frame ?? "atlas-frame"}>
        <div>
          <p className="eyebrow">{resolvedChrome.eyebrow}</p>
          <h1>{resolvedChrome.title}</h1>
          <p className="subtitle">{resolvedChrome.subtitle}</p>
        </div>
        <div className="toolbar">
          <div className="toolbar-chip-row">
            <div className="mode-chip">{resolvedChrome.modeLabel}</div>
            <div className="mode-chip mode-chip--secondary">{theme.label}</div>
            <div className="mode-chip mode-chip--secondary">{theme.phase}</div>
          </div>
          {controls.map((group) => (
            <div className="toolbar-group" data-control-group={group.id} key={group.id}>
              <span className="toolbar-group__label">{group.label}</span>
              <div className="fixture-switcher">
                {group.options.map((option) => (
                  <button
                    className={option.active ? "fixture-button is-active" : "fixture-button"}
                    key={option.id}
                    type="button"
                    onClick={() => group.onSelect(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </header>

      <div className="desk-layout">
        <aside className="left-panel" data-material={theme.material_hooks.panel ?? "parchment-panel"}>
          {uiState ? (
            <>
              <div className="character-card" data-material={theme.material_hooks.card ?? "paper-card"}>
                <div className="character-card__header">
                  <p className="eyebrow">Body / Character</p>
                  <StatusPill tone={uiState.body.meta.status}>{uiState.body.meta.status}</StatusPill>
                </div>
                <SilhouettePlate material={theme.material_hooks.character_plate ?? "silhouette-plinth"} />
                <div className="identity-block">
                  <h2>{uiState.body.meta.display_name}</h2>
                  <p>{uiState.overview.active_species?.display_name ?? "Species pending from fixture"}</p>
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

              <div className="catalog-card" data-material={theme.material_hooks.catalog ?? "bookshelf-spine"}>
                <div className="panel-heading">
                  <h3>Catalog Shelf</h3>
                  <span>Read-only preview</span>
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
                    data-asset-state={item.active ? "active" : item.candidate ? "installed" : "unknown"}
                    data-material={theme.material_hooks.catalog ?? "bookshelf-spine"}
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

        <main className="main-panel" data-material={theme.material_hooks.panel ?? "parchment-panel"}>
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

          <section
            className={`summary-strip tone-${diagnosticsTone}`}
            data-material={theme.material_hooks.summary_strip ?? "parchment-ribbon"}
            data-status-tone={diagnosticsTone}
          >
            {uiState ? (
              <>
                <div className="summary-strip__metrics">
                  {metrics.map((metric) => (
                    <article className={`metric-card tone-${metric.tone}`} data-status-tone={metric.tone} key={metric.id}>
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

      <footer className="info-dock" data-material={theme.material_hooks.info_dock ?? "leather-folio"}>
        {uiState ? (
          <>
            <div className="dock-section" data-material={theme.material_hooks.info_dock ?? "leather-folio"}>
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
                  <p>{uiState.overview.status_note || "Selection stays local to the React surface and never writes back to canonical state."}</p>
                  <p className="dock-source">
                    {uiState.source.producer} / {uiState.source.mode}
                  </p>
                </>
              )}
            </div>

            <div
              className="dock-section"
              data-material={theme.material_hooks.diagnostics ?? "warning-paper"}
              data-status-tone={diagnosticsTone}
            >
              <div className="panel-heading">
                <h3>Diagnostics</h3>
                <StatusPill tone={diagnosticsTone}>{diagnosticsTone}</StatusPill>
              </div>
              {uiState.diagnostics.warnings.length === 0 && uiState.diagnostics.errors.length === 0 ? (
                <p className="muted">No diagnostics.</p>
              ) : (
                <>
                  {uiState.diagnostics.warnings.map((item) => (
                    <article
                      className="telegram warning"
                      data-material={theme.material_hooks.diagnostics ?? "warning-paper"}
                      key={`warning:${item.code}`}
                    >
                      <strong>{item.code}</strong>
                      <p>{item.message}</p>
                    </article>
                  ))}
                  {uiState.diagnostics.errors.map((item) => (
                    <article
                      className="telegram error"
                      data-material={theme.material_hooks.diagnostics ?? "warning-paper"}
                      key={`error:${item.code}`}
                    >
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

function materialForRow(uiState: UiState, theme: ThemeManifest, rowId: RowId, fallback: string) {
  const hint = uiState.ui_hints.material_hints[rowId];
  if (typeof hint === "string" && hint.length > 0) {
    return hint;
  }

  const semanticKey = `${rowId}_row` as const;
  const themeHook = theme.material_hooks[semanticKey];
  return themeHook ?? fallback;
}

function iconForRow(uiState: UiState, theme: ThemeManifest, rowId: RowId, fallback: string) {
  const hint = uiState.ui_hints.icon_hints[rowId];
  if (typeof hint === "string" && hint.length > 0) {
    return hint;
  }

  return theme.icon_hooks[rowId] ?? fallback;
}

function assetState(item: RowItem) {
  if (item.dependency_status === "invalid") {
    return "invalid";
  }
  if (item.required) {
    return "required";
  }
  if (item.active || item.equipped) {
    return "active";
  }
  if (item.preferred) {
    return "preferred";
  }
  if (item.installed) {
    return "installed";
  }
  if (item.dependency_status === "partial") {
    return "partial";
  }
  return "unknown";
}

function Glyph({ kind, material }: { kind: string; material: string }) {
  const symbol = kind === "orb" ? "◌" : kind === "hook" ? "⌁" : kind === "spine" ? "▥" : kind === "combo" ? "⟡" : kind === "compass" ? "✦" : "•";

  return (
    <span className={`glyph glyph-${kind}`} data-icon-kind={kind} data-material={material} aria-hidden="true">
      <span className="glyph__symbol">{symbol}</span>
    </span>
  );
}

function Badge({ active, children }: { active: boolean; children: string }) {
  return <span className={active ? "badge is-active" : "badge"}>{children}</span>;
}

function StatusPill({ tone, children }: { tone: StatusTone | string; children: string }) {
  return (
    <span className={`status-pill tone-${tone}`} data-status-tone={tone}>
      {children}
    </span>
  );
}

function SilhouettePlate({ material }: { material: string }) {
  return (
    <div className="silhouette-plate" data-material={material} aria-hidden="true">
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
