import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";

const API_PREFIX = "/__control_center_api";
const TEXT_EXTENSIONS = new Set([".md", ".yaml", ".yml", ".json"]);
const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const integratedFixtureRepoPath = "ui-workspace/fixtures/ui-state/integrated.sample.json";

type ControlCenterOwnerId = "body" | "class" | "guild_hall" | "operations" | "docs";

interface ControlCenterFileRecord {
  path: string;
  label: string;
  ownerId: ControlCenterOwnerId;
  sectionId: string;
  sectionLabel: string;
  sectionDescription: string;
  editable: boolean;
  category: "canonical" | "generated" | "doc" | "archive";
  size: number;
  updatedAt: string;
}

interface ControlCenterSection {
  id: string;
  label: string;
  description: string;
  files: ControlCenterFileRecord[];
}

interface ControlCenterOwner {
  id: ControlCenterOwnerId;
  label: string;
  description: string;
  sections: ControlCenterSection[];
}

function normalizeRepoPath(value: string) {
  return value.split(path.sep).join("/");
}

function resolveRepoPath(repoPath: string) {
  return path.resolve(repoRoot, repoPath);
}

function isTextFile(repoPath: string) {
  return TEXT_EXTENSIONS.has(path.extname(repoPath));
}

function isEditableFile(repoPath: string) {
  return isTextFile(repoPath);
}

function fileCategoryFor(repoPath: string): ControlCenterFileRecord["category"] {
  if (repoPath.startsWith("docs/") || repoPath === "README.md" || repoPath === "AGENTS.md") {
    return "doc";
  }

  return "canonical";
}

function isLegacyWorkspaceBridgeDir(name: string) {
  return name === "company" || name === "personal";
}

async function statFile(repoPath: string) {
  const absolutePath = resolveRepoPath(repoPath);
  const stats = await fs.stat(absolutePath);

  return {
    size: stats.size,
    updatedAt: stats.mtime.toISOString()
  };
}

async function buildFileRecord(
  ownerId: ControlCenterOwnerId,
  sectionId: string,
  sectionLabel: string,
  sectionDescription: string,
  repoPath: string
) {
  const fileStats = await statFile(repoPath);

  return {
    path: repoPath,
    label: path.basename(repoPath),
    ownerId,
    sectionId,
    sectionLabel,
    sectionDescription,
    editable: isEditableFile(repoPath),
    category: fileCategoryFor(repoPath),
    size: fileStats.size,
    updatedAt: fileStats.updatedAt
  } satisfies ControlCenterFileRecord;
}

async function walkFiles(relativeDir: string, predicate: (repoPath: string) => boolean): Promise<string[]> {
  const absoluteDir = resolveRepoPath(relativeDir);

  if (!existsSync(absoluteDir)) {
    return [];
  }

  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryRepoPath = normalizeRepoPath(path.join(relativeDir, entry.name));

    if (entry.isDirectory()) {
      results.push(...(await walkFiles(entryRepoPath, predicate)));
      continue;
    }

    if (predicate(entryRepoPath)) {
      results.push(entryRepoPath);
    }
  }

  return results;
}

async function existingFiles(repoPaths: string[]) {
  const results: string[] = [];

  for (const repoPath of repoPaths) {
    if (existsSync(resolveRepoPath(repoPath))) {
      results.push(repoPath);
    }
  }

  return results;
}

async function buildSection(
  ownerId: ControlCenterOwnerId,
  sectionId: string,
  sectionLabel: string,
  sectionDescription: string,
  repoPaths: string[]
) {
  const files = await Promise.all(repoPaths.map((repoPath) => buildFileRecord(ownerId, sectionId, sectionLabel, sectionDescription, repoPath)));

  return {
    id: sectionId,
    label: sectionLabel,
    description: sectionDescription,
    files
  } satisfies ControlCenterSection;
}

