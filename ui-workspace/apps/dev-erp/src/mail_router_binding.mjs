// 메일→과제 라우터 바인딩(_workmeta/system/bindings/mail_project_router.yaml) 읽기 전용 파서.
// 목적: 관리자 화면에 "이미 살아있는 엔진 규칙"을 보여줘 사용자 규칙을 거기에 맞게 추가하게 함
// (2026-07-05 owner: "현재 이미 만들어진 규칙들도 보이게"). 쓰기는 하지 않는다 — 정본은 엔진 레인.
// zero-dep 라인 파싱(knowledge_registry 방식): 이 바인딩의 고정 구조(rules[] + match_policy 리스트)만 읽는다.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const ROUTER_BINDING_REL = "_workmeta/system/bindings/mail_project_router.yaml";
const MATCH_LIST_KEYS = ["sender_addresses", "subject_any", "private_body_any", "private_html_any", "hint_keywords", "exact_keywords"];

export function readRouterBinding(root) {
  const p = resolve(root, ROUTER_BINDING_REL);
  if (!existsSync(p)) return { found: false, path: ROUTER_BINDING_REL, rules: [] };
  let text;
  try { text = readFileSync(p, "utf-8"); } catch { return { found: false, path: ROUTER_BINDING_REL, rules: [] }; }
  const rules = [];
  let inRules = false; let rule = null; let listKey = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^rules:\s*$/.test(line)) { inRules = true; continue; }
    if (inRules && /^[A-Za-z_]+:/.test(line)) break; // 다음 최상위 섹션에서 종료
    if (!inRules) continue;
    const mRule = line.match(/^ {2}- rule_id:\s*(\S+)/);
    if (mRule) { rule = { rule_id: mRule[1], project_code: "", state: "", confidence: "", next_action: "", match: {} }; rules.push(rule); listKey = null; continue; }
    if (!rule) continue;
    const mScalar = line.match(/^ {4}(project_code|state|confidence_if_matched|next_action_if_matched):\s*(.+?)\s*$/);
    if (mScalar) {
      const k = mScalar[1] === "confidence_if_matched" ? "confidence" : (mScalar[1] === "next_action_if_matched" ? "next_action" : mScalar[1]);
      rule[k] = mScalar[2]; listKey = null; continue;
    }
    const mList = line.match(/^ {6}([a-z_]+):\s*(\[\])?\s*$/);
    if (mList && MATCH_LIST_KEYS.includes(mList[1])) {
      listKey = mList[2] ? null : mList[1];
      if (!mList[2]) rule.match[mList[1]] = rule.match[mList[1]] ?? [];
      continue;
    }
    const mItem = line.match(/^ {8}- (.+?)\s*$/);
    if (mItem && listKey) { rule.match[listKey].push(mItem[1]); continue; }
    if (/^ {6}[a-z_]+:/.test(line)) listKey = null; // match_policy 내 다른 키(비리스트)
  }
  return { found: true, path: ROUTER_BINDING_REL, rules };
}
