import { createHash } from "node:crypto";
import { types } from "node:util";

import { normalizeLinearLb1V2Snapshot } from "./linear_lb1_v2.mjs";

export const LINEAR_LB1_PROJECT_INDEX_SCHEMA_VERSION =
  "soulforge.backup_controller.linear_lb1.project_index.v0";

const HASH_REF = /^sha256:[a-f0-9]{64}$/u;

export class LinearLb1ProjectIndexError extends Error {
  constructor(code) {
    super(code);
    this.name = "LinearLb1ProjectIndexError";
    this.code = code;
  }
}

function fail(code) {
  throw new LinearLb1ProjectIndexError(code);
}

function codepointCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort(codepointCompare)
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function exactOwnData(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some((key) => typeof key !== "string")
      || !keys.every((key) => Object.hasOwn(value, key))) return false;
  return own.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor && descriptor.enumerable && !descriptor.get && !descriptor.set;
  });
}

function projectStorageKey(workspaceId, projectId) {
  return `project-${sha256({ workspace_id: workspaceId, project_id: projectId }).slice(0, 32)}`;
}

function issueSet(issueIds) {
  const sorted = [...issueIds].sort(codepointCompare);
  return {
    issue_count: sorted.length,
    issue_ids: sorted,
    issue_set_sha256: `sha256:${sha256({ issue_ids: sorted })}`,
  };
}

export function buildLinearLb1ProjectIndex(snapshotInput, bindingInput) {
  if (!exactOwnData(bindingInput, ["source_generation_digest", "source_manifest_sha256"])
      || !HASH_REF.test(bindingInput.source_generation_digest)
      || !HASH_REF.test(bindingInput.source_manifest_sha256)) {
    fail("linear_lb1_project_index_binding_invalid");
  }
  let snapshot;
  try {
    snapshot = normalizeLinearLb1V2Snapshot(snapshotInput);
  } catch {
    fail("linear_lb1_project_index_snapshot_invalid");
  }
  if (snapshot.source_scope.scope_mode !== "entire_workspace"
      || snapshot.source_scope.team_ids.length !== 0
      || snapshot.source_scope.project_ids.length !== 0) {
    fail("linear_lb1_project_index_workspace_scope_required");
  }

  const issueIdsByProject = new Map(snapshot.projects.map((project) => [project.project_id, []]));
  const unassignedIssueIds = [];
  for (const issue of snapshot.issues) {
    if (issue.project_id === null) unassignedIssueIds.push(issue.issue_id);
    else {
      const target = issueIdsByProject.get(issue.project_id);
      if (!target) fail("linear_lb1_project_index_project_uncovered");
      target.push(issue.issue_id);
    }
  }

  const projects = snapshot.projects.map((project) => ({
    project_id: project.project_id,
    project_name: project.name,
    team_id: project.team_id,
    project_storage_key: projectStorageKey(snapshot.source_scope.workspace_id, project.project_id),
    ...issueSet(issueIdsByProject.get(project.project_id)),
  })).sort((left, right) => codepointCompare(left.project_id, right.project_id));
  const unassigned = {
    project_storage_key: "unassigned",
    ...issueSet(unassignedIssueIds),
  };
  const classifiedIssueCount = projects.reduce((sum, project) => sum + project.issue_count, 0);
  if (classifiedIssueCount + unassigned.issue_count !== snapshot.issues.length) {
    fail("linear_lb1_project_index_issue_partition_incomplete");
  }
  const body = {
    schema_version: LINEAR_LB1_PROJECT_INDEX_SCHEMA_VERSION,
    source_generation_digest: bindingInput.source_generation_digest,
    source_manifest_sha256: bindingInput.source_manifest_sha256,
    workspace_id: snapshot.source_scope.workspace_id,
    snapshot_id: snapshot.snapshot_id,
    collected_at: snapshot.collected_at,
    cutoff_at: snapshot.cutoff.cutoff_at,
    project_count: projects.length,
    total_issue_count: snapshot.issues.length,
    classified_issue_count: classifiedIssueCount,
    unassigned_issue_count: unassigned.issue_count,
    projects,
    unassigned,
  };
  return deepFreeze({ ...body, project_index_sha256: `sha256:${sha256(body)}` });
}

export function verifyLinearLb1ProjectIndex(indexInput, snapshotInput, bindingInput) {
  if (indexInput === null || typeof indexInput !== "object" || Array.isArray(indexInput)
      || types.isProxy(indexInput)) return false;
  let expected;
  try { expected = buildLinearLb1ProjectIndex(snapshotInput, bindingInput); }
  catch { return false; }
  try { return stableJson(indexInput) === stableJson(expected); }
  catch { return false; }
}
