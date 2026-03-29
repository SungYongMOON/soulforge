import { existsSync, promises as fs } from "node:fs";
import path from "node:path";

export async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function writeJson(filePath, value, options = {}) {
  const trailingNewline = options.trailingNewline ?? true;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const suffix = trailingNewline ? "\n" : "";
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}${suffix}`, "utf8");
}

export async function appendJsonl(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

export async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function pathExistsSync(filePath) {
  return existsSync(filePath);
}

export function normalizeRepoPath(value) {
  return String(value).split(path.sep).join("/");
}

export function relativeToRepo(repoRoot, filePath) {
  return normalizeRepoPath(path.relative(repoRoot, filePath) || ".");
}

export function relativeToRepoOrAbsolute(repoRoot, filePath) {
  const relative = path.relative(repoRoot, filePath);
  if (!relative || !relative.startsWith("..")) {
    return normalizeRepoPath(relative || ".");
  }
  return filePath;
}
