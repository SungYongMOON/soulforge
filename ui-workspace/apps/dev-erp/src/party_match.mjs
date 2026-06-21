// 파티 매칭(S5): .party/*/party.yaml 의 preferred_monster_types 를 읽어
// monster_type → party_id 역인덱스를 만든다. 분류된 monster_type 으로 파티는 표 lookup(결정적, LLM 무관).
// 정본(.party)은 read-only projection — 여기선 라우팅 힌트만 추출(권한/실행은 미션/워크플로/owner).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function loadPartyMonsterTypes(root) {
  const dir = join(root, ".party");
  const typeToParty = {};
  let parties = [];
  try { parties = readdirSync(dir); } catch { return { types: [], typeToParty: {} }; }
  for (const d of parties) {
    let y;
    try { y = readFileSync(join(dir, d, "party.yaml"), "utf8"); } catch { continue; }
    // preferred_monster_types: 블록의 '  - xxx' 항목만 수집(다음 최상위 키 전까지).
    const m = y.match(/preferred_monster_types:\s*([\s\S]*?)(?:\n[A-Za-z_]+:|\nmember_slots|\nallowed_|\nappserver|\nnotes|$)/);
    if (!m) continue;
    for (const line of m[1].split(/\r?\n/)) {
      const mm = line.match(/^\s*-\s*([A-Za-z0-9_]+)\s*$/);
      if (mm && !(mm[1] in typeToParty)) typeToParty[mm[1]] = d; // 첫 선언 파티 우선
    }
  }
  return { types: Object.keys(typeToParty), typeToParty };
}

// monster_type → party_id (없으면 null).
export function partyForMonsterType(typeToParty, monsterType) {
  if (!monsterType) return null;
  return typeToParty[monsterType] ?? null;
}
