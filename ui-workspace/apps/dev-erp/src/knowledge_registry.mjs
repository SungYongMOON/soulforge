// Canon 지식 저장소(.registry/knowledge) 리더 — 메타데이터만 읽음(원문 미저장). ERP 는 소비자.
// 장부/canon 표준은 .registry 소유. 여기선 knowledge.yaml 의 공개안전 메타만 추출해 분야별로 묶는다.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

// 분야 4그룹 (owner 확정 2026-06-17). id→group, 미매핑은 'other'.
export const KNOWLEDGE_GROUPS = [
  { key: "standards", b: "표준·규격집", f: "율법·규격집",
    ids: ["dapa_weapon_system_test_eval_guidebook", "defense_quality_management_standards", "standardization_document_samples"] },
  { key: "domain", b: "분야 기술", f: "분야 비술",
    ids: ["sonar_signal_chain", "towed_body_sensor_stability"] },
  { key: "method", b: "지식·RAG 방법", f: "지식 연성술",
    ids: ["graph_rag", "lineage_method", "source_criticism"] },
  { key: "doctrine", b: "운영 규범·교리", f: "교리·규범",
    ids: ["boundary_governance", "frontline_doctrine", "escort_etiquette"] },
];
const GROUP_OF = new Map();
for (const g of KNOWLEDGE_GROUPS) for (const id of g.ids) GROUP_OF.set(id, g.key);

// 최소 YAML 추출(zero-dependency). 알려진 필드만 정규식 라인 스캔 — 원문 본문은 읽지 않음.
function parseEntry(text, id) {
  const get = (re) => { const m = text.match(re); return m ? m[1].trim() : null; };
  return {
    id,
    title: get(/^title:\s*(.+)$/m) || id,
    summary: get(/^summary:\s*(.+)$/m),
    status: get(/^status:\s*(.+)$/m) || "active",
    primary_domain: get(/^\s*primary_domain:\s*(.+)$/m),
    public_ref: (text.match(/https?:\/\/\S+/) || [null])[0],          // 공개 출처 URL(owner 승인 공개본)
    pointer: (text.match(/[\w./-]+\.source_card\.json/) || [null])[0], // 소스카드 포인터(워크스페이스 상대)
    group: GROUP_OF.get(id) || "other",
  };
}

export function knowledgeRegistryDir(here) {
  return resolve(here, "../../../.registry/knowledge");
}

export function readKnowledgeRegistry(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const yaml = join(dir, name, "knowledge.yaml");
    if (!existsSync(yaml)) continue;
    try { out.push(parseEntry(readFileSync(yaml, "utf-8"), name)); } catch { /* 손상 항목은 건너뜀 */ }
  }
  return out;
}

// 분야 그룹별 묶음 + 모드별 라벨. active 만 노출, 그룹/항목은 정의 순·제목순.
export function groupedKnowledge(dir, mode = "business") {
  const entries = readKnowledgeRegistry(dir).filter((e) => e.status === "active");
  const byKey = new Map();
  for (const e of entries) { if (!byKey.has(e.group)) byKey.set(e.group, []); byKey.get(e.group).push(e); }
  const sortT = (a, b) => String(a.title).localeCompare(String(b.title), "ko");
  const groups = KNOWLEDGE_GROUPS.map((g) => ({
    key: g.key, label: mode === "fantasy" ? g.f : g.b, entries: (byKey.get(g.key) ?? []).sort(sortT),
  }));
  const other = byKey.get("other");
  if (other?.length) groups.push({ key: "other", label: mode === "fantasy" ? "기타 전승" : "기타", entries: other.sort(sortT) });
  return groups.filter((g) => g.entries.length);
}