async function buildBodyOwner(): Promise<ControlCenterOwner> {
  const sections: ControlCenterSection[] = [];

  sections.push(
    await buildSection(
      "body",
      "identity-core",
      "Registry Root",
      "Outer canon/store root and species catalog entrypoint.",
      await existingFiles([".registry/README.md", ".registry/index.yaml"])
    )
  );

  sections.push(
    await buildSection(
      "body",
      "species-catalog",
      "Species Catalog",
      "Species canon entries with inline hero candidates.",
      await walkFiles(".registry/species", (repoPath) => isTextFile(repoPath))
    )
  );

  sections.push(
    await buildSection(
      "body",
      "unit-core",
      "Unit Owner",
      "Active unit owner root and unit-owned surfaces.",
      [
        ...(await existingFiles([".unit/README.md"])),
        ...(await walkFiles(".unit", (repoPath) => isTextFile(repoPath)))
      ]
    )
  );

  return {
    id: "body",
    label: "Registry / Unit",
    description: "Species canon and active unit owner files.",
    sections: sections.filter((section) => section.files.length > 0)
  };
}

async function buildClassOwner(): Promise<ControlCenterOwner> {
  const sections: ControlCenterSection[] = [];

  sections.push(
    await buildSection(
      "class",
      "class-core",
      "Class Catalog",
      "Primary class catalog metadata and root guide.",
      await existingFiles([".registry/classes/README.md"])
    )
  );

  sections.push(
    await buildSection(
      "class",
      "class-packages",
      "Class Packages",
      "Reusable class package definitions.",
      await walkFiles(".registry/classes", (repoPath) => isTextFile(repoPath))
    )
  );

  sections.push(
    await buildSection(
      "class",
      "workflow-canon",
      "Workflow Canon",
      "Workflow canon files and curated history.",
      [
        ...(await existingFiles([".workflow/README.md", ".workflow/index.yaml"])),
        ...(await walkFiles(".workflow", (repoPath) => isTextFile(repoPath)))
      ]
    )
  );

  sections.push(
    await buildSection(
      "class",
      "party-templates",
      "Party Templates",
      "Reusable party templates and stats notes.",
      [
        ...(await existingFiles([".party/README.md", ".party/index.yaml"])),
        ...(await walkFiles(".party", (repoPath) => isTextFile(repoPath)))
      ]
    )
  );

  return {
    id: "class",
    label: "Catalogs",
    description: "Class, workflow, and party canon files.",
    sections: sections.filter((section) => section.files.length > 0)
  };
}

async function buildOperationsOwner(): Promise<ControlCenterOwner> {
  const sections: ControlCenterSection[] = [];

  sections.push(
    await buildSection(
      "operations",
      "mission-core",
      "Mission Plans",
      "Held mission plans and readiness owner surfaces.",
      [
        ...(await existingFiles([".mission/README.md", ".mission/index.yaml"])),
        ...(await walkFiles(
          ".mission",
          (repoPath) => isTextFile(repoPath) && repoPath !== ".mission/README.md" && repoPath !== ".mission/index.yaml"
        ))
      ]
    )
  );

  sections.push(
    await buildSection(
      "operations",
      "workspace-core",
      "Workspace Guides",
      "Workspace root guide and local-only mount policy.",
      await existingFiles(["_workspaces/README.md"])
    )
  );

  const workspaceRoot = resolveRepoPath("_workspaces");
  if (existsSync(workspaceRoot)) {
    const projectEntries = await fs.readdir(workspaceRoot, { withFileTypes: true });

    for (const projectEntry of projectEntries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!projectEntry.isDirectory() || projectEntry.name.startsWith(".") || isLegacyWorkspaceBridgeDir(projectEntry.name)) {
        continue;
      }

      const projectDir = `_workspaces/${projectEntry.name}`;
      const projectFiles = [
        ...(await existingFiles([`${projectDir}/README.md`])),
        ...(await walkFiles(`${projectDir}/.project_agent`, (repoPath) => isTextFile(repoPath)))
      ];

      if (projectFiles.length === 0) {
        continue;
      }

      sections.push(
        await buildSection(
          "operations",
          `workspace-${projectEntry.name}`,
          projectEntry.name,
          "Direct local-only project mount surface.",
          projectFiles
        )
      );
    }
  }

  return {
    id: "operations",
    label: "Operations",
    description: "Mission plans and local-only workspace files.",
    sections: sections.filter((section) => section.files.length > 0)
  };
}

