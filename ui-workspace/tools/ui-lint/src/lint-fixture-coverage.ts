import { EXPECTED_FIXTURES, EXPECTED_TABS, ROW_RULES, asArray, asBoolean, asObject, asString, expectedDefaultTab, loadFixtures, readText, type LintResult } from "./shared";

export function runFixtureCoverageLint() {
  const issues = [];
  const fixtures = loadFixtures();
  const fixtureNames = new Set(fixtures.map((fixture) => fixture.name));
  const defaultTabs = new Set<string>();
  const rowCoverage = new Set<string>();
  const classCatalogCoverage = new Set<string>();
  const workspaceStates = new Set<string>();
  const flags = {
    installed: false,
    equipped: false,
    required: false,
    preferred: false,
    selectable_candidate: false
  };
  let hasDiagnosticsSignal = false;
  let hasSpeciesCandidates = false;
  let hasHeroCandidates = false;

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
    const rows = asObject(asObject(fixture.payload.class_view)?.rows);
    const diagnostics = asObject(fixture.payload.diagnostics);
    const diagnosticSummary = asObject(diagnostics?.summary);
    const workspaces = asObject(fixture.payload.workspaces);
    const groupedProjects = asObject(workspaces?.grouped_projects);
    const catalogs = asObject(fixture.payload.catalogs);
    const classCatalogs = asObject(catalogs?.class);
    const identityCatalogs = asObject(catalogs?.identity);

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

    for (const [rowKey, rowRule] of Object.entries(ROW_RULES)) {
      const items = asArray<Record<string, unknown>>(rows?.[rowKey]);
      if (items.length > 0) {
        rowCoverage.add(rowKey);
      }

      for (const item of items) {
        if (asBoolean(item.installed) === true) {
          flags.installed = true;
        }
        if (asBoolean(item.equipped) === true) {
          flags.equipped = true;
        }
        if (asBoolean(item.required) === true) {
          flags.required = true;
        }
        if (asBoolean(item.preferred) === true) {
          flags.preferred = true;
        }
        if (asBoolean(item.selectable_candidate) === true) {
          flags.selectable_candidate = true;
        }
      }

      const catalogItems = asArray<Record<string, unknown>>(classCatalogs?.[rowRule.catalogKey]);
      if (catalogItems.length > 0) {
        classCatalogCoverage.add(rowRule.catalogKey);
      }
    }

    const speciesCandidates = asArray<Record<string, unknown>>(identityCatalogs?.species_candidates);
    const heroCandidates = asArray<Record<string, unknown>>(identityCatalogs?.hero_candidates);
    hasSpeciesCandidates ||= speciesCandidates.length > 0;
    hasHeroCandidates ||= heroCandidates.length > 0;

    const companyProjects = asArray<Record<string, unknown>>(groupedProjects?.company);
    const personalProjects = asArray<Record<string, unknown>>(groupedProjects?.personal);
    for (const project of [...companyProjects, ...personalProjects]) {
      const state = asString(project.state);
      if (state) {
        workspaceStates.add(state);
      }
    }

    const warningCount = diagnostics?.warnings;
    const errorCount = diagnostics?.errors;
    const summaryWarnings = Number(diagnosticSummary?.warnings ?? 0);
    const summaryErrors = Number(diagnosticSummary?.errors ?? 0);
    hasDiagnosticsSignal ||=
      summaryWarnings > 0 ||
      summaryErrors > 0 ||
      asArray(warningCount).length > 0 ||
      asArray(errorCount).length > 0;
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

  for (const rowKey of Object.keys(ROW_RULES)) {
    if (!rowCoverage.has(rowKey)) {
      issues.push({
        rule: "row-coverage",
        file: "fixtures/ui-state",
        message: `row coverage missing ${rowKey}`
      });
    }
  }

  for (const rowRule of Object.values(ROW_RULES)) {
    if (!classCatalogCoverage.has(rowRule.catalogKey)) {
      issues.push({
        rule: "catalog-coverage",
        file: "fixtures/ui-state",
        message: `catalog coverage missing ${rowRule.catalogKey}`
      });
    }
  }

  for (const [flagName, covered] of Object.entries(flags)) {
    if (!covered) {
      issues.push({
        rule: "state-coverage",
        file: "fixtures/ui-state",
        message: `fixture coverage missing ${flagName}=true`
      });
    }
  }

  if (!workspaceStates.has("bound")) {
    issues.push({
      rule: "workspace-coverage",
      file: "fixtures/ui-state",
      message: "workspace coverage missing bound state"
    });
  }

  if (!workspaceStates.has("unbound")) {
    issues.push({
      rule: "workspace-coverage",
      file: "fixtures/ui-state",
      message: "workspace coverage missing unbound state"
    });
  }

  if (!hasDiagnosticsSignal) {
    issues.push({
      rule: "diagnostics-coverage",
      file: "fixtures/ui-state",
      message: "diagnostics coverage missing warning or error signal"
    });
  }

  if (!hasSpeciesCandidates) {
    issues.push({
      rule: "catalog-coverage",
      file: "fixtures/ui-state",
      message: "species candidate coverage missing"
    });
  }

  if (!hasHeroCandidates) {
    issues.push({
      rule: "catalog-coverage",
      file: "fixtures/ui-state",
      message: "hero candidate coverage missing"
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

  return {
    name: "fixture coverage lint",
    issues
  } satisfies LintResult;
}
