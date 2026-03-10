#!/usr/bin/env python3
"""Serve a read-only viewer for derive-ui-state JSON."""

from __future__ import annotations

import argparse
import json
import shlex
import subprocess
import sys
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parents[4]
UI_SYNC_SCRIPT = REPO_ROOT / ".agent_class" / "tools" / "local_cli" / "ui_sync" / "ui_sync.py"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765

HTML_TEMPLATE = """<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Soulforge Read-only UI Prototype</title>
  <style>
__STYLE__
  </style>
</head>
<body>
  <div class="app-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">Soulforge</p>
        <h1>Read-only UI prototype</h1>
        <p class="subtitle">renderer 는 derived state 소비자이며 정본 파일을 직접 읽지 않는다.</p>
      </div>
      <div class="header-actions">
        <button id="refresh-button" class="refresh-button" type="button">Refresh</button>
      </div>
    </header>
    <section id="meta-strip" class="meta-strip"></section>
    <section id="notice-strip" class="notice-strip"></section>
    <nav id="tab-nav" class="tab-nav" aria-label="UI tabs"></nav>
    <main id="tab-panels" class="tab-panels"></main>
    <section class="diagnostics-panel">
      <div class="section-title-row">
        <h2>diagnostics</h2>
      </div>
      <div id="diagnostics-content"></div>
    </section>
  </div>
  <script id="initial-state" type="application/json">__INITIAL_STATE__</script>
  <script>
__SCRIPT__
  </script>
</body>
</html>
"""

