import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ORGANIZATION_GOVERNANCE_OVERLAY_SCHEMA,
  projectOrganizationGovernanceForBoard,
  validateOrganizationGovernanceOverlay
} from "./organization_governance.mjs";
import { readOrganizationGovernanceSource } from "./organization-governance-provider.mjs";

const EFFECTIVE_AT = "2026-08-05T00:00:00.000Z";
const UPDATED_AT = "2026-08-05T00:01:00.000Z";

function organization({
  organizationId,
  parentOrganizationId = null,
  organizationKind,
  displayLabel,
  displayOrder,
  branches,
  identityState = "legacy_projection",
  mappingAuthority = "owner_seeded",
  legacyProjectionRef = `owner-seeded:${organizationId}`,
  lifecycle = "active"
}) {
  return {
    organization_id: organizationId,
    parent_organization_id: parentOrganizationId,
    organization_kind: organizationKind,
    display_label: displayLabel,
    display_order: displayOrder,
    lifecycle,
    member_branch_ids: branches,
    owner_authority_ref: "owner-approved:organization-governance-v1",
    identity_state: identityState,
    mapping_authority: mappingAuthority,
    legacy_projection_ref: legacyProjectionRef
  };
}

function roleBinding(organizationId, displayOrder, roleCode, displayLabel = null) {
  return {
    role_binding_id: `${organizationId}:role`,
    organization_id: organizationId,
    role_code: roleCode,
    position_code: null,
    rank: displayOrder,
    display_order: displayOrder,
    stable_route_id: null,
    ...(displayLabel === null ? {} : { display_label: displayLabel }),
    lifecycle: "active"
  };
}

function overlay(overrides = {}) {
  return {
    schema_version: ORGANIZATION_GOVERNANCE_OVERLAY_SCHEMA,
    catalog_revision: 4,
    effective_at: EFFECTIVE_AT,
    updated_at: UPDATED_AT,
    authority_state: "validated_private",
    disabled: false,
    root_display_label: "Synthetic organization",
    organizations: [
      organization({
        organizationId: "alpha-company",
        organizationKind: "company",
        displayLabel: "Alpha Company",
        displayOrder: 10,
        branches: ["common", "projects"]
      }),
      organization({
        organizationId: "alpha-operations",
        parentOrganizationId: "alpha-company",
        organizationKind: "operations",
        displayLabel: "Alpha Operations",
        displayOrder: 10,
        branches: ["common"]
      }),
      organization({
        organizationId: "alpha-projects",
        parentOrganizationId: "alpha-company",
        organizationKind: "project_portfolio",
        displayLabel: "Alpha Projects",
        displayOrder: 20,
        branches: ["projects"]
      }),
      organization({
        organizationId: "beta-company",
        organizationKind: "company",
        displayLabel: "Beta Company",
        displayOrder: 20,
        branches: ["ax_development", "erp_development", "system_development"]
      })
    ],
    role_bindings: [
      roleBinding("alpha-company", 10, "company_ceo", "CEO"),
      roleBinding("alpha-operations", 20, "operations_manager"),
      roleBinding("alpha-projects", 30, "project_manager"),
      roleBinding("beta-company", 40, "company_ceo", "CEO")
    ],
    metadata_only: true,
    ...overrides
  };
}

test("validated private governance projects exact organization IDs without Board-local grouping", () => {
  const validation = validateOrganizationGovernanceOverlay(overlay());
  assert.equal(validation.valid, true);
  assert.equal(validation.claim, "validated_private");
  assert.deepEqual(
    validation.governance.organizations.map((item) => item.organization_id),
    ["alpha-company", "alpha-operations", "alpha-projects", "beta-company"]
  );
  assert.equal(validation.governance.role_bindings[0].stable_route_id, null);

  const projection = projectOrganizationGovernanceForBoard(overlay());
  assert.deepEqual(
    projection.companies.map((item) => [item.organization_id, item.display_label]),
    [["alpha-company", "Alpha Company"], ["beta-company", "Beta Company"]]
  );
  assert.deepEqual(
    projection.organizations.map((item) => [item.organization_id, item.company_organization_id, item.presentation_role]),
    [
      ["alpha-company", "alpha-company", "ceo"],
      ["alpha-operations", "alpha-company", "group_node"],
      ["alpha-projects", "alpha-company", "manager_peers"],
      ["beta-company", "beta-company", "ceo"]
    ]
  );
  assert.equal(projection.organizations.find((item) => item.organization_id === "alpha-company").display_label, "CEO");
});

