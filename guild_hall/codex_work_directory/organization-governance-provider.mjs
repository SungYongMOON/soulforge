import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  projectOrganizationGovernanceForBoard,
  validateOrganizationGovernanceOverlay
} from "./organization_governance.mjs";

export function defaultOrganizationGovernanceOverlayPath() {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "_workmeta", "system", "bindings", "organization_governance_overlay.v1.json");
}

export function isOrganizationGovernanceDisabled(env = process.env) {
  return env?.SOULFORGE_ORGANIZATION_GOVERNANCE_DISABLED === "1"
    || env?.TEAM_OPS_BOARD_ORGANIZATION_GOVERNANCE_DISABLED === "1";
}

export async function readOrganizationGovernanceSource(
  path = defaultOrganizationGovernanceOverlayPath(),
  { env = process.env } = {}
) {
  if (isOrganizationGovernanceDisabled(env)) {
    return { status: "disabled", governance: null, projection: null, claim: "disabled" };
  }
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    const validation = validateOrganizationGovernanceOverlay(parsed);
    if (!validation.valid) {
      return { status: "invalid", governance: null, projection: null, claim: "hold" };
    }
    if (validation.governance.disabled) {
      return { status: "disabled", governance: null, projection: null, claim: "disabled" };
    }
    const projection = projectOrganizationGovernanceForBoard(parsed);
    if (!projection) {
      return { status: "invalid", governance: null, projection: null, claim: "hold" };
    }
    return {
      status: validation.governance.authority_state === "validated_private" ? "available" : "hold",
      governance: validation.governance,
      projection,
      claim: validation.claim
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { status: "missing", governance: null, projection: null, claim: "hold" };
    }
    return { status: "invalid", governance: null, projection: null, claim: "hold" };
  }
}
