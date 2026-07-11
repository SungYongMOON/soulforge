// 줄기(project_context) 그래프 서빙(2026-07-04 owner 승인): _workmeta/<과제>/project_context 의
// nodes/edges CSV(soulforge.project_context.v0 — 이미 그래프 형태)를 읽어 화면용 JSON 으로 변환한다.
// 읽기 전용·메타 전용(원문 없음). 쓰기는 행보관 도구(haengbogwan_project_context.mjs)만 한다.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseCsv } from "./autosync.mjs";

export const CONTEXT_GRAPH_SCHEMA = "dev_erp.context_graph.v1";
export const BRANCH_STORY_SCHEMA = "dev_erp.branch_story.v1";
export const CONTEXT_DIAGNOSTICS_SCHEMA = "dev_erp.context_diagnostics.v1";
const PROJECT_SEG_RE = /^[A-Za-z0-9가-힣][A-Za-z0-9가-힣._-]*$/;
const MAX_NODES = 3000;
const MAX_STORY_POINTS = 300; // B9a 점 상한(한 가지 91통 실측) — MAX_NODES 선례대로 cap+truncated
const MAX_DIAGNOSTIC_WEEKS = 52;
const MAX_DIAGNOSTIC_BRANCHES = 1000;
const MAX_DIAGNOSTIC_SOURCES = 10000;
const WEEK_MS = 7 * 86400000;

function readCsvObjects(filePath) {
  if (!existsSync(filePath)) return [];
  let rows;
  try {
    rows = parseCsv(readFileSync(filePath, "utf8").replace(/^﻿/, "").normalize("NFC"))
      .filter((r) => r.some((c) => String(c).trim()));
  } catch { return []; }
  if (!rows.length) return [];
  const header = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

function storedTimestampMs(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})(?=$|[ T])/.exec(raw);
  if (!dateMatch) return null;
  const dateKey = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  const calendarProbe = new Date(`${dateKey}T00:00:00Z`);
  if (!Number.isFinite(calendarProbe.getTime()) || calendarProbe.toISOString().slice(0, 10) !== dateKey) return null;
  const normalized = raw.replace(" ", "T");
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const candidate = zoned ? normalized : normalized.length === 10 ? `${normalized}T00:00:00+09:00` : `${normalized}+09:00`;
  const ms = Date.parse(candidate);
  return Number.isFinite(ms) ? ms : null;
}

function localDateKey(value) {
  const ms = storedTimestampMs(value);
  if (ms == null) return null;
  return new Date(ms + 9 * 3600000).toISOString().slice(0, 10); // Asia/Seoul fixed business day
}

function weekStartKey(value) {
  const key = localDateKey(value);
  if (!key) return null;
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday, timezone-independent
  return d.toISOString().slice(0, 10);
}

