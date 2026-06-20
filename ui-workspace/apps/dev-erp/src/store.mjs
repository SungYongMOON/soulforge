// dev-erp 저장 계층 (DESIGN.md 7절 구현)
// 구역 3개: core_*(업무 진실) / event_log(append-only) / game_*(게임 확장).
// 원칙: 몬스터=업무 레코드 동일 행, 게임 전용은 확장 테이블, 점수는 계산,
//       연결은 stable id + ref 문자열.
import { DatabaseSync } from "node:sqlite";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAT_CONTEXT_TURNS_DEFAULT, CHAT_CONTEXT_TURNS_MAX, runManualRetrievalPipeline } from "./chat_pipeline.mjs";

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
const INBOX_PROJECT_CODE = "P00-000_INBOX";
const TASK_PROJECT_RE = /^P\d{2}-\d{3}$/;
const isTaskProjectCode = (code) => TASK_PROJECT_RE.test(code) || code === INBOX_PROJECT_CODE;

function scopedInClause(column, values) {
  if (!Array.isArray(values)) return null;
  const ids = values.filter((x) => x != null && String(x).trim() !== "");
  if (!ids.length) return { sql: "1=0", args: [] };
  return { sql: `${column} IN (${ids.map(() => "?").join(",")})`, args: ids };
}

function normalizeMailboxKey(mailbox) {
  return String(mailbox ?? "").trim().toLowerCase();
}

