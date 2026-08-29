// Control-center write policy (RED-03).
//
// The token-gated PUT route may edit only public-safe cataloged text files.
// Protected data planes stay read-only through this surface even when the
// write token is configured, because the catalog intentionally lists some of
// their files for viewing. This module is pure so the boundary is testable
// without starting the dev server; the route stays fail-closed (no token →
// 403) before this policy is ever consulted.

export const CONTROL_CENTER_PROTECTED_WRITE_PREFIXES = Object.freeze([
  "_workspaces/",
  "_workmeta/",
  "private-state/",
  "guild_hall/state/"
]);

export type ControlCenterWriteDecision =
  | { allowed: true; reason: "ok" }
  | { allowed: false; reason: "path_shape_invalid" | "protected_plane_read_only" };

export function classifyControlCenterWrite(repoPath: string): ControlCenterWriteDecision {
  if (typeof repoPath !== "string" || repoPath.length === 0) {
    return { allowed: false, reason: "path_shape_invalid" };
  }

  if (repoPath.includes("\\") || repoPath.startsWith("/") || /^[A-Za-z]:/.test(repoPath)) {
    return { allowed: false, reason: "path_shape_invalid" };
  }

  const segments = repoPath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return { allowed: false, reason: "path_shape_invalid" };
  }

  // Case-insensitive on purpose: Windows filesystems resolve `_WORKMETA` to the
  // same directory, so the standalone contract must not depend on the caller's
  // catalog being case-exact.
  const comparable = repoPath.toLowerCase();
  for (const prefix of CONTROL_CENTER_PROTECTED_WRITE_PREFIXES) {
    if (comparable === prefix.slice(0, -1) || comparable.startsWith(prefix)) {
      return { allowed: false, reason: "protected_plane_read_only" };
    }
  }

  return { allowed: true, reason: "ok" };
}