STYLE = """
:root {
  color-scheme: light;
  --bg: #f5efe6;
  --bg-accent: #e8ddd0;
  --panel: #fffdf9;
  --surface: #ffffff;
  --border: #d8c8b6;
  --text: #241d17;
  --muted: #6f655b;
  --accent: #0f6c73;
  --accent-soft: rgba(15, 108, 115, 0.12);
  --pass: #2f855a;
  --warn: #b7791f;
  --fail: #c53030;
  --bound: #1f6f57;
  --unbound: #9c6b00;
  --invalid: #c53030;
  --missing: #718096;
  --shadow: 0 18px 40px rgba(36, 29, 23, 0.08);
  --radius: 18px;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background:
    radial-gradient(circle at top left, rgba(15, 108, 115, 0.10), transparent 28rem),
    linear-gradient(180deg, var(--bg) 0%, #f8f3ed 100%);
  color: var(--text);
  font-family: "IBM Plex Sans KR", "IBM Plex Sans", "Pretendard", "Noto Sans KR", sans-serif;
  line-height: 1.5;
}

code,
pre,
.mono {
  font-family: "IBM Plex Mono", "SFMono-Regular", "SF Mono", Consolas, monospace;
}

.app-shell {
  max-width: 1240px;
  margin: 0 auto;
  padding: 32px 20px 56px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 18px;
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1,
h2,
h3 {
  margin: 0;
  font-weight: 700;
}

h1 {
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1.05;
}

h2 {
  font-size: 1rem;
}

h3 {
  font-size: 0.95rem;
}

.subtitle {
  margin: 10px 0 0;
  color: var(--muted);
  max-width: 54rem;
}

.refresh-button {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  padding: 11px 16px;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: var(--shadow);
}

.refresh-button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.meta-strip,
.notice-strip,
.tab-nav,
.tab-panels,
.diagnostics-panel {
  margin-top: 18px;
}

.meta-strip,
.diagnostics-panel,
.panel,
.notice-card {
  background: rgba(255, 253, 249, 0.92);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.meta-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 14px 16px;
}

.meta-item {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  color: var(--muted);
  font-size: 0.92rem;
}

.meta-label {
  color: var(--text);
  font-weight: 600;
}

.meta-command {
  width: 100%;
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  overflow-x: auto;
}

.notice-strip {
  display: grid;
  gap: 12px;
}

.notice-card {
  padding: 14px 16px;
}

.notice-card.is-warn {
  border-color: rgba(183, 121, 31, 0.35);
  background: rgba(255, 248, 235, 0.95);
}

.notice-card.is-fail {
  border-color: rgba(197, 48, 48, 0.35);
  background: rgba(255, 241, 241, 0.95);
}

.tab-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tab-button {
  border: 1px solid var(--border);
  background: rgba(255, 253, 249, 0.88);
  color: var(--text);
  padding: 12px 16px;
  border-radius: 999px;
  cursor: pointer;
}

.tab-button[aria-selected="true"] {
  background: var(--accent);
  border-color: var(--accent);
  color: #ffffff;
}

.tab-button[aria-disabled="true"] {
  opacity: 0.5;
  cursor: default;
}

.tab-panels {
  display: grid;
  gap: 18px;
}

.panel {
  display: none;
  padding: 18px;
}

.panel.is-active {
  display: grid;
  gap: 18px;
}

.section-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.card-grid,
.module-grid,
.project-grid,
.finding-grid,
.workflow-grid,
.summary-grid {
  display: grid;
  gap: 12px;
}

.card-grid,
.summary-grid {
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
}

.module-grid,
.workflow-grid,
.project-grid {
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.finding-grid {
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.card,
.module-card,
.workflow-card,
.project-card,
.finding-card,
.family-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 14px;
}

.card-title {
  margin: 0 0 6px;
  color: var(--muted);
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.card-value {
  font-size: 1.15rem;
  font-weight: 700;
  word-break: break-word;
}

.card-subvalue {
  margin-top: 6px;
  color: var(--muted);
  font-size: 0.92rem;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(216, 200, 182, 0.7);
  text-align: left;
  vertical-align: top;
}

th {
  color: var(--muted);
  font-size: 0.84rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.82rem;
  font-weight: 700;
  background: rgba(113, 128, 150, 0.12);
  color: var(--text);
}

.badge.is-pass {
  background: rgba(47, 133, 90, 0.14);
  color: var(--pass);
}

.badge.is-warn,
.badge.is-unbound {
  background: rgba(183, 121, 31, 0.15);
  color: var(--warn);
}

.badge.is-fail,
.badge.is-invalid {
  background: rgba(197, 48, 48, 0.15);
  color: var(--fail);
}

.badge.is-bound {
  background: rgba(31, 111, 87, 0.14);
  color: var(--bound);
}

.badge.is-missing {
  background: rgba(113, 128, 150, 0.15);
  color: var(--missing);
}

.badge.is-neutral {
  background: var(--accent-soft);
  color: var(--accent);
}

.stack {
  display: grid;
  gap: 10px;
}

.muted {
  color: var(--muted);
}

.inline-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(15, 108, 115, 0.08);
  color: var(--accent);
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 0.84rem;
}

.key-value {
  display: grid;
  gap: 6px;
}

.key-value div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.key-value dt,
.key-value dd {
  margin: 0;
}

.key-value dt {
  color: var(--muted);
}

.empty-state {
  border: 1px dashed var(--border);
  border-radius: 14px;
  padding: 18px;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.7);
}

.finding-card pre,
.meta-command {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 720px) {
  .app-shell {
    padding: 24px 14px 40px;
  }

  .page-header {
    flex-direction: column;
  }

  .meta-strip {
    flex-direction: column;
    align-items: flex-start;
  }

  .tab-nav {
    overflow-x: auto;
    padding-bottom: 4px;
  }
}
"""

