// The canonical pack-digest recipe: compact JSON over the path-sorted
// {path, sha256, bytes} entries.
//
// It lives here rather than inside the builder because readers outside the
// deployment_pack tools must recompute a pack digest from observed bytes
// WITHOUT importing a builder that can copy, install and remove trees. One
// recipe, one source of truth, no lifted authority.

import { createHash } from "node:crypto";

export function recomputePackDigest(entries) {
  const canonical = JSON.stringify(entries.map(({ path, sha256: digest, bytes }) => ({ path, sha256: digest, bytes })));
  return createHash("sha256").update(Buffer.from(canonical, "utf8")).digest("hex");
}
