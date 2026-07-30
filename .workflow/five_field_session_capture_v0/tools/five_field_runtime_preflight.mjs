import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, basename, dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  canonicalize,
  operationalNonAcceptanceReceipt,
} from "./five_field_recovery_contract.mjs";
import { createHash } from "node:crypto";

export const RUNTIME_PREFLIGHT_INPUT_SCHEMA =
  "soulforge.five_field_runtime_preflight_input.v1";
export const RUNTIME_PREFLIGHT_RECEIPT_SCHEMA =
  "soulforge.five_field_runtime_preflight_receipt.v1";

const ROOT_LABELS = Object.freeze([
  "runner",
  "source",
  "writer_workmeta",
  "writer_private_state",
  "config",
  "locks",
]);
const ROOT_BASENAMES = Object.freeze({
  runner: "runner",
  source: "source",
  writer_workmeta: "writer-workmeta",
  writer_private_state: "writer-private-state",
  config: "config",
  locks: "locks",
});
const REQUIRED_FORBIDDEN_ROOT_KINDS = new Set([
  "active_public_repo",
  "active_workmeta",
  "active_private_state",
  "codex_worktree",
  "orca_worktree",
  "installed_automation_control",
]);
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;
const FORBIDDEN_KEY_RE =
  /^(?:raw|chat|payload|body|messages?|transcript|credentials?|tokens?|passwords?|cookies?|sessions?|remote_url|url|userinfo)$/iu;
const SECRET_RE =
  /(?:ghp_[A-Za-z0-9]{8,}|xoxb-[A-Za-z0-9-]{8,}|AKIA[A-Z0-9]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|passwd|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|authorization|bearer|credential|cookie)\s*[:=]\s*\S+)/iu;
const URL_RE = /(?:^[a-z][a-z0-9+.-]*:\/\/|^git@)/iu;
const STALE_RECOVERY_POLICY =
  "same_host_dead_pid_expired_owner_approved";

class PreflightError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function fail(code) {
  throw new PreflightError(code);
}

function exactKeys(value, allowed, code) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.keys(value).some((key) => !allowed.includes(key))
    || allowed.some((key) => !Object.hasOwn(value, key))
  ) fail(code);
}

function rejectSensitive(value, key = null) {
  if (key && FORBIDDEN_KEY_RE.test(key)) fail("input_boundary_invalid");
  if (Array.isArray(value)) {
    for (const item of value) rejectSensitive(item);
    return;
  }
  if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) {
      rejectSensitive(child, childKey);
    }
    return;
  }
  if (typeof value !== "string") return;
  if (SECRET_RE.test(value) || URL_RE.test(value)) {
    fail("input_boundary_invalid");
  }
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function comparablePath(value) {
  const normalized = resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function pathContains(root, target) {
  const rel = relative(root, target);
  return rel === "" || (
    rel !== ".."
    && !rel.startsWith(`..${sep}`)
    && !isAbsolute(rel)
  );
}

function exactDirectoryRealpath(value, code) {
  if (
    typeof value !== "string"
    || !isAbsolute(value)
    || /[\0\r\n]/u.test(value)
  ) fail(code);
  let physical;
  let stat;
  try {
    physical = realpathSync.native(resolve(value));
    stat = lstatSync(resolve(value));
  } catch {
    fail(code);
  }
  if (
    comparablePath(physical) !== comparablePath(value)
    || !stat.isDirectory()
    || stat.isSymbolicLink()
  ) fail(code);
  return physical;
}

function exactFileRealpath(value, code) {
  if (
    typeof value !== "string"
    || !isAbsolute(value)
    || /[\0\r\n]/u.test(value)
  ) fail(code);
  let physical;
  let stat;
  try {
    physical = realpathSync.native(resolve(value));
    stat = lstatSync(resolve(value));
  } catch {
    fail(code);
  }
  if (
    comparablePath(physical) !== comparablePath(value)
    || !stat.isFile()
    || stat.isSymbolicLink()
  ) fail(code);
  return physical;
}

function assertPairwiseDisjoint(roots) {
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      if (
        pathContains(roots[left], roots[right])
        || pathContains(roots[right], roots[left])
      ) fail("runtime_roots_overlap");
    }
  }
}

