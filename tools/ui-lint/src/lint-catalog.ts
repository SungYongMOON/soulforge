import { existsSync } from "node:fs";
import {
  ALLOWED_TOOL_FAMILIES,
  ROW_RULES,
  addIssue,
  asArray,
  asBoolean,
  asObject,
  asString,
  existsRepoPath,
  extractCanonicalId,
  loadFixtures,
  readYamlFile,
  resolveReference,
  walkFiles,
  type LintIssue,
  type LintResult
} from "./shared";

interface CatalogManifestItem {
  id: string;
  sourceRef: string;
}

interface CatalogManifest {
  file: string;
  family: string | null;
  items: Map<string, CatalogManifestItem>;
}

function expectedCatalogKind(file: string) {
  if (file.includes("/profiles/")) {
    return "class_profiles";
  }
  if (file.includes("/skills/")) {
    return "class_skills";
  }
  if (file.includes("/tools/")) {
    return "class_tools";
  }
  if (file.includes("/knowledge/")) {
    return "class_knowledge";
  }
  if (file.includes("/workflows/")) {
    return "class_workflows";
  }
  return null;
}

function parseCanonicalId(repoPath: string, issues: LintIssue[], contextFile: string, expectedId: string) {
  if (!existsRepoPath(repoPath)) {
    addIssue(issues, "source-ref-target", contextFile, `${repoPath} does not exist`);
    return;
  }

  const document = readYamlFile<Record<string, unknown>>(repoPath);
  const canonicalId = extractCanonicalId(repoPath, document);
  if (!canonicalId) {
    addIssue(issues, "canonical-id", contextFile, `unable to derive canonical id from ${repoPath}`);
    return;
  }

  if (canonicalId !== expectedId) {
    addIssue(issues, "canonical-id", contextFile, `${repoPath} id ${canonicalId} does not match ${expectedId}`);
  }
}

function buildClassCatalogs(issues: LintIssue[]) {
  const manifests = new Map<string, CatalogManifest>();
  const files = walkFiles(".agent/catalog/class", (repoPath) => repoPath.endsWith(".yaml"));

  for (const file of files) {
    const document = readYamlFile<Record<string, unknown>>(file);
    const items = asArray<Record<string, unknown>>(document.items);
    const seenIds = new Set<string>();
    const expectedKind = expectedCatalogKind(file);
    const declaredKind = asString(document.catalog_kind);
    const selectionStateSource = asString(document.selection_state_source);
    const canonicalRootRef = asString(document.canonical_root_ref);

    if (!asString(document.catalog_id)) {
      addIssue(issues, "required-field", file, "catalog_id is required");
    }

    if (!declaredKind) {
      addIssue(issues, "required-field", file, "catalog_kind is required");
    } else if (expectedKind && declaredKind !== expectedKind) {
      addIssue(issues, "catalog-kind", file, `expected catalog_kind ${expectedKind}, got ${declaredKind}`);
    }

    if (selectionStateSource) {
      const resolved = resolveReference(selectionStateSource, file);
      if (!existsSync(resolved.absolutePath)) {
        addIssue(issues, "selection-state-source", file, `${selectionStateSource} does not resolve from ${file}`);
      }
    }

    if (canonicalRootRef) {
      const resolved = resolveReference(canonicalRootRef, file);
      if (!existsSync(resolved.absolutePath)) {
        addIssue(issues, "canonical-root-ref", file, `${canonicalRootRef} does not resolve from ${file}`);
      }
    }

    const family = file.includes("/tools/") ? file.split("/").at(-1)?.replace("_catalog.yaml", "") ?? null : null;
    const declaredFamily = asString(document.tool_family);
    if (family) {
      if (!ALLOWED_TOOL_FAMILIES.has(family)) {
        addIssue(issues, "tool-family", file, `unexpected tool family ${family}`);
      }
      if (declaredFamily !== family) {
        addIssue(issues, "tool-family", file, `tool_family must match file family ${family}`);
      }
    } else if (declaredFamily) {
      addIssue(issues, "tool-family", file, `non-tool catalog must not declare tool_family ${declaredFamily}`);
    }

    const manifest: CatalogManifest = {
      file,
      family,
      items: new Map()
    };

    for (const item of items) {
      const itemId = asString(item.item_id);
      const displayName = asString(item.display_name);
      const sourceRef = asString(item.source_ref);
      const summary = asString(item.summary);

      if (!itemId || !displayName || !sourceRef || !summary) {
        addIssue(issues, "required-field", file, "catalog items require item_id, display_name, source_ref, summary");
        continue;
      }

      if (seenIds.has(itemId)) {
        addIssue(issues, "item-id-unique", file, `duplicate catalog item_id ${itemId}`);
        continue;
      }
      seenIds.add(itemId);

      const resolvedSource = resolveReference(sourceRef, file);
      if (!existsSync(resolvedSource.absolutePath)) {
        addIssue(issues, "source-ref-target", file, `${sourceRef} does not resolve from ${file}`);
      } else {
        parseCanonicalId(resolvedSource.repoPath, issues, file, itemId);
      }

      manifest.items.set(itemId, {
        id: itemId,
        sourceRef: resolvedSource.repoPath
      });
    }

    manifests.set(file, manifest);
  }

  return manifests;
}

