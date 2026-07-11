// 줄기(project_context) 그래프 서빙(2026-07-04 owner 승인): _workmeta/<과제>/project_context 의
// nodes/edges CSV(soulforge.project_context.v0 — 이미 그래프 형태)를 읽어 화면용 JSON 으로 변환한다.
// 읽기 전용·메타 전용(원문 없음). 쓰기는 행보관 도구(haengbogwan_project_context.mjs)만 한다.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseCsv } from "./autosync.mjs";

export const CONTEXT_GRAPH_SCHEMA = "dev_erp.context_graph.v1";
export const BRANCH_STORY_SCHEMA = "dev_erp.branch_story.v1";
const PROJECT_SEG_RE = /^[A-Za-z0-9가-힣][A-Za-z0-9가-힣._-]*$/;
const MAX_NODES = 3000;
const MAX_STORY_POINTS = 300; // B9a 점 상한(한 가지 91통 실측) — MAX_NODES 선례대로 cap+truncated

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

export function buildContextGraph(root, projectRaw) {
  const project = String(projectRaw ?? "").trim();
  if (!PROJECT_SEG_RE.test(project) || project.includes("..")) return { error: "project_invalid" };
  const dir = join(resolve(root), "_workmeta", project, "project_context");
  if (!existsSync(join(dir, "nodes.csv"))) return { error: "context_not_found", project };

  const nodesRaw = readCsvObjects(join(dir, "nodes.csv"));
  const edgesRaw = readCsvObjects(join(dir, "edges.csv"));
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

  const byType = {};
  for (const n of nodes) byType[n.type] = (byType[n.type] ?? 0) + 1;
  const reviewRows = readCsvObjects(join(dir, "review_queue.csv"));
  const openReviews = reviewRows.filter((r) => (r.status || "").trim() === "open").length;

  return {
    schema: CONTEXT_GRAPH_SCHEMA,
    generated_from: "soulforge.project_context.v0",
    content_policy: "metadata_only",
    project, nodes, edges, branches, occurrences,
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
  const mailByKey = store ? store.mailByHistoryKeys(historyKeys) : new Map();
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
