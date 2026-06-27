import test from "node:test";
import assert from "node:assert/strict";

import { openStore } from "../src/store.mjs";
import { applyRoleOverlayImport, buildRoleOverlayImportPlan } from "../tools/import_role_overlay.mjs";

function teamOverlayFixture() {
  return {
    schema_version: "soulforge.company.team_role_overlay.v1",
    source_refs: ["_workspaces/knowledge/common/test/source_card.json"],
    org_units: [
      {
        org_unit_ref: "dev_team_1",
        display_name: "Development Team 1",
        capabilities: [
          { capability: "hardware_development", label: "Hardware development" },
          { capability: "firmware_development", label: "Firmware development" }
        ],
        status: "active"
      },
      {
        org_unit_ref: "dev_team_2",
        display_name: "Development Team 2",
        capabilities: [{ capability: "windows_sw_development", label: "Windows software development" }],
        status: "active"
      },
      {
        org_unit_ref: "dev_team_3",
        display_name: "Development Team 3",
        capabilities: [{ capability: "owner_pending", label: "Pending" }],
        status: "pending"
      },
      {
        org_unit_ref: "dev_team_4",
        display_name: "Development Team 4",
        capabilities: [{ capability: "mechanical_engineering", label: "Mechanical engineering" }],
        status: "active"
      }
    ]
  };
}

function projectOverlayFixture() {
  return {
    schema_version: "soulforge.company.project_role_overlay.v1",
    source_refs: ["_workspaces/knowledge/common/test/project_index.json"],
    assignments: []
  };
}

test("ROLE-OVERLAY: sample overlays dry-run and apply into projection tables", () => {
  const store = openStore(":memory:");
  const teamOverlay = teamOverlayFixture();
  const projectOverlay = projectOverlayFixture();

  const plan = buildRoleOverlayImportPlan(store, { teamOverlay, projectOverlay });
  assert.equal(plan.apply_ready, true);
  assert.equal(plan.totals.org_units, 4);
  assert.equal(plan.totals.project_assignments, 0);
  assert.equal(plan.team_overlay.org_units.find((x) => x.org_unit_ref === "dev_team_1").capabilities.length, 2);

  const applied = applyRoleOverlayImport(store, { teamOverlay, projectOverlay });
  assert.equal(applied.applied, true);
  const orgs = store.listRoleOrgUnits();
  assert.equal(orgs.length, 4);
  assert.deepEqual(
    orgs.find((x) => x.org_unit_ref === "dev_team_2").capabilities.map((x) => x.capability),
    ["windows_sw_development"]
  );
  const events = store.recentEvents(5).filter((e) => e.kind === "role_overlay_import");
  assert.equal(events.length, 1);
});

test("ROLE-OVERLAY: project assignments can stay team-only and are listed with backup refs", () => {
  const store = openStore(":memory:");
  const teamOverlay = teamOverlayFixture();
  const projectOverlay = {
    schema_version: "soulforge.company.project_role_overlay.v1",
    source_refs: ["_workspaces/knowledge/common/project_management/company_project_ledger/derived_index/index_summary.json"],
    assignments: [
      {
        project_code: "P26-014",
        role_area: "test",
        owning_org_unit_ref: "dev_team_1",
        primary_person_ref: null,
        backup_person_refs: [],
        confidence: "team_only",
        status: "active",
        notes: "Owner will fill person-level assignment later."
      },
      {
        project_code: "P26-014",
        role_area: "backup-review",
        owning_org_unit_ref: "dev_team_1",
        primary_person_ref: null,
        backup_person_refs: ["dev_team_1.pool"],
        confidence: "person_backup",
        status: "active"
      }
    ]
  };

  const applied = applyRoleOverlayImport(store, { teamOverlay, projectOverlay });
  assert.equal(applied.applied, true);
  const rows = store.listRoleProjectAssignments({ project_code: "P26-014", active_only: true });
  assert.equal(rows.length, 2);
  const teamOnly = rows.find((row) => row.role_area === "test");
  assert.equal(teamOnly.owning_org_unit_ref, "dev_team_1");
  assert.deepEqual(teamOnly.backup_person_refs, []);
  const backup = rows.find((row) => row.role_area === "backup-review");
  assert.deepEqual(backup.backup_person_refs, ["dev_team_1.pool"]);
});

