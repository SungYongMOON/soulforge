import test from "node:test";
import assert from "node:assert/strict";

import { openStore } from "../src/store.mjs";
import { applyActorOverlayImport, buildActorOverlayImportPlan } from "../tools/import_actor_overlay.mjs";
import { applyRoleOverlayImport } from "../tools/import_role_overlay.mjs";

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

function actorOverlayFixture() {
  return {
    schema_version: "soulforge.company.actor_overlay.v1",
    source_refs: ["_workspaces/knowledge/common/test/actor_source.json"],
    actors: [
      {
        actor_ref: "dev_team_1",
        actor_type: "team",
        display_name: "Development Team 1",
        team_ref: "dev_team_1",
        capabilities: [
          { capability: "hardware_development", label: "Hardware development" },
          { capability: "firmware_development", label: "Firmware development" }
        ],
        authority: "responsible_owner",
        approval_required: false,
        status: "active"
      },
      {
        actor_ref: "person_hw_lead",
        actor_type: "person",
        display_name: "Hardware Lead",
        team_ref: "dev_team_1",
        capabilities: [{ capability: "hardware_review", label: "Hardware review" }],
        authority: "responsible_owner",
        approval_required: false,
        status: "pending",
        notes: "Owner will fill the real person identity later."
      },
      {
        actor_ref: "bot_mail_drafter",
        actor_type: "bot",
        display_name: "Mail Drafter Bot",
        capabilities: [
          { capability: "draft_reply_email", label: "Draft reply email" },
          { capability: "extract_action_items", label: "Extract action items" }
        ],
        authority: "draft_only",
        approval_required: true,
        handoff_to_ref: "person_hw_lead",
        forbidden_actions: ["send_email_without_owner_approval"],
        status: "active"
      },
      {
        actor_ref: "bot_task_classifier",
        actor_type: "bot",
        display_name: "Task Classifier Bot",
        capabilities: [{ capability: "classify_mail_task", label: "Classify mail into tasks" }],
        authority: "propose_only",
        approval_required: true,
        handoff_to_ref: "dev_team_1",
        forbidden_actions: ["external_side_effect_without_owner_approval"],
        status: "active"
      }
    ]
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("ACTOR-OVERLAY: actor overlays dry-run and apply into actor projection tables", () => {
  const store = openStore(":memory:");
  const actorOverlay = actorOverlayFixture();

  const plan = buildActorOverlayImportPlan(store, { actorOverlay, knownOrgUnits: ["dev_team_1", "dev_team_2"] });
  assert.equal(plan.apply_ready, true);
  assert.equal(plan.totals.actors, 4);
  assert.equal(plan.totals.teams, 1);
  assert.equal(plan.totals.people, 1);
  assert.equal(plan.totals.bots, 2);
  assert.equal(plan.totals.capabilities, 6);

  const applied = applyActorOverlayImport(store, { actorOverlay, knownOrgUnits: ["dev_team_1", "dev_team_2"] });
  assert.equal(applied.applied, true);
  assert.equal(applied.applied_counts.actors, 4);

  const actors = store.listRoleActors();
  assert.equal(actors.length, 4);
  const drafter = actors.find((actor) => actor.actor_ref === "bot_mail_drafter");
  assert.equal(drafter.actor_type, "bot");
  assert.equal(drafter.approval_required, true);
  assert.equal(drafter.handoff_to_ref, "person_hw_lead");
  assert.deepEqual(
    drafter.capabilities.map((row) => row.capability),
    ["draft_reply_email", "extract_action_items"]
  );
  assert.deepEqual(drafter.forbidden_actions, ["send_email_without_owner_approval"]);

  const activeBots = store.listRoleActors({ actor_type: "bot", active_only: true });
  assert.deepEqual(activeBots.map((actor) => actor.actor_ref), ["bot_mail_drafter", "bot_task_classifier"]);

  const events = store.recentEvents(5).filter((event) => event.kind === "actor_overlay_import");
  assert.equal(events.length, 1);
});

test("ACTOR-OVERLAY: role overlay imports do not wipe actor projection rows", () => {
  const store = openStore(":memory:");
  const teamOverlay = teamOverlayFixture();
  const projectOverlay = projectOverlayFixture();
  const actorOverlay = actorOverlayFixture();

  assert.equal(applyRoleOverlayImport(store, { teamOverlay, projectOverlay }).applied, true);
  assert.equal(applyActorOverlayImport(store, { actorOverlay }).applied, true);
  assert.equal(store.listRoleActors().length, 4);

  assert.equal(applyRoleOverlayImport(store, { teamOverlay, projectOverlay }).applied, true);
  assert.equal(store.listRoleActors().length, 4);
});

test("ACTOR-OVERLAY: invalid actor authority, refs, and payload boundaries are rejected", () => {
  const store = openStore(":memory:");
  const actorOverlay = actorOverlayFixture();
  const knownOrgUnits = ["dev_team_1", "dev_team_2"];

  const invalidType = clone(actorOverlay);
  invalidType.actors[0].actor_type = "committee";
  const badType = buildActorOverlayImportPlan(store, { actorOverlay: invalidType, knownOrgUnits });
  assert.equal(badType.apply_ready, false);
  assert.ok(badType.errors.includes("actors[0].actor_type_invalid"));

  const duplicateActor = clone(actorOverlay);
  duplicateActor.actors[1].actor_ref = "dev_team_1";
  const badDuplicateActor = buildActorOverlayImportPlan(store, { actorOverlay: duplicateActor, knownOrgUnits });
  assert.equal(badDuplicateActor.apply_ready, false);
  assert.ok(badDuplicateActor.errors.includes("actors[1].duplicate_actor_ref"));

  const duplicateCapability = clone(actorOverlay);
  duplicateCapability.actors[2].capabilities.push({ capability: "draft_reply_email" });
  const badDuplicateCapability = buildActorOverlayImportPlan(store, { actorOverlay: duplicateCapability, knownOrgUnits });
  assert.equal(badDuplicateCapability.apply_ready, false);
  assert.ok(badDuplicateCapability.errors.includes("actors[2].duplicate_capability"));

  const unknownTeam = clone(actorOverlay);
  unknownTeam.actors[0].team_ref = "missing_team";
  const badTeam = buildActorOverlayImportPlan(store, { actorOverlay: unknownTeam, knownOrgUnits });
  assert.equal(badTeam.apply_ready, false);
  assert.ok(badTeam.errors.includes("actors[0].team_ref_unknown"));

  const unknownHandoff = clone(actorOverlay);
  unknownHandoff.actors[2].handoff_to_ref = "missing_actor";
  const badHandoff = buildActorOverlayImportPlan(store, { actorOverlay: unknownHandoff, knownOrgUnits });
  assert.equal(badHandoff.apply_ready, false);
  assert.ok(badHandoff.errors.includes("actors[2].handoff_to_ref_unknown"));

  const botOwner = clone(actorOverlay);
  botOwner.actors[2].authority = "responsible_owner";
  const badBotOwner = buildActorOverlayImportPlan(store, { actorOverlay: botOwner, knownOrgUnits });
  assert.equal(badBotOwner.apply_ready, false);
  assert.ok(badBotOwner.errors.includes("actors[2].bot_cannot_be_responsible_owner"));

  const unsafeDrafter = clone(actorOverlay);
  unsafeDrafter.actors[2].approval_required = false;
  unsafeDrafter.actors[2].forbidden_actions = [];
  const badDrafter = buildActorOverlayImportPlan(store, { actorOverlay: unsafeDrafter, knownOrgUnits });
  assert.equal(badDrafter.apply_ready, false);
  assert.ok(badDrafter.errors.includes("actors[2].mail_drafter_requires_approval"));
  assert.ok(badDrafter.errors.includes("actors[2].mail_drafter_missing_send_forbidden_action"));

  const rawPayload = clone(actorOverlay);
  rawPayload.actors[0].body = "raw mail body";
  const badRaw = buildActorOverlayImportPlan(store, { actorOverlay: rawPayload, knownOrgUnits });
  assert.equal(badRaw.apply_ready, false);
  assert.ok(badRaw.errors.some((error) => error.includes("raw_payload_key_not_allowed")));

  const secretPayload = clone(actorOverlay);
  secretPayload.actors[0].api_token = "secret";
  const badSecret = buildActorOverlayImportPlan(store, { actorOverlay: secretPayload, knownOrgUnits });
  assert.equal(badSecret.apply_ready, false);
  assert.ok(badSecret.errors.some((error) => error.includes("secret_key_not_allowed")));

  const badSource = clone(actorOverlay);
  badSource.actors[0].source_ref = "docs/private/raw.json";
  const badSourceRef = buildActorOverlayImportPlan(store, { actorOverlay: badSource, knownOrgUnits });
  assert.equal(badSourceRef.apply_ready, false);
  assert.ok(badSourceRef.errors.includes("actors[0].source_ref_invalid_outside_knowledge_workspace"));

  const badWindowsSource = clone(actorOverlay);
  badWindowsSource.actors[0].source_ref = "docs\\private\\raw.json";
  const badWindowsSourceRef = buildActorOverlayImportPlan(store, { actorOverlay: badWindowsSource, knownOrgUnits });
  assert.equal(badWindowsSourceRef.apply_ready, false);
  assert.ok(badWindowsSourceRef.errors.includes("actors[0].source_ref_invalid_outside_knowledge_workspace"));
});
