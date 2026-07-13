import path from "node:path";
import { lstat, readdir, realpath } from "node:fs/promises";

import { validateTypedRef } from "../shared/temporal_identity.mjs";

export const RAG_OWNER_SCOPES = Object.freeze(["project", "common"]);

export const RAG_ASSET_KINDS = Object.freeze([
  "indexes_local",
  "derived_text",
  "traceability_sidecars",
  "answer_runs",
  "source_text_quality_reviews",
  "source_text_work_cards",
  "operational_routes",
  "output_reservations",
]);

export const COMMON_RAG_ROOT_REF = "_workspaces/knowledge/rag";

const PROJECT_OWNER_SURFACE = "dev_erp";
const PROJECT_CODE_PATTERN = /^[A-Z0-9](?:[A-Z0-9_-]*[A-Z0-9])?$/u;
const SHA256_ID_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const WINDOWS_FORBIDDEN_SEGMENT_PATTERN = /[<>:"|?*]/u;
const WINDOWS_RESERVED_BASENAME_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const LEGACY_PROJECT_INTENTS = new Set(["dry_run", "migration"]);
const ASSET_KIND_SET = new Set(RAG_ASSET_KINDS);

export class RagPathContractError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "RagPathContractError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new RagPathContractError(code, message, details);
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("RAG_PATH_INVALID_INPUT", `${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("RAG_PATH_INVALID_INPUT", `${label} must be a plain object`);
  }
  return value;
}

function assertKnownFields(value, allowedFields, requiredFields, label) {
  assertPlainObject(value, label);
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    fail(
      "RAG_PATH_UNKNOWN_FIELD",
      `${label} has unknown field(s): ${unknown.sort().join(", ")}`,
    );
  }
  const missing = requiredFields.filter(
    (key) => !Object.hasOwn(value, key) || value[key] === undefined,
  );
  if (missing.length > 0) {
    fail(
      "RAG_PATH_MISSING_FIELD",
      `${label} is missing required field(s): ${missing.join(", ")}`,
    );
  }
}

function normalizeOwnerScope(value) {
  if (!RAG_OWNER_SCOPES.includes(value)) {
    fail(
      "RAG_OWNER_SCOPE_INVALID",
      `owner_scope must be exactly one of: ${RAG_OWNER_SCOPES.join(", ")}`,
    );
  }
  return value;
}

function assertNfc(value, label) {
  if (value !== value.normalize("NFC")) {
    fail("RAG_PATH_NOT_NFC", `${label} must already use Unicode NFC`);
  }
}

function normalizeStrictSegment(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    fail("RAG_PATH_SEGMENT_INVALID", `${label} must be a non-empty string`);
  }
  assertNfc(value, label);
  if (
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    fail(
      "RAG_PATH_SEGMENT_INVALID",
      `${label} must not contain separators, dot segments, or control characters`,
    );
  }
  if (/[ .]$/u.test(value)) {
    fail(
      "RAG_PATH_WINDOWS_TRAILING_DOT_SPACE",
      `${label} must not end with a dot or space`,
    );
  }
  if (WINDOWS_FORBIDDEN_SEGMENT_PATTERN.test(value)) {
    fail("RAG_PATH_WINDOWS_FORBIDDEN_NAME", `${label} contains a Windows-forbidden character`);
  }
  if (WINDOWS_RESERVED_BASENAME_PATTERN.test(value)) {
    fail("RAG_PATH_WINDOWS_RESERVED_NAME", `${label} is a Windows-reserved name`);
  }
  return value;
}

function normalizeStrictRepoRef(value, label = "repo-relative ref") {
  if (typeof value !== "string" || value.length === 0) {
    fail("RAG_PATH_REF_INVALID", `${label} must be a non-empty string`);
  }
  assertNfc(value, label);
  if (
    value.startsWith("/") ||
    value.startsWith("\\") ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    /^[A-Za-z]:/u.test(value)
  ) {
    fail(
      "RAG_PATH_ABSOLUTE_OR_UNC",
      `${label} must be canonical POSIX-style and repo-relative`,
    );
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0)) {
    fail("RAG_PATH_EMPTY_SEGMENT", `${label} must not contain empty segments`);
  }
  return segments
    .map((segment, index) => normalizeStrictSegment(segment, `${label}[${index}]`))
    .join("/");
}

function normalizeProjectRef(value) {
  assertPlainObject(value, "project_ref");
  for (const field of ["entity_type", "owner_surface", "entity_id"]) {
    if (typeof value[field] === "string") assertNfc(value[field], `project_ref.${field}`);
  }
  let projectRef;
  try {
    projectRef = validateTypedRef(value);
  } catch (error) {
    fail("RAG_PROJECT_REF_INVALID", `project_ref is not a valid typed ref: ${error.message}`);
  }
  if (projectRef.entity_type !== "project") {
    fail("RAG_PROJECT_REF_TYPE_MISMATCH", "project_ref.entity_type must be project");
  }
  if (projectRef.owner_surface !== PROJECT_OWNER_SURFACE) {
    fail(
      "RAG_PROJECT_REF_OWNER_MISMATCH",
      `project_ref.owner_surface must be ${PROJECT_OWNER_SURFACE}`,
    );
  }
  const projectCode = normalizeStrictSegment(projectRef.entity_id, "project_ref.entity_id");
  if (!PROJECT_CODE_PATTERN.test(projectCode)) {
    fail(
      "RAG_PROJECT_CODE_NONCANONICAL",
      "project_ref.entity_id must be a canonical uppercase project code",
    );
  }
  if (["KNOWLEDGE", "SYSTEM", "_LOCAL"].includes(projectCode)) {
    fail("RAG_PROJECT_CODE_RESERVED", "project_ref.entity_id is reserved by a workspace owner");
  }
  return { project_ref: projectRef, project_code: projectCode };
}

function normalizeAssetKind(value) {
  if (!ASSET_KIND_SET.has(value)) {
    fail(
      "RAG_ASSET_KIND_INVALID",
      `asset_kind must be exactly one of: ${RAG_ASSET_KINDS.join(", ")}`,
    );
  }
  return value;
}

function normalizePathSegments(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    fail("RAG_PATH_SEGMENTS_INVALID", "path_segments must be an array");
  }
  return value.map((segment, index) =>
    normalizeStrictSegment(segment, `path_segments[${index}]`),
  );
}

function collisionKeys(value) {
  if (typeof value !== "string" || value.length === 0) {
    fail("RAG_PATH_REF_INVALID", "collision refs must be non-empty strings");
  }
  if (
    value.startsWith("/") ||
    value.startsWith("\\") ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    /^[A-Za-z]:/u.test(value)
  ) {
    fail("RAG_PATH_ABSOLUTE_OR_UNC", "collision refs must be repo-relative");
  }
  const rawSegments = value.split("/");
  if (
    rawSegments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        CONTROL_CHARACTER_PATTERN.test(segment),
    )
  ) {
    fail("RAG_PATH_SEGMENT_INVALID", "collision refs contain an unsafe segment");
  }
  const nfcSegments = rawSegments.map((segment) => segment.normalize("NFC"));
  const casefoldSegments = nfcSegments.map((segment) => segment.toLocaleLowerCase("und"));
  const trailingSegments = casefoldSegments.map((segment) => segment.replace(/[ .]+$/u, ""));
  return {
    raw: value,
    nfc: nfcSegments.join("/"),
    casefold: casefoldSegments.join("/"),
    trailing_dot_space: trailingSegments.join("/"),
  };
}

export function assertNoWindowsPathCollisions(refs) {
  if (!Array.isArray(refs)) {
    fail("RAG_PATH_COLLISION_REFS_INVALID", "collision refs must be an array");
  }
  const records = refs.map(collisionKeys);
  for (const collisionType of ["nfc", "casefold", "trailing_dot_space"]) {
    const seen = new Map();
    for (const record of records) {
      const key = record[collisionType];
      const prior = seen.get(key);
      if (prior !== undefined && prior !== record.raw) {
        fail(
          "RAG_PATH_WINDOWS_COLLISION",
          `RAG refs collide under Windows ${collisionType} rules`,
          { collision_type: collisionType, refs: [prior, record.raw].sort() },
        );
      }
      seen.set(key, record.raw);
    }
  }
  return {
    status: "no_collision",
    refs: refs.map((ref) => normalizeStrictRepoRef(ref, "collision ref")),
  };
}

export function resolveRagOwnerRoot(input) {
  assertKnownFields(input, ["owner_scope", "project_ref"], ["owner_scope"], "RAG owner input");
  const ownerScope = normalizeOwnerScope(input.owner_scope);
  if (ownerScope === "common") {
    if (input.project_ref !== undefined && input.project_ref !== null) {
      fail("RAG_OWNER_PROJECT_MISMATCH", "common owner_scope must not carry project_ref");
    }
    return {
      owner_scope: ownerScope,
      project_ref: null,
      project_code: null,
      owner_root_ref: COMMON_RAG_ROOT_REF,
    };
  }
  if (input.project_ref === undefined || input.project_ref === null) {
    fail("RAG_PROJECT_REF_REQUIRED", "project owner_scope requires project_ref");
  }
  const project = normalizeProjectRef(input.project_ref);
  return {
    owner_scope: ownerScope,
    project_ref: project.project_ref,
    project_code: project.project_code,
    owner_root_ref: `_workspaces/${project.project_code}/reference_payloads/rag`,
  };
}

export function assertRagPathLexicallyContained(input) {
  assertKnownFields(
    input,
    ["root_ref", "target_ref"],
    ["root_ref", "target_ref"],
    "lexical containment input",
  );
  const rootRef = normalizeStrictRepoRef(input.root_ref, "root_ref");
  const targetRef = normalizeStrictRepoRef(input.target_ref, "target_ref");
  if (targetRef !== rootRef && !targetRef.startsWith(`${rootRef}/`)) {
    fail(
      "RAG_PATH_LEXICAL_ESCAPE",
      "target_ref is not lexically contained by root_ref",
      { root_ref: rootRef, target_ref: targetRef },
    );
  }
  return {
    status: "contained",
    root_ref: rootRef,
    target_ref: targetRef,
    relative_ref: targetRef === rootRef ? "" : targetRef.slice(rootRef.length + 1),
  };
}

export function assertRagTargetMatchesOwner(input) {
  assertKnownFields(
    input,
    ["owner_scope", "project_ref", "target_ref"],
    ["owner_scope", "target_ref"],
    "RAG owner target input",
  );
  const owner = resolveRagOwnerRoot({
    owner_scope: input.owner_scope,
    ...(input.project_ref === undefined ? {} : { project_ref: input.project_ref }),
  });
  const containment = assertRagPathLexicallyContained({
    root_ref: owner.owner_root_ref,
    target_ref: input.target_ref,
  });
  if (!containment.relative_ref) {
    fail("RAG_ASSET_KIND_REQUIRED", "target_ref must select an allowed RAG asset kind");
  }
  const [assetKind] = containment.relative_ref.split("/");
  normalizeAssetKind(assetKind);
  return {
    ...owner,
    asset_kind: assetKind,
    target_ref: containment.target_ref,
    relative_ref: containment.relative_ref,
  };
}

export function resolveRagAssetTarget(input) {
  assertKnownFields(
    input,
    ["owner_scope", "project_ref", "asset_kind", "path_segments", "collision_refs"],
    ["owner_scope", "asset_kind"],
    "RAG asset target input",
  );
  const owner = resolveRagOwnerRoot({
    owner_scope: input.owner_scope,
    ...(input.project_ref === undefined ? {} : { project_ref: input.project_ref }),
  });
  const assetKind = normalizeAssetKind(input.asset_kind);
  const pathSegments = normalizePathSegments(input.path_segments);
  const targetRef = [owner.owner_root_ref, assetKind, ...pathSegments].join("/");
  const collisionRefs = input.collision_refs ?? [];
  if (!Array.isArray(collisionRefs)) {
    fail("RAG_PATH_COLLISION_REFS_INVALID", "collision_refs must be an array");
  }
  assertNoWindowsPathCollisions([targetRef, ...collisionRefs]);
  const containment = assertRagPathLexicallyContained({
    root_ref: `${owner.owner_root_ref}/${assetKind}`,
    target_ref: targetRef,
  });
  return {
    ...owner,
    asset_kind: assetKind,
    asset_root_ref: containment.root_ref,
    target_ref: containment.target_ref,
    path_segments: pathSegments,
  };
}

export function inspectLegacyProjectRagRef(input) {
  assertKnownFields(
    input,
    ["owner_scope", "project_ref", "legacy_ref", "intent"],
    ["owner_scope", "project_ref", "legacy_ref", "intent"],
    "legacy project RAG input",
  );
  if (input.owner_scope !== "project") {
    fail("RAG_LEGACY_PROJECT_SCOPE_REQUIRED", "legacy project inspection requires project owner_scope");
  }
  const owner = resolveRagOwnerRoot({
    owner_scope: input.owner_scope,
    project_ref: input.project_ref,
  });
  if (!LEGACY_PROJECT_INTENTS.has(input.intent)) {
    fail(
      "RAG_LEGACY_PROJECT_WRITE_BLOCKED",
      "legacy project RAG refs are allowed only for explicit dry_run or migration inspection",
    );
  }
  const containment = assertRagPathLexicallyContained({
    root_ref: COMMON_RAG_ROOT_REF,
    target_ref: input.legacy_ref,
  });
  if (!containment.relative_ref) {
    fail("RAG_ASSET_KIND_REQUIRED", "legacy_ref must select an allowed RAG asset kind");
  }
  const [assetKind] = containment.relative_ref.split("/");
  normalizeAssetKind(assetKind);
  return {
    classification: "legacy_project_input",
    intent: input.intent,
    legacy_ref: containment.target_ref,
    asset_kind: assetKind,
    project_ref: owner.project_ref,
    project_code: owner.project_code,
    target_owner_root_ref: owner.owner_root_ref,
    write_allowed: false,
  };
}

function isNativePathContained(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

async function existingPathState(candidatePath) {
  try {
    const stat = await lstat(candidatePath);
    return { exists: true, stat };
  } catch (error) {
    if (error?.code === "ENOENT") return { exists: false, stat: null };
    throw error;
  }
}

async function assertNoWindowsSiblingCollision(parentPath, candidateName) {
  let siblingNames;
  try {
    siblingNames = await readdir(parentPath);
  } catch (error) {
    fail(
      "RAG_PATH_COLLISION_INVENTORY_UNAVAILABLE",
      `write containment could not inventory an existing parent: ${error.code ?? "unknown"}`,
    );
  }
  const candidate = collisionKeys(candidateName);
  for (const siblingName of siblingNames) {
    if (siblingName === candidateName) continue;
    const sibling = collisionKeys(siblingName);
    for (const collisionType of ["nfc", "casefold", "trailing_dot_space"]) {
      if (candidate[collisionType] === sibling[collisionType]) {
        fail(
          "RAG_PATH_WINDOWS_COLLISION",
          `RAG write target collides with an existing sibling under Windows ${collisionType} rules`,
          { collision_type: collisionType, refs: [candidateName, siblingName].sort() },
        );
      }
    }
  }
}

export async function verifyRagWriteContainment(input) {
  assertKnownFields(
    input,
    [
      "repo_root",
      "owner_scope",
      "project_ref",
      "target_ref",
      "approved_owner_root_realpath",
    ],
    ["repo_root", "owner_scope", "target_ref"],
    "RAG write containment input",
  );
  if (typeof input.repo_root !== "string" || !path.isAbsolute(input.repo_root)) {
    fail("RAG_REPO_ROOT_INVALID", "repo_root must be an absolute filesystem path");
  }
  const target = assertRagTargetMatchesOwner({
    owner_scope: input.owner_scope,
    ...(input.project_ref === undefined ? {} : { project_ref: input.project_ref }),
    target_ref: input.target_ref,
  });
  const repoRoot = path.resolve(input.repo_root);
  const ownerRootPath = path.resolve(repoRoot, ...target.owner_root_ref.split("/"));
  const targetPath = path.resolve(repoRoot, ...target.target_ref.split("/"));
  if (!isNativePathContained(repoRoot, ownerRootPath) || !isNativePathContained(ownerRootPath, targetPath)) {
    fail("RAG_PATH_LEXICAL_ESCAPE", "resolved target escaped its lexical owner root");
  }

  let repoRootRealPath;
  try {
    repoRootRealPath = await realpath(repoRoot);
  } catch (error) {
    fail(
      "RAG_REPO_ROOT_UNREADABLE",
      `repo_root must exist and resolve before write verification: ${error.code ?? "unknown"}`,
    );
  }
  const repoRootState = await existingPathState(repoRootRealPath);
  if (!repoRootState.exists || !repoRootState.stat.isDirectory()) {
    fail("RAG_REPO_ROOT_INVALID", "repo_root realpath must be an existing directory");
  }

  let approvedOwnerRootRealPath = null;
  if (input.approved_owner_root_realpath !== undefined) {
    if (
      typeof input.approved_owner_root_realpath !== "string" ||
      !path.isAbsolute(input.approved_owner_root_realpath)
    ) {
      fail(
        "RAG_APPROVED_OWNER_BINDING_INVALID",
        "approved_owner_root_realpath must be an absolute filesystem path",
      );
    }
    try {
      approvedOwnerRootRealPath = await realpath(path.resolve(input.approved_owner_root_realpath));
    } catch (error) {
      fail(
        "RAG_APPROVED_OWNER_BINDING_INVALID",
        `approved owner binding must resolve to an existing directory: ${error.code ?? "unknown"}`,
      );
    }
    const approvedRootState = await existingPathState(approvedOwnerRootRealPath);
    if (!approvedRootState.exists || !approvedRootState.stat.isDirectory()) {
      fail(
        "RAG_APPROVED_OWNER_BINDING_INVALID",
        "approved owner binding must resolve to an existing directory",
      );
    }
  }

  const ownerSegments = target.owner_root_ref.split("/");
  const targetSegments = target.target_ref.split("/");
  const reparseRefs = [];
  let cursorPath = repoRoot;
  let ownerRootExists = false;
  let ownerRootRealPath = null;
  let bindingStatus = "owner_root_missing";
  let targetExists = targetPath === repoRoot;

  for (let index = 0; index < targetSegments.length; index += 1) {
    const segment = targetSegments[index];
    await assertNoWindowsSiblingCollision(cursorPath, segment);
    cursorPath = path.join(cursorPath, segment);
    const state = await existingPathState(cursorPath);
    if (!state.exists) break;
    if (state.stat.isSymbolicLink()) {
      reparseRefs.push(targetSegments.slice(0, index + 1).join("/"));
    }
    const cursorRealPath = await realpath(cursorPath);
    const cursorIsRepoInternal = isNativePathContained(repoRootRealPath, cursorRealPath);
    if (!cursorIsRepoInternal) {
      if (ownerRootRealPath === null) {
        if (approvedOwnerRootRealPath === null) {
          fail(
            "RAG_APPROVED_OWNER_BINDING_REQUIRED",
            "an external owner path requires an explicit approved owner-root binding",
          );
        }
        if (!isNativePathContained(cursorRealPath, approvedOwnerRootRealPath)) {
          fail(
            "RAG_APPROVED_OWNER_BINDING_MISMATCH",
            "an external owner path does not lead to the approved owner-root binding",
          );
        }
      } else if (bindingStatus !== "approved_external") {
        fail(
          "RAG_PATH_REALPATH_ESCAPE",
          "an existing target component resolves outside repo_root without an external owner binding",
        );
      }
    }
    if (state.stat.isSymbolicLink()) {
      if (index <= ownerSegments.length - 1) {
        if (cursorIsRepoInternal) {
          fail(
            "RAG_OWNER_PATH_REPARSE_BLOCKED",
            "repo-internal owner RAG path components must not be symlinks or junctions",
          );
        }
      }
      if (index === targetSegments.length - 1) {
        fail(
          "RAG_FINAL_TARGET_REPARSE_BLOCKED",
          "an existing immutable write target must not be a symlink or junction",
        );
      }
    }
    if (index < targetSegments.length - 1) {
      const resolvedState = state.stat.isSymbolicLink()
        ? await existingPathState(cursorRealPath)
        : state;
      if (!resolvedState.exists || !resolvedState.stat.isDirectory()) {
        fail("RAG_PATH_NON_DIRECTORY_ANCESTOR", "an existing target ancestor is not a directory");
      }
    }
    if (index === ownerSegments.length - 1) {
      ownerRootExists = true;
      ownerRootRealPath = cursorRealPath;
      if (
        approvedOwnerRootRealPath !== null &&
        path.relative(approvedOwnerRootRealPath, ownerRootRealPath) !== ""
      ) {
        fail(
          "RAG_APPROVED_OWNER_BINDING_MISMATCH",
          "resolved owner RAG root does not exactly match the approved owner-root binding",
        );
      }
      bindingStatus = cursorIsRepoInternal ? "repo_internal" : "approved_external";
    }
    if (
      ownerRootRealPath !== null &&
      index > ownerSegments.length - 1 &&
      !isNativePathContained(ownerRootRealPath, cursorRealPath)
    ) {
      fail(
        "RAG_PATH_REALPATH_ESCAPE",
        "an existing target component resolves outside the exact owner RAG root",
      );
    }
    targetExists = cursorPath === targetPath;
  }

  if (approvedOwnerRootRealPath !== null && !ownerRootExists) {
    fail(
      "RAG_APPROVED_OWNER_BINDING_UNVERIFIABLE",
      "approved owner binding cannot be accepted before the lexical owner root exists",
    );
  }

  return {
    status: "contained",
    owner_scope: target.owner_scope,
    project_ref: target.project_ref,
    project_code: target.project_code,
    asset_kind: target.asset_kind,
    target_ref: target.target_ref,
    target_exists: targetExists,
    owner_root_exists: ownerRootExists,
    binding_verified: ownerRootExists,
    binding_status: bindingStatus,
    reparse_refs: reparseRefs,
  };
}

function normalizeDigest(value, label) {
  if (typeof value !== "string" || !SHA256_ID_PATTERN.test(value)) {
    fail("RAG_OUTPUT_DIGEST_INVALID", `${label} must be sha256:<64 lowercase hex>`);
  }
  return value;
}

export function decideImmutableRagOutput(input) {
  assertKnownFields(
    input,
    ["existing_digest", "candidate_digest"],
    ["candidate_digest"],
    "immutable RAG output input",
  );
  const candidateDigest = normalizeDigest(input.candidate_digest, "candidate_digest");
  if (input.existing_digest === undefined || input.existing_digest === null) {
    return {
      decision: "create",
      output_digest: candidateDigest,
      write_allowed: true,
    };
  }
  const existingDigest = normalizeDigest(input.existing_digest, "existing_digest");
  if (existingDigest === candidateDigest) {
    return {
      decision: "idempotent_noop",
      output_digest: candidateDigest,
      write_allowed: false,
    };
  }
  fail(
    "RAG_IMMUTABLE_OUTPUT_CONFLICT",
    "immutable RAG output already exists with a different digest",
    { existing_digest: existingDigest, candidate_digest: candidateDigest },
  );
}
