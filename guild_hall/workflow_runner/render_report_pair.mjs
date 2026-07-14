import { sha256Bytes, sha256Canonical } from "./canonical.mjs";
import { validateReportDocument } from "./contract.mjs";

const REPORT_TYPE_LABELS = Object.freeze({ experiment: "시험·실험", analysis: "분석·대안 검토", progress: "진행·성과", presentation: "브리핑", other: "기타" });
const AUDIENCE_LABELS = Object.freeze({ internal_review: "내부 검토", management: "경영진", customer: "고객", regulator: "규제기관", other: "기타" });
const CLAIM_LABELS = Object.freeze({ observed: "관찰 범위", source_supported: "자료가 지지하는 범위", rejected_or_blocked: "기각 또는 보류" });
const SOURCE_STATUS_LABELS = Object.freeze({ complete: "완전", partial: "부분", unconfirmed: "미확인" });
const CONCLUSION_ROLES = new Set(["conclusion_verdict", "conclusion_recommendation", "bounded_conclusion_decision_status", "recommendation_next", "status_summary"]);
const NEXT_ACTION_ROLES = new Set(["next_actions", "decision_ask_next_actions", "decision_support_requests", "recommendation_next"]);
const COMPACT_INTERNAL_PROGRESS_ROLES = Object.freeze(["status_summary", "issues_risks_dependencies", "next_actions"]);