SCRIPT = """
(() => {
  const fallbackTabs = [
    { id: "overview", label: "종합(Overview)", enabled: true },
    { id: "body", label: "본체(.agent)", enabled: true },
    { id: "class", label: "직업(.agent_class)", enabled: true },
    { id: "workspaces", label: "워크스페이스(_workspaces)", enabled: true }
  ];

  const initialStateNode = document.getElementById("initial-state");
  const refreshButton = document.getElementById("refresh-button");
  const metaStrip = document.getElementById("meta-strip");
  const noticeStrip = document.getElementById("notice-strip");
  const tabNav = document.getElementById("tab-nav");
  const tabPanels = document.getElementById("tab-panels");
  const diagnosticsContent = document.getElementById("diagnostics-content");

  let viewerState = parseInitialState();
  let activeTab = "overview";

  function parseInitialState() {
    try {
      return JSON.parse(initialStateNode.textContent || "{}");
    } catch (error) {
      return {
        meta: {
          generated_at: null,
          command: null,
          command_exit_code: null,
          stderr: null,
          fatal: "viewer failed to parse embedded state: " + error.message
        },
        payload: null
      };
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function asObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asText(value, fallback = "-") {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }
    return String(value);
  }

  function asCount(value) {
    return typeof value === "number" ? value : 0;
  }

  function toneForStatus(value) {
    switch (String(value)) {
      case "PASS":
      case "resolved":
        return "is-pass";
      case "WARN":
      case "unbound":
        return "is-warn is-unbound";
      case "FAIL":
      case "invalid":
        return "is-fail is-invalid";
      case "bound":
      case "present":
        return "is-bound";
      case "missing":
        return "is-missing";
      default:
        return "is-neutral";
    }
  }

  function statusBadge(value) {
    return `<span class="badge ${toneForStatus(value)}">${escapeHtml(asText(value))}</span>`;
  }

  function booleanCell(value) {
    const label = value === true ? "present" : "missing";
    const raw = value === true ? "true" : "false";
    return `${statusBadge(label)} <span class="mono">${raw}</span>`;
  }

  function emptyState(message) {
    return `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function inlineList(items, emptyMessage) {
    if (!items.length) {
      return emptyState(emptyMessage);
    }
    return `<div class="inline-list">${items.map((item) => `<span class="pill"><code>${escapeHtml(item)}</code></span>`).join("")}</div>`;
  }

  function summaryCard(title, value, subvalue = "") {
    return `
      <article class="card">
        <p class="card-title">${escapeHtml(title)}</p>
        <div class="card-value">${escapeHtml(value)}</div>
        ${subvalue ? `<div class="card-subvalue">${subvalue}</div>` : ""}
      </article>
    `;
  }

  function renderMeta() {
    const meta = asObject(viewerState.meta);
    const payload = asObject(viewerState.payload);
    const overview = asObject(payload.overview);
    const status = asObject(overview.status);
    metaStrip.innerHTML = `
      <div class="meta-item">
        <span class="meta-label">render status</span>
        ${statusBadge(asText(status.result, "FAIL"))}
      </div>
      <div class="meta-item">
        <span class="meta-label">generated</span>
        <span class="mono">${escapeHtml(asText(meta.generated_at))}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">derive exit</span>
        <span class="mono">${escapeHtml(asText(meta.command_exit_code))}</span>
      </div>
      <pre class="meta-command">${escapeHtml(asText(meta.command, "-"))}</pre>
    `;
  }

  function renderNoticeStrip() {
    const meta = asObject(viewerState.meta);
    const notices = [];
    if (meta.command_exit_code && viewerState.payload) {
      notices.push(`
        <div class="notice-card is-warn">
          <strong>Partial render</strong>
          <div class="muted">derive-ui-state returned a non-zero exit code, but the viewer rendered the available JSON payload.</div>
        </div>
      `);
    }
    if (meta.stderr) {
      notices.push(`
        <div class="notice-card is-warn">
          <strong>stderr</strong>
          <pre>${escapeHtml(meta.stderr)}</pre>
        </div>
      `);
    }
    if (meta.fatal) {
      notices.push(`
        <div class="notice-card is-fail">
          <strong>Viewer load failure</strong>
          <div class="muted">${escapeHtml(meta.fatal)}</div>
        </div>
      `);
    }
    noticeStrip.innerHTML = notices.join("");
  }

  function renderTabs(payload) {
    const ui = asObject(payload.ui);
    const tabs = asArray(ui.tabs).length ? asArray(ui.tabs) : fallbackTabs;
    const enabledTabs = tabs.filter((tab) => tab.enabled !== false);
    if (!enabledTabs.some((tab) => tab.id === activeTab) && enabledTabs.length) {
      activeTab = enabledTabs[0].id;
    }
    tabNav.innerHTML = tabs.map((tab) => `
      <button
        type="button"
        class="tab-button"
        data-tab="${escapeHtml(tab.id)}"
        aria-selected="${tab.id === activeTab ? "true" : "false"}"
        aria-disabled="${tab.enabled === false ? "true" : "false"}"
      >
        ${escapeHtml(tab.label)}
      </button>
    `).join("");
    tabNav.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.getAttribute("aria-disabled") === "true") {
          return;
        }
        activeTab = button.getAttribute("data-tab");
        render();
      });
    });
  }

  function renderOverview(payload) {
    const overview = asObject(payload.overview);
    const counts = asObject(overview.counts);
    const installed = asObject(counts.installed);
    const equipped = asObject(counts.equipped);
    const projects = asObject(counts.projects);
    const status = asObject(overview.status);
    return `
      <div class="stack">
        <div class="section-title-row">
          <h2>overview</h2>
          ${statusBadge(asText(status.result, "FAIL"))}
        </div>
        <div class="summary-grid">
          ${summaryCard("body id", asText(overview.body_id))}
          ${summaryCard("class id", asText(overview.class_id))}
          ${summaryCard("active profile", asText(overview.active_profile))}
          ${summaryCard("diagnostics", `${asCount(status.warning_count)} warn / ${asCount(status.error_count)} error`)}
        </div>
        <div class="card-grid">
          ${summaryCard("installed", `skills ${asCount(installed.skills)} / tools ${asCount(installed.tools)}`, `workflows ${asCount(installed.workflows)} / knowledge ${asCount(installed.knowledge)}`)}
          ${summaryCard("equipped", `skills ${asCount(equipped.skills)} / tools ${asCount(equipped.tools)}`, `workflows ${asCount(equipped.workflows)} / knowledge ${asCount(equipped.knowledge)}`)}
          ${summaryCard("projects", `total ${asCount(projects.total)}`, `bound ${asCount(projects.bound)} / unbound ${asCount(projects.unbound)} / invalid ${asCount(projects.invalid)}`)}
          ${summaryCard("body sections present", String(asCount(counts.body_sections_present)))}
        </div>
      </div>
    `;
  }

  function renderBody(payload) {
    const body = asObject(payload.body);
    const sections = asArray(body.sections);
    const sectionTable = sections.length ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>id</th>
              <th>path</th>
              <th>present</th>
            </tr>
          </thead>
          <tbody>
            ${sections.map((section) => `
              <tr>
                <td><code>${escapeHtml(asText(section.id))}</code></td>
                <td><code>${escapeHtml(asText(section.path))}</code></td>
                <td>${booleanCell(section.present === true)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    ` : emptyState("No body sections were derived.");

    return `
      <div class="stack">
        <div class="summary-grid">
          ${summaryCard("body id", asText(body.id))}
          ${summaryCard("name", asText(body.name))}
          ${summaryCard("sections", String(sections.length))}
        </div>
        <div>
          <div class="section-title-row">
            <h2>sections</h2>
          </div>
          ${sectionTable}
        </div>
      </div>
    `;
  }

  function renderModuleCards(modules, emptyMessage) {
    if (!modules.length) {
      return emptyState(emptyMessage);
    }
    return `
      <div class="module-grid">
        ${modules.map((module) => `
          <article class="module-card stack">
            <div>
              <h3>${escapeHtml(asText(module.name, module.id))}</h3>
              <div class="muted"><code>${escapeHtml(asText(module.id))}</code> · v${escapeHtml(asText(module.version, "-"))}</div>
            </div>
            <div class="muted">${escapeHtml(asText(module.description))}</div>
            <div class="key-value">
              <div><span class="muted">manifest_path</span><code>${escapeHtml(asText(module.manifest_path))}</code></div>
              ${module.family ? `<div><span class="muted">family</span><code>${escapeHtml(asText(module.family))}</code></div>` : ""}
              ${module.entrypoint ? `<div><span class="muted">entrypoint</span><code>${escapeHtml(asText(module.entrypoint))}</code></div>` : ""}
            </div>
          </article>
        `).join("")}
      </div>
    `;
  }

  function renderFamilyCards(toolsByFamily) {
    const families = ["adapters", "connectors", "local_cli", "mcp"];
    return `
      <div class="module-grid">
        ${families.map((family) => {
          const tools = asArray(toolsByFamily[family]);
          return `
            <article class="family-card stack">
              <div class="section-title-row">
                <h3>${family}</h3>
                <span class="badge is-neutral">${tools.length}</span>
              </div>
              ${tools.length ? inlineList(tools.map((tool) => asText(tool.id)), "No tools in this family.") : emptyState("No tools in this family.")}
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderWorkflowCards(workflowCards) {
    if (!workflowCards.length) {
      return emptyState("No workflow cards were derived.");
    }
    return `
      <div class="workflow-grid">
        ${workflowCards.map((workflow) => {
          const requires = asObject(workflow.requires);
          return `
            <article class="workflow-card stack">
              <div class="section-title-row">
                <h3>${escapeHtml(asText(workflow.name, workflow.id))}</h3>
                ${statusBadge(asText(workflow.dependency_status, "invalid"))}
              </div>
              <div class="muted"><code>${escapeHtml(asText(workflow.id))}</code></div>
              <div class="key-value">
                <div><span class="muted">entrypoint</span><code>${escapeHtml(asText(workflow.entrypoint))}</code></div>
                <div><span class="muted">equipped</span><span class="mono">${workflow.equipped === true ? "true" : "false"}</span></div>
              </div>
              <div class="stack">
                <div>
                  <div class="muted">requires.skills</div>
                  ${inlineList(asArray(requires.skills).map((item) => asText(item)), "No skill dependencies.")}
                </div>
                <div>
                  <div class="muted">requires.tools</div>
                  ${inlineList(asArray(requires.tools).map((item) => asText(item)), "No tool dependencies.")}
                </div>
                <div>
                  <div class="muted">requires.knowledge</div>
                  ${inlineList(asArray(requires.knowledge).map((item) => asText(item)), "No knowledge dependencies.")}
                </div>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderClass(payload) {
    const classState = asObject(payload.class);
    const installed = asObject(classState.installed);
    const equipped = asObject(classState.equipped);
    const toolsByFamily = asObject(classState.tools_by_family);
    const workflowCards = asArray(classState.workflow_cards);
    const libraryKeys = ["skills", "tools", "workflows", "knowledge"];

    return `
      <div class="stack">
        <div class="summary-grid">
          ${summaryCard("class id", asText(classState.id))}
          ${summaryCard("active profile", asText(classState.active_profile))}
          ${summaryCard("installed total", String(libraryKeys.reduce((sum, key) => sum + asArray(installed[key]).length, 0)))}
          ${summaryCard("equipped total", String(libraryKeys.reduce((sum, key) => sum + asArray(equipped[key]).length, 0)))}
        </div>
        <div class="stack">
          <div class="section-title-row">
            <h2>installed</h2>
          </div>
          ${libraryKeys.map((key) => `
            <section class="stack">
              <div class="section-title-row">
                <h3>${key}</h3>
                <span class="badge is-neutral">${asArray(installed[key]).length}</span>
              </div>
              ${renderModuleCards(asArray(installed[key]), `No installed ${key}.`)}
            </section>
          `).join("")}
        </div>
        <div class="stack">
          <div class="section-title-row">
            <h2>equipped</h2>
          </div>
          ${libraryKeys.map((key) => `
            <section class="stack">
              <div class="section-title-row">
                <h3>${key}</h3>
                <span class="badge is-neutral">${asArray(equipped[key]).length}</span>
              </div>
              ${inlineList(asArray(equipped[key]).map((module) => asText(module.id)), `No equipped ${key}.`)}
            </section>
          `).join("")}
        </div>
        <div class="stack">
          <div class="section-title-row">
            <h2>tools_by_family</h2>
          </div>
          ${renderFamilyCards(toolsByFamily)}
        </div>
        <div class="stack">
          <div class="section-title-row">
            <h2>workflow_cards</h2>
          </div>
          ${renderWorkflowCards(workflowCards)}
        </div>
      </div>
    `;
  }

  function projectCard(project) {
    const contract = asObject(project.contract);
    const warningCount = asArray(project.warnings).length;
    const errorCount = asArray(project.errors).length;
    return `
      <article class="project-card stack">
        <div class="section-title-row">
          <h3><code>${escapeHtml(asText(project.project_path))}</code></h3>
          ${statusBadge(asText(project.state, "invalid"))}
        </div>
        <div class="key-value">
          <div><span class="muted">project_agent_present</span><span class="mono">${project.project_agent_present === true ? "true" : "false"}</span></div>
          <div><span class="muted">contract.project_id</span><code>${escapeHtml(asText(contract.project_id))}</code></div>
          <div><span class="muted">contract.project_name</span><span>${escapeHtml(asText(contract.project_name))}</span></div>
          <div><span class="muted">contract.default_loadout</span><code>${escapeHtml(asText(contract.default_loadout))}</code></div>
          <div><span class="muted">capsule_binding_count</span><span class="mono">${asCount(project.capsule_binding_count)}</span></div>
          <div><span class="muted">workflow_binding_count</span><span class="mono">${asCount(project.workflow_binding_count)}</span></div>
          <div><span class="muted">local_state_entry_count</span><span class="mono">${asCount(project.local_state_entry_count)}</span></div>
          <div><span class="muted">project warnings / errors</span><span class="mono">${warningCount} / ${errorCount}</span></div>
        </div>
      </article>
    `;
  }

  function renderWorkspaceGroup(title, projects) {
    return `
      <section class="stack">
        <div class="section-title-row">
          <h2>${title}</h2>
          <span class="badge is-neutral">${projects.length}</span>
        </div>
        ${projects.length ? `<div class="project-grid">${projects.map((project) => projectCard(project)).join("")}</div>` : emptyState(`No ${title.toLowerCase()} projects were discovered.`)}
      </section>
    `;
  }

  function renderWorkspaces(payload) {
    const workspaces = asObject(payload.workspaces);
    const summary = asObject(workspaces.summary);
    const companyProjects = asArray(asObject(workspaces.company).projects);
    const personalProjects = asArray(asObject(workspaces.personal).projects);
    return `
      <div class="stack">
        <div class="summary-grid">
          ${summaryCard("total", String(asCount(summary.total)))}
          ${summaryCard("bound", String(asCount(summary.bound)), statusBadge("bound"))}
          ${summaryCard("unbound", String(asCount(summary.unbound)), statusBadge("unbound"))}
          ${summaryCard("invalid", String(asCount(summary.invalid)), statusBadge("invalid"))}
        </div>
        ${renderWorkspaceGroup("company.projects", companyProjects)}
        ${renderWorkspaceGroup("personal.projects", personalProjects)}
      </div>
    `;
  }

  function renderFindingGroup(title, items, emptyMessage) {
    if (!items.length) {
      return `
        <section class="stack">
          <div class="section-title-row">
            <h3>${title}</h3>
            <span class="badge is-neutral">0</span>
          </div>
          ${emptyState(emptyMessage)}
        </section>
      `;
    }
    return `
      <section class="stack">
        <div class="section-title-row">
          <h3>${title}</h3>
          <span class="badge is-neutral">${items.length}</span>
        </div>
        <div class="finding-grid">
          ${items.map((item) => `
            <article class="finding-card stack">
              <div class="section-title-row">
                <div class="mono">${escapeHtml(asText(item.code))}</div>
                ${statusBadge(asText(item.level))}
              </div>
              <div>${escapeHtml(asText(item.message))}</div>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderDiagnostics(payload) {
    const diagnostics = asObject(payload.diagnostics);
    const warnings = asArray(diagnostics.warnings);
    const errors = asArray(diagnostics.errors);
    diagnosticsContent.innerHTML = `
      <div class="stack">
        ${renderFindingGroup("warnings", warnings, "No warnings.")}
        ${renderFindingGroup("errors", errors, "No errors.")}
      </div>
    `;
  }

  function renderPanels(payload) {
    tabPanels.innerHTML = `
      <section class="panel ${activeTab === "overview" ? "is-active" : ""}" data-panel="overview">
        ${renderOverview(payload)}
      </section>
      <section class="panel ${activeTab === "body" ? "is-active" : ""}" data-panel="body">
        ${renderBody(payload)}
      </section>
      <section class="panel ${activeTab === "class" ? "is-active" : ""}" data-panel="class">
        ${renderClass(payload)}
      </section>
      <section class="panel ${activeTab === "workspaces" ? "is-active" : ""}" data-panel="workspaces">
        ${renderWorkspaces(payload)}
      </section>
    `;
  }

  function renderFatalState() {
    tabNav.innerHTML = "";
    tabPanels.innerHTML = `
      <section class="panel is-active">
        ${emptyState("Viewer could not load a valid derive-ui-state payload.")}
      </section>
    `;
    diagnosticsContent.innerHTML = emptyState("Diagnostics are unavailable because the viewer could not load a payload.");
  }

  function render() {
    renderMeta();
    renderNoticeStrip();
    if (!viewerState.payload) {
      renderFatalState();
      return;
    }
    renderTabs(viewerState.payload);
    renderPanels(viewerState.payload);
    renderDiagnostics(viewerState.payload);
  }

  async function refreshState() {
    refreshButton.disabled = true;
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("request failed with status " + response.status);
      }
      viewerState = await response.json();
      render();
    } catch (error) {
      viewerState = {
        meta: {
          generated_at: null,
          command: null,
          command_exit_code: null,
          stderr: null,
          fatal: "viewer refresh failed: " + error.message
        },
        payload: null
      };
      render();
    } finally {
      refreshButton.disabled = false;
    }
  }

  refreshButton.addEventListener("click", refreshState);
  render();
})();
"""


