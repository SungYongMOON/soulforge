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


REPO_ROOT = Path(__file__).resolve().parents[2]
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
      <div class="header-copy">
        <p class="eyebrow"><span class="header-seal">✦</span><span>Soulforge renderer</span></p>
        <h1>Read-only field codex</h1>
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
      <div class="section-heading">
        <div class="section-copy">
          <p class="section-kicker"><span class="glyph">🕯</span><span>diagnostics</span></p>
          <p class="section-subtitle">Warnings and failures carried forward from validate.</p>
        </div>
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
  --paper: #f3eadc;
  --paper-edge: #e4d6c1;
  --paper-strong: #fbf7ef;
  --slate: #48565c;
  --slate-soft: #66757b;
  --ink: #221c17;
  --ink-soft: #6b625a;
  --border: rgba(126, 108, 86, 0.24);
  --border-strong: rgba(126, 108, 86, 0.42);
  --brass: #8b6b34;
  --brass-soft: rgba(139, 107, 52, 0.12);
  --teal: #2f6d6b;
  --teal-soft: rgba(47, 109, 107, 0.13);
  --moss: #5c6c50;
  --moss-soft: rgba(92, 108, 80, 0.13);
  --burgundy: #7a413c;
  --burgundy-soft: rgba(122, 65, 60, 0.12);
  --pass: #466745;
  --warn: #8b6b34;
  --fail: #8a3f3a;
  --bound: #2f6d6b;
  --unbound: #9a6f2c;
  --invalid: #7a413c;
  --missing: #71757a;
  --shadow: 0 20px 50px rgba(34, 28, 23, 0.08);
  --shadow-soft: 0 10px 24px rgba(34, 28, 23, 0.05);
  --radius: 20px;
  --radius-sm: 14px;
  --heading-font: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", "Noto Serif KR", serif;
  --body-font: "IBM Plex Sans KR", "IBM Plex Sans", "Pretendard", "Noto Sans KR", sans-serif;
  --mono-font: "IBM Plex Mono", "SFMono-Regular", "SF Mono", Consolas, monospace;
}

* {
  box-sizing: border-box;
}

html {
  background: #ede4d7;
}

body {
  margin: 0;
  background:
    radial-gradient(circle at top left, rgba(47, 109, 107, 0.11), transparent 24rem),
    radial-gradient(circle at top right, rgba(139, 107, 52, 0.08), transparent 28rem),
    linear-gradient(180deg, #f6efe3 0%, #f0e7da 100%);
  color: var(--ink);
  font-family: var(--body-font);
  line-height: 1.55;
}

button,
input,
select,
textarea {
  font: inherit;
}

code,
pre,
.mono {
  font-family: var(--mono-font);
}

.app-shell {
  max-width: 1280px;
  margin: 0 auto;
  padding: 28px 20px 60px;
}

.app-shell > * {
  min-width: 0;
}

h1,
h2,
h3,
.card-value,
.meta-value,
.state-count {
  font-family: var(--heading-font);
  letter-spacing: 0.01em;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 18px;
  padding: 22px 24px;
  background:
    radial-gradient(circle at top left, rgba(47, 109, 107, 0.12), transparent 20rem),
    radial-gradient(circle at bottom right, rgba(139, 107, 52, 0.10), transparent 18rem),
    var(--paper-strong);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-soft);
}

.header-copy {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.eyebrow {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--brass-soft);
  color: var(--brass);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.header-seal {
  font-size: 0.95rem;
}

h1,
h2,
h3 {
  margin: 0;
  font-weight: 700;
}

h1 {
  font-size: clamp(2.2rem, 4vw, 3.35rem);
  line-height: 0.98;
}

h2 {
  font-size: 1.08rem;
}

h3 {
  font-size: 1.02rem;
}

.subtitle {
  margin: 0;
  color: var(--ink-soft);
  max-width: 62rem;
}

.header-actions {
  display: flex;
  align-items: flex-start;
}

.refresh-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid rgba(72, 86, 92, 0.16);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(244, 237, 226, 0.96));
  color: var(--ink);
  padding: 12px 18px;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: var(--shadow-soft);
  transition: transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
}

.refresh-button:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: var(--border-strong);
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
.notice-strip,
.hero-grid,
.summary-grid,
.card-grid,
.module-grid,
.workflow-grid,
.project-grid,
.finding-grid,
.loadout-grid,
.project-file-grid,
.family-grid,
.dependency-grid {
  display: grid;
  gap: 14px;
}

.meta-strip {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.meta-card,
.notice-card,
.panel,
.diagnostics-panel,
.card,
.module-card,
.workflow-card,
.project-card,
.finding-card,
.family-card,
.loadout-card,
.file-card,
.table-shell {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.66), rgba(255, 255, 255, 0.2)),
    var(--paper-strong);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-soft);
}

