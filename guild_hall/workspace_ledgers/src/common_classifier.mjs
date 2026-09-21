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
import { classifyMail, compileTerm, RuleCompileError } from './classifier.mjs';
import { domainOf, normalizeSubject } from './ledgers.mjs';

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
 */
export function classifyProjectHits({ id, subject, body, addresses }, { compiledRules, bundles, readings, vendorLookup }) {
  const vendors = vendorsOfAddresses(addresses, vendorLookup);
  const bodyOk = vendors.some(vendor => !SUPPLIER_KIND_EXCLUDE.test(vendor.kind));
  const knownCode = code => compiledRules.some(rule => rule.project_code === code);
  let unknownBundleTarget = false;

  // Step 1: the project's own title rule. Two projects' exact triggers on the same
  // subject means held -- never automatic attribution.
  const titleResult = classifyMail({ subject, body_text: '', attachment_names: [] }, compiledRules, { fields: ['subject'] });
  if (titleResult.hits.length === 1) {
    return { hits: titleResult.hits, held: false, basis: '제목', vendors, candidates: [], unknownBundleTarget, unknownReadingTarget: false };
  }
  if (titleResult.hits.length > 1) {
    return { hits: [], held: true, basis: '제목(두 과제 겹침)', vendors, candidates: titleResult.hits.map(hit => hit.project_code),
      unknownBundleTarget, unknownReadingTarget: false };
  }

  // Step 2: Owner-confirmed conversation bundle table (묶음_확정표.csv) -- may name
  // several projects at once (공유). S1: a row naming even ONE unknown code is not a
  // match at all (never silently attribute the known subset) -- an Owner typo in a
  // multi-project bundle row must surface as "nothing matched", not a partial,
  // possibly-wrong attribution.
  const normalized = normalizeSubject(subject);
  const bundle = bundles.find(entry => normalized.includes(entry.phrase));
  if (bundle) {
    const allKnown = bundle.codes.every(knownCode);
    if (allKnown) {
      const label = `묶음 확정: ${bundle.why}${bundle.codes.length > 1 ? ` (공유 ${bundle.codes.join(';')})` : ''}`;
      return { hits: bundle.codes.map(code => ({ project_code: code, label })), held: false, basis: '묶음 확정', vendors, candidates: [],
        unknownBundleTarget, unknownReadingTarget: false };
    }
    unknownBundleTarget = true;
  }

  // Step 3: reading-decision table (판독_결정표.csv), keyed by mail source id.
  const reading = readings.get(id) ?? null;
  if (reading) {
    const readingCodes = String(reading.target ?? '').split(';').map(code => code.trim()).filter(Boolean);
    if (reading.level === 'include' || reading.level === 'include_with_review') {
      if (readingCodes.length > 0 && readingCodes.every(knownCode)) {
        const reviewSuffix = reading.level === 'include_with_review' ? '(검토 필요)' : '';
        const shareSuffix = readingCodes.length > 1 ? `(공유 ${readingCodes.join(';')})` : '';
        const label = `판독${reviewSuffix}${shareSuffix}: ${reading.why}`;
        return { hits: readingCodes.map(code => ({ project_code: code, label })), held: false,
          basis: reading.level === 'include' ? '판독' : '판독(검토 필요)', vendors, candidates: [],
          unknownBundleTarget, unknownReadingTarget: false };
      }
      // S1: an include/include_with_review row naming an unknown (or empty) code
      // falls through to the generic reading branch below (basis "판독: 보류") --
      // now explicitly counted as an unknown reading target rather than silently
      // degrading to the same shape a genuine hold_owner_review row has.
      return { hits: [], held: false, basis: '판독: 보류', vendors, candidates: [], reading,
        unknownBundleTarget, unknownReadingTarget: true };
    }
    if (reading.level === 'vendor_only') {
      return { hits: [], held: false, basis: '판독: 거래처만', vendors, candidates: [], reading,
        unknownBundleTarget, unknownReadingTarget: false };
    }
    return { hits: [], held: false, basis: reading.level === 'exclude' ? '판독: 과제 아님' : '판독: 보류', vendors, candidates: [], reading,
      unknownBundleTarget, unknownReadingTarget: false };
  }

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
  return {
    commonFolderName: typeof config.common_folder_name === 'string' && config.common_folder_name ? config.common_folder_name : 'P00-000_공통',
    generalWorkFolderName: typeof config.general_work_folder_name === 'string' && config.general_work_folder_name
      ? config.general_work_folder_name : 'general_work_일반업무',
    knowledgeFolderNames: lowerSet(config.knowledge_folder_names),
    systemSources: (Array.isArray(config.system_notification_sources) ? config.system_notification_sources : [])
      .filter(source => source && typeof source.name === 'string' && source.name.trim() !== '')
      .map((source, index) => ({
        name: source.name, senderDomains: lowerSet(source.sender_domains),
        subjectPatterns: compilePatternList(source.subject_patterns, `common_ledgers.system_notification_sources[${index}].subject_patterns`),
      })),
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

/** The system-notification source name a mail belongs to, or `null`. */
export function detectSystemSource(mail, commonConfig) {
  for (const source of commonConfig.systemSources) {
    if (source.senderDomains.has(mail.fromDomain)) return source.name;
    if (source.subjectPatterns.some(term => term.test(mail.subject))) return source.name;
  }
  return null;
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
    if (target === '과제없음') return { bucket: 'no_code_confirmed', detail: reading.why, fileName: '과제없음_확인함.csv' };
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

  if (patternBucket) return patternBucket;

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
    return { bucket: 'organisation_undecided', detail: null, fileName: null, basisOverride: '거래처(자동)' };
  }

  // No signal placed this mail in any other primary bucket, and it touches no known
  // organisation either -- truly unclassified (awaiting either an Owner bundle-table
  // entry or a 판독_결정표 reading decision via the triage API, spec section 7).
  return { bucket: 'unclassified', detail: null, fileName: '미분류.csv' };
}
