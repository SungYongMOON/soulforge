import test from "node:test";
import assert from "node:assert/strict";

import {
  ORGANIZATION_CATALOG_SCHEMA,
  createEmptyOrganizationCatalog,
  createOrganizationCatalogFromGovernanceProjection,
  findOrganizationCatalogGroup,
  normalizeOrganizationCatalog,
  retireOrganizationCatalogGroup,
  upsertOrganizationCatalogGroup,
  validateOrganizationCatalog,
  validateOrganizationCatalogEnrollment
} from "./live-organization-catalog.mjs";
import {
  MANUAL_ORGANIZATION_CATALOG_WRITES_DISABLED,
  writeOrganizationCatalogAtomic
} from "../server/live-organization-catalog-store.mjs";

const AT = "2026-08-04T01:02:03.000Z";

function catalog(overrides = {}) {
  return {
    schema_version: ORGANIZATION_CATALOG_SCHEMA,
    catalog_revision: 2,
    updated_at: AT,
    disabled: false,
    root_display_label: "Synthetic root",
    companies: [
      {
        company_id: "orbit-company",
        display_label: "Orbit Company",
        ceo_group_id: "orbit-ceo",
        sort_order: 20,
        lifecycle: "active"
      },
      {
        company_id: "maple-company",
        display_label: "Maple Company",
        ceo_group_id: "maple-ceo",
        sort_order: 10,
        lifecycle: "active"
      }
    ],
    groups: [
      {
        organization_group_id: "orbit-ceo",
        company_id: "orbit-company",
        display_label: "Orbit CEO",
        parent_group_id: null,
        presentation_role: "ceo",
        sort_order: 0,
        lifecycle: "active"
      },
      {
        organization_group_id: "orbit-delivery",
        company_id: "orbit-company",
        display_label: "Orbit Delivery",
        parent_group_id: "orbit-ceo",
        presentation_role: "manager_peers",
        sort_order: 20,
        lifecycle: "active"
      },
      {
        organization_group_id: "orbit-research",
        company_id: "orbit-company",
        display_label: "Orbit Research",
        parent_group_id: "orbit-ceo",
        presentation_role: "group_node",
        sort_order: 10,
        lifecycle: "active"
      },
      {
        organization_group_id: "maple-ceo",
        company_id: "maple-company",
        display_label: "Maple CEO",
        parent_group_id: null,
        presentation_role: "ceo",
        sort_order: 0,
        lifecycle: "active"
      },
      {
        organization_group_id: "maple-lab",
        company_id: "maple-company",
        display_label: "Maple Lab",
        parent_group_id: "maple-ceo",
        presentation_role: "group_node",
        sort_order: 10,
        lifecycle: "active"
      }
    ],
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false,
    ...overrides
  };
}

function governanceProjection(overrides = {}) {
  return {
    source_schema_version: "soulforge.organization_governance_overlay.v1",
    catalog_revision: 3,
    effective_at: "2026-08-05T00:00:00.000Z",
    updated_at: "2026-08-05T00:01:00.000Z",
    authority_state: "validated_private",
    root_display_label: "Synthetic organization",
    companies: [{
      organization_id: "orbit-company",
      display_label: "Orbit Company",
      ceo_organization_id: "orbit-company",
      display_order: 10,
      lifecycle: "active"
    }],
    organizations: [{
      organization_id: "orbit-company",
      company_organization_id: "orbit-company",
      display_label: "CEO",
      parent_organization_id: null,
      presentation_role: "ceo",
      display_order: 10,
      lifecycle: "active"
    }, {
      organization_id: "orbit-delivery",
      company_organization_id: "orbit-company",
      display_label: "Orbit Delivery",
      parent_organization_id: "orbit-company",
      presentation_role: "manager_peers",
      display_order: 20,
      lifecycle: "active"
    }],
    role_bindings: [{
      role_binding_id: "orbit-company:company_ceo",
      organization_id: "orbit-company",
      role_code: "company_ceo",
      position_code: null,
      rank: 0,
      display_order: 0,
      stable_route_id: null,
      display_label: "CEO",
      lifecycle: "active"
    }],
    metadata_only: true,
    ...overrides
  };
}

test("catalog uses arbitrary company and group IDs with deterministic explicit order", () => {
  const normalized = normalizeOrganizationCatalog(catalog());
  assert.ok(normalized);
  assert.deepEqual(normalized.companies.map((company) => company.company_id), ["maple-company", "orbit-company"]);
  assert.deepEqual(
    normalized.groups.filter((group) => group.company_id === "orbit-company").map((group) => group.organization_group_id),
    ["orbit-ceo", "orbit-research", "orbit-delivery"]
  );
  assert.equal(findOrganizationCatalogGroup(normalized, "orbit-delivery", { activeOnly: true }).display_label, "Orbit Delivery");
});

