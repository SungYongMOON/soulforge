// Reviewed public terms are evidence, not account permission or canonical acceptance.
import { createHash } from "node:crypto";

export const CONTRACT_VERSION = "source-rights-metadata-v1";
export const SOURCE_IDS = Object.freeze(["openalex", "semantic_scholar", "epo_ops", "kipris"]);
export const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const reviewedOn = "2026-09-08";
const ref = (url, revision = "publisher_revision_not_stated") => ({ url, revision, reviewedOn });
const definitions = {
  openalex: {
    collector: "implemented", product: "works_metadata_api",
    terms: [ref("https://help.openalex.org/access/pricing/", "2026-08-11"), ref("https://help.openalex.org/api/authentication/", "2026-08-19"), ref("https://help.openalex.org/api/paging/")],
    budget: { unit: "provider_credits", boundary: "daily_midnight_UTC", publishedAllowance: "keyless_USD_0.10_free_key_USD_1_daily_request_type_dependent", resetHeader: "X-RateLimit-Reset_seconds", remainingHeader: "X-RateLimit-Remaining" },
    redistribution: "CC0_metadata_only_fulltext_has_separate_rights", attribution: "OpenAlex source link retained",
  },
  semantic_scholar: {
    collector: "implemented", product: "academic_graph_paper_bulk_metadata",
    terms: [ref("https://api.semanticscholar.org/license/"), ref("https://api.semanticscholar.org/api-docs/graph"), ref("https://www.semanticscholar.org/product/api")],
    budget: { unit: "requests", boundary: "account_confirmed_window_required", publishedAllowance: "account_specific_no_assumed_daily_allowance", resetHeader: "Retry-After_when_present", remainingHeader: null },
    redistribution: "internal_authorized_use_only_no_third_party_data_sharing_without_expanded_license", attribution: "Public use requires Semantic Scholar name/logo and https://www.semanticscholar.org/?utm_source=api",
  },
  epo_ops: {
    collector: "not_implemented", product: "OPS_account_product_unconfirmed",
    terms: [ref("https://www.epo.org/en/service-support/ordering/terms-and-conditions/ops-terms-and-conditions"), ref("https://www.epo.org/en/service-support/ordering/fair-use"), ref("https://link.epo.org/web/searching-for-patents/data/en-ops-v3.2-documentation-version-1.3.20.pdf", "v1.3.20_2024-06-12")],
    budget: { unit: "bytes", boundary: "Monday_00:00_through_Sunday_24:00_GMT", publishedAllowance: "free_4GB_per_week_dynamic_throttling_also_applies", resetHeader: null, remainingHeader: "X-WeeklyQuota-Remaining" },
    redistribution: "own_product_incorporation_allowed_data_itself_copy_distribution_prohibited", attribution: "EPO OPS attribution and current terms required",
  },
  kipris: {
    collector: "not_implemented", product: "Open_API_product_unconfirmed",
    terms: [ref("https://plus.kipris.or.kr/portal/use/paymentMmg.do?menuNo=200026"), ref("https://plus.kipris.or.kr/portal/main/contents.do?menuNo=200031", "effective_2025-10-01")],
    budget: { unit: "requests", boundary: "calendar_month_day_1_timezone_unconfirmed", publishedAllowance: "free_1000_calls_monthly", resetHeader: null, remainingHeader: null },
    redistribution: "third_party_supply_and_key_sharing_restricted_exact_product_terms_required", attribution: "KIPRIS Plus product-specific terms require confirmation",
  },
};
const validDigest = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const validTime = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

/** An explicit current authorization receipt is required even for keyless access.
 * Input is supplied by an authorized caller; this module never creates approvals.
 * Public output carries digests only, never account ids, keys, paths or free text.
 */
export function sourceContract(source, config = {}, now = new Date().toISOString()) {
  if (!SOURCE_IDS.includes(source)) throw new Error("unknown_source_contract");
  const definition = definitions[source];
  const access = config.authorization;
  const current = access?.state === "verified" && validDigest(access.evidenceDigest) && access.product === definition.product
    && access.termsDigest === digest(definition.terms) && validDigest(access.budgetEvidenceDigest)
    && (source !== "semantic_scholar" || (access.purpose === "expanded_license_internal_intelligence" && validDigest(access.expandedLicenseDigest)))
    && access.metadataStorage === "allowed" && access.internalAnalysis === "allowed"
    && access.exportScope === "internal_only" && validTime(access.checkedAt) && validTime(access.expiresAt)
    && access.checkedAt <= now && now < access.expiresAt;
  const revoked = access?.state === "revoked";
  const account = { state: revoked ? "revoked" : current ? "verified" : "unknown", evidenceScope: current ? access.synthetic === true ? "synthetic_fixture" : "owner_supplied" : "unknown", product: current ? access.product : "unknown", evidenceDigest: current ? access.evidenceDigest : null, budgetEvidenceDigest: current ? access.budgetEvidenceDigest : null, expandedLicenseDigest: current && source === "semantic_scholar" ? access.expandedLicenseDigest : null, checkedAt: current ? access.checkedAt : null, expiresAt: current ? access.expiresAt : null };
  const contract = { version: CONTRACT_VERSION, source, ...structuredClone(definition), account, storage: "app_owned_working_metadata", acceptance: "not_canonical_acceptance", exportScope: "internal_only" };
  const contractDigest = digest(contract);
  const reasons = [];
  if (definition.collector !== "implemented") reasons.push("collector_not_implemented");
  if (!current) reasons.push(revoked ? "authorization_revoked" : "authorization_unknown");
  if (config.enabled !== true) reasons.push("source_disabled");
  return { ...contract, contractDigest, enabled: config.enabled === true, executable: reasons.length === 0, reasons };
}

export function contractSnapshot(contract) {
  const { contractDigest, enabled, executable, reasons, ...snapshot } = contract;
  return snapshot;
}

export function validateProvenance(record) {
  const p = record?.meta?.provenance;
  if (!p || p.version !== CONTRACT_VERSION || p.source !== record.source || !SOURCE_IDS.includes(p.source) || !validDigest(p.contractDigest) || !p.contract || digest(p.contract) !== p.contractDigest) return null;
  if (p.recordDigest !== digest([record.source, record.type, record.title, record.summary, record.url, record.publishedAt, record.meta.identifiers])) return null;
  if (p.contract.version !== CONTRACT_VERSION || p.contract.source !== p.source || p.contract.account?.state !== "verified" || !["owner_supplied", "synthetic_fixture"].includes(p.contract.account.evidenceScope) || p.contract.acceptance !== "not_canonical_acceptance" || p.contract.exportScope !== "internal_only") return null;
  if (!validTime(record.fetchedAt) || !(p.contract.account.checkedAt <= record.fetchedAt && record.fetchedAt < p.contract.account.expiresAt)) return null;
  // A whitelist projection prevents raw meta, query strings or account details reaching the API.
  const known = definitions[p.source];
  if (JSON.stringify(p.contract.terms) !== JSON.stringify(known.terms) || p.contract.redistribution !== known.redistribution) return null;
  return { version: p.version, source: p.source, contractDigest: p.contractDigest, terms: known.terms, redistribution: known.redistribution, attribution: known.attribution, accountState: "verified_at_collection", evidenceScope: p.contract.account.evidenceScope, acceptance: "not_canonical_acceptance", exportScope: "internal_only" };
}
