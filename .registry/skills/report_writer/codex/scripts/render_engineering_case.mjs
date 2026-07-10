#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SCHEMA_VERSION = "soulforge.engineering_case_model.v0";
const ROLE_ORDER = [
  "decision",
  "impact",
  "core_evidence",
  "alternatives",
  "recommendation",
  "risk_execution",
  "technical_appendix",
];
const LEXICAL_IM_ALLOWLIST = ["움직임", "흔들림", "책임", "모임"];
const NUMERIC_GRAMMAR =
  /\d{4}-\d{2}-\d{2}|[knKN]=[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|±[ \t]*[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?(?:[ \t]*(?:%|개월|시간|만원|점|식|건|회|개|명|대|장|일|주|년|분|초|원|[A-Za-zµμ°℃Ω]+(?:\/[A-Za-zµμ°℃Ω]+)*))?|(?:[<>≤≥]=?[ \t]*)?[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?(?:[ \t]*(?:~|–|—|-|to)[ \t]*[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?)?(?:[ \t]*(?:%|개월|시간|만원|점|식|건|회|개|명|대|장|일|주|년|분|초|원|[A-Za-zµμ°℃Ω]+(?:\/[A-Za-zµμ°℃Ω]+)*))?/g;

class CaseModelError extends Error {
  constructor(blockers) {
    super("engineering_case_model_validation_failed");
    this.name = "CaseModelError";
    this.blockers = blockers;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (isObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function blocker(code, at, detail = undefined) {
  return detail === undefined ? { code, at } : { code, at, detail };
}

function requireString(blockers, value, at) {
  if (typeof value !== "string" || value.trim() === "") {
    blockers.push(blocker("required_nonempty_string", at));
  }
}

function requireArray(blockers, value, at, { min = 0 } = {}) {
  if (!Array.isArray(value)) {
    blockers.push(blocker("required_array", at));
    return false;
  }
  if (value.length < min) blockers.push(blocker("array_too_short", at, { min }));
  return true;
}

function requireUniqueIds(blockers, items, at) {
  if (!Array.isArray(items)) return;
  const seen = new Set();
  for (let index = 0; index < items.length; index += 1) {
    const id = items[index]?.id;
    requireString(blockers, id, `${at}[${index}].id`);
    if (typeof id === "string" && id.trim() !== "") {
      if (seen.has(id)) blockers.push(blocker("duplicate_id", `${at}[${index}].id`));
      seen.add(id);
    }
  }
}

function collectStrings(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => collectStrings(entry, output));
  else if (isObject(value)) Object.values(value).forEach((entry) => collectStrings(entry, output));
  return output;
}

function stripTerminalPunctuation(text) {
  return text.trim().replace(/[\s.!?…。,”’"'`)\]}*_]+$/u, "");
}

function findForbiddenIm(strings) {
  const findings = [];
  strings.forEach((text, index) => {
    text.split(/(?:\r?\n|[.!?。]+[ \t]*)/u).forEach((line, lineIndex) => {
      const terminal = stripTerminalPunctuation(line);
      const match = terminal.match(/([가-힣]+임)$/u);
      if (!match) return;
      if (LEXICAL_IM_ALLOWLIST.some((word) => match[1].endsWith(word))) return;
      findings.push({ string_index: index, line_index: lineIndex });
    });
  });
  return findings;
}

function judgmentEndingMatches(judgment) {
  const terminal = stripTerminalPunctuation(judgment.text ?? "");
  const patterns = {
    confirmed_fact: /(확인되었다|확인됨|확인)$/u,
    analysis_result: /(분석되었다|나타났다)$/u,
    sourced_judgment: /판단된다$/u,
    bounded_tentative: /(볼 수 있다|어려울 수 있다)$/u,
    exceptional_softening: /사료된다$/u,
  };
  return Boolean(patterns[judgment.strength]?.test(terminal));
}

function extractNumericTokens(value) {
  const tokens = new Set();
  for (const text of collectStrings(value)) {
    for (const match of text.matchAll(NUMERIC_GRAMMAR)) {
      const token = match[0].replace(/\s+/gu, "").replace(/–|—/gu, "-");
      if (token !== "") tokens.add(token);
    }
  }
  return [...tokens].sort();
}

function diffTokens(expected, actual) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  return {
    missing: expected.filter((token) => !actualSet.has(token)),
    unexpected: actual.filter((token) => !expectedSet.has(token)),
  };
}

function validateTradeStudy(model, blockers) {
  const trade = model.trade_study;
  if (model.report_type !== "trade_study") {
    if (trade !== null && trade !== undefined) {
      blockers.push(blocker("trade_study_only_allowed_for_trade_study_report", "trade_study"));
    }
    return null;
  }
  if (!isObject(trade)) {
    blockers.push(blocker("trade_study_required", "trade_study"));
    return null;
  }
  if (trade.scoring_method !== "weighted_sum_0_to_100") {
    blockers.push(blocker("unsupported_scoring_method", "trade_study.scoring_method"));
  }
  if (trade.weight_scale !== 100) {
    blockers.push(blocker("weight_scale_must_equal_100", "trade_study.weight_scale"));
  }
  requireArray(blockers, trade.criteria, "trade_study.criteria", { min: 2 });
  requireArray(blockers, trade.alternatives, "trade_study.alternatives", { min: 2 });
  requireUniqueIds(blockers, trade.criteria, "trade_study.criteria");
  requireUniqueIds(blockers, trade.alternatives, "trade_study.alternatives");
  const criteria = Array.isArray(trade.criteria) ? trade.criteria : [];
  const alternatives = Array.isArray(trade.alternatives) ? trade.alternatives : [];
  const weightSum = criteria.reduce((sum, criterion, index) => {
    requireString(blockers, criterion?.label, `trade_study.criteria[${index}].label`);
    if (typeof criterion?.weight !== "number" || !Number.isFinite(criterion.weight)) {
      blockers.push(blocker("criterion_weight_must_be_finite_number", `trade_study.criteria[${index}].weight`));
      return sum;
    }
    return sum + criterion.weight;
  }, 0);
  if (Math.abs(weightSum - 100) > 1e-9) {
    blockers.push(blocker("criterion_weights_must_sum_to_100", "trade_study.criteria"));
  }
  const criterionIds = criteria.map((criterion) => criterion.id).filter(Boolean);
  const derivedTotals = [];
  alternatives.forEach((alternative, alternativeIndex) => {
    requireString(blockers, alternative?.label, `trade_study.alternatives[${alternativeIndex}].label`);
    if (!isObject(alternative?.scores)) {
      blockers.push(blocker("alternative_scores_required", `trade_study.alternatives[${alternativeIndex}].scores`));
      return;
    }
    const scoreKeys = Object.keys(alternative.scores).sort();
    if (stableStringify(scoreKeys) !== stableStringify([...criterionIds].sort())) {
      blockers.push(blocker("alternative_scores_must_cover_every_criterion_once", `trade_study.alternatives[${alternativeIndex}].scores`));
      return;
    }
    let total = 0;
    criteria.forEach((criterion) => {
      const score = alternative.scores[criterion.id];
      if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) {
        blockers.push(blocker("score_must_be_finite_0_to_100", `trade_study.alternatives[${alternativeIndex}].scores.${criterion.id}`));
        return;
      }
      total += (criterion.weight * score) / 100;
    });
    const rounded = Number(total.toFixed(6));
    derivedTotals.push({ alternative_id: alternative.id, weighted_total: rounded });
    if (typeof alternative.declared_total === "number" && Math.abs(alternative.declared_total - rounded) > 1e-6) {
      blockers.push(blocker("declared_total_mismatch", `trade_study.alternatives[${alternativeIndex}].declared_total`));
    }
  });
  if (trade.recommendation_authorized_by_model !== true) {
    blockers.push(blocker("recommendation_rule_must_be_explicitly_authorized", "trade_study.recommendation_authorized_by_model"));
  }
  if (!isObject(trade.recommendation)) {
    blockers.push(blocker("trade_recommendation_required", "trade_study.recommendation"));
  } else {
    requireString(blockers, trade.recommendation.alternative_id, "trade_study.recommendation.alternative_id");
    requireString(blockers, trade.recommendation.rationale, "trade_study.recommendation.rationale");
    requireString(blockers, trade.recommendation.residual_risk, "trade_study.recommendation.residual_risk");
    if (!alternatives.some((alternative) => alternative.id === trade.recommendation.alternative_id)) {
      blockers.push(blocker("recommended_alternative_not_found", "trade_study.recommendation.alternative_id"));
    }
  }
  return derivedTotals;
}

function validateStoryline(model, blockers) {
  const slides = model.storyline?.slides;
  if (!requireArray(blockers, slides, "storyline.slides", { min: 5 })) return;
  requireUniqueIds(blockers, slides, "storyline.slides");
  const requiredRoles = model.report_type === "trade_study"
    ? ["decision", "impact", "core_evidence", "alternatives", "recommendation", "risk_execution"]
    : ["decision", "impact", "core_evidence", "recommendation", "risk_execution"];
  const roles = slides.map((slide) => slide?.role);
  if (stableStringify(roles) !== stableStringify(requiredRoles)) {
    blockers.push(blocker("storyline_roles_or_order_invalid", "storyline.slides"));
  }
  const judgmentIds = new Set(["decision", ...(model.judgments ?? []).map((item) => item.id)]);
  slides.forEach((slide, index) => {
    requireString(blockers, slide?.title, `storyline.slides[${index}].title`);
    requireString(blockers, slide?.judgment_id, `storyline.slides[${index}].judgment_id`);
    if (typeof slide?.judgment_id === "string" && !judgmentIds.has(slide.judgment_id)) {
      blockers.push(blocker("slide_judgment_id_not_found", `storyline.slides[${index}].judgment_id`));
    }
    if (!ROLE_ORDER.includes(slide?.role)) {
      blockers.push(blocker("unsupported_slide_role", `storyline.slides[${index}].role`));
    }
    if (requireArray(blockers, slide?.title_binding_terms, `storyline.slides[${index}].title_binding_terms`, { min: 1 })) {
      const boundSource = slide?.judgment_id === "decision"
        ? collectStrings(model.decision ?? {}).join("\n")
        : collectStrings((model.judgments ?? []).find((item) => item.id === slide?.judgment_id) ?? {}).join("\n");
      slide.title_binding_terms.forEach((term, termIndex) => {
        const at = `storyline.slides[${index}].title_binding_terms[${termIndex}]`;
        requireString(blockers, term, at);
        if (typeof term !== "string" || term.trim() === "") return;
        if (!slide.title?.includes(term)) blockers.push(blocker("title_binding_term_missing_from_title", at));
        if (!boundSource.includes(term)) blockers.push(blocker("title_binding_term_missing_from_judgment", at));
      });
    }
  });
  const evidenceIndex = roles.indexOf("core_evidence");
  const midpointIndex = Math.floor((roles.length - 1) / 2);
  if (evidenceIndex < 0 || evidenceIndex > midpointIndex) {
    blockers.push(blocker("decision_and_core_evidence_must_complete_by_midpoint", "storyline.slides"));
  }
}

function validateModel(model) {
  const blockers = [];
  if (!isObject(model)) return { blockers: [blocker("root_must_be_object", "$root")], derivedTotals: null };
  if (model.schema_version !== SCHEMA_VERSION) blockers.push(blocker("unsupported_schema_version", "schema_version"));
  for (const field of ["case_id", "revision", "report_type", "title", "audience", "purpose"]) {
    requireString(blockers, model[field], field);
  }
  if (!isObject(model.decision)) blockers.push(blocker("decision_object_required", "decision"));
  else {
    for (const field of ["request", "statement", "verdict", "basis_ref"]) {
      requireString(blockers, model.decision[field], `decision.${field}`);
    }
  }
  for (const [field, min] of [["evidence", 1], ["terminology", 1], ["judgments", 1], ["limitations", 1], ["actions", 1]]) {
    requireArray(blockers, model[field], field, { min });
    requireUniqueIds(blockers, model[field], field);
  }
  requireArray(blockers, model.figures, "figures");
  requireUniqueIds(blockers, model.figures, "figures");
  (model.evidence ?? []).forEach((entry, index) => {
    for (const field of ["label", "value", "unit", "comparator", "basis", "range", "tolerance", "sample_size", "uncertainty", "source_ref"]) {
      requireString(blockers, entry?.[field], `evidence[${index}].${field}`);
    }
  });
  (model.terminology ?? []).forEach((entry, index) => requireString(blockers, entry?.label, `terminology[${index}].label`));
  (model.judgments ?? []).forEach((entry, index) => {
    requireString(blockers, entry?.text, `judgments[${index}].text`);
    requireString(blockers, entry?.strength, `judgments[${index}].strength`);
    requireArray(blockers, entry?.source_refs, `judgments[${index}].source_refs`, { min: 1 });
    if (typeof entry?.text === "string" && typeof entry?.strength === "string" && !judgmentEndingMatches(entry)) {
      blockers.push(blocker("judgment_ending_does_not_match_strength", `judgments[${index}]`));
    }
  });
  (model.limitations ?? []).forEach((entry, index) => {
    requireString(blockers, entry?.text, `limitations[${index}].text`);
    requireString(blockers, entry?.status, `limitations[${index}].status`);
    requireString(blockers, entry?.close_condition, `limitations[${index}].close_condition`);
    if (!new Set(["confirmed", "unconfirmed"]).has(entry?.status)) {
      blockers.push(blocker("limitation_status_invalid", `limitations[${index}].status`));
    }
  });
  (model.actions ?? []).forEach((entry, index) => {
    for (const field of ["text", "owner", "due"]) requireString(blockers, entry?.[field], `actions[${index}].${field}`);
  });
  (model.figures ?? []).forEach((entry, index) => {
    for (const field of ["caption", "alt_text", "source_ref"]) requireString(blockers, entry?.[field], `figures[${index}].${field}`);
  });
  const anonymization = model.anonymization;
  if (!isObject(anonymization) || anonymization.enabled !== true) {
    blockers.push(blocker("explicit_anonymization_config_required", "anonymization"));
  } else {
    requireArray(blockers, anonymization.required_categories, "anonymization.required_categories", { min: 1 });
    requireArray(blockers, anonymization.mappings, "anonymization.mappings", { min: 1 });
    requireUniqueIds(blockers, anonymization.mappings, "anonymization.mappings");
    const categories = new Set();
    (anonymization.mappings ?? []).forEach((mapping, index) => {
      for (const field of ["category", "from", "to"]) requireString(blockers, mapping?.[field], `anonymization.mappings[${index}].${field}`);
      if (mapping?.from === mapping?.to) blockers.push(blocker("anonymization_source_and_target_must_differ", `anonymization.mappings[${index}]`));
      if (typeof mapping?.category === "string") categories.add(mapping.category);
    });
    for (const category of anonymization.required_categories ?? []) {
      if (!categories.has(category)) blockers.push(blocker("required_anonymization_category_missing", "anonymization.required_categories"));
    }
  }
  validateStoryline(model, blockers);
  const derivedTotals = validateTradeStudy(model, blockers);
  const softeningCount = collectStrings(model)
    .reduce((count, text) => count + (text.match(/사료된다/gu)?.length ?? 0), 0);
  if (softeningCount > 1) blockers.push(blocker("exceptional_softening_may_appear_at_most_once", "$text"));
  return { blockers, derivedTotals };
}

function applyAnonymization(model) {
  const mappings = [...model.anonymization.mappings]
    .sort((a, b) => b.from.length - a.from.length)
    .map((mapping) => ({ ...mapping, replacement_count: 0 }));
  const mappingStats = mappings.map(({ id, category }) => ({ id, category, replacement_count: 0 }));
  const statsById = new Map(mappingStats.map((entry) => [entry.id, entry]));
  const replace = (text) => {
    let output = text;
    for (const mapping of mappings) {
      const count = output.split(mapping.from).length - 1;
      if (count > 0) {
        mapping.replacement_count += count;
        statsById.get(mapping.id).replacement_count += count;
        output = output.split(mapping.from).join(mapping.to);
      }
    }
    return output;
  };
  const mapValue = (value) => {
    if (typeof value === "string") return replace(value);
    if (Array.isArray(value)) return value.map(mapValue);
    if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapValue(item)]));
    return value;
  };
  return {
    sanitize: mapValue,
    mappingStats,
    sourceLabels: mappings.map(({ id, from }) => ({ id, from })),
  };
}

function buildSharedModel(model, derivedTotals, sanitize) {
  const trade = model.trade_study === null || model.trade_study === undefined
    ? null
    : { ...model.trade_study, derived_totals: derivedTotals };
  return sanitize({
    case_id: model.case_id,
    revision: model.revision,
    report_type: model.report_type,
    title: model.title,
    audience: model.audience,
    purpose: model.purpose,
    decision: model.decision,
    evidence: model.evidence,
    terminology: model.terminology,
    judgments: model.judgments,
    limitations: model.limitations,
    actions: model.actions,
    figures: model.figures,
    storyline: model.storyline,
    trade_study: trade,
  });
}

function evidenceLine(item) {
  return `- ${item.label}: ${item.value} ${item.unit}; 비교 ${item.comparator} ${item.basis}; 범위 ${item.range}; 허용/공차 ${item.tolerance}; 표본 ${item.sample_size}; 불확도 ${item.uncertainty}; 출처 ${item.source_ref}`;
}

function actionLine(item) {
  return `- ${item.text} — 책임 주체: ${item.owner}; 기한 ${item.due}`;
}

function limitationLine(item) {
  return `- [${item.status}] ${item.text} — 확정 조건 ${item.close_condition}`;
}

function renderTradeMatrix(trade) {
  if (!trade) return [];
  const lines = [
    "### 평가 기준",
    "",
    "| 기준 ID | 기준 | 가중치 |",
    "| --- | --- | ---: |",
    ...trade.criteria.map((criterion) => `| ${criterion.id} | ${criterion.label} | ${criterion.weight}% |`),
    "",
    "### 대안 비교",
    "",
    `산식: ${trade.scoring_method}; 가중치 척도 ${trade.weight_scale}`,
    "",
    "| 대안 ID | 대안 | 기준별 점수 | 가중총점 |",
    "| --- | --- | --- | ---: |",
  ];
  const totals = new Map(trade.derived_totals.map((entry) => [entry.alternative_id, entry.weighted_total]));
  trade.alternatives.forEach((alternative) => {
    const scores = trade.criteria.map((criterion) => `${criterion.id}=${alternative.scores[criterion.id]}`).join(", ");
    lines.push(`| ${alternative.id} | ${alternative.label} | ${scores} | ${totals.get(alternative.id)} |`);
  });
  return lines;
}

function renderTradeTables(trade) {
  if (!trade) return [];
  return [
    ...renderTradeMatrix(trade),
    "",
    `권고: ${trade.recommendation.alternative_id} — ${trade.recommendation.rationale}`,
    "",
    `잔여 위험: ${trade.recommendation.residual_risk}`,
  ];
}

function renderReport(shared) {
  const lines = [
    `# ${shared.title}`,
    "",
    `- 대상 독자: ${shared.audience}`,
    `- 판정: ${shared.decision.verdict} — 근거 ${shared.decision.basis_ref}`,
    `- 요청: ${shared.decision.request}`,
    "",
    "## 판정·요청",
    "",
    shared.decision.statement,
    "",
    "## 핵심 근거 수치",
    "",
    ...shared.evidence.map(evidenceLine),
    "",
    "## 상세 본문",
    "",
    "### 현황·수치",
    "",
    shared.purpose,
    "",
    ...shared.evidence.map(evidenceLine),
    "",
    "### 문제점·판정",
    "",
    ...shared.judgments.map((item) => `- ${item.text} — 근거 ${item.source_refs.join(", ")}`),
    "",
    ...renderTradeTables(shared.trade_study),
    "",
    "### 개선방향·조치",
    "",
    ...shared.actions.map(actionLine),
    "",
    "## 한계·미확정",
    "",
    ...shared.limitations.map(limitationLine),
    "",
    "## 다음 조치",
    "",
    ...shared.actions.map(actionLine),
    "",
    "## 그림 캡션·대체 텍스트",
    "",
    ...(shared.figures.length > 0
      ? shared.figures.map((item) => `- ${item.id}: ${item.caption}; 대체 텍스트 ${item.alt_text}; 출처 ${item.source_ref}`)
      : ["- 미적용"]),
    "",
    "## 용어",
    "",
    ...shared.terminology.map((item) => `- ${item.id}: ${item.label}`),
    "",
  ];
  return lines.join("\n");
}

function boundJudgmentLine(shared, slide) {
  if (slide.judgment_id === "decision") return shared.decision.statement;
  const judgment = shared.judgments.find((item) => item.id === slide.judgment_id);
  return judgment ? `${judgment.text} — 근거 ${judgment.source_refs.join(", ")}` : "";
}

function slideBody(shared, slide) {
  const role = slide.role;
  const linkedJudgment = boundJudgmentLine(shared, slide);
  if (role === "decision") {
    return [shared.decision.statement, `판정 ${shared.decision.verdict} — 근거 ${shared.decision.basis_ref}`, `요청 ${shared.decision.request}`];
  }
  if (role === "impact") {
    return [linkedJudgment];
  }
  if (role === "core_evidence") {
    return [
      linkedJudgment,
      ...shared.evidence.map(evidenceLine),
      ...shared.figures.map((item) => `- ${item.caption}; 대체 텍스트 ${item.alt_text}; 출처 ${item.source_ref}`),
      ...shared.terminology.map((item) => `- 용어 ${item.id}: ${item.label}`),
    ];
  }
  if (role === "alternatives") return [linkedJudgment, ...renderTradeMatrix(shared.trade_study)];
  if (role === "recommendation") {
    return [
      shared.decision.statement,
      ...(shared.trade_study
        ? [`권고 ${shared.trade_study.recommendation.alternative_id} — ${shared.trade_study.recommendation.rationale}`]
        : shared.actions.map(actionLine)),
    ];
  }
  if (role === "risk_execution") {
    return [
      linkedJudgment,
      ...shared.limitations.map(limitationLine),
      ...(shared.trade_study ? [`잔여 위험 ${shared.trade_study.recommendation.residual_risk}`] : []),
      ...shared.actions.map(actionLine),
    ];
  }
  return [];
}

function renderPptStoryline(shared) {
  const lines = [`# ${shared.title} — PPT 스토리라인`, "", `- 대상 독자: ${shared.audience}`, ""];
  shared.storyline.slides.forEach((slide) => {
    lines.push(`## ${slide.title}`, "", `- 역할: ${slide.role}`, `- 판단 ID: ${slide.judgment_id}`, ...slideBody(shared, slide), "");
  });
  return lines.join("\n");
}

function numericSourceSubset(shared) {
  return [
    shared.title,
    shared.audience,
    shared.purpose,
    shared.decision.request,
    shared.decision.statement,
    shared.decision.verdict,
    shared.decision.basis_ref,
    ...shared.evidence.map(evidenceLine),
    ...shared.judgments.map((item) => `${item.text} — 근거 ${item.source_refs.join(", ")}`),
    ...shared.limitations.map(limitationLine),
    ...shared.actions.map(actionLine),
    ...shared.figures.map((item) => `${item.caption}; 대체 텍스트 ${item.alt_text}; 출처 ${item.source_ref}`),
    ...renderTradeTables(shared.trade_study),
  ];
}

function verifyArtifacts({ modelIdentity, shared, reportMarkdown, pptMarkdown, reportProjection, pptProjection, sourceLabels, mappingStats }) {
  const blockers = [];
  if (stableStringify(reportProjection.model_identity) !== stableStringify(modelIdentity)) {
    blockers.push(blocker("report_model_identity_mismatch", "report_projection.model_identity"));
  }
  if (stableStringify(pptProjection.model_identity) !== stableStringify(modelIdentity)) {
    blockers.push(blocker("ppt_model_identity_mismatch", "ppt_projection.model_identity"));
  }
  if (stableStringify(reportProjection.shared) !== stableStringify(shared)) {
    blockers.push(blocker("model_to_report_projection_mismatch", "report_projection.shared"));
  }
  if (stableStringify(pptProjection.shared) !== stableStringify(shared)) {
    blockers.push(blocker("model_to_ppt_projection_mismatch", "ppt_projection.shared"));
  }
  if (stableStringify(reportProjection.shared) !== stableStringify(pptProjection.shared)) {
    blockers.push(blocker("cross_projection_shared_content_mismatch", "report_projection.shared"));
  }
  const numericSource = numericSourceSubset(shared);
  const allowedTokens = extractNumericTokens([
    ...numericSource,
    ...shared.storyline.slides.map((slide) => slide.title),
  ]);
  const requiredTokens = extractNumericTokens(numericSource);
  const reportTokens = extractNumericTokens(reportMarkdown);
  const pptTokens = extractNumericTokens(pptMarkdown);
  const reportRequiredDiff = diffTokens(requiredTokens, reportTokens);
  const pptRequiredDiff = diffTokens(requiredTokens, pptTokens);
  const reportAllowedDiff = diffTokens(allowedTokens, reportTokens);
  const pptAllowedDiff = diffTokens(allowedTokens, pptTokens);
  if (reportRequiredDiff.missing.length > 0) blockers.push(blocker("report_required_numeric_token_missing", "report.md", { count: reportRequiredDiff.missing.length }));
  if (pptRequiredDiff.missing.length > 0) blockers.push(blocker("ppt_required_numeric_token_missing", "ppt_storyline.md", { count: pptRequiredDiff.missing.length }));
  if (reportAllowedDiff.unexpected.length > 0) blockers.push(blocker("report_untraceable_numeric_token", "report.md", { count: reportAllowedDiff.unexpected.length }));
  if (pptAllowedDiff.unexpected.length > 0) blockers.push(blocker("ppt_untraceable_numeric_token", "ppt_storyline.md", { count: pptAllowedDiff.unexpected.length }));
  const forbiddenReport = findForbiddenIm([reportMarkdown]);
  const forbiddenPpt = findForbiddenIm([pptMarkdown]);
  if (forbiddenReport.length > 0) blockers.push(blocker("forbidden_copular_im_in_report", "report.md", { count: forbiddenReport.length }));
  if (forbiddenPpt.length > 0) blockers.push(blocker("forbidden_copular_im_in_ppt", "ppt_storyline.md", { count: forbiddenPpt.length }));
  const emittedText = [reportMarkdown, pptMarkdown, stableStringify(reportProjection), stableStringify(pptProjection)];
  sourceLabels.forEach(({ id, from }) => {
    if (emittedText.some((text) => text.includes(from))) {
      blockers.push(blocker("anonymization_source_label_remains", "emitted_artifacts", { mapping_id: id }));
    }
  });
  return {
    blockers,
    numeric: {
      grammar: "signed_decimal_thousands_scientific_range_inequality_plusminus_percent_k_n_date_unit",
      allowed_token_count: allowedTokens.length,
      required_token_count: requiredTokens.length,
      report_token_count: reportTokens.length,
      ppt_token_count: pptTokens.length,
      report_missing_count: reportRequiredDiff.missing.length,
      report_untraceable_count: reportAllowedDiff.unexpected.length,
      ppt_missing_count: pptRequiredDiff.missing.length,
      ppt_untraceable_count: pptAllowedDiff.unexpected.length,
      raw_tokens_redacted: true,
    },
    anonymization: {
      mappings: mappingStats,
      original_labels_reported: false,
      all_emitted_text_surfaces_scanned: true,
    },
  };
}

export function renderEngineeringCase(model) {
  const canonicalInput = stableStringify(model);
  const modelIdentity = {
    schema_version: model?.schema_version ?? null,
    case_id: model?.case_id ?? null,
    revision: model?.revision ?? null,
    model_sha256: sha256(canonicalInput),
  };
  const { blockers: modelBlockers, derivedTotals } = validateModel(model);
  if (modelBlockers.length > 0) throw new CaseModelError(modelBlockers);
  const { sanitize, mappingStats, sourceLabels } = applyAnonymization(model);
  const shared = buildSharedModel(model, derivedTotals, sanitize);
  const forbiddenModel = findForbiddenIm(collectStrings(shared));
  if (forbiddenModel.length > 0) {
    throw new CaseModelError([blocker("forbidden_copular_im_in_case_model", "$text", { count: forbiddenModel.length })]);
  }
  const reportMarkdown = renderReport(shared);
  const pptMarkdown = renderPptStoryline(shared);
  const reportProjection = { kind: "engineering_report_projection", model_identity: modelIdentity, shared };
  const pptProjection = { kind: "engineering_ppt_storyline_projection", model_identity: modelIdentity, shared };
  const verification = verifyArtifacts({
    modelIdentity,
    shared,
    reportMarkdown,
    pptMarkdown,
    reportProjection,
    pptProjection,
    sourceLabels,
    mappingStats,
  });
  const consistencyReport = {
    schema_version: "soulforge.engineering_projection_consistency.v0",
    status: verification.blockers.length === 0 ? "pass" : "fail",
    scope: "deterministic_mechanical_integrity_only",
    acceptance_claim: "fresh_semantic_verification_required",
    production_ready: false,
    model_identity: modelIdentity,
    checks: {
      model_to_report: verification.blockers.every((item) => !item.code.startsWith("report_") && item.code !== "model_to_report_projection_mismatch"),
      model_to_ppt: verification.blockers.every((item) => !item.code.startsWith("ppt_") && item.code !== "model_to_ppt_projection_mismatch"),
      report_to_ppt_shared_content: !verification.blockers.some((item) => item.code === "cross_projection_shared_content_mismatch"),
      storyline_title_binding_terms: true,
      v03_register_and_copular_im: !verification.blockers.some((item) => item.code.includes("copular_im")),
      anonymization_all_text_surfaces: !verification.blockers.some((item) => item.code.includes("anonymization")),
      numeric_signature_fail_closed: !verification.blockers.some((item) => item.code.includes("numeric_token")),
    },
    numeric: verification.numeric,
    anonymization: verification.anonymization,
    declared_calculations: model.report_type === "trade_study" ? ["weighted_sum_0_to_100"] : [],
    blockers: verification.blockers,
    raw_private_labels_included: false,
  };
  if (verification.blockers.length > 0) throw new CaseModelError(verification.blockers);
  return { modelIdentity, reportMarkdown, pptMarkdown, reportProjection, pptProjection, consistencyReport };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") args.help = true;
    else if (token === "--input" || token === "--out") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new CaseModelError([blocker("cli_option_value_required", token)]);
      args[token.slice(2)] = value;
      index += 1;
    } else throw new CaseModelError([blocker("unsupported_cli_argument", token)]);
  }
  return args;
}

function helpText() {
  return [
    "Render one frozen Engineering Case Model into consistent report and PPT-storyline Markdown projections.",
    "",
    "Usage:",
    "  node render_engineering_case.mjs --input <case_model.json> --out <output_dir>",
    "  node render_engineering_case.mjs --help",
    "",
    "Outputs:",
    "  report.md",
    "  ppt_storyline.md",
    "  report_projection.json",
    "  ppt_projection.json",
    "  consistency_report.json",
    "",
    "The command fails closed and still writes a redacted consistency_report.json when --out is known.",
    "Binary DOCX/PPTX rendering is outside this command's scope.",
  ].join("\n");
}

function redactedFailureReport(error, identity = null) {
  return {
    schema_version: "soulforge.engineering_projection_consistency.v0",
    status: "fail",
    model_identity: identity,
    checks: {},
    numeric: { raw_tokens_redacted: true },
    anonymization: { original_labels_reported: false },
    blockers: error instanceof CaseModelError ? error.blockers : [blocker("unexpected_renderer_failure", "$runtime")],
    raw_private_labels_included: false,
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(redactedFailureReport(error), null, 2)}\n`);
    return 1;
  }
  if (args.help) {
    process.stdout.write(`${helpText()}\n`);
    return 0;
  }
  if (!args.input || !args.out) {
    const error = new CaseModelError([blocker("input_and_out_are_required", "$cli")]);
    process.stderr.write(`${JSON.stringify(redactedFailureReport(error), null, 2)}\n`);
    return 1;
  }
  let model = null;
  let identity = null;
  try {
    await mkdir(args.out, { recursive: true });
    const raw = await readFile(args.input, "utf8");
    model = JSON.parse(raw);
    identity = {
      schema_version: model?.schema_version ?? null,
      case_id: model?.case_id ?? null,
      revision: model?.revision ?? null,
      model_sha256: sha256(stableStringify(model)),
    };
    const rendered = renderEngineeringCase(model);
    await Promise.all([
      writeFile(path.join(args.out, "report.md"), rendered.reportMarkdown, "utf8"),
      writeFile(path.join(args.out, "ppt_storyline.md"), rendered.pptMarkdown, "utf8"),
      writeFile(path.join(args.out, "report_projection.json"), `${JSON.stringify(rendered.reportProjection, null, 2)}\n`, "utf8"),
      writeFile(path.join(args.out, "ppt_projection.json"), `${JSON.stringify(rendered.pptProjection, null, 2)}\n`, "utf8"),
      writeFile(path.join(args.out, "consistency_report.json"), `${JSON.stringify(rendered.consistencyReport, null, 2)}\n`, "utf8"),
    ]);
    process.stdout.write(`${JSON.stringify({ status: "pass", model_identity: rendered.modelIdentity, output_dir: args.out }, null, 2)}\n`);
    return 0;
  } catch (error) {
    const report = redactedFailureReport(error, identity);
    try {
      await mkdir(args.out, { recursive: true });
      await writeFile(path.join(args.out, "consistency_report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    } catch {
      // The CLI still returns the redacted failure on stderr when the output path is unavailable.
    }
    process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  process.exitCode = await runCli();
}

export {
  CaseModelError,
  applyAnonymization,
  buildSharedModel,
  extractNumericTokens,
  numericSourceSubset,
  renderReport,
  validateModel,
  verifyArtifacts,
};
