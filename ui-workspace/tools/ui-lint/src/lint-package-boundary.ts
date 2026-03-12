import path from "node:path";
import {
  extractImportSpecifiers,
  readText,
  repoRelative,
  rendererCoreDir,
  rendererReactDir,
  rendererWebDir,
  resolveRepoPath,
  skinLabDir,
  themeContractDir,
  themePackages,
  walkFiles,
  type LintResult
} from "./shared";

function resolveImportTarget(file: string, specifier: string) {
  const fileAbsolutePath = resolveRepoPath(file);
  return repoRelative(path.resolve(path.dirname(fileAbsolutePath), specifier));
}

function isRendererWebFile(file: string) {
  return file.startsWith("apps/renderer-web/");
}

function isSkinLabFile(file: string) {
  return file.startsWith("apps/skin-lab-storybook/");
}

function isRendererCoreFile(file: string) {
  return file.startsWith("packages/renderer-core/");
}

function isRendererReactFile(file: string) {
  return file.startsWith("packages/renderer-react/");
}

function isThemeContractFile(file: string) {
  return file.startsWith("packages/theme-contract/");
}

function getThemePackageForFile(file: string) {
  return themePackages.find(({ repoDir }) => file.startsWith(`${repoDir}/`)) ?? null;
}

function isConcreteThemePackageSpecifier(specifier: string) {
  return themePackages.some(
    ({ packageName, repoDir }) => specifier.includes(packageName) || specifier.includes(repoDir)
  );
}

function isDirectFixtureOrSchemaImport(specifier: string) {
  return specifier.includes("fixtures/ui-state") || specifier.includes("schemas/");
}

function isCanonicalSpecifier(specifier: string) {
  return specifier.includes(".agent/") || specifier.includes(".agent_class/") || specifier.includes("_workspaces/");
}

