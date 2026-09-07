// Browser-only receipt projection loading. A read failure supplies no counts.
const SCHEMA = "soulforge.team_ops_board.receipt_expiry_projection.v1";
const RECEIPT_STATES = ["current", "warning", "critical", "expired", "invalid", "unknown"];

function validSnapshot(snapshot) {
  if (snapshot?.schema_version !== SCHEMA
    || !["ready", "partial", "unavailable"].includes(snapshot.status)
    || typeof snapshot.observed_at !== "string"
    || !Number.isFinite(Date.parse(snapshot.observed_at))
    || (snapshot.reason !== null && typeof snapshot.reason !== "string")
    || !Array.isArray(snapshot.receipts)
    || snapshot.authority_boundary?.read_only !== true
    || snapshot.authority_boundary?.runtime_authority !== false
    || snapshot.authority_boundary?.repair_authority !== false) return false;
  const summary = snapshot.summary;
  if (!["total", "owner_action_required_count", ...RECEIPT_STATES]
    .every((key) => Number.isSafeInteger(summary?.[key]) && summary[key] >= 0)) return false;
  if (!snapshot.receipts.every((receipt) => receipt
    && typeof receipt.contract_id === "string"
    && RECEIPT_STATES.includes(receipt.status)
    && typeof receipt.owner_action_required === "boolean")) return false;
  return summary.total === snapshot.receipts.length
    && RECEIPT_STATES.every((state) => summary[state] === snapshot.receipts.filter((receipt) => receipt.status === state).length)
    && summary.owner_action_required_count === snapshot.receipts.filter((receipt) => receipt.owner_action_required).length;
}

// The component owns one loader per mount; generations also guard JSON parsing
// and fetch implementations that complete after their signal was aborted.
export function createReceiptExpiryLoader(onResult, fetchImpl = globalThis.fetch) {
  let active = true;
  let generation = 0;
  let controller = null;
  return {
    async load() {
      if (!active) return;
      const requestGeneration = ++generation;
      controller?.abort();
      controller = new AbortController();
      let result = { state: "unavailable", snapshot: null };
      try {
        const response = await fetchImpl("/receipt-expiry.snapshot.json", {
          cache: "no-store", signal: controller.signal,
        });
        if (response.ok) {
          const snapshot = await response.json();
          if (validSnapshot(snapshot)) result = { state: "available", snapshot };
        }
      } catch {
        // A transport or parse failure cannot keep last-known healthy counts.
      }
      if (active && requestGeneration === generation) onResult(result);
    },
    dispose() {
      active = false;
      generation += 1;
      controller?.abort();
    },
  };
}
