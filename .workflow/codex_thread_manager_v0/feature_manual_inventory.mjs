import { readFile, access } from "node:fs/promises";
import { dirname, join, resolve, win32, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

export const FEATURE_MANUAL_INVENTORY_REPORT_SCHEMA = "soulforge.codex_thread_manager.feature_manual_inventory_report.v1";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,319}$/u;
const VALIDATION_STATES = new Set(["passed", "failed", "not_run", "unvalidated", "unknown"]);
const OPAQUE_INVALID_FEATURE_ID = "invalid_feature_row";
const DEFAULT_CHANGELOG_REF = "CHANGELOG.md";
const DEFAULT_ROADMAP_REF = "docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md";
const DOCUMENT_OWNERSHIP_REF = "docs/architecture/foundation/DOCUMENT_OWNERSHIP.md";
const ROOT_README_REF = "README.md";

function codePointCompare(a, b) {
  return a < b ? -1 : (a > b ? 1 : 0);
}

function isSafeId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function isSafeRelativePath(target) {
  if (typeof target !== "string") return false;
  const trimmed = target.trim();
  if (!trimmed) return false;

  if (trimmed.includes("\0") || trimmed.includes("\\")) return false;

  const parts = trimmed.split("/");
  if (parts.includes("..") || parts.includes(".")) return false;

  if (win32.isAbsolute(trimmed) || posix.isAbsolute(trimmed)) return false;
  if (/^[a-zA-Z]:/u.test(trimmed)) return false;
  if (trimmed.startsWith("/") || trimmed.startsWith("\\")) return false;

  return true;
}

function isUnsafeValidatorStr(str) {
  if (typeof str !== "string") return true;
  const trimmed = str.trim();
  if (!trimmed || trimmed.length > 1024) return true;
  if (trimmed.includes("\0") || trimmed.includes("\\") || trimmed.includes("..")) return true;

  const tokens = trimmed.split(/\s+/u);
  const credFlagRegex = /^(?:--?)(?:password|secret|token|api[-_]?key|credential|private[-_]?key|auth|bearer)$/iu;
  const credInlineRegex = /(?:password|secret|token|api[-_]?key|credential|private[-_]?key|auth)=/iu;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.includes("~") || token.includes("\0") || token.includes("\\") || token.includes("..")) return true;
    if (win32.isAbsolute(token) || posix.isAbsolute(token)) return true;
    if (/(?:^|\/|\\)[a-zA-Z]:/u.test(token) || /:[/\\]/u.test(token)) return true;
    if (/(?:^|=)\//u.test(token) || /(?:^|=)\\ /u.test(token)) return true;
    if (credInlineRegex.test(token)) return true;
    if (credFlagRegex.test(token)) {
      if (i + 1 < tokens.length) return true;
    }
  }
  return false;
}

function defaultRepoRoot() {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..");
}

async function pathExists(targetPath, accessFn = access) {
  try {
    await accessFn(targetPath);
    return true;
  } catch {
    return false;
  }
}

function canonicalizeJson(obj, isRoot = true) {
  if (obj === undefined) return undefined;
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => (item === undefined ? "null" : canonicalizeJson(item, false))).join(",") + "]";
  }
  const sortedKeys = Object.keys(obj).sort(codePointCompare);
  const parts = [];
  for (const key of sortedKeys) {
    if (isRoot && (key === "generated_at" || key === "digest")) {
      continue;
    }
    const val = obj[key];
    if (val !== undefined) {
      parts.push(JSON.stringify(key) + ":" + canonicalizeJson(val, false));
    }
  }
  return "{" + parts.join(",") + "}";
}

function computeReportDigest(report) {
  const canonical = canonicalizeJson(report, true);
  const hex = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `sha256:${hex}`;
}