.meta-card,
.card,
.module-card,
.workflow-card,
.project-card,
.finding-card,
.family-card,
.loadout-card,
.file-card {
  position: relative;
  padding: 16px;
  display: grid;
  gap: 12px;
  min-width: 0;
  overflow: hidden;
}

.meta-card::before,
.card::before,
.module-card::before,
.workflow-card::before,
.project-card::before,
.finding-card::before,
.family-card::before,
.loadout-card::before {
  content: "";
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  background: linear-gradient(90deg, rgba(139, 107, 52, 0.55), rgba(47, 109, 107, 0.35));
}

.tone-pass {
  border-color: rgba(92, 108, 80, 0.34);
}

.tone-pass::before {
  background: linear-gradient(90deg, rgba(92, 108, 80, 0.65), rgba(47, 109, 107, 0.25));
}

.tone-bound {
  border-color: rgba(47, 109, 107, 0.32);
}

.tone-bound::before {
  background: linear-gradient(90deg, rgba(47, 109, 107, 0.68), rgba(92, 108, 80, 0.28));
}

.tone-unbound {
  border-color: rgba(139, 107, 52, 0.32);
}

.tone-unbound::before {
  background: linear-gradient(90deg, rgba(139, 107, 52, 0.7), rgba(72, 86, 92, 0.24));
}

.tone-invalid,
.tone-fail {
  border-color: rgba(122, 65, 60, 0.34);
}

.tone-invalid::before,
.tone-fail::before {
  background: linear-gradient(90deg, rgba(122, 65, 60, 0.72), rgba(139, 107, 52, 0.22));
}

.meta-card--command {
  grid-column: 1 / -1;
}

.meta-item {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  color: var(--ink-soft);
  font-size: 0.92rem;
}

.meta-label {
  color: var(--ink-soft);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.meta-value-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.meta-value {
  font-size: clamp(1.2rem, 2vw, 1.55rem);
  line-height: 1.1;
}

.meta-note {
  color: var(--ink-soft);
  font-size: 0.92rem;
}

.meta-command,
.path-block,
.module-id,
.project-path,
.finding-code {
  margin: 0;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(72, 86, 92, 0.1);
  background: rgba(72, 86, 92, 0.05);
  overflow: auto;
  max-width: 100%;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.notice-strip {
  display: grid;
  gap: 12px;
}

.notice-card {
  padding: 14px 16px;
  display: grid;
  gap: 8px;
}

.notice-card.is-warn {
  border-color: rgba(139, 107, 52, 0.35);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.64), rgba(255, 255, 255, 0.18)),
    #fdf7ec;
}

.notice-card.is-fail {
  border-color: rgba(122, 65, 60, 0.35);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.62), rgba(255, 255, 255, 0.18)),
    #fdf0ee;
}

.tab-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tab-button {
  border: 1px solid var(--border);
  background: rgba(255, 251, 244, 0.9);
  color: var(--ink);
  padding: 12px 16px;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: var(--shadow-soft);
}

.tab-button[aria-selected="true"] {
  background: linear-gradient(180deg, var(--teal), #245a58);
  border-color: rgba(36, 90, 88, 0.95);
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
  padding: 20px;
}

.panel.is-active {
  display: grid;
  gap: 20px;
}

.section-heading,
.surface-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.section-copy,
.surface-title-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.section-kicker,
.surface-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--teal);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.surface-label {
  color: var(--brass);
}

.section-subtitle,
.surface-subtitle {
  color: var(--ink-soft);
  max-width: 64rem;
  overflow-wrap: anywhere;
}

.section-anchor,
.badge-cluster,
.inline-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  align-items: center;
}

