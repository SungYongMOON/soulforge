import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { relativeToRepo } from "../shared/io.mjs";

export const DEFAULT_MAIL_PROJECT_ROUTER_BINDING_REF = "_workmeta/system/bindings/mail_project_router.yaml";
export const MAIL_PROJECT_ROUTING_SUGGESTION_VERSION = "mail_project_routing_suggestion.v1";

export async function loadMailProjectRouterBinding({ repoRoot, bindingFile = null }) {
  const resolvedBindingFile = bindingFile
    ? resolveRepoPath(repoRoot, bindingFile)
    : path.join(repoRoot, DEFAULT_MAIL_PROJECT_ROUTER_BINDING_REF);
  const raw = await fs.readFile(resolvedBindingFile, "utf8");
  const parsed = parseYaml(raw) ?? {};
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("mail project router binding must be a YAML object");
  }

  const routes = normalizeRoutes(parsed);
  if (routes.length === 0) {
    throw new Error("mail project router binding must define at least one route");
  }

  return {
    binding: {
      version: parsed.version ?? null,
      routes,
      default_project_code: stringOrNull(parsed.default_project_code ?? parsed.router_defaults?.unresolved_project_route),
      default_stage: stringOrNull(parsed.default_stage),
      default_next_action: stringOrNull(parsed.default_next_action ?? parsed.router_defaults?.default_next_action),
    },
    binding_file: resolvedBindingFile,
    binding_ref: relativeToRepo(repoRoot, resolvedBindingFile),
  };
}

export function buildMailProjectRoutingSuggestion(candidate, { binding, bindingRef, now, privateDeep = false, eventRecord = null }) {
  const context = buildCandidateRoutingContext(candidate, { privateDeep, eventRecord });
  const match = findFirstRouteMatch(binding.routes, context);
  const at = now.toISOString();

  if (match) {
    return {
      schema_version: MAIL_PROJECT_ROUTING_SUGGESTION_VERSION,
      status: "suggested",
      project_code: match.route.project_code,
      stage: match.route.stage,
      route_id: match.route.route_id,
      routing_rule_ref: match.route.routing_rule_ref,
      confidence: match.route.confidence,
      matched_on: match.matchedOn,
      reason_codes: match.reasonCodes,
      binding_ref: bindingRef,
      triaged_at: at,
      body_safe: true,
      next_action: match.route.next_action ?? "review_project_routing_suggestion",
    };
  }

  if (binding.default_project_code) {
    return {
      schema_version: MAIL_PROJECT_ROUTING_SUGGESTION_VERSION,
      status: "defaulted",
      project_code: binding.default_project_code,
      stage: binding.default_stage,
      route_id: "default",
      routing_rule_ref: null,
      confidence: null,
      matched_on: [],
      reason_codes: ["default_project_code"],
      binding_ref: bindingRef,
      triaged_at: at,
      body_safe: true,
      next_action: binding.default_next_action ?? "review_default_project_routing",
    };
  }

  return {
    schema_version: MAIL_PROJECT_ROUTING_SUGGESTION_VERSION,
    status: "unmatched",
    project_code: null,
    stage: null,
    route_id: null,
    routing_rule_ref: null,
    confidence: null,
    matched_on: [],
    reason_codes: ["no_route_matched"],
    binding_ref: bindingRef,
    triaged_at: at,
    body_safe: true,
    next_action: binding.default_next_action ?? "manual_project_routing_review",
  };
}

function normalizeRoutes(binding) {
  const rawRoutes = binding.routes ?? binding.project_routes ?? binding.rules ?? [];
  if (!Array.isArray(rawRoutes)) {
    throw new Error("mail project router binding routes must be an array");
  }

  return rawRoutes.map((route, index) => normalizeRoute(route, index));
}