function assertDigest(value, code) {
  if (typeof value !== "string" || !DIGEST_RE.test(value)) fail(code);
}

function assertEvidence(evidence) {
  exactKeys(
    evidence,
    ["acl", "nas", "restore", "fencing"],
    "runtime_evidence_contract_invalid",
  );
  exactKeys(evidence.acl, [
    "status",
    "principal_intent",
    "runner_read_execute",
    "source_read_only",
    "config_read_only",
    "writers_modify",
    "locks_modify",
    "active_roots_write_denied",
    "attestation_digest",
  ], "acl_evidence_contract_invalid");
  if (
    evidence.acl.status !== "VERIFIED"
    || evidence.acl.principal_intent !== "dedicated_runner_least_privilege"
    || !evidence.acl.runner_read_execute
    || !evidence.acl.source_read_only
    || !evidence.acl.config_read_only
    || !evidence.acl.writers_modify
    || !evidence.acl.locks_modify
    || !evidence.acl.active_roots_write_denied
  ) fail("acl_evidence_missing");
  assertDigest(evidence.acl.attestation_digest, "acl_attestation_invalid");

  exactKeys(
    evidence.nas,
    ["status", "classifications", "attestation_digest"],
    "nas_evidence_contract_invalid",
  );
  exactKeys(
    evidence.nas.classifications,
    ROOT_LABELS,
    "nas_classification_contract_invalid",
  );
  const expectedNas = {
    runner: "regenerable_excluded",
    source: "regenerable_excluded",
    writer_workmeta: "backup_recovery_included",
    writer_private_state: "backup_recovery_included",
    config: "secret_operational_capture_prohibited",
    locks: "ephemeral_excluded",
  };
  if (
    evidence.nas.status !== "VERIFIED"
    || ROOT_LABELS.some((label) =>
      evidence.nas.classifications[label] !== expectedNas[label])
  ) fail("nas_evidence_missing");
  assertDigest(evidence.nas.attestation_digest, "nas_attestation_invalid");

  exactKeys(evidence.restore, [
    "status",
    "ledger_restore_tested",
    "cursor_restore_tested",
    "attestation_digest",
  ], "restore_evidence_contract_invalid");
  if (
    evidence.restore.status !== "VERIFIED"
    || !evidence.restore.ledger_restore_tested
    || !evidence.restore.cursor_restore_tested
  ) fail("restore_evidence_missing");
  assertDigest(
    evidence.restore.attestation_digest,
    "restore_attestation_invalid",
  );

  exactKeys(evidence.fencing, [
    "status",
    "single_writer",
    "host_identity_digest",
    "writer_epoch",
    "stale_recovery_policy",
    "attestation_digest",
  ], "fencing_evidence_contract_invalid");
  if (
    evidence.fencing.status !== "VERIFIED"
    || !evidence.fencing.single_writer
    || !Number.isSafeInteger(evidence.fencing.writer_epoch)
    || evidence.fencing.writer_epoch < 1
    || evidence.fencing.stale_recovery_policy !== STALE_RECOVERY_POLICY
  ) fail("fencing_evidence_missing");
  assertDigest(
    evidence.fencing.host_identity_digest,
    "host_identity_attestation_invalid",
  );
  assertDigest(
    evidence.fencing.attestation_digest,
    "fencing_attestation_invalid",
  );
}

function holdReceipt(code) {
  return {
    schema_version: RUNTIME_PREFLIGHT_RECEIPT_SCHEMA,
    status: "HOLD",
    hold_reasons: [code],
    manifest_digest: null,
    launch_binding_digest: null,
    topology: {
      root_labels: [...ROOT_LABELS],
      same_parent: false,
      canonical_realpaths: false,
      reparse_free: false,
      pairwise_disjoint: false,
      forbidden_root_clear: false,
    },
    evidence: {
      acl: "UNKNOWN",
      nas: "UNKNOWN",
      restore: "UNKNOWN",
      fencing: "UNKNOWN",
    },
    ...operationalNonAcceptanceReceipt(),
  };
}

