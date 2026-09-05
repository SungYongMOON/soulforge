#!/usr/bin/env node

// Retired display-term policy.
//
// Soulforge's world-name flavor layer (`docs/architecture/foundation/SHARED_GLOSSARY_V0.md`
// §옛 표기 → 표시명 대조표) retires a short list of technical display terms in favor of the
// adopted forge names (Vigil, World Tree, Hammer, Tributary, Tongs, ...). This validator scans
// tracked public documents for literal, unquoted reuse of those retired terms in running prose
// and fails closed when it finds one.
//
// Deliberate scope note (read before editing RETIRED_TERMS): the glossary's own comparison-table
// column lists several additional retired forms — bare `정본`/`canon`, `조직`, `검증 관문`/
// `review gate`/`validator`, `백업`/`backup`/`DR`, `모델`/`LLM`, `원본`/`source`, `예약작업`/
// `scheduled task`/`자동화`, `엔진`/`Engineering Engine`, and the bare `ERP`/`dev-ERP`/`dev-erp`
// family — that this validator intentionally does NOT enforce. Each of those also has a large,
// legitimate, unrelated meaning elsewhere in this same tracked tree (`정본`/`canon` alone is a
// foundational word used hundreds of times for the ordinary concept of canon; `ERP` also names
// one axis of the unrelated `AX/ERP/SYSTEM` organization-branch code in the guild_hall
// organization documents, pairs with `Vault` as a separate historical asset-tier name in plan 00/
// plan 17, and collides with the Master Map's own distinct "Context World Tree" knowledge/RAG
// concept). A literal, deterministic scan cannot tell that ordinary, unrelated use apart from a
// retired display-term mention, so including those tokens here would fail on correct, unrelated
// prose instead of only on real regressions. See EXCLUDED_COLUMN_ENTRIES below and its paired
// test for the explicit, reviewed accounting of what was left out and why; RETIRED_TERMS_POLICY_V0
// keeps only the higher-signal multi-word phrases and specific-enough proper nouns from the same
// column, each of which is still verified (by test) to be a verbatim substring of that column.
//
//   node guild_hall/validate/retired_display_terms_policy.mjs [--scope changed|tracked]
//        [--include-nested] [--json] [--baseline <path-to-baseline.json>]
//
// --baseline names a JSON file (see retired_display_terms_baseline.json) whose "files" array lists
// paths allowed to keep pre-existing violations. A violation in a baselined file is exempted from
// the exit code; a violation in any other file still fails the run. A baselined file with zero
// current violations prints a warning recommending its removal from the baseline, without failing.
//
// Exit 0 when no non-exempted violation is found; exit 1 on any non-exempted violation or scan
// failure.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(__dirname, "../..");
const schemaVersion = "soulforge.retired_display_terms_policy.v0";

// Retired term -> adopted display name. Order matters only for readability; matching itself is
// substring-based and every term is checked independently. Keep this list literal and short: each
// entry must remain a verbatim substring of the glossary's "이제 쓰지 않는 표기" column (see the
// paired test), and each must be specific enough not to collide with an unrelated, still-current
// meaning of the same characters elsewhere in the tree.
export const RETIRED_TERMS_POLICY_V0 = Object.freeze([
  { term: "4192 감시면", display: "Vigil" },
  { term: "Team Ops Board", display: "Vigil" },
  { term: "Ops Board", display: "Vigil" },
  { term: "상황판", display: "Vigil" },
  { term: "Watchtower", display: "Vigil" },
  { term: "4192", display: "Vigil", skip_if_preceded_by: ["포트 ", "compatibility handle ", "compatibility/runtime handle "] },
  { term: "Task Engine", display: "Hammer" },
  { term: "할일 엔진", display: "Hammer" },
  { term: "수집 lane", display: "Tributary" },
  { term: "collection lane", display: "Tributary" },
  { term: "ingress lane", display: "Tributary" },
  { term: "custody 사본", display: "Ingot" },
  { term: "수집 사본", display: "Ingot" },
  { term: "원천 자료", display: "Ore" },
  { term: "MCP 문", display: "Tongs" },
  { term: "MCP gate", display: "Tongs" },
  { term: "MCP 창구", display: "Tongs" },
  { term: "Hermes 프로필 스냅샷", display: "Sigil" },
  { term: "SOUL 스냅샷", display: "Sigil" },
  { term: "백업 세대", display: "Reliquary" },
  { term: "정본 승격 3규칙", display: "Covenant" },
  { term: "판단 Engine", display: "Rune" },
  { term: "브라우저 ERP", display: "World Tree" },
  { term: "private data root", display: "Heartwood" },
  { term: "D: 데이터 루트", display: "Heartwood" },
]);