function expectedCatalogCandidateForRow(payload: Record<string, unknown>, rowKey: keyof typeof ROW_RULES, itemId: string) {
  const classCatalogs = asObject(asObject(payload.catalogs)?.class);
  const items = asArray<Record<string, unknown>>(classCatalogs?.[ROW_RULES[rowKey].catalogKey]);
  return items.find((item) => asString(item.id) === itemId) ?? null;
}

function validateFixtureClassRows(
  fixturePath: string,
  payload: Record<string, unknown>,
  classCatalogs: Map<string, CatalogManifest>,
  issues: LintIssue[]
) {
  const rows = asObject(asObject(payload.class_view)?.rows);
  const activeRowIds = new Map<string, Set<string>>();

  for (const [rowKey, rowRule] of Object.entries(ROW_RULES) as Array<[keyof typeof ROW_RULES, (typeof ROW_RULES)[keyof typeof ROW_RULES]]>) {
    const seenIds = new Set<string>();
    const rowItems = asArray<Record<string, unknown>>(rows?.[rowKey]);
    activeRowIds.set(rowKey, new Set());

    for (const item of rowItems) {
      const itemId = asString(item.id);
      const displayName = asString(item.display_name);
      const summary = asString(item.summary);
      const sourceRef = asString(item.source_ref);
      const catalogRef = asString(item.catalog_ref);
      const category = asString(item.category);
      const family = asString(item.family);

      if (!itemId || !displayName || !summary || !sourceRef || !catalogRef || !category) {
        addIssue(issues, "required-field", fixturePath, `${rowKey} items require id, display_name, summary, source_ref, catalog_ref, category`);
        continue;
      }

      if (seenIds.has(itemId)) {
        addIssue(issues, "item-id-unique", fixturePath, `duplicate ${rowKey} item id ${itemId}`);
        continue;
      }
      seenIds.add(itemId);

      if (category !== rowRule.category) {
        addIssue(issues, "category", fixturePath, `${itemId} category must be ${rowRule.category}, got ${category}`);
      }

      if (rowKey === "tools") {
        if (!family || !ALLOWED_TOOL_FAMILIES.has(family)) {
          addIssue(issues, "tool-family", fixturePath, `${itemId} must declare a valid tool family`);
        }
      } else if (family !== null) {
        addIssue(issues, "tool-family", fixturePath, `${itemId} must not declare family outside tools row`);
      }

      parseCanonicalId(sourceRef, issues, fixturePath, itemId);

      const manifest = classCatalogs.get(catalogRef);
      if (!manifest) {
        addIssue(issues, "catalog-ref", fixturePath, `${itemId} catalog_ref ${catalogRef} does not match a known class catalog`);
      } else {
        if (!manifest.items.has(itemId)) {
          addIssue(issues, "canonical-id", fixturePath, `${itemId} is missing from catalog ${catalogRef}`);
        }
        if (rowKey === "tools" && family && manifest.family !== family) {
          addIssue(issues, "tool-family", fixturePath, `${itemId} family ${family} does not match catalog family ${manifest.family}`);
        }
      }

      const candidate = expectedCatalogCandidateForRow(payload, rowKey, itemId);
      if (asBoolean(item.selectable_candidate) === true && !candidate) {
        addIssue(issues, "orphan-entry", fixturePath, `${itemId} is selectable but missing from fixture catalog ${rowRule.catalogKey}`);
      }

      if (asBoolean(item.active) === true) {
        activeRowIds.get(rowKey)?.add(itemId);
      }
    }
  }

  const classCatalogsState = asObject(asObject(payload.catalogs)?.class);
  const activeProfile = asObject(asObject(payload.class_view)?.active_profile);
  const profileCatalog = asArray<Record<string, unknown>>(classCatalogsState?.profiles_catalog);
  const activeProfileId = asString(activeProfile?.id);

  if (activeProfileId && !profileCatalog.some((item) => asString(item.id) === activeProfileId)) {
    addIssue(issues, "active-ref", fixturePath, `active profile ${activeProfileId} is missing from profiles_catalog`);
  }

  for (const [rowKey, rowRule] of Object.entries(ROW_RULES) as Array<[keyof typeof ROW_RULES, (typeof ROW_RULES)[keyof typeof ROW_RULES]]>) {
    const catalogItems = asArray<Record<string, unknown>>(classCatalogsState?.[rowRule.catalogKey]);
    const rowIds = new Set(asArray<Record<string, unknown>>(rows?.[rowKey]).map((item) => asString(item.id)).filter(Boolean) as string[]);

    for (const catalogItem of catalogItems) {
      const itemId = asString(catalogItem.id);
      if (!itemId) {
        continue;
      }

      if (asBoolean(catalogItem.active) === true && !rowIds.has(itemId)) {
        addIssue(issues, "active-ref", fixturePath, `active catalog item ${itemId} has no installed row entry in ${rowKey}`);
      }
    }
  }
}

