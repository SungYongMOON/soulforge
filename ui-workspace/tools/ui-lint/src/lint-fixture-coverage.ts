import {
  EXPECTED_FIXTURES,
  EXPECTED_TABS,
  REQUIRED_AXES,
  asArray,
  asBoolean,
  asObject,
  asString,
  expectedDefaultTab,
  loadFixtures,
  readText,
  type LintResult
} from "./shared";

const FORBIDDEN_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: ".agent/", pattern: /\.agent\// },
  { label: ".agent_class/", pattern: /\.agent_class\// },
  { label: "_workspaces/company", pattern: /_workspaces\/company\b/ },
  { label: "_workspaces/personal", pattern: /_workspaces\/personal\b/ },
  { label: ".project_agent/runs", pattern: /\.project_agent\/runs/ },
  { label: "battle log", pattern: /battle log/i },
  { label: "real feedback events", pattern: /real feedback events/i },
  { label: "analytics", pattern: /\banalytics\b/i },
  { label: "nightly healing", pattern: /nightly healing/i },
  { label: "workflow run index", pattern: /workflow run index/i },
  { label: "actual party performance metrics", pattern: /actual party performance metrics/i }
];

function axisItems(payload: Record<string, unknown>, axis: string) {
  const collection = asObject(payload[axis]);
  return asArray<Record<string, unknown>>(collection?.items);
}

export function runFixtureCoverageLint() {
  const issues = [];
  const fixtures = loadFixtures();
  const fixtureNames = new Set(fixtures.map((fixture) => fixture.name));
  const defaultTabs = new Set<string>();
  const axisCoverage = new Set<string>();
  let hasDiagnosticWarning = false;

  for (const expectedFixture of EXPECTED_FIXTURES) {
    if (!fixtureNames.has(expectedFixture)) {
      issues.push({
        rule: "missing-fixture",
        file: "fixtures/ui-state",
        message: `missing required fixture ${expectedFixture}.sample.json`
      });
    }
  }

  for (const fixture of fixtures) {
    const source = asObject(fixture.payload.source);
    const uiHints = asObject(fixture.payload.ui_hints);
    const diagnostics = asObject(fixture.payload.diagnostics);
    const diagnosticSummary = asObject(diagnostics?.summary);
    const workspaces = asObject(fixture.payload.workspaces);
    const workspaceProjects = asArray<Record<string, unknown>>(workspaces?.projects);
    const payloadText = JSON.stringify(fixture.payload);

    const fixtureName = asString(source?.fixture_name);
    if (fixtureName && fixtureName !== fixture.name) {
      issues.push({
        rule: "fixture-name-mismatch",
        file: fixture.repoPath,
        message: `source.fixture_name ${fixtureName} must match ${fixture.name}`
      });
    }

    const defaultTab = asString(uiHints?.default_tab);
    if (defaultTab) {
      defaultTabs.add(defaultTab);
    }
    if (defaultTab !== expectedDefaultTab(fixture.name)) {
      issues.push({
        rule: "fixture-default-tab",
        file: fixture.repoPath,
        message: `expected default tab ${expectedDefaultTab(fixture.name)}, got ${String(defaultTab)}`
      });
    }

    for (const axis of REQUIRED_AXES) {
      const axisObject = asObject(fixture.payload[axis]);
      if (!axisObject) {
        issues.push({
          rule: "required-axis",
          file: fixture.repoPath,
          message: `missing required axis object ${axis}`
        });
        continue;
      }

      if (axis === "workspaces") {
        continue;
      }

      const items = axisItems(fixture.payload, axis);
      if (items.length > 0) {
        axisCoverage.add(axis);
      }
    }

    if (asString(workspaces?.mode) !== "local_only_mount") {
      issues.push({
        rule: "workspace-mode",
        file: fixture.repoPath,
        message: `expected workspaces.mode local_only_mount, got ${String(workspaces?.mode)}`
      });
    }

    if (asBoolean(workspaces?.local_scan_enabled) !== false) {
      issues.push({
        rule: "workspace-local-scan",
        file: fixture.repoPath,
        message: "public fixtures must keep workspaces.local_scan_enabled false"
      });
    }

    if (workspaceProjects.length > 0) {
      issues.push({
        rule: "workspace-projects",
        file: fixture.repoPath,
        message: "public fixtures must not materialize local workspace projects"
      });
    }

    const workspaceNotes = asArray<string>(workspaces?.notes);
    if (!workspaceNotes.some((note) => note.includes("local-only") || note.includes("local_only"))) {
      issues.push({
        rule: "workspace-notes",
        file: fixture.repoPath,
        message: "workspaces.notes must explain the local-only mount policy"
      });
    }

    const warningCount = Number(diagnosticSummary?.warnings ?? 0);
    hasDiagnosticWarning ||= warningCount > 0 || asArray(diagnostics?.warnings).length > 0;

    for (const forbidden of FORBIDDEN_PATTERNS) {
      if (forbidden.pattern.test(payloadText)) {
        issues.push({
          rule: "forbidden-payload",
          file: fixture.repoPath,
          message: `fixture payload must not contain ${forbidden.label}`
        });
      }
    }
  }

  for (const expectedTab of EXPECTED_TABS) {
    if (!defaultTabs.has(expectedTab)) {
      issues.push({
        rule: "tab-coverage",
        file: "fixtures/ui-state",
        message: `default_tab coverage is missing ${expectedTab}`
      });
    }
  }

  for (const axis of REQUIRED_AXES) {
    if (axis === "workspaces") {
      continue;
    }
    if (!axisCoverage.has(axis)) {
      issues.push({
        rule: "axis-coverage",
        file: "fixtures/ui-state",
        message: `fixture coverage missing ${axis}`
      });
    }
  }

  if (!hasDiagnosticWarning) {
    issues.push({
      rule: "diagnostics-coverage",
      file: "fixtures/ui-state",
      message: "diagnostics coverage must include at least one warning for synthetic workspace policy"
    });
  }

  const fixtureSourceText = readText("packages/renderer-core/src/fixtures.ts");
  for (const fixtureName of EXPECTED_FIXTURES) {
    if (!fixtureSourceText.includes(`/${fixtureName}.sample.json`)) {
      issues.push({
        rule: "fixture-map-import",
        file: "packages/renderer-core/src/fixtures.ts",
        message: `fixture map must import ${fixtureName}.sample.json`
      });
    }

    if (!new RegExp(`\\b${fixtureName}\\s*:`).test(fixtureSourceText)) {
      issues.push({
        rule: "fixture-map-entry",
        file: "packages/renderer-core/src/fixtures.ts",
        message: `fixture map must export key ${fixtureName}`
      });
    }
  }

  for (const axis of REQUIRED_AXES) {
    if (!fixtureSourceText.includes(`"${axis}"`)) {
      issues.push({
        rule: "fixture-axes",
        file: "packages/renderer-core/src/fixtures.ts",
        message: `fixture map should declare canonical axis ${axis}`
      });
    }
  }

  return {
    name: "fixture coverage lint",
    issues
  } satisfies LintResult;
}
