// The common-folder (org-wide, "P00-000_공통") classification order (spec section 1 of
// `18_WORKSPACE_LEDGERS_PORT_SPEC_2026-09-21.md`) and the primary-bucket resolution
// (spec section 3). Pure functions only -- no filesystem access; `common_refresh.mjs`
// owns reading custody/owner-tables and writing ledgers.
//
// Every organisation-specific pattern (system-sender domains/subjects, ad domains,
// agency-notice domains, internal-admin/out-of-project/code-pending subject patterns,
// the common/general-work folder names) comes from the caller's org config via
// `buildCommonConfig` -- never hardcoded here, so this module ships no real org data
// (see `examples/org_config.example.json`'s `common_ledgers` block).
import { assertSubjectOnlyFields, classifyMail, compileTerm, DEFAULT_MATCH_FIELDS, RuleCompileError } from './classifier.mjs';
import { domainOf, normalizeSubject, seoulDateOf } from './ledgers.mjs';
import { isSafeFileName } from './common_ledgers.mjs';
import { systemSenderPatternsFromConfig } from './mail_events.mjs';

// Suffix `common_refresh.mjs`'s thread-vendor inheritance (spec section 2, S4) appends
// to `projectResult.basis` when a mail's vendor list came from another mail in the
// same thread rather than its own from/to/cc address. Shared here so
// `resolvePrimaryBucket` can tell an inherited match from a direct one (S4, fresh
// non-author review, 2026-09-21) without the two modules' text drifting apart.
export const THREAD_VENDOR_INHERITANCE_MARKER = '(같은 대화의 거래처)';

/**
 * `basis` with that suffix taken off, so a caller comparing against a basis VALUE
 * (`제목`, `묶음 확정`, ...) compares the classification itself rather than whether
 * this mail happened to inherit its vendor from a thread-mate.
 *
 * N3 (fresh review, 2026-09-22): `common_refresh.mjs`'s own
 * `common_search_eligible_attributions` compared `basis` literally and therefore
 * MISSED an approved subject-rule or bundle-table hit on any mail whose vendors were
 * inherited -- the marker made `'제목'` read as `'제목(같은 대화의 거래처)'`. Vendor
 * inheritance says nothing about how the project was decided, so it must not change
 * whether that decision counts as evidence. Exported rather than inlined because two
 * readers now need it, and a second copy is the drift this file already exists to
 * prevent.
 */
export function baseBasisOf(basis) {
  const text = String(basis ?? '');
  return text.endsWith(THREAD_VENDOR_INHERITANCE_MARKER)
    ? text.slice(0, -THREAD_VENDOR_INHERITANCE_MARKER.length)
    : text;
}

export const PRIMARY_BUCKETS = Object.freeze([
  'project', 'held', 'system', 'ads', 'internal_admin', 'external_notice', 'out_of_project',
  'code_pending', 'no_code_confirmed', 'general_work', 'vendor_only', 'organisation_undecided', 'unclassified',
]);

// A vendor/organisation address never decides a project by itself (spec section 1
// step 4) -- it only says which vendor ledger the mail belongs to. It may confirm a
// project from the mail BODY only for a supplier-type organisation (a customer,
// government agency or school commonly runs several projects with us at once, so their
// address being on a mail says nothing about which one).
const SUPPLIER_KIND_EXCLUDE = /고객사|기관|학교/u;

/** Every domain and full address a mail's from/to/cc carry, lowercased -- used to look up vendors. */
export function addressesOfMail({ from, to = [], cc = [] }) {
  const people = [from, ...to, ...cc].filter(Boolean);
  const out = new Set();
  for (const person of people) {
    const email = String(person.email ?? '').toLowerCase();
    if (!email.includes('@')) continue;
    out.add(email);
    out.add(domainOf(email));
  }
  return [...out];
}

/**
 * Every bare `{email}` address (not domain) a mail's from/to/cc carry, lowercased.
 * Used by thread-vendor inheritance's shared-participant check (S4). Distinct from
 * `addressesOfMail`, which also yields bare domains -- useful for vendor lookup, but
 * not for answering "did these two mails share a person".
 */
export function participantEmailsOf({ from, to = [], cc = [] }) {
  const people = [from, ...to, ...cc].filter(Boolean);
  const out = new Set();
  for (const person of people) {
    const email = String(person.email ?? '').toLowerCase();
    if (email.includes('@')) out.add(email);
  }
  return out;
}

/** `[{key, name, kind, memo}, ...]`, deduped by vendor name -- a mail may match more than one vendor (spec: 한 메일에 여러 거래처가 걸리면 각 거래처 장부에 다 넣는다). */
export function vendorsOfAddresses(addresses, vendorLookup) {
  const found = new Map();
  for (const address of addresses) {
    const hit = vendorLookup.get(address);
    if (hit && !found.has(hit.name)) found.set(hit.name, hit);
  }
  return [...found.values()];
}

