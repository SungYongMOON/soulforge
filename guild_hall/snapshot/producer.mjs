import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { pathExists, writeJson } from "../shared/io.mjs";

export const SNAPSHOT_VERSION = "soulforge.snapshot.v0";
export const SNAPSHOT_PRODUCER = "guild_hall/snapshot";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(__dirname, "../..");

const OWNER_ROOTS = [
  [".registry", "canon_store", "tracked"],
  [".unit", "active_units", "tracked"],
  [".workflow", "workflow_canon", "tracked"],
  [".party", "party_templates", "tracked"],
  [".mission", "held_missions", "tracked"],
  ["guild_hall", "cross_project_operations", "tracked_code_local_state"],
  ["_workspaces", "local_project_worksite", "local_only"],
  ["_workmeta", "project_private_metadata", "nested_private_repo"],
  ["private-state", "continuity_mirror", "nested_private_repo"],
  ["docs", "architecture_docs", "tracked"],
  ["ui-workspace", "derived_ui_consumer", "tracked"],
];

const SNAPSHOT_OWNER_NOTES = [
  "Snapshot is a read-only projection for UI and external hosts.",
  "Snapshot does not replace canonical owner roots.",
  "Private roots are summarized by existence and surface counts only.",
];

export function defaultSnapshotPath(repoRoot = defaultRepoRoot) {
  return path.join(repoRoot, "guild_hall", "state", "snapshot", "soulforge_snapshot.json");
}

export async function buildSnapshot(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const diagnostics = createDiagnostics();

  const roots = await summarizeOwnerRoots(repoRoot);
  const projects = await summarizeProjects(repoRoot, diagnostics);
  const missions = await summarizeMissions(repoRoot, diagnostics);
  const gateway = await summarizeGateway(repoRoot);
  const privateState = await summarizePrivateState(repoRoot);
  const repo = summarizeRepo(repoRoot);

  const snapshot = {
    schema_version: SNAPSHOT_VERSION,
    generated_at: generatedAt,
    source: {
      producer: SNAPSHOT_PRODUCER,
      mode: "local_read_only",
      privacy_mode: "sanitized_metadata_only",
      notes: SNAPSHOT_OWNER_NOTES,
    },
    repo,
    active_slice: {
      id: "snapshot_to_operation_board_v0",
      source_ref: "docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md",
      current_goal: "read-only snapshot -> Dungeon Map -> Mission Board",
    },
    roots,
    projects,
    missions,
    gateway,
    private_state: privateState,
    next_actions: [
      {
        id: "snapshot_schema",
        status: "started",
        summary: "Keep the read-only snapshot contract stable enough for UI consumption.",
      },
      {
        id: "dungeon_map",
        status: "next",
        summary: "Render owner roots and project surfaces from snapshot metadata.",
      },
      {
        id: "mission_board",
        status: "next",
        summary: "Render held mission readiness and blocker summaries from snapshot metadata.",
      },
    ],
    diagnostics: finalizeDiagnostics(diagnostics),
  };

  return snapshot;
}

export async function writeSnapshot(snapshot, outputPath) {
  await writeJson(outputPath, snapshot);
}

export function validateSnapshot(snapshot) {
  const errors = [];

  if (!snapshot || typeof snapshot !== "object") {
    errors.push("snapshot must be an object");
    return buildValidationResult(errors);
  }

  if (snapshot.schema_version !== SNAPSHOT_VERSION) {
    errors.push(`schema_version must be ${SNAPSHOT_VERSION}`);
  }
  for (const key of ["generated_at", "source", "roots", "projects", "missions", "gateway", "diagnostics"]) {
    if (!(key in snapshot)) {
      errors.push(`missing top-level key: ${key}`);
    }
  }
  if (!Array.isArray(snapshot.roots)) {
    errors.push("roots must be an array");
  }
  if (!Array.isArray(snapshot.projects)) {
    errors.push("projects must be an array");
  }
  if (!Array.isArray(snapshot.missions?.items)) {
    errors.push("missions.items must be an array");
  }

  const forbiddenPaths = [
    "guild_hall/state/gateway/mailbox/company/mail/raw",
    "guild_hall/state/gateway/mailbox/personal/mail/raw",
    "guild_hall/state/gateway/mailbox/company/mail/attachments",
    "guild_hall/state/gateway/mailbox/personal/mail/attachments",
    "gmail_token.json",
  ];
  const payload = JSON.stringify(snapshot);
  for (const forbiddenPath of forbiddenPaths) {
    if (payload.includes(forbiddenPath)) {
      errors.push(`snapshot must not expose raw/private path: ${forbiddenPath}`);
    }
  }

  return buildValidationResult(errors);
}

