// 줄기(project_context) 그래프 서빙(2026-07-04 owner 승인): _workmeta/<과제>/project_context 의
// nodes/edges CSV(soulforge.project_context.v0 — 이미 그래프 형태)를 읽어 화면용 JSON 으로 변환한다.
// 읽기 전용·메타 전용(원문 없음). 쓰기는 행보관 도구(haengbogwan_project_context.mjs)만 한다.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseCsv } from "./autosync.mjs";

export const CONTEXT_GRAPH_SCHEMA = "dev_erp.context_graph.v1";
const PROJECT_SEG_RE = /^[A-Za-z0-9가-힣][A-Za-z0-9가-힣._-]*$/;
const MAX_NODES = 3000;

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
  const branches = readCsvObjects(join(dir, "summaries", "branch_summaries.csv")).map((b) => ({
    branch_key: b.branch_key, label: b.label,
    source_count: Number(b.source_count) || 0,
    task_count: Number(b.task_count) || 0,
    open_review_count: Number(b.open_review_count) || 0,
    updated_at: b.updated_at || null,
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
    project, nodes, edges, branches,
    counts: { by_node_type: byType, edge_count: edges.length, open_reviews: openReviews, truncated },
  };
}