function extractBoundedSection(content, featureId) {
  if (typeof content !== "string" || !featureId) return null;
  const sections = content.split(/(?=\n#{1,4} )|\n\r?\n\r?\n/u);
  const target = featureId.toLowerCase();
  for (const sec of sections) {
    if (sec.toLowerCase().includes(target)) {
      return sec;
    }
  }
  return null;
}

function deriveTopLevelOwnerRoot(ownerRoot) {
  if (typeof ownerRoot !== "string") return null;
  const norm = ownerRoot.replace(/^\.\//u, "").trim();
  if (!norm) return null;
  const parts = norm.split("/");
  if (parts[0] === "docs" && parts.length > 1) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
}

function textContainsToken(content, token) {
  if (typeof content !== "string" || typeof token !== "string" || !token) return false;
  const contentLower = content.toLowerCase();
  const tokenLower = token.toLowerCase();
  if (contentLower.includes(tokenLower)) return true;

  const lines = contentLower.split(/\r?\n/u);
  for (const line of lines) {
    if (line.includes(tokenLower)) return true;
  }
  return false;
}

export async function scanFeatureManualInventory(featuresOrOptions, options = {}) {
  let features = [];
  let opts = {};
  if (Array.isArray(featuresOrOptions)) {
    features = featuresOrOptions;
    opts = options || {};
  } else if (featuresOrOptions && typeof featuresOrOptions === "object") {
    features = Array.isArray(featuresOrOptions.features) ? featuresOrOptions.features : [];
    opts = featuresOrOptions;
  } else {
    features = [];
    opts = options || {};
  }

  const testIo = opts._io ?? opts._testIo ?? {};
  const repoRoot = resolve(opts.repoRoot ?? defaultRepoRoot());
  const nowVal = typeof opts.now === "function" ? opts.now() : (opts.now ?? Date.now());
  const isoNow = typeof nowVal === "string" ? nowVal : new Date(nowVal).toISOString();
  const readFileFn = testIo.readFile ?? opts.readFile ?? readFile;
  const accessFn = testIo.access ?? opts.access ?? access;
  const pathExistsFn = (p) => pathExists(p, accessFn);

  const docOwnershipPath = join(repoRoot, DOCUMENT_OWNERSHIP_REF);
  let docOwnershipContent = "";
  if (await pathExistsFn(docOwnershipPath)) {
    try {
      docOwnershipContent = await readFileFn(docOwnershipPath, "utf8");
    } catch {
      docOwnershipContent = "";
    }
  }

  const rootReadmePath = join(repoRoot, ROOT_README_REF);
  let rootReadmeContent = "";
  if (await pathExistsFn(rootReadmePath)) {
    try {
      rootReadmeContent = await readFileFn(rootReadmePath, "utf8");
    } catch {
      rootReadmeContent = "";
    }
  }

  const summaryGapCounts = {
    malformed_feature_row: 0,
    missing_changelog_ref: 0,
    missing_index_registration: 0,
    missing_operating_manual: 0,
    missing_owner_readme: 0,
    missing_owner_root: 0,
    missing_ownership_registration: 0,
    missing_roadmap_ref: 0,
    missing_root_readme_coverage: 0,
    missing_validator_ref: 0,
    unsafe_path_detected: 0
  };

  const evaluatedSourceRefs = new Set([
    DEFAULT_CHANGELOG_REF,
    ROOT_README_REF,
    DEFAULT_ROADMAP_REF,
    DOCUMENT_OWNERSHIP_REF
  ]);

  const rows = [];

  for (const rawRow of features) {
    const gaps = new Set();
    let isMalformed = false;

    if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) {
      gaps.add("malformed_feature_row");
      isMalformed = true;
    }

    const rawFeatureId = !isMalformed && typeof rawRow.feature_id === "string" ? rawRow.feature_id.trim() : "";
    let safeFeatureId = rawFeatureId;
    if (!isMalformed && (!rawFeatureId || !isSafeId(rawFeatureId))) {
      gaps.add("malformed_feature_row");
      isMalformed = true;
      safeFeatureId = OPAQUE_INVALID_FEATURE_ID;
    }
    if (isMalformed && !safeFeatureId) {
      safeFeatureId = OPAQUE_INVALID_FEATURE_ID;
    }

    const rawValidationState = !isMalformed && typeof rawRow.last_validation_state === "string" ? rawRow.last_validation_state.trim() : null;
    let callerSuppliedValidationState = null;
    let validationStateSource = "absent";
    if (!isMalformed && rawValidationState !== null) {
      if (VALIDATION_STATES.has(rawValidationState)) {
        callerSuppliedValidationState = rawValidationState;
        validationStateSource = "declared";
      } else {
        gaps.add("malformed_feature_row");
        callerSuppliedValidationState = null;
        validationStateSource = "absent";
      }
    }

    const rawOwnerRoot = !isMalformed && typeof rawRow.owner_root === "string" ? rawRow.owner_root.trim() : null;
    const rawOwnerReadme = !isMalformed && typeof rawRow.owner_readme === "string" ? rawRow.owner_readme.trim() : null;
    const rawOperatingManualRef = !isMalformed && typeof rawRow.operating_manual_ref === "string" ? rawRow.operating_manual_ref.trim() : null;
    const rawValidatorRef = !isMalformed && typeof rawRow.validator_ref === "string" ? rawRow.validator_ref.trim() : null;
    const rawChangelogRef = !isMalformed && typeof rawRow.changelog_ref === "string" ? rawRow.changelog_ref.trim() : null;

    const roadmapRefRaw = rawRow?.roadmap_ref ?? rawRow?.mission_ref ?? rawRow?.roadmap_or_mission_ref;
    const rawRoadmapRef = !isMalformed && typeof roadmapRefRaw === "string" ? roadmapRefRaw.trim() : null;

    let outputOwnerRoot = null;
    let outputOwnerReadme = null;
    let outputOperatingManualRef = null;
    let outputValidatorRef = null;
    let outputChangelogRef = DEFAULT_CHANGELOG_REF;
    let outputRoadmapRef = DEFAULT_ROADMAP_REF;

    if (!isMalformed) {
      if (rawOwnerRoot !== null) {
        if (isSafeRelativePath(rawOwnerRoot)) {
          outputOwnerRoot = rawOwnerRoot;
        } else {
          gaps.add("unsafe_path_detected");
        }
      }

      if (rawOwnerReadme !== null) {
        if (isSafeRelativePath(rawOwnerReadme)) {
          outputOwnerReadme = rawOwnerReadme;
        } else {
          gaps.add("unsafe_path_detected");
        }
      }

      if (rawOperatingManualRef !== null) {
        const hashParts = rawOperatingManualRef.split("#");
        if (hashParts.length > 2) {
          gaps.add("unsafe_path_detected");
          outputOperatingManualRef = null;
        } else {
          const manualPath = hashParts[0];
          const anchor = hashParts[1] ?? "";
          const safeAnchor = !anchor || (/^[a-zA-Z0-9_-]+$/u.test(anchor) && !isUnsafeValidatorStr(anchor));
          if (isSafeRelativePath(manualPath) && safeAnchor) {
            outputOperatingManualRef = anchor ? `${manualPath}#${anchor}` : manualPath;
          } else {
            gaps.add("unsafe_path_detected");
            outputOperatingManualRef = null;
          }
        }
      }

      if (rawValidatorRef !== null) {
        if (!isUnsafeValidatorStr(rawValidatorRef)) {
          outputValidatorRef = rawValidatorRef;
        } else {
          gaps.add("unsafe_path_detected");
          outputValidatorRef = null;
        }
      }

      if (rawChangelogRef !== null) {
        if (isSafeRelativePath(rawChangelogRef)) {
          outputChangelogRef = rawChangelogRef;
        } else {
          gaps.add("unsafe_path_detected");
          outputChangelogRef = DEFAULT_CHANGELOG_REF;
        }
      }

      if (rawRoadmapRef !== null) {
        if (isSafeRelativePath(rawRoadmapRef)) {
          outputRoadmapRef = rawRoadmapRef;
        } else {
          gaps.add("unsafe_path_detected");
          outputRoadmapRef = DEFAULT_ROADMAP_REF;
        }
      }
    }

    let changelogStatus = "missing";
    let roadmapStatus = "missing";
    let lastValidationState = isMalformed || gaps.has("unsafe_path_detected") ? "unknown" : (callerSuppliedValidationState || "not_run");

    if (!isMalformed) {
      // 1. owner_root & DOCUMENT_OWNERSHIP
      if (!rawOwnerRoot) {
        gaps.add("missing_owner_root");
      } else if (outputOwnerRoot !== null) {
        const fullPath = join(repoRoot, outputOwnerRoot);
        if (!(await pathExistsFn(fullPath))) {
          gaps.add("missing_owner_root");
        } else {
          const topLevelRoot = deriveTopLevelOwnerRoot(outputOwnerRoot);
          if (
            !textContainsToken(docOwnershipContent, outputOwnerRoot) &&
            (!topLevelRoot || !textContainsToken(docOwnershipContent, topLevelRoot))
          ) {
            gaps.add("missing_ownership_registration");
          }
        }
      }

      // 2. root README coverage
      if (rawOwnerRoot || safeFeatureId) {
        const topLevelRoot = deriveTopLevelOwnerRoot(rawOwnerRoot);
        const rootNorm = (rawOwnerRoot ?? "").replace(/^\.\//u, "");
        if (
          !textContainsToken(rootReadmeContent, safeFeatureId) &&
          (!rootNorm || !textContainsToken(rootReadmeContent, rootNorm)) &&
          (!topLevelRoot || !textContainsToken(rootReadmeContent, topLevelRoot))
        ) {
          gaps.add("missing_root_readme_coverage");
        }
      } else {
        gaps.add("missing_root_readme_coverage");
      }

      // 3. owner_readme
      if (!rawOwnerReadme) {
        gaps.add("missing_owner_readme");
      } else if (outputOwnerReadme !== null) {
        const fullPath = join(repoRoot, outputOwnerReadme);
        if (!(await pathExistsFn(fullPath))) {
          gaps.add("missing_owner_readme");
        }
      }

      // 4. operating_manual_ref
      if (!rawOperatingManualRef) {
        gaps.add("missing_operating_manual");
      } else if (outputOperatingManualRef !== null) {
        const [manualPath, anchor] = outputOperatingManualRef.split("#");
        const fullPath = join(repoRoot, manualPath);
        if (!(await pathExistsFn(fullPath))) {
          gaps.add("missing_operating_manual");
        } else if (anchor) {
          try {
            const content = await readFileFn(fullPath, "utf8");
            const anchorLower = anchor.toLowerCase();
            const anchorSpace = anchorLower.replace(/[-_]+/gu, " ");
            const anchorHyphen = anchorLower.replace(/\s+/gu, "-");
            const contentLower = content.toLowerCase();
            if (
              !contentLower.includes(anchorLower) &&
              !contentLower.includes(anchorSpace) &&
              !contentLower.includes(anchorHyphen) &&
              !contentLower.includes(safeFeatureId.toLowerCase())
            ) {
              gaps.add("missing_operating_manual");
            }
          } catch {
            gaps.add("missing_operating_manual");
          }
        }
      }

      // 5. validator_ref
      if (!rawValidatorRef) {
        gaps.add("missing_validator_ref");
        lastValidationState = "unvalidated";
      } else if (outputValidatorRef === null) {
        gaps.add("unsafe_path_detected");
        lastValidationState = "unknown";
      } else {
        if (outputValidatorRef.startsWith("npm run ") || outputValidatorRef.startsWith("npm.cmd run ")) {
          evaluatedSourceRefs.add("package.json");
          const scriptName = outputValidatorRef.replace(/^npm(\.cmd)? run /u, "").trim();
          try {
            const pkgPath = join(repoRoot, "package.json");
            const pkgContent = JSON.parse(await readFileFn(pkgPath, "utf8"));
            if (pkgContent?.scripts?.[scriptName]) {
              if (callerSuppliedValidationState === "passed") {
                lastValidationState = "passed";
              } else if (callerSuppliedValidationState === "failed") {
                lastValidationState = "failed";
              } else {
                lastValidationState = callerSuppliedValidationState || "not_run";
              }
            } else {
              gaps.add("missing_validator_ref");
              lastValidationState = "unvalidated";
            }
          } catch {
            gaps.add("missing_validator_ref");
            lastValidationState = "unvalidated";
          }
        } else {
          const pathMatches = outputValidatorRef.match(/[a-zA-Z0-9_./-]+\.(mjs|js|ts|py|json|yaml|yml)/gu) ?? [];
          if (pathMatches.length === 0) {
            if (callerSuppliedValidationState === "passed") {
              lastValidationState = "passed";
            } else {
              lastValidationState = callerSuppliedValidationState || "not_run";
            }
          } else {
            let allExist = true;
            for (const relP of pathMatches) {
              if (relP.includes("*")) continue;
              if (isSafeRelativePath(relP)) {
                if (!(await pathExistsFn(join(repoRoot, relP)))) {
                  allExist = false;
                  break;
                }
              }
            }
            if (allExist) {
              if (callerSuppliedValidationState === "passed") {
                lastValidationState = "passed";
              } else if (callerSuppliedValidationState === "failed") {
                lastValidationState = "failed";
              } else {
                lastValidationState = callerSuppliedValidationState || "not_run";
              }
            } else {
              gaps.add("missing_validator_ref");
              lastValidationState = "unvalidated";
            }
          }
        }
      }

      // 6. changelog_ref
      const clRef = outputChangelogRef;
      if (isSafeRelativePath(clRef)) {
        evaluatedSourceRefs.add(clRef);
        const fullPath = join(repoRoot, clRef);
        if (await pathExistsFn(fullPath)) {
          try {
            const content = await readFileFn(fullPath, "utf8");
            const boundedSec = extractBoundedSection(content, safeFeatureId);
            if (!boundedSec) {
              changelogStatus = "missing";
              gaps.add("missing_changelog_ref");
            } else {
              const secLower = boundedSec.toLowerCase();
              if (boundedSec.includes("Revision pending") || secLower.includes("pending")) {
                changelogStatus = "pending";
              } else {
                changelogStatus = "recorded";
              }
            }
          } catch {
            changelogStatus = "missing";
            gaps.add("missing_changelog_ref");
          }
        } else {
          changelogStatus = "missing";
          gaps.add("missing_changelog_ref");
        }
      } else {
        changelogStatus = "missing";
        gaps.add("missing_changelog_ref");
      }

      // 7. index registration
      if (rawOwnerRoot) {
        if (rawOwnerRoot.startsWith(".workflow") || rawOwnerRoot.startsWith("./.workflow")) {
          evaluatedSourceRefs.add(".workflow/index.yaml");
          const indexPath = join(repoRoot, ".workflow", "index.yaml");
          if (await pathExistsFn(indexPath)) {
            try {
              const content = await readFileFn(indexPath, "utf8");
              if (!content.includes(safeFeatureId) && !content.includes(rawOwnerRoot.replace(/^\.\//u, ""))) {
                gaps.add("missing_index_registration");
              }
            } catch {
              gaps.add("missing_index_registration");
            }
          } else {
            gaps.add("missing_index_registration");
          }
        } else if (rawOwnerRoot.startsWith(".registry") || rawOwnerRoot.startsWith("./.registry")) {
          evaluatedSourceRefs.add(".registry/index.yaml");
          const indexPath = join(repoRoot, ".registry", "index.yaml");
          if (await pathExistsFn(indexPath)) {
            try {
              const content = await readFileFn(indexPath, "utf8");
              if (!content.includes(safeFeatureId) && !content.includes(rawOwnerRoot.replace(/^\.\//u, ""))) {
                gaps.add("missing_index_registration");
              }
            } catch {
              gaps.add("missing_index_registration");
            }
          } else {
            gaps.add("missing_index_registration");
          }
        }
      }

      // 8. roadmap_ref / mission_ref
      const rmRef = outputRoadmapRef;
      if (isSafeRelativePath(rmRef)) {
        evaluatedSourceRefs.add(rmRef);
        const fullPath = join(repoRoot, rmRef);
        if (await pathExistsFn(fullPath)) {
          try {
            const content = await readFileFn(fullPath, "utf8");
            const boundedSec = extractBoundedSection(content, safeFeatureId);
            if (!boundedSec) {
              roadmapStatus = "missing";
              gaps.add("missing_roadmap_ref");
            } else {
              const secLower = boundedSec.toLowerCase();
              if (rmRef.startsWith(".mission/") || rmRef.startsWith("./.mission/")) {
                roadmapStatus = "mission_bound";
              } else if (secLower.includes("proposed") || secLower.includes("후보")) {
                roadmapStatus = "proposed";
              } else {
                roadmapStatus = "active";
              }
            }
          } catch {
            roadmapStatus = "missing";
            gaps.add("missing_roadmap_ref");
          }
        } else {
          roadmapStatus = "missing";
          gaps.add("missing_roadmap_ref");
        }
      } else {
        roadmapStatus = "missing";
        gaps.add("missing_roadmap_ref");
      }
    }

    if (gaps.has("malformed_feature_row") || gaps.has("unsafe_path_detected")) {
      lastValidationState = "unknown";
    }

    const sortedGaps = Array.from(gaps).sort(codePointCompare);
    for (const gCode of sortedGaps) {
      if (Object.hasOwn(summaryGapCounts, gCode)) {
        summaryGapCounts[gCode]++;
      }
    }

    rows.push({
      feature_id: safeFeatureId,
      owner_root: outputOwnerRoot,
      owner_readme: outputOwnerReadme,
      operating_manual_ref: outputOperatingManualRef,
      validator_ref: outputValidatorRef,
      changelog_ref: outputChangelogRef,
      changelog_status: changelogStatus,
      roadmap_ref: outputRoadmapRef,
      roadmap_status: roadmapStatus,
      last_validation_state: lastValidationState,
      last_validation_state_source: validationStateSource,
      stable_gap_codes: sortedGaps,
      next_action: sortedGaps.length === 0 ? "none" : "HOLD"
    });
  }

  // Canonical total row sorting (primary feature_id, secondary canonical JSON string)
  rows.sort((a, b) => {
    const cmp = codePointCompare(a.feature_id, b.feature_id);
    if (cmp !== 0) return cmp;
    return codePointCompare(canonicalizeJson(a, false), canonicalizeJson(b, false));
  });

  const gapFeatures = rows.filter((r) => r.stable_gap_codes.length > 0).length;
  const coveredFeatures = rows.length - gapFeatures;
  const reportStatus = gapFeatures === 0 && rows.length > 0 ? "PASS" : "HOLD";

  const sortedSourceRefs = Array.from(evaluatedSourceRefs).sort(codePointCompare);

  const report = {
    schema_version: FEATURE_MANUAL_INVENTORY_REPORT_SCHEMA,
    generated_at: isoNow,
    report_only: true,
    status: reportStatus,
    total_features: rows.length,
    covered_features: coveredFeatures,
    gap_features: gapFeatures,
    summary_gap_counts: summaryGapCounts,
    source_refs: sortedSourceRefs,
    rows
  };

  report.digest = computeReportDigest(report);
  return report;
}