function validateFixtureCatalogs(
  fixturePath: string,
  payload: Record<string, unknown>,
  classCatalogs: Map<string, CatalogManifest>,
  issues: LintIssue[]
) {
  const catalogs = asObject(payload.catalogs);
  const identityCatalogs = asObject(catalogs?.identity);
  const classCatalogsState = asObject(catalogs?.class);
  const body = asObject(payload.body);
  const overview = asObject(payload.overview);
  const bodyActiveSpecies = asObject(body?.active_species);
  const overviewActiveSpecies = asObject(overview?.active_species);
  const classActiveProfile = asObject(asObject(payload.class_view)?.active_profile);

  const sections: Array<{ items: Record<string, unknown>[]; scope: string; sourceType: "canonical" | "catalog" }> = [
    {
      items: asArray<Record<string, unknown>>(identityCatalogs?.species_candidates),
      scope: "identity.species_candidates",
      sourceType: "canonical"
    },
    {
      items: asArray<Record<string, unknown>>(identityCatalogs?.hero_candidates),
      scope: "identity.hero_candidates",
      sourceType: "canonical"
    },
    {
      items: asArray<Record<string, unknown>>(classCatalogsState?.profiles_catalog),
      scope: "class.profiles_catalog",
      sourceType: "catalog"
    },
    {
      items: asArray<Record<string, unknown>>(classCatalogsState?.skills_catalog),
      scope: "class.skills_catalog",
      sourceType: "catalog"
    },
    {
      items: asArray<Record<string, unknown>>(classCatalogsState?.tools_catalog),
      scope: "class.tools_catalog",
      sourceType: "catalog"
    },
    {
      items: asArray<Record<string, unknown>>(classCatalogsState?.knowledge_catalog),
      scope: "class.knowledge_catalog",
      sourceType: "catalog"
    },
    {
      items: asArray<Record<string, unknown>>(classCatalogsState?.workflows_catalog),
      scope: "class.workflows_catalog",
      sourceType: "catalog"
    }
  ];

  for (const section of sections) {
    const seenIds = new Set<string>();

    for (const item of section.items) {
      const itemId = asString(item.id);
      const displayName = asString(item.display_name);
      const summary = asString(item.summary);
      const sourceRef = asString(item.source_ref);

      if (!itemId || !displayName || !summary || !sourceRef) {
        addIssue(issues, "required-field", fixturePath, `${section.scope} items require id, display_name, summary, source_ref`);
        continue;
      }

      if (seenIds.has(itemId)) {
        addIssue(issues, "item-id-unique", fixturePath, `duplicate catalog item id ${itemId} in ${section.scope}`);
        continue;
      }
      seenIds.add(itemId);

      if (!existsRepoPath(sourceRef)) {
        addIssue(issues, "source-ref-target", fixturePath, `${section.scope} source_ref ${sourceRef} does not exist`);
        continue;
      }

      if (section.sourceType === "canonical") {
        parseCanonicalId(sourceRef, issues, fixturePath, itemId);
      } else {
        const manifest = classCatalogs.get(sourceRef);
        if (!manifest) {
          addIssue(issues, "source-ref-target", fixturePath, `${section.scope} source_ref ${sourceRef} is not a known catalog file`);
        } else if (!manifest.items.has(itemId)) {
          addIssue(issues, "canonical-id", fixturePath, `${section.scope} item ${itemId} is missing from ${sourceRef}`);
        }
      }
    }
  }

  if (asString(bodyActiveSpecies?.id) !== asString(overviewActiveSpecies?.id)) {
    addIssue(issues, "active-ref", fixturePath, "overview.active_species and body.active_species must match");
  }

  const speciesCandidates = asArray<Record<string, unknown>>(identityCatalogs?.species_candidates);
  const activeSpeciesId = asString(bodyActiveSpecies?.id);
  if (activeSpeciesId && !speciesCandidates.some((item) => asString(item.id) === activeSpeciesId)) {
    addIssue(issues, "active-ref", fixturePath, `active species ${activeSpeciesId} is missing from species_candidates`);
  }

  const activeProfileId = asString(classActiveProfile?.id);
  const profilesCatalog = asArray<Record<string, unknown>>(classCatalogsState?.profiles_catalog);
  if (activeProfileId && !profilesCatalog.some((item) => asString(item.id) === activeProfileId)) {
    addIssue(issues, "active-ref", fixturePath, `active profile ${activeProfileId} is missing from profiles_catalog`);
  }
}

