import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";

export interface LintIssue {
  rule: string;
  file: string;
  message: string;
}

export interface LintResult {
  name: string;
  issues: LintIssue[];
}

export interface FixtureFile {
  fileName: string;
  name: string;
  absolutePath: string;
  repoPath: string;
  payload: Record<string, unknown>;
}

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const canonicalRootOverride = process.env.UI_LINT_CANONICAL_ROOT?.trim() || null;

export const repoRoot = path.resolve(srcDir, "../../..");
export const fixtureDir = path.resolve(repoRoot, "fixtures/ui-state");
export const schemaPath = path.resolve(repoRoot, "schemas/ui-state.schema.json");
export const rendererCoreDir = path.resolve(repoRoot, "packages/renderer-core");
export const rendererReactDir = path.resolve(repoRoot, "packages/renderer-react");
export const rendererWebDir = path.resolve(repoRoot, "apps/renderer-web");
export const canonicalRoot = canonicalRootOverride ? path.resolve(repoRoot, canonicalRootOverride) : null;

export const EXPECTED_FIXTURES = ["integrated", "overview", "body", "class", "workspaces"] as const;
export const EXPECTED_TABS = ["overview", "body", "class", "workspaces"] as const;
export const ALLOWED_TOOL_FAMILIES = new Set(["adapters", "connectors", "local_cli", "mcp"]);

export const ROW_RULES = {
  skills: {
    category: "skill",
    catalogKey: "skills_catalog"
  },
  tools: {
    category: "tool",
    catalogKey: "tools_catalog"
  },
  knowledge: {
    category: "knowledge",
    catalogKey: "knowledge_catalog"
  },
  workflows: {
    category: "workflow",
    catalogKey: "workflows_catalog"
  }
} as const;

export type RowRuleKey = keyof typeof ROW_RULES;

export function toPosix(value: string) {
  return value.replaceAll(path.sep, "/");
}

export function repoRelative(absolutePath: string) {
  return toPosix(path.relative(repoRoot, absolutePath));
}

export function resolveRepoPath(...segments: string[]) {
  return path.resolve(repoRoot, ...segments);
}

export function resolveReference(reference: string, fromRepoFile?: string) {
  const baseDir = fromRepoFile ? path.dirname(resolveRepoPath(fromRepoFile)) : repoRoot;
  const absolutePath = path.resolve(baseDir, reference);
  return {
    absolutePath,
    repoPath: repoRelative(absolutePath)
  };
}

export function resolveCanonicalPath(...segments: string[]) {
  return canonicalRoot ? path.resolve(canonicalRoot, ...segments) : null;
}

export function resolveCanonicalReference(reference: string, fromCanonicalFile?: string) {
  if (!canonicalRoot) {
    return null;
  }

  const baseDir = fromCanonicalFile ? path.dirname(resolveCanonicalPath(fromCanonicalFile) as string) : canonicalRoot;
  const absolutePath = path.resolve(baseDir, reference);
  return {
    absolutePath,
    repoPath: toPosix(path.relative(canonicalRoot, absolutePath))
  };
}

export function readText(repoPath: string) {
  return readFileSync(resolveRepoPath(repoPath), "utf-8");
}

export function readJsonFile<T>(repoPath: string) {
  return JSON.parse(readText(repoPath)) as T;
}

export function readYamlFile<T>(repoPath: string) {
  return YAML.parse(readText(repoPath)) as T;
}

export function readCanonicalYamlFile<T>(repoPath: string) {
  if (!canonicalRoot) {
    throw new Error("Canonical overlay is not configured.");
  }
  const absolutePath = resolveCanonicalPath(repoPath) as string;
  return YAML.parse(readFileSync(absolutePath, "utf-8")) as T;
}

export function loadFixtures() {
  return readdirSync(fixtureDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort()
    .map((fileName) => {
      const absolutePath = path.resolve(fixtureDir, fileName);
      return {
        fileName,
        name: fileName.replace(/\.sample\.json$/, ""),
        absolutePath,
        repoPath: repoRelative(absolutePath),
        payload: readJsonFile<Record<string, unknown>>(repoRelative(absolutePath))
      } satisfies FixtureFile;
    });
}

export function loadSchemaValidator() {
  const schema = readJsonFile<Record<string, unknown>>(repoRelative(schemaPath));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  return ajv.compile(schema);
}

export function walkFiles(rootDir: string, predicate?: (repoPath: string) => boolean) {
  const absoluteRoot = resolveRepoPath(rootDir);
  const files: string[] = [];

  function walk(currentDir: string) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.resolve(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      const fileRepoPath = repoRelative(absolutePath);
      if (!predicate || predicate(fileRepoPath)) {
        files.push(fileRepoPath);
      }
    }
  }

  walk(absoluteRoot);
  return files.sort();
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asObject(value: unknown) {
  return isObject(value) ? value : null;
}

export function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

export function asArray<T = unknown>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function addIssue(issues: LintIssue[], rule: string, file: string, message: string) {
  issues.push({ rule, file, message });
}

export function printResult(result: LintResult) {
  if (result.issues.length === 0) {
    console.log(`PASS ${result.name}`);
    return;
  }

  console.error(`FAIL ${result.name}`);
  for (const issue of result.issues) {
    console.error(`  [${issue.rule}] ${issue.file}: ${issue.message}`);
  }
}

export function extractImportSpecifiers(sourceText: string) {
  const specifiers = new Set<string>();
  const patterns = [
    /(?:import|export)\s+[\s\S]*?\bfrom\s+["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g
  ];

  for (const pattern of patterns) {
    for (const match of sourceText.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) {
        specifiers.add(specifier);
      }
    }
  }

  return [...specifiers];
}

export function findLineMatches(file: string, pattern: RegExp) {
  const lines = readText(file).split(/\r?\n/);
  return lines
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => pattern.test(line));
}

export function expectedDefaultTab(fixtureName: string) {
  return fixtureName === "integrated" ? "overview" : fixtureName;
}

export function extractCanonicalId(repoPathValue: string, document: Record<string, unknown>) {
  if (repoPathValue.startsWith(".agent_class/profiles/")) {
    return asString(document.profile_id);
  }

  if (repoPathValue.startsWith(".agent_class/")) {
    return asString(document.id);
  }

  if (repoPathValue === ".agent/identity/species_profile.yaml") {
    return asString(document.species_id);
  }

  if (repoPathValue === ".agent/identity/hero_imprint.yaml") {
    return asString(document.hero_imprint_id);
  }

  if (repoPathValue.startsWith(".agent/catalog/identity/species/")) {
    return asString(document.species_id);
  }

  if (repoPathValue.startsWith(".agent/catalog/identity/heroes/")) {
    return asString(document.hero_id);
  }

  return null;
}

export function existsRepoPath(repoPathValue: string) {
  return existsSync(resolveRepoPath(repoPathValue));
}

export function existsCanonicalPath(repoPathValue: string) {
  const absolutePath = resolveCanonicalPath(repoPathValue);
  return absolutePath ? existsSync(absolutePath) : false;
}
