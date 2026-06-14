// dev-erp 저장 계층 (DESIGN.md 7절 구현)
// 구역 3개: core_*(업무 진실) / event_log(append-only) / game_*(게임 확장).
// 원칙: 몬스터=업무 레코드 동일 행, 게임 전용은 확장 테이블, 점수는 계산,
//       연결은 stable id + ref 문자열.
import { DatabaseSync } from "node:sqlite";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 과제시작년도 도출: 과제번호 접두 P{YY}- 에서(P26-014→2026, P00-TEST→2000). 형식 안 맞으면 null.
export function deriveStartYear(id) {
  const m = String(id ?? "").match(/^P(\d{2})-/i);
  return m ? 2000 + Number(m[1]) : null;
}

// P2b 비밀번호 해시: scrypt. 형식 "scrypt$<saltHex>$<hashHex>". 평문 저장 금지.
export function hashPassword(plain) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(plain), salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}
export function verifyPassword(plain, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = scryptSync(String(plain), salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const SCHEMA_VERSION = "dev_erp.v1";

const DDL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS core_project (
  id TEXT PRIMARY KEY,            -- 예: P00-TEST (stable id = 주소)
  title TEXT NOT NULL,
  health TEXT NOT NULL DEFAULT 'ok',   -- ok|watch|risk|stopped
  class TEXT NOT NULL DEFAULT 'active', -- active|inbox|internal|archive (페르소나 합의 분류)
  stage_current TEXT,
  start_year INTEGER,             -- 과제시작년도(착수). 기본=ID 접두 P{YY} 도출, 명시 override 가능
  source_ref TEXT,                -- soulforge ref (있다면)
  data_label TEXT NOT NULL DEFAULT 'synthetic'
);
CREATE TABLE IF NOT EXISTS core_stage (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES core_project(id),
  title TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  gate_rule TEXT,                 -- 필수 산출물/조건 설명 (P4에서 강제 로직)
  status TEXT NOT NULL DEFAULT 'open'  -- open|cleared
);
CREATE TABLE IF NOT EXISTS core_person (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  data_label TEXT NOT NULL DEFAULT 'synthetic'
);
CREATE TABLE IF NOT EXISTS core_item (   -- 몬스터 = 할일 (동일 행)
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES core_project(id),
  stage_id TEXT,
  title TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'manual',      -- mail|schedule|manual
  spawn_kind TEXT NOT NULL DEFAULT 'spawned', -- spawned|fixed|respawn
  encounter_role TEXT NOT NULL DEFAULT 'normal', -- normal|elite|boss
  difficulty INTEGER NOT NULL DEFAULT 2,      -- 1~5
  urgency TEXT NOT NULL DEFAULT 'normal',     -- low|normal|high
  automation_level TEXT NOT NULL DEFAULT 'manual', -- manual|assisted|semi|auto
  assignee_ref TEXT,                          -- core_person.id 또는 unit ref
  party_ref TEXT,
  status TEXT NOT NULL DEFAULT 'open',        -- open|doing|waiting|blocked|done
  due TEXT,                                   -- YYYY-MM-DD
  result TEXT,
  log_ref TEXT,
  guide_artifact_id INTEGER,                  -- P2a: 가이드 산출물 연결 (선택)
  guide_step_key TEXT,                        -- P2a: 가이드 스텝 연결 (선택)
  origin_mail_id TEXT,                        -- P2a: 메일→할일 승격 출처 (메일 메타 id)
  created_by TEXT,                            -- P2a: RBAC 설계 자리 (강제는 P2b)
  data_label TEXT NOT NULL DEFAULT 'synthetic'
);
CREATE TABLE IF NOT EXISTS core_mail (   -- 메일 이력 metadata-only
  id TEXT PRIMARY KEY,
  project_id TEXT,
  at TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'in',  -- in|out
  subject TEXT NOT NULL,                 -- 제목 메타 (원문 본문 저장 금지)
  counterpart TEXT,                      -- 상대 (별칭/회사명 수준)
  pointer_ref TEXT,                      -- 원문 위치 포인터 (보호 저장소)
  data_label TEXT NOT NULL DEFAULT 'synthetic'
);
CREATE TABLE IF NOT EXISTS core_artifact ( -- 산출물 포인터 (원문 미저장)
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,                    -- bom|schematic|gerber|report|note|etc
  title TEXT NOT NULL,
  pointer TEXT NOT NULL,                 -- 경로/저장소 포인터
  sha256 TEXT,
  updated_at TEXT,
  data_label TEXT NOT NULL DEFAULT 'synthetic'
);
CREATE TABLE IF NOT EXISTS event_log (   -- append-only. battle_event 호환
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_ref TEXT NOT NULL,
  actor_kind TEXT NOT NULL DEFAULT 'human',  -- human|ai|mixed|system
  item_ref TEXT,
  kind TEXT NOT NULL,                    -- ingest|view|status|comment|...
  from_val TEXT,
  to_val TEXT,
  intervention_count INTEGER,
  bottleneck_reason TEXT,
  used_refs TEXT,                        -- JSON 배열: 사용한 skill/knowledge/tool ref
  data_label TEXT NOT NULL DEFAULT 'synthetic',
  note TEXT,
  project_ref TEXT                       -- P2a: 과제 차원 (허브 이력 필터)
);
CREATE TABLE IF NOT EXISTS guide_artifact ( -- 가이드: 과제×단계의 산출물 등록 (메타)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  stage_code TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE(project_id, stage_code, name)
);
CREATE TABLE IF NOT EXISTS guide_step (     -- 가이드: 산출물 절차 스텝 체크 상태
  artifact_id INTEGER NOT NULL REFERENCES guide_artifact(id),
  step_key TEXT NOT NULL,
  done_at TEXT,
  actor TEXT,
  PRIMARY KEY (artifact_id, step_key)
);
CREATE TABLE IF NOT EXISTS mail_label (   -- Gmail식 수동 라벨 (메타데이터, 첫 쓰기 도메인)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#195a8e'
);
CREATE TABLE IF NOT EXISTS mail_label_map (
  mail_id TEXT NOT NULL,
  label_id INTEGER NOT NULL REFERENCES mail_label(id),
  PRIMARY KEY (mail_id, label_id)
);
CREATE TABLE IF NOT EXISTS game_profile ( -- 게임 전용 확장 (core 는 모름)
  item_ref TEXT PRIMARY KEY REFERENCES core_item(id),
  sprite TEXT,
  grade_override TEXT,                   -- 슬라임|오크|트롤|보스 표시 오버라이드
  lore TEXT
);
-- P2b: 계정·세션·권한(RBAC visible-but-locked)·계정별 대시보드 레이아웃.
-- 익명(계정 0개/미로그인)이면 앱은 현행대로 동작(하위호환). 계정은 추가 기능.
CREATE TABLE IF NOT EXISTS core_account (
  id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES core_person(id),
  username TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_session (
  token TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES core_account(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rbac_role ( id TEXT PRIMARY KEY, name TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS rbac_account_role (
  account_id TEXT NOT NULL REFERENCES core_account(id),
  role_id TEXT NOT NULL REFERENCES rbac_role(id),
  PRIMARY KEY (account_id, role_id)
);
CREATE TABLE IF NOT EXISTS rbac_permission (
  role_id TEXT NOT NULL REFERENCES rbac_role(id),
  resource TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1,
  access  INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (role_id, resource)
);
CREATE TABLE IF NOT EXISTS user_dashboard_layout (
  account_id TEXT PRIMARY KEY REFERENCES core_account(id),
  layout_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- 회의록(메타 전용·고아 want 재수용). 원문/첨부 미저장: summary_pointer 는 위치 문자열만.
-- 액션아이템 자동추출(LLM·원문)은 갈림길⑨ 미결로 보류 — 여기선 기존 할일(core_item)을 수동 링크만.
CREATE TABLE IF NOT EXISTS core_meeting (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  title TEXT NOT NULL,
  at TEXT,
  attendees TEXT,
  summary_pointer TEXT,
  data_label TEXT NOT NULL DEFAULT 'synthetic',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meeting_action_map (
  meeting_id TEXT NOT NULL REFERENCES core_meeting(id),
  item_id TEXT NOT NULL REFERENCES core_item(id),
  PRIMARY KEY (meeting_id, item_id)
);
-- 구매/발주 (P4 다음 1순위). 거래처=공유 마스터, 발주=문서체인(요청→견적→발주→입고→검수→완료),
-- 발주 1건이 여러 과제를 묶음(N:N). 메타 전용(금액·납기·포인터만, 원문/첨부 미저장).
CREATE TABLE IF NOT EXISTS core_party (   -- 거래처/업체 공유 마스터
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'vendor',    -- vendor|customer|internal
  contact TEXT,
  data_label TEXT NOT NULL DEFAULT 'synthetic'
);
CREATE TABLE IF NOT EXISTS core_purchase ( -- 발주 문서(체인)
  id TEXT PRIMARY KEY,
  party_id TEXT REFERENCES core_party(id),
  title TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'request',  -- request|quote|order|receive|inspect|closed
  amount REAL,
  currency TEXT DEFAULT 'KRW',
  due TEXT,
  pointer TEXT,                           -- 견적서/발주서 위치(원문 미저장)
  created_by TEXT,
  data_label TEXT NOT NULL DEFAULT 'synthetic',
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS purchase_project_map ( -- 발주↔과제 N:N
  purchase_id TEXT NOT NULL REFERENCES core_purchase(id),
  project_id TEXT NOT NULL REFERENCES core_project(id),
  PRIMARY KEY (purchase_id, project_id)
);
-- 파일 첨부(메타 포인터 전용·원문 미저장, 하위호환). 어느 엔터티(item/project/purchase/meeting)든 위치만 연결.
CREATE TABLE IF NOT EXISTS core_attachment (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,   -- item|project|purchase|meeting
  entity_id TEXT NOT NULL,
  name TEXT NOT NULL,
  pointer TEXT NOT NULL,       -- 경로/URL (원문 미저장)
  kind TEXT,                   -- doc|sheet|image|drawing|etc (확장자 추정)
  category TEXT,               -- 배치 제안 결과(⑧, 적용 아님)
  created_by TEXT,
  data_label TEXT NOT NULL DEFAULT 'synthetic',
  created_at TEXT
);
-- 연락처 마스터(메타 전용). 사내/사외 연락 정보. 거래처(party) 링크 + 과제 N:N. (잊힌 want)
CREATE TABLE IF NOT EXISTS core_contact (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  org TEXT,                                 -- 소속(회사/팀)
  role TEXT,                                -- 직책/역할
  email TEXT,
  phone TEXT,
  party_id TEXT REFERENCES core_party(id),  -- 거래처 링크(선택)
  data_label TEXT NOT NULL DEFAULT 'synthetic'
);
CREATE TABLE IF NOT EXISTS contact_project_map ( -- 연락처↔과제 N:N
  contact_id TEXT NOT NULL REFERENCES core_contact(id),
  project_id TEXT NOT NULL REFERENCES core_project(id),
  PRIMARY KEY (contact_id, project_id)
);
-- P3 재고/BOM/부품 (전사 공유 마스터; 과제는 '사용'만 태깅). 메타 전용·외부전송 0(공급사 실시간 조회 보류).
CREATE TABLE IF NOT EXISTS core_part (   -- 부품/품목 마스터 (프로젝트 하위 아님)
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  part_no TEXT,                          -- 품번
  type TEXT,                             -- resistor|capacitor|ic|connector|board|material|etc
  grp TEXT,                              -- 분류 그룹
  spec TEXT,                             -- 특성(텍스트)
  uom TEXT NOT NULL DEFAULT 'ea',        -- 단위
  maker TEXT,
  min_qty REAL NOT NULL DEFAULT 0,       -- 안전재고(내부 판정 기준)
  data_label TEXT NOT NULL DEFAULT 'synthetic'
);
CREATE TABLE IF NOT EXISTS bom_edge (    -- BOM 부모-자식 구성 (board가 부모면 그 BOM 묶음)
  parent_part_id TEXT NOT NULL REFERENCES core_part(id),
  child_part_id TEXT NOT NULL REFERENCES core_part(id),
  qty REAL NOT NULL DEFAULT 1,
  ref_des TEXT,                          -- 참조지정자(R1,C3 등)
  PRIMARY KEY (parent_part_id, child_part_id)
);
CREATE TABLE IF NOT EXISTS core_location ( -- 위치 트리(창고>랙>선반>칸) + 가상위치(수리중/분실 등)
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'bin',      -- warehouse|rack|shelf|bin|virtual
  parent_id TEXT REFERENCES core_location(id),
  is_virtual INTEGER NOT NULL DEFAULT 0, -- 1=가상(수리중/분실/공급사 등; 재고부족 판정서 제외)
  data_label TEXT NOT NULL DEFAULT 'synthetic'
);
CREATE TABLE IF NOT EXISTS core_stock (  -- 재고 = 품목 × 위치 교차
  part_id TEXT NOT NULL REFERENCES core_part(id),
  location_id TEXT NOT NULL REFERENCES core_location(id),
  qty REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (part_id, location_id)
);
CREATE TABLE IF NOT EXISTS part_project_map ( -- 부품↔과제 '사용' 링크 N:N
  part_id TEXT NOT NULL REFERENCES core_part(id),
  project_id TEXT NOT NULL REFERENCES core_project(id),
  PRIMARY KEY (part_id, project_id)
);
CREATE TABLE IF NOT EXISTS artifact_requirement ( -- P-1 완결성 게이트: 단계/보드유형별 필수 기술자료 세트
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_kind TEXT NOT NULL,             -- stage|board_type
  scope_key TEXT NOT NULL,              -- stage_code 또는 board type
  artifact_type TEXT NOT NULL,          -- bom|gerber|digikey|schematic|pcb|block_diagram
  label TEXT,
  mode TEXT NOT NULL DEFAULT 'hard',    -- hard|soft
  seq INTEGER NOT NULL DEFAULT 0,
  UNIQUE(scope_kind, scope_key, artifact_type)
);
CREATE TABLE IF NOT EXISTS se_stage_template ( -- P-2 SE 스케줄러: 단계 규칙 템플릿 헤더
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS se_stage_template_stage ( -- 템플릿의 단계(마일스톤 표시)
  template_key TEXT NOT NULL REFERENCES se_stage_template(key),
  stage_code TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  is_milestone INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (template_key, stage_code)
);
CREATE TABLE IF NOT EXISTS se_deliverable_template ( -- 단계별 산출물 + 마일스톤 기준 상대 오프셋
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_key TEXT NOT NULL REFERENCES se_stage_template(key),
  anchor_stage_code TEXT NOT NULL,
  offset_days INTEGER NOT NULL DEFAULT 0,
  deliverable_name TEXT NOT NULL,
  default_artifact_type TEXT,
  UNIQUE(template_key, anchor_stage_code, deliverable_name)
);
-- 챗봇 매뉴얼/FAQ (로컬 작은 모델의 '검색·읽기'용; 추론 아님). 야간 고급 LLM(tool_pc)이 질문로그로 갱신.
CREATE TABLE IF NOT EXISTS core_faq (
  id TEXT PRIMARY KEY,
  topic TEXT,                            -- 분류
  question TEXT NOT NULL,                -- 대표 질문/제목
  answer TEXT NOT NULL,                  -- 매뉴얼 답변(정리된 텍스트)
  pointer TEXT,                          -- 원문/매뉴얼 위치(선택)
  keywords TEXT,                         -- 매칭 키워드(쉼표)
  data_label TEXT NOT NULL DEFAULT 'synthetic'
);
-- P-10 지식 카탈로그: 출처기반 지식 카드(FAQ 와 별 축). 원문 미저장(pointer+source_ref 문자열만).
CREATE TABLE IF NOT EXISTS core_knowledge (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,                          -- 요약(원문 아님)
  topic TEXT,
  source_ref TEXT,                       -- .registry/knowledge/<id> 등 정본 ref(미파싱)
  claim_ceiling TEXT DEFAULT 'source_supported',
  keywords TEXT,
  pointer TEXT,                          -- 외부 원문 위치(원문 미저장)
  data_label TEXT NOT NULL DEFAULT 'real'
);
-- P-6 능력 매트릭스: 사람↔역량(capability) N:N. 개인 평가점수 컬럼 없음(감시경계). weight=정렬용.
CREATE TABLE IF NOT EXISTS person_skill (
  person_id TEXT NOT NULL REFERENCES core_person(id),
  capability_label TEXT NOT NULL,
  source_ref TEXT,                       -- .registry/skills|classes ref(미파싱)
  weight REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (person_id, capability_label)
);
-- P-11 계산기: 공식은 화이트리스트 식(safeEval), example 회귀검증 통과해야 active.
CREATE TABLE IF NOT EXISTS core_calculator (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  formula TEXT NOT NULL,                 -- 화이트리스트 식(자작 파서 평가, eval 미사용)
  variables TEXT,                        -- JSON [{name,label}]
  unit_out TEXT,
  source_ref TEXT,                       -- .registry/knowledge ref(선택)
  status TEXT NOT NULL DEFAULT 'draft',  -- draft|active(회귀 통과해야 active)
  data_label TEXT NOT NULL DEFAULT 'real'
);
CREATE TABLE IF NOT EXISTS calculator_example (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  calculator_id TEXT NOT NULL REFERENCES core_calculator(id),
  inputs_json TEXT NOT NULL,
  expected REAL NOT NULL,
  tolerance REAL NOT NULL DEFAULT 1e-6
);
-- 챗 질문 로그(소프트웨어적 저장) — 야간 매뉴얼 갱신 입력. 미응답(matched_faq_id NULL)=갱신 큐.
CREATE TABLE IF NOT EXISTS chat_query_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  thread_id TEXT,
  question TEXT NOT NULL,
  matched_faq_id TEXT,
  data_label TEXT NOT NULL DEFAULT 'real'
);
CREATE TABLE IF NOT EXISTS ai_proposal ( -- P-4 키스톤: AI/규칙 산출 착지면(pending→사람 approve 후에만 도메인 쓰기)
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  target_ref TEXT,
  payload_json TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  decided_at TEXT,
  decided_by TEXT,
  applied_ref TEXT,
  used_refs TEXT,
  data_label TEXT NOT NULL DEFAULT 'real'
);
CREATE INDEX IF NOT EXISTS idx_proposal_status ON ai_proposal(status, at);
CREATE TABLE IF NOT EXISTS embed_view ( -- P-18 외부 시트 임베드(Smartsheet 등) read-only URL 메타
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'smartsheet',
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  project_id TEXT REFERENCES core_project(id),
  data_label TEXT NOT NULL DEFAULT 'real',
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_attach_entity ON core_attachment(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_chatlog_at ON chat_query_log(at);
CREATE INDEX IF NOT EXISTS idx_stock_part ON core_stock(part_id);
CREATE INDEX IF NOT EXISTS idx_bom_parent ON bom_edge(parent_part_id);
CREATE INDEX IF NOT EXISTS idx_item_proj ON core_item(project_id, status);
CREATE INDEX IF NOT EXISTS idx_item_due ON core_item(due);
CREATE INDEX IF NOT EXISTS idx_mail_at ON core_mail(at);
CREATE INDEX IF NOT EXISTS idx_event_at ON event_log(at);
`;

// P-2: ISO 날짜(YYYY-MM-DD)에 일수 가감 — 마일스톤 상대일정 계산(UTC 고정).
function addDaysIso(isoDate, days) {
  const d = new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

// SE-DATA: SE 프로세스 시드를 data/se_process_seed.json(Codex 작성)에서 읽어 채움.
// 파일 부재/오류 시 120_CDR stub 유지(하위호환). 모든 시드 멱등(INSERT OR IGNORE / ON CONFLICT).
// 방어: Codex 산출물의 필드명 변형(name|deliverable_name, artifact_type|default_artifact_type,
//       중첩{board_type,artifacts[]} | 평면{scope_kind,scope_key,artifact_type})을 모두 허용.
function seedSeProcess(db) {
  const stub = () => {
    db.exec("INSERT OR IGNORE INTO se_stage_template(key,name) VALUES('120_CDR','상세설계(CDR) 산출물 템플릿')");
    db.exec("INSERT OR IGNORE INTO se_stage_template_stage(template_key,stage_code,seq,is_milestone) VALUES('120_CDR','120',1,1)");
    const insDel = db.prepare("INSERT OR IGNORE INTO se_deliverable_template(template_key,anchor_stage_code,offset_days,deliverable_name,default_artifact_type) VALUES('120_CDR',?,?,?,?)");
    for (const [an, off, nm, at] of [["120", -7, "회로도 초안", "schematic"], ["120", 0, "CDR 패키지", null], ["120", 14, "시험계획서", null]]) insDel.run(an, off, nm, at);
  };
  let seedPath;
  try { seedPath = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "se_process_seed.json"); } catch { stub(); return; }
  if (!existsSync(seedPath)) { stub(); return; }
  let data;
  try { data = JSON.parse(readFileSync(seedPath, "utf-8")); } catch { stub(); return; }
  if (!data || !Array.isArray(data.templates) || !data.templates.length) { stub(); return; }
  const insT = db.prepare("INSERT OR IGNORE INTO se_stage_template(key,name) VALUES(?,?)");
  const insS = db.prepare("INSERT OR IGNORE INTO se_stage_template_stage(template_key,stage_code,seq,is_milestone) VALUES(?,?,?,?)");
  const insD = db.prepare("INSERT OR IGNORE INTO se_deliverable_template(template_key,anchor_stage_code,offset_days,deliverable_name,default_artifact_type) VALUES(?,?,?,?,?)");
  for (const t of data.templates) {
    if (!t || !t.key) continue;
    insT.run(t.key, t.name ?? t.key);
    for (const s of (t.stages || [])) { if (s && s.stage_code) insS.run(t.key, s.stage_code, s.seq ?? 0, s.is_milestone ? 1 : 0); }
    for (const d of (t.deliverables || [])) {
      const nm = d.deliverable_name ?? d.name;
      if (d && d.anchor_stage_code && nm) insD.run(t.key, d.anchor_stage_code, d.offset_days ?? 0, nm, d.default_artifact_type ?? d.artifact_type ?? null);
    }
  }
  const insR = db.prepare("INSERT INTO artifact_requirement(scope_kind,scope_key,artifact_type,label,mode,seq) VALUES(?,?,?,?,?,?) ON CONFLICT(scope_kind,scope_key,artifact_type) DO UPDATE SET label=excluded.label, mode=excluded.mode, seq=excluded.seq");
  for (const r of (data.board_requirements || [])) {
    if (!r) continue;
    if (Array.isArray(r.artifacts)) {
      r.artifacts.forEach((a, i) => { if (a && a.artifact_type) insR.run("board_type", r.board_type ?? r.scope_key ?? "board", a.artifact_type, a.label ?? null, a.mode ?? "hard", a.seq ?? i); });
    } else if (r.artifact_type) {
      insR.run(r.scope_kind ?? "board_type", r.scope_key ?? r.board_type ?? "board", r.artifact_type, r.label ?? null, r.mode ?? "hard", r.seq ?? 0);
    }
  }
}

// P-11: 안전 수식 평가 — eval/Function/new Function/vm 절대 미사용. 자작 토크나이저+재귀하강 파서.
// 허용: 숫자·변수(vars 키)·사칙(+ - * /)·거듭제곱(^)·괄호·쉼표·화이트리스트 Math.{함수/상수}.
// 그 외 식별자/문자([]=;'"$ 등) 발견 시 throw 'unsafe_token'(저장 거부에 사용).
function safeEval(formula, vars = {}) {
  const MATH_FN = { sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log, log10: Math.log10, sqrt: Math.sqrt, abs: Math.abs, pow: Math.pow, exp: Math.exp, min: Math.min, max: Math.max };
  const MATH_CONST = { PI: Math.PI, E: Math.E };
  const src = String(formula ?? "");
  const tokens = [];
  for (let i = 0; i < src.length;) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const num = src.slice(i, j);
      if (!/^[0-9]*\.?[0-9]+$/.test(num)) throw new Error("unsafe_token");
      tokens.push({ t: "num", v: Number(num) }); i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i; while (j < src.length && /[A-Za-z0-9_.]/.test(src[j])) j++;
      tokens.push({ t: "id", v: src.slice(i, j) }); i = j; continue;
    }
    if ("+-*/^(),".includes(c)) { tokens.push({ t: "op", v: c }); i++; continue; }
    throw new Error("unsafe_token");
  }
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const parseExpr = () => {
    let v = parseTerm();
    while (peek() && peek().t === "op" && (peek().v === "+" || peek().v === "-")) { const o = next().v; const r = parseTerm(); v = o === "+" ? v + r : v - r; }
    return v;
  };
  const parseTerm = () => {
    let v = parsePower();
    while (peek() && peek().t === "op" && (peek().v === "*" || peek().v === "/")) { const o = next().v; const r = parsePower(); v = o === "*" ? v * r : v / r; }
    return v;
  };
  const parsePower = () => {
    const v = parseUnary();
    if (peek() && peek().t === "op" && peek().v === "^") { next(); return Math.pow(v, parsePower()); }
    return v;
  };
  const parseUnary = () => {
    if (peek() && peek().t === "op" && (peek().v === "+" || peek().v === "-")) { const o = next().v; const v = parseUnary(); return o === "-" ? -v : v; }
    return parsePrimary();
  };
  function parsePrimary() {
    const tk = peek();
    if (!tk) throw new Error("eval_error");
    if (tk.t === "num") { next(); return tk.v; }
    if (tk.t === "op" && tk.v === "(") { next(); const v = parseExpr(); const cl = next(); if (!cl || cl.v !== ")") throw new Error("eval_error"); return v; }
    if (tk.t === "id") {
      next();
      const id = tk.v;
      if (Object.prototype.hasOwnProperty.call(vars, id)) return Number(vars[id]);
      if (id.startsWith("Math.")) {
        const m = id.slice(5);
        if (Object.prototype.hasOwnProperty.call(MATH_CONST, m)) return MATH_CONST[m];
        if (Object.prototype.hasOwnProperty.call(MATH_FN, m)) {
          const op = next(); if (!op || op.v !== "(") throw new Error("eval_error");
          const args = [];
          if (peek() && peek().v !== ")") { args.push(parseExpr()); while (peek() && peek().v === ",") { next(); args.push(parseExpr()); } }
          const cl = next(); if (!cl || cl.v !== ")") throw new Error("eval_error");
          return MATH_FN[m](...args);
        }
      }
      throw new Error("unsafe_token");
    }
    throw new Error("eval_error");
  }
  const result = parseExpr();
  if (peek()) throw new Error("eval_error");
  if (!Number.isFinite(result)) throw new Error("eval_error");
  return result;
}

export function openStore(path = ":memory:") {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec(DDL);
  // 경량 마이그레이션: 기존 DB 에 새 컬럼 추가 (있으면 무시)
  try { db.exec("ALTER TABLE core_project ADD COLUMN class TEXT NOT NULL DEFAULT 'active'"); } catch { /* exists */ }
  try { db.exec("ALTER TABLE core_project ADD COLUMN start_year INTEGER"); } catch { /* exists */ }
  // 기존 행 backfill: 과제번호 P{YY}- 접두 → 과제시작년도(idempotent, 명시값 보존)
  try { db.exec("UPDATE core_project SET start_year = 2000 + CAST(SUBSTR(id,2,2) AS INTEGER) WHERE start_year IS NULL AND id GLOB 'P[0-9][0-9]-*'"); } catch { /* no-op */ }
  for (const ddl of [
    "ALTER TABLE core_item ADD COLUMN guide_artifact_id INTEGER",
    "ALTER TABLE core_item ADD COLUMN guide_step_key TEXT",
    "ALTER TABLE core_item ADD COLUMN origin_mail_id TEXT",
    "ALTER TABLE core_item ADD COLUMN created_by TEXT",
    "ALTER TABLE event_log ADD COLUMN project_ref TEXT",
    "ALTER TABLE core_stage ADD COLUMN stage_code TEXT",
    "ALTER TABLE core_attachment ADD COLUMN artifact_type TEXT",
    "ALTER TABLE core_item ADD COLUMN anchor_date TEXT",
    "ALTER TABLE core_item ADD COLUMN anchor_stage_code TEXT",
    "ALTER TABLE core_item ADD COLUMN offset_days INTEGER",
    "ALTER TABLE core_item ADD COLUMN due_overridden INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE core_person ADD COLUMN unit_ref TEXT",
    "ALTER TABLE core_person ADD COLUMN capability_label TEXT"
  ]) {
    try { db.exec(ddl); } catch { /* exists */ }
  }
  // P-0: 단계 식별을 title 에서 분리한 stage_code 정본 컬럼. 기존 행 backfill=title.
  try { db.exec("UPDATE core_stage SET stage_code=title WHERE stage_code IS NULL OR stage_code=''"); } catch { /* noop */ }
  // P-2/SE-DATA: SE 스케줄러 시드 — data/se_process_seed.json 있으면 소비, 없으면 120_CDR stub.
  try { seedSeProcess(db); } catch { /* noop */ }
  const cur = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get();
  if (!cur) {
    db.prepare("INSERT INTO meta(key,value) VALUES('schema_version',?)").run(SCHEMA_VERSION);
  }
  return new Store(db);
}

// P-4 키스톤: 승인 시 실행 가능한 도메인 쓰기 화이트리스트(임의 SQL/eval 금지).
const PROPOSAL_KINDS = ["create_item", "add_attachment_type", "set_artifact_requirement", "link_part_project"];

export class Store {
  constructor(db) {
    this.db = db;
  }

  // --- event log (라벨링 우선 원칙: used_refs[] + data_label 필수 자리) ---
  appendEvent(event) {
    const at = event.at ?? new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO event_log(at,actor_ref,actor_kind,item_ref,kind,from_val,to_val,
          intervention_count,bottleneck_reason,used_refs,data_label,note,project_ref)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        at,
        event.actor_ref ?? "system",
        event.actor_kind ?? "system",
        event.item_ref ?? null,
        event.kind,
        event.from ?? null,
        event.to ?? null,
        event.intervention_count ?? null,
        event.bottleneck_reason ?? null,
        JSON.stringify(event.used_refs ?? []),
        event.data_label ?? "synthetic",
        event.note ?? null,
        event.project_ref ?? null
      );
  }

  recentEvents(limit = 20, project = null) {
    const where = project ? "WHERE project_ref=?" : "";
    const args = project ? [project, limit] : [limit];
    return this.db
      .prepare(`SELECT * FROM event_log ${where} ORDER BY id DESC LIMIT ?`)
      .all(...args)
      .map((row) => ({ ...row, used_refs: JSON.parse(row.used_refs ?? "[]") }));
  }

  // --- upserts (adapter/fixture 용) ---
  upsertProject(p) {
    // 과제시작년도: 명시값 우선, 없으면 과제번호 접두 P{YY}-에서 도출(P26-→2026), 그래도 없으면 null.
    const startYear = p.start_year ?? deriveStartYear(p.id);
    this.db
      .prepare(
        `INSERT INTO core_project(id,title,health,class,stage_current,start_year,source_ref,data_label)
         VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, health=excluded.health,
           class=excluded.class, stage_current=excluded.stage_current,
           start_year=COALESCE(excluded.start_year, core_project.start_year), source_ref=excluded.source_ref`
      )
      .run(p.id, p.title, p.health ?? "ok", p.class ?? "active", p.stage_current ?? null, startYear, p.source_ref ?? null, p.data_label ?? "synthetic");
  }

  upsertStage(s) {
    this.db
      .prepare(
        `INSERT INTO core_stage(id,project_id,title,stage_code,seq,gate_rule,status) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, stage_code=excluded.stage_code, seq=excluded.seq,
           gate_rule=excluded.gate_rule, status=excluded.status`
      )
      .run(s.id, s.project_id, s.title, s.stage_code ?? s.title, s.seq ?? 0, s.gate_rule ?? null, s.status ?? "open");
  }

  upsertPerson(p) {
    this.db
      .prepare(
        `INSERT INTO core_person(id,name,role,unit_ref,capability_label,data_label) VALUES (?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role,
           unit_ref=COALESCE(excluded.unit_ref, core_person.unit_ref),
           capability_label=COALESCE(excluded.capability_label, core_person.capability_label)`
      )
      .run(p.id, p.name, p.role ?? null, p.unit_ref ?? null, p.capability_label ?? null, p.data_label ?? "synthetic");
  }

  upsertItem(i) {
    this.db
      .prepare(
        `INSERT INTO core_item(id,project_id,stage_id,title,origin,spawn_kind,encounter_role,
           difficulty,urgency,automation_level,assignee_ref,party_ref,status,due,result,log_ref,data_label)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, stage_id=excluded.stage_id,
           status=excluded.status, due=excluded.due, assignee_ref=excluded.assignee_ref,
           urgency=excluded.urgency, automation_level=excluded.automation_level,
           encounter_role=excluded.encounter_role, result=excluded.result`
      )
      .run(
        i.id, i.project_id, i.stage_id ?? null, i.title,
        i.origin ?? "manual", i.spawn_kind ?? "spawned", i.encounter_role ?? "normal",
        i.difficulty ?? 2, i.urgency ?? "normal", i.automation_level ?? "manual",
        i.assignee_ref ?? null, i.party_ref ?? null, i.status ?? "open",
        i.due ?? null, i.result ?? null, i.log_ref ?? null, i.data_label ?? "synthetic"
      );
  }

  upsertMail(m) {
    this.db
      .prepare(
        `INSERT INTO core_mail(id,project_id,at,direction,subject,counterpart,pointer_ref,data_label)
         VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, subject=excluded.subject`
      )
      .run(m.id, m.project_id ?? null, m.at, m.direction ?? "in", m.subject, m.counterpart ?? null, m.pointer_ref ?? null, m.data_label ?? "synthetic");
  }

  upsertArtifact(a) {
    this.db
      .prepare(
        `INSERT INTO core_artifact(id,project_id,kind,title,pointer,sha256,updated_at,data_label)
         VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, title=excluded.title,
           pointer=excluded.pointer, sha256=excluded.sha256, updated_at=excluded.updated_at`
      )
      .run(a.id, a.project_id, a.kind, a.title, a.pointer, a.sha256 ?? null, a.updated_at ?? null, a.data_label ?? "synthetic");
  }

  // --- 조회 (읽기 콕핏) ---
  // 페르소나 합의: due 3버킷 분리(연체/오늘/주내), 마지막 움직임, 미연결(—) 구분
  summary(todayKey, weekEndKey = todayKey) {
    const projects = this.db.prepare("SELECT * FROM core_project ORDER BY id").all();
    const counts = this.db
      .prepare(
        `SELECT project_id,
           COUNT(*) AS total_cnt,
           SUM(CASE WHEN status NOT IN ('done') THEN 1 ELSE 0 END) AS open_cnt,
           SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END) AS blocked_cnt,
           SUM(CASE WHEN status NOT IN ('done') AND due IS NOT NULL AND due < ? THEN 1 ELSE 0 END) AS overdue_cnt,
           SUM(CASE WHEN status NOT IN ('done') AND due = ? THEN 1 ELSE 0 END) AS today_cnt,
           SUM(CASE WHEN status NOT IN ('done') AND due > ? AND due <= ? THEN 1 ELSE 0 END) AS week_cnt,
           SUM(CASE WHEN encounter_role='boss' AND status NOT IN ('done') THEN 1 ELSE 0 END) AS boss_cnt
         FROM core_item GROUP BY project_id`
      )
      .all(todayKey, todayKey, todayKey, weekEndKey);
    const lastMail = this.db
      .prepare("SELECT project_id, MAX(at) AS last_at, COUNT(*) AS mail_cnt FROM core_mail GROUP BY project_id")
      .all();
    const lastSubject = new Map(
      this.db
        .prepare(
          `SELECT m1.project_id, m1.subject FROM core_mail m1
           JOIN (SELECT project_id, MAX(at) AS last_at FROM core_mail GROUP BY project_id) m2
             ON m1.project_id = m2.project_id AND m1.at = m2.last_at`
        )
        .all()
        .map((r) => [r.project_id, r.subject])
    );
    const byId = new Map(counts.map((c) => [c.project_id, c]));
    const mailById = new Map(lastMail.map((m) => [m.project_id, m]));
    return projects.map((p) => {
      const c = byId.get(p.id);
      return {
        ...p,
        has_items: (c?.total_cnt ?? 0) > 0,
        open: c?.open_cnt ?? 0,
        blocked: c?.blocked_cnt ?? 0,
        overdue: c?.overdue_cnt ?? 0,
        due_today: c?.today_cnt ?? 0,
        due_week: c?.week_cnt ?? 0,
        boss_open: c?.boss_cnt ?? 0,
        mail_cnt: mailById.get(p.id)?.mail_cnt ?? 0,
        last_activity_at: mailById.get(p.id)?.last_at ?? null,
        last_mail_subject: lastSubject.get(p.id) ?? null
      };
    });
  }

  items({ project, status, q, due_before } = {}) {
    const cond = [];
    const args = [];
    if (project) { cond.push("i.project_id=?"); args.push(project); }
    if (status) { cond.push("i.status=?"); args.push(status); }
    if (due_before) { cond.push("i.due IS NOT NULL AND i.due<=? AND i.status NOT IN ('done')"); args.push(due_before); }
    if (q) { cond.push("i.title LIKE ?"); args.push(`%${q}%`); }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return this.db
      .prepare(
        `SELECT i.*, ga.name AS guide_artifact_name, ga.stage_code AS guide_stage_code
         FROM core_item i LEFT JOIN guide_artifact ga ON ga.id = i.guide_artifact_id
         ${where} ORDER BY (i.due IS NULL), i.due, i.id LIMIT 500`
      )
      .all(...args);
  }

  // --- P2a 할일 쓰기 (run16): 생성/상태/담당/메일 승격 — 모든 변경은 server 가 event_log 에 기록 ---
  static ITEM_STATUSES = ["open", "doing", "waiting", "blocked", "done"];

  createItem({ project_id, title, assignee_ref, due, urgency, guide_artifact_id, guide_step_key, origin_mail_id, origin, created_by }) {
    const trimmed = String(title ?? "").trim();
    if (!trimmed) return { error: "title_required" };
    if (!this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(project_id)) return { error: "project_not_found" };
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { error: "due_format" };
    let artifact = null;
    if (guide_artifact_id) {
      artifact = this.db.prepare("SELECT * FROM guide_artifact WHERE id=?").get(Number(guide_artifact_id));
      if (!artifact) return { error: "guide_artifact_not_found" };
      if (artifact.project_id !== project_id) return { error: "guide_artifact_project_mismatch" };
    }
    const id = `itm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    this.db
      .prepare(
        `INSERT INTO core_item(id,project_id,title,origin,urgency,assignee_ref,status,due,
           guide_artifact_id,guide_step_key,origin_mail_id,created_by,data_label)
         VALUES (?,?,?,?,?,?,'open',?,?,?,?,?,'real')`
      )
      .run(
        id, project_id, trimmed, origin ?? "manual", urgency ?? "normal",
        assignee_ref ?? null, due ?? null,
        guide_artifact_id ? Number(guide_artifact_id) : null, guide_step_key ?? null,
        origin_mail_id ?? null, created_by ?? null
      );
    return { ok: true, item: this.db.prepare("SELECT * FROM core_item WHERE id=?").get(id) };
  }

  // P-2: SE 스케줄러 — 단계 템플릿 적용(산출물 할일 자동 생성, 멱등) + 마일스톤 날짜 전파
  applyTemplate(project_id, template_key, { anchorDates = {} } = {}) {
    const tpl = this.db.prepare("SELECT * FROM se_stage_template WHERE key=?").get(template_key);
    if (!tpl) return { error: "template_not_found" };
    if (!this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(project_id)) return { error: "project_not_found" };
    for (const st of this.db.prepare("SELECT * FROM se_stage_template_stage WHERE template_key=? ORDER BY seq").all(template_key)) {
      this.upsertStage({ id: `${project_id}-T-${st.stage_code}`, project_id, title: st.stage_code, stage_code: st.stage_code, seq: st.seq });
    }
    const created = [];
    for (const d of this.db.prepare("SELECT * FROM se_deliverable_template WHERE template_key=? ORDER BY id").all(template_key)) {
      if (this.db.prepare("SELECT id FROM core_item WHERE project_id=? AND anchor_stage_code=? AND title=?").get(project_id, d.anchor_stage_code, d.deliverable_name)) continue;
      const anchorDate = anchorDates[d.anchor_stage_code] || null;
      const due = anchorDate ? addDaysIso(anchorDate, d.offset_days) : null;
      const r = this.createItem({ project_id, title: d.deliverable_name, due, origin: "schedule", created_by: "system" });
      if (!r.ok) continue;
      this.db.prepare("UPDATE core_item SET stage_id=?, anchor_date=?, anchor_stage_code=?, offset_days=?, spawn_kind='fixed' WHERE id=?")
        .run(`${project_id}-T-${d.anchor_stage_code}`, anchorDate, d.anchor_stage_code, d.offset_days, r.item.id);
      this.appendEvent({ kind: "schedule_spawn", item_ref: r.item.id, project_ref: project_id, used_refs: ["se_stage_template", template_key], data_label: "real" });
      created.push({ id: r.item.id, title: d.deliverable_name, due, anchor_stage_code: d.anchor_stage_code, offset_days: d.offset_days });
    }
    return { ok: true, template: template_key, created };
  }
  // 마일스톤 날짜 변경 → 같은 앵커의 산출물 할일 마감 재계산(사람이 손댄 마감·완료는 보호). MVP 1-hop.
  setAnchor(project_id, anchor_stage_code, date) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "date_format" };
    let shifted = 0;
    for (const it of this.db.prepare("SELECT id, offset_days, status, due_overridden FROM core_item WHERE project_id=? AND anchor_stage_code=?").all(project_id, anchor_stage_code)) {
      if (it.status === "done" || it.due_overridden) continue;
      this.db.prepare("UPDATE core_item SET anchor_date=?, due=? WHERE id=?").run(date, addDaysIso(date, it.offset_days || 0), it.id);
      shifted++;
    }
    this.appendEvent({ kind: "anchor_move", project_ref: project_id, to: `${anchor_stage_code}=${date}`, intervention_count: shifted, used_refs: ["se_stage_template"], data_label: "real" });
    return { ok: true, anchor_stage_code, date, shifted };
  }
  scheduleTemplates() {
    return this.db.prepare("SELECT * FROM se_stage_template ORDER BY key").all().map((t) => ({
      key: t.key, name: t.name,
      stages: this.db.prepare("SELECT stage_code, seq, is_milestone FROM se_stage_template_stage WHERE template_key=? ORDER BY seq").all(t.key),
      deliverables: this.db.prepare("SELECT anchor_stage_code, offset_days, deliverable_name, default_artifact_type FROM se_deliverable_template WHERE template_key=? ORDER BY id").all(t.key),
    }));
  }
  // 산출물 타이밍 편집/추가 — 지식/RAG 엔 '무엇'만 있고 '언제(offset)'는 없으므로 owner 가 직접 편집(추후 Codex 분석).
  upsertDeliverable(template_key, anchor_stage_code, deliverable_name, { offset_days = 0, default_artifact_type = null } = {}) {
    if (!this.db.prepare("SELECT 1 FROM se_stage_template WHERE key=?").get(template_key)) return { error: "template_not_found" };
    const nm = String(deliverable_name ?? "").trim();
    if (!nm || !anchor_stage_code) return { error: "deliverable_name_and_stage_required" };
    this.db.prepare(
      `INSERT INTO se_deliverable_template(template_key,anchor_stage_code,offset_days,deliverable_name,default_artifact_type)
       VALUES(?,?,?,?,?)
       ON CONFLICT(template_key,anchor_stage_code,deliverable_name) DO UPDATE SET offset_days=excluded.offset_days, default_artifact_type=excluded.default_artifact_type`
    ).run(template_key, anchor_stage_code, Number(offset_days) || 0, nm, default_artifact_type);
    return { ok: true };
  }

  setItemStatus(id, status) {
    if (!Store.ITEM_STATUSES.includes(status)) return { error: "bad_status" };
    const prev = this.db.prepare("SELECT status, project_id FROM core_item WHERE id=?").get(id);
    if (!prev) return { error: "item_not_found" };
    this.db.prepare("UPDATE core_item SET status=? WHERE id=?").run(status, id);
    return { ok: true, from: prev.status, project_id: prev.project_id };
  }

  setItemAssignee(id, assignee_ref) {
    const prev = this.db.prepare("SELECT assignee_ref, project_id FROM core_item WHERE id=?").get(id);
    if (!prev) return { error: "item_not_found" };
    this.db.prepare("UPDATE core_item SET assignee_ref=? WHERE id=?").run(assignee_ref || null, id);
    return { ok: true, from: prev.assignee_ref, project_id: prev.project_id };
  }

  // run17: 메일 과제 분류(재배정). 연결된 할일(origin_mail_id)도 함께 이동
  // (단일 진실: 몬스터=core_item 행 — 메일이 던전을 옮기면 그 몬스터도 동행).
  setMailProject(mail_id, project_id) {
    const mail = this.db.prepare("SELECT project_id FROM core_mail WHERE id=?").get(mail_id);
    if (!mail) return { error: "mail_not_found" };
    if (!this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(project_id)) return { error: "project_not_found" };
    if (mail.project_id === project_id) return { ok: true, from: mail.project_id, unchanged: true, item_moved: null };
    this.db.prepare("UPDATE core_mail SET project_id=? WHERE id=?").run(project_id, mail_id);
    const linked = this.db.prepare("SELECT id FROM core_item WHERE origin_mail_id=?").get(mail_id);
    if (linked) this.db.prepare("UPDATE core_item SET project_id=? WHERE id=?").run(project_id, linked.id);
    return { ok: true, from: mail.project_id, item_moved: linked?.id ?? null };
  }

  // run17: 묶음 분류 (+선택: 할일 생성 = 판타지 '몬스터 출몰').
  // 이미 승격된 메일은 중복 생성 없이 이동만. 결과는 메일별로 반환(이벤트는 호출자가 기록).
  assignMails(mail_ids, project_id, { make_items = false, created_by = null } = {}) {
    if (!Array.isArray(mail_ids) || mail_ids.length === 0) return { error: "mail_ids_required" };
    if (!this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(project_id)) return { error: "project_not_found" };
    const results = [];
    for (const mail_id of mail_ids) {
      const moved = this.setMailProject(mail_id, project_id);
      if (moved.error) { results.push({ mail_id, error: moved.error }); continue; }
      const entry = { mail_id, from: moved.from, unchanged: moved.unchanged ?? false, item_moved: moved.item_moved, item_created: null };
      if (make_items && !moved.item_moved) {
        const promoted = this.promoteMail(mail_id, created_by);
        if (promoted.ok) entry.item_created = promoted.item.id;
      }
      results.push(entry);
    }
    return { ok: true, project_id, results };
  }

  // 메일→할일 승격: 메일 메타(제목/과제)만 복사. 본문 없음(애초에 미적재).
  promoteMail(mail_id, created_by) {
    const mail = this.db.prepare("SELECT * FROM core_mail WHERE id=?").get(mail_id);
    if (!mail) return { error: "mail_not_found" };
    const dup = this.db.prepare("SELECT id FROM core_item WHERE origin_mail_id=?").get(mail_id);
    if (dup) return { error: "already_promoted", item_id: dup.id };
    if (!mail.project_id || !this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(mail.project_id)) {
      return { error: "mail_project_missing" };
    }
    return this.createItem({
      project_id: mail.project_id, title: mail.subject,
      origin: "mail", origin_mail_id: mail_id, created_by
    });
  }

  // Gmail식 확장: 기간(0=전체)/검색(제목·상대)/방향/수동라벨 필터 + 라벨 동봉
  mail({ project, days, q, direction, label_id } = {}) {
    const cond = [];
    const args = [];
    if (project) { cond.push("m.project_id=?"); args.push(project); }
    if (days) {
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      cond.push("m.at>=?"); args.push(cutoff);
    }
    if (q) { cond.push("(m.subject LIKE ? OR m.counterpart LIKE ?)"); args.push(`%${q}%`, `%${q}%`); }
    if (direction) { cond.push("m.direction=?"); args.push(direction); }
    if (label_id) { cond.push("EXISTS (SELECT 1 FROM mail_label_map x WHERE x.mail_id=m.id AND x.label_id=?)"); args.push(Number(label_id)); }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    const rows = this.db
      .prepare(
        `SELECT m.*, (SELECT GROUP_CONCAT(label_id) FROM mail_label_map mm WHERE mm.mail_id=m.id) AS label_ids
         FROM core_mail m ${where} ORDER BY m.at DESC LIMIT 500`
      )
      .all(...args);
    return rows.map((r) => ({ ...r, label_ids: r.label_ids ? String(r.label_ids).split(",").map(Number) : [] }));
  }

  // --- 가이드형 워크플로우 (run13): 산출물 등록 + 스텝 체크 (메타만) ---
  addGuideArtifact(projectId, stageCode, name) {
    const trimmed = String(name ?? "").trim();
    if (!trimmed) return { error: "artifact_name_required" };
    if (!this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(projectId)) return { error: "project_not_found" };
    try {
      this.db.prepare("INSERT INTO guide_artifact(project_id,stage_code,name) VALUES(?,?,?)").run(projectId, stageCode, trimmed);
    } catch {
      return { error: "artifact_exists" };
    }
    return { ok: true };
  }

  setGuideStep(artifactId, stepKey, on, actor = "owner") {
    const art = this.db.prepare("SELECT project_id FROM guide_artifact WHERE id=?").get(artifactId);
    if (!art) return { error: "artifact_not_found" };
    if (on) {
      this.db.prepare(
        `INSERT INTO guide_step(artifact_id,step_key,done_at,actor) VALUES(?,?,?,?)
         ON CONFLICT(artifact_id,step_key) DO UPDATE SET done_at=excluded.done_at, actor=excluded.actor`
      ).run(Number(artifactId), stepKey, new Date().toISOString(), actor);
    } else {
      this.db.prepare("DELETE FROM guide_step WHERE artifact_id=? AND step_key=?").run(Number(artifactId), stepKey);
    }
    return { ok: true, project_id: art.project_id };
  }

  // 산출물 진행률 집계(읽기 전용·정책 무관). 분모 = 산출물수 × 표준 절차 스텝수(7, ARTIFACT_FLOW).
  guideSummary() {
    const STEPS_PER = 7;
    const rows = this.db.prepare(
      `SELECT a.project_id AS project_id, COUNT(DISTINCT a.id) AS artifacts, COUNT(s.step_key) AS steps_done
       FROM guide_artifact a LEFT JOIN guide_step s ON s.artifact_id = a.id
       GROUP BY a.project_id ORDER BY a.project_id`
    ).all();
    return rows.map((r) => ({
      project_id: r.project_id, artifacts: r.artifacts, steps_done: r.steps_done,
      steps_total: r.artifacts * STEPS_PER,
      pct: r.artifacts ? Math.round((r.steps_done / (r.artifacts * STEPS_PER)) * 100) : 0
    }));
  }

  // P-9 납기/CDR 위험 조기경보 — days_left × 산출물 진행률(pct) 결합 severity(결정적·미저장·read-only).
  // 임계: days_left<0=critical; <=3&&pct<70 또는 <=7&&pct<50=risk; <=14&&pct<40=watch; 그 외 ok(제외).
  // 마일스톤(anchor_stage_code≠null)은 한 단계 상향. INSERT/UPDATE/appendEvent 0.
  riskAlerts({ project = null, today = null } = {}) {
    const todayKey = today || new Date().toISOString().slice(0, 10);
    const pctByProj = new Map(this.guideSummary().map((g) => [g.project_id, g.pct]));
    const titleByProj = new Map(this.db.prepare("SELECT id, title FROM core_project").all().map((p) => [p.id, p.title]));
    const ORDER = ["ok", "watch", "risk", "critical"];
    const base = (dl, pct) => {
      if (dl < 0) return "critical";
      if (dl <= 3 && pct < 70) return "risk";
      if (dl <= 7 && pct < 50) return "risk";
      if (dl <= 14 && pct < 40) return "watch";
      return "ok";
    };
    const out = [];
    for (const i of this.items({ project })) {
      if (!i.due || i.status === "done") continue;
      const days_left = Math.round((Date.parse(`${i.due}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86400000);
      const pct = pctByProj.get(i.project_id) ?? 0;
      const is_milestone = !!i.anchor_stage_code;
      let severity = base(days_left, pct);
      if (is_milestone && severity !== "ok") severity = ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(severity) + 1)];
      if (severity === "ok") continue;
      out.push({ project_id: i.project_id, project_title: titleByProj.get(i.project_id) ?? i.project_id, item_id: i.id, item_title: i.title, due: i.due, days_left, pct, severity, is_milestone });
    }
    out.sort((a, b) => a.days_left - b.days_left);
    return out;
  }

  // ---------- A1/A2: 게이트 판정·강제 ----------
  // 스테이지별 게이트 준비도: 미완/차단 할일 + 산출물 진행(stage_code 정본 매칭, P-0). passable + reasons.
  gateEval(stage) {
    const stageCode = stage.stage_code || stage.title;
    const items = this.db.prepare("SELECT status FROM core_item WHERE stage_id=?").all(stage.id);
    const open = items.filter((i) => i.status !== "done").length;
    const blocked = items.filter((i) => i.status === "blocked").length;
    const ga = this.db.prepare(
      `SELECT COUNT(DISTINCT a.id) AS arts, COUNT(st.step_key) AS done
       FROM guide_artifact a LEFT JOIN guide_step st ON st.artifact_id=a.id
       WHERE a.project_id=? AND a.stage_code=?`
    ).get(stage.project_id, stageCode);
    const arts = ga.arts || 0, stepsDone = ga.done || 0, stepsTotal = arts * 7;
    const reasons = [];
    if (open > 0) reasons.push({ code: "open_items", n: open });
    if (blocked > 0) reasons.push({ code: "blocked_items", n: blocked });
    if (arts > 0 && stepsDone < stepsTotal) reasons.push({ code: "artifacts_incomplete", n: stepsTotal - stepsDone });
    // P-1: 이 과제에 연결된 보드가 필수 기술자료 세트(BOM·Gerber 등)를 다 갖췄나. 요구가 정의된 경우만 평가.
    let missingArtifacts = 0; const missingDetail = [];
    const hasReq = this.db.prepare("SELECT 1 FROM artifact_requirement WHERE scope_kind='board_type' LIMIT 1").get();
    if (hasReq) {
      const boards = this.db.prepare(
        `SELECT p.id, p.name FROM core_part p JOIN part_project_map m ON m.part_id=p.id
         WHERE m.project_id=? AND p.type='board'`
      ).all(stage.project_id);
      for (const b of boards) {
        const c = this.boardCompleteness(b.id);
        if (c.missing && c.missing.length) {
          missingArtifacts += c.missing.length;
          missingDetail.push({ board_id: b.id, board: b.name, missing: c.missing.map((x) => x.artifact_type) });
        }
      }
      if (missingArtifacts > 0) reasons.push({ code: "required_artifacts_missing", n: missingArtifacts, detail: missingDetail });
    }
    // P-5: item_blocking 정책(artifact_requirement 재사용). 이 단계에 차단 규칙이 등록돼 있고
    // 차단 할일(blocked)이 1개 이상이면 하드 차단 사유 추가 → passable=false(신규 게이트 함수 0).
    const blockingRule = this.db.prepare(
      "SELECT mode FROM artifact_requirement WHERE scope_kind='item_blocking' AND scope_key=? LIMIT 1"
    ).get(stageCode);
    if (blockingRule && blocked > 0) reasons.push({ code: "blocking_items_open", n: blocked, detail: { stage_code: stageCode, mode: blockingRule.mode } });
    const passable = stage.status === "cleared" ? true : reasons.length === 0;
    // A6 보스 연출용 잔여(보스 HP) = 미완+차단+미완 절차. 0이면 처치 가능. (게임상태 미저장=계산)
    const remaining = open + blocked + Math.max(0, stepsTotal - stepsDone) + missingArtifacts;
    return {
      id: stage.id, project_id: stage.project_id, title: stage.title, stage_code: stageCode, seq: stage.seq,
      status: stage.status, gate_rule: stage.gate_rule,
      open_items: open, blocked_items: blocked, artifacts: arts, steps_done: stepsDone, steps_total: stepsTotal,
      required_missing: missingArtifacts,
      remaining, passable, reasons
    };
  }
  gates({ project } = {}) {
    const rows = project
      ? this.db.prepare("SELECT * FROM core_stage WHERE project_id=? ORDER BY seq").all(project)
      : this.db.prepare("SELECT * FROM core_stage ORDER BY project_id, seq").all();
    return rows.map((s) => this.gateEval(s));
  }
  gateMode() { return this.getMeta("gate_mode") || "hard"; } // 결정②: 기본 hard (owner wants)
  setGateMode(mode) { this.setMeta("gate_mode", mode === "soft" ? "soft" : "hard"); return { ok: true, mode: this.gateMode() }; }
  clearStage(stageId, { force = false } = {}) {
    const s = this.db.prepare("SELECT * FROM core_stage WHERE id=?").get(stageId);
    if (!s) return { error: "stage_not_found" };
    if (s.status === "cleared") return { ok: true, already: true, project_id: s.project_id };
    const ev = this.gateEval(s);
    const mode = this.gateMode();
    if (!ev.passable && mode === "hard" && !force) return { error: "gate_blocked", reasons: ev.reasons, mode };
    this.db.prepare("UPDATE core_stage SET status='cleared' WHERE id=?").run(stageId);
    return { ok: true, forced: !ev.passable, mode, project_id: s.project_id };
  }

  // ---------- A4/A5: 업무일지·보고서 생성기 (메타 기반·템플릿, 원문 미사용) ----------
  _itemTitle(id) { return this.db.prepare("SELECT title FROM core_item WHERE id=?").get(id)?.title ?? id; }
  worklogDraft({ project = null, days = 7 } = {}) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const evs = this.recentEvents(1000, project).filter((e) => (e.at ?? "") >= cutoff);
    const created = evs.filter((e) => e.kind === "item_create").map((e) => e.to_val).filter(Boolean);
    const done = evs.filter((e) => e.kind === "item_status" && e.to_val === "done").map((e) => this._itemTitle(e.item_ref));
    const blocked = evs.filter((e) => e.kind === "item_status" && e.to_val === "blocked").map((e) => this._itemTitle(e.item_ref));
    // 과제별 집계(완료/신규) — project_ref 기준
    const byProject = {};
    for (const e of evs) {
      const pr = e.project_ref;
      if (!pr) continue;
      if (e.kind === "item_create") (byProject[pr] ??= { created: 0, done: 0 }).created += 1;
      if (e.kind === "item_status" && e.to_val === "done") (byProject[pr] ??= { created: 0, done: 0 }).done += 1;
    }
    const gates = evs.filter((e) => e.kind === "gate_clear").map((e) => e.to_val);
    const meetings = evs.filter((e) => e.kind === "meeting_create").length;
    const mail = this.mail({ project, days });
    const mailIn = mail.filter((m) => m.direction === "in").length;
    const mailOut = mail.filter((m) => m.direction === "out").length;
    const lines = [];
    lines.push(`# 업무일지 초안 (최근 ${days}일${project ? ` · ${project}` : ""})`);
    lines.push(`기간: ${cutoff.slice(0, 10)} ~ ${new Date().toISOString().slice(0, 10)}`);
    lines.push("");
    lines.push(`## 완료 (${done.length})`);
    lines.push(done.length ? done.map((t) => `- ${t}`).join("\n") : "- (없음)");
    lines.push("");
    lines.push(`## 신규 등록 (${created.length})`);
    lines.push(created.length ? created.map((t) => `- ${t}`).join("\n") : "- (없음)");
    if (blocked.length) { lines.push(""); lines.push(`## 차단 발생 (${blocked.length})`); lines.push(blocked.map((t) => `- ${t}`).join("\n")); }
    if (gates.length) { lines.push(""); lines.push(`## 게이트 통과 (${gates.length})`); lines.push(gates.map((g) => `- ${g}`).join("\n")); }
    const projEntries = Object.entries(byProject).sort((a, b) => (b[1].done + b[1].created) - (a[1].done + a[1].created));
    if (projEntries.length) {
      lines.push("");
      lines.push(`## 과제별`);
      lines.push(projEntries.map(([pr, v]) => `- ${pr}: 완료 ${v.done}, 신규 ${v.created}`).join("\n"));
    }
    lines.push("");
    lines.push(`## 소통: 메일 수신 ${mailIn} · 발신 ${mailOut} · 회의 ${meetings}`);
    lines.push("");
    lines.push(`※ 메타데이터 기반 자동 초안(원문 미사용). 검토·보완 후 사용하세요.`);
    return {
      period: { from: cutoff, to: new Date().toISOString(), days }, project,
      counts: { done: done.length, created: created.length, blocked: blocked.length, gates: gates.length, mail_in: mailIn, mail_out: mailOut, meetings },
      by_project: byProject,
      text: lines.join("\n")
    };
  }
  // 보고서/연구노트 초안(미리보기 한정): 과제 메타 + 산출물 포인터(원문 미포함).
  reportDraft({ project = null, kind = "report" } = {}) {
    const today = new Date().toISOString().slice(0, 10);
    const weekEnd = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
    const projs = this.summary(today, weekEnd).filter((p) => !project || p.id === project);
    const arts = this.artifacts({ project }).slice(0, 30);
    const gsum = this.guideSummary().filter((g) => !project || g.project_id === project);
    const title = kind === "note" ? "연구노트 초안" : "보고서 초안";
    const lines = [];
    lines.push(`# ${title}${project ? ` — ${project}` : ""}`);
    lines.push(`작성 기준일: ${today}`);
    lines.push("");
    lines.push("## 과제 현황");
    lines.push(projs.length ? projs.map((p) => `- ${p.id} ${p.title}: 미완 ${p.open}, 차단 ${p.blocked}, 연체 ${p.overdue}`).join("\n") : "- (없음)");
    if (gsum.length) {
      lines.push(""); lines.push("## 산출물 진행률");
      lines.push(gsum.map((g) => `- ${g.project_id}: ${g.steps_done}/${g.steps_total} (${g.pct}%)`).join("\n"));
    }
    lines.push(""); lines.push(`## 산출물 목록(포인터, ${arts.length})`);
    lines.push(arts.length ? arts.map((a) => `- [${a.kind}] ${a.title} → ${a.pointer}`).join("\n") : "- (없음)");
    lines.push(""); lines.push("※ 메타·포인터 기반 미리보기 초안(원문/첨부 미포함). 본문 작성은 검토 후.");
    return { kind, project, artifacts: arts.length, text: lines.join("\n") };
  }

  // #13 개인별 캘린더(.ics) 내보내기 — core_item 마감일을 종일 VEVENT 로(원문/첨부 미포함).
  // person 미지정=전체. 마감 없는/완료 항목 제외. 점수·우선순위 미주입(단순 일정 피드).
  calendarFeed({ person = null } = {}) {
    const key = person ?? "";
    return this.db.prepare(
      `SELECT id, title, project_id, due, status, assignee_ref FROM core_item
       WHERE due IS NOT NULL AND status != 'done' AND (? = '' OR assignee_ref = ?) ORDER BY due`
    ).all(key, key);
  }
  calendarIcs({ person = null } = {}) {
    const rows = this.calendarFeed({ person });
    const esc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Soulforge//dev-erp//KO", "CALSCALE:GREGORIAN",
      `X-WR-CALNAME:dev-erp${person ? ` ${person}` : ""}`];
    for (const r of rows) {
      const d = String(r.due).replace(/-/g, "");
      lines.push("BEGIN:VEVENT", `UID:${r.id}@dev-erp`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${d}`,
        `SUMMARY:${esc(r.title)}${r.status === "blocked" ? " [차단]" : ""}`,
        `DESCRIPTION:${esc(r.project_id ?? "")}`, "END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
  }

  // P-18 외부 시트 임베드(Smartsheet) read-only — 게시 URL 메타만 저장(토큰/원문 0). 화이트리스트 강제.
  upsertEmbed({ id, kind = "smartsheet", title, url, project_id = null, data_label = "real" } = {}) {
    const t = String(title ?? "").trim(), u = String(url ?? "").trim();
    if (!t || !u) return { error: "title_url_required" };
    if (!/^https:\/\/(app\.|publish\.)?smartsheet\.com\//.test(u)) return { error: "url_not_allowed" };
    const eid = id || `emb_${randomBytes(5).toString("hex")}`;
    this.db.prepare(
      `INSERT INTO embed_view(id,kind,title,url,project_id,data_label,created_at)
       VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, url=excluded.url, project_id=excluded.project_id`
    ).run(eid, kind, t, u, project_id, data_label, new Date().toISOString());
    return { ok: true, id: eid };
  }
  listEmbeds({ project = null } = {}) {
    return project
      ? this.db.prepare("SELECT * FROM embed_view WHERE project_id=? ORDER BY created_at DESC").all(project)
      : this.db.prepare("SELECT * FROM embed_view ORDER BY created_at DESC").all();
  }

  // P-4 키스톤: ai_proposal 착지면. 코어 LLM 0% — 제안은 pending 으로만 적재(도메인 쓰기 0),
  // 사람 approveProposal 1회 후에만 화이트리스트 도메인 메서드 실행(임의 SQL/eval 금지).
  createProposal({ source, kind, target_ref = null, payload = {}, summary = null, used_refs = [], data_label = "real" } = {}) {
    if (!PROPOSAL_KINDS.includes(kind)) return { error: "unknown_proposal_kind" };
    const id = `prop_${randomBytes(5).toString("hex")}`;
    this.db.prepare(
      `INSERT INTO ai_proposal(id,at,source,kind,target_ref,payload_json,summary,status,used_refs,data_label)
       VALUES(?,?,?,?,?,?,?,'pending',?,?)`
    ).run(id, new Date().toISOString(), source ?? "unknown", kind, target_ref, JSON.stringify(payload ?? {}), summary, JSON.stringify(used_refs ?? []), data_label);
    return { ok: true, id, status: "pending" };
  }
  approveProposal(id, { decided_by = "owner" } = {}) {
    const row = this.db.prepare("SELECT * FROM ai_proposal WHERE id=?").get(id);
    if (!row) return { error: "proposal_not_found" };
    if (row.status !== "pending") return { error: "not_pending", status: row.status };
    const payload = JSON.parse(row.payload_json || "{}");
    let result;
    switch (row.kind) {
      case "create_item": result = this.createItem(payload); break;
      case "add_attachment_type": result = this.addAttachment(payload); break;
      case "set_artifact_requirement": result = this.setArtifactRequirement(payload); break;
      case "link_part_project": result = this.linkPartProject(payload.part_id, payload.project_id); break;
      default: return { error: "unknown_proposal_kind" };
    }
    if (result && result.error) return result; // 도메인 거부 시 상태 미변경(재시도 가능)
    const applied_ref = result?.item?.id ?? row.target_ref ?? null;
    this.db.prepare("UPDATE ai_proposal SET status='approved', decided_at=?, decided_by=?, applied_ref=? WHERE id=?")
      .run(new Date().toISOString(), decided_by, applied_ref, id);
    this.appendEvent({ actor_ref: decided_by, actor_kind: "human", kind: "ai_proposal_approve", item_ref: id, to: applied_ref, used_refs: row.used_refs ? JSON.parse(row.used_refs) : [], data_label: "real" });
    return { ok: true, applied_ref, result };
  }
  rejectProposal(id, { decided_by = "owner", reason = null } = {}) {
    const row = this.db.prepare("SELECT status FROM ai_proposal WHERE id=?").get(id);
    if (!row) return { error: "proposal_not_found" };
    if (row.status !== "pending") return { error: "not_pending", status: row.status };
    this.db.prepare("UPDATE ai_proposal SET status='rejected', decided_at=?, decided_by=? WHERE id=?")
      .run(new Date().toISOString(), decided_by, id);
    this.appendEvent({ actor_ref: decided_by, actor_kind: "human", kind: "ai_proposal_reject", item_ref: id, note: reason, used_refs: [], data_label: "real" });
    return { ok: true };
  }
  proposals({ status = "pending" } = {}) {
    return this.db.prepare("SELECT * FROM ai_proposal WHERE status=? ORDER BY at DESC LIMIT 200").all(status)
      .map((r) => ({ ...r, payload: JSON.parse(r.payload_json || "{}"), used_refs: r.used_refs ? JSON.parse(r.used_refs) : [] }));
  }

  // P-19 자동화 — 결정적 규칙 스캐너가 갭을 찾아 createProposal(pending)로만 적재. 자동 도메인 쓰기 0,
  // 적용은 사람 approveProposal 1회. LLM 0·수동 트리거(cron 없음). 스캐너 1=슬라이스 1(나머지는 후속).
  scanScheduleGaps(project_id) {
    if (!this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(project_id)) return { ok: false, proposed: 0 };
    const delivs = this.db.prepare("SELECT DISTINCT deliverable_name FROM se_deliverable_template").all();
    const existing = new Set(this.db.prepare("SELECT title FROM core_item WHERE project_id=?").all(project_id).map((r) => r.title));
    const pending = new Set(this.proposals({ status: "pending" })
      .filter((p) => p.kind === "create_item" && p.payload?.project_id === project_id).map((p) => p.payload?.title));
    let proposed = 0;
    for (const d of delivs) {
      if (existing.has(d.deliverable_name) || pending.has(d.deliverable_name)) continue; // dedup
      this.createProposal({ source: "schedule_gap", kind: "create_item", payload: { project_id, title: d.deliverable_name, origin: "schedule" }, summary: `미생성 산출물: ${d.deliverable_name}`, used_refs: ["se_stage_template"], data_label: "real" });
      proposed++;
    }
    return { ok: true, proposed };
  }
  // 자동 팔로업(영상 D 차용) — '회신 없으면 N일 뒤 팔로업'. 미완 단계(request/quote/order) 발주가
  // 마감(due) 지났는데 진행 없으면 '팔로업 할 일'을 createProposal(pending)로 제안. 자동 쓰기 0(승인 후 생성).
  scanFollowups(todayKey = null) {
    const today = todayKey || new Date().toISOString().slice(0, 10);
    const stale = this.db.prepare(
      "SELECT id, title, stage, due FROM core_purchase WHERE stage IN ('request','quote','order') AND due IS NOT NULL AND due < ?"
    ).all(today);
    const pending = new Set(this.proposals({ status: "pending" }).filter((p) => p.source === "followup").map((p) => p.payload?.title));
    let proposed = 0;
    for (const po of stale) {
      const proj = this.db.prepare("SELECT project_id FROM purchase_project_map WHERE purchase_id=? LIMIT 1").get(po.id)?.project_id;
      if (!proj) continue; // 승인 시 createItem 이 프로젝트를 요구 → 링크 없으면 skip
      const title = `팔로업: ${po.title} 회신·진행 확인`;
      if (pending.has(title)) continue;
      if (this.db.prepare("SELECT 1 FROM core_item WHERE project_id=? AND title=? AND status!='done'").get(proj, title)) continue;
      const lateDays = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${po.due}T00:00:00Z`)) / 86400000);
      this.createProposal({ source: "followup", kind: "create_item", payload: { project_id: proj, title, origin: "followup" }, summary: `발주 정체 ${lateDays}일(${po.stage})`, used_refs: ["core_purchase"], data_label: "real" });
      proposed++;
    }
    return { ok: true, proposed };
  }
  // 후속 스캐너 자리: scanArtifactGaps, scanMeetingActionGaps, scanCapabilityMismatch(P-6) 등 (모두 createProposal 로만 착지).
  runRecommenders({ scope = "all", project = null } = {}) {
    let total = 0;
    const projects = project ? [{ id: project }] : this.db.prepare("SELECT id FROM core_project").all();
    for (const p of projects) total += this.scanScheduleGaps(p.id).proposed || 0;
    total += this.scanFollowups().proposed || 0; // 자동 팔로업(전역, 발주 정체)
    this.appendEvent({ actor_kind: "system", kind: "recommender_run", to: String(total), used_refs: ["ai_proposal"], data_label: "real" });
    return { ok: true, proposed: total, scope };
  }

  // ---------- 구매/발주 ----------
  PURCHASE_STAGES = ["request", "quote", "order", "receive", "inspect", "closed"];
  parties({ kind } = {}) {
    const where = kind ? "WHERE kind=?" : "";
    return this.db.prepare(`SELECT * FROM core_party ${where} ORDER BY name`).all(...(kind ? [kind] : []));
  }
  upsertParty({ id, name, kind = "vendor", contact = null, data_label = "real" }) {
    const t = String(name ?? "").trim();
    if (!t) return { error: "name_required" };
    const pid = id || `party_${randomBytes(4).toString("hex")}`;
    this.db.prepare(
      `INSERT INTO core_party(id,name,kind,contact,data_label) VALUES(?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind, contact=excluded.contact`
    ).run(pid, t, kind, contact, data_label);
    return { ok: true, id: pid };
  }
  createPurchase({ id, party_id = null, title, stage = "request", amount = null, currency = "KRW", due = null, pointer = null, created_by = "owner", projects = [], data_label = "real" }) {
    const t = String(title ?? "").trim();
    if (!t) return { error: "title_required" };
    if (!this.PURCHASE_STAGES.includes(stage)) return { error: "bad_stage" };
    const pid = id || `po_${randomBytes(5).toString("hex")}`;
    this.db.prepare(
      `INSERT INTO core_purchase(id,party_id,title,stage,amount,currency,due,pointer,created_by,data_label,created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`
    ).run(pid, party_id, t, stage, amount, currency, due, pointer, created_by, data_label, new Date().toISOString());
    for (const proj of projects) this.linkPurchaseProject(pid, proj);
    return { ok: true, id: pid };
  }
  setPurchaseStage(id, stage) {
    if (!this.PURCHASE_STAGES.includes(stage)) return { error: "bad_stage" };
    const cur = this.db.prepare("SELECT stage FROM core_purchase WHERE id=?").get(id);
    if (!cur) return { error: "purchase_not_found" };
    this.db.prepare("UPDATE core_purchase SET stage=? WHERE id=?").run(stage, id);
    return { ok: true, from: cur.stage, to: stage };
  }
  linkPurchaseProject(purchase_id, project_id) {
    if (!this.db.prepare("SELECT 1 FROM core_purchase WHERE id=?").get(purchase_id)) return { error: "purchase_not_found" };
    if (!this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(project_id)) return { error: "project_not_found" };
    this.db.prepare("INSERT OR IGNORE INTO purchase_project_map(purchase_id,project_id) VALUES(?,?)").run(purchase_id, project_id);
    return { ok: true };
  }
  purchaseProjects(purchase_id) {
    return this.db.prepare("SELECT project_id FROM purchase_project_map WHERE purchase_id=?").all(purchase_id).map((r) => r.project_id);
  }
  // 거래처별 거래이력 집계(발주 건수·총액·진행/완료). 메타 전용.
  partyLedger() {
    const rows = this.db.prepare(
      `SELECT party_id, COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total,
              SUM(CASE WHEN stage='closed' THEN 1 ELSE 0 END) AS closed
       FROM core_purchase WHERE party_id IS NOT NULL GROUP BY party_id`
    ).all();
    const pn = new Map(this.parties().map((x) => [x.id, x.name]));
    return rows.map((r) => ({
      party_id: r.party_id, party_name: pn.get(r.party_id) ?? r.party_id,
      count: r.cnt, total_amount: r.total, closed: r.closed, open: r.cnt - r.closed
    })).sort((a, b) => b.total_amount - a.total_amount);
  }
  purchases({ project = null, party = null, stage = null } = {}) {
    let sql = "SELECT p.* FROM core_purchase p";
    const cond = [], args = [];
    if (project) { sql += " JOIN purchase_project_map m ON m.purchase_id=p.id"; cond.push("m.project_id=?"); args.push(project); }
    if (party) { cond.push("p.party_id=?"); args.push(party); }
    if (stage) { cond.push("p.stage=?"); args.push(stage); }
    if (cond.length) sql += " WHERE " + cond.join(" AND ");
    sql += " ORDER BY p.created_at DESC, p.id LIMIT 300";
    const rows = this.db.prepare(sql).all(...args);
    const pn = new Map(this.parties().map((x) => [x.id, x.name]));
    return rows.map((r) => ({ ...r, party_name: r.party_id ? (pn.get(r.party_id) ?? r.party_id) : null, projects: this.purchaseProjects(r.id) }));
  }

  // ---------- 챗봇 매뉴얼/FAQ (검색·읽기 전용; 추론 아님) ----------
  upsertFaq({ id, topic = null, question, answer, pointer = null, keywords = null, data_label = "real" }) {
    const q = String(question ?? "").trim(), a = String(answer ?? "").trim();
    if (!q || !a) return { error: "question_answer_required" };
    const fid = id || `faq_${randomBytes(4).toString("hex")}`;
    this.db.prepare(
      `INSERT INTO core_faq(id,topic,question,answer,pointer,keywords,data_label) VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET topic=excluded.topic, question=excluded.question, answer=excluded.answer, pointer=excluded.pointer, keywords=excluded.keywords`
    ).run(fid, topic, q, a, pointer, keywords, data_label);
    return { ok: true, id: fid };
  }
  faqs({ topic = null } = {}) {
    const where = topic ? "WHERE topic=?" : "";
    return this.db.prepare(`SELECT * FROM core_faq ${where} ORDER BY topic, question`).all(...(topic ? [topic] : []));
  }
  // 로컬 키워드 검색(추론 X): 질문 토큰이 FAQ의 question/keywords/answer와 겹치는 정도로 최고 1건.
  // 검색 토큰화: 2글자+ 단어. 한국어는 조사/어미가 붙으므로 양방향 부분일치를 본다.
  _tokenize(s) {
    return String(s ?? "").toLowerCase().split(/[\s,./()\[\]?!~"'·]+/).filter((w) => w.length >= 2);
  }
  // 상위 N개 후보를 정규화 점수(0~1)와 함께 반환. 단어가 글자그대로 같지 않아도
  // 한쪽이 다른쪽의 부분문자열이면(예: "재고"⊂"재고부족") 부분점수를 준다.
  retrieveFaqMany(question, n = 3) {
    const toks = this._tokenize(question);
    if (!toks.length) return [];
    const scored = [];
    for (const f of this.faqs()) {
      const hayToks = this._tokenize(`${f.question} ${f.keywords ?? ""} ${f.topic ?? ""} ${f.answer}`);
      let raw = 0;
      for (const t of toks) {
        if (hayToks.includes(t)) { raw += 1; continue; }              // 완전일치
        if (hayToks.some((h) => h.includes(t) || t.includes(h))) raw += 0.6; // 부분일치(조사/어미 흡수)
      }
      if (raw > 0) scored.push({ faq: f, score: raw, norm: raw / toks.length });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, n);
  }
  // 하위호환: 단일 최고매칭(기존 호출부·테스트용).
  retrieveFaq(question) {
    const top = this.retrieveFaqMany(question, 1);
    return top.length ? top[0] : null;
  }
  // P-10 지식 카탈로그 — 등재/조회/검색(검색은 _tokenize 재사용·추론 0·외부전송 0).
  upsertKnowledge({ id, title, summary = null, topic = null, source_ref = null, claim_ceiling = "source_supported", keywords = null, pointer = null, data_label = "real" }) {
    const t = String(title ?? "").trim();
    if (!t) return { error: "title_required" };
    const kid = id || `kn_${randomBytes(4).toString("hex")}`;
    this.db.prepare(
      `INSERT INTO core_knowledge(id,title,summary,topic,source_ref,claim_ceiling,keywords,pointer,data_label)
       VALUES(?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, summary=excluded.summary, topic=excluded.topic,
         source_ref=excluded.source_ref, claim_ceiling=excluded.claim_ceiling, keywords=excluded.keywords, pointer=excluded.pointer`
    ).run(kid, t, summary, topic, source_ref, claim_ceiling, keywords, pointer, data_label);
    return { ok: true, id: kid };
  }
  knowledge({ topic = null, q = null } = {}) {
    const cond = [], args = [];
    if (topic) { cond.push("topic=?"); args.push(topic); }
    if (q) { cond.push("(title LIKE ? OR summary LIKE ? OR keywords LIKE ?)"); const like = `%${q}%`; args.push(like, like, like); }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return this.db.prepare(`SELECT * FROM core_knowledge ${where} ORDER BY title LIMIT 300`).all(...args);
  }
  retrieveKnowledge(question, n = 5) {
    const toks = this._tokenize(question);
    if (!toks.length) return [];
    const scored = [];
    for (const k of this.knowledge()) {
      const hay = this._tokenize(`${k.title} ${k.summary ?? ""} ${k.keywords ?? ""} ${k.topic ?? ""}`);
      let raw = 0;
      for (const t of toks) {
        if (hay.includes(t)) { raw += 1; continue; }
        if (hay.some((h) => h.includes(t) || t.includes(h))) raw += 0.6;
      }
      if (raw > 0) scored.push({ knowledge: k, score: raw, norm: raw / toks.length });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, n);
  }
  catalogSearch(question, n = 5) {
    const faq = this.retrieveFaqMany(question, n).map((r) => ({ type: "faq", score: r.score, norm: r.norm, item: r.faq }));
    const kn = this.retrieveKnowledge(question, n).map((r) => ({ type: "knowledge", score: r.score, norm: r.norm, item: r.knowledge }));
    return [...faq, ...kn].sort((a, b) => b.score - a.score).slice(0, n);
  }
  logChatQuery({ thread_id = null, question, matched_faq_id = null }) {
    this.db.prepare("INSERT INTO chat_query_log(at,thread_id,question,matched_faq_id,data_label) VALUES(?,?,?,?,?)")
      .run(new Date().toISOString(), thread_id, String(question ?? ""), matched_faq_id, "real");
    return { ok: true };
  }
  // 야간 매뉴얼 갱신 입력: 미응답(매칭 FAQ 없음) 질문 + 빈도.
  unansweredQueries(limit = 50) {
    return this.db.prepare(
      `SELECT question, COUNT(*) AS n, MAX(at) AS last_at FROM chat_query_log
       WHERE matched_faq_id IS NULL GROUP BY question ORDER BY n DESC, last_at DESC LIMIT ?`
    ).all(limit);
  }
  // 검색지향 답변(추론 아님). 멈추지 않는 사람형 응답이 목표:
  //  - 강한 매칭 → 그 매뉴얼 답을 근거로 반환(LLM은 표현만 다듬는 자리).
  //  - 약한 매칭 → 가까운 항목들을 제시하며 되묻기(끊지 않음).
  //  - 매칭 0   → 알려진 주제를 안내하며 구체화 요청 + 미응답 기록(야간 갱신 입력).
  // 강한 매칭 기준: norm≥0.5 또는 score≥2. 매칭 FAQ 없으면 unanswered 로그.
  chatAnswer({ question, thread_id = null } = {}) {
    const q = String(question ?? "").trim();
    if (!q) return { error: "question_required" };
    const hits = this.retrieveFaqMany(q, 3);
    const top = hits[0] || null;
    const strong = top && (top.norm >= 0.5 || top.score >= 2);
    const matchedId = strong ? top.faq.id : null;
    this.logChatQuery({ thread_id, question: q, matched_faq_id: matchedId });
    const candidates = hits.map((h) => ({ id: h.faq.id, topic: h.faq.topic, question: h.faq.question }));

    if (strong) {
      const f = top.faq;
      const text = `${f.answer}${f.pointer ? `\n\n📎 참고: ${f.pointer}` : ""}`;
      return { matched: true, grounded: true, source: { id: f.id, topic: f.topic, question: f.question }, candidates, text };
    }
    if (hits.length) {
      const lines = hits.map((h) => `· ${h.faq.question}${h.faq.topic ? ` (${h.faq.topic})` : ""}`).join("\n");
      const text = `딱 맞는 매뉴얼 항목을 못 찾았지만, 이런 게 관련 있어 보여요:\n${lines}\n\n이 중 가까운 게 있을까요? 아니면 조금 더 구체적으로 말씀해 주시면 찾아볼게요.`;
      return { matched: false, grounded: false, source: null, candidates, text };
    }
    const topics = [...new Set(this.faqs().map((f) => f.topic).filter(Boolean))];
    const hint = topics.length ? ` 참고로 지금 정리된 주제는 ${topics.join(", ")} 쪽이에요.` : "";
    const text = `아직 매뉴얼에 정리되지 않은 내용이라 정확히 답드리긴 어렵네요. 질문은 저장해 두었고, 야간에 매뉴얼이 보강됩니다.${hint} 혹시 관련된 주제로 다시 여쭤봐 주실래요?`;
    return { matched: false, grounded: false, source: null, candidates: [], text };
  }

  // ---------- P3 부품/BOM/위치/재고 (공유 마스터·내부 판정만) ----------
  upsertPart({ id, name, part_no = null, type = null, grp = null, spec = null, uom = "ea", maker = null, min_qty = 0, data_label = "real" }) {
    const t = String(name ?? "").trim();
    if (!t) return { error: "name_required" };
    const pid = id || `part_${randomBytes(5).toString("hex")}`;
    this.db.prepare(
      `INSERT INTO core_part(id,name,part_no,type,grp,spec,uom,maker,min_qty,data_label) VALUES(?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, part_no=excluded.part_no, type=excluded.type, grp=excluded.grp,
         spec=excluded.spec, uom=excluded.uom, maker=excluded.maker, min_qty=excluded.min_qty`
    ).run(pid, t, part_no, type, grp, spec, uom, maker, Number(min_qty) || 0, data_label);
    return { ok: true, id: pid };
  }
  parts({ type = null, grp = null, project = null, q = null } = {}) {
    let sql = "SELECT p.* FROM core_part p";
    const cond = [], args = [];
    if (project) { sql += " JOIN part_project_map m ON m.part_id=p.id"; cond.push("m.project_id=?"); args.push(project); }
    if (type) { cond.push("p.type=?"); args.push(type); }
    if (grp) { cond.push("p.grp=?"); args.push(grp); }
    if (q) { cond.push("(p.name LIKE ? OR p.part_no LIKE ?)"); args.push(`%${q}%`, `%${q}%`); }
    if (cond.length) sql += " WHERE " + cond.join(" AND ");
    sql += " ORDER BY p.name LIMIT 500";
    const rows = this.db.prepare(sql).all(...args);
    return rows.map((p) => ({ ...p, on_hand: this.stockOnHand(p.id), projects: this.partProjects(p.id) }));
  }
  linkPartProject(part_id, project_id) {
    if (!this.db.prepare("SELECT 1 FROM core_part WHERE id=?").get(part_id)) return { error: "part_not_found" };
    if (!this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(project_id)) return { error: "project_not_found" };
    this.db.prepare("INSERT OR IGNORE INTO part_project_map(part_id,project_id) VALUES(?,?)").run(part_id, project_id);
    return { ok: true };
  }
  partProjects(part_id) {
    return this.db.prepare("SELECT project_id FROM part_project_map WHERE part_id=?").all(part_id).map((r) => r.project_id);
  }
  // BOM
  addBomEdge(parent_part_id, child_part_id, qty = 1, ref_des = null) {
    if (parent_part_id === child_part_id) return { error: "self_reference" };
    if (!this.db.prepare("SELECT 1 FROM core_part WHERE id=?").get(parent_part_id)) return { error: "parent_not_found" };
    if (!this.db.prepare("SELECT 1 FROM core_part WHERE id=?").get(child_part_id)) return { error: "child_not_found" };
    this.db.prepare(
      `INSERT INTO bom_edge(parent_part_id,child_part_id,qty,ref_des) VALUES(?,?,?,?)
       ON CONFLICT(parent_part_id,child_part_id) DO UPDATE SET qty=excluded.qty, ref_des=excluded.ref_des`
    ).run(parent_part_id, child_part_id, Number(qty) || 1, ref_des);
    this.appendEvent({ actor_ref: "owner", actor_kind: "human", kind: "bom_change", item_ref: parent_part_id, to: child_part_id, used_refs: ["bom"], data_label: "real", note: "add/update" });
    return { ok: true };
  }
  bom(parent_part_id) {
    return this.db.prepare(
      `SELECT b.child_part_id, b.qty, b.ref_des, c.name, c.part_no, c.type
       FROM bom_edge b JOIN core_part c ON c.id=b.child_part_id WHERE b.parent_part_id=? ORDER BY b.ref_des, c.name`
    ).all(parent_part_id);
  }
  bomChanges(limit = 20) {
    return this.recentEvents(500, null).filter((e) => e.kind === "bom_change").slice(0, limit);
  }
  // 위치 트리
  upsertLocation({ id, name, kind = "bin", parent_id = null, is_virtual = 0, data_label = "real" }) {
    const t = String(name ?? "").trim();
    if (!t) return { error: "name_required" };
    const lid = id || `loc_${randomBytes(4).toString("hex")}`;
    this.db.prepare(
      `INSERT INTO core_location(id,name,kind,parent_id,is_virtual,data_label) VALUES(?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind, parent_id=excluded.parent_id, is_virtual=excluded.is_virtual`
    ).run(lid, t, kind, parent_id, is_virtual ? 1 : 0, data_label);
    return { ok: true, id: lid };
  }
  locations() { return this.db.prepare("SELECT * FROM core_location ORDER BY is_virtual, kind, name").all(); }
  // 재고
  setStock(part_id, location_id, qty) {
    if (!this.db.prepare("SELECT 1 FROM core_part WHERE id=?").get(part_id)) return { error: "part_not_found" };
    if (!this.db.prepare("SELECT 1 FROM core_location WHERE id=?").get(location_id)) return { error: "location_not_found" };
    this.db.prepare(
      `INSERT INTO core_stock(part_id,location_id,qty) VALUES(?,?,?)
       ON CONFLICT(part_id,location_id) DO UPDATE SET qty=excluded.qty`
    ).run(part_id, location_id, Number(qty) || 0);
    return { ok: true };
  }
  // 가용 재고 = 비가상 위치 합계(수리중/분실/공급사 등 가상 제외)
  stockOnHand(part_id) {
    return this.db.prepare(
      `SELECT COALESCE(SUM(s.qty),0) AS q FROM core_stock s JOIN core_location l ON l.id=s.location_id
       WHERE s.part_id=? AND l.is_virtual=0`
    ).get(part_id).q;
  }
  stock({ part = null, location = null } = {}) {
    const cond = [], args = [];
    if (part) { cond.push("s.part_id=?"); args.push(part); }
    if (location) { cond.push("s.location_id=?"); args.push(location); }
    const where = cond.length ? "WHERE " + cond.join(" AND ") : "";
    return this.db.prepare(
      `SELECT s.*, p.name AS part_name, l.name AS location_name, l.is_virtual FROM core_stock s
       JOIN core_part p ON p.id=s.part_id JOIN core_location l ON l.id=s.location_id ${where} ORDER BY p.name`
    ).all(...args);
  }
  // 재고 부족(내부 판정만; 외부 공급사 조회 없음): min_qty>0 이고 가용<min_qty
  stockLow() {
    return this.db.prepare("SELECT * FROM core_part WHERE min_qty > 0 ORDER BY name").all()
      .map((p) => ({ id: p.id, name: p.name, part_no: p.part_no, min_qty: p.min_qty, on_hand: this.stockOnHand(p.id) }))
      .filter((p) => p.on_hand < p.min_qty);
  }

  // ---------- 연락처 마스터(메타) ----------
  createContact({ id, name, org = null, role = null, email = null, phone = null, party_id = null, projects = [], data_label = "real" }) {
    const t = String(name ?? "").trim();
    if (!t) return { error: "name_required" };
    const cid = id || `ct_${randomBytes(4).toString("hex")}`;
    this.db.prepare(
      "INSERT INTO core_contact(id,name,org,role,email,phone,party_id,data_label) VALUES(?,?,?,?,?,?,?,?)"
    ).run(cid, t, org, role, email, phone, party_id, data_label);
    for (const proj of projects) this.linkContactProject(cid, proj);
    return { ok: true, id: cid };
  }
  linkContactProject(contact_id, project_id) {
    if (!this.db.prepare("SELECT 1 FROM core_contact WHERE id=?").get(contact_id)) return { error: "contact_not_found" };
    if (!this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(project_id)) return { error: "project_not_found" };
    this.db.prepare("INSERT OR IGNORE INTO contact_project_map(contact_id,project_id) VALUES(?,?)").run(contact_id, project_id);
    return { ok: true };
  }
  contactProjects(contact_id) {
    return this.db.prepare("SELECT project_id FROM contact_project_map WHERE contact_id=?").all(contact_id).map((r) => r.project_id);
  }
  contacts({ project = null, party = null } = {}) {
    let sql = "SELECT c.* FROM core_contact c";
    const cond = [], args = [];
    if (project) { sql += " JOIN contact_project_map m ON m.contact_id=c.id"; cond.push("m.project_id=?"); args.push(project); }
    if (party) { cond.push("c.party_id=?"); args.push(party); }
    if (cond.length) sql += " WHERE " + cond.join(" AND ");
    sql += " ORDER BY c.name LIMIT 300";
    const rows = this.db.prepare(sql).all(...args);
    const pn = new Map(this.parties().map((x) => [x.id, x.name]));
    return rows.map((r) => ({ ...r, party_name: r.party_id ? (pn.get(r.party_id) ?? r.party_id) : null, projects: this.contactProjects(r.id) }));
  }

  // ---------- 파일 첨부(메타 포인터) + 배치 제안(⑧, reversible) ----------
  // 확장자/이름 기반 분류 제안. 자동 적용 아님 — owner 가 정책 승인 전까지 제안만.
  suggestPlacement(name) {
    const ext = String(name ?? "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
    const map = {
      doc: ["pdf", "doc", "docx", "hwp", "hwpx", "txt", "md"],
      sheet: ["xls", "xlsx", "csv", "tsv"],
      image: ["png", "jpg", "jpeg", "gif", "bmp", "svg"],
      drawing: ["dwg", "dxf", "step", "stp", "iges", "igs", "brd", "sch"],
      archive: ["zip", "7z", "tar", "gz"]
    };
    for (const [cat, exts] of Object.entries(map)) if (exts.includes(ext)) return { category: cat, kind: cat, rule: `ext:${ext}`, proposed: true };
    return { category: "etc", kind: "etc", rule: ext ? `ext:${ext}` : "no_ext", proposed: true };
  }
  addAttachment({ id, entity_type, entity_id, name, pointer, kind = null, artifact_type = null, created_by = "owner", data_label = "real" }) {
    const t = String(name ?? "").trim(), ptr = String(pointer ?? "").trim();
    if (!t || !ptr) return { error: "name_pointer_required" };
    if (!["item", "project", "purchase", "meeting", "part", "knowledge"].includes(entity_type)) return { error: "bad_entity_type" };
    const sug = this.suggestPlacement(t);
    const aid = id || `att_${randomBytes(5).toString("hex")}`;
    this.db.prepare(
      `INSERT INTO core_attachment(id,entity_type,entity_id,name,pointer,kind,category,artifact_type,created_by,data_label,created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`
    ).run(aid, entity_type, entity_id, t, ptr, kind ?? sug.kind, sug.category, artifact_type, created_by, data_label, new Date().toISOString());
    return { ok: true, id: aid, suggested: sug };
  }
  // P-1: 완결성 게이트 — 보드유형별 필수 기술자료 세트 정의/조회/판정
  setArtifactRequirement({ scope_kind = "board_type", scope_key, artifact_type, label = null, mode = "hard", seq = 0 }) {
    if (!scope_key || !artifact_type) return { error: "scope_key_and_artifact_type_required" };
    this.db.prepare(
      `INSERT INTO artifact_requirement(scope_kind,scope_key,artifact_type,label,mode,seq) VALUES(?,?,?,?,?,?)
       ON CONFLICT(scope_kind,scope_key,artifact_type) DO UPDATE SET label=excluded.label, mode=excluded.mode, seq=excluded.seq`
    ).run(scope_kind, scope_key, artifact_type, label, mode, seq);
    return { ok: true };
  }
  artifactRequirements({ scope_kind, scope_key } = {}) {
    const cond = [], args = [];
    if (scope_kind) { cond.push("scope_kind=?"); args.push(scope_kind); }
    if (scope_key) { cond.push("scope_key=?"); args.push(scope_key); }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return this.db.prepare(`SELECT * FROM artifact_requirement ${where} ORDER BY scope_kind, scope_key, seq, artifact_type`).all(...args);
  }
  // P-14 산출물 입력 충족(read-only) — deliverable_input 규칙 vs 과제 링크 보드 첨부 합집합.
  // 충족 판정만 계산, createItem/자동 생성 0(생성은 ai_proposal 승인 후). gateEval 무변경(별 메서드).
  inputFulfillment(project_id) {
    const rules = this.db.prepare(
      "SELECT scope_key, artifact_type, label FROM artifact_requirement WHERE scope_kind='deliverable_input' ORDER BY scope_key, seq, artifact_type"
    ).all();
    if (!rules.length) return [];
    const boards = this.db.prepare(
      "SELECT p.id FROM core_part p JOIN part_project_map m ON m.part_id=p.id WHERE m.project_id=? AND p.type='board'"
    ).all(project_id);
    const have = new Set();
    for (const b of boards) {
      for (const a of this.db.prepare("SELECT DISTINCT artifact_type FROM core_attachment WHERE entity_type='part' AND entity_id=? AND artifact_type IS NOT NULL").all(b.id)) {
        have.add(a.artifact_type);
      }
    }
    const byKey = {};
    for (const r of rules) (byKey[r.scope_key] ||= []).push(r);
    return Object.entries(byKey).map(([scope_key, reqs]) => {
      const required = reqs.map((r) => r.artifact_type);
      const satisfied = required.filter((t) => have.has(t));
      const missing = reqs.filter((r) => !have.has(r.artifact_type)).map((r) => ({ artifact_type: r.artifact_type, label: r.label }));
      return { deliverable_name: scope_key, scope_key, required, satisfied, missing, fulfilled: missing.length === 0 && required.length > 0 };
    });
  }
  // 보드 1개의 필수 기술자료 충족도(첨부 포인터 존재로 판정, 원문 미저장 유지)
  boardCompleteness(partId) {
    const board = this.db.prepare("SELECT * FROM core_part WHERE id=?").get(partId);
    if (!board) return { error: "part_not_found" };
    const bt = board.type || "board";
    const reqs = this.db.prepare(
      "SELECT artifact_type, label FROM artifact_requirement WHERE scope_kind='board_type' AND scope_key=? ORDER BY seq, artifact_type"
    ).all(bt);
    const have = new Set(this.db.prepare(
      "SELECT DISTINCT artifact_type FROM core_attachment WHERE entity_type='part' AND entity_id=? AND artifact_type IS NOT NULL"
    ).all(partId).map((r) => r.artifact_type));
    const required = reqs.map((r) => r.artifact_type);
    const missing = reqs.filter((r) => !have.has(r.artifact_type)).map((r) => ({ artifact_type: r.artifact_type, label: r.label }));
    return { board_id: partId, board_type: bt, required, satisfied: required.filter((tp) => have.has(tp)), missing };
  }
  attachments({ entity_type, entity_id } = {}) {
    if (entity_type && entity_id) return this.db.prepare("SELECT * FROM core_attachment WHERE entity_type=? AND entity_id=? ORDER BY created_at DESC, id").all(entity_type, entity_id);
    return this.db.prepare("SELECT * FROM core_attachment ORDER BY created_at DESC, id LIMIT 300").all();
  }

  guideState(projectId) {
    const artifacts = this.db
      .prepare("SELECT * FROM guide_artifact WHERE project_id=? ORDER BY stage_code, id")
      .all(projectId);
    const steps = this.db
      .prepare(
        `SELECT s.* FROM guide_step s JOIN guide_artifact a ON a.id=s.artifact_id WHERE a.project_id=?`
      )
      .all(projectId);
    const byArtifact = new Map();
    for (const s of steps) {
      if (!byArtifact.has(s.artifact_id)) byArtifact.set(s.artifact_id, {});
      byArtifact.get(s.artifact_id)[s.step_key] = { done_at: s.done_at, actor: s.actor };
    }
    return artifacts.map((a) => ({ ...a, steps: byArtifact.get(a.id) ?? {} }));
  }

  // --- 수동 라벨 (첫 쓰기 도메인: 메타데이터만, event_log 기록은 호출측) ---
  labels() {
    return this.db.prepare("SELECT * FROM mail_label ORDER BY name").all();
  }

  createLabel(name, color) {
    const trimmed = String(name ?? "").trim();
    if (!trimmed) return { error: "label_name_required" };
    try {
      this.db.prepare("INSERT INTO mail_label(name,color) VALUES(?,?)").run(trimmed, color || "#195a8e");
    } catch {
      return { error: "label_exists" };
    }
    return { label: this.db.prepare("SELECT * FROM mail_label WHERE name=?").get(trimmed) };
  }

  setMailLabel(mailId, labelId, on) {
    if (!this.db.prepare("SELECT 1 FROM core_mail WHERE id=?").get(mailId)) return { error: "mail_not_found" };
    if (!this.db.prepare("SELECT 1 FROM mail_label WHERE id=?").get(labelId)) return { error: "label_not_found" };
    if (on) {
      this.db.prepare("INSERT OR IGNORE INTO mail_label_map(mail_id,label_id) VALUES(?,?)").run(mailId, Number(labelId));
    } else {
      this.db.prepare("DELETE FROM mail_label_map WHERE mail_id=? AND label_id=?").run(mailId, Number(labelId));
    }
    return { ok: true };
  }

  artifacts({ project, kind } = {}) {
    const cond = [];
    const args = [];
    if (project) { cond.push("project_id=?"); args.push(project); }
    if (kind) { cond.push("kind=?"); args.push(kind); }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return this.db.prepare(`SELECT * FROM core_artifact ${where} ORDER BY updated_at DESC, id LIMIT 500`).all(...args);
  }

  people() {
    return this.db.prepare("SELECT * FROM core_person ORDER BY id").all();
  }
  // P-6 능력 매트릭스 — 사람↔역량 ref 링크(.registry/.unit 미파싱) + 콕핏 nudges(점수 미저장).
  setPersonSkill(person_id, capability_label, { source_ref = null, weight = 1 } = {}) {
    if (!this.db.prepare("SELECT 1 FROM core_person WHERE id=?").get(person_id)) return { error: "person_not_found" };
    const cap = String(capability_label ?? "").trim();
    if (!cap) return { error: "capability_required" };
    this.db.prepare(
      `INSERT INTO person_skill(person_id,capability_label,source_ref,weight) VALUES(?,?,?,?)
       ON CONFLICT(person_id,capability_label) DO UPDATE SET source_ref=excluded.source_ref, weight=excluded.weight`
    ).run(person_id, cap, source_ref, weight);
    return { ok: true };
  }
  personSkills(person_id) {
    return this.db.prepare("SELECT capability_label, source_ref, weight FROM person_skill WHERE person_id=? ORDER BY weight DESC, capability_label").all(person_id);
  }
  capabilityMatrix() {
    return this.people().map((p) => ({ person_id: p.id, name: p.name, role: p.role, unit_ref: p.unit_ref ?? null, capability_label: p.capability_label ?? null, skills: this.personSkills(p.id) }));
  }
  nudges({ person = null, limit = 5 } = {}) {
    const today = new Date().toISOString().slice(0, 10);
    const key = person ?? "";
    const rows = this.db.prepare(
      "SELECT id, title, project_id, due, status, assignee_ref FROM core_item WHERE status != 'done' AND (? = '' OR assignee_ref = ?)"
    ).all(key, key);
    const rank = { overdue: 0, blocked: 1, due_today: 2, open: 3 };
    const out = rows.map((r) => {
      let reason = "open";
      if (r.due === today) reason = "due_today";
      if (r.status === "blocked") reason = "blocked";
      if (r.due && r.due < today) reason = "overdue";
      return { id: r.id, title: r.title, project_id: r.project_id, due: r.due, status: r.status, assignee_ref: r.assignee_ref, reason };
    });
    out.sort((a, b) => (rank[a.reason] - rank[b.reason]) || String(a.due ?? "9999-99-99").localeCompare(String(b.due ?? "9999-99-99")));
    return out.slice(0, limit);
  }
  // P-7 사람별 부하(GROUP BY) — 건수 집계만(개인 점수 미산출·미저장). NULL=(미배정).
  workload(todayKey) {
    const rows = this.db.prepare(
      `SELECT assignee_ref,
         COUNT(*) AS total,
         SUM(CASE WHEN status != 'done' THEN 1 ELSE 0 END) AS open_cnt,
         SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked_cnt,
         SUM(CASE WHEN status NOT IN ('done') AND due IS NOT NULL AND due < ? THEN 1 ELSE 0 END) AS overdue_cnt
       FROM core_item GROUP BY assignee_ref`
    ).all(todayKey);
    const names = new Map(this.people().map((p) => [p.id, p.name]));
    return rows.map((r) => ({
      assignee_ref: r.assignee_ref ?? null,
      name: r.assignee_ref == null ? "(미배정)" : (names.get(r.assignee_ref) ?? r.assignee_ref),
      total: r.total, open_cnt: r.open_cnt, blocked_cnt: r.blocked_cnt, overdue_cnt: r.overdue_cnt,
    })).sort((a, b) => b.open_cnt - a.open_cnt);
  }
  // P-7 회의 미결 롤업 — 미완 액션이 남은 회의만(집계만).
  meetingOpenRollup() {
    return this.db.prepare(
      `SELECT m.id AS meeting_id, m.title, m.project_id,
         COUNT(map.item_id) AS total_actions,
         SUM(CASE WHEN i.status != 'done' THEN 1 ELSE 0 END) AS open_actions
       FROM core_meeting m
       JOIN meeting_action_map map ON map.meeting_id = m.id
       JOIN core_item i ON i.id = map.item_id
       GROUP BY m.id HAVING open_actions > 0 ORDER BY open_actions DESC`
    ).all();
  }
  // P-11 계산기 — 안전 평가(safeEval)·example 회귀검증·통과해야 active.
  upsertCalculator({ id, name, category = null, formula, variables = [], unit_out = null, source_ref = null, data_label = "real" }) {
    const nm = String(name ?? "").trim(), f = String(formula ?? "").trim();
    if (!nm || !f) return { error: "name_formula_required" };
    const vars = Array.isArray(variables) ? variables : [];
    const dummy = {}; for (const v of vars) if (v && v.name) dummy[v.name] = 1;
    try { safeEval(f, dummy); } catch (e) { if (e.message === "unsafe_token") return { error: "unsafe_formula" }; }
    const cid = id || `calc_${randomBytes(4).toString("hex")}`;
    this.db.prepare(
      `INSERT INTO core_calculator(id,name,category,formula,variables,unit_out,source_ref,status,data_label)
       VALUES(?,?,?,?,?,?,?,'draft',?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, formula=excluded.formula,
         variables=excluded.variables, unit_out=excluded.unit_out, source_ref=excluded.source_ref`
    ).run(cid, nm, category, f, JSON.stringify(vars), unit_out, source_ref, data_label);
    return { ok: true, id: cid };
  }
  calculators({ category = null } = {}) {
    const where = category ? "WHERE category=?" : "";
    return this.db.prepare(`SELECT * FROM core_calculator ${where} ORDER BY name`).all(...(category ? [category] : []));
  }
  addCalculatorExample(calculator_id, inputs, expected, tolerance = 1e-6) {
    if (!this.db.prepare("SELECT 1 FROM core_calculator WHERE id=?").get(calculator_id)) return { error: "calculator_not_found" };
    this.db.prepare("INSERT INTO calculator_example(calculator_id,inputs_json,expected,tolerance) VALUES(?,?,?,?)")
      .run(calculator_id, JSON.stringify(inputs ?? {}), Number(expected), Number(tolerance));
    return { ok: true };
  }
  evalCalculator(id, inputs) {
    const c = this.db.prepare("SELECT * FROM core_calculator WHERE id=?").get(id);
    if (!c) return { error: "calculator_not_found" };
    try { return { ok: true, value: safeEval(c.formula, inputs ?? {}) }; }
    catch (e) { return { error: e.message === "unsafe_token" ? "unsafe_formula" : "eval_error" }; }
  }
  verifyCalculator(id) {
    const c = this.db.prepare("SELECT * FROM core_calculator WHERE id=?").get(id);
    if (!c) return { error: "calculator_not_found" };
    const exs = this.db.prepare("SELECT * FROM calculator_example WHERE calculator_id=?").all(id);
    const failures = [];
    for (const ex of exs) {
      let got; try { got = safeEval(c.formula, JSON.parse(ex.inputs_json)); } catch { got = NaN; }
      if (!(Math.abs(got - ex.expected) <= ex.tolerance)) failures.push({ example_id: ex.id, got, expected: ex.expected });
    }
    return failures.length ? { ok: false, passed: exs.length - failures.length, failed: failures.length, failures } : { ok: true, passed: exs.length, failed: 0 };
  }
  activateCalculator(id) {
    const v = this.verifyCalculator(id);
    if (v.error) return v;
    if (!v.ok) return { error: "examples_failed", failures: v.failures };
    this.db.prepare("UPDATE core_calculator SET status='active' WHERE id=?").run(id);
    return { ok: true };
  }

  getMeta(key) {
    return this.db.prepare("SELECT value FROM meta WHERE key=?").get(key)?.value ?? null;
  }

  setMeta(key, value) {
    this.db.prepare("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, String(value));
  }

  // 실데이터 도착 시 합성 표본 제거 (fixture 는 언제든 재생성 가능)
  purgeSynthetic() {
    let removed = 0;
    const del = (sql) => { removed += this.db.prepare(sql).run().changes ?? 0; };
    // FK 안전 순서: 매핑/자식 → 부모. (구매·회의 맵이 synthetic 프로젝트/항목을 참조)
    // P3 재고/BOM/부품 (자식 맵 → 부모)
    del("DELETE FROM core_stock WHERE part_id IN (SELECT id FROM core_part WHERE data_label='synthetic') OR location_id IN (SELECT id FROM core_location WHERE data_label='synthetic')");
    del("DELETE FROM bom_edge WHERE parent_part_id IN (SELECT id FROM core_part WHERE data_label='synthetic') OR child_part_id IN (SELECT id FROM core_part WHERE data_label='synthetic')");
    del("DELETE FROM part_project_map WHERE part_id IN (SELECT id FROM core_part WHERE data_label='synthetic') OR project_id IN (SELECT id FROM core_project WHERE data_label='synthetic')");
    del("DELETE FROM core_part WHERE data_label='synthetic'");
    del("DELETE FROM core_location WHERE data_label='synthetic'");
    del("DELETE FROM contact_project_map WHERE contact_id IN (SELECT id FROM core_contact WHERE data_label='synthetic') OR project_id IN (SELECT id FROM core_project WHERE data_label='synthetic')");
    del("DELETE FROM core_contact WHERE data_label='synthetic'");
    del("DELETE FROM purchase_project_map WHERE purchase_id IN (SELECT id FROM core_purchase WHERE data_label='synthetic') OR project_id IN (SELECT id FROM core_project WHERE data_label='synthetic')");
    del("DELETE FROM core_purchase WHERE data_label='synthetic'");
    del("DELETE FROM core_party WHERE data_label='synthetic'");
    del("DELETE FROM meeting_action_map WHERE meeting_id IN (SELECT id FROM core_meeting WHERE data_label='synthetic') OR item_id IN (SELECT id FROM core_item WHERE data_label='synthetic')");
    del("DELETE FROM core_meeting WHERE data_label='synthetic'");
    // guide: data_label 없음 → synthetic 프로젝트 소속분 제거(step 먼저)
    del("DELETE FROM guide_step WHERE artifact_id IN (SELECT a.id FROM guide_artifact a JOIN core_project p ON p.id=a.project_id WHERE p.data_label='synthetic')");
    del("DELETE FROM guide_artifact WHERE project_id IN (SELECT id FROM core_project WHERE data_label='synthetic')");
    del("DELETE FROM core_stage WHERE project_id IN (SELECT id FROM core_project WHERE data_label='synthetic')");
    for (const t of ["core_faq", "chat_query_log", "core_attachment", "core_item", "core_mail", "core_artifact", "core_person", "core_project", "event_log"]) {
      del(`DELETE FROM ${t} WHERE data_label='synthetic'`);
    }
    return removed;
  }

  counts() {
    const one = (sql) => this.db.prepare(sql).get().c;
    return {
      projects: one("SELECT COUNT(*) c FROM core_project"),
      items: one("SELECT COUNT(*) c FROM core_item"),
      mail: one("SELECT COUNT(*) c FROM core_mail"),
      artifacts: one("SELECT COUNT(*) c FROM core_artifact"),
      events: one("SELECT COUNT(*) c FROM event_log")
    };
  }

  // ---------- P2b: 계정·세션·권한·레이아웃 ----------
  accountCount() {
    return this.db.prepare("SELECT COUNT(*) c FROM core_account").get().c;
  }
  createAccount({ id, username, password, person_id = null, roles = [] }) {
    const aid = id || `acc_${randomBytes(5).toString("hex")}`;
    if (!username || !password) return { error: "username_password_required" };
    if (this.db.prepare("SELECT 1 FROM core_account WHERE username=?").get(username)) return { error: "username_taken" };
    this.db.prepare(
      "INSERT INTO core_account(id,person_id,username,pw_hash,status,created_at) VALUES (?,?,?,?, 'active', ?)"
    ).run(aid, person_id, username, hashPassword(password), new Date().toISOString());
    for (const r of roles) this.assignRole(aid, r);
    return { ok: true, id: aid };
  }
  verifyLogin(username, password) {
    const a = this.db.prepare("SELECT * FROM core_account WHERE username=? AND status='active'").get(username);
    if (!a || !verifyPassword(password, a.pw_hash)) return null;
    return { id: a.id, username: a.username, person_id: a.person_id };
  }
  createSession(account_id, ttlHours = 12) {
    const token = randomBytes(24).toString("hex");
    const now = new Date();
    const exp = new Date(now.getTime() + ttlHours * 3600000);
    this.db.prepare("INSERT INTO auth_session(token,account_id,created_at,expires_at) VALUES (?,?,?,?)")
      .run(token, account_id, now.toISOString(), exp.toISOString());
    return token;
  }
  sessionAccount(token) {
    if (!token) return null;
    const s = this.db.prepare("SELECT * FROM auth_session WHERE token=?").get(token);
    if (!s) return null;
    if (new Date(s.expires_at).getTime() < Date.now()) { this.deleteSession(token); return null; }
    const a = this.db.prepare("SELECT id,username,person_id,status FROM core_account WHERE id=?").get(s.account_id);
    if (!a || a.status !== "active") return null;
    return { id: a.id, username: a.username, person_id: a.person_id };
  }
  deleteSession(token) {
    this.db.prepare("DELETE FROM auth_session WHERE token=?").run(token);
    return { ok: true };
  }
  upsertRole(id, name) {
    this.db.prepare("INSERT INTO rbac_role(id,name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name").run(id, name ?? id);
    return { ok: true };
  }
  assignRole(account_id, role_id) {
    this.db.prepare("INSERT OR IGNORE INTO rbac_account_role(account_id,role_id) VALUES(?,?)").run(account_id, role_id);
    return { ok: true };
  }
  setPermission(role_id, resource, visible, access) {
    this.db.prepare(
      `INSERT INTO rbac_permission(role_id,resource,visible,access) VALUES(?,?,?,?)
       ON CONFLICT(role_id,resource) DO UPDATE SET visible=excluded.visible, access=excluded.access`
    ).run(role_id, resource, visible ? 1 : 0, access ? 1 : 0);
    return { ok: true };
  }
  rolesFor(account_id) {
    return this.db.prepare("SELECT role_id FROM rbac_account_role WHERE account_id=?").all(account_id).map((r) => r.role_id);
  }
  // 권한 합집합: 여러 역할 중 하나라도 visible/access 면 true. 권한 정의 없으면 빈 배열(클라 기본정책 적용).
  permsFor(account_id) {
    const rows = this.db.prepare(
      `SELECT resource, MAX(visible) AS visible, MAX(access) AS access
       FROM rbac_permission WHERE role_id IN (SELECT role_id FROM rbac_account_role WHERE account_id=?)
       GROUP BY resource`
    ).all(account_id);
    return rows.map((r) => ({ resource: r.resource, visible: !!r.visible, access: !!r.access }));
  }
  getLayout(account_id) {
    const r = this.db.prepare("SELECT layout_json FROM user_dashboard_layout WHERE account_id=?").get(account_id);
    if (!r) return null;
    try { return JSON.parse(r.layout_json); } catch { return null; }
  }
  setLayout(account_id, layout) {
    const safe = Array.isArray(layout) ? layout : []; // 방어: 비배열은 빈 배열로
    this.db.prepare(
      `INSERT INTO user_dashboard_layout(account_id,layout_json,updated_at) VALUES(?,?,?)
       ON CONFLICT(account_id) DO UPDATE SET layout_json=excluded.layout_json, updated_at=excluded.updated_at`
    ).run(account_id, JSON.stringify(safe), new Date().toISOString());
    return { ok: true };
  }
  purgeExpiredSessions() {
    const r = this.db.prepare("DELETE FROM auth_session WHERE expires_at < ?").run(new Date().toISOString());
    return { removed: r.changes ?? 0 };
  }

  // ---------- 회의록(메타 전용). 원문/첨부 미저장 — summary_pointer 는 위치만 ----------
  createMeeting({ id, project_id = null, title, at = null, attendees = null, summary_pointer = null, data_label = "real" }) {
    const t = String(title ?? "").trim();
    if (!t) return { error: "title_required" };
    const mid = id || `mtg_${randomBytes(5).toString("hex")}`;
    this.db.prepare(
      "INSERT INTO core_meeting(id,project_id,title,at,attendees,summary_pointer,data_label,created_at) VALUES (?,?,?,?,?,?,?,?)"
    ).run(mid, project_id, t, at, attendees, summary_pointer, data_label, new Date().toISOString());
    return { ok: true, id: mid };
  }
  meetings({ project } = {}) {
    const where = project ? "WHERE project_id=?" : "";
    const args = project ? [project] : [];
    return this.db.prepare(`SELECT * FROM core_meeting ${where} ORDER BY COALESCE(at, created_at) DESC, id LIMIT 200`).all(...args);
  }
  // 기존 할일을 회의 액션아이템으로 '수동' 링크(자동추출 아님)
  linkActionItem(meeting_id, item_id) {
    if (!this.db.prepare("SELECT 1 FROM core_meeting WHERE id=?").get(meeting_id)) return { error: "meeting_not_found" };
    if (!this.db.prepare("SELECT 1 FROM core_item WHERE id=?").get(item_id)) return { error: "item_not_found" };
    this.db.prepare("INSERT OR IGNORE INTO meeting_action_map(meeting_id,item_id) VALUES(?,?)").run(meeting_id, item_id);
    return { ok: true };
  }
  meetingActions(meeting_id) {
    return this.db.prepare(
      `SELECT i.* FROM core_item i JOIN meeting_action_map m ON m.item_id=i.id WHERE m.meeting_id=? ORDER BY i.id`
    ).all(meeting_id);
  }
}
