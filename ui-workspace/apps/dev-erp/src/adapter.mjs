// INFRA-002: 읽기존 어댑터.
// 원칙: 원본 폴더를 직접 훑지 않는다. 승인된 메타 표면(정규화 JSON 또는
// soulforge snapshot JSON)만 읽어 콕핏 모델로 변환한다. 모든 ingest 는
// event_log 에 라벨과 함께 남는다 (데이터 신선도 = ingest 이벤트 at).
import { readFileSync } from "node:fs";

const SOULFORGE_SNAPSHOT_SCHEMA = "soulforge.snapshot.v0";
const OPERATION_BOARD_SCHEMA = "soulforge.operation_board_projection.v0";

// 정규화 입력: { projects[], stages[], people[], items[], mail[], artifacts[] }
export function ingestNormalized(store, data, { label = "real", source = "normalized_json" } = {}) {
  const report = { projects: 0, stages: 0, people: 0, items: 0, mail: 0, artifacts: 0, skipped: [] };
  for (const p of data.projects ?? []) {
    if (!p.id || !p.title) { report.skipped.push(`project:${JSON.stringify(p).slice(0, 40)}`); continue; }
    store.upsertProject({ ...p, data_label: label }); report.projects += 1;
  }
  for (const s of data.stages ?? []) {
    if (!s.id || !s.project_id) { report.skipped.push(`stage:${s.id ?? "?"}`); continue; }
    store.upsertStage(s); report.stages += 1;
  }
  for (const pe of data.people ?? []) {
    if (!pe.id || !pe.name) { report.skipped.push(`person:${pe.id ?? "?"}`); continue; }
    store.upsertPerson({ ...pe, data_label: label }); report.people += 1;
  }
  for (const i of data.items ?? []) {
    if (!i.id || !i.project_id || !i.title) { report.skipped.push(`item:${i.id ?? "?"}`); continue; }
    // 할일류(메일/회의/요청 변환물)는 full-fidelity writer 로 — upsertItem 은 work_type/완료기준/origin_mail_id/
    // anchor_stage_code/review_status 를 안 써서 손실됨. 미션류(단순 item)는 기존 upsertItem 유지.
    const isTask = !!(i.work_type || i.completion_criteria || i.origin_mail_id || i.anchor_stage_code || i.review_status)
      || /^(mailtask|manualtask):/.test(String(i.id));
    if (isTask && typeof store.ingestTaskItem === "function") {
      const r = store.ingestTaskItem({ ...i, project_code: i.project_code ?? i.project_id });
      if (r && !r.error) report.items += 1; else report.skipped.push(`task:${i.id}:${r?.error ?? "?"}`);
    } else {
      store.upsertItem({ ...i, data_label: label }); report.items += 1;
    }
  }
  for (const m of data.mail ?? []) {
    if (!m.id || !m.at || !m.subject) { report.skipped.push(`mail:${m.id ?? "?"}`); continue; }
    store.upsertMail({ ...m, data_label: label }); report.mail += 1;
  }
  for (const a of data.artifacts ?? []) {
    if (!a.id || !a.project_id || !a.pointer) { report.skipped.push(`artifact:${a.id ?? "?"}`); continue; }
    store.upsertArtifact({ ...a, data_label: label }); report.artifacts += 1;
  }
  store.appendEvent({
    actor_ref: source, actor_kind: "system", kind: "ingest",
    note: JSON.stringify(report), used_refs: [source], data_label: label
  });
  return report;
}

// soulforge snapshot 매핑 (보수적): 알아볼 수 있는 필드만 옮기고,
// 못 알아보는 구조는 skipped 로 보고한다. 원문/raw 는 다루지 않는다.
export function mapSoulforgeSnapshot(snapshot) {
  const out = { projects: [], items: [], mail: [], artifacts: [], stages: [], people: [] };
  const board = snapshot?.operation_board ?? snapshot ?? {};
  const dungeonItems = board?.sections?.dungeon_map?.items
    ?? board?.dungeon_map?.items
    ?? board?.sections?.dungeon_map?.rows
    ?? board?.dungeon_map?.rows
    ?? [];
  for (const row of dungeonItems) {
    const id = row.project_code ?? row.id;
    if (!id) continue;
    out.projects.push({
      id,
      title: row.title ?? row.label ?? id,
      health: row.health ?? "ok",
      stage_current: row.stage ?? null,
      source_ref: "guild_hall/state/snapshot/soulforge_snapshot.json"
    });
  }
  const missionItems = board?.sections?.mission_board?.items
    ?? board?.mission_board?.items
    ?? board?.sections?.mission_board?.rows
    ?? board?.mission_board?.rows
    ?? [];
  for (const row of missionItems) {
    const id = row.mission_id ?? row.id;
    if (!id || !row.project_code) continue;
    out.items.push({
      id,
      project_id: row.project_code,
      title: row.title ?? id,
      origin: "manual",
      status: row.readiness_status === "blocked" ? "blocked" : row.status === "completed" ? "done" : "open",
      encounter_role: "elite"
    });
  }
  return out;
}

export function ingestFromFile(store, path, { label = "real" } = {}) {
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const hasNormalizedRows = Array.isArray(raw?.projects) || Array.isArray(raw?.items);
  const hasSnapshotMarkers = raw && typeof raw === "object" && !Array.isArray(raw) && (
    "schema_version" in raw
    || "operation_board" in raw
    || "missions" in raw
    || "source_observations" in raw
    || "gateway" in raw
    || "roots" in raw
  );

  let normalized;
  if (hasSnapshotMarkers) {
    requireSnapshotSchema(raw);
    normalized = mapSoulforgeSnapshot(raw);
  } else if (hasNormalizedRows) {
    normalized = raw;
  } else {
    throw new Error("unsupported_ingest_shape: expected normalized {projects,items} or a versioned Soulforge snapshot");
  }
  return ingestNormalized(store, normalized, { label, source: path });
}

function requireSnapshotSchema(raw) {
  if (raw?.schema_version !== SOULFORGE_SNAPSHOT_SCHEMA) {
    throw new Error(
      `unsupported_snapshot_schema: expected ${SOULFORGE_SNAPSHOT_SCHEMA}, got ${schemaLabel(raw?.schema_version)}`,
    );
  }
  if (raw?.operation_board?.schema_version !== OPERATION_BOARD_SCHEMA) {
    throw new Error(
      `unsupported_operation_board_schema: expected ${OPERATION_BOARD_SCHEMA}, got ${schemaLabel(raw?.operation_board?.schema_version)}`,
    );
  }
}

function schemaLabel(value) {
  if (value === undefined || value === null || value === "") return "missing";
  return JSON.stringify(String(value).slice(0, 80));
}
