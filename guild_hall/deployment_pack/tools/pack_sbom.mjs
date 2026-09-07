// Read/check by default. --create writes only the two absent/exact sidecars.
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPackSbom, readSbomFile, SBOM_LIMITS, SBOM_POLICY, sha256 } from "../src/pack_sbom.mjs";
import { readPackGeneration, writeSbomArtifacts } from "../src/pack_sbom_artifact.mjs";

export function packSbomMain(args) {
  if (args.length === 1 && args[0] === "--help") return "usage: node pack_sbom.mjs --pack <directory> --manifest-sha256 <64-hex> [--create]\nDefault checks exact manifest pin, full payload and existing SBOM. --create requires the declared SBOM policy and writes create-only/exact-reuse sibling SBOM and receipt. Undeclared legacy manifests remain NOT_VERIFIED even with sidecars. No network or release promotion.\n";
  let packDir, pin, create = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--create" && !create) create = true;
    else if (args[i] === "--pack" && !packDir && args[i + 1]) packDir = resolve(args[++i]);
    else if (args[i] === "--manifest-sha256" && !pin && args[i + 1]) pin = args[++i];
    else throw Object.assign(new Error("sbom_arguments_invalid"), { code: "sbom_arguments_invalid" });
  }
  if (!packDir || !/^[a-f0-9]{64}$/.test(pin ?? "")) throw Object.assign(new Error("sbom_arguments_invalid"), { code: "sbom_arguments_invalid" });
  const manifestBytes = readSbomFile(join(packDir, "pack.manifest.json"), SBOM_LIMITS.manifest);
  if (sha256(manifestBytes) !== pin) throw Object.assign(new Error("sbom_manifest_pin_invalid"), { code: "sbom_manifest_pin_invalid" });
  if (create) {
    let manifest;
    try { manifest = JSON.parse(manifestBytes); } catch { throw Object.assign(new Error("sbom_manifest_invalid"), { code: "sbom_manifest_invalid" }); }
    if (manifest?.sbom_policy !== SBOM_POLICY) throw Object.assign(new Error("sbom_policy_required"), { code: "sbom_policy_required" });
    writeSbomArtifacts(packDir, createPackSbom({ manifestBytes, expectedManifestSha256: pin, payloadRoot: join(packDir, "payload") }));
  }
  const generation = readPackGeneration({ packDir });
  if (sha256(generation.manifestBytes) !== pin) throw Object.assign(new Error("sbom_manifest_pin_invalid"), { code: "sbom_manifest_pin_invalid" });
  return `${JSON.stringify(generation.evidence, null, 2)}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const output = packSbomMain(process.argv.slice(2));
    process.stdout.write(output);
    if (output.includes('"status": "NOT_VERIFIED"')) process.exitCode = 1;
  } catch (error) { process.stderr.write(`${error.code?.startsWith("sbom_") ? error.code : "sbom_check_failed"}\n`); process.exitCode = 1; }
}
