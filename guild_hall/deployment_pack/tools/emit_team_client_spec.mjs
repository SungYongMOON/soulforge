// Emits the compatibility-ID `team_client_pack` as the Soulforge Universal
// Client source Pack. The former 4192/Team Ops Board closure was server-side
// observability code and is intentionally not copied to Windows client seats.
//
//   node guild_hall/deployment_pack/tools/emit_team_client_spec.mjs [--check]
//
// The Pack remains a source/contract candidate: live mTLS enrollment,
// OS-protected credentials, dependency delivery, physical installation and
// release-ring promotion still require their own evidence. The same Pack bytes
// are used by Owner and team members; server capability readback changes only
// the enabled projection.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SECRET_MATERIAL } from "./build_pack.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const APP = "ui-workspace/apps/soulforge-universal-client";
const MCP_APP = "ui-workspace/apps/dev-erp-mcp";
const SPEC_PATH = join(ROOT, "guild_hall", "deployment_pack", "packs", "team_client_pack.spec.json");

const contentRoles = {
  mcp_client_config_templates: [
    `${MCP_APP}/src/erp_client.mjs`,
    `${APP}/generated/ingress_mtls_client.bundle.mjs`,
  ],
  ui: [
    `${APP}/src/core/universal_client_core.mjs`,
  ],
  shared_modules: [
    "guild_hall/agent_observation/guard_primitives.mjs",
    "guild_hall/shared/physical_path_identity.mjs",
  ],
  local_helper_outbox: [
    "guild_hall/ingress/local_outbox.mjs",
    `${APP}/src/runtime/durable_outbox_store.mjs`,
    `${APP}/src/runtime/update_coordinator.mjs`,
    `${APP}/src/runtime/work_session_outbox.mjs`,
  ],
  learning_material: [
    `${APP}/README.md`,
  ],
  safe_diagnostics: [
    "guild_hall/doctor/deployment_readiness.mjs",
  ],
  manifests: [
    `${APP}/package.json`,
    `${APP}/module.manifest.json`,
    `${MCP_APP}/package.json`,
  ],
  validators: [
    `${APP}/test/universal_client_core.test.mjs`,
    `${APP}/test/bundled_transport.test.mjs`,
    `${APP}/test/durable_outbox_store.test.mjs`,
    `${APP}/test/update_coordinator.test.mjs`,
    `${APP}/test/work_session_outbox.test.mjs`,
  ],
};

const reviewed = [];
for (const rolePaths of Object.values(contentRoles)) {
  for (const relPath of rolePaths) {
    const bytes = readFileSync(join(ROOT, ...relPath.split("/")));
    if (SECRET_MATERIAL.test(bytes.toString("utf8"))) {
      reviewed.push({ path: relPath, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
  }
}
reviewed.sort((left, right) => left.path.localeCompare(right.path));

const validators = contentRoles.validators;
const spec = {
  schema: "soulforge.deployment_pack_spec.v0",
  pack_id: "team_client_pack",
  version: "0.2.0",
  host_effect_policy: {
    reboot: "forbidden",
    driver_change: "forbidden",
    system_update: "forbidden",
    service_restart_scope: "pack_services_only",
  },
  content_roles: contentRoles,
  test_concurrency: 4,
  smoke_test_entries: validators,
  installed_smoke_entries: validators,
  installed_smoke_excluded: [],
  release_notes_ref: "release_notes.team_client_pack.v0_2_0",
  install_manual_ref: "manual.install.team_client_pack",
  upgrade_manual_ref: "manual.upgrade.team_client_pack",
  rollback_manual_ref: "manual.rollback.team_client_pack",
  support_owner_ref: "owner.platform_support",
  secret_refs: [],
  content_scan_reviewed_files: reviewed,
};

const emitted = `${JSON.stringify(spec, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const tracked = existsSync(SPEC_PATH) ? readFileSync(SPEC_PATH, "utf8") : "";
  if (tracked !== emitted) {
    process.stderr.write("team_client_pack.spec.json drifts from the Universal Client source set or scan pins. Re-review and re-emit.\n");
    process.exit(1);
  }
  const totalFiles = Object.values(spec.content_roles).reduce((sum, entries) => sum + entries.length, 0);
  process.stdout.write(`spec check ok: ${totalFiles} files, ${reviewed.length} reviewed pins\n`);
} else {
  writeFileSync(SPEC_PATH, emitted);
  const totalFiles = Object.values(spec.content_roles).reduce((sum, entries) => sum + entries.length, 0);
  process.stdout.write(`emitted ${SPEC_PATH}: ${totalFiles} files, ${reviewed.length} reviewed pins\n`);
}