async function buildGuildHallOwner(): Promise<ControlCenterOwner> {
  const sections: ControlCenterSection[] = [];

  sections.push(
    await buildSection(
      "guild_hall",
      "guild-hall-core",
      "Guild Hall",
      "Cross-project operating root and owner guide.",
      await existingFiles(["guild_hall/README.md"])
    )
  );

  for (const [sectionId, sectionLabel, relativeDir, description] of [
    ["guild-hall-gateway", "Gateway", "guild_hall/gateway", "Ingress source and staging owner."],
    ["guild-hall-town-crier", "Town Crier", "guild_hall/town_crier", "Notify queue and outbound transport owner."],
    ["guild-hall-night-watch", "Night Watch", "guild_hall/night_watch", "Nightly review owner."],
    ["guild-hall-dungeon-assignment", "Dungeon Assignment", "guild_hall/dungeon_assignment", "Cross-project assignment owner."],
  ] as const) {
    const files = await walkFiles(relativeDir, (repoPath) => isTextFile(repoPath));
    if (files.length === 0) {
      continue;
    }

    sections.push(await buildSection("guild_hall", sectionId, sectionLabel, description, files));
  }

  const stateFiles = await walkFiles("guild_hall/state", (repoPath) => isTextFile(repoPath));
  if (stateFiles.length > 0) {
    sections.push(
      await buildSection(
        "guild_hall",
        "guild-hall-state",
        "State",
        "Local-only guild hall state mounts discovered on this machine.",
        stateFiles
      )
    );
  }

  return {
    id: "guild_hall",
    label: "Guild Hall",
    description: "Cross-project operating root and local state files.",
    sections: sections.filter((section) => section.files.length > 0)
  };
}

async function buildDocsOwner(): Promise<ControlCenterOwner> {
  const sections: ControlCenterSection[] = [];

  sections.push(
    await buildSection(
      "docs",
      "docs-repo",
      "Repository Guides",
      "Top-level repository manuals and instructions.",
      await existingFiles(["AGENTS.md", "README.md", "docs/README.md"])
    )
  );

  sections.push(
    await buildSection(
      "docs",
      "docs-foundation",
      "Architecture / Foundation",
      "Active repository foundation docs.",
      await walkFiles("docs/architecture/foundation", (repoPath) => isTextFile(repoPath))
    )
  );

  sections.push(
    await buildSection(
      "docs",
      "docs-workspace",
      "Architecture / Workspace",
      "Workspace and project-agent contracts.",
      await walkFiles("docs/architecture/workspace", (repoPath) => isTextFile(repoPath))
    )
  );

  sections.push(
    await buildSection(
      "docs",
      "docs-ui",
      "Architecture / UI",
      "Source, sync, derive, and control center docs.",
      await walkFiles("docs/architecture/ui", (repoPath) => isTextFile(repoPath))
    )
  );

  return {
    id: "docs",
    label: "Docs",
    description: "Repository manuals and architecture references.",
    sections: sections.filter((section) => section.files.length > 0)
  };
}

async function buildTree() {
  const owners = [await buildBodyOwner(), await buildClassOwner(), await buildGuildHallOwner(), await buildOperationsOwner(), await buildDocsOwner()];

  return {
    generatedAt: new Date().toISOString(),
    owners
  };
}

function findFileInTree(owners: ControlCenterOwner[], repoPath: string) {
  for (const owner of owners) {
    for (const section of owner.sections) {
      for (const file of section.files) {
        if (file.path === repoPath) {
          return file;
        }
      }
    }
  }

  return null;
}

