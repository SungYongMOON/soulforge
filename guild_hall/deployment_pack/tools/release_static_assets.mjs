// The static tree also holds owner-local/private skins. Only ordinary Git
// tracked assets belong to a public Pack; never enumerate that tree on disk.
import { spawnSync } from "node:child_process";

export function listReleaseStaticAssets(rootDir, staticRoot) {
  if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(staticRoot)) throw new Error("release_static_root_invalid");
  const env = { ...process.env };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete env[key];
  const result = spawnSync("git", ["ls-files", "--stage", "-z", "--", staticRoot], { cwd: rootDir, env, encoding: "utf8", windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0) throw new Error("release_static_git_inventory_failed");
  const files = [];
  for (const entry of result.stdout.split("\0").filter(Boolean)) {
    const match = /^(100644|100755) [a-f0-9]+ 0\t(.+)$/.exec(entry);
    if (!match) throw new Error("release_static_nonregular_or_unmerged_asset");
    const path = match[2];
    if (!path.startsWith(`${staticRoot}/`) || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path)
      || path.split("/").some((part) => /^\.+$/.test(part))) throw new Error("release_static_path_invalid");
    // This exclusion remains even if a private skin is accidentally force-added.
    // Its authority is static/skins/README.md plus the root .gitignore policy.
    if (path.startsWith(`${staticRoot}/skins/dungeons/`) || path.startsWith(`${staticRoot}/skins/main.`)) continue;
    files.push(path);
  }
  if (!files.length) throw new Error("release_static_inventory_empty");
  return files.sort();
}
