import { existsSync, promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

export async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/u, ""));
}

// 원자적 교체(#S3-6/S6): 같은 디렉터리 tmp 에 쓴 뒤 rename — 쓰기 중단·동시 실행 시
// truncate/부분 내용 노출을 막는다(python 측 tmp+replace 와 대칭). fs.rename 은 같은
// 파일시스템 내에서 원자적이며 Windows/POSIX 모두 기존 대상을 덮어쓴다.
export async function writeTextAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${randomBytes(6).toString("hex")}`;
  try {
    await fs.writeFile(tmp, data, "utf8");
    await fs.rename(tmp, filePath);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
}

export async function writeJson(filePath, value, options = {}) {
  const trailingNewline = options.trailingNewline ?? true;
  const suffix = trailingNewline ? "\n" : "";
  await writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}${suffix}`);
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