function weeklySeries(values, maxWeeks = MAX_DIAGNOSTIC_WEEKS) {
  const counts = new Map();
  for (const value of values) {
    const key = weekStartKey(value);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const keys = [...counts.keys()].sort();
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (!keys.length) return { weeks: [], total_points: 0, shown_points: 0, truncated: false };
  const first = Date.parse(`${keys[0]}T00:00:00Z`);
  const last = Date.parse(`${keys[keys.length - 1]}T00:00:00Z`);
  const start = Math.max(first, last - (maxWeeks - 1) * WEEK_MS);
  const weeks = [];
  for (let t = start; t <= last; t += WEEK_MS) {
    const week = new Date(t).toISOString().slice(0, 10);
    weeks.push({ week, count: counts.get(week) ?? 0 });
  }
  const shown = weeks.reduce((n, row) => n + row.count, 0);
  return { weeks, total_points: total, shown_points: shown, truncated: shown < total };
}

// B9c 모양 진단(§4): graph/DB 의 metadata-only 재료를 한 번에 일괄 조인해 N+1 branch_story 호출을 피한다.
// 진단은 설명 통계일 뿐 자동 판정/원장 쓰기가 아니다. 죽은 가지는 store 지식 조인이 가능한 경우에만
// `closed + 교차가지/공유 source ref 0 + completion:<item> 지식 0`으로 보수 판정한다.
function deriveContextDiagnostics({ project, branches, nodes, edges, sources, store = null, graphTruncated = false, graphNodeTotal = nodes.length }) {
  const hasV2 = branches.some((b) => ["work", "history"].includes(String(b.branch_kind ?? "").trim()));
  const scopedAll = branches.filter((b) => {
    const kind = String(b.branch_kind ?? "legacy").trim() || "legacy";
    return kind !== "skeleton" && (!hasV2 || kind !== "legacy");
  });
  const branchInputTruncated = scopedAll.length > MAX_DIAGNOSTIC_BRANCHES;
  const scoped = scopedAll.slice(0, MAX_DIAGNOSTIC_BRANCHES);
  const sourceInputTruncated = sources.length > MAX_DIAGNOSTIC_SOURCES;
  const sourceRows = sources.slice(0, MAX_DIAGNOSTIC_SOURCES);
  const diagnosticTruncated = graphTruncated || branchInputTruncated || sourceInputTruncated;
  const scopeKeys = new Set(scoped.map((b) => b.branch_key));
  const branchByKey = new Map(scoped.map((b) => [b.branch_key, b]));
  const branchPrefix = `branch:${project}:`;
  const sourceBranchKey = (s) => {
    const direct = String(s.branch_key ?? "").trim();
    if (scopeKeys.has(direct)) return direct;
    const ref = String(s.branch_ref ?? "").trim();
    const key = ref.startsWith(branchPrefix) ? ref.slice(branchPrefix.length) : ref;
    return scopeKeys.has(key) ? key : null;
  };

  const itemBranches = new Map();
  const addItemBranch = (itemId, branchKey) => {
    const id = String(itemId ?? "").trim();
    if (!id || !scopeKeys.has(branchKey)) return;
    if (!itemBranches.has(id)) itemBranches.set(id, new Set());
    itemBranches.get(id).add(branchKey);
  };
  for (const b of scoped) {
    const anchor = String(b.anchor_ref ?? "");
    if (anchor.startsWith("item:")) addItemBranch(anchor.slice(5), b.branch_key);
  }
  for (const n of nodes) {
    const id = String(n.id ?? "");
    if (id.startsWith("item:")) addItemBranch(id.slice(5), n.branch_key);
  }
  const itemIds = [...itemBranches.keys()];

  const historyKeys = [...new Set(sourceRows.map((s) => String(s.external_ref ?? ""))
    .filter((ref) => ref.startsWith("mailcsv:"))
    .map((ref) => ref.slice("mailcsv:".length)))];
  const mailByKey = store ? store.mailByHistoryKeys(historyKeys, { project }) : new Map();
  const events = store ? store.eventsForItems(itemIds) : [];
  const completions = store ? store.completionsForItems(itemIds) : [];
  const assignments = store ? store.itemAssigneesForItems(itemIds) : [];
  const promotions = store ? store.knowledgePromotionsForItems(itemIds) : [];
  const resolvedItemIds = new Set(assignments.map((row) => String(row.id)));
  const itemBackedBranches = new Set();
  for (const itemId of resolvedItemIds) {
    for (const key of itemBranches.get(itemId) ?? []) itemBackedBranches.add(key);
  }

  const pointDates = [];
  let pointCount = 0;
  const requestDates = [];
  const counterpartCounts = new Map();
  let receivedCount = 0;
  let unknownCounterpartCount = 0;
  let mailSourceCount = 0;
  let mailJoinedCount = 0;
  const sourceRefs = new Map(); // external_ref -> [{branch_key, at}]
  const seenSources = new Set();
  for (let i = 0; i < sourceRows.length; i++) {
    const s = sourceRows[i];
    const branchKey = sourceBranchKey(s);
    if (!branchKey) continue;
    const sourceId = String(s.source_id ?? "").trim() || `${branchKey}:${i}`;
    if (seenSources.has(sourceId)) continue;
    seenSources.add(sourceId);
    const externalRef = String(s.external_ref ?? "").trim();
    const historyKey = externalRef.startsWith("mailcsv:") ? externalRef.slice("mailcsv:".length) : null;
    const mail = historyKey ? (mailByKey.get(historyKey) ?? null) : null;
    if (historyKey) { mailSourceCount++; if (mail) mailJoinedCount++; }
    const at = storedTimestampMs(mail?.at) != null ? mail.at : s.source_time || null;
    if (externalRef) {
      if (!sourceRefs.has(externalRef)) sourceRefs.set(externalRef, []);
      sourceRefs.get(externalRef).push({ branch_key: branchKey, at });
    }
    pointCount++;
    if (weekStartKey(at)) pointDates.push(at);
    if (mail?.direction === "in") {
      receivedCount++;
      if (weekStartKey(at)) requestDates.push(at);
      const counterpart = String(mail.counterpart ?? "").trim();
      if (counterpart) counterpartCounts.set(counterpart, (counterpartCounts.get(counterpart) ?? 0) + 1);
      else unknownCounterpartCount++;
    }
  }

  const people = new Map();
  const personRow = (ref) => {
    const key = String(ref ?? "").trim();
    if (!key) return null;
    if (!people.has(key)) people.set(key, { person_ref: key, branch_keys: new Set(), point_count: 0, resolved_count: 0 });
    return people.get(key);
  };
  for (const row of assignments) {
    const p = personRow(row.assignee_ref);
    if (!p) continue;
    for (const key of itemBranches.get(String(row.id)) ?? []) p.branch_keys.add(key);
  }
  const seenEvents = new Set();
  const doneEventItems = new Set();
  for (const e of events) {
    const branchesForItem = itemBranches.get(String(e.item_ref)) ?? new Set();
    if (!branchesForItem.size) continue;
    const eventKey = e.id ?? `${e.item_ref}:${e.kind}:${e.at}:${e.actor_ref}`;
    if (seenEvents.has(eventKey)) continue;
    seenEvents.add(eventKey);
    if (e.actor_kind !== "human") continue;
    pointCount++;
    if (weekStartKey(e.at)) pointDates.push(e.at);
    if (e.kind === "item_status" && String(e.to_val ?? "") === "done") doneEventItems.add(String(e.item_ref));
    const p = personRow(e.actor_ref);
    if (p) p.point_count++;
  }
  for (const row of completions) {
    if (!doneEventItems.has(String(row.item_id))) {
      pointCount++;
      if (weekStartKey(row.done_at)) pointDates.push(row.done_at);
    }
    const p = personRow(row.completed_by ?? row.assignee_ref);
    if (p) p.resolved_count++;
  }

  const references = new Map(scoped.map((b) => [b.branch_key, new Set()]));
  const unknownTimeRelations = new Map(scoped.map((b) => [b.branch_key, new Set()]));
  const nodeBranch = new Map(nodes.filter((n) => scopeKeys.has(n.branch_key)).map((n) => [n.id, n.branch_key]));
  for (let i = 0; i < edges.length; i++) {
    const from = nodeBranch.get(edges[i].from); const to = nodeBranch.get(edges[i].to);
    if (!from || !to || from === to) continue;
    const signature = `edge:${i}:${from}:${to}:${edges[i].type ?? ""}`;
    // edge.created_at 은 생성기 실행 스탬프라 종결 뒤 재사용 시각으로 쓸 수 없다. 관계 존재만 unknown 으로 보존.
    unknownTimeRelations.get(from)?.add(signature);
    unknownTimeRelations.get(to)?.add(signature);
  }
  for (const [ref, rows] of sourceRefs) {
    const keys = new Set(rows.map((row) => row.branch_key));
    if (keys.size < 2) continue;
    for (const key of keys) {
      const closedMs = storedTimestampMs(branchByKey.get(key)?.closed_at);
      const others = rows.filter((row) => row.branch_key !== key);
      const reusedAfterClose = closedMs != null && others.some((row) => {
        const ms = storedTimestampMs(row.at);
        return ms != null && ms > closedMs;
      });
      if (reusedAfterClose) references.get(key)?.add(`source:${ref}`);
      else if (closedMs != null && others.some((row) => storedTimestampMs(row.at) == null)) unknownTimeRelations.get(key)?.add(`source-undated:${ref}`);
    }
  }
  const knowledgeByBranch = new Map(scoped.map((b) => [b.branch_key, new Set()]));
  for (const row of promotions) {
    for (const key of itemBranches.get(String(row.item_id)) ?? []) knowledgeByBranch.get(key)?.add(row.knowledge_id);
  }
  const branchSignals = scoped.map((b) => {
    const kind = String(b.branch_kind ?? "legacy");
    const closedAtMs = storedTimestampMs(b.closed_at);
    const closed = b.status === "closed" || closedAtMs != null;
    const referenceCount = references.get(b.branch_key)?.size ?? 0;
    const unknownRelationCount = unknownTimeRelations.get(b.branch_key)?.size ?? 0;
    const knowledgeCount = knowledgeByBranch.get(b.branch_key)?.size ?? 0;
    const deadEligible = kind === "work" && closedAtMs != null && itemBackedBranches.has(b.branch_key);
    let followupState = "unknown";
    if (!closed) followupState = "open";
    else if (knowledgeCount > 0 || referenceCount > 0) followupState = "reused_observed";
    else if (Boolean(store) && !diagnosticTruncated && deadEligible && unknownRelationCount === 0) followupState = "no_followup_observed";
    return {
      branch_key: b.branch_key, label: b.label || b.branch_key, branch_kind: kind,
      status: b.status || null, closed_at: b.closed_at || null,
      reference_count: referenceCount, relation_unknown_time_count: unknownRelationCount, knowledge_count: knowledgeCount,
      dead_eligible: deadEligible,
      followup_state: followupState,
      dead: followupState === "no_followup_observed", // UI backward-compatible alias; label remains candidate/observed ceiling.
    };
  });
  const deadAll = branchSignals.filter((b) => b.dead).sort((a, b) => String(b.closed_at ?? "").localeCompare(String(a.closed_at ?? "")));
  const heatmap = weeklySeries(pointDates);
  const requestSeries = weeklySeries(requestDates);
  const peopleAll = [...people.values()].map((p) => ({
    person_ref: p.person_ref, branch_count: p.branch_keys.size, point_count: p.point_count, resolved_count: p.resolved_count,
  })).sort((a, b) => (b.resolved_count - a.resolved_count) || (b.point_count - a.point_count) || (b.branch_count - a.branch_count) || a.person_ref.localeCompare(b.person_ref, "ko"));
  const peopleRows = peopleAll.slice(0, 20);
  const counterpartAll = [...counterpartCounts].map(([counterpart, count]) => ({ counterpart, count }))
    .sort((a, b) => (b.count - a.count) || a.counterpart.localeCompare(b.counterpart, "ko"));
  const counterparts = counterpartAll.slice(0, 12);
  const closedCount = branchSignals.filter((b) => b.status === "closed" || b.closed_at).length;
  const proposedCount = branchSignals.filter((b) => b.status === "proposed").length;
  const referenceObserved = branchSignals.reduce((n, b) => n + b.reference_count, 0);
  const relationUnknownTime = branchSignals.reduce((n, b) => n + b.relation_unknown_time_count, 0);
  const knowledgeObserved = branchSignals.reduce((n, b) => n + b.knowledge_count, 0);

  return {
    schema: CONTEXT_DIAGNOSTICS_SCHEMA,
    content_policy: "metadata_only",
    read_only: true,
    interpretation: "descriptive_only",
    basis: {
      timezone: "Asia/Seoul",
      point_kinds: ["source", "item_event", "completion_fallback"],
      omitted_kinds: ["deliverable_registration_no_authoritative_timestamp"],
      person_identity: "exact_ref_no_alias_merge",
      reference_coverage: "partial_exact_graph_and_shared_source_only",
    },
    scope: { mode: hasV2 ? "v2_non_skeleton" : "legacy_non_skeleton", legacy_excluded: hasV2 ? branches.filter((b) => String(b.branch_kind ?? "legacy") === "legacy").length : 0 },
    coverage: {
      store_join: Boolean(store), item_count: itemIds.length,
      item_refs_resolved: resolvedItemIds.size, item_refs_unresolved: Math.max(0, itemIds.length - resolvedItemIds.size),
      dated_points: heatmap.total_points, undated_points: Math.max(0, pointCount - heatmap.total_points),
      mail_sources: mailSourceCount, mail_joined: mailJoinedCount, mail_unresolved: mailSourceCount - mailJoinedCount,
      post_close_references_observed: referenceObserved, relation_time_unknown: relationUnknownTime, completion_knowledge_observed: knowledgeObserved,
      dead_classification: !store ? "withheld_without_store" : diagnosticTruncated ? "withheld_input_truncated" : "closed_at_item_exact_completion_ref_and_post_close_evidence",
      graph_nodes_shown: nodes.length, graph_nodes_total: graphNodeTotal,
      branch_inputs_shown: scoped.length, branch_inputs_total: scopedAll.length,
      source_inputs_shown: sourceRows.length, source_inputs_total: sources.length,
      branch_input_truncated: branchInputTruncated, source_input_truncated: sourceInputTruncated,
      people_truncated: peopleAll.length > peopleRows.length, counterparts_truncated: counterpartAll.length > counterparts.length,
      people_shown: peopleRows.length, people_total: peopleAll.length,
      counterparts_shown: counterparts.length, counterparts_total: counterpartAll.length,
      dead_list_shown: Math.min(deadAll.length, 60), dead_list_truncated: deadAll.length > 60,
    },
    shape: {
      branch_count: branchSignals.length, open_count: branchSignals.length - closedCount,
      closed_count: closedCount, proposed_count: proposedCount, dead_count: deadAll.length,
      point_count: pointCount, points_per_branch: branchSignals.length ? Number((pointCount / branchSignals.length).toFixed(1)) : 0,
    },
    branch_signals: branchSignals,
    dead_branches: deadAll.slice(0, 60),
    heatmap,
    people: peopleRows,
    requests: {
      received_count: receivedCount, unknown_counterpart_count: unknownCounterpartCount,
      dated_count: requestSeries.total_points, shown_dated_count: requestSeries.shown_points,
      undated_count: Math.max(0, receivedCount - requestSeries.total_points),
      counterparts, weeks: requestSeries.weeks, truncated: requestSeries.truncated,
    },
  };
}

export function listContextProjects(root) {
  const base = join(resolve(root), "_workmeta");
  const out = [];
  let entries;
  try { entries = readdirSync(base, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (!e.isDirectory() || !PROJECT_SEG_RE.test(e.name)) continue;
    if (existsSync(join(base, e.name, "project_context", "nodes.csv"))) out.push(e.name);
  }
  return out.sort();
}

export function buildContextGraph(root, projectRaw, { store = null } = {}) {
  const project = String(projectRaw ?? "").trim();
  if (!PROJECT_SEG_RE.test(project) || project.includes("..")) return { error: "project_invalid" };
  const dir = join(resolve(root), "_workmeta", project, "project_context");
  if (!existsSync(join(dir, "nodes.csv"))) return { error: "context_not_found", project };

  const nodesRaw = readCsvObjects(join(dir, "nodes.csv"));
  const edgesRaw = readCsvObjects(join(dir, "edges.csv"));
  const sourcesRaw = readCsvObjects(join(dir, "sources.csv"));
  const branchMeta = new Map(readCsvObjects(join(dir, "branches.csv")).map((b) => [b.branch_key, b]));
  const branches = readCsvObjects(join(dir, "summaries", "branch_summaries.csv")).map((b) => ({
    ...(branchMeta.get(b.branch_key) || {}),
    branch_key: b.branch_key, label: b.label,
    branch_kind: b.branch_kind || branchMeta.get(b.branch_key)?.branch_kind || "legacy",
    anchor_ref: b.anchor_ref || branchMeta.get(b.branch_key)?.anchor_ref || null,
    status: b.status || branchMeta.get(b.branch_key)?.status || null,
    born_at: b.born_at || branchMeta.get(b.branch_key)?.born_at || null,
    closed_at: b.closed_at || branchMeta.get(b.branch_key)?.closed_at || null,
    source_count: Number(b.source_count) || 0,
    task_count: Number(b.task_count) || 0,
    open_review_count: Number(b.open_review_count) || 0,
    updated_at: b.updated_at || null,
  }));
  for (const b of branchMeta.values()) {
    if (branches.some((row) => row.branch_key === b.branch_key)) continue;
    branches.push({
      branch_key: b.branch_key,
      label: b.label,
      branch_kind: b.branch_kind || "legacy",
      anchor_ref: b.anchor_ref || null,
      status: b.status || null,
      born_at: b.born_at || null,
      closed_at: b.closed_at || null,
      source_count: 0,
      task_count: 0,
      open_review_count: 0,
      updated_at: b.updated_at || null,
    });
  }
  const occurrences = readCsvObjects(join(dir, "occurrences.csv")).map((o) => ({
    series_key: o.series_key,
    occurrence_key: o.occurrence_key,
    branch_ref: o.branch_ref || null,
    source_count: Number(o.source_count) || 0,
    spawned_item_refs: o.spawned_item_refs ? o.spawned_item_refs.split(";").filter(Boolean) : [],
    updated_at: o.updated_at || null,
  }));

  const truncated = nodesRaw.length > MAX_NODES;
  const nodes = nodesRaw.slice(0, MAX_NODES).map((n) => ({
    id: n.node_id, type: n.node_type, label: n.label,
    branch_key: n.branch_key || null, status: n.status || null,
    created_at: n.created_at || null, updated_at: n.updated_at || null,
  }));
  const keep = new Set(nodes.map((n) => n.id));
  const edges = edgesRaw
    .filter((e) => keep.has(e.from_node_id) && keep.has(e.to_node_id))
    .map((e) => ({
      from: e.from_node_id, to: e.to_node_id, type: e.edge_type,
      confidence: e.confidence || null,
    }));
  const diagnostics = deriveContextDiagnostics({ project, branches, nodes, edges, sources: sourcesRaw, store, graphTruncated: truncated, graphNodeTotal: nodesRaw.length });

  const byType = {};
  for (const n of nodes) byType[n.type] = (byType[n.type] ?? 0) + 1;
  const reviewRows = readCsvObjects(join(dir, "review_queue.csv"));
  const openReviews = reviewRows.filter((r) => (r.status || "").trim() === "open").length;

  return {
    schema: CONTEXT_GRAPH_SCHEMA,
    generated_from: "soulforge.project_context.v0",
    content_policy: "metadata_only",
    project, nodes, edges, branches, occurrences, diagnostics,
    counts: { by_node_type: byType, edge_count: edges.length, open_reviews: openReviews, stem_occurrences: occurrences.length, truncated },
  };
}

// B9a 가지 이야기(기원/경로/종결) — docs/slices/B9-STEM-RIVER-VIEW.md §3. 읽기전용·metadata_only.
// 시간좌표는 노드 원장 created_at 금지(대량 이관 일괄 스탬프) — sources.source_time·core_mail.at
// 실일시만 사용(패킷 66행 데이터 정직성 결정). store 는 조인 전용(suffix 메일·이벤트·완료·산출물),
// 이벤트 append 금지. 1등급 확정 링크만 이야기로(온톨로지 연결 등급 원칙).
export function buildBranchStory(root, projectRaw, branchRaw, { store = null, maxPoints = MAX_STORY_POINTS } = {}) {
  const project = String(projectRaw ?? "").trim();
  if (!PROJECT_SEG_RE.test(project) || project.includes("..")) return { error: "project_invalid" };
  const branchKey = String(branchRaw ?? "").trim();
  if (!branchKey) return { error: "branch_required" };
  const dir = join(resolve(root), "_workmeta", project, "project_context");
  if (!existsSync(join(dir, "nodes.csv"))) return { error: "context_not_found", project };

  const branch = readCsvObjects(join(dir, "branches.csv")).find((b) => b.branch_key === branchKey) ?? null;
  const branchNodes = readCsvObjects(join(dir, "nodes.csv")).filter((n) => (n.branch_key || "") === branchKey);
  if (!branch && !branchNodes.length) return { error: "branch_not_found", project, branch: branchKey };

  // 점 재료 ① sources.csv — 그래프 API 미로딩분을 여기서 직접 로딩(branch_key/branch_ref 매칭).
  const branchRef = `branch:${project}:${branchKey}`;
  const sources = readCsvObjects(join(dir, "sources.csv"))
    .filter((s) => s.branch_key === branchKey || s.branch_ref === branchRef);
  // 메일 소스는 이력키 suffix 조인으로 실일시·방향·상대 복원(external_ref=`mailcsv:<이력키>`).
  const historyKeys = [...new Set(sources
    .map((s) => String(s.external_ref ?? ""))
    .filter((r) => r.startsWith("mailcsv:"))
    .map((r) => r.slice("mailcsv:".length)))];
  const mailByKey = store ? store.mailByHistoryKeys(historyKeys, { project }) : new Map();
  const points = sources.map((s) => {
    const ref = String(s.external_ref ?? "");
    const mail = ref.startsWith("mailcsv:") ? (mailByKey.get(ref.slice("mailcsv:".length)) ?? null) : null;
    return {
      kind: s.source_kind || "source",
      at: mail?.at || s.source_time || null,
      title: mail?.subject || s.title || "",
      direction: mail?.direction ?? null,
      counterpart: mail?.counterpart ?? null,
      mail_id: mail?.id ?? null,
    };
  });

  // 점 재료 ② 가지 소속 할일의 사람-확정 이벤트(생성/전환/담당/재부착 — 경로의 '전환' 단).
  const itemIds = new Set();
  const anchor = String(branch?.anchor_ref ?? "");
  if (anchor.startsWith("item:")) itemIds.add(anchor.slice(5));
  for (const n of branchNodes) {
    const nid = String(n.node_id ?? "");
    if (nid.startsWith("item:")) itemIds.add(nid.slice(5));
  }
  const events = store && itemIds.size ? store.eventsForItems([...itemIds]) : [];
  for (const e of events) {
    points.push({
      kind: `event:${e.kind}`, at: e.at ?? null,
      title: e.to_val ?? e.note ?? "", from: e.from_val ?? null,
      actor: e.actor_ref ?? null, item_ref: e.item_ref,
    });
  }

  points.sort((a, b) => String(a.at ?? "9999").localeCompare(String(b.at ?? "9999")));
  const truncated = points.length > maxPoints;
  const path = truncated ? points.slice(0, maxPoints) : points;
  // 기원 = 가지의 첫 점(§3-1: 스레드 첫 수신 메일 또는 할일 생성 이벤트) — 이력줄기도 동일 규칙
  // (최초 회차의 첫 소스 메일이 시간순 첫 점이 된다). 실일시 있는 점 우선.
  const origin = path.find((p) => p.at) ?? path[0] ?? null;

  // 종결 = completion_log(완료 일시·담당) + 산출물(core_deliverable title 역링크) — 미종결이면 열려 있음+마지막 움직임.
  const completions = store && itemIds.size ? store.completionsForItems([...itemIds]) : [];
  const deliverables = store && itemIds.size ? store.deliverablesForItems([...itemIds]) : [];
  const lastActivity = [...path].reverse().find((p) => p.at)?.at ?? null;
  const done = completions.length > 0;
  const closure = {
    done,
    done_at: done ? completions[completions.length - 1].done_at : null,
    completed_by: done ? (completions[completions.length - 1].completed_by ?? completions[completions.length - 1].assignee_ref ?? null) : null,
    deliverables,
    closed_at: branch?.closed_at || null,
    open: !done && !(branch?.closed_at),
    last_activity_at: lastActivity,
  };

  return {
    schema: BRANCH_STORY_SCHEMA,
    generated_from: "soulforge.project_context.v0",
    content_policy: "metadata_only",
    project,
    branch: {
      branch_key: branchKey,
      label: branch?.label || branchKey,
      branch_kind: branch?.branch_kind || "legacy",
      anchor_ref: branch?.anchor_ref || null,
      status: branch?.status || null,
      born_at: branch?.born_at || null,
      closed_at: branch?.closed_at || null,
    },
    origin, path, closure,
    counts: { points: points.length, shown: path.length, truncated, items: itemIds.size },
  };
}