/** Tags from `작업태그_목록.csv` whose `[태그]` literally appears in the subject (spec: 과제를 정하지 않는다). */
export function workTagsOf(subject, workTags) {
  const lower = String(subject ?? '').toLowerCase();
  return workTags.filter(tag => lower.includes(`[${tag.toLowerCase()}]`));
}

/**
 * Steps 2-3 of the classification order (spec section 1): the Owner-confirmed
 * conversation-bundle table, then the reading-decision table. Factored out of
 * `classifyProjectHits` (A1, 2026-09-21 night addition) so `refresh.mjs`'s own
 * per-project ledger attribution can reuse the exact same bundle/reading logic --
 * "한 곳에서만 정한다" (spec section 1's own header) -- instead of a second,
 * potentially-drifting copy. `refresh.mjs` only ever calls this for an event
 * `classifyProjectHits`'s OWN step 1 (subject-only, full stop -- K1) already left
 * with zero hits and no hold -- so a bundle/reading decision can never override a
 * subject-rule attribution or a two-project hold either way (spec A1: "판독 결정이
 * 제목 규칙을 뒤집지 못한다").
 *
 * `at` (A2 item 1, optional) is the mail's own normalised receipt instant -- compared,
 * as a Seoul calendar date, against a matching bundle row's `적용끝` (if any): a mail
 * received AFTER that date does not get that bundle's confirmation (Owner: the same
 * title phrase/vendor may cover unrelated future work; a bundle is one episode's
 * mail set, not a standing rule). A row with no `적용끝` (`appliesUntil: null` --
 * either the column was blank or the table is the legacy 4-column shape) applies
 * indefinitely, unchanged. `at` omitted/unparseable and a row that DOES carry
 * `적용끝` never excludes the mail on that basis alone (permissive default -- an
 * unknown receipt date is not evidence the mail arrived after the cutoff).
 *
 * Always returns an object, never bare `null` -- `decided: false` (with `hits: []`,
 * `basis: null`, `reading: null`) when neither table decided anything (no matching
 * bundle row usable, and no reading-table row at all for `id`); the caller proceeds
 * to its own next step (`classifyProjectHits`'s step 4; `refresh.mjs` treats
 * `decided: false` the same as "still unattributed"). `unknownBundleTarget` can be
 * `true` even when `decided` is `false` (a bundle phrase matched but every match named
 * an unknown code, and there was no reading-table row either) -- always read off this
 * return, never assumed `false` just because nothing was decided.
 */
export function classifyByOwnerTables({ id, subject, at = null }, { bundles, readings, knownCode }) {
  let unknownBundleTarget = false;
  const normalized = normalizeSubject(subject);
  const receiptDate = at ? seoulDateOf(at) : null;
  // NIT 13 (fresh non-author review, 2026-09-21): `.find()` used to stop at the FIRST
  // phrase match regardless of whether it was usable -- an earlier row naming an
  // unknown code shadowed a later, genuinely valid row sharing (or containing) the
  // same phrase, which never even got looked at. Every matching, still-in-effect row
  // is considered; the first one with ALL known codes wins, and only when NONE of the
  // matches was usable is this counted as an unknown bundle target.
  const matchingBundles = bundles.filter(entry => {
    if (!normalized.includes(entry.phrase)) return false;
    // A2 item 1: a row past its own 적용끝 never matches at all -- not even as an
    // "unknown target" candidate -- for a mail received after that date.
    if (entry.appliesUntil && receiptDate && receiptDate > entry.appliesUntil) return false;
    return true;
  });
  const validBundle = matchingBundles.find(entry => entry.codes.every(knownCode));
  if (validBundle) {
    const label = `묶음 확정: ${validBundle.why}${validBundle.codes.length > 1 ? ` (공유 ${validBundle.codes.join(';')})` : ''}`;
    return { decided: true, hits: validBundle.codes.map(code => ({ project_code: code, label })), basis: '묶음 확정',
      unknownBundleTarget, unknownReadingTarget: false, reading: null };
  }
  if (matchingBundles.length > 0) unknownBundleTarget = true;

  // Step 3: reading-decision table (판독_결정표.csv), keyed by mail source id.
  const reading = readings.get(id) ?? null;
  if (reading) {
    const readingCodes = String(reading.target ?? '').split(';').map(code => code.trim()).filter(Boolean);
    if (reading.level === 'include' || reading.level === 'include_with_review') {
      if (readingCodes.length > 0 && readingCodes.every(knownCode)) {
        const reviewSuffix = reading.level === 'include_with_review' ? '(검토 필요)' : '';
        const shareSuffix = readingCodes.length > 1 ? `(공유 ${readingCodes.join(';')})` : '';
        const label = `판독${reviewSuffix}${shareSuffix}: ${reading.why}`;
        return { decided: true, hits: readingCodes.map(code => ({ project_code: code, label })),
          basis: reading.level === 'include' ? '판독' : '판독(검토 필요)', unknownBundleTarget, unknownReadingTarget: false, reading };
      }
      // S1: an include/include_with_review row naming an unknown (or empty) code
      // falls through to the generic reading branch below (basis "판독: 보류") --
      // now explicitly counted as an unknown reading target rather than silently
      // degrading to the same shape a genuine hold_owner_review row has.
      return { decided: true, hits: [], basis: '판독: 보류', unknownBundleTarget, unknownReadingTarget: true, reading };
    }
    if (reading.level === 'vendor_only') {
      return { decided: true, hits: [], basis: '판독: 거래처만', unknownBundleTarget, unknownReadingTarget: false, reading };
    }
    return { decided: true, hits: [], basis: reading.level === 'exclude' ? '판독: 과제 아님' : '판독: 보류',
      unknownBundleTarget, unknownReadingTarget: false, reading };
  }

  return { decided: false, hits: [], basis: null, unknownBundleTarget, unknownReadingTarget: false, reading: null };
}