export function runtimeLaunchBindingDigest({
  runner_root,
  config_root,
  input_path,
}) {
  return sha256(canonicalize({
    runner_root,
    config_root,
    input_path,
  }));
}

export function runRuntimePreflight(input) {
  try {
    exactKeys(input, [
      "schema_version",
      "roots",
      "launch",
      "forbidden_roots",
      "evidence",
    ], "runtime_preflight_contract_invalid");
    if (input.schema_version !== RUNTIME_PREFLIGHT_INPUT_SCHEMA) {
      fail("runtime_preflight_schema_invalid");
    }
    exactKeys(input.roots, ROOT_LABELS, "runtime_roots_contract_invalid");
    exactKeys(input.launch, ["input_path"], "runtime_launch_contract_invalid");
    if (!Array.isArray(input.forbidden_roots)) {
      fail("forbidden_roots_contract_invalid");
    }
    for (const row of input.forbidden_roots) {
      exactKeys(row, ["kind", "path"], "forbidden_root_contract_invalid");
      if (
        typeof row.kind !== "string"
        || !/^[a-z][a-z0-9_]{0,79}$/u.test(row.kind)
      ) fail("forbidden_root_kind_invalid");
    }
    rejectSensitive(input);
    assertEvidence(input.evidence);

    const roots = {};
    for (const label of ROOT_LABELS) {
      roots[label] = exactDirectoryRealpath(
        input.roots[label],
        "runtime_root_realpath_invalid",
      );
      if (basename(roots[label]) !== ROOT_BASENAMES[label]) {
        fail("runtime_root_name_invalid");
      }
    }
    assertPairwiseDisjoint(ROOT_LABELS.map((label) => roots[label]));
    const parents = new Set(
      ROOT_LABELS.map((label) => comparablePath(dirname(roots[label]))),
    );
    if (parents.size !== 1) fail("runtime_roots_not_siblings");
    const inputPath = exactFileRealpath(
      input.launch.input_path,
      "runtime_input_realpath_invalid",
    );
    if (
      comparablePath(inputPath) === comparablePath(roots.config)
      || !pathContains(roots.config, inputPath)
    ) fail("runtime_input_outside_config");

    const forbiddenKinds = new Set();
    const forbiddenRoots = input.forbidden_roots.map((row) => {
      forbiddenKinds.add(row.kind);
      return exactDirectoryRealpath(
        row.path,
        "forbidden_root_realpath_invalid",
      );
    });
    for (const required of REQUIRED_FORBIDDEN_ROOT_KINDS) {
      if (!forbiddenKinds.has(required)) fail("forbidden_root_kind_missing");
    }
    for (const root of Object.values(roots)) {
      for (const forbidden of forbiddenRoots) {
        if (pathContains(root, forbidden) || pathContains(forbidden, root)) {
          fail("forbidden_root_overlap");
        }
      }
    }

    const manifestDigest = sha256(canonicalize(input));
    const launchBindingDigest = runtimeLaunchBindingDigest({
      runner_root: roots.runner,
      config_root: roots.config,
      input_path: inputPath,
    });
    return {
      schema_version: RUNTIME_PREFLIGHT_RECEIPT_SCHEMA,
      status: "PASS",
      hold_reasons: [],
      manifest_digest: manifestDigest,
      launch_binding_digest: launchBindingDigest,
      topology: {
        root_labels: [...ROOT_LABELS],
        same_parent: true,
        canonical_realpaths: true,
        reparse_free: true,
        pairwise_disjoint: true,
        forbidden_root_clear: true,
      },
      evidence: {
        acl: "VERIFIED",
        nas: "VERIFIED",
        restore: "VERIFIED",
        fencing: "VERIFIED",
      },
      ...operationalNonAcceptanceReceipt(),
    };
  } catch (error) {
    return holdReceipt(
      error instanceof PreflightError
        ? error.code
        : "runtime_preflight_failed",
    );
  }
}

function isMain() {
  return process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMain()) {
  process.stdout.write(`${JSON.stringify(holdReceipt(
    "runtime_preflight_library_only",
  ))}\n`);
  process.exitCode = 2;
}
