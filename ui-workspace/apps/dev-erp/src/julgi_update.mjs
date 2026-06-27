// ui-workspace/apps/dev-erp/src/julgi_update.mjs — 줄기 증분 갱신 (슬라이스3)
//   새 메일/사건 → 현재 줄기를 읽고 ADD/UPDATE/CLOSE '제안'을 만든다(가닥=thread_key 로 잇기).
//   설계: 모델 슬롯 + 결정적 폴백. P-4: 제안만, applyUpdates 는 owner-승인 경로에서만.
//   경계: 메일 메타(제목/발췌)만 입력, 본문 전체·첨부 미저장. text 는 ≤300자 요약.
import { JULGI_TYPES, addItem, updateItem, closeItem, listByProject } from "./julgi.mjs";

// 제목 정규화 → 가닥 키(같은 대화 묶기). 회신/전달 접두어·괄호 제거.
export function normSubject(subject) {
  let s = String(subject ?? "").toLowerCase();
  s = s.replace(/^(\s*(re|fw|fwd|회신|답장|전달)\s*:\s*)+/i, "");
  s = s.replace(/\[[^\]]*\]/g, " ").replace(/\([^)]*\)/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

const DATE_RE = /(20\d{2}\s*[-.\/년]\s*\d{1,2}\s*[-.\/월]\s*\d{1,2})|((?<!\d)\d{1,2}\s*[.\/월]\s*\d{1,2})/;
const CLOSE_RE = /(완료|수령|제출\s*완료|전달\s*완료|회신\s*완료|마무리|완납|done)/i;
const DELAY_RE = /(미수령|지연|안\s*옴|안\s*왔|연기|보류|미회신|누락)/i;
const REQ_RE = /(요청|요구|문의|확인\s*바|검토\s*요|회신\s*요|부탁)/i;

const ACTIVE = (i) => ["waiting", "open", "updated"].includes(i.status);

// 결정적 폴백: 신호로 op 결정. 같은 가닥(thread_key) 매칭이 있으면 그 항목을 잇고, 없으면 신규.
//   '안 빼먹기': 신호가 없어도 검토용 요청 후보(낮은 확신)로 남겨 누락 0.
function fallbackPropose(mail, current) {
  const subject = String(mail.subject ?? "");
  const blob = `${subject} ${String(mail.body_preview ?? "")}`;
  const tk = normSubject(subject);
  const source_ref = mail.source_ref ?? null;
  const related = current.filter((i) => i.thread_key && i.thread_key === tk && ACTIVE(i));
  const add = (type, salience, reason, confidence) =>
    ({ op: "add", item: { type, text: subject.slice(0, 300), salience, source_ref, thread_key: tk }, reason, confidence });

  // DELAY 를 CLOSE 보다 먼저: '미수령'이 '수령'(완료)으로 오인되지 않게.
  if (DELAY_RE.test(blob)) {
    if (related.length) return related.map((r) => ({ op: "update", id: r.id, patch: { status: "updated", text: `${r.text} · 지연/미수령`.slice(0, 300) }, reason: "지연/미수령 신호", confidence: "medium" }));
    return [add("리스크", "high", "지연 신호이나 매칭 없음→리스크 신규", "low")];
  }
  if (CLOSE_RE.test(blob)) {
    if (related.length) return related.map((r) => ({ op: "close", id: r.id, reason: "완료/수령/전달 신호", confidence: "medium" }));
    return [add("전달완료", "normal", "완료 신호이나 매칭 항목 없음→전달완료 신규", "low")];
  }
  if (DATE_RE.test(blob)) return [add("마감", "high", "날짜 신호→마감", "medium")];
  if (REQ_RE.test(blob)) return [add("요청", "normal", "요청/요구 신호", "medium")];
  return [add("요청", "low", "명시 신호 없음→검토용 요청 후보(안 빼먹기)", "low")];
}

// 제안 생성. extractor(=모델 슬롯) 있으면 우선. 항상 검증(8종·존재하는 id·op 타입) 후 반환.
export function proposeUpdates(db, project_id, mail, { extractor } = {}) {
  if (!project_id) throw new Error("project_id_required");
  if (!mail || !String(mail.subject ?? mail.body_preview ?? "").trim()) throw new Error("mail_required");
  const current = listByProject(db, project_id);
  let raw;
  if (typeof extractor === "function") raw = extractor(mail, current, { project_id }) || [];
  else raw = fallbackPropose(mail, current);
  if (!Array.isArray(raw)) throw new Error("extractor_must_return_array");

  const ids = new Set(current.map((i) => i.id));
  const sal = (s) => (["high", "normal", "low"].includes(s) ? s : "normal");
  const out = [];
  for (const op of raw) {
    if (op?.op === "add") {
      const it = op.item || {};
      if (!JULGI_TYPES.includes(it.type) || !String(it.text ?? "").trim()) continue; // 환각/8종 외 방어
      out.push({ op: "add", item: { type: it.type, text: String(it.text).trim().slice(0, 300), salience: sal(it.salience), source_ref: it.source_ref ?? null, thread_key: it.thread_key ?? null, parent_id: it.parent_id ?? null }, reason: op.reason || "", confidence: op.confidence || "low" });
    } else if (op?.op === "update") {
      if (!ids.has(op.id)) continue; // 없는 항목 갱신 방어
      out.push({ op: "update", id: op.id, patch: op.patch || {}, reason: op.reason || "", confidence: op.confidence || "low" });
    } else if (op?.op === "close") {
      if (!ids.has(op.id)) continue;
      out.push({ op: "close", id: op.id, reason: op.reason || "", confidence: op.confidence || "low" });
    }
  }
  return out;
}

// owner 승인 후 적용. 반환 {added, updated, closed} (id 배열).
export function applyUpdates(db, project_id, ops) {
  const res = { added: [], updated: [], closed: [] };
  for (const op of ops) {
    if (op.op === "add") res.added.push(addItem(db, { project_id, ...op.item }));
    else if (op.op === "update") { updateItem(db, op.id, op.patch); res.updated.push(op.id); }
    else if (op.op === "close") { closeItem(db, op.id); res.closed.push(op.id); }
  }
  return res;
}