/**
 * The five-step classification order (spec section 1, items 1-5), mirroring the
 * behavioural reference's `classify()`. `compiledRules` is every onboarded project's
 * rule, compiled via `classifier.mjs`'s `compileRule` (reused here rather than
 * reimplemented, so title/body matching gets the same term-safety and yields_to
 * handling the per-project pipeline already has). Returns `{ hits: [{project_code,
 * label}], held, basis, vendors, candidates, reading, unknownBundleTarget,
 * unknownReadingTarget }`.
 *
 * S1 (fresh non-author review, 2026-09-21): a 묶음_확정표 row naming ANY unknown
 * project code no longer attributes the KNOWN subset silently -- the whole row is
 * treated as not matching (falls through to step 3), and `unknownBundleTarget: true`
 * is set on the return so the caller can count it (`common_refresh.mjs`'s
 * `unknown_targets.bundle`). Likewise `unknownReadingTarget: true` marks an
 * `include`/`include_with_review` reading row naming an unknown code (it already fell
 * through to the generic "판독: 보류"-shaped branch below before this fix; now that
 * fall-through is also counted, not just silently absorbed).
 *
 * D-a (coordinator, fresh review round 2): this is THE one function that runs the
 * whole classification order 1-5 for a mail -- `refresh()`'s own project-ledger
 * attribution calls it directly now (no separate, narrower step-1-only classifier of
 * its own any more), so no path can run step 1 with different inputs.
 *
 * K1 (coordinator, fresh review round 3 -- settles round 2's D-b/R1): `fields` is
 * accepted only for backward compatibility and must be exactly `DEFAULT_MATCH_FIELDS`
 * (`['subject']`, checked by VALUE via `classifier.mjs`'s `assertSubjectOnlyFields`)
 * -- any other value throws `workspace_ledgers_fields_not_supported` immediately.
 * Step 1 matches the SUBJECT ONLY, full stop; this param does not, and never again
 * will, widen or narrow that. A rule's own `match_fields` stays schema-valid but is
 * NOT consulted for ledger placement (see `classifier.mjs`'s own doc on
 * `DEFAULT_MATCH_FIELDS`). Step 4 (body) is unaffected either way -- it is always
 * tested against `body_text` alone, per its own narrower (vendor-gated) contract.
 */
// SHOULD (coordinator, fresh review round 5): the exact `basis` string this function
// sets ONLY for a genuine step-1 title-rule hit (never a bundle/reading/body
// attribution) -- exported so every caller that needs to tell "this hit came from the
// rule's own subject terms" apart from a table/step-4 attribution compares against
// ONE named constant instead of re-typing the literal `'제목'` in each file (the
// fragility a fresh reviewer named: a typo or a future rename of this string would
// silently desync any comparison still spelling it out by hand).
export const STEP1_TITLE_BASIS = '제목';