export function runPackageBoundaryLint() {
  const issues = [];
  const files = [
    ...walkFiles(repoRelative(rendererWebDir), (repoPath) => /\.(ts|tsx)$/.test(repoPath)),
    ...walkFiles(repoRelative(skinLabDir), (repoPath) => /\.(ts|tsx)$/.test(repoPath)),
    ...walkFiles(repoRelative(rendererCoreDir), (repoPath) => /\.(ts|tsx)$/.test(repoPath)),
    ...walkFiles(repoRelative(rendererReactDir), (repoPath) => /\.(ts|tsx)$/.test(repoPath)),
    ...walkFiles(repoRelative(themeContractDir), (repoPath) => /\.(ts|tsx)$/.test(repoPath)),
    ...themePackages.flatMap(({ repoDir }) => walkFiles(repoDir, (repoPath) => /\.(ts|tsx)$/.test(repoPath)))
  ];

  for (const file of [...new Set(files)].sort()) {
    const sourceText = readText(file);
    for (const specifier of extractImportSpecifiers(sourceText)) {
      if (isRendererWebFile(file)) {
        if (specifier.includes("packages/renderer-core/src") || specifier.includes("@soulforge/renderer-core/src")) {
          issues.push({
            rule: "web-import-src",
            file,
            message: `web shell must not import renderer-core src internals: ${specifier}`
          });
        }

        if (specifier.includes("apps/skin-lab-storybook")) {
          issues.push({
            rule: "web-import-skin-lab",
            file,
            message: `renderer-web must not import skin-lab internals: ${specifier}`
          });
        }

        if (isDirectFixtureOrSchemaImport(specifier) || isCanonicalSpecifier(specifier)) {
          issues.push({
            rule: "web-direct-state-import",
            file,
            message: `renderer-web must not import fixtures, schemas, or canonical tree directly: ${specifier}`
          });
        }

        if (specifier.startsWith(".")) {
          const resolved = resolveImportTarget(file, specifier);
          if (!resolved.startsWith("apps/renderer-web/")) {
            issues.push({
              rule: "web-package-boundary",
              file,
              message: `relative import escapes renderer-web package: ${specifier}`
            });
          }
        }
      }

      if (isSkinLabFile(file)) {
        if (specifier.includes("apps/renderer-web")) {
          issues.push({
            rule: "skin-lab-import-app",
            file,
            message: `skin-lab must not import renderer-web internals: ${specifier}`
          });
        }

        if (isDirectFixtureOrSchemaImport(specifier) || isCanonicalSpecifier(specifier)) {
          issues.push({
            rule: "skin-lab-direct-state-import",
            file,
            message: `skin-lab must not import fixtures, schemas, or canonical tree directly: ${specifier}`
          });
        }

        if (specifier.startsWith(".")) {
          const resolved = resolveImportTarget(file, specifier);
          if (!resolved.startsWith("apps/skin-lab-storybook/")) {
            issues.push({
              rule: "skin-lab-package-boundary",
              file,
              message: `relative import escapes skin-lab package: ${specifier}`
            });
          }
        }
      }

      if (isRendererCoreFile(file)) {
        if (specifier.includes("apps/renderer-web") || specifier.includes("apps/skin-lab-storybook")) {
          issues.push({
            rule: "core-import-app",
            file,
            message: `renderer-core must not import app shells: ${specifier}`
          });
        }

        if (specifier.startsWith(".")) {
          const resolved = resolveImportTarget(file, specifier);
          const isAllowedFixtureImport =
            file === "packages/renderer-core/src/fixtures.ts" &&
            /^fixtures\/ui-state\/.+\.json$/.test(resolved);

          if (!resolved.startsWith("packages/renderer-core/") && !isAllowedFixtureImport) {
            issues.push({
              rule: "core-package-boundary",
              file,
              message: `relative import escapes renderer-core package: ${specifier}`
            });
          }
        }
      }

      if (isRendererReactFile(file)) {
        if (
          specifier.includes("apps/renderer-web") ||
          specifier.includes("apps/skin-lab-storybook") ||
          isDirectFixtureOrSchemaImport(specifier) ||
          isConcreteThemePackageSpecifier(specifier)
        ) {
          issues.push({
            rule: "react-package-boundary",
            file,
            message: `renderer-react must not import app shells, direct fixture/schema state, or concrete theme packages: ${specifier}`
          });
        }

        if (specifier.startsWith(".")) {
          const resolved = resolveImportTarget(file, specifier);
          if (!resolved.startsWith("packages/renderer-react/")) {
            issues.push({
              rule: "react-package-boundary",
              file,
              message: `relative import escapes renderer-react package: ${specifier}`
            });
          }
        }
      }

      if (isThemeContractFile(file)) {
        if (
          specifier.includes("@soulforge/renderer-core") ||
          specifier.includes("@soulforge/renderer-react") ||
          specifier.includes("@soulforge/renderer-web") ||
          specifier.includes("@soulforge/skin-lab-storybook") ||
          specifier.includes("@soulforge/ui-contract") ||
          specifier.includes(".agent/") ||
          specifier.includes(".agent_class/") ||
          specifier.includes("_workspaces/")
        ) {
          issues.push({
            rule: "theme-contract-boundary",
            file,
            message: `theme-contract must stay independent from renderer or canonical packages: ${specifier}`
          });
        }

        if (specifier.startsWith(".")) {
          const resolved = resolveImportTarget(file, specifier);
          if (!resolved.startsWith("packages/theme-contract/")) {
            issues.push({
              rule: "theme-contract-boundary",
              file,
              message: `relative import escapes theme-contract package: ${specifier}`
            });
          }
        }
      }

      const themePackage = getThemePackageForFile(file);
      if (themePackage) {
        if (
          specifier.includes("@soulforge/renderer-core") ||
          specifier.includes("@soulforge/renderer-react") ||
          specifier.includes("@soulforge/renderer-web") ||
          specifier.includes("@soulforge/skin-lab-storybook") ||
          specifier.includes("@soulforge/ui-contract") ||
          specifier.includes("fixtures/ui-state") ||
          specifier.includes("schemas/") ||
          isCanonicalSpecifier(specifier)
        ) {
          issues.push({
            rule: "theme-package-boundary",
            file,
            message: `${themePackage.dirName} must stay independent from renderer app shells and canonical state: ${specifier}`
          });
        }

        if (specifier.startsWith(".")) {
          const resolved = resolveImportTarget(file, specifier);
          if (!resolved.startsWith(`${themePackage.repoDir}/`)) {
            issues.push({
              rule: "theme-package-boundary",
              file,
              message: `relative import escapes ${themePackage.dirName} package: ${specifier}`
            });
          }
        }
      }
    }
  }

  return {
    name: "package boundary lint",
    issues
  } satisfies LintResult;
}