function normalizeRoute(route, index) {
  if (!route || typeof route !== "object" || Array.isArray(route)) {
    throw new Error(`mail project router route at index ${index} must be an object`);
  }

  const routeId = requireString(route.route_id ?? route.rule_id ?? route.id ?? route.name, `routes[${index}].route_id`);
  const projectCode = requireString(
    route.project_code ?? route.suggested_project_code ?? route.project ?? route.project_id,
    `routes[${index}].project_code`,
  );
  const match = route.match ?? route.when ?? route.match_policy ?? {};
  if (!match || typeof match !== "object" || Array.isArray(match)) {
    throw new Error(`routes[${index}].match must be an object`);
  }

  return {
    route_id: routeId,
    project_code: projectCode,
    stage: stringOrNull(route.stage ?? route.project_stage),
    routing_rule_ref: stringOrNull(route.routing_rule_ref ?? route.rule_ref),
    confidence: confidenceOrNull(route.confidence ?? route.confidence_if_matched ?? route.routing_confidence),
    next_action: stringOrNull(route.next_action ?? route.next_action_if_matched),
    match: normalizeMatch(match),
  };
}

function normalizeMatch(match) {
  return {
    subject_includes: stringArray(match.subject_includes ?? match.subject_contains ?? match.exact_keywords),
    subject_any: stringArray(match.subject_any ?? match.hint_keywords),
    from_includes: stringArray(match.from_includes ?? match.sender_hint_labels),
    from_domains: stringArray(match.from_domains ?? match.sender_domains),
    from_addresses: stringArray(match.from_addresses ?? match.sender_addresses),
    sources: stringArray(match.sources),
    workspaces: stringArray(match.workspaces),
    classification_buckets: stringArray(match.classification_buckets ?? match.buckets),
    attachment_types: stringArray(match.attachment_types ?? match.attachment_type_hints),
    private_body_includes: stringArray(match.private_body_includes ?? match.body_includes ?? match.body_text_includes),
    private_body_any: stringArray(match.private_body_any ?? match.body_any ?? match.body_text_any),
    private_html_includes: stringArray(match.private_html_includes ?? match.html_includes ?? match.body_html_includes),
    private_html_any: stringArray(match.private_html_any ?? match.html_any ?? match.body_html_any),
    private_attachment_name_includes: stringArray(
      match.private_attachment_name_includes ?? match.attachment_name_includes ?? match.attachment_names,
    ),
    private_attachment_name_any: stringArray(match.private_attachment_name_any ?? match.attachment_name_any),
    private_attachment_mimes: stringArray(match.private_attachment_mimes ?? match.attachment_mimes),
    private_normalized_exact_keywords: stringArray(match.private_normalized_exact_keywords ?? match.normalized_exact_keywords),
    private_normalized_aliases: stringArray(
      match.private_normalized_aliases ?? match.normalized_aliases ?? match.project_aliases ?? match.aliases,
    ),
  };
}

function findFirstRouteMatch(routes, context) {
  for (const route of routes) {
    const result = matchRoute(route, context);
    if (result) {
      return result;
    }
  }
  return null;
}

