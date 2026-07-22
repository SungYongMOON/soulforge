import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import Ajv2020 from "ajv/dist/2020.js";
import { parseWhisperJson, suppressRepetitiveSegments } from "./local_asr.mjs";

export const semanticLabelRunSchemaVersion = "soulforge.voice_semantic_label_run.v1";
export const projectContextCardSchemaVersion = "soulforge.voice_project_context_card.v1";
export const semanticLabelEngineId = "soulforge_voice_semantic_baseline";
export const semanticLabelEngineVersion = "1.10.7";

const VERIFIED_ASR_PAIR_EVIDENCE = Symbol("verifiedAsrPairEvidence");
const VERIFIED_FAST_RUNS = new WeakMap();
const VERIFIED_STRONG_RUNS = new WeakMap();
const VERIFIED_COMPARISONS = new WeakMap();
const FAST_MODEL_ID = "large-v3-turbo-q5_0";
const STRONG_MODEL_ID = "large-v3-q5_0";
const FAST_MODEL_SHA256 = "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2";
const STRONG_MODEL_SHA256 = "d75795ecff3f83b5faa89d1900604ad8c780abd5739fae406de19f23ecd98ad1";
const PROVIDER_EVIDENCE_ROLE = "provider_transcript_auxiliary_unverified";
const FAST_EVIDENCE_ROLE = "independent_machine_transcript_unverified";
const STRONG_EVIDENCE_ROLE = "independent_machine_transcript_stronger_verified_pair";
const COMMON_POLITE_REQUEST_PATTERN = /(?:보내|전달|송부|공유|회신|답변|확인|검토|읽|봐|준비|작성|정리|연락|예약|측정|계측|시험|테스트|수정|보완|구매|발주|결정)(?:어|아|해|하여)?\s*(?:좀\s*)?(?:주세요|주십시오|주시기\s*바랍니다|주실\s*수\s*있(?:나요|습니까)|주시겠(?:어요|습니까)|주(?:셨)?으면\s*(?:좋겠습니다|감사하겠습니다)|주시면\s*(?:좋겠습니다|감사하겠습니다)|주면\s*(?:좋겠습니다|됩니다|고맙겠습니다)|부탁(?:드립니다|드리겠습니다|드릴게요|드려요|합니다|해요)|요청드립니다|줘(?:요)?|줄래(?:요)?|줄\s*수\s*있(?:나요|습니까|을까요)|가능하실까요|바랍니다)/u;
const COMMON_INCOMPLETE_PATTERN = /(?:(?:완료|처리|전달|발송|확인|작성|정리)(?:가|이|은|는)?\s*(?:아직\s*)?(?:안\s*(?:됐|되어|끝났)|되지\s*않았|하지\s*못했|못\s*(?:했|됐)|전(?:입니다|이에요)?)|(?:아직\s*)?(?:안\s*끝났|끝나지\s*않았|끝나진\s*않았|덜\s*끝났|다\s*끝나지\s*않았|마무리되지\s*않았)|(?:아직\s*)?(?:(?:안|못)\s*(?:보냈|전달했|제출했)|(?:보내|전달하|제출하)지\s*않았)|미완료(?:입니다|상태입니다)?)/u;
const PARTICLE_VALUE_PATTERN = /(?<![A-Za-z0-9])\d+(?:\.\d+)?\s*(?:mm|cm|m|km|kg|g|kHz|MHz|GHz|Hz|mV|V|mA|A|kW|W|dB|Ω|ohm|옴|도|%|점|개|건|명|회|주|개월)(?=입니다|예요|이에요|[을를이가은는과와도만부터까지]|간|씩|짜리|정도|이상|이하|가량|내외|\s|$|[,.;:!?])/giu;

const SPEECH_ACT_ORDER = [
  "cancellation",
  "assignment",
  "request",
  "offer",
  "commitment",
  "decision",
  "open_question",
  "risk_or_issue",
  "status_update",
  "result_report",
  "acknowledgement",
  "deadline_mention",
  "reported_speech",
  "conditional_statement",
  "context_statement",
];

const ACTION_PATTERNS = [
  ["send_or_share", /(?:보내|전달|송부|공유|회신|답변|제출|달라고)/u],
  ["check_or_confirm", /(?:확인|체크|점검|검증)/u],
  ["review", /(?:검토|리뷰|읽|검토해|봐\s*주)/u],
  ["prepare_or_create", /(?:준비|작성|정리|만들|제작)/u],
  ["contact", /(?:연락|전화|문의)/u],
  ["schedule", /(?:일정|납기|기한|마감|예약|약속|회의를?\s*잡)/u],
  ["test_or_measure", /(?:시험|테스트|측정|계측)/u],
  ["fix_or_update", /(?:수정|보완|고치|업데이트|변경)/u],
  ["purchase_or_quote", /(?:구매|발주|견적)/u],
  ["decide", /(?:결정|확정|선정|채택)/u],
  ["completion_state", /(?:완료|끝났|처리됐|전달됐|발송됐)/u],
];

const REQUEST_PATTERN = /(?:해\s*줘|해\s*주세|해\s*주실|해\s*주시|주시겠|주시면|필요해\s*요|필요합니다)/u;
const COMMITMENT_PATTERN = /(?:(?:진행|처리|확인|검토|작성|정리|준비|제작|수정|보완|구매|발주|결정|시험|측정|연락|예약|수행|담당|전달|공유|송부|회신|답변)(?:(?:해|하)?(?:보|두|놓)?겠습니다|할게(?:요)?|(?:해)?\s*드릴게(?:요)?|(?:해)?\s*드리겠습니다)|보내(?:겠습니다|드릴게(?:요)?|드리겠습니다|둘게(?:요)?|놓겠습니다)|보낼게(?:요)?|알려(?:드릴게(?:요)?|드리겠습니다)|(?:말씀|안내)(?:드릴게(?:요)?|드리겠습니다)|해\s*둘게(?:요)?|맡겠습니다|맡을게(?:요)?|제가\s+(?:직접\s+)?하겠습니다)/u;
const DECISION_PATTERN = /(?:하기로\s*(?:했|함|결정)|(?:진행|처리|사용|적용|선정)하는\s*(?:것|걸)로\s*(?:했|정했|결정했)|로\s*(?:결정|확정|진행하기로|가기로|정했)|(?:결정|확정|선정|채택|정)했습니다|결정됐|확정됐|채택됐)/u;
const COLLOQUIAL_DECISION_PATTERN = /(?:그럼|그러면)\s+[^.?!。！？]{1,60}(?:로|으로)\s*(?:(?:진행|처리|선정|확정)하죠|가죠|하죠|갑시다|합시다)/u;
const QUESTION_PATTERN = /(?:[?？]|(?:나요|까요|습니까|인가요|어떻게|왜|언제|어디|누가)(?:\s|$))/u;
const PROPOSAL_QUESTION_PATTERN = /(?:해\s*드릴까요|할까요|보낼까요|확인할까요|진행할까요)/u;
const CANCELLATION_PATTERN = /(?:[가-힣]+지\s*마(?:세요|십시오|라|요|자|$|[\s,.!?])|[가-힣]+지\s*말(?:아|자|고|도록|$|[\s,.!?])|[가-힣]+지\s*않도록|안\s*(?:보내|전달하|확인하|처리하|작성하|진행하|발주하|구매하|제작하|수정하|준비하|맡|하)(?:겠습니다|겠어요|겠|을게요|할게요)|안\s*해도|필요\s*없|금지|취소|중단|보류|제외|철회)/u;
const REPORTED_PATTERN = /(?:다고\s*(?:했|말했|들었)|라고\s*(?:했|말했|들었)|해\s*달라고\s*(?:했|말했|요청했)|달라고\s*(?:합니다|했습니다|말합니다|말했습니다|요청(?:했|했습니다))|달랍니다|달라는\s*(?:말|요청)|요청(?:했|했습니다|하였습니다)|하기로\s*했다고|요청을?\s*받았|말로는|말에\s*따르면|에\s*따르면)/u;
const CONDITIONAL_PATTERN = /(?:한다면|하면|되면|경우에|경우는|때에는|(?:끝나|되|완료되|확인되)는\s*대로|(?:승인|확인|검토|허가|결정|완료)\s*(?:시(?:에|\s|$)|후|뒤|이후)|전제(?:로|하에)|여부에\s*따라|에\s*따라)/u;
const RISK_PATTERN = /(?:문제|오류|에러|지연|누락|위험|고장|부족|안\s*돼|안\s*되|못\s*하|어렵|이상|(?:납기|기한|일정|납품|배송|출하)(?:를|을|가|이|은|는)?[^.?!。！？]{0,24}(?:못\s*맞(?:추|춥|췄)|지키기\s*어렵|지연|빠듯|촉박|차질|밀(?:리|릴|렸|려)|늦(?:습니다|어|어질|었)))/u;
const NEGATED_RISK_PHRASE_PATTERN = /(?:문제|오류|에러|위험|이상|고장|누락|지연)(?:\s*(?:가능성|우려))?(?:가|이|은|는)?\s*(?:(?:전혀|별로|특별히|현재)\s*)?(?:없(?:습니다|어요|다)?|아니(?:며|고|지만|다|에요|예요|입니다)?)/gu;
const NEGATED_RISK_EVENT_PATTERN = /(?:문제|오류|에러|위험|이상|고장|누락|지연)(?:가|이|은|는)?\s*(?:발생하|생기|나타나)지\s*않았(?:습니다|어요|다)?/gu;
const BUSINESS_IMPACT_RISK_PATTERN = /(?:비용|원가|예산|고객|안전|품질)[^.?!。！？]{0,60}(?:증가|초과|상승|하락|저하|낮|크|영향|위험|문제|불량|악화|차질|지연|부족|이탈|불만|클레임)/u;
const NEGATED_BUSINESS_IMPACT_PATTERN = /(?:비용|원가|예산|고객|안전|품질)[^.?!。！？]{0,60}(?:증가|초과|상승|하락|저하|영향|위험|문제|불량|악화|차질|지연|부족)(?:\s*(?:가능성|우려))?(?:가|이|은|는)?\s*(?:전혀\s*)?(?:없(?:습니다|어요|다)?|아니(?:며|고|지만|다|에요|예요|입니다)?)/gu;
const NEGATED_BUSINESS_CHANGE_PATTERN = /(?:비용|원가|예산|고객|안전|품질)[^.?!。！？]{0,60}(?:증가|초과|상승|하락|저하|악화|차질|지연|이탈)(?:하|되)?지\s*않았(?:습니다|어요|다)?/gu;
const TRIVIAL_CLOSING_PATTERN = /^(?:(?:네|예|알겠습니다)\s*[,،.]?\s*)?(?:(?:이상입니다|여기까지입니다|(?:오늘은\s*)?여기까지\s*하겠습니다|이상으로\s*마치겠습니다|감사합니다|고맙습니다)\s*[.!?。！？]*\s*)+$/u;
const TRIVIAL_ACK_PATTERN = /^(?:(?:네|예)\s*[,،.]?\s*)?(?:알겠습니다|확인했습니다|이해했습니다)(?:\s*[.!?。！？]*\s*(?:감사합니다|고맙습니다|이상입니다|여기까지입니다))*\s*[.!?。！？]*$/u;
const TRIVIAL_MEAL_PATTERN = /^(?:(?:네|예)\s*[,،.]?\s*)?(?:오늘\s*)?(?:점심|저녁|아침|식사)(?:을|은|는)?\s*(?:좀\s*)?(?:준비해\s*주세요|먹(?:었습니다|었어요|을까요|읍시다|자)|맛있게\s*(?:드세요|하세요))\s*[.!?。！？]*$/u;
const TRIVIAL_COURTESY_PATTERN = /^(?:잘\s*)?(?:부탁(?:드립니다|드리겠습니다|합니다|해요)|행복을\s*바랍니다|수고하셨습니다)\s*[.!?。！？]*$/u;
const TRIVIAL_WEATHER_PATTERN = /^(?:오늘|내일)?\s*(?:날씨|기분)(?:가|는|은)?\s*(?:좋(?:네요|습니다|아요)|맑(?:네요|습니다|아요))\s*[.!?。！？]*$/u;
const TRIVIAL_GREETING_PATTERN = /^(?:안녕하세요|반갑습니다|좋은\s*(?:아침|오후|저녁)입니다)\s*[.!?。！？]*$/u;
const TRIVIAL_NEGATED_DELIVERY_RISK_PATTERN = /^(?:납기|기한|일정|납품|배송|출하)\s+(?:지연|차질|문제|위험)(?:\s*(?:가능성|우려))?(?:은|는|이|가)?\s*없(?:습니다|어요|다)?\s*[.!?。！？]*$/u;
const RESULT_PATTERN = /(?:완료|끝났|보냈습니다|전달했습니다|확인했습니다|처리했습니다|작성했습니다|됐습니다|되었습니다|(?:시험|검사)(?:이|가)?\s*(?:통과|합격)했습니다|(?:시험|검사|측정|검토|분석)\s*결과(?:는|가)?\s*[^.?!。！？]{1,80}(?:입니다|나왔습니다|나왔어요)|측정값(?:은|이|는|가)?\s*[^.?!。！？]{1,80}(?:입니다|나왔습니다|나왔어요)|(?:[가-힣A-Za-z0-9_-]{1,20}\s+)?(?:전압|전류|저항|주파수|출력|입력|온도|압력|속도|진행률|품질\s*점수)(?:은|는|이|가)?\s*\d+(?:\.\d+)?\s*(?:mm|cm|m|km|kg|g|mV|V|볼트|mA|A|암페어|Ω|ohm|옴|도|Hz|kHz|MHz|GHz|헤르츠|W|kW|와트|dB|%|퍼센트|점|개|건|회|명)?(?:입니다|예요|이에요|로\s*나왔(?:습니다|어요)|(?=\s*[.!?。！？]*$))|(?:안전|품질)\s*등급(?:은|는|이|가)?\s*[A-F](?:등급)?(?:입니다|예요))/iu;
const PROGRESS_STATUS_PATTERN = /(?:(?:작업|진행|검토|처리|작성|준비|시험|측정|분석|제작)(?:을|를|은|는|이|가)?\s*(?:정상\s*)?(?:(?:진행\s*)?중(?:입니다|이에요|입니다만)?|진행되고\s*있(?:습니다|어요|다)?|(?:계속\s*)?(?:진행하고|하고)\s*있(?:습니다|어요|다)?)|진행률(?:은|는|이|가)?\s*\d+(?:\.\d+)?\s*(?:%|퍼센트)(?:입니다|예요)?)/u;
const NEGATED_COMPLETION_PATTERN = /(?:아직|여태|현재까지)?\s*(?:(?:안|못)\s*(?:했|됐|보냈|전달했|확인했|처리했|작성했|끝냈)|(?:완료하|처리하|보내|전달하|확인하|작성하|끝내)지\s*않)|(?:완료|처리|전달|발송|확인)(?:가|이|은|는)?\s*(?:안|되지\s*않|못)|(?:완료|처리|전달|발송|확인)(?:한|된)?\s*(?:것|건)?(?:은|는)?\s*(?:아니|아닙)|(?:완료|처리|전달|발송|확인)\s*전/u;
const OFFER_PATTERN = /(?:[가-힣]*드릴까요|할까요|보낼까요|확인할까요|진행할까요|제가\s+[^.?!。！？]{0,80}(?:할까요|드릴까요))/u;
const ASSIGNMENT_PATTERN = /(?:[가-힣]{2,4}\s*(?:님|사원|주임|대리|과장|차장|부장|팀장|수석|책임)(?:이|가|은|는)?\s+[^.?!。！？]{0,80}(?:해\s*주세요|맡아|담당)|담당(?:자|은|는)?\s*[^.?!。！？]{0,40}(?:입니다|로\s*하|로\s*정))/u;
const ACKNOWLEDGEMENT_PATTERN = /(?:네\s*[,.]?\s*(?:알겠습니다|확인했습니다)|알겠습니다|이해했습니다|그렇게\s*하죠)/u;
const TENTATIVE_PATTERN = /(?:일단|우선|잠정|임시|아마|가능하면|검토해\s*보|생각해\s*보|것\s*같|수\s*있)/u;
const DEADLINE_PATTERN = /(?:오늘|내일|모레|이번\s*주|다음\s*주|월요일|화요일|수요일|목요일|금요일|토요일|일요일|\d{1,2}\s*월\s*\d{1,2}\s*일|\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}\s*일\s*내(?:로|에)?|\d{1,2}\s*시|까지|전까지)/u;
const PERSON_PATTERN = /([가-힣]{2,4})\s*(대표|사장|이사|상무|부장|차장|과장|대리|주임|사원|수석|책임|선임|팀장|실장|박사|교수|님)/gu;
const PROJECT_CODE_PATTERN = /\bP\d{2}-\d{3}(?:_[A-Za-z0-9가-힣-]+)?\b/giu;
const VALUE_PATTERN = /\b\d+(?:\.\d+)?\s*(?:mm|cm|m|km|kg|g|Hz|kHz|MHz|GHz|V|mV|A|mA|W|kW|dB|ohm|옴|도|%|퍼센트|점|개|건|회|명|일|주|개월)\b/giu;
const DATE_PATTERN = /(?:\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}\s*월\s*\d{1,2}\s*일|오늘|내일|모레|이번\s*주|다음\s*주|월요일|화요일|수요일|목요일|금요일|토요일|일요일)/gu;
const SECRET_KEY_PATTERN = /(?:password|passwd|secret|token|cookie|authorization|credential|download_url|비밀번호|비번|암호|패스워드|인증코드|인증번호|접속키|보안키)/iu;
const SECRET_VALUE_PATTERN = /(?:(?:password|passwd|secret|api[_ -]?key|access[_ -]?token|bearer)\s*[:=_-]?\s*\S+|(?:token|cookie|credential|authorization)\s*[:=_-]\s*\S+|(?:비밀번호|비번|암호|패스워드|토큰|인증(?:정보|키|코드|번호)|보안(?:키|코드)|접속(?:키|암호)|쿠키|접근\s*키|api\s*키|pin|otp)(?:(?:\s*(?:[:=_-]|은|는|이|가)\s*|\s+)\S+|[A-Za-z0-9_-]{4,}))|\bsk-(?:proj-)?[A-Za-z0-9_-]{10,}\b|\b(?:ghp|github_pat|xox[baprs])[-_A-Za-z0-9]{10,}\b|\bAKIA[A-Z0-9]{12,}\b|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/iu;
const ALLOWED_CANDIDATE_KINDS = new Set([
  "cancellation_or_hold",
  "assignment",
  "request",
  "commitment",
  "decision",
  "risk_followup",
  "completion_claim_review",
  "reported_obligation_review",
]);
const ALLOWED_DRIVER_KINDS = new Set(["assignment", "request", "followup", "decision", "risk", "result"]);
const ALLOWED_SPEECH_ACTS = new Set(SPEECH_ACT_ORDER);
const ALLOWED_ACTION_CODES = new Set(ACTION_PATTERNS.map(([code]) => code));
const MATERIAL_SPEECH_ACTS = new Set([
  "cancellation",
  "assignment",
  "request",
  "commitment",
  "decision",
  "risk_or_issue",
  "deadline_mention",
]);