async function summarizeOwnerRoots(repoRoot) {
  const roots = [];
  for (const [root, role, trackingPolicy] of OWNER_ROOTS) {
    const absolutePath = path.join(repoRoot, root);
    roots.push({
      root,
      role,
      tracking_policy: trackingPolicy,
      present: await pathExists(absolutePath),
    });
  }
  return roots;
}

async function summarizeProjects(repoRoot, diagnostics) {
  const workspaceCodes = await listProjectCodes(path.join(repoRoot, "_workspaces"), {
    exclude: new Set([".git"]),
    requireSurface: false,
  });
  const workmetaCodes = await listProjectCodes(path.join(repoRoot, "_workmeta"), {
    exclude: new Set([".git", "templates"]),
    requireSurface: true,
  });

  const projectCodes = Array.from(new Set([...workspaceCodes, ...workmetaCodes])).sort();
  const projects = [];

  for (const projectCode of projectCodes) {
    projects.push({
      project_code: projectCode,
      workspace: await summarizeWorkspaceProject(repoRoot, projectCode),
      workmeta: await summarizeWorkmetaProject(repoRoot, projectCode),
    });
  }

  if (projectCodes.length === 0) {
    diagnostics.warnings.push({
      code: "no_project_surfaces_detected",
      severity: "warning",
      message: "No project code was detected under _workspaces or _workmeta.",
      location_hint: "_workspaces, _workmeta",
    });
  }

  return projects;
}

async function summarizeWorkspaceProject(repoRoot, projectCode) {
  const root = path.join(repoRoot, "_workspaces", projectCode);
  const present = await pathExists(root);
  return {
    present,
    source_ref: `_workspaces/${projectCode}`,
    mode: "local_only",
  };
}

async function summarizeWorkmetaProject(repoRoot, projectCode) {
  const root = path.join(repoRoot, "_workmeta", projectCode);
  const present = await pathExists(root);
  if (!present) {
    return {
      present: false,
      source_ref: `_workmeta/${projectCode}`,
      mode: "nested_private_repo",
      contract_present: false,
      bindings_count: 0,
      report_surfaces: [],
      mission_artifacts_present: false,
    };
  }

  return {
    present: true,
    source_ref: `_workmeta/${projectCode}`,
    mode: "nested_private_repo",
    contract_present: await pathExists(path.join(root, "contract.yaml")),
    bindings_count: await countDirectoryEntries(path.join(root, "bindings"), { filesOnly: true }),
    report_surfaces: await listDirectoryNames(path.join(root, "reports")),
    mission_artifacts_present: await pathExists(path.join(root, "artifacts", "missions")),
  };
}

async function summarizeMissions(repoRoot, diagnostics) {
  const indexPath = path.join(repoRoot, ".mission", "index.yaml");
  const exists = await pathExists(indexPath);
  if (!exists) {
    diagnostics.errors.push({
      code: "mission_index_missing",
      severity: "error",
      message: ".mission/index.yaml is missing.",
      location_hint: ".mission/index.yaml",
    });
    return { source_ref: ".mission/index.yaml", items: [], counts: {} };
  }

  const document = await readYaml(indexPath, diagnostics);
  const entries = Array.isArray(document?.entries) ? document.entries : [];
  const items = entries
    .map((entry) => ({
      mission_id: stringValue(entry?.mission_id),
      title: stringValue(entry?.title),
      project_code: stringValue(entry?.project_code),
      status: stringValue(entry?.status),
      readiness_status: stringValue(entry?.readiness_status),
      workflow_id_present: Boolean(stringValue(entry?.workflow_id)),
      party_id: stringValue(entry?.party_id),
    }))
    .filter((entry) => entry.mission_id)
    .sort((left, right) => left.mission_id.localeCompare(right.mission_id));

  return {
    source_ref: ".mission/index.yaml",
    items,
    counts: countBy(items, (item) => item.status ?? "unknown"),
  };
}