function matchRoute(route, context) {
  const predicates = [];
  const reasonCodes = [];
  const matchedOn = new Set();
  const match = route.match;

  if (match.subject_includes.length > 0) {
    predicates.push(match.subject_includes.every((needle) => context.subject.includes(needle.toLowerCase())));
    reasonCodes.push("subject_includes");
    matchedOn.add("subject");
  }

  if (match.subject_any.length > 0) {
    predicates.push(match.subject_any.some((needle) => context.subject.includes(needle.toLowerCase())));
    reasonCodes.push("subject_any");
    matchedOn.add("subject");
  }

  if (match.from_domains.length > 0) {
    predicates.push(match.from_domains.some((domain) => context.fromDomains.has(domain.toLowerCase())));
    reasonCodes.push("from_domains");
    matchedOn.add("from");
  }

  if (match.from_includes.length > 0) {
    predicates.push(match.from_includes.some((needle) => context.fromText.includes(needle.toLowerCase())));
    reasonCodes.push("from_includes");
    matchedOn.add("from");
  }

  if (match.from_addresses.length > 0) {
    predicates.push(match.from_addresses.some((address) => context.fromAddresses.has(address.toLowerCase())));
    reasonCodes.push("from_addresses");
    matchedOn.add("from");
  }

  if (match.sources.length > 0) {
    predicates.push(match.sources.some((source) => context.source === source.toLowerCase()));
    reasonCodes.push("sources");
    matchedOn.add("source");
  }

  if (match.workspaces.length > 0) {
    predicates.push(match.workspaces.some((workspace) => context.workspace === workspace.toLowerCase()));
    reasonCodes.push("workspaces");
    matchedOn.add("workspace");
  }

  if (match.classification_buckets.length > 0) {
    predicates.push(match.classification_buckets.some((bucket) => context.classificationBucket === bucket.toLowerCase()));
    reasonCodes.push("classification_buckets");
    matchedOn.add("classification_bucket");
  }

  if (match.attachment_types.length > 0) {
    predicates.push(match.attachment_types.some((type) => context.attachmentTypes.has(type.toLowerCase())));
    reasonCodes.push("attachment_types");
    matchedOn.add("attachment_types");
  }

  if (match.private_body_includes.length > 0) {
    predicates.push(match.private_body_includes.every((needle) => context.privateBodyText.includes(needle.toLowerCase())));
    reasonCodes.push("private_body_includes");
    matchedOn.add("body");
  }

  if (match.private_body_any.length > 0) {
    predicates.push(match.private_body_any.some((needle) => context.privateBodyText.includes(needle.toLowerCase())));
    reasonCodes.push("private_body_any");
    matchedOn.add("body");
  }

  if (match.private_html_includes.length > 0) {
    predicates.push(match.private_html_includes.every((needle) => context.privateBodyHtml.includes(needle.toLowerCase())));
    reasonCodes.push("private_html_includes");
    matchedOn.add("html");
  }

  if (match.private_html_any.length > 0) {
    predicates.push(match.private_html_any.some((needle) => context.privateBodyHtml.includes(needle.toLowerCase())));
    reasonCodes.push("private_html_any");
    matchedOn.add("html");
  }

  if (match.private_attachment_name_includes.length > 0) {
    predicates.push(
      match.private_attachment_name_includes.every((needle) => context.privateAttachmentNames.includes(needle.toLowerCase())),
    );
    reasonCodes.push("private_attachment_name_includes");
    matchedOn.add("attachment_names");
  }

  if (match.private_attachment_name_any.length > 0) {
    predicates.push(match.private_attachment_name_any.some((needle) => context.privateAttachmentNames.includes(needle.toLowerCase())));
    reasonCodes.push("private_attachment_name_any");
    matchedOn.add("attachment_names");
  }

  if (match.private_attachment_mimes.length > 0) {
    predicates.push(match.private_attachment_mimes.some((mime) => context.privateAttachmentMimes.has(mime.toLowerCase())));
    reasonCodes.push("private_attachment_mimes");
    matchedOn.add("attachment_mimes");
  }

  const normalizedIdentifierMatch = matchPrivateNormalizedIdentifiers(context, [
    ...match.private_normalized_exact_keywords.map((value) => ({
      value,
      reasonCode: "private_normalized_exact_keywords",
    })),
    ...match.private_normalized_aliases.map((value) => ({
      value,
      reasonCode: "private_normalized_aliases",
    })),
  ]);
  if (normalizedIdentifierMatch.required) {
    predicates.push(normalizedIdentifierMatch.matched);
    reasonCodes.push(...normalizedIdentifierMatch.reasonCodes);
    for (const surface of normalizedIdentifierMatch.matchedOn) {
      matchedOn.add(surface);
    }
  }

  if (predicates.length === 0 || predicates.some((matched) => !matched)) {
    return null;
  }

  return {
    route,
    matchedOn: [...matchedOn].sort(),
    reasonCodes,
  };
}

