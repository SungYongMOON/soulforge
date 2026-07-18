export function comparablePathIdentity(value, platform = process.platform) {
  let normalized = String(value);
  // macOS exposes /var through the fixed system alias /private/var. Normalize
  // only that root alias; arbitrary symlink ancestors must still mismatch.
  if (platform === "darwin" && (normalized === "/var" || normalized.startsWith("/var/"))) {
    normalized = `/private${normalized}`;
  }
  return platform === "win32" ? normalized.toLowerCase() : normalized;
}