async function summarizeGateway(repoRoot) {
  const gatewayStateRoot = path.join(repoRoot, "guild_hall", "state", "gateway");
  const intakeRoot = path.join(gatewayStateRoot, "intake_inbox");
  const inboxDirs = await listDirectoryNames(intakeRoot, { exclude: new Set(["_index"]) });

  return {
    source_ref: "guild_hall/state/gateway",
    state_root_present: await pathExists(gatewayStateRoot),
    intake_inbox_present: await pathExists(intakeRoot),
    intake_inbox_count: inboxDirs.length,
    monster_index_present: await pathExists(path.join(intakeRoot, "_index", "monster_index.json")),
    mail_fetch_state_present: await pathExists(path.join(gatewayStateRoot, "log", "mail_fetch", "state")),
    mailbox_surfaces: {
      company_present: await pathExists(path.join(gatewayStateRoot, "mailbox", "company")),
      personal_present: await pathExists(path.join(gatewayStateRoot, "mailbox", "personal")),
    },
  };
}

async function summarizePrivateState(repoRoot) {
  const root = path.join(repoRoot, "private-state");
  const present = await pathExists(root);
  return {
    present,
    source_ref: "private-state",
    mode: "nested_private_repo",
    git_present: await pathExists(path.join(root, ".git")),
    git_status: present ? summarizeGit(root) : summarizeEmptyGit(),
    continuity_surfaces: {
      gateway_present: await pathExists(path.join(root, "guild_hall", "state", "gateway")),
      activity_present: await pathExists(path.join(root, "guild_hall", "state", "operations", "soulforge_activity")),
    },
  };
}

function summarizeRepo(repoRoot) {
  return {
    root: ".",
    branch: gitOutput(repoRoot, ["branch", "--show-current"]) || null,
    git_status: summarizeGit(repoRoot),
  };
}

function summarizeGit(cwd) {
  const status = gitOutput(cwd, ["status", "--porcelain"]);
  if (status === null) {
    return {
      available: false,
      dirty: null,
      changed_entries: null,
    };
  }

  const lines = status ? status.split("\n").filter(Boolean) : [];
  return {
    available: true,
    dirty: lines.length > 0,
    changed_entries: lines.length,
  };
}

function summarizeEmptyGit() {
  return {
    available: false,
    dirty: null,
    changed_entries: null,
  };
}

function gitOutput(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim();
}

async function listProjectCodes(root, options = {}) {
  const entries = await listDirectoryNames(root, options);
  if (!options.requireSurface) {
    return entries;
  }

  const result = [];
  for (const entry of entries) {
    const candidateRoot = path.join(root, entry);
    if (
      (await pathExists(path.join(candidateRoot, "contract.yaml"))) ||
      (await pathExists(path.join(candidateRoot, "bindings"))) ||
      (await pathExists(path.join(candidateRoot, "reports")))
    ) {
      result.push(entry);
    }
  }
  return result;
}

async function listDirectoryNames(root, options = {}) {
  const exclude = options.exclude ?? new Set();
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith("."))
      .filter((name) => !exclude.has(name))
      .sort();
  } catch {
    return [];
  }
}

async function countDirectoryEntries(root, options = {}) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    if (options.filesOnly) {
      return entries.filter((entry) => entry.isFile()).length;
    }
    return entries.length;
  } catch {
    return 0;
  }
}

async function readYaml(filePath, diagnostics) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return YAML.parse(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    diagnostics.errors.push({
      code: "yaml_read_failed",
      severity: "error",
      message: error instanceof Error ? error.message : String(error),
      location_hint: path.relative(defaultRepoRoot, filePath).split(path.sep).join("/"),
    });
    return null;
  }
}

function countBy(items, getKey) {
  const counts = {};
  for (const item of items) {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function createDiagnostics() {
  return {
    warnings: [],
    errors: [],
  };
}

function finalizeDiagnostics(diagnostics) {
  return {
    summary: {
      warnings: diagnostics.warnings.length,
      errors: diagnostics.errors.length,
      highest_severity: diagnostics.errors.length > 0 ? "error" : diagnostics.warnings.length > 0 ? "warning" : "ok",
    },
    warnings: diagnostics.warnings,
    errors: diagnostics.errors,
  };
}

function buildValidationResult(errors) {
  return {
    ok: errors.length === 0,
    errors,
  };
}