// Column entries deliberately left out of RETIRED_TERMS_POLICY_V0, and why. The paired test
// asserts this list stays in sync with the glossary column: every raw token in that column must
// land in exactly one of RETIRED_TERMS_POLICY_V0 or here, so a future glossary edit that adds or
// removes a retired form forces a conscious update to one of the two lists instead of silently
// drifting.
export const EXCLUDED_COLUMN_ENTRIES_V0 = Object.freeze([
  { term: "Board", reason: "generic_word_high_noise", detail: "bare 'Board' also names the unrelated Mission Board concept, specific historical CHANGELOG-titled features, and mockup-spec tab labels." },
  { term: "Watchtower(표시명으로 쓸 때)", reason: "qualifier_only_covered_by_bare_form", detail: "the qualifier is human guidance, not literal text; the bare 'Watchtower' form above already covers this row." },
  { term: "ERP", reason: "generic_word_high_noise", detail: "also the 'ERP' axis of the unrelated AX/ERP/SYSTEM organization-branch code, and pairs with 'Vault' as a separate historical asset-tier name." },
  { term: "dev-ERP", reason: "generic_word_high_noise", detail: "same collision as bare 'ERP'; most tracked uses are the AX/ERP/SYSTEM axis or the Vault/ERP asset-tier pairing, not a display-term mention." },
  { term: "dev-erp(표시)", reason: "qualifier_excluded_with_dev_ERP", detail: "the qualifier marks this as display-only, but a deterministic scan cannot separate that from the identifier `ui-workspace/apps/dev-erp`; excluded with dev-ERP above." },
  { term: "엔진", reason: "generic_word_high_noise", detail: "generic Korean 'engine'; also used for the unrelated Domain Engine / Task Engine / RAG-engine vocabulary." },
  { term: "Engineering Engine(표시)", reason: "generic_word_moderate_noise", detail: "also the formal product name 'Soulforge Engineering Engine' used throughout the Master Map's own product tables." },
  { term: "조직", reason: "generic_word_high_noise", detail: "ordinary Korean 'organization'; the guild_hall organization documents use it constantly for unrelated org-chart content, including a document literally titled '...조직모델'." },
  { term: "AI 조직", reason: "generic_word_moderate_noise", detail: "same collision as bare 조직 in the same organization documents." },
  { term: "Agent Platform(표시)", reason: "qualifier_and_moderate_noise", detail: "also used as the formal product name paired with World Tree/Rune throughout README and the reviewer packet's legend line." },
  { term: "`<private_root>` 표시", reason: "qualifier_excludes_sanctioned_placeholder", detail: "bare `<private_root>` is the AGENTS.md-sanctioned path placeholder and must stay usable; it is already backtick-wrapped in the glossary's own cell, and the checker's backtick exclusion already covers it." },
  { term: "모델", reason: "generic_word_high_noise", detail: "ordinary Korean 'model'; used constantly for AI model choice, data model, threat model, and other unrelated concepts." },
  { term: "LLM", reason: "generic_word_moderate_noise", detail: "generic industry acronym used throughout for unrelated LLM-in-general discussion." },
  { term: "Codex/Claude/GPT(역할로 부를 때)", reason: "qualifier_not_literal", detail: "the qualifier ('when used as a role name') cannot be matched deterministically; the slash-joined literal string itself is not real prose." },
  { term: "예약작업", reason: "generic_word_moderate_noise", detail: "ordinary Korean 'scheduled task'; used throughout for the unrelated general concept of Windows scheduled tasks." },
  { term: "scheduled task", reason: "generic_word_moderate_noise", detail: "same collision as 예약작업 in English prose." },
  { term: "자동화(표시)", reason: "generic_word_high_noise", detail: "ordinary Korean 'automation'; used constantly for unrelated automation discussion." },
  { term: "정본", reason: "generic_word_high_noise", detail: "foundational Korean word for 'canon', used hundreds of times per the ordinary canon/authority concept, unrelated to the Anvil flavor name." },
  { term: "canon(표시)", reason: "generic_word_high_noise", detail: "same collision as 정본 in English prose; 'canon' is this repository's single most common technical word." },
  { term: "검증 관문", reason: "generic_phrase_low_signal", detail: "no tracked prose use of this exact phrase was found outside the glossary's own row; left out pending a real occurrence rather than risk an untested pattern." },
  { term: "review gate", reason: "generic_word_moderate_noise", detail: "'review gate' is common generic process vocabulary across the post-development review contract, unrelated to Quench in most uses." },
  { term: "validator(표시)", reason: "generic_word_high_noise", detail: "ordinary word for every `validate:*` script and test harness in this repository." },
  { term: "원본", reason: "generic_word_high_noise", detail: "ordinary Korean 'original/source'; used constantly for the unrelated general concept of an original file or document." },
  { term: "source", reason: "generic_word_high_noise", detail: "the single most common English technical word in this repository (source packet, source truth, source revision, source code, ...), unrelated to Ore in nearly all uses." },
  { term: "3규칙", reason: "generic_word_low_signal", detail: "bare '3규칙' (\"3 rules\") is too generic a fragment to match deterministically; the fuller phrase '정본 승격 3규칙' above is the enforced form." },
  { term: "백업", reason: "generic_word_high_noise", detail: "ordinary Korean 'backup'; used constantly for the unrelated general backup/DR concept this glossary itself distinguishes from custody." },
  { term: "backup", reason: "generic_word_high_noise", detail: "same collision as 백업 in English prose." },
  { term: "DR(표시)", reason: "generic_word_moderate_noise", detail: "'DR' is standard disaster-recovery shorthand used throughout for the unrelated general concept." },
  { term: "현재 phase", reason: "generic_phrase_high_noise", detail: "'current phase' is ordinary project-management Korean/English used for workflow phases (P5, C0~C6, ...) far more often than the Canto era." },
  { term: "현 단계(시대를 뜻할 때)", reason: "qualifier_not_literal", detail: "the qualifier ('when meaning the era') cannot be matched deterministically, and the bare phrase collides with the same workflow-phase usage as 현재 phase." },
  { term: "0.1.x(코드명 자리)", reason: "qualifier_and_version_string_collision", detail: "the qualifier is not literal text, and the bare pattern also appears as a literal version-range citation unrelated to the Gram codename slot." },
  { term: "internal RC 이름(보물을 뜻할 때)", reason: "qualifier_and_active_term_collision", detail: "the qualifier is not literal text, and 'internal RC' is itself a live, current technical term (e.g. the Development Team 1 internal RC) unrelated to the Gram treasure name." },
  { term: "Context World Tree", reason: "scoped_rename_not_globally_enforced", detail: "this is an Owner-B/총괄-recommended display rename (2026-09-05), narrower than the other rows: it was applied only to the four named canonical docs (product-family rebaseline, Master Map, plan 00, VISION_AND_GOALS), is reversible by revert of that one commit, and the phrase stays valid prose elsewhere, including this glossary row's own '기존 Context World Tree' citation and docs/reviews/exchange/**. The identifiers (`sf-p05`, `PROJECT_CONTEXT_GRAPH_V0.md`, `context.*` MCP namespace) are unchanged, so a tree-wide enforced gate is not intended the way the other adopted forge names are." },
  { term: "세계수 맥락(기능을 뜻할 때)", reason: "qualifier_not_literal", detail: "the qualifier ('when it means the World-Tree-context feature') cannot be matched deterministically, and bare '세계수 맥락' is not itself an observed literal prose pattern in tracked docs; see 'Context World Tree' above for the enforcement decision on this row." },
]);