const RULESET_DESCRIPTOR = Object.freeze({
  speech_act_order: SPEECH_ACT_ORDER,
  action_codes: ACTION_PATTERNS.map(([code]) => code),
  minimum_project_anchors: 2,
  minimum_project_score: 5,
  minimum_project_margin: 2,
  max_turn_chars: 420,
  max_turn_gap_seconds: 3,
});
const SEMANTIC_LABEL_RUN_SCHEMA = JSON.parse(readFileSync(new URL("./semantic_label_run.schema.json", import.meta.url), "utf8"));
const validateSemanticLabelRunSchema = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true }).compile(SEMANTIC_LABEL_RUN_SCHEMA);
const SEMANTIC_ASR_COMPARISON_SCHEMA = JSON.parse(readFileSync(new URL("./semantic_asr_comparison.schema.json", import.meta.url), "utf8"));
const validateSemanticAsrComparisonSchema = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true }).compile(SEMANTIC_ASR_COMPARISON_SCHEMA);
const PROJECT_CONTEXT_CARD_SCHEMA = JSON.parse(readFileSync(new URL("./project_context_card.schema.json", import.meta.url), "utf8"));
const validateProjectContextCardSchema = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true }).compile(PROJECT_CONTEXT_CARD_SCHEMA);

export function parseTranscriptJsonl(value) {
  const lines = String(value ?? "").split(/\r?\n/u).filter((line) => line.trim());
  return lines.map((line, index) => {
    let row;
    try {
      row = JSON.parse(line);
    } catch (error) {
      throw new Error(`invalid transcript JSONL at line ${index + 1}: ${error.message}`);
    }
    const segmentId = row.segment_id ?? index + 1;
    const content = String(row.content ?? row.text ?? "").trim();
    const startSeconds = finiteOrNull(row.start_seconds ?? row.start);
    const endSeconds = finiteOrNull(row.end_seconds ?? row.end);
    return {
      schema_version: row.schema_version ?? null,
      segment_id: segmentId,
      start_seconds: startSeconds,
      end_seconds: endSeconds,
      speaker: normalizeOptional(row.speaker) ?? "UNKNOWN",
      content,
      source: normalizeOptional(row.source),
    };
  });
}

export function buildSemanticTurns(sourceSegments, options = {}) {
  const maxChars = positiveInteger(options.maxChars, RULESET_DESCRIPTOR.max_turn_chars);
  const maxGapSeconds = finiteOrDefault(options.maxGapSeconds, RULESET_DESCRIPTOR.max_turn_gap_seconds);
  const turns = [];
  let current = null;

  for (const segment of sourceSegments) {
    const content = String(segment.content ?? "").trim();
    const candidate = {
      source_segment_ids: [segment.segment_id],
      start_seconds: finiteOrNull(segment.start_seconds),
      end_seconds: finiteOrNull(segment.end_seconds),
      speaker_label: sanitizeSpeakerLabel(segment.speaker),
      text: content,
    };
    if (!current || !canMergeTurn(current, candidate, maxChars, maxGapSeconds)) {
      if (current) turns.push(finalizeTurn(current, turns.length + 1));
      current = candidate;
      continue;
    }
    current.source_segment_ids.push(segment.segment_id);
    current.end_seconds = candidate.end_seconds ?? current.end_seconds;
    current.text = [current.text, candidate.text].filter(Boolean).join(" ").trim();
  }
  if (current) turns.push(finalizeTurn(current, turns.length + 1));
  return turns;
}

export function buildVoiceSemanticLabelRun(options = {}) {
  return buildVoiceSemanticLabelRunInternal(options, null);
}

export function rankVoiceProjectContextShadow(text, projectContextCards = []) {
  return resolveProjectForText(normalizeText(text), validateProjectContextCards(projectContextCards));
}

function buildVoiceSemanticLabelRunInternal(options = {}, verifiedPairEvidence = null) {
  const recordingId = requireSafeId(options.recordingId, "recordingId");
  const transcriptRef = requireSafeRelativeRef(options.transcriptRef, "transcriptRef");
  const transcriptSha256 = requireSha256(options.transcriptSha256, "transcriptSha256");
  const sourceSegments = Array.isArray(options.sourceSegments) ? options.sourceSegments.map((row) => ({ ...row })) : [];
  if (sourceSegments.length === 0) throw new Error("sourceSegments must contain at least one transcript segment");
  validateSourceSegments(sourceSegments);
  const contextCards = validateProjectContextCards(options.projectContextCards ?? []);
  const rulesetSha256 = sha256(stableStringify(RULESET_DESCRIPTOR));
  const contextDigest = sha256(stableStringify(contextCards));
  const requestedEvidenceRole = normalizeOptional(options.evidenceRole) ?? FAST_EVIDENCE_ROLE;
  const providerEvidence = requestedEvidenceRole === PROVIDER_EVIDENCE_ROLE;
  const verifiedPairLane = verifiedPairEvidence?.token === VERIFIED_ASR_PAIR_EVIDENCE
    ? verifiedPairEvidence.lane
    : null;
  const fastEvidenceVerified = verifiedPairLane === "fast";
  const strongEvidenceVerified = verifiedPairLane === "stronger";
  const evidenceRole = providerEvidence
    ? PROVIDER_EVIDENCE_ROLE
    : strongEvidenceVerified ? STRONG_EVIDENCE_ROLE : FAST_EVIDENCE_ROLE;
  const transcriptQuality = normalizeOptional(options.transcriptQuality) ?? "unknown";
  const normalizedTurnOptions = {
    maxChars: positiveInteger(options.turnOptions?.maxChars, RULESET_DESCRIPTOR.max_turn_chars),
    maxGapSeconds: finiteOrDefault(options.turnOptions?.maxGapSeconds, RULESET_DESCRIPTOR.max_turn_gap_seconds),
  };
  const identityInputs = {
    recording_id: recordingId,
    transcript_ref: transcriptRef,
    transcript_sha256: transcriptSha256,
    source_segments_sha256: sha256(stableStringify(sourceSegments)),
    engine_version: semanticLabelEngineVersion,
    context_digest: contextDigest,
    evidence_role: evidenceRole,
    transcript_quality: transcriptQuality,
    recorded_at: normalizeOptional(options.recordedAt),
    recording_title: normalizeOptional(options.recordingTitle),
    duration_seconds: finiteOrNull(options.durationSeconds),
    turn_options: normalizedTurnOptions,
  };
  const runId = `vsl_${sha256(stableStringify(identityInputs)).slice(0, 24)}`;
  const turns = buildSemanticTurns(sourceSegments, normalizedTurnOptions);
  const rawLabelRows = turns.map((turn) => labelTurn(turn, contextCards));
  const evidenceGate = buildEvidenceGate(evidenceRole, transcriptQuality, rawLabelRows);
  const labelRows = applyEvidenceGateToLabels(rawLabelRows, evidenceGate);
  const actionCandidates = evidenceGate.action_candidate_emission_allowed
    ? labelRows.flatMap((row) => buildActionCandidates(recordingId, row, {
    transcriptSha256,
    rulesetSha256,
    contextDigest,
    }))
    : [];
  const recordingClassification = classifyRecording({
    title: options.recordingTitle,
    durationSeconds: options.durationSeconds,
    speakerCount: new Set(sourceSegments.map((item) => item.speaker).filter(Boolean)).size,
  });
  const projectResolution = evidenceGate.project_candidate_emission_allowed
    ? summarizeProjectResolution(labelRows)
    : buildDeferredProjectResolution(evidenceGate);
  const retrievalPlan = buildRetrievalPlan({
    recordedAt: options.recordedAt,
    labelRows,
    projectResolution,
    allowTerms: evidenceGate.action_candidate_emission_allowed,
  });
  const coverage = buildCoverage(sourceSegments, labelRows, actionCandidates);
  const reviewWindows = buildReviewWindows(recordingId, labelRows, evidenceGate);

  const run = {
    schema_version: semanticLabelRunSchemaVersion,
    run_id: runId,
    recording_ref: {
      recording_id: recordingId,
      transcript_ref: transcriptRef,
      transcript_sha256: transcriptSha256,
      transcript_schema_versions: uniqueSorted(sourceSegments.map((row) => row.schema_version).filter(Boolean)),
      recorded_at: normalizeOptional(options.recordedAt),
      evidence_role: evidenceRole,
      transcript_quality: transcriptQuality,
    },
    evidence_provenance: strongEvidenceVerified ? verifiedPairEvidence.receipt : null,
    engine: {
      engine_id: semanticLabelEngineId,
      engine_version: semanticLabelEngineVersion,
      ruleset_sha256: rulesetSha256,
      mode: contextCards.length > 0 ? "context_assisted_rules" : "transcript_only_rules",
      claim_ceiling: evidenceGate.input_class === "provider_locator_only"
        ? "locator_only_untrusted"
        : "machine_generated_reviewable",
    },
    evidence_gate: evidenceGate,
    recording_classification: recordingClassification,
    context: {
      project_context_card_refs: contextCards.map((card) => card.card_ref),
      project_context_digest: contextDigest,
      missing_context_kinds: contextCards.length > 0
        ? ["mail_retrieval", "se_schedule_retrieval", "file_activity_retrieval", "run_log_retrieval"]
        : ["project_context_cards", "mail_retrieval", "se_schedule_retrieval", "file_activity_retrieval", "run_log_retrieval"],
    },
    segment_labels: labelRows.map(stripPrivateText),
    action_candidates: actionCandidates,
    review_windows: reviewWindows,
    retrieval_plan: retrievalPlan,
    project_resolution: projectResolution,
    coverage,
    boundaries: {
      transcript_body_copied_to_output: false,
      raw_audio_read: false,
      provider_summary_used: false,
      human_acceptance_fabricated: false,
      official_task_mutated: false,
      employee_scoring_enabled: false,
      provider_transcript_authority_zero: true,
      speaker_is_not_assignee: true,
      ambiguous_trivial_content_ignored: true,
    },
  };
  const verifiedRunBrand = (fastEvidenceVerified || strongEvidenceVerified)
    ? buildVerifiedRunBrand(run, verifiedPairLane, verifiedPairEvidence.receipt)
    : null;
  if (fastEvidenceVerified) VERIFIED_FAST_RUNS.set(run, verifiedRunBrand);
  if (strongEvidenceVerified) VERIFIED_STRONG_RUNS.set(run, verifiedRunBrand);
  const validation = validateVoiceSemanticLabelRun(run);
  if (!validation.ok) {
    VERIFIED_FAST_RUNS.delete(run);
    VERIFIED_STRONG_RUNS.delete(run);
    throw new Error(`semantic label run validation failed: ${validation.errors.join("; ")}`);
  }
  if (verifiedRunBrand) deepFreeze(run);
  return run;
}

export async function analyzeVoiceSemanticSession(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const voiceRoot = path.resolve(options.voiceRoot ?? path.join(repoRoot, "_workspaces", "system", "voice_capture"));
  const sessionsRoot = path.join(voiceRoot, "sessions");
  const sessionDir = path.resolve(options.sessionDir ?? "");
  await assertInsideExisting(sessionsRoot, sessionDir, "sessionDir");
  const manifestPath = path.join(sessionDir, "session_manifest.json");
  if (!existsSync(manifestPath)) throw new Error("session_manifest.json is required");
  const manifest = JSON.parse((await readStableFile(manifestPath)).toString("utf8"));
  const transcriptRefFromManifest = requireSafeRelativeRef(manifest.transcript?.jsonl_ref, "session transcript jsonl_ref");
  const transcriptPath = path.resolve(repoRoot, transcriptRefFromManifest);
  await assertInsideExisting(sessionDir, transcriptPath, "session transcript");
  if (!existsSync(transcriptPath)) throw new Error("transcript.jsonl is required");
  const transcriptBytes = await readStableFile(transcriptPath);
  const sourceSegments = parseTranscriptJsonl(transcriptBytes.toString("utf8"));
  if (sourceSegments.length !== Number(manifest.transcript?.segment_count)) throw new Error("session transcript segment_count mismatch");
  const projectContextCards = await loadProjectContextCards(options.contextCardPaths ?? [], repoRoot);
  const transcriptRef = toPosix(path.relative(repoRoot, transcriptPath));
  if (transcriptRef.startsWith("../") || path.isAbsolute(transcriptRef)) throw new Error("transcript must use a repo-relative workspace ref");
  const run = buildVoiceSemanticLabelRun({
    recordingId: manifest.recording_id ?? manifest.session_id ?? path.basename(sessionDir),
    transcriptRef,
    transcriptSha256: sha256(transcriptBytes),
    sourceSegments,
    recordingTitle: manifest.source_page_title,
    durationSeconds: manifest.duration_seconds,
    recordedAt: manifest.recorded_at_local,
    evidenceRole: manifest.transcript?.evidence_role ?? "provider_transcript_auxiliary_unverified",
    transcriptQuality: manifest.transcript?.quality ?? "provider_transcript_unverified",
    projectContextCards,
  });
  const summary = buildSafeSemanticSummary(run);
  if (!options.apply) return { applied: false, summary, run };

  const targetDir = path.join(sessionDir, "analysis", "semantic_labels", run.run_id);
  await assertInsideExistingOrFuture(sessionDir, targetDir, "semantic label target");
  const targetPath = path.join(targetDir, "semantic_label_run.json");
  const content = `${JSON.stringify(run, null, 2)}\n`;
  await fs.mkdir(targetDir, { recursive: true });
  if (existsSync(targetPath)) {
    const existing = await fs.readFile(targetPath, "utf8");
    if (existing !== content) throw new Error("existing semantic label run conflicts with deterministic output");
    return { applied: true, duplicate: true, output_ref: toPosix(path.relative(repoRoot, targetPath)), summary, run };
  }
  const temporaryPath = `${targetPath}.tmp-${process.pid}`;
  await fs.writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
  await fs.rename(temporaryPath, targetPath);
  return { applied: true, duplicate: false, output_ref: toPosix(path.relative(repoRoot, targetPath)), summary, run };
}

