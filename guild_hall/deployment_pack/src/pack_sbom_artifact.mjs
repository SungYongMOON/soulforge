// Artifact IO belongs to the builder/lifecycle staging layer. The generator
// only returns bytes. Keep these siblings outside the payload digest recipe.
import { existsSync, lstatSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { SBOM_LIMITS, SBOM_POLICY, readSbomFile, sha256, verifyPackPayload, verifyPackSbom } from "./pack_sbom.mjs";

const fail = (code) => { throw Object.assign(new Error(code), { code }); };
export const generationNames = (previous = false) => ({
  manifest: previous ? "pack.manifest.prev.json" : "pack.manifest.json",
  sbom: previous ? "pack.sbom.prev.cdx.json" : "pack.sbom.cdx.json",
  receipt: previous ? "pack.sbom.prev.receipt.json" : "pack.sbom.receipt.json",
});

export function verifyGenerationPayload(generation, payloadRoot) {
  const input = { manifestBytes: generation.manifestBytes, expectedManifestSha256: sha256(generation.manifestBytes), payloadRoot };
  if (generation.sbomBytes) {
    const result = verifyPackSbom({ ...input, sbomBytes: generation.sbomBytes });
    if (!generation.receiptBytes?.equals(result.receiptBytes)) fail("sbom_receipt_mismatch");
    return result.evidence;
  }
  const manifest = verifyPackPayload(input);
  if (manifest.sbom_policy === SBOM_POLICY) fail("sbom_artifact_required");
  return { status: "NOT_VERIFIED", reason: "legacy_sbom_absent", manifest_sha256: input.expectedManifestSha256, sbom_sha256: null, payload_integrity: "VERIFIED", release_acceptance: "NOT_GRANTED" };
}

export function readPackGeneration({ packDir, previous = false }) {
  const dir = resolve(packDir), names = generationNames(previous);
  const manifestBytes = readSbomFile(join(dir, names.manifest), SBOM_LIMITS.manifest);
  // Payload verification owns strict UTF-8/JSON/manifest shape validation.
  let manifest;
  try { manifest = JSON.parse(manifestBytes); } catch { fail("sbom_manifest_invalid"); }
  const sbomPath = join(dir, names.sbom), receiptPath = join(dir, names.receipt);
  // lstat handles dangling links as present; they must never become legacy.
  const present = (path) => { try { lstatSync(path); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } };
  const hasSbom = present(sbomPath), hasReceipt = present(receiptPath);
  if (hasSbom !== hasReceipt || (manifest?.sbom_policy !== undefined && manifest.sbom_policy !== SBOM_POLICY)
    || (manifest?.sbom_policy === SBOM_POLICY && !hasSbom)) fail("sbom_artifact_required");
  const generation = { manifest, manifestBytes,
    sbomBytes: hasSbom ? readSbomFile(sbomPath, SBOM_LIMITS.sbom) : null,
    receiptBytes: hasReceipt ? readSbomFile(receiptPath, 16 * 1024) : null };
  generation.evidence = verifyGenerationPayload(generation, join(dir, previous ? "payload.prev" : "payload"));
  return generation;
}

function assertOutputParent(path) {
  let dir = dirname(resolve(path));
  while (true) {
    const info = lstatSync(dir);
    if (info.isSymbolicLink() || !info.isDirectory()) fail("sbom_output_parent_invalid");
    const parent = dirname(dir);
    if (dir === parent) break;
    dir = parent;
  }
}

// Static destination guards before the existing lifecycle's copy/swap writes.
// Only directory/file metadata is inspected; no target file bodies are read.
export function assertGenerationWriteTarget(dir) {
  const target = resolve(dir);
  let ancestor = target;
  while (!existsSync(ancestor)) {
    // A dangling link must not be treated as an absent directory.
    try { lstatSync(ancestor); fail("sbom_output_kind_invalid"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    ancestor = dirname(ancestor);
  }
  assertOutputParent(join(ancestor, "metadata"));
  let count = 0;
  const walk = (path) => {
    if (++count > SBOM_LIMITS.entries * 3) fail("sbom_limit_exceeded");
    const info = lstatSync(path);
    if (info.isSymbolicLink() || (!info.isDirectory() && (!info.isFile() || info.nlink !== 1))) fail("sbom_output_kind_invalid");
    if (info.isDirectory()) for (const name of readdirSync(path)) walk(join(path, name));
  };
  if (existsSync(target)) walk(target);
}

// Default CLI output is create-only or exact reuse. No repair/overwrite mode.
export function writeSbomArtifacts(packDir, { bytes, receiptBytes }) {
  const names = generationNames();
  const writes = [[join(packDir, names.sbom), bytes], [join(packDir, names.receipt), receiptBytes]];
  for (const [path, content] of writes) {
    assertOutputParent(path);
    if (existsSync(path) && !readSbomFile(resolve(path), SBOM_LIMITS.sbom).equals(content)) fail("sbom_output_exists_different");
  }
  for (const [path, content] of writes) if (!existsSync(path)) writeFileSync(path, content, { flag: "wx" });
}

// Only existing builder/lifecycle controlled staging calls this overwrite
// adapter after verifying the source generation and the destination payload.
export function writeGenerationMetadata(dir, generation, previous = false) {
  const names = generationNames(previous);
  for (const name of Object.values(names)) {
    const path = join(dir, name);
    assertOutputParent(path);
    try {
      const info = lstatSync(path);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail("sbom_output_kind_invalid");
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  writeFileSync(join(dir, names.manifest), generation.manifestBytes);
  for (const [name, content] of [[names.sbom, generation.sbomBytes], [names.receipt, generation.receiptBytes]]) {
    if (content) writeFileSync(join(dir, name), content);
    else rmSync(join(dir, name), { force: true });
  }
}

export function clearGenerationMetadata(dir, previous = false) {
  for (const name of Object.values(generationNames(previous))) rmSync(join(dir, name), { force: true });
}