export function classifyProjectHits({ id, subject, body, addresses, at = null }, { compiledRules, bundles, readings, vendorLookup, fields = DEFAULT_MATCH_FIELDS }) {
  assertSubjectOnlyFields(fields);
  const vendors = vendorsOfAddresses(addresses, vendorLookup);
  const bodyOk = vendors.some(vendor => !SUPPLIER_KIND_EXCLUDE.test(vendor.kind));
  const knownCode = code => compiledRules.some(rule => rule.project_code === code);

  // Step 1: the project's own title rule. Two projects' exact triggers on the same
  // subject means held -- never automatic attribution.
  const titleResult = classifyMail({ subject, body_text: '', attachment_names: [] }, compiledRules, { fields });
  if (titleResult.hits.length === 1) {
    return { hits: titleResult.hits, held: false, basis: STEP1_TITLE_BASIS, vendors, candidates: [], unknownBundleTarget: false, unknownReadingTarget: false };
  }
  if (titleResult.hits.length > 1) {
    return { hits: [], held: true, basis: '제목(두 과제 겹침)', vendors, candidates: titleResult.hits.map(hit => hit.project_code),
      unknownBundleTarget: false, unknownReadingTarget: false };
  }

  // Steps 2-3: Owner-confirmed conversation bundle table, then the reading-decision
  // table -- shared with `refresh.mjs` via `classifyByOwnerTables` above.
  const tableResult = classifyByOwnerTables({ id, subject, at }, { bundles, readings, knownCode });
  if (tableResult.decided) {
    return {
      hits: tableResult.hits, held: false, basis: tableResult.basis, vendors, candidates: [],
      unknownBundleTarget: tableResult.unknownBundleTarget, unknownReadingTarget: tableResult.unknownReadingTarget,
      ...(tableResult.reading ? { reading: tableResult.reading } : {}),
    };
  }
  // NIT 13/S1 (unchanged behaviour, just no longer silently dropped by the extraction
  // above): a matched-but-unknown bundle phrase still needs to be counted even though
  // classification itself falls all the way through to steps 4-5.
  const unknownBundleTarget = tableResult.unknownBundleTarget;

  // Step 4: supplier-only body confirmation -- only when exactly one project's exact
  // term appears in the body text, and only for a supplier-type vendor (never a
  // customer/agency/school -- `bodyOk`).
  if (bodyOk && body) {
    const bodyResult = classifyMail({ subject: '', body_text: body, attachment_names: [] }, compiledRules, { fields: ['body_text'] });
    if (bodyResult.hits.length === 1) {
      const hit = bodyResult.hits[0];
      return { hits: [{ project_code: hit.project_code, label: `본문: ${hit.label}` }], held: false, basis: '본문', vendors, candidates: [],
        unknownBundleTarget, unknownReadingTarget: false };
    }
    if (bodyResult.hits.length > 1) {
      return { hits: [], held: false, basis: '미정(본문에 여러 과제)', vendors, candidates: bodyResult.hits.map(hit => hit.project_code),
        unknownBundleTarget, unknownReadingTarget: false };
    }
  }

  // Step 5: undetermined.
  return { hits: [], held: false, basis: '미정', vendors, candidates: [], unknownBundleTarget, unknownReadingTarget: false };
}

// ------------------------------------------------------------- common-config loading
export class OrgConfigPatternError extends Error {
  constructor(configKey, innerCode) {
    super(`workspace_ledgers_org_config_pattern_invalid: ${configKey}`);
    this.name = 'OrgConfigPatternError';
    this.code = 'workspace_ledgers_org_config_pattern_invalid';
    // The offending CONFIG KEY (e.g. "common_ledgers.ads_subject_patterns[2]"), never
    // the pattern text itself -- S7's whole point is that a bad org-config regex must
    // never surface its own source in an error a receipt or log could carry.
    this.configKey = configKey;
    this.innerCode = innerCode;
  }
}

/**
 * Required-review item 1 (fresh non-author review, 2026-09-21): `common_folder_name`/
 * `general_work_folder_name` used to be `path.join`ed straight into every ledger's
 * base directory with NO validation -- `resolveSafePath` (R2) then only ever checked
 * the FILE name against a base that had ALREADY escaped
 * (`common_folder_name: "../../escaped"` wrote outside both `workspacesRoot` and
 * `workmetaRoot` while the receipt still said `written: true`). Thrown by
 * `buildCommonConfig` the moment either folder name fails the exact same
 * `isSafeFileName` segment-safety rules a ledger file name gets (R2) -- naming only
 * the config key, never the value, and failing the WHOLE run before any classification
 * or write happens (a config-load failure, same as `OrgConfigPatternError`, is not a
 * per-mail/per-table situation this module can isolate).
 */
export class OrgConfigValueError extends Error {
  constructor(configKey, reasonCode) {
    super(`workspace_ledgers_org_config_value_invalid: ${configKey}`);
    this.name = 'OrgConfigValueError';
    this.code = 'workspace_ledgers_org_config_value_invalid';
    this.configKey = configKey;
    this.reasonCode = reasonCode;
  }
}

function requireSafeFolderName(name, configKey) {
  if (!isSafeFileName(name)) throw new OrgConfigValueError(configKey, 'workspace_ledgers_org_config_folder_name_unsafe');
  return name;
}