def build_command() -> list[str]:
    return [sys.executable, str(UI_SYNC_SCRIPT), "derive-ui-state", "--json"]


def load_viewer_state() -> dict[str, Any]:
    command = build_command()
    meta: dict[str, Any] = {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "command": shlex.join(command),
        "command_exit_code": None,
        "stderr": None,
        "fatal": None,
    }

    if not UI_SYNC_SCRIPT.exists():
        meta["fatal"] = f"missing required script: {UI_SYNC_SCRIPT.relative_to(REPO_ROOT)}"
        return {"meta": meta, "payload": None}

    try:
        completed = subprocess.run(
            command,
            cwd=REPO_ROOT,
            capture_output=True,
            check=False,
            text=True,
            timeout=20,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        meta["fatal"] = f"failed to run derive-ui-state: {error}"
        return {"meta": meta, "payload": None}

    meta["command_exit_code"] = completed.returncode
    meta["stderr"] = completed.stderr.strip() or None
    stdout = completed.stdout.strip()
    if not stdout:
        meta["fatal"] = "derive-ui-state returned no JSON output"
        return {"meta": meta, "payload": None}

    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as error:
        meta["fatal"] = f"failed to parse derive-ui-state JSON: {error}"
        return {"meta": meta, "payload": None}

    return {"meta": meta, "payload": payload}


def render_html(viewer_state: dict[str, Any]) -> str:
    embedded_state = json.dumps(viewer_state, ensure_ascii=False).replace("</", "<\\/")
    return (
        HTML_TEMPLATE.replace("__STYLE__", STYLE.strip())
        .replace("__INITIAL_STATE__", embedded_state)
        .replace("__SCRIPT__", SCRIPT.strip())
    )


class ViewerRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/":
            self.respond_html(render_html(load_viewer_state()))
            return
        if path == "/api/state":
            self.respond_json(load_viewer_state())
            return
        if path == "/healthz":
            self.respond_json({"status": "ok"})
            return
        self.send_error(HTTPStatus.NOT_FOUND, "not found")

    def respond_html(self, body: str, status: HTTPStatus = HTTPStatus.OK) -> None:
        encoded = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def respond_json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        encoded = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Serve a read-only local viewer for derive-ui-state JSON."
    )
    parser.add_argument(
        "--host",
        default=DEFAULT_HOST,
        help=f"Host interface to bind the HTTP viewer. Default: {DEFAULT_HOST}",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"TCP port to bind the HTTP viewer. Default: {DEFAULT_PORT}",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Render a standalone HTML snapshot once instead of starting the HTTP server.",
    )
    parser.add_argument(
        "--output",
        help="Optional output path for --once. If omitted, HTML is written to stdout.",
    )
    return parser


def run_once(output_path: str | None) -> int:
    viewer_state = load_viewer_state()
    html = render_html(viewer_state)

    if output_path:
        target = Path(output_path)
        target.write_text(html, encoding="utf-8")
        print(target)
    else:
        sys.stdout.write(html)

    return 1 if viewer_state["payload"] is None else 0


def run_server(host: str, port: int) -> int:
    server = ThreadingHTTPServer((host, port), ViewerRequestHandler)
    print(f"Serving Soulforge read-only UI prototype at http://{host}:{port}")
    print(f"Source command: {shlex.join(build_command())}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping viewer.")
    finally:
        server.server_close()
    return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.once:
        return run_once(args.output)
    return run_server(args.host, args.port)


if __name__ == "__main__":
    sys.exit(main())