export async function analyzeVoiceSemanticManifest(options = {}) {
  return analyzeVoiceSemanticManifestInternal(options, null);
}

async function analyzeVoiceSemanticManifestInternal(options = {}, verifiedPairEvidence = null) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const voiceRoot = path.resolve(options.voiceRoot ?? path.join(repoRoot, "_workspaces", "system", "voice_capture"));
  const manifestPath = path.resolve(options.analysisManifestPath ?? "");
  await assertInsideExisting(voiceRoot, manifestPath, "analysisManifestPath");
  if (path.basename(manifestPath) !== "analysis_manifest.json") throw new Error("analysisManifestPath must name analysis_manifest.json");
  const manifestBytes = await readStableFile(manifestPath);
  if (verifiedPairEvidence) {
    verifySemanticManifestPairBinding(manifestBytes, verifiedPairEvidence.receipt, verifiedPairEvidence.lane);
  }
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest.state !== "completed") throw new Error("local ASR analysis manifest must be completed");
  const transcriptRef = requireSafeRelativeRef(manifest.transcript_jsonl_ref, "analysis transcript_jsonl_ref");
  const transcriptPath = path.resolve(repoRoot, transcriptRef);
  await assertInsideExisting(path.dirname(manifestPath), transcriptPath, "analysis transcript");
  const transcriptBytes = await readStableFile(transcriptPath);
  const actualDigest = sha256(transcriptBytes);
  if (actualDigest !== requireSha256(manifest.transcript_sha256, "analysis transcript_sha256")) throw new Error("analysis transcript SHA-256 mismatch");
  const sourceSegments = parseTranscriptJsonl(transcriptBytes.toString("utf8"));
  if (sourceSegments.length !== Number(manifest.segment_count)) throw new Error("analysis transcript segment_count mismatch");
  const projectContextCards = options.projectContextCards
    ?? await loadProjectContextCards(options.contextCardPaths ?? [], repoRoot);
  const run = buildVoiceSemanticLabelRunInternal({
    recordingId: manifest.session_id,
    transcriptRef,
    transcriptSha256: actualDigest,
    sourceSegments,
    recordedAt: manifest.recorded_at_local ?? manifest.completed_at,
    evidenceRole: manifest.evidence_role,
    transcriptQuality: manifest.quality,
    projectContextCards,
  }, verifiedPairEvidence);
  return { applied: false, summary: buildSafeSemanticSummary(run), run, manifest, manifest_bytes: manifestBytes };
}

export function verifySemanticManifestPairBinding(manifestBytes, receipt, lane) {
  if (!Buffer.isBuffer(manifestBytes) && !(manifestBytes instanceof Uint8Array)) {
    throw new Error("verified ASR manifest bytes are required");
  }
  if (!new Set(["fast", "stronger"]).has(lane)) throw new Error("verified ASR pair lane is invalid");
  const expectedDigest = requireSha256(receipt?.[lane]?.manifest_sha256, `${lane} receipt manifest_sha256`);
  if (sha256(manifestBytes) !== expectedDigest) {
    throw new Error(`${lane} analysis manifest changed after ASR pair verification`);
  }
  return true;
}

async function buildVerifiedAsrPairProvenance(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const voiceRoot = path.resolve(repoRoot, "_workspaces", "system", "voice_capture");
  const fastManifestPath = path.resolve(options.fastAnalysisManifestPath ?? "");
  const strongerManifestPath = path.resolve(options.strongerAnalysisManifestPath ?? "");
  for (const manifestPath of [fastManifestPath, strongerManifestPath]) {
    await assertInsideExisting(voiceRoot, manifestPath, "ASR pair manifest");
    if (path.basename(manifestPath) !== "analysis_manifest.json") throw new Error("ASR pair inputs must name analysis_manifest.json");
  }
  const fastSessionDir = path.resolve(path.dirname(fastManifestPath), "../../..");
  const strongerSessionDir = path.resolve(path.dirname(strongerManifestPath), "../../..");
  if (fastSessionDir !== strongerSessionDir) throw new Error("ASR pair manifests must belong to the same session");
  const fastBytes = await readStableFile(fastManifestPath);
  const strongerBytes = await readStableFile(strongerManifestPath);
  const fast = JSON.parse(fastBytes.toString("utf8"));
  const stronger = JSON.parse(strongerBytes.toString("utf8"));
  if (fast.state !== "completed" || stronger.state !== "completed") throw new Error("ASR pair manifests must be completed");
  if (fast.session_id !== stronger.session_id) throw new Error("ASR pair session_id mismatch");
  if (fast.source_audio_ref !== stronger.source_audio_ref) throw new Error("ASR pair source_audio_ref mismatch");
  if (fast.run_id === stronger.run_id) throw new Error("ASR pair run_id values must differ");
  const sourceSha256 = requireSha256(fast.source_sha256, "fast source_sha256");
  if (sourceSha256 !== requireSha256(stronger.source_sha256, "stronger source_sha256")) throw new Error("ASR pair source_sha256 mismatch");
  const sessionManifestPath = path.join(fastSessionDir, "session_manifest.json");
  if (!existsSync(sessionManifestPath)) throw new Error("session_manifest.json is required for ASR pair provenance");
  const sessionManifestBytes = await readStableFile(sessionManifestPath);
  const sessionManifest = JSON.parse(sessionManifestBytes.toString("utf8"));
  if ((sessionManifest.session_id ?? path.basename(fastSessionDir)) !== fast.session_id) throw new Error("ASR pair session manifest identity mismatch");
  const sessionSourceSha256 = requireSha256(sessionManifest.source_sha256 ?? sessionManifest.audio?.sha256, "session source_sha256");
  if (sessionSourceSha256 !== sourceSha256) throw new Error("ASR pair source hash does not match the session manifest");
  const sourceAudioRef = requireSafeRelativeRef(sessionManifest.audio?.ref, "session source audio ref");
  if (sourceAudioRef !== requireSafeRelativeRef(fast.source_audio_ref, "fast source_audio_ref")) throw new Error("ASR pair source audio ref does not match the session manifest");
  const sourceAudioPath = path.resolve(repoRoot, sourceAudioRef);
  await assertInsideExisting(fastSessionDir, sourceAudioPath, "ASR pair source audio");
  if (await hashFileStream(sourceAudioPath, "sha256") !== sourceSha256) throw new Error("ASR pair actual source audio SHA-256 mismatch");
  assertAsrManifestLane(fast, {
    label: "fast",
    modelId: FAST_MODEL_ID,
    evidenceRole: FAST_EVIDENCE_ROLE,
  });
  assertAsrManifestLane(stronger, {
    label: "stronger",
    modelId: STRONG_MODEL_ID,
    evidenceRole: "independent_machine_transcript_stronger_unverified",
  });
  const fastModelPath = await resolveVerifiedModelPath(repoRoot, fast.model_ref, "fast model_ref", options.allowedExternalModelRoots);
  const strongerModelPath = await resolveVerifiedModelPath(repoRoot, stronger.model_ref, "stronger model_ref", options.allowedExternalModelRoots);
  const fastModelSha1 = requireSha1(fast.model_sha1, "fast model_sha1");
  const strongerModelSha1 = requireSha1(stronger.model_sha1, "stronger model_sha1");
  if (await hashFileStream(fastModelPath, "sha1") !== fastModelSha1) throw new Error("fast ASR model SHA-1 mismatch");
  if (await hashFileStream(strongerModelPath, "sha1") !== strongerModelSha1) throw new Error("stronger ASR model SHA-1 mismatch");
  const fastModelSha256 = await hashFileStream(fastModelPath, "sha256");
  const strongerModelSha256 = await hashFileStream(strongerModelPath, "sha256");
  if (fastModelSha256 !== FAST_MODEL_SHA256) throw new Error("fast ASR model is not the approved turbo artifact");
  if (strongerModelSha256 !== STRONG_MODEL_SHA256) throw new Error("stronger ASR model is not the approved large-v3 artifact");
  const fastExecution = await verifyLocalAsrExecutionArtifacts(fastManifestPath, fast);
  const strongerExecution = await verifyLocalAsrExecutionArtifacts(strongerManifestPath, stronger);
  const receiptBody = {
    schema_version: "soulforge.voice_asr_pair_provenance.v1",
    session_id: requireSafeId(fast.session_id, "ASR pair session_id"),
    session_manifest_sha256: sha256(sessionManifestBytes),
    source_sha256: sourceSha256,
    source_audio_hash_verified: true,
    fast: {
      manifest_sha256: sha256(fastBytes),
      run_id: requireSafeId(fast.run_id, "fast run_id"),
      engine: fast.engine,
      model_id: fast.model_id,
      model_sha1: fastModelSha1,
      model_sha256: fastModelSha256,
      transcript_sha256: requireSha256(fast.transcript_sha256, "fast transcript_sha256"),
      execution_artifact_set_sha256: fastExecution.execution_artifact_set_sha256,
      transcript_reconstruction_verified: true,
    },
    stronger: {
      manifest_sha256: sha256(strongerBytes),
      run_id: requireSafeId(stronger.run_id, "stronger run_id"),
      engine: stronger.engine,
      model_id: stronger.model_id,
      model_sha1: strongerModelSha1,
      model_sha256: strongerModelSha256,
      transcript_sha256: requireSha256(stronger.transcript_sha256, "stronger transcript_sha256"),
      execution_artifact_set_sha256: strongerExecution.execution_artifact_set_sha256,
      transcript_reconstruction_verified: true,
    },
    verification_state: "source_model_transcript_and_execution_artifacts_verified",
    execution_attestation_state: "local_artifact_chain_not_hardware_attested",
  };
  return {
    ...receiptBody,
    receipt_id: `vap_${sha256(stableStringify(receiptBody)).slice(0, 24)}`,
  };
}

function assertAsrManifestLane(manifest, expected) {
  if (manifest.engine !== "whisper.cpp") throw new Error(`${expected.label} ASR engine must be whisper.cpp`);
  if (manifest.model_id !== expected.modelId) throw new Error(`${expected.label} ASR model_id mismatch`);
  if (manifest.evidence_role !== expected.evidenceRole) throw new Error(`${expected.label} ASR evidence_role mismatch`);
  requireSafeId(manifest.run_id, `${expected.label} run_id`);
}