test("ROLE-OVERLAY: secret/raw payload keys and unknown org units are rejected", () => {
  const store = openStore(":memory:");
  const teamOverlay = teamOverlayFixture();
  const badTeam = { ...teamOverlay, access_token: "do-not-store" };
  const badSecret = buildRoleOverlayImportPlan(store, { teamOverlay: badTeam, projectOverlay: projectOverlayFixture() });
  assert.equal(badSecret.apply_ready, false);
  assert.ok(badSecret.errors.some((x) => x.includes("secret_key_not_allowed")));

  const badRaw = buildRoleOverlayImportPlan(store, {
    teamOverlay: { ...teamOverlay, org_units: [{ ...teamOverlay.org_units[0], body: "raw text" }] },
    projectOverlay: projectOverlayFixture()
  });
  assert.equal(badRaw.apply_ready, false);
  assert.ok(badRaw.errors.some((x) => x.includes("raw_payload_key_not_allowed")));

  const badRawVariants = buildRoleOverlayImportPlan(store, {
    teamOverlay: { ...teamOverlay, org_units: [{ ...teamOverlay.org_units[0], raw_body: "raw text", payload: "body", full_text: "document" }] },
    projectOverlay: projectOverlayFixture()
  });
  assert.equal(badRawVariants.apply_ready, false);
  assert.ok(badRawVariants.errors.filter((x) => x.includes("raw_payload_key_not_allowed")).length >= 3);

  const badProject = buildRoleOverlayImportPlan(store, {
    teamOverlay,
    projectOverlay: {
      schema_version: "soulforge.company.project_role_overlay.v1",
      source_refs: [],
      assignments: [{ project_code: "P26-014", role_area: "sw", owning_org_unit_ref: "unknown_team" }]
    }
  });
  assert.equal(badProject.apply_ready, false);
  assert.ok(badProject.errors.includes("assignments[0].owning_org_unit_ref_unknown"));

  const badSourceRef = buildRoleOverlayImportPlan(store, {
    teamOverlay,
    projectOverlay: {
      schema_version: "soulforge.company.project_role_overlay.v1",
      source_refs: [],
      assignments: [{ project_code: "P26-014", role_area: "sw", owning_org_unit_ref: "dev_team_2", source_ref: "docs/private/raw.json" }]
    }
  });
  assert.equal(badSourceRef.apply_ready, false);
  assert.ok(badSourceRef.errors.includes("assignments[0].source_ref_invalid_outside_knowledge_workspace"));

  const badWindowsSourceRef = buildRoleOverlayImportPlan(store, {
    teamOverlay,
    projectOverlay: {
      schema_version: "soulforge.company.project_role_overlay.v1",
      source_refs: [],
      assignments: [{ project_code: "P26-014", role_area: "fw", owning_org_unit_ref: "dev_team_1", source_ref: "docs\\private\\raw.json" }]
    }
  });
  assert.equal(badWindowsSourceRef.apply_ready, false);
  assert.ok(badWindowsSourceRef.errors.includes("assignments[0].source_ref_invalid_outside_knowledge_workspace"));

  const badConfidence = buildRoleOverlayImportPlan(store, {
    teamOverlay,
    projectOverlay: {
      schema_version: "soulforge.company.project_role_overlay.v1",
      source_refs: [],
      assignments: [
        { project_code: "P26-014", role_area: "primary", owning_org_unit_ref: "dev_team_2", confidence: "person_primary" },
        { project_code: "P26-014", role_area: "team", owning_org_unit_ref: "dev_team_2", primary_person_ref: "kim", confidence: "team_only" }
      ]
    }
  });
  assert.equal(badConfidence.apply_ready, false);
  assert.ok(badConfidence.errors.includes("assignments[0].confidence_requires_primary_person_ref"));
  assert.ok(badConfidence.errors.includes("assignments[1].team_only_confidence_with_person_refs"));
});
