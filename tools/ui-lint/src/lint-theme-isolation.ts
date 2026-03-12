import { readText, walkFiles, type LintResult } from "./shared";

const HEX_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b/;
const TOKEN_DEFINITION_PATTERN = /--desk-[a-z0-9-]+\s*:/i;

export function runThemeIsolationLint() {
  const issues = [];
  const cssFiles = walkFiles("apps/renderer-web/src", (repoPath) => repoPath.endsWith(".css"));
  const scriptFiles = walkFiles("apps/renderer-web/src", (repoPath) => /\.(ts|tsx)$/.test(repoPath));

  for (const file of cssFiles) {
    const sourceText = readText(file);
    const isThemeFile = file === "apps/renderer-web/src/theme.css";

    if (!isThemeFile && TOKEN_DEFINITION_PATTERN.test(sourceText)) {
      issues.push({
        rule: "theme-token-location",
        file,
        message: "theme tokens must be defined only in apps/renderer-web/src/theme.css"
      });
    }

    if (!isThemeFile && HEX_COLOR_PATTERN.test(sourceText)) {
      issues.push({
        rule: "raw-color",
        file,
        message: "raw hex colors must stay inside apps/renderer-web/src/theme.css"
      });
    }
  }

  for (const file of scriptFiles) {
    const sourceText = readText(file);
    if (HEX_COLOR_PATTERN.test(sourceText)) {
      issues.push({
        rule: "raw-color",
        file,
        message: "TS/TSX files must not embed raw hex colors"
      });
    }
  }

  const mainSource = readText("apps/renderer-web/src/main.tsx");
  const themeImportIndex = mainSource.indexOf('import "./theme.css";');
  const appImportIndex = mainSource.indexOf('import "./app.css";');
  if (themeImportIndex === -1 || appImportIndex === -1 || themeImportIndex > appImportIndex) {
    issues.push({
      rule: "theme-import-order",
      file: "apps/renderer-web/src/main.tsx",
      message: 'main.tsx must import "./theme.css" before "./app.css"'
    });
  }

  return {
    name: "theme isolation lint",
    issues
  } satisfies LintResult;
}
