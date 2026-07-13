import { sha256Bytes, sha256Canonical } from "./canonical.mjs";
import { validateReportDocument } from "./contract.mjs";

const REPORT_TYPE_LABELS = Object.freeze({ experiment: "시험·실험", analysis: "분석·대안 검토", progress: "진행·성과", presentation: "브리핑", other: "기타" });
const AUDIENCE_LABELS = Object.freeze({ internal_review: "내부 검토", management: "경영진", customer: "고객", regulator: "규제기관", other: "기타" });
const CLAIM_LABELS = Object.freeze({ observed: "관찰 범위", source_supported: "자료가 지지하는 범위", rejected_or_blocked: "기각 또는 보류" });
const SOURCE_STATUS_LABELS = Object.freeze({ complete: "완전", partial: "부분", unconfirmed: "미확인" });
const CONCLUSION_ROLES = new Set(["conclusion_verdict", "conclusion_recommendation", "bounded_conclusion_decision_status", "recommendation_next", "status_summary"]);
const NEXT_ACTION_ROLES = new Set(["next_actions", "decision_ask_next_actions", "decision_support_requests", "recommendation_next"]);

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

function sourceRefsForBlock(block) {
  const refs = block.type === "bullets" ? block.items.flatMap((item) => item.source_refs) : block.source_refs;
  return [...new Set(refs)].sort();
}

function markdownSourceLine(block) {
  const refs = sourceRefsForBlock(block);
  return refs.length ? `출처: ${refs.map(escapeMarkdownInline).join(", ")}` : "";
}

function markdownBlock(block) {
  if (block.type === "paragraph") return [escapeMarkdownInline(block.text), "", markdownSourceLine(block)].filter(Boolean).join("\n");
  if (block.type === "bullets") return [block.items.map((item) => `- ${escapeMarkdownInline(item.text)}`).join("\n"), "", markdownSourceLine(block)].filter(Boolean).join("\n");
  const headings = ["항목", ...block.columns.map((column) => column.unit ? `${column.heading} (${column.unit})` : column.heading)];
  const rows = block.rows.map((row) => {
    const cells = block.columns.map((column) => row.cells.find((cell) => cell.column_id === column.column_id).text);
    return `| ${[row.label, ...cells].map(escapeMarkdownTable).join(" | ")} |`;
  });
  return [`**${escapeMarkdownInline(block.caption)}**`, "", `| ${headings.map(escapeMarkdownTable).join(" | ")} |`, `| ${headings.map(() => "---").join(" | ")} |`, ...rows, "", markdownSourceLine(block)].filter((line, index, array) => line || index < array.length - 1).join("\n");
}

function markdownUnconfirmed(item) {
  const lines = [`### ${escapeMarkdownInline(item.statement)}`, "", `- 영향: ${escapeMarkdownInline(item.impact)}`, `- 종료 조건: ${escapeMarkdownInline(item.close_condition)}`];
  if (item.owner_ref) lines.push(`- 담당: ${escapeMarkdownInline(item.owner_ref)}`);
  if (item.due_or_trigger) lines.push(`- 기한·트리거: ${escapeMarkdownInline(item.due_or_trigger)}`);
  return lines.join("\n");
}

function markdownReferences(references) {
  if (references.length === 0) return "";
  const rows = references.map((reference) => `| ${escapeMarkdownTable(reference.reference_id)} | ${escapeMarkdownTable(reference.label)} | ${escapeMarkdownTable(reference.source_ref)} |`);
  return ["## 참고문헌 레지스트리", "", "| ID | 출처 | 출처 참조 |", "| --- | --- | --- |", ...rows].join("\n");
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
  if (document.unconfirmed_items.length) lines.push("## 미확인 사항", "", ...document.unconfirmed_items.flatMap((item) => [markdownUnconfirmed(item), ""]));
  if (document.references.length) lines.push(markdownReferences(document.references), "");
  return `${lines.join("\n").replace(/\n{3,}/gu, "\n\n").trimEnd()}\n`;
}