.hero-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.summary-grid,
.card-grid {
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.module-grid,
.workflow-grid,
.project-grid {
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

.finding-grid {
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.loadout-grid,
.family-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.project-file-grid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.dependency-grid {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  min-width: 1.25rem;
  font-size: 1rem;
  line-height: 1;
}

.card-heading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.card-title {
  margin: 0;
  color: var(--ink-soft);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.card-value {
  font-size: clamp(1.12rem, 1.8vw, 1.55rem);
  font-weight: 700;
  line-height: 1.12;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.card-subvalue {
  color: var(--ink-soft);
  font-size: 0.92rem;
  overflow-wrap: anywhere;
}

.stack {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.table-shell {
  padding: 4px 0 0;
  overflow: hidden;
}

.table-wrap {
  overflow: auto;
  max-width: 100%;
}

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

th,
td {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(126, 108, 86, 0.14);
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
  word-break: break-word;
}

th {
  color: var(--ink-soft);
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: rgba(72, 86, 92, 0.04);
}

tbody tr:last-child td {
  border-bottom: none;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 5px 11px;
  font-size: 0.79rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  background: rgba(72, 86, 92, 0.08);
  color: var(--slate);
  border: 1px solid rgba(72, 86, 92, 0.12);
}

.badge.is-pass,
.badge.is-resolved {
  background: rgba(92, 108, 80, 0.14);
  color: var(--pass);
  border-color: rgba(92, 108, 80, 0.18);
}

.badge.is-warn,
.badge.is-unbound {
  background: rgba(139, 107, 52, 0.14);
  color: var(--warn);
  border-color: rgba(139, 107, 52, 0.18);
}

.badge.is-fail,
.badge.is-invalid {
  background: rgba(122, 65, 60, 0.14);
  color: var(--fail);
  border-color: rgba(122, 65, 60, 0.18);
}

.badge.is-bound,
.badge.is-equipped {
  background: rgba(47, 109, 107, 0.14);
  color: var(--bound);
  border-color: rgba(47, 109, 107, 0.18);
}

.badge.is-missing {
  background: rgba(113, 117, 122, 0.12);
  color: var(--missing);
  border-color: rgba(113, 117, 122, 0.18);
}

.badge.is-neutral,
.badge.is-catalog {
  background: var(--brass-soft);
  color: var(--brass);
  border-color: rgba(139, 107, 52, 0.18);
}

.muted {
  color: var(--ink-soft);
  overflow-wrap: anywhere;
}

.inline-list {
  align-items: stretch;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  background: rgba(47, 109, 107, 0.08);
  color: var(--teal);
  border: 1px solid rgba(47, 109, 107, 0.12);
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 0.84rem;
}

.pill code,
code,
pre,
.mono,
.card-value,
.meta-command,
.body-copy,
.finding-message,
.kv-value {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.pill code,
td code,
.path-block code,
.module-id code,
.project-path code {
  white-space: pre-wrap;
}

.key-value,
.kv-list {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.meta-row,
.key-value div,
.kv-list div {
  display: grid;
  grid-template-columns: minmax(0, 12rem) minmax(0, 1fr);
  gap: 10px 14px;
  align-items: start;
  min-width: 0;
}

.key-value dt,
.key-value dd {
  margin: 0;
}

.kv-label,
.key-value dt {
  color: var(--ink-soft);
  font-size: 0.88rem;
}

.kv-value {
  color: var(--ink);
  min-width: 0;
}

.empty-state {
  border: 1px dashed rgba(126, 108, 86, 0.35);
  border-radius: var(--radius-sm);
  padding: 18px;
  color: var(--ink-soft);
  background: rgba(255, 255, 255, 0.42);
}

.loadout-card {
  gap: 10px;
}

.state-count {
  font-size: 1.35rem;
}

.dependency-column {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-radius: 16px;
  background: rgba(72, 86, 92, 0.04);
  border: 1px solid rgba(72, 86, 92, 0.08);
  min-width: 0;
}

.dependency-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--ink-soft);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.project-title {
  font-size: 1.1rem;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.file-card {
  padding: 12px;
  gap: 8px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.58);
}

.file-card::before {
  content: none;
}

.file-title,
.finding-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  flex-wrap: wrap;
}

.file-label {
  color: var(--ink-soft);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.finding-code {
  font-weight: 700;
  color: var(--ink);
}

.finding-message {
  color: var(--ink);
}

.diagnostics-panel {
  padding: 20px;
  display: grid;
  gap: 18px;
}

@media (max-width: 720px) {
  .app-shell {
    padding: 18px 12px 44px;
  }

  .page-header {
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
  }

  .refresh-button {
    width: 100%;
  }

  .tab-nav {
    overflow: auto;
    padding-bottom: 4px;
    flex-wrap: nowrap;
  }

  .tab-button {
    flex: 0 0 auto;
  }

  .panel,
  .diagnostics-panel {
    padding: 16px;
  }

  th,
  td {
    padding: 10px 12px;
  }
}

@media (max-width: 960px) {
  .meta-row,
  .key-value div,
  .kv-list div {
    grid-template-columns: minmax(0, 1fr);
  }

  .module-grid,
  .workflow-grid,
  .project-grid {
    grid-template-columns: 1fr;
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
  const ICONS = {
    overview: "✦",
    body: "◈",
    class: "⚔",
    workspaces: "🗺",
    diagnostics: "🕯",
    installed: "⚒",
    equipped: "🛡",
    skills: "✦",
    tools: "⚒",
    workflows: "⛓",
    knowledge: "📖",
    company: "🏰",
    personal: "⛺",
    adapters: "⇄",
    connectors: "⎋",
    local_cli: "⌘",
    mcp: "◎",
    warnings: "⚠",
    errors: "✕"
  };

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

  function iconGlyph(icon) {
    return `<span class="glyph" aria-hidden="true">${escapeHtml(icon || "✦")}</span>`;
  }

  function toneForStatus(value) {
    switch (String(value)) {
      case "PASS":
      case "valid":
      case "resolved":
        return "is-pass is-resolved";
      case "WARN":
      case "unbound":
        return "is-warn is-unbound";
      case "FAIL":
      case "invalid":
        return "is-fail is-invalid";
      case "bound":
      case "present":
      case "equipped":
        return "is-bound";
      case "catalog":
        return "is-neutral is-catalog";
      case "missing":
        return "is-missing";
      default:
        return "is-neutral";
    }
  }

  function cardTone(value) {
    switch (String(value)) {
      case "PASS":
      case "valid":
      case "resolved":
        return "tone-pass";
      case "bound":
      case "present":
      case "equipped":
        return "tone-bound";
      case "WARN":
      case "unbound":
        return "tone-unbound";
      case "FAIL":
      case "invalid":
        return "tone-invalid";
      default:
        return "";
    }
  }

  function statusIcon(value) {
    switch (String(value)) {
      case "PASS":
      case "valid":
      case "resolved":
        return "✦";
      case "WARN":
        return "⚠";
      case "FAIL":
      case "invalid":
        return "✕";
      case "bound":
      case "present":
      case "equipped":
        return "◉";
      case "unbound":
      case "missing":
        return "◌";
      case "catalog":
        return "◌";
      default:
        return "•";
    }
  }

  function statusBadge(value, label = null) {
    return `<span class="badge ${toneForStatus(value)}">${iconGlyph(statusIcon(value))}<span>${escapeHtml(label || asText(value))}</span></span>`;
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

  function sectionHeading(title, subtitle, options = {}) {
    const badgeHtml = options.badgeHtml ? `<div class="section-anchor">${options.badgeHtml}</div>` : "";
    return `
      <div class="section-heading">
        <div class="section-copy">
          <p class="section-kicker">${iconGlyph(options.icon || ICONS.overview)}<span>${escapeHtml(title)}</span></p>
          ${subtitle ? `<p class="section-subtitle">${escapeHtml(subtitle)}</p>` : ""}
        </div>
        ${badgeHtml}
      </div>
    `;
  }

  function summaryCard(title, value, subvalue = "", options = {}) {
    const tone = options.tone ? ` ${options.tone}` : "";
    const valueClass = options.valueClass ? ` ${options.valueClass}` : "";
    const valueHtml = options.valueHtml === true ? value : escapeHtml(value);
    const subvalueHtml = options.subvalueHtml === true ? subvalue : escapeHtml(subvalue);
    return `
      <article class="card${tone}">
        <div class="card-heading">
          ${iconGlyph(options.icon || ICONS.overview)}
          <p class="card-title">${escapeHtml(title)}</p>
        </div>
        <div class="card-value${valueClass}">${valueHtml}</div>
        ${subvalue ? `<div class="card-subvalue">${subvalueHtml}</div>` : ""}
      </article>
    `;
  }

  function metaCard(label, valueHtml, options = {}) {
    const tone = options.tone ? ` ${options.tone}` : "";
    const extraClass = options.className ? ` ${options.className}` : "";
    return `
      <article class="meta-card${tone}${extraClass}">
        <div class="surface-title-copy">
          <p class="surface-label">${iconGlyph(options.icon || ICONS.overview)}<span>${escapeHtml(label)}</span></p>
          ${options.note ? `<div class="meta-note">${escapeHtml(options.note)}</div>` : ""}
        </div>
        ${valueHtml}
      </article>
    `;
  }

  function codeValue(value) {
    return `<code class="mono">${escapeHtml(asText(value))}</code>`;
  }

  function renderMeta() {
    const meta = asObject(viewerState.meta);
    const payload = asObject(viewerState.payload);
    const overview = asObject(payload.overview);
    const status = asObject(overview.status);
    metaStrip.innerHTML = [
      metaCard(
        "render status",
        `<div class="meta-value-row">${statusBadge(asText(status.result, "FAIL"))}</div>`,
        {
          icon: ICONS.overview,
          tone: cardTone(asText(status.result, "FAIL")),
          note: "Derived verdict from overview.status.result"
        }
      ),
      metaCard(
        "generated",
        `<div class="meta-value-row"><div class="meta-value mono">${escapeHtml(asText(meta.generated_at))}</div></div>`,
        {
          icon: ICONS.diagnostics,
          note: "Viewer snapshot timestamp"
        }
      ),
      metaCard(
        "derive exit",
        `<div class="meta-value-row"><div class="meta-value mono">${escapeHtml(asText(meta.command_exit_code))}</div></div>`,
        {
          icon: ICONS.installed,
          tone: meta.command_exit_code ? "tone-unbound" : "tone-bound",
          note: "Non-zero still allows partial render when JSON payload exists"
        }
      ),
      metaCard(
        "source command",
        `<pre class="meta-command">${escapeHtml(asText(meta.command, "-"))}</pre>`,
        {
          icon: ICONS.class,
          className: "meta-card--command",
          note: "Horizontal scroll is allowed, but wrapping keeps the shell intact"
        }
      )
    ].join("");
  }

  function renderNoticeStrip() {
    const meta = asObject(viewerState.meta);
    const notices = [];
    if (meta.command_exit_code && viewerState.payload) {
      notices.push(`
        <div class="notice-card is-warn">
          <div class="badge-cluster">
            ${statusBadge("WARN", "partial render")}
          </div>
          <div class="muted">derive-ui-state returned a non-zero exit code, but the viewer rendered the available JSON payload.</div>
        </div>
      `);
    }
    if (meta.stderr) {
      notices.push(`
        <div class="notice-card is-warn">
          <div class="badge-cluster">
            ${statusBadge("WARN", "stderr")}
          </div>
          <pre>${escapeHtml(meta.stderr)}</pre>
        </div>
      `);
    }
    if (meta.fatal) {
      notices.push(`
        <div class="notice-card is-fail">
          <div class="badge-cluster">
            ${statusBadge("FAIL", "viewer load failure")}
          </div>
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
    const diagnosticsSubvalue = `
      <div class="badge-cluster">
        ${statusBadge("WARN", `warnings ${asCount(status.warning_count)}`)}
        ${statusBadge("FAIL", `errors ${asCount(status.error_count)}`)}
      </div>
    `;
    const projectsSubvalue = `
      <div class="badge-cluster">
        ${statusBadge("bound", `bound ${asCount(projects.bound)}`)}
        ${statusBadge("unbound", `unbound ${asCount(projects.unbound)}`)}
        ${statusBadge("invalid", `invalid ${asCount(projects.invalid)}`)}
      </div>
    `;
    return `
      <div class="stack">
        ${sectionHeading("overview", "Character sheet summary rendered from derived state only.", {
          icon: ICONS.overview,
          badgeHtml: statusBadge(asText(status.result, "FAIL"))
        })}
        <div class="hero-grid">
          ${summaryCard("body id", codeValue(overview.body_id), "", {
            icon: ICONS.body,
            tone: "tone-bound",
            valueHtml: true
          })}
          ${summaryCard("class id", codeValue(overview.class_id), "", {
            icon: ICONS.class,
            tone: "tone-bound",
            valueHtml: true
          })}
          ${summaryCard("active profile", codeValue(overview.active_profile), "", {
            icon: ICONS.equipped,
            tone: "tone-pass",
            valueHtml: true
          })}
          ${summaryCard("diagnostics", `${asCount(status.warning_count)} warn / ${asCount(status.error_count)} error`, diagnosticsSubvalue, {
            icon: ICONS.diagnostics,
            tone: cardTone(asText(status.result, "FAIL")),
            subvalueHtml: true
          })}
        </div>
        <div class="card-grid">
          ${summaryCard("installed", `skills ${asCount(installed.skills)} / tools ${asCount(installed.tools)}`, `workflows ${asCount(installed.workflows)} / knowledge ${asCount(installed.knowledge)}`, {
            icon: ICONS.installed
          })}
          ${summaryCard("equipped", `skills ${asCount(equipped.skills)} / tools ${asCount(equipped.tools)}`, `workflows ${asCount(equipped.workflows)} / knowledge ${asCount(equipped.knowledge)}`, {
            icon: ICONS.equipped,
            tone: "tone-bound"
          })}
          ${summaryCard("projects", `total ${asCount(projects.total)}`, projectsSubvalue, {
            icon: ICONS.workspaces,
            tone: asCount(projects.invalid) ? "tone-invalid" : asCount(projects.unbound) ? "tone-unbound" : "tone-bound",
            subvalueHtml: true
          })}
          ${summaryCard("body sections present", String(asCount(counts.body_sections_present)), "Present sections rendered from body ledger.", {
            icon: ICONS.body,
            tone: "tone-pass"
          })}
        </div>
      </div>
    `;
  }

  function renderBody(payload) {
    const body = asObject(payload.body);
    const sections = asArray(body.sections);
    const sectionTable = sections.length ? `
      <div class="table-shell">
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
      </div>
    ` : emptyState("No body sections were derived.");

    return `
      <div class="stack">
        ${sectionHeading("body", "Body ledger for the current shell and section presence.", {
          icon: ICONS.body
        })}
        <div class="summary-grid">
          ${summaryCard("body id", codeValue(body.id), "", {
            icon: ICONS.body,
            tone: "tone-bound",
            valueHtml: true
          })}
          ${summaryCard("name", asText(body.name), "Static body identity from body metadata.", {
            icon: ICONS.overview
          })}
          ${summaryCard("sections", String(sections.length), "Tracked sections in body.yaml order.", {
            icon: ICONS.body,
            tone: sections.length ? "tone-pass" : ""
          })}
        </div>
        <div>
          ${sectionHeading("sections", "present indicates whether the section exists in the current body shell.", {
            icon: ICONS.body
          })}
          ${sectionTable}
        </div>
      </div>
    `;
  }

  function renderModuleCards(modules, emptyMessage, libraryKey) {
    if (!modules.length) {
      return emptyState(emptyMessage);
    }
    return `
      <div class="module-grid">
        ${modules.map((module) => `
          <article class="module-card stack">
            <div class="surface-title-row">
              <div class="surface-title-copy">
                <p class="surface-label">${iconGlyph(ICONS[libraryKey] || ICONS.installed)}<span>${escapeHtml(libraryKey)}</span></p>
                <h3>${escapeHtml(asText(module.name, module.id))}</h3>
              </div>
              <div class="badge-cluster">
                <span class="badge is-neutral">v${escapeHtml(asText(module.version, "-"))}</span>
                ${module.family ? `<span class="badge is-neutral">${escapeHtml(asText(module.family))}</span>` : ""}
              </div>
            </div>
            <div class="module-id"><code>${escapeHtml(asText(module.id))}</code></div>
            <div class="muted">${escapeHtml(asText(module.description))}</div>
            <div class="kv-list">
              <div><span class="kv-label">manifest_path</span><code class="kv-value">${escapeHtml(asText(module.manifest_path))}</code></div>
              ${module.entrypoint ? `<div><span class="kv-label">entrypoint</span><code class="kv-value">${escapeHtml(asText(module.entrypoint))}</code></div>` : ""}
              ${module.content_path ? `<div><span class="kv-label">content_path</span><code class="kv-value">${escapeHtml(asText(module.content_path))}</code></div>` : ""}
            </div>
          </article>
        `).join("")}
      </div>
    `;
  }

  function renderFamilyCards(toolsByFamily) {
    const families = ["adapters", "connectors", "local_cli", "mcp"];
    return `
      <div class="family-grid">
        ${families.map((family) => {
          const tools = asArray(toolsByFamily[family]);
          return `
            <article class="family-card stack">
              <div class="surface-title-row">
                <div class="surface-title-copy">
                  <p class="surface-label">${iconGlyph(ICONS[family] || ICONS.tools)}<span>${family}</span></p>
                  <h3>${family}</h3>
                </div>
                <span class="badge is-neutral">${tools.length}</span>
              </div>
              ${tools.length ? inlineList(tools.map((tool) => asText(tool.id)), "No tools in this family.") : emptyState("No tools in this family.")}
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderLoadoutCards(equipped) {
    const libraryKeys = ["skills", "tools", "workflows", "knowledge"];
    return `
      <div class="loadout-grid">
        ${libraryKeys.map((key) => {
          const modules = asArray(equipped[key]);
          return `
            <article class="loadout-card stack ${modules.length ? "tone-bound" : ""}">
              <div class="surface-title-row">
                <div class="surface-title-copy">
                  <p class="surface-label">${iconGlyph(ICONS[key] || ICONS.equipped)}<span>${key}</span></p>
                  <h3>${key}</h3>
                </div>
                <span class="badge ${modules.length ? "is-equipped" : "is-neutral"}">${modules.length}</span>
              </div>
              <div class="state-count">${modules.length ? `${modules.length} equipped` : "0 equipped"}</div>
              ${inlineList(modules.map((module) => asText(module.id)), `No equipped ${key}.`)}
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
          const tone = cardTone(asText(workflow.dependency_status, "invalid"));
          return `
            <article class="workflow-card stack ${tone}">
              <div class="surface-title-row">
                <div class="surface-title-copy">
                  <p class="surface-label">${iconGlyph(ICONS.workflows)}<span>workflow_card</span></p>
                  <h3>${escapeHtml(asText(workflow.name, workflow.id))}</h3>
                </div>
                <div class="badge-cluster">
                  ${statusBadge(asText(workflow.dependency_status, "invalid"))}
                  ${statusBadge(workflow.equipped === true ? "equipped" : "catalog")}
                </div>
              </div>
              <div class="module-id"><code>${escapeHtml(asText(workflow.id))}</code></div>
              <div class="muted">${escapeHtml(asText(workflow.description))}</div>
              <div class="kv-list">
                <div><span class="kv-label">entrypoint</span><code class="kv-value">${escapeHtml(asText(workflow.entrypoint))}</code></div>
                <div><span class="kv-label">version</span><span class="kv-value">v${escapeHtml(asText(workflow.version, "-"))}</span></div>
              </div>
              <div class="dependency-grid">
                <div class="dependency-column">
                  <div class="dependency-label">${iconGlyph(ICONS.skills)}<span>requires.skills</span></div>
                  ${inlineList(asArray(requires.skills).map((item) => asText(item)), "No skill dependencies.")}
                </div>
                <div class="dependency-column">
                  <div class="dependency-label">${iconGlyph(ICONS.tools)}<span>requires.tools</span></div>
                  ${inlineList(asArray(requires.tools).map((item) => asText(item)), "No tool dependencies.")}
                </div>
                <div class="dependency-column">
                  <div class="dependency-label">${iconGlyph(ICONS.knowledge)}<span>requires.knowledge</span></div>
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
        ${sectionHeading("class", "Installed inventory, equipped loadout, and workflow combo cards.", {
          icon: ICONS.class
        })}
        <div class="summary-grid">
          ${summaryCard("class id", codeValue(classState.id), "", {
            icon: ICONS.class,
            tone: "tone-bound",
            valueHtml: true
          })}
          ${summaryCard("active profile", codeValue(classState.active_profile), "Current loadout profile.", {
            icon: ICONS.equipped,
            tone: "tone-pass",
            valueHtml: true
          })}
          ${summaryCard("installed total", String(libraryKeys.reduce((sum, key) => sum + asArray(installed[key]).length, 0)), "Catalog entries across all module libraries.", {
            icon: ICONS.installed
          })}
          ${summaryCard("equipped total", String(libraryKeys.reduce((sum, key) => sum + asArray(equipped[key]).length, 0)), "Modules carried in the active loadout.", {
            icon: ICONS.equipped,
            tone: "tone-bound"
          })}
        </div>
        <div class="stack">
          ${sectionHeading("installed", "Inventory catalog grouped by module kind.", {
            icon: ICONS.installed
          })}
          ${libraryKeys.map((key) => `
            <section class="stack">
              ${sectionHeading(key, "", {
                icon: ICONS[key],
                badgeHtml: `<span class="badge is-neutral">${asArray(installed[key]).length}</span>`
              })}
              ${renderModuleCards(asArray(installed[key]), `No installed ${key}.`, key)}
            </section>
          `).join("")}
        </div>
        <div class="stack">
          ${sectionHeading("equipped", "Active loadout grouped as carried modules.", {
            icon: ICONS.equipped
          })}
          ${renderLoadoutCards(equipped)}
        </div>
        <div class="stack">
          ${sectionHeading("tools_by_family", "Tool chests grouped by execution family.", {
            icon: ICONS.tools
          })}
          ${renderFamilyCards(toolsByFamily)}
        </div>
        <div class="stack">
          ${sectionHeading("workflow_cards", "Combo cards for installed workflows and dependency readiness.", {
            icon: ICONS.workflows
          })}
          ${renderWorkflowCards(workflowCards)}
        </div>
      </div>
    `;
  }

  function renderProjectFileCard(label, item, countKey = null, countLabel = null) {
    const record = asObject(item);
    const badges = [statusBadge(record.present === true ? "present" : "missing")];
    if (record.present === true) {
      badges.push(statusBadge(record.valid === true ? "valid" : "invalid"));
    }
    if (countKey && typeof record[countKey] === "number") {
      badges.push(`<span class="badge is-neutral">${escapeHtml(countLabel || countKey)} ${record[countKey]}</span>`);
    }
    return `
      <article class="file-card stack">
        <div class="file-title">
          <span class="file-label">${escapeHtml(label)}</span>
          <div class="badge-cluster">${badges.join("")}</div>
        </div>
        ${record.path ? `<div class="path-block"><code>${escapeHtml(asText(record.path))}</code></div>` : emptyState("No path was derived.")}
      </article>
    `;
  }

  function projectCard(project) {
    const contract = asObject(project.contract);
    const warningCount = asArray(project.warnings).length;
    const errorCount = asArray(project.errors).length;
    const fileStatus = asObject(project.file_status);
    const projectName = asText(contract.project_name, contract.project_id || project.project_path);
    return `
      <article class="project-card stack ${cardTone(asText(project.state, "invalid"))}">
        <div class="surface-title-row">
          <div class="surface-title-copy">
            <p class="surface-label">${iconGlyph(ICONS[project.workspace_kind] || ICONS.workspaces)}<span>${escapeHtml(asText(project.workspace_kind))}</span></p>
            <h3 class="project-title">${escapeHtml(projectName)}</h3>
          </div>
          <div class="badge-cluster">
            ${statusBadge(asText(project.state, "invalid"))}
            ${statusBadge(project.project_agent_present === true ? "present" : "missing", project.project_agent_present === true ? "project_agent present" : "project_agent missing")}
          </div>
        </div>
        <div class="project-path"><code>${escapeHtml(asText(project.project_path))}</code></div>
        <div class="kv-list">
          <div><span class="kv-label">contract.project_id</span><code class="kv-value">${escapeHtml(asText(contract.project_id))}</code></div>
          <div><span class="kv-label">contract.project_name</span><span class="kv-value">${escapeHtml(asText(contract.project_name))}</span></div>
          <div><span class="kv-label">contract.default_loadout</span><code class="kv-value">${escapeHtml(asText(contract.default_loadout))}</code></div>
          <div><span class="kv-label">capsule_binding_count</span><span class="kv-value mono">${asCount(project.capsule_binding_count)}</span></div>
          <div><span class="kv-label">workflow_binding_count</span><span class="kv-value mono">${asCount(project.workflow_binding_count)}</span></div>
          <div><span class="kv-label">local_state_entry_count</span><span class="kv-value mono">${asCount(project.local_state_entry_count)}</span></div>
          <div><span class="kv-label">project warnings / errors</span><span class="kv-value mono">${warningCount} / ${errorCount}</span></div>
        </div>
        <div class="stack">
          <p class="surface-label">${iconGlyph(ICONS.workspaces)}<span>file status</span></p>
          <div class="project-file-grid">
            ${renderProjectFileCard("contract", contract)}
            ${renderProjectFileCard("capsule_bindings", fileStatus.capsule_bindings, "binding_count", "bindings")}
            ${renderProjectFileCard("workflow_bindings", fileStatus.workflow_bindings, "binding_count", "bindings")}
            ${renderProjectFileCard("local_state", fileStatus.local_state, "entry_count", "entries")}
          </div>
        </div>
      </article>
    `;
  }

  function renderWorkspaceGroup(title, projects, workspaceKind) {
    const subtitle = workspaceKind === "company" ? "Company field status and contract condition." : "Personal field status and contract condition.";
    return `
      <section class="stack">
        ${sectionHeading(title, subtitle, {
          icon: ICONS[workspaceKind] || ICONS.workspaces,
          badgeHtml: `<span class="badge is-neutral">${projects.length}</span>`
        })}
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
        ${sectionHeading("workspaces", "Field status across company and personal project camps.", {
          icon: ICONS.workspaces
        })}
        <div class="summary-grid">
          ${summaryCard("total", String(asCount(summary.total)), "All discovered project roots.", {
            icon: ICONS.workspaces
          })}
          ${summaryCard("bound", String(asCount(summary.bound)), statusBadge("bound"), {
            icon: ICONS.company,
            tone: "tone-bound",
            subvalueHtml: true
          })}
          ${summaryCard("unbound", String(asCount(summary.unbound)), statusBadge("unbound"), {
            icon: ICONS.personal,
            tone: "tone-unbound",
            subvalueHtml: true
          })}
          ${summaryCard("invalid", String(asCount(summary.invalid)), statusBadge("invalid"), {
            icon: ICONS.errors,
            tone: "tone-invalid",
            subvalueHtml: true
          })}
        </div>
        ${renderWorkspaceGroup("company.projects", companyProjects, "company")}
        ${renderWorkspaceGroup("personal.projects", personalProjects, "personal")}
      </div>
    `;
  }

  function renderFindingGroup(title, items, emptyMessage) {
    const isError = title === "errors";
    const icon = ICONS[title] || ICONS.diagnostics;
    const badgeTone = isError ? "FAIL" : "WARN";
    if (!items.length) {
      return `
        <section class="stack">
          ${sectionHeading(title, "", {
            icon,
            badgeHtml: `<span class="badge is-neutral">0</span>`
          })}
          ${emptyState(emptyMessage)}
        </section>
      `;
    }
    return `
      <section class="stack">
        ${sectionHeading(title, "", {
          icon,
          badgeHtml: statusBadge(badgeTone, `${title} ${items.length}`)
        })}
        <div class="finding-grid">
          ${items.map((item) => `
            <article class="finding-card stack ${cardTone(asText(item.level))}">
              <div class="finding-head">
                <div class="finding-code mono">${escapeHtml(asText(item.code))}</div>
                ${statusBadge(asText(item.level))}
              </div>
              <div class="finding-message">${escapeHtml(asText(item.message))}</div>
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