function parseRequestedRepoPath(url: URL) {
  const requestedPath = url.searchParams.get("path");

  if (!requestedPath) {
    throw new Error("Missing file path.");
  }

  const normalized = path.posix.normalize(requestedPath.replace(/\\/g, "/"));

  if (normalized.startsWith("../") || normalized === ".." || normalized.startsWith("/")) {
    throw new Error("Invalid file path.");
  }

  return normalized;
}

async function readRequestJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();

  if (!rawBody) {
    return {};
  }

  return JSON.parse(rawBody) as Record<string, unknown>;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

async function loadIntegratedFixturePayload() {
  const content = await fs.readFile(resolveRepoPath(integratedFixtureRepoPath), "utf8");
  return JSON.parse(content) as Record<string, unknown>;
}

async function handleTreeRequest(response: ServerResponse) {
  const tree = await buildTree();
  sendJson(response, 200, tree);
}

async function handleFileRequest(request: IncomingMessage, response: ServerResponse, url: URL) {
  const tree = await buildTree();
  const repoPath = parseRequestedRepoPath(url);
  const fileRecord = findFileInTree(tree.owners, repoPath);

  if (!fileRecord) {
    sendJson(response, 404, { error: `Unknown file path: ${repoPath}` });
    return;
  }

  if (request.method === "GET") {
    const content = await fs.readFile(resolveRepoPath(repoPath), "utf8");
    sendJson(response, 200, {
      ...fileRecord,
      content
    });
    return;
  }

  if (request.method === "PUT") {
    if (!fileRecord.editable) {
      sendJson(response, 403, { error: `${repoPath} is read-only in the control center.` });
      return;
    }

    const body = await readRequestJson(request);
    const content = typeof body.content === "string" ? body.content : null;

    if (content === null) {
      sendJson(response, 400, { error: "Missing string content." });
      return;
    }

    await fs.writeFile(resolveRepoPath(repoPath), content, "utf8");
    const updatedStats = await statFile(repoPath);
    sendJson(response, 200, {
      ...fileRecord,
      updatedAt: updatedStats.updatedAt,
      size: updatedStats.size,
      content
    });
    return;
  }

  sendJson(response, 405, { error: `Unsupported method for /file: ${request.method}` });
}

async function handleValidateRequest(response: ServerResponse) {
  const warning = {
    level: "warning",
    code: "fixture-preview",
    message: "Control center preview currently uses the integrated fixture sample after canonical cleanup."
  };

  sendJson(response, 200, {
    ok: true,
    exitCode: 0,
    stdout: "",
    stderr: "",
    payload: {
      command: "fixture-validate",
      summary: {
        pass: 1,
        warn: 1,
        fail: 0,
        result: "WARN"
      },
      warnings: [warning],
      errors: [],
      findings: [warning]
    }
  });
}

async function handleDeriveRequest(response: ServerResponse) {
  sendJson(response, 200, await loadIntegratedFixturePayload());
}

async function handleControlCenterRequest(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "", "http://127.0.0.1");
  const routePath = url.pathname.replace(API_PREFIX, "") || "/";

  if (routePath === "/tree") {
    await handleTreeRequest(response);
    return;
  }

  if (routePath === "/file") {
    await handleFileRequest(request, response, url);
    return;
  }

  if (routePath === "/validate" && request.method === "POST") {
    await handleValidateRequest(response);
    return;
  }

  if (routePath === "/derive-ui-state" && request.method === "GET") {
    await handleDeriveRequest(response);
    return;
  }

  sendJson(response, 404, { error: `Unknown control center route: ${routePath}` });
}

function attachControlCenterApi(server: ViteDevServer | PreviewServer) {
  server.middlewares.use(async (request, response, next) => {
    if (!request.url?.startsWith(API_PREFIX)) {
      next();
      return;
    }

    try {
      await handleControlCenterRequest(request, response);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Unknown control center server error."
      });
    }
  });
}

export function controlCenterPlugin(): Plugin {
  return {
    name: "soulforge-control-center",
    configureServer(server) {
      attachControlCenterApi(server);
    },
    configurePreviewServer(server) {
      attachControlCenterApi(server);
    }
  };
}
