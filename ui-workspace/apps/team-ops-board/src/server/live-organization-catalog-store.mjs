import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveSoulforgeStateRoot } from "../../../../../guild_hall/shared/soulforge_state_root.mjs";
import {
  defaultOrganizationGovernanceOverlayPath,
  readOrganizationGovernanceSource
} from "../../../../../guild_hall/codex_work_directory/organization-governance-provider.mjs";
import {
  createOrganizationCatalogFromGovernanceProjection,
  normalizeOrganizationCatalog
} from "../core/live-organization-catalog.mjs";

export const MANUAL_ORGANIZATION_CATALOG_WRITES_DISABLED = "organization_catalog_manual_writes_disabled";

export function defaultLegacyOrganizationCatalogPath(env = process.env) {
  if (env?.TEAM_OPS_BOARD_ORGANIZATION_CATALOG) {
    return env.TEAM_OPS_BOARD_ORGANIZATION_CATALOG;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const stateRoot = resolveSoulforgeStateRoot(env, () => resolve(here, "..", "..", "..", "..", "..", "guild_hall", "state"));
  return join(stateRoot, "operations", "team_ops_board", "organization_catalog.v1.json");
}

export function defaultOrganizationCatalogPath(env = process.env) {
  return env?.TEAM_OPS_BOARD_ORGANIZATION_GOVERNANCE_OVERLAY
    || defaultOrganizationGovernanceOverlayPath();
}

export function isOrganizationGovernanceRollbackLegacy(env = process.env) {
  return env?.SOULFORGE_ORGANIZATION_GOVERNANCE_ROLLBACK_LEGACY === "1"
    || env?.TEAM_OPS_BOARD_ORGANIZATION_GOVERNANCE_ROLLBACK_LEGACY === "1";
}

async function readLegacyOrganizationCatalog(path) {
  try {
    const text = await readFile(path, "utf8");
    const parsed = JSON.parse(text);
    const catalog = normalizeOrganizationCatalog(parsed);
    if (!catalog || catalog.disabled) return null;
    return catalog;
  } catch (error) {
    return null;
  }
}

export async function readOrganizationCatalog(
  path = null,
  { env = process.env, legacyCatalogPath = null } = {}
) {
  const sourcePath = path || defaultOrganizationCatalogPath(env);
  const source = await readOrganizationGovernanceSource(sourcePath, { env });
  if (source.projection) {
    const catalog = createOrganizationCatalogFromGovernanceProjection(source.projection);
    if (!catalog) return { status: "invalid", catalog: null, source: "governance" };
    return { status: source.status, catalog, source: "governance" };
  }
  if (!isOrganizationGovernanceRollbackLegacy(env)) {
    return { status: source.status, catalog: null, source: "governance" };
  }
  const legacyCatalog = await readLegacyOrganizationCatalog(legacyCatalogPath || defaultLegacyOrganizationCatalogPath(env));
  if (!legacyCatalog) {
    return { status: source.status, catalog: null, source: "governance" };
  }
  return { status: "hold", catalog: legacyCatalog, source: "legacy_rollback" };
}

export async function writeOrganizationCatalogAtomic() {
  throw new Error(MANUAL_ORGANIZATION_CATALOG_WRITES_DISABLED);
}