/**
 * S7 (fresh non-author review, 2026-09-21): an org-config pattern used to be compiled
 * with a bare `new RegExp(pattern, 'iu')` -- no length/complexity bound, no nested-
 * quantifier/backreference/lookbehind/alternation-count check, and no ReDoS timing
 * canary, unlike every rule term this codebase otherwise compiles
 * (`classifier.mjs`'s `compileTerm`). These patterns are private/Owner-authored, not
 * untrusted mail content, but they still run against every mail on every classification
 * pass -- the same class of risk `compileTerm`'s draft-time canary exists to catch
 * before a bad pattern is ever saved. Reusing `compileTerm` here (as a `kind: 'regex'`
 * term, flags always `'iu'`, `timeSafety: true` so the canary runs once at config load)
 * gets the exact same defences for free, and returns an object whose `.test(text)`
 * this module's callers already only ever use. `configKey` identifies WHICH org-config
 * entry failed (for `OrgConfigPatternError`) -- never the pattern text.
 */
function compileSafePattern(pattern, configKey) {
  try {
    return compileTerm({ label: configKey, kind: 'regex', value: pattern, flags: 'iu' }, { timeSafety: true });
  } catch (error) {
    throw new OrgConfigPatternError(configKey, error instanceof RuleCompileError ? error.code : undefined);
  }
}

function compilePatternList(list, configKeyPrefix) {
  return (Array.isArray(list) ? list : [])
    .map((entry, index) => ({ pattern: typeof entry === 'string' ? entry : entry?.pattern, index }))
    .filter(({ pattern }) => typeof pattern === 'string' && pattern.trim() !== '')
    .map(({ pattern, index }) => compileSafePattern(pattern, `${configKeyPrefix}[${index}]`));
}
function compileLabeledPatternList(list, configKeyPrefix) {
  return (Array.isArray(list) ? list : [])
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry && typeof entry.pattern === 'string' && typeof entry.label === 'string')
    .map(({ entry, index }) => ({ label: entry.label, re: compileSafePattern(entry.pattern, `${configKeyPrefix}[${index}]`) }));
}
function lowerSet(list) { return new Set((Array.isArray(list) ? list : []).map(value => String(value).toLowerCase())); }

/**
 * D-d (coordinator, fresh review round 2): the ONE merged system-sender check, built
 * from BOTH existing org-config keys -- `common_ledgers.system_notification_sources`
 * (named/labelled sources, each with its own sender-domain set and subject patterns --
 * what `resolvePrimaryBucket` already consulted) and the legacy top-level
 * `system_sender_domains` (a flat domain array -- previously consulted ONLY by
 * `refresh()`'s own custody pre-filter via `mail_events.mjs`'s
 * `systemSenderPatternsFromConfig`, never by the common pipeline at all). Both keys
 * are still accepted, for compatibility with whichever an org config already uses;
 * this is the one place that reads either of them for "is this a system sender".
 *
 * A match against a NAMED source keeps that source's own name (its own
 * `시스템알림_<name>.csv` bucket, unchanged). A match against the legacy list alone
 * (no specific named source) routes to the generic `기타알림` bucket -- the same file
 * name `resolveReadingDecision`'s manual `알림` exclude target already uses, so a
 * legacy-only match and an Owner's explicit "이건 그냥 알림이다" decision land in the
 * same ledger.
 */
export function buildSystemSenderConfig(orgConfig) {
  const config = orgConfig?.common_ledgers ?? {};
  const systemSources = (Array.isArray(config.system_notification_sources) ? config.system_notification_sources : [])
    .filter(source => source && typeof source.name === 'string' && source.name.trim() !== '')
    .map((source, index) => ({
      name: source.name, senderDomains: lowerSet(source.sender_domains),
      subjectPatterns: compilePatternList(source.subject_patterns, `common_ledgers.system_notification_sources[${index}].subject_patterns`),
    }));
  return { systemSources, legacyPatterns: systemSenderPatternsFromConfig(orgConfig) };
}

/**
 * The system-notification source name a mail belongs to (a configured source's own
 * name, or the generic `기타알림` for a legacy-domain-only match), or `null` when
 * neither list matches. `mail` needs `{ fromDomain, from: { email }, subject }`.
 *
 * D-d: this is the single detection point both `resolvePrimaryBucket` (via
 * `detectSystemSource`, below) and `refresh()`'s own post-classification system-sender
 * accounting call identically -- a mail one path would have judged "system" is system
 * for the other too. Deliberately never called BEFORE the one classification function
 * (`classifyProjectHits`) has run for a mail -- see that function's own D-a/D-b note,
 * and `refresh.mjs`'s classification loop -- so an explicit reading/bundle decision on
 * a system-sender mail (steps 1-3) is never pre-empted by this check.
 */
export function detectSystemSender(mail, systemSenderConfig) {
  for (const source of systemSenderConfig.systemSources) {
    if (source.senderDomains.has(mail.fromDomain)) return source.name;
    if (source.subjectPatterns.some(term => term.test(mail.subject))) return source.name;
  }
  const fromEmail = mail.from?.email ?? '';
  if (systemSenderConfig.legacyPatterns.some(pattern => pattern.test(fromEmail))) return '기타알림';
  return null;
}

