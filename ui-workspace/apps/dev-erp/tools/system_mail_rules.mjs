// tools/system_mail_rules.mjs -- deterministic metadata-only system/ad mail classifier.
// Reads owner-editable metadata rules from _workmeta/system/rules/system_mail_rules.json when present.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const SYSTEM_MAIL_RULES_RELATIVE_PATH = join("system", "rules", "system_mail_rules.json");

const DEFAULT_RULES = {
  schema_version: "soulforge.system_mail_rules.v0",
  senders: [],
  sender_domains: [],
  subject_prefixes: ["[dev-erp]", "[Soulforge]", "나이트워치", "아침보고"],
  subject_contains: [],
  ad_subject_contains: ["(광고)", "[광고]", "수신거부", "unsubscribe"],
  ad_sender_domains: [],
};

function asList(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function normalizeRules(raw = {}) {
  return {
    schema_version: String(raw.schema_version || DEFAULT_RULES.schema_version),
    senders: [...new Set([...DEFAULT_RULES.senders, ...asList(raw.senders)].map((v) => v.toLowerCase()))],
    sender_domains: [...new Set([...DEFAULT_RULES.sender_domains, ...asList(raw.sender_domains)].map((v) => v.toLowerCase()))],
    subject_prefixes: [...new Set([...DEFAULT_RULES.subject_prefixes, ...asList(raw.subject_prefixes)])],
    subject_contains: [...new Set([...DEFAULT_RULES.subject_contains, ...asList(raw.subject_contains)])],
    ad_subject_contains: [...new Set([...DEFAULT_RULES.ad_subject_contains, ...asList(raw.ad_subject_contains)])],
    ad_sender_domains: [...new Set([...DEFAULT_RULES.ad_sender_domains, ...asList(raw.ad_sender_domains)].map((v) => v.toLowerCase()))],
  };
}

export function loadSystemMailRules(workmetaRoot) {
  const path = join(workmetaRoot, SYSTEM_MAIL_RULES_RELATIVE_PATH);
  if (!existsSync(path)) return normalizeRules();
  try {
    return normalizeRules(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return normalizeRules();
  }
}

function senderDomain(sender) {
  const text = String(sender ?? "").trim().toLowerCase();
  const match = /[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/iu.exec(text);
  if (match) return match[1].toLowerCase();
  return text.includes("@") ? text.split("@").pop().toLowerCase() : "";
}

function subjectStartsWith(subject, prefixes) {
  const lower = String(subject ?? "").trim().toLowerCase();
  return prefixes.some((prefix) => lower.startsWith(String(prefix).trim().toLowerCase()));
}

function subjectContains(subject, needles) {
  const lower = String(subject ?? "").toLowerCase();
  return needles.some((needle) => lower.includes(String(needle).trim().toLowerCase()));
}

export function classifySystemMail(mail = {}, rules = normalizeRules()) {
  const subject = String(mail.subject ?? "").trim();
  const from = String(mail.from ?? mail.counterpart ?? "").trim().toLowerCase();
  const domain = senderDomain(from);
  if (rules.senders.includes(from)) {
    return { category: "system", reason: "system_mail_rule", rule_ref: "sender" };
  }
  if (domain && rules.sender_domains.includes(domain)) {
    return { category: "system", reason: "system_mail_rule", rule_ref: "sender_domain" };
  }
  if (subjectStartsWith(subject, rules.subject_prefixes)) {
    return { category: "system", reason: "system_mail_rule", rule_ref: "subject_prefix" };
  }
  if (subjectContains(subject, rules.subject_contains)) {
    return { category: "system", reason: "system_mail_rule", rule_ref: "subject_contains" };
  }
  if (String(mail.list_unsubscribe ?? "").trim() || subjectContains(subject, rules.ad_subject_contains)) {
    return { category: "ad", reason: "ad_mail_rule", rule_ref: "ad_subject_or_header" };
  }
  if (domain && rules.ad_sender_domains.includes(domain)) {
    return { category: "ad", reason: "ad_mail_rule", rule_ref: "ad_sender_domain" };
  }
  return { category: "", reason: "", rule_ref: "" };
}
