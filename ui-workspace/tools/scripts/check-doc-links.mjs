import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");

const SCAN_TARGETS = [
  "README.md",
  "docs/architecture",
  "docs/ui",
  "ui-workspace"
];

const MARKDOWN_LINK_PATTERN = /\[[^\]]+\]\(([^)]+)\)/g;

function toPosix(value) {
  return value.replaceAll(path.sep, "/");
}

function repoRelative(absolutePath) {
  return toPosix(path.relative(repoRoot, absolutePath));
}

function isMarkdownFile(fileName) {
  return fileName.endsWith(".md");
}

function collectMarkdownFiles(targetPath, files) {
  const absolutePath = path.resolve(repoRoot, targetPath);
  if (!existsSync(absolutePath)) {
    return;
  }
  const stats = statSync(absolutePath);

  if (stats.isFile()) {
    files.push(absolutePath);
    return;
  }

  for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
      continue;
    }

    const childPath = path.resolve(absolutePath, entry.name);
    if (entry.isDirectory()) {
      collectMarkdownFiles(repoRelative(childPath), files);
      continue;
    }

    if (entry.isFile() && isMarkdownFile(entry.name)) {
      files.push(childPath);
    }
  }
}

function normalizeTarget(target) {
  return target.split("#")[0]?.split("?")[0] ?? "";
}

function shouldIgnoreTarget(target) {
  return (
    target.length === 0 ||
    target.startsWith("#") ||
    target.startsWith("http://") ||
    target.startsWith("https://") ||
    target.startsWith("mailto:")
  );
}

const markdownFiles = [];
for (const target of SCAN_TARGETS) {
  collectMarkdownFiles(target, markdownFiles);
}

const issues = [];

for (const markdownFile of markdownFiles.sort()) {
  const sourceText = readFileSync(markdownFile, "utf-8");
  const sourceLines = sourceText.split(/\r?\n/);
  const sourceRepoPath = repoRelative(markdownFile);

  for (const match of sourceText.matchAll(MARKDOWN_LINK_PATTERN)) {
    const rawTarget = match[1]?.trim() ?? "";
    if (shouldIgnoreTarget(rawTarget)) {
      continue;
    }

    const resolvedTarget = normalizeTarget(rawTarget);
    if (!resolvedTarget) {
      continue;
    }

    const absoluteTarget = path.resolve(path.dirname(markdownFile), resolvedTarget);
    if (existsSync(absoluteTarget)) {
      continue;
    }

    const matchIndex = match.index ?? 0;
    const lineNumber = sourceText.slice(0, matchIndex).split(/\r?\n/).length;
    const line = sourceLines[lineNumber - 1] ?? "";
    issues.push({
      file: sourceRepoPath,
      lineNumber,
      link: rawTarget,
      line: line.trim()
    });
  }
}

if (issues.length > 0) {
  console.error("FAIL docs relative links");
  for (const issue of issues) {
    console.error(`  ${issue.file}:${issue.lineNumber} -> ${issue.link}`);
    console.error(`    ${issue.line}`);
  }
  process.exit(1);
}

console.log("PASS docs relative links");
