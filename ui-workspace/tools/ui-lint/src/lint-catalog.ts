import { existsSync } from "node:fs";
import path from "node:path";
import {
  addIssue,
  asArray,
  asObject,
  asString,
  loadFixtures,
  repoRoot,
  type LintIssue,
  type LintResult
} from "./shared";

const AXIS_PREFIX: Record<string, string> = {
  species: ".registry/species/",
  units: ".unit/",
  classes: ".registry/classes/",
  workflows: ".workflow/",
  parties: ".party/"
};

function existsSoulforgePath(repoPath: string) {
  return !path.isAbsolute(repoPath) && existsSync(path.resolve(repoRoot, "..", repoPath));
}

function validateAxisItems(
  fixturePath: string,
  axisName: keyof typeof AXIS_PREFIX,
  items: Record<string, unknown>[],
  issues: LintIssue[]
) {
  for (const item of items) {
    const itemId = asString(item.id);
    const displayName = asString(item.display_name);
    const summary = asString(item.summary);
    const sourceRef = asString(item.source_ref);
    const status = asString(item.status);

    if (!itemId || !displayName || !summary || !sourceRef || !status) {
      addIssue(issues, "required-field", fixturePath, `${axisName} items require id, display_name, summary, source_ref, status`);
      continue;
    }

    if (!sourceRef.startsWith(AXIS_PREFIX[axisName])) {
      addIssue(issues, "source-ref-prefix", fixturePath, `${itemId} source_ref must stay under ${AXIS_PREFIX[axisName]}`);
    }

    if (!existsSoulforgePath(sourceRef)) {
      addIssue(issues, "source-ref-target", fixturePath, `${itemId} source_ref target does not exist: ${sourceRef}`);
    }
  }
}

export function runCatalogLint() {
  const issues: LintIssue[] = [];
  const fixtures = loadFixtures();

  for (const fixture of fixtures) {
    const payload = fixture.payload;
    const species = asObject(payload.species);
    const units = asObject(payload.units);
    const classes = asObject(payload.classes);
    const workflows = asObject(payload.workflows);
    const parties = asObject(payload.parties);
    const workspaces = asObject(payload.workspaces);

    validateAxisItems(fixture.repoPath, "species", asArray<Record<string, unknown>>(species?.items), issues);
    validateAxisItems(fixture.repoPath, "units", asArray<Record<string, unknown>>(units?.items), issues);
    validateAxisItems(fixture.repoPath, "classes", asArray<Record<string, unknown>>(classes?.items), issues);
    validateAxisItems(fixture.repoPath, "workflows", asArray<Record<string, unknown>>(workflows?.items), issues);
    validateAxisItems(fixture.repoPath, "parties", asArray<Record<string, unknown>>(parties?.items), issues);

    const heroes = asArray<Record<string, unknown>>(species?.heroes);
    for (const hero of heroes) {
      const heroId = asString(hero.id);
      const heroSourceRef = asString(hero.source_ref);
      const speciesId = asString(hero.species_id);

      if (!heroId || !heroSourceRef || !speciesId) {
        addIssue(issues, "required-field", fixture.repoPath, "species.heroes entries require id, source_ref, species_id");
        continue;
      }
      if (!heroSourceRef.startsWith(".registry/species/")) {
        addIssue(issues, "source-ref-prefix", fixture.repoPath, `${heroId} hero source_ref must stay under .registry/species/`);
      }
      if (!existsSoulforgePath(heroSourceRef)) {
        addIssue(issues, "source-ref-target", fixture.repoPath, `${heroId} hero source_ref target does not exist: ${heroSourceRef}`);
      }
    }

    const speciesIds = new Set(
      asArray<Record<string, unknown>>(species?.items)
        .map((item) => asString(item.id))
        .filter((value): value is string => Boolean(value))
    );
    const heroIdsBySpecies = new Map<string, Set<string>>();
    for (const hero of heroes) {
      const heroId = asString(hero.id);
      const speciesId = asString(hero.species_id);

      if (!heroId || !speciesId) {
        continue;
      }

      const heroIds = heroIdsBySpecies.get(speciesId) ?? new Set<string>();
      heroIds.add(heroId);
      heroIdsBySpecies.set(speciesId, heroIds);
    }
    const classIds = new Set(
      asArray<Record<string, unknown>>(classes?.items)
        .map((item) => asString(item.id))
        .filter((value): value is string => Boolean(value))
    );

    for (const unit of asArray<Record<string, unknown>>(units?.items)) {
      const unitId = asString(unit.id) ?? "<unknown-unit>";
      const identity = asObject(unit.identity);
      const profileRef = asString(identity?.profile_ref);
      const speciesId = asString(identity?.species_id);
      const heroId = asString(identity?.hero_id);
      const unitClassIds = asArray<string>(unit.class_ids);

      if (!profileRef || !speciesId || !heroId) {
        addIssue(issues, "required-field", fixture.repoPath, `${unitId} units.items entries require identity.profile_ref, identity.species_id, identity.hero_id`);
        continue;
      }
      if (!speciesIds.has(speciesId)) {
        addIssue(issues, "unit-ref", fixture.repoPath, `${unitId} identity.species_id does not resolve within fixture: ${speciesId}`);
      }
      if (!heroIdsBySpecies.get(speciesId)?.has(heroId)) {
        addIssue(issues, "unit-ref", fixture.repoPath, `${unitId} identity.hero_id does not resolve within species ${speciesId}: ${heroId}`);
      }
      for (const classId of unitClassIds) {
        if (!classIds.has(classId)) {
          addIssue(issues, "unit-ref", fixture.repoPath, `${unitId} class_id does not resolve within fixture: ${classId}`);
        }
      }
    }

    for (const workflow of asArray<Record<string, unknown>>(workflows?.items)) {
      const workflowId = asString(workflow.id) ?? "<unknown-workflow>";
      if (asString(workflow.history_policy) !== "curated_summary_only") {
        addIssue(issues, "workflow-history", fixture.repoPath, `${workflowId} must declare history_policy curated_summary_only`);
      }
      const historyRef = asString(workflow.history_ref);
      if (!historyRef || !existsSoulforgePath(historyRef)) {
        addIssue(issues, "workflow-history", fixture.repoPath, `${workflowId} history_ref must exist in repo`);
      }
    }

    for (const party of asArray<Record<string, unknown>>(parties?.items)) {
      const partyId = asString(party.id) ?? "<unknown-party>";
      if (asString(party.stats_policy) !== "curated_summary_only") {
        addIssue(issues, "party-stats", fixture.repoPath, `${partyId} must declare stats_policy curated_summary_only`);
      }
      const statsRef = asString(party.stats_ref);
      if (!statsRef || !existsSoulforgePath(statsRef)) {
        addIssue(issues, "party-stats", fixture.repoPath, `${partyId} stats_ref must exist in repo`);
      }
    }

    if (asString(workspaces?.mode) !== "local_only_mount") {
      addIssue(issues, "workspace-mode", fixture.repoPath, "workspaces.mode must be local_only_mount");
    }
  }

  return {
    name: "catalog lint",
    issues
  } satisfies LintResult;
}