test("catalog is strict metadata-only and rejects cross-company parents, raw fields, and malformed CEO topology", () => {
  const crossCompany = catalog();
  crossCompany.groups = crossCompany.groups.map((group) => (
    group.organization_group_id === "orbit-delivery"
      ? { ...group, parent_group_id: "maple-ceo" }
      : group
  ));
  assert.equal(normalizeOrganizationCatalog(crossCompany), null);

  const raw = catalog({ raw_messages: true });
  assert.equal(normalizeOrganizationCatalog(raw), null);

  const malformedCeo = catalog();
  malformedCeo.groups = malformedCeo.groups.map((group) => (
    group.organization_group_id === "orbit-ceo"
      ? { ...group, presentation_role: "group_node" }
      : group
  ));
  assert.equal(normalizeOrganizationCatalog(malformedCeo), null);
});

test("renaming a catalog group is an idempotent metadata update without changing its membership or role", () => {
  const source = normalizeOrganizationCatalog(catalog());
  const renamed = upsertOrganizationCatalogGroup(source, {
    organization_group_id: "orbit-delivery",
    display_label: "Orbit Delivery Renamed"
  }, { now: "2026-08-04T01:03:03.000Z" });
  assert.equal(renamed.error, null);
  assert.equal(renamed.changed, true);
  assert.equal(findOrganizationCatalogGroup(renamed.catalog, "orbit-delivery").display_label, "Orbit Delivery Renamed");
  assert.equal(findOrganizationCatalogGroup(renamed.catalog, "orbit-delivery").company_id, "orbit-company");
  assert.equal(findOrganizationCatalogGroup(renamed.catalog, "orbit-delivery").presentation_role, "manager_peers");

  const repeated = upsertOrganizationCatalogGroup(renamed.catalog, {
    organization_group_id: "orbit-delivery",
    display_label: "Orbit Delivery Renamed"
  });
  assert.equal(repeated.error, null);
  assert.equal(repeated.changed, false);
});

test("catalog reconciliation holds an enrolled group that is not active in the catalog", () => {
  const registry = {
    entries: [
      { lifecycle: "current", organization_group_id: "orbit-delivery" },
      { lifecycle: "accepted", organization_group_id: "unassigned-future-group" },
      { lifecycle: "history", organization_group_id: "historical-only-group" }
    ]
  };
  const result = validateOrganizationCatalogEnrollment(catalog(), registry);
  assert.equal(result.valid, false);
  assert.equal(result.error, "enrollment_organization_group_unassigned");
  assert.deepEqual(result.unknown_group_ids, ["unassigned-future-group"]);
  assert.equal(result.current_enrollment_count, 2);
});

test("retiring a required CEO group fails closed without mutating the valid catalog", () => {
  const source = normalizeOrganizationCatalog(catalog());
  const result = retireOrganizationCatalogGroup(source, "orbit-ceo", { now: "2026-08-04T01:04:03.000Z" });
  assert.equal(result.error, "invalid_organization_catalog_topology");
  assert.equal(result.changed, false);
  assert.equal(findOrganizationCatalogGroup(source, "orbit-ceo").lifecycle, "active");
});

test("governance projection preserves source organization IDs and manual catalog writes are disabled", async () => {
  const projected = createOrganizationCatalogFromGovernanceProjection(governanceProjection());
  assert.ok(projected);
  assert.equal(projected.companies[0].company_id, "orbit-company");
  assert.equal(projected.companies[0].display_label, "Orbit Company");
  assert.equal(findOrganizationCatalogGroup(projected, "orbit-company").display_label, "CEO");
  assert.equal(findOrganizationCatalogGroup(projected, "orbit-delivery").company_id, "orbit-company");
  await assert.rejects(
    writeOrganizationCatalogAtomic("ignored.json", catalog()),
    new RegExp(MANUAL_ORGANIZATION_CATALOG_WRITES_DISABLED, "u")
  );
});

test("catalog validator reports a concise metadata-only summary", () => {
  const validation = validateOrganizationCatalog(catalog());
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.summary, {
    companies: 2,
    active_companies: 2,
    groups: 5,
    active_groups: 5,
    disabled: false
  });
});

test("question marks remain a catalog-label integrity concern without weakening catalog validation", () => {
  const normalized = normalizeOrganizationCatalog(catalog({ root_display_label: "Synthetic root?" }));
  assert.equal(normalized.root_display_label, "Synthetic root?");
});

test("empty catalog uses the exact Korean organization default label", () => {
  assert.equal(createEmptyOrganizationCatalog({ now: AT }).root_display_label, "조직");
  assert.equal(
    createEmptyOrganizationCatalog({ now: AT, rootDisplayLabel: "https://invalid.example/catalog" }).root_display_label,
    "조직"
  );
});
