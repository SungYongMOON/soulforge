import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const APP_SOURCE = readFileSync(new URL("../static/app.js", import.meta.url), "utf8");
const CSS_SOURCE = readFileSync(new URL("../static/style.css", import.meta.url), "utf8");
const LEXICON_SOURCE = readFileSync(new URL("../src/lexicon.mjs", import.meta.url), "utf8");

function sourceSlice(from, to) {
  const start = APP_SOURCE.indexOf(from);
  const end = APP_SOURCE.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `source slice ${from} -> ${to}`);
  return APP_SOURCE.slice(start, end);
}

function loadNormalizer() {
  const source = sourceSlice("const LIFE_TREE_SCHEMA", "function lifeTreeProjectState");
  return Function(`${source}\nreturn { normalizeLifeTreePayload };`)();
}

function loadLifeHtmlHelpers() {
  const source = sourceSlice("function lifeTreeLaneLabel", "function wireLifeTreeFilters");
  const state = { lex: new Proxy({}, { get: (_target, key) => String(key) }) };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  return Function("state", "esc", "LIFE_TREE_DATE_RE", `${source}\nreturn {
    lifeTreeDaysHtml, lifeTreeCoverageHtml, lifeTreeConfirmedTaskLink, lifeTreeConfirmedBranchLink,
    lifeTreeReasonLabel, lifeTreeTimeBasisLabel,
  };`)(state, esc, /^\d{4}-\d{2}-\d{2}$/);
}

test("ENGINE-12 UI normalizer accepts flat and nested day shapes, latest first with undated last", () => {
  const { normalizeLifeTreePayload } = loadNormalizer();
  const event = {
    event_id: "evt:1", lane_id: "mail_received", summary_label: "요청",
    temporal_role: "occurred", display_at: "2026-07-12T09:00:00+09:00", day_key: "2026-07-12",
    time_basis: "occurred_at", time_state: "exact", project_binding: "confirmed",
    task_links: [{ ref: "item:itm-1", item_id: "itm-1", binding_state: "confirmed" }],
    context_links: [{ ref: "branch:P99-001:work-a", branch_key: "work-a", binding_state: "confirmed" }],
  };
  const flat = normalizeLifeTreePayload({
    schema: "dev_erp.context_life_tree.v1", project: { id: "P99-001", title: "과제", ref: "project:P99-001" }, project_id: "P99-001",
    query: { timezone: "Asia/Seoul" },
    lanes: [{ lane_id: "mail_received", status: "available", coverage: {
      shown: 1, scope_limited: true, scope_withheld_reasons: ["other_mailboxes_withheld"],
    } }],
    events: [event, { ...event, event_id: "evt:old", day_key: "2026-07-01" }, { ...event, event_id: "evt:u", day_key: null }],
    days: [
      { day_key: null, event_ids: ["evt:u"], context_nodes: [] },
      { day_key: "2026-07-01", event_ids: ["evt:old", "evt:missing"], context_nodes: [] },
      { day_key: "2026-07-12", event_ids: ["evt:1"], context_nodes: [{ node_id: "branch:P99-001:work-a", branch_key: "work-a", label: "맥락", binding_state: "confirmed", event_ids: ["evt:1"] }] },
    ],
    coverage: {
      truncated: false, gap_lane_ids: ["file_activity"], undated_count: 1,
      scope_limited: true, scope_withheld_lane_ids: ["mail_received", "artifact_metadata"],
    },
  }, "P99-001");
  assert.deepEqual(flat.days.map((day) => day.day_key), ["2026-07-12", "2026-07-01", "undated"]);
  assert.equal(flat.project, "P99-001", "object project envelope normalizes to exact project id");
  assert.equal(flat.timezone, "Asia/Seoul");
  assert.equal(flat.days[0].contexts[0].events[0].summary_label, "요청");
  assert.equal(flat.days[0].contexts[0].events[0].task_links[0].link_state, "confirmed");
  assert.ok(flat.lanes.some((lane) => lane.lane_id === "file_activity" && lane.status === "gap"));
  assert.equal(flat.lanes.find((lane) => lane.lane_id === "mail_received").coverage.scope_limited, true);
  assert.deepEqual(flat.lanes.find((lane) => lane.lane_id === "mail_received").coverage.scope_withheld_reasons, ["other_mailboxes_withheld"]);
  assert.equal(flat.coverage.scope_limited, true);
  assert.deepEqual(flat.coverage.scope_withheld_lane_ids, ["mail_received", "artifact_metadata"]);
  assert.equal(flat.coverage.projection_gap_count, 1, "unresolved event ids stay visible as a coverage gap");

  const nested = normalizeLifeTreePayload({
    project: "P99-001",
    lane_catalog: [{ lane: "erp_work", label: "ERP", status: "available", coverage: { events: 1, cap: 500, truncated: false } }],
    days: [{ day: "2026-07-11", contexts: [{
      context_ref: "branch:P99-001:work-b", branch_key: "work-b", label: "상태 변경", binding_state: "confirmed_exact",
      events: [{ id: "evt:2", lane: "erp_work", title: "완료", temporal_role: "state_change", day: "2026-07-11", state: "exact", uncertainty: { context: "confirmed_exact", time: "exact", reasons: [] } }],
    }] }],
  }, "P99-001");
  assert.equal(nested.days[0].contexts[0].events[0].summary_label, "완료");
  assert.equal(nested.days[0].contexts[0].events[0].lane_id, "erp_work");
  assert.equal(nested.days[0].contexts[0].events[0].temporal_role, "state_change");
});

