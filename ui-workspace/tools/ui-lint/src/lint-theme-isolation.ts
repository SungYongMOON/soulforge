import { readText, walkFiles, type LintResult } from "./shared";

const RAW_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const TOKEN_DEFINITION_PATTERN = /--sf-[a-z0-9-]+\s*:/i;
const THEME_CSS_IMPORT_PATTERN = /import\s+["']@soulforge\/theme-adventurers-desk\/theme\.css["'];?/;
const THEME_FILES = ["packages/theme-adventurers-desk/theme.css"];
const MAIN_ENTRY_FILES = ["apps/renderer-web/src/main.tsx", "apps/skin-lab-storybook/src/main.tsx"];
const THEME_REGISTRY_FILES = ["apps/renderer-web/src/themes.ts", "apps/skin-lab-storybook/src/themes.ts"];

export function runThemeIsolationLint() {
  const issues = [];
  const cssFiles = [
    ...walkFiles("apps/renderer-web/src", (repoPath) => repoPath.endsWith(".css")),
    ...walkFiles("apps/skin-lab-storybook/src", (repoPath) => repoPath.endsWith(".css")),
    ...walkFiles("packages/renderer-react/src", (repoPath) => repoPath.endsWith(".css")),
    ...THEME_FILES
  ];
  const scriptFiles = [
    ...walkFiles("apps/renderer-web/src", (repoPath) => /\.(ts|tsx)$/.test(repoPath)),
    ...walkFiles("apps/skin-lab-storybook/src", (repoPath) => /\.(ts|tsx)$/.test(repoPath)),
    ...walkFiles("packages/renderer-react/src", (repoPath) => /\.(ts|tsx)$/.test(repoPath)),
    ...walkFiles("packages/theme-adventurers-desk/src", (repoPath) => /\.(ts|tsx)$/.test(repoPath)),
    ...walkFiles("packages/theme-contract/src", (repoPath) => /\.(ts|tsx)$/.test(repoPath))
  ];

  for (const file of [...new Set(cssFiles)].sort()) {
    const sourceText = readText(file);
    const isThemeFile = THEME_FILES.includes(file);

    if (!isThemeFile && TOKEN_DEFINITION_PATTERN.test(sourceText)) {
      issues.push({
        rule: "theme-token-location",
        file,
        message: `theme tokens must be defined only inside theme package CSS: ${THEME_FILES.join(", ")}`
      });
    }

    if (!isThemeFile && RAW_COLOR_PATTERN.test(sourceText)) {
      issues.push({
        rule: "raw-color",
        file,
        message: "raw color literals must stay inside theme package CSS"
      });
    }
  }

  for (const file of scriptFiles) {
    const sourceText = readText(file);

    if (RAW_COLOR_PATTERN.test(sourceText)) {
      issues.push({
        rule: "raw-color",
        file,
        message: "TS/TSX files must not embed raw color literals"
      });
    }

    if (file !== "apps/renderer-web/src/themes.ts" && file !== "apps/skin-lab-storybook/src/themes.ts" && THEME_CSS_IMPORT_PATTERN.test(sourceText)) {
      issues.push({
        rule: "theme-css-registry",
        file,
        message: "concrete theme CSS imports must stay inside app-local themes.ts registries"
      });
    }
  }

  for (const file of MAIN_ENTRY_FILES) {
    const sourceText = readText(file);
    const themesImportIndex = sourceText.indexOf('from "./themes"');
    const rendererImportIndex = sourceText.indexOf('import "@soulforge/renderer-react/renderer.css";');

    if (themesImportIndex === -1 || rendererImportIndex === -1 || themesImportIndex > rendererImportIndex) {
      issues.push({
        rule: "theme-import-order",
        file,
        message: "main entry must import ./themes before renderer-react structural CSS"
      });
    }
  }

  for (const file of THEME_REGISTRY_FILES) {
    const sourceText = readText(file);
    if (!THEME_CSS_IMPORT_PATTERN.test(sourceText)) {
      issues.push({
        rule: "theme-registry-css",
        file,
        message: "theme registry must import theme package CSS explicitly"
      });
    }
  }

  return {
    name: "theme isolation lint",
    issues
  } satisfies LintResult;
}