const CODE_BLOCK_FENCE_RE = /^\s*(```|~~~)/u;

// Files this policy never scans, regardless of --scope. `docs/reviews/exchange/**` is excluded by
// the caller's file selection (see buildFileFilter), not here, since it is a directory prefix
// rather than a single path.
// SHARED_GLOSSARY_V0.md and the World Bible each carry their own dedicated old-vs-new term
// catalog (the glossary's "옛 표기 → 표시명 대조표"; the World Bible's §4 부품 table and §6 "은퇴하는
// 말" list) whose whole purpose is to name the retired forms for reference. Scanning them would
// flag that cataloging itself, the same way a dictionary is not a violation of its own banned-word
// list.
const EXCLUDED_FILES = Object.freeze(new Set([
  "CHANGELOG.md",
  "docs/architecture/foundation/SHARED_GLOSSARY_V0.md",
  "docs/architecture/foundation/SOULFORGE_WORLD_BIBLE_V0.md",
]));
const EXCLUDED_DIR_PREFIXES = Object.freeze([".workflow/", "ui-workspace/"]);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root ?? defaultRepoRoot);
  const scope = args.scope ?? "changed";
  const includeNested = args["include-nested"] === true;
  const repoTargets = buildRepoTargets(root, includeNested);
  const reports = [];

  for (const repo of repoTargets) {
    reports.push(await scanGitRepo(repo, { scope }));
  }

  const baseline = args.baseline ? await loadBaseline(root, args.baseline) : null;
  const report = buildReport({ scope, repoTargets: reports, baseline });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHuman(report);
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[rawKey] = next;
      index += 1;
      continue;
    }
    args[rawKey] = true;
  }
  return args;
}

function buildRepoTargets(root, includeNested) {
  const repos = [{ id: "soulforge", root }];
  if (includeNested) {
    repos.push(
      { id: "workmeta", root: path.join(root, "_workmeta"), optional: true },
      { id: "private-state", root: path.join(root, "private-state"), optional: true },
    );
  }
  return repos;
}

async function scanGitRepo(repo, { scope }) {
  if (!(await pathExists(repo.root))) {
    return repo.optional
      ? { ...repo, present: false, ok: true, files_scanned: 0, violations: [], skipped: [] }
      : {
          ...repo,
          present: false,
          ok: false,
          files_scanned: 0,
          violations: [],
          skipped: [{ reason: "missing_repo_root", path: repo.root }],
        };
  }

  const inside = runGit(repo.root, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || inside.stdout.trim() !== "true") {
    return repo.optional
      ? { ...repo, present: true, ok: true, files_scanned: 0, violations: [], skipped: [] }
      : {
          ...repo,
          present: true,
          ok: false,
          files_scanned: 0,
          violations: [],
          skipped: [{ reason: "not_git_repo", path: repo.root }],
        };
  }

  const listing = listFilesForScope(repo.root, scope);
  const files = listing.files.filter(isCandidatePath);
  const violations = [];
  const skipped = [];
  let filesScanned = 0;

  for (const failure of listing.failures) {
    skipped.push({ reason: failure });
  }
  const trackedScopeEmpty = scope === "tracked" && !repo.optional && listing.failures.length === 0 && files.length === 0;
  if (trackedScopeEmpty) {
    skipped.push({ reason: "tracked_scope_empty" });
  }

  for (const relativePath of files) {
    const absolutePath = path.join(repo.root, relativePath);
    let entryStats;
    try {
      entryStats = await fs.lstat(absolutePath);
    } catch (error) {
      skipped.push({ path: relativePath, reason: `read_failed:${error.code ?? "unknown"}` });
      continue;
    }

    if (entryStats.isSymbolicLink()) {
      skipped.push({ path: relativePath, reason: "symlink_file" });
      continue;
    }

    let raw;
    try {
      raw = await fs.readFile(absolutePath);
    } catch (error) {
      skipped.push({ path: relativePath, reason: `read_failed:${error.code ?? "unknown"}` });
      continue;
    }

    if (raw.includes(0)) {
      skipped.push({ path: relativePath, reason: "binary_content" });
      continue;
    }

    filesScanned += 1;
    const text = raw.toString("utf8");
    violations.push(...findRetiredDisplayTermViolations(text, relativePath));
  }

  return {
    ...repo,
    present: true,
    ok: violations.length === 0 && listing.failures.length === 0 && !trackedScopeEmpty,
    structural_ok: listing.failures.length === 0 && !trackedScopeEmpty,
    scope,
    files_considered: files.length,
    files_scanned: filesScanned,
    violations,
    skipped,
  };
}

function listFilesForScope(repoRoot, scope) {
  if (scope === "tracked") {
    const tracked = gitList(repoRoot, ["ls-files", "-z"]);
    return { files: tracked.files, failures: tracked.ok ? [] : [`git_list_failed:${tracked.subcommand}`] };
  }

  if (scope === "changed") {
    const lists = [];
    const hasHead = runGit(repoRoot, ["rev-parse", "--verify", "--quiet", "HEAD"]).ok;
    if (hasHead) {
      lists.push(gitList(repoRoot, ["diff", "--name-only", "-z", "--diff-filter=ACMRTUXB", "HEAD", "--"]));
      lists.push(gitList(repoRoot, ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMRTUXB", "--"]));
    }
    lists.push(gitList(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"]));
    return {
      files: uniqueSorted(lists.flatMap((list) => list.files)),
      failures: lists.filter((list) => !list.ok).map((list) => `git_list_failed:${list.subcommand}`),
    };
  }

  throw new Error(`Unsupported scope: ${scope}`);
}

function gitList(repoRoot, args) {
  const result = runGit(repoRoot, args);
  if (!result.ok) {
    return { ok: false, subcommand: args[0], files: [] };
  }
  const files = (result.stdout ?? "")
    .split("\0")
    .map((item) => item.trim())
    .filter(Boolean)
    .sort();
  return { ok: true, subcommand: args[0], files };
}

function runGit(repoRoot, args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

// Target file selection, mirroring the handoff scope: tracked README.md, AGENTS.md,
// docs/architecture/**/*.md, and docs/reviews/*.md at top level only (not docs/reviews/exchange/**,
// which holds raw external-reviewer replies rather than Soulforge's own canon prose).
export function isCandidatePath(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  if (!normalized.toLowerCase().endsWith(".md")) {
    return false;
  }
  if (EXCLUDED_FILES.has(normalized)) {
    return false;
  }
  if (EXCLUDED_DIR_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return false;
  }
  if (normalized === "README.md" || normalized === "AGENTS.md") {
    return true;
  }
  if (normalized.startsWith("docs/architecture/")) {
    return true;
  }
  if (normalized.startsWith("docs/reviews/") && !normalized.startsWith("docs/reviews/exchange/")) {
    return normalized.split("/").length === 3; // docs/reviews/<file>.md only, not deeper
  }
  return false;
}

export function findRetiredDisplayTermViolations(text, file) {
  const violations = [];
  const lines = text.split(/\r?\n/);
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (CODE_BLOCK_FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }

    violations.push(...findLineViolations(line, index + 1, file));
  }

  return violations;
}

function findLineViolations(line, lineNumber, file) {
  const candidates = [];
  for (const entry of RETIRED_TERMS_POLICY_V0) {
    collectTermCandidates({ entry, line, candidates });
  }

  // A shorter retired term can sit entirely inside a longer one that also matched on this line
  // (e.g. "Ops Board" inside "Team Ops Board"). Prefer the longest, leftmost match so each real
  // mention is reported exactly once.
  candidates.sort((a, b) => b.length - a.length || a.start - b.start);
  const claimed = [];
  const accepted = [];
  for (const candidate of candidates) {
    const overlapsClaimed = claimed.some(
      (range) => candidate.start < range.start + range.length && candidate.start + candidate.length > range.start,
    );
    if (overlapsClaimed) {
      continue;
    }
    claimed.push(candidate);
    accepted.push(candidate);
  }
  accepted.sort((a, b) => a.start - b.start);

  return accepted.map((candidate) => ({
    id: "retired_display_term",
    reason: `retired_display_term:${candidate.entry.term}`,
    file,
    line: lineNumber,
    column: candidate.start + 1,
    term: candidate.entry.term,
    display: candidate.entry.display,
    detail: `Use the adopted display name '${candidate.entry.display}' instead of the retired term '${candidate.entry.term}' (docs/architecture/foundation/SHARED_GLOSSARY_V0.md §옛 표기 → 표시명 대조표); keep identifiers, code blocks, backticked spans, paths, link targets, and CHANGELOG history unchanged.`,
  }));
}

function collectTermCandidates({ entry, line, candidates }) {
  const { term } = entry;
  let searchStart = 0;
  while (true) {
    const matchIndex = line.indexOf(term, searchStart);
    if (matchIndex === -1) {
      return;
    }
    searchStart = matchIndex + term.length;

    if (isExcludedMatch({ line, matchIndex, length: term.length, entry })) {
      continue;
    }
    candidates.push({ entry, start: matchIndex, length: term.length });
  }
}

function isExcludedMatch({ line, matchIndex, length, entry }) {
  const skipPrefixes = entry.skip_if_preceded_by
    ? (Array.isArray(entry.skip_if_preceded_by) ? entry.skip_if_preceded_by : [entry.skip_if_preceded_by])
    : [];
  const hasSkippedPrefix = skipPrefixes.some((prefix) => {
    const precedingStart = matchIndex - prefix.length;
    return precedingStart >= 0 && line.slice(precedingStart, matchIndex) === prefix;
  });
  if (hasSkippedPrefix) {
    return true;
  }
  return (
    isInsideBackticks(line, matchIndex) ||
    isSlashAdjacent(line, matchIndex, length) ||
    isInsideMarkdownLinkTarget(line, matchIndex) ||
    isWithinOwnDisplayNameParenthetical(line, matchIndex, entry.display)
  );
}

// The house style writes the adopted display name once with its retired identifier in
// parentheses right after it, e.g. "Ore(원천 자료)", "Vigil(포트 4192)". That citation is the
// correct, intended first-occurrence form (§ AGENTS.md "표시명만 바꾼다" / "첫 등장에 식별자를
// 괄호로 한 번 병기한다"), not a leftover retired-term mention, so a term match that falls inside
// "<display>(...)" for its own display name is excluded.
function isWithinOwnDisplayNameParenthetical(line, matchIndex, display) {
  const marker = `${display}(`;
  let searchFrom = 0;
  while (true) {
    const markerIndex = line.indexOf(marker, searchFrom);
    if (markerIndex === -1) {
      return false;
    }
    searchFrom = markerIndex + marker.length;

    const beforeChar = markerIndex > 0 ? line[markerIndex - 1] : "";
    if (/[A-Za-z0-9_]/.test(beforeChar)) {
      continue; // display name is part of a longer token here, not a real citation
    }
    const openParenIndex = markerIndex + display.length;
    const closeParenIndex = line.indexOf(")", openParenIndex);
    if (closeParenIndex === -1) {
      continue;
    }
    if (matchIndex > openParenIndex && matchIndex < closeParenIndex) {
      return true;
    }
  }
}

// A term is inside backticks when an odd number of backtick characters precede it on the line
// (single-line backtick spans only; the fenced-code-block state is tracked separately above).
function isInsideBackticks(line, matchIndex) {
  let backtickCount = 0;
  for (let index = 0; index < matchIndex; index += 1) {
    if (line[index] === "`") {
      backtickCount += 1;
    }
  }
  return backtickCount % 2 === 1;
}

// A term is a path/URL token, not a display-term mention, only when the WHOLE whitespace-delimited
// token that contains it is itself path-shaped (e.g. `ui-workspace/apps/dev-erp`,
// `guild_hall/watchtower/x.mjs`). A slash or backslash immediately adjacent on just one side is not
// enough by itself: prose enumerations such as "Task Engine/AX", "Watch/4192" or "4192/Bastion" put
// exactly one slash next to a retired term without being a real path. A token counts as path-shaped
// only when it has a file-extension dot, two or more path separators, or any backslash.
function isSlashAdjacent(line, matchIndex, length) {
  const before = matchIndex > 0 ? line[matchIndex - 1] : "";
  const after = matchIndex + length < line.length ? line[matchIndex + length] : "";
  if (before !== "/" && before !== "\\" && after !== "/" && after !== "\\") {
    return false;
  }

  let start = matchIndex;
  while (start > 0 && !/\s/.test(line[start - 1])) {
    start -= 1;
  }
  let end = matchIndex + length;
  while (end < line.length && !/\s/.test(line[end])) {
    end += 1;
  }

  const token = line.slice(start, end);
  const separatorCount = (token.match(/[/\\]/g) ?? []).length;
  return token.includes(".") || token.includes("\\") || separatorCount >= 2;
}

// A term is a link target, not a display-term mention, when it falls inside the "(...)" of a
// markdown link "[label](target)" (e.g. the filename in `[Vigil operations](08_WATCH_4192_OPERATIONS.md)`).
function isInsideMarkdownLinkTarget(line, matchIndex) {
  const linkTargetRe = /\]\(([^)]*)\)/g;
  let match;
  while ((match = linkTargetRe.exec(line)) !== null) {
    const targetStart = match.index + 2; // past "]("
    const targetEnd = targetStart + match[1].length;
    if (matchIndex >= targetStart && matchIndex < targetEnd) {
      return true;
    }
  }
  return false;
}

async function loadBaseline(root, relativePath) {
  const absolutePath = path.resolve(root, relativePath);
  let raw;
  try {
    raw = await fs.readFile(absolutePath, "utf8");
  } catch (error) {
    throw new Error(`Failed to read --baseline file '${relativePath}': ${error.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse --baseline file '${relativePath}' as JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed.files)) {
    throw new Error(`--baseline file '${relativePath}' must have a "files" array`);
  }
  return {
    path: relativePath,
    created_at: parsed.created_at ?? null,
    reason: parsed.reason ?? null,
    files: parsed.files,
  };
}

function buildReport({ scope, repoTargets, baseline }) {
  const violations = repoTargets.flatMap((repo) =>
    repo.violations.map((violation) => ({
      repo: repo.id,
      ...violation,
    })),
  );
  const skipped = repoTargets.flatMap((repo) =>
    repo.skipped.map((item) => ({
      repo: repo.id,
      ...item,
    })),
  );

  let baselineReport = null;
  let unexemptedViolations = violations;
  if (baseline) {
    const baselineFiles = new Set(baseline.files);
    unexemptedViolations = violations.filter((violation) => !baselineFiles.has(violation.file));
    const violatingFiles = new Set(violations.map((violation) => violation.file));
    const staleEntries = baseline.files.filter((file) => !violatingFiles.has(file));
    baselineReport = {
      path: baseline.path,
      created_at: baseline.created_at,
      reason: baseline.reason,
      files_total: baseline.files.length,
      exempted_violations_total: violations.length - unexemptedViolations.length,
      stale_entries: staleEntries,
    };
  }

  const ok = baseline
    ? unexemptedViolations.length === 0 && repoTargets.every((repo) => repo.structural_ok)
    : violations.length === 0 && repoTargets.every((repo) => repo.ok);

  return {
    schema_version: schemaVersion,
    generated_at: new Date().toISOString(),
    ok,
    scope,
    summary: {
      repo_count: repoTargets.length,
      files_considered: sum(repoTargets, "files_considered"),
      files_scanned: sum(repoTargets, "files_scanned"),
      violations_total: violations.length,
      unexempted_violations_total: unexemptedViolations.length,
      skipped_total: skipped.length,
    },
    repos: repoTargets.map((repo) => ({
      id: repo.id,
      root: repo.root,
      present: repo.present,
      ok: repo.ok,
      files_considered: repo.files_considered ?? 0,
      files_scanned: repo.files_scanned ?? 0,
      violations_total: repo.violations.length,
      skipped_total: repo.skipped.length,
    })),
    violations,
    unexempted_violations: baseline ? unexemptedViolations : null,
    baseline: baselineReport,
    skipped,
  };
}

function printHuman(report) {
  const lines = [
    "Soulforge Retired Display Terms Policy",
    `ok: ${report.ok ? "yes" : "no"}`,
    `scope: ${report.scope}`,
    `repos: ${report.summary.repo_count}`,
    `files considered: ${report.summary.files_considered}`,
    `files scanned: ${report.summary.files_scanned}`,
    `violations: ${report.summary.violations_total}`,
  ];

  if (report.baseline) {
    lines.push(
      `baseline: ${report.baseline.path} (${report.baseline.files_total} files, ` +
        `${report.baseline.exempted_violations_total} exempted, ` +
        `${report.summary.unexempted_violations_total} unexempted)`,
    );
  }

  const violationsToShow = report.baseline ? report.unexempted_violations : report.violations;
  if (violationsToShow.length > 0) {
    lines.push("");
    lines.push(report.baseline ? "Unexempted violations:" : "Violations:");
    for (const violation of violationsToShow.slice(0, 200)) {
      lines.push(`- ${violation.repo}:${violation.file}:${violation.line}:${violation.column} '${violation.term}' -> ${violation.display}`);
    }
    if (violationsToShow.length > 200) {
      lines.push(`- ... ${violationsToShow.length - 200} more`);
    }
  }

  if (report.baseline && report.baseline.stale_entries.length > 0) {
    lines.push("");
    lines.push("Warning: no current violation in these baselined files; remove them from the baseline:");
    for (const file of report.baseline.stale_entries) {
      lines.push(`- ${file}`);
    }
  }

  if (report.skipped.length > 0) {
    lines.push("");
    lines.push(`Skipped: ${report.skipped.length} files; use --json for details.`);
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

function sum(reports, key) {
  return reports.reduce((total, report) => total + (report[key] ?? 0), 0);
}

function uniqueSorted(items) {
  return [...new Set(items)].sort();
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exit(1);
  });
}