/**
 * Precompiles `orgConfig.common_ledgers` (spec section 3's last bullet: every
 * org-specific pattern/folder-name lives in the private org config, never hardcoded
 * here) into ready-to-use lookups. Every field has a safe, inert default (empty
 * list/set) so an org config that omits `common_ledgers` entirely still classifies --
 * it simply never matches any org-specific bucket, everything falls through toward
 * 미분류 -- rather than throwing. The one exception (S7): a pattern that fails the
 * same static-shape/ReDoS-canary checks a rule term would throws `OrgConfigPatternError`
 * immediately, naming only the config key -- the caller (`common_refresh.mjs`) must
 * fail the whole run closed before any write rather than silently skip that one
 * pattern, since a config-load failure is not a per-mail, per-table situation this
 * module can isolate the way it isolates one bad rule or one bad Owner table.
 */
export function buildCommonConfig(orgConfig) {
  const config = orgConfig?.common_ledgers ?? {};
  const commonFolderName = typeof config.common_folder_name === 'string' && config.common_folder_name ? config.common_folder_name : 'P00-000_공통';
  const generalWorkFolderName = typeof config.general_work_folder_name === 'string' && config.general_work_folder_name
    ? config.general_work_folder_name : 'general_work_일반업무';
  requireSafeFolderName(commonFolderName, 'common_ledgers.common_folder_name');
  requireSafeFolderName(generalWorkFolderName, 'common_ledgers.general_work_folder_name');
  // D-d: the merged system-sender check (named sources + legacy domain list) is built
  // once here via `buildSystemSenderConfig` -- see that function's own doc -- and
  // folded into this return so every existing reader of `commonConfig.systemSources`
  // (this function's own long-standing field) is unaffected; `legacySystemSenderPatterns`
  // is new.
  const systemSenderConfig = buildSystemSenderConfig(orgConfig);
  return {
    commonFolderName, generalWorkFolderName,
    knowledgeFolderNames: lowerSet(config.knowledge_folder_names),
    systemSources: systemSenderConfig.systemSources,
    legacySystemSenderPatterns: systemSenderConfig.legacyPatterns,
    adsSenderDomains: lowerSet(config.ads_sender_domains),
    adsSenderKeywords: [...lowerSet(config.ads_sender_keywords)],
    adsSubjectPatterns: compilePatternList(config.ads_subject_patterns, 'common_ledgers.ads_subject_patterns'),
    agencyNoticeSenderDomains: lowerSet(config.agency_notice_sender_domains),
    internalAdminPatterns: compileLabeledPatternList(config.internal_admin_subject_patterns, 'common_ledgers.internal_admin_subject_patterns'),
    outOfProjectPatterns: compileLabeledPatternList(config.out_of_project_subject_patterns, 'common_ledgers.out_of_project_subject_patterns'),
    codePendingPatterns: compileLabeledPatternList(config.code_pending_subject_patterns, 'common_ledgers.code_pending_subject_patterns'),
  };
}

function firstLabelMatch(patterns, subject) {
  const found = patterns.find(entry => entry.re.test(subject));
  return found ? found.label : null;
}

/**
 * The system-notification source name a mail belongs to, or `null`. A thin wrapper
 * over `detectSystemSender` using `commonConfig`'s own already-built
 * `systemSources`/`legacySystemSenderPatterns` -- kept as its own named export
 * (`resolvePrimaryBucket` and this module's own tests already call it this way) so
 * `buildCommonConfig`'s existing shape does not need to change at every call site.
 */
export function detectSystemSource(mail, commonConfig) {
  return detectSystemSender(mail, { systemSources: commonConfig.systemSources, legacyPatterns: commonConfig.legacySystemSenderPatterns });
}

function isAds(mail, commonConfig) {
  if (commonConfig.adsSenderDomains.has(mail.fromDomain)) return true;
  // `mail.from` is a `{name, email}` record (or null), never a bare string -- match
  // against the address text, not the object itself (an earlier draft of this
  // function called `.includes` on the object directly, which throws as soon as any
  // `ads_sender_keywords` entry is configured; no test caught it because the fixture
  // used in this module's own tests never set that field).
  const fromAddress = String(mail.from?.email ?? '').toLowerCase();
  if (commonConfig.adsSenderKeywords.some(keyword => fromAddress.includes(keyword))) return true;
  if (commonConfig.adsSubjectPatterns.some(term => term.test(mail.subject))) return true;
  return false;
}

