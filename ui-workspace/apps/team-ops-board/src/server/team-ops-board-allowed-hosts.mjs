import { isIP } from "node:net";

export const TEAM_OPS_BOARD_ALLOWED_HOSTS = "TEAM_OPS_BOARD_ALLOWED_HOSTS";

const MAX_FQDN_LENGTH = 253;
const MAX_DNS_LABEL_LENGTH = 63;
const DNS_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

function isIpLiteral(value) {
  if (isIP(value) !== 0) return true;
  return value.startsWith("[") && value.endsWith("]")
    && isIP(value.slice(1, -1)) !== 0;
}

function isCanonicalTailnetFqdn(value) {
  if (value.length > MAX_FQDN_LENGTH || value.includes(",") || isIpLiteral(value)) {
    return false;
  }
  const labels = value.split(".");
  if (labels.length < 3 || labels.at(-2) !== "ts" || labels.at(-1) !== "net") {
    return false;
  }
  return labels.every((label) => label.length > 0
    && label.length <= MAX_DNS_LABEL_LENGTH
    && DNS_LABEL_PATTERN.test(label));
}

// This is deliberately not a parser: one exact, canonical tailnet FQDN is the
// only opt-in. Every other local value falls back to Vite's default host policy.
export function resolveTeamOpsBoardAllowedHosts(env = process.env) {
  const value = env?.[TEAM_OPS_BOARD_ALLOWED_HOSTS];
  if (typeof value !== "string" || value.trim() === "") return [];
  return isCanonicalTailnetFqdn(value) ? [value] : [];
}
