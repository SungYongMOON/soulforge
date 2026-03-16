import {
  REQUIRED_AXES,
  asObject,
  asString,
  expectedDefaultTab,
  loadFixtures,
  loadSchemaValidator,
  type LintResult
} from "./shared";

export function runUiStateLint() {
  const issues = [];
  const fixtures = loadFixtures();
  const validate = loadSchemaValidator();

  for (const fixture of fixtures) {
    const valid = validate(fixture.payload);
    if (!valid) {
      for (const error of validate.errors ?? []) {
        issues.push({
          rule: "schema",
          file: fixture.repoPath,
          message: `${error.instancePath || "/"} ${error.message ?? "invalid"}`
        });
      }
      continue;
    }

    const source = asObject(fixture.payload.source);
    const uiHints = asObject(fixture.payload.ui_hints);
    const workspaces = asObject(fixture.payload.workspaces);

    if (fixture.payload.schema_version !== "ui-state.v1") {
      issues.push({
        rule: "schema-version",
        file: fixture.repoPath,
        message: `expected schema_version ui-state.v1, got ${String(fixture.payload.schema_version)}`
      });
    }

    if (asString(source?.mode) !== "fixture") {
      issues.push({
        rule: "source-mode",
        file: fixture.repoPath,
        message: `expected source.mode fixture, got ${String(source?.mode)}`
      });
    }

    if (asString(source?.producer) !== "fixture") {
      issues.push({
        rule: "source-producer",
        file: fixture.repoPath,
        message: `expected source.producer fixture, got ${String(source?.producer)}`
      });
    }

    if (asString(source?.fixture_name) !== fixture.name) {
      issues.push({
        rule: "fixture-name",
        file: fixture.repoPath,
        message: `source.fixture_name must match file name ${fixture.name}`
      });
    }

    const defaultTab = asString(uiHints?.default_tab);
    const expectedTab = expectedDefaultTab(fixture.name);
    if (defaultTab !== expectedTab) {
      issues.push({
        rule: "default-tab",
        file: fixture.repoPath,
        message: `expected ui_hints.default_tab ${expectedTab}, got ${String(defaultTab)}`
      });
    }

    for (const axis of REQUIRED_AXES) {
      if (!asObject(fixture.payload[axis])) {
        issues.push({
          rule: "required-axis",
          file: fixture.repoPath,
          message: `missing required axis object ${axis}`
        });
      }
    }

    if (asString(workspaces?.mode) !== "local_only_mount") {
      issues.push({
        rule: "workspace-mode",
        file: fixture.repoPath,
        message: `expected workspaces.mode local_only_mount, got ${String(workspaces?.mode)}`
      });
    }
  }

  return {
    name: "ui-state contract lint",
    issues
  } satisfies LintResult;
}