test("ENGINE-12 exact actions reject suggestions, mismatched refs, and missing graph branches", () => {
  const { lifeTreeConfirmedTaskLink, lifeTreeConfirmedBranchLink } = loadLifeHtmlHelpers();
  assert.equal(lifeTreeConfirmedTaskLink({ ref: "item:itm-1", item_id: "itm-1", link_state: "suggested" }), null);
  assert.equal(lifeTreeConfirmedTaskLink({ ref: "item:other", item_id: "itm-1", link_state: "confirmed_exact" }), null);
  assert.deepEqual(lifeTreeConfirmedTaskLink({ ref: "item:itm-1", item_id: "itm-1", link_state: "confirmed_exact" }), { item_id: "itm-1", label: "" });

  const branches = [{ branch_key: "work-a", label: "확정 가지" }];
  assert.equal(lifeTreeConfirmedBranchLink({ ref: "branch:P00-X:work-a", branch_key: "work-a", link_state: "confirmed_exact" }, "P99-001", branches), null);
  assert.equal(lifeTreeConfirmedBranchLink({ ref: "branch:P99-001:missing", branch_key: "missing", link_state: "confirmed_exact" }, "P99-001", branches), null);
  assert.deepEqual(lifeTreeConfirmedBranchLink({ ref: "branch:P99-001:work-a", branch_key: "work-a", link_state: "confirmed_exact" }, "P99-001", branches), { branch_key: "work-a", label: "확정 가지" });
});