/**
 * The bucket a mail's reading decision alone routes to, or `null` when the decision
 * exists but does not (yet) route anywhere -- `vendor_only` with no matched
 * organisation (S3: handled by the caller as `vendor_only_without_organisation`, not
 * silently dropped here), or an `exclude` row whose target matches none of the known
 * routing prefixes. Only ever called for a reading whose `level` is not
 * `hold_owner_review` (S2: a `hold_owner_review` decision is, by definition, not a
 * routing decision at all -- it explicitly asks for the ordinary pattern-based cascade,
 * same as no decision).
 */
function resolveReadingDecision(reading, vendors) {
  if (reading.level === 'vendor_only') {
    if (vendors.length === 0) return null;
    return { bucket: 'vendor_only', detail: reading.target || null, fileName: null };
  }
  if (reading.level === 'exclude') {
    const target = String(reading.target ?? '').trim();
    if (target === '광고') return { bucket: 'ads', detail: null, fileName: null };
    if (target === '알림') return { bucket: 'system', detail: '기타알림', fileName: '시스템알림_기타알림.csv' };
    if (target === '테스트') return { bucket: 'system', detail: '자체시스템·테스트', fileName: '시스템알림_자체시스템·테스트.csv' };
    if (target === '일반업무' || target.startsWith('일반업무:')) {
      return { bucket: 'general_work', detail: target.includes(':') ? target.slice(target.indexOf(':') + 1) : '단발 지원', fileName: '일반업무_메일.csv' };
    }
    // A2 item 2 (2026-09-21 night addition, rename): this bucket now means "read, but
    // which project is still unknown" (과제미정 / 판독_과제미정.csv), not "confirmed
    // there is no project at all" -- that confirmed case is expressed with an
    // 일반업무/과제외:... target instead (see those branches below), not this one.
    // The OLD target token `과제없음` is still read the same (new) way -- a row
    // already written under the old name keeps working; a new decision may use either
    // token, both land here.
    if (target === '과제없음' || target === '과제미정') return { bucket: 'no_code_confirmed', detail: reading.why, fileName: '판독_과제미정.csv' };
    if (target === '사내행정') return { bucket: 'internal_admin', detail: `판독: ${reading.why}`, fileName: '사내행정.csv' };
    if (target.startsWith('과제코드대기:')) return { bucket: 'code_pending', detail: target.slice('과제코드대기:'.length), fileName: '과제코드대기.csv' };
    if (target.startsWith('과제외:')) {
      const label = target.slice('과제외:'.length);
      return { bucket: 'out_of_project', detail: label, fileName: `과제외_${label}.csv` };
    }
    return null; // unroutable target -- falls through to the ordinary cascade
  }
  return null; // include/include_with_review with an unknown code (basis "판독: 보류") -- not a routing decision
}

/**
 * Resolves ONE primary bucket for a mail that did not resolve to a project (spec
 * section 3: "각 메일은 아래 주 분류 하나에만 들어간다"). `projectResult` is
 * `classifyProjectHits`'s return; call this only when `!projectResult.hits.length &&
 * !projectResult.held` -- the caller (`common_refresh.mjs`) handles `project`/`held`
 * itself, since those two buckets are effectively "no common-folder row" (a project
 * hit belongs to that project's own ledgers; held is echoed into `보류.csv` -- see
 * `common_refresh.mjs`). Returns `{ bucket, detail, fileName, decisionOverrodePattern?
 * }`; `detail` is the sub-category label, used both for the file name and the row's
 * own 세부분류/분류 cell.
 *
 * S2 (fresh non-author review, 2026-09-21): an explicit reading decision -- any level
 * except `hold_owner_review`, which is explicitly "no decision yet" -- wins over the
 * system-source/ads PATTERN buckets, not the other way around. Before this fix,
 * `detectSystemSource`/`isAds` were checked first, so a mail the Owner had already
 * explicitly decided (e.g. `vendor_only`, or `exclude:과제외:...`) could still be
 * silently reclassified as `system`/`ads` if it also happened to come from a
 * pattern-matched domain or subject -- overriding a human decision with a general
 * heuristic. `decisionOverrodePattern` (on the returned outcome) is `true` when a
 * reading decision won AND a pattern bucket would otherwise have applied, so the
 * caller can count it (`common_refresh.mjs`'s `decision_overrode_pattern`).
 */