function htmlBlock(block) {
  const refs = sourceRefsForBlock(block);
  const source = refs.length ? `<p class="source">출처: ${refs.map(escapeHtml).join(", ")}</p>` : "";
  if (block.type === "paragraph") return `<p>${escapeHtml(block.text)}</p>${source}`;
  if (block.type === "bullets") return `<ul>${block.items.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul>${source}`;
  const header = ["항목", ...block.columns.map((column) => column.unit ? `${column.heading} (${column.unit})` : column.heading)];
  const rows = block.rows.map((row) => {
    const cells = block.columns.map((column) => row.cells.find((cell) => cell.column_id === column.column_id).text);
    return `<tr><th scope="row">${escapeHtml(row.label)}</th>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`;
  }).join("");
  return `<figure><figcaption>${escapeHtml(block.caption)}</figcaption><table><thead><tr>${header.map((item) => `<th scope="col">${escapeHtml(item)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>${source}</figure>`;
}

function htmlUnconfirmed(item) {
  const details = [`<li><strong>영향</strong>: ${escapeHtml(item.impact)}</li>`, `<li><strong>종료 조건</strong>: ${escapeHtml(item.close_condition)}</li>`];
  if (item.owner_ref) details.push(`<li><strong>담당</strong>: ${escapeHtml(item.owner_ref)}</li>`);
  if (item.due_or_trigger) details.push(`<li><strong>기한·트리거</strong>: ${escapeHtml(item.due_or_trigger)}</li>`);
  return `<article><h3>${escapeHtml(item.statement)}</h3><ul>${details.join("")}</ul></article>`;
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
  const followUp = document.unconfirmed_items.length
    ? document.unconfirmed_items.map((item) => item.statement).join(" · ")
    : sectionPlainText(nextAction);
  return `<section class="verdict-grid" aria-label="판정 요약"><article class="verdict-card"><h2>주요 결론</h2><p>${escapeHtml(sectionPlainText(conclusion))}</p></article><article class="verdict-card"><h2>적용 범위</h2><p>판정 범위: ${escapeHtml(CLAIM_LABELS[document.claim_ceiling])}<br>원천 기록 상태: ${escapeHtml(SOURCE_STATUS_LABELS[document.source_record_status])}</p></article><article class="verdict-card"><h2>후속 확인 범위</h2><p>${escapeHtml(followUp)}</p></article></section>`;
}

function htmlEvidenceTable(document) {
  const entries = document.references.map((reference) => ({ id: reference.reference_id, label: reference.label, sourceRef: reference.source_ref }));
  const registeredSourceRefs = new Set(entries.map((entry) => entry.sourceRef));
  const directSourceRefs = [...new Set(document.sections.flatMap((section) => section.blocks.flatMap(sourceRefsForBlock)))].sort();
  for (const [index, sourceRef] of directSourceRefs.filter((ref) => !registeredSourceRefs.has(ref)).entries()) {
    entries.push({ id: `source-${index + 1}`, label: "본문 직접 근거", sourceRef });
  }
  if (entries.length === 0) return "";
  const rows = entries.map((entry) => `<tr><td>${escapeHtml(entry.id)}</td><td>${escapeHtml(entry.label)}</td><td>${escapeHtml(entry.sourceRef)}</td></tr>`).join("");
  return `<section><h2>근거·참고문헌 레지스트리</h2><table><thead><tr><th scope="col">ID</th><th scope="col">출처</th><th scope="col">출처 참조</th></tr></thead><tbody>${rows}</tbody></table></section>`;
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
  actions.push(...document.unconfirmed_items.map((item) => ({ action: item.close_condition, owner: item.owner_ref ?? "", due: item.due_or_trigger ?? "" })));
  if (actions.length === 0) return "";
  const rows = actions.map((item) => `<tr><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.owner)}</td><td>${escapeHtml(item.due)}</td></tr>`).join("");
  return `<section><h2>후속 조치 표</h2><table><thead><tr><th scope="col">조치</th><th scope="col">담당</th><th scope="col">기한·트리거</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

export function renderHtml(document) {
  validateReportDocument(document);
  const sections = document.sections.map((section) => `<section data-role="${escapeHtml(section.role)}"><h2>${escapeHtml(section.heading)}</h2>${section.blocks.map(htmlBlock).join("")}</section>`).join("");
  const unconfirmed = document.unconfirmed_items.length ? `<section><h2>미확인 사항</h2>${document.unconfirmed_items.map(htmlUnconfirmed).join("")}</section>` : "";
  const reportDate = document.report_date === null ? "" : `<div><strong>기준일</strong><br>${escapeHtml(document.report_date)}</div>`;
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(document.title)}</title>
<style>:root{color-scheme:light;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#17212b;background:#f4f6f8}body{margin:0}.page{max-width:960px;margin:0 auto;padding:32px;background:#fff;min-height:100vh}.companion-banner{margin:0 -32px 24px;padding:10px 32px;background:#243747;color:#fff;font-weight:700}.meta,.verdict-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;padding:16px 0}.meta div,.verdict-card{border:1px solid #d8e0e7;padding:12px}.verdict-card h2{margin:0 0 8px;border:0;padding:0;font-size:1rem}.verdict-card p{margin:0}h1,h2{line-height:1.25}h2{margin-top:28px;border-bottom:1px solid #d8e0e7;padding-bottom:6px}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #b8c4ce;padding:8px;text-align:left;vertical-align:top}thead{background:#edf3f8}figcaption{font-weight:700}.source{font-size:.9rem;color:#4b5b68}@media print{body{background:#fff}.page{max-width:none;padding:0}.companion-banner{margin:0 0 16px;padding:8px;border:1px solid #243747;color:#17212b;background:#fff}}</style></head>
<body><main class="page"><p class="companion-banner">HTML companion - canonical record remains the Markdown/structured text file.</p><h1>${escapeHtml(document.title)}</h1>
<div class="meta"><div><strong>보고서 ID</strong><br>${escapeHtml(document.report_id)}</div><div><strong>프로젝트</strong><br>${escapeHtml(document.project_code)}</div>${reportDate}<div><strong>보고 유형</strong><br>${escapeHtml(REPORT_TYPE_LABELS[document.report_type])}</div><div><strong>독자</strong><br>${escapeHtml(AUDIENCE_LABELS[document.audience])}</div><div><strong>판단 범위</strong><br>${escapeHtml(CLAIM_LABELS[document.claim_ceiling])}</div><div><strong>원천 기록 상태</strong><br>${escapeHtml(SOURCE_STATUS_LABELS[document.source_record_status])}</div><div><strong>정본 레코드</strong><br>final_report_md / report_document_json</div><div><strong>HTML 상태</strong><br>derived_human_review_artifact</div><div><strong>자료 경계</strong><br>${escapeHtml(document.boundary.content_classification)}</div></div>
${htmlVerdictCards(document)}${sections}${unconfirmed}${htmlEvidenceTable(document)}${htmlNextActionTable(document)}</main></body></html>
`;
}

export function renderReportPair(document) {
  validateReportDocument(document);
  const markdown = renderMarkdown(document);
  const html = renderHtml(document);
  return { document_sha256: sha256Canonical(document), markdown, markdown_sha256: sha256Bytes(Buffer.from(markdown, "utf8")), html, html_sha256: sha256Bytes(Buffer.from(html, "utf8")) };
}
