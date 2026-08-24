// Hermes Bot 관찰 UI 슬라이스 - 순수 뷰 모델 빌더(동결 계약).
// fetch/fs/clock 호출 없음. 모든 입력은 화이트리스트로 정규화하고,
// 미지원 필드와 hostile 입력은 값·키 자체를 반환하지 않고 hold 칩으로만 표현한다(fail-closed).

const ALLOWED_STATES = new Set(["working", "starting", "reviewing", "waiting", "idle", "done", "hold"]);

const STATE_ORDER = { working: 0, starting: 1, reviewing: 2, waiting: 3, idle: 4, done: 5, hold: 6 };

const STATE_LABELS = {
  working: "작업 중",
  starting: "시작 중",
  reviewing: "검토 중",
  waiting: "대기 중",
  idle: "유휴",
  done: "완료",
  hold: "보류(HOLD)",
};

const SESSION_ID_PATTERN = /^\d{8}_\d{6}_[0-9a-f]{6}$/;

// 구조적으로 렌더에 절대 허용하지 않는 raw 본문 계열 키.
const RAW_BODY_KEYS = new Set([
  "content",
  "reasoning",
  "transcript",
  "system_prompt",
  "promptText",
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeLabel(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 200 ? trimmed : null;
}

function safeUsage(record) {
  // undefined(필드 부재·명시적 undefined 모두)는 데이터가 없다는 확신(unavailable).
  if (record.directUsage === undefined) {
    return { kind: "unavailable" };
  }
  const usage = record.directUsage;
  if (usage === null || !isPlainObject(usage)) {
    return { kind: "unknown" };
  }
  const inputTokens = usage.inputTokens;
  const outputTokens = usage.outputTokens;
  const cacheReadTokens = usage.cacheReadTokens;
  const ok = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
  if (!ok(inputTokens) || !ok(outputTokens) || !ok(cacheReadTokens)) {
    return { kind: "unknown" };
  }
  return { kind: "exact", inputTokens, outputTokens, cacheReadTokens };
}

export function buildHermesBotPanelViewModel({ nowMs, bots } = {}) {
  if (!Array.isArray(bots)) {
    return { ok: false, hold: "INPUT_NOT_ARRAY" };
  }

  const safeNowMs = typeof nowMs === "number" && Number.isFinite(nowMs) && nowMs >= 0
    ? nowMs
    : null;

  const rows = bots.map((record) => normalizeHermesBotRecord(record, safeNowMs));

  rows.sort((a, b) => {
    const rankA = a.hold === "UNKNOWN_STATE_FOR_BOT_DISPLAY" ? 4 : STATE_ORDER[a.state] ?? 4;
    const rankB = b.hold === "UNKNOWN_STATE_FOR_BOT_DISPLAY" ? 4 : STATE_ORDER[b.state] ?? 4;
    return rankA - rankB;
  });

  return { ok: true, generatedAtMs: safeNowMs, rows };
}

function normalizeHermesBotRecord(record, nowMs) {
  if (!isPlainObject(record)) {
    return {
      botName: "이름 없음",
      state: "hold",
      stateLabel: null,
      goalLabel: null,
      stageLabel: null,
      model: null,
      provider: null,
      open: { supported: false, reason: "OPEN_PATH_UNAVAILABLE" },
      usage: { kind: "unknown" },
      heartbeat: { kind: "unknown", ageSeconds: null },
      result: { status: "unknown" },
      hold: "RAW_OR_UNKNOWN_FIELD_FORBIDDEN",
    };
  }

  // 화이트리스트 외 키 또는 raw 본문 계열 키는 값을 절대 반환하지 않고 보류 사유만 남긴다.
  let rawSuppressed = false;
  for (const key of Object.keys(record)) {
    if (RAW_BODY_KEYS.has(key)) rawSuppressed = true;
  }

  const stateKnown = ALLOWED_STATES.has(record.state);
  const state = stateKnown ? record.state : "hold";

  const sessionId = typeof record.openTargetSessionId === "string"
    && SESSION_ID_PATTERN.test(record.openTargetSessionId)
    ? record.openTargetSessionId
    : null;

  let holdReason = null;
  if (rawSuppressed) holdReason = "RAW_OR_UNKNOWN_FIELD_FORBIDDEN";
  else if (!stateKnown) holdReason = "UNKNOWN_STATE_FOR_BOT_DISPLAY";

  return {
    botName: safeLabel(record.botName) ?? "이름 없음",
    state,
    stateLabel: stateKnown ? STATE_LABELS[state] : null,
    goalLabel: safeLabel(record.goalLabel),
    stageLabel: safeLabel(record.stageLabel),
    model: safeLabel(record.model),
    provider: safeLabel(record.provider),
    open: sessionId
      ? { supported: true, url: `hermes://open/${sessionId}` }
      : { supported: false, reason: "OPEN_PATH_UNAVAILABLE" },
    usage: safeUsage(record),
    heartbeat: buildHeartbeat(record.lastHeartbeatAtMs, nowMs),
    result: { status: typeof record.resultStatus === "string" && record.resultStatus.trim().length > 0
      ? record.resultStatus.trim()
      : "unknown" },
    hold: holdReason,
  };
}

function buildHeartbeat(lastHeartbeatAtMs, nowMs) {
  if (
    typeof lastHeartbeatAtMs !== "number"
    || !Number.isFinite(lastHeartbeatAtMs)
    || typeof nowMs !== "number"
  ) {
    return { kind: "unknown", ageSeconds: null };
  }
  const ageSeconds = Math.max(0, Math.round((nowMs - lastHeartbeatAtMs) / 1000));
  // fresh: 5분 이내 신호. stale: 그 이상 경과.
  return ageSeconds <= 300
    ? { kind: "fresh", ageSeconds }
    : { kind: "stale", ageSeconds };
}