function mailboxScopeClause(column, mailbox) {
  const key = normalizeMailboxKey(mailbox);
  if (!key || key === "team") return null;
  if (key === "__none__") return { sql: "0=1", args: [] };
  const expr = `LOWER(COALESCE(${column},''))`;
  const slashPrefix = `${key}/`;
  const backslashPrefix = `${key}\\`;
  return {
    sql: `(${expr}=? OR substr(${expr},1,?)=? OR substr(${expr},1,?)=?)`,
    args: [key, slashPrefix.length, slashPrefix, backslashPrefix.length, backslashPrefix],
  };
}

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
  provisional INTEGER NOT NULL DEFAULT 0, -- F7: 앱에서 만든 임시 과제(정션 미연결). 정션 동기화 시 0으로 머지.
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
  work_type TEXT,                             -- SE: 업무유형 answer|review|author|revise|purchase|verify|decide|schedule
  link_kind TEXT,                             -- SE: 연결대상 종류 requirement|artifact|meeting|bom|part|vendor|risk
  link_ref TEXT,                              -- SE: 연결대상 id(포인터)
  completion_criteria TEXT,                   -- SE: 완료기준(close-when)
  review_status TEXT,                         -- 메일→할일 자동화 검토 상태(needs_review|ready|reviewed...)
  review_reason TEXT,                         -- 검토대기/보정 사유(본문 원문 금지, 요약 메타만)
  correction_reason TEXT,
  route_candidate TEXT,
  route_confidence TEXT,
  route_reason TEXT,
  required_role TEXT,
  required_capability TEXT,
  suggested_assignee_ref TEXT,
  assignee_confidence TEXT,
  assignee_reason TEXT,
  source_candidate_ref TEXT,
  source_mail_ref TEXT,
  source_mail_source_id TEXT,
  source_thread_ref TEXT,
  source_group_ref TEXT,
  source_lineage_ref TEXT,
  generation_run_ref TEXT,
  generation_rule_ref TEXT,
  sync_state TEXT,
  sync_error TEXT,
  sync_revision INTEGER,
  sync_hash TEXT,
  sync_at TEXT,
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
  created_at TEXT NOT NULL,
  email TEXT,                    -- 가입 이메일(=메일 들고오기 기준 mailbox). 계정별 메일 인입 키.
  display_name TEXT,             -- 실제 가입한 이름(화면 표기). 없으면 username 폴백.
  mailbox_provider TEXT NOT NULL DEFAULT 'none', -- none|gmail|hiworks. 자격증명 값이 아니라 provider 메타만.
  mailbox_env_ref TEXT,          -- 계정별 인입 설정/env 파일의 repo-relative ref. secret 값 저장 금지.
  mailbox_enabled INTEGER NOT NULL DEFAULT 0,
  mailbox_status TEXT NOT NULL DEFAULT 'disabled',
  mailbox_last_fetch_at TEXT,
  mailbox_last_error TEXT,
  mailbox_last_summary_ref TEXT
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
  actor_ref TEXT,
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
CREATE TABLE IF NOT EXISTS codex_thread_binding (
  item_id TEXT PRIMARY KEY REFERENCES core_item(id),
  thread_id TEXT NOT NULL,
  thread_title TEXT NOT NULL,
  project_id TEXT,
  mode TEXT NOT NULL DEFAULT 'app-server',
  sync_state TEXT NOT NULL DEFAULT 'linked',
  last_synced_item_revision INTEGER,
  last_sync_at TEXT NOT NULL,
  last_error TEXT,
  data_label TEXT NOT NULL DEFAULT 'meta'
);
CREATE TABLE IF NOT EXISTS codex_thread_message (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES core_item(id),
  thread_id TEXT,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  actor_ref TEXT,
  mode TEXT,
  data_label TEXT NOT NULL DEFAULT 'meta'
);
CREATE INDEX IF NOT EXISTS idx_codex_thread_message_item ON codex_thread_message(item_id, id);
CREATE TABLE IF NOT EXISTS embed_view ( -- P-18 외부 시트 임베드(Smartsheet 등) read-only URL 메타
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'smartsheet',
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  project_id TEXT REFERENCES core_project(id),
  data_label TEXT NOT NULL DEFAULT 'real',
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS core_request ( -- 개발요청함: 팀원 요청 인입(받은 일) → 할 일 승격
  id TEXT PRIMARY KEY,
  project_id TEXT,                 -- 연결 과제(없으면 인입 미분류)
  title TEXT NOT NULL,
  requester TEXT,                  -- 요청자
  category TEXT,                   -- 분류(자유 텍스트)
  status TEXT NOT NULL DEFAULT 'open',  -- open|promoted|closed
  promoted_item_id TEXT,           -- 승격된 할 일 id
  pointer_ref TEXT,                -- 원문 위치 포인터(원문 미저장)
  data_label TEXT NOT NULL DEFAULT 'synthetic',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS core_deliverable ( -- SE 산출물 레지스터: SE_산출물_목록.csv ingest + 03_Out 상대포인터(원문 미저장)
  id TEXT PRIMARY KEY,                 -- <과제>:<게이트>:<산출물ID>
  project_id TEXT NOT NULL REFERENCES core_project(id),
  stage_code TEXT,                     -- 게이트 (예 120_CDR 또는 120)
  deliverable_no TEXT,                 -- 산출물ID
  name TEXT NOT NULL,                  -- 산출물명
  submit_type TEXT,                    -- draft|final|null (폴더 _D→draft _F→final)
  completion_criteria TEXT,            -- 완료기준
  due TEXT,                            -- 제출마감일 YYYY-MM-DD
  out_pointer TEXT,                    -- 상대 _workspaces/<과제>/<게이트>/<산출물폴더>/03_Out (원문 미저장)
  produced INTEGER NOT NULL DEFAULT 0, -- 03_Out 에 파일 1개 이상 있으면 1
  review_stage INTEGER NOT NULL DEFAULT 0, -- 0 미착수,1 작성됨,2 본인검토,3 팀검토,4 리드완료
  data_label TEXT NOT NULL DEFAULT 'real'
);
CREATE INDEX IF NOT EXISTS idx_deliverable_proj ON core_deliverable(project_id, stage_code);
-- 산출물 입력파일(메타·포인터 전용·원문 미저장). 산출물 In(입력) 폴더에 모이는 파일을 추적.
-- 출처 3루트(erp/mail/codex) 한 장부. 상태 needed→received→used. 실제 파일은 _workspaces 에.
CREATE TABLE IF NOT EXISTS deliverable_input (
  id TEXT PRIMARY KEY,                     -- 입력키 <산출물id>:<해시 또는 파일명키>
  deliverable_id TEXT NOT NULL,            -- core_deliverable.id (느슨 FK)
  project_id TEXT,
  stage_code TEXT,
  subfolder TEXT,                          -- In 아래 산출물종류별 분류(§ 설계)
  file_name TEXT,                          -- 표시 메타(원문 아님)
  pointer TEXT,                            -- 상대 _workspaces/<과제>/<경로>/02_Input/<하위>/<파일> (원문 미저장)
  source TEXT NOT NULL DEFAULT 'erp',      -- erp|mail|codex
  sha256 TEXT,
  size INTEGER,
  status TEXT NOT NULL DEFAULT 'needed',   -- needed|received|used
  mail_ref TEXT,                           -- mail 출처면 mailcsv:<이력키>
  note TEXT,
  created_at TEXT,
  data_label TEXT NOT NULL DEFAULT 'real'
);
CREATE INDEX IF NOT EXISTS idx_delivinput_deliv ON deliverable_input(deliverable_id);
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
  // 멀티 writer(외부 CLI/autosync/별도 커넥션) 동시 접근 대비: 즉시 SQLITE_BUSY 대신 5s 재시도 + WAL 권장 동기화 수준.
  db.exec("PRAGMA busy_timeout=5000;");
  db.exec("PRAGMA synchronous=NORMAL;");
  db.exec(DDL);
  // 경량 마이그레이션: 기존 DB 에 새 컬럼 추가 (있으면 무시)
  try { db.exec("ALTER TABLE core_project ADD COLUMN class TEXT NOT NULL DEFAULT 'active'"); } catch { /* exists */ }
  try { db.exec("ALTER TABLE core_project ADD COLUMN start_year INTEGER"); } catch { /* exists */ }
  try { db.exec("ALTER TABLE core_project ADD COLUMN provisional INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
  // 기존 행 backfill: 과제번호 P{YY}- 접두 → 과제시작년도(idempotent, 명시값 보존)
  try { db.exec("UPDATE core_project SET start_year = 2000 + CAST(SUBSTR(id,2,2) AS INTEGER) WHERE start_year IS NULL AND id GLOB 'P[0-9][0-9]-*'"); } catch { /* no-op */ }
  for (const ddl of [
    "ALTER TABLE core_item ADD COLUMN guide_artifact_id INTEGER",
    "ALTER TABLE core_item ADD COLUMN guide_step_key TEXT",
    "ALTER TABLE core_item ADD COLUMN origin_mail_id TEXT",
    "ALTER TABLE core_item ADD COLUMN created_by TEXT",
    "ALTER TABLE core_item ADD COLUMN work_type TEXT",
    "ALTER TABLE core_item ADD COLUMN link_kind TEXT",
    "ALTER TABLE core_item ADD COLUMN link_ref TEXT",
    "ALTER TABLE core_item ADD COLUMN completion_criteria TEXT",
    "ALTER TABLE event_log ADD COLUMN project_ref TEXT",
    "ALTER TABLE core_stage ADD COLUMN stage_code TEXT",
    "ALTER TABLE core_attachment ADD COLUMN artifact_type TEXT",
    "ALTER TABLE core_item ADD COLUMN anchor_date TEXT",
    "ALTER TABLE core_item ADD COLUMN anchor_stage_code TEXT",
    "ALTER TABLE core_item ADD COLUMN offset_days INTEGER",
    "ALTER TABLE core_item ADD COLUMN due_overridden INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE core_person ADD COLUMN unit_ref TEXT",
    "ALTER TABLE core_person ADD COLUMN capability_label TEXT",
    // SE 산출물 일정(due) 출처: 'ingest'(스캔 추출, 보통 비어있음) | 'owner'(사람이 직접 지정) | 'auto'(나중에 Codex 분석 채움).
    // owner 가 지정한 일정은 재-ingest 가 덮어쓰지 않는다(아래 upsertCoreDeliverable CASE 참고).
    "ALTER TABLE core_deliverable ADD COLUMN due_source TEXT NOT NULL DEFAULT 'ingest'",
    // 메일 장부 ingest(과제별 메일_이력.csv → core_mail): 단계 연결 + 출처(이력키/소스ID) 추적.
    "ALTER TABLE core_mail ADD COLUMN stage_code TEXT",
    "ALTER TABLE core_mail ADD COLUMN source_ref TEXT",
    // 할일 생성시각(할일_장부 '기록일' 컬럼의 실제 백킹). 마이그레이션 이전 행은 null(생성시각 불명), 신규 createItem 부터 채움.
    "ALTER TABLE core_item ADD COLUMN created_at TEXT",
    // 메일→할일 자동화 메타데이터: 검토/라우팅/배정/출처/생성/동기화 상태를 비고가 아닌 구조화 컬럼으로 보존.
    "ALTER TABLE core_item ADD COLUMN review_status TEXT",
    "ALTER TABLE core_item ADD COLUMN review_reason TEXT",
    "ALTER TABLE core_item ADD COLUMN correction_reason TEXT",
    "ALTER TABLE core_item ADD COLUMN route_candidate TEXT",
    "ALTER TABLE core_item ADD COLUMN route_confidence TEXT",
    "ALTER TABLE core_item ADD COLUMN route_reason TEXT",
    "ALTER TABLE core_item ADD COLUMN required_role TEXT",
    "ALTER TABLE core_item ADD COLUMN required_capability TEXT",
    "ALTER TABLE core_item ADD COLUMN suggested_assignee_ref TEXT",
    "ALTER TABLE core_item ADD COLUMN assignee_confidence TEXT",
    "ALTER TABLE core_item ADD COLUMN assignee_reason TEXT",
    "ALTER TABLE core_item ADD COLUMN source_candidate_ref TEXT",
    "ALTER TABLE core_item ADD COLUMN source_mail_ref TEXT",
    "ALTER TABLE core_item ADD COLUMN source_mail_source_id TEXT",
    "ALTER TABLE core_item ADD COLUMN source_thread_ref TEXT",
    "ALTER TABLE core_item ADD COLUMN source_group_ref TEXT",
    "ALTER TABLE core_item ADD COLUMN source_lineage_ref TEXT",
    "ALTER TABLE core_item ADD COLUMN generation_run_ref TEXT",
    "ALTER TABLE core_item ADD COLUMN generation_rule_ref TEXT",
    "ALTER TABLE core_item ADD COLUMN sync_state TEXT",
    "ALTER TABLE core_item ADD COLUMN sync_error TEXT",
    "ALTER TABLE core_item ADD COLUMN sync_revision INTEGER",
    "ALTER TABLE core_item ADD COLUMN sync_hash TEXT",
    "ALTER TABLE core_item ADD COLUMN sync_at TEXT",
    // P2b 팀: 계정 이메일(메일 인입 mailbox 키) + 실제 가입 이름(화면 표기).
    "ALTER TABLE core_account ADD COLUMN email TEXT",
    "ALTER TABLE core_account ADD COLUMN display_name TEXT",
    // 계정별 mailbox 등록 메타데이터. secret/token 값은 저장하지 않고 repo-relative env/config ref 만 둔다.
    "ALTER TABLE core_account ADD COLUMN mailbox_provider TEXT NOT NULL DEFAULT 'none'",
    "ALTER TABLE core_account ADD COLUMN mailbox_env_ref TEXT",
    "ALTER TABLE core_account ADD COLUMN mailbox_enabled INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE core_account ADD COLUMN mailbox_status TEXT NOT NULL DEFAULT 'disabled'",
    "ALTER TABLE core_account ADD COLUMN mailbox_last_fetch_at TEXT",
    "ALTER TABLE core_account ADD COLUMN mailbox_last_error TEXT",
    "ALTER TABLE core_account ADD COLUMN mailbox_last_summary_ref TEXT",
    // 다중 사용자 메일: 어느 mailbox(계정 이메일)로 들어온 메일인지. 담당자별 메일 이력 분리 키.
    // null = 단일(owner) 파일럿 메일. Codex 계정별 메일 인입 시 account.email 로 채운다.
    "ALTER TABLE core_mail ADD COLUMN mailbox TEXT",
    // 산출물 입력 포인터(02_Input) — out_pointer 와 대칭. 상대경로(원문 미저장).
    "ALTER TABLE core_deliverable ADD COLUMN in_pointer TEXT",
    // 챗봇 질문 로그는 야간 매뉴얼 갱신 입력이므로 질문자/대화방을 함께 보존한다.
    "ALTER TABLE chat_query_log ADD COLUMN actor_ref TEXT"
  ]) {
    try { db.exec(ddl); } catch { /* exists */ }
  }
  // P-0: 단계 식별을 title 에서 분리한 stage_code 정본 컬럼. 기존 행 backfill=title.
  try { db.exec("UPDATE core_stage SET stage_code=title WHERE stage_code IS NULL OR stage_code=''"); } catch { /* noop */ }
  // P-2/SE-DATA: SE 스케줄러 시드 — data/se_process_seed.json 있으면 소비, 없으면 120_CDR stub.
  try { seedSeProcess(db); } catch { /* noop */ }
  // P2b 팀: 기본 역할 2종(관리자/팀원) 시드 + 계정 이메일 조회 인덱스. 멱등.
  try {
    db.exec("INSERT INTO rbac_role(id,name) VALUES('admin','관리자') ON CONFLICT(id) DO NOTHING");
    db.exec("INSERT INTO rbac_role(id,name) VALUES('member','팀원') ON CONFLICT(id) DO NOTHING");
    db.exec("CREATE INDEX IF NOT EXISTS idx_account_email ON core_account(email)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_mail_mailbox ON core_mail(mailbox)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_chatlog_actor_thread ON chat_query_log(actor_ref, thread_id, at)");
  } catch { /* noop */ }
  // 동시성 백스톱(DB 레벨): 메일→할일 중복 승격과 계정 이메일 중복을 DB가 거부. 앱레벨 가드(already_promoted/email_taken)와 이중 방어.
  // 기존 데이터에 중복이 있으면 인덱스 생성이 실패하므로 각각 격리(생략돼도 앱레벨 가드는 유지 — 정리 후 재시작 시 활성).
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_item_origin_mail_unique ON core_item(origin_mail_id) WHERE origin_mail_id IS NOT NULL"); }
  catch { /* 기존 중복 origin_mail_id 존재 → dedup 후 재시작 시 활성 */ }
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_account_email_unique ON core_account(email) WHERE email IS NOT NULL"); }
  catch { /* 기존 중복 email 존재 → dedup 후 재시작 시 활성 */ }
  const cur = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get();
  if (!cur) {
    db.prepare("INSERT INTO meta(key,value) VALUES('schema_version',?)").run(SCHEMA_VERSION);
  }
  return new Store(db);
}

// P-4 키스톤: 승인 시 실행 가능한 도메인 쓰기 화이트리스트(임의 SQL/eval 금지).
const PROPOSAL_KINDS = ["create_item", "add_attachment_type", "set_artifact_requirement", "link_part_project"];

export class Store {
  static normalizeMailboxKey = normalizeMailboxKey;
  static mailboxScopeClause = mailboxScopeClause;

  mailboxScopeClause(column, mailbox) {
    return Store.mailboxScopeClause(column, mailbox);
  }

  mailboxMatches(mailboxValue, mailboxKey) {
    const key = Store.normalizeMailboxKey(mailboxKey);
    if (!key || key === "team" || key === "__none__") return false;
    const value = Store.normalizeMailboxKey(mailboxValue);
    return value === key || value.startsWith(`${key}/`) || value.startsWith(`${key}\\`);
  }

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

  recentEvents(limit = 20, project = null, scope = {}) {
    const cond = [];
    const args = [];
    if (project) { cond.push("project_ref=?"); args.push(project); }
    const scopeSql = this.eventScopeWhere(scope, args);
    if (scopeSql) cond.push(scopeSql);
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return this.db
      .prepare(`SELECT * FROM event_log ${where} ORDER BY id DESC LIMIT ?`)
      .all(...args, limit)
      .map((row) => ({ ...row, used_refs: JSON.parse(row.used_refs ?? "[]") }));
  }

  // 전체 감사로그 조회 — 과제·종류·행위자·기간 필터(append-only event_log 원천). 조회 잡음도 포함(필터는 화면에서).
  queryEvents({ project = null, kind = null, actor = null, since = null, limit = 200, excludeKinds = null, scope = null } = {}) {
    const cond = []; const args = [];
    if (project) { cond.push("project_ref=?"); args.push(project); }
    if (kind) { cond.push("kind=?"); args.push(kind); }
    // 잡음(view 등) 서버측 제외: limit 이 의미 이벤트에만 걸리게 해 오래된 가입·승인이 묻히지 않게.
    // 특정 kind 필터가 있으면 그게 우선이라 제외는 적용 안 함.
    else if (Array.isArray(excludeKinds) && excludeKinds.length) {
      cond.push(`kind NOT IN (${excludeKinds.map(() => "?").join(",")})`);
      args.push(...excludeKinds);
    }
    if (actor) { cond.push("actor_ref=?"); args.push(actor); }
    if (since) { cond.push("at>=?"); args.push(since); }
    const scopeSql = this.eventScopeWhere(scope, args);
    if (scopeSql) cond.push(scopeSql);
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return this.db
      .prepare(`SELECT * FROM event_log ${where} ORDER BY id DESC LIMIT ?`)
      .all(...args, Math.max(1, Math.min(1000, Number(limit) || 200)))
      .map((row) => ({ ...row, used_refs: JSON.parse(row.used_refs ?? "[]") }));
  }
  eventScopeWhere(scope, args) {
    if (!scope || scope.all) return "";
    const pieces = [];
    const actor = String(scope.actor ?? "").trim();
    if (actor) { pieces.push("actor_ref=?"); args.push(actor); }
    const itemScope = scopedInClause("assignee_ref", scope.assignee_any);
    if (itemScope) {
      pieces.push(`item_ref IN (SELECT id FROM core_item WHERE ${itemScope.sql})`);
      args.push(...itemScope.args);
    }
    const mailbox = String(scope.mailbox ?? "").trim().toLowerCase();
    if (mailbox && mailbox !== "team" && mailbox !== "__none__") {
      const mailScope = this.mailboxScopeClause("mailbox", mailbox);
      if (mailScope) {
        pieces.push(`item_ref IN (SELECT id FROM core_mail WHERE ${mailScope.sql})`);
        args.push(...mailScope.args);
      }
    }
    return pieces.length ? `(${pieces.join(" OR ")})` : "";
  }
  // 감사로그 필터 선택지(distinct 종류·행위자).
  eventFacets(scope = null) {
    if (scope && !scope.all) {
      const rows = this.queryEvents({ limit: 1000, scope });
      return {
        kinds: [...new Set(rows.map((r) => r.kind).filter(Boolean))].sort(),
        actors: [...new Set(rows.map((r) => r.actor_ref).filter(Boolean))].sort(),
      };
    }
    return {
      kinds: this.db.prepare("SELECT DISTINCT kind FROM event_log ORDER BY kind").all().map((r) => r.kind),
      actors: this.db.prepare("SELECT DISTINCT actor_ref FROM event_log WHERE actor_ref IS NOT NULL ORDER BY actor_ref").all().map((r) => r.actor_ref),
    };
  }

  // --- upserts (adapter/fixture 용) ---
  upsertProject(p) {
    // 과제시작년도: 명시값 우선, 없으면 과제번호 접두 P{YY}-에서 도출(P26-→2026), 그래도 없으면 null.
    const startYear = p.start_year ?? deriveStartYear(p.id);
    this.db
      .prepare(
        `INSERT INTO core_project(id,title,health,class,stage_current,start_year,source_ref,data_label,provisional)
         VALUES (?,?,?,?,?,?,?,?,0)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, health=excluded.health,
           class=excluded.class, stage_current=excluded.stage_current,
           start_year=COALESCE(excluded.start_year, core_project.start_year), source_ref=excluded.source_ref,
           provisional=0`
      )
      .run(p.id, p.title, p.health ?? "ok", p.class ?? "active", p.stage_current ?? null, startYear, p.source_ref ?? null, p.data_label ?? "synthetic");
  }

  // F7: 앱에서 임시 과제 생성 — 정션(_workspaces)이 진실 소스라, 앱 생성분은 provisional=1('정션 미연결')로 표시.
  // 이후 정션 동기화(upsertProject)가 같은 코드로 들어오면 provisional=0 으로 머지된다(정션이 권위).
  createProject({ id, title, start_year } = {}) {
    const code = String(id ?? "").trim().toUpperCase();
    const nm = String(title ?? "").trim();
    if (!code) return { error: "project_id_required" };
    if (!/^[A-Z0-9][A-Z0-9_-]{1,30}$/.test(code)) return { error: "project_id_format" };
    if (!nm) return { error: "title_required" };
    if (this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(code)) return { error: "project_exists" };
    const sy = start_year ?? deriveStartYear(code);
    this.db.prepare(
      `INSERT INTO core_project(id,title,health,class,start_year,source_ref,data_label,provisional)
       VALUES(?,?,?,?,?,?,?,1)`
    ).run(code, nm, "ok", "active", sy, null, "real");
    return { ok: true, project: this.db.prepare("SELECT * FROM core_project WHERE id=?").get(code) };
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
        `INSERT INTO core_mail(id,project_id,at,direction,subject,counterpart,pointer_ref,stage_code,source_ref,mailbox,data_label)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, at=excluded.at, direction=excluded.direction,
           subject=excluded.subject, counterpart=excluded.counterpart, pointer_ref=excluded.pointer_ref,
           stage_code=excluded.stage_code, source_ref=excluded.source_ref,
           mailbox=COALESCE(excluded.mailbox, core_mail.mailbox)`
      )
      .run(m.id, m.project_id ?? null, m.at, m.direction ?? "in", m.subject, m.counterpart ?? null,
        m.pointer_ref ?? null, m.stage_code ?? null, m.source_ref ?? null,
        (m.mailbox ? String(m.mailbox).trim().toLowerCase() : null) || null, m.data_label ?? "synthetic");
  }

  // 메일 장부 ingest 착지면(과제별 _workmeta/<code>/reports/메일_이력/메일_이력.csv 한 행 → core_mail).
  // 원문 미저장: 제목·상대·시각·단계·포인터만. project_code 가 미등록이면 stub 과제를 만들되 기존 제목은 덮지 않는다.
  // FK 안전: 모르는 코드는 project_id=null 로 둔다. P00-000_INBOX 는 예약 인박스 프로젝트로 묶는다.
  ingestMail({ id, project_code = null, at = null, subject = null, counterpart = null, stage_code = null,
               source_ref = null, direction = "in", pointer_ref = null, mailbox = null, data_label = "real" }) {
    if (!id) return { error: "id_required" };
    const atVal = at && /^\d{4}-\d{2}-\d{2}/.test(at) ? at : null;
    if (!atVal) return { error: "at_required" };
    const subj = String(subject ?? "").trim() || "(제목 없음)";
    const existing = this.db.prepare("SELECT project_id FROM core_mail WHERE id=?").get(id);
    let project_id = null;
    const code = String(project_code ?? "").trim();
    if (isTaskProjectCode(code)) {
      if (!this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(code)) {
        // 미등록 과제 → 최소 stub(제목=코드). 실제 과제명은 sync_project_names 로 따로 채운다.
        this.upsertProject({
          id: code,
          title: code === INBOX_PROJECT_CODE ? "미분류 메일함" : code,
          class: code === INBOX_PROJECT_CODE ? "inbox" : "active",
          data_label: "real"
        });
      }
      project_id = code;
    }
    if (project_id === INBOX_PROJECT_CODE && existing?.project_id && existing.project_id !== INBOX_PROJECT_CODE) {
      project_id = existing.project_id;
    }
    const isNew = !existing;
    const dir = ["in", "out"].includes(direction) ? direction : "in";
    this.upsertMail({ id, project_id, at: atVal, direction: dir, subject: subj, counterpart: counterpart || null,
      pointer_ref, stage_code: stage_code || null, source_ref: source_ref || null, mailbox: mailbox || null, data_label });
    return { ok: true, id, project_id, isNew };
  }

  // 할일 장부 ingest 착지면(_workmeta/<code>/reports/할일_장부/할일_장부.csv 한 행 → core_item).
  // 작업_장부(과거 로그)의 자매 — '앞으로 할 일' 장부. ERP 가 export 로 쓰고 ingest 로 읽는 왕복.
  // 할일키=id 로 멱등 upsert. 상태/업무유형/연결유형은 enum 검증(이상값은 안전 폴백). 원문 미저장.
  ingestTaskItem(row = {}) {
    const id = String(row.id ?? "").trim();
    if (!id) return { error: "id_required" };
    const title = String(row.title ?? "").trim();
    if (!title) return { error: "title_required" };
    const code = String(row.project_code ?? "").trim();
    if (!isTaskProjectCode(code)) return { error: "project_required" }; // 할일은 과제 또는 예약 인박스 필수(메일과 다름)
    if (!this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(code)) {
      this.upsertProject({
        id: code,
        title: code === INBOX_PROJECT_CODE ? "미분류 메일함" : code,
        class: code === INBOX_PROJECT_CODE ? "inbox" : "active",
        data_label: "real"
      }); // stub(기존 제목 미클로버). P00-000_INBOX 는 회사 일반/미해결 예약함.
    }
    // 절대경로 금지(헌장 shared_ingest_contract): 포인터류는 상대/네임스페이스 ref 만, 로컬 절대면 드롭.
    const relOnly = (v) => {
      const s = String(v ?? "").trim();
      return !s || isAbsolute(s) || /^[A-Za-z]:[\\/]/.test(s) || /^\\\\/.test(s) ? null : s;
    };
    const mailRefOnly = (v) => {
      const s = relOnly(v);
      if (!s) return null;
      if (/^[A-Za-z][A-Za-z0-9_.-]*:/.test(s) || /^mail_[A-Za-z0-9]/.test(s)) return s;
      return `mailcsv:${s}`;
    };
    const due = row.due && /^\d{4}-\d{2}-\d{2}$/.test(String(row.due).trim()) ? String(row.due).trim() : null;
    const work_type = Store.WORK_TYPES.includes(row.work_type) ? row.work_type : null;
    const link_kind = Store.LINK_KINDS.includes(row.link_kind) ? row.link_kind : null;
    const originVal = Store.ORIGINS.includes(row.origin) ? row.origin : "ledger"; // 출처도 enum 검증(자매 패턴)
    const isNew = !this.db.prepare("SELECT 1 FROM core_item WHERE id=?").get(id);
    // SE 기준점 격리(slice1 미러): 인입(메일/요청/회의) 출처가 앵커(단계/연결)+업무유형 없으면 unclassified 강제 —
    // 손편집 CSV 가 미분류 격리 게이트를 우회해 활성 목록에 진입하지 못하게.
    const inbound = ["mail", "request", "meeting"].includes(originVal);
    const hasAnchor = !!(row.anchor_stage_code || link_kind);
    const statusIn = Store.ITEM_STATUSES.includes(row.status) ? row.status : null; // 빈/이상값은 ''(아래 NULLIF로 기존 보존)
    // status 는 NOT NULL: 신규 빈값은 'open', 기존 빈값은 ''(센티넬)로 넣고 UPDATE 에서 NULLIF→기존 보존.
    const statusVal = inbound && !(hasAnchor && work_type) ? "unclassified" : (statusIn ?? (isNew ? "open" : ""));
    const createdVal = (row.created_at && String(row.created_at).trim()) || (isNew ? new Date().toISOString() : null);
    const originMailRef = mailRefOnly(row.origin_mail_id || row.source_mail_ref);
    const automation = Store.normalizeTaskAutomation({ ...row, source_mail_ref: row.source_mail_ref || originMailRef }, { status: statusVal });
    // 멱등 보존(자매 upsertProject/Person 패턴): 빈 컬럼은 기존값 유지(COALESCE) — 손편집 부분행이 ERP 입력을 안 지움.
    // owner 가 ERP 에서 직접 바꾼 마감(due_overridden=1)은 stale 장부 재-ingest 가 되돌리지 못함(CASE).
    this.db
      .prepare(
        `INSERT INTO core_item(id,project_id,title,origin,urgency,assignee_ref,status,due,
           origin_mail_id,created_by,work_type,link_kind,link_ref,completion_criteria,anchor_stage_code,created_at,
           review_status,review_reason,correction_reason,route_candidate,route_confidence,route_reason,
           required_role,required_capability,suggested_assignee_ref,assignee_confidence,assignee_reason,
           source_candidate_ref,source_mail_ref,source_mail_source_id,source_thread_ref,source_group_ref,source_lineage_ref,
           generation_run_ref,generation_rule_ref,sync_state,sync_error,sync_revision,sync_hash,sync_at,data_label)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'real')
         ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, title=excluded.title, origin=excluded.origin,
           assignee_ref=COALESCE(excluded.assignee_ref, core_item.assignee_ref),
           status=COALESCE(NULLIF(excluded.status, ''), core_item.status),
           due=CASE WHEN core_item.due_overridden=1 THEN core_item.due ELSE COALESCE(excluded.due, core_item.due) END,
           origin_mail_id=COALESCE(excluded.origin_mail_id, core_item.origin_mail_id),
           work_type=COALESCE(excluded.work_type, core_item.work_type),
           link_kind=COALESCE(excluded.link_kind, core_item.link_kind),
           link_ref=COALESCE(excluded.link_ref, core_item.link_ref),
           completion_criteria=COALESCE(excluded.completion_criteria, core_item.completion_criteria),
           anchor_stage_code=COALESCE(excluded.anchor_stage_code, core_item.anchor_stage_code),
           created_at=COALESCE(core_item.created_at, excluded.created_at),
           review_status=COALESCE(excluded.review_status, core_item.review_status),
           review_reason=COALESCE(excluded.review_reason, core_item.review_reason),
           correction_reason=COALESCE(excluded.correction_reason, core_item.correction_reason),
           route_candidate=COALESCE(excluded.route_candidate, core_item.route_candidate),
           route_confidence=COALESCE(excluded.route_confidence, core_item.route_confidence),
           route_reason=COALESCE(excluded.route_reason, core_item.route_reason),
           required_role=COALESCE(excluded.required_role, core_item.required_role),
           required_capability=COALESCE(excluded.required_capability, core_item.required_capability),
           suggested_assignee_ref=COALESCE(excluded.suggested_assignee_ref, core_item.suggested_assignee_ref),
           assignee_confidence=COALESCE(excluded.assignee_confidence, core_item.assignee_confidence),
           assignee_reason=COALESCE(excluded.assignee_reason, core_item.assignee_reason),
           source_candidate_ref=COALESCE(excluded.source_candidate_ref, core_item.source_candidate_ref),
           source_mail_ref=COALESCE(excluded.source_mail_ref, core_item.source_mail_ref),
           source_mail_source_id=COALESCE(excluded.source_mail_source_id, core_item.source_mail_source_id),
           source_thread_ref=COALESCE(excluded.source_thread_ref, core_item.source_thread_ref),
           source_group_ref=COALESCE(excluded.source_group_ref, core_item.source_group_ref),
           source_lineage_ref=COALESCE(excluded.source_lineage_ref, core_item.source_lineage_ref),
           generation_run_ref=COALESCE(excluded.generation_run_ref, core_item.generation_run_ref),
           generation_rule_ref=COALESCE(excluded.generation_rule_ref, core_item.generation_rule_ref),
           sync_state=COALESCE(excluded.sync_state, core_item.sync_state),
           sync_error=COALESCE(excluded.sync_error, core_item.sync_error),
           sync_revision=COALESCE(excluded.sync_revision, core_item.sync_revision),
           sync_hash=COALESCE(excluded.sync_hash, core_item.sync_hash),
           sync_at=COALESCE(excluded.sync_at, core_item.sync_at)`
      )
      .run(
        id, code, title, originVal, row.urgency || "normal", row.assignee_ref || null, statusVal, due,
        originMailRef, row.created_by || "task_ledger", work_type, link_kind, relOnly(row.link_ref),
        row.completion_criteria || null, row.anchor_stage_code || null, createdVal,
        automation.review_status, automation.review_reason, automation.correction_reason,
        automation.route_candidate, automation.route_confidence, automation.route_reason,
        automation.required_role, automation.required_capability, automation.suggested_assignee_ref,
        automation.assignee_confidence, automation.assignee_reason, automation.source_candidate_ref,
        automation.source_mail_ref, automation.source_mail_source_id, automation.source_thread_ref,
        automation.source_group_ref, automation.source_lineage_ref, automation.generation_run_ref,
        automation.generation_rule_ref, automation.sync_state, automation.sync_error, automation.sync_revision,
        automation.sync_hash, automation.sync_at
      );
    return { ok: true, id, project_id: code, isNew };
  }

  // slice(베타1): 사용자가 직접 메일 등록(각자 계정에서 자기 메일을 장부에 쌓기). 원문 미저장 — 제목·상대·날짜·포인터만.
  createMail({ project_id = null, subject, counterpart = null, at = null, direction = "in", pointer_ref = null, mailbox = null, data_label = "real" }) {
    const s = String(subject ?? "").trim();
    if (!s) return { error: "subject_required" };
    if (project_id && !this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(project_id)) return { error: "project_not_found" };
    const dir = ["in", "out"].includes(direction) ? direction : "in";
    const id = `mail_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
    const atVal = (at && /^\d{4}-\d{2}-\d{2}/.test(at)) ? at : new Date().toISOString().slice(0, 10);
    this.upsertMail({ id, project_id, at: atVal, direction: dir, subject: s, counterpart, pointer_ref, mailbox, data_label });
    return { ok: true, id, mail: this.db.prepare("SELECT * FROM core_mail WHERE id=?").get(id) };
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
  summary(todayKey, weekEndKey = todayKey, { assignee_any, mailbox } = {}) {
    const projects = this.db.prepare("SELECT * FROM core_project ORDER BY id").all();
    const itemScope = scopedInClause("assignee_ref", assignee_any);
    const itemScopeSql = itemScope ? ` WHERE ${itemScope.sql}` : "";
    const counts = this.db
      .prepare(
        `SELECT project_id,
           COUNT(*) AS total_cnt,
           SUM(CASE WHEN status NOT IN ('done','unclassified','archived') THEN 1 ELSE 0 END) AS open_cnt,
           SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END) AS blocked_cnt,
           SUM(CASE WHEN status NOT IN ('done','unclassified','archived') AND due IS NOT NULL AND due < ? THEN 1 ELSE 0 END) AS overdue_cnt,
           SUM(CASE WHEN status NOT IN ('done','unclassified','archived') AND due = ? THEN 1 ELSE 0 END) AS today_cnt,
           SUM(CASE WHEN status NOT IN ('done','unclassified','archived') AND due > ? AND due <= ? THEN 1 ELSE 0 END) AS week_cnt,
           SUM(CASE WHEN encounter_role='boss' AND status NOT IN ('done','unclassified','archived') THEN 1 ELSE 0 END) AS boss_cnt
         FROM core_item${itemScopeSql} GROUP BY project_id`
      )
      .all(todayKey, todayKey, todayKey, weekEndKey, ...(itemScope?.args ?? []));
    const mailConds = [];
    const mailArgs = [];
    if (mailbox && mailbox !== "team") {
      const mailScope = this.mailboxScopeClause("mailbox", mailbox);
      if (mailScope) { mailConds.push(mailScope.sql); mailArgs.push(...mailScope.args); }
    }
    const mailWhere = mailConds.length ? `WHERE ${mailConds.join(" AND ")}` : "";
    const mailRows = this.db
      .prepare(`SELECT project_id, at, subject FROM core_mail ${mailWhere} ORDER BY project_id, at DESC, id DESC`)
      .all(...mailArgs);
    const mailById = new Map();
    const lastSubject = new Map();
    for (const row of mailRows) {
      if (!mailById.has(row.project_id)) mailById.set(row.project_id, { project_id: row.project_id, last_at: row.at, mail_cnt: 0 });
      mailById.get(row.project_id).mail_cnt += 1;
      if (!lastSubject.has(row.project_id)) lastSubject.set(row.project_id, row.subject);
    }
    const byId = new Map(counts.map((c) => [c.project_id, c]));
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

  _pageBounds(limit = 100, offset = 0, maxLimit = 500) {
    const n = Math.trunc(Number(limit));
    const o = Math.trunc(Number(offset));
    return {
      limit: Math.min(maxLimit, Math.max(1, Number.isFinite(n) ? n : 100)),
      offset: Math.max(0, Number.isFinite(o) ? o : 0)
    };
  }

  _itemWhere({ project, status, q, due_before, due_before_exclusive, include_unclassified = false, assignee_any } = {}) {
    const cond = [];
    const args = [];
    if (project) { cond.push("i.project_id=?"); args.push(project); }
    if (status) { cond.push("i.status=?"); args.push(status); }
    else if (!include_unclassified) { cond.push("i.status NOT IN ('unclassified','archived')"); } // 미분류는 기본 격리(분류 필요 화면만 명시 조회)
    if (due_before_exclusive) {
      cond.push("i.due IS NOT NULL AND i.due<?");
      args.push(due_before_exclusive);
      if (!status) cond.push(include_unclassified ? "i.status NOT IN ('done','archived')" : "i.status NOT IN ('done','unclassified','archived')");
    } else if (due_before) {
      cond.push("i.due IS NOT NULL AND i.due<=?");
      args.push(due_before);
      if (!status) cond.push(include_unclassified ? "i.status NOT IN ('done','archived')" : "i.status NOT IN ('done','unclassified','archived')");
    }
    // 내 일 필터: assignee_ref 가 내 식별자(로그인명 또는 사람 이름) 중 하나와 일치. 빈 배열이면 '아무도 매칭 안 됨'(빈 결과).
    if (Array.isArray(assignee_any)) {
      const ids = assignee_any.filter((x) => x != null && String(x).trim() !== "");
      if (ids.length) { cond.push(`i.assignee_ref IN (${ids.map(() => "?").join(",")})`); args.push(...ids); }
      else cond.push("1=0");
    }
    if (q) {
      cond.push(`(i.title LIKE ? OR i.id LIKE ? OR i.project_id LIKE ? OR i.origin_mail_id LIKE ? OR i.source_mail_ref LIKE ? OR i.source_mail_source_id LIKE ? OR i.source_thread_ref LIKE ? OR i.source_lineage_ref LIKE ?)`);
      args.push(...Array(8).fill(`%${q}%`));
    }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return { where, args };
  }

  items({ project, status, q, due_before, due_before_exclusive, include_unclassified = false, assignee_any, limit = 500, offset = 0 } = {}) {
    const { where, args } = this._itemWhere({ project, status, q, due_before, due_before_exclusive, include_unclassified, assignee_any });
    const page = this._pageBounds(limit, offset, 1000);
    const rows = this.db
      .prepare(
        `SELECT i.*, ga.name AS guide_artifact_name, ga.stage_code AS guide_stage_code
         FROM core_item i LEFT JOIN guide_artifact ga ON ga.id = i.guide_artifact_id
         ${where} ORDER BY (i.due IS NULL), i.due, i.id LIMIT ? OFFSET ?`
      )
      .all(...args, page.limit, page.offset);
    return this._withCodexTaskMeta(rows);
  }

  itemsPage(opts = {}) {
    const page = this._pageBounds(opts.limit ?? 100, opts.offset ?? 0, 500);
    const { where, args } = this._itemWhere({ ...opts, limit: undefined, offset: undefined });
    const rows = this.db
      .prepare(
        `SELECT i.*, ga.name AS guide_artifact_name, ga.stage_code AS guide_stage_code
         FROM core_item i LEFT JOIN guide_artifact ga ON ga.id = i.guide_artifact_id
         ${where} ORDER BY (i.due IS NULL), i.due, i.id LIMIT ? OFFSET ?`
      )
      .all(...args, page.limit, page.offset);
    const total = this.db.prepare(`SELECT COUNT(*) AS n FROM core_item i ${where}`).get(...args).n;
    return { rows: this._withCodexTaskMeta(rows), total, limit: page.limit, offset: page.offset, has_more: page.offset + rows.length < total };
  }

  _withCodexTaskMeta(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return rows;
    const ids = [...new Set(rows.map((r) => r?.id).filter(Boolean))];
    if (!ids.length) return rows;
    const marks = ids.map(() => "?").join(",");
    const bindings = this.db.prepare(
      `SELECT item_id, thread_id, mode, sync_state, last_sync_at
       FROM codex_thread_binding WHERE item_id IN (${marks})`
    ).all(...ids);
    const latest = this.db.prepare(
      `SELECT m.item_id, m.id, m.at, m.role, m.mode
       FROM codex_thread_message m
       JOIN (
         SELECT item_id, MAX(id) AS id
         FROM codex_thread_message
         WHERE item_id IN (${marks})
         GROUP BY item_id
       ) x ON x.item_id=m.item_id AND x.id=m.id`
    ).all(...ids);
    const bindingByItem = new Map(bindings.map((b) => [b.item_id, b]));
    const latestByItem = new Map(latest.map((m) => [m.item_id, m]));
    return rows.map((row) => {
      const binding = bindingByItem.get(row.id);
      const msg = latestByItem.get(row.id);
      const role = msg?.role ?? null;
      return {
        ...row,
        codex_thread_id: binding?.thread_id ?? null,
        codex_task_mode: binding?.mode ?? null,
        codex_task_sync_state: binding?.sync_state ?? null,
        codex_last_message_id: msg?.id ?? null,
        codex_last_message_role: role,
        codex_last_message_at: msg?.at ?? binding?.last_sync_at ?? null,
        codex_has_reply: role === "assistant" ? 1 : 0,
        codex_waiting_reply: role === "user" || role === "system" ? 1 : 0,
        codex_has_error: role === "error" || binding?.sync_state === "error" ? 1 : 0,
      };
    });
  }

  itemCounts({ project, assignee_any } = {}) {
    const { where, args } = this._itemWhere({ project, include_unclassified: true, assignee_any });
    const rows = this.db
      .prepare(`SELECT i.status, COUNT(*) AS n FROM core_item i ${where} GROUP BY i.status`)
      .all(...args);
    const statuses = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    const triageWhere = this._itemWhere({ project, status: "unclassified" });
    statuses.unclassified = this.db.prepare(`SELECT COUNT(*) AS n FROM core_item i ${triageWhere.where}`).get(...triageWhere.args).n;
    const total = ["open", "doing", "waiting", "blocked", "done"].reduce((s, k) => s + (statuses[k] ?? 0), 0);
    return { total, statuses };
  }

  // 처리량 추세(P-7 후속): 최근 N일 '완료(→done)' 이벤트 수를 일별 집계. 개인 점수 미산출(팀 합계만).
  // event_log kind='item_status' AND to_val='done' 카운트. (재완료도 1건으로 — 완료 전이 기준)
  throughput({ days = 14, project } = {}) {
    const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
    const cond = ["kind='item_status'", "to_val='done'", "substr(at,1,10) >= ?"];
    const args = [since];
    if (project) { cond.push("project_ref=?"); args.push(project); }
    const rows = this.db.prepare(
      `SELECT substr(at,1,10) AS d, COUNT(*) AS n FROM event_log WHERE ${cond.join(" AND ")} GROUP BY d`
    ).all(...args);
    const byDay = new Map(rows.map((r) => [r.d, r.n]));
    const daily = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      daily.push({ d, n: byDay.get(d) ?? 0 });
    }
    const total = daily.reduce((s, x) => s + x.n, 0);
    const max = daily.reduce((m, x) => Math.max(m, x.n), 0);
    return { days, daily, total, max };
  }

  // '내 일' 매칭 식별자: 로그인명 + 연결된 사람 이름. assignee_ref(자유 텍스트)가 둘 중 하나면 내 일.
  accountIdentities(account) {
    if (!account) return [];
    const ids = [];
    if (account.username) ids.push(account.username);
    if (account.display_name) ids.push(account.display_name);   // 실제 가입 이름(담당자 표기와 매칭)
    if (account.email) ids.push(account.email);                  // 이메일로 배정한 경우
    if (account.person_id) {
      const p = this.db.prepare("SELECT name FROM core_person WHERE id=?").get(account.person_id);
      if (p?.name) ids.push(p.name);
    }
    return [...new Set(ids.filter((x) => x != null && String(x).trim() !== ""))];
  }

  // --- P2a 할일 쓰기 (run16): 생성/상태/담당/메일 승격 — 모든 변경은 server 가 event_log 에 기록 ---
  // 'unclassified'(미분류) = SE 기준점 미연결 임시 상태. 정식 실행 목록·활성 집계에서 격리(slice1).
  static ITEM_STATUSES = ["unclassified", "open", "doing", "waiting", "blocked", "done", "archived"]; // archived=소프트삭제(활성 목록·집계 제외)
  static ORIGINS = ["mail", "request", "meeting", "manual", "schedule", "ledger"]; // 할일 출처(장부 ingest 검증)
  static WORK_TYPES = ["answer", "review", "author", "revise", "purchase", "verify", "decide", "schedule"];
  static LINK_KINDS = ["requirement", "artifact", "meeting", "bom", "part", "vendor", "risk"];
  static REVIEW_STATUSES = ["pending_review", "needs_review", "triaged", "ready", "reviewed", "approved", "rejected", "corrected", "completed"];
  static ROUTE_CONFIDENCES = ["exact", "review", "none"];
  static CONFIDENCE_LEVELS = ["low", "medium", "high"];
  static SYNC_STATES = ["pending", "synced", "error", "conflict", "skipped"];

  static normalizeRouteConfidence(v, routeCandidate = null) {
    const raw = String(v ?? "").trim().toLowerCase();
    if (String(routeCandidate ?? "").startsWith("none/")) return "none";
    if (!raw) return null;
    if (Store.ROUTE_CONFIDENCES.includes(raw)) return raw;
    if (["high", "confirmed", "owner_confirmed", "확정"].includes(raw)) return "exact";
    if (["low", "medium", "hint", "suggested", "defaulted", "manual_review", "검토", "보류"].includes(raw)) return "review";
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n >= 0.9 ? "exact" : "review";
    return routeCandidate ? "review" : null;
  }

  static normalizeConfidence(v) {
    const raw = String(v ?? "").trim().toLowerCase();
    if (!raw) return null;
    if (Store.CONFIDENCE_LEVELS.includes(raw)) return raw;
    if (["낮음", "하"].includes(raw)) return "low";
    if (["보통", "중"].includes(raw)) return "medium";
    if (["높음", "상"].includes(raw)) return "high";
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n >= 0.75 ? "high" : (n >= 0.4 ? "medium" : "low");
    return null;
  }

  static normalizeTaskAutomation(row = {}, { status = null } = {}) {
    const text = (v) => {
      const s = String(v ?? "").trim();
      return s || null;
    };
    const safeRef = (v) => {
      const s = text(v);
      if (!s || isAbsolute(s) || /^[A-Za-z]:[\\/]/.test(s) || /^\\\\/.test(s)) return null;
      return s;
    };
    const reviewAliases = new Map([
      ["review", "needs_review"], ["needs-review", "needs_review"], ["검토대기", "needs_review"], ["검토필요", "needs_review"],
      ["ok", "ready"], ["open", "ready"], ["준비", "ready"], ["완료", "reviewed"]
    ]);
    const reviewRaw = String(row.review_status ?? "").trim().toLowerCase();
    const reviewStatus = Store.REVIEW_STATUSES.includes(reviewRaw)
      ? reviewRaw
      : (reviewAliases.get(reviewRaw) ?? (status === "unclassified" ? "needs_review" : null));
    const routeCandidate = safeRef(row.route_candidate);
    const syncRaw = String(row.sync_state ?? "").trim().toLowerCase();
    const revision = Number(row.sync_revision);
    const syncHash = String(row.sync_hash ?? "").trim().toLowerCase();
    return {
      review_status: reviewStatus,
      review_reason: text(row.review_reason),
      correction_reason: text(row.correction_reason),
      route_candidate: routeCandidate,
      route_confidence: Store.normalizeRouteConfidence(row.route_confidence, routeCandidate),
      route_reason: text(row.route_reason),
      required_role: text(row.required_role),
      required_capability: text(row.required_capability),
      suggested_assignee_ref: safeRef(row.suggested_assignee_ref),
      assignee_confidence: Store.normalizeConfidence(row.assignee_confidence),
      assignee_reason: text(row.assignee_reason),
      source_candidate_ref: safeRef(row.source_candidate_ref),
      source_mail_ref: safeRef(row.source_mail_ref),
      source_mail_source_id: safeRef(row.source_mail_source_id),
      source_thread_ref: safeRef(row.source_thread_ref),
      source_group_ref: safeRef(row.source_group_ref),
      source_lineage_ref: safeRef(row.source_lineage_ref),
      generation_run_ref: safeRef(row.generation_run_ref),
      generation_rule_ref: safeRef(row.generation_rule_ref),
      sync_state: Store.SYNC_STATES.includes(syncRaw) ? syncRaw : null,
      sync_error: text(row.sync_error),
      sync_revision: Number.isInteger(revision) && revision > 0 ? revision : null,
      sync_hash: /^[a-f0-9]{16,64}$/.test(syncHash) ? syncHash : null,
      sync_at: /^\d{4}-\d{2}-\d{2}/.test(String(row.sync_at ?? "").trim()) ? String(row.sync_at).trim() : null,
    };
  }

  createItem({ project_id, title, assignee_ref, due, urgency, guide_artifact_id, guide_step_key, origin_mail_id, origin, created_by,
    work_type, link_kind, link_ref, completion_criteria, stage_id, anchor_stage_code }) {
    const trimmed = String(title ?? "").trim();
    if (!trimmed) return { error: "title_required" };
    if (project_id == null) return { error: "project_required" }; // BE-3: undefined 바인드 500 방지(명확한 400)
    if (!this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(project_id)) return { error: "project_not_found" };
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { error: "due_format" };
    if (work_type && !Store.WORK_TYPES.includes(work_type)) return { error: "work_type_invalid" };
    if (link_kind && !Store.LINK_KINDS.includes(link_kind)) return { error: "link_kind_invalid" };
    let artifact = null;
    if (guide_artifact_id) {
      artifact = this.db.prepare("SELECT * FROM guide_artifact WHERE id=?").get(Number(guide_artifact_id));
      if (!artifact) return { error: "guide_artifact_not_found" };
      if (artifact.project_id !== project_id) return { error: "guide_artifact_project_mismatch" };
    }
    // 자동 분류(slice1): 인입(메일/요청/회의) 출처 할 일이 SE 기준점(단계/연결대상)+업무유형 없으면 'unclassified'.
    // 수동/스케줄 출처는 의도적 생성이라 'open' 유지(기존 동작 보존).
    const inbound = ["mail", "request", "meeting"].includes(origin ?? "");
    const hasAnchor = !!(stage_id || anchor_stage_code || link_kind || guide_artifact_id);
    const status = inbound && !(hasAnchor && work_type) ? "unclassified" : "open";
    const id = `itm_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`; // randomBytes(같은 ms 충돌 방지, 파일 관례)
    try {
      this.db
        .prepare(
          `INSERT INTO core_item(id,project_id,title,origin,urgency,assignee_ref,status,due,
             guide_artifact_id,guide_step_key,origin_mail_id,created_by,
             work_type,link_kind,link_ref,completion_criteria,stage_id,anchor_stage_code,created_at,data_label)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'real')`
        )
        .run(
          id, project_id, trimmed, origin ?? "manual", urgency ?? "normal",
          assignee_ref ?? null, status, due ?? null,
          guide_artifact_id ? Number(guide_artifact_id) : null, guide_step_key ?? null,
          origin_mail_id ?? null, created_by ?? null,
          work_type ?? null, link_kind ?? null, link_ref ?? null, completion_criteria ?? null,
          stage_id ?? null, anchor_stage_code ?? null, new Date().toISOString()
        );
    } catch (e) {
      // 동시 승격 경합: UNIQUE(origin_mail_id) 백스톱 위반 → 이미 만들어진 할일로 수렴(앱레벨 already_promoted 와 동일 결과).
      if (origin_mail_id != null) {
        const existing = this.db.prepare("SELECT id FROM core_item WHERE origin_mail_id=?").get(origin_mail_id);
        if (existing) return { error: "already_promoted", item_id: existing.id };
      }
      throw e;
    }
    this.afterItemWrite?.(id); // autosync Phase 1: ERP 생성 → 할일_장부 write-through
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
    this.afterItemWrite?.(id); // autosync Phase 1: ERP 변경 → 할일_장부 write-through(서버가 훅 설정 시)
    return { ok: true, from: prev.status, project_id: prev.project_id };
  }

  setItemAssignee(id, assignee_ref) {
    const prev = this.db.prepare("SELECT assignee_ref, project_id FROM core_item WHERE id=?").get(id);
    if (!prev) return { error: "item_not_found" };
    this.db.prepare("UPDATE core_item SET assignee_ref=? WHERE id=?").run(assignee_ref || null, id);
    this.afterItemWrite?.(id);
    return { ok: true, from: prev.assignee_ref, project_id: prev.project_id };
  }

  // F2: 만든 할 일의 제목·마감 직접 수정(오타·잘못된 마감 교정). 사람이 손댄 마감은 due_overridden=1 로
  // 표시해 마일스톤 재계산(setAnchor)이 되돌리지 못하게 한다. 변경 필드만 부분 갱신.
  updateItem(id, { title, due } = {}) {
    const prev = this.db.prepare("SELECT title, due, project_id FROM core_item WHERE id=?").get(id);
    if (!prev) return { error: "item_not_found" };
    const sets = []; const args = [];
    if (title !== undefined) {
      const t = String(title ?? "").trim();
      if (!t) return { error: "title_required" };
      sets.push("title=?"); args.push(t);
    }
    if (due !== undefined) {
      if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { error: "due_format" };
      sets.push("due=?", "due_overridden=1"); args.push(due || null);
    }
    if (!sets.length) return { error: "no_change" };
    this.db.prepare(`UPDATE core_item SET ${sets.join(",")} WHERE id=?`).run(...args, id);
    this.afterItemWrite?.(id);
    return { ok: true, item: this.db.prepare("SELECT * FROM core_item WHERE id=?").get(id) };
  }

  // F2: 할 일 소프트삭제 = status 'archived'(행 보존, 활성 목록·집계에서 제외). 하드 DELETE 안 함(감사·복구).
  archiveItem(id) {
    const prev = this.db.prepare("SELECT status, project_id, title FROM core_item WHERE id=?").get(id);
    if (!prev) return { error: "item_not_found" };
    if (prev.status === "archived") return { error: "already_archived" };
    this.db.prepare("UPDATE core_item SET status='archived' WHERE id=?").run(id);
    this.afterItemWrite?.(id);
    return { ok: true, from: prev.status, project_id: prev.project_id, title: prev.title };
  }

  // F2 보강: 보관(삭제)된 할 일 복구 — status 'archived' → 'open'(활성 목록 복귀). 행은 계속 보존돼 있었음.
  restoreItem(id) {
    const prev = this.db.prepare("SELECT status, project_id, title FROM core_item WHERE id=?").get(id);
    if (!prev) return { error: "item_not_found" };
    if (prev.status !== "archived") return { error: "not_archived", status: prev.status };
    this.db.prepare("UPDATE core_item SET status='open' WHERE id=?").run(id);
    this.afterItemWrite?.(id);
    return { ok: true, project_id: prev.project_id, title: prev.title };
  }

  // SE 기준점 확정(slice2): 미분류 할 일에 단계/연결대상 + 업무유형을 붙여 정식(open) 승격.
  // SE 기준점(단계 또는 연결대상 또는 산출물) + 업무유형 둘 다 충족해야 통과(needs_se_anchor 게이트).
  confirmItem(id, { work_type, link_kind, link_ref, completion_criteria, stage_id, anchor_stage_code, assignee_ref } = {}) {
    const item = this.db.prepare("SELECT * FROM core_item WHERE id=?").get(id);
    if (!item) return { error: "item_not_found" };
    if (item.status !== "unclassified") return { error: "not_unclassified", status: item.status };
    if (work_type && !Store.WORK_TYPES.includes(work_type)) return { error: "work_type_invalid" };
    if (link_kind && !Store.LINK_KINDS.includes(link_kind)) return { error: "link_kind_invalid" };
    const wt = work_type ?? item.work_type;
    const lk = link_kind ?? item.link_kind;
    const sid = stage_id ?? item.stage_id;
    const asc = anchor_stage_code ?? item.anchor_stage_code;
    const hasAnchor = !!(sid || asc || lk || item.guide_artifact_id);
    if (!wt || !hasAnchor) return { error: "needs_se_anchor", need: { work_type: !wt, se_anchor: !hasAnchor } };
    if (stage_id && !this.db.prepare("SELECT 1 FROM core_stage WHERE id=? AND project_id=?").get(stage_id, item.project_id)) return { error: "stage_not_found" };
    const assignee = assignee_ref !== undefined ? String(assignee_ref ?? "").trim() : item.assignee_ref;
    this.db.prepare(
      `UPDATE core_item SET status='open', work_type=?, link_kind=?, link_ref=?, completion_criteria=?, stage_id=?, anchor_stage_code=?, assignee_ref=? WHERE id=?`
    ).run(wt, lk ?? null, link_ref ?? item.link_ref ?? null, completion_criteria ?? item.completion_criteria ?? null, sid ?? null, asc ?? null, assignee || null, id);
    this.afterItemWrite?.(id); // autosync Phase 1: 분류 확정 → 할일_장부 write-through
    return { ok: true, item: this.db.prepare("SELECT * FROM core_item WHERE id=?").get(id) };
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
    if (linked) { this.db.prepare("UPDATE core_item SET project_id=? WHERE id=?").run(project_id, linked.id); this.afterItemWrite?.(linked.id); } // autosync: 새 과제 장부 반영(옛 장부 stale 행 정리는 후속)
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
  // 메일/일정 기반 할일의 SE단계 = '프로젝트 현재상태'에서 읽는다(메일 내용 추론 금지 —
  // autosync mail_history_to_task_generation_rule.field_authority.SE단계=project_current_state).
  // stage_current 우선, 없으면 가장 앞선 open 단계, 그래도 없으면 null(→ 할일 unclassified 격리, 규칙대로).
  projectCurrentStage(project_id) {
    const p = this.db.prepare("SELECT stage_current FROM core_project WHERE id=?").get(project_id);
    if (p?.stage_current) return p.stage_current;
    const s = this.db.prepare("SELECT stage_code FROM core_stage WHERE project_id=? AND status='open' AND stage_code IS NOT NULL ORDER BY seq LIMIT 1").get(project_id);
    return s?.stage_code ?? null;
  }

  promoteMail(mail_id, created_by) {
    const mail = this.db.prepare("SELECT * FROM core_mail WHERE id=?").get(mail_id);
    if (!mail) return { error: "mail_not_found" };
    const dup = this.db.prepare("SELECT id FROM core_item WHERE origin_mail_id=?").get(mail_id);
    if (dup) return { error: "already_promoted", item_id: dup.id };
    if (!mail.project_id || !this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(mail.project_id)) {
      return { error: "mail_project_missing" };
    }
    // SE단계는 프로젝트 현재상태에서(결정적). 업무유형/완료기준은 사람/LLM 분류 단계로 남김 → unclassified 유지.
    return this.createItem({
      project_id: mail.project_id, title: mail.subject,
      origin: "mail", origin_mail_id: mail_id, created_by,
      anchor_stage_code: this.projectCurrentStage(mail.project_id)
    });
  }

  // Gmail식 확장: 기간(0=전체)/검색(제목·상대)/방향/수동라벨 필터 + 라벨 동봉
  _mailWhere({ project, days, q, direction, label_id, mailbox } = {}) {
    const cond = [];
    const args = [];
    if (project) { cond.push("m.project_id=?"); args.push(project); }
    // 담당자별 메일 이력: mailbox=계정 이메일 또는 계정 이메일 하위 폴더(prefix)로 필터. 'team'/미지정이면 전체.
    if (mailbox && mailbox !== "team") {
      const mailScope = this.mailboxScopeClause("m.mailbox", mailbox);
      if (mailScope) { cond.push(mailScope.sql); args.push(...mailScope.args); }
    }
    if (days) {
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      cond.push("m.at>=?"); args.push(cutoff);
    }
    if (q) { cond.push("(m.subject LIKE ? OR m.counterpart LIKE ? OR m.project_id LIKE ? OR m.id LIKE ? OR m.pointer_ref LIKE ? OR m.source_ref LIKE ?)"); args.push(...Array(6).fill(`%${q}%`)); }
    if (direction) { cond.push("m.direction=?"); args.push(direction); }
    if (label_id) { cond.push("EXISTS (SELECT 1 FROM mail_label_map x WHERE x.mail_id=m.id AND x.label_id=?)"); args.push(Number(label_id)); }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return { where, args };
  }

  mail({ project, days, q, direction, label_id, mailbox, limit = 500, offset = 0 } = {}) {
    const { where, args } = this._mailWhere({ project, days, q, direction, label_id, mailbox });
    const page = this._pageBounds(limit, offset, 1000);
    const rows = this.db
      .prepare(
        `SELECT m.*, (SELECT GROUP_CONCAT(label_id) FROM mail_label_map mm WHERE mm.mail_id=m.id) AS label_ids
         FROM core_mail m ${where} ORDER BY m.at DESC, m.id DESC LIMIT ? OFFSET ?`
      )
      .all(...args, page.limit, page.offset);
    return rows.map((r) => ({ ...r, label_ids: r.label_ids ? String(r.label_ids).split(",").map(Number) : [] }));
  }

  mailPage(opts = {}) {
    const page = this._pageBounds(opts.limit ?? 100, opts.offset ?? 0, 500);
    const { where, args } = this._mailWhere(opts);
    const rows = this.db
      .prepare(
        `SELECT m.*, (SELECT GROUP_CONCAT(label_id) FROM mail_label_map mm WHERE mm.mail_id=m.id) AS label_ids
         FROM core_mail m ${where} ORDER BY m.at DESC, m.id DESC LIMIT ? OFFSET ?`
      )
      .all(...args, page.limit, page.offset)
      .map((r) => ({ ...r, label_ids: r.label_ids ? String(r.label_ids).split(",").map(Number) : [] }));
    const total = this.db.prepare(`SELECT COUNT(*) AS n FROM core_mail m ${where}`).get(...args).n;
    return { rows, total, limit: page.limit, offset: page.offset, has_more: page.offset + rows.length < total };
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
  riskAlerts({ project = null, today = null, assignee_any } = {}) {
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
    for (const i of this.items({ project, assignee_any })) {
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
  worklogDraft({ project = null, days = 7, assignee_any, mailbox, scope = null } = {}) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const eventScope = scope ?? (assignee_any || mailbox ? { assignee_any, mailbox } : null);
    const evs = this.recentEvents(1000, project, eventScope).filter((e) => (e.at ?? "") >= cutoff);
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
    const mail = this.mail({ project, days, mailbox });
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
  reportDraft({ project = null, kind = "report", assignee_any, mailbox } = {}) {
    const today = new Date().toISOString().slice(0, 10);
    const weekEnd = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
    const projs = this.summary(today, weekEnd, { assignee_any, mailbox }).filter((p) => !project || p.id === project);
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
  calendarFeed({ person = null, assignee_any } = {}) {
    const key = person ?? "";
    const scope = scopedInClause("assignee_ref", assignee_any);
    const cond = ["due IS NOT NULL", "status NOT IN ('done','unclassified','archived')"];
    const args = [];
    if (key) { cond.push("assignee_ref = ?"); args.push(key); }
    if (scope) { cond.push(scope.sql); args.push(...scope.args); }
    return this.db.prepare(
      `SELECT id, title, project_id, due, status, assignee_ref FROM core_item
       WHERE ${cond.join(" AND ")} ORDER BY due`
    ).all(...args);
  }
  calendarIcs({ person = null, assignee_any } = {}) {
    const rows = this.calendarFeed({ person, assignee_any });
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
    // BE-4: 적용 + 상태전이 + 이벤트를 한 트랜잭션으로 — 중간 실패 시 부분 적용/재승인 중복 방지.
    this.db.exec("BEGIN");
    try {
      let result;
      switch (row.kind) {
        case "create_item": result = this.createItem(payload); break;
        case "add_attachment_type": result = this.addAttachment(payload); break;
        case "set_artifact_requirement": result = this.setArtifactRequirement(payload); break;
        case "link_part_project": result = this.linkPartProject(payload.part_id, payload.project_id); break;
        default: this.db.exec("ROLLBACK"); return { error: "unknown_proposal_kind" };
      }
      if (result && result.error) { this.db.exec("ROLLBACK"); return result; } // 도메인 거부 시 상태 미변경(재시도 가능)
      const applied_ref = result?.item?.id ?? row.target_ref ?? null;
      this.db.prepare("UPDATE ai_proposal SET status='approved', decided_at=?, decided_by=?, applied_ref=? WHERE id=?")
        .run(new Date().toISOString(), decided_by, applied_ref, id);
      this.appendEvent({ actor_ref: decided_by, actor_kind: "human", kind: "ai_proposal_approve", item_ref: id, to: applied_ref, used_refs: row.used_refs ? JSON.parse(row.used_refs) : [], data_label: "real" });
      this.db.exec("COMMIT");
      return { ok: true, applied_ref, result };
    } catch (e) {
      try { this.db.exec("ROLLBACK"); } catch { /* 이미 롤백됨 */ }
      throw e;
    }
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
    const stop = new Set([
      "어떻게", "어디서", "무엇을", "무슨", "뭔가요", "뭐예요", "뭐에요", "뭘",
      "뭐", "제가", "저는", "나는", "내가", "너", "너는", "이거", "그거", "저거",
      "있나요", "되나요", "되는", "하나요", "해요", "해야", "하면", "때는", "같아요", "건가요",
      "볼", "수", "있는지", "알아요", "알려줘", "알려주세요",
      "와", "너무", "답변", "답변이", "빠른데", "짧은데", "살아있어", "살아있니",
      "할수있어", "사용해야해", "멈춘거야", "멈췄다", "멈추네", "계속", "질문하니"
    ]);
    return String(s ?? "").toLowerCase().split(/[\s,./()\[\]?!~"'·]+/)
      .filter((w) => w.length >= 2 && !stop.has(w));
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
  recentChatQueries({ actor_ref = null, thread_id = null, limit = CHAT_CONTEXT_TURNS_DEFAULT } = {}) {
    const actor = actor_ref == null ? null : String(actor_ref).trim();
    const thread = thread_id == null ? null : String(thread_id).trim();
    if (!actor || !thread) return [];
    const count = Math.floor(Number(limit));
    if (!Number.isFinite(count) || count <= 0) return [];
    const rows = this.db.prepare(
      `SELECT id, at, actor_ref, thread_id, question, matched_faq_id FROM chat_query_log
       WHERE actor_ref=? AND thread_id=?
       ORDER BY id DESC LIMIT ?`
    ).all(actor, thread, Math.min(CHAT_CONTEXT_TURNS_MAX, count));
    return rows.reverse();
  }
  logChatQuery({ actor_ref = null, thread_id = null, question, matched_faq_id = null }) {
    this.db.prepare("INSERT INTO chat_query_log(at,actor_ref,thread_id,question,matched_faq_id,data_label) VALUES(?,?,?,?,?,?)")
      .run(new Date().toISOString(), actor_ref, thread_id, String(question ?? ""), matched_faq_id, "real");
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
  chatAnswer({ question, thread_id = null, actor_ref = null } = {}) {
    return runManualRetrievalPipeline({ store: this, question, thread_id, actor_ref });
  }

  itemById(id) {
    return this.db.prepare("SELECT * FROM core_item WHERE id=?").get(id);
  }

  codexThreadTitle(item) {
    if (!item) return null;
    const project = String(item.project_id || "INBOX").trim() || "INBOX";
    const title = String(item.title || "untitled").replace(/\s+/g, " ").trim() || "untitled";
    let threadTitle = `[${project}] ${title}`;
    const dup = this.db.prepare(
      "SELECT COUNT(*) AS n FROM core_item WHERE project_id=? AND title=? AND id<>?"
    ).get(item.project_id, item.title, item.id)?.n ?? 0;
    if (dup > 0) threadTitle += ` · ${String(item.id).slice(-6)}`;
    return threadTitle;
  }

  codexTaskBinding(item_id) {
    return this.db.prepare("SELECT * FROM codex_thread_binding WHERE item_id=?").get(item_id);
  }

  codexTaskMessages(item_id, limit = 80) {
    const n = Math.max(1, Math.min(200, Number(limit) || 80));
    return this.db.prepare(
      `SELECT * FROM (
         SELECT * FROM codex_thread_message WHERE item_id=? ORDER BY id DESC LIMIT ?
       ) ORDER BY id`
    ).all(item_id, n);
  }

  upsertCodexTaskBinding({ item_id, thread_id, thread_title = null, mode = "app-server", last_error = null } = {}) {
    const item = this.itemById(item_id);
    if (!item) return { error: "item_not_found" };
    const tid = String(thread_id ?? "").trim();
    if (!tid) return { error: "thread_id_required" };
    const title = String(thread_title || this.codexThreadTitle(item) || tid).trim();
    const at = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO codex_thread_binding(item_id,thread_id,thread_title,project_id,mode,sync_state,last_sync_at,last_error,data_label)
       VALUES(?,?,?,?,?,'linked',?,?,'meta')
       ON CONFLICT(item_id) DO UPDATE SET
         thread_id=excluded.thread_id,
         thread_title=excluded.thread_title,
         project_id=excluded.project_id,
         mode=excluded.mode,
         sync_state='linked',
         last_sync_at=excluded.last_sync_at,
         last_error=excluded.last_error`
    ).run(item.id, tid, title, item.project_id, mode, at, last_error);
    return { ok: true, binding: this.codexTaskBinding(item.id), item };
  }

  markCodexTaskError(item_id, error) {
    const msg = String(error?.message || error || "codex_error").slice(0, 1000);
    this.db.prepare(
      "UPDATE codex_thread_binding SET sync_state='error', last_error=?, last_sync_at=? WHERE item_id=?"
    ).run(msg, new Date().toISOString(), item_id);
    return { ok: true };
  }

  appendCodexTaskMessage({ item_id, thread_id = null, role, text, actor_ref = null, mode = "app-server", data_label = "meta" } = {}) {
    const r = String(role || "").trim();
    const body = String(text ?? "").trim();
    if (!item_id) return { error: "item_required" };
    if (!["system", "user", "assistant", "error"].includes(r)) return { error: "role_invalid" };
    if (!body) return { error: "text_required" };
    this.db.prepare(
      `INSERT INTO codex_thread_message(at,item_id,thread_id,role,text,actor_ref,mode,data_label)
       VALUES(?,?,?,?,?,?,?,?)`
    ).run(new Date().toISOString(), item_id, thread_id, r, body, actor_ref, mode, data_label);
    return {
      ok: true,
      message: this.db.prepare("SELECT * FROM codex_thread_message WHERE id=last_insert_rowid()").get(),
    };
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
  nudges({ person = null, limit = 5, assignee_any } = {}) {
    const today = new Date().toISOString().slice(0, 10);
    const key = person ?? "";
    const scope = scopedInClause("assignee_ref", assignee_any);
    const cond = ["status NOT IN ('done','unclassified','archived')"];
    const args = [];
    if (key) { cond.push("assignee_ref = ?"); args.push(key); }
    if (scope) { cond.push(scope.sql); args.push(...scope.args); }
    const rows = this.db.prepare(
      `SELECT id, title, project_id, due, status, assignee_ref FROM core_item WHERE ${cond.join(" AND ")}`
    ).all(...args);
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
  workload(todayKey, { assignee_any } = {}) {
    const scope = scopedInClause("assignee_ref", assignee_any);
    const where = scope ? `WHERE ${scope.sql}` : "";
    const rows = this.db.prepare(
      `SELECT assignee_ref,
         COUNT(*) AS total,
         SUM(CASE WHEN status NOT IN ('done','unclassified','archived') THEN 1 ELSE 0 END) AS open_cnt,
         SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked_cnt,
         SUM(CASE WHEN status NOT IN ('done','unclassified','archived') AND due IS NOT NULL AND due < ? THEN 1 ELSE 0 END) AS overdue_cnt
       FROM core_item ${where} GROUP BY assignee_ref`
    ).all(todayKey, ...(scope?.args ?? []));
    const names = new Map(this.people().map((p) => [p.id, p.name]));
    return rows.map((r) => ({
      assignee_ref: r.assignee_ref ?? null,
      name: r.assignee_ref == null ? "(미배정)" : (names.get(r.assignee_ref) ?? r.assignee_ref),
      total: r.total, open_cnt: r.open_cnt, blocked_cnt: r.blocked_cnt, overdue_cnt: r.overdue_cnt,
    })).sort((a, b) => b.open_cnt - a.open_cnt);
  }
  // P-7 회의 미결 롤업 — 미완 액션이 남은 회의만(집계만).
  meetingOpenRollup({ assignee_any } = {}) {
    const scope = scopedInClause("i.assignee_ref", assignee_any);
    const scopeSql = scope ? `WHERE ${scope.sql}` : "";
    return this.db.prepare(
      `SELECT m.id AS meeting_id, m.title, m.project_id,
         COUNT(map.item_id) AS total_actions,
         SUM(CASE WHEN i.status NOT IN ('done','unclassified','archived') THEN 1 ELSE 0 END) AS open_actions
       FROM core_meeting m
       JOIN meeting_action_map map ON map.meeting_id = m.id
       JOIN core_item i ON i.id = map.item_id
       ${scopeSql} GROUP BY m.id HAVING open_actions > 0 ORDER BY open_actions DESC`
    ).all(...(scope?.args ?? []));
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
  // 이메일 형식 최소 검증(local@domain.tld). 빈 값은 허용(이메일 미등록 계정 가능).
  static EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  static MAILBOX_PROVIDERS = ["none", "gmail", "hiworks"];
  static MAILBOX_STATUSES = ["disabled", "not_configured", "ready", "pending", "fetching", "ok", "error", "stale"];
  static MAILBOX_SECRET_KEY_RE = /(password|passwd|token|secret|cookie|credential|client_secret|refresh_token|access_token|api_?key)/i;

  static hasMailboxSecretPayload(obj = {}) {
    return Object.keys(obj || {}).some((key) => Store.MAILBOX_SECRET_KEY_RE.test(key));
  }

  static safeRelativePathRef(v, { allowEmpty = false, error = "ref_invalid" } = {}) {
    const s = String(v ?? "").trim();
    if (!s) return allowEmpty ? { ok: true, value: null } : { error };
    if (s.length > 240 || /[\0\r\n=]/.test(s)) return { error };
    if (isAbsolute(s) || /^[A-Za-z]:[\\/]/.test(s) || /^\\\\/.test(s) || /^\/\//.test(s)) return { error };
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(s)) return { error };
    const parts = s.replace(/\\/g, "/").split("/");
    if (parts.some((part) => part === "" || part === "." || part === "..")) return { error };
    return { ok: true, value: s };
  }

  static safeMetadataRef(v, { allowEmpty = true, error = "ref_invalid" } = {}) {
    const s = String(v ?? "").trim();
    if (!s) return allowEmpty ? { ok: true, value: null } : { error };
    if (s.length > 240 || /[\0\r\n]/.test(s)) return { error };
    if (isAbsolute(s) || /^[A-Za-z]:[\\/]/.test(s) || /^\\\\/.test(s) || /^\/\//.test(s)) return { error };
    const parts = s.replace(/\\/g, "/").split("/");
    if (parts.some((part) => part === "..")) return { error };
    return { ok: true, value: s };
  }

  static normalizeMailboxConfig(input = {}, existing = {}) {
    if (Store.hasMailboxSecretPayload(input)) return { error: "mailbox_secret_not_allowed" };
    const rawProvider = input.mailbox_provider ?? input.provider ?? existing.mailbox_provider ?? "none";
    const provider = String(rawProvider || "none").trim().toLowerCase();
    if (!Store.MAILBOX_PROVIDERS.includes(provider)) return { error: "mailbox_provider_invalid" };
    const hasEnabled = input.mailbox_enabled !== undefined || input.enabled !== undefined;
    const rawEnabled = input.mailbox_enabled ?? input.enabled;
    const enabled = provider === "none" ? false
      : (hasEnabled ? ["1", "true", "yes", "on"].includes(String(rawEnabled).trim().toLowerCase()) || rawEnabled === true || rawEnabled === 1
        : !!existing.mailbox_enabled);
    const hasEnv = input.mailbox_env_ref !== undefined || input.env_ref !== undefined;
    const rawEnv = hasEnv ? (input.mailbox_env_ref ?? input.env_ref) : (existing.mailbox_env_ref ?? "");
    let envRef = null;
    if (provider !== "none") {
      const normalizedEnv = Store.safeRelativePathRef(rawEnv, { allowEmpty: true, error: "mailbox_env_ref_invalid" });
      if (normalizedEnv.error) return normalizedEnv;
      envRef = normalizedEnv.value;
      if (enabled && !envRef) return { error: "mailbox_env_ref_required" };
    }
    const hasStatus = input.mailbox_status !== undefined || input.status !== undefined;
    const rawStatus = input.mailbox_status ?? input.status ?? existing.mailbox_status;
    const normalizedStatus = String(rawStatus || "").trim().toLowerCase();
    const status = provider === "none" || !enabled
      ? "disabled"
      : (hasStatus && Store.MAILBOX_STATUSES.includes(normalizedStatus) && normalizedStatus !== "disabled" ? normalizedStatus : "ready");
    const rawFetchAt = input.mailbox_last_fetch_at ?? input.last_fetch_at ?? existing.mailbox_last_fetch_at;
    const fetchAt = String(rawFetchAt ?? "").trim();
    if (fetchAt && !/^\d{4}-\d{2}-\d{2}/.test(fetchAt)) return { error: "mailbox_last_fetch_at_invalid" };
    const rawSummary = input.mailbox_last_summary_ref ?? input.last_summary_ref ?? existing.mailbox_last_summary_ref;
    const summary = Store.safeMetadataRef(rawSummary, { allowEmpty: true, error: "mailbox_last_summary_ref_invalid" });
    if (summary.error) return summary;
    const lastError = String(input.mailbox_last_error ?? input.last_error ?? existing.mailbox_last_error ?? "").trim();
    if (/[\0\r\n]/.test(lastError)) return { error: "mailbox_last_error_invalid" };
    return {
      mailbox_provider: provider,
      mailbox_env_ref: envRef,
      mailbox_enabled: enabled ? 1 : 0,
      mailbox_status: status,
      mailbox_last_fetch_at: fetchAt || null,
      mailbox_last_error: lastError ? lastError.slice(0, 500) : null,
      mailbox_last_summary_ref: summary.value,
    };
  }

  createAccount({ id, username, password, person_id = null, roles = [], email = null, display_name = null }) {
    const aid = id || `acc_${randomBytes(5).toString("hex")}`;
    const plain = String(password ?? "");
    if (!username || !plain) return { error: "username_password_required" };
    if (this.db.prepare("SELECT 1 FROM core_account WHERE username=?").get(username)) return { error: "username_taken" };
    if (plain.length < 6) return { error: "password_too_short" };
    const em = String(email ?? "").trim().toLowerCase() || null;
    if (em) {
      if (!Store.EMAIL_RE.test(em)) return { error: "email_format" };
      if (this.db.prepare("SELECT 1 FROM core_account WHERE email=?").get(em)) return { error: "email_taken" };
    }
    const dn = String(display_name ?? "").trim() || null;
    try {
      this.db.prepare(
        "INSERT INTO core_account(id,person_id,username,pw_hash,status,created_at,email,display_name) VALUES (?,?,?,?, 'active', ?,?,?)"
      ).run(aid, person_id, username, hashPassword(plain), new Date().toISOString(), em, dn);
    } catch (e) {
      // 동시 생성 경합: username(테이블 UNIQUE)/email(부분 UNIQUE) 위반 → 앱레벨과 동일한 _taken 으로 수렴.
      if (this.db.prepare("SELECT 1 FROM core_account WHERE username=?").get(username)) return { error: "username_taken" };
      if (em && this.db.prepare("SELECT 1 FROM core_account WHERE email=?").get(em)) return { error: "email_taken" };
      throw e;
    }
    const rs = (roles && roles.length) ? roles : ["member"]; // 역할 미지정이면 기본 '팀원'
    for (const r of rs) this.assignRole(aid, r);
    return { ok: true, id: aid };
  }
  setAccountPassword(account_id, password) {
    const plain = String(password ?? "");
    if (plain.length < 6) return { error: "password_too_short" };
    const a = this.db.prepare("SELECT 1 FROM core_account WHERE id=?").get(account_id);
    if (!a) return { error: "account_not_found" };
    this.db.prepare("UPDATE core_account SET pw_hash=? WHERE id=?").run(hashPassword(plain), account_id);
    return { ok: true };
  }
  changeAccountPassword(account_id, { current_password, new_password } = {}) {
    const a = this.db.prepare("SELECT pw_hash FROM core_account WHERE id=?").get(account_id);
    if (!a) return { error: "account_not_found" };
    if (!verifyPassword(current_password ?? "", a.pw_hash)) return { error: "current_password_invalid" };
    return this.setAccountPassword(account_id, new_password);
  }
  verifyLogin(username, password) {
    const a = this.db.prepare("SELECT * FROM core_account WHERE username=? AND status='active'").get(username);
    if (!a || !verifyPassword(password, a.pw_hash)) return null;
    return { id: a.id, username: a.username, person_id: a.person_id, email: a.email, display_name: a.display_name };
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
    const a = this.db.prepare("SELECT id,username,person_id,status,email,display_name FROM core_account WHERE id=?").get(s.account_id);
    if (!a || a.status !== "active") return null;
    return { id: a.id, username: a.username, person_id: a.person_id, email: a.email, display_name: a.display_name };
  }
  deleteSession(token) {
    this.db.prepare("DELETE FROM auth_session WHERE token=?").run(token);
    return { ok: true };
  }
  deleteAccountSessions(account_id, exceptToken = null) {
    if (exceptToken) {
      this.db.prepare("DELETE FROM auth_session WHERE account_id=? AND token<>?").run(account_id, exceptToken);
    } else {
      this.db.prepare("DELETE FROM auth_session WHERE account_id=?").run(account_id);
    }
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
  // 관리자 여부: 'admin' 역할 보유. (역할 0개=일반 팀원 취급)
  isAdmin(account_id) {
    if (!account_id) return false;
    return !!this.db.prepare("SELECT 1 FROM rbac_account_role WHERE account_id=? AND role_id='admin'").get(account_id);
  }
  // 화면 표기명: display_name → person.name → username 순.
  accountDisplayName(account) {
    if (!account) return null;
    if (account.display_name) return account.display_name;
    if (account.person_id) {
      const p = this.db.prepare("SELECT name FROM core_person WHERE id=?").get(account.person_id);
      if (p?.name) return p.name;
    }
    return account.username ?? null;
  }
  // 로그인/me 응답용 프로필(비밀번호 해시 절대 미포함).
  accountProfile(account) {
    if (!account) return null;
    const roles = this.rolesFor(account.id);
    return {
      id: account.id, username: account.username, email: account.email ?? null,
      display_name: this.accountDisplayName(account),
      roles, is_admin: roles.includes("admin"),
      perms: this.permsFor(account.id)
    };
  }
  safeMailboxMetadata(row = {}) {
    return {
      mailbox_provider: row.mailbox_provider || "none",
      mailbox_env_ref: row.mailbox_env_ref ?? null,
      mailbox_enabled: !!row.mailbox_enabled,
      mailbox_status: row.mailbox_status || "disabled",
      mailbox_last_fetch_at: row.mailbox_last_fetch_at ?? null,
      mailbox_last_error: row.mailbox_last_error ?? null,
      mailbox_last_summary_ref: row.mailbox_last_summary_ref ?? null,
    };
  }
  accountMailboxConfig(account_id) {
    const row = this.db.prepare(
      `SELECT id,username,email,display_name,status,mailbox_provider,mailbox_env_ref,mailbox_enabled,
        mailbox_status,mailbox_last_fetch_at,mailbox_last_error,mailbox_last_summary_ref
       FROM core_account WHERE id=?`
    ).get(account_id);
    return row ? { id: row.id, username: row.username, email: row.email ?? null, display_name: row.display_name ?? null, status: row.status, ...this.safeMailboxMetadata(row) } : null;
  }
  listAccountMailboxConfigs() {
    return this.db.prepare(
      `SELECT id,username,email,display_name,status,mailbox_provider,mailbox_env_ref,mailbox_enabled,
        mailbox_status,mailbox_last_fetch_at,mailbox_last_error,mailbox_last_summary_ref
       FROM core_account ORDER BY created_at, username`
    ).all().map((row) => ({ id: row.id, username: row.username, email: row.email ?? null, display_name: row.display_name ?? null, status: row.status, ...this.safeMailboxMetadata(row) }));
  }
  // 관리자용 계정 목록(해시 제외). 역할 동봉.
  listAccounts() {
    const rows = this.db.prepare(
      `SELECT id,username,email,display_name,status,created_at,person_id,mailbox_provider,mailbox_env_ref,
        mailbox_enabled,mailbox_status,mailbox_last_fetch_at,mailbox_last_error,mailbox_last_summary_ref
       FROM core_account ORDER BY created_at, username`
    ).all();
    return rows.map((a) => {
      const roles = this.rolesFor(a.id);
      return { ...a, ...this.safeMailboxMetadata(a), roles, is_admin: roles.includes("admin") };
    });
  }
  teamReadiness({ target_members = 5, today = new Date().toISOString().slice(0, 10) } = {}) {
    const target = Math.min(50, Math.max(1, Math.trunc(Number(target_members) || 5)));
    const accounts = this.listAccounts();
    const activeAccounts = accounts.filter((a) => a.status === "active");
    const activeAdmins = activeAccounts.filter((a) => a.is_admin);
    const activeMembers = activeAccounts.filter((a) => !a.is_admin);
    const unclassified = this.db.prepare("SELECT COUNT(*) AS n FROM core_item WHERE status='unclassified'").get().n;
    const unclassifiedOverdue = this.db
      .prepare("SELECT COUNT(*) AS n FROM core_item WHERE status='unclassified' AND due IS NOT NULL AND due < ?")
      .get(today).n;
    const mailboxStatsFor = (email) => {
      const mailScope = this.mailboxScopeClause("mailbox", email);
      if (!mailScope) return null;
      return this.db
        .prepare(`SELECT COUNT(*) AS count, MAX(at) AS last_at FROM core_mail WHERE ${mailScope.sql}`)
        .get(...mailScope.args);
    };
    const openItemCount = (account) => {
      const identities = this.accountIdentities(account);
      const scoped = scopedInClause("i.assignee_ref", identities);
      if (!scoped) return 0;
      return this.db
        .prepare(`SELECT COUNT(*) AS n FROM core_item i WHERE i.status NOT IN ('done','unclassified','archived') AND ${scoped.sql}`)
        .get(...scoped.args).n;
    };
    const rows = accounts.map((account) => {
      const email = String(account.email ?? "").trim().toLowerCase();
      const mailboxStats = email ? mailboxStatsFor(email) : null;
      const mailRequired = account.status === "active" && !account.is_admin;
      const issues = [];
      if (mailRequired && !email) issues.push({ level: "blocker", code: "email_missing" });
      if (mailRequired && (!account.mailbox_enabled || account.mailbox_provider === "none")) {
        issues.push({ level: "blocker", code: "mailbox_disabled" });
      }
      if (mailRequired && account.mailbox_enabled && !account.mailbox_env_ref) {
        issues.push({ level: "blocker", code: "mailbox_env_ref_missing" });
      }
      if (mailRequired && account.mailbox_enabled && account.mailbox_status === "error") {
        issues.push({ level: "blocker", code: "mailbox_error" });
      }
      if (mailRequired && account.mailbox_enabled && account.mailbox_status === "stale") {
        issues.push({ level: "warning", code: "mailbox_stale" });
      }
      if (mailRequired && account.mailbox_enabled && !account.mailbox_last_fetch_at) {
        issues.push({ level: "warning", code: "mailbox_never_fetched" });
      }
      if (mailRequired && account.mailbox_enabled && (mailboxStats?.count ?? 0) === 0) {
        issues.push({ level: "warning", code: "mailbox_no_mail_rows" });
      }
      return {
        id: account.id,
        username: account.username,
        display_name: account.display_name ?? account.username,
        email: account.email ?? null,
        status: account.status,
        roles: account.roles,
        is_admin: account.is_admin,
        mailbox_provider: account.mailbox_provider,
        mailbox_enabled: account.mailbox_enabled,
        mailbox_status: account.mailbox_status,
        mailbox_env_ref: account.mailbox_env_ref,
        mailbox_last_fetch_at: account.mailbox_last_fetch_at,
        mailbox_last_error: account.mailbox_last_error,
        mail_count: mailboxStats?.count ?? 0,
        mailbox_last_mail_at: mailboxStats?.last_at ?? null,
        open_item_count: openItemCount(account),
        issues,
        ready: issues.every((x) => x.level !== "blocker"),
      };
    });
    const blockers = [];
    const warnings = [];
    if (!activeAdmins.length) blockers.push({ code: "admin_missing" });
    if (!activeMembers.length) blockers.push({ code: "member_missing" });
    if (activeMembers.length < target) warnings.push({ code: "target_members_short", expected: target, actual: activeMembers.length });
    for (const account of rows) {
      if (account.status !== "active" || account.is_admin) continue;
      for (const issue of account.issues) {
        const entry = { code: `account_${issue.code}`, account_id: account.id, account_label: account.display_name || account.username };
        if (issue.level === "blocker") blockers.push(entry);
        else warnings.push(entry);
      }
    }
    if (unclassified > 0) warnings.push({ code: "unclassified_queue", count: unclassified });
    if (unclassifiedOverdue > 0) warnings.push({ code: "unclassified_overdue", count: unclassifiedOverdue });
    const mailRequiredRows = rows.filter((a) => a.status === "active" && !a.is_admin);
    const configuredMailboxCount = mailRequiredRows.filter((a) => a.email && a.mailbox_enabled && a.mailbox_provider !== "none" && a.mailbox_env_ref).length;
    const fetchSeenCount = mailRequiredRows.filter((a) => a.mailbox_last_fetch_at).length;
    const mailboxErrorCount = mailRequiredRows.filter((a) => a.mailbox_enabled && a.mailbox_status === "error").length;
    const nextActions = [];
    if (!activeAdmins.length) nextActions.push({ code: "create_admin_account", priority: "blocker" });
    if (activeMembers.length < target) nextActions.push({ code: "add_member_accounts", priority: activeMembers.length ? "warning" : "blocker", expected: target, actual: activeMembers.length });
    if (mailRequiredRows.some((a) => !a.email)) nextActions.push({ code: "fill_member_emails", priority: "blocker" });
    if (mailboxErrorCount > 0) nextActions.push({ code: "fix_member_mailbox_errors", priority: "blocker", count: mailboxErrorCount });
    if (configuredMailboxCount < mailRequiredRows.length) nextActions.push({ code: "configure_member_mailboxes", priority: "blocker", expected: mailRequiredRows.length, actual: configuredMailboxCount });
    if (configuredMailboxCount > 0 && fetchSeenCount < configuredMailboxCount) nextActions.push({ code: "export_and_fetch_team_mailboxes", priority: "warning", expected: configuredMailboxCount, actual: fetchSeenCount });
    if (unclassifiedOverdue > 0) nextActions.push({ code: "triage_overdue_unclassified", priority: "warning", count: unclassifiedOverdue });
    else if (unclassified > 0) nextActions.push({ code: "triage_unclassified", priority: "warning", count: unclassified });
    if (!nextActions.length) nextActions.push(blockers.length
      ? { code: "resolve_readiness_blockers", priority: "blocker", count: blockers.length }
      : { code: "ready_for_team_pilot", priority: "ok" });
    return {
      generated_at: new Date().toISOString(),
      target_members: target,
      manual_ready: activeAdmins.length > 0 && activeAccounts.length > 0,
      mail_config_ready: blockers.length === 0,
      fetch_observed: mailRequiredRows.length > 0 && fetchSeenCount === mailRequiredRows.length,
      ready: blockers.length === 0,
      counts: {
        account_count: accounts.length,
        active_account_count: activeAccounts.length,
        active_admin_count: activeAdmins.length,
        active_member_count: activeMembers.length,
        configured_mailbox_count: configuredMailboxCount,
        fetch_seen_count: fetchSeenCount,
      },
      queues: {
        unclassified,
        unclassified_overdue: unclassifiedOverdue,
      },
      blockers,
      warnings,
      next_actions: nextActions,
      accounts: rows,
    };
  }
  accountByEmail(email) {
    const em = String(email ?? "").trim().toLowerCase();
    if (!em) return null;
    return this.db.prepare("SELECT id,username,email,display_name,status FROM core_account WHERE email=?").get(em) ?? null;
  }
  // 자동화(기본 자동 / 수동 폴백): '각자 메일=각자 일'. 메일함 기반 제안담당(suggested_assignee_ref=
  // 메일주소)이 있고 확정 담당이 비었으며 그 주소가 활성 계정과 매칭되는 할 일을, 그 계정 담당으로
  // 자동 확정한다. 결정적·LLM 무관. 계정 매칭 안 되면 손대지 않음(=수동 분배 대상). 기존 담당은 보존.
  // owner 인박스로 몰린 건 owner 담당이 되며, 그건 수동 재배정(드롭다운)으로 나눈다(폴백).
  applyMailboxAutoAssign() {
    let activeAccounts = 0;
    try { activeAccounts = this.db.prepare("SELECT COUNT(*) c FROM core_account WHERE status='active'").get().c; } catch { return { applied: 0, skipped: 0 }; }
    if (!activeAccounts) return { applied: 0, skipped: 0 }; // 팀 모드 아닐 때(파일럿/테스트) no-op
    let rows = [];
    try {
      rows = this.db.prepare(
        "SELECT id, suggested_assignee_ref FROM core_item WHERE (assignee_ref IS NULL OR assignee_ref='') " +
        "AND suggested_assignee_ref IS NOT NULL AND suggested_assignee_ref<>'' AND status<>'archived'"
      ).all();
    } catch { return { applied: 0, skipped: 0 }; }
    let applied = 0, skipped = 0;
    for (const r of rows) {
      const ref = String(r.suggested_assignee_ref).trim();
      const acct = ref.includes("@") ? this.accountByEmail(ref) : null;
      const assignee = acct && acct.status === "active" ? (acct.display_name || acct.username) : null;
      if (!assignee) { skipped++; continue; } // 알 수 없는 메일함 → 자동확정 안 함, 수동 분배로
      this.db.prepare("UPDATE core_item SET assignee_ref=? WHERE id=?").run(assignee, r.id);
      this.afterItemWrite?.(r.id);
      this.appendEvent?.({ actor_kind: "system", kind: "item_assign", item_ref: r.id, to: assignee, used_refs: ["mailbox_auto_assign"], data_label: "real", note: "각자 메일=각자 일 자동 배정" });
      applied++;
    }
    return { applied, skipped };
  }
  setAccountStatus(account_id, status) {
    if (!["active", "disabled"].includes(status)) return { error: "bad_status" };
    const a = this.db.prepare("SELECT 1 FROM core_account WHERE id=?").get(account_id);
    if (!a) return { error: "account_not_found" };
    this.db.prepare("UPDATE core_account SET status=? WHERE id=?").run(status, account_id);
    if (status === "disabled") this.db.prepare("DELETE FROM auth_session WHERE account_id=?").run(account_id); // 비활성=세션 무효
    return { ok: true, status };
  }
  // 계정 프로필 수정(이메일/표기명/역할). 이메일은 형식+중복 검증, 자기 외 중복 거부.
  updateAccount(account_id, { email, display_name, role } = {}) {
    const a = this.db.prepare("SELECT * FROM core_account WHERE id=?").get(account_id);
    if (!a) return { error: "account_not_found" };
    if (email !== undefined) {
      const em = String(email ?? "").trim().toLowerCase() || null;
      if (em) {
        if (!Store.EMAIL_RE.test(em)) return { error: "email_format" };
        const dup = this.db.prepare("SELECT id FROM core_account WHERE email=? AND id<>?").get(em, account_id);
        if (dup) return { error: "email_taken" };
      }
      try {
        this.db.prepare("UPDATE core_account SET email=? WHERE id=?").run(em, account_id);
      } catch (e) {
        if (em && this.db.prepare("SELECT 1 FROM core_account WHERE email=? AND id<>?").get(em, account_id)) return { error: "email_taken" };
        throw e;
      }
    }
    if (display_name !== undefined) {
      this.db.prepare("UPDATE core_account SET display_name=? WHERE id=?").run(String(display_name ?? "").trim() || null, account_id);
    }
    if (role !== undefined && ["admin", "member"].includes(role)) {
      // last-admin 가드(count 확인)와 역할 교체(DELETE+assignRole)를 원자화. SAVEPOINT 라 roster import 의 BEGIN IMMEDIATE 안에서도 중첩 안전.
      this.db.exec("SAVEPOINT upd_role");
      try {
        if (role !== "admin" && this.isAdmin(account_id) && a.status === "active") {
          const activeAdminCount = this.db.prepare(
            `SELECT COUNT(*) AS c
             FROM core_account a
             JOIN rbac_account_role rr ON rr.account_id=a.id AND rr.role_id='admin'
             WHERE a.status='active'`
          ).get().c;
          if (activeAdminCount <= 1) { this.db.exec("ROLLBACK TO upd_role"); this.db.exec("RELEASE upd_role"); return { error: "last_admin_role_required" }; }
        }
        this.db.prepare("DELETE FROM rbac_account_role WHERE account_id=?").run(account_id);
        this.assignRole(account_id, role);
        this.db.exec("RELEASE upd_role");
      } catch (e) { this.db.exec("ROLLBACK TO upd_role"); this.db.exec("RELEASE upd_role"); throw e; }
    }
    return { ok: true };
  }
  updateAccountMailbox(account_id, patch = {}) {
    const a = this.db.prepare("SELECT * FROM core_account WHERE id=?").get(account_id);
    if (!a) return { error: "account_not_found" };
    const normalized = Store.normalizeMailboxConfig(patch, a);
    if (normalized.error) return normalized;
    this.db.prepare(
      `UPDATE core_account SET mailbox_provider=?, mailbox_env_ref=?, mailbox_enabled=?, mailbox_status=?,
        mailbox_last_fetch_at=?, mailbox_last_error=?, mailbox_last_summary_ref=? WHERE id=?`
    ).run(
      normalized.mailbox_provider, normalized.mailbox_env_ref, normalized.mailbox_enabled, normalized.mailbox_status,
      normalized.mailbox_last_fetch_at, normalized.mailbox_last_error, normalized.mailbox_last_summary_ref, account_id
    );
    return { ok: true, mailbox: this.accountMailboxConfig(account_id) };
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
  meetingActions(meeting_id, { assignee_any } = {}) {
    const scope = scopedInClause("i.assignee_ref", assignee_any);
    const scopeSql = scope ? ` AND ${scope.sql}` : "";
    return this.db.prepare(
      `SELECT i.* FROM core_item i JOIN meeting_action_map m ON m.item_id=i.id WHERE m.meeting_id=?${scopeSql} ORDER BY i.id`
    ).all(meeting_id, ...(scope?.args ?? []));
  }

  // --- 개발요청함(slice6): 인입 채널(메일과 같은 패턴). 요청 → 받은 일 → 할 일 승격(미분류). ---
  createRequest({ id, project_id = null, title, requester = null, category = null, pointer_ref = null, data_label = "real" }) {
    const t = String(title ?? "").trim();
    if (!t) return { error: "title_required" };
    if (project_id && !this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(project_id)) return { error: "project_not_found" };
    const rid = id || `req_${randomBytes(5).toString("hex")}`;
    this.db.prepare(
      "INSERT INTO core_request(id,project_id,title,requester,category,status,pointer_ref,data_label,created_at) VALUES (?,?,?,?,?,'open',?,?,?)"
    ).run(rid, project_id, t, requester, category, pointer_ref, data_label, new Date().toISOString());
    return { ok: true, id: rid, request: this.db.prepare("SELECT * FROM core_request WHERE id=?").get(rid) };
  }
  requests({ project, status } = {}) {
    const cond = [], args = [];
    if (project) { cond.push("project_id=?"); args.push(project); }
    if (status) { cond.push("status=?"); args.push(status); }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return this.db.prepare(`SELECT * FROM core_request ${where} ORDER BY created_at DESC, id LIMIT 200`).all(...args);
  }
  // 요청 → 할 일 승격(메일 promote 패턴): 과제 필요, origin='request' → 자동분류로 unclassified 격리.
  promoteRequest(id, created_by) {
    const r = this.db.prepare("SELECT * FROM core_request WHERE id=?").get(id);
    if (!r) return { error: "request_not_found" };
    if (r.promoted_item_id) return { error: "already_promoted", item_id: r.promoted_item_id };
    if (!r.project_id || !this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(r.project_id)) return { error: "request_project_missing" };
    const res = this.createItem({ project_id: r.project_id, title: r.title, origin: "request", created_by });
    if (!res.ok) return res;
    this.db.prepare("UPDATE core_request SET status='promoted', promoted_item_id=? WHERE id=?").run(res.item.id, id);
    return { ok: true, item: res.item, request_id: id };
  }

  // --- SE 산출물 레지스터(ingest 착지면). 원문 미저장: out_pointer 는 상대경로 텍스트만. ---
  // 이름 주의: 위쪽 upsertDeliverable(template_key,...) 는 SE 스케줄러 '산출물 템플릿' 용으로 별개다.
  // 이 메서드는 core_deliverable(과제 실레코드) 착지면이라 upsertCoreDeliverable 로 분리한다.
  upsertCoreDeliverable(d) {
    const id = d.id || `${d.project_id}:${d.stage_code ?? ""}:${d.deliverable_no ?? d.name}`;
    const submit = d.submit_type === "draft" || d.submit_type === "final" ? d.submit_type : null;
    const produced = d.produced ? 1 : 0;
    const review = Number.isInteger(d.review_stage) ? d.review_stage : (produced ? 1 : 0);
    const dueSource = d.due_source === "owner" || d.due_source === "auto" ? d.due_source : "ingest";
    // 일정(due)은 RAG/스캔으로 정확히 못 정하므로 보통 비어 온다(원천 'ingest'). owner 가 직접 지정하면 'owner'.
    // 재-ingest 시 owner 가 지정한 일정은 보존한다 — '뭘(산출물)'은 도감이 갱신하되 '언제(일정)'는 사람 결정을 덮지 않는다.
    this.db
      .prepare(
        `INSERT INTO core_deliverable(id,project_id,stage_code,deliverable_no,name,submit_type,
           completion_criteria,due,due_source,out_pointer,in_pointer,produced,review_stage,data_label)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET stage_code=excluded.stage_code, deliverable_no=excluded.deliverable_no,
           name=excluded.name, submit_type=excluded.submit_type, completion_criteria=excluded.completion_criteria,
           due=CASE WHEN core_deliverable.due_source='owner' THEN core_deliverable.due ELSE excluded.due END,
           due_source=CASE WHEN core_deliverable.due_source='owner' THEN 'owner' ELSE excluded.due_source END,
           out_pointer=excluded.out_pointer,
           in_pointer=COALESCE(excluded.in_pointer, core_deliverable.in_pointer), produced=excluded.produced,
           review_stage=CASE WHEN core_deliverable.review_stage>=2 THEN core_deliverable.review_stage ELSE excluded.review_stage END`
      )
      .run(
        id, d.project_id, d.stage_code ?? null, d.deliverable_no ?? null, d.name,
        submit, d.completion_criteria ?? null, d.due ?? null, dueSource, d.out_pointer ?? null, d.in_pointer ?? null,
        produced, review, d.data_label ?? "real"
      );
    return { ok: true, id };
  }

  // SE 산출물 일정(due) owner 직접 지정. RAG/스캔으로는 '언제'를 못 채우므로(뭘만 있음) 사람이 변경한다.
  // 빈 값('' 또는 null)은 일정 해제(미정으로). 지정/해제 모두 due_source='owner' 로 표시해 재-ingest 가 안 덮게 한다.
  setDeliverableDue(id, due) {
    const row = this.db.prepare("SELECT id FROM core_deliverable WHERE id=?").get(id);
    if (!row) return { error: "deliverable_not_found" };
    const v = due == null ? "" : String(due).trim();
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: "due_format" };
    this.db.prepare("UPDATE core_deliverable SET due=?, due_source='owner' WHERE id=?").run(v || null, id);
    return { ok: true, id, due: v || null };
  }

  // 완료게이트 검토단계 진행/되돌리기(owner 결정 2026-06-15): 0 미착수,1 작성됨,2 본인검토,3 팀검토,4 리드완료.
  // 초안(_D)도 풀 3단계. 검토 2 이상으로 올리려면 03_Out 작성(produced)이 있어야 한다. 재-ingest 는 2↑ 보존.
  static REVIEW_MAX = 4;
  setDeliverableReview(id, stage) {
    const row = this.db.prepare("SELECT produced FROM core_deliverable WHERE id=?").get(id);
    if (!row) return { error: "deliverable_not_found" };
    const s = Number(stage);
    if (!Number.isInteger(s) || s < 0 || s > Store.REVIEW_MAX) return { error: "review_stage_range" };
    if (s >= 2 && !row.produced) return { error: "needs_produced" }; // 파일(03_Out) 없으면 검토 진행 불가
    this.db.prepare("UPDATE core_deliverable SET review_stage=? WHERE id=?").run(s, id);
    return { ok: true, id, review_stage: s };
  }

  coreDeliverables({ project, stage } = {}) {
    const cond = [], args = [];
    if (project) { cond.push("d.project_id=?"); args.push(project); }
    if (stage) { cond.push("d.stage_code=?"); args.push(stage); }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    // task_id: 이 산출물에서 spawn 된 할일(있으면). 일정→할일 버튼 ✓ 표시·중복 방지에 사용.
    // input_count/input_received: 입력파일 장부 집계(입력 버튼 N 표시).
    return this.db
      .prepare(`SELECT d.*,
                  (SELECT i.id FROM core_item i WHERE i.project_id=d.project_id AND i.title=d.name AND i.origin='schedule' LIMIT 1) AS task_id,
                  (SELECT COUNT(*) FROM deliverable_input di WHERE di.deliverable_id=d.id) AS input_count,
                  (SELECT COUNT(*) FROM deliverable_input di WHERE di.deliverable_id=d.id AND di.status<>'needed') AS input_received
                FROM core_deliverable d ${where} ORDER BY d.stage_code, d.deliverable_no, d.name LIMIT 500`)
      .all(...args);
  }

  // 일정→할일: 산출물 레지스터의 한 산출물 → 그 산출물을 '작성'하는 할일 생성.
  // '뭘'(산출물명·완료기준)은 산출물 ingest 에서, '언제(마감)'는 산출물 editable due 에서 상속. SE앵커(단계)·연결(artifact) 채워 분류 완료(open).
  // 멱등: 같은 과제·이름·origin=schedule 할일 있으면 중복 생성 안 함. (메일→할일과 달리 일정→할일은 이미 SE 기준점 있어 unclassified 아님)
  spawnTaskFromDeliverable(deliverable_id, { work_type = "author", assignee_ref = null, created_by = "owner" } = {}) {
    const d = this.db.prepare("SELECT * FROM core_deliverable WHERE id=?").get(deliverable_id);
    if (!d) return { error: "deliverable_not_found" };
    const dup = this.db.prepare("SELECT id FROM core_item WHERE project_id=? AND title=? AND origin='schedule'").get(d.project_id, d.name);
    if (dup) return { error: "already_spawned", item_id: dup.id };
    const wt = Store.WORK_TYPES.includes(work_type) ? work_type : "author";
    const r = this.createItem({
      project_id: d.project_id, title: d.name, origin: "schedule",
      anchor_stage_code: d.stage_code || null, link_kind: "artifact", link_ref: d.deliverable_no || d.name,
      work_type: wt, completion_criteria: d.completion_criteria || null, due: d.due || null,
      assignee_ref, created_by
    });
    if (r.error) return r;
    return { ok: true, item: r.item, deliverable_id };
  }

  // owner 직접 산출물 등록 — 고정 단계 템플릿 밖의 중간번호(31·32…) 등 실제 산출물 추가.
  // id=<과제>:<게이트>:<번호 또는 이름>. 같은 id 있으면 거부(덮어쓰기 방지). due 있으면 due_source='owner'.
  // 입력 파일·폴더 연결(out/input pointer)은 후속(파일 장부 슬라이스)에서. 여기선 레지스터 행만.
  addDeliverable({ project_id, stage_code, deliverable_no, name, completion_criteria, due, submit_type, in_pointer } = {}) {
    const code = String(project_id ?? "").trim();
    if (!/^P\d{2}-\d{3}$/.test(code)) return { error: "project_required" };
    if (!this.db.prepare("SELECT 1 FROM core_project WHERE id=?").get(code)) return { error: "project_not_found" };
    const nm = String(name ?? "").trim();
    if (!nm) return { error: "name_required" };
    const v = due == null ? "" : String(due).trim();
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: "due_format" };
    const ip = in_pointer == null ? null : String(in_pointer).trim() || null;
    // 적대적 검토 반영: traversal/백슬래시/제어도 차단(_workspaces 접두 + 절대 외에).
    if (ip && (isAbsolute(ip) || !ip.startsWith("_workspaces/") ||
      /(^|\/)\.\.(\/|$)/.test(ip) || ip.includes("\\") || /[\x00-\x1f]/.test(ip))) return { error: "in_pointer_must_be_relative_workspace" };
    const stage = String(stage_code ?? "").trim() || null;
    const no = String(deliverable_no ?? "").trim() || null;
    const id = `${code}:${stage ?? ""}:${no ?? nm}`;
    if (this.db.prepare("SELECT 1 FROM core_deliverable WHERE id=?").get(id)) return { error: "deliverable_exists", id };
    return this.upsertCoreDeliverable({
      id, project_id: code, stage_code: stage, deliverable_no: no, name: nm,
      submit_type: submit_type ?? null, completion_criteria: completion_criteria ?? null,
      due: v || null, due_source: v ? "owner" : "ingest", in_pointer: ip, produced: 0, review_stage: 0, data_label: "real"
    });
  }

  // ── 산출물 입력파일(메타·포인터 전용·원문 미저장) ─────────────────────
  // 종류(artifact_type)별 In 하위폴더 기본 매핑(설계 §3). owner/Codex 가 도메인에 맞게 조정.
  static INPUT_SUBFOLDER_MAP = {
    schematic: ["참고규격", "이전버전", "부품정보"],
    pcb: ["회로도", "기구도면", "적층조건"],
    bom: ["회로도", "부품선정", "단가표"],
    gerber: ["pcb데이터", "제작사양"],
    report: ["근거자료", "인용규격", "이전보고서"],
    doc: ["근거자료", "인용규격", "이전보고서"],
    test: ["시험요구", "시험표준", "대상사양"],
  };
  static INPUT_SOURCES = ["erp", "mail", "codex"];
  static INPUT_STATUSES = ["needed", "received", "used"];
  inputSubfoldersFor(artifactType) {
    return Store.INPUT_SUBFOLDER_MAP[String(artifactType ?? "").trim()] ?? ["참고자료"];
  }
  // 입력파일 등록(포인터·메타). 절대경로 거부(상대만). source/status enum. 멱등(id=<산출물>:<해시|파일명>).
  // id 명시(장부 ingest 왕복용) 가능. sync=false 면 write-through 훅 미호출(import 경로 — 순환 차단).
  registerDeliverableInput({ id = null, deliverable_id, subfolder = null, file_name = null, pointer = null,
    source = "erp", sha256 = null, size = null, status = "needed", mail_ref = null, note = null } = {}, { sync = true } = {}) {
    const did = String(deliverable_id ?? "").trim();
    if (!did) return { error: "deliverable_required" };
    const d = this.db.prepare("SELECT project_id, stage_code FROM core_deliverable WHERE id=?").get(did);
    if (!d) return { error: "deliverable_not_found" };
    const ptr = pointer == null ? null : String(pointer).trim() || null;
    // 적대적 검토 반영: DB 에 traversal/절대/백슬래시/제어 포인터가 절대 저장되지 않게 쓰기 경계에서 차단.
    if (ptr && (isAbsolute(ptr) || /^[A-Za-z]:[\\/]/.test(ptr) || ptr.startsWith("\\\\") ||
      /(^|\/)\.\.(\/|$)/.test(ptr) || ptr.includes("\\") || /[\x00-\x1f]/.test(ptr))) return { error: "pointer_must_be_relative" };
    const src = Store.INPUT_SOURCES.includes(source) ? source : "erp";
    const st = Store.INPUT_STATUSES.includes(status) ? status : "needed";
    const fname = file_name == null ? null : String(file_name).trim() || null;
    const keyPart = sha256 || fname || randomBytes(4).toString("hex");
    const finalId = String(id ?? "").trim() || `${did}:${keyPart}`;
    this.db.prepare(
      `INSERT INTO deliverable_input(id,deliverable_id,project_id,stage_code,subfolder,file_name,pointer,source,sha256,size,status,mail_ref,note,created_at,data_label)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'real')
       ON CONFLICT(id) DO UPDATE SET subfolder=excluded.subfolder, file_name=excluded.file_name, pointer=excluded.pointer,
         source=excluded.source, sha256=excluded.sha256, size=excluded.size, status=excluded.status,
         mail_ref=excluded.mail_ref, note=excluded.note`
    ).run(finalId, did, d.project_id ?? null, d.stage_code ?? null, subfolder ?? null, fname, ptr,
      src, sha256 ?? null, size != null ? Number(size) : null, st, mail_ref ?? null, note ?? null, new Date().toISOString());
    if (sync) this.afterInputWrite?.(finalId); // autosync: ERP 등록 → 입력파일_장부 write-through
    return { ok: true, id: finalId };
  }
  deliverableInputs({ deliverable_id, project } = {}) {
    const cond = [], args = [];
    if (deliverable_id) { cond.push("deliverable_id=?"); args.push(deliverable_id); }
    if (project) { cond.push("project_id=?"); args.push(project); }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return this.db.prepare(`SELECT * FROM deliverable_input ${where} ORDER BY subfolder, file_name, id LIMIT 1000`).all(...args);
  }
  setDeliverableInputStatus(id, status) {
    if (!Store.INPUT_STATUSES.includes(status)) return { error: "bad_status" };
    const r = this.db.prepare("UPDATE deliverable_input SET status=? WHERE id=?").run(status, id);
    if (!r.changes) return { error: "input_not_found" };
    this.afterInputWrite?.(id); // autosync: 상태 변경 → 입력파일_장부 write-through
    return { ok: true, id, status };
  }
  // 입력파일 1행 조회(write-through 용).
  deliverableInput(id) {
    return this.db.prepare("SELECT * FROM deliverable_input WHERE id=?").get(id) ?? null;
  }
}