async function resolveVerifiedModelPath(repoRoot, modelRef, name, allowedExternalModelRoots = []) {
  const value = String(modelRef ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  const modelPath = path.resolve(repoRoot, value);
  if (!existsSync(modelPath)) throw new Error(`${name} does not exist`);
  const allowedRoots = [
    path.resolve(repoRoot, "_workspaces", "system", "voice_capture", "models"),
    ...allowedExternalModelRoots.map((root) => path.resolve(root)),
  ];
  const allowedRoot = allowedRoots.find((root) => isInside(root, modelPath));
  if (!allowedRoot) throw new Error(`${name} is outside approved model custody`);
  await assertInsideExisting(allowedRoot, modelPath, name);
  return modelPath;
}

export async function verifyLocalAsrExecutionArtifacts(manifestPath, manifest) {
  const outputDir = path.dirname(manifestPath);
  const chunksDir = path.join(outputDir, "chunks");
  await assertInsideExisting(outputDir, chunksDir, "local ASR chunks directory");
  const chunkCount = Number(manifest.chunk_count);
  if (!Number.isSafeInteger(chunkCount) || chunkCount <= 0) throw new Error("local ASR chunk_count must be a positive integer");
  const expectedArtifactNames = new Set();
  for (let index = 1; index <= chunkCount; index += 1) {
    const stem = `chunk_${String(index).padStart(5, "0")}`;
    for (const suffix of [".json", ".complete.json", ".txt", ".srt"]) expectedArtifactNames.add(`${stem}${suffix}`);
  }
  const observedEntries = await fs.readdir(chunksDir, { withFileTypes: true });
  const unexpectedEntries = observedEntries.filter((entry) => !entry.isFile() || !expectedArtifactNames.has(entry.name));
  const observedNames = new Set(observedEntries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  const missingNames = [...expectedArtifactNames].filter((name) => !observedNames.has(name));
  if (unexpectedEntries.length > 0 || missingNames.length > 0 || observedNames.size !== expectedArtifactNames.size) throw new Error("local ASR chunk artifact set does not exactly match manifest chunk_count");
  const artifactRows = [];
  const segments = [];
  for (let index = 1; index <= chunkCount; index += 1) {
    const stem = `chunk_${String(index).padStart(5, "0")}`;
    const outputPath = path.join(chunksDir, `${stem}.json`);
    const receiptPath = path.join(chunksDir, `${stem}.complete.json`);
    const textPath = path.join(chunksDir, `${stem}.txt`);
    const srtPath = path.join(chunksDir, `${stem}.srt`);
    await assertInsideExisting(chunksDir, outputPath, "local ASR chunk output");
    await assertInsideExisting(chunksDir, receiptPath, "local ASR chunk receipt");
    await assertInsideExisting(chunksDir, textPath, "local ASR chunk text artifact");
    await assertInsideExisting(chunksDir, srtPath, "local ASR chunk subtitle artifact");
    const outputBytes = await readStableFile(outputPath);
    const receiptBytes = await readStableFile(receiptPath);
    const parsed = JSON.parse(outputBytes.toString("utf8"));
    const receipt = JSON.parse(receiptBytes.toString("utf8"));
    if (receipt.schema_version !== "soulforge.local_asr_chunk_receipt.v0" || receipt.chunk_index !== index) throw new Error(`local ASR chunk receipt identity mismatch: ${index}`);
    if (!receipt.window || ![receipt.window.nominal_start_seconds, receipt.window.nominal_end_seconds, receipt.window.extract_start_seconds, receipt.window.extract_duration_seconds].every(Number.isFinite)) throw new Error(`local ASR chunk receipt has invalid window: ${index}`);
    const transcriptionCount = Array.isArray(parsed.transcription) ? parsed.transcription.length : 0;
    if (receipt.segment_count !== transcriptionCount) throw new Error(`local ASR chunk receipt segment_count mismatch: ${index}`);
    segments.push(...parseWhisperJson(parsed, receipt.window, { runId: manifest.run_id }));
    artifactRows.push({
      chunk_index: index,
      output_sha256: sha256(outputBytes),
      receipt_sha256: sha256(receiptBytes),
      text_sha256: await hashFileStream(textPath, "sha256"),
      srt_sha256: await hashFileStream(srtPath, "sha256"),
    });
  }
  segments.sort((left, right) => left.start_seconds - right.start_seconds || left.end_seconds - right.end_seconds);
  const filtered = suppressRepetitiveSegments(segments, manifest.repetition_filter);
  filtered.kept.forEach((segment, index) => { segment.segment_id = index + 1; });
  const reconstructedJsonl = filtered.kept.length > 0
    ? `${filtered.kept.map((segment) => JSON.stringify(segment)).join("\n")}\n`
    : "";
  if (sha256(reconstructedJsonl) !== requireSha256(manifest.transcript_sha256, "local ASR transcript_sha256")) throw new Error("local ASR transcript cannot be reconstructed from chunk artifacts");
  if (filtered.kept.length !== Number(manifest.segment_count)) throw new Error("local ASR reconstructed segment_count mismatch");
  return {
    execution_artifact_set_sha256: sha256(stableStringify(artifactRows)),
  };
}

export async function compareVoiceSemanticManifests(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const projectContextCards = deepFreeze(await loadProjectContextCards(options.contextCardPaths ?? [], repoRoot));
  const provenance = await buildVerifiedAsrPairProvenance({
    repoRoot,
    fastAnalysisManifestPath: options.fastAnalysisManifestPath,
    strongerAnalysisManifestPath: options.strongerAnalysisManifestPath,
    allowedExternalModelRoots: options.allowedExternalModelRoots,
  });
  const fast = await analyzeVoiceSemanticManifestInternal({
    repoRoot,
    analysisManifestPath: options.fastAnalysisManifestPath,
    projectContextCards,
  }, { token: VERIFIED_ASR_PAIR_EVIDENCE, lane: "fast", receipt: provenance });
  const stronger = await analyzeVoiceSemanticManifestInternal({
    repoRoot,
    analysisManifestPath: options.strongerAnalysisManifestPath,
    projectContextCards,
  }, { token: VERIFIED_ASR_PAIR_EVIDENCE, lane: "stronger", receipt: provenance });
  const comparison = compareVoiceSemanticRuns(fast.run, stronger.run);
  const semanticSummary = buildComparisonGatedSemanticSummary(stronger.run, comparison);
  return {
    applied: false,
    summary: buildSafeComparisonSummary(comparison),
    semantic_summary: semanticSummary,
    semantic_run: comparison.human_review_windows.length === 0 ? stronger.run : null,
    comparison,
    provenance,
  };
}

export function buildComparisonGatedSemanticSummary(strongerRun, comparison) {
  const strongerBrand = getVerifiedRunBrand(strongerRun, "stronger");
  const comparisonBrand = getVerifiedComparisonBrand(comparison);
  if (!strongerBrand || !comparisonBrand) {
    throw new Error("semantic summary requires an artifact-verified manifest comparison");
  }
  if (strongerBrand.pair_receipt_id !== comparisonBrand.pair_receipt_id
    || strongerBrand.digest !== comparisonBrand.stronger_run_digest) {
    throw new Error("semantic summary comparison/run provenance mismatch");
  }
  if (comparison.stronger_run_id !== strongerRun.run_id || comparison.recording_id !== strongerRun.recording_ref?.recording_id) {
    throw new Error("semantic summary comparison/run identity mismatch");
  }
  const summary = buildSafeSemanticSummary(strongerRun);
  const blockedUnitRefs = new Set(comparison.human_review_windows.flatMap((window) => window.source_unit_refs));
  const unblockedCandidates = strongerRun.action_candidates.filter((candidate) => !blockedUnitRefs.has(candidate.source_unit_ref));
  const blockedActionCandidateCount = strongerRun.action_candidates.length - unblockedCandidates.length;
  const unblockedProjectRefs = new Set(strongerRun.segment_labels
    .filter((row) => !blockedUnitRefs.has(row.unit_id))
    .flatMap((row) => row.project_match.candidates.map((candidate) => candidate.project_ref)));
  return {
    ...summary,
    action_candidate_count: unblockedCandidates.length,
    action_candidate_kinds: countBy(unblockedCandidates.map((candidate) => candidate.candidate_kind)),
    unresolved_action_candidate_count: unblockedCandidates.filter((candidate) => candidate.unresolved_fields.length > 0).length,
    project_candidate_count: unblockedProjectRefs.size,
    blocked_action_candidate_count: blockedActionCandidateCount,
    blocked_project_candidate_count: Math.max(summary.project_candidate_count - unblockedProjectRefs.size, 0),
    comparison_gate_state: comparison.human_review_windows.length > 0 ? "material_conflict_blocked" : "pair_agreed",
  };
}

export async function prepareVoiceSemanticReviewClips(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const fastManifestPath = path.resolve(options.fastAnalysisManifestPath ?? "");
  const strongerManifestPath = path.resolve(options.strongerAnalysisManifestPath ?? "");
  const result = await compareVoiceSemanticManifests({
    repoRoot,
    fastAnalysisManifestPath: fastManifestPath,
    strongerAnalysisManifestPath: strongerManifestPath,
    contextCardPaths: options.contextCardPaths,
    allowedExternalModelRoots: options.allowedExternalModelRoots,
  });
  const sessionDir = path.resolve(path.dirname(fastManifestPath), "../../..");
  const strongerSessionDir = path.resolve(path.dirname(strongerManifestPath), "../../..");
  if (sessionDir !== strongerSessionDir) throw new Error("ASR comparison manifests must belong to the same session");
  return prepareVoiceSemanticReviewClipsFromComparison({
    ...options,
    repoRoot,
    sessionDir,
    comparison: result.comparison,
  });
}

export async function prepareVoiceSemanticReviewClipsFromComparison(options = {}) {
  const comparisonBrand = getVerifiedComparisonBrand(options.comparison);
  if (!comparisonBrand) {
    throw new Error("review audio requires an artifact-verified manifest comparison");
  }
  return prepareVoiceSemanticReviewClipsFromComparisonInternal({
    ...options,
    verifiedSourceBinding: {
      session_manifest_sha256: comparisonBrand.session_manifest_sha256,
      source_sha256: comparisonBrand.source_sha256,
    },
  });
}

export async function prepareVoiceSemanticReviewClipsFromUntrustedComparisonInTemp(options = {}) {
  await assertTemporaryRepoRoot(options.repoRoot);
  return prepareVoiceSemanticReviewClipsFromComparisonInternal({ ...options, allowTemporaryTestHooks: true });
}

async function prepareVoiceSemanticReviewClipsFromComparisonInternal(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const sessionDir = path.resolve(options.sessionDir ?? "");
  const sessionsRoot = path.resolve(repoRoot, "_workspaces", "system", "voice_capture", "sessions");
  await assertInsideExisting(sessionsRoot, sessionDir, "semantic review sessionDir");
  const comparison = options.comparison;
  if (comparison?.schema_version !== "soulforge.voice_semantic_asr_comparison.v1") throw new Error("a semantic ASR comparison is required");
  const comparisonValidation = validateVoiceSemanticComparison(comparison);
  if (!comparisonValidation.ok) throw new Error(`semantic ASR comparison is invalid: ${comparisonValidation.errors.join("; ")}`);
  if (comparison.recording_id !== path.basename(sessionDir)) throw new Error("semantic comparison recording_id must match the session");
  const sessionManifestPath = path.join(sessionDir, "session_manifest.json");
  if (!existsSync(sessionManifestPath)) throw new Error("session_manifest.json is required for review audio");
  const sessionManifestBytes = await readStableFile(sessionManifestPath);
  const sessionManifest = JSON.parse(sessionManifestBytes.toString("utf8"));
  const audioRef = requireSafeRelativeRef(sessionManifest.audio?.ref, "session audio ref");
  const audioPath = path.resolve(repoRoot, audioRef);
  await assertInsideExisting(sessionDir, audioPath, "session audio");
  const declaredAudioSha256 = requireSha256(sessionManifest.source_sha256 ?? sessionManifest.audio?.sha256, "session source audio sha256");
  const observedAudioSha256 = await hashFileStream(audioPath, "sha256");
  if (observedAudioSha256 !== declaredAudioSha256) throw new Error("session source audio SHA-256 mismatch");
  if (options.verifiedSourceBinding) {
    verifySemanticReviewSourceBinding({
      sessionManifestBytes,
      declaredAudioSha256,
      observedAudioSha256,
      binding: options.verifiedSourceBinding,
    });
  }
  const outputDir = path.join(sessionDir, "analysis", "semantic_review_audio", comparison.comparison_id);
  await assertInsideExistingOrFuture(sessionDir, outputDir, "semantic review audio output");
  const clips = comparison.human_review_windows.map((window) => {
    const start = Number(window.start_seconds);
    const duration = Number(window.duration_seconds);
    const end = roundMillis(start + duration);
    if (!Number.isFinite(start) || !Number.isFinite(duration) || start < 0 || duration < 30 || duration > 90) throw new Error(`review window ${window.window_id} must be bounded to 30–90 seconds`);
    return {
      window_id: window.window_id,
      start_seconds: start,
      end_seconds: end,
      duration_seconds: roundMillis(duration),
      reason_codes: window.importance_reason_codes,
      clip_ref: toPosix(path.relative(repoRoot, path.join(outputDir, `${window.window_id}.wav`))),
    };
  });
  const plan = {
    schema_version: "soulforge.voice_semantic_review_clip_plan.v1",
    comparison_id: comparison.comparison_id,
    recording_id: comparison.recording_id,
    source_audio_sha256: observedAudioSha256,
    clip_count: clips.length,
    clips,
    boundaries: {
      maximum_clip_seconds: 90,
      transcript_body_copied: false,
      full_recording_review_requested: false,
      official_task_mutated: false,
    },
  };
  if (!options.apply || clips.length === 0) return { applied: false, plan };

  const ffmpegBinary = String(options.ffmpegBinary ?? "").trim();
  if (!path.isAbsolute(ffmpegBinary) || !existsSync(ffmpegBinary)) throw new Error("an existing absolute ffmpegBinary is required");
  await fs.mkdir(outputDir, { recursive: true });
  const manifestPath = path.join(outputDir, "review_clip_manifest.json");
  if (existsSync(manifestPath)) {
    const existing = JSON.parse((await readStableFile(manifestPath)).toString("utf8"));
    if (!reviewClipManifestMatchesPlan(existing, plan)) throw new Error("existing review clip manifest conflicts");
    for (const clip of existing.clips) {
      const clipPath = path.resolve(repoRoot, requireSafeRelativeRef(clip.clip_ref, "existing review clip ref"));
      await assertInsideExisting(outputDir, clipPath, "existing semantic review clip");
      if (sha256(await fs.readFile(clipPath)) !== requireSha256(clip.sha256, "existing review clip sha256")) throw new Error(`existing review clip hash mismatch: ${clip.window_id}`);
    }
    return { applied: true, duplicate: true, manifest_ref: toPosix(path.relative(repoRoot, manifestPath)), plan: existing };
  }
  const completedClips = [];
  let wroteNewClip = false;
  for (const clip of clips) {
    const targetPath = path.resolve(repoRoot, clip.clip_ref);
    await assertInsideExistingOrFuture(outputDir, targetPath, "semantic review clip");
    const temporaryPath = `${targetPath}.tmp-${process.pid}.wav`;
    const ffmpegArgs = [
      "-v", "error", "-y",
      "-i", "pipe:0",
      "-filter_complex",
      `[0:a]asplit=2[full_verify][clip_source];[clip_source]atrim=start=${clip.start_seconds}:duration=${clip.duration_seconds},asetpts=PTS-STARTPTS[clip_out]`,
      "-map", "[clip_out]",
      "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", temporaryPath,
      "-map", "[full_verify]", "-f", "null", "pipe:1",
    ];
    try {
      await runVerifiedFfmpegClip({
        ffmpegBinary,
        ffmpegArgs,
        audioPath,
        expectedSourceSha256: observedAudioSha256,
        temporaryPath,
        cwd: repoRoot,
        commandRunner: options.commandRunner,
      });
      const bytes = await fs.readFile(temporaryPath);
      const digest = sha256(bytes);
      if (existsSync(targetPath)) {
        const existingDigest = sha256(await fs.readFile(targetPath));
        if (existingDigest !== digest) throw new Error(`existing review clip conflicts: ${clip.window_id}`);
      } else {
        await fs.rename(temporaryPath, targetPath);
        wroteNewClip = true;
      }
      completedClips.push({ ...clip, sha256: digest, size_bytes: bytes.length });
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
  }
  const manifest = {
    ...plan,
    schema_version: "soulforge.voice_semantic_review_clip_manifest.v1",
    clips: completedClips,
    created_at: new Date().toISOString(),
  };
  await atomicWriteJson(manifestPath, manifest, options.allowTemporaryTestHooks ? options.beforeManifestRename : null);
  return {
    applied: true,
    duplicate: !wroteNewClip,
    manifest_ref: toPosix(path.relative(repoRoot, manifestPath)),
    plan: manifest,
  };
}

async function runVerifiedFfmpegClip({ ffmpegBinary, ffmpegArgs, audioPath, expectedSourceSha256, temporaryPath, cwd, commandRunner }) {
  const expectedDigest = requireSha256(expectedSourceSha256, "verified ffmpeg source SHA-256");
  if (commandRunner) {
    const sourceBytes = await readStableFile(audioPath);
    if (sha256(sourceBytes) !== expectedDigest) throw new Error("review source audio changed before verified ffmpeg input");
    await Promise.resolve(commandRunner(ffmpegBinary, ffmpegArgs, {
      cwd,
      label: "bounded semantic audio review clip",
      input: sourceBytes,
      input_sha256: expectedDigest,
    }));
    return;
  }

  const consumedHash = crypto.createHash("sha256");
  const hashingPassThrough = new Transform({
    transform(chunk, encoding, callback) {
      consumedHash.update(chunk);
      callback(null, chunk);
    },
  });
  const child = spawn(ffmpegBinary, ffmpegArgs, {
    cwd,
    windowsHide: true,
    stdio: ["pipe", "ignore", "pipe"],
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (status) => {
      if (status === 0) resolve();
      else reject(new Error(`bounded semantic audio review clip failed with status ${status ?? "unknown"}: ${stderr}`));
    });
  });
  try {
    await Promise.all([
      pipeline(createReadStream(audioPath), hashingPassThrough, child.stdin),
      completion,
    ]);
    if (consumedHash.digest("hex") !== expectedDigest) {
      throw new Error("review source audio changed while streaming verified ffmpeg input");
    }
  } catch (error) {
    if (!child.killed) child.kill();
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

export function compareVoiceSemanticRuns(fastRun, strongerRun) {
  const fastBrand = getVerifiedRunBrand(fastRun, "fast");
  if (!fastBrand) throw new Error("fast semantic run object is not artifact-verified; use compareVoiceSemanticManifests");
  const strongerBrand = getVerifiedRunBrand(strongerRun, "stronger");
  if (!hasVerifiedStrongRunBrand(strongerRun)) throw new Error("strong semantic run object is not artifact-verified; use compareVoiceSemanticManifests");
  if (fastBrand.pair_receipt_id !== strongerBrand.pair_receipt_id) throw new Error("fast and strong semantic runs are not from the same verified ASR pair");
  if (fastBrand.source_sha256 !== strongerBrand.source_sha256
    || fastBrand.session_manifest_sha256 !== strongerBrand.session_manifest_sha256) {
    throw new Error("fast and strong semantic runs do not share the same verified source binding");
  }
  const comparison = compareVoiceSemanticRunsInternal(fastRun, strongerRun, false);
  deepFreeze(comparison);
  VERIFIED_COMPARISONS.set(comparison, {
    digest: sha256(stableStringify(comparison)),
    pair_receipt_id: fastBrand.pair_receipt_id,
    fast_run_digest: fastBrand.digest,
    stronger_run_digest: strongerBrand.digest,
    source_sha256: fastBrand.source_sha256,
    session_manifest_sha256: fastBrand.session_manifest_sha256,
  });
  return comparison;
}

export function compareVoiceSemanticRunsUntrusted(fastRun, strongerRun) {
  return compareVoiceSemanticRunsInternal(fastRun, strongerRun, true);
}

function compareVoiceSemanticRunsInternal(fastRun, strongerRun, allowUnverifiedStrong) {
  const fastValidation = validateVoiceSemanticLabelRunInternal(fastRun, false);
  if (!fastValidation.ok) throw new Error(`fast semantic run is invalid: ${fastValidation.errors.join("; ")}`);
  const strongerValidation = validateVoiceSemanticLabelRunInternal(strongerRun, allowUnverifiedStrong);
  if (!strongerValidation.ok) throw new Error(`stronger semantic run is invalid: ${strongerValidation.errors.join("; ")}`);
  if (fastRun?.recording_ref?.recording_id !== strongerRun?.recording_ref?.recording_id) throw new Error("ASR comparison recording_id mismatch");
  if (fastRun?.evidence_gate?.input_class !== "independent_asr_fast") throw new Error("fast run must use independent_asr_fast evidence");
  if (strongerRun?.evidence_gate?.input_class !== "independent_asr_stronger") throw new Error("stronger run must use independent_asr_stronger evidence");
  const recordingId = fastRun.recording_ref.recording_id;
  const fastRows = materialLabelRows(fastRun.segment_labels);
  const strongerRows = materialLabelRows(strongerRun.segment_labels);
  const disagreements = [];
  const matchedStronger = new Set();

  for (const fastRow of fastRows) {
    const matches = strongerRows.filter((row) => timeRangesRelated(fastRow, row, 2));
    matches.forEach((row) => matchedStronger.add(row.unit_id));
    const reasons = compareMaterialRows(fastRow, matches, fastRun.segment_labels, strongerRun.segment_labels);
    if (reasons.length > 0) disagreements.push(buildComparisonWindow(recordingId, [fastRow], matches, reasons));
  }
  for (const strongerRow of strongerRows) {
    if (matchedStronger.has(strongerRow.unit_id)) continue;
    disagreements.push(buildComparisonWindow(recordingId, [], [strongerRow], ["stronger_material_window_missing_in_fast_asr"]));
  }
  const uniqueDisagreements = dedupeBy(disagreements, (row) => row.window_id);
  const humanReviewWindows = uniqueDisagreements;
  const state = humanReviewWindows.length > 0 ? "human_audio_review_required" : "shadow_reviewable";
  const comparison = {
    schema_version: "soulforge.voice_semantic_asr_comparison.v1",
    comparison_id: `vsc_${sha256(`${recordingId}\n${fastRun.run_id}\n${strongerRun.run_id}`).slice(0, 24)}`,
    recording_id: recordingId,
    fast_run_id: fastRun.run_id,
    stronger_run_id: strongerRun.run_id,
    fast_material_unit_count: fastRows.length,
    stronger_material_unit_count: strongerRows.length,
    disagreement_count: uniqueDisagreements.length,
    state,
    human_review_windows: humanReviewWindows,
    boundaries: {
      transcript_body_copied: false,
      provider_transcript_used: false,
      trivial_ambiguity_escalated: false,
      official_task_mutated: false,
    },
  };
  const validation = validateVoiceSemanticComparison(comparison);
  if (!validation.ok) throw new Error(`semantic ASR comparison validation failed: ${validation.errors.join("; ")}`);
  return comparison;
}

export function validateVoiceSemanticComparison(comparison) {
  const errors = [];
  if (!comparison || typeof comparison !== "object" || Array.isArray(comparison)) return { ok: false, errors: ["comparison must be an object"] };
  if (!validateSemanticAsrComparisonSchema(comparison)) {
    for (const error of validateSemanticAsrComparisonSchema.errors ?? []) {
      errors.push(`schema ${error.instancePath || "/"} ${error.keyword}`);
    }
  }
  const windows = Array.isArray(comparison.human_review_windows) ? comparison.human_review_windows : [];
  if (!Array.isArray(comparison.human_review_windows)) errors.push("human_review_windows must be an array");
  if (!Number.isSafeInteger(comparison.disagreement_count) || comparison.disagreement_count < 0) errors.push("disagreement_count must be a non-negative integer");
  if (comparison.disagreement_count !== windows.length) errors.push("disagreement_count must equal human review window count");
  if (comparison.state === "shadow_reviewable" && (comparison.disagreement_count !== 0 || windows.length !== 0)) errors.push("shadow_reviewable comparison cannot contain disagreements");
  if (comparison.state === "human_audio_review_required" && (comparison.disagreement_count < 1 || windows.length < 1)) errors.push("human_audio_review_required comparison needs at least one disagreement");
  if (!["shadow_reviewable", "human_audio_review_required"].includes(comparison.state)) errors.push("comparison state is invalid");
  for (const window of windows) {
    const start = Number(window.start_seconds);
    const duration = Number(window.duration_seconds);
    if (![start, duration].every(Number.isFinite)) errors.push(`comparison window ${window.window_id ?? "unknown"} must have finite start and duration`);
    else if (start < 0 || duration <= 0 || duration > 90) errors.push(`comparison window ${window.window_id ?? "unknown"} must be bounded to 1-90 seconds`);
    if (window.human_listen_required !== true || window.escalation_state !== "human_audio_review_required") errors.push(`comparison window ${window.window_id ?? "unknown"} must require bounded human review`);
    if (window.transcript_text_copied !== false) errors.push(`comparison window ${window.window_id ?? "unknown"} copies transcript body`);
  }
  if (comparison.boundaries?.transcript_body_copied !== false) errors.push("comparison transcript body boundary must be false");
  if (comparison.boundaries?.provider_transcript_used !== false) errors.push("comparison provider transcript boundary must be false");
  if (comparison.boundaries?.trivial_ambiguity_escalated !== false) errors.push("comparison trivial ambiguity boundary must be false");
  if (comparison.boundaries?.official_task_mutated !== false) errors.push("comparison official task boundary must be false");
  return { ok: errors.length === 0, errors: uniqueSorted(errors) };
}

function reviewClipManifestMatchesPlan(existing, plan) {
  if (existing?.comparison_id !== plan.comparison_id
    || existing.recording_id !== plan.recording_id
    || existing.source_audio_sha256 !== plan.source_audio_sha256
    || existing.clip_count !== plan.clip_count
    || !Array.isArray(existing.clips)
    || existing.clips.length !== plan.clips.length) return false;
  const expectedById = new Map(plan.clips.map((clip) => [clip.window_id, clip]));
  return existing.clips.every((clip) => {
    const expected = expectedById.get(clip.window_id);
    return expected
      && clip.start_seconds === expected.start_seconds
      && clip.end_seconds === expected.end_seconds
      && clip.duration_seconds === expected.duration_seconds
      && clip.clip_ref === expected.clip_ref
      && sameStringSet(clip.reason_codes ?? [], expected.reason_codes ?? []);
  });
}

export function buildSafeComparisonSummary(comparison) {
  if (!hasVerifiedComparisonBrand(comparison)) throw new Error("comparison summary requires an artifact-verified manifest comparison");
  const validation = validateVoiceSemanticComparison(comparison);
  if (!validation.ok) throw new Error(`semantic ASR comparison is invalid: ${validation.errors.join("; ")}`);
  return {
    schema_version: "soulforge.voice_semantic_asr_comparison_summary.v1",
    comparison_id: comparison.comparison_id,
    recording_id: comparison.recording_id,
    fast_material_unit_count: comparison.fast_material_unit_count,
    stronger_material_unit_count: comparison.stronger_material_unit_count,
    disagreement_count: comparison.disagreement_count,
    state: comparison.state,
    human_listen_window_count: comparison.human_review_windows.length,
    boundaries: comparison.boundaries,
  };
}

export async function auditVoiceSemanticLibrary(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const voiceRoot = path.resolve(options.voiceRoot ?? path.join(repoRoot, "_workspaces", "system", "voice_capture"));
  const sessionsRoot = path.join(voiceRoot, "sessions");
  await assertInsideExisting(voiceRoot, sessionsRoot, "sessions root");
  const maxSessions = positiveInteger(options.maxSessions, 50);
  const manifests = (await findNamedFiles(sessionsRoot, "session_manifest.json"))
    .sort((left, right) => right.localeCompare(left))
    .slice(0, maxSessions);
  const aggregate = {
    schema_version: "soulforge.voice_semantic_library_audit.v1",
    applied: false,
    requested_session_limit: maxSessions,
    inspected_sessions: 0,
    failed_sessions: 0,
    source_segments: 0,
    semantic_units: 0,
    action_candidates: 0,
    unresolved_action_candidates: 0,
    unlabeled_semantic_units: 0,
    recording_types: {},
    candidate_kinds: {},
    project_resolution_states: {},
    failure_codes: {},
    claim_ceiling: "observed_private_aggregate",
  };
  for (const manifestPath of manifests) {
    try {
      const result = await analyzeVoiceSemanticSession({
        repoRoot,
        voiceRoot,
        sessionDir: path.dirname(manifestPath),
        contextCardPaths: options.contextCardPaths,
        apply: false,
      });
      const { summary } = result;
      aggregate.inspected_sessions += 1;
      aggregate.source_segments += summary.source_segment_count;
      aggregate.semantic_units += summary.semantic_unit_count;
      aggregate.action_candidates += summary.action_candidate_count;
      aggregate.unresolved_action_candidates += summary.unresolved_action_candidate_count;
      aggregate.unlabeled_semantic_units += summary.unlabeled_semantic_unit_count;
      increment(aggregate.recording_types, summary.recording_type);
      increment(aggregate.project_resolution_states, summary.project_resolution_state);
      for (const [kind, count] of Object.entries(summary.action_candidate_kinds)) increment(aggregate.candidate_kinds, kind, count);
    } catch (error) {
      aggregate.failed_sessions += 1;
      increment(aggregate.failure_codes, classifyFailure(error));
    }
  }
  aggregate.coverage_complete = aggregate.unlabeled_semantic_units === 0;
  return aggregate;
}

export function buildSafeSemanticSummary(run) {
  const validation = validateVoiceSemanticLabelRun(run);
  if (!validation.ok) throw new Error(`semantic label run is invalid: ${validation.errors.join("; ")}`);
  return {
    schema_version: "soulforge.voice_semantic_label_summary.v1",
    run_id: run.run_id,
    recording_id: run.recording_ref.recording_id,
    engine_version: run.engine.engine_version,
    recording_type: run.recording_classification.type_candidate,
    source_segment_count: run.coverage.source_segment_count,
    semantic_unit_count: run.coverage.semantic_unit_count,
    unlabeled_semantic_unit_count: run.coverage.unlabeled_semantic_unit_count,
    action_candidate_count: run.action_candidates.length,
    action_candidate_kinds: countBy(run.action_candidates.map((item) => item.candidate_kind)),
    unresolved_action_candidate_count: run.action_candidates.filter((item) => item.unresolved_fields.length > 0).length,
    project_resolution_state: run.project_resolution.state,
    project_candidate_count: run.project_resolution.candidates.length,
    evidence_gate_state: run.evidence_gate.state,
    evidence_input_class: run.evidence_gate.input_class,
    material_review_window_count: run.review_windows.length,
    human_listen_window_count: run.review_windows.filter((item) => item.human_listen_required).length,
    context_gap_count: run.context.missing_context_kinds.length,
    boundaries: run.boundaries,
  };
}

export function validateVoiceSemanticLabelRun(run) {
  return validateVoiceSemanticLabelRunInternal(run, false);
}

function validateVoiceSemanticLabelRunInternal(run, allowUnverifiedStrong) {
  const errors = [];
  if (!run || typeof run !== "object" || Array.isArray(run)) return { ok: false, errors: ["run must be an object"] };
  if (!validateSemanticLabelRunSchema(run)) {
    for (const error of validateSemanticLabelRunSchema.errors ?? []) {
      errors.push(`schema ${error.instancePath || "/"} ${error.keyword}`);
    }
  }
  if (run.schema_version !== semanticLabelRunSchemaVersion) errors.push("schema_version mismatch");
  if (!/^vsl_[a-f0-9]{24}$/u.test(String(run.run_id ?? ""))) errors.push("run_id is invalid");
  if (!Array.isArray(run.segment_labels) || run.segment_labels.length === 0) errors.push("segment_labels must not be empty");
  if (!Array.isArray(run.action_candidates)) errors.push("action_candidates must be an array");
  if (!run.evidence_gate || typeof run.evidence_gate !== "object") errors.push("evidence_gate is required");
  if (!Array.isArray(run.review_windows)) errors.push("review_windows must be an array");
  const unitIds = new Set();
  for (const row of run.segment_labels ?? []) {
    if (!/^unit_[0-9]+_[0-9]+$/u.test(String(row.unit_id ?? ""))) errors.push("segment unit_id is invalid");
    if (unitIds.has(row.unit_id)) errors.push(`duplicate unit_id ${row.unit_id}`);
    unitIds.add(row.unit_id);
    if (!Array.isArray(row.speech_acts) || row.speech_acts.length === 0) errors.push(`unit ${row.unit_id} has no speech act`);
    for (const act of row.speech_acts ?? []) if (!ALLOWED_SPEECH_ACTS.has(act)) errors.push(`unit ${row.unit_id} has unknown speech act ${act}`);
    for (const code of row.action_codes ?? []) if (!ALLOWED_ACTION_CODES.has(code)) errors.push(`unit ${row.unit_id} has unknown action code ${code}`);
    if (containsSecretLikeValue(row.speaker_label)) errors.push(`unit ${row.unit_id} contains a secret-like speaker label`);
    if (Object.hasOwn(row, "text") || Object.hasOwn(row, "content")) errors.push(`unit ${row.unit_id} copies transcript body`);
  }
  const candidateIds = new Set();
  for (const candidate of run.action_candidates ?? []) {
    if (!/^vac_[a-f0-9]{24}$/u.test(String(candidate.candidate_id ?? ""))) errors.push("candidate_id is invalid");
    if (!/^vad_[a-f0-9]{24}$/u.test(String(candidate.lineage_id ?? ""))) errors.push("lineage_id is invalid");
    if (!/^var_[a-f0-9]{24}$/u.test(String(candidate.revision_id ?? ""))) errors.push("revision_id is invalid");
    if (candidateIds.has(candidate.candidate_id)) errors.push(`duplicate candidate_id ${candidate.candidate_id}`);
    candidateIds.add(candidate.candidate_id);
    if (!unitIds.has(candidate.source_unit_ref)) errors.push(`candidate ${candidate.candidate_id} has an unknown source unit`);
    if (candidate.decision_application_state !== "candidate") errors.push(`candidate ${candidate.candidate_id} must remain candidate-only`);
    if (!ALLOWED_CANDIDATE_KINDS.has(candidate.candidate_kind)) errors.push(`candidate ${candidate.candidate_id} has unknown candidate_kind ${candidate.candidate_kind}`);
    if (!ALLOWED_DRIVER_KINDS.has(candidate.driver_kind)) errors.push(`candidate ${candidate.candidate_id} has unknown driver_kind ${candidate.driver_kind}`);
    for (const value of [candidate.actor_candidates?.speaker_candidate, candidate.actor_candidates?.requester_candidate, candidate.actor_candidates?.assignee_candidate, ...(candidate.actor_candidates?.mentioned_person_candidates ?? [])]) {
      if (value != null && containsSecretLikeValue(value)) errors.push(`candidate ${candidate.candidate_id} contains a secret-like actor label`);
    }
  }
  for (const window of run.review_windows ?? []) {
    if (!/^vrw_[a-f0-9]{24}$/u.test(String(window.window_id ?? ""))) errors.push("review window_id is invalid");
    if (!Array.isArray(window.source_unit_refs) || window.source_unit_refs.some((ref) => !unitIds.has(ref))) errors.push(`review window ${window.window_id ?? "unknown"} has an unknown source unit`);
    if (window.transcript_text_copied !== false) errors.push(`review window ${window.window_id ?? "unknown"} copies transcript body`);
    if (!Number.isFinite(window.start_seconds) || !Number.isFinite(window.duration_seconds)) errors.push(`review window ${window.window_id ?? "unknown"} must have finite start and duration`);
    else if (window.start_seconds < 0 || window.duration_seconds < 30 || window.duration_seconds > 90) errors.push(`review window ${window.window_id ?? "unknown"} must be bounded to 30-90 seconds`);
  }
  if (run.evidence_gate?.action_candidate_emission_allowed === false && run.action_candidates?.length !== 0) errors.push("evidence gate forbids action candidates");
  if (run.evidence_gate?.project_candidate_emission_allowed === false && run.project_resolution?.candidates?.length !== 0) errors.push("evidence gate forbids project candidates");
  if (run.evidence_gate?.input_class === "provider_locator_only") {
    if (run.recording_ref?.evidence_role !== PROVIDER_EVIDENCE_ROLE) errors.push("provider evidence role mismatch");
    if (run.action_candidates?.length !== 0) errors.push("provider transcript cannot emit action candidates");
    if (run.project_resolution?.candidates?.length !== 0) errors.push("provider transcript cannot emit project candidates");
    if (run.retrieval_plan?.query_terms?.length !== 0) errors.push("provider transcript cannot emit retrieval terms");
    if (run.evidence_provenance !== null) errors.push("provider transcript cannot carry strong-ASR provenance");
  }
  if (run.evidence_gate?.input_class === "independent_asr_fast") {
    if (run.recording_ref?.evidence_role !== FAST_EVIDENCE_ROLE) errors.push("fast ASR evidence role mismatch");
    if (run.action_candidates?.length !== 0 || run.project_resolution?.candidates?.length !== 0 || run.retrieval_plan?.query_terms?.length !== 0) errors.push("fast ASR cannot emit semantic authority before verified pair comparison");
    if (run.evidence_provenance !== null) errors.push("fast ASR cannot carry strong-ASR provenance");
  }
  if (run.evidence_gate?.input_class === "independent_asr_stronger") {
    if (!allowUnverifiedStrong && !hasVerifiedStrongRunBrand(run)) errors.push("strong ASR run object is not artifact-verified");
    if (run.recording_ref?.evidence_role !== STRONG_EVIDENCE_ROLE) errors.push("strong ASR evidence role mismatch");
    if (run.evidence_gate?.state !== "shadow_reviewable"
      || run.evidence_gate?.action_candidate_emission_allowed !== true
      || run.evidence_gate?.project_candidate_emission_allowed !== true
      || run.evidence_gate?.next_step !== "shadow_context_correlation") errors.push("strong ASR evidence gate state mismatch");
    validateStrongEvidenceProvenance(run.evidence_provenance, run.recording_ref?.recording_id, run.recording_ref?.transcript_sha256, errors);
  }
  for (const row of run.segment_labels ?? []) for (const entity of row.entities ?? []) if (containsSecretLikeValue(entity.value)) errors.push(`unit ${row.unit_id} contains a secret-like entity value`);
  for (const term of run.retrieval_plan?.query_terms ?? []) if (containsSecretLikeValue(term.value)) errors.push("retrieval plan contains a secret-like query value");
  if (run.coverage?.semantic_unit_count !== run.segment_labels?.length) errors.push("semantic unit coverage count mismatch");
  if (run.coverage?.source_segment_count !== run.coverage?.covered_source_segment_count) errors.push("source segment coverage is incomplete");
  if (run.coverage?.every_source_segment_accounted_for !== true) errors.push("every source segment must be accounted for");
  if (run.coverage?.action_candidate_count !== run.action_candidates?.length) errors.push("action candidate coverage count mismatch");
  if (run.coverage?.unlabeled_semantic_unit_count !== 0) errors.push("unlabeled semantic unit count must be zero");
  if (run.boundaries?.transcript_body_copied_to_output !== false) errors.push("transcript body boundary must be false");
  if (run.boundaries?.official_task_mutated !== false) errors.push("official task mutation boundary must be false");
  if (run.boundaries?.human_acceptance_fabricated !== false) errors.push("human acceptance boundary must be false");
  if (run.boundaries?.provider_transcript_authority_zero !== true) errors.push("provider transcript authority boundary must be true");
  if (run.boundaries?.speaker_is_not_assignee !== true) errors.push("speaker/assignee boundary must be true");
  if (run.boundaries?.ambiguous_trivial_content_ignored !== true) errors.push("trivial ambiguity boundary must be true");
  scanForbiddenKeys(run, [], errors);
  return { ok: errors.length === 0, errors: uniqueSorted(errors) };
}

function labelTurn(turn, contextCards) {
  const text = normalizeText(turn.text);
  const speechActs = detectSpeechActs(text);
  const actionCodes = ACTION_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([code]) => code);
  const entities = extractEntities(text, contextCards);
  const projectMatch = resolveProjectForText(text, contextCards);
  const disposition = chooseDisposition(speechActs, actionCodes);
  const linguisticState = buildLinguisticState(text, speechActs);
  return {
    unit_id: turn.unit_id,
    source_segment_ids: turn.source_segment_ids,
    start_seconds: turn.start_seconds,
    end_seconds: turn.end_seconds,
    speaker_label: turn.speaker_label,
    content_sha256: sha256(turn.text),
    content_char_count: turn.text.length,
    speech_acts: speechActs,
    ...linguisticState,
    action_codes: actionCodes,
    entities,
    project_match: projectMatch,
    disposition,
    _private_text: turn.text,
  };
}

function detectSpeechActs(text) {
  const acts = new Set();
  const trivialSpeech = isExplicitTrivialText(text);
  if (trivialSpeech) return ["context_statement"];
  const proposalQuestion = PROPOSAL_QUESTION_PATTERN.test(text) || OFFER_PATTERN.test(text);
  const question = QUESTION_PATTERN.test(text) || proposalQuestion;
  const reported = REPORTED_PATTERN.test(text);
  const cancelled = CANCELLATION_PATTERN.test(text);
  const conditional = CONDITIONAL_PATTERN.test(text);
  const negatedCompletion = NEGATED_COMPLETION_PATTERN.test(text) || COMMON_INCOMPLETE_PATTERN.test(text);
  if (cancelled) acts.add("cancellation");
  if (ASSIGNMENT_PATTERN.test(text) && !reported && !cancelled) acts.add("assignment");
  if ((REQUEST_PATTERN.test(text) || COMMON_POLITE_REQUEST_PATTERN.test(text)) && !reported && !cancelled) acts.add("request");
  if (OFFER_PATTERN.test(text) && !reported && !cancelled) acts.add("offer");
  if (COMMITMENT_PATTERN.test(text) && !question && !conditional && !reported && !cancelled) acts.add("commitment");
  if ((DECISION_PATTERN.test(text) || COLLOQUIAL_DECISION_PATTERN.test(text)) && !question && !conditional && !reported && !cancelled) acts.add("decision");
  if (question) acts.add("open_question");
  if (hasMaterialRisk(text)) acts.add("risk_or_issue");
  if (negatedCompletion || PROGRESS_STATUS_PATTERN.test(text)) acts.add("status_update");
  else if (RESULT_PATTERN.test(text) && !question && !conditional && !reported && !cancelled) acts.add("result_report");
  if (ACKNOWLEDGEMENT_PATTERN.test(text)) acts.add("acknowledgement");
  if (DEADLINE_PATTERN.test(text)) acts.add("deadline_mention");
  if (reported) acts.add("reported_speech");
  if (conditional) acts.add("conditional_statement");
  if (acts.size === 0) acts.add("context_statement");
  return SPEECH_ACT_ORDER.filter((act) => acts.has(act));
}

function isExplicitTrivialText(text) {
  const value = normalizeText(text).trim();
  return TRIVIAL_CLOSING_PATTERN.test(value)
    || TRIVIAL_ACK_PATTERN.test(value)
    || TRIVIAL_MEAL_PATTERN.test(value)
    || TRIVIAL_COURTESY_PATTERN.test(value)
    || TRIVIAL_WEATHER_PATTERN.test(value)
    || TRIVIAL_GREETING_PATTERN.test(value)
    || TRIVIAL_NEGATED_DELIVERY_RISK_PATTERN.test(value)
    || !value
      .replace(NEGATED_BUSINESS_CHANGE_PATTERN, " ")
      .replace(NEGATED_BUSINESS_IMPACT_PATTERN, " ")
      .replace(NEGATED_RISK_EVENT_PATTERN, " ")
      .replace(NEGATED_RISK_PHRASE_PATTERN, " ")
      .replace(/[\s,.!?。！？]+/gu, "");
}

function hasMaterialRisk(text) {
  const withoutNegatedRiskPhrases = text
    .replace(NEGATED_BUSINESS_CHANGE_PATTERN, " ")
    .replace(NEGATED_BUSINESS_IMPACT_PATTERN, " ")
    .replace(NEGATED_RISK_EVENT_PATTERN, " ")
    .replace(NEGATED_RISK_PHRASE_PATTERN, " ");
  return RISK_PATTERN.test(withoutNegatedRiskPhrases) || BUSINESS_IMPACT_RISK_PATTERN.test(withoutNegatedRiskPhrases);
}

function buildLinguisticState(text, speechActs) {
  const reported = speechActs.includes("reported_speech");
  const conditional = speechActs.includes("conditional_statement");
  const cancelled = speechActs.includes("cancellation");
  const negatedCompletion = NEGATED_COMPLETION_PATTERN.test(text) || COMMON_INCOMPLETE_PATTERN.test(text);
  let modality = "actual";
  if (conditional) modality = "conditional";
  else if (TENTATIVE_PATTERN.test(text)) modality = "uncertain";
  else if (speechActs.includes("offer")) modality = "offered";
  else if (speechActs.includes("request") || speechActs.includes("assignment")) modality = "required";
  else if (speechActs.includes("commitment")) modality = "intended";
  return {
    polarity: cancelled || negatedCompletion ? "negated" : "affirmed",
    modality,
    attribution_mode: reported ? "reported_unknown_actor" : "direct_current_speaker",
    negation_scope: cancelled ? "necessity_or_action" : negatedCompletion ? "completion" : "none",
    speech_decision_state: reported && speechActs.includes("decision") ? "reported_only" : speechActs.includes("decision") && TENTATIVE_PATTERN.test(text) ? "tentative" : speechActs.includes("decision") ? "agreed_speech_only" : "not_applicable",
    speech_commitment_state: reported && speechActs.includes("commitment") ? "third_party_reported" : speechActs.includes("commitment") ? "self_committed_candidate" : speechActs.includes("offer") ? "offered" : "not_applicable",
  };
}

function extractEntities(text, contextCards) {
  const entities = [];
  for (const match of text.matchAll(PERSON_PATTERN)) addEntity(entities, "person_mention", match[0], { role_label: match[2] });
  for (const match of text.matchAll(PROJECT_CODE_PATTERN)) addEntity(entities, "project_code_mention", match[0].toUpperCase());
  for (const match of text.matchAll(VALUE_PATTERN)) addEntity(entities, "measured_value", match[0]);
  for (const match of text.matchAll(PARTICLE_VALUE_PATTERN)) addEntity(entities, "measured_value", match[0]);
  for (const match of text.matchAll(DATE_PATTERN)) addEntity(entities, "date_or_period", match[0]);
  for (const card of contextCards) {
    for (const alias of card.aliases) if (includesTerm(text, alias.value)) addEntity(entities, "project_alias", alias.value, { project_ref: card.project_ref, card_ref: card.card_ref });
    for (const person of card.people) for (const alias of person.aliases) if (includesTerm(text, alias)) addEntity(entities, "person_alias", alias, { person_ref: person.person_ref, project_ref: card.project_ref, card_ref: card.card_ref });
    for (const term of card.terms) if (includesTerm(text, term.value)) addEntity(entities, term.kind, term.value, { project_ref: card.project_ref, card_ref: card.card_ref });
  }
  return entities.sort((left, right) => `${left.kind}:${left.value}`.localeCompare(`${right.kind}:${right.value}`, "ko"));
}

function resolveProjectForText(text, contextCards) {
  const candidates = [];
  for (const card of contextCards) {
    let score = 0;
    const anchorKinds = new Set();
    const anchorValues = new Set();
    const supportingEvidence = [];
    const contradictoryEvidence = [];
    for (const alias of card.aliases) {
      if (!includesTerm(text, alias.value)) continue;
      const weight = alias.kind === "project_code" ? 5 : 4;
      score += weight;
      anchorKinds.add("project_alias");
      anchorValues.add(normalizeText(alias.value));
      supportingEvidence.push(buildAnchor("project_alias", alias.value, card.card_ref, weight));
    }
    for (const person of card.people) {
      for (const alias of person.aliases) {
        if (!includesTerm(text, alias)) continue;
        score += 2;
        anchorKinds.add("person_relation");
        anchorValues.add(normalizeText(alias));
        supportingEvidence.push(buildAnchor("person_relation", alias, card.card_ref, 2));
      }
    }
    for (const term of card.terms) {
      if (!includesTerm(text, term.value)) continue;
      score += term.weight;
      anchorKinds.add(term.kind);
      anchorValues.add(normalizeText(term.value));
      supportingEvidence.push(buildAnchor(term.kind, term.value, card.card_ref, term.weight));
    }
    for (const negative of card.negative_terms) {
      if (!includesTerm(text, negative.value)) continue;
      score -= negative.weight;
      contradictoryEvidence.push(buildAnchor("negative_term", negative.value, card.card_ref, -negative.weight));
    }
    if (score !== 0 || contradictoryEvidence.length > 0) {
      candidates.push({
        project_ref: card.project_ref,
        card_ref: card.card_ref,
        score,
        independent_anchor_kinds: [...anchorKinds].sort(),
        independent_anchor_value_count: countIndependentAnchorValues(anchorValues),
        supporting_evidence: supportingEvidence,
        contradictory_evidence: contradictoryEvidence,
      });
    }
  }
  candidates.sort((left, right) => right.score - left.score || left.project_ref.localeCompare(right.project_ref));
  const top = candidates[0];
  const next = candidates[1];
  if (!top || top.score <= 0) return { state: "unresolved_needs_context", candidates };
  const enoughAnchors = top.independent_anchor_kinds.length >= RULESET_DESCRIPTOR.minimum_project_anchors;
  const enoughIndependentValues = top.independent_anchor_value_count >= RULESET_DESCRIPTOR.minimum_project_anchors;
  const enoughScore = top.score >= RULESET_DESCRIPTOR.minimum_project_score;
  const enoughMargin = !next || top.score - next.score >= RULESET_DESCRIPTOR.minimum_project_margin;
  const noContradiction = top.contradictory_evidence.length === 0;
  if (enoughAnchors && enoughIndependentValues && enoughScore && enoughMargin && noContradiction) {
    return { state: "project_candidate_needs_review", candidates };
  }
  if (!enoughMargin || !noContradiction) return { state: "exception_review_required", candidates };
  return { state: "unresolved_needs_context", candidates };
}

function countIndependentAnchorValues(values) {
  const independent = [];
  const normalizedValues = [...values]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length || left.localeCompare(right, "ko"));
  for (const value of normalizedValues) {
    if (independent.some((accepted) => accepted.includes(value) || value.includes(accepted))) continue;
    independent.push(value);
  }
  return independent.length;
}

function buildActionCandidates(recordingId, row, revisionContext) {
  if (!isMaterialLabelRow(row)) return [];
  const kinds = [];
  const acts = new Set(row.speech_acts);
  if (acts.has("cancellation")) kinds.push("cancellation_or_hold");
  if (acts.has("assignment")) kinds.push("assignment");
  if (acts.has("request")) kinds.push("request");
  if (acts.has("commitment")) kinds.push("commitment");
  if (acts.has("decision")) kinds.push("decision");
  if (acts.has("risk_or_issue")) kinds.push("risk_followup");
  if (acts.has("result_report")) kinds.push("completion_claim_review");
  if (acts.has("reported_speech") && row.action_codes.length > 0 && kinds.length === 0) kinds.push("reported_obligation_review");
  return kinds.map((kind) => {
    const projectRef = null;
    const unresolved = [];
    if (!projectRef) unresolved.push("project_ref");
    if (["assignment", "request", "commitment", "risk_followup", "reported_obligation_review"].includes(kind) && row.action_codes.length === 0) unresolved.push("action_code");
    if (["assignment", "request", "commitment"].includes(kind)) unresolved.push("assignee_candidate");
    if (!row.speech_acts.includes("deadline_mention") && ["assignment", "request", "commitment"].includes(kind)) unresolved.push("due_candidate");
    const lineageId = `vad_${sha256(`${recordingId}\n${row.unit_id}\n${kind}`).slice(0, 24)}`;
    const revisionId = `var_${sha256(`${lineageId}\n${revisionContext.transcriptSha256}\n${revisionContext.rulesetSha256}\n${revisionContext.contextDigest}\n${row.content_sha256}`).slice(0, 24)}`;
    const candidateId = `vac_${revisionId.slice(4)}`;
    return {
      candidate_id: candidateId,
      lineage_id: lineageId,
      revision_id: revisionId,
      candidate_kind: kind,
      source_unit_ref: row.unit_id,
      driver_kind: mapDriverKind(kind),
      decision_application_state: "candidate",
      project_ref: projectRef,
      project_resolution_state: row.project_match.state,
      actor_candidates: {
        speaker_candidate: row.speaker_label,
        requester_candidate: kind === "request" ? row.speaker_label : null,
        assignee_candidate: null,
        mentioned_person_candidates: row.entities.filter((item) => ["person_mention", "person_alias"].includes(item.kind)).map((item) => item.person_ref ?? `mention:${item.value_sha256}`),
      },
      action_codes: row.action_codes,
      due_candidate_state: row.speech_acts.includes("deadline_mention") ? "explicit_expression_needs_normalization" : "unknown",
      supporting_source_refs: [`voice-segment://${recordingId}/${row.unit_id}`],
      contradictory_evidence_count: row.project_match.candidates.reduce((count, item) => count + item.contradictory_evidence.length, 0),
      unresolved_fields: uniqueSorted(unresolved),
      exception_codes: buildCandidateExceptions(row, unresolved),
      claim_ceiling: kind === "completion_claim_review" ? "unverified_completion_claim" : "machine_generated_candidate",
    };
  });
}

function buildEvidenceGate(evidenceRole, transcriptQuality, labelRows = []) {
  const role = String(evidenceRole ?? "");
  const quality = normalizeText(transcriptQuality);
  const providerOnly = role === PROVIDER_EVIDENCE_ROLE;
  const strongerLocal = role === STRONG_EVIDENCE_ROLE;
  const attentionRequired = /(?:attention|required|ambiguous|disagreement|low_quality|poor)/u.test(quality);
  const materialSignalPresent = labelRows.some(isMaterialLabelRow);
  const explicitlyTrivialOnly = labelRows.length > 0 && labelRows.every((row) => isExplicitTrivialText(row._private_text));

  if (providerOnly) {
    return {
      input_class: "provider_locator_only",
      state: "independent_asr_required",
      reason_codes: ["provider_transcript_has_zero_task_and_project_authority"],
      action_candidate_emission_allowed: false,
      project_candidate_emission_allowed: false,
      next_step: "run_independent_fast_asr",
    };
  }
  if (!strongerLocal && (materialSignalPresent || (attentionRequired && !explicitlyTrivialOnly))) {
    return {
      input_class: "independent_asr_fast",
      state: "stronger_local_asr_required",
      reason_codes: attentionRequired
        ? ["independent_fast_asr_quality_requires_attention", materialSignalPresent ? "two_model_material_confirmation_required" : "low_quality_cannot_prove_trivial_content"]
        : ["two_model_material_confirmation_required"],
      action_candidate_emission_allowed: false,
      project_candidate_emission_allowed: false,
      next_step: "run_stronger_local_asr_on_material_windows",
    };
  }
  if (!strongerLocal) {
    return {
      input_class: "independent_asr_fast",
      state: "screened_no_material_signal_ignored",
      reason_codes: ["no_material_task_or_decision_signal_detected"],
      action_candidate_emission_allowed: false,
      project_candidate_emission_allowed: false,
      next_step: "no_further_action",
    };
  }
  return {
    input_class: "independent_asr_stronger",
    state: "shadow_reviewable",
    reason_codes: attentionRequired
      ? ["verified_stronger_asr_available", "global_quality_signal_is_not_human_escalation_authority"]
      : ["verified_stronger_asr_available"],
    action_candidate_emission_allowed: true,
    project_candidate_emission_allowed: true,
    next_step: "shadow_context_correlation",
  };
}

function applyEvidenceGateToLabels(rows, evidenceGate) {
  if (evidenceGate.action_candidate_emission_allowed && evidenceGate.project_candidate_emission_allowed) return rows;
  return rows.map((row) => {
    const material = isMaterialLabelRow(row);
    return {
      ...row,
      project_match: { state: "unresolved_needs_context", candidates: [] },
      disposition: evidenceGate.input_class === "provider_locator_only"
        ? "locator_only_untrusted"
        : material ? "material_ambiguity_deferred" : "context_only",
    };
  });
}

function buildDeferredProjectResolution(evidenceGate) {
  return {
    state: evidenceGate.state,
    selected_project_unit_counts: {},
    candidates: [],
    whole_recording_single_project_forced: false,
    human_acceptance_state: "not_claimed",
  };
}

function buildReviewWindows(recordingId, labelRows, evidenceGate) {
  if (["shadow_reviewable", "screened_no_material_signal_ignored"].includes(evidenceGate.state)) return [];
  const windows = [];
  for (const row of labelRows) {
    const materialActs = materialSpeechActs(row);
    if (materialActs.length === 0) continue;
    if (!Number.isFinite(row.start_seconds) || !Number.isFinite(row.end_seconds) || row.end_seconds <= row.start_seconds) continue;
    const start = Math.max(0, row.start_seconds - 15);
    const desiredEnd = row.end_seconds + 15;
    const end = Math.min(Math.max(desiredEnd, start + 30), start + 90);
    const windowId = `vrw_${sha256(`${recordingId}\n${row.unit_id}\n${evidenceGate.state}`).slice(0, 24)}`;
    windows.push({
      window_id: windowId,
      start_seconds: start,
      duration_seconds: roundMillis(end - start),
      source_unit_refs: [row.unit_id],
      importance_state: "material_ambiguity_candidate",
      importance_reason_codes: uniqueSorted(materialActs.map((act) => `speech_act_${act}`)),
      escalation_state: evidenceGate.state,
      human_listen_required: false,
      transcript_text_copied: false,
    });
  }
  return windows;
}

function materialSpeechActs(row) {
  const acts = row.speech_acts ?? [];
  const material = acts.filter((act) => MATERIAL_SPEECH_ACTS.has(act));
  const hasActionSignal = Array.isArray(row.action_codes) && row.action_codes.length > 0;
  for (const contextualAct of ["result_report", "status_update"]) {
    if (acts.includes(contextualAct)) material.push(contextualAct);
  }
  for (const contextualAct of ["reported_speech", "open_question", "deadline_mention", "conditional_statement"]) {
    if (acts.includes(contextualAct) && hasActionSignal) material.push(contextualAct);
  }
  return uniqueSorted(material);
}

function isMaterialLabelRow(row) {
  return materialSpeechActs(row).length > 0;
}

function materialLabelRows(rows) {
  return rows.filter(isMaterialLabelRow);
}

function compareMaterialRows(fastRow, strongerRows, fastAllRows, strongerAllRows) {
  if (strongerRows.length === 0) return ["fast_material_window_missing_in_stronger_asr"];
  const fastActs = materialSpeechActs(fastRow);
  const strongerActs = uniqueSorted(strongerRows.flatMap(materialSpeechActs));
  const reasons = [];
  if (!sameStringSet(fastActs, strongerActs)) reasons.push("material_speech_act_disagreement");
  const strongerActionCodes = uniqueSorted(strongerRows.flatMap((row) => row.action_codes));
  if (!sameStringSet(fastRow.action_codes, strongerActionCodes)) reasons.push("material_action_code_disagreement");
  const fastEntities = criticalEntityFingerprints(contextRowsForSeeds(fastAllRows, [fastRow], 10));
  const strongerEntities = criticalEntityFingerprints(contextRowsForSeeds(strongerAllRows, strongerRows, 10));
  if (criticalEntitySetsConflict(fastEntities, strongerEntities)) reasons.push("critical_entity_disagreement");
  return uniqueSorted(reasons);
}

function contextRowsForSeeds(allRows, seedRows, toleranceSeconds) {
  return allRows.filter((row) => seedRows.some((seed) => timeRangesRelated(row, seed, toleranceSeconds)));
}

function buildComparisonWindow(recordingId, fastRows, strongerRows, reasonCodes) {
  const rows = [...fastRows, ...strongerRows];
  const starts = rows.map((row) => row.start_seconds).filter(Number.isFinite);
  const ends = rows.map((row) => row.end_seconds).filter(Number.isFinite);
  if (starts.length === 0 || ends.length === 0) throw new Error("material disagreement cannot be escalated without finite timestamps");
  const start = Math.max(0, Math.min(...starts) - 15);
  const desiredEnd = Math.max(...ends) + 15;
  const end = Math.min(Math.max(desiredEnd, start + 30), start + 90);
  const fastRefs = uniqueSorted(fastRows.map((row) => row.unit_id));
  const strongerRefs = uniqueSorted(strongerRows.map((row) => row.unit_id));
  const identity = `${recordingId}\n${fastRefs.join(",")}\n${strongerRefs.join(",")}\n${uniqueSorted(reasonCodes).join(",")}`;
  return {
    window_id: `vrw_${sha256(identity).slice(0, 24)}`,
    start_seconds: start,
    duration_seconds: roundMillis(end - start),
    source_unit_refs: uniqueSorted([...fastRefs, ...strongerRefs]),
    importance_state: "material_ambiguity_candidate",
    importance_reason_codes: uniqueSorted(reasonCodes),
    escalation_state: "human_audio_review_required",
    human_listen_required: true,
    transcript_text_copied: false,
  };
}

function criticalEntityFingerprints(rows) {
  const kinds = new Set(["person_mention", "person_alias", "project_code_mention", "project_alias", "date_or_period", "measured_value"]);
  return uniqueSorted(rows.flatMap((row) => row.entities
    .filter((entity) => kinds.has(entity.kind) && isRelevantComparisonEntity(row, entity))
    .map((entity) => `${entity.kind}:${entity.value_sha256}`)));
}

function isRelevantComparisonEntity(row, entity) {
  if (isMaterialLabelRow(row)) return true;
  if (["person_mention", "person_alias", "project_code_mention", "project_alias"].includes(entity.kind)) return true;
  if (entity.kind !== "measured_value") return false;
  return /(?:mm|cm|m|km|kg|g|mV|V|mA|A|Ω|ohm|Hz|kHz|MHz|GHz|W|kW|dB)$/iu.test(String(entity.value ?? "").trim());
}

function criticalEntitySetsConflict(left, right) {
  const kinds = new Set([...left, ...right].map((value) => String(value).split(":", 1)[0]));
  for (const kind of kinds) {
    const leftValues = new Set(left.filter((value) => value.startsWith(`${kind}:`)));
    const rightValues = new Set(right.filter((value) => value.startsWith(`${kind}:`)));
    if ((leftValues.size === 0) !== (rightValues.size === 0)) return true;
    if (leftValues.size === 0) continue;
    if (leftValues.size !== rightValues.size || [...leftValues].some((value) => !rightValues.has(value))) return true;
  }
  return false;
}

function timeRangesRelated(left, right, toleranceSeconds) {
  if (![left.start_seconds, left.end_seconds, right.start_seconds, right.end_seconds].every(Number.isFinite)) return false;
  return left.start_seconds <= right.end_seconds + toleranceSeconds && right.start_seconds <= left.end_seconds + toleranceSeconds;
}

function sameStringSet(left, right) {
  const leftValues = uniqueSorted(left);
  const rightValues = uniqueSorted(right);
  return leftValues.length === rightValues.length && leftValues.every((value, index) => value === rightValues[index]);
}

function buildRetrievalPlan({ recordedAt, labelRows, projectResolution, allowTerms = true }) {
  const terms = [];
  for (const row of allowTerms ? labelRows : []) {
    for (const entity of row.entities) {
      if (["measured_value", "date_or_period"].includes(entity.kind)) continue;
      if (!entity.value) continue;
      terms.push({ kind: entity.kind, value: entity.value, value_sha256: entity.value_sha256 });
    }
  }
  const uniqueTerms = dedupeBy(terms, (item) => `${item.kind}:${item.value_sha256}`).slice(0, 64);
  const timeWindow = buildTimeWindow(recordedAt);
  return {
    mode: "hybrid_exact_metadata_then_semantic",
    source_kinds: ["mail", "se_schedule", "project_context", "file", "structured_pc_work", "run_log", "voice", "rag", "wiki"],
    query_terms: uniqueTerms,
    time_window: timeWindow,
    candidate_project_refs: projectResolution.candidates.map((item) => item.project_ref),
    required_result_fields: ["source_revision_ref", "occurred_at", "known_at", "project_ref", "support_kind", "claim_ceiling"],
    guards: {
      transcript_only_auto_accept: false,
      implicit_cross_project_fallback: false,
      unknown_project_candidate_preserved: true,
      retrieval_result_is_not_authority: true,
    },
  };
}

function summarizeProjectResolution(labelRows) {
  const selected = countBy(labelRows.map((row) => row.project_match.selected_project_ref).filter(Boolean));
  const candidatesByRef = new Map();
  for (const row of labelRows) {
    for (const candidate of row.project_match.candidates) {
      const current = candidatesByRef.get(candidate.project_ref) ?? { project_ref: candidate.project_ref, score: 0, unit_count: 0, contradictory_evidence_count: 0 };
      current.score += candidate.score;
      current.unit_count += 1;
      current.contradictory_evidence_count += candidate.contradictory_evidence.length;
      candidatesByRef.set(candidate.project_ref, current);
    }
  }
  const states = new Set(labelRows.map((row) => row.project_match.state));
  let state = "unresolved_needs_context";
  if (states.has("exception_review_required")) state = "exception_review_required";
  else if (states.has("project_candidate_needs_review")) state = "project_candidates_need_review";
  return {
    state,
    selected_project_unit_counts: selected,
    candidates: [...candidatesByRef.values()].sort((left, right) => right.score - left.score || left.project_ref.localeCompare(right.project_ref)),
    whole_recording_single_project_forced: false,
    human_acceptance_state: "not_claimed",
  };
}

function buildCoverage(sourceSegments, labelRows, actionCandidates) {
  const sourceIds = new Set(sourceSegments.map((item) => String(item.segment_id)));
  const coveredIds = new Set(labelRows.flatMap((item) => item.source_segment_ids).map(String));
  const dispositions = countBy(labelRows.map((item) => item.disposition));
  return {
    source_segment_count: sourceSegments.length,
    covered_source_segment_count: [...sourceIds].filter((id) => coveredIds.has(id)).length,
    semantic_unit_count: labelRows.length,
    labeled_semantic_unit_count: labelRows.filter((item) => item.speech_acts.length > 0).length,
    unlabeled_semantic_unit_count: labelRows.filter((item) => item.speech_acts.length === 0).length,
    action_candidate_count: actionCandidates.length,
    disposition_counts: dispositions,
    action_recall_verified: false,
    every_source_segment_accounted_for: [...sourceIds].every((id) => coveredIds.has(id)),
  };
}

function validateSourceSegments(sourceSegments) {
  const ids = new Set();
  for (const [index, row] of sourceSegments.entries()) {
    if (!Number.isSafeInteger(row.segment_id) || row.segment_id <= 0) throw new Error(`source segment ${index + 1} has an invalid segment_id`);
    if (ids.has(row.segment_id)) throw new Error(`duplicate source segment_id ${row.segment_id}`);
    ids.add(row.segment_id);
    if (row.start_seconds != null && (!Number.isFinite(row.start_seconds) || row.start_seconds < 0)) throw new Error(`source segment ${row.segment_id} has an invalid start_seconds`);
    if (row.end_seconds != null && (!Number.isFinite(row.end_seconds) || row.end_seconds < 0)) throw new Error(`source segment ${row.segment_id} has an invalid end_seconds`);
    if (row.start_seconds != null && row.end_seconds != null && row.end_seconds < row.start_seconds) throw new Error(`source segment ${row.segment_id} ends before it starts`);
  }
}

function validateProjectContextCards(cards) {
  if (!Array.isArray(cards)) throw new Error("projectContextCards must be an array");
  return cards.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`context card ${index} must be an object`);
    if (!validateProjectContextCardSchema(raw)) {
      const details = (validateProjectContextCardSchema.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.keyword}`);
      throw new Error(`context card ${index} schema validation failed: ${details.join("; ")}`);
    }
    if (raw.schema_version !== projectContextCardSchemaVersion) throw new Error(`context card ${index} schema_version mismatch`);
    for (const key of ["card_ref", "project_ref", "card_version", "valid_at", "known_at", "input_set_digest", "authority_state", "claim_ceiling", "acl_state", "coverage_gap_codes", "aliases", "people", "terms", "negative_terms", "source_refs"]) {
      if (!Object.hasOwn(raw, key)) throw new Error(`context card ${index} is missing ${key}`);
    }
    const projectRef = requireSafeRef(raw.project_ref, `context card ${index} project_ref`);
    const cardRef = requireSafeRelativeRef(raw.card_ref, `context card ${index} card_ref`);
    const inputSetDigest = requireSha256(raw.input_set_digest, `context card ${index} input_set_digest`);
    if (raw.authority_state !== "shadow_unaccepted_input") throw new Error(`context card ${index} cannot claim accepted authority`);
    if (raw.claim_ceiling !== "observed") throw new Error(`context card ${index} claim_ceiling must remain observed`);
    if (raw.acl_state !== "unresolved") throw new Error(`context card ${index} ACL authority is not implemented`);
    const aliases = raw.aliases.map((item, aliasIndex) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`context card ${index} alias ${aliasIndex} must be an object`);
      return { value: requireContextEntityValue(item.value, `context card ${index} alias ${aliasIndex}`), kind: normalizeSafeKind(item.kind ?? "alias") };
    }).filter((item) => item.value.trim());
    const people = (raw.people ?? []).map((person, personIndex) => ({
      person_ref: requireSafeRef(person.person_ref, `context card ${index} person ${personIndex} ref`),
      aliases: uniqueSorted((person.aliases ?? []).map((value, aliasIndex) => requireContextEntityValue(value, `context card ${index} person ${personIndex} alias ${aliasIndex}`))),
      roles: uniqueSorted((person.roles ?? []).map((value, roleIndex) => requireContextEntityValue(value, `context card ${index} person ${personIndex} role ${roleIndex}`))),
    }));
    const terms = (raw.terms ?? []).map((term, termIndex) => ({ value: requireContextEntityValue(term.value, `context card ${index} term ${termIndex}`), kind: normalizeSafeKind(term.kind ?? "domain_term"), weight: boundedWeight(term.weight, 1) }));
    const negativeTerms = raw.negative_terms.map((term, termIndex) => {
      if (!term || typeof term !== "object" || Array.isArray(term)) throw new Error(`context card ${index} negative term ${termIndex} must be an object`);
      return { value: requireContextEntityValue(term.value, `context card ${index} negative term ${termIndex}`), weight: boundedWeight(term.weight, 4) };
    });
    return {
      schema_version: projectContextCardSchemaVersion,
      card_ref: cardRef,
      project_ref: projectRef,
      card_version: String(raw.card_version ?? "unknown"),
      valid_at: normalizeOptional(raw.valid_at),
      known_at: normalizeOptional(raw.known_at),
      input_set_digest: inputSetDigest,
      authority_state: raw.authority_state,
      claim_ceiling: raw.claim_ceiling,
      acl_state: raw.acl_state,
      coverage_gap_codes: uniqueSorted(raw.coverage_gap_codes.map(String).map((value) => value.trim()).filter(Boolean)),
      aliases,
      people,
      terms,
      negative_terms: negativeTerms,
      source_refs: (raw.source_refs ?? []).map((ref, refIndex) => requireSafeRelativeRef(ref, `context card ${index} source ref ${refIndex}`)),
    };
  });
}

async function loadProjectContextCards(contextCardPaths, repoRoot) {
  const cards = [];
  const cardRoot = path.join(repoRoot, "_workmeta");
  for (const value of contextCardPaths) {
    const filePath = path.resolve(value);
    assertProjectContextCardPathShape(cardRoot, filePath);
    if (!existsSync(filePath)) throw new Error(`context card does not exist: ${filePath}`);
    await assertInsideExisting(cardRoot, filePath, "context card");
    const raw = JSON.parse((await readStableFile(filePath)).toString("utf8"));
    const card = Array.isArray(raw) ? raw : [raw];
    for (const item of card) {
      const normalized = { ...item };
      if (!normalized.card_ref) {
        const relative = toPosix(path.relative(repoRoot, filePath));
        if (relative.startsWith("../") || path.isAbsolute(relative)) throw new Error("context cards outside repoRoot require an explicit safe card_ref");
        normalized.card_ref = relative;
      }
      cards.push(normalized);
    }
  }
  return validateProjectContextCards(cards);
}

function assertProjectContextCardPathShape(cardRoot, filePath) {
  const relative = path.relative(path.resolve(cardRoot), path.resolve(filePath));
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error("context card must stay inside _workmeta");
  }
  const parts = relative.split(path.sep);
  const validProjectOwner = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(parts[0] ?? "");
  const validFileName = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\.json$/u.test(parts[3] ?? "");
  if (parts.length !== 4 || !validProjectOwner || parts[1] !== "project_context" || parts[2] !== "cards" || !validFileName) {
    throw new Error("context card path must match _workmeta/<project>/project_context/cards/<card>.json");
  }
}

function stripPrivateText(row) {
  const { _private_text: ignored, ...safe } = row;
  return safe;
}

function canMergeTurn(current, candidate, maxChars, maxGapSeconds) {
  if (current.speaker_label !== candidate.speaker_label) return false;
  if (current.text.length + candidate.text.length + 1 > maxChars) return false;
  if (current.end_seconds == null || candidate.start_seconds == null) return true;
  return candidate.start_seconds - current.end_seconds <= maxGapSeconds;
}

function finalizeTurn(turn, index) {
  const first = sanitizeUnitPart(turn.source_segment_ids[0] ?? index);
  const last = sanitizeUnitPart(turn.source_segment_ids.at(-1) ?? index);
  return { ...turn, unit_id: `unit_${first}_${last}` };
}

function chooseDisposition(acts, actionCodes) {
  if (acts.includes("request") || acts.includes("commitment") || acts.includes("decision") || acts.includes("cancellation")) return "actionable_candidate";
  if (acts.includes("risk_or_issue") || acts.includes("open_question") || acts.includes("reported_speech")) return "reviewable_candidate";
  if (actionCodes.length > 0 || acts.includes("deadline_mention") || acts.includes("result_report")) return "context_with_action_signal";
  return "context_only";
}

function classifyRecording({ title, durationSeconds, speakerCount }) {
  const value = normalizeText(title ?? "");
  let type = "unknown";
  const evidence = [];
  if (/(?:통화|전화)/u.test(value)) { type = "phone_call"; evidence.push("title_phone_marker"); }
  else if (/메모/u.test(value)) { type = "personal_memo"; evidence.push("title_memo_marker"); }
  else if (/(?:회의|미팅)/u.test(value)) { type = "meeting"; evidence.push("title_meeting_marker"); }
  else if (Number(durationSeconds) >= 1200 && speakerCount >= 3) { type = "meeting_candidate"; evidence.push("long_multi_speaker_shape"); }
  else if (speakerCount === 1 && Number(durationSeconds) <= 600) { type = "personal_memo_candidate"; evidence.push("short_single_speaker_shape"); }
  return { type_candidate: type, evidence_codes: evidence, confidence_band: evidence.length > 0 ? (evidence[0].startsWith("title_") ? "high" : "low") : "unknown", human_confirmed: false };
}

function buildAnchor(kind, value, cardRef, weight) {
  return { kind, value_sha256: sha256(normalizeText(value)), card_ref: cardRef, weight };
}

function sanitizeSpeakerLabel(value) {
  const normalized = normalizeOptional(value) ?? "UNKNOWN";
  if (normalized.length > 80 || /[\r\n]/u.test(normalized) || containsSecretLikeValue(normalized)) return "UNKNOWN";
  return normalized;
}

function addEntity(target, kind, value, extra = {}) {
  const normalized = String(value ?? "").trim();
  if (!normalized || containsSecretLikeValue(normalized)) return;
  const key = `${kind}:${normalizeText(normalized)}:${extra.project_ref ?? ""}:${extra.person_ref ?? ""}`;
  if (target.some((item) => `${item.kind}:${normalizeText(item.value)}:${item.project_ref ?? ""}:${item.person_ref ?? ""}` === key)) return;
  target.push({ kind, value: normalized, value_sha256: sha256(normalizeText(normalized)), ...extra });
}

function containsSecretLikeValue(value) {
  return SECRET_VALUE_PATTERN.test(String(value ?? ""));
}

function validateStrongEvidenceProvenance(receipt, recordingId, transcriptSha256, errors) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    errors.push("verified strong ASR provenance receipt is required");
    return;
  }
  if (receipt.schema_version !== "soulforge.voice_asr_pair_provenance.v1") errors.push("strong ASR provenance schema mismatch");
  if (receipt.verification_state !== "source_model_transcript_and_execution_artifacts_verified") errors.push("strong ASR provenance verification state mismatch");
  if (receipt.execution_attestation_state !== "local_artifact_chain_not_hardware_attested") errors.push("strong ASR provenance attestation state mismatch");
  if (receipt.session_id !== recordingId) errors.push("strong ASR provenance session mismatch");
  if (receipt.source_audio_hash_verified !== true) errors.push("strong ASR provenance source audio was not verified");
  if (receipt.stronger?.model_id !== STRONG_MODEL_ID || receipt.stronger?.model_sha256 !== STRONG_MODEL_SHA256) errors.push("strong ASR provenance model mismatch");
  if (receipt.fast?.model_id !== FAST_MODEL_ID || receipt.fast?.model_sha256 !== FAST_MODEL_SHA256) errors.push("fast ASR provenance model mismatch");
  if (receipt.stronger?.transcript_sha256 !== transcriptSha256) errors.push("strong ASR provenance transcript mismatch");
  if (receipt.fast?.transcript_reconstruction_verified !== true || receipt.stronger?.transcript_reconstruction_verified !== true) errors.push("strong ASR provenance transcript reconstruction mismatch");
  const { receipt_id: ignored, ...body } = receipt;
  const expectedId = `vap_${sha256(stableStringify(body)).slice(0, 24)}`;
  if (receipt.receipt_id !== expectedId) errors.push("strong ASR provenance receipt_id mismatch");
}

function buildCandidateExceptions(row, unresolved) {
  const exceptions = [];
  if (row.project_match.state === "exception_review_required") exceptions.push("conflicting_project_evidence");
  if (row.project_match.state === "unresolved_needs_context") exceptions.push("project_context_missing");
  if (row.speech_acts.includes("reported_speech")) exceptions.push("reported_speech_not_new_authority");
  if (row.speech_acts.includes("cancellation")) exceptions.push("cancellation_requires_existing_task_match");
  if (row.modality === "conditional" || row.modality === "uncertain") exceptions.push("conditional_or_tentative_not_authority");
  if (unresolved.includes("assignee_candidate")) exceptions.push("assignee_unknown");
  return uniqueSorted(exceptions);
}

function mapDriverKind(kind) {
  return ({
    cancellation_or_hold: "followup",
    assignment: "assignment",
    request: "request",
    commitment: "followup",
    decision: "decision",
    risk_followup: "risk",
    open_question: "followup",
    completion_claim_review: "result",
    reported_obligation_review: "followup",
  })[kind] ?? "followup";
}

function buildTimeWindow(recordedAt) {
  const parsed = recordedAt ? new Date(recordedAt) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return { state: "unknown", start: null, end: null };
  const start = new Date(parsed.getTime() - 14 * 24 * 60 * 60 * 1000);
  const end = new Date(parsed.getTime() + 2 * 24 * 60 * 60 * 1000);
  return { state: "bounded", start: start.toISOString(), end: end.toISOString() };
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

function includesTerm(text, term) {
  const needle = normalizeText(term);
  return needle.length >= 2 && text.includes(needle);
}

function normalizeOptional(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeSafeKind(value) {
  const normalized = String(value ?? "").trim();
  if (!/^[a-z][a-z0-9_]{0,63}$/u.test(normalized)) throw new Error(`unsafe context term kind: ${normalized}`);
  return normalized;
}

function requireContextEntityValue(value, name) {
  const normalized = String(value ?? "").trim();
  const words = normalized.split(/\s+/u).filter(Boolean);
  if (!normalized || normalized.length > 80 || words.length > 8 || /[\r\n.!?。！？]/u.test(normalized)
    || /(?:주세요|주십시오|바랍니다|합니다|했습니다|됩니다|됐습니다|입니다|이에요|예요|할게요|하겠습니다)$/u.test(normalized)
    || containsSecretLikeValue(normalized)) {
    throw new Error(`${name} must be a compact non-secret entity value`);
  }
  return normalized;
}

function requireSafeId(value, name) {
  const normalized = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,191}$/u.test(normalized)) throw new Error(`${name} is invalid`);
  return normalized;
}

function requireSafeRef(value, name) {
  const normalized = String(value ?? "").trim();
  if (!/^[A-Za-z0-9가-힣][A-Za-z0-9가-힣_.:/-]{0,255}$/u.test(normalized) || normalized.includes("..")) throw new Error(`${name} is invalid`);
  return normalized;
}

function requireSafeRelativeRef(value, name) {
  const normalized = toPosix(String(value ?? "").trim());
  if (!normalized || path.isAbsolute(normalized) || normalized.startsWith("../") || normalized.includes("/../") || /^[a-z][a-z0-9+.-]*:/iu.test(normalized)) throw new Error(`${name} must be a safe relative ref`);
  return normalized;
}

function requireSha256(value, name) {
  const normalized = String(value ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(normalized)) throw new Error(`${name} must be a SHA-256 digest`);
  return normalized;
}

function requireSha1(value, name) {
  const normalized = String(value ?? "").toLowerCase();
  if (!/^[a-f0-9]{40}$/u.test(normalized)) throw new Error(`${name} must be a SHA-1 digest`);
  return normalized;
}

function boundedWeight(value, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number < 1 || number > 5) throw new Error("context term weight must be between 1 and 5");
  return number;
}

function finiteOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundMillis(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function positiveInteger(value, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error("expected a positive integer");
  return number;
}

function sanitizeUnitPart(value) {
  const match = String(value).match(/\d+/u);
  return match ? match[0] : "0";
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function hashFileStream(filePath, algorithm) {
  const hash = crypto.createHash(algorithm);
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function atomicWriteJson(filePath, value, beforeRename = null) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    if (beforeRename) await Promise.resolve(beforeRename({ temporaryPath, filePath }));
    await fs.rename(temporaryPath, filePath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function buildVerifiedRunBrand(run, lane, receipt) {
  const pairReceiptId = String(receipt?.receipt_id ?? "");
  if (!/^vap_[a-f0-9]{24}$/u.test(pairReceiptId)) throw new Error("verified ASR pair receipt_id is invalid");
  return {
    digest: sha256(stableStringify(run)),
    lane,
    pair_receipt_id: pairReceiptId,
    source_sha256: requireSha256(receipt?.source_sha256, "verified ASR pair source_sha256"),
    session_manifest_sha256: requireSha256(receipt?.session_manifest_sha256, "verified ASR pair session_manifest_sha256"),
  };
}

function getVerifiedRunBrand(run, lane) {
  const registry = lane === "fast" ? VERIFIED_FAST_RUNS : lane === "stronger" ? VERIFIED_STRONG_RUNS : null;
  const expected = registry && run && typeof run === "object" ? registry.get(run) : null;
  if (!expected || expected.lane !== lane || expected.digest !== sha256(stableStringify(run))) return null;
  return expected;
}

function hasVerifiedStrongRunBrand(run) {
  return getVerifiedRunBrand(run, "stronger") !== null;
}

function hasVerifiedComparisonBrand(comparison) {
  return getVerifiedComparisonBrand(comparison) !== null;
}

function getVerifiedComparisonBrand(comparison) {
  const expected = comparison && typeof comparison === "object" ? VERIFIED_COMPARISONS.get(comparison) : null;
  if (!expected || expected.digest !== sha256(stableStringify(comparison))) return null;
  return expected;
}

export function verifySemanticReviewSourceBinding({ sessionManifestBytes, declaredAudioSha256, observedAudioSha256, binding } = {}) {
  if (!Buffer.isBuffer(sessionManifestBytes) && !(sessionManifestBytes instanceof Uint8Array)) {
    throw new Error("review source session manifest bytes are required");
  }
  const expectedManifestSha256 = requireSha256(binding?.session_manifest_sha256, "review source session_manifest_sha256");
  const expectedSourceSha256 = requireSha256(binding?.source_sha256, "review source source_sha256");
  if (sha256(sessionManifestBytes) !== expectedManifestSha256) {
    throw new Error("review source session manifest does not match verified ASR pair");
  }
  if (requireSha256(declaredAudioSha256, "review source declared audio SHA-256") !== expectedSourceSha256
    || requireSha256(observedAudioSha256, "review source observed audio SHA-256") !== expectedSourceSha256) {
    throw new Error("review source audio does not match verified ASR pair");
  }
  return true;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => String(left).localeCompare(String(right), "ko"));
}

function dedupeBy(values, keyFn) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const key = keyFn(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function countBy(values) {
  const result = {};
  for (const value of values) increment(result, value);
  return result;
}

function increment(target, key, amount = 1) {
  const normalized = String(key ?? "unknown");
  target[normalized] = (target[normalized] ?? 0) + amount;
}

function scanForbiddenKeys(value, trail, errors) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbiddenKeys(item, [...trail, String(index)], errors));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) errors.push(`forbidden secret-like key at ${[...trail, key].join(".")}`);
    if (["accepted_by", "accepted_at"].includes(key)) errors.push(`human acceptance field is forbidden at ${[...trail, key].join(".")}`);
    scanForbiddenKeys(child, [...trail, key], errors);
  }
}

async function assertInsideExisting(root, target, name) {
  const resolvedRoot = await fs.realpath(root);
  const resolvedTarget = await fs.realpath(target);
  if (!isInside(resolvedRoot, resolvedTarget)) throw new Error(`${name} must stay inside ${root}`);
}

async function assertInsideExistingOrFuture(root, target, name) {
  const logicalRoot = path.resolve(root);
  const logicalTarget = path.resolve(target);
  if (!isInside(logicalRoot, logicalTarget)) throw new Error(`${name} must stay inside ${root}`);
  const resolvedRoot = await fs.realpath(root);
  let existingAncestor = logicalTarget;
  while (!existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) throw new Error(`${name} has no existing ancestor inside ${root}`);
    existingAncestor = parent;
  }
  const resolvedAncestor = await fs.realpath(existingAncestor);
  if (!isInside(resolvedRoot, resolvedAncestor)) throw new Error(`${name} must stay inside ${root}`);
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function assertTemporaryRepoRoot(repoRoot) {
  if (repoRoot == null || !isInside(path.resolve(os.tmpdir()), path.resolve(repoRoot))) {
    throw new Error("untrusted semantic review fixture helper requires a temporary repo root");
  }
  let realTemporaryRoot;
  let realRepoRoot;
  try {
    [realTemporaryRoot, realRepoRoot] = await Promise.all([
      fs.realpath(path.resolve(os.tmpdir())),
      fs.realpath(path.resolve(repoRoot)),
    ]);
  } catch {
    throw new Error("untrusted semantic review fixture helper requires an existing temporary repo root");
  }
  if (!isInside(realTemporaryRoot, realRepoRoot)) {
    throw new Error("untrusted semantic review fixture helper rejects temporary-root link escape");
  }
}

async function findNamedFiles(root, name) {
  const found = [];
  async function visit(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      else if (entry.isFile() && entry.name === name) found.push(entryPath);
    }
  }
  await visit(root);
  return found;
}

async function readStableFile(filePath) {
  const before = await fs.stat(filePath);
  if (!before.isFile()) throw new Error(`expected a regular file: ${filePath}`);
  const bytes = await fs.readFile(filePath);
  const after = await fs.stat(filePath);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== after.size) {
    throw new Error(`file changed during stable read: ${filePath}`);
  }
  return bytes;
}

function classifyFailure(error) {
  const message = String(error?.message ?? error);
  if (/transcript\.jsonl is required/u.test(message)) return "transcript_missing";
  if (/session_manifest\.json is required/u.test(message)) return "manifest_missing";
  if (/invalid transcript JSONL/u.test(message)) return "transcript_invalid";
  if (/must stay inside/u.test(message)) return "path_boundary_rejected";
  return "analysis_failed";
}

function toPosix(value) {
  return String(value).split(path.sep).join("/");
}