function validateFixtureTopLevelRefs(fixturePath: string, payload: Record<string, unknown>, issues: LintIssue[]) {
  const overview = asObject(payload.overview);
  const body = asObject(payload.body);
  const classView = asObject(payload.class_view);
  const overviewActiveSpecies = asObject(overview?.active_species);
  const overviewActiveHero = asObject(overview?.active_hero);
  const bodyActiveSpecies = asObject(body?.active_species);
  const bodyActiveHero = asObject(body?.active_hero);
  const activeProfile = asObject(classView?.active_profile);

  const refs = [
    {
      label: "overview.active_species",
      object: overviewActiveSpecies,
      expectedId: asString(overviewActiveSpecies?.id)
    },
    {
      label: "overview.active_hero",
      object: overviewActiveHero,
      expectedId: asString(overviewActiveHero?.id)
    },
    {
      label: "body.active_species",
      object: bodyActiveSpecies,
      expectedId: asString(bodyActiveSpecies?.id)
    },
    {
      label: "body.active_hero",
      object: bodyActiveHero,
      expectedId: asString(bodyActiveHero?.id)
    },
    {
      label: "class_view.active_profile",
      object: activeProfile,
      expectedId: asString(activeProfile?.id)
    }
  ];

  for (const ref of refs) {
    if (!ref.object) {
      continue;
    }

    const sourceRef = asString(ref.object.source_ref);
    if (!sourceRef) {
      addIssue(issues, "source-ref", fixturePath, `${ref.label} source_ref is required`);
      continue;
    }

    if (!ref.expectedId) {
      addIssue(issues, "required-field", fixturePath, `${ref.label} id is required`);
      continue;
    }

    parseCanonicalId(sourceRef, issues, fixturePath, ref.expectedId);
  }

  if (asString(overview?.class_id) !== asString(classView?.class_id)) {
    addIssue(issues, "active-ref", fixturePath, "overview.class_id and class_view.class_id must match");
  }

  if (asString(overview?.active_profile) !== asString(activeProfile?.id)) {
    addIssue(issues, "active-ref", fixturePath, "overview.active_profile and class_view.active_profile.id must match");
  }
}

export function runCatalogLint() {
  const issues: LintIssue[] = [];
  const classCatalogs = buildClassCatalogs(issues);

  for (const fixture of loadFixtures()) {
    validateFixtureTopLevelRefs(fixture.repoPath, fixture.payload, issues);
    validateFixtureCatalogs(fixture.repoPath, fixture.payload, classCatalogs, issues);
    validateFixtureClassRows(fixture.repoPath, fixture.payload, classCatalogs, issues);
  }

  return {
    name: "catalog lint",
    issues
  } satisfies LintResult;
}