export function resolvePrimaryBucket(mail, projectResult, commonConfig, { ourDomain }) {
  const systemSource = detectSystemSource(mail, commonConfig);
  const adsMatch = !systemSource && isAds(mail, commonConfig);
  const patternBucket = systemSource ? { bucket: 'system', detail: systemSource, fileName: `시스템알림_${systemSource}.csv` }
    : (adsMatch ? { bucket: 'ads', detail: null, fileName: null } : null);

  if (projectResult.reading && projectResult.reading.level !== 'hold_owner_review') {
    const decided = resolveReadingDecision(projectResult.reading, projectResult.vendors);
    if (decided) {
      if (patternBucket) decided.decisionOverrodePattern = true;
      return decided;
    }
    // The decision exists but did not route anywhere (vendor_only w/o a matched
    // organisation, or an unroutable exclude target) -- falls through to the
    // ordinary pattern-based cascade below, same as having no decision at all.
  }

  // S8 (fresh non-author review, 2026-09-21): whenever ANY reading decision exists on
  // this mail at all (including `hold_owner_review`) -- whether it routed above,
  // failed to route, or is explicitly still pending -- it must never fall into `ads`
  // from here. `ads` has no file and no other artifact; a mail someone already tried
  // to decide disappearing entirely because it also happens to match an ads pattern
  // is worse than a mail with no decision at all disappearing the same way. System-
  // source detection is unaffected (an objective fact about the mail's sender,
  // independent of any decision) and the rest of the cascade still applies, ultimately
  // reaching `unclassified` (flagged by `triage.mjs`'s `already_decided_invalid` when
  // there was a genuine unrouted decision) if nothing else matches.
  if (patternBucket && !(projectResult.reading && patternBucket.bucket === 'ads')) return patternBucket;

  const pendingLabel = firstLabelMatch(commonConfig.codePendingPatterns, mail.subject);
  if (pendingLabel) return { bucket: 'code_pending', detail: pendingLabel, fileName: '과제코드대기.csv' };

  const outOfProjectLabel = firstLabelMatch(commonConfig.outOfProjectPatterns, mail.subject);
  if (outOfProjectLabel) return { bucket: 'out_of_project', detail: outOfProjectLabel, fileName: `과제외_${outOfProjectLabel}.csv` };

  const isOwnDomain = mail.fromDomain === ourDomain;
  const adminLabel = firstLabelMatch(commonConfig.internalAdminPatterns, mail.subject);
  if (adminLabel && isOwnDomain) return { bucket: 'internal_admin', detail: adminLabel, fileName: '사내행정.csv' };
  if (adminLabel) return { bucket: 'external_notice', detail: adminLabel, fileName: '외부안내.csv' };

  if (commonConfig.agencyNoticeSenderDomains.has(mail.fromDomain)) {
    return { bucket: 'external_notice', detail: '기관 안내', fileName: '외부안내.csv' };
  }

  // Coordinator correction (2026-09-21, after the first Step 1 commit): a mail that
  // touches a KNOWN organisation (a vendor/customer/agency/school address matched
  // against 거래처_대응표.csv) but has no project, is not held, and has no reading
  // decision at all is NOT unclassified -- it is already filed under that
  // organisation. This is a genuine primary bucket of its own
  // (`organisation_undecided`), distinct from `vendor_only` (an Owner/reader's
  // EXPLICIT 판독_결정표 decision, resolved above): same ledger destination (that
  // vendor's/those vendors' secondary view only, no primary file of its own -- see
  // `common_refresh.mjs`), 과제 cell always `미정`, 과제근거 cell always `거래처(자동)`
  // regardless of whatever `classifyProjectHits`'s own `basis`/`candidates` happened to
  // compute. `basisOverride` here is what `common_refresh.mjs`'s row-building reads
  // instead of `projectResult.basis`.
  //
  // R1 (fresh non-author review, 2026-09-21): requires NO reading decision AT ALL
  // (`!projectResult.reading`) -- a `hold_owner_review` decision, or a decision that
  // reached this point because it did not route anywhere (see `resolveReadingDecision`
  // above), must stay in the triage queue (`unclassified`), not silently disappear into
  // this bucket just because the mail also happens to touch a known organisation. It
  // still shows up in that organisation's own secondary ledger regardless
  // (`common_refresh.mjs` computes vendor/work-tag views from `projectResult.vendors`
  // independently of the primary bucket) -- only the PRIMARY bucket, and therefore
  // triage visibility, changes here.
  if (!projectResult.reading && projectResult.vendors.length > 0) {
    // S4 (fresh non-author review, 2026-09-21): a thread-inherited vendor match
    // (`common_refresh.mjs`'s thread-vendor inheritance) is distinguishable in the
    // basisOverride from a direct one -- the marker used to be computed onto
    // `projectResult.basis`, but `basisOverride` unconditionally REPLACED that text
    // wholesale, so the distinction never actually reached the ledger row.
    const inherited = String(projectResult.basis ?? '').includes(THREAD_VENDOR_INHERITANCE_MARKER);
    return { bucket: 'organisation_undecided', detail: null, fileName: null,
      basisOverride: inherited ? '거래처(자동, 같은 대화)' : '거래처(자동)' };
  }

  // No signal placed this mail in any other primary bucket, and it touches no known
  // organisation either -- truly unclassified (awaiting either an Owner bundle-table
  // entry or a 판독_결정표 reading decision via the triage API, spec section 7).
  return { bucket: 'unclassified', detail: null, fileName: '미분류.csv' };
}