test("governance rejects raw/thread fields, unknown parents, and implicit legacy promotion", () => {
  const withForbiddenThreadField = overlay();
  withForbiddenThreadField.organizations[0].thread_id = "not-allowed";
  const forbidden = validateOrganizationGovernanceOverlay(withForbiddenThreadField);
  assert.equal(forbidden.valid, false);
  assert.ok(forbidden.errors.some((error) => error.keyword === "additionalProperties"));

  const unknownParent = overlay();
  unknownParent.organizations[1].parent_organization_id = "missing-company";
  assert.equal(validateOrganizationGovernanceOverlay(unknownParent).valid, false);

  const implicitPromotion = overlay();
  implicitPromotion.organizations[0] = {
    ...implicitPromotion.organizations[0],
    identity_state: "legacy_projection",
    mapping_authority: "not_applicable",
    legacy_projection_ref: null
  };
  assert.equal(validateOrganizationGovernanceOverlay(implicitPromotion).valid, false);
});

test("canonical identities have no legacy projection reference", () => {
  const canonical = overlay();
  canonical.organizations[0] = {
    ...canonical.organizations[0],
    identity_state: "canonical",
    mapping_authority: "not_applicable",
    legacy_projection_ref: null
  };
  assert.equal(validateOrganizationGovernanceOverlay(canonical).valid, true);

  canonical.organizations[0].legacy_projection_ref = "owner-seeded:alpha-company";
  assert.equal(validateOrganizationGovernanceOverlay(canonical).valid, false);
});

test("role display labels keep Korean company frames distinct from CEO and suborganization nodes", () => {
  const localized = overlay({ root_display_label: "Soulforge 조직" });
  localized.organizations[0] = { ...localized.organizations[0], display_label: "개발1팀" };
  localized.organizations[1] = { ...localized.organizations[1], display_label: "운영실" };
  localized.organizations[2] = { ...localized.organizations[2], display_label: "프로젝트" };
  localized.role_bindings[0] = { ...localized.role_bindings[0], display_label: "CEO" };
  const projection = projectOrganizationGovernanceForBoard(localized);
  assert.equal(projection.root_display_label, "Soulforge 조직");
  assert.equal(projection.companies.find((item) => item.organization_id === "alpha-company").display_label, "개발1팀");
  assert.equal(projection.organizations.find((item) => item.organization_id === "alpha-company").display_label, "CEO");
  assert.equal(projection.organizations.find((item) => item.organization_id === "alpha-operations").display_label, "운영실");
  assert.equal(projection.organizations.find((item) => item.organization_id === "alpha-projects").display_label, "프로젝트");
});

test("provider refreshes validated private source updates and fails closed for invalid content", async () => {
  const directory = await mkdtemp(join(tmpdir(), "organization-governance-"));
  const sourcePath = join(directory, "overlay.v1.json");
  try {
    await writeFile(sourcePath, `${JSON.stringify(overlay(), null, 2)}\n`, "utf8");
    const initial = await readOrganizationGovernanceSource(sourcePath, { env: {} });
    assert.equal(initial.status, "available");
    assert.equal(initial.projection.root_display_label, "Synthetic organization");

    const updated = overlay({ catalog_revision: 5, root_display_label: "Updated organization", updated_at: "2026-08-05T00:02:00.000Z" });
    await writeFile(sourcePath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
    const refreshed = await readOrganizationGovernanceSource(sourcePath, { env: {} });
    assert.equal(refreshed.status, "available");
    assert.equal(refreshed.projection.catalog_revision, 5);
    assert.equal(refreshed.projection.root_display_label, "Updated organization");

    await writeFile(sourcePath, "{ not-json", "utf8");
    const invalid = await readOrganizationGovernanceSource(sourcePath, { env: {} });
    assert.deepEqual(invalid, { status: "invalid", governance: null, projection: null, claim: "hold" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("candidate governance remains visibly held and an explicit disable prevents reads", async () => {
  const directory = await mkdtemp(join(tmpdir(), "organization-governance-candidate-"));
  const sourcePath = join(directory, "overlay.v1.json");
  try {
    await writeFile(sourcePath, `${JSON.stringify(overlay({ authority_state: "candidate" }), null, 2)}\n`, "utf8");
    assert.equal((await readOrganizationGovernanceSource(sourcePath, { env: {} })).status, "hold");
    assert.deepEqual(
      await readOrganizationGovernanceSource(sourcePath, { env: { SOULFORGE_ORGANIZATION_GOVERNANCE_DISABLED: "1" } }),
      { status: "disabled", governance: null, projection: null, claim: "disabled" }
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
