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
import { classifyMail } from './classifier.mjs';
import { domainOf, normalizeSubject } from './ledgers.mjs';

export const PRIMARY_BUCKETS = Object.freeze([
  'project', 'held', 'system', 'ads', 'internal_admin', 'external_notice', 'out_of_project',
  'code_pending', 'no_code_confirmed', 'general_work', 'vendor_only', 'unclassified',
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
 * label}], held, basis, vendors, candidates, reading }`.
 */
export function classifyProjectHits({ id, subject, body, addresses }, { compiledRules, bundles, readings, vendorLookup }) {
  const vendors = vendorsOfAddresses(addresses, vendorLookup);
  const bodyOk = vendors.some(vendor => !SUPPLIER_KIND_EXCLUDE.test(vendor.kind));
  const knownCode = code => compiledRules.some(rule => rule.project_code === code);

  // Step 1: the project's own title rule. Two projects' exact triggers on the same
  // subject means held -- never automatic attribution.
  const titleResult = classifyMail({ subject, body_text: '', attachment_names: [] }, compiledRules, { fields: ['subject'] });
  if (titleResult.hits.length === 1) {
    return { hits: titleResult.hits, held: false, basis: '제목', vendors, candidates: [] };
  }
  if (titleResult.hits.length > 1) {
    return { hits: [], held: true, basis: '제목(두 과제 겹침)', vendors, candidates: titleResult.hits.map(hit => hit.project_code) };
  }

  // Step 2: Owner-confirmed conversation bundle table (묶음_확정표.csv) -- may name several projects at once (공유).
  const normalized = normalizeSubject(subject);
  const bundle = bundles.find(entry => normalized.includes(entry.phrase));
  if (bundle) {
    const codes = bundle.codes.filter(knownCode);
    if (codes.length > 0) {
      const label = `묶음 확정: ${bundle.why}${codes.length > 1 ? ` (공유 ${codes.join(';')})` : ''}`;
      return { hits: codes.map(code => ({ project_code: code, label })), held: false, basis: '묶음 확정', vendors, candidates: [] };
    }
  }

  // Step 3: reading-decision table (판독_결정표.csv), keyed by mail source id.
  const reading = readings.get(id) ?? null;
  if (reading) {
    const readingCodes = String(reading.target ?? '').split(';').map(code => code.trim()).filter(Boolean);
    if ((reading.level === 'include' || reading.level === 'include_with_review')
      && readingCodes.length > 0 && readingCodes.every(knownCode)) {
      const reviewSuffix = reading.level === 'include_with_review' ? '(검토 필요)' : '';
      const shareSuffix = readingCodes.length > 1 ? `(공유 ${readingCodes.join(';')})` : '';
      const label = `판독${reviewSuffix}${shareSuffix}: ${reading.why}`;
      return { hits: readingCodes.map(code => ({ project_code: code, label })), held: false,
        basis: reading.level === 'include' ? '판독' : '판독(검토 필요)', vendors, candidates: [] };
    }
    if (reading.level === 'vendor_only') {
      return { hits: [], held: false, basis: '판독: 거래처만', vendors, candidates: [], reading };
    }
    return { hits: [], held: false, basis: reading.level === 'exclude' ? '판독: 과제 아님' : '판독: 보류', vendors, candidates: [], reading };
  }

  // Step 4: supplier-only body confirmation -- only when exactly one project's exact
  // term appears in the body text, and only for a supplier-type vendor (never a
  // customer/agency/school -- `bodyOk`).
  if (bodyOk && body) {
    const bodyResult = classifyMail({ subject: '', body_text: body, attachment_names: [] }, compiledRules, { fields: ['body_text'] });
    if (bodyResult.hits.length === 1) {
      const hit = bodyResult.hits[0];
      return { hits: [{ project_code: hit.project_code, label: `본문: ${hit.label}` }], held: false, basis: '본문', vendors, candidates: [] };
    }
    if (bodyResult.hits.length > 1) {
      return { hits: [], held: false, basis: '미정(본문에 여러 과제)', vendors, candidates: bodyResult.hits.map(hit => hit.project_code) };
    }
  }

  // Step 5: undetermined.
  return { hits: [], held: false, basis: '미정', vendors, candidates: [] };
}

// ------------------------------------------------------------- common-config loading
function compilePatternList(list) {
  return (Array.isArray(list) ? list : [])
    .map(entry => (typeof entry === 'string' ? entry : entry?.pattern))
    .filter(pattern => typeof pattern === 'string' && pattern.trim() !== '')
    .map(pattern => new RegExp(pattern, 'iu'));
}
function compileLabeledPatternList(list) {
  return (Array.isArray(list) ? list : [])
    .filter(entry => entry && typeof entry.pattern === 'string' && typeof entry.label === 'string')
    .map(entry => ({ label: entry.label, re: new RegExp(entry.pattern, 'iu') }));
}
function lowerSet(list) { return new Set((Array.isArray(list) ? list : []).map(value => String(value).toLowerCase())); }

/**
 * Precompiles `orgConfig.common_ledgers` (spec section 3's last bullet: every
 * org-specific pattern/folder-name lives in the private org config, never hardcoded
 * here) into ready-to-use lookups. Every field has a safe, inert default (empty
 * list/set) so an org config that omits `common_ledgers` entirely still classifies --
 * it simply never matches any org-specific bucket, everything falls through toward
 * 미분류 -- rather than throwing.
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
      .map(source => ({ name: source.name, senderDomains: lowerSet(source.sender_domains), subjectPatterns: compilePatternList(source.subject_patterns) })),
    adsSenderDomains: lowerSet(config.ads_sender_domains),
    adsSenderKeywords: [...lowerSet(config.ads_sender_keywords)],
    adsSubjectPatterns: compilePatternList(config.ads_subject_patterns),
    agencyNoticeSenderDomains: lowerSet(config.agency_notice_sender_domains),
    internalAdminPatterns: compileLabeledPatternList(config.internal_admin_subject_patterns),
    outOfProjectPatterns: compileLabeledPatternList(config.out_of_project_subject_patterns),
    codePendingPatterns: compileLabeledPatternList(config.code_pending_subject_patterns),
  };
}

function firstLabelMatch(patterns, subject) {
  const found = patterns.find(entry => entry.re.test(subject));
  return found ? found.label : null;
}

/** The system-notification source name a mail belongs to, or `null`. Checked before project classification (spec-consistent with the reference: a notification naming a project is still a notification). */
export function detectSystemSource(mail, commonConfig) {
  for (const source of commonConfig.systemSources) {
    if (source.senderDomains.has(mail.fromDomain)) return source.name;
    if (source.subjectPatterns.some(re => re.test(mail.subject))) return source.name;
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
  if (commonConfig.adsSubjectPatterns.some(re => re.test(mail.subject))) return true;
  return false;
}

/**
 * Resolves ONE primary bucket for a mail that did not resolve to a project (spec
 * section 3: "각 메일은 아래 주 분류 하나에만 들어간다"). `projectResult` is
 * `classifyProjectHits`'s return; call this only when `!projectResult.hits.length &&
 * !projectResult.held` -- the caller (`common_refresh.mjs`) handles `project`/`held`
 * itself, since those two buckets are effectively "no common-folder row" (a project
 * hit belongs to that project's own ledgers; held is echoed into `보류.csv` -- see
 * `common_refresh.mjs`). Returns `{ bucket, detail, fileName, folder }`; `detail` is
 * the sub-category label (system source name, admin/notice/out-of-project/code-pending
 * label, or the reading table's free-text target for general-work/no-code-confirmed),
 * used both for the file name and the row's own 세부분류/분류 cell.
 */
export function resolvePrimaryBucket(mail, projectResult, commonConfig, { ourDomain }) {
  const systemSource = detectSystemSource(mail, commonConfig);
  if (systemSource) return { bucket: 'system', detail: systemSource, fileName: `시스템알림_${systemSource}.csv` };

  if (projectResult.reading && projectResult.reading.level === 'vendor_only' && projectResult.vendors.length > 0) {
    const detail = projectResult.reading.target || null;
    return { bucket: 'vendor_only', detail, fileName: null };
  }

  if (isAds(mail, commonConfig)) return { bucket: 'ads', detail: null, fileName: null };

  if (projectResult.reading && projectResult.reading.level === 'exclude') {
    const target = String(projectResult.reading.target ?? '').trim();
    if (target === '광고') return { bucket: 'ads', detail: null, fileName: null };
    if (target === '알림') return { bucket: 'system', detail: '기타알림', fileName: '시스템알림_기타알림.csv' };
    if (target === '테스트') return { bucket: 'system', detail: '자체시스템·테스트', fileName: '시스템알림_자체시스템·테스트.csv' };
    if (target === '일반업무' || target.startsWith('일반업무:')) {
      return { bucket: 'general_work', detail: target.includes(':') ? target.slice(target.indexOf(':') + 1) : '단발 지원', fileName: '일반업무_메일.csv' };
    }
    if (target === '과제없음') return { bucket: 'no_code_confirmed', detail: projectResult.reading.why, fileName: '과제없음_확인함.csv' };
    if (target === '사내행정') return { bucket: 'internal_admin', detail: `판독: ${projectResult.reading.why}`, fileName: '사내행정.csv' };
    if (target.startsWith('과제코드대기:')) return { bucket: 'code_pending', detail: target.slice('과제코드대기:'.length), fileName: '과제코드대기.csv' };
    if (target.startsWith('과제외:')) {
      const label = target.slice('과제외:'.length);
      return { bucket: 'out_of_project', detail: label, fileName: `과제외_${label}.csv` };
    }
    // An 'exclude' row whose target does not match any known routing prefix falls
    // through to the same ordinary cascade below, rather than being silently dropped.
  }

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

  // No signal placed this mail in any other primary bucket -- it is unclassified
  // (awaiting either an Owner bundle-table entry or a 판독_결정표 reading decision via
  // the triage API, spec section 7). A vendor address or work tag touching this mail
  // (if any) still places it in that vendor's/tag's SECONDARY view ledger regardless
  // of its primary bucket (spec section 3: "거래처별·작업별 장부는 주 분류와 별개의
  // 보조 보기다") -- deliberately simpler than the scratch-script reference, which
  // skips 미분류 entirely for any vendor-touched mail; keeping every unresolved mail
  // in 미분류 (even when a vendor view also shows it) keeps the primary-bucket set
  // exactly the spec's enumerated list and the reconciliation invariant provable.
  return { bucket: 'unclassified', detail: null, fileName: '미분류.csv' };
}
