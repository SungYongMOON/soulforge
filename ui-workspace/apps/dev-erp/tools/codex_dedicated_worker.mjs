import {
  readCodexRuntimeIdentityFingerprint,
  readWorkerAttestationPublicKeyFingerprint,
  readWorkerIdentity,
  safeWorkerErrorCode,
  startCodexDedicatedWorker,
} from "../src/codex_dedicated_worker.mjs";

if (process.argv.includes("--identity-hash")
    || process.argv.includes("--attestation-public-key-fingerprint")
    || process.argv.includes("--codex-runtime-identity-fingerprint")) {
  try {
    let value;
    if (process.argv.includes("--identity-hash")) value = readWorkerIdentity().hash;
    else if (process.argv.includes("--attestation-public-key-fingerprint")) value = readWorkerAttestationPublicKeyFingerprint();
    else value = readCodexRuntimeIdentityFingerprint();
    process.stdout.write(`${value}\n`);
    process.exit(0);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      event: "codex_dedicated_worker_metadata_failed",
      code: safeWorkerErrorCode(error),
    })}\n`);
    process.exit(1);
  }
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  process.stdout.write(`Usage: node tools/codex_dedicated_worker.mjs [metadata mode]\n\nMetadata-only modes:\n  --identity-hash\n  --attestation-public-key-fingerprint\n  --codex-runtime-identity-fingerprint\n\nRequired environment:\n  DEV_ERP_CODEX_WORKER_TOKEN (32-byte base64url HMAC/HKDF key; never transmitted)\n  DEV_ERP_CODEX_WORKER_REF_KEYS_JSON\n    {"active_kid":"<kid>","keys":{"<kid>":"<32-byte-base64url>","<previous-kid>":"<32-byte-base64url>"}}\n  DEV_ERP_CODEX_WORKER_ATTEST_PRIVATE_KEY_FILE (Ed25519 PKCS8 PEM; worker-readable only)\n  DEV_ERP_CODEX_HOME\n  DEV_ERP_CODEX_TURN_PROJECTION_ROOT (plain local, single-active, disposable)\n  DEV_ERP_CODEX_WORKSPACE_REGISTRY\n  DEV_ERP_CODEX_TRUST_DOMAIN\n  DEV_ERP_CODEX_TASK_ATTACHMENT_ROOT (lexical forbidden root; content is not read)\n  DEV_ERP_CODEX_MESSAGE_PAYLOAD_ROOT (lexical forbidden root; content is not read)\n  DEV_ERP_CODEX_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256 (owner-approved aggregate Codex runtime hash)\n\nOptional environment:\n  DEV_ERP_CODEX_WORKER_FORBIDDEN_ROOTS (JSON array of absolute lexical roots)\n  DEV_ERP_CODEX_WORKER_AUTH_WINDOW_MS (default: 10000)\n  DEV_ERP_CODEX_WORKER_CHANNEL_TTL_MS (default: 15000)\n  DEV_ERP_CODEX_WORKER_PORT (default: 0)\n  DEV_ERP_CODEX_WORKER_HOST (must be 127.0.0.1)\n`);
  process.exit(0);
}

let worker = null;
let stopping = false;

async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  try { await worker?.close({ timeoutMs: 5000 }); }
  catch { exitCode = 1; }
  process.exit(exitCode);
}

try {
  process.title = "dev-erp-codex-dedicated-worker";
  worker = await startCodexDedicatedWorker();
  process.stdout.write(`${JSON.stringify({
    event: "codex_dedicated_worker_ready",
    pid: process.pid,
    host: worker.address.address,
    port: worker.address.port,
  })}\n`);
  process.once("SIGINT", () => { void stop(0); });
  process.once("SIGTERM", () => { void stop(0); });
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    event: "codex_dedicated_worker_failed",
    code: safeWorkerErrorCode(error),
  })}\n`);
  process.exitCode = 1;
}