test("ENGINE-12 rendered metadata is escaped and review-needed leaves have no active CTA", () => {
  const { lifeTreeDaysHtml, lifeTreeCoverageHtml, lifeTreeReasonLabel, lifeTreeTimeBasisLabel } = loadLifeHtmlHelpers();
  const L = new Proxy({}, { get: (_target, key) => String(key) });
  const attack = `<img src=x onerror="alert(1)">`;
  const g = { project: "P99-001", branches: [{ branch_key: "work-a", label: attack }] };
  const config = { showPlanned: false, selectedLanes: null, knownLanes: [{ lane_id: "mail_received", label: attack, status: "available" }] };
  const baseEvent = {
    event_id: "evt", lane_id: "mail_received", summary_label: attack, temporal_role: "occurred",
    display_at: `2026-07-12T09:00:00+09:00\" onmouseover=\"alert(2)`, time_basis: attack, time_state: "exact",
    project_binding: "review_needed", uncertainty: { context: "review_needed", reasons: [attack] },
    task_links: [{ ref: "item:itm-1", item_id: "itm-1", link_state: "confirmed_exact" }],
    context_links: [{ ref: "branch:P99-001:work-a", branch_key: "work-a", link_state: "confirmed_exact", label: attack }],
  };
  const html = lifeTreeDaysHtml({ days: [{ day_key: "2026-07-12", contexts: [{ context_ref: null, branch_key: null, label: attack, binding_state: "review_needed", reasons: [attack], events: [baseEvent] }] }] }, config, g);
  assert.doesNotMatch(html, /<img| on(?:error|mouseover)="/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /life-open-item|life-open-story/, "review-needed event must not expose write/detail actions");

  const confirmed = lifeTreeDaysHtml({ days: [{ day_key: "2026-07-12", contexts: [{
    context_ref: "branch:P99-001:work-a", branch_key: "work-a", label: attack, binding_state: "confirmed_exact", reasons: [],
    events: [{ ...baseEvent, project_binding: "confirmed_exact", uncertainty: { context: "confirmed_exact", reasons: [] } }],
  }] }] }, config, g);
  assert.match(confirmed, /life-open-item/);
  assert.match(confirmed, /life-open-story/);
  assert.doesNotMatch(confirmed, /<img| on(?:error|mouseover)="/);

  const partialCoverage = lifeTreeCoverageHtml({
    coverage: { gap_lane_ids: ["file_activity"], undated_count: 0, scope_limited: true }, timezone: "Asia/Seoul",
  }, {
    knownLanes: [{
      lane_id: "file_activity", status: "partial", gap_reason: "no_canonical_filesystem_create_collector",
      coverage: { events: 1, scope_limited: true, scope_withheld_reasons: ["inaccessible_upload_events_withheld"] },
    }],
  });
  assert.match(partialCoverage, /life_gap/, "partial file activity remains visibly incomplete");
  assert.match(partialCoverage, /life_scope_limited/);
  assert.match(partialCoverage, /life_scope_file_withheld/);
  assert.doesNotMatch(partialCoverage, /inaccessible_upload_events_withheld/, "raw scope reason codes are translated");
  assert.equal(lifeTreeReasonLabel("no_exact_context_link", L), "life_reason_no_context");
  assert.equal(lifeTreeReasonLabel("unknown_internal_code", L), "life_reason_review");
  assert.equal(lifeTreeTimeBasisLabel("occurred_at", L), "life_basis_occurred");
  assert.equal(lifeTreeTimeBasisLabel("unexpected_basis", L), "life_basis_unknown");
});

test("ENGINE-12 lens stays lazy, native, filter-cached, responsive, and lexicon-paired", () => {
  const graphBlock = sourceSlice("function drawTrunkGraph", "// B9c 진단 렌즈");
  assert.match(graphBlock, /\["life", L\.trunk_view_life\]/);
  assert.match(graphBlock, /state\.trunkView === "life"/);
  assert.match(APP_SOURCE, /async function drawTrunkLifeTree/);
  assert.equal(APP_SOURCE.match(/\/api\/context\/life_tree\?/g)?.length, 1, "one lazy request surface");
  assert.match(APP_SOURCE, /lifeTreeCacheKey\(g\.project, config\)/);
  assert.match(APP_SOURCE, /return `\$\{project\}\|\$\{config\.days\}\|\$\{lanes\}\|\$\{roles\}`/);
  assert.match(APP_SOURCE, /LIFE_TREE_CACHE_TTL_MS = 60_000/);
  assert.match(APP_SOURCE, /Date\.now\(\) - cached\.cached_at < LIFE_TREE_CACHE_TTL_MS/);
  const drawLifeBlock = sourceSlice("async function drawTrunkLifeTree", "// B9c 진단 렌즈");
  assert(drawLifeBlock.indexOf("body.dataset.lifeRequest = requestId") < drawLifeBlock.indexOf("const cached ="),
    "cache hits must invalidate any older in-flight life-tree request");
  assert.match(APP_SOURCE, /days: 30, showPlanned: false/);
  assert.match(APP_SOURCE, /function lifeTreePayloadProjectId/);
  assert.match(APP_SOURCE, /lifeTreePayloadProjectId\(raw\) !== String\(g\.project\)/);
  assert.match(APP_SOURCE, /LIFE_TREE_ACTUAL_ROLES = Object\.freeze\(\["occurred", "observed", "state_change"\]\)/);
  assert.match(APP_SOURCE, /temporal_roles:/);
  assert.match(APP_SOURCE, /aria-pressed=/);
  assert.match(APP_SOURCE, /aria-live="polite"/);
  assert.match(APP_SOURCE, /<details/);
  assert.match(APP_SOURCE, /<summary>/);
  assert.match(APP_SOURCE, /<time datetime=/);
  assert.match(APP_SOURCE, /<button type="button"/);
  assert.doesNotMatch(graphBlock, /role="tree"/);
  assert.doesNotMatch(APP_SOURCE, /데이터는 g 하나로 전 뷰 파생\(서버 무변경\)/);
  assert.match(APP_SOURCE, /event\.key !== "Escape"/);
  assert.match(APP_SOURCE, /trigger\?\.focus\(\)/);
  assert.match(APP_SOURCE, /file_activity/);

  assert.equal(LEXICON_SOURCE.match(/trunk_view_life:/g)?.length, 2, "business/fantasy lens parity");
  for (const key of ["life_role_actual_state", "life_role_observed", "life_role_planned", "life_role_unknown", "life_lane_file_activity", "life_review_needed", "life_contract_error", "life_projection_gaps", "life_scope_limited", "life_scope_mail_withheld", "life_scope_work_withheld", "life_scope_plan_withheld", "life_scope_artifact_withheld", "life_scope_file_withheld", "life_timezone", "life_scanned", "life_reason_no_context", "life_reason_review", "life_basis_observed", "life_basis_unknown"]) {
    assert.equal(LEXICON_SOURCE.match(new RegExp(`${key}:`, "g"))?.length, 2, `${key} parity`);
  }
  assert.match(CSS_SOURCE, /\.life-tree-layout \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(260px, 340px\)/s);
  assert.match(CSS_SOURCE, /@media \(max-width: 1024px\)[\s\S]*?\.life-tree-layout \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(CSS_SOURCE, /@media \(max-width: 640px\)[\s\S]*?\.life-filter-row label \{ width: 100%/);
  assert.match(CSS_SOURCE, /\.life-event \{[^}]*overflow-wrap: anywhere/s);
});
