import path from "node:path";
import { extractImportSpecifiers, readText, repoRelative, rendererCoreDir, rendererWebDir, resolveRepoPath, walkFiles, type LintResult } from "./shared";

function resolveImportTarget(file: string, specifier: string) {
  const fileAbsolutePath = resolveRepoPath(file);
  return repoRelative(path.resolve(path.dirname(fileAbsolutePath), specifier));
}

function isRendererWebFile(file: string) {
  return file.startsWith("apps/renderer-web/");
}

function isRendererCoreFile(file: string) {
  return file.startsWith("packages/renderer-core/");
}

export function runPackageBoundaryLint() {
  const issues = [];
  const files = [
    ...walkFiles(repoRelative(rendererWebDir), (repoPath) => /\.(ts|tsx)$/.test(repoPath)),
    ...walkFiles(repoRelative(rendererCoreDir), (repoPath) => /\.(ts|tsx)$/.test(repoPath))
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

        if (specifier.includes("fixtures/ui-state") || specifier.includes("schemas/")) {
          issues.push({
            rule: "web-direct-fixture-import",
            file,
            message: `web shell must not import root fixtures or schemas directly: ${specifier}`
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

      if (isRendererCoreFile(file)) {
        if (specifier.includes("apps/renderer-web")) {
          issues.push({
            rule: "core-import-app",
            file,
            message: `renderer-core must not import renderer-web: ${specifier}`
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
    }
  }

  return {
    name: "package boundary lint",
    issues
  } satisfies LintResult;
}
