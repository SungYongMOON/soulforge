// Entirely synthetic. These grants cannot target external collector endpoints.
import { sourceContract, digest } from "../../src/collectors/source_contract.mjs";
export const paperTime = "2026-09-08T12:00:00.000Z";
export function paperConfig(source) {
  const base = sourceContract(source);
  return { enabled: true, authorization: { state: "verified", synthetic: true, product: base.product,
    evidenceDigest: digest("synthetic-account"), termsDigest: digest(base.terms), budgetEvidenceDigest: digest("synthetic-budget"),
    purpose: "expanded_license_internal_intelligence", expandedLicenseDigest: digest("synthetic-expanded-license"),
    metadataStorage: "allowed", internalAnalysis: "allowed", exportScope: "internal_only",
    checkedAt: "2026-09-08T00:00:00.000Z", expiresAt: "2026-09-09T00:00:00.000Z" } };
}
export function budgetObservation(source, config = paperConfig(source)) {
  const contract = sourceContract(source, config, paperTime);
  return { contractDigest: contract.contractDigest, observedAt: "2026-09-08T00:00:00.000Z", resetAt: "2026-09-09T00:00:00.000Z", remaining: 100, requestCeiling: 1, remainingRequests: 20, unit: contract.budget.unit };
}
export const openalexPaper = (id = 123, extra = {}) => ({ id: `https://openalex.org/W${id}`, title: "Synthetic sonar hydrophone observation", doi: "https://doi.org/10.9999/synthetic-a", publication_date: "2026-09-08", ...extra });
export const semanticPaper = (id = "a", extra = {}) => ({ paperId: id.repeat(40), title: "Synthetic sonar hydrophone observation", externalIds: { DOI: "10.9999/SYNTHETIC-A" }, publicationDate: "2026-09-08", ...extra });