function isCompactInternalProgress(document) {
  return document.report_type === "progress"
    && document.audience === "internal_review"
    && document.sections.length === COMPACT_INTERNAL_PROGRESS_ROLES.length
    && document.sections.every((section, index) => section.role === COMPACT_INTERNAL_PROGRESS_ROLES[index]);
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function escapeMarkdownInline(value) {
  return String(value)
    .replaceAll("\\", "\\\\").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll("`", "\\`").replaceAll("*", "\\*").replaceAll("_", "\\_").replaceAll("[", "\\[")
    .replaceAll("]", "\\]").replaceAll("#", "\\#").replaceAll("\r", " ").replaceAll("\n", "<br>");
}

function escapeMarkdownTable(value) {
  return escapeMarkdownInline(value).replaceAll("|", "\\|");
}

function markdownBlock(block) {
  if (block.type === "paragraph") return escapeMarkdownInline(block.text);
  if (block.type === "bullets") return block.items.map((item) => `- ${escapeMarkdownInline(item.text)}`).join("\n");
  const headings = ["항목", ...block.columns.map((column) => column.unit ? `${column.heading} (${column.unit})` : column.heading)];
  const rows = block.rows.map((row) => {
    const cells = block.columns.map((column) => row.cells.find((cell) => cell.column_id === column.column_id).text);
    return `| ${[row.label, ...cells].map(escapeMarkdownTable).join(" | ")} |`;
  });
  return [`**${escapeMarkdownInline(block.caption)}**`, "", `| ${headings.map(escapeMarkdownTable).join(" | ")} |`, `| ${headings.map(() => "---").join(" | ")} |`, ...rows].join("\n");
}

function markdownReferences(references) {
  if (references.length === 0) return "";
  const rows = references.map((reference) => `| ${escapeMarkdownTable(reference.reference_id)} | ${escapeMarkdownTable(reference.label)} |`);
  return ["## 출처 및 추적성", "", "| ID | 자료 |", "| --- | --- |", ...rows].join("\n");
}

export function renderMarkdown(document) {
  validateReportDocument(document);
  const lines = [
    `# ${escapeMarkdownInline(document.title)}`, "", `- 보고서 ID: ${escapeMarkdownInline(document.report_id)}`,
    `- 프로젝트: ${escapeMarkdownInline(document.project_code)}`,
    ...(document.report_date === null ? [] : [`- 기준일: ${escapeMarkdownInline(document.report_date)}`]),
    `- 보고 유형: ${escapeMarkdownInline(REPORT_TYPE_LABELS[document.report_type])}`, `- 독자: ${escapeMarkdownInline(AUDIENCE_LABELS[document.audience])}`,
    `- 판단 범위: ${escapeMarkdownInline(CLAIM_LABELS[document.claim_ceiling])}`, `- 원천 기록 상태: ${escapeMarkdownInline(SOURCE_STATUS_LABELS[document.source_record_status])}`, "",
  ];
  for (const section of document.sections) {
    lines.push(`## ${escapeMarkdownInline(section.heading)}`, "");
    for (const block of section.blocks) lines.push(markdownBlock(block), "");
  }
  if (document.references.length) lines.push(markdownReferences(document.references), "");
  return `${lines.join("\n").replace(/\n{3,}/gu, "\n\n").trimEnd()}\n`;
}

function htmlBlock(block) {
  if (block.type === "paragraph") return `<p>${escapeHtml(block.text)}</p>`;
  if (block.type === "bullets") return `<ul>${block.items.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul>`;
  const header = ["항목", ...block.columns.map((column) => column.unit ? `${column.heading} (${column.unit})` : column.heading)];
  const rows = block.rows.map((row) => {
    const cells = block.columns.map((column) => row.cells.find((cell) => cell.column_id === column.column_id).text);
    return `<tr><th scope="row">${escapeHtml(row.label)}</th>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`;
  }).join("");
  return `<figure><figcaption>${escapeHtml(block.caption)}</figcaption><table><thead><tr>${header.map((item) => `<th scope="col">${escapeHtml(item)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></figure>`;
}

function blockPlainText(block) {
  if (block.type === "paragraph") return block.text;
  if (block.type === "bullets") return block.items.map((item) => item.text).join(" ");
  return [block.caption, ...block.rows.flatMap((row) => [row.label, ...row.cells.map((cell) => cell.text)])].join(" ");
}

function sectionPlainText(section) {
  return section ? section.blocks.map(blockPlainText).join(" ") : "해당 보고서 본문을 참조하십시오.";
}

function htmlVerdictCards(document) {
  const conclusion = document.sections.find((section) => CONCLUSION_ROLES.has(section.role));
  const nextAction = document.sections.find((section) => NEXT_ACTION_ROLES.has(section.role));
  const followUp = sectionPlainText(nextAction);
  return `<section class="verdict-grid" aria-label="판정 요약"><article class="verdict-card"><h2>주요 결론</h2><p>${escapeHtml(sectionPlainText(conclusion))}</p></article><article class="verdict-card"><h2>적용 범위</h2><p>판정 범위: ${escapeHtml(CLAIM_LABELS[document.claim_ceiling])}<br>원천 기록 상태: ${escapeHtml(SOURCE_STATUS_LABELS[document.source_record_status])}</p></article><article class="verdict-card"><h2>후속 확인 범위</h2><p>${escapeHtml(followUp)}</p></article></section>`;
}

function htmlEvidenceTable(document) {
  const entries = document.references.map((reference) => ({ id: reference.reference_id, label: reference.label }));
  if (entries.length === 0) return "";
  const rows = entries.map((entry) => `<tr><td>${escapeHtml(entry.id)}</td><td>${escapeHtml(entry.label)}</td></tr>`).join("");
  return `<section><h2>출처 및 추적성</h2><table><thead><tr><th scope="col">ID</th><th scope="col">자료</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function htmlNextActionTable(document) {
  const actions = [];
  for (const section of document.sections.filter((item) => NEXT_ACTION_ROLES.has(item.role))) {
    for (const block of section.blocks) {
      if (block.type === "paragraph") actions.push({ action: block.text, owner: "", due: "" });
      else if (block.type === "bullets") actions.push(...block.items.map((item) => ({ action: item.text, owner: "", due: "" })));
      else actions.push(...block.rows.map((row) => ({ action: `${block.caption}: ${row.label} — ${row.cells.map((cell) => cell.text).join(" / ")}`, owner: "", due: "" })));
    }
  }
  if (actions.length === 0) return "";
  const rows = actions.map((item) => `<tr><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.owner)}</td><td>${escapeHtml(item.due)}</td></tr>`).join("");
  return `<section><h2>후속 조치 표</h2><table><thead><tr><th scope="col">조치</th><th scope="col">담당</th><th scope="col">기한·트리거</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

export function renderHtml(document) {
  validateReportDocument(document);
  const sections = document.sections.map((section) => `<section data-role="${escapeHtml(section.role)}"><h2>${escapeHtml(section.heading)}</h2>${section.blocks.map(htmlBlock).join("")}</section>`).join("");
  const compactInternalProgress = isCompactInternalProgress(document);
  const decisionProjection = compactInternalProgress ? "" : htmlVerdictCards(document);
  const actionProjection = compactInternalProgress ? "" : htmlNextActionTable(document);
  const reportDate = document.report_date === null ? "" : `<div><strong>기준일</strong><br>${escapeHtml(document.report_date)}</div>`;
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(document.title)}</title>
<style>:root{color-scheme:light;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#17212b;background:#f4f6f8}body{margin:0}.page{max-width:960px;margin:0 auto;padding:32px;background:#fff;min-height:100vh}.companion-banner{margin:0 -32px 24px;padding:10px 32px;background:#243747;color:#fff;font-weight:700}.meta,.verdict-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;padding:16px 0}.meta div,.verdict-card{border:1px solid #d8e0e7;padding:12px}.verdict-card h2{margin:0 0 8px;border:0;padding:0;font-size:1rem}.verdict-card p{margin:0}h1,h2{line-height:1.25}h2{margin-top:28px;border-bottom:1px solid #d8e0e7;padding-bottom:6px}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #b8c4ce;padding:8px;text-align:left;vertical-align:top}thead{background:#edf3f8}figcaption{font-weight:700}@media print{body{background:#fff}.page{max-width:none;padding:0}.companion-banner{margin:0 0 16px;padding:8px;border:1px solid #243747;color:#17212b;background:#fff}}</style></head>
<body><main class="page"><p class="companion-banner">검토용 HTML — 정본은 최종 Markdown 보고서입니다.</p><h1>${escapeHtml(document.title)}</h1>
<div class="meta"><div><strong>보고서 ID</strong><br>${escapeHtml(document.report_id)}</div><div><strong>프로젝트</strong><br>${escapeHtml(document.project_code)}</div>${reportDate}<div><strong>보고 유형</strong><br>${escapeHtml(REPORT_TYPE_LABELS[document.report_type])}</div><div><strong>독자</strong><br>${escapeHtml(AUDIENCE_LABELS[document.audience])}</div><div><strong>판정 범위</strong><br>${escapeHtml(CLAIM_LABELS[document.claim_ceiling])}</div><div><strong>원천 기록 상태</strong><br>${escapeHtml(SOURCE_STATUS_LABELS[document.source_record_status])}</div><div><strong>정본</strong><br>최종 Markdown 보고서</div></div>
${decisionProjection}${sections}${htmlEvidenceTable(document)}${actionProjection}</main></body></html>
`;
}

export function renderReportPair(document) {
  validateReportDocument(document);
  const markdown = renderMarkdown(document);
  const html = renderHtml(document);
  return { document_sha256: sha256Canonical(document), markdown, markdown_sha256: sha256Bytes(Buffer.from(markdown, "utf8")), html, html_sha256: sha256Bytes(Buffer.from(html, "utf8")) };
}