function buildCandidateRoutingContext(candidate, { privateDeep = false, eventRecord = null } = {}) {
  const sourceEvent = candidate.source_event && typeof candidate.source_event === "object"
    ? candidate.source_event
    : {};
  const mailSummary = candidate.mail_summary && typeof candidate.mail_summary === "object"
    ? candidate.mail_summary
    : {};
  const classification = mailSummary.classification && typeof mailSummary.classification === "object"
    ? mailSummary.classification
    : {};

  const fromEntries = Array.isArray(mailSummary.from) ? mailSummary.from : [];
  const fromAddresses = new Set();
  const fromDomains = new Set();
  const fromTextParts = [];
  for (const entry of fromEntries) {
    const address = typeof entry === "string" ? entry : entry?.address ?? entry?.email;
    const name = typeof entry === "string" ? "" : entry?.name;
    const normalizedName = String(name ?? "").trim().toLowerCase();
    const normalized = String(address ?? "").trim().toLowerCase();
    if (normalizedName) {
      fromTextParts.push(normalizedName);
    }
    if (!normalized) {
      continue;
    }
    fromTextParts.push(normalized);
    fromAddresses.add(normalized);
    const domain = normalized.split("@")[1];
    if (domain) {
      fromDomains.add(domain);
    }
  }
  const event = privateDeep && eventRecord && typeof eventRecord === "object" && !Array.isArray(eventRecord)
    ? eventRecord
    : {};
  const privateAttachments = Array.isArray(event.attachments) ? event.attachments : [];
  const privateAttachmentMimes = new Set();
  const privateAttachmentNameParts = [];
  for (const attachment of privateAttachments) {
    if (!attachment || typeof attachment !== "object") {
      continue;
    }
    const name = String(attachment.name ?? "").trim().toLowerCase();
    const mime = String(attachment.mime ?? "").trim().toLowerCase();
    if (name) {
      privateAttachmentNameParts.push(name);
    }
    if (mime) {
      privateAttachmentMimes.add(mime);
    }
  }

  return {
    subject: String(mailSummary.subject ?? "").toLowerCase(),
    fromAddresses,
    fromDomains,
    fromText: fromTextParts.join(" "),
    source: String(sourceEvent.source ?? "").toLowerCase(),
    workspace: String(sourceEvent.workspace ?? "").toLowerCase(),
    classificationBucket: String(classification.bucket ?? "").toLowerCase(),
    attachmentTypes: new Set(stringArray(mailSummary.attachment_types).map((value) => value.toLowerCase())),
    privateBodyText: String(event.body_text ?? "").toLowerCase(),
    privateBodyHtml: String(event.body_html ?? "").toLowerCase(),
    privateAttachmentNames: privateAttachmentNameParts.join(" "),
    normalizedPrivateBodyText: normalizeIdentifierText(event.body_text),
    normalizedPrivateBodyHtml: normalizeIdentifierText(event.body_html),
    normalizedPrivateAttachmentNames: normalizeIdentifierText(privateAttachmentNameParts.join(" ")),
    privateAttachmentMimes,
  };
}

function matchPrivateNormalizedIdentifiers(context, identifiers) {
  const normalizedIdentifiers = identifiers
    .map((identifier) => ({
      ...identifier,
      normalizedValue: normalizeIdentifierText(identifier.value),
    }))
    .filter((identifier) => identifier.normalizedValue);
  if (normalizedIdentifiers.length === 0) {
    return {
      required: false,
      matched: true,
      matchedOn: [],
      reasonCodes: [],
    };
  }

  const privateFields = [
    ["body", context.normalizedPrivateBodyText],
    ["html", context.normalizedPrivateBodyHtml],
    ["attachment_names", context.normalizedPrivateAttachmentNames],
  ];
  const matchedOn = new Set();
  const reasonCodes = new Set();

  for (const identifier of normalizedIdentifiers) {
    for (const [surface, value] of privateFields) {
      if (containsNormalizedIdentifier(value, identifier.normalizedValue)) {
        matchedOn.add(surface);
        reasonCodes.add(identifier.reasonCode);
      }
    }
  }

  return {
    required: true,
    matched: matchedOn.size > 0,
    matchedOn: [...matchedOn],
    reasonCodes: [...reasonCodes],
  };
}

function containsNormalizedIdentifier(value, identifier) {
  if (!value || !identifier) {
    return false;
  }
  return ` ${value} `.includes(` ${identifier} `);
}

function normalizeIdentifierText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stringArray(value) {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

function stringOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function confidenceOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return stringOrNull(value);
}

function requireString(value, field) {
  const text = stringOrNull(value);
  if (!text) {
    throw new Error(`missing required field: ${field}`);
  }
  return text;
}

function resolveRepoPath(repoRoot, value) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new Error("missing path value");
  }
  if (path.isAbsolute(raw)) {
    return raw;
  }
  return path.resolve(repoRoot, raw);
}
